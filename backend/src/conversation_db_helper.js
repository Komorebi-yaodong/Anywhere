'use strict';

const {
  getConversationRpcTarget
} = require('./conversationWindowRpc.js');
const {
  serializeJsonLine,
  createJsonLineParser
} = require('./conversationDbHelperJsonProtocol.js');

const runtimePath = String(process.argv[2] || '').trim();

function emitMessage(message) {
  try {
    process.stdout.write(`${serializeJsonLine(message)}\n`);
    return true;
  } catch {
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

let repository;
try {
  if (!runtimePath) throw new Error('conversation_db_helper_runtime_required');
  repository = require(runtimePath);
  if (typeof repository?.saveConversationSnapshot !== 'function') {
    throw new Error('conversation_db_helper_runtime_invalid');
  }
} catch (error) {
  process.stderr.write(`${String(error?.message || error)}\n`);
  throw error;
}

let operationQueue = Promise.resolve();

async function handleOperation(message = {}) {
  const id = typeof message.id === 'string' ? message.id : '';
  const method = typeof message.method === 'string' ? message.method : '';
  const args = Array.isArray(message.args) ? message.args : [];
  let repositoryMethod;
  try {
    const target = getConversationRpcTarget(method);
    if (target === null || !id || args.length > 4) {
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
    if (id) emitMessage({ id, ok: false, error: serializeError(error) });
    return;
  }

  try {
    const result = await repositoryMethod(...args);
    emitMessage({ id, ok: true, result });
  } catch (error) {
    emitMessage({ id, ok: false, error: serializeError(error) });
  }
}

const inputParser = createJsonLineParser({
  onMessage: (message) => {
    operationQueue = operationQueue
      .then(() => handleOperation(message))
      .catch((error) => {
        process.stderr.write(`${String(error?.message || error)}\n`);
      });
  },
  onError: (error) => {
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.exit(2);
  }
});
process.stdin.on('data', (chunk) => inputParser.push(chunk));
process.stdin.on('end', () => {
  inputParser.end();
  operationQueue.finally(() => process.exit(0));
});
process.stdin.resume();

process.on('uncaughtException', (error) => {
  process.stderr.write(`${String(error?.message || error)}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  process.stderr.write(`${String(error?.message || error)}\n`);
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
