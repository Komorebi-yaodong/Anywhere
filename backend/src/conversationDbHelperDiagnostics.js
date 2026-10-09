'use strict';

const fs = require('fs');
const path = require('path');

const DIAGNOSTIC_DIRECTORY_NAME = 'diagnostics';
const DIAGNOSTIC_FILE_NAME = 'conversation-db-helper.jsonl';
const DIAGNOSTIC_PREVIOUS_FILE_NAME = 'conversation-db-helper.previous.jsonl';
const MAX_DIAGNOSTIC_FILE_BYTES = 5 * 1024 * 1024;

const STRING_FIELDS = new Set([
  'scope',
  'event',
  'sessionId',
  'operationId',
  'method',
  'phase',
  'reason',
  'code',
  'signal',
  'node',
  'electron',
  'modules'
]);
const NUMBER_FIELDS = new Set([
  'pid',
  'helperPid',
  'exitCode',
  'messageCount',
  'uiCount',
  'pendingCount',
  'elapsedMs',
  'byteCount'
]);
const BOOLEAN_FIELDS = new Set(['ok', 'connected', 'expectedExit']);

function resolveConversationDbHelperDiagnosticPath(userDataPath = '') {
  const rawRoot = String(userDataPath || '').trim();
  if (!rawRoot) throw new Error('conversation_db_helper_diagnostic_root_required');
  const normalizedRoot = path.resolve(rawRoot);
  return path.join(normalizedRoot, 'Anywhere', DIAGNOSTIC_DIRECTORY_NAME, DIAGNOSTIC_FILE_NAME);
}

function classifyDiagnosticReason(value) {
  const raw = String(value == null ? '' : value);
  const known = raw.match(/\b(conversation_db_helper_[a-z0-9_]+|conversation_[a-z0-9_]+|sqlite_native_[a-z0-9_]+|SQLITE_[A-Z0-9_]+)\b/);
  return known ? known[1] : (raw ? 'unexpected_error' : '');
}

function classifyDiagnosticCode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (/^(SQLITE_[A-Z0-9_]+|conversation_[a-z0-9_]+|sqlite_native_[a-z0-9_]+|E[A-Z0-9_]{1,40})$/.test(raw)) {
    return raw;
  }
  return 'unexpected_error_code';
}



function sanitizeDiagnosticToken(value, maxLength = 160) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  return raw
    .replace(/[^a-zA-Z0-9_.:@+-]+/g, '_')
    .slice(0, Math.max(1, maxLength));
}

function sanitizeConversationDbHelperDiagnostic(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const output = {
    timestamp: new Date().toISOString()
  };

  for (const key of STRING_FIELDS) {
    const value = key === 'reason'
      ? classifyDiagnosticReason(source[key])
      : (key === 'code' ? classifyDiagnosticCode(source[key]) : source[key]);
    const sanitized = sanitizeDiagnosticToken(value);
    if (sanitized) output[key] = sanitized;
  }
  for (const key of NUMBER_FIELDS) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) output[key] = Math.max(0, Math.trunc(value));
  }
  for (const key of BOOLEAN_FIELDS) {
    if (typeof source[key] === 'boolean') output[key] = source[key];
  }

  return output;
}

function rotateConversationDbHelperDiagnostic(logPath) {
  try {
    const stats = fs.statSync(logPath);
    if (stats.size < MAX_DIAGNOSTIC_FILE_BYTES) return;
    const previousPath = path.join(path.dirname(logPath), DIAGNOSTIC_PREVIOUS_FILE_NAME);
    fs.rmSync(previousPath, { force: true });
    fs.renameSync(logPath, previousPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      // Diagnostics must never interfere with conversation persistence.
    }
  }
}

function appendConversationDbHelperDiagnostic(logPath, input = {}) {
  try {
    const normalizedPath = path.resolve(String(logPath || '').trim());
    if (!normalizedPath) return false;
    fs.mkdirSync(path.dirname(normalizedPath), { recursive: true });
    rotateConversationDbHelperDiagnostic(normalizedPath);
    const record = sanitizeConversationDbHelperDiagnostic(input);
    fs.appendFileSync(normalizedPath, `${JSON.stringify(record)}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  DIAGNOSTIC_FILE_NAME,
  MAX_DIAGNOSTIC_FILE_BYTES,
  resolveConversationDbHelperDiagnosticPath,
  sanitizeConversationDbHelperDiagnostic,
  appendConversationDbHelperDiagnostic
};
