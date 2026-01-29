const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');

const { getBuiltinServers, getBuiltinTools } = require('./mcp_builtin.js');

/**
 * 获取所有内置工具的名称列表
 */
function getAllBuiltinToolNames() {
    const servers = getBuiltinServers();
    let allToolNames = [];
    // 遍历所有内置服务 ID
    for (const serverId in servers) {
        // 获取该服务下的所有工具
        const tools = getBuiltinTools(serverId);
        if (tools && Array.isArray(tools)) {
            allToolNames.push(...tools.map(t => t.name));
        }
    }
    // 过滤掉 'sub_agent' 自身，防止子智能体无限递归调用子智能体（除非显式指定）
    // 当然，如果你希望允许嵌套，可以去掉这个过滤
    return allToolNames.filter(name => name !== 'sub_agent');
}

// 解析 Frontmatter (简单的 YAML 解析，不需要额外依赖)
function parseFrontmatter(content) {
    const regex = /^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*([\s\S]*)$/;
    const match = content.match(regex);
    
    if (!match) {
        return { 
            metadata: {}, 
            body: content 
        };
    }

    const yamlStr = match[1];
    const body = match[2];
    const metadata = {};

    yamlStr.split('\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            let value = parts.slice(1).join(':').trim();
            
            // 处理布尔值
            if (value === 'true') value = true;
            else if (value === 'false') value = false;
            // 处理简单的数组 (例如 allowed-tools: [Read, Grep])
            else if (value.startsWith('[') && value.endsWith(']')) {
                value = value.slice(1, -1).split(',').map(s => s.trim());
            }
            
            metadata[key] = value;
        }
    });

    return { metadata, body };
}

// 递归获取目录结构
function getDirectoryStructure(dirPath, relativeRoot = '') {
    let result = [];
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            if (item.name.startsWith('.') || item.name === 'node_modules') continue;
            
            const fullPath = path.join(dirPath, item.name);
            const relPath = path.join(relativeRoot, item.name);
            
            if (item.isDirectory()) {
                result.push({
                    name: item.name,
                    path: relPath, // 相对路径
                    type: 'directory',
                    children: getDirectoryStructure(fullPath, relPath)
                });
            } else {
                result.push({
                    name: item.name,
                    path: relPath, // 相对路径
                    type: 'file',
                    size: (fs.statSync(fullPath).size / 1024).toFixed(2) + ' KB'
                });
            }
        }
    } catch (e) {
        console.error(`Error reading directory ${dirPath}:`, e);
    }

    // 排序逻辑：目录在前，文件在后；同类型按名称排序
    result.sort((a, b) => {
        // 如果类型相同，按名称排序
        if (a.type === b.type) {
            return a.name.localeCompare(b.name);
        }
        // 如果类型不同，目录(directory)排在文件(file)前面
        return a.type === 'directory' ? -1 : 1;
    });

    return result;
}

/**
 * 获取所有 Skill 的列表（仅元数据）
 * @param {string} skillRootPath 用户配置的 Skill 根目录
 */
function listSkills(skillRootPath) {
    if (!skillRootPath || !fs.existsSync(skillRootPath)) {
        return [];
    }

    const skills = [];
    try {
        const items = fs.readdirSync(skillRootPath, { withFileTypes: true });
        
        for (const item of items) {
            if (item.isDirectory()) {
                const skillDir = path.join(skillRootPath, item.name);
                const skillMdPath = path.join(skillDir, 'SKILL.md');
                
                if (fs.existsSync(skillMdPath)) {
                    try {
                        const content = fs.readFileSync(skillMdPath, 'utf-8');
                        const { metadata } = parseFrontmatter(content);
                        
                        skills.push({
                            id: item.name, // 目录名作为 ID
                            name: metadata.name || item.name,
                            description: metadata.description || 'No description provided.',
                            userInvocable: metadata['user-invocable'] !== false,
                            disabled: metadata['disable-model-invocation'] === false, // 注意 yaml解析后是 boolean
                            context: metadata.context || 'normal', // normal | fork
                            allowedTools: metadata['allowed-tools'],
                            path: skillDir
                        });
                    } catch (err) {
                        console.error(`Error parsing skill ${item.name}:`, err);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error listing skills:", e);
    }
    return skills;
}

/**
 * 获取单个 Skill 的详细信息
 */
function getSkillDetails(skillRootPath, skillId) {
    const skillDir = path.join(skillRootPath, skillId);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
        throw new Error(`Skill ${skillId} not found.`);
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const { metadata, body } = parseFrontmatter(content);
    const fileStructure = getDirectoryStructure(skillDir);

    return {
        id: skillId,
        metadata,
        content: body, // 去除 Frontmatter 后的内容
        rawContent: content, // 原始内容
        files: fileStructure,
        absolutePath: skillDir
    };
}

/**
 * 生成 Skill Tool 的 OpenAI Definition
 * @param {Array} skills 可用的 skills 列表
 */
function generateSkillToolDefinition(skills, rootPath) {
    const availableSkillsText = skills
        .filter(s => !s.disabled)
        .map(s => {
            const modeTag = s.context === 'fork' ? '[Sub-Agent]' : '[Direct]';
            return `- ${s.name} ${modeTag}: ${s.description}`;
        })
        .join('\n');

    let desc = `Execute a skill within the main conversation\n`;
    if (rootPath) {
        desc += `Current Skills Library Path: "${rootPath}"\n`;
    }

    desc += `
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

When users ask you to run a "slash command" or reference "/<something>" (e.g., "/commit", "/review-pr"), they are referring to a skill. Use this tool to invoke the corresponding skill.

Example:
  User: "run /commit"
  Assistant: [Calls Skill tool with skill: "commit"]

MODES:
1. Direct Mode: Returns instructions for YOU to follow.
2. Sub-Agent Mode (Fork): If a skill requires a sub-agent (usually complex tasks), this tool will automatically trigger the sub-agent. You must provide 'task' and 'context' to guide it.

How to invoke:
- Use this tool with the skill name and optional arguments
- Examples:
  - \`skill: "pdf"\` - invoke the pdf skill
  - \`skill: "commit", args: "-m 'Fix bug'"\` - invoke with arguments

Important:
- When a skill is relevant, you must invoke this tool IMMEDIATELY as your first action
- NEVER just announce or mention a skill in your text response without actually calling this tool
- This is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
- Only use skills listed in "Available skills" below
- Do Not invoke a skill that is already Activated
- Only the skills listed below are available， do not make assumptions about other skills.

Available skills:
${availableSkillsText}
`;

    return {
        type: "function",
        function: {
            name: "Skill",
            description: desc,
            parameters: {
                type: "object",
                properties: {
                    skill: {
                        description: "The name of the skill to execute.",
                        type: "string",
                        enum: skills.map(s => s.name)
                    },
                    args: {
                        description: "The Input Variables for the skill template. Use this to fill placeholders like '$ARGUMENTS' or '$1' in the skill file. Examples: a git commit message, a file path, or a jira ticket ID. If the skill description implies a specific input format (e.g. 'Usage: /skill [url]'), put that input here.",
                        type: "string"
                    },
                    task: {
                        description: "The Specific Instruction for the Sub-Agent. Use this to describe WHAT you want the Sub-Agent to actually DO with this skill. (e.g., 'Use this skill to refactor the login page', 'Follow this skill to deploy to prod'). Required for Sub-Agent mode.",
                        type: "string"
                    },
                    context: {
                        description: "Optional context/background information for the Sub-Agent (e.g. 'The user is on Windows', 'Previous code analysis results').",
                        type: "string"
                    },
                    tools: {
                        type: "array",
                        items: { type: "string" },
                        description: "Optional. Explicitly specify tool names to grant to the Sub-Agent. Defaults to all builtin tools if omitted."
                    },
                    planning_level: {
                        type: "string",
                        enum: ["fast", "medium", "high"],
                        description: "Complexity level for Sub-Agent. Defaults to 'medium'."
                    }
                },
                required: ["skill"],
                additionalProperties: false
            }
        }
    };
}

/**
 * 处理 Skill 调用，返回给 AI 的 Prompt 或 Sub-Agent 配置
 */
function resolveSkillInvocation(skillRootPath, skillName, toolArgsObj) {
    const skills = listSkills(skillRootPath);
    const targetSkill = skills.find(s => s.name === skillName);

    if (!targetSkill) {
        return `Error: Skill "${skillName}" not found.`;
    }

    const details = getSkillDetails(skillRootPath, targetSkill.id);
    let instructions = details.content;

    // 提取参数
    const argsInput = (typeof toolArgsObj === 'object') ? (toolArgsObj.args || '') : (toolArgsObj || '');
    const taskInput = (typeof toolArgsObj === 'object') ? (toolArgsObj.task || '') : '';
    
    // --- 处理 args 替换逻辑 ---
    // 1. 如果模板中有 $ARGUMENTS，进行替换
    if (instructions.includes('$ARGUMENTS')) {
        instructions = instructions.replace(/\$ARGUMENTS/g, argsInput);
    } 
    // 2. [新增] 如果模板中没有占位符，但 AI 传了 args，则按官方文档规范追加到末尾
    else if (argsInput) {
        instructions += `\n\n### Input Arguments\n${argsInput}`;
    }

    // 替换 ${CLAUDE_SESSION_ID}
    const sessionId = Date.now().toString(36);
    instructions = instructions.replace(/\$\{CLAUDE_SESSION_ID\}/g, sessionId);

    // --- 生成目录资产信息 (剔除 SKILL.md) ---
    let assetsInfo = "";
    if (details.files.length > 0) {
        assetsInfo += `\n\n### Skill Directory Assets\n`;
        assetsInfo += `The following files are available in the skill directory (${details.absolutePath}):\n`;
        
        function renderFiles(files, indent = '') {
            let str = '';
            for (const f of files) {
                if (f.name.toLowerCase() === 'skill.md') continue;
                str += `${indent}- ${f.name} (${f.type})\n`;
                if (f.children) {
                    str += renderFiles(f.children, indent + '  ');
                }
            }
            return str;
        }
        
        const fileTreeStr = renderFiles(details.files);
        if (fileTreeStr.trim()) {
            assetsInfo += fileTreeStr;
            assetsInfo += `\nNote: You can read these files using 'read_file' tool if referenced in the instructions.\n`;
            assetsInfo += `(Note: 'SKILL.md' contains the instructions you are currently reading, so it is hidden from this list.)\n`;
        }
    }

    // --- 分支逻辑 ---

    // 1. Fork 模式 (子智能体)
    if (targetSkill.context === 'fork') {
        // 构建 Full Task
        let fullTask = `Execute Skill: ${targetSkill.name}\n\n`;
        if (targetSkill.description) {
            fullTask += `### Description\n${targetSkill.description}\n\n`;
        }
        // SOP 中已经包含了替换过 args 的内容
        fullTask += `### Standard Operating Procedures (SOP)\n${instructions}`;
        
        // 注入目录信息
        fullTask += assetsInfo;

        // 拼接具体的 Task 指令
        if (taskInput) {
            fullTask += `\n\n### Current Task Request\n${taskInput}`;
        }

        // 确定允许的工具
        // 优先级: AI请求指定 > SKILL.md配置 > 默认全量内置
        let toolsToUse = [];
        if (toolArgsObj.tools && Array.isArray(toolArgsObj.tools) && toolArgsObj.tools.length > 0) {
            toolsToUse = toolArgsObj.tools;
        } else if (targetSkill.allowedTools) {
             toolsToUse = Array.isArray(targetSkill.allowedTools) 
                ? targetSkill.allowedTools 
                : targetSkill.allowedTools.split(',').map(t=>t.trim());
        } else {
            toolsToUse = getAllBuiltinToolNames();
        }

        // 返回特殊对象，标识需要启动子智能体
        return {
            __isForkRequest: true,
            subAgentArgs: {
                task: fullTask,
                context: (toolArgsObj.context || "No additional context."),
                tools: toolsToUse,
                planning_level: toolArgsObj.planning_level || 'medium',
                custom_steps: toolArgsObj.custom_steps
            }
        };
    }

    // 2. 普通模式 (直接返回 Prompt)
    let response = `## Skill Activated: ${targetSkill.name}\n\n`;
    response += `### Instructions\n${instructions}\n\n`;
    
    if (targetSkill.allowedTools) {
        const toolsStr = Array.isArray(targetSkill.allowedTools) ? targetSkill.allowedTools.join(', ') : targetSkill.allowedTools;
        response += `### Tool Restrictions\nYou are requested to only use the following tools: ${toolsStr}\n\n`;
    }

    response += assetsInfo;

    // [新增] 普通模式下也把 AI 的具体指令带上，作为上下文补充
    if (taskInput) {
        response += `\n\n### Current Task Request\n${taskInput}`;
    }

    return response;
}

/**
 * 保存/创建 Skill
 */
function saveSkill(skillRootPath, skillId, content) {
    const skillDir = path.join(skillRootPath, skillId);
    if (!fs.existsSync(skillDir)) {
        fs.mkdirSync(skillDir, { recursive: true });
    }
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillMdPath, content, 'utf-8');
    return true;
}

/**
 * 删除 Skill (删除文件夹)
 */
function deleteSkill(skillRootPath, skillId) {
    const skillDir = path.join(skillRootPath, skillId);
    if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
        return true;
    }
    return false;
}

/**
 * 导出 Skill 为 .skill (zip) 文件
 * @param {string} skillRootPath Skill 根目录
 * @param {string} skillId Skill 文件夹名
 * @param {string} outputDir 导出目标目录
 * @returns {Promise<string>} 导出的文件路径
 */
function exportSkillToPackage(skillRootPath, skillId, outputDir) {
    return new Promise((resolve, reject) => {
        try {
            const skillDir = path.join(skillRootPath, skillId);
            if (!fs.existsSync(skillDir)) {
                return reject(new Error(`Skill directory not found: ${skillDir}`));
            }

            const zip = new AdmZip();
            // 将整个文件夹添加到 zip，不包含根文件夹本身，直接将内容放在根下
            zip.addLocalFolder(skillDir);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const outputFilename = `${skillId}_${timestamp}.skill`;
            const outputPath = path.join(outputDir, outputFilename);

            zip.writeZip(outputPath);
            resolve(outputPath);
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * 解压 .skill 文件到临时目录
 * @param {string} filePath .skill 文件路径
 * @returns {Promise<string>} 解压后的临时目录路径
 */
function extractSkillPackage(filePath) {
    return new Promise((resolve, reject) => {
        try {
            const zip = new AdmZip(filePath);
            const tempDir = path.join(os.tmpdir(), 'anywhere_skill_import', Date.now().toString());
            
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            zip.extractAllTo(tempDir, true);
            resolve(tempDir);
        } catch (e) {
            reject(e);
        }
    });
}

module.exports = {
    listSkills,
    getSkillDetails,
    generateSkillToolDefinition,
    resolveSkillInvocation,
    saveSkill,
    deleteSkill,
    exportSkillToPackage,
    extractSkillPackage,
};