// Observe Sub-Agent requests without imposing a deadline beyond the shared main-chat transport.
function formatSubAgentError(error, apiKey = '') {
  const status = Number(error?.status || error?.response?.status)
  const code = String(error?.code || error?.cause?.code || error?.name || 'request_failed')
  const category = status === 401 ? 'unauthorized' : status === 429 ? 'rate_limited'
    : status >= 500 ? 'provider_error' : /timeout|timedout/i.test(code) ? 'timeout'
      : /connection|network|fetch|econn|enet|socket/i.test(code + ' ' + (error?.message || '')) ? 'network_error' : 'request_failed'
  let message = String(error?.message || (typeof error === 'string' ? error : 'No error detail available'))
  for (const secret of String(apiKey).split(/[\s,]+/).filter(Boolean)) message = message.split(secret).join('[REDACTED]')
  message = message.replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [REDACTED]').replace(/sk-[\w-]+/g, '[REDACTED]')
  return `${Number.isFinite(status) && status >= 100 ? `HTTP ${status} / ` : ''}${category} (${code}): ${message.slice(0, 1000)}`
}

async function requestSubAgentCompletion(request, params, log, { progressMs = 15_000 } = {}) {
  const controller = new AbortController()
  const started = Date.now()
  const parentSignal = params.signal
  let progress, onAbort
  const interrupted = new Promise((_, reject) => {
    onAbort = () => {
      const error = new Error('Sub-Agent execution aborted by user.')
      error.name = 'AbortError'
      reject(error)
      controller.abort(error)
    }
    if (parentSignal?.aborted) { onAbort(); return }
    parentSignal?.addEventListener('abort', onAbort, { once: true })
  })
  log('[Request] Waiting for model response; using the main-chat transport/SDK policy, with no extra Sub-Agent time limit.')
  progress = setInterval(() => log(`[Waiting] Model response pending for ${Math.floor((Date.now() - started) / 1000)}s; not stopped.`), progressMs)
  progress.unref?.()
  try {
    const result = await Promise.race([
      interrupted,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw controller.signal.reason
        return request({ ...params, signal: controller.signal })
      })
    ])
    log(`[Response] Model responded after ${((Date.now() - started) / 1000).toFixed(1)}s.`)
    return result
  } catch (error) {
    if (parentSignal?.aborted) log('[Stop] Model request cancelled by user.')
    else log(`[Request Failed] ${formatSubAgentError(error, params.apiKey)}`)
    throw error
  } finally {
    clearInterval(progress)
    parentSignal?.removeEventListener('abort', onAbort)
  }
}

module.exports = { formatSubAgentError, requestSubAgentCompletion };
