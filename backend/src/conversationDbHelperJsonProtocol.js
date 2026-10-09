'use strict';

const MAX_PROTOCOL_LINE_BYTES = 64 * 1024 * 1024;
const BINARY_TAG = '__anywhere_db_helper_binary_v1__';
const DATE_TAG = '__anywhere_db_helper_date_v1__';

function createProtocolError(message, code = 'conversation_db_helper_protocol_invalid') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function encodeJsonValue(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return undefined;
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return { [BINARY_TAG]: 'buffer', data: value.toString('base64') };
  }
  if (value instanceof ArrayBuffer) {
    return { [BINARY_TAG]: 'array-buffer', data: Buffer.from(value).toString('base64') };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      [BINARY_TAG]: 'uint8-array',
      data: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64')
    };
  }
  if (value instanceof Date) {
    return { [DATE_TAG]: value.toISOString() };
  }
  if (seen.has(value)) {
    throw createProtocolError('conversation_db_helper_protocol_circular', 'conversation_db_helper_protocol_circular');
  }

  seen.add(value);
  const output = Array.isArray(value) ? [] : {};
  if (Array.isArray(value)) {
    for (const item of value) {
      const next = encodeJsonValue(item, seen);
      output.push(next === undefined ? null : next);
    }
  } else {
    for (const key of Object.keys(value)) {
      const next = encodeJsonValue(value[key], seen);
      if (next !== undefined) output[key] = next;
    }
  }
  seen.delete(value);
  return output;
}

function decodeJsonValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (!Array.isArray(value) && typeof value[BINARY_TAG] === 'string' && typeof value.data === 'string') {
    const bytes = Buffer.from(value.data, 'base64');
    if (value[BINARY_TAG] === 'buffer') return bytes;
    if (value[BINARY_TAG] === 'array-buffer') return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (value[BINARY_TAG] === 'uint8-array') return new Uint8Array(bytes);
    throw createProtocolError('conversation_db_helper_protocol_binary_type_invalid');
  }
  if (!Array.isArray(value) && typeof value[DATE_TAG] === 'string') {
    const date = new Date(value[DATE_TAG]);
    if (Number.isNaN(date.getTime())) throw createProtocolError('conversation_db_helper_protocol_date_invalid');
    return date;
  }
  if (Array.isArray(value)) return value.map((item) => decodeJsonValue(item));
  const output = {};
  for (const key of Object.keys(value)) {
    output[key] = decodeJsonValue(value[key]);
  }
  return output;
}

function serializeJsonLine(message, maxBytes = MAX_PROTOCOL_LINE_BYTES) {
  const encoded = JSON.stringify(encodeJsonValue(message));
  const byteLength = Buffer.byteLength(encoded, 'utf8');
  if (byteLength > maxBytes) {
    throw createProtocolError('conversation_db_helper_protocol_line_too_large', 'conversation_db_helper_protocol_line_too_large');
  }
  return encoded;
}

function parseJsonLine(line, maxBytes = MAX_PROTOCOL_LINE_BYTES) {
  const bytes = Buffer.isBuffer(line) ? line : Buffer.from(String(line || ''), 'utf8');
  if (bytes.length > maxBytes) {
    throw createProtocolError('conversation_db_helper_protocol_line_too_large', 'conversation_db_helper_protocol_line_too_large');
  }
  const trimmed = bytes.toString('utf8').replace(/\r$/, '').trim();
  if (!trimmed) return null;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw createProtocolError('conversation_db_helper_protocol_json_invalid', 'conversation_db_helper_protocol_json_invalid');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createProtocolError('conversation_db_helper_protocol_message_invalid', 'conversation_db_helper_protocol_message_invalid');
  }
  return decodeJsonValue(parsed);
}

function createJsonLineParser({ onMessage, onError, maxBytes = MAX_PROTOCOL_LINE_BYTES } = {}) {
  if (typeof onMessage !== 'function') throw new TypeError('conversation_db_helper_protocol_message_handler_required');
  let pending = Buffer.alloc(0);
  let failed = false;

  return {
    push(chunk) {
      if (failed) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      pending = pending.length ? Buffer.concat([pending, bytes]) : Buffer.from(bytes);
      if (pending.length > maxBytes && pending.indexOf(0x0a) < 0) {
        failed = true;
        onError?.(createProtocolError('conversation_db_helper_protocol_line_too_large', 'conversation_db_helper_protocol_line_too_large'));
        return;
      }
      let newlineIndex;
      while (!failed && (newlineIndex = pending.indexOf(0x0a)) >= 0) {
        const line = pending.subarray(0, newlineIndex);
        pending = pending.subarray(newlineIndex + 1);
        try {
          const message = parseJsonLine(line, maxBytes);
          if (message) onMessage(message);
        } catch (error) {
          failed = true;
          onError?.(error);
        }
      }
    },
    end() {
      if (failed || pending.length === 0) return;
      try {
        const message = parseJsonLine(pending, maxBytes);
        if (message) onMessage(message);
      } catch (error) {
        onError?.(error);
      }
      pending = Buffer.alloc(0);
    }
  };
}

module.exports = {
  MAX_PROTOCOL_LINE_BYTES,
  BINARY_TAG,
  DATE_TAG,
  createProtocolError,
  encodeJsonValue,
  decodeJsonValue,
  serializeJsonLine,
  parseJsonLine,
  createJsonLineParser
};
