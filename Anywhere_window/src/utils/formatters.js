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