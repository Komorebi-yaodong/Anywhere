'use strict';

const assert = require('assert');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

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

async function waitForHelperExit(client, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (client.getState().connected && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.strictEqual(client.getState().connected, false, 'terminated helper must become unavailable before restart');
}

async function run() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'anywhere-db-helper-test-'));
  const conversationDir = path.join(tempRoot, 'conversations');
  const helperPath = path.resolve(__dirname, '..', 'src', 'conversation_db_helper.js');
  const runtimePath = path.resolve(__dirname, '..', 'src', 'conversationStore.js');
  let client;

  try {
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

    client = createConversationDbHelperClient({
      helperPath,
      runtimePath,
      execPath: process.execPath,
      expectedModuleAbi: process.versions.modules,
      readyTimeoutMs: 5_000,
      operationTimeoutMs: 10_000
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

    process.kill(firstHelperPid);
    await waitForHelperExit(client);

    const openedAfterExit = await conversationRepository.openConversation({
      dirPath: conversationDir,
      reference: conversationId,
      activeOnly: true
    });
    const restartedSaved = await client.saveConversationSnapshot({
      dirPath: conversationDir,
      conversationId,
      expectedRevision: openedAfterExit.descriptor.revision,
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

    console.log(JSON.stringify({
      ok: true,
      firstHelperPid,
      secondHelperPid,
      finalRevision: restartedSaved.revision
    }));
  } finally {
    if (client) await client.dispose();
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
