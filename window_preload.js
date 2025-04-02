const { ipcRenderer } = require('electron');

const {
    getConfig,
    updateConfig,
    getRandomItem
} = require('./data.js');

const channel = "window";

window.preload = {
    receiveMsg: (callback) => {
        ipcRenderer.on(channel, (event, res) => {
            parentId = event.senderId;
            if (res) {
                callback(res);
            }
        })
    }
}

window.api = {
    getConfig, // 添加 getConfig 到 api
    updateConfig, // 添加 updateConfig 到 api
};

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
async function requestTextOpenAI(code, text, config, signal) {
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
            Authorization: "Bearer " + getRandomItem(apiKey),
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
async function requestImageOpenAI(code, imagePath, config, signal) {
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
            Authorization: "Bearer " + getRandomItem(apiKey),
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
async function requestAskOpenAI(history, config, modelInfo, signal) { // 添加 signal 参数
    let apiUrl = config.apiUrl;
    let apiKey = config.apiKey;
    let model = config.modelSelect;
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
            'Authorization': 'Bearer ' + getRandomItem(apiKey)
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
    requestTextOpenAI, // 添加 handleTextOpenAI 到 api
    requestImageOpenAI, // 添加 handleImageOpenAI 到 api
    showSuccess,    // 添加 showSuccess 到 api
    requestAskOpenAI, // 添加 requestAskOpenAI 到 api
};