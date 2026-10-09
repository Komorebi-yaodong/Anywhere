'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
  createConversationDbHelperClient
} = require('../src/conversationDbHelperClient.js');

function sessionData(text = 'hello') {
  return {
    anywhere_history: true,
    CODE: 'AI',
    sessionMetadata: { title: 'all api helper' },
    fullHistory: [
      { role: 'system', content: 'system', storageId: 'system-id' },
      { role: 'user', content: text, storageId: 'user-id' }
    ],
    chat_show: [
      { role: 'system', content: 'system', storageId: 'system-id', uiStorageId: 'ui-system' },
      { role: 'user', content: text, storageId: 'user-id', uiStorageId: 'ui-user' }
    ]
  };
}

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-db-helper-all-api-'));
  const diagnosticPath = path.join(root, 'diagnostics', 'conversation-db-helper.jsonl');
  const usePublishedRuntime = process.env.ANYWHERE_HELPER_USE_PUBLIC === '1';
  const helperDirectory = usePublishedRuntime ? 'public' : 'src';
  const helperPath = path.resolve(__dirname, '..', helperDirectory, 'conversation_db_helper.js');
  const runtimePath = path.resolve(
    __dirname,
    '..',
    helperDirectory,
    usePublishedRuntime ? 'conversation_runtime.js' : 'conversationStore.js'
  );
  const client = createConversationDbHelperClient({
    helperPath,
    runtimePath,
    diagnosticPath,
    execPath: process.execPath,
    expectedModuleAbi: process.versions.modules,
    readyTimeoutMs: 5_000,
    operationTimeoutMs: 20_000
  });

  try {
    await assert.rejects(
      client.invoke('createCloudConversationWorktree', [{}]),
      /conversation_db_helper_composite_method_required/
    );
    await assert.rejects(
      client.invoke('arbitraryMethod', []),
      /conversation_rpc_method_not_allowed/
    );

    const created = await client.invoke('createConversation', [{
      dirPath: root,
      title: 'all api helper',
      sessionData: sessionData('initial')
    }]);
    const conversationId = created.descriptor.conversationId;
    const holderInstanceId = 'all-api-holder';

    const listed = await client.invoke('listLocalConversations', [root]);
    assert.ok(listed.some((item) => item.conversationId === conversationId));
    const descriptorResult = await client.invoke('getConversationDescriptor', [{ dirPath: root, reference: conversationId }]);
    assert.strictEqual(descriptorResult.descriptor.conversationId, conversationId);

    const opened = await client.invoke('openConversation', [{ dirPath: root, reference: conversationId, activeOnly: true }]);
    assert.deepStrictEqual(opened.sessionData.fullHistory.map((message) => message.role), ['system', 'user']);
    const page = await client.invoke('loadConversationPage', [{ dirPath: root, conversationId, pageSize: 50 }]);
    assert.strictEqual(page.ok, true);
    const requestBefore = await client.invoke('getConversationRequestMessages', [{ dirPath: root, conversationId }]);
    assert.strictEqual(requestBefore.messages.length, 2);

    const lease = await client.invoke('acquireConversationWriteLease', [{
      dirPath: root,
      conversationId,
      holderInstanceId,
      holderApp: 'utools'
    }]);
    assert.strictEqual(lease.ok, true);
    const heartbeat = await client.invoke('heartbeatConversationWriteLease', [{
      dirPath: root,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch
    }]);
    assert.strictEqual(heartbeat.ok, true);

    const saved = await client.invoke('saveConversationSnapshot', [{
      dirPath: root,
      conversationId,
      expectedRevision: created.descriptor.revision,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      title: 'snapshot saved',
      sessionData: sessionData('snapshot user')
    }]);
    assert.strictEqual(saved.revision, 1);
    const requestAfter = await client.invoke('getConversationRequestMessages', [{ dirPath: root, conversationId }]);
    assert.strictEqual(requestAfter.messages.at(-1).content, 'snapshot user');

    const stateSaved = await client.invoke('saveConversationState', [{
      dirPath: root,
      conversationId,
      expectedRevision: saved.revision,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      state: { selectedVoice: 'alloy' }
    }]);
    assert.strictEqual(stateSaved.revision, 2);

    const appended = await client.invoke('appendConversationMessages', [{
      dirPath: root,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      messages: [{ role: 'assistant', content: 'append', storageId: 'append-id' }]
    }]);
    assert.strictEqual(appended.messageIds.length, 1);
    const updated = await client.invoke('updateConversationMessage', [{
      dirPath: root,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      storageId: 'append-id',
      message: { role: 'assistant', content: 'updated' }
    }]);
    assert.strictEqual(updated.storageId, 'append-id');
    const deleted = await client.invoke('deleteConversationMessages', [{
      dirPath: root,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      storageIds: ['append-id']
    }]);
    assert.strictEqual(deleted.removed, 1);

    const appendedForTruncate = await client.invoke('appendConversationMessages', [{
      dirPath: root,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      messages: [
        { role: 'assistant', content: 'truncate-a', storageId: 'truncate-a' },
        { role: 'user', content: 'truncate-b', storageId: 'truncate-b' }
      ]
    }]);
    assert.strictEqual(appendedForTruncate.messageIds.length, 2);
    const truncated = await client.invoke('truncateConversationMessages', [{
      dirPath: root,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      fromStorageId: 'truncate-a',
      inclusive: true
    }]);
    assert.ok(truncated.removed >= 2);

    const replaced = await client.invoke('replaceActiveConversationMessages', [{
      dirPath: root,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      messages: [
        { role: 'system', content: 'replacement-system', storageId: 'replace-system' },
        { role: 'user', content: 'replacement-user', storageId: 'replace-user' }
      ]
    }]);
    assert.strictEqual(replaced.messageIds.length, 2);

    await assert.rejects(
      client.invoke('restoreConversationCompaction', [{
        dirPath: root,
        conversationId,
        snapshotId: 'missing-snapshot',
        expectedRevision: stateSaved.revision,
        holderInstanceId,
        leaseEpoch: lease.leaseEpoch,
        pageSize: 0
      }]),
      /conversation_compaction_not_found/
    );

    const renamed = await client.invoke('renameConversation', [{
      dirPath: root,
      conversationId,
      title: 'renamed through helper',
      expectedRevision: stateSaved.revision,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch
    }]);
    assert.strictEqual(renamed.title, 'renamed through helper');

    const snapshot = await client.invoke('readConversationSnapshot', [{ dirPath: root, conversationId }]);
    assert.ok(Buffer.isBuffer(snapshot.content));
    assert.ok(snapshot.content.length > 0);
    const explicitSnapshot = await client.invoke('createConversationSnapshot', [{ dirPath: root, conversationId }]);
    assert.strictEqual(explicitSnapshot.ok, true);
    await fs.rm(explicitSnapshot.path, { force: true });

    const importRoot = path.join(root, 'imported');
    await fs.mkdir(importRoot, { recursive: true });
    const imported = await client.invoke('importConversationSnapshot', [{
      dirPath: importRoot,
      descriptor: { ...renamed, conversationId, dbFile: renamed.dbFile, storageMode: 'local' },
      content: snapshot.content
    }]);
    assert.strictEqual(imported.ok, true);
    const importedOpened = await client.invoke('openConversation', [{ dirPath: importRoot, reference: conversationId, activeOnly: true }]);
    assert.strictEqual(importedOpened.descriptor.conversationId, conversationId);

    const released = await client.invoke('releaseConversationWriteLease', [{
      dirPath: root,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch
    }]);
    assert.strictEqual(released.ok, true);
    const removed = await client.invoke('deleteConversation', [{ dirPath: root, conversationId }]);
    assert.strictEqual(removed.removed, true);

    const records = (await fs.readFile(diagnosticPath, 'utf8'))
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const methods = new Set(records.filter((record) => record.event === 'operation-start').map((record) => record.method));
    for (const method of [
      'createConversation',
      'listLocalConversations',
      'openConversation',
      'loadConversationPage',
      'getConversationRequestMessages',
      'saveConversationSnapshot',
      'saveConversationState',
      'appendConversationMessages',
      'updateConversationMessage',
      'deleteConversationMessages',
      'truncateConversationMessages',
      'replaceActiveConversationMessages',
      'restoreConversationCompaction',
      'renameConversation',
      'readConversationSnapshot',
      'createConversationSnapshot',
      'importConversationSnapshot',
      'acquireConversationWriteLease',
      'heartbeatConversationWriteLease',
      'releaseConversationWriteLease',
      'deleteConversation'
    ]) {
      assert.ok(methods.has(method), `missing helper operation log for ${method}`);
    }

    console.log(JSON.stringify({
      ok: true,
      methods: methods.size,
      finalTitle: renamed.title,
      node: process.versions.node,
      electron: process.versions.electron || '',
      modules: process.versions.modules,
      publishedRuntime: usePublishedRuntime
    }));
  } finally {
    await client.dispose();
    await fs.rm(root, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
