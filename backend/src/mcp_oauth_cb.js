// MCP OAuth callback capture runtime.
// Orchestrates the redirect-URI side of the authorization-code flow:
//   - loopback HTTP server (primary) — RFC 8252 §4 native-app pattern
//   - BrowserWindow did-navigate interception (fallback) when loopback is blocked
//   - external browser open via utools.shellOpenExternal
//
// No OAuth protocol core here (that's the SDK's job via authProvider). We only
// capture the callback, validate state, and hand the code back to the orchestrator.

const http = require('http');
const { URL } = require('url');

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min for a human to log in
const PREFERRED_PORTS = [0]; // 0 = let OS pick an ephemeral loopback port

// ---------------------------------------------------------------------------
// Redirect URI — loopback preferred (http://127.0.0.1:<port>/callback)
// ---------------------------------------------------------------------------

function loopbackRedirectUri(port) {
  return `http://127.0.0.1:${port}/callback`;
}

/**
 * Determine the redirect URI we will advertise to the IdP. We always use a
 * loopback address so the SDK's provider.redirectUrl returns a stable value.
 * The concrete port is only known after we bind; we pre-bind to discover it and
 * reuse the port in the auth URL. Caller passes the bound port back via the
 * provider's redirectUrl getter (see mcp_oauth_provider.js).
 */
function determineRedirectUri(port = 0) {
  return loopbackRedirectUri(port);
}

// ---------------------------------------------------------------------------
// Loopback HTTP callback server
// ---------------------------------------------------------------------------

/**
 * Start a loopback HTTP server that resolves once the IdP redirects back.
 *
 * @param {object} opts
 * @param {string} opts.expectedState - state value we sent in authorize URL
 * @param {number} [opts.port] - preferred port (0 = ephemeral)
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{redirectUri:string, server:Server, cleanup:Function, fetchCallbackParams:Promise}>}
 */
function startLoopbackCallback({ expectedState, port = 0, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    let timer = null;
    let callbackResolve = null;
    const callbackParamsPromise = new Promise((res, rej) => { callbackResolve = { res, rej }; });

    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
        const params = parseCallbackQuery(reqUrl.searchParams);
        respondAndClose(req, res, params, expectedState, callbackResolve, server);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>Bad callback</h1><pre>${escapeHtml(String(e && e.message || e))}</pre>`);
      }
    });

    server.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    server.listen(port, '127.0.0.1', () => {
      const boundPort = server.address().port;
      timer = setTimeout(() => {
        cleanup();
        callbackResolve.rej(new Error('OAuth callback timed out'));
      }, timeoutMs);

      function cleanup() {
        if (timer) { clearTimeout(timer); timer = null; }
        try { server.close(); } catch (_) { /* ignore */ }
      }

      resolve({
        redirectUri: loopbackRedirectUri(boundPort),
        server,
        cleanup,
        fetchCallbackParams: callbackParamsPromise
      });
    });
  });
}

function parseCallbackQuery(searchParams) {
  const params = {
    code: searchParams.get('code') || undefined,
    state: searchParams.get('state') || undefined,
    iss: searchParams.get('iss') || undefined,
    error: searchParams.get('error') || undefined,
    error_description: searchParams.get('error_description') || undefined
  };
  return params;
}

function respondAndClose(req, res, params, expectedState, callbackResolve, server) {
  let htmlBody;
  if (params.error) {
    htmlBody = `<h1>登录失败</h1><p>${escapeHtml(params.error)}${params.error_description ? ': ' + escapeHtml(params.error_description) : ''}</p>`;
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlBody);
    callbackResolve.rej(new Error(`OAuth error: ${params.error}${params.error_description ? ' — ' + params.error_description : ''}`));
    return;
  }
  if (!params.code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>缺少授权码</h1>');
    callbackResolve.rej(new Error('OAuth callback missing code'));
    return;
  }
  if (expectedState && params.state !== expectedState) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>state 不匹配（拒绝）</h1>');
    callbackResolve.rej(new Error('OAuth state mismatch'));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>登录成功，可关闭此页面返回 Anywhere。</h1>');
  callbackResolve.res(params);
}

// ---------------------------------------------------------------------------
// BrowserWindow fallback
// ---------------------------------------------------------------------------

/**
 * Fallback when loopback is unavailable: open a BrowserWindow, load the
 * authorize URL, and intercept did-navigate to catch the redirect to the
 * loopback/registered URI (even if the server isn't actually listening).
 */
function startBrowserWindowFallback({ authorizeUrl, redirectUri, expectedState, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const redirectBase = redirectUri.split('?')[0];
    const timer = setTimeout(() => {
      reject(new Error('BrowserWindow OAuth callback timed out'));
    }, timeoutMs);

    let win = null;
    try {
      const safeAuthorizeUrl = normalizeExternalAuthorizationUrl(authorizeUrl);
      const { BrowserWindow } = require('electron');
      win = new BrowserWindow({ width: 900, height: 700, show: true });
      win.loadURL(safeAuthorizeUrl);

      const onNavigate = (event, url) => {
        if (!url) return;
        let u;
        try { u = new URL(url); } catch (_) { return; }
        const candidate = `${u.protocol}//${u.host}${u.pathname}`;
        if (candidate.startsWith(redirectBase) || url.startsWith(redirectBase)) {
          const params = parseCallbackQuery(u.searchParams);
          clearTimeout(timer);
          if (params.error) { reject(new Error(`OAuth error: ${params.error}`)); }
          else if (!params.code) { reject(new Error('OAuth callback missing code')); }
          else if (expectedState && params.state !== expectedState) { reject(new Error('OAuth state mismatch')); }
          else { resolve(params); }
          try { win.close(); } catch (_) { /* ignore */ }
        }
      };
      win.webContents.on('did-navigate', onNavigate);
      win.webContents.on('did-navigate-in-page', onNavigate);
      win.on('closed', () => {
        clearTimeout(timer);
        reject(new Error('OAuth browser window closed before callback'));
      });
    } catch (e) {
      clearTimeout(timer);
      reject(new Error(`BrowserWindow OAuth fallback unavailable: ${e && e.message}`));
    }
  });
}

// ---------------------------------------------------------------------------
// External open
// ---------------------------------------------------------------------------

function openAuthorizationInExternal(url) {
  const u = normalizeExternalAuthorizationUrl(url);
  if (typeof utools !== 'undefined' && typeof utools.shellOpenExternal === 'function') {
    return utools.shellOpenExternal(u);
  }
  if (typeof require === 'function') {
    try {
      const { shell } = require('electron');
      if (shell && shell.openExternal) return shell.openExternal(u);
    } catch (_) { /* fall through */ }
  }
  // Last resort: no-op (caller should handle)
  return undefined;
}

function normalizeExternalAuthorizationUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch (_) {
    throw new Error('Invalid OAuth authorization URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsafe OAuth authorization URL protocol: ${parsed.protocol}`);
  }
  return parsed.toString();
}

// ---------------------------------------------------------------------------
// Orchestration: loopback primary, BrowserWindow fallback
// ---------------------------------------------------------------------------

/**
 * Run the authorization step:
 *  1. Start loopback callback server (discover port).
 *  2. Open authorize URL in external browser (provider already built the URL).
 *  3. Wait for callback; on loopback failure/timeout, fall back to BrowserWindow.
 *
 * @param {object} opts
 * @param {URL|string} opts.authorizeUrl
 * @param {string} opts.expectedState
 * @param {number} [opts.preferredPort=0]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{code:string, state:string, iss?:string}>}
 */
async function runAuthFlowWithFallback({ authorizeUrl, expectedState, preferredPort = 0, timeoutMs }) {
  let loopback = null;
  try {
    loopback = await startLoopbackCallback({ expectedState, port: preferredPort, timeoutMs });
    openAuthorizationInExternal(authorizeUrl);
    const params = await loopback.fetchCallbackParams;
    return params;
  } catch (loopbackErr) {
    if (loopback && loopback.cleanup) loopback.cleanup();
    // Fallback path: if loopback itself couldn't start, use BrowserWindow to
    // intercept the redirect. If loopback started but timed out, the fallback
    // still intercepts navigation to the loopback URI.
    const redirectUri = loopback ? loopback.redirectUri : loopbackRedirectUri(preferredPort);
    const params = await startBrowserWindowFallback({ authorizeUrl, redirectUri, expectedState, timeoutMs });
    return params;
  } finally {
    if (loopback && loopback.cleanup) loopback.cleanup();
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = {
  loopbackRedirectUri,
  determineRedirectUri,
  startLoopbackCallback,
  startBrowserWindowFallback,
  openAuthorizationInExternal,
  runAuthFlowWithFallback,
  parseCallbackQuery
};
