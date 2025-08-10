const webFrame = require('electron').webFrame;
const fs = require('fs/promises');
const path = require('path');

const feature_suffix = "anywhere助手^_^"

// 默认配置
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
        window_width: 540,
        window_height: 700,
        position_x: 0,
        position_y: 0,
        autoCloseOnBlur: true,
        isAlwaysOnTop: true,
      },
    },
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

// 读取配置文件，如果不存在则返回默认配置
function getConfig() {
  const configDoc = utools.db.get("config");
  if (configDoc) {
    return configDoc.data;
  } else {
    return defaultConfig;
  }
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

function saveSetting(keyPath, value) {
  const configDoc = utools.db.get("config");
  if (!configDoc || !configDoc.data || !configDoc.data.config) {
    console.error("Config not found, cannot save setting.");
    return { success: false, message: "Config not found" };
  }

  const config = configDoc.data.config;
  
  // 使用路径字符串来设置嵌套属性
  const keys = keyPath.split('.');
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {}; // 如果路径不存在，则创建它
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;

  // 将更新后的完整配置写回数据库
  const result = utools.db.put({
    _id: "config",
    data: { config },
    _rev: configDoc._rev
  });

  if (result.ok) {
    return { success: true };
  } else {
    return { success: false, message: result.message };
  }
}

function updateConfigWithoutFeatures(newConfig) {
  let configDoc = utools.db.get("config");
  if (configDoc) {
    configDoc.data = { ...configDoc.data, ...newConfig };
    return utools.db.put(configDoc);
  } else {
    return utools.db.put({
      _id: "config",
      data: newConfig,
    });
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
  const reasoningEffort = overrideReasoningEffort && overrideReasoningEffort !== 'default'
    ? overrideReasoningEffort
    : (config.prompts[CODE]?.reasoning_effort && config.prompts[CODE].reasoning_effort !== 'default'
        ? config.prompts[CODE].reasoning_effort
        : null);
  
  if (reasoningEffort) {
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
  const { x, y, width, height } = getPosition(config, msg.originalCode || msg.code);
  const promptCode = msg.originalCode || msg.code;
  const promptConfig = config.prompts[promptCode];
  const isAlwaysOnTop = promptConfig?.isAlwaysOnTop ?? true; // 从快捷助手配置读取
  let channel = "window";
  
  const ubWindow = utools.createBrowserWindow(
    "./window/index.html",
    {
      show: true,
      title: "Anywhere",
      useContentSize: true,
      frame: true,
      width: width,
      height: height,
      alwaysOnTop: isAlwaysOnTop, // 使用快捷助手配置
      shellOpenPath: true,
      x: x,
      y: y,
      webPreferences: {
        preload: "./window_preload.js",
        devTools: true
      },
    },
    () => {
      ubWindow.webContents.send(channel, msg);
      ubWindow.webContents.show();
      ubWindow.setAlwaysOnTop(isAlwaysOnTop, "floating"); // 再次确认置顶状态
      ubWindow.setFullScreen(false);
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

async function savePromptWindowSettings(promptKey, settings) {
    const configDoc = utools.db.get("config");
    if (!configDoc || !configDoc.data || !configDoc.data.config) return { success: false, message: "Config not found" };

    const config = configDoc.data.config;
    if (!config.prompts || !config.prompts[promptKey]) {
        return { success: false, message: "Prompt not found" };
    }
    
    // Update settings for the specific prompt
    config.prompts[promptKey] = {
        ...config.prompts[promptKey],
        ...settings
    };

    // Save the updated config back to the database
    const result = utools.db.put({
        _id: "config",
        data: { config },
        _rev: configDoc._rev
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