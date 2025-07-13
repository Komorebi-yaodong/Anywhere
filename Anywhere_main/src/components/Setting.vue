<script setup>
// [No changes in the script section]
import { ref, onMounted, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { createClient } from "webdav/web";
import { Upload, FolderOpened, Refresh, Delete as DeleteIcon } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t, locale } = useI18n()

const currentConfig = ref({
  providers: {},
  providerOrder: [],
  prompts: {},
  tags: {},
  webdav: {}
});
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
      currentConfig.value = Object.assign({}, baseConfig, result.config);
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
    const confirmed = await ElMessageBox.confirm(
      t('setting.webdav.manager.confirmRestore', { filename: file.basename }),
      t('common.warningTitle'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    );
    if (!confirmed) return;

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
      <div class="settings-card">
        <!-- 常规设置部分 -->
        <h2 class="settings-card-title">{{ t('setting.title') }}</h2>
        <div class="setting-option-item">
          <div class="setting-text-content"><span class="setting-option-label">{{ t('setting.language.label') }}</span></div>
          <el-select v-model="selectedLanguage" @change="handleLanguageChange" :placeholder="t('setting.language.selectPlaceholder')" size="small" style="width: 120px;">
            <el-option :label="t('setting.language.chinese')" value="zh"></el-option><el-option :label="t('setting.language.english')" value="en"></el-option><el-option :label="t('setting.language.japanese')" value="ja"></el-option><el-option :label="t('setting.language.russian')" value="ru"></el-option>
          </el-select>
        </div>
        <div class="setting-option-item"><div class="setting-text-content"><span class="setting-option-label">{{ t('setting.stream.label') }}</span><span class="setting-option-description">{{ t('setting.stream.description') }}</span></div><el-switch v-model="currentConfig.stream" @change="saveConfig" /></div>
        <div class="setting-option-item"><div class="setting-text-content"><span class="setting-option-label">{{ t('setting.darkMode.label') }}</span><span class="setting-option-description">{{ t('setting.darkMode.description') }}</span></div><el-switch v-model="currentConfig.isDarkMode" @change="saveConfig" /></div>
        <div class="setting-option-item"><div class="setting-text-content"><span class="setting-option-label">{{ t('setting.autoClose.label') }}</span><span class="setting-option-description">{{ t('setting.autoClose.description') }}</span></div><el-switch v-model="currentConfig.autoCloseOnBlur" @change="saveConfig" /></div>
        <div class="setting-option-item"><div class="setting-text-content"><span class="setting-option-label">{{ t('setting.isAlwaysOnTop.label') }}</span><span class="setting-option-description">{{ t('setting.isAlwaysOnTop.description') }}</span></div><el-switch v-model="currentConfig.isAlwaysOnTop" @change="saveConfig" /></div>
        <div class="setting-option-item"><div class="setting-text-content"><span class="setting-option-label">{{ t('setting.skipLineBreak.label') }}</span><span class="setting-option-description">{{ t('setting.skipLineBreak.description') }}</span></div><el-switch v-model="currentConfig.skipLineBreak" @change="saveConfig" /></div>
        <div class="setting-option-item"><div class="setting-text-content"><span class="setting-option-label">{{ t('setting.ctrlEnter.label') }}</span><span class="setting-option-description">{{ t('setting.ctrlEnter.description') }}</span></div><el-switch v-model="currentConfig.CtrlEnterToSend" @change="saveConfig" /></div>
        <div class="setting-option-item"><div class="setting-text-content"><span class="setting-option-label">{{ t('setting.notification.label') }}</span><span class="setting-option-description">{{ t('setting.notification.description') }}</span></div><el-switch v-model="currentConfig.showNotification" @change="saveConfig" /></div>
        <div class="setting-option-item"><div class="setting-text-content"><span class="setting-option-label">{{ t('setting.fixPosition.label') }}</span><span class="setting-option-description">{{ t('setting.fixPosition.description') }}</span></div><el-switch v-model="currentConfig.fix_position" @change="saveConfig" /></div>
        
        <!-- 数据管理部分 -->
        <h2 class="settings-card-title section-divider">{{ t('setting.dataManagement.title') }}</h2>
        <div class="setting-option-item"><div class="setting-text-content"><span class="setting-option-label">{{ t('setting.dataManagement.exportLabel') }}</span><span class="setting-option-description">{{ t('setting.dataManagement.exportDesc') }}</span></div><el-button @click="exportConfig" size="small">{{ t('setting.dataManagement.exportButton') }}</el-button></div>
        <div class="setting-option-item"><div class="setting-text-content"><span class="setting-option-label">{{ t('setting.dataManagement.importLabel') }}</span><span class="setting-option-description">{{ t('setting.dataManagement.importDesc') }}</span></div><el-button @click="importConfig" size="small">{{ t('setting.dataManagement.importButton') }}</el-button></div>
        
        <!-- WebDAV 部分 -->
        <h2 class="settings-card-title section-divider">WebDAV</h2>
        <div class="webdav-form-container">
          <el-form label-width="200px" label-position="left" size="default">
            <el-form-item :label="t('setting.webdav.url')"><el-input v-model="currentConfig.webdav.url" @change="saveConfig" :placeholder="t('setting.webdav.urlPlaceholder')" /></el-form-item>
            <el-form-item :label="t('setting.webdav.username')"><el-input v-model="currentConfig.webdav.username" @change="saveConfig" :placeholder="t('setting.webdav.usernamePlaceholder')" /></el-form-item>
            <el-form-item :label="t('setting.webdav.password')"><el-input v-model="currentConfig.webdav.password" @change="saveConfig" type="password" show-password :placeholder="t('setting.webdav.passwordPlaceholder')" /></el-form-item>
            <el-form-item :label="t('setting.webdav.path')"><el-input v-model="currentConfig.webdav.path" @change="saveConfig" :placeholder="t('setting.webdav.pathPlaceholder')" /></el-form-item>
            <el-form-item :label="t('setting.webdav.dataPath')"><el-input v-model="currentConfig.webdav.data_path" @change="saveConfig" :placeholder="t('setting.webdav.dataPathPlaceholder')" /></el-form-item>
            <el-form-item :label="t('setting.webdav.backupRestoreTitle')">
              <el-button @click="backupToWebdav" :icon="Upload">{{ t('setting.webdav.backupButton') }}</el-button>
              <el-button @click="openBackupManager" :icon="FolderOpened">{{ t('setting.webdav.restoreButton') }}</el-button>
            </el-form-item>
          </el-form>
        </div>
        
        <!-- 尺寸设置部分 -->
        <h2 class="settings-card-title section-divider">{{ t('setting.dimensions.title') }}</h2>
        <div class="setting-option-item dimensions-group">
          <el-form-item :label="t('setting.dimensions.widthLabel')" class="dimension-config-item"><el-input-number v-model="currentConfig.window_width" :min="200" :max="1200" @change="saveConfig" controls-position="right" /></el-form-item>
          <el-form-item :label="t('setting.dimensions.heightLabel')" class="dimension-config-item"><el-input-number v-model="currentConfig.window_height" :min="150" :max="900" @change="saveConfig" controls-position="right" /></el-form-item>
        </div>
      </div>
    </el-scrollbar>

    <!-- [UPDATED] 备份数据管理弹窗 -->
    <el-dialog 
      v-model="isBackupManagerVisible" 
      :title="t('setting.webdav.manager.title')" 
      width="800px" 
      top="10vh" 
      :destroy-on-close="true"
      style="max-width: 90vw;"
    >
      <el-table 
        :data="paginatedFiles"
        v-loading="isTableLoading"
        @selection-change="handleSelectionChange" 
        style="width: 100%"
        height="55vh"
        border
        stripe
      >
        <el-table-column type="selection" width="50" align="center" />
        
        <el-table-column 
          prop="basename" 
          :label="t('setting.webdav.manager.filename')" 
          sortable 
          show-overflow-tooltip
          min-width="200"
        />
        
        <el-table-column prop="lastmod" :label="t('setting.webdav.manager.modifiedTime')" width="140" sortable>
          <template #default="scope">{{ formatDate(scope.row.lastmod) }}</template>
        </el-table-column>
        
        <el-table-column prop="size" :label="t('setting.webdav.manager.size')" width="100" sortable>
          <template #default="scope">{{ formatBytes(scope.row.size) }}</template>
        </el-table-column>
        
        <el-table-column :label="t('setting.webdav.manager.actions')" width="140" align="center">
          <template #default="scope">
            <div class="action-buttons-container">
              <el-button link type="primary" @click="restoreFromWebdav(scope.row)">{{ t('setting.webdav.manager.restore') }}</el-button>
              <el-button link type="danger" @click="deleteFile(scope.row)">{{ t('setting.webdav.manager.delete') }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      
      <template #footer>
        <div class="dialog-footer">
          <!-- 左侧操作 -->
          <div class="footer-left">
            <el-button :icon="Refresh" @click="fetchBackupFiles">{{ t('common.refresh') }}</el-button>
            <el-button type="danger" :icon="DeleteIcon" @click="deleteSelectedFiles" :disabled="selectedFiles.length === 0">
              {{ t('common.deleteSelected') }} ({{ selectedFiles.length }})
            </el-button>
          </div>
          <!-- 中间分页 -->
          <div class="footer-center">
            <el-pagination
              v-if="backupFiles.length > 0"
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="backupFiles.length"
              layout="total, sizes, prev, pager, next"
              background
              size="small"
            />
          </div>
          <!-- 右侧关闭 -->
          <div class="footer-right">
            <el-button @click="isBackupManagerVisible = false">{{ t('common.close') }}</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 现有样式 (基本无改动) */
.settings-page-container { height: 100%; width: 100%; background-color: #f7f7f8; display: flex; justify-content: center; padding-top: 20px; padding-bottom: 20px; box-sizing: border-box; }
.settings-scrollbar-wrapper { width: 100%; max-width: 700px; }
.settings-card { background-color: #ffffff; padding: 28px 32px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); }
.settings-card-title { font-size: 18px; font-weight: 600; color: #202123; margin: 0 0 18px 0; padding-bottom: 16px; border-bottom: 1px solid #ebeef5; }
.section-divider { margin-top: 30px; margin-bottom: 20px; }
.setting-option-item { display: flex; justify-content: space-between; align-items: center; padding: 18px 0; border-bottom: 1px solid #f0f2f5; }
.webdav-form-container { padding: 18px 0; border-bottom: 1px solid #f0f2f5; }
.webdav-form-container .el-form-item { margin-bottom: 18px; }
.webdav-form-container .el-form-item:last-child { margin-bottom: 0; }
.webdav-form-container :deep(.el-form-item__label) { font-size: 14px; font-weight: 500; color: #3c4043; }
.setting-option-item .el-select { width: 150px; }
.setting-option-item .el-button { min-width: 80px; }
.dimensions-group.setting-option-item { border-bottom: none; padding-bottom: 0; }
.setting-text-content { display: flex; flex-direction: column; gap: 2px; padding-right: 16px; flex-grow: 1; min-width: 0; }
.setting-option-label { font-size: 14px; font-weight: 500; color: #3c4043; }
.setting-option-description { font-size: 12px; color: #70757a; word-break: break-word; }
.el-switch { --el-switch-on-color: #1a73e8; --el-switch-off-color: #bdc1c6; }
:deep(.el-switch.is-checked .el-switch__core) { background-color: #0070f3; border-color: #0070f3; }
.dimensions-group { display: flex; flex-direction: column; gap: 15px; align-items: stretch; }
.dimension-config-item { margin-bottom: 0; }
.dimension-config-item :deep(.el-form-item__label) { font-size: 14px; font-weight: 500; color: #3c4043; padding-bottom: 6px !important; line-height: normal; }
.dimension-config-item :deep(.el-input-number) { width: 100%; }

/* [UPDATED] 弹窗和表格样式 */
.action-buttons-container {
  display: flex;
  justify-content: center;
  gap: 8px; /* 给恢复和删除按钮之间增加一些间距 */
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  flex-wrap: wrap; /* 在小屏幕上允许换行 */
  gap: 10px;
}

.footer-left, .footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.footer-center {
  flex-grow: 1;
  display: flex;
  justify-content: center;
}

/* 针对小屏幕优化分页器 */
:deep(.el-pagination.is-background.el-pagination--small) {
  justify-content: center;
}
</style>