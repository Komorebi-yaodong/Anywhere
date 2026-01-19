const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const { handleFilePath, parseFileObject } = require('./file.js');

const isWin = process.platform === 'win32';

// --- Bash Session State ---
let bashCwd = os.homedir();

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
        description: isWin ? "持久会话中执行 PowerShell 命令" : "持久会话中执行 Bash 命令",
        type: "builtin",
        isActive: false,
        isPersistent: true, // Bash needs state
        tags: ["shell", "bash", "cmd"],
        logoUrl: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Bash_Logo_Colored.svg"
    },
    "builtin_search": {
        id: "builtin_search",
        name: "Web Search",
        description: "使用 DuckDuckGo 进行免费联网搜索，获取相关网页标题、链接和摘要。",
        type: "builtin",
        isActive: false,
        isPersistent: false,
        tags: ["search", "web", "internet"],
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
            description: "Execute a shell command. Maintains current working directory state. Note: Long-running commands (like servers) will be terminated after 15 seconds to prevent blocking.",
            inputSchema: {
                type: "object",
                properties: {
                    command: { type: "string", description: "The command to execute (e.g., 'ls -la', 'git status', 'npm install')." }
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