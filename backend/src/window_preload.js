const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

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
        let target = event.target;
        while (target && target.tagName !== 'A') {
            target = target.parentNode;
        }

        if (target && target.tagName === 'A' && target.href) {
            event.preventDefault();
            utools.shellOpenExternal(target.href);
        }
    });
});

// 处理代码块点击事件的核心逻辑
async function handleCodeClick(text) {

  if (!text || typeof text !== 'string') {
    return 'copied';
  }
  
  // 移除首尾空白和引号 (支持 'path' 或 "path")
  const content = text.trim().replace(/^["']|["']$/g, '');

  // 1. 检查是否为 URL
  if (/^https?:\/\//i.test(content) || /^mailto:/i.test(content)) {
    utools.shellOpenExternal(content);
    return 'opened-url';
  }

  // 2. 检查是否为本地文件路径
  try {
    let resolvedPath = content;
    
    // 处理 ~ 路径 (macOS/Linux)
    if (content.startsWith('~')) {
      resolvedPath = path.join(utools.getPath('home'), content.slice(1));
    }
    
    // 简单的路径格式校验 (Windows盘符 或 Unix根路径 或 相对路径)
    // 增加对 C:\ 或 /Users 等格式的宽容度
    const isLikelyPath = /^[a-zA-Z]:[\\/]/.test(resolvedPath) || resolvedPath.startsWith('/') || resolvedPath.startsWith('./') || resolvedPath.startsWith('../') || resolvedPath.includes(path.sep);

    if (isLikelyPath) {
        const exists = fs.existsSync(resolvedPath);
        
        if (exists) {
            // 尝试打开文件或目录
            utools.shellOpenPath(resolvedPath);
            return 'opened-path';
        }
    }
  } catch (e) {
    // 忽略路径检查错误，回退到复制
    console.warn(`[Preload Debug] Path check failed:`, e.message);
  }

  // 3. 如果以上都不是，则复制内容
  utools.copyText(text); // 复制原始文本
  return 'copied';
}

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
    handleCodeClick,
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