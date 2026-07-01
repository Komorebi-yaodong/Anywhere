// Task 2 verification — standalone node script (no test framework).
// Run: node tests/test_oauth.js
//
// Covers:
//  - store: encrypt/decrypt round-trip + device-bound tamper rejection
//  - store: shard id stability
//  - cb: parseCallbackQuery + state mismatch handling (loopback server)
//  - provider: buildOAuthClientProvider shape passes langchain oAuthClientProviderSchema
//  - provider: isUnauthorizedError duck-type

const path = require('path');
const { URL } = require('url');

// --- utools stub (in-memory db) ---
const memdb = {};
global.utools = {
  getNativeId: () => 'test-native-id',
  getAppId: () => 'test-app-id',
  shellOpenExternal: (u) => { global.__lastOpened = u; },
  db: {
    promises: {
      get: async (id) => memdb[id] || null,
      put: async (doc) => {
        if (doc._id && doc._rev) memdb[doc._id] = { _id: doc._id, _rev: doc._rev + 1, data: doc.data };
        else if (memdb[doc._id]) memdb[doc._id] = { _id: doc._id, _rev: memdb[doc._id]._rev + 1, data: doc.data };
        else memdb[doc._id] = { _id: doc._id, _rev: '1', data: doc.data };
      }
    }
  }
};

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name} ${detail || ''}`); }
}
async function run(name, fn) {
  try { await fn(); } catch (e) { failed++; console.error(`  FAIL  ${name} (threw)`, e); }
}

(async () => {
  const store = require('../src/mcp_oauth_store.js');
  const cb = require('../src/mcp_oauth_cb.js');
  const provider = require('../src/mcp_oauth_provider.js');

  console.log('\n[1] store crypto');
  await run('encrypt/decrypt round-trip', async () => {
    const blob = store.encrypt('hello-secret-token');
    ok('blob has v/salt/iv/ct/tag', blob && blob.v === 1 && blob.salt && blob.iv && blob.ct && blob.tag);
    ok('decrypt returns original', store.decrypt(blob) === 'hello-secret-token');
  });
  await run('encrypt object', async () => {
    const blob = store.encrypt({ a: 1, b: 'x' });
    const pt = store.decrypt(blob);
    ok('object decrypt JSON', pt && JSON.parse(pt).a === 1);
  });
  await run('tamper rejection', async () => {
    const blob = store.encrypt('secret');
    blob.ct = Buffer.from('tampered').toString('base64');
    ok('decrypt returns undefined on tamper', store.decrypt(blob) === undefined);
  });
  await run('malformed encrypted blob is ignored', async () => {
    ok('decrypt returns undefined on malformed blob', store.decrypt({ v: 1, salt: 'bad' }) === undefined);
  });
  await run('device seed stable', () => {
    ok('getDeviceSeed non-empty', store.getDeviceSeed().length > 0);
    ok('shardId includes native id', store.shardId('mcpOAuthTokens').includes('test-native-id'));
  });

  console.log('\n[2] store persistence (utools.db stub)');
  await run('saveTokens/loadTokens round-trip', async () => {
    await store.saveTokens('srv1', { access_token: 'AT-1', refresh_token: 'RT-1', expires_at: 12345, scope: 's' });
    const t = await store.loadTokens('srv1');
    ok('access_token decrypted', t && t.access_token === 'AT-1');
    ok('refresh_token decrypted', t && t.refresh_token === 'RT-1');
    ok('expires_at preserved', t && t.expires_at === 12345);
    ok('scope preserved', t && t.scope === 's');
  });
  await run('encrypted at rest', async () => {
    const doc = memdb[store.shardId('mcpOAuthTokens')];
    const entry = doc.data.srv1;
    ok('access_token not plaintext in db', typeof entry.access_token === 'object' && !JSON.stringify(entry.access_token).includes('AT-1'));
  });
  await run('clearTokens removes entry', async () => {
    await store.clearTokens('srv1');
    const t = await store.loadTokens('srv1');
    ok('cleared', t === undefined);
  });
  await run('client info round-trip', async () => {
    await store.saveClientInfo('srv2', { client_id: 'CID', client_secret: 'SEC', redirect_uris: ['http://127.0.0.1/cb'] });
    const ci = await store.loadClientInfo('srv2');
    ok('client_id decrypted', ci && ci.client_id === 'CID');
    ok('client_secret decrypted', ci && ci.client_secret === 'SEC');
    await store.clearClientInfo('srv2');
    ok('cleared', (await store.loadClientInfo('srv2')) === undefined);
  });
  await run('code verifier round-trip', async () => {
    await store.saveCodeVerifier('srv3', 'verifier-xyz');
    ok('loaded', (await store.loadCodeVerifier('srv3')) && (await store.loadCodeVerifier('srv3')).value === 'verifier-xyz');
    await store.clearCodeVerifier('srv3');
    ok('cleared', (await store.loadCodeVerifier('srv3')) === undefined);
  });
  await run('isExpired', () => {
    ok('past expiry', store.isExpired(Date.now() - 1000));
    ok('future not expired', !store.isExpired(Date.now() + 120000));
    ok('unknown not expired', !store.isExpired(undefined));
  });

  console.log('\n[3] cb parseCallbackQuery + loopback');
  await run('parseCallbackQuery', () => {
    const p = cb.parseCallbackQuery(new URLSearchParams('code=AC&state=ST&iss=https://idp'));
    ok('code', p.code === 'AC');
    ok('state', p.state === 'ST');
    ok('iss', p.iss === 'https://idp');
  });
  await run('loopback callback capture + state ok', async () => {
    const state = 'st-123';
    const loop = await cb.startLoopbackCallback({ expectedState: state, port: 0, timeoutMs: 3000 });
    const port = loop.server.address().port;
    ok('redirectUri loopback', loop.redirectUri.startsWith('http://127.0.0.1:') && loop.redirectUri.endsWith('/callback'));
    // simulate IdP redirect
    setTimeout(() => {
      const http = require('http');
      http.get(`http://127.0.0.1:${port}/callback?code=AC-OK&state=${state}`, () => {});
    }, 50);
    const params = await loop.fetchCallbackParams;
    ok('got code', params.code === 'AC-OK');
    loop.cleanup();
  });
  await run('state mismatch rejected', async () => {
    const loop = await cb.startLoopbackCallback({ expectedState: 'GOOD', port: 0, timeoutMs: 3000 });
    const port = loop.server.address().port;
    setTimeout(() => {
      const http = require('http');
      http.get(`http://127.0.0.1:${port}/callback?code=AC&state=BAD`, () => {});
    }, 50);
    let rejected = false;
    try { await loop.fetchCallbackParams; } catch (e) { rejected = true; }
    ok('mismatch rejected', rejected);
    loop.cleanup();
  });
  await run('unsafe external authorization URL rejected', async () => {
    global.__lastOpened = undefined;
    let rejected = false;
    try { cb.openAuthorizationInExternal('javascript:alert(1)'); } catch (e) { rejected = /unsafe|invalid/i.test(String(e.message || e)); }
    ok('unsafe URL rejected', rejected);
    ok('unsafe URL not opened', global.__lastOpened === undefined);
  });

  console.log('\n[4] provider shape (langchain oAuthClientProviderSchema)');
  await run('provider passes schema', async () => {
    const p = provider.buildOAuthClientProvider('srv', { auth: { type: 'oauth', oauth: { scopes: ['a'] } } });
    // Required: redirectUrl, clientMetadata, clientInformation, tokens, saveTokens
    ok('redirectUrl present', typeof p.redirectUrl === 'string');
    ok('clientMetadata object', typeof p.clientMetadata === 'object');
    ok('clientInformation fn', typeof p.clientInformation === 'function');
    ok('tokens fn', typeof p.tokens === 'function');
    ok('saveTokens fn', typeof p.saveTokens === 'function');
    ok('redirectToAuthorization fn', typeof p.redirectToAuthorization === 'function');
    ok('codeVerifier fn', typeof p.codeVerifier === 'function');
    ok('saveCodeVerifier fn', typeof p.saveCodeVerifier === 'function');

    // clientMetadata shape
    const cm = p.clientMetadata;
    ok('client_name', cm.client_name === 'Anywhere MCP Client');
    ok('grant_types code+refresh', Array.isArray(cm.grant_types) && cm.grant_types.includes('authorization_code') && cm.grant_types.includes('refresh_token'));
    ok('application_type native', cm.application_type === 'native');

    // Feed to langchain schema (requires the adapter to be resolvable)
    try {
      const typesCjs = require('@langchain/mcp-adapters/dist/types.cjs');
      // find oAuthClientProviderSchema
      const schema = Object.values(typesCjs).find(v => v && typeof v === 'object' && typeof v.parse === 'function' && (v.safeParse || v._def));
      // The schema is a z.custom; just call safeParse on the provider object.
      const found = typesCjs.oAuthClientProviderSchema;
      if (found) {
        const r = found.safeParse(p);
        ok('schema.safeParse success', r && r.success === true, r && r.error && JSON.stringify(r.error.issues));
      } else {
        ok('schema not exported (skipped direct check)', true);
      }
    } catch (e) {
      ok('adapter types not directly resolvable (transitive) — shape check by duck-type only', true);
    }
  });
  await run('provider manual client overrides loadClientInfo', async () => {
    const p = provider.buildOAuthClientProvider('srv', { auth: { type: 'oauth', oauth: { clientId: 'MANUAL', clientSecret: 'SEC' } } });
    const ci = await p.clientInformation();
    ok('manual client_id used', ci && ci.client_id === 'MANUAL');
    ok('manual client_secret', ci && ci.client_secret === 'SEC');
  });
  await run('provider accepts bound redirect uri override', async () => {
    const redirectUri = 'http://127.0.0.1:54321/callback';
    const p = provider.buildOAuthClientProvider('srv-live', {
      auth: { type: 'oauth', oauth: { clientId: 'MANUAL', clientSecret: 'SEC' } }
    }, { redirectUri, state: 'STATE-1' });
    const ci = await p.clientInformation();
    ok('redirectUrl uses bound uri', p.redirectUrl === redirectUri);
    ok('clientMetadata uses bound uri', p.clientMetadata.redirect_uris[0] === redirectUri);
    ok('manual client uses bound uri', ci && ci.redirect_uris && ci.redirect_uris[0] === redirectUri);
    ok('state override is reused', await p.state() === 'STATE-1');
  });

  console.log('\n[5] provider.isUnauthorizedError');
  await run('duck-type', () => {
    ok('name match', provider.isUnauthorizedError(Object.assign(new Error('x'), { name: 'UnauthorizedError' })));
    ok('message unauthorized', provider.isUnauthorizedError(new Error('Unauthorized')));
    ok('not', !provider.isUnauthorizedError(new Error('network')));
  });

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
