<script setup>
import { ref, reactive, onMounted, computed, inject } from 'vue'
import { Plus, Delete, Edit, ArrowUp, ArrowDown, Refresh, CirclePlus, Remove, Search } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import draggable from 'vuedraggable';

const { t } = useI18n();

const currentConfig = inject('config');
const provider_key = ref(null);

onMounted(() => {
  if (currentConfig.value.providerOrder && currentConfig.value.providerOrder.length > 0) {
    provider_key.value = currentConfig.value.providerOrder[0];
  } else if (currentConfig.value.providers && Object.keys(currentConfig.value.providers).length > 0) {
    provider_key.value = Object.keys(currentConfig.value.providers)[0];
  } else {
    provider_key.value = null;
  }
});

const selectedProvider = computed(() => {
  if (provider_key.value && currentConfig.value.providers && currentConfig.value.providers[provider_key.value]) {
    return currentConfig.value.providers[provider_key.value];
  }
  return null;
});

// 原子化保存函数
async function atomicSave(updateFunction) {
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
}

function delete_provider() {
  if (!provider_key.value) return;

  atomicSave(config => {
    const keyToDelete = provider_key.value;
    const index = config.providerOrder.indexOf(keyToDelete);

    delete config.providers[keyToDelete];
    config.providerOrder = config.providerOrder.filter(key => key !== keyToDelete);

    // 更新 provider_key 以选择一个新的服务商
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
}

const addProvider_page = ref(false);
const addprovider_form = reactive({ name: "" });

function add_prvider_function() {
  const timestamp = String(Date.now());
  const newName = addprovider_form.name || `${t('providers.unnamedProvider')} ${timestamp.slice(-4)}`;

  atomicSave(config => {
    config.providers[timestamp] = {
      name: newName,
      url: "", api_key: "", modelList: [], enable: true,
    };
    config.providerOrder.push(timestamp);
    provider_key.value = timestamp; // 设置新添加的为当前选中
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
    if (provider) {
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
  const apiKeyToUse = window.api && typeof window.api.getRandomItem === 'function' && apiKey ? window.api.getRandomItem(apiKey) : apiKey;


  const options = {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  };
  if (apiKeyToUse) {
    options.headers['Authorization'] = `Bearer ${apiKeyToUse}`;
  }

  try {
    const response = await fetch(`${url}/models`, options);
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

function change_order(flag) {
  if (!provider_key.value) return;
  const keyToMove = provider_key.value;

  atomicSave(config => {
    let index = config.providerOrder.indexOf(keyToMove);
    if (index === -1) return;

    let newOrder = [...config.providerOrder];
    const item = newOrder.splice(index, 1)[0];

    if (flag === "up" && index > 0) {
      newOrder.splice(index - 1, 0, item);
    } else if (flag === "down" && index < newOrder.length) {
      newOrder.splice(index + 1, 0, item);
    } else {
      return;
    }
    config.providerOrder = newOrder;
  });
}

// [新增] 拖拽排序结束后调用的保存函数
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
  const keyPath = `providers.${provider_key.value}.${key}`;
  try {
    await window.api.saveSetting(keyPath, value);
  } catch (e) {
    ElMessage.error(t('providers.alerts.saveFailed'));
  }
}

const apiKeyCount = computed(() => {
  if (!selectedProvider.value || !selectedProvider.value.api_key || !selectedProvider.value.api_key.trim()) {
    return 0;
  }
  // 同时支持中英文逗号，并过滤空字符串
  const keys = selectedProvider.value.api_key.split(/[,，]/).filter(k => k.trim() !== '');
  return keys.length;
});
</script>

<template>
  <div class="providers-page-container">
    <div class="providers-content-wrapper">
      <el-container>
        <el-aside width="240px" class="providers-aside">
          <el-scrollbar class="provider-list-scrollbar">
            <div v-for="key_id in currentConfig.providerOrder" :key="key_id" class="provider-item" :class="{
              'active': provider_key === key_id, 'disabled': currentConfig.providers[key_id] && !currentConfig.providers[key_id].enable
            }" @click="provider_key = key_id">
              <span class="provider-item-name">{{ currentConfig.providers[key_id]?.name ||
                t('providers.unnamedProvider') }}</span>
              <el-tag v-if="currentConfig.providers[key_id] && !currentConfig.providers[key_id].enable" type="info"
                size="small" effect="dark" round>{{ t('providers.statusOff') }}</el-tag>
            </div>
            <div v-if="!currentConfig.providerOrder || currentConfig.providerOrder.length === 0" class="no-providers">
              {{ t('providers.noProviders') }}
            </div>
          </el-scrollbar>
          <div class="aside-actions">
            <el-button type="primary" :icon="Plus" @click="addProvider_page = true" class="add-provider-btn">
              {{ t('providers.addProviderBtn') }}
            </el-button>
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
                    <el-button :icon="ArrowUp" circle plain size="small" :title="t('providers.moveUpTooltip')"
                      :disabled="!currentConfig.providerOrder || currentConfig.providerOrder.indexOf(provider_key) === 0"
                      @click="change_order('up')" />
                    <el-button :icon="ArrowDown" circle plain size="small" :title="t('providers.moveDownTooltip')"
                      :disabled="!currentConfig.providerOrder || currentConfig.providerOrder.indexOf(provider_key) === currentConfig.providerOrder.length - 1"
                      @click="change_order('down')" />
                    <el-button type="danger" :icon="Delete" circle plain size="small" @click="delete_provider"
                      :title="t('providers.deleteProviderTooltip')" />
                  </div>
                </div>
                <el-switch v-model="selectedProvider.enable"
                  @change="(value) => saveSingleProviderSetting('enable', value)" size="large" />
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
                  <el-input v-model="selectedProvider.url" :placeholder="t('providers.apiUrlPlaceholder')" clearable
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
                  </div>
                </el-form-item>
                <div class="models-list-wrapper">
                  <draggable v-if="selectedProvider.modelList && selectedProvider.modelList.length > 0"
                    v-model="selectedProvider.modelList" item-key="model"
                    class="models-list-container draggable-models-list" @end="saveModelOrder"
                    ghost-class="sortable-ghost">
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
  background-color: var(--bg-accent-light);
  color: var(--text-accent);
  font-weight: 600;
}

.provider-item.disabled .provider-item-name {
  color: var(--text-tertiary);
  text-decoration: line-through;
}

.aside-actions {
  padding: 12px;
  border-top: 1px solid var(--border-primary);
}

.add-provider-btn {
  width: 100%;
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

:deep(.available-models-dialog .el-dialog__header) {
  padding: 5px !important;
}

:deep(.available-models-dialog .el-dialog__body) {
  padding: 15px 20px 10px 20px !important;
}

:deep(.available-models-dialog .dialog-search-input) {
  margin-bottom: 0 !important;
}

:deep(.available-models-dialog .dialog-error-alert) {
  margin-bottom: 15px !important;
}

:deep(.available-models-dialog .el-dialog__footer) {
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
</style>