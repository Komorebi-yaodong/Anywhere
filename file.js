const fs = require('fs/promises');
const path = require('path');


const parseTextFile = async (base64Data) => {
    const s = base64Data.split(',')[1]; if (!s) throw new Error("Invalid base64 data for text file");
    const bs = atob(s); const ia = new Uint8Array(bs.length); for (let i = 0; i < bs.length; i++) ia[i] = bs.charCodeAt(i);
    return new TextDecoder().decode(ia);
};

// [NEW & IMPROVED] Centralized file handling configuration
const fileHandlers = {
    text: {
        extensions: [
            // Common text files
            '.txt', '.md', '.markdown', '.json', '.xml', '.html', '.css', '.csv',
            // Common code files
            '.py', '.js', '.ts', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go',
            '.php', '.rb', '.rs', '.sh', '.sql', '.vue'
        ],
        handler: async (file) => {
            const textContent = await parseTextFile(file.url);
            return { type: "text", text: `file name:${file.name}\nfile content:${textContent}\nfile end` };
        }
    },
    // docx: {
    //     extensions: ['.docx'],
    //     handler: async (file) => {
    //         const textContent = await parseWord(file.url);
    //         return { type: "text", text: `file name:${file.name}\nfile content:${textContent}\nfile end` };
    //     }
    // },
    image: {
        extensions: ['.png', '.jpg', '.jpeg', '.webp'], // Strictly adhere to original types
        handler: async (file) => {
            return { type: "image_url", image_url: { url: file.url } };
        }
    },
    audio: {
        extensions: ['.mp3', '.wav'], // Strictly adhere to original types
        handler: async (file) => {
            const commaIndex = file.url.indexOf(',');
            if (commaIndex > -1) {
                return {
                    type: "input_audio",
                    input_audio: {
                        data: file.url.substring(commaIndex + 1),
                        format: file.name.split('.').pop().toLowerCase()
                    }
                };
            }
            console.log(`音频文件 ${file.name} 格式不正确`);
            return null;
        }
    },
    pdf: {
        extensions: ['.pdf'],
        handler: async (file) => {
            const commaIndex = file.url.indexOf(',');
            if (commaIndex > -1) {
                return {
                    type: "input_file",
                    filename: file.name,
                    file_data: file.url.substring(commaIndex + 1)
                };
            }
            console.log(`PDF文件 ${file.name} 格式不正确`);
            return null;
        }
    }
};

// [NEW & IMPROVED] Helper function to get the correct handler for a file
const getFileHandler = (fileName) => {
    if (!fileName) return null;
    const extension = ('.' + fileName.split('.').pop()).toLowerCase();
    for (const category in fileHandlers) {
        if (fileHandlers[category].extensions.includes(extension)) {
            return fileHandlers[category].handler;
        }
    }
    return null;
};


async function sendFile(fileList) {
    let contentList = [];
    if (fileList.length === 0) return contentList;

    for (const currentFile of fileList) {
        const handler = getFileHandler(currentFile.name);
        if (handler) {
            try {
                const processedContent = await handler(currentFile);
                if (processedContent) {
                    contentList.push(processedContent);
                }
            } catch (error) {
                console.log(`处理文件 ${currentFile.name} 失败: ${error.message}`);
            }
        } else {
            console.log(`文件类型不支持: ${currentFile.name}`);
        }
    }
    return contentList;
}

const extensionToMimeType = {
    // 文本和代码
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.csv': 'text/csv',
    '.py': 'text/plain', // 或 'application/x-python'
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.java': 'text/x-java-source',
    '.c': 'text/plain',
    '.cpp': 'text/plain',
    '.h': 'text/plain',
    '.hpp': 'text/plain',
    '.cs': 'text/plain',
    '.go': 'text/plain',
    '.php': 'application/x-httpd-php',
    '.rb': 'application/x-ruby',
    '.rs': 'text/rust',
    '.sh': 'application/x-sh',
    '.sql': 'application/sql',
    '.vue': 'text/plain',

    // 文档
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pdf': 'application/pdf',

    // 图片
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',

    // 音频
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
};

/**
 * [新增] 核心函数：将文件路径转换为 File 对象。
 * @param {string} filePath - 文件的绝对路径。
 * @returns {Promise<File|null>} - 返回一个可供前端使用的 File 对象，如果失败则返回 null。
 */
const handleFilePath = async (filePath) => {
    try {
        // 1. 验证路径是否存在
        await fs.access(filePath);

        // 2. 读取文件内容到 Buffer
        const fileBuffer = await fs.readFile(filePath);

        // 3. 获取文件名
        const fileName = path.basename(filePath);

        // 4. 获取文件后缀并查找对应的 MIME 类型
        const extension = path.extname(fileName).toLowerCase();
        const mimeType = extensionToMimeType[extension] || 'application/octet-stream'; // 提供一个安全的默认值

        // 5. 创建一个前端可以识别的 File 对象
        //    File 构造函数接受一个包含 [BlobPart] 的数组，Node.js 的 Buffer 可以直接作为 BlobPart 使用。
        const fileObject = new File([fileBuffer], fileName, { type: mimeType });

        return fileObject;

    } catch (error) {
        console.error(`处理文件路径失败: ${filePath}`, error);
        return null;
    }
};


// （文件路径=>文件对象=>文件列表=>对话格式）
async function sendfileDirect(filePathList) {
    if (!filePathList || filePathList.length === 0) {
        return [];
    }

    const contentPromises = filePathList.map(async (item) => {
        try {
            const filePath = item.path;
            if (!filePath || typeof filePath !== 'string') {
                return null;
            }

            // 1. 路径 -> File 对象
            const fileObject = await handleFilePath(filePath);
            if (!fileObject) {
                utools.showNotification('无法读取或访问文件:', filePath);
                return null;
            }
            
            // 2. 检查文件类型是否支持
            const handler = getFileHandler(fileObject.name);
            if (!handler) {
                utools.showNotification(`不支持的文件类型: ${fileObject.name}`);
                return null;
            }

            // 3. File 对象 -> Base64 Data URL (这是原始代码缺失的一步)
            // 我们需要一种在 Node.js 中将 Buffer 转为 Data URL 的方式
            const base64String = fileObject.stream ? Buffer.from(await fileObject.arrayBuffer()).toString('base64') : '';
            const dataUrl = `data:${fileObject.type};base64,${base64String}`;
            
            // 模拟 Vue 组件中 fileList 的对象结构
            const fileForHandler = {
                name: fileObject.name,
                size: fileObject.size,
                type: fileObject.type,
                url: dataUrl
            };

            // 4. 使用 handler 处理
            const processedContent = await handler(fileForHandler);
            return processedContent;

        } catch (error) {
            utools.showNotification('处理文件路径时出错:', item.path, error);
            return null;
        }
    });

    // 等待所有文件处理完成，并过滤掉失败的(null)
    const contentList = (await Promise.all(contentPromises)).filter(Boolean);
    
    return contentList;
}



module.exports = {
    handleFilePath, // (文件路径=>文件对象)
    sendfileDirect, //（文件路径=>文件对象=>文件列表=>对话格式）
};