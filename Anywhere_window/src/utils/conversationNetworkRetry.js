export const MAX_AUTOMATIC_NETWORK_RETRIES = 3

function createAbortError() {
  if (typeof DOMException === 'function') return new DOMException('The operation was aborted.', 'AbortError')
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

export function isRetryableNetworkError(error) {
  const name = String(error?.name || '').toLowerCase()
  const message = String(error?.message || error || '').toLowerCase()
  if (name === 'aborterror' || /\babort(?:ed|ing)?\b/.test(message)) return false
  // Authentication, request validation and explicit client errors must remain terminal.
  if (/(?:^|\D)4\d{2}(?:\D|$)/.test(message)) return false
  return /(network\s*error|failed to fetch|fetch failed|socket hang up|econnreset|econnrefused|enotfound|etimedout|und_err_|connection[^\n]*(?:reset|refused|closed|lost|failed|timed out)|network[^\n]*(?:unavailable|failed)|request[^\n]*(?:timed out|timeout)|\btimeout\b)/i.test(message)
}

export function getNetworkRetryDelayMs(retryAttempt = 1) {
  const attempt = Math.max(1, Math.floor(Number(retryAttempt) || 1))
  return Math.min(4_000, 1_000 * (2 ** (attempt - 1)))
}

export async function waitForNetworkRetryDelay(delayMs, signal) {
  if (signal?.aborted) throw createAbortError()
  const duration = Math.max(0, Number(delayMs) || 0)
  if (duration === 0) return
  await new Promise((resolve, reject) => {
    const timer = setTimeout(cleanupAndResolve, duration)
    const onAbort = () => {
      cleanup()
      reject(createAbortError())
    }
    function cleanup() {
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
    }
    function cleanupAndResolve() {
      cleanup()
      resolve()
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

async function scheduleRetry(error, retryAttempt, {
  maxRetries = MAX_AUTOMATIC_NETWORK_RETRIES,
  signal = null,
  onRetry = null,
  wait = waitForNetworkRetryDelay
} = {}) {
  if (signal?.aborted || !isRetryableNetworkError(error) || retryAttempt > maxRetries) return false
  const delayMs = getNetworkRetryDelayMs(retryAttempt)
  await onRetry?.({ error, retryAttempt, maxRetries, delayMs })
  await wait(delayMs, signal)
  return true
}

export async function runWithNetworkRetries(execute, options = {}) {
  if (typeof execute !== 'function') throw new TypeError('network_retry_executor_required')
  const maxRetries = Number.isFinite(Number(options.maxRetries))
    ? Math.max(0, Math.floor(Number(options.maxRetries)))
    : MAX_AUTOMATIC_NETWORK_RETRIES
  let retryAttempt = 0
  while (true) {
    if (options.signal?.aborted) throw createAbortError()
    try {
      return await execute()
    } catch (error) {
      retryAttempt += 1
      if (!await scheduleRetry(error, retryAttempt, { ...options, maxRetries })) throw error
    }
  }
}

export async function* createNetworkRetryingStream(createStream, {
  isMeaningfulChunk = () => true,
  ...options
} = {}) {
  if (typeof createStream !== 'function') throw new TypeError('network_retry_stream_factory_required')
  const maxRetries = Number.isFinite(Number(options.maxRetries))
    ? Math.max(0, Math.floor(Number(options.maxRetries)))
    : MAX_AUTOMATIC_NETWORK_RETRIES
  let retryAttempt = 0
  let receivedMeaningfulOutput = false
  while (true) {
    if (options.signal?.aborted) throw createAbortError()
    try {
      const stream = await createStream()
      for await (const chunk of stream) {
        if (isMeaningfulChunk(chunk)) receivedMeaningfulOutput = true
        yield chunk
      }
      return
    } catch (error) {
      retryAttempt += 1
      if (receivedMeaningfulOutput || !await scheduleRetry(error, retryAttempt, { ...options, maxRetries })) throw error
    }
  }
}
