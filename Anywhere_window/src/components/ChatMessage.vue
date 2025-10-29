<script setup>
import { computed, ref, nextTick } from 'vue';
import { Bubble, Thinking, XMarkdown } from 'vue-element-plus-x';
import { ElTooltip, ElButton, ElInput, ElCollapse, ElCollapseItem, ElIcon } from 'element-plus';
import { DocumentCopy, Refresh, Delete, Document, CaretTop, CaretBottom, Edit, Check, Close } from '@element-plus/icons-vue';
import 'katex/dist/katex.min.css';

const props = defineProps({
  message: Object,
  index: Number,
  isLastMessage: Boolean,
  isLoading: Boolean,
  userAvatar: String,
  aiAvatar: String,
  isCollapsed: Boolean,
  isDarkMode: Boolean
});

const emit = defineEmits(['copy-text', 're-ask', 'delete-message', 'toggle-collapse', 'show-system-prompt', 'avatar-click', 'edit-message', 'edit-message-requested', 'edit-finished']);

const editInputRef = ref(null);
const isEditing = ref(false);
const editedContent = ref('');

const preprocessKatex = (text) => {
  if (!text) return '';
  let processedText = text;
  processedText = processedText.replace(/\u2013/g, '-').replace(/\u2014/g, '-');

  processedText = processedText.replace(/\\$$([\s\S]*?)\\$$/g, '$$$$$1$$$$');
  processedText = processedText.replace(/\\$\s*(.*?)\s*\\$/g, '$$$1$');

  return processedText;
};

const mermaidConfig = computed(() => ({
  theme: props.isDarkMode ? 'dark' : 'neutral',
}));

const formatTimestamp = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const datePart = date.toLocaleDateString('sv-SE');
    const timePart = date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  } catch (e) {
    return '';
  }
};

const formatMessageContent = (content,role) => {
    if (!content) return "";
    if (!Array.isArray(content)) {
        if (String(content).toLowerCase().startsWith('file name:') && String(content).toLowerCase().endsWith('file end')) {
            return "";
        } else {
            return String(content);
        }
    }

    let markdownString = "";
    let i = 0;
    while (i < content.length) {
        const part = content[i];

        if (part.type === 'text' && part.text && part.text.toLowerCase().startsWith('file name:') && part.text.toLowerCase().endsWith('file end')) {
            i++;
            continue;
        } else if (part.type === 'image_url' && part.image_url?.url) {
            let imageGroupMarkdown = "";
            while (i < content.length && content[i].type === 'image_url' && content[i].image_url?.url) {
                imageGroupMarkdown += `![Image](${content[i].image_url.url}) `;
                i++;
            }
            markdownString += `\n\n${imageGroupMarkdown.trim()}\n\n`;
        } else if (part.type === 'input_audio' && part.input_audio?.data) {
            if (role === 'user') {
              markdownString += `\n\n<audio class="chat-audio-player" controls preload="none">\n<source id="${part.input_audio.format}" src="data:audio/${part.input_audio.format};base64,${part.input_audio.data}">\n</audio>\n`;
            }else {
              markdownString += `\n\n<audio class="chat-audio-player" controls autoplay preload="none">\n<source id="${part.input_audio.format}" src="data:audio/${part.input_audio.format};base64,${part.input_audio.data}">\n</audio>\n`;
            }
            i++;
        } else if (part.type === 'text' && part.text) {
            markdownString += part.text;
            i++;
        } else {
            i++;
        }
    }

    return markdownString;
};

const formatMessageFile = (content) => {
  let files = [];
  if (!Array.isArray(content)) {
    if (String(content).toLowerCase().startsWith('file name:') && String(content).toLowerCase().endsWith('file end')) files.push(String(content).split('\n')[0].replace('file name:', '').trim());
    else return [];
  } else {
    content.forEach(part => {
      if (part.type === 'text' && part.text && part.text.toLowerCase().startsWith('file name:') && part.text.toLowerCase().endsWith('file end')) files.push(part.text.split('\n')[0].replace('file name:', '').trim());
      else if (part.type === "input_file" && part.filename) files.push(part.filename);
      else if (part.type === "file" && part.file.filename) files.push(part.file.filename);
    });
  }
  return files;
};

const formatMessageText = (content) => {
    if (!content) return "";
    if (!Array.isArray(content)) return String(content);

    let textString = "";
    content.forEach(part => {
        if (part.type === 'text' && part.text && !(part.text.toLowerCase().startsWith('file name:') && part.text.toLowerCase().endsWith('file end'))) {
            textString += part.text;
        }
    });
    return textString.trim();
};

const isEditable = computed(() => {
    // 用户消息总是可编辑的，以便添加或修改文本。
    if (props.message.role === 'user') {
        return true;
    }

    // 对于其他角色（如助手），检查是否存在可编辑的文本内容。
    const content = props.message.content;
    if (typeof content === 'string') return true;
    if (Array.isArray(content)) {
        // 只要内容数组中有一个是文本部分，就认为它是可编辑的
        return content.some(part => part.type === 'text' && part.text && !(part.text.toLowerCase().startsWith('file name:')));
    }
    return false;
});

const switchToEditMode = () => {
    editedContent.value = formatMessageText(props.message.content);
    isEditing.value = true;
    nextTick(() => {
        editInputRef.value?.focus();
    });
};

const switchToShowMode = () => {
    isEditing.value = false;
};

defineExpose({
    switchToEditMode,
    switchToShowMode
});

const handleEditKeyDown = (event) => {
    if (event.key === 'Escape') {
        event.preventDefault();
        emit('edit-finished', { index: props.index, action: 'cancel' });
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        emit('edit-finished', { index: props.index, action: 'save', content: editedContent.value });
    }
};

const renderedMarkdownContent = computed(() => {
    const content = props.message.role ? props.message.content : props.message;
    const role = props.message.role ? props.message.role : 'user';
    let formattedContent = formatMessageContent(content,role);
    formattedContent = preprocessKatex(formattedContent);
    if (!formattedContent && props.message.role === 'assistant') return ' ';
    return formattedContent || ' ';
});

const shouldShowCollapseButton = computed(() => {
  if (!props.isLastMessage) return true;
  if (props.isLastMessage) return !props.isLoading;
  return false;
});

const onCopy = () => {
  if (props.isLoading && props.isLastMessage) return;
  emit('copy-text', formatMessageText(props.message.content), props.index);
};
const onReAsk = () => emit('re-ask');
const onDelete = () => emit('delete-message', props.index);
const onToggleCollapse = (event) => emit('toggle-collapse', props.index, event);
const onShowSystemPrompt = () => emit('show-system-prompt', props.message.content);
const onAvatarClick = (role, event) => emit('avatar-click', role, event);
const truncateFilename = (filename, maxLength = 30) => {
  if (typeof filename !== 'string' || filename.length <= maxLength) return filename;
  const ellipsis = '...';
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex < 10) return filename.substring(0, maxLength - ellipsis.length) + ellipsis;
  const nameWithoutExt = filename.substring(0, lastDotIndex);
  const extension = filename.substring(lastDotIndex);
  const charsToKeep = maxLength - extension.length - ellipsis.length;
  if (charsToKeep < 1) return ellipsis + extension;
  return nameWithoutExt.substring(0, charsToKeep) + ellipsis + extension;
};
</script>

<template>
  <div class="chat-message">
    <div v-if="message.role === 'system'" class="system-prompt-container">
      <p class="system-prompt-preview" @click="onShowSystemPrompt">
        <span v-if="String(message.content).trim()">{{ String(message.content) }}</span>
        <span v-else class="placeholder-text">系统提示词...</span>
      </p>
      <el-button :icon="Edit" @click="onShowSystemPrompt" size="small" circle text class="system-prompt-edit-btn" />
    </div>

    <Bubble v-if="message.role === 'user'" class="user-bubble" placement="end" shape="corner"
      maxWidth="90%" avatar-size="40px">
      <template #avatar>
        <img :src="userAvatar" alt="User Avatar" @click="onAvatarClick('user', $event)" class="chat-avatar">
      </template>
      <template #header>
        <div class="user-info-header">
          <span class="timestamp" v-if="message.timestamp">{{ formatTimestamp(message.timestamp) }}</span>
        </div>
      </template>
      <template #content>
        <div v-if="!isEditing" class="markdown-wrapper" :class="{ 'collapsed': isCollapsed }">
            <XMarkdown
                :markdown="renderedMarkdownContent"
                :is-dark="isDarkMode"
                :enable-latex="true"
                :mermaid-config="mermaidConfig"
                :default-theme-mode="isDarkMode ? 'dark' : 'light'"
                :themes="{light:'github-light', dark:'github-dark-default'}"
                :allow-html="true" />
        </div>
        <div v-else class="editing-wrapper">
            <el-input ref="editInputRef" v-model="editedContent" type="textarea" :autosize="{minRows: 1, maxRows: 15}" resize="none" @keydown="handleEditKeyDown" />
            <div class="editing-actions">
                <span class="edit-shortcut-hint">Ctrl+Enter 确认 / Esc 取消</span>
                <el-button :icon="Check" @click="emit('edit-finished', { index, action: 'save', content: editedContent })" size="small" circle type="primary" />
                <el-button :icon="Close" @click="emit('edit-finished', { index, action: 'cancel' })" size="small" circle />
            </div>
        </div>

      </template>
      <template #footer>
        <div class="message-footer">
          <div class="footer-wrapper">
            <div class="footer-actions">
              <el-button :icon="DocumentCopy" @click="onCopy" size="small" circle />
              <el-button v-if="isEditable" :icon="Edit" @click="emit('edit-message-requested', index)" size="small" circle />
              <el-button v-if="shouldShowCollapseButton" :icon="isCollapsed ? CaretBottom : CaretTop"
                @click="onToggleCollapse($event)" size="small" circle />
              <el-button v-if="isLastMessage" :icon="Refresh" @click="onReAsk" size="small" circle />
              <el-button :icon="Delete" size="small" @click="onDelete" circle />
            </div>
            <div class="message-files-vertical-list" v-if="formatMessageFile(message.content).length > 0">
              <el-tooltip v-for="(file_name, idx) in formatMessageFile(message.content)" :key="idx" :content="file_name"
                placement="top" :disabled="file_name.length < 30" :popper-style="{ maxWidth: '30vw', wordBreak: 'break-all' }">
                <el-button class="file-button" type="info" plain size="small" :icon="Document">{{truncateFilename(file_name, 20)}}</el-button>
              </el-tooltip>
            </div>
          </div>
        </div>
      </template>
    </Bubble>

    <Bubble v-if="message.role === 'assistant'" class="ai-bubble" placement="start" shape="corner"
      maxWidth="90%" avatar-size="40px" :loading="isLastMessage && isLoading && renderedMarkdownContent === ' ' && (!message.tool_calls || message.tool_calls.length === 0)">
      <template #avatar>
        <img :src="aiAvatar" alt="AI Avatar" @click="onAvatarClick('assistant', $event)" class="chat-avatar">
      </template>
      <template #header>
        <div class="ai-info-header">
          <div class="ai-details">
            <span class="ai-name">{{ message.aiName }}</span>
            <span v-if="message.voiceName" class="voice-name">({{ message.voiceName }})</span>
          </div>
          <span class="timestamp" v-if="message.completedTimestamp">{{ formatTimestamp(message.completedTimestamp)}}</span>
        </div>
        <Thinking v-if="message.status && message.status.length > 0" maxWidth="90%" :content="(message.reasoning_content || '').trim()"
          :modelValue="false">
          <template #status-icon="{ status }">
            <span v-if="message.status === 'start'">😄</span>
            <span v-else-if="message.status === 'thinking'">🤔</span>
            <span v-else-if="message.status === 'end'">😊</span>
            <span v-else-if="message.status === 'error'">😭</span>
          </template>
          <template #label>
            <span v-if="message.status === 'start'">开始思考</span>
            <span v-else-if="message.status === 'thinking'">正在思考</span>
            <span v-else-if="message.status === 'end'">思考完毕</span>
            <span v-else-if="message.status === 'error'">思考失败</span>
          </template>
        </Thinking>
      </template>
      <template #content>
        <!-- === MODIFICATION START: The order of tool_calls and markdown is swapped === -->
        <div v-if="message.tool_calls && message.tool_calls.length > 0" class="tool-calls-container">
            <el-collapse class="tool-collapse" accordion>
                <el-collapse-item v-for="toolCall in message.tool_calls" :key="toolCall.id" :name="toolCall.id">
                    <template #title>
                        <div class="tool-call-title">
                            <el-icon class="tool-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-8.373 8.373a1 1 0 0 1-3-3L12 9"></path><path d="m18 15 4-4"></path><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"></path></svg>
                            </el-icon>
                            <span class="tool-name">{{ toolCall.name }}</span>
                        </div>
                    </template>
                    <div class="tool-call-details">
                        <div class="tool-detail-section">
                            <strong>参数:</strong>
                            <pre><code>{{ JSON.stringify(JSON.parse(toolCall.args), null, 2) }}</code></pre>
                        </div>
                        <div class="tool-detail-section">
                            <strong>结果:</strong>
                            <pre><code>{{ toolCall.result }}</code></pre>
                        </div>
                    </div>
                </el-collapse-item>
            </el-collapse>
        </div>
        
        <div v-if="!isEditing" class="markdown-wrapper" :class="{ 'collapsed': isCollapsed }">
            <XMarkdown
                :markdown="renderedMarkdownContent"
                :is-dark="isDarkMode"
                :enable-latex="true"
                :mermaid-config="mermaidConfig"
                :default-theme-mode="isDarkMode ? 'dark' : 'light'"
                :themes="{light:'one-light', dark:'vesper'}"
                :allow-html="true" />
        </div>
        <div v-else class="editing-wrapper">
            <el-input ref="editInputRef" v-model="editedContent" type="textarea" :autosize="{minRows: 1, maxRows: 15}" resize="none" @keydown="handleEditKeyDown" />
            <div class="editing-actions">
                <span class="edit-shortcut-hint">Ctrl+Enter 确认 / Esc 取消</span>
                <el-button :icon="Check" @click="emit('edit-finished', { index, action: 'save', content: editedContent })" size="small" circle type="primary" />
                <el-button :icon="Close" @click="emit('edit-finished', { index, action: 'cancel' })" size="small" circle />
            </div>
        </div>
        <!-- === MODIFICATION END === -->
      </template>
      <template #footer>
        <div class="message-footer">
          <div class="footer-actions">
            <el-button :icon="DocumentCopy" @click="onCopy" size="small" circle />
            <el-button v-if="isEditable" :icon="Edit" @click="emit('edit-message-requested', index)" size="small" circle />
            <el-button v-if="shouldShowCollapseButton" :icon="isCollapsed ? CaretBottom : CaretTop"
              @click="onToggleCollapse($event)" size="small" circle />
            <el-button v-if="isLastMessage" :icon="Refresh" @click="onReAsk" size="small" circle />
            <el-button :icon="Delete" size="small" @click="onDelete" circle />
          </div>
        </div>
      </template>
    </Bubble>
  </div>
</template>

<style scoped lang="less">
.chat-message {
  margin: 10px 0 0 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}

.chat-message .user-bubble,
.chat-message .ai-bubble {
  width: auto;
  max-width: 90%;
}

.chat-message .user-bubble {
  align-self: flex-end;
  :deep(.el-bubble-content-wrapper .el-bubble-content) {
    border-radius: 18px;
    background-color: #f4f4f4;
    padding-top: 10px;
    padding-bottom: 10px;
    max-width: 100%;
  }
}

html.dark .chat-message .user-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content) {
    background: #393939;
    border: #383838 0px solid;
  }
}

.chat-message .ai-bubble {
  align-self: flex-start;
  :deep(.el-bubble-content-wrapper .el-bubble-content) {
    background-color: #ffffff;
    // border: 1px solid #e6e6e6;
    max-width: 100%;
    padding-left: 4px;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-footer) {
    margin-top: 0;
  }
}

html.dark .chat-message .ai-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content) {
    background: #181818;
    // border: 1px solid var(--border-primary);
  }
}

.chat-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: block;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
}

.system-prompt-container {
  width: auto;
  max-width: 90%;
  margin: 8px auto 18px auto;
  align-self: center;
  padding: 8px 15px;
  border-radius: var(--el-border-radius-round);
  border: 1px solid var(--el-border-color-light);
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.system-prompt-container:hover {
  background-color: var(--el-fill-color-lighter);
  border-color: var(--el-color-primary-light-7);
}

.system-prompt-edit-btn {
  margin-left: 10px;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
}

.system-prompt-container:hover .system-prompt-edit-btn {
  opacity: 1;
}


html.dark .system-prompt-container {
  border-color: var(--el-border-color-dark);
}

html.dark .system-prompt-container:hover {
  background-color: var(--el-fill-color-darker);
  border-color: var(--el-color-primary-dark-2);
}

.system-prompt-preview {
  font-size: var(--el-font-size-small);
  color: var(--el-text-color-secondary);
  margin: 0;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
}

.placeholder-text {
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

.markdown-wrapper {
  :deep(.elx-xmarkdown-container) {
    background: transparent !important;
    padding: 0;
    color: var(--text-primary);
    font-size: 15px;
    line-height: 1.7;
    tab-size: 4;
    font-family: ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
    word-break: break-word;
  }

  :deep(.katex) {
    font-size: 1.2em !important;
  }

  :deep(.katex-display > .katex > .katex-html) {
    padding-bottom: 8px !important; /* 为滚动条留出空间，避免遮挡公式 */

    /* For Firefox */
    scrollbar-width: thin;
    scrollbar-color: var(--el-text-color-disabled) transparent;

    /* For Webkit Browsers (Chrome, Edge, Safari) */
    &::-webkit-scrollbar {
      height: 6px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background-color: var(--el-text-color-disabled);
      border-radius: 3px;
    }
    &::-webkit-scrollbar-thumb:hover {
      background-color: var(--el-text-color-secondary);
    }
  }

  :deep(img) {
    max-width: min(50vw, 400px);
    max-height: min(50vh, 300px);
    width: auto;
    height: auto;
    display: inline-block; /* Allow side-by-side display */
    vertical-align: middle; /* Align images nicely on the same line */
    margin: 4px; /* Add space between images */
    border-radius: 8px;
    object-fit: cover; /* Ensure images are nicely cropped */
  }

  :deep(.chat-audio-player) {
    width: 100%;
    min-width: 40vw;
    height: 48px;
    accent-color: var(--text-primary);

    // 移除浏览器默认的边框和背景
    &::-webkit-media-controls-enclosure {
      background: none;
      border-radius: 24px;
    }

    // 设置我们自己的胶囊背景和内边距
    &::-webkit-media-controls-panel {
      background-color: var(--bg-tertiary, #F0F0F0);
      border-radius: 24px;
      padding: 0px;
      justify-content: center; // 让控件居中
    }

    // 设置播放按钮颜色
    &::-webkit-media-controls-play-button {
      color: var(--text-primary);
      border-radius: 50%;
      &:hover {
        background-color: rgba(0, 0, 0, 0.05);
      }
    }

    // 设置时间文本样式
    &::-webkit-media-controls-current-time-display,
    &::-webkit-media-controls-time-remaining-display {
      color: var(--text-secondary);
      font-size: 13px;
      text-shadow: none;
    }

    // 设置进度条轨道样式
    &::-webkit-media-controls-timeline {
      background-color: var(--border-primary, #E5E7EB);
      border-radius: 3px;
      height: 6px;
      margin: 0 10px;
    }

    // 设置音量按钮等其他控件的颜色
    &::-webkit-media-controls-mute-button,
    &::-webkit-media-controls-overflow-button {
      color: var(--text-secondary);
       border-radius: 50%;
      &:hover {
        background-color: rgba(0, 0, 0, 0.05);
      }
    }
  }

  // [样式优化] 暗色模式下的音频播放器样式
  html.dark & :deep(.chat-audio-player) {
    accent-color: var(--text-primary);

    &::-webkit-media-controls-panel {
      background-color: var(--bg-tertiary, #2c2e33);
    }

    // 关键技巧：使用 filter: invert(1) 将黑色的图标和文字变为白色
    &::-webkit-media-controls-play-button,
    &::-webkit-media-controls-mute-button,
    &::-webkit-media-controls-overflow-button,
    &::-webkit-media-controls-current-time-display,
    &::-webkit-media-controls-time-remaining-display {
      filter: invert(1);
    }

    &::-webkit-media-controls-play-button:hover,
    &::-webkit-media-controls-mute-button:hover,
    &::-webkit-media-controls-overflow-button:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }

    &::-webkit-media-controls-timeline {
      background-color: var(--border-primary, #373A40);
    }
  }

  :deep(p:last-of-type) {
    margin-bottom: 0;
  }
  :deep(p) { margin-bottom: 1em; }
  :deep(ul), :deep(ol) { margin-bottom: 1em; }
  :deep(strong), :deep(b) { font-weight: 600 !important; }

  :deep(h1), :deep(h2), :deep(h3), :deep(h4), :deep(h5), :deep(h6) {
    font-weight: 600;
    line-height: 1.25;
    margin-top: 1.5em;
    margin-bottom: 0.8em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #d0d7de;
  }
  :deep(h1) { font-size: 1.8em; }
  :deep(h2) { font-size: 1.5em; }
  :deep(h3) { font-size: 1.3em; }
  :deep(h4) { font-size: 1.15em; }
  :deep(h5) { font-size: 1em; }
  :deep(h6) { font-size: 0.9em; color: #656d76; }

  :deep(blockquote) {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid #b3b3b3;
    background-color: rgba(0, 0, 0, 0.035) !important;
    color: var(--text-secondary);
    border-radius: 0 8px 8px 0;
    html.dark & {
      border-left-color: #656565;
      background-color: rgba(255, 255, 255, 0.05) !important;
    }
  }
  :deep(blockquote p) {
    margin-bottom: 0.5em;
  }
  :deep(blockquote p:last-child) {
    margin-bottom: 0;
  }

  :deep(pre code), :deep(.inline-code-tag) {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
    font-size: 1em;
  }
  :deep(.inline-code-tag) {
    padding: 0.2em 0.4em;
    margin: 0;
    border-radius: 4px;
    background-color: rgba(175, 184, 193, 0.2);
  }

  html:not(.dark) & :deep(pre.shiki) {
    background-color: #f6f8fa !important;
  }

  html.dark & {
    :deep(h1), :deep(h2), :deep(h3), :deep(h4), :deep(h5) { border-bottom-color: #373A40; }
    :deep(h6) { color: #8b949e; }
    :deep(hr) { background-color: #373A40 !important; margin-top: 8px; margin-bottom:8px; }
    :deep(table) { border-color: #373A40; }
    :deep(th) { background-color: #2c2e33; }
    :deep(tr) { background-color: #212327; border-top: 1px solid #373A40; }
    :deep(tr:nth-child(2n)) { background-color: #25272b; }
    :deep(td) { border-color: #373A40; }
    :deep(.pre-md) { border: 0px solid #373A40;}
    // :deep(pre.shiki) { background-color: #171717 !important; }
    :deep(.inline-code-tag) { background-color: rgba(110, 118, 129, 0.4); color: #c9d1d9; }
  }

  :deep(.markdown-mermaid) {
    max-width: 100%;
    overflow-x: auto;
    padding: 5px;
    border-radius: 8px;
    box-sizing: border-box;
    html.dark & {
      background-color: #272727;
      color: var(--el-text-color-primary) !important;
    }
    .mermaid-toolbar {
      border-radius: 0px;
      html.dark & {
        background-color: #272727;
        .el-tabs__nav { background-color: #2c2e33; }
      }
    }
    .mermaid-source-code {
      border: hidden;
      html.dark & { background-color: #171717; color: var(--el-text-color-primary); }
    }
  }

  &.collapsed :deep(.elx-xmarkdown-container) {
    max-height: 3.4em;
    position: relative;
    overflow: hidden;
    -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
    mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  }
}

.editing-wrapper {
  width: 100%;
  min-width: 70vw;
  .el-textarea {
    margin-bottom: 8px;
    :deep(.el-textarea__inner) {
      background-color: #ECECEC;
      box-shadow: none !important;
      border: 1px solid var(--el-border-color-light);
      color: var(--el-text-color-primary);
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
    html.dark & :deep(.el-textarea__inner::-webkit-scrollbar-thumb) {
        background: #6b6b6b;
    }
    html.dark & :deep(.el-textarea__inner::-webkit-scrollbar-thumb:hover) {
        background: #999;
    }
  }
  .editing-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;

    .el-button--primary {
        --el-button-bg-color: var(--bg-accent);
        --el-button-border-color: var(--bg-accent);
        --el-button-text-color: var(--text-on-accent);
    }
    .el-button--primary:hover {
        --el-button-hover-bg-color: var(--bg-accent-light);
        --el-button-hover-border-color: var(--bg-accent-light);
    }
  }
  .edit-shortcut-hint {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    margin-right: auto; /* 关键：这行代码会将提示推到最左边 */
    align-self: center; /* 垂直居中 */
  }
}

html.dark .editing-wrapper {
    .el-textarea :deep(.el-textarea__inner) {
        background-color: #424242;
        border-color: var(--border-primary);
        color: var(--text-primary);
    }
    .editing-actions .el-button--primary {
        --el-button-hover-bg-color: #e0e0e0;
        --el-button-hover-border-color: #e0e0e0;
    }
}

.message-files-vertical-list {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  padding-right: 5px;
  max-height: 150px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 8px !important;
    height: 8px !important;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--el-text-color-disabled, #c0c4cc);
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: content-box;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: var(--el-text-color-secondary, #909399);
    background-clip: content-box;
  }
  .file-button {
    width: auto;
    justify-content: flex-start;
    border: none;
    background-color: var(--el-fill-color-light);
    color: var(--el-color-info);
  }
  .file-button:hover {
    border: none;
    background-color: var(--el-fill-color-lighter);
    color: var(--el-color-info);
  }
}
html.dark .message-files-vertical-list {
  &::-webkit-scrollbar {
    width: 8px !important;
    height: 8px !important;
  }
  &::-webkit-scrollbar-thumb {
    background: #6b6b6b;
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: content-box;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: #999;
  }
  .file-button {
    background-color: var(--el-fill-color-dark);
    color: var(--el-text-color-regular);
  }
  .file-button:hover {
    background-color: var(--el-fill-color-darker);
    color: var(--el-text-color-regular);
  }
}

.user-info-header, .ai-info-header { font-size: 0.8rem; color: var(--el-text-color-secondary); display: flex; align-items: center; margin-bottom: 4px; padding: 0 2px; }
.user-info-header { justify-content: flex-end; }
.ai-info-header { justify-content: space-between; }
.ai-details { display: flex; align-items: center; gap: 6px; flex-shrink: 1; overflow: hidden; }
.ai-name { font-weight: 600; color: var(--el-text-color-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
html.dark .ai-name { color: var(--el-text-color-regular); }
.voice-name { opacity: 0.8; white-space: nowrap; flex-shrink: 0; margin-right: 8px; }

.message-footer { display: flex; justify-content: flex-end; align-items: center; width: 100%; margin-top: 8px; }
.footer-actions { display: flex; align-items: center; gap: 4px; }
.footer-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.user-bubble .footer-actions { margin-left: auto; }
.ai-bubble .footer-actions { margin-right: auto; }
.timestamp { font-size: 0.75rem; color: var(--el-text-color-placeholder); opacity: 0.8; white-space: nowrap; flex-shrink: 0; padding-left: 4px;}

html.dark .ai-bubble :deep(.el-thinking .trigger) { background-color: var(--el-fill-color-darker, #2c2e33); color: var(--el-text-color-primary, #F9FAFB); border-color: var(--el-border-color-dark, #373A40); }
html.dark .ai-bubble :deep(.el-thinking .el-icon) { color: var(--el-text-color-secondary, #A0A5B1); }
html.dark .ai-bubble :deep(.el-thinking-popper) { max-width: 85vw; background-color: var(--bg-tertiary, #2c2e33) !important; border-color: var(--border-primary, #373A40) !important; }
html.dark .ai-bubble :deep(.el-thinking-popper .el-popper__arrow::before) { background: var(--bg-tertiary, #2c2e33) !important; border-color: var(--border-primary, #373A40) !important; }
.ai-bubble :deep(.el-thinking .content pre) { max-width: 100%; margin-bottom: 10px; white-space: pre-wrap; word-break: break-word; box-sizing: border-box; }
html.dark .ai-bubble :deep(.el-thinking .content pre) { background-color: var(--el-fill-color-darker); color: var(--el-text-color-regular, #E5E7EB); border: 1px solid var(--border-primary, #373A40); }

/* MODIFICATION START */
.tool-calls-container {
  margin-top: 10px;
}
/* MODIFICATION END */

.tool-collapse {
  border: none;
  :deep(.el-collapse-item__header) {
    background-color: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    padding: 0 12px;
    height: 36px;
    &.is-active {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }
  }
  :deep(.el-collapse-item__wrap) {
    background-color: transparent;
    border: 1px solid var(--el-border-color-lighter);
    border-top: none;
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
  }
  :deep(.el-collapse-item__content) {
    padding: 12px;
  }
}
html.dark .tool-collapse {
  :deep(.el-collapse-item__header) {
    background-color: var(--el-fill-color-darker);
    border-color: var(--el-border-color-dark);
  }
  :deep(.el-collapse-item__wrap) {
    border-color: var(--el-border-color-dark);
  }
}


.tool-call-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.tool-icon {
  color: var(--el-text-color-secondary);
}
.tool-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.tool-call-details {
  .tool-detail-section {
    margin-bottom: 10px;
    &:last-child {
      margin-bottom: 0;
    }
    strong {
      display: block;
      margin-bottom: 5px;
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }
    pre {
      margin: 0;
      padding: 8px;
      border-radius: 6px;
      background-color: var(--el-fill-color-light);
      max-height: 150px;
      overflow: auto;
      font-size: 12px;
      code {
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
        color: var(--el-text-color-primary);
      }
    }
  }
}
html.dark .tool-call-details {
  .tool-detail-section pre {
    background-color: var(--el-fill-color-darker);
  }
}

.tool-call-details .tool-detail-section pre::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.tool-call-details .tool-detail-section pre::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}
.tool-call-details .tool-detail-section pre::-webkit-scrollbar-thumb {
  background: var(--el-text-color-disabled, #c0c4cc);
  border-radius: 4px;
  border: 2px solid var(--el-fill-color-light);
  background-clip: content-box;
}
.tool-call-details .tool-detail-section pre::-webkit-scrollbar-thumb:hover {
  background: var(--el-text-color-secondary, #909399);
  background-clip: content-box;
}
html.dark .tool-call-details .tool-detail-section pre::-webkit-scrollbar-thumb {
  background: #6b6b6b;
  border-color: var(--el-fill-color-darker);
}
html.dark .tool-call-details .tool-detail-section pre::-webkit-scrollbar-thumb:hover {
  background: #999;
}
</style>