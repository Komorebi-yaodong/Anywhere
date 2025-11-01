// ./backend/src/mcp.js

const { MultiServerMCPClient } = require("@langchain/mcp-adapters");

// --- 最终健壮版 V3: 彻底修复异步引用错误，确保错误隔离 ---

const TOTAL_CONCURRENCY_LIMIT = 5;
const STDIO_RESERVED_LIMIT = 4;

let stdioClient = null;
let fullToolInfoMap = new Map();
let currentlyConnectedServerIds = new Set();

/**
 * [最终版] 增量式地初始化/同步 MCP 客户端
 */
async function initializeMcpClient(activeServerConfigs = {}) {
  const newIds = new Set(Object.keys(activeServerConfigs));
  const oldIds = new Set(currentlyConnectedServerIds);

  const idsToAdd = new Set([...newIds].filter(id => !oldIds.has(id)));
  const idsToRemove = new Set([...oldIds].filter(id => !newIds.has(id)));

  if (idsToAdd.size === 0 && idsToRemove.size === 0) {
    console.log("[MCP Debug] No changes detected.");
    return { openaiFormattedTools: buildOpenaiFormattedTools(), successfulServerIds: [...currentlyConnectedServerIds], failedServerIds: [] };
  }

  const failedServerIds = [];

  // --- 步骤 1: 处理移除 ---
  let stdioConfigChanged = false;
  if (idsToRemove.size > 0) {
    console.log(`[MCP Debug] Servers to remove:`, [...idsToRemove]);
    const toolsToRemove = [];
    for (const [toolName, toolInfo] of fullToolInfoMap.entries()) {
      if (idsToRemove.has(toolInfo.serverConfig.id)) {
        toolsToRemove.push(toolName);
        if (toolInfo.serverConfig.transport === 'stdio') {
          stdioConfigChanged = true;
        }
      }
    }
    toolsToRemove.forEach(toolName => fullToolInfoMap.delete(toolName));
    idsToRemove.forEach(id => currentlyConnectedServerIds.delete(id));
  }

  // --- 步骤 2: 判断是否需要添加或重建 stdio ---
  const stdioIdsToAdd = [...idsToAdd].filter(id => activeServerConfigs[id] && activeServerConfigs[id].transport === 'stdio');
  if (stdioIdsToAdd.length > 0) {
    stdioConfigChanged = true;
  }

  // --- 步骤 3: 使用连接池增量连接 http/sse 服务 ---
  const httpIdsToAdd = [...idsToAdd].filter(id => activeServerConfigs[id] && activeServerConfigs[id].transport !== 'stdio');
  if (httpIdsToAdd.length > 0) {
    console.log(`[MCP Debug] Incrementally connecting to ${httpIdsToAdd.length} new HTTP/SSE servers...`);
    const currentStdioCount = stdioClient ? Object.keys(stdioClient.clients).length : 0;
    const availableConcurrency = TOTAL_CONCURRENCY_LIMIT - currentStdioCount;

    const httpTasks = httpIdsToAdd.map(id => ({ id, config: { id, ...activeServerConfigs[id] } }));
    const pool = new Set();
    const allTasks = [];

    for (const { id, config } of httpTasks) {
      const taskPromise = (async () => {
        let tempClient = null;
        const controller = new AbortController();
        try {
          console.log(`[MCP Debug] [Pool] Attempting to connect to new server ${id}...`);
          
          tempClient = new MultiServerMCPClient({ [id]: config }, { signal: controller.signal });
          const tools = await tempClient.getTools();

          tools.forEach(tool => {
            fullToolInfoMap.set(tool.name, {
              schema: tool.schema,
              description: tool.description,
              isStdio: false,
              serverConfig: config,
            });
          });

          if (id) currentlyConnectedServerIds.add(id);

        } catch (error) {
          if (error.name !== 'AbortError') {
            console.error(`[MCP Debug] [Pool] Failed to process server ${id}. It might have an incompatible configuration. Error:`, error.message);
          }
          failedServerIds.push(id);
        } finally {
          console.log(`[MCP Debug] [Pool] Cleaning up connection for ${id}.`);
          controller.abort();
          if (tempClient) await tempClient.close();
        }
      })();

      // <<< 关键修复: 将任务清理逻辑移出任务本身 >>>
      allTasks.push(taskPromise);
      pool.add(taskPromise);

      const cleanup = () => pool.delete(taskPromise);
      taskPromise.then(cleanup, cleanup); // 无论成功或失败都执行清理

      if (pool.size >= availableConcurrency) {
        await Promise.race(pool);
      }
    }
    await Promise.all(allTasks); // 等待所有任务完成
    console.log(`[MCP Debug] Finished incremental HTTP/SSE connection.`);
  }

  // --- 步骤 4: 重建 stdio 客户端 (逻辑保持不变) ---
  if (stdioConfigChanged) {
    // ... (这部分代码是正确的，保持原样)
    console.log("[MCP Debug] STDIO config changed. Rebuilding persistent client...");
    if (stdioClient) {
      await stdioClient.close();
      stdioClient = null;
    }

    const allDesiredStdioConfigs = {};
    newIds.forEach(id => {
      if (id && activeServerConfigs[id] && activeServerConfigs[id].transport === 'stdio') {
        allDesiredStdioConfigs[id] = { id, ...activeServerConfigs[id] };
      }
    });

    const desiredStdioCount = Object.keys(allDesiredStdioConfigs).length;
    if (desiredStdioCount > 0) {
      const allowedStdioConfigs = {};
      const stdioIds = Object.keys(allDesiredStdioConfigs);
      if (desiredStdioCount > STDIO_RESERVED_LIMIT) {
        stdioIds.slice(STDIO_RESERVED_LIMIT).forEach(id => {
          console.error(`[MCP Debug] Stdio server '${activeServerConfigs[id].name}' not connected due to limits.`);
          failedServerIds.push(id);
        });
      }
      stdioIds.slice(0, STDIO_RESERVED_LIMIT).forEach(id => allowedStdioConfigs[id] = allDesiredStdioConfigs[id]);

      if (Object.keys(allowedStdioConfigs).length > 0) {
        try {
          stdioClient = new MultiServerMCPClient(allowedStdioConfigs);
          const tools = await stdioClient.getTools();
          const connectedStdioIds = Object.keys(allowedStdioConfigs);

          tools.forEach(tool => {
            const serverId = tool.serverId && allowedStdioConfigs[tool.serverId] ? tool.serverId : connectedStdioIds.length === 1 ? connectedStdioIds[0] : null;
            if (serverId) {
              fullToolInfoMap.set(tool.name, {
                instance: tool, schema: tool.schema, description: tool.description, isStdio: true, serverConfig: allowedStdioConfigs[serverId],
              });
            } else {
              console.error(`[MCP Debug] Could not determine serverId for stdio tool '${tool.name}'.`);
            }
          });
          connectedStdioIds.forEach(id => { if (id) currentlyConnectedServerIds.add(id); });
          console.log(`[MCP Debug] Successfully rebuilt stdio client for:`, connectedStdioIds);
        } catch (error) {
          console.error("[MCP Debug] Failed to rebuild stdio client:", error);
          failedServerIds.push(...Object.keys(allowedStdioConfigs));
          if (stdioClient) await stdioClient.close();
          stdioClient = null;
        }
      }
    }
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
      tempClient = new MultiServerMCPClient({ [serverConfig.id]: serverConfig }, { signal: controller.signal });
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
  if (stdioClient) {
    console.log(`[MCP Debug] Closing all persistent stdio clients.`);
    await stdioClient.close();
    stdioClient = null;
  }
  fullToolInfoMap.clear();
  currentlyConnectedServerIds.clear();
}

module.exports = {
  initializeMcpClient,
  invokeMcpTool,
  closeMcpClient,
};