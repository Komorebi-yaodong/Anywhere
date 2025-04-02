const { ipcRenderer } = require('electron');

const {
  getConfig,
  updateConfig,
  checkConfig,
  getRandomItem
} = require('./data.js');

const {
  requestTextOpenAI,
  requestImageOpenAI,
  handelReplyOpenAI
} = require('./input.js');

window.api = {
  getConfig, // 添加 getConfig 到 api
  updateConfig, // 添加 updateConfig 到 api
  getRandomItem
};

function sendMsgToChild(id, channel, msg) {
  ipcRenderer.sendTo(id, channel, msg);
}

window.preload = {
  sendMsgToChild,
};

// 默认配置文件
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
    promptOrder: ["Completion"],
    stream: true,
    skipLineBreak: true,
    window_height: 520,
    window_width: 400,
    autoCloseOnBlur: false,
    CtrlEnterToSend: false,
    showNotification: true
  }
};

// 主逻辑
utools.onPluginEnter(async ({ code, type, payload, option }) => {
  
  config = getConfig().config;
  checkConfig(config);
  if (code!=="Anywhere Settings"){
    // 获取配置文件，隐藏主窗口
    utools.hideMainWindow(true);

    // 非窗口运行
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

    // 窗口运行
    else if(config.prompts[code].showMode === "window"){
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
          x: windowX,
          y: windowY,
          webPreferences: {
            preload: "./window_preload.js",
            devTools: true
          },
        },
        () => {
          window.preload.sendMsgToChild(ubWindow.webContents.id, channel, msg);
          ubWindow.webContents.show(); // 显示窗口
          ubWindow.setAlwaysOnTop(true, "floating"); // 窗口置顶
          ubWindow.setFullScreen(false); // 窗口全屏
        }
      );
      ubWindow.webContents.openDevTools({ mode: "detach" });
    }
    else{
      utools.showNotification("Unsupported Show Mode");
    }
    utools.outPlugin(); // 关闭插件窗口
  }
});