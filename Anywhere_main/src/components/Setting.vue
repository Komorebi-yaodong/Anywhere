<script setup>
import { ref, onMounted, nextTick, computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { createClient } from "webdav/web";
import { Upload, FolderOpened, Refresh, Delete as DeleteIcon, Download, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t, locale } = useI18n()

const currentConfig = inject('config'); 
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


onMounted(() => {
  selectedLanguage.value = locale.value;
});

async function saveConfig() {
  if (!currentConfig.value) return;
  try {
    const configToSave = { config: JSON.parse(JSON.stringify(currentConfig.value)) };
    if (window.api && window.api.updateConfigWithoutFeatures) {
       await window.api.updateConfigWithoutFeatures(configToSave);
    } else {
      console.warn("window.api.updateConfigWithoutFeatures is not available. Settings not saved.");
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
  if (!currentConfig.value) return;
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
          if (window.api && window.api.updateConfig) {
            await window.api.updateConfig({ config: importedData });
            const result = await window.api.getConfig();
            if (result && result.config) {
               currentConfig.value = result.config;
            }
          }
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


// --- [MODIFIED] Voice Management ---
const addNewVoice = () => {
  ElMessageBox.prompt(t('setting.voice.addPromptMessage'), t('setting.voice.addPromptTitle'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    inputValidator: (value) => {
      if (!value || value.trim() === '') return t('setting.voice.addFailEmpty');
      if (currentConfig.value.voiceList.includes(value.trim())) return t('setting.voice.addFailExists');
      return true;
    },
  }).then(({ value }) => {
    const newVoice = value.trim();
    if (!currentConfig.value.voiceList) {
      currentConfig.value.voiceList = [];
    }
    currentConfig.value.voiceList.push(newVoice);
    saveConfig();
    ElMessage.success(t('setting.voice.addSuccess'));
  }).catch(() => {
    // User cancelled
  });
};

// [ADDED] Function to edit a voice
const editVoice = (oldVoice) => {
  ElMessageBox.prompt(t('setting.voice.editPromptMessage'), t('setting.voice.editPromptTitle'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    inputValue: oldVoice,
    inputValidator: (value) => {
      const trimmedValue = value.trim();
      if (!trimmedValue) return t('setting.voice.addFailEmpty');
      if (trimmedValue !== oldVoice && currentConfig.value.voiceList.includes(trimmedValue)) {
        return t('setting.voice.addFailExists');
      }
      return true;
    },
  }).then(({ value }) => {
    const newVoice = value.trim();
    if (newVoice === oldVoice) return; // No change

    // Update voice in the main list
    const index = currentConfig.value.voiceList.indexOf(oldVoice);
    if (index > -1) {
      currentConfig.value.voiceList[index] = newVoice;

      // Update voice in all prompts that use it
      Object.values(currentConfig.value.prompts).forEach(prompt => {
        if (prompt.voice === oldVoice) {
          prompt.voice = newVoice;
        }
      });

      saveConfig();
      ElMessage.success(t('setting.voice.editSuccess'));
    }
  }).catch(() => {
    // User cancelled
  });
};

// [MODIFIED] Function to delete a voice without confirmation
const deleteVoice = (voiceToDelete) => {
  const index = currentConfig.value.voiceList.indexOf(voiceToDelete);
  if (index > -1) {
    currentConfig.value.voiceList.splice(index, 1);
    
    // Set voice to null in all prompts that use it
    Object.values(currentConfig.value.prompts).forEach(prompt => {
      if (prompt.voice === voiceToDelete) {
        prompt.voice = null;
      }
    });

    saveConfig();
  }
};


// --- WebDAV 功能 ---
async function backupToWebdav() {
  if (!currentConfig.value) return;
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
  if (!currentConfig.value) return;
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
    
    if (window.api && window.api.updateConfig) {
        await window.api.updateConfig({ config: importedData });
        const result = await window.api.getConfig();
        if (result && result.config) {
            currentConfig.value = result.config;
        }
    }

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
              <span class="setting-option-label">{{ t('setting.darkMode.label') }}</span>
              <span class="setting-option-description">{{ t('setting.darkMode.description') }}</span>
            </div>
            <el-switch v-model="currentConfig.isDarkMode" @change="saveConfig" inline-prompt :active-text="t('setting.darkMode.dark')" :inactive-text="t('setting.darkMode.light')" />
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
        </el-card>

        <!-- [MODIFIED] 语音设置卡片 -->
        <el-card class="settings-card" shadow="never">
          <template #header>
            <div class="card-header">
              <el-tooltip :content="t('setting.voice.description')" placement="top">
                <span>{{ t('setting.voice.title') }}</span>
              </el-tooltip>
            </div>
          </template>
          <div class="voice-list-container">
            <el-tag
              v-for="voice in currentConfig.voiceList"
              :key="voice"
              closable
              @click="editVoice(voice)"
              @close="deleteVoice(voice)"
              class="voice-tag"
              size="large"
            >
              {{ voice }}
            </el-tag>
            <el-button
              class="add-voice-button"
              type="primary"
              plain
              :icon="Plus"
              @click="addNewVoice"
            >
              {{ t('setting.voice.add') }}
            </el-button>
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
        <el-table-column type="selection" width="50" align="center" />
        <el-table-column prop="basename" :label="t('setting.webdav.manager.filename')" sortable show-overflow-tooltip min-width="160" />
        <el-table-column prop="lastmod" :label="t('setting.webdav.manager.modifiedTime')" width="170" sortable align="center">
          <template #default="scope">{{ formatDate(scope.row.lastmod) }}</template>
        </el-table-column>
        <el-table-column prop="size" :label="t('setting.webdav.manager.size')" width="100" sortable align="center">
          <template #default="scope">{{ formatBytes(scope.row.size) }}</template>
        </el-table-column>
        <el-table-column :label="t('setting.webdav.manager.actions')" width="120" align="center">
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
/* [MODIFIED] 语音设置样式 */
.voice-list-container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 15px 0;
}
.voice-tag {
  font-size: 14px;
  height: 32px;
  padding: 0 12px;
  cursor: pointer;
  transition: transform 0.2s ease-in-out, filter 0.2s ease-in-out;
}
.voice-tag:hover {
  transform: scale(1.05);
  filter: brightness(1.2);
}
.add-voice-button {
  border-style: dashed;
}
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
  align-items: center;
  padding: 15px 0;
  border-bottom: 1px solid var(--border-primary);
  gap: 20px;
  flex-wrap: wrap;
}

.setting-option-item:last-child,
.setting-option-item.no-border {
  border-bottom: none;
}

.setting-text-content {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.setting-option-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.setting-option-description {
  font-size: 13px;
  color: var(--text-tertiary);
  line-height: 1.4;
}

.el-switch {
  --el-switch-on-color: var(--bg-accent);
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

:deep(.el-table__header-wrapper th) {
  background-color: var(--bg-primary) !important;
  color: var(--text-secondary);
  font-weight: 600;
}
:deep(.el-table), :deep(.el-table tr) {
  background-color: var(--bg-secondary);
}
:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
    background-color: var(--bg-primary);
}
:deep(.el-table td.el-table__cell),
:deep(.el-table th.el-table__cell.is-leaf) {
    border-bottom: 1px solid var(--border-primary);
    color: var(--text-primary);
}
:deep(.el-table--border .el-table__cell) {
    border-right: 1px solid var(--border-primary);
}
</style>