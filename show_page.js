const { ipcRenderer } = require('electron')
// 插件的窗口ID
let parentId = null;
// 管道名称，可以自定义，只需要和发送时的管道名称一致即可
const channel = 'show_page'

window.preload = {
  /***  接收主窗口发送过来的消息  ***/
  receiveMsg: (callback) => {
    ipcRenderer.on(channel, (event, res) => {
      // 保存插件的窗口ID
      parentId = event.senderId;
      if (res) {
        callback(res);
      }
    })
  }
}

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
    CtrlEnterToSend: false
  }
};

// 读取配置文件，如果不存在则返回默认配置
function getConfig() {
  const configDoc = utools.db.get("config")
  if (configDoc) {
    return configDoc.data
  }
  else {
    return defaultConfig
  }
}

// 更新配置文件
function updateConfig(newConfig) {
  const features = utools.getFeatures();
  let featuresMap = new Map(features.map(feature => [feature.code, feature]));
  // 查找prompts中的key是否在features的元素的code中，如不在则添加
  for (let key in newConfig.config.prompts) {
    utools.setFeature({
      code: key,
      explain: key,
      mainHide: true,
      cmds: [{ type: newConfig.config.prompts[key].type, label: key }]
    });
  }
  // 查找features的元素的code是否在prompts中的key中，如不在则删除
  for (let [key, feature] of featuresMap) {
    if (!newConfig.config.prompts[key]) {
      utools.removeFeature(key);
    }
  }
  newConfig.config.prompts.Completion = defaultConfig.config.prompts.Completion
  let configDoc = utools.db.get("config")
  if (configDoc) {
    // 更新已存在的配置
    configDoc.data = { ...configDoc.data, ...newConfig }
    return utools.db.put(configDoc)
  }
  else {
    // 创建新的配置
    return utools.db.put({
      _id: "config",
      data: newConfig,
    })
  }
}

// 函数：输出
async function handelReplyOpenAI(code, response, stream) {
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
async function handleTextOpenAI(code, text, config, signal) {
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
      stream: config.stream
    }),
    signal: signal // 将 signal 传递给 fetch
  });
  return response;
}

// 函数：处理图片
async function handleImageOpenAI(code, imagePath, config, signal) {
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
    signal: signal // 将 signal 传递给 fetch
  });
  return response;
}


// 函数： 追问模式
async function handleAskOpenAI(history, config, modelInfo, signal) { // 添加 signal 参数
  let apiUrl = config.apiUrl;
  let apiKey = config.apiKey;
  let model = config.modelSelect;
  console.log(history)
  if (modelInfo.includes("|")) {
    const [providerId, modelName] = modelInfo.split("|");
    const provider = config.providers[providerId];
    if (provider) {
      apiUrl = provider.url;
      apiKey = provider.api_key;
      model = modelName;
    }
  }
  const response = await fetch(apiUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: model,
      messages: history,
      stream: config.stream
    }),
    signal: signal // 将 signal 传递给 fetch
  });
  return response;
}



function showSuccess(code, showNotification) {
  if (showNotification) {
    utools.showNotification(code + " successfully!");
  }
}

window.api = {
  getConfig,        // 添加 getConfig 到 api
  updateConfig,     // 添加 updateConfig 到 api
  handelReplyOpenAI, // 添加 handelReplyOpenAI 到 api
  handleTextOpenAI, // 添加 handleTextOpenAI 到 api
  handleImageOpenAI, // 添加 handleImageOpenAI 到 api
  showSuccess,    // 添加 showSuccess 到 api
  handleAskOpenAI, // 添加 handleAskOpenAI 到 api
};