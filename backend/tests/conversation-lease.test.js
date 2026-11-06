'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const store = require(process.env.ANYWHERE_CONVERSATION_RUNTIME || '../src/conversation_runtime.js');
async function main() {
function session(content) {
  return { anywhere_history: true, fullHistory: [{role: 'system', content: 'synthetic system'}, {role: 'user', content}], chat_show: [{id: 1, role: 'user', content}], history: [] }
}
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-conflict-disabled-'))
try {
  const created = await store.createConversation({dirPath: root, title: 'fixture', sessionData: session('initial')})
  const conversationId = created.descriptor.conversationId
  const input = {dirPath: root, conversationId}
  const a = await store.acquireWriteLease({...input, holderInstanceId: 'desktop-a'})
  const b = await store.acquireWriteLease({...input, holderInstanceId: 'plugin-b'})
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  assert.equal(b.readonly, false)
  await store.saveConversationSnapshot({...input, expectedRevision: -100, holderInstanceId: 'stale', leaseEpoch: 999, sessionData: session('latest')})
  await store.saveConversationState({...input, expectedRevision: -100, state: {model: 'synthetic-model'}})
  await store.renameConversation({...input, expectedRevision: -100, title: 'renamed'})
  const opened = await store.openConversation({dirPath: root, reference: conversationId, activeOnly: true})
  assert.equal(opened.sessionData.fullHistory.at(-1).content, 'latest')
  assert.equal(opened.descriptor.title, 'renamed')
  assert.ok(opened.descriptor.revision >= 3)
  await store.releaseWriteLease({...input, holderInstanceId: 'other', leaseEpoch: -1})
  assert.equal((await store.heartbeatWriteLease({...input, holderInstanceId: 'stale', leaseEpoch: -1})).ok, true)
  await store.appendMessages({...input, messages: [{role: 'assistant', content: 'no lease required'}]})
  const reopened = await store.openConversation({dirPath: root, reference: conversationId, activeOnly: true})
  assert.equal(reopened.sessionData.fullHistory.at(-1).content, 'no lease required')
  console.log('PASS disabled cross-client conflict protection, stale revision, persistence and compatibility APIs')
} finally { await fs.rm(root, {recursive: true, force: true}) }

}
main().catch(error => { console.error(error); process.exitCode = 1 });
