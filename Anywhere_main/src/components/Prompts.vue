<script setup>
import { ref, reactive, computed, inject, watch, nextTick, onMounted } from 'vue';
import { Plus, Delete, Close, ChatLineRound, UploadFilled, Position, QuestionFilled, Switch, Refresh, Edit, Download } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';

const { t } = useI18n();

const currentConfig = inject('config');
const activeTabName = ref('__ALL_PROMPTS__');
const searchQueries = reactive({});
const tabsContainerRef = ref(null);
const availableSkills = ref([]);

const fetchAvailableSkills = async () => {
  // 确保 config 已加载且有 skillPath
  if (currentConfig.value && currentConfig.value.skillPath) {
    try {
      const skills = await window.api.listSkills(currentConfig.value.skillPath);
      // 过滤出未禁用的 Skill，并按名称排序
      availableSkills.value = skills
        .filter(s => !s.disabled)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.error("Failed to fetch skills:", e);
      availableSkills.value = [];
    }
  } else {
    availableSkills.value = [];
  }
};

// 在组件挂载时获取一次
onMounted(() => {
  fetchAvailableSkills();
});

const openPromptWindow = (promptKey) => {
  window.api.coderedirect(promptKey);
};
watch(activeTabName, (newTabName) => {
  nextTick(() => {
    if (!tabsContainerRef.value) return;
    const scrollContainer = tabsContainerRef.value.$el.querySelector('.el-tabs__nav-wrap');
    if (!scrollContainer) return;
    const activeTabEl = scrollContainer.querySelector(`#tab-${newTabName}`);

    if (activeTabEl) {
      activeTabEl.scrollIntoView({
        behavior: 'smooth', // 平滑滚动
        inline: 'center',   // 水平居中
        block: 'nearest'    // 垂直方向上保持最近
      });
    } else if (newTabName === '__ALL_PROMPTS__') {
      scrollContainer.scrollTo({ left: 0, behavior: 'smooth' });
    }
  });
});


const activeTabPrompts = computed(() => {
  const tab = activeTabName.value;
  let prompts;
  if (tab === '__ALL_PROMPTS__') {
    prompts = allPrompts.value;
  } else {
    prompts = promptsInTag.value(tab);
  }
  return prompts.sort((a, b) => a.key.localeCompare(b.key));
});

const areAllPromptsEnabled = computed(() => {
  if (allPromptsCount.value === 0) return false;
  return allPrompts.value.every(p => p.enable);
});

function toggleAllPrompts(enableState) {
  atomicSave(config => {
    Object.keys(config.prompts).forEach(promptKey => {
      config.prompts[promptKey].enable = enableState;
    });
  }, true);
}

function getFilteredPrompts(prompts, query) {
  if (!query) {
    return prompts;
  }
  const lowerCaseQuery = query.toLowerCase();
  return prompts.filter(item =>
    (item.key && item.key.toLowerCase().includes(lowerCaseQuery)) ||
    (item.prompt && item.prompt.toLowerCase().includes(lowerCaseQuery))
  );
}

const showPromptEditDialog = ref(false);
const editingPrompt = reactive({
  originalKey: null,
  key: "",
  type: "general",
  prompt: "",
  showMode: "window",
  model: "",
  enable: true,
  selectedTag: [],
  icon: "",
  stream: true,
  isTemperature: false,
  temperature: 0.7,
  isDirectSend_file: false,
  isDirectSend_normal: true,
  ifTextNecessary: false,
  voice: '',
  reasoning_effort: "default",
  defaultMcpServers: [],
  defaultSkills: [],
  window_width: 540,
  window_height: 700,
  isAlwaysOnTop: true,
  autoCloseOnBlur: true,
  matchRegex: "",
  backgroundImage: "",
  backgroundOpacity: 0.6,
  backgroundBlur: 0,
  autoSaveChat: false,
});

const showIconEditDialog = ref(false);
const iconEditorState = reactive({
  imgUrl: '',
  scale: 1,
  radius: 0, // 0 - 50 (%)
  offsetX: 0,
  offsetY: 0
});
const editorCanvasRef = ref(null);
let editorImageObj = null;
let isDraggingImage = false;
let lastMouseX = 0;
let lastMouseY = 0;

// 处理图片选择/拖拽/粘贴入口
const processIconFile = (file) => {
  const isImage = file.type.startsWith('image/');
  if (!isImage) {
    ElMessage.error(t('prompts.alerts.invalidImageFormat', { formats: 'JPG, PNG, WEBP' }));
    return;
  }
  // 此时不限制大小，因为会在编辑器中压缩裁剪
  const reader = new FileReader();
  reader.onload = (e) => {
    openIconEditor(e.target.result);
  };
  reader.readAsDataURL(file);
};

// 打开编辑器
const openIconEditor = (dataUrl) => {
  iconEditorState.imgUrl = dataUrl;
  iconEditorState.scale = 1;
  iconEditorState.radius = 0;
  iconEditorState.offsetX = 0;
  iconEditorState.offsetY = 0;

  editorImageObj = new Image();
  editorImageObj.onload = () => {
    showIconEditDialog.value = true;
    nextTick(() => drawEditorCanvas());
  };
  editorImageObj.src = dataUrl;
};

// 绘制 Canvas
const drawEditorCanvas = () => {
  const canvas = editorCanvasRef.value;
  if (!canvas || !editorImageObj) return;
  const ctx = canvas.getContext('2d');
  const size = 256; // 输出尺寸固定为 256x256

  // 清空
  ctx.clearRect(0, 0, size, size);

  // 1. 绘制圆角遮罩
  ctx.save();
  ctx.beginPath();
  const r = (iconEditorState.radius / 100) * size;
  ctx.roundRect(0, 0, size, size, r);
  ctx.clip();

  // 2. 绘制图片 (应用缩放和偏移)
  // 计算图片绘制尺寸（保持比例覆盖容器）
  const imgAspect = editorImageObj.width / editorImageObj.height;
  let drawW = size * iconEditorState.scale;
  let drawH = size * iconEditorState.scale;

  if (imgAspect > 1) {
    drawH = size * iconEditorState.scale;
    drawW = drawH * imgAspect;
  } else {
    drawW = size * iconEditorState.scale;
    drawH = drawW / imgAspect;
  }

  // 居中 + 偏移
  const x = (size - drawW) / 2 + iconEditorState.offsetX;
  const y = (size - drawH) / 2 + iconEditorState.offsetY;

  ctx.drawImage(editorImageObj, x, y, drawW, drawH);
  ctx.restore();
};

// 保存编辑后的图标
const saveEditedIcon = () => {
  const canvas = editorCanvasRef.value;
  if (canvas) {
    editingPrompt.icon = canvas.toDataURL('image/png');
    showIconEditDialog.value = false;
  }
};

// 交互事件处理
const handleIconUploadChange = (file) => {
  processIconFile(file); // 使用新逻辑
  return false; // 阻止默认上传
};

const handleIconDrop = (e) => {
  const file = e.dataTransfer.files[0];
  if (file) processIconFile(file);
};

const handleIconPaste = (e) => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let index in items) {
    const item = items[index];
    if (item.kind === 'file') {
      const blob = item.getAsFile();
      processIconFile(blob);
      return;
    }
  }
};

// Canvas 拖拽图片逻辑
const handleCanvasMouseDown = (e) => {
  isDraggingImage = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
};
const handleCanvasMouseMove = (e) => {
  if (!isDraggingImage) return;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  // 由于 Canvas 显示大小可能被 CSS 缩放，这里粗略映射
  iconEditorState.offsetX += dx;
  iconEditorState.offsetY += dy;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  drawEditorCanvas();
};
const handleCanvasMouseUp = () => { isDraggingImage = false; };
const handleCanvasWheel = (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  let newScale = iconEditorState.scale + delta;
  if (newScale < 0.1) newScale = 0.1;
  if (newScale > 5) newScale = 5;
  iconEditorState.scale = newScale;
  drawEditorCanvas();
};

// 监听参数变化重绘
watch(() => [iconEditorState.scale, iconEditorState.radius], () => {
  drawEditorCanvas();
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

// 获取可用的MCP服务列表
const availableMcpServers = computed(() => {
  if (!currentConfig.value || !currentConfig.value.mcpServers) return [];
  return Object.entries(currentConfig.value.mcpServers)
    .filter(([, server]) => server.isActive)
    .map(([id, server]) => ({
      value: id,
      label: server.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label)); // 新增此行以按名称排序
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
    ElMessage.error(t('prompts.alerts.saveFailed'));
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
    // 切换到新创建的标签
    activeTabName.value = tagName;
  });

  showAddTagDialog.value = false;
}

function deleteTag(tagName) {
  atomicSave(config => {
    delete config.tags[tagName];
    // 如果删除的是当前活动标签，则切换到“全部”标签
    if (activeTabName.value === tagName) {
      activeTabName.value = '__ALL_PROMPTS__';
    }
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
  fetchAvailableSkills(); // [新增] 打开前刷新 Skill 列表
  isNewPrompt.value = true;
  Object.assign(editingPrompt, {
    originalKey: null, key: "", type: "general", prompt: "", showMode: "window", model: "",
    enable: true, selectedTag: [], icon: "", stream: true, isTemperature: false, temperature: 0.7,
    isDirectSend_file: false, isDirectSend_normal: true, ifTextNecessary: false,
    voice: '', reasoning_effort: "default", defaultMcpServers: [],
    defaultSkills: [],
    window_width: 540, window_height: 700,
    position_x: 0, position_y: 0,
    isAlwaysOnTop: currentConfig.value.isAlwaysOnTop_global,
    autoCloseOnBlur: currentConfig.value.autoCloseOnBlur_global,
    matchRegex: "",
    backgroundImage: "",
    backgroundOpacity: 0.6,
    backgroundBlur: 0,
    autoSaveChat: currentConfig.value.autoSaveChat_global ?? false,
  });
  showPromptEditDialog.value = true;
}

async function prepareEditPrompt(promptKey, currentTagName = null) {
  fetchAvailableSkills(); // [新增] 打开前刷新 Skill 列表
  isNewPrompt.value = false;

  try {
    const latestConfigData = await window.api.getConfig();
    if (latestConfigData && latestConfigData.config) {
      currentConfig.value = latestConfigData.config;
    } else {
      throw new Error("Failed to fetch latest config.");
    }
  } catch (error) {
    console.error("Failed to refresh config before editing prompt:", error);
    ElMessage.error(t('prompts.alerts.configFetchFailed'));
  }

  const p = currentConfig.value.prompts[promptKey];
  if (!p) {
    ElMessage.error(t('prompts.alerts.promptNotFound'));
    return;
  }

  const belongingTags = Object.entries(currentConfig.value.tags || {})
    .filter(([, promptKeys]) => promptKeys.includes(promptKey))
    .map(([tagName]) => tagName);

  Object.assign(editingPrompt, {
    originalKey: promptKey, key: promptKey, type: p.type, prompt: p.prompt,
    showMode: p.showMode, model: p.model, enable: p.enable, icon: p.icon || "",
    selectedTag: belongingTags,
    stream: p.stream ?? true, isTemperature: p.isTemperature ?? false,
    temperature: p.temperature ?? 0.7, isDirectSend_file: p.isDirectSend_file ?? false,
    isDirectSend_normal: p.isDirectSend_normal ?? true, ifTextNecessary: p.ifTextNecessary ?? false,
    voice: p.voice ?? '', reasoning_effort: p.reasoning_effort ?? "default",
    defaultMcpServers: p.defaultMcpServers ?? [],
    defaultSkills: p.defaultSkills || [],
    window_width: p.window_width ?? 540, window_height: p.window_height ?? 700,
    isAlwaysOnTop: p.isAlwaysOnTop ?? true, autoCloseOnBlur: p.autoCloseOnBlur ?? true,
    matchRegex: p.matchRegex || "",
    backgroundImage: p.backgroundImage || "",
    backgroundOpacity: p.backgroundOpacity ?? 0.6,
    backgroundBlur: p.backgroundBlur ?? 0,
    autoSaveChat: p.autoSaveChat ?? false,
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
      defaultMcpServers: editingPrompt.defaultMcpServers,
      defaultSkills: editingPrompt.defaultSkills,
      window_width: editingPrompt.window_width, window_height: editingPrompt.window_height,
      isAlwaysOnTop: editingPrompt.isAlwaysOnTop, autoCloseOnBlur: editingPrompt.autoCloseOnBlur,
      matchRegex: editingPrompt.matchRegex,
      backgroundImage: editingPrompt.backgroundImage,
      backgroundOpacity: editingPrompt.backgroundOpacity,
      backgroundBlur: editingPrompt.backgroundBlur,
      autoSaveChat: editingPrompt.autoSaveChat,
    };

    // 1. 更新或创建 prompts 对象中的条目
    if (isNewPrompt.value) {
      promptData.position_x = 0; promptData.position_y = 0;
      config.prompts[newKey] = promptData;
    } else {
      const existingPrompt = config.prompts[oldKey] || {};
      promptData.position_x = existingPrompt.position_x || 0;
      promptData.position_y = existingPrompt.position_y || 0;

      // 如果键已更改，则需要重命名
      if (newKey !== oldKey) {
        config.prompts[newKey] = { ...existingPrompt, ...promptData };
        delete config.prompts[oldKey];
      } else {
        config.prompts[newKey] = { ...config.prompts[newKey], ...promptData };
      }
    }

    // 2. 更新标签
    const keyToUseForTags = isNewPrompt.value ? newKey : oldKey;
    const oldTags = Object.keys(config.tags).filter(tagName => config.tags[tagName].includes(keyToUseForTags));
    const newTags = editingPrompt.selectedTag;

    // 从不再包含此快捷助手的标签中移除
    oldTags.forEach(tagName => {
      if (!newTags.includes(tagName)) {
        config.tags[tagName] = config.tags[tagName].filter(pk => pk !== keyToUseForTags);
      }
    });

    // 添加到新的标签中
    newTags.forEach(tagName => {
      if (!config.tags[tagName]) config.tags[tagName] = [];
      if (!config.tags[tagName].includes(keyToUseForTags)) {
        config.tags[tagName].push(keyToUseForTags);
      }
    });

    // 如果 prompt key 被重命名，更新所有标签中的引用
    if (!isNewPrompt.value && newKey !== oldKey) {
      Object.keys(config.tags).forEach(tagName => {
        const index = config.tags[tagName].indexOf(oldKey);
        if (index > -1) {
          config.tags[tagName][index] = newKey;
        }
      });
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
    atomicSave(config => { }, true);
  } catch (e) {
    ElMessage.error(t('prompts.alerts.saveSettingFailed'));
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
  const singleLineText = text.replace(/\n/g, ' ').trim();
  const maxLength = 110;
  if (singleLineText.length > maxLength) {
    return singleLineText.substring(0, maxLength) + '...';
  }
  return singleLineText;
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
  if (!editingPrompt.icon) { ElMessage.warning(t('prompts.alerts.noIconToDownload')); return; }
  const link = document.createElement('a');
  link.href = editingPrompt.icon;
  const matches = editingPrompt.icon.match(/^data:image\/([a-zA-Z+]+);base64,/);
  const extension = matches && matches[1] ? matches[1].replace('svg+xml', 'svg') : 'png';
  link.download = `icon.${extension}`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

// 打开替换模型弹窗的函数
function prepareReplaceModels() {
  replaceModelForm.sourceModel = null;
  replaceModelForm.targetModel = null;
  showReplaceModelDialog.value = true;
}

// 将函数改为 async 并使用 await
async function replaceModels() {
  const { sourceModel, targetModel } = replaceModelForm;
  if (!sourceModel || !targetModel) {
    ElMessage.warning(t('prompts.alerts.selectModels'));
    return;
  }
  if (sourceModel === targetModel) {
    ElMessage.warning(t('prompts.alerts.sameModels'));
    return;
  }

  let updatedCount = 0;
  // 使用 await 等待 atomicSave 完成
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

// 刷新配置函数
async function refreshPromptsConfig() {
  try {
    const latestConfigData = await window.api.getConfig();
    if (latestConfigData && latestConfigData.config) {
      currentConfig.value = latestConfigData.config;
      ElMessage.success(t('prompts.alerts.refreshSuccess'));
    } else {
      throw new Error(t('prompts.alerts.configInvalid'));
    }
  } catch (error) {
    console.error("刷新配置失败:", error);
    ElMessage.error(t('prompts.alerts.refreshFailed'));
  }
}
</script>

<template>
  <div class="page-container">
    <div class="prompts-header">
      <div class="custom-all-tab" :class="{ 'is-active': activeTabName === '__ALL_PROMPTS__' }"
        @click="activeTabName = '__ALL_PROMPTS__'">
        <div class="tab-label-multiline">
          <span class="tab-name">{{ t('prompts.allPrompts') }}</span>
          <span class="tab-count">({{ allEnabledPromptsCount }} / {{ allPromptsCount }})</span>
        </div>
      </div>

      <el-tabs v-model="activeTabName" ref="tabsContainerRef" class="tags-tabs-container">
        <el-tab-pane v-for="tagName in sortedTagNames" :key="tagName" :name="tagName">
          <template #label>
            <div class="tab-label-multiline">
              <span class="tab-name">{{ tagName }}</span>
              <span class="tab-count">({{ tagEabledPromptsCount(tagName) }} / {{ currentConfig.tags[tagName]?.length ||
                0 }})</span>
            </div>
          </template>
        </el-tab-pane>
      </el-tabs>

      <!-- 右侧操作按钮区域，顺序和禁用逻辑已调整 -->
      <div class="tab-actions">
        <el-tooltip v-if="activeTabName === '__ALL_PROMPTS__'"
          :content="areAllPromptsEnabled ? t('prompts.disableAll') : t('prompts.enableAll')">
          <el-switch :model-value="areAllPromptsEnabled" @change="(value) => toggleAllPrompts(value)"
            class="tag-enable-toggle" />
        </el-tooltip>
        <el-tooltip v-else
          :content="areAllPromptsInTagEnabled(activeTabName) ? t('prompts.disableAll') : t('prompts.enableAll')">
          <el-switch :model-value="areAllPromptsInTagEnabled(activeTabName)"
            @change="(value) => toggleAllPromptsInTag(activeTabName, value)" class="tag-enable-toggle"
            :disabled="!currentConfig.tags[activeTabName] || currentConfig.tags[activeTabName].length === 0" />
        </el-tooltip>

        <el-tooltip :content="t('prompts.addExistingPrompt')" placement="top">
          <el-button class="add-existing-prompt-btn" plain size="small" :icon="Plus" circle
            @click="openAssignPromptDialog(activeTabName)"
            :disabled="activeTabName === '__ALL_PROMPTS__' || !promptsAvailableToAssign(activeTabName) || promptsAvailableToAssign(activeTabName).length === 0" />
        </el-tooltip>

        <el-button type="danger" :icon="Delete" circle plain size="small" @click.stop="deleteTag(activeTabName)"
          class="delete-tag-btn" :disabled="activeTabName === '__ALL_PROMPTS__'" />
      </div>
    </div>

    <el-scrollbar class="main-content-scrollbar">
      <div class="content-wrapper">
        <div class="search-input-container">
          <el-input v-model="searchQueries[activeTabName]" :placeholder="t('prompts.searchPlaceholder')" clearable />
        </div>
        <div class="prompts-grid-container">
          <div v-if="!activeTabPrompts.length" class="empty-tag-message">
            <el-text type="info" size="small">{{ activeTabName === '__ALL_PROMPTS__' ? t('prompts.noPrompts') :
              t('prompts.noPromptsInTag') }}</el-text>
          </div>
          <div v-for="item in getFilteredPrompts(activeTabPrompts, searchQueries[activeTabName])" :key="item.key"
            class="prompt-card">
            <div class="prompt-card-header">
              <el-avatar v-if="item.icon" :src="item.icon" shape="square" :size="28" class="prompt-card-icon" />
              <el-icon v-else :size="28" class="prompt-card-icon-default">
                <Position />
              </el-icon>
              <el-tooltip :content="item.key" placement="top">
                <span class="prompt-name" @click="prepareEditPrompt(item.key, activeTabName)">{{ item.key }}</span>
              </el-tooltip>
              <el-tooltip v-if="item.showMode === 'window' && item.enable" :content="t('prompts.openWindow')"
                placement="top">
                <el-button :icon="ChatLineRound" circle text @click.stop="openPromptWindow(item.key)"
                  class="open-prompt-btn" />
              </el-tooltip>
              <div class="prompt-card-tag-actions">
                <el-switch v-model="item.enable" @change="(value) => handlePromptEnableChange(item.key, value)"
                  size="small" class="prompt-enable-toggle" />
                <el-button v-if="activeTabName !== '__ALL_PROMPTS__'" type="danger" :icon="Close" circle plain
                  size="small" @click="removePromptFromTag(activeTabName, item.key)"
                  :title="t('prompts.tooltips.removeFromTag')" />
                <el-button v-else type="danger" :icon="Delete" circle plain size="small" @click="deletePrompt(item.key)"
                  :title="t('prompts.deletePrompt')" />
              </div>
            </div>
            <div class="prompt-description-container" @click="prepareEditPrompt(item.key, activeTabName)"
              v-html="formatDescription(item.prompt)"></div>
          </div>
        </div>
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
      <el-button class="refresh-fab-button" :icon="Refresh" type="primary" circle @click="refreshPromptsConfig" />
    </div>

    <el-dialog v-model="showPromptEditDialog" :title="isNewPrompt ? t('prompts.addNewPrompt') : t('prompts.editPrompt')"
      width="700px" :close-on-click-modal="false" top="5vh" custom-class="edit-prompt-dialog">
      <el-scrollbar max-height="60vh" class="prompt-dialog-scrollbar">
        <el-form :model="editingPrompt" @submit.prevent="savePrompt" class="edit-prompt-form">
          <div class="top-section-grid">
            <div class="icon-area">
              <div class="icon-editor-area" @paste="handleIconPaste" tabindex="0" style="outline: none;">
                <el-upload class="icon-uploader" action="#" drag :show-file-list="false"
                  :before-upload="handleIconUploadChange" accept="image/png, image/jpeg, image/webp"
                  @drop.prevent="handleIconDrop" @dragover.prevent>
                  <template v-if="editingPrompt.icon">
                    <el-avatar :src="editingPrompt.icon" shape="square" :size="64" class="uploaded-icon-avatar" />
                    <div class="icon-hover-mask" @click.stop.prevent="openIconEditor(editingPrompt.icon)">
                      <el-icon>
                        <Edit />
                      </el-icon>
                    </div>
                  </template>
                  <template v-else>
                    <div class="icon-uploader-placeholder">
                      <el-icon :size="20">
                        <UploadFilled />
                      </el-icon>
                      <div class="icon-upload-text"
                        style="font-size: 10px; margin-top: 4px; color: var(--text-tertiary); line-height: 1.2; white-space: pre-line;">
                        {{ t('prompts.icon.uploadText') }}
                      </div>
                    </div>
                  </template>
                </el-upload>

                <div class="icon-button-group">
                  <el-button class="icon-action-button" size="small" @click="downloadEditingIcon"
                    :title="t('prompts.icon.downloadTooltip')">
                    <el-icon>
                      <Download />
                    </el-icon>
                  </el-button>
                  <el-button class="icon-action-button" size="small" @click="removeEditingIcon"
                    :title="t('prompts.icon.removeTooltip')">
                    <el-icon>
                      <Delete />
                    </el-icon>
                  </el-button>
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
                          <el-option :label="t('prompts.showModeOptions.fastinput')" value="fastinput" />
                          <el-option :label="t('prompts.showModeOptions.window')" value="window" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                  </el-row>
                  <el-form-item v-if="editingPrompt.type === 'over'" class="regex-form-item">
                    <template #label>
                      <span>{{ t('prompts.regex.label') }}</span>
                      <el-tooltip placement="right" raw-content>
                        <template #content>
                          <div style="max-width: 350px; line-height: 1.6;" v-html="t('prompts.regex.tooltip')
                            .replace(/(\d+\.\s)/g, '<br/>$1')
                            .replace(/(•)/g, '<br/>&nbsp;&nbsp;$1')
                            .replace(/(常用符号速查:|Quick Reference:)/g, '<br/><br/><b>$1</b>')">
                          </div>
                        </template>
                        <el-icon class="tip-icon" style="margin-left: 4px;">
                          <QuestionFilled />
                        </el-icon>
                      </el-tooltip>
                    </template>
                    <el-input v-model="editingPrompt.matchRegex" :placeholder="t('prompts.regex.placeholder')" />
                  </el-form-item>
                </div>

                <label class="el-form-item__label">{{ t('prompts.modelLabel') }}</label>
                <el-form-item class="grid-item full-width no-margin">
                  <el-select v-model="editingPrompt.model" filterable clearable style="width: 100%;">
                    <el-option v-for="item in availableModels" :key="item.value" :label="item.label"
                      :value="item.value" />
                  </el-select>
                </el-form-item>
              </div>
            </div>
          </div>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item :label="t('prompts.promptContentLabel')" label-position="top">
                <el-scrollbar max-height="150px" class="prompt-textarea-scrollbar">
                  <el-input v-model="editingPrompt.prompt" type="textarea" :autosize="{ minRows: 6 }" resize="none"
                    :placeholder="t('prompts.inputPlaceholder')" />
                </el-scrollbar>
              </el-form-item>
              <el-form-item label-position="top">
                <template #label>
                  <div>
                    {{ t('prompts.llmParametersLabel') }}
                    <div class="form-item-subtitle">{{ t('prompts.llmParametersRemark', '（仅当前快捷助手模型生效，更换其他模型后不再生效）') }}
                    </div>
                  </div>
                </template>
                <div class="llm-params-container">
                  <div class="param-item"
                    v-if="editingPrompt.showMode === 'window' || editingPrompt.showMode === 'fastinput'">
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
                    <el-tooltip :content="t('prompts.tooltips.reasoningEffort')" placement="top"><el-icon
                        class="tip-icon">
                        <QuestionFilled />
                      </el-icon></el-tooltip>
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
              <el-form-item v-if="editingPrompt.isTemperature" :label="t('prompts.temperatureLabel')"
                label-position="top" class="slider-form-item">
                <el-slider v-model="editingPrompt.temperature" :min="0" :max="2" :step="0.1" show-input />
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item :label="t('prompts.AssistantParametersLabel')" label-position="top">
                <div class="llm-params-container full-height">
                  <div class="param-item">
                    <span class="param-label">{{ t('prompts.sendDirectLabel') }}</span>
                    <el-tooltip :content="t('prompts.tooltips.sendDirect')" placement="top"><el-icon class="tip-icon">
                        <QuestionFilled />
                      </el-icon></el-tooltip>
                    <div class="spacer"></div>
                    <el-switch v-model="editingPrompt.isDirectSend_normal" />
                  </div>
                  <div class="param-item">
                    <span class="param-label">{{ t('prompts.sendFileLabel') }}</span>
                    <el-tooltip :content="t('prompts.tooltips.sendFile')" placement="top"><el-icon class="tip-icon">
                        <QuestionFilled />
                      </el-icon></el-tooltip>
                    <div class="spacer"></div>
                    <el-switch v-model="editingPrompt.isDirectSend_file" />
                  </div>
                  <div class="param-item">
                    <span class="param-label">{{ t('prompts.ifTextNecessary') }}</span>
                    <el-tooltip :content="t('prompts.tooltips.ifTextNecessary')" placement="top"><el-icon
                        class="tip-icon">
                        <QuestionFilled />
                      </el-icon></el-tooltip>
                    <div class="spacer"></div>
                    <el-switch v-model="editingPrompt.ifTextNecessary" />
                  </div>
                  <div v-if="editingPrompt.showMode === 'window'" class="param-item">
                    <span class="param-label">{{ t('prompts.isAlwaysOnTopLabel') }}</span>
                    <el-tooltip :content="t('prompts.tooltips.isAlwaysOnTopTooltip')" placement="top"><el-icon
                        class="tip-icon">
                        <QuestionFilled />
                      </el-icon></el-tooltip>
                    <div class="spacer"></div>
                    <el-switch v-model="editingPrompt.isAlwaysOnTop" />
                  </div>
                  <div v-if="editingPrompt.showMode === 'window'" class="param-item">
                    <span class="param-label">{{ t('prompts.autoCloseOnBlurLabel') }}</span>
                    <el-tooltip :content="t('prompts.tooltips.autoCloseOnBlurTooltip')" placement="top"><el-icon
                        class="tip-icon">
                        <QuestionFilled />
                      </el-icon></el-tooltip>
                    <div class="spacer"></div>
                    <el-switch v-model="editingPrompt.autoCloseOnBlur" />
                  </div>
                  <div v-if="editingPrompt.showMode === 'window'" class="param-item">
                    <span class="param-label">{{ t('prompts.autoSaveChatLabel') }}</span>
                    <el-tooltip :content="t('prompts.tooltips.autoSaveChatTooltip')" placement="top"><el-icon
                        class="tip-icon">
                        <QuestionFilled />
                      </el-icon></el-tooltip>
                    <div class="spacer"></div>
                    <el-switch v-model="editingPrompt.autoSaveChat" />
                  </div>

                  <div class="param-item voice-param">
                    <span class="param-label">{{ t('prompts.voiceLabel') }}</span>
                    <el-tooltip :content="t('prompts.voiceTooltip')" placement="top"><el-icon class="tip-icon">
                        <QuestionFilled />
                      </el-icon></el-tooltip>
                    <div class="spacer"></div>
                    <el-select v-model="editingPrompt.voice" :placeholder="t('prompts.voicePlaceholder')" clearable
                      size="small" style="width: 120px;">
                      <el-option v-for="item in availableVoices" :key="item.value" :label="item.label"
                        :value="item.value" />
                    </el-select>
                  </div>
                  <div v-if="editingPrompt.showMode === 'window'" class="param-item">
                    <span class="param-label">{{ t('prompts.defaultMcpServersLabel') }}</span>
                    <el-tooltip :content="t('prompts.tooltips.defaultMcpServers')" placement="top"><el-icon
                        class="tip-icon">
                        <QuestionFilled />
                      </el-icon></el-tooltip>
                    <div class="spacer"></div>
                    <el-select v-model="editingPrompt.defaultMcpServers" multiple filterable clearable
                      :reserve-keyword="false" :placeholder="t('prompts.defaultMcpServersPlaceholder')"
                      style="width: 100%;">
                      <el-option v-for="server in availableMcpServers" :key="server.value" :label="server.label"
                        :value="server.value" />
                    </el-select>
                  </div>
                  <div v-if="editingPrompt.showMode === 'window'" class="param-item">
                    <span class="param-label">{{ t('prompts.defaultSkillsLabel') }}</span>
                    <el-tooltip :content="t('prompts.tooltips.defaultSkills')" placement="top"><el-icon
                        class="tip-icon">
                        <QuestionFilled />
                      </el-icon></el-tooltip>
                    <div class="spacer"></div>
                    <el-select v-model="editingPrompt.defaultSkills" multiple filterable clearable
                      :reserve-keyword="false" :placeholder="t('prompts.defaultSkillsPlaceholder')"
                      style="width: 100%;">
                      <el-option v-for="skill in availableSkills" :key="skill.name" :label="skill.name"
                        :value="skill.name" />
                    </el-select>
                  </div>
                  <div v-if="editingPrompt.showMode === 'window'" class="param-item"
                    style="align-items: flex-start; margin-top: 10px;">
                    <div style="width: 100%;">
                      <div style="display: flex; align-items: center; margin-bottom: 5px;">
                        <span class="param-label">{{ t('prompts.background.imageLabel') }}</span>
                        <div class="spacer"></div>
                      </div>
                      <el-input v-model="editingPrompt.backgroundImage"
                        :placeholder="t('prompts.background.imagePlaceholder')" size="small" clearable />
                      <div v-if="editingPrompt.backgroundImage" style="margin-top: 8px;">
                        <div style="display: flex; align-items: center; margin-bottom: 0px;">
                          <span class="param-label" style="font-size: 12px;">{{ t('prompts.background.opacityLabel') }}:
                            {{
                              editingPrompt.backgroundOpacity }}</span>
                        </div>
                        <el-slider v-model="editingPrompt.backgroundOpacity" :min="0.05" :max="1" :step="0.05"
                          size="small" />
                        <div style="display: flex; align-items: center; margin-bottom: 0px; margin-top: 4px;">
                          <span class="param-label" style="font-size: 12px;">{{ t('prompts.background.blurLabel') }}: {{
                            editingPrompt.backgroundBlur }}px</span>
                        </div>
                        <el-slider v-model="editingPrompt.backgroundBlur" :min="0" :max="20" :step="1" size="small" />
                      </div>
                    </div>
                  </div>
                  <el-row :gutter="20" v-if="editingPrompt.showMode === 'window'" class="dimensions-group-row">
                    <el-col :span="12">
                      <el-form-item :label="t('setting.dimensions.widthLabel')" label-position="top">
                        <el-input-number v-model="editingPrompt.window_width" :min="200" controls-position="right"
                          style="width: 100%;" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item :label="t('setting.dimensions.heightLabel')" label-position="top">
                        <el-input-number v-model="editingPrompt.window_height" :min="150" controls-position="right"
                          style="width: 100%;" />
                      </el-form-item>
                    </el-col>
                  </el-row>
                </div>
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item :label="t('prompts.addToTagLabel')" label-position="top">
            <el-select v-model="editingPrompt.selectedTag" :placeholder="t('prompts.addToTagPlaceholder')"
              style="width: 100%;" multiple filterable clearable>
              <el-option v-for="tagNameItem in sortedTagNames" :key="tagNameItem" :label="tagNameItem"
                :value="tagNameItem" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-scrollbar>
      <template #footer>
        <el-button @click="showPromptEditDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="savePrompt">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 图标编辑器弹窗 -->
    <el-dialog v-model="showIconEditDialog" :title="t('prompts.editPrompt')" width="400px" :close-on-click-modal="false"
      append-to-body>
      <div class="icon-edit-container">
        <div class="canvas-wrapper">
          <canvas ref="editorCanvasRef" width="256" height="256" @mousedown="handleCanvasMouseDown"
            @mousemove="handleCanvasMouseMove" @mouseup="handleCanvasMouseUp" @mouseleave="handleCanvasMouseUp"
            @wheel="handleCanvasWheel"></canvas>
          <div class="canvas-hint">{{ t('prompts.iconEditor.hint') }}</div>
        </div>

        <div class="editor-controls">
          <div class="control-row">
            <span class="label">{{ t('prompts.iconEditor.scale') }}</span>
            <el-slider v-model="iconEditorState.scale" :min="0.1" :max="3" :step="0.1" @input="drawEditorCanvas" />
          </div>
          <div class="control-row">
            <span class="label">{{ t('prompts.iconEditor.radius') }}</span>
            <el-slider v-model="iconEditorState.radius" :min="0" :max="50" :step="1" @input="drawEditorCanvas"
              :format-tooltip="val => val + '%'" />
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showIconEditDialog = false">{{ t('prompts.iconEditor.cancel') }}</el-button>
        <el-button type="primary" @click="saveEditedIcon">{{ t('prompts.iconEditor.confirm') }}</el-button>
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
          :disabled="!assignPromptForm.selectedPromptKeys.length">{{ t('common.assignSelected') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showReplaceModelDialog" :title="t('prompts.replaceModelsDialog.title')" width="600px"
      :close-on-click-modal="false">
      <el-form :model="replaceModelForm" label-position="top">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="t('prompts.replaceModelsDialog.sourceModel')">
              <el-select v-model="replaceModelForm.sourceModel" filterable
                :placeholder="t('prompts.replaceModelsDialog.sourceModel')" style="width: 100%;">
                <el-option v-for="item in usedModels" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('prompts.replaceModelsDialog.targetModel')">
              <el-select v-model="replaceModelForm.targetModel" filterable :placeholder="t('prompts.selectNewModel')"
                style="width: 100%;">
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

.prompts-header {
  display: flex;
  align-items: center;
  height: 45px;
  padding: 0 12px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  position: sticky;
  top: 0;
  z-index: 10;
  gap: 16px;
}

.custom-all-tab {
  display: flex;
  align-items: center;
  height: 45px;
  padding: 0 12px;
  cursor: pointer;
  color: var(--text-secondary);
  border-bottom: 2px solid transparent;
  flex-shrink: 0;
  transition: color 0.3s, border-color 0.3s;
}

.custom-all-tab:hover {
  color: var(--text-accent);
}

.custom-all-tab.is-active {
  color: var(--text-accent);
  border-bottom-color: var(--text-accent);
}

.tags-tabs-container {
  flex-grow: 1;
  min-width: 0;
  height: 60px;
}

.tags-tabs-container :deep(.el-tabs__header) {
  height: 60px;
  margin-bottom: 0;
}

.tags-tabs-container :deep(.el-tabs__nav-wrap) {
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: -8px;
}

/* 美化滚动条 (Webkit) */
.tags-tabs-container :deep(.el-tabs__nav-wrap::-webkit-scrollbar) {
  height: 6px;
}

.tags-tabs-container :deep(.el-tabs__nav-wrap::-webkit-scrollbar-track) {
  background: transparent;
}

.tags-tabs-container :deep(.el-tabs__nav-wrap::-webkit-scrollbar-thumb) {
  background-color: var(--border-primary);
  border-radius: 3px;
}

.tags-tabs-container :deep(.el-tabs__nav-wrap::-webkit-scrollbar-thumb:hover) {
  background-color: var(--text-tertiary);
}

/* 美化滚动条 (Firefox) */
.tags-tabs-container :deep(.el-tabs__nav-wrap) {
  scrollbar-width: thin;
  scrollbar-color: var(--border-primary) transparent;
}

.tags-tabs-container :deep(.el-tabs__nav-prev),
.tags-tabs-container :deep(.el-tabs__nav-next) {
  display: none !important;
}

.tags-tabs-container :deep(.el-tabs__nav) {
  white-space: nowrap;
}

.tags-tabs-container :deep(.el-tabs__item) {
  flex-shrink: 0;
  padding: 0 12px;
  height: 60px;
  color: var(--text-secondary);
}

.tags-tabs-container :deep(.el-tabs__nav-wrap::after) {
  content: none;
}

.tags-tabs-container :deep(.el-tabs__item.is-active) {
  color: var(--text-accent);
}

.tags-tabs-container :deep(.el-tabs__active-bar) {
  background-color: var(--text-accent);
}

.tab-label-multiline {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.3;
  text-align: center;
  padding: 8px 0;
  width: 100%;
}

.tab-name {
  font-weight: 600;
  font-size: 14px;
}

.tab-count {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.tab-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.tab-actions .el-button {
  margin-left: 0 !important;
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

.content-wrapper {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0px 24px 80px 24px;
}

.search-input-container {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--bg-primary);
  padding: 8px 0px 8px 0px;
  margin: 0px 0px 5px 0px;
}

.search-input-container :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--border-primary) inset !important;
}

.search-input-container :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--text-accent) inset !important;
}

.prompts-grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 15px;
  padding-top: 4px;
}

.prompt-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: 10px 16px 10px 16px;
  transition: all 0.25s ease;
  display: flex;
  flex-direction: column;
  height: 104px;
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

.bottom-actions-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 12px 24px;
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

.edit-prompt-dialog .el-form-item[label-position="top"]> :deep(.el-form-item__label) {
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
  margin-top: 12px;
}

.icon-uploader :deep(.el-upload-dragger) {
  width: 64px;
  height: 64px;
  padding: 0;
  border: 1px dashed var(--border-primary);
  border-radius: var(--radius-md);
  background-color: var(--bg-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  transition: border-color 0.3s;
}

.icon-uploader :deep(.el-upload-dragger:hover) {
  border-color: var(--bg-accent);
}

.icon-uploader-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.icon-hover-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 5;
}

.icon-uploader:hover .icon-hover-mask {
  opacity: 1;
}

.uploaded-icon-avatar {
  width: 100%;
  height: 100%;
  border-radius: 0 !important;
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

/* ----------------------------------------------------
   [New] Canvas Icon Editor Dialog Styles
   ---------------------------------------------------- */
.icon-edit-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.canvas-wrapper {
  position: relative;
  width: 256px;
  height: 256px;
  /* Checkerboard background */
  background-image:
    linear-gradient(45deg, #eee 25%, transparent 25%),
    linear-gradient(-45deg, #eee 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #eee 75%),
    linear-gradient(-45deg, transparent 75%, #eee 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  overflow: hidden;
  cursor: grab;
}

html.dark .canvas-wrapper {
  background-image:
    linear-gradient(45deg, #333 25%, transparent 25%),
    linear-gradient(-45deg, #333 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #333 75%),
    linear-gradient(-45deg, transparent 75%, #333 75%);
}

.canvas-wrapper:active {
  cursor: grabbing;
}

.canvas-wrapper canvas {
  width: 100%;
  height: 100%;
}

.canvas-hint {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  background-color: var(--bg-primary);
  opacity: 0.8;
  padding: 4px 0;
  pointer-events: none;
}

.editor-controls {
  width: 100%;
  padding: 0 10px;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 10px;
}

.control-row .label {
  width: 40px;
  font-size: 13px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

/* ---------------------------------------------------- */

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
  margin-top: 15px;
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
  margin-top: 0px;
  padding-top: 12px;
  border-top: 1px solid var(--border-primary);
}

.dimensions-group-row .el-form-item {
  margin-bottom: 0;
}

:deep(.el-dialog__body) {
  padding: 15px 20px 10px 20px !important;
}

:deep(.el-dialog__footer) {
  padding: 5px;
}

.dimensions-group-row :deep(.el-form-item__label) {
  margin-bottom: 6px !important;
}

:deep(.el-dialog__header) {
  padding: 5px !important;
}

.prompt-dialog-scrollbar :deep(.el-scrollbar__view) {
  padding: 5px 20px 5px 5px;
}

.prompt-textarea-scrollbar {
  width: 100%;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  background-color: var(--bg-tertiary);
  transition: all 0.2s;
}

.prompt-textarea-scrollbar:focus-within {
  border-color: var(--text-accent);
  box-shadow: 0 0 0 1px var(--text-accent) inset;
}

.prompt-textarea-scrollbar :deep(.el-textarea__inner) {
  box-shadow: none !important;
  background-color: transparent !important;
  padding: 4px;
  border: none !important;
}

.prompt-textarea-scrollbar :deep(.el-textarea__inner),
.prompt-textarea-scrollbar :deep(.el-textarea__inner:focus),
.prompt-textarea-scrollbar :deep(.el-textarea__inner:hover) {
  box-shadow: none !important;
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

.refresh-fab-button {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 21;
  width: 24px;
  height: 24px;
  font-size: 16px;
  box-shadow: var(--el-box-shadow-light);
}

.edit-prompt-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.open-prompt-btn {
  margin-left: 8px;
  color: var(--bg-accent);
  font-size: 16px;
}

.open-prompt-btn:hover {
  color: var(--text-accent);
  background-color: var(--bg-tertiary) !important;
}

.regex-form-item {
  margin-top: 10px;
}
</style>