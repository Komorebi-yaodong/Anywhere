'use strict';

const assert = require('assert');

const {
  MAX_PROTOCOL_LINE_BYTES,
  serializeJsonLine,
  parseJsonLine,
  createJsonLineParser
} = require('../src/conversationDbHelperJsonProtocol.js');

const payload = {
  id: 'request-1',
  operationId: 'operation-1',
  method: 'readConversationSnapshot',
  args: [{ binary: Buffer.from([0, 1, 2, 255]), typed: new Uint8Array([3, 4, 5]) }]
};

const line = serializeJsonLine(payload);
const parsed = parseJsonLine(line);
assert.strictEqual(parsed.id, payload.id);
assert.strictEqual(parsed.operationId, payload.operationId);
assert.ok(Buffer.isBuffer(parsed.args[0].binary));
assert.deepStrictEqual([...parsed.args[0].binary], [0, 1, 2, 255]);
assert.ok(parsed.args[0].typed instanceof Uint8Array);
assert.deepStrictEqual([...parsed.args[0].typed], [3, 4, 5]);

const received = [];
const errors = [];
const parser = createJsonLineParser({
  onMessage: (message) => received.push(message),
  onError: (error) => errors.push(error)
});
const multi = Buffer.from(`${serializeJsonLine({ id: 'one' })}\n${serializeJsonLine({ id: 'two' })}\n`, 'utf8');
parser.push(multi.subarray(0, 7));
parser.push(multi.subarray(7, 19));
parser.push(multi.subarray(19));
assert.deepStrictEqual(received.map((message) => message.id), ['one', 'two']);
assert.strictEqual(errors.length, 0);

assert.throws(
  () => parseJsonLine(Buffer.alloc(MAX_PROTOCOL_LINE_BYTES + 1, 0x61)),
  /conversation_db_helper_protocol_line_too_large/
);
const circular = {};
circular.self = circular;
assert.throws(
  () => serializeJsonLine(circular),
  /conversation_db_helper_protocol_circular/
);

console.log('Conversation DB helper JSONL protocol regression passed');
