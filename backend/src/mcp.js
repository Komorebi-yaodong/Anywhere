// ./backend/src/mcp.js

const { MultiServerMCPClient } = require("@langchain/mcp-adapters");

const PERSISTENT_CONNECTION_LIMIT = 5; // uTools 限制最多5个持久连接
const ON_DEMAND_CONCURRENCY_LIMIT = 5; // 非持久连接的并发限制

let persistentClients = new Map(); // [关键] 存储持久化客户端实例，它们会一直存在直到被明确关闭
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
 * 增量式地初始化/同步 MCP 客户端。
 * 1. 先处理非持久连接（即用即走），快速获取工具信息。
 * 2. 再处理持久连接，创建并维护客户端实例，并遵守连接数限制。
 */
async function initializeMcpClient(activeServerConfigs = {}) {
  const newIds = new Set(Object.keys(activeServerConfigs));
  const oldIds = new Set(currentlyConnectedServerIds);

  const idsToAdd = [...newIds].filter(id => !oldIds.has(id));
  const idsToRemove = [...oldIds].filter(id => !newIds.has(id));
  const failedServerIds = [];

  // --- 步骤 1: 处理需要移除的服务 ---
  for (const id of idsToRemove) {
    // [生命周期管理] 这是持久化客户端被关闭的两种情况之一：用户取消了选中。
    if (persistentClients.has(id)) {
      const client = persistentClients.get(id);
      await client.close();
      persistentClients.delete(id);
    }
    // 从 fullToolInfoMap 中移除所有属于该 serverId 的工具
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


  // --- 步骤 2: 优先处理所有非持久化（即用即走）的连接 ---
  if (onDemandConfigsToAdd.length > 0) {
    const pool = new Set();
    const allTasks = [];

    for (const { id, config } of onDemandConfigsToAdd) {
      const taskPromise = (async () => {
        // [生命周期管理] 创建一个临时客户端，用完即毁。
        let tempClient = null;
        const controller = new AbortController();
        try {
          const modifiedConfig = { ...config, transport: normalizeTransportType(config.transport) };
          tempClient = new MultiServerMCPClient({ [id]: { id, ...modifiedConfig } }, { signal: controller.signal });
          const tools = await tempClient.getTools();
          tools.forEach(tool => {
            fullToolInfoMap.set(tool.name, {
              schema: tool.schema,
              description: tool.description,
              isPersistent: false,
              serverConfig: { id, ...config },
            });
          });
          currentlyConnectedServerIds.add(id);
        } catch (error) {
          if (error.name !== 'AbortError') console.error(`[MCP Debug] Failed to process on-demand server ${id}. Error:`, error.message);
          failedServerIds.push(id);
        } finally {
          controller.abort();
          if (tempClient) await tempClient.close(); // [关键] 立即关闭临时客户端
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

  // --- 步骤 3: 处理需要持久化的连接 ---
  if (persistentConfigsToAdd.length > 0) {
    for (const { id, config } of persistentConfigsToAdd) {
      if (persistentClients.size >= PERSISTENT_CONNECTION_LIMIT) {
        console.error(`[MCP Debug] Persistent server '${config.name}' not connected due to connection limit (${PERSISTENT_CONNECTION_LIMIT}).`);
        failedServerIds.push(id);
        continue;
      }
      try {
        const modifiedConfig = { ...config, transport: normalizeTransportType(config.transport) };
        
        // [生命周期管理] 创建持久化客户端，并存储在模块级变量中，不会在此函数中关闭。
        const client = new MultiServerMCPClient({ [id]: { id, ...modifiedConfig } });
        const tools = await client.getTools();

        tools.forEach(tool => {
          fullToolInfoMap.set(tool.name, {
            instance: tool, // [关键] 存储工具实例，它与持久客户端绑定
            schema: tool.schema,
            description: tool.description,
            isPersistent: true,
            serverConfig: { id, ...config },
          });
        });
        persistentClients.set(id, client); // [关键] 存储客户端实例以供将来使用
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

// buildOpenaiFormattedTools 函数保持不变
function buildOpenaiFormattedTools() {
  const formattedTools = [];
  for (const [toolName, toolInfo] of fullToolInfoMap.entries()) {
    if (toolInfo.schema) {
      formattedTools.push({
        type: "function",
        function: { name: toolName, description: toolInfo.description, parameters: toolInfo.schema }
      });
    }
  }
  return formattedTools;
}

/**
 *  MCP 工具。
 * - 如果工具是持久化的，则使用已存储的客户端实例。
 * - 如果工具是非持久化的，则创建临时客户端，后关闭。
 */
async function invokeMcpTool(toolName, toolArgs, signal) {
  const toolInfo = fullToolInfoMap.get(toolName);
  if (!toolInfo) {
    throw new Error(`Tool "${toolName}" not found or its server is not available.`);
  }

  if (toolInfo.isPersistent && toolInfo.instance) {
    return await toolInfo.instance.invoke(toolArgs, { signal });
  }

  const serverConfig = toolInfo.serverConfig;
  if (!toolInfo.isPersistent && serverConfig) {
    let tempClient = null;
    const controller = new AbortController();
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }
    try {      
      const modifiedConfig = { ...serverConfig };
      modifiedConfig.transport = normalizeTransportType(modifiedConfig.transport);
      
      // [核心逻辑] 创建临时客户端
      tempClient = new MultiServerMCPClient({ [serverConfig.id]: { id: serverConfig.id, ...modifiedConfig } }, { signal: controller.signal });
      const tools = await tempClient.getTools();
      const toolToCall = tools.find(t => t.name === toolName);
      if (!toolToCall) throw new Error(`Tool "${toolName}" not found on server during invocation.`);
      return await toolToCall.invoke(toolArgs, { signal: controller.signal });
    } finally {
      controller.abort();
      if (tempClient) await tempClient.close(); // [核心逻辑] 临时客户端用完即关闭
    }
  }

  throw new Error(`Configuration error for tool "${toolName}".`);
}

/**
 * [重构] 关闭所有持久化连接的客户端。
 */
async function closeMcpClient() {
  // [生命周期管理] 这是持久化客户端被关闭的另一种情况：插件窗口关闭。
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
};