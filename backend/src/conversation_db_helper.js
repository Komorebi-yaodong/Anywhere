'use strict';

const {
  appendConversationDbHelperDiagnostic
} = require('./conversationDbHelperDiagnostics.js');
const {
  getConversationRpcTarget
} = require('./conversationWindowRpc.js');
const {
  serializeJsonLine,
  createJsonLineParser
} = require('./conversationDbHelperJsonProtocol.js');

const runtimePath = String(process.argv[2] || '').trim();
const diagnosticPath = String(process.argv[3] || '').trim();
const sessionId = String(process.argv[4] || '').trim();
const testMode = process.env.ANYWHERE_DB_HELPER_TEST_MODE === '1';

function record(event, fields = {}) {
  appendConversationDbHelperDiagnostic(diagnosticPath, {
    scope: 'helper',
    event,
    sessionId,
    pid: process.pid,
    node: process.versions?.node,
    electron: process.versions?.electron,
    modules: process.versions?.modules,
    ...fields
  });
}

function emitMessage(message) {
  try {
    process.stdout.write(`${serializeJsonLine(message)}\n`);
    return true;
  } catch (error) {
    record('protocol-write-failed', { reason: error?.message || error, code: error?.code });
    return false;
  }
}

function serializeError(error) {
  const source = error && typeof error === 'object' ? error : {};
  const payload = {
    name: typeof source.name === 'string' && source.name ? source.name : 'Error',
    message: String(source.message || error || 'conversation_db_helper_failed').slice(0, 1000)
  };
  if (typeof source.code === 'string' || typeof source.code === 'number') payload.code = source.code;
  if (Number.isFinite(Number(source.currentRevision))) payload.currentRevision = Number(source.currentRevision);
  return payload;
}

function countSnapshotItems(input = {}) {
  const sessionData = input?.sessionData && typeof input.sessionData === 'object' ? input.sessionData : {};
  return {
    messageCount: Array.isArray(sessionData.fullHistory) ? sessionData.fullHistory.length : 0,
    uiCount: Array.isArray(sessionData.chat_show) ? sessionData.chat_show.length : 0
  };
}

record('boot');

let repository;
try {
  if (!runtimePath) throw new Error('conversation_db_helper_runtime_required');
  record('runtime-load-start');
  repository = require(runtimePath);
  if (typeof repository?.saveConversationSnapshot !== 'function') {
    throw new Error('conversation_db_helper_runtime_invalid');
  }
  record('runtime-loaded');
} catch (error) {
  record('runtime-load-failed', {
    reason: error?.message || error,
    code: error?.code
  });
  throw error;
}

let operationQueue = Promise.resolve();

async function handleOperation(message = {}) {
  const id = typeof message.id === 'string' ? message.id : '';
  const operationId = typeof message.operationId === 'string' ? message.operationId : '';
  const method = typeof message.method === 'string' ? message.method : '';
  const args = Array.isArray(message.args) ? message.args : [];
  let repositoryMethod;
  try {
    const target = getConversationRpcTarget(method);
    if (target === null || !id || !operationId || args.length > 4) {
      throw new Error('conversation_db_helper_request_invalid');
    }
    repositoryMethod = repository?.[target];
    if (typeof repositoryMethod !== 'function') {
      throw new Error('conversation_db_helper_method_unavailable');
    }
  } catch (cause) {
    const error = new Error(
      cause?.message?.startsWith('conversation_rpc_method_not_allowed')
        ? 'conversation_db_helper_method_not_allowed'
        : (cause?.message || 'conversation_db_helper_request_invalid')
    );
    error.code = error.message;
    if (id) emitMessage({ id, operationId, ok: false, error: serializeError(error) });
    return;
  }

  const counts = method === 'saveConversationSnapshot' ? countSnapshotItems(args[0]) : {};
  const startedAt = Date.now();
  record('operation-start', { operationId, method, ...counts });

  if (testMode && message.testAction === 'exit') {
    record('test-exit', { operationId, method, exitCode: 86 });
    process.exit(86);
    return;
  }

  try {
    const result = await repositoryMethod(...args);
    record('operation-complete', {
      operationId,
      method,
      ok: true,
      elapsedMs: Date.now() - startedAt,
      ...counts
    });
    emitMessage({ id, operationId, ok: true, result });
  } catch (error) {
    record('operation-failed', {
      operationId,
      method,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      reason: error?.message || error,
      code: error?.code,
      ...counts
    });
    emitMessage({ id, operationId, ok: false, error: serializeError(error) });
  }
}

const inputParser = createJsonLineParser({
  onMessage: (message) => {
    operationQueue = operationQueue
      .then(() => handleOperation(message))
      .catch((error) => {
        record('queue-failed', { reason: error?.message || error, code: error?.code });
      });
  },
  onError: (error) => {
    record('protocol-read-failed', { reason: error?.message || error, code: error?.code });
    process.exit(2);
  }
});
process.stdin.on('data', (chunk) => inputParser.push(chunk));
process.stdin.on('end', () => {
  inputParser.end();
  record('stdin-ended', { expectedExit: true });
  operationQueue.finally(() => process.exit(0));
});
process.stdin.resume();

process.on('uncaughtException', (error) => {
  record('uncaught-exception', { reason: error?.message || error, code: error?.code });
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  record('unhandled-rejection', { reason: error?.message || error, code: error?.code });
  process.exit(1);
});

emitMessage({
  type: 'ready',
  pid: process.pid,
  versions: {
    node: process.versions?.node || '',
    electron: process.versions?.electron || '',
    modules: process.versions?.modules || ''
  }
});
record('ready');
