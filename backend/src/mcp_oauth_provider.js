// Polyfill URL.canParse for runtimes whose global URL lacks the Node 20+
// static canParse method (e.g. utools/electron preload). The MCP SDK
// (shared/auth.js SafeUrlSchema) calls URL.canParse during OAuth discovery;
// without this shim it throws "URL.canParse is not a function".
if (typeof URL === 'function' && typeof URL.canParse !== 'function') {
  URL.canParse = function canParse(url, base) {
    try {
      new URL(url, base);
      return true;
    } catch (_) {
      return false;
    }
  };
}

// MCP OAuth v1 OAuthClientProvider adapter + finishAuth orchestrator.
//
// Bridges:
//   - mcp_oauth_store.js (encrypted persistence of tokens/client/verifier)
//   - mcp_oauth_cb.js (callback capture + browser open)
// to the SDK's v1 OAuthClientProvider interface (auth.d.ts):
//   redirectUrl, clientMetadata, clientInformation(), saveClientInformation?(),
//   tokens(), saveTokens(), redirectToAuthorization(url),
//   codeVerifier(), saveCodeVerifier(v),
//   optional: state(), clientMetadataUrl?, invalidateCredentials?(scope)
//
// The SDK (StreamableHTTPClientTransport / SSEClientTransport) drives discovery,
// DCR, PKCE, and the 401 retry; our provider only supplies identity + storage +
// redirect handling. finishAuthFlow() is invoked by Phase B (mcp.js) when the
// SDK throws UnauthorizedError, to exchange the captured code for tokens.

const crypto = require('crypto');
const store = require('./mcp_oauth_store.js');
const cb = require('./mcp_oauth_cb.js');

// Statically require the SDK auth module so esbuild bundles it into the
// preload artifact. The dynamic require.resolve() approach used previously
// fails at runtime in the bundled utools environment (no resolvable
// node_modules there). The exports wildcard (`./*` → `./dist/cjs/*`) makes
// this subpath resolvable at build time; esbuild inlines it so `_sdkAuth` is
// populated in the bundle. The try/catch keeps a dynamic fallback for the
// non-bundled test environment (node tests run against src/ where pnpm
// isolation means the SDK isn't hoisted to a directly-resolvable location).
let _sdkAuth = null;
try {
  _sdkAuth = require('@modelcontextprotocol/sdk/client/auth.js');
} catch (_) { _sdkAuth = null; }

const DEFAULT_REDIRECT_PORT = 0; // ephemeral loopback

// ---------------------------------------------------------------------------
// buildOAuthClientProvider
// ---------------------------------------------------------------------------

/**
 * Build a v1 OAuthClientProvider for a given MCP server.
 *
 * @param {string} serverId
 * @param {object} serverConfig - full server config (must contain auth.oauth)
 * @param {object} [options]
 * @param {string} [options.redirectUri] - already-bound loopback redirect URI
 * @param {string} [options.state] - existing OAuth state to reuse for one flow
 * @returns {object} OAuthClientProvider implementation
 */
function buildOAuthClientProvider(serverId, serverConfig = {}, options = {}) {
  const oauth = (serverConfig.auth && serverConfig.auth.oauth) || {};
  const redirectPort = (oauth.redirectPath && Number(oauth.redirectPath)) || DEFAULT_REDIRECT_PORT;
  const redirectUri = options.redirectUri ? String(options.redirectUri) : cb.determineRedirectUri(redirectPort);

  // Bound state for the in-flight authorization (so the provider's
  // redirectToAuthorization and the orchestrator's runAuthFlowWithFallback
  // share the same expected state).
  let pendingState = options.state ? String(options.state) : null;

  const provider = {
    // --- required ---
    get redirectUrl() {
      return redirectUri;
    },
    get clientMetadata() {
      return {
        client_name: 'Anywhere MCP Client',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        application_type: 'native',
        token_endpoint_auth_method: oauth.clientSecret
          ? 'client_secret_post'
          : 'none'
      };
    },
    async clientInformation() {
      // Prefer user-supplied manual client (useDcr=false), else stored DCR result.
      if (oauth.clientId) {
        const stored = await store.loadClientInfo(serverId);
        const clientSecret = oauth.clientSecret || stored?.client_secret || undefined;
        return {
          client_id: oauth.clientId,
          client_secret: clientSecret,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_method: clientSecret
            ? 'client_secret_post'
            : 'none'
        };
      }
      return await store.loadClientInfo(serverId);
    },
    async saveClientInformation(info) {
      await store.saveClientInfo(serverId, info);
    },
    async tokens() {
      return await store.loadTokens(serverId);
    },
    async saveTokens(tokens) {
      // The SDK calls this after token exchange; store also refreshes happen via SDK.
      await store.saveTokens(serverId, tokens);
    },
    async redirectToAuthorization(url) {
      // SDK hands us the fully-built authorize URL (with state, code_challenge).
      // Capture state from the URL so the callback runtime can validate it.
      try {
        const u = new URL(String(url));
        pendingState = u.searchParams.get('state') || pendingState;
      } catch (_) { /* ignore */ }
      cb.openAuthorizationInExternal(url);
    },
    async codeVerifier() {
      const slot = await store.loadCodeVerifier(serverId);
      // loadCodeVerifier returns { value, updatedAt }; the SDK needs the raw
      // verifier string. Returning the wrapper object here would make
      // `code_verifier` serialize to "[object Object]" in the token request
      // and the server would reject it as "Invalid PKCE code_verifier".
      return slot ? slot.value : undefined;
    },
    async saveCodeVerifier(v) {
      await store.saveCodeVerifier(serverId, v);
    },

    // --- optional (v1) / forward-looking (v2) ---
    async state() {
      // Idempotent within one auth flow: the orchestrator calls state() to
      // seed the loopback callback's expectedState, then the SDK calls it
      // again to build the authorize URL. If we re-randomized on the second
      // call the two sides would diverge and the callback would reject with
      // "state mismatch". Reuse pendingState if already set; redirectToAuthorization
      // can still update it later when it parses the actual authorize URL.
      if (!pendingState) pendingState = crypto.randomBytes(16).toString('hex');
      return pendingState;
    },
    async invalidateCredentials(scope) {
      await store.invalidateCredentials(serverId, scope || 'all');
    },

    // --- exposed to orchestrator (not part of the interface contract) ---
    _serverId: serverId,
    _getPendingState() { return pendingState; },
    _redirectUri: redirectUri
  };

  return provider;
}

async function refreshOAuthTokens(serverId, serverConfig = {}) {
  const provider = buildOAuthClientProvider(serverId, serverConfig);
  const tokens = await provider.tokens();
  if (!tokens || !tokens.refresh_token) throw new Error('No OAuth refresh token available');

  const serverUrl = serverConfig.url || serverConfig.baseUrl;
  if (!serverUrl) throw new Error(`OAuth refresh requires a server url for ${serverId}`);

  const clientInformation = await provider.clientInformation();
  if (!clientInformation || !clientInformation.client_id) throw new Error('OAuth client information is missing');

  const {
    discoverOAuthServerInfo,
    refreshAuthorization,
    selectResourceURL,
  } = loadSdkAuth();

  const serverInfo = await discoverOAuthServerInfo(serverUrl);
  const resource = typeof selectResourceURL === 'function'
    ? await selectResourceURL(serverUrl, provider, serverInfo.resourceMetadata)
    : undefined;
  const refreshed = await refreshAuthorization(serverInfo.authorizationServerUrl, {
    metadata: serverInfo.authorizationServerMetadata,
    clientInformation,
    refreshToken: tokens.refresh_token,
    resource,
    addClientAuthentication: provider.addClientAuthentication,
  });
  const merged = {
    ...tokens,
    ...refreshed,
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
  };
  await provider.saveTokens(merged);
  return merged;
}

// ---------------------------------------------------------------------------
// finishAuthFlow — exchange captured code for tokens, then reconnect path
// ---------------------------------------------------------------------------

/**
 * Complete the authorization-code exchange using the SDK's auth() helper
 * (preferred) or the transport.finishAuth(code) method when a transport is
 * available (Phase B path A). After this, provider.tokens() returns the new
 * token set; the caller reconnects the MCP client.
 *
 * @param {object} args
 * @param {string} args.serverId
 * @param {object} args.provider - OAuthClientProvider from buildOAuthClientProvider
 * @param {object} args.serverConfig
 * @param {object} [args.transport] - SDK transport with finishAuth(code) (optional)
 * @param {object} args.callbackParams - { code, state, iss? } from callback runtime
 * @param {string} [args.serverUrl] - required when transport is null (for auth() helper)
 * @returns {Promise<{tokens:object}>}
 */
async function finishAuthFlow({ serverId, provider, serverConfig, transport, callbackParams, serverUrl }) {
  const { code } = callbackParams;
  if (!code) throw new Error('finishAuthFlow: missing authorization code');

  // Path A: transport available → use its finishAuth (SDK-managed).
  if (transport && typeof transport.finishAuth === 'function') {
    await transport.finishAuth(code);
    const tokens = await provider.tokens();
    return { tokens };
  }

  // Path B: no transport → call the SDK auth() helper directly to exchange.
  const { auth } = loadSdkAuth();
  const url = serverUrl || serverConfig?.url || serverConfig?.baseUrl;
  if (!url) throw new Error('finishAuthFlow: serverUrl required when transport is absent');
  const result = await auth(provider, {
    serverUrl: url,
    authorizationCode: code,
    scope: serverConfig?.auth?.oauth?.scopes?.join(' '),
    // resourceMetadataUrl left to SDK discovery
  });
  if (result !== 'AUTHORIZED') {
    // SDK throws UnauthorizedError internally on failure; reaching here means
    // a non-success result that didn't throw — surface it.
    const { UnauthorizedError } = loadSdkAuth();
    throw new UnauthorizedError('finishAuthFlow: authorization exchange did not complete');
  }
  const tokens = await provider.tokens();
  return { tokens };
}

// Resolve the SDK's CJS auth module. Prefer the static top-level require
// (bundled by esbuild) so this works in the utools preload artifact. Fall
// back to dynamic resolution from the adapter's location for the
// non-bundled test environment (pnpm isolation: SDK not hoisted to a path
// Node can resolve from this module directly).
function loadSdkAuth() {
  if (_sdkAuth) return _sdkAuth;
  const subpaths = [
    '@modelcontextprotocol/sdk/client/auth.js',
    '@modelcontextprotocol/sdk/dist/cjs/client/auth.js'
  ];
  // First, try resolving each subpath from the adapter's location (its
  // require stack sees the scoped SDK).
  try {
    const adapterMain = require.resolve('@langchain/mcp-adapters');
    const adapterDir = require('path').dirname(adapterMain);
    for (const sub of subpaths) {
      try {
        const resolved = require.resolve(sub, { paths: [adapterDir] });
        return require(resolved);
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* adapter not resolvable — fall through */ }
  // Fallback: resolve from this module's own directory (works if SDK is
  // hoisted to top-level or this module's tree can see it).
  for (const sub of subpaths) {
    try {
      const resolved = require.resolve(sub, { paths: [__dirname] });
      return require(resolved);
    } catch (_) { /* try next */ }
  }
  throw new Error('Could not resolve @modelcontextprotocol/sdk auth module');
}

// ---------------------------------------------------------------------------
// helpers for Phase B
// ---------------------------------------------------------------------------

function isUnauthorizedError(err) {
  if (!err) return false;
  if (err.name === 'UnauthorizedError') return true;
  // Duck-type (SDK error class identity may differ across resolutions).
  return err.message === 'Unauthorized' || /unauthorized/i.test(String(err.message));
}

/**
 * Build the full authorize URL ourselves is NOT needed — the SDK constructs it
 * during discovery+DCR and hands it to provider.redirectToAuthorization(). This
 * helper only exists to give Phase B a single entrypoint when it wants to
 * start the interactive flow on demand (prepareAuth). Currently it just returns
 * the provider so the caller can call the SDK auth() helper to trigger
 * discovery+DCR (which then calls redirectToAuthorization).
 */
function getProvider(serverId, serverConfig) {
  return buildOAuthClientProvider(serverId, serverConfig);
}

module.exports = {
  buildOAuthClientProvider,
  finishAuthFlow,
  isUnauthorizedError,
  getProvider,
  loadSdkAuth,
  refreshOAuthTokens
};
