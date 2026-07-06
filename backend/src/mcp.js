const { MultiServerMCPClient } = require("@langchain/mcp-adapters");
const { getBuiltinTools, invokeBuiltinTool } = require('./mcp_builtin.js');
const oauthStore = require('./mcp_oauth_store.js');
const oauthProvider = require('./mcp_oauth_provider.js');
const oauthCb = require('./mcp_oauth_cb.js');

const PERSISTENT_CONNECTION_LIMIT = 5; // uTools 限制最多5个持久连接
const ON_DEMAND_CONCURRENCY_LIMIT = 5; // 非持久连接的并发限制
const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

let persistentClients = new Map(); // 存储持久化客户端实例，它们会一直存在直到被明确关闭
let fullToolInfoMap = new Map();
let currentlyConnectedServerIds = new Set();
let inFlightToolFetchMap = new Map();

function sanitizeToolName(rawName, fallbackPrefix = 'tool') {
  const source = typeof rawName === 'string' ? rawName.trim() : '';
  const baseName = source || fallbackPrefix;
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized || fallbackPrefix;
}

function ensureUniqueToolAlias(alias, usedAliases, fallbackPrefix = 'tool') {
  const safeBase = sanitizeToolName(alias, fallbackPrefix);
  let candidate = safeBase;
  let index = 2;

  while (usedAliases.has(candidate)) {
    candidate = `${safeBase}_${index}`;
    index += 1;
  }

  usedAliases.add(candidate);
  return candidate;
}

function findCachedToolEntry(cachedTools = [], rawName = '', aliasName = '') {
  if (!Array.isArray(cachedTools) || cachedTools.length === 0) return null;
  return cachedTools.find(tool => {
    if (!tool || typeof tool !== 'object') return false;
    return tool.name === rawName
      || tool.alias === aliasName
      || tool.rawName === rawName
      || tool.originalName === rawName
      || (aliasName && tool.name === aliasName);
  }) || null;
}

function buildCachedToolRecord(tool, oldTool = null, aliasName = '') {
  const rawName = typeof tool?.name === 'string'
    ? tool.name
    : (typeof oldTool?.rawName === 'string' ? oldTool.rawName : '');

  return {
    name: rawName || aliasName,
    alias: aliasName || (typeof oldTool?.alias === 'string' ? oldTool.alias : ''),
    rawName: rawName || (typeof oldTool?.rawName === 'string' ? oldTool.rawName : ''),
    originalName: rawName || (typeof oldTool?.originalName === 'string' ? oldTool.originalName : ''),
    displayName: rawName || (typeof oldTool?.displayName === 'string' ? oldTool.displayName : aliasName),
    description: tool?.description,
    inputSchema: tool?.inputSchema || tool?.schema || {},
    enabled: oldTool ? (oldTool.enabled ?? true) : true
  };
}

function registerResolvedTool(tool, toolInfo, usedAliases) {
  if (!tool || !toolInfo) return null;

  const rawName = typeof tool.name === 'string' ? tool.name : '';
  const preferredAlias = sanitizeToolName(rawName, toolInfo.serverConfig?.id || 'tool');
  const aliasName = ensureUniqueToolAlias(preferredAlias, usedAliases, toolInfo.serverConfig?.id || 'tool');

  fullToolInfoMap.set(aliasName, {
    ...toolInfo,
    aliasName,
    rawName,
    originalName: rawName,
    displayName: rawName || aliasName
  });

  return aliasName;
}

function normalizeTransportType(transport) {
  const streamableHttpRegex = /^streamable[\s_-]?http$/i;
  if (streamableHttpRegex.test(transport)) {
    return 'http';
  }
  return transport;
}

/**
 * 预处理 stdio 类型的配置：
 * 1. 如果 command 中包含空格且没有 args，自动拆分（兼容通用 MCP 配置格式）
 * 2. 确保 env 中包含完整的 PATH，避免在 Electron 环境下找不到可执行文件
 */
function preprocessStdioConfig(config) {
  const result = { ...config };
  const transport = normalizeTransportType(result.transport || result.type || '');

  if (transport === 'stdio') {
    // 兼容 command 中包含参数的写法，如 "npx -y mcp-remote" 使用正则拆分，保护引号内的空格不被截断 (兼容 Windows 的 C:\Program Files\...)
    if (result.command && result.command.includes(' ') && (!result.args || result.args.length === 0)) {
      const parts = result.command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
      if (parts && parts.length > 0) {
        result.command = parts[0].replace(/^["']|["']$/g, '');
        result.args = parts.slice(1).map(arg => arg.replace(/^["']|["']$/g, ''));
      }
    }

    // 确保 env 中包含完整的 PATH，避免在 Electron 环境下找不到可执行文件
    if (result.env && typeof result.env === 'object') {
      if (Object.keys(result.env).length === 0) {
        delete result.env;
      } else {
        result.env = { ...process.env, ...result.env };
      }
    }

    // OAuth stdio env injection happens at connect time (async) via
    // prepareStdioAuthEnv, since token resolution is async.
  }

  return result;
}

// stdio OAuth env injection (async, resolves current token before spawn).
async function prepareStdioAuthEnv(serverConfig) {
  const auth = serverConfig && serverConfig.auth && typeof serverConfig.auth === 'object' ? serverConfig.auth : null;
  if (!auth || auth.type !== 'oauth' || !auth.oauth) return undefined;
  const serverId = serverConfig && serverConfig.id;
  if (!serverId) return undefined;
  const tokens = await oauthStore.loadTokens(serverId);
  if (!tokens || !tokens.access_token) return undefined;
  if (oauthStore.isExpired(tokens.expires_at)) {
    const err = new Error(`OAuth token expired for ${serverId}`);
    err.needsReauth = true;
    err.authExpired = true;
    throw err;
  }
  const mapping = (auth.oauth.envMapping && Array.isArray(auth.oauth.envMapping) && auth.oauth.envMapping.length)
    ? auth.oauth.envMapping
    : ['OAUTH_TOKEN', 'MCP_OAUTH_TOKEN'];
  const env = {};
  for (const key of mapping) env[key] = tokens.access_token;
  if (tokens.expires_at) env.OAUTH_EXPIRES_AT = String(tokens.expires_at);
  return env;
}

async function applyStdioAuthEnv(runtimeConfig, id, sourceConfig) {
  const transportType = normalizeTransportType(runtimeConfig.transport || runtimeConfig.type || sourceConfig?.transport || sourceConfig?.type || '');
  if (transportType !== 'stdio') return runtimeConfig;
  const stdioEnv = await prepareStdioAuthEnv({ id, ...(sourceConfig || {}) });
  if (stdioEnv) runtimeConfig.env = { ...(runtimeConfig.env || {}), ...stdioEnv };
  return runtimeConfig;
}


function normalizeMcpTimeoutSeconds(timeoutSeconds, fallbackSeconds = 120) {
  const numericValue = Number(timeoutSeconds);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallbackSeconds;
  }
  return numericValue;
}

function buildMcpClientServerConfig(id, config = {}, options = {}) {
  const sourceConfig = config && typeof config === 'object' ? config : {};
  const useConfiguredTimeout = options.useConfiguredTimeout !== false;
  const normalizedTimeoutSeconds = normalizeMcpTimeoutSeconds(sourceConfig.timeoutSeconds);
  const runtimeConfig = preprocessStdioConfig({
    ...sourceConfig,
    transport: normalizeTransportType(sourceConfig.transport || sourceConfig.type || '')
  });

  delete runtimeConfig.timeoutSeconds;
  delete runtimeConfig.timeout;

  if (useConfiguredTimeout) {
    runtimeConfig.defaultToolTimeout = normalizedTimeoutSeconds * 1000;
  } else {
    delete runtimeConfig.defaultToolTimeout;
  }

  // --- OAuth: mount authProvider for HTTP/SSE; inject env for stdio ---
  const auth = sourceConfig.auth && typeof sourceConfig.auth === 'object' ? sourceConfig.auth : null;
  const transportType = normalizeTransportType(sourceConfig.transport || sourceConfig.type || '');
  if (auth && auth.type === 'oauth' && (transportType === 'http' || transportType === 'sse')) {
    runtimeConfig.authProvider = oauthProvider.buildOAuthClientProvider(id, sourceConfig);
  }
  if (auth && auth.type === 'bearer' && auth.bearerToken) {
    // Static bearer stays in headers (existing behavior preserved).
    runtimeConfig.headers = { ...(runtimeConfig.headers || {}), Authorization: `Bearer ${auth.bearerToken}` };
  }
  delete runtimeConfig.auth;

  return { id, ...runtimeConfig };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      const item = stableValue(value[key]);
      if (item !== undefined) acc[key] = item;
      return acc;
    }, {});
  }
  return value;
}

function getToolFetchKey(id, config = {}) {
  const normalizedConfig = {
    id,
    transport: config.transport || config.type || '',
    command: config.command || '',
    args: Array.isArray(config.args) ? [...config.args] : [],
    url: config.url || config.baseUrl || '',
    env: config.env && typeof config.env === 'object' ? Object.entries(config.env).sort(([a], [b]) => a.localeCompare(b)) : [],
    headers: config.headers && typeof config.headers === 'object' ? Object.entries(config.headers).sort(([a], [b]) => a.localeCompare(b)) : [],
    auth: stableValue(config.auth || null),
    isPersistent: Boolean(config.isPersistent)
  };
  return JSON.stringify(normalizedConfig);
}

// ---------------------------------------------------------------------------
// OAuth auth orchestration
// ---------------------------------------------------------------------------

/**
 * Run the interactive OAuth login flow for a server when the SDK throws
 * UnauthorizedError. Steps:
 *   1. Build provider + start loopback callback.
 *   2. Trigger discovery+DCR via SDK auth() helper (this calls
 *      provider.redirectToAuthorization → external browser opens).
 *   3. Wait for callback, validate state.
 *   4. Exchange code via finishAuthFlow (transport.finishAuth if a client is
 *      reachable, else SDK auth() helper).
 *
 * Returns true on success, throws on failure. The caller reconnects after.
 */
async function ensureMcpAuthenticated(id, serverConfig) {
  const auth = serverConfig && serverConfig.auth && typeof serverConfig.auth === 'object' ? serverConfig.auth : null;
  if (!auth || auth.type !== 'oauth') return false;

  const transportType = normalizeTransportType(serverConfig.transport || serverConfig.type || '');
  if (transportType === 'stdio') {
    throw new Error(`Interactive OAuth login is not supported for stdio servers (${id}) in this release.`);
  }

  const serverUrl = serverConfig.url || serverConfig.baseUrl;
  if (!serverUrl) throw new Error(`OAuth login requires a server url for ${id}`);

  const seedProvider = oauthProvider.buildOAuthClientProvider(id, serverConfig);
  const state = typeof seedProvider.state === 'function' ? await seedProvider.state() : undefined;
  const loopback = await oauthCb.startLoopbackCallback({ expectedState: state, port: 0 });
  const liveProvider = oauthProvider.buildOAuthClientProvider(id, serverConfig, {
    redirectUri: loopback.redirectUri,
    state,
  });

  let authorizeUrl = null;
  liveProvider.redirectToAuthorization = async (url) => {
    authorizeUrl = String(url);
    try {
      const parsed = new URL(String(url));
      const nextState = parsed.searchParams.get('state');
      if (nextState && typeof liveProvider._getPendingState === 'function' && liveProvider._getPendingState() !== nextState) {
        // keep parity if the SDK regenerated state for any reason
        liveProvider._getPendingState = () => nextState;
      }
    } catch (_) {
      // ignore malformed urls here; a clearer error is thrown below if needed
    }
  };

  try {
    const { auth: sdkAuth } = oauthProvider.loadSdkAuth();
    try {
      await sdkAuth(liveProvider, { serverUrl });
    } catch (e) {
      if (!oauthProvider.isUnauthorizedError(e)) throw e;
    }

    const expectedState = typeof liveProvider._getPendingState === 'function'
      ? liveProvider._getPendingState()
      : state;
    if (!authorizeUrl) {
      throw new Error(`OAuth authorization URL was not generated for ${id}`);
    }

    const params = await oauthCb.runAuthFlowWithFallback({
      authorizeUrl,
      expectedState,
      preferredPort: 0,
      loopback,
    });

    await oauthProvider.finishAuthFlow({
      serverId: id,
      provider: liveProvider,
      serverConfig,
      transport: null,
      callbackParams: params,
      serverUrl
    });
    return true;
  } finally {
    if (loopback && loopback.cleanup) loopback.cleanup();
  }
}

/**
 * Returns the auth status for a server (for UI badge + refresh decisions).
 */
async function getMcpAuthStatus(serverId, serverConfig) {
  const auth = serverConfig && serverConfig.auth && typeof serverConfig.auth === 'object' ? serverConfig.auth : null;
  if (!auth) return { configured: false, authenticated: false, type: 'none' };
  if (auth.type === 'none') return { configured: false, authenticated: false, type: 'none' };
  if (auth.type === 'bearer') return { configured: Boolean(auth.bearerToken), authenticated: Boolean(auth.bearerToken), type: 'bearer' };
  if (auth.type === 'oauth') {
    const tokens = await oauthStore.loadTokens(serverId);
    const clientInfo = await oauthStore.loadClientInfo(serverId);
    const dcrSupported = !auth.oauth || auth.oauth.useDcr !== false;
    const expired = tokens ? oauthStore.isExpired(tokens.expires_at) : false;
    return {
      type: 'oauth',
      configured: Boolean(auth.oauth),
      authenticated: Boolean(tokens && tokens.access_token),
      expired,
      expiresAt: tokens ? tokens.expires_at : undefined,
      scope: tokens ? tokens.scope : undefined,
      dcrSupported,
      hasClient: Boolean(clientInfo || auth.oauth?.clientId)
    };
  }
  return { configured: false, authenticated: false, type: 'none' };
}

/**
 * 独立连接并获取工具列表的函数
 * 用于测试连接，以及无缓存时的临时连接获取
 * 包含 10s 超时和强制关闭逻辑
 */
async function connectAndFetchTools(id, config) {
  const fetchKey = getToolFetchKey(id, config || {});
  const existingRequest = inFlightToolFetchMap.get(fetchKey);
  if (existingRequest) {
    return await existingRequest;
  }

  const requestPromise = (async () => {
    if (config.transport === 'builtin' || config.type === 'builtin') {
      return getBuiltinTools(id);
    }

    let tempClient = null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const runtimeConfig = await applyStdioAuthEnv(buildMcpClientServerConfig(id, config, { useConfiguredTimeout: false }), id, config);
      tempClient = new MultiServerMCPClient({ [id]: runtimeConfig }, { signal: controller.signal });
      return await tempClient.getTools();
    } catch (error) {
      if (error && error.needsReauth) throw error;
      // OAuth: SDK ran discovery+DCR+redirectToAuthorization then threw UnauthorizedError.
      // For the ephemeral test-connect path we surface needsReauth so the UI can
      // drive the interactive login via mcpOAuth_startAuthFlow (avoid blocking here).
      if (config.auth && config.auth.type === 'oauth' && oauthProvider.isUnauthorizedError(error)) {
        const needsReauth = new Error(`OAuth authorization required for ${id}`);
        needsReauth.needsReauth = true;
        needsReauth.cause = error;
        throw needsReauth;
      }
      console.error(`[MCP] Error fetching tools from ${id}:`, error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
      if (tempClient) {
        try {
          await tempClient.close();
        } catch (closeError) {
          console.error(`[MCP] Error closing connection for ${id}:`, closeError);
        }
      }
    }
  })();

  inFlightToolFetchMap.set(fetchKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    if (inFlightToolFetchMap.get(fetchKey) === requestPromise) {
      inFlightToolFetchMap.delete(fetchKey);
    }
  }
}

async function initializeMcpClient(activeServerConfigs = {}, cachedToolsMap = {}, saveCacheCallback = null) {
  const newIds = new Set(Object.keys(activeServerConfigs));
  const oldIds = new Set(currentlyConnectedServerIds);
  const idsToAdd = [...newIds].filter(id => !oldIds.has(id));
  const idsToRemove = [...oldIds].filter(id => !newIds.has(id));
  const failedServerIds = [];

  for (const id of idsToRemove) {
    if (persistentClients.has(id)) {
      const client = persistentClients.get(id);
      try { await client.close(); } catch (e) { }
      persistentClients.delete(id);
    }

    for (const [toolName, toolInfo] of fullToolInfoMap.entries()) {
      if (toolInfo.serverConfig.id === id) {
        fullToolInfoMap.delete(toolName);
      }
    }
    currentlyConnectedServerIds.delete(id);
  }

  const usedAliases = new Set(
    [...fullToolInfoMap.values()]
      .map(toolInfo => toolInfo?.aliasName)
      .filter(Boolean)
  );

  const getToolEnabledState = (serverId, toolName, aliasName = '') => {
    if (cachedToolsMap && cachedToolsMap[serverId]) {
      const cachedTool = findCachedToolEntry(cachedToolsMap[serverId], toolName, aliasName);
      return cachedTool ? (cachedTool.enabled ?? true) : true;
    }
    return true;
  };

  const registerCachedTools = (serverId, config, tools = [], isBuiltin = false, isPersistent = false) => {
    tools.forEach((tool, index) => {
      const rawName = typeof tool?.rawName === 'string'
        ? tool.rawName
        : (typeof tool?.originalName === 'string' ? tool.originalName : tool?.name);
      const aliasName = ensureUniqueToolAlias(tool?.alias || tool?.name || `${serverId}_tool_${index + 1}`, usedAliases, serverId || 'tool');
      fullToolInfoMap.set(aliasName, {
        schema: tool?.inputSchema || tool?.schema,
        description: tool?.description,
        isPersistent,
        serverConfig: { id: serverId, ...config },
        isBuiltin,
        enabled: tool?.enabled ?? true,
        aliasName,
        rawName,
        originalName: rawName,
        displayName: tool?.displayName || rawName || aliasName
      });
    });
  };

  const cacheResolvedTools = async (serverId, tools = [], oldToolsCache = []) => {
    if (!saveCacheCallback || typeof saveCacheCallback !== 'function') return;
    const sanitizedTools = tools.map(tool => {
      const aliasName = sanitizeToolName(tool.name, serverId || 'tool');
      const oldTool = findCachedToolEntry(oldToolsCache, tool.name, aliasName);
      return buildCachedToolRecord(tool, oldTool, aliasName);
    });
    const cleanTools = JSON.parse(JSON.stringify(sanitizedTools));
    await saveCacheCallback(serverId, cleanTools, { emitEvent: false, reason: 'auto-bootstrap' });
  };

  const registerFetchedTools = (serverId, config, tools = [], isBuiltin = false, isPersistent = false) => {
    tools.forEach(tool => {
      const aliasName = registerResolvedTool(tool, {
        instance: isPersistent && !isBuiltin ? tool : undefined,
        schema: tool.schema || tool.inputSchema,
        description: tool.description,
        isPersistent,
        serverConfig: { id: serverId, ...config },
        isBuiltin,
        enabled: true
      }, usedAliases);
      const toolInfo = fullToolInfoMap.get(aliasName);
      if (toolInfo) {
        toolInfo.enabled = getToolEnabledState(serverId, tool.name, aliasName);
      }
    });
  };

  const onDemandConfigsToAdd = idsToAdd
    .map(id => ({ id, config: activeServerConfigs[id] }))
    .filter(({ config }) => config && !config.isPersistent);

  const persistentConfigsToAdd = idsToAdd
    .map(id => ({ id, config: activeServerConfigs[id] }))
    .filter(({ config }) => config && config.isPersistent);

  const onDemandToConnect = [];
  for (const { id, config } of onDemandConfigsToAdd) {
    const isBuiltin = config.transport === 'builtin' || config.type === 'builtin';
    if (!isBuiltin && Array.isArray(cachedToolsMap[id]) && cachedToolsMap[id].length > 0) {
      registerCachedTools(id, config, cachedToolsMap[id], false, false);
      currentlyConnectedServerIds.add(id);
    } else {
      onDemandToConnect.push({ id, config });
    }
  }

  if (onDemandToConnect.length > 0) {
    const pool = new Set();
    const allTasks = [];

    for (const { id, config } of onDemandToConnect) {
      const taskPromise = (async () => {
        try {
          const tools = await connectAndFetchTools(id, config);
          const isBuiltin = config.transport === 'builtin' || config.type === 'builtin';
          const oldToolsCache = cachedToolsMap[id] || [];
          await cacheResolvedTools(id, tools, oldToolsCache).catch(e => console.error(`[MCP] Auto-cache failed for ${id}:`, e));
          registerFetchedTools(id, config, tools, isBuiltin, false);
          currentlyConnectedServerIds.add(id);
        } catch (error) {
          if (error.name !== 'AbortError') {
            console.error(`[MCP Debug] Failed to process on-demand server ${id}. Error:`, error.message);
          }
          failedServerIds.push(id);
        }
      })();

      allTasks.push(taskPromise);
      pool.add(taskPromise);
      const cleanup = () => pool.delete(taskPromise);
      taskPromise.then(cleanup, cleanup);

      if (pool.size >= ON_DEMAND_CONCURRENCY_LIMIT) {
        await Promise.race(pool);
      }
    }

    await Promise.all(allTasks);
  }

  if (persistentConfigsToAdd.length > 0) {
    for (const { id, config } of persistentConfigsToAdd) {
      if (config.transport === 'builtin' || config.type === 'builtin') {
        try {
          const tools = getBuiltinTools(id);
          const oldToolsCache = cachedToolsMap[id] || [];
          await cacheResolvedTools(id, tools, oldToolsCache).catch(e => console.error(`[MCP] Auto-cache failed for persistent ${id}:`, e));
          registerFetchedTools(id, config, tools, true, true);
          currentlyConnectedServerIds.add(id);
        } catch (error) {
          console.error(`[MCP Debug] Failed to initialize builtin persistent server ${id}:`, error);
          failedServerIds.push(id);
        }
        continue;
      }

      if (persistentClients.size >= PERSISTENT_CONNECTION_LIMIT) {
        failedServerIds.push(id);
        continue;
      }

      try {
        const runtimeConfig = await applyStdioAuthEnv(buildMcpClientServerConfig(id, config), id, config);
        const client = new MultiServerMCPClient({ [id]: runtimeConfig });
        let tools;
        try {
          tools = await client.getTools();
        } catch (e) {
          if (config.auth && config.auth.type === 'oauth' && oauthProvider.isUnauthorizedError(e)) {
            // Run interactive login then reconnect once.
            await ensureMcpAuthenticated(id, config);
            try { await client.close(); } catch (_) { }
            const retryConfig = await applyStdioAuthEnv(buildMcpClientServerConfig(id, config), id, config);
            const retryClient = new MultiServerMCPClient({ [id]: retryConfig });
            tools = await retryClient.getTools();
            persistentClients.set(id, retryClient);
          } else {
            throw e;
          }
        }
        const oldToolsCache = cachedToolsMap[id] || [];
        await cacheResolvedTools(id, tools, oldToolsCache).catch(e => console.error(`[MCP] Auto-cache failed for persistent ${id}:`, e));
        registerFetchedTools(id, config, tools, false, true);
        if (!persistentClients.has(id)) persistentClients.set(id, client);
        currentlyConnectedServerIds.add(id);
      } catch (error) {
        console.error(`[MCP Debug] Failed to connect to persistent server ${id}:`, error);
        failedServerIds.push(id);
        const client = persistentClients.get(id);
        if (client) {
          try { await client.close(); } catch (e) { }
        }
        persistentClients.delete(id);
      }
    }
  }

  return {
    openaiFormattedTools: buildOpenaiFormattedTools(),
    successfulServerIds: [...currentlyConnectedServerIds],
    failedServerIds
  };
}

function buildOpenaiFormattedTools() {
  const formattedTools = [];
  for (const [, toolInfo] of fullToolInfoMap.entries()) {
    if (!toolInfo.schema || toolInfo.enabled === false) {
      continue;
    }

    const exportedName = toolInfo.aliasName || sanitizeToolName(toolInfo.rawName || toolInfo.displayName || 'tool');
    if (!TOOL_NAME_PATTERN.test(exportedName)) {
      continue;
    }

    formattedTools.push({
      type: "function",
      function: {
        name: exportedName,
        description: toolInfo.description,
        parameters: toolInfo.schema
      }
    });
  }
  return formattedTools;
}

/**
 * 此时如果是非持久化连接，会再次创建临时连接来执行工具
 */
async function invokeMcpTool(toolName, toolArgs, signal, context = null) {
  const toolInfo = fullToolInfoMap.get(toolName);
  const resolvedToolName = toolInfo?.rawName || toolInfo?.originalName || toolInfo?.displayName || toolName;
  const toolTimeoutMs = normalizeMcpTimeoutSeconds(toolInfo?.serverConfig?.timeoutSeconds) * 1000;

  if (!toolInfo) {
    try {
      return await invokeBuiltinTool(toolName, toolArgs, signal, context);
    } catch (e) {
      throw new Error(`Tool "${toolName}" not found.`);
    }
  }

  if (toolInfo.enabled === false) {
    throw new Error(`Tool "${toolInfo.displayName || toolName}" has been disabled.`);
  }

  if (toolInfo.isBuiltin) {
    return await invokeBuiltinTool(resolvedToolName, toolArgs, signal, context);
  }

  if (toolInfo.isPersistent && toolInfo.instance) {
    return await toolInfo.instance.call(toolArgs, { signal, timeout: toolTimeoutMs });
  }

  const serverConfig = toolInfo.serverConfig;
  if (!toolInfo.isPersistent && serverConfig) {
    let tempClient = null;
    const controller = new AbortController();

    if (signal) {
      if (signal.aborted) controller.abort();
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const runtimeConfig = await applyStdioAuthEnv(buildMcpClientServerConfig(serverConfig.id, serverConfig), serverConfig.id, serverConfig);
      tempClient = new MultiServerMCPClient({ [serverConfig.id]: runtimeConfig }, { signal: controller.signal });
      const tools = await tempClient.getTools();
      const toolToCall = tools.find(t => t.name === resolvedToolName || sanitizeToolName(t.name, serverConfig.id || 'tool') === toolName);
      if (!toolToCall) throw new Error(`Tool "${resolvedToolName}" not found.`);
      return await toolToCall.call(toolArgs, { signal: controller.signal, timeout: toolTimeoutMs });
    } finally {
      if (!signal) controller.abort();
      if (tempClient) await tempClient.close();
    }
  }

  throw new Error(`Configuration error for tool "${toolInfo.displayName || toolName}".`);
}

/**
 * 独立连接并执行工具
 * 用于在设置界面测试具体的工具调用
 */
async function connectAndInvokeTool(id, config, toolName, toolArgs, context = null) {
  if (config.transport === 'builtin' || config.type === 'builtin') {
    return await invokeBuiltinTool(toolName, toolArgs, null, context);
  }

  let tempClient = null;
  const controller = new AbortController();

  try {
    const runtimeConfig = await applyStdioAuthEnv(buildMcpClientServerConfig(id, config), id, config);
    tempClient = new MultiServerMCPClient({ [id]: runtimeConfig }, { signal: controller.signal });
    const tools = await tempClient.getTools();
    const normalizedToolName = sanitizeToolName(toolName, id || 'tool');
    const targetTool = tools.find(t => {
      const alias = sanitizeToolName(t.name, id || 'tool');
      return t.name === toolName || alias === toolName || alias === normalizedToolName || t.name === `${id}_${toolName}`;
    });

    if (!targetTool) {
      throw new Error(`Tool '${toolName}' not found on server '${id}'. Available tools: ${tools.map(t => t.name).join(', ')}`);
    }

    const toolTimeoutMs = normalizeMcpTimeoutSeconds(config?.timeoutSeconds) * 1000;

    return await targetTool.call(toolArgs, { signal: controller.signal, timeout: toolTimeoutMs });
  } catch (error) {
    if (config.auth && config.auth.type === 'oauth' && oauthProvider.isUnauthorizedError(error)) {
      const needsReauth = new Error(`OAuth authorization required for ${id}`);
      needsReauth.needsReauth = true;
      needsReauth.cause = error;
      throw needsReauth;
    }
    console.error(`[MCP] Error invoking tool ${toolName} on ${id}:`, error);
    throw error;
  } finally {
    controller.abort();
    if (tempClient) {
      try {
        if (typeof tempClient.close === 'function') {
          await tempClient.close();
        }
      } catch (closeError) {
        console.error(`[MCP] Error closing temp connection for ${id}:`, closeError);
      }
    }
  }
}

async function closeMcpClient() {
  if (persistentClients.size > 0) {
    for (const client of persistentClients.values()) {
      await client.close();
    }
    persistentClients.clear();
  }
  fullToolInfoMap.clear();
  currentlyConnectedServerIds.clear();
}

module.exports = {
  initializeMcpClient,
  invokeMcpTool,
  closeMcpClient,
  connectAndFetchTools,
  connectAndInvokeTool,
  ensureMcpAuthenticated,
  getMcpAuthStatus,
  _test: {
    getToolFetchKey,
    prepareStdioAuthEnv,
  },
};
