<script setup>
import { ref, reactive, computed, inject } from 'vue';
import { Plus, Delete, ArrowLeft, ArrowRight, Files, Close, UploadFilled, Position, QuestionFilled, Switch } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';

const { t } = useI18n();

const currentConfig = inject('config');
const activeCollapseNames = ref([]);

const showPromptEditDialog = ref(false);
const editingPrompt = reactive({
  originalKey: null,
  key: "",
  type: "general",
  prompt: "",
  showMode: "window",
  model: "",
  enable: true,
  selectedTag: "",
  icon: "",
  stream: true,
  isTemperature: false,
  temperature: 0.7,
  isDirectSend_file: false,
  isDirectSend_normal: true,
  ifTextNecessary: false,
  voice: '',
  reasoning_effort: "default",
  window_width: 540,
  window_height: 700,
  isAlwaysOnTop: true,
  autoCloseOnBlur: true,
});
const isNewPrompt = ref(false);

const showAddTagDialog = ref(false);
const newTagName = ref("");

const showAssignPromptDialog = ref(false);
const assignPromptForm = reactive({
  targetTagName: '',
  selectedPromptKeys: [],
});

// [新增] 替换模型弹窗的状态
const showReplaceModelDialog = ref(false);
const replaceModelForm = reactive({
  sourceModel: null,
  targetModel: null,
});

const availableModels = computed(() => {
  const models = [];
  if (!currentConfig.value || !currentConfig.value.providers) return models;
  const providerOrder = currentConfig.value.providerOrder || [];
  providerOrder.forEach(providerId => {
    const provider = currentConfig.value.providers[providerId];
    if (provider && provider.enable && provider.modelList && provider.modelList.length > 0) {
      provider.modelList.forEach(modelName => {
        models.push({
          value: `${providerId}|${modelName}`,
          label: `${provider.name}|${modelName}`
        });
      });
    }
  });
  return models;
});

// [新增] 计算所有快捷助手中正在使用的模型列表 (用于替换模型的源模型下拉)
const usedModels = computed(() => {
    if (!currentConfig.value || !currentConfig.value.prompts) return [];
    const modelSet = new Set();
    Object.values(currentConfig.value.prompts).forEach(p => {
        if (p.model) {
            modelSet.add(p.model);
        }
    });
    return Array.from(modelSet).sort().map(modelValue => ({
        value: modelValue,
        label: availableModels.value.find(m => m.value === modelValue)?.label || modelValue
    }));
});

const availableVoices = computed(() => {
  const voices = currentConfig.value?.voiceList || [];
  return [
    { label: t('prompts.voiceOptions.off'), value: '' },
    ...voices.map(v => ({ label: v, value: v }))
  ];
});

const allPrompts = computed(() => {
    if (!currentConfig.value.prompts) return [];
    return Object.entries(currentConfig.value.prompts).map(([key, value]) => ({ key, ...value }));
});

const allPromptsCount = computed(() => allPrompts.value.length);

const allEnabledPromptsCount = computed(() => {
  if (!currentConfig.value.prompts) return 0;
  return Object.values(currentConfig.value.prompts).filter(p => p.enable).length;
});

const tagEabledPromptsCount = computed(() => (tagName) => {
  if (!currentConfig.value.tags || !currentConfig.value.tags[tagName]) return 0;
  return currentConfig.value.tags[tagName].reduce((count, promptKey) => {
    if (currentConfig.value.prompts[promptKey] && currentConfig.value.prompts[promptKey].enable) {
      count++;
    }
    return count;
  }, 0);
});

const sortedTagNames = computed(() => {
  if (!currentConfig.value.tags) return [];
  return Object.keys(currentConfig.value.tags).sort((a, b) => a.localeCompare(b));
});

const promptsInTag = computed(() => (tagName) => {
  if (!currentConfig.value.prompts || !currentConfig.value.tags || !currentConfig.value.tags[tagName]) {
    return [];
  }
  return currentConfig.value.tags[tagName]
    .map(promptKey => ({
      key: promptKey,
      ...(currentConfig.value.prompts[promptKey] || {})
    }))
    .filter(p => p.key && currentConfig.value.prompts[p.key]);
});

const promptsAvailableToAssign = computed(() => (tagName) => {
  if (!tagName || !currentConfig.value.prompts) return [];
  const promptsInCurrentTag = new Set(currentConfig.value.tags[tagName] || []);
  return Object.keys(currentConfig.value.prompts)
    .filter(key => !promptsInCurrentTag.has(key))
    .map(key => ({ key, label: key, data: currentConfig.value.prompts[key] }));
});

async function atomicSave(updateFunction, syncFeatures = false) {
  try {
    const latestConfigData = await window.api.getConfig();
    if (!latestConfigData || !latestConfigData.config) {
      throw new Error("Failed to get latest config from DB.");
    }
    const latestConfig = latestConfigData.config;

    updateFunction(latestConfig);
    
    const configToSave = { config: latestConfig };
    
    if (syncFeatures) {
      await window.api.updateConfig(configToSave);
    } else {
      await window.api.updateConfigWithoutFeatures(configToSave);
    }

    currentConfig.value = latestConfig;
    
  } catch (error) {
    console.error("Atomic save failed:", error);
    ElMessage.error('配置保存失败');
  }
}

function prepareAddTag() {
  newTagName.value = "";
  showAddTagDialog.value = true;
}

function addTag() {
  const tagName = newTagName.value.trim();
  if (!tagName) {
    ElMessage.warning(t('prompts.alerts.tagNameEmpty')); return;
  }
  if (currentConfig.value.tags[tagName]) {
    ElMessage.warning(t('prompts.alerts.tagExists', { tagName })); return;
  }
  
  atomicSave(config => {
    config.tags[tagName] = [];
    activeCollapseNames.value = [tagName];
  });
  
  showAddTagDialog.value = false;
}

function deleteTag(tagName) {
  atomicSave(config => {
    delete config.tags[tagName];
    // --- BUG FIX START ---
    // In accordion mode, activeCollapseNames.value is a string.
    // If we delete the currently active tag, we should close it.
    if (activeCollapseNames.value === tagName) {
        activeCollapseNames.value = '';
    }
    // --- BUG FIX END ---
  });
}

function toggleAllPromptsInTag(tagName, enableState) {
  atomicSave(config => {
    if (!config.tags[tagName]) return;
    config.tags[tagName].forEach(promptKey => {
      if (config.prompts[promptKey]) {
        config.prompts[promptKey].enable = enableState;
      }
    });
  }, true);
}

function areAllPromptsInTagEnabled(tagName) {
  if (!currentConfig.value.tags[tagName] || currentConfig.value.tags[tagName].length === 0) {
    return false;
  }
  return currentConfig.value.tags[tagName].every(promptKey =>
    currentConfig.value.prompts[promptKey] && currentConfig.value.prompts[promptKey].enable
  );
}

function prepareAddPrompt() {
  isNewPrompt.value = true;
  Object.assign(editingPrompt, {
    originalKey: null, key: "", type: "general", prompt: "", showMode: "window", model: "",
    enable: true, selectedTag: "", icon: "", stream: true, isTemperature: false, temperature: 0.7,
    isDirectSend_file: false, isDirectSend_normal: true, ifTextNecessary: false,
    voice: '', reasoning_effort: "default", window_width: 540, window_height: 700,
    position_x: 0, position_y: 0, isAlwaysOnTop: true, autoCloseOnBlur: true,
  });
  showPromptEditDialog.value = true;
}

// [修改] 核心修复点：将函数改为 async 并在打开弹窗前刷新配置
async function prepareEditPrompt(promptKey, currentTagName = null) {
  isNewPrompt.value = false;

  // [新增] 从数据库获取最新配置
  try {
    const latestConfigData = await window.api.getConfig();
    if (latestConfigData && latestConfigData.config) {
      // [新增] 更新本地的响应式 `config` 对象
      currentConfig.value = latestConfigData.config;
    }
  } catch (error) {
    console.error("Failed to refresh config before editing prompt:", error);
    ElMessage.error("无法获取最新的快捷助手设置，可能显示旧数据。");
  }

  // [修改] 现在 `currentConfig.value` 是最新的了
  const p = currentConfig.value.prompts[promptKey];
  if (!p) {
    ElMessage.error("快捷助手不存在，可能已被删除。");
    return;
  }

  // 后续逻辑保持不变，现在使用的是最新数据
  Object.assign(editingPrompt, {
    originalKey: promptKey, key: promptKey, type: p.type, prompt: p.prompt,
    showMode: p.showMode, model: p.model, enable: p.enable, icon: p.icon || "",
    selectedTag: currentTagName, stream: p.stream ?? true, isTemperature: p.isTemperature ?? false,
    temperature: p.temperature ?? 0.7, isDirectSend_file: p.isDirectSend_file ?? false,
    isDirectSend_normal: p.isDirectSend_normal ?? true, ifTextNecessary: p.ifTextNecessary ?? false,
    voice: p.voice ?? '', reasoning_effort: p.reasoning_effort ?? "default", 
    window_width: p.window_width ?? 540, window_height: p.window_height ?? 700,
    isAlwaysOnTop: p.isAlwaysOnTop ?? true, autoCloseOnBlur: p.autoCloseOnBlur ?? true,
  });
  showPromptEditDialog.value = true;
}

function savePrompt() {
  const newKey = editingPrompt.key.trim();
  const oldKey = editingPrompt.originalKey;
  if (!newKey) { ElMessage.warning(t('prompts.alerts.promptKeyEmpty')); return; }
  
  atomicSave(config => {
    if (newKey !== oldKey && config.prompts[newKey]) {
      ElMessage.warning(t('prompts.alerts.promptKeyExists', { newKey }));
      throw new Error("Prompt key exists");
    }

    const promptData = {
      type: editingPrompt.type, prompt: editingPrompt.prompt, showMode: editingPrompt.showMode,
      model: editingPrompt.model, enable: editingPrompt.enable, icon: editingPrompt.icon || "",
      stream: editingPrompt.stream, isTemperature: editingPrompt.isTemperature,
      temperature: editingPrompt.temperature, isDirectSend_file: editingPrompt.isDirectSend_file,
      isDirectSend_normal: editingPrompt.isDirectSend_normal, ifTextNecessary: editingPrompt.ifTextNecessary,
      voice: editingPrompt.voice, reasoning_effort: editingPrompt.reasoning_effort,
      window_width: editingPrompt.window_width, window_height: editingPrompt.window_height,
      isAlwaysOnTop: editingPrompt.isAlwaysOnTop, autoCloseOnBlur: editingPrompt.autoCloseOnBlur,
    };

    if (isNewPrompt.value) {
      promptData.position_x = 0; promptData.position_y = 0;
      config.prompts[newKey] = promptData;
      const targetTag = editingPrompt.selectedTag;
      if (targetTag && config.tags[targetTag] && !config.tags[targetTag].includes(newKey)) {
        config.tags[targetTag].push(newKey);
      }
    } else {
      const existingPrompt = config.prompts[oldKey] || {};
      promptData.position_x = existingPrompt.position_x || 0;
      promptData.position_y = existingPrompt.position_y || 0;
      if (newKey !== oldKey) {
        config.prompts[newKey] = { ...existingPrompt, ...promptData };
        delete config.prompts[oldKey];
        Object.keys(config.tags).forEach(tagName => {
          const index = config.tags[tagName].indexOf(oldKey);
          if (index !== -1) config.tags[tagName][index] = newKey;
        });
      } else {
        config.prompts[newKey] = { ...config.prompts[newKey], ...promptData };
      }
    }
  }, true);

  showPromptEditDialog.value = false;
}

function deletePrompt(promptKeyToDelete) {
  atomicSave(config => {
    if (!config.prompts[promptKeyToDelete]) return;
    delete config.prompts[promptKeyToDelete];
    Object.keys(config.tags).forEach(tagName => {
      config.tags[tagName] = config.tags[tagName].filter(pk => pk !== promptKeyToDelete);
    });
  }, true);
}

function removePromptFromTag(tagName, promptKey) {
  atomicSave(config => {
    if (config.tags[tagName]) {
      config.tags[tagName] = config.tags[tagName].filter(pk => pk !== promptKey);
    }
  });
}

function changePromptOrderInTag(tagName, promptKey, direction) {
  atomicSave(config => {
    const tagPrompts = config.tags[tagName];
    if (!tagPrompts) return;
    const currentIndex = tagPrompts.indexOf(promptKey);

    if (direction === 'left' && currentIndex > 0) {
      [tagPrompts[currentIndex], tagPrompts[currentIndex - 1]] = [tagPrompts[currentIndex - 1], tagPrompts[currentIndex]];
    } else if (direction === 'right' && currentIndex < tagPrompts.length - 1) {
      [tagPrompts[currentIndex], tagPrompts[currentIndex + 1]] = [tagPrompts[currentIndex + 1], tagPrompts[currentIndex]];
    }
  });
}

async function handlePromptEnableChange(promptKey, value) {
  try {
    await window.api.saveSetting(`prompts.${promptKey}.enable`, value);
    atomicSave(config => {}, true);
  } catch(e) {
    ElMessage.error('保存失败');
    currentConfig.value.prompts[promptKey].enable = !value;
  }
}

const isFirstInTag = (tagName, promptKey) => {
  const prompts = currentConfig.value.tags[tagName];
  return prompts && prompts.indexOf(promptKey) === 0;
};
const isLastInTag = (tagName, promptKey) => {
  const prompts = currentConfig.value.tags[tagName];
  return prompts && prompts.indexOf(promptKey) === prompts.length - 1;
};

function openAssignPromptDialog(tagName) {
  assignPromptForm.targetTagName = tagName;
  assignPromptForm.selectedPromptKeys = [];
  showAssignPromptDialog.value = true;
}

function assignSelectedPromptsToTag() {
  const tagName = assignPromptForm.targetTagName;
  atomicSave(config => {
    if (!tagName || !config.tags[tagName]) {
      ElMessage.warning(t('prompts.alerts.targetTagNotFound'));
      return;
    }
    assignPromptForm.selectedPromptKeys.forEach(promptKey => {
      if (!config.tags[tagName].includes(promptKey)) {
        config.tags[tagName].push(promptKey);
      }
    });
  });
  showAssignPromptDialog.value = false;
}

function formatDescription(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const displayedLines = lines.slice(0, 2);
  let formattedText = displayedLines.join('<br>');
  if (lines.length > 2 || (lines.length === 2 && lines[1].trim() === '' && text.endsWith('\n'))) {
    formattedText += '...';
  } else if (lines.length === 1 && text.length > 60) {
    formattedText = text.substring(0, 60) + '...';
  }
  return formattedText;
}

const handleIconUpload = (file) => {
  const isImage = file.type.startsWith('image/');
  if (!isImage) {
    ElMessage.error(t('prompts.alerts.invalidImageFormat', { formats: 'JPG, PNG' }));
    return false;
  }
  const isLt = file.size < 102400;
  if (!isLt) {
    ElMessage.error(t('prompts.alerts.imageSizeTooLarge', { maxSize: '100KB' }));
    return false;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    editingPrompt.icon = e.target.result;
  };
  reader.readAsDataURL(file);
  return false;
};

const removeEditingIcon = () => { editingPrompt.icon = ""; };

const downloadEditingIcon = () => {
    if (!editingPrompt.icon) { ElMessage.warning('没有可供下载的图标。'); return; }
    const link = document.createElement('a');
    link.href = editingPrompt.icon;
    const matches = editingPrompt.icon.match(/^data:image\/([a-zA-Z+]+);base64,/);
    const extension = matches && matches[1] ? matches[1].replace('svg+xml', 'svg') : 'png';
    link.download = `icon.${extension}`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

// [新增] 打开替换模型弹窗的函数
function prepareReplaceModels() {
    replaceModelForm.sourceModel = null;
    replaceModelForm.targetModel = null;
    showReplaceModelDialog.value = true;
}

// [BUG修复] 将函数改为 async 并使用 await
async function replaceModels() {
    const { sourceModel, targetModel } = replaceModelForm;
    if (!sourceModel || !targetModel) {
        ElMessage.warning('请选择源模型和目标模型。');
        return;
    }
    if (sourceModel === targetModel) {
        ElMessage.warning('源模型和目标模型不能相同。');
        return;
    }

    let updatedCount = 0;
    // [BUG修复] 使用 await 等待 atomicSave 完成
    await atomicSave(config => {
        Object.values(config.prompts).forEach(prompt => {
            if (prompt.model === sourceModel) {
                prompt.model = targetModel;
                updatedCount++;
            }
        });
    }, true); 

    ElMessage.success(t('prompts.alerts.modelsReplacedSuccess', { count: updatedCount }));
    showReplaceModelDialog.value = false;
}
</script>

<template>
  <div class="page-container">
    <el-scrollbar class="main-content-scrollbar">
      <div class="content-wrapper">
        <el-collapse v-model="activeCollapseNames" accordion class="tags-collapse-container">
          <el-collapse-item name="__ALL_PROMPTS__" class="tag-collapse-item">
            <template #title>
              <div class="tag-title-content">
                <span class="tag-name-header">{{ t('prompts.allPrompts') }} ({{ allEnabledPromptsCount }} / {{ allPromptsCount }})</span>
              </div>
            </template>
            <div class="prompts-grid-container">
              <div v-if="allPromptsCount === 0" class="empty-tag-message">
                <el-text type="info" size="small">{{ t('prompts.noPrompts') }}</el-text>
              </div>
              <div v-for="item in allPrompts" :key="item.key" class="prompt-card">
                <div class="prompt-card-header">
                  <el-avatar v-if="item.icon" :src="item.icon" shape="square" :size="28" class="prompt-card-icon" />
                  <el-icon v-else :size="28" class="prompt-card-icon-default"><Position /></el-icon>
                  <el-tooltip :content="item.key" placement="top">
                    <span class="prompt-name" @click="prepareEditPrompt(item.key)">{{ item.key }}</span>
                  </el-tooltip>
                  <div class="prompt-actions-header">
                    <el-switch v-model="item.enable" @change="(value) => handlePromptEnableChange(item.key, value)" size="small" class="prompt-enable-toggle" />
                    <el-button type="danger" :icon="Delete" circle plain size="small" @click="deletePrompt(item.key)" />
                  </div>
                </div>
                <div class="prompt-description-container" @click="prepareEditPrompt(item.key)" v-html="formatDescription(item.prompt)"></div>
              </div>
            </div>
          </el-collapse-item>

          <el-collapse-item v-for="tagName in sortedTagNames" :key="tagName" :name="tagName" class="tag-collapse-item">
            <template #title>
              <div class="tag-title-content">
                <span class="tag-name-header">{{ tagName }} ({{ tagEabledPromptsCount(tagName) }} / {{ currentConfig.tags[tagName]?.length || 0 }})</span>
                <div class="tag-actions">
                  <template v-if="currentConfig.tags[tagName]?.length > 0">
                    <el-tooltip :content="areAllPromptsInTagEnabled(tagName) ? '全部禁用' : '全部启用'">
                      <el-switch :model-value="areAllPromptsInTagEnabled(tagName)" @change="(value) => toggleAllPromptsInTag(tagName, value)" size="small" class="tag-enable-toggle" />
                    </el-tooltip>
                  </template>
                  <el-button type="danger" :icon="Delete" circle plain size="small" @click.stop="deleteTag(tagName)" class="delete-tag-btn" />
                </div>
              </div>
            </template>
            <div class="prompts-grid-container">
              <div v-if="!promptsInTag(tagName).length" class="empty-tag-message">
                <el-text type="info" size="small">{{ t('prompts.noPromptsInTag') }}</el-text>
              </div>
              <div v-for="item in promptsInTag(tagName)" :key="item.key" class="prompt-card">
                <div class="prompt-card-header">
                  <el-avatar v-if="item.icon" :src="item.icon" shape="square" :size="28" class="prompt-card-icon" />
                  <el-icon v-else :size="28" class="prompt-card-icon-default"><Position /></el-icon>
                  <el-tooltip :content="item.key" placement="top">
                    <span class="prompt-name" @click="prepareEditPrompt(item.key, tagName)">{{ item.key }}</span>
                  </el-tooltip>
                  <div class="prompt-card-tag-actions">
                    <el-button :icon="ArrowLeft" plain size="small" :disabled="isFirstInTag(tagName, item.key)" @click="changePromptOrderInTag(tagName, item.key, 'left')" :title="t('prompts.tooltips.moveLeft')" />
                    <el-button :icon="ArrowRight" plain size="small" :disabled="isLastInTag(tagName, item.key)" @click="changePromptOrderInTag(tagName, item.key, 'right')" :title="t('prompts.tooltips.moveRight')" />
                    <el-switch v-model="item.enable" @change="(value) => handlePromptEnableChange(item.key, value)" size="small" class="prompt-enable-toggle" />
                    <el-button type="danger" :icon="Close" circle plain size="small" @click="removePromptFromTag(tagName, item.key)" :title="t('prompts.tooltips.removeFromTag')" />
                  </div>
                </div>
                <div class="prompt-description-container" @click="prepareEditPrompt(item.key, tagName)" v-html="formatDescription(item.prompt)"></div>
              </div>
            </div>
            <div class="add-existing-prompt-to-tag-container" v-if="promptsAvailableToAssign(tagName).length > 0">
              <el-button class="add-existing-prompt-btn" plain size="small" :icon="Files" @click="openAssignPromptDialog(tagName)">
                {{ t('prompts.addExistingPrompt') }}
              </el-button>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </el-scrollbar>

    <div class="bottom-actions-container">
      <el-button class="action-btn" @click="prepareAddPrompt" :icon="Plus" type="primary">
        {{ t('prompts.addNewPrompt') }}
      </el-button>
      <el-button class="action-btn" @click="prepareAddTag" :icon="Plus">
        {{ t('prompts.addNewTag') }}
      </el-button>
      <el-button class="action-btn" @click="prepareReplaceModels" :icon="Switch">
        {{ t('prompts.replaceModels') }}
      </el-button>
    </div>

    <el-dialog v-model="showPromptEditDialog" :title="isNewPrompt ? t('prompts.addNewPrompt') : t('prompts.editPrompt')" width="700px" :close-on-click-modal="false" custom-class="edit-prompt-dialog">
      <el-form :model="editingPrompt" @submit.prevent="savePrompt" class="edit-prompt-form">
        <div class="top-section-grid">
          <div class="icon-area">
              <div class="icon-editor-area">
                <el-upload class="icon-uploader" action="#" :show-file-list="false" :before-upload="handleIconUpload" accept="image/png, image/jpeg, image/svg+xml">
                  <template v-if="editingPrompt.icon">
                    <el-avatar :src="editingPrompt.icon" shape="square" :size="64" class="uploaded-icon-avatar" />
                  </template>
                  <template v-else>
                    <div class="icon-uploader-placeholder">
                      <el-icon :size="20"><UploadFilled /></el-icon>
                    </div>
                  </template>
                </el-upload>
                <div class="icon-button-group">
                  <el-button class="icon-action-button" size="small" @click="downloadEditingIcon">{{ t('common.downloadIcon') }}</el-button>
                  <el-button class="icon-action-button" size="small" @click="removeEditingIcon">{{ t('common.removeIcon') }}</el-button>
                </div>
              </div>
          </div>
          <div class="form-fields-area">
             <div class="form-grid">
                <label for="promptName" class="el-form-item__label">{{ t('prompts.promptKeyLabelShort', '名称') }}</label>
                <el-form-item prop="key" class="grid-item no-margin">
                  <el-input id="promptName" v-model="editingPrompt.key" />
                </el-form-item>
                <div class="enable-switch-group">
                  <label class="el-form-item__label">{{ t('prompts.enabledLabel') }}</label>
                  <el-switch v-model="editingPrompt.enable" />
                </div>

                <div style="grid-column: 1 / 4;">
                <el-row :gutter="12">
                  <el-col :span="12">
                    <el-form-item :label="t('prompts.typeLabel')">
                      <el-select v-model="editingPrompt.type" style="width: 100%;">
                        <el-option :label="t('prompts.typeOptions.general')" value="general" />
                        <el-option :label="t('prompts.typeOptions.text')" value="over" />
                        <el-option :label="t('prompts.typeOptions.image')" value="img" />
                        <el-option :label="t('prompts.typeOptions.files')" value="files" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item :label="t('prompts.showModeLabel')">
                      <el-select v-model="editingPrompt.showMode" style="width: 100%;">
                        <el-option :label="t('prompts.showModeOptions.input')" value="input" />
                        <el-option :label="t('prompts.showModeOptions.clipboard')" value="clipboard" />
                        <el-option :label="t('prompts.showModeOptions.window')" value="window" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                </el-row>
              </div>

                <label class="el-form-item__label">{{ t('prompts.modelLabel') }}</label>
                <el-form-item class="grid-item full-width no-margin">
                   <el-select v-model="editingPrompt.model" filterable clearable style="width: 100%;">
                      <el-option v-for="item in availableModels" :key="item.value" :label="item.label" :value="item.value" />
                    </el-select>
                </el-form-item>
            </div>
          </div>
        </div>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="t('prompts.promptContentLabel')" label-position="top">
              <el-scrollbar height="150px" class="prompt-textarea-scrollbar">
                <el-input
                  v-model="editingPrompt.prompt"
                  type="textarea"
                  :autosize="{ minRows: 6 }"
                  resize="none"
                  placeholder="请输入提示词内容..."
                />
              </el-scrollbar>
            </el-form-item>
            <el-form-item label-position="top">
               <template #label>
                <div>
                  {{ t('prompts.llmParametersLabel') }}
                  <div class="form-item-subtitle">{{ t('prompts.llmParametersRemark', '（仅当前快捷助手模型生效，更换其他模型后不再生效）') }}</div>
                </div>
              </template>
              <div class="llm-params-container">
                <div class="param-item" v-if="editingPrompt.showMode === 'window'">
                    <span class="param-label">{{ t('prompts.streamLabel') }}</span>
                    <div class="spacer"></div>
                    <el-switch v-model="editingPrompt.stream" />
                </div>
                <div class="param-item">
                    <span class="param-label">{{ t('prompts.enableTemperatureLabel') }}</span>
                    <div class="spacer"></div>
                    <el-switch v-model="editingPrompt.isTemperature" />
                </div>
                <div class="param-item reasoning-effort-param">
                    <span class="param-label">{{ t('prompts.reasoningEffortLabel') }}</span>
                    <el-tooltip :content="t('prompts.tooltips.reasoningEffort')" placement="top"><el-icon class="tip-icon"><QuestionFilled /></el-icon></el-tooltip>
                    <div class="spacer"></div>
                    <el-select v-model="editingPrompt.reasoning_effort" size="small" style="width: 120px;">
                        <el-option :label="t('prompts.reasoningEffort.default')" value="default" />
                        <el-option :label="t('prompts.reasoningEffort.low')" value="low" />
                        <el-option :label="t('prompts.reasoningEffort.medium')" value="medium" />
                        <el-option :label="t('prompts.reasoningEffort.high')" value="high" />
                    </el-select>
                </div>
              </div>
            </el-form-item>
            <el-form-item v-if="editingPrompt.isTemperature" :label="t('prompts.temperatureLabel')" label-position="top" class="slider-form-item">
              <el-slider v-model="editingPrompt.temperature" :min="0" :max="2" :step="0.1" show-input />
            </el-form-item>
          </el-col>

          <el-col :span="12">
            <el-form-item :label="t('prompts.AssistantParametersLabel')" label-position="top">
              <div class="llm-params-container full-height">
                  <div class="param-item">
                      <span class="param-label">{{ t('prompts.sendDirectLabel') }}</span>
                      <el-tooltip :content="t('prompts.tooltips.sendDirect')" placement="top"><el-icon class="tip-icon"><QuestionFilled /></el-icon></el-tooltip>
                      <div class="spacer"></div>
                      <el-switch v-model="editingPrompt.isDirectSend_normal" />
                  </div>
                  <div class="param-item">
                      <span class="param-label">{{ t('prompts.sendFileLabel') }}</span>
                      <el-tooltip :content="t('prompts.tooltips.sendFile')" placement="top"><el-icon class="tip-icon"><QuestionFilled /></el-icon></el-tooltip>
                      <div class="spacer"></div>
                      <el-switch v-model="editingPrompt.isDirectSend_file" />
                  </div>
                  <div class="param-item">
                      <span class="param-label">{{ t('prompts.ifTextNecessary') }}</span>
                      <el-tooltip :content="t('prompts.tooltips.ifTextNecessary')" placement="top"><el-icon class="tip-icon"><QuestionFilled /></el-icon></el-tooltip>
                      <div class="spacer"></div>
                      <el-switch v-model="editingPrompt.ifTextNecessary" />
                  </div>
                  <div class="param-item voice-param">
                      <span class="param-label">{{ t('prompts.voiceLabel') }}</span>
                      <el-tooltip :content="t('prompts.voiceTooltip')" placement="top"><el-icon class="tip-icon"><QuestionFilled /></el-icon></el-tooltip>
                      <div class="spacer"></div>
                      <el-select v-model="editingPrompt.voice" :placeholder="t('prompts.voicePlaceholder')" clearable size="small" style="width: 120px;">
                          <el-option v-for="item in availableVoices" :key="item.value" :label="item.label" :value="item.value" />
                      </el-select>
                  </div>
                  <div v-if="editingPrompt.showMode === 'window'" class="param-item">
                    <span class="param-label">{{ t('prompts.isAlwaysOnTopLabel') }}</span>
                    <el-tooltip :content="t('prompts.tooltips.isAlwaysOnTopTooltip')" placement="top"><el-icon class="tip-icon"><QuestionFilled /></el-icon></el-tooltip>
                    <div class="spacer"></div>
                    <el-switch v-model="editingPrompt.isAlwaysOnTop" />
                  </div>
                  <div v-if="editingPrompt.showMode === 'window'" class="param-item">
                    <span class="param-label">{{ t('prompts.autoCloseOnBlurLabel') }}</span>
                    <el-tooltip :content="t('prompts.tooltips.autoCloseOnBlurTooltip')" placement="top"><el-icon class="tip-icon"><QuestionFilled /></el-icon></el-tooltip>
                    <div class="spacer"></div>
                    <el-switch v-model="editingPrompt.autoCloseOnBlur" />
                  </div>
                  <el-row :gutter="20" v-if="editingPrompt.showMode === 'window'" class="dimensions-group-row">
                    <el-col :span="12">
                      <el-form-item :label="t('setting.dimensions.widthLabel')" label-position="top">
                          <el-input-number v-model="editingPrompt.window_width" :min="200" :max="1200" controls-position="right" style="width: 100%;" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item :label="t('setting.dimensions.heightLabel')" label-position="top">
                          <el-input-number v-model="editingPrompt.window_height" :min="150" :max="900" controls-position="right" style="width: 100%;" />
                      </el-form-item>
                    </el-col>
                  </el-row>
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item v-if="isNewPrompt" :label="t('prompts.addToTagLabel')" label-position="top">
          <el-select v-model="editingPrompt.selectedTag" :placeholder="t('prompts.addToTagPlaceholder')" style="width: 100%;" clearable>
            <el-option v-for="tagNameItem in sortedTagNames" :key="tagNameItem" :label="tagNameItem" :value="tagNameItem" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPromptEditDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="savePrompt">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAddTagDialog" :title="t('prompts.addNewTag')" width="400px" :close-on-click-modal="false">
      <el-form @submit.prevent="addTag">
        <el-form-item :label="t('prompts.tagNameLabel')" required>
          <el-input v-model="newTagName" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddTagDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="addTag">{{ t('common.addTag') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAssignPromptDialog" :title="t('prompts.assignPromptsToTag', { tagName: assignPromptForm.targetTagName })" width="600px" :close-on-click-modal="false">
      <el-form :model="assignPromptForm" label-position="top">
        <el-form-item :label="t('prompts.selectPromptsToAddLabel')">
          <el-alert v-if="!promptsAvailableToAssign(assignPromptForm.targetTagName).length" :title="t('prompts.alerts.noPromptsToAssign')" type="info" :closable="false" show-icon />
          <el-select v-else v-model="assignPromptForm.selectedPromptKeys" multiple filterable :placeholder="t('prompts.selectPromptsPlaceholder')" style="width: 100%;">
            <el-option v-for="item in promptsAvailableToAssign(assignPromptForm.targetTagName)" :key="item.key" :label="item.label" :value="item.key" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAssignPromptDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="assignSelectedPromptsToTag" :disabled="!assignPromptForm.selectedPromptKeys.length">{{ t('common.assignSelected') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showReplaceModelDialog" :title="t('prompts.replaceModelsDialog.title')" width="600px" :close-on-click-modal="false">
        <el-form :model="replaceModelForm" label-position="top">
            <el-row :gutter="20">
                <el-col :span="12">
                    <el-form-item :label="t('prompts.replaceModelsDialog.sourceModel')">
                        <el-select v-model="replaceModelForm.sourceModel" filterable placeholder="请选择要被替换的模型" style="width: 100%;">
                            <el-option v-for="item in usedModels" :key="item.value" :label="item.label" :value="item.value" />
                        </el-select>
                    </el-form-item>
                </el-col>
                <el-col :span="12">
                    <el-form-item :label="t('prompts.replaceModelsDialog.targetModel')">
                        <el-select v-model="replaceModelForm.targetModel" filterable placeholder="请选择新的模型" style="width: 100%;">
                            <el-option v-for="item in availableModels" :key="item.value" :label="item.label" :value="item.value" />
                        </el-select>
                    </el-form-item>
                </el-col>
            </el-row>
        </el-form>
        <template #footer>
            <el-button @click="showReplaceModelDialog = false">{{ t('common.cancel') }}</el-button>
            <el-button type="primary" @click="replaceModels">{{ t('common.confirm') }}</el-button>
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
  height: 0;
  width: 100%;
}

.main-content-scrollbar :deep(.el-scrollbar__thumb) {
    background-color: var(--text-tertiary);
}
.main-content-scrollbar :deep(.el-scrollbar__thumb:hover) {
    background-color: var(--text-secondary);
}

.prompt-textarea-scrollbar {
  width: 100%;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  background-color: var(--bg-tertiary);
}

.prompt-textarea-scrollbar :deep(.el-textarea__inner) {
  box-shadow: none !important;
  background-color: transparent !important;
  padding: 8px 12px;
}

.prompt-textarea-scrollbar :deep(.el-textarea__inner::-webkit-scrollbar) {
  display: none;
}

html.dark .prompt-textarea-scrollbar :deep(.el-scrollbar__thumb) {
  background-color: var(--text-tertiary);
}

html.dark .prompt-textarea-scrollbar :deep(.el-scrollbar__thumb:hover) {
  background-color: var(--text-secondary);
}

.content-wrapper {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 24px 90px 24px;
}

.tags-collapse-container {
  border: none;
  background-color: transparent;
}

.tag-collapse-item {
  margin-bottom: 8px;
  border: 1px solid var(--border-primary);
  background-color: var(--bg-secondary);
  border-radius: var(--radius-lg);
  transition: box-shadow 0.3s ease;
}

.tag-collapse-item:hover {
  box-shadow: var(--shadow-md);
}

.tag-collapse-item :deep(.el-collapse-item__header) {
  background-color: var(--bg-secondary);
  border-bottom: 1px solid transparent;
  padding: 0 20px;
  height: 52px;
  font-weight: 600;
  border-radius: var(--radius-lg);
  transition: border-radius 0.15s ease-out, background-color 0.2s;
}

.tag-collapse-item.is-active :deep(.el-collapse-item__header) {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--bg-secondary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border-bottom: 1px solid var(--border-primary);
  border-top-left-radius: var(--radius-lg);
  border-top-right-radius: var(--radius-lg);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

html.dark .tag-collapse-item.is-active :deep(.el-collapse-item__header) {
    background-color: var(--bg-tertiary);
}

.tag-collapse-item :deep(.el-collapse-item__wrap) {
  background-color: var(--bg-secondary);
  border-top: none;
  border-bottom-left-radius: var(--radius-lg);
  border-bottom-right-radius: var(--radius-lg);
}

.tag-collapse-item :deep(.el-collapse-item__content) {
  padding: 20px 24px;
}

.tag-title-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.tag-name-header {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 15px;
}

.tag-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.prompts-grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  padding-top: 4px;
}

.prompt-card {
  background-color: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: 16px;
  transition: all 0.25s ease;
  display: flex;
  flex-direction: column;
  height: 130px;
}

.prompt-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-sm);
  border-color: var(--text-accent);
}

.prompt-card-header {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  gap: 12px;
}

.prompt-card-icon {
  flex-shrink: 0;
  border-radius: var(--radius-sm);
}

.prompt-card-icon-default {
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background-color: var(--bg-tertiary);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.prompt-name {
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
  min-width: 0;
}

.prompt-name:hover {
  color: var(--text-accent);
}

.prompt-actions-header,
.prompt-card-tag-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}

.prompt-description-container {
  padding: 0;
  font-size: 13px;
  color: var(--text-secondary);
  flex-grow: 1;
  cursor: pointer;
  overflow: hidden;
  word-break: break-word;
  line-height: 1.6;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  display: -webkit-box;
  -webkit-box-orient: vertical;
}

.prompt-enable-toggle {
  margin-left: 8px;
}

.empty-tag-message {
  grid-column: 1 / -1;
  text-align: center;
  padding: 24px 0;
  color: var(--text-secondary);
}

.add-existing-prompt-to-tag-container {
  margin-top: 20px;
  padding: 10px;
  text-align: center;
  background-color: var(--bg-tertiary);
  border-radius: var(--radius-md);
}

.add-existing-prompt-btn {
  border-style: dashed;
  width: 100%;
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

.action-btn.el-button--primary {
  background-color: var(--bg-accent);
  border-color: var(--bg-accent);
  color: var(--text-on-accent);
}

.edit-prompt-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.edit-prompt-form .el-form-item[label-position="top"] > :deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px !important;
  line-height: 1.2;
}

.top-section-grid {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  border-bottom: 1px solid var(--border-primary);
  padding-bottom: 15px;
  margin-bottom: 15px;
}

.icon-area {
  flex: 0 0 90px;
}

.form-fields-area {
  flex: 1;
}

.form-grid {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px 12px;
  align-items: center;
}

.form-grid .el-form-item__label {
  font-weight: 500;
  color: var(--text-secondary);
  padding: 0 !important;
  justify-content: flex-start;
}

.grid-item.no-margin {
  margin-bottom: 0;
}
.grid-item.full-width {
  grid-column: 2 / 4;
}

.grid-item-pair {
  grid-column: 3 / 4;
  display: flex;
  align-items: center;
  gap: 12px;
}
.grid-item-pair .el-form-item {
  flex-grow: 1;
}
.grid-item-pair label {
  flex-shrink: 0;
}

.enable-switch-group {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-self: end;
}
.enable-switch-group .el-form-item__label {
    margin-bottom: 0;
}


.icon-editor-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.icon-uploader :deep(.el-upload-dragger) {
  width: 64px;
  height: 64px;
  padding: 0;
  border: 2px dashed var(--border-primary);
  border-radius: var(--radius-md);
  background-color: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-uploader :deep(.el-upload-dragger:hover) {
    border-color: var(--border-accent);
}

.icon-uploader-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.icon-button-group {
  display: flex;
  gap: 6px;
  width: 100%;
  justify-content: center;
}

.icon-action-button {
  flex: 1;
  margin: 0;
}

/* Remaining styles for params */
.form-item-subtitle {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 400;
  line-height: 1.4;
  margin-top: 2px;
}

.llm-params-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: 16px;
  width: 100%;
  box-sizing: border-box;
}

.llm-params-container.full-height {
  height: 100%;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-label {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1;
}
.tip-icon {
  color: var(--text-tertiary);
  cursor: help;
}

.spacer {
  flex-grow: 1;
}

.param-item.voice-param .el-select {
  flex-shrink: 0;
}

.slider-form-item {
  margin-top: -10px;
}

:deep(.el-slider__runway) {
  background-color: var(--bg-tertiary);
}
:deep(.el-slider__bar) {
  background-color: var(--bg-accent);
}
:deep(.el-slider__button) {
  border-color: var(--bg-accent);
}
:deep(.el-slider .el-input-number) {
    width: 130px;
}

.dimensions-group-row {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-primary);
}
.dimensions-group-row .el-form-item {
    margin-bottom: 0;
}
.dimensions-group-row :deep(.el-form-item__label) {
    margin-bottom: 6px !important;
}

:deep(.edit-prompt-dialog .el-dialog__header) {
  padding: 15px 24px !important;
}

</style>