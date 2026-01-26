const fs = require('fs');
const path = require('path');
const os = require('os');

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
function generateSkillToolDefinition(skills) {
    const availableSkillsText = skills
        .filter(s => !s.disabled) // 过滤掉禁用的
        .map(s => `- ${s.name}: ${s.description}`)
        .join('\n');

    return {
        type: "function",
        function: {
            name: "Skill",
            description: `Execute a skill within the main conversation

When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

When users ask you to run a "slash command" or reference "/<something>" (e.g., "/commit", "/review-pr"), they are referring to a skill. Use this tool to invoke the corresponding skill.

Example:
  User: "run /commit"
  Assistant: [Calls Skill tool with skill: "commit"]

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
- Do not invoke a skill that is already running
- Do not use this tool for built-in CLI commands (like /help, /clear, etc.)

Available skills:
${availableSkillsText}
`,
            parameters: {
                type: "object",
                properties: {
                    skill: {
                        description: "The skill name.",
                        type: "string",
                        enum: skills.map(s => s.name)
                    },
                    args: {
                        description: "Optional arguments for the skill",
                        type: "string"
                    }
                },
                required: ["skill"],
                additionalProperties: false
            }
        }
    };
}

/**
 * 处理 Skill 调用，返回给 AI 的 Prompt
 */
function resolveSkillInvocation(skillRootPath, skillName, args) {
    const skills = listSkills(skillRootPath);
    const targetSkill = skills.find(s => s.name === skillName); // 按 name 查找，而不是 id

    if (!targetSkill) {
        return `Error: Skill "${skillName}" not found.`;
    }

    const details = getSkillDetails(skillRootPath, targetSkill.id);
    let instructions = details.content;

    // 替换变量 $ARGUMENTS
    const argsString = args || '';
    if (instructions.includes('$ARGUMENTS')) {
        instructions = instructions.replace(/\$ARGUMENTS/g, argsString);
    } else if (argsString) {
        instructions += `\n\nARGUMENTS: ${argsString}`;
    }

    // 替换 ${CLAUDE_SESSION_ID} (模拟)
    const sessionId = Date.now().toString(36);
    instructions = instructions.replace(/\$\{CLAUDE_SESSION_ID\}/g, sessionId);

    // 构建上下文
    let response = `## Skill Activated: ${targetSkill.name}\n\n`;
    response += `### Instructions\n${instructions}\n\n`;
    
    // 如果有 allowed-tools 限制
    if (targetSkill.allowedTools) {
        response += `### Tool Restrictions\nYou are only allowed to use the following tool types: ${Array.isArray(targetSkill.allowedTools) ? targetSkill.allowedTools.join(', ') : targetSkill.allowedTools}\n\n`;
    }

    // 如果是 fork 模式
    if (targetSkill.context === 'fork') {
        response += `### Execution Context: Sub-Agent Required\n`;
        response += `This skill requires running in an isolated sub-agent context. \n`;
        response += `PLEASE INVOKE THE 'sub_agent' TOOL IMMEDIATELY using the instructions above as the 'task'.\n`;
    }

    // 附带目录结构信息，方便 AI 引用 assets
    if (details.files.length > 0) {
        response += `### Skill Directory Assets\n`;
        response += `The following files are available in the skill directory (${details.absolutePath}):\n`;
        
        function renderFiles(files, indent = '') {
            let str = '';
            for (const f of files) {
                str += `${indent}- ${f.name} (${f.type})\n`;
                if (f.children) {
                    str += renderFiles(f.children, indent + '  ');
                }
            }
            return str;
        }
        response += renderFiles(details.files);
        response += `\nNote: You can read these files if referenced in the instructions.\n`;
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

module.exports = {
    listSkills,
    getSkillDetails,
    generateSkillToolDefinition,
    resolveSkillInvocation,
    saveSkill,
    deleteSkill
};