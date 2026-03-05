const {
  getRandomItem,
} = require('./chat.js');

const {
  getConfig,
  updateConfig,
  saveSetting,
  updateConfigWithoutFeatures,
  checkConfig,
  getUser,
  copyText,
  openWindow,
  openFastInputWindow,
  coderedirect,
  setZoomFactor,
  feature_suffix,
  defaultConfig,
  savePromptWindowSettings,
  saveMcpToolCache,
  getMcpToolCache,
  broadcastEvent,
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
  copyLocalPath,
} = require('./file.js');


const {
  invokeBuiltinTool,
} = require('./mcp_builtin.js');

const {
  initializeMcpClient,
  invokeMcpTool,
  closeMcpClient,
  connectAndFetchTools,
  connectAndInvokeTool,
} = require('./mcp.js');

const {
  listSkills,
  getSkillDetails,
  generateSkillToolDefinition,
  resolveSkillInvocation,
  saveSkill,
  deleteSkill,
  exportSkillToPackage,
  extractSkillPackage,
} = require('./skill.js');

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
  copyLocalPath: async (src, dest) => {
    try {
      await copyLocalPath(src, dest);
      return true;
    } catch (e) {
      console.error("Copy failed:", e);
      throw e;
    }
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
    const res = await saveSkill(rootPath, id, content);
    broadcastEvent('skills-updated');
    return res;
  },
  deleteSkill: async (rootPath, id) => {
    const res = await deleteSkill(rootPath, id);
    broadcastEvent('skills-updated');
    return res;
  },
  // 暴露给前端的导出/导入接口
  exportSkillToPackage: async (rootPath, skillId, outputDir) => {
    return exportSkillToPackage(rootPath, skillId, outputDir);
  },
  extractSkillPackage: async (filePath) => {
    return extractSkillPackage(filePath);
  },
  // 在文件管理器中显示文件
  shellShowItemInFolder: (fullPath) => {
    utools.shellShowItemInFolder(fullPath);
  },
  // 生成 Skill Tool 定义 (供前端构建请求参数时使用)
  getSkillToolDefinition: async (rootPath, enabledSkillNames = []) => {
    try {
      const allSkills = listSkills(rootPath);
      // 过滤出已启用且存在的 Skills
      const activeSkills = allSkills.filter(s => enabledSkillNames.includes(s.name));
      if (activeSkills.length === 0) return null;
      return generateSkillToolDefinition(activeSkills, rootPath);
    } catch (e) {
      return null;
    }
  },
  // 执行 Skill (AI 调用 tool 时使用)
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

    // 3. 普通模式，将文本结果包装为标准 MCP JSON 格式字符串
    // 这样前端收到后能统一解析为 content 数组，而不是纯文本
    return JSON.stringify([{
      type: "text",
      text: result
    }], null, 2);
  },
  // 暴露 path.join 给前端创建新 Skill 文件夹用
  pathJoin: (...args) => require('path').join(...args),
  addTaskHistory: async (taskId, logEntry) => {
    const { addTaskHistory } = require('./data.js');
    return await addTaskHistory(taskId, logEntry);
  },
  runTaskNow: async (taskId) => {
    const { getConfig, openWindow } = require('./data.js');
    const configResult = await getConfig();
    const tasks = configResult.config.tasks || {};
    const task = tasks[taskId];
    if (!task) return false;

    const windowConfig = JSON.parse(JSON.stringify(configResult.config));
    
    // 处理默认助手的临时配置构造
    if (task.promptKey === '__DEFAULT__') {
        if (!windowConfig.prompts) windowConfig.prompts = {};
        windowConfig.prompts['__DEFAULT__'] = {
            type: "general",
            prompt: "", 
            showMode: "window",
            model: windowConfig.defaultTaskModel || "", 
            stream: true, 
            isAlwaysOnTop: windowConfig.isAlwaysOnTop_global ?? true,
            autoCloseOnBlur: windowConfig.autoCloseOnBlur_global ?? true,
            window_width: 580,
            window_height: 740,
            icon: "" 
        };
    }

    const msg = {
      os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
      code: task.promptKey,
      type: "task",
      payload: task.description,
      taskConfig: { id: taskId, ...task },
      tempPromptConfig: task.promptKey === '__DEFAULT__' ? windowConfig.prompts['__DEFAULT__'] : null
    };
    
    await openWindow(windowConfig, msg);
    return true;
  },
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
      // 最小化
      case 'minimize-window': {
        bw.minimize();
        break;
      }
      // 最大化/还原
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

// --- 定时任务轮询调度器 ---
let lastCheckMinute = Math.floor(Date.now() / 60000);
setInterval(async () => {
  try {
    const currentMinute = Math.floor(Date.now() / 60000);
    if (currentMinute <= lastCheckMinute) return;
    lastCheckMinute = currentMinute;

    const configResult = await getConfig();
    const tasks = configResult.config.tasks || {};
    const now = Date.now();
    let needsUpdate = false;

    for (const taskId in tasks) {
      const task = tasks[taskId];
      if (!task.enabled) continue;

      let shouldTrigger = false;
      const lastRun = task.lastRunTime || 0;

      // 获取当前的具体时分
      const currentH = new Date().getHours();
      const currentM = new Date().getMinutes();
      // 防抖：确保同一分钟内不会因为重复判断而触发两次
      const safeCooldown = (now - lastRun) > 60000;

      if (task.triggerType === 'interval') {
        if (task.intervalStartTime) {
          const [hours, minutes] = task.intervalStartTime.split(':').map(Number);
          const currentTotalMins = currentH * 60 + currentM;
          const startTotalMins = hours * 60 + minutes;
          const intervalMins = Math.max(task.intervalMinutes || 1, 1);

          if (currentTotalMins >= startTotalMins) {
            const diffMins = currentTotalMins - startTotalMins;
            if (diffMins % intervalMins === 0 && safeCooldown) {
              shouldTrigger = true;
            }
          }
        } else {
          // 纯间隔触发（无特定时间点），由于没有对齐的时钟点，仅依据与上一次触发的时间差来定
          const intervalMs = Math.max(task.intervalMinutes || 1, 1) * 60000;
          if (now - lastRun >= intervalMs) {
            shouldTrigger = true;
          }
        }
      } else if (task.triggerType === 'daily' && task.dailyTime) {
        const [hours, minutes] = task.dailyTime.split(':').map(Number);
        if (currentH === hours && currentM === minutes && safeCooldown) {
          shouldTrigger = true;
        }
      } else if (task.triggerType === 'weekly' && task.weeklyTime && task.weeklyDays) {
        const [hours, minutes] = task.weeklyTime.split(':').map(Number);
        const currentDay = new Date().getDay();
        if (task.weeklyDays.includes(currentDay)) {
          if (currentH === hours && currentM === minutes && safeCooldown) {
            shouldTrigger = true;
          }
        }
      } else if (task.triggerType === 'monthly' && task.monthlyTime) {
        const [hours, minutes] = task.monthlyTime.split(':').map(Number);
        const currentMonthDay = new Date().getDate();
        const validDays = Array.isArray(task.monthlyDays) ? task.monthlyDays : [];
        
        if (validDays.includes(currentMonthDay)) {
          if (currentH === hours && currentM === minutes && safeCooldown) {
            shouldTrigger = true;
          }
        }
      }

      if (shouldTrigger && task.triggerType === 'interval' && task.intervalTimeRanges && task.intervalTimeRanges.length > 0) {
        const nowHhMm = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
        const isWithinRange = task.intervalTimeRanges.some(range => {
            if (Array.isArray(range) && range.length === 2) {
                return nowHhMm >= range[0] && nowHhMm <= range[1];
            }
            return false;
        });
        
        // 如果当前时间不在任何一个设定的时间段内，否决触发
        if (!isWithinRange) {
            shouldTrigger = false;
        }
      }

      if (shouldTrigger) {
        task.lastRunTime = now;
        needsUpdate = true;

        const windowConfig = JSON.parse(JSON.stringify(configResult.config));

        if (task.promptKey === '__DEFAULT__') {
            if (!windowConfig.prompts) windowConfig.prompts = {};
            windowConfig.prompts['__DEFAULT__'] = {
                type: "general",
                prompt: "", 
                showMode: "window",
                model: windowConfig.defaultTaskModel || "", 
                stream: true, 
                isAlwaysOnTop: windowConfig.isAlwaysOnTop_global ?? true,
                autoCloseOnBlur: windowConfig.autoCloseOnBlur_global ?? true,
                window_width: 580,
                window_height: 740,
                icon: "" 
            };
        }

        // 触发独立窗口
        const msg = {
          os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
          code: task.promptKey,
          type: "task",
          payload: task.description,
          taskConfig: { id: taskId, ...task },
          tempPromptConfig: task.promptKey === '__DEFAULT__' ? windowConfig.prompts['__DEFAULT__'] : null
        };
        // 传入安全的 windowConfig
        await openWindow(windowConfig, msg);
      }
    }

    if (needsUpdate) {
      await updateConfigWithoutFeatures(configResult);
    }
  } catch (e) {
    console.error("Task Scheduler Error:", e);
  }
}, 1000); // 【修改】将 30000 改为 1000，每秒轮询一次，保证精准执行