const {
    getRandomItem
  } = require('./data.js');

// 函数：处理文本
async function requestTextOpenAI(code, text, config) {
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
    console.log({
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
        });
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
            stream: config.stream,
        }),
    });
    return response;
}

// 函数：处理图片
async function requestImageOpenAI(code, imagePath, config) {
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
                    // openrouter的特殊处理
                    if (completeData.trim() === ": OPENROUTER PROCESSING") {
                        continue
                    }
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
                                
                                if(output.trim() === "<think>" && !is_think_flag) {  // 思考开始
                                    is_think_flag = true;
                                }
                                else if (output.trim() === "</think>" && is_think_flag) {  // 思考中
                                    is_think_flag = false;
                                }
                                else if (is_think_flag) {  // 思考结束
                                }
                                else{  // 非思考阶段
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

module.exports = {
    requestTextOpenAI,
    requestImageOpenAI,
    handelReplyOpenAI
};