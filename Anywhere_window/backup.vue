<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, computed, h, watch } from 'vue';
import { Bubble, Sender, Thinking } from 'vue-element-plus-x';
import { Attachments } from 'ant-design-x-vue';
// [MODIFIED] Added ElMessageBox for the new save dialog
import { ElContainer, ElHeader, ElMain, ElFooter, ElButton, ElDialog, ElTable, ElTableColumn, ElTooltip, ElRow, ElCol, ElMessage, ElImageViewer, ElInput, ElMessageBox } from 'element-plus';
import { DocumentCopy, Refresh, Delete, CoffeeCup, Lollipop, Link, Document, Download } from '@element-plus/icons-vue'

// import TitleBar from './TitleBar.vue'
// import mammoth from 'mammoth';
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

// [NEW & IMPROVED] Helper functions for file parsing
const base64ToBuffer = (base64) => { const bs = atob(base64); const b = new Uint8Array(bs.length); for (let i = 0; i < bs.length; i++) b[i] = bs.charCodeAt(i); return b.buffer; };
const parseWord = async (base64Data) => {
  const mammoth = (await import('mammoth')).default;
  const s = base64Data.split(',')[1]; if (!s) throw new Error("Invalid base64 data for Word file");
  const r = await mammoth.convertToHtml({ arrayBuffer: base64ToBuffer(s) }); const d = document.createElement('div'); d.innerHTML = r.value;
  return (d.textContent || d.innerText || "").replace(/\s+/g, ' ').trim();
};
const parseTextFile = async (base64Data) => {
  const s = base64Data.split(',')[1]; if (!s) throw new Error("Invalid base64 data for text file");
  const bs = atob(s); const ia = new Uint8Array(bs.length); for (let i = 0; i < bs.length; i++) ia[i] = bs.charCodeAt(i);
  return new TextDecoder().decode(ia);
};
const parseExcel = async (base64Data) => {
  const XLSX = await import('xlsx');
  const s = base64Data.split(',')[1]; if (!s) throw new Error("Invalid base64 data for Excel file");
  const workbook = XLSX.read(base64ToBuffer(s), { type: 'buffer' });
  let fullTextContent = '';
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const csvData = XLSX.utils.sheet_to_csv(worksheet);
    fullTextContent += `--- Sheet: ${sheetName} ---\n${csvData}\n\n`;
  });
  return fullTextContent.trim();
};

const fileHandlers = {
  text: {
    extensions: [
      // Common text files
      '.txt', '.md', '.markdown', '.json', '.xml', '.html', '.css', /* '.csv' was moved */
      // Common code files
      '.py', '.js', '.ts', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go',
      '.php', '.rb', '.rs', '.sh', '.sql', '.vue'
    ],
    handler: async (file) => {
      const textContent = await parseTextFile(file.url);
      return { type: "text", text: `file name:${file.name}\nfile content:${textContent}\nfile end` };
    }
  },
  docx: {
    extensions: ['.docx'],
    handler: async (file) => {
      const textContent = await parseWord(file.url);
      return { type: "text", text: `file name:${file.name}\nfile content:${textContent}\nfile end` };
    }
  },
  excel: {
    extensions: ['.xlsx', '.xls', '.csv'], // Handles modern, legacy, and csv formats
    handler: async (file) => {
      const textContent = await parseExcel(file.url);
      return { type: "text", text: `file name:${file.name}\nfile content:${textContent}\nfile end` };
    }
  },
  image: {
    extensions: ['.png', '.jpg', '.jpeg', '.webp'], // Strictly adhere to original types
    handler: async (file) => {
      return { type: "image_url", image_url: { url: file.url } };
    }
  },
  audio: {
    extensions: ['.mp3', '.wav'], // Strictly adhere to original types
    handler: async (file) => {
      const commaIndex = file.url.indexOf(',');
      if (commaIndex > -1) {
        return {
          type: "input_audio",
          input_audio: {
            data: file.url.substring(commaIndex + 1),
            format: file.name.split('.').pop().toLowerCase()
          }
        };
      }
      ElMessage.error(`音频文件 ${file.name} 格式不正确`);
      return null;
    }
  },
  pdf: {
    extensions: ['.pdf'],
    handler: async (file) => {
      const commaIndex = file.url.indexOf(',');
      if (commaIndex > -1) {
        return {
          type: "input_file",
          filename: file.name,
          file_data: file.url
        };
      }
      ElMessage.error(`PDF文件 ${file.name} 格式不正确`);
      return null;
    }
  }
};

// [NEW & IMPROVED] Helper function to get the correct handler for a file
const getFileHandler = (fileName) => {
  if (!fileName) return null;
  const extension = ('.' + fileName.split('.').pop()).toLowerCase();
  for (const category in fileHandlers) {
    if (fileHandlers[category].extensions.includes(extension)) {
      return fileHandlers[category].handler;
    }
  }
  return null;
};


const preprocessKatex = (text) => {
  if (!text) return '';

  let processedText = text.replace(/\$([^$].*?)\$/g, (match, content) => {
    return `$${content.trim()}$`;
  });

  processedText = processedText
    .replace(/\\\((.*?)\\\)/g, '$$$1$$')
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');

  return processedText;
};

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre class="hljs"><code>' +
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
          '</code></pre>';
      } catch (__) { }
    }
    return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
  }
}).use(mdKatex);


const renderMarkdown = (message) => {
  const content = message.role ? message.content : message;
  let formattedContent = formatMessageContent(content);

  formattedContent = preprocessKatex(formattedContent);

  if (!formattedContent && message.role === 'assistant') {
    return '...';
  }
  return md.render(formattedContent || ' ');
};


const defaultConfig = {
  config: {
    providers: {
      "0": {
        name: "default",
        url: "https://api.openai.com/v1",
        api_key: "sk-xxx",
        modelList: ["gpt-4o", "gpt-4o-mini"],
        enable: true,
      },
    },
    providerOrder: ["0",],
    prompts: {
      AI: {
        type: "over",
        prompt: `你是一个AI助手`,
        showMode: "window",
        model: "0|gpt-4o",
        enable: true,
        icon: "",
        stream: true,
        temperature: 0.7,
        isTemperature: false,
        isDirectSend: false,
        ifTextNecessary: false,
      },
    },
    stream: false,
    skipLineBreak: true,
    window_height: 520,
    window_width: 400,
    autoCloseOnBlur: false,
    CtrlEnterToSend: false,
    showNotification: true,
    isDarkMode: true,
  }
};

let UserAvart = ref("user.png");
let AIAvart = ref("ai.svg");
let favicon = ref("favicon.png");
let CODE = ref("");

var isInit = ref(false);
var basic_msg = ref({
  os: "macos",
  code: "AI",
  type: "over",
  payload: "请简洁地介绍一下你自己"
});
var currentConfig = ref(defaultConfig.config);
var autoCloseOnBlur = ref(false);
var modelList = ref([]);
var modelMap = ref({});
var model = ref("");
var temporary = ref(false);
const closePage = () => {
  window.close();
}

var currentProviderID = ref(defaultConfig.config.providerOrder[0]);
var base_url = ref("");
var api_key = ref("");
var history = ref([]);
var thinking = ref(false);
var chat_show = ref([]);
var loading = ref(false);
var prompt = ref("");
var senderRef = ref();
var signalController = ref(null);
var changeModel_page = ref(false);
var fileList = ref([]);

// [NEW] Refs for system prompt dialog
const systemPromptDialogVisible = ref(false);
const systemPromptContent = ref('');

// [NEW] Function to show system prompt dialog
function showFullSystemPrompt(content) {
  systemPromptContent.value = content;
  systemPromptDialogVisible.value = true;
}

// [MODIFIED] New save functions
async function handleSaveAction() {
  if (autoCloseOnBlur.value) {
    changeAutoCloseOnBlur();
  }
  try {
    await ElMessageBox.confirm(
      'JSON格式用于保存完整会话，方便下次加载和继续；Markdown格式则更适合阅读和分享。',
      '选择保存格式',
      {
        confirmButtonText: '保存为 Markdown',
        cancelButtonText: '保存为 JSON',
        distinguishCancelAndClose: true,
        type: 'info',
        center: true,
      }
    );
    // User clicked "Save as Markdown"
    await saveSessionAsMarkdown();
  } catch (action) {
    if (action === 'cancel') {
      // User clicked "Save as JSON"
      await saveSessionAsJson();
    }
    // If action is 'close' or 'error', do nothing. The user has cancelled.
  }
}

async function saveSessionAsMarkdown() {
  let markdownContent = '';

  // 1. Generate timestamp and create a more descriptive title and default filename
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const fileTimestamp = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const defaultFilename = `Chat-${CODE.value || 'AI'}-${fileTimestamp}.md`;

  markdownContent += `# 聊天记录: ${CODE.value} (${timestamp})\n\n`;
  markdownContent += `### 模型: ${modelMap.value[model.value] || 'N/A'}\n\n`;

  // 2. Handle System Prompt
  const systemPromptMessage = chat_show.value.find(m => m.role === 'system');
  if (systemPromptMessage && systemPromptMessage.content) {
    markdownContent += `### 系统提示词\n\n`;
    markdownContent += `${String(systemPromptMessage.content).trim()}\n\n`;
  }

  markdownContent += '---\n\n';

  // 3. Loop through displayed messages and format them correctly
  for (const message of chat_show.value) {
    if (message.role === 'system') continue; // Already handled

    if (message.role === 'user') {
      markdownContent += `### 👤 用户\n\n`;
      // CORRECTED: Pass message.content to the formatters
      const mainContent = formatMessageContent(message.content).trim();
      const files = formatMessageFile(message.content);

      if (mainContent) {
        markdownContent += `${mainContent}\n\n`;
      }

      if (files.length > 0) {
        markdownContent += `**附件列表:**\n`;
        files.forEach(f => {
          markdownContent += `- \`${f}\`\n`;
        });
        markdownContent += `\n`;
      }
      markdownContent += '---\n\n';
    } else if (message.role === 'assistant') {
      markdownContent += `### 🤖 ${CODE.value || 'AI'}\n\n`;
      // CORRECTED: Pass message.content to the formatter
      const reasoning_content = "\n" + formatMessageContent(message.reasoning_content).trim();
      // rfeasoning_content中每一行的开始增加“> ”前缀
      markdownContent += reasoning_content.replace(/\n/g, '\n> ') + '\n\n';
      const mainContent = formatMessageContent(message.content).trim();
      if (mainContent) {
        markdownContent += `${mainContent}\n\n`;
      } else if (message.status) {
        // If the AI was thinking but didn't produce text, indicate that.
        markdownContent += `*(AI正在思考...)*\n\n`;
      }
      markdownContent += '---\n\n';
    }
  }

  // 4. Trigger the native save dialog via the main process
  try {
    await window.api.saveFile({
      title: '保存为 Markdown',
      defaultPath: defaultFilename,
      buttonLabel: '保存',
      filters: [
        { name: 'Markdown 文件', extensions: ['md'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      fileContent: markdownContent
    });
    ElMessage.success('会话已成功保存为 Markdown！');
  } catch (error) {
    if (!error.message.includes('canceled by the user')) {
      console.error('保存 Markdown 失败:', error);
      ElMessage.error(`保存失败: ${error.message}`);
    }
  }
}

async function saveSessionAsJson() {
  const currentPromptConfig = currentConfig.value.prompts[CODE.value] || {};
  const sessionData = {
    anywhere_history: true,
    UserAvart: UserAvart.value,
    CODE: CODE.value,
    basic_msg: basic_msg.value,
    isInit: isInit.value,
    autoCloseOnBlur: autoCloseOnBlur.value,
    temporary: temporary.value,
    model: model.value,
    currentPromptConfig: currentPromptConfig,
    history: history.value,
    chat_show: chat_show.value,
  };

  const jsonString = JSON.stringify(sessionData, null, 2);

  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const defaultFilename = `Session-${CODE.value || 'AI'}-${year}${month}${day}-${hours}${minutes}${seconds}.json`;

  try {
    await window.api.saveFile({
      title: '保存聊天会话',
      defaultPath: defaultFilename,
      buttonLabel: '保存',
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      fileContent: jsonString
    });

    ElMessage.success('会话已成功保存！');
  } catch (error) {
    if (!error.message.includes('canceled by the user')) {
      console.error('保存会话失败:', error);
      ElMessage.error(`保存失败: ${error.message}`);
    }
  }
}

// [NEW] Function to load a session from JSON data
async function loadSession(jsonData) {
  // 关键：在加载开始时，设置一个加载状态，这可以用来临时禁用发送按钮
  loading.value = true;
  // ElMessage.info('正在从文件加载会话...');

  try {
    // 步骤 1: 恢复所有不依赖于外部配置的简单状态
    UserAvart.value = jsonData.UserAvart;
    CODE.value = jsonData.CODE;
    document.title = CODE.value;
    basic_msg.value = jsonData.basic_msg;
    isInit.value = jsonData.isInit;
    autoCloseOnBlur.value = jsonData.autoCloseOnBlur;
    temporary.value = jsonData.temporary;
    history.value = jsonData.history;
    chat_show.value = jsonData.chat_show;

    // 步骤 2: 重新加载最新的主配置
    const configData = await window.api.getConfig();
    currentConfig.value = configData.config;
    if (currentConfig.value.isDarkMode) {
      document.documentElement.classList.add('dark');
      favicon.value = "favicon-b.png";
    } else {
      document.documentElement.classList.remove('dark');
      favicon.value = "favicon.png";
    }

    // 步骤 3: 根据最新的主配置，重建当前所有可用的模型列表
    modelList.value = [];
    modelMap.value = {};
    currentConfig.value.providerOrder.forEach(id => {
      const provider = currentConfig.value.providers[id];
      if (provider?.enable) {
        provider.modelList.forEach(m => {
          const key = `${id}|${m}`;
          modelList.value.push({ key, value: key, label: `${provider.name}|${m}` });
          modelMap.value[key] = `${provider.name}|${m}`;
        });
      }
    });

    // 步骤 4: 使用健壮的逻辑恢复模型选择
    let restoredModel = '';
    if (jsonData.model && modelMap.value[jsonData.model]) {
      restoredModel = jsonData.model;
    }
    else if (jsonData.currentPromptConfig?.model && modelMap.value[jsonData.currentPromptConfig.model]) {
      restoredModel = jsonData.currentPromptConfig.model;
    }
    else {
      const currentPromptConfig = currentConfig.value.prompts[CODE.value];
      restoredModel = (currentPromptConfig?.model && modelMap.value[currentPromptConfig.model])
        ? currentPromptConfig.model
        : (modelList.value[0]?.value || '');
      // ElMessage.warning('加载的会话模型已失效，已回退至默认模型。');
    }

    model.value = restoredModel;

    // 步骤 5: 更新与模型相关的其他状态
    if (model.value) {
      currentProviderID.value = model.value.split("|")[0];
      const provider = currentConfig.value.providers[currentProviderID.value];
      base_url.value = provider?.url;
      api_key.value = provider?.api_key;
    } else {
      ElMessage.error("没有可用的模型。请检查您的服务商配置。");
      loading.value = false; // 解除加载状态
      return; // 提前退出函数
    }

    // 步骤 6: 刷新UI并滚动到底部
    await nextTick();
    scrollToBottom(true);
    // ElMessage.success('会话加载成功！');

  } catch (error) {
    console.error("加载会话失败:", error);
    ElMessage.error(`加载会话失败: ${error.message}`);
  } finally {
    loading.value = false;
  }
}

// [NEW] Function to check if a file is a session file and load it
async function checkAndLoadSessionFromFile(file) {
  if (file && file.name.toLowerCase().endsWith('.json')) {
    try {
      const fileContent = await file.text();
      const jsonData = JSON.parse(fileContent);
      if (jsonData && jsonData.anywhere_history === true) {
        await loadSession(jsonData);
        return true; // Indicates session was loaded
      }
    } catch (e) {
      console.warn("一个JSON文件被检测到，但它不是一个有效的会话文件:", e.message);
    }
  }
  return false; // Not a session file
}


const customContent = ref(true);
const getDropContainer = () => (document.body);
const attachmentsNode = computed(() => h(Attachments, {
  beforeUpload: () => false,
  onChange: uploadFiles,
  children: customContent.value && h(ElButton, { type: 'default', icon: h(Link), circle: true }),
  getDropContainer,
}));

const imageViewerVisible = ref(false);
const imageViewerSrcList = ref([]);
const imageViewerInitialIndex = ref(0);

const handleMarkdownImageClick = (event) => {
  if (event.target.closest('.image-error-container') || event.target.closest('.code-block-wrapper')) {
    return;
  }
  const imgElement = event.target.closest('.markdown-body img');
  if (imgElement && imgElement.src) {
    imageViewerSrcList.value = [imgElement.src];
    imageViewerInitialIndex.value = 0;
    imageViewerVisible.value = true;
  }
};

const attachImageErrorHandlers = async () => {
  await nextTick();
  const processImage = (img) => {
    if (img.hasAttribute('data-error-handler-attached')) return;
    img.setAttribute('data-error-handler-attached', 'true');
    const originalSrc = img.src;

    const handleError = () => {
      if (!img.parentNode || img.parentNode.classList.contains('image-error-container')) {
        return;
      }
      const container = document.createElement('div');
      container.className = 'image-error-container';
      const retryButton = document.createElement('button');
      retryButton.className = 'image-retry-button';
      retryButton.textContent = '图片加载失败，点击重试';
      container.appendChild(retryButton);
      img.parentNode.replaceChild(container, img);
      retryButton.onclick = (e) => {
        e.stopPropagation();
        const newImg = document.createElement('img');
        newImg.src = `${originalSrc}?t=${new Date().getTime()}`;
        processImage(newImg);
        container.parentNode.replaceChild(newImg, container);
      };
    };
    img.onerror = handleError;
    if (img.complete && img.naturalHeight === 0 && img.src) {
      setTimeout(() => {
        if (img.naturalHeight === 0) handleError();
      }, 50);
    }
  };
  document.querySelectorAll('.markdown-body img:not([data-error-handler-attached])').forEach(processImage);
};

const addCopyButtonsToCodeBlocks = async () => {
  await nextTick();
  document.querySelectorAll('.markdown-body pre.hljs').forEach(pre => {
    if (pre.querySelector('.code-block-copy-button')) {
      return;
    }

    const codeElement = pre.querySelector('code');
    if (!codeElement) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const codeText = codeElement.textContent || '';
    const lines = codeText.trimEnd().split('\n');
    const lineCount = lines.length;

    const copyButtonSVG = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
  <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
  <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
</svg>`;

    const createButton = (positionClass) => {
      const button = document.createElement('button');
      button.className = `code-block-copy-button ${positionClass}`;
      button.innerHTML = copyButtonSVG;
      button.title = 'Copy code';
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        try {
          await navigator.clipboard.writeText(codeText);
          ElMessage.success('Code copied to clipboard!');
        } catch (err) {
          console.error('Failed to copy code:', err);
          ElMessage.error('Failed to copy code.');
        }
      });
      wrapper.appendChild(button);
    };

    createButton('code-block-copy-button-bottom');

    if (lineCount > 3) {
      createButton('code-block-copy-button-top');
    }
  });
};

function senderFocus(focus_type = 'end') {
  senderRef.value?.focus(focus_type);
}

onMounted(async () => {
  if (isInit.value) {
    return;
  }
  isInit.value = true;
  try {
    const configData = await window.api.getConfig();
    currentConfig.value = configData.config;
  } catch (err) {
    currentConfig.value = defaultConfig.config;
    ElMessage.error('加载配置失败，使用默认配置');
  }
  if (currentConfig.value.isDarkMode) {
    document.documentElement.classList.add('dark');
    favicon.value = "favicon-b.png";
  }
  try {
    const userInfo = await window.api.getUser();
    UserAvart.value = userInfo.avatar;
  } catch (err) {
    UserAvart.value = "user.png";
  }
  autoCloseOnBlur.value = currentConfig.value.autoCloseOnBlur;
  try {
    window.preload.receiveMsg(async (data) => {
      basic_msg.value = { code: data?.code, type: data?.type, payload: data?.payload };
      document.title = basic_msg.value.code;
      CODE.value = basic_msg.value.code;
      const currentPromptConfig = currentConfig.value.prompts[basic_msg.value.code];
      model.value = currentPromptConfig?.model || defaultConfig.config.prompts.AI.model;
      modelList.value = [];
      modelMap.value = {};
      currentConfig.value.providerOrder.forEach(id => {
        const provider = currentConfig.value.providers[id];
        if (provider?.enable) {
          provider.modelList.forEach(m => {
            const key = `${id}|${m}`;
            modelList.value.push({ key, value: key, label: `${provider.name}|${m}` });
            modelMap.value[key] = `${provider.name}|${m}`;
          });
        }
      });
      if (!modelMap.value[model.value]) {
        model.value = modelList.value[0]?.value;
      }
      currentProviderID.value = model.value.split("|")[0];
      base_url.value = currentConfig.value.providers[currentProviderID.value]?.url;
      api_key.value = currentConfig.value.providers[currentProviderID.value]?.api_key;
      if (currentPromptConfig?.prompt) {
        history.value = [{ role: "system", content: currentPromptConfig?.prompt || "" }];
        chat_show.value = [{ role: "system", content: currentPromptConfig?.prompt || "" }];
      } else {
        history.value = []; chat_show.value = [];
      }

      if (basic_msg.value.type === "over" && basic_msg.value.payload) {
        // 如果 basic_msg.value.payload.trim().toLowerCase() 是 CODE.value.trim().toLowerCase() 的子字符串
        if (CODE.value.trim().toLowerCase().includes(basic_msg.value.payload.trim().toLowerCase())) {
          if (autoCloseOnBlur.value) {
            changeAutoCloseOnBlur();
          }
          scrollToBottom(true); senderFocus();
        } else {
          history.value.push({ role: "user", content: basic_msg.value.payload });
          chat_show.value.push({ role: "user", content: [{ type: "text", text: basic_msg.value.payload }] });
          scrollToBottom(true); await askAI(true);
        }
      } else if (basic_msg.value.type === "img" && basic_msg.value.payload) {
        history.value.push({ role: "user", content: [{ type: "image_url", image_url: { url: String(basic_msg.value.payload) } }] });
        chat_show.value.push({ role: "user", content: [{ type: "image_url", image_url: { url: String(basic_msg.value.payload) } }] });
        scrollToBottom(true); await askAI(true);
      } else if (basic_msg.value.type === "files" && basic_msg.value.payload) {
        try {
          let sessionLoaded = false;
          if (basic_msg.value.payload.length === 1 && basic_msg.value.payload[0].path.toLowerCase().endsWith('.json')) {
            const fileObject = await window.api.handleFilePath(basic_msg.value.payload[0].path);
            if (fileObject) {
              sessionLoaded = await checkAndLoadSessionFromFile(fileObject);
              senderFocus();
            }
          }

          if (!sessionLoaded) {
            const fileProcessingPromises = basic_msg.value.payload.map((fileInfo) =>
              processFilePath(fileInfo.path)
            );
            await Promise.all(fileProcessingPromises);

            if (currentPromptConfig?.isDirectSend) {
              scrollToBottom(true);
              await askAI(false);
            } else {
              senderFocus();
              scrollToBottom(true);
            }
          }
        } catch (error) {
          console.error("Error during initial file processing:", error);
          ElMessage.error("文件处理失败: " + error.message);
        }
      }
      if (autoCloseOnBlur.value) window.addEventListener('blur', closePage);
    });
  } catch (err) {
    basic_msg.value.code = Object.keys(currentConfig.value.prompts)[0];
    document.title = basic_msg.value.code;
    CODE.value = basic_msg.value.code;
    const currentPromptConfig = currentConfig.value.prompts[basic_msg.value.code];
    model.value = currentPromptConfig?.model || defaultConfig.config.prompts.AI.model;
    modelList.value = [];
    modelMap.value = {};
    currentConfig.value.providerOrder.forEach(id => {
      const provider = currentConfig.value.providers[id];
      if (provider?.enable) {
        provider.modelList.forEach(m => {
          const key = `${id}|${m}`;
          modelList.value.push({ key, value: key, label: `${provider.name}|${m}` });
          modelMap.value[key] = `${provider.name}|${m}`;
        });
      }
    });
    if (!modelMap.value[model.value]) {
      model.value = modelList.value[0]?.value;
    }
    currentProviderID.value = model.value.split("|")[0];
    base_url.value = currentConfig.value.providers[currentProviderID.value]?.url;
    api_key.value = currentConfig.value.providers[currentProviderID.value]?.api_key;
    if (currentPromptConfig?.prompt) {
      history.value = [{ role: "system", content: currentPromptConfig?.prompt || "你是一个AI助手" }];
      chat_show.value = [{ role: "system", content: currentPromptConfig?.prompt || "你是一个AI助手" }];
    } else {
      history.value = []; chat_show.value = [];
    }

    scrollToBottom(true);
    if (autoCloseOnBlur.value) window.addEventListener('blur', closePage);
  }

  const chatMainElement = document.querySelector('.chat-main');
  if (chatMainElement) chatMainElement.addEventListener('click', handleMarkdownImageClick);
  await addCopyButtonsToCodeBlocks();
  await attachImageErrorHandlers();
});

onBeforeUnmount(() => {
  if (!autoCloseOnBlur.value) window.removeEventListener('blur', closePage);
  const chatMainElement = document.querySelector('.chat-main');
  if (chatMainElement) chatMainElement.removeEventListener('click', handleMarkdownImageClick);
});

watch(chat_show, async () => {
  await addCopyButtonsToCodeBlocks();
  await attachImageErrorHandlers();
}, { deep: true, flush: 'post' });

let lastHeight = 0;
const scrollToBottom = async (force = false) => {
  await nextTick();
  const container = document.querySelector('.chat-main');
  if (!container) return;
  let nowHeight = container.scrollHeight;
  let Speed = nowHeight - lastHeight;
  if (Speed < 0) Speed = 100;
  lastHeight = nowHeight;
  if (force) container.scrollTop = container.scrollHeight;
  else {
    const scrollThreshold = 2 * Speed;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom <= scrollThreshold) container.scrollTop = container.scrollHeight;
  }
};

const formatMessageContent = (content) => {
  if (!content) return "";
  if (!Array.isArray(content)) {
    if (String(content).toLowerCase().startsWith('file name:') && String(content).toLowerCase().endsWith('file end')) { return ""; }
    else return String(content);
  }

  let markdownString = "";
  content.forEach(part => {
    if (part.type === 'text' && part.text && part.text.toLowerCase().startsWith('file name:') && part.text.toLowerCase().endsWith('file end')) { }
    else if (part.type === 'image_url' && part.image_url?.url) markdownString += `\n\n![Image](${part.image_url.url})\n`;
    else if (part.type === 'input_audio' && part.input_audio?.data) {
      markdownString += `\n\n<audio id="audio" controls="" preload="none">\n<source id="${part.input_audio.format}" src="data:audio/${part.input_audio.format};base64,${part.input_audio.data}">\n</audio>\n`;
    }
    else if (part.type === 'text' && part.text) markdownString += part.text;
  });
  return markdownString;
};

const formatMessageFile = (content) => {
  let files = [];
  if (!Array.isArray(content)) {
    if (String(content).toLowerCase().startsWith('file name:') && String(content).toLowerCase().endsWith('file end')) {
      files.push(String(content).split('\n')[0].replace('file name:', '').trim());
    }
    else return [];
  }
  else {
    content.forEach(part => {
      if (part.type === 'text' && part.text && part.text.toLowerCase().startsWith('file name:') && part.text.toLowerCase().endsWith('file end')) {
        files.push(part.text.split('\n')[0].replace('file name:', '').trim());
      }
      else if (part.type === "input_file" && part.filename) {
        files.push(part.filename);
      }
    });
  }
  return files;
};

const formatMessageText = (content) => {
  if (!Array.isArray(content)) return String(content);
  let textString = "";
  content.forEach(part => {
    if (!(part.type === 'text' && part.text && part.text.toLowerCase().startsWith('file name:') && part.text.toLowerCase().endsWith('file end'))) {
      if (part.type === 'text' && part.text) textString += part.text;
    }
  });
  return textString.trim().trimEnd();
}

function changeModel_function(choosedModel) {
  model.value = choosedModel;
  currentProviderID.value = choosedModel.split("|")[0];
  base_url.value = currentConfig.value.providers[currentProviderID.value].url;
  api_key.value = currentConfig.value.providers[currentProviderID.value].api_key;
  changeModel_page.value = false;
  senderFocus();
  ElMessage.success(`模型已切换为: ${modelMap.value[choosedModel]}`);
}

const tableSpanMethod = ({ row, column, rowIndex, columnIndex }) => {
  if (columnIndex === 0) {
    const currentProvider = row.label.split("|")[0];
    if (rowIndex > 0 && modelList.value[rowIndex - 1].label.split("|")[0] === currentProvider) return { rowspan: 0, colspan: 0 };
    let rowspan = 1;
    for (let i = rowIndex + 1; i < modelList.value.length; i++) {
      if (modelList.value[i].label.split("|")[0] === currentProvider) rowspan++; else break;
    }
    return { rowspan: rowspan, colspan: 1 };
  }
};

async function saveConfig() {
  try { await window.api.updateConfig({ config: JSON.parse(JSON.stringify(currentConfig.value)) }); }
  catch (error) { ElMessage.error('保存配置失败'); }
}
function changeAutoCloseOnBlur() {
  autoCloseOnBlur.value = !autoCloseOnBlur.value;
  if (!autoCloseOnBlur.value) window.removeEventListener('blur', closePage); else window.addEventListener('blur', closePage);
}
async function saveWindowSize() {
  try {
    const configData = await window.api.getConfig();
    currentConfig.value = configData.config;
  } catch (err) {
  }
  currentConfig.value.window_height = window.innerHeight; currentConfig.value.window_width = window.innerWidth;
  currentConfig.value.position_x = window.screenX;
  currentConfig.value.position_y = window.screenY;
  saveConfig(); ElMessage.success('窗口大小位置已保存');
}

async function askAI(forceSend = false) {
  if (loading.value) return;
  let is_think_flag = false;

  // 非强制发送（强制发送则不会追加记录，而是直接发送）
  if (!forceSend) {
    let file_content = await sendFile();
    const promptText = prompt.value.trim();
    // 有文件内容或者有提示词文本
    if ((file_content && file_content.length > 0) || promptText) {
      const userContentList = [];
      // 有提示词文本
      if (promptText) userContentList.push({ type: "text", text: promptText });
      // 有文件内容
      if (file_content && file_content.length > 0) userContentList.push(...file_content);
      // 只有一个提示词文本 || 只有一个文件内容且类型为文本
      if (userContentList.length == 1 && userContentList[0].type === "text") {
        history.value.push({ role: "user", content: userContentList[0]["text"] });
        chat_show.value.push({ role: "user", content: [{ type: "text", text: userContentList[0]["text"] }] });
      }
      // 有一个非文本内容 或者 多个内容
      else if (userContentList.length > 0) {
        history.value.push({ role: "user", content: userContentList });
        chat_show.value.push({ role: "user", content: userContentList });
      }
      else return;
    } else return;
    prompt.value = "";
  }
  if (temporary.value && history.value.length > 1) {
    const lastUserMessage = history.value[history.value.length - 1];
    const systemMessage = history.value[0].role === "system" ? history.value[0] : null;

    const messagesToKeepInHistory = [];
    const messagesToKeepInChatShow = [];

    if (systemMessage) {
      messagesToKeepInHistory.push(systemMessage);
      messagesToKeepInChatShow.push(chat_show.value.find(m => m.role === "system") || systemMessage);
    }
    if (lastUserMessage && lastUserMessage.role === "user") {
      messagesToKeepInHistory.push(lastUserMessage);
      const correspondingUserChatShow = chat_show.value.filter(m => m.role === 'user').pop();
      if (correspondingUserChatShow) messagesToKeepInChatShow.push(correspondingUserChatShow);
      else messagesToKeepInChatShow.push(lastUserMessage);
    }

    history.value = messagesToKeepInHistory;
    chat_show.value = messagesToKeepInChatShow;
  }


  loading.value = true; signalController.value = new AbortController();
  let aiResponse = null; scrollToBottom(true);

  const aiMessageHistoryIndex = history.value.length;
  const aiMessageChatShowIndex = chat_show.value.length;

  history.value.push({ role: "assistant", content: "" });
  chat_show.value.push({ role: "assistant", content: [{ type: "text", text: "" }], reasoning_content: "", status: "" });

  try {
    const messagesForAPI = JSON.parse(JSON.stringify(history.value.slice(0, aiMessageHistoryIndex)));
    senderFocus();
    aiResponse = await window.api.chatOpenAI(messagesForAPI, currentConfig.value, model.value, CODE.value, signalController.value.signal);
    if (!aiResponse?.ok && aiResponse?.status !== 200) {
      let errorMsg = `API 请求失败: ${aiResponse?.status} ${aiResponse?.statusText}`;
      try { const errorBody = await aiResponse?.text(); errorMsg += `\n${errorBody || '(No Response Body)'}`; } catch { }
      throw new Error(errorMsg);
    }

    if (!currentConfig.value.stream) {
      const data = await aiResponse.json();
      const reasoning_content = data.choices?.[0]?.message?.reasoning_content || '';
      const aiContent = data.choices?.[0]?.message?.content || '抱歉，未能获取到回复内容。';
      history.value[aiMessageHistoryIndex].content = aiContent;
      if (chat_show.value[aiMessageChatShowIndex]) {
        chat_show.value[aiMessageChatShowIndex].content[0].text = aiContent;
        chat_show.value[aiMessageChatShowIndex].reasoning_content = reasoning_content;
        chat_show.value[aiMessageChatShowIndex].status = reasoning_content ? "end" : "";
      }
    } else {
      scrollToBottom(true);
      const reader = aiResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        try {
          const { value, done } = await reader.read();
          if (done) {
            if (thinking.value && chat_show.value[aiMessageChatShowIndex]) {
              chat_show.value[aiMessageChatShowIndex].status = "end";
              thinking.value = false;
            } break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonString = line.substring(6).trim();
              if (jsonString === '[DONE]') {
                if (thinking.value && chat_show.value[aiMessageChatShowIndex]) {
                  chat_show.value[aiMessageChatShowIndex].status = "end";
                  thinking.value = false;
                } continue;
              }
              try {
                const parsedData = JSON.parse(jsonString);
                const reasoning_delta = parsedData.choices?.[0]?.delta?.reasoning_content;
                const deltaContent = parsedData.choices?.[0]?.delta?.content;

                if (chat_show.value[aiMessageChatShowIndex]) {
                  if (reasoning_delta !== undefined && reasoning_delta !== null && reasoning_delta) {
                    if (!thinking.value) {
                      chat_show.value[aiMessageChatShowIndex].reasoning_content += reasoning_delta;
                      chat_show.value[aiMessageChatShowIndex].status = "start"; thinking.value = true;
                    } else {
                      chat_show.value[aiMessageChatShowIndex].status = "thinking";
                      chat_show.value[aiMessageChatShowIndex].reasoning_content += reasoning_delta;
                    }
                  }
                  if (deltaContent !== undefined && deltaContent !== null && deltaContent) {
                    if (!is_think_flag && thinking.value) {
                      thinking.value = false;
                      chat_show.value[aiMessageChatShowIndex].status = "end";
                    }
                    if (!thinking.value && deltaContent.trimEnd() === "<think>") {
                      is_think_flag = true; thinking.value = true;
                      chat_show.value[aiMessageChatShowIndex].status = "start";
                      chat_show.value[aiMessageChatShowIndex].reasoning_content = "";
                    } else if (thinking.value && is_think_flag && deltaContent.trimEnd() === "</think>") {
                      thinking.value = false; is_think_flag = false;
                      chat_show.value[aiMessageChatShowIndex].status = "end";
                    } else if (thinking.value && is_think_flag) {
                      chat_show.value[aiMessageChatShowIndex].status = "thinking";
                      chat_show.value[aiMessageChatShowIndex].reasoning_content += deltaContent;
                    } else {
                      history.value[aiMessageHistoryIndex].content += deltaContent;
                      if (chat_show.value[aiMessageChatShowIndex].content[0]) chat_show.value[aiMessageChatShowIndex].content[0].text += deltaContent;
                      else chat_show.value[aiMessageChatShowIndex].content = [{ type: 'text', text: deltaContent }];
                    }
                  }
                } scrollToBottom();
              } catch (parseError) { }
            }
          }
        } catch (readError) {
          if (chat_show.value[aiMessageChatShowIndex]) {
            if (readError.name === 'AbortError') {
              if (chat_show.value[aiMessageChatShowIndex].content[0]) chat_show.value[aiMessageChatShowIndex].content[0].text += '\n(已取消)';
            } else {
              if (chat_show.value[aiMessageChatShowIndex].content[0]) chat_show.value[aiMessageChatShowIndex].content[0].text += `\n(读取流时出错: ${readError.message})`;
            }
            if (thinking.value) chat_show.value[aiMessageChatShowIndex].status = "error";
          }
          thinking.value = false; is_think_flag = false; break;
        }
      }
    }
  } catch (error) {
    let errorDisplay = `发生错误: ${error.message || '未知错误'}`;
    if (error.name === 'AbortError') errorDisplay = "请求已取消";
    if (history.value[aiMessageHistoryIndex]) {
      history.value[aiMessageHistoryIndex].content = `错误: ${errorDisplay}`;
    }
    if (chat_show.value[aiMessageChatShowIndex]) {
      chat_show.value[aiMessageChatShowIndex] = { role: "assistant", content: [{ type: "text", text: `错误: ${errorDisplay}` }], reasoning_content: "", status: "" };
    } else {
      chat_show.value.push({ role: "assistant", content: [{ type: "text", text: `错误: ${errorDisplay}` }], reasoning_content: "", status: "" });
    }

  } finally {
    loading.value = false; signalController.value = null;
    const lastChatMsg = chat_show.value[chat_show.value.length - 1];
    if (lastChatMsg && lastChatMsg.role === 'assistant' && thinking.value && !is_think_flag) {
      lastChatMsg.status = "end"; thinking.value = false;
    }
    is_think_flag = false; scrollToBottom();
  }
}

async function cancelAskAI() { if (loading.value && signalController.value) signalController.value.abort(); }
async function copyText(content, index) { if (loading.value && index === history.value.length - 1) return; await window.api.copyText(content); }
async function reaskAI() {
  if (loading.value || history.value.length === 0) return;
  const lastHistoryMessage = history.value[history.value.length - 1];
  if (lastHistoryMessage.role === "system") return;

  if (lastHistoryMessage.role === "assistant") {
    history.value.pop();
    chat_show.value.pop();
  } else if (lastHistoryMessage.role === "user") {
  }
  prompt.value = ""; await askAI(true);
}
function deleteMessage() {
  if (loading.value || history.value.length === 0) return;
  const lastMessage = history.value[history.value.length - 1];
  if (lastMessage.role === "system") return;
  history.value.pop(); chat_show.value.pop();
}
function clearHistory() {
  if (loading.value || history.value.length === 0) return;
  if (history.value[0].role === "system") {
    history.value = [history.value[0]]; chat_show.value = [chat_show.value[0]];
  } else { history.value = []; chat_show.value = []; }
  senderFocus();
  ElMessage.success('历史记录已清除');
}
function removeFile(index) { if (fileList.value.length === 0) return; fileList.value.splice(index, 1); }

// [REVISED] sendFile function using the new handler system
async function sendFile() {
  let contentList = [];
  if (fileList.value.length === 0) return contentList;

  for (const currentFile of fileList.value) {
    const handler = getFileHandler(currentFile.name);
    if (handler) {
      try {
        const processedContent = await handler(currentFile);
        if (processedContent) {
          contentList.push(processedContent);
        }
      } catch (error) {
        ElMessage.error(`处理文件 ${currentFile.name} 失败: ${error.message}`);
      }
    } else {
      ElMessage.warning(`文件类型不支持: ${currentFile.name}`);
    }
  }

  fileList.value = [];
  return contentList;
}

async function file2fileList(file, idx) {
  const isSessionFile = await checkAndLoadSessionFromFile(file);
  if (isSessionFile) {
    senderFocus();
    return;
  }

  return new Promise((resolve, reject) => {
    const handler = getFileHandler(file.name);
    if (!handler) {
      const errorMsg = `不支持的文件类型: ${file.name}`;
      ElMessage.warning(errorMsg);
      reject(new Error(errorMsg));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      fileList.value.push({
        uid: idx,
        name: file.name,
        size: file.size,
        type: file.type,
        url: e.target.result
      });
      resolve();
    };
    reader.onerror = () => {
      const errorMsg = `读取文件 ${file.name} 失败`;
      ElMessage.error(errorMsg);
      reject(new Error(errorMsg));
    }
    reader.readAsDataURL(file);
  });
}

async function uploadFiles(files) { await file2fileList(files.file, fileList.value.length + 1); senderFocus(); }
const handleDrop = async (event) => {
  event.preventDefault();
  for (const item of Array.from(event.dataTransfer.items)) {
    if (item.kind === 'file') {
      await file2fileList(item.getAsFile(), fileList.value.length + 1);
    }
  }
  senderFocus();
};
const handlePaste = async (event) => {
  for (const item of Array.from((event.clipboardData || event.originalEvent?.clipboardData || event.dataTransfer).items)) {
    if (item.kind === 'file') {
      await file2fileList(item.getAsFile(), fileList.value.length + 1);
      senderFocus();
    }
  }
};

async function processFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    ElMessage.error('无效的文件路径');
    return;
  }

  try {

    const fileObject = await window.api.handleFilePath(filePath);
    if (fileObject) {
      await file2fileList(fileObject, fileList.value.length + 1);
    } else {
      ElMessage.error('无法读取或访问该文件，请检查路径和权限');
    }
  } catch (error) {
    console.error('调用 handleFilePath 时发生意外错误:', error);
    ElMessage.error('处理文件路径时发生未知错误');
  }
}

</script>
<template>
  <main>
    <el-container>

      <!-- <TitleBar :isDarkMode="currentConfig.isDarkMode" :os="basic_msg.os" :title="basic_msg.code"/> -->

      <!-- [MODIFIED] 优化后的头部 -->
      <el-header class="header">
        <div class="header-content-wrapper">
          <!-- 左侧：图标按钮 -->
          <div class="header-left">
            <el-tooltip content="保存窗口大小和位置" placement="bottom">
              <el-button @click="saveWindowSize">
                <img :src="favicon" class="windows-logo" alt="App logo">
              </el-button>
            </el-tooltip>
          </div>

          <!-- 中间：模型选择器（可伸缩） -->
          <div class="header-center">
            <el-button class="model-selector-btn" @click="changeModel_page = true">
              {{ modelMap[model] || '选择模型' }}
            </el-button>
          </div>

          <!-- 右侧：功能按钮组 -->
          <div class="header-right">
            <el-tooltip :content="autoCloseOnBlur ? '保持窗口开启' : '失焦时自动关闭窗口'" placement="bottom">
              <el-button @click="changeAutoCloseOnBlur">
                <svg v-show="autoCloseOnBlur" viewBox="0 0 24 24" width="16" height="16">
                  <path fill="currentColor"
                    d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                </svg>
                <svg v-show="!autoCloseOnBlur" viewBox="0 0 24 24" width="16" height="16">
                  <path fill="currentColor"
                    d="M12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-9h-1V7c0-2.76-2.24-5-5-5S7 4.24 7 7v1H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 7c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v1H8.9V7z" />
                </svg>
              </el-button>
            </el-tooltip>
            <el-tooltip :content="temporary ? '无记忆模式' : '记忆模式'" placement="bottom">
              <el-button @click="temporary = !temporary" :icon="temporary ? Lollipop : CoffeeCup" />
            </el-tooltip>
            <!-- [MODIFIED] Save button now calls the new action handler -->
            <el-tooltip content="保存会话" placement="bottom">
              <el-button @click="handleSaveAction" :icon="Download" />
            </el-tooltip>
          </div>
        </div>
      </el-header>

      <el-main class="chat-main custom-scrollbar">
        <div class="chat-message" v-for="(message, index) in chat_show" :key="index">
          <div v-if="message.role === 'system'" class="system-prompt-container"
            @click="showFullSystemPrompt(message.content)">
            <p class="system-prompt-preview">{{ String(message.content) }}</p>
          </div>

          <Bubble v-if="message.role === 'user'" class="user-bubble" placement="end" shape="corner" maxWidth="2000px"
            variant="shadow" :avatar="UserAvart" avatar-size="40px">
            <template #content>
              <div class="markdown-body" v-html="renderMarkdown(message)"></div>
            </template>
            <template #footer>
              <div class="file-list-container" v-if="formatMessageFile(message.content).length > 0">
                <el-tooltip v-for="(file_name, idx) in formatMessageFile(message.content)" :key="idx"
                  :content="file_name" placement="top" :disabled="file_name.length < 20"><el-button class="file-button"
                    type="info" plain size="small" :icon="Document">{{ file_name }}</el-button></el-tooltip>
              </div>
              <el-button :icon="DocumentCopy" @click="copyText(formatMessageText(message.content), index);" size="small"
                circle />
              <el-button v-if="message === chat_show[chat_show.length - 1]" :icon="Refresh" @click="reaskAI()"
                size="small" circle />
              <el-button v-if="message === chat_show[chat_show.length - 1]" :icon="Delete" size="small"
                @click="deleteMessage()" circle />
            </template>
          </Bubble>

          <Bubble v-if="message.role === 'assistant'" class="ai-bubble" placement="start" shape="corner"
            variant="shadow" maxWidth="2000px" :avatar="AIAvart" avatar-size="40px">
            <template #header>
              <Thinking v-if="message.status && message.status.length > 0" maxWidth="90%"
                :content="message.reasoning_content" :modelValue="false">
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
              <div class="markdown-body" v-html="renderMarkdown(message)"></div>
            </template>
            <template #footer>
              <el-button :icon="DocumentCopy" @click="copyText(formatMessageText(message.content), index);" size="small"
                circle />
              <el-button v-if="index === chat_show.length - 1" :icon="Refresh" @click="reaskAI()" size="small" circle />
              <el-button v-if="index === chat_show.length - 1" :icon="Delete" size="small" @click="deleteMessage()"
                circle />
            </template>
          </Bubble>
        </div>
      </el-main>
      <el-footer class="input-footer">
        <el-row><el-col :span="1" /><el-col :span="22">
            <Attachments.FileCard v-if="fileList.length > 0" v-for="(file, index) in fileList" :key="index" :item="file"
              v-on:remove="removeFile(index)" :style="{ 'display': 'flex', 'float': 'left' }" />
          </el-col><el-col :span="1" /></el-row>
        <el-row><el-col :span="1" /><el-col :span="22">
            <Sender class="chat-sender" ref="senderRef" v-model="prompt" placeholder="在此输入，或拖拽会话文件以加载"
              :loading="loading" @submit="askAI(false)" @cancel="cancelAskAI()"
              :submit-type="currentConfig.CtrlEnterToSend ? 'shiftEnter' : 'enter'"
              @keyup.ctrl.enter="currentConfig.CtrlEnterToSend ? askAI(false) : ''" @drop="handleDrop"
              @paste="handlePaste" :submitBtnDisabled="false">
              <template #prefix><el-button :icon="Delete" size="default" @click="clearHistory()" circle />
                <attachmentsNode />
              </template>
            </Sender>
          </el-col><el-col :span="1" /></el-row>
      </el-footer>
    </el-container>
  </main>
  <!-- System prompt dialog -->
  <el-dialog v-model="systemPromptDialogVisible" custom-class="system-prompt-dialog" width="60%" :show-close="true"
    :lock-scroll="false" :append-to-body="true" center :close-on-click-modal="true" :close-on-press-escape="true">
    <pre class="system-prompt-full-content">{{ systemPromptContent }}</pre>
  </el-dialog>
  <el-image-viewer v-if="imageViewerVisible" :url-list="imageViewerSrcList" :initial-index="imageViewerInitialIndex"
    @close="imageViewerVisible = false" :hide-on-click-modal="true" teleported />
  <el-dialog title="选择模型" v-model="changeModel_page" width="70%" custom-class="model-dialog">
    <el-table :data="modelList" stripe style="width: 100%; height: 400px;" :max-height="400" :border="true"
      :span-method="tableSpanMethod" width="100%">
      <el-table-column label="服务商" align="center" prop="provider" width="100"><template #default="scope"><strong>{{
        scope.row.label.split("|")[0] }}</strong></template></el-table-column>
      <el-table-column label="模型" align="center" prop="modelName"><template #default="scope"><el-button link
            size="large" @click="changeModel_function(scope.row.value)" :disabled="scope.row.value === model">{{
              scope.row.label.split("|")[1] }}</el-button></template></el-table-column>
    </el-table>
    <template #footer><el-button @click="changeModel_page = false">关闭</el-button></template>
  </el-dialog>
  <!-- [REMOVED] Old Save Session Dialog -->
</template>

<style>
/* ... All previous global styles remain unchanged ... */
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
  background: #212327;
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
  background: #212327;
}

html.dark pre.hljs::-webkit-scrollbar-thumb {
  background-color: #4f4f4f;
  border-radius: 6px;
  border: 3px solid #212327;
}

html.dark pre.hljs::-webkit-scrollbar-thumb:hover {
  background-color: #6a6a6a;
}

html.dark pre.hljs::-webkit-scrollbar-corner {
  background-color: #212327;
}

.system-prompt-dialog .el-dialog__header {
  display: none;
}

.system-prompt-dialog .el-dialog__body {
  padding: 25px 30px;
}

.system-prompt-dialog {
  background-color: rgba(255, 255, 255, 0.9) !important;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 12px !important;
  box-shadow: var(--el-box-shadow-light);
}

.system-prompt-dialog .el-dialog__headerbtn .el-icon {
  color: var(--el-text-color-regular);
}

.system-prompt-dialog .el-dialog__headerbtn .el-icon:hover {
  color: var(--el-color-primary);
}

html.dark .system-prompt-dialog {
  background-color: rgba(40, 42, 48, 0.85) !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.system-prompt-full-content {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  max-height: 60vh;
  overflow-y: auto;
}

html.dark .system-prompt-full-content {
  color: var(--el-text-color-regular);
}

.system-prompt-full-content::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.system-prompt-full-content::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.system-prompt-full-content::-webkit-scrollbar-thumb {
  background: var(--el-text-color-disabled, #c0c4cc);
  border-radius: 4px;
  border: 2px solid transparent;
  background-clip: content-box;
}

.system-prompt-full-content::-webkit-scrollbar-thumb:hover {
  background: var(--el-text-color-secondary, #909399);
  background-clip: content-box;
}

html.dark .system-prompt-full-content::-webkit-scrollbar-thumb {
  background: #6b6b6b;
}

html.dark .system-prompt-full-content::-webkit-scrollbar-thumb:hover {
  background: #999;
}
</style>

<style scoped lang="less">
.el-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color-page);
  color: var(--el-text-color-primary);
}

/* [MODIFIED] 优化后的头部样式 */
.header {
  height: 40px;
  width: 100%;
  padding: 0;
  flex-shrink: 0;
  z-index: 10;
  background-color: var(--el-bg-color);
  display: flex;
  align-items: center;
}

.header-content-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 10px;
}

.header-left,
.header-right {
  flex-shrink: 0;
}

.header-center {
  flex-grow: 1;
  min-width: 0;
  /* 允许中间部分在空间不足时收缩 */
  text-align: center;
}

.header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  /* 为右侧按钮组提供一致的间距 */
}

.header .el-button {
  height: 30px;
  /* 统一按钮高度 */
  width: 30px;
  /* 统一按钮宽度 */
  padding: 0;
  margin: 0;
  border: none;
  background-color: transparent;
  color: var(--el-text-color-regular);
  border-radius: var(--el-border-radius-base);
  transition: background-color .2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header .el-button:hover:not(:disabled) {
  background-color: var(--el-fill-color-light);
}

.header .windows-logo {
  width: 18px;
  height: 18px;
  cursor: pointer;
  vertical-align: middle;
}

.header .model-selector-btn {
  max-width: 100%;
  width: auto;
  height: 32px;
  padding: 0 10px;
  margin: 0 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Microsoft YaHei', sans-serif;
  font-size: var(--el-font-size-normal);
  color: var(--el-text-color-primary);
}


.chat-main {
  flex-grow: 1;
  padding-left: 10px;
  padding-right: 10px;
  padding-top: 0;
  padding-bottom: 0;
  margin: 0;
  overflow-y: auto;
  scroll-behavior: smooth;
  background-color: var(--el-bg-color);
}

.chat-message {
  margin: 10px 0 0 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}

.chat-message .user-bubble {
  align-self: flex-end;
  max-width: 80%;

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
  max-width: 95%;
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

/* [MODIFIED] System Prompt Preview Styles */
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

  &,
  * {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  }

  font-size: var(--el-font-size-base);
  line-height: 1.7;
  word-wrap: break-word;
  color: var(--el-text-color-primary);
  max-width: 80vw;
  overflow-x: auto;

  p {
    margin-top: 0;
    margin-bottom: 12px;
  }

  p:last-child {
    margin-bottom: 0;
  }

  pre.hljs,
  p>code:not(.hljs),
  li>code:not(.hljs) {

    &,
    * {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
    }
  }

  pre.hljs {
    display: block;
    overflow: auto;
    padding: 1em;
    border-radius: var(--el-border-radius-base);
    max-height: 400px;
    margin: .5em 0 1em 0;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;

    code.hljs {
      font-size: 0.9em;
      padding: 0;
      background-color: transparent !important;
    }
  }

}

.chat-message :deep(.markdown-body strong),
.chat-message :deep(.markdown-body b) {
  font-weight: 600;
  color: inherit;
}

.ai-bubble :deep(.markdown-body) {
  color: var(--el-text-color-regular);
}

.chat-message :deep(.markdown-body h1),
.chat-message :deep(.markdown-body h2),
.chat-message :deep(.markdown-body h3),
.chat-message :deep(.markdown-body h4),
.chat-message :deep(.markdown-body h5),
.chat-message :deep(.markdown-body h6) {
  margin-top: 1.2em;
  margin-bottom: 0.6em;
  font-weight: 600;
  line-height: 1.25;
  color: var(--el-text-color-primary);
}

html.dark .chat-message :deep(.markdown-body h1),
html.dark .chat-message :deep(.markdown-body h2),
html.dark .chat-message :deep(.markdown-body h3),
html.dark .chat-message :deep(.markdown-body h4),
html.dark .chat-message :deep(.markdown-body h5),
html.dark .chat-message :deep(.markdown-body h6) {
  color: var(--el-text-color-primary);
}

.chat-message :deep(.markdown-body h1) {
  font-size: 1.8em;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 0.3em;
}

.chat-message :deep(.markdown-body h2) {
  font-size: 1.5em;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 0.3em;
}

.chat-message :deep(.markdown-body h3) {
  font-size: 1.3em;
}

.chat-message :deep(.markdown-body h4) {
  font-size: 1.15em;
}

.chat-message :deep(.markdown-body h5) {
  font-size: 1em;
}

.chat-message :deep(.markdown-body h6) {
  font-size: 0.9em;
  color: var(--el-text-color-secondary);
}

html.dark .chat-message :deep(.markdown-body h1),
html.dark .chat-message :deep(.markdown-body h2) {
  border-bottom-color: var(--el-border-color-light);
}

.chat-message :deep(.markdown-body ul),
.chat-message :deep(.markdown-body ol) {
  padding-left: 2em;
}

.chat-message :deep(.markdown-body li) {
  margin-bottom: 0.3em;
}

.chat-message :deep(.markdown-body li > p) {
  margin-bottom: 0.5em;
}

.chat-message :deep(.markdown-body blockquote) {
  padding: 0.5em 1em;
  margin-left: 0;
  color: var(--el-text-color-secondary);
  border-left: 0.25em solid var(--el-border-color-lighter);
  background-color: var(--el-fill-color-lightest);
}

html.dark .chat-message :deep(.markdown-body blockquote) {
  color: var(--el-color-info);
  border-left-color: var(--el-border-color-darker);
  background-color: var(--el-fill-color-dark);
}

.chat-message :deep(.markdown-body blockquote p) {
  margin-bottom: 0.5em;
}

.chat-message :deep(.markdown-body blockquote p:last-child) {
  margin-bottom: 0;
}

.chat-message :deep(.markdown-body a) {
  color: var(--el-color-primary);
  text-decoration: none;
  font-weight: 500;
}

.chat-message :deep(.markdown-body a:hover) {
  text-decoration: underline;
  color: var(--el-color-primary-light-3);
}

html.dark .chat-message :deep(.markdown-body a) {
  color: var(--el-color-primary-light-5);
}

html.dark .chat-message :deep(.markdown-body a:hover) {
  color: var(--el-color-primary-light-7);
}

.chat-message :deep(.markdown-body hr) {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: var(--el-border-color-lighter);
  border: 0;
}

html.dark .chat-message :deep(.markdown-body hr) {
  background-color: var(--el-border-color-light);
}

.chat-message :deep(.markdown-body table) {
  border-collapse: collapse;
  width: auto;
  max-width: 100%;
  margin-top: 1em;
  margin-bottom: 1em;
  display: table;
  overflow-x: auto;
}

.chat-message :deep(.markdown-body th),
.chat-message :deep(.markdown-body td) {
  border: 1px solid var(--el-border-color-lighter);
  padding: 8px 12px;
  text-align: left;
  color: var(--el-text-color-regular);
  background-color: var(--el-bg-color);
}

.chat-message :deep(.markdown-body th) {
  font-weight: 600;
  background-color: var(--el-fill-color-lighter);
  color: var(--el-text-color-primary);
}

html.dark .chat-message :deep(.markdown-body th) {
  background-color: var(--el-fill-color-dark);
}

html.dark .chat-message :deep(.markdown-body td) {
  border-color: var(--el-border-color-darker);
}

.chat-message :deep(.markdown-body .code-block-wrapper) {
  position: relative;
  margin: .5em 0 1em 0;

  pre.hljs {
    margin: 0;
  }
}

.chat-message :deep(.markdown-body .code-block-wrapper .code-block-copy-button) {
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

.chat-message :deep(.markdown-body .code-block-wrapper .code-block-copy-button svg) {
  display: block;
}

.chat-message :deep(.markdown-body .code-block-wrapper:hover .code-block-copy-button) {
  opacity: 1;
}

.chat-message :deep(.markdown-body .code-block-wrapper .code-block-copy-button:hover) {
  background-color: rgba(180, 180, 180, .9);
}

.chat-message :deep(.markdown-body .code-block-wrapper .code-block-copy-button-top) {
  top: 8px;
  right: 8px;
}

.chat-message :deep(.markdown-body .code-block-wrapper .code-block-copy-button-bottom) {
  bottom: 8px;
  right: 8px;
}

html.dark .chat-message :deep(.markdown-body .code-block-wrapper .code-block-copy-button) {
  background-color: rgba(80, 80, 80, .7);
  border-color: rgba(120, 120, 120, .5);
  color: #ccc;
}

html.dark .chat-message :deep(.markdown-body .code-block-wrapper .code-block-copy-button:hover) {
  background-color: rgba(100, 100, 100, .9);
}

.chat-message :deep(.markdown-body p > code:not(.hljs)),
.chat-message :deep(.markdown-body li > code:not(.hljs)) {
  background-color: var(--el-color-info-light-9);
  color: var(--el-text-color-regular);
  padding: .2em .4em;
  border-radius: var(--el-border-radius-small);
  font-size: 85%;
}

.chat-message :deep(.markdown-body img) {
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

html.dark .chat-message :deep(.markdown-body img) {
  border-color: var(--el-border-color-darker);
}

.chat-message :deep(.image-error-container) {
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

.chat-message :deep(.image-retry-button) {
  padding: 8px 16px;
  border: none;
  background-color: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  border-radius: var(--el-border-radius-small);
  transition: background-color 0.2s, color 0.2s;
}

.chat-message :deep(.image-retry-button:hover) {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

html.dark .chat-message :deep(.image-error-container) {
  border-color: var(--el-border-color-darker);
  background-color: var(--el-fill-color-dark);
}

html.dark .chat-message :deep(.image-retry-button:hover) {
  background-color: var(--el-color-primary-dark-2);
  color: var(--el-color-primary-light-7);
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

html.dark .chat-message :deep(.markdown-body) {
  color: var(--el-text-color-regular);
}

html.dark .chat-message :deep(.markdown-body p > code:not(.hljs)),
html.dark .chat-message :deep(.markdown-body li > code:not(.hljs)) {
  background-color: var(--el-fill-color-darker);
  color: var(--el-color-info-light-3);
}

html.dark .ai-bubble :deep(.el-thinking .trigger) {
  background-color: var(--el-fill-color-dark);
  color: var(--el-text-color-primary);
  border-color: var(--el-border-color-darker);
}

html.dark .ai-bubble :deep(.el-thinking .el-icon) {
  color: var(--el-text-color-secondary);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--el-text-color-disabled, #c0c4cc);
  border-radius: 4px;
  border: 2px solid transparent;
  background-clip: content-box;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--el-text-color-secondary, #909399);
  background-clip: content-box;
}

html.dark .custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

html.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: #6b6b6b;
  background-clip: content-box;
}

html.dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #999;
  background-clip: content-box;
}


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