import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { computed, effectScope, nextTick, ref, watch } from 'vue'

const isPlugin = true
const source = await fs.readFile(new URL(isPlugin ? '../src/App.vue' : '../render/window/App.vue', import.meta.url), 'utf8')
const backend = await fs.readFile(new URL(isPlugin ? '../../backend/src/mcp_builtin.js' : '../main/core/mcp_builtin.js', import.meta.url), 'utf8')
function between(text, start, end) {
  const offset = text.indexOf(start)
  assert.notEqual(offset, -1, start)
  const limit = text.indexOf(end, offset + start.length)
  assert.notEqual(limit, -1, end)
  return text.slice(offset, limit)
}
const normalizer = between(source, 'const normalizePendingInputBuffer =', '  .filter(Boolean);') + '  .filter(Boolean);'
const sender = between(source, 'const buildAgentToolContentList =', isPlugin ? 'const sendFile =' : 'const isApplyMcpRunning =')
const drain = between(source, 'const drainBufferIntoHistory =', isPlugin ? 'const resolveProviderByModelValue =' : 'const isAbortError =')
const handler = between(backend, '    continue_agent_chats: async', '    close_agent_window: async')
// Exercise the actual MCP boundary with string and Error rejections, without Electron.
let targetError = 'synthetic busy error'
const backendContext = vm.createContext({
  getWindowByRef: () => target,
  require: () => ({ windowMap: new Map([['target', target]]) }),
  isChildWindow: () => false,
  setTimeout,
  target: null
})
const target = {
  isDestroyed: () => false,
  webContents: { executeJavaScript: async (code) => {
    if (code.startsWith('Boolean(')) return true
    throw targetError
  } }
}
const boundary = vm.runInContext(`({${handler}}).continue_agent_chats`, backendContext)
assert.equal(await boundary({ window_id: 'target', text: 'synthetic' }, {}), 'Error sending message: synthetic busy error')
targetError = new Error('synthetic failure')
assert.equal(await boundary({ window_id: 'target', text: 'synthetic' }, {}), 'Error sending message: synthetic failure')
targetError = {}
assert.match(await boundary({ window_id: 'target', text: 'synthetic' }, {}), /Unable to deliver/)


assert.match(source, /isBusy: \(\) => isAgentMessageBusy\(\)/)
if (isPlugin) {
  const preload = await fs.readFile(new URL('../../backend/src/window_preload.js', import.meta.url), 'utf8')
  assert.match(preload, /handleFilePath,\s+sendfileDirect,[\s\S]*?require\('\.\/file\.js'\)/)
  assert.match(preload, /window\.api = \{[\s\S]*?handleFilePath,\s+sendfileDirect,/)
}


const queued = 'The other agent is currently responding. Your message has been queued and will be viewed after it finishes its current response.'
const sent = 'Message sent successfully. The other agent is now responding to your message.'
const tick = async () => { for (let i = 0; i < 12; i++) await nextTick() }
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function harness() {
  const scope = effectScope()
  const errors = [], history = [], saves = [], requests = []
  const controls = { write: true, prepare: async () => [] }
  const context = vm.createContext({
    computed, ref, watch, nextTick,
    loading: ref(false), isPreparingSend: ref(false), compacting: ref(false), isMcpLoading: ref(false),
    isClosingWindow: ref(false), pendingAppendBuffer: ref([]), prompt: ref('unsent draft'),
    fileList: ref([{ name: 'draft.txt', url: 'synthetic draft' }]),
    ensureConversationWriteAccess: () => controls.write,
    scheduleAutoSave: (options) => saves.push(options.reason),
    scheduleInputDraftAutoSave: () => {},
    appendLinkedUserMessage: (message) => history.push(message),
    showDismissibleMessage: { error: (message) => errors.push(message) },
    window: { api: { sendfileDirect: (...args) => controls.prepare(...args) } },
    console,
    startRequest: () => { const request = deferred(); requests.push(request); return request.promise },
    appendCurrentInputToHistory: async () => false,
    handleAppendMessageEvent: async () => {}
  })
  const state = scope.run(() => vm.runInContext(`
    let activeAssistantTurnMeta = null;
    let isFlushingAppendBuffer = false;
    const askAI = async (forceSend) => {
      if (isClosingWindow.value || !ensureConversationWriteAccess(false)) return;
      if (loading.value || isPreparingSend.value || compacting.value || isMcpLoading.value) return;
      if (!forceSend) throw new Error('Agent delivery must not consume the draft');
      loading.value = true;
      activeAssistantTurnMeta = {};
      await startRequest();
      activeAssistantTurnMeta = null;
      loading.value = false;
      await flushAppendBuffer();
    };
    ${normalizer}
    ${sender}
    ${drain}
    ;({ sendAgentToolMessage, flushAppendBuffer, normalizePendingInputBuffer,
      loading, compacting, isPreparingSend, isMcpLoading, isClosingWindow,
      pendingAppendBuffer, prompt, fileList,
      setActive: (value) => { activeAssistantTurnMeta = value },
      isFlushing: () => isFlushingAppendBuffer })
  `, context))
  return { ...state, scope, errors, history, requests, saves, controls }
}
async function run(name, body) {
  const h = harness()
  try { await body(h); console.log(`PASS ${name}`) } finally { h.scope.stop() }
}

await run('idle delivery is explicit and preserves draft', async (h) => {
  assert.equal(await h.sendAgentToolMessage({ text: 'first' }), sent)
  assert.equal(h.requests.length, 1)
  assert.equal(h.history[0].historyContent, 'first')
  assert.equal(h.prompt.value, 'unsent draft')
  assert.equal(h.fileList.value[0].name, 'draft.txt')
  assert.equal(await h.sendAgentToolMessage({ text: 'second' }), queued)
  assert.equal(h.pendingAppendBuffer.value.length, 1)
  assert.equal(h.history.length, 1, 'busy delivery must not mutate active history')
  h.requests[0].resolve()
  await tick()
  assert.equal(h.requests.length, 2)
  assert.equal(h.history[1].historyContent, 'second')
  assert.equal(h.pendingAppendBuffer.value.length, 0)
  h.requests[1].resolve()
  await tick()
})

await run('messages arriving during successive buffered turns continue without a stuck lock', async (h) => {
  await h.sendAgentToolMessage({ text: 'one' })
  await h.sendAgentToolMessage({ text: 'two' })
  h.requests[0].resolve()
  await tick()
  assert.equal(h.requests.length, 2)
  assert.equal(await h.sendAgentToolMessage({ text: 'three' }), queued)
  h.requests[1].resolve()
  await tick()
  assert.equal(h.requests.length, 3)
  assert.deepEqual(h.history.map((message) => message.historyContent), ['one', 'two', 'three'])
  h.requests[2].resolve()
  await tick()
  assert.equal(h.isFlushing(), false)
})

await run('attachment preparation reserves idle slot; later messages keep FIFO order', async (h) => {
  const prepare = deferred()
  h.controls.prepare = () => prepare.promise
  const first = h.sendAgentToolMessage({ text: 'with file', filePaths: ['synthetic.txt'] })
  assert.equal(h.isPreparingSend.value, true)
  assert.equal(await h.sendAgentToolMessage({ text: 'later' }), queued)
  assert.equal(h.requests.length, 0)
  h.prompt.value = 'edited while file was parsing'
  prepare.resolve([{ type: 'text', text: 'synthetic file content' }])
  assert.equal(await first, sent)
  assert.equal(h.history.length, 1)
  assert.equal(h.prompt.value, 'edited while file was parsing')
  h.requests[0].resolve()
  await tick()
  assert.equal(h.history[1].historyContent, 'later')
  h.requests[1].resolve()
  await tick()
})

await run('busy attachments return immediately and drafts edited during drain survive', async (h) => {
  h.loading.value = true
  const prepare = deferred()
  h.controls.prepare = () => prepare.promise
  assert.equal(await h.sendAgentToolMessage({ text: 'file', filePaths: ['synthetic.txt'] }), queued)
  assert.equal(h.isPreparingSend.value, false)
  const restored = h.normalizePendingInputBuffer(JSON.parse(JSON.stringify(h.pendingAppendBuffer.value)))
  assert.equal(restored[0].kind, 'agent')
  assert.equal(restored[0].filePaths[0], 'synthetic.txt')
  h.loading.value = false
  const flushing = h.flushAppendBuffer()
  await tick()
  h.prompt.value = 'new draft typed during drain'
  prepare.resolve([{ type: 'text', text: 'file contents' }])
  await tick()
  assert.equal(h.requests.length, 1)
  assert.equal(h.prompt.value, 'new draft typed during drain')
  h.requests[0].resolve()
  await flushing
})

await run('state changes during attachment await are rechecked', async (h) => {
  const prepare = deferred()
  h.controls.prepare = () => prepare.promise
  const sending = h.sendAgentToolMessage({ text: 'earlier', filePaths: ['synthetic.txt'] })
  await h.sendAgentToolMessage({ text: 'later' })
  h.compacting.value = true
  prepare.resolve([{ type: 'text', text: 'file' }])
  assert.equal(await sending, queued)
  assert.equal(h.pendingAppendBuffer.value[0].text, 'earlier')
  assert.equal(h.history.length, 0)
  h.controls.prepare = async () => [{ type: 'text', text: 'file' }]
  h.compacting.value = false
  await tick()
  assert.equal(h.history.length, 2)
  assert.equal(h.requests.length, 1)
  h.requests[0].resolve()
  await tick()
})

await run('invalid/closed/read-only targets reject explicitly; no false success', async (h) => {
  await assert.rejects(h.sendAgentToolMessage({ text: '' }), /No text or valid attachments/)
  h.controls.write = false
  await assert.rejects(h.sendAgentToolMessage({ text: 'blocked' }), /read-only/)
  h.controls.write = true
  h.isClosingWindow.value = true
  await assert.rejects(h.sendAgentToolMessage({ text: 'blocked' }), /closing/)
  assert.equal(h.history.length, 0)
  assert.equal(h.pendingAppendBuffer.value.length, 0)
})

await run('state change while draining an attachment retains it until compaction finishes', async (h) => {
  h.loading.value = true
  await h.sendAgentToolMessage({ text: 'queued file', filePaths: ['synthetic.txt'] })
  h.loading.value = false
  const prepare = deferred()
  h.controls.prepare = () => prepare.promise
  const flushing = h.flushAppendBuffer()
  await tick()
  assert.equal(h.isPreparingSend.value, true)
  h.compacting.value = true
  prepare.resolve([{ type: 'text', text: 'file' }])
  await flushing
  assert.equal(h.history.length, 0)
  assert.equal(h.pendingAppendBuffer.value.length, 1)
  h.controls.prepare = async () => [{ type: 'text', text: 'file' }]
  h.compacting.value = false
  await tick()
  assert.equal(h.requests.length, 1)
  h.requests[0].resolve()
  await tick()
})


await run('close or lease loss during attachment parsing cannot append or start a turn', async (h) => {
  const prepare = deferred()
  h.controls.prepare = () => prepare.promise
  const sending = h.sendAgentToolMessage({ text: 'closing race', filePaths: ['synthetic.txt'] })
  h.isClosingWindow.value = true
  prepare.resolve([{ type: 'text', text: 'file' }])
  await assert.rejects(sending, /closing/)
  assert.equal(h.history.length, 0)
  assert.equal(h.requests.length, 0)
  assert.equal(h.isPreparingSend.value, false)
})


await run('failed attachment stays queued without retry spin or lost later messages', async (h) => {
  h.loading.value = true
  await h.sendAgentToolMessage({ filePaths: ['missing.txt'] })
  await h.sendAgentToolMessage({ text: 'later' })
  h.loading.value = false
  await h.flushAppendBuffer()
  await tick()
  assert.equal(h.pendingAppendBuffer.value.length, 2)
  assert.equal(h.requests.length, 0)
  assert.equal(h.errors.length, 1)
  assert.equal(h.prompt.value, 'unsent draft')
})


for (const flag of ['isPreparingSend', 'compacting', 'isMcpLoading']) {
  await run(`${flag} without loading queues and resumes on release`, async (h) => {
    h[flag].value = true
    assert.equal(await h.sendAgentToolMessage({ text: flag }), queued)
    await tick()
    assert.equal(h.requests.length, 0)
    assert.equal(h.history.length, 0)
    h[flag].value = false
    await tick()
    assert.equal(h.requests.length, 1)
    assert.equal(h.history[0].historyContent, flag)
    h.requests[0].resolve()
    await tick()
  })
}

await run('tool-round/finalizer ownership blocks early draining', async (h) => {
  h.loading.value = true
  h.setActive({})
  assert.equal(await h.sendAgentToolMessage({ text: 'wait for full turn' }), queued)
  h.isMcpLoading.value = true
  h.isMcpLoading.value = false
  h.loading.value = false
  await h.flushAppendBuffer()
  assert.equal(h.requests.length, 0)
  h.setActive(null)
  const flushing = h.flushAppendBuffer()
  await tick()
  assert.equal(h.requests.length, 1)
  h.requests[0].resolve()
  await flushing
})
