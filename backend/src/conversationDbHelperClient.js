'use strict';

const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');

const {
  appendConversationDbHelperDiagnostic
} = require('./conversationDbHelperDiagnostics.js');
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
const HELPER_EXIT_BREAKPOINT = 0x80000003;

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

function snapshotCounts(input = {}) {
  const sessionData = input?.sessionData && typeof input.sessionData === 'object' ? input.sessionData : {};
  return {
    messageCount: Array.isArray(sessionData.fullHistory) ? sessionData.fullHistory.length : 0,
    uiCount: Array.isArray(sessionData.chat_show) ? sessionData.chat_show.length : 0
  };
}

function createConversationDbHelperClient({
  helperPath,
  runtimePath,
  diagnosticPath,
  execPath = process.execPath,
  readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
  operationTimeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
  expectedModuleAbi = '',
  testMode = false,
  env = {}
} = {}) {
  const normalizedHelperPath = String(helperPath || '').trim();
  const normalizedRuntimePath = String(runtimePath || path.join(path.dirname(normalizedHelperPath), 'conversation_runtime.js')).trim();
  const normalizedDiagnosticPath = String(diagnosticPath || '').trim();
  const normalizedExecPath = String(execPath || '').trim();
  if (!normalizedHelperPath || !normalizedRuntimePath || !normalizedDiagnosticPath || !normalizedExecPath) {
    throw new TypeError('conversation_db_helper_client_options_invalid');
  }

  const sessionId = crypto.randomUUID();
  let currentState = null;
  let disposed = false;

  function record(event, fields = {}) {
    appendConversationDbHelperDiagnostic(normalizedDiagnosticPath, {
      scope: 'host',
      event,
      sessionId,
      pid: process.pid,
      ...fields
    });
  }

  function rejectPending(state, error) {
    for (const pending of state.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    state.pending.clear();
  }

  function terminateState(state, error, fields = {}) {
    if (!state || state.terminated) return;
    const pendingCount = state.pending.size;
    state.terminated = true;
    clearTimeout(state.readyTimer);
    if (!state.readySettled) {
      state.readySettled = true;
      state.rejectReady(error);
    }
    rejectPending(state, error);
    if (currentState === state) currentState = null;
    record(fields.event || 'helper-terminal', {
      helperPid: state.child?.pid,
      exitCode: fields.exitCode,
      signal: fields.signal,
      reason: error?.message || error,
      code: error?.code,
      pendingCount,
      expectedExit: state.expectedExit === true
    });
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
        terminateState(state, error, { event: 'ready-abi-mismatch' });
        try { state.child.kill(); } catch {}
        return;
      }
      clearTimeout(state.readyTimer);
      if (!state.readySettled) {
        state.readySettled = true;
        state.resolveReady(state);
      }
      record('ready', {
        helperPid: state.child.pid,
        connected: state.child.exitCode == null,
        node: message.versions?.node,
        electron: message.versions?.electron,
        modules
      });
      return;
    }

    const id = typeof message.id === 'string' ? message.id : '';
    const pending = state.pending.get(id);
    if (!pending) return;
    state.pending.delete(id);
    clearTimeout(pending.timer);
    if (message.ok === true) {
      record('operation-complete', {
        helperPid: state.child.pid,
        operationId: pending.operationId,
        method: pending.method,
        ok: true,
        elapsedMs: Date.now() - pending.startedAt,
        ...pending.counts
      });
      pending.resolve(message.result);
    } else {
      const error = deserializeConversationRpcError(message.error);
      record('operation-failed', {
        helperPid: state.child.pid,
        operationId: pending.operationId,
        method: pending.method,
        ok: false,
        elapsedMs: Date.now() - pending.startedAt,
        reason: error.message,
        code: error.code,
        ...pending.counts
      });
      pending.reject(error);
    }
  }

  function spawnHelper() {
    if (disposed) {
      return Promise.reject(createHelperError('conversation_db_helper_disposed', 'conversation_db_helper_disposed'));
    }
    if (currentState && !currentState.terminated) return currentState.readyPromise;

    record('spawn-start', { reason: 'stdio-jsonl' });
    let child;
    try {
      child = spawn(normalizedExecPath, [normalizedHelperPath, normalizedRuntimePath, normalizedDiagnosticPath, sessionId], {
        env: {
          ...process.env,
          ...env,
          ELECTRON_RUN_AS_NODE: '1',
          ...(testMode ? { ANYWHERE_DB_HELPER_TEST_MODE: '1' } : {})
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (error) {
      record('spawn-failed', { reason: error?.message || error, code: error?.code });
      return Promise.reject(error);
    }

    const state = {
      child,
      pending: new Map(),
      terminated: false,
      expectedExit: false,
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
    record('spawned', { helperPid: child.pid, connected: true, reason: 'stdio-jsonl' });

    state.readyTimer = setTimeout(() => {
      const error = createHelperError('conversation_db_helper_ready_timeout', 'conversation_db_helper_ready_timeout');
      terminateState(state, error, { event: 'ready-timeout' });
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
        terminateState(state, wrapped, { event: 'protocol-read-failed' });
        try { child.kill(); } catch {}
      }
    });
    child.stdout.on('data', (chunk) => state.stdoutParser.push(chunk));
    child.stdout.on('end', () => state.stdoutParser.end());
    child.stderr.on('data', () => {});

    child.on('error', (error) => {
      const wrapped = createHelperError(
        `conversation_db_helper_error:${error?.message || error}`,
        'conversation_db_helper_error',
        { cause: error }
      );
      terminateState(state, wrapped, { event: 'helper-error' });
    });

    child.on('exit', (code, signal) => {
      if (!state.exitSettled) {
        state.exitSettled = true;
        state.resolveExit({ code, signal });
      }
      const normalizedCode = normalizeExitCode(code);
      if (state.terminated) {
        record('helper-exit-observed', {
          helperPid: child.pid,
          exitCode: normalizedCode,
          signal,
          expectedExit: state.expectedExit === true
        });
        return;
      }
      const isBreakpoint = normalizedCode === HELPER_EXIT_BREAKPOINT;
      const error = createHelperError(
        `conversation_db_helper_exited:code=${normalizedCode == null ? 'null' : normalizedCode},signal=${signal || 'none'}`,
        isBreakpoint ? 'conversation_db_helper_breakpoint_exit' : 'conversation_db_helper_exited',
        {
          exitCode: normalizedCode,
          signal: signal || '',
          operationOutcomeUnknown: state.pending.size > 0
        }
      );
      terminateState(state, error, {
        event: isBreakpoint ? 'helper-breakpoint-exited' : 'helper-exited',
        exitCode: normalizedCode,
        signal
      });
    });

    return state.readyPromise;
  }

  async function invoke(method, args = [], options = {}) {
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
    const operationId = typeof options.operationId === 'string' && options.operationId.trim()
      ? options.operationId.trim()
      : crypto.randomUUID();
    const counts = safeMethod === 'saveConversationSnapshot' ? snapshotCounts(inputArgs[0]) : {};
    const startedAt = Date.now();
    const safeArgs = cloneConversationRpcTransportValue(inputArgs);

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        const error = createHelperError(
          'conversation_db_helper_operation_timeout',
          'conversation_db_helper_operation_timeout',
          { operationOutcomeUnknown: true }
        );
        record('operation-timeout', {
          helperPid: state.child.pid,
          operationId,
          method: safeMethod,
          pendingCount: state.pending.size,
          elapsedMs: Date.now() - startedAt,
          ...counts
        });
        reject(error);
      }, Math.max(100, Number(operationTimeoutMs) || DEFAULT_OPERATION_TIMEOUT_MS));

      state.pending.set(id, {
        resolve,
        reject,
        timer,
        operationId,
        method: safeMethod,
        counts,
        startedAt
      });
      record('operation-dispatch', {
        helperPid: state.child.pid,
        operationId,
        method: safeMethod,
        pendingCount: state.pending.size,
        ...counts
      });

      let line;
      try {
        line = `${serializeJsonLine({
          id,
          operationId,
          method: safeMethod,
          args: safeArgs,
          ...(testMode && options.testAction ? { testAction: options.testAction } : {})
        })}\n`;
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

  const saveConversationSnapshot = (input = {}, options = {}) => (
    invoke('saveConversationSnapshot', [input], options)
  );

  async function dispose() {
    disposed = true;
    const state = currentState;
    if (!state) return;
    if (!state.terminated) {
      state.expectedExit = true;
      const error = createHelperError('conversation_db_helper_disposed', 'conversation_db_helper_disposed');
      terminateState(state, error, { event: 'disposed' });
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
      sessionId,
      helperPid: currentState?.child?.pid || null,
      connected: Boolean(currentState && !currentState.terminated && currentState.child?.exitCode == null),
      pendingCount: currentState?.pending?.size || 0
    })
  };
}

module.exports = {
  DEFAULT_READY_TIMEOUT_MS,
  DEFAULT_OPERATION_TIMEOUT_MS,
  HELPER_EXIT_BREAKPOINT,
  createConversationDbHelperClient
};
