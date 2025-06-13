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
  if (!config.version !== "1.5.8") {
    config.version = "1.5.8";
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
    if (!config.prompts[config.promptOrder[i]]) {
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
    else {
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
    if (newConfig.config.prompts[key].type === "general" && newConfig.config.prompts[key].enable) {
      if (newConfig.config.prompts[key].icon) {
        utools.setFeature({
          code: key,
          explain: key,
          // mainHide: true,
          icon: newConfig.config.prompts[key].icon,
          cmds: [
            { type: "over", label: key },
            { type: "img", label: key },
            { type: "files", label: key, fileType: "file", match: "/\\.(png|jpeg|jpg|webp|docx|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|csv|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue)$/i" },
          ],
        });
      }
      else {
        utools.setFeature({
          code: key,
          explain: key,
          mainHide: true,
          cmds: [
            { type: "over", label: key },
            { type: "img", label: key },
            { type: "files", label: key },
            { type: "files", label: key, fileType: "file", match: "/\\.(png|jpeg|jpg|webp|docx|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|csv|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue)$/i" },
          ],
        });
      }
    } else if (newConfig.config.prompts[key].enable) {
      if (newConfig.config.prompts[key].icon) {
        utools.setFeature({
          code: key,
          explain: key,
          mainHide: true,
          icon: newConfig.config.prompts[key].icon,
          cmds: [{ type: newConfig.config.prompts[key].type, label: key }
          ],
        });
      }
      else {
        utools.setFeature({
          code: key,
          explain: key,
          mainHide: true,
          cmds: [{ type: newConfig.config.prompts[key].type, label: key }
          ],
        });
      }
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

const extensionToMimeType = {
    // 文本和代码
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.csv': 'text/csv',
    '.py': 'text/plain', // 或 'application/x-python'
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.java': 'text/x-java-source',
    '.c': 'text/plain',
    '.cpp': 'text/plain',
    '.h': 'text/plain',
    '.hpp': 'text/plain',
    '.cs': 'text/plain',
    '.go': 'text/plain',
    '.php': 'application/x-httpd-php',
    '.rb': 'application/x-ruby',
    '.rs': 'text/rust',
    '.sh': 'application/x-sh',
    '.sql': 'application/sql',
    '.vue': 'text/plain',

    // 文档
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pdf': 'application/pdf',

    // 图片
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',

    // 音频
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
};

/**
 * [新增] 核心函数：将文件路径转换为 File 对象。
 * @param {string} filePath - 文件的绝对路径。
 * @returns {Promise<File|null>} - 返回一个可供前端使用的 File 对象，如果失败则返回 null。
 */
const handleFilePath = async (filePath) => {
  try {
    // 1. 验证路径是否存在
    await fs.access(filePath);

    // 2. 读取文件内容到 Buffer
    const fileBuffer = await fs.readFile(filePath);

    // 3. 获取文件名
    const fileName = path.basename(filePath);
    
    // 4. 获取文件后缀并查找对应的 MIME 类型
    const extension = path.extname(fileName).toLowerCase();
    const mimeType = extensionToMimeType[extension] || 'application/octet-stream'; // 提供一个安全的默认值

    // 5. 创建一个前端可以识别的 File 对象
    //    File 构造函数接受一个包含 [BlobPart] 的数组，Node.js 的 Buffer 可以直接作为 BlobPart 使用。
    const fileObject = new File([fileBuffer], fileName, { type: mimeType });
    
    return fileObject;

  } catch (error) {
    console.error(`处理文件路径失败: ${filePath}`, error);
    return null;
  }
};

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
async function chatOpenAI(history, config, modelInfo, CODE, signal) { // 添加 signal 参数

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

  if (config.prompts[CODE].model === modelInfo){
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
  getPosition,
  getRandomItem,
  chatOpenAI,
  copyText,
  handleFilePath, // 读取文件
};
