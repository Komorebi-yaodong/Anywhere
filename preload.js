const { ipcRenderer } = require('electron');

function sendMsgTo(id, channel, msg) {
  ipcRenderer.sendTo(id, channel, msg);
}

function receiveMsg(channel, callback) {
  ipcRenderer.on(channel, (_event, res) => {
    callback(res);
  });
}

window.preload = {
  sendMsgTo,
  receiveMsg,
};

// 默认配置
const defaultConfig = {
  config: {
    apiUrl: "https://api.openai.com/v1",
    apiKey: "sk-xxxxxx",
    modelList: [],
    ModelsListByUser: [],
    modelSelect: "gpt-4o-mini",
    providers: {},
    providerOrder: [],
    prompts: {
      Completion: {
        idex: 0, // 用于排序
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
  newConfig.config.prompts["Completion"] =
    defaultConfig.config.prompts["Completion"];
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

// 函数：输出
async function handelReplyOpenAI(code, response, stream, showNotification) {
  try {
    if (!response.ok) {
      utools.showNotification(`HTTP error! status: ${response.status}`);
      return;
    }
    if (stream) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let output = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.lastIndexOf("\n");
        if (boundary !== -1) {
          const completeData = buffer.substring(0, boundary);
          buffer = buffer.substring(boundary + 1);

          const lines = completeData
            .split("\n")
            .filter((line) => line.trim() !== "");
          for (const line of lines) {
            const message = line.replace(/^data: /, "");
            if (message === "[DONE]") {
              if (output.trim()) {
                utools.hideMainWindowTypeString(output.trimEnd());
              }
              break;
            }
            try {
              const parsed = JSON.parse(message);
              if (parsed.choices[0].delta.content) {
                utools.hideMainWindowTypeString(output);
                output = parsed.choices[0].delta.content;
              }
            } catch (error) {
              utools.showNotification(
                "Could not parse stream message",
                message,
                error
              );
              return;
            }
          }
        }
      }
      if (showNotification) {
        utools.showNotification(code + " successfully!");
      }
    } else {
      const data = await response.json();
      utools.hideMainWindowTypeString(data.choices[0].message.content.trimEnd());
      if (showNotification) {
        utools.showNotification(code + " successfully!");
      }
    }
  } catch (error) {
    utools.showNotification("error: " + error);
  }
}

// 函数：处理文本
async function handleTextOpenAI(code, text, config) {
  // 从 prompt 配置中获取模型信息
  const modelInfo = config.prompts[code].model;
  let apiUrl = config.apiUrl;
  let apiKey = config.apiKey;
  let model = config.modelSelect;

  if (modelInfo) {
    const [providerId, modelName] = modelInfo.split("|");
    const provider = config.providers[providerId];
    if (provider) {
      apiUrl = provider.url;
      apiKey = provider.api_key;
      model = modelName;
    }
  }

  const response = await fetch(apiUrl + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: "system",
          content: config.prompts[code].prompt,
        },
        {
          role: "user",
          content: text,
        },
      ],
      stream: config.stream,
    }),
  });
  return response;
}

// 函数：处理图片
async function handleImageOpenAI(code, imagePath, config) {
  // 从 prompt 配置中获取模型信息
  const modelInfo = config.prompts[code].model;
  let apiUrl = config.apiUrl;
  let apiKey = config.apiKey;
  let model = config.modelSelect;

  if (modelInfo) {
    const [providerId, modelName] = modelInfo.split("|");
    const provider = config.providers[providerId];
    if (provider) {
      apiUrl = provider.url;
      apiKey = provider.api_key;
      model = modelName;
    }
  }
  const base64Image = imagePath;
  const response = await fetch(apiUrl + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: "system",
          content: config.prompts[code].prompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: config.prompts[code].prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: base64Image,
              },
            },
          ],
        },
      ],
      stream: config.stream,
    }),
  });
  return response;
}

window.api = {
  getConfig, // 添加 getConfig 到 api
  updateConfig, // 添加 updateConfig 到 api
  handelReplyOpenAI, // 添加 handelReplyOpenAI 到 api
  handleTextOpenAI, // 添加 handleTextOpenAI 到 api
  handleImageOpenAI, // 添加 handleImageOpenAI 到 api
};

utools.onPluginEnter(async ({ code, type, payload, option }) => {
  // 主逻辑
  if (code !== "Anywhere Settings") {
    // 获取配置文件，隐藏主窗口
    config = getConfig().config;
    utools.hideMainWindow(true);
    checkConfig(config);
    // 非窗口运行
    if (config.prompts[code].showMode === "input") {
      if (type === "over") {
        // 将换行符替换为空格或空
        if (config.skipLineBreak) {
          payload = payload
            .replace(/([a-zA-Z])\s*\n\s*([a-zA-Z])/g, "$1 $2")
            .replace(/\s*\n\s*/g, "");
        }
        response = await handleTextOpenAI(code, payload, config);

        handelReplyOpenAI(code, response, config.stream, config.showNotification);
      } else if (type === "img") {
        response = await handleImageOpenAI(code, payload, config);
        handelReplyOpenAI(code, response, config.stream, config.showNotification);
      } else {
        utools.showNotification("Unsupported input type");
      }
    }

    // 窗口运行
    else if (config.prompts[code].showMode === "window") {
      mouse_position = utools.getCursorScreenPoint();
      const displays = utools.getAllDisplays();
      const currentDisplay = displays.find(display =>
        mouse_position.x >= display.bounds.x &&
        mouse_position.x <= display.bounds.x + display.bounds.width &&
        mouse_position.y >= display.bounds.y &&
        mouse_position.y <= display.bounds.y + display.bounds.height
      );
      let windowX = Math.floor(mouse_position.x - (config.window_width / 2));
      let windowY = Math.floor(mouse_position.y - (config.window_height / 2));
      if (currentDisplay) {
        // 左边界检查
        windowX = Math.max(windowX, currentDisplay.bounds.x);
        // 右边界检查
        windowX = Math.min(windowX, currentDisplay.bounds.x + currentDisplay.bounds.width - config.window_width);
        // 上边界检查（预留标题栏高度，比如30像素）
        windowY = Math.max(windowY, currentDisplay.bounds.y + 30);
        // 下边界检查
        windowY = Math.min(windowY, currentDisplay.bounds.y + currentDisplay.bounds.height - config.window_height);
      }
      let msg = {
        code: code,
        type: type,
        payload: payload,
      };
      const channel = "show_page";
      // 创建运行窗口
      const ubWindow = utools.createBrowserWindow(
        "show_page.html",
        {
          show: true,
          title: "Anywhere",
          useContentSize: true,
          frame: true,
          width: config.window_width,
          height: config.window_height,
          alwaysOnTop: true,
          x: windowX,
          y: windowY,
          webPreferences: {
            preload: "show_page.js",
            devTools: true
          },
        },
        () => {
          window.preload.sendMsgTo(ubWindow.webContents.id, channel, msg);
          ubWindow.webContents.show(); // 显示窗口
          ubWindow.setAlwaysOnTop(true, "floating"); // 窗口置顶
          ubWindow.setFullScreen(false); // 窗口全屏
        }
      );
      ubWindow.webContents.openDevTools({ mode: "detach" });
    }
    utools.outPlugin(); // 关闭插件窗口
  }
});
