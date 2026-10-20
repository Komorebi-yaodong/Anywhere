const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const sourcePath = require('node:path').join(__dirname, '../../Anywhere_window/src/App.vue')

const source = fs.readFileSync(sourcePath, 'utf8')
const begin = source.indexOf('const runConversationCompact = async (')
const end = source.indexOf('const maybeAutoCompactBeforeNextRequest', begin)
assert.ok(begin >= 0 && end > begin)
const code = source.slice(begin, end)
async function scenario({ saved = true, reloadFails = false, hydrated = false } = {}) {
  const events = []
  const data = { value: [{ role: 'user', content: 'synthetic input' }, { role: 'assistant', content: 'synthetic output' }] }
  const ref = value => ({ value })
  const notify = payload => events.push(['notice', payload])
  for (const type of ['info', 'warning', 'success', 'error']) notify[type] = text => events.push([type, text])
  const context = vm.createContext({
    compacting: ref(false), loading: ref(false), compactProgress: ref({}), compactAbortController: null,
    chat_show: ref([{ role: 'user' }]), fullHistory: data,
    compactConfig: ref({ contextLength: 1000, triggerRatio: 0.25, keepRecentRounds: 3 }),
    model: ref('synthetic'), currentConfig: ref({ prompts: {} }), CODE: ref('AI'), selectedVoice: ref(null),
    autoCompactSuppressedForTurn: ref(false), currentConversationStorage: ref({ isPaged: false }),
    sessionMutationVersion: 0, AbortController,
    window: { api: { runConversationCompact: async () => ({ marker: { snapshotId: 'new-snapshot', summary: 'synthetic summary' } }) } },
    hydratePagedConversationForCompaction: async () => hydrated,
    rehydrateHistoryToolsIfNeeded() {}, syncHistoryFromFullHistory() {}, syncAutoCloseOnBlurListener() {},
    showDismissibleMessage: notify,
    projectFullHistoryToRequestHistory: () => data.value,
    shouldCompactNow: async () => false,
    splitFullHistoryPrefixAndTail: async () => ({ insertIndex: 1, prefix: [data.value[0]], tailStartUserOrdinal: 0 }),
    splitAiWindowPrefixAndTail: () => ({ insertIndex: 0, prefix: [] }),
    splitChatShowPrefixAtFullCut: () => ({ insertIndex: 0, prefix: [] }),
    resolveProviderByModelValue: () => ({}),
    applyCascadeCompactStep: marker => data.value.splice(1, 0, { role: 'compaction', ...marker }),
    executeAutoSaveRequest: async () => { events.push(['save']); return saved },
    reloadConversationWindowFromStore: async options => {
      events.push(['reload', options])
      if (reloadFails) throw new Error('synthetic checkpoint validation failure')
      return true
    },
    refreshPromptTokenBreakdown: async () => { events.push(['refresh']) }
  })
  const run = vm.runInContext(code + '\n;runConversationCompact', context)
  const result = await run({ manual: true })
  assert.equal(context.compacting.value, false)
  return { result, events, data }
}
async function verifyReloadValidation() {
  const begin = source.indexOf('const reloadConversationWindowFromStore = async (')
  const end = source.indexOf('const hydratePagedConversationForCompaction', begin)
  const response = { sessionData: { fullHistory: [{ role: 'compaction', snapshotId: 'old' }], chat_show: [{ role: 'compaction', snapshotId: 'old' }] } }
  let replacements = 0
  const context = vm.createContext({
    currentConversationStorage: { value: { conversationId: 'synthetic', dirPath: 'synthetic' } },
    window: { api: { openConversation: async () => response } },
    replaceFullHistory: () => { replacements += 1 },
    chat_show: { value: [] }, syncHistoryFromFullHistory() {}
  })
  const reload = vm.runInContext(source.slice(begin, end) + '\n;reloadConversationWindowFromStore', context)
  await assert.rejects(reload({ expectedSnapshotId: 'new' }), /检查点/)
  assert.equal(replacements, 0)
  response.sessionData.fullHistory[0].snapshotId = 'new'
  await assert.rejects(reload({ expectedSnapshotId: 'new' }), /检查点/)
  assert.equal(replacements, 0)
  response.sessionData.chat_show[0].snapshotId = 'new'
  assert.equal(await reload({ expectedSnapshotId: 'new' }), true)
  assert.equal(replacements, 1)
}
async function main() {
  await verifyReloadValidation()
  const ok = await scenario()
  assert.equal(ok.result, true, JSON.stringify(ok.events))
  assert.deepEqual(ok.events.filter(e => ['save', 'reload', 'refresh', 'success'].includes(e[0])).map(e => e[0]), ['save', 'reload', 'refresh', 'success'])
  assert.equal(ok.events.find(e => e[0] === 'reload')[1].expectedSnapshotId, 'new-snapshot')
  for (const hydrated of [false, true]) {
    const failed = await scenario({ saved: false, hydrated })
    assert.equal(failed.result, false)
    assert.equal(failed.events.some(e => e[0] === 'reload'), false, 'failed save must not reload, including finally')
    assert.equal(failed.events.some(e => e[0] === 'success'), false)
    assert.equal(failed.events.some(e => e[0] === 'error'), true)
    assert.equal(failed.data.value.some(m => m.snapshotId === 'new-snapshot'), true)
  }
  const invalid = await scenario({ reloadFails: true, hydrated: true })
  assert.equal(invalid.result, false)
  assert.equal(invalid.events.filter(e => e[0] === 'reload').length, 1, 'failed validation must not trigger an unvalidated finally reload')
  assert.equal(invalid.events.some(e => e[0] === 'success'), false)
  console.log('Compaction completion: save failure, reload validation, paged failure retention and token refresh passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
