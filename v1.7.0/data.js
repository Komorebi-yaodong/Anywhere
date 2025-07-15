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
      },
    },
    language:"zh",
    tags: {},
    stream: true,
    skipLineBreak: false,
    window_height: 520,
    window_width: 400,
    autoCloseOnBlur: false,
    CtrlEnterToSend: false,
    isAlwaysOnTop: false,
    showNotification: true,
    isDarkMode: false,
    fix_position: false,
    zoom:1,
    webdav: {
      url: "",
      username: "",
      password: "",
      path: "/anywhere",
      dataPath: "/anywhere_data",
    },
    voiceList:["alloy-👧","echo-👨"],
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


// 检查并更新配置文件
function checkConfig(config) {
  let flag = false;
  if (config.version !== "1.6.14") {
    config.version = "1.6.14";
    flag = true;
  }
  else {
    return;
  }
  // 检查是否存在窗口大小配置
  if (!config.window_width || !config.window_height) {
    config.window_width = 400;
    config.window_height = 520;
    flag = true;
  }
  if (config.autoCloseOnBlur == undefined) {
    config.autoCloseOnBlur = false;
    flag = true;
  }
  if (config.CtrlEnterToSend == undefined) {
    config.CtrlEnterToSend = false;
    flag = true;
  }
  if (config.isAlwaysOnTop == undefined) {
    config.isAlwaysOnTop = false;
    flag = true;
  }
  if (config.showNotification == undefined) {
    config.showNotification = false;
    flag = true;
  }

  if (!config.position_x || !config.position_y) {
    config.fix_position = false;
    config.position_x = 0;
    config.position_y = 0;
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
    config.voiceList = ["alloy","ash","ballad","coral","echo","fable","nova","onyx","sage","shimmer"];
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
  // 更新默认配置的存储方式
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
    //插入order的第一个
    config.providerOrder.unshift("0");
    flag = true;
  }

  // 检查prompt的enable属性是否存在
  for (let key in config.prompts) {
    if (config.prompts[key].voice === undefined) {
      config.prompts[key].voice = null;
      flag = true;
    }
    if (config.prompts[key].enable === undefined) {
      config.prompts[key].enable = true;
      flag = true;
    }
    if (config.prompts[key].stream === undefined) {
      config.prompts[key].stream = true;
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

function getPosition(config) {
  let windowX = 0, windowY = 0;
  if (config.fix_position) {
    let set_position = {
      x: config.position_x,
      y: config.position_y
    };

    const displays = utools.getAllDisplays();
    const currentDisplay = displays.find(display =>
      set_position.x >= display.bounds.x &&
      set_position.x <= display.bounds.x + display.bounds.width &&
      set_position.y >= display.bounds.y &&
      set_position.y <= display.bounds.y + display.bounds.height
    );
    windowX = Math.floor(set_position.x);
    windowY = Math.floor(set_position.y);
    if (currentDisplay) {
      // 左边界检查
      windowX = Math.max(windowX, currentDisplay.bounds.x);
      // 右边界检查
      windowX = Math.min(windowX, currentDisplay.bounds.x + currentDisplay.bounds.width - config.window_width);
      // 上边界检查
      windowY = Math.max(windowY, currentDisplay.bounds.y);
      // 下边界检查
      windowY = Math.min(windowY, currentDisplay.bounds.y + currentDisplay.bounds.height - config.window_height);

      // 额外的下边界调整，避免窗口顶部超出屏幕底部
      if (windowY + config.window_height > currentDisplay.bounds.y + currentDisplay.bounds.height) {
        windowY = currentDisplay.bounds.y + currentDisplay.bounds.height - config.window_height;
      }
    }
  }
  else {
    mouse_position = utools.getCursorScreenPoint();
    const displays = utools.getAllDisplays();
    const currentDisplay = displays.find(display =>
      mouse_position.x >= display.bounds.x &&
      mouse_position.x <= display.bounds.x + display.bounds.width &&
      mouse_position.y >= display.bounds.y &&
      mouse_position.y <= display.bounds.y + display.bounds.height
    );
    // 计算窗口位置，窗口顶端中间对准鼠标
    windowX = Math.floor(mouse_position.x - (config.window_width / 2)); // 水平居中
    windowY = Math.floor(mouse_position.y); // 窗口顶部与鼠标y坐标对齐

    if (currentDisplay) {
      // 左边界检查
      windowX = Math.max(windowX, currentDisplay.bounds.x);
      // 右边界检查
      windowX = Math.min(windowX, currentDisplay.bounds.x + currentDisplay.bounds.width - config.window_width);
      // 上边界检查
      windowY = Math.max(windowY, currentDisplay.bounds.y);
      // 下边界检查
      windowY = Math.min(windowY, currentDisplay.bounds.y + currentDisplay.bounds.height - config.window_height);

      // 额外的下边界调整，避免窗口顶部超出屏幕底部
      if (windowY + config.window_height > currentDisplay.bounds.y + currentDisplay.bounds.height) {
        windowY = currentDisplay.bounds.y + currentDisplay.bounds.height - config.window_height;
      }
    }
    // utools.showNotification("windowX: " + windowX + " windowY: " + windowY);
  }
  return { x: windowX, y: windowY };
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
async function chatOpenAI(history, config, modelInfo, CODE, signal, selectedVoice = null) {

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
    // 沿用快捷助手的流式设置
    if (config.prompts[CODE] && config.prompts[CODE].model === modelInfo) {
      payload.stream = config.prompts[CODE].stream;
    } else {
        payload.stream = config.stream;
    }
  }

  // 添加温度参数
  if (config.prompts[CODE] && config.prompts[CODE].isTemperature) {
    payload.temperature = config.prompts[CODE].temperature;
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

// 打开独立窗口
async function openWindow(config, msg) {
  const window_position = getPosition(config);
  let windowX = window_position.x;
  let windowY = window_position.y;
  let channel = "window"
  // 创建运行窗口
  const ubWindow = utools.createBrowserWindow(
    "./window/index.html",
    {
      show: true,
      title: "Anywhere",
      useContentSize: true,
      frame: true,
      width: config.window_width,
      height: config.window_height,
      alwaysOnTop: config.isAlwaysOnTop,
      shellOpenPath: true,
      x: windowX,
      y: windowY,
      webPreferences: {
        preload: "./window_preload.js",
        // devTools: true,
      },
    },
    () => {
      ubWindow.webContents.send(channel, msg);
      ubWindow.webContents.show(); // 显示窗口
      ubWindow.setAlwaysOnTop(config.isAlwaysOnTop, "floating"); // 窗口置顶
      ubWindow.setFullScreen(false); // 窗口全屏
    }
  );
  // ubWindow.webContents.openDevTools({ mode: "detach" });
}

async function coderedirect(label, payload) {
  utools.redirect(label, payload);
}

function setZoomFactor(factor){
    webFrame.setZoomFactor(factor);
}

module.exports = {
  getConfig,
  checkConfig,
  updateConfig,
  updateConfigWithoutFeatures, // [NEW] 导出新函数
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