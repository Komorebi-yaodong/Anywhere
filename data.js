const fs = require('fs/promises');
const path = require('path');


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
      Completion: {
        type: "over",
        prompt: `你是一个文本续写模型，用户会输入内容，请你根据用户提供的内容完成续写。续写的内容要求符合语境语义，与前文连贯。注意续写不要重复已经提供的内容，只执行续写操作，不要有任何多余的解释。`,
        showMode: "input", // input, window
        model: "", // providers_id|model
        enable: true,
        icon: "",
        stream: true,
        isTemperature: false,
        temperature: 0.7,
        isDirectSend: false, // 是否直接发送文件
      },
    },
    stream: true,
    skipLineBreak: true,
    window_height: 520,
    window_width: 400,
    autoCloseOnBlur: false,
    CtrlEnterToSend: false,
    showNotification: true,
    isDarkMode: false,
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
  if (!config.version !== "1.6.0") {
    config.version = "1.6.0";
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
  if (!config.autoCloseOnBlur) {
    config.autoCloseOnBlur = false;
    flag = true;
  }
  if (!config.CtrlEnterToSend) {
    config.CtrlEnterToSend = false;
    flag = true;
  }
  if (!config.showNotification) {
    config.showNotification = false;
    flag = true;
  }

  if (!config.position_x || !config.position_y) {
    config.fix_position = false;
    config.position_x = 0;
    config.position_y = 0;
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
    if (config.prompts[key].isDirectSend === undefined) {
      config.prompts[key].isDirectSend = false;
      flag = true;
    }
  }

  // 增加tags属性
  if (!config.tags) {
    config.tags = {};
    flag = true;
  }
  if (!config.language) {
    config.language = "en";
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

// 更新配置文件
function updateConfig(newConfig) {
  const features = utools.getFeatures();
  let featuresMap = new Map(features.map((feature) => [feature.code, feature]));
  // 查找prompts中的key是否在features的元素的code中，如不在则添加
  for (let key in newConfig.config.prompts) {
    let feature = {
      code: key,
      explain: key,
      mainHide: true,
      cmds: []
    }

    if (newConfig.config.prompts[key].type === "general") {
      feature.cmds.push({ type: "over", label: key });
      feature.cmds.push({ type: "img", label: key });
      feature.cmds.push({ type: "files", label: key, fileType: "file", match: "/\\.(png|jpeg|jpg|webp|docx|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|csv|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue)$/i" });
    }
    else if (newConfig.config.prompts[key].type === "files") {
      feature.cmds.push({ type: "files", label: key, fileType: "file", match: "/\\.(png|jpeg|jpg|webp|docx|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|csv|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue)$/i" });
    }
    else if (newConfig.config.prompts[key].type === "img") {
      feature.cmds.push({ type: "img", label: key });
    }
    else if (newConfig.config.prompts[key].type === "over") {
      feature.cmds.push({ type: "over", label: key });
    }

    if (newConfig.config.prompts[key].icon){
      feature.icon = newConfig.config.prompts[key].icon;
    }

    if (newConfig.config.prompts[key].enable) {
      utools.setFeature(feature);
    }
  }
  // 查找features的元素的code是否在prompts中的key中，如不在则删除
  for (let [key, feature] of featuresMap) {
    if (!newConfig.config.prompts[key] || !newConfig.config.prompts[key].enable) {
      utools.removeFeature(key);
    }
  }
  let configDoc = utools.db.get("config");
  if (configDoc) {
    // 更新已存在的配置
    configDoc.data = { ...configDoc.data, ...newConfig };
    return utools.db.put(configDoc);
  } else {
    // 创建新的配置
    return utools.db.put({
      _id: "config",
      data: newConfig,
    });
  }
}

function getUser(){
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
async function chatOpenAI(history, config, modelInfo, CODE, signal) {
  
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

  let payload = {
    model: model,
    messages: history,
    stream: config.stream,
  }

  if (config.prompts[CODE] && config.prompts[CODE].model === modelInfo) {
    payload.stream = config.prompts[CODE].stream;
    if (config.prompts[CODE].isTemperature) {
      payload.temperature = config.prompts[CODE].temperature;
    }
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

module.exports = {
  getConfig,
  checkConfig,
  updateConfig,
  getUser,
  getPosition,
  getRandomItem,
  chatOpenAI,
  copyText
};
