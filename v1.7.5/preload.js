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
} = require('./file.js');

const {
  requestTextOpenAI,
  handelReplyOpenAI,
} = require('./input.js');

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
  sethotkey,
  coderedirect,
  setZoomFactor,
  defaultConfig,
  savePromptWindowSettings,
  desktopCaptureSources: utools.desktopCaptureSources,
  copyImage: utools.copyImage,
};

// --- Command Handlers ---
const commandHandlers = {
  'Anywhere Settings': async () => {
    const config = getConfig().config;
    checkConfig(config);
    // The main window will open automatically based on plugin.json, so no action needed here.
  },

  'Resume Conversation': async ({ type, payload }) => {
    utools.hideMainWindow();
    const config = getConfig().config;
    checkConfig(config);

    let sessionPayloadString = null; // 存储会话内容的字符串
    let sessionObject = null;        // 存储解析后的会话对象
    let filename = null;
    let originalCode = null;

    try {
      if (type === "files" && Array.isArray(payload) && payload.length > 0 && payload[0].path) {
        // --- 处理本地文件类型 ---
        const filePath = payload[0].path;
        if (filePath.toLowerCase().endsWith('.json')) {
          const fs = require('fs'); // 直接在 preload 中使用 Node.js fs 模块
          sessionPayloadString = fs.readFileSync(filePath, 'utf-8');
          sessionObject = JSON.parse(sessionPayloadString);
          filename = payload[0].name;
        } else {
           // 如果不是json文件，则将其作为普通文件处理
           sessionPayloadString = JSON.stringify(payload);
        }
      } else if (type === "over") {
        // --- 处理文本/云端类型 ---
        sessionPayloadString = payload; // payload 本身就是字符串
        const parsedPayload = JSON.parse(sessionPayloadString);
        
        if (parsedPayload && parsedPayload.sessionData) { // 云端对话格式
            sessionObject = JSON.parse(parsedPayload.sessionData);
            filename = parsedPayload.filename || null;
        } else if (parsedPayload && parsedPayload.anywhere_history === true) { // 本地保存的会话格式
            sessionObject = parsedPayload;
        }
      }
    } catch (e) {
      console.warn("Payload is not a valid session JSON or file is unreadable. It will be opened as plain text/file.", e);
      // 如果解析失败，保持 sessionPayloadString/sessionObject 为 null，后续逻辑会处理
      if (!sessionPayloadString) {
          sessionPayloadString = (typeof payload === 'object') ? JSON.stringify(payload) : payload;
      }
    }

    // --- 统一提取原始 CODE ---
    if (sessionObject && sessionObject.CODE) {
      originalCode = sessionObject.CODE;
    }

    // [BUG修复] 
    // 核心修复点：如果 sessionObject 已被成功解析，则应将其字符串化后作为 payload 传递。
    // 否则，回退到使用原始的 payload 字符串（用于处理非会话内容的普通文本）。
    const finalPayload = sessionObject ? JSON.stringify(sessionObject) : (sessionPayloadString || payload);

    const msg = {
      os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
      code: "Resume Conversation",
      type: "over", //最终都变为了 json文本 格式
      payload: finalPayload, // 使用修复后的 payload
      filename: filename,
      originalCode: originalCode // 将原始 CODE 传递给 openWindow
    };
    await openWindow(config, msg);
    
    utools.outPlugin();
  },

  handleAssistant: async ({ code, type, payload }) => {
    utools.hideMainWindow();
    const config = getConfig().config;
    checkConfig(config);

    const assistantName = code.replace(feature_suffix, "");
    const msg = {
      os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
      code: assistantName,
      type: "over", // Assistant commands are always treated as "over" type for window opening
      payload: assistantName,
    };

    await openWindow(config, msg);
    utools.outPlugin();
  },

  handlePrompt: async ({ code, type, payload }) => {
    utools.hideMainWindow();
    const config = getConfig().config;
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
        console.log(content);
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
  } else if (code.endsWith(feature_suffix)) {
    await commandHandlers.handleAssistant(action);
  } else {
    await commandHandlers.handlePrompt(action);
  }
});