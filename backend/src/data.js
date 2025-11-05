const webFrame = require('electron').webFrame;

const feature_suffix = "anywhere助手^_^"

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
        window_width: 540,
        window_height: 700,
        position_x: 0,
        position_y: 0,
        autoCloseOnBlur: true,
        isAlwaysOnTop: true,
      },
    },
    mcpServers: {},
    language:"zh",
    tags: {},
    skipLineBreak: false,
    CtrlEnterToSend: false,
    showNotification: true,
    isDarkMode: false,
    fix_position: false,
    isAlwaysOnTop_global: true,
    autoCloseOnBlur_global: true,
    zoom:1,
    webdav: {
      url: "",
      username: "",
      password: "",
      path: "/anywhere",
      dataPath: "/anywhere_data",
      localChatPath: ""
    },
    voiceList:[
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
    console.log("Anywhere: Initializing configuration for a new user.");
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

  const promptsDoc = await utools.db.promises.get("prompts");
  fullConfigData.config.prompts = promptsDoc ? promptsDoc.data : defaultConfig.config.prompts;

  const providersDoc = await utools.db.promises.get("providers");
  fullConfigData.config.providers = providersDoc ? providersDoc.data : defaultConfig.config.providers;
  
  const mcpServersDoc = await utools.db.promises.get("mcpServers");
  fullConfigData.config.mcpServers = mcpServersDoc ? mcpServersDoc.data : defaultConfig.config.mcpServers || {};
  
  return fullConfigData;
}


function checkConfig(config) {
  let flag = false;
  if (config.version !== "1.7.3") {
    config.version = "1.7.3";
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
      dataPath: "/anywhere_data",
    };
    flag = true;
  }
  if (config.webdav.dataPath == undefined) {
    config.webdav.dataPath = "/anywhere_data";
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
      config.prompts[key].window_width = 540;
      flag = true;
    }
    if (config.prompts[key].window_height === undefined) {
      config.prompts[key].window_height = 700;
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
      if (config.prompts[key].isDirectSend === undefined){
        config.prompts[key].isDirectSend_file = false;
      }else{
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
 * [已重构] 保存单个设置项，自动判断应写入哪个文档
 * @param {string} keyPath - 属性路径，如 "prompts.AI.enable" 或 "isDarkMode"
 * @param {*} value - 要设置的值
 * @returns {{success: boolean, message?: string}} - 返回操作结果
 */
function saveSetting(keyPath, value) {
  const rootKey = keyPath.split('.')[0];
  let docId;
  let targetKeyPath = keyPath;
  let isBaseConfig = false;

  // 根据 keyPath 的第一部分确定目标文档
  if (rootKey === 'prompts') {
    docId = 'prompts';
    targetKeyPath = keyPath.substring('prompts.'.length); // 移除 "prompts." 前缀
  } else if (rootKey === 'providers') {
    docId = 'providers';
    targetKeyPath = keyPath.substring('providers.'.length); // 移除 "providers." 前缀
  } else if (rootKey === 'mcpServers') {
    docId = 'mcpServers';
    targetKeyPath = keyPath.substring('mcpServers.'.length);
  } else {
    docId = 'config';
    isBaseConfig = true; // 目标是基础配置
  }

  const doc = utools.db.get(docId);
  if (!doc) {
    console.error(`Config document "${docId}" not found, cannot save setting.`);
    return { success: false, message: `Config document "${docId}" not found` };
  }

  // 获取要更新的数据部分
  let dataToUpdate = doc.data;
  // 基础配置有额外的 .config 层级
  if (isBaseConfig) {
    dataToUpdate = dataToUpdate.config;
  }
  
  // 使用路径字符串来设置嵌套属性
  const keys = targetKeyPath.split('.');
  let current = dataToUpdate;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {}; // 如果路径不存在，则创建它
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;

  // 准备最终要写入的数据
  const finalData = isBaseConfig ? { config: dataToUpdate } : dataToUpdate;
  
  // 将更新后的数据写回对应的数据库文档
  const result = utools.db.put({
    _id: docId,
    data: finalData,
    _rev: doc._rev
  });

  if (result.ok) {
    return { success: true };
  } else {
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
          expectedMatchFeature.cmds.push({ type: "over", label: key, "maxLength": 99999999999999999999999999999999999999 });
          expectedMatchFeature.cmds.push({ type: "img", label: key });
          expectedMatchFeature.cmds.push({ type: "files", label: key, fileType: "file", match: prompt.showMode === "window" ? "/\\.(png|jpeg|jpg|webp|docx|xlsx|xls|csv|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|csv|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue)$/i" : "/\\.(png|jpeg|jpg|webp|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|csv|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue)$/i" });
      } else if (prompt.type === "files") {
          expectedMatchFeature.cmds.push({ type: "files", label: key, fileType: "file", match: prompt.showMode === "window" ? "/\\.(png|jpeg|jpg|webp|docx|xlsx|xls|csv|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|csv|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue)$/i" : "/\\.(png|jpeg|jpg|webp|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|csv|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue)$/i" });
      } else if (prompt.type === "img") {
          expectedMatchFeature.cmds.push({ type: "img", label: key });
      } else if (prompt.type === "over") {
          expectedMatchFeature.cmds.push({ type: "over", label: key, "maxLength": 99999999999999999999999999999999999999 });
      }
      utools.setFeature(expectedMatchFeature);

      // 更新或添加功能指令（仅限窗口模式）
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
        (currentPrompts[promptKey] && currentPrompts[promptKey].showMode !== "window" && code.endsWith(feature_suffix))
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
    const width = promptConfig?.window_width || 540;
    const height = promptConfig?.window_height || 700;
    
    let windowX = 0, windowY = 0;
    
    if (config.fix_position && promptConfig && promptConfig.position_x && promptConfig.position_y) {
        let set_position = {
            x: promptConfig.position_x,
            y: promptConfig.position_y
        };

        const displays = utools.getAllDisplays();
        const primaryDisplay = utools.getPrimaryDisplay();
        const currentDisplay = displays.find(display =>
            set_position.x >= display.bounds.x &&
            set_position.x < display.bounds.x + display.bounds.width &&
            set_position.y >= display.bounds.y &&
            set_position.y < display.bounds.y + display.bounds.height
        ) || primaryDisplay;

        windowX = Math.floor(set_position.x);
        windowY = Math.floor(set_position.y);

        if (currentDisplay) {
            windowX = Math.max(windowX, currentDisplay.bounds.x);
            windowX = Math.min(windowX, currentDisplay.bounds.x + currentDisplay.bounds.width - width);
            windowY = Math.max(windowY, currentDisplay.bounds.y);
            windowY = Math.min(windowY, currentDisplay.bounds.y + currentDisplay.bounds.height - height);
            if (windowY + height > currentDisplay.bounds.y + currentDisplay.bounds.height) {
                windowY = currentDisplay.bounds.y + currentDisplay.bounds.height - height;
            }
        }
    } else {
        const mouse_position = utools.getCursorScreenPoint();
        const displays = utools.getAllDisplays();
        const primaryDisplay = utools.getPrimaryDisplay();
        const currentDisplay = displays.find(display =>
            mouse_position.x >= display.bounds.x &&
            mouse_position.x < display.bounds.x + display.bounds.width &&
            mouse_position.y >= display.bounds.y &&
            mouse_position.y < display.bounds.y + display.bounds.height
        ) || primaryDisplay;

        windowX = Math.floor(mouse_position.x - (width / 2));
        windowY = Math.floor(mouse_position.y);

        if (currentDisplay) {
            windowX = Math.max(windowX, currentDisplay.bounds.x);
            windowX = Math.min(windowX, currentDisplay.bounds.x + currentDisplay.bounds.width - width);
            windowY = Math.max(windowY, currentDisplay.bounds.y);
            windowY = Math.min(windowY, currentDisplay.bounds.y + currentDisplay.bounds.height - height);
            if (windowY + height > currentDisplay.bounds.y + currentDisplay.bounds.height) {
                windowY = currentDisplay.bounds.y + currentDisplay.bounds.height - height;
            }
        }
    }
    return { x: windowX, y: windowY, width, height };
}

function getRandomItem(list) {
  // 检查list是不是字符串
  if (typeof list === "string") {
    // 如果字符串包含逗号
    if (list.includes(",")) {
      list = list.split(",");
      // 删除空白字符
      list = list.filter(item => item.trim() !== "");
    }
    else if (list.includes("，")) {
      list = list.split("，");
      // 删除空白字符
      list = list.filter(item => item.trim() !== "");
    }
    else {
      return list;
    }
  }

  if (list.length === 0) {
    return "";
  }
  else {
    const resault = list[Math.floor(Math.random() * list.length)];
    return resault;
  }
}

// 函数：请求chat
async function chatOpenAI(history, config, modelInfo, CODE, signal, selectedVoice = null, overrideReasoningEffort = null) {

  let apiUrl = "";
  let apiKey = "";
  let model = "";

  if (modelInfo.includes("|")) {
    const [providerId, modelName] = modelInfo.split("|");
    const provider = config.providers[providerId];
    if (provider) {
      apiUrl = provider.url;
      apiKey = provider.api_key;
      model = modelName;
    }
  }

  if (config.prompts[CODE] && config.prompts[CODE].ifTextNecessary) {
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let content = history[history.length - 1].content;
    // 如果是字符串
    if (typeof content === "string") {
      history[history.length - 1].content = timestamp + "\n\n" + content;
    }
    else if (Array.isArray(content)) {
      let flag = false;
      for (let i = 0; i < content.length; i++) {
        // 是文本类型，且不是文本文件
        if (content[i].type === "text" && content[i].text && !(content[i].text.toLowerCase().startsWith('file name:') && content[i].text.toLowerCase().endsWith('file end'))) {
          content[i].text = timestamp + "\n\n" + content[i].text;
          flag = true;
          break;
        }
      }
      if (!flag) {
        history[history.length - 1].content.push({
          type: "text",
          text: timestamp
        });
      }
    }
  }
  
  let payload = {
    model: model,
    messages: history,
  };

  if (selectedVoice && typeof selectedVoice === 'string') {
    // 强制非流式
    payload.stream = false;
    // 提取'-'之前的部分作为API调用的voice参数
    const voiceForAPI = selectedVoice.split('-')[0].trim();
    // 添加语音相关参数
    payload.modalities = ["text", "audio"];
    payload.audio = { voice: voiceForAPI, format: "wav" };
  } else {
    if (config.prompts[CODE] && typeof config.prompts[CODE].stream === 'boolean') {
      payload.stream = config.prompts[CODE].stream;
    } else {
        payload.stream = true; // 默认开启流式
    }
  }

  // 添加温度参数
  if (config.prompts[CODE] && config.prompts[CODE].isTemperature) {
    payload.temperature = config.prompts[CODE].temperature;
  }
  
  // 思考预算逻辑：优先使用覆盖值，否则使用配置值
  const reasoningEffort = overrideReasoningEffort;
  if (reasoningEffort && reasoningEffort !== 'default') {
    payload.reasoning_effort = reasoningEffort;
  }
  
  const response = await fetch(apiUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getRandomItem(apiKey)
    },
    body: JSON.stringify(payload),
    signal: signal // 将 signal 传递给 fetch
  });
  return response;
}

// utools 插件调用 copyText 函数
function copyText(content) {
  utools.copyText(content);
}

async function sethotkey(prompt_name,auto_copy){
  console.log("sethotkey")
  utools.redirectHotKeySetting(prompt_name,auto_copy);
}

async function openWindow(config, msg) {
  msg.config = config;

  const { x, y, width, height } = getPosition(config, msg.originalCode || msg.code);
  const promptCode = msg.originalCode || msg.code;
  const promptConfig = config.prompts[promptCode];
  const isAlwaysOnTop = promptConfig?.isAlwaysOnTop ?? true;
  let channel = "window";

  const backgroundColor = config.isDarkMode ? '#181818' : '#ffffff';
  console.log("backgroundColor", backgroundColor);
  const ubWindow = utools.createBrowserWindow(
    "./window/index.html",
    {
      show: false,
      backgroundColor: backgroundColor,
      title: "Anywhere",
      width: width,
      height: height,
      alwaysOnTop: isAlwaysOnTop,
      x: x,
      y: y,
      webPreferences: {
        preload: "./window_preload.js",
        devTools: true
      },
    },
    () => {
      ubWindow.webContents.send(channel, msg);
      ubWindow.show();
    }
  );
  ubWindow.webContents.openDevTools({ mode: "detach" });
}

async function coderedirect(label, payload) {
  utools.redirect(label, payload);
}

function setZoomFactor(factor){
    webFrame.setZoomFactor(factor);
}

/**
 * 保存单个快捷助手的窗口设置，直接操作 "prompts" 文档
 * @param {string} promptKey - 快捷助手的 key
 * @param {object} settings - 要保存的窗口设置
 * @returns {Promise<{success: boolean, message?: string}>}
 */
async function savePromptWindowSettings(promptKey, settings) {
    const promptsDoc = utools.db.get("prompts");
    if (!promptsDoc || !promptsDoc.data) {
        return { success: false, message: "Prompts document not found" };
    }

    const promptsData = promptsDoc.data;
    if (!promptsData[promptKey]) {
        return { success: false, message: "Prompt not found in document" };
    }
    
    // 更新指定快捷助手的设置
    promptsData[promptKey] = {
        ...promptsData[promptKey],
        ...settings
    };

    // 将更新后的整个 prompts 对象写回
    const result = utools.db.put({
        _id: "prompts",
        data: promptsData,
        _rev: promptsDoc._rev
    });

    if (result.ok) {
        return { success: true };
    } else {
        return { success: false, message: result.message };
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
  getPosition,
  getRandomItem,
  chatOpenAI,
  copyText,
  sethotkey,
  openWindow,
  coderedirect,
  setZoomFactor,
  feature_suffix,
  defaultConfig,
};