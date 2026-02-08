const { OpenAI } = require('openai');

/**
 * 随机获取列表中的一项（用于 API Key 负载均衡）
 * @param {string|Array} list
 */
function getRandomItem(list) {
    if (!list) return "";
    if (Array.isArray(list)) {
        if (list.length === 0) return "";
        return list[Math.floor(Math.random() * list.length)];
    }
    if (typeof list === "string") {
        // 支持中文或英文逗号分隔
        const separator = list.includes("，") ? "，" : ",";
        const items = list.split(separator).filter(item => item.trim() !== "");
        if (items.length === 0) return "";
        return items[Math.floor(Math.random() * items.length)].trim();
    }
    return list;
}

/**
 * 适配 Chat Completions 的 tools 格式到 Responses API 格式
 * Responses API 的 function 定义是扁平的，不需要外层的 type: 'function' 包裹
 */
function adaptToolsForResponses(tools) {
    if (!tools || !Array.isArray(tools)) return undefined;
    return tools.map(t => {
        if (t.type === 'function' && t.function) {
            return {
                type: 'function',
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
                // Responses API 默认为 strict: true，但如果使用了 strict 则 schema 必须符合严格标准
                // 这里为了兼容性，如果原配置有 strict 则传递，否则不传（让 API 决定或非严格）
                strict: t.function.strict
            };
        }
        return t;
    });
}

/**
 * 将 Chat Completions 格式的消息历史转换为 Responses API 的 Input Items
 */
function convertMessagesToResponsesInput(messages) {
    const inputItems = [];

    for (const msg of messages) {
        // 1. Role 映射 (Responses API 使用 developer 代替 system)
        let role = msg.role;
        if (role === 'system') role = 'developer';

        // 2. 处理工具返回结果 (保持 type: function_call_output)
        if (role === 'tool') {
            inputItems.push({
                type: "function_call_output",
                call_id: msg.tool_call_id,
                output: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
            });
            continue;
        }

        // 3. 处理常规消息 (User / Assistant / Developer)
        if (role === 'assistant' || role === 'user' || role === 'developer') {
            let contentList = [];
            
            // [关键修复] 根据角色决定文本类型
            // Assistant 的输出历史必须标记为 output_text，用户的输入标记为 input_text
            const textType = role === 'assistant' ? 'output_text' : 'input_text';

            // 情况A: 字符串内容
            if (typeof msg.content === 'string') {
                if (msg.content) {
                    contentList.push({ type: textType, text: msg.content });
                }
            } 
            // 情况B: 数组内容 -> 逐项转换类型
            else if (Array.isArray(msg.content)) {
                for (const item of msg.content) {
                    // 文本转换
                    if (item.type === 'text') {
                        contentList.push({ type: textType, text: item.text });
                    } 
                    // 图片/文件转换 (仅限非 Assistant 角色，Assistant 历史通常不包含输入型多模态数据)
                    else if (role !== 'assistant') {
                        if (item.type === 'image_url') {
                            const url = item.image_url?.url || item.image_url;
                            contentList.push({
                                type: "input_image",
                                image_url: url
                            });
                        } 
                        else if (item.type === 'file' || item.type === 'input_file') {
                            const f = item.file || item;
                            contentList.push({
                                type: "input_file",
                                filename: f.filename || f.name,
                                file_data: f.file_data || f.url
                            });
                        }
                        else {
                            // 保留其他可能的类型 (如 input_audio)
                            contentList.push(item);
                        }
                    }
                }
            }

            // 只有当 contentList 不为空时才添加 message item
            if (contentList.length > 0) {
                inputItems.push({
                    role: role,
                    content: contentList
                });
            }

            // 4. 特殊处理 Assistant 的工具调用 (保持 type: function_call)
            // 在 Responses API 中，function_call 是独立的 item，跟在 message item 后面
            if (role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
                for (const tc of msg.tool_calls) {
                    inputItems.push({
                        type: "function_call",
                        call_id: tc.id,
                        name: tc.function.name,
                        arguments: tc.function.arguments
                    });
                }
            }
        }
    }
    return inputItems;
}

/**
 * 创建并执行聊天请求
 * @param {object} params - 请求参数
 * @param {string} params.baseUrl - API 基础地址
 * @param {string|Array} params.apiKey - API 密钥 (支持多 Key)
 * @param {string} params.model - 模型名称
 * @param {Array} params.messages - 消息列表
 * @param {string} [params.apiType='chat_completions'] - API 类型: 'chat_completions' | 'responses'
 * @param {boolean} [params.stream=true] - 是否流式
 * @param {number} [params.temperature] - 温度
 * @param {string} [params.reasoning_effort] - 推理强度 (o1/o3 模型)
 * @param {Array} [params.tools] - 工具列表
 * @param {string|object} [params.tool_choice] - 工具选择策略
 * @param {object} [params.audio] - 音频配置
 * @param {Array} [params.modalities] - 模态配置
 * @param {AbortSignal} [params.signal] - 中断信号
 * @returns {Promise<any>} 返回流(Stream)或完整响应对象
 */
async function createChatCompletion(params) {
    const {
        baseUrl,
        apiKey,
        signal,
        apiType = 'chat_completions',
        ...openAiParams
    } = params;

    const client = new OpenAI({
        baseURL: baseUrl,
        apiKey: getRandomItem(apiKey), // 自动处理多 Key
        dangerouslyAllowBrowser: true, // 允许在 Electron 渲染进程(如 preload)中使用
        maxRetries: 3
    });

    try {
        if (apiType === 'responses') {
            // [关键] 转换历史消息格式
            const convertedInput = convertMessagesToResponsesInput(openAiParams.messages);

            // Responses API 参数映射
            const responseParams = {
                model: openAiParams.model,
                input: convertedInput,
                stream: params.stream ?? true
            };

            // 可选参数映射
            if (openAiParams.tools) {
                responseParams.tools = adaptToolsForResponses(openAiParams.tools);
            }

            // 处理 tool_choice
            // Chat Completions: "auto" / "none" / { type: "function", function: { name: "..." } }
            // Responses: "auto" / "none" / "required" / { type: "function", name: "..." }
            if (openAiParams.tool_choice) {
                if (typeof openAiParams.tool_choice === 'object' && openAiParams.tool_choice.function) {
                    responseParams.tool_choice = {
                        type: 'function',
                        name: openAiParams.tool_choice.function.name
                    };
                } else {
                    responseParams.tool_choice = openAiParams.tool_choice;
                }
            }

            // 处理推理配置
            if (openAiParams.reasoning_effort) {
                responseParams.reasoning = { effort: openAiParams.reasoning_effort };
            }

            // 处理 Temperature
            if (openAiParams.temperature !== undefined) {
                responseParams.temperature = openAiParams.temperature;
            }

            return await client.responses.create(responseParams, { signal });
        } else {
            // 标准 Chat Completions API
            return await client.chat.completions.create(
                {
                    ...openAiParams,
                    stream: params.stream ?? true
                },
                { signal }
            );
        }
    } catch (error) {
        console.error("[Chat] Request failed:", error);
        throw error;
    }
}

module.exports = {
    createChatCompletion,
    getRandomItem
};