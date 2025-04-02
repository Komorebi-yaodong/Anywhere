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
      },
    },
    stream: true,
    skipLineBreak: true,
    window_height: 520,
    window_width: 400,
    autoCloseOnBlur: false,
    CtrlEnterToSend: false,
    showNotification: true
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
  if (!config.version !== "1.4.0") {
    config.version = "1.4.0";
    flag = true;
  }
  else{
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

  // 增加promptOrder的属性
  if (!config.promptOrder) {
    config.promptOrder = [];
    for (let key in config.prompts) {
      config.promptOrder.push(key);
    }
    flag = true;
    // promptOrder排序
    config.promptOrder.sort((a, b) => config.prompts[a].idex - config.prompts[b].idex);
    
  }

  // 如果config.prompts[key].idex存在，则删除
  for (let key in config.prompts) {
    if (config.prompts[key].idex || config.prompts[key].idex === 0) {
      delete config.prompts[key].idex;
      flag = true;
    }
  }

  // 检查promptOrder中的属性是否一一对应且按照idex序号排序
  for (let i = 0; i < config.promptOrder.length; i++) {
    if(!config.prompts[config.promptOrder[i]]){
      config.promptOrder.splice(i, 1);
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
    else{
      config.prompts[key].model = `${config.providerOrder[0]}|${config.providers[config.providerOrder[0]].modelList[0]}`;
      flag = true;
    }
    if (config.prompts[key].model === "") {
      config.prompts[key].model = `${config.providerOrder[0]}|${config.providers[config.providerOrder[0]].modelList[0]}`;
      flag = true;
    }

    // 检查prompts的key是否在promptOrder中
    if (config.promptOrder.indexOf(key) === -1) {
      config.promptOrder.push(key);
      flag = true;
    }
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
    if (newConfig.config.prompts[key].type === "general") {
      utools.setFeature({
        code: key,
        explain: key,
        mainHide: true,
        cmds: [
          { type: "over", label: key },
          { type: "img", label: key },],
      });
    } else {
      utools.setFeature({
        code: key,
        explain: key,
        mainHide: true,
        cmds: [{ type: newConfig.config.prompts[key].type, label: key }],
      });
    }
  }
  // 查找features的元素的code是否在prompts中的key中，如不在则删除
  for (let [key, feature] of featuresMap) {
    if (!newConfig.config.prompts[key]) {
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

function getRandomItem(list){
  // 检查list是不是字符串
  if (typeof list === "string") {
    // 如果字符串包含逗号
    if (list.includes(",")) {
      list = list.split(",");
      // 删除空白字符
      list = list.filter(item => item.trim() !== "");
    }
    else if(list.includes("，")){
      list = list.split(",");
      // 删除空白字符
      list = list.filter(item => item.trim() !== "");
    }
    else{
      return list;
    }
  }

  if (list.length === 0) {
    return "";
  }
  else{
    const resault = list[Math.floor(Math.random() * list.length)];
    return resault;
  }
}

module.exports = {
  getConfig,
  checkConfig,
  updateConfig,
  getRandomItem
};
