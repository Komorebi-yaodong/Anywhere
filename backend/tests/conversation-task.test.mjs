import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const {createConversationTaskDelivery} = createRequire(import.meta.url)('../src/conversationTaskDelivery.js')


let sent
const delivery = createConversationTaskDelivery({timeoutMs: 30, send: async (windowId, input) => {sent = {windowId, input}; return {ok: true}}})
const pending = delivery.deliver('window-a', {conversationId: 'conversation-a'})
assert.equal(delivery.complete('other-window', {...sent.input, ok: true}).ok, false)
assert.equal(delivery.complete('window-a', {...sent.input, conversationId: 'other', ok: true}).ok, false)
assert.equal(delivery.complete('window-a', {...sent.input, ok: true}).ok, true)
assert.equal((await pending).ok, true)
assert.equal(delivery.complete('window-a', {...sent.input, ok: true}).ok, false)
assert.equal((await delivery.deliver('window-a', {conversationId: 'conversation-a'})).reason, 'task_receipt_timeout')

console.log('PASS conversation task receipts/window binding/expiry/exclusive target/storage gate')
