<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch, h, computed } from 'vue';
import { ElContainer, ElMain, ElDialog, ElTooltip, ElImageViewer, ElMessage, ElMessageBox, ElInput, ElButton } from 'element-plus';
import { createClient } from "webdav/web";

import ChatHeader from './components/ChatHeader.vue';
import ChatMessage from './components/ChatMessage.vue';
import ChatInput from './components/ChatInput.vue';
import ModelSelectionDialog from './components/ModelSelectionDialog.vue';

import { DocumentCopy, Download } from '@element-plus/icons-vue';

const chatInputRef = ref(null);
const lastSelectionStart = ref(null);
const lastSelectionEnd = ref(null);
const chatContainerRef = ref(null);
const isAtBottom = ref(true);
const showScrollToBottomButton = ref(false);
const isForcingScroll = ref(false);
const messageRefs = new Map();
const focusedMessageIndex = ref(null);

const setMessageRef = (el, index) => {
  if (el) messageRefs.set(index, el);
  else messageRefs.delete(index, el);
};

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
    extensions: ['.txt', '.md', '.markdown', '.json', '.xml', '.html', '.css', '.py', '.js', '.ts', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.php', '.rb', '.rs', '.sh', '.sql', '.vue'],
    handler: async (file) => ({ type: "text", text: `file name:${file.name}\nfile content:${await parseTextFile(file.url)}\nfile end` })
  },
  docx: {
    extensions: ['.docx'],
    handler: async (file) => ({ type: "text", text: `file name:${file.name}\nfile content:${await parseWord(file.url)}\nfile end` })
  },
  excel: {
    extensions: ['.xlsx', '.xls', '.csv'],
    handler: async (file) => ({ type: "text", text: `file name:${file.name}\nfile content:${await parseExcel(file.url)}\nfile end` })
  },
  image: {
    extensions: ['.png', '.jpg', '.jpeg', '.webp'],
    handler: async (file) => ({ type: "image_url", image_url: { url: file.url } })
  },
  audio: {
    extensions: ['.mp3', '.wav'],
    handler: async (file) => {
      const commaIndex = file.url.indexOf(',');
      if (commaIndex > -1) return { type: "input_audio", input_audio: { data: file.url.substring(commaIndex + 1), format: file.name.split('.').pop().toLowerCase() } };
      ElMessage.error(`音频文件 ${file.name} 格式不正确`); return null;
    }
  },
  pdf: {
    extensions: ['.pdf'],
    handler: async (file) => ({ type: "file", file: { filename: file.name, file_data: file.url } })
  }
};

const getFileHandler = (fileName) => {
  if (!fileName) return null;
  const extension = ('.' + fileName.split('.').pop()).toLowerCase();
  for (const category in fileHandlers) {
    if (fileHandlers[category].extensions.includes(extension)) return fileHandlers[category].handler;
  }
  return null;
};

const defaultConfig = window.api.defaultConfig;
const UserAvart = ref("user.png");
const AIAvart = ref("ai.svg");
const favicon = ref("favicon.png");
const CODE = ref("");

const isInit = ref(false);
const basic_msg = ref({ os: "macos", code: "AI", type: "over", payload: "请简洁地介绍一下你自己" });
const currentConfig = ref(defaultConfig.config);
const autoCloseOnBlur = ref(false);
const modelList = ref([]);
const modelMap = ref({});
const model = ref("");
const temporary = ref(false);

const currentProviderID = ref(defaultConfig.config.providerOrder[0]);
const base_url = ref("");
const api_key = ref("");
const history = ref([]);
const chat_show = ref([]);
const thinking = ref(false);
const loading = ref(false);
const prompt = ref("");
const signalController = ref(null);
const fileList = ref([]);
const zoomLevel = ref(1);
const collapsedMessages = ref(new Set());
const defaultConversationName = ref("");
const selectedVoice = ref(null);
const tempReasoningEffort = ref('default');
const messageIdCounter = ref(0);
const sourcePromptConfig = ref(null);

const inputLayout = computed(() => currentConfig.value.inputLayout || 'horizontal');


const changeModel_page = ref(false);
const systemPromptDialogVisible = ref(false);
const systemPromptContent = ref('');
const imageViewerVisible = ref(false);
const imageViewerSrcList = ref([]);
const imageViewerInitialIndex = ref(0);

const senderRef = ref();

const isViewingLastMessage = computed(() => {
  if (focusedMessageIndex.value === null) return false;
  return focusedMessageIndex.value === chat_show.value.length - 1;
});

const nextButtonTooltip = computed(() => {
  return isViewingLastMessage.value ? '滚动到底部' : '查看下一条消息';
});

const scrollToBottom = async () => {
  if (isAtBottom.value) {
    await nextTick();
    const el = chatContainerRef.value?.$el;
    if (el) {
      el.style.scrollBehavior = 'auto';
      el.scrollTop = el.scrollHeight;
      el.style.scrollBehavior = 'smooth';
    }
  }
};

const forceScrollToBottom = () => {
  isForcingScroll.value = true;
  isAtBottom.value = true;
  showScrollToBottomButton.value = false;
  focusedMessageIndex.value = null;
  const el = chatContainerRef.value?.$el;
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  setTimeout(() => { isForcingScroll.value = false; }, 500);
};

const findFocusedMessageIndex = () => {
  const container = chatContainerRef.value?.$el;
  if (!container) return;
  const scrollTop = container.scrollTop;
  let closestIndex = -1;
  let smallestDistance = Infinity;
  for (let i = chat_show.value.length - 1; i >= 0; i--) {
    const msgComponent = messageRefs.get(i);
    if (msgComponent) {
      const el = msgComponent.$el;
      const elTop = el.offsetTop;
      const elBottom = elTop + el.clientHeight;
      if (elTop < scrollTop + container.clientHeight && elBottom > scrollTop) {
        const distance = Math.abs(elTop - scrollTop);
        if (distance < smallestDistance) {
          smallestDistance = distance;
          closestIndex = i;
        }
      }
    }
  }
  if (closestIndex !== -1) focusedMessageIndex.value = closestIndex;
};

const handleScroll = (event) => {
  if (isForcingScroll.value) { return; }
  const el = event.target;
  if (!el) return;
  const isScrolledToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
  if (isAtBottom.value && !isScrolledToBottom) findFocusedMessageIndex();
  isAtBottom.value = isScrolledToBottom;
  showScrollToBottomButton.value = !isScrolledToBottom;
  if (isScrolledToBottom) focusedMessageIndex.value = null;
};

const navigateToPreviousMessage = () => {
  findFocusedMessageIndex();
  const currentIndex = focusedMessageIndex.value;
  if (currentIndex === null) return;
  const targetComponent = messageRefs.get(currentIndex);
  const container = chatContainerRef.value?.$el;
  if (!targetComponent || !container) return;
  const element = targetComponent.$el;
  const scrollDifference = container.scrollTop - element.offsetTop;
  if (scrollDifference > 5) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (currentIndex > 0) {
    const newIndex = currentIndex - 1;
    focusedMessageIndex.value = newIndex;
    const previousComponent = messageRefs.get(newIndex);
    if (previousComponent) previousComponent.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const navigateToNextMessage = () => {
  findFocusedMessageIndex();
  if (focusedMessageIndex.value !== null && focusedMessageIndex.value < chat_show.value.length - 1) {
    focusedMessageIndex.value++;
    const targetComponent = messageRefs.get(focusedMessageIndex.value);
    if (targetComponent) targetComponent.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    forceScrollToBottom();
  }
};

const isCollapsed = (index) => collapsedMessages.value.has(index);

const attachImageErrorHandlers = async () => {
  await nextTick();
  const processImage = (img) => {
    if (img.hasAttribute('data-error-handler-attached')) return;
    img.setAttribute('data-error-handler-attached', 'true');
    const originalSrc = img.src;
    const handleError = () => {
      if (!img.parentNode || img.parentNode.classList.contains('image-error-container')) return;
      const container = document.createElement('div'); container.className = 'image-error-container';
      const retryButton = document.createElement('button'); retryButton.className = 'image-retry-button'; retryButton.textContent = '图片加载失败，点击重试';
      container.appendChild(retryButton); img.parentNode.replaceChild(container, img);
      retryButton.onclick = (e) => {
        e.stopPropagation(); const newImg = document.createElement('img'); newImg.src = `${originalSrc}?t=${new Date().getTime()}`;
        processImage(newImg); container.parentNode.replaceChild(newImg, container);
      };
    };
    img.onerror = handleError;
    if (img.complete && img.naturalHeight === 0 && img.src) { setTimeout(() => { if (img.naturalHeight === 0) handleError(); }, 50); }
  };
  document.querySelectorAll('.markdown-body img:not([data-error-handler-attached])').forEach(processImage);
};

const addCopyButtonsToCodeBlocks = async () => {
  await nextTick();
  document.querySelectorAll('.markdown-body pre.hljs').forEach(pre => {
    if (pre.querySelector('.code-block-copy-button')) return;
    const codeElement = pre.querySelector('code'); if (!codeElement) return;
    const wrapper = document.createElement('div'); wrapper.className = 'code-block-wrapper'; pre.parentNode.insertBefore(wrapper, pre); wrapper.appendChild(pre);
    const codeText = codeElement.textContent || ''; const lines = codeText.trimEnd().split('\n'); const lineCount = lines.length;
    const copyButtonSVG = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>`;
    const createButton = (positionClass) => {
      const button = document.createElement('button'); button.className = `code-block-copy-button ${positionClass}`; button.innerHTML = copyButtonSVG; button.title = 'Copy code';
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        try {
          await navigator.clipboard.writeText(codeText.trimEnd());
          ElMessage.success('Code copied to clipboard!');
        }
        catch (err) { console.error('Failed to copy code:', err); ElMessage.error('Failed to copy code.'); }
      });
      wrapper.appendChild(button);
    };
    createButton('code-block-copy-button-bottom');
    if (lineCount > 3) createButton('code-block-copy-button-top');
  });
};

const handleMarkdownImageClick = (event) => {
  if (event.target.tagName !== 'IMG' || !event.target.closest('.markdown-wrapper')) return;
  const imgElement = event.target;
  if (imgElement && imgElement.src) {
    imageViewerSrcList.value = [imgElement.src];
    imageViewerInitialIndex.value = 0;
    imageViewerVisible.value = true;
  }
};

const handleWheel = (event) => {
  if (event.ctrlKey) {
    event.preventDefault();
    const zoomStep = 0.05;
    let newZoom = (event.deltaY < 0) ? zoomLevel.value + zoomStep : zoomLevel.value - zoomStep;
    zoomLevel.value = Math.max(0.5, Math.min(2.0, newZoom));
    if (currentConfig.value) currentConfig.value.zoom = zoomLevel.value;
  }
};

const handleSaveWindowSize = () => saveWindowSize();
const handleOpenModelDialog = () => { changeModel_page.value = true; };
const handleChangeModel = (chosenModel) => {
  model.value = chosenModel;
  currentProviderID.value = chosenModel.split("|")[0];
  const provider = currentConfig.value.providers[currentProviderID.value];
  base_url.value = provider.url;
  api_key.value = provider.api_key;
  changeModel_page.value = false;
  chatInputRef.value?.focus({ cursor: 'end' });
  ElMessage.success(`模型已切换为: ${modelMap.value[chosenModel]}`);
};
const handleTogglePin = () => {
  autoCloseOnBlur.value = !autoCloseOnBlur.value;
  if (autoCloseOnBlur.value) window.addEventListener('blur', closePage);
  else window.removeEventListener('blur', closePage);
};
const handleToggleMemory = () => { temporary.value = !temporary.value; };
const handleSaveSession = () => handleSaveAction();
const handleDeleteMessage = (index) => deleteMessage(index);
const handleCopyText = (content, index) => copyText(content, index);
const handleReAsk = () => reaskAI();
const handleShowSystemPrompt = (content) => {
  systemPromptContent.value = content;
  systemPromptDialogVisible.value = true;
};
const handleToggleCollapse = async (index, event) => {
  const chatContainer = chatContainerRef.value?.$el;
  const buttonElement = event.currentTarget;
  const messageElement = buttonElement.closest('.chat-message');
  if (!chatContainer || !buttonElement || !messageElement) return;
  const originalScrollTop = chatContainer.scrollTop;
  const isExpanding = isCollapsed(index);
  if (isExpanding) {
    const originalElementTop = messageElement.offsetTop;
    const originalVisualPosition = originalElementTop - originalScrollTop;
    collapsedMessages.value.delete(index);
    await nextTick();
    const newElementTop = messageElement.offsetTop;
    chatContainer.style.scrollBehavior = 'auto';
    chatContainer.scrollTop = newElementTop - originalVisualPosition;
    chatContainer.style.scrollBehavior = 'smooth';
  } else {
    const originalButtonTop = buttonElement.getBoundingClientRect().top;
    collapsedMessages.value.add(index);
    await nextTick();
    const newButtonTop = buttonElement.getBoundingClientRect().top;
    chatContainer.style.scrollBehavior = 'auto';
    chatContainer.scrollTop = originalScrollTop + (newButtonTop - originalButtonTop);
    chatContainer.style.scrollBehavior = 'smooth';
  }
};
const onAvatarClick = async (role, event) => {
  const chatContainer = chatContainerRef.value?.$el;
  const messageElement = event.currentTarget.closest('.chat-message');
  if (!chatContainer || !messageElement) return;
  const originalScrollTop = chatContainer.scrollTop;
  const originalElementTop = messageElement.offsetTop;
  const originalVisualPosition = originalElementTop - originalScrollTop;
  const roleMessageIndices = chat_show.value.map((msg, index) => (msg.role === role ? index : -1)).filter(index => index !== -1);
  if (roleMessageIndices.length === 0) return;
  const anyExpanded = roleMessageIndices.some(index => !collapsedMessages.value.has(index));
  if (anyExpanded) roleMessageIndices.forEach(index => collapsedMessages.value.add(index));
  else roleMessageIndices.forEach(index => collapsedMessages.value.delete(index));
  await nextTick();
  const newElementTop = messageElement.offsetTop;
  chatContainer.style.scrollBehavior = 'auto';
  chatContainer.scrollTop = newElementTop - originalVisualPosition;
  chatContainer.style.scrollBehavior = 'smooth';
};

const handleSubmit = () => askAI(false);
const handleCancel = () => cancelAskAI();
const handleClearHistory = () => clearHistory();
const handleRemoveFile = (index) => fileList.value.splice(index, 1);
const handleUpload = async ({ fileList: newFiles }) => {
  for (const file of newFiles) await file2fileList(file, fileList.value.length + 1);
  chatInputRef.value?.focus({ cursor: 'end' });
};

const handleSendAudio = async (audioFile) => {
    fileList.value = [];
    await file2fileList(audioFile, 0);
    await askAI(false);
};

const handleWindowBlur = () => {
  const textarea = chatInputRef.value?.senderRef?.$refs.textarea;
  if (textarea) {
    lastSelectionStart.value = textarea.selectionStart;
    lastSelectionEnd.value = textarea.selectionEnd;
  }
};

const handleWindowFocus = () => {
  setTimeout(() => {
    const textarea = chatInputRef.value?.senderRef?.$refs.textarea;
    if (!textarea) return;
    if (document.activeElement !== textarea) {
      if (lastSelectionStart.value !== null && lastSelectionEnd.value !== null) chatInputRef.value?.focus({ position: { start: lastSelectionStart.value, end: lastSelectionEnd.value } });
      else chatInputRef.value?.focus({ cursor: 'end' });
    }
  }, 50);
};

const handleCopyImageFromViewer = (url) => {
    if (!url) return;
    const loadingMessage = ElMessage({ message: '准备复制图片...', type: 'info', duration: 0 });
    (async () => {
        try {
            if (url.startsWith('data:image')) {
                await new Promise(resolve => setTimeout(resolve, 20)); 
                await window.api.copyImage(url);
                ElMessage.success('图片已复制到剪贴板');
                return;
            }
            const response = await fetch(url);
            if (!response.ok) throw new Error(`网络错误: ${response.statusText}`);
            loadingMessage.message = '正在下载和处理图片...';
            const blob = await response.blob();
            const buffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(buffer);
            loadingMessage.message = '正在写入剪贴板...';
            await new Promise(resolve => setTimeout(resolve, 50)); 
            await window.api.copyImage(uint8Array);
            ElMessage.success('图片已复制到剪贴板');
        } catch (error) {
            console.error('复制图片失败:', error);
            ElMessage.error(`复制失败: ${error.message}`);
        } finally {
            loadingMessage.close();
        }
    })();
};

const handleDownloadImageFromViewer = async (url) => {
    if (!url) return;
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const defaultFilename = `image_${Date.now()}.${blob.type.split('/')[1] || 'png'}`;
        await window.api.saveFile({ title: '保存图片', defaultPath: defaultFilename, buttonLabel: '保存', fileContent: new Uint8Array(arrayBuffer) });
        ElMessage.success('图片保存成功！');
    } catch (error) {
        if (!error.message.includes('User cancelled') && !error.message.includes('用户取消')) {
            console.error('下载图片失败:', error);
            ElMessage.error(`下载失败: ${error.message}`);
        }
    }
};

const handleEditMessage = (index, newContent) => {
    if (index < 0) return;
    const updateContent = (message) => {
        if (!message) return;
        if (typeof message.content === 'string') {
            message.content = newContent;
        } else if (Array.isArray(message.content)) {
            const textPart = message.content.find(p => p.type === 'text' && !(p.text.toLowerCase().startsWith('file name:')));
            if (textPart) {
                textPart.text = newContent;
            } else {
                message.content.push({ type: 'text', text: newContent });
            }
        }
    };
    if (chat_show.value[index]) updateContent(chat_show.value[index]);
    if (history.value[index]) updateContent(history.value[index]);
};

const handleEditStart = async (index) => {
    const scrollContainer = chatContainerRef.value?.$el;
    const childComponent = messageRefs.get(index);
    const element = childComponent?.$el;

    if (!scrollContainer || !element || !childComponent) return;

    // 步骤 1: 切换到编辑模式
    childComponent.switchToEditMode();

    // 步骤 2: 等待 Vue 完成 DOM 更新
    await nextTick();

    // 步骤 3: 使用双重 requestAnimationFrame 等待浏览器完成布局和绘制
    // 这是比 setTimeout(0) 更可靠的方式，确保在获取元素位置时，它已经是最终渲染的尺寸
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            // 核心修复: 在下一帧绘制前，执行立即滚动
            element.scrollIntoView({ behavior: 'auto', block: 'nearest' });
        });
    });
};

const handleEditEnd = async ({ index, action, content }) => {
    const childComponent = messageRefs.get(index);
    if (childComponent) {
        // 先处理数据和状态
        if (action === 'save') {
            handleEditMessage(index, content);
            ElMessage.success('消息已更新');
        }
        childComponent.switchToShowMode();
    }
};

const saveSystemPrompt = async () => {
    const newPromptContent = systemPromptContent.value;
    const systemMessageIndex = history.value.findIndex(m => m.role === 'system');

    if (systemMessageIndex !== -1) {
        history.value[systemMessageIndex].content = newPromptContent;
        chat_show.value[systemMessageIndex].content = newPromptContent;
    } else {
        const newSystemMsg = { role: "system", content: newPromptContent };
        history.value.unshift(newSystemMsg);
        chat_show.value.unshift({ ...newSystemMsg, id: messageIdCounter.value++ });
    }

    try {
        const promptExists = !!currentConfig.value.prompts[CODE.value];
        if (promptExists) {
            // 更新现有快捷助手
            await window.api.saveSetting(`prompts.${CODE.value}.prompt`, newPromptContent);
            currentConfig.value.prompts[CODE.value].prompt = newPromptContent;
            ElMessage.success('快捷助手提示词已更新');
        } else {
            // [BUG修复] 创建新的快捷助手
            const latestConfigData = await window.api.getConfig();
            
            // 使用窗口加载时保存的源配置作为基础，如果没有则回退到默认AI配置
            const baseConfig = sourcePromptConfig.value || defaultConfig.config.prompts.AI;

            const newPrompt = {
                ...baseConfig, // 继承源配置或默认配置
                prompt: newPromptContent, // 覆盖为新的提示词
                enable: true, // 新创建的默认启用
                model: model.value || baseConfig.model, // 使用当前窗口选择的模型
                isAlwaysOnTop: latestConfigData.config.isAlwaysOnTop_global,
                autoCloseOnBlur: latestConfigData.config.autoCloseOnBlur_global,
            };

            latestConfigData.config.prompts[CODE.value] = newPrompt;
            await window.api.updateConfig(latestConfigData);
            currentConfig.value = latestConfigData.config;
            sourcePromptConfig.value = newPrompt; // 更新源配置为刚创建的新配置
            ElMessage.success(`已为您创建并保存新的快捷助手: "${CODE.value}"`);
        }
    } catch (error) {
        console.error("保存系统提示词失败:", error);
        ElMessage.error(`保存失败: ${error.message}`);
    }

    systemPromptDialogVisible.value = false;
};


const closePage = () => { window.close(); };

watch(zoomLevel, (newZoom) => {
  if (window.api && typeof window.api.setZoomFactor === 'function') window.api.setZoomFactor(newZoom);
});
watch(chat_show, async () => {
  await addCopyButtonsToCodeBlocks();
  await attachImageErrorHandlers();
}, { deep: true, flush: 'post' });

onMounted(async () => {
  if (isInit.value) return; isInit.value = true;
  window.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('blur', handleWindowBlur);

  const chatMainElement = chatContainerRef.value?.$el;
  if (chatMainElement) chatMainElement.addEventListener('click', handleMarkdownImageClick);

  try {
    const configData = await window.api.getConfig();
    currentConfig.value = configData.config;
  }
  catch (err) {
    currentConfig.value = defaultConfig.config;
    ElMessage.error('加载配置失败，使用默认配置');
  }
  zoomLevel.value = currentConfig.value.zoom || 1;
  if (window.api && typeof window.api.setZoomFactor === 'function') window.api.setZoomFactor(zoomLevel.value);
  if (currentConfig.value.isDarkMode) { document.documentElement.classList.add('dark'); }
  try { const userInfo = await window.api.getUser(); UserAvart.value = userInfo.avatar; }
  catch (err) { UserAvart.value = "user.png"; }

  try {
    window.preload.receiveMsg(async (data) => {
      sourcePromptConfig.value = currentConfig.value.prompts[data?.code];

      if (data.filename) defaultConversationName.value = data.filename.replace(/\.json$/i, '');
      else defaultConversationName.value = "";
      basic_msg.value = { code: data?.code, type: data?.type, payload: data?.payload };
      document.title = basic_msg.value.code; CODE.value = basic_msg.value.code;
      const currentPromptConfig = currentConfig.value.prompts[basic_msg.value.code];
      
      if (currentPromptConfig && currentPromptConfig.icon) {
        AIAvart.value = currentPromptConfig.icon;
        favicon.value = currentPromptConfig.icon;
      } else {
        AIAvart.value = "ai.svg";
        favicon.value = currentConfig.value.isDarkMode ? "favicon-b.png" : "favicon.png";
      }

      autoCloseOnBlur.value = currentPromptConfig?.autoCloseOnBlur ?? true;
      tempReasoningEffort.value = currentPromptConfig?.reasoning_effort || 'default';
      model.value = currentPromptConfig?.model || defaultConfig.config.prompts.AI.model;
      selectedVoice.value = currentPromptConfig?.voice || null;
      modelList.value = []; modelMap.value = {};
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
      if (!modelMap.value[model.value]) model.value = modelList.value[0]?.value;
      currentProviderID.value = model.value.split("|")[0];
      base_url.value = currentConfig.value.providers[currentProviderID.value]?.url;
      api_key.value = currentConfig.value.providers[currentProviderID.value]?.api_key;
      if (currentPromptConfig?.prompt) { history.value = [{ role: "system", content: currentPromptConfig?.prompt || "" }]; chat_show.value = [{ role: "system", content: currentPromptConfig?.prompt || "", id: messageIdCounter.value++ }]; }
      else { history.value = []; chat_show.value = []; }

      if (basic_msg.value.type === "over" && basic_msg.value.payload) {
        let sessionLoaded = false;
        try {
          let old_session = JSON.parse(basic_msg.value.payload);
          if (old_session && old_session.anywhere_history === true) { sessionLoaded = true; await loadSession(old_session); chatInputRef.value?.focus({ cursor: 'end' }); }
        } catch (error) { }
        if (!sessionLoaded) {
          if (CODE.value.trim().toLowerCase().includes(basic_msg.value.payload.trim().toLowerCase())) { if (autoCloseOnBlur.value) handleTogglePin(); scrollToBottom(); chatInputRef.value?.focus({ cursor: 'end' }); }
          else {
            if (currentPromptConfig?.isDirectSend_normal) {
              history.value.push({ role: "user", content: basic_msg.value.payload });
              chat_show.value.push({ id: messageIdCounter.value++, role: "user", content: [{ type: "text", text: basic_msg.value.payload }] });
              scrollToBottom(); await askAI(true);
            } else { prompt.value = basic_msg.value.payload; scrollToBottom(); chatInputRef.value?.focus({ cursor: 'end' }); }
          }
        }
      } else if (basic_msg.value.type === "img" && basic_msg.value.payload) {
        if (currentPromptConfig?.isDirectSend_normal) {
          history.value.push({ role: "user", content: [{ type: "image_url", image_url: { url: String(basic_msg.value.payload) } }] });
          chat_show.value.push({ id: messageIdCounter.value++, role: "user", content: [{ type: "image_url", image_url: { url: String(basic_msg.value.payload) } }] });
          scrollToBottom(); await askAI(true);
        } else {
          fileList.value.push({ uid: 1, name: "截图.png", size: 0, type: "image/png", url: String(basic_msg.value.payload) });
          scrollToBottom(); chatInputRef.value?.focus({ cursor: 'end' });
        }
      } else if (basic_msg.value.type === "files" && basic_msg.value.payload) {
        try {
          let sessionLoaded = false;
          if (basic_msg.value.payload.length === 1 && basic_msg.value.payload[0].path.toLowerCase().endsWith('.json')) {
            const fileObject = await window.api.handleFilePath(basic_msg.value.payload[0].path);
            if (fileObject) { sessionLoaded = await checkAndLoadSessionFromFile(fileObject); chatInputRef.value?.focus({ cursor: 'end' }); }
          }
          if (!sessionLoaded) {
            const fileProcessingPromises = basic_msg.value.payload.map((fileInfo) => processFilePath(fileInfo.path));
            await Promise.all(fileProcessingPromises);
            if (currentPromptConfig?.isDirectSend_file) { scrollToBottom(); await askAI(false); }
            else { chatInputRef.value?.focus({ cursor: 'end' }); scrollToBottom(); }
          }
        } catch (error) { console.error("Error during initial file processing:", error); ElMessage.error("文件处理失败: " + error.message); }
      }
      if (autoCloseOnBlur.value) window.addEventListener('blur', closePage);
    });
  } catch (err) {
    basic_msg.value.code = Object.keys(currentConfig.value.prompts)[0];
    document.title = basic_msg.value.code; CODE.value = basic_msg.value.code;
    const currentPromptConfig = currentConfig.value.prompts[basic_msg.value.code];

    if (currentPromptConfig && currentPromptConfig.icon) {
      AIAvart.value = currentPromptConfig.icon;
      favicon.value = currentPromptConfig.icon;
    } else {
      AIAvart.value = "ai.svg";
      favicon.value = currentConfig.value.isDarkMode ? "favicon-b.png" : "favicon.png";
    }

    autoCloseOnBlur.value = currentPromptConfig?.autoCloseOnBlur ?? true;
    tempReasoningEffort.value = currentPromptConfig?.reasoning_effort || 'default';
    model.value = currentPromptConfig?.model || defaultConfig.config.prompts.AI.model;
    selectedVoice.value = currentPromptConfig?.voice || null;
    modelList.value = []; modelMap.value = {};
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
    if (!modelMap.value[model.value]) model.value = modelList.value[0]?.value;
    currentProviderID.value = model.value.split("|")[0];
    base_url.value = currentConfig.value.providers[currentProviderID.value]?.url;
    api_key.value = currentConfig.value.providers[currentProviderID.value]?.api_key;
    if (currentPromptConfig?.prompt) {
      history.value = [{ role: "system", content: currentPromptConfig?.prompt || "你是一个AI助手" }];
      chat_show.value = [{ role: "system", content: currentPromptConfig?.prompt || "你是一个AI助手", id: messageIdCounter.value++ }];
    } else { history.value = []; chat_show.value = []; }

    scrollToBottom();
    if (autoCloseOnBlur.value) window.addEventListener('blur', closePage);
  }

  await addCopyButtonsToCodeBlocks();
  await attachImageErrorHandlers();

  setTimeout(() => {
    chatInputRef.value?.focus({ cursor: 'end' });
  }, 100);
});

onBeforeUnmount(() => {
  window.removeEventListener('wheel', handleWheel);
  window.removeEventListener('focus', handleWindowFocus);
  window.removeEventListener('blur', handleWindowBlur);
  if (!autoCloseOnBlur.value) window.removeEventListener('blur', closePage);
  const chatMainElement = chatContainerRef.value?.$el;
  if (chatMainElement) chatMainElement.removeEventListener('click', handleMarkdownImageClick);
});

const saveWindowSize = async () => {
  if (!CODE.value || !currentConfig.value.prompts[CODE.value]) {
    ElMessage.warning('无法保存窗口设置，因为当前不是一个已定义的快捷助手。');
    return;
  }
  const settingsToSave = {
    window_height: window.innerHeight,
    window_width: window.innerWidth,
    position_x: window.screenX,
    position_y: window.screenY,
    zoom: zoomLevel.value,
  };
  try {
    const result = await window.api.savePromptWindowSettings(CODE.value, settingsToSave);
    if (result.success) {
      ElMessage.success('当前快捷助手的窗口大小、位置及缩放已保存');
      currentConfig.value.prompts[CODE.value] = { ...currentConfig.value.prompts[CODE.value], ...settingsToSave };
    } else { ElMessage.error(`保存失败: ${result.message}`); }
  } catch (error) {
    console.error("Error saving window settings:", error);
    ElMessage.error('保存窗口设置时出错');
  }
}

const getSessionDataAsObject = () => {
  const currentPromptConfig = currentConfig.value.prompts[CODE.value] || {};
  return {
    anywhere_history: true, CODE: CODE.value, basic_msg: basic_msg.value, isInit: isInit.value,
    autoCloseOnBlur: autoCloseOnBlur.value, temporary: temporary.value, model: model.value,
    currentPromptConfig: currentPromptConfig, history: history.value, chat_show: chat_show.value, selectedVoice: selectedVoice.value,
  };
}
const saveSessionToCloud = async () => {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).toString().padStart(2, '0');
  const hours = String(now.getHours()).toString().padStart(2, '0');
  const minutes = String(now.getMinutes()).toString().padStart(2, '0');
  const defaultBasename = defaultConversationName.value || `${CODE.value || 'AI'}-${year}${month}${day}-${hours}${minutes}`;
  const inputValue = ref(defaultBasename);
  try {
    await ElMessageBox({
      title: '保存到云端',
      message: () => h('div', null, [
        h('p', { style: 'margin-bottom: 15px; font-size: 14px; color: var(--el-text-color-regular);' }, '请输入要保存到云端的会话名称。'),
        h(ElInput, { modelValue: inputValue.value, 'onUpdate:modelValue': (val) => { inputValue.value = val; }, placeholder: '文件名', autofocus: true },
          { append: () => h('div', { class: 'input-suffix-display' }, '.json') })]),
      showCancelButton: true, confirmButtonText: '确认', cancelButtonText: '取消', customClass: 'filename-prompt-dialog',
      beforeClose: async (action, instance, done) => {
        if (action === 'confirm') {
          let finalBasename = inputValue.value.trim();
          if (!finalBasename) { ElMessage.error('文件名不能为空'); return; }
          if (finalBasename.toLowerCase().endsWith('.json')) finalBasename = finalBasename.slice(0, -5);
          const filename = finalBasename + '.json';
          instance.confirmButtonLoading = true;
          ElMessage.info('正在保存到云端...');
          try {
            const sessionData = getSessionDataAsObject();
            const jsonString = JSON.stringify(sessionData, null, 2);
            const { url, username, password, data_path } = currentConfig.value.webdav;
            const client = createClient(url, { username, password });
            const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
            const remoteFilePath = `${remoteDir}/${filename}`;
            if (!(await client.exists(remoteDir))) await client.createDirectory(remoteDir, { recursive: true });
            await client.putFileContents(remoteFilePath, jsonString, { overwrite: true });
            defaultConversationName.value = finalBasename;
            ElMessage.success('会话已成功保存到云端！');
            done();
          } catch (error) {
            console.error("WebDAV save failed:", error);
            ElMessage.error(`保存到云端失败: ${error.message}`);
          } finally { instance.confirmButtonLoading = false; }
        } else { done(); }
      }
    });
  } catch (error) { if (error !== 'cancel' && error !== 'close') console.error("MessageBox error:", error); }
};
const saveSessionAsMarkdown = async () => {
  let markdownContent = '';
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const fileTimestamp = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const defaultBasename = defaultConversationName.value || `${CODE.value || 'AI'}-${fileTimestamp}`;

  const formatContent = (content) => !Array.isArray(content) ? String(content).trim() : content.map(p => p.type === 'text' ? p.text.trim() : '').join(' ');
  const formatFiles = (content) => Array.isArray(content) ? content.filter(p => p.type !== 'text').map(p => p.type === 'file' ? p.file.filename : 'Image') : [];

  markdownContent += `# 聊天记录: ${CODE.value} (${timestamp})\n\n### 当前模型: ${modelMap.value[model.value] || 'N/A'}\n\n`;
  const systemPromptMessage = chat_show.value.find(m => m.role === 'system');
  if (systemPromptMessage && systemPromptMessage.content) markdownContent += `### 系统提示词\n\n${String(systemPromptMessage.content).trim()}\n\n`;
  markdownContent += '---\n\n';

  for (const message of chat_show.value) {
    if (message.role === 'system') continue;
    if (message.role === 'user') {
      let userHeader = '### 👤 用户';
      if (message.timestamp) userHeader += ` - *${formatTimestamp(message.timestamp)}*`;
      markdownContent += `${userHeader}\n\n`;
      const mainContent = formatContent(message.content);
      const files = formatFiles(message.content);
      if (mainContent) markdownContent += `${mainContent}\n\n`;
      if (files.length > 0) {
        markdownContent += `**附件列表:**\n`;
        files.forEach(f => { markdownContent += `- \`${f}\`\n`; });
        markdownContent += `\n`;
      }
    } else if (message.role === 'assistant') {
      let assistantHeader = `### 🤖 ${message.aiName || 'AI'}`;
      if (message.voiceName) assistantHeader += ` (${message.voiceName})`;
      if (message.completedTimestamp) assistantHeader += ` - *${formatTimestamp(message.completedTimestamp)}*`;
      markdownContent += `${assistantHeader}\n\n`;
      if (message.reasoning_content) markdownContent += `> ${message.reasoning_content.replace(/\n/g, '\n> ')}\n\n`;
      const mainContent = formatContent(message.content);
      if (mainContent) markdownContent += `${mainContent}\n\n`;
      else if (message.status) markdownContent += `*(AI正在思考...)*\n\n`;
    }
    markdownContent += '---\n\n';
  }

  const inputValue = ref(defaultBasename);
  try {
    await ElMessageBox({
      title: '保存为 Markdown',
      message: () => h('div', null, [
        h('p', { style: 'margin-bottom: 15px; font-size: 14px; color: var(--el-text-color-regular);' }, '请输入会话名称。'),
        h(ElInput, { modelValue: inputValue.value, 'onUpdate:modelValue': (val) => { inputValue.value = val; }, placeholder: '文件名', autofocus: true },
          { append: () => h('div', { class: 'input-suffix-display' }, '.md') })]),
      showCancelButton: true, confirmButtonText: '保存', cancelButtonText: '取消', customClass: 'filename-prompt-dialog',
      beforeClose: async (action, instance, done) => {
        if (action === 'confirm') {
          let finalBasename = inputValue.value.trim();
          if (!finalBasename) { ElMessage.error('文件名不能为空'); return; }
          if (finalBasename.toLowerCase().endsWith('.md')) finalBasename = finalBasename.slice(0, -3);
          const finalFilename = finalBasename + '.md';
          instance.confirmButtonLoading = true;
          try {
            await window.api.saveFile({ title: '保存为 Markdown', defaultPath: finalFilename, buttonLabel: '保存', filters: [{ name: 'Markdown 文件', extensions: ['md'] }, { name: '所有文件', extensions: ['*'] }], fileContent: markdownContent });
            defaultConversationName.value = finalBasename;
            ElMessage.success('会话已成功保存为 Markdown！');
            done();
          } catch (error) {
            if (!error.message.includes('canceled by the user')) { console.error('保存 Markdown 失败:', error); ElMessage.error(`保存失败: ${error.message}`); }
            done();
          } finally { instance.confirmButtonLoading = false; }
        } else { done(); }
      }
    });
  } catch (error) { if (error !== 'cancel' && error !== 'close') console.error('MessageBox error:', error); }
};
const saveSessionAsJson = async () => {
  const sessionData = getSessionDataAsObject();
  const jsonString = JSON.stringify(sessionData, null, 2);
  const now = new Date();
  const fileTimestamp = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const defaultBasename = defaultConversationName.value || `${CODE.value || 'AI'}-${fileTimestamp}`;
  const inputValue = ref(defaultBasename);
  try {
    await ElMessageBox({
      title: '保存为 JSON',
      message: () => h('div', null, [
        h('p', { style: 'margin-bottom: 15px; font-size: 14px; color: var(--el-text-color-regular);' }, '请输入会话名称。'),
        h(ElInput, { modelValue: inputValue.value, 'onUpdate:modelValue': (val) => { inputValue.value = val; }, placeholder: '文件名', autofocus: true },
          { append: () => h('div', { class: 'input-suffix-display' }, '.json') })]),
      showCancelButton: true, confirmButtonText: '保存', cancelButtonText: '取消', customClass: 'filename-prompt-dialog',
      beforeClose: async (action, instance, done) => {
        if (action === 'confirm') {
          let finalBasename = inputValue.value.trim();
          if (!finalBasename) { ElMessage.error('文件名不能为空'); return; }
          if (finalBasename.toLowerCase().endsWith('.json')) finalBasename = finalBasename.slice(0, -5);
          const finalFilename = finalBasename + '.json';
          instance.confirmButtonLoading = true;
          try {
            await window.api.saveFile({ title: '保存聊天会话', defaultPath: finalFilename, buttonLabel: '保存', filters: [{ name: 'JSON 文件', extensions: ['json'] }, { name: '所有文件', extensions: ['*'] }], fileContent: jsonString });
            defaultConversationName.value = finalBasename;
            ElMessage.success('会话已成功保存！');
            done();
          } catch (error) {
            if (!error.message.includes('canceled by the user')) { console.error('保存会话失败:', error); ElMessage.error(`保存失败: ${error.message}`); }
            done();
          } finally { instance.confirmButtonLoading = false; }
        } else { done(); }
      }
    });
  } catch (error) { if (error !== 'cancel' && error !== 'close') console.error('MessageBox error:', error); }
};
const handleSaveAction = async () => {
  if (autoCloseOnBlur.value) handleTogglePin();
  const isCloudEnabled = currentConfig.value.webdav?.url && currentConfig.value.webdav?.data_path;
  const saveOptions = [];
  if (isCloudEnabled) saveOptions.push({ title: '保存到云端', description: '同步到 WebDAV 服务器，支持跨设备访问。', buttonType: 'success', action: saveSessionToCloud });
  saveOptions.push({ title: '保存为 JSON', description: '保存为可恢复的会话文件，便于下次继续。', buttonType: 'primary', action: saveSessionAsJson });
  saveOptions.push({ title: '保存为 Markdown', description: '导出为可读性更强的 .md 文件，适合分享。', buttonType: '', action: saveSessionAsMarkdown });
  const messageVNode = h('div', { class: 'save-options-list' }, saveOptions.map(opt => {
    return h('div', { class: 'save-option-item', onClick: () => { ElMessageBox.close(); opt.action(); } }, [
      h('div', { class: 'save-option-text' }, [
        h('h4', null, opt.title), h('p', null, opt.description)
      ]),
      h(ElButton, { type: opt.buttonType, plain: true }, { default: () => '选择' })
    ]);
  }));
  ElMessageBox({ title: '选择保存方式', message: messageVNode, showConfirmButton: false, showCancelButton: false, customClass: 'save-options-dialog', width: '450px' }).catch(() => { });
};


const loadSession = async (jsonData) => {
  loading.value = true;
  collapsedMessages.value.clear(); messageRefs.clear(); focusedMessageIndex.value = null;
  try {
    CODE.value = jsonData.CODE; document.title = CODE.value;
    basic_msg.value = jsonData.basic_msg; isInit.value = jsonData.isInit;
    autoCloseOnBlur.value = jsonData.autoCloseOnBlur; temporary.value = jsonData.temporary;
    history.value = jsonData.history; chat_show.value = jsonData.chat_show;
    selectedVoice.value = jsonData.selectedVoice || '';
    tempReasoningEffort.value = jsonData.currentPromptConfig?.reasoning_effort || 'default';

    const configData = await window.api.getConfig();
    currentConfig.value = configData.config;
    zoomLevel.value = currentConfig.value.zoom || 1;
    if (window.api && typeof window.api.setZoomFactor === 'function') window.api.setZoomFactor(zoomLevel.value);
    if (currentConfig.value.isDarkMode) { document.documentElement.classList.add('dark'); } else { document.documentElement.classList.remove('dark'); }
    const currentPromptConfigFromLoad = jsonData.currentPromptConfig || currentConfig.value.prompts[CODE.value];
    if (currentPromptConfigFromLoad && currentPromptConfigFromLoad.icon) {
      AIAvart.value = currentPromptConfigFromLoad.icon;
      favicon.value = currentPromptConfigFromLoad.icon;
    } else {
      AIAvart.value = "ai.svg";
      favicon.value = currentConfig.value.isDarkMode ? "favicon-b.png" : "favicon.png";
    }
    modelList.value = []; modelMap.value = {};
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
    let restoredModel = '';
    if (jsonData.model && modelMap.value[jsonData.model]) restoredModel = jsonData.model;
    else if (jsonData.currentPromptConfig?.model && modelMap.value[jsonData.currentPromptConfig.model]) restoredModel = jsonData.currentPromptConfig.model;
    else {
      const currentPromptConfig = currentConfig.value.prompts[CODE.value];
      restoredModel = (currentPromptConfig?.model && modelMap.value[currentPromptConfig.model]) ? currentPromptConfig.model : (modelList.value[0]?.value || '');
    }
    model.value = restoredModel;
    if (chat_show.value && chat_show.value.length > 0) {
      chat_show.value.forEach(msg => { if (msg.id === undefined) msg.id = messageIdCounter.value++; });
      const maxId = Math.max(...chat_show.value.map(m => m.id || 0));
      messageIdCounter.value = maxId + 1;
    }
    if (currentConfig.value.prompts[CODE.value]?.prompt) {
      if (history.value.length > 0 && history.value[0].role === "system") {
        history.value[0].content = currentConfig.value.prompts[CODE.value].prompt;
        chat_show.value[0].content = currentConfig.value.prompts[CODE.value].prompt;
      } else {
        history.value.unshift({ role: "system", content: currentConfig.value.prompts[CODE.value].prompt });
        chat_show.value.unshift({ id: messageIdCounter.value++, role: "system", content: currentConfig.value.prompts[CODE.value].prompt });
      }
    }
    if (model.value) {
      currentProviderID.value = model.value.split("|")[0];
      const provider = currentConfig.value.providers[currentProviderID.value];
      base_url.value = provider?.url;
      api_key.value = provider?.api_key;
    } else { ElMessage.error("没有可用的模型。请检查您的服务商配置。"); loading.value = false; return; }
    await nextTick(); scrollToBottom();
  } catch (error) { console.error("加载会话失败:", error); ElMessage.error(`加载会话失败: ${error.message}`); }
  finally { loading.value = false; }
};

const checkAndLoadSessionFromFile = async (file) => {
  if (file && file.name.toLowerCase().endsWith('.json')) {
    try {
      const fileContent = await file.text();
      const jsonData = JSON.parse(fileContent);
      if (jsonData && jsonData.anywhere_history === true) {
        defaultConversationName.value = file.name.replace(/\.json$/i, '');
        await loadSession(jsonData);
        return true;
      }
    } catch (e) { console.warn("一个JSON文件被检测到，但它不是一个有效的会话文件:", e.message); }
  }
  return false;
};

const file2fileList = async (file, idx) => {
  const isSessionFile = await checkAndLoadSessionFromFile(file);
  if (isSessionFile) { chatInputRef.value?.focus({ cursor: 'end' }); return; }
  return new Promise((resolve, reject) => {
    const handler = getFileHandler(file.name);
    if (!handler) { const errorMsg = `不支持的文件类型: ${file.name}`; ElMessage.warning(errorMsg); reject(new Error(errorMsg)); return; }
    const reader = new FileReader();
    reader.onload = (e) => { fileList.value.push({ uid: idx, name: file.name, size: file.size, type: file.type, url: e.target.result }); resolve(); };
    reader.onerror = () => { const errorMsg = `读取文件 ${file.name} 失败`; ElMessage.error(errorMsg); reject(new Error(errorMsg)); }
    reader.readAsDataURL(file);
  });
};

const processFilePath = async (filePath) => {
  if (!filePath || typeof filePath !== 'string') { ElMessage.error('无效的文件路径'); return; }
  try {
    const fileObject = await window.api.handleFilePath(filePath);
    if (fileObject) await file2fileList(fileObject, fileList.value.length + 1);
    else ElMessage.error('无法读取或访问该文件，请检查路径和权限');
  } catch (error) { console.error('调用 handleFilePath 时发生意外错误:', error); ElMessage.error('处理文件路径时发生未知错误'); }
};

const sendFile = async () => {
  let contentList = []; if (fileList.value.length === 0) return contentList;
  for (const currentFile of fileList.value) {
    const handler = getFileHandler(currentFile.name);
    if (handler) {
      try { const processedContent = await handler(currentFile); if (processedContent) contentList.push(processedContent); }
      catch (error) { ElMessage.error(`处理文件 ${currentFile.name} 失败:${error.message}`); }
    } else ElMessage.warning(`文件类型不支持: ${currentFile.name}`);
  }
  fileList.value = []; return contentList;
};

const askAI = async (forceSend = false) => {
  if (loading.value) return;
  let is_think_flag = false;
  if (!forceSend) {
    let file_content = await sendFile();
    const promptText = prompt.value.trim();
    if ((file_content && file_content.length > 0) || promptText) {
      const userContentList = [];
      if (promptText) userContentList.push({ type: "text", text: promptText });
      if (file_content && file_content.length > 0) userContentList.push(...file_content);
      const userTimestamp = new Date().toLocaleString('sv-SE');
      if (userContentList.length == 1 && userContentList[0].type === "text") {
        history.value.push({ role: "user", content: userContentList[0]["text"] });
        chat_show.value.push({ id: messageIdCounter.value++, role: "user", content: [{ type: "text", text: userContentList[0]["text"] }], timestamp: userTimestamp });
      } else if (userContentList.length > 0) {
        history.value.push({ role: "user", content: userContentList });
        chat_show.value.push({ id: messageIdCounter.value++, role: "user", content: userContentList, timestamp: userTimestamp });
      } else return;
    } else return;
    prompt.value = "";
  }
  if (temporary.value && history.value.length > 1) {
    const lastUserMessage = history.value[history.value.length - 1];
    const systemMessage = history.value[0].role === "system" ? history.value[0] : null;
    const messagesToKeepInHistory = []; const messagesToKeepInChatShow = [];
    if (systemMessage) { messagesToKeepInHistory.push(systemMessage); messagesToKeepInChatShow.push(chat_show.value.find(m => m.role === "system") || systemMessage); }
    if (lastUserMessage && lastUserMessage.role === "user") {
      messagesToKeepInHistory.push(lastUserMessage);
      const correspondingUserChatShow = chat_show.value.filter(m => m.role === 'user').pop();
      if (correspondingUserChatShow) messagesToKeepInChatShow.push(correspondingUserChatShow); else messagesToKeepInChatShow.push(lastUserMessage);
    }
    history.value = messagesToKeepInHistory; chat_show.value = messagesToKeepInChatShow;
  }

  loading.value = true; signalController.value = new AbortController();
  let aiResponse = null; scrollToBottom();
  const aiMessageHistoryIndex = history.value.length; const aiMessageChatShowIndex = chat_show.value.length;
  history.value.push({ role: "assistant", content: [] });
  chat_show.value.push({
    id: messageIdCounter.value++, role: "assistant", content: [], reasoning_content: "", status: "",
    aiName: modelMap.value[model.value] || model.value.split('|')[1], voiceName: selectedVoice.value
  });

  try {
    const messagesForAPI = JSON.parse(JSON.stringify(history.value.slice(0, aiMessageHistoryIndex)));
    chatInputRef.value?.focus({ cursor: 'end' });
    aiResponse = await window.api.chatOpenAI(messagesForAPI, currentConfig.value, model.value, CODE.value, signalController.value.signal, selectedVoice.value, tempReasoningEffort.value);
    if (!aiResponse?.ok && aiResponse?.status !== 200) {
      let errorMsg = `API 请求失败: ${aiResponse?.status}${aiResponse?.statusText}`;
      try { const errorBody = await aiResponse?.text(); errorMsg += `\n${errorBody || '(No Response Body)'}`; } catch { }
      throw new Error(errorMsg);
    }
    const currentPromptConfig = currentConfig.value.prompts[CODE.value];
    let useStream = currentConfig.value.stream;
    if (currentPromptConfig && typeof currentPromptConfig.stream === 'boolean') useStream = currentPromptConfig.stream;
    const isVoiceReply = !!selectedVoice.value;
    const isStreamReply = useStream && !isVoiceReply;

    if (isVoiceReply) {
      const data = await aiResponse.json();
      const aiMessage = data.choices?.[0]?.message;
      if (!aiMessage) throw new Error('API响应格式不正确，缺少message字段');
      const textContent = aiMessage.audio?.transcript || aiMessage.content || '未获取到文本内容。';
      const audioData = aiMessage.audio?.data; const images = aiMessage.images || [];
      const contentForDisplay = [];
      if (textContent) contentForDisplay.push({ type: 'text', text: textContent });
      images.forEach(img => contentForDisplay.push(img));
      if (audioData) contentForDisplay.push({ type: "input_audio", input_audio: { data: audioData, format: 'wav' } });
      const contentForApiHistory = [];
      if (textContent) contentForApiHistory.push({ type: 'text', text: textContent });
      images.forEach(img => contentForApiHistory.push(img));
      history.value[aiMessageHistoryIndex].content = contentForApiHistory;
      if (chat_show.value[aiMessageChatShowIndex]) {
        chat_show.value[aiMessageChatShowIndex].content = contentForDisplay;
        chat_show.value[aiMessageChatShowIndex].status = "";
      }
    } else if (isStreamReply) {
      scrollToBottom();
      const reader = aiResponse.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        try {
          const { value, done } = await reader.read();
          if (done) { if (thinking.value && chat_show.value[aiMessageChatShowIndex]) { chat_show.value[aiMessageChatShowIndex].status = "end"; thinking.value = false; } break; }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
             if (line.startsWith('data: ')) {
              const jsonString = line.substring(6).trim();
              if (jsonString === '[DONE]') { if (thinking.value && chat_show.value[aiMessageChatShowIndex]) { chat_show.value[aiMessageChatShowIndex].status = "end"; thinking.value = false; } continue; }
              try {
                const parsedData = JSON.parse(jsonString);
                const delta = parsedData.choices?.[0]?.delta;
                if (!delta) continue;
                const reasoning_delta = delta.reasoning_content; const deltaContent = delta.content; const deltaImages = delta.images;
                if (chat_show.value[aiMessageChatShowIndex]) {
                   const historyContentArray = history.value[aiMessageHistoryIndex].content; const chatShowContentArray = chat_show.value[aiMessageChatShowIndex].content;
                    if (reasoning_delta) {
                        if (!thinking.value) { chat_show.value[aiMessageChatShowIndex].status = "start"; thinking.value = true; }
                        else { chat_show.value[aiMessageChatShowIndex].status = "thinking"; }
                        chat_show.value[aiMessageChatShowIndex].reasoning_content += reasoning_delta;
                    }
                    if (deltaContent) {
                        if (!is_think_flag && thinking.value) { thinking.value = false; chat_show.value[aiMessageChatShowIndex].status = "end"; }
                        if (!thinking.value && deltaContent.trimEnd() === "<think>") { is_think_flag = true; thinking.value = true; chat_show.value[aiMessageChatShowIndex].status = "start"; chat_show.value[aiMessageChatShowIndex].reasoning_content = ""; }
                        else if (thinking.value && is_think_flag && deltaContent.trimEnd() === "</think>") { thinking.value = false; is_think_flag = false; chat_show.value[aiMessageChatShowIndex].status = "end"; }
                        else if (thinking.value && is_think_flag) { chat_show.value[aiMessageChatShowIndex].status = "thinking"; chat_show.value[aiMessageChatShowIndex].reasoning_content += deltaContent; }
                        else {
                            const appendText = (arr) => {
                                let lastPart = arr.length > 0 ? arr[arr.length - 1] : null;
                                if (lastPart && lastPart.type === 'text') lastPart.text += deltaContent;
                                else arr.push({ type: 'text', text: deltaContent });
                            };
                            appendText(historyContentArray); appendText(chatShowContentArray);
                        }
                    }
                    if (deltaImages && Array.isArray(deltaImages)) {
                        deltaImages.forEach(img => { historyContentArray.push(img); chatShowContentArray.push(img); });
                    }
                }
                scrollToBottom();
              } catch (parseError) { /* Gracefully ignore non-JSON lines */ }
            }
          }
        } catch (readError) {
          if (chat_show.value[aiMessageChatShowIndex]) {
            const contentArray = chat_show.value[aiMessageChatShowIndex].content;
            const errorText = readError.name === 'AbortError' ? '\n(已取消)' : `\n(读取流时出错: ${readError.message})`;
            let lastPart = contentArray.length > 0 ? contentArray[contentArray.length - 1] : null;
            if(lastPart && lastPart.type === 'text') { lastPart.text += errorText; }
            else { contentArray.push({type: 'text', text: errorText}); }
            if (thinking.value) chat_show.value[aiMessageChatShowIndex].status = "error";
          }
          thinking.value = false; is_think_flag = false; break;
        }
      }
    } else {
      const data = await aiResponse.json();
      const reasoning_content = data.choices?.[0]?.message?.reasoning_content || '';
      const aiContent = data.choices?.[0]?.message?.content || '抱歉，未能获取到回复内容。';
      const aiImages = data.choices?.[0]?.message?.images || [];
      const combinedContent = [];
      if (aiContent) combinedContent.push({ type: 'text', text: aiContent });
      aiImages.forEach(img => combinedContent.push(img));
      history.value[aiMessageHistoryIndex].content = combinedContent;
      if (chat_show.value[aiMessageChatShowIndex]) {
        chat_show.value[aiMessageChatShowIndex].content = combinedContent;
        chat_show.value[aiMessageChatShowIndex].reasoning_content = reasoning_content;
        chat_show.value[aiMessageChatShowIndex].status = reasoning_content ? "end" : "";
      }
    }
  } catch (error) {
    let errorDisplay = `发生错误: ${error.message || '未知错误'}`;
    if (error.name === 'AbortError') errorDisplay = "请求已取消";
    const errorContent = [{ type: "text", text: `错误: ${errorDisplay}` }];
    if (history.value[aiMessageHistoryIndex]) history.value[aiMessageHistoryIndex].content = errorContent;
    if (chat_show.value[aiMessageChatShowIndex]) chat_show.value[aiMessageChatShowIndex] = { ...chat_show.value[aiMessageChatShowIndex], content: errorContent, reasoning_content: "", status: "" };
    else chat_show.value.push({ id: messageIdCounter.value++, role: "assistant", content: errorContent, reasoning_content: "", status: "" });
  } finally {
    loading.value = false; signalController.value = null;
    const lastChatMsg = chat_show.value[chat_show.value.length - 1];
    if (lastChatMsg && lastChatMsg.role === 'assistant' && thinking.value && !is_think_flag) { lastChatMsg.status = "end"; thinking.value = false; }
    if (chat_show.value[aiMessageChatShowIndex] && chat_show.value[aiMessageChatShowIndex].role === 'assistant') {
      chat_show.value[aiMessageChatShowIndex].completedTimestamp = new Date().toLocaleString('sv-SE');
    }
    is_think_flag = false; scrollToBottom();
    chatInputRef.value?.focus({ cursor: 'end' });
  }
};

const cancelAskAI = () => { if (loading.value && signalController.value) { signalController.value.abort(); chatInputRef.value?.focus(); } };
const copyText = async (content, index) => { if (loading.value && index === history.value.length - 1) return; await window.api.copyText(content); };
const reaskAI = async () => {
  if (loading.value || history.value.length === 0) return;
  const lastHistoryMessage = history.value[history.value.length - 1];
  if (lastHistoryMessage.role === "system") return;
  if (lastHistoryMessage.role === "assistant") { history.value.pop(); chat_show.value.pop(); }
  await askAI(true);
};
const deleteMessage = (index) => {
  if (loading.value) { ElMessage.warning('请等待当前回复完成后再操作'); return; }
  if (index < 0 || index >= chat_show.value.length) return;
  if (chat_show.value[index]?.role === 'system') { ElMessage.info('系统提示词不能被删除'); return; }
  history.value.splice(index, 1);
  chat_show.value.splice(index, 1);
};
const clearHistory = () => {
  if (loading.value || history.value.length === 0) return;
  if (history.value[0].role === "system") { history.value = [history.value[0]]; chat_show.value = [chat_show.value[0]]; }
  else { history.value = []; chat_show.value = []; }
  collapsedMessages.value.clear(); messageRefs.clear(); focusedMessageIndex.value = null; 
  defaultConversationName.value = "";
  chatInputRef.value?.focus({ cursor: 'end' }); ElMessage.success('历史记录已清除');
};
const formatTimestamp = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const datePart = date.toLocaleDateString('sv-SE');
    const timePart = date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  } catch (e) { return ''; }
};
</script>

<template>
  <main>
    <el-container>
      <ChatHeader :favicon="favicon" :modelMap="modelMap" :model="model" :autoCloseOnBlur="autoCloseOnBlur"
        :temporary="temporary" @save-window-size="handleSaveWindowSize" @open-model-dialog="handleOpenModelDialog"
        @toggle-pin="handleTogglePin" @toggle-memory="handleToggleMemory" @save-session="handleSaveSession" />

      <div class="main-area-wrapper">
        <el-main ref="chatContainerRef" class="chat-main custom-scrollbar" @click="handleMarkdownImageClick"
          @scroll="handleScroll">
          <ChatMessage 
            v-for="(message, index) in chat_show" 
            :key="message.id" 
            :ref="el => setMessageRef(el, index)"
            :message="message" 
            :index="index" 
            :is-last-message="index === chat_show.length - 1" 
            :is-loading="loading"
            :user-avatar="UserAvart" 
            :ai-avatar="AIAvart" 
            :is-collapsed="isCollapsed(index)"
            :is-dark-mode="currentConfig.isDarkMode"
            @delete-message="handleDeleteMessage" 
            @copy-text="handleCopyText" 
            @re-ask="handleReAsk"
            @toggle-collapse="handleToggleCollapse" 
            @show-system-prompt="handleShowSystemPrompt"
            @avatar-click="onAvatarClick"
            @edit-message-requested="handleEditStart"
            @edit-finished="handleEditEnd"
            @edit-message="handleEditMessage"
            />
        </el-main>

        <div v-if="showScrollToBottomButton" class="scroll-to-bottom-wrapper">
          <el-button class="scroll-nav-btn" @click="navigateToPreviousMessage">
            <svg class="scroll-nav-icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
              <path fill="currentColor" d="m488.832 344.32-339.84 335.872a32 32 0 0 0 0 45.248l.064.064a32 32 0 0 0 45.248 0L512 412.928l317.696 312.576a32 32 0 0 0 45.248 0l.064-.064a32 32 0 0 0 0-45.248L533.824 344.32a32 32 0 0 0-44.992 0z"></path>
            </svg>
          </el-button>
          <el-button class="scroll-nav-btn" @click="navigateToNextMessage">
            <svg class="scroll-nav-icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
              <path fill="currentColor" d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.664 714.24a32 32 0 0 0 44.672 0l340.288-331.712a29.12 29.12 0 0 0 0-41.6 30.592 30.592 0 0 0-42.752 0z"></path>
            </svg>
          </el-button>
        </div>
      </div>

      <ChatInput ref="chatInputRef" v-model:prompt="prompt" v-model:fileList="fileList"
        v-model:selectedVoice="selectedVoice" v-model:tempReasoningEffort="tempReasoningEffort" :loading="loading"
        :ctrlEnterToSend="currentConfig.CtrlEnterToSend" :layout="inputLayout" :voiceList="currentConfig.voiceList"
        @submit="handleSubmit" @cancel="handleCancel" @clear-history="handleClearHistory"
        @remove-file="handleRemoveFile" @upload="handleUpload" @send-audio="handleSendAudio" />
    </el-container>
  </main>

  <ModelSelectionDialog v-model="changeModel_page" :modelList="modelList" :currentModel="model"
    @select="handleChangeModel" />

  <el-dialog v-model="systemPromptDialogVisible" title="编辑系统提示词" custom-class="system-prompt-dialog" width="60%" :show-close="true"
    :lock-scroll="false" :append-to-body="true" center :close-on-click-modal="true" :close-on-press-escape="true">
    <el-input v-model="systemPromptContent" type="textarea" :autosize="{ minRows: 4, maxRows: 15 }" class="system-prompt-full-content" resize="none" />
     <template #footer>
        <el-button @click="systemPromptDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveSystemPrompt">保存</el-button>
      </template>
  </el-dialog>

  <el-image-viewer 
    v-if="imageViewerVisible" 
    :url-list="imageViewerSrcList" 
    :initial-index="imageViewerInitialIndex"
    @close="imageViewerVisible = false" 
    :hide-on-click-modal="true" 
    teleported
  />
  <div v-if="imageViewerVisible" class="custom-viewer-actions">
      <el-button type="primary" :icon="DocumentCopy" circle @click="handleCopyImageFromViewer(imageViewerSrcList[0])" title="复制图片" />
      <el-button type="primary" :icon="Download" circle @click="handleDownloadImageFromViewer(imageViewerSrcList[0])" title="下载图片" />
  </div>
</template>

<style>
/* Global styles directly used by App.vue or its dynamic content */
html:not(.dark) {
  --text-primary: #000000;
  --el-text-color-primary: var(--text-primary);
}
.save-options-dialog.el-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  margin: 0 !important;
}

.save-options-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 10px 0 0 20px;
  margin: 0;
}

.save-option-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 20px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.save-option-item:hover {
  transform: scale(1.02);
  border-color: var(--el-color-primary);
  box-shadow: var(--el-box-shadow-light);
}

.save-option-text {
  flex-grow: 1;
  margin-right: 20px;
}

.save-option-text h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.save-option-text p {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

html.dark .save-option-item {
  border-color: var(--el-border-color-dark);
}

html.dark .save-option-item:hover {
  border-color: var(--el-color-primary);
  background-color: var(--el-fill-color-dark);
}

html.dark .save-option-text p {
  color: var(--el-text-color-regular);
}

.system-prompt-dialog .el-dialog__header {
  padding: 15px 20px;
  margin-right: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
html.dark .system-prompt-dialog .el-dialog__header {
    border-bottom-color: var(--el-border-color-dark);
}

.system-prompt-dialog .el-dialog__title {
    color: var(--el-text-color-primary);
}

.system-prompt-dialog .el-dialog__body {
  padding: 20px;
}

.system-prompt-dialog {
  background-color: var(--el-bg-color-overlay) !important;
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
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.system-prompt-full-content {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  width: 100%;
}
.system-prompt-full-content .el-textarea__inner {
  box-shadow: none !important;
  background-color: var(--el-fill-color-light) !important;
  max-height: 60vh;
}
html.dark .system-prompt-full-content .el-textarea__inner {
  background-color: var(--el-fill-color-dark) !important;
}


.filename-prompt-dialog.el-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  margin: 0 !important;
  max-width: 600px;
  width: 90%;
}

.filename-prompt-dialog .el-message-box__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 20px;
}

.filename-prompt-dialog .el-input {
  width: 100%;
  max-width: 520px;
}

.filename-prompt-dialog .el-input__wrapper {
  height: 44px;
  font-size: 16px;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.filename-prompt-dialog .el-input-group__append {
  height: 44px;
  display: flex;
  align-items: center;
  font-size: 16px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  color: var(--el-text-color-placeholder);
  background-color: var(--el-fill-color-light);
}

html.dark .filename-prompt-dialog .el-input-group__append {
  background-color: var(--el-bg-color);
  color: var(--el-text-color-placeholder);
  border-color: var(--el-border-color);
}

/* [MODIFIED] 新增并修正图片预览工具栏样式 */
.custom-viewer-actions {
    position: fixed;
    bottom: 100px; /* 定位在默认工具栏上方 (默认栏在 bottom: 40px) */
    left: 50%;
    transform: translateX(-50%);
    z-index: 2100; /* 确保在图片预览器之上 */
    padding: 6px 12px;
    background-color: rgba(0, 0, 0, 0.4);
    border-radius: 22px;
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    border: 1px solid rgba(255, 255, 255, 0.2);
}
.custom-viewer-actions .el-button {
    background-color: transparent;
    border: none;
    color: white;
    font-size: 16px;
}
.custom-viewer-actions .el-button:hover {
    background-color: rgba(255, 255, 255, 0.2);
}

.elx-run-code-drawer .elx-run-code-content-view-iframe {
  height: 100% !important;
}

.system-prompt-full-content .el-textarea__inner::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

.system-prompt-full-content .el-textarea__inner::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 4px;
}

.system-prompt-full-content .el-textarea__inner::-webkit-scrollbar-thumb {
    background: var(--el-text-color-disabled, #c0c4cc);
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: content-box;
}

.system-prompt-full-content .el-textarea__inner::-webkit-scrollbar-thumb:hover {
    background: var(--el-text-color-secondary, #909399);
    background-clip: content-box;
}

html.dark .system-prompt-full-content .el-textarea__inner::-webkit-scrollbar-thumb {
    background: #6b6b6b;
    background-clip: content-box;
}

html.dark .system-prompt-full-content .el-textarea__inner::-webkit-scrollbar-thumb:hover {
    background: #999;
    background-clip: content-box;
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
  font-family: ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
}

.main-area-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

.scroll-to-bottom-wrapper {
  position: absolute;
  bottom: 15px;
  right: 15px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0px;
}

.scroll-nav-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  box-shadow: var(--shadow-md);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  margin: 0px !important;

  &:hover {
    background-color: var(--bg-tertiary);
    color: var(--text-accent);
    transform: scale(1.1);
  }
}

html.dark .scroll-nav-btn {
  background-color: var(--bg-tertiary);
  border-color: var(--border-primary);
  color: var(--text-primary);

  &:hover {
    background-color: var(--bg-secondary);
  }
}

.scroll-nav-icon {
  transition: transform 0.2s ease;
}

.scroll-nav-btn:hover .scroll-nav-icon {
  transform: translateY(0);
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
</style>