const { ipcRenderer } = require('electron');

const {
    getRandomItem,
} = require('./input.js');

const {
    getConfig,
    updateConfig,
    saveSetting,
    getUser,
    copyText,
    sethotkey,
    setZoomFactor,
    defaultConfig,
    savePromptWindowSettings,
    saveMcpToolCache,
    getMcpToolCache,
    getCachedBackgroundImage,
    cacheBackgroundImage,
} = require('./data.js');

const {
    handleFilePath,
    saveFile,
    writeLocalFile,
    isFileTypeSupported,
    parseFileObject,
    renameLocalFile,
    listJsonFiles,
} = require('./file.js');

const { 
  invokeBuiltinTool,
} = require('./mcp_builtin.js');

const { 
  initializeMcpClient, 
  invokeMcpTool,
  closeMcpClient,
} = require('./mcp.js');

const {
    listSkills,
    getSkillDetails,
    generateSkillToolDefinition,
    resolveSkillInvocation,
    saveSkill,
    deleteSkill
} = require('./skill.js');

const channel = "window";
let senderId = null; // [新增] 用于存储当前窗口的唯一ID

window.preload = {
    receiveMsg: (callback) => {
        ipcRenderer.on(channel, (event, data) => {
            if (data) {
                // 捕获并存储 senderId
                if (data.senderId) {
                    senderId = data.senderId;
                }
                callback(data);
            }
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (event) => {
        // 向上寻找 <a> 标签
        let target = event.target;
        while (target && target.tagName !== 'A') {
            target = target.parentNode;
        }

        if (target && target.tagName === 'A') {
            const filePath = target.getAttribute('data-filepath');
            if (filePath) {
                event.preventDefault();
                event.stopPropagation();
                const cleanPath = decodeURIComponent(filePath);
                utools.shellOpenPath(cleanPath);
                return;
            }

            // 处理普通外部链接
            if (target.href && target.href.startsWith('http')) {
                event.preventDefault();
                utools.shellOpenExternal(target.href);
            }
        }
    });
});

window.api = {
    getConfig,
    updateConfig,
    saveSetting,
    getUser,
    getRandomItem,
    copyText,
    handleFilePath,
    saveFile,
    renameLocalFile,
    listJsonFiles,
    writeLocalFile,
    sethotkey,
    setZoomFactor,
    defaultConfig,
    savePromptWindowSettings,
    desktopCaptureSources: utools.desktopCaptureSources,
    copyImage: utools.copyImage,
    getMcpToolCache,
    initializeMcpClient: async (activeServerConfigs) => {
        try {
            const cache = await getMcpToolCache();            
            return await initializeMcpClient(activeServerConfigs, cache, saveMcpToolCache);
        } catch (e) {
            console.error("[WindowPreload] Error loading MCP cache:", e);
            return await initializeMcpClient(activeServerConfigs, {}, saveMcpToolCache);
        }
    },
    invokeMcpTool: async (toolName, toolArgs, signal, context = null) => {
        return await invokeMcpTool(toolName, toolArgs, signal, context);
    },
    saveMcpToolCache,
    closeMcpClient,
    isFileTypeSupported,
    parseFileObject,
    shellOpenPath: (fullPath) => {
        console.log(fullPath);
        utools.shellOpenPath(fullPath);
    },
    // 向父进程(preload.js)发送切换置顶状态的请求
    toggleAlwaysOnTop: () => {
      if (senderId) {
        utools.sendToParent('window-event', { senderId, event: 'toggle-always-on-top' });
      } else {
        console.error("senderId is not available, cannot toggle always-on-top.");
      }
    },
    windowControl: (action) => {
      if (senderId) {
        // action 对应 preload.js switch 中的 case，例如 'minimize-window'
        utools.sendToParent('window-event', { senderId, event: action });
      }
    },
    // 监听父进程发回的状态变更消息
    onAlwaysOnTopChanged: (callback) => {
      ipcRenderer.on('always-on-top-changed', (event, newState) => {
        callback(newState);
      });
    },
    // 监听配置更新消息
    onConfigUpdated: (callback) => {
      ipcRenderer.on('config-updated', (event, newConfig) => {
        callback(newConfig);
      });
    },
    getCachedBackgroundImage,
    cacheBackgroundImage: (url) => {
        // 异步执行，不阻塞 UI
        cacheBackgroundImage(url).catch(e => console.error(e));
    },

    // Skill 相关 API
    listSkills: async (path) => {
        try {
            return listSkills(path);
        } catch (e) {
            console.error("listSkills error:", e);
            return [];
        }
    },
    getSkillDetails: async (rootPath, id) => {
        return getSkillDetails(rootPath, id);
    },
    saveSkill: async (rootPath, id, content) => {
        return saveSkill(rootPath, id, content);
    },
    deleteSkill: async (rootPath, id) => {
        return deleteSkill(rootPath, id);
    },
    toggleSkillForkMode: async (rootPath, skillId, enableFork) => {
        try {
            const details = getSkillDetails(rootPath, skillId);
            const meta = details.metadata;
            const body = details.content;

            // 更新元数据
            if (enableFork) {
                meta['context'] = 'fork';
            } else {
                delete meta['context'];
            }

            // 重建文件内容 (简易 YAML 构建，保持与 Skills.vue 逻辑一致)
            const lines = ['---'];
            if (meta.name) lines.push(`name: ${meta.name}`);
            if (meta.description) lines.push(`description: ${meta.description}`);
            if (meta['disable-model-invocation'] === true) lines.push('disable-model-invocation: true');
            if (meta.context === 'fork') lines.push('context: fork');

            if (meta['allowed-tools']) {
                let tools = meta['allowed-tools'];
                if (typeof tools === 'string') lines.push(`allowed-tools: [${tools}]`);
                else if (Array.isArray(tools)) lines.push(`allowed-tools: [${tools.join(', ')}]`);
            }

            lines.push('---');
            lines.push('');
            lines.push(body || '');

            const content = lines.join('\n');
            return saveSkill(rootPath, skillId, content);
        } catch (e) {
            console.error("Toggle Fork Mode Error:", e);
            throw e;
        }
    },
    // 生成 Skill Tool 定义
    getSkillToolDefinition: async (rootPath, enabledSkillNames = []) => {
        try {
            const allSkills = listSkills(rootPath);
            const activeSkills = allSkills.filter(s => enabledSkillNames.includes(s.name));
            if (activeSkills.length === 0) return null;
            return generateSkillToolDefinition(activeSkills, rootPath);
        } catch (e) {
            return null;
        }
    },
    // 执行 Skill
    resolveSkillInvocation: async (rootPath, skillName, toolArgs, globalContext = null, signal = null) => {
        // 1. 获取 Skill 解析结果
        const result = resolveSkillInvocation(rootPath, skillName, toolArgs);

        // 2. 检查是否为 Fork 请求
        if (result && result.__isForkRequest && result.subAgentArgs) {
            if (!globalContext) {
                // 错误信息也统一包装为 JSON 字符串
                return JSON.stringify([{
                    type: "text",
                    text: "Error: Sub-Agent skill requires execution context (API Key, etc)."
                }], null, 2);
            }
            
            // 3. 自动调用内置的 sub_agent 工具
            // 注意：invokeBuiltinTool 已经修复为返回序列化的 JSON 字符串，直接透传即可
            return await invokeBuiltinTool(
                'sub_agent', 
                result.subAgentArgs, 
                signal, 
                globalContext
            );
        }

        // 3.普通模式，将文本结果包装为标准 MCP JSON 格式字符串
        // 这样前端收到后能统一解析为 content 数组，而不是纯文本
        return JSON.stringify([{
            type: "text",
            text: result
        }], null, 2);
    },
    // 暴露 path.join 
    pathJoin: (...args) => require('path').join(...args),
};