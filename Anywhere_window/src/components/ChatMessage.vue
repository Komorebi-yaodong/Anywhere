<!-- ./Anywhere_window/src/components/ChatMessage.vue -->
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
    processedText = processedText.replace(/\u2013/g, '-').replace(/\u2014/g, '-');
    processedText = processedText.replace(/\\\(\s*(.*?)\s*\\\)/g, '$$$1$$').replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');
    processedText = processedText.replace(/(?<!\$)\$([^$]+?)\)\$(?!\$)/g, (match, content) => {
        return `$${content.trim()}$`;
    });
    return processedText;
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

</script>

<template>
    <div class="chat-message">
        <div v-if="message.role === 'system'" class="system-prompt-container" @click="onShowSystemPrompt">
            <p class="system-prompt-preview">{{ String(message.content) }}</p>
        </div>
        <Bubble v-if="message.role === 'user'" class="user-bubble" placement="end" shape="corner" variant="shadow" maxWidth="2000px" avatar-size="40px">
            <template #avatar>
                <img :src="userAvatar" alt="User Avatar" @click="onAvatarClick('user', $event)" class="chat-avatar">
            </template>
            <template #content>
                <div class="markdown-body" :class="{ 'collapsed': isCollapsed }" v-html="renderMarkdown(message)"></div>
            </template>
            <template #footer>
                <div class="file-list-container" v-if="formatMessageFile(message.content).length > 0">
                    <el-tooltip v-for="(file_name, idx) in formatMessageFile(message.content)" :key="idx" :content="file_name" placement="top" :disabled="file_name.length < 20">
                        <el-button class="file-button" type="info" plain size="small" :icon="Document">{{ file_name }}</el-button>
                    </el-tooltip>
                </div>
                <el-button :icon="DocumentCopy" @click="onCopy" size="small" circle />
                <el-button v-if="shouldShowCollapseButton" :icon="isCollapsed ? CaretBottom : CaretTop" @click="onToggleCollapse($event)" size="small" circle />
                <el-button v-if="isLastMessage" :icon="Refresh" @click="onReAsk" size="small" circle />
                <el-button :icon="Delete" size="small" @click="onDelete" circle />
            </template>
        </Bubble>
        <Bubble v-if="message.role === 'assistant'" class="ai-bubble" placement="start" shape="corner" variant="shadow" maxWidth="2000px" avatar-size="40px">
            <template #avatar>
                <img :src="aiAvatar" alt="AI Avatar" @click="onAvatarClick('assistant', $event)" class="chat-avatar">
            </template>
            <template #header>
                <Thinking v-if="message.status && message.status.length > 0" maxWidth="90%" :content="message.reasoning_content" :modelValue="false">
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
                <el-button :icon="DocumentCopy" @click="onCopy" size="small" circle />
                <el-button v-if="shouldShowCollapseButton" :icon="isCollapsed ? CaretBottom : CaretTop" @click="onToggleCollapse($event)" size="small" circle />
                <el-button v-if="isLastMessage" :icon="Refresh" @click="onReAsk" size="small" circle />
                <el-button :icon="Delete" size="small" @click="onDelete" circle />
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

.chat-message .user-bubble {
  align-self: flex-end;
  max-width: 90%;
  margin: 0;

  :deep(.el-bubble-content-wrapper .el-bubble-content-shadow) {
    background-color: #F4F4F4;
  }
}

html.dark .chat-message .user-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content-shadow) {
    background: #414158;
  }
}

.chat-message .ai-bubble {
  width: auto;
  max-width: 90%;
  margin: 0;
  align-self: left;

  :deep(.el-bubble-content-wrapper .el-bubble-content-shadow) {
    background-color: #F0F2F5;
  }
}

html.dark .chat-message .ai-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content-shadow) {
    background: #404045;
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
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
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
  overflow-x: auto;
  transition: max-height 0.3s ease-in-out;
}

.chat-message :deep(.markdown-body.collapsed) {
  max-height: 3.4em;
  position: relative;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
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
</style>