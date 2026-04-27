const { MultiServerMCPClient } = require("@langchain/mcp-adapters");
const { getBuiltinTools, invokeBuiltinTool } = require('./mcp_builtin.js');

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
  }

  return result;
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

  return { id, ...runtimeConfig };
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
    isPersistent: Boolean(config.isPersistent)
  };
  return JSON.stringify(normalizedConfig);
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
      const runtimeConfig = buildMcpClientServerConfig(id, config, { useConfiguredTimeout: false });
      tempClient = new MultiServerMCPClient({ [id]: runtimeConfig }, { signal: controller.signal });
      return await tempClient.getTools();
    } catch (error) {
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
        const runtimeConfig = buildMcpClientServerConfig(id, config);
        const client = new MultiServerMCPClient({ [id]: runtimeConfig });
        const tools = await client.getTools();
        const oldToolsCache = cachedToolsMap[id] || [];
        await cacheResolvedTools(id, tools, oldToolsCache).catch(e => console.error(`[MCP] Auto-cache failed for persistent ${id}:`, e));
        registerFetchedTools(id, config, tools, false, true);
        persistentClients.set(id, client);
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
      const runtimeConfig = buildMcpClientServerConfig(serverConfig.id, serverConfig);
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
    const runtimeConfig = buildMcpClientServerConfig(id, config);
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
};
