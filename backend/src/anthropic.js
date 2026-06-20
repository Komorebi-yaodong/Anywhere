const AnthropicModule = require('@anthropic-ai/sdk');
// 兼容不同打包形态：默认导出 / 命名导出 / 直接构造函数
const Anthropic = AnthropicModule?.Anthropic || AnthropicModule?.default || AnthropicModule;

const DEFAULT_MAX_TOKENS = 8192;

// 独立实现，避免与 chat.js 循环依赖
function pickApiKey(list) {
    if (!list) return '';
    if (Array.isArray(list)) {
        const items = list.filter((item) => typeof item === 'string' && item.trim());
        return items.length ? items[Math.floor(Math.random() * items.length)] : '';
    }
    if (typeof list === 'string') {
        const separator = list.includes('，') ? '，' : ',';
        const items = list.split(separator).map((s) => s.trim()).filter(Boolean);
        return items.length ? items[Math.floor(Math.random() * items.length)] : '';
    }
    return '';
}

// data:image/png;base64,xxx → Anthropic image source；http(s) → url source
function buildAnthropicImageBlock(url) {
    if (typeof url !== 'string' || !url) return null;
    const dataUrlMatch = url.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
        return {
            type: 'image',
            source: { type: 'base64', media_type: dataUrlMatch[1], data: dataUrlMatch[2] }
        };
    }
    if (/^https?:\/\//i.test(url)) {
        return { type: 'image', source: { type: 'url', url } };
    }
    return null;
}

// 把 OpenAI 消息 content（string | array）转为 Anthropic content blocks
function convertContentToBlocks(content) {
    if (typeof content === 'string') {
        return content ? [{ type: 'text', text: content }] : [];
    }
    if (!Array.isArray(content)) return [];

    const blocks = [];
    for (const item of content) {
        if (!item || typeof item !== 'object') continue;
        if (item.type === 'text' && item.text) {
            blocks.push({ type: 'text', text: item.text });
        } else if (item.type === 'image_url') {
            const url = typeof item.image_url === 'string' ? item.image_url : item.image_url?.url;
            const block = buildAnthropicImageBlock(url);
            if (block) blocks.push(block);
        }
        // 其余类型（audio/file 等）Anthropic 不支持，跳过
    }
    return blocks;
}

function safeParseJson(text) {
    if (typeof text !== 'string' || !text.trim()) return {};
    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

// OpenAI messages → { system, messages(Anthropic) }
function convertMessagesToAnthropic(messages = []) {
    const systemParts = [];
    const result = [];

    const pushMessage = (role, blocks) => {
        if (!blocks || blocks.length === 0) return;
        // 合并连续同 role 消息，满足 Anthropic 交替/聚合要求（尤其 tool_result）
        const last = result[result.length - 1];
        if (last && last.role === role) {
            last.content.push(...blocks);
        } else {
            result.push({ role, content: [...blocks] });
        }
    };

    for (const msg of messages) {
        if (!msg || typeof msg !== 'object') continue;
        const role = msg.role;

        if (role === 'system' || role === 'developer') {
            const text = typeof msg.content === 'string'
                ? msg.content
                : convertContentToBlocks(msg.content).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
            if (text) systemParts.push(text);
            continue;
        }

        if (role === 'tool') {
            // OpenAI tool 结果 → Anthropic user 消息里的 tool_result block
            pushMessage('user', [{
                type: 'tool_result',
                tool_use_id: msg.tool_call_id,
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '')
            }]);
            continue;
        }

        if (role === 'assistant') {
            const blocks = convertContentToBlocks(msg.content);
            if (Array.isArray(msg.tool_calls)) {
                for (const tc of msg.tool_calls) {
                    if (tc?.type === 'function' && tc.function?.name) {
                        blocks.push({
                            type: 'tool_use',
                            id: tc.id,
                            name: tc.function.name,
                            input: safeParseJson(tc.function.arguments)
                        });
                    }
                }
            }
            pushMessage('assistant', blocks);
            continue;
        }

        // user（及其它）
        pushMessage('user', convertContentToBlocks(msg.content));
    }

    return {
        system: systemParts.join('\n\n').trim(),
        messages: result
    };
}

// OpenAI function tools → Anthropic tools
function convertToolsToAnthropic(tools) {
    if (!Array.isArray(tools)) return undefined;
    const converted = tools
        .filter((t) => t?.type === 'function' && t.function?.name)
        .map((t) => ({
            name: t.function.name,
            description: t.function.description || '',
            input_schema: t.function.parameters || { type: 'object', properties: {} }
        }));
    return converted.length ? converted : undefined;
}

function convertToolChoice(toolChoice) {
    if (!toolChoice) return undefined;
    if (toolChoice === 'auto') return { type: 'auto' };
    if (toolChoice === 'required') return { type: 'any' };
    if (toolChoice === 'none') return undefined;
    if (typeof toolChoice === 'object' && toolChoice.function?.name) {
        return { type: 'tool', name: toolChoice.function.name };
    }
    return undefined;
}

function buildAnthropicRequest(openAiParams) {
    const { system, messages } = convertMessagesToAnthropic(openAiParams.messages);
    const request = {
        model: openAiParams.model,
        max_tokens: openAiParams.max_tokens || openAiParams.max_completion_tokens || DEFAULT_MAX_TOKENS,
        messages
    };
    if (system) request.system = system;
    if (openAiParams.temperature !== undefined) request.temperature = openAiParams.temperature;

    const tools = convertToolsToAnthropic(openAiParams.tools);
    if (tools) {
        request.tools = tools;
        const toolChoice = convertToolChoice(openAiParams.tool_choice);
        if (toolChoice) request.tool_choice = toolChoice;
    }

    return request;
}

function mapUsage(anthropicUsage) {
    if (!anthropicUsage) return undefined;
    const prompt = anthropicUsage.input_tokens || 0;
    const completion = anthropicUsage.output_tokens || 0;
    return {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: prompt + completion
    };
}

// Anthropic 流式事件 → chat_completions chunk（供 App.vue else 分支无感消费）
async function* streamAnthropicAsOpenAI(anthropicStream) {
    const blockIndexToToolIndex = new Map();
    let toolCount = 0;
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const event of anthropicStream) {
        if (!event || typeof event !== 'object') continue;

        if (event.type === 'message_start') {
            promptTokens = event.message?.usage?.input_tokens || 0;
        } else if (event.type === 'content_block_start') {
            const block = event.content_block;
            if (block?.type === 'tool_use') {
                const toolIndex = toolCount++;
                blockIndexToToolIndex.set(event.index, toolIndex);
                yield {
                    choices: [{
                        index: 0,
                        delta: { tool_calls: [{ index: toolIndex, id: block.id, type: 'function', function: { name: block.name || '', arguments: '' } }] }
                    }]
                };
            }
        } else if (event.type === 'content_block_delta') {
            const delta = event.delta;
            if (delta?.type === 'text_delta') {
                yield { choices: [{ index: 0, delta: { content: delta.text || '' } }] };
            } else if (delta?.type === 'thinking_delta') {
                yield { choices: [{ index: 0, delta: { reasoning_content: delta.thinking || '' } }] };
            } else if (delta?.type === 'input_json_delta') {
                const toolIndex = blockIndexToToolIndex.get(event.index);
                if (toolIndex !== undefined) {
                    yield { choices: [{ index: 0, delta: { tool_calls: [{ index: toolIndex, function: { arguments: delta.partial_json || '' } }] } }] };
                }
            }
        } else if (event.type === 'message_delta') {
            if (typeof event.usage?.output_tokens === 'number') {
                completionTokens = event.usage.output_tokens;
            }
        }
    }

    // 末尾补一个带完整 usage 的 chunk
    yield {
        choices: [{ index: 0, delta: {} }],
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens }
    };
}

// Anthropic 非流式 message → chat_completions response
function convertAnthropicMessageToOpenAI(message) {
    let content = '';
    let reasoning = '';
    const toolCalls = [];

    for (const block of message?.content || []) {
        if (block.type === 'text') content += block.text || '';
        else if (block.type === 'thinking') reasoning += block.thinking || '';
        else if (block.type === 'tool_use') {
            toolCalls.push({
                id: block.id,
                type: 'function',
                function: { name: block.name, arguments: JSON.stringify(block.input || {}) }
            });
        }
    }

    return {
        choices: [{
            index: 0,
            message: {
                role: 'assistant',
                content: content || null,
                reasoning_content: reasoning || null,
                tool_calls: toolCalls.length ? toolCalls : undefined
            },
            finish_reason: message?.stop_reason || 'stop'
        }],
        usage: mapUsage(message?.usage)
    };
}

/**
 * 通过 Anthropic SDK 发起 Claude 原生协议请求，并把响应适配为 OpenAI Chat Completions 形态。
 * 流式返回 async generator（chat_completions chunk）；非流式返回 chat_completions response。
 * 插件端使用 SDK 默认 fetch（dangerouslyAllowBrowser），无需 net.js 桥接。
 */
async function createAnthropicCompletion(params = {}) {
    const { baseUrl, apiKey, signal, stream = true, headers: providerHeaders, ...openAiParams } = params;

    const clientOptions = {
        apiKey: pickApiKey(apiKey),
        maxRetries: 3,
        dangerouslyAllowBrowser: true
    };
    if (baseUrl && typeof baseUrl === 'string') {
        // Anthropic SDK 会自动追加 /v1/messages，去掉用户 URL 末尾的 /v1 避免出现 /v1/v1/messages
        clientOptions.baseURL = baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
    }
    if (providerHeaders && typeof providerHeaders === 'object') {
        clientOptions.defaultHeaders = providerHeaders;
    }

    const client = new Anthropic(clientOptions);
    const request = buildAnthropicRequest(openAiParams);

    if (stream) {
        const anthropicStream = await client.messages.create({ ...request, stream: true }, { signal });
        return streamAnthropicAsOpenAI(anthropicStream);
    }

    const message = await client.messages.create(request, { signal });
    return convertAnthropicMessageToOpenAI(message);
}

module.exports = {
    createAnthropicCompletion
};
