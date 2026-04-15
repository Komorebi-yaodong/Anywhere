const fs = require('fs/promises');
const fs_node = require('node:fs');
const path = require('path');


const parseWord = async (base64Data) => {
    const mammoth = (await import('mammoth')).default;
    const s = base64Data.split(',')[1];
    if (!s) throw new Error("Invalid base64 data for Word file");

    const buffer = Buffer.from(s, 'base64');
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const r = await mammoth.convertToHtml({ buffer: buffer, arrayBuffer: arrayBuffer });
    const d = document.createElement('div');
    d.innerHTML = r.value;
    return (d.textContent || d.innerText || "").replace(/\s+/g, ' ').trim();
};

const parseTextFile = async (base64Data) => {
    const s = base64Data.split(',')[1]; if (!s) throw new Error("Invalid base64 data for text file");
    return Buffer.from(s, 'base64').toString('utf-8');
};

const parseExcel = async (base64Data) => {
    //   const XLSX = await import('xlsx');
    const XLSX = require('xlsx/dist/xlsx.mini.min.js');
    const s = base64Data.split(',')[1]; if (!s) throw new Error("Invalid base64 data for Excel file");
    const buffer = Buffer.from(s, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    let fullTextContent = '';
    workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const csvData = XLSX.utils.sheet_to_csv(worksheet);
        fullTextContent += `--- Sheet: ${sheetName} ---\n${csvData}\n\n`;
    });
    return fullTextContent.trim();
};

// Centralized file handling configuration
const fileHandlers = {
    text: {
        extensions: ['.txt', '.md', '.markdown', '.json', '.xml', '.html', '.css', '.csv', '.py', '.js', '.ts', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.php', '.rb', '.rs', '.sh', '.sql', '.vue', '.tex', '.latex', '.bib', '.sty', '.yaml', '.yml', '.ini', '.bat', '.log', '.toml'],
        handler: async (file) => ({ type: "text", text: `file name:${file.name}\nfile content:\n${await parseTextFile(file.url)}\nfile end` })
    },
    docx: {
        extensions: ['.docx'],
        handler: async (file) => ({ type: "text", text: `file name:${file.name}\nfile content:\n${await parseWord(file.url)}\nfile end` })
    },
    excel: {
        extensions: ['.xlsx', '.xls'],
        handler: async (file) => ({ type: "text", text: `file name:${file.name}\nfile content:\n${await parseExcel(file.url)}\nfile end` })
    },
    image: {
        extensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
        handler: async (file) => ({ type: "image_url", image_url: { url: file.url } })
    },
    audio: {
        extensions: ['.mp3', '.wav'],
        handler: async (file) => {
            const commaIndex = file.url.indexOf(',');
            if (commaIndex > -1) return { type: "input_audio", input_audio: { data: file.url.substring(commaIndex + 1), format: file.name.split('.').pop().toLowerCase() } };
            showDismissibleMessage.error(`音频文件 ${file.name} 格式不正确`); return null;
        }
    },
    pdf: {
        extensions: ['.pdf'],
        handler: async (file) => ({ type: "file", file: { filename: file.name, file_data: file.url } })
    }
};

const isFileTypeSupported = (fileName) => {
    if (!fileName) return false;
    const extension = ('.' + fileName.split('.').pop()).toLowerCase();
    
    // 1. 如果在白名单内，直接支持
    for (const category in fileHandlers) {
        if (fileHandlers[category].extensions.includes(extension)) {
            return true;
        }
    }
    
    // 2. 拦截明确不支持且无法作为文本处理的常见二进制黑名单
    const unsupportedBinary = ['.doc', '.pptx', '.ppt', '.odt', '.ods', '.epub', '.mobi', '.bmp', '.ico', '.mp4', '.mov', '.avi', '.mkv', '.zip', '.rar', '.7z', '.tar', '.gz', '.exe', '.dll', '.bin', '.so', '.dmg', '.class', '.jar', '.pyc'];
    if (unsupportedBinary.includes(extension)) {
        return false;
    }
    
    // 3. 其他未知后缀统统放行，在 parseFileObject 时通过内容探针检查是否为文本
    return true;
};

const parseFileObject = async (fileObj) => {
    let handler = getFileHandler(fileObj.name);
    
    if (!handler) {
        // 尝试通过内容嗅探判断是否为纯文本
        try {
            const base64Data = fileObj.url.split(',')[1];
            if (base64Data) {
                // 取 Base64 的前一部分进行解码嗅探（8192 字符解码后约 6KB）
                const buffer = Buffer.from(base64Data.substring(0, 8192), 'base64');
                let isBinary = false;
                for (let i = 0; i < buffer.length; i++) {
                    if (buffer[i] === 0) { // 发现空字符 \0，大概率为二进制文件
                        isBinary = true;
                        break;
                    }
                }
                // 没有发现空字符，将其作为普通文本处理
                if (!isBinary) {
                    handler = fileHandlers.text.handler;
                }
            }
        } catch (e) {
            console.warn(`文件内容探针检查失败: ${fileObj.name}`, e);
        }
    }

    if (!handler) {
        throw new Error(`不支持的文件类型且疑似为二进制文件: ${fileObj.name}`);
    }
    return await handler(fileObj);
};

// Helper function to get the correct handler for a file
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
    '.py': 'text/plain',
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
    '.tex': 'text/x-tex',
    '.latex': 'text/x-tex',
    '.bib': 'text/plain',
    '.sty': 'text/plain',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.ini': 'text/plain',
    '.toml': 'text/plain',
    '.bat': 'text/plain',
    '.log': 'text/plain',

    // 文档
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',

    // 图片
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',

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
                return null;
            }
            // 2. File 对象 -> Base64 Data URL
            const base64String = fileObject.stream ? Buffer.from(await fileObject.arrayBuffer()).toString('base64') : '';
            const dataUrl = `data:${fileObject.type};base64,${base64String}`;
            const fileForHandler = {
                name: fileObject.name,
                size: fileObject.size,
                type: fileObject.type,
                url: dataUrl
            };
            return await parseFileObject(fileForHandler);
        } catch (error) {
            console.error(`处理文件出错: ${item.path}`, error);
            // 仅在非不支持类型错误时弹窗，避免骚扰
            if (!error.message.includes('不支持的文件类型')) {
            }
            return null;
        }
    });
    // 等待所有文件处理完成，并过滤掉失败的(null)
    const contentList = (await Promise.all(contentPromises)).filter(Boolean);

    return contentList;
}

function saveFile(options) {
    return new Promise((resolve, reject) => {
        try {
            const { fileContent, ...dialogOptions } = options;
            const savePath = utools.showSaveDialog(dialogOptions);
            if (!savePath) {
                return reject(new Error('用户取消了保存操作'));
            }
            fs_node.writeFileSync(savePath, fileContent, 'utf-8');
            resolve({ success: true, path: savePath });
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * [新增] 弹出目录选择框
 * @returns {Promise<string|null>} 返回选择的目录路径，如果取消则返回 null
 */
async function selectDirectory() {
    const result = utools.showOpenDialog({
        properties: ['openDirectory']
    });
    return result && result.length > 0 ? result[0] : null;
}

const normalizeSessionTimestamp = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const collectSessionTimestamps = (sessionData) => {
    const timestamps = [];
    const messageLists = [sessionData?.chat_show, sessionData?.history];

    messageLists.forEach((messages) => {
        if (!Array.isArray(messages)) return;
        messages.forEach((message) => {
            const candidates = [
                message?.timestamp,
                message?.completedTimestamp,
                message?.updatedAt,
                message?.createdAt,
            ];
            candidates.forEach((candidate) => {
                const normalized = normalizeSessionTimestamp(candidate);
                if (normalized) timestamps.push(normalized);
            });
        });
    });

    return timestamps.sort((a, b) => new Date(a) - new Date(b));
};

async function readSessionMetadata(filePath, fallbackBasename) {
    try {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const sessionData = JSON.parse(rawContent);
        if (!sessionData || sessionData.anywhere_history !== true) return null;

        const sessionMetadata = sessionData.sessionMetadata || {};
        const timestamps = collectSessionTimestamps(sessionData);
        const fallbackCreatedAt = timestamps[0] || null;
        const fallbackUpdatedAt = timestamps[timestamps.length - 1] || null;

        const title = typeof sessionMetadata.title === 'string' && sessionMetadata.title.trim()
            ? sessionMetadata.title.trim()
            : (fallbackBasename.endsWith('.json') ? fallbackBasename.slice(0, -5) : fallbackBasename);

        return {
            title,
            createdAt: normalizeSessionTimestamp(sessionMetadata.createdAt) || fallbackCreatedAt,
            updatedAt: normalizeSessionTimestamp(sessionMetadata.updatedAt) || fallbackUpdatedAt,
        };
    } catch (error) {
        return null;
    }
}

/**
 * [新增] 读取指定目录下的所有 .json 文件信息
 * @param {string} dirPath - 目录路径
 * @returns {Promise<Array<object>>} 返回文件信息数组
 */
async function listJsonFiles(dirPath) {
    if (!dirPath) return [];
    const files = await fs.readdir(dirPath);
    const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');

    const fileDetails = await Promise.all(
        jsonFiles.map(async file => {
            const filePath = path.join(dirPath, file);
            try {
                const stats = await fs_node.promises.stat(filePath);
                const sessionMetadata = await readSessionMetadata(filePath, file);
                const createdAt = sessionMetadata?.createdAt || normalizeSessionTimestamp(stats.birthtime) || normalizeSessionTimestamp(stats.mtime);
                const updatedAt = sessionMetadata?.updatedAt || normalizeSessionTimestamp(stats.mtime) || createdAt;

                return {
                    basename: file,
                    path: filePath,
                    lastmod: stats.mtime.toISOString(),
                    createdAt,
                    updatedAt,
                    title: sessionMetadata?.title || (file.endsWith('.json') ? file.slice(0, -5) : file),
                    size: stats.size,
                    type: 'file'
                };
            } catch (error) {
                console.error(`无法获取文件信息: ${filePath}`, error);
                return null;
            }
        })
    );
    return fileDetails
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt || b.lastmod) - new Date(a.createdAt || a.lastmod));
}

/**
 * 取本地文件内容，支持 AbortSignal
 * @param {string} filePath - 文件路径
 * @param {AbortSignal} signal - 用于取消操作的信号
 * @returns {Promise<string>} 文件内容
 */
async function readLocalFile(filePath, signal) {
    return await fs.readFile(filePath, { encoding: 'utf-8', signal });
}

/**
 * 重命名本地文件
 * @param {string} oldPath 
 * @param {string} newPath 
 * @returns {Promise<void>}
 */

function resolveRenamedSessionTitleFromPath(filePath = '') {
    const normalizedBasename = path.basename(String(filePath || '').trim());
    if (!normalizedBasename) return '';
    return normalizedBasename.toLowerCase().endsWith('.json')
        ? normalizedBasename.slice(0, -5)
        : normalizedBasename;
}

async function syncLocalSessionMetadataTitleAfterRename(filePath, title) {
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    if (!normalizedTitle) return false;

    try {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const sessionData = JSON.parse(rawContent);
        if (!sessionData || sessionData.anywhere_history !== true || typeof sessionData !== 'object') {
            return false;
        }

        const sessionMetadata =
            sessionData.sessionMetadata && typeof sessionData.sessionMetadata === 'object'
                ? sessionData.sessionMetadata
                : {};

        if (typeof sessionMetadata.title === 'string' && sessionMetadata.title.trim() === normalizedTitle) {
            return false;
        }

        sessionData.sessionMetadata = {
            ...sessionMetadata,
            title: normalizedTitle
        };

        await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2), { encoding: 'utf-8' });
        return true;
    } catch {
        return false;
    }
}

async function renameLocalFile(oldPath, newPath) {
    await fs.rename(oldPath, newPath);

    const metadataSynced = await syncLocalSessionMetadataTitleAfterRename(
        newPath,
        resolveRenamedSessionTitleFromPath(newPath)
    );

    return {
        ok: true,
        oldPath,
        newPath,
        metadataSynced
    };
}

/**
 * 删除本地文件
 * @param {string} filePath 
 * @returns {Promise<void>}
 */
async function deleteLocalFile(filePath) {
    return await fs.unlink(filePath);
}

/**
 * 异步将内容写入本地文件，支持 AbortSignal
 * @param {string} filePath - 文件的完整路径
 * @param {string} content - 要写入的文件内容
 * @param {AbortSignal} signal - 用于取消操作的信号
 * @returns {Promise<void>}
 */
async function writeLocalFile(filePath, content, signal) {
    return await fs.writeFile(filePath, content, { encoding: 'utf-8', signal });
}

/**
 * 设置本地文件的修改时间
 * @param {string} filePath - 文件的完整路径
 * @param {Date | string | number} mtime - 新的修改时间
 * @returns {Promise<void>}
 */
async function setFileMtime(filePath, mtime) {
    const date = new Date(mtime);
    // utimes 需要 access time 和 modification time
    // 我们将 access time 也设置为 modification time
    return await fs.utimes(filePath, date, date);
}

/**
 * 递归复制文件或目录
 * @param {string} srcPath 源路径
 * @param {string} destPath 目标路径
 */
async function copyLocalPath(srcPath, destPath) {
    // fs.cp 是 Node v16.7.0+ 引入的，支持递归
    return await fs.cp(srcPath, destPath, { recursive: true });
}

module.exports = {
    handleFilePath, // (文件路径=>文件对象)
    sendfileDirect, //（文件路径=>文件对象=>文件列表=>对话格式）
    saveFile,

    selectDirectory,
    listJsonFiles,
    readLocalFile,
    renameLocalFile,
    deleteLocalFile,
    writeLocalFile,
    setFileMtime,
    isFileTypeSupported,
    parseFileObject,
    copyLocalPath,
};