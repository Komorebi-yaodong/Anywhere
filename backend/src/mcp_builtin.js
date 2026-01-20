const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const { handleFilePath, parseFileObject } = require('./file.js');

const isWin = process.platform === 'win32';
const currentOS = process.platform === 'win32' ? 'Windows' : (process.platform === 'darwin' ? 'macOS' : 'Linux');

// --- Bash Session State ---
let bashCwd = os.homedir();

// 数据提取函数 (提取标题、作者、简介)
function extractMetadata(html) {
    const meta = {
        title: '',
        author: '',
        description: '',
        siteName: ''
    };

    // 提取 Title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) meta.title = titleMatch[1].trim();
    
    // 辅助正则：从 meta 标签提取 content
    const getMetaContent = (propName) => {
        const regex = new RegExp(`<meta\\s+(?:name|property)=["']${propName}["']\\s+content=["'](.*?)["']`, 'i');
        const match = html.match(regex);
        return match ? match[1].trim() : null;
    };

    // 尝试多种常见的 Meta 标签
    meta.title = getMetaContent('og:title') || getMetaContent('twitter:title') || meta.title;
    meta.author = getMetaContent('author') || getMetaContent('article:author') || getMetaContent('og:site_name') || 'Unknown Author';
    meta.description = getMetaContent('description') || getMetaContent('og:description') || getMetaContent('twitter:description') || '';
    meta.siteName = getMetaContent('og:site_name') || '';

    return meta;
}

// HTML 转 Markdown 辅助函数
function convertHtmlToMarkdown(html) {
    let text = html;

    // --- 1. 核心内容定位 (尽力而为) ---
    // 尝试定位常见的文章容器，如果找到，直接丢弃容器外的内容
    // 注意：正则匹配嵌套标签不可靠，这里只匹配最外层的特定ID容器，如 CSDN 的 content_views
    // 这种非贪婪匹配在此处仅作为一种尝试，失败则回退到全文清洗
    const articlePatterns = [
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<div[^>]*id=["'](?:article_content|content_views|js_content|post-content)["'][^>]*>([\s\S]*?)<\/div>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i
    ];
    
    for (const pattern of articlePatterns) {
        const match = text.match(pattern);
        if (match && match[1].length > 500) { // 确保提取的内容足够长
            text = match[1];
            break;
        }
    }

    // --- 2. 移除无关标签 (结构化清洗) ---
    // 移除 Head (因为元数据已单独提取)
    text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
    
    // 移除噪音标签：脚本、样式、导航、页脚、侧边栏、表单、弹窗、推荐框
    // 增加了对 class 包含 comment, recommend, advertisement 等关键词的 div 的粗略清洗
    text = text.replace(/<(script|style|svg|noscript|header|footer|nav|aside|iframe|form|button|textarea)[^>]*>[\s\S]*?<\/\1>/gi, '');
    
    // 移除具有特定 ID/Class 的噪音区块 (CSDN/通用)
    // 注意：这是一个简单的关键词匹配，可能会误伤，但能极大净化内容
    text = text.replace(/<div[^>]*(?:class|id)=["'][^"']*(?:sidebar|comment|recommend|advert|toolbar|operate|login|modal)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');

    // --- 3. 移除注释 ---
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // --- 4. 元素转换 Markdown ---
    
    // 标题
    text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (match, level, content) => {
        return `\n\n${'#'.repeat(level)} ${content.replace(/<[^>]+>/g, '').trim()}\n`;
    });

    // 列表与段落
    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<li[^>]*>/gi, '- ');
    text = text.replace(/<\/(ul|ol)>/gi, '\n\n');
    text = text.replace(/<\/(p|div|tr|table|article|section|blockquote)>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');

    // 图片 (过滤掉 base64 和小图标)
    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, (match, src, alt) => {
        if (src.startsWith('data:image')) return ''; 
        return `\n![${alt.trim()}](${src})\n`;
    });
    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, (match, src) => {
        if (src.startsWith('data:image')) return ''; 
        return `\n![](${src})\n`;
    });

    // 链接
    text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, content) => {
        const cleanContent = content.replace(/<[^>]+>/g, '').trim();
        // 过滤无效链接
        if (!cleanContent || href.startsWith('javascript:') || href.startsWith('#')) return cleanContent;
        return ` [${cleanContent}](${href}) `;
    });

    // 粗体/代码
    text = text.replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
    text = text.replace(/<(code|pre)[^>]*>([\s\S]*?)<\/\1>/gi, '\n```\n$2\n```\n');

    // --- 5. 移除剩余 HTML 标签 ---
    text = text.replace(/<[^>]+>/g, '');

    // --- 6. 实体解码 ---
    const entities = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&copy;': '©' };
    text = text.replace(/&[a-z0-9]+;/gi, (match) => entities[match] || '');

    // --- 7. 行级清洗 (去除残留的导航文本) ---
    const lines = text.split('\n').map(line => line.trim());
    const cleanLines = [];
    
    // 垃圾关键词库
    const noiseKeywords = [
        /^最新推荐/, /^相关推荐/, /^文章标签/, /^版权声明/, /阅读\s*\d/, /点赞/, /收藏/, /分享/, /举报/, 
        /打赏/, /关注/, /登录/, /注册/, /Copyright/, /All rights reserved/, 
        /VIP/, /立即使用/, /福利倒计时/, /扫一扫/, /复制链接/
    ];

    for (let line of lines) {
        if (!line) continue;
        // 跳过极短的非句子行（可能是残留的按钮文本）
        if (line.length < 2 && !line.match(/[a-zA-Z0-9]/)) continue;
        
        let isNoise = false;
        for (const regex of noiseKeywords) {
            if (regex.test(line)) { isNoise = true; break; }
        }
        if (isNoise) continue;

        // 跳过纯导航链接行
        if (/^\[.{1,15}\]\(http.*\)$/.test(line)) continue;

        cleanLines.push(line);
    }

    return cleanLines.join('\n\n'); 
}

// --- Definitions ---
const BUILTIN_SERVERS = {
    "builtin_python": {
        id: "builtin_python",
        name: "Python Executor",
        description: "自动检测环境，执行本地 Python 脚本。",
        type: "builtin",
        isActive: false,
        isPersistent: false,
        tags: ["python", "code"],
        logoUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c3/Python-logo-notext.svg"
    },
    "builtin_filesystem": {
        id: "builtin_filesystem",
        name: "File Reader",
        description: "读取本地文件或者远程文件。支持文本、Markdown、代码、Word (.docx)、Excel (.xlsx/.csv) 格式。注意：PDF 和图片等二进制文件不支持解析。",
        type: "builtin",
        isActive: false,
        isPersistent: false,
        tags: ["file", "read"],
        logoUrl: "https://cdn-icons-png.flaticon.com/512/2965/2965335.png"
    },
    "builtin_bash": {
        id: "builtin_bash",
        name: "Shell Executor",
        description: isWin ? "执行 PowerShell 命令" : "执行 Bash 命令",
        type: "builtin",
        isActive: false,
        isPersistent: false,
        tags: ["shell", "bash", "cmd"],
        logoUrl: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Bash_Logo_Colored.svg"
    },
    "builtin_search": {
        id: "builtin_search",
        name: "Web Search",
        description: "使用 DuckDuckGo 进行免费联网搜索，获取相关网页标题、链接和摘要；抓取网页内容。",
        type: "builtin",
        isActive: false,
        isPersistent: false,
        tags: ["search", "web", "fetch"],
        logoUrl: "https://upload.wikimedia.org/wikipedia/en/9/90/The_DuckDuckGo_Duck.png"
    },
};

const BUILTIN_TOOLS = {
    "builtin_python": [
        {
            name: "list_python_interpreters",
            description: "Scan the system for available Python interpreters (Path & Conda).",
            inputSchema: { type: "object", properties: {} }
        },
        {
            name: "run_python_code",
            description: "Execute Python code. Writes code to a temporary file and runs it.",
            inputSchema: {
                type: "object",
                properties: {
                    code: { type: "string", description: "The Python code to execute." },
                    interpreter: { type: "string", description: "Optional. Path to specific python executable." }
                },
                required: ["code"]
            }
        },
        {
            name: "run_python_file",
            description: "Execute a local Python script file. Supports setting working directory and arguments.",
            inputSchema: {
                type: "object",
                properties: {
                    file_path: { type: "string", description: "Absolute path to the .py file." },
                    working_directory: { type: "string", description: "Optional. The directory to execute the script in. If not provided, defaults to the file's directory." },
                    interpreter: { type: "string", description: "Optional. Path to specific python executable." },
                    args: { type: "array", items: { type: "string" }, description: "Optional. Command line arguments to pass to the script." }
                },
                required: ["file_path"]
            }
        }
    ],
    "builtin_filesystem": [
        {
            name: "read_file",
            description: "Read content from a local file path or a remote file. Supports .txt, .md, .code, .docx, .xlsx. Returns parsed text for supported formats.",
            inputSchema: {
                type: "object",
                properties: {
                    file_path: { type: "string", description: "Absolute path to the local file OR a valid HTTP/HTTPS URL." }
                },
                required: ["file_path"]
            }
        }
    ],
    "builtin_bash": [
        {
            name: "execute_bash_command",
            description: `Execute a shell command on the current ${currentOS} system. Note: Long-running commands (like servers) will be terminated after 15 seconds to prevent blocking.`,
            inputSchema: {
                type: "object",
                properties: {
                    command: { type: "string", description: `The command to execute (e.g., 'ls -la', 'git status', 'npm install'). Current OS: ${currentOS}.` }
                },
                required: ["command"]
            }
        }
    ],
    "builtin_search": [
        {
            name: "web_search",
            description: "Search the internet for a given query and return the top N results (title, link, snippet).",
            inputSchema: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search keywords." },
                    count: { type: "integer", description: "Number of results to return (default 5, max 10)." },
                    language: { 
                        type: "string", 
                        description: "Preferred language/region code (e.g., 'zh-CN', 'en-US', 'jp'). Defaults to 'zh-CN' for Chinese results." 
                    }
                },
                required: ["query"]
            }
        },
        {
            name: "fetch_page",
            description: "Fetch the content of a specific URL and convert it to Markdown format. Use this to read articles, documentation, or search results in detail.",
            inputSchema: {
                type: "object",
                properties: {
                    url: { type: "string", description: "The URL of the webpage to fetch." }
                },
                required: ["url"]
            }
        }
    ],
};

// --- Helpers ---

// Simple Content-Type to Extension mapper
const getExtensionFromContentType = (contentType) => {
    if (!contentType) return null;
    const type = contentType.split(';')[0].trim().toLowerCase();
    const map = {
        'application/pdf': '.pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'text/csv': '.csv',
        'text/plain': '.txt',
        'text/markdown': '.md',
        'text/html': '.html',
        'application/json': '.json',
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp'
    };
    return map[type] || null;
};

// Python Finder Logic
const findAllPythonPaths = () => {
    return new Promise((resolve) => {
        const allPaths = [];
        const cmd = isWin ? 'where python' : 'which -a python3';

        exec(cmd, (error, stdout, stderr) => {
            if (!error) {
                const lines = stdout.split(/\r?\n/).filter(p => p.trim() !== '');
                allPaths.push(...lines);
            }

            const potentialCondaBases = allPaths.map(p => {
                return isWin ? path.dirname(p) : path.dirname(path.dirname(p));
            });

            potentialCondaBases.forEach(baseDir => {
                const envsDir = path.join(baseDir, 'envs');
                if (fs.existsSync(envsDir)) {
                    try {
                        const subDirs = fs.readdirSync(envsDir);
                        subDirs.forEach(subDir => {
                            let venvPython;
                            if (isWin) {
                                venvPython = path.join(envsDir, subDir, 'python.exe');
                            } else {
                                venvPython = path.join(envsDir, subDir, 'bin', 'python');
                                if (!fs.existsSync(venvPython)) {
                                    venvPython = path.join(envsDir, subDir, 'bin', 'python3');
                                }
                            }
                            if (fs.existsSync(venvPython)) allPaths.push(venvPython);
                        });
                    } catch (e) { }
                }
            });
            resolve([...new Set(allPaths)]);
        });
    });
};

const runPythonScript = (code, interpreter) => {
    return new Promise(async (resolve, reject) => {
        let pythonPath = interpreter;
        if (!pythonPath) {
            const paths = await findAllPythonPaths();
            pythonPath = paths.length > 0 ? paths[0] : (isWin ? 'python' : 'python3');
        }

        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `anywhere_script_${Date.now()}.py`);

        try {
            fs.writeFileSync(tempFile, code, 'utf-8');
        } catch (e) {
            return resolve(`Failed to write temp file: ${e.message}`);
        }

        const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
        
        const child = spawn(pythonPath, [tempFile], { env });

        let output = "";
        let errorOutput = "";

        child.stdout.on('data', (data) => { output += data.toString(); });
        child.stderr.on('data', (data) => { errorOutput += data.toString(); });

        child.on('close', (code) => {
            fs.unlink(tempFile, () => { }); // Cleanup
            if (code === 0) {
                resolve(output || "Execution completed with no output.");
            } else {
                resolve(`Error (Exit Code ${code}):\n${errorOutput}\n${output}`);
            }
        });

        child.on('error', (err) => {
            fs.unlink(tempFile, () => { });
            resolve(`Execution failed: ${err.message}`);
        });
    });
};

// 安全检查辅助函数
const isPathSafe = (targetPath) => {
    // 基础黑名单：SSH密钥、AWS凭证、环境变量文件、Git配置、系统Shadow文件
    const forbiddenPatterns = [
        /[\\/]\.ssh[\\/]/i,
        /[\\/]\.aws[\\/]/i,
        /[\\/]\.env/i,
        /[\\/]\.gitconfig/i,
        /id_rsa/i,
        /authorized_keys/i,
        /\/etc\/shadow/i,
        /\/etc\/passwd/i,
        /C:\\Windows\\System32\\config/i // Windows SAM hive
    ];
    
    return !forbiddenPatterns.some(regex => regex.test(targetPath));
};

// --- Execution Handlers ---
const handlers = {
    // Python
    list_python_interpreters: async () => {
        const paths = await findAllPythonPaths();
        return JSON.stringify(paths, null, 2);
    },
    run_python_code: async ({ code, interpreter }) => {
        return await runPythonScript(code, interpreter);
    },
    run_python_file: async ({ file_path, working_directory, interpreter, args = [] }) => {
        return new Promise(async (resolve, reject) => {
            const cleanPath = file_path.replace(/^["']|["']$/g, '');
            if (!fs.existsSync(cleanPath)) {
                return resolve(`Error: Python file not found at ${cleanPath}`);
            }

            let pythonPath = interpreter;
            if (!pythonPath) {
                const paths = await findAllPythonPaths();
                pythonPath = paths.length > 0 ? paths[0] : (isWin ? 'python' : 'python3');
            }

            const cwd = working_directory ? working_directory.replace(/^["']|["']$/g, '') : path.dirname(cleanPath);
            if (!fs.existsSync(cwd)) {
                 return resolve(`Error: Working directory not found at ${cwd}`);
            }

            const scriptArgs = Array.isArray(args) ? args : [args];
            const spawnArgs = [cleanPath, ...scriptArgs];
            const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };

            const child = spawn(pythonPath, spawnArgs, { cwd, env });

            let output = "";
            let errorOutput = "";

            child.stdout.on('data', (data) => { output += data.toString(); });
            child.stderr.on('data', (data) => { errorOutput += data.toString(); });

            child.on('close', (code) => {
                const header = `[Executed: ${path.basename(cleanPath)}]\n[CWD: ${cwd}]\n-------------------\n`;
                if (code === 0) {
                    resolve(header + (output || "Execution completed with no output."));
                } else {
                    resolve(`${header}Error (Exit Code ${code}):\n${errorOutput}\n${output}`);
                }
            });

            child.on('error', (err) => {
                resolve(`Execution failed to start: ${err.message}`);
            });
        });
    },

    // Filesystem (Local + URL)
    read_file: async ({ file_path }) => {
        try {
            let fileForHandler;

            if (file_path.startsWith('http://') || file_path.startsWith('https://')) {
                // 处理 URL (保持原逻辑)
                try {
                    const response = await fetch(file_path);
                    if (!response.ok) {
                        return `Error fetching URL: ${response.status} ${response.statusText}`;
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const base64String = buffer.toString('base64');
                    const contentType = response.headers.get('content-type');

                    let filename = path.basename(new URL(file_path).pathname);
                    if (!filename || !filename.includes('.')) {
                        const ext = getExtensionFromContentType(contentType) || '.txt';
                        filename = `downloaded_file${ext}`;
                    }

                    fileForHandler = {
                        name: filename,
                        size: buffer.length,
                        type: contentType || 'application/octet-stream',
                        url: `data:${contentType || 'application/octet-stream'};base64,${base64String}`
                    };

                } catch (fetchErr) {
                    return `Network error: ${fetchErr.message}`;
                }
            } else {
                // 处理本地文件
                file_path = file_path.replace(/^["']|["']$/g, '');
                
                // 安全检查
                if (!isPathSafe(file_path)) {
                    return `[Security Block] Access to sensitive system file '${path.basename(file_path)}' is restricted.`;
                }
                
                if (!fs.existsSync(file_path)) return `Error: File not found at ${file_path}`;

                // 大文件检查 (限制 50MB)
                const stats = await fs.promises.stat(file_path);
                if (stats.size > 50 * 1024 * 1024) {
                    return `Error: File is too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Max limit is 50MB.`;
                }

                const fileObj = await handleFilePath(file_path);
                if (!fileObj) return `Error: Unable to access or read file at ${file_path}`;

                const arrayBuffer = await fileObj.arrayBuffer();
                const base64String = Buffer.from(arrayBuffer).toString('base64');
                const dataUrl = `data:${fileObj.type || 'application/octet-stream'};base64,${base64String}`;
                
                fileForHandler = {
                    name: fileObj.name,
                    size: fileObj.size,
                    type: fileObj.type,
                    url: dataUrl 
                };
            }

            const result = await parseFileObject(fileForHandler);

            if (!result) return "Error: Unsupported file type or parsing failed.";

            if (result.type === 'text' && result.text) {
                return result.text;
            } 
            else {
                const typeInfo = result.type === 'image_url' ? 'Image' : 'Binary/PDF';
                return `[System] File '${fileForHandler.name}' detected as ${typeInfo}. \nContent extraction is currently NOT supported for this file type. \n(Binary data suppressed to protect context window).`;
            }

        } catch (e) {
            return `Error reading file: ${e.message}`;
        }
    },

    // Bash / PowerShell
    execute_bash_command: async ({ command }) => {
        return new Promise((resolve) => {
            const trimmedCmd = command.trim();

            // [新增] 高危命令简单拦截
            const dangerousPatterns = [
                /^rm\s+(-rf|-r|-f)\s+\/$/i, // rm -rf /
                />\s*\/dev\/sd/i,     // 写入设备
                /mkfs/i, 
                /dd\s+/i,
                /wget\s+/i,           // 防止下载木马
                /curl\s+.*\|\s*sh/i,  // 管道执行网络脚本
                /chmod\s+777/i,
                /cat\s+.*id_rsa/i     // 读取私钥
            ];
            
            if (dangerousPatterns.some(p => p.test(trimmedCmd))) {
                return resolve(`[Security Block] The command contains potentially destructive operations and has been blocked.`);
            }

            if (trimmedCmd.startsWith('cd ')) {
                let targetDir = trimmedCmd.substring(3).trim();
                targetDir = targetDir.replace(/^["']|["']$/g, '');
                
                try {
                    const newPath = path.resolve(bashCwd, targetDir);
                    if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                        bashCwd = newPath;
                        return resolve(`Directory changed to: ${bashCwd}`);
                    } else {
                        return resolve(`Error: Directory not found: ${newPath}`);
                    }
                } catch (e) {
                    return resolve(`Error changing directory: ${e.message}`);
                }
            }

            let shellOptions = {
                cwd: bashCwd,
                encoding: 'utf-8',
                maxBuffer: 1024 * 1024 * 5,
                timeout: 15000 
            };

            let finalCommand = command;
            let shellToUse;

            if (isWin) {
                shellToUse = 'powershell.exe';
                finalCommand = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`;
                shellOptions.shell = shellToUse;
            } else {
                shellToUse = '/bin/bash';
                shellOptions.shell = shellToUse;
            }

            exec(finalCommand, shellOptions, (error, stdout, stderr) => {
                let result = "";
                
                if (stdout) result += stdout;
                if (stderr) result += `\n[Stderr]: ${stderr}`;
                
                if (error) {
                    if (error.signal === 'SIGTERM') {
                        result += `\n[System Note]: Command timed out after 15s and was terminated. This is expected for long-running processes (like servers). Output captured so far is shown above.`;
                    } else {
                        result += `\n[Error Code]: ${error.code}`;
                        if (error.message && !stderr) result += `\n[Message]: ${error.message}`;
                    }
                }
                
                if (!result.trim()) result = "Command executed successfully (no output).";
                resolve(`[CWD: ${bashCwd}]\n${result}`);
            });
        });
    },

    // Web Search Handler
    web_search: async ({ query, count = 5, language = 'zh-CN' }) => {
        try {
            const limit = Math.min(Math.max(parseInt(count) || 5, 1), 10);
            const url = "https://html.duckduckgo.com/html/";
            
            // --- 1. 简单的语言/地区映射逻辑 ---
            // DuckDuckGo 使用 'kl' 参数 (例如: cn-zh, us-en, wt-wt)
            // 浏览器 Header 使用 'Accept-Language' (例如: zh-CN, en-US)
            
            let ddgRegion = 'cn-zh'; // 默认: 中国-中文
            let acceptLang = 'zh-CN,zh;q=0.9,en;q=0.8'; // 默认 Header
            
            const langInput = (language || '').toLowerCase();

            if (langInput.includes('en') || langInput.includes('us')) {
                ddgRegion = 'us-en';
                acceptLang = 'en-US,en;q=0.9';
            } else if (langInput.includes('jp') || langInput.includes('ja')) {
                ddgRegion = 'jp-jp';
                acceptLang = 'ja-JP,ja;q=0.9,en;q=0.8';
            } else if (langInput.includes('ru')) {
                ddgRegion = 'ru-ru';
                acceptLang = 'ru-RU,ru;q=0.9,en;q=0.8';
            } else if (langInput === 'all' || langInput === 'world') {
                ddgRegion = 'wt-wt'; // 全球
                acceptLang = 'en-US,en;q=0.9';
            }
            // 默认为 zh-CN (无需 else，初始化已设置)

            // --- 2. 构造请求 ---
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": acceptLang, // 动态语言头
                "Content-Type": "application/x-www-form-urlencoded",
                "Origin": "https://html.duckduckgo.com",
                "Referer": "https://html.duckduckgo.com/"
            };

            const body = new URLSearchParams();
            body.append('q', query);
            body.append('b', '');
            body.append('kl', ddgRegion); // 动态地区参数

            const response = await fetch(url, { 
                method: 'POST',
                headers: headers,
                body: body
            });

            if (!response.ok) throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
            const html = await response.text();

            const results = [];
            
            // --- 3. 解析逻辑 (保持鲁棒性) ---
            const titleLinkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
            const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

            const titles = [...html.matchAll(titleLinkRegex)];
            const snippets = [...html.matchAll(snippetRegex)];

            const decodeHtml = (str) => {
                if (!str) return "";
                return str
                    .replace(/&amp;/g, '&')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&nbsp;/g, " ")
                    .replace(/<b>/g, "")
                    .replace(/<\/b>/g, "")
                    .replace(/\s+/g, " ")
                    .trim();
            };

            for (let i = 0; i < titles.length && i < limit; i++) {
                let link = titles[i][1];
                const titleRaw = titles[i][2];
                const snippetRaw = snippets[i] ? snippets[i][1] : "";

                try {
                    if (link.includes('uddg=')) {
                        const urlObj = new URL(link, "https://html.duckduckgo.com");
                        const uddg = urlObj.searchParams.get("uddg");
                        if (uddg) link = decodeURIComponent(uddg);
                    }
                } catch(e) {}

                results.push({
                    title: decodeHtml(titleRaw),
                    link: link,
                    snippet: decodeHtml(snippetRaw)
                });
            }
            
            if (results.length === 0) {
                // 如果是中文搜索无结果，可能是 DDG 的中文索引问题，提示用户尝试英文
                if (ddgRegion === 'cn-zh') {
                     return JSON.stringify({ message: "No results found in Chinese region. Try setting language='en' or 'all'.", query: query });
                }
                return JSON.stringify({ message: "No results found.", query: query });
            }
            
            return JSON.stringify(results, null, 2);

        } catch (e) {
            return `Search failed: ${e.message}`;
        }
    },

    // Fetch Page Handler
    fetch_page: async ({ url }) => {
        try {
            if (!url || !url.startsWith('http')) {
                return "Error: Invalid URL. Please provide a full URL starting with http:// or https://";
            }

            // 1. 更加逼真的浏览器指纹 Headers (模拟 Chrome)
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "Cache-Control": "max-age=0",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Referer": "https://www.google.com/"
            };

            const response = await fetch(url, { headers, redirect: 'follow' });
            
            // 处理常见的反爬状态码
            if (response.status === 403 || response.status === 521) {
                return `Failed to fetch page (Anti-bot protection ${response.status}). The site requires a real browser environment.`;
            }

            if (!response.ok) {
                return `Failed to fetch page. Status: ${response.status} ${response.statusText}`;
            }

            const contentType = response.headers.get('content-type') || '';
            const rawText = await response.text();

            // 如果是 JSON，直接返回
            if (contentType.includes('application/json')) {
                try { return JSON.stringify(JSON.parse(rawText), null, 2); } catch(e) { return rawText; }
            }
            
            // 1. 提取元数据 (标题、作者、简介)
            const metadata = extractMetadata(rawText);

            // 2. 转换正文 (清洗 HTML 并转 Markdown)
            const markdownBody = convertHtmlToMarkdown(rawText);

            // 3. 检查是否抓取失败 (如SPA页面)
            if (!markdownBody || markdownBody.length < 50) {
                return `Fetched URL: ${url}\n\nTitle: ${metadata.title}\n\n[System]: Content seems empty. This might be a JavaScript-rendered page (SPA) which cannot be parsed by this tool.`;
            }

            // 4. 组装最终输出 (结构化格式)
            let result = `URL: ${url}\n\n`;
            if (metadata.title) result += `# ${metadata.title}\n\n`;
            if (metadata.author) result += `**Author:** ${metadata.author}\n`;
            if (metadata.description) result += `**Summary:** ${metadata.description}\n`;
            
            result += `\n---\n\n${markdownBody}`;

            // 5. 长度截断 (防止 AI 上下文溢出)
            const MAX_LENGTH = 15000;
            if (result.length > MAX_LENGTH) {
                return result.substring(0, MAX_LENGTH) + `\n\n...[Content Truncated (${result.length} chars total)]...`;
            }

            return result;

        } catch (e) {
            return `Error fetching page: ${e.message}`;
        }
    }
};

// --- Exports ---

function getBuiltinServers() {
    return JSON.parse(JSON.stringify(BUILTIN_SERVERS));
}

function getBuiltinTools(serverId) {
    return BUILTIN_TOOLS[serverId] || [];
}

async function invokeBuiltinTool(toolName, args) {
    if (handlers[toolName]) {
        return await handlers[toolName](args);
    }
    throw new Error(`Built-in tool '${toolName}' not found.`);
}

module.exports = {
    getBuiltinServers,
    getBuiltinTools,
    invokeBuiltinTool
};