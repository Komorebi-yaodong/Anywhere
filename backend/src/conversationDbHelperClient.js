'use strict';

const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');

const {
  cloneConversationRpcTransportValue,
  deserializeConversationRpcError,
  getConversationRpcTarget
} = require('./conversationWindowRpc.js');
const {
  serializeJsonLine,
  createJsonLineParser
} = require('./conversationDbHelperJsonProtocol.js');

const DEFAULT_READY_TIMEOUT_MS = 15 * 1000;
const DEFAULT_OPERATION_TIMEOUT_MS = 5 * 60 * 1000;

function createHelperError(message, code, fields = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, fields);
  return error;
}

function normalizeExitCode(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? (numeric >>> 0) : null;
}

function createConversationDbHelperClient({
  helperPath,
  runtimePath,
  execPath = process.execPath,
  readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
  operationTimeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
  expectedModuleAbi = '',
  env = {}
} = {}) {
  const normalizedHelperPath = String(helperPath || '').trim();
  const normalizedRuntimePath = String(runtimePath || path.join(path.dirname(normalizedHelperPath), 'conversation_runtime.js')).trim();
  const normalizedExecPath = String(execPath || '').trim();
  if (!normalizedHelperPath || !normalizedRuntimePath || !normalizedExecPath) {
    throw new TypeError('conversation_db_helper_client_options_invalid');
  }

  let currentState = null;
  let disposed = false;

  function rejectPending(state, error) {
    for (const pending of state.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    state.pending.clear();
  }

  function terminateState(state, error) {
    if (!state || state.terminated) return;
    state.terminated = true;
    clearTimeout(state.readyTimer);
    if (!state.readySettled) {
      state.readySettled = true;
      state.rejectReady(error);
    }
    rejectPending(state, error);
    if (currentState === state) currentState = null;
  }

  function handleHelperMessage(state, message) {
    if (state.terminated || !message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      const modules = String(message.versions?.modules || '');
      if (expectedModuleAbi && modules !== String(expectedModuleAbi)) {
        const error = createHelperError(
          `conversation_db_helper_abi_mismatch:expected=${expectedModuleAbi},actual=${modules || 'unknown'}`,
          'conversation_db_helper_abi_mismatch'
        );
        terminateState(state, error);
        try { state.child.kill(); } catch {}
        return;
      }
      clearTimeout(state.readyTimer);
      if (!state.readySettled) {
        state.readySettled = true;
        state.resolveReady(state);
      }
      return;
    }

    const id = typeof message.id === 'string' ? message.id : '';
    const pending = state.pending.get(id);
    if (!pending) return;
    state.pending.delete(id);
    clearTimeout(pending.timer);
    if (message.ok === true) {
      pending.resolve(message.result);
    } else {
      pending.reject(deserializeConversationRpcError(message.error));
    }
  }

  function spawnHelper() {
    if (disposed) {
      return Promise.reject(createHelperError('conversation_db_helper_disposed', 'conversation_db_helper_disposed'));
    }
    if (currentState && !currentState.terminated) return currentState.readyPromise;

    let child;
    try {
      child = spawn(normalizedExecPath, [normalizedHelperPath, normalizedRuntimePath], {
        env: {
          ...process.env,
          ...env,
          ELECTRON_RUN_AS_NODE: '1'
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (error) {
      return Promise.reject(error);
    }

    const state = {
      child,
      pending: new Map(),
      terminated: false,
      readySettled: false,
      readyTimer: null,
      readyPromise: null,
      resolveReady: null,
      rejectReady: null,
      exitSettled: false,
      exitPromise: null,
      resolveExit: null,
      stdoutParser: null
    };
    state.readyPromise = new Promise((resolve, reject) => {
      state.resolveReady = resolve;
      state.rejectReady = reject;
    });
    state.exitPromise = new Promise((resolve) => {
      state.resolveExit = resolve;
    });
    currentState = state;

    state.readyTimer = setTimeout(() => {
      const error = createHelperError('conversation_db_helper_ready_timeout', 'conversation_db_helper_ready_timeout');
      terminateState(state, error);
      try { child.kill(); } catch {}
    }, Math.max(100, Number(readyTimeoutMs) || DEFAULT_READY_TIMEOUT_MS));

    state.stdoutParser = createJsonLineParser({
      onMessage: (message) => handleHelperMessage(state, message),
      onError: (error) => {
        const wrapped = createHelperError(
          `conversation_db_helper_protocol_read_failed:${error?.message || error}`,
          'conversation_db_helper_protocol_read_failed',
          { cause: error }
        );
        terminateState(state, wrapped);
        try { child.kill(); } catch {}
      }
    });
    child.stdout.on('data', (chunk) => state.stdoutParser.push(chunk));
    child.stdout.on('end', () => state.stdoutParser.end());
    child.stderr.on('data', () => {});

    child.on('error', (error) => {
      terminateState(state, createHelperError(
        `conversation_db_helper_error:${error?.message || error}`,
        'conversation_db_helper_error',
        { cause: error }
      ));
    });

    child.on('exit', (code, signal) => {
      if (!state.exitSettled) {
        state.exitSettled = true;
        state.resolveExit({ code, signal });
      }
      if (state.terminated) return;
      const exitCode = normalizeExitCode(code);
      terminateState(state, createHelperError(
        `conversation_db_helper_exited:code=${exitCode == null ? 'null' : exitCode},signal=${signal || 'none'}`,
        'conversation_db_helper_exited',
        {
          exitCode,
          signal: signal || '',
          operationOutcomeUnknown: state.pending.size > 0
        }
      ));
    });

    return state.readyPromise;
  }

  async function invoke(method, args = []) {
    const target = getConversationRpcTarget(method);
    if (target === null) {
      throw createHelperError(
        `conversation_db_helper_composite_method_required:${method}`,
        'conversation_db_helper_composite_method_required'
      );
    }
    const safeMethod = String(method || '').trim();
    const inputArgs = Array.isArray(args) ? args : [];
    if (inputArgs.length > 4) {
      throw createHelperError('conversation_db_helper_args_invalid', 'conversation_db_helper_args_invalid');
    }

    const state = await spawnHelper();
    if (!state || state.terminated || state.child.exitCode != null || state.child.stdin.destroyed) {
      throw createHelperError('conversation_db_helper_unavailable', 'conversation_db_helper_unavailable');
    }

    const id = crypto.randomUUID();
    const safeArgs = cloneConversationRpcTransportValue(inputArgs);
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        reject(createHelperError(
          'conversation_db_helper_operation_timeout',
          'conversation_db_helper_operation_timeout',
          { operationOutcomeUnknown: true }
        ));
      }, Math.max(100, Number(operationTimeoutMs) || DEFAULT_OPERATION_TIMEOUT_MS));

      state.pending.set(id, { resolve, reject, timer });
      let line;
      try {
        line = `${serializeJsonLine({ id, method: safeMethod, args: safeArgs })}\n`;
      } catch (error) {
        state.pending.delete(id);
        clearTimeout(timer);
        reject(error);
        return;
      }

      try {
        state.child.stdin.write(line, 'utf8', (error) => {
          if (!error) return;
          const pending = state.pending.get(id);
          if (!pending) return;
          state.pending.delete(id);
          clearTimeout(pending.timer);
          pending.reject(createHelperError(
            `conversation_db_helper_send_failed:${error.message}`,
            'conversation_db_helper_send_failed'
          ));
        });
      } catch (error) {
        const pending = state.pending.get(id);
        if (pending) {
          state.pending.delete(id);
          clearTimeout(pending.timer);
        }
        reject(error);
      }
    });
  }

  const saveConversationSnapshot = (input = {}) => invoke('saveConversationSnapshot', [input]);

  async function dispose() {
    disposed = true;
    const state = currentState;
    if (!state) return;
    if (!state.terminated) {
      const error = createHelperError('conversation_db_helper_disposed', 'conversation_db_helper_disposed');
      terminateState(state, error);
      try {
        state.child.stdin.end();
      } catch {
        try { state.child.kill(); } catch {}
      }
    }

    let forceKillTimer;
    try {
      await Promise.race([
        state.exitPromise,
        new Promise((resolve) => {
          forceKillTimer = setTimeout(() => {
            try { state.child.kill(); } catch {}
            resolve();
          }, 2000);
        })
      ]);
    } finally {
      if (forceKillTimer) clearTimeout(forceKillTimer);
    }
  }

  return {
    invoke,
    saveConversationSnapshot,
    dispose,
    getState: () => ({
      helperPid: currentState?.child?.pid || null,
      connected: Boolean(currentState && !currentState.terminated && currentState.child?.exitCode == null),
      pendingCount: currentState?.pending?.size || 0
    })
  };
}

module.exports = {
  DEFAULT_READY_TIMEOUT_MS,
  DEFAULT_OPERATION_TIMEOUT_MS,
  createConversationDbHelperClient
};
