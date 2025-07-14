<script setup>
import { ref, reactive, computed, inject } from 'vue'; // [修改] 移除 onMounted, nextTick; 引入 inject
import { Plus, Delete, ArrowLeft, ArrowRight, Files, Close, UploadFilled, Position, QuestionFilled } from '@element-plus/icons-vue'; // [修改] 引入 QuestionFilled
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// [修改] 注入来自 App.vue 的响应式 config，修复数据流问题
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
  voice: null,
});
const isNewPrompt = ref(false);

const showAddTagDialog = ref(false);
const newTagName = ref("");

const showAssignPromptDialog = ref(false);
const assignPromptForm = reactive({
  targetTagName: '',
  selectedPromptKeys: [],
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

const availableVoices = computed(() => {
  const voices = currentConfig.value?.voiceList || [];
  return [
    { label: t('prompts.voiceOptions.off'), value: null },
    ...voices.map(v => ({ label: v, value: v }))
  ];
});

const allPrompts = computed(() => {
    if (!currentConfig.value.prompts) return [];
    return Object.entries(currentConfig.value.prompts).map(([key, value]) => ({ key, ...value }));
});

const allPromptsCount = computed(() => {
  return allPrompts.value.length;
});

const allEnabledPromptsCount = computed(() => {
  let count = 0;
  if (!currentConfig.value.prompts) return count;
  Object.keys(currentConfig.value.prompts).forEach(key => {
    if (currentConfig.value.prompts[key].enable) {
      count++;
    }
  });
  return count;
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

async function saveConfig() {
  try {
    const configToSave = {
      config: JSON.parse(JSON.stringify(currentConfig.value))
    };
    if (window.api && window.api.updateConfig) {
      await window.api.updateConfig(configToSave);
    } else {
      // console.warn("window.api.updateConfig is not available. Config not saved.");
    }
  } catch (error) {
    console.error("Error saving config:", error);
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
  currentConfig.value.tags[tagName] = [];
  saveConfig();
  showAddTagDialog.value = false;
  activeCollapseNames.value = [tagName];
}

function deleteTag(tagName) {
  if (!currentConfig.value.tags[tagName]) {
    ElMessage.warning("Tag not found.");
    return;
  }
  delete currentConfig.value.tags[tagName];
  activeCollapseNames.value = activeCollapseNames.value.filter(name => name !== tagName);
  saveConfig();
}

function toggleAllPromptsInTag(tagName, enableState) {
  if (!currentConfig.value.tags[tagName]) return;
  currentConfig.value.tags[tagName].forEach(promptKey => {
    if (currentConfig.value.prompts[promptKey]) {
      currentConfig.value.prompts[promptKey].enable = enableState;
    }
  });
  saveConfig();
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
    voice: null,
  });
  showPromptEditDialog.value = true;
}

function prepareEditPrompt(promptKey, currentTagName = null) {
  isNewPrompt.value = false;
  const p = currentConfig.value.prompts[promptKey];
  if (!p) return;
  Object.assign(editingPrompt, {
    originalKey: promptKey,
    key: promptKey,
    type: p.type,
    prompt: p.prompt,
    showMode: p.showMode,
    model: p.model,
    enable: p.enable,
    icon: p.icon || "",
    selectedTag: currentTagName,
    stream: p.stream ?? true,
    isTemperature: p.isTemperature ?? false,
    temperature: p.temperature ?? 0.7,
    isDirectSend_file: p.isDirectSend_file ?? false,
    isDirectSend_normal: p.isDirectSend_normal ?? true,
    ifTextNecessary: p.ifTextNecessary ?? false,
    voice: p.voice ?? null,
  });
  showPromptEditDialog.value = true;
}

function savePrompt() {
  const newKey = editingPrompt.key.trim();
  const oldKey = editingPrompt.originalKey;

  if (!newKey) {
    ElMessage.warning(t('prompts.alerts.promptKeyEmpty')); return;
  }
  if (newKey !== oldKey && currentConfig.value.prompts[newKey]) {
    ElMessage.warning(t('prompts.alerts.promptKeyExists', { newKey })); return;
  }

  const promptData = {
    type: editingPrompt.type,
    prompt: editingPrompt.prompt,
    showMode: editingPrompt.showMode,
    model: editingPrompt.model,
    enable: editingPrompt.enable,
    icon: editingPrompt.icon || "",
    stream: editingPrompt.stream,
    isTemperature: editingPrompt.isTemperature,
    temperature: editingPrompt.temperature,
    isDirectSend_file: editingPrompt.isDirectSend_file,
    isDirectSend_normal: editingPrompt.isDirectSend_normal,
    ifTextNecessary: editingPrompt.ifTextNecessary,
    voice: editingPrompt.voice,
  };

  if (isNewPrompt.value) {
    currentConfig.value.prompts[newKey] = promptData;
    const targetTag = editingPrompt.selectedTag;
    if (targetTag) {
      if (!currentConfig.value.tags[targetTag]) {
        currentConfig.value.tags[targetTag] = [];
      }
      if (!currentConfig.value.tags[targetTag].includes(newKey)) {
        currentConfig.value.tags[targetTag].push(newKey);
      }
    }
  } else {
    if (newKey !== oldKey) {
      currentConfig.value.prompts[newKey] = { ...(currentConfig.value.prompts[oldKey] || {}), ...promptData };
      delete currentConfig.value.prompts[oldKey];
      Object.keys(currentConfig.value.tags).forEach(tagName => {
        const index = currentConfig.value.tags[tagName].indexOf(oldKey);
        if (index !== -1) {
          currentConfig.value.tags[tagName][index] = newKey;
        }
      });
    } else {
      currentConfig.value.prompts[newKey] = { ...currentConfig.value.prompts[newKey], ...promptData };
    }
  }
  saveConfig();
  showPromptEditDialog.value = false;
}

function deletePrompt(promptKeyToDelete) {
  if (!currentConfig.value.prompts[promptKeyToDelete]) return;
  delete currentConfig.value.prompts[promptKeyToDelete];
  Object.keys(currentConfig.value.tags).forEach(tagName => {
    currentConfig.value.tags[tagName] = currentConfig.value.tags[tagName].filter(
      pk => pk !== promptKeyToDelete
    );
  });
  saveConfig();
}

function removePromptFromTag(tagName, promptKey) {
  if (currentConfig.value.tags[tagName]) {
    currentConfig.value.tags[tagName] = currentConfig.value.tags[tagName].filter(pk => pk !== promptKey);
    saveConfig();
  }
}

function changePromptOrderInTag(tagName, promptKey, direction) {
  const tagPrompts = currentConfig.value.tags[tagName];
  if (!tagPrompts) return;
  const currentIndex = tagPrompts.indexOf(promptKey);

  if (direction === 'left' && currentIndex > 0) {
    [tagPrompts[currentIndex], tagPrompts[currentIndex - 1]] = [tagPrompts[currentIndex - 1], tagPrompts[currentIndex]];
  } else if (direction === 'right' && currentIndex < tagPrompts.length - 1) {
    [tagPrompts[currentIndex], tagPrompts[currentIndex + 1]] = [tagPrompts[currentIndex + 1], tagPrompts[currentIndex]];
  }
  saveConfig();
}

function handlePromptEnableChange() {
  saveConfig();
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
  if (!tagName || !currentConfig.value.tags[tagName]) {
    ElMessage.warning(t('prompts.alerts.targetTagNotFound'));
    return;
  }
  assignPromptForm.selectedPromptKeys.forEach(promptKey => {
    if (!currentConfig.value.tags[tagName].includes(promptKey)) {
      currentConfig.value.tags[tagName].push(promptKey);
    }
  });
  saveConfig();
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

const removeEditingIcon = () => {
  editingPrompt.icon = "";
};
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
                    <el-switch v-model="currentConfig.prompts[item.key].enable" @change="handlePromptEnableChange" size="small" class="prompt-enable-toggle" />
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
                    <el-switch v-model="currentConfig.prompts[item.key].enable" @change="handlePromptEnableChange" size="small" class="prompt-enable-toggle" />
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
    </div>

    <!-- Dialogs -->
    <el-dialog v-model="showPromptEditDialog" :title="isNewPrompt ? t('prompts.addNewPrompt') : t('prompts.editPrompt')" width="700px" :close-on-click-modal="false">
      <el-form :model="editingPrompt" label-position="top" @submit.prevent="savePrompt">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item :label="t('prompts.iconLabel')">
              <div class="icon-editor-area">
                <el-upload class="icon-uploader" action="#" :show-file-list="false" :before-upload="handleIconUpload" accept="image/png, image/jpeg, image/svg+xml" drag>
                  <template v-if="editingPrompt.icon">
                    <el-avatar :src="editingPrompt.icon" shape="square" :size="120" class="uploaded-icon-avatar" />
                  </template>
                  <template v-else>
                    <div>
                      <el-icon class="icon-uploader-icon" :size="40"><UploadFilled /></el-icon>
                      <div class="el-upload__text">{{ t('prompts.dragIconHere') }}<em>{{ t('prompts.orClickToUpload') }}</em></div>
                    </div>
                  </template>
                </el-upload>
                <div class="el-upload__tip">{{ t('prompts.iconUploadTip', { formats: 'JPG, PNG', maxSize: '100KB' }) }}</div>
                <el-button v-if="editingPrompt.icon" class="remove-icon-button" type="danger" plain size="small" @click="removeEditingIcon">{{ t('common.removeIcon') }}</el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="16">
            <el-row :gutter="20">
              <el-col :span="20">
                <el-form-item :label="t('prompts.promptKeyLabel')" required>
                  <el-input v-model="editingPrompt.key" :placeholder="t('prompts.promptKeyPlaceholder')" />
                </el-form-item>
              </el-col>
              <el-col :span="4">
                <el-form-item :label="t('prompts.enabledLabel')">
                  <el-switch v-model="editingPrompt.enable" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
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
             <el-form-item :label="t('prompts.modelLabel')">
                <el-select v-model="editingPrompt.model" filterable clearable style="width: 100%;">
                  <el-option v-for="item in availableModels" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
          </el-col>
        </el-row>
        <el-form-item :label="t('prompts.promptContentLabel')">
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
        <el-form-item :label="t('prompts.llmParametersLabel')">
          <div class="llm-params-container">
            <div class="param-item">
                <span class="param-label">{{ t('prompts.streamLabel') }}</span>
                <div class="spacer"></div>
                <el-switch v-model="editingPrompt.stream" />
            </div>
            <div class="param-item">
                <span class="param-label">{{ t('prompts.enableTemperatureLabel') }}</span>
                <div class="spacer"></div>
                <el-switch v-model="editingPrompt.isTemperature" />
            </div>
          </div>
        </el-form-item>
        <el-form-item v-if="editingPrompt.isTemperature" :label="t('prompts.temperatureLabel')">
          <el-slider v-model="editingPrompt.temperature" :min="0" :max="2" :step="0.1" show-input />
        </el-form-item>
        <el-form-item :label="t('prompts.AssistantParametersLabel')">
          <div class="llm-params-container">
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
              <!-- 移动到此处的 Voice Selector -->
              <div class="param-item voice-param">
                  <span class="param-label">{{ t('prompts.voiceLabel') }}</span>
                  <el-tooltip :content="t('prompts.voiceTooltip')" placement="top"><el-icon class="tip-icon"><QuestionFilled /></el-icon></el-tooltip>
                  <div class="spacer"></div>
                  <el-select v-model="editingPrompt.voice" :placeholder="t('prompts.voicePlaceholder')" clearable size="small" style="width: 120px;">
                      <el-option v-for="item in availableVoices" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
              </div>
          </div>
        </el-form-item>
        <el-form-item v-if="isNewPrompt" :label="t('prompts.addToTagLabel')">
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
    <!-- 其他 Dialogs 保持不变 -->
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
  --el-switch-on-color: var(--bg-accent);
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

:deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px !important;
}

.icon-editor-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.icon-uploader :deep(.el-upload-dragger) {
  width: 96px;
  height: 96px;
  padding: 0;
  border: 2px dashed var(--border-primary);
  border-radius: var(--radius-md);
  background-color: var(--bg-primary);
}
.icon-uploader :deep(.el-upload-dragger:hover) {
    border-color: var(--border-accent);
}
.icon-uploader :deep(.el-upload__text) {
    color: var(--text-secondary);
}

.uploaded-icon-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.el-upload__tip {
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
}

.el-upload__text em {
  color: var(--text-accent);
  font-style: normal;
}

.remove-icon-button {
  width: 120px;
}

.llm-params-container {
  display: flex;
  flex-direction: column; 
  gap: 16px; 
  background-color: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: 16px;
  width: 100%;
  box-sizing: border-box;
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
</style>