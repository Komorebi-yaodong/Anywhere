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
    // 生成 Skill Tool 定义
    getSkillToolDefinition: async (rootPath, enabledSkillNames = []) => {
        try {
            const allSkills = listSkills(rootPath);
            const activeSkills = allSkills.filter(s => enabledSkillNames.includes(s.name));
            if (activeSkills.length === 0) return null;
            return generateSkillToolDefinition(activeSkills);
        } catch (e) {
            return null;
        }
    },
    // 执行 Skill
    resolveSkillInvocation: async (rootPath, skillName, args) => {
        return resolveSkillInvocation(rootPath, skillName, args);
    },
    // 暴露 path.join 
    pathJoin: (...args) => require('path').join(...args),
};