<script setup>
import { ref, h, computed } from 'vue';
import { Sender } from 'vue-element-plus-x';
import { Attachments } from 'ant-design-x-vue';
import { ElFooter, ElRow, ElCol, ElButton } from 'element-plus';
import { Link, Delete } from '@element-plus/icons-vue'

const prompt = defineModel('prompt');
const fileList = defineModel('fileList');

const props = defineProps({
    loading: Boolean,
    ctrlEnterToSend: Boolean,
});

const emit = defineEmits(['submit', 'cancel', 'clear-history', 'remove-file', 'upload', 'drop', 'paste']);

const senderRef = ref();

const attachmentsNode = computed(() => h(Attachments, {
    beforeUpload: () => false,
    onChange: (files) => emit('upload', files),
    children: h(ElButton, { type: 'default', icon: h(Link), circle: true }),
    getDropContainer: () => (document.body),
}));

const onSubmit = () => {
    // 只有在非加载状态下才允许提交
    if (props.loading) return;
    emit('submit');
};

const onCancel = () => emit('cancel');
const onClearHistory = () => emit('clear-history');
const onRemoveFile = (index) => emit('remove-file', index);
const onDrop = (event) => emit('drop', event);
const onPaste = (event) => emit('paste', event);

const focus = (focusType = 'end') => {
    senderRef.value?.focus(focusType);
};
defineExpose({ focus });
</script>

<template>
    <el-footer class="input-footer">
        <el-row>
            <el-col :span="1" />
            <el-col :span="22">
                <Attachments.FileCard v-if="fileList.length > 0" v-for="(file, index) in fileList" :key="index"
                    :item="file" v-on:remove="() => onRemoveFile(index)" :style="{ 'display': 'flex', 'float': 'left' }" />
            </el-col>
            <el-col :span="1" />
        </el-row>
        <el-row>
            <el-col :span="1" />
            <el-col :span="22">
                <!-- 还原到使用第三方 Sender 组件的初始状态 -->
                <Sender 
                    class="chat-sender" 
                    ref="senderRef" 
                    v-model="prompt" 
                    placeholder="在此输入，或拖拽会话文件以加载"
                    :loading="loading"
                    @submit="onSubmit" 
                    @cancel="onCancel"
                    :submit-type="ctrlEnterToSend ? 'shiftEnter' : 'enter'"
                    @keyup.ctrl.enter="ctrlEnterToSend ? onSubmit() : null"
                    @drop="onDrop" 
                    @paste="onPaste"
                    :submitBtnDisabled="false">
                    <template #prefix>
                        <el-button :icon="Delete" size="default" @click="onClearHistory" circle />
                        <component :is="attachmentsNode" />
                    </template>
                </Sender>
            </el-col>
            <el-col :span="1" />
        </el-row>
    </el-footer>
</template>

<style scoped>
.input-footer {
    padding: 10px 15px 15px 15px;
    height: auto;
    width: 100%;
    flex-shrink: 0;
    background-color: var(--el-bg-color);
    z-index: 10;
}

.input-footer .el-row,
.input-footer .el-row .el-col {
    padding: 0;
    margin: 0;
}

.input-footer .chat-sender :deep(.el-sender-content) {
    background-color: #F3F4F6;
    border-radius: 12px;
}

html.dark .input-footer .chat-sender :deep(.el-sender-content) {
    background-color: #404045;
    border-radius: 12px;
}
</style>