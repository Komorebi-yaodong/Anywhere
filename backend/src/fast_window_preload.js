const { ipcRenderer } = require('electron');
const {
    saveFastInputWindowPosition,
    copyText,
    coderedirect,
} = require('./data.js');

const channel = "fast-window";
let senderId = null;

window.preload = {
    // 接收初始化消息 (Config, Code 等)
    receiveMsg: (callback) => {
        ipcRenderer.on(channel, (event, data) => {
            if (data) {
                if (data.senderId) {
                    senderId = data.senderId;
                }
                callback(data);
            }
        });
    },
    // 接收流式数据更新
    onStreamUpdate: (callback) => {
        ipcRenderer.on('stream-update', (event, data) => {
            callback(data); // data format: { type: 'chunk'|'done'|'error', payload: ... }
        });
    },
    receiveSelectorInit: (callback) => {
        ipcRenderer.on('init-selector', (event, data) => callback(data));
    },
}

window.api = {
    copyText,
    coderedirect,
    typeText: (text) => {
        utools.hideMainWindowPasteText(text);
    },
    
    // 关闭窗口并保存位置
    closeWindow: (pos) => {
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
            saveFastInputWindowPosition({ x: pos.x, y: pos.y });
        }
        if (senderId) {
            utools.sendToParent('window-event', { senderId, event: 'close-window' });
        } else {
            window.close(); 
        }
    },
    forwardAppendMsg: (senderId, type, payload) => {
        utools.sendToParent('forward-append-msg', { senderId, type, payload });
        window.close(); // 转发完立即自毁面板
    },
    closeSelector: () => {
        window.close();
    }
}