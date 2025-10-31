const { MultiServerMCPClient } = require("@langchain/mcp-adapters");

// --- MCP State Management (Self-Contained Module) ---

// 全局的 langchainToolMap，由下面的管理器负责更新
let langchainToolMap = new Map();

// 状态管理器，长期存在，负责所有MCP连接的生命周期
const mcpManager = {
    // 存储每个服务器ID对应的 { client, tools, controller }
    activeSessions: new Map(),

    // 核心同步函数：根据请求的ID列表，更新实际的连接状态
    async sync(requestedServerIds = []) {
        const requestedIdSet = new Set(requestedServerIds);
        const currentIdSet = new Set(this.activeSessions.keys());

        // 1. 识别并关闭不再需要的会话
        const idsToClose = [...currentIdSet].filter(id => !requestedIdSet.has(id));
        if (idsToClose.length > 0) {
            console.log("MCP Manager: Closing sessions for", idsToClose);
            await Promise.all(idsToClose.map(id => this.closeSession(id)));
        }

        // 2. 识别需要新启动的会话
        const idsToLoad = [...requestedIdSet].filter(id => !currentIdSet.has(id));

        // 3. 并行加载所有新服务器
        const loadPromises = idsToLoad.map(id => this.startSession(id));
        const results = await Promise.allSettled(loadPromises);

        const failedIds = [];
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const id = idsToLoad[index];
                // 忽略 AbortError，因为这是预期的取消操作
                if (result.reason.name !== 'AbortError' && !result.reason.message.includes('aborted')) {
                   failedIds.push(id);
                   // 确保失败的会话被彻底清理
                   this.closeSession(id);
                   console.error(`MCP Manager: Failed to start session for '${id}':`, result.reason);
                } else {
                   // 这是预期的中止，静默处理
                   console.log(`MCP Manager: Session for '${id}' was correctly aborted.`);
                }
            }
        });

        // 4. 汇总所有当前活跃的工具
        const allActiveTools = [];
        const successfulServerIds = [];
        for (const id of this.activeSessions.keys()) {
            const session = this.activeSessions.get(id);
            if (session && session.tools) {
                allActiveTools.push(...session.tools);
                successfulServerIds.push(id);
            }
        }

        // 5. 更新全局的 langchainToolMap
        langchainToolMap = new Map(allActiveTools.map(t => [t.name, t]));

        // 6. 返回结果，供前端更新UI
        return {
            allTools: allActiveTools,
            successfulServerIds,
            failedServerIds: failedIds,
        };
    },

    // 启动并管理单个服务器的会话
    async startSession(id) {
        // 如果已存在，则先关闭（理论上不应发生，但作为保险）
        if (this.activeSessions.has(id)) {
            await this.closeSession(id);
        }

        const controller = new AbortController();
        // 注意：这里依赖于调用它的 preload 脚本已经将 getConfig 挂载到了 window.api 上
        const config = window.api.getConfig().config;
        const serverConfig = config.mcpServers[id];
        if (!serverConfig) {
            // 在这里不需要从 activeSessions 中删除，因为它还未被添加
            throw new Error(`Server config for '${id}' not found.`);
        }

        const clientConfig = { [id]: {
            transport: serverConfig.type,
            command: serverConfig.command,
            args: serverConfig.args,
            url: serverConfig.baseUrl,
        }};

        const client = new MultiServerMCPClient(clientConfig, { signal: controller.signal });

        // --- 核心修复 ---
        // 立即将会话（包含 client 实例和 controller）存入 activeSessions
        // 这样即使在 getTools() 完成前调用 closeSession，也能找到 client 并执行 close()
        this.activeSessions.set(id, { client, tools: [], controller });

        try {
            const tools = await client.getTools();

            // 检查在耗时的 getTools 操作后，会话是否已被外部命令中止
            if (!this.activeSessions.has(id)) {
                console.log(`MCP Manager: Session for '${id}' was closed while loading, discarding results.`);
                // 即使会话记录被删除，也要确保这个新创建的 client 实例被关闭
                await client.close();
                throw new Error("Session aborted during tool loading");
            }

            // 加载成功，更新会话中的 tools 列表
            const session = this.activeSessions.get(id);
            if (session) {
                session.tools = tools;
            }
            console.log(`MCP Manager: Session for '${id}' started successfully.`);

        } catch (error) {
            // 如果加载失败，确保清理
            await this.closeSession(id);
            // 不要重新抛出 AbortError，因为它表示操作被成功取消了
            if (error.name !== 'AbortError' && !error.message.includes('aborted')) {
                throw error; // 只重新抛出真正的错误
            }
        }
    },

    // 强制关闭并清理单个服务器的会话
    async closeSession(id) {
        if (this.activeSessions.has(id)) {
            const session = this.activeSessions.get(id);

            // 1. 立即中止任何正在进行的操作
            session.controller.abort();

            // 2. 如果客户端已创建，则关闭它
            if (session.client) {
                await session.client.close();
            }

            // 3. 从活动会话中移除
            this.activeSessions.delete(id);
            console.log(`MCP Manager: Session for '${id}' has been closed.`);
        }
    },
};

/**
 * [MCP Logic] Initializes/Syncs MCP clients. This is now a lightweight wrapper.
 */
async function initializeMcpClient(activeServerConfigs) {
    const requestedServerIds = Object.keys(activeServerConfigs || {});

    const { allTools, successfulServerIds, failedServerIds } = await mcpManager.sync(requestedServerIds);

    const openaiFormattedTools = allTools.map((tool) => {
        if (!tool.schema) {
            console.error(`Tool '${tool.name}' is missing schema definition.`);
            return null;
        }
        return {
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: tool.schema },
        };
    }).filter(Boolean);

    return { openaiFormattedTools, successfulServerIds, failedServerIds };
}

/**
 * [MCP Logic] Invokes a tool by name.
 */
async function invokeMcpTool(toolName, toolArgs) {
    const toolToCall = langchainToolMap.get(toolName);
    if (!toolToCall) {
        throw new Error(`Tool "${toolName}" not found. It might have been closed or failed to load.`);
    }
    // toolToCall 内部持有对存活的 client 实例的引用
    return await toolToCall.invoke(toolArgs);
}

module.exports = {
    initializeMcpClient,
    invokeMcpTool,
};