const crypto = require('node:crypto')

/** Window-bound admission receipts; dispatch alone is not task execution. */
function createConversationTaskDelivery({send, timeoutMs = 30000}) {
  const pending = new Map()
  function complete(windowId, result = {}) {
    const entry = pending.get(result.requestId)
    if (!entry || entry.windowId !== windowId || entry.conversationId !== result.conversationId || Date.now() >= entry.expiresAt) return {ok: false}
    pending.delete(result.requestId)
    clearTimeout(entry.timer)
    entry.resolve({ok: result.ok === true, reason: typeof result.reason === 'string' ? result.reason : 'task_not_accepted'})
    return {ok: true}
  }
  async function deliver(windowId, task) {
    const requestId = crypto.randomUUID()
    const expiresAt = Date.now() + timeoutMs
    let entry
    const received = new Promise(resolve => {
      entry = {windowId, conversationId: task.conversationId, expiresAt, resolve,
        timer: setTimeout(() => {pending.delete(requestId); resolve({ok: false, reason: 'task_receipt_timeout'})}, timeoutMs)}
      pending.set(requestId, entry)
    })
    try {
      const result = await send(windowId, {...task, requestId, expiresAt})
      if (result?.ok === false) throw new Error('task_dispatch_failed')
    } catch {
      if (pending.get(requestId) === entry) {pending.delete(requestId); clearTimeout(entry.timer); entry.resolve({ok: false, reason: 'task_dispatch_failed'})}
    }
    return received
  }
  return {deliver, complete}
}

module.exports = {createConversationTaskDelivery}
