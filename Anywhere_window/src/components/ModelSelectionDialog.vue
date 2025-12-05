<script setup>
import { ref, computed } from 'vue';
import { ElDialog, ElTable, ElTableColumn, ElButton, ElInput, ElTooltip } from 'element-plus';
import { Search } from '@element-plus/icons-vue';

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

const filteredModelList = computed(() => {
    if (!searchQuery.value) {
        return props.modelList;
    }
    const lowerCaseQuery = searchQuery.value.toLowerCase();
    return props.modelList.filter(model =>
        model.label.toLowerCase().includes(lowerCaseQuery)
    );
});

const tableSpanMethod = ({ row, column, rowIndex, columnIndex }) => {
    if (columnIndex === 0) {
        if (rowIndex > 0 && filteredModelList.value[rowIndex - 1].label.split("|")[0] === row.label.split("|")[0]) {
            return { rowspan: 0, colspan: 0 };
        }
        let rowspan = 1;
        for (let i = rowIndex + 1; i < filteredModelList.value.length; i++) {
            if (filteredModelList.value[i].label.split("|")[0] === row.label.split("|")[0]) {
                rowspan++;
            } else {
                break;
            }
        }
        return { rowspan: rowspan, colspan: 1 };
    }
};

const onModelClick = (model) => {
    if (model.value === props.currentModel) {
        // 如果点击的是当前模型，触发保存事件
        emit('save-model', model.value);
    } else {
        // 否则，触发选择事件
        emit('select', model.value);
    }
};

const handleClose = () => {
    searchQuery.value = ''; // 关闭时清空搜索词
    emit('update:modelValue', false);
};
</script>

<template>
    <el-dialog 
        :model-value="modelValue" 
        @update:model-value="handleClose" 
        width="80%"
        custom-class="model-dialog no-header-dialog" 
        @opened="handleOpened"
        :show-close="false"
    >
        <!-- 移除默认标题栏 -->
        <template #header>
            <div style="display: none;"></div>
        </template>

        <div class="model-search-container">
            <el-input ref="searchInputRef" v-model="searchQuery" placeholder="搜索服务商或模型名称..." clearable :prefix-icon="Search" />
        </div>
        
        <el-table 
            :data="filteredModelList" 
            stripe 
            style="width: 100%;" 
            max-height="50vh" 
            :border="true"
            :span-method="tableSpanMethod" 
            width="100%"
        >
            <el-table-column label="服务商" align="center" prop="provider" width="120">
                <template #default="scope">
                    <strong>{{ scope.row.label.split("|")[0] }}</strong>
                </template>
            </el-table-column>
            <el-table-column label="模型" align="center" prop="modelName">
                <template #default="scope">
                    <el-tooltip :content="scope.row.value === currentModel ? '当前模型，再次点击可保存为默认' : '选择此模型'"
                        placement="top" :enterable="false">
                        <el-button link size="large" @click="onModelClick(scope.row)"
                            :class="{ 'is-current-model': scope.row.value === currentModel }">
                            {{ scope.row.label.split("|")[1] }}
                        </el-button>
                    </el-tooltip>
                </template>
            </el-table-column>
        </el-table>
        <template #footer>
            <el-button @click="handleClose">关闭</el-button>
        </template>
    </el-dialog>
</template>

<style scoped>
.model-search-container {
    padding: 0 0 15px 0;
}
.el-button.is-link.is-current-model {
  color: #E6A23C; /* Element Plus 的金色/黄色 */
  font-weight: bold;
}

.el-button.is-link.is-current-model:hover {
  color: #ebb563;
}

:deep(.el-dialog__header) {
    padding-bottom:0 !important;
}
</style>