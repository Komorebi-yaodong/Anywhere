'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
  createConversationDbHelperClient
} = require('../src/conversationDbHelperClient.js');
const conversationRepository = require('../src/conversationStore.js');

function sessionData(text) {
  return {
    anywhere_history: true,
    CODE: 'AI',
    fullHistory: [
      { role: 'system', content: 'system', storageId: 'system' },
      { role: 'user', content: text, storageId: 'user' }
    ],
    chat_show: [
      { role: 'system', content: 'system', storageId: 'system', uiStorageId: 'ui-system' },
      { role: 'user', content: text, storageId: 'user', uiStorageId: 'ui-user' }
    ]
  };
}

async function run() {
  assert.strictEqual(process.versions.modules, '110');
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-utools-db-helper-'));
  const conversationDir = path.join(tempRoot, 'conversations');
  const diagnosticPath = path.join(tempRoot, 'diagnostics', 'conversation-db-helper.jsonl');
  const helperPath = path.resolve(__dirname, '..', 'public', 'conversation_db_helper.js');
  const runtimePath = path.resolve(__dirname, '..', 'public', 'conversation_runtime.js');
  let client;

  try {
    await fs.mkdir(conversationDir, { recursive: true });
    const created = await conversationRepository.createConversation({
      dirPath: conversationDir,
      title: 'utools helper test',
      sessionData: sessionData('initial')
    });
    const conversationId = created.descriptor.conversationId;
    const holderInstanceId = 'utools-helper-holder';
    const lease = await conversationRepository.acquireWriteLease({
      dirPath: conversationDir,
      conversationId,
      holderInstanceId,
      holderApp: 'utools-helper-test'
    });

    client = createConversationDbHelperClient({
      helperPath,
      runtimePath,
      diagnosticPath,
      execPath: process.execPath,
      expectedModuleAbi: '110',
      readyTimeoutMs: 10_000,
      operationTimeoutMs: 20_000,
      testMode: true
    });

    const first = await client.saveConversationSnapshot({
      dirPath: conversationDir,
      conversationId,
      expectedRevision: created.descriptor.revision,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      title: 'utools helper first',
      sessionData: sessionData('first')
    });
    const firstPid = client.getState().helperPid;

    await assert.rejects(
      client.saveConversationSnapshot({
        dirPath: conversationDir,
        conversationId,
        expectedRevision: first.revision,
        holderInstanceId,
        leaseEpoch: lease.leaseEpoch,
        title: 'utools helper exit',
        sessionData: sessionData('exit')
      }, { testAction: 'exit' }),
      /conversation_db_helper_(disconnected|exited)/
    );

    const opened = await conversationRepository.openConversation({
      dirPath: conversationDir,
      reference: conversationId,
      activeOnly: true
    });
    const second = await client.saveConversationSnapshot({
      dirPath: conversationDir,
      conversationId,
      expectedRevision: opened.descriptor.revision,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      title: 'utools helper restarted',
      sessionData: sessionData('second')
    });
    const secondPid = client.getState().helperPid;
    assert.notStrictEqual(secondPid, firstPid);

    await conversationRepository.releaseWriteLease({
      dirPath: conversationDir,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch
    });

    console.log(JSON.stringify({
      ok: true,
      node: process.versions.node,
      electron: process.versions.electron,
      modules: process.versions.modules,
      firstPid,
      secondPid,
      revision: second.revision
    }));
  } finally {
    if (client) await client.dispose();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
