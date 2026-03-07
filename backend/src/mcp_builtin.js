const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const { handleFilePath, parseFileObject } = require('./file.js');

const { createChatCompletion } = require('./chat.js');

const isWin = process.platform === 'win32';
const currentOS = process.platform === 'win32' ? 'Windows' : (process.platform === 'darwin' ? 'macOS' : 'Linux');

// --- Bash Session State ---
let bashCwd = os.homedir();

const backgroundShells = new Map();
const MAX_BG_LOG_SIZE = 1024 * 1024; // 1MB 日志上限

function appendBgLog(id, text) {
    const proc = backgroundShells.get(id);
    if (!proc) return;
    proc.logs += text;
    if (proc.logs.length > MAX_BG_LOG_SIZE) {
        proc.logs = "[...Logs Truncated...]\n" + proc.logs.slice(proc.logs.length - (MAX_BG_LOG_SIZE / 2));
    }
}

// 引入 IPC 用于子窗口通信
let ipcRenderer = null;
try { ipcRenderer = require('electron').ipcRenderer; } catch (e) {}

// 判断是否为独立窗口 (通过 location 判断或 API 特征)
function isChildWindow() {
    if (typeof utools !== 'undefined' && typeof utools.getWindowType === 'function') {
        return utools.getWindowType() === 'browser';
    }
    return false;
}

// 子窗口呼叫父进程的 Promise 包装器 (支持中断)
async function callParentShell(action, payload, signal = null) {
    return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36).substr(2);
        let isDone = false;
        
        const handler = (event, response) => {
            if (response.requestId === requestId) {
                isDone = true;
                ipcRenderer.off('background-shell-reply', handler);
                if (response.error) reject(new Error(response.error));
                else resolve(response.data);
            }
        };
        
        ipcRenderer.on('background-shell-reply', handler);
        utools.sendToParent('background-shell-request', { requestId, action, payload });
        
        // 监听前端的取消操作
        if (signal) {
            const abortHandler = () => {
                if (isDone) return;
                isDone = true;
                ipcRenderer.off('background-shell-reply', handler);
                // 抛出标准的 AbortError，前端即可终止 loading 状态
                const err = new Error("Tool execution cancelled by user");
                err.name = "AbortError";
                reject(err);
            };
            if (signal.aborted) abortHandler();
            else signal.addEventListener('abort', abortHandler);
        }
        
        // 超时保护
        setTimeout(() => {
            if (isDone) return;
            isDone = true;
            ipcRenderer.off('background-shell-reply', handler);
            resolve(`[System Notice]: The request timed out after 60s. The target agent may still be generating. You can try again later, or check previous messages which may be useful.`);
        }, 60000); 
    });
}

const MAX_READ = 256 * 1000; // 256k characters

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

    // --- 0. 特殊站点适配：Discourse ---
    try {
        const dataPreloadedMatch = text.match(/id=["']data-preloaded["'][^>]*data-preloaded=["']([\s\S]*?)["']/i);
        if (dataPreloadedMatch) {
            const decodeEntities = (str) => {
                if (!str) return "";
                return str.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/");
            };
            const rawJson = decodeEntities(dataPreloadedMatch[1]);
            const data = JSON.parse(rawJson);
            for (const key in data) {
                if (key.startsWith('topic_') && typeof data[key] === 'string') {
                    const topicData = JSON.parse(data[key]);
                    if (topicData?.post_stream?.posts?.[0]?.cooked) {
                        text = topicData.post_stream.posts[0].cooked;
                    }
                    break;
                }
            }
        }
    } catch (e) { }

    // --- 1. 常规 DOM 容器提取 ---
    const cookedMatch = text.match(/<div[^>]*class=["'][^"']*cooked[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

    if (cookedMatch && cookedMatch[1].length > 100) text = cookedMatch[1];
    else if (articleMatch && articleMatch[1].length > 100) text = articleMatch[1];
    else if (mainMatch && mainMatch[1].length > 100) text = mainMatch[1];
    else {
        const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) text = bodyMatch[1];
    }

    // --- 2. 移除绝对无关的标签 ---
    text = text.replace(/<(head|script|style|svg|noscript|iframe|form|button|input|select|option|textarea)[^>]*>[\s\S]*?<\/\1>/gi, '');
    text = text.replace(/<(nav|footer|aside|header)[^>]*>[\s\S]*?<\/\1>/gi, '');
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // --- 代码块保护机制 ---
    // 在移除 HTML 标签前，先提取代码块并用占位符替换，防止代码块内的 <tag> 被误删
    const codeBlockPlaceholders = [];

    // 处理 <pre><code>...</code></pre>
    text = text.replace(/<pre[^>]*>[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/gi, (match, code) => {
        // 解码 HTML 实体，还原 <meta-directives> 等内容
        const decodedCode = code
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

        const placeholder = `___CODE_BLOCK_${codeBlockPlaceholders.length}___`;
        codeBlockPlaceholders.push(`\n\`\`\`\n${decodedCode}\n\`\`\`\n`);
        return placeholder;
    });

    // 处理行内 <code>...</code> (Discourse 有时会用这个，虽然少见)
    text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (match, code) => {
        const decodedCode = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        const placeholder = `___CODE_BLOCK_${codeBlockPlaceholders.length}___`;
        codeBlockPlaceholders.push(` \`${decodedCode}\` `);
        return placeholder;
    });

    // --- 6. 辅助函数：处理相对 URL ---
    const resolveUrl = (relativeUrl) => {
        if (!relativeUrl || !baseUrl) return relativeUrl;
        if (relativeUrl.startsWith('http')) return relativeUrl;
        if (relativeUrl.startsWith('data:')) return '';
        try { return new URL(relativeUrl, baseUrl).href; } catch (e) { return relativeUrl; }
    };

    // --- 7. 元素转换 Markdown ---
    text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (match, level, content) => {
        return `\n\n${'#'.repeat(level)} ${content.replace(/<[^>]+>/g, '').trim()}\n`;
    });

    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<li[^>]*>/gi, '- ');
    text = text.replace(/<\/(ul|ol)>/gi, '\n\n');
    text = text.replace(/<\/(p|div|tr|table|article|section|blockquote|main)>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');

    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, (match, src, alt) => {
        const fullUrl = resolveUrl(src); return fullUrl ? `\n![${alt.trim()}](${fullUrl})\n` : '';
    });
    text = text.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, (match, src) => {
        const fullUrl = resolveUrl(src); return fullUrl ? `\n![](${fullUrl})\n` : '';
    });

    text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, content) => {
        const cleanContent = content.replace(/<[^>]+>/g, '').trim();
        if (!cleanContent || href.startsWith('javascript:') || href.startsWith('#')) return cleanContent;
        return ` [${cleanContent}](${resolveUrl(href)}) `;
    });

    text = text.replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');

    // --- 8. 移除剩余 HTML 标签 (此时代码块已是占位符，安全) ---
    text = text.replace(/<[^>]+>/g, '');

    // --- 9. 还原代码块 ---
    codeBlockPlaceholders.forEach((codeBlock, index) => {
        text = text.replace(`___CODE_BLOCK_${index}___`, () => codeBlock); // 使用函数返回防止 replacement 里的 $ 被特殊解析
    });

    // --- 10. 实体解码与清洗 ---
    const entities = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&copy;': '©', '&mdash;': '—' };
    text = text.replace(/&[a-z0-9]+;/gi, (match) => entities[match] || '');

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
        if (line.length < 20 && lineNoiseRegex.test(line)) continue;
        cleanLines.push(line);
    }

    return cleanLines.join('\n').trim();
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
        name: "Web Toolkit",
        description: "使用 DuckDuckGo 进行免费联网搜索，获取相关网页标题、链接和摘要；抓取网页内容。",
        type: "builtin",
        isActive: true,
        isPersistent: false,
        tags: ["search", "web", "fetch"],
        logoUrl: "https://upload.wikimedia.org/wikipedia/en/9/90/The_DuckDuckGo_Duck.png"
    },
    "builtin_superagent": {
        id: "builtin_superagent",
        name: "Super-Agent",
        description: "超级智能体调度中心。包含后台静默执行的子智能体(Sub-Agent)，以及能够召唤、监控、协作其他独立窗口Agent的编排能力。",
        type: "builtin",
        isActive: true,
        isPersistent: false,
        tags: ["agent", "orchestration"],
        logoUrl: "https://s2.loli.net/2026/01/22/tTsJjkpiOYAeGdy.png"
    },
    "builtin_tasks": {
        id: "builtin_tasks",
        name: "Task Manager",
        description: "管理 Anywhere 的定时任务。可以检索、创建、启用、禁用和删除定时任务。",
        type: "builtin",
        isActive: true,
        isPersistent: false,
        tags: ["task", "schedule", "cron"],
        logoUrl: "https://upload.wikimedia.org/wikipedia/commons/4/4a/Commons-logo.svg"
    },
    "builtin_time": {
        id: "builtin_time",
        name: "Time Service",
        description: "获取当前系统时间或指定时区的时间。",
        type: "builtin",
        isActive: true,
        isPersistent: false,
        tags: ["time", "clock"],
        logoUrl: "https://api.iconify.design/lucide:clock.svg"
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
            description: "Fast file pattern matching to locate file paths. You MUST specify a 'path' to limit the search scope.",
            inputSchema: {
                type: "object",
                properties: {
                    pattern: { type: "string", description: "Glob pattern (e.g., 'src/**/*.ts' for recursive, '*.json' for current dir)." },
                    path: { type: "string", description: "The directory to search in. You MUST provide a specific path (e.g., project root or subfolder). Do NOT use root '/' or '~' unless absolutely necessary." }
                },
                required: ["pattern", "path"]
            }
        },
        {
            name: "grep_search",
            description: "Search for patterns in file contents using Regex. You MUST specify a 'path' to limit the search scope.\nWARNING FOR CODE/LATEX: In JSON, you must double-escape backslashes.",
            inputSchema: {
                type: "object",
                properties: {
                    pattern: { type: "string", description: "Regex pattern to search for." },
                    path: { type: "string", description: "The directory to search in. You MUST provide a specific path." },
                    glob: { type: "string", description: "Glob pattern to filter files (e.g., '**/*.js')." },
                    output_mode: {
                        type: "string",
                        enum: ["content", "files_with_matches", "count"],
                        description: "Output mode: 'content' (lines), 'files_with_matches' (paths only), 'count'."
                    },
                    multiline: { type: "boolean", description: "Enable multiline matching. When true, enables 'm' and 's' (dotAll) regex flags so '.' matches newlines." }
                },
                required: ["pattern", "path"]
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
            description: "EXACT literal string replacement for modifying files. Safer than regex for code containing special characters (like LaTeX or C++). YOU MUST READ THE FILE FIRST to ensure you have the exact 'old_string'.",
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
            description: "Efficiently replace text in a file using JavaScript RegExp. Supports capture groups ($1, $2).\nCRITICAL WARNING FOR LATEX/CODE: The 'replacement' string is inserted literally. DO NOT double-escape backslashes in 'replacement' unless you actually want two backslashes. For example, to insert '\\begin', pass '\\begin' in JSON",
            inputSchema: {
                type: "object",
                properties: {
                    file_path: { type: "string", description: "Absolute path to the file." },
                    pattern: { type: "string", description: "The Regex pattern to search for. (e.g. 'function oldName\\((.*?)\\)')" },
                    replacement: { type: "string", description: "The replacement text. Use $1, $2 for capture groups." },
                    flags: { type: "string", description: "RegExp flags. Defaults to 'gm'. IMPORTANT: If you need '.' to match newlines for multiline code blocks, you MUST pass 'gms'.", default: "gm" }
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
            description: `Execute a shell command.
IMPORTANT:
1. The underlying shell is **${currentOS}**:**${isWin ? "PowerShell" : "Bash"}**. Adjust syntax accordingly.
2. **Long-running processes**: For servers (e.g. 'npm run dev', 'python server.py') or tasks taking >15s, YOU MUST set 'background': true.
3. When 'background': true, you will receive a 'shell_id' immediately. Use 'read_background_shell_output' to check logs and 'kill_background_shell' to stop it.`,
            inputSchema: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: `The command to execute.`
                    },
                    background: {
                        type: "boolean",
                        description: "Set to true for long-running tasks, servers, or watchers. Returns a shell_id immediately.",
                        default: false
                    },
                    timeout: {
                        type: "integer",
                        description: "Only for foreground tasks (background=false). Timeout in ms. Default 15000.",
                        default: 15000
                    }
                },
                required: ["command"]
            }
        },
        {
            name: "list_background_shells",
            description: "List all currently running background shell processes started by this agent's tool.",
            inputSchema: { type: "object", properties: {} }
        },
        {
            name: "read_background_shell_output",
            description: "Read stdout/stderr logs from a background shell process. Supports pagination.",
            inputSchema: {
                type: "object",
                properties: {
                    shell_id: { type: "string", description: "The ID returned when starting the background task." },
                    offset: { type: "integer", description: "Character offset to start reading from (for scrolling logs).", default: 0 },
                    length: { type: "integer", description: "Number of characters to read.", default: MAX_READ }
                },
                required: ["shell_id"]
            }
        },
        {
            name: "kill_background_shell",
            description: "Terminate a background shell process.",
            inputSchema: {
                type: "object",
                properties: {
                    shell_id: { type: "string", description: "The ID of the process to kill." }
                },
                required: ["shell_id"]
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
    "builtin_superagent": [
        {
            name: "sub_agent",
            description: "【Synchronous Background Worker】Delegates a specific sub-task to a temporary background AI worker. It blocks and waits until the task is fully completed, then returns the final result. Best for step-by-step internal reasoning.",
            inputSchema: {
                type: "object",
                properties: {
                    task: { type: "string", description: "The detailed task description for the worker." },
                    context: { type: "string", description: "Background info or required variables." },
                    tools: { type: "array", items: { type: "string" }, description: "Tool names granted to the worker." },
                    planning_level: { type: "string", enum: ["fast", "medium", "high", "custom"] },
                    custom_steps: { type: "integer" }
                },
                required: ["task", "tools"]
            }
        },
        {
            name: "list_agents",
            description: "List all pre-configured professional Agents (System Prompts). You can optionally provide an 'agent_name' to inspect its system prompt and capabilities before summoning it.",
            inputSchema: { 
                type: "object", 
                properties: {
                    agent_name: { type: "string", description: "Optional. Name of the agent to inspect." }
                } 
            }
        },
        {
            name: "summon_agent",
            description: "Summon a specific ai agent (from list_agents) in a NEW window with a BLANK history, and send an initial task. Returns a 'window_id' immediately.\n\nThe target agent will start generating a response in the background. You can do other things or immediately call 'read_agent_chats' to wait for its result. \n\n Use 'summon_agent' ONLY when you explicitly need a brand-new, isolated conversation.",
            inputSchema: {
                type: "object",
                properties: {
                    agent_name: { type: "string", description: "The exact name of the agent to summon." },
                    text: { type: "string", description: "The first message or task description to send to this agent." },
                    file_paths: { type: "array", items: { type: "string" }, description: "Optional. Array of local absolute paths to send files/images." }
                },
                required: ["agent_name", "text"]
            }
        },
        {
            name: "list_agent_chats",
            description: "【Collaboration Info】List all CURRENTLY ACTIVE standalone agent windows and their 'window_id's（including your own）. \n\nBEST PRACTICE: Always check this list to see if an agent is already open. If so, REUSE it via 'continue_agent_chats' instead of summoning a new one. It also marks which window_id belongs to YOU.",
            inputSchema: { type: "object", properties: {} }
        },
        {
            name: "read_agent_chats",
            description: "Read chat history. \nSMART BLOCKING: If you request the LATEST message (e.g. index=-1) and the agent is currently generating (Busy), this tool will BLOCK and WAIT until the generation is finished, then return the complete response. You don't need to poll repeatedly.\n\nINDEX RULES:\n- 0: System Prompt（if exists）.\n- 1: First user message.\n- -1: Latest message.\n\nUSAGE:\n1. Call WITHOUT 'message_index' to get the chat outline.\n2. Call WITH 'message_index=-1' to get the latest reply (will auto-wait if busy). AI Agent may return multiple messages (e.g. `message_index` may be `-2`, `-3`, etc.). which can include tool calls or other intermediate process information, so make sure to retrieve the specific message you actually need.",
            inputSchema: {
                type: "object",
                properties: {
                    window_id: { type: "string", description: "The window_id of the target agent." },
                    message_index: { type: "integer", description: "Optional. Index of the message. 0=System, 1=First User Msg, -1=Latest. Leave empty for outline." },
                    offset: { type: "integer", description: "Optional. Character offset.", default: 0 },
                    length: { type: "integer", description: "Optional. Max characters.", default: 128000 }
                },
                required: ["window_id"]
            }
        },
        {
            name: "close_agent_window",
            description: "Close an active agent window using its 'window_id'(get window_id from 'list_agent_chats'). The system will automatically generate a name and save the chat history before closing. HIGH PRIVILEGE OPERATION: please use this function with caution, ensuring the task of that window is complete before closing the Agent window.",
            inputSchema: {
                type: "object",
                properties: {
                    window_id: { type: "string", description: "The window_id of the target agent to close." }
                },
                required: ["window_id"]
            }
        }
    ],
    "builtin_tasks": [
        {
            name: "list_mcp_servers",
            description: "List all MCP servers with their IDs and descriptions available for scheduled tasks. Use this to find the exact 'id' for assigning 'extra_mcp' to a scheduled task.",
            inputSchema: { type: "object", properties: {} }
        },
        {
            name: "list_tasks",
            description: "List scheduled tasks. By default, it returns a summary (ID and Name). If 'task_name_or_id' is provided, it returns full details for that specific task.",
            inputSchema: { 
                type: "object", 
                properties: {
                    task_name_or_id: { type: "string", description: "Optional. Provide a Task ID or Name to view detailed configuration (including schedule, instructions, etc.)." }
                } 
            }
        },
        {
            name: "create_task",
            description: "Create a new scheduled task.",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Task name: concise, clear, and unique." },
                    instruction: { type: "string", description: "The specific, self-contained prompt sent to the AI when the schedule triggers. Since it executes autonomously without human interaction, the instruction MUST be highly detailed and actionable. Explicitly state the exact goal, what tools to invoke (e.g., 'Use web_search to find...', 'Use write_file to save...'), and the desired output format. Example: 'Search the web for today's AI news, summarize the top 3 items in a markdown list, and save the result as a local file to...'" },
                    agent_name: { type: "string", description: "Optional. Name of the Quick Prompt to use. Defaults to '__DEFAULT__'." },
                    schedule_type: { 
                        type: "string", enum: ["interval", "daily", "weekly", "monthly", "single"], 
                        description: "Type of schedule. 'interval'(every X mins), 'daily'(fixed time), 'weekly'(fixed days in week), 'monthly'(fixed dates in month)." 
                    },
                    time_param: { type: "string", description: "For 'interval': number of minutes. For others: HH:mm format." },
                    interval_time_ranges: { 
                        type: "array", 
                        items: { type: "string" }, 
                        description: "Optional. Active time ranges for 'interval' only. Format: ['HH:mm-HH:mm']. If omitted, runs 24h." 
                    },
                    weekly_days: {
                        type: "array",
                        items: { type: "integer" },
                        description: "Optional. Required for 'weekly'. Array of weekdays (0-6, 0=Sunday). e.g. [1,2,3,4,5] for weekdays."
                    },
                    monthly_days: {
                        type: "array",
                        items: { type: "integer" },
                        description: "Optional. Required for 'monthly'. Array of dates in month (1-31). e.g. [1, 15, 28]."
                    },
                    single_date: { 
                        type: "string", 
                        description: "Optional. Required for 'single'. Format: YYYY-MM-DD (e.g. 2026-03-05). Defaults to today if omitted." 
                    },
                    enabled: { type: "boolean", description: "Enable immediately. Defaults to true.", default: true },
                    extra_mcp: {
                        type: "array",
                        items: { type: "string" },
                        description: "Optional. Array of MCP server IDs to enable for this task. By default, all built-in MCP servers are automatically assigned. Only specify this if you need 3rd-party MCPs."
                    },
                    extra_skills: {
                        type: "array",
                        items: { type: "string" },
                        description: "Optional. Array of Skill names to enable for this task. Defaults to empty. You should only assign skills that are relevant to the task."
                    }
                },
                required: ["name", "instruction", "schedule_type", "time_param"]
            }
        },
        {
            name: "edit_task",
            description: "Edit specific parameters of an existing scheduled task.",
            inputSchema: {
                type: "object",
                properties: {
                    task_name_or_id: { type: "string" },
                    new_name: { type: "string" },
                    instruction: { type: "string",description: "New prompt content. Provide a highly detailed, self-contained instruction for autonomous execution (explicitly stating tools to use, goals, and output formats)." },
                    agent_name: { type: "string" },
                    schedule_type: { type: "string", enum: ["interval", "daily", "weekly", "monthly", "single"] },
                    time_param: { type: "string" },
                    single_date: { type: "string", description: "Format: YYYY-MM-DD" },
                    interval_time_ranges: { type: "array", items: { type: "string" } },
                    weekly_days: { type: "array", items: { type: "integer" } },
                    monthly_days: { type: "array", items: { type: "integer" } },
                    extra_mcp: { type: "array", items: { type: "string" } },
                    extra_skills: { type: "array", items: { type: "string" } }
                },
                required: ["task_name_or_id"]
            }
        },
        {
            name: "control_task",
            description: "Enable or disable an existing task by its name or ID.",
            inputSchema: {
                type: "object",
                properties: {
                    task_name_or_id: { type: "string", description: "The name or ID of the task." },
                    enable: { type: "boolean", description: "True to enable, False to disable." }
                },
                required: ["task_name_or_id", "enable"]
            }
        },
        {
            name: "delete_task",
            description: "Delete a task permanently.",
            inputSchema: {
                type: "object",
                properties: {
                    task_name_or_id: { type: "string", description: "The name or ID of the task to delete." }
                },
                required: ["task_name_or_id"]
            }
        }
    ],
    "builtin_time": [
        {
            name: "get_current_time",
            description: "Get the current time and date. You can optionally specify a timezone. Returns current time, date, and day of the week.",
            inputSchema: {
                type: "object",
                properties: {
                    timezone: { 
                        type: "string", 
                        description: "Optional. The timezone to get the time for, e.g., 'Asia/Shanghai', 'America/New_York', 'UTC'. If omitted, returns the local system time." 
                    }
                }
            }
        }
    ],
};

// --- Helpers ---

// 异步文件互斥锁，解决并发写入导致的竞态覆盖和文件内容丢失问题
const fileLocks = new Map();
async function acquireLock(filePath) {
    let currentLock;
    while ((currentLock = fileLocks.get(filePath))) {
        await currentLock;
    }
    let resolveLock;
    const lockPromise = new Promise(resolve => resolveLock = resolve);
    fileLocks.set(filePath, lockPromise);
    return () => {
        if (fileLocks.get(filePath) === lockPromise) {
            fileLocks.delete(filePath);
        }
        resolveLock();
    };
}

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
    let regex = glob
        .replace(/\\/g, '/') // 统一反斜杠为正斜杠，防止转义混乱
        .replace(/\*\*\//g, '___DOUBLE_STAR_SLASH___') // 优先处理带有斜杠的 **，用于匹配零个或多个目录
        .replace(/\*\*/g, '___DOUBLE_STAR___') // 单独的 **
        .replace(/\*/g, '___SINGLE_STAR___')
        .replace(/\?/g, '___QUESTION___');

    // 2. 转义字符串中剩余的所有正则表达式特殊字符
    regex = regex.replace(/[\\^$|.+()\[\]{}]/g, '\\$&');

    // 3. 将占位符替换回对应的正则表达式逻辑
    // **/ -> (?:.*/)? (匹配零个或多个目录层级，这就允许跨目录匹配也能兼容根目录)
    regex = regex.replace(/___DOUBLE_STAR_SLASH___/g, '(?:.*/)?');
    // ** -> .* (匹配任意字符)
    regex = regex.replace(/___DOUBLE_STAR___/g, '.*');
    // * -> [^/]* (匹配除路径分隔符外的任意字符，由于路径已全部转为正斜杠，所以只需排除 /)
    regex = regex.replace(/___SINGLE_STAR___/g, '[^/]*');
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
    const { apiKey, baseUrl, model, tools: allToolDefinitions, mcpSystemPrompt, onUpdate, apiType } = globalContext;

    // --- 1. 工具直接映射 (Direct Mapping) ---
    let availableTools = [];
    if (allowedToolNames && Array.isArray(allowedToolNames) && allowedToolNames.length > 0) {
        const allowedSet = new Set(allowedToolNames);
        availableTools = (allToolDefinitions || []).filter(t =>
            // 映射逻辑：只要名字匹配，就授予权限
            allowedSet.has(t.function.name) && t.function.name !== 'sub_agent'
        );
    }

    // --- 2. 步骤控制 ---
    let MAX_STEPS = 20;
    if (planning_level === 'fast') MAX_STEPS = 10;
    else if (planning_level === 'high') MAX_STEPS = 30;
    else if (planning_level === 'custom' && custom_steps) MAX_STEPS = Math.min(100, Math.max(10, custom_steps));

    // --- 3. 提示词构建 ---
    const systemInstruction = `You are a specialized Sub-Agent Worker.
Your Role: Autonomous task executor.
Strategy: Plan, execute tools, observe results, and iterate until the task is done.
Output: When finished, output the final answer directly as text. Do NOT ask the user for clarification unless all tools fail.
${mcpSystemPrompt ? '\n' + mcpSystemPrompt : ''}`;

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
    const executionLog = [];
    const log = (msg) => {
        executionLog.push(msg);
        if (onUpdate && typeof onUpdate === 'function') {
            onUpdate(executionLog.join('\n'));
        }
    };

    log(`[Sub-Agent] Started. Max steps: ${MAX_STEPS}. Tools: ${availableTools.map(t => t.function.name).join(', ') || 'None'}`);

    const { invokeMcpTool } = require('./mcp.js');

    while (step < MAX_STEPS) {
        if (signal && signal.aborted) throw new Error("Sub-Agent execution aborted by user.");
        step++;

        log(`\n--- Step ${step}/${MAX_STEPS} ---`);

        try {
            // 3.1 LLM 思考 (使用 chat.js)
            const currentApiType = apiType || 'chat_completions';

            const response = await createChatCompletion({
                baseUrl: baseUrl,
                apiKey: apiKey,
                model: model,
                apiType: currentApiType,
                messages: messages,
                tools: availableTools.length > 0 ? availableTools : undefined,
                tool_choice: availableTools.length > 0 ? "auto" : undefined,
                stream: false,
                signal: signal
            });

            let messageContent = "";
            let toolCalls = [];
            let message = {};

            if (currentApiType === 'responses' && response.output) {
                // Responses API 处理逻辑
                const textItems = response.output.filter(item => item.type === 'message');
                textItems.forEach(item => {
                    if (item.content) {
                        item.content.forEach(c => {
                            if (c.type === 'output_text') messageContent += c.text;
                        });
                    }
                });

                const functionCallItems = response.output.filter(item => item.type === 'function_call');
                toolCalls = functionCallItems.map(item => ({
                    id: item.call_id,
                    type: 'function',
                    function: {
                        name: item.name,
                        arguments: item.arguments
                    }
                }));

                message = {
                    role: 'assistant',
                    content: messageContent || null,
                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined
                };

            } else {
                // Chat Completions API 处理逻辑
                message = response.choices[0].message;
                messageContent = message.content;
                toolCalls = message.tool_calls || [];
            }

            messages.push(message);

            // 3.2 决策
            if (messageContent) {
                log(`[Thought] ${messageContent}`);
            }

            if (!toolCalls || toolCalls.length === 0) {
                log(`[Result] Task Completed.`);
                return messageContent || "[Sub-Agent finished without content]";
            }

            // 3.3 执行工具
            for (const toolCall of toolCalls) {
                if (signal && signal.aborted) throw new Error("Sub-Agent execution aborted.");

                const toolName = toolCall.function.name;
                let toolArgsObj = {};
                let toolResult = "";

                try {
                    toolArgsObj = JSON.parse(toolCall.function.arguments);
                    log(`[Action] Calling ${toolName}...`);

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

    try {
        log(`[System] Requesting status summary from Sub-Agent...`);
        messages.push({
            role: 'user',
            content: "SYSTEM ALERT: You have reached the maximum number of steps allowed. Please provide a concise summary of:\n1. What has been successfully completed.\n2. What is the current status/obstacles.\n3. What specific actions remain to be done.\nDo not use any tools, just answer with text."
        });

        const currentApiType = apiType || 'chat_completions';
        const summaryResponse = await createChatCompletion({
            baseUrl: baseUrl,
            apiKey: apiKey,
            model: model,
            apiType: currentApiType,
            messages: messages,
            tools: availableTools.length > 0 ? availableTools : undefined,
            tool_choice: availableTools.length > 0 ? "auto" : undefined,
            stream: false,
            signal: signal
        });

        let summaryContent = "";
        if (currentApiType === 'responses' && summaryResponse.output) {
            const textItems = summaryResponse.output.filter(item => item.type === 'message');
            textItems.forEach(item => {
                if (item.content) {
                    item.content.forEach(c => {
                        if (c.type === 'output_text') summaryContent += c.text;
                    });
                }
            });
        } else {
            summaryContent = summaryResponse.choices[0].message.content;
        }

        if (summaryContent) {
            return `[Sub-Agent Timeout Summary]\n${summaryContent}\n\n(System Note: The sub-agent stopped because the step limit of ${MAX_STEPS} was reached...)`;
        }
    } catch (e) {
        log(`[Error] Failed to generate summary: ${e.message}`);
    }

    return generateStaticReport() + `\n\n[Instruction for Main Agent]: Please check the conversation context...`;
}

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
            if (!searchPath) {
                return "Error: You MUST provide a 'path' argument to specify the directory.";
            }

            let rootDir = resolvePath(searchPath);

            const parsed = path.parse(rootDir);
            if (parsed.root === rootDir && rootDir.length <= 3) {
                // Windows: C:\, Linux/Mac: /
                return `Error: Scanning the system root directory ('${rootDir}') is not allowed due to performance and security reasons. Please specify a more specific directory (e.g., project folder).`;
            }

            let globPattern = pattern;

            const isAbsolutePath = path.isAbsolute(pattern) || /^[a-zA-Z]:[\\/]/.test(pattern);
            if (isAbsolutePath) {
                const magicIndex = pattern.search(/[*?\[{]/);
                if (magicIndex > -1) {
                    const basePath = pattern.substring(0, magicIndex);
                    const lastSep = Math.max(basePath.lastIndexOf('/'), basePath.lastIndexOf('\\'));
                    if (lastSep > -1) {
                        const extractedRoot = basePath.substring(0, lastSep + 1);
                        if (extractedRoot.startsWith(rootDir)) {
                            // 优化：如果 pattern 指定的目录在 searchPath 内部，缩小搜索范围
                            rootDir = extractedRoot;
                            globPattern = pattern.substring(lastSep + 1);
                        }
                    }
                }
            }

            if (!fs.existsSync(rootDir)) return `Error: Directory not found: ${rootDir}`;
            if (!isPathSafe(rootDir)) return `[Security Block] Access restricted.`;

            const results = [];
            const regex = globToRegex(globPattern || "**/*");
            if (!regex) return "Error: Invalid glob pattern.";

            const MAX_RESULTS = 5000;
            const normalizedRoot = normalizePath(rootDir);

            for await (const filePath of walkDir(rootDir, 20, 0, signal)) {
                if (signal && signal.aborted) throw new Error("Operation aborted by user.");

                const normalizedFilePath = normalizePath(filePath);
                let relativePath = normalizedFilePath.replace(normalizedRoot, '');
                if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);

                if (regex.test(relativePath) || regex.test(path.basename(filePath))) {
                    results.push(filePath);
                }
                if (results.length >= MAX_RESULTS) break;
            }

            if (results.length === 0) return `No files matched pattern '${globPattern}' in ${rootDir}.`;
            return results.join('\n') + (results.length >= MAX_RESULTS ? `\n... (Limit reached: ${MAX_RESULTS})` : '');
        } catch (e) {
            return `Glob error: ${e.message}`;
        }
    },

    // 2. Grep Search (优化版：提供详细上下文、行号、列号)
    grep_search: async ({ pattern, path: searchPath, glob, output_mode = 'content', multiline = false }, context, signal) => {
        try {
            if (!searchPath) {
                return "Error: You MUST provide a 'path' argument to specify the directory.";
            }
            if (!pattern) {
                return "Error: You MUST provide a 'pattern' argument.";
            }

            const rootDir = resolvePath(searchPath);
            const parsed = path.parse(rootDir);
            if (parsed.root === rootDir && rootDir.length <= 3) {
                return `Error: Grep searching the system root directory ('${rootDir}') is not allowed. Please specify a project directory.`;
            }

            if (!fs.existsSync(rootDir)) return `Error: Directory not found: ${rootDir}`;

            const regexFlags = multiline ? 'gmsi' : 'gi';
            let searchRegex;
            try {
                searchRegex = new RegExp(pattern, regexFlags);
            } catch (e) { return `Invalid Regex: ${e.message}`; }

            if (searchRegex.test("")) {
                return `Error: The regex pattern '${pattern}' matches empty strings.`;
            }
            searchRegex.lastIndex = 0;

            const globRegex = glob ? globToRegex(glob) : null;
            const normalizedRoot = normalizePath(rootDir);

            const results = [];
            let matchCount = 0;
            const MAX_SCANNED = 5000;
            const MAX_RESULTS_BLOCKS = 100;
            let scanned = 0;

            for await (const filePath of walkDir(rootDir, 20, 0, signal)) {
                if (signal && signal.aborted) throw new Error("Operation aborted by user.");
                if (scanned++ > MAX_SCANNED) {
                    results.push(`\n[System] Scan limit reached (${MAX_SCANNED} files). Please narrow down your search path or use a glob filter.`);
                    break;
                }

                if (globRegex) {
                    const normalizedFilePath = normalizePath(filePath);
                    let relativePath = normalizedFilePath.replace(normalizedRoot, '');
                    if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
                    if (!globRegex.test(relativePath) && !globRegex.test(path.basename(filePath))) continue;
                }

                const ext = path.extname(filePath).toLowerCase();
                if (['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.exe', '.bin', '.zip', '.node', '.dll', '.db', '.pyc'].includes(ext)) continue;

                try {
                    const stats = await fs.promises.stat(filePath);
                    if (stats.size > 2 * 1024 * 1024) continue;

                    const content = await fs.promises.readFile(filePath, { encoding: 'utf-8', signal });

                    if (output_mode === 'files_with_matches') {
                        if (searchRegex.test(content)) {
                            results.push(filePath);
                            searchRegex.lastIndex = 0;
                            if (results.length >= MAX_RESULTS_BLOCKS) break;
                        }
                    } else {
                        const matches = [...content.matchAll(searchRegex)];
                        if (matches.length > 0) {
                            matchCount += matches.length;
                            if (output_mode === 'count') continue;

                            const lines = content.split(/\r?\n/);
                            
                            for (const m of matches) {
                                if (results.length >= MAX_RESULTS_BLOCKS) break;

                                const offset = m.index;
                                const matchLen = m[0].length;
                                
                                // 计算行号 (1-based)
                                const preMatch = content.substring(0, offset);
                                const lineNum = preMatch.split(/\r?\n/).length;
                                
                                // 计算列号 (1-based)
                                const lastNewLinePos = preMatch.lastIndexOf('\n');
                                const colNum = offset - lastNewLinePos; 

                                // 计算匹配结束行号 (处理多行匹配)
                                const matchText = m[0];
                                const newLinesInMatch = (matchText.match(/\n/g) || []).length;
                                const endLineNum = lineNum + newLinesInMatch;

                                // 获取上下文 (前后 20 行)
                                const contextLines = 20;
                                const startLineIdx = Math.max(0, lineNum - 1 - contextLines);
                                const endLineIdx = Math.min(lines.length, endLineNum - 1 + 1 + contextLines);
                                
                                let contextBlock = "";
                                for (let i = startLineIdx; i < endLineIdx; i++) {
                                    const currentLineNum = i + 1;
                                    const lineContent = lines[i];
                                    // 使用 '>' 标记匹配覆盖的行
                                    const marker = (currentLineNum >= lineNum && currentLineNum <= endLineNum) ? ">" : " ";
                                    contextBlock += `${currentLineNum.toString().padEnd(4)} |${marker} ${lineContent}\n`;
                                }

                                const block = `[Match] ${filePath}
Location: Line ${lineNum}, Col ${colNum} (Start Offset: ${offset})
Context:
${contextBlock}
--------------------------------------------------`;
                                results.push(block);
                            }
                        }
                    }
                } catch (readErr) { /* ignore */ }

                if (output_mode !== 'count' && results.length >= MAX_RESULTS_BLOCKS) {
                    results.push(`\n[System Warning] Output truncated. Reached maximum of ${MAX_RESULTS_BLOCKS} result blocks. Please use a more specific pattern.`);
                    break;
                }
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
        const safePath = resolvePath(file_path);
        if (!isPathSafe(safePath)) return `[Security Block] Access denied to ${safePath}.`;
        if (!fs.existsSync(safePath)) return `Error: File not found: ${safePath}`;

        const unlock = await acquireLock(safePath);
        try {
            let content = await fs.promises.readFile(safePath, 'utf-8');

            const targetOld = old_string;
            const targetNew = new_string;

            // 检查 old_string 是否存在
            if (!content.includes(targetOld)) {
                return `Error: 'old_string' not found in file. Please ensure you read the file first and use the exact string.`;
            }

            // 检查唯一性
            if (!replace_all) {
                const count = content.split(targetOld).length - 1;
                if (count > 1) {
                    return `Error: 'old_string' occurs ${count} times. Please set 'replace_all' to true if you intend to replace all, or provide a more unique context string.`;
                }
            }

            if (replace_all) {
                content = content.split(targetOld).join(targetNew);
            } else {
                const index = content.indexOf(targetOld);
                if (index !== -1) {
                    content = content.substring(0, index) + targetNew + content.substring(index + targetOld.length);
                }
            }

            await fs.promises.writeFile(safePath, content, 'utf-8');
            return `Successfully edited ${path.basename(safePath)}.`;
        } catch (e) {
            return `Edit failed: ${e.message}`;
        } finally {
            unlock();
        }
    },

    // 5. Write File
    write_file: async ({ file_path, content }) => {
        const safePath = resolvePath(file_path);
        if (!isPathSafe(safePath)) return `[Security Block] Access denied to ${safePath}.`;

        const ext = path.extname(safePath).toLowerCase();
        const binaryExtensions = ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.odt', '.ods', '.pdf', '.epub', '.mobi', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.mp3', '.wav', '.mp4', '.mov', '.zip', '.rar', '.7z', '.tar', '.gz', '.exe', '.dll', '.bin', '.so', '.dmg'];
        if (binaryExtensions.includes(ext)) {
            return `[Operation Blocked] The 'write_file' tool only supports text-based files. Writing text content to a '${ext}' file will corrupt its binary structure.`;
        }

        const unlock = await acquireLock(safePath);
        try {
            const dir = path.dirname(safePath);
            if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(safePath, content, 'utf-8');
            return `Successfully wrote to ${safePath}`;
        } catch (e) {
            return `Write failed: ${e.message}`;
        } finally {
            unlock();
        }
    },

    // 6. Regex Pattern Replace
    replace_pattern: async ({ file_path, pattern, replacement, flags = 'gm' }) => {
        const safePath = resolvePath(file_path);
        if (!isPathSafe(safePath)) return `[Security Block] Access denied to ${safePath}.`;
        if (!fs.existsSync(safePath)) return `Error: File not found: ${safePath}`;

        const unlock = await acquireLock(safePath);
        try {
            let content = await fs.promises.readFile(safePath, 'utf-8');

            let regex;
            try {
                regex = new RegExp(pattern, flags);
            } catch (e) {
                return `Invalid Regex Pattern: ${e.message}`;
            }

            const matches = content.match(regex);
            if (!matches) {
                return `Error: Pattern '${pattern}' not found in file. No changes made.`;
            }
            const matchCount = matches.length;
            regex.lastIndex = 0;

            const newContent = content.replace(regex, replacement);

            if (newContent === content) {
                return `Warning: Pattern matched ${matchCount} time(s), but content remained identical after replacement.`;
            }

            await fs.promises.writeFile(safePath, newContent, 'utf-8');
            return `Successfully replaced ${matchCount} occurrence(s) of pattern in ${path.basename(safePath)}.`;
        } catch (e) {
            return `Replace error: ${e.message}`;
        } finally {
            unlock();
        }
    },

    // 7. Insert Content
    insert_content: async ({ file_path, content, line_number, anchor_pattern, direction = 'after' }) => {
        const safePath = resolvePath(file_path);
        if (!isPathSafe(safePath)) return `[Security Block] Access denied to ${safePath}.`;
        if (!fs.existsSync(safePath)) return `Error: File not found: ${safePath}`;

        const unlock = await acquireLock(safePath);
        try {
            let fileContent = await fs.promises.readFile(safePath, 'utf-8');
            const processedContent = content;

            if (line_number !== undefined && line_number !== null) {
                const lines = fileContent.split(/\r?\n/);
                const targetIndex = parseInt(line_number) - 1;

                if (isNaN(targetIndex) || targetIndex < 0 || targetIndex > lines.length) {
                    return `Error: Line number ${line_number} is out of bounds (File has ${lines.length} lines).`;
                }

                const insertPos = direction === 'before' ? targetIndex : targetIndex + 1;
                const contentLines = processedContent.split(/\r?\n/);
                lines.splice(insertPos, 0, ...contentLines);

                await fs.promises.writeFile(safePath, lines.join('\n'), 'utf-8');
                return `Successfully inserted content at line ${line_number} in ${path.basename(safePath)}.`;
            }

            if (anchor_pattern) {
                let regex;
                try {
                    regex = new RegExp(anchor_pattern, 'm');
                } catch (e) { return `Invalid Anchor Regex: ${e.message}`; }

                if (!regex.test(fileContent)) {
                    return `Error: Anchor pattern '${anchor_pattern}' not found in file.`;
                }

                const newFullContent = fileContent.replace(regex, (matchedStr) => {
                    return direction === 'before' ? `${processedContent}\n${matchedStr}` : `${matchedStr}\n${processedContent}`;
                });

                await fs.promises.writeFile(safePath, newFullContent, 'utf-8');
                return `Successfully inserted content ${direction} anchor pattern in ${path.basename(safePath)}.`;
            }
            return `Error: You must provide either 'line_number' or 'anchor_pattern'.`;
        } catch (e) {
            return `Insert error: ${e.message}`;
        } finally {
            unlock();
        }
    },

    // Bash / PowerShell
    execute_bash_command: async ({ command, background = false, timeout = 15000 }, context, signal) => {
        const trimmedCmd = command.trim();

        const dangerousPatterns = [
            /(^|[;&|\s])rm\s+(-rf|-r|-f)\s+\/($|[;&|\s])/i,
            />\s*\/dev\/sd/i,
            /\bmkfs\b/i,
            /\bdd\s+/i,
            /\bwget\s+/i,
            /\bcurl\s+.*\|\s*sh/i,
            /\bchmod\s+777/i,
            /\bcat\s+.*id_rsa/i
        ];

        if (dangerousPatterns.some(p => p.test(trimmedCmd))) {
            return `[Security Block] The command contains potentially destructive operations and has been blocked.`;
        }

        if (background && isChildWindow()) {
            try {
                return await callParentShell('start', { command });
            } catch (e) {
                return `Error starting background task via parent: ${e.message}`;
            }
        }

        const crypto = require('crypto');
        const scriptId = crypto.randomBytes(4).toString('hex');
        const tempDir = os.tmpdir();
        
        let tempFile = '';
        let shellToUse = '';
        let spawnArgs = [];
        let execCmd = '';

        if (isWin) {
            tempFile = path.join(tempDir, `anywhere_cmd_${Date.now()}_${scriptId}.ps1`);
            const preamble = `
$OutputEncoding = [System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$PSDefaultParameterValues['*:Encoding'] = 'utf8';
`;
            // 添加 UTF-8 BOM (\uFEFF)，解决 PowerShell 5.1 默认按 ANSI 读取导致的 Unicode 乱码和引号配对破坏问题
            fs.writeFileSync(tempFile, '\uFEFF' + preamble + '\n' + command, { encoding: 'utf8' });
            shellToUse = 'powershell.exe';
            spawnArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tempFile];
            execCmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempFile}"`;
        } else {
            tempFile = path.join(tempDir, `anywhere_cmd_${Date.now()}_${scriptId}.sh`);
            fs.writeFileSync(tempFile, command, { encoding: 'utf8' });
            shellToUse = '/bin/bash';
            spawnArgs = [tempFile];
            execCmd = `"/bin/bash" "${tempFile}"`;
        }

        const cleanupTempFile = () => {
            try {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            } catch (e) {
                console.error("Failed to clean up temp script:", e);
            }
        };

        if (!background && trimmedCmd.startsWith('cd ') && trimmedCmd.split('\n').length === 1) {
            let targetDir = trimmedCmd.substring(3).trim();
            if ((targetDir.startsWith('"') && targetDir.endsWith('"')) || (targetDir.startsWith("'") && targetDir.endsWith("'"))) {
                targetDir = targetDir.substring(1, targetDir.length - 1);
            }
            try {
                const newPath = path.resolve(bashCwd, targetDir);
                if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                    bashCwd = newPath;
                    cleanupTempFile();
                    return `Directory changed to: ${bashCwd}`;
                } else {
                    cleanupTempFile();
                    return `Error: Directory not found: ${newPath}`;
                }
            } catch (e) {
                cleanupTempFile();
                return `Error changing directory: ${e.message}`;
            }
        }

        if (background) {
            return new Promise((resolve) => {
                const shellId = `shell_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                
                try {
                    const child = require('child_process').spawn(shellToUse, spawnArgs, {
                        cwd: bashCwd,
                        env: { ...process.env, FORCE_COLOR: '1' },
                        detached: !isWin 
                    });

                    backgroundShells.set(shellId, {
                        process: child,
                        command: command,
                        startTime: new Date().toISOString(),
                        logs: "",
                        pid: child.pid,
                        active: true
                    });

                    child.stdout.on('data', (data) => appendBgLog(shellId, data.toString()));
                    child.stderr.on('data', (data) => appendBgLog(shellId, data.toString()));

                    child.on('error', (err) => {
                        appendBgLog(shellId, `\n[System Error]: ${err.message}\n`);
                        const proc = backgroundShells.get(shellId);
                        if(proc) proc.active = false;
                        cleanupTempFile();
                    });

                    child.on('close', (code) => {
                        appendBgLog(shellId, `\n[System]: Process exited with code ${code}\n`);
                        const proc = backgroundShells.get(shellId);
                        if(proc) proc.active = false;
                        cleanupTempFile();
                    });

                    try {
                        const parentPid = process.pid;
                        const targetPid = child.pid;
                        
                        if (isWin) {
                            const watcherCmd = `Wait-Process -Id ${parentPid} -ErrorAction SilentlyContinue; taskkill /pid ${targetPid} /T /F 2>$null`;
                            require('child_process').spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', watcherCmd], {
                                detached: true, stdio: 'ignore', windowsHide: true
                            }).unref();
                        } else {
                            const watcherCmd = `while kill -0 ${parentPid} 2>/dev/null; do sleep 1; done; kill -9 -${targetPid} 2>/dev/null || kill -9 ${targetPid} 2>/dev/null`;
                            require('child_process').spawn('sh', ['-c', watcherCmd], {
                                detached: true, stdio: 'ignore'
                            }).unref();
                        }
                    } catch (watcherErr) {
                        console.error("Failed to start process watcher:", watcherErr);
                    }

                    resolve(`Background process started successfully.\nID: ${shellId}\nPID: ${child.pid}\n\nUse 'read_background_shell_output' to view logs.`);
                } catch (e) {
                    cleanupTempFile();
                    resolve(`Failed to start background process: ${e.message}`);
                }
            });
        }

        return new Promise((resolve) => {
            const validTimeout = (typeof timeout === 'number' && timeout > 0) ? timeout : 15000;

            let shellOptions = {
                cwd: bashCwd,
                encoding: 'buffer',
                maxBuffer: 1024 * 1024 * 10,
                timeout: validTimeout
            };

            const child = require('child_process').exec(execCmd, shellOptions, (error, stdout, stderr) => {
                cleanupTempFile();
                
                const decodeBuffer = (buf) => {
                    if (!buf || buf.length === 0) return "";
                    const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
                    const utf8Str = utf8Decoder.decode(buf);

                    if (isWin && (utf8Str.includes('\uFFFD') || error)) {
                        try {
                            const gbkDecoder = new TextDecoder('gbk', { fatal: false });
                            return gbkDecoder.decode(buf);
                        } catch (e) {
                            return utf8Str;
                        }
                    }
                    return utf8Str;
                };

                let result = "";
                const outStr = decodeBuffer(stdout);
                const errStr = decodeBuffer(stderr);

                if (outStr) result += outStr;
                
                if (errStr) {
                    result += `\n[Stderr/Warning]:\n${errStr}`;
                }

                if (error) {
                    if (error.signal === 'SIGTERM') {
                        result += `\n\n[System Note]: Command timed out after ${validTimeout / 1000}s. For long tasks, set 'background': true.`;
                    } else if (error.killed) {
                        result += `\n\n[System Note]: Command was aborted by user.`;
                    } else {
                        if (!errStr && error.message) {
                            result += `\n\n[Execution Error]: ${error.message}`;
                        }
                    }
                }

                if (!result.trim()) result = "Command executed successfully (no output).";
                resolve(`[CWD: ${bashCwd}]\n${result}`);
            });

            if (signal) {
                signal.addEventListener('abort', () => {
                    child.kill();
                    cleanupTempFile();
                });
            }
        });
    },

    list_background_shells: async () => {
        if (isChildWindow()) return await callParentShell('list', {});

        if (backgroundShells.size === 0) return "No active background shells.";
        
        let output = "ID | PID | Status | Start Time | Command\n";
        output += "--- | --- | --- | --- | ---\n";
        
        backgroundShells.forEach((proc, id) => {
            const status = proc.active ? "Running" : "Exited";
            const cmdDisplay = proc.command.length > 30 ? proc.command.substring(0, 30) + '...' : proc.command;
            output += `${id} | ${proc.pid} | ${status} | ${proc.startTime} | ${cmdDisplay}\n`;
        });
        
        return output;
    },

    read_background_shell_output: async ({ shell_id, offset = 0, length = 5000 }) => {
        if (isChildWindow()) return await callParentShell('read', { shell_id, offset, length });

        const proc = backgroundShells.get(shell_id);
        if (!proc) return `Error: Shell ID '${shell_id}' not found.`;

        const fullLogs = proc.logs;
        const totalLength = fullLogs.length;
        const safeOffset = Math.max(0, offset);
        const safeLength = Math.min(length, MAX_READ);

        const chunk = fullLogs.substring(safeOffset, safeOffset + safeLength);
        const nextOffset = safeOffset + chunk.length;
        
        let statusInfo = `[Process State: ${proc.active ? 'Running' : 'Exited'}]`;
        let footer = "";
        
        if (nextOffset < totalLength) {
            footer = `\n\n[System]: More output available (${totalLength - nextOffset} chars remaining). Call tool again with offset=${nextOffset}.`;
        }

        return `${statusInfo}\n(Showing chars ${safeOffset}-${nextOffset} of ${totalLength})\n----------------------------------------\n${chunk}${footer}`;
    },

    kill_background_shell: async ({ shell_id }) => {
        if (isChildWindow()) return await callParentShell('kill', { shell_id });

        const proc = backgroundShells.get(shell_id);
        if (!proc) return `Error: Shell ID '${shell_id}' not found.`;

        if (!proc.active) {
            backgroundShells.delete(shell_id);
            return `Process '${shell_id}' was already exited. Removed from history.`;
        }

        try {
            const pid = proc.pid;
            if (isWin) {
                // Windows Tree Kill (/T)
                require('child_process').exec(`taskkill /pid ${pid} /T /F`, (err) => {
                    if (err) console.log('Taskkill ignored error:', err.message);
                });
            } else {
                // Unix Group Kill (使用 -pid)
                try {
                    process.kill(-pid, 'SIGKILL'); 
                } catch (e) {
                    try { process.kill(pid, 'SIGKILL'); } catch(e2){}
                }
            }
            
            proc.active = false;
            appendBgLog(shell_id, `\n[System]: Process terminated by user request (Tree Kill).\n`);
            return `Successfully sent tree kill signal to process ${pid} (${shell_id}).`;
        } catch (e) {
            return `Error killing process: ${e.message}`;
        }
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
    },

    // --- Agent Collaboration Handlers ---
    list_agents: async (args, context, signal) => {
        if (isChildWindow()) return await callParentShell('list_agents', args, signal);
        
        const { getConfig } = require('./data.js');
        const configData = await getConfig();
        const prompts = configData.config.prompts || {};
        const allMcpServers = configData.config.mcpServers || {};

        if (args && args.agent_name) {
            const agent = prompts[args.agent_name];
            if (!agent) return `Error: Agent "${args.agent_name}" not found.`;
            
            // --- 解析能力信息 (MCP & Skills) ---
            
            // 1. 获取并映射 MCP 名称
            const mcpIds = agent.defaultMcpServers || [];
            const mcpNames = mcpIds.map(id => {
                const server = allMcpServers[id];
                // 如果能找到配置则显示名称，否则显示ID
                return server ? server.name : id;
            });
            const mcpDisplay = mcpNames.length > 0 ? `[${mcpNames.join(', ')}]` : "None";

            // 2. 获取 Skills 列表
            const skills = agent.defaultSkills || [];
            const skillDisplay = skills.length > 0 ? `[${skills.join(', ')}]` : "None";

            // --- 构建详情 ---
            let detail = `Agent: ${args.agent_name}\n`;
            detail += `Type: ${agent.type}\n`;
            detail += `Model: ${agent.model}\n`;
            detail += `Enabled: ${agent.enable}\n`;
            detail += `\n[Capabilities]\n`;
            detail += `- Bound MCP Tools: ${mcpDisplay}\n`;
            detail += `- Bound Skills: ${skillDisplay}\n`;
            detail += `\n[System Prompt]\n${agent.prompt || 'None'}`;
            
            return detail;
        }

        let agentStr = "- __DEFAULT__ (The global default agent)\n";
        // 筛选 Standalone Window 模式 且 已启用 的 Agent
        Object.entries(prompts)
            .filter(([_, p]) => p.showMode === 'window' && p.enable)
            .forEach(([key]) => {
                agentStr += `- ${key}\n`;
            });
            
        return `Available Agents (Standalone Window Mode & Enabled):\n${agentStr}`;
    },

    summon_agent: async (args, context, signal) => {
        if (isChildWindow()) return await callParentShell('summon_agent', args, signal);
        
        const { agent_name, text, file_paths } = args;
        const { getConfig, openWindow } = require('./data.js');
        const configData = await getConfig();
        const windowConfig = JSON.parse(JSON.stringify(configData.config));

        if (agent_name !== '__DEFAULT__' && !windowConfig.prompts[agent_name]) {
            return `Error: Agent "${agent_name}" not found.`;
        }
        if (agent_name === '__DEFAULT__') {
            if (!windowConfig.prompts) windowConfig.prompts = {};
            windowConfig.prompts['__DEFAULT__'] = {
                type: "general", prompt: "", showMode: "window", model: windowConfig.defaultTaskModel || "", stream: true, isAlwaysOnTop: true, autoCloseOnBlur: false, window_width: 580, window_height: 740, icon: ""
            };
        }

        const msg = {
            os: process.platform === 'win32' ? 'win' : (process.platform === 'darwin' ? 'macos' : 'linux'),
            code: agent_name,
            type: "summon",
            summonData: { text, file_paths }
        };

        const senderId = await openWindow(windowConfig, msg);
        return `Agent summoned successfully. Window ID: ${senderId}`;
    },

    list_agent_chats: async (args, context, signal) => {
        if (isChildWindow()) return await callParentShell('list_agent_chats', { _callerId: context?.senderId }, signal);
        
        const { windowMap } = require('./data.js');
        let result = "Active Agent Windows:\n";
        const callerId = args ? args._callerId : (context ? context.senderId : null);

        const deadIds = []; // 收集已死亡的窗口ID用于清理

        for (const [id, win] of windowMap.entries()) {
            if (win.isDestroyed()) {
                deadIds.push(id);
                continue;
            }
            const title = win.getTitle(); 
            // 标题依然是默认的 "Anywhere" 代表渲染未完成或已成死区
            if (title === "Anywhere") {
                continue; 
            }
            const isMe = callerId === id ? "  <-- [This is YOU]" : "";
            result += `- Window ID: ${id} | Agent: ${title}${isMe}\n`;
        }

        // 执行垃圾回收
        deadIds.forEach(id => windowMap.delete(id));

        if (result === "Active Agent Windows:\n") result = "No active agent windows.";
        return result;
    },

    read_agent_chats: async (args, context, signal) => {
        // 传递 callerId 到主进程
        if (isChildWindow()) {
            args._callerId = context?.senderId;
            return await callParentShell('read_agent_chats', args, signal);
        }

        const callerId = args._callerId || context?.senderId;
        const { window_id, message_index, offset = 0, length = 128000 } = args;

        if (window_id === callerId) {
            return `[System Error]: You cannot use this tool to read your own window (Window ID: ${window_id}). You already have your own chat history in your current context.`;
        }

        const { windowMap } = require('./data.js');
        const win = windowMap.get(window_id);
        
        if (!win || win.isDestroyed()) return `[System Notice]: Target Window (ID: ${window_id}) is already closed or does not exist.`;

        try {
            const chatLength = await win.webContents.executeJavaScript('window.__AGENT_API__ ? window.__AGENT_API__.getChatLength() : 0');
            
            let shouldWait = false;
            if (message_index !== undefined && message_index !== null) {
                let actualIndex = parseInt(message_index);
                if (actualIndex < 0) actualIndex = chatLength + actualIndex;
                if (actualIndex >= chatLength - 1) {
                    shouldWait = true;
                }
            }

            let timeoutMsg = "";
            if (shouldWait) {
                let waitCount = 0;
                while (!win.isDestroyed() && waitCount < 1200) {
                    const isBusy = await win.webContents.executeJavaScript('window.__AGENT_API__ ? window.__AGENT_API__.isBusy() : false').catch(() => false);
                    if (!isBusy) break; 
                    await new Promise(r => setTimeout(r, 100));
                    waitCount++;
                }

                if (win.isDestroyed()) return `[System Notice]: The target window was CLOSED by the user while waiting for the response. Operation aborted.`;
                
                if (waitCount >= 1200) {
                    timeoutMsg = `\n[System Warning]: The request timed out after 120s. The agent is still generating, so the following content may be incomplete.`;
                }
            }

            const outline = await win.webContents.executeJavaScript('window.__AGENT_API__ ? window.__AGENT_API__.getOutline() : "Error: API not ready."');
            const outlineSection = `### Current Conversation Outline (Window ${window_id})${timeoutMsg}\n${outline}\n`;

            if (message_index === undefined || message_index === null) {
                return `${outlineSection}\n[System]: To read a specific message detail, use 'read_agent_chats' WITH the 'message_index'.`;
            } 

            const content = await win.webContents.executeJavaScript(`window.__AGENT_API__ ? window.__AGENT_API__.getMessage(${message_index}) : "Error: API not ready."`);

            if (content.startsWith("Error:")) {
                return `${outlineSection}\n\n[System Error fetching message]: ${content}`;
            }

            const totalChars = content.length;
            const safeOffset = Math.max(0, offset);
            const safeLength = Math.min(length, 128000); 
            
            const chunk = content.substring(safeOffset, safeOffset + safeLength);
            const currentEndPos = safeOffset + chunk.length;

            let footer = "";
            
            if (currentEndPos < totalChars) {
                const remaining = totalChars - currentEndPos;
                footer = `\n\n--- [SYSTEM: CONTENT TRUNCATED] ---\n(Showing chars ${safeOffset}-${currentEndPos} of ${totalChars})\nRemaining: ${remaining} chars.\n>>> ACTION REQUIRED: Call 'read_agent_chats' again with offset=${currentEndPos} to read the rest.`;
            } else {
                footer = `\n\n--- [SYSTEM: END OF MESSAGE] ---\n(Total length: ${totalChars} chars)`;
            }

            return `${outlineSection}\n========================================\n### Detailed Message Content (Index: ${message_index})\n${chunk}${footer}`;

        } catch (e) {
            return `Error communicating with window: ${e.message}`;
        }
    },

    continue_agent_chats: async (args, context, signal) => {
        // 传递 callerId 到主进程
        if (isChildWindow()) {
            args._callerId = context?.senderId;
            return await callParentShell('continue_agent_chats', args, signal);
        }

        const callerId = args._callerId || context?.senderId;
        const { window_id, text, file_paths } = args;

        if (window_id === callerId) {
            return `[System Error]: You cannot send messages to yourself (Window ID: ${window_id}). If you need to reason or take multiple steps, use the 'sub_agent' tool or just respond normally in the chat.`;
        }

        const { windowMap } = require('./data.js');
        const win = windowMap.get(window_id);
        if (!win || win.isDestroyed()) return `Error: Window ID ${window_id} not found or closed.`;

        try {
            const res = await win.webContents.executeJavaScript(`window.__AGENT_API__ ? window.__AGENT_API__.sendMessage(${JSON.stringify(text)}, ${JSON.stringify(file_paths || [])}) : Promise.reject("API not ready")`);
            return res; 
        } catch (e) {
             return `Error sending message: ${e.message}`;
        }
    },

    close_agent_window: async (args, context, signal) => {
        // 传递 callerId 到主进程
        if (isChildWindow()) {
            args._callerId = context?.senderId;
            return await callParentShell('close_agent_window', args, signal);
        }

        const { window_id } = args;
        const { windowMap } = require('./data.js');
        const win = windowMap.get(window_id);
        
        if (!win || win.isDestroyed()) return `Error: Window ID ${window_id} not found or already closed.`;

        try {
            await win.webContents.executeJavaScript(`window.__AGENT_API__ ? window.__AGENT_API__.closeWindow() : Promise.reject("API not ready")`);
            return `Successfully saved and closed agent window (ID: ${window_id}).`;
        } catch (e) {
            // 如果 AI 关闭的是自己，窗口销毁会导致 IPC 断连报错，这里做无感捕获处理
            if (e.message.includes('Object has been destroyed')) {
                 return `Successfully saved and closed agent window (ID: ${window_id}).`;
            }
            return `Error closing window: ${e.message}`;
        }
    },

    list_mcp_servers: async () => {
        const { getConfig } = require('./data.js');
        const configData = await getConfig();
        const mcpServers = configData.config.mcpServers || {};
        
        let mcpStr = "Available MCP Servers (ID - Name: Description):\n";
        Object.entries(mcpServers).filter(([_, s]) => s.isActive).forEach(([id, s]) => {
            mcpStr += `- ID: [${id}] - Name: [${s.name}] - Desc: ${s.description || 'No description'}\n`;
        });
        return mcpStr;
    },

    list_tasks: async ({ task_name_or_id }) => {
        const { getConfig } = require('./data.js');
        const configData = await getConfig();
        const tasks = configData.config.tasks || {};
        
        if (Object.keys(tasks).length === 0) return "No tasks found.";

        if (task_name_or_id) {
            let targetId = tasks[task_name_or_id] ? task_name_or_id : null;
            if (!targetId) {
                const entry = Object.entries(tasks).find(([_, t]) => t.name === task_name_or_id);
                if (entry) targetId = entry[0];
            }

            if (!targetId) return `Error: Task "${task_name_or_id}" not found.`;
            
            const task = tasks[targetId];
            let details = `### Task Details\n`;
            details += `- ID: ${targetId}\n`;
            details += `- Name: ${task.name}\n`;
            details += `- Enabled: ${task.enabled}\n`;
            details += `- Agent: ${task.promptKey}\n`;
            details += `- Schedule Type: ${task.triggerType}\n`;
            
            if (task.triggerType === 'interval') {
                details += `- Interval: Every ${task.intervalMinutes} mins\n`;
                if (task.intervalStartTime) details += `- Daily Start Check: ${task.intervalStartTime}\n`;
                if (task.intervalTimeRanges && task.intervalTimeRanges.length > 0) {
                    const rangesStr = task.intervalTimeRanges.map(r => r.join('-')).join(', ');
                    details += `- Active Ranges: [${rangesStr}]\n`;
                } else {
                    details += `- Active Ranges: All Day (24h)\n`;
                }
            } else if (task.triggerType === 'daily') {
                details += `- Daily Time: ${task.dailyTime}\n`;
            } else if (task.triggerType === 'weekly') {
                details += `- Weekly Time: ${task.weeklyTime} on days [${task.weeklyDays.join(',')}]\n`;
            } else if (task.triggerType === 'monthly') {
                const mDays = Array.isArray(task.monthlyDays) ? task.monthlyDays : [];
                details += `- Monthly Time: ${task.monthlyTime} on dates [${mDays.join(',')}]\n`;
            } else if (task.triggerType === 'single') {
                details += `- Single Run: ${task.singleDate} at ${task.singleTime}\n`;
            }
            
            if (task.extraMcp && task.extraMcp.length > 0) details += `- Extra MCPs: [${task.extraMcp.join(', ')}]\n`;
            if (task.extraSkills && task.extraSkills.length > 0) details += `- Extra Skills: [${task.extraSkills.join(', ')}]\n`;
            
            details += `\n**Instruction:**\n${task.description}`;
            return details;
        }

        const taskList = Object.entries(tasks).map(([id, task]) => {
            return `- [${task.enabled ? 'ON' : 'OFF'}] ${task.name} (ID: ${id})`;
        });

        return "Current Tasks (Summary):\n" + taskList.join('\n') + "\n\n(Tip: Use 'task_name_or_id' argument to see full details of a specific task)";
    },

    create_task: async ({ name, instruction, agent_name = '__DEFAULT__', schedule_type, time_param, enabled = true, single_date, interval_time_ranges, weekly_days, monthly_days, extra_mcp, extra_skills, }) => {
        const unlock = await acquireLock('config_tasks');
        try {
            const { getConfig, updateConfigWithoutFeatures } = require('./data.js');
            const configData = await getConfig();
            const tasks = configData.config.tasks || {};
            const prompts = configData.config.prompts || {};

            if (Object.values(tasks).some(t => t.name === name)) return `Error: A task with name "${name}" already exists.`;

            let targetPromptKey = '__DEFAULT__';
            if (agent_name && agent_name !== '__DEFAULT__') {
                const exactMatch = Object.keys(prompts).find(k => k === agent_name);
                if (exactMatch) targetPromptKey = exactMatch;
                else {
                    const fuzzyMatch = Object.keys(prompts).find(k => k.toLowerCase().includes(agent_name.toLowerCase()));
                    if (fuzzyMatch) targetPromptKey = fuzzyMatch;
                    else return `Error: Agent "${agent_name}" not found. Try using list_agents.`;
                }
            }

            const taskId = `task_${Date.now()}`;
            const newTask = {
                name: name,
                description: instruction || "",
                promptKey: targetPromptKey,
                triggerType: schedule_type,
                enabled: enabled,
                intervalMinutes: 60, intervalStartTime: '00:00', intervalTimeRanges: [], 
                dailyTime: '12:00', weeklyDays: [1,2,3,4,5], weeklyTime: '12:00', monthlyDays: [1], monthlyTime: '12:00',
                extraMcp: [], extraSkills: [], autoSave: true, autoClose: true, history: [],
                lastRunTime: enabled ? Date.now() : 0,
                singleDate: single_date || new Date().toISOString().split('T')[0],
                singleTime: '12:00',
            };

            if (interval_time_ranges && Array.isArray(interval_time_ranges)) {
                newTask.intervalTimeRanges = interval_time_ranges.map(r => r.split('-')).filter(r => r.length === 2);
            }
            
            // --- MCP / SKill 逻辑 ---
            if (extra_mcp && Array.isArray(extra_mcp)) {
                newTask.extraMcp = extra_mcp;
            } else if (configData.config.mcpServers) {
                // 如果没传，默认挂载所有内置服务
                newTask.extraMcp = Object.entries(configData.config.mcpServers).filter(([_, s]) => s.type === 'builtin').map(([id]) => id);
            }
            
            if (extra_skills && Array.isArray(extra_skills)) {
                newTask.extraSkills = extra_skills;
            }

            if (schedule_type === 'daily' || schedule_type === 'weekly' || schedule_type === 'monthly' || schedule_type === 'single') {
                if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time_param)) {
                    if (schedule_type === 'daily') newTask.dailyTime = time_param;
                    if (schedule_type === 'weekly') newTask.weeklyTime = time_param;
                    if (schedule_type === 'monthly') newTask.monthlyTime = time_param;
                    if (schedule_type === 'single') newTask.singleTime = time_param;
                } else return "Error: Invalid time format. Use HH:mm.";

                if (schedule_type === 'weekly') {
                    if (Array.isArray(weekly_days)) newTask.weeklyDays = weekly_days;
                    else return "Error: weekly_days array is required for weekly schedule.";
                }
                if (schedule_type === 'monthly') {
                    if (Array.isArray(monthly_days)) newTask.monthlyDays = monthly_days;
                    else return "Error: monthly_days array is required for monthly schedule.";
                }
                if (schedule_type === 'single') {
                    if (single_date) {
                        if (/^\d{4}-\d{2}-\d{2}$/.test(single_date)) {
                            newTask.singleDate = single_date;
                        } else {
                            return "Error: single_date must be YYYY-MM-DD.";
                        }
                    } else {
                        const nowD = new Date();
                        newTask.singleDate = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`;
                    }
                }
            } else if (schedule_type === 'interval') {
                const minutes = parseInt(time_param);
                if (!isNaN(minutes) && minutes > 0) newTask.intervalMinutes = minutes;
                else return "Error: Invalid interval minutes.";
            } else {
                return "Error: Unknown schedule_type.";
            }

            tasks[taskId] = newTask;
            configData.config.tasks = tasks;
            await updateConfigWithoutFeatures({ config: configData.config });

            return `Task "${name}" created successfully.`;
        } finally {
            unlock();
        }
    },

    edit_task: async ({ task_name_or_id, new_name, instruction, agent_name, schedule_type, time_param, single_date, interval_time_ranges, weekly_days, monthly_days, extra_mcp, extra_skills }) => {
        const unlock = await acquireLock('config_tasks');
        try {
            const { getConfig, updateConfigWithoutFeatures } = require('./data.js');
            const configData = await getConfig();
            const tasks = configData.config.tasks || {};
            const prompts = configData.config.prompts || {};

            let targetId = tasks[task_name_or_id] ? task_name_or_id : null;
            if (!targetId) {
                const entry = Object.entries(tasks).find(([_, t]) => t.name === task_name_or_id);
                if (entry) targetId = entry[0];
            }

            if (!targetId) return `Error: Task "${task_name_or_id}" not found.`;
            const task = tasks[targetId];

            if (new_name && new_name !== task.name) {
                if (Object.values(tasks).some(t => t.name === new_name)) return `Error: Task name "${new_name}" already exists.`;
                task.name = new_name;
            }

            if (instruction !== undefined) task.description = instruction;

            if (agent_name) {
                if (agent_name === '__DEFAULT__') {
                    task.promptKey = '__DEFAULT__';
                } else {
                    const exactMatch = Object.keys(prompts).find(k => k === agent_name);
                    if (exactMatch) task.promptKey = exactMatch;
                    else {
                        const fuzzyMatch = Object.keys(prompts).find(k => k.toLowerCase().includes(agent_name.toLowerCase()));
                        if (fuzzyMatch) task.promptKey = fuzzyMatch;
                        else return `Error: Agent "${agent_name}" not found. Edit cancelled.`;
                    }
                }
            }

            // --- 修改 MCP 和 Skill 逻辑 ---
            if (extra_mcp !== undefined) {
                if (Array.isArray(extra_mcp)) task.extraMcp = extra_mcp;
                else return "Error: extra_mcp must be an array of strings.";
            }

            if (extra_skills !== undefined) {
                if (Array.isArray(extra_skills)) task.extraSkills = extra_skills;
                else return "Error: extra_skills must be an array of strings.";
            }

            let timeChanged = false;
            if (schedule_type) { task.triggerType = schedule_type; timeChanged = true; }
            const currentType = schedule_type || task.triggerType;

            if (interval_time_ranges !== undefined) {
                if (Array.isArray(interval_time_ranges)) {
                    task.intervalTimeRanges = interval_time_ranges.map(r => r.split('-')).filter(r => r.length === 2);
                } else {
                    task.intervalTimeRanges = [];
                }
            }

            if (time_param) {
                if (currentType === 'daily' || currentType === 'weekly' || currentType === 'monthly' || currentType === 'single') {
                    if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time_param)) { 
                        if (currentType === 'daily') task.dailyTime = time_param; 
                        if (currentType === 'weekly') task.weeklyTime = time_param; 
                        if (currentType === 'monthly') task.monthlyTime = time_param;
                        if (currentType === 'single') task.singleTime = time_param; 
                        timeChanged = true; 
                    }
                    else return "Error: Invalid time format. Use HH:mm.";
                } else if (currentType === 'interval') {
                    const minutes = parseInt(time_param);
                    if (!isNaN(minutes) && minutes > 0) { task.intervalMinutes = minutes; timeChanged = true; }
                    else return "Error: Invalid interval minutes.";
                }
            }

            if (weekly_days !== undefined) {
                if (Array.isArray(weekly_days)) { task.weeklyDays = weekly_days; timeChanged = true; }
                else return "Error: weekly_days must be an array.";
            }

            if (monthly_days !== undefined) {
                if (Array.isArray(monthly_days)) { task.monthlyDays = monthly_days; timeChanged = true; }
                else return "Error: monthly_days must be an array.";
            }

            if (single_date !== undefined) {
                if (/^\d{4}-\d{2}-\d{2}$/.test(single_date)) { task.singleDate = single_date; timeChanged = true; }
                else return "Error: single_date must be YYYY-MM-DD.";
            }

            if (timeChanged && task.enabled) {
                task.lastRunTime = Date.now();
            }

            configData.config.tasks = tasks;
            await updateConfigWithoutFeatures({ config: configData.config });

            return `Task updated successfully.`;
        } finally {
            unlock();
        }
    },

    control_task: async ({ task_name_or_id, enable }) => {
        const unlock = await acquireLock('config_tasks'); // 加锁
        try {
            const { getConfig, updateConfigWithoutFeatures } = require('./data.js');
            const configData = await getConfig();
            const tasks = configData.config.tasks || {};

            let targetId = tasks[task_name_or_id] ? task_name_or_id : null;
            if (!targetId) {
                // Try finding by name
                const entry = Object.entries(tasks).find(([_, t]) => t.name === task_name_or_id);
                if (entry) targetId = entry[0];
            }

            if (!targetId) return `Error: Task "${task_name_or_id}" not found.`;

            tasks[targetId].enabled = enable;

            // Reset last run time if enabling, so it doesn't trigger immediately if missed
            if (enable) {
                tasks[targetId].lastRunTime = Date.now();
            }

            await updateConfigWithoutFeatures({ config: configData.config });
            return `Task "${tasks[targetId].name}" has been ${enable ? 'ENABLED' : 'DISABLED'}.`;
        } finally {
            unlock(); // 释放锁
        }
    },

    delete_task: async ({ task_name_or_id }) => {
        const unlock = await acquireLock('config_tasks'); // 加锁
        try {
            const { getConfig, updateConfigWithoutFeatures } = require('./data.js');
            const configData = await getConfig();
            const tasks = configData.config.tasks || {};

            let targetId = tasks[task_name_or_id] ? task_name_or_id : null;
            if (!targetId) {
                const entry = Object.entries(tasks).find(([_, t]) => t.name === task_name_or_id);
                if (entry) targetId = entry[0];
            }

            if (!targetId) return `Error: Task "${task_name_or_id}" not found.`;

            const deletedName = tasks[targetId].name;
            delete tasks[targetId];

            await updateConfigWithoutFeatures({ config: configData.config });
            return `Task "${deletedName}" deleted successfully.`;
        } finally {
            unlock(); // 释放锁
        }
    },

    // Time Handler
    get_current_time: async ({ timezone }) => {
        try {
            const options = {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            };
            if (timezone) {
                options.timeZone = timezone;
            }
            
            const now = new Date();
            const dateStr = new Intl.DateTimeFormat('zh-CN', options).format(now).replace(/\//g, '-');
            const weekdayStr = new Intl.DateTimeFormat('en-US', { 
                weekday: 'long', 
                ...(timezone ? { timeZone: timezone } : {}) 
            }).format(now);
            
            const tzDisplay = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Local System Time";

            return `Current Time (${tzDisplay}):\nDate & Time: ${dateStr}\nDay of Week: ${weekdayStr}`;
        } catch (e) {
            return `Error getting time: ${e.message}. Please ensure the timezone string is valid (e.g., 'Asia/Shanghai').`;
        }
    },
};

// --- Exports ---

function getBuiltinServers() {
    return JSON.parse(JSON.stringify(BUILTIN_SERVERS));
}

function getBuiltinTools(serverId) {
    // 必须深拷贝，避免修改原始常量导致叠加污染
    const tools = JSON.parse(JSON.stringify(BUILTIN_TOOLS[serverId] || []));
    
    // [动态注入] Super-Agent 自动枚举所有可用 Agent，消除模型幻觉
    if (serverId === 'builtin_superagent') {
        try {
            // 同步读取数据库获取最新 Agent 列表 (utools.db.get 是同步的，非常适合这里)
            const promptsDoc = utools.db.get("prompts");
            const prompts = promptsDoc ? promptsDoc.data : {};
            
            // 筛选 Standalone Window 模式 且 已启用 的 Agent (只有这种才能被召唤)
            const agentNames = Object.entries(prompts)
                .filter(([_, p]) => p.showMode === 'window' && p.enable)
                .map(([k]) => k)
                .sort();
                
            // 始终包含默认 Agent
            const allAgents = ['__DEFAULT__', ...agentNames];
            
            // 限制展示数量，防止 Description 过长导致 Token 溢出 (虽然一般不会超)
            const displayAgents = allAgents.slice(0, 100); 
            const agentListStr = displayAgents.map(n => `"${n}"`).join(', ');
            const suffix = allAgents.length > 100 ? `...and ${allAgents.length - 100} more` : '';
            
            const fullListStr = `${agentListStr}${suffix}`;

            // 1. 注入到 list_agents
            const listTool = tools.find(t => t.name === 'list_agents');
            if (listTool) {
                listTool.description += `\n\n[CURRENTLY AVAILABLE AGENTS]: ${fullListStr}`;
            }
            
            // 2. 同时也注入到 summon_agent，让 AI 在决定召唤时手边就有确切的名单
            const summonTool = tools.find(t => t.name === 'summon_agent');
            if (summonTool) {
                 summonTool.description += `\n\n[VALID TARGET NAMES]: ${fullListStr}`;
            }

        } catch (e) {
            // 即使出错也不影响基础功能，只是少了个提示
            // console.error("Inject agent list failed:", e);
        }
    }
    
    return tools;
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

function killAllBackgroundShells() {
    if (backgroundShells.size === 0) return;
    const { execSync } = require('child_process');
    
    backgroundShells.forEach((proc, shell_id) => {
        if (proc.active && proc.pid) {
            try {
                if (isWin) {
                    // 使用同步阻塞执行，确保在插件进程死亡前把子进程杀干净
                    execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
                } else {
                    try { process.kill(-proc.pid, 'SIGKILL'); } 
                    catch (e) { try { process.kill(proc.pid, 'SIGKILL'); } catch(e2){} }
                }
            } catch (e) {
                // 忽略错误，强制执行
            }
            proc.active = false;
        }
    });
    backgroundShells.clear();
}

// 绑定 Node.js 原生系统级死亡信号，确保即使被系统强杀也能带走子进程
process.on('exit', killAllBackgroundShells);
process.on('SIGINT', () => { killAllBackgroundShells(); process.exit(); });
process.on('SIGTERM', () => { killAllBackgroundShells(); process.exit(); });

// 供 preload.js 调用的统一入口
function handleBgShellRequest(action, payload) {
    const fnMap = {
        // 绑定命令行工具命令
        'start': handlers.execute_bash_command,
        'list': handlers.list_background_shells,
        'read': handlers.read_background_shell_output,
        'kill': handlers.kill_background_shell,

        // 绑定agent协作命令
        'list_agents': handlers.list_agents,
        'summon_agent': handlers.summon_agent,
        'list_agent_chats': handlers.list_agent_chats,
        'read_agent_chats': handlers.read_agent_chats,
        'continue_agent_chats': handlers.continue_agent_chats,
        'close_agent_window': handlers.close_agent_window,
    };
    
    const fn = fnMap[action];
    if (!fn) throw new Error("Unknown action: " + action);
    
    if (action === 'start') {
        return fn({ command: payload.command, background: true }, null, null);
    }
    return fn(payload, null, null);
}

module.exports = {
    getBuiltinServers,
    getBuiltinTools,
    invokeBuiltinTool,
    handleBgShellRequest,
    killAllBackgroundShells
};