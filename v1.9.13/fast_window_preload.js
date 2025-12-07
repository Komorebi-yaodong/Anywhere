var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/input.js
var require_input = __commonJS({
  "src/input.js"(exports2, module2) {
    function getRandomItem(list) {
      if (typeof list === "string") {
        if (list.includes(",")) {
          list = list.split(",");
          list = list.filter((item) => item.trim() !== "");
        } else if (list.includes("\uFF0C")) {
          list = list.split("\uFF0C");
          list = list.filter((item) => item.trim() !== "");
        } else {
          return list;
        }
      }
      if (list.length === 0) {
        return "";
      } else {
        const resault = list[Math.floor(Math.random() * list.length)];
        return resault;
      }
    }
    async function requestTextOpenAI(code, content, config) {
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
      if (config.prompts[code] && config.prompts[code].ifTextNecessary) {
        const now = /* @__PURE__ */ new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        if (typeof content === "string") {
          content = timestamp + "\n\n" + content;
        } else if (Array.isArray(content)) {
          let flag = false;
          for (let i = 0; i < content.length; i++) {
            if (content[i].type === "content" && content[i].text && !(content[i].text.toLowerCase().startsWith("file name:") && content[i].text.toLowerCase().endsWith("file end"))) {
              content[i].text = timestamp + "\n\n" + content[i].text;
              flag = true;
              break;
            }
          }
          if (!flag) {
            content.push({
              type: "text",
              text: timestamp
            });
          }
        }
      }
      const isStream = config.prompts[code].stream ?? true;
      const response = await fetch(apiUrl + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + getRandomItem(apiKey)
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: config.prompts[code].prompt
            },
            {
              role: "user",
              content
            }
          ],
          stream: isStream
        })
      });
      return response;
    }
    async function handelReplyOpenAI(code, response, stream) {
      try {
        if (stream) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          let output = "";
          let is_think_flag = false;
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
              if (completeData.trim() === ": OPENROUTER PROCESSING") {
                continue;
              }
              const lines = completeData.split("\n").filter((line) => line.trim() !== "");
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
                    if (output.trim() === "<think>" && !is_think_flag) {
                      is_think_flag = true;
                    } else if (output.trim() === "</think>" && is_think_flag) {
                      is_think_flag = false;
                    } else if (is_think_flag) {
                    } else {
                      utools.hideMainWindowTypeString(output);
                    }
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
        } else {
          const data = await response.json();
          utools.hideMainWindowTypeString(data.choices[0].message.content.trimEnd());
        }
      } catch (error) {
        utools.showNotification("error: " + error);
      }
    }
    module2.exports = {
      requestTextOpenAI,
      handelReplyOpenAI,
      getRandomItem
    };
  }
});

// src/data.js
var require_data = __commonJS({
  "src/data.js"(exports2, module2) {
    var webFrame = require("electron").webFrame;
    var crypto = require("crypto");
    var windowMap = /* @__PURE__ */ new Map();
    var feature_suffix = "anywhere\u52A9\u624B^_^";
    var {
      requestTextOpenAI
    } = require_input();
    var defaultConfig = {
      config: {
        providers: {
          "0": {
            name: "default",
            url: "https://api.openai.com/v1",
            api_key: "",
            modelList: [],
            enable: true
          }
        },
        providerOrder: ["0"],
        prompts: {
          AI: {
            type: "over",
            prompt: `\u4F60\u662F\u4E00\u4E2AAI\u52A9\u624B`,
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
            reasoning_effort: "default",
            defaultMcpServers: [],
            window_width: 580,
            window_height: 740,
            position_x: 0,
            position_y: 0,
            autoCloseOnBlur: true,
            isAlwaysOnTop: true
          }
        },
        fastWindowPosition: { x: 0, y: 0 },
        mcpServers: {},
        language: "zh",
        tags: {},
        skipLineBreak: false,
        CtrlEnterToSend: false,
        showNotification: true,
        isDarkMode: false,
        fix_position: false,
        isAlwaysOnTop_global: true,
        autoCloseOnBlur_global: true,
        zoom: 1,
        webdav: {
          url: "",
          username: "",
          password: "",
          path: "/anywhere",
          data_path: "/anywhere_data",
          localChatPath: ""
        },
        voiceList: [
          "alloy-\u{1F469}",
          "echo-\u{1F468}\u200D\u{1F9B0}\u6E05\u6670",
          "nova-\u{1F469}\u6E05\u6670",
          "sage-\u{1F467}\u5E74\u8F7B",
          "shimmer-\u{1F467}\u660E\u4EAE",
          "fable-\u{1F610}\u4E2D\u6027",
          "coral-\u{1F469}\u5BA2\u670D",
          "ash-\u{1F9D4}\u200D\u2642\uFE0F\u5546\u4E1A",
          "ballad-\u{1F468}\u6545\u4E8B",
          "verse-\u{1F468}\u8BD7\u6B4C",
          "onyx-\u{1F468}\u200D\u{1F9B0}\u65B0\u95FB",
          "Zephyr-\u{1F467}\u660E\u4EAE",
          "Puck-\u{1F466}\u6B22\u5FEB",
          "Charon-\u{1F466}\u4FE1\u606F\u4E30\u5BCC",
          "Kore-\u{1F469}\u575A\u5B9A",
          "Fenrir-\u{1F468}\u200D\u{1F9B0}\u6613\u6FC0\u52A8",
          "Leda-\u{1F467}\u5E74\u8F7B",
          "Orus-\u{1F468}\u200D\u{1F9B0}\u9274\u5B9A",
          "Aoede-\u{1F469}\u8F7B\u677E",
          "Callirrhoe-\u{1F469}\u968F\u548C",
          "Autonoe-\u{1F469}\u660E\u4EAE",
          "Enceladus-\u{1F9D4}\u200D\u2642\uFE0F\u547C\u5438\u611F",
          "Iapetus-\u{1F466}\u6E05\u6670",
          "Umbriel-\u{1F466}\u968F\u548C",
          "Algieba-\u{1F466}\u5E73\u6ED1",
          "Despina-\u{1F469}\u5E73\u6ED1",
          "Erinome-\u{1F469}\u6E05\u6670",
          "Algenib-\u{1F468}\u200D\u{1F9B0}\u6C99\u54D1",
          "Rasalgethi-\u{1F468}\u200D\u{1F9B0}\u4FE1\u606F\u4E30\u5BCC",
          "Laomedeia-\u{1F469}\u6B22\u5FEB",
          "Achernar-\u{1F469}\u8F7B\u67D4",
          "Alnilam-\u{1F466}\u575A\u5B9A",
          "Schedar-\u{1F466}\u5E73\u7A33",
          "Gacrux-\u{1F469}\u6210\u719F",
          "Pulcherrima-\u{1F469}\u5411\u524D",
          "Achird-\u{1F466}\u53CB\u597D",
          "Zubenelgenubi-\u{1F466}\u4F11\u95F2",
          "Vindemiatrix-\u{1F469}\u6E29\u67D4",
          "Sadachbia-\u{1F468}\u200D\u{1F9B0}\u6D3B\u6CFC",
          "Sadaltager-\u{1F468}\u200D\u{1F9B0}\u535A\u5B66",
          "Sulafat-\u{1F469}\u6E29\u6696"
        ]
      }
    };
    function splitConfigForStorage(fullConfig) {
      const { prompts, providers, mcpServers, ...restOfConfig } = fullConfig;
      return {
        baseConfigPart: { config: restOfConfig },
        promptsPart: prompts,
        providersPart: providers,
        mcpServersPart: mcpServers
      };
    }
    async function getConfig() {
      let configDoc = await utools.db.promises.get("config");
      if (!configDoc) {
        const { baseConfigPart, promptsPart, providersPart, mcpServersPart } = splitConfigForStorage(defaultConfig.config);
        await utools.db.promises.put({ _id: "config", data: baseConfigPart });
        await utools.db.promises.put({ _id: "prompts", data: promptsPart });
        await utools.db.promises.put({ _id: "providers", data: providersPart });
        await utools.db.promises.put({ _id: "mcpServers", data: mcpServersPart });
        return defaultConfig;
      }
      if (configDoc.data.config && configDoc.data.config.prompts) {
        console.warn("Anywhere: Old configuration format detected. Starting migration.");
        const oldFullConfig = configDoc.data.config;
        const { baseConfigPart, promptsPart, providersPart, mcpServersPart } = splitConfigForStorage(oldFullConfig);
        await utools.db.promises.put({ _id: "prompts", data: promptsPart });
        await utools.db.promises.put({ _id: "providers", data: providersPart });
        await utools.db.promises.put({ _id: "mcpServers", data: mcpServersPart });
        const updateResult = await utools.db.promises.put({
          _id: "config",
          data: baseConfigPart,
          _rev: configDoc._rev
        });
        if (updateResult.ok) {
          console.log("Anywhere: Migration successful. Old config cleaned.");
        } else {
          console.error("Anywhere: Migration failed to update old config document.", updateResult.message);
        }
        configDoc = await utools.db.promises.get("config");
      }
      const fullConfigData = configDoc.data;
      const [promptsDoc, providersDoc, mcpServersDoc] = await Promise.all([
        utools.db.promises.get("prompts"),
        utools.db.promises.get("providers"),
        utools.db.promises.get("mcpServers")
      ]);
      fullConfigData.config.prompts = promptsDoc ? promptsDoc.data : defaultConfig.config.prompts;
      fullConfigData.config.providers = providersDoc ? providersDoc.data : defaultConfig.config.providers;
      fullConfigData.config.mcpServers = mcpServersDoc ? mcpServersDoc.data : defaultConfig.config.mcpServers || {};
      return fullConfigData;
    }
    function checkConfig(config) {
      let flag = false;
      if (config.version !== "1.9.13") {
        config.version = "1.9.13";
        flag = true;
      }
      if (config.isAlwaysOnTop_global === void 0) {
        config.isAlwaysOnTop_global = true;
        flag = true;
      }
      if (config.autoCloseOnBlur_global === void 0) {
        config.autoCloseOnBlur_global = true;
        flag = true;
      }
      if (config.window_width || config.window_height) {
        delete config.window_width;
        delete config.window_height;
        flag = true;
      }
      if (config.stream !== void 0) {
        delete config.stream;
        flag = true;
      }
      if (config.autoCloseOnBlur !== void 0) {
        delete config.autoCloseOnBlur;
        flag = true;
      }
      if (config.isAlwaysOnTop !== void 0) {
        delete config.isAlwaysOnTop;
        flag = true;
      }
      if (config.CtrlEnterToSend == void 0) {
        config.CtrlEnterToSend = false;
        flag = true;
      }
      if (config.showNotification == void 0) {
        config.showNotification = false;
        flag = true;
      }
      if (config.position_x || config.position_y) {
        delete config.position_x;
        delete config.position_y;
        flag = true;
      }
      if (config.fix_position == void 0) {
        config.fix_position = false;
        flag = true;
      }
      if (config.zoom == void 0) {
        config.zoom = 1;
        flag = true;
      }
      if (config.inputLayout) {
        delete config.inputLayout;
        flag = true;
      }
      if (config.mcpServers === void 0) {
        config.mcpServers = {};
        flag = true;
      }
      if (config.fastWindowPosition === void 0) {
        config.fastWindowPosition = null;
        flag = true;
      }
      if (config.voiceList === void 0) {
        config.voiceList = [
          "alloy-\u{1F469}",
          "echo-\u{1F468}\u200D\u{1F9B0}\u6E05\u6670",
          "nova-\u{1F469}\u6E05\u6670",
          "sage-\u{1F467}\u5E74\u8F7B",
          "shimmer-\u{1F467}\u660E\u4EAE",
          "fable-\u{1F610}\u4E2D\u6027",
          "coral-\u{1F469}\u5BA2\u670D",
          "ash-\u{1F9D4}\u200D\u2642\uFE0F\u5546\u4E1A",
          "ballad-\u{1F468}\u6545\u4E8B",
          "verse-\u{1F468}\u8BD7\u6B4C",
          "onyx-\u{1F468}\u200D\u{1F9B0}\u65B0\u95FB",
          "Zephyr-\u{1F467}\u660E\u4EAE",
          "Puck-\u{1F466}\u6B22\u5FEB",
          "Charon-\u{1F466}\u4FE1\u606F\u4E30\u5BCC",
          "Kore-\u{1F469}\u575A\u5B9A",
          "Fenrir-\u{1F468}\u200D\u{1F9B0}\u6613\u6FC0\u52A8",
          "Leda-\u{1F467}\u5E74\u8F7B",
          "Orus-\u{1F468}\u200D\u{1F9B0}\u9274\u5B9A",
          "Aoede-\u{1F469}\u8F7B\u677E",
          "Callirrhoe-\u{1F469}\u968F\u548C",
          "Autonoe-\u{1F469}\u660E\u4EAE",
          "Enceladus-\u{1F9D4}\u200D\u2642\uFE0F\u547C\u5438\u611F",
          "Iapetus-\u{1F466}\u6E05\u6670",
          "Umbriel-\u{1F466}\u968F\u548C",
          "Algieba-\u{1F466}\u5E73\u6ED1",
          "Despina-\u{1F469}\u5E73\u6ED1",
          "Erinome-\u{1F469}\u6E05\u6670",
          "Algenib-\u{1F468}\u200D\u{1F9B0}\u6C99\u54D1",
          "Rasalgethi-\u{1F468}\u200D\u{1F9B0}\u4FE1\u606F\u4E30\u5BCC",
          "Laomedeia-\u{1F469}\u6B22\u5FEB",
          "Achernar-\u{1F469}\u8F7B\u67D4",
          "Alnilam-\u{1F466}\u575A\u5B9A",
          "Schedar-\u{1F466}\u5E73\u7A33",
          "Gacrux-\u{1F469}\u6210\u719F",
          "Pulcherrima-\u{1F469}\u5411\u524D",
          "Achird-\u{1F466}\u53CB\u597D",
          "Zubenelgenubi-\u{1F466}\u4F11\u95F2",
          "Vindemiatrix-\u{1F469}\u6E29\u67D4",
          "Sadachbia-\u{1F468}\u200D\u{1F9B0}\u6D3B\u6CFC",
          "Sadaltager-\u{1F468}\u200D\u{1F9B0}\u535A\u5B66",
          "Sulafat-\u{1F469}\u6E29\u6696"
        ];
        flag = true;
      }
      if (config.webdav == void 0) {
        config.webdav = {
          url: "",
          username: "",
          password: "",
          path: "/anywhere",
          data_path: "/anywhere_data"
        };
        flag = true;
      }
      if (config.webdav.dataPath && config.webdav.data_path == void 0) {
        config.webdav.data_path = config.webdav.dataPath;
        delete config.webdav.dataPath;
        flag = true;
      } else if (config.webdav.dataPath) {
        delete config.webdav.dataPath;
      }
      if (config.webdav.data_path == void 0) {
        config.webdav.data_path = "/anywhere_data";
        flag = true;
      }
      if (config.webdav.localChatPath == void 0) {
        config.webdav.localChatPath = "";
        flag = true;
      }
      if (config.apiUrl) {
        config.providers["0"] = {
          name: "default",
          url: config.apiUrl,
          api_key: config.apiKey,
          modelList: [config.modelSelect].concat(config.ModelsListByUser),
          enable: true
        };
        delete config.apiUrl;
        delete config.apiKey;
        delete config.modelList;
        delete config.ModelsListByUser;
        delete config.modelSelect;
        delete config.activeProviderId;
        config.providerOrder.unshift("0");
        flag = true;
      }
      for (let key in config.prompts) {
        if (config.prompts[key].showMode === "input" || config.prompts[key].showMode === "clipboard") {
          config.prompts[key].showMode = "fastinput";
          flag = true;
        }
        if (config.prompts[key].type === "over" && config.prompts[key].matchRegex === void 0) {
          config.prompts[key].matchRegex = "";
          flag = true;
        }
        if (config.prompts[key].defaultMcpServers === void 0) {
          config.prompts[key].defaultMcpServers = [];
          flag = true;
        }
        if (config.prompts[key].isAlwaysOnTop === void 0) {
          config.prompts[key].isAlwaysOnTop = true;
          flag = true;
        }
        if (config.prompts[key].autoCloseOnBlur === void 0) {
          config.prompts[key].autoCloseOnBlur = true;
          flag = true;
        }
        if (config.prompts[key].window_width === void 0) {
          config.prompts[key].window_width = 580;
          flag = true;
        }
        if (config.prompts[key].window_height === void 0) {
          config.prompts[key].window_height = 740;
          flag = true;
        }
        if (config.prompts[key].position_x === void 0) {
          config.prompts[key].position_x = 0;
          flag = true;
        }
        if (config.prompts[key].position_y === void 0) {
          config.prompts[key].position_y = 0;
          flag = true;
        }
        if (config.prompts[key].stream === void 0) {
          config.prompts[key].stream = true;
          flag = true;
        }
        if (config.prompts[key].voice === void 0 || config.prompts[key].voice === null) {
          config.prompts[key].voice = "";
          flag = true;
        }
        if (config.prompts[key].enable === void 0) {
          config.prompts[key].enable = true;
          flag = true;
        }
        if (config.prompts[key].isTemperature === void 0) {
          config.prompts[key].isTemperature = false;
          config.prompts[key].temperature = 0.7;
          flag = true;
        }
        if (config.prompts[key].icon === void 0) {
          config.prompts[key].icon = "";
          flag = true;
        }
        if (config.prompts[key].isDirectSend_file === void 0) {
          if (config.prompts[key].isDirectSend === void 0) {
            config.prompts[key].isDirectSend_file = false;
          } else {
            config.prompts[key].isDirectSend_file = config.prompts[key].isDirectSend;
            delete config.prompts[key].isDirectSend;
          }
          flag = true;
        }
        if (config.prompts[key].isDirectSend_normal === void 0) {
          config.prompts[key].isDirectSend_normal = true;
          flag = true;
        }
        if (config.prompts[key].ifTextNecessary === void 0) {
          config.prompts[key].ifTextNecessary = false;
          flag = true;
        }
        if (config.prompts[key].reasoning_effort === void 0) {
          config.prompts[key].reasoning_effort = "default";
          flag = true;
        }
      }
      if (!config.tags) {
        config.tags = {};
        flag = true;
      }
      if (!config.language) {
        config.language = "zh";
        flag = true;
      }
      if (config.tool_list) {
        delete config.tool_list;
        flag = true;
      }
      if (config.ModelsListByUser) {
        delete config.ModelsListByUser;
        flag = true;
      }
      if (config.promptOrder) {
        delete config.promptOrder;
        flag = true;
      }
      for (let key in config.prompts) {
        if (config.prompts[key].idex || config.prompts[key].idex === 0) {
          delete config.prompts[key].idex;
          flag = true;
        }
      }
      for (let key in config.providers) {
        if (config.providers[key].modelSelect) {
          delete config.providers[key].modelSelect;
          flag = true;
        }
        if (delete config.providers[key].modelListByUser) {
          delete config.providers[key].modelListByUser;
          flag = true;
        }
        if (config.providers[key].enable === void 0) {
          config.providers[key].enable = true;
          flag = true;
        }
      }
      if (config.providerOrder.length === 0) {
        for (let key in config.providers) {
          config.providerOrder.push(key);
        }
        flag = true;
      }
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
        if (config.prompts[key].model) {
          let model = config.prompts[key].model.split("|");
          if (model.length === 2) {
            if (!config.providers[model[0]]) {
              config.prompts[key].model = "";
              flag = true;
            }
          }
        } else {
          config.prompts[key].model = `${config.providerOrder[0]}|${config.providers[config.providerOrder[0]].modelList[0]}`;
          flag = true;
        }
        if (config.prompts[key].model === "") {
          config.prompts[key].model = `${config.providerOrder[0]}|${config.providers[config.providerOrder[0]].modelList[0]}`;
          flag = true;
        }
      }
      if (config.isDarkMode === void 0) {
        config.isDarkMode = false;
        flag = true;
      }
      if (flag) {
        updateConfig({ "config": config });
      }
    }
    function saveSetting(keyPath, value) {
      const rootKey = keyPath.split(".")[0];
      let docId;
      let targetKeyPath = keyPath;
      let isBaseConfig = false;
      if (rootKey === "prompts") {
        docId = "prompts";
        targetKeyPath = keyPath.substring("prompts.".length);
      } else if (rootKey === "providers") {
        docId = "providers";
        targetKeyPath = keyPath.substring("providers.".length);
      } else if (rootKey === "mcpServers") {
        docId = "mcpServers";
        targetKeyPath = keyPath.substring("mcpServers.".length);
      } else {
        docId = "config";
        isBaseConfig = true;
      }
      const doc = utools.db.get(docId);
      if (!doc) {
        console.error(`Config document "${docId}" not found, cannot save setting.`);
        return { success: false, message: `Config document "${docId}" not found` };
      }
      let dataToUpdate = isBaseConfig ? doc.data.config : doc.data;
      const pathParts = targetKeyPath.split(".");
      let current = dataToUpdate;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (current[part] === void 0 || typeof current[part] !== "object") {
          current[part] = {};
        }
        current = current[part];
      }
      current[pathParts[pathParts.length - 1]] = value;
      const result = utools.db.put({
        _id: docId,
        data: doc.data,
        // 直接使用被引用的、已更新的 doc.data
        _rev: doc._rev
      });
      if (result.ok) {
        return { success: true };
      } else {
        console.error(`Failed to save setting to "${docId}"`, result);
        return { success: false, message: result.message };
      }
    }
    function updateConfigWithoutFeatures(newConfig) {
      const plainConfig = JSON.parse(JSON.stringify(newConfig.config));
      const { baseConfigPart, promptsPart, providersPart, mcpServersPart } = splitConfigForStorage(plainConfig);
      let configDoc = utools.db.get("config");
      utools.db.put({
        _id: "config",
        data: baseConfigPart,
        _rev: configDoc ? configDoc._rev : void 0
      });
      let promptsDoc = utools.db.get("prompts");
      utools.db.put({
        _id: "prompts",
        data: promptsPart,
        _rev: promptsDoc ? promptsDoc._rev : void 0
      });
      let providersDoc = utools.db.get("providers");
      utools.db.put({
        _id: "providers",
        data: providersPart,
        _rev: providersDoc ? providersDoc._rev : void 0
      });
      let mcpServersDoc = utools.db.get("mcpServers");
      utools.db.put({
        _id: "mcpServers",
        data: mcpServersPart,
        _rev: mcpServersDoc ? mcpServersDoc._rev : void 0
      });
    }
    function updateConfig(newConfig) {
      const features = utools.getFeatures();
      const featuresMap = new Map(features.map((feature) => [feature.code, feature]));
      const currentPrompts = newConfig.config.prompts || {};
      const enabledPromptKeys = /* @__PURE__ */ new Set();
      for (let key in currentPrompts) {
        const prompt = currentPrompts[key];
        if (prompt.enable) {
          enabledPromptKeys.add(key);
          const featureCode = key;
          const functionCmdCode = key + feature_suffix;
          const expectedMatchFeature = {
            code: featureCode,
            explain: key,
            mainHide: true,
            cmds: [],
            icon: prompt.icon || ""
          };
          if (prompt.type === "general") {
            expectedMatchFeature.cmds.push({ type: "over", label: key, "maxLength": 99999999999 });
            expectedMatchFeature.cmds.push({ type: "img", label: key });
            expectedMatchFeature.cmds.push({ type: "files", label: key, fileType: "file", match: "/\\.(png|jpeg|jpg|webp|docx|xlsx|xls|csv|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue)$/i" });
          } else if (prompt.type === "files") {
            expectedMatchFeature.cmds.push({ type: "files", label: key, fileType: "file", match: "/\\.(png|jpeg|jpg|webp|docx|xlsx|xls|csv|pdf|mp3|wav|txt|md|markdown|json|xml|html|htm|css|yml|py|js|ts|java|c|cpp|h|hpp|cs|go|php|rb|rs|sh|sql|vue)$/i" });
          } else if (prompt.type === "img") {
            expectedMatchFeature.cmds.push({ type: "img", label: key });
          } else if (prompt.type === "over") {
            if (prompt.matchRegex && prompt.matchRegex.trim() !== "") {
              expectedMatchFeature.cmds.push({
                type: "regex",
                label: key,
                match: prompt.matchRegex,
                minLength: 1
              });
            } else {
              expectedMatchFeature.cmds.push({ type: "over", label: key, "maxLength": 99999999999 });
            }
          }
          utools.setFeature(expectedMatchFeature);
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
      for (const [code, feature] of featuresMap) {
        if (code === "Anywhere Settings" || code === "Resume Conversation") continue;
        const promptKey = feature.explain;
        if (!enabledPromptKeys.has(promptKey) || currentPrompts[promptKey] && currentPrompts[promptKey].showMode !== "window" && code.endsWith(feature_suffix)) {
          utools.removeFeature(code);
        }
      }
      updateConfigWithoutFeatures(newConfig);
    }
    function getUser() {
      return utools.getUser();
    }
    function getPosition(config, promptCode) {
      const promptConfig = config.prompts[promptCode];
      const OVERFLOW_ALLOWANCE = 10;
      let width = promptConfig?.window_width || 580;
      let height = promptConfig?.window_height || 740;
      let windowX = 0, windowY = 0;
      const primaryDisplay = utools.getPrimaryDisplay();
      let currentDisplay;
      const hasFixedPosition = config.fix_position && promptConfig && promptConfig.position_x != null && promptConfig.position_y != null;
      if (hasFixedPosition) {
        let set_position = { x: promptConfig.position_x, y: promptConfig.position_y };
        currentDisplay = utools.getDisplayNearestPoint(set_position) || primaryDisplay;
        windowX = Math.floor(promptConfig.position_x);
        windowY = Math.floor(promptConfig.position_y);
      } else {
        const mouse_position = utools.getCursorScreenPoint();
        currentDisplay = utools.getDisplayNearestPoint(mouse_position) || primaryDisplay;
        windowX = Math.floor(mouse_position.x - width / 2);
        windowY = Math.floor(mouse_position.y);
      }
      if (currentDisplay) {
        const display = currentDisplay.bounds;
        if (width > display.width) {
          width = display.width;
        }
        if (height > display.height) {
          height = display.height;
        }
        const minX = display.x - OVERFLOW_ALLOWANCE;
        const maxX = display.x + display.width - width + OVERFLOW_ALLOWANCE;
        const minY = display.y - OVERFLOW_ALLOWANCE;
        const maxY = display.y + display.height - height + OVERFLOW_ALLOWANCE;
        if (windowX + width < display.x || windowX > display.x + display.width || windowY + height < display.y || windowY > display.y + display.height) {
          windowX = display.x + (display.width - width) / 2;
          windowY = display.y + (display.height - height) / 2;
        } else {
          if (windowX < minX) windowX = minX;
          if (windowX > maxX) windowX = maxX;
          if (windowY < minY) windowY = minY;
          if (windowY > maxY) windowY = maxY;
        }
      }
      return { x: Math.round(windowX), y: Math.round(windowY), width, height };
    }
    function saveFastInputWindowPosition2(position) {
      const configDoc = utools.db.get("config");
      if (configDoc) {
        const data = configDoc.data;
        data.config.fastWindowPosition = position;
        utools.db.put({
          _id: "config",
          data,
          _rev: configDoc._rev
        });
      }
    }
    function getFastInputPosition(config) {
      const width = 300;
      const height = 70;
      const primaryDisplay = utools.getPrimaryDisplay();
      const displayBounds = primaryDisplay.bounds;
      let x, y;
      if (config.fastWindowPosition && typeof config.fastWindowPosition.x === "number" && typeof config.fastWindowPosition.y === "number") {
        x = config.fastWindowPosition.x;
        y = config.fastWindowPosition.y;
      } else {
        x = Math.floor(displayBounds.x + (displayBounds.width - width) / 2);
        y = Math.floor(displayBounds.y + displayBounds.height * 0.85);
      }
      const padding = 10;
      if (x < displayBounds.x) x = displayBounds.x + padding;
      if (x + width > displayBounds.x + displayBounds.width) x = displayBounds.x + displayBounds.width - width - padding;
      if (y < displayBounds.y) y = displayBounds.y + padding;
      if (y + height > displayBounds.y + displayBounds.height) y = displayBounds.y + displayBounds.height - height - padding;
      return { x, y, width, height };
    }
    function copyText2(content) {
      utools.copyText(content);
    }
    async function sethotkey(prompt_name, auto_copy) {
      utools.redirectHotKeySetting(prompt_name, auto_copy);
    }
    async function openWindow(config, msg) {
      msg.config = config;
      const promptCode = msg.originalCode || msg.code;
      const { x, y, width, height } = getPosition(config, promptCode);
      const promptConfig = config.prompts[promptCode];
      const isAlwaysOnTop = promptConfig?.isAlwaysOnTop ?? true;
      let channel2 = "window";
      const backgroundColor = config.isDarkMode ? `rgba(24, 24, 24, 1)` : "rgba(255, 255, 255, 1)";
      const senderId2 = crypto.randomUUID();
      msg.senderId = senderId2;
      msg.isAlwaysOnTop = isAlwaysOnTop;
      const windowOptions = {
        show: false,
        backgroundColor,
        title: "Anywhere",
        width,
        height,
        alwaysOnTop: isAlwaysOnTop,
        x,
        y,
        frame: false,
        transparent: false,
        minWidth: 480,
        minHeight: 580,
        // resizable: true,
        webPreferences: {
          preload: "./window_preload.js",
          devTools: true
        }
      };
      const entryPath = config.isDarkMode ? "./window/index.html?dark=1" : "./window/index.html";
      const ubWindow = utools.createBrowserWindow(
        entryPath,
        windowOptions,
        () => {
          windowMap.set(senderId2, ubWindow);
          ubWindow.show();
          ubWindow.webContents.send(channel2, msg);
        }
      );
      ubWindow.webContents.openDevTools({ mode: "detach" });
    }
    async function coderedirect2(label, payload) {
      utools.redirect(label, payload);
    }
    function setZoomFactor(factor) {
      webFrame.setZoomFactor(factor);
    }
    async function savePromptWindowSettings(promptKey, settings) {
      const MAX_RETRIES = 5;
      let attempt = 0;
      while (attempt < MAX_RETRIES) {
        const promptsDoc = utools.db.get("prompts");
        if (!promptsDoc || !promptsDoc.data) {
          return { success: false, message: "Prompts document not found" };
        }
        const promptsData = promptsDoc.data;
        if (!promptsData[promptKey]) {
          return { success: false, message: `Prompt with key '${promptKey}' not found in document` };
        }
        promptsData[promptKey] = {
          ...promptsData[promptKey],
          ...settings
        };
        const result = utools.db.put({
          _id: "prompts",
          data: promptsData,
          _rev: promptsDoc._rev
        });
        if (result.ok) {
          return { success: true, rev: result.rev };
        }
        if (result.error && result.name === "conflict") {
          attempt++;
        } else {
          return { success: false, message: result.message || "An unknown database error occurred." };
        }
      }
      return { success: false, message: `Failed to save settings after ${MAX_RETRIES} attempts due to persistent database conflicts.` };
    }
    async function openFastInputWindow(config, msg) {
      const startTime = performance.now();
      console.log(`[Timer Start] Opening window for code: ${msg.code}`);
      const streamBuffer = [];
      let fastWindowRef = null;
      const sendToWindow = (type, payload) => {
        if (fastWindowRef && !fastWindowRef.isDestroyed()) {
          fastWindowRef.webContents.send("stream-update", { type, payload });
        } else {
          streamBuffer.push({ type, payload });
        }
      };
      requestTextOpenAI(msg.code, msg.content, config).then(async (response) => {
        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }
        const isStream = config.prompts[msg.code].stream ?? true;
        if (isStream) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let boundary = buffer.lastIndexOf("\n");
            if (boundary !== -1) {
              const completeData = buffer.substring(0, boundary);
              buffer = buffer.substring(boundary + 1);
              const lines = completeData.split("\n").filter((line) => line.trim() !== "");
              for (const line of lines) {
                const message = line.replace(/^data: /, "");
                if (message === "[DONE]") break;
                try {
                  const parsed = JSON.parse(message);
                  if (parsed.choices[0].delta.content) {
                    const chunk = parsed.choices[0].delta.content;
                    sendToWindow("chunk", chunk);
                  }
                } catch (e) {
                }
              }
            }
          }
        } else {
          const data = await response.json();
          const fullText = data.choices[0].message.content || "";
          sendToWindow("chunk", fullText);
        }
        isStreamEnded = true;
        sendToWindow("done", null);
      }).catch((error) => {
        console.error("FastWindow AI Request Error:", error);
        streamError = error.message;
        sendToWindow("error", error.message);
      });
      msg.config = config;
      const { x, y, width, height } = getFastInputPosition(config);
      let channel2 = "fast-window";
      const senderId2 = crypto.randomUUID();
      msg.senderId = senderId2;
      const windowOptions = {
        show: true,
        width,
        height,
        useContentSize: true,
        alwaysOnTop: true,
        x,
        y,
        frame: false,
        transparent: true,
        hasShadow: false,
        backgroundColor: config.isDarkMode ? "rgba(0, 0, 0, 0)" : "rgba(255, 255, 255, 0)",
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
          preload: "./fast_window_preload.js",
          devTools: true
        }
      };
      const entryPath = "./fast_window/fast_input.html";
      const fastWindow = utools.createBrowserWindow(
        entryPath,
        windowOptions,
        () => {
          fastWindowRef = fastWindow;
          windowMap.set(senderId2, fastWindow);
          fastWindow.webContents.send(channel2, msg);
          if (streamBuffer.length > 0) {
            streamBuffer.forEach((item) => {
              fastWindow.webContents.send("stream-update", item);
            });
            streamBuffer.length = 0;
          }
          const windowShownTime = performance.now();
          console.log(`[Timer Checkpoint] utools.createBrowserWindow callback executed. Elapsed: ${(windowShownTime - startTime).toFixed(2)} ms`);
        }
      );
      fastWindow.webContents.openDevTools({ mode: "detach" });
    }
    module2.exports = {
      getConfig,
      checkConfig,
      updateConfig,
      saveSetting,
      updateConfigWithoutFeatures,
      savePromptWindowSettings,
      getUser,
      copyText: copyText2,
      sethotkey,
      openWindow,
      coderedirect: coderedirect2,
      setZoomFactor,
      feature_suffix,
      defaultConfig,
      windowMap,
      saveFastInputWindowPosition: saveFastInputWindowPosition2,
      openFastInputWindow
    };
  }
});

// src/fast_window_preload.js
var { ipcRenderer } = require("electron");
var {
  saveFastInputWindowPosition,
  copyText,
  coderedirect
} = require_data();
var channel = "fast-window";
var senderId = null;
window.preload = {
  // 接收初始化消息 (Config, Code 等)
  receiveMsg: (callback) => {
    ipcRenderer.on(channel, (event, data) => {
      if (data) {
        if (data.senderId) {
          senderId = data.senderId;
        }
        callback(data);
      }
    });
  },
  // [新增] 接收流式数据更新
  onStreamUpdate: (callback) => {
    ipcRenderer.on("stream-update", (event, data) => {
      callback(data);
    });
  }
};
window.api = {
  copyText,
  coderedirect,
  typeText: (text) => {
    utools.hideMainWindowPasteText(text);
  },
  // 关闭窗口并保存位置
  closeWindow: (pos) => {
    if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
      saveFastInputWindowPosition({ x: pos.x, y: pos.y });
    }
    if (senderId) {
      utools.sendToParent("window-event", { senderId, event: "close-window" });
    } else {
      window.close();
    }
  }
};
