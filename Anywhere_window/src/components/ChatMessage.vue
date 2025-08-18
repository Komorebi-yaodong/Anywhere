<script setup>
import { computed } from 'vue';
import { Bubble, Thinking } from 'vue-element-plus-x';
import { ElTooltip, ElButton } from 'element-plus';
import { DocumentCopy, Refresh, Delete, Document, CaretTop, CaretBottom } from '@element-plus/icons-vue'
import 'katex/dist/katex.min.css';
import MarkdownIt from 'markdown-it';
import mdKatex from '@iktakahiro/markdown-it-katex';

import hljs from 'highlight.js/lib/core';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import php from 'highlight.js/lib/languages/php';
import rust from 'highlight.js/lib/languages/rust';
import markdown from 'highlight.js/lib/languages/markdown';

// Register languages
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);
hljs.registerLanguage('php', php);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('markdown', markdown);

const props = defineProps({
  message: Object,
  index: Number,
  isLastMessage: Boolean,
  isLoading: Boolean,
  userAvatar: String,
  aiAvatar: String,
  isCollapsed: Boolean
});

const emit = defineEmits(['copy-text', 're-ask', 'delete-message', 'toggle-collapse', 'show-system-prompt', 'avatar-click']);

const preprocessKatex = (text) => {
  if (!text) return '';
  let processedText = text;
  // Standardize dashes to prevent misinterpretation
  processedText = processedText.replace(/\u2013/g, '-').replace(/\u2014/g, '-');
  
  // Convert display math \[...\] to $$...$$
  processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');
  // Convert inline math \(...\) to $...$
  processedText = processedText.replace(/\\\(\s*(.*?)\s*\\\)/g, '$$$1$');

  // [FIX] Correctly handle single-dollar delimited inline math.
  // This new regex is less greedy and prevents matching across newlines or capturing
  // non-formula text between two separate formulas.
  processedText = processedText.replace(/(?<![$\\])\$([^$\n]+?)\$(?!\$)/g, (match, content) => {
      // Re-wrap with single dollars to ensure consistent parsing by markdown-it-katex
      return `$${content.trim()}$`;
  });

  return processedText;
};

const formatTimestamp = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const datePart = date.toLocaleDateString('sv-SE'); // Gets YYYY-MM-DD
    const timePart = date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }); // Gets HH:MM
    return `${datePart} ${timePart}`;
  } catch (e) {
    return ''; // Return empty if date is invalid
  }
};


const md = new MarkdownIt({
  html: true, linkify: true, typographer: false, breaks: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try { return '<pre class="hljs"><code>' + hljs.highlight(str, { language: lang, ignoreIllegals: true }).value + '</code></pre>'; } catch (__) { }
    }
    return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
  }
}).use(mdKatex, {
  strict: (errorCode) => {
    if (errorCode === 'newLineInDisplayMode') return 'ignore';
    return 'warn';
  }
});

const formatMessageContent = (content) => {
  if (!content) return "";
  if (!Array.isArray(content)) { if (String(content).toLowerCase().startsWith('file name:') && String(content).toLowerCase().endsWith('file end')) return ""; else return String(content); }
  let markdownString = "";
  content.forEach(part => {
    if (part.type === 'text' && part.text && part.text.toLowerCase().startsWith('file name:') && part.text.toLowerCase().endsWith('file end')) { }
    else if (part.type === 'image_url' && part.image_url?.url) markdownString += `\n\n![Image](${part.image_url.url})\n`;
    else if (part.type === 'input_audio' && part.input_audio?.data) markdownString += `\n\n<audio id="audio" controls="" preload="none">\n<source id="${part.input_audio.format}" src="data:audio/${part.input_audio.format};base64,${part.input_audio.data}">\n</audio>\n`;
    else if (part.type === 'text' && part.text) markdownString += part.text;
  });
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
  if (!Array.isArray(content)) return String(content);
  let textString = "";
  content.forEach(part => { if (!(part.type === 'text' && part.text && part.text.toLowerCase().startsWith('file name:') && part.text.toLowerCase().endsWith('file end'))) { if (part.type === 'text' && part.text) textString += part.text; } });
  return textString.trim().trimEnd();
}


const renderMarkdown = (message) => {
  const content = message.role ? message.content : message;
  let formattedContent = formatMessageContent(content);
  formattedContent = preprocessKatex(formattedContent);
  if (!formattedContent && message.role === 'assistant') return '...';
  return md.render(formattedContent || ' ');
};

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
  if (typeof filename !== 'string' || filename.length <= maxLength) {
    return filename;
  }
  const ellipsis = '...';
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex < 10) { // 如果没有扩展名或文件名太短
    return filename.substring(0, maxLength - ellipsis.length) + ellipsis;
  }
  const nameWithoutExt = filename.substring(0, lastDotIndex);
  const extension = filename.substring(lastDotIndex);
  const charsToKeep = maxLength - extension.length - ellipsis.length;
  if (charsToKeep < 1) {
    return ellipsis + extension; // 如果扩展名本身就很长
  }
  return nameWithoutExt.substring(0, charsToKeep) + ellipsis + extension;
};
</script>

<template>
  <div class="chat-message">
    <div v-if="message.role === 'system'" class="system-prompt-container" @click="onShowSystemPrompt">
      <p class="system-prompt-preview">{{ String(message.content) }}</p>
    </div>

    <Bubble v-if="message.role === 'user'" class="user-bubble" placement="end" shape="corner" variant="shadow"
      maxWidth="2000px" avatar-size="40px">
      <template #avatar>
        <img :src="userAvatar" alt="User Avatar" @click="onAvatarClick('user', $event)" class="chat-avatar">
      </template>
      <template #header>
        <div class="user-info-header">
          <span class="timestamp" v-if="message.timestamp">{{ formatTimestamp(message.timestamp) }}</span>
        </div>
      </template>
      <template #content>
        <div class="markdown-body" :class="{ 'collapsed': isCollapsed }" v-html="renderMarkdown(message)"></div>
      </template>
      <template #footer>
        <div class="message-footer">
          <!-- Timestamp removed from here -->
          <div class="footer-actions">
            <div class="file-list-container" v-if="formatMessageFile(message.content).length > 0">
              <el-tooltip v-for="(file_name, idx) in formatMessageFile(message.content)" :key="idx" :content="file_name"
                placement="top" :disabled="file_name.length < 20">
                <el-button class="file-button" type="info" plain size="small" :icon="Document">{{truncateFilename(file_name)}}</el-button>
              </el-tooltip>
            </div>
            <el-button :icon="DocumentCopy" @click="onCopy" size="small" circle />
            <el-button v-if="shouldShowCollapseButton" :icon="isCollapsed ? CaretBottom : CaretTop"
              @click="onToggleCollapse($event)" size="small" circle />
            <el-button v-if="isLastMessage" :icon="Refresh" @click="onReAsk" size="small" circle />
            <el-button :icon="Delete" size="small" @click="onDelete" circle />
          </div>
        </div>
      </template>
    </Bubble>

    <Bubble v-if="message.role === 'assistant'" class="ai-bubble" placement="start" shape="corner" variant="shadow"
      maxWidth="2000px" avatar-size="40px">
      <template #avatar>
        <img :src="aiAvatar" alt="AI Avatar" @click="onAvatarClick('assistant', $event)" class="chat-avatar">
      </template>
      <template #header>
        <div class="ai-info-header">
          <div class="ai-details">
            <span class="ai-name">{{ message.aiName }}</span>
            <span v-if="message.voiceName" class="voice-name">({{ message.voiceName }})</span>
          </div>
          <span class="timestamp" v-if="message.completedTimestamp">{{ formatTimestamp(message.completedTimestamp)
            }}</span>
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
        <div class="markdown-body" :class="{ 'collapsed': isCollapsed }" v-html="renderMarkdown(message)"></div>
      </template>
      <template #footer>
        <div class="message-footer">
          <div class="footer-actions">
            <el-button :icon="DocumentCopy" @click="onCopy" size="small" circle />
            <el-button v-if="shouldShowCollapseButton" :icon="isCollapsed ? CaretBottom : CaretTop"
              @click="onToggleCollapse($event)" size="small" circle />
            <el-button v-if="isLastMessage" :icon="Refresh" @click="onReAsk" size="small" circle />
            <el-button :icon="Delete" size="small" @click="onDelete" circle />
          </div>
          <!-- Timestamp removed from here -->
        </div>
      </template>
    </Bubble>
  </div>
</template>

<style>
html.dark .katex {
  color: var(--el-text-color-regular) !important;
}

.katex-display {
  margin: 0.5em 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 0.5em;
}

.katex-display::-webkit-scrollbar {
  height: 6px;
}

.katex-display::-webkit-scrollbar-track {
  background: transparent;
}

.katex-display::-webkit-scrollbar-thumb {
  background-color: var(--el-text-color-disabled);
  border-radius: 3px;
  border: 1px solid transparent;
  background-clip: content-box;
}

.katex-display::-webkit-scrollbar-thumb:hover {
  background-color: var(--el-text-color-secondary);
}

html.dark .katex-display::-webkit-scrollbar-thumb {
  background-color: #6b6b6b;
}

html.dark .katex-display::-webkit-scrollbar-thumb:hover {
  background-color: #999;
}

.hljs {
  color: #24292e;
  background: #FFFFFF
}

.hljs-doctag,
.hljs-keyword,
.hljs-meta .hljs-keyword,
.hljs-template-tag,
.hljs-template-variable,
.hljs-type,
.hljs-variable.language_ {
  color: #d73a49
}

.hljs-title,
.hljs-title.class_,
.hljs-title.class_.inherited__,
.hljs-title.function_ {
  color: #6f42c1
}

.hljs-attr,
.hljs-attribute,
.hljs-literal,
.hljs-meta,
.hljs-number,
.hljs-operator,
.hljs-selector-attr,
.hljs-selector-class,
.hljs-selector-id,
.hljs-variable {
  color: #005cc5
}

.hljs-meta .hljs-string,
.hljs-regexp,
.hljs-string {
  color: #032f62
}

.hljs-built_in,
.hljs-symbol {
  color: #e36209
}

.hljs-code,
.hljs-comment,
.hljs-formula {
  color: #6a737d
}

.hljs-name,
.hljs-quote,
.hljs-selector-pseudo,
.hljs-selector-tag {
  color: #22863a
}

.hljs-subst {
  color: #24292e
}

.hljs-section {
  color: #005cc5;
  font-weight: 700
}

.hljs-bullet {
  color: #735c0f
}

.hljs-emphasis {
  color: #24292e;
  font-style: italic
}

.hljs-strong {
  color: #24292e;
  font-weight: 700
}

.hljs-addition {
  color: #22863a;
  background-color: #f0fff4
}

.hljs-deletion {
  color: #b31d28;
  background-color: #ffeef0
}

html.dark .hljs {
  background: #1F1F1F;
  color: #d4d4d4;
}

html.dark .hljs-doctag,
html.dark .hljs-keyword,
html.dark .hljs-meta .hljs-keyword,
html.dark .hljs-template-tag,
html.dark .hljs-template-variable,
html.dark .hljs-type,
html.dark .hljs-variable.language_ {
  color: #569cd6;
}

html.dark .hljs-title,
html.dark .hljs-title.class_,
html.dark .hljs-title.class_.inherited__,
html.dark .hljs-title.function_ {
  color: #dcdcaa;
}

html.dark .hljs-attr,
html.dark .hljs-attribute,
html.dark .hljs-literal,
html.dark .hljs-meta,
html.dark .hljs-number,
html.dark .hljs-operator,
html.dark .hljs-selector-attr,
html.dark .hljs-selector-class,
html.dark .hljs-selector-id,
html.dark .hljs-variable {
  color: #9cdcfe;
}

html.dark .hljs-meta .hljs-string,
html.dark .hljs-regexp,
html.dark .hljs-string {
  color: #ce9178;
}

html.dark .hljs-built_in,
html.dark .hljs-symbol {
  color: #4ec9b0;
}

html.dark .hljs-code,
html.dark .hljs-comment,
html.dark .hljs-formula {
  color: #6a9955;
}

html.dark .hljs-name,
html.dark .hljs-quote,
html.dark .hljs-selector-pseudo,
html.dark .hljs-selector-tag {
  color: #c586c0;
}

html.dark .hljs-subst {
  color: #d4d4d4;
}

html.dark .hljs-section {
  color: #569cd6;
  font-weight: 700;
}

html.dark .hljs-bullet {
  color: #ce9178;
}

html.dark .hljs-emphasis {
  color: #d4d4d4;
  font-style: italic;
}

html.dark .hljs-strong {
  color: #d4d4d4;
  font-weight: 700;
}

html.dark .hljs-addition {
  color: #aff5b4;
  background-color: #043927;
}

html.dark .hljs-deletion {
  color: #ffdcd7;
  background-color: #67060c;
}

pre.hljs::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

pre.hljs::-webkit-scrollbar-track {
  background: #FFFFFF;
}

pre.hljs::-webkit-scrollbar-thumb {
  background-color: #d0d7de;
  border-radius: 6px;
  border: 3px solid #FFFFFF;
}

pre.hljs::-webkit-scrollbar-thumb:hover {
  background-color: #afb8c1;
}

pre.hljs::-webkit-scrollbar-corner {
  background-color: #FFFFFF;
}

html.dark pre.hljs::-webkit-scrollbar-track {
  background: #1F1F1F;
}

html.dark pre.hljs::-webkit-scrollbar-thumb {
  background-color: #4f4f4f;
  border-radius: 6px;
  border: 3px solid #1F1F1F;
}

html.dark pre.hljs::-webkit-scrollbar-thumb:hover {
  background-color: #6a6a6a;
}

html.dark pre.hljs::-webkit-scrollbar-corner {
  background-color: #1F1F1F;
}

.chat-message .markdown-body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  font-size: var(--el-font-size-base);
  line-height: 1.7;
  word-wrap: break-word;
  color: var(--el-text-color-primary);
  max-width: 80vw;
  overflow-x: hidden;
  overflow-y: hidden;
  transition: max-height 0.3s ease-in-out;
}

.chat-message .markdown-body.collapsed {
  max-height: 3.4em;
  position: relative;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
}

.chat-message .markdown-body p {
  margin-top: 0;
  margin-bottom: 12px;
}

.chat-message .markdown-body p:last-child {
  margin-bottom: 0;
}

.chat-message .markdown-body pre.hljs,
.chat-message .markdown-body p>code:not(.hljs),
.chat-message .markdown-body li>code:not(.hljs) {
  &,
  * {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
  }
}

.chat-message .markdown-body pre.hljs {
  display: block;
  overflow: auto;
  padding: 1em;
  border-radius: var(--el-border-radius-base);
  max-height: 400px;
  margin: .5em 0 1em 0;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.chat-message .markdown-body .code-block-wrapper pre.hljs {
  background-color: #F9F9F9;
}

html.dark .chat-message .markdown-body .code-block-wrapper pre.hljs {
  background-color: #171717;
}

.chat-message .markdown-body code.hljs {
  font-size: 0.9em;
  padding: 0;
  background-color: transparent !important;
}

.chat-message .markdown-body strong,
.chat-message .markdown-body b {
  font-weight: 600;
  color: inherit;
}

.ai-bubble .markdown-body {
  color: var(--el-text-color-regular);
}

.chat-message .markdown-body h1,
.chat-message .markdown-body h2,
.chat-message .markdown-body h3,
.chat-message .markdown-body h4,
.chat-message .markdown-body h5,
.chat-message .markdown-body h6 {
  margin-top: 1.2em;
  margin-bottom: 0.6em;
  font-weight: 600;
  line-height: 1.25;
  color: var(--el-text-color-primary);
}

html.dark .chat-message .markdown-body h1,
html.dark .chat-message .markdown-body h2,
html.dark .chat-message .markdown-body h3,
html.dark .chat-message .markdown-body h4,
html.dark .chat-message .markdown-body h5,
html.dark .chat-message .markdown-body h6 {
  color: var(--el-text-color-primary);
}

.chat-message .markdown-body h1 {
  font-size: 1.8em;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 0.3em;
}

.chat-message .markdown-body h2 {
  font-size: 1.5em;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 0.3em;
}

.chat-message .markdown-body h3 {
  font-size: 1.3em;
}

.chat-message .markdown-body h4 {
  font-size: 1.15em;
}

.chat-message .markdown-body h5 {
  font-size: 1em;
}

.chat-message .markdown-body h6 {
  font-size: 0.9em;
  color: var(--el-text-color-secondary);
}

html.dark .chat-message .markdown-body h1,
html.dark .chat-message .markdown-body h2 {
  border-bottom-color: var(--el-border-color-light);
}

.chat-message .markdown-body ul,
.chat-message .markdown-body ol {
  padding-left: 2em;
}

.chat-message .markdown-body li {
  margin-bottom: 0.3em;
}

.chat-message .markdown-body li > p {
  margin-bottom: 0.5em;
}

.chat-message .markdown-body blockquote {
  padding: 0.5em 1em;
  margin-left: 0;
  color: var(--el-text-color-secondary);
  border-left: 0.25em solid var(--el-border-color-lighter);
  background-color: var(--el-fill-color-lightest);
}

html.dark .chat-message .markdown-body blockquote {
  color: var(--el-color-info);
  border-left-color: var(--el-border-color-darker);
  background-color: var(--el-fill-color-dark);
}

.chat-message .markdown-body blockquote p {
  margin-bottom: 0.5em;
}

.chat-message .markdown-body blockquote p:last-child {
  margin-bottom: 0;
}

.chat-message .markdown-body a {
  color: var(--el-color-primary);
  text-decoration: none;
  font-weight: 500;
}

.chat-message .markdown-body a:hover {
  text-decoration: underline;
  color: var(--el-color-primary-light-3);
}

html.dark .chat-message .markdown-body a {
  color: var(--el-color-primary-light-5);
}

html.dark .chat-message .markdown-body a:hover {
  color: var(--el-color-primary-light-7);
}

.chat-message .markdown-body hr {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: var(--el-border-color-lighter);
  border: 0;
}

html.dark .chat-message .markdown-body hr {
  background-color: var(--el-border-color-light);
}

.chat-message .markdown-body table {
  border-collapse: collapse;
  width: auto;
  max-width: 100%;
  margin-top: 1em;
  margin-bottom: 1em;
  display: table;
  overflow-x: auto;
}

.chat-message .markdown-body th,
.chat-message .markdown-body td {
  border: 1px solid var(--el-border-color-lighter);
  padding: 8px 12px;
  text-align: left;
  color: var(--el-text-color-regular);
  background-color: var(--el-bg-color);
}

.chat-message .markdown-body th {
  font-weight: 600;
  background-color: var(--el-fill-color-lighter);
  color: var(--el-text-color-primary);
}

html.dark .chat-message .markdown-body th {
  background-color: var(--el-fill-color-dark);
}

html.dark .chat-message .markdown-body td {
  border-color: var(--el-border-color-darker);
}

.chat-message .markdown-body .code-block-wrapper {
  position: relative;
  margin: .5em 0 1em 0;
}

.chat-message .markdown-body .code-block-wrapper pre.hljs {
  margin: 0;
}

.chat-message .markdown-body .code-block-wrapper .code-block-copy-button {
  position: absolute;
  padding: 4px 6px;
  background-color: rgba(200, 200, 200, .7);
  border: 1px solid rgba(150, 150, 150, .5);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity .2s ease-in-out, background-color .2s ease-in-out;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #333;
}

.chat-message .markdown-body .code-block-wrapper .code-block-copy-button svg {
  display: block;
}

.chat-message .markdown-body .code-block-wrapper:hover .code-block-copy-button {
  opacity: 1;
}

.chat-message .markdown-body .code-block-wrapper .code-block-copy-button:hover {
  background-color: rgba(180, 180, 180, .9);
}

.chat-message .markdown-body .code-block-wrapper .code-block-copy-button-top {
  top: 8px;
  right: 8px;
}

.chat-message .markdown-body .code-block-wrapper .code-block-copy-button-bottom {
  bottom: 8px;
  right: 8px;
}

html.dark .chat-message .markdown-body .code-block-wrapper .code-block-copy-button {
  background-color: rgba(80, 80, 80, .7);
  border-color: rgba(120, 120, 120, .5);
  color: #ccc;
}

html.dark .chat-message .markdown-body .code-block-wrapper .code-block-copy-button:hover {
  background-color: rgba(100, 100, 100, .9);
}

.chat-message .markdown-body p > code:not(.hljs),
.chat-message .markdown-body li > code:not(.hljs) {
  background-color: var(--el-color-info-light-9);
  color: var(--el-text-color-regular);
  padding: .2em .4em;
  border-radius: var(--el-border-radius-small);
  font-size: 85%;
}

.chat-message .markdown-body img {
  max-width: 80%;
  max-height: 300px;
  height: auto;
  display: block;
  cursor: pointer;
  border-radius: var(--el-border-radius-base);
  margin-top: .8em;
  margin-bottom: .8em;
  border: 1px solid var(--el-border-color-lighter);
}

html.dark .chat-message .markdown-body img {
  border-color: var(--el-border-color-darker);
}

.chat-message .image-error-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100px;
  min-width: 150px;
  border: 1px dashed var(--el-border-color-light);
  border-radius: var(--el-border-radius-base);
  background-color: var(--el-fill-color-lightest);
  margin: .8em 0;
  cursor: default;
}

.chat-message .image-retry-button {
  padding: 8px 16px;
  border: none;
  background-color: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  border-radius: var(--el-border-radius-small);
  transition: background-color 0.2s, color 0.2s;
}

.chat-message .image-retry-button:hover {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

html.dark .chat-message .image-error-container {
  border-color: var(--el-border-color-darker);
  background-color: var(--el-fill-color-dark);
}

html.dark .chat-message .image-retry-button:hover {
  background-color: var(--el-color-primary-dark-2);
  color: var(--el-color-primary-light-7);
}


html.dark .chat-message .markdown-body {
  color: var(--el-text-color-regular);
}

html.dark .chat-message .markdown-body p > code:not(.hljs),
html.dark .chat-message .markdown-body li > code:not(.hljs) {
  background-color: var(--el-fill-color-darker);
  color: var(--el-color-info-light-3);
}
</style>

<style scoped lang="less">
.chat-message {
  margin: 10px 0 0 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}

.chat-message .user-bubble {
  align-self: flex-end;
  max-width: 90%;
  margin: 0;

  :deep(.el-bubble-content-wrapper .el-bubble-content-shadow) {
    background-color: #F4F4F4;
    border: #E6E6E6 1px solid;
  }
}

html.dark .chat-message .user-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content-shadow) {
    background: #393939;
    border: #383838 0px solid;
  }
}

.chat-message .ai-bubble {
  width: auto;
  max-width: 90%;
  margin: 0;
  align-self: left;

  :deep(.el-bubble-content-wrapper .el-bubble-content-shadow) {
    background-color: #FFFFFF;
    border: 1px solid #E6E6E6;
  }
}

html.dark .chat-message .ai-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content-shadow) {
    background: #222222;
    border: 1px solid var(--border-primary);
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
}

.system-prompt-container:hover {
  background-color: var(--el-fill-color-lighter);
  border-color: var(--el-color-primary-light-7);
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
}

.chat-message :deep(.markdown-body) {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  font-size: var(--el-font-size-base);
  line-height: 1.7;
  word-wrap: break-word;
  color: var(--el-text-color-primary);
  max-width: 80vw;
  overflow-x: hidden;
  overflow-y: hidden;
  transition: max-height 0.3s ease-in-out;
}

.chat-message :deep(.markdown-body.collapsed) {
  max-height: 3.4em;
  position: relative;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
}

.chat-message :deep(.markdown-body .code-block-wrapper pre.hljs) {
  background-color: #F9F9F9;
}

html.dark .chat-message :deep(.markdown-body .code-block-wrapper pre.hljs) {
  background-color: #171717;
}

.file-list-container {
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 0 8px 0;
  margin-bottom: 5px;
  gap: 8px;
  max-width: 100%;
  scrollbar-width: thin;
  scrollbar-color: var(--el-text-color-disabled) transparent;
}

.file-list-container::-webkit-scrollbar {
  height: 5px;
}

.file-list-container::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}

.file-list-container::-webkit-scrollbar-thumb {
  background-color: var(--el-text-color-disabled);
  border-radius: 3px;
  border: 1px solid transparent;
  background-clip: content-box;
}

.file-list-container::-webkit-scrollbar-thumb:hover {
  background-color: var(--el-text-color-secondary);
}

.file-list-container .el-button {
  border: none;
  background-color: var(--el-fill-color-light);
  color: var(--el-color-info);
}

.file-list-container .el-button :hover {
  border: none;
  background-color: var(--el-fill-color-lighter);
  color: var(--el-color-info);
}

html.dark .file-list-container .el-button {
  background-color: var(--el-fill-color-dark);
  color: var(--el-text-color-regular);
}

html.dark .file-list-container .el-button :hover {
  background-color: var(--el-fill-color-darker);
  color: var(--el-text-color-regular);
}

.user-info-header,
.ai-info-header {
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  padding: 0 2px;
}

.user-info-header {
  justify-content: flex-end;
}

.ai-info-header {
  justify-content: space-between;
}

.ai-details {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 1;
  overflow: hidden;
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
  gap: 4px;
}

.user-bubble .footer-actions {
  margin-left: auto;
}

.ai-bubble .footer-actions {
  margin-right: auto;
}

.timestamp {
  font-size: 0.75rem;
  color: var(--el-text-color-placeholder);
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

/* [MODIFIED] Corrected selector and added max-width */
html.dark .ai-bubble :deep(.el-thinking-popper) {
  max-width: 85vw; /* Constrain the popper's width */
  background-color: var(--bg-tertiary, #2c2e33) !important;
  border-color: var(--border-primary, #373A40) !important;
}

html.dark .ai-bubble :deep(.el-thinking-popper .el-popper__arrow::before) {
  background: var(--bg-tertiary, #2c2e33) !important;
  border-color: var(--border-primary, #373A40) !important;
}

/* [MODIFIED] This rule now applies to both light and dark mode for wrapping */
.ai-bubble :deep(.el-thinking .content pre) {
  max-width: 100%; /* Ensure pre respects popper's width */
  margin-bottom: 10px;
  white-space: pre-wrap; /* Allow wrapping */
  word-break: break-word; /* Break words to prevent overflow */
  box-sizing: border-box;
}

/* [MODIFIED] Corrected dark mode style for the content inside the popper */
html.dark .ai-bubble :deep(.el-thinking .content pre) {
  background-color: var(--el-fill-color-darker);
  color: var(--el-text-color-regular, #E5E7EB);
  border: 1px solid var(--border-primary, #373A40);
}
</style>