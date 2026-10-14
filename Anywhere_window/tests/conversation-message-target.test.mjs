import assert from 'node:assert/strict'
import { resolveSafeConversationMutationTarget } from '../src/utils/conversationMessageTarget.js'

const toolTurn = (toolCallIds) => ({
  role: 'assistant',
  storageId: 'tool-turn',
  content: [],
  tool_calls: toolCallIds.map((id) => ({ id, type: 'function', function: { name: 'task_write' } }))
})

const verifiedToolTurn = toolTurn(['call-b', 'call-a'])
assert.equal(
  resolveSafeConversationMutationTarget([verifiedToolTurn], [toolTurn(['call-a', 'call-b'])], 0),
  0,
  'a stable-ID-verified empty assistant function-call turn must be deletable even without visible text'
)

assert.equal(
  resolveSafeConversationMutationTarget([verifiedToolTurn], [toolTurn(['other-call'])], 0),
  -1,
  'a mismatched tool-call identity must remain fail-closed'
)

assert.equal(
  resolveSafeConversationMutationTarget([verifiedToolTurn], [{ ...toolTurn(['']), storageId: 'tool-turn' }], 0),
  -1,
  'a missing tool-call ID must remain fail-closed'
)

assert.equal(
  resolveSafeConversationMutationTarget([verifiedToolTurn], [{ ...toolTurn(['call-a', 'call-a']), storageId: 'tool-turn' }], 0),
  -1,
  'duplicate tool-call IDs must remain fail-closed'
)

const emptyUser = { role: 'user', storageId: 'empty-user', content: [] }
assert.equal(
  resolveSafeConversationMutationTarget([emptyUser], [emptyUser], 0),
  -1,
  'an empty user message cannot be inferred from a stable ID alone'
)

const toolLinkedAssistant = { role: 'assistant', storageId: 'tool-linked', content: [], tool_call_id: 'call-a' }
assert.equal(
  resolveSafeConversationMutationTarget([toolLinkedAssistant], [toolLinkedAssistant], 0),
  -1,
  'tool-linked assistant rows must remain fail-closed'
)

console.log('Plugin conversation message target regression passed')
