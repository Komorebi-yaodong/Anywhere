<script setup>
import { ref, h, onMounted, onBeforeUnmount, nextTick, watch, computed } from 'vue';
import { Attachments } from 'ant-design-x-vue';
// [修改] 引入 ElScrollbar
import { ElFooter, ElRow, ElCol, ElButton, ElInput, ElMessage, ElTooltip, ElScrollbar, ElIcon } from 'element-plus';
import { Link, Delete, Promotion, Close, Microphone, Check, Headset } from '@element-plus/icons-vue';
import Recorder from 'recorder-core';
import 'recorder-core/src/extensions/waveview.js';
import 'recorder-core/src/engine/wav';

// --- Props and Emits ---
const prompt = defineModel('prompt');
const fileList = defineModel('fileList');
const props = defineProps({
    loading: Boolean,
    ctrlEnterToSend: Boolean,
    layout: { type: String, default: 'horizontal' },
    voiceList: { type: Array, default: () => [] },
    selectedVoice: { type: String, default: null },
});
const emit = defineEmits(['submit', 'cancel', 'clear-history', 'remove-file', 'upload', 'send-audio', 'update:selectedVoice']);

// --- Refs and State ---
const senderRef = ref(null);
const fileInputRef = ref(null);
const waveformCanvasContainer = ref(null);
const isDragging = ref(false);
const dragCounter = ref(0);
const isRecording = ref(false);
let recorder = null;

// [新增] 控制语音选择行是否可见
const isVoiceSelectorVisible = ref(false);

// --- Waveform Visualization State ---
let wave = null; 

// --- Event Handlers ---
const handleKeyDown = (event) => {
    if (props.loading || isRecording.value) { if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c')) { event.preventDefault(); } return; }
    if (props.ctrlEnterToSend) { if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); emit('submit'); } }
    else { if (!event.shiftKey && event.key === 'Enter') { event.preventDefault(); emit('submit'); } }
};
const onSubmit = () => { if (props.loading) return; emit('submit'); };
const onCancel = () => emit('cancel');
const onClearHistory = () => emit('clear-history');
const onRemoveFile = (index) => emit('remove-file', index);

// [修改] 切换语音选择行的可见性
const toggleVoiceSelector = () => {
    if (isRecording.value) return;
    isVoiceSelectorVisible.value = !isVoiceSelectorVisible.value;
};

// [修改] 处理语音选择并关闭选择行
const handleVoiceSelection = (value) => {
    emit('update:selectedVoice', value);
    isVoiceSelectorVisible.value = false;
};

// --- File Handling ---
const triggerFileUpload = () => fileInputRef.value?.click();
const handleFileChange = (event) => { const files = event.target.files; if (files.length) emit('upload', { file: files[0], fileList: Array.from(files) }); if (fileInputRef.value) fileInputRef.value.value = ''; };
const preventDefaults = (e) => e.preventDefault();
const handleDragEnter = (event) => { preventDefaults(event); dragCounter.value++; isDragging.value = true; };
const handleDragLeave = (event) => { preventDefaults(event); dragCounter.value--; if (dragCounter.value <= 0) { isDragging.value = false; dragCounter.value = 0; } };
const handleDrop = (event) => { preventDefaults(event); isDragging.value = false; dragCounter.value = 0; const files = event.dataTransfer.files; if (files && files.length > 0) { emit('upload', { file: files[0], fileList: Array.from(files) }); focus(); } };
const handlePasteEvent = (event) => { const clipboardData = event.clipboardData || window.clipboardData; if (!clipboardData) return; const items = Array.from(clipboardData.items).filter(item => item.kind === 'file'); if (items.length > 0) { preventDefaults(event); const files = items.map(item => item.getAsFile()); emit('upload', { file: files[0], fileList: files }); focus(); } };

// --- Audio Recording and Visualization Logic ---
const startRecording = () => {
    if (isRecording.value) return;
    isVoiceSelectorVisible.value = false; // 开始录音时关闭选择器
    Recorder.TrafficFree = true;
    recorder = Recorder({
        type: 'wav', sampleRate: 16000, bitRate: 16,
        onProcess: (buffers, powerLevel, bufferDuration, bufferSampleRate) => {
            if (wave) {
                wave.input(buffers[buffers.length - 1], powerLevel, bufferSampleRate);
            }
        }
    });

    recorder.open(() => {
        isRecording.value = true;
        nextTick(() => {
            if (waveformCanvasContainer.value) {
                wave = Recorder.WaveView({
                    elem: waveformCanvasContainer.value,
                    lineWidth: 3,
                });
            }
            recorder.start(); 
        });
    },
    (msg, isUserNotAllow) => { ElMessage.error((isUserNotAllow ? '用户拒绝了权限, ' : '') + '无法录音: ' + msg); recorder = null; });
};

const stopRecordingAndCleanup = () => {
    if (recorder) {
        recorder.close();
        recorder = null;
    }
    if (wave) {
        wave.elem.innerHTML = "";
        wave = null;
    }
    isRecording.value = false;
};

const handleCancelRecording = () => {
    if (!recorder) return;
    recorder.stop(() => { ElMessage.info('录音已取消'); }, (msg) => { ElMessage.error('停止失败: ' + msg); });
    stopRecordingAndCleanup();
};

const handleConfirmAndSendRecording = () => {
    if (!recorder) return;
    recorder.stop((blob) => {
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
        const audioFile = new File([blob], `audio-${timestamp}.wav`, { type: 'audio/wav' });
        emit('send-audio', audioFile);
        stopRecordingAndCleanup();
    }, (msg) => { ElMessage.error('录音失败: ' + msg); stopRecordingAndCleanup(); });
};

// --- Lifecycle & Focus ---
onMounted(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', preventDefaults);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('paste', handlePasteEvent);
});

onBeforeUnmount(() => {
    window.removeEventListener('dragenter', handleDragEnter);
    window.removeEventListener('dragleave', handleDragLeave);
    window.removeEventListener('dragover', preventDefaults);
    window.removeEventListener('drop', handleDrop);
    window.removeEventListener('paste', handlePasteEvent);
    if (recorder) { recorder.close(); }
    if (wave) { wave.elem.innerHTML = ""; wave = null; }
});
const focus = (focusType = 'end') => { senderRef.value?.focus(); if (focusType === 'end' && senderRef.value?.$refs.textarea) { const ta = senderRef.value.$refs.textarea; ta.setSelectionRange(ta.value.length, ta.value.length); } };
defineExpose({ focus });
</script>

<template>
    <div v-if="isDragging" class="drag-overlay">
        <div class="drag-overlay-content">
            拖拽文件到此处以上传
        </div>
    </div>

    <el-footer class="input-footer">
        <el-row v-if="fileList.length > 0 && !isRecording">
            <el-col :span="1" />
            <el-col :span="22">
                <div class="file-card-container">
                    <Attachments.FileCard v-for="(file, index) in fileList" :key="index" :item="file"
                        v-on:remove="() => onRemoveFile(index)" :style="{ 'display': 'flex', 'float': 'left' }" />
                </div>
            </el-col>
            <el-col :span="1" />
        </el-row>
        
        <el-row v-show="isRecording" class="waveform-row">
             <el-col :span="1" />
             <el-col :span="22">
                <div ref="waveformCanvasContainer" class="waveform-display-area"> 
                </div>
             </el-col>
             <el-col :span="1" />
        </el-row>

        <!-- [修改] 语音选择行 -->
        <el-row v-if="isVoiceSelectorVisible" class="voice-selector-row">
            <el-col :span="1" />
            <el-col :span="22">
                <!-- [新增] 新的包裹容器，用于对齐样式 -->
                <div class="voice-selector-wrapper">
                    <el-scrollbar>
                        <div class="voice-selector-content">
                            <el-button 
                                @click="handleVoiceSelection(null)" 
                                :type="!selectedVoice ? 'primary' : 'default'" 
                                round
                            >
                                关闭语音
                            </el-button>
                            <el-button 
                                v-for="voice in props.voiceList" 
                                :key="voice" 
                                @click="handleVoiceSelection(voice)" 
                                :type="selectedVoice === voice ? 'primary' : 'default'" 
                                round
                            >
                                {{ voice }}
                            </el-button>
                        </div>
                    </el-scrollbar>
                </div>
            </el-col>
            <el-col :span="1" />
        </el-row>

        <el-row>
            <el-col :span="1" />
            <el-col :span="22">
                <!-- Horizontal Layout -->
                <div v-if="layout === 'horizontal'" class="chat-input-area-horizontal">
                    <div class="action-buttons-left">
                        <el-tooltip content="清除聊天记录"><el-button :icon="Delete" size="default" @click="onClearHistory" circle :disabled="isRecording"/></el-tooltip>
                        <el-tooltip content="添加附件"><el-button :icon="Link" size="default" @click="triggerFileUpload" circle :disabled="isRecording"/></el-tooltip>
                        
                        <el-tooltip content="语音回复设置">
                            <el-button 
                                :icon="Headset" 
                                size="default" 
                                circle 
                                :disabled="isRecording"
                                :type="selectedVoice ? 'primary' : ''"
                                :class="{ 'is-pulsing': selectedVoice }"
                                @click="toggleVoiceSelector"
                            />
                        </el-tooltip>
                    </div>
                    
                    <div class="input-wrapper">
                        <el-input v-if="!isRecording" ref="senderRef" class="chat-textarea-horizontal" v-model="prompt" type="textarea"
                            placeholder="输入、粘贴、拖拽以发送内容" 
                            :autosize="{ minRows: 1, maxRows: 5 }" 
                            resize="none"
                            @keydown="handleKeyDown" />
                    </div>

                    <div class="action-buttons-right">
                        <template v-if="isRecording">
                            <el-tooltip content="取消录音"><el-button :icon="Close" size="default" @click="handleCancelRecording" circle /></el-tooltip>
                            <el-tooltip content="结束并发送"><el-button :icon="Check" size="default" @click="handleConfirmAndSendRecording" circle /></el-tooltip>
                        </template>
                        <template v-else>
                            <el-tooltip content="发送语音"><el-button :icon="Microphone" size="default" @click="startRecording" circle /></el-tooltip>
                            <el-tooltip content="发送"><el-button v-if="!loading" :icon="Promotion" @click="onSubmit" circle :disabled="loading" /><el-button v-else :icon="Close" @click="onCancel" circle></el-button></el-tooltip>
                        </template>
                    </div>
                </div>

                <!-- Vertical Layout -->
                <div v-else class="chat-input-area-vertical">
                     <div class="input-wrapper">
                        <el-input v-if="!isRecording" ref="senderRef" class="chat-textarea-vertical" v-model="prompt" type="textarea"
                            placeholder="输入、粘贴、拖拽以发送内容"
                            :autosize="{ minRows: 1, maxRows: 5 }" 
                            resize="none"
                            @keydown="handleKeyDown" />
                     </div>
                    <div class="input-actions-bar">
                        <div class="action-buttons-left">
                           <el-tooltip content="清除聊天记录"><el-button :icon="Delete" size="default" @click="onClearHistory" circle :disabled="isRecording"/></el-tooltip>
                           <el-tooltip content="添加附件"><el-button :icon="Link" size="default" @click="triggerFileUpload" circle :disabled="isRecording"/></el-tooltip>
                           
                           <el-tooltip content="语音回复设置">
                               <el-button 
                                    :icon="Headset" 
                                    size="default" 
                                    circle 
                                    :disabled="isRecording"
                                    :type="selectedVoice ? 'primary' : ''"
                                    :class="{ 'is-pulsing': selectedVoice }"
                                    @click="toggleVoiceSelector"
                                />
                            </el-tooltip>
                        </div>
                        <div class="action-buttons-right">
                           <template v-if="isRecording">
                                <el-tooltip content="取消录音"><el-button :icon="Close" size="default" @click="handleCancelRecording" circle /></el-tooltip>
                                <el-tooltip content="结束并发送"><el-button :icon="Check" size="default" @click="handleConfirmAndSendRecording" circle /></el-tooltip>
                           </template>
                           <template v-else>
                                <el-tooltip content="发送语音"><el-button :icon="Microphone" size="default" @click="startRecording" circle /></el-tooltip>
                               <el-tooltip content="发送"><el-button v-if="!loading" :icon="Promotion" @click="onSubmit" circle :disabled="loading" /><el-button v-else :icon="Close" @click="onCancel" circle></el-button></el-tooltip>
                           </template>
                        </div>
                    </div>
                </div>

                <input ref="fileInputRef" type="file" multiple @change="handleFileChange" style="display: none;" />
            </el-col>
            <el-col :span="1" />
        </el-row>
    </el-footer>
</template>

<style scoped>
/* Base Styles */
.drag-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(90, 90, 90, 0.3); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); z-index: 9999; display: flex; justify-content: center; align-items: center; pointer-events: none; }
html.dark .drag-overlay { background-color: rgba(20, 20, 20, 0.4); }
.drag-overlay-content { color: white; font-size: 20px; font-weight: bold; padding: 20px 40px; border: 2px dashed white; border-radius: 12px; background-color: rgba(0, 0, 0, 0.2); }
.input-footer { padding: 10px 15px 15px 15px; height: auto; width: 100%; flex-shrink: 0; background-color: var(--el-bg-color); z-index: 10; }
.file-card-container { margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 8px; }
.file-card-container :deep(.ant-attachments-file-card-item-image) { width: 56px; height: 56px; }
.file-card-container :deep(.ant-image-img) { object-fit: cover; }

/* Waveform Display Area Styles */
.waveform-row {
    margin-bottom: 8px;
    transition: all 0.3s ease;
}
.waveform-display-area {
    width: 100%;
    height: 40px;
    background-color: #F3F4F6;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-sizing: border-box;
    overflow: hidden;
}
html.dark .waveform-display-area { background-color: #404045; }

/* [修改] Voice Selector Styles */
.voice-selector-row {
    margin-bottom: 8px;
}
.voice-selector-wrapper {
    background-color: #F3F4F6;
    border-radius: 12px;
    padding: 6px 8px; /* 关键：与输入框的 padding 一致 */
}
html.dark .voice-selector-wrapper {
    background-color: #404045;
}
.voice-selector-content {
    display: flex;
    gap: 8px;
    white-space: nowrap; /* 确保内容不换行，以触发滚动条 */
}
.voice-selector-content .el-button {
    flex-shrink: 0;
}
.voice-selector-wrapper :deep(.el-scrollbar__bar.is-horizontal) {
    height: 4px;
}
.voice-selector-wrapper :deep(.el-scrollbar__view) {
    padding-bottom: 4px; /* 为滚动条留出空间 */
}


.input-wrapper {
    position: relative;
    flex-grow: 1;
    display: flex;
}

/* Horizontal Layout */
.chat-input-area-horizontal { display: flex; align-items: center; background-color: #F3F4F6; border-radius: 12px; padding: 6px 8px; }
html.dark .chat-input-area-horizontal { background-color: #404045; }
.chat-textarea-horizontal { flex-grow: 1; }
.chat-textarea-horizontal:deep(.el-textarea__inner) { background-color: transparent; box-shadow: none !important; border: none !important; padding: 5px 0; color: var(--el-text-color-primary); font-size: 14px; line-height: 1.5; resize: none; }
.chat-input-area-horizontal .action-buttons-left, .chat-input-area-horizontal .action-buttons-right { display: flex; align-items: center; flex-shrink: 0; gap: 4px; }
.chat-input-area-horizontal .action-buttons-left { margin-right: 8px; }
.chat-input-area-horizontal .action-buttons-right { margin-left: 8px; }
.chat-input-area-horizontal .el-button { width: 32px; height: 32px; }

/* Vertical Layout */
.chat-input-area-vertical { display: flex; flex-direction: column; background-color: #F3F4F6; border-radius: 12px; padding: 10px 12px; }
html.dark .chat-input-area-vertical { background-color: #404045; }
.chat-textarea-vertical { width: 100%; flex-grow: 1; }
.chat-textarea-vertical:deep(.el-textarea__inner) { background-color: transparent; box-shadow: none !important; border: none !important; padding: 0; color: var(--el-text-color-primary); font-size: 14px; line-height: 1.5; resize: none; }
.input-actions-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; flex-shrink: 0; }
.chat-input-area-vertical .action-buttons-left, .chat-input-area-vertical .action-buttons-right { display: flex; align-items: center; gap: 4px; }
.chat-input-area-vertical .action-buttons-left { margin-left: -6px; }
.chat-input-area-vertical .action-buttons-right { margin-right: -6px; }
.chat-input-area-vertical .el-button { width: 32px; height: 32px; background: none; border: none; }
.chat-input-area-vertical .el-button:hover { background-color: rgba(0, 0, 0, 0.05); }
html.dark .chat-input-area-vertical .el-button:hover { background-color: rgba(255, 255, 255, 0.1); }

/* Common Styles */
:deep(.el-textarea.is-disabled .el-textarea__inner) {
    cursor: default !important;
    background-color: transparent !important;
}
:deep(.el-textarea__inner::-webkit-scrollbar) { width: 8px; height: 8px; }
:deep(.el-textarea__inner::-webkit-scrollbar-track) { background: transparent; border-radius: 4px; }
:deep(.el-textarea__inner::-webkit-scrollbar-thumb) { background: var(--el-text-color-disabled, #c0c4cc); border-radius: 4px; border: 2px solid transparent; background-clip: content-box; }
:deep(.el-textarea__inner::-webkit-scrollbar-thumb:hover) { background: var(--el-text-color-secondary, #909399); background-clip: content-box; }
html.dark :deep(.el-textarea__inner::-webkit-scrollbar-thumb) { background: #6b6b6b; background-clip: content-box; }
html.dark :deep(.el-textarea__inner::-webkit-scrollbar-thumb:hover) { background: #999; background-clip: content-box; }


/* --- FINAL UI FIX for Buttons --- */
.el-button.is-circle {
    color: var(--el-text-color-regular);
}
.el-button.is-circle:hover, .el-button.is-circle:focus {
    color: var(--el-color-primary);
    background-color: var(--el-color-primary-light-9);
}
.el-button.is-circle[type="primary"] {
    background-color: var(--el-color-primary);
    color: #ffffff;
}
.el-button.is-circle[type="primary"]:hover, .el-button.is-circle[type="primary"]:focus {
    background-color: var(--el-color-primary-light-3);
}

/* Pulsing glow animation */
@keyframes pulse-glow {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--el-color-primary-rgb), 0.4);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(var(--el-color-primary-rgb), 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(var(--el-color-primary-rgb), 0);
  }
}

.el-button.is-pulsing {
  animation: pulse-glow 2s infinite;
}

html.dark .el-button--danger.is-plain {
    color: #ffffff;
    background-color: var(--el-color-danger);
    border-color: var(--el-color-danger);
}
html.dark .el-button--danger.is-plain:hover, 
html.dark .el-button--danger.is-plain:focus {
    background-color: var(--el-color-danger-light-3);
    border-color: var(--el-color-danger-light-3);
    color: #ffffff;
}

html.dark .el-button--success.is-plain {
    color: #ffffff;
    background-color: var(--el-color-success);
    border-color: var(--el-color-success);
}
html.dark .el-button--success.is-plain:hover, 
html.dark .el-button--success.is-plain:focus {
    background-color: var(--el-color-success-light-3);
    border-color: var(--el-color-success-light-3);
    color: #ffffff;
}
</style>