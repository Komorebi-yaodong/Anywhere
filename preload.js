const {
  getConfig,
  updateConfig,
  checkConfig,
  getPosition,
  getRandomItem,
  chatOpenAI,
  copyText,
} = require('./data.js');

const {
  requestTextOpenAI,
  requestImageOpenAI,
  handelReplyOpenAI
} = require('./input.js');


window.api = {
  getConfig,
  updateConfig,
  getRandomItem,
  chatOpenAI,
  copyText
};

// 主逻辑
utools.onPluginEnter(async ({ code, type, payload, option }) => {
  if (code === "Anywhere Settings") {
    config = getConfig().config;
    checkConfig(config);
  }
  else if (code !== "Anywhere Settings") {
    // 获取配置文件，隐藏主窗口
    utools.hideMainWindow();
    config = getConfig().config;
    checkConfig(config);
    // 直接输入到当前输入框
    if (config.prompts[code].showMode === "input") {
      if (type === "over") {
        // 将换行符替换为空格或空
        if (config.skipLineBreak) {
          payload = payload
            .replace(/([a-zA-Z])\s*\n\s*([a-zA-Z])/g, "$1 $2")
            .replace(/\s*\n\s*/g, "");
        }
        response = await requestTextOpenAI(code, payload, config);

        handelReplyOpenAI(code, response, config.stream, config.showNotification);
      } else if (type === "img") {
        response = await requestImageOpenAI(code, payload, config);
        handelReplyOpenAI(code, response, config.stream, config.showNotification);
      } else {
        utools.showNotification("Unsupported input type");
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
      } else {
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
      // 窗口位置
      const window_position = getPosition(config);
      let windowX = window_position.x;
      let windowY = window_position.y;

      let msg = {
        os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win": "linux",
        code: code,
        type: type,
        payload: payload,
      };
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
          alwaysOnTop: true,
          shellOpenPath: true,
          x: windowX,
          y: windowY,
          webPreferences: {
            preload: "./window_preload.js",
            // devTools: true
          },
        },
        () => {
          ubWindow.webContents.send(channel,msg);
          ubWindow.webContents.show(); // 显示窗口
          ubWindow.setAlwaysOnTop(true, "floating"); // 窗口置顶
          ubWindow.setFullScreen(false); // 窗口全屏
        }
      );
      // ubWindow.webContents.openDevTools({ mode: "detach" });
    }
    else {
      utools.showNotification("Unsupported Show Mode");
    }
    utools.outPlugin(); // 关闭插件窗口
  }
});