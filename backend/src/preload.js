const {
  getConfig,
  updateConfig,
  saveSetting,
  updateConfigWithoutFeatures,
  checkConfig,
  getUser,
  getRandomItem,
  chatOpenAI,
  copyText,
  sethotkey,
  openWindow,
  coderedirect,
  setZoomFactor,
  feature_suffix,
  defaultConfig,
  savePromptWindowSettings,
} = require('./data.js');

const {
  handleFilePath,
  sendfileDirect,
  saveFile,
  selectDirectory,
  listJsonFiles,
  readLocalFile,
  renameLocalFile,
  deleteLocalFile,
  writeLocalFile,
  setFileMtime,
} = require('./file.js');

const {
  requestTextOpenAI,
  handelReplyOpenAI,
} = require('./input.js');

// 引入重构后的 MCP 模块
const {
  initializeMcpClient,
  invokeMcpTool,
  closeMcpClient
} = require('./mcp.js');

window.api = {
  getConfig,
  updateConfig,
  saveSetting,
  updateConfigWithoutFeatures,
  getUser,
  getRandomItem,
  chatOpenAI,
  copyText,
  handleFilePath,
  sendfileDirect,
  saveFile,
  selectDirectory,
  listJsonFiles,
  readLocalFile,
  renameLocalFile,
  deleteLocalFile,
  writeLocalFile,
  setFileMtime,
  sethotkey,
  coderedirect,
  setZoomFactor,
  defaultConfig,
  savePromptWindowSettings,
  desktopCaptureSources: utools.desktopCaptureSources,
  copyImage: utools.copyImage,
  initializeMcpClient,
  invokeMcpTool,
  closeMcpClient,
};

const commandHandlers = {
  'Anywhere Settings': async () => {
    // 使用 await
    const configResult = await getConfig();
    checkConfig(configResult.config);
  },

  'Resume Conversation': async ({ type, payload }) => {
    utools.hideMainWindow();
    // 使用 await
    const configResult = await getConfig();
    const config = configResult.config;
    checkConfig(config);

    let sessionPayloadString = null;
    let sessionObject = null;
    let filename = null;
    let originalCode = null;

    try {
      if (type === "files" && Array.isArray(payload) && payload.length > 0 && payload[0].path) {
        const filePath = payload[0].path;
        if (filePath.toLowerCase().endsWith('.json')) {
          const fs = require('fs');
          sessionPayloadString = fs.readFileSync(filePath, 'utf-8');
          sessionObject = JSON.parse(sessionPayloadString);
          filename = payload[0].name;
        } else {
          sessionPayloadString = JSON.stringify(payload);
        }
      } else if (type === "over") {
        sessionPayloadString = payload;
        const parsedPayload = JSON.parse(sessionPayloadString);

        if (parsedPayload && parsedPayload.sessionData) {
          sessionObject = JSON.parse(parsedPayload.sessionData);
          filename = parsedPayload.filename || null;
        } else if (parsedPayload && parsedPayload.anywhere_history === true) {
          sessionObject = parsedPayload;
        }
      }
    } catch (e) {
      console.warn("Payload is not a valid session JSON or file is unreadable. It will be opened as plain text/file.", e);
      if (!sessionPayloadString) {
        sessionPayloadString = (typeof payload === 'object') ? JSON.stringify(payload) : payload;
      }
    }

    if (sessionObject && sessionObject.CODE) {
      originalCode = sessionObject.CODE;
    }

    const finalPayload = sessionObject ? JSON.stringify(sessionObject) : (sessionPayloadString || payload);

    const msg = {
      os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
      code: "Resume Conversation",
      type: "over",
      payload: finalPayload,
      filename: filename,
      originalCode: originalCode
    };
    // 传递 config
    await openWindow(config, msg);

    utools.outPlugin();
  },

  handleAssistant: async ({ code, type, payload }) => {
    utools.hideMainWindow();
    // 使用 await
    const configResult = await getConfig();
    const config = configResult.config;
    checkConfig(config);
    const assistantName = code.replace(feature_suffix, "");
    if (config.prompts[assistantName].type === "img") {
      utools.screenCapture((image) => {
        const msg = {
          os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
          code: assistantName,
          type: "img",
          payload: image,
        };
        // 传递 config
        openWindow(config, msg);
      });
    } else {
      const msg = {
        os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
        code: assistantName,
        type: "over",
        payload: assistantName,
      };
      // 传递 config
      await openWindow(config, msg);
    }
    utools.outPlugin();
  },

  handlePrompt: async ({ code, type, payload }) => {
    utools.hideMainWindow();
    // 使用 await
    const configResult = await getConfig();
    const config = configResult.config;
    checkConfig(config);

    const promptConfig = config.prompts[code];
    if (!promptConfig) {
      utools.showNotification(`Error: Prompt "${code}" not found.`);
      utools.outPlugin();
      return;
    }

    if (promptConfig.showMode === 'window') {
      const msg = {
        os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
        code,
        type,
        payload,
      };
      // 传递 config
      await openWindow(config, msg);
    } else {
      let content = null;
      if (type === "over") {
        if (config.skipLineBreak) {
          payload = payload
            .replace(/([a-zA-Z])\s*\n\s*([a-zA-Z])/g, "$1 $2")
            .replace(/\s*\n\s*/g, "");
        }
        content = payload;
      } else if (type === "img") {
        content = [{ type: "image_url", image_url: { url: payload } }];
      } else if (type === "files") {
        content = await sendfileDirect(payload);
      } else {
        utools.showNotification("Unsupported input type");
      }

      if (content) {
        if (promptConfig.showMode === 'input') {
          const response = await requestTextOpenAI(code, content, config);
          await handelReplyOpenAI(code, response, config.stream, config.showNotification);
        } else if (promptConfig.showMode === 'clipboard') {
          const config2 = { ...config, stream: false };
          const response = await requestTextOpenAI(code, content, config2);
          const data = await response.json();
          const result = data.choices[0].message.content.replace(/<think>.*?<\/think>/gs, '').trim();
          utools.copyText(result);
          if (config.showNotification) utools.showNotification(code + " successfully!");
        }
      }
    }
    utools.outPlugin();
  }
};

// --- Main Plugin Entry ---
utools.onPluginEnter(async (action) => {
  const { code } = action;
  if (commandHandlers[code]) {
    await commandHandlers[code](action);
  } else if (code.endsWith(feature_suffix)) { // 打开空白助手
    await commandHandlers.handleAssistant(action);
  } else {  // 根据提示词匹配调用
    await commandHandlers.handlePrompt(action);
  }
});

const { ipcRenderer } = require('electron');
const { windowMap } = require('./data.js');

ipcRenderer.on('window-event', (e, { senderId, event }) => {
  const bw = windowMap.get(senderId);
  if (!bw) {
    console.warn(`[IPC Hub] Window with senderId ${senderId} not found.`);
    return;
  }

  try {
    switch (event) {
      case 'toggle-always-on-top': {
        const currentState = bw.isAlwaysOnTop();
        const newState = !currentState;
        bw.setAlwaysOnTop(newState);
        // 将新状态发回给子窗口以更新UI
        bw.webContents.send('always-on-top-changed', newState);
        break;
      }
      // 可以根据需要在此处添加更多事件，例如 'close-window'
      case 'close-window': {
        bw.close();
        windowMap.delete(senderId);
        break;
      }
    }
  } catch (err) {
    console.error(`[IPC Hub] Error handling event '${event}' for window ${senderId}:`, err);
  }
});