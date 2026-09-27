// Keep this schema/repository behavior aligned with Anywhere Desktop main/core/conversationStore.js.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync, backup: sqliteBackup } = require('./sqliteSyncDriver.js');

const {
  assignConversationProject,
  findConversation,
  findProjectByBasename,
  readLocalProjects,
  registerConversation,
  removeConversation: removeConversationFromProjects,
  updateConversation,
  writeLocalProjects
} = require('./projects.js');

const SCHEMA_VERSION = 1
const DB_EXTENSION = '.db'
const MIGRATION_LOCK_TTL_MS = 2 * 60 * 1000
const WRITE_LEASE_TTL_MS = 20 * 1000
const DEFAULT_BUSY_TIMEOUT_MS = 4000
const ATTACHMENT_REF_KEY = '__anywhere_attachment_ref'


function createUuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const nowIso = () => new Date().toISOString()
const clone = (value) => JSON.parse(JSON.stringify(value ?? null))
const normalizeText = (value, fallback = '') => typeof value === 'string' ? value : (value == null ? fallback : String(value))
const normalizeBasename = (value = '') => path.basename(normalizeText(value).trim())

function createConversationId() {
  return createUuid()
}

function createDatabaseFilename(conversationId) {
  return `c${String(conversationId).replace(/-/g, '')}${DB_EXTENSION}`
}

function resolveDatabasePath(dirPath, dbFile) {
  const dir = path.resolve(normalizeText(dirPath).trim())
  const basename = normalizeBasename(dbFile)
  if (!dir || !basename || !basename.toLowerCase().endsWith(DB_EXTENSION)) throw new Error('conversation_database_path_invalid')
  return path.join(dir, basename)
}

function openDatabase(databasePath, { readOnly = false } = {}) {
  const db = new DatabaseSync(databasePath, {
    readOnly,
    timeout: DEFAULT_BUSY_TIMEOUT_MS,
    enableForeignKeyConstraints: true
  })
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = ${DEFAULT_BUSY_TIMEOUT_MS};
  `)
  if (!readOnly) {
    db.exec(`
      PRAGMA journal_mode = DELETE;
      PRAGMA synchronous = FULL;
    `)
  }
  return db
}

function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation (
      conversation_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      owner_user_id TEXT,
      legacy_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      schema_version INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      role_code TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS providers (
      provider_id TEXT PRIMARY KEY,
      provider_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      model_id TEXT PRIMARY KEY,
      provider_id TEXT REFERENCES providers(provider_id),
      model_name TEXT NOT NULL,
      display_name TEXT,
      protocol_type TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      account_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participant_profiles (
      profile_id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(user_id),
      actor_type TEXT NOT NULL,
      display_name TEXT,
      avatar_attachment_id TEXT,
      model_id TEXT REFERENCES models(model_id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      attachment_id TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL UNIQUE,
      mime_type TEXT,
      original_name TEXT,
      byte_size INTEGER NOT NULL DEFAULT 0,
      data_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      ordinal INTEGER NOT NULL UNIQUE,
      message_uuid TEXT NOT NULL UNIQUE,
      role_code TEXT NOT NULL REFERENCES roles(role_code),
      author_profile_id TEXT REFERENCES participant_profiles(profile_id),
      payload_json TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT,
      token_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS message_attachments (
      message_uuid TEXT NOT NULL REFERENCES messages(message_uuid) ON DELETE CASCADE,
      json_path TEXT NOT NULL,
      attachment_id TEXT NOT NULL REFERENCES attachments(attachment_id),
      PRIMARY KEY (message_uuid, json_path)
    );

    CREATE TABLE IF NOT EXISTS ui_messages (
      ui_order INTEGER PRIMARY KEY,
      ui_uuid TEXT NOT NULL UNIQUE,
      message_uuid TEXT,
      role_code TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_state (
      state_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compaction_summaries (
      summary_id TEXT PRIMARY KEY,
      message_uuid TEXT NOT NULL REFERENCES messages(message_uuid) ON DELETE CASCADE,
      covered_start_ordinal INTEGER,
      covered_end_ordinal INTEGER,
      insert_after_ordinal INTEGER,
      summary_text TEXT NOT NULL,
      summary_prefix TEXT,
      token_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS write_lease (
      resource TEXT PRIMARY KEY,
      holder_instance_id TEXT NOT NULL,
      holder_app TEXT NOT NULL,
      lease_epoch INTEGER NOT NULL,
      heartbeat_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_role_ordinal ON messages(role_code, ordinal);
    CREATE INDEX IF NOT EXISTS idx_ui_messages_message_uuid ON ui_messages(message_uuid);
    CREATE INDEX IF NOT EXISTS idx_compaction_active ON compaction_summaries(is_active, insert_after_ordinal);
  `)

  const insertRole = db.prepare('INSERT OR IGNORE INTO roles(role_code) VALUES (?)')
  for (const role of ['system', 'user', 'assistant', 'tool', 'compaction']) insertRole.run(role)
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)')
    .run(SCHEMA_VERSION, 'initial_conversation_schema', nowIso())
}

function withTransaction(db, callback, mode = 'IMMEDIATE') {
  db.exec(`BEGIN ${mode}`)
  try {
    const result = callback()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try { db.exec('ROLLBACK') } catch {}
    throw error
  }
}


function getActiveWriteLease(db) {
  const lease = db.prepare("SELECT holder_instance_id, holder_app, lease_epoch, expires_at FROM write_lease WHERE resource = 'conversation'").get()
  if (!lease || new Date(lease.expires_at).getTime() <= Date.now()) return null
  return lease
}

function assertConversationWriteLease(db, { holderInstanceId = '', leaseEpoch = null } = {}) {
  const lease = getActiveWriteLease(db)
  if (!lease) return null
  const holder = normalizeText(holderInstanceId).trim()
  const epoch = Number(leaseEpoch)
  if (!holder || !Number.isFinite(epoch) || lease.holder_instance_id !== holder || Number(lease.lease_epoch) !== epoch) {
    throw new Error('conversation_write_lease_lost')
  }
  return lease
}

function parseDataUrl(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=\r\n]+)$/)
  if (!match) return null
  const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
  return {
    mimeType: match[1],
    byteSize: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  }
}

function externalizeAttachments(db, value, ownerId, currentPath = '$', links = []) {
  if (typeof value === 'string') {
    const parsed = parseDataUrl(value)
    if (!parsed) return value
    let row = db.prepare('SELECT attachment_id FROM attachments WHERE sha256 = ?').get(parsed.sha256)
    if (!row) {
      const attachmentId = createUuid()
      db.prepare(`
        INSERT INTO attachments(attachment_id, sha256, mime_type, byte_size, data_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(attachmentId, parsed.sha256, parsed.mimeType, parsed.byteSize, value, nowIso())
      row = { attachment_id: attachmentId }
    }
    links.push({ ownerId, jsonPath: currentPath, attachmentId: row.attachment_id })
    return { [ATTACHMENT_REF_KEY]: row.attachment_id }
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => externalizeAttachments(db, item, ownerId, `${currentPath}[${index}]`, links))
  }
  if (value && typeof value === 'object') {
    const next = {}
    for (const [key, item] of Object.entries(value)) {
      next[key] = externalizeAttachments(db, item, ownerId, `${currentPath}.${key}`, links)
    }
    return next
  }
  return value
}

function hydrateAttachments(db, value) {
  if (Array.isArray(value)) return value.map((item) => hydrateAttachments(db, item))
  if (value && typeof value === 'object') {
    const attachmentId = normalizeText(value[ATTACHMENT_REF_KEY]).trim()
    if (attachmentId && Object.keys(value).length === 1) {
      return db.prepare('SELECT data_url FROM attachments WHERE attachment_id = ?').get(attachmentId)?.data_url || ''
    }
    const next = {}
    for (const [key, item] of Object.entries(value)) next[key] = hydrateAttachments(db, item)
    return next
  }
  return value
}

function messageSignature(message = {}) {
  const content = message?.content
  return JSON.stringify({
    role: normalizeText(message?.role),
    content,
    reasoning: normalizeText(message?.reasoning_content),
    summary: normalizeText(message?.summary)
  })
}

function prepareMigrationMessages(fullHistory = [], chatShow = []) {
  const messages = (Array.isArray(fullHistory) ? fullHistory : []).map((message) => ({
    ...clone(message),
    storageId: normalizeText(message?.storageId).trim() || createUuid()
  }))
  const signatureQueues = new Map()
  messages.forEach((message) => {
    if (message.role === 'tool') return
    const signature = messageSignature(message)
    if (!signatureQueues.has(signature)) signatureQueues.set(signature, [])
    signatureQueues.get(signature).push(message.storageId)
  })
  const uiMessages = (Array.isArray(chatShow) ? chatShow : []).map((message) => {
    const next = clone(message)
    const signature = messageSignature(next)
    const queue = signatureQueues.get(signature)
    next.storageId = normalizeText(next.storageId).trim() || (queue?.shift() || '')
    next.uiStorageId = normalizeText(next.uiStorageId).trim() || createUuid()
    return next
  })
  return { messages, uiMessages }
}

function splitSessionSnapshot(sessionData = {}) {
  const source = sessionData && typeof sessionData === 'object' ? clone(sessionData) : {}
  const rawFullHistory = Array.isArray(source.fullHistory) ? source.fullHistory : []
  const rawHistory = Array.isArray(source.history) ? source.history : []
  const rawChatShow = Array.isArray(source.chat_show) ? source.chat_show : []
  const hasCompaction = rawChatShow.some((message) => message?.role === 'compaction')
  const fullHistory = rawFullHistory.length > 0
    ? rawFullHistory
    : (rawHistory.length > 0 && !hasCompaction ? rawHistory : rawChatShow.filter((message) => message?.role !== 'tool'))
  delete source.fullHistory
  delete source.history
  delete source.chat_show
  return { state: source, fullHistory, chatShow: rawChatShow }
}

function insertMessage(db, message, ordinal) {
  const storageId = normalizeText(message?.storageId).trim() || createUuid()
  const payload = clone(message)
  delete payload.storageId
  delete payload.storageOrdinal
  delete payload.uiStorageId
  delete payload.uiStorageOrder
  const links = []
  const storedPayload = externalizeAttachments(db, payload, storageId, '$', links)
  const role = ['system', 'user', 'assistant', 'tool', 'compaction'].includes(payload.role) ? payload.role : 'user'
  const createdAt = normalizeText(payload.createdAt || payload.timestamp).trim()
  const updatedAt = normalizeText(payload.completedTimestamp || payload.updatedAt || payload.createdAt || payload.timestamp).trim()
  const tokenCount = Math.max(0, Number(payload?.tokenUsage?.total_tokens) || 0)
  db.prepare(`
    INSERT INTO messages(ordinal, message_uuid, role_code, payload_json, created_at, updated_at, token_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(ordinal, storageId, role, JSON.stringify(storedPayload), createdAt || null, updatedAt || null, tokenCount)
  const linkStmt = db.prepare('INSERT OR IGNORE INTO message_attachments(message_uuid, json_path, attachment_id) VALUES (?, ?, ?)')
  for (const link of links) linkStmt.run(storageId, link.jsonPath, link.attachmentId)

  if (role === 'compaction') {
    const summaryId = normalizeText(payload.snapshotId || payload.id).trim() || createUuid()
    db.prepare(`
      INSERT OR REPLACE INTO compaction_summaries(
        summary_id, message_uuid, covered_start_ordinal, covered_end_ordinal,
        insert_after_ordinal, summary_text, summary_prefix, token_count, created_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      summaryId,
      storageId,
      Number.isFinite(Number(payload.coveredStartOrdinal)) ? Number(payload.coveredStartOrdinal) : null,
      Number.isFinite(Number(payload.coveredEndOrdinal)) ? Number(payload.coveredEndOrdinal) : null,
      ordinal - 1,
      normalizeText(payload.summary || payload.content),
      normalizeText(payload.summaryPrefix),
      Math.max(0, Number(payload.tokenCount) || 0),
      normalizeText(payload.createdAt) || nowIso()
    )
  }
  return storageId
}

function insertUiMessage(db, message, uiOrder) {
  const uiStorageId = normalizeText(message?.uiStorageId).trim() || createUuid()
  const payload = clone(message)
  delete payload.storageId
  delete payload.uiStorageId
  delete payload.uiStorageOrder
  delete payload.storageOrdinal
  const storedPayload = externalizeAttachments(db, payload, uiStorageId)
  db.prepare(`
    INSERT INTO ui_messages(ui_order, ui_uuid, message_uuid, role_code, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(uiOrder, uiStorageId, normalizeText(message?.storageId).trim() || null, normalizeText(message?.role, 'user'), JSON.stringify(storedPayload))
}

function stripMessageStorageMetadata(message = {}, { ui = false } = {}) {
  const payload = clone(message)
  delete payload.storageId
  delete payload.storageOrdinal
  delete payload.uiStorageId
  delete payload.uiStorageOrder
  return payload
}

function canIncrementallySyncOrder(existingIds, currentMessages, idKey) {
  const currentIds = currentMessages.map((message) => normalizeText(message?.[idKey]).trim()).filter(Boolean)
  if (currentIds.length !== currentMessages.length) return false
  const currentExistingIds = currentIds.filter((id) => existingIds.has(id))
  const retainedExistingIds = [...existingIds].filter((id) => currentIds.includes(id))
  if (currentExistingIds.join('\u0000') !== retainedExistingIds.join('\u0000')) return false
  let sawNew = false
  for (const id of currentIds) {
    if (!existingIds.has(id)) sawNew = true
    else if (sawNew) return false
  }
  return true
}

function syncMessagesIncrementally(db, messages, lowerBound = 1) {
  const existingRows = db.prepare(`
    SELECT ordinal, message_uuid, role_code, payload_json
    FROM messages WHERE role_code = 'system' OR ordinal >= ? ORDER BY ordinal
  `).all(lowerBound)
  const existingIds = new Set(existingRows.map((row) => row.message_uuid))
  if (!canIncrementallySyncOrder(existingIds, messages, 'storageId')) return false

  const currentIds = new Set(messages.map((message) => message.storageId))
  const deleteStmt = db.prepare('DELETE FROM messages WHERE message_uuid = ?')
  for (const row of existingRows) {
    if (!currentIds.has(row.message_uuid)) deleteStmt.run(row.message_uuid)
  }

  const existingById = new Map(existingRows.map((row) => [row.message_uuid, row]))
  let nextOrdinal = Number(db.prepare('SELECT COALESCE(MAX(ordinal), 0) AS value FROM messages').get()?.value) || 0
  let nextSystemOrdinal = Number(db.prepare("SELECT COALESCE(MIN(ordinal), 0) AS value FROM messages WHERE role_code = 'system'").get()?.value) || 0
  for (const message of messages) {
    const existing = existingById.get(message.storageId)
    if (existing) {
      const storedPayload = hydrateAttachments(db, JSON.parse(existing.payload_json))
      const nextPayload = stripMessageStorageMetadata(message)
      const nextRole = ['system', 'user', 'assistant', 'tool', 'compaction'].includes(nextPayload.role) ? nextPayload.role : 'user'
      if (existing.role_code === nextRole && JSON.stringify(storedPayload) === JSON.stringify(nextPayload)) continue
      deleteStmt.run(existing.message_uuid)
      insertMessage(db, message, existing.ordinal)
      continue
    }
    const ordinal = message.role === 'system' ? --nextSystemOrdinal : ++nextOrdinal
    insertMessage(db, message, ordinal)
  }
  return true
}

function syncUiMessagesIncrementally(db, messages, lowerBound = 1) {
  const existingRows = db.prepare(`
    SELECT ui_order, ui_uuid, message_uuid, role_code, payload_json
    FROM ui_messages WHERE role_code = 'system' OR ui_order >= ? ORDER BY ui_order
  `).all(lowerBound)
  const existingIds = new Set(existingRows.map((row) => row.ui_uuid))
  if (!canIncrementallySyncOrder(existingIds, messages, 'uiStorageId')) return false

  const currentIds = new Set(messages.map((message) => message.uiStorageId))
  const deleteStmt = db.prepare('DELETE FROM ui_messages WHERE ui_uuid = ?')
  for (const row of existingRows) {
    if (!currentIds.has(row.ui_uuid)) deleteStmt.run(row.ui_uuid)
  }

  const existingById = new Map(existingRows.map((row) => [row.ui_uuid, row]))
  let nextOrder = Number(db.prepare('SELECT COALESCE(MAX(ui_order), 0) AS value FROM ui_messages').get()?.value) || 0
  let nextSystemOrder = Number(db.prepare("SELECT COALESCE(MIN(ui_order), 0) AS value FROM ui_messages WHERE role_code = 'system'").get()?.value) || 0
  for (const message of messages) {
    const existing = existingById.get(message.uiStorageId)
    if (existing) {
      const storedPayload = hydrateAttachments(db, JSON.parse(existing.payload_json))
      const nextPayload = stripMessageStorageMetadata(message, { ui: true })
      const nextMessageUuid = normalizeText(message?.storageId).trim() || null
      if (
        existing.role_code === normalizeText(message?.role, 'user')
        && (existing.message_uuid || null) === nextMessageUuid
        && JSON.stringify(storedPayload) === JSON.stringify(nextPayload)
      ) continue
      deleteStmt.run(existing.ui_uuid)
      insertUiMessage(db, message, existing.ui_order)
      continue
    }
    const uiOrder = message.role === 'system' ? --nextSystemOrder : ++nextOrder
    insertUiMessage(db, message, uiOrder)
  }
  return true
}


function writeState(db, state) {
  const stateStmt = db.prepare(`
    INSERT INTO session_state(state_key, value_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(state_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `)
  for (const [key, value] of Object.entries(state || {})) {
    const storedValue = externalizeAttachments(db, value, `state:${key}`)
    stateStmt.run(key, JSON.stringify(storedValue), nowIso())
  }
}

function replaceSnapshotInDatabase(db, descriptor, sessionData) {
  const { state, fullHistory, chatShow } = splitSessionSnapshot(sessionData)
  const prepared = prepareMigrationMessages(fullHistory, chatShow)
  const createdAt = normalizeText(sessionData?.sessionMetadata?.createdAt).trim() || nowIso()
  const updatedAt = normalizeText(sessionData?.sessionMetadata?.updatedAt).trim() || createdAt

  withTransaction(db, () => {
    db.exec(`
      DELETE FROM message_attachments;
      DELETE FROM compaction_summaries;
      DELETE FROM ui_messages;
      DELETE FROM messages;
      DELETE FROM session_state;
      DELETE FROM conversation;
    `)
    db.prepare(`
      INSERT INTO conversation(conversation_id, title, owner_user_id, legacy_json, created_at, updated_at, revision, schema_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      descriptor.conversationId,
      descriptor.title,
      normalizeText(sessionData?.conversationOwnerId).trim() || null,
      descriptor.legacyJson || null,
      createdAt,
      updatedAt,
      Math.max(0, Number(descriptor.revision) || 0),
      SCHEMA_VERSION
    )
    prepared.messages.forEach((message, index) => insertMessage(db, message, index + 1))
    prepared.uiMessages.forEach((message, index) => insertUiMessage(db, message, index + 1))
    writeState(db, state)
  })
}

function getConversationRow(db) {
  const row = db.prepare('SELECT * FROM conversation LIMIT 1').get()
  if (!row) throw new Error('conversation_metadata_missing')
  return row
}

function loadState(db) {
  const state = {}
  for (const row of db.prepare('SELECT state_key, value_json FROM session_state').all()) {
    state[row.state_key] = hydrateAttachments(db, JSON.parse(row.value_json))
  }
  return state
}

function getActiveMessageStart(db) {
  const row = db.prepare(`
    SELECT m.ordinal
    FROM compaction_summaries c
    JOIN messages m ON m.message_uuid = c.message_uuid
    WHERE c.is_active = 1
    ORDER BY m.ordinal DESC
    LIMIT 1
  `).get()
  return Number(row?.ordinal) || 0
}

function loadMessages(db, { activeOnly = true, limit = 0, beforeOrdinal = null } = {}) {
  const activeStart = activeOnly ? getActiveMessageStart(db) : 0
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0))
  const safeBefore = beforeOrdinal !== null && beforeOrdinal !== undefined && beforeOrdinal !== '' && Number.isFinite(Number(beforeOrdinal))
    ? Number(beforeOrdinal)
    : null
  let rows
  if (safeLimit > 0) {
    const lowerBound = activeStart > 0 ? activeStart : -Number.MAX_SAFE_INTEGER
    const beforeClause = safeBefore != null ? 'AND ordinal < ?' : ''
    const params = safeBefore != null ? [lowerBound, safeBefore, safeLimit] : [lowerBound, safeLimit]
    rows = db.prepare(`
      SELECT ordinal, message_uuid, role_code, payload_json FROM (
        SELECT ordinal, message_uuid, role_code, payload_json
        FROM messages
        WHERE role_code != 'system' AND ordinal >= ? ${beforeClause}
        ORDER BY ordinal DESC LIMIT ?
      ) ORDER BY ordinal
    `).all(...params)
    if (safeBefore == null) {
      const systems = db.prepare("SELECT ordinal, message_uuid, role_code, payload_json FROM messages WHERE role_code = 'system' ORDER BY ordinal").all()
      rows = [...systems, ...rows]
    }
  } else if (activeStart > 0) {
    rows = db.prepare('SELECT ordinal, message_uuid, role_code, payload_json FROM messages WHERE role_code = ? OR ordinal >= ? ORDER BY ordinal').all('system', activeStart)
  } else {
    rows = db.prepare('SELECT ordinal, message_uuid, role_code, payload_json FROM messages ORDER BY ordinal').all()
  }
  return rows.map((row) => ({
    ...hydrateAttachments(db, JSON.parse(row.payload_json)),
    storageId: row.message_uuid,
    storageOrdinal: row.ordinal
  }))
}

function loadUiMessages(db, { activeOnly = true, limit = 0 } = {}) {
  let rows
  if (activeOnly) {
    const lastCompact = db.prepare(`
      SELECT ui_order FROM ui_messages WHERE role_code = 'compaction' ORDER BY ui_order DESC LIMIT 1
    `).get()
    if (lastCompact?.ui_order) {
      rows = db.prepare(`
        SELECT ui_order, ui_uuid, message_uuid, payload_json
        FROM ui_messages
        WHERE role_code = 'system' OR ui_order >= ?
        ORDER BY ui_order
      `).all(lastCompact.ui_order)
    }
  }
  if (!rows) {
    if (Number(limit) > 0) {
      const tailRows = db.prepare(`
        SELECT ui_order, ui_uuid, message_uuid, payload_json FROM (
          SELECT ui_order, ui_uuid, message_uuid, payload_json
          FROM ui_messages WHERE role_code != 'system' ORDER BY ui_order DESC LIMIT ?
        ) ORDER BY ui_order
      `).all(Math.floor(Number(limit)))
      const systemRows = db.prepare("SELECT ui_order, ui_uuid, message_uuid, payload_json FROM ui_messages WHERE role_code = 'system' ORDER BY ui_order").all()
      rows = [...systemRows, ...tailRows]
    } else {
      rows = db.prepare('SELECT ui_order, ui_uuid, message_uuid, payload_json FROM ui_messages ORDER BY ui_order').all()
    }
  }
  return rows.map((row) => ({
    ...hydrateAttachments(db, JSON.parse(row.payload_json)),
    ...(row.message_uuid ? { storageId: row.message_uuid } : {}),
    uiStorageId: row.ui_uuid,
    uiStorageOrder: row.ui_order
  }))
}

async function migrateJsonConversation({ dirPath, jsonBasename, instanceId = '', appType = 'desktop' } = {}) {
  const normalizedDir = path.resolve(normalizeText(dirPath).trim())
  const legacyJson = normalizeBasename(jsonBasename)
  if (!normalizedDir || !legacyJson.toLowerCase().endsWith('.json')) throw new Error('legacy_conversation_json_required')
  await fs.mkdir(normalizedDir, { recursive: true })

  let projects = await readLocalProjects(normalizedDir)
  const existing = findConversation(projects, legacyJson)
  if (existing) {
    const existingPath = resolveDatabasePath(normalizedDir, existing.dbFile)
    try {
      await fs.access(existingPath)
      return { ok: true, migrated: false, descriptor: existing, databasePath: existingPath }
    } catch {}
  }

  const sourcePath = path.join(normalizedDir, legacyJson)
  const lockPath = `${sourcePath}.migrate.lock`
  let lockHandle
  try {
    lockHandle = await fs.open(lockPath, 'wx')
    await lockHandle.writeFile(JSON.stringify({ instanceId, appType, createdAt: nowIso(), expiresAt: new Date(Date.now() + MIGRATION_LOCK_TTL_MS).toISOString() }))
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const lockStat = await fs.stat(lockPath).catch(() => null)
    if (lockStat && Date.now() - lockStat.mtimeMs > MIGRATION_LOCK_TTL_MS) {
      await fs.rm(lockPath, { force: true })
      return migrateJsonConversation({ dirPath: normalizedDir, jsonBasename: legacyJson, instanceId, appType })
    }
    projects = await readLocalProjects(normalizedDir)
    const mapped = findConversation(projects, legacyJson)
    if (mapped) return { ok: true, migrated: false, descriptor: mapped, databasePath: resolveDatabasePath(normalizedDir, mapped.dbFile) }
    throw new Error('conversation_migration_in_progress')
  }

  let tempPath = ''
  try {
    const raw = await fs.readFile(sourcePath, 'utf-8')
    const sessionData = JSON.parse(raw)
    if (!sessionData || sessionData.anywhere_history !== true) throw new Error('legacy_conversation_invalid')
    const conversationId = createConversationId()
    const dbFile = createDatabaseFilename(conversationId)
    const title = normalizeText(sessionData?.sessionMetadata?.title).trim() || legacyJson.slice(0, -5)
    const descriptor = {
      conversationId,
      dbFile,
      title,
      legacyJson,
      storageMode: 'local',
      revision: 0,
      schemaVersion: SCHEMA_VERSION,
      createdAt: normalizeText(sessionData?.sessionMetadata?.createdAt).trim() || nowIso(),
      updatedAt: normalizeText(sessionData?.sessionMetadata?.updatedAt).trim() || nowIso()
    }
    const finalPath = resolveDatabasePath(normalizedDir, dbFile)
    tempPath = `${finalPath}.migrating`
    await fs.rm(tempPath, { force: true })
    const db = openDatabase(tempPath)
    try {
      initializeSchema(db)
      replaceSnapshotInDatabase(db, descriptor, sessionData)
      const check = db.prepare('PRAGMA quick_check').get()
      if (!check || !Object.values(check).includes('ok')) throw new Error('conversation_database_integrity_failed')
    } finally {
      db.close()
    }
    await fs.rename(tempPath, finalPath)

    const project = findProjectByBasename(projects, legacyJson)
    projects = registerConversation(projects, descriptor, { projectId: project?.id || '', projectName: project?.name || '' })
    await writeLocalProjects(normalizedDir, projects)
    return { ok: true, migrated: true, descriptor, databasePath: finalPath }
  } finally {
    if (lockHandle) await lockHandle.close().catch(() => {})
    await fs.rm(lockPath, { force: true }).catch(() => {})
    if (tempPath) await fs.rm(tempPath, { force: true }).catch(() => {})
  }
}

async function createConversation({ dirPath, title, sessionData = {}, projectId = '', projectName = '', storageMode = 'local' } = {}) {
  const normalizedDir = path.resolve(normalizeText(dirPath).trim())
  if (!normalizedDir) throw new Error('conversation_local_dir_required')
  await fs.mkdir(normalizedDir, { recursive: true })
  const conversationId = createConversationId()
  const dbFile = createDatabaseFilename(conversationId)
  const descriptor = {
    conversationId,
    dbFile,
    title: normalizeText(title).trim() || '新对话',
    legacyJson: '',
    storageMode: normalizeText(storageMode, 'local').trim() || 'local',
    revision: 0,
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso()
  }
  const databasePath = resolveDatabasePath(normalizedDir, dbFile)
  const tempPath = `${databasePath}.creating`
  const db = openDatabase(tempPath)
  try {
    initializeSchema(db)
    replaceSnapshotInDatabase(db, descriptor, { ...sessionData, sessionMetadata: { ...(sessionData.sessionMetadata || {}), title: descriptor.title } })
  } finally {
    db.close()
  }
  await fs.rename(tempPath, databasePath)
  const projects = registerConversation(await readLocalProjects(normalizedDir), descriptor, { projectId, projectName })
  await writeLocalProjects(normalizedDir, projects)
  return { ok: true, descriptor, databasePath }
}

async function openConversation({ dirPath, reference, activeOnly = true, pageSize = 200 } = {}) {
  const normalizedDir = path.resolve(normalizeText(dirPath).trim())
  let projects = await readLocalProjects(normalizedDir)
  let descriptor = findConversation(projects, reference)
  if (!descriptor && normalizeBasename(reference).toLowerCase().endsWith('.json')) {
    const migration = await migrateJsonConversation({ dirPath: normalizedDir, jsonBasename: reference })
    descriptor = migration.descriptor
    projects = await readLocalProjects(normalizedDir)
  }
  if (!descriptor) throw new Error('conversation_not_found')
  const databasePath = resolveDatabasePath(normalizedDir, descriptor.dbFile)
  const db = openDatabase(databasePath)
  try {
    initializeSchema(db)
    const row = getConversationRow(db)
    const state = loadState(db)
    const activeStart = activeOnly ? getActiveMessageStart(db) : 0
    const shouldPage = activeStart === 0 && Number(pageSize) > 0
    const fullHistory = loadMessages(db, { activeOnly, limit: shouldPage ? pageSize : 0 })
    let chatShow = loadUiMessages(db, { activeOnly, limit: shouldPage ? pageSize : 0 })
    if (chatShow.length === 0) {
      chatShow = fullHistory.filter((message) => message.role !== 'tool').map((message, index) => ({ ...clone(message), id: index + 1 }))
    }
    return {
      ok: true,
      descriptor: { ...descriptor, title: row.title, revision: row.revision, updatedAt: row.updated_at },
      sessionData: {
        anywhere_history: true,
        ...state,
        sessionMetadata: { ...(state.sessionMetadata || {}), title: row.title },
        fullHistory,
        history: [],
        chat_show: chatShow,
        conversationStorage: {
          format: 'sqlite',
          conversationId: row.conversation_id,
          dbFile: descriptor.dbFile,
          title: row.title,
          revision: row.revision,
          activeOnly,
          isPaged: shouldPage,
          loadedFromOrdinal: fullHistory.find((message) => message.role !== 'system')?.storageOrdinal || 0,
          loadedFromUiOrder: chatShow.find((message) => message.role !== 'system')?.uiStorageOrder || 0,
          pageSize: shouldPage ? Number(pageSize) : 0
        }
      }
    }
  } finally {
    db.close()
  }
}

async function listLocalConversations(dirPath) {
  const normalizedDir = path.resolve(normalizeText(dirPath).trim())
  const projects = await readLocalProjects(normalizedDir)
  const files = await fs.readdir(normalizedDir, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return []
    throw error
  })
  const fileStats = new Map()
  for (const entry of files) {
    if (!entry.isFile()) continue
    const stats = await fs.stat(path.join(normalizedDir, entry.name)).catch(() => null)
    if (stats) fileStats.set(entry.name, stats)
  }

  const conversations = []
  const mappedLegacy = new Set()
  for (const descriptor of Object.values(projects.conversations)) {
    const stats = fileStats.get(descriptor.dbFile)
    if (!stats) continue
    if (descriptor.legacyJson) mappedLegacy.add(descriptor.legacyJson)
    let title = descriptor.title
    let revision = descriptor.revision
    let updatedAt = descriptor.updatedAt
    try {
      const db = openDatabase(resolveDatabasePath(normalizedDir, descriptor.dbFile), { readOnly: true })
      try {
        const row = getConversationRow(db)
        title = row.title || title
        revision = row.revision
        updatedAt = row.updated_at || updatedAt
      } finally { db.close() }
    } catch {}
    conversations.push({
      type: 'file',
      format: 'sqlite',
      basename: descriptor.dbFile,
      filename: descriptor.dbFile,
      path: resolveDatabasePath(normalizedDir, descriptor.dbFile),
      conversationId: descriptor.conversationId,
      title,
      legacyJson: descriptor.legacyJson,
      revision,
      size: stats.size,
      createdAt: descriptor.createdAt || stats.birthtime?.toISOString?.() || '',
      updatedAt: updatedAt || stats.mtime?.toISOString?.() || '',
      lastmod: updatedAt || stats.mtime?.toISOString?.() || ''
    })
  }

  for (const entry of files) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json') || mappedLegacy.has(entry.name)) continue
    try {
      const raw = await fs.readFile(path.join(normalizedDir, entry.name), 'utf-8')
      const session = JSON.parse(raw)
      if (session?.anywhere_history !== true) continue
      const stats = fileStats.get(entry.name)
      conversations.push({
        type: 'file',
        format: 'json',
        basename: entry.name,
        filename: entry.name,
        path: path.join(normalizedDir, entry.name),
        title: normalizeText(session?.sessionMetadata?.title).trim() || entry.name.slice(0, -5),
        size: stats?.size || 0,
        createdAt: normalizeText(session?.sessionMetadata?.createdAt).trim() || stats?.birthtime?.toISOString?.() || '',
        updatedAt: normalizeText(session?.sessionMetadata?.updatedAt).trim() || stats?.mtime?.toISOString?.() || '',
        lastmod: stats?.mtime?.toISOString?.() || ''
      })
    } catch {}
  }

  return conversations.sort((a, b) => new Date(b.updatedAt || b.lastmod || 0).getTime() - new Date(a.updatedAt || a.lastmod || 0).getTime())
}

async function loadConversationPage({ dirPath, conversationId, beforeOrdinal = null, beforeUiOrder = null, pageSize = 200 } = {}) {
  const descriptor = findConversation(await readLocalProjects(dirPath), conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile), { readOnly: true })
  try {
    const messages = loadMessages(db, { activeOnly: false, limit: pageSize, beforeOrdinal })
    const safeUiBefore = beforeUiOrder !== null && beforeUiOrder !== undefined && beforeUiOrder !== '' && Number.isFinite(Number(beforeUiOrder))
      ? Number(beforeUiOrder)
      : null
    const uiMessages = safeUiBefore != null
      ? db.prepare(`
          SELECT ui_order, ui_uuid, message_uuid, payload_json FROM (
            SELECT ui_order, ui_uuid, message_uuid, payload_json
            FROM ui_messages WHERE ui_order < ? ORDER BY ui_order DESC LIMIT ?
          ) ORDER BY ui_order
        `).all(safeUiBefore, Math.max(1, Number(pageSize) || 200)).map((row) => ({
          ...hydrateAttachments(db, JSON.parse(row.payload_json)),
          ...(row.message_uuid ? { storageId: row.message_uuid } : {}),
          uiStorageId: row.ui_uuid,
          uiStorageOrder: row.ui_order
        }))
      : []
    const loadedFromOrdinal = messages.find((message) => message.role !== 'system')?.storageOrdinal || 0
    const loadedFromUiOrder = uiMessages.find((message) => message.role !== 'system')?.uiStorageOrder || 0
    return {
      ok: true,
      messages,
      uiMessages,
      loadedFromOrdinal,
      loadedFromUiOrder,
      hasMore: (loadedFromOrdinal > 1) || (loadedFromUiOrder > 1)
    }
  } finally { db.close() }
}

async function getConversationRequestMessages({ dirPath, conversationId } = {}) {
  const descriptor = findConversation(await readLocalProjects(dirPath), conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile), { readOnly: true })
  try {
    return { ok: true, messages: loadMessages(db, { activeOnly: true }) }
  } finally { db.close() }
}


async function saveConversationSnapshot({ dirPath, conversationId, expectedRevision, holderInstanceId = '', leaseEpoch = null, sessionData = {}, title = '' } = {}) {
  const projects = await readLocalProjects(dirPath)
  const descriptor = findConversation(projects, conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile))
  try {
    initializeSchema(db)
    const { state, fullHistory, chatShow } = splitSessionSnapshot(sessionData)
    const prepared = prepareMigrationMessages(fullHistory, chatShow)
    const result = withTransaction(db, () => {
      const row = getConversationRow(db)
      assertConversationWriteLease(db, { holderInstanceId, leaseEpoch })
      if (Number.isFinite(Number(expectedRevision)) && Number(expectedRevision) !== Number(row.revision)) {
        const error = new Error('conversation_revision_conflict')
        error.currentRevision = row.revision
        throw error
      }

      const activeStart = getActiveMessageStart(db)
      const pagingState = state?.conversationStorage && typeof state.conversationStorage === 'object'
        ? state.conversationStorage
        : {}
      const isPaged = pagingState.isPaged === true && activeStart === 0
      const loadedFromOrdinal = Math.max(1, Number(pagingState.loadedFromOrdinal) || 1)

      const messageLowerBound = isPaged ? loadedFromOrdinal : (activeStart > 0 ? activeStart : 1)
      const messageIncremental = syncMessagesIncrementally(db, prepared.messages, messageLowerBound)
      if (!messageIncremental) {
        if (isPaged || activeStart > 0) {
          const lowerBound = isPaged ? loadedFromOrdinal : activeStart
          db.prepare("DELETE FROM messages WHERE role_code = 'system' OR ordinal >= ?").run(lowerBound)
          const systemMessages = prepared.messages.filter((message) => message?.role === 'system')
          const activeMessages = prepared.messages.filter((message) => message?.role !== 'system')
          systemMessages.forEach((message, index) => insertMessage(db, message, index - systemMessages.length))
          let nextOrdinal = Number(db.prepare('SELECT COALESCE(MAX(ordinal), ?) AS value FROM messages').get(lowerBound - 1)?.value) || (lowerBound - 1)
          activeMessages.forEach((message) => {
            const preservedOrdinal = Number(message?.storageOrdinal)
            const ordinal = Number.isFinite(preservedOrdinal) && preservedOrdinal >= lowerBound ? preservedOrdinal : ++nextOrdinal
            nextOrdinal = Math.max(nextOrdinal, ordinal)
            insertMessage(db, message, ordinal)
          })
        } else {
          db.exec('DELETE FROM messages')
          prepared.messages.forEach((message, index) => insertMessage(db, message, index + 1))
        }
      }

      const activeUiStart = Number(db.prepare("SELECT ui_order FROM ui_messages WHERE role_code = 'compaction' ORDER BY ui_order DESC LIMIT 1").get()?.ui_order) || 0
      const loadedUiStart = isPaged
        ? Math.max(1, Number(prepared.uiMessages.find((message) => message?.role !== 'system')?.uiStorageOrder) || 1)
        : (activeUiStart > 0 ? activeUiStart : 1)
      const uiIncremental = syncUiMessagesIncrementally(db, prepared.uiMessages, loadedUiStart)
      if (!uiIncremental) {
        if (isPaged || activeUiStart > 0) {
          db.prepare("DELETE FROM ui_messages WHERE role_code = 'system' OR ui_order >= ?").run(loadedUiStart)
          const systemUi = prepared.uiMessages.filter((message) => message?.role === 'system')
          const activeUi = prepared.uiMessages.filter((message) => message?.role !== 'system')
          systemUi.forEach((message, index) => insertUiMessage(db, message, index - systemUi.length))
          let nextUiOrder = Number(db.prepare('SELECT COALESCE(MAX(ui_order), ?) AS value FROM ui_messages').get(loadedUiStart - 1)?.value) || (loadedUiStart - 1)
          activeUi.forEach((message) => {
            const preservedOrder = Number(message?.uiStorageOrder)
            const uiOrder = Number.isFinite(preservedOrder) && preservedOrder >= loadedUiStart ? preservedOrder : ++nextUiOrder
            nextUiOrder = Math.max(nextUiOrder, uiOrder)
            insertUiMessage(db, message, uiOrder)
          })
        } else {
          db.exec('DELETE FROM ui_messages')
          prepared.uiMessages.forEach((message, index) => insertUiMessage(db, message, index + 1))
        }
      }

      db.exec('DELETE FROM session_state')
      writeState(db, state)
      // Attachment GC is deliberately deferred: draft/state references may be nested JSON paths.
      // Keeping an orphan is safer than deleting content that an older session shape still references.

      const nextRevision = Number(row.revision) + 1
      const nextTitle = normalizeText(title || sessionData?.sessionMetadata?.title).trim() || row.title
      const updatedAt = nowIso()
      db.prepare('UPDATE conversation SET title = ?, updated_at = ?, revision = ? WHERE conversation_id = ?')
        .run(nextTitle, updatedAt, nextRevision, conversationId)
      return { revision: nextRevision, title: nextTitle, updatedAt }
    })

    await writeLocalProjects(dirPath, updateConversation(projects, conversationId, {
      title: result.title,
      revision: result.revision,
      updatedAt: result.updatedAt
    }))
    return { ok: true, ...result, descriptor: { ...descriptor, title: result.title, revision: result.revision, updatedAt: result.updatedAt } }
  } finally {
    db.close()
  }
}


async function saveConversationState({ dirPath, conversationId, expectedRevision, holderInstanceId = '', leaseEpoch = null, state = {}, uiMessages = [], title = '' } = {}) {
  const projects = await readLocalProjects(dirPath)
  const descriptor = findConversation(projects, conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile))
  try {
    initializeSchema(db)
    const result = withTransaction(db, () => {
      const row = getConversationRow(db)
      assertConversationWriteLease(db, { holderInstanceId, leaseEpoch })
      if (Number.isFinite(Number(expectedRevision)) && Number(expectedRevision) !== Number(row.revision)) {
        const error = new Error('conversation_revision_conflict')
        error.currentRevision = row.revision
        throw error
      }
      writeState(db, state)
      if (Array.isArray(uiMessages)) {
        const compactOrder = db.prepare("SELECT ui_order FROM ui_messages WHERE role_code = 'compaction' ORDER BY ui_order DESC LIMIT 1").get()?.ui_order || 0
        if (compactOrder > 0) db.prepare('DELETE FROM ui_messages WHERE ui_order >= ?').run(compactOrder)
        else db.exec('DELETE FROM ui_messages')
        const startOrder = compactOrder > 0 ? compactOrder : 1
        uiMessages.forEach((message, index) => insertUiMessage(db, message, startOrder + index))
      }
      const nextRevision = Number(row.revision) + 1
      const nextTitle = normalizeText(title).trim() || row.title
      db.prepare('UPDATE conversation SET title = ?, updated_at = ?, revision = ? WHERE conversation_id = ?')
        .run(nextTitle, nowIso(), nextRevision, conversationId)
      return { revision: nextRevision, title: nextTitle }
    })
    const nextProjects = updateConversation(projects, conversationId, { title: result.title, revision: result.revision, updatedAt: nowIso() })
    await writeLocalProjects(dirPath, nextProjects)
    return { ok: true, ...result }
  } finally { db.close() }
}

async function appendMessages({ dirPath, conversationId, holderInstanceId = '', leaseEpoch = null, messages = [] } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) return { ok: true, messageIds: [] }
  const descriptor = findConversation(await readLocalProjects(dirPath), conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile))
  try {
    initializeSchema(db)
    return withTransaction(db, () => {
      assertConversationWriteLease(db, { holderInstanceId, leaseEpoch })
      let ordinal = Number(db.prepare('SELECT COALESCE(MAX(ordinal), 0) AS value FROM messages').get()?.value) || 0
      const messageIds = messages.map((message) => insertMessage(db, message, ++ordinal))
      db.prepare('UPDATE conversation SET updated_at = ? WHERE conversation_id = ?').run(nowIso(), conversationId)
      return { ok: true, messageIds }
    })
  } finally { db.close() }
}

async function updateMessage({ dirPath, conversationId, holderInstanceId = '', leaseEpoch = null, storageId, message } = {}) {
  const descriptor = findConversation(await readLocalProjects(dirPath), conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile))
  try {
    initializeSchema(db)
    return withTransaction(db, () => {
      assertConversationWriteLease(db, { holderInstanceId, leaseEpoch })
      const existing = db.prepare('SELECT ordinal FROM messages WHERE message_uuid = ?').get(storageId)
      if (!existing) throw new Error('conversation_message_not_found')
      db.prepare('DELETE FROM messages WHERE message_uuid = ?').run(storageId)
      insertMessage(db, { ...message, storageId }, existing.ordinal)
      return { ok: true, storageId }
    })
  } finally { db.close() }
}

async function truncateMessages({ dirPath, conversationId, holderInstanceId = '', leaseEpoch = null, fromStorageId, inclusive = true } = {}) {
  const descriptor = findConversation(await readLocalProjects(dirPath), conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile))
  try {
    initializeSchema(db)
    return withTransaction(db, () => {
      assertConversationWriteLease(db, { holderInstanceId, leaseEpoch })
      const row = db.prepare('SELECT ordinal FROM messages WHERE message_uuid = ?').get(fromStorageId)
      if (!row) throw new Error('conversation_message_not_found')
      const result = db.prepare(`DELETE FROM messages WHERE ordinal ${inclusive ? '>=' : '>'} ?`).run(row.ordinal)
      return { ok: true, removed: Number(result.changes) || 0 }
    })
  } finally { db.close() }
}

async function deleteMessages({ dirPath, conversationId, holderInstanceId = '', leaseEpoch = null, storageIds = [] } = {}) {
  const ids = Array.isArray(storageIds) ? storageIds.map((id) => normalizeText(id).trim()).filter(Boolean) : []
  if (!ids.length) return { ok: true, removed: 0 }
  const descriptor = findConversation(await readLocalProjects(dirPath), conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile))
  try {
    initializeSchema(db)
    return withTransaction(db, () => {
      assertConversationWriteLease(db, { holderInstanceId, leaseEpoch })
      const stmt = db.prepare('DELETE FROM messages WHERE message_uuid = ?')
      let removed = 0
      for (const id of ids) removed += Number(stmt.run(id).changes) || 0
      return { ok: true, removed }
    })
  } finally { db.close() }
}

async function replaceActiveMessages({ dirPath, conversationId, holderInstanceId = '', leaseEpoch = null, messages = [] } = {}) {
  const descriptor = findConversation(await readLocalProjects(dirPath), conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile))
  try {
    initializeSchema(db)
    return withTransaction(db, () => {
      assertConversationWriteLease(db, { holderInstanceId, leaseEpoch })
      const activeStart = getActiveMessageStart(db)
      if (activeStart > 0) db.prepare('DELETE FROM messages WHERE ordinal >= ?').run(activeStart)
      else db.exec('DELETE FROM messages')
      let ordinal = activeStart > 0 ? activeStart - 1 : 0
      const messageIds = messages.map((message) => insertMessage(db, message, ++ordinal))
      return { ok: true, messageIds }
    })
  } finally { db.close() }
}

async function restoreConversationCompaction({
  dirPath,
  conversationId,
  snapshotId,
  expectedRevision,
  holderInstanceId = '',
  leaseEpoch = null,
  pageSize = 200
} = {}) {
  const projects = await readLocalProjects(dirPath)
  const descriptor = findConversation(projects, conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const requestedSnapshotId = normalizeText(snapshotId).trim()
  if (!requestedSnapshotId) throw new Error('conversation_compaction_snapshot_required')

  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile))
  try {
    initializeSchema(db)
    const result = withTransaction(db, () => {
      const row = getConversationRow(db)
      assertConversationWriteLease(db, { holderInstanceId, leaseEpoch })
      if (Number.isFinite(Number(expectedRevision)) && Number(expectedRevision) !== Number(row.revision)) {
        const error = new Error('conversation_revision_conflict')
        error.currentRevision = row.revision
        throw error
      }

      const outermost = db.prepare(`
        SELECT c.summary_id, c.message_uuid, m.ordinal
        FROM compaction_summaries c
        JOIN messages m ON m.message_uuid = c.message_uuid
        WHERE c.is_active = 1
        ORDER BY m.ordinal DESC
        LIMIT 1
      `).get()
      if (!outermost) throw new Error('conversation_compaction_not_found')
      if (outermost.summary_id !== requestedSnapshotId) {
        throw new Error('conversation_compaction_not_outermost')
      }

      const uiRows = db.prepare(`
        SELECT ui_uuid, message_uuid, payload_json
        FROM ui_messages
        WHERE role_code = 'compaction'
      `).all()
      const deleteUi = db.prepare('DELETE FROM ui_messages WHERE ui_uuid = ?')
      for (const uiRow of uiRows) {
        let matchesSnapshot = uiRow.message_uuid === outermost.message_uuid
        if (!matchesSnapshot) {
          try {
            const payload = JSON.parse(uiRow.payload_json)
            matchesSnapshot = normalizeText(payload?.snapshotId || payload?.id).trim() === requestedSnapshotId
          } catch {
            matchesSnapshot = false
          }
        }
        if (matchesSnapshot) deleteUi.run(uiRow.ui_uuid)
      }

      db.prepare('DELETE FROM messages WHERE message_uuid = ?').run(outermost.message_uuid)

      const archivesRow = db.prepare("SELECT value_json FROM session_state WHERE state_key = 'compactArchives'").get()
      if (archivesRow?.value_json) {
        try {
          const archives = hydrateAttachments(db, JSON.parse(archivesRow.value_json))
          if (Array.isArray(archives)) {
            const nextArchives = archives.filter((item) => normalizeText(item?.id).trim() !== requestedSnapshotId)
            const storedArchives = externalizeAttachments(db, nextArchives, 'state:compactArchives')
            db.prepare("UPDATE session_state SET value_json = ?, updated_at = ? WHERE state_key = 'compactArchives'")
              .run(JSON.stringify(storedArchives), nowIso())
          }
        } catch {
          // A malformed optional archive index must not block restoring the authoritative marker.
        }
      }

      const revision = Number(row.revision) + 1
      const updatedAt = nowIso()
      db.prepare('UPDATE conversation SET updated_at = ?, revision = ? WHERE conversation_id = ?')
        .run(updatedAt, revision, conversationId)
      return { revision, updatedAt, title: row.title }
    })

    const row = getConversationRow(db)
    const state = loadState(db)
    const activeStart = getActiveMessageStart(db)
    const shouldPage = activeStart === 0 && Number(pageSize) > 0
    const fullHistory = loadMessages(db, { activeOnly: true, limit: shouldPage ? pageSize : 0 })
    let chatShow = loadUiMessages(db, { activeOnly: true, limit: shouldPage ? pageSize : 0 })
    if (chatShow.length === 0) {
      chatShow = fullHistory
        .filter((message) => message.role !== 'tool')
        .map((message, index) => ({ ...clone(message), id: index + 1 }))
    }
    const nextDescriptor = {
      ...descriptor,
      title: row.title,
      revision: row.revision,
      updatedAt: row.updated_at
    }
    await writeLocalProjects(dirPath, updateConversation(projects, conversationId, {
      title: result.title,
      revision: result.revision,
      updatedAt: result.updatedAt
    }))
    return {
      ok: true,
      restoredSnapshotId: requestedSnapshotId,
      descriptor: nextDescriptor,
      sessionData: {
        anywhere_history: true,
        ...state,
        sessionMetadata: { ...(state.sessionMetadata || {}), title: row.title },
        fullHistory,
        history: [],
        chat_show: chatShow,
        conversationStorage: {
          format: 'sqlite',
          conversationId: row.conversation_id,
          dbFile: descriptor.dbFile,
          title: row.title,
          revision: row.revision,
          activeOnly: true,
          isPaged: shouldPage,
          loadedFromOrdinal: fullHistory.find((message) => message.role !== 'system')?.storageOrdinal || 0,
          loadedFromUiOrder: chatShow.find((message) => message.role !== 'system')?.uiStorageOrder || 0,
          pageSize: shouldPage ? Number(pageSize) : 0
        }
      }
    }
  } finally {
    db.close()
  }
}


async function renameConversation({
  dirPath,
  conversationId,
  title,
  projectId,
  expectedRevision,
  holderInstanceId = '',
  leaseEpoch = null
} = {}) {
  const nextTitle = normalizeText(title).trim()
  if (!nextTitle) throw new Error('conversation_title_required')
  const projects = await readLocalProjects(dirPath)
  const descriptor = findConversation(projects, conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile))
  let revision = 0
  const updatedAt = nowIso()
  try {
    withTransaction(db, () => {
      const row = getConversationRow(db)
      assertConversationWriteLease(db, { holderInstanceId, leaseEpoch })
      if (Number.isFinite(Number(expectedRevision)) && Number(expectedRevision) !== Number(row.revision)) {
        const error = new Error('conversation_revision_conflict')
        error.currentRevision = row.revision
        throw error
      }
      revision = Number(row.revision) + 1
      db.prepare('UPDATE conversation SET title = ?, updated_at = ?, revision = ? WHERE conversation_id = ?')
        .run(nextTitle, updatedAt, revision, conversationId)
    })
  } finally { db.close() }
  const assignedProjects = assignConversationProject(projects, conversationId, projectId)
  const nextProjects = updateConversation(assignedProjects, conversationId, { title: nextTitle, revision, updatedAt })
  await writeLocalProjects(dirPath, nextProjects)
  return { ok: true, conversationId, title: nextTitle, dbFile: descriptor.dbFile, revision, updatedAt }
}

async function deleteConversation({ dirPath, conversationId, holderInstanceId = '', leaseEpoch = null, deleteLegacyJson = false } = {}) {
  const projects = await readLocalProjects(dirPath)
  const descriptor = findConversation(projects, conversationId)
  if (!descriptor) return { ok: true, removed: false }
  const databasePath = resolveDatabasePath(dirPath, descriptor.dbFile)
  const db = openDatabase(databasePath)
  try {
    initializeSchema(db)
    assertConversationWriteLease(db, { holderInstanceId, leaseEpoch })
  } finally {
    db.close()
  }
  await fs.rm(databasePath, { force: true })
  if (deleteLegacyJson && descriptor.legacyJson) await fs.rm(path.join(path.resolve(dirPath), descriptor.legacyJson), { force: true })
  await writeLocalProjects(dirPath, removeConversationFromProjects(projects, conversationId))
  return { ok: true, removed: true }
}

async function acquireWriteLease({ dirPath, conversationId, holderInstanceId, holderApp = 'desktop', force = false } = {}) {
  const descriptor = findConversation(await readLocalProjects(dirPath), conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile))
  try {
    initializeSchema(db)
    return withTransaction(db, () => {
      const resource = 'conversation'
      const holder = normalizeText(holderInstanceId).trim()
      if (!holder) throw new Error('conversation_write_lease_holder_required')
      const current = db.prepare('SELECT * FROM write_lease WHERE resource = ?').get(resource)
      const expired = !current || new Date(current.expires_at).getTime() <= Date.now()
      if (!force && current && !expired && current.holder_instance_id !== holder) {
        return { ok: false, readonly: true, holderApp: current.holder_app, expiresAt: current.expires_at, leaseEpoch: current.lease_epoch }
      }
      const heartbeatAt = nowIso()
      const expiresAt = new Date(Date.now() + WRITE_LEASE_TTL_MS).toISOString()
      if (!force && current && !expired && current.holder_instance_id === holder) {
        db.prepare("UPDATE write_lease SET holder_app = ?, heartbeat_at = ?, expires_at = ? WHERE resource = 'conversation' AND holder_instance_id = ? AND lease_epoch = ?")
          .run(holderApp, heartbeatAt, expiresAt, holder, current.lease_epoch)
        return { ok: true, readonly: false, leaseEpoch: current.lease_epoch, expiresAt }
      }
      const epoch = Number(current?.lease_epoch || 0) + 1
      db.prepare(`
        INSERT INTO write_lease(resource, holder_instance_id, holder_app, lease_epoch, heartbeat_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(resource) DO UPDATE SET
          holder_instance_id = excluded.holder_instance_id,
          holder_app = excluded.holder_app,
          lease_epoch = excluded.lease_epoch,
          heartbeat_at = excluded.heartbeat_at,
          expires_at = excluded.expires_at
      `).run(resource, holder, holderApp, epoch, heartbeatAt, expiresAt)
      return { ok: true, readonly: false, leaseEpoch: epoch, expiresAt }
    })
  } finally { db.close() }
}

async function heartbeatWriteLease({ dirPath, conversationId, holderInstanceId, leaseEpoch } = {}) {
  const descriptor = findConversation(await readLocalProjects(dirPath), conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile))
  try {
    const expiresAt = new Date(Date.now() + WRITE_LEASE_TTL_MS).toISOString()
    const result = db.prepare(`
      UPDATE write_lease SET heartbeat_at = ?, expires_at = ?
      WHERE resource = 'conversation' AND holder_instance_id = ? AND lease_epoch = ?
    `).run(nowIso(), expiresAt, holderInstanceId, leaseEpoch)
    return { ok: Number(result.changes) === 1, expiresAt }
  } finally { db.close() }
}

async function releaseWriteLease({ dirPath, conversationId, holderInstanceId, leaseEpoch } = {}) {
  const descriptor = findConversation(await readLocalProjects(dirPath), conversationId)
  if (!descriptor) return { ok: true }
  const db = openDatabase(resolveDatabasePath(dirPath, descriptor.dbFile))
  try {
    db.prepare("DELETE FROM write_lease WHERE resource = 'conversation' AND holder_instance_id = ? AND lease_epoch = ?")
      .run(holderInstanceId, leaseEpoch)
    return { ok: true }
  } finally { db.close() }
}

async function createConversationSnapshot({ dirPath, conversationId, targetPath = '' } = {}) {
  const descriptor = findConversation(await readLocalProjects(dirPath), conversationId)
  if (!descriptor) throw new Error('conversation_not_found')
  const databasePath = resolveDatabasePath(dirPath, descriptor.dbFile)
  const destination = targetPath
    ? path.resolve(targetPath)
    : path.join(path.dirname(databasePath), `.snapshots`, `${descriptor.conversationId}-${Date.now()}.db`)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.rm(destination, { force: true })
  const db = openDatabase(databasePath)
  try {
    await sqliteBackup(db, destination)
  } finally { db.close() }
  return { ok: true, path: destination, filename: descriptor.dbFile, title: descriptor.title, conversationId }
}

async function readConversationSnapshot({ dirPath, conversationId } = {}) {
  const snapshot = await createConversationSnapshot({ dirPath, conversationId })
  try {
    const content = await fs.readFile(snapshot.path)
    return {
      ok: true,
      content,
      filename: snapshot.filename,
      title: snapshot.title,
      conversationId: snapshot.conversationId
    }
  } finally {
    await fs.rm(snapshot.path, { force: true }).catch(() => {})
  }
}

async function importConversationSnapshot({ dirPath, descriptor: rawDescriptor = {}, holderInstanceId = '', leaseEpoch = null, content } = {}) {
  const normalizedDir = path.resolve(normalizeText(dirPath).trim())
  if (!normalizedDir) throw new Error('conversation_local_dir_required')
  const conversationId = normalizeText(rawDescriptor.conversationId).trim()
  const dbFile = normalizeBasename(rawDescriptor.dbFile || createDatabaseFilename(conversationId))
  if (!conversationId || !dbFile.toLowerCase().endsWith(DB_EXTENSION)) throw new Error('conversation_descriptor_invalid')
  const bytes = Buffer.isBuffer(content)
    ? content
    : content instanceof ArrayBuffer
      ? Buffer.from(content)
      : content instanceof Uint8Array
        ? Buffer.from(content)
        : content?.encoding === 'base64' && typeof content?.data === 'string'
        ? Buffer.from(content.data, 'base64')
        : null
  if (!bytes?.length) throw new Error('conversation_snapshot_empty')

  await fs.mkdir(normalizedDir, { recursive: true })
  const finalPath = resolveDatabasePath(normalizedDir, dbFile)
  const downloadPath = `${finalPath}.download`
  if (await fs.access(finalPath).then(() => true, () => false)) {
    const activeDb = openDatabase(finalPath)
    try {
      initializeSchema(activeDb)
      assertConversationWriteLease(activeDb, { holderInstanceId, leaseEpoch })
    } finally {
      activeDb.close()
    }
  }
  await fs.writeFile(downloadPath, bytes)
  try {
    const db = openDatabase(downloadPath, { readOnly: true })
    try {
      const check = db.prepare('PRAGMA quick_check').get()
      if (!check || !Object.values(check).includes('ok')) throw new Error('conversation_database_integrity_failed')
      const row = getConversationRow(db)
      if (row.conversation_id !== conversationId) throw new Error('conversation_snapshot_identity_mismatch')
    } finally { db.close() }
    await fs.rm(finalPath, { force: true })
    await fs.rename(downloadPath, finalPath)

    const importedDb = openDatabase(finalPath)
    try {
      const importedRow = getConversationRow(importedDb)
      const importedTitle = normalizeText(rawDescriptor.title).trim() || importedRow.title
      const importedUpdatedAt = normalizeText(rawDescriptor.updatedAt).trim() || importedRow.updated_at
      const importedRevision = Math.max(Number(importedRow.revision) || 0, Number(rawDescriptor.revision) || 0)
      importedDb.prepare('UPDATE conversation SET title = ?, updated_at = ?, revision = ? WHERE conversation_id = ?')
        .run(importedTitle, importedUpdatedAt, importedRevision, conversationId)
    } finally {
      importedDb.close()
    }
    const descriptor = {
      conversationId,
      dbFile,
      title: normalizeText(rawDescriptor.title).trim() || conversationId,
      legacyJson: normalizeBasename(rawDescriptor.legacyJson),
      storageMode: normalizeText(rawDescriptor.storageMode, 'local').trim() || 'local',
      revision: Math.max(0, Number(rawDescriptor.revision) || 0),
      schemaVersion: Math.max(1, Number(rawDescriptor.schemaVersion) || SCHEMA_VERSION),
      createdAt: normalizeText(rawDescriptor.createdAt).trim() || nowIso(),
      updatedAt: normalizeText(rawDescriptor.updatedAt).trim() || nowIso()
    }
    const projects = registerConversation(await readLocalProjects(normalizedDir), descriptor)
    await writeLocalProjects(normalizedDir, projects)
    return { ok: true, descriptor, databasePath: finalPath }
  } catch (error) {
    await fs.rm(downloadPath, { force: true }).catch(() => {})
    throw error
  }
}


async function getConversationDescriptor({ dirPath, reference } = {}) {
  const descriptor = findConversation(await readLocalProjects(dirPath), reference)
  return descriptor ? { ok: true, descriptor } : { ok: false, descriptor: null }
}

const CONVERSATION_SCHEMA_VERSION = SCHEMA_VERSION

module.exports = {
  migrateJsonConversation,
  createConversation,
  openConversation,
  listLocalConversations,
  loadConversationPage,
  getConversationRequestMessages,
  saveConversationSnapshot,
  saveConversationState,
  appendMessages,
  updateMessage,
  truncateMessages,
  deleteMessages,
  replaceActiveMessages,
  restoreConversationCompaction,
  renameConversation,
  deleteConversation,
  acquireWriteLease,
  heartbeatWriteLease,
  releaseWriteLease,
  createConversationSnapshot,
  readConversationSnapshot,
  importConversationSnapshot,
  getConversationDescriptor,
  CONVERSATION_SCHEMA_VERSION
};
