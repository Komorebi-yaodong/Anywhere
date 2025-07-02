const { ipcMain, dialog } = require('electron');

const {
  getConfig,
  updateConfig,
  checkConfig,
  getPosition,
  getUser,
  getRandomItem,
  chatOpenAI,
  copyText,
  sethotkey,
  openWindow,
  coderedirect,
} = require('./data.js');

const {
  handleFilePath,
  handleJsonContent,
  sendfileDirect,
  saveFile,
} = require('./file.js');

const {
  requestTextOpenAI,
  requestImageOpenAI,
  handelReplyOpenAI,
} = require('./input.js');


window.api = {
  getConfig,
  updateConfig,
  getUser,
  getRandomItem,
  chatOpenAI,
  copyText,
  handleFilePath,
  sendfileDirect,
  saveFile,
  sethotkey,
  coderedirect,
};

const feature_suffix = "助手"

// 主逻辑
utools.onPluginEnter(async ({ code, type, payload, option }) => {
  if (code === "Anywhere Settings") {
    config = getConfig().config;
    checkConfig(config);
  }
  else if (code === "Resume Conversation") {
    // 获取配置文件，隐藏主窗口
    utools.hideMainWindow();
    config = getConfig().config;
    checkConfig(config);
    if (type == "files" || type == "over") {
      let msg = {
        os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
        code: code,
        type: type,
        payload: payload,
      };
      await openWindow(config, msg);
    }
  }
  else if (code.endsWith(feature_suffix)) { // 助手功能
    // 获取配置文件，隐藏主窗口
    utools.hideMainWindow();
    config = getConfig().config;
    checkConfig(config);
    let msg = {
      os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
      code: code.replace(feature_suffix, ""), // 去除" 助手"后缀
      type: "over",
      payload: code.replace(feature_suffix, ""),
    };
    
    await openWindow(config, msg);
    utools.outPlugin(); // 关闭插件窗口
  }
  else {
    // 获取配置文件，隐藏主窗口
    utools.hideMainWindow();
    config = getConfig().config;
    checkConfig(config);
    // 直接输入到当前输入框
    let content = null;
    if (config.prompts[code].showMode === "input") {
      if (type === "over") {
        // 将换行符替换为空格或空
        if (config.skipLineBreak) {
          payload = payload
            .replace(/([a-zA-Z])\s*\n\s*([a-zA-Z])/g, "$1 $2")
            .replace(/\s*\n\s*/g, "");
        }
        content = payload;
      } else if (type === "img") {
        content = [
          {
            type: "image_url",
            image_url: {
              url: payload,
            },
          },
        ]
      } else if (type === "files") {
        content = await sendfileDirect(payload);
      }
      else {
        content = false;
        utools.showNotification("Unsupported input type");
      }
      if (content) {
        response = await requestTextOpenAI(code, content, config);
        handelReplyOpenAI(code, response, config.stream, config.showNotification);
      }
    }
    // 输入到剪贴板
    else if (config.prompts[code].showMode === "clipboard") {
      config2 = config;
      config2.stream = false;
      if (type === "over") {
        // 将换行符替换为空格或空
        if (config.skipLineBreak) {
          payload = payload
            .replace(/([a-zA-Z])\s*\n\s*([a-zA-Z])/g, "$1 $2")
            .replace(/\s*\n\s*/g, "");
        }
        response = await requestTextOpenAI(code, payload, config2);
      } else if (type === "img") {
        response = await requestImageOpenAI(code, payload, config2);
      } else if (type === "files") {
        file_content = await sendfileDirect(payload);
        response = await requestTextOpenAI(code, file_content, config);
      }
      else {
        utools.showNotification("Unsupported input type");
      }
      const data = await response.json();
      // utools.copyText(data.choices[0].message.content.trimEnd());
      // 正则匹配，删除<think></think>标签
      const result = data.choices[0].message.content.replace(/<think>.*?<\/think>/gs, '').trim();
      utools.copyText(result);
      utools.showNotification(code + " successfully!");
    }
    // 窗口运行
    else if (config.prompts[code].showMode === "window") {
      let msg = {
        os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
        code: code,
        type: type,
        payload: payload,
      };
      await openWindow(config, msg);
    }
    utools.outPlugin(); // 关闭插件窗口
  }
});