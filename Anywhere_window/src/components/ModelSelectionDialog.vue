<script setup>
import { ref, computed } from 'vue';
import { ElDialog, ElTable, ElTableColumn, ElButton, ElInput } from 'element-plus';
import { Search } from '@element-plus/icons-vue';

const props = defineProps({
    modelValue: Boolean, // for v-model
    modelList: Array,
    currentModel: String,
});

const emit = defineEmits(['update:modelValue', 'select']);

const searchQuery = ref('');

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

const handleClose = () => {
    searchQuery.value = ''; // 关闭时清空搜索词
    emit('update:modelValue', false);
};

const handleSelect = (modelValue) => emit('select', modelValue);
</script>

<template>
    <el-dialog title="选择模型" :model-value="modelValue" @update:model-value="handleClose" width="70%" custom-class="model-dialog">
        <div class="model-search-container">
            <el-input
                v-model="searchQuery"
                placeholder="搜索服务商或模型名称..."
                clearable
                :prefix-icon="Search"
            />
        </div>
        <el-table :data="filteredModelList" stripe style="width: 100%; height: 400px;" :max-height="400" :border="true"
            :span-method="tableSpanMethod" width="100%">
            <el-table-column label="服务商" align="center" prop="provider" width="100">
                <template #default="scope">
                    <strong>{{ scope.row.label.split("|")[0] }}</strong>
                </template>
            </el-table-column>
            <el-table-column label="模型" align="center" prop="modelName">
                <template #default="scope">
                    <el-button link size="large" @click="handleSelect(scope.row.value)" :disabled="scope.row.value === currentModel">
                        {{ scope.row.label.split("|")[1] }}
                    </el-button>
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
</style>