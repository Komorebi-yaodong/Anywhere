<script setup>
import { ref, h, onMounted, onBeforeUnmount, nextTick, watch, computed } from 'vue';
import { Attachments } from 'ant-design-x-vue';
import { ElFooter, ElRow, ElCol, ElText, ElDivider, ElButton, ElInput, ElMessage, ElTooltip, ElScrollbar, ElIcon } from 'element-plus';
import { Link, Delete, Promotion, Close, Microphone, Check } from '@element-plus/icons-vue';
// [恢复] 重新引入 recorder-core 以实现声波
import Recorder from 'recorder-core';
import 'recorder-core/src/extensions/waveview.js';
import 'recorder-core/src/engine/wav';

// --- Props and Emits ---
const prompt = defineModel('prompt');
const fileList = defineModel('fileList');
const selectedVoice = defineModel('selectedVoice');
const tempReasoningEffort = defineModel('tempReasoningEffort');

const props = defineProps({
    loading: Boolean,
    ctrlEnterToSend: Boolean,
    voiceList: { type: Array, default: () => [] },
    layout: { type: String, default: 'horizontal' }
});
const emit = defineEmits(['submit', 'cancel', 'clear-history', 'remove-file', 'upload', 'send-audio']);

// --- Refs and State ---
const senderRef = ref(null);
const fileInputRef = ref(null);
const waveformCanvasContainer = ref(null);
const isDragging = ref(false);
const dragCounter = ref(0);
const isRecording = ref(false);

// [修改] 同时管理两种录音器状态
let recorder = null; // for recorder-core (microphone with waveform)
let wave = null;
let mediaRecorder = null; // for MediaRecorder (system audio)
let audioChunks = [];
let audioStream = null;
const currentRecordingSource = ref(null); // 'microphone' or 'system'
const isCancelledByButton = ref(false); // [新增] 修复取消Bug的关键

const isAudioSourceSelectorVisible = ref(false);
const isReasoningSelectorVisible = ref(false);
const isVoiceSelectorVisible = ref(false);


// --- Computed Properties ---
const reasoningButtonType = computed(() => {
    return tempReasoningEffort.value && tempReasoningEffort.value !== 'default' ? 'primary' : '';
});

const reasoningTooltipContent = computed(() => {
    const map = { default: '默认', low: '低', medium: '中', high: '高' };
    return `思考预算: ${map[tempReasoningEffort.value] || '默认'}`;
});

// --- Helper function to manually insert a newline ---
const insertNewline = () => {
    const textarea = senderRef.value?.$refs.textarea;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = prompt.value;

    prompt.value = value.substring(0, start) + '\n' + value.substring(end);

    nextTick(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
        textarea.focus();
    });
};


// --- Event Handlers ---
const handleKeyDown = (event) => {
    if (event.isComposing) {
        return;
    }

    if (isRecording.value) {
        if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c')) {
            event.preventDefault();
        }
        return;
    }

    if (event.key !== 'Enter') {
        return;
    }

    const isCtrlOrMetaPressed = event.ctrlKey || event.metaKey;

    if (!props.ctrlEnterToSend) {
        if (isCtrlOrMetaPressed) {
            event.preventDefault();
            insertNewline();
        } else if (!event.shiftKey) {
            event.preventDefault();
            if (!props.loading) {
                emit('submit');
            }
        }
    }
    else {
        if (isCtrlOrMetaPressed) {
            event.preventDefault();
            if (!props.loading) {
                emit('submit');
            }
        }
    }
};
const onSubmit = () => { if (props.loading) return; emit('submit'); };
const onCancel = () => emit('cancel');
const onClearHistory = () => emit('clear-history');
const onRemoveFile = (index) => emit('remove-file', index);

const toggleReasoningSelector = () => {
    if (isRecording.value) return;
    isReasoningSelectorVisible.value = !isReasoningSelectorVisible.value;
    if (isReasoningSelectorVisible.value) {
        isVoiceSelectorVisible.value = false;
        isAudioSourceSelectorVisible.value = false;
    }
};

const handleReasoningSelection = (effort) => {
    tempReasoningEffort.value = effort;
    isReasoningSelectorVisible.value = false;
};

const toggleVoiceSelector = () => {
    if (isRecording.value) return;
    isVoiceSelectorVisible.value = !isVoiceSelectorVisible.value;
    if (isVoiceSelectorVisible.value) {
        isReasoningSelectorVisible.value = false;
        isAudioSourceSelectorVisible.value = false;
    }
};

const handleVoiceSelection = (value) => {
    selectedVoice.value = value;
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

// --- [重构] Audio Recording Logic ---

const toggleAudioSourceSelector = () => {
    if (isRecording.value) return;
    isAudioSourceSelectorVisible.value = !isAudioSourceSelectorVisible.value;
    if (isAudioSourceSelectorVisible.value) {
        isVoiceSelectorVisible.value = false;
        isReasoningSelectorVisible.value = false;
    }
}

const startRecordingFromSource = async (sourceType) => {
    isAudioSourceSelectorVisible.value = false;
    if (isRecording.value) return;

    // [修改] 1. 立即更新UI
    isRecording.value = true;
    currentRecordingSource.value = sourceType;
    isCancelledByButton.value = false;

    try {
        if (sourceType === 'microphone') {
            // [修改] 2. 异步准备录音
            await new Promise((resolve, reject) => {
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
                    nextTick(() => {
                        if (waveformCanvasContainer.value) {
                            wave = Recorder.WaveView({ elem: waveformCanvasContainer.value, lineWidth: 3 });
                        }
                        recorder.start();
                        resolve();
                    });
                }, (msg, isUserNotAllow) => {
                    const errorMsg = (isUserNotAllow ? '用户拒绝了权限, ' : '') + '无法录音: ' + msg;
                    ElMessage.error(errorMsg);
                    recorder = null;
                    reject(new Error(errorMsg));
                });
            });
        } else if (sourceType === 'system') {
            // [修改] 2. 异步准备录音
            const sources = await window.api.desktopCaptureSources({ types: ['screen', 'window'] });
            if (!sources || sources.length === 0) {
                throw new Error('未找到可用的系统音频源');
            }
            audioStream = await navigator.mediaDevices.getUserMedia({
                audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id } },
                video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id } },
            });

            audioChunks = [];
            mediaRecorder = new MediaRecorder(audioStream);

            mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
            mediaRecorder.onstop = () => {
                if (isCancelledByButton.value) {
                    stopRecordingAndCleanup();
                    return;
                }
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const now = new Date();
                const timestamp = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
                const audioFile = new File([audioBlob], `audio-${timestamp}.wav`, { type: 'audio/wav' });
                emit('send-audio', audioFile);
                stopRecordingAndCleanup();
            };

            mediaRecorder.start();
        }
    } catch (err) {
        // [修改] 3. 如果准备失败，恢复UI状态
        console.error("录音启动失败:", err);
        ElMessage.error(err.message || '无法开始录音');
        stopRecordingAndCleanup(); // This will set isRecording to false
    }
};

const stopRecordingAndCleanup = () => {
    if (recorder) {
        recorder.close();
        recorder = null;
    }
    if (wave) {
        if (waveformCanvasContainer.value) waveformCanvasContainer.value.innerHTML = "";
        wave = null;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
    }
    mediaRecorder = null;
    audioStream = null;
    audioChunks = [];
    isRecording.value = false;
    currentRecordingSource.value = null;
};

const handleCancelRecording = () => {
    isCancelledByButton.value = true;
    ElMessage.info('录音已取消');
    
    if (currentRecordingSource.value === 'microphone' && recorder) {
        recorder.stop(() => {
            stopRecordingAndCleanup();
        }, () => {
            stopRecordingAndCleanup();
        });
    } else if (currentRecordingSource.value === 'system' && mediaRecorder) {
        // onstop will handle cleanup because of the flag
        mediaRecorder.stop();
    }
};

const handleConfirmAndSendRecording = () => {
    isCancelledByButton.value = false;

    if (currentRecordingSource.value === 'microphone' && recorder) {
        recorder.stop((blob) => {
            if (isCancelledByButton.value) {
                 stopRecordingAndCleanup();
                 return;
            }
            const now = new Date();
            const timestamp = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
            const audioFile = new File([blob], `audio-${timestamp}.wav`, { type: 'audio/wav' });
            emit('send-audio', audioFile);
            stopRecordingAndCleanup();
        }, (msg) => {
            ElMessage.error('录音失败: ' + msg);
            stopRecordingAndCleanup();
        });
    } else if (currentRecordingSource.value === 'system' && mediaRecorder) {
        // onstop will handle sending because flag is false
        mediaRecorder.stop();
    }
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
    stopRecordingAndCleanup();
});

const focus = (options = {}) => {
    const textarea = senderRef.value?.$refs.textarea;
    if (!textarea) return;

    textarea.focus();

    nextTick(() => {
        if (options.position && typeof options.position.start === 'number') {
            const textLength = prompt.value?.length || 0;
            const start = Math.min(options.position.start, textLength);
            const end = Math.min(options.position.end, textLength);
            textarea.setSelectionRange(start, end);
        } else if (options.cursor === 'end') {
            const textLength = prompt.value?.length || 0;
            textarea.setSelectionRange(textLength, textLength);
        }
    });
};

defineExpose({ focus, senderRef });
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
                <div class="waveform-display-area">
                    <!-- [MODIFIED] Conditionally render waveform or text -->
                    <div v-if="currentRecordingSource === 'microphone'" ref="waveformCanvasContainer" class="waveform-canvas"></div>
                    <span v-else class="recording-status-text">正在录制系统音频...</span>
                </div>
            </el-col>
            <el-col :span="1" />
        </el-row>
        
        <!-- [MODIFIED] Redesigned Audio Source Selector -->
        <el-row v-if="isAudioSourceSelectorVisible" class="option-selector-row">
            <el-col :span="1" />
            <el-col :span="22">
                <div class="option-selector-wrapper">
                    <div class="option-selector-content">
                        <el-text tag="b" class="selector-label">选择音源</el-text>
                        <el-divider direction="vertical" />
                        <el-button @click="startRecordingFromSource('microphone')" round>🎙️ 麦克风</el-button>
                        <el-button @click="startRecordingFromSource('system')" round>💻 系统音频</el-button>
                    </div>
                </div>
            </el-col>
            <el-col :span="1" />
        </el-row>


        <el-row v-if="isReasoningSelectorVisible" class="option-selector-row">
            <el-col :span="1" />
            <el-col :span="22">
                <div class="option-selector-wrapper">
                    <div class="option-selector-content">
                        <el-text tag="b" class="selector-label">思考预算</el-text>
                        <el-divider direction="vertical" />
                        <el-button @click="handleReasoningSelection('default')"
                            :type="tempReasoningEffort === 'default' ? 'primary' : 'default'" round>默认</el-button>
                        <el-button @click="handleReasoningSelection('low')"
                            :type="tempReasoningEffort === 'low' ? 'primary' : 'default'" round>快速</el-button>
                        <el-button @click="handleReasoningSelection('medium')"
                            :type="tempReasoningEffort === 'medium' ? 'primary' : 'default'" round>均衡</el-button>
                        <el-button @click="handleReasoningSelection('high')"
                            :type="tempReasoningEffort === 'high' ? 'primary' : 'default'" round>深入</el-button>
                    </div>
                </div>
            </el-col>
            <el-col :span="1" />
        </el-row>

        <el-row v-if="isVoiceSelectorVisible" class="option-selector-row">
            <el-col :span="1" />
            <el-col :span="22">
                <el-scrollbar class="option-selector-wrapper">
                    <div class="option-selector-content">
                        <el-text tag="b" class="selector-label">选择音色</el-text>
                        <el-divider direction="vertical" />
                        <el-button @click="handleVoiceSelection(null)" :type="!selectedVoice ? 'primary' : 'default'"
                            round>
                            关闭语音
                        </el-button>
                        <el-button v-for="voice in props.voiceList" :key="voice" @click="handleVoiceSelection(voice)"
                            :type="selectedVoice === voice ? 'primary' : 'default'" round>
                            {{ voice }}
                        </el-button>
                    </div>
                </el-scrollbar>
            </el-col>
            <el-col :span="1" />
        </el-row>

        <el-row>
            <el-col :span="1" />
            <el-col :span="22">
                <div class="chat-input-area-vertical">
                    <div class="input-wrapper">
                        <el-input ref="senderRef" class="chat-textarea-vertical" v-model="prompt"
                            type="textarea" 
                            :placeholder="isRecording ? '录音中... 结束后将连同文本一起发送' : '输入、粘贴、拖拽以发送内容'"
                            :autosize="{ minRows: 1, maxRows: 5 }"
                            resize="none" 
                            @keydown="handleKeyDown"
                            :disabled="isRecording" />
                    </div>
                    <div class="input-actions-bar">
                        <div class="action-buttons-left">
                            <el-tooltip content="清除聊天记录"><el-button :icon="Delete" size="default"
                                    @click="onClearHistory" circle :disabled="isRecording" /></el-tooltip>
                            <el-tooltip content="添加附件"><el-button :icon="Link" size="default" @click="triggerFileUpload"
                                    circle :disabled="isRecording" /></el-tooltip>

                            <el-tooltip :content="reasoningTooltipContent">
                                <el-button :type="reasoningButtonType" size="default" circle :disabled="isRecording"
                                    @click="toggleReasoningSelector">
                                    <el-icon :size="18">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                            <path fill="currentColor"
                                                d="M1 11h3v2H1zm18.1-7.5L17 5.6L18.4 7l2.1-2.1zM11 1h2v3h-2zM4.9 3.5L3.5 4.9L5.6 7L7 5.6zM10 22c0 .6.4 1 1 1h2c.6 0 1-.4 1-1v-1h-4zm2-16c-3.3 0-6 2.7-6 6c0 2.2 1.2 4.2 3 5.2V19c0 .6.4 1 1 1h4c.6 0 1-.4 1-1v-1.8c1.8-1 3-3 3-5.2c0-3.3-2.7-6-6-6m1 9.9V17h-2v-1.1c-1.7-.4-3-2-3-3.9c0-2.2 1.8-4 4-4s4 1.8 4 4c0 1.9-1.3 3.4-3 3.9m7-4.9h3v2h-3z">
                                            </path>
                                        </svg>
                                    </el-icon>
                                </el-button>
                            </el-tooltip>

                            <el-tooltip content="语音回复设置">
                                <el-button size="default" circle :disabled="isRecording"
                                    :type="selectedVoice ? 'primary' : ''" :class="{ 'is-pulsing': selectedVoice }"
                                    @click="toggleVoiceSelector"><el-icon :size="18">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                                            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                            stroke-linecap="round" stroke-linejoin="round">
                                            <path
                                                d="M2 14c2.5-4.5 7-6 10-4c3-2 7.5-0.5 10 4c-2.5 4.5-7 6-10 4c-3 2-7.5 0.5-10-4z" />
                                            <path d="M2 14h20" />
                                        </svg>
                                    </el-icon></el-button>
                            </el-tooltip>
                        </div>
                        <div class="action-buttons-right">
                            <template v-if="isRecording">
                                <el-tooltip content="取消录音"><el-button :icon="Close" size="default"
                                        @click="handleCancelRecording" circle /></el-tooltip>
                                <el-tooltip content="结束并发送"><el-button :icon="Check" size="default"
                                        @click="handleConfirmAndSendRecording" circle /></el-tooltip>
                            </template>
                            <template v-else>
                                <el-tooltip content="发送语音"><el-button :icon="Microphone" size="default"
                                        @click="toggleAudioSourceSelector" circle /></el-tooltip>
                                <el-button v-if="!loading" :icon="Promotion" @click="onSubmit" circle
                                    :disabled="loading" /><el-button v-else :icon="Close" @click="onCancel"
                                    circle></el-button>
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
.drag-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(90, 90, 90, 0.3);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    z-index: 9999;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none;
}

html.dark .drag-overlay {
    background-color: rgba(20, 20, 20, 0.4);
}

.drag-overlay-content {
    color: white;
    font-size: 20px;
    font-weight: bold;
    padding: 20px 40px;
    border: 2px dashed white;
    border-radius: 12px;
    background-color: rgba(0, 0, 0, 0.2);
}

.input-footer {
    padding: 10px 15px 15px 15px;
    height: auto;
    width: 100%;
    flex-shrink: 0;
    background-color: var(--el-bg-color);
    z-index: 10;
}

.file-card-container {
    margin-bottom: 8px;
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 8px;
    padding-top: 8px;
    max-height: 70px;
}

/* [ADDED] 美化文件预览容器的滚动条 */
.file-card-container::-webkit-scrollbar {
    height: 6px;
}

.file-card-container::-webkit-scrollbar-track {
    background: transparent;
}

.file-card-container::-webkit-scrollbar-thumb {
    background-color: var(--el-border-color);
    border-radius: 3px;
}

.file-card-container::-webkit-scrollbar-thumb:hover {
    background-color: var(--el-text-color-secondary);
}


.file-card-container :deep(.ant-attachments-file-card-item-image) {
    width: 56px;
    height: 56px;
}

.file-card-container :deep(.ant-image-img) {
    object-fit: cover;
}

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

.waveform-canvas {
    width: 100%;
    height: 100%;
}

.recording-status-text {
    color: var(--el-text-color-secondary);
    font-size: 14px;
    animation: pulse-text 1.5s infinite ease-in-out;
}

@keyframes pulse-text {
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
}

html.dark .waveform-display-area {
    background-color: #1F1F1F;
}

/* MODIFIED: Universal Option Selector Styles */
.option-selector-row {
    margin-bottom: 8px;
}

.option-selector-wrapper {
    background-color: #F3F4F6;
    border-radius: 12px;
    padding: 8px;
    max-height: 132px;
}

html.dark .option-selector-wrapper {
    background-color: #1F1F1F;
}

.option-selector-content {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center; /* Vertically align items */
}

.option-selector-content .el-button {
    flex-shrink: 0;
}

.option-selector-wrapper :deep(.el-scrollbar__view) {
    padding-right: 8px;
}

/* [新增] 新的选择器标签和分隔线样式 */
.selector-label {
    font-size: 14px;
    color: var(--el-text-color);
    margin: 0 4px 0 8px; /* Added left margin */
    white-space: nowrap;
}

.el-divider--vertical {
    height: 1.2em;
    border-left: 1px solid var(--el-border-color-lighter);
    margin: 0 4px; /* Space around divider */
}

html.dark .el-divider--vertical {
    border-left-color: var(--el-border-color);
}

.input-wrapper {
    position: relative;
    flex-grow: 1;
    display: flex;
}

/* Vertical Layout */
.chat-input-area-vertical {
    display: flex;
    flex-direction: column;
    background-color: #F3F4F6;
    border-radius: 12px;
    padding: 10px 12px;
}

html.dark .chat-input-area-vertical {
    background-color: #1F1F1F;
}

.chat-textarea-vertical {
    width: 100%;
    flex-grow: 1;
}

.chat-textarea-vertical:deep(.el-textarea__inner) {
    background-color: transparent;
    box-shadow: none !important;
    border: none !important;
    padding: 0;
    color: var(--el-text-color-primary);
    font-size: 14px;
    line-height: 1.5;
    resize: none;
}

.input-actions-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    flex-shrink: 0;
}

.chat-input-area-vertical .action-buttons-left,
.chat-input-area-vertical .action-buttons-right {
    display: flex;
    align-items: center;
    gap: 4px;
}

.chat-input-area-vertical .action-buttons-left {
    margin-left: -6px;
}

.chat-input-area-vertical .action-buttons-right {
    margin-right: -6px;
}

.chat-input-area-vertical .el-button {
    width: 32px;
    height: 32px;
    background: none;
    border: none;
}

.chat-input-area-vertical .el-button:hover {
    background-color: rgba(0, 0, 0, 0.05);
}

html.dark .chat-input-area-vertical .el-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

/* Common Styles */
:deep(.el-textarea.is-disabled .el-textarea__inner) {
    cursor: default !important;
    background-color: transparent !important;
}

:deep(.el-textarea__inner::-webkit-scrollbar) {
    width: 8px;
    height: 8px;
}

:deep(.el-textarea__inner::-webkit-scrollbar-track) {
    background: transparent;
    border-radius: 4px;
}

:deep(.el-textarea__inner::-webkit-scrollbar-thumb) {
    background: var(--el-text-color-disabled, #c0c4cc);
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: content-box;
}

:deep(.el-textarea__inner::-webkit-scrollbar-thumb:hover) {
    background: var(--el-text-color-secondary, #909399);
    background-clip: content-box;
}

html.dark :deep(.el-textarea__inner::-webkit-scrollbar-thumb) {
    background: #6b6b6b;
    background-clip: content-box;
}

html.dark :deep(.el-textarea__inner::-webkit-scrollbar-thumb:hover) {
    background: #999;
    background-clip: content-box;
}

/* --- FINAL UI FIX for Buttons --- */
.el-button.is-circle {
    color: var(--el-text-color-regular);
}

.el-button.is-circle:hover,
.el-button.is-circle:focus {
    color: var(--el-color-primary);
    background-color: var(--el-color-primary-light-9);
}

.el-button.is-circle[type="primary"] {
    background-color: var(--el-color-primary);
    color: #ffffff;
}

.el-button.is-circle[type="primary"]:hover,
.el-button.is-circle[type="primary"]:focus {
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