const { ipcRenderer } = require('electron');

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

// [MODIFIED] 引入重构后的 MCP 模块
const { 
  initializeMcpClient, 
  invokeMcpTool,
  closeMcpClient
} = require('./mcp.js');

const channel = "window";

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
    // [MODIFIED] 暴露重构后的 MCP 函数
    initializeMcpClient,
    invokeMcpTool,
    closeMcpClient,
};