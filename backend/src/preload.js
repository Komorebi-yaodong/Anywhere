const {
  getConfig,
  updateConfig,
  saveSetting,
  updateConfigWithoutFeatures,
  checkConfig,
  getUser,
  copyText,
  sethotkey,
  openWindow,
  openFastInputWindow,
  coderedirect,
  setZoomFactor,
  feature_suffix,
  defaultConfig,
  savePromptWindowSettings,
  saveMcpToolCache,
  getMcpToolCache,
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
  isFileTypeSupported,
  parseFileObject,
} = require('./file.js');

const {
  getRandomItem,
} = require('./input.js');

// 引入重构后的 MCP 模块
const {
  initializeMcpClient,
  invokeMcpTool,
  closeMcpClient,
  connectAndFetchTools,
  connectAndInvokeTool,
} = require('./mcp.js');

window.api = {
  getConfig,
  updateConfig,
  saveSetting,
  updateConfigWithoutFeatures,
  getUser,
  getRandomItem,
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
  getMcpToolCache,
  initializeMcpClient: async (activeServerConfigs) => {
    try {
      const cache = await getMcpToolCache();
      return await initializeMcpClient(activeServerConfigs, cache, saveMcpToolCache);
    } catch (e) {
      console.error("[Preload] Error loading MCP cache:", e);
      return await initializeMcpClient(activeServerConfigs, {}, saveMcpToolCache);
    }
  },
  testMcpConnection: async (serverConfig) => {
    try {
      // 1. 获取新工具列表
      const rawTools = await connectAndFetchTools(serverConfig.id, {
        transport: serverConfig.type,
        command: serverConfig.command,
        args: serverConfig.args,
        url: serverConfig.baseUrl,
        env: serverConfig.env,
        headers: serverConfig.headers,
      });
      
      const sanitizedTools = rawTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || tool.schema || {} 
      }));

      // 2. 读取旧缓存并合并状态
      const oldCacheMap = await getMcpToolCache();
      const oldTools = oldCacheMap ? (oldCacheMap[serverConfig.id] || []) : [];
      
      const mergedTools = sanitizedTools.map(newTool => {
          const oldTool = oldTools.find(t => t.name === newTool.name);
          return {
              ...newTool,
              // 如果旧缓存存在且明确设置了 enabled，则沿用；否则默认为 true
              enabled: oldTool ? (oldTool.enabled ?? true) : true
          };
      });

      const cleanTools = JSON.parse(JSON.stringify(mergedTools));
      
      // 3. 保存合并后的结果
      await saveMcpToolCache(serverConfig.id, cleanTools);
      
      return { success: true, tools: cleanTools };
    } catch (error) {
      console.error("[Preload] MCP Test Connection Error:", error);
      return { success: false, error: String(error.message || error) };
    }
  },
  saveMcpToolCache,
  // 测试具体工具调用
  testInvokeMcpTool: async (serverConfig, toolName, args) => {
      try {
          const result = await connectAndInvokeTool(serverConfig.id, {
              transport: serverConfig.type,
              command: serverConfig.command,
              args: serverConfig.args,
              url: serverConfig.baseUrl,
              env: serverConfig.env,
              headers: serverConfig.headers,
              type: serverConfig.type // 确保 type 传递给 builtin 判断
          }, toolName, args);
          return { success: true, result };
      } catch (error) {
          return { success: false, error: String(error.message || error) };
      }
  },
  invokeMcpTool,
  closeMcpClient,
  isFileTypeSupported,
  parseFileObject,
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

  // 直接打开快捷助手
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

  // 匹配调用
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

    // 正则匹配成功后，恢复为over
    if (type === 'regex') {
        type = 'over';
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
    } else if (promptConfig.showMode === 'fastinput') {
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
        const msg = {
          code,
          content,
        };
        await openFastInputWindow(config, msg);
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
        bw.webContents.send('always-on-top-changed', newState);
        break;
      }
      case 'close-window': {
        bw.close();
        windowMap.delete(senderId);
        break;
      }
      // [新增] 最小化
      case 'minimize-window': {
        bw.minimize();
        break;
      }
      // [新增] 最大化/还原
      case 'maximize-window': {
        if (bw.isMaximized()) {
          bw.unmaximize();
        } else {
          bw.maximize();
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[IPC Hub] Error handling event '${event}' for window ${senderId}:`, err);
  }
});