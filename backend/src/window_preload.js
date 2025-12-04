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
    writeLocalFile,
    isFileTypeSupported,
    parseFileObject,
} = require('./file.js');

const { 
  initializeMcpClient, 
  invokeMcpTool,
  closeMcpClient
} = require('./mcp.js');

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
    chatOpenAI,
    copyText,
    handleFilePath,
    saveFile,
    writeLocalFile,
    sethotkey,
    setZoomFactor,
    defaultConfig,
    savePromptWindowSettings,
    desktopCaptureSources: utools.desktopCaptureSources,
    copyImage: utools.copyImage,
    initializeMcpClient,
    invokeMcpTool,
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
    // 监听父进程发回的状态变更消息
    onAlwaysOnTopChanged: (callback) => {
      ipcRenderer.on('always-on-top-changed', (event, newState) => {
        callback(newState);
      });
    }
};