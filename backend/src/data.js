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
      // console.log("Anywhere: Migration successful. Old config cleaned.");
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
  const CURRENT_VERSION = "1.9.13";

  // --- 1. 版本检查与旧数据迁移 ---
  if (config.version !== CURRENT_VERSION) {
    config.version = CURRENT_VERSION;
    flag = true;
  }

  // 迁移旧的 apiUrl 配置到 providers
  if (config.apiUrl) {
    config.providers = config.providers || {};
    config.providerOrder = config.providerOrder || [];
    config.providers["0"] = {
      name: "default",
      url: config.apiUrl,
      api_key: config.apiKey,
      modelList: [config.modelSelect, ...(config.ModelsListByUser || [])].filter(Boolean),
      enable: true,
    };
    // 标记旧字段待删除
    config.activeProviderId = undefined; // 触发后续清理
    config.providerOrder.unshift("0");
    flag = true;
  }

  // --- 2. 根目录字段清洗 (使用列表驱动) ---
  // 需要删除的废弃字段
  const obsoleteKeys = [
    'window_width', 'window_height', 'stream', 'autoCloseOnBlur', 'isAlwaysOnTop', 
    'inputLayout', 'tool_list', 'promptOrder', 'ModelsListByUser', 
    'apiUrl', 'apiKey', 'modelList', 'modelSelect', 'activeProviderId'
  ];
  obsoleteKeys.forEach(key => {
    if (config[key] !== undefined) { delete config[key]; flag = true; }
  });

  // 需要补全的默认值
  const rootDefaults = {
    isAlwaysOnTop_global: true,
    autoCloseOnBlur_global: true,
    CtrlEnterToSend: false,
    showNotification: false,
    fix_position: false,
    zoom: 1,
    language: "zh",
    mcpServers: {},
    tags: {},
    isDarkMode: false,
    fastWindowPosition: null,
    // 直接引用 defaultConfig 中的完整列表，避免代码冗长
    voiceList: defaultConfig.config.voiceList || [] 
  };

  for (const [key, val] of Object.entries(rootDefaults)) {
    if (config[key] === undefined) { config[key] = val; flag = true; }
  }

  // --- 3. WebDAV 检查 ---
  if (!config.webdav) {
    config.webdav = { url: "", username: "", password: "", path: "/anywhere", data_path: "/anywhere_data", localChatPath: "" };
    flag = true;
  } else {
    if (config.webdav.dataPath) { // 迁移旧字段
      config.webdav.data_path = config.webdav.data_path || config.webdav.dataPath;
      delete config.webdav.dataPath;
      flag = true;
    }
    const webdavDefaults = { data_path: "/anywhere_data", localChatPath: "" };
    for (const [k, v] of Object.entries(webdavDefaults)) {
      if (config.webdav[k] === undefined) { config.webdav[k] = v; flag = true; }
    }
  }

  // --- 4. Prompts (快捷助手) 检查 ---
  if (config.prompts) {
    const promptDefaults = {
      enable: true, stream: true, showMode: 'window', type: "general",
      isTemperature: false, temperature: 0.7,
      isDirectSend_normal: true, isDirectSend_file: false, ifTextNecessary: false,
      voice: '', reasoning_effort: "default", defaultMcpServers: [],
      window_width: 580, window_height: 740, position_x: 0, position_y: 0,
      isAlwaysOnTop: true, autoCloseOnBlur: true, matchRegex: "", icon: ""
    };

    for (const key of Object.keys(config.prompts)) {
      const p = config.prompts[key];

      // 4.1 结构有效性检查 (你要求的逻辑)
      if (!p || typeof p !== 'object' || '0' in p || !p.type || p.prompt === undefined || p.model === undefined) {
        delete config.prompts[key];
        flag = true;
        continue;
      }

      // 4.2 字段迁移与清理
      if (['input', 'clipboard'].includes(p.showMode)) { p.showMode = 'fastinput'; flag = true; }
      if (p.isDirectSend !== undefined) {
        if (p.isDirectSend_file === undefined) p.isDirectSend_file = p.isDirectSend;
        delete p.isDirectSend;
        flag = true;
      }
      if (p.idex !== undefined) { delete p.idex; flag = true; }

      // 4.3 默认值补全
      for (const [pk, pv] of Object.entries(promptDefaults)) {
        if (p[pk] === undefined) { p[pk] = pv; flag = true; }
      }
      if (p.voice === null) { p.voice = ''; flag = true; }

      // 4.4 模型自动修复
      let hasValidModel = p.model && config.providers && config.providers[p.model.split("|")[0]];
      if (!hasValidModel) {
        // 尝试指向第一个可用模型
        const firstProvId = config.providerOrder?.[0];
        const firstModel = config.providers?.[firstProvId]?.modelList?.[0];
        p.model = (firstProvId && firstModel) ? `${firstProvId}|${firstModel}` : "";
        flag = true;
      }
    }
  }

  // --- 5. Providers & Order 检查 ---
  if (config.providers) {
    for (const key in config.providers) {
      const prov = config.providers[key];
      if (prov.modelSelect !== undefined) { delete prov.modelSelect; flag = true; }
      if (prov.modelListByUser !== undefined) { delete prov.modelListByUser; flag = true; }
      if (prov.enable === undefined) { prov.enable = true; flag = true; }
    }
  }

  // 修复 ProviderOrder
  if (!Array.isArray(config.providerOrder) || config.providerOrder.length === 0) {
    config.providerOrder = Object.keys(config.providers || {});
    flag = true;
  } else {
    // 过滤不存在的 ID 并确保是字符串
    const validOrder = config.providerOrder
      .map(String)
      .filter(id => config.providers && config.providers[id]);
    
    if (validOrder.length !== config.providerOrder.length) {
      config.providerOrder = validOrder;
      flag = true;
    }
  }

  if (flag) {
    updateConfig({ "config": config });
  }
}

/**
 * 保存单个设置项，自动判断应写入哪个文档
 * 优化路径解析逻辑，防止键名中包含点号(.)导致路径层级错误
 * @param {string} keyPath - 属性路径
 * @param {*} value - 要设置的值
 * @returns {{success: boolean, message?: string}}
 */
async function saveSetting(keyPath, value) {
  const rootKey = keyPath.split('.')[0];
  let docId;
  let targetObjectKey; // 二级键名 (如 promptKey 或 serverId)
  let targetPropKey;   // 属性名 (如 model, enable)
  
  if (rootKey === 'prompts') {
    docId = 'prompts';
    // 逻辑：keyPath 格式为 "prompts.{promptKey}.{property}"
    // 我们需要提取中间的 promptKey，它可能包含点号
    const firstDotIndex = keyPath.indexOf('.');
    const lastDotIndex = keyPath.lastIndexOf('.');
    
    if (firstDotIndex === -1 || lastDotIndex === -1 || firstDotIndex === lastDotIndex) {
       console.error(`Invalid keyPath for prompts: ${keyPath}`);
       return { success: false, message: `Invalid keyPath: ${keyPath}` };
    }

    targetObjectKey = keyPath.substring(firstDotIndex + 1, lastDotIndex);
    targetPropKey = keyPath.substring(lastDotIndex + 1);

  } else if (rootKey === 'providers') {
    docId = 'providers';
    // providers 的 id 通常是时间戳，不含点号，但为了保险也用同样逻辑
    const firstDotIndex = keyPath.indexOf('.');
    const lastDotIndex = keyPath.lastIndexOf('.');
    if (firstDotIndex !== -1 && lastDotIndex !== -1 && firstDotIndex !== lastDotIndex) {
        targetObjectKey = keyPath.substring(firstDotIndex + 1, lastDotIndex);
        targetPropKey = keyPath.substring(lastDotIndex + 1);
    } else {
        // Fallback for simple paths
        const parts = keyPath.split('.');
        targetObjectKey = parts[1];
        targetPropKey = parts[2];
    }
  } else if (rootKey === 'mcpServers') {
    docId = 'mcpServers';
    // MCP server id 可能包含点号
    const firstDotIndex = keyPath.indexOf('.');
    const lastDotIndex = keyPath.lastIndexOf('.');
    
    if (firstDotIndex !== -1 && lastDotIndex !== -1 && firstDotIndex !== lastDotIndex) {
        targetObjectKey = keyPath.substring(firstDotIndex + 1, lastDotIndex);
        targetPropKey = keyPath.substring(lastDotIndex + 1);
    } else {
         return { success: false, message: `Invalid keyPath for mcpServers: ${keyPath}` };
    }
  } else {
    docId = 'config';
  }

  const doc = await utools.db.promises.get(docId);
  if (!doc) {
    console.error(`Config document "${docId}" not found, cannot save setting.`);
    return { success: false, message: `Config document "${docId}" not found` };
  }

  let dataToUpdate = (docId === 'config') ? doc.data.config : doc.data;

  if (docId === 'config') {
      const pathParts = keyPath.split('.');
      let current = dataToUpdate;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (current[part] === undefined || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part];
      }
      current[pathParts[pathParts.length - 1]] = value;

  } else {
      if (!dataToUpdate[targetObjectKey]) {
          dataToUpdate[targetObjectKey] = {};
      }
      dataToUpdate[targetObjectKey][targetPropKey] = value;
  }

  const result = await utools.db.promises.put({
    _id: docId,
    data: doc.data,
    _rev: doc._rev
  });

  if (result.ok) {
    const fullConfig = await getConfig();
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
  const OVERFLOW_ALLOWANCE = 10; 

  // 强制转换为 Number，防止 undefined 或 null 导致 NaN
  let width = Number(promptConfig?.window_width) || 580;
  let height = Number(promptConfig?.window_height) || 740;
  let windowX = 0, windowY = 0;

  const primaryDisplay = utools.getPrimaryDisplay();
  let currentDisplay;

  const hasFixedPosition = config.fix_position && promptConfig && promptConfig.position_x != null && promptConfig.position_y != null;

  if (hasFixedPosition) {
    let set_position = { x: Number(promptConfig.position_x), y: Number(promptConfig.position_y) };
    currentDisplay = utools.getDisplayNearestPoint(set_position) || primaryDisplay;
    windowX = Math.floor(set_position.x);
    windowY = Math.floor(set_position.y);
  } else {
    const mouse_position = utools.getCursorScreenPoint();
    currentDisplay = utools.getDisplayNearestPoint(mouse_position) || primaryDisplay;
    windowX = Math.floor(mouse_position.x - (width / 2));
    windowY = Math.floor(mouse_position.y);
  }

  if (currentDisplay) {
    const display = currentDisplay.bounds;

    if (width > display.width) {
      width = display.width;
    }
    if (height > display.height) {
      height = display.height;
    }

    const minX = display.x - OVERFLOW_ALLOWANCE;
    const maxX = display.x + display.width - width + OVERFLOW_ALLOWANCE;
    const minY = display.y - OVERFLOW_ALLOWANCE;
    const maxY = display.y + display.height - height + OVERFLOW_ALLOWANCE;

    if (
      (windowX + width < display.x) || (windowX > display.x + display.width) ||
      (windowY + height < display.y) || (windowY > display.y + display.height)
    ) {
      windowX = display.x + (display.width - width) / 2;
      windowY = display.y + (display.height - height) / 2;
    } else {
      if (windowX < minX) windowX = minX;
      if (windowX > maxX) windowX = maxX;
      if (windowY < minY) windowY = minY;
      if (windowY > maxY) windowY = maxY;
    }
  }

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

/**
 * 保存 MCP 工具列表到缓存文档
 * @param {string} serverId - 服务器 ID
 * @param {Array} tools - 工具列表
 */
async function saveMcpToolCache(serverId, tools) {
  let doc = await utools.db.promises.get("mcp_tools_cache");
  if (!doc) {
    doc = { _id: "mcp_tools_cache", data: {} };
  }
  doc.data[serverId] = tools;
  return await utools.db.promises.put({
    _id: "mcp_tools_cache",
    data: doc.data,
    _rev: doc._rev
  });
}

/**
 * 获取所有 MCP 工具缓存
 */
async function getMcpToolCache() {
  const doc = await utools.db.promises.get("mcp_tools_cache");
  return doc ? doc.data : {};
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
  saveMcpToolCache,
  getMcpToolCache,
};