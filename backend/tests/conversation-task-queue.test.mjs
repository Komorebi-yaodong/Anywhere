import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'

const source = await fs.readFile(process.argv[2] || new URL('../../Anywhere_window/src/App.vue', import.meta.url), 'utf8')
const plugin = !source.includes('const activeLocalExecution =')
const between = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length)
  assert.ok(a >= 0 && b > a, start)
  return source.slice(a, b)
}
const normalize = between('const normalizePendingInputBuffer =', '  .filter(Boolean);') + '  .filter(Boolean);'
const drain = between('const drainBufferIntoHistory =', plugin ? 'const resolveProviderByModelValue =' : 'const isAbortError =')
const task = between('const conversationTaskReady =', 'const getSessionDataAsObject =')
const ref = value => ({value})
const copy = value => JSON.parse(JSON.stringify(value))
const tick = async () => {for (let i = 0; i < 30; i++) await Promise.resolve()}
function deferred() {let resolve; const promise = new Promise(r => {resolve = r}); return {promise, resolve}}
function harness() {
  const receipts = [], saves = [], runs = [], errors = [], wakes = [], watched = []
  const controls = {failSave: false, failStart: false, waitRun: null, waitSave: null, veto: false}
  const c = {
    ref, Date, setTimeout, console, JSON, Set,
    fullHistory: ref([{role: 'user', content: 'original'}]), chat_show: ref([{role: 'user', content: 'original'}]),
    pendingAppendBuffer: ref([]), currentTaskConfig: ref(null),
    currentConversationStorage: ref({conversationId: 'target'}),
    prompt: ref('unsent draft'), fileList: ref(['draft attachment']),
    loading: ref(false), compacting: ref(false), isPreparingSend: ref(false), isMcpLoading: ref(false), isClosingWindow: ref(false),
    desktopTakeoverPending: ref(false), controlTransferPending: ref(false), mobileControlActive: ref(false),
    activeRemoteCommand: ref(null), activeLocalExecution: ref(null), activeAssistantTurnMeta: null, remoteCommandExecutionPromise: null,
    sessionMutationVersion: 0, scheduledTaskQueueSaving: 0, isFlushingAppendBuffer: false,
    ensureConversationWriteAccess: () => true,
    nextTick: fn => {if (fn) wakes.push(fn); return Promise.resolve()},
    watch: (refs, callback) => watched.push({refs, callback}),
    executeAutoSaveRequest: async request => {
      if (controls.waitSave) await controls.waitSave.promise
      saves.push({request, queue: copy(c.pendingAppendBuffer.value), history: copy(c.fullHistory.value)})
      return !(controls.failSave || controls.failStart && request.reason === 'scheduled-task-started')
    },
    scheduleAutoSave: () => {}, scheduleInputDraftAutoSave: () => {}, syncAutoCloseOnBlurListener: () => {},
    showDismissibleMessage: {error: value => errors.push(value)},
    appendLinkedUserMessage: ({historyContent, historyExtras = {}, uiExtras = {}}) => {
      c.fullHistory.value.push({role: 'user', content: historyContent, ...historyExtras})
      c.chat_show.value.push({role: 'user', content: historyContent, ...uiExtras})
    },
    appendCurrentInputToHistory: async () => {c.fullHistory.value.push({role: 'user', content: c.prompt.value}); c.prompt.value = ''; c.fileList.value = []; return true},
    handleAppendMessageEvent: async () => {},
    window: {api: {reportConversationTask: async receipt => {receipts.push(receipt)}}}
  }
  c.askAI = async (force, ...args) => {
    assert.equal(force, true)
    if (controls.veto) return
    if (!plugin) assert.equal(args[1], true, 'scheduled turn bypasses local-controller UI gate without takeover')
    c.loading.value = true
    const admit = args.find(value => typeof value === 'function')
    if (admit && await admit() === false) {c.loading.value = false; return}
    runs.push({config: copy(c.currentTaskConfig.value), history: copy(c.fullHistory.value)})
    if (controls.waitRun) await controls.waitRun.promise
    c.currentTaskConfig.value = null; c.loading.value = false
  }
  const context = vm.createContext(c)
  const api = vm.runInContext(`${normalize}\n${drain}\n${task}\nconversationTaskReady.value = true; ({handleConversationTask, flushAppendBuffer, drainBufferIntoHistory, normalizePendingInputBuffer})`, context)
  const input = (requestId, id = requestId) => ({requestId, conversationId: 'target', expiresAt: Date.now()+10000, taskConfig: {id, name: id, autoClose: true}, payload: `instruction ${id}`})
  return {c, api, receipts, saves, runs, errors, wakes, watched, controls, input}
}

// Empty/remote-controlled, busy, transfer and overlapping task cases all admit durably.
for (const state of ['idle', 'mobile', 'loading', 'compacting', 'preparing', 'mcp', 'transfer', 'other-task']) {
  const h = harness(), {c, api} = h
  if (state === 'mobile') c.mobileControlActive.value = true
  if (state === 'loading') c.loading.value = true
  if (state === 'compacting') c.compacting.value = true
  if (state === 'preparing') c.isPreparingSend.value = true
  if (state === 'mcp') c.isMcpLoading.value = true
  if (state === 'transfer') {c.controlTransferPending.value = true; c.isPreparingSend.value = plugin}
  if (state === 'other-task') c.currentTaskConfig.value = {id: 'running'}
  await api.handleConversationTask(h.input('one'))
  assert.equal(h.receipts[0].ok, true, state); assert.equal(h.receipts[0].reason, 'task_queued')
  assert.equal(h.saves[0].queue.length, 1); assert.equal(h.runs.length, 0)
  assert.equal(c.fullHistory.value.length, 1); assert.equal(c.prompt.value, 'unsent draft')
  if (!['idle', 'mobile'].includes(state)) {await api.flushAppendBuffer(); assert.equal(h.runs.length, 0, state)}
  c.loading.value = c.compacting.value = c.isPreparingSend.value = c.isMcpLoading.value = c.controlTransferPending.value = false
  c.currentTaskConfig.value = null
  await api.flushAppendBuffer()
  assert.equal(h.runs.length, 1, state); assert.equal(h.runs[0].config.id, 'one')
  assert.equal(c.pendingAppendBuffer.value.length, 0)
  assert.equal(c.mobileControlActive.value, state === 'mobile')
  assert.equal(c.prompt.value, 'unsent draft'); assert.equal(c.fileList.value[0], 'draft attachment')
}

const h = harness()
await h.api.handleConversationTask(h.input('a'))
await h.api.handleConversationTask(h.input('a'))
await h.api.handleConversationTask(h.input('b'))
assert.equal(h.c.pendingAppendBuffer.value.length, 2, 'same request is not inserted twice')
const roundTrip = h.api.normalizePendingInputBuffer(copy(h.c.pendingAppendBuffer.value))
assert.equal(roundTrip[1].taskConfig.id, 'b'); assert.equal(roundTrip[0].requestId, 'a')
h.c.pendingAppendBuffer.value = roundTrip
h.c.loading.value = true; const owner = {controller: {signal: {aborted: false}}}; h.c.activeAssistantTurnMeta = owner
assert.equal(await h.api.drainBufferIntoHistory({toolBoundaryTurn: owner}), false, 'tasks never merge at a tool boundary')
assert.equal(h.c.pendingAppendBuffer.value.length, 2)
h.c.loading.value = false; h.c.activeAssistantTurnMeta = null
await h.api.flushAppendBuffer(); await h.api.flushAppendBuffer()
assert.deepEqual(h.runs.map(run => run.config.id), ['a', 'b'])
assert.equal(h.runs[0].history.some(m => m.content?.includes('instruction b')), false)

const fifo = harness()
fifo.c.pendingAppendBuffer.value.push({kind: 'input', text: 'earlier input', files: []})
await fifo.api.handleConversationTask(fifo.input('task'))
fifo.c.pendingAppendBuffer.value.push({kind: 'input', text: 'later input', files: []})
await fifo.api.flushAppendBuffer(); assert.equal(fifo.runs[0].config, null)
await fifo.api.flushAppendBuffer(); assert.equal(fifo.runs[1].config.id, 'task')
assert.equal(fifo.runs[1].history.some(m => m.content === 'later input'), false)
await fifo.api.flushAppendBuffer(); assert.equal(fifo.runs.length, 3)

const concurrent = harness(); concurrent.controls.waitSave = deferred()
const first = concurrent.api.handleConversationTask(concurrent.input('first'))
await tick(); await concurrent.api.flushAppendBuffer()
assert.equal(concurrent.runs.length, 0, 'unpersisted admissions must never drain')
concurrent.controls.waitSave.resolve(); await first
assert.equal(concurrent.receipts[0].ok, true)
concurrent.controls.waitSave = null; concurrent.controls.waitRun = deferred()
const running = concurrent.api.flushAppendBuffer(); await tick()
await concurrent.api.handleConversationTask(concurrent.input('next'))
assert.equal(concurrent.c.currentTaskConfig.value.id, 'first')
assert.equal(concurrent.c.pendingAppendBuffer.value[0].taskConfig.id, 'next')
concurrent.controls.waitRun.resolve(); await running; concurrent.controls.waitRun = null
await concurrent.api.flushAppendBuffer(); assert.equal(concurrent.runs.length, 2)

const fail = harness(); fail.controls.failSave = true
await fail.api.handleConversationTask(fail.input('bad'))
assert.equal(fail.receipts[0].ok, false); assert.equal(fail.c.pendingAppendBuffer.value.length, 0)
assert.equal(fail.c.fullHistory.value.length, 1)
fail.controls.failSave = false
await fail.api.handleConversationTask(fail.input('retain')); fail.controls.failStart = true
await fail.api.flushAppendBuffer()
assert.equal(fail.runs.length, 0); assert.equal(fail.c.pendingAppendBuffer.value.length, 1)
assert.equal(fail.c.fullHistory.value.length, 1); assert.equal(fail.c.currentTaskConfig.value, null)
fail.controls.failStart = false; await fail.api.flushAppendBuffer(); assert.equal(fail.runs.length, 1)

const invalid = harness()
await invalid.api.handleConversationTask({...invalid.input('expired'), expiresAt: Date.now()-1})
await invalid.api.handleConversationTask({...invalid.input('foreign'), conversationId: 'foreign'})
invalid.c.isClosingWindow.value = true; await invalid.api.handleConversationTask(invalid.input('closing'))
assert.ok(invalid.receipts.every(r => r.ok === false)); assert.equal(invalid.saves.length, 0)

if (!plugin) {
  const a = source.indexOf('  loading.value = true;', source.indexOf('const askAI ='))
  const b = source.indexOf('  const autoApproveThisTurn =', a)
  const admission = source.slice(a, b)
  let reserved = true, admits = 0, events = []
  const c = {loading: ref(false), activeLocalExecution: ref(null), mobileControlActive: ref(true),
    activeRemoteCommand: ref(null), currentConversationStorage: ref({conversationId: 'target'}),
    crypto: {randomUUID: () => '00000000-0000-0000-0000-000000000000'}, syncAutoCloseOnBlurListener() {},
    emitRemoteRendererEventAndWait: async (event) => {events.push(event); return {ok: reserved, error: reserved ? undefined : 'remote_conversation_busy'}},
    onStarted: async () => {admits++; return true}}
  const preflight = vm.runInNewContext(`async () => {let remoteCommand=null, admittedBuffer=true; ${admission}; return true}`, c)
  assert.equal(await preflight(), true); assert.equal(admits, 1); assert.equal(events[0], 'conversation.execution.started')
  c.activeLocalExecution.value = null; c.loading.value = false; reserved = false
  assert.equal(await preflight(), undefined); assert.equal(admits, 1, 'busy Remote executor cannot consume the durable queue')
  assert.equal(c.activeLocalExecution.value, null); assert.equal(c.loading.value, false)
}

// Evaluate the actual auto-close condition with queue/save/control variations.
const closeIf = source.match(/if \((currentTaskConfig\.value\.autoClose[^\n]+)\) \{\s*window\.api\.windowControl\('close-window'\)/)
assert.ok(closeIf)
const canClose = c => vm.runInNewContext(closeIf[1], c)
const closeContext = {currentTaskConfig: ref({autoClose: true}), pendingAppendBuffer: ref([{}]), scheduledTaskQueueSaving: 0, mobileControlActive: ref(false), controlTransferPending: ref(false)}
assert.equal(canClose(closeContext), false)
closeContext.pendingAppendBuffer.value = []; closeContext.scheduledTaskQueueSaving = 1; assert.equal(canClose(closeContext), false)
closeContext.scheduledTaskQueueSaving = 0
if (!plugin) {closeContext.mobileControlActive.value = true; assert.equal(canClose(closeContext), false); closeContext.mobileControlActive.value = false}
assert.equal(canClose(closeContext), true)
console.log(`PASS ${plugin ? 'uTools' : 'Desktop'} actual renderer durable admission/remote control/transfer/FIFO/independent tasks/dedup/restart/busy states/save failures/drafts/auto-close`)
