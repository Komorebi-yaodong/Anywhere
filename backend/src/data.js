const { webFrame, nativeImage } = require('electron');
const crypto = require('crypto');
const windowMap = new Map();
const feature_suffix = "anywhere助手^_^"

const {
  requestTextOpenAI
} = require('./input.js');
const { 
  getBuiltinServers
} = require('./mcp_builtin.js');

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
    providerFolders: {},
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
        defaultSkills: [],
        window_width: 580,
        window_height: 740,
        position_x: 0,
        position_y: 0,
        autoCloseOnBlur: true,
        isAlwaysOnTop: true,
        autoSaveChat: false,
      },
    },
    fastWindowPosition: { x: 0, y: 0 },
    mcpServers: {},
    skillPath: "",
    language: "zh",
    tags: {},
    skipLineBreak: false,
    CtrlEnterToSend: false,
    showNotification: true,
    isDarkMode: false,
    fix_position: false,
    isAlwaysOnTop_global: true,
    autoCloseOnBlur_global: true,
    autoSaveChat_global: false,
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

function getLocalConfigId() {
  return 'config_local_' + utools.getNativeId();
}

/**
 * 拆分完整的 config 对象以便于分块存储
 * 增加了 localConfigPart 用于存储设备特定的路径配置
 */
function splitConfigForStorage(fullConfig) {
  // 深拷贝一份以避免修改原对象影响后续逻辑
  const configCopy = JSON.parse(JSON.stringify(fullConfig));
  
  const { prompts, providers, mcpServers, ...restOfConfig } = configCopy;

  // 提取本地配置
  const localConfigPart = {
    skillPath: restOfConfig.skillPath || "",
    localChatPath: restOfConfig.webdav?.localChatPath || ""
  };

  // 从共享配置中移除本地特定的字段，防止污染云端同步
  delete restOfConfig.skillPath;
  if (restOfConfig.webdav) {
    delete restOfConfig.webdav.localChatPath;
  }

  return {
    baseConfigPart: { config: restOfConfig },
    promptsPart: prompts,
    providersPart: providers,
    mcpServersPart: mcpServers,
    localConfigPart: localConfigPart // 新增返回部分
  };
}

/**
 * [已重构] 拆分完整的 config 对象以便于分块存储
 * @param {object} fullConfig - 包含 prompts 和 providers 的完整 config 对象
 * @returns {{baseConfigPart: object, promptsPart: object, providersPart: object, mcpServersPart: object}} - 拆分后的四部分
 */
function splitConfigForStorage(fullConfig) {
  // 1. 安全检查：如果传入为空，使用空对象防止崩溃
  const source = fullConfig || {};
  
  // 2. 深拷贝
  const configCopy = JSON.parse(JSON.stringify(source));
  
  const { prompts, providers, mcpServers, ...restOfConfig } = configCopy;

  // 3. 提取本地配置 (增加安全访问)
  const localConfigPart = {
    skillPath: restOfConfig.skillPath || "",
    localChatPath: (restOfConfig.webdav && restOfConfig.webdav.localChatPath) || ""
  };

  // 4. 从共享配置中移除本地字段
  delete restOfConfig.skillPath;
  if (restOfConfig.webdav) {
    delete restOfConfig.webdav.localChatPath;
  }

  return {
    baseConfigPart: { config: restOfConfig },
    promptsPart: prompts,
    providersPart: providers,
    mcpServersPart: mcpServers,
    localConfigPart: localConfigPart
  };
}

/**
 * 从数据库异步读取配置，合并分块数据
 */
async function getConfig() {
  let configDoc = await utools.db.promises.get("config");
  const localId = getLocalConfigId();
  let localDoc = await utools.db.promises.get(localId);

  // --- 1. 新用户初始化 ---
  if (!configDoc) {
    const { baseConfigPart, promptsPart, providersPart, mcpServersPart, localConfigPart } = splitConfigForStorage(defaultConfig.config);
    await utools.db.promises.put({ _id: "config", data: baseConfigPart });
    await utools.db.promises.put({ _id: "prompts", data: promptsPart });
    await utools.db.promises.put({ _id: "providers", data: providersPart });
    await utools.db.promises.put({ _id: "mcpServers", data: mcpServersPart });
    await utools.db.promises.put({ _id: localId, data: localConfigPart });
    return defaultConfig;
  }

  // --- 2. 旧版本数据自动迁移 ---
  if (configDoc.data && configDoc.data.config && configDoc.data.config.prompts) {
    console.warn("Anywhere: Old configuration format detected. Starting migration.");
    const oldFullConfig = configDoc.data.config;
    const { baseConfigPart, promptsPart, providersPart, mcpServersPart, localConfigPart } = splitConfigForStorage(oldFullConfig);

    await utools.db.promises.put({ _id: "prompts", data: promptsPart });
    await utools.db.promises.put({ _id: "providers", data: providersPart });
    await utools.db.promises.put({ _id: "mcpServers", data: mcpServersPart });
    await utools.db.promises.put({ _id: localId, data: localConfigPart });

    await utools.db.promises.put({
      _id: "config",
      data: baseConfigPart,
      _rev: configDoc._rev
    });
    
    configDoc = await utools.db.promises.get("config");
    localDoc = await utools.db.promises.get(localId);
  }

  // --- 3. 中间版本迁移：检查共享配置中是否残留了本地路径 ---
  let baseConfig = (configDoc.data && configDoc.data.config) ? configDoc.data.config : null;
  
  if (baseConfig) {
      // 关键修复：确保 localData 始终是一个对象，即使 localDoc.data 缺失
      let localData = (localDoc && localDoc.data) ? localDoc.data : { skillPath: "", localChatPath: "" };
      let needSaveShared = false;
      let needSaveLocal = false;

      // 检查 skillPath
      if (baseConfig.skillPath !== undefined) {
        if (!localData.skillPath) {
          localData.skillPath = baseConfig.skillPath;
          needSaveLocal = true;
        }
        delete baseConfig.skillPath;
        needSaveShared = true;
      }

      // 检查 webdav.localChatPath
      if (baseConfig.webdav && baseConfig.webdav.localChatPath !== undefined) {
        if (!localData.localChatPath) {
          localData.localChatPath = baseConfig.webdav.localChatPath;
          needSaveLocal = true;
        }
        delete baseConfig.webdav.localChatPath;
        needSaveShared = true;
      }

      if (needSaveShared) {
        await utools.db.promises.put({
          _id: "config",
          data: configDoc.data, 
          _rev: configDoc._rev
        });
        configDoc = await utools.db.promises.get("config");
      }

      if (needSaveLocal) {
        await utools.db.promises.put({
          _id: localId,
          data: localData,
          _rev: localDoc ? localDoc._rev : undefined
        });
        localDoc = await utools.db.promises.get(localId);
      }
  }

  // --- 4. 合并数据 ---
  const fullConfigData = configDoc.data || { config: {} };
  if (!fullConfigData.config) fullConfigData.config = {};

  const [promptsDoc, providersDoc, mcpServersDoc] = await Promise.all([
    utools.db.promises.get("prompts"),
    utools.db.promises.get("providers"),
    utools.db.promises.get("mcpServers")
  ]);

  fullConfigData.config.prompts = promptsDoc ? promptsDoc.data : defaultConfig.config.prompts;
  fullConfigData.config.providers = providersDoc ? providersDoc.data : defaultConfig.config.providers;
  
  // 注入本地路径 (再次确保安全性)
  const currentLocalData = (localDoc && localDoc.data) ? localDoc.data : {};
  fullConfigData.config.skillPath = currentLocalData.skillPath || "";
  
  if (!fullConfigData.config.webdav) fullConfigData.config.webdav = {};
  fullConfigData.config.webdav.localChatPath = currentLocalData.localChatPath || "";

  // 合并 MCP
  const userMcpServers = mcpServersDoc ? mcpServersDoc.data : (defaultConfig.config.mcpServers || {});
  const builtinServers = getBuiltinServers();
  const mergedMcpServers = { ...userMcpServers };
  for (const [id, server] of Object.entries(builtinServers)) {
      if (mergedMcpServers[id]) {
          mergedMcpServers[id] = { 
              ...server, 
              isActive: mergedMcpServers[id].isActive,
              isPersistent: mergedMcpServers[id].isPersistent
          };
      } else {
          mergedMcpServers[id] = server;
      }
  }
  fullConfigData.config.mcpServers = mergedMcpServers;

  return fullConfigData;
}

function checkConfig(config) {
  let flag = false;
  const CURRENT_VERSION = "1.11.17";

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
    autoSaveChat_global: false,
    CtrlEnterToSend: false,
    showNotification: false,
    fix_position: false,
    zoom: 1,
    language: "zh",
    providerFolders: {},
    mcpServers: {},
    tags: {},
    isDarkMode: false,
    themeMode: "system",
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

  if (config.skillPath === undefined) {
      config.skillPath = "";
      flag = true;
  }

  // --- 4. Prompts (快捷助手) 检查 ---
  if (config.prompts) {
    const promptDefaults = {
      enable: true, stream: true, showMode: 'window', type: "general",
      isTemperature: false, temperature: 0.7,
      isDirectSend_normal: true, isDirectSend_file: false, ifTextNecessary: false,
      voice: '', reasoning_effort: "default", defaultMcpServers: [], defaultSkills: [],
      window_width: 580, window_height: 740, position_x: 0, position_y: 0,
      isAlwaysOnTop: true, autoCloseOnBlur: true, matchRegex: "", icon: "",
      autoSaveChat: false
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
      if (prov.folderId === undefined) { prov.folderId = ""; flag = true; }
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
  // 1. 拦截本地特定的设置项
  if (keyPath === 'skillPath' || keyPath === 'webdav.localChatPath') {
    const localId = getLocalConfigId();
    let doc = await utools.db.promises.get(localId);
    if (!doc) {
      doc = { _id: localId, data: {} };
    }
    
    // 更新本地数据
    if (keyPath === 'skillPath') {
      doc.data.skillPath = value;
    } else if (keyPath === 'webdav.localChatPath') {
      doc.data.localChatPath = value;
    }

    const result = await utools.db.promises.put({
      _id: localId,
      data: doc.data,
      _rev: doc._rev
    });

    if (result.ok) {
      // 广播更新
      const fullConfig = await getConfig();
      for (const windowInstance of windowMap.values()) {
        if (!windowInstance.isDestroyed()) {
          windowInstance.webContents.send('config-updated', fullConfig.config);
        }
      }
      return { success: true };
    } else {
      console.error(`Failed to save local setting to "${localId}"`, result);
      return { success: false, message: result.message };
    }
  }

  const rootKey = keyPath.split('.')[0];
  let docId;
  let targetObjectKey;
  let targetPropKey;

  if (rootKey === 'prompts') {
    docId = 'prompts';
    const firstDotIndex = keyPath.indexOf('.');
    const lastDotIndex = keyPath.lastIndexOf('.');
    if (firstDotIndex === -1 || lastDotIndex === -1 || firstDotIndex === lastDotIndex) {
      return { success: false, message: `Invalid keyPath: ${keyPath}` };
    }
    targetObjectKey = keyPath.substring(firstDotIndex + 1, lastDotIndex);
    targetPropKey = keyPath.substring(lastDotIndex + 1);

  } else if (rootKey === 'providers') {
    docId = 'providers';
    const firstDotIndex = keyPath.indexOf('.');
    const lastDotIndex = keyPath.lastIndexOf('.');
    if (firstDotIndex !== -1 && lastDotIndex !== -1 && firstDotIndex !== lastDotIndex) {
      targetObjectKey = keyPath.substring(firstDotIndex + 1, lastDotIndex);
      targetPropKey = keyPath.substring(lastDotIndex + 1);
    } else {
      const parts = keyPath.split('.');
      targetObjectKey = parts[1];
      targetPropKey = parts[2];
    }
  } else if (rootKey === 'mcpServers') {
    docId = 'mcpServers';
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
    return { success: false, message: result.message };
  }
}

/**
 * 更新完整的配置，将其拆分并分别存储
 */
function updateConfigWithoutFeatures(newConfig) {
  const plainConfig = JSON.parse(JSON.stringify(newConfig.config));
  
  if (plainConfig.mcpServers) {
      const serverToSave = {};
      const builtinIds = Object.keys(getBuiltinServers());
      for (const [id, server] of Object.entries(plainConfig.mcpServers)) {
          if (server.type === 'builtin' || builtinIds.includes(id)) {
              serverToSave[id] = {
                  id: server.id, type: 'builtin', name: server.name,
                  isActive: server.isActive, isPersistent: server.isPersistent
              };
          } else {
              serverToSave[id] = server;
          }
      }
      plainConfig.mcpServers = serverToSave;
  }

  // 使用新的拆分逻辑，获取 localConfigPart
  const { baseConfigPart, promptsPart, providersPart, mcpServersPart, localConfigPart } = splitConfigForStorage(plainConfig);

  // 1. 更新基础配置 (config) - 此时已移除 path
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

  // 5. 更新本地特定配置
  const localId = getLocalConfigId();
  let localDoc = utools.db.get(localId);
  utools.db.put({
    _id: localId,
    data: localConfigPart,
    _rev: localDoc ? localDoc._rev : undefined
  });

  // 6. 广播配置更新
  const fullConfigForFrontend = JSON.parse(JSON.stringify(newConfig.config));
  for (const windowInstance of windowMap.values()) {
    if (!windowInstance.isDestroyed()) {
      windowInstance.webContents.send('config-updated', fullConfigForFrontend);
    }
  }

  cleanUpBackgroundCache(newConfig);
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
        expectedMatchFeature.cmds.push({ type: "files", label: key, fileType: "file", match: "/\\.(png|jpeg|jpg|webp|docx|xlsx|xls|csv|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue|tex|latex|bib|sty|yaml|yml|ini|bat|log|toml)$/i" });
      } else if (prompt.type === "files") {
        expectedMatchFeature.cmds.push({ type: "files", label: key, fileType: "file", match: "/\\.(png|jpeg|jpg|webp|docx|xlsx|xls|csv|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue|tex|latex|bib|sty|yaml|yml|ini|bat|log|toml)$/i" });
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
    displayBounds = utools.getDisplayNearestPoint({ "x": x, "y": y }).bounds;
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
    hasShadow: true,
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

/**
 * 计算 URL 的 MD5 Hash 作为 ID
 */
function getUrlHash(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

/**
 * 获取缓存的背景图片（包含旧数据自动压缩迁移逻辑）
 * @param {string} url 图片原始 URL
 * @returns {Promise<Uint8Array|null>} 返回图片的 Buffer 数据或 null
 */
async function getCachedBackgroundImage(url) {
  if (!url) return null;
  const hash = getUrlHash(url);

  // 1. 检查映射是否存在
  const cacheDoc = await utools.db.promises.get("background_cache");
  if (!cacheDoc || !cacheDoc.data || !cacheDoc.data[hash]) {
    return null;
  }

  const attachmentId = cacheDoc.data[hash];

  // 2. 获取附件
  let buffer = await utools.db.promises.getAttachment(attachmentId);
  if (!buffer) return null;

  if (buffer.length > 500 * 1024) {
    // console.log(`[Cache] Image is too large (${(buffer.length/1024/1024).toFixed(2)}MB), compressing...`);
    try {
      const image = nativeImage.createFromBuffer(buffer);
      if (!image.isEmpty()) {
        const size = image.getSize();
        // 策略：宽度限制 1920，JPEG 质量 75
        if (size.width > 1920) {
          const newHeight = Math.floor(size.height * (1920 / size.width));
          const resizedImage = image.resize({ width: 1920, height: newHeight, quality: 'better' });
          buffer = resizedImage.toJPEG(75);
        } else {
          buffer = image.toJPEG(75);
        }

        (async () => {
          try {
            // uTools 的 attachment 文档无法直接更新内容，需要删除重建
            // 1. 删除旧文档
            await utools.db.promises.remove(attachmentId);
            // 2. 写入新文档 (ID不变)
            await utools.db.promises.postAttachment(attachmentId, buffer, "image/jpeg");
            // console.log(`[Cache] Migrated/Compressed image: ${attachmentId}`);
          } catch (dbErr) {
            console.error("[Cache] Failed to update compressed image to DB:", dbErr);
          }
        })();
      }
    } catch (err) {
      console.warn("[Cache] Failed to compress legacy image, returning original:", err);
    }
  }

  return buffer;
}

/**
 * 缓存背景图片（增加压缩逻辑）
 * @param {string} url 图片原始 URL
 */
async function cacheBackgroundImage(url) {
  if (!url || url.startsWith('data:') || url.startsWith('file:')) return;

  const hash = getUrlHash(url);
  const attachmentId = `bg-${hash}`;

  try {
    // 1. 检查是否已缓存
    let cacheDoc = await utools.db.promises.get("background_cache");
    if (!cacheDoc) {
      cacheDoc = { _id: "background_cache", data: {} };
      await utools.db.promises.put(cacheDoc);
      cacheDoc = await utools.db.promises.get("background_cache");
    }

    if (cacheDoc.data[hash]) {
      const existingBuf = await utools.db.promises.getAttachment(cacheDoc.data[hash]);
      if (existingBuf) return;
    }

    // 2. 下载图片
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    // 3. 图片压缩处理
    try {
      const image = nativeImage.createFromBuffer(buffer);
      if (!image.isEmpty()) {
        const size = image.getSize();
        // 如果宽度大于 1920，等比缩放
        if (size.width > 1920) {
          const newHeight = Math.floor(size.height * (1920 / size.width));
          const resizedImage = image.resize({ width: 1920, height: newHeight, quality: 'better' });
          // 转为 JPEG，质量 75，通常能将大图压到几百KB
          buffer = resizedImage.toJPEG(75);
        } else {
          // 即使尺寸不大，也转为 JPEG 75 压缩体积
          buffer = image.toJPEG(75);
        }
      }
    } catch (compressErr) {
      console.warn("[Cache] Image compression failed, using original buffer:", compressErr);
    }

    // 4. 存储附件 (限制 10MB -> 压缩后通常远小于此)
    if (buffer.length > 10 * 1024 * 1024) {
      console.warn("Background image too large (>10MB):", url);
      return;
    }

    // 统一存储为 image/jpeg 类型
    const attachResult = await utools.db.promises.postAttachment(attachmentId, buffer, "image/jpeg");

    if (attachResult.ok) {
      // 5. 更新映射文档
      cacheDoc = await utools.db.promises.get("background_cache");
      cacheDoc.data[hash] = attachmentId;
      await utools.db.promises.put({
        _id: "background_cache",
        data: cacheDoc.data,
        _rev: cacheDoc._rev
      });
    }
  } catch (error) {
    console.error(`[Cache] Error caching background ${url}:`, error);
  }
}

/**
 * 清理未使用的背景图片缓存
 * @param {object} fullConfig 当前的完整配置对象
 */
async function cleanUpBackgroundCache(fullConfig) {
  try {
    const prompts = fullConfig.config.prompts || {};
    // 1. 收集所有正在使用的 URL Hash
    const activeHashes = new Set();
    Object.values(prompts).forEach(p => {
      if (p.backgroundImage && !p.backgroundImage.startsWith('data:')) {
        activeHashes.add(getUrlHash(p.backgroundImage));
      }
    });

    // 2. 获取缓存记录
    const cacheDoc = await utools.db.promises.get("background_cache");
    if (!cacheDoc || !cacheDoc.data) return;

    const cacheData = cacheDoc.data;
    let hasChanges = false;

    // 3. 遍历缓存，删除未使用的
    for (const [hash, attachmentId] of Object.entries(cacheData)) {
      if (!activeHashes.has(hash)) {
        // 删除附件
        try {
          const removeResult = await utools.db.promises.remove(attachmentId);
          if (removeResult.ok || removeResult.error) { // 即使附件不存在(error)也应该删除映射
            delete cacheData[hash];
            hasChanges = true;
            // console.log(`[Cache] Removed unused background cache: ${attachmentId}`);
          }
        } catch (e) {
          // 附件可能已经不存在了，直接删除映射
          delete cacheData[hash];
          hasChanges = true;
        }
      }
    }

    // 4. 更新映射文档
    if (hasChanges) {
      await utools.db.promises.put({
        _id: "background_cache",
        data: cacheData,
        _rev: cacheDoc._rev
      });
    }
  } catch (error) {
    console.error("[Cache] Cleanup failed:", error);
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
  saveMcpToolCache,
  getMcpToolCache,
  getCachedBackgroundImage,
  cacheBackgroundImage,
};