<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch, h, computed } from 'vue';
import { ElContainer, ElMain, ElDialog, ElTooltip, ElImageViewer, ElMessage, ElMessageBox, ElInput, ElButton, ElCheckboxGroup, ElCheckbox, ElButtonGroup, ElTag, ElAlert } from 'element-plus';
import { createClient } from "webdav/web";

import ChatHeader from './components/ChatHeader.vue';
import ChatMessage from './components/ChatMessage.vue';
import ChatInput from './components/ChatInput.vue';
import ModelSelectionDialog from './components/ModelSelectionDialog.vue';

import { DocumentCopy, Download, Search } from '@element-plus/icons-vue';

import OpenAI from 'openai';
// No longer import from mcp-client.js

// 封装 ElMessage 以添加 showClose: true
const showDismissibleMessage = (options) => {
  const opts = typeof options === 'string' ? { message: options } : options;
  let messageInstance = null;
  const finalOpts = {
    ...opts,
    showClose: true,
    onClick: () => {
      if (messageInstance) {
        messageInstance.close();
      }
    }
  };
  messageInstance = ElMessage(finalOpts);
};
showDismissibleMessage.success = (message) => showDismissibleMessage({ message, type: 'success' });
showDismissibleMessage.error = (message) => showDismissibleMessage({ message, type: 'error' });
showDismissibleMessage.info = (message) => showDismissibleMessage({ message, type: 'info' });
showDismissibleMessage.warning = (message) => showDismissibleMessage({ message, type: 'warning' });


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
      showDismissibleMessage.error(`音频文件 ${file.name} 格式不正确`); return null;
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
const toolCallControllers = ref(new Map());

// --- MCP State ---
const isMcpDialogVisible = ref(false);
const sessionMcpServerIds = ref([]); // Store IDs of servers active for this session
const openaiFormattedTools = ref([]);
const mcpSearchQuery = ref('');
const isMcpLoading = ref(false);
const mcpFilter = ref('all'); // 新增：MCP过滤器状态, 'all', 'selected', 'unselected'

const isMcpActive = computed(() => sessionMcpServerIds.value.length > 0);

const availableMcpServers = computed(() => {
  if (!currentConfig.value || !currentConfig.value.mcpServers) return [];
  return Object.entries(currentConfig.value.mcpServers)
    .filter(([, server]) => server.isActive)
    .map(([id, server]) => ({ id, ...server }));
});

const filteredMcpServers = computed(() => {
  let servers = availableMcpServers.value;

  // Filter by selection status
  if (mcpFilter.value === 'selected') {
    servers = servers.filter(server => sessionMcpServerIds.value.includes(server.id));
  } else if (mcpFilter.value === 'unselected') {
    servers = servers.filter(server => !sessionMcpServerIds.value.includes(server.id));
  }

  // Filter by search query
  if (mcpSearchQuery.value) {
    const query = mcpSearchQuery.value.toLowerCase();
    servers = servers.filter(server =>
      (server.name && server.name.toLowerCase().includes(query)) ||
      (server.description && server.description.toLowerCase().includes(query))
    );
  }

  return servers;
});


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
          showDismissibleMessage.success('Code copied to clipboard!');
        }
        catch (err) { console.error('Failed to copy code:', err); showDismissibleMessage.error('Failed to copy code.'); }
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
  showDismissibleMessage.success(`模型已切换为: ${modelMap.value[chosenModel]}`);
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
const handleOpenMcpDialog = () => toggleMcpDialog();

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
  const loadingMessage = showDismissibleMessage({ message: '准备复制图片...', type: 'info', duration: 0 });
  (async () => {
    try {
      if (url.startsWith('data:image')) {
        await new Promise(resolve => setTimeout(resolve, 20));
        await window.api.copyImage(url);
        showDismissibleMessage.success('图片已复制到剪贴板');
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
      showDismissibleMessage.success('图片已复制到剪贴板');
    } catch (error) {
      console.error('复制图片失败:', error);
      showDismissibleMessage.error(`复制失败: ${error.message}`);
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
    showDismissibleMessage.success('图片保存成功！');
  } catch (error) {
    if (!error.message.includes('User cancelled') && !error.message.includes('用户取消')) {
      console.error('下载图片失败:', error);
      showDismissibleMessage.error(`下载失败: ${error.message}`);
    }
  }
};

const handleEditMessage = (index, newContent) => {
  if (index < 0 || index >= chat_show.value.length) return;

  // 1. 找到 history 数组中正确的索引，这会考虑到 chat_show 中不可见的 'tool' 消息。
  let history_idx = -1;
  let show_counter = -1;
  for (let i = 0; i < history.value.length; i++) {
    // 只有非 'tool' 类型的消息才计入 show_counter
    if (history.value[i].role !== 'tool') {
      show_counter++;
    }
    if (show_counter === index) {
      history_idx = i;
      break;
    }
  }

  // 2. 定义一个通用的内容更新函数
  const updateContent = (message) => {
    if (!message) return;
    if (typeof message.content === 'string' || message.content === null) {
      message.content = newContent;
    } else if (Array.isArray(message.content)) {
      // 寻找第一个可编辑的文本部分并更新它
      const textPart = message.content.find(p => p.type === 'text' && !(p.text && p.text.toLowerCase().startsWith('file name:')));
      if (textPart) {
        textPart.text = newContent;
      } else {
        // 如果没有文本部分，则添加一个新的
        message.content.push({ type: 'text', text: newContent });
      }
    }
  };

  // 3. 使用原始的 UI 索引更新 chat_show 数组
  if (chat_show.value[index]) {
    updateContent(chat_show.value[index]);
  }

  // 4. 使用我们计算出的正确索引来更新 history 数组
  if (history_idx !== -1 && history.value[history_idx]) {
    updateContent(history.value[history_idx]);
  } else {
    // 如果找不到映射，这是一个潜在的问题，进行日志记录以方便调试
    console.error("错误：无法将 chat_show 索引映射到 history 索引。下次API请求可能会使用旧数据。");
  }
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
      showDismissibleMessage.success('消息已更新');
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
      showDismissibleMessage.success('快捷助手提示词已更新');
    } else {
      // 创建新的快捷助手
      const latestConfigData = await window.api.getConfig();

      // 使用窗口加载时保存的源配置作为基础，如果没有则回退到默认AI配置
      const baseConfig = sourcePromptConfig.value || defaultConfig.config.prompts.AI;

      const newPrompt = {
        ...baseConfig, // 继承源配置或默认配置
        icon: AIAvart.value,
        prompt: newPromptContent, // 覆盖为新的提示词
        enable: true, // 新创建的默认启用
        model: model.value || baseConfig.model, // 使用当前窗口选择的模型
        enable: true,
        stream: true,
        isTemperature: false,
        temperature: 0.7,
        ifTextNecessary: false,
        isDirectSend_file: true,
        isDirectSend_normal: true,
        voice: "",
        isAlwaysOnTop: latestConfigData.config.isAlwaysOnTop_global,
        autoCloseOnBlur: latestConfigData.config.autoCloseOnBlur_global,
        window_width: 540,
        window_height: 700,
        position_x: 0,
        position_y: 0,
        reasoning_effort: "default",
        zoom: 1
      };

      latestConfigData.config.prompts[CODE.value] = newPrompt;
      await window.api.updateConfig(latestConfigData);
      currentConfig.value = latestConfigData.config;
      sourcePromptConfig.value = newPrompt; // 更新源配置为刚创建的新配置
      showDismissibleMessage.success(`已为您创建并保存新的快捷助手: "${CODE.value}"`);
    }
  } catch (error) {
    console.error("保存系统提示词失败:", error);
    showDismissibleMessage.error(`保存失败: ${error.message}`);
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
    showDismissibleMessage.error('加载配置失败，使用默认配置');
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
        } catch (error) { console.error("Error during initial file processing:", error); showDismissibleMessage.error("文件处理失败: " + error.message); }
      }
      if (autoCloseOnBlur.value) window.addEventListener('blur', closePage);
      if (currentPromptConfig?.defaultMcpServers && currentPromptConfig.defaultMcpServers.length > 0) {
        sessionMcpServerIds.value = [...currentPromptConfig.defaultMcpServers];
        await applyMcpTools();
      }
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

onBeforeUnmount(async () => {
  window.removeEventListener('wheel', handleWheel);
  window.removeEventListener('focus', handleWindowFocus);
  window.removeEventListener('blur', handleWindowBlur);
  if (!autoCloseOnBlur.value) window.removeEventListener('blur', closePage);
  const chatMainElement = chatContainerRef.value?.$el;
  if (chatMainElement) chatMainElement.removeEventListener('click', handleMarkdownImageClick);
  await window.api.closeMcpClient();
});

const saveWindowSize = async () => {
  if (!CODE.value || !currentConfig.value.prompts[CODE.value]) {
    showDismissibleMessage.warning('无法保存窗口设置，因为当前不是一个已定义的快捷助手。');
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
      showDismissibleMessage.success('当前快捷助手的窗口大小、位置及缩放已保存');
      currentConfig.value.prompts[CODE.value] = { ...currentConfig.value.prompts[CODE.value], ...settingsToSave };
    } else { showDismissibleMessage.error(`保存失败: ${result.message}`); }
  } catch (error) {
    console.error("Error saving window settings:", error);
    showDismissibleMessage.error('保存窗口设置时出错');
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
          if (!finalBasename) { showDismissibleMessage.error('文件名不能为空'); return; }
          if (finalBasename.toLowerCase().endsWith('.json')) finalBasename = finalBasename.slice(0, -5);
          const filename = finalBasename + '.json';
          instance.confirmButtonLoading = true;
          showDismissibleMessage.info('正在保存到云端...');
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
            showDismissibleMessage.success('会话已成功保存到云端！');
            done();
          } catch (error) {
            console.error("WebDAV save failed:", error);
            showDismissibleMessage.error(`保存到云端失败: ${error.message}`);
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
          if (!finalBasename) { showDismissibleMessage.error('文件名不能为空'); return; }
          if (finalBasename.toLowerCase().endsWith('.md')) finalBasename = finalBasename.slice(0, -3);
          const finalFilename = finalBasename + '.md';
          instance.confirmButtonLoading = true;
          try {
            await window.api.saveFile({ title: '保存为 Markdown', defaultPath: finalFilename, buttonLabel: '保存', filters: [{ name: 'Markdown 文件', extensions: ['md'] }, { name: '所有文件', extensions: ['*'] }], fileContent: markdownContent });
            defaultConversationName.value = finalBasename;
            showDismissibleMessage.success('会话已成功保存为 Markdown！');
            done();
          } catch (error) {
            if (!error.message.includes('canceled by the user')) { console.error('保存 Markdown 失败:', error); showDismissibleMessage.error(`保存失败: ${error.message}`); }
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
          if (!finalBasename) { showDismissibleMessage.error('文件名不能为空'); return; }
          if (finalBasename.toLowerCase().endsWith('.json')) finalBasename = finalBasename.slice(0, -5);
          const finalFilename = finalBasename + '.json';
          instance.confirmButtonLoading = true;
          try {
            await window.api.saveFile({ title: '保存聊天会话', defaultPath: finalFilename, buttonLabel: '保存', filters: [{ name: 'JSON 文件', extensions: ['json'] }, { name: '所有文件', extensions: ['*'] }], fileContent: jsonString });
            defaultConversationName.value = finalBasename;
            showDismissibleMessage.success('会话已成功保存！');
            done();
          } catch (error) {
            if (!error.message.includes('canceled by the user')) { console.error('保存会话失败:', error); showDismissibleMessage.error(`保存失败: ${error.message}`); }
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
    const mcpServersToLoad = jsonData.currentPromptConfig?.defaultMcpServers || [];
    if (Array.isArray(mcpServersToLoad) && mcpServersToLoad.length > 0) {
      sessionMcpServerIds.value = [...mcpServersToLoad];
      await applyMcpTools();
    } else {
      sessionMcpServerIds.value = [];
      await applyMcpTools();
    }
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
    } else { showDismissibleMessage.error("没有可用的模型。请检查您的服务商配置。"); loading.value = false; return; }
    await nextTick(); scrollToBottom();
  } catch (error) { console.error("加载会话失败:", error); showDismissibleMessage.error(`加载会话失败: ${error.message}`); }
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
    if (!handler) { const errorMsg = `不支持的文件类型: ${file.name}`; showDismissibleMessage.warning(errorMsg); reject(new Error(errorMsg)); return; }
    const reader = new FileReader();
    reader.onload = (e) => { fileList.value.push({ uid: idx, name: file.name, size: file.size, type: file.type, url: e.target.result }); resolve(); };
    reader.onerror = () => { const errorMsg = `读取文件 ${file.name} 失败`; showDismissibleMessage.error(errorMsg); reject(new Error(errorMsg)); }
    reader.readAsDataURL(file);
  });
};

const processFilePath = async (filePath) => {
  if (!filePath || typeof filePath !== 'string') { showDismissibleMessage.error('无效的文件路径'); return; }
  try {
    const fileObject = await window.api.handleFilePath(filePath);
    if (fileObject) await file2fileList(fileObject, fileList.value.length + 1);
    else showDismissibleMessage.error('无法读取或访问该文件，请检查路径和权限');
  } catch (error) { console.error('调用 handleFilePath 时发生意外错误:', error); showDismissibleMessage.error('处理文件路径时发生未知错误'); }
};

const sendFile = async () => {
  let contentList = []; if (fileList.value.length === 0) return contentList;
  for (const currentFile of fileList.value) {
    const handler = getFileHandler(currentFile.name);
    if (handler) {
      try { const processedContent = await handler(currentFile); if (processedContent) contentList.push(processedContent); }
      catch (error) { showDismissibleMessage.error(`处理文件 ${currentFile.name} 失败:${error.message}`); }
    } else showDismissibleMessage.warning(`文件类型不支持: ${currentFile.name}`);
  }
  fileList.value = []; return contentList;
};

function getRandomItem(list) {
  // 检查list是不是字符串
  if (typeof list === "string") {
    // 如果字符串包含逗号
    if (list.includes(",")) {
      list = list.split(",");
      // 删除空白字符
      list = list.filter(item => item.trim() !== "");
    }
    else if (list.includes("，")) {
      list = list.split("，");
      // 删除空白字符
      list = list.filter(item => item.trim() !== "");
    }
    else {
      return list;
    }
  }

  if (list.length === 0) {
    return "";
  }
  else {
    const resault = list[Math.floor(Math.random() * list.length)];
    return resault;
  }
}

async function applyMcpTools() {
  // 1. 立即关闭弹窗并显示加载状态
  isMcpDialogVisible.value = false;
  isMcpLoading.value = true;
  await nextTick();

  // 准备请求的服务器配置
  const activeServerConfigs = {};
  const serverIdsToLoad = [...sessionMcpServerIds.value];
  for (const id of serverIdsToLoad) {
    if (currentConfig.value.mcpServers[id]) {
      const serverConf = currentConfig.value.mcpServers[id];
      activeServerConfigs[id] = {
        transport: serverConf.type,
        command: serverConf.command,
        args: serverConf.args,
        url: serverConf.baseUrl,
      };
    }
  }

  try {
    // 2. 直接调用后端的同步函数，它现在是幂等的且能处理中止
    const {
      openaiFormattedTools: newFormattedTools,
      successfulServerIds,
      failedServerIds
    } = await window.api.initializeMcpClient(activeServerConfigs);

    // 3. 根据返回结果更新UI
    openaiFormattedTools.value = newFormattedTools;
    sessionMcpServerIds.value = successfulServerIds;

    if (failedServerIds && failedServerIds.length > 0) {
      const failedNames = failedServerIds.map(id => currentConfig.value.mcpServers[id]?.name || id).join('、');
      showDismissibleMessage.error({
        message: `以下 MCP 服务加载失败，已自动取消勾选: ${failedNames}`,
        duration: 5000
      });
    }

    if (newFormattedTools.length > 0) {
      showDismissibleMessage.success(`已成功启用 ${newFormattedTools.length} 个 MCP 工具`);
    } else if (serverIdsToLoad.length > 0 && failedServerIds.length === serverIdsToLoad.length) {
      showDismissibleMessage.info('所有选中的 MCP 工具均加载失败');
    } else if (serverIdsToLoad.length === 0) {
      showDismissibleMessage.info('已清除所有 MCP 工具');
    }

  } catch (error) {
    console.error("Failed to initialize MCP tools:", error);
    showDismissibleMessage.error(`加载MCP工具失败: ${error.message}`);
    openaiFormattedTools.value = [];
    sessionMcpServerIds.value = [];
  } finally {
    isMcpLoading.value = false;
  }
}

function clearMcpTools() {
  sessionMcpServerIds.value = [];
}

function selectAllMcpServers() {
  const allVisibleIds = filteredMcpServers.value.map(server => server.id);
  const selectedIdsSet = new Set(sessionMcpServerIds.value);
  allVisibleIds.forEach(id => selectedIdsSet.add(id));
  sessionMcpServerIds.value = Array.from(selectedIdsSet);
}


function toggleMcpDialog() {
  isMcpDialogVisible.value = !isMcpDialogVisible.value;
}

const askAI = async (forceSend = false) => {
  if (loading.value) return;
  if (isMcpLoading.value) {
    showDismissibleMessage.info('正在加载工具，请稍后再试...');
    return;
  }

  // --- 1. 处理用户输入 ---
  if (!forceSend) {
    let file_content = await sendFile();
    const promptText = prompt.value.trim();
    if ((file_content && file_content.length > 0) || promptText) {
      const userContentList = [];
      if (promptText) userContentList.push({ type: "text", text: promptText });
      if (file_content && file_content.length > 0) userContentList.push(...file_content);
      const userTimestamp = new Date().toLocaleString('sv-SE');
      if (userContentList.length > 0) {
        const contentForHistory = userContentList.length === 1 && userContentList[0].type === 'text'
          ? userContentList[0].text
          : userContentList;
        history.value.push({ role: "user", content: contentForHistory });
        chat_show.value.push({ id: messageIdCounter.value++, role: "user", content: userContentList, timestamp: userTimestamp });
      } else return;
    } else return;
    prompt.value = "";
  }

  if (temporary.value) {
    const systemMessage = history.value.find(m => m.role === 'system');
    const lastUserMessage = history.value.findLast(m => m.role === 'user');
    history.value = [systemMessage, lastUserMessage].filter(Boolean);
  }

  // --- 2. 初始化 AI 回合 ---
  loading.value = true;
  signalController.value = new AbortController();
  await nextTick();
  scrollToBottom();

  const currentPromptConfig = currentConfig.value.prompts[CODE.value];
  const isVoiceReply = !!selectedVoice.value;
  let useStream = currentPromptConfig?.stream && !isVoiceReply;

  const MAX_TOOL_CALLS = 5;
  let tool_calls_count = 0;

  let currentAssistantChatShowIndex = -1;

  try {
    const openai = new OpenAI({
      apiKey: () => getRandomItem(api_key.value),
      baseURL: base_url.value,
      dangerouslyAllowBrowser: true,
      maxRetries: 3,
    });

    // --- 3. 开始工具调用循环 ---
    while (tool_calls_count < MAX_TOOL_CALLS && !signalController.value.signal.aborted) {
      chatInputRef.value?.focus({ cursor: 'end' });

      // --- 为本次请求创建临时消息列表 ---
      const messagesForThisRequest = JSON.parse(JSON.stringify(history.value));

      // --- 仅在临时列表中注入MCP提示词 ---
      if (openaiFormattedTools.value.length > 0) {
        const mcpSystemPrompt = `
                
##工具调用声明
 
在此环境中， 您/assistant/model 可以使用工具来回答用户的问题，并在使用工具后获得工具调用结果，用户无法查看 您/assistant/model 与工具的交互内容。 您/assistant/model 需要循序渐进地使用工具来完成给定任务，每次工具的使用都以前一次工具使用的结果为依据。

## Skills:
- **工具调用逻辑规划**: 能够根据任务需求，判断工具使用的必要性、顺序和参数的准确性。
- **参数值校验**: 严格区分变量名与实际值，确保工具调用时所有参数均为有效值。
- **结果解析与内容合成**: 能够理解工具返回的原始数据，并将其转化为自然、流畅、用户友好的最终回复。
- **多媒体格式封装**: 精通Markdown和特定HTML标签的使用，确保图片、视频和音频链接能够以可预览的形式展示。
- **规则记忆与强约束执行**: 能够无条件地遵守所有给定的操作规则，避免重复和错误的调用。

## Rules:

以下是 您/assistant/model 解决任务时应始终遵循的规则：
1. **参数值优先原则**: 在任何情况下，对参数值的精确度应给予最高优先级，确保零错误率。
2. **调用约束**：仅在必要时调用工具，避免不必要的冗余操作。
3. **迭代效率优化**: 积极利用“绝不要重复调用”的约束，提高任务执行的效率和精确度。
4. **隐私约束**: 用户无法查看 您/assistant/model 的工具交互内容和原始返回结果；必须将结果合成后告知用户。
5. **用户视角驱动**: 始终站在用户的角度审视工具输出，思考如何将技术性的工具结果转化为具有价值的、易懂的信息。
6. **工具/用户交互隔离**: 严格维护工具调用结果和用户可见回复之间的隔离墙，确保用户始终接收到的是专业合成结果，而不是工具的原始调试信息。
7. **格式细致检查**: 在提交包含媒体链接的回复前，必须执行最终检查，确认格式（尤其是代码块排除约束）完全符合以下的规定:
  - **图片**: 必须使用Markdown格式：\`![内容描述](图片链接)\`
  - **视频**: 必须使用以下HTML格式：
  \`\`\`html
  <video controls style="max-width: 80%; max-height: 400px; height: auto; width: auto; display: block;"><source src="视频链接地址" type="video/mp4">您的浏览器不支持视频播放。</video>
  \`\`\`
  - **音频**: 必须使用以下HTML格式：
  \`\`\`html
  <audio id="audio" controls="" preload="none">
  <source id="mp3" src="音频链接地址">
  </audio>
  \`\`\`
  - **格式要求**: 所有多媒体展示格式（图片、视频、音频）**绝不能**包含在代码块（\`\`\`)中。

现在开始！如果 您/assistant/model 正确解决了任务，您将获得 1,000,000 美元的奖励。
`;
        const systemMessageIndex = messagesForThisRequest.findIndex(m => m.role === 'system');
        if (systemMessageIndex !== -1) {
          if (!messagesForThisRequest[systemMessageIndex].content.includes("##工具调用声明")) {
            messagesForThisRequest[systemMessageIndex].content += mcpSystemPrompt;
          }
        } else {
          messagesForThisRequest.unshift({ role: "system", content: mcpSystemPrompt });
        }
      }

      const payload = {
        model: model.value.split("|")[1],
        messages: messagesForThisRequest, // 使用临时的、注入了提示词的消息列表
        stream: useStream,
      };

      // 应用其他参数
      if (currentPromptConfig?.isTemperature) payload.temperature = currentPromptConfig.temperature;
      if (tempReasoningEffort.value && tempReasoningEffort.value !== 'default') payload.reasoning_effort = tempReasoningEffort.value;
      if (openaiFormattedTools.value.length > 0) {
        payload.tools = openaiFormattedTools.value;
        payload.tool_choice = "auto";
      }
      if (isVoiceReply) {
        payload.stream = false;
        useStream = false;
        payload.modalities = ["text", "audio"];
        payload.audio = { voice: selectedVoice.value.split('-')[0].trim(), format: "wav" };
      }

      // 为每个AI回合创建一个新的UI气泡
      const assistantMessageId = messageIdCounter.value++;
      chat_show.value.push({
        id: assistantMessageId,
        role: "assistant", content: [], reasoning_content: "", status: "",
        aiName: modelMap.value[model.value] || model.value.split('|')[1],
        voiceName: selectedVoice.value, tool_calls: []
      });
      currentAssistantChatShowIndex = chat_show.value.length - 1;
      scrollToBottom();

      let responseMessage;

      if (useStream) {
        const stream = await openai.chat.completions.create(payload, { signal: signalController.value.signal });

        let aggregatedContent = "";
        let aggregatedToolCalls = [];
        let lastUpdateTime = Date.now();

        for await (const part of stream) {
          const delta = part.choices[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            aggregatedContent += delta.content;
            if (Date.now() - lastUpdateTime > 100) {
              chat_show.value[currentAssistantChatShowIndex].content = [{ type: 'text', text: aggregatedContent }];
              scrollToBottom();
              lastUpdateTime = Date.now();
            }
          }

          if (delta.tool_calls) {
            for (const toolCallChunk of delta.tool_calls) {
              const index = toolCallChunk.index ?? aggregatedToolCalls.length;
              if (!aggregatedToolCalls[index]) {
                aggregatedToolCalls[index] = { id: "", type: "function", function: { name: "", arguments: "" } };
              }
              const currentTool = aggregatedToolCalls[index];
              if (toolCallChunk.id) currentTool.id = toolCallChunk.id;
              if (toolCallChunk.function?.name) currentTool.function.name = toolCallChunk.function.name;
              if (toolCallChunk.function?.arguments) currentTool.function.arguments += toolCallChunk.function.arguments;
            }
          }
        }

        responseMessage = { role: 'assistant', content: aggregatedContent || null };
        if (aggregatedToolCalls.length > 0) {
          responseMessage.tool_calls = aggregatedToolCalls.filter(tc => tc.id && tc.function.name);
        }
      } else {
        const response = await openai.chat.completions.create(payload, { signal: signalController.value.signal });
        responseMessage = response.choices[0].message;
      }

      // 将AI的回复同步到主 history 数组
      history.value.push(responseMessage);

      const currentBubble = chat_show.value[currentAssistantChatShowIndex];
      if (responseMessage.content) {
        currentBubble.content = [{ type: 'text', text: responseMessage.content }];
      }

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        tool_calls_count++;
        currentBubble.tool_calls = responseMessage.tool_calls.map(tc => ({
          id: tc.id, name: tc.function.name, args: tc.function.arguments, result: '执行中...',
        }));

        await nextTick();
        scrollToBottom();

        const toolMessages = await Promise.all(
          responseMessage.tool_calls.map(async (toolCall) => {
            const uiToolCall = currentBubble.tool_calls.find(t => t.id === toolCall.id);
            let toolContent;

            const controller = new AbortController();
            toolCallControllers.value.set(toolCall.id, controller);

            try {
              const toolArgs = JSON.parse(toolCall.function.arguments);
              const result = await window.api.invokeMcpTool(toolCall.function.name, toolArgs, controller.signal);
              toolContent = Array.isArray(result) ? result.filter(item => item?.type === 'text' && typeof item.text === 'string').map(item => item.text).join('\n\n') : String(result);
              if (uiToolCall) uiToolCall.result = toolContent;
            } catch (e) {
              if (e.name === 'AbortError') {
                toolContent = "Error: Tool call was canceled by the user.";
              } else {
                toolContent = `工具执行或参数解析错误: ${e.message}`;
              }
              if (uiToolCall) uiToolCall.result = toolContent;
            } finally {
              toolCallControllers.value.delete(toolCall.id);
            }
            return { tool_call_id: toolCall.id, role: "tool", name: toolCall.function.name, content: toolContent };
          })
        );

        // 将工具调用的结果同步到主 history 数组
        history.value.push(...toolMessages);
      } else {
        if (isVoiceReply && responseMessage.audio) {
          currentBubble.content = currentBubble.content || [];
          currentBubble.content.push({ type: "input_audio", input_audio: { data: responseMessage.audio.data, format: 'wav' } });
        }
        break; // 如果没有工具调用，则退出循环
      }
    } // 循环结束

    if (tool_calls_count >= MAX_TOOL_CALLS) {
      const errorMsg = '错误: 工具调用次数超过限制。';
      // 将错误消息同步到主 history 数组
      history.value.push({ role: 'assistant', content: errorMsg });

      chat_show.value.push({
        id: messageIdCounter.value++, role: "assistant", content: [{ type: 'text', text: errorMsg }],
        aiName: modelMap.value[model.value] || model.value.split('|')[1], voiceName: selectedVoice.value
      });
    }

  } catch (error) {
    let errorDisplay = `发生错误: ${error.message || '未知错误'}`;
    if (error.name === 'AbortError') errorDisplay = "请求已取消";

    const errorBubbleIndex = currentAssistantChatShowIndex > -1 ? currentAssistantChatShowIndex : chat_show.value.length;
    if (currentAssistantChatShowIndex === -1) {
      chat_show.value.push({
        id: messageIdCounter.value++, role: "assistant", content: [],
        aiName: modelMap.value[model.value] || model.value.split('|')[1], voiceName: selectedVoice.value
      });
    }
    chat_show.value[errorBubbleIndex].content = [{ type: "text", text: `错误: ${errorDisplay}` }];

    // 将错误消息同步到主 history 数组
    history.value.push({ role: 'assistant', content: `错误: ${errorDisplay}` });

  } finally {
    loading.value = false;
    signalController.value = null;
    if (currentAssistantChatShowIndex > -1) {
      chat_show.value[currentAssistantChatShowIndex].completedTimestamp = new Date().toLocaleString('sv-SE');
    }
    await nextTick();
    scrollToBottom();
    chatInputRef.value?.focus({ cursor: 'end' });
  }
};

const cancelAskAI = () => { if (loading.value && signalController.value) { signalController.value.abort(); chatInputRef.value?.focus(); } };
const copyText = async (content, index) => { if (loading.value && index === chat_show.value.length - 1) return; await window.api.copyText(content); };
const reaskAI = async () => {
  if (loading.value) return;

  // 1. 找到历史记录中最后一个非工具消息的索引。这是用户可见的最后一条消息。
  const lastVisibleMessageIndexInHistory = history.value.findLastIndex(msg => msg.role !== 'tool');

  if (lastVisibleMessageIndexInHistory === -1) {
    showDismissibleMessage.warning('没有可以重新提问的用户消息');
    return;
  }

  const lastVisibleMessage = history.value[lastVisibleMessageIndexInHistory];

  if (lastVisibleMessage.role === 'assistant') {
    // 规则: 如果最后一个可见消息是 AI 的回复（无论是简单回复还是工具调用发起者），
    // 则从 history 数组中移除这个 AI 消息以及它之后的所有工具消息。
    const historyItemsToRemove = history.value.length - lastVisibleMessageIndexInHistory;

    // 计算需要从 chat_show 数组中移除多少个可见项。
    const showItemsToRemove = history.value.slice(lastVisibleMessageIndexInHistory)
      .filter(m => m.role !== 'tool').length;

    history.value.splice(lastVisibleMessageIndexInHistory, historyItemsToRemove);
    if (showItemsToRemove > 0) {
      chat_show.value.splice(chat_show.value.length - showItemsToRemove);
    }

  } else if (lastVisibleMessage.role === 'user') {
    // 规则: 如果最后一个可见消息是用户的，不修改历史记录，直接重新请求。
    // 此处无需任何操作。
  } else {
    // 其他情况（如系统消息），不应触发重新提问。
    showDismissibleMessage.warning('无法从此消息类型重新提问。');
    return;
  }

  // 3. 清理状态并发送新的AI请求
  collapsedMessages.value.clear();
  await nextTick();
  await askAI(true);
};

const deleteMessage = (index) => {
  if (loading.value) {
    showDismissibleMessage.warning('请等待当前回复完成后再操作');
    return;
  }
  if (index < 0 || index >= chat_show.value.length) return;

  const msgToDeleteInShow = chat_show.value[index];
  if (msgToDeleteInShow?.role === 'system') {
    showDismissibleMessage.info('系统提示词不能被删除');
    return;
  }

  // --- 1. 定位消息在 `history` 数组中的真实索引 ---
  // `chat_show` 只包含可见消息，`history` 包含所有消息（包括隐藏的 'tool' 类型）
  let history_idx = -1;
  let show_counter = -1;
  for (let i = 0; i < history.value.length; i++) {
    // 只有非 'tool' 消息才计入 `chat_show` 的索引
    if (history.value[i].role !== 'tool') {
      show_counter++;
    }
    if (show_counter === index) {
      history_idx = i;
      break;
    }
  }

  if (history_idx === -1) {
    console.error("关键错误: 无法将 chat_show 索引映射到 history 索引。中止删除。");
    showDismissibleMessage.error("删除失败：消息状态不一致。");
    return;
  }

  // --- 2. 根据消息类型和上下文，确定要删除的 `history` 范围 ---
  const messageToDeleteInHistory = history.value[history_idx];
  let history_start_idx = history_idx;
  let history_end_idx = history_idx;

  // 核心逻辑：判断被删除的消息是否是工具调用的发起者
  if (
    messageToDeleteInHistory.role === 'assistant' &&
    messageToDeleteInHistory.tool_calls &&
    messageToDeleteInHistory.tool_calls.length > 0
  ) {
    // 如果是，则需要一并删除其后紧邻的所有 'tool' 消息
    // 这形成了一个“命运共同体”：(发起调用的AI, tool, tool, ...)
    while (history.value[history_end_idx + 1]?.role === 'tool') {
      history_end_idx++;
    }
  }
  // 对于其他所有情况（用户消息、简单的AI回复、总结性的AI回复），
  // history_start_idx 和 history_end_idx 将保持相等，只删除单个消息。
  // 这就正确地将总结性AI回复与它之前的工具调用链分离开来。

  // --- 3. 计算并执行删除操作 ---

  // 计算在 history 数组中需要删除的条目数量
  const history_delete_count = history_end_idx - history_start_idx + 1;

  // 在 chat_show 数组中，只删除用户点击的那一条可见消息
  const show_delete_count = 1;
  const show_start_idx = index;

  // 从 history 数组中删除
  if (history_delete_count > 0) {
    history.value.splice(history_start_idx, history_delete_count);
  }

  // 从 chat_show 数组中删除
  if (show_delete_count > 0) {
    chat_show.value.splice(show_start_idx, show_delete_count);
  }

  const deletedIndexInShow = index;
  const newCollapsedMessages = new Set();
  for (const collapsedIdx of collapsedMessages.value) {
    if (collapsedIdx < deletedIndexInShow) {
      newCollapsedMessages.add(collapsedIdx);
    } else if (collapsedIdx > deletedIndexInShow) {
      newCollapsedMessages.add(collapsedIdx - 1);
    }
  }
  collapsedMessages.value = newCollapsedMessages;

  focusedMessageIndex.value = null;
};

const clearHistory = () => {
  if (loading.value) return;

  // 检查当前快捷助手配置中是否存在系统提示词
  const systemPrompt = currentConfig.value.prompts[CODE.value]?.prompt;

  if (systemPrompt) {
    // 如果存在，则重置为仅包含该系统提示词的状态
    const systemMsg = { role: "system", content: systemPrompt };
    history.value = [systemMsg];
    // 为 chat_show 中的消息添加唯一ID，确保UI正确更新
    chat_show.value = [{ ...systemMsg, id: messageIdCounter.value++ }];
  } else {
    // 如果不存在系统提示词，则完全清空
    history.value = [];
    chat_show.value = [];
  }

  // 重置所有相关的UI状态
  collapsedMessages.value.clear();
  messageRefs.clear();
  focusedMessageIndex.value = null;
  defaultConversationName.value = "";
  chatInputRef.value?.focus({ cursor: 'end' });
  showDismissibleMessage.success('历史记录已清除');
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

const truncateText = (text, maxLength = 40) => {
  if (typeof text !== 'string' || text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
};

function toggleMcpServerSelection(serverId) {
  const index = sessionMcpServerIds.value.indexOf(serverId);
  if (index === -1) {
    sessionMcpServerIds.value.push(serverId);
  } else {
    sessionMcpServerIds.value.splice(index, 1);
  }
}

const focusOnInput = () => {
  setTimeout(() => {
    chatInputRef.value?.focus({ cursor: 'end' });
  }, 100);
};

const handleCancelToolCall = (toolCallId) => {
    const controller = toolCallControllers.value.get(toolCallId);
    if (controller) {
        controller.abort();
        showDismissibleMessage.info('正在取消工具调用...');
    }
};
</script>

<template>
  <main>
    <el-container>
      <ChatHeader :favicon="favicon" :modelMap="modelMap" :model="model" :autoCloseOnBlur="autoCloseOnBlur"
        :temporary="temporary" :is-mcp-loading="isMcpLoading" @save-window-size="handleSaveWindowSize"
        @open-model-dialog="handleOpenModelDialog" @toggle-pin="handleTogglePin" @toggle-memory="handleToggleMemory"
        @save-session="handleSaveSession" />

      <div class="main-area-wrapper">
        <el-main ref="chatContainerRef" class="chat-main custom-scrollbar" @click="handleMarkdownImageClick"
          @scroll="handleScroll">
          <ChatMessage v-for="(message, index) in chat_show" :key="message.id" :ref="el => setMessageRef(el, index)"
            :message="message" :index="index" :is-last-message="index === chat_show.length - 1" :is-loading="loading"
            :user-avatar="UserAvart" :ai-avatar="AIAvart" :is-collapsed="isCollapsed(index)"
            :is-dark-mode="currentConfig.isDarkMode" @delete-message="handleDeleteMessage" @copy-text="handleCopyText"
            @re-ask="handleReAsk" @toggle-collapse="handleToggleCollapse" @show-system-prompt="handleShowSystemPrompt"
            @avatar-click="onAvatarClick" @edit-message-requested="handleEditStart" @edit-finished="handleEditEnd"
            @edit-message="handleEditMessage" @cancel-tool-call="handleCancelToolCall" />
        </el-main>

        <div v-if="showScrollToBottomButton" class="scroll-to-bottom-wrapper">
          <el-button class="scroll-nav-btn" @click="navigateToPreviousMessage">
            <svg class="scroll-nav-icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="20"
              height="20">
              <path fill="currentColor"
                d="m488.832 344.32-339.84 335.872a32 32 0 0 0 0 45.248l.064.064a32 32 0 0 0 45.248 0L512 412.928l317.696 312.576a32 32 0 0 0 45.248 0l.064-.064a32 32 0 0 0 0-45.248L533.824 344.32a32 32 0 0 0-44.992 0z">
              </path>
            </svg>
          </el-button>
          <el-button class="scroll-nav-btn" @click="navigateToNextMessage">
            <svg class="scroll-nav-icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="20"
              height="20">
              <path fill="currentColor"
                d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.664 714.24a32 32 0 0 0 44.672 0l340.288-331.712a29.12 29.12 0 0 0 0-41.6 30.592 30.592 0 0 0-42.752 0z">
              </path>
            </svg>
          </el-button>
        </div>
      </div>

      <ChatInput ref="chatInputRef" v-model:prompt="prompt" v-model:fileList="fileList"
        v-model:selectedVoice="selectedVoice" v-model:tempReasoningEffort="tempReasoningEffort" :loading="loading"
        :ctrlEnterToSend="currentConfig.CtrlEnterToSend" :layout="inputLayout" :voiceList="currentConfig.voiceList"
        :is-mcp-active="isMcpActive" @submit="handleSubmit" @cancel="handleCancel" @clear-history="handleClearHistory"
        @remove-file="handleRemoveFile" @upload="handleUpload" @send-audio="handleSendAudio"
        @open-mcp-dialog="handleOpenMcpDialog" />
    </el-container>
  </main>

  <ModelSelectionDialog v-model="changeModel_page" :modelList="modelList" :currentModel="model"
    @select="handleChangeModel" />

  <el-dialog v-model="systemPromptDialogVisible" title="编辑系统提示词" custom-class="system-prompt-dialog" width="60%"
    :show-close="true" :lock-scroll="false" :append-to-body="true" center :close-on-click-modal="true"
    :close-on-press-escape="true">
    <el-input v-model="systemPromptContent" type="textarea" :autosize="{ minRows: 4, maxRows: 15 }"
      class="system-prompt-full-content" resize="none" />
    <template #footer>
      <el-button @click="systemPromptDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="saveSystemPrompt">保存</el-button>
    </template>
  </el-dialog>

  <el-image-viewer v-if="imageViewerVisible" :url-list="imageViewerSrcList" :initial-index="imageViewerInitialIndex"
    @close="imageViewerVisible = false" :hide-on-click-modal="true" teleported />
  <div v-if="imageViewerVisible" class="custom-viewer-actions">
    <el-button type="primary" :icon="DocumentCopy" circle @click="handleCopyImageFromViewer(imageViewerSrcList[0])"
      title="复制图片" />
    <el-button type="primary" :icon="Download" circle @click="handleDownloadImageFromViewer(imageViewerSrcList[0])"
      title="下载图片" />
  </div>

  <el-dialog v-model="isMcpDialogVisible" title="启用 MCP" width="540px" top="10vh" custom-class="mcp-dialog"
    @close="focusOnInput">
    <div class="mcp-dialog-content">
      <div class="mcp-dialog-toolbar">
        <el-button-group>
          <el-button :type="mcpFilter === 'all' ? 'primary' : ''" @click="mcpFilter = 'all'">全部</el-button>
          <el-button :type="mcpFilter === 'selected' ? 'primary' : ''" @click="mcpFilter = 'selected'">已选
          </el-button>
          <el-button :type="mcpFilter === 'unselected' ? 'primary' : ''" @click="mcpFilter = 'unselected'">未选
          </el-button>
        </el-button-group>
      </div>
      <div class="mcp-server-list custom-scrollbar">
        <div v-for="server in filteredMcpServers" :key="server.id" class="mcp-server-item"
          :class="{ 'is-checked': sessionMcpServerIds.includes(server.id) }"
          @click="toggleMcpServerSelection(server.id)">
          <el-checkbox :model-value="sessionMcpServerIds.includes(server.id)" size="large"
            @change="() => toggleMcpServerSelection(server.id)" @click.stop />
          <div class="mcp-server-content">
            <div class="mcp-server-header-row">
              <span class="mcp-server-name">{{ server.name }}</span>
              <div class="mcp-server-tags">
                <el-tag v-if="server.type" type="info" size="small" effect="plain" round>{{ server.type }}</el-tag>
                <el-tag v-for="tag in (server.tags || []).slice(0, 2)" :key="tag" size="small" effect="plain" round>{{
                  tag
                  }}</el-tag>
              </div>
            </div>
            <span v-if="server.description" class="mcp-server-description">{{ server.description }}</span>
          </div>
        </div>
      </div>
      <div class="mcp-dialog-footer-search">
        <el-input v-model="mcpSearchQuery" placeholder="搜索工具名称或描述..." :prefix-icon="Search" clearable />
      </div>
    </div>
    <template #footer>
      <div class="mcp-dialog-footer">
        <span class="mcp-limit-hint">Utools 限制最多启用5个MCP服务</span>
        <div>
          <!-- 因为全选会出bug，当前无法解决，故隐藏该功能 -->
          <!-- <el-button @click="selectAllMcpServers">全选当前</el-button> -->
          <el-button @click="clearMcpTools">清除全部</el-button>
          <el-button type="primary" @click="applyMcpTools">应用</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
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
  bottom: 100px;
  /* 定位在默认工具栏上方 (默认栏在 bottom: 40px) */
  left: 50%;
  transform: translateX(-50%);
  z-index: 2100;
  /* 确保在图片预览器之上 */
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
}

.mcp-dialog .mcp-dialog-content p {
  margin-top: 0;
  margin-bottom: 15px;
  color: var(--el-text-color-secondary);
  padding: 0 5px;
  flex-shrink: 0;
}

.mcp-server-header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.mcp-server-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
  min-width: 0;
  flex-grow: 1;
}

.mcp-server-tags {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
}

.mcp-server-description {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mcp-server-description {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mcp-dialog-footer-search {
  flex-shrink: 0;
  padding: 15px 15px 0 0;
  margin-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}

html.dark .mcp-dialog-footer-search {
  border-top-color: var(--el-border-color-darker);
}

.mcp-dialog .mcp-dialog-content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  overflow: hidden;
  flex-direction: column;
  padding: 0 10px;
}

.mcp-dialog-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  flex-shrink: 0;
  padding: 0 5px;
}

.mcp-checkbox-group {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 10px;
  max-height: 45vh;
  overflow-y: auto;
  padding-right: 5px;
}

.mcp-server-tags .el-tag {
  height: 20px;
  padding: 0 6px;
}

.mcp-server-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 35vh;
  /* 您可以按需调整高度 */
  overflow-y: auto;
  padding: 5px;
}

.mcp-server-item {
  display: flex;
  align-items: flex-start;
  /* 顶部对齐 */
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.mcp-server-item:hover {
  background-color: var(--el-fill-color-light);
}

.mcp-server-item.is-checked {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

html.dark .mcp-server-item:hover {
  background-color: var(--el-fill-color-darker);
}

html.dark .mcp-server-item.is-checked {
  background-color: var(--el-fill-color-dark);
}

.mcp-server-item .el-checkbox {
  margin-top: 1px;
  /* 微调复选框垂直位置 */
}

.mcp-server-content {
  flex: 1;
  min-width: 0;
  /* 允许flex子元素收缩 */
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mcp-server-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.mcp-server-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mcp-server-tags {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  /* 防止标签被压缩 */
}

.mcp-server-description {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

html.dark .mcp-server-list .el-checkbox__input.is-checked .el-checkbox__inner {
  background-color: #fff !important;
  border-color: #fff !important;
}

html.dark .mcp-server-list .el-checkbox__input.is-checked .el-checkbox__inner::after {
  border-color: #1d1d1d !important;
  /* 设置为深色 */
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

.mcp-dialog-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
}
.mcp-limit-hint {
    font-size: 12px;
    color: var(--el-color-warning);
}
</style>