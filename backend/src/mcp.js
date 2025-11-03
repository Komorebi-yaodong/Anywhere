// ./backend/src/mcp.js

const { MultiServerMCPClient } = require("@langchain/mcp-adapters");

const TOTAL_CONCURRENCY_LIMIT = 5;
const STDIO_RESERVED_LIMIT = 4;

let stdioClients = new Map();
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
 * 增量式地初始化/同步 MCP 客户端，为每个 STDIO 服务创建独立的客户端实例
 */
async function initializeMcpClient(activeServerConfigs = {}) {
  const newIds = new Set(Object.keys(activeServerConfigs));
  const oldIds = new Set(currentlyConnectedServerIds);

  const idsToAdd = [...newIds].filter(id => !oldIds.has(id));
  const idsToRemove = [...oldIds].filter(id => !newIds.has(id));
  const failedServerIds = [];

  // --- 步骤 1: 处理需要移除的服务 ---
  for (const id of idsToRemove) {
    const serverConfig = fullToolInfoMap.values().next().value?.serverConfig;
    if (serverConfig && serverConfig.id === id && serverConfig.transport === 'stdio') {
      const client = stdioClients.get(id);
      if (client) {
        console.log(`[MCP Debug] Closing and removing STDIO client for server: ${id}`);
        await client.close();
        stdioClients.delete(id);
      }
    }
    // 从 fullToolInfoMap 中移除所有属于该 serverId 的工具
    for (const [toolName, toolInfo] of fullToolInfoMap.entries()) {
      if (toolInfo.serverConfig.id === id) {
        fullToolInfoMap.delete(toolName);
      }
    }
    currentlyConnectedServerIds.delete(id);
  }

  // --- 步骤 2: 处理需要添加的 STDIO 服务 ---
  const stdioConfigsToAdd = idsToAdd
    .map(id => ({ id, config: activeServerConfigs[id] }))
    .filter(({ config }) => config && config.transport === 'stdio');

  if (stdioConfigsToAdd.length > 0) {
    console.log(`[MCP Debug] Connecting to ${stdioConfigsToAdd.length} new STDIO servers...`);
    for (const { id, config } of stdioConfigsToAdd) {
      if (stdioClients.size >= STDIO_RESERVED_LIMIT) {
        console.error(`[MCP Debug] Stdio server '${config.name}' not connected due to limits.`);
        failedServerIds.push(id);
        continue;
      }
      try {
        console.log(`[MCP Debug] Creating new persistent client for STDIO server: ${id}`);
        const client = new MultiServerMCPClient({ [id]: { id, ...config } });
        const tools = await client.getTools();

        tools.forEach(tool => {
          fullToolInfoMap.set(tool.name, {
            instance: tool,
            schema: tool.schema,
            description: tool.description,
            isStdio: true,
            serverConfig: { id, ...config },
          });
        });
        stdioClients.set(id, client);
        currentlyConnectedServerIds.add(id);
        console.log(`[MCP Debug] Successfully connected to STDIO server: ${id}`);
      } catch (error) {
        console.error(`[MCP Debug] Failed to connect to STDIO server ${id}:`, error);
        failedServerIds.push(id);
        const client = stdioClients.get(id);
        if (client) await client.close();
        stdioClients.delete(id);
      }
    }
  }

  // --- 步骤 3: 使用连接池增量连接 http/sse 服务 (此部分逻辑保持不变) ---
  const httpIdsToAdd = idsToAdd.filter(id => activeServerConfigs[id] && activeServerConfigs[id].transport !== 'stdio');
  if (httpIdsToAdd.length > 0) {
    console.log(`[MCP Debug] Incrementally connecting to ${httpIdsToAdd.length} new HTTP/SSE servers...`);
    const availableConcurrency = TOTAL_CONCURRENCY_LIMIT - stdioClients.size;

    const httpTasks = httpIdsToAdd.map(id => ({ id, config: { id, ...activeServerConfigs[id] } }));
    const pool = new Set();
    const allTasks = [];

    for (const { id, config } of httpTasks) {
      const taskPromise = (async () => {
        let tempClient = null;
        const controller = new AbortController();
        try {
          const modifiedConfig = { ...config, transport: normalizeTransportType(config.transport) };
          tempClient = new MultiServerMCPClient({ [id]: modifiedConfig }, { signal: controller.signal });
          const tools = await tempClient.getTools();
          tools.forEach(tool => {
            fullToolInfoMap.set(tool.name, {
              schema: tool.schema,
              description: tool.description,
              isStdio: false,
              serverConfig: config,
            });
          });
          currentlyConnectedServerIds.add(id);
        } catch (error) {
          if (error.name !== 'AbortError') {
            console.error(`[MCP Debug] Failed to process server ${id}. Error:`, error.message);
          }
          failedServerIds.push(id);
        } finally {
          controller.abort();
          if (tempClient) await tempClient.close();
        }
      })();

      allTasks.push(taskPromise);
      pool.add(taskPromise);
      const cleanup = () => pool.delete(taskPromise);
      taskPromise.then(cleanup, cleanup);

      if (pool.size >= availableConcurrency) {
        await Promise.race(pool);
      }
    }
    await Promise.all(allTasks);
    console.log(`[MCP Debug] Finished incremental HTTP/SSE connection.`);
  }
  
  return {
    openaiFormattedTools: buildOpenaiFormattedTools(),
    successfulServerIds: [...currentlyConnectedServerIds],
    failedServerIds
  };
}

// buildOpenaiFormattedTools, invokeMcpTool, closeMcpClient 函数保持不变
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

// ./backend/src/mcp.js

async function invokeMcpTool(toolName, toolArgs, signal) {
  const toolInfo = fullToolInfoMap.get(toolName);
  if (!toolInfo) {
    throw new Error(`Tool "${toolName}" not found or its server is not available.`);
  }

  if (toolInfo.isStdio && toolInfo.instance) {
    console.log(`[MCP Debug] [Invoke] Calling persistent stdio tool: ${toolName}`);
    return await toolInfo.instance.invoke(toolArgs, { signal });
  }

  const serverConfig = toolInfo.serverConfig;
  if (!toolInfo.isStdio && serverConfig) {
    let tempClient = null;
    const controller = new AbortController();
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }
    try {
      console.log(`[MCP Debug] [Invoke] On-demand connecting to ${serverConfig.id} for tool: ${toolName}`);
      
      // 创建客户端前，使用辅助函数规范化 transport 类型
      const modifiedConfig = { ...serverConfig };
      modifiedConfig.transport = normalizeTransportType(modifiedConfig.transport);
      
      tempClient = new MultiServerMCPClient({ [serverConfig.id]: modifiedConfig }, { signal: controller.signal });
      const tools = await tempClient.getTools();
      const toolToCall = tools.find(t => t.name === toolName);
      if (!toolToCall) throw new Error(`Tool "${toolName}" not found on server during invocation.`);
      console.log(`[MCP Debug] [Invoke] Executing tool: ${toolName}`);
      return await toolToCall.invoke(toolArgs, { signal: controller.signal });
    } finally {
      console.log(`[MCP Debug] [Invoke] Disconnecting from ${toolName}'s server...`);
      controller.abort();
      if (tempClient) await tempClient.close();
    }
  }

  throw new Error(`Configuration error for tool "${toolName}".`);
}

async function closeMcpClient() {
  // 遍历并关闭所有独立的STDIO客户端
  if (stdioClients.size > 0) {
    console.log(`[MCP Debug] Closing all ${stdioClients.size} persistent stdio clients.`);
    for (const client of stdioClients.values()) {
      await client.close();
    }
    stdioClients.clear();
  }
  fullToolInfoMap.clear();
  currentlyConnectedServerIds.clear();
}

module.exports = {
  initializeMcpClient,
  invokeMcpTool,
  closeMcpClient,
};