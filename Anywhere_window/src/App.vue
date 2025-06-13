<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, computed, h, watch } from 'vue';
import { Bubble, Sender, Thinking } from 'vue-element-plus-x';
import { Attachments } from 'ant-design-x-vue';
import { ElContainer, ElHeader, ElMain, ElFooter, ElButton, ElDialog, ElTable, ElTableColumn, ElTooltip, ElRow, ElCol, ElMessage, ElImageViewer } from 'element-plus';
import { DocumentCopy, Refresh, Delete, CoffeeCup, Lollipop, Link, Document } from '@element-plus/icons-vue'

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

// [NEW & IMPROVED] Centralized file handling configuration
const fileHandlers = {
  text: {
    extensions: [
      // Common text files
      '.txt', '.md', '.markdown', '.json', '.xml', '.html', '.css', '.csv',
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
          file_data: file.url.substring(commaIndex + 1)
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

const customContent = ref(true);
const attachmentsNode = computed(() => h(Attachments, {
  beforeUpload: () => false,
  onChange: uploadFiles,
  children: customContent.value && h(ElButton, { type: 'default', icon: h(Link), circle: true }),
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
        history.value.push({ role: "user", content: basic_msg.value.payload });
        chat_show.value.push({ role: "user", content: [{ type: "text", text: basic_msg.value.payload }] });
        scrollToBottom(true); await askAI(true);
      } else if (basic_msg.value.type === "img" && basic_msg.value.payload) {
        history.value.push({ role: "user", content: [{ type: "image_url", image_url: { url: String(basic_msg.value.payload) } }] });
        chat_show.value.push({ role: "user", content: [{ type: "image_url", image_url: { url: String(basic_msg.value.payload) } }] });
        scrollToBottom(true); await askAI(true);
      } else if (basic_msg.value.type === "files" && basic_msg.value.payload){
        for (let i = 0; i < basic_msg.value.payload.length; i++) {
          processFilePath(basic_msg.value.payload[i].path);
        }
        scrollToBottom(true);
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
      history.value = [{ role: "system", content: currentPromptConfig?.prompt || "" }];
      chat_show.value = [{ role: "system", content: currentPromptConfig?.prompt || "" }];
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
  // 非列表
  if (!Array.isArray(content)) {
    // 文本文件
    if (String(content).toLowerCase().startsWith('file name:') && String(content).toLowerCase().endsWith('file end')) { return ""; }
    // 文本内容
    else return String(content);
  }

  let markdownString = "";
  // 列表
  content.forEach(part => {
    // 文本文件
    if (part.type === 'text' && part.text && part.text.toLowerCase().startsWith('file name:') && part.text.toLowerCase().endsWith('file end')) { }
    // 图片文件（一定是列表）
    else if (part.type === 'image_url' && part.image_url?.url) markdownString += `\n\n![Image](${part.image_url.url})\n`;
    // 音频文件
    else if (part.type === 'input_audio' && part.input_audio?.data) {
      let data_url = "";
      markdownString += `\n\n<audio id="audio" controls="" preload="none">\n<source id="${part.input_audio.format}" src="data:audio/${part.input_audio.format};base64,${part.input_audio.data}">\n</audio>\n`;
    }
    // 文本内容
    else if (part.type === 'text' && part.text) markdownString += part.text;
  });
  return markdownString;
};

const formatMessageFile = (content) => {
  let files = [];
  // 非列表
  if (!Array.isArray(content)) {
    // 文本文件
    if (String(content).toLowerCase().startsWith('file name:') && String(content).toLowerCase().endsWith('file end')) {
      files.push(String(content).split('\n')[0].replace('file name:', '').trim());
    }
    // 其他
    else return [];
  }
  // 列表
  else {
    content.forEach(part => {
      // 文本文件 
      if (part.type === 'text' && part.text && part.text.toLowerCase().startsWith('file name:') && part.text.toLowerCase().endsWith('file end')) {
        files.push(part.text.split('\n')[0].replace('file name:', '').trim());
      }
      // PDF文件（一定是列表）
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
function saveWindowSize() {
  currentConfig.value.window_height = window.innerHeight; currentConfig.value.window_width = window.innerWidth;
  currentConfig.value.position_x = window.screenX;
  currentConfig.value.position_y = window.screenY;
  saveConfig(); ElMessage.success('窗口大小位置已保存');
}

async function askAI(forceSend = false) {
  senderFocus();
  if (loading.value) return;
  let is_think_flag = false;  // 是否是<think>...</think>块

  if (!forceSend) {
    let file_content = await sendFile();
    const promptText = prompt.value.trim();
    if ((file_content && file_content.length > 0) || promptText) {
      const userContentList = [];
      if (promptText) userContentList.push({ type: "text", text: promptText });
      if (file_content && file_content.length > 0) userContentList.push(...file_content);
      if (userContentList.length == 1 && userContentList[0].type === "text") {
        history.value.push({ role: "user", content: userContentList[0]["text"] });
        chat_show.value.push({ role: "user", content: [{ type: "text", text: userContentList[0]["text"] }] });
      }
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

function file2fileList(file, idx) {
  const handler = getFileHandler(file.name);
  if (!handler) {
    ElMessage.warning(`不支持的文件类型: ${file.name}`);
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
  };
  reader.onerror = () => ElMessage.error(`读取文件 ${file.name} 失败`);
  reader.readAsDataURL(file);
}

function uploadFiles(files) { file2fileList(files.file, fileList.value.length + 1); }
const handleDrop = (event) => { event.preventDefault(); Array.from(event.dataTransfer.items).forEach((item, i) => { if (item.kind === 'file') file2fileList(item.getAsFile(), fileList.value.length + i + 1); }); };
const handlePaste = (event) => { Array.from((event.clipboardData || event.originalEvent?.clipboardData || event.dataTransfer).items).forEach((item, i) => { if (item.kind === 'file') file2fileList(item.getAsFile(), fileList.value.length + i + 1); }); };

// 选中文件转为文件列表（文件路径=>文件对象=>文件列表）
async function processFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    ElMessage.error('无效的文件路径');
    return;
  }

  try {
    // 调用通过 contextBridge 暴露的后端函数
    const fileObject = await window.api.handleFilePath(filePath);
    
    // 检查后端是否成功处理并返回了 File 对象
    if (fileObject) {
      file2fileList(fileObject, fileList.value.length + 1);
      ElMessage.success(`文件 ${fileObject.name} 已添加`);
    } else {
      // 如果 fileObject 为 null，说明后端处理失败
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
      <el-header class="header">
        <el-row>
          <el-col :span="1"></el-col>
          <el-col :span="2"><el-tooltip content="Save window size and position" placement="bottom"><el-button
                @click="saveWindowSize"><img :src="favicon" class="windows-logo"
                  alt="App logo"></el-button></el-tooltip></el-col>
          <el-col :span="18"><el-button class="model-selector-btn" @click="changeModel_page = true">{{ modelMap[model]
            || 'Choose Model' }}</el-button></el-col>
          <el-col :span="1"><el-tooltip :content="autoCloseOnBlur ? 'Keep opening window' : 'focus off to close window'"
              placement="bottom"><el-button @click="changeAutoCloseOnBlur"><svg v-if="autoCloseOnBlur"
                  viewBox="0 0 24 24" width="16" height="16">
                  <path fill="currentColor"
                    d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                </svg><svg v-else viewBox="0 0 24 24" width="16" height="16">
                  <path fill="currentColor"
                    d="M12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-9h-1V7c0-2.76-2.24-5-5-5S7 4.24 7 7v1H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 7c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v1H8.9V7z" />
                </svg></el-button></el-tooltip></el-col>
          <el-col :span="2"><el-tooltip :content="temporary ? 'No memory' : 'Memory'" placement="bottom"><el-button
                @click="temporary = !temporary" :icon="temporary ? Lollipop : CoffeeCup" /></el-tooltip></el-col>
        </el-row>
      </el-header>
      <el-main class="chat-main custom-scrollbar">
        <div class="chat-message" v-for="(message, index) in chat_show" :key="index">
          <Bubble v-if="message.role === 'system'" class="system-bubble" placement="start" maxWidth="2000px"
            shape="round" variant="outlined" :content="String(message.content)"></Bubble>

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
                :content="message.reasoning_content" :status="message.status" :modelValue="false">
                <template #error v-if="message.status === 'error' && message.status">{{ message.reasoning_content
                }}</template>
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
            <Sender class="chat-sender" ref="senderRef" v-model="prompt" placeholder="Ask Anything!" :loading="loading"
              @submit="askAI(false)" @cancel="cancelAskAI()"
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
  <el-image-viewer v-if="imageViewerVisible" :url-list="imageViewerSrcList" :initial-index="imageViewerInitialIndex"
    @close="imageViewerVisible = false" :hide-on-click-modal="true" teleported />
  <el-dialog title="Models" v-model="changeModel_page" width="70%" custom-class="model-dialog">
    <el-table :data="modelList" stripe style="width: 100%; height: 400px;" :max-height="400" :border="true"
      :span-method="tableSpanMethod" width="100%">
      <el-table-column label="Provider" align="center" prop="provider" width="100"><template #default="scope"><strong>{{
        scope.row.label.split("|")[0] }}</strong></template></el-table-column>
      <el-table-column label="Model" align="center" prop="modelName"><template #default="scope"><el-button link
            size="large" @click="changeModel_function(scope.row.value)" :disabled="scope.row.value === model">{{
              scope.row.label.split("|")[1] }}</el-button></template></el-table-column>
    </el-table>
    <template #footer><el-button @click="changeModel_page = false">关闭</el-button></template>
  </el-dialog>
</template>

<style>
/* 1. KaTeX 公式样式 (Unchanged) */
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


/* 2. Highlight.js Light Theme (Unchanged) */
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

/* 3. Highlight.js Dark Theme (Optimized with a new color palette) */
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


/* 4. Code Block Scrollbar Style (Completely Redesigned) */
pre.hljs::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

pre.hljs::-webkit-scrollbar-track {
  background: #FFFFFF;
  /* Match light theme bg */
}

pre.hljs::-webkit-scrollbar-thumb {
  background-color: #d0d7de;
  border-radius: 6px;
  border: 3px solid #FFFFFF;
  /* Padding effect */
}

pre.hljs::-webkit-scrollbar-thumb:hover {
  background-color: #afb8c1;
}

pre.hljs::-webkit-scrollbar-corner {
  background-color: #FFFFFF;
  /* Fixes corner artifact */
}

/* Dark mode scrollbar styles */
html.dark pre.hljs::-webkit-scrollbar-track {
  background: #212327;
  /* Match new dark theme bg */
}

html.dark pre.hljs::-webkit-scrollbar-thumb {
  background-color: #4f4f4f;
  border-radius: 6px;
  border: 3px solid #212327;
  /* Padding effect */
}

html.dark pre.hljs::-webkit-scrollbar-thumb:hover {
  background-color: #6a6a6a;
}

html.dark pre.hljs::-webkit-scrollbar-corner {
  background-color: #212327;
  /* Fixes corner artifact */
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

.header {
  height: 40px;
  width: 100%;
  padding: 0 5px;
  flex-shrink: 0;
  z-index: 10;
  background-color: var(--el-bg-color);
}

.header .el-row,
.header .el-col {
  height: 100%;
  width: 100%;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header .el-col .el-button {
  height: 100%;
  width: auto;
  min-width: 30px;
  padding: 0 8px;
  margin: 0 2px;
  border: none;
  background-color: transparent;
  font-size: 14px;
  font-weight: normal;
  color: var(--el-text-color-regular);
  border-radius: var(--el-border-radius-base);
  transition: background-color .2s ease;
}

.header .el-col .el-button:hover:not(:disabled) {
  background-color: var(--el-fill-color-light);
}

.header .el-col .el-button .windows-logo {
  width: 18px;
  height: 18px;
  cursor: pointer;
  vertical-align: middle;
}

.header .el-col .model-selector-btn {
  max-width: 100%;
  padding: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  justify-content: center;
  width: 100%;
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

  // 修改用户气泡在浅色模式下的背景色
  :deep(.el-bubble-content-wrapper .el-bubble-content-shadow) {
    background-color: #F4F4F4;
  }
}

// 修改用户气泡在深色模式下的背景色
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

  // 修改AI气泡在浅色模式下的背景色
  :deep(.el-bubble-content-wrapper .el-bubble-content-shadow) {
    background-color: #F0F2F5;
  }
}

// 修改AI气泡在深色模式下的背景色
html.dark .chat-message .ai-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content-shadow) {
    background: #404045;
  }
}

.chat-message .system-bubble {
  width: auto;
  max-width: 90%;
  margin: 8px auto 18px auto;
  align-self: center;
  font-size: var(--el-font-size-small);
  color: var(--el-text-color-secondary);
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

    // [修改] 将所有代码相关的字体设置集中到这里
    &,
    * {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
    }
  }

  /* START: MODIFIED CODE BLOCK */
  pre.hljs {
    display: block;
    overflow: auto;
    /* Handles vertical scroll for max-height and prevents horizontal scroll if wrapping works. */
    padding: 1em;
    border-radius: var(--el-border-radius-base);
    max-height: 400px;
    margin: .5em 0 1em 0;
    line-height: 1.5;
    white-space: pre-wrap;
    /* Allow content to wrap. */
    word-break: break-all;
    /* Break long words to prevent overflow. */

    code.hljs {
      font-size: 0.9em;
      /* Wrapping is now handled by the parent 'pre' element. */
      padding: 0;
      background-color: transparent !important;
    }
  }

  /* END: MODIFIED CODE BLOCK */
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
  color: var(--el-text-color-placeholder);
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

html.dark .chat-message .system-bubble {
  font-size: var(--el-font-size-small);
  color: var(--el-text-color-secondary);
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