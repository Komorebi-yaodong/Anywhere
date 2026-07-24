const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const {
    getConfig,
    updateConfig,
    saveSetting,
    getUser,
    copyText,
    sethotkey,
    setZoomFactor,
    defaultConfig,
    savePromptWindowSettings,
    saveMcpToolCache,
    getMcpToolCache,
    getCachedBackgroundImage,
    cacheBackgroundImage,
    broadcastEvent,
} = require('./data.js');

const {
    handleFilePath,
    saveFile,
    writeLocalFile,
    isFileTypeSupported,
    parseFileObject,
    renameLocalFile,
    listJsonFiles,
} = require('./file.js');

const BLOCKED_EXTERNAL_PROTOCOLS = new Set(['javascript:', 'data:', 'blob:', 'about:']);

function isBlockedExternalProtocol(protocol = '') {
    return BLOCKED_EXTERNAL_PROTOCOLS.has(String(protocol || '').toLowerCase());
}

function openLinkWithSystemDefault(rawUrl = '') {
    const targetUrl = String(rawUrl || '').trim();
    if (!targetUrl || targetUrl.startsWith('#')) {
        return { ok: false, reason: 'ignored_anchor' };
    }

    try {
        const parsedUrl = new URL(targetUrl);
        const protocol = parsedUrl.protocol.toLowerCase();

        if (isBlockedExternalProtocol(protocol)) {
            console.warn('[window_preload] Blocked external url with unsafe protocol:', protocol);
            return { ok: false, reason: 'blocked_protocol' };
        }

        if (protocol === 'file:') {
            const localPath = fileURLToPath(parsedUrl);
            utools.shellOpenPath(localPath);
            return { ok: true, type: 'path' };
        }
    } catch (error) {
        console.warn('[window_preload] Failed to parse link url, fallback to shellOpenExternal:', error.message);
    }

    utools.shellOpenExternal(targetUrl);
    return { ok: true, type: 'url' };
}


function getLazyRuntime() {
    const runtimePath = './' + 'lazy_runtime.js';
    return require(runtimePath);
}

function getChatModule() {
    return getLazyRuntime();
}

function getMcpBuiltinModule() {
    return getLazyRuntime();
}

function getMcpModule() {
    return getLazyRuntime();
}

function getSkillModule() {
    return getLazyRuntime();
}

function getCompactModule() {
    return getLazyRuntime();
}

function getProjectsModule() {
    const runtimePath = './' + 'projects_runtime.js';
    return require(runtimePath);
}

const channel = "window";
let senderId = null; // [新增] 用于存储当前窗口的唯一ID

window.preload = {
    receiveMsg: (callback) => {
        ipcRenderer.on(channel, (event, data) => {
            if (data) {
                // 捕获并存储 senderId
                if (data.senderId) {
                    senderId = data.senderId;
                }
                callback(data);
            }
        });
    },
    onAppendMessage: (callback) => {
        ipcRenderer.on('window-append-msg', (event, data) => {
            callback(data);
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (event) => {
        let target = event.target;
        while (target && target.tagName !== 'A') {
            target = target.parentNode;
        }

        if (target && target.tagName === 'A' && target.href) {
            const rawHref = String(target.getAttribute('href') || '').trim();
            if (!rawHref || rawHref.startsWith('#')) return;

            event.preventDefault();
            openLinkWithSystemDefault(target.href);
        }
    });
});

// 处理代码块点击事件的核心逻辑
async function handleCodeClick(text) {

  if (!text || typeof text !== 'string') {
    return 'copied';
  }

  // 移除首尾空白和引号 (支持 'path' 或 "path")
  const content = text.trim().replace(/^["']|["']$/g, '');

  // 1. 检查是否为 URL
  if (/^file:\/\//i.test(content)) {
    const result = openLinkWithSystemDefault(content);
    return result.type === 'path' ? 'opened-path' : 'opened-url';
  }

  if (/^https?:\/\//i.test(content) || /^mailto:/i.test(content)) {
    openLinkWithSystemDefault(content);
    return 'opened-url';
  }

  // 2. 检查是否为本地文件路径
  try {
    let resolvedPath = content;

    // 处理 ~ 路径 (macOS/Linux)
    if (content.startsWith('~')) {
      resolvedPath = path.join(utools.getPath('home'), content.slice(1));
    }

    // 简单的路径格式校验 (Windows盘符 或 Unix根路径 或 相对路径)
    // 增加对 C:\ 或 /Users 等格式的宽容度
    const isLikelyPath = /^[a-zA-Z]:[\\/]/.test(resolvedPath) || resolvedPath.startsWith('/') || resolvedPath.startsWith('./') || resolvedPath.startsWith('../') || resolvedPath.includes(path.sep);

    if (isLikelyPath) {
        const exists = fs.existsSync(resolvedPath);

        if (exists) {
            // 尝试打开文件或目录
            utools.shellOpenPath(resolvedPath);
            return 'opened-path';
        }
    }
  } catch (e) {
    // 忽略路径检查错误，回退到复制
    console.warn(`[Preload Debug] Path check failed:`, e.message);
  }

  // 3. 如果以上都不是，则复制内容
  utools.copyText(text); // 复制原始文本
  return 'copied';
}

window.api = {
    getConfig,
    updateConfig,
    saveSetting,
    getUser,
    getRandomItem: (list) => getChatModule().getRandomItem(list),
    batchTestProviderKeys: async (input = {}) => {
        return await getChatModule().batchTestProviderKeys(input);
    },
    createChatCompletion: async (params) => {
        return await getChatModule().createChatCompletion(params);
    },
    copyText,
    handleFilePath,
    saveFile,
    renameLocalFile,
    listJsonFiles,
    writeLocalFile,
    readLocalProjects: (...args) => getProjectsModule().readLocalProjects(...args),
    writeLocalProjects: (...args) => getProjectsModule().writeLocalProjects(...args),
    parseProjectsYaml: (...args) => getProjectsModule().parseProjectsYaml(...args),
    serializeProjectsYaml: (...args) => getProjectsModule().serializeProjectsYaml(...args),
    mergeFileAssignment: (...args) => getProjectsModule().mergeFileAssignment(...args),
    mergeProjectAssignment: (...args) => getProjectsModule().mergeProjectAssignment(...args),
    findProjectByBasename: (...args) => getProjectsModule().findProjectByBasename(...args),
    parseChatMetadataYaml: (...args) => getProjectsModule().parseChatMetadataYaml(...args),
    serializeChatMetadataYaml: (...args) => getProjectsModule().serializeChatMetadataYaml(...args),
    normalizeChatMetadataIndex: (...args) => getProjectsModule().normalizeChatMetadataIndex(...args),
    normalizeChatMetadataEntry: (...args) => getProjectsModule().normalizeChatMetadataEntry(...args),
    handleCodeClick,
    sethotkey,
    setZoomFactor,
    defaultConfig,
    savePromptWindowSettings,
    desktopCaptureSources: utools.desktopCaptureSources,
    copyImage: utools.copyImage,
    getMcpToolCache,
    initializeMcpClient: async (activeServerConfigs) => {
        const { initializeMcpClient } = getMcpModule();
        try {
            const cache = await getMcpToolCache();
            return await initializeMcpClient(activeServerConfigs, cache, saveMcpToolCache);
        } catch (e) {
            console.error("[WindowPreload] Error loading MCP cache:", e);
            return await initializeMcpClient(activeServerConfigs, {}, saveMcpToolCache);
        }
    },
    testMcpConnection: async (serverConfig) => {
        try {
            const { connectAndFetchTools } = getMcpModule();
            // 连接并获取最新工具
            const rawTools = await connectAndFetchTools(serverConfig.id, {
                transport: serverConfig.type,
                command: serverConfig.command,
                args: serverConfig.args,
                url: serverConfig.baseUrl,
                env: serverConfig.env,
                headers: serverConfig.headers,
                auth: serverConfig.auth,
            });

            const sanitizeToolAlias = (name, fallback = 'tool') => {
                const source = typeof name === 'string' ? name.trim() : '';
                const baseName = source || fallback;
                const sanitized = baseName
                    .replace(/[^a-zA-Z0-9_-]+/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_+|_+$/g, '');
                return sanitized || fallback;
            };

            const sanitizedTools = rawTools.map(tool => ({
                name: tool.name,
                alias: sanitizeToolAlias(tool.name, serverConfig.id || 'tool'),
                rawName: tool.name,
                originalName: tool.name,
                displayName: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema || tool.schema || {}
            }));

            // 读取旧缓存以继承启用/禁用状态
            const oldCacheMap = await getMcpToolCache();
            const oldTools = oldCacheMap ? (oldCacheMap[serverConfig.id] || []) : [];

            const mergedTools = sanitizedTools.map(newTool => {
                const oldTool = oldTools.find(t => t.name === newTool.name || t.alias === newTool.alias || t.rawName === newTool.name || t.originalName === newTool.name);
                return {
                    ...newTool,
                    enabled: oldTool ? (oldTool.enabled ?? true) : true
                };
            });

            const cleanTools = JSON.parse(JSON.stringify(mergedTools));
            // 覆盖保存最新缓存
            await saveMcpToolCache(serverConfig.id, cleanTools);
            return { success: true, tools: cleanTools };
        } catch (error) {
            console.error("[WindowPreload] MCP Refresh Error:", error);
            return { success: false, error: String(error.message || error) };
        }
    },
    invokeMcpTool: async (toolName, toolArgs, signal, context = null) => {
        const { invokeMcpTool } = getMcpModule();
        const extContext = context ? { ...context, senderId } : { senderId };
        return await invokeMcpTool(toolName, toolArgs, signal, extContext);
    },
    saveMcpToolCache,
    closeMcpClient: async (...args) => {
        return await getMcpModule().closeMcpClient(...args);
    },
    // Read-only OAuth status passthrough (window can display auth badges but
    // cannot drive login — that lives in the main panel via preload.js).
    mcpOAuth_getStatus: async ({ serverId, serverConfig } = {}) => {
        const mod = getMcpModule();
        if (mod.getMcpAuthStatus) return { success: true, status: await mod.getMcpAuthStatus(serverId, serverConfig) };
        return { success: false, error: 'getMcpAuthStatus unavailable' };
    },
    isFileTypeSupported,
    parseFileObject,
    shellOpenPath: (fullPath) => {
        utools.shellOpenPath(fullPath);
    },
    // 向父进程(preload.js)发送切换置顶状态的请求
    toggleAlwaysOnTop: () => {
      if (senderId) {
        utools.sendToParent('window-event', { senderId, event: 'toggle-always-on-top' });
      } else {
        console.error("senderId is not available, cannot toggle always-on-top.");
      }
    },
    windowControl: (action) => {
      if (senderId) {
        // action 对应 preload.js switch 中的 case，例如 'minimize-window'
        utools.sendToParent('window-event', { senderId, event: action });
      }
    },
    // 监听父进程发回的状态变更消息
    onAlwaysOnTopChanged: (callback) => {
      ipcRenderer.on('always-on-top-changed', (event, newState) => {
        callback(newState);
      });
    },
    // 监听配置更新消息
    onConfigUpdated: (callback) => {
      ipcRenderer.on('config-updated', (event, newConfig) => {
        callback(newConfig);
      });
    },
    getCachedBackgroundImage,
    cacheBackgroundImage: (url) => {
        // 异步执行，不阻塞 UI
        cacheBackgroundImage(url).catch(e => console.error(e));
    },

    // Skill 相关 API
    listSkills: async (path) => {
        try {
            return getSkillModule().listSkills(path);
        } catch (e) {
            console.error("listSkills error:", e);
            return [];
        }
    },
    getSkillDetails: async (rootPath, id) => {
        return getSkillModule().getSkillDetails(rootPath, id);
    },
    saveSkill: async (rootPath, id, content) => {
        const res = await getSkillModule().saveSkill(rootPath, id, content);
        broadcastEvent('skills-updated');
        return res;
    },
    deleteSkill: async (rootPath, id) => {
        const res = await getSkillModule().deleteSkill(rootPath, id);
        broadcastEvent('skills-updated');
        return res;
    },
    toggleSkillForkMode: async (rootPath, skillId, enableFork) => {
        try {
            const { getSkillDetails, saveSkill } = getSkillModule();
            const details = await getSkillDetails(rootPath, skillId);
            const meta = details.metadata;
            const body = details.content;

            if (enableFork) {
                meta['context'] = 'fork';
            } else {
                delete meta['context'];
            }

            const lines = ['---'];
            if (meta.name) lines.push(`name: ${meta.name}`);
            if (meta.description) lines.push(`description: ${meta.description}`);
            if (meta['disable-model-invocation'] === true) lines.push('disable-model-invocation: true');
            if (meta.context === 'fork') lines.push('context: fork');

            if (meta['allowed-tools']) {
                let tools = meta['allowed-tools'];
                if (typeof tools === 'string') lines.push(`allowed-tools: [${tools}]`);
                else if (Array.isArray(tools)) lines.push(`allowed-tools: [${tools.join(', ')}]`);
            }

            lines.push('---');
            lines.push('');
            lines.push(body || '');

            const content = lines.join('\n');
            const res = await saveSkill(rootPath, skillId, content);
            broadcastEvent('skills-updated');
            return res;
        } catch (e) {
            console.error("Toggle Fork Mode Error:", e);
            throw e;
        }
    },

    exportSkillToPackage: async (rootPath, skillId, outputDir, options = {}) => {
        return getSkillModule().exportSkillToPackage(rootPath, skillId, outputDir, options);
    },
    exportSkillPackageBuffer: async (rootPath, skillId, options = {}) => {
        return getSkillModule().exportSkillPackageBuffer(rootPath, skillId, options);
    },
    extractSkillPackage: async (filePath) => {
        return getSkillModule().extractSkillPackage(filePath);
    },
    importSkillPackageBuffer: async (rootPath, skillId, packageBuffer) => {
        const res = await getSkillModule().importSkillPackageBuffer(rootPath, skillId, packageBuffer);
        broadcastEvent('skills-updated');
        return res;
    },

    onMcpCacheUpdated: (callback) => {
        const normalizePayload = (payload) => {
            if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
                return {
                    serverId: typeof payload.serverId === 'string' ? payload.serverId : '',
                    reason: typeof payload.reason === 'string' ? payload.reason : '',
                    emitReloadSuggested: payload.emitReloadSuggested !== false
                };
            }
            return {
                serverId: typeof payload === 'string' ? payload : '',
                reason: '',
                emitReloadSuggested: true
            };
        };
        ipcRenderer.on('mcp-cache-updated', (event, payload) => {
            callback(normalizePayload(payload));
        });
    },
    onSkillsUpdated: (callback) => {
        ipcRenderer.on('skills-updated', (event) => {
            callback();
        });
    },
    // 生成 Skill Tool 定义
    getSkillToolDefinition: async (rootPath, enabledSkillNames = []) => {
        try {
            const { listSkills, generateSkillToolDefinition } = getSkillModule();
            const allSkills = listSkills(rootPath);
            const activeSkills = allSkills.filter(s => enabledSkillNames.includes(s.name));
            if (activeSkills.length === 0) return null;
            return generateSkillToolDefinition(activeSkills, rootPath);
        } catch (e) {
            return null;
        }
    },
    // 执行 Skill
    resolveSkillInvocation: async (rootPath, skillName, toolArgs, globalContext = null, signal = null) => {
        const { resolveSkillInvocation } = getSkillModule();
        // 1. 获取 Skill 解析结果
        const result = resolveSkillInvocation(rootPath, skillName, toolArgs);

        // 2. 检查是否为 Fork 请求
        if (result && result.__isForkRequest && result.subAgentArgs) {
            if (!globalContext) {
                // 错误信息也统一包装为 JSON 字符串
                return JSON.stringify([{
                    type: "text",
                    text: "Error: Sub-Agent skill requires execution context (API Key, etc)."
                }], null, 2);
            }

            // 3. 自动调用内置的 sub_agent 工具
            // 注意：invokeBuiltinTool 已经修复为返回序列化的 JSON 字符串，直接透传即可
            return await getMcpBuiltinModule().invokeBuiltinTool(
                'sub_agent',
                result.subAgentArgs,
                signal,
                globalContext
            );
        }

        // 3.普通模式，将文本结果包装为标准 MCP JSON 格式字符串
        // 这样前端收到后能统一解析为 content 数组，而不是纯文本
        return JSON.stringify([{
            type: "text",
            text: result
        }], null, 2);
    },
    // 暴露 path.join
    pathJoin: (...args) => require('path').join(...args),
    addTaskHistory: async (taskId, logEntry) => {
        const { addTaskHistory } = require('./data.js');
        return await addTaskHistory(taskId, logEntry);
    },

    // Conversation compaction APIs (aligned with desktop window.api names)
    getCompactCache: async () => {
        return getCompactModule().getCompactCacheSnapshot();
    },
    importCompactCache: async (models = {}) => {
        return getCompactModule().importCompactCacheModels(models);
    },
    getModelCompactConfig: async (modelInput = '') => {
        return getCompactModule().getModelCompactConfig(modelInput);
    },
    updateModelCompactConfig: async (modelInput = '', patch = {}) => {
        return getCompactModule().updateModelCompactConfig(modelInput, patch);
    },
    applyAdvancedCompactConfigToAll: async (patch = {}) => {
        return getCompactModule().applyAdvancedCompactConfigToAll(patch);
    },
    resolveModelContext: async (modelInput = '', options = {}) => {
        return getCompactModule().resolveModelContextLength(modelInput, options);
    },
    pruneCompactCache: async (enabledModels = []) => {
        return getCompactModule().pruneCompactCacheByEnabledModels(enabledModels);
    },
    estimateCompactTokens: async (messages = []) => {
        const tokens = getCompactModule().estimateMessagesTokens(messages);
        return { ok: true, tokens };
    },
    shouldAutoCompact: async (input = {}) => {
        return {
            ok: true,
            should: getCompactModule().shouldAutoCompact(input || {})
        };
    },
    runConversationCompact: async (input = {}, options = {}) => {
        try {
            const signal = options?.signal || input?.signal || null;
            const onProgress = typeof options?.onProgress === 'function'
                ? options.onProgress
                : (typeof input?.onProgress === 'function' ? input.onProgress : null);
            const nextInput = { ...(input && typeof input === 'object' ? input : {}) };
            delete nextInput.signal;
            delete nextInput.onProgress;
            return await getCompactModule().runConversationCompaction({
                ...nextInput,
                signal,
                onProgress
            });
        } catch (error) {
            if (error?.name === 'AbortError' || /abort/i.test(String(error?.message || ''))) {
                return { ok: false, error: { name: 'AbortError', message: error.message || 'aborted' } };
            }
            return { ok: false, error: { message: error?.message || String(error) } };
        }
    },
};