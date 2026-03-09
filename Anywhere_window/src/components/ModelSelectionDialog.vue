<script setup>
import { ref, computed } from 'vue';
import { ElDialog, ElButton, ElInput, ElScrollbar, ElIcon } from 'element-plus';
import { Search, Check } from '@element-plus/icons-vue';

const props = defineProps({
    modelValue: Boolean, // for v-model
    modelList: Array,
    currentModel: String,
});

const emit = defineEmits(['update:modelValue', 'select', 'save-model']);

const searchQuery = ref('');
const searchInputRef = ref(null);

const handleOpened = () => {
    if (searchInputRef.value) {
        searchInputRef.value.focus();
    }
};

// 计算分组后的模型列表
const groupedModels = computed(() => {
    const query = searchQuery.value.toLowerCase();
    const groups = {};
    const groupOrder = []; // 保持插入顺序

    props.modelList.forEach(item => {
        // 搜索过滤
        if (query && !item.label.toLowerCase().includes(query)) {
            return;
        }

        const parts = item.label.split('|');
        const providerName = parts[0] || 'Unknown';
        const modelName = parts[1] || item.label;

        if (!groups[providerName]) {
            groups[providerName] = [];
            groupOrder.push(providerName);
        }

        groups[providerName].push({
            ...item,
            displayName: modelName,
            providerName: providerName
        });
    });

    return groupOrder.map(name => ({
        name: name,
        models: groups[name]
    }));
});

const onModelClick = (model, event) => {
    // 如果按住 Alt 键点击，或者是当前模型再次点击，则触发保存为默认
    if (model.value === props.currentModel || event.altKey) {
        emit('save-model', model.value);
    } else {
        emit('select', model.value);
    }
};

const handleClose = () => {
    searchQuery.value = ''; // 关闭时清空搜索词
    emit('update:modelValue', false);
};

const getProviderStyle = (providerName) => {
    let hash = 0;
    for (let i = 0; i < providerName.length; i++) {
        hash = providerName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return { '--provider-hue': hue };
};
</script>

<template>
    <el-dialog 
        :model-value="modelValue" 
        @update:model-value="handleClose" 
        width="70%"
        custom-class="model-dialog no-header-dialog adaptive-dialog" 
        @opened="handleOpened"
        :show-close="false"
    >
        <template #header>
            <div style="display: none;"></div>
        </template>

        <div class="dialog-content-wrapper">
            <!-- 搜索栏 -->
            <div class="model-search-container">
                <el-input 
                    ref="searchInputRef" 
                    v-model="searchQuery" 
                    placeholder="搜索服务商或模型名称..." 
                    clearable 
                    :prefix-icon="Search" 
                    class="custom-search-input"
                />
            </div>
            
            <!-- 列表区域：max-height 控制高度自适应 -->
            <el-scrollbar max-height="42vh" class="model-list-scrollbar">
                <div v-if="groupedModels.length === 0" class="empty-state">
                    暂无匹配模型
                </div>

                <div v-else class="model-groups">
                    <div v-for="group in groupedModels" :key="group.name" class="provider-group" :style="getProviderStyle(group.name)">
                        <div class="provider-title">{{ group.name }}</div>
                        
                        <div class="model-grid">
                            <div 
                                v-for="model in group.models" 
                                :key="model.value" 
                                class="model-item"
                                :class="{ 'is-active': model.value === currentModel }"
                                @click="(e) => onModelClick(model, e)"
                                :title="model.value === currentModel ? '当前模型 (点击保存为默认)' : '切换到此模型'"
                            >
                                <div class="model-info">
                                    <span class="model-name">{{ model.displayName }}</span>
                                </div>

                                <div class="model-status" v-if="model.value === currentModel">
                                    <el-icon class="check-icon"><Check /></el-icon>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </el-scrollbar>
        </div>

        <template #footer>
            <div class="dialog-footer">
                <span class="hint-text">提示: 点击切换，再次点击保存为默认</span>
                <el-button @click="handleClose">关闭</el-button>
            </div>
        </template>
    </el-dialog>
</template>

<style scoped>
/* 限制最大宽度，防止在大屏上过于扁平 */
:deep(.adaptive-dialog) {
    max-width: 800px; 
    margin: 0 auto;
}

.dialog-content-wrapper {
    display: flex;
    flex-direction: column;
}

.model-search-container {
    padding: 0 0 15px 0;
    flex-shrink: 0;
}

.custom-search-input :deep(.el-input__wrapper) {
    background-color: var(--el-fill-color-light);
    box-shadow: none;
    border-radius: 8px;
    padding: 8px 12px;
}

.custom-search-input :deep(.el-input__wrapper.is-focus) {
    background-color: var(--el-bg-color);
    box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

.model-list-scrollbar {
    flex-grow: 1;
}

.provider-group {
    margin-bottom: 20px;
    background-color: hsla(var(--provider-hue), 60%, 50%, 0.05); 
    border: 1px solid hsla(var(--provider-hue), 60%, 50%, 0.1); 
    border-radius: 12px;
    padding: 12px 12px 4px 12px; 
}

.provider-group:last-child {
    margin-bottom: 0;
}

html.dark .provider-group {
    background-color: hsla(var(--provider-hue), 60%, 50%, 0.08);
    border-color: hsla(var(--provider-hue), 60%, 50%, 0.15);
}

.provider-title {
    font-size: 13px;
    color: hsla(var(--provider-hue), 60%, 40%, 0.8);
    margin-bottom: 8px;
    padding-left: 4px; /* 调整内边距适应新外壳 */
    font-weight: 600;
}

html.dark .provider-title {
    color: hsla(var(--provider-hue), 60%, 65%, 0.8);
}

.model-grid {
    display: flex;
    flex-direction: column;
    gap: 0px;
}

.model-item {
    display: flex;
    align-items: center;
    padding: 10px 12px 8px 12px; 
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
    background-color: transparent; /* 背景设为透明，融入彩色父级 */
}

.model-item:hover {
    background-color: hsla(var(--provider-hue), 60%, 50%, 0.1);
}

html.dark .model-item:hover {
    background-color: hsla(var(--provider-hue), 60%, 50%, 0.15);
}

.model-item.is-active {
    background-color: hsla(var(--provider-hue), 60%, 50%, 0.15);
    border-color: hsla(var(--provider-hue), 60%, 50%, 0.3);
}

html.dark .model-item.is-active {
    background-color: hsla(var(--provider-hue), 60%, 50%, 0.25);
    border-color: hsla(var(--provider-hue), 60%, 50%, 0.4);
}

.model-info {
    flex-grow: 1;
    overflow: hidden;
}

.model-name {
    font-size: 14px;
    color: var(--el-text-color-primary);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
}

.model-item.is-active .model-name {
    color: hsla(var(--provider-hue), 80%, 40%, 1);
}

html.dark .model-item.is-active .model-name {
    color: hsla(var(--provider-hue), 80%, 65%, 1);
}

.model-status {
    color: hsla(var(--provider-hue), 80%, 40%, 1);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 10px;
}

html.dark .model-status {
    color: hsla(var(--provider-hue), 80%, 65%, 1);
}

.empty-state {
    text-align: center;
    padding: 40px 0;
    color: var(--el-text-color-secondary);
    font-size: 14px;
}

.dialog-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 10px;
}

.hint-text {
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

:deep(.el-dialog__header) {
    padding-bottom: 0 !important;
}

:deep(.el-dialog__body) {
    padding: 20px 24px 10px 24px !important;
}
</style>