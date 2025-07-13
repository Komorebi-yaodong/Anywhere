<script setup>
import { ref, onMounted, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { createClient } from "webdav/web";
import { Upload, FolderOpened, Refresh, Delete as DeleteIcon, Download } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t, locale } = useI18n()

const currentConfig = ref(window.api.defaultConfig.config);
const selectedLanguage = ref(locale.value);


// --- 备份管理器状态 ---
const isBackupManagerVisible = ref(false);
const backupFiles = ref([]);
const isTableLoading = ref(false);
const selectedFiles = ref([]);
const currentPage = ref(1);
const pageSize = ref(10);

// --- 计算属性用于分页 ---
const paginatedFiles = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return backupFiles.value.slice(start, end);
});

// --- 辅助函数 ---
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString();
};

const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};


// --- 生命周期和配置函数 ---
onMounted(async () => {
  try {
    const result = await window.api.getConfig();
    if (result && result.config) {
      const baseConfig = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
      const finalConfig = Object.assign({}, baseConfig, result.config);

      Object.keys(finalConfig).forEach(key => {
        currentConfig.value[key] = finalConfig[key];
      });

    } else {
      console.error("Failed to get valid config from API.");
      currentConfig.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
    }
  } catch (error) {
    console.error("Error fetching config in Setting.vue:", error);
    currentConfig.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
  }
  selectedLanguage.value = locale.value;
  await nextTick();
});

async function saveConfig() {
  try {
    const new_config = { config: JSON.parse(JSON.stringify(currentConfig.value)) };
    if (window.api && window.api.updateConfig) {
      await window.api.updateConfig(new_config);
    } else {
      console.warn("window.api.updateConfig is not available. Settings not saved.");
    }
  } catch (error) {
    console.error("Error saving settings config:", error);
  }
}

function handleLanguageChange(lang) {
  locale.value = lang;
  localStorage.setItem('language', lang);
  selectedLanguage.value = lang;
}

async function exportConfig() {
  try {
    const configToExport = JSON.parse(JSON.stringify(currentConfig.value));
    const jsonString = JSON.stringify(configToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Anywhere_config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("Configuration exported successfully.");
  } catch (error) {
    console.error("Error exporting config:", error);
  }
}

function importConfig() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const importedData = JSON.parse(e.target.result);
          if (typeof importedData !== 'object' || importedData === null) {
            throw new Error("Imported file is not a valid configuration object.");
          }
          const baseConfig = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
          const finalConfig = Object.assign({}, baseConfig, importedData);
          currentConfig.value = finalConfig;
          await saveConfig();
          await nextTick();
          console.log("Configuration imported and replaced successfully.");
          ElMessage.success(t('setting.alerts.importSuccess'));
        } catch (err) {
          console.error("Error importing configuration:", err);
          ElMessage.error(t('setting.alerts.importFailed'));
        }
      };
      reader.readAsText(file);
    }
  };
  input.click();
}


// --- WebDAV 功能 ---
async function backupToWebdav() {
  const { url, username, password, path } = currentConfig.value.webdav;
  if (!url) {
    ElMessage.error(t('setting.webdav.alerts.urlRequired'));
    return;
  }

  const now = new Date();
  const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
  const defaultFilename = `Anywhere-${timestamp}.json`;

  try {
    const { value: filename } = await ElMessageBox.prompt(
      t('setting.webdav.backup.confirmMessage'),
      t('setting.webdav.backup.confirmTitle'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        inputValue: defaultFilename,
        inputValidator: (val) => val && val.endsWith('.json'),
        inputErrorMessage: t('setting.webdav.backup.invalidFilename'),
      }
    );

    if (filename) {
      try {
        ElMessage.info(t('setting.webdav.alerts.backupInProgress'));
        const client = createClient(url, { username, password });
        const remoteDir = path.endsWith('/') ? path.slice(0, -1) : path;
        const remoteFilePath = `${remoteDir}/${filename}`;

        if (!(await client.exists(remoteDir))) {
          await client.createDirectory(remoteDir, { recursive: true });
        }

        const configToBackup = JSON.parse(JSON.stringify(currentConfig.value));
        const jsonString = JSON.stringify(configToBackup, null, 2);
        await client.putFileContents(remoteFilePath, jsonString, { overwrite: true });

        ElMessage.success(t('setting.webdav.alerts.backupSuccess'));
      } catch (error) {
        console.error("WebDAV backup failed:", error);
        ElMessage.error(`${t('setting.webdav.alerts.backupFailed')}: ${error.message}`);
      }
    }
  } catch (action) {
    if (action === 'cancel') {
      ElMessage.info(t('setting.webdav.backup.cancelled'));
    }
  }
}

async function openBackupManager() {
  const { url } = currentConfig.value.webdav;
  if (!url) {
    ElMessage.error(t('setting.webdav.alerts.urlRequired'));
    return;
  }
  isBackupManagerVisible.value = true;
  await fetchBackupFiles();
}

async function fetchBackupFiles() {
  isTableLoading.value = true;
  const { url, username, password, path } = currentConfig.value.webdav;
  try {
    const client = createClient(url, { username, password });
    const remoteDir = path.endsWith('/') ? path.slice(0, -1) : path;

    if (!(await client.exists(remoteDir))) {
      backupFiles.value = [];
      ElMessage.warning(t('setting.webdav.manager.pathNotFound'));
      return;
    }

    const response = await client.getDirectoryContents(remoteDir, { details: true });
    const contents = response.data;

    if (!Array.isArray(contents)) {
      console.error("Failed to fetch backup files: WebDAV response.data is not an array.", response);
      ElMessage.error(t('setting.webdav.manager.fetchFailed') + ': Invalid response structure from server');
      backupFiles.value = [];
      return;
    }

    backupFiles.value = contents
      .filter(item => item.type === 'file' && item.basename.endsWith('.json'))
      .sort((a, b) => new Date(b.lastmod) - new Date(a.lastmod));

  } catch (error) {
    console.error("Failed to fetch backup files:", error);
    let errorMessage = error.message;
    if (error.response && error.response.statusText) {
      errorMessage = `${error.response.status} ${error.response.statusText}`;
    }
    ElMessage.error(`${t('setting.webdav.manager.fetchFailed')}: ${errorMessage}`);
    backupFiles.value = [];
  } finally {
    isTableLoading.value = false;
  }
}

async function restoreFromWebdav(file) {
  try {
    await ElMessageBox.confirm(
      t('setting.webdav.manager.confirmRestore', { filename: file.basename }),
      t('common.warningTitle'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    );

    ElMessage.info(t('setting.webdav.alerts.restoreInProgress'));
    const { url, username, password, path } = currentConfig.value.webdav;
    const client = createClient(url, { username, password });
    const remoteDir = path.endsWith('/') ? path.slice(0, -1) : path;
    const remoteFilePath = `${remoteDir}/${file.basename}`;

    const jsonString = await client.getFileContents(remoteFilePath, { format: "text" });
    const importedData = JSON.parse(jsonString);

    if (typeof importedData !== 'object' || importedData === null) {
      throw new Error("Downloaded file is not a valid configuration object.");
    }

    const baseConfig = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
    const finalConfig = Object.assign({}, baseConfig, importedData);

    currentConfig.value = finalConfig;
    await saveConfig();
    await nextTick();

    ElMessage.success(t('setting.webdav.alerts.restoreSuccess'));
    isBackupManagerVisible.value = false;

  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      console.error("WebDAV restore failed:", error);
      ElMessage.error(`${t('setting.webdav.alerts.restoreFailed')}: ${error.message}`);
    }
  }
}

async function deleteFile(file) {
  try {
    await ElMessageBox.confirm(
      t('setting.webdav.manager.confirmDelete', { filename: file.basename }),
      t('common.warningTitle'),
      { type: 'warning' }
    );

    const { url, username, password, path } = currentConfig.value.webdav;
    const client = createClient(url, { username, password });
    const remoteDir = path.endsWith('/') ? path.slice(0, -1) : path;
    const remoteFilePath = `${remoteDir}/${file.basename}`;

    await client.deleteFile(remoteFilePath);
    ElMessage.success(t('setting.webdav.manager.deleteSuccess'));
    await fetchBackupFiles();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      console.error("Failed to delete file:", error);
      ElMessage.error(`${t('setting.webdav.manager.deleteFailed')}: ${error.message}`);
    }
  }
}

async function deleteSelectedFiles() {
  if (selectedFiles.value.length === 0) {
    ElMessage.warning(t('setting.webdav.manager.noFileSelected'));
    return;
  }

  try {
    await ElMessageBox.confirm(
      t('setting.webdav.manager.confirmDeleteMultiple', { count: selectedFiles.value.length }),
      t('common.warningTitle'),
      { type: 'warning' }
    );

    const { url, username, password, path } = currentConfig.value.webdav;
    const client = createClient(url, { username, password });
    const remoteDir = path.endsWith('/') ? path.slice(0, -1) : path;

    const deletePromises = selectedFiles.value.map(file =>
      client.deleteFile(`${remoteDir}/${file.basename}`)
    );

    await Promise.all(deletePromises);
    ElMessage.success(t('setting.webdav.manager.deleteSuccessMultiple'));
    await fetchBackupFiles();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      console.error("Failed to delete selected files:", error);
      ElMessage.error(`${t('setting.webdav.manager.deleteFailedMultiple')}: ${error.message}`);
    }
  }
}

const handleSelectionChange = (val) => {
  selectedFiles.value = val;
};
</script>

<template>
  <div class="settings-page-container">
    <el-scrollbar class="settings-scrollbar-wrapper">
      <div class="settings-content">
        <!-- 通用设置卡片 -->
        <el-card class="settings-card" shadow="never">
          <template #header>
            <div class="card-header"><span>{{ t('setting.title') }}</span></div>
          </template>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.language.label') }}</span>
              <span class="setting-option-description">{{ t('setting.language.selectPlaceholder') }}</span>
            </div>
            <el-select v-model="selectedLanguage" @change="handleLanguageChange" size="default" style="width: 120px;">
              <el-option :label="t('setting.language.chinese')" value="zh"></el-option>
              <el-option :label="t('setting.language.english')" value="en"></el-option>
              <el-option :label="t('setting.language.japanese')" value="ja"></el-option>
              <el-option :label="t('setting.language.russian')" value="ru"></el-option>
            </el-select>
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.stream.label') }}</span>
              <span class="setting-option-description">{{ t('setting.stream.description') }}</span>
            </div>
            <el-switch v-model="currentConfig.stream" @change="saveConfig" />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.darkMode.label') }}</span>
              <span class="setting-option-description">{{ t('setting.darkMode.description') }}</span>
            </div>
            <el-switch v-model="currentConfig.isDarkMode" @change="saveConfig" />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.autoClose.label') }}</span>
              <span class="setting-option-description">{{ t('setting.autoClose.description') }}</span>
            </div>
            <el-switch v-model="currentConfig.autoCloseOnBlur" @change="saveConfig" />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.isAlwaysOnTop.label') }}</span>
              <span class="setting-option-description">{{ t('setting.isAlwaysOnTop.description') }}</span>
            </div>
            <el-switch v-model="currentConfig.isAlwaysOnTop" @change="saveConfig" />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.skipLineBreak.label') }}</span>
              <span class="setting-option-description">{{ t('setting.skipLineBreak.description') }}</span>
            </div>
            <el-switch v-model="currentConfig.skipLineBreak" @change="saveConfig" />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.ctrlEnter.label') }}</span>
              <span class="setting-option-description">{{ t('setting.ctrlEnter.description') }}</span>
            </div>
            <el-switch v-model="currentConfig.CtrlEnterToSend" @change="saveConfig" />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.notification.label') }}</span>
              <span class="setting-option-description">{{ t('setting.notification.description') }}</span>
            </div>
            <el-switch v-model="currentConfig.showNotification" @change="saveConfig" />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.fixPosition.label') }}</span>
              <span class="setting-option-description">{{ t('setting.fixPosition.description') }}</span>
            </div>
            <el-switch v-model="currentConfig.fix_position" @change="saveConfig" />
          </div>
          <div class="setting-option-item no-border">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.inputLayout.label') }}</span>
              <span class="setting-option-description">{{ t('setting.inputLayout.description') }}</span>
            </div>
            <el-switch v-model="currentConfig.inputLayout" @change="saveConfig" inline-prompt :active-text="t('setting.inputLayout.vertical')" :inactive-text="t('setting.inputLayout.horizontal')" active-value="vertical" inactive-value="horizontal" />
          </div>
        </el-card>

        <!-- 数据管理卡片 -->
        <el-card class="settings-card" shadow="never">
          <template #header>
            <div class="card-header"><span>{{ t('setting.dataManagement.title') }}</span></div>
          </template>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.dataManagement.exportLabel') }}</span>
              <span class="setting-option-description">{{ t('setting.dataManagement.exportDesc') }}</span>
            </div>
            <el-button @click="exportConfig" :icon="Download" size="default" plain>{{ t('setting.dataManagement.exportButton') }}</el-button>
          </div>
          <div class="setting-option-item no-border">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.dataManagement.importLabel') }}</span>
              <span class="setting-option-description">{{ t('setting.dataManagement.importDesc') }}</span>
            </div>
            <el-button @click="importConfig" :icon="Upload" size="default" plain>{{ t('setting.dataManagement.importButton') }}</el-button>
          </div>
        </el-card>

        <!-- WebDAV 卡片 -->
        <el-card class="settings-card" shadow="never">
          <template #header>
            <div class="card-header"><span>WebDAV</span></div>
          </template>
          <el-form label-width="200px" label-position="left" size="default">
            <el-form-item :label="t('setting.webdav.url')"><el-input v-model="currentConfig.webdav.url" @change="saveConfig" :placeholder="t('setting.webdav.urlPlaceholder')" /></el-form-item>
            <el-form-item :label="t('setting.webdav.username')"><el-input v-model="currentConfig.webdav.username" @change="saveConfig" :placeholder="t('setting.webdav.usernamePlaceholder')" /></el-form-item>
            <el-form-item :label="t('setting.webdav.password')"><el-input v-model="currentConfig.webdav.password" @change="saveConfig" type="password" show-password :placeholder="t('setting.webdav.passwordPlaceholder')" /></el-form-item>
            <el-form-item :label="t('setting.webdav.path')"><el-input v-model="currentConfig.webdav.path" @change="saveConfig" :placeholder="t('setting.webdav.pathPlaceholder')" /></el-form-item>
            <el-form-item :label="t('setting.webdav.dataPath')"><el-input v-model="currentConfig.webdav.data_path" @change="saveConfig" :placeholder="t('setting.webdav.dataPathPlaceholder')" /></el-form-item>
            <el-form-item :label="t('setting.webdav.backupRestoreTitle')" class="no-margin-bottom">
              <el-button @click="backupToWebdav" :icon="Upload">{{ t('setting.webdav.backupButton') }}</el-button>
              <el-button @click="openBackupManager" :icon="FolderOpened">{{ t('setting.webdav.restoreButton') }}</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 窗口尺寸卡片 -->
        <el-card class="settings-card" shadow="never">
            <template #header>
                <div class="card-header"><span>{{ t('setting.dimensions.title') }}</span></div>
            </template>
            <div class="dimensions-group">
                <el-form-item :label="t('setting.dimensions.widthLabel')">
                    <el-input-number v-model="currentConfig.window_width" :min="200" :max="1200" @change="saveConfig" controls-position="right" />
                </el-form-item>
                <el-form-item :label="t('setting.dimensions.heightLabel')">
                    <el-input-number v-model="currentConfig.window_height" :min="150" :max="900" @change="saveConfig" controls-position="right" />
                </el-form-item>
            </div>
        </el-card>
      </div>
    </el-scrollbar>

    <!-- 备份数据管理弹窗 -->
    <el-dialog v-model="isBackupManagerVisible" :title="t('setting.webdav.manager.title')" width="800px" top="10vh" :destroy-on-close="true" style="max-width: 90vw;">
      <el-table :data="paginatedFiles" v-loading="isTableLoading" @selection-change="handleSelectionChange" style="width: 100%" height="55vh" border stripe>
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column prop="basename" :label="t('setting.webdav.manager.filename')" sortable show-overflow-tooltip min-width="200" />
        <el-table-column prop="lastmod" :label="t('setting.webdav.manager.modifiedTime')" width="180" sortable align="center">
          <template #default="scope">{{ formatDate(scope.row.lastmod) }}</template>
        </el-table-column>
        <el-table-column prop="size" :label="t('setting.webdav.manager.size')" width="120" sortable align="center">
          <template #default="scope">{{ formatBytes(scope.row.size) }}</template>
        </el-table-column>
        <el-table-column :label="t('setting.webdav.manager.actions')" width="160" align="center">
          <template #default="scope">
            <div class="action-buttons-container">
              <el-button link type="primary" @click="restoreFromWebdav(scope.row)">{{ t('setting.webdav.manager.restore') }}</el-button>
              <el-divider direction="vertical" />
              <el-button link type="danger" @click="deleteFile(scope.row)">{{ t('setting.webdav.manager.delete') }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <div class="dialog-footer">
          <div class="footer-left">
            <el-button :icon="Refresh" @click="fetchBackupFiles">{{ t('common.refresh') }}</el-button>
            <el-button type="danger" :icon="DeleteIcon" @click="deleteSelectedFiles" :disabled="selectedFiles.length === 0">
              {{ t('common.deleteSelected') }} ({{ selectedFiles.length }})
            </el-button>
          </div>
          <div class="footer-center">
            <el-pagination v-if="backupFiles.length > 0" v-model:current-page="currentPage" v-model:page-size="pageSize"
              :page-sizes="[10, 20, 50, 100]" :total="backupFiles.length" layout="total, sizes, prev, pager, next, jumper"
              background size="small" />
          </div>
          <div class="footer-right">
            <el-button @click="isBackupManagerVisible = false">{{ t('common.close') }}</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.settings-page-container {
  height: 100%;
  width: 100%;
  background-color: var(--bg-primary);
  display: flex;
  justify-content: center;
  overflow: hidden;
}

.settings-scrollbar-wrapper {
  height: 100%;
  width: 100%;
  max-width: 900px; 
}

.settings-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-card {
  --el-card-padding: 0;
  border: 1px solid var(--border-primary);
  background-color: var(--bg-secondary);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.card-header {
  padding: 20px 25px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

:deep(.el-card__header) {
  padding: 0;
  border-bottom: 1px solid var(--border-primary);
}

:deep(.el-card__body) {
  padding: 10px 25px;
}

.setting-option-item {
  display: flex;
  justify-content: space-between;
  align-items: center; /* Vertically center the content and the control */
  padding: 20px 0;
  border-bottom: 1px solid var(--border-primary);
  gap: 20px; /* Add gap for responsiveness */
  flex-wrap: wrap; /* Allow control to wrap on small screens */
}

.setting-option-item:last-child {
  border-bottom: none;
}
.setting-option-item.no-border {
  border-bottom: none;
}

/* Requirement #3: Redesigned layout for settings items */
.setting-text-content {
  display: flex;
  align-items: baseline; /* Align text by baseline */
  flex-wrap: wrap; /* Allow description to wrap */
  gap: 8px; /* Gap between label and description */
  flex: 1;
  min-width: 0;
}

.setting-option-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap; /* Prevent label from wrapping */
}

.setting-option-description {
  font-size: 13px;
  color: var(--text-tertiary);
  line-height: 1.4;
}

.el-switch {
  --el-switch-on-color: var(--bg-accent);
  --el-switch-off-color: #bdc1c6;
  flex-shrink: 0;
}

.el-select, .el-button, .el-input-number {
  flex-shrink: 0;
}

.dimensions-group {
    display: flex;
    gap: 40px;
    align-items: flex-start;
    flex-wrap: wrap;
    padding: 20px 0;
}

.dimensions-group .el-form-item {
    margin-bottom: 0;
    flex: 1;
    min-width: 200px;
}

:deep(.el-form-item__label) {
  line-height: 1.5;
  color: var(--text-secondary);
  font-weight: 500;
}

.action-buttons-container {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0;
}
.action-buttons-container .el-divider--vertical {
  height: 1em;
  border-left: 1px solid var(--border-primary);
  margin: 0 8px;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 10px;
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

:deep(.el-pagination.is-background.el-pagination--small) {
  justify-content: center;
}
</style>