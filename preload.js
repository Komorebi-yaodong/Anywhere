const defaultConfig = {
    config:{
        apiUrl:"https://api.openai.com/v1",
        apiKey:"sk-xxxxxx",
        modelList:[],
        modelSelect:"gpt-4o-mini",
        prompts:{
            Completion:["over",`你是一个文本续写模型，用户会输入内容，请你根据用户提供的内容完成续写。续写的内容要求符合语境语义，与前文连贯。注意续写不要重复已经提供的内容，只执行续写操作，不要有任何多余的解释。`]
        },
        stream:true
    }
}

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
            cmds: [{type:newConfig.config.prompts[key][0],label: key}]
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

window.api = {
    getConfig,        // 添加 getConfig 到 api
    updateConfig,     // 添加 updateConfig 到 api
};

utools.onPluginEnter(async ({ code, type, payload, option }) => {

    if (code !== "Anywhere Settings") {
        utools.hideMainWindow(true);
        config = window.api.getConfig().config;
        // 函数：处理文本
        async function handleText(text,config) {
            try {
                const response = await fetch(config.apiUrl + '/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + config.apiKey
                    },
                    body: JSON.stringify({
                        model: config.modelSelect,
                        messages: [
                            {
                                role: "system",
                                content: config.prompts[code][1]
                            },
                            {
                                role: "user",
                                content: text
                            }
                        ],
                        stream: config.stream
                    })
                });
                if (!response.ok) {
                    utools.showNotification(`HTTP error! status: ${response.status}`);
                    utools.outPlugin();
                    return;
                }
                if (config.stream) {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder("utf-8");
                    let buffer = "";
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

                            const lines = completeData.split("\n").filter(line => line.trim() !== "");
                            for (const line of lines) {
                                const message = line.replace(/^data: /, "");
                                if (message === "[DONE]") {
                                    break;
                                }
                                try {
                                    const parsed = JSON.parse(message);
                                    if (parsed.choices[0].delta.content) {
                                        utools.hideMainWindowTypeString(parsed.choices[0].delta.content);
                                    }
                                } catch (error) {
                                    utools.showNotification("Could not parse stream message", message, error);
                                    utools.outPlugin();
                                    return;
                                }
                            }
                        }
                    }
                    utools.showNotification(code + " successfully!");
                }
                else {
                    const data = await response.json();
                    utools.hideMainWindowTypeString(data.choices[0].message.content);
                    utools.showNotification(code + " successfully!");
                }
            } catch (error) {
                utools.showNotification("error: " + error);
                utools.outPlugin();
                return;
            } finally {
                utools.outPlugin();
                return;
            }
        }

        // 函数：处理图片
        async function handleImage(imagePath,config) {
            const base64Image = imagePath
            try {
                const response = await fetch(config.apiUrl + '/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + config.apiKey
                    },
                    body: JSON.stringify({
                        model: config.modelSelect,
                        messages: [
                            {
                                role:"system",
                                content: config.prompts[code][1]
                            },
                            {
                                role: "user",
                                content: [
                                    {
                                        type:"text",
                                        text: config.prompts[code][1]
                                    },
                                    {
                                        type: "image_url",
                                        image_url:{
                                            url: base64Image
                                        }
                                    }
                                ]
                            }
                        ],
                        stream: config.stream
                    })
                });
                if (!response.ok) {
                    utools.showNotification(`HTTP error! status: ${response.status}`);
                    utools.outPlugin();
                    return;
                }
                if (config.stream) {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder("utf-8");
                    let buffer = "";
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

                            const lines = completeData.split("\n").filter(line => line.trim() !== "");
                            for (const line of lines) {
                                const message = line.replace(/^data: /, "");
                                if (message === "[DONE]") {
                                    break;
                                }
                                try {
                                    const parsed = JSON.parse(message);
                                    if (parsed.choices[0].delta.content) {
                                        utools.hideMainWindowTypeString(parsed.choices[0].delta.content);
                                    }
                                } catch (error) {
                                    utools.showNotification("Could not parse stream message", message, error);
                                    utools.outPlugin();
                                    return;
                                }
                            }
                        }
                    }
                    utools.showNotification(code + " successfully!");
                } else {
                    const data = await response.json();
                    utools.hideMainWindowTypeString(data.choices[0].message.content);
                    utools.showNotification(code + " successfully!");
                }
            }catch (error) {
                utools.showNotification("error: " + error);
                utools.outPlugin();
                return;
            }finally {
                utools.outPlugin();
                return;
            }
        }
        if (type === "over") {
            await handleText(payload,config);
        } else if (type === "img") {
            await handleImage(payload,config);
        } else {
            utools.showNotification("Unsupported input type");
            utools.outPlugin();
        }
    }
});
