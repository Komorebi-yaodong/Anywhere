<script setup>
import { ref, h, onMounted, onBeforeUnmount, nextTick, watch, computed } from 'vue';
import { ElFooter, ElRow, ElCol, ElText, ElDivider, ElButton, ElInput, ElMessage, ElTooltip, ElScrollbar, ElIcon } from 'element-plus';
import { Close, Check, Document, Delete, Collection } from '@element-plus/icons-vue'; // 引入 Tools

// --- Props and Emits ---
const prompt = defineModel('prompt');
const fileList = defineModel('fileList');
const selectedVoice = defineModel('selectedVoice');
const tempReasoningEffort = defineModel('tempReasoningEffort');

const props = defineProps({
    loading: Boolean,
    ctrlEnterToSend: Boolean,
    voiceList: { type: Array, default: () => [] },
    layout: { type: String, default: 'horizontal' },
    isMcpActive: Boolean,
    allMcpServers: { type: Array, default: () => [] },
    activeMcpIds: { type: Array, default: () => [] },
    activeSkillIds: { type: Array, default: () => [] },
    allSkills: { type: Array, default: () => [] }
});

// 增加 toggle-mcp 事件
const emit = defineEmits(['submit', 'cancel', 'clear-history', 'remove-file', 'upload', 'send-audio', 'open-mcp-dialog', 'pick-file-start', 'toggle-mcp', 'toggle-skill', 'open-skill-dialog']);

// --- Refs and State ---
const senderRef = ref(null);
const fileInputRef = ref(null);
const waveformCanvasContainer = ref(null);
const isDragging = ref(false);
const dragCounter = ref(0);
const isRecording = ref(false);

// --- MCP Quick Select State ---
const showMcpQuickSelect = ref(false);
const mcpFilterKeyword = ref('');
const mcpHighlightIndex = ref(0);

// --- Skill Quick Select State ---
const showSkillQuickSelect = ref(false);
const skillFilterKeyword = ref('');
const skillHighlightIndex = ref(0);

// --- Refs for closing popups ---
const reasoningSelectorRef = ref(null);
const voiceSelectorRef = ref(null);
const audioSourceSelectorRef = ref(null);
const reasoningButtonRef = ref(null);
const voiceButtonRef = ref(null);
const audioButtonRef = ref(null);

let recorder = null;
let wave = null;
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
const currentRecordingSource = ref(null);
const isCancelledByButton = ref(false);

const isAudioSourceSelectorVisible = ref(false);
const isReasoningSelectorVisible = ref(false);
const isVoiceSelectorVisible = ref(false);
const internalVoiceList = ref(props.voiceList || []);
watch(() => props.voiceList, (newVal) => {
    internalVoiceList.value = newVal || [];
}, { immediate: true });

// --- Computed Properties ---
const reasoningTooltipContent = computed(() => {
    const map = { default: '默认', low: '低', medium: '中', high: '高' };
    return `思考预算: ${map[tempReasoningEffort.value] || '默认'}`;
});

// 过滤后的 MCP 列表逻辑
const filteredMcpList = computed(() => {
    if (!showMcpQuickSelect.value) return [];
    const keyword = mcpFilterKeyword.value.toLowerCase();

    let list = props.allMcpServers.filter(server => {
        // 1. 匹配名称 (包含匹配)
        const nameMatch = server.name && server.name.toLowerCase().includes(keyword);

        // 2. 匹配标签
        const tagMatch = server.tags && server.tags.some(tag => tag.toLowerCase().includes(keyword));

        // 3. 匹配类型 (原始类型 + 中文显示名)
        const typeRaw = (server.type || '').toLowerCase();
        let typeDisplay = '';

        // 简单的类型映射逻辑
        if (typeRaw === 'builtin') typeDisplay = '内置';
        else if (typeRaw === 'stdio') typeDisplay = 'stdio';
        else if (typeRaw === 'sse') typeDisplay = 'sse';
        else if (typeRaw.includes('http')) typeDisplay = '可流式 http';

        const typeMatch = typeRaw.includes(keyword) || typeDisplay.includes(keyword);

        return nameMatch || tagMatch || typeMatch;
    });

    // 限制显示 10 个
    return list.slice(0, 10);
});

// 过滤后的 Skill 列表逻辑
const filteredSkillList = computed(() => {
    if (!showSkillQuickSelect.value) return [];
    const keyword = skillFilterKeyword.value.toLowerCase();

    let list = props.allSkills.filter(skill => {
        return skill.name.toLowerCase().includes(keyword) ||
            (skill.description && skill.description.toLowerCase().includes(keyword));
    });

    return list.slice(0, 10);
});

// 监听 prompt 变化以触发快捷选择
watch(prompt, (newVal) => {
    // 处理 MCP (@) - 匹配行首或空格后的 @
    const mcpMatch = newVal.match(/(?:^|\s)@([^@\s]*)$/);
    if (mcpMatch) {
        mcpFilterKeyword.value = mcpMatch[1];
        showMcpQuickSelect.value = true;
        showSkillQuickSelect.value = false; // 互斥
        mcpHighlightIndex.value = 0;
        return;
    }

    // 处理 Skill (/) - 匹配行首或空格后的 /
    const skillMatch = newVal.match(/(?:^|\s)\/([^/\s]*)$/);
    if (skillMatch) {
        skillFilterKeyword.value = skillMatch[1];
        showSkillQuickSelect.value = true;
        showMcpQuickSelect.value = false; // 互斥
        skillHighlightIndex.value = 0;
        return;
    }

    // 都不匹配则关闭
    showMcpQuickSelect.value = false;
    showSkillQuickSelect.value = false;
});

// --- Helper function ---
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

const handleToggleSkill = (skillName) => {
    emit('toggle-skill', skillName);
    showSkillQuickSelect.value = false;
    prompt.value = prompt.value.replace(/(?:^|\s)\/([^/\s]*)$/, '').trimEnd();
};

const handleSkillTab = () => {
    const skill = filteredSkillList.value[skillHighlightIndex.value];
    if (skill) {
        prompt.value = prompt.value.replace(/(\/)([^/\s]*)$/, `$1${skill.name} `);
    }
};

// --- Event Handlers ---
const handleKeyDown = (event) => {
    if (event.isComposing) return;

    // [MCP 快捷选择键盘逻辑]
    if (showMcpQuickSelect.value && filteredMcpList.value.length > 0) {
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation();
            showMcpQuickSelect.value = false; return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            mcpHighlightIndex.value = (mcpHighlightIndex.value - 1 + filteredMcpList.value.length) % filteredMcpList.value.length;
            nextTick(() => { const activeItem = document.querySelector('.mcp-quick-item.highlighted'); if (activeItem) activeItem.scrollIntoView({ block: 'nearest' }); });
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            mcpHighlightIndex.value = (mcpHighlightIndex.value + 1) % filteredMcpList.value.length;
            nextTick(() => { const activeItem = document.querySelector('.mcp-quick-item.highlighted'); if (activeItem) activeItem.scrollIntoView({ block: 'nearest' }); });
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            const server = filteredMcpList.value[mcpHighlightIndex.value];
            if (server) handleToggleMcp(server.id);
            return;
        }
        if (/^[0-9]$/.test(event.key)) {
            event.preventDefault();
            const idx = parseInt(event.key);
            if (idx < filteredMcpList.value.length) handleToggleMcp(filteredMcpList.value[idx].id);
            return;
        }
    }

    // Skill 快捷选择键盘逻辑
    if (showSkillQuickSelect.value && filteredSkillList.value.length > 0) {
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation();
            showSkillQuickSelect.value = false; return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            skillHighlightIndex.value = (skillHighlightIndex.value - 1 + filteredSkillList.value.length) % filteredSkillList.value.length;
            nextTick(() => { const activeItem = document.querySelector('.skill-quick-item.highlighted'); if (activeItem) activeItem.scrollIntoView({ block: 'nearest' }); });
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            skillHighlightIndex.value = (skillHighlightIndex.value + 1) % filteredSkillList.value.length;
            nextTick(() => { const activeItem = document.querySelector('.skill-quick-item.highlighted'); if (activeItem) activeItem.scrollIntoView({ block: 'nearest' }); });
            return;
        }
        if (event.key === 'Tab') { // Tab 补全
            event.preventDefault();
            handleSkillTab();
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            const skill = filteredSkillList.value[skillHighlightIndex.value];
            if (skill) handleToggleSkill(skill.name);
            return;
        }
        if (/^[0-9]$/.test(event.key)) {
            event.preventDefault();
            const idx = parseInt(event.key);
            if (idx < filteredSkillList.value.length) handleToggleSkill(filteredSkillList.value[idx].name);
            return;
        }
    }

    // 原有的录音快捷键逻辑
    if (isRecording.value) {
        if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c')) {
            event.preventDefault();
        }
        return;
    }

    // 原有的回车发送逻辑
    if (event.key !== 'Enter') return;

    const isCtrlOrMetaPressed = event.ctrlKey || event.metaKey;
    if (!props.ctrlEnterToSend) {
        if (isCtrlOrMetaPressed) {
            event.preventDefault();
            insertNewline();
        } else if (!event.shiftKey) {
            event.preventDefault();
            if (!props.loading) emit('submit');
        }
    } else {
        if (isCtrlOrMetaPressed) {
            event.preventDefault();
            if (!props.loading) emit('submit');
        }
    }
};

const handleToggleMcp = (serverId) => {
    emit('toggle-mcp', serverId);
    showMcpQuickSelect.value = false;
    prompt.value = prompt.value.replace(/(?:^|\s)@([^@\s]*)$/, '').trimEnd();
};

const handleMcpClick = (server) => {
    handleToggleMcp(server.id);
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

const toggleVoiceSelector = async () => {
    if (isRecording.value) return;
    if (!isVoiceSelectorVisible.value) {
        try {
            const res = await window.api.getConfig();
            if (res?.config?.voiceList) {
                internalVoiceList.value = res.config.voiceList;
            }
        } catch (e) {
            console.error("刷新语音列表失败", e);
        }
        isReasoningSelectorVisible.value = false;
        isAudioSourceSelectorVisible.value = false;
    }
    isVoiceSelectorVisible.value = !isVoiceSelectorVisible.value;
};

const handleVoiceSelection = (value) => {
    selectedVoice.value = value;
    isVoiceSelectorVisible.value = false;
};

// --- File Handling ---
const triggerFileUpload = () => {
    emit('pick-file-start');
    nextTick(() => {
        fileInputRef.value?.click();
    });
};
const handleFileChange = (event) => { const files = event.target.files; if (files.length) emit('upload', { file: files[0], fileList: Array.from(files) }); if (fileInputRef.value) fileInputRef.value.value = ''; };
const preventDefaults = (e) => e.preventDefault();
const handleDragEnter = (event) => { preventDefaults(event); dragCounter.value++; isDragging.value = true; };
const handleDragLeave = (event) => { preventDefaults(event); dragCounter.value--; if (dragCounter.value <= 0) { isDragging.value = false; dragCounter.value = 0; } };
const handleDrop = (event) => { preventDefaults(event); isDragging.value = false; dragCounter.value = 0; const files = event.dataTransfer.files; if (files && files.length > 0) { emit('upload', { file: files[0], fileList: Array.from(files) }); focus(); } };
const handlePasteEvent = (event) => { const clipboardData = event.clipboardData || window.clipboardData; if (!clipboardData) return; const items = Array.from(clipboardData.items).filter(item => item.kind === 'file'); if (items.length > 0) { preventDefaults(event); const files = items.map(item => item.getAsFile()); emit('upload', { file: files[0], fileList: files }); focus(); } };

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

    isRecording.value = true;
    currentRecordingSource.value = sourceType;
    isCancelledByButton.value = false;

    try {
        if (sourceType === 'microphone') {
            const RecorderLib = await import('recorder-core');
            const Recorder = RecorderLib.default;
            await import('recorder-core/src/extensions/waveview.js');
            await import('recorder-core/src/engine/wav');

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
            const sources = await window.api.desktopCaptureSources({ types: ['screen', 'window'] });
            if (!sources || sources.length === 0) throw new Error('未找到可用的系统音频源');

            // 1. 获取包含视频和音频的原始流 (系统限制必须请求视频才能拿音频)
            audioStream = await navigator.mediaDevices.getUserMedia({
                audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id } },
                video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id } },
            });

            // 2. 从流中分离出音频轨道
            const audioTrack = audioStream.getAudioTracks()[0];
            if (!audioTrack) {
                // 如果用户在选择窗口时未勾选“分享音频”，这里会获取不到音频轨道
                // 立即停止流并报错
                audioStream.getTracks().forEach(t => t.stop());
                audioStream = null;
                throw new Error('未检测到系统音频，请务必在屏幕分享窗口中勾选“分享音频”');
            }

            // 3. 创建一个仅包含音频的新流供录制器使用
            const audioOnlyStream = new MediaStream([audioTrack]);

            audioChunks = [];
            // 4. 使用仅音频流初始化录制器
            // 注意：audioStream 变量仍保持原始混合流引用，以便 stopRecordingAndCleanup 能正确关闭屏幕分享状态
            mediaRecorder = new MediaRecorder(audioOnlyStream);

            mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
            mediaRecorder.onstop = () => {
                if (isCancelledByButton.value) {
                    stopRecordingAndCleanup();
                    return;
                }
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' }); // 浏览器通常输出webm/opus，但保留原逻辑兼容性
                const now = new Date();
                const timestamp = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
                const audioFile = new File([audioBlob], `audio-${timestamp}.wav`, { type: 'audio/wav' });
                emit('send-audio', audioFile);
                stopRecordingAndCleanup();
            };

            mediaRecorder.start();
        }
    } catch (err) {
        console.error("录音启动失败:", err);
        ElMessage.error(err.message || '无法开始录音');
        stopRecordingAndCleanup();
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
        recorder.stop(() => stopRecordingAndCleanup(), () => stopRecordingAndCleanup());
    } else if (currentRecordingSource.value === 'system' && mediaRecorder) {
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
        mediaRecorder.stop();
    }
};

const handleClickOutside = (event) => {
    const target = event.target;
    if (!target) return;
    if (isReasoningSelectorVisible.value && reasoningSelectorRef.value && !reasoningSelectorRef.value.contains(target) && reasoningButtonRef.value && !reasoningButtonRef.value.$el.contains(target)) {
        isReasoningSelectorVisible.value = false;
    }
    if (isVoiceSelectorVisible.value && voiceSelectorRef.value && !voiceSelectorRef.value.$el.contains(target) && voiceButtonRef.value && !voiceButtonRef.value.$el.contains(target)) {
        isVoiceSelectorVisible.value = false;
    }
    if (isAudioSourceSelectorVisible.value && audioSourceSelectorRef.value && !audioSourceSelectorRef.value.contains(target) && audioButtonRef.value && !audioButtonRef.value.$el.contains(target)) {
        isAudioSourceSelectorVisible.value = false;
    }
};

onMounted(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', preventDefaults);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('paste', handlePasteEvent);
    document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
    window.removeEventListener('dragenter', handleDragEnter);
    window.removeEventListener('dragleave', handleDragLeave);
    window.removeEventListener('dragover', preventDefaults);
    window.removeEventListener('drop', handleDrop);
    window.removeEventListener('paste', handlePasteEvent);
    document.removeEventListener('click', handleClickOutside);
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

const getDisplayTypeName = (type) => {
    if (!type) return '';
    const streamableHttpRegex = /^streamable[\s_-]?http$/i;
    const lowerType = type.toLowerCase();

    if (lowerType === 'builtin') return '内置';
    if (streamableHttpRegex.test(lowerType) || lowerType === 'http') return 'HTTP'; // 简化显示
    if (lowerType === 'sse') return 'SSE';
    if (lowerType === 'stdio') return 'Stdio';

    return type;
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
        <!-- 文件列表 -->
        <el-row v-if="fileList.length > 0 && !isRecording">
            <el-col :span="0" />
            <el-col :span="24">
                <div class="file-card-container">
                    <div v-for="(file, index) in fileList" :key="index" class="custom-file-card">
                        <div class="file-icon">
                            <el-icon :size="20">
                                <Document />
                            </el-icon>
                        </div>
                        <div class="file-info">
                            <div class="file-name" :title="file.name">{{ file.name }}</div>
                            <div class="file-size">{{ (file.size / 1024).toFixed(1) }} KB</div>
                        </div>
                        <div class="file-actions">
                            <el-button type="danger" link :icon="Delete" size="small" @click="onRemoveFile(index)" />
                        </div>
                    </div>
                </div>
            </el-col>
            <el-col :span="0" />
        </el-row>

        <!-- 录音波形 -->
        <el-row v-show="isRecording" class="waveform-row">
            <el-col :span="0" />
            <el-col :span="24">
                <div class="waveform-display-area">
                    <div v-if="currentRecordingSource === 'microphone'" ref="waveformCanvasContainer"
                        class="waveform-canvas"></div>
                    <span v-else class="recording-status-text">正在录制系统音频...</span>
                </div>
            </el-col>
            <el-col :span="0" />
        </el-row>

        <!-- 选项弹出层 -->
        <el-row v-if="isAudioSourceSelectorVisible" class="option-selector-row">
            <el-col :span="0" />
            <el-col :span="24">
                <div class="option-selector-wrapper" ref="audioSourceSelectorRef">
                    <div class="option-selector-content">
                        <el-text tag="b" class="selector-label">选择音源</el-text>
                        <el-divider direction="vertical" />
                        <el-button @click="startRecordingFromSource('microphone')" round>🎙️ 麦克风</el-button>
                        <el-button @click="startRecordingFromSource('system')" round>💻 系统音频</el-button>
                    </div>
                </div>
            </el-col>
            <el-col :span="0" />
        </el-row>

        <el-row v-if="isReasoningSelectorVisible" class="option-selector-row">
            <el-col :span="0" />
            <el-col :span="24">
                <div class="option-selector-wrapper" ref="reasoningSelectorRef">
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
            <el-col :span="0" />
        </el-row>

        <el-row v-if="isVoiceSelectorVisible" class="option-selector-row">
            <el-col :span="0" />
            <el-col :span="24">
                <el-scrollbar class="option-selector-wrapper" ref="voiceSelectorRef">
                    <div class="option-selector-content">
                        <el-text tag="b" class="selector-label">选择音色</el-text>
                        <el-divider direction="vertical" />
                        <el-button @click="handleVoiceSelection(null)" :type="!selectedVoice ? 'primary' : 'default'"
                            round>
                            关闭语音
                        </el-button>
                        <el-button v-for="voice in internalVoiceList" :key="voice" @click="handleVoiceSelection(voice)"
                            :type="selectedVoice === voice ? 'primary' : 'default'" round>
                            {{ voice }}
                        </el-button>
                    </div>
                </el-scrollbar>
            </el-col>
            <el-col :span="0" />
        </el-row>

        <el-row>
            <el-col :span="0" />
            <el-col :span="24">
                <div class="chat-input-area-vertical">
                    <div v-if="showMcpQuickSelect && filteredMcpList.length > 0" class="mcp-quick-select">
                        <!-- 顶部提示栏 -->
                        <div class="mcp-quick-header">
                            <span class="header-title">MCP快捷选择</span>
                            <span class="header-hint">Esc 取消 <span class="divider">|</span> ⇅ 选择 <span
                                    class="divider">|</span> Enter/数字键 确认</span>
                        </div>

                        <!-- 滚动列表区域 -->
                        <div class="mcp-quick-list-scroll">
                            <div v-for="(server, idx) in filteredMcpList" :key="server.id" class="mcp-quick-item"
                                :class="{ 'highlighted': idx === mcpHighlightIndex, 'active': activeMcpIds.includes(server.id) }"
                                @mousedown.prevent="handleMcpClick(server)">
                                <div class="mcp-item-left">
                                    <span class="mcp-index-badge">{{ idx }}</span>
                                    <span class="mcp-name">{{ server.name }}</span>
                                    <div class="mcp-tags">
                                        <!-- 显式显示类型标签 -->
                                        <span v-if="server.type" class="mcp-tag type-tag">{{
                                            getDisplayTypeName(server.type) }}</span>
                                        <!-- 原有的用户标签 -->
                                        <span v-for="tag in (server.tags || []).slice(0, 2)" :key="tag"
                                            class="mcp-tag">{{ tag }}</span>
                                    </div>
                                </div>
                                <div class="mcp-item-right">
                                    <el-icon v-if="activeMcpIds.includes(server.id)" class="active-icon">
                                        <Check />
                                    </el-icon>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="showSkillQuickSelect && filteredSkillList.length > 0" class="mcp-quick-select">
                        <div class="mcp-quick-header">
                            <span class="header-title">Skill 技能选择</span>
                            <span class="header-hint">Esc 取消 <span class="divider">|</span> Tab 补全 <span class="divider">|</span> Enter 确认</span>
                        </div>
                        <div class="mcp-quick-list-scroll">
                            <div v-for="(skill, idx) in filteredSkillList" :key="skill.name"
                                class="mcp-quick-item skill-quick-item"
                                :class="{ 'highlighted': idx === skillHighlightIndex, 'active': activeSkillIds.includes(skill.name) }"
                                @mousedown.prevent="handleToggleSkill(skill.name)">
                                <div class="mcp-item-left">
                                    <span class="mcp-index-badge">{{ idx }}</span>
                                    <span class="mcp-name">{{ skill.name }}</span>
                                    <div class="mcp-tags skill-tags-container">
                                        <span v-if="skill.context === 'fork'" class="mcp-tag type-tag"
                                            style="color: #E6A23C; background-color: rgba(230, 162, 60, 0.1); flex-shrink: 0;">Sub-Agent</span>
                                        <span class="mcp-tag skill-desc-tag" :title="skill.description">{{
                                            skill.description || '无描述' }}</span>
                                    </div>
                                </div>
                                <div class="mcp-item-right">
                                    <el-icon v-if="activeSkillIds.includes(skill.name)" class="active-icon">
                                        <Check />
                                    </el-icon>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="input-wrapper">
                        <el-input ref="senderRef" class="chat-textarea-vertical" v-model="prompt" type="textarea"
                            :placeholder="isRecording ? '录音中... 结束后将连同文本一起发送' : '输入、粘贴、拖拽以发送内容，“ @”选择MCP，“ /”选择skill'"
                            :autosize="{ minRows: 1, maxRows: 15 }" resize="none" @keydown="handleKeyDown"
                            :disabled="isRecording" />
                    </div>
                    <div class="input-actions-bar">
                        <div class="action-buttons-left">
                            <el-tooltip content="清除聊天记录">
                                <el-button size="default" @click="onClearHistory" circle :disabled="isRecording">
                                    <el-icon :size="18">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                                            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                            stroke-linecap="round" stroke-linejoin="round"
                                            class="lucide lucide-paintbrush-vertical" aria-hidden="true">
                                            <path d="M10 2v2"></path>
                                            <path d="M14 2v4"></path>
                                            <path d="M17 2a1 1 0 0 1 1 1v9H6V3a1 1 0 0 1 1-1z"></path>
                                            <path
                                                d="M6 12a1 1 0 0 0-1 1v1a2 2 0 0 0 2 2h2a1 1 0 0 1 1 1v2.9a2 2 0 1 0 4 0V17a1 1 0 0 1 1-1h2a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1">
                                            </path>
                                        </svg>
                                    </el-icon>
                                </el-button>
                            </el-tooltip>
                            <el-tooltip content="添加附件">
                                <el-button size="default" @click="triggerFileUpload" circle :disabled="isRecording">
                                    <el-icon :size="17">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                                            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                            stroke-linecap="round" stroke-linejoin="round"
                                            class="lucide lucide-paperclip" aria-hidden="true">
                                            <path
                                                d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551">
                                            </path>
                                        </svg>
                                    </el-icon>
                                </el-button>
                            </el-tooltip>

                            <el-tooltip :content="reasoningTooltipContent">
                                <el-button ref="reasoningButtonRef"
                                    :class="{ 'is-active-special': tempReasoningEffort && tempReasoningEffort !== 'default' }"
                                    size="default" circle :disabled="isRecording" @click="toggleReasoningSelector">
                                    <el-icon :size="18">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                                            viewBox="0 0 24 24" class="icon" style="margin-top: -2px;">
                                            <path fill="currentColor"
                                                d="M1 11h3v2H1zm9 11c0 .6.4 1 1 1h2c.6 0 1-.4 1-1v-1h-4zm3-21h-2v3h2zM4.9 3.5L3.5 4.9L5.6 7L7 5.6zM20 11v2h3v-2zm-.9-7.5L17 5.6L18.4 7l2.1-2.1zM18 12c0 2.2-1.2 4.2-3 5.2V19c0 .6-.4 1-1 1h-4c-.6 0-1-.4-1-1v-1.8c-1.8-1-3-3-3-5.2c0-3.3 2.7-6 6-6s6 2.7 6 6M8 12c0 .35.05.68.14 1h7.72c.09-.32.14-.65.14-1c0-2.21-1.79-4-4-4s-4 1.79-4 4">
                                            </path>
                                        </svg>
                                    </el-icon>
                                </el-button>
                            </el-tooltip>

                            <el-tooltip content="语音回复设置">
                                <el-button ref="voiceButtonRef" size="default" circle :disabled="isRecording"
                                    :class="{ 'is-active-special': selectedVoice }" @click="toggleVoiceSelector">
                                    <el-icon :size="18">
                                        <svg t="1765028999430" class="icon" viewBox="0 0 1024 1024" version="1.1"
                                            xmlns="http://www.w3.org/2000/svg" p-id="60819" width="200" height="200">
                                            <path
                                                d="M85.333333 512C85.333333 276.352 276.352 85.333333 512 85.333333s426.666667 191.018667 426.666667 426.666667-191.018667 426.666667-426.666667 426.666667H85.333333l124.970667-124.970667A425.344 425.344 0 0 1 85.333333 512z m205.994667 341.333333H512a341.333333 341.333333 0 1 0-341.333333-341.333333c0 91.818667 36.309333 177.706667 99.968 241.365333l60.330666 60.330667-39.637333 39.637333zM469.333333 256h85.333334v512h-85.333334V256zM298.666667 384h85.333333v256H298.666667V384z m341.333333 0h85.333333v256h-85.333333V384z"
                                                p-id="60820"></path>
                                        </svg>
                                    </el-icon>
                                </el-button>
                            </el-tooltip>
                            <el-tooltip content="MCP工具">
                                <el-button size="default" circle :disabled="isRecording"
                                    :class="{ 'is-active-special': isMcpActive }" @click="$emit('open-mcp-dialog')">
                                    <el-icon :size="18">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                                            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                            stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hammer"
                                            aria-hidden="true">
                                            <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"></path>
                                            <path d="m18 15 4-4"></path>
                                            <path
                                                d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5">
                                            </path>
                                        </svg>
                                    </el-icon>
                                </el-button>
                            </el-tooltip>
                            <el-tooltip content="Skill 技能库">
                                <el-button size="default" circle :disabled="isRecording"
                                    :class="{ 'is-active-special': activeSkillIds && activeSkillIds.length > 0 }"
                                    @click="$emit('open-skill-dialog')">
                                    <el-icon :size="18">
                                        <Collection />
                                    </el-icon>
                                </el-button>
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
                                <el-tooltip content="发送语音">
                                    <el-button ref="audioButtonRef" size="default" @click="toggleAudioSourceSelector"
                                        circle>
                                        <el-icon :size="17">
                                            <svg t="1765029327206" class="icon" viewBox="0 0 1024 1024" version="1.1"
                                                xmlns="http://www.w3.org/2000/svg" p-id="68987" width="200"
                                                height="200">
                                                <path
                                                    d="M516.368 732.288c126.944 0 230.096-99.696 230.096-222.272V230.272c0-122.56-103.28-222.272-230.096-222.272S286.16 107.696 286.16 230.272v279.744c0 122.56 103.28 222.272 230.208 222.272zM377.664 230.272c0-73.808 62.256-133.984 138.704-133.984 76.448 0 138.688 60.048 138.688 133.984v279.744c0 73.808-62.256 134-138.688 134-76.448 0-138.704-60.048-138.704-134V230.272z"
                                                    p-id="68988"></path>
                                                <path
                                                    d="M465.088 899.296C267.52 876.656 113.776 712.928 113.776 514.928c0-24.832 20.64-44.896 46.16-44.896 25.536 0 46.16 20.064 46.16 44.896 0 163.952 137.184 297.376 305.856 297.376 168.656 0 305.968-133.424 305.968-297.376 0-24.832 20.656-44.896 46.192-44.896 25.504 0 46.128 20.064 46.128 44.896 0 196.976-152.096 359.872-348.16 384.016v68.592A48.416 48.416 0 0 1 513.6 1016a48.448 48.448 0 0 1-48.496-48.464v-68.24z"
                                                    p-id="68989"></path>
                                            </svg>
                                        </el-icon>
                                    </el-button>
                                </el-tooltip>
                                <el-button v-if="!loading" @click="onSubmit" circle :disabled="loading">
                                    <el-icon :size="18">
                                        <svg t="1765029205363" class="icon" viewBox="0 0 1024 1024" version="1.1"
                                            xmlns="http://www.w3.org/2000/svg" p-id="63447" width="200" height="200">
                                            <path
                                                d="M866.133333 298.666667l-277.333333 396.8 174.933333 64L866.133333 298.666667zM469.333333 691.2l362.666667-482.133333-652.8 332.8 230.4 72.533333c21.333333 8.533333 29.866667 29.866667 21.333333 51.2v4.266667c-12.8 21.333333-42.666667 34.133333-68.266666 21.333333L76.8 597.333333c-21.333333-8.533333-34.133333-29.866667-25.6-55.466666 4.266667-8.533333 12.8-17.066667 21.333333-25.6L913.066667 72.533333c21.333333-12.8 46.933333-4.266667 59.733333 17.066667 4.266667 8.533333 4.266667 17.066667 4.266667 29.866667l-140.8 699.733333c-4.266667 21.333333-25.6 38.4-51.2 34.133333h-4.266667l-238.933333-89.6v162.133334c0 21.333333-17.066667 38.4-38.4 42.666666-21.333333 0-38.4-17.066667-38.4-42.666666"
                                                p-id="63448"></path>
                                        </svg>
                                    </el-icon>
                                </el-button>
                                <el-button v-else @click="onCancel" circle class="cancel-button-animated">
                                    <el-icon class="static-icon">
                                        <Close />
                                    </el-icon>
                                    <div class="cancel-spinner"></div>
                                </el-button>
                            </template>
                        </div>
                    </div>
                </div>

                <input ref="fileInputRef" type="file" multiple @change="handleFileChange" style="display: none;" />
            </el-col>
            <el-col :span="0" />
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
    padding: 10px 5% 25px 5%;
    height: auto;
    width: 100%;
    flex-shrink: 0;
    z-index: 10;
    background-color: transparent;
}

/* --- MCP Quick Select Styles --- */
.mcp-quick-select {
    position: absolute;
    bottom: 100%;
    left: 0;
    width: 100%;
    /* 容器本身不滚动，改为 flex 布局以固定 Header */
    display: flex;
    flex-direction: column;
    background-color: var(--el-bg-color-overlay);
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
    z-index: 100;
    margin-bottom: 8px;
    padding: 0;
    /* padding 移到内部元素 */
    overflow: hidden;
    /* 防止圆角溢出 */
}

/* 顶部提示栏样式 */
.mcp-quick-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background-color: var(--el-fill-color-light);
    border-bottom: 1px solid var(--el-border-color-lighter);
    flex-shrink: 0;
}

.header-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-primary);
}

.header-hint {
    font-size: 11px;
    color: var(--el-text-color-secondary);
    font-family: monospace;
    /* 等宽字体让快捷键更好看 */
}

.header-hint .divider {
    color: var(--el-border-color);
    margin: 0 4px;
}

/* 滚动列表区域 */
.mcp-quick-list-scroll {
    max-height: 260px;
    /* 列表内容的最大高度 */
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

/* 滚动条 */
.mcp-quick-list-scroll::-webkit-scrollbar {
    width: 6px;
}

.mcp-quick-list-scroll::-webkit-scrollbar-thumb {
    background-color: var(--el-border-color);
    border-radius: 3px;
}

.app-container.has-bg .mcp-quick-select {
    background-color: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-color: rgba(255, 255, 255, 0.5);
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
}

.app-container.has-bg .mcp-quick-header {
    background-color: rgba(0, 0, 0, 0.03);
    border-bottom-color: rgba(0, 0, 0, 0.05);
}

html.dark .app-container.has-bg .mcp-quick-select {
    background-color: rgba(30, 30, 30, 0.85);
    border-color: rgba(255, 255, 255, 0.1);
}

html.dark .app-container.has-bg .mcp-quick-header {
    background-color: rgba(255, 255, 255, 0.05);
    border-bottom-color: rgba(255, 255, 255, 0.05);
}

.mcp-quick-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px 4px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    /* 增加平滑过渡 */
    border: 1px solid transparent;
    /* 预留边框位置防止跳动 */
}

/* 1. 默认状态：悬浮 (Hover) & 键盘高亮 (Highlighted) */
.mcp-quick-item:hover,
.mcp-quick-item.highlighted {
    background-color: var(--el-fill-color);
}

/* 2. 激活状态 (Active - 已勾选) */
.mcp-quick-item.active {
    background-color: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-8);
}

.mcp-quick-item.active .mcp-name {
    color: var(--el-color-primary);
    /* 激活时名称变为主色 */
    font-weight: 600;
}

/* 3. 激活 + 悬浮/高亮 (叠加状态) */
.mcp-quick-item.active:hover,
.mcp-quick-item.active.highlighted {
    background-color: var(--el-color-primary-light-8);
}

/* --- 深色模式适配 (Dark Mode) --- */
html.dark .mcp-quick-item.active {
    background-color: rgba(64, 158, 255, 0.15);
    /* 使用透明主色，避免 light-9 在暗色下太亮 */
    border-color: rgba(64, 158, 255, 0.2);
}

html.dark .mcp-quick-item.active:hover,
html.dark .mcp-quick-item.active.highlighted {
    background-color: rgba(64, 158, 255, 0.25);
}

/* 1. 悬浮/高亮 */
.app-container.has-bg .mcp-quick-item:hover,
.app-container.has-bg .mcp-quick-item.highlighted {
    background-color: rgba(0, 0, 0, 0.05);
}

html.dark .app-container.has-bg .mcp-quick-item:hover,
html.dark .app-container.has-bg .mcp-quick-item.highlighted {
    background-color: rgba(255, 255, 255, 0.1);
}

/* 2. 激活状态 */
.app-container.has-bg .mcp-quick-item.active {
    /* 浅色背景下：淡淡的蓝色玻璃感 */
    background-color: rgba(64, 158, 255, 0.15);
    border-color: rgba(64, 158, 255, 0.2);
}

html.dark .app-container.has-bg .mcp-quick-item.active {
    /* 深色背景下：稍亮的蓝色玻璃感 */
    background-color: rgba(64, 158, 255, 0.25);
    border-color: rgba(64, 158, 255, 0.3);
}

/* 3. 激活 + 悬浮/高亮 */
.app-container.has-bg .mcp-quick-item.active:hover,
.app-container.has-bg .mcp-quick-item.active.highlighted {
    background-color: rgba(64, 158, 255, 0.25);
}

html.dark .app-container.has-bg .mcp-quick-item.active:hover,
html.dark .app-container.has-bg .mcp-quick-item.active.highlighted {
    background-color: rgba(64, 158, 255, 0.35);
}

.mcp-item-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
}

.mcp-index-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    border-radius: 4px;
    background-color: var(--el-fill-color-dark);
    /* 浅色模式默认 */
    color: var(--el-text-color-secondary);
    font-size: 11px;
    font-weight: bold;
    padding: 2px 4px 0px 4px;
    transition: all 0.15s;
}

.mcp-quick-item.active .mcp-index-badge {
    background-color: var(--el-color-primary);
    color: #ffffff;
}

html.dark .mcp-index-badge {
    background-color: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.9);
}

html.dark .mcp-quick-item:hover .mcp-index-badge,
html.dark .mcp-quick-item.highlighted .mcp-index-badge {
    background-color: rgba(255, 255, 255, 0.25);
    color: #ffffff;
}

html.dark .mcp-quick-item.active .mcp-index-badge {
    background-color: var(--el-color-primary);
    color: #1a1a1a;
}

.mcp-name {
    font-weight: 500;
    color: var(--el-text-color-primary);
    white-space: nowrap;
}

.mcp-tags {
    display: flex;
    gap: 4px;
    align-items: center;
}

.mcp-tag {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background-color: var(--el-color-info-light-9);
    color: var(--el-color-info);
    height: 18px;
    line-height: 16px;
    box-sizing: border-box;
}

/* 类型标签特殊样式 */
.mcp-tag.type-tag {
    background-color: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-weight: 600;
    padding-bottom: 0px;
    padding-top: 2px;
}

html.dark .mcp-tag.type-tag {
    background-color: var(--el-color-primary-light-8);
    color: var(--el-color-primary-dark-2);
}

.mcp-item-right {
    margin-left: 8px;
    width: 20px;
    display: flex;
    justify-content: center;
}

.active-icon {
    color: var(--el-color-primary);
    font-weight: bold;
}

.skill-tags-container {
    flex: 1;
    min-width: 0;
    overflow: hidden;
}

.skill-desc-tag {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    padding-top: 1px;
}

/* --- 文件卡片容器样式 (原有) --- */
.file-card-container {
    margin-bottom: 8px;
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 4px;
    padding-top: 8px;
    max-height: 70px;
}

/* 自定义文件卡片样式 */
.custom-file-card {
    display: flex;
    align-items: center;
    background-color: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-light);
    border-radius: 6px;
    padding: 6px 10px;
    margin-right: 0;
    /* gap已处理间距 */
    min-width: 140px;
    max-width: 220px;
    height: 48px;
    box-sizing: border-box;
    transition: all 0.2s;
    flex-shrink: 0;
}

.custom-file-card:hover {
    border-color: var(--el-color-primary-light-5);
    background-color: var(--el-fill-color);
}

.file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 10px;
    color: var(--el-text-color-secondary);
}

.file-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    line-height: 1.2;
    min-width: 0;
    /* 修复 flex 子项截断问题 */
}

.file-name {
    font-size: 12px;
    color: var(--el-text-color-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
}

.file-size {
    font-size: 10px;
    color: var(--el-text-color-secondary);
    margin-top: 2px;
}

.file-actions {
    margin-left: 8px;
    display: flex;
    align-items: center;
    opacity: 0.6;
    transition: opacity 0.2s;
}

.custom-file-card:hover .file-actions {
    opacity: 1;
}

/* 深色模式下的文件卡片适配 */
html.dark .custom-file-card {
    background-color: #2c2c2c;
    border-color: #4c4c4c;
}

html.dark .custom-file-card:hover {
    background-color: #363636;
    border-color: #5c5c5c;
}

/* 滚动条样式 */
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

html.dark .file-card-container::-webkit-scrollbar-thumb {
    background-color: #4c4c4c;
}

html.dark .file-card-container::-webkit-scrollbar-thumb:hover {
    background-color: #6b6b6b;
}

/* --- Waveform Display Area Styles --- */
.waveform-row {
    margin-bottom: 8px;
    transition: all 0.3s ease;
}

.waveform-display-area {
    width: 100%;
    height: 40px;
    background-color: var(--el-bg-color-input);
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
    0% {
        opacity: 0.7;
    }

    50% {
        opacity: 1;
    }

    100% {
        opacity: 0.7;
    }
}

html.dark .waveform-display-area {
    background-color: var(--el-bg-color-input);
}

/* --- Universal Option Selector Styles --- */
.option-selector-row {
    margin-bottom: 8px;
}

.option-selector-wrapper {
    background-color: var(--el-bg-color-input);
    border-radius: 12px;
    padding: 8px;
    max-height: 132px;
}

html.dark .option-selector-wrapper {
    background-color: var(--el-bg-color-input);
}

.option-selector-content {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}

.option-selector-content .el-button {
    flex-shrink: 0;
}

.option-selector-wrapper :deep(.el-scrollbar__view) {
    padding-right: 8px;
}

.selector-label {
    font-size: 14px;
    color: var(--el-text-color);
    margin: 0 4px 0 8px;
    white-space: nowrap;
}

.el-divider--vertical {
    height: 1.2em;
    border-left: 1px solid var(--el-border-color-lighter);
    margin: 0 4px;
}

html.dark .el-divider--vertical {
    border-left-color: var(--el-border-color);
}

.input-wrapper {
    position: relative;
    flex-grow: 1;
    display: flex;
}

/* --- Vertical Layout (Chat Input Area) --- */
.chat-input-area-vertical {
    display: flex;
    flex-direction: column;
    background-color: var(--el-bg-color-input);
    border-radius: 12px;
    padding: 10px 12px;
    border: 1px solid #E4E7ED;
    position: relative;
    /* 确保绝对定位的 mcp 列表相对此定位 */
}

html.dark .chat-input-area-vertical {
    background-color: var(--el-bg-color-input);
    border: 1px solid #414243;
}

.chat-textarea-vertical {
    width: 100%;
    flex-grow: 1;
}

.chat-textarea-vertical:deep(.el-textarea__inner) {
    background-color: transparent !important;
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

.chat-input-area-vertical .action-buttons-left .el-button,
.chat-input-area-vertical .action-buttons-right .el-button {
    margin-left: 0 !important;
    margin-right: 0 !important;
}

.chat-input-area-vertical .action-buttons-left {
    margin-left: 0px;
}

.chat-input-area-vertical .action-buttons-right {
    margin-right: 0px;
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

.chat-input-area-vertical .action-buttons-left .el-button.is-active-special {
    color: var(--el-color-warning);
}

.chat-input-area-vertical .action-buttons-left .el-button:hover {
    color: var(--text-on-accent);
    background-color: var(--el-color-primary-light-8);
}

.chat-input-area-vertical .action-buttons-right .el-button:hover {
    color: var(--text-on-accent);
}

/* --- Common Styles --- */
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

.el-button.is-circle {
    color: var(--el-text-color-regular);
}

.el-button.is-circle:hover,
.el-button.is-circle:focus {
    color: var(--el-color-primary);
    background-color: var(--el-color-primary-light-8);
}

.el-button.is-circle[type="primary"] {
    background-color: var(--el-color-primary);
    color: #ffffff;
}

.el-button.is-circle[type="primary"]:hover,
.el-button.is-circle[type="primary"]:focus {
    background-color: var(--el-color-primary-light-3);
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

/* Cancel Button Animation */
.cancel-button-animated {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.static-icon {
    font-size: 16px;
    z-index: 1;
    color: var(--el-text-color-regular);
}

.cancel-spinner {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    margin-left: -10px;
    margin-top: -10px;

    border: 2px solid transparent;
    border-top-color: var(--el-text-color-secondary);
    border-right-color: var(--el-text-color-secondary);
    border-radius: 50%;

    animation: spin 1s linear infinite;
    pointer-events: none;
    box-sizing: border-box;
}

html.dark .static-icon {
    color: var(--el-text-color-primary);
}

html.dark .cancel-spinner {
    border-top-color: var(--el-text-color-primary);
    border-right-color: var(--el-text-color-primary);
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}
</style>