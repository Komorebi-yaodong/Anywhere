const { ipcRenderer } = require('electron');

const {
    getConfig,
    updateConfig,
    getRandomItem,
    chatOpenAI,
    copyText,
} = require('./data.js');

const channel = "window";

window.preload = {
    receiveMsg: (callback) => {
        ipcRenderer.on(channel, (event, res) => {
            parentId = event.senderId;
            if (res) {
                callback(res);
            }
        })
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
    getConfig,        // 添加 getConfig 到 api
    updateConfig,     // 添加 updateConfig 到 api
    chatOpenAI, // 添加 chatOpenAI 到 api
    copyText // 添加 copyText 到 api
};