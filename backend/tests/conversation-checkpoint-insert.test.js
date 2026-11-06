const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const store = require(process.env.ANYWHERE_CONVERSATION_RUNTIME || '../src/conversation_runtime.js')

const message = (role, content, id) => ({ role, content, storageId: id, uiStorageId: `ui_${id}` })
async function verify(mode) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-checkpoint-insert-'))
  try {
    const messages = [message('system', 'synthetic rules', 'system')]
    for (let i = 0; i < 12; i += 1) {
      messages.push(message('user', `synthetic question ${i}`, `u${i}`))
      messages.push(message('assistant', `synthetic answer ${i}`, `a${i}`))
    }
    messages[1].content = [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AQIDBA==' } }]
    const created = await store.createConversation({ dirPath: root, title: 'checkpoint insertion', sessionData: {
      fullHistory: messages, chat_show: messages.map(m => ({ ...m }))
    } })
    const id = created.descriptor.conversationId
    let originals = null
    for (let step = 0; step < 5; step += 1) {
      const beforeAll = await store.openConversation({ dirPath: root, reference: id, activeOnly: false, pageSize: 0 })
      if (!originals) originals = beforeAll.sessionData.fullHistory.map(m => ({ id: m.storageId, ordinal: m.storageOrdinal, content: m.content }))
      const opened = await store.openConversation({ dirPath: root, reference: id, activeOnly: mode !== 'full', pageSize: 0 })
      const data = opened.sessionData
      const lastMarker = data.fullHistory.map(m => m.role).lastIndexOf('compaction')
      const users = data.fullHistory.map((m, i) => m.role === 'user' && i > lastMarker ? i : -1).filter(i => i >= 0)
      const cut = users[1]
      assert.ok(cut > 0)
      const tailId = data.fullHistory[cut].storageId
      const checkpoint = { ...message('compaction', `summary ${step}`, `marker${step}`), summary: `summary ${step}`, snapshotId: `snapshot${step}` }
      data.fullHistory.splice(cut, 0, { ...checkpoint })
      data.chat_show.splice(data.chat_show.findIndex(m => m.storageId === tailId), 0, { ...checkpoint })
      const saved = await store.saveConversationSnapshot({ dirPath: root, conversationId: id, expectedRevision: opened.descriptor.revision, sessionData: data })
      assert.ok(saved.revision > opened.descriptor.revision)
      const after = await store.openConversation({ dirPath: root, reference: id, activeOnly: false, pageSize: 0 })
      const actual = after.sessionData.fullHistory
      assert.equal(actual.filter(m => m.role === 'compaction').length, step + 1)
      assert.equal(after.sessionData.chat_show.filter(m => m.role === 'compaction').length, step + 1)
      for (const old of originals) {
        const found = actual.find(m => m.storageId === old.id)
        assert.ok(found, 'canonical identity must survive')
        assert.equal(found.storageOrdinal, old.ordinal, 'canonical ordinals must never be renumbered')
        assert.deepEqual(found.content, old.content, 'canonical content and attachment must survive')
      }
      assert.deepEqual(actual.filter(m => m.role !== 'compaction').map(m => m.storageId), messages.map(m => m.storageId))
      const request = await store.getConversationRequestMessages({ dirPath: root, conversationId: id })
      assert.equal(request.messages.find(m => m.role !== 'system').snapshotId, checkpoint.snapshotId)
      assert.equal(request.messages.filter(m => m.role === 'user').length, 11 - step)
      const paged = await store.openConversation({ dirPath: root, reference: id, activeOnly: true, pageSize: 3 })
      assert.equal(paged.sessionData.fullHistory.find(m => m.role !== 'system').snapshotId, checkpoint.snapshotId)
    }
    // A new checkpoint can occupy the same logical gap without moving either neighbor.
    const opened = await store.openConversation({ dirPath: root, reference: id, activeOnly: false, pageSize: 0 })
    const data = opened.sessionData
    const oldIndex = data.fullHistory.findIndex(m => m.snapshotId === 'snapshot4')
    const checkpoint = { ...message('compaction', 'same gap', 'same-gap'), summary: 'same gap', snapshotId: 'same-gap' }
    data.fullHistory.splice(oldIndex + 1, 0, { ...checkpoint })
    data.chat_show.splice(data.chat_show.findIndex(m => m.snapshotId === 'snapshot4') + 1, 0, { ...checkpoint })
    for (const key of ['fullHistory', 'chat_show']) data[key].push(message('assistant', 'new unsaved tail', 'unsaved-tail'))
    await store.saveConversationSnapshot({ dirPath: root, conversationId: id, expectedRevision: opened.descriptor.revision, sessionData: data })
    const request = await store.getConversationRequestMessages({ dirPath: root, conversationId: id })
    assert.equal(request.messages.find(m => m.role !== 'system').snapshotId, 'same-gap')
    const stable = await store.openConversation({ dirPath: root, reference: id, activeOnly: false, pageSize: 0 })
    const failedData = stable.sessionData
    await assert.rejects(store.saveConversationSnapshot({ dirPath: root, conversationId: id, expectedRevision: stable.descriptor.revision - 1, sessionData: failedData }), /UNIQUE constraint failed/)
    const unchanged = await store.openConversation({ dirPath: root, reference: id, activeOnly: false, pageSize: 0 })
    assert.equal(unchanged.descriptor.revision, stable.descriptor.revision)
    assert.equal(unchanged.sessionData.fullHistory.some(m => m.snapshotId === 'rejected'), false)
    await store.restoreConversationCompaction({ dirPath: root, conversationId: id, snapshotId: 'same-gap', expectedRevision: unchanged.descriptor.revision, pageSize: 0 })
    const restoredRequest = await store.getConversationRequestMessages({ dirPath: root, conversationId: id })
    assert.equal(restoredRequest.messages.find(m => m.role !== 'system').snapshotId, 'snapshot4')
    assert.ok(restoredRequest.messages.some(m => m.storageId === 'unsaved-tail'))
  } finally { await fs.rm(root, { recursive: true, force: true }) }
}

async function verifyPagedSave() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-checkpoint-paged-'))
  try {
    const fullHistory = [message('system', 'rules', 'system')]
    for (let i = 0; i < 15; i += 1) {
      fullHistory.push(message('user', `user ${i}`, `u${i}`), message('assistant', `answer ${i}`, `a${i}`))
    }
    const created = await store.createConversation({ dirPath: root, title: 'paged checkpoint', sessionData: { fullHistory, chat_show: fullHistory.map(m => ({ ...m })) } })
    const id = created.descriptor.conversationId
    const before = await store.openConversation({ dirPath: root, reference: id, activeOnly: false, pageSize: 0 })
    const opened = await store.openConversation({ dirPath: root, reference: id, pageSize: 12 })
    assert.equal(opened.sessionData.conversationStorage.isPaged, true)
    const data = opened.sessionData
    const cut = data.fullHistory.findIndex(m => m.storageId === 'u11')
    assert.ok(cut > 0)
    const marker = { ...message('compaction', 'paged summary', 'paged-marker'), summary: 'paged summary', snapshotId: 'paged-snapshot' }
    data.fullHistory.splice(cut, 0, { ...marker })
    data.chat_show.splice(data.chat_show.findIndex(m => m.storageId === 'u11'), 0, { ...marker })
    await store.saveConversationSnapshot({ dirPath: root, conversationId: id, expectedRevision: opened.descriptor.revision, sessionData: data })
    const after = await store.openConversation({ dirPath: root, reference: id, activeOnly: false, pageSize: 0 })
    for (const old of before.sessionData.fullHistory) {
      const row = after.sessionData.fullHistory.find(m => m.storageId === old.storageId)
      assert.ok(row)
      assert.equal(row.storageOrdinal, old.storageOrdinal)
      assert.deepEqual(row.content, old.content)
    }
    assert.equal(after.sessionData.fullHistory.length, before.sessionData.fullHistory.length + 1)
    assert.equal(after.sessionData.chat_show.length, before.sessionData.chat_show.length + 1)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
}
async function main() {
  await verifyPagedSave()
  await verify('active')
  await verify('full')
  console.log('Checkpoint insertion: five consecutive compactions, active/full windows, stable ordinals and attachments passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
