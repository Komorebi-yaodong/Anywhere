<script setup>
import { ref, onMounted, computed, inject, h, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createClient } from "webdav/web";
import { Upload, FolderOpened, Refresh, Delete as DeleteIcon, Download, Plus, ArrowRight, Check } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, ElInput } from 'element-plus'
import draggable from 'vuedraggable'

const { t, locale } = useI18n()

const currentConfig = inject('config');
const selectedLanguage = ref(locale.value);

const collapsedCards = ref({
  general: false,
  voice: false,
  data: false,
  webdav: false
});

const cardDefinitions = {
  general: { id: 'general', titleKey: 'setting.title' },
  voice: { id: 'voice', titleKey: 'setting.voice.title' },
  data: { id: 'data', titleKey: 'setting.dataManagement.title' },
  webdav: { id: 'webdav', titleKey: null, staticTitle: 'WebDAV' }
};

const settingsCards = ref([]);

function initCardOrder() {
  if (currentConfig.value && currentConfig.value.settingsCardOrder) {
    const order = currentConfig.value.settingsCardOrder;
    settingsCards.value = order
      .map(id => cardDefinitions[id])
      .filter(Boolean); 
    
    const missingIds = Object.keys(cardDefinitions).filter(id => !order.includes(id));
    missingIds.forEach(id => settingsCards.value.push(cardDefinitions[id]));
  } else {
    settingsCards.value = [
      cardDefinitions.general,
      cardDefinitions.voice,
      cardDefinitions.data,
      cardDefinitions.webdav
    ];
  }
}

const onOrderChange = async () => {
  const newOrder = settingsCards.value.map(card => card.id);
  currentConfig.value.settingsCardOrder = newOrder;
  await saveSingleSetting('settingsCardOrder', newOrder);
};

function toggleCard(cardName) {
  collapsedCards.value[cardName] = !collapsedCards.value[cardName];
}

const isBackupManagerVisible = ref(false);
const backupFiles = ref([]);
const isTableLoading = ref(false);
const selectedFiles = ref([]);
const currentPage = ref(1);
const pageSize = ref(10);

const paginatedFiles = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return backupFiles.value.slice(start, end);
});

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
  if (['ja', 'ru'].includes(locale.value)) {
    handleLanguageChange('zh');
  } else {
    selectedLanguage.value = locale.value;
  }
  
  if (currentConfig.value) {
    initCardOrder();
  }
});

watch(() => currentConfig.value, (newVal) => {
  if (newVal) {
    initCardOrder();
  }
}, { once: true });

async function saveSingleSetting(keyPath, value) {
  try {
    if (window.api && window.api.saveSetting) {
      await window.api.saveSetting(keyPath, value);
    }
  } catch (error) {
    console.error(`Error saving setting for ${keyPath}:`, error);
    ElMessage.error(`${t('setting.alerts.saveFailedPrefix')} ${keyPath}`);
  }
}

async function saveFullConfig() {
  if (!currentConfig.value) return;
  try {
    const configToSave = { config: JSON.parse(JSON.stringify(currentConfig.value)) };
    if (window.api && window.api.updateConfigWithoutFeatures) {
      await window.api.updateConfigWithoutFeatures(configToSave);
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

async function handleGlobalToggleChange(key, value) {
  if (!currentConfig.value || !currentConfig.value.prompts) return;

  if (key === 'isAlwaysOnTop') {
    currentConfig.value.isAlwaysOnTop_global = value;
  } else if (key === 'autoCloseOnBlur') {
    currentConfig.value.autoCloseOnBlur_global = value;
  } else if (key === 'autoSaveChat') {
    currentConfig.value.autoSaveChat_global = value;
  }

  Object.keys(currentConfig.value.prompts).forEach(promptKey => {
    const prompt = currentConfig.value.prompts[promptKey];
    if (prompt) {
      prompt[key] = value;
    }
  });

  await saveFullConfig();
  ElMessage.success(t('setting.alerts.saveSuccess'));
}

async function exportConfig() {
  if (!currentConfig.value) return;
  try {
    const configToExport = JSON.parse(JSON.stringify(currentConfig.value));

    if (configToExport.webdav && configToExport.webdav.localChatPath) {
      delete configToExport.webdav.localChatPath;
    }

    if (configToExport.skillPath !== undefined) {
      delete configToExport.skillPath;
    }

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
          const currentLocalChatPath = currentConfig.value.webdav?.localChatPath;
          const currentSkillPath = currentConfig.value.skillPath;

          const importedData = JSON.parse(e.target.result);
          if (typeof importedData !== 'object' || importedData === null) {
            throw new Error("Imported file is not a valid configuration object.");
          }

          if (currentLocalChatPath) {
            if (!importedData.webdav) {
              importedData.webdav = {};
            }
            importedData.webdav.localChatPath = currentLocalChatPath;
          }

          if (currentSkillPath) {
            importedData.skillPath = currentSkillPath;
          }

          if (window.api && window.api.updateConfig) {
            await window.api.updateConfig({ config: importedData });
            const result = await window.api.getConfig();
            if (result && result.config) {
              currentConfig.value = result.config;
              initCardOrder();
            }
          }
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

async function handleThemeChange(mode) {
  if (!currentConfig.value) return;

  await saveSingleSetting('themeMode', mode);

  let newIsDarkMode = currentConfig.value.isDarkMode;

  if (mode === 'system') {
    newIsDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } else if (mode === 'dark') {
    newIsDarkMode = true;
  } else {
    newIsDarkMode = false;
  }

  currentConfig.value.isDarkMode = newIsDarkMode;
  await saveSingleSetting('isDarkMode', newIsDarkMode);
}

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
    saveFullConfig();
    ElMessage.success(t('setting.voice.addSuccess'));
  }).catch(() => { });
};

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
    if (newVoice === oldVoice) return;
    const index = currentConfig.value.voiceList.indexOf(oldVoice);
    if (index > -1) {
      currentConfig.value.voiceList[index] = newVoice;
      Object.values(currentConfig.value.prompts).forEach(prompt => {
        if (prompt.voice === oldVoice) {
          prompt.voice = newVoice;
        }
      });
      saveFullConfig();
      ElMessage.success(t('setting.voice.editSuccess'));
    }
  }).catch(() => { });
};

const deleteVoice = (voiceToDelete) => {
  const index = currentConfig.value.voiceList.indexOf(voiceToDelete);
  if (index > -1) {
    currentConfig.value.voiceList.splice(index, 1);
    Object.values(currentConfig.value.prompts).forEach(prompt => {
      if (prompt.voice === voiceToDelete) {
        prompt.voice = null;
      }
    });
    saveFullConfig();
  }
};

async function backupToWebdav() {
  if (!currentConfig.value) return;
  const { url, username, password, path } = currentConfig.value.webdav;
  if (!url) {
    ElMessage.error(t('setting.webdav.alerts.urlRequired'));
    return;
  }

  const now = new Date();
  const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
  const defaultBasename = `Anywhere-${timestamp}`;

  const inputValue = ref(defaultBasename);

  try {
    await ElMessageBox({
      title: t('setting.webdav.backup.confirmTitle'),
      message: () => h('div', { style: 'display: flex; flex-direction: column; align-items: center; width: 100%;' }, [
        h('p', { style: 'margin-bottom: 15px; font-size: 14px; color: var(--text-secondary); text-align: center; width: 100%;' }, t('setting.webdav.backup.confirmMessage')),
        h(ElInput, {
          modelValue: inputValue.value,
          'onUpdate:modelValue': (val) => { inputValue.value = val; },
          placeholder: t('setting.webdav.backup.inputFilename'),
          autofocus: true,
          style: 'width: 100%; max-width: 400px;'
        }, {
          append: () => h('div', { class: 'input-suffix-display' }, '.json')
        })
      ]),
      showCancelButton: true,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      customClass: 'filename-prompt-dialog',
      center: true,
      beforeClose: async (action, instance, done) => {
        if (action === 'confirm') {
          let finalBasename = inputValue.value.trim();
          if (!finalBasename) {
            ElMessage.error(t('setting.webdav.backup.emptyFilenameError'));
            return;
          }
          const filename = finalBasename + '.json';

          instance.confirmButtonLoading = true;
          ElMessage.info(t('setting.webdav.alerts.backupInProgress'));

          try {
            const client = createClient(url, { username, password });
            const remoteDir = path.endsWith('/') ? path.slice(0, -1) : path;
            const remoteFilePath = `${remoteDir}/${filename}`;

            if (!(await client.exists(remoteDir))) {
              await client.createDirectory(remoteDir, { recursive: true });
            }

            const configToBackup = JSON.parse(JSON.stringify(currentConfig.value));
            if (configToBackup.webdav && configToBackup.webdav.localChatPath) {
              delete configToBackup.webdav.localChatPath;
            }
            if (configToBackup.skillPath !== undefined) {
              delete configToBackup.skillPath;
            }

            const jsonString = JSON.stringify(configToBackup, null, 2);
            await client.putFileContents(remoteFilePath, jsonString, { overwrite: true });

            ElMessage.success(t('setting.webdav.alerts.backupSuccess'));
            done();
          } catch (error) {
            console.error("WebDAV backup failed:", error);
            ElMessage.error(`${t('setting.webdav.alerts.backupFailed')}: ${error.message}`);
          } finally {
            instance.confirmButtonLoading = false;
          }
        } else {
          done();
        }
      }
    });
  } catch (error) {
    if (error === 'cancel' || error === 'close') {
      ElMessage.info(t('setting.webdav.backup.cancelled'));
    } else {
      console.error("MessageBox error:", error);
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

    const currentLocalChatPath = currentConfig.value.webdav?.localChatPath;
    const currentSkillPath = currentConfig.value.skillPath;

    const { url, username, password, path } = currentConfig.value.webdav;
    const client = createClient(url, { username, password });
    const remoteDir = path.endsWith('/') ? path.slice(0, -1) : path;
    const remoteFilePath = `${remoteDir}/${file.basename}`;

    const jsonString = await client.getFileContents(remoteFilePath, { format: "text" });
    const importedData = JSON.parse(jsonString);

    if (typeof importedData !== 'object' || importedData === null) {
      throw new Error("Downloaded file is not a valid configuration object.");
    }

    if (currentLocalChatPath) {
      if (!importedData.webdav) {
        importedData.webdav = {};
      }
      importedData.webdav.localChatPath = currentLocalChatPath;
    }

    if (currentSkillPath) {
      importedData.skillPath = currentSkillPath;
    }

    if (window.api && window.api.updateConfig) {
      await window.api.updateConfig({ config: importedData });
      const result = await window.api.getConfig();
      if (result && result.config) {
        currentConfig.value = result.config;
        initCardOrder();
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

async function selectLocalChatPath() {
  const path = await window.api.selectDirectory();
  if (path) {
    currentConfig.value.webdav.localChatPath = path;
    saveSingleSetting('webdav.localChatPath', path);
  }
}
</script>

<template>
  <div class="settings-page-container">
    <el-scrollbar class="settings-scrollbar-wrapper">
      <div class="settings-content">
        <draggable 
          v-model="settingsCards" 
          item-key="id" 
          handle=".card-header" 
          animation="300"
          ghost-class="sortable-ghost"
          drag-class="sortable-drag"
          class="draggable-list"
          @end="onOrderChange"
        >
          <template #item="{ element }">
            <div class="settings-card">
              <div class="card-header" :class="{ 'is-collapsed': collapsedCards[element.id] }" @click="toggleCard(element.id)">
                <span v-if="element.id === 'voice'">
                  <el-tooltip :content="t('setting.voice.description')" placement="top">
                    <span>{{ t(element.titleKey) }}</span>
                  </el-tooltip>
                </span>
                <span v-else>{{ element.titleKey ? t(element.titleKey) : element.staticTitle }}</span>
                <el-icon class="collapse-icon" :class="{ 'is-expanded': !collapsedCards[element.id] }"><ArrowRight /></el-icon>
              </div>

              <el-collapse-transition>
                <div v-show="!collapsedCards[element.id]">
                  
                  <div v-if="element.id === 'general'" class="card-body">
                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.language.label') }}</span>
                        <span class="setting-option-description">{{ t('setting.language.selectPlaceholder') }}</span>
                      </div>
                      <el-select v-model="selectedLanguage" @change="handleLanguageChange" size="default" style="width: 120px;">
                        <el-option :label="t('setting.language.chinese')" value="zh"></el-option>
                        <el-option :label="t('setting.language.english')" value="en"></el-option>
                      </el-select>
                    </div>
                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.darkMode.label') }}</span>
                        <span class="setting-option-description">{{ t('setting.darkMode.description') }}</span>
                      </div>
                      <el-select v-model="currentConfig.themeMode" @change="handleThemeChange" size="default"
                        style="width: 120px;">
                        <el-option :label="t('setting.darkMode.system')" value="system"></el-option>
                        <el-option :label="t('setting.darkMode.light')" value="light"></el-option>
                        <el-option :label="t('setting.darkMode.dark')" value="dark"></el-option>
                      </el-select>
                    </div>
                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.isAlwaysOnTop_global.label') }}</span>
                        <span class="setting-option-description">{{ t('setting.isAlwaysOnTop_global.description') }}</span>
                      </div>
                      <el-switch v-model="currentConfig.isAlwaysOnTop_global"
                        @change="(value) => handleGlobalToggleChange('isAlwaysOnTop', value)" />
                    </div>
                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.autoCloseOnBlur_global.label') }}</span>
                        <span class="setting-option-description">{{ t('setting.autoCloseOnBlur_global.description') }}</span>
                      </div>
                      <el-switch v-model="currentConfig.autoCloseOnBlur_global"
                        @change="(value) => handleGlobalToggleChange('autoCloseOnBlur', value)" />
                    </div>
                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.autoSaveChat_global.label') }}</span>
                        <span class="setting-option-description">{{ t('setting.autoSaveChat_global.description') }}</span>
                      </div>
                      <el-switch v-model="currentConfig.autoSaveChat_global"
                        @change="(value) => handleGlobalToggleChange('autoSaveChat', value)" />
                    </div>
                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.skipLineBreak.label') }}</span>
                        <span class="setting-option-description">{{ t('setting.skipLineBreak.description') }}</span>
                      </div>
                      <el-switch v-model="currentConfig.skipLineBreak"
                        @change="(value) => saveSingleSetting('skipLineBreak', value)" />
                    </div>
                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.ctrlEnter.label') }}</span>
                        <span class="setting-option-description">{{ t('setting.ctrlEnter.description') }}</span>
                      </div>
                      <el-switch v-model="currentConfig.CtrlEnterToSend"
                        @change="(value) => saveSingleSetting('CtrlEnterToSend', value)" />
                    </div>
                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.notification.label') }}</span>
                        <span class="setting-option-description">{{ t('setting.notification.description') }}</span>
                      </div>
                      <el-switch v-model="currentConfig.showNotification"
                        @change="(value) => saveSingleSetting('showNotification', value)" />
                    </div>
                    <div class="setting-option-item no-border">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.fixPosition.label') }}</span>
                        <span class="setting-option-description">{{ t('setting.fixPosition.description') }}</span>
                      </div>
                      <el-switch v-model="currentConfig.fix_position"
                        @change="(value) => saveSingleSetting('fix_position', value)" />
                    </div>
                  </div>

                  <div v-if="element.id === 'voice'" class="card-body">
                    <div class="voice-list-container">
                      <el-tag v-for="voice in currentConfig.voiceList" :key="voice" closable @click="editVoice(voice)"
                        @close="deleteVoice(voice)" class="voice-tag" size="large">
                        {{ voice }}
                      </el-tag>
                      <el-button class="add-voice-button" type="primary" plain :icon="Plus" @click="addNewVoice">
                        {{ t('setting.voice.add') }}
                      </el-button>
                    </div>
                  </div>

                  <div v-if="element.id === 'data'" class="card-body">
                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.dataManagement.exportLabel') }}</span>
                        <span class="setting-option-description">{{ t('setting.dataManagement.exportDesc') }}</span>
                      </div>
                      <el-button @click="exportConfig" :icon="Download" size="default" plain>{{
                        t('setting.dataManagement.exportButton')
                      }}</el-button>
                    </div>
                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.dataManagement.importLabel') }}</span>
                        <span class="setting-option-description">{{ t('setting.dataManagement.importDesc') }}</span>
                      </div>
                      <el-button @click="importConfig" :icon="Upload" size="default" plain>{{
                        t('setting.dataManagement.importButton')
                      }}</el-button>
                    </div>
                    <div class="setting-option-item no-border">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.webdav.localChatPath') }}</span>
                        <span class="setting-option-description">{{ t('setting.webdav.localChatPathPlaceholder') }}</span>
                      </div>
                      <el-input v-model="currentConfig.webdav.localChatPath"
                        @change="(value) => saveSingleSetting('webdav.localChatPath', value)"
                        :placeholder="t('setting.webdav.localChatPathPlaceholder')" style="width: 320px;">
                        <template #append>
                          <el-button @click="selectLocalChatPath">{{ t('setting.webdav.selectFolder') }}</el-button>
                        </template>
                      </el-input>
                    </div>
                  </div>

                  <div v-if="element.id === 'webdav'" class="card-body">
                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.webdav.url') }}</span>
                      </div>
                      <el-input v-model="currentConfig.webdav.url" @change="(value) => saveSingleSetting('webdav.url', value)"
                        :placeholder="t('setting.webdav.urlPlaceholder')" style="width: 320px;" />
                    </div>
                    
                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.webdav.username') }}</span>
                      </div>
                      <el-input v-model="currentConfig.webdav.username" @change="(value) => saveSingleSetting('webdav.username', value)"
                        :placeholder="t('setting.webdav.usernamePlaceholder')" style="width: 320px;" />
                    </div>

                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.webdav.password') }}</span>
                      </div>
                      <el-input v-model="currentConfig.webdav.password" @change="(value) => saveSingleSetting('webdav.password', value)" type="password" show-password
                        :placeholder="t('setting.webdav.passwordPlaceholder')" style="width: 320px;" />
                    </div>

                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.webdav.path') }}</span>
                      </div>
                      <el-input v-model="currentConfig.webdav.path" @change="(value) => saveSingleSetting('webdav.path', value)"
                        :placeholder="t('setting.webdav.pathPlaceholder')" style="width: 320px;" />
                    </div>

                    <div class="setting-option-item">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.webdav.dataPath') }}</span>
                      </div>
                      <el-input v-model="currentConfig.webdav.data_path" @change="(value) => saveSingleSetting('webdav.data_path', value)"
                        :placeholder="t('setting.webdav.dataPathPlaceholder')" style="width: 320px;" />
                    </div>

                    <div class="setting-option-item no-border">
                      <div class="setting-text-content">
                        <span class="setting-option-label">{{ t('setting.webdav.backupRestoreTitle') }}</span>
                      </div>
                      <div class="webdav-actions" style="display: flex; gap: 12px;">
                        <el-button @click="backupToWebdav" :icon="Upload" plain>{{ t('setting.webdav.backupButton') }}</el-button>
                        <el-button @click="openBackupManager" :icon="FolderOpened" plain>{{ t('setting.webdav.restoreButton') }}</el-button>
                      </div>
                    </div>
                  </div>

                </div>
              </el-collapse-transition>
            </div>
          </template>
        </draggable>
      </div>
    </el-scrollbar>

    <el-dialog v-model="isBackupManagerVisible" :title="t('setting.webdav.manager.title')" width="700px" top="10vh"
      :destroy-on-close="true" style="max-width: 90vw;" class="backup-manager-dialog">
      <el-table :data="paginatedFiles" v-loading="isTableLoading" @selection-change="handleSelectionChange"
        style="width: 100%" max-height="50vh" border stripe>
        <el-table-column type="selection" width="50" align="center" />
        <el-table-column prop="basename" :label="t('setting.webdav.manager.filename')" sortable show-overflow-tooltip
          min-width="160" />
        <el-table-column prop="lastmod" :label="t('setting.webdav.manager.modifiedTime')" width="170" sortable
          align="center">
          <template #default="scope">{{ formatDate(scope.row.lastmod) }}</template>
        </el-table-column>
        <el-table-column prop="size" :label="t('setting.webdav.manager.size')" width="100" sortable align="center">
          <template #default="scope">{{ formatBytes(scope.row.size) }}</template>
        </el-table-column>
        <el-table-column :label="t('setting.webdav.manager.actions')" width="120" align="center">
          <template #default="scope">
            <div class="action-buttons-container">
              <el-button link type="primary" @click="restoreFromWebdav(scope.row)">{{
                t('setting.webdav.manager.restore') }}</el-button>
              <el-divider direction="vertical" />
              <el-button link type="danger" @click="deleteFile(scope.row)">{{ t('setting.webdav.manager.delete')
              }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <div class="dialog-footer">
          <div class="footer-left">
            <el-button :icon="Refresh" @click="fetchBackupFiles">{{ t('common.refresh') }}</el-button>
            <el-button type="danger" :icon="DeleteIcon" @click="deleteSelectedFiles"
              :disabled="selectedFiles.length === 0">
              {{ t('common.deleteSelected') }} ({{ selectedFiles.length }})
            </el-button>
          </div>
          <div class="footer-center">
            <el-pagination v-if="backupFiles.length > 0" v-model:current-page="currentPage" v-model:page-size="pageSize"
              :page-sizes="[10, 20, 50, 100]" :total="backupFiles.length"
              layout="total, sizes, prev, pager, next, jumper" background size="small" />
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
  --panda-bg: #F4F4F5; 
  --panda-card-bg: #FFFFFF;
  --panda-text-main: #18181B;
  --panda-text-sub: #71717A;
  --panda-accent: #18181B;
  --panda-border: #E4E4E7;
  --panda-hover: #F4F4F5;
  --panda-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  
  height: 100%;
  width: 100%;
  background-color: var(--panda-bg);
  display: flex;
  justify-content: center;
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

html.dark .settings-page-container {
  --panda-bg: #000000;
  --panda-card-bg: #18181B;
  --panda-text-main: #FFFFFF;
  --panda-text-sub: #A1A1AA;
  --panda-accent: #FFFFFF;
  --panda-border: #27272A;
  --panda-hover: #27272A;
  --panda-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.settings-scrollbar-wrapper {
  height: 100%;
  width: 100%;
  max-width: 900px;
}

.settings-content {
  padding: 20px 20px 60px 20px;
  display: flex;
  flex-direction: column;
}

.draggable-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sortable-ghost {
  opacity: 0.4;
  background-color: var(--panda-bg);
  border: 1px dashed var(--panda-text-sub);
  box-shadow: none;
}

.sortable-drag {
  cursor: grabbing;
  opacity: 1;
  background-color: var(--panda-card-bg);
  box-shadow: 0 16px 32px -8px rgba(0, 0, 0, 0.15);
  transform: scale(1.01);
}

.settings-card {
  background-color: var(--panda-card-bg);
  border-radius: 12px;
  border: 1px solid var(--panda-border);
  box-shadow: var(--panda-shadow);
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.settings-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 12px -3px rgba(0, 0, 0, 0.08);
}

.card-header {
  padding: 14px 20px;
  font-size: 15px;
  color: var(--panda-text-main);
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: grab;
  user-select: none;
  background-color: transparent;
  transition: background-color 0.2s;
  border-bottom: 1px solid var(--panda-border);
}

.card-header:active {
  cursor: grabbing;
}

.card-header.is-collapsed {
  border-bottom: 1px solid transparent;
}

.card-header:hover {
  background-color: var(--panda-hover);
}

.card-header > span,
.card-header :deep(span) {
  font-weight: 700;
  letter-spacing: -0.3px;
}

.collapse-icon {
  color: var(--panda-text-sub);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-size: 16px;
  background-color: var(--panda-bg);
  border-radius: 50%;
  padding: 4px;
  width: 24px;
  height: 24px;
}

.collapse-icon.is-expanded {
  transform: rotate(90deg);
  background-color: var(--panda-accent);
  color: var(--panda-card-bg);
}

.card-body {
  padding: 4px 20px 20px 20px;
}

.setting-option-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  margin-bottom: 2px;
  border-radius: 8px;
  background-color: transparent;
  border: 1px solid transparent;
  transition: all 0.2s ease;
  gap: 16px;
}

.setting-option-item:hover {
  background-color: var(--panda-hover);
}

.setting-option-item:last-child,
.setting-option-item.no-border {
  margin-bottom: 0;
}

.setting-text-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.setting-option-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--panda-text-main);
}

.setting-option-description {
  font-size: 12px;
  color: var(--panda-text-sub);
  line-height: 1.3;
}

.voice-list-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
}

.voice-tag {
  font-size: 12px;
  height: 30px;
  padding: 0 14px;
  cursor: pointer;
  border-radius: 15px;
  border: 1px solid var(--panda-border);
  background-color: var(--panda-card-bg);
  color: var(--panda-text-main);
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.5, 1);
  display: inline-flex;
  align-items: center;
}

.voice-tag:hover {
  transform: scale(1.03);
  border-color: var(--panda-accent);
  background-color: var(--panda-accent);
  color: var(--panda-card-bg);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.add-voice-button {
  border: 1px dashed var(--panda-text-sub) !important;
  color: var(--panda-text-sub) !important;
  height: 30px;
  border-radius: 15px;
  padding: 0 16px;
  background-color: transparent !important;
  transition: all 0.2s;
  font-weight: 600;
  font-size: 12px;
}

.add-voice-button:hover {
  border-color: var(--panda-accent) !important;
  color: var(--panda-accent) !important;
  background-color: var(--panda-hover) !important;
}

.el-switch {
  --el-switch-on-color: var(--panda-accent);
  --el-switch-off-color: var(--panda-border);
  height: 20px;
  flex-shrink: 0;
}
:deep(.el-switch__core) {
  border: 2px solid transparent;
  background-color: var(--panda-border);
  min-width: 36px;
  height: 20px;
}
:deep(.el-switch.is-checked .el-switch__core) {
  background-color: var(--panda-accent);
  border-color: var(--panda-accent);
}
:deep(.el-switch__action) {
  width: 16px;
  height: 16px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.el-select,
.el-input,
.el-input-number {
  flex-shrink: 0;
}

:deep(.el-input__wrapper),
:deep(.el-select__wrapper) {
  background-color: var(--panda-bg);
  box-shadow: none !important;
  border: 1px solid var(--panda-border);
  border-radius: 8px;
  padding: 4px 10px;
  height: 30px;
  transition: all 0.2s ease;
}

:deep(.el-input__inner) {
  color: var(--panda-text-main);
  font-weight: 500;
  font-size: 13px;
  height: 30px;
}

:deep(.el-input__wrapper.is-focus),
:deep(.el-select__wrapper.is-focused) {
  background-color: var(--panda-card-bg);
  border-color: var(--panda-accent);
  box-shadow: 0 0 0 1px var(--panda-accent) inset !important;
}

.el-button {
  border-radius: 8px;
  font-weight: 600;
  border: 1px solid var(--panda-border);
  color: var(--panda-text-main);
  background-color: var(--panda-card-bg);
  height: 30px;
  padding: 0 14px;
  font-size: 13px;
}

.el-button:hover {
  background-color: var(--panda-hover);
  border-color: var(--panda-text-sub);
  color: var(--panda-text-main);
}

.el-button--primary,
.el-button--primary.is-plain {
  background-color: var(--panda-accent) !important;
  border-color: var(--panda-accent) !important;
  color: var(--panda-card-bg) !important;
}

.el-button--primary:hover,
.el-button--primary.is-plain:hover {
  opacity: 0.85;
}

.webdav-actions .el-button {
  height: 32px;
  padding: 0 16px;
}

.action-buttons-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.action-buttons-container .el-divider--vertical {
  border-color: var(--panda-border);
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding-top: 10px;
}

:deep(.el-table) {
  --el-table-border-color: var(--panda-border);
  --el-table-header-bg-color: var(--panda-bg);
  --el-table-tr-bg-color: var(--panda-card-bg);
  --el-table-text-color: var(--panda-text-main);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--panda-border);
}

:deep(.el-table th.el-table__cell) {
  background-color: var(--panda-bg);
  color: var(--panda-text-sub);
  font-weight: 600;
  padding: 8px 0;
}

:deep(.el-table td.el-table__cell) {
  padding: 8px 0;
}

:deep(.el-pagination.is-background .el-pager li) {
  background-color: var(--panda-bg);
  color: var(--panda-text-sub);
  border-radius: 6px;
  min-width: 28px;
  height: 28px;
}

:deep(.el-pagination.is-background .el-pager li.is-active) {
  background-color: var(--panda-accent);
  color: var(--panda-card-bg);
}

:deep(.el-dialog) {
  background-color: var(--panda-card-bg);
  border-radius: 16px;
  border: 1px solid var(--panda-border);
}

:deep(.el-dialog__title) {
  color: var(--panda-text-main);
  font-weight: 700;
}

:deep(.backup-manager-dialog .el-dialog__header) {
  padding: 16px 20px !important;
  border-bottom: 1px solid var(--panda-border);
}

:deep(.backup-manager-dialog .el-dialog__body) {
  padding: 16px 20px !important;
}

:deep(.backup-manager-dialog .el-dialog__footer) {
  padding: 12px 20px;
  background-color: var(--panda-bg);
  border-top: 1px solid var(--panda-border);
}
</style>