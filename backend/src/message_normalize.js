// Endpoint-neutral normalization for the app's internal OpenAI-style transcript.
// Strict tool protocols require every function call to receive one matching result.
const MISSING_TOOL_RESULT = '[System Note]: Tool call was cancelled or its historical result was unavailable.';

function normalizeToolCallHistory(messages = []) {
  if (!Array.isArray(messages)) return [];

  const normalized = [];
  let pendingCalls = new Map();

  const flushPendingCalls = () => {
    for (const call of pendingCalls.values()) {
      normalized.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function?.name || call.name || '',
        content: MISSING_TOOL_RESULT
      });
    }
    pendingCalls = new Map();
  };

  for (const rawMessage of messages) {
    if (!rawMessage || typeof rawMessage !== 'object') continue;
    const message = { ...rawMessage };

    if (message.role === 'tool') {
      const callId = typeof message.tool_call_id === 'string' ? message.tool_call_id : '';
      if (callId && pendingCalls.has(callId)) {
        normalized.push(message);
        pendingCalls.delete(callId);
      }
      // Orphan results cannot be sent to strict endpoint protocols.
      continue;
    }

    if (pendingCalls.size > 0) flushPendingCalls();

    normalized.push(message);
    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        const callId = typeof toolCall?.id === 'string' ? toolCall.id : '';
        if (callId && !pendingCalls.has(callId)) pendingCalls.set(callId, toolCall);
      }
    }
  }

  if (pendingCalls.size > 0) flushPendingCalls();
  return normalized;
}

module.exports = {
  MISSING_TOOL_RESULT,
  normalizeToolCallHistory
};
