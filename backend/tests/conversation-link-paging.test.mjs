import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
const require = createRequire(import.meta.url)
const {DatabaseSync} = require('../src/sqliteSyncDriver.js')
const desktop = require('../src/conversationStore.js')
import {resolveSafeConversationMutationTarget} from '../../Anywhere_window/src/utils/conversationMessageTarget.js'

export async function verifyLinkPaging(store = desktop) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-links-'))
  let holder = 0
  try {
    const full = Array.from({length: 90}, (_, i) => [
      {role: 'user', storageId: `u-${i}`, content: `synthetic user ${i}`},
      {role: 'assistant', storageId: `a-${i}`, content: null, tool_calls: [{id: `call-${i}`, type: 'function', function: {name: 'synthetic_tool', arguments: '{}'}}]},
      {role: 'tool', storageId: `t-${i}`, tool_call_id: `call-${i}`, content: `result ${i}`}
    ]).flat()
    const ui = full.filter(m => m.role !== 'tool').map((m, i) => ({...m, id: i + 1, uiStorageId: `ui-${i}`}))
    const created = await store.createConversation({dirPath: root, title: 'synthetic', sessionData: {fullHistory: full, chat_show: ui}})
    const conversationId = created.descriptor.conversationId, holderInstanceId = `paging-holder-${++holder}`
    const lease = await store.acquireWriteLease({dirPath: root, conversationId, holderInstanceId, holderApp: 'test'})
    let opened = await store.openConversation({dirPath: root, reference: conversationId, pageSize: 200})
    assert.equal(opened.sessionData.fullHistory.length, 270, 'UI targets expand canonical range instead of dropping links')
    for (let round = 0; round < 3; round++) {
      await store.saveConversationSnapshot({dirPath: root, conversationId, holderInstanceId, leaseEpoch: lease.leaseEpoch, expectedRevision: opened.descriptor.revision, sessionData: opened.sessionData})
      opened = await store.openConversation({dirPath: root, reference: conversationId, pageSize: 200})
      assert.equal(opened.sessionData.chat_show.filter(m => m.storageId).length, 180)
    }
    // Simulate an old Renderer with all UI but a canonical-only tail. Save must preserve verified prefix links.
    opened.sessionData.fullHistory = opened.sessionData.fullHistory.slice(-200)
    opened.sessionData.conversationStorage = {...opened.sessionData.conversationStorage, isPaged: true, loadedFromOrdinal: opened.sessionData.fullHistory[0].storageOrdinal}
    await store.saveConversationSnapshot({dirPath: root, conversationId, holderInstanceId, leaseEpoch: lease.leaseEpoch, expectedRevision: opened.descriptor.revision, sessionData: opened.sessionData})
    const db = new DatabaseSync(created.databasePath)
    assert.equal(db.prepare('SELECT count(*) AS n FROM ui_messages WHERE message_uuid IS NULL').get().n, 0)
    const canonical = db.prepare('SELECT * FROM messages ORDER BY ordinal').all()
    db.prepare('UPDATE ui_messages SET message_uuid = NULL').run()
    db.close()
    const before = await store.openConversation({dirPath: root, reference: conversationId, pageSize: 0})
    const repaired = await store.repairConversationUiLinks({dirPath: root, conversationId, holderInstanceId, leaseEpoch: lease.leaseEpoch, expectedRevision: before.descriptor.revision})
    assert.equal(repaired.changed, 180)
    assert.equal(repaired.backupCreated, true)
    const check = new DatabaseSync(created.databasePath, {readOnly: true})
    assert.deepEqual(check.prepare('SELECT * FROM messages ORDER BY ordinal').all(), canonical, 'repair changes no canonical fields or ordinals')
    check.close()
    const recovered = await store.openConversation({dirPath: root, reference: conversationId, pageSize: 200})
    recovered.sessionData.chat_show.forEach((m, index) => assert.notEqual(resolveSafeConversationMutationTarget(recovered.sessionData.fullHistory, recovered.sessionData.chat_show, index), -1))
    assert.equal((await store.repairConversationUiLinks({dirPath: root, conversationId, holderInstanceId, leaseEpoch: lease.leaseEpoch, expectedRevision: repaired.revision})).changed, 0)
    const small = await store.openConversation({dirPath: root, reference: conversationId, pageSize: 7})
    for (const m of small.sessionData.chat_show) assert.ok(small.sessionData.fullHistory.some(candidate => candidate.storageId === m.storageId))
    const page = await store.loadConversationPage({dirPath: root, conversationId, beforeOrdinal: small.sessionData.conversationStorage.loadedFromOrdinal, beforeUiOrder: small.sessionData.conversationStorage.loadedFromUiOrder, pageSize: 7})
    for (const m of page.uiMessages) assert.ok(page.messages.some(candidate => candidate.storageId === m.storageId))
    await store.releaseWriteLease({dirPath: root, conversationId, holderInstanceId, leaseEpoch: lease.leaseEpoch})

    // Two UI rows claiming one missing link are ambiguous, not first-wins by array order.
    const ambiguous = await store.createConversation({dirPath: root, title: 'ambiguous', sessionData: {fullHistory: [{role: 'user', storageId: 'one', content: 'same'}], chat_show: [{id: 1, role: 'user', content: 'same'}, {id: 2, role: 'user', content: 'same'}]}})
    const ambDb = new DatabaseSync(ambiguous.databasePath)
    ambDb.prepare('UPDATE ui_messages SET message_uuid = NULL').run(); ambDb.close()
    const ambId = ambiguous.descriptor.conversationId, ambHolder = `holder-${++holder}`
    const ambLease = await store.acquireWriteLease({dirPath: root, conversationId: ambId, holderInstanceId: ambHolder, holderApp: 'test'})
    const ambRepair = await store.repairConversationUiLinks({dirPath: root, conversationId: ambId, holderInstanceId: ambHolder, leaseEpoch: ambLease.leaseEpoch, expectedRevision: 0})
    assert.equal(ambRepair.changed, 0)
    await store.releaseWriteLease({dirPath: root, conversationId: ambId, holderInstanceId: ambHolder, leaseEpoch: ambLease.leaseEpoch})
  } finally {await fs.rm(root, {recursive: true, force: true})}
  console.log(JSON.stringify({ok: true, suite: 'conversation-link-paging', stablePrefix: true, nullRepair: true, oneToOne: true}))
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) await verifyLinkPaging()
