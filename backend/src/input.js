function getRandomItem(list) {
  // 检查list是不是字符串
  if (typeof list === "string") {
    // 如果字符串包含逗号
    if (list.includes(",")) {
      list = list.split(",");
      // 删除空白字符
      list = list.filter(item => item.trim() !== "");
    }
    else if (list.includes("，")) {
      list = list.split("，");
      // 删除空白字符
      list = list.filter(item => item.trim() !== "");
    }
    else {
      return list;
    }
  }

  if (list.length === 0) {
    return "";
  }
  else {
    const resault = list[Math.floor(Math.random() * list.length)];
    return resault;
  }
}

// 函数：处理文本
async function requestTextOpenAI(code, content, config) {
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
    if (config.prompts[code] && config.prompts[code].ifTextNecessary) {
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        // 如果是字符串
        if (typeof content === "string") {
            content = timestamp + "\n\n" + content;
        }
        else if (Array.isArray(content)) {
            let flag = false;
            for (let i = 0; i < content.length; i++) {
                // 是文本类型，且不是文本文件
                if (content[i].type === "content" && content[i].text && !(content[i].text.toLowerCase().startsWith('file name:') && content[i].text.toLowerCase().endsWith('file end'))) {
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
                    content: content,
                },
            ],
            stream: isStream,
        }),
    });
    return response;
}

module.exports = {
    requestTextOpenAI,
    getRandomItem,
};