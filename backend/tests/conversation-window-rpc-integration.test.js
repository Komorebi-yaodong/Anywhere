'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const conversationRepository = require('../src/conversationStore.js');
const {
  CONVERSATION_RPC_RESPONSE_CHANNEL,
  createConversationRpcClient,
  createConversationRpcMethodInvoker,
  createConversationRpcRequestHandler
} = require('../src/conversationWindowRpc.js');

async function run() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-conversation-rpc-'));
  const senderId = 'integration-window';
  const capability = 'integration-capability';
  let responseListener = null;
  let requestSequence = 0;

  const cloneForIpc = (value) => structuredClone(value);
  const fakeWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => {
        assert.strictEqual(channel, CONVERSATION_RPC_RESPONSE_CHANNEL);
        queueMicrotask(() => responseListener(cloneForIpc(payload)));
      }
    }
  };

  const invokeMethod = createConversationRpcMethodInvoker({
    getRepository: () => conversationRepository
  });
  const handleRequest = createConversationRpcRequestHandler({
    resolveWindow: (targetSenderId) => targetSenderId === senderId ? fakeWindow : null,
    authorizeRequest: (request) => request.senderId === senderId && request.capability === capability,
    invokeMethod
  });
  const client = createConversationRpcClient({
    getSenderId: () => senderId,
    getCapability: () => capability,
    createRequestId: () => `integration-${++requestSequence}`,
    timeoutMs: 10_000,
    sendRequest: (request) => {
      queueMicrotask(() => handleRequest(cloneForIpc(request)));
    },
    subscribeResponse: (listener) => {
      responseListener = listener;
      return () => { responseListener = null; };
    }
  });

  try {
    const created = await client.invoke('createConversation', {
      dirPath: tempDir,
      title: 'RPC integration',
      sessionData: {
        anywhere_history: true,
        CODE: 'AI',
        sessionMetadata: { title: 'RPC integration' },
        fullHistory: [
          { role: 'system', content: 'system', storageId: 'rpc-system' },
          { role: 'user', content: 'hello', storageId: 'rpc-user' }
        ],
        chat_show: [
          { role: 'system', content: 'system', storageId: 'rpc-system', uiStorageId: 'rpc-ui-system' },
          { role: 'user', content: [{ type: 'text', text: 'hello' }], storageId: 'rpc-user', uiStorageId: 'rpc-ui-user' }
        ]
      }
    });
    assert.strictEqual(created.ok, true);
    assert.ok(created.descriptor?.conversationId);

    const conversationId = created.descriptor.conversationId;
    const holderInstanceId = 'rpc-holder';
    const lease = await client.invoke('acquireConversationWriteLease', {
      dirPath: tempDir,
      conversationId,
      holderInstanceId,
      holderApp: 'utools'
    });
    assert.strictEqual(lease.ok, true);
    assert.ok(Number(lease.leaseEpoch) > 0);

    const saved = await client.invoke('saveConversationSnapshot', {
      dirPath: tempDir,
      conversationId,
      expectedRevision: created.descriptor.revision,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      title: 'RPC integration saved',
      sessionData: {
        anywhere_history: true,
        CODE: 'AI',
        sessionMetadata: { title: 'RPC integration saved' },
        fullHistory: [
          { role: 'system', content: 'system', storageId: 'rpc-system' },
          { role: 'user', content: 'hello', storageId: 'rpc-user' },
          { role: 'assistant', content: 'world', storageId: 'rpc-assistant' }
        ],
        chat_show: [
          { role: 'system', content: 'system', storageId: 'rpc-system', uiStorageId: 'rpc-ui-system' },
          { role: 'user', content: [{ type: 'text', text: 'hello' }], storageId: 'rpc-user', uiStorageId: 'rpc-ui-user' },
          { role: 'assistant', content: 'world', storageId: 'rpc-assistant', uiStorageId: 'rpc-ui-assistant' }
        ]
      }
    });
    assert.strictEqual(saved.ok, true);
    assert.strictEqual(saved.revision, Number(created.descriptor.revision) + 1);

    await assert.rejects(
      client.invoke('saveConversationState', {
        dirPath: tempDir,
        conversationId,
        expectedRevision: created.descriptor.revision,
        holderInstanceId,
        leaseEpoch: lease.leaseEpoch,
        state: { selectedVoice: 'stale' }
      }),
      (error) => {
        assert.strictEqual(error.message, 'conversation_revision_conflict');
        assert.strictEqual(error.currentRevision, saved.revision);
        return true;
      }
    );

    const heartbeat = await client.invoke('heartbeatConversationWriteLease', {
      dirPath: tempDir,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch
    });
    assert.strictEqual(heartbeat.ok, true);

    const opened = await client.invoke('openConversation', {
      dirPath: tempDir,
      reference: conversationId,
      activeOnly: true
    });
    assert.strictEqual(opened.ok, true);
    assert.strictEqual(opened.descriptor.title, 'RPC integration saved');
    assert.deepStrictEqual(opened.sessionData.fullHistory.map((message) => message.role), ['system', 'user', 'assistant']);

    const snapshot = await client.invoke('readConversationSnapshot', {
      dirPath: tempDir,
      conversationId
    });
    assert.strictEqual(snapshot.ok, true);
    assert.ok(snapshot.content instanceof Uint8Array, 'Electron-style structured cloning must return binary snapshot bytes');
    assert.ok(snapshot.content.byteLength > 0);

    const released = await client.invoke('releaseConversationWriteLease', {
      dirPath: tempDir,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch
    });
    assert.strictEqual(released.ok, true);
    assert.strictEqual(client.getPendingCount(), 0);
  } finally {
    client.dispose();
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  console.log('Plugin conversation parent RPC SQLite integration passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
