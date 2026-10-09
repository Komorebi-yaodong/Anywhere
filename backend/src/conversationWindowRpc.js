'use strict';

const CONVERSATION_RPC_REQUEST_CHANNEL = 'conversation-rpc-request';
const CONVERSATION_RPC_RESPONSE_CHANNEL = 'conversation-rpc-response';
const DEFAULT_CONVERSATION_RPC_TIMEOUT_MS = 5 * 60 * 1000;

const CONVERSATION_RPC_METHOD_TARGETS = Object.freeze({
  listLocalConversations: 'listLocalConversations',
  migrateJsonConversation: 'migrateJsonConversation',
  createConversation: 'createConversation',
  openConversation: 'openConversation',
  loadConversationPage: 'loadConversationPage',
  getConversationRequestMessages: 'getConversationRequestMessages',
  saveConversationSnapshot: 'saveConversationSnapshot',
  saveConversationState: 'saveConversationState',
  appendConversationMessages: 'appendMessages',
  updateConversationMessage: 'updateMessage',
  truncateConversationMessages: 'truncateMessages',
  deleteConversationMessages: 'deleteMessages',
  replaceActiveConversationMessages: 'replaceActiveMessages',
  restoreConversationCompaction: 'restoreConversationCompaction',
  renameConversation: 'renameConversation',
  deleteConversation: 'deleteConversation',
  acquireConversationWriteLease: 'acquireWriteLease',
  heartbeatConversationWriteLease: 'heartbeatWriteLease',
  releaseConversationWriteLease: 'releaseWriteLease',
  createConversationSnapshot: 'createConversationSnapshot',
  createCloudConversationWorktree: null,
  openCloudConversationSnapshot: null,
  readConversationSnapshot: 'readConversationSnapshot',
  importConversationSnapshot: 'importConversationSnapshot',
  getConversationDescriptor: 'getConversationDescriptor'
});

function createRpcProtocolError(message, code = 'conversation_rpc_invalid_request') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getConversationRpcTarget(method) {
  const normalizedMethod = typeof method === 'string' ? method.trim() : '';
  if (!Object.prototype.hasOwnProperty.call(CONVERSATION_RPC_METHOD_TARGETS, normalizedMethod)) {
    throw createRpcProtocolError(
      `conversation_rpc_method_not_allowed:${normalizedMethod || 'missing'}`,
      'conversation_rpc_method_not_allowed'
    );
  }
  return CONVERSATION_RPC_METHOD_TARGETS[normalizedMethod];
}

function normalizeConversationRpcRequest(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const senderId = typeof source.senderId === 'string' ? source.senderId.trim() : '';
  const requestId = typeof source.requestId === 'string' ? source.requestId.trim() : '';
  const method = typeof source.method === 'string' ? source.method.trim() : '';
  const capability = typeof source.capability === 'string' ? source.capability.trim() : '';
  const args = Array.isArray(source.args) ? source.args : [];

  if (!senderId || senderId.length > 160) {
    throw createRpcProtocolError('conversation_rpc_sender_invalid');
  }
  if (!requestId || requestId.length > 200) {
    throw createRpcProtocolError('conversation_rpc_request_id_invalid');
  }
  if (!capability || capability.length > 256) {
    throw createRpcProtocolError('conversation_rpc_capability_invalid');
  }

  getConversationRpcTarget(method);
  if (args.length > 4) {
    throw createRpcProtocolError('conversation_rpc_args_invalid');
  }

  return { senderId, requestId, method, capability, args };
}

function serializeConversationRpcError(error) {
  const source = error && typeof error === 'object' ? error : {};
  const message = String(source.message || error || 'conversation_rpc_failed').slice(0, 1000);
  const payload = {
    name: typeof source.name === 'string' && source.name ? source.name.slice(0, 120) : 'Error',
    message
  };
  if (typeof source.code === 'string' || typeof source.code === 'number') {
    payload.code = source.code;
  }
  if (Number.isFinite(Number(source.currentRevision))) {
    payload.currentRevision = Number(source.currentRevision);
  }
  return payload;
}

function deserializeConversationRpcError(payload = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const error = new Error(String(source.message || 'conversation_rpc_failed'));
  if (typeof source.name === 'string' && source.name) error.name = source.name;
  if (typeof source.code === 'string' || typeof source.code === 'number') error.code = source.code;
  if (Number.isFinite(Number(source.currentRevision))) error.currentRevision = Number(source.currentRevision);
  return error;
}

function cloneConversationRpcTransportValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') {
    return (typeof value === 'function' || typeof value === 'symbol') ? undefined : value;
  }
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (value instanceof Date) return new Date(value.getTime());
  if (seen.has(value)) {
    throw createRpcProtocolError(
      'conversation_rpc_payload_circular',
      'conversation_rpc_payload_circular'
    );
  }

  const cloned = Array.isArray(value) ? [] : {};
  seen.set(value, cloned);
  if (Array.isArray(value)) {
    for (const item of value) {
      const next = cloneConversationRpcTransportValue(item, seen);
      cloned.push(next === undefined ? null : next);
    }
  } else {
    for (const key of Object.keys(value)) {
      const next = cloneConversationRpcTransportValue(value[key], seen);
      if (next !== undefined) cloned[key] = next;
    }
  }
  seen.delete(value);
  return cloned;
}


function createConversationRpcClient({
  getSenderId,
  getCapability,
  sendRequest,
  subscribeResponse,
  createRequestId,
  timeoutMs = DEFAULT_CONVERSATION_RPC_TIMEOUT_MS
} = {}) {
  if (typeof getSenderId !== 'function' || typeof getCapability !== 'function' || typeof sendRequest !== 'function' || typeof subscribeResponse !== 'function') {
    throw new TypeError('conversation_rpc_client_options_invalid');
  }

  const pending = new Map();
  const safeTimeoutMs = Math.max(100, Number(timeoutMs) || DEFAULT_CONVERSATION_RPC_TIMEOUT_MS);
  const makeRequestId = typeof createRequestId === 'function'
    ? createRequestId
    : () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

  const handleResponse = (input = {}) => {
    const response = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const requestId = typeof response.requestId === 'string' ? response.requestId : '';
    const entry = pending.get(requestId);
    if (!entry) return;
    if (response.senderId !== entry.senderId) return;

    pending.delete(requestId);
    clearTimeout(entry.timer);
    if (response.ok === true) entry.resolve(response.result);
    else entry.reject(deserializeConversationRpcError(response.error));
  };

  const unsubscribe = subscribeResponse(handleResponse);

  const invoke = (method, ...args) => {
    try {
      getConversationRpcTarget(method);
    } catch (error) {
      return Promise.reject(error);
    }

    const senderId = String(getSenderId() || '').trim();
    if (!senderId) {
      return Promise.reject(createRpcProtocolError('window_sender_missing', 'window_sender_missing'));
    }
    const capability = String(getCapability() || '').trim();
    if (!capability) {
      return Promise.reject(createRpcProtocolError('conversation_rpc_capability_missing', 'conversation_rpc_capability_missing'));
    }

    let requestId = String(makeRequestId() || '').trim();
    if (!requestId) requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    while (pending.has(requestId)) requestId = `${requestId}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(createRpcProtocolError(
          `conversation_rpc_timeout:${method}`,
          'conversation_rpc_timeout'
        ));
      }, safeTimeoutMs);

      pending.set(requestId, { senderId, method, resolve, reject, timer });
      try {
        sendRequest({
          senderId,
          requestId,
          method,
          capability,
          args: cloneConversationRpcTransportValue(args)
        });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(error);
      }
    });
  };

  const dispose = (reason = 'conversation_rpc_disposed') => {
    if (typeof unsubscribe === 'function') unsubscribe();
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(createRpcProtocolError(reason, 'conversation_rpc_disposed'));
    }
    pending.clear();
  };

  return {
    invoke,
    dispose,
    getPendingCount: () => pending.size
  };
}

function createConversationRpcMethodInvoker({ getRepository, specialMethods = {} } = {}) {
  if (typeof getRepository !== 'function') {
    throw new TypeError('conversation_rpc_repository_factory_invalid');
  }

  return async (method, args = []) => {
    const target = getConversationRpcTarget(method);
    const safeArgs = Array.isArray(args) ? args : [];
    if (target === null) {
      const specialMethod = specialMethods[method];
      if (typeof specialMethod !== 'function') {
        throw createRpcProtocolError(
          `conversation_rpc_method_unavailable:${method}`,
          'conversation_rpc_method_unavailable'
        );
      }
      return await specialMethod(...safeArgs);
    }

    const repository = getRepository();
    const repositoryMethod = repository?.[target];
    if (typeof repositoryMethod !== 'function') {
      throw createRpcProtocolError(
        `conversation_rpc_method_unavailable:${method}`,
        'conversation_rpc_method_unavailable'
      );
    }
    return await repositoryMethod(...safeArgs);
  };
}


function createConversationRpcRequestHandler({ resolveWindow, invokeMethod, authorizeRequest } = {}) {
  if (typeof resolveWindow !== 'function' || typeof invokeMethod !== 'function') {
    throw new TypeError('conversation_rpc_handler_options_invalid');
  }

  const sendResponse = (senderId, payload) => {
    const targetWindow = resolveWindow(senderId);
    if (!targetWindow || typeof targetWindow.isDestroyed !== 'function' || targetWindow.isDestroyed()) return false;
    if (!targetWindow.webContents || typeof targetWindow.webContents.send !== 'function') return false;
    try {
      targetWindow.webContents.send(CONVERSATION_RPC_RESPONSE_CHANNEL, { senderId, ...payload });
      return true;
    } catch {
      return false;
    }
  };

  return async (input = {}) => {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const requestIdentity = {
      senderId: typeof source.senderId === 'string' ? source.senderId.trim() : '',
      requestId: typeof source.requestId === 'string' ? source.requestId.trim() : '',
      capability: typeof source.capability === 'string' ? source.capability.trim() : ''
    };
    let request;
    let authorized = typeof authorizeRequest !== 'function';
    try {
      if (!authorized) {
        authorized = authorizeRequest(requestIdentity) === true;
        if (!authorized) return;
      }
      request = normalizeConversationRpcRequest(source);
      const result = await invokeMethod(request.method, request.args, request);
      sendResponse(request.senderId, { requestId: request.requestId, ok: true, result });
    } catch (error) {
      const senderId = request?.senderId || requestIdentity.senderId;
      const requestId = request?.requestId || requestIdentity.requestId;
      if (authorized && senderId && requestId) {
        sendResponse(senderId, {
          requestId,
          ok: false,
          error: serializeConversationRpcError(error)
        });
      }
    }
  };
}

module.exports = {
  CONVERSATION_RPC_REQUEST_CHANNEL,
  CONVERSATION_RPC_RESPONSE_CHANNEL,
  DEFAULT_CONVERSATION_RPC_TIMEOUT_MS,
  CONVERSATION_RPC_METHOD_TARGETS,
  getConversationRpcTarget,
  normalizeConversationRpcRequest,
  serializeConversationRpcError,
  deserializeConversationRpcError,
  cloneConversationRpcTransportValue,
  createConversationRpcClient,
  createConversationRpcMethodInvoker,
  createConversationRpcRequestHandler
};
