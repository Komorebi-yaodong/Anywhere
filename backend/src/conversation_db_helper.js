'use strict';

const {
  appendConversationDbHelperDiagnostic
} = require('./conversationDbHelperDiagnostics.js');

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
  if (!id || !operationId || method !== 'saveConversationSnapshot' || args.length !== 1) {
    const error = new Error('conversation_db_helper_request_invalid');
    error.code = 'conversation_db_helper_request_invalid';
    if (typeof process.send === 'function' && id) {
      process.send({ id, operationId, ok: false, error: serializeError(error) });
    }
    return;
  }

  const counts = countSnapshotItems(args[0]);
  const startedAt = Date.now();
  record('operation-start', { operationId, method, ...counts });

  if (testMode && message.testAction === 'exit') {
    record('test-exit', { operationId, method, exitCode: 86 });
    process.exit(86);
    return;
  }

  try {
    const result = await repository.saveConversationSnapshot(args[0]);
    record('operation-complete', {
      operationId,
      method,
      ok: true,
      elapsedMs: Date.now() - startedAt,
      ...counts
    });
    if (typeof process.send === 'function') {
      process.send({ id, operationId, ok: true, result });
    }
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
    if (typeof process.send === 'function') {
      process.send({ id, operationId, ok: false, error: serializeError(error) });
    }
  }
}

process.on('message', (message) => {
  operationQueue = operationQueue
    .then(() => handleOperation(message))
    .catch((error) => {
      record('queue-failed', { reason: error?.message || error, code: error?.code });
    });
});

process.on('disconnect', () => {
  record('parent-disconnected', { expectedExit: true });
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  record('uncaught-exception', { reason: error?.message || error, code: error?.code });
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  record('unhandled-rejection', { reason: error?.message || error, code: error?.code });
  process.exit(1);
});

if (typeof process.send === 'function') {
  process.send({
    type: 'ready',
    pid: process.pid,
    versions: {
      node: process.versions?.node || '',
      electron: process.versions?.electron || '',
      modules: process.versions?.modules || ''
    }
  });
}
record('ready');
