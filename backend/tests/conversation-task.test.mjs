import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import {createRequire} from 'node:module'
const {createConversationTaskDelivery} = createRequire(import.meta.url)('../src/conversationTaskDelivery.js')


let sent
const delivery = createConversationTaskDelivery({timeoutMs: 30, send: async (windowId, input) => {sent = {windowId, input}; return {ok: true}}})
const pending = delivery.deliver('window-a', {conversationId: 'conversation-a'})
assert.equal(delivery.complete('other-window', {...sent.input, ok: true}).ok, false)
assert.equal(delivery.complete('window-a', {...sent.input, conversationId: 'other', ok: true}).ok, false)
assert.equal(delivery.complete('window-a', {...sent.input, ok: true}).ok, true)
assert.equal((await pending).ok, true)
assert.equal(delivery.complete('window-a', {...sent.input, ok: true}).ok, false)
assert.equal((await delivery.deliver('window-a', {conversationId: 'conversation-a'})).reason, 'task_receipt_timeout')

const files = process.argv.slice(2).length ? process.argv.slice(2) : [new URL('../../Anywhere_window/src/App.vue', import.meta.url)]
for (const file of files) {
  const source = await fs.readFile(file, 'utf8')
  const start = source.indexOf('const conversationTaskReady =')
  const block = source.slice(start, source.indexOf('const getSessionDataAsObject =', start))
  const ref = value => ({value})
  const history = [{role: 'user', content: 'existing history'}], receipts = []
  const c = {ref, Date, setTimeout, currentConversationStorage: ref({conversationId: 'conversation-a'}),
    isClosingWindow: ref(false), loading: ref(false), compacting: ref(false), isPreparingSend: ref(false), isMcpLoading: ref(false),
    activeAssistantTurnMeta: null, activeApplyMcpPromise: null, currentTaskConfig: ref(null),
    ensureLocalConversationWriteAccess: () => true, ensureConversationWriteAccess: () => true,
    prompt: ref('draft preserved'), fileList: ref(['draft attachment']),
    appendLinkedUserMessage: input => history.push({role: 'user', content: input.historyContent}),
    askAI: async (force, ...args) => {assert.equal(force, true); const started = args.find(value => typeof value === 'function'); if (started) await started()}, window: {api: {reportConversationTask: async input => receipts.push(input)}}}
  const handle = vm.runInNewContext(`${block}; conversationTaskReady.value = true; handleConversationTask`, c)
  const input = {conversationId: 'conversation-a', requestId: 'task-one', expiresAt: Date.now()+10000, payload: 'task instruction', taskConfig: {id: 'task', name: 'fixture'}}
  await handle(input)
  assert.equal(receipts.at(-1).ok, true)
  assert.equal(history.length, 2)
  assert.match(history[1].content, /task instruction/)
  assert.equal(c.prompt.value, 'draft preserved')
  assert.equal(c.fileList.value[0], 'draft attachment')
  c.loading.value = true
  await handle({...input, requestId: 'task-two'})
  assert.equal(receipts.at(-1).ok, false)
  assert.equal(history.length, 2)
}
console.log('PASS conversation task receipts/window binding/expiry/exclusive target/storage gate/actual renderer preserving draft and history')
