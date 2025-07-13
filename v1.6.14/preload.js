const {
  getConfig,
  updateConfig,
  checkConfig,
  getUser,
  getRandomItem,
  chatOpenAI,
  copyText,
  sethotkey,
  openWindow,
  coderedirect,
  setZoomFactor,
  feature_suffix,
  defaultConfig,
} = require('./data.js');

const {
  handleFilePath,
  sendfileDirect,
  saveFile,
} = require('./file.js');

const {
  requestTextOpenAI,
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
  setZoomFactor,
  defaultConfig,
};

// --- Command Handlers ---
const commandHandlers = {
  'Anywhere Settings': async () => {
    const config = getConfig().config;
    checkConfig(config);
    // The main window will open automatically based on plugin.json, so no action needed here.
  },

  'Resume Conversation': async ({ type, payload }) => {
    utools.hideMainWindow();
    const config = getConfig().config;
    checkConfig(config);

    if (type === "files" || type === "over") {
      let sessionPayload = payload;
      let filename = null;

      try {
        const parsed = JSON.parse(payload);
        if (parsed && parsed.sessionData) {
          sessionPayload = parsed.sessionData;
          filename = parsed.filename || null;
        }
      } catch (e) {
      }

      const msg = {
        os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
        code: "Resume Conversation",
        type,
        payload: sessionPayload,
        filename: filename
      };
      await openWindow(config, msg);
    }
    utools.outPlugin();
  },

  handleAssistant: async ({ code, type, payload }) => {
    utools.hideMainWindow();
    const config = getConfig().config;
    checkConfig(config);

    const assistantName = code.replace(feature_suffix, "");
    const msg = {
      os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
      code: assistantName,
      type: "over", // Assistant commands are always treated as "over" type for window opening
      payload: assistantName,
    };

    await openWindow(config, msg);
    utools.outPlugin();
  },

  handlePrompt: async ({ code, type, payload }) => {
    utools.hideMainWindow();
    const config = getConfig().config;
    checkConfig(config);

    const promptConfig = config.prompts[code];
    if (!promptConfig) {
      utools.showNotification(`Error: Prompt "${code}" not found.`);
      utools.outPlugin();
      return;
    }

    if (promptConfig.showMode === 'window') {
      const msg = {
        os: utools.isMacOS() ? "macos" : utools.isWindows() ? "win" : "linux",
        code,
        type,
        payload,
      };
      await openWindow(config, msg);
    } else {
      let content = null;
      if (type === "over") {
        if (config.skipLineBreak) {
          payload = payload
            .replace(/([a-zA-Z])\s*\n\s*([a-zA-Z])/g, "$1 $2")
            .replace(/\s*\n\s*/g, "");
        }
        content = payload;
      } else if (type === "img") {
        content = [{ type: "image_url", image_url: { url: payload } }];
        console.log(content);
      } else if (type === "files") {
        content = await sendfileDirect(payload);
      } else {
        utools.showNotification("Unsupported input type");
      }

      if (content) {
        if (promptConfig.showMode === 'input') {
          const response = await requestTextOpenAI(code, content, config);
          await handelReplyOpenAI(code, response, config.stream, config.showNotification);
        } else if (promptConfig.showMode === 'clipboard') {
          const config2 = { ...config, stream: false };
          const response = await requestTextOpenAI(code, content, config2);
          const data = await response.json();
          const result = data.choices[0].message.content.replace(/<think>.*?<\/think>/gs, '').trim();
          utools.copyText(result);
          if (config.showNotification) utools.showNotification(code + " successfully!");
        }
      }
    }
    utools.outPlugin();
  }
};

// --- Main Plugin Entry ---
utools.onPluginEnter(async (action) => {
  const { code } = action;

  if (commandHandlers[code]) {
    await commandHandlers[code](action);
  } else if (code.endsWith(feature_suffix)) {
    await commandHandlers.handleAssistant(action);
  } else {
    await commandHandlers.handlePrompt(action);
  }
});