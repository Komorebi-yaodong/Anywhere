const isWin = process.platform === 'win32';

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
    "builtin_memory": {
        id: "builtin_memory",
        name: "Memory System",
        description: "基于 uTools 本地存储的持久化记忆系统。支持创建文档、分章节存储、列表项管理及全文搜索。数据将在多设备间自动同步。",
        type: "builtin",
        isActive: true,
        isPersistent: false,
        tags: ["memory", "storage", "sync"],
        logoUrl: "https://api.iconify.design/lucide:brain.svg"
    },
    "builtin_betterwork": {
        id: "builtin_betterwork",
        name: "Better Work",
        description: "主动向用户发起选择题确认（多问题多选项），并维护当前对话的临时任务清单与进度展示。",
        type: "builtin",
        isActive: true,
        isPersistent: false,
        tags: ["interactive", "task", "confirm"],
        logoUrl: "https://api.iconify.design/lucide:list-checks.svg"
    },
};

function getBuiltinServers() {
    return JSON.parse(JSON.stringify(BUILTIN_SERVERS));
}

module.exports = {
    getBuiltinServers,
};
