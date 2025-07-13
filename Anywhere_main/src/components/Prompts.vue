<script setup>
import { ref, reactive, onMounted, computed, nextTick } from 'vue';
import { Plus, Delete, ArrowLeft, ArrowRight, Files, Close, UploadFilled, Position } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const currentConfig = ref({
  providers: {},
  providerOrder: [],
  prompts: {},
  tags: {},
  webdav: {}
});
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

const allPromptsCount = computed(() => {
  return Object.keys(currentConfig.value.prompts || {}).length;
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

// Prompts.vue - onMounted
onMounted(async () => {
  try {
    const result = await window.api.getConfig();

    if (result && result.config) {
      currentConfig.value = result.config;
    } else {
      console.error("Failed to get valid config from API.");
      currentConfig.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
    }
  } catch (error) {
    console.error("Error fetching config in Prompts.vue:", error);
    currentConfig.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
  } finally {
    await nextTick();
  }
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
  nextTick(() => {
    activeCollapseNames.value = [tagName];
  });
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

// async function setHotKey(promptKey, autoCopy){
//   if (window.api && window.api.sethotkey) {
//     await window.api.sethotkey(promptKey, autoCopy);
//   }else{
//     console.log("sethotkey API not available");
//   }
// }

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

function togglePromptEnable(promptKey, enableState) {
  if (currentConfig.value.prompts[promptKey]) {
    currentConfig.value.prompts[promptKey].enable = enableState;
    saveConfig();
  }
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
      <el-collapse v-model="activeCollapseNames" accordion class="tags-collapse-container">
        <el-collapse-item name="__ALL_PROMPTS__" class="tag-collapse-item">
          <template #title>
            <div class="tag-title-content">
              <span class="tag-name-header">{{ t('prompts.allPrompts') }} ({{ allEnabledPromptsCount }}|{{
                allPromptsCount
                }})</span>
            </div>
          </template>
          <div class="prompts-grid-container">
            <div v-if="allPromptsCount === 0" class="empty-tag-message">
              <el-text type="info" size="small">{{ t('prompts.noPrompts') }}</el-text>
            </div>
            <div v-for="(promptData, promptKey) in currentConfig.prompts" :key="promptKey" class="prompt-card">
              <div class="prompt-card-header">
                <el-avatar v-if="promptData.icon" :src="promptData.icon" shape="square" :size="28"
                  class="prompt-card-icon" />
                <el-tooltip :content="promptKey" placement="top">
                  <span class="prompt-name" @click="prepareEditPrompt(promptKey)">
                    {{ promptKey }}
                  </span>
                </el-tooltip>
                <div class="prompt-actions-header">
                  <!-- <el-button type="default" :icon="Position" circle plain size="small" @click="setHotKey(promptKey,false)" /> -->
                  <el-switch v-model="promptData.enable" @change="handlePromptEnableChange" size="small"
                    class="prompt-enable-toggle" />
                  <el-button type="danger" :icon="Delete" circle plain size="small" @click="deletePrompt(promptKey)" />
                </div>
              </div>
              <div class="prompt-description-container" @click="prepareEditPrompt(promptKey)"
                v-html="formatDescription(promptData.prompt)">
              </div>
            </div>
          </div>
        </el-collapse-item>

        <el-collapse-item v-for="tagName in sortedTagNames" :key="tagName" :name="tagName" class="tag-collapse-item">
          <template #title>
            <div class="tag-title-content">
              <span class="tag-name-header">{{ tagName }} ({{ tagEabledPromptsCount(tagName) }}|{{
                currentConfig.tags[tagName]?.length || 0 }})</span>
              <div class="tag-actions">
                <el-switch v-if="currentConfig.tags[tagName]?.length > 0"
                  :model-value="areAllPromptsInTagEnabled(tagName)"
                  @change="(value) => toggleAllPromptsInTag(tagName, value)" size="small" class="tag-enable-toggle" />
                <el-button type="danger" :icon="Delete" circle plain size="small" @click.stop="deleteTag(tagName)"
                  class="delete-tag-btn" />
              </div>
            </div>
          </template>
          <div class="prompts-grid-container">
            <div v-if="!promptsInTag(tagName).length" class="empty-tag-message">
              <el-text type="info" size="small">{{ t('prompts.noPromptsInTag') }}</el-text>
            </div>
            <div v-for="prompt in promptsInTag(tagName)" :key="prompt.key" class="prompt-card">
              <div class="prompt-card-header">
                <el-avatar v-if="prompt.icon" :src="prompt.icon" shape="square" :size="28" class="prompt-card-icon" />
                <el-tooltip :content="prompt.key" placement="top">
                  <span class="prompt-name" @click="prepareEditPrompt(prompt.key, tagName)">
                    {{ prompt.key }}
                  </span>
                </el-tooltip>
                <div class="prompt-card-tag-actions">
                  <el-button :icon="ArrowLeft" plain size="small" :disabled="isFirstInTag(tagName, prompt.key)"
                    @click="changePromptOrderInTag(tagName, prompt.key, 'left')"
                    :title="t('prompts.tooltips.moveLeft')" />
                  <el-button :icon="ArrowRight" plain size="small" :disabled="isLastInTag(tagName, prompt.key)"
                    @click="changePromptOrderInTag(tagName, prompt.key, 'right')"
                    :title="t('prompts.tooltips.moveRight')" />
                  <el-switch v-model="currentConfig.prompts[prompt.key].enable" @change="handlePromptEnableChange"
                    size="small" class="prompt-enable-toggle" />
                  <el-button type="danger" :icon="Close" circle plain size="small"
                    @click="removePromptFromTag(tagName, prompt.key)" :title="t('prompts.tooltips.removeFromTag')" />
                </div>
              </div>
              <div class="prompt-description-container" @click="prepareEditPrompt(prompt.key, tagName)"
                v-html="formatDescription(prompt.prompt)">
              </div>
            </div>
          </div>
          <div class="add-existing-prompt-to-tag-container" v-if="promptsAvailableToAssign(tagName).length > 0">
            <el-button class="add-existing-prompt-btn" plain size="small" :icon="Files"
              @click="openAssignPromptDialog(tagName)">
              {{ t('prompts.addExistingPrompt') }}
            </el-button>
          </div>
        </el-collapse-item>
      </el-collapse>

      <div class="bottom-actions-container">
        <el-button class="action-btn" @click="prepareAddPrompt" :icon="Plus">
          {{ t('prompts.addNewPrompt') }}
        </el-button>
        <el-button class="action-btn" @click="prepareAddTag" :icon="Plus">
          {{ t('prompts.addNewTag') }}
        </el-button>
      </div>
    </el-scrollbar>

    <!-- [MODIFIED] 编辑快捷助手对话框整体布局优化 -->
    <el-dialog v-model="showPromptEditDialog" :title="isNewPrompt ? t('prompts.addNewPrompt') : t('prompts.editPrompt')"
      width="700px" :close-on-click-modal="false">
      <el-form :model="editingPrompt" label-position="top" @submit.prevent="savePrompt">
        <el-row :gutter="20">
          <!-- 左侧：图标上传 -->
          <el-col :span="8">
            <el-form-item :label="t('prompts.iconLabel')">
              <div class="icon-editor-area">
                <el-upload class="icon-uploader" action="#" :show-file-list="false" :before-upload="handleIconUpload"
                  accept="image/png, image/jpeg, image/gif, image/webp, image/svg+xml" drag>
                  <template v-if="editingPrompt.icon">
                    <el-avatar :src="editingPrompt.icon" shape="square" :size="120" class="uploaded-icon-avatar" />
                  </template>
                  <template v-else>
                    <el-icon class="icon-uploader-icon" :size="40">
                      <UploadFilled />
                    </el-icon>
                    <div class="el-upload__text">
                      {{ t('prompts.dragIconHere') }}<em>{{ t('prompts.orClickToUpload') }}</em>
                    </div>
                  </template>
                </el-upload>
              </div>
              <div class="el-upload__tip">
                {{ t('prompts.iconUploadTip', { formats: 'JPG, PNG', maxSize: '100KB' }) }}
              </div>
              <el-button v-if="editingPrompt.icon" class="remove-icon-button" type="danger" plain size="small"
                @click="removeEditingIcon">
                {{ t('common.removeIcon') }}
              </el-button>
            </el-form-item>
          </el-col>

          <!-- 右侧：核心设置 -->
          <el-col :span="16">
            <el-row :gutter="20">
              <el-col :span="20"><el-form-item :label="t('prompts.promptKeyLabel')" required>
                  <el-input v-model="editingPrompt.key" :placeholder="t('prompts.promptKeyPlaceholder')" />
                </el-form-item></el-col>
              <el-col :span="4"><el-form-item :label="t('prompts.enabledLabel')">
                  <el-switch v-model="editingPrompt.enable" />
                </el-form-item></el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :span="12"><el-form-item :label="t('prompts.typeLabel')">
                  <el-select v-model="editingPrompt.type" style="width: 100%;">
                    <el-option :label="t('prompts.typeOptions.general')" value="general" />
                    <el-option :label="t('prompts.typeOptions.text')" value="over" />
                    <el-option :label="t('prompts.typeOptions.image')" value="img" />
                    <el-option :label="t('prompts.typeOptions.files')" value="files" />
                  </el-select>
                </el-form-item></el-col>
              <el-col :span="12"><el-form-item :label="t('prompts.showModeLabel')">
                  <el-select v-model="editingPrompt.showMode" style="width: 100%;">
                    <el-option :label="t('prompts.showModeOptions.input')" value="input" />
                    <el-option :label="t('prompts.showModeOptions.clipboard')" value="clipboard" />
                    <el-option :label="t('prompts.showModeOptions.window')" value="window" />
                  </el-select>
                </el-form-item></el-col>
            </el-row>
          </el-col>
        </el-row>

        <el-form-item :label="t('prompts.modelLabel')">
          <el-select v-model="editingPrompt.model" filterable clearable style="width: 100%;">
            <el-option v-for="item in availableModels" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>

        <!-- 模型参数设置区域 -->
        <el-form-item :label="t('prompts.llmParametersLabel')">
          <div class="llm-params-container">
            <div class="param-item">
              <span class="param-label">{{ t('prompts.streamLabel') }}</span>
              <el-switch v-model="editingPrompt.stream" />
            </div>
            <div class="param-item">
              <span class="param-label">{{ t('prompts.enableTemperatureLabel') }}</span>
              <el-switch v-model="editingPrompt.isTemperature" />
            </div>
          </div>
        </el-form-item>

        <el-form-item v-if="editingPrompt.isTemperature" :label="t('prompts.temperatureLabel')">
          <el-slider v-model="editingPrompt.temperature" :min="0" :max="2" :step="0.1" show-input />
        </el-form-item>

        <!-- 助手参数设置区域 -->
        <el-form-item :label="t('prompts.AssistantParametersLabel')">
          <div class="llm-params-container">
            <div class="param-item">
              <span class="param-label">{{ t('prompts.sendDirectLabel') }}</span>
              <el-switch v-model="editingPrompt.isDirectSend_normal" />
            </div>
            <div class="param-item">
              <span class="param-label">{{ t('prompts.sendFileLabel') }}</span>
              <el-switch v-model="editingPrompt.isDirectSend_file" />
            </div>
            <div class="param-item">
              <span class="param-label">{{ t('prompts.ifTextNecessary') }}</span>
              <el-switch v-model="editingPrompt.ifTextNecessary" />
            </div>
          </div>
        </el-form-item>

        <el-form-item :label="t('prompts.promptContentLabel')">
          <el-input v-model="editingPrompt.prompt" type="textarea" :rows="6" />
        </el-form-item>

        <el-form-item v-if="isNewPrompt" :label="t('prompts.addToTagLabel')">
          <el-select v-model="editingPrompt.selectedTag" :placeholder="t('prompts.addToTagPlaceholder')"
            style="width: 100%;" clearable>
            <el-option v-for="tagNameItem in sortedTagNames" :key="tagNameItem" :label="tagNameItem"
              :value="tagNameItem" />
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
        <el-button type=" primary" @click="addTag">{{ t('common.addTag') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAssignPromptDialog"
      :title="t('prompts.assignPromptsToTag', { tagName: assignPromptForm.targetTagName })" width="600px"
      :close-on-click-modal="false">
      <el-form :model="assignPromptForm" label-position="top">
        <el-form-item :label="t('prompts.selectPromptsToAddLabel')">
          <el-alert v-if="!promptsAvailableToAssign(assignPromptForm.targetTagName).length"
            :title="t('prompts.alerts.noPromptsToAssign')" type="info" :closable="false" show-icon />
          <el-select v-else v-model="assignPromptForm.selectedPromptKeys" multiple filterable
            :placeholder="t('prompts.selectPromptsPlaceholder')" style="width: 100%;">
            <el-option v-for="item in promptsAvailableToAssign(assignPromptForm.targetTagName)" :key="item.key"
              :label="item.label" :value="item.key" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAssignPromptDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="assignSelectedPromptsToTag"
          :disabled="!assignPromptForm.selectedPromptKeys.length">
          {{ t('common.assignSelected') }}
        </el-button>
      </template>
    </el-dialog>

  </div>
</template>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background-color: #f6f9fc;
  overflow: hidden;
}

.main-content-scrollbar {
  flex-grow: 1;
  width: 100%;
  background-color: #ffffff;
  padding-bottom: 130px;
  box-sizing: border-box;
}

.tags-collapse-container {
  padding: 15px;
  border: none;
}

.tag-collapse-item :deep(.el-collapse-item__header) {
  background-color: #e5f4ff;
  border: 1px solid #cbe0ff;
  border-radius: 6px;
  margin-bottom: 10px;
  padding: 0 16px;
  height: 48px;
  font-weight: 500;
  transition: all 0.2s;
}

.tag-collapse-item :deep(.el-collapse-item__header.is-active) {
  background-color: #d1e3ff;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  border-bottom-color: transparent;
  margin-bottom: 0;
}

.tag-collapse-item :deep(.el-collapse-item__wrap) {
  background-color: #ffffff;
  border: 1px solid #cbe0ff;
  border-top: none;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  margin-bottom: 10px;
}

.tag-collapse-item :deep(.el-collapse-item__content) {
  padding: 15px;
}

.tag-title-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.tag-name-header {
  font-weight: 600;
  color: #303133;
  font-size: 14px;
}

.tag-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prompts-grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  padding-top: 5px;
}

.prompt-card {
  background-color: #ffffff;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
}

.prompt-card:hover {
  border-color: #b3c0d8;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.prompt-card-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: nowrap;
  gap: 8px;
}

.prompt-card-icon {
  flex-shrink: 0;
  border-radius: 4px;
}

.prompt-name {
  font-weight: 500;
  color: #0070f3;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  flex-grow: 1;
  min-width: 0;
}

.prompt-name:hover {
  color: #005bb5;
  text-decoration: underline;
}

.prompt-actions-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

.prompt-card-tag-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

.prompt-description-container {
  background-color: #f0f2f5;
  border-radius: 4px;
  padding: 8px;
  font-size: 12px;
  color: #303133;
  flex-grow: 1;
  cursor: pointer;
  overflow: hidden;
  word-break: break-word;
  max-height: 4em;
  line-height: 1.6em;
  text-overflow: ellipsis;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
}

.prompt-enable-toggle {
  margin-left: 8px;
}

.empty-tag-message {
  grid-column: 1 / -1;
  text-align: center;
  padding: 20px 0;
  color: #909399;
}

.add-existing-prompt-to-tag-container {
  margin-top: 12px;
  text-align: center;
}

.add-existing-prompt-btn {
  color: #0070f3;
  border-color: #d1e3ff;
  background-color: #e2f0ff;
}

.add-existing-prompt-btn:hover {
  color: #005bb5;
  border-color: #b3d8ff;
  background-color: #d1e3ff;
}

.bottom-actions-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  display: flex;
  justify-content: space-around;
  gap: 12px;
  padding: 12px 15px;
  background-color: #ffffff;
  border-top: 1px solid #ebeef5;
  z-index: 10;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
}

.action-btn {
  flex-grow: 1;
  background-color: #0070f3;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  height: 40px;
  font-weight: 500;
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: #005bb5;
}

:deep(.el-dialog__header) {
  background-color: #e5f4ff;
  padding: 15px 20px;
  border-bottom: 1px solid #cbe0ff;
}

:deep(.el-dialog__title) {
  color: #303133;
  font-weight: 600;
  font-size: 16px;
}

:deep(.el-dialog__body) {
  padding: 20px;
}

:deep(.el-dialog__footer) {
  padding: 15px 20px;
  border-top: 1px solid #ebeef5;
}

.el-form-item {
  margin-bottom: 18px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: #606266;
  margin-bottom: 6px;
}

:deep(.el-button--small) {
  padding: 6px 12px;
  font-size: 12px;
}

:deep(.el-switch) {
  --el-switch-on-color: #0070f3;
}

/* [MODIFIED] 样式优化和新增 */
.icon-editor-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.icon-uploader :deep(.el-upload-dragger) {
  width: 120px;
  /* 增大尺寸以适应布局 */
  height: 120px;
  padding: 0;
  border: 1px dashed var(--el-border-color-darker);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  background-color: #fafafa;
  overflow: hidden;
}

.icon-uploader :deep(.el-upload-dragger:hover) {
  border-color: var(--el-color-primary);
}

.uploaded-icon-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.icon-uploader-icon {
  font-size: 32px;
  color: #8c939d;
  margin-bottom: 8px;
}

.el-upload__text {
  font-size: 12px;
  color: #606266;
  line-height: 1.2;
  text-align: center;
}

.el-upload__text em {
  color: var(--el-color-primary);
  font-style: normal;
}

.el-upload__tip {
  font-size: 12px;
  color: #909399;
  margin-top: 7px;
  line-height: 1.2;
  text-align: center;
  width: 100%;
}

.remove-icon-button {
  width: 120px;
  margin-top: 8px;
}

/* [NEW] 新增模型参数容器样式 */
.llm-params-container {
  display: flex;
  align-items: center;
  gap: 24px;
  background-color: #f7f9fc;
  border-radius: 4px;
  padding: 8px 12px;
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
  color: #606266;
}
</style>