const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const { handleFilePath, parseFileObject } = require('./file.js');

const isWin = process.platform === 'win32';
const currentOS = process.platform === 'win32' ? 'Windows' : (process.platform === 'darwin' ? 'macOS' : 'Linux');

// --- Bash Session State ---
let bashCwd = os.homedir();

const MAX_READ = 512 * 1000; // 512k characters

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
function convertHtmlToMarkdown(html, baseUrl = '') {
    let text = html;

    // --- 1. SPA/SEO 增强：检查 <noscript> ---
    // 很多单页应用(Linux.do, Discourse)会将正文放在 noscript 中供爬虫读取
    // 如果 noscript 内容比当前 body 内容长很多，优先使用 noscript
    const noscriptMatch = text.match(/<noscript[^>]*>([\s\S]*?)<\/noscript>/i);
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    let bodyText = bodyMatch ? bodyMatch[1] : text;
    if (noscriptMatch && noscriptMatch[1].length > bodyText.length) {
        text = noscriptMatch[1];
    } else {
        text = bodyText;
    }

    // --- 2. 移除绝对无关的标签 ---
    text = text.replace(/<(script|style|svg|noscript|iframe|form|button|input|select|option|textarea)[^>]*>[\s\S]*?<\/\1>/gi, '');

    // --- 3. 移除 HTML5 语义化噪音标签 ---
    text = text.replace(/<(nav|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, '');

    // --- 4. 基于类名/ID 的通用降噪 ---
    const noiseKeywords = "sidebar|comment|recommend|advert|ads|menu|login|modal|popup|cookie|auth|related|footer|copyright";
    const noiseRegex = new RegExp(`<div[^>]*(?:id|class)=["'][^"']*(${noiseKeywords})[^"']*["'][^>]*>[\\s\\S]*?<\\/div>`, 'gi');
    text = text.replace(noiseRegex, '');
    text = text.replace(noiseRegex, '');

    // --- 5. 移除注释 ---
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // --- 6. 辅助函数：处理相对 URL ---
    const resolveUrl = (relativeUrl) => {
        if (!relativeUrl || !baseUrl) return relativeUrl;
        if (relativeUrl.startsWith('http')) return relativeUrl;
        if (relativeUrl.startsWith('data:')) return '';
        try {
            return new URL(relativeUrl, baseUrl).href;
        } catch (e) {
            return relativeUrl;
        }
    };

    // --- 7. 元素转换 Markdown ---
    text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (match, level, content) => {
        const cleanContent = content.replace(/<[^>]+>/g, '').trim();
        return cleanContent ? `\n\n${'#'.repeat(level)} ${cleanContent}\n` : '';
    });

    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<li[^>]*>/gi, '- ');
    text = text.replace(/<\/(ul|ol)>/gi, '\n\n');
    text = text.replace(/<\/(p|div|tr|table|article|section|blockquote|main)>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');

    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, (match, src, alt) => {
        const fullUrl = resolveUrl(src);
        return fullUrl ? `\n![${alt.trim()}](${fullUrl})\n` : '';
    });
    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, (match, src) => {
        const fullUrl = resolveUrl(src);
        return fullUrl ? `\n![](${fullUrl})\n` : '';
    });

    text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, content) => {
        const cleanContent = content.replace(/<[^>]+>/g, '').trim();
        if (!cleanContent || href.startsWith('javascript:') || href.startsWith('#')) return cleanContent;
        return ` [${cleanContent}](${resolveUrl(href)}) `;
    });

    text = text.replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');

    // 代码块处理
    text = text.replace(/<pre[^>]*>[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/gi, (match, code) => {
        return `\n\`\`\`\n${code}\n\`\`\`\n`;
    });
    text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
    text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, ' `$1` ');

    // --- 8. 移除剩余 HTML 标签 ---
    text = text.replace(/<[^>]+>/g, '');

    // --- 9. 实体解码 ---
    const entities = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&copy;': '©', '&mdash;': '—' };
    text = text.replace(/&[a-z0-9]+;/gi, (match) => entities[match] || '');

    // --- 10. 行级清洗与去重 ---
    const lines = text.split('\n').map(line => line.trim());
    const cleanLines = [];

    const lineNoiseRegex = /^(Sign in|Sign up|Log in|Register|Subscribe|Share|Follow us|Menu|Top|Home|About|Contact|Privacy|Terms)/i;

    let blankLineCount = 0;

    for (let line of lines) {
        if (!line) {
            blankLineCount++;
            if (blankLineCount < 2) cleanLines.push('');
            continue;
        }
        blankLineCount = 0;

        // 过滤纯数字行 (解决代码块行号问题)
        if (/^\d+$/.test(line)) continue;

        // 过滤极短的纯符号行
        if (line.length < 5 && !/[a-zA-Z0-9\u4e00-\u9fa5]/.test(line)) continue;

        // 过滤导航类噪音
        if (line.length < 20 && lineNoiseRegex.test(line)) continue;

        cleanLines.push(line);
    }

    return cleanLines.join('\n');
}

// --- Definitions ---
const BUILTIN_SERVERS = {
    "builtin_python": {
        id: "builtin_python",
        name: "Python Executor",
        description: "自动检测环境，执行本地 Python 脚本。",
        type: "builtin",
        isActive: true,
        isPersistent: false,
        tags: ["python", "code"],
        logoUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c3/Python-logo-notext.svg"
    },
    "builtin_filesystem": {
        id: "builtin_filesystem",
        name: "File Operations",
        description: "全能文件操作工具。支持 Glob 文件匹配、Grep 内容搜索、以及文件的读取、编辑和写入。支持本地文件及远程URL。",
        type: "builtin",
        isActive: true,
        isPersistent: false,
        tags: ["file", "fs", "read", "write", "edit", "search"],
        logoUrl: "https://cdn-icons-png.flaticon.com/512/2965/2965335.png"
    },
    "builtin_bash": {
        id: "builtin_bash",
        name: "Shell Executor",
        description: isWin ? "执行 PowerShell 命令" : "执行 Bash 命令",
        type: "builtin",
        isActive: true,
        isPersistent: false,
        tags: ["shell", "bash", "cmd"],
        logoUrl: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Bash_Logo_Colored.svg"
    },
    "builtin_search": {
        id: "builtin_search",
        name: "Web Search",
        description: "使用 DuckDuckGo 进行免费联网搜索，获取相关网页标题、链接和摘要；抓取网页内容。",
        type: "builtin",
        isActive: true,
        isPersistent: false,
        tags: ["search", "web", "fetch"],
        logoUrl: "https://upload.wikimedia.org/wikipedia/en/9/90/The_DuckDuckGo_Duck.png"
    },
    "builtin_subagent": {
        id: "builtin_subagent",
        name: "Sub-Agent",
        description: "一个能够自主规划的子智能体。主智能体需显式分配工具给它。",
        type: "builtin",
        isActive: true,
        isPersistent: false,
        tags: ["agent"],
        logoUrl: "https://s2.loli.net/2026/01/22/tTsJjkpiOYAeGdy.png"
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
            name: "glob_files",
            description: "Fast file pattern matching to locate file paths. Use this to find files before reading them.",
            inputSchema: {
                type: "object",
                properties: {
                    pattern: { type: "string", description: "Glob pattern (e.g., 'src/**/*.ts' for recursive, '*.json' for current dir)." },
                    path: { type: "string", description: "Root directory to search. Defaults to current user home." }
                },
                required: ["pattern"]
            }
        },
        {
            name: "grep_search",
            description: "Search for patterns in file contents using Regex.",
            inputSchema: {
                type: "object",
                properties: {
                    pattern: { type: "string", description: "Regex pattern to search for." },
                    path: { type: "string", description: "Root directory to search." },
                    glob: { type: "string", description: "Glob pattern to filter files (e.g., '**/*.js')." },
                    output_mode: {
                        type: "string",
                        enum: ["content", "files_with_matches", "count"],
                        description: "Output mode: 'content' (lines), 'files_with_matches' (paths only), 'count'."
                    },
                    multiline: { type: "boolean", description: "Enable multiline matching." }
                },
                required: ["pattern"]
            }
        },
        {
            name: "read_file",
            description: "Read content from a local file path or a remote file. Supports text, code, and document parsing. For large files, use 'offset' and 'length' to read in chunks.",
            inputSchema: {
                type: "object",
                properties: {
                    file_path: { type: "string", description: "Absolute path to the local file OR a valid HTTP/HTTPS URL." },
                    offset: { type: "integer", description: "Optional. The character position to start reading from. Defaults to 0.", default: 0 },
                    length: { type: "integer", description: `Optional. Number of characters to read. Defaults to ${MAX_READ}.`, default: MAX_READ }
                },
                required: ["file_path"]
            }
        },
        {
            name: "write_file",
            description: "Create a new file or completely overwrite an existing file. CAUTION: This tool is ONLY for TEXT-BASED files (code, txt, md, json, etc.). DO NOT use this for binary or Office files (e.g., .docx, .xlsx, .pdf, .png) as it will corrupt them.",
            inputSchema: {
                type: "object",
                properties: {
                    file_path: { type: "string", description: "Absolute path to the file." },
                    content: { type: "string", description: "Full content to write to the file." }
                },
                required: ["file_path", "content"]
            }
        },
        {
            name: "edit_file",
            description: "String replacement for modifying code or text files. YOU MUST READ THE FILE FIRST to ensure you have the exact 'old_string'.",
            inputSchema: {
                type: "object",
                properties: {
                    file_path: { type: "string", description: "Absolute path to the local file." },
                    old_string: { type: "string", description: "The EXACT text to be replaced. Must be unique in the file unless replace_all is true." },
                    new_string: { type: "string", description: "The new text to replace with." },
                    replace_all: { type: "boolean", description: "If true, replaces all occurrences. If false, fails if old_string is not unique." }
                },
                required: ["file_path", "old_string", "new_string"]
            }
        },
        {
            name: "replace_pattern",
            description: "Efficient replace text in a file using JavaScript RegExp. Efficient for making specific changes (e.g., renaming variables, updating arguments) without rewriting the whole file. Supports capture groups ($1, $2).",
            inputSchema: {
                type: "object",
                properties: {
                    file_path: { type: "string", description: "Absolute path to the file." },
                    pattern: { type: "string", description: "The Regex pattern to search for. (e.g. 'function oldName\\((.*?)\\)')" },
                    replacement: { type: "string", description: "The replacement text. Use $1, $2 for capture groups." },
                    flags: { type: "string", description: "RegExp flags. Defaults to 'gm'.", default: "gm" }
                },
                required: ["file_path", "pattern", "replacement"]
            }
        },
        {
            name: "insert_content",
            description: "Efficient insert content into a file. Supports two modes: 1. By 'anchor_pattern' (Recommended, safer). 2. By 'line_number' (Use ONLY if you have verified the exact line number via grep_search).",
            inputSchema: {
                type: "object",
                properties: {
                    file_path: { type: "string", description: "Absolute path to the file." },
                    content: { type: "string", description: "The content to insert." },
                    anchor_pattern: { type: "string", description: "Mode A: A unique regex pattern to locate the insertion point." },
                    line_number: { type: "integer", description: "Mode B: Absolute line number (1-based). CAUTION: Only use if you recently retrieved the line number using 'grep_search'." },
                    direction: {
                        type: "string",
                        enum: ["before", "after"],
                        description: "Insert 'before' or 'after' the anchor/line. Defaults to 'after'.",
                        default: "after"
                    }
                },
                required: ["file_path", "content"]
            }
        }
    ],
    "builtin_bash": [
        {
            name: "execute_bash_command",
            description: `Execute a shell command on the current ${currentOS} system. Note: Long-running commands (like servers) will be terminated after the timeout (default 15s) to prevent blocking.`,
            inputSchema: {
                type: "object",
                properties: {
                    command: { type: "string", description: `The command to execute (e.g., 'ls -la', 'git status', 'npm install'). Current OS: ${currentOS}.` },
                    timeout: {
                        type: "integer",
                        description: "Optional. Timeout in milliseconds. Default is 15000 (15 seconds). Set higher (e.g., 300000 for 5 mins) for long-running tasks like installations.",
                        default: 15000
                    }
                },
                required: ["command"]
            }
        }
    ],
    "builtin_search": [
        {
            name: "web_search",
            description: "Search the internet for a given query. Returns snippets only. Constraint: After replying, 'Sources:' citation links must be included.",
            inputSchema: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search keywords." },
                    count: { type: "integer", description: "Number of results to return (default 5, max 10)." },
                    language: {
                        type: "string",
                        description: "Preferred language/region code (e.g., 'zh-CN', 'en-US', 'jp'). Defaults to 'zh-CN'."
                    }
                },
                required: ["query"]
            }
        },
        {
            name: "web_fetch",
            description: "Retrieve and parse the FULL text content of a specific URL. Use this when the user provides a URL or after getting a URL from search results. Capable of parsing complex pages like documentation, papers, and code repositories.",
            inputSchema: {
                type: "object",
                properties: {
                    url: { type: "string", description: "The URL of the webpage to read." },
                    offset: { type: "integer", description: "Optional. The character position to start reading from. Defaults to 0.", default: 0 },
                    length: { type: "integer", description: `Optional. Number of characters to read. Defaults to ${MAX_READ}.`, default: MAX_READ }
                },
                required: ["url"]
            }
        }
    ],
    "builtin_subagent": [
        {
            name: "sub_agent",
            description: "Delegates a complex task to a Sub-Agent. You can assign specific tools, set the planning depth, and provide context. The Sub-Agent will autonomous plan and execute.",
            inputSchema: {
                type: "object",
                properties: {
                    task: { type: "string", description: "The detailed task description." },
                    context: { type: "string", description: "Background info, previous conversation summary, code snippets, or user constraints. Do NOT leave empty if the task depends on previous messages." },
                    tools: {
                        type: "array",
                        items: { type: "string" },
                        description: "List of tool names to grant. You MUST explicitly list the tools required for the task. If omitted or empty, the Sub-Agent will have NO tools."
                    },
                    planning_level: {
                        type: "string",
                        enum: ["fast", "medium", "high", "custom"],
                        description: "Complexity level: 'fast'(10 steps), 'medium'(20 steps, default), 'high'(30 steps), or 'custom'."
                    },
                    custom_steps: {
                        type: "integer",
                        minimum: 10,
                        maximum: 100,
                        description: "Only used if planning_level is 'custom'."
                    }
                },
                required: ["task", "tools"]
            }
        }
    ],
};

// --- Helpers ---

// 路径解析器：相对路径默认相对于用户主目录，而不是插件运行目录
const resolvePath = (inputPath) => {
    if (!inputPath) return os.homedir();
    let p = inputPath.replace(/^["']|["']$/g, '');
    if (p.startsWith('~')) {
        p = path.join(os.homedir(), p.slice(1));
    }
    if (!path.isAbsolute(p)) {
        p = path.join(os.homedir(), p);
    }
    return path.normalize(p);
};

// 稳健的 Glob 转 Regex 转换器
const globToRegex = (glob) => {
    if (!glob) return null;

    // 1. 将 Glob 特殊符号替换为唯一的临时占位符
    // 必须先处理 ** (递归)，再处理 * (单层)
    let regex = glob
        .replace(/\\/g, '/') // 统一反斜杠为正斜杠，防止转义混乱
        .replace(/\*\*/g, '___DOUBLE_STAR___')
        .replace(/\*/g, '___SINGLE_STAR___')
        .replace(/\?/g, '___QUESTION___');

    // 2. 转义字符串中剩余的所有正则表达式特殊字符
    regex = regex.replace(/[\\^$|.+()\[\]{}]/g, '\\$&');

    // 3. 将占位符替换回对应的正则表达式逻辑
    // ** -> .* (匹配任意字符)
    regex = regex.replace(/___DOUBLE_STAR___/g, '.*');
    // * -> [^/]* (匹配除路径分隔符外的任意字符)
    regex = regex.replace(/___SINGLE_STAR___/g, '[^/\\\\]*');
    // ? -> . (匹配任意单个字符)
    regex = regex.replace(/___QUESTION___/g, '.');

    try {
        return new RegExp(`^${regex}$`, 'i'); // 忽略大小写
    } catch (e) {
        console.error("Glob regex conversion failed:", e);
        return /^__INVALID_GLOB__$/;
    }
};

// 路径标准化 (统一使用 /)
const normalizePath = (p) => p.split(path.sep).join('/');

// 递归文件遍历器
async function* walkDir(dir, maxDepth = 20, currentDepth = 0, signal = null) {
    if (signal && signal.aborted) return; // 响应中断
    if (currentDepth > maxDepth) return;
    try {
        const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const dirent of dirents) {
            if (signal && signal.aborted) return; // 循环中响应中断

            const res = path.resolve(dir, dirent.name);
            if (dirent.isDirectory()) {
                if (['node_modules', '.git', '.idea', '.vscode', 'dist', 'build', '__pycache__', '$RECYCLE.BIN', 'System Volume Information'].includes(dirent.name)) continue;
                yield* walkDir(res, maxDepth, currentDepth + 1, signal);
            } else {
                yield res;
            }
        }
    } catch (e) {
        // 忽略访问权限错误，防止遍历中断
    }
}

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

const runPythonScript = (code, interpreter, signal = null) => {
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

        // 监听中断信号
        if (signal) {
            signal.addEventListener('abort', () => {
                child.kill(); // 杀死子进程
                fs.unlink(tempFile, () => { }); // 清理临时文件
                resolve("Operation aborted by user.");
            });
        }

        let output = "";
        let errorOutput = "";

        child.stdout.on('data', (data) => { output += data.toString(); });
        child.stderr.on('data', (data) => { errorOutput += data.toString(); });

        child.on('close', (code) => {
            fs.unlink(tempFile, () => { }); // Cleanup
            if (signal && signal.aborted) return; // 如果已中断，忽略 close 事件
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

async function runSubAgent(args, globalContext, signal) {
    const { task, context: userContext, tools: allowedToolNames, planning_level, custom_steps } = args;
    const { apiKey, baseUrl, model, tools: allToolDefinitions, mcpSystemPrompt, onUpdate } = globalContext;

    // --- 1. 工具权限控制 (最小权限原则) ---
    // 默认没有任何工具权限
    let availableTools = [];

    // 只有当 allowedToolNames 被明确提供且为非空数组时，才进行筛选并授予权限
    if (allowedToolNames && Array.isArray(allowedToolNames) && allowedToolNames.length > 0) {
        const allowedSet = new Set(allowedToolNames);
        availableTools = (allToolDefinitions || []).filter(t =>
            allowedSet.has(t.function.name) && t.function.name !== 'sub_agent' // 排除自身，防止递归
        );
    }

    // --- 2. 步骤控制 ---
    let MAX_STEPS = 20; // Default medium
    if (planning_level === 'fast') MAX_STEPS = 10;
    else if (planning_level === 'high') MAX_STEPS = 30;
    else if (planning_level === 'custom' && custom_steps) MAX_STEPS = Math.min(100, Math.max(10, custom_steps));

    // --- 3. 提示词构建 ---

    // System Prompt: 身份、规则、环境
    const systemInstruction = `You are a specialized Sub-Agent Worker.
Your Role: Autonomous task executor.
Strategy: Plan, execute tools, observe results, and iterate until the task is done.
Output: When finished, output the final answer directly as text. Do NOT ask the user for clarification unless all tools fail.
${mcpSystemPrompt ? '\n' + mcpSystemPrompt : ''}`;

    // User Prompt: 具体任务、上下文、限制
    const userInstruction = `## Current Assignment
**Task**: ${task}

**Context & Background**:
${userContext || 'No additional context provided.'}

**Execution Constraints**:
- Maximum Steps: ${MAX_STEPS}
- Please start by analyzing the task and available tools.`;

    const messages = [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userInstruction }
    ];

    let step = 0;

    // 用于记录完整过程的日志
    const executionLog = [];
    const log = (msg) => {
        executionLog.push(msg);
        // 实时回调给前端
        if (onUpdate && typeof onUpdate === 'function') {
            onUpdate(executionLog.join('\n'));
        }
    };

    log(`[Sub-Agent] Started. Max steps: ${MAX_STEPS}. Tools: ${availableTools.map(t => t.function.name).join(', ') || 'None'}`);

    // 动态导入
    const { invokeMcpTool } = require('./mcp.js');

    while (step < MAX_STEPS) {
        if (signal && signal.aborted) throw new Error("Sub-Agent execution aborted by user.");
        step++;

        log(`\n--- Step ${step}/${MAX_STEPS} ---`);

        try {
            // 3.1 LLM 思考
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Array.isArray(apiKey) ? apiKey[0] : apiKey.split(',')[0].trim()}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    tools: availableTools.length > 0 ? availableTools : undefined,
                    tool_choice: availableTools.length > 0 ? "auto" : undefined,
                    stream: false
                }),
                signal: signal
            });

            if (!response.ok) {
                const err = `API Call failed: ${response.status}`;
                log(`[Error] ${err}`);
                return `[Sub-Agent Error] ${err}`;
            }

            const data = await response.json();
            const message = data.choices[0].message;
            messages.push(message);

            // 3.2 决策
            if (message.content) {
                log(`[Thought] ${message.content}`);
            }

            if (!message.tool_calls || message.tool_calls.length === 0) {
                log(`[Result] Task Completed.`);
                // 返回最终结果
                return message.content || "[Sub-Agent finished without content]";
            }

            // 3.3 执行工具
            for (const toolCall of message.tool_calls) {
                if (signal && signal.aborted) throw new Error("Sub-Agent execution aborted.");

                const toolName = toolCall.function.name;
                let toolArgsObj = {};
                let toolResult = "";

                try {
                    toolArgsObj = JSON.parse(toolCall.function.arguments);
                    log(`[Action] Calling ${toolName}...`);

                    // 执行
                    const result = await invokeMcpTool(toolName, toolArgsObj, signal, null);

                    if (typeof result === 'string') toolResult = result;
                    else if (Array.isArray(result)) toolResult = result.map(i => i.text || JSON.stringify(i)).join('\n');
                    else toolResult = JSON.stringify(result);

                    log(`[Observation] Tool output length: ${toolResult.length} chars.`);

                } catch (e) {
                    if (e.name === 'AbortError') throw e;
                    toolResult = `Error: ${e.message}`;
                    log(`[Error] Tool execution failed: ${e.message}`);
                }

                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: toolResult
                });
            }
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            log(`[Critical Error] ${e.message}`);
            return `[Sub-Agent Error] ${e.message}`;
        }
    }

    log(`[Stop] Reached maximum step limit.`);

    // 定义静态兜底报告生成逻辑 (以防最后一次 LLM 调用失败)
    const generateStaticReport = () => {
        let report = `[Sub-Agent Warning] Execution stopped because the maximum step limit (${MAX_STEPS}) was reached.\n\n`;
        const lastMessage = messages[messages.length - 1];
        if (lastMessage) {
            report += `### Last State\n`;
            if (lastMessage.role === 'tool') {
                report += `Tool '${lastMessage.name}' output: ${lastMessage.content.slice(0, 500)}...\n`;
            } else if (lastMessage.content) {
                report += `Assistant thought: ${lastMessage.content}\n`;
            }
        }
        report += `\n### Execution Log Summary\n`;
        const recentLogs = executionLog.slice(-5).join('\n');
        report += recentLogs;
        return report;
    };

    // 达到步数限制后，让 AI 总结当前进展
    try {
        log(`[System] Requesting status summary from Sub-Agent...`);
        messages.push({
            role: 'user',
            content: "SYSTEM ALERT: You have reached the maximum number of steps allowed. Please provide a concise summary of:\n1. What has been successfully completed.\n2. What is the current status/obstacles.\n3. What specific actions remain to be done.\nDo not use any tools, just answer with text."
        });

        const summaryResponse = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Array.isArray(apiKey) ? apiKey[0] : apiKey.split(',')[0].trim()}`
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                tools: availableTools.length > 0 ? availableTools : undefined,
                tool_choice: availableTools.length > 0 ? "auto" : undefined,
                stream: false
            }),
            signal: signal
        });

        if (summaryResponse.ok) {
            const data = await summaryResponse.json();
            const summaryContent = data.choices[0].message.content;
            if (summaryContent) {
                return `[Sub-Agent Timeout Summary]\n${summaryContent}\n\n(System Note: The sub-agent stopped because the step limit of ${MAX_STEPS} was reached. You may need to ask the user to increase 'planning_level' or guide the sub-agent to continue from this state.)`;
            }
        } else {
            log(`[Error] Summary API call failed: ${summaryResponse.status}`);
        }
    } catch (e) {
        log(`[Error] Failed to generate summary: ${e.message}`);
    }

    // 如果总结失败，返回静态报告
    return generateStaticReport() + `\n\n[Instruction for Main Agent]: Please check the conversation context or files to see if the task was partially completed.`;
}

// 辅助函数：处理 LLM 传入的转义字符，将 \\n 转换为 \n
const unescapeContent = (str) => {
    if (typeof str !== 'string') return str;
    return str
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');
};

// --- Execution Handlers ---
const handlers = {
    // Python
    list_python_interpreters: async () => {
        const paths = await findAllPythonPaths();
        return JSON.stringify(paths, null, 2);
    },
    run_python_code: async ({ code, interpreter }, context, signal) => {
        return await runPythonScript(code, interpreter, signal);
    },
    run_python_file: async ({ file_path, working_directory, interpreter, args = [] }, context, signal) => {
        return new Promise(async (resolve, reject) => {
            const cleanPath = file_path.replace(/^["']|["']$/g, '');
            if (!fs.existsSync(cleanPath)) return resolve(`Error: Python file not found at ${cleanPath}`);

            let pythonPath = interpreter;
            if (!pythonPath) {
                const paths = await findAllPythonPaths();
                pythonPath = paths.length > 0 ? paths[0] : (isWin ? 'python' : 'python3');
            }

            const cwd = working_directory ? working_directory.replace(/^["']|["']$/g, '') : path.dirname(cleanPath);
            if (!fs.existsSync(cwd)) return resolve(`Error: Working directory not found at ${cwd}`);

            const scriptArgs = Array.isArray(args) ? args : [args];
            const spawnArgs = [cleanPath, ...scriptArgs];
            const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };

            const child = spawn(pythonPath, spawnArgs, { cwd, env });

            // 中断处理
            if (signal) {
                signal.addEventListener('abort', () => {
                    child.kill();
                    resolve('Execution aborted by user.');
                });
            }

            let output = "";
            let errorOutput = "";

            child.stdout.on('data', (data) => { output += data.toString(); });
            child.stderr.on('data', (data) => { errorOutput += data.toString(); });

            child.on('close', (code) => {
                if (signal && signal.aborted) return;
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

    // --- File Operations Handlers ---

    // 1. Glob Files
    glob_files: async ({ pattern, path: searchPath }, context, signal) => {
        try {
            let rootDir = "";
            let globPattern = pattern;

            // 检测是否以盘符开头 (Win) 或 / 开头 (Unix)，且 searchPath 未指定或为默认
            const isAbsolutePath = path.isAbsolute(pattern) || /^[a-zA-Z]:[\\/]/.test(pattern);

            if (isAbsolutePath) {
                const magicIndex = pattern.search(/[*?\[{]/);
                if (magicIndex > -1) {
                    const basePath = pattern.substring(0, magicIndex);
                    const lastSep = Math.max(basePath.lastIndexOf('/'), basePath.lastIndexOf('\\'));

                    if (lastSep > -1) {
                        rootDir = basePath.substring(0, lastSep + 1); // 包含分隔符
                        globPattern = pattern.substring(lastSep + 1); // 剩余部分作为 pattern

                        if (!searchPath || searchPath === '~' || searchPath === os.homedir()) {
                            searchPath = rootDir;
                        } else {
                            globPattern = pattern.replace(normalizePath(resolvePath(searchPath)), '').replace(/^[\\/]/, '');
                        }
                    }
                }
            }
            // -----------------------------------------------------------

            rootDir = resolvePath(searchPath);
            if (!fs.existsSync(rootDir)) return `Error: Directory not found: ${rootDir}`;
            if (!isPathSafe(rootDir)) return `[Security Block] Access restricted.`;

            const results = [];
            // 如果 globPattern 为空（完全被提取为路径），默认匹配所有
            const regex = globToRegex(globPattern || "**/*");
            if (!regex) return "Error: Invalid glob pattern.";

            const MAX_RESULTS = 5000;
            const normalizedRoot = normalizePath(rootDir);

            // 传递 signal 给 walkDir
            for await (const filePath of walkDir(rootDir, 20, 0, signal)) {
                if (signal && signal.aborted) throw new Error("Operation aborted by user.");

                const normalizedFilePath = normalizePath(filePath);

                // 计算相对路径
                let relativePath = normalizedFilePath.replace(normalizedRoot, '');
                if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);

                // 匹配相对路径 或 文件名
                if (regex.test(relativePath) || regex.test(path.basename(filePath))) {
                    results.push(filePath);
                }
                if (results.length >= MAX_RESULTS) break;
            }

            if (results.length === 0) return `No files matched in ${rootDir}.`;
            return results.join('\n') + (results.length >= MAX_RESULTS ? `\n... (Limit reached: ${MAX_RESULTS})` : '');
        } catch (e) {
            return `Glob error: ${e.message}`;
        }
    },

    // 2. Grep Search
    grep_search: async ({ pattern, path: searchPath, glob, output_mode = 'content', multiline = false }, context, signal) => {
        try {
            const rootDir = resolvePath(searchPath);
            if (!fs.existsSync(rootDir)) return `Error: Directory not found: ${rootDir}`;

            const regexFlags = multiline ? 'gmi' : 'gi';
            let searchRegex;
            try {
                searchRegex = new RegExp(pattern, regexFlags);
            } catch (e) { return `Invalid Regex: ${e.message}`; }

            const globRegex = glob ? globToRegex(glob) : null;
            const normalizedRoot = normalizePath(rootDir);

            const results = [];
            let matchCount = 0;
            const MAX_SCANNED = 5000; // 限制扫描文件数防止卡死
            let scanned = 0;

            // 传递 signal 给 walkDir
            for await (const filePath of walkDir(rootDir, 20, 0, signal)) {
                if (signal && signal.aborted) throw new Error("Operation aborted by user."); // 响应中断
                if (scanned++ > MAX_SCANNED) {
                    results.push(`\n[System] Scan limit reached (${MAX_SCANNED} files). Please narrow down your search path.`);
                    break;
                }

                // Glob 过滤
                if (globRegex) {
                    const normalizedFilePath = normalizePath(filePath);
                    let relativePath = normalizedFilePath.replace(normalizedRoot, '');
                    if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);

                    if (!globRegex.test(relativePath) && !globRegex.test(path.basename(filePath))) continue;
                }

                // 跳过二进制文件
                const ext = path.extname(filePath).toLowerCase();
                if (['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.exe', '.bin', '.zip', '.node', '.dll', '.db'].includes(ext)) continue;

                try {
                    const stats = await fs.promises.stat(filePath);
                    if (stats.size > 1024 * 1024) continue; // 跳过大文件

                    const content = await fs.promises.readFile(filePath, { encoding: 'utf-8', signal }); // [修改] 传递 signal

                    if (output_mode === 'files_with_matches') {
                        if (searchRegex.test(content)) {
                            results.push(filePath);
                            searchRegex.lastIndex = 0;
                        }
                    } else {
                        const matches = [...content.matchAll(searchRegex)];
                        if (matches.length > 0) {
                            matchCount += matches.length;
                            if (output_mode === 'count') continue;

                            const lines = content.split(/\r?\n/);
                            matches.forEach(m => {
                                const offset = m.index;
                                const lineNum = content.substring(0, offset).split(/\r?\n/).length;
                                const lineContent = lines[lineNum - 1].trim();
                                results.push(`${filePath}:${lineNum}: ${lineContent.substring(0, 100)}`);
                            });
                        }
                    }
                } catch (readErr) { /* ignore */ }
            }

            if (output_mode === 'count') return `Total matches: ${matchCount}`;
            if (results.length === 0) return "No matches found.";
            return results.join('\n');
        } catch (e) {
            return `Grep error: ${e.message}`;
        }
    },

    // 3. Read File
    read_file: async ({ file_path, offset = 0, length = MAX_READ }, context, signal) => {
        try {
            const MAX_SINGLE_READ = MAX_READ;
            const readLength = Math.min(length, MAX_SINGLE_READ);
            let fileForHandler;

            if (file_path.startsWith('http://') || file_path.startsWith('https://')) {
                // 处理 URL
                try {
                    // [修改] 传递 signal
                    const response = await fetch(file_path, { signal });
                    if (!response.ok) {
                        return `Error fetching URL: ${response.status} ${response.statusText}`;
                    }
                    // ... (后续逻辑保持不变)
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
                const safePath = resolvePath(file_path);
                if (!isPathSafe(safePath)) {
                    return `[Security Block] Access to sensitive system file '${path.basename(safePath)}' is restricted.`;
                }

                if (!fs.existsSync(safePath)) return `Error: File not found at ${safePath}`;

                // 传递 signal 给 readFile (Node v14.17+ 支持)
                const fileBuffer = await fs.promises.readFile(safePath, { signal });
                const stats = await fs.promises.stat(safePath);

                if (stats.size > 200 * 1024 * 1024) {
                    return `Error: File is too large for processing (>200MB).`;
                }

                // 构造 File 对象逻辑简化，避免依赖前端对象
                // 这里直接用 buffer 处理
                const base64String = fileBuffer.toString('base64');
                const ext = path.extname(safePath).toLowerCase();
                // 简单的 mime 推断
                const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' }[ext] || 'application/octet-stream';
                const dataUrl = `data:${mime};base64,${base64String}`;

                fileForHandler = {
                    name: path.basename(safePath),
                    size: stats.size,
                    type: mime,
                    url: dataUrl
                };
            }

            const result = await parseFileObject(fileForHandler);
            if (!result) return "Error: Unsupported file type or parsing failed.";

            let fullText = "";
            if (result.type === 'text' && result.text) {
                fullText = result.text;
            } else {
                const typeInfo = result.type === 'image_url' ? 'Image' : 'Binary/PDF';
                return `[System] File '${fileForHandler.name}' detected as ${typeInfo}. \nContent extraction is currently NOT supported via this tool for binary formats in this context.`;
            }

            // --- 分页读取逻辑 ---
            const totalChars = fullText.length;
            const startPos = Math.max(0, offset);
            const contentChunk = fullText.substring(startPos, startPos + readLength);
            const remainingChars = totalChars - (startPos + contentChunk.length);

            let output = contentChunk;

            if (remainingChars > 0) {
                const nextOffset = startPos + contentChunk.length;
                output += `\n\n--- [SYSTEM NOTE: CONTENT TRUNCATED] ---\n`;
                output += `Total characters in file: ${totalChars}\n`;
                output += `Current chunk: ${startPos} to ${nextOffset}\n`;
                output += `Remaining unread characters: ${remainingChars}\n`;
                output += `To read more, call read_file with offset: ${nextOffset}\n`;
                output += `---------------------------------------`;
            } else if (startPos > 0) {
                output += `\n\n--- [SYSTEM NOTE: END OF FILE REACHED] ---`;
            }

            return output;

        } catch (e) {
            return `Error reading file: ${e.message}`;
        }
    },

    // 4. Edit File
    edit_file: async ({ file_path, old_string, new_string, replace_all = false }) => {
        try {
            const safePath = resolvePath(file_path);
            if (!isPathSafe(safePath)) return `[Security Block] Access denied to ${safePath}.`;
            if (!fs.existsSync(safePath)) return `Error: File not found: ${safePath}`;

            let content = await fs.promises.readFile(safePath, 'utf-8');

            // 处理转义字符
            const targetOld = unescapeContent(old_string);
            const targetNew = unescapeContent(new_string);

            // 检查 old_string 是否存在
            if (!content.includes(targetOld)) {
                return `Error: 'old_string' not found in file. Please ensure you read the file first and use the exact string.`;
            }

            // 检查唯一性
            if (!replace_all) {
                // 计算出现次数
                const count = content.split(targetOld).length - 1;
                if (count > 1) {
                    return `Error: 'old_string' occurs ${count} times. Please set 'replace_all' to true if you intend to replace all, or provide a more unique context string.`;
                }
            }

            if (replace_all) {
                content = content.split(targetOld).join(targetNew);
            } else {
                content = content.replace(targetOld, targetNew);
            }

            await fs.promises.writeFile(safePath, content, 'utf-8');
            return `Successfully edited ${path.basename(safePath)}.`;

        } catch (e) {
            return `Edit failed: ${e.message}`;
        }
    },

    // 5. Write File
    write_file: async ({ file_path, content }) => {
        try {
            const safePath = resolvePath(file_path);
            if (!isPathSafe(safePath)) return `[Security Block] Access denied to ${safePath}.`;

            // --- 二进制/Office 文件保护拦截 ---
            const ext = path.extname(safePath).toLowerCase();
            const binaryExtensions = [
                '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.odt', '.ods',
                '.pdf', '.epub', '.mobi',
                '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.mp3', '.wav', '.mp4', '.mov',
                '.zip', '.rar', '.7z', '.tar', '.gz', '.exe', '.dll', '.bin', '.so', '.dmg'
            ];

            if (binaryExtensions.includes(ext)) {
                return `[Operation Blocked] The 'write_file' tool only supports text-based files. Writing text content to a '${ext}' file will corrupt its binary structure.`;
            }
            // ----------------------------------------

            const dir = path.dirname(safePath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }

            // 处理转义字符
            const processedContent = unescapeContent(content);

            await fs.promises.writeFile(safePath, processedContent, 'utf-8');
            return `Successfully wrote to ${safePath}`;
        } catch (e) {
            return `Write failed: ${e.message}`;
        }
    },

    // 6. Regex Pattern Replace
    replace_pattern: async ({ file_path, pattern, replacement, flags = 'gm' }) => {
        try {
            const safePath = resolvePath(file_path);
            if (!isPathSafe(safePath)) return `[Security Block] Access denied to ${safePath}.`;
            if (!fs.existsSync(safePath)) return `Error: File not found: ${safePath}`;

            let content = await fs.promises.readFile(safePath, 'utf-8');

            let regex;
            try {
                regex = new RegExp(pattern, flags);
            } catch (e) {
                return `Invalid Regex Pattern: ${e.message}`;
            }

            if (!regex.test(content)) {
                return `Error: Pattern '${pattern}' not found in file. No changes made.`;
            }

            regex.lastIndex = 0;

            // 处理 replacement 中的转义字符
            const processedReplacement = unescapeContent(replacement);

            const newContent = content.replace(regex, processedReplacement);

            if (newContent === content) {
                return `Warning: Pattern matched but content remained identical after replacement.`;
            }

            await fs.promises.writeFile(safePath, newContent, 'utf-8');
            return `Successfully replaced pattern in ${path.basename(safePath)}.`;

        } catch (e) {
            return `Replace error: ${e.message}`;
        }
    },

    // 7. Insert Content (Dual Mode: Line or Anchor)
    insert_content: async ({ file_path, content, line_number, anchor_pattern, direction = 'after' }) => {
        try {
            const safePath = resolvePath(file_path);
            if (!isPathSafe(safePath)) return `[Security Block] Access denied to ${safePath}.`;
            if (!fs.existsSync(safePath)) return `Error: File not found: ${safePath}`;

            let fileContent = await fs.promises.readFile(safePath, 'utf-8');
            
            // 处理要插入内容的转义字符
            const processedContent = unescapeContent(content);

            // --- 模式 A: 基于行号 (高风险，需精确) ---
            if (line_number !== undefined && line_number !== null) {
                const lines = fileContent.split(/\r?\n/);
                const targetIndex = parseInt(line_number) - 1; // 转为 0-based

                if (isNaN(targetIndex) || targetIndex < 0 || targetIndex > lines.length) {
                    return `Error: Line number ${line_number} is out of bounds (File has ${lines.length} lines).`;
                }

                // 处理插入位置
                const insertPos = direction === 'before' ? targetIndex : targetIndex + 1;

                // 将新内容按行拆分插入，保持数组结构
                const contentLines = processedContent.split(/\r?\n/);
                lines.splice(insertPos, 0, ...contentLines);

                await fs.promises.writeFile(safePath, lines.join('\n'), 'utf-8');
                return `Successfully inserted content at line ${line_number} in ${path.basename(safePath)}.`;
            }

            // --- 模式 B: 基于正则锚点 (推荐) ---
            if (anchor_pattern) {
                let regex;
                try {
                    // 使用多行模式 'm'，以便 ^$ 匹配行
                    regex = new RegExp(anchor_pattern, 'm');
                } catch (e) { return `Invalid Anchor Regex: ${e.message}`; }

                if (!regex.test(fileContent)) {
                    return `Error: Anchor pattern '${anchor_pattern}' not found in file.`;
                }

                // 使用回调函数替换，防止插入内容中的 $ 被误解析
                const newFullContent = fileContent.replace(regex, (matchedStr) => {
                    // 确保插入内容前后有换行符，避免粘连
                    if (direction === 'before') {
                        return `${processedContent}\n${matchedStr}`;
                    } else {
                        return `${matchedStr}\n${processedContent}`;
                    }
                });

                await fs.promises.writeFile(safePath, newFullContent, 'utf-8');
                return `Successfully inserted content ${direction} anchor pattern in ${path.basename(safePath)}.`;
            }

            return `Error: You must provide either 'line_number' or 'anchor_pattern'.`;

        } catch (e) {
            return `Insert error: ${e.message}`;
        }
    },

    // Bash / PowerShell
    execute_bash_command: async ({ command, timeout = 15000 }, context, signal) => {
        return new Promise((resolve) => {
            const trimmedCmd = command.trim();

            // 高危命令简单拦截 (保持原有逻辑)
            const dangerousPatterns = [
                /(^|[;&|\s])rm\s+(-rf|-r|-f)\s+\/($|[;&|\s])/i, // rm -rf / (防止误删根目录)
                />\s*\/dev\/sd/i,     // 写入设备
                /\bmkfs\b/i,          // mkfs 格式化
                /\bdd\s+/i,           // dd (使用单词边界，修复 pnpm add 误判)
                /\bwget\s+/i,         // wget 下载
                /\bcurl\s+.*\|\s*sh/i,// curl | sh 管道执行
                /\bchmod\s+777/i,     // chmod 777
                /\bcat\s+.*id_rsa/i   // 读取私钥
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

            const validTimeout = (typeof timeout === 'number' && timeout > 0) ? timeout : 15000;

            // [修改] encoding 设置为 buffer，手动处理解码以支持多语言
            let shellOptions = {
                cwd: bashCwd,
                encoding: 'buffer',
                maxBuffer: 1024 * 1024 * 10,
                timeout: validTimeout
            };

            let finalCommand = command;
            let shellToUse;

            if (isWin) {
                shellToUse = 'powershell.exe';
                // Windows 编码配置
                // 1. [Console]::OutputEncoding: 确保 Node.js 拿到的 stdout 是 UTF-8
                // 2. $OutputEncoding: 确保管道符 | 传递的是 UTF-8
                // 3. $PSDefaultParameterValues: 确保 >> (Out-File/Add-Content) 写入文件时使用 UTF-8 (无BOM)，解决截图中的 NUL 问题
                const preamble = `
                    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
                    $OutputEncoding = [System.Text.Encoding]::UTF8;
                    $PSDefaultParameterValues['*:Encoding'] = 'utf8';
                `.replace(/\s+/g, ' ');

                finalCommand = `${preamble} ${command}`;
                shellOptions.shell = shellToUse;
            } else {
                shellToUse = '/bin/bash';
                shellOptions.shell = shellToUse;
            }

            // 保存子进程引用
            const child = exec(finalCommand, shellOptions, (error, stdout, stderr) => {
                // 解码辅助函数
                const decodeBuffer = (buf) => {
                    if (!buf || buf.length === 0) return "";
                    try {
                        // 优先尝试 UTF-8 解码
                        return new TextDecoder('utf-8').decode(buf);
                    } catch (e) {
                        // 兜底直接转字符串
                        return buf.toString();
                    }
                };

                let result = "";
                const outStr = decodeBuffer(stdout);
                const errStr = decodeBuffer(stderr);

                if (outStr) result += outStr;
                if (errStr) result += `\n[Stderr]: ${errStr}`;

                if (error) {
                    if (error.signal === 'SIGTERM') {
                        result += `\n[System Note]: Command timed out after ${validTimeout / 1000}s and was terminated.`;
                    } else if (error.killed) {
                        result += `\n[System Note]: Command was aborted by user.`;
                    } else {
                        result += `\n[Error Code]: ${error.code}`;
                        if (error.message && !errStr) result += `\n[Message]: ${error.message}`;
                    }
                }

                if (!result.trim()) result = "Command executed successfully (no output).";
                resolve(`[CWD: ${bashCwd}]\n${result}`);
            });

            // 响应中断信号
            if (signal) {
                signal.addEventListener('abort', () => {
                    child.kill(); // 杀死子进程
                });
            }
        });
    },

    // Web Search Handler
    web_search: async ({ query, count = 5, language = 'zh-CN' }, context, signal) => {
        try {
            const limit = Math.min(Math.max(parseInt(count) || 5, 1), 10);
            const url = "https://html.duckduckgo.com/html/";

            let ddgRegion = 'cn-zh';
            let acceptLang = 'zh-CN,zh;q=0.9,en;q=0.8';

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
                ddgRegion = 'wt-wt';
                acceptLang = 'en-US,en;q=0.9';
            }

            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": acceptLang,
                "Content-Type": "application/x-www-form-urlencoded",
                "Origin": "https://html.duckduckgo.com",
                "Referer": "https://html.duckduckgo.com/"
            };

            const body = new URLSearchParams();
            body.append('q', query);
            body.append('b', '');
            body.append('kl', ddgRegion);

            // 传递 signal
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: body,
                signal: signal
            });

            if (!response.ok) throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
            const html = await response.text();

            const results = [];
            const titleLinkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
            const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
            const titles = [...html.matchAll(titleLinkRegex)];
            const snippets = [...html.matchAll(snippetRegex)];
            const decodeHtml = (str) => {
                if (!str) return "";
                return str
                    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
                    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
                    .replace(/<b>/g, "").replace(/<\/b>/g, "").replace(/\s+/g, " ").trim();
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
                } catch (e) { }
                results.push({
                    title: decodeHtml(titleRaw),
                    link: link,
                    snippet: decodeHtml(snippetRaw)
                });
            }
            if (results.length === 0) {
                if (ddgRegion === 'cn-zh') return JSON.stringify({ message: "No results found in Chinese region. Try setting language='en' or 'all'.", query: query });
                return JSON.stringify({ message: "No results found.", query: query });
            }
            return JSON.stringify(results, null, 2);

        } catch (e) {
            return `Search failed: ${e.message}`;
        }
    },

    // Web Fetch Handler
    web_fetch: async ({ url, offset = 0, length = MAX_READ }, context, signal) => {
        try {
            if (!url || !url.startsWith('http')) {
                return "Error: Invalid URL. Please provide a full URL starting with http:// or https://";
            }

            const MAX_SINGLE_READ = MAX_READ;
            const readLength = Math.min(length, MAX_SINGLE_READ);

            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "Referer": "https://www.google.com/"
            };

            const response = await fetch(url, { headers, redirect: 'follow', signal });

            if (response.status === 403 || response.status === 521) {
                return `Failed to fetch page (Anti-bot protection ${response.status}).`;
            }
            if (!response.ok) {
                return `Failed to fetch page. Status: ${response.status} ${response.statusText}`;
            }
            const contentType = response.headers.get('content-type') || '';
            const rawText = await response.text();
            let fullText = "";
            if (contentType.includes('application/json')) {
                try { fullText = JSON.stringify(JSON.parse(rawText), null, 2); } catch (e) { fullText = rawText; }
            } else {
                const metadata = extractMetadata(rawText);
                const markdownBody = convertHtmlToMarkdown(rawText, url);
                if (!markdownBody || markdownBody.length < 50) {
                    return `Fetched URL: ${url}\n\nTitle: ${metadata.title}\n\n[System Info]: The extracted content is very short.`;
                }
                fullText = `URL: ${url}\n\n`;
                if (metadata.title) fullText += `# ${metadata.title}\n\n`;
                if (metadata.description) fullText += `> **Description:** ${metadata.description}\n\n`;
                fullText += `---\n\n${markdownBody}`;
            }
            const totalChars = fullText.length;
            const startPos = Math.max(0, offset);
            const contentChunk = fullText.substring(startPos, startPos + readLength);
            const remainingChars = totalChars - (startPos + contentChunk.length);
            let result = contentChunk;
            if (remainingChars > 0) {
                const nextOffset = startPos + contentChunk.length;
                result += `\n\n--- [SYSTEM NOTE: CONTENT TRUNCATED] ---\n`;
                result += `Total characters: ${totalChars}. Current chunk: ${startPos}-${nextOffset}.\n`;
                result += `Remaining: ${remainingChars}. Call 'web_fetch' with offset=${nextOffset} to read more.\n`;
            } else if (startPos > 0) {
                result += `\n\n--- [SYSTEM NOTE: END OF PAGE REACHED] ---`;
            }
            return result;

        } catch (e) {
            return `Error fetching page: ${e.message}`;
        }
    },

    // Sub Agent Handler
    sub_agent: async (args, globalContext, signal) => {
        if (!globalContext || !globalContext.apiKey) {
            return "Error: Sub-Agent requires global context(should be in a chat session).";
        }
        return await runSubAgent(args, globalContext, signal);
    }
};

// --- Exports ---

function getBuiltinServers() {
    return JSON.parse(JSON.stringify(BUILTIN_SERVERS));
}

function getBuiltinTools(serverId) {
    return BUILTIN_TOOLS[serverId] || [];
}

async function invokeBuiltinTool(toolName, args, signal = null, context = null) {
    if (handlers[toolName]) {
        const result = await handlers[toolName](args, context, signal);
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

        return JSON.stringify([{
            type: "text",
            text: text
        }], null, 2);
    }
    throw new Error(`Built-in tool '${toolName}' not found.`);
}

module.exports = {
    getBuiltinServers,
    getBuiltinTools,
    invokeBuiltinTool
};