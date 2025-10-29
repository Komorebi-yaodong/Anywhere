const { ipcRenderer } = require('electron');
const { MultiServerMCPClient } = require("@langchain/mcp-adapters");

const {
    getConfig,
    updateConfig,
    saveSetting,
    getUser,
    getRandomItem,
    chatOpenAI,
    copyText,
    sethotkey,
    setZoomFactor,
    defaultConfig,
    savePromptWindowSettings,
} = require('./data.js');

const {
    handleFilePath,
    saveFile,
} = require('./file.js');

const channel = "window";

// --- MCP State Management (within preload) ---
let mcpClientInstance = null;
let langchainToolMap = new Map();

/**
 * [MCP Logic] Initializes a new MCP client in the preload environment.
 * @param {object} activeServersConfig - The configuration for active MCP servers.
 * @returns {Promise<object>} - An object containing openaiFormattedTools.
 */
async function initializeMcpClient(activeServersConfig) {
    if (mcpClientInstance) {
        await mcpClientInstance.close();
        mcpClientInstance = null;
        langchainToolMap.clear();
    }

    if (!activeServersConfig || Object.keys(activeServersConfig).length === 0) {
        return { openaiFormattedTools: [] };
    }

    mcpClientInstance = new MultiServerMCPClient(activeServersConfig);
    const tools = await mcpClientInstance.getTools();
    langchainToolMap = new Map(tools.map(t => [t.name, t]));
    
    const openaiFormattedTools = tools.map((tool) => {
        if (!tool.schema) {
            console.error(`Tool '${tool.name}' is missing schema definition.`);
            return null;
        }
        return {
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.schema,
            },
        };
    }).filter(Boolean);

    return { openaiFormattedTools };
}

/**
 * [MCP Logic] Closes the current MCP client instance.
 */
async function closeMcpClient() {
    if (mcpClientInstance) {
        await mcpClientInstance.close();
        mcpClientInstance = null;
        langchainToolMap.clear();
    }
}

/**
 * [MCP Logic] Invokes a specific tool by name.
 * @param {string} toolName - The name of the tool to invoke.
 * @param {object} toolArgs - The arguments for the tool.
 * @returns {Promise<any>} - The result of the tool invocation.
 */
async function invokeMcpTool(toolName, toolArgs) {
    const toolToCall = langchainToolMap.get(toolName);
    if (!toolToCall) {
        throw new Error(`Tool "${toolName}" not found in the current MCP client.`);
    }
    return await toolToCall.invoke(toolArgs);
}


window.preload = {
    receiveMsg: (callback) => {
        ipcRenderer.on(channel, (event, data) => {
            parentId = event.senderId;
            if (data) {
                callback(data);
            }
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (event) => {
        let target = event.target;
        // 找到最近的 <a> 标签
        while (target && target.tagName !== 'A') {
            target = target.parentNode;
        }

        if (target && target.tagName === 'A' && target.href) {
            event.preventDefault(); // 阻止默认行为（内部跳转）
            utools.shellOpenExternal(target.href); // 调用 utools.shellOpenExternal
        }
    });
});

window.api = {
    getConfig,
    updateConfig,
    saveSetting,
    getUser,
    getRandomItem,
    chatOpenAI,
    copyText,
    handleFilePath,
    saveFile,
    sethotkey,
    setZoomFactor,
    defaultConfig,
    savePromptWindowSettings,
    desktopCaptureSources: utools.desktopCaptureSources,
    copyImage: utools.copyImage,
    // --- Exposing MCP functions to the renderer process ---
    initializeMcpClient,
    closeMcpClient,
    invokeMcpTool,
};