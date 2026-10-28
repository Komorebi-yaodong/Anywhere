'use strict';
const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {DatabaseSync} = require('../src/sqliteSyncDriver.js');
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-native-links-'));
  const loaded = process.env.ANYWHERE_HELPER_USE_PUBLIC === '1';
  const {createConversationDbHelperClient} = require('../src/conversationDbHelperClient.js');
  const helper = createConversationDbHelperClient({helperPath: path.resolve(__dirname, loaded ? '../../v2.0.0/conversation_db_helper.js' : '../src/conversation_db_helper.js'), runtimePath: path.resolve(__dirname, loaded ? '../../v2.0.0/conversation_runtime.js' : '../src/conversationStore.js'), expectedModuleAbi: process.versions.modules, operationTimeoutMs: 60000});
  const invoke = (method, input) => helper.invoke(method, [input]);
  const holderInstanceId = 'native-link-test';
  try {
    const fullHistory = Array.from({length: 90}, (_, i) => [
      {role: 'user', storageId: `u-${i}`, content: `synthetic user ${i}`},
      {role: 'assistant', storageId: `a-${i}`, content: null, tool_calls: [{id: `call-${i}`, type: 'function', function: {name: 'synthetic', arguments: '{}'}}]},
      {role: 'tool', storageId: `t-${i}`, tool_call_id: `call-${i}`, content: 'result'}
    ]).flat();
    const chat_show = fullHistory.filter(message => message.role !== 'tool').map((message, i) => ({...message, id: i + 1, uiStorageId: `ui-${i}`}));
    const created = await invoke('createConversation', {dirPath: root, title: 'synthetic', sessionData: {fullHistory, chat_show}});
    const conversationId = created.descriptor.conversationId;
    const lease = await invoke('acquireConversationWriteLease', {dirPath: root, conversationId, holderInstanceId, holderApp: 'test'});
    let opened = await invoke('openConversation', {dirPath: root, reference: conversationId, pageSize: 200});
    assert.strictEqual(opened.sessionData.fullHistory.length, 270);
    await invoke('saveConversationSnapshot', {dirPath: root, conversationId, holderInstanceId, leaseEpoch: lease.leaseEpoch, expectedRevision: opened.descriptor.revision, sessionData: opened.sessionData});
    const db = new DatabaseSync(created.databasePath);
    assert.strictEqual(db.prepare('SELECT count(*) AS n FROM ui_messages WHERE message_uuid IS NULL').get().n, 0);
    const canonical = db.prepare('SELECT * FROM messages ORDER BY ordinal').all();
    db.prepare('UPDATE ui_messages SET message_uuid = NULL').run(); db.close();
    opened = await invoke('openConversation', {dirPath: root, reference: conversationId, pageSize: 0});
    const repaired = await invoke('repairConversationUiLinks', {dirPath: root, conversationId, holderInstanceId, leaseEpoch: lease.leaseEpoch, expectedRevision: opened.descriptor.revision});
    assert.strictEqual(repaired.changed, 180);
    assert.strictEqual(repaired.backupCreated, true);
    const verify = new DatabaseSync(created.databasePath, {readOnly: true});
    assert.deepStrictEqual(verify.prepare('SELECT * FROM messages ORDER BY ordinal').all(), canonical);
    verify.close();
    await invoke('releaseConversationWriteLease', {dirPath: root, conversationId, holderInstanceId, leaseEpoch: lease.leaseEpoch});
    console.log(JSON.stringify({ok: true, suite: 'conversation-link-native-helper', node: process.versions.node, modules: process.versions.modules, published: loaded, repaired: 180, canonicalUnchanged: true}));
  } finally {helper.dispose(); await fs.rm(root, {recursive: true, force: true});}
}
main().catch(error => {console.error(error); process.exitCode = 1;});
