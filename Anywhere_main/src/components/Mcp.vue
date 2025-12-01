<script setup>
import { ref, reactive, computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, ElScrollbar, ElAlert } from 'element-plus';
import { Plus, Delete, Edit, CopyDocument, Tools, Search, Refresh, QuestionFilled } from '@element-plus/icons-vue';

const { t } = useI18n();
const currentConfig = inject('config');

const showEditDialog = ref(false);
const showJsonDialog = ref(false);
const isNewServer = ref(false);
const jsonEditorContent = ref('');
const searchQuery = ref('');
const advancedCollapse = ref([]);

const defaultServer = {
    id: null,
    name: '',
    description: '',
    type: 'sse',
    isActive: true,
    isPersistent: false, // 持久化连接标记
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
        (server.tags && server.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery)))
    );
});

function getDisplayTypeName(type) {
    if (!type) return '';
    const streamableHttpRegex = /^streamable[\s_-]?http$/i;
    const lowerType = type.toLowerCase();

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
    const addIfPresent = (obj, key, value) => {
        if (value) obj[key] = value;
    };
    const addIfArrayPresent = (obj, key, value) => {
        if (value && value.length > 0) obj[key] = value;
    };
    const addIfObjectPresent = (obj, key, value) => {
        if (value && Object.keys(value).length > 0) obj[key] = value;
    };

    const serverData = {
        name: editingServer.name,
        type: editingServer.type,
        isActive: editingServer.isActive,
        isPersistent: editingServer.isPersistent, // 保存持久化标记
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
            if (config.mcpServers) {
                delete config.mcpServers[serverId];
            }
        });
        ElMessage.success(t('mcp.alerts.deleteSuccess'));
    }).catch(() => { });
}

// [修改] 将开关状态的更新也改为原子操作
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
    ElMessage.success('服务器配置已复制到剪贴板');
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
            throw new Error('JSON必须是一个包含 "mcpServers" 键的对象。');
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
            ElMessage.success('MCP 服务配置已刷新！');
        } else {
            throw new Error("未能获取到有效的配置数据。");
        }
    } catch (error) {
        console.error("刷新MCP配置失败:", error);
        ElMessage.error('刷新配置失败，请稍后重试。');
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
                        <el-input v-model="searchQuery" placeholder="搜索名称、描述、提供者或标签..." :prefix-icon="Search"
                            clearable />
                    </div>
                    <div v-if="filteredMcpServersList.length === 0" class="empty-state">
                        <el-empty description="未找到匹配的服务" />
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
                                <el-switch :model-value="server.isActive"
                                    @change="(value) => handleSwitchChange(server.id, 'isActive', value)" size="small"
                                    class="mcp-active-toggle" />
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
                                <!-- 持久连接开关 -->
                                <div class="mcp-persistent-toggle">
    <el-tooltip :content="t('mcp.persistent.tooltip')" placement="top">
        <el-button 
            text 
            circle
            :class="{ 'is-persistent-active': server.isPersistent }"
            @click.stop="handleSwitchChange(server.id, 'isPersistent', !server.isPersistent)"
            class="persistent-btn">
            <el-icon :size="16">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </el-icon>
        </el-button>
    </el-tooltip>
</div>
                                <div class="mcp-actions">
                                    <el-button :icon="Edit" text circle @click="prepareEditServer(server)" />
                                    <el-button :icon="Delete" text circle type="danger"
                                        @click="deleteServer(server.id, server.name)" />
                                    <el-button :icon="CopyDocument" text circle @click="copyServerJson(server)" />
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

        <el-dialog v-model="showEditDialog" :title="isNewServer ? t('mcp.addServerTitle') : t('mcp.editServerTitle')"
            width="700px" :close-on-click-modal="false" top="5vh">
            <el-scrollbar max-height="60vh" class="mcp-dialog-scrollbar">
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

        <el-dialog v-model="showJsonDialog" :title="t('mcp.jsonDialog.title')" width="700px"
            :close-on-click-modal="false" top="5vh" custom-class="mcp-json-dialog">
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
        <!-- 悬浮刷新按钮 -->
        <el-button class="refresh-fab-button" :icon="Refresh" type="primary" circle @click="refreshMcpConfig"
            title="刷新 MCP 服务配置" />
    </div>
</template>

<style scoped>
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
    /* Adjust height for better centering */
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
    padding: 8px 16px 10px 16px;
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
    flex-shrink: 0;
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
    align-items: flex-end;
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

.persistent-btn {
  color: var(--text-tertiary);
}

.persistent-btn:hover {
  color: var(--text-accent);
  background-color: var(--bg-tertiary);
}

.persistent-btn.is-persistent-active {
  color: #67C23A; /* 启用状态的绿色高亮 */
}

.persistent-btn.is-persistent-active:hover {
    background-color: rgba(103, 194, 58, 0.1);
}

.mcp-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
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
</style>