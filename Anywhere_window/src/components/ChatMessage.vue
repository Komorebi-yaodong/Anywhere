<script setup>
import { computed, ref, nextTick } from 'vue';
import { Bubble, Thinking, XMarkdown } from 'vue-element-plus-x';
import { ElTooltip, ElButton, ElInput, ElCollapse, ElCollapseItem, ElIcon, ElCheckbox, ElTag } from 'element-plus';
import { DocumentCopy, Refresh, Delete, Document, CaretTop, CaretBottom, Edit, Check, Close, CloseBold } from '@element-plus/icons-vue';
import 'katex/dist/katex.min.css';
import DOMPurify from 'dompurify';

import { formatTimestamp, formatMessageText, sanitizeToolArgs } from '../utils/formatters.js';

const props = defineProps({
  message: Object,
  index: Number,
  isLastMessage: Boolean,
  isLoading: Boolean,
  userAvatar: String,
  aiAvatar: String,
  isCollapsed: Boolean,
  isDarkMode: Boolean,
  isAutoApprove: Boolean,
});

const emit = defineEmits(['copy-text', 're-ask', 'delete-message', 'toggle-collapse', 'avatar-click', 'edit-message', 'edit-message-requested', 'edit-finished', 'cancel-tool-call', 'confirm-tool', 'reject-tool', 'update-auto-approve']);
const editInputRef = ref(null);
const isEditing = ref(false);
const editedContent = ref('');

// 格式化工具参数为易读的 JSON 字符串
const formatToolArgs = (argsString) => {
  try {
    const sanitized = sanitizeToolArgs(argsString);
    const obj = JSON.parse(sanitized);
    // 2 表示缩进空格数
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return argsString;
  }
};

const preprocessKatex = (text) => {
  if (!text) return '';
  let processedText = text;

  // 1. 替换非标准连字符
  processedText = processedText.replace(/\u2013/g, '-').replace(/\u2014/g, '-');

  // 2. 将 \[ ... \] 转换为 $$ ... $$ (块级公式)
  processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');

  // 3. 将 \( ... \) 转换为 $ ... $ (行内公式)
  processedText = processedText.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$');

  // 4. 将 {align} 和 {equation} 替换为 {aligned}
  // KaTeX 在 $$...$$ 内部通常不支持 align 环境（它是顶级环境）。
  // 使用 aligned 环境可以完美解决渲染问题，同时配合下方的 \tag 模拟显示。
  processedText = processedText.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}');
  processedText = processedText.replace(/\\end\{align\*?\}/g, '\\end{aligned}');
  processedText = processedText.replace(/\\begin\{equation\*?\}/g, '\\begin{aligned}');
  processedText = processedText.replace(/\\end\{equation\*?\}/g, '\\end{aligned}');

  // 5. 模拟 LaTeX \tag{} 显示
  // 由于 aligned 环境不支持原生 \tag，或者 Markdown 渲染器会吞掉反斜杠，
  // 将其替换为右侧间距 + 文本的形式： \qquad \text{(...)}
  processedText = processedText.replace(/(?<!\\)\\tag\s*\{([^{}]+)\}/g, '\\qquad \\text{($1)}');

  return processedText;
};

const mermaidConfig = computed(() => ({
  theme: props.isDarkMode ? 'dark' : 'neutral',
}));

const formatMessageContent = (content, role) => {
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
      } else {
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

const isEditable = computed(() => {
  if (props.message.role === 'user') return true;
  const content = props.message.content;
  if (typeof content === 'string') return true;
  if (Array.isArray(content)) {
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

defineExpose({ switchToEditMode, switchToShowMode });

const finishEdit = (action) => {
  isEditing.value = false;
  emit('edit-finished', {
    id: props.message.id,
    action: action,
    content: editedContent.value
  });
};

const handleEditKeyDown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    finishEdit('cancel');
  } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    finishEdit('save');
  }
};

const renderedMarkdownContent = computed(() => {
  const content = props.message.role ? props.message.content : props.message;
  const role = props.message.role ? props.message.role : 'user';
  let formattedContent = formatMessageContent(content, role);
  formattedContent = preprocessKatex(formattedContent);

  const protectedMap = new Map();
  let placeholderIndex = 0;
  const addPlaceholder = (text) => {
    const placeholder = `__PROTECTED_CONTENT_${placeholderIndex++}__`;
    protectedMap.set(placeholder, text);
    return placeholder;
  };

  // 1. 保护代码块和数学公式不被 DOMPurify 处理
  let processedContent = formattedContent.replace(/(^|[^\\])(`+)([\s\S]*?)\2/g, (match, prefix, delimiter, inner) => {
    return prefix + addPlaceholder(delimiter + inner + delimiter);
  });
  processedContent = processedContent.replace(/(\$\$)([\s\S]*?)(\$\$)/g, (match) => addPlaceholder(match));
  processedContent = processedContent.replace(/(\$)(?!\s)([^$\n]+?)(?<!\s)(\$)/g, (match) => addPlaceholder(match));
  processedContent = processedContent.replace(/(^|[^\\])\*\*([^\n]+?)\*\*/g, '$1<strong>$2</strong>');

  // 2. 进行 HTML 清洗
  let sanitizedPart = DOMPurify.sanitize(processedContent, {
    ADD_TAGS: ['video', 'audio', 'source'],
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_ATTR: ['style']
  });

  // 全局将 &gt; 恢复为 >
  // DOMPurify 会将 Markdown 的引用符号 ">" 转义为 "&gt;"，导致无法渲染为引用块。
  // 这里将其还原。由于我们不还原 &lt; (<)，所以不会引入 XSS 风险（无法构造 <script> 标签）。
  sanitizedPart = sanitizedPart.replace(/&gt;/g, '>');

  // 3. 恢复受保护的内容（代码块等）
  const finalContent = sanitizedPart.replace(/__PROTECTED_CONTENT_\d+__/g, (placeholder) => {
    return protectedMap.get(placeholder) || placeholder;
  });

  if (!finalContent && props.message.role === 'assistant') return ' ';
  return finalContent || ' ';
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
  <div class="chat-message" v-if="message.role !== 'system'">

    <!-- 用户消息 -->
    <div v-if="message.role === 'user'" class="message-wrapper user-wrapper">
      <div class="message-meta-header user-meta-header">
        <span class="timestamp" v-if="message.timestamp">{{ formatTimestamp(message.timestamp) }}</span>
        <img :src="userAvatar" alt="User Avatar" @click="onAvatarClick('user', $event)"
          class="chat-avatar-top user-avatar">
      </div>

      <Bubble class="user-bubble" placement="end" shape="corner" maxWidth="100%">
        <template #content>
          <div v-if="!isEditing" class="markdown-wrapper" :class="{ 'collapsed': isCollapsed }">
            <XMarkdown :markdown="renderedMarkdownContent" :is-dark="isDarkMode" :enable-latex="true"
              :mermaid-config="mermaidConfig" :default-theme-mode="isDarkMode ? 'dark' : 'light'"
              :themes="{ light: 'github-light', dark: 'github-dark-default' }" :allow-html="true" />
          </div>
          <div v-else class="editing-wrapper">
            <el-input ref="editInputRef" v-model="editedContent" type="textarea" :autosize="{ minRows: 1, maxRows: 15 }"
              resize="none" @keydown="handleEditKeyDown" />
            <div class="editing-actions">
              <span class="edit-shortcut-hint">Ctrl+Enter 确认 / Esc 取消</span>
              <el-button :icon="Check" @click="finishEdit('save')" size="small" circle type="primary" />
              <el-button :icon="Close" @click="finishEdit('cancel')" size="small" circle />
            </div>
          </div>
        </template>
        <template #footer>
          <div class="message-footer">
            <div class="footer-wrapper">
              <div class="footer-actions">
                <el-button :icon="DocumentCopy" @click="onCopy" size="small" circle />
                <el-button v-if="isEditable" :icon="Edit" @click="emit('edit-message-requested', index)" size="small"
                  circle />
                <el-button v-if="shouldShowCollapseButton" :icon="isCollapsed ? CaretBottom : CaretTop"
                  @click="onToggleCollapse($event)" size="small" circle />
                <el-button v-if="isLastMessage" :icon="Refresh" @click="onReAsk" size="small" circle />
                <el-button :icon="Delete" size="small" @click="onDelete" circle />
              </div>
              <div class="message-files-vertical-list" v-if="formatMessageFile(message.content).length > 0">
                <el-tooltip v-for="(file_name, idx) in formatMessageFile(message.content)" :key="idx"
                  :content="file_name" placement="top" :disabled="file_name.length < 30"
                  :popper-style="{ maxWidth: '30vw', wordBreak: 'break-all' }">
                  <el-button class="file-button" type="info" plain size="small" :icon="Document">{{
                    truncateFilename(file_name, 20) }}</el-button>
                </el-tooltip>
              </div>
            </div>
          </div>
        </template>
      </Bubble>
    </div>

    <!-- AI 消息 -->
    <div v-if="message.role === 'assistant'" class="message-wrapper ai-wrapper">
      <div class="message-meta-header ai-meta-header">
        <img :src="aiAvatar" alt="AI Avatar" @click="onAvatarClick('assistant', $event)"
          class="chat-avatar-top ai-avatar">
        <div class="meta-info-column">
          <div class="meta-name-row">
            <span class="ai-name">{{ message.aiName }}</span>
            <span v-if="message.voiceName" class="voice-name">({{ message.voiceName }})</span>
          </div>
          <span class="timestamp-row" v-if="message.completedTimestamp">{{ formatTimestamp(message.completedTimestamp)
          }}</span>
        </div>
      </div>

      <Bubble class="ai-bubble" placement="start" shape="corner" maxWidth="100%"
        :loading="isLastMessage && isLoading && renderedMarkdownContent === ' ' && (!message.tool_calls || message.tool_calls.length === 0)">
        <template #header>
          <Thinking v-if="message.reasoning_content && message.reasoning_content.trim().length > 0" maxWidth="90%"
            :content="(message.reasoning_content || '').trim()" :modelValue="false" :status="message.status">
          </Thinking>
        </template>
        <template #content>
          <div v-if="!isEditing" class="markdown-wrapper" :class="{ 'collapsed': isCollapsed }">
            <XMarkdown :markdown="renderedMarkdownContent" :is-dark="isDarkMode" :enable-latex="true"
              :mermaid-config="mermaidConfig" :default-theme-mode="isDarkMode ? 'dark' : 'light'"
              :themes="{ light: 'one-light', dark: 'vesper' }" :allow-html="true" />
          </div>
          <div v-else class="editing-wrapper">
            <el-input ref="editInputRef" v-model="editedContent" type="textarea" :autosize="{ minRows: 1, maxRows: 15 }"
              resize="none" @keydown="handleEditKeyDown" />
            <div class="editing-actions">
              <span class="edit-shortcut-hint">Ctrl+Enter 确认 / Esc 取消</span>
              <el-button :icon="Check" @click="finishEdit('save')" size="small" circle type="primary" />
              <el-button :icon="Close" @click="finishEdit('cancel')" size="small" circle />
            </div>
          </div>
          <div v-if="message.tool_calls && message.tool_calls.length > 0" class="tool-calls-container">
            <div v-for="toolCall in message.tool_calls" :key="toolCall.id" class="single-tool-wrapper">
              <el-collapse class="tool-collapse"
                :model-value="(!isAutoApprove && (toolCall.approvalStatus === 'waiting' || toolCall.approvalStatus === 'executing')) ? [toolCall.id] : []">
                <el-collapse-item :name="toolCall.id">
                  <template #title>
                    <div class="tool-call-title">
                      <el-icon class="tool-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="m15 12-8.373 8.373a1 1 0 0 1-3-3L12 9"></path>
                          <path d="m18 15 4-4"></path>
                          <path
                            d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5">
                          </path>
                        </svg>
                      </el-icon>
                      <span class="tool-name">{{ toolCall.name }}</span>
                      <div class="tool-header-right">
                        <el-tag v-if="toolCall.approvalStatus === 'waiting'" type="warning" size="small" effect="light"
                          round>等待批准</el-tag>
                        <el-tag v-else-if="toolCall.approvalStatus === 'executing'" type="primary" size="small"
                          effect="light" round>执行中</el-tag>
                        <el-tag v-else-if="toolCall.approvalStatus === 'rejected'" type="danger" size="small"
                          effect="plain" round>已拒绝</el-tag>
                        <el-tag v-else-if="toolCall.approvalStatus === 'finished'" type="success" size="small"
                          effect="plain" round>完成</el-tag>
                        <el-tooltip content="停止执行" placement="top" v-if="toolCall.approvalStatus === 'executing'">
                          <div class="stop-btn-wrapper" @click.stop="$emit('cancel-tool-call', toolCall.id)">
                            <el-icon>
                              <CloseBold />
                            </el-icon>
                          </div>
                        </el-tooltip>
                      </div>
                    </div>
                  </template>
                  <div class="tool-call-details">
                    <div class="tool-detail-section">
                      <strong>参数:</strong>
                      <pre><code>{{ formatToolArgs(toolCall.args) }}</code></pre>
                    </div>
                    <div class="tool-detail-section"
                      v-if="toolCall.result && toolCall.result !== '等待批准...' && toolCall.result !== '执行中...'">
                      <strong>结果:</strong>
                      <div class="tool-result-wrapper">
                        <pre><code>{{ toolCall.result }}</code></pre>
                      </div>
                    </div>
                  </div>
                </el-collapse-item>
              </el-collapse>
              <div v-if="toolCall.approvalStatus === 'waiting'" class="tool-approval-actions">
                <div class="actions-left">
                  <el-button type="primary" size="small" :icon="Check"
                    @click="$emit('confirm-tool', toolCall.id, true)">确认</el-button>
                  <el-button size="small" :icon="Close" @click="$emit('reject-tool', toolCall.id, false)">取消</el-button>
                </div>
                <div class="actions-right">
                  <el-checkbox :model-value="isAutoApprove" @change="(val) => $emit('update-auto-approve', val)"
                    label="自动批准后续调用" size="small" />
                </div>
              </div>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="message-footer">
            <div class="footer-actions">
              <el-button :icon="DocumentCopy" @click="onCopy" size="small" circle />
              <el-button v-if="isEditable" :icon="Edit" @click="emit('edit-message-requested', index)" size="small"
                circle />
              <el-button v-if="shouldShowCollapseButton" :icon="isCollapsed ? CaretBottom : CaretTop"
                @click="onToggleCollapse($event)" size="small" circle />
              <el-button v-if="isLastMessage" :icon="Refresh" @click="onReAsk" size="small" circle />
              <el-button :icon="Delete" size="small" @click="onDelete" circle />
            </div>
          </div>
        </template>
      </Bubble>
    </div>
  </div>
</template>

<style scoped lang="less">
/* 使用与原文件相同的样式 */
.chat-message {
  margin: 15px 0 0 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  padding: 0px;
}

.message-wrapper {
  display: flex;
  flex-direction: column;
}

.user-wrapper {
  align-self: flex-end;
  align-items: flex-end;
  max-width: 90%;
  margin-right: 4%;
  margin-left: 5%;
}

.ai-wrapper {
  align-self: flex-start;
  align-items: flex-start;
  margin-left: 5%;
  margin-right: 5%;
  max-width: 100%;
}

.message-meta-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.user-meta-header {
  flex-direction: row;
  margin-bottom: 8px;
}

.ai-meta-header {
  flex-direction: row;
  align-items: flex-start;
}

.meta-info-column {
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1.3;
}

.meta-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.timestamp-row {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 1px;
}

.chat-avatar-top {
  width: 32px;
  height: 32px;
  cursor: pointer;
  object-fit: cover;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.1);
  }
}

.user-avatar {
  border-radius: 50%;
}

.ai-avatar {
  border-radius: 6px;
}

.ai-name {
  font-weight: 700;
  font-size: 13px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-message .user-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content) {
    border-radius: 18px;
    background-color: var(--el-bg-color-userbubble);
    padding-top: 10px;
    padding-bottom: 10px;
    margin-bottom: 0px;
    padding-right: 14px;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-footer) {
    margin-top: 0;
  }
}

html.dark .chat-message .user-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content) {
    background: #393939;
    border: #383838 0px solid;
  }
}

.chat-message .ai-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content) {
    background-color: transparent;
    padding-left: 4px;
    padding-right: 0px;
    padding-bottom: 2px;
    padding-top: 4px;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-footer) {
    margin-top: 0;
  }
}

html.dark .chat-message .ai-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content) {
    background: var(--el-bg-color);
  }
}

.markdown-wrapper {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);

  :deep(.elx-xmarkdown-container) {
    background: transparent !important;
    padding: 0;
    color: var(--text-primary);
    font-size: 14px;
    line-height: 1.5;
    tab-size: 4;
    font-family: ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
    word-break: break-word;
  }

  :deep(pre) {
    max-width: 100%;
    overflow-x: auto;
    white-space: pre;
    box-sizing: border-box;
    border-radius: 6px;
  }

  :deep(.katex) {
    font-size: 1.2em !important;
  }

  :deep(.katex-display > .katex > .katex-html) {
    padding-bottom: 8px !important;
    scrollbar-width: thin;
    scrollbar-color: var(--el-text-color-disabled) transparent;

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
    display: inline-block;
    vertical-align: middle;
    margin: 4px;
    border-radius: 8px;
    object-fit: cover;
  }

  :deep(.chat-audio-player) {
    width: 100%;
    min-width: 40vw;
    height: 48px;
    accent-color: var(--text-primary);

    &::-webkit-media-controls-enclosure {
      background: none;
      border-radius: 24px;
    }

    &::-webkit-media-controls-panel {
      background-color: var(--bg-tertiary, #F0F0F0);
      border-radius: 24px;
      padding: 0 10px 0 10px;
      justify-content: center;
    }

    &::-webkit-media-controls-play-button {
      color: var(--text-primary);
      border-radius: 50%;

      &:hover {
        background-color: rgba(0, 0, 0, 0.05);
      }
    }

    &::-webkit-media-controls-current-time-display,
    &::-webkit-media-controls-time-remaining-display {
      color: var(--text-secondary);
      font-size: 13px;
      text-shadow: none;
    }

    &::-webkit-media-controls-timeline {
      border-radius: 3px;
      height: 6px;
      margin: 0 10px;
    }

    &::-webkit-media-controls-mute-button,
    &::-webkit-media-controls-overflow-button {
      color: var(--text-secondary);
      border-radius: 50%;

      &:hover {
        background-color: rgba(0, 0, 0, 0.05);
      }
    }
  }

  html.dark & :deep(.chat-audio-player) {
    accent-color: var(--text-primary);

    &::-webkit-media-controls-panel {
      background-color: var(--bg-tertiary, #2c2e33);
    }

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
      background-color: transparent;
    }
  }

  :deep(p:last-of-type) {
    margin-bottom: 0;
  }

  :deep(p) {
    margin-bottom: 1em;
  }

  :deep(ul),
  :deep(ol) {
    margin-bottom: 1em;
  }

  :deep(strong),
  :deep(b) {
    font-weight: 600 !important;
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    font-weight: 600;
    line-height: 1.25;
    margin-top: 0.5em;
    margin-bottom: 0.8em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #d0d7de;
  }

  :deep(h1) {
    font-size: 1.8em;
  }

  :deep(h2) {
    font-size: 1.5em;
  }

  :deep(h3) {
    font-size: 1.3em;
  }

  :deep(h4) {
    font-size: 1.15em;
  }

  :deep(h5) {
    font-size: 1em;
  }

  :deep(h6) {
    font-size: 0.9em;
    color: #656d76;
  }

  :deep(blockquote) {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid #b3b3b3;
    background-color: rgba(0, 0, 0, 0.035) !important;
    color: var(--el-text-color-secondary);
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

  :deep(pre code),
  :deep(.inline-code-tag) {
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

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4),
    :deep(h5) {
      border-bottom-color: #373A40;
    }

    :deep(h6) {
      color: #8b949e;
    }

    :deep(hr) {
      background-color: #373A40 !important;
      margin-top: 8px;
      margin-bottom: 8px;
    }

    :deep(table) {
      display: block;
      overflow-x: auto;
      width: 100%;
      max-width: 100%;
      border-spacing: 0;
      border-collapse: collapse;
      margin-bottom: 1em;

      /* 优化表格滚动条样式 */
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

    :deep(th) {
      background-color: #2c2e33;
      min-width: 60px;
    }

    :deep(tr) {
      background-color: #212327;
      border-top: 1px solid #373A40;
    }

    :deep(tr:nth-child(2n)) {
      background-color: #25272b;
    }

    :deep(td) {
      border-color: #373A40;
      min-width: 60px;
    }

    :deep(.pre-md) {
      border: 0px solid #373A40;
    }

    :deep(.inline-code-tag) {
      background-color: rgba(110, 118, 129, 0.4);
      color: #c9d1d9;
    }
  }

  :deep(.markdown-mermaid) {
    background-color: transparent;
    max-width: 100%;
    overflow-x: auto;
    padding: 5px;
    border-radius: 8px;
    box-sizing: border-box;

    .mermaid-content {
      background-color: rgba(245, 245, 245, 0.5);
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
    }

    html.dark & {
      color: var(--el-text-color-primary) !important;
    }

    .toolbar-container {
      border-radius: 18px;
    }

    .mermaid-toolbar {
      border-top-left-radius: 8px;
      border-top-right-radius: 8px;

      html.dark & {
        background-color: rgba(39, 39, 39, 1);

        .el-tabs__nav {
          background-color: #2c2e33;
        }
        .el-tabs__item.is-active {
          color: #202123 !important;
        }
        .el-tabs__item:hover {
          color: #202123 !important;
        }
      }
    }

    .mermaid-source-code {
      border: hidden;
      border-top-left-radius: 0px;
      border-top-right-radius: 0px;
      background-color: rgba(248, 249, 250, 0.5);
      padding-bottom: 0px;

      &::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }

      &::-webkit-scrollbar-thumb {
        background-color: var(--el-border-color-darker, #4C4D4F);
        border-radius: 4px;
      }

      &::-webkit-scrollbar-thumb:hover {
        background-color: var(--el-text-color-secondary);
      }

      &::-webkit-scrollbar-corner {
        background: transparent;
      }

      html.dark & {
        background-color: rgba(23, 23, 23, 0.5);
        color: var(--el-text-color-primary);
      }
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
    margin-right: auto;
    align-self: center;
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

.ai-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

html.dark .ai-name {
  color: var(--el-text-color-regular);
}

.voice-name {
  opacity: 0.8;
  white-space: nowrap;
  flex-shrink: 0;
  margin-right: 8px;
}

.message-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
  margin-top: 8px;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 0px;
}

.footer-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.user-bubble .footer-actions {
  margin-left: auto;
}

.ai-bubble .footer-actions {
  margin-right: auto;
}

.timestamp {
  margin-top: 12px;
  font-size: 0.75rem;
  opacity: 0.8;
  white-space: nowrap;
  flex-shrink: 0;
}

html.dark .ai-bubble :deep(.el-thinking .trigger) {
  background-color: var(--el-fill-color-darker, #2c2e33);
  color: var(--el-text-color-primary, #F9FAFB);
  border-color: var(--el-border-color-dark, #373A40);
}

html.dark .ai-bubble :deep(.el-thinking .el-icon) {
  color: var(--el-text-color-secondary, #A0A5B1);
}

html.dark .ai-bubble :deep(.el-thinking-popper) {
  max-width: 85vw;
  background-color: var(--bg-tertiary, #2c2e33) !important;
  border-color: var(--border-primary, #373A40) !important;
}

html.dark .ai-bubble :deep(.el-thinking-popper .el-popper__arrow::before) {
  background: var(--bg-tertiary, #2c2e33) !important;
  border-color: var(--border-primary, #373A40) !important;
}

.ai-bubble :deep(.el-thinking .content pre) {
  max-width: 100%;
  margin-bottom: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  box-sizing: border-box;
}

html.dark .ai-bubble :deep(.el-thinking .content pre) {
  background-color: var(--el-fill-color-darker);
  color: var(--el-text-color-regular, #E5E7EB);
  border: 1px solid var(--border-primary, #373A40);
}

.tool-calls-container {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.single-tool-wrapper {
  width: 100%;
  max-width: 85vw;
  min-width: 250px;
  display: flex;
  flex-direction: column;
}

.tool-collapse {
  width: 100%;
  border: none;
  --el-collapse-header-height: 38px;

  :deep(.el-collapse-item__header) {
    background-color: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    padding: 0 12px;
    font-size: 13px;
    transition: border-radius 0.2s;

    &:active {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      border-bottom-color: transparent;
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

.tool-call-title {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
}

.tool-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.tool-icon {
  color: var(--el-text-color-secondary);
}

.tool-header-right {
  margin-left: auto;
  margin-right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.stop-btn-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: var(--el-text-color-primary);
  color: var(--el-bg-color);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);

  &:hover {
    opacity: 0.85;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  &:active {
    transform: scale(0.95);
  }
}

html.dark .stop-btn-wrapper {
  background-color: #E5EAF3;
  color: #141414;

  &:hover {
    background-color: #ffffff;
  }
}

.tool-approval-actions {
  margin-top: -2px;
  margin-left: 1px;
  margin-right: 1px;
  padding: 8px 12px;
  background-color: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-top: 1px dashed var(--el-border-color-lighter);
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  animation: slide-in 0.2s ease-out;
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.actions-left {
  display: flex;
  gap: 10px;
}

.actions-right {
  margin-left: auto;

  :deep(.el-checkbox__label) {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
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
      white-space: pre-wrap; 
      word-break: break-all;

      code {
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
        color: var(--el-text-color-primary);
      }
    }
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

.tool-result-wrapper {
  display: flex;
  align-items: flex-start;
}

.tool-result-wrapper pre {
  flex-grow: 1;
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

html.dark .stop-btn-wrapper:hover {
  background-color: rgba(245, 108, 108, 0.2);
  color: #F56C6C;
}

html.dark .tool-approval-actions {
  background-color: var(--el-fill-color-dark);
  border-color: var(--el-border-color-dark);
  border-top-color: var(--el-border-color-dark);
}

html.dark .tool-call-details {
  .tool-detail-section pre {
    background-color: var(--el-fill-color-darker);
  }
}

html.dark .tool-call-details .tool-detail-section pre::-webkit-scrollbar-thumb {
  background: #6b6b6b;
  border-color: var(--el-fill-color-darker);
}

html.dark .tool-call-details .tool-detail-section pre::-webkit-scrollbar-thumb:hover {
  background: #999;
}
</style>