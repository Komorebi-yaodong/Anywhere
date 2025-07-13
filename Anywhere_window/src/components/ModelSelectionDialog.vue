<!-- ./Anywhere_window/src/components/ModelSelectionDialog.vue -->
<script setup>
import { ElDialog, ElTable, ElTableColumn, ElButton } from 'element-plus';

const props = defineProps({
    modelValue: Boolean, // for v-model
    modelList: Array,
    currentModel: String,
});

const emit = defineEmits(['update:modelValue', 'select']);

const tableSpanMethod = ({ row, column, rowIndex, columnIndex }) => {
    if (columnIndex === 0) {
        if (rowIndex > 0 && props.modelList[rowIndex - 1].label.split("|")[0] === row.label.split("|")[0]) {
            return { rowspan: 0, colspan: 0 };
        }
        let rowspan = 1;
        for (let i = rowIndex + 1; i < props.modelList.length; i++) {
            if (props.modelList[i].label.split("|")[0] === row.label.split("|")[0]) {
                rowspan++;
            } else {
                break;
            }
        }
        return { rowspan: rowspan, colspan: 1 };
    }
};

const handleClose = () => emit('update:modelValue', false);
const handleSelect = (modelValue) => emit('select', modelValue);

</script>

<template>
    <el-dialog title="选择模型" :model-value="modelValue" @update:model-value="handleClose" width="70%" custom-class="model-dialog">
        <el-table :data="modelList" stripe style="width: 100%; height: 400px;" :max-height="400" :border="true"
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

<style>
/* This dialog has no specific scoped styles, relies on global styles */
</style>