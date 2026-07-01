// MCP OAuth encrypted token / client persistence.
// Device-bound AES-256-GCM (scrypt over utools.getNativeId()), stored in utools.db
// per-device shards "mcpOAuthTokens_<nativeId>" / "mcpOAuthClients_<nativeId>".
//
// Design:
// - Running time: in-memory plaintext (decrypted once per use); no immediate erase.
// - At rest: access_token / refresh_token / id_token / client_secret are encrypted.
// - Keys/method signatures align with v1 OAuthClientProvider required set
//   (redirectUrl/clientMetadata/clientInformation/tokens/saveTokens), plus
//   codeVerifier persistence and forward-looking v2 stubs (saveDiscoveryState/
//   discoveryState/invalidateCredentials) so a future SDK bump only adds ctx params.
//
// IMPORTANT: this module must load under the uTools preload environment (global
// `utools` + `utools.db.promises`). In pure node (tests) a stub `utools` is
// injected by the caller (see test_oauth.js).

const crypto = require('crypto');

const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const SCRYPT_N = 1 << 15; // 32768
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const GCM_TAG_BYTES = 16;

// ---------------------------------------------------------------------------
// Device identity (stable fallback when getNativeId is missing/empty)
// ---------------------------------------------------------------------------

function getDeviceSeed() {
  const nativeId = (typeof utools !== 'undefined' && typeof utools.getNativeId === 'function')
    ? String(utools.getNativeId() || '')
    : '';
  if (nativeId) return nativeId;
  // Stable fallback: hash the native id + plugin id so the derived key is still
  // machine-bound even if getNativeId() returns empty transiently.
  const pluginId = (typeof utools !== 'undefined' && typeof utools.getAppId === 'function')
    ? String(utools.getAppId() || '')
    : 'anywhere-mcp';
  const h = crypto.createHash('sha256');
  h.update(`${nativeId}:${pluginId}`);
  return h.digest('hex');
}

function shardId(prefix) {
  const nativeId = (typeof utools !== 'undefined' && typeof utools.getNativeId === 'function')
    ? String(utools.getNativeId() || 'shared')
    : 'shared';
  return `${prefix}_${nativeId}`;
}

// ---------------------------------------------------------------------------
// AES-256-GCM encrypt / decrypt
// ---------------------------------------------------------------------------

function deriveKey(salt) {
  return crypto.scryptSync(getDeviceSeed(), salt, KEY_BYTES, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
    maxmem: 128 * SCRYPT_N * (SCRYPT_R * 2 + 1)
  });
}

function encrypt(plain) {
  if (plain === undefined || plain === null) return null;
  const text = typeof plain === 'string' ? plain : JSON.stringify(plain);
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = deriveKey(salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64')
  };
}

function decrypt(blob) {
  if (!blob || typeof blob !== 'object') return undefined;
  try {
    const salt = Buffer.from(blob.salt, 'base64');
    const iv = Buffer.from(blob.iv, 'base64');
    const ct = Buffer.from(blob.ct, 'base64');
    const tag = Buffer.from(blob.tag, 'base64');
    const key = deriveKey(salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    return pt;
  } catch (e) {
    // Malformed blob, GCM auth failure, wrong device, or tampered ciphertext.
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Shard helpers (utools.db.promises)
// ---------------------------------------------------------------------------

async function loadShard(id) {
  const doc = await utools.db.promises.get(id);
  return doc && doc.data ? doc.data : null;
}

async function saveShard(id, data) {
  const existing = await utools.db.promises.get(id);
  if (existing) {
    await utools.db.promises.put({ _id: id, _rev: existing._rev, data });
  } else {
    await utools.db.promises.put({ _id: id, data });
  }
}

function ensureMap(container, key) {
  if (!container || typeof container !== 'object') container = {};
  if (!container[key] || typeof container[key] !== 'object') container[key] = {};
  return container[key];
}

// ---------------------------------------------------------------------------
// Tokens (access / refresh / id / expires_at / scope) — encrypted at rest
// ---------------------------------------------------------------------------

async function loadTokens(serverId) {
  const shard = await loadShard(shardId('mcpOAuthTokens'));
  if (!shard) return undefined;
  const entry = shard[serverId];
  if (!entry) return undefined;
  const access_token = decrypt(entry.access_token);
  if (access_token === undefined) return undefined; // device mismatch / tamper
  const refresh_token = entry.refresh_token ? decrypt(entry.refresh_token) : undefined;
  const id_token = entry.id_token ? decrypt(entry.id_token) : undefined;
  return {
    access_token,
    refresh_token: refresh_token === undefined ? undefined : refresh_token,
    id_token: id_token === undefined ? undefined : id_token,
    expires_at: entry.expires_at,
    scope: entry.scope,
    token_type: entry.token_type || 'Bearer'
  };
}

async function saveTokens(serverId, tokens) {
  const id = shardId('mcpOAuthTokens');
  const shard = (await loadShard(id)) || {};
  const slot = ensureMap(shard, serverId);
  slot.access_token = encrypt(tokens?.access_token);
  slot.refresh_token = tokens?.refresh_token ? encrypt(tokens.refresh_token) : null;
  slot.id_token = tokens?.id_token ? encrypt(tokens.id_token) : null;
  slot.expires_at = tokens?.expires_at;
  slot.scope = tokens?.scope;
  slot.token_type = tokens?.token_type || 'Bearer';
  slot.updatedAt = Date.now();
  await saveShard(id, shard);
}

async function clearTokens(serverId) {
  const id = shardId('mcpOAuthTokens');
  const shard = (await loadShard(id)) || {};
  if (shard[serverId]) {
    delete shard[serverId];
    await saveShard(id, shard);
  }
}

// ---------------------------------------------------------------------------
// Client information (client_id / client_secret) — encrypted at rest
// ---------------------------------------------------------------------------

async function loadClientInfo(serverId) {
  const shard = await loadShard(shardId('mcpOAuthClients'));
  if (!shard) return undefined;
  const entry = shard[serverId];
  if (!entry) return undefined;
  const client_id = decrypt(entry.client_id);
  if (client_id === undefined) return undefined;
  const client_secret = entry.client_secret ? decrypt(entry.client_secret) : undefined;
  return {
    client_id,
    client_secret: client_secret === undefined ? undefined : client_secret,
    redirect_uris: entry.redirect_uris,
    grant_types: entry.grant_types,
    token_endpoint_auth_method: entry.token_endpoint_auth_method,
    registered_at: entry.registered_at
  };
}

async function saveClientInfo(serverId, info) {
  const id = shardId('mcpOAuthClients');
  const shard = (await loadShard(id)) || {};
  const slot = ensureMap(shard, serverId);
  slot.client_id = encrypt(info?.client_id);
  slot.client_secret = info?.client_secret ? encrypt(info.client_secret) : null;
  slot.redirect_uris = info?.redirect_uris;
  slot.grant_types = info?.grant_types;
  slot.token_endpoint_auth_method = info?.token_endpoint_auth_method;
  slot.registered_at = info?.registered_at || Date.now();
  await saveShard(id, shard);
}

async function clearClientInfo(serverId) {
  const id = shardId('mcpOAuthClients');
  const shard = (await loadShard(id)) || {};
  if (shard[serverId]) {
    delete shard[serverId];
    await saveShard(id, shard);
  }
}

// ---------------------------------------------------------------------------
// PKCE code verifier — plain (short-lived, low sensitivity) but still stored
// per-server so a reconnect mid-flow can resume.
// ---------------------------------------------------------------------------

async function loadCodeVerifier(serverId) {
  const shard = await loadShard(shardId('mcpOAuthVerifiers'));
  if (!shard) return undefined;
  return shard[serverId] || undefined;
}

async function saveCodeVerifier(serverId, verifier) {
  const id = shardId('mcpOAuthVerifiers');
  const shard = (await loadShard(id)) || {};
  const slot = ensureMap(shard, serverId);
  slot.value = verifier;
  slot.updatedAt = Date.now();
  await saveShard(id, shard);
}

async function clearCodeVerifier(serverId) {
  const id = shardId('mcpOAuthVerifiers');
  const shard = (await loadShard(id)) || {};
  if (shard[serverId]) {
    delete shard[serverId];
    await saveShard(id, shard);
  }
}

// ---------------------------------------------------------------------------
// Discovery state (v2 forward-looking; empty stubs for v1)
// ---------------------------------------------------------------------------

async function saveDiscoveryState(serverId, state) {
  const id = shardId('mcpOAuthDiscovery');
  const shard = (await loadShard(id)) || {};
  shard[serverId] = state || {};
  await saveShard(id, shard);
}

async function discoveryState(serverId) {
  const shard = await loadShard(shardId('mcpOAuthDiscovery'));
  return shard ? shard[serverId] : undefined;
}

async function invalidateCredentials(serverId, scope) {
  switch (scope) {
    case 'all':
      await clearTokens(serverId);
      await clearClientInfo(serverId);
      await clearCodeVerifier(serverId);
      break;
    case 'tokens':
      await clearTokens(serverId);
      break;
    case 'client':
      await clearClientInfo(serverId);
      break;
    case 'verifier':
      await clearCodeVerifier(serverId);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// stdio token refresh — stdio transport can't use SDK authProvider, so we
// refresh manually using the SDK refreshAuthorization helper (best-effort).
// Implemented in mcp_oauth_provider.js (needs provider context); here we just
// expose a thin expiry probe.
// ---------------------------------------------------------------------------

function isExpired(expiresAt, skewMs = 60_000) {
  if (!expiresAt) return false; // unknown expiry → assume valid
  const exp = typeof expiresAt === 'number' ? expiresAt : Date.parse(expiresAt);
  if (!Number.isFinite(exp)) return false;
  return Date.now() >= (exp - skewMs);
}

module.exports = {
  // crypto
  encrypt, decrypt, deriveKey, getDeviceSeed, shardId,
  // tokens
  loadTokens, saveTokens, clearTokens,
  // client info
  loadClientInfo, saveClientInfo, clearClientInfo,
  // pkce
  loadCodeVerifier, saveCodeVerifier, clearCodeVerifier,
  // discovery (v2 stubs)
  saveDiscoveryState, discoveryState,
  // misc
  invalidateCredentials, isExpired
};
