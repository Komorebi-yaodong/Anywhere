const webFrame = require('electron').webFrame;
const crypto = require('crypto');
const windowMap = new Map();
const feature_suffix = "anywhere助手^_^"

const {
  requestTextOpenAI
} = require('./input.js');

// 默认配置 (保持不变)
const defaultConfig = {
  config: {
    providers: {
      "0": {
        name: "default",
        url: "https://api.openai.com/v1",
        api_key: "",
        modelList: [],
        enable: true,
      },
    },
    providerOrder: ["0",],
    prompts: {
      AI: {
        type: "over",
        prompt: `你是一个AI助手`,
        showMode: "window",
        model: "0|gpt-4o",
        enable: true,
        icon: "",
        stream: true,
        temperature: 0.7,
        isTemperature: false,
        isDirectSend_file: false,
        isDirectSend_normal: true,
        ifTextNecessary: false,
        voice: null,
        reasoning_effort: "default",
        defaultMcpServers: [],
        window_width: 580,
        window_height: 740,
        position_x: 0,
        position_y: 0,
        autoCloseOnBlur: true,
        isAlwaysOnTop: true,
      },
    },
    fastWindowPosition: { x: 0, y: 0 },
    mcpServers: {},
    language: "zh",
    tags: {},
    skipLineBreak: false,
    CtrlEnterToSend: false,
    showNotification: true,
    isDarkMode: false,
    fix_position: false,
    isAlwaysOnTop_global: true,
    autoCloseOnBlur_global: true,
    zoom: 1,
    webdav: {
      url: "",
      username: "",
      password: "",
      path: "/anywhere",
      data_path: "/anywhere_data",
      localChatPath: ""
    },
    voiceList: [
      "alloy-👩",
      "echo-👨‍🦰清晰",
      "nova-👩清晰",
      "sage-👧年轻",
      "shimmer-👧明亮",
      "fable-😐中性",
      "coral-👩客服",
      "ash-🧔‍♂️商业",
      "ballad-👨故事",
      "verse-👨诗歌",
      "onyx-👨‍🦰新闻",
      "Zephyr-👧明亮",
      "Puck-👦欢快",
      "Charon-👦信息丰富",
      "Kore-👩坚定",
      "Fenrir-👨‍🦰易激动",
      "Leda-👧年轻",
      "Orus-👨‍🦰鉴定",
      "Aoede-👩轻松",
      "Callirrhoe-👩随和",
      "Autonoe-👩明亮",
      "Enceladus-🧔‍♂️呼吸感",
      "Iapetus-👦清晰",
      "Umbriel-👦随和",
      "Algieba-👦平滑",
      "Despina-👩平滑",
      "Erinome-👩清晰",
      "Algenib-👨‍🦰沙哑",
      "Rasalgethi-👨‍🦰信息丰富",
      "Laomedeia-👩欢快",
      "Achernar-👩轻柔",
      "Alnilam-👦坚定",
      "Schedar-👦平稳",
      "Gacrux-👩成熟",
      "Pulcherrima-👩向前",
      "Achird-👦友好",
      "Zubenelgenubi-👦休闲",
      "Vindemiatrix-👩温柔",
      "Sadachbia-👨‍🦰活泼",
      "Sadaltager-👨‍🦰博学",
      "Sulafat-👩温暖"
    ],
  }
};

/**
 * [已重构] 拆分完整的 config 对象以便于分块存储
 * @param {object} fullConfig - 包含 prompts 和 providers 的完整 config 对象
 * @returns {{baseConfigPart: object, promptsPart: object, providersPart: object, mcpServersPart: object}} - 拆分后的四部分
 */
function splitConfigForStorage(fullConfig) {
  const { prompts, providers, mcpServers, ...restOfConfig } = fullConfig;

  return {
    baseConfigPart: { config: restOfConfig },
    promptsPart: prompts,
    providersPart: providers,
    mcpServersPart: mcpServers,
  };
}

/**
 * 从数据库异步读取配置，合并分块数据，并处理旧版本数据迁移
 * @returns {Promise<object>} - 返回包含完整配置对象的 Promise
 */
async function getConfig() {
  let configDoc = await utools.db.promises.get("config");

  // --- 1. 新用户初始化 ---
  if (!configDoc) {
    // console.log("Anywhere: Initializing configuration for a new user.");
    const { baseConfigPart, promptsPart, providersPart, mcpServersPart } = splitConfigForStorage(defaultConfig.config);
    await utools.db.promises.put({ _id: "config", data: baseConfigPart });
    await utools.db.promises.put({ _id: "prompts", data: promptsPart });
    await utools.db.promises.put({ _id: "providers", data: providersPart });
    await utools.db.promises.put({ _id: "mcpServers", data: mcpServersPart });
    return defaultConfig;
  }

  // --- 2. 旧版本数据自动迁移 ---
  if (configDoc.data.config && configDoc.data.config.prompts) {
    console.warn("Anywhere: Old configuration format detected. Starting migration.");
    const oldFullConfig = configDoc.data.config;
    const { baseConfigPart, promptsPart, providersPart, mcpServersPart } = splitConfigForStorage(oldFullConfig);

    await utools.db.promises.put({ _id: "prompts", data: promptsPart });
    await utools.db.promises.put({ _id: "providers", data: providersPart });
    await utools.db.promises.put({ _id: "mcpServers", data: mcpServersPart });

    const updateResult = await utools.db.promises.put({
      _id: "config",
      data: baseConfigPart,
      _rev: configDoc._rev
    });

    if (updateResult.ok) {
      console.log("Anywhere: Migration successful. Old config cleaned.");
    } else {
      console.error("Anywhere: Migration failed to update old config document.", updateResult.message);
    }
    configDoc = await utools.db.promises.get("config");
  }

  // --- 3. 异步读取新版分块数据并合并 ---
  const fullConfigData = configDoc.data;
  const [promptsDoc, providersDoc, mcpServersDoc] = await Promise.all([
    utools.db.promises.get("prompts"),
    utools.db.promises.get("providers"),
    utools.db.promises.get("mcpServers")
  ]);

  fullConfigData.config.prompts = promptsDoc ? promptsDoc.data : defaultConfig.config.prompts;
  fullConfigData.config.providers = providersDoc ? providersDoc.data : defaultConfig.config.providers;
  fullConfigData.config.mcpServers = mcpServersDoc ? mcpServersDoc.data : defaultConfig.config.mcpServers || {};

  return fullConfigData;
}


function checkConfig(config) {
  let flag = false;
  if (config.version !== "1.9.13") {
    config.version = "1.9.13";
    flag = true;
  }
  if (config.isAlwaysOnTop_global === undefined) {
    config.isAlwaysOnTop_global = true;
    flag = true;
  }
  if (config.autoCloseOnBlur_global === undefined) {
    config.autoCloseOnBlur_global = true;
    flag = true;
  }
  if (config.window_width || config.window_height) {
    delete config.window_width;
    delete config.window_height;
    flag = true;
  }
  if (config.stream !== undefined) {
    delete config.stream;
    flag = true;
  }

  if (config.autoCloseOnBlur !== undefined) {
    delete config.autoCloseOnBlur;
    flag = true;
  }
  if (config.isAlwaysOnTop !== undefined) {
    delete config.isAlwaysOnTop;
    flag = true;
  }
  if (config.CtrlEnterToSend == undefined) {
    config.CtrlEnterToSend = false;
    flag = true;
  }
  if (config.showNotification == undefined) {
    config.showNotification = false;
    flag = true;
  }

  if (config.position_x || config.position_y) {
    delete config.position_x;
    delete config.position_y;
    flag = true;
  }

  if (config.fix_position == undefined) {
    config.fix_position = false;
    flag = true;
  }

  if (config.zoom == undefined) {
    config.zoom = 1;
    flag = true;
  }

  if (config.inputLayout) {
    delete config.inputLayout;
    flag = true;
  }

  if (config.mcpServers === undefined) {
    config.mcpServers = {};
    flag = true;
  }
  if (config.fastWindowPosition === undefined) {
    config.fastWindowPosition = null;
    flag = true;
  }

  if (config.voiceList === undefined) {
    config.voiceList = [
      "alloy-👩",
      "echo-👨‍🦰清晰",
      "nova-👩清晰",
      "sage-👧年轻",
      "shimmer-👧明亮",
      "fable-😐中性",
      "coral-👩客服",
      "ash-🧔‍♂️商业",
      "ballad-👨故事",
      "verse-👨诗歌",
      "onyx-👨‍🦰新闻",
      "Zephyr-👧明亮",
      "Puck-👦欢快",
      "Charon-👦信息丰富",
      "Kore-👩坚定",
      "Fenrir-👨‍🦰易激动",
      "Leda-👧年轻",
      "Orus-👨‍🦰鉴定",
      "Aoede-👩轻松",
      "Callirrhoe-👩随和",
      "Autonoe-👩明亮",
      "Enceladus-🧔‍♂️呼吸感",
      "Iapetus-👦清晰",
      "Umbriel-👦随和",
      "Algieba-👦平滑",
      "Despina-👩平滑",
      "Erinome-👩清晰",
      "Algenib-👨‍🦰沙哑",
      "Rasalgethi-👨‍🦰信息丰富",
      "Laomedeia-👩欢快",
      "Achernar-👩轻柔",
      "Alnilam-👦坚定",
      "Schedar-👦平稳",
      "Gacrux-👩成熟",
      "Pulcherrima-👩向前",
      "Achird-👦友好",
      "Zubenelgenubi-👦休闲",
      "Vindemiatrix-👩温柔",
      "Sadachbia-👨‍🦰活泼",
      "Sadaltager-👨‍🦰博学",
      "Sulafat-👩温暖"
    ];
    flag = true;
  }

  if (config.webdav == undefined) {
    config.webdav = {
      url: "",
      username: "",
      password: "",
      path: "/anywhere",
      data_path: "/anywhere_data",
    };
    flag = true;
  }
  // 删除错误的存储参数
  if (config.webdav.dataPath && config.webdav.data_path == undefined) {
    config.webdav.data_path = config.webdav.dataPath;
    delete config.webdav.dataPath;
    flag = true;

  } else if (config.webdav.dataPath) {
    delete config.webdav.dataPath;
  }
  if (config.webdav.data_path == undefined) {
    config.webdav.data_path = "/anywhere_data";
    flag = true;
  }
  if (config.webdav.localChatPath == undefined) {
    config.webdav.localChatPath = "";
    flag = true;
  }

  if (config.apiUrl) {
    config.providers["0"] = {
      name: "default",
      url: config.apiUrl,
      api_key: config.apiKey,
      modelList: [config.modelSelect,].concat(config.ModelsListByUser),
      enable: true,
    };

    delete config.apiUrl;
    delete config.apiKey;
    delete config.modelList;
    delete config.ModelsListByUser;
    delete config.modelSelect;
    delete config.activeProviderId;
    config.providerOrder.unshift("0");
    flag = true;
  }

  for (let key in config.prompts) {
    if (config.prompts[key].showMode === 'input' || config.prompts[key].showMode === 'clipboard') {
      config.prompts[key].showMode = 'fastinput';
      flag = true;
    }
    if (config.prompts[key].type === 'over' && config.prompts[key].matchRegex === undefined) {
      config.prompts[key].matchRegex = "";
      flag = true;
    }
    if (config.prompts[key].defaultMcpServers === undefined) {
      config.prompts[key].defaultMcpServers = [];
      flag = true;
    }
    if (config.prompts[key].isAlwaysOnTop === undefined) {
      config.prompts[key].isAlwaysOnTop = true;
      flag = true;
    }
    if (config.prompts[key].autoCloseOnBlur === undefined) {
      config.prompts[key].autoCloseOnBlur = true;
      flag = true;
    }
    if (config.prompts[key].window_width === undefined) {
      config.prompts[key].window_width = 580;
      flag = true;
    }
    if (config.prompts[key].window_height === undefined) {
      config.prompts[key].window_height = 740;
      flag = true;
    }
    if (config.prompts[key].position_x === undefined) {
      config.prompts[key].position_x = 0;
      flag = true;
    }
    if (config.prompts[key].position_y === undefined) {
      config.prompts[key].position_y = 0;
      flag = true;
    }
    if (config.prompts[key].stream === undefined) {
      config.prompts[key].stream = true;
      flag = true;
    }

    if (config.prompts[key].voice === undefined || config.prompts[key].voice === null) {
      config.prompts[key].voice = '';
      flag = true;
    }
    if (config.prompts[key].enable === undefined) {
      config.prompts[key].enable = true;
      flag = true;
    }
    if (config.prompts[key].isTemperature === undefined) {
      config.prompts[key].isTemperature = false;
      config.prompts[key].temperature = 0.7;
      flag = true;
    }
    if (config.prompts[key].icon === undefined) {
      config.prompts[key].icon = "";
      flag = true;
    }
    if (config.prompts[key].isDirectSend_file === undefined) {
      if (config.prompts[key].isDirectSend === undefined) {
        config.prompts[key].isDirectSend_file = false;
      } else {
        config.prompts[key].isDirectSend_file = config.prompts[key].isDirectSend;
        delete config.prompts[key].isDirectSend;
      }
      flag = true;
    }
    if (config.prompts[key].isDirectSend_normal === undefined) {
      config.prompts[key].isDirectSend_normal = true;
      flag = true;
    }
    if (config.prompts[key].ifTextNecessary === undefined) {
      config.prompts[key].ifTextNecessary = false;
      flag = true;
    }
    if (config.prompts[key].reasoning_effort === undefined) {
      config.prompts[key].reasoning_effort = "default";
      flag = true;
    }
  }

  // 增加tags属性
  if (!config.tags) {
    config.tags = {};
    flag = true;
  }
  if (!config.language) {
    config.language = "zh";
    flag = true;
  }

  // 删除tool_list属性和ModelsListByUser属性
  if (config.tool_list) {
    delete config.tool_list;
    flag = true;
  }
  if (config.ModelsListByUser) {
    delete config.ModelsListByUser;
    flag = true;
  }

  // 删除promptOrder的属性
  if (config.promptOrder) {
    delete config.promptOrder;
    flag = true;
  }

  // 如果config.prompts[key].idex存在，则删除
  for (let key in config.prompts) {
    if (config.prompts[key].idex || config.prompts[key].idex === 0) {
      delete config.prompts[key].idex;
      flag = true;
    }
  }

  for (let key in config.providers) {
    // 删除modelSelect
    if (config.providers[key].modelSelect) {
      delete config.providers[key].modelSelect;
      flag = true;
    }
    if (delete config.providers[key].modelListByUser) {
      delete config.providers[key].modelListByUser;
      flag = true;
    }

    // 检查providers中的enable是否存在
    if (config.providers[key].enable === undefined) {
      config.providers[key].enable = true;
      flag = true;
    }
  }

  // 如果providerOrder为空
  if (config.providerOrder.length === 0) {
    for (let key in config.providers) {
      config.providerOrder.push(key);
    }
    flag = true;
  }

  // 检查providerOrder是否是字符串,如果是，是否存在
  for (let i = 0; i < config.providerOrder.length; i++) {
    if (typeof config.providerOrder[i] !== "string") {
      config.providerOrder[i] = config.providerOrder[i].toString();
      flag = true;
    }
    if (!config.providers[config.providerOrder[i]]) {
      config.providerOrder.splice(i, 1);
      flag = true;
    }
  }


  for (let key in config.prompts) {
    // 检查prompts中的model是否存在
    if (config.prompts[key].model) {
      let model = config.prompts[key].model.split("|");
      if (model.length === 2) {
        if (!config.providers[model[0]]) {
          config.prompts[key].model = "";
          flag = true;
        }
      }
    }
    else {
      config.prompts[key].model = `${config.providerOrder[0]}|${config.providers[config.providerOrder[0]].modelList[0]}`;
      flag = true;
    }
    if (config.prompts[key].model === "") {
      config.prompts[key].model = `${config.providerOrder[0]}|${config.providers[config.providerOrder[0]].modelList[0]}`;
      flag = true;
    }
  }

  // 检查config中是否有 isDarkMode
  if (config.isDarkMode === undefined) {
    config.isDarkMode = false;
    flag = true;
  }

  if (flag) {
    updateConfig({ "config": config });
  }

}

/**
 * 保存单个设置项，自动判断应写入哪个文档
 * @param {string} keyPath - 属性路径，如 "prompts.AI.enable" 或 "mcpServers.@id/with.dots.isPersistent"
 * @param {*} value - 要设置的值
 * @returns {{success: boolean, message?: string}} - 返回操作结果
 */
async function saveSetting(keyPath, value) {
  const rootKey = keyPath.split('.')[0];
  let docId;
  let targetKeyPath = keyPath;
  let isBaseConfig = false;

  if (rootKey === 'prompts') {
    docId = 'prompts';
    targetKeyPath = keyPath.substring('prompts.'.length);
  } else if (rootKey === 'providers') {
    docId = 'providers';
    targetKeyPath = keyPath.substring('providers.'.length);
  } else if (rootKey === 'mcpServers') {
    docId = 'mcpServers';
    targetKeyPath = keyPath.substring('mcpServers.'.length);
  } else {
    docId = 'config';
    isBaseConfig = true;
  }

  const doc = await utools.db.promises.get(docId); // 使用 await 确保获取
  if (!doc) {
    console.error(`Config document "${docId}" not found, cannot save setting.`);
    return { success: false, message: `Config document "${docId}" not found` };
  }

  let dataToUpdate = isBaseConfig ? doc.data.config : doc.data;

  const pathParts = targetKeyPath.split('.');
  let current = dataToUpdate;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (current[part] === undefined || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[pathParts[pathParts.length - 1]] = value;

  const result = await utools.db.promises.put({
    _id: docId,
    data: doc.data,
    _rev: doc._rev
  });

  if (result.ok) {
    // 保存成功后，获取完整配置并广播给所有窗口
    const fullConfig = await getConfig(); // 获取最新合并后的配置
    for (const windowInstance of windowMap.values()) {
      if (!windowInstance.isDestroyed()) {
        windowInstance.webContents.send('config-updated', fullConfig.config);
      }
    }
    return { success: true };
  } else {
    console.error(`Failed to save setting to "${docId}"`, result);
    return { success: false, message: result.message };
  }
}

/**
 * [已重构] 更新完整的配置，将其拆分为三部分并分别存储
 * @param {object} newConfig - 完整的配置对象，结构为 { config: {...} }
 */
function updateConfigWithoutFeatures(newConfig) {
  // 核心修复：在将配置存入数据库前，将其转换为纯净的 JavaScript 对象，以移除 Vue 的响应式 Proxy。
  const plainConfig = JSON.parse(JSON.stringify(newConfig.config));
  const { baseConfigPart, promptsPart, providersPart, mcpServersPart } = splitConfigForStorage(plainConfig);

  // 1. 更新基础配置 (config)
  let configDoc = utools.db.get("config");
  utools.db.put({
    _id: "config",
    data: baseConfigPart,
    _rev: configDoc ? configDoc._rev : undefined,
  });

  // 2. 更新快捷助手配置 (prompts)
  let promptsDoc = utools.db.get("prompts");
  utools.db.put({
    _id: "prompts",
    data: promptsPart,
    _rev: promptsDoc ? promptsDoc._rev : undefined,
  });

  // 3. 更新服务商配置 (providers)
  let providersDoc = utools.db.get("providers");
  utools.db.put({
    _id: "providers",
    data: providersPart,
    _rev: providersDoc ? providersDoc._rev : undefined,
  });

  // 4. 更新MCP服务器配置 (mcpServers)
  let mcpServersDoc = utools.db.get("mcpServers");
  utools.db.put({
    _id: "mcpServers",
    data: mcpServersPart,
    _rev: mcpServersDoc ? mcpServersDoc._rev : undefined,
  });

  // 5. 广播配置更新给所有已打开的独立窗口
  for (const windowInstance of windowMap.values()) {
    if (!windowInstance.isDestroyed()) {
      // 发送新的配置对象（plainConfig 即为 config 部分）
      windowInstance.webContents.send('config-updated', plainConfig);
    }
  }
}

function updateConfig(newConfig) {
  const features = utools.getFeatures();
  const featuresMap = new Map(features.map((feature) => [feature.code, feature]));
  const currentPrompts = newConfig.config.prompts || {};
  const enabledPromptKeys = new Set();

  for (let key in currentPrompts) {
    const prompt = currentPrompts[key];
    if (prompt.enable) {
      enabledPromptKeys.add(key);
      const featureCode = key;
      const functionCmdCode = key + feature_suffix;

      // 更新或添加匹配指令
      const expectedMatchFeature = {
        code: featureCode,
        explain: key,
        mainHide: true,
        cmds: [],
        icon: prompt.icon || ""
      };
      if (prompt.type === "general") {
        expectedMatchFeature.cmds.push({ type: "over", label: key, "maxLength": 99999999999 });
        expectedMatchFeature.cmds.push({ type: "img", label: key });
        expectedMatchFeature.cmds.push({ type: "files", label: key, fileType: "file", match: "/\\.(png|jpeg|jpg|webp|docx|xlsx|xls|csv|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue)$/i" });
      } else if (prompt.type === "files") {
        expectedMatchFeature.cmds.push({ type: "files", label: key, fileType: "file", match: "/\\.(png|jpeg|jpg|webp|docx|xlsx|xls|csv|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue)$/i" });
      } else if (prompt.type === "img") {
        expectedMatchFeature.cmds.push({ type: "img", label: key });
      } else if (prompt.type === "over") {
        // 根据 matchRegex 决定生成 regex 还是 over 类型的 cmd
        if (prompt.matchRegex && prompt.matchRegex.trim() !== '') {
          expectedMatchFeature.cmds.push({
            type: "regex",
            label: key,
            match: prompt.matchRegex,
            minLength: 1
          });
        } else {
          expectedMatchFeature.cmds.push({ type: "over", label: key, "maxLength": 99999999999 });
        }
      }
      utools.setFeature(expectedMatchFeature);

      // 更新或添加功能指令（仅限窗口模式和快速展示模式）
      if (prompt.showMode === "window") {
        utools.setFeature({
          code: functionCmdCode,
          explain: key,
          mainHide: true,
          cmds: [key],
          icon: prompt.icon || ""
        });
      } else {
        if (featuresMap.has(functionCmdCode)) {
          utools.removeFeature(functionCmdCode);
        }
      }
    }
  }

  // 移除不再需要的 features
  for (const [code, feature] of featuresMap) {
    if (code === "Anywhere Settings" || code === "Resume Conversation") continue;
    const promptKey = feature.explain;
    if (!enabledPromptKeys.has(promptKey) ||
      (currentPrompts[promptKey] && (currentPrompts[promptKey].showMode !== "window") && code.endsWith(feature_suffix))
    ) {
      utools.removeFeature(code);
    }
  }

  // 最后将配置写入数据库
  updateConfigWithoutFeatures(newConfig);
}

function getUser() {
  return utools.getUser();
}

function getPosition(config, promptCode) {
  const promptConfig = config.prompts[promptCode];
  const OVERFLOW_ALLOWANCE = 10; // 允许窗口超出屏幕边界的最大像素值

  let width = promptConfig?.window_width || 580;
  let height = promptConfig?.window_height || 740;
  let windowX = 0, windowY = 0;

  const primaryDisplay = utools.getPrimaryDisplay();
  let currentDisplay;

  // 检查坐标是否存在使用 '!= null'，这可以正确处理 0
  const hasFixedPosition = config.fix_position && promptConfig && promptConfig.position_x != null && promptConfig.position_y != null;

  // 1. 根据设置（固定位置或鼠标位置）确定目标显示器和初始位置
  if (hasFixedPosition) {
    let set_position = { x: promptConfig.position_x, y: promptConfig.position_y };
    currentDisplay = utools.getDisplayNearestPoint(set_position) || primaryDisplay;
    windowX = Math.floor(promptConfig.position_x);
    windowY = Math.floor(promptConfig.position_y);
  } else {
    const mouse_position = utools.getCursorScreenPoint();
    currentDisplay = utools.getDisplayNearestPoint(mouse_position) || primaryDisplay;
    windowX = Math.floor(mouse_position.x - (width / 2));
    windowY = Math.floor(mouse_position.y);
  }

  // 2. 确保窗口在目标显示器边界内
  if (currentDisplay) {
    const display = currentDisplay.bounds;

    // 检查并修正窗口大小，确保不超过显示器尺寸
    if (width > display.width) {
      width = display.width;
    }
    if (height > display.height) {
      height = display.height;
    }

    // 定义显示器的有效边界（考虑允许的溢出）
    const minX = display.x - OVERFLOW_ALLOWANCE;
    const maxX = display.x + display.width - width + OVERFLOW_ALLOWANCE;
    const minY = display.y - OVERFLOW_ALLOWANCE;
    const maxY = display.y + display.height - height + OVERFLOW_ALLOWANCE;

    // 检查窗口是否完全在显示器之外，如果是，则将其居中
    if (
      (windowX + width < display.x) || (windowX > display.x + display.width) ||
      (windowY + height < display.y) || (windowY > display.y + display.height)
    ) {
      windowX = display.x + (display.width - width) / 2;
      windowY = display.y + (display.height - height) / 2;
    } else {
      // 如果窗口部分在显示器外，则将其拉回边界内
      if (windowX < minX) windowX = minX;
      if (windowX > maxX) windowX = maxX;
      if (windowY < minY) windowY = minY;
      if (windowY > maxY) windowY = maxY;
    }
  }

  // 3. 返回最终计算的位置和尺寸
  return { x: Math.round(windowX), y: Math.round(windowY), width, height };
}

function saveFastInputWindowPosition(position) {
  const configDoc = utools.db.get("config");
  if (configDoc) {
    const data = configDoc.data;
    data.config.fastWindowPosition = position;
    utools.db.put({
      _id: "config",
      data: data,
      _rev: configDoc._rev
    });
  }
}

function getFastInputPosition(config) {
  const width = 300;
  const height = 70;

  const primaryDisplay = utools.getPrimaryDisplay();
  let displayBounds;
  let x, y;

  if (config.fastWindowPosition && typeof config.fastWindowPosition.x === 'number' && typeof config.fastWindowPosition.y === 'number') {
    x = config.fastWindowPosition.x;
    y = config.fastWindowPosition.y;
    displayBounds = utools.getDisplayNearestPoint({"x":x, "y": y}).bounds;
  } else {
    // 默认位置：屏幕中央偏下 (90%高度处)
    displayBounds = primaryDisplay.bounds;
    x = Math.floor(displayBounds.x + (displayBounds.width - width) / 2);
    y = Math.floor(displayBounds.y + displayBounds.height * 0.85);
  }

  // 边界检查，防止窗口跑出屏幕
  const padding = 10;
  if (x < displayBounds.x) x = displayBounds.x + padding;
  if (x + width > displayBounds.x + displayBounds.width) x = displayBounds.x + displayBounds.width - width - padding;
  if (y < displayBounds.y) y = displayBounds.y + padding;
  if (y + height > displayBounds.y + displayBounds.height) y = displayBounds.y + displayBounds.height - height - padding;

  return { x, y, width, height };
}

// utools 插件调用 copyText 函数
function copyText(content) {
  utools.copyText(content);
}

async function sethotkey(prompt_name, auto_copy) {
  utools.redirectHotKeySetting(prompt_name, auto_copy);
}

async function openWindow(config, msg) {
  // 计时开始
  let startTime;
  if (utools.isDev()) {
    startTime = performance.now();
    console.log(`[Timer Start] Opening window for code: ${msg.code}`);
  }

  msg.config = config;

  const promptCode = msg.originalCode || msg.code;
  const { x, y, width, height } = getPosition(config, promptCode);
  const promptConfig = config.prompts[promptCode];
  const isAlwaysOnTop = promptConfig?.isAlwaysOnTop ?? true;
  let channel = "window";
  const backgroundColor = config.isDarkMode ? `rgba(33, 33, 33, 1)` : 'rgba(255, 255, 253, 1)';

  // 为窗口生成唯一ID并添加到消息中
  const senderId = crypto.randomUUID();
  msg.senderId = senderId;
  msg.isAlwaysOnTop = isAlwaysOnTop;

  const windowOptions = {
    show: false,
    backgroundColor: backgroundColor,
    title: "Anywhere",
    width: width,
    height: height,
    alwaysOnTop: isAlwaysOnTop,
    x: x,
    y: y,
    frame: false,
    transparent: false,
    hasShadow:true,
    webPreferences: {
      preload: "./window_preload.js",
      devTools: utools.isDev()
    },
  };
  const entryPath = config.isDarkMode ? "./window/index.html?dark=1" : "./window/index.html";
  const ubWindow = utools.createBrowserWindow(
    entryPath,
    windowOptions,
    () => {
      // 将窗口实例存入Map
      windowMap.set(senderId, ubWindow);
      ubWindow.show();

      // 计时结束
      if (utools.isDev()) {
        const windowShownTime = performance.now();
        console.log(`[Timer Checkpoint] utools.createBrowserWindow callback executed. Elapsed: ${(windowShownTime - startTime).toFixed(2)} ms`);
      }
      ubWindow.webContents.send(channel, msg);
    }
  );
  if (utools.isDev()) {
    ubWindow.webContents.openDevTools({ mode: "detach" });
  }
}

async function coderedirect(label, payload) {
  utools.redirect(label, payload);
}

function setZoomFactor(factor) {
  webFrame.setZoomFactor(factor);
}

/**
 * 保存单个快捷助手的窗口设置，直接操作 "prompts" 文档
 * @param {string} promptKey - 快捷助手的 key
 * @param {object} settings - 要保存的窗口设置
 * @returns {Promise<{success: boolean, message?: string}>}
 */
async function savePromptWindowSettings(promptKey, settings) {
  const MAX_RETRIES = 5;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    const promptsDoc = utools.db.get("prompts");
    if (!promptsDoc || !promptsDoc.data) {
      return { success: false, message: "Prompts document not found" };
    }

    const promptsData = promptsDoc.data;
    if (!promptsData[promptKey]) {
      // 如果快捷助手不存在，则无法更新。这是一个错误情况。
      return { success: false, message: `Prompt with key '${promptKey}' not found in document` };
    }

    // 将新的设置合并到现有的快捷助手配置中
    promptsData[promptKey] = {
      ...promptsData[promptKey],
      ...settings
    };

    // 尝试保存更新后的文档
    const result = utools.db.put({
      _id: "prompts",
      data: promptsData,
      _rev: promptsDoc._rev
    });

    if (result.ok) {
      return { success: true, rev: result.rev }; // 成功！
    }

    if (result.error && result.name === 'conflict') {
      // 检测到冲突。增加尝试次数，循环将自动重试。
      attempt++;
      // 为调试记录冲突，但不打扰用户。
      // console.log(`Anywhere: DB conflict on saving window settings (attempt ${attempt}/${MAX_RETRIES}). Retrying...`);
    } else {
      // 发生了其他错误（例如验证失败），因此立即失败。
      return { success: false, message: result.message || 'An unknown database error occurred.' };
    }
  }

  // 如果退出循环，意味着已超出重试次数。
  return { success: false, message: `Failed to save settings after ${MAX_RETRIES} attempts due to persistent database conflicts.` };
}

async function openFastInputWindow(config, msg) {
  // 计时开始
  let startTime;
  if (utools.isDev()) {
    startTime = performance.now();
    console.log(`[Timer Start] Opening window for code: ${msg.code}`);
  }
  // 1. 【并行】立即发起 AI 请求
  const streamBuffer = []; // 缓冲区，用于存储窗口未就绪时收到的数据
  let fastWindowRef = null; // 用于在请求回调中引用窗口

  // 定义发送数据到窗口的辅助函数
  const sendToWindow = (type, payload) => {
    if (fastWindowRef && !fastWindowRef.isDestroyed()) {
      fastWindowRef.webContents.send('stream-update', { type, payload });
    } else {
      // 窗口还没好，存入缓冲区
      streamBuffer.push({ type, payload });
    }
  };

  // 执行请求处理逻辑 (不 await，让其在后台运行)
  requestTextOpenAI(msg.code, msg.content, config).then(async (response) => {
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const isStream = config.prompts[msg.code].stream ?? true;

    if (isStream) {
      // --- 流式处理 ---
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.lastIndexOf("\n");

        if (boundary !== -1) {
          const completeData = buffer.substring(0, boundary);
          buffer = buffer.substring(boundary + 1);

          const lines = completeData.split("\n").filter((line) => line.trim() !== "");
          for (const line of lines) {
            const message = line.replace(/^data: /, "");
            if (message === "[DONE]") break;
            try {
              const parsed = JSON.parse(message);
              if (parsed.choices[0].delta.content) {
                const chunk = parsed.choices[0].delta.content;
                sendToWindow('chunk', chunk);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } else {
      // --- 非流式处理 ---
      const data = await response.json();
      const fullText = data.choices[0].message.content || "";
      sendToWindow('chunk', fullText);
    }

    isStreamEnded = true;
    sendToWindow('done', null);

  }).catch((error) => {
    console.error("FastWindow AI Request Error:", error);
    streamError = error.message;
    sendToWindow('error', error.message);
  });

  // 2. 【并行】创建窗口
  msg.config = config;
  const { x, y, width, height } = getFastInputPosition(config);
  let channel = "fast-window";
  const senderId = crypto.randomUUID();
  msg.senderId = senderId;

  const windowOptions = {
    show: true,
    width: width,
    height: height,
    useContentSize: true,
    alwaysOnTop: true,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: config.isDarkMode ? 'rgba(0, 0, 0, 0)' : 'rgba(255, 255, 255, 0)',
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: "./fast_window_preload.js",
      devTools: utools.isDev()
    }
  };

  const entryPath = "./fast_window/fast_input.html";

  const fastWindow = utools.createBrowserWindow(
    entryPath,
    windowOptions,
    () => {
      fastWindowRef = fastWindow; // 赋值引用
      windowMap.set(senderId, fastWindow);

      // 发送初始化配置
      fastWindow.webContents.send(channel, msg);

      // 3. 【同步】发送缓冲区中已积压的数据
      if (streamBuffer.length > 0) {
        streamBuffer.forEach(item => {
          fastWindow.webContents.send('stream-update', item);
        });
        streamBuffer.length = 0; // 清空
      }

      // 计时结束
      if (utools.isDev()) {
        const windowShownTime = performance.now();
        console.log(`[Timer Checkpoint] utools.createBrowserWindow callback executed. Elapsed: ${(windowShownTime - startTime).toFixed(2)} ms`);
      }
    }
  );
  if (utools.isDev()) {// 调试用
    fastWindow.webContents.openDevTools({ mode: "detach" });
  }
}

module.exports = {
  getConfig,
  checkConfig,
  updateConfig,
  saveSetting,
  updateConfigWithoutFeatures,
  savePromptWindowSettings,
  getUser,
  copyText,
  sethotkey,
  openWindow,
  coderedirect,
  setZoomFactor,
  feature_suffix,
  defaultConfig,
  windowMap,
  saveFastInputWindowPosition,
  openFastInputWindow,
};