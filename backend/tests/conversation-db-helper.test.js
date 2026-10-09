'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const {
  resolveConversationDbHelperDiagnosticPath,
  sanitizeConversationDbHelperDiagnostic,
  appendConversationDbHelperDiagnostic
} = require('../src/conversationDbHelperDiagnostics.js');
const {
  createConversationDbHelperClient
} = require('../src/conversationDbHelperClient.js');
const conversationRepository = require('../src/conversationStore.js');

function createSessionData(userText = 'hello') {
  return {
    anywhere_history: true,
    CODE: 'AI',
    sessionMetadata: { title: 'helper test' },
    fullHistory: [
      { role: 'system', content: 'system', storageId: 'helper-system' },
      { role: 'user', content: userText, storageId: 'helper-user' }
    ],
    chat_show: [
      { role: 'system', content: 'system', storageId: 'helper-system', uiStorageId: 'helper-ui-system' },
      { role: 'user', content: userText, storageId: 'helper-user', uiStorageId: 'helper-ui-user' }
    ]
  };
}

async function run() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'anywhere-db-helper-test-'));
  const conversationDir = path.join(tempRoot, 'conversations');
  const diagnosticPath = resolveConversationDbHelperDiagnosticPath(tempRoot);
  const helperPath = path.resolve(__dirname, '..', 'src', 'conversation_db_helper.js');
  const runtimePath = path.resolve(__dirname, '..', 'src', 'conversationStore.js');

  try {
    const sanitized = sanitizeConversationDbHelperDiagnostic({
      scope: 'host',
      event: 'operation-failed',
      operationId: 'operation-1',
      method: 'saveConversationSnapshot',
      reason: 'failed at C:\\Users\\secret\\conversation.db with private text',
      code: 'SQLITE_BUSY',
      messageCount: 3,
      uiCount: 2,
      conversationId: 'must-not-appear',
      holderInstanceId: 'must-not-appear',
      dirPath: 'C:\\Users\\secret',
      content: 'must-not-appear'
    });
    assert.strictEqual(sanitized.reason, 'unexpected_error');
    assert.strictEqual(sanitized.code, 'SQLITE_BUSY');
    assert.strictEqual(sanitized.messageCount, 3);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized, 'conversationId'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized, 'holderInstanceId'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized, 'dirPath'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(sanitized, 'content'), false);
    assert.strictEqual(appendConversationDbHelperDiagnostic(diagnosticPath, sanitized), true);
    const diagnosticText = fs.readFileSync(diagnosticPath, 'utf8');
    assert.doesNotMatch(diagnosticText, /Users|secret|must-not-appear|conversation\.db|private text/);

    await fsp.mkdir(conversationDir, { recursive: true });
    const created = await conversationRepository.createConversation({
      dirPath: conversationDir,
      title: 'helper test',
      sessionData: createSessionData('initial')
    });
    const conversationId = created.descriptor.conversationId;
    const holderInstanceId = 'helper-test-holder';
    const lease = await conversationRepository.acquireWriteLease({
      dirPath: conversationDir,
      conversationId,
      holderInstanceId,
      holderApp: 'helper-test'
    });

    const client = createConversationDbHelperClient({
      helperPath,
      runtimePath,
      diagnosticPath,
      execPath: process.execPath,
      expectedModuleAbi: process.versions.modules,
      readyTimeoutMs: 5_000,
      operationTimeoutMs: 10_000,
      testMode: true
    });

    const firstSaved = await client.saveConversationSnapshot({
      dirPath: conversationDir,
      conversationId,
      expectedRevision: created.descriptor.revision,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      title: 'helper first saved',
      sessionData: createSessionData('first')
    });
    assert.strictEqual(firstSaved.ok, true);
    const firstHelperPid = client.getState().helperPid;
    assert.ok(Number(firstHelperPid) > 0);

    await assert.rejects(
      client.saveConversationSnapshot({
        dirPath: conversationDir,
        conversationId,
        expectedRevision: firstSaved.revision,
        holderInstanceId,
        leaseEpoch: lease.leaseEpoch,
        title: 'helper crash probe',
        sessionData: createSessionData('crash probe')
      }, { testAction: 'exit' }),
      (error) => {
        assert.ok([
          'conversation_db_helper_disconnected',
          'conversation_db_helper_exited'
        ].includes(error.code));
        assert.strictEqual(error.operationOutcomeUnknown, true);
        return true;
      }
    );
    assert.strictEqual(client.getState().connected, false);

    const openedAfterExit = await conversationRepository.openConversation({
      dirPath: conversationDir,
      reference: conversationId,
      activeOnly: true
    });
    const currentRevision = openedAfterExit.descriptor.revision;
    const restartedSaved = await client.saveConversationSnapshot({
      dirPath: conversationDir,
      conversationId,
      expectedRevision: currentRevision,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      title: 'helper restarted',
      sessionData: createSessionData('restarted')
    });
    assert.strictEqual(restartedSaved.ok, true);
    const secondHelperPid = client.getState().helperPid;
    assert.ok(Number(secondHelperPid) > 0);
    assert.notStrictEqual(secondHelperPid, firstHelperPid, 'next operation must use a restarted helper process');

    await client.dispose();
    await conversationRepository.releaseWriteLease({
      dirPath: conversationDir,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch
    });

    const records = fs.readFileSync(diagnosticPath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.ok(records.some((record) => record.scope === 'host' && record.event === 'operation-dispatch'));
    assert.ok(records.some((record) => record.scope === 'helper' && record.event === 'operation-start'));
    assert.ok(records.some((record) => record.scope === 'helper' && record.event === 'test-exit' && record.exitCode === 86));
    assert.ok(records.some((record) => record.scope === 'host' && ['helper-disconnected', 'helper-exited'].includes(record.event)));
    assert.ok(records.filter((record) => record.scope === 'host' && record.event === 'ready').length >= 2);
    for (const record of records) {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(record, 'conversationId'), false);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(record, 'dirPath'), false);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(record, 'content'), false);
    }

    console.log(JSON.stringify({
      ok: true,
      firstHelperPid,
      secondHelperPid,
      records: records.length,
      finalRevision: restartedSaved.revision
    }));
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
