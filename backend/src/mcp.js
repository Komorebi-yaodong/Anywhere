const { MultiServerMCPClient } = require("@langchain/mcp-adapters");
const { getBuiltinTools, invokeBuiltinTool } = require('./mcp_builtin.js');

const PERSISTENT_CONNECTION_LIMIT = 5; // uTools 限制最多5个持久连接
const ON_DEMAND_CONCURRENCY_LIMIT = 5; // 非持久连接的并发限制

let persistentClients = new Map(); // 存储持久化客户端实例，它们会一直存在直到被明确关闭
let fullToolInfoMap = new Map();
let currentlyConnectedServerIds = new Set();

function normalizeTransportType(transport) {
  const streamableHttpRegex = /^streamable[\s_-]?http$/i;
  if (streamableHttpRegex.test(transport)) {
    return 'http';
  }
  return transport;
}

/**
 * 独立连接并获取工具列表的函数
 * 用于测试连接，以及无缓存时的临时连接获取
 * 包含 10s 超时和强制关闭逻辑
 */
async function connectAndFetchTools(id, config) {
  // [拦截] 内置类型直接返回定义的工具列表
  if (config.transport === 'builtin' || config.type === 'builtin') {
    return getBuiltinTools(id);
  }

  // console.log(`[MCP] Connecting to ${id} (${config.transport})...`);
  let tempClient = null;
  const controller = new AbortController();

  // 设置超时，防止连接卡死导致无法关闭 (特别是 stdio)
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

  try {
    const modifiedConfig = { ...config, transport: normalizeTransportType(config.transport) };

    // 创建客户端
    tempClient = new MultiServerMCPClient({ [id]: { id, ...modifiedConfig } }, { signal: controller.signal });

    // 获取工具
    const tools = await tempClient.getTools();
    // console.log(`[MCP] Successfully fetched ${tools.length} tools from ${id}`);

    return tools; // 返回原生工具数组
  } catch (error) {
    console.error(`[MCP] Error fetching tools from ${id}:`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    controller.abort(); // 确保信号中止
    if (tempClient) {
      try {
        // console.log(`[MCP] Closing temp connection for ${id}...`);
        await tempClient.close();
        // console.log(`[MCP] Connection closed for ${id}`);
      } catch (closeError) {
        console.error(`[MCP] Error closing connection for ${id}:`, closeError);
      }
    }
  }
}

/**
 * 增量式地初始化/同步 MCP 客户端。
 * 1. 先处理非持久连接（优先使用缓存，无缓存则即用即走并自动缓存）
 * 2. 再处理持久连接
 * 3. saveCacheCallback 参数，用于自动缓存获取到的工具
 */
async function initializeMcpClient(activeServerConfigs = {}, cachedToolsMap = {}, saveCacheCallback = null) {
  const newIds = new Set(Object.keys(activeServerConfigs));
  const oldIds = new Set(currentlyConnectedServerIds);

  const idsToAdd = [...newIds].filter(id => !oldIds.has(id));
  const idsToRemove = [...oldIds].filter(id => !newIds.has(id));
  const failedServerIds = [];

  // --- 步骤 1: 处理需要移除的服务 ---
  for (const id of idsToRemove) {
    if (persistentClients.has(id)) {
      const client = persistentClients.get(id);
      try { await client.close(); } catch (e) { }
      persistentClients.delete(id);
    }
    // 移除相关工具
    for (const [toolName, toolInfo] of fullToolInfoMap.entries()) {
      if (toolInfo.serverConfig.id === id) {
        fullToolInfoMap.delete(toolName);
      }
    }
    currentlyConnectedServerIds.delete(id);
  }

  const onDemandConfigsToAdd = idsToAdd
    .map(id => ({ id, config: activeServerConfigs[id] }))
    .filter(({ config }) => config && !config.isPersistent);

  const persistentConfigsToAdd = idsToAdd
    .map(id => ({ id, config: activeServerConfigs[id] }))
    .filter(({ config }) => config && config.isPersistent);

  // 辅助函数：获取工具的启用状态
  const getToolEnabledState = (serverId, toolName) => {
    if (cachedToolsMap && cachedToolsMap[serverId]) {
      const cachedTool = cachedToolsMap[serverId].find(t => t.name === toolName);
      // 如果缓存中有记录，使用缓存的 enabled，否则默认 true
      return cachedTool ? (cachedTool.enabled ?? true) : true;
    }
    return true;
  };

  // --- 步骤 2: 处理非持久化（即用即走）连接 ---
  const onDemandToConnect = [];

  for (const { id, config } of onDemandConfigsToAdd) {
    const isBuiltin = config.transport === 'builtin' || config.type === 'builtin';

    // 如果是内置服务，不再直接使用缓存，确保走 onDemandToConnect 路径以拉取源码定义
    if (!isBuiltin && cachedToolsMap && cachedToolsMap[id] && Array.isArray(cachedToolsMap[id]) && cachedToolsMap[id].length > 0) {
      const tools = cachedToolsMap[id];
      tools.forEach(tool => {
        fullToolInfoMap.set(tool.name, {
          schema: tool.inputSchema || tool.schema,
          description: tool.description,
          isPersistent: false,
          serverConfig: { id, ...config },
          isBuiltin: false,
          enabled: tool.enabled ?? true
        });
      });
      currentlyConnectedServerIds.add(id);
    } else {
      onDemandToConnect.push({ id, config });
    }
  }

  // 对无缓存(或内置)的非持久化服务进行连接获取
  if (onDemandToConnect.length > 0) {
    const pool = new Set();
    const allTasks = [];

    for (const { id, config } of onDemandToConnect) {
      const taskPromise = (async () => {
        try {
          const tools = await connectAndFetchTools(id, config);

          // 自动缓存逻辑
          if (saveCacheCallback && typeof saveCacheCallback === 'function') {
            // 保存前合并旧缓存的 enabled 状态
            const oldToolsCache = cachedToolsMap[id] || [];
            const sanitizedTools = tools.map(tool => {
              const oldTool = oldToolsCache.find(t => t.name === tool.name);
              return {
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema || tool.schema || {},
                enabled: oldTool ? (oldTool.enabled ?? true) : true
              };
            });
            const cleanTools = JSON.parse(JSON.stringify(sanitizedTools));
            saveCacheCallback(id, cleanTools).catch(e => console.error(`[MCP] Auto-cache failed for ${id}:`, e));
          }

          const isBuiltin = config.transport === 'builtin' || config.type === 'builtin';

          tools.forEach(tool => {
            fullToolInfoMap.set(tool.name, {
              schema: tool.schema || tool.inputSchema,
              description: tool.description,
              isPersistent: false,
              serverConfig: { id, ...config },
              isBuiltin: isBuiltin,
              enabled: getToolEnabledState(id, tool.name) // [新增] 应用状态
            });
          });
          currentlyConnectedServerIds.add(id);
        } catch (error) {
          if (error.name !== 'AbortError') console.error(`[MCP Debug] Failed to process on-demand server ${id}. Error:`, error.message);
          failedServerIds.push(id);
        }
      })();

      allTasks.push(taskPromise);
      pool.add(taskPromise);
      const cleanup = () => pool.delete(taskPromise);
      taskPromise.then(cleanup, cleanup);

      if (pool.size >= 5) { // ON_DEMAND_CONCURRENCY_LIMIT
        await Promise.race(pool);
      }
    }
    await Promise.all(allTasks);
  }

  // --- 步骤 3: 处理需要持久化的连接 ---
  if (persistentConfigsToAdd.length > 0) {
    for (const { id, config } of persistentConfigsToAdd) {
      // 内置且持久化
      if (config.transport === 'builtin' || config.type === 'builtin') {
        try {
          const tools = require('./mcp_builtin.js').getBuiltinTools(id);

          // [新增] 强制更新内置服务的缓存
          if (saveCacheCallback && typeof saveCacheCallback === 'function') {
            const oldToolsCache = cachedToolsMap[id] || [];
            const sanitizedTools = tools.map(tool => {
              const oldTool = oldToolsCache.find(t => t.name === tool.name);
              return {
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema || tool.schema || {},
                enabled: oldTool ? (oldTool.enabled ?? true) : true // 保留用户的开关状态
              };
            });
            saveCacheCallback(id, JSON.parse(JSON.stringify(sanitizedTools))).catch(e => { });
          }

          tools.forEach(tool => {
            fullToolInfoMap.set(tool.name, {
              schema: tool.schema || tool.inputSchema,
              description: tool.description,
              isPersistent: true,
              serverConfig: { id, ...config },
              isBuiltin: true,
              enabled: getToolEnabledState(id, tool.name)
            });
          });
          currentlyConnectedServerIds.add(id);
        } catch (e) {
          failedServerIds.push(id);
        }
        continue;
      }

      if (persistentClients.size >= 5) { // PERSISTENT_CONNECTION_LIMIT
        failedServerIds.push(id);
        continue;
      }
      try {
        const modifiedConfig = { ...config, transport: normalizeTransportType(config.transport) };
        const client = new MultiServerMCPClient({ [id]: { id, ...modifiedConfig } });
        const tools = await client.getTools();

        if (saveCacheCallback && typeof saveCacheCallback === 'function') {
          const oldToolsCache = cachedToolsMap[id] || [];
          const sanitizedTools = tools.map(tool => {
            const oldTool = oldToolsCache.find(t => t.name === tool.name);
            return {
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema || tool.schema || {},
              enabled: oldTool ? (oldTool.enabled ?? true) : true
            };
          });
          const cleanTools = JSON.parse(JSON.stringify(sanitizedTools));
          saveCacheCallback(id, cleanTools).catch(e => console.error(`[MCP] Auto-cache failed for persistent ${id}:`, e));
        }

        tools.forEach(tool => {
          fullToolInfoMap.set(tool.name, {
            instance: tool,
            schema: tool.schema || tool.inputSchema,
            description: tool.description,
            isPersistent: true,
            serverConfig: { id, ...config },
            isBuiltin: false,
            enabled: getToolEnabledState(id, tool.name) // [新增] 应用状态
          });
        });
        persistentClients.set(id, client);
        currentlyConnectedServerIds.add(id);
      } catch (error) {
        console.error(`[MCP Debug] Failed to connect to persistent server ${id}:`, error);
        failedServerIds.push(id);
        const client = persistentClients.get(id);
        if (client) await client.close();
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
  for (const [toolName, toolInfo] of fullToolInfoMap.entries()) {
    if (toolInfo.schema && toolInfo.enabled !== false) {
      formattedTools.push({
        type: "function",
        function: { name: toolName, description: toolInfo.description, parameters: toolInfo.schema }
      });
    }
  }
  return formattedTools;
}

/**
 * 此时如果是非持久化连接，会再次创建临时连接来执行工具
 */
async function invokeMcpTool(toolName, toolArgs, signal, context = null) {
  const toolInfo = fullToolInfoMap.get(toolName);

  if (!toolInfo) {
    try {
      const { invokeBuiltinTool } = require('./mcp_builtin.js');
      return await invokeBuiltinTool(toolName, toolArgs, signal, context);
    } catch (e) {
      throw new Error(`Tool "${toolName}" not found.`);
    }
  }

  if (toolInfo.enabled === false) {
    throw new Error(`Tool "${toolName}" has been disabled.`);
  }

  // 2. 如果是注册过的内置工具，调用 invokeBuiltinTool 并传递 signal 和 context
  if (toolInfo.isBuiltin) {
    const { invokeBuiltinTool } = require('./mcp_builtin.js');
    return await invokeBuiltinTool(toolName, toolArgs, signal, context);
  }

  // 3. 持久连接
  if (toolInfo.isPersistent && toolInfo.instance) {
    return await toolInfo.instance.invoke(toolArgs, { signal });
  }

  // 4. 临时连接
  const serverConfig = toolInfo.serverConfig;
  if (!toolInfo.isPersistent && serverConfig) {
    let tempClient = null;
    const controller = new AbortController();

    // 连接外部传入的 signal
    if (signal) {
      if (signal.aborted) controller.abort();
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const modifiedConfig = { ...serverConfig };
      modifiedConfig.transport = normalizeTransportType(modifiedConfig.transport);

      tempClient = new MultiServerMCPClient({ [serverConfig.id]: { id: serverConfig.id, ...modifiedConfig } }, { signal: controller.signal });
      const tools = await tempClient.getTools();
      const toolToCall = tools.find(t => t.name === toolName);
      if (!toolToCall) throw new Error(`Tool "${toolName}" not found.`);
      return await toolToCall.invoke(toolArgs, { signal: controller.signal });
    } finally {
      // 如果没有外部 signal，我们需要负责清理；如果有，外部 signal 触发 abort 时 controller 也会 abort
      if (!signal) controller.abort();
      if (tempClient) await tempClient.close();
    }
  }

  throw new Error(`Configuration error for tool "${toolName}".`);
}

/**
 * 独立连接并执行工具
 * 用于在设置界面测试具体的工具调用
 */
async function connectAndInvokeTool(id, config, toolName, toolArgs, context = null) {
  // [拦截] 内置类型直接调用
  if (config.transport === 'builtin' || config.type === 'builtin') {
    const { invokeBuiltinTool } = require('./mcp_builtin.js');
    return await invokeBuiltinTool(toolName, toolArgs, null, context);
  }

  let tempClient = null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const modifiedConfig = { ...config, transport: normalizeTransportType(config.transport) };
    tempClient = new MultiServerMCPClient({ [id]: { id, ...modifiedConfig } }, { signal: controller.signal });
    const tools = await tempClient.getTools();
    const targetTool = tools.find(t => t.name === toolName || t.name === `${id}_${toolName}`);

    if (!targetTool) {
      throw new Error(`Tool '${toolName}' not found on server '${id}'. Available tools: ${tools.map(t => t.name).join(', ')}`);
    }

    const result = await targetTool.invoke(toolArgs, { signal: controller.signal });
    return result;
  } catch (error) {
    console.error(`[MCP] Error invoking tool ${toolName} on ${id}:`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
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
  connectAndFetchTools, // 导出供测试
  connectAndInvokeTool, // 导出供测试
};