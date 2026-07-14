<script setup>
import { ref, reactive, watch, onMounted, computed, inject, onActivated, onDeactivated } from 'vue'
import { Plus, Delete, Edit, ArrowUp, ArrowDown, Refresh, CirclePlus, Remove, Search, Folder, FolderOpened, FolderAdd } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import draggable from 'vuedraggable';

const { t } = useI18n();

const currentConfig = inject('config');
const provider_key = ref(null);

const providerSearchQuery = ref('');
const providerSearchMode = ref('provider');


// 文件夹相关状态
const addFolder_page = ref(false);
const addFolder_form = reactive({ name: "" });
const renameFolder_page = ref(false);
const renameFolder_form = reactive({ id: "", name: "" });

onMounted(() => {
  if (currentConfig.value.providerOrder && currentConfig.value.providerOrder.length > 0) {
    provider_key.value = currentConfig.value.providerOrder[0];
  } else if (currentConfig.value.providers && Object.keys(currentConfig.value.providers).length > 0) {
    provider_key.value = Object.keys(currentConfig.value.providers)[0];
  } else {
    provider_key.value = null;
  }
});

onActivated(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
});

onDeactivated(() => {
    window.removeEventListener('keydown', handleGlobalKeyDown);
});

const selectedProvider = computed(() => {
  if (provider_key.value && currentConfig.value.providers && currentConfig.value.providers[provider_key.value]) {
    return currentConfig.value.providers[provider_key.value];
  }
  return null;
});

// 计算属性：排序后的文件夹列表
const sortedFolders = computed(() => {
  if (!currentConfig.value.providerFolders) return [];
  return Object.entries(currentConfig.value.providerFolders)
    .map(([id, folder]) => ({ id, ...folder }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

// 计算属性：根目录下的服务商 (没有 folderId 或 folderId 无效)
const rootProviders = computed(() => {
  if (!currentConfig.value.providerOrder) return [];
  const folders = currentConfig.value.providerFolders || {};
  return currentConfig.value.providerOrder.filter(key => {
    const p = currentConfig.value.providers[key];
    // 如果没有 provider 或 folderId 为空，或 folderId 指向的文件夹不存在
    return p && (!p.folderId || !folders[p.folderId]);
  });
});

// 方法：获取指定文件夹下的服务商 (按 providerOrder 排序)
const getProvidersInFolder = (folderId) => {
  if (!currentConfig.value.providerOrder) return [];
  return currentConfig.value.providerOrder.filter(key => {
    const p = currentConfig.value.providers[key];
    return p && p.folderId === folderId;
  });
};


const normalizeSearchText = (value) => String(value || '').trim().toLowerCase();

function providerMatchesSearch(provider) {
  const query = normalizeSearchText(providerSearchQuery.value);
  if (!query) return true;
  if (!provider || typeof provider !== 'object') return false;

  const providerName = normalizeSearchText(provider.name);
  const providerUrl = normalizeSearchText(provider.url);
  const modelList = Array.isArray(provider.modelList) ? provider.modelList : [];

  if (providerSearchMode.value === 'model') {
    return modelList.some(model => normalizeSearchText(model).includes(query));
  }

  return providerName.includes(query) || providerUrl.includes(query);
}

const visibleFolderEntries = computed(() => {
  const query = normalizeSearchText(providerSearchQuery.value);
  if (!query) {
    return sortedFolders.value.map(folder => ({
      ...folder,
      providers: getProvidersInFolder(folder.id)
    }));
  }

  return sortedFolders.value
    .map(folder => ({
      ...folder,
      providers: getProvidersInFolder(folder.id).filter(key => providerMatchesSearch(currentConfig.value.providers[key]))
    }))
    .filter(folder => folder.providers.length > 0);
});

const visibleRootProviders = computed(() => {
  const query = normalizeSearchText(providerSearchQuery.value);
  if (!query) return rootProviders.value;
  return rootProviders.value.filter(key => providerMatchesSearch(currentConfig.value.providers[key]));
});


// [新增] 获取当前选中服务商所在的“分组”内的所有ID列表（按顺序）
// 分组指的是：具体的文件夹 或 根目录
const getCurrentGroupIds = () => {
  if (!selectedProvider.value) return [];
  const targetFolderId = selectedProvider.value.folderId;
  const folders = currentConfig.value.providerFolders || {};

  // 判断当前选中的是在哪个有效分组下
  // 如果 folderId 存在且文件夹配置中存在该ID，则是在该文件夹下；否则视为根目录
  const effectiveFolderId = (targetFolderId && folders[targetFolderId]) ? targetFolderId : "";

  return currentConfig.value.providerOrder.filter(key => {
    const p = currentConfig.value.providers[key];
    if (!p) return false;
    const pFolderId = p.folderId;
    const pEffectiveFolderId = (pFolderId && folders[pFolderId]) ? pFolderId : "";
    return pEffectiveFolderId === effectiveFolderId;
  });
};

// [新增] 判断是否可以上移
const canMoveUp = computed(() => {
  if (!selectedProvider.value || !provider_key.value) return false;
  const groupIds = getCurrentGroupIds();
  return groupIds.indexOf(provider_key.value) > 0;
});

// [新增] 判断是否可以下移
const canMoveDown = computed(() => {
  if (!selectedProvider.value || !provider_key.value) return false;
  const groupIds = getCurrentGroupIds();
  return groupIds.indexOf(provider_key.value) < groupIds.length - 1;
});

// 原子化保存：串行化，避免快速连删/连改时 getConfig 与写回交错导致丢更新
let atomicSaveQueue = Promise.resolve();
async function atomicSave(updateFunction) {
  const run = async () => {
    try {
      const latestConfigData = await window.api.getConfig();
      if (!latestConfigData || !latestConfigData.config) {
        throw new Error("Failed to get latest config from DB.");
      }
      const latestConfig = latestConfigData.config;

      updateFunction(latestConfig);

      await window.api.updateConfigWithoutFeatures({ config: latestConfig });

      currentConfig.value = latestConfig;

    } catch (error) {
      console.error("Atomic save failed:", error);
      ElMessage.error(t('providers.alerts.configSaveFailed'));
    }
  };

  const next = atomicSaveQueue.then(run, run);
  atomicSaveQueue = next.catch(() => {});
  return next;
}

// 添加文件夹
function add_folder_function() {
  const name = addFolder_form.name.trim();
  if (!name) return;

  const folderId = `folder_${Date.now()}`;

  atomicSave(config => {
    if (!config.providerFolders) config.providerFolders = {};
    config.providerFolders[folderId] = {
      name: name,
      collapsed: false
    };
  });

  addFolder_form.name = "";
  addFolder_page.value = false;
  ElMessage.success(t('providers.folders.createSuccess'));
}

// 打开重命名弹窗
function open_rename_folder_dialog(id, currentName) {
  renameFolder_form.id = id;
  renameFolder_form.name = currentName;
  renameFolder_page.value = true;
}

// 重命名文件夹
function rename_folder_function() {
  const newName = renameFolder_form.name.trim();
  if (!newName) return;

  atomicSave(config => {
    if (config.providerFolders && config.providerFolders[renameFolder_form.id]) {
      config.providerFolders[renameFolder_form.id].name = newName;
    }
  });

  renameFolder_page.value = false;
  ElMessage.success(t('providers.folders.renameSuccess'));
}

// 删除文件夹 (服务商移回根目录)
function delete_folder(folderId) {
  ElMessageBox.confirm(
    t('providers.folders.deleteConfirmMessage'),
    t('providers.folders.deleteConfirmTitle'),
    { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
  ).then(() => {
    atomicSave(config => {
      if (config.providerFolders) delete config.providerFolders[folderId];
      for (const key in config.providers) {
        if (config.providers[key].folderId === folderId) {
          config.providers[key].folderId = "";
        }
      }
    });
    ElMessage.success(t('providers.folders.deleteSuccess'));
  }).catch(() => { });
}

// 切换文件夹折叠状态
function toggle_folder(folderId) {
  atomicSave(config => {
    if (config.providerFolders && config.providerFolders[folderId]) {
      config.providerFolders[folderId].collapsed = !config.providerFolders[folderId].collapsed;
    }
  });
}

// 设置服务商所属文件夹
function set_provider_folder(folderId) {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;

  atomicSave(config => {
    if (config.providers[keyToUpdate]) {
      config.providers[keyToUpdate].folderId = folderId;
    }
  });
}

function delete_provider() {
  if (!provider_key.value) return;
  
  const currentName = selectedProvider.value?.name || t('providers.unnamedProvider');

  ElMessageBox.confirm(
    t('providers.alerts.deleteConfirmText', { name: currentName }), // 动态注入名称
    t('providers.alerts.deleteConfirmTitle'),
    { 
        confirmButtonText: t('common.confirm'), 
        cancelButtonText: t('common.cancel'), 
        type: 'warning' 
    }
  ).then(() => {
    atomicSave(config => {
      const keyToDelete = provider_key.value;
      const index = config.providerOrder.indexOf(keyToDelete);

      delete config.providers[keyToDelete];
      config.providerOrder = config.providerOrder.filter(key => key !== keyToDelete);

      if (config.providerOrder.length > 0) {
        if (index > 0 && index <= config.providerOrder.length) {
          provider_key.value = config.providerOrder[index - 1];
        } else {
          provider_key.value = config.providerOrder[0];
        }
      } else {
        provider_key.value = null;
      }
    });
    ElMessage.success(t('common.deleteSuccess'));
  }).catch(() => {
  });
}

const handleGlobalKeyDown = (e) => {
    if (!provider_key.value) return;

    const activeEl = document.activeElement;
    const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable;
    
    if (isInput) return;

    if (e.key === 'Delete' || (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey)) {
        delete_provider();
    }
};

const addProvider_page = ref(false);
const addprovider_form = reactive({ name: "" });

function add_prvider_function() {
  const timestamp = String(Date.now());
  const newName = addprovider_form.name || `${t('providers.unnamedProvider')} ${timestamp.slice(-4)}`;

  atomicSave(config => {
    config.providers[timestamp] = {
      name: newName,
      url: "",
      api_key: "",
      modelList: [],
      enable: true,
      folderId: "",
      apiType: "chat_completions",
      headers: {},
      retryCount: 3
    };
    config.providerOrder.push(timestamp);
    provider_key.value = timestamp;
  });

  addprovider_form.name = "";
  addProvider_page.value = false;
}

const change_provider_name_page = ref(false);
const change_provider_name_form = reactive({ name: "" });

function openChangeProviderNameDialog() {
  if (selectedProvider.value) {
    change_provider_name_form.name = selectedProvider.value.name;
    change_provider_name_page.value = true;
  }
}

function change_provider_name_function() {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;
  const newName = change_provider_name_form.name;

  atomicSave(config => {
    if (config.providers[keyToUpdate]) {
      config.providers[keyToUpdate].name = newName;
    }
  });

  change_provider_name_form.name = "";
  change_provider_name_page.value = false;
}

function delete_model(model) {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;

  atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (provider && Array.isArray(provider.modelList)) {
      provider.modelList = provider.modelList.filter(m => m !== model);
    }
  });
}

const addModel_page = ref(false);
const addModel_form = reactive({ name: "" })

function add_model_function() {
  if (!provider_key.value || !addModel_form.name.trim()) return;
  const keyToUpdate = provider_key.value;
  const newModelName = addModel_form.name.trim();

  atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (provider) {
      if (!provider.modelList) {
        provider.modelList = [];
      }
      provider.modelList.push(newModelName);
    }
  });

  addModel_form.name = "";
  addModel_page.value = false;
}

const getModel_page = ref(false);
const getModel_form = reactive({ modelList: [], isLoading: false, error: null });
const searchQuery = ref('');

const filteredModels = computed(() => {
  if (!searchQuery.value) {
    return getModel_form.modelList;
  }
  const lowerCaseQuery = searchQuery.value.toLowerCase();
  return getModel_form.modelList.filter(model =>
    (model.id && model.id.toLowerCase().includes(lowerCaseQuery)) ||
    (model.owned_by && model.owned_by.toLowerCase().includes(lowerCaseQuery))
  );
});


async function activate_get_model_function() {
  if (!selectedProvider.value || !selectedProvider.value.url) {
    ElMessage.warning(t('providers.alerts.providerUrlNotSet'));
    return;
  }
  getModel_page.value = true;
  getModel_form.isLoading = true;
  getModel_form.error = null;
  getModel_form.modelList = [];
  searchQuery.value = '';

  const url = selectedProvider.value.url;
  const apiKey = selectedProvider.value.api_key;
  const apiType = selectedProvider.value.apiType || 'chat_completions';
  const isClaude = apiType === 'claude';
  const apiKeyToUse = window.api && typeof window.api.getRandomItem === 'function' && apiKey ? window.api.getRandomItem(apiKey) : apiKey;

  // 合并服务商自定义请求头（用户配置优先级最低，认证头随后覆盖）
  const customHeaders = (selectedProvider.value.headers && typeof selectedProvider.value.headers === 'object') ? selectedProvider.value.headers : {};
  const options = {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...customHeaders }
  };

  let endpoint;
  if (isClaude) {
    // Anthropic：URL 去掉末尾 / 与 /v1，模型端点为 /v1/models，认证用 x-api-key + anthropic-version
    const base = String(url || '').trim().replace(/\/+$/, '').replace(/\/v1$/, '');
    endpoint = `${base}/v1/models`;
    if (apiKeyToUse) options.headers['x-api-key'] = apiKeyToUse;
    options.headers['anthropic-version'] = '2023-06-01';
  } else {
    endpoint = `${url}/models`;
    if (apiKeyToUse) options.headers['Authorization'] = `Bearer ${apiKeyToUse}`;
  }

  try {
    const response = await fetch(endpoint, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      const errorMessage = t('providers.alerts.fetchModelsError', { status: response.status, message: errorData.message || t('providers.alerts.fetchModelsFailedDefault') });
      throw new Error(errorMessage);
    }
    const data = await response.json();
    if (data?.data && Array.isArray(data.data)) {
      getModel_form.modelList = data.data.map(m => ({ id: m.id, owned_by: m.owned_by }));
    } else {
      getModel_form.modelList = [];
    }
  } catch (error) {
    console.error(error);
    getModel_form.error = error.message;
    ElMessage.error(error.message);
  } finally {
    getModel_form.isLoading = false;
  }
}

function get_model_function(add, modelId) {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;

  atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (provider) {
      if (!provider.modelList) {
        provider.modelList = [];
      }
      if (add) {
        if (!provider.modelList.includes(modelId)) {
          provider.modelList.push(modelId);
        }
      } else {
        provider.modelList = provider.modelList.filter(m => m !== modelId);
      }
    }
  });
}

// [修改] 排序函数：现在支持在分组内部排序
function change_order(flag) {
  if (!provider_key.value) return;
  const currentId = provider_key.value;

  // 获取当前分组内的所有 ID 列表
  const groupIds = getCurrentGroupIds();
  const indexInGroup = groupIds.indexOf(currentId);

  if (indexInGroup === -1) return;

  let targetId = null; // 参照物 ID（要交换位置的邻居）
  let insertAfter = false; // true: 插入到 target 后面，false: 插入到 target 前面

  if (flag === "up") {
    if (indexInGroup > 0) {
      targetId = groupIds[indexInGroup - 1];
      insertAfter = false; // 放在上一个的前面，即交换位置
    }
  } else if (flag === "down") {
    if (indexInGroup < groupIds.length - 1) {
      targetId = groupIds[indexInGroup + 1];
      insertAfter = true; // 放在下一个的后面
    }
  }

  if (!targetId) return;

  atomicSave(config => {
    const order = config.providerOrder;
    const currentIndex = order.indexOf(currentId);
    // targetId 在全局数组中的位置
    const targetIndex = order.indexOf(targetId);

    if (currentIndex === -1 || targetIndex === -1) return;

    // 1. 先把当前 ID 拿出来
    const newOrder = order.filter(id => id !== currentId);

    // 2. 找到 target 在新数组中的位置（因为删除了一个元素，索引可能变了）
    const newTargetIndex = newOrder.indexOf(targetId);

    // 3. 插入到 target 附近
    const insertIndex = insertAfter ? newTargetIndex + 1 : newTargetIndex;
    newOrder.splice(insertIndex, 0, currentId);

    config.providerOrder = newOrder;
  });
}

// 拖拽排序结束后调用的保存函数
function saveModelOrder() {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;
  // v-model已经更新了selectedProvider.modelList的顺序
  const newOrder = selectedProvider.value.modelList;

  atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (provider) {
      provider.modelList = newOrder;
    }
  });
}

// 对于简单的开关和输入框，使用精确的 saveSetting
async function saveSingleProviderSetting(key, value) {
  if (!provider_key.value) return;

  if (currentConfig.value.providers[provider_key.value]) {
    currentConfig.value.providers[provider_key.value][key] = value;
  }

  const keyPath = `providers.${provider_key.value}.${key}`;
  try {
    await window.api.saveSetting(keyPath, value);
  } catch (e) {
    ElMessage.error(t('providers.alerts.saveFailed'));
  }
}

// --- 服务商自定义请求头 ---
let headerRowIdSeq = 0;
const headerRows = ref([]);

function createHeaderRow(key = '', value = '') {
  headerRowIdSeq += 1;
  return { _id: `hr_${headerRowIdSeq}`, key, value };
}

function rebuildHeaderRows() {
  const headers = (selectedProvider.value && selectedProvider.value.headers && typeof selectedProvider.value.headers === 'object')
    ? selectedProvider.value.headers
    : {};
  headerRows.value = Object.entries(headers).map(([key, value]) => createHeaderRow(String(key), value == null ? '' : String(value)));
}

// 仅在切换服务商时重建；编辑过程中绝不重建，避免正在填写的半成品行消失
watch(provider_key, () => { rebuildHeaderRows(); }, { immediate: true });

function persistProviderHeaders() {
  if (!provider_key.value) return;
  const normalized = {};
  for (const row of headerRows.value) {
    const key = String(row?.key || '').trim();
    const value = String(row?.value || '').trim();
    if (!key || !value) continue;
    if (/[\r\n]/.test(key) || /[\r\n]/.test(value)) continue;
    normalized[key] = value;
  }
  saveSingleProviderSetting('headers', normalized);
}

function addHeaderRow() {
  headerRows.value.push(createHeaderRow());
}

function removeHeaderRow(index) {
  headerRows.value.splice(index, 1);
  persistProviderHeaders();
}

const apiKeyCount = computed(() => {
  if (!selectedProvider.value || !selectedProvider.value.api_key || !selectedProvider.value.api_key.trim()) {
    return 0;
  }
  // 同时支持中英文逗号，并过滤空字符串
  const keys = selectedProvider.value.api_key.split(/[,，]/).filter(k => k.trim() !== '');
  return keys.length;
});


function normalizeApiKeys(apiKeyText = '') {
  return String(apiKeyText || '')
    .split(/[,，]/)
    .map(item => item.trim())
    .filter(Boolean);
}

const batchTestDialogVisible = ref(false);
const batchTestLoading = ref(false);
const batchTestCodeFilter = ref('ALL');
const batchTestSelection = ref([]);
const batchTestForm = reactive({ model: '' });
const batchTestResults = ref([]);

const batchTestModelOptions = computed(() => Array.isArray(selectedProvider.value?.modelList)
  ? selectedProvider.value.modelList.filter(Boolean)
  : []);

const batchTestCodeOptions = computed(() => {
  const codes = new Set(batchTestResults.value.map(item => String(item?.code || 'REQUEST_ERROR')));
  return ['ALL', ...Array.from(codes)];
});

const filteredBatchTestResults = computed(() => {
  if (batchTestCodeFilter.value === 'ALL') return batchTestResults.value;
  return batchTestResults.value.filter(item => String(item?.code || '') === batchTestCodeFilter.value);
});

function handleRetryCountChange(value) {
  const normalized = Number.isInteger(value) ? Math.min(Math.max(value, 0), 10) : 3;
  saveSingleProviderSetting('retryCount', normalized);
}

function openBatchTestDialog() {
  if (!selectedProvider.value) return;
  if (!selectedProvider.value.url) {
    ElMessage.warning('请先配置服务商 URL');
    return;
  }
  const keys = normalizeApiKeys(selectedProvider.value.api_key);
  if (!keys.length) {
    ElMessage.warning('请先配置至少一个 API Key');
    return;
  }
  if (!batchTestModelOptions.value.length) {
    ElMessage.warning(t('providers.noModelsAdded'));
    return;
  }

  batchTestDialogVisible.value = true;
  batchTestForm.model = batchTestModelOptions.value.includes(batchTestForm.model)
    ? batchTestForm.model
    : batchTestModelOptions.value[0];
  batchTestResults.value = keys.map((key, index) => ({
    key,
    maskedKey: key.length <= 8 ? key : `${key.slice(0, 6)}...${key.slice(-3)}`,
    index,
    ok: false,
    status: 0,
    code: 'PENDING',
    message: 'pending'
  }));
  batchTestSelection.value = [];
  batchTestCodeFilter.value = 'ALL';
}

async function runBatchProviderTest() {
  if (!selectedProvider.value) return;
  if (!batchTestForm.model) {
    ElMessage.warning('请先选择测试模型');
    return;
  }

  batchTestLoading.value = true;
  batchTestSelection.value = [];
  batchTestCodeFilter.value = 'ALL';
  try {
    const result = await window.api.batchTestProviderKeys({
      baseUrl: selectedProvider.value.url,
      apiKeys: selectedProvider.value.api_key,
      model: batchTestForm.model,
      apiType: selectedProvider.value.apiType,
      headers: JSON.parse(JSON.stringify(selectedProvider.value.headers || {})),
      retryCount: Number.isInteger(selectedProvider.value.retryCount) ? selectedProvider.value.retryCount : 3
    });

    batchTestResults.value = Array.isArray(result?.results) ? result.results : [];
    const successCount = batchTestResults.value.filter(item => item.ok).length;
    ElMessage.success(`测试完成：${successCount}/${batchTestResults.value.length} 个 Key 可用`);
  } catch (error) {
    console.error(error);
    ElMessage.error(`批量测试失败：${error.message}`);
  } finally {
    batchTestLoading.value = false;
  }
}

function handleBatchTestSelectionChange(rows) {
  batchTestSelection.value = Array.isArray(rows) ? rows : [];
}

async function deleteSelectedBatchTestKeys() {
  if (!selectedProvider.value) return;
  const keysToDelete = new Set(batchTestSelection.value.map(item => String(item?.key || '').trim()).filter(Boolean));
  if (!keysToDelete.size) {
    ElMessage.warning('请先选择要删除的 Key');
    return;
  }

  await ElMessageBox.confirm(`确定删除选中的 ${keysToDelete.size} 个 Key 吗？`, '删除 Key', {
    type: 'warning',
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel')
  });

  const remainingKeys = normalizeApiKeys(selectedProvider.value.api_key).filter(key => !keysToDelete.has(key));
  const nextValue = remainingKeys.join(',');
  await saveSingleProviderSetting('api_key', nextValue);
  batchTestResults.value = batchTestResults.value.filter(item => !keysToDelete.has(String(item?.key || '').trim()));
  batchTestSelection.value = [];
  ElMessage.success(t('common.deleteSuccess'));
}

</script>

<template>
  <div class="providers-page-container">
    <div class="providers-content-wrapper">
      <el-container>
        <el-aside width="240px" class="providers-aside">
          <el-scrollbar class="provider-list-scrollbar">
            <div class="provider-search-toolbar">
              <el-input v-model="providerSearchQuery" clearable :prefix-icon="Search" placeholder="搜索服务商或模型"
                class="provider-search-input" />
              <el-radio-group v-model="providerSearchMode" size="small" class="provider-search-mode">
                <el-radio-button label="provider">服务商</el-radio-button>
                <el-radio-button label="model">模型</el-radio-button>
              </el-radio-group>
            </div>
            <!-- 1. 渲染文件夹 -->
            <div v-for="folder in visibleFolderEntries" :key="folder.id" class="folder-group">
              <div class="folder-header" @click="toggle_folder(folder.id)">
                <div class="folder-icon-wrapper">
                  <el-icon :size="16" class="folder-icon">
                    <Folder v-if="folder.collapsed" />
                    <FolderOpened v-else />
                  </el-icon>
                </div>
                <span class="folder-name">{{ folder.name }}</span>
                <!-- 编辑和删除按钮容器，hover时显示 -->
                <div class="folder-actions" @click.stop>
                  <el-button link :icon="Edit" size="small" class="folder-action-btn"
                    @click.stop="open_rename_folder_dialog(folder.id, folder.name)" />
                  <el-button link type="danger" :icon="Delete" size="small" class="folder-action-btn"
                    @click.stop="delete_folder(folder.id)" />
                </div>
              </div>

              <!-- 文件夹内的服务商 -->
              <div v-show="!folder.collapsed" class="folder-content">
                <div v-for="key_id in folder.providers" :key="key_id" class="provider-item in-folder"
                  :class="{
                    'active': provider_key === key_id, 'disabled': currentConfig.providers[key_id] && !currentConfig.providers[key_id].enable
                  }" @click="provider_key = key_id">
                  <span class="provider-item-name">{{ currentConfig.providers[key_id]?.name ||
                    t('providers.unnamedProvider') }}</span>
                  <el-tag v-if="currentConfig.providers[key_id] && !currentConfig.providers[key_id].enable" type="info"
                    size="small" effect="dark" round>{{ t('providers.statusOff') }}</el-tag>
                </div>
                <!-- 空文件夹提示 -->
                <div v-if="folder.providers.length === 0" class="empty-folder-tip">
                  {{ t('providers.folders.empty') }}
                </div>
              </div>
            </div>

            <!-- 分隔线 -->
            <div class="root-providers-divider" v-if="visibleFolderEntries.length > 0 && visibleRootProviders.length > 0"></div>

            <!-- 2. 渲染根目录服务商 -->
            <div v-for="key_id in visibleRootProviders" :key="key_id" class="provider-item" :class="{
              'active': provider_key === key_id, 'disabled': currentConfig.providers[key_id] && !currentConfig.providers[key_id].enable
            }" @click="provider_key = key_id">
              <span class="provider-item-name">{{ currentConfig.providers[key_id]?.name ||
                t('providers.unnamedProvider') }}</span>
              <el-tag v-if="currentConfig.providers[key_id] && !currentConfig.providers[key_id].enable" type="info"
                size="small" effect="dark" round>{{ t('providers.statusOff') }}</el-tag>
            </div>
            <div
              v-if="visibleRootProviders.length === 0 && visibleFolderEntries.length === 0"
              class="no-providers">
              {{ t('providers.noProviders') }}
            </div>
          </el-scrollbar>
          <div class="aside-actions">
            <el-button-group class="action-group">
              <el-tooltip content="新建目录" placement="top">
                <el-button :icon="FolderAdd" @click="addFolder_page = true" />
              </el-tooltip>
              <el-button type="primary" :icon="Plus" @click="addProvider_page = true" class="add-provider-btn">
                {{ t('providers.addProviderBtn') }}
              </el-button>
            </el-button-group>
          </div>
        </el-aside>

        <el-main class="provider-main-content">
          <el-scrollbar class="provider-details-scrollbar">
            <div v-if="selectedProvider" class="provider-details">
              <div class="provider-header">
                <div class="provider-title-actions">
                  <h2 class="provider-name" @click="openChangeProviderNameDialog">
                    {{ selectedProvider.name }}
                    <el-tooltip :content="t('providers.editNameTooltip')" placement="top">
                      <el-icon class="edit-icon">
                        <Edit />
                      </el-icon>
                    </el-tooltip>
                  </h2>
                  <div class="header-buttons">
                    <!-- [修改] 禁用状态绑定到 canMoveUp/canMoveDown -->
                    <el-button :icon="ArrowUp" circle plain size="small" :title="t('providers.moveUpTooltip')"
                      :disabled="!canMoveUp" @click="change_order('up')" />
                    <el-button :icon="ArrowDown" circle plain size="small" :title="t('providers.moveDownTooltip')"
                      :disabled="!canMoveDown" @click="change_order('down')" />
                    <el-button type="danger" :icon="Delete" circle plain size="small" @click="delete_provider"
                      :title="t('providers.deleteProviderTooltip')" />
                  </div>
                </div>
                <div class="provider-header-controls">
                  <el-tooltip :content="t('providers.apiTypeTooltip')" placement="top" :show-after="500">
                    <el-select v-model="selectedProvider.apiType"
                      @change="(val) => saveSingleProviderSetting('apiType', val)" size="default" class="api-type-select"
                      placeholder="Chat Completions">
                      <el-option :label="t('providers.apiTypes.chatCompletions')" value="chat_completions" />
                      <el-option :label="t('providers.apiTypes.responses')" value="responses" />
                      <el-option :label="t('providers.apiTypes.codex')" value="codex" />
                      <el-option :label="t('providers.apiTypes.claude')" value="claude" />
                    </el-select>
                  </el-tooltip>
                  <el-switch v-model="selectedProvider.enable"
                    @change="(value) => saveSingleProviderSetting('enable', value)" size="large" />
                </div>
              </div>

              <el-form label-position="left" label-width="75px" class="provider-form">
                <div class="form-item-header">
                  <div class="form-item-description">{{ t('providers.apiKeyDescription') }}</div>
                  <el-tag v-if="apiKeyCount > 0" size="small" round class="api-key-count-tag">
                    {{ apiKeyCount }}
                  </el-tag>
                </div>
                <el-form-item :label="t('providers.apiKeyLabel')">
                  <el-input v-model="selectedProvider.api_key" type="password"
                    :placeholder="t('providers.apiKeyPlaceholder')" show-password
                    @change="(value) => saveSingleProviderSetting('api_key', value)" />
                </el-form-item>
                <el-form-item :label="t('providers.apiUrlLabel')">
                  <el-input v-model="selectedProvider.url" :placeholder="selectedProvider.apiType === 'claude' ? t('providers.apiUrlPlaceholderClaude') : t('providers.apiUrlPlaceholder')" clearable
                    @change="(value) => saveSingleProviderSetting('url', value)" />
                </el-form-item>

                <el-form-item :label="t('providers.modelsLabel')">
                  <div class="models-actions-row">
                    <el-button :icon="Refresh" plain @click="activate_get_model_function">{{
                      t('providers.getModelsFromApiBtn')
                    }}</el-button>
                    <el-button :icon="Plus" plain @click="addModel_page = true">{{
                      t('providers.addManuallyBtn')
                    }}</el-button>
                    <el-button plain @click="openBatchTestDialog">测试</el-button>
                  </div>
                </el-form-item>
                <div class="models-list-wrapper">
                  <draggable v-if="selectedProvider.modelList && selectedProvider.modelList.length > 0"
                    v-model="selectedProvider.modelList" :item-key="(m) => m"
                    class="models-list-container draggable-models-list" @end="saveModelOrder"
                    ghost-class="sortable-ghost" filter=".el-tag__close" :prevent-on-filter="true">
                    <template #item="{ element: model }">
                      <el-tag :key="model" closable @close="delete_model(model)" class="model-tag" type="info"
                        effect="light">
                        {{ model }}
                      </el-tag>
                    </template>
                  </draggable>
                  <div v-else class="models-list-container">
                    <div class="no-models-message">
                      {{ t('providers.noModelsAdded') }}
                    </div>
                  </div>
                </div>

                <!-- 自定义请求头编辑器 -->
                <el-form-item :label="t('providers.headersLabel')">
                  <div class="header-actions-row">
                    <el-button :icon="Plus" plain @click="addHeaderRow">{{
                      t('providers.addHeaderBtn')
                    }}</el-button>
                    <div class="provider-retry-inline">
                      <span class="provider-retry-inline-label">重试次数</span>
                      <el-input-number :model-value="Number.isInteger(selectedProvider.retryCount) ? selectedProvider.retryCount : 3"
                        :min="0" :max="10" @change="handleRetryCountChange" />
                    </div>
                  </div>
                </el-form-item>
                <div class="provider-headers-list">
                  <div v-for="(row, index) in headerRows" :key="row._id" class="header-row">
                    <el-input v-model="row.key" :placeholder="t('providers.headerKeyPlaceholder')"
                      class="header-key-input" @change="persistProviderHeaders" />
                    <el-input v-model="row.value" :placeholder="t('providers.headerValuePlaceholder')"
                      class="header-value-input" @change="persistProviderHeaders" />
                    <el-button :icon="Delete" plain circle class="header-delete-btn"
                      @click="removeHeaderRow(index)" />
                  </div>
                  <div v-if="headerRows.length === 0" class="no-headers-message">
                    {{ t('providers.noHeaders') }}
                  </div>
                </div>

                <!-- 文件夹位置选择器 -->
                <el-form-item :label="t('providers.folders.floder_label')">
                  <div class="folder-selector">
                    <el-radio-group :model-value="selectedProvider.folderId || ''" @change="set_provider_folder"
                      size="small">
                      <el-radio-button value="">{{ t('providers.folders.root') }}</el-radio-button>
                      <el-radio-button v-for="f in sortedFolders" :key="f.id" :value="f.id">{{ f.name
                      }}</el-radio-button>
                    </el-radio-group>
                  </div>
                </el-form-item>

              </el-form>
            </div>
            <el-empty v-else :description="t('providers.selectProviderOrAdd')" class="empty-state-main" />
          </el-scrollbar>
        </el-main>
      </el-container>
    </div>

    <!-- Dialogs -->
    <el-dialog v-model="addProvider_page" :title="t('providers.addProviderDialogTitle')" width="500px"
      :close-on-click-modal="false">
      <el-form :model="addprovider_form" @submit.prevent="add_prvider_function" label-position="top">
        <el-form-item :label="t('providers.providerNameLabel')" required>
          <el-input v-model="addprovider_form.name" autocomplete="off"
            :placeholder="t('providers.providerNamePlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addProvider_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="add_prvider_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="change_provider_name_page" :title="t('providers.changeProviderNameDialogTitle')" width="500px"
      :close-on-click-modal="false">
      <el-form :model="change_provider_name_form" @submit.prevent="change_provider_name_function" label-position="top">
        <el-form-item :label="t('providers.providerNameLabel')" required>
          <el-input v-model="change_provider_name_form.name" autocomplete="off" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="change_provider_name_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="change_provider_name_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="addModel_page" :title="t('providers.addModelDialogTitle')" width="500px"
      :close-on-click-modal="false">
      <el-form :model="addModel_form" @submit.prevent="add_model_function" label-position="top">
        <el-form-item :label="t('providers.modelNameIdLabel')" required>
          <el-input v-model="addModel_form.name" autocomplete="off"
            :placeholder="t('providers.modelNameIdPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addModel_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="add_model_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="getModel_page" :title="t('providers.availableModelsDialogTitle')" width="700px" top="10vh"
      :close-on-click-modal="false" class="available-models-dialog">
      <el-input v-model="searchQuery" :placeholder="t('providers.searchModelsPlaceholder')" clearable
        :prefix-icon="Search" class="dialog-search-input" />

      <el-alert v-if="getModel_form.error" :title="getModel_form.error" type="error" show-icon :closable="false"
        class="dialog-error-alert" />

      <el-table :data="filteredModels" v-loading="getModel_form.isLoading" style="width: 100%" max-height="50vh"
        :empty-text="searchQuery ? t('providers.noModelsMatchSearch') : t('providers.noModelsFoundError')" stripe
        border>
        <el-table-column prop="id" :label="t('providers.table.modelId')" sortable />
        <el-table-column prop="owned_by" :label="t('providers.table.ownedBy')" width="175" sortable />
        <el-table-column :label="t('providers.table.action')" width="100" align="center">
          <template #default="scope">
            <el-tooltip
              :content="selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id) ? t('providers.removeModelTooltip') : t('providers.addModelTooltip')"
              placement="top">
              <el-button
                :type="selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id) ? 'danger' : 'success'"
                :icon="selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id) ? Remove : CirclePlus"
                circle size="small"
                @click="get_model_function(!(selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id)), scope.row.id)" />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="getModel_page = false">{{ t('common.close') }}</el-button>
        </div>
      </template>
    </el-dialog>

        <el-dialog v-model="batchTestDialogVisible" title="批量测试 Provider Keys" width="760px" top="6vh" :close-on-click-modal="false" class="batch-test-dialog">
      <div class="batch-test-toolbar">
        <el-select v-model="batchTestForm.model" placeholder="选择测试模型" style="width: 260px;">
          <el-option v-for="item in batchTestModelOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="batchTestCodeFilter" style="width: 160px;">
          <el-option v-for="code in batchTestCodeOptions" :key="code" :label="code" :value="code" />
        </el-select>
        <el-button type="primary" :loading="batchTestLoading" @click="runBatchProviderTest">开始测试</el-button>
      </div>

      <el-table :data="filteredBatchTestResults" stripe border max-height="320" @selection-change="handleBatchTestSelectionChange">
        <el-table-column type="selection" width="48" />
        <el-table-column prop="maskedKey" label="Key" min-width="220" />
        <el-table-column prop="code" label="状态码" width="100" />
        <el-table-column label="结果" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.code === 'PENDING' ? 'info' : (scope.row.ok ? 'success' : 'danger')">{{ scope.row.code === 'PENDING' ? '待测试' : (scope.row.ok ? '可用' : '失败') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="信息" min-width="180" show-overflow-tooltip />
      </el-table>

      <template #footer>
        <div class="batch-test-footer">
          <el-button type="danger" plain @click="deleteSelectedBatchTestKeys" :disabled="batchTestSelection.length === 0">删除选中 Key</el-button>
          <el-button @click="batchTestDialogVisible = false">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>


<el-dialog v-model="addFolder_page" :title="t('providers.folders.newFolderTitle')" width="400px"
      :close-on-click-modal="false">
      <el-form :model="addFolder_form" @submit.prevent="add_folder_function">
        <el-form-item :label="t('providers.folders.folderNameLabel')" required>
          <el-input v-model="addFolder_form.name" :placeholder="t('providers.folders.folderNamePlaceholder')"
            @keyup.enter="add_folder_function" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addFolder_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="add_folder_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 重命名目录弹窗 -->
    <el-dialog v-model="renameFolder_page" :title="t('providers.folders.renameFolderTitle')" width="400px"
      :close-on-click-modal="false">
      <el-form :model="renameFolder_form" @submit.prevent="rename_folder_function">
        <el-form-item :label="t('providers.folders.folderNameLabel')" required>
          <el-input v-model="renameFolder_form.name" :placeholder="t('providers.folders.folderNamePlaceholder')"
            @keyup.enter="rename_folder_function" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameFolder_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="rename_folder_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.providers-page-container {
  height: 100%;
  width: 100%;
  padding: 0;
  box-sizing: border-box;
  background-color: var(--bg-primary);
  display: flex;
}

.providers-content-wrapper {
  flex-grow: 1;
  width: 100%;
  background-color: transparent;
  overflow: hidden;
  display: flex;
  padding: 20px;
  gap: 20px;
}

.providers-content-wrapper>.el-container {
  width: 100%;
  height: 100%;
  background-color: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-primary);
  overflow: hidden;
}

.providers-aside {
  background-color: var(--bg-primary);
  border-right: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  padding: 0;
}

.provider-search-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 8px 10px;
}

.provider-search-mode {
  width: 100%;
}

.provider-search-mode :deep(.el-radio-button) {
  flex: 1;
}

.provider-search-mode :deep(.el-radio-button__inner) {
  width: 100%;
}

.provider-retry-inline {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.provider-retry-inline-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.batch-test-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.batch-test-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}


.provider-search-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 8px 10px;
}

.provider-search-mode {
  width: 100%;
}

.provider-search-mode :deep(.el-radio-button) {
  flex: 1;
}

.provider-search-mode :deep(.el-radio-button__inner) {
  width: 100%;
}

.provider-retry-inline {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.provider-retry-inline-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.batch-test-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.batch-test-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}


.provider-list-scrollbar {
  flex-grow: 1;
  padding: 8px;
}

.no-providers {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}

.provider-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 4px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  font-size: 14px;
  color: var(--text-primary) !important;
}

.provider-item-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
  margin-right: 8px;
  font-family: ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  font-weight: bolder;
}

.provider-item:hover {
  background-color: var(--bg-tertiary);
}

.provider-item.active {
  background-color: var(--bg-accent); 
  color: var(--text-on-accent) !important;
  font-weight: 600;
}

.provider-item.disabled .provider-item-name {
  color: var(--text-tertiary);
  text-decoration: line-through;
}

.aside-actions {
  padding: 12px;
  border-top: 1px solid var(--border-primary);
  display: flex;
}

.action-group {
  display: flex;
  width: 100%;
}

.action-group .el-button:first-child {
  flex: 0 0 50px;
}

.action-group .add-provider-btn {
  flex: 1;
  width: auto;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  background-color: var(--bg-accent);
  color: var(--text-on-accent);
  border: none;
  font-weight: 500;
}

.add-provider-btn:hover {
  opacity: 0.9;
  background-color: var(--bg-accent);
}

.provider-main-content {
  padding: 0;
  background-color: var(--bg-secondary);
  height: 100%;
}

.provider-details-scrollbar {
  height: 100%;
}

.provider-details-scrollbar :deep(.el-scrollbar__view) {
  height: 100%;
  display: flex;
  flex-direction: column;
}


.provider-details {
  padding: 15px 30px 0px 30px;
  flex-grow: 1;
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--border-primary);
}

.provider-title-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.provider-name {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.provider-name .edit-icon {
  margin-left: 10px;
  color: var(--text-secondary);
  font-size: 16px;
  opacity: 0;
  transition: opacity 0.2s;
}

.provider-name:hover .edit-icon {
  opacity: 1;
}

.header-buttons {
  display: flex;
  gap: 8px;
}

.provider-header-controls {
  display: flex;
  align-items: center;
  gap: 18px;
}

.api-type-select {
  width: 130px;
}

html.dark .api-type-select {
  --el-fill-color-blank: var(--bg-primary);
}

.provider-form {
  margin-top: 20px !important;
}

.provider-form :deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--text-secondary);
}

.form-item-description {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 6px;
  line-height: 1.4;
}

.models-list-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background-color: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-primary);
  min-height: 75px;
  width: 100%;
  box-sizing: border-box;
}

.no-models-message {
  width: 100%;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 12px 0;
}

/* 自定义请求头编辑器样式 */
.header-actions-row {
  display: flex;
  gap: 10px;
}

.provider-headers-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin-bottom: 18px;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-key-input {
  flex: 0 0 35%;
}

.header-value-input {
  flex: 1 1 auto;
}

.header-delete-btn {
  flex: 0 0 auto;
}

.no-headers-message {
  width: 100%;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 4px 0;
}

.model-tag {
  background-color: var(--bg-accent) !important;
  color: var(--text-on-accent) !important;
  border: none !important;
  font-weight: 500;

  display: inline-flex !important;
  align-items: center !important;
  height: 25px !important;
  line-height: 1 !important;
}

.model-tag :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  height: 100%;
  padding-bottom: 2px;
}

.model-tag :deep(.el-tag__close) {
  color: inherit !important;
  position: relative;
  top: 0;
  margin-left: 6px;
}

.model-tag :deep(.el-tag__close:hover) {
  background-color: rgba(255, 255, 255, 0.3) !important;
  color: #FFFFFF !important;
}

html.dark .model-tag :deep(.el-tag__close:hover) {
  background-color: rgba(0, 0, 0, 0.2) !important;
  color: #000000 !important;
}

.draggable-models-list .model-tag {
  cursor: move;
}

.draggable-models-list .sortable-ghost {
  opacity: 0.5;
  background-color: var(--bg-accent-light);
  border: 1px dashed var(--border-accent);
}

.empty-state-main {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

:deep(.el-switch.is-checked .el-switch__core) {
  background-color: var(--bg-accent);
  border-color: var(--bg-accent);
}

:deep(.el-table__header-wrapper th) {
  background-color: var(--bg-primary) !important;
  font-weight: 500;
  color: var(--text-secondary);
}

:deep(.el-table tr),
:deep(.el-table) {
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

:deep(.el-table--border::after),
:deep(.el-table--border::before) {
  background-color: var(--border-primary);
}

:deep(.el-dialog__header) {
  padding: 5px !important;
}

:deep(.el-dialog__body) {
  padding: 15px 20px 10px 20px !important;
}

:deep(.available-models-dialog .dialog-search-input) {
  margin-bottom: 0 !important;
}

:deep(.available-models-dialog .dialog-error-alert) {
  margin-bottom: 15px !important;
}

:deep(.el-dialog__footer) {
  padding: 5px;
}

.api-key-count-tag {
  background-color: transparent !important;
  color: var(--text-primary);
  height: 18px;
  line-height: 18px;
  box-shadow: none;
  margin-top: -4px !important;
}

.form-item-header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 2px;
  padding-left: 85px;

}

.form-item-header .form-item-description {
  margin-top: 0;
}

.provider-form {
  margin-top: 20px;
}

.provider-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.models-actions-row {
  display: flex;
  gap: 10px;
}

.models-list-wrapper {
  margin-left: 0px;
  margin-bottom: 18px;
}

/* 文件夹相关样式 */
.folder-group {
  margin-bottom: 4px;
}

.folder-header {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  transition: background-color 0.2s;
}

.folder-header:hover {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
}

.folder-icon-wrapper {
  display: flex;
  align-items: center;
  margin-right: 6px;
  color: #FFB02E;
}

.folder-name {
  flex-grow: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-actions {
  display: flex;
  gap: 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.folder-header:hover .folder-actions {
  opacity: 1;
}

.folder-action-btn {
  padding: 2px;
  height: auto;
  margin-left: 2px !important;
}

.folder-content {
  margin-top: 2px;
  position: relative;
}

.provider-item.in-folder {
  margin-left: 12px;
  padding: 8px 12px;
  font-size: 13px;
  border-left: 2px solid var(--border-primary);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}

.empty-folder-tip {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 4px 0 4px 24px;
  font-style: italic;
}

.root-providers-divider {
  height: 1px;
  background-color: var(--border-primary);
  margin: 8px 10px;
}

.folder-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

html.dark .folder-icon-wrapper {
  color: #E6A23C;
}

html.dark .provider-item.in-folder {
  border-left-color: var(--border-primary);
}
</style>