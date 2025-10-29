<script setup>
import { ref, reactive, computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Delete, Edit, CopyDocument, Tools } from '@element-plus/icons-vue';

const { t } = useI18n();
const currentConfig = inject('config');

const showEditDialog = ref(false);
const showJsonDialog = ref(false);
const isNewServer = ref(false);
const jsonEditorContent = ref('');

const defaultServer = {
    id: null,
    name: '',
    description: '',
    type: 'stdio',
    isActive: true,
    baseUrl: '',
    command: '',
    args: [],
    registryUrl: '',
    env: {},
    headers: {},
    provider: '',
    providerUrl: '',
    logoUrl: '',
    tags: []
};

// Use a factory function to create a fresh object for the form
const createEditingServerState = () => ({
    ...defaultServer,
    args: '',
    env: '',
    headers: '',
    tags: ''
});

const editingServer = reactive(createEditingServerState());

const mcpServersList = computed(() => {
    if (!currentConfig.value || !currentConfig.value.mcpServers) return [];
    return Object.entries(currentConfig.value.mcpServers)
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => a.name.localeCompare(b.name));
});

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
    return text.split('\n').filter(Boolean).reduce((acc, line) => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex > 0) {
            const key = line.substring(0, separatorIndex).trim();
            const value = line.substring(separatorIndex + 1).trim();
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
    showEditDialog.value = true;
}

function prepareEditServer(server) {
    isNewServer.value = false;
    Object.assign(editingServer, {
        ...createEditingServerState(), // Start with defaults to clear old state
        ...server, // Then apply server data
        args: convertLinesToText(server.args),
        env: convertObjectToText(server.env),
        headers: convertObjectToText(server.headers),
        tags: Array.isArray(server.tags) ? server.tags.join(', ') : ''
    });
    showEditDialog.value = true;
}

async function saveServer() {
    // A helper to add a property only if it's not empty/falsy
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
    };
    
    addIfPresent(serverData, 'description', editingServer.description);
    addIfPresent(serverData, 'baseUrl', editingServer.baseUrl);
    addIfPresent(serverData, 'command', editingServer.command);
    addIfArrayPresent(serverData, 'args', convertTextToLines(editingServer.args));
    addIfPresent(serverData, 'registryUrl', editingServer.registryUrl);
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
    }).catch(() => {});
}

async function handleActiveChange(serverId, isActive) {
    await atomicSave(config => {
        if (config.mcpServers && config.mcpServers[serverId]) {
            config.mcpServers[serverId].isActive = isActive;
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
</script>

<template>
    <div class="page-container">
        <el-scrollbar class="main-content-scrollbar">
            <div class="content-wrapper">
                <div v-if="mcpServersList.length === 0" class="empty-state">
                    <el-empty :description="t('mcp.noServers')" />
                </div>
                <div v-else class="mcp-grid-container">
                    <div v-for="server in mcpServersList" :key="server.id" class="mcp-card">
                        <div class="mcp-card-header">
                            <el-avatar :src="server.logoUrl" shape="square" :size="32" class="mcp-card-icon">
                                <el-icon :size="20"><Tools /></el-icon>
                            </el-avatar>
                            <div class="mcp-card-title-group">
                                <span class="mcp-name">{{ server.name }}</span>
                                <span class="mcp-provider" v-if="server.provider">{{ server.provider }}</span>
                            </div>
                            <el-switch :model-value="server.isActive"
                                @change="(value) => handleActiveChange(server.id, value)" size="small"
                                class="mcp-active-toggle" />
                        </div>
                        <div class="mcp-card-body">
                            <p class="mcp-description">{{ server.description }}</p>
                        </div>
                        <div class="mcp-card-footer">
                            <div class="mcp-tags">
                                <el-tag v-if="server.type" size="small" type="info">{{ server.type }}</el-tag>
                                <el-tag v-for="tag in server.tags" :key="tag" size="small">{{ tag }}</el-tag>
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
            width="750px" :close-on-click-modal="false" top="8vh">
            <el-form :model="editingServer" label-position="top" @submit.prevent="saveServer">
                <el-row :gutter="20">
                    <el-col :span="12">
                        <el-form-item :label="t('mcp.nameLabel')" required>
                            <el-input v-model="editingServer.name" />
                        </el-form-item>
                    </el-col>
                    <el-col :span="8">
                        <el-form-item :label="t('mcp.typeLabel')">
                            <el-select v-model="editingServer.type" style="width: 100%;">
                                <el-option :label="t('mcp.typeOptions.stdio')" value="stdio" />
                                <el-option :label="t('mcp.typeOptions.streamableHttp')" value="streamableHttp" />
                                <el-option :label="t('mcp.typeOptions.sse')" value="sse" />
                            </el-select>
                        </el-form-item>
                    </el-col>
                    <el-col :span="4" style="text-align: center;">
                        <el-form-item :label="t('mcp.activeLabel')">
                            <el-switch v-model="editingServer.isActive" style="--el-switch-on-color: var(--el-color-primary);" />
                        </el-form-item>
                    </el-col>
                </el-row>
                <el-form-item :label="t('mcp.descriptionLabel')">
                    <el-input v-model="editingServer.description" type="textarea" :rows="2" />
                </el-form-item>
                
                <el-divider>连接设置</el-divider>
                
                <el-form-item :label="t('mcp.http.url')"><el-input v-model="editingServer.baseUrl" /></el-form-item>
                <el-form-item :label="t('mcp.stdio.command')"><el-input v-model="editingServer.command" /></el-form-item>
                <el-form-item :label="t('mcp.stdio.args')"><el-input v-model="editingServer.args" type="textarea" :rows="3" :placeholder="t('mcp.argsPlaceholder')" /></el-form-item>
                 <el-form-item :label="t('mcp.http.headers')"><el-input v-model="editingServer.headers" type="textarea" :rows="2" :placeholder="t('mcp.headersPlaceholder')" /></el-form-item>
                <el-form-item :label="t('mcp.stdio.env')"><el-input v-model="editingServer.env" type="textarea" :rows="2" :placeholder="t('mcp.envPlaceholder')" /></el-form-item>
                <el-form-item :label="t('mcp.inMemory.provider')"><el-input v-model="editingServer.provider" /></el-form-item>

                <el-divider>{{ t('mcp.advanced') }}</el-divider>
                <el-row :gutter="20">
                    <el-col :span="12"><el-form-item :label="t('mcp.registryUrl')"><el-input v-model="editingServer.registryUrl" /></el-form-item></el-col>
                    <el-col :span="12"><el-form-item :label="t('mcp.logoUrl')"><el-input v-model="editingServer.logoUrl" /></el-form-item></el-col>
                </el-row>
                <el-form-item :label="t('mcp.providerUrl')"><el-input v-model="editingServer.providerUrl" /></el-form-item>
                <el-form-item :label="t('mcp.tags')"><el-input v-model="editingServer.tags" :placeholder="t('mcp.tagsPlaceholder')" /></el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="showEditDialog = false">{{ t('common.cancel') }}</el-button>
                <el-button type="primary" @click="saveServer">{{ t('common.confirm') }}</el-button>
            </template>
        </el-dialog>

        <el-dialog v-model="showJsonDialog" :title="t('mcp.jsonDialog.title')" width="700px" :close-on-click-modal="false">
             <el-alert :title="t('mcp.jsonDialog.description')" type="warning" show-icon :closable="false" style="margin-bottom: 15px;" />
            <el-input v-model="jsonEditorContent" type="textarea" :rows="15" />
            <template #footer>
                <el-button @click="showJsonDialog = false">{{ t('common.cancel') }}</el-button>
                <el-button type="primary" @click="saveJson">{{ t('common.confirm') }}</el-button>
            </template>
        </el-dialog>
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

.content-wrapper {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 24px 90px 24px;
}

.empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    height: calc(100vh - 150px);
}

.mcp-grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
}

.mcp-card {
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    padding: 16px;
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
    display: -webkit-box;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.6;
}

.mcp-card-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 16px;
    gap: 12px;
}

.mcp-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex-grow: 1;
    min-width: 0;
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
    padding: 16px 24px;
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
</style>