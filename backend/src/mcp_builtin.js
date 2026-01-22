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
function convertHtmlToMarkdown(html) {
    let text = html;

    // --- 1. 核心内容定位 ---
    const articlePatterns = [
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<div[^>]*id=["'](?:article_content|content_views|js_content|post-content)["'][^>]*>([\s\S]*?)<\/div>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i
    ];
    
    for (const pattern of articlePatterns) {
        const match = text.match(pattern);
        if (match && match[1].length > 500) { 
            text = match[1];
            break;
        }
    }

    // --- 2. 移除无关标签 ---
    text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
    text = text.replace(/<(script|style|svg|noscript|header|footer|nav|aside|iframe|form|button|textarea)[^>]*>[\s\S]*?<\/\1>/gi, '');
    text = text.replace(/<div[^>]*(?:class|id)=["'][^"']*(?:sidebar|comment|recommend|advert|toolbar|operate|login|modal)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');

    // --- 3. 移除注释 ---
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // --- 4. 元素转换 Markdown ---
    text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (match, level, content) => {
        return `\n\n${'#'.repeat(level)} ${content.replace(/<[^>]+>/g, '').trim()}\n`;
    });

    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<li[^>]*>/gi, '- ');
    text = text.replace(/<\/(ul|ol)>/gi, '\n\n');
    text = text.replace(/<\/(p|div|tr|table|article|section|blockquote)>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');

    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, (match, src, alt) => {
        if (src.startsWith('data:image')) return ''; 
        return `\n![${alt.trim()}](${src})\n`;
    });
    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, (match, src) => {
        if (src.startsWith('data:image')) return ''; 
        return `\n![](${src})\n`;
    });

    text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, content) => {
        const cleanContent = content.replace(/<[^>]+>/g, '').trim();
        if (!cleanContent || href.startsWith('javascript:') || href.startsWith('#')) return cleanContent;
        return ` [${cleanContent}](${href}) `;
    });

    text = text.replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
    text = text.replace(/<(code|pre)[^>]*>([\s\S]*?)<\/\1>/gi, '\n```\n$2\n```\n');

    // --- 5. 移除剩余 HTML 标签 ---
    text = text.replace(/<[^>]+>/g, '');

    // --- 6. 实体解码 ---
    const entities = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&copy;': '©' };
    text = text.replace(/&[a-z0-9]+;/gi, (match) => entities[match] || '');

    // --- 7. 行级清洗 ---
    const lines = text.split('\n').map(line => line.trim());
    const cleanLines = [];
    
    const noiseKeywords = [
        /^最新推荐/, /^相关推荐/, /^文章标签/, /^版权声明/, /阅读\s*\d/, /点赞/, /收藏/, /分享/, /举报/, 
        /打赏/, /关注/, /登录/, /注册/, /Copyright/, /All rights reserved/, 
        /VIP/, /立即使用/, /福利倒计时/, /扫一扫/, /复制链接/
    ];

    for (let line of lines) {
        if (!line) continue;
        if (line.length < 2 && !line.match(/[a-zA-Z0-9]/)) continue;
        
        let isNoise = false;
        for (const regex of noiseKeywords) {
            if (regex.test(line)) { isNoise = true; break; }
        }
        if (isNoise) continue;

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
        name: "File Operations",
        description: "全能文件操作工具。支持 Glob 文件匹配、Grep 内容搜索、以及文件的读取、编辑和写入。支持本地文件及远程URL。",
        type: "builtin",
        isActive: false,
        isPersistent: false,
        tags: ["file", "fs", "read", "write", "edit", "search"],
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
    "builtin_subagent": {
        id: "builtin_subagent",
        name: "Sub-Agent",
        description: "一个能够自主规划的子智能体。主智能体需显式分配工具给它。",
        type: "builtin",
        isActive: false,
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
            name: "edit_file",
            description: "Precise string replacement for modifying code or text files. YOU MUST READ THE FILE FIRST to ensure you have the exact 'old_string'.",
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
            name: "write_file",
            description: "Create a new file or completely overwrite an existing file.",
            inputSchema: {
                type: "object",
                properties: {
                    file_path: { type: "string", description: "Absolute path to the file." },
                    content: { type: "string", description: "Full content to write to the file." }
                },
                required: ["file_path", "content"]
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
            description: "Search the internet for a given query and return the top N results (title, link, snippet). CRITICAL: The snippets are short and often insufficient. For detailed information you should usually follow this tool with 'web_fetch' to read the full content. Constraint: After replying, 'Sources:' citation links must be included.",
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
            name: "web_fetch",
            description: "Deeply read and parse the text content of a URL (converts HTML to Markdown). Use this to read the actual content of search results. For long pages, use 'offset' and 'length' to read in chunks. Constraint: After replying, 'Sources:' citation links must be included.",
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
async function* walkDir(dir, maxDepth = 20, currentDepth = 0) {
    if (currentDepth > maxDepth) return;
    try {
        const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const dirent of dirents) {
            const res = path.resolve(dir, dirent.name);
            if (dirent.isDirectory()) {
                if (['node_modules', '.git', '.idea', '.vscode', 'dist', 'build', '__pycache__'].includes(dirent.name)) continue;
                yield* walkDir(res, maxDepth, currentDepth + 1);
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

    log(`[Sub-Agent] Started. Max steps: ${MAX_STEPS}. Tools: ${availableTools.map(t=>t.function.name).join(', ') || 'None'}`);

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
    return `[Sub-Agent] Reached max steps (${MAX_STEPS}). Final state returned.`;
}

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

    // --- File Operations Handlers ---

    // 1. Glob Files
    glob_files: async ({ pattern, path: searchPath }) => {
        try {
            const rootDir = resolvePath(searchPath);
            if (!fs.existsSync(rootDir)) return `Error: Directory not found: ${rootDir}`;
            if (!isPathSafe(rootDir)) return `[Security Block] Access restricted.`;

            const results = [];
            const regex = globToRegex(pattern);
            if (!regex) return "Error: Invalid glob pattern.";

            const MAX_RESULTS = 200; 
            const normalizedRoot = normalizePath(rootDir);

            for await (const filePath of walkDir(rootDir)) {
                const normalizedFilePath = normalizePath(filePath);
                
                // 计算相对路径：例如 "src/main.ts"
                let relativePath = normalizedFilePath.replace(normalizedRoot, '');
                if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);

                // 匹配相对路径 或 文件名
                if (regex.test(relativePath) || regex.test(path.basename(filePath))) {
                    results.push(filePath);
                }
                if (results.length >= MAX_RESULTS) break;
            }

            if (results.length === 0) return "No files matched the pattern.";
            return results.join('\n') + (results.length >= MAX_RESULTS ? `\n... (Limit reached: ${MAX_RESULTS})` : '');
        } catch (e) {
            return `Glob error: ${e.message}`;
        }
    },

    // 2. Grep Search
    grep_search: async ({ pattern, path: searchPath, glob, output_mode = 'content', multiline = false }) => {
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
            const MAX_SCANNED = 2000; 
            let scanned = 0;

            for await (const filePath of walkDir(rootDir)) {
                if (scanned++ > MAX_SCANNED) break;

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
                    if (stats.size > 1024 * 1024) continue; 

                    const content = await fs.promises.readFile(filePath, 'utf-8');
                    
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
    read_file: async ({ file_path, offset = 0, length = MAX_READ }) => {
        try {
            const MAX_SINGLE_READ = MAX_READ;
            const readLength = Math.min(length, MAX_SINGLE_READ);
            let fileForHandler;

            if (file_path.startsWith('http://') || file_path.startsWith('https://')) {
                // 处理 URL
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
                const safePath = resolvePath(file_path);
                if (!isPathSafe(safePath)) {
                    return `[Security Block] Access to sensitive system file '${path.basename(safePath)}' is restricted.`;
                }
                
                if (!fs.existsSync(safePath)) return `Error: File not found at ${safePath}`;

                const stats = await fs.promises.stat(safePath);
                // 仅针对非文本的复杂解析文件（如 PDF）限制原始大小（50MB），普通文本读取由下方的字符截断控制
                if (stats.size > 200 * 1024 * 1024) {
                    return `Error: File is too large for processing (>50MB).`;
                }

                const fileObj = await handleFilePath(safePath);
                if (!fileObj) return `Error: Unable to access or read file at ${safePath}`;

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

            // 检查 old_string 是否存在
            if (!content.includes(old_string)) {
                return `Error: 'old_string' not found in file. Please ensure you read the file first and use the exact string.`;
            }

            // 检查唯一性
            if (!replace_all) {
                // 计算出现次数
                const count = content.split(old_string).length - 1;
                if (count > 1) {
                    return `Error: 'old_string' occurs ${count} times. Please set 'replace_all' to true if you intend to replace all, or provide a more unique context string.`;
                }
            }

            if (replace_all) {
                content = content.split(old_string).join(new_string);
            } else {
                content = content.replace(old_string, new_string);
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

            const dir = path.dirname(safePath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }

            await fs.promises.writeFile(safePath, content, 'utf-8');
            return `Successfully wrote to ${safePath}`;
        } catch (e) {
            return `Write failed: ${e.message}`;
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
    // Web Fetch Handler
    web_fetch: async ({ url, offset = 0, length = MAX_READ }) => {
        try {
            if (!url || !url.startsWith('http')) {
                return "Error: Invalid URL. Please provide a full URL starting with http:// or https://";
            }

            const MAX_SINGLE_READ = MAX_READ;
            const readLength = Math.min(length, MAX_SINGLE_READ);

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
            
            if (response.status === 403 || response.status === 521) {
                return `Failed to fetch page (Anti-bot protection ${response.status}). The site requires a real browser environment.`;
            }

            if (!response.ok) {
                return `Failed to fetch page. Status: ${response.status} ${response.statusText}`;
            }

            const contentType = response.headers.get('content-type') || '';
            const rawText = await response.text();

            let fullText = "";
            if (contentType.includes('application/json')) {
                try { 
                    fullText = JSON.stringify(JSON.parse(rawText), null, 2); 
                } catch(e) { 
                    fullText = rawText; 
                }
            } else {
                const metadata = extractMetadata(rawText);
                const markdownBody = convertHtmlToMarkdown(rawText);

                if (!markdownBody || markdownBody.length < 50) {
                    return `Fetched URL: ${url}\n\nTitle: ${metadata.title}\n\n[System]: Content seems empty. This might be a JavaScript-rendered page (SPA) which cannot be parsed by this tool.`;
                }

                fullText = `URL: ${url}\n\n`;
                if (metadata.title) fullText += `# ${metadata.title}\n\n`;
                if (metadata.author) fullText += `**Author:** ${metadata.author}\n`;
                if (metadata.description) fullText += `**Summary:** ${metadata.description}\n`;
                fullText += `\n---\n\n${markdownBody}`;
            }

            // --- 分页逻辑 ---
            const totalChars = fullText.length;
            const startPos = Math.max(0, offset);
            const contentChunk = fullText.substring(startPos, startPos + readLength);
            const remainingChars = totalChars - (startPos + contentChunk.length);

            let result = contentChunk;

            if (remainingChars > 0) {
                const nextOffset = startPos + contentChunk.length;
                result += `\n\n--- [SYSTEM NOTE: CONTENT TRUNCATED] ---\n`;
                result += `Total characters in parsed page: ${totalChars}\n`;
                result += `Current chunk: ${startPos} to ${nextOffset}\n`;
                result += `Remaining unread characters: ${remainingChars}\n`;
                result += `To read more, call web_fetch with offset: ${nextOffset}\n`;
                result += `---------------------------------------`;
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
        // 如果是 sub_agent，它需要 context 和 signal
        if (toolName === 'sub_agent') {
            return await handlers[toolName](args, context, signal);
        }
        // 为了兼容性，我们只给 sub_agent 传 context
        return await handlers[toolName](args); 
    }
    throw new Error(`Built-in tool '${toolName}' not found.`);
}

module.exports = {
    getBuiltinServers,
    getBuiltinTools,
    invokeBuiltinTool
};