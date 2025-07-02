<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { createClient } from "webdav/web";
import { Refresh, Delete as DeleteIcon, ChatDotRound, Edit } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n();

// --- Component State ---
const webdavConfig = ref(null);
const isConfigValid = ref(false);
const chatFiles = ref([]);
const isTableLoading = ref(false);
const selectedFiles = ref([]);
const currentPage = ref(1);
const pageSize = ref(10);

// --- Computed Properties ---
const paginatedFiles = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return chatFiles.value.slice(start, end);
});

// --- Helper Functions ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
};

const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// --- Lifecycle Hook ---
onMounted(async () => {
    try {
        const result = await window.api.getConfig();
        if (result && result.config && result.config.webdav) {
            webdavConfig.value = result.config.webdav;
            if (webdavConfig.value.url && webdavConfig.value.data_path) {
                isConfigValid.value = true;
                await nextTick();
                await fetchChatFiles();
            }
        }
    } catch (error) {
        console.error("Error fetching config in Chats.vue:", error);
        ElMessage.error(t('chats.alerts.configError'));
    }
});

// --- Main Functions ---
async function fetchChatFiles() {
    if (!isConfigValid.value) return;
    isTableLoading.value = true;
    const { url, username, password, data_path } = webdavConfig.value;

    try {
        const client = createClient(url, { username, password });
        const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;

        // [MODIFIED] Check if the directory exists, and create it if it doesn't.
        if (!(await client.exists(remoteDir))) {
            await client.createDirectory(remoteDir, { recursive: true });
            ElMessage.info(t('chats.alerts.pathCreated'));
        }

        const response = await client.getDirectoryContents(remoteDir, { details: true });
        chatFiles.value = response.data
            .filter(item => item.type === 'file' && item.basename.endsWith('.json'))
            .sort((a, b) => new Date(b.lastmod) - new Date(a.lastmod));

    } catch (error) {
        console.error("Failed to fetch or create chat files:", error);
        ElMessage.error(`${t('chats.alerts.fetchFailed')}: ${error.message}`);
        chatFiles.value = [];
    } finally {
        isTableLoading.value = false;
    }
}

/**
 * Placeholder function for restoring a chat session.
 * This function should be implemented to handle the chat data.
 * @param {object} chatJsonData The parsed JSON data from the chat file.
 */
async function startChatWithHistory(jsonString) {
    await window.api.coderedirect("恢复聊天", jsonString);
    ElMessage.success(t('chats.alerts.restoreInitiated'));
}

async function startChat(file) {
    ElMessage.info(t('chats.alerts.loadingChat'));
    const { url, username, password, data_path } = webdavConfig.value;
    try {
        const client = createClient(url, { username, password });
        const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
        const remoteFilePath = `${remoteDir}/${file.basename}`;
        const jsonString = await client.getFileContents(remoteFilePath, { format: "text" });

        await startChatWithHistory(jsonString);

    } catch (error) {
        console.error("Failed to start chat:", error);
        ElMessage.error(`${t('chats.alerts.restoreFailed')}: ${error.message}`);
    }
}

async function renameFile(file) {
    try {
        const { value: newFilename } = await ElMessageBox.prompt(
            t('chats.rename.promptMessage'),
            t('chats.rename.promptTitle'),
            {
                confirmButtonText: t('common.confirm'),
                cancelButtonText: t('common.cancel'),
                inputValue: file.basename,
                inputValidator: (val) => val && val.endsWith('.json'),
                inputErrorMessage: t('chats.rename.invalidFilename'),
            }
        );

        if (newFilename && newFilename !== file.basename) {
            const { url, username, password, data_path } = webdavConfig.value;
            const client = createClient(url, { username, password });
            const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
            await client.moveFile(`${remoteDir}/${file.basename}`, `${remoteDir}/${newFilename}`);
            ElMessage.success(t('chats.alerts.renameSuccess'));
            await fetchChatFiles();
        }
    } catch (error) {
        if (error !== 'cancel' && error !== 'close') {
            console.error("Failed to rename file:", error);
            ElMessage.error(`${t('chats.alerts.renameFailed')}: ${error.message}`);
        }
    }
}

async function deleteFile(file) {
    try {
        await ElMessageBox.confirm(
            t('chats.confirmDelete', { filename: file.basename }),
            t('common.warningTitle'),
            { type: 'warning' }
        );

        const { url, username, password, data_path } = webdavConfig.value;
        const client = createClient(url, { username, password });
        const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
        await client.deleteFile(`${remoteDir}/${file.basename}`);
        ElMessage.success(t('common.deleteSuccess'));
        await fetchChatFiles();
    } catch (error) {
        if (error !== 'cancel' && error !== 'close') {
            console.error("Failed to delete file:", error);
            ElMessage.error(`${t('common.deleteFailed')}: ${error.message}`);
        }
    }
}

async function deleteSelectedFiles() {
    if (selectedFiles.value.length === 0) {
        ElMessage.warning(t('common.noFileSelected'));
        return;
    }

    try {
        await ElMessageBox.confirm(
            t('common.confirmDeleteMultiple', { count: selectedFiles.value.length }),
            t('common.warningTitle'),
            { type: 'warning' }
        );

        const { url, username, password, data_path } = webdavConfig.value;
        const client = createClient(url, { username, password });
        const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;

        const deletePromises = selectedFiles.value.map(file =>
            client.deleteFile(`${remoteDir}/${file.basename}`)
        );

        await Promise.all(deletePromises);
        ElMessage.success(t('common.deleteSuccessMultiple'));
        await fetchChatFiles();
    } catch (error) {
        if (error !== 'cancel' && error !== 'close') {
            console.error("Failed to delete selected files:", error);
            ElMessage.error(`${t('common.deleteFailedMultiple')}: ${error.message}`);
        }
    }
}

const handleSelectionChange = (val) => {
    selectedFiles.value = val;
};
</script>

<template>
    <div class="chats-page-container">
        <div v-if="!isConfigValid" class="config-prompt">
            <el-empty :description="t('chats.configRequired.description')">
                <template #image>
                    <el-icon :size="64">
                        <Edit />
                    </el-icon>
                </template>
                <h1>{{ t('chats.configRequired.title') }}</h1>
            </el-empty>
        </div>

        <div v-else class="chats-content-wrapper">
            <div class="table-container">
                <el-table :data="paginatedFiles" v-loading="isTableLoading" @selection-change="handleSelectionChange"
                    style="width: 100%" height="100%" border stripe>
                    <el-table-column type="selection" width="40" align="center" />
                    <el-table-column prop="basename" :label="t('chats.table.filename')" sortable show-overflow-tooltip
                        min-width="190" />
                    <el-table-column prop="lastmod" :label="t('chats.table.modifiedTime')" width="140" sortable>
                        <template #default="scope">{{ formatDate(scope.row.lastmod) }}</template>
                    </el-table-column>
                    <el-table-column prop="size" :label="t('chats.table.size')" width="90" sortable>
                        <template #default="scope">{{ formatBytes(scope.row.size) }}</template>
                    </el-table-column>
                    <el-table-column :label="t('chats.table.actions')" width="200" align="center">
                        <template #default="scope">
                            <div class="action-buttons-container">
                                <el-button link type="primary" :icon="ChatDotRound" @click="startChat(scope.row)">{{
                                    t('chats.actions.chat') }}</el-button>
                                <el-button link type="warning" :icon="Edit" @click="renameFile(scope.row)">{{
                                    t('chats.actions.rename') }}</el-button>
                                <el-button link type="danger" :icon="DeleteIcon" @click="deleteFile(scope.row)">{{
                                    t('chats.actions.delete') }}</el-button>
                            </div>
                        </template>
                    </el-table-column>
                </el-table>
            </div>

            <div class="footer-bar">
                <div class="footer-left">
                    <el-button :icon="Refresh" @click="fetchChatFiles">{{ t('common.refresh') }}</el-button>
                    <el-button type="danger" :icon="DeleteIcon" @click="deleteSelectedFiles"
                        :disabled="selectedFiles.length === 0">
                        {{ t('common.deleteSelected') }} ({{ selectedFiles.length }})
                    </el-button>
                </div>
                <div class="footer-center">
                    <el-pagination v-if="chatFiles.length > 0" v-model:current-page="currentPage"
                        v-model:page-size="pageSize" :page-sizes="[10, 20, 50, 100]" :total="chatFiles.length"
                        layout="total, sizes, prev, pager, next" background size="small" />
                </div>
                <div class="footer-right">
                    <!-- Placeholder for potential future buttons -->
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.chats-page-container {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    padding: 10px;
    box-sizing: border-box;
}

.config-prompt {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    text-align: center;
}

.config-prompt h1 {
    font-size: 18px;
    color: #606266;
    margin-top: -20px;
    /* Adjust to be closer to empty description */
}

.chats-content-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background-color: #ffffff;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    overflow: hidden;
}

.table-container {
    flex-grow: 1;
    overflow: hidden;
    /* Important for table height to work */
    padding: 10px;
}

.action-buttons-container {
    display: flex;
    justify-content: center;
    gap: 8px;
}

.action-buttons-container .el-button {
    margin-left: 0;
}

.footer-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 15px;
    border-top: 1px solid #e5e7eb;
    background-color: #fcfcfc;
}

.footer-left,
.footer-right {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 200px;
}

.footer-center {
    flex-grow: 1;
    display: flex;
    justify-content: center;
}

.footer-right {
    justify-content: flex-end;
}

:deep(.el-pagination.is-background.el-pagination--small) {
    justify-content: center;
}

:deep(.el-table__header-wrapper th) {
    background-color: #fafafa !important;
    color: #333;
}
</style>