'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  CONVERSATION_RPC_REQUEST_CHANNEL,
  CONVERSATION_RPC_RESPONSE_CHANNEL,
  getConversationRpcTarget,
  normalizeConversationRpcRequest,
  serializeConversationRpcError,
  deserializeConversationRpcError,
  cloneConversationRpcTransportValue,
  createConversationRpcClient,
  createConversationRpcMethodInvoker,
  createConversationRpcRequestHandler
} = require('../src/conversationWindowRpc.js');

async function run() {
  assert.strictEqual(CONVERSATION_RPC_REQUEST_CHANNEL, 'conversation-rpc-request');
  assert.strictEqual(CONVERSATION_RPC_RESPONSE_CHANNEL, 'conversation-rpc-response');
  assert.strictEqual(getConversationRpcTarget('saveConversationSnapshot'), 'saveConversationSnapshot');
  assert.strictEqual(getConversationRpcTarget('appendConversationMessages'), 'appendMessages');
  assert.throws(() => getConversationRpcTarget('readArbitraryFile'), /conversation_rpc_method_not_allowed/);

  assert.deepStrictEqual(
    normalizeConversationRpcRequest({
      senderId: ' window-a ',
      requestId: ' request-a ',
      capability: ' capability-a ',
      method: 'openConversation',
      args: [{ conversationId: 'conversation-a' }]
    }),
    {
      senderId: 'window-a',
      requestId: 'request-a',
      method: 'openConversation',
      capability: 'capability-a',
      args: [{ conversationId: 'conversation-a' }]
    }
  );
  assert.throws(
    () => normalizeConversationRpcRequest({ senderId: 'window-a', requestId: 'request-a', capability: 'capability-a', method: 'unknown', args: [] }),
    /conversation_rpc_method_not_allowed/
  );

  const proxiedPayload = new Proxy({
    nested: new Proxy({ value: 1 }, {}),
    bytes: Buffer.from([1, 2, 3]),
    typed: new Uint16Array([4, 5]),
    ignored: () => 'not cloneable'
  }, {});
  const clonedPayload = cloneConversationRpcTransportValue(proxiedPayload);
  assert.deepStrictEqual(clonedPayload.nested, { value: 1 });
  assert.ok(Buffer.isBuffer(clonedPayload.bytes));
  assert.deepStrictEqual([...clonedPayload.bytes], [1, 2, 3]);
  assert.ok(clonedPayload.typed instanceof Uint8Array);
  assert.deepStrictEqual([...clonedPayload.typed], [...new Uint8Array(new Uint16Array([4, 5]).buffer)]);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(clonedPayload, 'ignored'), false);
  const circularPayload = {};
  circularPayload.self = circularPayload;
  assert.throws(() => cloneConversationRpcTransportValue(circularPayload), /conversation_rpc_payload_circular/);


  const revisionError = new Error('conversation_revision_conflict');
  revisionError.code = 'SQLITE_CONSTRAINT';
  revisionError.currentRevision = 7;
  const serializedError = serializeConversationRpcError(revisionError);
  assert.deepStrictEqual(serializedError, {
    name: 'Error',
    message: 'conversation_revision_conflict',
    code: 'SQLITE_CONSTRAINT',
    currentRevision: 7
  });
  const restoredError = deserializeConversationRpcError(serializedError);
  assert.strictEqual(restoredError.message, 'conversation_revision_conflict');
  assert.strictEqual(restoredError.code, 'SQLITE_CONSTRAINT');
  assert.strictEqual(restoredError.currentRevision, 7);

  const methodCalls = [];
  const methodInvoker = createConversationRpcMethodInvoker({
    getRepository: () => ({
      appendMessages: async (...args) => {
        methodCalls.push({ target: 'appendMessages', args });
        return { appended: true };
      }
    }),
    specialMethods: {
      createCloudConversationWorktree: async (...args) => {
        methodCalls.push({ target: 'createCloudConversationWorktree', args });
        return { cloud: true };
      }
    }
  });
  assert.deepStrictEqual(
    await methodInvoker('appendConversationMessages', [{ messages: [{ role: 'user', content: 'hello' }] }]),
    { appended: true }
  );
  assert.deepStrictEqual(
    await methodInvoker('createCloudConversationWorktree', [{ title: 'cloud' }]),
    { cloud: true }
  );
  assert.deepStrictEqual(methodCalls.map((item) => item.target), ['appendMessages', 'createCloudConversationWorktree']);
  await assert.rejects(methodInvoker('openConversation', [{}]), /conversation_rpc_method_unavailable/);


  const sentToWindows = [];
  const windows = new Map([
    ['window-a', {
      isDestroyed: () => false,
      webContents: {
        send: (channel, payload) => sentToWindows.push({ target: 'window-a', channel, payload })
      }
    }],
    ['window-b', {
      isDestroyed: () => false,
      webContents: {
        send: (channel, payload) => sentToWindows.push({ target: 'window-b', channel, payload })
      }
    }]
  ]);
  const invocations = [];
  const requestHandler = createConversationRpcRequestHandler({
    resolveWindow: (senderId) => windows.get(senderId),
    authorizeRequest: (request) => request.capability === `capability-${request.senderId}`,
    invokeMethod: async (method, args) => {
      invocations.push({ method, args });
      if (method === 'saveConversationSnapshot') {
        const error = new Error('conversation_revision_conflict');
        error.currentRevision = 9;
        throw error;
      }
      return { method, args };
    }
  });

  await requestHandler({
    senderId: 'window-a',
    requestId: 'handler-success',
    capability: 'capability-window-a',
    method: 'openConversation',
    args: [{ reference: 'conversation-a' }]
  });
  assert.deepStrictEqual(invocations[0], {
    method: 'openConversation',
    args: [{ reference: 'conversation-a' }]
  });
  assert.strictEqual(sentToWindows.length, 1);
  assert.strictEqual(sentToWindows[0].target, 'window-a');
  assert.strictEqual(sentToWindows[0].channel, CONVERSATION_RPC_RESPONSE_CHANNEL);
  assert.strictEqual(sentToWindows[0].payload.ok, true);
  assert.strictEqual(sentToWindows[0].payload.requestId, 'handler-success');

  await requestHandler({
    senderId: 'window-b',
    requestId: 'handler-error',
    capability: 'capability-window-b',
    method: 'saveConversationSnapshot',
    args: [{ expectedRevision: 8 }]
  });
  assert.strictEqual(sentToWindows.length, 2);
  assert.strictEqual(sentToWindows[1].target, 'window-b');
  assert.strictEqual(sentToWindows[1].payload.ok, false);
  assert.strictEqual(sentToWindows[1].payload.error.message, 'conversation_revision_conflict');
  assert.strictEqual(sentToWindows[1].payload.error.currentRevision, 9);

  await requestHandler({
    senderId: 'window-a',
    requestId: 'handler-denied',
    capability: 'capability-window-a',
    method: 'readArbitraryFile',
    args: []
  });
  assert.strictEqual(sentToWindows.length, 3);
  assert.strictEqual(sentToWindows[2].target, 'window-a');
  assert.strictEqual(sentToWindows[2].payload.ok, false);
  assert.match(sentToWindows[2].payload.error.message, /conversation_rpc_method_not_allowed/);

  await requestHandler({
    senderId: 'window-a',
    requestId: 'handler-unauthorized',
    capability: 'wrong-capability',
    method: 'openConversation',
    args: [{}]
  });
  assert.strictEqual(invocations.length, 2, 'unauthorized requests must not invoke a repository method');
  assert.strictEqual(sentToWindows.length, 3, 'unauthorized requests must not send to a possibly forged target window');

  let responseListener = null;
  const clientRequests = [];
  let nextRequestId = 0;
  const client = createConversationRpcClient({
    getSenderId: () => 'window-a',
    getCapability: () => 'capability-window-a',
    createRequestId: () => `client-${++nextRequestId}`,
    timeoutMs: 500,
    sendRequest: (payload) => clientRequests.push(payload),
    subscribeResponse: (listener) => {
      responseListener = listener;
      return () => { responseListener = null; };
    }
  });

  const successPromise = client.invoke('openConversation', { reference: 'conversation-a' });
  assert.strictEqual(clientRequests.length, 1);
  assert.strictEqual(client.getPendingCount(), 1);
  responseListener({ senderId: 'window-b', requestId: 'client-1', ok: true, result: { ignored: true } });
  assert.strictEqual(client.getPendingCount(), 1, 'another window must not resolve this request');
  responseListener({ requestId: 'client-1', ok: true, result: { ignored: true } });
  assert.strictEqual(client.getPendingCount(), 1, 'responses without an exact sender must not resolve this request');
  responseListener({ senderId: 'window-a', requestId: 'client-1', ok: true, result: { ok: true } });
  assert.deepStrictEqual(await successPromise, { ok: true });
  assert.strictEqual(client.getPendingCount(), 0);

  const failurePromise = client.invoke('saveConversationSnapshot', { expectedRevision: 1 });
  responseListener({
    senderId: 'window-a',
    requestId: 'client-2',
    ok: false,
    error: { name: 'Error', message: 'conversation_revision_conflict', currentRevision: 2 }
  });
  await assert.rejects(failurePromise, (error) => {
    assert.strictEqual(error.message, 'conversation_revision_conflict');
    assert.strictEqual(error.currentRevision, 2);
    return true;
  });
  await assert.rejects(client.invoke('readArbitraryFile'), /conversation_rpc_method_not_allowed/);
  client.dispose();

  const timeoutClient = createConversationRpcClient({
    getSenderId: () => 'window-timeout',
    getCapability: () => 'capability-window-timeout',
    createRequestId: () => 'timeout-1',
    timeoutMs: 110,
    sendRequest: () => {},
    subscribeResponse: () => () => {}
  });
  await assert.rejects(timeoutClient.invoke('heartbeatConversationWriteLease', {}), /conversation_rpc_timeout/);
  assert.strictEqual(timeoutClient.getPendingCount(), 0);
  timeoutClient.dispose();

  const root = path.resolve(__dirname, '..', '..');
  const windowPreloadSource = fs.readFileSync(path.join(root, 'backend', 'src', 'window_preload.js'), 'utf8');
  const parentPreloadSource = fs.readFileSync(path.join(root, 'backend', 'src', 'preload.js'), 'utf8');
  assert.doesNotMatch(windowPreloadSource, /conversation_runtime\.js/, 'conversation renderer preload must not load the native SQLite runtime');
  assert.doesNotMatch(windowPreloadSource, /function getConversationModule\(/, 'conversation renderer preload must not expose a local repository');
  assert.match(windowPreloadSource, /createConversationRpcClient/);
  assert.match(parentPreloadSource, /createConversationRpcRequestHandler/);
  assert.match(parentPreloadSource, /CONVERSATION_RPC_REQUEST_CHANNEL/);

  console.log('Plugin conversation parent RPC regression passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
