<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createClient } from "webdav/web";
import { Refresh, Delete as DeleteIcon, ChatDotRound, Edit, Upload, Download, Switch, QuestionFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, ElProgress } from 'element-plus'

const { t } = useI18n();

// --- Component State ---
const activeView = ref('local');
const localChatPath = ref('');
const webdavConfig = ref(null);
const isWebdavConfigValid = ref(false);
const isCloudDataLoaded = ref(false);

const localChatFiles = ref([]);
const cloudChatFiles = ref([]);
const isTableLoading = ref(false);
const selectedFiles = ref([]);
const currentPage = ref(1);
const pageSize = ref(10);
const singleFileSyncing = ref({});

// --- Sync Progress State ---
const isSyncing = ref(false);
const syncProgress = ref(0);
const syncStatusText = ref('');
const syncAbortController = ref(null);

// --- Computed Properties ---
const getFileMap = (fileList) => new Map(fileList.map(f => [f.basename, f]));

const uploadableCount = computed(() => {
    if (!isWebdavConfigValid.value) return 0;
    const cloudMap = getFileMap(cloudChatFiles.value);
    return localChatFiles.value.filter(local => {
        const cloudFile = cloudMap.get(local.basename);
        return !cloudFile || new Date(local.lastmod) > new Date(cloudFile.lastmod);
    }).length;
});

const downloadableCount = computed(() => {
    if (!isWebdavConfigValid.value) return 0;
    const localMap = getFileMap(localChatFiles.value);
    return cloudChatFiles.value.filter(cloud => {
        const localFile = localMap.get(cloud.basename);
        return !localFile || new Date(cloud.lastmod) > new Date(localFile.lastmod);
    }).length;
});

const currentFiles = computed(() => activeView.value === 'local' ? localChatFiles.value : cloudChatFiles.value);
const paginatedFiles = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return currentFiles.value.slice(start, end);
});

// --- Helper Functions ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
};
const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024; const dm = decimals < 0 ? 0 : decimals; const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

onMounted(async () => {
    try {
        const result = await window.api.getConfig();
        if (result && result.config && result.config.webdav) {
            localChatPath.value = result.config.webdav.localChatPath;
            webdavConfig.value = result.config.webdav;
            isWebdavConfigValid.value = !!(webdavConfig.value.url && webdavConfig.value.data_path);
            if (localChatPath.value) await fetchLocalFiles();
        }
    } catch (error) { ElMessage.error(t('chats.alerts.configError')); }
});

watch(activeView, async (newView) => {
    if (newView === 'cloud' && !isCloudDataLoaded.value && isWebdavConfigValid.value) {
        await fetchCloudFiles();
        isCloudDataLoaded.value = true;
    }
});

// --- Main Functions ---
async function fetchLocalFiles() {
    if (!localChatPath.value) return;
    isTableLoading.value = true;
    try {
        localChatFiles.value = await window.api.listJsonFiles(localChatPath.value);
    } catch (error) { ElMessage.error(`读取本地文件列表失败: ${error.message}`); localChatFiles.value = []; } finally { isTableLoading.value = false; }
}

async function fetchCloudFiles() {
    if (!isWebdavConfigValid.value) return;
    isTableLoading.value = true;
    try {
        const { url, username, password, data_path } = webdavConfig.value;
        const client = createClient(url, { username, password });
        const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
        if (!(await client.exists(remoteDir))) await client.createDirectory(remoteDir, { recursive: true });
        const response = await client.getDirectoryContents(remoteDir, { details: true });
        cloudChatFiles.value = response.data.filter(item => item.type === 'file' && item.basename.endsWith('.json')).sort((a, b) => new Date(b.lastmod) - new Date(a.lastmod));
    } catch (error) { ElMessage.error(`${t('chats.alerts.fetchFailed')}: ${error.message}`); cloudChatFiles.value = []; } finally { isTableLoading.value = false; }
}
async function refreshData() {
    if (activeView.value === 'local') {
        if (localChatPath.value) {
            await fetchLocalFiles();
        }
    } else if (activeView.value === 'cloud') {
        if (isWebdavConfigValid.value) {
            await fetchCloudFiles();
            isCloudDataLoaded.value = true;
        }
    }
}
async function startChat(file) {
    ElMessage.info(t('chats.alerts.loadingChat'));
    try {
        let jsonString;
        if (activeView.value === 'local') {
            jsonString = await window.api.readLocalFile(file.path);
        } else {
            const { url, username, password, data_path } = webdavConfig.value;
            const client = createClient(url, { username, password });
            jsonString = await client.getFileContents(`${data_path.endsWith('/') ? data_path.slice(0, -1) : data_path}/${file.basename}`, { format: "text" });
        }
        await window.api.coderedirect(t('chats.alerts.restoreChat'), JSON.stringify({ sessionData: jsonString, filename: file.basename }));
        ElMessage.success(t('chats.alerts.restoreInitiated'));
    } catch (error) { ElMessage.error(`${t('chats.alerts.restoreFailed')}: ${error.message}`); }
}
async function renameFile(file) {
    const defaultInputValue = file.basename.endsWith('.json') ? file.basename.slice(0, -5) : file.basename;
    try {
        const { value: userInput } = await ElMessageBox.prompt(t('chats.rename.promptMessage'), t('chats.rename.promptTitle'), { inputValue: defaultInputValue });
        let finalFilename = (userInput || "").trim();
        if (!finalFilename.toLowerCase().endsWith('.json')) finalFilename += '.json';
        if (finalFilename === file.basename || finalFilename === '.json') return;

        if (activeView.value === 'local') {
            await window.api.renameLocalFile(file.path, `${localChatPath.value}/${finalFilename}`);
            if (isWebdavConfigValid.value && cloudChatFiles.value.some(f => f.basename === file.basename)) {
                const confirm = await ElMessageBox.confirm(
                    t('chats.rename.syncCloudConfirm'),
                    t('chats.rename.syncTitle'),
                    { type: 'info' }
                ).catch(() => false);
                if (confirm) {
                    const client = createClient(webdavConfig.value.url, { username: webdavConfig.value.username, password: webdavConfig.value.password });
                    await client.moveFile(`${webdavConfig.value.data_path}/${file.basename}`, `${webdavConfig.value.data_path}/${finalFilename}`);
                }
            }
        } else { // cloud
            const client = createClient(webdavConfig.value.url, { username: webdavConfig.value.username, password: webdavConfig.value.password });
            await client.moveFile(`${webdavConfig.value.data_path}/${file.basename}`, `${webdavConfig.value.data_path}/${finalFilename}`);
            if (localChatFiles.value.some(f => f.basename === file.basename)) {
                const confirm = await ElMessageBox.confirm(
                    t('chats.rename.syncLocalConfirm'),
                    t('chats.rename.syncTitle'),
                    { type: 'info' }
                ).catch(() => false);
                if (confirm) await window.api.renameLocalFile(`${localChatPath.value}/${file.basename}`, `${localChatPath.value}/${finalFilename}`);
            }
        }
        ElMessage.success(t('chats.alerts.renameSuccess'));
        await refreshData();
    } catch (error) {
        if (error !== 'cancel' && error !== 'close') ElMessage.error(`${t('chats.alerts.renameFailed')}: ${error.message}`);
    }
}
async function deleteFiles(filesToDelete) {
    if (filesToDelete.length === 0) {
        ElMessage.warning(t('common.noFileSelected'));
        return;
    }

    try {
        await ElMessageBox.confirm(t('common.confirmDeleteMultiple', { count: filesToDelete.length }), t('common.warningTitle'), { type: 'warning' });

        let syncDeletions = false;

        if (isWebdavConfigValid.value && localChatPath.value) {
            const localMap = new Map(localChatFiles.value.map(f => [f.basename, f]));
            const cloudMap = new Map(cloudChatFiles.value.map(f => [f.basename, f]));

            const counterpartFiles = filesToDelete.filter(file => {
                return activeView.value === 'local' ? cloudMap.has(file.basename) : localMap.has(file.basename);
            });

            if (counterpartFiles.length > 0) {
                const location = activeView.value === 'local' ? t('chats.view.cloud') : t('chats.view.local');
                try {
                    await ElMessageBox.confirm(
                        t('chats.alerts.confirmSyncDeleteMessage', { count: counterpartFiles.length, location: location }),
                        t('chats.alerts.confirmSyncDeleteTitle'),
                        { type: 'info' }
                    );
                    syncDeletions = true;
                } catch (e) {
                    syncDeletions = false;
                }
            }
        }

        isTableLoading.value = true;
        const client = isWebdavConfigValid.value ? createClient(webdavConfig.value.url, { username: webdavConfig.value.username, password: webdavConfig.value.password }) : null;

        for (const file of filesToDelete) {
            if (activeView.value === 'local') {
                await window.api.deleteLocalFile(file.path);
                if (syncDeletions && client && cloudChatFiles.value.some(f => f.basename === file.basename)) {
                    await client.deleteFile(`${webdavConfig.value.data_path}/${file.basename}`);
                }
            } else { // cloud view
                if (client) {
                    await client.deleteFile(`${webdavConfig.value.data_path}/${file.basename}`);
                    if (syncDeletions && localChatFiles.value.some(f => f.basename === file.basename)) {
                        await window.api.deleteLocalFile(`${localChatPath.value}/${file.basename}`);
                    }
                }
            }
        }

        ElMessage.success(t('common.deleteSuccessMultiple'));
        await refreshData();
        selectedFiles.value = [];

    } catch (error) {
        if (error !== 'cancel' && error !== 'close') {
            ElMessage.error(`${t('common.deleteFailedMultiple')}: ${error.message}`);
        }
    } finally {
        isTableLoading.value = false;
    }
}
const handleSelectionChange = (val) => selectedFiles.value = val;

const cancelSync = () => {
    if (syncAbortController.value) {
        syncAbortController.value.abort();
    }
};

async function runConcurrentTasks(tasks, signal, concurrencyLimit = 3) {
    const results = { completed: 0, failed: 0, failedFiles: [] };
    const queue = [...tasks];

    const worker = async () => {
        while (queue.length > 0) {
            if (signal.aborted) throw new Error("Cancelled");
            const task = queue.shift();
            try {
                await task.action(signal);
                results.completed++;
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw new Error("Cancelled");
                }
                results.failed++;
                results.failedFiles.push(task.name);
                console.error(`Task failed for ${task.name}:`, error);
            } finally {
                if (!signal.aborted) {
                    syncProgress.value = Math.round(((results.completed + results.failed) / tasks.length) * 100);
                    syncStatusText.value = t('chats.alerts.syncProcessing', { completed: results.completed + results.failed, total: tasks.length });
                }
            }
        }
    };

    const workers = Array(concurrencyLimit).fill(null).map(worker);
    await Promise.all(workers);
    return results;
}

async function intelligentUpload() {
    if (!isWebdavConfigValid.value) return ElMessage.warning(t('chats.alerts.webdavRequired'));
    const filesToUpload = localChatFiles.value.filter(local => {
        const cloudFile = getFileMap(cloudChatFiles.value).get(local.basename);
        return !cloudFile || new Date(local.lastmod) > new Date(cloudFile.lastmod);
    });
    if (filesToUpload.length === 0) return ElMessage.info(t('chats.alerts.syncNoUpload'));

    try {
        await ElMessageBox.confirm(
            t('chats.tooltips.uploadChanges', { count: filesToUpload.length }) + ' ' + t('chats.alerts.continueConfirm'),
            t('chats.alerts.syncConfirmUploadTitle'),
            { type: 'info' }
        );
        const tasks = filesToUpload.map(file => ({ name: file.basename, action: (signal) => forceSyncFile(file.basename, 'upload', signal) }));
        await executeSync(tasks, t('chats.alerts.syncConfirmUploadTitle'));
    } catch (error) {
        if (error === 'cancel' || error === 'close') return;
        ElMessage.error(`${error.message}`);
    }
}

async function intelligentDownload() {
    if (!localChatPath.value) return ElMessage.warning(t('chats.alerts.localPathRequired'));
    const filesToDownload = cloudChatFiles.value.filter(cloud => {
        const localFile = getFileMap(localChatFiles.value).get(cloud.basename);
        return !localFile || new Date(cloud.lastmod) > new Date(localFile.lastmod);
    });
    if (filesToDownload.length === 0) return ElMessage.info(t('chats.alerts.syncNoDownload'));

    try {
        await ElMessageBox.confirm(
            t('chats.tooltips.downloadChanges', { count: filesToDownload.length }) + ' ' + t('chats.alerts.continueConfirm'),
            t('chats.alerts.syncConfirmDownloadTitle'),
            { type: 'info' }
        );
        const tasks = filesToDownload.map(file => ({ name: file.basename, action: (signal) => forceSyncFile(file.basename, 'download', signal) }));
        await executeSync(tasks, t('chats.alerts.syncConfirmDownloadTitle'));
    } catch (error) {
        if (error === 'cancel' || error === 'close') return;
        ElMessage.error(`${error.message}`);
    }
}

async function executeSync(tasks, title) {
    isSyncing.value = true;
    syncProgress.value = 0;
    syncAbortController.value = new AbortController();
    syncStatusText.value = title === t('chats.alerts.syncConfirmUploadTitle') ? t('chats.alerts.syncPreparingUpload') : t('chats.alerts.syncPreparingDownload');

    try {
        const results = await runConcurrentTasks(tasks, syncAbortController.value.signal);
        let message = title === t('chats.alerts.syncConfirmUploadTitle') ? t('chats.alerts.syncSuccessUpload', { count: results.completed }) : t('chats.alerts.syncSuccessDownload', { count: results.completed });
        if (results.failed > 0) message += ` ${t('chats.alerts.syncFailedPartially', { failedCount: results.failed })}`;
        ElMessage.success(message);
        await refreshData();
    } catch (error) {
        if (error.message === 'Cancelled') {
            ElMessage.warning(t('chats.alerts.syncCancelled'));
        } else {
            ElMessage.error(t('chats.alerts.syncFailed', { message: error.message }));
        }
    } finally {
        isSyncing.value = false;
        syncAbortController.value = null;
    }
}

async function forceSyncFile(basename, direction, signal) {
    singleFileSyncing.value[basename] = true;
    try {
        const client = createClient(webdavConfig.value.url, { username: webdavConfig.value.username, password: webdavConfig.value.password });
        const remotePath = `${webdavConfig.value.data_path}/${basename}`;
        const localPath = `${localChatPath.value}/${basename}`;

        if (direction === 'upload') {
            const localFile = localChatFiles.value.find(f => f.basename === basename);
            if (!localFile) throw new Error(`本地文件 "${basename}" 未找到`);

            const content = await window.api.readLocalFile(localPath, signal);
            await client.putFileContents(remotePath, content, { overwrite: true, signal });

            await client.customRequest(remotePath, {
                method: "PROPPATCH",
                headers: { "Content-Type": "application/xml" },
                data: `<?xml version="1.0"?>
                       <d:propertyupdate xmlns:d="DAV:">
                         <d:set>
                           <d:prop>
                             <lastmodified xmlns="DAV:">${new Date(localFile.lastmod).toUTCString()}</lastmodified>
                           </d:prop>
                         </d:set>
                       </d:propertyupdate>`,
                signal
            });

        } else { // download
            const cloudFile = cloudChatFiles.value.find(f => f.basename === basename);
            if (!cloudFile) throw new Error(`云端文件 "${basename}" 未找到`);

            const content = await client.getFileContents(remotePath, { format: 'text', signal });
            await window.api.writeLocalFile(localPath, content, signal);

            await window.api.setFileMtime(localPath, cloudFile.lastmod);
        }
    } catch (error) {
        if (error.name === 'AbortError') throw new Error("Cancelled");
        ElMessage.error(`同步文件 "${basename}" 失败: ${error.message}`);
        throw error;
    } finally {
        singleFileSyncing.value[basename] = false;
    }
}
</script>

<template>
    <div class="chats-page-container">
        <div class="chats-content-wrapper">
            <div class="info-button-container">
                <el-popover placement="bottom-start" :title="t('chats.info.title')" :width="450" trigger="click">
                    <template #reference>
                        <el-button :icon="QuestionFilled" circle />
                    </template>
                    <div class="info-popover-content">
                        <p v-html="t('chats.info.localDesc', { path: localChatPath || t('chats.info.pathNotSet') })">
                        </p>
                        <p v-html="t('chats.info.cloudDesc')"></p>
                    </div>
                </el-popover>
            </div>
            <div class="sync-buttons-container">
                <el-tooltip :content="t('chats.tooltips.uploadChanges', { count: uploadableCount })" placement="bottom">
                    <el-badge :value="uploadableCount" :hidden="uploadableCount === 0" type="primary">
                        <el-button :icon="Upload" @click="intelligentUpload" circle
                            :disabled="!isWebdavConfigValid || !localChatPath" />
                    </el-badge>
                </el-tooltip>
                <el-tooltip :content="t('chats.tooltips.downloadChanges', { count: downloadableCount })"
                    placement="bottom">
                    <el-badge :value="downloadableCount" :hidden="downloadableCount === 0" type="success">
                        <el-button :icon="Download" @click="intelligentDownload" circle
                            :disabled="!isWebdavConfigValid || !localChatPath" />
                    </el-badge>
                </el-tooltip>
            </div>
            <div class="view-selector">
                <el-radio-group v-model="activeView" @change="currentPage = 1">
                    <el-radio-button value="local">{{ t('chats.view.local') }}</el-radio-button>
                    <el-radio-button value="cloud" :disabled="!isWebdavConfigValid">{{ t('chats.view.cloud') }}</el-radio-button>
                </el-radio-group>
            </div>

            <div class="table-container">
                <div v-if="activeView === 'local' && !localChatPath" class="config-prompt-small">
                    <el-empty :description="t('chats.configRequired.localPathDescription')">
                        <template #image>
                            <el-icon :size="50" color="#909399">
                                <Edit />
                            </el-icon>
                        </template>
                    </el-empty>
                </div>

                <div v-else-if="activeView === 'cloud' && !isWebdavConfigValid" class="config-prompt-small">
                    <el-empty :description="t('chats.configRequired.webdavDescription')">
                        <template #image>
                            <el-icon :size="50" color="#909399">
                                <Edit />
                            </el-icon>
                        </template>
                    </el-empty>
                </div>

                <el-table v-else :data="paginatedFiles" v-loading="isTableLoading"
                    @selection-change="handleSelectionChange" style="width: 100%" height="100%" border stripe>
                    <el-table-column type="selection" width="50" align="center" />
                    <el-table-column prop="basename" :label="t('chats.table.filename')" sortable show-overflow-tooltip
                        min-width="120">
                        <template #default="scope">
                            <span class="filename-text">{{ scope.row.basename.endsWith('.json') ?
                                scope.row.basename.slice(0, -5) : scope.row.basename }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column prop="lastmod" :label="t('chats.table.modifiedTime')" width="160" sortable
                        align="center">
                        <template #default="scope">{{ formatDate(scope.row.lastmod) }}</template>
                    </el-table-column>
                    <el-table-column prop="size" :label="t('chats.table.size')" width="90" sortable align="center">
                        <template #default="scope">{{ formatBytes(scope.row.size) }}</template>
                    </el-table-column>
                    <el-table-column :label="t('chats.table.actions')" width="300" align="center">
                        <template #default="scope">
                            <div class="action-buttons-container">
                                <el-button link type="primary" :icon="ChatDotRound" @click="startChat(scope.row)">{{
                                    t('chats.actions.chat') }}</el-button>
                                <el-divider direction="vertical" />
                                <el-tooltip
                                    :content="activeView === 'local' ? t('chats.tooltips.forceUpload') : t('chats.tooltips.forceDownload')"
                                    placement="top">
                                    <el-button link type="primary" :icon="Switch"
                                        @click="forceSyncFile(scope.row.basename, activeView === 'local' ? 'upload' : 'download')"
                                        :loading="singleFileSyncing[scope.row.basename]">
                                        {{ t('chats.actions.forceSync') }}
                                    </el-button>
                                </el-tooltip>
                                <el-divider direction="vertical" />
                                <el-button link type="warning" :icon="Edit" @click="renameFile(scope.row)">{{
                                    t('chats.actions.rename') }}</el-button>
                                <el-divider direction="vertical" />
                                <el-button link type="danger" :icon="DeleteIcon" @click="deleteFiles([scope.row])">{{
                                    t('chats.actions.delete') }}</el-button>
                            </div>
                        </template>
                    </el-table-column>
                </el-table>
            </div>

            <div class="footer-bar">
                <div class="footer-left">
                    <el-button :icon="Refresh" @click="refreshData">{{ t('common.refresh') }}</el-button>
                    <el-button type="danger" :icon="DeleteIcon" @click="deleteFiles(selectedFiles)"
                        :disabled="selectedFiles.length === 0">
                        {{ t('common.deleteSelected') }} ({{ selectedFiles.length }})
                    </el-button>
                </div>
                <div class="footer-center">
                    <el-pagination v-if="currentFiles.length > 0" v-model:current-page="currentPage"
                        v-model:page-size="pageSize" :page-sizes="[10, 20, 50, 100]" :total="currentFiles.length"
                        layout="total, sizes, prev, pager, next, jumper" background size="small" />
                </div>
                <div class="footer-right">
                </div>
            </div>
        </div>
    </div>
    <el-dialog v-model="isSyncing" :title="t('chats.alerts.syncInProgress')" :close-on-click-modal="false"
        :show-close="false" :close-on-press-escape="false" width="400px" center>
        <div class="sync-progress-container">
            <el-progress :percentage="syncProgress" :stroke-width="10" striped striped-flow />
            <p class="sync-status-text">{{ syncStatusText }}</p>
        </div>
        <template #footer>
            <el-button @click="cancelSync">{{ t('common.cancel') }}</el-button>
        </template>
    </el-dialog>
</template>

<style scoped>
.view-selector {
    padding: 5px 15px 0px 0px;
    text-align: center;
}

.chats-page-container {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    padding: 21px;
    box-sizing: border-box;
    overflow: hidden;
    background-color: var(--bg-primary);
}

.config-prompt {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    height: 100%;
    text-align: center;
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    box-shadow: 0 0 0 1px var(--border-primary);
}

.config-prompt-title {
    font-size: 18px;
    color: var(--text-primary);
    margin-top: 0;
    margin-bottom: 8px;
    font-weight: 600;
}

:deep(.el-empty__description p) {
    color: var(--text-secondary);
    font-size: 14px;
}

.chats-content-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    box-shadow: 0 0 0 1px var(--border-primary), var(--shadow-sm);
    overflow: hidden;
}

.table-container {
    flex-grow: 1;
    overflow: hidden;
    padding: 5px 10px 10px 10px;
}

.filename-text {
    font-weight: 600;
    color: var(--text-primary);
}

:deep(.el-table),
:deep(.el-table__expanded-cell) {
    background-color: transparent;
}

:deep(.el-table .el-table__cell) {
    color: var(--text-secondary);
}

:deep(.el-table tr) {
    background-color: transparent;
    transition: background-color 0.2s;
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
    background-color: var(--bg-primary);
}

:deep(.el-table--enable-row-hover .el-table__body tr:hover>td.el-table__cell) {
    background-color: var(--bg-tertiary);
}

:deep(.el-table__header-wrapper th) {
    background-color: var(--bg-primary) !important;
    color: var(--text-secondary);
    font-weight: 600;
}

:deep(.el-table__border-left-patch) {
    border-left: 1px solid var(--border-primary);
}

:deep(.el-table__border-right-patch) {
    border-left: 1px solid var(--border-primary);
}

:deep(.el-table--border .el-table__inner-wrapper::after),
:deep(.el-table--border::after),
:deep(.el-table--border::before),
:deep(.el-table__inner-wrapper::before) {
    background-color: var(--border-primary);
}

:deep(.el-table td.el-table__cell),
:deep(.el-table th.el-table__cell.is-leaf) {
    border-bottom: 1px solid var(--border-primary);
    color: var(--text-primary);
}

:deep(.el-table--border .el-table__cell) {
    border-right: 1px solid var(--border-primary);
}

:deep(.el-table__empty-text) {
    color: var(--text-tertiary);
}

.action-buttons-container {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0;
}

.action-buttons-container .el-button {
    font-weight: 500;
}

.action-buttons-container .el-divider--vertical {
    height: 1em;
    border-left: 1px solid var(--border-primary);
    margin: 0 8px;
}

.footer-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 15px;
    border-top: 1px solid var(--border-primary);
    background-color: var(--bg-primary);
    flex-shrink: 0;
}

.footer-left,
.footer-right {
    display: flex;
    align-items: center;
    gap: 10px;
}

.footer-center {
    flex-grow: 1;
    display: flex;
    justify-content: center;
}

.footer-right {
    justify-content: flex-end;
}

:deep(.el-pagination) {
    --el-pagination-text-color: var(--text-secondary);
}

:deep(.el-pagination.is-background .el-pager li),
:deep(.el-pagination.is-background .btn-prev),
:deep(.el-pagination.is-background .btn-next) {
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
}

:deep(.el-pagination.is-background .el-pager li:not(.is-disabled).is-active) {
    background-color: var(--bg-accent);
    color: var(--text-on-accent);
}

:deep(.el-pagination.is-background .el-pager li:hover) {
    color: var(--text-accent);
}

:deep(.el-pagination.is-background .btn-prev:hover),
:deep(.el-pagination.is-background .btn-next:hover) {
    color: var(--text-accent);
}

.config-prompt-small {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
}

.sync-progress-container {
    padding: 20px;
    text-align: center;
}

.sync-status-text {
    margin-top: 15px;
    color: var(--text-secondary);
}

.sync-buttons-container {
    position: absolute;
    top: 8px;
    /* 根据视觉效果微调 */
    right: 20px;
    z-index: 10;
    /* 确保在表格之上 */
    display: flex;
    gap: 8px;
}

.sync-buttons-container .el-button {
    width: 32px;
    height: 32px;
}

.sync-buttons-container :deep(.el-badge__content) {
    font-size: 10px;
    padding: 0 5px;
    height: 16px;
    line-height: 16px;
    min-width: 16px;
    border-width: 1px;
    /* 调整位置 */
    transform: translateY(-50%) translateX(70%);
}

/* 修复深色模式下 primary 徽章的颜色 */
html.dark .sync-buttons-container :deep(.el-badge__content--primary) {
    background-color: var(--el-color-primary);
    color: var(--bg-primary);
    /* 使用深色背景作为文字颜色 */
}

.info-button-container {
    position: absolute;
    top: 8px;
    left: 20px;
    z-index: 10;
}

.info-button-container .el-button {
    width: 32px;
    height: 32px;
}

/* 弹出框内容的样式 */
.info-popover-content p {
    margin: 0 0 8px 0;
    line-height: 1.6;
    color: var(--text-secondary);
}

.info-popover-content p:last-child {
    margin-bottom: 0;
}

.info-popover-content strong {
    color: var(--text-primary);
}

.info-popover-content code {
    background-color: var(--bg-tertiary);
    color: var(--el-color-primary);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
    word-break: break-all;
}
</style>