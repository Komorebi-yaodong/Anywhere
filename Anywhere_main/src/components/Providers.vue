<script setup>
// The <script setup> block remains unchanged.
import { ref, reactive, onMounted, computed } from 'vue'
import { Plus, Delete, Edit, ArrowUp, ArrowDown, Refresh, CirclePlus, Remove, Search } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const currentConfig = ref(window.api.defaultConfig.config);
const provider_key = ref(null);

onMounted(async () => {
  try {
    const result = await window.api.getConfig();

    if (result && result.config) {
      currentConfig.value = result.config;
    } else {
      console.error("Failed to get valid config from API.");
      currentConfig.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
    }

    if (currentConfig.value.providerOrder && currentConfig.value.providerOrder.length > 0) {
      provider_key.value = currentConfig.value.providerOrder[0];
    } else if (currentConfig.value.providers && Object.keys(currentConfig.value.providers).length > 0) {
      provider_key.value = Object.keys(currentConfig.value.providers)[0];
    } else {
      provider_key.value = null;
    }

  } catch (error) {
    console.error("Error fetching config in Providers.vue:", error);
    currentConfig.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
    if (currentConfig.value.providerOrder && currentConfig.value.providerOrder.length > 0) {
      provider_key.value = currentConfig.value.providerOrder[0];
    }
  }
});

const selectedProvider = computed(() => {
  if (provider_key.value && currentConfig.value.providers && currentConfig.value.providers[provider_key.value]) {
    return currentConfig.value.providers[provider_key.value];
  }
  return null;
});


function delete_provider() {
  if (!provider_key.value || !currentConfig.value.providers[provider_key.value]) return;

  const index = currentConfig.value.providerOrder.indexOf(provider_key.value);
  delete currentConfig.value.providers[provider_key.value];
  currentConfig.value.providerOrder = currentConfig.value.providerOrder.filter(key => key !== provider_key.value);

  saveConfig();

  if (currentConfig.value.providerOrder.length > 0) {
    if (index > 0 && index <= currentConfig.value.providerOrder.length) {
      provider_key.value = currentConfig.value.providerOrder[index - 1];
    } else {
      provider_key.value = currentConfig.value.providerOrder[0];
    }
  } else {
    provider_key.value = null;
  }
}

const addProvider_page = ref(false);
const addprovider_form = reactive({ name: "" });

function add_prvider_function() {
  const timestamp = String(Date.now());
  currentConfig.value.providers[timestamp] = {
    name: addprovider_form.name || `${t('providers.unnamedProvider')} ${timestamp.slice(-4)}`,
    url: "", api_key: "", modelList: [], enable: true,
  };
  currentConfig.value.providerOrder.push(timestamp);
  saveConfig();
  addprovider_form.name = "";
  provider_key.value = timestamp;
  addProvider_page.value = false;
}

const change_provider_name_page = ref(false);
const change_provider_name_form = reactive({ name: "" });

function openChangeProviderNameDialog(){
  if (selectedProvider.value) {
    change_provider_name_form.name = selectedProvider.value.name;
    change_provider_name_page.value = true;
  }
}
function change_provider_name_function() {
  if (selectedProvider.value) {
    selectedProvider.value.name = change_provider_name_form.name;
    saveConfig();
  }
  change_provider_name_form.name = "";
  change_provider_name_page.value = false;
}

function delete_model(model) {
  if (selectedProvider.value) {
    selectedProvider.value.modelList = selectedProvider.value.modelList.filter(m => m !== model);
    saveConfig();
  }
}

const addModel_page = ref(false);
const addModel_form = reactive({ name: "" })
function add_model_function() {
  if (selectedProvider.value && addModel_form.name.trim()) {
    if (!selectedProvider.value.modelList) {
        selectedProvider.value.modelList = [];
    }
    selectedProvider.value.modelList.push(addModel_form.name.trim());
    saveConfig();
  }
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
  if (selectedProvider.value) {
    if (!selectedProvider.value.modelList) {
        selectedProvider.value.modelList = [];
    }
    if (add) {
      if (!selectedProvider.value.modelList.includes(modelId)) {
        selectedProvider.value.modelList.push(modelId);
      }
    } else {
      selectedProvider.value.modelList = selectedProvider.value.modelList.filter(m => m !== modelId);
    }
    saveConfig();
  }
}

function change_order(flag) {
  if (!provider_key.value) return;
  let index = currentConfig.value.providerOrder.indexOf(provider_key.value);
  if (index === -1) return;

  let newOrder = [...currentConfig.value.providerOrder];
  const item = newOrder.splice(index, 1)[0];

  if (flag === "up" && index > 0) {
    newOrder.splice(index - 1, 0, item);
  } else if (flag === "down" && index < currentConfig.value.providerOrder.length - 1) {
    newOrder.splice(index + 1, 0, item);
  } else {
    return;
  }
  currentConfig.value.providerOrder = newOrder;
  saveConfig();
}

async function change_enable(){
  saveConfig();
}

async function saveConfig() {
  try {
    const configToSave = { config: JSON.parse(JSON.stringify(currentConfig.value)) };
    if (window.api && window.api.updateConfig) {
      await window.api.updateConfig(configToSave);
    } else {
      console.warn("window.api.updateConfig is not available. Config not saved.");
    }
  } catch (error) {
    console.error("Error saving config:", error);
    ElMessage.error(t('providers.alerts.configSaveFailed'));
  }
}
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
              <span class="provider-item-name">{{ currentConfig.providers[key_id]?.name || t('providers.unnamedProvider') }}</span>
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
          <div v-if="selectedProvider" class="provider-details">
            <div class="provider-header">
              <div class="provider-title-actions">
                <h2 class="provider-name" @click="openChangeProviderNameDialog">
                  {{ selectedProvider.name }}
                  <el-tooltip :content="t('providers.editNameTooltip')" placement="top">
                    <el-icon class="edit-icon"><Edit /></el-icon>
                  </el-tooltip>
                </h2>
                <div class="header-buttons">
                  <el-button :icon="ArrowUp" circle plain size="small" :title="t('providers.moveUpTooltip')" :disabled="!currentConfig.providerOrder || currentConfig.providerOrder.indexOf(provider_key) === 0"
                    @click="change_order('up')" />
                  <el-button :icon="ArrowDown" circle plain size="small" :title="t('providers.moveDownTooltip')" :disabled="!currentConfig.providerOrder || currentConfig.providerOrder.indexOf(provider_key) === currentConfig.providerOrder.length - 1"
                    @click="change_order('down')" />
                  <el-button type="danger" :icon="Delete" circle plain size="small" @click="delete_provider"
                    :title="t('providers.deleteProviderTooltip')" />
                </div>
              </div>
              <el-switch v-model="selectedProvider.enable" @change="change_enable" size="large" />
            </div>

            <el-form label-position="top" class="provider-form">
              <el-form-item :label="t('providers.apiKeyLabel')">
                <el-input v-model="selectedProvider.api_key" type="password" :placeholder="t('providers.apiKeyPlaceholder')"
                  show-password clearable @change="saveConfig" />
                <div class="form-item-description">{{ t('providers.apiKeyDescription') }}</div>
              </el-form-item>
              <el-form-item :label="t('providers.apiUrlLabel')">
                <el-input v-model="selectedProvider.url" :placeholder="t('providers.apiUrlPlaceholder')" clearable
                  @change="saveConfig" />
              </el-form-item>

              <el-form-item :label="t('providers.modelsLabel')" class="models-form-item">
                <div class="models-list-container">
                  <el-tag v-for="model in selectedProvider.modelList" :key="model" closable @close="delete_model(model)"
                    class="model-tag" type="info" effect="light">
                    {{ model }}
                  </el-tag>
                  <div v-if="!selectedProvider.modelList || selectedProvider.modelList.length === 0"
                    class="no-models-message">
                    {{ t('providers.noModelsAdded') }}
                  </div>
                </div>
                <div class="models-actions-row">
                  <el-button :icon="Refresh" plain @click="activate_get_model_function">{{ t('providers.getModelsFromApiBtn') }}</el-button>
                  <el-button :icon="Plus" plain @click="addModel_page = true">{{ t('providers.addManuallyBtn') }}</el-button>
                </div>
              </el-form-item>
            </el-form>
          </div>
          <el-empty v-else :description="t('providers.selectProviderOrAdd')" class="empty-state-main" />
        </el-main>
      </el-container>
    </div>

    <!-- Dialogs remain largely unchanged but will inherit some global styles -->
    <el-dialog v-model="addProvider_page" :title="t('providers.addProviderDialogTitle')" width="500px" :close-on-click-modal="false">
      <el-form :model="addprovider_form" @submit.prevent="add_prvider_function" label-position="top">
        <el-form-item :label="t('providers.providerNameLabel')" required>
          <el-input v-model="addprovider_form.name" autocomplete="off" :placeholder="t('providers.providerNamePlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addProvider_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="add_prvider_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="change_provider_name_page" :title="t('providers.changeProviderNameDialogTitle')" width="500px" :close-on-click-modal="false">
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

    <el-dialog v-model="addModel_page" :title="t('providers.addModelDialogTitle')" width="500px" :close-on-click-modal="false">
      <el-form :model="addModel_form" @submit.prevent="add_model_function" label-position="top">
        <el-form-item :label="t('providers.modelNameIdLabel')" required>
          <el-input v-model="addModel_form.name" autocomplete="off" :placeholder="t('providers.modelNameIdPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addModel_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="add_model_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="getModel_page" :title="t('providers.availableModelsDialogTitle')" width="700px" :close-on-click-modal="false">
      <el-input v-model="searchQuery" :placeholder="t('providers.searchModelsPlaceholder', { default: '通过模型ID或所有者搜索...' })"
        clearable :prefix-icon="Search" style="margin-bottom: 20px;" />

      <el-alert v-if="getModel_form.error" :title="getModel_form.error" type="error" show-icon :closable="false"
        style="margin-bottom: 20px;" />

      <el-table :data="filteredModels" v-loading="getModel_form.isLoading" style="width: 100%" max-height="450px"
        :empty-text="searchQuery ? t('providers.noModelsMatchSearch', { default: '未找到匹配的模型' }) : t('providers.noModelsFoundError')"
        stripe border>
        <el-table-column prop="id" :label="t('providers.table.modelId')" sortable />
        <el-table-column prop="owned_by" :label="t('providers.table.ownedBy')" width="180" sortable />
        <el-table-column :label="t('providers.table.action')" width="100" align="center">
          <template #default="scope">
            <el-tooltip
              :content="selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id) ? t('providers.removeModelTooltip') : t('providers.addModelTooltip')"
              placement="top">
              <el-button
                :type="selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id) ? 'danger' : 'success'"
                :icon="selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id) ? Remove : CirclePlus"
                circle plain size="small"
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

.providers-content-wrapper > .el-container {
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
  color: var(--text-primary);
}

.provider-item-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
  margin-right: 8px;
  font-weight: 500;
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
  overflow-y: auto;
}

.provider-details {
  padding: 30px 36px;
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
  padding-bottom: 24px;
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

.provider-form :deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--text-secondary);
  padding-bottom: 8px !important;
}

.form-item-description {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 6px;
  line-height: 1.4;
}

.models-form-item :deep(.el-form-item__content) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.models-list-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  padding: 12px;
  background-color: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-primary);
  min-height: 80px;
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
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: transparent;
  font-weight: 500;
}

.models-actions-row {
  display: flex;
  gap: 10px;
  margin-top: 8px;
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
  background-color: var(--bg-tertiary) !important;
  font-weight: 500;
  color: var(--text-secondary);
}
</style>