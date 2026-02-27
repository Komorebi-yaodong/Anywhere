/**
 * 格式化时间戳
 * @param {string} dateString 
 * @returns {string}
 */
export const formatTimestamp = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        const datePart = date.toLocaleDateString('sv-SE');
        const timePart = date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
        return `${datePart} ${timePart}`;
    } catch (e) {
        return '';
    }
};

/**
 * 格式化消息文本内容（提取纯文本）
 * @param {string|Array} content 
 * @returns {string}
 */
export const formatMessageText = (content) => {
    if (!content) return "";
    if (!Array.isArray(content)) return String(content);

    let textString = "";
    content.forEach(part => {
        if (part.type === 'text' && part.text && !(part.text.toLowerCase().startsWith('file name:') && part.text.toLowerCase().endsWith('file end'))) {
            textString += part.text;
        }
    });
    return textString.trim();
};

/**
 * 安全修复并格式化工具参数 JSON
 * @param {string} jsonString 
 * @returns {string}
 */
export const sanitizeToolArgs = (jsonString) => {
    if (!jsonString) return "{}";
    try {
        JSON.parse(jsonString);
        return jsonString; // 如果是合法JSON，直接返回原字符串（也可以选择格式化）
    } catch (e) {
        let startIndex = jsonString.indexOf('{');
        if (startIndex === -1) return "{}";

        let braceCount = 0;
        for (let i = startIndex; i < jsonString.length; i++) {
            if (jsonString[i] === '{') braceCount++;
            else if (jsonString[i] === '}') braceCount--;

            if (braceCount === 0) {
                const potential = jsonString.substring(startIndex, i + 1);
                try {
                    JSON.parse(potential);
                    return potential;
                } catch (innerE) {
                    return "{}";
                }
            }
        }
        return "{}";
    }
};

/**
 * 格式化工具执行结果
 * 尝试解析 JSON，如果包含 text 类型的内容，则只提取文本展示
 * @param {string} resultString 
 * @returns {string}
 */
export const formatToolResult = (resultString) => {
    if (!resultString) return "";
    
    let str = resultString;
    // 确保是字符串
    if (typeof str !== 'string') {
        try {
            str = JSON.stringify(str);
        } catch (e) {
            return String(str);
        }
    }

    const trimmed = str.trim();
    // 简单判断是否像 JSON (数组或对象)
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            
            // 情况 1: 数组结构 (常见 MCP 返回) -> [{ type: 'text', text: '...' }]
            if (Array.isArray(parsed)) {
                const texts = parsed
                    .filter(item => item && item.type === 'text' && typeof item.text === 'string')
                    .map(item => item.text);
                
                // 如果提取到了文本，合并显示
                if (texts.length > 0) {
                    return texts.join('\n\n');
                }
            } 
            // 情况 2: 对象结构 -> { type: 'text', text: '...' } 或 { content: [...] }
            else if (typeof parsed === 'object' && parsed !== null) {
                // 直接的 Content 对象
                if (parsed.type === 'text' && typeof parsed.text === 'string') {
                    return parsed.text;
                }
                // CallToolResult 结构
                if (Array.isArray(parsed.content)) {
                     const texts = parsed.content
                        .filter(item => item && item.type === 'text' && typeof item.text === 'string')
                        .map(item => item.text);
                    if (texts.length > 0) {
                        return texts.join('\n\n');
                    }
                }
            }
        } catch (e) {
            // 解析失败则保留原样 (可能是普通文本刚好以 [ 或 { 开头)
        }
    }
    
    // 默认返回原字符串
    return str;
};