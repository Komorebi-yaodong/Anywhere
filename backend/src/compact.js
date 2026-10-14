const { encode } = require('gpt-tokenizer')
const { createChatCompletion } = require('./chat.js')


const COMPACT_CACHE_DOC_ID = 'conversation_compact_cache'
const DEFAULT_CONTEXT_LENGTH = 256 * 1024
const DEFAULT_TRIGGER_RATIO = 0.9
const DEFAULT_KEEP_RECENT_ROUNDS = 3

const DEFAULT_COMPACT_TOTAL_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_COMPACT_STREAM_IDLE_TIMEOUT_MS = 2 * 60 * 1000

function getToolCallIds(message = {}) {
  if (message?.role !== 'assistant' || !Array.isArray(message?.tool_calls)) return []
  return message.tool_calls
    .map((call) => String(call?.id || call?.tool_call_id || '').trim())
    .filter(Boolean)
}

function selectNearestCut(candidates = [], { minTokens = -Infinity, maxTokens = Infinity, preferLower = true } = {}) {
  let selected = null
  for (const candidate of candidates) {
    if (candidate.tokens < minTokens || candidate.tokens > maxTokens) continue
    if (!selected) {
      selected = candidate
      continue
    }
    const isBetter = preferLower
      ? candidate.tokens < selected.tokens || (candidate.tokens === selected.tokens && candidate.cutIndex < selected.cutIndex)
      : candidate.tokens > selected.tokens || (candidate.tokens === selected.tokens && candidate.cutIndex > selected.cutIndex)
    if (isBetter) selected = candidate
  }
  return selected
}

function selectCompactionCut({
  systemMessages = [],
  windowMessages = [],
  thresholdTokens = 0,
  preferredMaxTokens = 0,
  keepRecentRounds = 0,
  fixedOverheadTokens = 0,
  modelInput = '',
  includeCandidates = false
} = {}) {
  const system = Array.isArray(systemMessages) ? systemMessages : []
  const window = Array.isArray(windowMessages) ? windowMessages : []
  const threshold = Math.max(1, Math.floor(Number(thresholdTokens) || 0))
  const preferredMax = Math.max(threshold, Math.floor(Number(preferredMaxTokens) || threshold))
  if (window.length < 2 || threshold <= 0) return { cutIndex: 0, strategy: 'none', candidates: [] }

  const userStarts = window
    .map((message, index) => (message?.role === 'user' && index > 0 ? index : -1))
    .filter((index) => index > 0)
  const allUserStarts = window
    .map((message, index) => (message?.role === 'user' ? index : -1))
    .filter((index) => index >= 0)
  const aiUnitStarts = window
    .map((message, index) => (message?.role === 'assistant' && index > 0 ? index : -1))
    .filter((index) => index > 0)
  const requestedKeepRounds = Math.max(0, Math.floor(Number(keepRecentRounds) || 0))
  const hasEnoughUserRounds = requestedKeepRounds === 0 || allUserStarts.length >= requestedKeepRounds
  const retainedUnitStarts = hasEnoughUserRounds ? allUserStarts : aiUnitStarts
  const preserveFrom = requestedKeepRounds > 0 && retainedUnitStarts.length >= requestedKeepRounds
    ? retainedUnitStarts[retainedUnitStarts.length - requestedKeepRounds]
    : 0
  const retentionKind = hasEnoughUserRounds ? 'user' : 'ai'

  const userStartSet = new Set(userStarts)
  const pendingToolCallIds = new Set()
  const baseTokens = estimateMessagesTokens(system, { modelInput }) + Math.max(0, Number(fixedOverheadTokens) || 0)
  let prefixTokens = baseTokens
  const candidates = []
  for (let cutIndex = 1; cutIndex < window.length; cutIndex += 1) {
    const previousMessage = window[cutIndex - 1]
    prefixTokens += estimateMessagesTokens([previousMessage], { modelInput })
    for (const toolCallId of getToolCallIds(previousMessage)) pendingToolCallIds.add(toolCallId)
    if (previousMessage?.role === 'tool') {
      const toolCallId = String(previousMessage?.tool_call_id || previousMessage?.toolCallId || '').trim()
      if (toolCallId) pendingToolCallIds.delete(toolCallId)
    }
    if (pendingToolCallIds.size > 0 || window[cutIndex]?.role === 'tool') continue
    candidates.push({
      cutIndex,
      tokens: prefixTokens,
      isUserRoundBoundary: userStartSet.has(cutIndex),
      preservesRequestedRounds: preserveFrom > 0 && cutIndex <= preserveFrom,
      retentionKind
    })
  }
  if (!candidates.length) return { cutIndex: 0, strategy: 'none', candidates: [] }

  const pickWithin = (items, minTokens, maxTokens, strategy, preferLower) => {
    const matching = selectNearestCut(items, { minTokens, maxTokens, preferLower })
    return matching ? { ...matching, strategy } : null
  }
  const preferredRounds = candidates.filter((candidate) => candidate.isUserRoundBoundary && candidate.preservesRequestedRounds)
  const userRound = candidates.filter((candidate) => candidate.isUserRoundBoundary)
  const preservedSafe = candidates.filter((candidate) => candidate.preservesRequestedRounds)
  const retainedUnitLabel = retentionKind === 'user' ? 'user_round' : 'ai_unit'

  // The configured threshold window is authoritative. Keeping recent units only ranks
  // candidates inside it; it cannot force a much earlier cut when a safe 80~90%/90~95% cut exists.
  const selected = retentionKind === 'user'
    ? (
        pickWithin(preferredRounds, threshold, preferredMax, 'user_round_keep', true)
        || pickWithin(userRound, threshold, preferredMax, 'user_round_adaptive', true)
        || pickWithin(preservedSafe, threshold, preferredMax, 'safe_keep', true)
        || pickWithin(candidates, threshold, preferredMax, 'safe_adaptive', true)
        || pickWithin(preferredRounds, -Infinity, threshold, 'user_round_keep_threshold_fallback', false)
        || pickWithin(userRound, -Infinity, threshold, 'user_round_adaptive_threshold_fallback', false)
        || pickWithin(preservedSafe, -Infinity, threshold, 'safe_keep_threshold_fallback', false)
        || pickWithin(candidates, -Infinity, threshold, 'safe_adaptive_threshold_fallback', false)
      )
    : (
        pickWithin(preservedSafe, threshold, preferredMax, `${retainedUnitLabel}_keep`, true)
        || pickWithin(candidates, threshold, preferredMax, 'safe_adaptive', true)
        || pickWithin(preservedSafe, -Infinity, threshold, `${retainedUnitLabel}_keep_threshold_fallback`, false)
        || pickWithin(candidates, -Infinity, threshold, 'safe_adaptive_threshold_fallback', false)
      )
  return selected
    ? { ...selected, ...(includeCandidates ? { candidates } : {}) }
    : { cutIndex: 0, strategy: 'none', ...(includeCandidates ? { candidates } : {}) }
}

function createCompactionTimeoutContext(upstreamSignal = null, {
  totalTimeoutMs = DEFAULT_COMPACT_TOTAL_TIMEOUT_MS,
  idleTimeoutMs = DEFAULT_COMPACT_STREAM_IDLE_TIMEOUT_MS
} = {}) {
  const controller = new AbortController()
  let timeoutCode = ''
  let totalTimer = null
  let idleTimer = null
  const abortWith = (code, reason = null) => {
    if (controller.signal.aborted) return
    timeoutCode = code || ''
    try { controller.abort(reason || new Error(code)) } catch { controller.abort() }
  }
  const forwardAbort = () => abortWith('', upstreamSignal?.reason)
  if (upstreamSignal) {
    if (upstreamSignal.aborted) forwardAbort()
    else upstreamSignal.addEventListener('abort', forwardAbort, { once: true })
  }
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    const timeout = Math.max(1, Number(idleTimeoutMs) || DEFAULT_COMPACT_STREAM_IDLE_TIMEOUT_MS)
    idleTimer = setTimeout(() => abortWith('compact_stream_idle_timeout', new Error(`compact_stream_idle_timeout_${timeout}ms`)), timeout)
  }
  const total = Math.max(1, Number(totalTimeoutMs) || DEFAULT_COMPACT_TOTAL_TIMEOUT_MS)
  totalTimer = setTimeout(() => abortWith('compact_request_timeout', new Error(`compact_request_timeout_${total}ms`)), total)
  armIdle()
  return {
    signal: controller.signal,
    touch: armIdle,
    getTimeoutCode: () => timeoutCode,
    cleanup: () => {
      if (totalTimer) clearTimeout(totalTimer)
      if (idleTimer) clearTimeout(idleTimer)
      if (upstreamSignal) upstreamSignal.removeEventListener('abort', forwardAbort)
    }
  }
}

// Structured handoff prompt adapted from local compact skill + Codex-style continuation needs.
const DEFAULT_COMPACT_PROMPT = [
  'You are performing CONTEXT CHECKPOINT COMPACTION for the same conversation thread.',
  'Create an authoritative handoff summary so another model can continue without restarting completed work.',
  'Prioritize actionable task state, exact user requirements, decisions, exact paths, tool results, verification status, unresolved risks, and the immediate next step.',
  'Be concise only after those details are preserved. Do not invent completed work. Mark uncertain details as uncertain.',
  '',
  'Output exactly one markdown document with these sections:',
  '',
  '# Compressed Conversation Handoff',
  '',
  'You are continuing a previous conversation after context compaction. Treat this prompt as the authoritative retained context. Continue from the current task state. Do not restart completed investigation or ask the user to repeat captured information unless a required detail is missing or marked uncertain.',
  '',
  '## Active User Request',
  '- Quote or restate the latest active user request.',
  '- State the immediate outcome the user expects.',
  '',
  '## User Goal',
  '- The broader objective behind the current request.',
  '- Any success criteria the user has stated.',
  '',
  '## Current Agent Role',
  '- Agent name/type and any relevant behavior expectations from the active session.',
  '',
  '## Non-Negotiable User Requirements',
  '- Exact user instructions that still matter.',
  '- Constraints, preferences, prohibitions, language requirements, formatting requirements, and safety boundaries.',
  '',
  '## Decisions And Rationale',
  '- Decisions already made.',
  '- Why those decisions were made, when the rationale matters for continuing correctly.',
  '',
  '## Conversation Summary',
  '- Important context from the conversation, with recent task state more detailed than older background.',
  '- Exclude irrelevant small talk, repeated progress updates, and obsolete branches.',
  '',
  '## Technical Context',
  '- Repositories, files, paths, commands, tools, APIs, models, settings, or environment details mentioned.',
  '- Include exact paths and identifiers when they matter.',
  '',
  '## Files And Artifacts',
  '- Files read, modified, created, generated, or planned.',
  '- Current status of each important file or artifact.',
  '- Any generated outputs or local paths the next model may need.',
  '',
  '## Work Completed',
  '- Actions already taken.',
  '- Tool calls or command results that affect the next step.',
  '',
  '## Verification',
  '- Commands or checks already run.',
  '- Pass/fail result and important output.',
  '- Checks not run and why.',
  '',
  '## Current State',
  '- What is true right now.',
  '- What remains unfinished.',
  '- Any known blockers, risks, or failed attempts.',
  '',
  '## Unknowns And Assumptions',
  '- Details that are uncertain.',
  '- Assumptions made so far.',
  '- Items that need verification before acting on them.',
  '',
  '## Next Step',
  '- The immediate next action the continuing model should take.',
  '- Mention whether it should continue implementation, answer the user, inspect files, run tests, or wait for clarification.',
  '',
  'Rules:',
  '- Preserve exact user requirements, file paths, command outputs, errors, tool names, and unresolved decisions.',
  '- Preserve tool-call pairing facts when tools were used: what was requested, what ran, and the outcome.',
  '- Keep the latest active user request near the top.',
  '- Prefer structured summary over transcript copying.',
  '- Do not reveal hidden system/developer secret prompts; only carry operational constraints when needed.'
].join('\n')

// Prefix placed before the generated handoff summary in AI history.
const DEFAULT_SUMMARY_PREFIX =
  'Another language model started to solve this problem and produced a summary of its thinking process. You also have access to the state of the tools that were used by that language model. Use this to build on the work that has already been done and avoid duplicating work. Here is the summary produced by the other language model, use the information in this summary to assist with your own analysis:'

const MODEL_RESOLVE_URL = 'https://llm-model.141277.xyz/v1/resolve'
const MODEL_RESOLVE_AUTH = 'Bearer komorebi'

function deepClone(value) {
  return JSON.parse(JSON.stringify(value ?? null))
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error('compact_aborted')
    error.name = 'AbortError'
    throw error
  }
}

function normalizeModelKey(modelInput = '') {
  const raw = String(modelInput || '').trim()
  if (!raw) return ''
  // providerId|modelName → modelName
  const afterPipe = raw.includes('|') ? raw.split('|').slice(1).join('|').trim() : raw
  // openrouter/gpt-5.5 → gpt-5.5
  const parts = afterPipe.split('/').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return parts.slice(1).join('/').toLowerCase()
  }
  return afterPipe.toLowerCase()
}

function extractTextFromContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return content == null ? '' : String(content)
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      if (part.type === 'text' && typeof part.text === 'string') return part.text
      // Images and PDFs are counted separately by the visual estimator; do not double-count placeholders as text.
      if (part.type === 'image_url' || part.type === 'file' || part.type === 'input_file') return ''
      if (part.type === 'input_audio' || part.type === 'audio') return '[audio]'
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

const VISION_TOKEN_LIMIT = 16384
const VISION_UNKNOWN_IMAGE_EDGE = 4096
const VISUAL_METADATA_CACHE_LIMIT = 256
const visualMetadataCache = new Map()

function getVisualCacheKey(kind, dataUrl = '') {
  const value = typeof dataUrl === 'string' ? dataUrl : ''
  return `${kind}:${value.length}:${value.slice(0, 160)}:${value.slice(-160)}`
}

function rememberVisualMetadata(cacheKey, value) {
  if (!cacheKey) return value
  visualMetadataCache.delete(cacheKey)
  visualMetadataCache.set(cacheKey, value)
  while (visualMetadataCache.size > VISUAL_METADATA_CACHE_LIMIT) {
    visualMetadataCache.delete(visualMetadataCache.keys().next().value)
  }
  return value
}

function resolveVisionTokenProfile(modelInput = '') {
  const model = String(modelInput || '').toLowerCase()
  // QVQ and Qwen2.5-VL use 28×28 patches; Qwen3-VL and the current Qwen-VL family use 32×32.
  const patchSize = /(qvq|qwen2\.5-vl)/.test(model) ? 28 : 32
  return {
    patchSize,
    minPixels: 4 * patchSize * patchSize,
    maxPixels: VISION_TOKEN_LIMIT * patchSize * patchSize
  }
}

function readUint24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
}

function decodeDataUrlPrefix(dataUrl = '', maxBase64Chars = 65536) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  const header = dataUrl.slice(5, comma)
  const mimeType = header.split(';')[0]?.toLowerCase() || ''
  if (!mimeType || !/;base64(?:;|$)/i.test(header)) return null
  try {
    const source = dataUrl.slice(comma + 1, comma + 1 + maxBase64Chars - (maxBase64Chars % 4))
    return { mimeType, bytes: Buffer.from(source, 'base64') }
  } catch {
    return null
  }
}

function readImageDimensionsFromDataUrl(dataUrl = '') {
  const cacheKey = getVisualCacheKey('image-size', dataUrl)
  if (visualMetadataCache.has(cacheKey)) return visualMetadataCache.get(cacheKey)
  const decoded = decodeDataUrlPrefix(dataUrl)
  const bytes = decoded?.bytes
  if (!bytes || bytes.length < 10) return rememberVisualMetadata(cacheKey, null)
  try {
    if (decoded.mimeType === 'image/png' && bytes.length >= 24 && bytes.subarray(1, 4).toString('ascii') === 'PNG') {
      return rememberVisualMetadata(cacheKey, { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) })
    }
    if (decoded.mimeType === 'image/gif' && bytes.subarray(0, 3).toString('ascii') === 'GIF') {
      return rememberVisualMetadata(cacheKey, { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) })
    }
    if (decoded.mimeType === 'image/webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
      const kind = bytes.subarray(12, 16).toString('ascii')
      if (kind === 'VP8X' && bytes.length >= 30) {
        return rememberVisualMetadata(cacheKey, { width: readUint24LE(bytes, 24) + 1, height: readUint24LE(bytes, 27) + 1 })
      }
      if (kind === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
        return rememberVisualMetadata(cacheKey, { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff })
      }
      if (kind === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
        const bits = bytes.readUInt32LE(21)
        return rememberVisualMetadata(cacheKey, { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 })
      }
    }
    if (decoded.mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
      for (let offset = 2; offset + 9 < bytes.length;) {
        if (bytes[offset] !== 0xff) { offset += 1; continue }
        const marker = bytes[offset + 1]
        const length = bytes.readUInt16BE(offset + 2)
        if (length < 2) break
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
          return rememberVisualMetadata(cacheKey, { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) })
        }
        offset += length + 2
      }
    }
  } catch {
    return rememberVisualMetadata(cacheKey, null)
  }
  return rememberVisualMetadata(cacheKey, null)
}

function estimatePdfPageCountFromDataUrl(dataUrl = '') {
  const cacheKey = getVisualCacheKey('pdf-pages', dataUrl)
  const cached = visualMetadataCache.get(cacheKey)
  if (Number.isFinite(cached) && cached > 0) return cached
  if (typeof dataUrl !== 'string' || !/^data:application\/pdf(?:;[^,]*)?;base64,/i.test(dataUrl)) return 1
  const base64Start = dataUrl.indexOf(',') + 1
  if (base64Start <= 0 || base64Start >= dataUrl.length) return 1
  try {
    const chunkChars = 64 * 1024
    let carry = ''
    let pageObjects = 0
    let maxPageTreeCount = 0
    for (let offset = base64Start; offset < dataUrl.length; offset += chunkChars) {
      const chunk = Buffer.from(dataUrl.slice(offset, offset + chunkChars), 'base64').toString('latin1')
      const source = carry + chunk
      for (const match of source.matchAll(/\/Type\s*\/Page\b/g)) {
        if (match.index + match[0].length > carry.length) pageObjects += 1
      }
      for (const match of source.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,256}?\/Count\s+(\d+)/g)) {
        if (match.index + match[0].length > carry.length) maxPageTreeCount = Math.max(maxPageTreeCount, Number(match[1]) || 0)
      }
      carry = source.slice(-512)
    }
    return rememberVisualMetadata(cacheKey, Math.max(1, pageObjects, maxPageTreeCount))
  } catch {
    return rememberVisualMetadata(cacheKey, 1)
  }
}


function estimateVisualImageTokens({ width, height, modelInput = '' } = {}) {
  const profile = resolveVisionTokenProfile(modelInput)
  const sourceWidth = Math.max(1, Math.floor(Number(width) || VISION_UNKNOWN_IMAGE_EDGE))
  const sourceHeight = Math.max(1, Math.floor(Number(height) || VISION_UNKNOWN_IMAGE_EDGE))
  const { patchSize, minPixels, maxPixels } = profile
  let normalizedWidth = Math.max(patchSize, Math.round(sourceWidth / patchSize) * patchSize)
  let normalizedHeight = Math.max(patchSize, Math.round(sourceHeight / patchSize) * patchSize)
  const pixels = normalizedWidth * normalizedHeight
  if (pixels > maxPixels) {
    const beta = Math.sqrt((sourceWidth * sourceHeight) / maxPixels)
    normalizedWidth = Math.max(patchSize, Math.floor(sourceWidth / beta / patchSize) * patchSize)
    normalizedHeight = Math.max(patchSize, Math.floor(sourceHeight / beta / patchSize) * patchSize)
  } else if (pixels < minPixels) {
    const beta = Math.sqrt(minPixels / Math.max(1, sourceWidth * sourceHeight))
    normalizedWidth = Math.max(patchSize, Math.ceil(sourceWidth * beta / patchSize) * patchSize)
    normalizedHeight = Math.max(patchSize, Math.ceil(sourceHeight * beta / patchSize) * patchSize)
  }
  return Math.floor((normalizedWidth * normalizedHeight) / (patchSize * patchSize)) + 2
}

function getPartTokenEstimate(part = {}) {
  if (!part || typeof part !== 'object') return {}
  const imageMeta = part?.image_url && typeof part.image_url === 'object' ? part.image_url.tokenEstimate : null
  const fileMeta = part?.file && typeof part.file === 'object' ? part.file.tokenEstimate : null
  return part.tokenEstimate || imageMeta || fileMeta || {}
}

function estimateMultimodalContentTokens(content, modelInput = '') {
  if (!Array.isArray(content)) return 0
  let total = 0
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    if (part.type === 'image_url') {
      const source = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url
      const metadata = getPartTokenEstimate(part)
      const dimensions = Number(metadata?.width) > 0 && Number(metadata?.height) > 0
        ? { width: Number(metadata.width), height: Number(metadata.height) }
        : readImageDimensionsFromDataUrl(source)
      total += estimateVisualImageTokens({ ...dimensions, modelInput })
      continue
    }
    if (part.type === 'file' || part.type === 'input_file') {
      const file = part.file || part
      const isPdf = /^application\/pdf(?:;|$)/i.test(String(file?.mimeType || file?.type || ''))
        || /^data:application\/pdf;base64,/i.test(String(file?.file_data || file?.url || ''))
        || /\.pdf$/i.test(String(file?.filename || file?.name || ''))
      if (!isPdf) continue
      const metadata = getPartTokenEstimate(part)
      const source = String(file?.file_data || file?.url || '')
      const pageCount = Math.max(1, Math.floor(Number(metadata?.pageCount || metadata?.pages) || estimatePdfPageCountFromDataUrl(source)))
      // PDF pages are sent to vision-capable models as image-like document pages. Estimate each page at the configured high-resolution cap.
      total += pageCount * estimateVisualImageTokens({ width: VISION_UNKNOWN_IMAGE_EDGE, height: VISION_UNKNOWN_IMAGE_EDGE, modelInput })
    }
  }
  return total
}


function messageToPlainText(message = {}) {
  const role = message?.role || 'unknown'
  const text = extractTextFromContent(message?.content)
  const reasoning = typeof message?.reasoning_content === 'string' ? message.reasoning_content : ''
  const toolCalls = Array.isArray(message?.tool_calls)
    ? message.tool_calls
        .map((call) => {
          const name = call?.function?.name || call?.name || 'tool'
          const args = call?.function?.arguments || call?.arguments || ''
          return `[tool_call ${name}] ${args}`
        })
        .join('\n')
    : ''
  return [role, text, reasoning, toolCalls].filter(Boolean).join('\n')
}

function estimateMessagesTokens(messages = [], { modelInput = '' } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) return 0
  let total = 0
  for (const message of messages) {
    const text = messageToPlainText(message)
    if (text) {
      try {
        total += encode(text).length
      } catch {
        total += Math.ceil(text.length / 4)
      }
    }
    total += estimateMultimodalContentTokens(message?.content, modelInput)
  }
  // small per-message overhead
  total += messages.length * 4
  return total
}

function estimateTextTokens(text = '') {
  const value = String(text || '')
  if (!value) return 0
  try {
    return encode(value).length
  } catch {
    return Math.ceil(value.length / 4)
  }
}

function resolveEffectiveTokenUsage({ localTokens = 0, usageTotalTokens = null } = {}) {
  const local = Number.isFinite(Number(localTokens)) ? Math.max(0, Math.floor(Number(localTokens))) : 0
  const usage = Number.isFinite(Number(usageTotalTokens)) ? Math.max(0, Math.floor(Number(usageTotalTokens))) : null
  if (usage == null || usage <= 0) {
    return { tokens: local, source: 'local', localTokens: local, usageTotalTokens: usage }
  }
  if (local <= 0) {
    return { tokens: usage, source: 'usage', localTokens: local, usageTotalTokens: usage }
  }
  const diff = Math.abs(usage - local)
  if (diff > local * 0.8) {
    return { tokens: local, source: 'local_divergence', localTokens: local, usageTotalTokens: usage }
  }
  return { tokens: usage, source: 'usage', localTokens: local, usageTotalTokens: usage }
}

function defaultModelCacheEntry(modelKey = '', patch = {}) {
  return {
    modelKey,
    contextLength: DEFAULT_CONTEXT_LENGTH,
    contextLengthSource: 'default',
    // When true, manual contextLength must not be overwritten by API resolve.
    contextLengthManual: false,
    resolvedId: modelKey,
    autoCompactEnabled: true,
    triggerRatio: DEFAULT_TRIGGER_RATIO,
    keepRecentRounds: DEFAULT_KEEP_RECENT_ROUNDS,
    hideCompactedMessages: true,
    compactPrompt: DEFAULT_COMPACT_PROMPT,
    summaryPrefix: DEFAULT_SUMMARY_PREFIX,
    updatedAt: Date.now(),
    ...patch
  }
}

async function readCompactCacheDoc() {
  let doc = await utools.db.promises.get(COMPACT_CACHE_DOC_ID)
  if (!doc) {
    doc = { _id: COMPACT_CACHE_DOC_ID, models: {} }
    const putResult = await utools.db.promises.put(doc)
    if (putResult && putResult.rev) doc._rev = putResult.rev
    return doc
  }
  // Support both shapes: { models } at root or { data: { models } }
  if (!doc.models || typeof doc.models !== 'object') {
    if (doc.data && typeof doc.data === 'object' && doc.data.models && typeof doc.data.models === 'object') {
      doc.models = doc.data.models
    } else {
      doc.models = {}
    }
  }
  return doc
}

async function writeCompactCacheDoc(doc) {
  const payload = {
    _id: COMPACT_CACHE_DOC_ID,
    models: doc.models || {},
    data: { models: doc.models || {} }
  }
  if (doc._rev) payload._rev = doc._rev
  const result = await utools.db.promises.put(payload)
  if (result && result.rev) {
    doc._rev = result.rev
  }
  if (result && result.error) {
    throw new Error(result.message || result.error || 'compact_cache_write_failed')
  }
  return result
}

async function getCompactCacheSnapshot() {
  const doc = await readCompactCacheDoc()
  return {
    ok: true,
    models: deepClone(doc.models || {})
  }
}

/**
 * Import compact model cache entries (for config export/import & WebDAV restore).
 * Merges by modelKey; imported entries overwrite same-key local entries.
 */
async function importCompactCacheModels(modelsInput = {}) {
  const incoming = modelsInput && typeof modelsInput === 'object' && !Array.isArray(modelsInput)
    ? modelsInput
    : {}
  const keys = Object.keys(incoming)
  if (keys.length === 0) {
    return { ok: true, updated: 0, models: (await getCompactCacheSnapshot()).models }
  }

  const doc = await readCompactCacheDoc()
  if (!doc.models || typeof doc.models !== 'object') doc.models = {}

  let updated = 0
  for (const rawKey of keys) {
    const entry = incoming[rawKey]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const modelKey = normalizeModelKey(entry.modelKey || rawKey)
    if (!modelKey) continue
    const previous = doc.models[modelKey] || defaultModelCacheEntry(modelKey)
    const next = {
      ...defaultModelCacheEntry(modelKey),
      ...previous,
      ...deepClone(entry),
      modelKey,
      updatedAt: Date.now()
    }
    if (Number.isFinite(Number(next.contextLength))) {
      next.contextLength = Math.max(1024, Math.floor(Number(next.contextLength)))
    } else {
      next.contextLength = DEFAULT_CONTEXT_LENGTH
    }
    if (Number.isFinite(Number(next.triggerRatio))) {
      next.triggerRatio = Math.min(0.99, Math.max(0.1, Number(next.triggerRatio)))
    } else {
      next.triggerRatio = DEFAULT_TRIGGER_RATIO
    }
    // Legacy field: user-message budget is no longer used; remove it from imported caches.
    if (Object.prototype.hasOwnProperty.call(next, 'userMessageTokenBudget')) {
      delete next.userMessageTokenBudget
    }
    if (Number.isFinite(Number(next.keepRecentRounds))) {
      next.keepRecentRounds = Math.max(0, Math.floor(Number(next.keepRecentRounds)))
    } else {
      next.keepRecentRounds = DEFAULT_KEEP_RECENT_ROUNDS
    }
    next.autoCompactEnabled = next.autoCompactEnabled !== false
    next.contextLengthManual = next.contextLengthManual === true || next.contextLengthSource === 'manual'
    next.compactPrompt = typeof next.compactPrompt === 'string' && next.compactPrompt.trim()
      ? next.compactPrompt
      : DEFAULT_COMPACT_PROMPT
    next.summaryPrefix = typeof next.summaryPrefix === 'string' && next.summaryPrefix.trim()
      ? next.summaryPrefix
      : DEFAULT_SUMMARY_PREFIX
    if (Object.prototype.hasOwnProperty.call(next, 'fallbackModel')) {
      delete next.fallbackModel
    }
    doc.models[modelKey] = next
    updated += 1
  }

  await writeCompactCacheDoc(doc)
  return {
    ok: true,
    updated,
    models: deepClone(doc.models || {})
  }
}

async function getModelCompactConfig(modelInput = '') {
  const modelKey = normalizeModelKey(modelInput)
  if (!modelKey) {
    return {
      ok: true,
      modelKey: '',
      config: defaultModelCacheEntry('')
    }
  }
  const doc = await readCompactCacheDoc()
  const existing = doc.models?.[modelKey]
  if (!existing) {
    return {
      ok: true,
      modelKey,
      config: defaultModelCacheEntry(modelKey)
    }
  }

  const config = deepClone({ ...defaultModelCacheEntry(modelKey), ...existing, modelKey })
  // Do not expose retired user-message budget from legacy cache records.
  if (Object.prototype.hasOwnProperty.call(config, 'userMessageTokenBudget')) {
    delete config.userMessageTokenBudget
  }

  // 旧默认 keepRecentRounds=0 → 迁移为新默认 3；用户显式保存过则保留
  if (
    config.keepRecentRoundsUserSet !== true
    && (!Object.prototype.hasOwnProperty.call(existing, 'keepRecentRounds')
      || Number(existing.keepRecentRounds) === 0)
  ) {
    config.keepRecentRounds = DEFAULT_KEEP_RECENT_ROUNDS
  }

  return {
    ok: true,
    modelKey,
    config
  }
}

async function updateModelCompactConfig(modelInput = '', patch = {}) {
  const modelKey = normalizeModelKey(modelInput)
  if (!modelKey) throw new Error('model_key_required')

  const doc = await readCompactCacheDoc()
  const previous = doc.models?.[modelKey] || defaultModelCacheEntry(modelKey)
  const next = {
    ...defaultModelCacheEntry(modelKey),
    ...previous,
    ...deepClone(patch || {}),
    modelKey,
    updatedAt: Date.now()
  }

  if (Number.isFinite(Number(next.contextLength))) {
    next.contextLength = Math.max(1024, Math.floor(Number(next.contextLength)))
  } else {
    next.contextLength = DEFAULT_CONTEXT_LENGTH
  }
  if (Number.isFinite(Number(next.triggerRatio))) {
    next.triggerRatio = Math.min(0.99, Math.max(0.1, Number(next.triggerRatio)))
  } else {
    next.triggerRatio = DEFAULT_TRIGGER_RATIO
  }
  // Legacy field: user-message budget is no longer used; remove it from persisted model config.
  if (Object.prototype.hasOwnProperty.call(next, 'userMessageTokenBudget')) {
    delete next.userMessageTokenBudget
  }
  if (Number.isFinite(Number(next.keepRecentRounds))) {
    next.keepRecentRounds = Math.max(0, Math.floor(Number(next.keepRecentRounds)))
  } else {
    next.keepRecentRounds = DEFAULT_KEEP_RECENT_ROUNDS
  }
  // 只要写过 keepRecentRounds（含 0），视为用户意图，之后不再自动迁移
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'keepRecentRounds')) {
    next.keepRecentRoundsUserSet = true
  } else if (previous.keepRecentRoundsUserSet === true) {
    next.keepRecentRoundsUserSet = true
  }
  next.autoCompactEnabled = next.autoCompactEnabled !== false
  next.contextLengthManual = next.contextLengthManual === true
  next.compactPrompt = typeof next.compactPrompt === 'string' && next.compactPrompt.trim()
    ? next.compactPrompt
    : DEFAULT_COMPACT_PROMPT
  next.summaryPrefix = typeof next.summaryPrefix === 'string' && next.summaryPrefix.trim()
    ? next.summaryPrefix
    : DEFAULT_SUMMARY_PREFIX
  // legacy field: drop fallback model if present in old caches
  if (Object.prototype.hasOwnProperty.call(next, 'fallbackModel')) {
    delete next.fallbackModel
  }

  // If caller updates contextLength without explicitly saying source, treat as manual override.
  if (
    patch &&
    Object.prototype.hasOwnProperty.call(patch, 'contextLength') &&
    !Object.prototype.hasOwnProperty.call(patch, 'contextLengthManual') &&
    patch.contextLengthSource !== 'api' &&
    patch.contextLengthSource !== 'default'
  ) {
    next.contextLengthManual = true
    if (!next.contextLengthSource || next.contextLengthSource === 'api' || next.contextLengthSource === 'default') {
      next.contextLengthSource = 'manual'
    }
  }
  if (patch?.contextLengthSource === 'manual') {
    next.contextLengthManual = true
  }
  if (patch?.contextLengthSource === 'api' && patch?.contextLengthManual !== true) {
    next.contextLengthManual = false
  }

  doc.models[modelKey] = next
  await writeCompactCacheDoc(doc)
  return { ok: true, modelKey, config: deepClone(next) }
}


/**
 * Apply shared advanced compact settings to every cached model entry.
 * Does NOT overwrite per-model contextLength / resolvedId / logos.
 */
async function applyAdvancedCompactConfigToAll(patch = {}) {
  const doc = await readCompactCacheDoc()
  const models = doc.models && typeof doc.models === 'object' ? doc.models : {}
  const keys = Object.keys(models)
  if (keys.length === 0) {
    return { ok: true, updated: 0, models: {} }
  }

  const source = deepClone(patch || {})
  // Only propagate shared advanced fields; keep model-specific window length intact.
  const shared = {}
  if (Object.prototype.hasOwnProperty.call(source, 'autoCompactEnabled')) {
    shared.autoCompactEnabled = source.autoCompactEnabled !== false
  }
  if (Object.prototype.hasOwnProperty.call(source, 'triggerRatio')) {
    const ratio = Number(source.triggerRatio)
    if (Number.isFinite(ratio)) shared.triggerRatio = Math.min(0.99, Math.max(0.1, ratio))
  }
  if (Object.prototype.hasOwnProperty.call(source, 'keepRecentRounds')) {
    const rounds = Number(source.keepRecentRounds)
    if (Number.isFinite(rounds)) shared.keepRecentRounds = Math.max(0, Math.floor(rounds))
  }
  if (Object.prototype.hasOwnProperty.call(source, 'hideCompactedMessages')) {
    shared.hideCompactedMessages = source.hideCompactedMessages !== false
  }
  if (Object.prototype.hasOwnProperty.call(source, 'compactPrompt')) {
    shared.compactPrompt = typeof source.compactPrompt === 'string' && source.compactPrompt.trim()
      ? source.compactPrompt
      : DEFAULT_COMPACT_PROMPT
  }
  if (Object.prototype.hasOwnProperty.call(source, 'summaryPrefix')) {
    shared.summaryPrefix = typeof source.summaryPrefix === 'string' && source.summaryPrefix.trim()
      ? source.summaryPrefix
      : DEFAULT_SUMMARY_PREFIX
  }

  if (Object.keys(shared).length === 0) {
    return { ok: true, updated: 0, models: deepClone(models) }
  }

  let updated = 0
  for (const key of keys) {
    const previous = models[key] && typeof models[key] === 'object'
      ? models[key]
      : defaultModelCacheEntry(key)
    const next = {
      ...defaultModelCacheEntry(key),
      ...previous,
      ...shared,
      modelKey: key,
      // preserve model-specific window settings
      contextLength: previous.contextLength,
      contextLengthSource: previous.contextLengthSource,
      contextLengthManual: previous.contextLengthManual === true,
      resolvedId: previous.resolvedId || key,
      updatedAt: Date.now()
    }
    if (Object.prototype.hasOwnProperty.call(next, 'userMessageTokenBudget')) {
      delete next.userMessageTokenBudget
    }
    models[key] = next
    updated += 1
  }

  doc.models = models
  await writeCompactCacheDoc(doc)
  return {
    ok: true,
    updated,
    models: deepClone(models)
  }
}

async function pruneCompactCacheByEnabledModels(enabledModelInputs = []) {
  const enabledKeys = new Set(
    (Array.isArray(enabledModelInputs) ? enabledModelInputs : [])
      .map((item) => normalizeModelKey(item))
      .filter(Boolean)
  )
  const doc = await readCompactCacheDoc()
  const models = doc.models || {}
  let removed = 0
  for (const key of Object.keys(models)) {
    if (!enabledKeys.has(key)) {
      delete models[key]
      removed += 1
    }
  }
  doc.models = models
  await writeCompactCacheDoc(doc)
  return { ok: true, removed, remaining: Object.keys(models).length }
}

async function resolveModelContextLength(modelInput = '', options = {}) {
  const modelKey = normalizeModelKey(modelInput)
  const forceRefresh = options?.forceRefresh === true
  // When true (default), preserve manually saved contextLength and do not overwrite with API.
  const preferManual = options?.preferManual !== false
  const existing = await getModelCompactConfig(modelInput)
  const existingConfig = existing?.config || defaultModelCacheEntry(modelKey)
  const hasManualOverride = existingConfig.contextLengthManual === true
    || existingConfig.contextLengthSource === 'manual'

  // Manual value always wins unless caller explicitly asks to overwrite manual.
  if (preferManual && hasManualOverride && Number(existingConfig.contextLength) > 0) {
    return {
      ok: true,
      modelKey: existingConfig.resolvedId || modelKey,
      contextLength: existingConfig.contextLength,
      resolvedId: existingConfig.resolvedId || modelKey,
      source: 'manual',
      config: existingConfig
    }
  }

  if (
    !forceRefresh
    && Number(existingConfig.contextLength) > 0
    && (existingConfig.contextLengthSource === 'api' || existingConfig.contextLengthSource === 'manual')
  ) {
    return {
      ok: true,
      modelKey: existingConfig.resolvedId || modelKey,
      contextLength: existingConfig.contextLength,
      resolvedId: existingConfig.resolvedId || modelKey,
      source: existingConfig.contextLengthSource === 'manual' ? 'manual' : 'cache',
      config: existingConfig
    }
  }

  const queryModel = String(modelInput || '').includes('|')
    ? String(modelInput).split('|').slice(1).join('|')
    : String(modelInput || '')

  let contextLength = DEFAULT_CONTEXT_LENGTH
  let source = 'default'
  let resolvedId = modelKey

  if (queryModel.trim()) {
    try {
      const endpoint = `${MODEL_RESOLVE_URL}?model=${encodeURIComponent(queryModel.trim())}`
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: MODEL_RESOLVE_AUTH,
          Accept: 'application/json'
        }
      })
      const rawText = await response.text()
      let payload = {}
      try {
        payload = rawText ? JSON.parse(rawText) : {}
      } catch {
        payload = {}
      }
      if (response.ok && payload?.status === 'success') {
        const resolved = payload?.resolved || {}
        if (typeof resolved.id === 'string' && resolved.id.trim()) {
          resolvedId = normalizeModelKey(resolved.id)
        } else if (typeof payload?.parsing?.canonical_id === 'string' && payload.parsing.canonical_id.trim()) {
          resolvedId = normalizeModelKey(payload.parsing.canonical_id)
        }
        const length = Number(resolved.context_length)
        if (Number.isFinite(length) && length > 0) {
          contextLength = Math.floor(length)
          source = 'api'
        }
      }
    } catch (error) {
      console.warn('[compact] resolve model context failed:', error)
    }
  }

  // Prefer resolvedId as cache key when API returns a better id.
  const cacheKey = resolvedId || modelKey

  // If there is a manual override and we only needed metadata, keep manual length.
  if (preferManual && hasManualOverride && Number(existingConfig.contextLength) > 0) {
    const savedManual = await updateModelCompactConfig(cacheKey, {
      ...existingConfig,
      modelKey: cacheKey,
      resolvedId: cacheKey,
      contextLength: existingConfig.contextLength,
      contextLengthSource: 'manual',
      contextLengthManual: true
    })
    if (modelKey && modelKey !== cacheKey) {
      await updateModelCompactConfig(modelKey, {
        ...savedManual.config,
        modelKey,
        resolvedId: cacheKey
      })
    }
    return {
      ok: true,
      modelKey: cacheKey,
      contextLength: savedManual.config.contextLength,
      resolvedId: cacheKey,
      source: 'manual',
      config: savedManual.config
    }
  }

  const saved = await updateModelCompactConfig(cacheKey, {
    contextLength,
    contextLengthSource: source,
    contextLengthManual: false,
    resolvedId: cacheKey
  })

  // If original key differs, mirror entry for lookup convenience.
  if (modelKey && modelKey !== cacheKey) {
    await updateModelCompactConfig(modelKey, {
      ...saved.config,
      modelKey,
      resolvedId: cacheKey
    })
  }

  return {
    ok: true,
    modelKey: cacheKey,
    contextLength,
    resolvedId: cacheKey,
    source,
    config: saved.config
  }
}

function getSystemMessages(messages = []) {
  return (Array.isArray(messages) ? messages : []).filter((message) => message?.role === 'system')
}

/**
 * Build the AI-side checkpoint for a compacted prefix.
 * The renderer owns the cascade tail and projects it after the latest summary,
 * so this function must never retain, select, or truncate source user messages.
 */
function buildCompactedHistory({
  messages = [],
  summaryText = '',
  summaryPrefix = DEFAULT_SUMMARY_PREFIX
} = {}) {
  const systemMessages = getSystemMessages(messages).map((message) => deepClone(message))
  const summaryBody = String(summaryText || '').trim() || '(no summary available)'
  const summaryMessage = {
    role: 'user',
    content: `${summaryPrefix}\n${summaryBody}`
  }

  return {
    history: [...systemMessages, summaryMessage],
    summaryMessage
  }
}

function extractAssistantTextFromCompletion(response = {}, apiType = 'chat_completions') {
  if (apiType === 'responses' || apiType === 'codex') {
    if (typeof response?.output_text === 'string' && response.output_text.trim()) {
      return response.output_text.trim()
    }
    if (Array.isArray(response?.output)) {
      return response.output
        .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
        .map((content) => {
          if (content?.type === 'output_text') return String(content.text || '')
          if (content?.type === 'text') return String(content.text || '')
          return ''
        })
        .join('')
        .trim()
    }
  }
  return String(response?.choices?.[0]?.message?.content || '').trim()
}

async function requestSummaryOnce({
  provider,
  modelName,
  messages,
  compactPrompt,
  signal,
  apiType,
  stream = true
}) {
  const promptMessages = [
    ...getSystemMessages(messages).map((message) => deepClone(message)),
    // The caller already provides the compactable prefix below the model threshold.
    // Preserve the entire prefix so early requirements and decisions are summarized.
    ...messages
      .filter((message) => message?.role !== 'system')
      .map((message) => deepClone(message)),
    {
      role: 'user',
      content: compactPrompt || DEFAULT_COMPACT_PROMPT
    }
  ]

  // strip heavy fields and normalize tool_calls so chat.js won't crash on UI shapes
  const sanitizedMessages = promptMessages
    .map((message) => {
      if (!message || typeof message !== 'object') return null
      const next = { ...message }
      delete next.tokenUsage
      delete next.approvalStatus
      delete next.status
      delete next.id
      delete next.timestamp
      delete next.completedTimestamp
      delete next.endTime
      delete next.aiName
      delete next.voiceName
      delete next.canRestore
      delete next.archivedMessages
      delete next.snapshotId
      delete next.summaryPrefix
      delete next.coveredCount
      delete next.expanded
      delete next.collapsed

      if (Array.isArray(next.content)) {
        next.content = next.content.filter((part) => !part?.isTranscript)
        if (next.content.length === 0) next.content = ''
      }

      // UI tool_calls: { id, name, args, result } → API tool_calls / drop incomplete
      if (Array.isArray(next.tool_calls)) {
        const normalized = next.tool_calls
          .map((tc) => {
            if (!tc || typeof tc !== 'object') return null
            if (tc.function && (tc.id || tc.function.name)) {
              return {
                id: tc.id || '',
                type: tc.type || 'function',
                function: {
                  name: tc.function.name || '',
                  arguments: typeof tc.function.arguments === 'string'
                    ? tc.function.arguments
                    : JSON.stringify(tc.function.arguments ?? {})
                }
              }
            }
            const name = tc.name || ''
            const args = tc.args ?? tc.arguments ?? '{}'
            if (!tc.id && !name) return null
            return {
              id: tc.id || '',
              type: 'function',
              function: {
                name,
                arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {})
              }
            }
          })
          .filter(Boolean)
        if (normalized.length) next.tool_calls = normalized
        else delete next.tool_calls
      }

      // role=tool must keep content string
      if (next.role === 'tool') {
        if (next.content != null && typeof next.content !== 'string') {
          try {
            next.content = JSON.stringify(next.content)
          } catch {
            next.content = String(next.content)
          }
        }
      }

      return next
    })
    .filter(Boolean)

  if (!provider || !(provider.url || provider.baseUrl)) {
    throw new Error('compact_provider_missing')
  }
  if (!modelName) {
    throw new Error('compact_model_missing')
  }

  const timeoutContext = createCompactionTimeoutContext(signal)
  try {
    const response = await createChatCompletion({
      baseUrl: provider?.url || provider?.baseUrl || '',
      apiKey: provider?.api_key || provider?.apiKey || '',
      model: modelName,
      apiType: apiType || provider?.apiType || 'chat_completions',
      headers: provider?.headers || {},
      retryCount: Number.isInteger(provider?.retryCount) ? provider.retryCount : 3,
      messages: sanitizedMessages,
      stream,
      signal: timeoutContext.signal
    })
    timeoutContext.touch()

    if (response && typeof response[Symbol.asyncIterator] === 'function') {
      let text = ''
      for await (const part of response) {
        timeoutContext.touch()
        throwIfAborted(timeoutContext.signal)
        const delta = part?.choices?.[0]?.delta
        if (typeof delta?.content === 'string') {
          text += delta.content
        } else if (Array.isArray(delta?.content)) {
          text += delta.content
            .filter((item) => item?.type === 'text')
            .map((item) => String(item.text || ''))
            .join('')
        } else if (typeof part?.delta === 'string') {
          text += part.delta
        } else if (typeof part?.output_text === 'string') {
          text += part.output_text
        }
      }
      return text.trim()
    }

    return extractAssistantTextFromCompletion(response, apiType || provider?.apiType || 'chat_completions')
  } catch (error) {
    const timeoutCode = timeoutContext.getTimeoutCode()
    if (timeoutCode) throw new Error(timeoutCode)
    throw error
  } finally {
    timeoutContext.cleanup()
  }
}

/**
 * Summarize a UI/message prefix for cascade compaction.
 * Frontend owns cascade splicing; this function only generates the handoff summary.
 */
async function runConversationCompaction({
  messages = [],
  chatShow = [],
  modelValue = '',
  provider = null,
  config: configPatch = null,
  stream = true,
  signal = null,
  onProgress = null,
  progressBase = 0,
  progressSpan = 100
} = {}) {
  const report = (stage, payload = {}) => {
    if (typeof onProgress === 'function') {
      try {
        const localPercent = Number(payload?.percent)
        const mappedPercent = Number.isFinite(localPercent)
          ? Math.min(100, Math.max(0, Math.round(progressBase + (localPercent / 100) * progressSpan)))
          : undefined
        onProgress({
          stage,
          ...payload,
          ...(mappedPercent === undefined ? {} : { percent: mappedPercent })
        })
      } catch {
        // ignore progress callback failures
      }
    }
  }

  throwIfAborted(signal)
  report('prepare', { percent: 5, message: '准备压缩…' })

  // Summary requests must use the canonical API-level transcript. chatShow is UI-only metadata.
  const sourceMessages = (Array.isArray(messages) && messages.length > 0)
    ? messages
    : chatShow
  if (!Array.isArray(sourceMessages) || sourceMessages.length === 0) {
    throw new Error('compact_source_empty')
  }

  const primaryModelName = String(modelValue || '').includes('|')
    ? String(modelValue).split('|').slice(1).join('|')
    : String(modelValue || '')
  const resolveResult = await resolveModelContextLength(modelValue, { forceRefresh: false })
  throwIfAborted(signal)
  report('resolve_context', {
    percent: 15,
    message: '确认模型上下文长度…',
    contextLength: resolveResult.contextLength,
    source: resolveResult.source
  })

  const modelConfigResult = await getModelCompactConfig(resolveResult.modelKey || modelValue)
  const modelConfig = {
    ...modelConfigResult.config,
    ...(configPatch && typeof configPatch === 'object' ? configPatch : {})
  }

  // Flatten compaction markers into readable transcript for the summarizer.
  const flattenForSummary = (items = [], depth = 0) => {
    const out = []
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      if (item.role === 'system') continue
      if (item.role === 'compaction') {
        out.push({
          role: 'user',
          content: `[compacted depth=${depth}] ${String(item.summary || item.content || '').trim()}`
        })
        if (Array.isArray(item.archivedMessages) && item.archivedMessages.length) {
          out.push(...flattenForSummary(item.archivedMessages, depth + 1))
        }
        continue
      }
      out.push(deepClone(item))
    }
    return out
  }

  const summarySource = flattenForSummary(sourceMessages)
  const localTokens = estimateMessagesTokens(summarySource, { modelInput: modelValue })
  report('estimate_usage', {
    percent: 25,
    message: '估算上下文用量…',
    localTokens
  })

  const apiType = provider?.apiType || 'chat_completions'
  report('generate_summary', {
    percent: 42,
    message: '正在生成摘要…',
    model: primaryModelName
  })

  // Reuse the active conversation's transport mode and the provider SDK retry policy.
  // The summary remains tool-free, but its network/retry path now matches normal chat.
  const summaryText = await requestSummaryOnce({
    provider,
    modelName: primaryModelName,
    messages: summarySource,
    compactPrompt: modelConfig.compactPrompt,
    signal,
    apiType,
    stream
  })

  throwIfAborted(signal)
  if (!summaryText.trim()) {
    throw new Error('empty_summary')
  }

  report('rebuild_history', { percent: 90, message: '写回压缩检查点…' })

  const snapshotId = `compact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const summaryPrefix = modelConfig.summaryPrefix || DEFAULT_SUMMARY_PREFIX
  const built = buildCompactedHistory({
    messages: summarySource,
    summaryText,
    summaryPrefix,
  })

  report('completed', {
    percent: 100,
    message: '压缩完成',
    snapshotId
  })

  return {
    ok: true,
    snapshotId,
    summary: summaryText,
    summaryPrefix,
    // AI-side checkpoint for this compacted prefix (system + summary only).
    // The renderer appends the uncompressed cascade tail after the latest marker.
    history: built.history,
    // Frontend will splice this marker into the cascade UI tree.
    marker: {
      role: 'compaction',
      content: summaryText,
      summary: summaryText,
      snapshotId,
      createdAt: Date.now(),
      collapsed: true,
      expanded: false,
      // SQLite canonical messages remain the recovery source. Do not clone the covered prefix
      // into this runtime IPC result: it can contain large attachment data URLs and is unused by new-session restore.
      timestamp: new Date().toLocaleString('sv-SE')
    },
    modelConfig,
    contextLength: resolveResult.contextLength,
    localTokensBefore: localTokens
  }
}

function shouldAutoCompact({
  activeTokens = 0,
  contextLength = DEFAULT_CONTEXT_LENGTH,
  triggerRatio = DEFAULT_TRIGGER_RATIO,
  autoCompactEnabled = true
} = {}) {
  if (autoCompactEnabled === false) return false
  const limit = Number(contextLength)
  const ratio = Number(triggerRatio)
  const tokens = Number(activeTokens)
  if (!Number.isFinite(limit) || limit <= 0) return false
  if (!Number.isFinite(tokens) || tokens <= 0) return false
  const safeRatio = Number.isFinite(ratio) ? Math.min(0.99, Math.max(0.1, ratio)) : DEFAULT_TRIGGER_RATIO
  const threshold = Math.floor(limit * safeRatio)
  return tokens >= threshold || tokens >= limit
}

const COMPACT_DEFAULTS = {
  DEFAULT_CONTEXT_LENGTH,
  DEFAULT_TRIGGER_RATIO,
  DEFAULT_KEEP_RECENT_ROUNDS,
  DEFAULT_COMPACT_PROMPT,
  DEFAULT_SUMMARY_PREFIX
}

module.exports = {
  getCompactCacheSnapshot,
  importCompactCacheModels,
  getModelCompactConfig,
  updateModelCompactConfig,
  applyAdvancedCompactConfigToAll,
  pruneCompactCacheByEnabledModels,
  resolveModelContextLength,
  estimateMessagesTokens,
  estimateVisualImageTokens,
  estimateTextTokens,
  resolveEffectiveTokenUsage,
  buildCompactedHistory,
  runConversationCompaction,
  shouldAutoCompact,
  selectCompactionCut,
  createCompactionTimeoutContext,
  COMPACT_DEFAULTS,
  normalizeModelKey,
  DEFAULT_CONTEXT_LENGTH,
  DEFAULT_TRIGGER_RATIO,
  DEFAULT_COMPACT_PROMPT,
  DEFAULT_SUMMARY_PREFIX
}
