<script setup>
import { ref, reactive, computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, ElScrollbar, ElAlert } from 'element-plus';
import { Plus, Delete, Edit, CopyDocument, Tools, Search, Refresh, QuestionFilled, Link, CaretRight, CaretBottom } from '@element-plus/icons-vue';
const { t } = useI18n();
const currentConfig = inject('config');

const showEditDialog = ref(false);
const showJsonDialog = ref(false);
const isNewServer = ref(false);
const jsonEditorContent = ref('');
const searchQuery = ref('');
const advancedCollapse = ref([]);

// 测试相关状态
const activeTestTab = ref('list');
const showTestResultDialog = ref(false);
const currentTestingServer = ref(null); // 保存当前正在查看/测试的服务器引用
const testResult = reactive({
    loading: false,
    success: false,
    message: '',
    tools: [],
    serverName: '',
    serverDescription: '',
    isCached: false
});
const isTestAreaExpanded = ref(false);
const currentTestToolName = ref('');
const testFormData = ref({});
const testRunning = ref(false);
const testOutput = ref('');

// 计算当前选中工具的 Schema
const currentTestToolSchema = computed(() => {
    if (!currentTestToolName.value) return [];
    const tool = testResult.tools.find(t => t.name === currentTestToolName.value);
    if (!tool || !tool.inputSchema || !tool.inputSchema.properties) return [];

    // 将 properties 对象转换为数组以便 v-for
    return Object.entries(tool.inputSchema.properties).map(([key, schema]) => ({
        key,
        ...schema,
        required: tool.inputSchema.required?.includes(key) || false
    }));
});

// 切换测试工具时，重置表单
const handleTestToolChange = (val) => {
    testFormData.value = {};
    testOutput.value = '';
    if (!val) return;

    // 初始化默认值
    const tool = testResult.tools.find(t => t.name === val);
    if (tool && tool.inputSchema && tool.inputSchema.properties) {
        Object.entries(tool.inputSchema.properties).forEach(([key, schema]) => {
            // 根据类型设置默认值
            if (schema.type === 'boolean') {
                testFormData.value[key] = false;
            } else if (schema.type === 'array' || schema.type === 'object') {
                testFormData.value[key] = ''; // 复杂类型用字符串输入，后续 parse
            } else {
                testFormData.value[key] = '';
            }
        });
    }
};

const defaultServer = {
    id: null,
    name: '',
    description: '',
    type: 'sse',
    isActive: true,
    isPersistent: false,
    baseUrl: '',
    command: '',
    args: [],
    env: {},
    headers: {},
    provider: '',
    providerUrl: '',
    logoUrl: '',
    tags: []
};

const createEditingServerState = () => ({
    ...defaultServer,
    args: '',
    env: '',
    headers: '',
    tags: ''
});

const editingServer = reactive(createEditingServerState());

const normalizedEditingServerType = computed({
    get() {
        const streamableHttpRegex = /^streamable[\s_-]?http$/i;
        if (editingServer.type && (streamableHttpRegex.test(editingServer.type) || editingServer.type.toLowerCase() === 'http')) {
            return 'http';
        }
        return editingServer.type;
    },
    set(newValue) {
        editingServer.type = newValue;
    }
});

const mcpServersList = computed(() => {
    if (!currentConfig.value || !currentConfig.value.mcpServers) return [];
    return Object.entries(currentConfig.value.mcpServers)
        .filter(([id, value]) => value && typeof value === 'object' && typeof value.name === 'string')
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
});

const filteredMcpServersList = computed(() => {
    if (!searchQuery.value) {
        return mcpServersList.value;
    }
    const lowerCaseQuery = searchQuery.value.toLowerCase();
    return mcpServersList.value.filter(server =>
        (server.name && server.name.toLowerCase().includes(lowerCaseQuery)) ||
        (server.description && server.description.toLowerCase().includes(lowerCaseQuery)) ||
        (server.provider && server.provider.toLowerCase().includes(lowerCaseQuery)) ||
        (server.tags && server.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery))) ||
        // 新增：支持按原始类型(如 'builtin')和显示名称(如 '内置')搜索
        (server.type && server.type.toLowerCase().includes(lowerCaseQuery)) ||
        (server.type && getDisplayTypeName(server.type).toLowerCase().includes(lowerCaseQuery))
    );
});

function getDisplayTypeName(type) {
    if (!type) return '';
    const streamableHttpRegex = /^streamable[\s_-]?http$/i;
    const lowerType = type.toLowerCase();

    if (lowerType === 'builtin') return t('mcp.typeOptions.builtin');

    if (streamableHttpRegex.test(lowerType) || lowerType === 'http') {
        return t('mcp.typeOptions.http');
    }

    switch (lowerType) {
        case 'sse': return t('mcp.typeOptions.sse');
        case 'stdio': return t('mcp.typeOptions.stdio');
        default: return type;
    }
}

function generateUniqueId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function atomicSave(updateFunction) {
    try {
        const latestConfigData = await window.api.getConfig();
        const latestConfig = latestConfigData.config;
        updateFunction(latestConfig);
        await window.api.updateConfigWithoutFeatures({ config: latestConfig });
        currentConfig.value = latestConfig;
    } catch (error) {
        console.error("Atomic save failed:", error);
        ElMessage.error(t('mcp.alerts.saveFailed'));
    }
}

const convertTextToLines = (text) => text ? text.split('\n').map(l => l.trim()).filter(Boolean) : [];
const convertLinesToText = (lines) => Array.isArray(lines) ? lines.join('\n') : '';

const convertTextToObject = (text) => {
    if (!text) return {};
    return text.split('\n').reduce((acc, line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) return acc;
        const separatorIndex = trimmedLine.search(/[=:]/);
        if (separatorIndex > 0) {
            const key = trimmedLine.substring(0, separatorIndex).trim();
            let value = trimmedLine.substring(separatorIndex + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.substring(1, value.length - 1);
            }
            if (key) acc[key] = value;
        }
        return acc;
    }, {});
};
const convertObjectToText = (obj) => {
    if (!obj || Object.keys(obj).length === 0) return '';
    return Object.entries(obj).map(([key, value]) => `${key}: ${value}`).join('\n');
};

function prepareAddServer() {
    isNewServer.value = true;
    Object.assign(editingServer, createEditingServerState());
    advancedCollapse.value = [];
    showEditDialog.value = true;
}

function prepareEditServer(server) {
    isNewServer.value = false;
    Object.assign(editingServer, {
        ...createEditingServerState(),
        ...server,
        args: convertLinesToText(server.args),
        env: convertObjectToText(server.env),
        headers: convertObjectToText(server.headers),
        tags: Array.isArray(server.tags) ? server.tags.join(', ') : ''
    });
    advancedCollapse.value = [];
    showEditDialog.value = true;
}

async function saveServer() {
    const addIfPresent = (obj, key, value) => { if (value) obj[key] = value; };
    const addIfArrayPresent = (obj, key, value) => { if (value && value.length > 0) obj[key] = value; };
    const addIfObjectPresent = (obj, key, value) => { if (value && Object.keys(value).length > 0) obj[key] = value; };

    const serverData = {
        name: editingServer.name,
        type: editingServer.type,
        isActive: editingServer.isActive,
        isPersistent: editingServer.isPersistent,
    };

    addIfPresent(serverData, 'description', editingServer.description);
    addIfPresent(serverData, 'baseUrl', editingServer.baseUrl);
    addIfPresent(serverData, 'command', editingServer.command);
    addIfArrayPresent(serverData, 'args', convertTextToLines(editingServer.args));
    addIfObjectPresent(serverData, 'env', convertTextToObject(editingServer.env));
    addIfObjectPresent(serverData, 'headers', convertTextToObject(editingServer.headers));
    addIfPresent(serverData, 'provider', editingServer.provider);
    addIfPresent(serverData, 'providerUrl', editingServer.providerUrl);
    addIfPresent(serverData, 'logoUrl', editingServer.logoUrl);
    addIfArrayPresent(serverData, 'tags', editingServer.tags ? editingServer.tags.split(',').map(t => t.trim()).filter(Boolean) : []);

    await atomicSave(config => {
        if (!config.mcpServers) config.mcpServers = {};
        const serverId = isNewServer.value ? generateUniqueId() : editingServer.id;
        config.mcpServers[serverId] = serverData;
    });

    ElMessage.success(t('mcp.alerts.saveSuccess'));
    showEditDialog.value = false;
}

function deleteServer(serverId, serverName) {
    ElMessageBox.confirm(
        t('mcp.alerts.deleteConfirmText', { name: serverName }),
        t('mcp.alerts.deleteConfirmTitle'),
        { type: 'warning' }
    ).then(async () => {
        await atomicSave(config => {
            // 1. 删除 MCP 服务配置
            if (config.mcpServers) {
                delete config.mcpServers[serverId];
            }

            // 2. 遍历所有快捷助手，从 defaultMcpServers 中移除已删除的 ID
            if (config.prompts) {
                Object.values(config.prompts).forEach(prompt => {
                    if (Array.isArray(prompt.defaultMcpServers)) {
                        const originalLength = prompt.defaultMcpServers.length;
                        prompt.defaultMcpServers = prompt.defaultMcpServers.filter(id => id !== serverId);
                    }
                });
            }
        });
        ElMessage.success(t('mcp.alerts.deleteSuccess'));
    }).catch(() => { });
}

async function handleSwitchChange(serverId, key, value) {
    await atomicSave(config => {
        if (config.mcpServers && config.mcpServers[serverId]) {
            config.mcpServers[serverId][key] = value;
        }
    });
}

async function copyServerJson(server) {
    const { id, ...serverConfig } = server;
    const jsonString = JSON.stringify(serverConfig, null, 2);
    await window.api.copyText(jsonString);
    ElMessage.success(t('mcp.alerts.configCopied'));
}

function prepareEditJson() {
    const dataToShow = { mcpServers: currentConfig.value.mcpServers || {} };
    jsonEditorContent.value = JSON.stringify(dataToShow, null, 2);
    showJsonDialog.value = true;
}

async function saveJson() {
    try {
        const parsedJson = JSON.parse(jsonEditorContent.value);
        if (typeof parsedJson !== 'object' || parsedJson === null || !parsedJson.hasOwnProperty('mcpServers')) {
            throw new Error(t('mcp.alerts.jsonError'));
        }
        const newMcpServers = parsedJson.mcpServers;

        await atomicSave(config => {
            config.mcpServers = newMcpServers;
        });
        ElMessage.success(t('mcp.alerts.saveSuccess'));
        showJsonDialog.value = false;
    } catch (error) {
        ElMessage.error(`${t('mcp.alerts.invalidJson')}: ${error.message}`);
    }
}

async function refreshMcpConfig() {
    try {
        const latestConfigData = await window.api.getConfig();
        if (latestConfigData && latestConfigData.config) {
            currentConfig.value = latestConfigData.config;
            ElMessage.success(t('mcp.alerts.refreshSuccess'));
        } else {
            throw new Error(t('mcp.alerts.configInvalid'));
        }
    } catch (error) {
        console.error("刷新MCP配置失败:", error);
        ElMessage.error(t('mcp.alerts.refreshFailed'));
    }
}

// 切换工具测试面板展开/折叠
function toggleToolTest(index) {
    if (!toolTestState.value[index]) {
        toolTestState.value[index] = {
            expanded: true,
            argsJson: '{}', // 默认空JSON对象
            running: false,
            result: ''
        };

        // 尝试根据 schema 生成默认参数模板（可选优化）
        const tool = testResult.tools[index];
        if (tool && tool.inputSchema && tool.inputSchema.properties) {
            const defaultArgs = {};
            Object.keys(tool.inputSchema.properties).forEach(key => {
                defaultArgs[key] = "";
            });
            toolTestState.value[index].argsJson = JSON.stringify(defaultArgs, null, 2);
        }
    } else {
        toolTestState.value[index].expanded = !toolTestState.value[index].expanded;
    }
}

// 运行工具测试
async function runToolTest() {
    if (!currentTestToolName.value) return;

    testRunning.value = true;
    testOutput.value = '';

    try {
        const args = {};
        // 处理表单数据
        for (const [key, value] of Object.entries(testFormData.value)) {
            if (value === '' || value === null || value === undefined) continue;
            const fieldSchema = currentTestToolSchema.value.find(f => f.key === key);
            if (fieldSchema && (fieldSchema.type === 'object' || fieldSchema.type === 'array')) {
                try {
                    args[key] = JSON.parse(value);
                } catch (e) {
                    testOutput.value = t('mcp.test.paramErrorJson', { key });
                    testRunning.value = false;
                    return;
                }
            } else if (fieldSchema && (fieldSchema.type === 'number' || fieldSchema.type === 'integer')) {
                const num = Number(value);
                if (isNaN(num)) {
                    testOutput.value = t('mcp.test.paramErrorNumber', { key });
                    testRunning.value = false;
                    return;
                }
                args[key] = num;
            } else {
                args[key] = value;
            }
        }

        const server = currentTestingServer.value;
        const configToTest = {
            id: server.id,
            name: server.name,
            type: server.type,
            command: server.command,
            baseUrl: server.baseUrl,
            env: typeof server.env === 'string' ? convertTextToObject(server.env) : server.env,
            headers: typeof server.headers === 'string' ? convertTextToObject(server.headers) : server.headers,
            args: Array.isArray(server.args) ? server.args : convertTextToLines(server.args)
        };

        const response = await window.api.testInvokeMcpTool(configToTest, currentTestToolName.value, args);

        // 检查是否已被用户取消
        if (!testRunning.value) return;

        if (response.success) {
            const rawResult = response.result;
            if (typeof rawResult === 'string') {
                testOutput.value = rawResult;
            } else if (rawResult.content && Array.isArray(rawResult.content)) {
                testOutput.value = rawResult.content.map(item => {
                    if (item.type === 'text') return item.text;
                    if (item.type === 'image') return `[Image: ${item.mimeType}]`;
                    return JSON.stringify(item);
                }).join('\n\n');
            } else {
                testOutput.value = JSON.stringify(rawResult, null, 2);
            }
            if (!testOutput.value) testOutput.value = t('mcp.test.successNoContent');
        } else {
            testOutput.value = t('mcp.test.executionError') + response.error;
        }

    } catch (err) {
        if (!testRunning.value) return; // 忽略取消后的错误
        testOutput.value = t('mcp.test.systemError') + err.message;
    } finally {
        if (testRunning.value) {
            testRunning.value = false;
        }
    }
}

// 取消测试
function cancelToolTest() {
    testRunning.value = false;
    // 由于后端 Promise 无法中断，这里做 UI 层面的“忽略结果”
    ElMessage.info(t('mcp.test.opCancelled'));
}

// 更新工具缓存状态 (启用/禁用)
async function updateToolCacheStatus() {
    if (!currentTestingServer.value || !testResult.tools) return;

    // 深拷贝以去除 Vue 响应式代理
    const toolsToSave = JSON.parse(JSON.stringify(testResult.tools));

    try {
        await window.api.saveMcpToolCache(currentTestingServer.value.id, toolsToSave);
        // 静默保存，不打扰用户
    } catch (e) {
        console.error("保存工具状态失败", e);
        ElMessage.error(t('mcp.test.saveToolStateFailed'));
    }
}

// 处理点击连接按钮
async function handleTestClick(server) {
    currentTestToolName.value = '';
    testFormData.value = {};
    testOutput.value = '';
    activeTestTab.value = 'list';
    currentTestingServer.value = server;
    testResult.serverName = server.name;
    testResult.serverDescription = server.description;
    testResult.loading = true;
    showTestResultDialog.value = true;

    try {
        const cache = await window.api.getMcpToolCache();
        if (cache && cache[server.id] && Array.isArray(cache[server.id]) && cache[server.id].length > 0) {
            testResult.tools = cache[server.id].map(tool => ({
                ...tool,
                enabled: tool.enabled ?? true
            }));

            testResult.success = true;
            testResult.isCached = true;
            testResult.message = '';
            testResult.loading = false;

            if (testResult.tools.length > 0) {
                currentTestToolName.value = testResult.tools[0].name;
                handleTestToolChange(testResult.tools[0].name);
            }
        } else {
            await triggerConnectionTest(server);
        }
    } catch (error) {
        console.error("Cache read failed", error);
        await triggerConnectionTest(server);
    }
}

// 强制刷新（点击弹窗右上角刷新按钮）
async function handleRefreshTest() {
    if (currentTestingServer.value) {
        await triggerConnectionTest(currentTestingServer.value);
    }
}

// 执行真实连接测试
async function triggerConnectionTest(server) {
    testResult.loading = true;
    testResult.isCached = false;
    testResult.success = false;
    testResult.message = '';
    testResult.tools = [];
    currentTestToolName.value = '';

    const configToTest = { /* ... 构造配置 ... */
        id: server.id,
        name: server.name,
        type: server.type,
        command: server.command,
        baseUrl: server.baseUrl,
        env: typeof server.env === 'string' ? convertTextToObject(server.env) : server.env,
        headers: typeof server.headers === 'string' ? convertTextToObject(server.headers) : server.headers,
        args: Array.isArray(server.args) ? server.args : convertTextToLines(server.args)
    };

    try {
        const result = await window.api.testMcpConnection(configToTest);

        if (result.success) {
            testResult.success = true;
            testResult.tools = result.tools || [];
            ElMessage.success(t('mcp.alerts.testSuccess'));
            if (testResult.tools.length > 0) {
                currentTestToolName.value = testResult.tools[0].name;
                handleTestToolChange(testResult.tools[0].name);
            }
        } else {
            testResult.success = false;
            testResult.message = result.error;
            ElMessage.error(t('mcp.alerts.testFailed'));
        }
    } catch (e) {
        testResult.success = false;
        testResult.message = e.message;
        ElMessage.error(t('mcp.alerts.testFailed'));
    } finally {
        testResult.loading = false;
    }
}
</script>

<template>
    <div class="page-container">
        <el-scrollbar class="main-content-scrollbar">
            <div class="content-wrapper">
                <div v-if="mcpServersList.length === 0" class="empty-state">
                    <el-empty :description="t('mcp.noServers')" />
                </div>
                <div v-else>
                    <div class="search-bar-container">
                        <el-input v-model="searchQuery" :placeholder="t('mcp.searchPlaceholder')" :prefix-icon="Search"
                            clearable />
                    </div>
                    <div v-if="filteredMcpServersList.length === 0" class="empty-state">
                        <el-empty :description="t('mcp.noMatch')" />
                    </div>
                    <div v-else class="mcp-grid-container">
                        <div v-for="server in filteredMcpServersList" :key="server.id" class="mcp-card">
                            <div class="mcp-card-header">
                                <el-avatar :src="server.logoUrl" shape="square" :size="32" class="mcp-card-icon">
                                    <el-icon :size="20">
                                        <Tools />
                                    </el-icon>
                                </el-avatar>
                                <div class="mcp-card-title-group">
                                    <span class="mcp-name">{{ server.name }}</span>
                                    <span class="mcp-provider" v-if="server.provider">{{ server.provider }}</span>
                                </div>

                                <!-- 持久连接开关移到 Header -->
                                <div class="mcp-header-actions">
                                    <el-tooltip
                                        :content="server.isPersistent ? t('mcp.persistentOn') : t('mcp.persistentOff')"
                                        placement="top">
                                        <el-button text circle size="small"
                                            :class="{ 'is-persistent-active': server.isPersistent }"
                                            @click.stop="handleSwitchChange(server.id, 'isPersistent', !server.isPersistent)"
                                            class="persistent-btn-header">
                                            <el-icon :size="14">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                                                    stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                                    stroke-linejoin="round">
                                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                                </svg>
                                            </el-icon>
                                        </el-button>
                                    </el-tooltip>

                                    <el-switch :model-value="server.isActive"
                                        @change="(value) => handleSwitchChange(server.id, 'isActive', value)"
                                        size="small" class="mcp-active-toggle" />
                                </div>
                            </div>
                            <div class="mcp-card-body">
                                <p class="mcp-description">{{ server.description }}</p>
                            </div>
                            <div class="mcp-card-footer">
                                <div class="mcp-tags">
                                    <el-tag v-if="server.type" size="small" type="info">{{
                                        getDisplayTypeName(server.type) }}</el-tag>
                                    <el-tag v-for="tag in server.tags" :key="tag" size="small">{{ tag }}</el-tag>
                                </div>
                                <div class="mcp-actions">
                                    <el-tooltip :content="t('mcp.testConnectionTooltip')" placement="top">
                                        <el-button :icon="Link" text circle @click="handleTestClick(server)"
                                            class="action-btn-compact" />
                                    </el-tooltip>
                                    <el-button v-if="server.type !== 'builtin'" :icon="Edit" text circle
                                        @click="prepareEditServer(server)" class="action-btn-compact" />
                                    <el-button v-if="server.type !== 'builtin'" :icon="Delete" text circle type="danger"
                                        @click="deleteServer(server.id, server.name)" class="action-btn-compact" />
                                    <el-button :icon="CopyDocument" text circle @click="copyServerJson(server)"
                                        class="action-btn-compact" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </el-scrollbar>

        <div class="bottom-actions-container">
            <el-button class="action-btn" @click="prepareAddServer" :icon="Plus" type="primary">
                {{ t('mcp.addServer') }}
            </el-button>
            <el-button class="action-btn" @click="prepareEditJson" :icon="Edit">
                {{ t('mcp.editJson') }}
            </el-button>
        </div>

        <!-- 编辑弹窗 (保持不变) -->
        <el-dialog v-model="showEditDialog" :title="isNewServer ? t('mcp.addServerTitle') : t('mcp.editServerTitle')"
            width="700px" :close-on-click-modal="false">
            <el-scrollbar max-height="50vh" class="mcp-dialog-scrollbar">
                <el-form :model="editingServer" label-position="top" @submit.prevent="saveServer">
                    <el-row :gutter="20">
                        <el-col :span="12">
                            <el-form-item :label="t('mcp.nameLabel')" required>
                                <el-input v-model="editingServer.name" />
                            </el-form-item>
                        </el-col>
                        <el-col :span="6">
                            <el-form-item :label="t('mcp.typeLabel')">
                                <el-select v-model="normalizedEditingServerType" style="width: 100%;">
                                    <el-option :label="t('mcp.typeOptions.sse')" value="sse" />
                                    <el-option :label="t('mcp.typeOptions.http')" value="http" />
                                    <el-option :label="t('mcp.typeOptions.stdio')" value="stdio" />
                                </el-select>
                            </el-form-item>
                        </el-col>
                        <el-col :span="6" class="switches-container">
                            <el-form-item :label="t('mcp.activeLabel')" class="compact-form-item">
                                <el-switch v-model="editingServer.isActive" />
                            </el-form-item>
                            <el-form-item class="compact-form-item">
                                <template #label>
                                    <span>{{ t('mcp.persistent.label') }}</span>
                                    <el-tooltip :content="t('mcp.persistent.tooltip')" placement="top">
                                        <el-icon style="margin-left: 4px; cursor: help; vertical-align: middle;">
                                            <QuestionFilled />
                                        </el-icon>
                                    </el-tooltip>
                                </template>
                                <el-switch v-model="editingServer.isPersistent"
                                    style="--el-switch-on-color: #67C23A;" />
                            </el-form-item>
                        </el-col>
                    </el-row>
                    <el-form-item :label="t('mcp.descriptionLabel')">
                        <el-scrollbar max-height="100px" class="item-scrollbar">
                            <el-input v-model="editingServer.description" type="textarea" :autosize="{ minRows: 2 }"
                                resize="none" />
                        </el-scrollbar>
                    </el-form-item>

                    <el-divider content-position="left"></el-divider>

                    <template v-if="normalizedEditingServerType === 'http' || normalizedEditingServerType === 'sse'">
                        <el-form-item :label="t('mcp.http.url')"><el-input
                                v-model="editingServer.baseUrl" /></el-form-item>
                        <el-form-item :label="t('mcp.http.headers')">
                            <el-scrollbar max-height="80px" class="item-scrollbar">
                                <el-input v-model="editingServer.headers" type="textarea" :autosize="{ minRows: 2 }"
                                    resize="none" :placeholder="t('mcp.headersPlaceholder')" />
                            </el-scrollbar>
                        </el-form-item>
                    </template>

                    <template v-if="editingServer.type === 'stdio'">
                        <el-form-item :label="t('mcp.stdio.command')">
                            <el-scrollbar class="item-scrollbar">
                                <el-input v-model="editingServer.command" />
                            </el-scrollbar>
                        </el-form-item>
                        <el-form-item :label="t('mcp.stdio.args')">
                            <el-scrollbar max-height="80px" class="item-scrollbar">
                                <el-input v-model="editingServer.args" type="textarea" :autosize="{ minRows: 1 }"
                                    resize="none" :placeholder="t('mcp.argsPlaceholder')" />
                            </el-scrollbar>
                        </el-form-item>
                        <el-form-item :label="t('mcp.stdio.env')">
                            <el-scrollbar max-height="80px" class="item-scrollbar">
                                <el-input v-model="editingServer.env" type="textarea" :autosize="{ minRows: 2 }"
                                    resize="none" :placeholder="t('mcp.envPlaceholder')" />
                            </el-scrollbar>
                        </el-form-item>
                    </template>

                    <el-collapse v-model="advancedCollapse" class="advanced-collapse">
                        <el-collapse-item :title="t('mcp.advanced')" name="1">
                            <el-row :gutter="20">
                                <el-col :span="12">
                                    <el-form-item :label="t('mcp.providerName')">
                                        <el-input v-model="editingServer.provider" />
                                    </el-form-item>
                                </el-col>
                                <el-col :span="12">
                                    <el-form-item :label="t('mcp.logoUrl')">
                                        <el-input v-model="editingServer.logoUrl" />
                                    </el-form-item>
                                </el-col>
                            </el-row>
                            <el-form-item :label="t('mcp.providerUrl')"><el-input
                                    v-model="editingServer.providerUrl" /></el-form-item>
                            <el-form-item :label="t('mcp.tags')"><el-input v-model="editingServer.tags"
                                    :placeholder="t('mcp.tagsPlaceholder')" /></el-form-item>
                        </el-collapse-item>
                    </el-collapse>
                </el-form>
            </el-scrollbar>
            <template #footer>
                <el-button @click="showEditDialog = false">{{ t('common.cancel') }}</el-button>
                <el-button type="primary" @click="saveServer">{{ t('common.confirm') }}</el-button>
            </template>
        </el-dialog>

        <!-- JSON 编辑弹窗 (保持不变) -->
        <el-dialog v-model="showJsonDialog" :title="t('mcp.jsonDialog.title')" width="700px"
            :close-on-click-modal="false" custom-class="mcp-json-dialog">
            <el-alert :title="t('mcp.jsonDialog.description')" type="warning" show-icon :closable="false"
                style="margin-bottom: 15px;" />
            <el-scrollbar max-height="50vh" class="json-editor-scrollbar">
                <el-input v-model="jsonEditorContent" type="textarea" :autosize="true" resize="none" />
            </el-scrollbar>
            <template #footer>
                <el-button @click="showJsonDialog = false">{{ t('common.cancel') }}</el-button>
                <el-button type="primary" @click="saveJson">{{ t('common.confirm') }}</el-button>
            </template>
        </el-dialog>

        <!-- 测试结果弹窗 -->
        <el-dialog v-model="showTestResultDialog" width="650px" append-to-body class="test-result-dialog">
            <template #header>
                <div class="test-dialog-header" style="align-items: center;">
                    <div class="header-left">
                        <span class="dialog-title">
                            <el-tooltip v-if="testResult.serverDescription" :content="testResult.serverDescription"
                                placement="bottom-start" popper-class="mcp-tooltip-width">
                                {{ `${testResult.serverName}` }}
                            </el-tooltip>
                            <span v-else>{{ testResult.serverName }}</span>
                        </span>
                    </div>
                    
                    <!-- 中间/右侧：Tab 切换与刷新按钮组合 -->
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <!-- 只有连接成功且有工具时才显示 Tab 切换 -->
                        <el-radio-group 
                            v-if="testResult.success && testResult.tools.length > 0 && !testResult.loading" 
                            v-model="activeTestTab" 
                            size="small"
                        >
                            <el-radio-button value="list">{{ t('mcp.tabs.tools') }}</el-radio-button>
                            <el-radio-button value="test">{{ t('mcp.tabs.test') }}</el-radio-button>
                        </el-radio-group>

                        <el-button v-if="!testResult.loading" :icon="Refresh" circle size="small" @click="handleRefreshTest"
                            :title="t('mcp.refreshTooltip')" />
                    </div>
                </div>
            </template>

            <div v-if="testResult.loading" class="test-loading-state">
                <el-icon class="is-loading" :size="24">
                    <Refresh />
                </el-icon>
                <p>{{ t('mcp.connecting') }}</p>
            </div>

            <div v-else class="test-result-content">
                <el-alert v-if="testResult.success && !testResult.isCached"
                    :title="t('mcp.connectionSuccess', { count: testResult.tools.length })" type="success" show-icon
                    style="margin-bottom: 10px; flex-shrink: 0;" />

                <el-alert v-else-if="!testResult.success" :title="t('mcp.connectionFailed')"
                    :description="testResult.message" type="error" show-icon :closable="false"
                    style="margin-bottom: 15px; flex-shrink: 0;" />

                <div v-if="testResult.success && testResult.tools.length > 0" class="tabs-wrapper">

                    <el-tabs v-model="activeTestTab" class="test-tabs">
                        <!-- Tab 1: 启用工具列表 -->
                        <el-tab-pane :label="t('mcp.tabs.tools')" name="list">
                            <el-scrollbar max-height="50vh" class="tab-inner-scrollbar">
                                <div class="tab-pane-content">
                                    <div class="list-header">
                                        <el-tag v-if="testResult.isCached" type="info" size="small" effect="plain" round
                                            class="cached-tag">
                                            {{ t('mcp.cached') }}
                                        </el-tag>
                                        <span class="hint-text">{{ t('mcp.hints.selectTools') }}</span>
                                    </div>
                                    <div class="tools-compact-list">
                                        <div v-for="tool in testResult.tools" :key="tool.name"
                                            class="tool-compact-item">
                                            <el-switch v-model="tool.enabled" size="small"
                                                @change="updateToolCacheStatus" />
                                            <span class="tool-compact-name" :title="tool.name">{{ tool.name }}</span>
                                            <el-tooltip :content="tool.description || t('mcp.noDescription')"
                                                placement="top" :show-after="500" popper-class="mcp-tooltip-width">
                                                <span class="tool-compact-desc">{{ tool.description ||
                                                    t('mcp.noDescription')
                                                    }}</span>
                                            </el-tooltip>
                                        </div>
                                    </div>
                                </div>
                            </el-scrollbar>
                        </el-tab-pane>

                        <!-- Tab 2: 工具调用测试 -->
                        <el-tab-pane :label="t('mcp.tabs.test')" name="test">
                            <el-scrollbar max-height="50vh" class="tab-inner-scrollbar">
                                <div class="tab-pane-content">
                                    <div class="test-form-area no-border">
                                        <!-- 工具选择 -->
                                        <div class="test-form-row">
                                            <span class="label">{{ t('mcp.test.selectTool') }}</span>
                                            <el-select v-model="currentTestToolName"
                                                :placeholder="t('mcp.test.selectToolPlaceholder')" filterable
                                                @change="handleTestToolChange" style="flex: 1;">
                                                <el-option v-for="tool in testResult.tools" :key="tool.name"
                                                    :label="tool.name" :value="tool.name" />
                                            </el-select>
                                            <el-button v-if="testRunning" type="danger" plain @click="cancelToolTest">
                                                {{ t('mcp.test.cancel') }}
                                            </el-button>
                                            <el-button v-else type="primary" @click="runToolTest"
                                                :disabled="!currentTestToolName">
                                                {{ t('mcp.test.run') }}
                                            </el-button>
                                        </div>

                                        <!-- 动态参数表单 -->
                                        <div v-if="currentTestToolName" class="dynamic-form-container">
                                            <div v-if="currentTestToolSchema.length === 0" class="no-params-text">
                                                {{ t('mcp.test.noParams') }}
                                            </div>

                                            <div v-else class="form-grid">
                                                <div v-for="field in currentTestToolSchema" :key="field.key"
                                                    class="dynamic-field">
                                                    <div class="field-label">
                                                        <span class="required-star" v-if="field.required">*</span>
                                                        {{ field.key }}
                                                        <el-tooltip v-if="field.description"
                                                            :content="field.description" placement="top"
                                                            popper-class="mcp-tooltip-width">
                                                            <el-icon class="info-icon">
                                                                <QuestionFilled />
                                                            </el-icon>
                                                        </el-tooltip>
                                                    </div>

                                                    <el-switch v-if="field.type === 'boolean'"
                                                        v-model="testFormData[field.key]" />

                                                    <el-input
                                                        v-else-if="field.type === 'integer' || field.type === 'number'"
                                                        v-model="testFormData[field.key]" type="number"
                                                        :placeholder="field.default !== undefined ? `${t('mcp.test.default')}: ${field.default}` : t('mcp.test.leaveEmpty')"
                                                        style="width: 100%;" />

                                                    <el-input
                                                        v-else-if="field.type === 'array' || field.type === 'object'"
                                                        v-model="testFormData[field.key]" type="textarea" :rows="2"
                                                        :placeholder="t('mcp.test.inputJsonPlaceholder', { type: field.type })"
                                                        style="font-family: monospace;" />

                                                    <el-select v-else-if="field.enum" v-model="testFormData[field.key]"
                                                        :placeholder="t('mcp.test.selectPlaceholder')"
                                                        style="width: 100%;" clearable>
                                                        <el-option v-for="opt in field.enum" :key="opt" :label="opt"
                                                            :value="opt" />
                                                    </el-select>

                                                    <el-input v-else v-model="testFormData[field.key]"
                                                        :placeholder="field.description || t('mcp.test.inputPlaceholder')" />
                                                </div>
                                            </div>
                                        </div>

                                        <!-- 结果输出 -->
                                        <div v-if="testOutput" class="test-output-box">
                                            <div class="output-label">{{ t('mcp.test.response') }}</div>
                                            <el-scrollbar max-height="200px" class="result-scrollbar">
                                                <pre class="result-pre">{{ testOutput }}</pre>
                                            </el-scrollbar>
                                        </div>
                                    </div>
                                </div>
                            </el-scrollbar>
                        </el-tab-pane>
                    </el-tabs>

                </div>
                <el-empty v-else-if="testResult.success" :description="t('mcp.noToolsProvided')" :image-size="60" />
            </div>

            <template #footer>
                <el-button @click="showTestResultDialog = false">{{ t('common.close') }}</el-button>
            </template>
        </el-dialog>

        <el-button class="refresh-fab-button" :icon="Refresh" type="primary" circle @click="refreshMcpConfig"
            :title="t('mcp.refreshConfig')" />
    </div>
</template>

<style>
.mcp-tooltip-width {
    max-width: 60vw;
    line-height: 1.4;
}

/* 针对结果框内部的原生滚动条美化 */
.result-content-static pre::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
</style>

<style scoped>
/* ================= 全局布局 ================= */
.page-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background-color: var(--bg-primary);
}

.main-content-scrollbar {
    flex-grow: 1;
}

html.dark .main-content-scrollbar :deep(.el-scrollbar__thumb) {
    background-color: var(--text-tertiary);
}

html.dark .main-content-scrollbar :deep(.el-scrollbar__thumb:hover) {
    background-color: var(--text-secondary);
}

.content-wrapper {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0px 24px 80px 24px;
}

.search-bar-container {
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: var(--bg-primary);
    padding: 8px 0px 8px 0px;
    margin: 0px 0px 5px 0px;
}

.search-bar-container :deep(.el-input__wrapper) {
    box-shadow: 0 0 0 1px var(--border-primary) inset !important;
}

.search-bar-container :deep(.el-input__wrapper.is-focus) {
    box-shadow: 0 0 0 1px var(--text-accent) inset !important;
}

.empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    height: calc(100vh - 200px);
}

.mcp-grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 15px;
}

.mcp-card {
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    padding: 8px 16px 4px 16px;
    display: flex;
    flex-direction: column;
    transition: all 0.2s ease-in-out;
}

.mcp-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-md);
    border-color: var(--border-accent);
}

.mcp-card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
}

.mcp-card-icon {
    flex-shrink: 0;
    background-color: var(--bg-tertiary);
}

.mcp-card-title-group {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.mcp-header-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
}

.mcp-name {
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.mcp-provider {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.mcp-active-toggle {
    margin-left: 4px;
}

.mcp-card-body {
    flex-grow: 1;
}

.mcp-description {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.6;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    -webkit-line-clamp: 2;
    line-clamp: 2;
}

.mcp-card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0px;
    margin-bottom: 0px;
    gap: 12px;
}

.mcp-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex-grow: 1;
    min-width: 0;
    margin-top: 0px;
    padding-top: 0px;
}

.persistent-btn-header {
    color: var(--text-tertiary);
    padding: 4px;
    height: 24px;
    width: 24px;
}

.persistent-btn-header:hover {
    color: var(--text-accent);
    background-color: var(--bg-tertiary);
}

.persistent-btn-header.is-persistent-active {
    color: #67C23A;
}

.persistent-btn-header.is-persistent-active:hover {
    background-color: rgba(103, 194, 58, 0.1);
}

.mcp-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
}

.action-btn-compact {
    padding: 6px;
    margin-left: 0 !important;
}

.mcp-actions .el-button {
    color: var(--text-tertiary);
}

.mcp-actions .el-button:hover {
    color: var(--text-accent);
    background-color: var(--bg-tertiary);
}

.bottom-actions-container {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    display: flex;
    justify-content: center;
    gap: 16px;
    padding: 12px 24px;
    background-color: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-top: 1px solid var(--border-primary);
    z-index: 20;
}

html.dark .bottom-actions-container {
    background-color: rgba(23, 24, 28, 0.7);
}

.bottom-actions-container .action-btn {
    flex-grow: 0;
    min-width: 180px;
    font-weight: 500;
}

.advanced-collapse {
    border-top: none;
    border-bottom: none;
    padding-left: 15px;
    padding-right: 15px;
    margin: 15px 0 0 0;
}

.advanced-collapse :deep(.el-collapse-item__header) {
    border-bottom: 1px solid var(--border-primary);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
    line-height: 1;
    height: 36px;
    background-color: transparent;
}

.advanced-collapse :deep(.el-collapse-item__header.is-active) {
    border-bottom-style: dashed;
}

.advanced-collapse :deep(.el-collapse-item__wrap) {
    border-bottom: none;
    padding-top: 20px;
    background-color: transparent;
}

.advanced-collapse :deep(.el-collapse-item__content) {
    padding-bottom: 0;
}

html.dark .advanced-collapse {
    background-color: var(--bg-primary);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-primary);
}

html.dark .advanced-collapse :deep(.el-collapse-item__header) {
    border-bottom-color: var(--border-primary);
}

html.dark .advanced-collapse :deep(.el-collapse-item__header.is-active) {
    border-bottom-color: var(--border-accent);
}

html.dark .advanced-collapse :deep(.el-collapse-item__wrap) {
    background-color: transparent;
}

.mcp-dialog-scrollbar :deep(.el-scrollbar__view) {
    padding: 5px 20px 5px 5px;
}

.json-editor-scrollbar {
    border-radius: var(--el-input-border-radius, var(--el-border-radius-base));
    border: 1px solid var(--el-border-color);
    background-color: var(--el-fill-color-blank);
    transition: border-color .2s;
}

.json-editor-scrollbar:has(:focus-within) {
    border-color: var(--el-color-primary);
}

.json-editor-scrollbar :deep(.el-textarea__inner) {
    background-color: transparent;
    border: none;
    box-shadow: none !important;
    padding: 5px 11px;
    resize: none;
}

.item-scrollbar :deep(.el-textarea__inner:focus) {
    box-shadow: none !important;
}

.item-scrollbar :deep(.el-input__wrapper) {
    background-color: transparent !important;
    box-shadow: none !important;
}

.item-scrollbar :deep(.el-input__wrapper.is-focus) {
    box-shadow: none !important;
}

.refresh-fab-button {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 21;
    width: 24px;
    height: 24px;
    font-size: 16px;
    box-shadow: var(--el-box-shadow-light);
}

.item-scrollbar {
    width: 100%;
    border-radius: var(--el-input-border-radius, var(--el-border-radius-base));
    border: 1px solid var(--el-border-color);
    background-color: var(--el-fill-color-blank);
    transition: border-color .2s;
}

.item-scrollbar:has(:focus-within) {
    border-color: var(--el-color-primary);
}

.item-scrollbar :deep(.el-textarea__inner) {
    overflow: hidden;
    box-shadow: none !important;
    background-color: transparent !important;
    padding: 5px 11px;
}

.item-scrollbar :deep(.el-scrollbar__view) {
    padding-right: 2px;
}

.switches-container {
    display: flex;
    justify-content: space-around;
    align-items: flex-start;
    padding-top: 6px;
}

.compact-form-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 0;
}

.compact-form-item :deep(.el-form-item__label) {
    margin-bottom: 8px;
    line-height: 1;
    padding: 0 !important;
    display: flex;
    align-items: center;
}

.compact-form-item :deep(.el-form-item__content) {
    line-height: 1;
}

.test-dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-right: 20px;
}

.header-left {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin-right: 10px;
    flex: 1;
}

.dialog-title {
    font-weight: 600;
    font-size: 16px;
    color: var(--text-primary);
}

.test-loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: var(--text-secondary);
}

.test-loading-state .is-loading {
    animation-direction: reverse;
}

/* 2. 测试内容主体容器 (Flex布局，限制高度) */
.test-result-content {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* 3. Tabs 容器 */
.tabs-wrapper {
    margin-top: 0 !important;
}

/* 4. Element Tabs 样式重置 */
.test-tabs {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.test-tabs :deep(.el-tabs__header) {
    display: none !important;
}

.test-tabs :deep(.el-tabs__nav-wrap) {
    padding: 0 10px;
}

.test-result-dialog :deep(.el-dialog__header) {
    padding-bottom: 10px !important;
    border-bottom: 1px solid var(--border-primary);
    margin-right: 0 !important;
}

.test-tabs :deep(.el-tabs__content) {
    height: 100%;
}

/* Tab Pane 必须也是 100% 高度 */
.test-tabs :deep(.el-tab-pane) {
    height: 100%;
    width: 100%;
}

/* 5. Tab 内部滚动条容器 */
.tab-inner-scrollbar {
    height: 100%;
    width: 100%;
}

.tab-inner-scrollbar :deep(.el-scrollbar__view) {
    padding: 15px 10px 20px 5px;
    min-height: 100%;
    display: flex;
    flex-direction: column;
}

/* 6. Tab 内容布局 */
.tab-pane-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    padding: 4px 12px 4px 4px;
}

/* Tab 1: 工具列表 */
.list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    flex-shrink: 0;
}

.cached-tag {
    height: 18px;
    line-height: 16px;
    font-size: 11px;
}

.hint-text {
    font-size: 12px;
    color: var(--text-tertiary);
}

.tools-compact-list {
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    background-color: var(--bg-primary);
}

.tool-compact-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-primary);
    gap: 10px;
}

.tool-compact-item:last-child {
    border-bottom: none;
}

.tool-compact-name {
    font-weight: 500;
    color: var(--text-primary);
    font-size: 13px;
    white-space: nowrap;
}

.tool-compact-desc {
    color: var(--text-secondary);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
}

/* Tab 2: 测试表单 */
.test-form-area.no-border {
    border: none;
    padding: 0;
    background-color: transparent;
    display: flex;
    flex-direction: column;
}

.test-form-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 15px;
    flex-shrink: 0;
}

.test-form-row .label {
    font-size: 13px;
    color: var(--text-secondary);
    white-space: nowrap;
}

.dynamic-form-container {
    padding-right: 8px;
    margin-bottom: 15px;
}

.no-params-text {
    font-size: 12px;
    color: var(--text-tertiary);
    text-align: center;
    padding: 8px 0;
    font-style: italic;
    border: 1px dashed var(--border-primary);
    /* 可选：加个虚线框表示这里是参数区 */
    border-radius: 4px;
}

.form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
}

.dynamic-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.dynamic-field:has(textarea) {
    grid-column: span 2;
}

.field-label {
    font-size: 12px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
}

.required-star {
    color: #F56C6C;
    margin-right: 2px;
}

.info-icon {
    margin-left: 4px;
    cursor: help;
    font-size: 12px;
}

/* 结果输出框 */
.test-output-box {
    margin-top: 10px;
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    padding: 8px;
    /* 不再限制最大高度，让其自然撑开页面从而触发外层滚动 */
    display: flex;
    flex-direction: column;
}

.output-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 4px;
    flex-shrink: 0;
}

.result-content-static pre {
    margin: 0;
    font-family: monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--text-primary);
    max-height: 400px;
    overflow-y: auto;
}
</style>