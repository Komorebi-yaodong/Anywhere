const { encode } = require('gpt-tokenizer')
const { createChatCompletion } = require('./chat.js')


const COMPACT_CACHE_DOC_ID = 'conversation_compact_cache'
const DEFAULT_CONTEXT_LENGTH = 256 * 1024
const DEFAULT_TRIGGER_RATIO = 0.9
const DEFAULT_KEEP_RECENT_ROUNDS = 3
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

function isAbortError(error) {
  return Boolean(
    error?.name === 'AbortError' ||
    error?.code === 'ABORT_ERR' ||
    /abort/i.test(String(error?.message || error || ''))
  )
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
      if (part.type === 'image_url') return '[image]'
      if (part.type === 'input_audio' || part.type === 'audio') return '[audio]'
      return ''
    })
    .filter(Boolean)
    .join('\n')
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

function estimateMessagesTokens(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return 0
  let total = 0
  for (const message of messages) {
    const text = messageToPlainText(message)
    if (!text) continue
    try {
      total += encode(text).length
    } catch {
      total += Math.ceil(text.length / 4)
    }
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
  apiType
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

  const response = await createChatCompletion({
    baseUrl: provider?.url || provider?.baseUrl || '',
    apiKey: provider?.api_key || provider?.apiKey || '',
    model: modelName,
    apiType: apiType || provider?.apiType || 'chat_completions',
    headers: provider?.headers || {},
    retryCount: 0,
    messages: sanitizedMessages,
    stream: false,
    signal
  })

  return extractAssistantTextFromCompletion(response, apiType || provider?.apiType || 'chat_completions')
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
  const localTokens = estimateMessagesTokens(summarySource)
  report('estimate_usage', {
    percent: 25,
    message: '估算上下文用量…',
    localTokens
  })

  let summaryText = ''
  let lastError = null
  const maxAttempts = 3
  const apiType = provider?.apiType || 'chat_completions'

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal)
    const retryCount = attempt - 1
    report('generate_summary', {
      percent: 30 + attempt * 12,
      // 首次请求不是重试；只有前一次摘要请求失败后才显示重试次数。
      message: retryCount > 0
        ? `请求未完成，正在重试（第 ${retryCount}/${maxAttempts} 次）…`
        : '正在生成摘要…',
      attempt,
      retryCount,
      maxAttempts,
      model: primaryModelName
    })
    try {
      summaryText = await requestSummaryOnce({
        provider,
        modelName: primaryModelName,
        messages: summarySource,
        compactPrompt: modelConfig.compactPrompt,
        signal,
        apiType
      })
      if (summaryText.trim()) break
      lastError = new Error('empty_summary')
    } catch (error) {
      lastError = error
      if (isAbortError(error)) throw error
    }
  }

  throwIfAborted(signal)
  if (!summaryText.trim()) {
    const error = lastError || new Error('compact_failed')
    error.message = error.message || 'compact_failed'
    throw error
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
      archivedMessages: deepClone(sourceMessages),
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
  estimateTextTokens,
  resolveEffectiveTokenUsage,
  buildCompactedHistory,
  runConversationCompaction,
  shouldAutoCompact,
  COMPACT_DEFAULTS,
  normalizeModelKey,
  DEFAULT_CONTEXT_LENGTH,
  DEFAULT_TRIGGER_RATIO,
  DEFAULT_COMPACT_PROMPT,
  DEFAULT_SUMMARY_PREFIX
}
