import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import {createConversationDeleteRecovery} from '../src/utils/conversationDeleteRecovery.js'
import {resolveSafeConversationMutationTarget} from '../src/utils/conversationMessageTarget.js'
const tick = () => new Promise(resolve => setImmediate(resolve))
const clone = value => structuredClone(value)
export async function verifyDeleteRecovery({factory = createConversationDeleteRecovery, resolver = resolveSafeConversationMutationTarget, sourcePath = new URL('../src/App.vue', import.meta.url), plugin = true} = {}) {
  const source = (await fs.readFile(sourcePath, 'utf8')).replace(/\r\n/g, '\n')
  const begin = source.indexOf('const conversationDeleteRecovery =')
  const end = source.indexOf('const clearHistory =', begin)
  const block = source.slice(begin, end)
  const old = {role: 'assistant', storageId: 'old', storageOrdinal: 1, content: null, tool_calls: [{id: 'call-old', type: 'function', function: {name: 'synthetic', arguments: '{}'}}]}
  const result = {role: 'tool', storageId: 'result', storageOrdinal: 2, tool_call_id: 'call-old', content: 'synthetic result'}
  const user = {role: 'user', storageId: 'tail', storageOrdinal: 3, content: 'latest persisted'}
  const dirty = {role: 'user', storageId: 'unsaved', content: 'new unsaved content'}
  const oldUi = {role: 'assistant', id: 1, uiStorageId: 'old-ui', content: [], tool_calls: [{id: 'call-old', name: 'synthetic', result: 'synthetic result'}]}
  function fixture(mode = '') {
    let release
    const gate = new Promise(resolve => {release = resolve})
    let reads = 0, saves = 0
    const c = {
      Set, Promise, console, createConversationDeleteRecovery: factory, resolveSafeConversationMutationTarget: resolver,
      currentConversationStorage: {value: {conversationId: 'fixture', dirPath: 'synthetic', revision: 7, isPaged: true, loadedFromOrdinal: 3}},
      fullHistory: {value: clone([user, dirty])}, chat_show: {value: clone([oldUi, {...user, id: 2, uiStorageId: 'tail-ui'}, {...dirty, id: 3}])},
      conversationLease: {value: {leaseEpoch: 1}}, sessionMutationVersion: 4,
      loading: {value: false}, compacting: {value: false}, isPreparingSend: {value: false}, isClosingWindow: {value: false}, activeRemoteCommand: {value: null},
      collapsedMessages: {value: new Set()}, focusedMessageIndex: {value: null}, prompt: {value: 'draft must remain'},
      ensureConversationWriteAccess: () => !c.lost, ensureLocalConversationWriteAccess: () => !c.lost,
      isToolMediaMessage: () => false, markOutermostCanRestore() {}, syncHistoryFromFullHistory() {},
      showDismissibleMessage: {warning: message => c.notices.push(message), info() {}}, notices: [],
      scheduleAutoSave: () => {saves++},
      window: {api: {openConversation: async () => {reads++; await gate; return {descriptor: {revision: mode === 'revision' ? 8 : 7}, sessionData: {fullHistory: clone([old, result, user])}}}}}
    }
    vm.runInNewContext(block + '\nglobalThis.remove = deleteMessage; globalThis.recovery = conversationDeleteRecovery;', c)
    return {c, release, reads: () => reads, saves: () => saves}
  }
  const f = fixture()
  const pending = f.c.remove(0)
  const duplicate = f.c.remove(0)
  assert.equal(pending, duplicate, 'single-flight prevents duplicate delete recovery')
  await tick(); assert.equal(f.reads(), 1)
  f.release(); assert.equal(await pending, true)
  assert.equal(f.saves(), 1)
  assert.deepEqual(f.c.fullHistory.value.map(message => message.storageId), ['tail', 'unsaved'])
  assert.equal(f.c.prompt.value, 'draft must remain')
  assert.equal(f.c.chat_show.value.length, 2)
  assert.equal(f.c.currentConversationStorage.value.loadedFromOrdinal, 1)
  for (const mode of ['revision', 'closing', 'lost', 'edit', 'new-mutation', 'target-removed', 'shifted-ui', 'extra-history']) {
    const g = fixture(mode)
    const request = g.c.remove(0)
    await tick()
    if (mode === 'closing') g.c.isClosingWindow.value = true
    if (mode === 'lost') g.c.lost = true
    if (mode === 'edit') g.c.chat_show.value[0].content = [{type: 'text', text: 'edited while reading'}]
    if (mode === 'new-mutation') g.c.sessionMutationVersion++
    if (mode === 'target-removed') g.c.chat_show.value.shift()
    if (mode === 'shifted-ui') g.c.chat_show.value.unshift({role: 'user', id: 99, content: 'arrived'})
    if (mode === 'extra-history') g.c.fullHistory.value.push({role: 'user', storageId: 'unexpected', content: 'arrived'})
    g.release(); assert.equal(await request, false)
    assert.equal(g.saves(), 0)
    assert.equal(g.c.fullHistory.value.some(message => message.storageId === 'unsaved'), true)
  }
  // An already locally deleted in-window row cannot be resurrected from DB by recovery.
  const g = fixture()
  g.c.currentConversationStorage.value.loadedFromOrdinal = 1
  g.release(); assert.equal(await g.c.remove(0), false)
  assert.equal(g.c.fullHistory.value.length, 2)
  console.log(JSON.stringify({ok: true, suite: 'conversation-delete-recovery', plugin, singleFlight: true, dirtyPreserved: true, guards: 9}))
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) await verifyDeleteRecovery()
