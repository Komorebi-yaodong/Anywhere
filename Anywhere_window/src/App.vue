<script setup>
  import { ArrowDown, ArrowUp, CaretRight, Collection, Cpu, DocumentCopy, Download, QuestionFilled, Refresh, Search, Tools, Warning } from '@element-plus/icons-vue';
  import { ElAvatar, ElButton, ElCheckbox, ElContainer, ElDialog, ElIcon, ElImageViewer, ElInput, ElMain, ElMessage, ElMessageBox, ElOption, ElSelect, ElSwitch, ElTag, ElTooltip } from 'element-plus';
  import { computed, defineAsyncComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { createClient } from "webdav/web";

  import ChatHeader from './components/ChatHeader.vue';
import ChatInput from './components/ChatInput.vue';
import ModelSelectionDialog from './components/ModelSelectionDialog.vue';
import TaskPanel from './components/TaskPanel.vue';
  import TitleBar from './components/TitleBar.vue';
  const ChatMessage = defineAsyncComponent(() => import('./components/ChatMessage.vue'));

import TextSearchUI from './utils/TextSearchUI.js';
import { formatTimestamp, sanitizeToolArgs, sanitizeToolFunctionName } from './utils/formatters.js';

let gptTokenizerEncodePromise = null;
const loadGptTokenizerEncode = () => {
  if (!gptTokenizerEncodePromise) {
    gptTokenizerEncodePromise = import('gpt-tokenizer').then(mod => mod.encode || mod.default?.encode);
  }
  return gptTokenizerEncodePromise;
};

let html2canvasPromise = null;
const loadHtml2Canvas = () => {
  if (!html2canvasPromise) {
    html2canvasPromise = import('html2canvas').then(mod => mod.default || mod);
  }
  return html2canvasPromise;
};

let exportHtmlDepsPromise = null;
const loadExportHtmlDeps = () => {
  if (!exportHtmlDepsPromise) {
    exportHtmlDepsPromise = Promise.all([
      import('dompurify'),
      import('marked')
    ]).then(([dompurifyMod, markedMod]) => ({
      DOMPurify: dompurifyMod.default || dompurifyMod,
      marked: markedMod.marked || markedMod.default || markedMod
    }));
  }
  return exportHtmlDepsPromise;
};

const showDismissibleMessage = (options) => {
  const opts = typeof options === 'string' ? { message: options } : options;
  const duration = opts.duration !== undefined ? opts.duration : 1000;

  let messageInstance = null;
  const finalOpts = {
    ...opts,
    duration: duration,
    showClose: false,
    grouping: true,
    offset: 40,
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

const handleMinimize = () => window.api.windowControl('minimize-window');
const handleMaximize = () => window.api.windowControl('maximize-window');
const handleCloseWindow = () => closePage();

const chatInputRef = ref(null);
const lastSelectionStart = ref(null);
const lastSelectionEnd = ref(null);
const chatContainerRef = ref(null);
const isAtBottom = ref(true);
const showScrollToBottomButton = ref(false);
const isForcingScroll = ref(false);
const messageRefs = new Map();
const focusedMessageIndex = ref(null);
const navTimelineScrollerRef = ref(null);

const getLastNavigableMessageIndex = () => {
  for (let i = chat_show.value.length - 1; i >= 0; i--) {
    if (chat_show.value[i]?.role !== 'system') return i;
  }
  return null;
};

const centerActiveNavNode = async (targetIndex = focusedMessageIndex.value) => {
  if (targetIndex === null || targetIndex === undefined) return;
  await nextTick();
  const scroller = navTimelineScrollerRef.value;
  if (!scroller) return;
  const activeNode = scroller.querySelector(`.timeline-node-wrapper[data-original-index="${targetIndex}"]`);
  if (!activeNode) return;
  const targetScrollTop = activeNode.offsetTop - (scroller.clientHeight / 2) + (activeNode.offsetHeight / 2);
  scroller.scrollTo({
    top: Math.max(0, targetScrollTop),
    behavior: 'smooth'
  });
};

// 核心状态：是否粘滞在底部
const isSticky = ref(true);
let chatObserver = null;    // ResizeObserver 实例，用于兜底监听消息高度变化
let stickyObservedContainer = null;
let stickyObservedMessage = null;
let stickyScrollGuardUntil = 0;
let lastUserScrollIntentAt = 0;
let lastKnownChatScrollTop = 0;
let stickyScrollRafIds = [];
const STICKY_SCROLL_GUARD_MS = 220;
const USER_SCROLL_INTENT_MS = 260;

const AUTO_SAVE_INPUT_DEBOUNCE_MS = 800;
const AUTO_SAVE_LOADING_THROTTLE_MS = 2500;
let autoSaveTimer = null;
let scheduledAutoSaveRequest = null;
let queuedAutoSaveRequest = null;
let autoSaveExecutionPromise = null;
let lastAutoSaveAt = 0;




let textSearchInstance = null;

const setMessageRef = (el, id) => {
  if (el) messageRefs.set(id, el);
  else messageRefs.delete(id);
};

const getMessageComponentByIndex = (index) => {
  const msg = chat_show.value[index];
  if (!msg) return undefined;
  return messageRefs.get(msg.id);
};

const getMessageElementByIndex = (index) => {
  const target = getMessageComponentByIndex(index);
  return target?.$el?.nodeType === 1 ? target.$el : null;
};

const getLastMessageElement = () => {
  const lastIndex = getLastNavigableMessageIndex();
  return lastIndex === null || lastIndex === undefined
    ? null
    : getMessageElementByIndex(lastIndex);
};


const normalizeModelDialogProviderCollapseStates = (input, providerNames = []) => {
  const nextStates = {};
  const source = input && typeof input === 'object' ? input : {};
  const providerSet = new Set(providerNames.filter(Boolean));

  providerSet.forEach((providerName) => {
    nextStates[providerName] = typeof source[providerName] === 'boolean' ? source[providerName] : true;
  });

  return nextStates;
};

const syncModelDialogProviderCollapseStates = (config) => {
  const providerNames = (modelList.value || [])
    .map(item => item?.providerName || String(item?.label || '').split('|')[0])
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  const savedStates = config?.ui?.windowModelDialogProviderCollapseStates;
  const normalizedStates = normalizeModelDialogProviderCollapseStates(savedStates, providerNames);
  const prevSerialized = JSON.stringify(modelDialogProviderCollapseStates.value || {});
  const nextSerialized = JSON.stringify(normalizedStates);

  if (prevSerialized !== nextSerialized) {
    modelDialogProviderCollapseStates.value = normalizedStates;
  }

  return normalizedStates;
};

const handleProviderCollapseStatesChange = async (nextStates) => {
  const normalizedStates = normalizeModelDialogProviderCollapseStates(
    nextStates,
    (modelList.value || []).map(item => item?.providerName || String(item?.label || '').split('|')[0])
  );
  const prevSerialized = JSON.stringify(modelDialogProviderCollapseStates.value || {});
  const nextSerialized = JSON.stringify(normalizedStates);

  if (prevSerialized === nextSerialized) {
    return;
  }

  modelDialogProviderCollapseStates.value = normalizedStates;
  currentConfig.value.ui = currentConfig.value.ui || {};
  currentConfig.value.ui.windowModelDialogProviderCollapseStates = normalizedStates;

  try {
    await window.api.saveSetting('ui.windowModelDialogProviderCollapseStates', normalizedStates);
  } catch (error) {
    console.warn('保存模型弹窗折叠状态失败', error);
  }
};

const updateModelListAndMap = (config) => {
  const newModelList = [];
  const newModelMap = {};

  const folders = config.providerFolders || {};
  const order = config.providerOrder || [];

  // 1. 文件夹按字母序排序
  const sortedFolderIds = Object.keys(folders).sort((a, b) =>
    (folders[a].name || '').localeCompare(folders[b].name || '')
  );

  const orderedProviderIds = [];
  // 2. 优先提取文件夹内的服务商
  sortedFolderIds.forEach(folderId => {
    order.forEach(id => {
      const p = config.providers[id];
      if (p && p.folderId === folderId) orderedProviderIds.push(id);
    });
  });
  // 3. 提取根目录的服务商
  order.forEach(id => {
    const p = config.providers[id];
    if (p && (!p.folderId || !folders[p.folderId])) orderedProviderIds.push(id);
  });

  // 4. 组装最终的模型列表
  orderedProviderIds.forEach(id => {
    const provider = config.providers[id];
    if (provider?.enable) {
      const providerName = String(provider.name || id);
      provider.modelList.forEach(m => {
        const key = `${id}|${m}`;
        newModelList.push({
          key,
          value: key,
          label: `${providerName}|${m}`,
          providerName,
          modelName: String(m || ''),
          providerId: String(id),
          providerUrl: String(provider.url || ''),
          providerApiKey: String(provider.api_key || '')
        });
        newModelMap[key] = `${providerName}|${m}`;
      });
    }
  });

  modelList.value = newModelList;
  modelMap.value = newModelMap;
  syncModelDialogProviderCollapseStates(config);
};

const urlParams = new URLSearchParams(window.location.search);
const isDarkInit = urlParams.get('dark') === '1';
if (isDarkInit) {
  document.documentElement.classList.add('dark');
}

const defaultConfig = window.api.defaultConfig;
const UserAvart = ref("user.png");
const AIAvart = ref("ai.svg");
const favicon = ref("favicon.png");
const CODE = ref("");

const isInit = ref(false);
const isFilePickerOpen = ref(false); // 标记文件选择器是否打开
const isPreparingSend = ref(false); // 防止发送文件异步解析时的并发触发
const basic_msg = ref({ os: "macos", code: "AI", type: "over", payload: "请简洁地介绍一下你自己" });
const initialConfigData = JSON.parse(JSON.stringify(defaultConfig.config));
if (isDarkInit) {
  initialConfigData.isDarkMode = true;
}
const currentConfig = ref(initialConfigData);
const autoCloseOnBlur = ref(false);
const modelList = ref([]);
const modelMap = ref({});
const model = ref("");

const currentModelLogo = ref('');
let modelLogoResolveToken = 0;

const getCurrentModelNameForLogo = (modelValue = model.value) => {
  const parts = String(modelValue || '').split('|');
  return (parts[1] || parts[0] || '').trim();
};

const resolveCurrentModelLogo = async (modelValue = model.value) => {
  const modelName = getCurrentModelNameForLogo(modelValue);
  const requestToken = ++modelLogoResolveToken;

  if (!modelName) {
    currentModelLogo.value = '';
    return;
  }

  try {
    const response = await fetch(`https://llm-model.141277.xyz/v1/resolve?model=${encodeURIComponent(modelName)}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const logo = typeof payload?.resolved?.logo === 'string' ? payload.resolved.logo.trim() : '';
    const shouldUseLogo = /^https?:\/\//i.test(logo);

    if (requestToken === modelLogoResolveToken) {
      currentModelLogo.value = shouldUseLogo ? logo : '';
    }
  } catch (error) {
    if (requestToken === modelLogoResolveToken) {
      currentModelLogo.value = '';
    }
  }
};

const handleModelLogoError = () => {
  currentModelLogo.value = '';
};

watch(model, (nextModel) => {
  resolveCurrentModelLogo(nextModel);
}, { immediate: false });

const modelDialogProviderCollapseStates = ref({});
const isAlwaysOnTop = ref(true);
const currentOS = ref('win');
const currentTaskConfig = ref(null);

const currentProviderID = ref(defaultConfig.config.providerOrder[0]);
const base_url = ref("");
const api_key = ref("");
const history = ref([]);
const chat_show = ref([]);
const loading = ref(false);
const prompt = ref("");
const signalController = ref(null);
const activeAssistantTurnId = ref(0);
const fileList = ref([]);
const zoomLevel = ref(1);

const normalizeZoomLevel = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Math.max(0.5, Math.min(2.0, numericValue));
};

const resolveWindowZoomLevel = (...candidates) => {
  for (const candidate of candidates) {
    const normalizedZoom = normalizeZoomLevel(candidate);
    if (normalizedZoom !== null) return normalizedZoom;
  }
  return 1;
};

const collapsedMessages = ref(new Set());
const defaultConversationName = ref("");
const selectedVoice = ref(null);
const tempReasoningEffort = ref('default');
const messageIdCounter = ref(0);
const sourcePromptConfig = ref(null);
const cachedBackgroundBlobUrl = ref("");

const windowBackgroundImage = computed(() => {
  if (cachedBackgroundBlobUrl.value) {
    return cachedBackgroundBlobUrl.value;
  }
  if (!CODE.value || !currentConfig.value?.prompts) return "";
  const promptConfig = currentConfig.value.prompts[CODE.value];
  return promptConfig?.backgroundImage || "";
});

const windowBackgroundOpacity = computed(() => {
  if (!CODE.value || !currentConfig.value?.prompts) return 0.5;
  const promptConfig = currentConfig.value.prompts[CODE.value];
  return promptConfig?.backgroundOpacity ?? 0.5;
});

const windowBackgroundBlur = computed(() => {
  if (!CODE.value || !currentConfig.value?.prompts) return 0;
  const promptConfig = currentConfig.value.prompts[CODE.value];
  return promptConfig?.backgroundBlur ?? 0;
});

const loadBackground = async (newUrl) => {
  if (!newUrl) {
    if (cachedBackgroundBlobUrl.value) {
      if (cachedBackgroundBlobUrl.value.startsWith('blob:')) {
        URL.revokeObjectURL(cachedBackgroundBlobUrl.value);
      }
      cachedBackgroundBlobUrl.value = "";
    }
    return;
  }
  if (newUrl.startsWith('data:') || newUrl.startsWith('file:')) return;

  try {
    const buffer = await window.api.getCachedBackgroundImage(newUrl);
    if (buffer) {
      const blob = new Blob([buffer]);
      const newBlobUrl = URL.createObjectURL(blob);
      if (cachedBackgroundBlobUrl.value && cachedBackgroundBlobUrl.value.startsWith('blob:')) {
        URL.revokeObjectURL(cachedBackgroundBlobUrl.value);
      }
      cachedBackgroundBlobUrl.value = newBlobUrl;
    } else {
      window.api.cacheBackgroundImage(newUrl);
    }
  } catch (e) {
    console.error("Failed to load cached background:", e);
  }
};

watch(() => {
  if (!CODE.value || !currentConfig.value?.prompts) return null;
  return currentConfig.value.prompts[CODE.value]?.backgroundImage;
}, async (newUrl) => {
  await loadBackground(newUrl);
}, { immediate: false });

const inputLayout = computed(() => currentConfig.value.inputLayout || 'horizontal');
const currentSystemPrompt = ref("");

const normalizeSessionTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getConversationDisplayName = () => {
  const title = defaultConversationName.value || '';
  if (title.trim()) return title.trim();

  const firstUserMsg = chat_show.value.find(msg => msg.role === 'user');
  if (!firstUserMsg) return CODE.value || 'AI';

  const content = firstUserMsg.content;
  if (Array.isArray(content)) {
    const textPart = content.find(part => part.type === 'text' && part.text?.trim());
    if (textPart?.text) return textPart.text.trim().slice(0, 50);
    if (content.some(part => part.type === 'image_url')) return '图片对话';
    if (content.some(part => part.type === 'file' || part.type === 'input_file')) return '文件对话';
  }

  if (typeof content === 'string' && content.trim()) return content.trim().slice(0, 50);
  return CODE.value || 'AI';
};

const getSessionMetadata = () => {
  return {
    title: getConversationDisplayName(),
  };
};


const changeModel_page = ref(false);
const systemPromptDialogVisible = ref(false);
const systemPromptContent = ref('');
const imageViewerVisible = ref(false);
const imageViewerSrcList = ref([]);
const imageViewerInitialIndex = ref(0);
const currentImageViewerIndex = ref(0);

const toolCallControllers = ref(new Map());
let activeAssistantTurnMeta = null;
const tempSessionMcpServerIds = ref([]);

const isAutoApproveTools = ref(true);
const pendingToolApprovals = ref(new Map());

const handleToolApproval = (toolCallId, isApproved) => {
  const resolver = pendingToolApprovals.value.get(toolCallId);
  if (resolver) {
    resolver(isApproved);
    pendingToolApprovals.value.delete(toolCallId);
  }
};

const resolvePendingToolApprovals = (isApproved = false) => {
  pendingToolApprovals.value.forEach((resolve) => {
    try {
      resolve(isApproved);
    } catch {
      // ignore approval resolve race
    }
  });
  pendingToolApprovals.value.clear();
};

const handleToggleAutoApprove = (val) => {
  isAutoApproveTools.value = val;

  if (val) {
    resolvePendingToolApprovals(true);

    chat_show.value.forEach(msg => {
      if (msg.tool_calls) {
        msg.tool_calls.forEach(tc => {
          if (tc.approvalStatus === 'waiting') {
            tc.approvalStatus = 'approved';
          }
        });
      }
    });
  }
};

const isAbortError = (error) => {
  if (!error) return false;
  return error.name === 'AbortError' || String(error?.message || '').includes('aborted');
};

const createAbortError = () => {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
};

const normalizeAssistantMessageContent = (content) => {
  if (Array.isArray(content)) return content.filter(part => part && typeof part === 'object');
  if (typeof content === 'string') {
    return content ? [{ type: 'text', text: content }] : [];
  }
  return [];
};

const appendTerminalNoticeToAssistantContent = (content, terminalNotice) => {
  const normalizedContent = normalizeAssistantMessageContent(content);
  if (!terminalNotice || !terminalNotice.trim()) {
    return normalizedContent;
  }
  const noticeText = terminalNotice.trim();
  if (noticeText && normalizedContent.some(part => part?.type === 'text' && typeof part.text === 'string' && part.text.includes(noticeText))) {
    return normalizedContent;
  }

  if (normalizedContent.length === 0) {
    return [{ type: 'text', text: terminalNotice }];
  }

  const nextContent = normalizedContent.map(part => ({ ...part }));
  const lastTextIndex = nextContent.map(part => part?.type).lastIndexOf('text');
  if (lastTextIndex >= 0) {
    const lastTextPart = nextContent[lastTextIndex];
    lastTextPart.text = `${lastTextPart.text || ''}${terminalNotice}`;
    return nextContent;
  }

  nextContent.push({ type: 'text', text: terminalNotice });
  return nextContent;
};

const ASSISTANT_CANCELLED_NOTICE_MARKDOWN = "\n\n> **请求已取消**";

const getAssistantTerminalNoticeMarkdown = (aborted, errorDisplay) => {
  if (aborted) {
    return ASSISTANT_CANCELLED_NOTICE_MARKDOWN;
  }
  return `\n\n> **错误信息**：${errorDisplay}`;
};

const getCurrentAssistantDisplayName = () => {
  return modelMap.value[model.value] || model.value.split('|')[1] || model.value || '';
};

const findAssistantTurnBubbleIndex = (turnMeta = activeAssistantTurnMeta) => {
  const assistantMessageId = turnMeta?.assistantMessageId;
  if (assistantMessageId !== undefined && assistantMessageId !== null) {
    const index = chat_show.value.findIndex(msg => msg?.role === 'assistant' && msg.id === assistantMessageId);
    if (index !== -1) return index;
  }

  for (let index = chat_show.value.length - 1; index >= 0; index -= 1) {
    const message = chat_show.value[index];
    if (message?.role === 'assistant' && !message.endTime && !message.completedTimestamp) {
      return index;
    }
  }
  return -1;
};

const buildMissingToolAbortMessages = () => {
  let assistantIndex = -1;
  for (let index = history.value.length - 1; index >= 0; index -= 1) {
    const message = history.value[index];
    if (message?.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      assistantIndex = index;
      break;
    }
    if (message?.role !== 'tool') {
      break;
    }
  }

  if (assistantIndex === -1) return [];
  const trailingMessages = history.value.slice(assistantIndex + 1);
  if (trailingMessages.some(message => message?.role !== 'tool')) return [];

  const respondedToolCallIds = new Set(
    trailingMessages
      .filter(message => message?.role === 'tool' && message.tool_call_id)
      .map(message => message.tool_call_id)
  );

  return history.value[assistantIndex].tool_calls
    .filter(toolCall => toolCall?.id && !respondedToolCallIds.has(toolCall.id))
    .map(toolCall => ({
      tool_call_id: toolCall.id,
      role: 'tool',
      name: toolCall.function?.name || toolCall.name || '',
      content: '[System Note]: Tool call was aborted by user.'
    }));
};

const finalizeCancelledAssistantTurn = (turnMeta = activeAssistantTurnMeta) => {
  let assistantBubbleIndex = findAssistantTurnBubbleIndex(turnMeta);
  if (assistantBubbleIndex === -1) {
    chat_show.value.push({
      id: messageIdCounter.value++,
      role: 'assistant',
      content: [],
      reasoning_content: "",
      status: "",
      aiName: getCurrentAssistantDisplayName(),
      voiceName: selectedVoice.value,
      tool_calls: [],
      startTime: Date.now()
    });
    assistantBubbleIndex = chat_show.value.length - 1;
    if (turnMeta) {
      turnMeta.assistantMessageId = chat_show.value[assistantBubbleIndex].id;
    }
  }

  const currentBubble = chat_show.value[assistantBubbleIndex];
  const finalContent = appendTerminalNoticeToAssistantContent(currentBubble.content, ASSISTANT_CANCELLED_NOTICE_MARKDOWN);
  const finalReasoningContent = typeof currentBubble.reasoning_content === 'string'
    ? currentBubble.reasoning_content
    : (currentBubble.reasoning_content ? String(currentBubble.reasoning_content) : '');
  const endTime = Date.now();

  currentBubble.content = finalContent;
  currentBubble.reasoning_content = finalReasoningContent;
  currentBubble.status = 'cancelled';
  currentBubble.endTime = endTime;
  currentBubble.completedTimestamp = new Date().toLocaleString('sv-SE');

  if (turnMeta && !turnMeta.cancellationRecorded) {
    const missingToolMessages = buildMissingToolAbortMessages();
    if (missingToolMessages.length > 0) {
      history.value.push(...missingToolMessages);
    }
    history.value.push({
      role: 'assistant',
      content: finalContent,
      reasoning_content: finalReasoningContent || null
    });
    turnMeta.cancellationRecorded = true;
  }

  return assistantBubbleIndex;
};

// --- Better Work MCP（前端拦截执行：choices 选项卡 / 任务面板） ---
const pendingChoices = ref(new Map());
const taskList = ref([]);
const taskPanelVisible = ref(false);
const pendingAppendBuffer = ref([]);
const BETTERWORK_FRONTEND_TOOLS = new Set(['ask_user_choice', 'task_write', 'task_read']);

const resolvePendingChoices = (payload = null) => {
  pendingChoices.value.forEach((resolve) => {
    try { resolve(payload); } catch { /* ignore choice resolve race */ }
  });
  pendingChoices.value.clear();
};

const handleChoiceSubmit = (toolCallId, payload) => {
  const resolver = pendingChoices.value.get(toolCallId);
  if (resolver) {
    resolver(payload);
    pendingChoices.value.delete(toolCallId);
  }
};

const buildChoiceResultText = (questions, answer) => {
  if (!answer || !Array.isArray(answer.responses)) {
    return 'The user cancelled the selection (the request was interrupted).';
  }
  const lines = answer.responses.map((r, i) => {
    const q = questions[r.questionIndex] || questions[i] || {};
    const qText = q.question || r.question || `Question ${i + 1}`;
    if (r.type === 'discuss') {
      return `Q: ${qText}\nA: The user wants to discuss this question further. Proactively ask clarifying follow-up questions before proceeding.`;
    }
    if (r.type === 'custom') {
      return `Q: ${qText}\nA (user's own input): ${r.customText || ''}`;
    }
    const selected = Array.isArray(r.selected) ? r.selected.join('; ') : '';
    return `Q: ${qText}\nA: ${selected}`;
  });
  return lines.join('\n\n');
};

const normalizeTaskStatus = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'in_progress' || s === 'doing' || s === 'active' || s === 'running') return 'in_progress';
  if (s === 'completed' || s === 'done' || s === 'finished') return 'completed';
  return 'pending';
};

const normalizeTaskList = (tasks) => {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .filter(t => t && typeof t.content === 'string')
    .map((t, i) => ({
      id: i,
      content: t.content,
      status: normalizeTaskStatus(t.status),
      steps: Array.isArray(t.steps)
        ? t.steps
            .filter(s => s && typeof s.content === 'string')
            .map(s => ({ content: s.content, status: normalizeTaskStatus(s.status) }))
        : []
    }));
};

const applyTaskList = (tasks) => {
  taskList.value = normalizeTaskList(tasks);
  if (taskList.value.length > 0) {
    taskPanelVisible.value = true;
  }
};

const serializeTaskListForModel = (tasks) => {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return 'The task list is currently empty.';
  }
  const lines = tasks.map((t, i) => {
    let block = `${i + 1}. [${t.status}] ${t.content}`;
    if (Array.isArray(t.steps) && t.steps.length > 0) {
      block += '\n' + t.steps.map(s => `   - [${s.status}] ${s.content}`).join('\n');
    }
    return block;
  });
  return 'Current task list:\n' + lines.join('\n');
};

const handleBetterWorkTool = async (toolCall, args, uiToolCall) => {
  if (toolCall.function.name === 'ask_user_choice') {
    const questions = Array.isArray(args?.questions) ? args.questions : [];
    if (questions.length === 0) {
      if (uiToolCall) { uiToolCall.approvalStatus = 'finished'; uiToolCall.result = 'No questions were provided.'; }
      return 'No questions were provided.';
    }
    if (uiToolCall) {
      uiToolCall.choiceData = { questions };
      uiToolCall.approvalStatus = 'choosing';
      uiToolCall.result = '等待用户选择...';
    }
    const answer = await new Promise((resolve) => {
      pendingChoices.value.set(toolCall.id, resolve);
    });
    const resultText = buildChoiceResultText(questions, answer);
    if (uiToolCall) {
      uiToolCall.approvalStatus = answer ? 'finished' : 'rejected';
      uiToolCall.result = resultText;
    }
    return resultText;
  }
  if (toolCall.function.name === 'task_write') {
    const tasks = Array.isArray(args?.tasks) ? args.tasks : [];
    applyTaskList(tasks);
    const total = taskList.value.length;
    const done = taskList.value.filter(t => t.status === 'completed').length;
    const ack = `Task list updated: ${total} task(s) total, ${done} completed.`;
    if (uiToolCall) { uiToolCall.approvalStatus = 'finished'; uiToolCall.result = ack; }
    return ack;
  }
  if (toolCall.function.name === 'task_read') {
    const text = serializeTaskListForModel(taskList.value);
    if (uiToolCall) { uiToolCall.approvalStatus = 'finished'; uiToolCall.result = text; }
    return text;
  }
  return '';
};

const isMcpDialogVisible = ref(false);
const sessionMcpServerIds = ref([]);
const openaiFormattedTools = ref([]);
const mcpSearchQuery = ref('');
const isMcpLoading = ref(false);
const mcpFilter = ref('all');
const isRefreshingMcp = ref(false);
const mcpToolCache = ref({});

// Better Work：任务工具是否激活（决定 header 任务按钮是否显示）与任务整体状态（驱动徽章）
const TASK_MCP_TOOL_NAMES = new Set(['task_write', 'task_read']);
const hasTaskMcpTool = computed(() => {
  return openaiFormattedTools.value.some(tool => TASK_MCP_TOOL_NAMES.has(tool?.function?.name));
});
const taskOverallStatus = computed(() => {
  const tasks = taskList.value;
  if (!Array.isArray(tasks) || tasks.length === 0) return '';
  const isActive = (t) => t.status === 'in_progress'
    || (Array.isArray(t.steps) && t.steps.some(s => s.status === 'in_progress'));
  if (tasks.some(isActive)) return 'in_progress';
  if (tasks.every(t => t.status === 'completed')) return 'completed';
  return 'pending';
});
const expandedMcpServers = ref(new Set());

const lastAppliedMcpConfigFingerprint = ref('');

  const stableComparableValue = (value) => {
    if (Array.isArray(value)) return value.map(stableComparableValue);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((acc, key) => {
        if (key === 'clientSecret') {
          acc[key] = value[key] ? '__present__' : '';
          return acc;
        }
        const item = stableComparableValue(value[key]);
        if (item !== undefined) acc[key] = item;
        return acc;
      }, {});
    }
    return value;
  };

const buildComparableMcpServerConfig = (server = {}) => ({
  type: server?.type || '',
  command: server?.command || '',
  args: Array.isArray(server?.args) ? [...server.args] : [],
  baseUrl: server?.baseUrl || '',
  env: server?.env && typeof server.env === 'object'
    ? Object.entries(server.env).sort(([a], [b]) => String(a).localeCompare(String(b)))
    : [],
  headers: server?.headers && typeof server.headers === 'object'
    ? Object.entries(server.headers).sort(([a], [b]) => String(a).localeCompare(String(b)))
    : [],
  auth: stableComparableValue(server?.auth || null),
  isPersistent: Boolean(server?.isPersistent),
  timeoutSeconds: Number(server?.timeoutSeconds) || 120
});

const buildSelectedMcpConfigFingerprint = (serverIds = sessionMcpServerIds.value, mcpServers = currentConfig.value?.mcpServers || {}) => {
  const payload = (Array.isArray(serverIds) ? [...serverIds] : [])
    .filter(id => mcpServers && mcpServers[id])
    .sort()
    .map((id) => ({
      id,
      config: buildComparableMcpServerConfig(mcpServers[id])
    }));

  return JSON.stringify(payload);
};


const toggleMcpServerExpansion = (serverId) => {
  if (expandedMcpServers.value.has(serverId)) {
    expandedMcpServers.value.delete(serverId);
  } else {
    expandedMcpServers.value.add(serverId);
  }
};

const refreshSelectedMcpServers = async () => {
  if (tempSessionMcpServerIds.value.length === 0) {
    showDismissibleMessage.warning('请先勾选需要刷新的 MCP 服务');
    return;
  }
  isRefreshingMcp.value = true;
  let successCount = 0;
  let failCount = 0;

  for (const id of tempSessionMcpServerIds.value) {
    const serverConf = currentConfig.value.mcpServers[id];
    if (!serverConf || serverConf.type === 'builtin') continue;

    const configToTest = {
      id: id,
      type: serverConf.type,
      command: serverConf.command,
      baseUrl: serverConf.baseUrl,
      env: serverConf.env,
      headers: serverConf.headers,
      args: serverConf.args,
      auth: serverConf.auth,
    };

    const res = await window.api.testMcpConnection(configToTest);
    if (res.success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // 刷新完毕后，重新拉取最新的缓存以渲染 UI
  mcpToolCache.value = await window.api.getMcpToolCache() || {};
  isRefreshingMcp.value = false;

  if (failCount === 0 && successCount > 0) {
    showDismissibleMessage.success(`成功刷新 ${successCount} 个服务的工具缓存`);
  } else if (failCount > 0) {
    showDismissibleMessage.warning(`刷新完成: ${successCount} 成功, ${failCount} 失败`);
  } else {
    showDismissibleMessage.info(`选中的皆为内置服务，无需手动刷新`);
  }
};

// 切换具体工具的启用状态
const handleMcpToolStatusChange = async (serverId, toolName, enabled) => {
  if (!mcpToolCache.value[serverId]) return;

  // 更新本地视图状态
  const tools = mcpToolCache.value[serverId];
  const toolIndex = tools.findIndex(t => t.name === toolName);
  if (toolIndex !== -1) {
    tools[toolIndex].enabled = enabled;

    // 深拷贝以去除 Vue 响应式代理，准备保存
    const toolsToSave = JSON.parse(JSON.stringify(tools));
    try {
      // 调用 preload API 保存到数据库
      await window.api.saveMcpToolCache(serverId, toolsToSave);
      // 静默保存成功
    } catch (e) {
      console.error("Failed to save tool status:", e);
      showDismissibleMessage.error("保存工具状态失败");
      // 回滚状态
      tools[toolIndex].enabled = !enabled;
    }
  }
};

const getToolCounts = (serverId) => {
  const tools = mcpToolCache.value[serverId];
  if (!tools || !Array.isArray(tools)) return null;

  const total = tools.length;
  // 默认 enabled 为 undefined 时也视为启用
  const enabled = tools.filter(t => t.enabled !== false).length;

  return { enabled, total };
};

const isMcpActive = computed(() => sessionMcpServerIds.value.length > 0);

const mcpConnectionCount = computed(() => {
  if (!currentConfig.value || !currentConfig.value.mcpServers) return 0;
  const persistentCount = tempSessionMcpServerIds.value.filter(id => {
    const server = currentConfig.value.mcpServers[id];
    return server && server.isPersistent && server.type?.toLowerCase() !== 'builtin';
  }).length;

  // 2. 计算是否占用了共享的临时连接 Worker (排除 builtin)
  const hasOnDemand = tempSessionMcpServerIds.value.some(id => {
    const server = currentConfig.value.mcpServers[id];
    return server && !server.isPersistent && server.type?.toLowerCase() !== 'builtin';
  });
  return persistentCount + (hasOnDemand ? 1 : 0);
});

const availableMcpServers = computed(() => {
  if (!currentConfig.value || !currentConfig.value.mcpServers) return [];
  return Object.entries(currentConfig.value.mcpServers)
    .filter(([, server]) => server.isActive)
    .map(([id, server]) => ({ id, ...server }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

const filteredMcpServers = computed(() => {
  let servers = availableMcpServers.value;
  if (mcpFilter.value === 'selected') {
    servers = servers.filter(server => tempSessionMcpServerIds.value.includes(server.id));
  } else if (mcpFilter.value === 'unselected') {
    servers = servers.filter(server => !tempSessionMcpServerIds.value.includes(server.id));
  }
  if (mcpSearchQuery.value) {
    const query = mcpSearchQuery.value.toLowerCase();
    servers = servers.filter(server =>
      (server.name && server.name.toLowerCase().includes(query)) ||
      (server.description && server.description.toLowerCase().includes(query)) ||
      (server.tags && Array.isArray(server.tags) && server.tags.some(tag => tag.toLowerCase().includes(query))) ||
      // 新增：支持按原始类型(如 'builtin')和显示名称(如 '内置')搜索
      (server.type && server.type.toLowerCase().includes(query)) ||
      (server.type && getDisplayTypeName(server.type).toLowerCase().includes(query))
    );
  }
  return servers;
});

const isSkillDialogVisible = ref(false);
const sessionSkillIds = ref([]);
const tempSessionSkillIds = ref([]); // 弹窗内的临时选择状态
const allSkillsList = ref([]);
const skillSearchQuery = ref('');
const skillFilter = ref('all'); // 新增筛选状态

const filteredSkillsList = computed(() => {
  let list = allSkillsList.value;

  // 1. 状态筛选
  if (skillFilter.value === 'selected') {
    list = list.filter(s => tempSessionSkillIds.value.includes(s.name));
  } else if (skillFilter.value === 'unselected') {
    list = list.filter(s => !tempSessionSkillIds.value.includes(s.name));
  }

  // 2. 搜索筛选
  if (skillSearchQuery.value) {
    const query = skillSearchQuery.value.toLowerCase();
    list = list.filter(s =>
      s.name.toLowerCase().includes(query) ||
      (s.description && s.description.toLowerCase().includes(query))
    );
  }
  return list;
});

const selectAllSkills = () => {
  const visibleNames = filteredSkillsList.value.map(s => s.name);
  const newSet = new Set([...tempSessionSkillIds.value, ...visibleNames]);
  tempSessionSkillIds.value = Array.from(newSet);
};

const clearSkills = () => {
  tempSessionSkillIds.value = [];
};

const toggleSkillDialog = async () => {
  if (!isSkillDialogVisible.value) {
    tempSessionSkillIds.value = [...sessionSkillIds.value];
    skillFilter.value = 'all';
    skillSearchQuery.value = '';

    if (currentConfig.value?.skillPath || (window.api?.getConfig && (await window.api.getConfig())?.config?.skillPath)) {
      // 重新获取 config 以防路径变更
      const cfg = (await window.api.getConfig()).config;
      const path = cfg.skillPath;

      if (path) {
        try {
          const skills = await window.api.listSkills(path);
          // 过滤并排序
          allSkillsList.value = skills.filter(s => !s.disabled).sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) {
          console.error("Fetch skills failed:", e);
          ElMessage.error("刷新技能列表失败");
        }
      }
    }
  }
  isSkillDialogVisible.value = !isSkillDialogVisible.value;
};

const fetchSkillsList = async () => {
  if (currentConfig.value?.skillPath || (window.api?.getConfig && (await window.api.getConfig())?.config?.skillPath)) {
    const path = currentConfig.value?.skillPath || (await window.api.getConfig()).config.skillPath;
    try {
      const skills = await window.api.listSkills(path);
      allSkillsList.value = skills.filter(s => !s.disabled).sort((a, b) => a.name.localeCompare(b.name));

      const validSkillNames = allSkillsList.value.map(s => s.name);

      const validSessionSkills = sessionSkillIds.value.filter(name => validSkillNames.includes(name));
      if (validSessionSkills.length !== sessionSkillIds.value.length) {
        sessionSkillIds.value = validSessionSkills;
      }

      const validTempSkills = tempSessionSkillIds.value.filter(name => validSkillNames.includes(name));
      if (validTempSkills.length !== tempSessionSkillIds.value.length) {
        tempSessionSkillIds.value = validTempSkills;
      }
    } catch (e) {
      console.error("Fetch skills failed:", e);
    }
  }
};

const getActiveBuiltinIds = () => {
  if (!currentConfig.value.mcpServers) return [];
  return Object.entries(currentConfig.value.mcpServers)
    .filter(([, server]) => server.type === 'builtin' && server.isActive !== false)
    .map(([id]) => id);
};

const handleQuickSkillToggle = async (skillName) => {
  const index = sessionSkillIds.value.indexOf(skillName);
  if (index === -1) {
    sessionSkillIds.value.push(skillName);
    // 同步更新 tempSessionSkillIds 防止弹窗状态不同步
    if (!tempSessionSkillIds.value.includes(skillName)) {
      tempSessionSkillIds.value.push(skillName);
    }

    // 检查是否需要自动启用内置 MCP
    {
      const builtinIds = getActiveBuiltinIds();

      let changed = false;
      builtinIds.forEach(id => {
        if (!sessionMcpServerIds.value.includes(id)) {
          sessionMcpServerIds.value.push(id);
          changed = true;
        }
        // 同步 temp 列表
        if (!tempSessionMcpServerIds.value.includes(id)) {
          tempSessionMcpServerIds.value.push(id);
        }
      });

      if (changed) {
        showDismissibleMessage.success(`已启用 Skill "${skillName}" (并自动关联内置 MCP)`);
        await requestApplyMcpTools(false, 'skill-builtin-auto-enable'); // 重新加载 MCP
        return;
      }
    }
    showDismissibleMessage.success(`已启用 Skill "${skillName}"`);
  } else {
    sessionSkillIds.value.splice(index, 1);
    // 同步删除 temp
    const tempIndex = tempSessionSkillIds.value.indexOf(skillName);
    if (tempIndex !== -1) tempSessionSkillIds.value.splice(tempIndex, 1);
    showDismissibleMessage.info(`已禁用 Skill "${skillName}"`);
  }
};

const handleSkillForkToggle = async (skill) => {
  const newForkState = skill.context !== 'fork';
  try {
    const configData = await window.api.getConfig();
    const path = configData.config.skillPath;

    await window.api.toggleSkillForkMode(path, skill.id, newForkState);

    // 更新本地状态
    skill.context = newForkState ? 'fork' : 'normal';
    ElMessage.success(newForkState ? '已开启 Sub-Agent 模式' : '已关闭 Sub-Agent 模式');
  } catch (e) {
    ElMessage.error('模式切换失败: ' + e.message);
  }
};

const toggleSkillSelection = (skillName) => {
  const idx = tempSessionSkillIds.value.indexOf(skillName);
  if (idx === -1) {
    tempSessionSkillIds.value.push(skillName);
  } else {
    tempSessionSkillIds.value.splice(idx, 1);
  }
};

const handleSkillSelectionConfirm = async () => {
  sessionSkillIds.value = [...tempSessionSkillIds.value];
  isSkillDialogVisible.value = false;

  if (sessionSkillIds.value.length > 0) {
    const builtinIds = getActiveBuiltinIds();

    let changed = false;
    builtinIds.forEach(id => {
      if (!sessionMcpServerIds.value.includes(id)) {
        sessionMcpServerIds.value.push(id);
        changed = true;
      }
      if (!tempSessionMcpServerIds.value.includes(id)) {
        tempSessionMcpServerIds.value.push(id);
      }
    });

    if (changed) {
      showDismissibleMessage.success('已自动启用内置 MCP 服务以支持 Skill');
      await requestApplyMcpTools(false, 'skill-builtin-auto-enable');
    }
  }
};

const isViewingLastMessage = computed(() => {
  if (focusedMessageIndex.value === null) return false;
  return focusedMessageIndex.value === chat_show.value.length - 1;
});

const nextButtonTooltip = computed(() => {
  return isViewingLastMessage.value ? '滚动到底部' : '查看下一条消息';
});

// 滚动到底部函数
const scrollToBottom = async (behavior = 'auto') => {
  await nextTick();
  const el = chatContainerRef.value?.$el;
  if (el) {
    // 重新激活粘滞状态
    isSticky.value = true;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: behavior
    });
  }
};

const scrollToTop = () => {
  const el = chatContainerRef.value?.$el;
  if (el) {
    el.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// 强制滚动（点击按钮时）
const forceScrollToBottom = () => {
  isForcingScroll.value = true;
  isSticky.value = true; // 强制激活粘滞
  isAtBottom.value = true;
  showScrollToBottomButton.value = false;
  focusedMessageIndex.value = getLastNavigableMessageIndex();

  // 点击按钮时，为了视觉反馈，可以使用平滑滚动
  scrollToBottom('smooth');
  centerActiveNavNode(focusedMessageIndex.value);

  setTimeout(() => { isForcingScroll.value = false; }, 500);
};

const findFocusedMessageIndex = () => {
  const container = chatContainerRef.value?.$el;
  if (!container) return;
  const scrollTop = container.scrollTop;
  let closestIndex = -1;
  let smallestDistance = Infinity;
  for (let i = chat_show.value.length - 1; i >= 0; i--) {
    const el = getMessageElementByIndex(i);
    if (el) {
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
  else if (isSticky.value || isAtBottom.value) focusedMessageIndex.value = getLastNavigableMessageIndex();
};

const markUserScrollIntent = () => {
  lastUserScrollIntentAt = Date.now();
};


// 滚动监听：仅负责更新 isSticky 状态和 UI 按钮显示
const handleScroll = (event) => {
  if (isForcingScroll.value) return;

  const el = event.target;
  if (!el) return;

  // 计算距离底部的距离
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  const tolerance = 20; // 容差值
  const previousScrollTop = lastKnownChatScrollTop;
  const scrollTopDelta = el.scrollTop - previousScrollTop;
  lastKnownChatScrollTop = el.scrollTop;

  // 核心逻辑：用户只要向上滚动离开底部，就取消粘滞；一旦触底，重新激活粘滞
  const atBottom = distanceToBottom <= tolerance;

  if (atBottom) {
    if (!isSticky.value) isSticky.value = true;
    if (!isAtBottom.value) isAtBottom.value = true;
    showScrollToBottomButton.value = false;
    focusedMessageIndex.value = getLastNavigableMessageIndex();
  } else {
    const hasRecentUserIntent = Date.now() - lastUserScrollIntentAt <= USER_SCROLL_INTENT_MS;
    const isLikelyProgrammaticStickyScroll = isSticky.value
      && !hasRecentUserIntent
      && (Date.now() <= stickyScrollGuardUntil || scrollTopDelta >= -1);

    if (isLikelyProgrammaticStickyScroll) {
      // 流式 Markdown/代码块后续排版会让 scrollHeight 继续增长；不要误判为用户离开底部。
      isAtBottom.value = true;
      showScrollToBottomButton.value = false;
      scheduleStickyScrollFrames();
      return;
    }

    if (isSticky.value) isSticky.value = false; // 用户主动离开了底部
    if (isAtBottom.value) isAtBottom.value = false;
    showScrollToBottomButton.value = true;
    findFocusedMessageIndex();
  }
};

const navigateToPreviousMessage = () => {
  findFocusedMessageIndex();
  const currentIndex = focusedMessageIndex.value;
  if (currentIndex === null) return;
  const element = getMessageElementByIndex(currentIndex);
  const container = chatContainerRef.value?.$el;
  if (!element || !container) return;
  const scrollDifference = container.scrollTop - element.offsetTop;
  if (scrollDifference > 5) {
    scrollChatContainerToMessage(currentIndex);
  } else if (currentIndex > 0) {
    scrollChatContainerToMessage(currentIndex - 1);
  }
};

const navigateToNextMessage = () => {
  findFocusedMessageIndex();
  if (focusedMessageIndex.value !== null && focusedMessageIndex.value < chat_show.value.length - 1) {
    scrollChatContainerToMessage(focusedMessageIndex.value + 1);
  } else {
    forceScrollToBottom();
  }
};

watch(focusedMessageIndex, (value) => {
  if (value === null || value === undefined) return;
  centerActiveNavNode(value);
});
watch(() => chat_show.value.length, () => {
  const hasNavigableMessage = chat_show.value.some(msg => msg?.role !== 'system');
  if (!hasNavigableMessage) {
    focusedMessageIndex.value = null;
    return;
  }
  if (isSticky.value || isAtBottom.value) {
    focusedMessageIndex.value = getLastNavigableMessageIndex();
  }
});

const isCollapsed = (index) => collapsedMessages.value.has(index);

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

const handleMainClick = async (event) => {
  const target = event.target;
  // 1. 处理图片点击
  const img = target.closest('img');
  if (img && img.closest('.markdown-wrapper')) {
    event.preventDefault();
    event.stopPropagation();
    if (img.src) {
      // 收集当前所有渲染成功的图片
      const allImages = Array.from(document.querySelectorAll('.markdown-wrapper img'));
      const validSrcList = allImages.map(imgEl => imgEl.src).filter(Boolean);

      let initialIndex = validSrcList.indexOf(img.src);
      if (initialIndex === -1) {
        initialIndex = 0;
        validSrcList.unshift(img.src);
      }

      imageViewerSrcList.value = validSrcList;
      imageViewerInitialIndex.value = initialIndex;
      currentImageViewerIndex.value = initialIndex;
      imageViewerVisible.value = true;
    }
    return;
  }

  // 2. 处理内联代码块点击
  const codeEl = target.closest('code') || target.closest('.inline-code-tag');

  if (codeEl) {
    const inMarkdown = codeEl.closest('.markdown-wrapper');
    const inPre = codeEl.closest('pre');

    if (inMarkdown && !inPre) {
      event.preventDefault();
      event.stopPropagation();

      const codeContent = (codeEl.textContent || '').trim();

      if (codeContent) {
        try {
          const result = await window.api.handleCodeClick(codeContent);

          if (result === 'opened-url') {
            showDismissibleMessage.success('已在浏览器中打开链接');
          } else if (result === 'opened-path') {
            showDismissibleMessage.success('已在系统中打开文件/目录');
          } else { // 'copied'
            showDismissibleMessage.success('内容已复制到剪贴板');
          }
        } catch (error) {
          console.error('[Click Error]', error);
          showDismissibleMessage.error('操作失败: ' + error.message);
        }
      }
    }
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
const handleOpenModelDialog = async () => {
  try {
    const result = await window.api.getConfig();
    if (result && result.config) {
      currentConfig.value.providers = result.config.providers;
      currentConfig.value.providerOrder = result.config.providerOrder;

      updateModelListAndMap(currentConfig.value);

      if (currentProviderID.value && currentConfig.value.providers[currentProviderID.value]) {
        const activeProvider = currentConfig.value.providers[currentProviderID.value];
        base_url.value = activeProvider.url;
        api_key.value = activeProvider.api_key;
      }
    }
  } catch (e) {
    console.warn("自动刷新模型列表失败，将使用缓存数据", e);
  }
  changeModel_page.value = true;
};
const handleChangeModel = (chosenModel) => {
  model.value = chosenModel;
  currentProviderID.value = chosenModel.split("|")[0];
  const provider = currentConfig.value.providers[currentProviderID.value];
  base_url.value = provider.url;
  api_key.value = provider.api_key;
  chatInputRef.value?.focus({ cursor: 'end' });
};
const handleTogglePin = () => {
  autoCloseOnBlur.value = !autoCloseOnBlur.value;
  syncAutoCloseOnBlurListener();
};
const handleToggleAlwaysOnTop = () => {
  window.api.toggleAlwaysOnTop();
};
const withTemporaryAutoScroll = (chatContainer, updater) => {
  if (!chatContainer) return;
  const previousBehavior = chatContainer.style.scrollBehavior;
  chatContainer.style.scrollBehavior = 'auto';
  updater();
  chatContainer.style.scrollBehavior = previousBehavior || 'smooth';
};

const markStickyProgrammaticScroll = () => {
  stickyScrollGuardUntil = Date.now() + STICKY_SCROLL_GUARD_MS;
};

const clearStickyScrollFrames = () => {
  stickyScrollRafIds.forEach((id) => cancelAnimationFrame(id));
  stickyScrollRafIds = [];
};

const scrollToBottomImmediately = () => {
  const chatContainer = chatContainerRef.value?.$el;
  if (!chatContainer) return;
  markStickyProgrammaticScroll();
  withTemporaryAutoScroll(chatContainer, () => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
    lastKnownChatScrollTop = chatContainer.scrollTop;
  });
  isAtBottom.value = true;
  showScrollToBottomButton.value = false;
};

const scheduleStickyScrollFrames = () => {
  if (!isSticky.value) return;
  clearStickyScrollFrames();
  scrollToBottomImmediately();

  const firstFrameId = requestAnimationFrame(() => {
    stickyScrollRafIds = stickyScrollRafIds.filter((id) => id !== firstFrameId);
    if (!isSticky.value) return;
    scrollToBottomImmediately();

    const secondFrameId = requestAnimationFrame(() => {
      stickyScrollRafIds = stickyScrollRafIds.filter((id) => id !== secondFrameId);
      if (isSticky.value) scrollToBottomImmediately();
    });
    stickyScrollRafIds.push(secondFrameId);
  });
  stickyScrollRafIds.push(firstFrameId);
};

const scrollChatContainerToMessage = (index, behavior = 'smooth') => {
  const chatContainer = chatContainerRef.value?.$el;
  const targetElement = getMessageElementByIndex(index);
  if (!chatContainer || !targetElement) return false;

  isSticky.value = false;
  isAtBottom.value = false;
  showScrollToBottomButton.value = true;

  chatContainer.scrollTo({
    top: Math.max(0, targetElement.offsetTop),
    behavior
  });
  focusedMessageIndex.value = index;
  centerActiveNavNode(index);
  return true;
};

const keepMessageAnchor = async (messageElement, updater, fallbackToBottom = false) => {
  const chatContainer = chatContainerRef.value?.$el;
  if (!chatContainer || !messageElement) {
    await updater();
    return;
  }

  if (fallbackToBottom && isSticky.value) {
    await updater();
    await nextTick();
    scheduleStickyScrollFrames();
    return;
  }

  const originalScrollTop = chatContainer.scrollTop;
  const originalElementTop = messageElement.offsetTop;
  const originalVisualPosition = originalElementTop - originalScrollTop;

  await updater();
  await nextTick();

  const newElementTop = messageElement.offsetTop;
  withTemporaryAutoScroll(chatContainer, () => {
    chatContainer.scrollTop = newElementTop - originalVisualPosition;
    lastKnownChatScrollTop = chatContainer.scrollTop;
  });
};

const ensureStickyResizeObserver = () => {
  if (chatObserver || typeof ResizeObserver === 'undefined') return chatObserver;
  chatObserver = new ResizeObserver(() => {
    if (!isSticky.value) return;
    if (Date.now() - lastUserScrollIntentAt <= USER_SCROLL_INTENT_MS) return;
    scheduleStickyScrollFrames();
  });
  return chatObserver;
};

const updateStickyResizeObserver = async () => {
  await nextTick();
  const observer = ensureStickyResizeObserver();
  if (!observer) return;

  const chatContainer = chatContainerRef.value?.$el || null;
  const lastMessageElement = getLastMessageElement();

  if (stickyObservedContainer !== chatContainer) {
    if (stickyObservedContainer) observer.unobserve(stickyObservedContainer);
    stickyObservedContainer = chatContainer;
    if (stickyObservedContainer) observer.observe(stickyObservedContainer);
  }

  if (stickyObservedMessage !== lastMessageElement) {
    if (stickyObservedMessage) observer.unobserve(stickyObservedMessage);
    stickyObservedMessage = lastMessageElement;
    if (stickyObservedMessage) observer.observe(stickyObservedMessage);
  }
};

const cleanupStickyResizeObserver = () => {
  clearStickyScrollFrames();
  if (chatObserver) {
    chatObserver.disconnect();
    chatObserver = null;
  }
  stickyObservedContainer = null;
  stickyObservedMessage = null;
};

const syncStickyScrollAfterRender = () => {
  if (!isSticky.value) return;
  nextTick(() => {
    updateStickyResizeObserver();
    scheduleStickyScrollFrames();
  });
};


const handleSaveSession = () => handleSaveAction();
const handleDeleteMessage = (index) => deleteMessage(index);
const handleCopyText = (content, index) => copyText(content, index);
const handleReAsk = () => reaskAI();
const handleShowSystemPrompt = () => {
  systemPromptContent.value = currentSystemPrompt.value;
  systemPromptDialogVisible.value = true;
};
const handleToggleCollapse = async (index, event) => {
  const messageElement = event.currentTarget?.closest('.chat-message');
  if (!messageElement) return;

  const isExpanding = isCollapsed(index);
  await keepMessageAnchor(messageElement, async () => {
    if (isExpanding) {
      collapsedMessages.value.delete(index);
    } else {
      collapsedMessages.value.add(index);
    }
  }, index === chat_show.value.length - 1);
};
const onAvatarClick = async (role, event) => {
  const messageElement = event.currentTarget.closest('.chat-message');
  if (!messageElement) return;

  const roleMessageIndices = chat_show.value.map((msg, index) => (msg.role === role ? index : -1)).filter(index => index !== -1);
  if (roleMessageIndices.length === 0) return;

  const anyExpanded = roleMessageIndices.some(index => !collapsedMessages.value.has(index));
  await keepMessageAnchor(messageElement, async () => {
    if (anyExpanded) roleMessageIndices.forEach(index => collapsedMessages.value.add(index));
    else roleMessageIndices.forEach(index => collapsedMessages.value.delete(index));
  }, roleMessageIndices.includes(chat_show.value.length - 1));
};

const handleSubmit = () => {
  // 生成中（或正在准备发送）时，把消息暂存进缓冲区，本轮结束后自动发送
  if (loading.value || isPreparingSend.value) {
    enqueueInputToBuffer();
    return;
  }
  askAI(false);
};
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


const getChatInputTextarea = () => chatInputRef.value?.senderRef?.$refs.textarea || null;

const isVisibleElement = (element) => {
  if (!(element instanceof Element)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
};

const hasVisibleElement = (selector) => Array.from(document.querySelectorAll(selector)).some(isVisibleElement);

const isEditableElement = (element) => {
  if (!(element instanceof HTMLElement)) return false;
  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || element.isContentEditable;
};

const isInteractiveElement = (element) => {
  if (!(element instanceof HTMLElement)) return false;
  return Boolean(element.closest('button, [role="button"], a[href], select, .el-button, .el-select, .el-checkbox, .el-switch'));
};

const isChatInputInternalElement = (element) => {
  if (!(element instanceof Element)) return false;
  return Boolean(element.closest('.input-footer, .chat-input-area-vertical'));
};

const hasOpenChatInputSelector = () => hasVisibleElement('.mcp-quick-select, .option-selector-row');

const hasBlockingOverlay = () => {
  if (
    systemPromptDialogVisible.value ||
    changeModel_page.value ||
    isMcpDialogVisible.value ||
    isSkillDialogVisible.value ||
    imageViewerVisible.value
  ) {
    return true;
  }

  return hasVisibleElement('.el-message-box, .el-overlay-message-box, .el-dialog__wrapper, .el-overlay-dialog, .el-image-viewer__wrapper');
};

const shouldAutoFocusChatInput = () => {
  const textarea = getChatInputTextarea();
  if (!textarea) return false;
  const activeElement = document.activeElement;

  if (!activeElement || activeElement === document.body || activeElement === document.documentElement) {
    return !hasBlockingOverlay() && !hasOpenChatInputSelector();
  }

  if (activeElement === textarea) return true;

  if (hasBlockingOverlay() || hasOpenChatInputSelector()) return false;

  if (hasVisibleElement('.editing-wrapper, .text-search-container, .tool-choice-wrapper, .tool-approval-actions')) {
    return false;
  }

  if (activeElement.closest?.('.editing-wrapper, .text-search-container, .tool-choice-wrapper, .tool-approval-actions')) {
    return false;
  }

  if (isEditableElement(activeElement)) return false;

  if (isInteractiveElement(activeElement) && !isChatInputInternalElement(activeElement)) {
    return false;
  }

  return true;
};

const focusChatInputIfSafe = (options = { cursor: 'end' }) => {
  if (!shouldAutoFocusChatInput()) return false;
  chatInputRef.value?.focus(options);
  return true;
};

const handleWindowFocus = () => {
  if (isFilePickerOpen.value) {
    isFilePickerOpen.value = false;
  }
  setTimeout(() => {
    if (lastSelectionStart.value !== null && lastSelectionEnd.value !== null) {
      focusChatInputIfSafe({ position: { start: lastSelectionStart.value, end: lastSelectionEnd.value } });
    } else {
      focusChatInputIfSafe({ cursor: 'end' });
    }
  }, 50);
};

const handleCopyImageFromViewer = (url) => {
  if (!url) return;
  (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`网络错误: ${response.statusText}`);
      const blob = await response.blob();

      try {
        if (['image/png', 'image/jpeg'].includes(blob.type)) {
          const item = new ClipboardItem({ [blob.type]: blob });
          await navigator.clipboard.write([item]);
          showDismissibleMessage.success('图片已复制到剪贴板 (WebAPI)');
          return;
        }
      } catch (webErr) {
        console.warn('Web Clipboard API 写入失败，尝试回退方案:', webErr);
      }

      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      await window.api.copyImage(base64Data);
      showDismissibleMessage.success('图片已复制到剪贴板');

    } catch (error) {
      console.error('复制图片失败:', error);
      showDismissibleMessage.error(`复制失败: ${error.message}`);
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

  let history_idx = -1;
  let show_counter = -1;
  for (let i = 0; i < history.value.length; i++) {
    if (history.value[i].role !== 'tool') {
      show_counter++;
    }
    if (show_counter === index) {
      history_idx = i;
      break;
    }
  }

  const updateContent = (message) => {
    if (!message) return;
    if (typeof message.content === 'string' || message.content === null) {
      message.content = newContent;
    } else if (Array.isArray(message.content)) {
      const textPart = message.content.find(p => p.type === 'text' && !(p.text && p.text.toLowerCase().startsWith('file name:')));
      if (textPart) {
        textPart.text = newContent;
      } else {
        message.content.push({ type: 'text', text: newContent });
      }
    }
  };

  if (chat_show.value[index]) {
    updateContent(chat_show.value[index]);
  }

  if (history_idx !== -1 && history.value[history_idx]) {
    updateContent(history.value[history_idx]);
  } else {
    console.error("错误：无法将 chat_show 索引映射到 history 索引。下次API请求可能会使用旧数据。");
  }
};

const handleEditStart = async (index) => {
  const scrollContainer = chatContainerRef.value?.$el;
  const childComponent = getMessageComponentByIndex(index);
  const element = getMessageElementByIndex(index);

  if (!scrollContainer || !element || !childComponent) return;

  childComponent.switchToEditMode();

  await nextTick();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    });
  });
};

const handleEditEnd = async ({ id, action, content }) => {
  if (action !== 'save') return;

  const currentIndex = chat_show.value.findIndex(m => m.id === id);

  if (currentIndex === -1) return;

  handleEditMessage(currentIndex, content);
  showDismissibleMessage.success('消息已更新');

  if (currentIndex === chat_show.value.length - 1 && chat_show.value[currentIndex].role === 'user') {
    await nextTick();
    await reaskAI();
  }
};

const handleSystemPromptKeydown = (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    saveSystemPrompt();
  }
};

const saveSystemPrompt = async () => {
  const newPromptContent = systemPromptContent.value;
  currentSystemPrompt.value = newPromptContent;

  const systemMessageIndex = history.value.findIndex(m => m.role === 'system');
  if (systemMessageIndex !== -1) {
    history.value[systemMessageIndex].content = newPromptContent;
    if (chat_show.value[systemMessageIndex]) {
      chat_show.value[systemMessageIndex].content = newPromptContent;
    }
  } else {
    const newMsg = { role: "system", content: newPromptContent };
    history.value.unshift(newMsg);
    chat_show.value.unshift({ ...newMsg, id: messageIdCounter.value++ });
  }

  try {
    const promptExists = !!currentConfig.value.prompts[CODE.value];
    if (promptExists) {
      await window.api.saveSetting(`prompts.${CODE.value}.prompt`, newPromptContent);
      currentConfig.value.prompts[CODE.value].prompt = newPromptContent;
      showDismissibleMessage.success('快捷助手提示词已更新');
    } else {
      const latestConfigData = await window.api.getConfig();
      const baseConfig = sourcePromptConfig.value || defaultConfig.config.prompts.AI;
      const newPrompt = {
        ...baseConfig,
        icon: AIAvart.value,
        prompt: newPromptContent,
        enable: true,
        model: model.value || baseConfig.model,
        enable: true,
        stream: true,
        isTemperature: false,
        temperature: 0.7,
        ifTextNecessary: false,
        isDirectSend_file: true,
        isDirectSend_normal: true,
        isDirectSend_image: true,
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
      sourcePromptConfig.value = newPrompt;
      showDismissibleMessage.success(`已为您创建并保存新的快捷助手: "${CODE.value}"`);
    }
  } catch (error) {
    console.error("保存系统提示词失败:", error);
    showDismissibleMessage.error(`保存失败: ${error.message}`);
  }

  systemPromptDialogVisible.value = false;
};

const handleAutoCloseOnBlur = () => closePage(false);
const syncAutoCloseOnBlurListener = () => {
  window.removeEventListener('blur', handleAutoCloseOnBlur);
  if (autoCloseOnBlur.value && !loading.value) {
    window.addEventListener('blur', handleAutoCloseOnBlur);
  }
};

const closePage = async (force_save = false) => {
  const shouldForceSave = force_save === true;

  // 1. 如果是为了打开文件选择器而失去焦点，拦截关闭
  if (isFilePickerOpen.value) return;

  // 条件：配置了本地存储路径 且 当前对话已有名称
  if (currentConfig.value?.webdav?.localChatPath && (defaultConversationName.value || shouldForceSave)) {
    try {
      await executeAutoSaveRequest({ reason: 'window-close', force: shouldForceSave });
    } catch (e) {
      console.error("关闭时自动保存失败:", e);
    }
  }

  // 3. 关闭窗口
  window.api.windowControl('close-window');
};

const handlePickFileStart = () => {
  isFilePickerOpen.value = true;
};

watch(zoomLevel, (newZoom) => {
  if (window.api && typeof window.api.setZoomFactor === 'function') window.api.setZoomFactor(newZoom);
});
watch(chat_show, async () => {
  await addCopyButtonsToCodeBlocks();
  await updateStickyResizeObserver();
}, { deep: true, flush: 'post' });
watch(() => currentConfig.value?.isDarkMode, (isDark) => {
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  if (textSearchInstance) {
    textSearchInstance.setTheme(isDark ? 'dark' : 'light');
  }
}, { immediate: true });

onMounted(async () => {
  if (isInit.value) return;
  isInit.value = true;

  await updateStickyResizeObserver();

  if (window.api && window.api.onAlwaysOnTopChanged) {
    window.api.onAlwaysOnTopChanged((newState) => {
      isAlwaysOnTop.value = newState;
    });
  }

  textSearchInstance = new TextSearchUI({
    scope: '.chat-main',
    theme: currentConfig.value?.isDarkMode ? 'dark' : 'light'
  });

  // 暴露给后台MCP调用的 Agent API

  window.__AGENT_API__ = {
    isBusy: () => loading.value,

    getChatLength: () => chat_show.value.length,

    getOutline: () => {
      const isBusy = loading.value;
      const statusLine = isBusy ? "Current State: [Busy: Thinking or Generating...]" : "Current State: [Idle: Ready]";

      const outlineStr = chat_show.value.map((msg, idx) => {
        if (msg.role === 'system') return null;
        let type = msg.role === 'user' ? 'User' : (msg.role === 'assistant' ? 'AI' : 'Tool');
        let prev = '';

        if (msg.role === 'user' || msg.role === 'assistant') {
          // 提取文本内容
          let textContent = '';
          if (typeof msg.content === 'string') {
            textContent = msg.content;
          } else if (Array.isArray(msg.content)) {
            const txt = msg.content.find(p => p.type === 'text');
            if (txt && txt.text) textContent = txt.text;
          }

          // 优先级 1: 显示文本内容
          if (textContent && textContent.trim()) {
            prev = textContent.trim().substring(0, 40).replace(/\n/g, ' ');
          }
          // 优先级 2: 文本为空，但有工具调用
          else if (msg.tool_calls && msg.tool_calls.length > 0) {
            const tools = msg.tool_calls.map(t => t.name).join(', ');
            prev = `[Calling Tool: ${tools}]`;
          }
          // 优先级 3: 有附件(图片/文件)
          else if (Array.isArray(msg.content) && msg.content.length > 0) {
            prev = '[Media/Files Attached]';
          }
          // 优先级 4: 真正的空消息或正在生成
          else {
            if (msg.role === 'assistant') {
              // 结合全局 loading 状态判断是否正在生成
              if (isBusy && idx === chat_show.value.length - 1) {
                if (msg.status === 'thinking') prev = '[Thinking...]';
                else prev = '[Generating...]';
              } else {
                prev = '[Empty Response]';
              }
            } else {
              prev = '[Empty Message]';
            }
          }
        }
        return `[Index ${idx}] ${type}: ${prev}...`;
      }).filter(Boolean).join('\n');

      return `${statusLine}\n\nMessages Outline:\n${outlineStr}`;
    },

    getMessage: (index) => {
      let actualIndex = parseInt(index);
      if (isNaN(actualIndex)) return "Error: Invalid index format.";

      // 转换负数索引
      if (actualIndex < 0) {
        actualIndex = chat_show.value.length + actualIndex;
      }

      const msg = chat_show.value[actualIndex];
      if (!msg) return `Error: Message index ${index} out of bounds (Total: ${chat_show.value.length - 1}).`;

      let headerInfo = `[Message Info] Index: ${actualIndex} (Requested: ${index})/Total ${chat_show.value.length} messages | Role: ${msg.role}\n`;

      // 如果还在生成中，追加提示
      if (actualIndex === chat_show.value.length - 1 && loading.value) {
        headerInfo += "[SYSTEM NOTICE]: This message is currently being generated. Content may be incomplete.\n";
      }

      if (msg.role === 'system') {
        return `${headerInfo}\n[System Prompt]:\n${msg.content}`;
      }

      let contentStr = "";
      if (msg.role === 'user' || msg.role === 'assistant') {
        if (Array.isArray(msg.content)) {
          contentStr = msg.content.map(p => {
            if (p.type === 'text') return p.text;
            if (p.type === 'image_url') return '[Image attachment]';
            if (p.type === 'file' || p.type === 'input_file') return `[File attachment: ${p.filename || p.name}]`;
            return '';
          }).join('\n');
        } else {
          contentStr = msg.content || "";
        }

        if (msg.role === 'assistant') {
          let extraInfo = "";
          if (msg.status === 'thinking') extraInfo += "(State: Thinking...)\n";

          if (msg.tool_calls && msg.tool_calls.length > 0) {
            extraInfo += `\n[Tools Execution History]:\n`;
            msg.tool_calls.forEach(tc => {
              extraInfo += `> Tool: ${tc.name}\n  Args: ${tc.args}\n  Status: ${tc.approvalStatus}\n`;
              const toolResultMsg = history.value.find(m => m.role === 'tool' && m.tool_call_id === tc.id);
              if (toolResultMsg) {
                let resultPreview = toolResultMsg.content;
                if (typeof resultPreview !== 'string') {
                  try { resultPreview = JSON.stringify(resultPreview, null, 2); } catch (e) { }
                }
                extraInfo += `  < Result: ${resultPreview}\n`;
              } else {
                extraInfo += `  < Result: (Pending or not in history)\n`;
              }
              extraInfo += `\n`;
            });
            contentStr = extraInfo + `[Final Response Text]:\n${contentStr}`;
          }
        }
        return headerInfo + contentStr;
      } else if (msg.role === 'tool') {
        return `${headerInfo}\n[Tool Output]:\n${msg.content}`;
      }
      return "Unknown message format.";
    },
    sendMessage: async (text, filePaths) => {
      if (loading.value) {
        return Promise.reject("Error: This agent is currently busy generating a response. Please wait until it becomes Idle.");
      }
      if (text) prompt.value = text;

      let fileMsg = "";
      if (filePaths && Array.isArray(filePaths) && filePaths.length > 0) {
        let success = 0;
        for (const p of filePaths) {
          try { await processFilePath(p); success++; } catch (e) { }
        }
        await nextTick();
        fileMsg = ` (${success} files attached)`;
      }

      askAI(false).catch(err => console.error("Background generation error:", err));
      return `Message sent successfully${fileMsg}. Agent is now generating response...`;
    },
    closeWindow: async () => {
      await closePage(true);
      return "Window closing initiated.";
    }
  };

  window.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('blur', handleWindowBlur);

  const initializeWindow = async (data = null) => {
    try {
      const configData = await window.api.getConfig();
      currentConfig.value = configData.config;

      if (data?.tempPromptConfig && data?.code) {
        if (!currentConfig.value.prompts) currentConfig.value.prompts = {};
        currentConfig.value.prompts[data.code] = data.tempPromptConfig;
      }
    } catch (err) {
      currentConfig.value = defaultConfig.config;
      showDismissibleMessage.error('加载用户配置失败，使用默认配置。');
    }

    try {
      const userInfo = await window.api.getUser();
      UserAvart.value = userInfo.avatar;
    } catch (err) {
      UserAvart.value = "user.png";
    }

    if (data?.os) {
      currentOS.value = data.os;
    }

    updateModelListAndMap(currentConfig.value);

    const code = data?.code || "AI";
    const currentPromptConfig = currentConfig.value.prompts[code] || defaultConfig.config.prompts.AI;
    if (currentPromptConfig.backgroundImage) {
      loadBackground(currentPromptConfig.backgroundImage);
    }
    isAlwaysOnTop.value = data?.isAlwaysOnTop ?? currentPromptConfig.isAlwaysOnTop ?? true;
    zoomLevel.value = resolveWindowZoomLevel(currentPromptConfig.zoom, currentConfig.value.zoom, 1);
    if (window.api && typeof window.api.setZoomFactor === 'function') {
      window.api.setZoomFactor(zoomLevel.value);
    }
    if (currentConfig.value.isDarkMode) {
      document.documentElement.classList.add('dark');
    }

    CODE.value = code;
    document.title = code;
    sourcePromptConfig.value = currentPromptConfig;

    if (currentPromptConfig.icon) {
      AIAvart.value = currentPromptConfig.icon;
      favicon.value = currentPromptConfig.icon;
    } else {
      AIAvart.value = "ai.svg";
      favicon.value = "favicon.png";
    }

    autoCloseOnBlur.value = currentPromptConfig.autoCloseOnBlur ?? false;
    if (data?.type === "task" || data?.type === "summon") {
      autoCloseOnBlur.value = false;
    }
    tempReasoningEffort.value = currentPromptConfig.reasoning_effort || 'default';
    model.value = currentPromptConfig.model || modelList.value[0]?.value || '';
    selectedVoice.value = currentPromptConfig.voice || null;

    if (model.value) {
      currentProviderID.value = model.value.split("|")[0];
      base_url.value = currentConfig.value.providers[currentProviderID.value]?.url;
      api_key.value = currentConfig.value.providers[currentProviderID.value]?.api_key;
    }

    if (currentPromptConfig.prompt) {
      currentSystemPrompt.value = currentPromptConfig.prompt;
      history.value = [{ role: "system", content: currentPromptConfig.prompt }];
      chat_show.value = [{
        role: "system",
        content: currentPromptConfig.prompt,
        id: messageIdCounter.value++
      }];
    } else {
      currentSystemPrompt.value = "";
      history.value = [];
      chat_show.value = [];
    }

    if (currentPromptConfig.defaultSkills && Array.isArray(currentPromptConfig.defaultSkills)) {
      sessionSkillIds.value = [...currentPromptConfig.defaultSkills];
      tempSessionSkillIds.value = [...currentPromptConfig.defaultSkills];
    } else {
      sessionSkillIds.value = [];
      tempSessionSkillIds.value = [];
    }

    let shouldDirectSend = false;
    let isFileDirectSend = false;
    let isSessionRestored = false;

    if (data) {
      basic_msg.value = { code: data.code, type: data.type, payload: data.payload };
      if (data.filename) defaultConversationName.value = data.filename.replace(/\.json$/i, '');
      if (data.type === "task") {
        currentTaskConfig.value = data.taskConfig;

        // 覆盖 MCP 与 Skill 配置
        if (data.taskConfig.extraMcp) {
          sessionMcpServerIds.value = [...data.taskConfig.extraMcp];
          tempSessionMcpServerIds.value = [...data.taskConfig.extraMcp];
        }
        if (data.taskConfig.extraSkills) {
          sessionSkillIds.value = [...data.taskConfig.extraSkills];
          tempSessionSkillIds.value = [...data.taskConfig.extraSkills];
        }

        // 将任务内容直接作为用户的输入，压入历史记录，而不是放到输入框
        const system_time = new Date().toLocaleString('sv-SE');
        const pre_prompt = `## Scheduled Task\n\n**system_time**:${system_time}\n\n`;
        const suffix_prompt = "\n\nScheduled task triggered! This is a task that you need to execute autonomously without human intervention. Please execute immediately and provide correct feedback.";
        history.value.push({ role: "user", content: pre_prompt + data.payload + suffix_prompt });
        chat_show.value.push({
          id: messageIdCounter.value++,
          role: "user",
          content: [{ type: "text", text: pre_prompt + data.payload + suffix_prompt }],
          timestamp: new Date().toLocaleString('sv-SE')
        });

        // 标记需要直接发送
        shouldDirectSend = true;
      } if (data.type === "summon") {
        shouldDirectSend = true;
        isFileDirectSend = true;
        if (data.summonData) {
          const { text, file_paths, enable_tools } = data.summonData;
          if (text) prompt.value = text;
          if (file_paths && Array.isArray(file_paths) && file_paths.length > 0) {
            for (const p of file_paths) await processFilePath(p);
          }
          if (enable_tools) {
            const builtinIds = getActiveBuiltinIds();
            builtinIds.forEach(id => {
              if (!sessionMcpServerIds.value.includes(id)) {
                sessionMcpServerIds.value.push(id);
              }
              if (!tempSessionMcpServerIds.value.includes(id)) {
                tempSessionMcpServerIds.value.push(id);
              }
            });
          }
        }
      }
      if (data.type === "over" && data.payload) {
        let sessionLoaded = false;
        try {
          let old_session = JSON.parse(data.payload);
          if (old_session && old_session.anywhere_history === true) {
            sessionLoaded = true;
            isSessionRestored = true; // 标记会话已恢复
            await loadSession(old_session);
            autoCloseOnBlur.value = false;
          }
        } catch (error) { }
        if (!sessionLoaded) {
          if (CODE.value.trim().toLowerCase().includes(data.payload.trim().toLowerCase())) { /* do nothing */ }
          else {
            if (currentPromptConfig.isDirectSend_normal) {
              history.value.push({ role: "user", content: data.payload });
              chat_show.value.push({ id: messageIdCounter.value++, role: "user", content: [{ type: "text", text: data.payload }] });
              shouldDirectSend = true;
            } else { prompt.value = data.payload; }
          }
        }
      } else if (data.type === "img" && data.payload) {
        if (currentPromptConfig.isDirectSend_image ?? true) {
          history.value.push({ role: "user", content: [{ type: "image_url", image_url: { url: String(data.payload) } }] });
          chat_show.value.push({ id: messageIdCounter.value++, role: "user", content: [{ type: "image_url", image_url: { url: String(data.payload) } }] });
          shouldDirectSend = true;
        } else {
          fileList.value.push({ uid: 1, name: "截图.png", size: 0, type: "image/png", url: String(data.payload) });
        }
      } else if (data.type === "files" && data.payload) {
        try {
          let sessionLoaded = false;
          if (data.payload.length === 1 && data.payload[0].path.toLowerCase().endsWith('.json')) {
            const fileObject = await window.api.handleFilePath(data.payload[0].path);
            if (fileObject) {
              sessionLoaded = await checkAndLoadSessionFromFile(fileObject);
              if (sessionLoaded) isSessionRestored = true; // 标记会话已恢复
            }
          }
          if (!sessionLoaded) {
            const fileProcessingPromises = data.payload.map((fileInfo) => processFilePath(fileInfo.path));
            await Promise.all(fileProcessingPromises);
            if (currentPromptConfig.isDirectSend_file) {
              shouldDirectSend = true;
              isFileDirectSend = true;
            }
          }
        } catch (error) { console.error("Error during initial file processing:", error); showDismissibleMessage.error("文件处理失败: " + error.message); }
      }
    }
    syncAutoCloseOnBlurListener();

    if (!isSessionRestored) {
      const defaultMcpServers = currentPromptConfig.defaultMcpServers || [];

      let mcpServersToLoad = [...new Set([...defaultMcpServers, ...sessionMcpServerIds.value])];

      if (sessionSkillIds.value.length > 0) {
        const builtinIds = getActiveBuiltinIds();
        mcpServersToLoad = [...new Set([...mcpServersToLoad, ...builtinIds])];
      }

      if (mcpServersToLoad.length > 0) {
        const validIds = mcpServersToLoad.filter(id =>
          currentConfig.value.mcpServers && currentConfig.value.mcpServers[id]
        );

        if (validIds.length > 0) {
          sessionMcpServerIds.value = [...validIds];
          tempSessionMcpServerIds.value = [...validIds];
          await requestApplyMcpTools(false, 'skill-builtin-auto-enable');
        }
      }
    }

    await fetchSkillsList();

    if (shouldDirectSend) {
      if (isAtBottom.value) scrollToBottom();
      if (isFileDirectSend) await askAI(false);
      else await askAI(true);
    }

    await addCopyButtonsToCodeBlocks();
    setTimeout(() => {
      chatInputRef.value?.focus({ cursor: 'end' });
    }, 100);
  };

  if (window.preload && typeof window.preload.receiveMsg === 'function') {
    window.preload.receiveMsg(async (data) => {
      await initializeWindow(data);
    });
  } else {
    const data = {
      os: "win",
      code: "Moss",
      config: await window.api.getConfig().config,
    };
    await initializeWindow(data);
  }

  // 监听来自 uTools 的"追问"内容追加事件
  if (window.preload && typeof window.preload.onAppendMessage === 'function') {
    window.preload.onAppendMessage(async (data) => {
      // 1. 如果 AI 正在生成，立刻中断当前生成
      if (loading.value) {
        cancelAskAI();
        showDismissibleMessage.info('已中断当前生成，开始处理追问');
        // 等待状态清理和 DOM 更新
        await new Promise(r => setTimeout(r, 100));
      }

      let isFileDirectSend = false;
      const nowTime = new Date().toLocaleString('sv-SE');

      // 2. 将收到的数据直接压入聊天历史或文件列表
      if (data.type === "over" && data.payload) {
        history.value.push({ role: "user", content: data.payload });
        chat_show.value.push({ id: messageIdCounter.value++, role: "user", content: [{ type: "text", text: data.payload }], timestamp: nowTime });
      } else if (data.type === "img" && data.payload) {
        history.value.push({ role: "user", content: [{ type: "image_url", image_url: { url: String(data.payload) } }] });
        chat_show.value.push({ id: messageIdCounter.value++, role: "user", content: [{ type: "image_url", image_url: { url: String(data.payload) } }], timestamp: nowTime });
      } else if (data.type === "files" && data.payload) {
        try {
          const fileProcessingPromises = data.payload.map((fileInfo) => processFilePath(fileInfo.path));
          await Promise.all(fileProcessingPromises);
          isFileDirectSend = true;
        } catch (error) {
          console.error(error);
          showDismissibleMessage.error("处理文件失败: " + error.message);
          return; // 处理失败则终止发送
        }
      }

      // 3. 强制触发自动发送
      scrollToBottom();
      if (isFileDirectSend) {
        // 如果是文件，askAI(false) 会自动收集刚才压入 fileList.value 的文件并发起对话
        await askAI(false);
      } else {
        // 如果是文本/图片，已经压入 history，传入 true 跳过输入框收集，直接向 AI 发送
        await askAI(true);
      }
    });
  }
  window.addEventListener('error', handleGlobalImageError, true);
  window.addEventListener('keydown', handleGlobalKeyDown);

  if (window.api && window.api.onConfigUpdated) {
    window.api.onConfigUpdated((newConfig) => {
      if (newConfig) {
        currentConfig.value = newConfig;
        // 配置热更新时保留当前窗口已调整的缩放，避免新增服务商等操作后被全局配置覆盖。

        // 1. 配置更新后同步重构服务商和模型列表
        updateModelListAndMap(newConfig);

        // 2. 校验并清理已删除、被禁用或运行时配置已变化的 MCP 服务
        if (newConfig.mcpServers) {
          let mcpChanged = false;
          const previousFingerprint = lastAppliedMcpConfigFingerprint.value;
          // 筛选当前真正有效的选中 ID
          const validMcpIds = sessionMcpServerIds.value.filter(id => {
            const server = newConfig.mcpServers[id];
            return server && server.isActive; // 必须存在且启用
          });

          if (validMcpIds.length !== sessionMcpServerIds.value.length) {
            sessionMcpServerIds.value = validMcpIds;
            tempSessionMcpServerIds.value = tempSessionMcpServerIds.value.filter(id => {
              const server = newConfig.mcpServers[id];
              return server && server.isActive;
            });
            mcpChanged = true;
          }

          const nextFingerprint = buildSelectedMcpConfigFingerprint(validMcpIds, newConfig.mcpServers);
          if (nextFingerprint !== previousFingerprint) {
            mcpChanged = true;
          }

          // 仅在当前窗口实际使用的 MCP 运行时配置变化时，本地重新加载，不回写配置，避免广播风暴
          if (mcpChanged && !loading.value && !isMcpLoading.value) {
            requestApplyMcpTools(false, 'config-runtime-changed');
          }
        }
      }
    });
  }

  if (window.api && window.api.onMcpCacheUpdated) {
    window.api.onMcpCacheUpdated(async (payload) => {
      try {
        const cache = await window.api.getMcpToolCache() || {};
        mcpToolCache.value = cache;

        const serverId = typeof payload?.serverId === 'string' ? payload.serverId : '';
        const reason = typeof payload?.reason === 'string' ? payload.reason : '';
        const emitReloadSuggested = payload?.emitReloadSuggested !== false;

        if (!serverId || !sessionMcpServerIds.value.includes(serverId)) {
          return;
        }

        if (reason === 'auto-bootstrap' || !emitReloadSuggested) {
          return;
        }

        if (!loading.value && !isMcpLoading.value) {
          requestApplyMcpTools(false, `mcp-cache-updated:${reason || 'manual'}`);
        }
      } catch (error) {
        console.error("Auto refresh MCP cache failed:", error);
      }
    });
  }

  if (window.api && window.api.onSkillsUpdated) {
    window.api.onSkillsUpdated(async () => {
      // 内部已经集成了无效选中清理逻辑
      await fetchSkillsList();
    });
  }
});


const AUTO_NAMING_TIMEOUT_MS = 30000;
const AUTO_NAMING_MAX_TEXT_CHARS = 1000;
const AUTO_NAMING_MAX_IMAGES = 3;
const AUTO_NAMING_MAX_TITLE_TOKENS = 16;
const buildAutoNamingSystemPrompt = () => {
  const locale = currentConfig.value?.language === 'en'
    ? 'English'
    : currentConfig.value?.language === 'zh'
      ? 'Chinese'
      : (currentConfig.value?.language || 'the user primary language');

  return `You are a conversation title generator. I will provide dialogue content with clearly labeled <system_prompt> and <user_prompt> blocks. Summarize the conversation into a short title that captures the main topic of this conversation.

Rules:
1. The title language must match the user's primary language.
2. Do not use punctuation, separators, quotes, emoji, or other special symbols.
3. Reply directly with the title only.
4. If the user's primary language is unclear, summarize using ${locale}.
5. Keep the title natural and concise. Titles within about ${AUTO_NAMING_MAX_TITLE_TOKENS} tokenizer tokens are acceptable; do not intentionally shorten a clear normal-length mixed-language title.`;
};

const sanitizeConversationTitlePart = (value, maxLength = 30) => {
  const normalized = typeof value === 'string' ? value : String(value ?? '');
  return normalized
    .replace(/^\s*(?:标题|会话标题|名称|命名)\s*[:：-]\s*/i, '')
    .replace(/^[`'"“”‘’\s]+|[`'"“”‘’\s]+$/g, '')
    .replace(/[\\/:*?"<>|\n\r]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
};


const countConversationTitleTokens = async (value = '') => {
  try {
    const encodeGptTokens = await loadGptTokenizerEncode();
    if (typeof encodeGptTokens !== 'function') {
      throw new Error('gpt-tokenizer encode export is unavailable');
    }
    return encodeGptTokens(String(value || '')).length;
  } catch {
    return Array.from(String(value || '')).length;
  }
};

const truncateConversationTitleByTokens = async (value, maxTokens = AUTO_NAMING_MAX_TITLE_TOKENS) => {
  const normalized = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!normalized) return '';

  if (await countConversationTitleTokens(normalized) <= maxTokens) {
    return normalized;
  }

  let result = '';
  for (const char of Array.from(normalized)) {
    const next = result + char;
    if (await countConversationTitleTokens(next) > maxTokens) break;
    result = next;
  }

  return result.trim();
};

const sanitizeAutoNamingTitlePart = async (value) => {
  const normalized = sanitizeConversationTitlePart(value, 1000)
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  return truncateConversationTitleByTokens(normalized, AUTO_NAMING_MAX_TITLE_TOKENS);
};

const buildConversationTimestampSuffix = (date = new Date()) => {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}-${milliseconds}`;
};

const buildConversationTimestampedBasename = (namePrefix = '', { force = false, date = new Date(), includeCode = true } = {}) => {
  const safeNamePrefix = sanitizeConversationTitlePart(namePrefix, 36);
  if (!safeNamePrefix) return '';
  const safeCodeName = sanitizeConversationTitlePart(CODE.value || 'AI', 36).replace(/[\\/:*?"<>|]/g, '_');
  const timestampSuffix = buildConversationTimestampSuffix(date);
  return includeCode && safeCodeName
    ? `${getAutoSavePrefixTag(force)}${safeNamePrefix}-${safeCodeName}-${timestampSuffix}`
    : `${getAutoSavePrefixTag(force)}${safeNamePrefix}-${timestampSuffix}`;
};

const getAutoSavePrefixTag = (options = {}) => {
  const normalizedOptions = typeof options === 'boolean'
    ? { force: options }
    : (options && typeof options === 'object' ? options : {});
  const { force = false, includeSummonPrefix = true } = normalizedOptions;
  if (includeSummonPrefix && basic_msg.value?.type === "summon") return "召唤-";
  if (force) return "关闭留档-";
  return "";
};

const buildConversationTitleOnly = (namePrefix, force = false, options = {}) => {
  const safeNamePrefix = sanitizeConversationTitlePart(namePrefix, 36);
  if (!safeNamePrefix) return '';
  return `${getAutoSavePrefixTag({ force, ...options })}${safeNamePrefix}`;
};

const resolveUniqueConversationFileName = async (baseTitle = '', dirPath = '') => {
  const normalizedBaseTitle = sanitizeConversationTitlePart(baseTitle, 80);
  const normalizedDirPath = typeof dirPath === 'string' ? dirPath.trim() : '';
  if (!normalizedBaseTitle || !normalizedDirPath) return normalizedBaseTitle;

  try {
    const existingFiles = await window.api.listJsonFiles(normalizedDirPath);
    const existingTitles = new Set(
      (Array.isArray(existingFiles) ? existingFiles : [])
        .map(item => {
          const rawTitle = typeof item?.title === 'string' && item.title.trim()
            ? item.title.trim()
            : typeof item?.basename === 'string'
              ? item.basename.replace(/\.json$/i, '').trim()
              : '';
          return rawTitle;
        })
        .filter(Boolean)
    );

    if (!existingTitles.has(normalizedBaseTitle)) {
      return normalizedBaseTitle;
    }

    let suffix = 2;
    while (existingTitles.has(`${normalizedBaseTitle}-${suffix}`)) {
      suffix += 1;
    }

    return `${normalizedBaseTitle}-${suffix}`;
  } catch (error) {
    console.warn('[Auto Naming] failed to inspect existing local chat files, fallback to base title:', error);
    return normalizedBaseTitle;
  }
};

const buildLegacyFallbackConversationFileName = (namePrefix, force = false) => {
  return buildConversationTimestampedBasename(namePrefix, { force });
};

const autoNamingAbortController = ref(null);
const autoNamingPromise = ref(null);


const isCurrentPromptAutoSaveEnabled = () => {
  const promptConfig = currentConfig.value?.prompts?.[CODE.value];
  return Boolean(promptConfig?.autoSaveChat);
};

const isNamedLocalConversationAvailable = () => Boolean(
  currentConfig.value?.webdav?.localChatPath &&
  typeof defaultConversationName.value === 'string' &&
  defaultConversationName.value.trim()
);

const shouldPersistCurrentSessionAutomatically = () => {
  return isCurrentPromptAutoSaveEnabled() || isNamedLocalConversationAvailable();
};

const cancelAutoNamingRequest = () => {
  if (autoNamingAbortController.value) {
    try {
      autoNamingAbortController.value.abort();
    } catch {
      // ignore abort race
    }
    autoNamingAbortController.value = null;
  }
};

const getFallbackConversationNamePrefix = (firstUserMsg) => {
  if (!firstUserMsg) return '';
  const content = firstUserMsg.content;

  if (Array.isArray(content)) {
    const hasImage = content.some(p => p?.type === 'image_url');
    const hasFile = content.some(p => p?.type === 'file' || p?.type === 'input_file');
    const textPart = content.find(p => p?.type === 'text' && typeof p.text === 'string' && p.text.trim());

    if (hasImage) return '图片';
    if (hasFile) return '文件';
    if (textPart?.text) return sanitizeConversationTitlePart(textPart.text, 20);
    return '';
  }

  if (typeof content === 'string') {
    return sanitizeConversationTitlePart(content, 20);
  }

  return '';
};

const isConfiguredFastModelAvailable = (modelKey = '') => {
  if (typeof modelKey !== 'string' || !modelKey.trim()) return false;
  const separatorIndex = modelKey.indexOf('|');
  if (separatorIndex <= 0) return false;

  const providerId = modelKey.slice(0, separatorIndex);
  const modelName = modelKey.slice(separatorIndex + 1);
  const provider = currentConfig.value?.providers?.[providerId];
  return Boolean(
    provider &&
    provider.enable !== false &&
    modelName &&
    Array.isArray(provider.modelList) &&
    provider.modelList.includes(modelName)
  );
};

const takeLastTextChars = (value, maxChars = AUTO_NAMING_MAX_TEXT_CHARS) => {
  const normalized = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(-maxChars);
};

const getCurrentConversationSystemPromptTail = () => {
  return takeLastTextChars(currentSystemPrompt.value || '', AUTO_NAMING_MAX_TEXT_CHARS);
};

const getFirstUserMessageTextTail = (firstUserMsg) => {
  const content = firstUserMsg?.content;

  if (typeof content === 'string') {
    return takeLastTextChars(content, AUTO_NAMING_MAX_TEXT_CHARS);
  }

  if (!Array.isArray(content)) return '';

  const textContent = content
    .filter(part => part?.type === 'text' && typeof part.text === 'string' && part.text.trim())
    .map(part => part.text.trim())
    .join('\n');

  return takeLastTextChars(textContent, AUTO_NAMING_MAX_TEXT_CHARS);
};

const wrapAutoNamingPromptBlock = (tag, content) => {
  const normalizedTag = String(tag || '').trim();
  const normalizedContent = typeof content === 'string' ? content.trim() : String(content ?? '').trim();
  if (!normalizedTag || !normalizedContent) return '';
  return `<${normalizedTag}>\n${normalizedContent}\n</${normalizedTag}>`;
};

const buildAutoNamingUserMessageText = (firstUserMsg) => {
  const sections = [];
  const conversationSystemPrompt = getCurrentConversationSystemPromptTail();
  const firstUserMessage = getFirstUserMessageTextTail(firstUserMsg);
  const fileNames = [];

  if (conversationSystemPrompt) {
    sections.push(`Conversation system prompt:\n${wrapAutoNamingPromptBlock('system_prompt', conversationSystemPrompt)}`);
  }

  if (firstUserMessage) {
    sections.push(`First user message:\n${wrapAutoNamingPromptBlock('user_prompt', firstUserMessage)}`);
  }

  if (Array.isArray(firstUserMsg?.content)) {
    firstUserMsg.content.forEach((part) => {
      if (part?.type === 'file' || part?.type === 'input_file') {
        const fileInput = part.file || part;
        const fileName = fileInput?.filename || fileInput?.name;
        if (fileName) fileNames.push(String(fileName));
      }
    });
  }

  if (fileNames.length > 0) {
    sections.push(`Attached file names:\n${fileNames.slice(0, 10).join('\n')}`);
  }

  return sections.join('\n\n').trim();
};

const buildAutoNamingImageParts = (firstUserMsg) => {
  const content = firstUserMsg?.content;
  if (!Array.isArray(content)) return [];

  return content
    .filter(part => part?.type === 'image_url')
    .slice(0, AUTO_NAMING_MAX_IMAGES)
    .map((part) => {
      const imageUrl = part.image_url?.url || part.image_url;
      if (!imageUrl) return null;
      return {
        type: 'image_url',
        image_url: typeof imageUrl === 'string' ? { url: imageUrl } : imageUrl
      };
    })
    .filter(Boolean);
};

const buildAutoNamingPromptText = (content) => String(content ?? '').trim();

const buildAutoNamingUserContent = (firstUserMsg) => {
  const userMessageText = buildAutoNamingUserMessageText(firstUserMsg);
  const imageParts = buildAutoNamingImageParts(firstUserMsg);

  if (!userMessageText && imageParts.length === 0) return '';
  if (imageParts.length === 0) return buildAutoNamingPromptText(userMessageText);

  return [
    ...(userMessageText ? [{ type: 'text', text: buildAutoNamingPromptText(userMessageText) }] : []),
    ...imageParts
  ];
};

const extractAssistantTextFromContent = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (typeof content.content === 'string') return content.content;
  }
  return '';
};

const extractAutoNamingResponseText = async (response, apiType = 'chat_completions') => {
  if (!response) return '';

  if (isAsyncIterableResponse(response)) {
    const message = await collectChatCompletionStreamToMessage(response);
    return extractAssistantTextFromContent(message?.content);
  }

  if (apiType === 'responses' || apiType === 'codex') {
    if (typeof response.output_text === 'string' && response.output_text.trim()) {
      return response.output_text;
    }

    if (Array.isArray(response.output)) {
      return response.output
        .flatMap(item => Array.isArray(item?.content) ? item.content : [])
        .map(part => part?.text || '')
        .filter(Boolean)
        .join(' ');
    }
  }

  return extractAssistantTextFromContent(response?.choices?.[0]?.message?.content);
};

const generateConversationNamePrefixWithFastModel = async (firstUserMsg, signal = null) => {
  const fastModelKey = currentConfig.value?.defaultFastModel;
  if (!isConfiguredFastModelAvailable(fastModelKey)) return '';

  const separatorIndex = fastModelKey.indexOf('|');
  const providerId = fastModelKey.slice(0, separatorIndex);
  const modelName = fastModelKey.slice(separatorIndex + 1);
  const provider = currentConfig.value.providers[providerId];
  const userContent = buildAutoNamingUserContent(firstUserMsg);

  if (!userContent || (Array.isArray(userContent) && userContent.length === 0)) return '';

  const namingController = signal instanceof AbortSignal ? null : new AbortController();
  const namingSignal = signal || namingController?.signal || null;
  const timeoutId = namingController ? setTimeout(() => namingController.abort(), AUTO_NAMING_TIMEOUT_MS) : null;

  try {
    if (namingSignal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const apiType = provider?.apiType || 'chat_completions';
    const response = await window.api.createChatCompletion({
      baseUrl: provider.url,
      apiKey: provider.api_key,
      model: modelName,
      apiType,
      headers: JSON.parse(JSON.stringify(provider?.headers || {})),
      messages: [
        { role: 'system', content: buildAutoNamingSystemPrompt() },
        { role: 'user', content: userContent }
      ],
      stream: false,
      signal: namingSignal,
      temperature: 0.2
    });

    if (namingSignal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const rawTitle = await extractAutoNamingResponseText(response, apiType);
    return await sanitizeAutoNamingTitlePart(rawTitle);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }
    console.warn('[Auto Naming] fast model naming failed, fallback to local naming:', error);
    return '';
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const generateSuggestedConversationBasename = async ({
  force = false,
  uniqueDirPath = '',
  signal = null,
  firstUserMsg = null,
  allowFastModel = true
} = {}) => {
  const targetFirstUserMsg = firstUserMsg || chat_show.value.find(msg => msg.role === 'user') || null;
  const fallbackNamePrefix = getFallbackConversationNamePrefix(targetFirstUserMsg) || CODE.value || 'AI';
  let generatedBaseTitle = '';

  if (targetFirstUserMsg && allowFastModel && isConfiguredFastModelAvailable(currentConfig.value?.defaultFastModel)) {
    const aiNamePrefix = await generateConversationNamePrefixWithFastModel(targetFirstUserMsg, signal);
    if (aiNamePrefix) {
      generatedBaseTitle = buildConversationTitleOnly(aiNamePrefix, force, { includeSummonPrefix: false });
    }
  }

  if (!generatedBaseTitle) {
    generatedBaseTitle = buildLegacyFallbackConversationFileName(fallbackNamePrefix, force)
      || buildLegacyFallbackConversationFileName(CODE.value || 'AI', force);
  }

  if (!generatedBaseTitle) return '';
  return resolveUniqueConversationFileName(generatedBaseTitle, uniqueDirPath);
};

const renderFilenameAutoNamingButton = ({ canUseAutoNaming = false, isAutoNaming, onClick }) => {
  if (!canUseAutoNaming) return null;
  return h(ElButton, {
    class: 'filename-auto-name-button',
    size: 'small',
    loading: Boolean(isAutoNaming?.value),
    disabled: Boolean(isAutoNaming?.value),
    onClick
  }, () => isAutoNaming?.value ? '命名中...' : '自动命名');
};

const renderFilenamePromptTitleRow = ({ text = '请输入文件名。', canUseAutoNaming = false, isAutoNaming, onClick }) => h(
  'div',
  { class: 'filename-prompt-title-row' },
  [
    h('p', { class: 'filename-prompt-title-text' }, text),
    renderFilenameAutoNamingButton({ canUseAutoNaming, isAutoNaming, onClick })
  ].filter(Boolean)
);

const createManualAutoNamingHandler = ({ inputValue, isAutoNaming, uniqueDirPath = '', fallbackBasename = '' }) => async () => {
  if (isAutoNaming.value) return;
  isAutoNaming.value = true;
  try {
    const generatedName = await generateSuggestedConversationBasename({
      uniqueDirPath,
      allowFastModel: true
    });
    const nextName = sanitizeConversationTitlePart(generatedName || fallbackBasename || CODE.value || 'AI', 80);
    if (nextName) {
      inputValue.value = nextName;
    } else {
      showDismissibleMessage.warning('当前对话内容不足，无法自动命名');
    }
  } catch (error) {
    console.warn('[Auto Naming] manual naming failed:', error);
    const fallbackName = sanitizeConversationTitlePart(fallbackBasename || CODE.value || 'AI', 80);
    if (fallbackName) {
      inputValue.value = fallbackName;
    }
  } finally {
    isAutoNaming.value = false;
  }
};

const triggerAutoNamingForFirstUserMessage = async ({ force = false, requestSignal = null } = {}) => {
  if (!force && !isCurrentPromptAutoSaveEnabled()) {
    return '';
  }

  if (defaultConversationName.value || !currentConfig.value?.webdav?.localChatPath) {
    return defaultConversationName.value || '';
  }

  const firstUserMsg = chat_show.value.find(msg => msg.role === 'user');
  if (!firstUserMsg) return '';

  cancelAutoNamingRequest();
  const localController = requestSignal instanceof AbortSignal ? null : new AbortController();
  const namingSignal = requestSignal || localController?.signal || null;
  if (localController) {
    autoNamingAbortController.value = localController;
  }

  const namingTask = (async () => {
    try {
      const generatedName = await generateSuggestedConversationBasename({
        force,
        uniqueDirPath: currentConfig.value.webdav.localChatPath,
        signal: namingSignal,
        firstUserMsg
      });
      if (!defaultConversationName.value && generatedName) {
        defaultConversationName.value = generatedName;
        scheduleAutoSave({
          reason: isConfiguredFastModelAvailable(currentConfig.value?.defaultFastModel)
            ? 'auto-naming-completed'
            : 'auto-naming-fallback-completed',
          immediate: true
        });
      }
      return defaultConversationName.value || generatedName || '';
    } finally {
      if (autoNamingAbortController.value === localController) {
        autoNamingAbortController.value = null;
      }
      if (autoNamingPromise.value === namingTask) {
        autoNamingPromise.value = null;
      }
    }
  })();

  autoNamingPromise.value = namingTask;
  return namingTask;
};

const autoSaveSession = async (force = false) => {
  if (!currentConfig.value?.webdav?.localChatPath) {
    return false;
  }

  const promptConfig = currentConfig.value?.prompts?.[CODE.value] || {};
  const autoSaveProjectId = typeof promptConfig.autoSaveProjectId === 'string' ? promptConfig.autoSaveProjectId : '';

  // 2. 获取当前快捷助手的配置
  const shouldAutoSave = shouldPersistCurrentSessionAutomatically();

  if (!shouldAutoSave && !force) {
    return false;
  }
  // 自动命名已前移到首条消息发送阶段；自动保存阶段仅负责持久化已有会话名。

  // 5. 如果经过尝试后仍然没有对话名称（例如空对话），则不保存
  if (!defaultConversationName.value) {
    return false;
  }

  // 6. 执行写入操作
  try {
    await persistSessionToLocalJsonFile(defaultConversationName.value);

    try {
      const localProjects = normalizeWindowProjects(await window.api.readLocalProjects(currentConfig.value.webdav.localChatPath));
      const filename = `${defaultConversationName.value}.json`;
      const existingProjectId = findProjectIdByFilename(localProjects, filename);
      if (!existingProjectId && autoSaveProjectId) {
        const projectName = localProjects.projects.find((p) => p.id === autoSaveProjectId)?.name || '';
        await reassignLocalProject({
          projectId: autoSaveProjectId,
          projectName,
          addFilename: filename,
          removeFilenames: []
        });
      }
    } catch (projectError) {
      console.warn('[projects] auto-save local project assignment failed:', projectError);
    }

    lastAutoSaveAt = Date.now();
    return true;
  } catch (error) {
    console.error('Auto-save failed:', error);
    return false;
  }
};

const clearScheduledAutoSave = () => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  scheduledAutoSaveRequest = null;
};

const executeAutoSaveRequest = async (request = {}) => {
  if (!request || !request.force) {
    if (!shouldPersistCurrentSessionAutomatically()) {
      return false;
    }
  }

  if (autoSaveExecutionPromise) {
    queuedAutoSaveRequest = {
      force: queuedAutoSaveRequest?.force || request.force || false,
      reason: request.reason || queuedAutoSaveRequest?.reason || 'queued'
    };
    return autoSaveExecutionPromise;
  }

  autoSaveExecutionPromise = (async () => {
    try {
      return await autoSaveSession(Boolean(request.force));
    } finally {
      autoSaveExecutionPromise = null;
      if (queuedAutoSaveRequest) {
        const nextRequest = queuedAutoSaveRequest;
        queuedAutoSaveRequest = null;
        await executeAutoSaveRequest(nextRequest);
      }
    }
  })();

  return autoSaveExecutionPromise;
};

const scheduleAutoSave = ({ reason = 'generic', immediate = false, force = false, delay = 0 } = {}) => {
  if (!force && !shouldPersistCurrentSessionAutomatically()) {
    return;
  }

  const request = { reason, force };

  if (immediate || force || delay <= 0) {
    clearScheduledAutoSave();
    executeAutoSaveRequest(request);
    return;
  }

  if (scheduledAutoSaveRequest?.force) {
    request.force = true;
  }
  scheduledAutoSaveRequest = request;

  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(() => {
    const pendingRequest = scheduledAutoSaveRequest || request;
    autoSaveTimer = null;
    scheduledAutoSaveRequest = null;
    executeAutoSaveRequest(pendingRequest);
  }, delay);
};

const scheduleInputDraftAutoSave = (reason = 'input-draft') => {
  scheduleAutoSave({ reason, delay: AUTO_SAVE_INPUT_DEBOUNCE_MS });
};

const scheduleLoadingAutoSave = (reason = 'loading-progress') => {
  const elapsed = Date.now() - lastAutoSaveAt;
  if (elapsed >= AUTO_SAVE_LOADING_THROTTLE_MS) {
    scheduleAutoSave({ reason, immediate: true });
  } else {
    scheduleAutoSave({ reason, delay: Math.max(120, AUTO_SAVE_LOADING_THROTTLE_MS - elapsed) });
  }
};


onBeforeUnmount(async () => {  // 15s 轮询自动保存已移除；当前仅保留显式业务触发的保存链路。

  window.removeEventListener('wheel', handleWheel);
  window.removeEventListener('focus', handleWindowFocus);
  window.removeEventListener('blur', handleWindowBlur);
  if (textSearchInstance) textSearchInstance.destroy();
  window.removeEventListener('blur', handleAutoCloseOnBlur);
  await window.api.closeMcpClient();
  window.removeEventListener('error', handleGlobalImageError, true);
  window.removeEventListener('keydown', handleGlobalKeyDown);

  cleanupStickyResizeObserver();
  clearScheduledAutoSave();

});

const saveWindowSize = async () => {
  if (!CODE.value || !currentConfig.value.prompts[CODE.value]) {
    showDismissibleMessage.warning('无法保存窗口设置，因为当前不是一个已定义的快捷助手。');
    return;
  }

  if (window.fullScreen) {
    showDismissibleMessage.warning('无法在全屏模式下保存窗口位置和大小。');
    return;
  }

  const settingsToSave = {
    window_height: window.outerHeight,
    window_width: window.outerWidth,
    zoom: zoomLevel.value,
    position_x: window.screenX,
    position_y: window.screenY,
  };

  try {
    const result = await window.api.savePromptWindowSettings(CODE.value, settingsToSave);
    if (result.success) {
      showDismissibleMessage.success('当前快捷助手的窗口大小、位置与缩放已保存');
      if (currentConfig.value.prompts[CODE.value]) {
        Object.assign(currentConfig.value.prompts[CODE.value], settingsToSave);
      }
    } else {
      showDismissibleMessage.error(`保存失败: ${result.message}`);
    }
  } catch (error) {
    console.error("Error saving window settings:", error);
    showDismissibleMessage.error('保存窗口设置时出错');
  }
}

const getSessionDataAsObject = (options = {}) => {
  const currentPromptConfig = currentConfig.value.prompts[CODE.value] || {};
  const explicitTitle = typeof options?.title === 'string' ? options.title.trim() : '';
  return {
    anywhere_history: true, CODE: CODE.value, basic_msg: basic_msg.value, isInit: isInit.value,
    autoCloseOnBlur: autoCloseOnBlur.value, model: model.value,
    sessionMetadata: { title: explicitTitle || getSessionMetadata().title },
    currentPromptConfig: currentPromptConfig, history: history.value, chat_show: chat_show.value, selectedVoice: selectedVoice.value,
    activeMcpServerIds: sessionMcpServerIds.value || [],
    activeSkillIds: sessionSkillIds.value || [],
    isAutoApproveTools: isAutoApproveTools.value,
    taskList: taskList.value
  };
}
// --- 项目（目录）归属：窗口端 helper ---
const stripJsonName = (value) => {
  const name = String(value || '').trim();
  return name.toLowerCase().endsWith('.json') ? name.slice(0, -5) : name;
};

const normalizeWindowProjects = (data) => {
  const projects = Array.isArray(data?.projects) ? data.projects : [];
  return {
    version: Number(data?.version) || 1,
    projects: projects
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({
        id: String(p.id || '').trim(),
        name: String(p.name || '').trim() || String(p.id || '').trim(),
        files: Array.isArray(p.files) ? p.files.map((f) => String(f || '').trim()).filter(Boolean) : []
      }))
      .filter((p) => p.id)
  };
};

const loadProjectsForScope = async (scope) => {
  try {
    if (scope === 'cloud') {
      const { url, username, password, data_path } = currentConfig.value?.webdav || {};
      if (!url || !data_path) return { version: 1, projects: [] };
      const client = createClient(url, { username, password });
      const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
      const remotePath = `${remoteDir}/projects.yaml`;
      if (!(await client.exists(remotePath))) return { version: 1, projects: [] };
      const text = await client.getFileContents(remotePath, { format: 'text' });
      return normalizeWindowProjects(await window.api.parseProjectsYaml(typeof text === 'string' ? text : String(text)));
    }
    const localPath = currentConfig.value?.webdav?.localChatPath || '';
    if (!localPath) return { version: 1, projects: [] };
    return normalizeWindowProjects(await window.api.readLocalProjects(localPath));
  } catch (error) {
    console.warn('[projects] load for scope failed:', error);
    return { version: 1, projects: [] };
  }
};

const findProjectIdByFilename = (projectsData, filename) => {
  const stripped = stripJsonName(filename);
  const project = (projectsData?.projects || []).find((p) =>
    (p.files || []).some((f) => stripJsonName(f) === stripped)
  );
  return project?.id || '';
};

const renderProjectSelectRow = ({ projects, selectedProjectId }) => h(
  'div',
  { class: 'filename-project-row' },
  [
    h('span', { class: 'filename-project-label' }, '项目'),
    h(ElSelect, {
      modelValue: selectedProjectId.value,
      'onUpdate:modelValue': (val) => { selectedProjectId.value = val; },
      placeholder: '未分组',
      clearable: true,
      class: 'filename-project-select',
      popperClass: 'filename-project-popper',
      teleported: true,
      placement: 'bottom-start'
    }, () => [
      h(ElOption, { label: '未分组', value: '' }),
      ...projects.map((p) => h(ElOption, { key: p.id, label: p.name, value: p.id }))
    ])
  ]
);

// 本地项目归属重写：移除旧名 + 当前名，按需加入目标项目（projectId 为空=未分组）。
const reassignLocalProject = async ({ projectId, projectName, addFilename, removeFilenames = [] }) => {
  const localPath = currentConfig.value?.webdav?.localChatPath || '';
  if (!localPath) return;
  const data = normalizeWindowProjects(await window.api.readLocalProjects(localPath));
  const removeSet = new Set([addFilename, ...removeFilenames].map((n) => stripJsonName(n)).filter(Boolean));
  let projects = data.projects.map((p) => ({
    ...p,
    files: (p.files || []).filter((f) => !removeSet.has(stripJsonName(f)))
  }));
  if (projectId && addFilename) {
    if (!projects.some((p) => p.id === projectId)) {
      projects.push({ id: projectId, name: projectName || projectId, files: [] });
    }
    projects = projects.map((p) =>
      p.id === projectId ? { ...p, files: [...p.files, addFilename] } : p
    );
  }
  await window.api.writeLocalProjects(localPath, { version: data.version || 1, projects });
};

// 云端项目归属：读取云端 projects.yaml → 单文件归属合并 → 写回（webdav 在渲染层）。
const assignCloudProject = async ({ projectId, projectName, basename }) => {
  const { url, username, password, data_path } = currentConfig.value?.webdav || {};
  if (!url || !data_path) return;
  const client = createClient(url, { username, password });
  const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
  const remotePath = `${remoteDir}/projects.yaml`;
  let current = { version: 1, projects: [] };
  try {
    if (await client.exists(remotePath)) {
      const text = await client.getFileContents(remotePath, { format: 'text' });
      current = await window.api.parseProjectsYaml(typeof text === 'string' ? text : String(text));
    }
  } catch {
    current = { version: 1, projects: [] };
  }
  const merged = await window.api.mergeFileAssignment(current, {
    basename,
    projectId: projectId || '',
    projectName: projectName || ''
  });
  const content = await window.api.serializeProjectsYaml(merged);
  await client.putFileContents(remotePath, content, { overwrite: true });
};


const CHAT_METADATA_FILENAME = 'chat-metadata.yaml';

const normalizeWebdavContents = (contents) => {
  if (Array.isArray(contents)) return contents;
  if (contents && Array.isArray(contents.data)) return contents.data;
  return [];
};

const normalizeWebdavFileTime = (value) => normalizeSessionTimestamp(value) || '';
const buildChatMetadataRemotePath = (remoteDir) => `${remoteDir}/${CHAT_METADATA_FILENAME}`;

const resolveWindowCloudSaveFileSystemTimes = async (filename) => {
  const localDir = currentConfig.value?.webdav?.localChatPath || '';
  const nowIso = new Date().toISOString();
  if (!localDir) {
    return { createdAt: nowIso, updatedAt: nowIso, source: 'now' };
  }

  try {
    const files = await window.api.listJsonFiles(localDir);
    const matchedFile = (Array.isArray(files) ? files : []).find((item) => item?.basename === filename);
    if (!matchedFile) {
      return { createdAt: nowIso, updatedAt: nowIso, source: 'now' };
    }

    const createdAt = normalizeSessionTimestamp(matchedFile.createdAt || matchedFile.birthtime || matchedFile.ctime) || normalizeSessionTimestamp(matchedFile.updatedAt) || nowIso;
    const updatedAt = normalizeSessionTimestamp(matchedFile.updatedAt || matchedFile.lastmod || matchedFile.mtime) || createdAt;
    return { createdAt, updatedAt, source: 'local-file' };
  } catch {
    return { createdAt: nowIso, updatedAt: nowIso, source: 'now' };
  }
};

const buildWindowChatMetadataPayload = (basename, options = {}) => {
  const { sessionData = null, createdAt = '', updatedAt = '' } = options;
  const metadata = sessionData?.sessionMetadata && typeof sessionData.sessionMetadata === 'object'
    ? sessionData.sessionMetadata
    : getSessionMetadata();
  const normalizedCreatedAt = normalizeSessionTimestamp(createdAt);
  const normalizedUpdatedAt = normalizeSessionTimestamp(updatedAt);
  const fallbackNow = new Date().toISOString();

  return {
    title: typeof metadata?.title === 'string' && metadata.title.trim()
      ? metadata.title.trim()
      : stripJsonName(basename),
    createdAt: normalizedCreatedAt || normalizedUpdatedAt || fallbackNow,
    updatedAt: normalizedUpdatedAt || normalizedCreatedAt || fallbackNow
  };
};

const readCloudChatMetadataIndex = async (client, remoteDir) => {
  try {
    const text = await client.getFileContents(buildChatMetadataRemotePath(remoteDir), { format: 'text' });
    return window.api.normalizeChatMetadataIndex(
      await window.api.parseChatMetadataYaml(typeof text === 'string' ? text : String(text || ''))
    );
  } catch {
    return window.api.normalizeChatMetadataIndex({ version: 1, chats: {} });
  }
};

const writeCloudChatMetadataIndex = async (client, remoteDir, metadata) => {
  const content = await window.api.serializeChatMetadataYaml(metadata);
  await client.putFileContents(buildChatMetadataRemotePath(remoteDir), content, { overwrite: true });
};

const reconcileWindowCloudChatMetadata = async (client, remoteDir, files = null) => {
  const list = Array.isArray(files)
    ? files
    : normalizeWebdavContents(await client.getDirectoryContents(remoteDir, { details: true }).catch(() => []));
  const jsonFiles = normalizeWebdavContents(list)
    .map((item) => ({
      ...item,
      basename: String(item?.basename || item?.filename || item?.name || '').trim()
    }))
    .filter((item) => item?.type === 'file' && item.basename.toLowerCase().endsWith('.json'));
  const metadata = await readCloudChatMetadataIndex(client, remoteDir);
  const nextChats = { ...(metadata?.chats || {}) };
  let changed = false;

  jsonFiles.forEach((file) => {
    const current = nextChats[file.basename];
    const candidate = window.api.normalizeChatMetadataEntry(file.basename, {
      title: current?.title || stripJsonName(file.basename),
      createdAt: current?.createdAt || normalizeWebdavFileTime(file.createdAt || file.creationdate || file.birthtime || file.ctime || file.lastmod || file.props?.creationdate || file.props?.getcreationdate),
      updatedAt: current?.updatedAt || normalizeWebdavFileTime(file.updatedAt || file.lastmod || file.lastModified || file.mtime || file.props?.getlastmodified || file.props?.lastmod || file.createdAt)
    });
    if (JSON.stringify(current || null) !== JSON.stringify(candidate || null)) {
      nextChats[file.basename] = candidate;
      changed = true;
    }
  });

  Object.keys(nextChats).forEach((basename) => {
    if (!jsonFiles.some((file) => file.basename === basename)) {
      delete nextChats[basename];
      changed = true;
    }
  });

  const nextMetadata = window.api.normalizeChatMetadataIndex({ version: 1, chats: nextChats });
  if (changed) {
    await writeCloudChatMetadataIndex(client, remoteDir, nextMetadata);
  }
  return nextMetadata;
};

const upsertWindowCloudChatMetadata = async (client, remoteDir, filename, chatMetadata) => {
  const remoteList = normalizeWebdavContents(await client.getDirectoryContents(remoteDir, { details: true }).catch(() => []));
  const metadata = await reconcileWindowCloudChatMetadata(client, remoteDir, remoteList);
  const previousEntry = metadata.chats[filename] ? { ...metadata.chats[filename] } : null;
  metadata.chats[filename] = window.api.normalizeChatMetadataEntry(filename, chatMetadata);
  await writeCloudChatMetadataIndex(client, remoteDir, metadata);
  return { metadata, previousEntry };
};

const restoreWindowCloudChatMetadataEntry = async (client, remoteDir, filename, metadata, previousEntry) => {
  if (!metadata) return;
  if (previousEntry) {
    metadata.chats[filename] = previousEntry;
  } else {
    delete metadata.chats[filename];
  }
  await writeCloudChatMetadataIndex(client, remoteDir, metadata).catch(() => {});
};

const saveSessionToCloud = async () => {
  const defaultBasename = defaultConversationName.value || buildConversationTimestampedBasename(CODE.value || 'AI', { force: false, includeCode: false });
  const inputValue = ref(defaultBasename);
  const isAutoNaming = ref(false);
  const canUseAutoNaming = isConfiguredFastModelAvailable(currentConfig.value?.defaultFastModel);
  const handleManualAutoNaming = createManualAutoNamingHandler({
    inputValue,
    isAutoNaming,
    uniqueDirPath: currentConfig.value?.webdav?.localChatPath || '',
    fallbackBasename: defaultBasename
  });
  const projectsData = await loadProjectsForScope('cloud');
  const selectedProjectId = ref(findProjectIdByFilename(projectsData, `${defaultBasename}.json`));
  try {
    await ElMessageBox({
      title: '保存到云端',
      message: () => h('div', null, [
        renderFilenamePromptTitleRow({
          text: '请输入要保存到云端的会话名称。',
          canUseAutoNaming,
          isAutoNaming,
          onClick: handleManualAutoNaming
        }),
        h(ElInput, {
          modelValue: inputValue.value,
          'onUpdate:modelValue': (val) => { inputValue.value = val; },
          placeholder: '文件名',
          ref: (elInputInstance) => {
            if (elInputInstance) {
              setTimeout(() => elInputInstance.focus(), 100);
            }
          },
          onKeydown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              document.querySelector('.filename-prompt-dialog .el-message-box__btns .el-button--primary')?.click();
            }
          }
        },
          { append: () => h('div', { class: 'input-suffix-display' }, '.json') }),
        renderProjectSelectRow({ projects: projectsData.projects, selectedProjectId })]),
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
            const sessionData = getSessionDataAsObject({ title: finalBasename });
            const jsonString = JSON.stringify(sessionData, null, 2);
            const { url, username, password, data_path } = currentConfig.value.webdav;
            const client = createClient(url, { username, password });
            const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
            const remoteFilePath = `${remoteDir}/${filename}`;
            if (!(await client.exists(remoteDir))) await client.createDirectory(remoteDir, { recursive: true });
            const fileSystemTimes = await resolveWindowCloudSaveFileSystemTimes(filename);
            const { metadata: previousMetadataIndex, previousEntry } = await upsertWindowCloudChatMetadata(
              client,
              remoteDir,
              filename,
              buildWindowChatMetadataPayload(filename, {
                sessionData,
                createdAt: fileSystemTimes.createdAt,
                updatedAt: fileSystemTimes.updatedAt
              })
            );
            try {
              await client.putFileContents(remoteFilePath, jsonString, { overwrite: true });
            } catch (uploadError) {
              await restoreWindowCloudChatMetadataEntry(client, remoteDir, filename, previousMetadataIndex, previousEntry);
              throw uploadError;
            }
            defaultConversationName.value = finalBasename;
            try {
              const projectName = projectsData.projects.find((p) => p.id === selectedProjectId.value)?.name || '';
              await assignCloudProject({ projectId: selectedProjectId.value, projectName, basename: filename });
            } catch (projectError) {
              console.warn('[projects] 更新云端项目归属失败:', projectError);
            }
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
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const fileTimestamp = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const defaultBasename = defaultConversationName.value || `${CODE.value || 'AI'}-${fileTimestamp}`;

  const formatContent = (content) => !Array.isArray(content) ? String(content).trim() : content.map(p => p.type === 'text' ? p.text.trim() : '').join(' ');
  const formatFiles = (content) => Array.isArray(content) ? content.filter(p => p.type !== 'text').map(p => p.type === 'file' ? p.file.filename : 'Image') : [];

  const addBlockquote = (text) => {
    if (!text) return '';
    return text.split('\n').map(line => `> ${line}`).join('\n');
  };

  const truncate = (str, len = 50) => {
    if (!str) return '';
    const s = String(str);
    return s.length > len ? s.substring(0, len) + '...' : s;
  };

  markdownContent += `# 聊天记录: ${CODE.value} (${timestamp})\n\n### 当前模型: ${modelMap.value[model.value] || 'N/A'}\n\n`;

  if (currentSystemPrompt.value && currentSystemPrompt.value.trim()) {
    markdownContent += `### 系统提示词\n\n${addBlockquote(currentSystemPrompt.value.trim())}\n\n`;
  }
  markdownContent += '---\n\n';

  for (const message of chat_show.value) {
    if (message.role === 'system') continue;

    if (message.role === 'user') {
      let userHeader = '### 👤 用户';
      if (message.timestamp) userHeader += ` - *${formatTimestamp(message.timestamp)}*`;
      markdownContent += `${userHeader}\n\n`;

      const mainContent = formatContent(message.content);
      const files = formatFiles(message.content);

      if (mainContent) markdownContent += `${addBlockquote(mainContent)}\n\n`;

      if (files.length > 0) {
        markdownContent += `> **附件列表:**\n`;
        files.forEach(f => { markdownContent += `> - \`${f}\`\n`; });
        markdownContent += `\n`;
      }
    } else if (message.role === 'assistant') {
      let assistantHeader = `### 🤖 ${message.aiName || 'AI'}`;
      if (message.voiceName) assistantHeader += ` (${message.voiceName})`;
      if (message.completedTimestamp) assistantHeader += ` - *${formatTimestamp(message.completedTimestamp)}*`;
      markdownContent += `${assistantHeader}\n\n`;

      if (message.reasoning_content) {
        markdownContent += `> *思考过程:*\n${addBlockquote(message.reasoning_content)}\n\n`;
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        markdownContent += `> **工具调用:**\n`;
        message.tool_calls.forEach(tool => {
          markdownContent += `> - 🛠️ \`${tool.name}\`: ${truncate(tool.result)}\n`;
        });
        markdownContent += `\n`;
      }

      const mainContent = formatContent(message.content);
      if (mainContent) markdownContent += `${addBlockquote(mainContent)}\n\n`;
      else if (message.status) markdownContent += `> *(AI正在思考...)*\n\n`;
    }
    markdownContent += '---\n\n';
  }

  const inputValue = ref(defaultBasename);
  try {
    await ElMessageBox({
      title: '保存为 Markdown',
      message: () => h('div', null, [
        h('p', { style: 'margin-bottom: 15px; font-size: 14px; color: var(--el-text-color-regular);' }, '请输入文件名。'),
        h(ElInput, {
          modelValue: inputValue.value,
          'onUpdate:modelValue': (val) => { inputValue.value = val; },
          placeholder: '文件名',
          ref: (elInputInstance) => {
            if (elInputInstance) {
              setTimeout(() => elInputInstance.focus(), 100);
            }
          },
          onKeydown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              document.querySelector('.filename-prompt-dialog .el-message-box__btns .el-button--primary')?.click();
            }
          }
        },
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
            showDismissibleMessage.success('Markdown 文件已成功导出！');
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

const saveSessionAsHtml = async () => {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const fileTimestamp = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const defaultBasename = defaultConversationName.value || `${CODE.value || 'AI'}-${fileTimestamp}`;
  const inputValue = ref(defaultBasename);

  const defaultAiSvg = `<svg width="200" height="200" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#FDA5A5" /><g stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"><rect x="25" y="32" width="50" height="42" rx="8" /><line x1="40" y1="63" x2="60" y2="63" /><line x1="35" y1="32" x2="32" y2="22" /><line x1="65" y1="32" x2="68" y2="22" /></g><g fill="white" stroke="none"><circle cx="40" cy="48" r="3.5" /><circle cx="60" cy="48" r="3.5" /><circle cx="32" cy="20" r="3" /><circle cx="68" cy="20" r="3" /></g></svg>`;

  const generateHtmlContent = async () => {
    const { DOMPurify, marked } = await loadExportHtmlDeps();
    let bodyContent = '';
    let tocContent = '';

    const truncate = (str, len = 50) => {
      if (!str) return '';
      const s = String(str);
      return s.length > len ? s.substring(0, len) + '...' : s;
    };

    const formatMessageText = (content) => {
      if (!content) return "";
      if (typeof content === 'string') return content;
      if (!Array.isArray(content)) return String(content);

      let textString = "";
      content.forEach(part => {
        if (part.type === 'text' && part.text && !(part.text.toLowerCase().startsWith('file name:') && part.text.toLowerCase().endsWith('file end'))) {
          textString += part.text;
        }
      });
      return textString.trim();
    };

    const processContentToHtml = (content) => {
      if (!content) return "";
      let markdownString = "";
      if (typeof content === 'string') {
        markdownString = content;
      } else if (Array.isArray(content)) {
        markdownString = content.map(part => {
          if (part.type === 'text') {
            return part.text || '';
          } else if (part.type === 'image_url' && part.image_url?.url) {
            return `![Image](${part.image_url.url})`;
          } else if (part.type === 'input_audio' && part.input_audio?.data) {
            return `<audio controls src="data:audio/${part.input_audio.format};base64,${part.input_audio.data}"></audio>`;
          } else if (part.type === 'file' && part.file?.filename) {
            return `*📎 附件: ${part.file.filename}*`;
          }
          return '';
        }).join(' ');
      } else {
        markdownString = String(content);
      }
      return marked.parse(markdownString);
    };

    if (currentSystemPrompt.value && currentSystemPrompt.value.trim()) {
      const sysTocText = '系统提示词';
      const sysDotClass = 'system-dot';
      const sysMsgId = 'msg-system';
      tocContent += `
        <li class="timeline-item">
            <a href="#${sysMsgId}" class="timeline-dot ${sysDotClass}" aria-label="${sysTocText}">
                <span class="timeline-tooltip">${sysTocText}</span>
            </a>
        </li>`;

      bodyContent += `
            <div id="${sysMsgId}" class="message-wrapper align-left">
              <div class="header system-header"><strong>系统提示词</strong></div>
              <div class="message-body system-body">${DOMPurify.sanitize(marked.parse(currentSystemPrompt.value))}</div>
            </div>
          `;
    }

    chat_show.value.forEach((message, index) => {
      if (message.role === 'system') return;

      const isUser = message.role === 'user';
      const msgId = `msg-${index}`;

      let tocText = '';
      if (isUser) tocText = truncate(formatMessageText(message.content), 30) || '用户发送图片/文件';
      else tocText = truncate(formatMessageText(message.content), 30) || 'AI 回复';

      let dotClass = isUser ? 'user-dot' : 'ai-dot';

      tocContent += `
        <li class="timeline-item">
            <a href="#${msgId}" class="timeline-dot ${dotClass}" aria-label="${tocText}">
                <span class="timeline-tooltip">${tocText}</span>
            </a>
        </li>`;

      let avatar = isUser ? UserAvart.value : AIAvart.value;
      if (!isUser) {
        if (avatar === 'ai.svg' || (!avatar.startsWith('http') && !avatar.startsWith('data:'))) {
          avatar = `data:image/svg+xml;base64,${btoa(defaultAiSvg)}`;
        }
      }

      let author = isUser ? '用户' : (message.aiName || 'AI');
      let time = message.timestamp || message.completedTimestamp;
      let alignClass = isUser ? 'align-right' : 'align-left';

      const processedHtml = processContentToHtml(message.content);
      let contentHtml = '';
      if (processedHtml && processedHtml.trim() !== '') {
        contentHtml = DOMPurify.sanitize(processedHtml, {
          ADD_TAGS: ['video', 'audio', 'source', 'blockquote'],
          USE_PROFILES: { html: true, svg: true },
          ADD_ATTR: ['style']
        });
      }

      let toolsHtml = '';
      if (message.tool_calls && message.tool_calls.length > 0) {
        toolsHtml = '<div class="tool-calls-wrapper">';
        message.tool_calls.forEach(tool => {
          const truncatedResult = truncate(tool.result, 100);
          const safeResult = truncatedResult.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          toolsHtml += `
                <div class="tool-call-box">
                    <span class="tool-icon">🛠️</span>
                    <span class="tool-name">${tool.name}</span>
                    <span class="tool-result">${safeResult}</span>
                </div>`;
        });
        toolsHtml += '</div>';
      }

      if (contentHtml || toolsHtml) {
        let headerHtml = '';
        if (isUser) {
          headerHtml = `
               <div class="header user-header">
                 <span class="timestamp">${time ? formatTimestamp(time) : ''}</span>
                 <img src="${avatar}" class="avatar" alt="avatar">
               </div>`;
        } else {
          headerHtml = `
               <div class="header ai-header">
                 <img src="${avatar}" class="avatar" alt="avatar">
                 <div class="ai-meta">
                    <div class="ai-name-row">
                        <strong>${author}</strong>
                        ${message.voiceName ? `<span class="voice-tag">(${message.voiceName})</span>` : ''}
                    </div>
                    <span class="timestamp">${time ? formatTimestamp(time) : ''}</span>
                 </div>
               </div>`;
        }

        const bodyHtml = contentHtml ? `<div class="message-body ${isUser ? 'user-body' : 'ai-body'}">${contentHtml}</div>` : '';

        bodyContent += `
            <div id="${msgId}" class="message-wrapper ${alignClass}">
              ${headerHtml}
              ${toolsHtml}
              ${bodyHtml}
            </div>
          `;
      }
    });

    const cssStyles = `
      <style>
        :root {
            --bg-color: #f7f7f7;
            --text-color: #333;
            --card-bg: #fff;
            --user-bg: #e1f5fe;
            --ai-bg: #fff;
            --border-color: #eee;
            --accent-color: #1F2937;
            --timeline-line: #e0e0e0;
            --timeline-dot-default: #bdbdbd;
            --timeline-dot-active: #1F2937;
        }
        @media (prefers-color-scheme: dark) {
          :root {
              --bg-color: #1a1a1a;
              --text-color: #e0e0e0;
              --card-bg: #2a2a2a;
              --user-bg: #0d47a1;
              --ai-bg: #3a3a3a;
              --border-color: #444;
              --accent-color: #64b5f6;
              --timeline-line: #444;
              --timeline-dot-default: #666;
              --timeline-dot-active: #64b5f6;
          }
        }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 20px; background-color: var(--bg-color); color: var(--text-color); line-height: 1.6; }
        .main-container { max-width: 900px; margin: 0 auto; background-color: var(--card-bg); border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); position: relative; }
        .page-header { margin-bottom: 40px; border-bottom: 1px solid var(--border-color); padding-bottom: 20px; }
        .page-header h1 { margin: 0 0 10px 0; font-size: 24px; }
        .page-header p { margin: 0; color: #888; font-size: 13px; }
        .timeline-toc {
            position: fixed;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            z-index: 100;
            max-height: 80vh;
            overflow-y: auto;
            scrollbar-width: none;
            padding: 10px;
        }
        .timeline-toc::-webkit-scrollbar { display: none; }
        .timeline-list {
            list-style: none;
            padding: 0;
            margin: 0;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
        }
        .timeline-list::before {
            content: '';
            position: absolute;
            top: 0;
            bottom: 0;
            left: 50%;
            width: 2px;
            background-color: var(--timeline-line);
            transform: translateX(-50%);
            z-index: -1;
            border-radius: 2px;
        }
        .timeline-item { position: relative; }
        .timeline-dot {
            display: block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: var(--card-bg);
            border: 2px solid var(--timeline-dot-default);
            transition: all 0.2s ease;
            position: relative;
        }
        .timeline-dot.user-dot {
            background-color: var(--timeline-dot-active);
            border-color: var(--timeline-dot-active);
            width: 12px;
            height: 12px;
        }
        .timeline-dot.ai-dot {
            border-color: var(--timeline-dot-default);
        }
        .timeline-dot.system-dot {
            border-color: #795548;
            background-color: #795548;
        }
        .timeline-dot:hover {
            transform: scale(1.4);
            border-color: var(--accent-color);
            background-color: var(--accent-color);
        }
        .timeline-tooltip {
            position: absolute;
            right: 25px;
            top: 50%;
            transform: translateY(-50%);
            background-color: var(--accent-color);
            color: #fff;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s, transform 0.2s;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .timeline-dot:hover .timeline-tooltip {
            opacity: 1;
            transform: translateY(-50%) translateX(-5px);
        }
        .message-wrapper { display: flex; flex-direction: column; margin-bottom: 30px; scroll-margin-top: 60px; max-width: 100%; }
        .align-right { align-items: flex-end; }
        .align-left { align-items: flex-start; }
        .header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; font-size: 12px; color: #888; }
        .user-header { flex-direction: row; }
        .ai-header { flex-direction: row; align-items: flex-start; }
        .avatar { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; background-color: #eee; flex-shrink: 0; }
        .ai-meta { display: flex; flex-direction: column; line-height: 1.3; }
        .ai-name-row { display: flex; align-items: center; gap: 5px; }
        .voice-tag { opacity: 0.8; font-size: 11px; }
        .message-body { padding: 12px 16px; border-radius: 12px; word-break: break-word; overflow-wrap: break-word; max-width: 100%; }
        .user-body { background-color: var(--user-bg); border-bottom-right-radius: 2px; color: var(--text-color); max-width: 90%; }
        .ai-body { background-color: var(--ai-bg); border: 1px solid var(--border-color); border-top-left-radius: 2px; width: 100%; box-sizing: border-box; }
        .system-body { background-color: #fff3e0; color: #5d4037; border: 1px dashed #d7ccc8; width: 100%; text-align: center; }
        .tool-calls-wrapper { width: 100%; margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
        .tool-call-box { background-color: var(--bg-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 12px; color: #666; display: flex; align-items: center; gap: 8px; }
        .tool-name { font-weight: bold; }
        .tool-result { opacity: 0.7; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        img { max-width: 100%; border-radius: 8px; margin: 5px 0; }
        pre { background-color: #2d2d2d; color: #f8f8f2; padding: 1em; border-radius: 8px; overflow-x: auto; font-family: monospace; }
        blockquote { border-left: 4px solid #ccc; padding-left: 1em; margin: 1em 0; color: #666; background: rgba(0,0,0,0.03); }
        @media (max-width: 768px) {
          .timeline-toc { display: none; }
          .main-container { padding: 20px; width: 100%; box-sizing: border-box; border-radius: 0; box-shadow: none; background-color: transparent; }
          .message-body { max-width: 100%; }
          .user-body { max-width: 95%; }
          body { padding: 0; }
        }
      </style>
    `;

    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>聊天记录: ${CODE.value} (${timestamp})</title>
        ${cssStyles}
      </head>
      <body>
        <nav class="timeline-toc">
            <ul class="timeline-list">
                ${tocContent}
            </ul>
        </nav>
        <div class="main-container">
            <header class="page-header">
                <h1>${CODE.value}</h1>
                <p>模型: ${modelMap.value[model.value] || 'N/A'} &bull; 导出时间: ${timestamp}</p>
            </header>
            <div class="chat-container">
                ${bodyContent}
            </div>
        </div>
      </body>
      </html>
    `;
  };

  try {
    await ElMessageBox({
      title: '保存为 HTML',
      message: () => h('div', null, [
        h('p', { style: 'margin-bottom: 15px; font-size: 14px; color: var(--el-text-color-regular);' }, '请输入文件名。'),
        h(ElInput, {
          modelValue: inputValue.value,
          'onUpdate:modelValue': (val) => { inputValue.value = val; },
          placeholder: '文件名',
          ref: (elInputInstance) => {
            if (elInputInstance) {
              setTimeout(() => elInputInstance.focus(), 100);
            }
          },
          onKeydown: (event) => { if (event.key === 'Enter') { event.preventDefault(); document.querySelector('.filename-prompt-dialog .el-message-box__btns .el-button--primary')?.click(); } }
        },
          { append: () => h('div', { class: 'input-suffix-display' }, '.html') })]),
      showCancelButton: true, confirmButtonText: '保存', cancelButtonText: '取消', customClass: 'filename-prompt-dialog',
      beforeClose: async (action, instance, done) => {
        if (action === 'confirm') {
          let finalBasename = inputValue.value.trim();
          if (!finalBasename) { showDismissibleMessage.error('文件名不能为空'); return; }
          if (finalBasename.toLowerCase().endsWith('.html')) finalBasename = finalBasename.slice(0, -5);
          const finalFilename = finalBasename + '.html';
          instance.confirmButtonLoading = true;
          try {
            const htmlContent = await generateHtmlContent();
            await window.api.saveFile({ title: '保存为 HTML', defaultPath: finalFilename, buttonLabel: '保存', filters: [{ name: 'HTML 文件', extensions: ['html'] }, { name: '所有文件', extensions: ['*'] }], fileContent: htmlContent });
            showDismissibleMessage.success('HTML 文件已成功导出！');
            done();
          } catch (error) {
            if (!error.message.includes('User cancelled') && !error.message.includes('用户取消')) { console.error('保存 HTML 失败:', error); showDismissibleMessage.error(`保存失败: ${error.message}`); }
            done();
          } finally { instance.confirmButtonLoading = false; }
        } else { done(); }
      }
    });
  } catch (error) { if (error !== 'cancel' && error !== 'close') console.error('MessageBox error:', error); }
};

const persistSessionToLocalJsonFile = async (baseName = defaultConversationName.value, options = {}) => {
  const localChatPath = currentConfig.value.webdav?.localChatPath;
  const normalizedBaseName = typeof baseName === 'string' ? baseName.trim() : '';

  if (!localChatPath || !normalizedBaseName) {
    return false;
  }

  const separator = currentOS.value === 'win' ? '\\' : '/';
  const sessionData = getSessionDataAsObject({ title: typeof options?.title === 'string' ? options.title : normalizedBaseName });
  const jsonString = JSON.stringify(sessionData, null, 2);
  const fullPath = `${localChatPath}${separator}${normalizedBaseName}.json`;

  await window.api.writeLocalFile(fullPath, jsonString);
  return true;
};


const saveSessionAsJson = async () => {
  const defaultBasename = defaultConversationName.value || buildConversationTimestampedBasename(CODE.value || 'AI', { force: false, includeCode: false });
  const inputValue = ref(defaultBasename);
  const isAutoNaming = ref(false);
  const canUseAutoNaming = isConfiguredFastModelAvailable(currentConfig.value?.defaultFastModel);
  const handleManualAutoNaming = createManualAutoNamingHandler({
    inputValue,
    isAutoNaming,
    uniqueDirPath: currentConfig.value?.webdav?.localChatPath || '',
    fallbackBasename: defaultBasename
  });
  const projectsData = await loadProjectsForScope('local');
  const selectedProjectId = ref(findProjectIdByFilename(projectsData, `${defaultBasename}.json`));
  try {
    await ElMessageBox({
      title: '保存为 JSON',
      message: () => h('div', null, [
        renderFilenamePromptTitleRow({
          text: '请输入文件名。',
          canUseAutoNaming,
          isAutoNaming,
          onClick: handleManualAutoNaming
        }),
        h(ElInput, {
          modelValue: inputValue.value,
          'onUpdate:modelValue': (val) => { inputValue.value = val; },
          placeholder: '文件名',
          ref: (elInputInstance) => {
            if (elInputInstance) {
              setTimeout(() => elInputInstance.focus(), 100);
            }
          },
          onKeydown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              document.querySelector('.filename-prompt-dialog .el-message-box__btns .el-button--primary')?.click();
            }
          }
        },
          { append: () => h('div', { class: 'input-suffix-display' }, '.json') }),
        renderProjectSelectRow({ projects: projectsData.projects, selectedProjectId })]),
      showCancelButton: true, confirmButtonText: '保存', cancelButtonText: '取消', customClass: 'filename-prompt-dialog',
      beforeClose: async (action, instance, done) => {
        if (action === 'confirm') {
          let finalBasename = inputValue.value.trim();
          if (!finalBasename) { showDismissibleMessage.error('文件名不能为空'); return; }
          if (finalBasename.toLowerCase().endsWith('.json')) finalBasename = finalBasename.slice(0, -5);
          const finalFilename = finalBasename + '.json';
          instance.confirmButtonLoading = true;
          try {
            const localChatPath = currentConfig.value.webdav?.localChatPath;

            // 优化逻辑：如果有本地路径，直接写入；否则弹出保存框
            if (localChatPath) {
              await persistSessionToLocalJsonFile(finalBasename, { title: finalBasename });
              // 更新项目归属（仅在已配置本地路径时维护 projects.yaml）
              try {
                const oldFilename = defaultConversationName.value ? `${defaultConversationName.value}.json` : '';
                const removeFilenames = oldFilename && oldFilename !== finalFilename ? [oldFilename] : [];
                const projectName = projectsData.projects.find((p) => p.id === selectedProjectId.value)?.name || '';
                await reassignLocalProject({
                  projectId: selectedProjectId.value,
                  projectName,
                  addFilename: finalFilename,
                  removeFilenames
                });
              } catch (projectError) {
                console.warn('[projects] 更新本地项目归属失败:', projectError);
              }
            } else {
              // 未配置路径，弹出系统选择框
              const sessionData = getSessionDataAsObject({ title: finalBasename });
              const jsonString = JSON.stringify(sessionData, null, 2);
              await window.api.saveFile({
                title: '保存聊天会话',
                defaultPath: finalFilename,
                buttonLabel: '保存',
                filters: [{ name: 'JSON 文件', extensions: ['json'] }, { name: '所有文件', extensions: ['*'] }],
                fileContent: jsonString
              });
            }

            defaultConversationName.value = finalBasename;
            showDismissibleMessage.success('会话已成功保存！');
            done();
          } catch (error) {
            if (!error.message.includes('canceled by the user') && !error.message.includes('用户取消')) {
              console.error('保存会话失败:', error);
              showDismissibleMessage.error(`保存失败: ${error.message}`);
            }
            done();
          } finally { instance.confirmButtonLoading = false; }
        } else { done(); }
      }
    });
  } catch (error) { if (error !== 'cancel' && error !== 'close') console.error('MessageBox error:', error); }
};

// 重命名当前会话逻辑

const renameRemoteSessionFileWithMetadata = async (client, remoteDir, oldFilename, newFilename) => {
  const normalizedRemoteDir = String(remoteDir || '').endsWith('/') ? String(remoteDir).slice(0, -1) : String(remoteDir || '');
  const oldRemotePath = `${normalizedRemoteDir}/${oldFilename}`;
  const newRemotePath = `${normalizedRemoteDir}/${newFilename}`;
  const nextTitle = newFilename.toLowerCase().endsWith('.json') ? newFilename.slice(0, -5) : newFilename;
  const metadata = await reconcileWindowCloudChatMetadata(client, normalizedRemoteDir);
  const previousEntry = metadata.chats[oldFilename] ? { ...metadata.chats[oldFilename] } : null;

  await client.moveFile(oldRemotePath, newRemotePath);

  try {
    const content = await client.getFileContents(newRemotePath, { format: 'text' });
    const sessionData = JSON.parse(typeof content === 'string' ? content : String(content));
    if (sessionData && sessionData.anywhere_history === true && typeof sessionData === 'object') {
      const sessionMetadata =
        sessionData.sessionMetadata && typeof sessionData.sessionMetadata === 'object'
          ? sessionData.sessionMetadata
          : {};

      if ((sessionMetadata.title || '').trim() !== nextTitle) {
        sessionData.sessionMetadata = {
          ...sessionMetadata,
          title: nextTitle
        };
        await client.putFileContents(newRemotePath, JSON.stringify(sessionData, null, 2), { overwrite: true });
      }
    }
  } catch {
    // ignore remote title sync failure; YAML metadata is still updated below
  }

  delete metadata.chats[oldFilename];
  if (newFilename.toLowerCase().endsWith('.json')) {
    metadata.chats[newFilename] = window.api.normalizeChatMetadataEntry(newFilename, {
      ...(previousEntry || {}),
      title: nextTitle
    });
  }
  await writeCloudChatMetadataIndex(client, normalizedRemoteDir, metadata);
};


const handleRenameSession = async () => {
  if (autoCloseOnBlur.value) handleTogglePin(); // 暂停失焦关闭，防止弹窗时窗口消失

  const localPath = currentConfig.value.webdav?.localChatPath;
  if (!localPath) {
    showDismissibleMessage.error('请先在设置中配置本地对话路径');
    return;
  }
  if (!defaultConversationName.value) {
    showDismissibleMessage.warning('当前对话尚未保存，无法重命名');
    return;
  }

  const oldBaseName = defaultConversationName.value;
  const oldFilename = `${oldBaseName}.json`;
  // 简单拼接路径，electron/node 环境下通常能正确处理
  const oldFilePath = `${localPath}/${oldFilename}`;
  const inputValue = ref(oldBaseName);
  const projectsData = await loadProjectsForScope('local');
  const originalProjectId = findProjectIdByFilename(projectsData, oldFilename);
  const selectedProjectId = ref(originalProjectId);

  try {
    await ElMessageBox({
      title: '重命名对话',
      message: () => h('div', null, [
        renderFilenamePromptTitleRow({
          text: '请输入新的会话名称',
          canUseAutoNaming: false,
          isAutoNaming: null,
          onClick: null
        }),
        h(ElInput, {
          modelValue: inputValue.value,
          'onUpdate:modelValue': (val) => { inputValue.value = val; },
          placeholder: '会话名称',
          ref: (elInputInstance) => {
            if (elInputInstance) {
              setTimeout(() => elInputInstance.focus(), 100);
            }
          },
          onKeydown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              document.querySelector('.filename-prompt-dialog .el-message-box__btns .el-button--primary')?.click();
            }
          }
        }),
        renderProjectSelectRow({ projects: projectsData.projects, selectedProjectId })
      ]),
      showCancelButton: true,
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      customClass: 'filename-prompt-dialog',
      beforeClose: async (action, instance, done) => {
        if (action !== 'confirm') {
          done();
          return;
        }

        let newBaseName = (inputValue.value || '').trim();
        if (!newBaseName) {
          showDismissibleMessage.error('名称不能为空');
          return;
        }
        if (/[\\/:*?"<>|]/.test(newBaseName)) {
          showDismissibleMessage.error('文件名包含非法字符');
          return;
        }
        if (newBaseName.toLowerCase().endsWith('.json')) newBaseName = newBaseName.slice(0, -5);
        if (!newBaseName) {
          showDismissibleMessage.error('名称不能为空');
          return;
        }

        const projectChanged = selectedProjectId.value !== originalProjectId;
        if (newBaseName === oldBaseName) {
          // 名称未变，仅在项目归属变化时更新 projects.yaml
          if (projectChanged) {
            instance.confirmButtonLoading = true;
            try {
              const projectName = projectsData.projects.find((p) => p.id === selectedProjectId.value)?.name || '';
              await reassignLocalProject({
                projectId: selectedProjectId.value,
                projectName,
                addFilename: oldFilename,
                removeFilenames: []
              });
              showDismissibleMessage.success('项目归属已更新');
            } catch (projectError) {
              console.warn('[projects] 更新本地项目归属失败:', projectError);
              showDismissibleMessage.error('更新项目归属失败');
            } finally {
              instance.confirmButtonLoading = false;
            }
          }
          done();
          return;
        }

        const newFilename = `${newBaseName}.json`;
        const newFilePath = `${localPath}/${newFilename}`;

        // 检查本地是否存在同名文件
        const files = await window.api.listJsonFiles(localPath);
        if (files.some(f => f.basename === newFilename)) {
          showDismissibleMessage.error(`文件名 "${newFilename}" 已存在，操作取消`);
          return;
        }

        instance.confirmButtonLoading = true;
        try {
          // 执行本地重命名
          await window.api.renameLocalFile(oldFilePath, newFilePath);
          defaultConversationName.value = newBaseName;
          // 同步更新项目归属：移除旧名，新名按所选项目归属
          try {
            const projectName = projectsData.projects.find((p) => p.id === selectedProjectId.value)?.name || '';
            await reassignLocalProject({
              projectId: selectedProjectId.value,
              projectName,
              addFilename: newFilename,
              removeFilenames: [oldFilename]
            });
          } catch (projectError) {
            console.warn('[projects] 重命名后更新本地项目归属失败:', projectError);
          }
          showDismissibleMessage.success('本地重命名成功');
          done();

          // 尝试同步重命名云端文件
          const { url, username, password, data_path } = currentConfig.value.webdav || {};
          if (url && data_path) {
            try {
              const client = createClient(url, { username, password });
              const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
              const oldRemotePath = `${remoteDir}/${oldFilename}`;

              // 检查云端是否存在该文件
              if (await client.exists(oldRemotePath)) {
                await ElMessageBox.confirm(
                  '云端也存在同名文件，是否同步重命名？',
                  '同步操作提示',
                  { confirmButtonText: '是', cancelButtonText: '否', type: 'info' }
                );
                await renameRemoteSessionFileWithMetadata(client, remoteDir, oldFilename, newFilename);
                showDismissibleMessage.success('云端同步重命名成功');
              }
            } catch (e) {
              if (e !== 'cancel' && e !== 'close') {
                console.warn('Cloud rename skipped:', e);
              }
            }
          }
        } catch (error) {
          showDismissibleMessage.error(`操作失败: ${error.message}`);
        } finally {
          instance.confirmButtonLoading = false;
        }
      }
    });
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      showDismissibleMessage.error(`操作失败: ${error.message}`);
    }
  }
};

const saveSessionAsImage = async () => {
  const now = new Date();
  const fileTimestamp = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const defaultBasename = defaultConversationName.value || `${CODE.value || 'AI'}-${fileTimestamp}`;
  const inputValue = ref(defaultBasename);

  try {
    await ElMessageBox({
      title: '保存为图片',
      message: () => h('div', null, [
        h('p', { style: 'margin-bottom: 15px; font-size: 14px; color: var(--el-text-color-regular);' }, '请输入文件名。'),
        h(ElInput, {
          modelValue: inputValue.value,
          'onUpdate:modelValue': (val) => { inputValue.value = val; },
          placeholder: '文件名',
          ref: (elInputInstance) => {
            if (elInputInstance) {
              setTimeout(() => elInputInstance.focus(), 100);
            }
          },
          onKeydown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              document.querySelector('.filename-prompt-dialog .el-message-box__btns .el-button--primary')?.click();
            }
          }
        },
          { append: () => h('div', { class: 'input-suffix-display' }, '.png') })]),
      showCancelButton: true, confirmButtonText: '保存', cancelButtonText: '取消', customClass: 'filename-prompt-dialog',
      beforeClose: async (action, instance, done) => {
        if (action === 'confirm') {
          let finalBasename = inputValue.value.trim();
          if (!finalBasename) { showDismissibleMessage.error('文件名不能为空'); return; }
          const finalFilename = finalBasename + '.png';
          instance.confirmButtonLoading = true;

          // 还原最开始的消息提示，不作更改
          const loadingMsg = ElMessage.info({ message: '正在生成长图，请稍候...', duration: 0 });

          try {
            const chatMain = chatContainerRef.value.$el;

            const html2canvas = await loadHtml2Canvas();
            const messageNodes = Array.from(chatMain.querySelectorAll('.chat-message'));

            const computedStyle = getComputedStyle(document.documentElement);
            let themeBgColor = computedStyle.getPropertyValue('--el-bg-color').trim();
            if (!themeBgColor || themeBgColor === 'transparent' || themeBgColor === 'rgba(0, 0, 0, 0)') {
              const isDark = document.documentElement.classList.contains('dark');
              themeBgColor = isDark ? '#212121' : '#FFFFFD';
            }

            const targetWidth = Math.max(chatMain.clientWidth, 800);

            // 1. 创建离线渲染容器
            const renderWrapper = document.createElement('div');
            renderWrapper.style.cssText = `
              position: absolute; top: -10000px; left: 0;
              width: ${targetWidth}px;
              padding: 0 10px; /* 模拟原容器边距 */
              box-sizing: border-box;
              background: transparent;
              z-index: -9999;
            `;
            chatMain.appendChild(renderWrapper);

            // ================== 分组分块渲染 ==================
            const chunkDataUrls = [];
            const CHUNK_SIZE = 8;

            for (let i = 0; i < messageNodes.length; i += CHUNK_SIZE) {
              const chunkNodes = messageNodes.slice(i, i + CHUNK_SIZE);
              const chunkContainer = document.createElement('div');
              chunkContainer.style.display = 'flex';
              chunkContainer.style.flexDirection = 'column';

              const chunkImages = [];

              for (const node of chunkNodes) {
                const clone = node.cloneNode(true);
                const footer = clone.querySelector('.message-footer');
                if (footer) footer.remove();

                // 解除 Markdown 容器高度限制，防止排版截断
                const restrictSelectors = ['.markdown-wrapper', '.elx-xmarkdown-container', 'pre', '.table-scroll-wrapper'];
                restrictSelectors.forEach(sel => {
                  clone.querySelectorAll(sel).forEach(el => {
                    el.style.display = 'block';
                    el.style.height = 'auto';
                    el.style.maxHeight = 'none';
                    el.style.overflow = 'visible';
                  });
                });

                // 强制关闭图片的懒加载机制，解决底部图片发白的问题
                const images = Array.from(clone.querySelectorAll('img'));
                images.forEach(img => {
                  img.removeAttribute('loading');
                  img.setAttribute('loading', 'eager');
                  img.decoding = 'sync';
                  const currentSrc = img.src;
                  img.src = '';
                  img.src = currentSrc;
                  chunkImages.push(img);
                });

                chunkContainer.appendChild(clone);
              }

              renderWrapper.innerHTML = '';
              renderWrapper.appendChild(chunkContainer);

              // 严格等待本组图片加载完毕
              await Promise.all(chunkImages.map(img => {
                if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
                return new Promise(resolve => {
                  img.onload = resolve;
                  img.onerror = resolve;
                });
              }));

              await new Promise(r => setTimeout(r, 100)); // 让浏览器消化重绘队列

              // 生成透明底的局部碎片
              const msgCanvas = await html2canvas(renderWrapper, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
                scale: 2,
                logging: false
              });

              chunkDataUrls.push(msgCanvas.toDataURL('image/png'));
            }

            // ================== 上下拼接与背景合成 ==================
            renderWrapper.innerHTML = '';
            renderWrapper.style.padding = '0'; // 消除内边距避免组装缝隙

            const finalContainer = document.createElement('div');
            finalContainer.style.width = '100%';
            finalContainer.style.display = 'flex';
            finalContainer.style.flexDirection = 'column';

            // 完全还原最开始的背景渲染方案
            if (windowBackgroundImage.value) {
              finalContainer.style.backgroundImage = `url('${windowBackgroundImage.value}')`;
              finalContainer.style.backgroundSize = 'cover';
              finalContainer.style.backgroundPosition = 'center';
              finalContainer.style.backgroundRepeat = 'no-repeat';
              finalContainer.style.backgroundColor = themeBgColor;
            } else {
              finalContainer.style.background = themeBgColor;
            }

            // 将刚才分批截好的块无缝贴入大容器中
            for (const dataUrl of chunkDataUrls) {
              const img = document.createElement('img');
              img.src = dataUrl;
              img.style.width = '100%';
              img.style.height = 'auto';
              img.style.display = 'block';
              finalContainer.appendChild(img);
            }

            renderWrapper.appendChild(finalContainer);

            await new Promise(r => setTimeout(r, 200));

            // 进行快速合影
            const finalCanvas = await html2canvas(finalContainer, {
              useCORS: true,
              allowTaint: true,
              backgroundColor: themeBgColor,
              scale: 2,
              logging: false
            });

            chatMain.removeChild(renderWrapper);

            // 导出与保存
            const finalDataUrl = finalCanvas.toDataURL('image/png');
            const byteString = atob(finalDataUrl.split(',')[1]);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }

            await window.api.saveFile({
              title: '保存为图片',
              defaultPath: finalFilename,
              buttonLabel: '保存',
              filters: [{ name: 'PNG 图片', extensions: ['png'] }],
              fileContent: ia
            });
            loadingMsg.close();
            showDismissibleMessage.success('图片已成功导出！');
            done();
          } catch (error) {
            loadingMsg.close();
            if (!error.message.includes('canceled by the user') && !error.message.includes('用户取消')) {
              console.error('保存图片失败:', error);
              showDismissibleMessage.error(`保存失败: ${error.message}`);
            }
            // 出错时清理残留节点
            const orphans = document.querySelectorAll('div[style*="z-index: -9999"]');
            orphans.forEach(el => el.remove());
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

  // 只有当已存在本地文件名（即已保存过）且配置了本地路径时，才显示重命名选项；请求中继续禁用重命名，避免路径竞态。
  if (currentConfig.value.webdav?.localChatPath && defaultConversationName.value) {
    saveOptions.push({
      title: '重命名对话',
      description: loading.value
        ? '当前 AI 仍在回复中，请等待本轮回复结束后再重命名，避免与自动保存路径产生竞态。'
        : '修改当前对话名称，并同步修改本地文件（以及云端文件）。',
      buttonType: 'warning',
      action: handleRenameSession,
      disabled: loading.value
    });
  }

  if (isCloudEnabled) {
    saveOptions.push({ title: '保存到云端', description: '同步到 WebDAV 服务器，支持跨设备访问。', buttonType: 'success', action: saveSessionToCloud });
  }

  saveOptions.push({ title: '保存为 JSON', description: '保存为可恢复的会話文件，便于下次继续。', buttonType: 'primary', action: saveSessionAsJson, isDefault: true });
  saveOptions.push({ title: '保存为 Markdown', description: '导出为可读性更强的 .md 文件，适合分享。', buttonType: '', action: saveSessionAsMarkdown });
  saveOptions.push({ title: '保存为 HTML', description: '导出为带样式的网页文件，保留格式和图片。', buttonType: '', action: saveSessionAsHtml });
  saveOptions.push({ title: '保存为 图片', description: '将完整聊天记录保存为长图 (.png)。', buttonType: '', action: saveSessionAsImage });

  const messageVNode = h('div', { class: 'save-options-list' }, saveOptions.map(opt => {
    const trigger = () => {
      if (opt.disabled) return;
      ElMessageBox.close();
      opt.action();
    };

    return h('div', {
      class: ['save-option-item', opt.disabled ? 'is-disabled' : ''],
      onClick: trigger
    }, [
      h('div', { class: 'save-option-text' }, [
        h('h4', null, opt.title), h('p', null, opt.description)
      ]),
      h(ElButton, {
        type: opt.buttonType,
        plain: true,
        disabled: Boolean(opt.disabled),
        class: opt.isDefault ? 'default-save-target' : '',
        onClick: (e) => { e.stopPropagation(); trigger(); }
      }, { default: () => '选择' })
    ]);
  }));

  ElMessageBox({
    title: '',
    message: messageVNode,
    showConfirmButton: false,
    showCancelButton: false,
    customClass: 'save-options-dialog no-header-msgbox',
    width: '450px',
    showClose: false
  }).catch(() => { });

  setTimeout(() => {
    const targetBtn = document.querySelector('.default-save-target');
    if (targetBtn) {
      targetBtn.focus();
    }
  }, 100);
};

const loadSession = async (jsonData) => {
  loading.value = true;
  collapsedMessages.value.clear();
  messageRefs.clear();
  focusedMessageIndex.value = null;

  try {
    CODE.value = jsonData.CODE;
    document.title = CODE.value;
    basic_msg.value = jsonData.basic_msg;
    isInit.value = jsonData.isInit;
    autoCloseOnBlur.value = jsonData.autoCloseOnBlur;

    history.value = jsonData.history;
    chat_show.value = jsonData.chat_show;

    // 1. 清理 history 末尾因为程序异常中断残留的无效/空 assistant 节点
    while (
      history.value.length > 0 &&
      history.value[history.value.length - 1].role === 'assistant' &&
      !history.value[history.value.length - 1].content &&
      !(history.value[history.value.length - 1].tool_calls?.length > 0)
    ) {
      history.value.pop();
    }

    // 2. 强制对齐 chat_show 和 history
    // 计算 history 中能够在 UI 显示的节点数量（排除后台隐藏的 'tool' 角色）
    const visibleHistoryCount = history.value.filter(m => m.role !== 'tool').length;

    // 如果 UI 气泡多于真实历史记录 (通常是因为生成被打断或高频并发发送)，截断尾部脏气泡
    if (chat_show.value.length > visibleHistoryCount) {
      console.warn(`[Auto-Heal] 检测到 UI 节点冗余，自动清理了 ${chat_show.value.length - visibleHistoryCount} 条异常显示节点。`);
      chat_show.value.splice(visibleHistoryCount);
    }
    // 如果 UI 气泡少于真实历史记录 (通常是因为旧版本 Bug 导致的历史污染)，反向截断真实的 history
    else if (chat_show.value.length < visibleHistoryCount) {
      let visibleCount = 0;
      let cutIndex = history.value.length;
      for (let i = 0; i < history.value.length; i++) {
        if (history.value[i].role !== 'tool') {
          visibleCount++;
        }
        if (visibleCount > chat_show.value.length) {
          cutIndex = i;
          break;
        }
      }
      if (cutIndex < history.value.length) {
        console.warn(`[Auto-Heal] 检测到历史记录污染，自动修复了状态。`);
        history.value.splice(cutIndex);
      }
    }

    selectedVoice.value = jsonData.selectedVoice || '';
    tempReasoningEffort.value = jsonData.currentPromptConfig?.reasoning_effort || 'default';
    isAutoApproveTools.value = jsonData.isAutoApproveTools || true;
    taskList.value = Array.isArray(jsonData.taskList) ? normalizeTaskList(jsonData.taskList) : [];
    taskPanelVisible.value = false;
    pendingAppendBuffer.value = [];

    const configData = await window.api.getConfig();
    currentConfig.value = configData.config;

    zoomLevel.value = resolveWindowZoomLevel(
      jsonData.currentPromptConfig?.zoom,
      currentConfig.value.prompts?.[CODE.value]?.zoom,
      currentConfig.value.zoom,
      1
    );
    if (window.api && typeof window.api.setZoomFactor === 'function') window.api.setZoomFactor(zoomLevel.value);

    if (currentConfig.value.isDarkMode) { document.documentElement.classList.add('dark'); }
    else { document.documentElement.classList.remove('dark'); }

    const currentPromptConfigFromLoad = jsonData.currentPromptConfig || currentConfig.value.prompts[CODE.value];
    if (currentPromptConfigFromLoad && currentPromptConfigFromLoad.icon) {
      AIAvart.value = currentPromptConfigFromLoad.icon;
      favicon.value = currentPromptConfigFromLoad.icon;
    } else {
      AIAvart.value = "ai.svg";
      favicon.value = "favicon.png";
    }

    updateModelListAndMap(currentConfig.value);

    let restoredModel = '';
    if (jsonData.model && modelMap.value[jsonData.model]) restoredModel = jsonData.model;
    else if (jsonData.currentPromptConfig?.model && modelMap.value[jsonData.currentPromptConfig.model]) restoredModel = jsonData.currentPromptConfig.model;
    else {
      const currentPromptConfig = currentConfig.value.prompts[CODE.value];
      restoredModel = (currentPromptConfig?.model && modelMap.value[currentPromptConfig.model]) ? currentPromptConfig.model : (modelList.value[0]?.value || '');
    }
    model.value = restoredModel;

    if (jsonData.activeSkillIds && Array.isArray(jsonData.activeSkillIds)) {
      sessionSkillIds.value = [...jsonData.activeSkillIds];
      tempSessionSkillIds.value = [...jsonData.activeSkillIds];
    } else {
      sessionSkillIds.value = [];
      tempSessionSkillIds.value = [];
    }

    if (chat_show.value && chat_show.value.length > 0) {
      chat_show.value.forEach(msg => { if (msg.id === undefined) msg.id = messageIdCounter.value++; });
      const maxId = Math.max(...chat_show.value.map(m => m.id || 0));
      messageIdCounter.value = maxId + 1;
    }

    const systemMessageIndex = history.value.findIndex(m => m.role === 'system');
    if (systemMessageIndex !== -1) {
      currentSystemPrompt.value = history.value[systemMessageIndex].content;

      if (!chat_show.value[systemMessageIndex] || chat_show.value[systemMessageIndex].role !== 'system') {
        chat_show.value.unshift({
          role: "system",
          content: currentSystemPrompt.value,
          id: messageIdCounter.value++
        });
      }

    } else if (currentConfig.value.prompts[CODE.value]?.prompt) {
      currentSystemPrompt.value = currentConfig.value.prompts[CODE.value].prompt;
      history.value.unshift({ role: "system", content: currentSystemPrompt.value });
      chat_show.value.unshift({
        role: "system",
        content: currentSystemPrompt.value,
        id: messageIdCounter.value++
      });
    } else {
      currentSystemPrompt.value = "";
      if (chat_show.value.length > 0 && chat_show.value[0].role === 'system') {
        chat_show.value.shift();
      }
    }

    if (model.value) {
      currentProviderID.value = model.value.split("|")[0];
      const provider = currentConfig.value.providers[currentProviderID.value];
      base_url.value = provider?.url;
      api_key.value = provider?.api_key;
    } else {
      showDismissibleMessage.error("没有可用的模型。请检查您的服务商配置。");
      loading.value = false;
      return;
    }

    loading.value = false;
    await nextTick();
    scrollToBottom();

    let mcpServersToLoad = [];
    if (jsonData.activeMcpServerIds && Array.isArray(jsonData.activeMcpServerIds)) {
      mcpServersToLoad = jsonData.activeMcpServerIds;
    } else {
      mcpServersToLoad = jsonData.currentPromptConfig?.defaultMcpServers || [];
    }

    if (sessionSkillIds.value.length > 0 && currentConfig.value.mcpServers) {
      const builtinIds = Object.entries(currentConfig.value.mcpServers)
        .filter(([, server]) => server.type === 'builtin')
        .map(([id]) => id);
      mcpServersToLoad = [...new Set([...mcpServersToLoad, ...builtinIds])];
    }

    const validMcpServerIds = mcpServersToLoad.filter(id =>
      currentConfig.value.mcpServers && currentConfig.value.mcpServers[id]
    );

    if (validMcpServerIds.length > 0) {
      sessionMcpServerIds.value = [...validMcpServerIds];
      tempSessionMcpServerIds.value = [...validMcpServerIds];
      requestApplyMcpTools(false, 'config-or-session-sync');
    } else {
      sessionMcpServerIds.value = [];
      tempSessionMcpServerIds.value = [];
      requestApplyMcpTools(false, 'config-or-session-sync');
    }

  } catch (error) {
    console.error("加载会话失败:", error);
    showDismissibleMessage.error(`加载会话失败: ${error.message}`);
    loading.value = false;
  }
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
    if (!window.api.isFileTypeSupported(file.name)) {
      const errorMsg = `不支持的文件类型: ${file.name}`;
      showDismissibleMessage.warning(errorMsg);
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
      showDismissibleMessage.error(errorMsg);
      reject(new Error(errorMsg));
    }
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
  let contentList = [];
  if (fileList.value.length === 0) return contentList;

  for (const currentFile of fileList.value) {
    try {
      const processedContent = await window.api.parseFileObject({
        name: currentFile.name,
        url: currentFile.url
      });

      if (processedContent) {
        contentList.push(processedContent);
      }
    } catch (error) {
      if (error.message.includes('不支持的文件类型')) {
        showDismissibleMessage.warning(error.message);
      } else {
        showDismissibleMessage.error(`处理文件 ${currentFile.name} 失败: ${error.message}`);
      }
    }
  }

  fileList.value = [];
  return contentList;
};


const isApplyMcpRunning = ref(false);
const pendingApplyMcpRequest = ref(null);

const requestApplyMcpTools = async (show_none = true, reason = 'unknown') => {
  pendingApplyMcpRequest.value = {
    show_none: show_none !== false,
    reason: typeof reason === 'string' && reason ? reason : 'unknown'
  };

  if (isApplyMcpRunning.value) {
    return;
  }

  isApplyMcpRunning.value = true;
  try {
    while (pendingApplyMcpRequest.value) {
      const currentRequest = pendingApplyMcpRequest.value;
      pendingApplyMcpRequest.value = null;
      await applyMcpTools(currentRequest.show_none, currentRequest.reason);
    }
  } finally {
    isApplyMcpRunning.value = false;
  }
};

async function applyMcpTools(show_none = true, reason = 'unknown') {
  isMcpDialogVisible.value = false;
  isMcpLoading.value = true;
  await nextTick();

  const activeServerConfigs = {};
  const serverIdsToLoad = [...sessionMcpServerIds.value];
  console.log('[Plugin Window MCP] applying tools', { reason, show_none, serverIdsToLoad });

  for (const id of serverIdsToLoad) {
    if (currentConfig.value.mcpServers[id]) {
      const serverConf = currentConfig.value.mcpServers[id];
      activeServerConfigs[id] = {
        transport: serverConf.type,
        command: serverConf.command,
        args: serverConf.args,
        url: serverConf.baseUrl,
        env: serverConf.env,
        headers: serverConf.headers,
        timeoutSeconds: serverConf.timeoutSeconds,
        isPersistent: serverConf.isPersistent,
        auth: serverConf.auth,
      };
    }
  }

  try {
    const {
      openaiFormattedTools: newFormattedTools,
      successfulServerIds,
      failedServerIds
    } = await window.api.initializeMcpClient(activeServerConfigs);

    openaiFormattedTools.value = newFormattedTools;
    sessionMcpServerIds.value = successfulServerIds;
    lastAppliedMcpConfigFingerprint.value = buildSelectedMcpConfigFingerprint(successfulServerIds, currentConfig.value?.mcpServers || {});

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
    } else if (serverIdsToLoad.length === 0 && show_none) {
      showDismissibleMessage.info('已清除所有 MCP 工具');
    }

  } catch (error) {
    console.error("Failed to initialize MCP tools:", error);
    showDismissibleMessage.error(`加载MCP工具失败: ${error.message}`);
    openaiFormattedTools.value = [];
    sessionMcpServerIds.value = [];
    lastAppliedMcpConfigFingerprint.value = buildSelectedMcpConfigFingerprint([], currentConfig.value?.mcpServers || {});
  } finally {
    isMcpLoading.value = false;
  }
}

function clearMcpTools() {
  tempSessionMcpServerIds.value = [];
}

function selectAllMcpServers() {
  const allVisibleIds = filteredMcpServers.value.map(server => server.id);
  const selectedIdsSet = new Set(tempSessionMcpServerIds.value);
  allVisibleIds.forEach(id => selectedIdsSet.add(id));
  tempSessionMcpServerIds.value = Array.from(selectedIdsSet);
}


async function toggleMcpDialog() {
  if (!isMcpDialogVisible.value) {
    try {
      const result = await window.api.getConfig();

      if (result && result.config && result.config.mcpServers) {
        const newMcpServers = result.config.mcpServers;
        const currentLocalMcpServers = currentConfig.value.mcpServers || {};

        sessionMcpServerIds.value.forEach(activeId => {
          if (!newMcpServers[activeId] && currentLocalMcpServers[activeId]) {
            newMcpServers[activeId] = currentLocalMcpServers[activeId];
          }
        });

        currentConfig.value.mcpServers = newMcpServers;
      }
      mcpToolCache.value = await window.api.getMcpToolCache() || {};

    } catch (error) {
      console.error("Auto refresh MCP config failed:", error);
    }

    tempSessionMcpServerIds.value = [...sessionMcpServerIds.value];
  }
  isMcpDialogVisible.value = !isMcpDialogVisible.value;
}

async function toggleMcpPersistence(serverId, isPersistent) {
  if (!currentConfig.value.mcpServers[serverId]) return;

  const keyPath = `mcpServers.${serverId}.isPersistent`;
  try {
    const result = await window.api.saveSetting(keyPath, isPersistent);
    if (result && result.success) {
      currentConfig.value.mcpServers[serverId].isPersistent = isPersistent;
      showDismissibleMessage.success(`'${currentConfig.value.mcpServers[serverId].name}' 的持久化设置已更新`);
    } else {
      throw new Error(result?.message || '保存设置到数据库失败');
    }
  } catch (error) {
    console.error("Failed to save MCP persistence setting:", error);
    showDismissibleMessage.error("保存持久化设置失败");
  }
}

const getSystemTime = () => {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const weekDay = days[now.getDay()];

  return `${year}-${month}-${day} (${weekDay})`;
}

const generateMcpSystemPrompt = () => {
  return `
## SYSTEM CONTEXT
Current Time: **${getSystemTime()}**
Platform：**${currentOS.value}**

Always use this timestamp as your reference for "today", "now", "current", or relative dates (e.g., "yesterday", "next week").

## Tool Use Rules
Here are the rules you should always follow to solve your task:
1. Always use the right arguments for the tools. Never use variable names as the action arguments, use the value instead.
2. Call a tool only when needed. If no tool call is needed, just answer the question directly.
3. Never re-do a tool call that you previously did with the exact same parameters.
4. **Synthesis**: Must always synthesize the tool output into valuable, easily understandable information from the user's perspective.
5.  **Strict Multimedia Formatting Norms**: In all circumstances, the display format for multimedia content (images, videos, audio) must comply with the following specifications, and **must not** be contained within code blocks (\`\`\`):
    *   **Image (Markdown)**: \`![Content Description](Image Link)\`
    *   **Video (HTML)**:
        \`\`\`html
        <video controls="" style="max-width: 80%; max-height: 400px; height: auto; width: auto; display: block;"><source src="Video Link URL" type="video/mp4">Your browser does not support video playback.</video>
        \`\`\`
    *   **Audio (HTML)**:
        \`\`\`html
        <audio class="chat-audio-player" controls="" preload="none">
          <source id="Audio Format" src="Audio Link URL">
        </audio>
        \`\`\`
6. **Language**: All Respond must be in the user's language
7. **Security & Safety**: Tools must be executed securely, and the invocation of any commands that could lead to system damage, data loss, or sensitive privacy disclosure is strictly prohibited.
    1.  **Comprehensive Risk Assessment**: Identify whether the operation involves sensitive data or irreversible data modification.
    2.  **Mandatory Warning Prompts**: For any risky operation, clear and detailed warnings must be issued to the user before execution, explaining potential consequences (e.g., exposure of sensitive information, data loss).
    3.  **Seek Explicit Confirmation**: Before executing irreversible or high-risk operations (e.g., deleting files, reading sensitive files), explicit secondary confirmation from the user must be required.
`;
};



const shouldBackfillAssistantReasoningContent = (reasoningEffort) => {
  return typeof reasoningEffort === 'string' && !['', 'default', 'none'].includes(reasoningEffort);
};

const ensureAssistantReasoningContentForThinkingMode = (messages = [], reasoningEffort) => {
  if (!Array.isArray(messages) || !shouldBackfillAssistantReasoningContent(reasoningEffort)) {
    return messages;
  }

  messages.forEach(msg => {
    if (msg?.role === 'assistant' && typeof msg.reasoning_content !== 'string') {
      msg.reasoning_content = '';
    }
  });

  return messages;
};


const isAsyncIterableResponse = (value) => {
  return value && typeof value[Symbol.asyncIterator] === 'function';
};


const collectChatCompletionStreamToMessage = async (streamLike) => {
  let aggregatedReasoningContent = '';
  let aggregatedContent = '';
  let aggregatedMedia = [];
  let aggregatedToolCalls = [];
  let aggregatedExtraContent = null;
  let aggregatedUsage = null;

  for await (const part of streamLike) {
    if (part?.usage) {
      aggregatedUsage = part.usage;
    }

    const delta = part?.choices?.[0]?.delta;
    if (!delta) continue;

    if (delta.extra_content) {
      aggregatedExtraContent = { ...aggregatedExtraContent, ...delta.extra_content };
    }
    if (delta.thought_signature) {
      aggregatedExtraContent = aggregatedExtraContent || {};
      aggregatedExtraContent.google = aggregatedExtraContent.google || {};
      aggregatedExtraContent.google.thought_signature = delta.thought_signature;
    }
    if (delta.reasoning_content || delta.reasoning) {
      aggregatedReasoningContent += delta.reasoning_content || delta.reasoning;
    }
    if (delta.content) {
      if (typeof delta.content === 'string') {
        aggregatedContent += delta.content;
      } else if (Array.isArray(delta.content)) {
        delta.content.forEach(item => {
          if (item?.type === 'text') {
            aggregatedContent += (item.text || '');
          } else if (item?.type === 'image_url') {
            aggregatedMedia.push(item);
          }
        });
      }
    }
    if (delta.tool_calls) {
      for (const toolCallChunk of delta.tool_calls) {
        const index = toolCallChunk.index ?? aggregatedToolCalls.length;
        if (!aggregatedToolCalls[index]) {
          aggregatedToolCalls[index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
        }
        const currentTool = aggregatedToolCalls[index];
        if (toolCallChunk.id) currentTool.id = toolCallChunk.id;
        if (toolCallChunk.function?.name) currentTool.function.name = toolCallChunk.function.name;
        if (toolCallChunk.function?.arguments) currentTool.function.arguments += toolCallChunk.function.arguments;
        if (toolCallChunk.extra_content) {
          currentTool.extra_content = { ...currentTool.extra_content, ...toolCallChunk.extra_content };
        }
      }
    }
  }

  let normalizedContent = aggregatedContent || null;
  if (aggregatedMedia.length > 0) {
    normalizedContent = [];
    if (aggregatedContent) normalizedContent.push({ type: 'text', text: aggregatedContent });
    normalizedContent.push(...aggregatedMedia);
  }

  const message = {
    role: 'assistant',
    content: normalizedContent,
    reasoning_content: aggregatedReasoningContent || null,
    extra_content: aggregatedExtraContent
  };

  const validToolCalls = aggregatedToolCalls.filter(tc => tc?.id && tc?.function?.name);
  if (validToolCalls.length > 0) {
    message.tool_calls = validToolCalls;
  }
  if (aggregatedUsage) {
    message.tokenUsage = normalizeAssistantTokenUsage(aggregatedUsage);
  }

  return message;
};

const normalizeToolsForRequest = (tools = []) => {
  const usedNames = new Set();
  return (Array.isArray(tools) ? tools : []).map((tool, index) => {
    if (!tool || tool.type !== 'function' || !tool.function) {
      return tool;
    }

    const clonedTool = JSON.parse(JSON.stringify(tool));
    const rawName = clonedTool.function.name;
    let safeName = sanitizeToolFunctionName(rawName, `tool_${index + 1}`);
    let suffix = 2;
    while (usedNames.has(safeName)) {
      safeName = `${sanitizeToolFunctionName(rawName, `tool_${index + 1}`)}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(safeName);
    clonedTool.function.name = safeName;
    return clonedTool;
  });
};

const normalizeAssistantTokenUsage = (usage) => {
  if (!usage || typeof usage !== 'object') return null;

  const promptTokens = Number.isFinite(Number(usage.prompt_tokens))
    ? Number(usage.prompt_tokens)
    : (Number.isFinite(Number(usage.input_tokens)) ? Number(usage.input_tokens) : null);
  const completionTokens = Number.isFinite(Number(usage.completion_tokens))
    ? Number(usage.completion_tokens)
    : (Number.isFinite(Number(usage.output_tokens)) ? Number(usage.output_tokens) : null);
  const reasoningTokens = Number.isFinite(Number(usage.reasoning_tokens))
    ? Number(usage.reasoning_tokens)
    : (Number.isFinite(Number(usage.completion_tokens_details?.reasoning_tokens))
      ? Number(usage.completion_tokens_details.reasoning_tokens)
      : (Number.isFinite(Number(usage.output_tokens_details?.reasoning_tokens))
        ? Number(usage.output_tokens_details.reasoning_tokens)
        : null));

  if (promptTokens === null && completionTokens === null) return null;

  const totalTokens = Number.isFinite(Number(usage.total_tokens)) ? Number(usage.total_tokens) : null;
  return {
    prompt_tokens: promptTokens ?? 0,
    completion_tokens: completionTokens ?? 0,
    reasoning_tokens: reasoningTokens ?? 0,
    total_tokens: totalTokens ?? ((promptTokens ?? 0) + (completionTokens ?? 0)),
    raw: usage
  };
};

const applyTokenUsageToAssistantMessage = (chatShowIndex, tokenUsage) => {
  const normalizedUsage = normalizeAssistantTokenUsage(tokenUsage);
  if (!normalizedUsage || chatShowIndex < 0) return null;

  const bubble = chat_show.value[chatShowIndex];
  if (bubble?.role === 'assistant') {
    bubble.tokenUsage = normalizedUsage;
  }
  return normalizedUsage;
};


// --- 追加消息缓冲区：loading 期间发送的消息暂存于此，本轮结束后自动追加并续请求 ---
const enqueueInputToBuffer = () => {
  const text = prompt.value.trim();
  const files = Array.isArray(fileList.value) ? fileList.value.slice() : [];
  if (!text && files.length === 0) return;
  pendingAppendBuffer.value.push({
    kind: 'input',
    text,
    files,
    preview: text || `[${files.length} 个文件]`
  });
  prompt.value = "";
  fileList.value = [];
  showDismissibleMessage.info('正在生成，消息已加入缓冲区，将在本轮结束后自动发送');
};

const removeBufferedMessage = (index) => {
  if (index >= 0 && index < pendingAppendBuffer.value.length) {
    pendingAppendBuffer.value.splice(index, 1);
  }
};

// 把当前输入框内容（prompt + fileList）构造为一条 user 消息追加进历史（不发起请求），返回是否追加成功
const appendCurrentInputToHistory = async () => {
  const file_content = await sendFile();
  const promptText = prompt.value.trim();
  if (!((file_content && file_content.length > 0) || promptText)) return false;
  const userContentList = [];
  if (promptText) userContentList.push({ type: "text", text: promptText });
  if (file_content && file_content.length > 0) userContentList.push(...file_content);
  if (userContentList.length === 0) return false;
  const userTimestamp = new Date().toLocaleString('sv-SE');
  const contentForHistory = userContentList.length === 1 && userContentList[0].type === 'text'
    ? userContentList[0].text
    : userContentList;
  history.value.push({ role: "user", content: contentForHistory });
  chat_show.value.push({ id: messageIdCounter.value++, role: "user", content: userContentList, timestamp: userTimestamp });
  scheduleAutoSave({ reason: 'user-message', immediate: true });
  prompt.value = "";
  return true;
};

const drainBufferIntoHistory = async () => {
  if (pendingAppendBuffer.value.length === 0) return false;
  const items = pendingAppendBuffer.value.splice(0, pendingAppendBuffer.value.length);
  // 还原用户在缓冲期间可能输入但尚未发送的内容
  const savedPrompt = prompt.value;
  const savedFiles = Array.isArray(fileList.value) ? fileList.value.slice() : [];
  let appendedAny = false;
  for (const item of items) {
    if (item.kind === 'input') {
      prompt.value = item.text || '';
      fileList.value = Array.isArray(item.files) ? item.files : [];
      isPreparingSend.value = true;
      try {
        const added = await appendCurrentInputToHistory();
        if (added) appendedAny = true;
      } finally {
        isPreparingSend.value = false;
      }
    }
  }
  prompt.value = savedPrompt;
  fileList.value = savedFiles;
  return appendedAny;
};

const flushAppendBuffer = async () => {
  if (loading.value || isPreparingSend.value) return;
  const appendedAny = await drainBufferIntoHistory();
  if (appendedAny) {
    await askAI(true);
  }
};

watch(loading, (now, prev) => {
  if (prev && !now) {
    nextTick(() => { flushAppendBuffer(); });
  }
});

const askAI = async (forceSend = false) => {
  if (loading.value || isPreparingSend.value) return;
  if (isMcpLoading.value) {
    showDismissibleMessage.info('正在加载工具，请稍后再试...');
    return;
  }

  // --- 1. 处理用户输入 ---
  if (!forceSend) {
    isPreparingSend.value = true;
    try {
      const added = await appendCurrentInputToHistory();
      if (!added) return;
    } finally {
      isPreparingSend.value = false;
    }
  }

  // --- 2. 初始化 AI 回合 ---
  loading.value = true;
  syncAutoCloseOnBlurListener();
  const turnId = activeAssistantTurnId.value + 1;
  activeAssistantTurnId.value = turnId;
  signalController.value = new AbortController();
  const requestAbortController = signalController.value;
  const requestSignal = requestAbortController.signal;
  const turnMeta = {
    id: turnId,
    controller: requestAbortController,
    assistantMessageId: null,
    cancellationRecorded: false,
    cancelledByUser: false
  };
  activeAssistantTurnMeta = turnMeta;
  const isCurrentAssistantTurn = () => activeAssistantTurnId.value === turnId && activeAssistantTurnMeta === turnMeta;
  const isTurnAborted = () => requestSignal.aborted || !isCurrentAssistantTurn();
  const throwIfTurnAborted = () => {
    if (isTurnAborted()) {
      throw createAbortError();
    }
  };

  const shouldTriggerAutoNaming = !defaultConversationName.value && chat_show.value.filter(msg => msg.role === 'user').length === 1;
  if (shouldTriggerAutoNaming) {
    triggerAutoNamingForFirstUserMessage({ force: false, requestSignal }).catch((error) => {
      if (error?.name !== 'AbortError') {
        console.warn('[Auto Naming] trigger failed:', error);
      }
    });
  }

  await nextTick();
  if (isTurnAborted()) return;

  if (isAtBottom.value) {
    isSticky.value = true;
    scrollToBottom('auto');
  }

  const currentPromptConfig = currentConfig.value.prompts[CODE.value];
  const isVoiceReply = !!selectedVoice.value;
  let useStream = (currentPromptConfig?.stream ?? true) && !isVoiceReply;
  let tool_calls_count = 0;

  // 获取当前服务商的 API 类型
  const currentProviderConfig = currentConfig.value.providers[currentProviderID.value];
  const apiType = currentProviderConfig?.apiType || 'chat_completions';

  let currentAssistantChatShowIndex = -1;

  try {
    // --- 3. 开始工具调用循环 ---
    while (!isTurnAborted()) {
      // chatInputRef.value?.focus({ cursor: 'end' });

      // --- 为本次请求创建临时消息列表 ---
      let messagesForThisRequest = JSON.parse(JSON.stringify(history.value));

      messagesForThisRequest = messagesForThisRequest.filter(msg => {
        if (msg.role === 'system' && (!msg.content || msg.content.trim() === '')) {
          return false;
        }
        return true;
      });

      ensureAssistantReasoningContentForThinkingMode(messagesForThisRequest, tempReasoningEffort.value);

      messagesForThisRequest.forEach(msg => {
        if (Array.isArray(msg.content)) {
          msg.content = msg.content.filter(part => !part.isTranscript);
          if (msg.content.length === 0) msg.content = null;
        }
        ['content', 'reasoning_content', 'extra_content'].forEach(key => {
          if (msg[key] === null) {
            delete msg[key];
          }
        });
        delete msg.tokenUsage;
      });

      if (currentPromptConfig && currentPromptConfig.ifTextNecessary) {
        const now = new Date();
        const timestamp = `current time: ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        messagesForThisRequest.forEach(msg => {
          if (msg.role === 'user') {
            if (msg.content === undefined || msg.content === null) {
              msg.content = timestamp;
            }
            else if (typeof msg.content === 'string') {
              if (msg.content.trim() === '') {
                msg.content = timestamp;
              }
            }
            else if (Array.isArray(msg.content)) {
              if (msg.content.length === 0) {
                msg.content = timestamp;
              } else {
                const hasText = msg.content.some(part => part.type === 'text' && part.text && part.text.trim() !== '');
                if (!hasText) {
                  msg.content.push({
                    type: "text",
                    text: timestamp
                  });
                }
              }
            }
          }
        });
      }

      // 准备 System Prompt 和 MCP 规则
      let mcpSystemPromptStr = "";
      if (openaiFormattedTools.value.length > 0 || sessionSkillIds.value.length > 0) {
        mcpSystemPromptStr = generateMcpSystemPrompt();
        const systemMessageIndex = messagesForThisRequest.findIndex(m => m.role === 'system');
        if (systemMessageIndex !== -1) {
          if (!messagesForThisRequest[systemMessageIndex].content.includes("## Tool Use Rules")) {
            messagesForThisRequest[systemMessageIndex].content += mcpSystemPromptStr;
          }
        } else {
          messagesForThisRequest.unshift({ role: "system", content: mcpSystemPromptStr });
        }
      }

      // 构建请求参数对象
      const requestParams = {
        baseUrl: base_url.value,
        apiKey: api_key.value,
        model: model.value.split("|")[1],
        apiType: apiType,
        retryCount: Number.isInteger(currentProviderConfig?.retryCount) ? currentProviderConfig.retryCount : 3,
        headers: JSON.parse(JSON.stringify(currentProviderConfig?.headers || {})),
        messages: messagesForThisRequest,
        stream: useStream,
        signal: requestSignal
      };

      if (currentPromptConfig?.isTemperature) requestParams.temperature = currentPromptConfig.temperature;
      if (tempReasoningEffort.value && tempReasoningEffort.value !== 'default') requestParams.reasoning_effort = tempReasoningEffort.value;

      // --- 构建工具列表 (MCP + Skill) ---
      let activeTools = [...openaiFormattedTools.value];

      if (sessionSkillIds.value.length > 0 && currentConfig.value.skillPath) {
        try {
          throwIfTurnAborted();
          const skillToolDef = await window.api.getSkillToolDefinition(currentConfig.value.skillPath, sessionSkillIds.value);
          throwIfTurnAborted();
          if (skillToolDef) {
            activeTools.push(skillToolDef);
          }
        } catch (e) {
          console.error("Failed to generate skill tool definition:", e);
        }
      }

      if (activeTools.length > 0) {
        requestParams.tools = normalizeToolsForRequest(activeTools);
        requestParams.tool_choice = "auto";
      }

      if (isVoiceReply) {
        requestParams.stream = false;
        useStream = false;
        requestParams.modalities = ["text", "audio"];
        requestParams.audio = { voice: selectedVoice.value.split('-')[0].trim(), format: "wav" };
      }

      throwIfTurnAborted();
      const assistantMessageId = messageIdCounter.value++;
      chat_show.value.push({
        id: assistantMessageId,
        role: "assistant", content: [], reasoning_content: "", status: "",
        aiName: modelMap.value[model.value] || model.value.split('|')[1],
        voiceName: selectedVoice.value, tool_calls: [],
        startTime: Date.now()
      });
      turnMeta.assistantMessageId = assistantMessageId;
      currentAssistantChatShowIndex = chat_show.value.length - 1;

      if (isAtBottom.value) scrollToBottom('auto');

      let responseMessage;


      if (useStream) {
        // --- 流式处理 ---
        const stream = await window.api.createChatCompletion(requestParams);
        throwIfTurnAborted();

        let aggregatedReasoningContent = "";
        let aggregatedContent = "";
        let aggregatedMedia = [];
        let aggregatedToolCalls = [];
        let aggregatedExtraContent = null;
        let aggregatedUsage = null;
        let lastUpdateTime = Date.now();

        const responsesItemIdToIndexMap = new Map();

        const flushStreamingDisplay = (force = false) => {
          if ((!force && isTurnAborted()) || currentAssistantChatShowIndex < 0 || !chat_show.value[currentAssistantChatShowIndex]) {
            return;
          }
          const currentDisplayContent = [];
          if (aggregatedContent) currentDisplayContent.push({ type: 'text', text: aggregatedContent });
          if (aggregatedMedia.length > 0) currentDisplayContent.push(...aggregatedMedia);

          chat_show.value[currentAssistantChatShowIndex].content = currentDisplayContent;
          if (aggregatedReasoningContent) {
            chat_show.value[currentAssistantChatShowIndex].reasoning_content = aggregatedReasoningContent;
          }
          lastUpdateTime = Date.now();
          syncStickyScrollAfterRender();
        };


        for await (const part of stream) {
          if (isTurnAborted()) {
            break;
          }
          // console.log(part);
          if (part?.usage) {
            aggregatedUsage = part.usage;
          }
          if (apiType === 'responses' || apiType === 'codex') {
            if (part.type === 'response.completed' && part.response?.usage) {
              aggregatedUsage = part.response.usage;
            }
            if (part.type === 'response.output_text.delta') {
              aggregatedContent += part.delta;
              if (chat_show.value[currentAssistantChatShowIndex].status === 'thinking') {
                chat_show.value[currentAssistantChatShowIndex].status = 'end';
              }
            }
            else if (part.type === 'response.reasoning_summary_text.delta') {
              aggregatedReasoningContent += part.delta;
              if (chat_show.value[currentAssistantChatShowIndex].status !== 'thinking') {
                chat_show.value[currentAssistantChatShowIndex].status = 'thinking';
              }
            }
            else if (part.type === 'response.output_item.added') {
              if (part.item && part.item.type === 'function_call') {
                const index = aggregatedToolCalls.length;
                aggregatedToolCalls.push({
                  id: part.item.call_id || part.item.id,
                  type: "function",
                  function: { name: part.item.name || "", arguments: "" }
                });
                responsesItemIdToIndexMap.set(part.item.id, index);
              }
            }
            else if (part.type === 'response.function_call_arguments.delta') {
              const index = responsesItemIdToIndexMap.get(part.item_id);
              if (index !== undefined && aggregatedToolCalls[index]) {
                aggregatedToolCalls[index].function.arguments += (part.delta || "");
              }
            }
          }
          else {
            // Chat Completions 流式
            const delta = part.choices?.[0]?.delta;
            if (!delta) continue;
            if (delta.extra_content) {
              aggregatedExtraContent = { ...aggregatedExtraContent, ...delta.extra_content };
            }
            if (delta.thought_signature) {
              aggregatedExtraContent = aggregatedExtraContent || {};
              aggregatedExtraContent.google = aggregatedExtraContent.google || {};
              aggregatedExtraContent.google.thought_signature = delta.thought_signature;
            }

            if (delta.reasoning_content || delta.reasoning) {
              aggregatedReasoningContent += delta.reasoning_content || delta.reasoning;
              if (chat_show.value[currentAssistantChatShowIndex].status !== 'thinking') {
                chat_show.value[currentAssistantChatShowIndex].status = 'thinking';
              }
            }

            if (delta.content) {
              if (typeof delta.content === 'string') {
                aggregatedContent += delta.content;
              } else if (Array.isArray(delta.content)) {
                delta.content.forEach(item => {
                  if (item.type === 'text') {
                    aggregatedContent += (item.text || '');
                  } else if (item.type === 'image_url') {
                    aggregatedMedia.push(item);
                  }
                });
              }
              if (chat_show.value[currentAssistantChatShowIndex].status == 'thinking') {
                chat_show.value[currentAssistantChatShowIndex].status = 'end';
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
                if (toolCallChunk.extra_content) {
                  currentTool.extra_content = { ...currentTool.extra_content, ...toolCallChunk.extra_content };
                }
              }
            }
          }

          let throttleDelay = 100;
          const currentTotalLength = aggregatedContent.length + aggregatedReasoningContent.length;
          if (currentTotalLength > 1500) throttleDelay = 160;
          if (currentTotalLength > 4000) throttleDelay = 250;
          if (currentTotalLength > 8000) throttleDelay = 400;

          if (isTurnAborted()) {
            break;
          }

          if (Date.now() - lastUpdateTime > throttleDelay) {
            flushStreamingDisplay();
          }
        }

        if (isTurnAborted()) {
          if (isCurrentAssistantTurn()) {
            flushStreamingDisplay(true);
          }
          throw createAbortError();
        }
        flushStreamingDisplay(true);

        let finalContentForHistory = null;
        if (aggregatedMedia.length > 0) {
          finalContentForHistory = [];
          if (aggregatedContent) finalContentForHistory.push({ type: 'text', text: aggregatedContent });
          finalContentForHistory.push(...aggregatedMedia);
        } else {
          finalContentForHistory = aggregatedContent || null;
        }

        responseMessage = {
          role: 'assistant',
          content: finalContentForHistory,
          reasoning_content: aggregatedReasoningContent || (shouldBackfillAssistantReasoningContent(tempReasoningEffort.value) ? '' : null),
          extra_content: aggregatedExtraContent
        };

        if (aggregatedToolCalls.length > 0) {
          responseMessage.tool_calls = aggregatedToolCalls.filter(tc => tc.id && tc.function.name);
        }
        if (aggregatedUsage) {
          responseMessage.tokenUsage = normalizeAssistantTokenUsage(aggregatedUsage);
        }
      } else {
        // --- 非流式处理 ---
        const response = await window.api.createChatCompletion(requestParams);
        throwIfTurnAborted();

        if (apiType === 'responses' || apiType === 'codex') {
          let contentText = "";
          let toolCalls = [];
          let reasoningText = "";

          if (response.output_text) {
            contentText = response.output_text;
          }

          // 完整解析 output 数组
          if (response.output && Array.isArray(response.output)) {
            response.output.forEach(item => {
              // 1. Message
              if (item.type === 'message' && item.content) {
                item.content.forEach(c => {
                  if (c.type === 'output_text') contentText += c.text;
                });
              }
              // 2. Tool Calls
              else if (item.type === 'function_call') {
                toolCalls.push({
                  id: item.call_id || item.id,
                  type: 'function',
                  function: {
                    name: item.name,
                    arguments: item.arguments
                  }
                });
              }
              // 3. Reasoning
              else if (item.type === 'reasoning' && item.summary) {
                item.summary.forEach(s => {
                  if (s.type === 'summary_text') reasoningText += s.text;
                });
              }
            });
          }

          responseMessage = {
            role: 'assistant',
            content: contentText || null,
            reasoning_content: reasoningText || (shouldBackfillAssistantReasoningContent(tempReasoningEffort.value) ? '' : null),
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            tokenUsage: normalizeAssistantTokenUsage(response.usage)
          };
        } else {
          if (isAsyncIterableResponse(response)) {
            responseMessage = await collectChatCompletionStreamToMessage(response);
            throwIfTurnAborted();
          } else if (response && response.choices && response.choices.length > 0) {
            responseMessage = response.choices[0].message;
            responseMessage.tokenUsage = normalizeAssistantTokenUsage(response.usage);
          } else {
            throw new Error(`API 返回异常，未包含有效的 choices 数据: ${JSON.stringify(response)}`);
          }
        }
      }

      throwIfTurnAborted();

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        responseMessage.tool_calls.forEach(tc => {
          if (tc.function && tc.function.arguments) {
            tc.function.arguments = sanitizeToolArgs(tc.function.arguments);
          }
        });
      }

      ensureAssistantReasoningContentForThinkingMode([responseMessage], tempReasoningEffort.value);
      if (!responseMessage.tokenUsage) {
        delete responseMessage.tokenUsage;
      }

      history.value.push(responseMessage);
      throwIfTurnAborted();

      // --- 更新 UI 气泡 ---
      const currentBubble = chat_show.value[currentAssistantChatShowIndex];
      applyTokenUsageToAssistantMessage(currentAssistantChatShowIndex, responseMessage.tokenUsage);

      // 更新正文
      if (responseMessage.content) {
        if (typeof responseMessage.content === 'string') {
          currentBubble.content = [{ type: 'text', text: responseMessage.content }];
        } else if (Array.isArray(responseMessage.content)) {
          currentBubble.content = responseMessage.content;
        }
      }

      // 更新思考内容并标记结束
      if (responseMessage.reasoning_content) {
        currentBubble.reasoning_content = responseMessage.reasoning_content;
        // 关键：非流式下如果存在思考内容，必须将 status 设为 end 才能正确显示
        currentBubble.status = 'end';
      }

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        tool_calls_count++;
        currentBubble.tool_calls = responseMessage.tool_calls.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          args: tc.function.arguments,
          result: '等待批准...',
          approvalStatus: isAutoApproveTools.value ? 'approved' : 'waiting'
        }));

        await nextTick();
        throwIfTurnAborted();

        // 工具调用执行逻辑
        const toolMessages = await Promise.all(
          responseMessage.tool_calls.map(async (toolCall) => {
            const uiToolCall = currentBubble.tool_calls.find(t => t.id === toolCall.id);
            let toolContent;

            // Better Work 交互工具：前端拦截，不走审批 / invokeMcpTool
            if (BETTERWORK_FRONTEND_TOOLS.has(toolCall.function.name)) {
              try {
                const bwArgs = JSON.parse(toolCall.function.arguments || '{}');
                toolContent = await handleBetterWorkTool(toolCall, bwArgs, uiToolCall);
                throwIfTurnAborted();
              } catch (e) {
                if (isTurnAborted()) {
                  throw createAbortError();
                }
                toolContent = `{'result':'Better Work tool error: ${e.message}'}`;
                if (uiToolCall) { uiToolCall.approvalStatus = 'finished'; uiToolCall.result = toolContent; }
              }
              return { tool_call_id: toolCall.id, role: "tool", name: toolCall.function.name, content: toolContent };
            }

            if (!isAutoApproveTools.value) {
              try {
                const isApproved = await new Promise((resolve) => {
                  pendingToolApprovals.value.set(toolCall.id, resolve);
                });

                if (!isApproved) {
                  if (uiToolCall) {
                    uiToolCall.approvalStatus = 'rejected';
                    uiToolCall.result = requestSignal.aborted ? '[System Note]: Tool call was aborted by user.' : '用户已取消执行';
                  }
                  return {
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: toolCall.function.name,
                    content: requestSignal.aborted ? '[System Note]: Tool call was aborted by user.' : 'User denied this tool execution.'
                  };
                }
              } catch (e) {
              }
            }

            throwIfTurnAborted();

            if (uiToolCall) {
              uiToolCall.approvalStatus = 'executing';
              uiToolCall.result = '执行中...';
            }
            const controller = new AbortController();
            toolCallControllers.value.set(toolCall.id, controller);

            try {
              if (requestSignal.aborted) {
                throw createAbortError();
              }

              const toolArgs = JSON.parse(toolCall.function.arguments);

              if (toolCall.function.name === 'Skill') {
                if (uiToolCall) uiToolCall.result = `Activating skill: ${toolArgs.skill}...`;

                let executionContext = null;
                const currentApiKey = api_key.value;
                const currentBaseUrl = base_url.value;
                const currentModelName = model.value.split('|')[1] || model.value;

                const onUpdateCallback = (logContent) => {
                  if (!isTurnAborted() && uiToolCall) {
                    uiToolCall.result = logContent + "\n\n[Skill (Sub-Agent) Running...]";
                  }
                };

                executionContext = {
                  apiKey: currentApiKey,
                  baseUrl: currentBaseUrl,
                  model: currentModelName,
                  tools: activeTools.filter(t => t.function.name !== 'sub_agent'),
                  mcpSystemPrompt: mcpSystemPromptStr,
                  onUpdate: onUpdateCallback,
                  apiType: apiType
                };

                toolContent = await window.api.resolveSkillInvocation(
                  currentConfig.value.skillPath,
                  toolArgs.skill,
                  toolArgs,
                  executionContext,
                  toolCallControllers.value.get(toolCall.id)?.signal || requestSignal
                );

                throwIfTurnAborted();

                if (uiToolCall) {
                  if (toolContent.includes("[Sub-Agent]")) {
                    const currentLog = uiToolCall.result ? uiToolCall.result.replace("\n\n[Skill (Sub-Agent) Running...]", "") : "";
                    if (!currentLog.includes(toolContent)) {
                      uiToolCall.result = `${currentLog}\n\n=== Skill Execution Result ===\n${toolContent}`;
                    } else {
                      uiToolCall.result = currentLog;
                    }
                  } else {
                    uiToolCall.result = toolContent;
                  }
                }

              } else {
                let executionContext = null;

                if (toolCall.function.name === 'sub_agent') {
                  const currentApiKey = api_key.value;
                  const currentBaseUrl = base_url.value;
                  const currentModelName = model.value.split('|')[1] || model.value;

                  const toolsContext = activeTools.filter(t => t.function.name !== 'sub_agent');

                  const onUpdateCallback = (logContent) => {
                    if (!isTurnAborted() && uiToolCall) {
                      uiToolCall.result = logContent + "\n\n[Sub-Agent 执行中...]";
                    }
                  };

                  executionContext = {
                    apiKey: currentApiKey,
                    baseUrl: currentBaseUrl,
                    model: currentModelName,
                    tools: toolsContext,
                    mcpSystemPrompt: mcpSystemPromptStr,
                    onUpdate: onUpdateCallback,
                    apiType: apiType
                  };
                }

                const result = await window.api.invokeMcpTool(
                  toolCall.function.name,
                  toolArgs,
                  toolCallControllers.value.get(toolCall.id)?.signal || requestSignal,
                  executionContext
                );

                toolContent = Array.isArray(result) ? result.filter(item => item?.type === 'text' && typeof item.text === 'string').map(item => item.text).join('\n\n') : String(result);
                throwIfTurnAborted();

                if (uiToolCall) {
                  if (toolCall.function.name === 'sub_agent') {
                    const currentLog = uiToolCall.result ? uiToolCall.result.replace("\n\n[Sub-Agent 执行中...]", "") : "";
                    if (!currentLog.includes(toolContent)) {
                      uiToolCall.result = `${currentLog}\n\n=== 最终结果 ===\n${toolContent}`;
                    } else {
                      uiToolCall.result = currentLog;
                    }
                  } else {
                    uiToolCall.result = toolContent;
                  }
                }
              }

              if (!isTurnAborted() && uiToolCall) uiToolCall.approvalStatus = 'finished';

            } catch (e) {
              if (e.name === 'AbortError') {
                toolContent = "[System Note]: Tool call was aborted by user.";
                if (uiToolCall) uiToolCall.approvalStatus = 'rejected';
              } else {
                toolContent = `{'result':'工具执行或参数解析错误: ${e.message}'}`;
                if (!isTurnAborted() && uiToolCall) uiToolCall.approvalStatus = 'finished';
              }
              if (!isTurnAborted() && uiToolCall) uiToolCall.result = toolContent;
            } finally {
              toolCallControllers.value.delete(toolCall.id);
            }
            return { tool_call_id: toolCall.id, role: "tool", name: toolCall.function.name, content: toolContent };
          })
        );

        throwIfTurnAborted();
        history.value.push(...toolMessages);
        // 工具调用完成本质也会向 AI 续发请求，此处保存一次
        scheduleAutoSave({ reason: 'tool-calls-completed', immediate: true });
        // 工具调用完成后，把缓冲区消息插入历史，使下一轮请求即可纳入
        throwIfTurnAborted();
        await drainBufferIntoHistory();
        throwIfTurnAborted();
      } else {
        if (isVoiceReply && responseMessage.audio) {
          currentBubble.content = currentBubble.content || [];

          if (responseMessage.audio.transcript) {
            const rawTranscript = responseMessage.audio.transcript;
            currentBubble.content.push({
              type: "text",
              text: `\n\n${rawTranscript}`,
              isTranscript: true
            });
          }

          currentBubble.content.push({
            type: "input_audio",
            input_audio: {
              data: responseMessage.audio.data,
              format: 'wav'
            }
          });
        }
        break;
      }
    }
  } catch (error) {
    const aborted = isAbortError(error);
    const staleTurn = !isCurrentAssistantTurn();
    if (staleTurn) {
      if (!aborted) {
        console.warn('[askAI] Ignored stale assistant turn error:', error);
      }
      return;
    }
    if (aborted && turnMeta.cancellationRecorded) {
      return;
    }
    let errorDisplay = `发生错误: ${error.message || '未知错误'}`;
    if (aborted) errorDisplay = "请求已取消";

    const errorBubbleIndex = currentAssistantChatShowIndex > -1 ? currentAssistantChatShowIndex : chat_show.value.length;
    if (currentAssistantChatShowIndex === -1) {
      chat_show.value.push({
        id: messageIdCounter.value++, role: "assistant", content: [],
        aiName: modelMap.value[model.value] || model.value.split('|')[1], voiceName: selectedVoice.value
      });
    }
    const currentBubble = chat_show.value[errorBubbleIndex];

    if (aborted) {
      finalizeCancelledAssistantTurn(turnMeta);
    } else {
      const terminalNotice = getAssistantTerminalNoticeMarkdown(aborted, errorDisplay);
      const finalContent = appendTerminalNoticeToAssistantContent(currentBubble.content, terminalNotice);
      const finalReasoningContent = typeof currentBubble.reasoning_content === 'string'
        ? currentBubble.reasoning_content
        : (currentBubble.reasoning_content ? String(currentBubble.reasoning_content) : '');

      currentBubble.content = finalContent;
      currentBubble.reasoning_content = finalReasoningContent;
      currentBubble.status = 'error';

      history.value.push({
        role: 'assistant',
        content: finalContent,
        reasoning_content: finalReasoningContent || null
      });
    }
    scheduleAutoSave({ reason: aborted ? 'assistant-cancelled-error' : 'assistant-error', immediate: true });

  } finally {
    const stillOwnsTurn = activeAssistantTurnMeta === turnMeta;
    const stillOwnsSignal = signalController.value === requestAbortController;
    if (stillOwnsTurn || stillOwnsSignal) {
      loading.value = false;
      syncAutoCloseOnBlurListener();
    }
    if (stillOwnsSignal) {
      signalController.value = null;
    }
    if (currentAssistantChatShowIndex > -1 && !turnMeta.cancellationRecorded) {
      const endTime = Date.now();
      chat_show.value[currentAssistantChatShowIndex].endTime = endTime;
      chat_show.value[currentAssistantChatShowIndex].completedTimestamp = new Date().toLocaleString('sv-SE');
    }
    await nextTick();
    focusChatInputIfSafe({ cursor: 'end' });

    if (currentTaskConfig.value) {
      let savedFileName = '未保存';
      try {
        if (currentTaskConfig.value.autoSave && currentConfig.value.webdav?.localChatPath) {
          // 构造文件名：任务名-时间
          const timeStr = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/[\/ :]/g, '-').replace(/,/g, '');
          defaultConversationName.value = `定时任务-${currentTaskConfig.value.name}-${timeStr}`;
          const sessionData = getSessionDataAsObject();
          const jsonString = JSON.stringify(sessionData, null, 2);

          const separator = currentOS.value === 'win' ? '\\' : '/';
          const filePath = `${currentConfig.value.webdav.localChatPath}${separator}${defaultConversationName.value}.json`;

          await window.api.writeLocalFile(filePath, jsonString);
          savedFileName = `${defaultConversationName.value}.json`;

          try {
            const localProjects = normalizeWindowProjects(await window.api.readLocalProjects(currentConfig.value.webdav.localChatPath));
            const taskProjectId = typeof currentTaskConfig.value.autoSaveProjectId === 'string' ? currentTaskConfig.value.autoSaveProjectId : '';
            const projectName = localProjects.projects.find((p) => p.id === taskProjectId)?.name || '';
            await reassignLocalProject({
              projectId: taskProjectId,
              projectName,
              addFilename: savedFileName,
              removeFilenames: []
            });
          } catch (projectError) {
            console.warn('[projects] task auto-save local project assignment failed:', projectError);
          }
        }
        // 将历史记录写入主配置
        await window.api.addTaskHistory(currentTaskConfig.value.id, {
          time: Date.now(),
          status: 'success',
          file: savedFileName
        });

        // 自动关闭窗口
        if (currentTaskConfig.value.autoClose) {
          window.api.windowControl('close-window');
        }
      } catch (taskErr) {
        console.error("Task Finalize Error:", taskErr);
        await window.api.addTaskHistory(currentTaskConfig.value.id, {
          time: Date.now(),
          status: 'error',
          file: '报错'
        });
      }
      currentTaskConfig.value = null; // 清空标记，避免后续手动问答也触发
    } else {
      scheduleAutoSave({ reason: 'assistant-turn-finalized', immediate: true }); // 普通对话的自动保存
    }
    if (stillOwnsTurn) {
      activeAssistantTurnMeta = null;
    }
  }
};

const cancelAskAI = () => {
  if (!loading.value) {
    return;
  }

  const turnMeta = activeAssistantTurnMeta;
  const requestAbortController = signalController.value;
  if (turnMeta) {
    turnMeta.cancelledByUser = true;
  }

  if (requestAbortController) {
    requestAbortController.abort();
  }
  cancelAutoNamingRequest();

  resolvePendingToolApprovals(false);
  resolvePendingChoices(null);
  toolCallControllers.value.forEach((controller) => {
    try {
      controller.abort();
    } catch {
      // ignore abort race
    }
  });

  chat_show.value.forEach(msg => {
    if (!Array.isArray(msg.tool_calls)) return;
    msg.tool_calls.forEach(tc => {
      if (tc.approvalStatus === 'waiting' || tc.approvalStatus === 'executing') {
        tc.approvalStatus = 'rejected';
        tc.result = '[System Note]: Tool call was aborted by user.';
      }
    });
  });

  finalizeCancelledAssistantTurn(turnMeta);
  if (turnMeta) {
    activeAssistantTurnId.value = Math.max(activeAssistantTurnId.value, turnMeta.id) + 1;
    if (activeAssistantTurnMeta === turnMeta) {
      activeAssistantTurnMeta = null;
    }
  } else {
    activeAssistantTurnId.value += 1;
  }
  toolCallControllers.value.clear();
  if (signalController.value === requestAbortController) {
    signalController.value = null;
  }
  loading.value = false;
  syncAutoCloseOnBlurListener();
  scheduleAutoSave({ reason: 'assistant-cancelled', immediate: true });
  focusChatInputIfSafe({ cursor: 'end' });
};
const copyText = async (content, index) => { if (loading.value && index === chat_show.value.length - 1) return; await window.api.copyText(content); };
const reaskAI = async () => {
  if (loading.value) return;

  const lastVisibleMessageIndexInHistory = history.value.findLastIndex(msg => msg.role !== 'tool');

  if (lastVisibleMessageIndexInHistory === -1) {
    showDismissibleMessage.warning('没有可以重新提问的用户消息');
    return;
  }

  const lastVisibleMessage = history.value[lastVisibleMessageIndexInHistory];

  if (lastVisibleMessage.role === 'assistant') {
    const historyItemsToRemove = history.value.length - lastVisibleMessageIndexInHistory;
    const showItemsToRemove = history.value.slice(lastVisibleMessageIndexInHistory)
      .filter(m => m.role !== 'tool').length;

    history.value.splice(lastVisibleMessageIndexInHistory, historyItemsToRemove);
    if (showItemsToRemove > 0) {
      chat_show.value.splice(chat_show.value.length - showItemsToRemove);
    }

  } else if (lastVisibleMessage.role === 'user') {
  } else {
    showDismissibleMessage.warning('无法从此消息类型重新提问。');
    return;
  }

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

  let history_idx = -1;
  let show_counter = -1;
  for (let i = 0; i < history.value.length; i++) {
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

  const messageToDeleteInHistory = history.value[history_idx];
  let history_start_idx = history_idx;
  let history_end_idx = history_idx;

  if (
    messageToDeleteInHistory.role === 'assistant' &&
    messageToDeleteInHistory.tool_calls &&
    messageToDeleteInHistory.tool_calls.length > 0
  ) {
    while (history.value[history_end_idx + 1]?.role === 'tool') {
      history_end_idx++;
    }
  }

  const history_delete_count = history_end_idx - history_start_idx + 1;
  const show_delete_count = 1;
  const show_start_idx = index;

  if (history_delete_count > 0) {
    history.value.splice(history_start_idx, history_delete_count);
  }

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
  if (loading.value) {
    return;
  }

  const systemPromptFromConfig = currentConfig.value.prompts[CODE.value]?.prompt;
  const firstMessageInHistory = history.value.length > 0 ? history.value[0] : null;
  const systemPromptFromHistory = (firstMessageInHistory && firstMessageInHistory.role === 'system') ? firstMessageInHistory : null;
  const systemPromptToKeep = systemPromptFromConfig ? { role: "system", content: systemPromptFromConfig } : systemPromptFromHistory;

  if (systemPromptToKeep) {
    history.value = [systemPromptToKeep];
    chat_show.value = [{ ...systemPromptToKeep, id: messageIdCounter.value++ }];
  } else {
    history.value = [];
    chat_show.value = [];
  }

  collapsedMessages.value.clear();
  messageRefs.clear();
  focusedMessageIndex.value = null;
  cancelAutoNamingRequest();
  defaultConversationName.value = "";
  taskList.value = [];
  taskPanelVisible.value = false;
  pendingAppendBuffer.value = [];
  chatInputRef.value?.focus({ cursor: 'end' });
  showDismissibleMessage.success('历史记录已清除');
};

function toggleMcpServerSelection(serverId) {
  const index = tempSessionMcpServerIds.value.indexOf(serverId);
  if (index === -1) {
    tempSessionMcpServerIds.value.push(serverId);
  } else {
    tempSessionMcpServerIds.value.splice(index, 1);
  }
}

async function handleQuickMcpToggle(serverId) {
  const index = sessionMcpServerIds.value.indexOf(serverId);
  if (index === -1) {
    sessionMcpServerIds.value.push(serverId);
  } else {
    sessionMcpServerIds.value.splice(index, 1);
  }

  tempSessionMcpServerIds.value = [...sessionMcpServerIds.value];

  await requestApplyMcpTools(false, 'quick-toggle');
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

function getDisplayTypeName(type) {
  if (!type) return '';
  const streamableHttpRegex = /^streamable[\s_-]?http$/i;
  const lowerType = type.toLowerCase();

  if (lowerType === 'builtin') {
    return "内置";
  }

  if (streamableHttpRegex.test(lowerType) || lowerType === 'http') {
    return "可流式 HTTP";
  }

  else return type
}

const handleSaveModel = async (modelToSave) => {
  if (!CODE.value || !currentConfig.value.prompts[CODE.value]) {
    showDismissibleMessage.warning('无法保存模型，因为当前不是一个已定义的快捷助手。');
    return;
  }

  try {
    const result = await window.api.saveSetting(`prompts.${CODE.value}.model`, modelToSave);
    changeModel_page.value = false;
    if (result && result.success) {
      currentConfig.value.prompts[CODE.value].model = modelToSave;
      showDismissibleMessage.success(`模型已为快捷助手 "${CODE.value}" 保存成功！`);
    } else {
      throw new Error(result?.message || '保存失败');
    }
  } catch (error) {
    console.error("保存模型失败:", error);
    showDismissibleMessage.error(`保存模型失败: ${error.message}`);
  }

  changeModel_page.value = false;
};

const handleGlobalImageError = (event) => {
  const img = event.target;

  if (!(img instanceof HTMLImageElement) || !img.closest('.markdown-wrapper')) {
    return;
  }

  event.preventDefault();

  const originalSrc = img.src;

  if (img.parentNode && img.parentNode.classList.contains('image-error-container')) {
    return;
  }

  const container = document.createElement('div');
  container.className = 'image-error-container';
  container.title = '图片加载失败，点击重试';

  const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgIcon.setAttribute('viewBox', '0 0 24 24');
  svgIcon.innerHTML = `<path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="currentColor"></path>`;

  const textLabel = document.createElement('span');
  textLabel.textContent = 'Image';

  container.appendChild(svgIcon);
  container.appendChild(textLabel);

  if (img.parentNode) {
    img.parentNode.replaceChild(container, img);
  }

  container.onclick = (e) => {
    e.stopPropagation();
    const newImg = document.createElement('img');
    newImg.src = `${originalSrc}?t=${new Date().getTime()}`;
    if (container.parentNode) {
      container.parentNode.replaceChild(newImg, container);
    }
  };
};

const handleGlobalKeyDown = (event) => {
  const isCtrl = event.ctrlKey || event.metaKey;

  // 1. 保存功能 (Ctrl + S) - 保持原有逻辑
  if (isCtrl && event.key.toLowerCase() === 's') {
    event.preventDefault();

    if (loading.value) {
      showDismissibleMessage.warning('请等待 AI 回复完成后再保存');
      return;
    }

    if (document.querySelector('.el-dialog, .el-message-box')) {
      return;
    }
    handleSaveAction();
    return;
  }

  // 2. 任务进度面板开关 (Ctrl + T)
  if (isCtrl && event.key.toLowerCase() === 't') {
    event.preventDefault();
    taskPanelVisible.value = !taskPanelVisible.value;
    return;
  }

  // 3. 缩放快捷键控制
  if (isCtrl) {
    // 重置缩放 (Ctrl + 0)
    if (event.key === '0') {
      event.preventDefault();
      zoomLevel.value = 1;
      showDismissibleMessage.info('缩放已重置 (100%)');
      return;
    }

    // 放大 (Ctrl + = 或 Ctrl + +)
    // 注意：在大多数键盘上，+ 号位于 = 键上，不按 Shift 时 key 为 '='
    if (event.key === '=' || event.key === '+') {
      event.preventDefault();
      const newZoom = zoomLevel.value + 0.1;
      // 限制最大缩放为 2.0，与鼠标滚轮逻辑保持一致
      zoomLevel.value = Math.min(2.0, newZoom);
      showDismissibleMessage.info(`缩放: ${Math.round(zoomLevel.value * 100)}%`);
      return;
    }

    // 缩小 (Ctrl + -)
    if (event.key === '-') {
      event.preventDefault();
      const newZoom = zoomLevel.value - 0.1;
      // 限制最小缩放为 0.5，与鼠标滚轮逻辑保持一致
      zoomLevel.value = Math.max(0.5, newZoom);
      showDismissibleMessage.info(`缩放: ${Math.round(zoomLevel.value * 100)}%`);
      return;
    }
  }
};

const navMessages = computed(() => {
  return chat_show.value
    .map((msg, index) => ({ ...msg, originalIndex: index })) // 保留原始索引用于跳转
    .filter(msg => msg.role !== 'system');
});



const getMessagePreviewText = (message) => {
  let text = '';

  // 1. 尝试获取文本内容
  if (typeof message.content === 'string') {
    text = message.content;
  } else if (Array.isArray(message.content)) {
    const textPart = message.content.find(p => p.type === 'text' && p.text && p.text.trim());
    if (textPart) {
      text = textPart.text;
    } else {
      // 2. 如果没有文本，查找附件/图片
      const filePart = message.content.find(p => p.type === 'file' || p.type === 'input_file');
      const imgPart = message.content.find(p => p.type === 'image_url');
      const audioPart = message.content.find(p => p.type === 'input_audio');

      if (filePart) {
        // 优先显示文件名
        text = `[文件] ${filePart.filename || filePart.name || '未知文件'}`;
      } else if (imgPart) {
        text = '[图片]';
      } else if (audioPart) {
        text = '[语音消息]';
      }
    }
  }

  // 3. 如果还是空的，检查工具调用
  if (!text && message.tool_calls && message.tool_calls.length > 0) {
    const toolNames = message.tool_calls.map(t => t.name).join(', ');
    text = `调用工具: ${toolNames}`;
  }

  // 4. AI 思考中状态
  if (!text && message.role === 'assistant' && message.status === 'thinking') {
    text = '思考中...';
  }

  // 5. 兜底
  if (!text) text = message.role === 'user' ? '用户消息' : 'AI 回复';

  // 截断，防止太长
  return text.slice(0, 30) + (text.length > 30 ? '...' : '');
};

// 2. 滚动到指定消息
const scrollToMessageByIndex = (index) => {
  scrollChatContainerToMessage(index);
};
</script>

<template>
  <main>
    <div v-if="windowBackgroundImage" class="window-bg-base"></div>
    <div class="window-bg-layer" :class="{ 'is-visible': !!windowBackgroundImage }" :style="{
      backgroundImage: windowBackgroundImage ? `url('${windowBackgroundImage}')` : 'none',
      opacity: windowBackgroundImage ? windowBackgroundOpacity : 0,
      filter: `blur(${windowBackgroundBlur}px)`
    }">
    </div>
    <el-container class="app-container" :class="{ 'has-bg': !!windowBackgroundImage }">
      <TitleBar :favicon="favicon" :promptName="CODE" :conversationName="defaultConversationName"
        :isAlwaysOnTop="isAlwaysOnTop" :autoCloseOnBlur="autoCloseOnBlur" :isDarkMode="currentConfig.isDarkMode"
        :os="currentOS" @save-window-size="handleSaveWindowSize" @save-session="handleSaveSession"
        @toggle-pin="handleTogglePin" @toggle-always-on-top="handleToggleAlwaysOnTop" @minimize="handleMinimize"
        @maximize="handleMaximize" @close="handleCloseWindow" />
      <ChatHeader :modelMap="modelMap" :model="model" :model-logo="currentModelLogo" :is-mcp-loading="isMcpLoading" :systemPrompt="currentSystemPrompt"
        :has-task-tool="hasTaskMcpTool" :task-panel-visible="taskPanelVisible" :task-status="taskOverallStatus"
        @open-model-dialog="handleOpenModelDialog" @show-system-prompt="handleShowSystemPrompt"
        @model-logo-error="handleModelLogoError"
        @toggle-task-panel="taskPanelVisible = !taskPanelVisible" />

      <TaskPanel :tasks="taskList" :visible="taskPanelVisible" @close="taskPanelVisible = false" />

      <div class="main-area-wrapper">
        <el-main ref="chatContainerRef" class="chat-main custom-scrollbar" @click="handleMainClick"
          @wheel.passive="markUserScrollIntent" @touchstart.passive="markUserScrollIntent"
          @pointerdown="markUserScrollIntent" @scroll="handleScroll">
          <ChatMessage v-for="(message, index) in chat_show" :key="message.id" :is-auto-approve="isAutoApproveTools"
            @update-auto-approve="handleToggleAutoApprove" @confirm-tool="handleToolApproval"
            @reject-tool="handleToolApproval" :ref="el => setMessageRef(el, message.id)" :message="message"
            :index="index" :is-last-message="index === chat_show.length - 1" :is-loading="loading"
            :user-avatar="UserAvart" :ai-avatar="AIAvart" :is-collapsed="isCollapsed(index)"
            :is-dark-mode="currentConfig.isDarkMode" @delete-message="handleDeleteMessage" @copy-text="handleCopyText"
            @re-ask="handleReAsk" @toggle-collapse="handleToggleCollapse" @show-system-prompt="handleShowSystemPrompt"
            @avatar-click="onAvatarClick" @edit-message-requested="handleEditStart" @edit-finished="handleEditEnd"
            @edit-message="handleEditMessage" @cancel-tool-call="handleCancelToolCall" @submit-choice="handleChoiceSubmit" />
        </el-main>

        <div class="unified-nav-sidebar" v-if="chat_show.length > 0">

          <!-- 上部控制区 -->
          <div class="nav-group top">
            <el-tooltip content="回到顶部" placement="left" :show-after="500">
              <div class="nav-mini-btn" @click="scrollToTop">
                <el-icon :size="16">
                  <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                    <path
                      d="M199.36 572.768a31.904 31.904 0 0 0 22.624-9.376l294.144-294.144 285.728 285.728a31.968 31.968 0 1 0 45.248-45.248L538.752 201.376a32 32 0 0 0-45.28 0L176.704 518.144a31.968 31.968 0 0 0 22.656 54.624z m339.424-115.392a32 32 0 0 0-45.28 0L176.736 774.144a31.968 31.968 0 1 0 45.248 45.248l294.144-294.144 285.728 285.728a31.968 31.968 0 1 0 45.248-45.248l-308.32-308.352z">
                    </path>
                  </svg>
                </el-icon>
              </div>
            </el-tooltip>
            <el-tooltip content="上一条消息" placement="left" :show-after="500">
              <div class="nav-mini-btn" @click="navigateToPreviousMessage">
                <el-icon>
                  <ArrowUp />
                </el-icon>
              </div>
            </el-tooltip>
          </div>

          <div class="nav-timeline-area">
            <div class="timeline-track"></div>
            <div ref="navTimelineScrollerRef" class="timeline-scroller no-scrollbar">
              <el-tooltip v-for="msg in navMessages" :key="msg.id" :content="getMessagePreviewText(msg)" placement="left"
                :show-after="160" :enterable="false" effect="dark" popper-class="nav-message-tooltip">
                <div class="timeline-node-wrapper" :data-original-index="msg.originalIndex"
                  @click="scrollToMessageByIndex(msg.originalIndex)">
                  <div class="timeline-node" :class="[
                    msg.role,
                    { 'active': focusedMessageIndex === msg.originalIndex }
                  ]">
                  </div>
                </div>
              </el-tooltip>
            </div>
          </div>

          <!-- 下部控制区 -->
          <div class="nav-group bottom">
            <el-tooltip :content="nextButtonTooltip" placement="left" :show-after="500">
              <div class="nav-mini-btn" @click="navigateToNextMessage">
                <el-icon>
                  <ArrowDown />
                </el-icon>
              </div>
            </el-tooltip>

            <el-tooltip content="跳到底部" placement="left" :show-after="500">
              <div class="nav-mini-btn" :class="{ 'highlight-bottom': showScrollToBottomButton }"
                @click="forceScrollToBottom">
                <el-icon :size="16">
                  <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                    <path
                      d="M493.504 558.144a31.904 31.904 0 0 0 45.28 0l308.352-308.352a31.968 31.968 0 1 0-45.248-45.248L516.16 490.272 221.984 196.128a31.968 31.968 0 1 0-45.248 45.248l316.768 316.768z m308.384-97.568L516.16 746.304 222.016 452.16a31.968 31.968 0 1 0-45.248 45.248l316.768 316.768a31.904 31.904 0 0 0 45.28 0l308.352-308.352a32 32 0 1 0-45.28-45.248z">
                    </path>
                  </svg>
                </el-icon>
              </div>
            </el-tooltip>
          </div>

        </div>

        <ChatInput ref="chatInputRef" v-model:prompt="prompt" v-model:fileList="fileList"
          v-model:selectedVoice="selectedVoice" v-model:tempReasoningEffort="tempReasoningEffort" :loading="loading"
          :ctrlEnterToSend="currentConfig.CtrlEnterToSend" :layout="inputLayout" :voiceList="currentConfig.voiceList"
          :is-mcp-active="isMcpActive" :all-mcp-servers="availableMcpServers" :active-mcp-ids="sessionMcpServerIds"
          :active-skill-ids="sessionSkillIds" :all-skills="allSkillsList" :append-buffer="pendingAppendBuffer" @submit="handleSubmit" @cancel="handleCancel"
          @clear-history="handleClearHistory" @remove-file="handleRemoveFile" @upload="handleUpload"
          @send-audio="handleSendAudio" @open-mcp-dialog="handleOpenMcpDialog" @pick-file-start="handlePickFileStart"
          @toggle-mcp="handleQuickMcpToggle" @toggle-skill="handleQuickSkillToggle"
          @open-skill-dialog="toggleSkillDialog" @cancel-buffer="removeBufferedMessage" />
      </div>
    </el-container>
  </main>

  <ModelSelectionDialog v-model="changeModel_page" :modelList="modelList" :currentModel="model"
    :providerCollapseStates="modelDialogProviderCollapseStates"
    @update:providerCollapseStates="handleProviderCollapseStatesChange"
    @select="handleChangeModel" @save-model="handleSaveModel" />

  <el-dialog v-model="systemPromptDialogVisible" title="" custom-class="system-prompt-dialog" width="60%"
    :show-close="false" :lock-scroll="false" :append-to-body="true" center :close-on-click-modal="true"
    :close-on-press-escape="true">
    <template #header="{ close, titleId, titleClass }">
      <div style="display: none;"></div>
    </template>
    <el-input v-model="systemPromptContent" type="textarea" :autosize="{ minRows: 4, maxRows: 15 }"
      class="system-prompt-full-content" resize="none" @keydown="handleSystemPromptKeydown" />
    <template #footer>
      <el-button @click="systemPromptDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="saveSystemPrompt">保存</el-button>
    </template>
  </el-dialog>

  <el-image-viewer v-if="imageViewerVisible" :url-list="imageViewerSrcList" :initial-index="imageViewerInitialIndex"
    @close="imageViewerVisible = false" @switch="(idx) => currentImageViewerIndex = idx" :hide-on-click-modal="true"
    teleported />
  <div v-if="imageViewerVisible" class="custom-viewer-actions">
    <el-button type="primary" :icon="DocumentCopy" circle
      @click="handleCopyImageFromViewer(imageViewerSrcList[currentImageViewerIndex])" title="复制图片" />
    <el-button type="primary" :icon="Download" circle
      @click="handleDownloadImageFromViewer(imageViewerSrcList[currentImageViewerIndex])" title="下载图片" />
  </div>

  <el-dialog v-model="isMcpDialogVisible" width="80%" custom-class="mcp-dialog no-header-dialog" @close="focusOnInput"
    :show-close="false">
    <template #header>
      <div style="display: none;"></div>
    </template>
    <div class="mcp-dialog-content">
      <div class="mcp-dialog-toolbar">
        <div class="filter-tags">
          <span class="filter-tag" :class="{ active: mcpFilter === 'all' }" @click="mcpFilter = 'all'">全部</span>
          <span class="filter-tag" :class="{ active: mcpFilter === 'selected' }"
            @click="mcpFilter = 'selected'">已选</span>
          <span class="filter-tag" :class="{ active: mcpFilter === 'unselected' }"
            @click="mcpFilter = 'unselected'">未选</span>
        </div>
        <div class="action-tags">
          <span class="action-tag" @click="refreshSelectedMcpServers" title="强制重新拉取选中服务的最新工具配置">
            <el-icon :class="{ 'is-loading': isRefreshingMcp }">
              <Refresh />
            </el-icon>
          </span>
          <span class="action-tag" @click="selectAllMcpServers">全选</span>
          <span class="action-tag" @click="clearMcpTools">清空</span>
        </div>
      </div>
      <div class="mcp-server-list custom-scrollbar">
        <div v-for="server in filteredMcpServers" :key="server.id" class="mcp-server-item-wrapper">
          <!-- 主卡片区域 -->
          <div class="mcp-server-item" :class="{ 'is-checked': tempSessionMcpServerIds.includes(server.id) }"
            @click="toggleMcpServerSelection(server.id)">

            <div class="mcp-server-content">
              <!-- 第一行：勾选框 | Logo | 名称 | 间隔 | 持久化 | 标签 -->
              <div class="mcp-server-header-row">
                <el-checkbox :model-value="tempSessionMcpServerIds.includes(server.id)" size="large"
                  @change="() => toggleMcpServerSelection(server.id)" @click.stop class="header-checkbox" />

                <el-avatar :src="server.logoUrl" shape="square" :size="20" class="mcp-server-icon">
                  <el-icon :size="12">
                    <Tools />
                  </el-icon>
                </el-avatar>
                <span class="mcp-server-name">
                  {{ server.name }}
                  <span v-if="getToolCounts(server.id)" class="mcp-tool-count">
                    ({{ getToolCounts(server.id).enabled }}/{{ getToolCounts(server.id).total }})
                  </span>
                </span>

                <!-- 右侧分组：包含持久连接按钮和标签，统一靠右 -->
                <div class="mcp-header-right-group">
                  <el-tooltip :content="server.isPersistent ? '持久连接已开启' : '持久连接已关闭'" placement="top">
                    <el-button text circle :class="{ 'is-persistent-active': server.isPersistent }"
                      @click.stop="toggleMcpPersistence(server.id, !server.isPersistent)" class="persistent-btn">
                      <el-icon :size="16">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                        </svg>
                      </el-icon>
                    </el-button>
                  </el-tooltip>

                  <div class="mcp-server-tags">
                    <el-tag v-if="server.type" type="info" size="small" effect="plain" round>{{
                      getDisplayTypeName(server.type) }}</el-tag>
                    <el-tag v-for="tag in (server.tags || []).slice(0, 2)" :key="tag" size="small" effect="plain"
                      round>{{
                        tag
                      }}</el-tag>
                  </div>
                </div>
              </div>

              <!-- 第二行：折叠按钮 | 描述 -->
              <div class="mcp-server-body-row">
                <div class="mcp-tools-toggle" @click.stop="toggleMcpServerExpansion(server.id)">
                  <el-icon :class="{ 'is-expanded': expandedMcpServers.has(server.id) }">
                    <CaretRight />
                  </el-icon>
                  <span>{{ expandedMcpServers.has(server.id) ? '收起' : '工具' }}</span>
                </div>

                <span v-if="server.description" class="mcp-server-description"
                  @click.stop="toggleMcpServerExpansion(server.id)">{{ server.description }}</span>
              </div>
            </div>
          </div>

          <!-- 折叠的工具列表区域 (保持不变) -->
          <div v-if="expandedMcpServers.has(server.id)" class="mcp-tools-panel" @click.stop>
            <template v-if="mcpToolCache[server.id] && mcpToolCache[server.id].length > 0">
              <div v-for="tool in mcpToolCache[server.id]" :key="tool.name" class="mcp-tool-row">
                <el-switch :model-value="tool.enabled !== false" size="small"
                  @change="(val) => handleMcpToolStatusChange(server.id, tool.name, val)" />
                <div class="mcp-tool-info">
                  <span class="mcp-tool-name">{{ tool.name }}</span>
                  <span class="mcp-tool-desc" :title="tool.description">{{ tool.description || '暂无描述' }}</span>
                </div>
              </div>
            </template>
            <div v-else class="mcp-tools-empty">
              工具未缓存，使用/测试后即可查看具体工具
            </div>
          </div>
        </div>
      </div>
      <div class="mcp-dialog-footer-search">
        <el-input v-model="mcpSearchQuery" placeholder="搜索工具名称或描述..." :prefix-icon="Search" clearable />
      </div>
    </div>
    <template #footer>
      <div class="mcp-dialog-footer">
        <div class="footer-left-controls"> <!-- 使用新容器包裹左侧内容 -->
          <span class="mcp-limit-hint" :class="{ 'warning': mcpConnectionCount > 5 }">
            连接数：{{ 5 - mcpConnectionCount }}/5
            <el-tooltip placement="top">
              <template #content>
                持久连接各占1个名额<br>
                所有临时连接共占1个名额<br>
                内置MCP不占用名额
              </template>
              <el-icon style="vertical-align: middle; margin-left: 4px; cursor: help;">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </span>
          <el-checkbox v-model="isAutoApproveTools" label="自动批准工具调用" class="bw-checkbox"
            style="margin-left: 40px; margin-right: 0;" />
        </div>
        <div>
          <el-button type="primary" class="bw-btn"
            @click="sessionMcpServerIds = [...tempSessionMcpServerIds]; requestApplyMcpTools(true, 'dialog-apply');">应用</el-button>
        </div>
      </div>
    </template>
  </el-dialog>

  <el-dialog v-model="isSkillDialogVisible" width="80%" custom-class="mcp-dialog no-header-dialog" :show-close="false">
    <template #header>
      <div style="display: none;"></div>
    </template>

    <div class="mcp-dialog-content">
      <div class="mcp-dialog-toolbar">
        <div class="filter-tags">
          <span class="filter-tag" :class="{ active: skillFilter === 'all' }" @click="skillFilter = 'all'">全部</span>
          <span class="filter-tag" :class="{ active: skillFilter === 'selected' }"
            @click="skillFilter = 'selected'">已选</span>
          <span class="filter-tag" :class="{ active: skillFilter === 'unselected' }"
            @click="skillFilter = 'unselected'">未选</span>
        </div>
        <div class="action-tags">
          <span class="action-tag" @click="selectAllSkills">全选</span>
          <span class="action-tag" @click="clearSkills">清空</span>
        </div>
      </div>

      <!-- 列表区域 -->
      <div class="mcp-server-list custom-scrollbar">
        <div v-if="filteredSkillsList.length === 0"
          style="padding: 20px; text-align: center; color: var(--el-text-color-placeholder);">
          暂无匹配的技能
        </div>
        <div v-else v-for="skill in filteredSkillsList" :key="skill.name" class="mcp-server-item-wrapper">
          <div class="mcp-server-item" :class="{ 'is-checked': tempSessionSkillIds.includes(skill.name) }"
            @click="toggleSkillSelection(skill.name)">

            <!-- 单行布局结构 -->
            <div class="skill-single-row">
              <el-checkbox :model-value="tempSessionSkillIds.includes(skill.name)" size="large"
                @change="() => toggleSkillSelection(skill.name)" @click.stop class="header-checkbox" />

              <el-avatar shape="square" :size="20" class="mcp-server-icon"
                style="background:transparent; color: var(--el-text-color-primary); flex-shrink: 0;">
                <el-icon :size="16">
                  <Collection />
                </el-icon>
              </el-avatar>

              <span class="mcp-server-name skill-name-fixed">{{ skill.name }}</span>

              <!-- 描述显示在同一行 -->
              <span class="skill-desc-inline" :title="skill.description">{{ skill.description }}</span>

              <!-- 标签靠右 -->
              <div class="mcp-header-right-group">
                <!-- Sub-Agent 切换按钮 -->
                <el-tooltip :content="skill.context === 'fork' ? 'Sub-Agent 模式已开启' : 'Sub-Agent 模式已关闭'" placement="top">
                  <div class="subagent-toggle-btn-small" :class="{ 'is-active': skill.context === 'fork' }"
                    @click.stop="handleSkillForkToggle(skill)">
                    <el-icon :size="14">
                      <Cpu />
                    </el-icon>
                  </div>
                </el-tooltip>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- 底部搜索框 -->
      <div class="mcp-dialog-footer-search">
        <el-input v-model="skillSearchQuery" placeholder="搜索技能名称或描述..." :prefix-icon="Search" clearable />
      </div>
    </div>

    <template #footer>
      <div class="mcp-dialog-footer">
        <div class="footer-left-controls">
          <!-- 状态计数 -->
          <span class="mcp-limit-hint" v-if="tempSessionSkillIds.length > 0"
            style="margin-right: 15px; font-weight: bold; color: var(--el-color-primary);">
            已选 {{ tempSessionSkillIds.length }} 个技能
          </span>
          <!-- Warning 提示 -->
          <span class="mcp-limit-hint warning" style="display: inline-flex; align-items: center; opacity: 0.8;">
            <el-icon style="margin-right: 4px;">
              <Warning />
            </el-icon>
            Skill 依赖内置 MCP 服务，请勿禁用
          </span>
        </div>
        <el-button type="primary" class="bw-btn" @click="handleSkillSelectionConfirm">确定</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style>
html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: transparent;
}

:root {
  /* 浅色模式变量 */
  --el-bg-color: #FFFFFD !important;
  --el-bg-color-userbubble: #F5F4ED;
  --el-fill-color: #F0F2F5 !important;
  --el-fill-color-light: #F6F6F6 !important;
  --el-bg-color-input: #F6F6F6 !important;
  /* 明确指定浅色输入框背景 */
  --el-fill-color-blank: var(--el-fill-color-light) !important;

  --text-primary: #000000;
  --el-text-color-primary: var(--text-primary);
}

html.dark {
  /* 深色模式变量强制覆盖 */
  --el-bg-color: #212121 !important;
  --el-bg-color-userbubble: #2F2F2F;
  --el-fill-color: #424242 !important;
  --el-fill-color-light: #2c2e33 !important;
  --el-bg-color-input: #303030 !important;
  --el-fill-color-blank: #212121 !important;

  --text-primary: #ECECF1 !important;
  --el-text-color-primary: #ECECF1 !important;
}

.el-dialog {
  border-radius: 8px !important;
  overflow: hidden;
  background-color: var(--el-bg-color) !important;
}

html.dark .el-dialog {
  background-color: var(--el-bg-color) !important;
}

.el-message-box {
  border-radius: 8px !important;
  overflow: hidden;
}

.el-dialog__header {
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  padding-bottom: 0 !important;
}

.el-dialog__footer {
  padding-top: 4px !important;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}

.mcp-dialog {
  border-radius: 8px !important;
}

.model-dialog {
  border-radius: 8px !important;
}

.el-dialog__body {
  padding-top: 10px !important;
  padding-bottom: 10px !important;
}

/* Save Options Dialog */
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

.save-option-item.is-disabled {
  cursor: not-allowed;
  opacity: 0.68;
}

.save-option-item.is-disabled:hover {
  transform: none;
  border-color: var(--el-border-color-lighter);
  box-shadow: none;
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

html.dark .save-option-item.is-disabled:hover {
  border-color: var(--el-border-color-dark);
  background-color: transparent;
}

html.dark .save-option-text p {
  color: var(--el-text-color-regular);
}

/* System Prompt Dialog */
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


.filename-prompt-title-row {
  width: 100%;
  max-width: 520px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.filename-prompt-title-text {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
  flex: 1;
}

.filename-auto-name-button {
  flex-shrink: 0;
}

/* Filename Prompt Dialog */
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

.filename-project-row {
  width: 100%;
  max-width: 520px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.filename-project-label {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.filename-project-select {
  flex: 1;
  min-width: 0;
}

/* Custom Viewer Actions */
.custom-viewer-actions {
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2100;
  padding: 6px 12px;
  background-color: rgba(0, 0, 0, 0.45);
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

/* MCP Dialog Styles */
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
  margin-bottom: 0px;
}

.mcp-header-right-group {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.mcp-server-icon {
  flex-shrink: 0;
  background-color: var(--el-fill-color-light);
  /* 适配深/浅色模式的背景 */
  color: var(--el-text-color-secondary);
}

html.dark .mcp-server-icon {
  background-color: var(--el-fill-color);
}

.mcp-server-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-flex;
  align-items: center;
}

.mcp-tool-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 6px;
  font-weight: normal;
  opacity: 0.8;
}

.mcp-server-tags {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
}

.mcp-server-tags .el-tag {
  padding-top: 0px;
  padding-bottom: 2px;
  padding-left: 8px;
  padding-right: 8px;

}

.mcp-server-description {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.mcp-dialog-footer-search {
  flex-shrink: 0;
  padding: 10px 4px 0 4px;
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
  padding: 0 10px;
}

.mcp-dialog-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
  padding: 0 4px;
}

.filter-tags,
.action-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-tag,
.action-tag {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 14px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.5, 1);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-weight: 500;
  border: 1px solid transparent;
}

.filter-tag:hover,
.action-tag:hover {
  background-color: var(--el-fill-color-darker);
  color: var(--el-text-color-primary);
}

.filter-tag.active {
  background-color: var(--el-text-color-primary);
  color: var(--el-bg-color);
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

html.dark .filter-tag.active {
  box-shadow: 0 2px 6px rgba(255, 255, 255, 0.15);
}

.mcp-server-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 35vh;
  overflow-y: auto;
  padding: 5px;
}

.mcp-server-item-wrapper {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s;
  flex-shrink: 0;
  min-height: min-content;
  background-color: var(--el-bg-color);
}

.mcp-server-item-wrapper:hover {
  border-color: var(--el-color-primary);
  background-color: var(--el-fill-color-light);
}

/* 主卡片区域 */
.mcp-server-item {
  display: flex;
  flex-direction: column;
  padding: 0px 8px 4px 8px;
  border: none;
  border-radius: 0;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid transparent;
  width: 100%;
  box-sizing: border-box;
}

.mcp-server-item-wrapper:hover .mcp-server-item {
  background-color: transparent;
}

.mcp-server-item.is-checked {
  background-color: var(--el-color-primary-light-9);
}

.mcp-server-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

/* 第一行：Header */
.mcp-server-header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.header-checkbox {
  margin-right: 4px;
}

.mcp-server-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 第二行：Body (Toggle + Description) */
.mcp-server-body-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 2px;
  /* 微调以对齐上方视觉 */
}

/* 折叠按钮 */
.mcp-tools-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
  padding: 2px 6px;
  background-color: var(--el-fill-color-lighter);
  border-radius: 4px;
  transition: all 0.2s;
}

.mcp-tools-toggle:hover {
  color: var(--el-color-primary);
  background-color: var(--el-fill-color);
}

.mcp-tools-toggle .el-icon {
  transition: transform 0.2s;
  font-size: 10px;
}

.mcp-tools-toggle .el-icon.is-expanded {
  transform: rotate(90deg);
}

/* 描述文本 */
.mcp-server-description {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.8;
  flex: 1;
  min-width: 0;
  line-height: 1.5;
}

/* 工具列表面板 */
.mcp-tools-panel {
  background-color: var(--el-fill-color-lighter);
  padding: 0px 8px 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 0px;
  font-size: 12px;
  animation: expand-tools 0.2s ease-out;
  border-top: 1px solid var(--el-border-color-lighter);
}

.mcp-server-item-wrapper:has(.mcp-tools-panel) .mcp-server-item {
  border-bottom-color: var(--el-border-color-lighter);
}

@keyframes expand-tools {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.mcp-tool-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.mcp-tool-row:last-child {
  border-bottom: none;
}

.mcp-tool-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  line-height: 1.4;
}

.mcp-tool-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
  font-size: 13px;
}

.mcp-tool-desc {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.8;
}

.mcp-tools-empty {
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 15px 0;
  font-style: italic;
  font-size: 12px;
}

/* 深色模式适配 */
html.dark .mcp-server-item-wrapper {
  border-color: var(--el-border-color-lighter);
  background-color: var(--el-bg-color);
}

html.dark .mcp-server-item-wrapper:hover {
  background-color: var(--el-fill-color-darker);
  border-color: var(--el-border-color);
}

html.dark .mcp-server-item.is-checked {
  background-color: var(--el-fill-color-dark);
}

html.dark .mcp-tools-toggle {
  background-color: var(--el-fill-color-dark);
}

html.dark .mcp-tools-toggle:hover {
  background-color: var(--el-fill-color);
}

html.dark .mcp-server-item-wrapper:has(.mcp-tools-panel) .mcp-server-item {
  border-bottom-color: var(--el-border-color-lighter);
}

html.dark .mcp-tools-panel {
  background-color: var(--el-fill-color-dark);
  border-top-color: var(--el-border-color-lighter);
}

html.dark .mcp-tool-row {
  border-bottom-color: var(--el-border-color-lighter);
}

html.dark .mcp-tool-row .el-switch {
  --el-switch-off-color: #181818;
  --el-switch-border-color: #4C4D4F;
}

html.dark .mcp-tool-row .el-switch .el-switch__core .el-switch__action {
  background-color: #E5EAF3;
}

html.dark .mcp-tool-row .el-switch.is-checked .el-switch__core {
  background-color: #E5EAF3;
  border-color: #E5EAF3;
}

html.dark .mcp-tool-row .el-switch.is-checked .el-switch__core .el-switch__action {
  background-color: #141414;
}

html.dark .mcp-server-list .el-checkbox__input.is-checked .el-checkbox__inner,
html.dark .mcp-dialog-footer .el-checkbox__input.is-checked .el-checkbox__inner {
  background-color: #fff !important;
  border-color: #fff !important;
}

html.dark .mcp-server-list .el-checkbox__input.is-checked .el-checkbox__inner::after,
html.dark .mcp-dialog-footer .el-checkbox__input.is-checked .el-checkbox__inner::after {
  border-color: #1d1d1d !important;
}

.no-header-dialog .el-dialog__header {
  display: none !important;
  padding: 0 !important;
}

.no-header-dialog .el-dialog__body {
  padding-top: 10px !important;
}

.no-header-msgbox .el-message-box__header {
  display: none !important;
}

.no-header-msgbox .el-message-box__content {
  padding-top: 10px !important;
}
</style>

<style scoped lang="less">
.app-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font-family: ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  box-sizing: border-box;
  border-radius: 8px;
  position: relative;
  z-index: 1;
}

html.dark .app-container {
  background-color: var(--el-bg-color);
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
  padding: 8px 18px 0 12px;
  margin: 0;
  overflow-y: auto;
  scroll-behavior: auto !important;
  background-color: transparent !important;
  scrollbar-gutter: stable;
  will-change: scroll-position;
  transform: translateZ(0);
}

.main-area-wrapper {
  --window-nav-raise: 46px;
  --window-nav-safe-bottom: 118px;
  --window-nav-height: 74vh;
}

.unified-nav-sidebar {
  position: absolute;
  right: 10px;
  top: calc(50% - var(--window-nav-raise));
  transform: translateY(-50%);
  height: min(var(--window-nav-height), calc(100% - var(--window-nav-safe-bottom)));
  max-height: calc(100% - var(--window-nav-safe-bottom));
  min-height: 240px;
  width: 30px;
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 0;
  pointer-events: auto;
  flex-shrink: 0;
  padding: 2px 0;
}

.nav-mini-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(46, 41, 34, 0.72);
  background: transparent !important;
  border: none;
  box-shadow: none;
  transition: all 0.2s ease;
  font-size: 14px;
  border-radius: 999px;

  &:hover {
    color: rgba(28, 25, 22, 0.96);
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
    box-shadow: none;
  }
}

.nav-timeline-area {
  flex: 1;
  position: relative;
  width: 100%;
  min-height: 0;
  display: flex;
  justify-content: center;
  overflow: hidden;
  pointer-events: auto;
}

.timeline-track {
  display: none;
}

.timeline-scroller {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: visible;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 0;
  scroll-behavior: smooth;

  &::-webkit-scrollbar {
    display: none;
  }

  scrollbar-width: none;
}

.timeline-node-wrapper {
  width: 100%;
  min-height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  padding: 2px 0;

  &:hover .timeline-node {
    transform: translateX(-1px) scaleX(1.08);
  }

  &:hover .timeline-node.active {
    transform: translateX(-4px) scaleX(1.04);
  }
}

.timeline-node {
  width: 9px;
  height: 2px;
  border-radius: 999px;
  transition: all 0.18s ease;
  box-shadow: none;
  border: none;
  opacity: 1;

  &::before {
    content: none;
  }

  &.user {
    background: rgba(64, 158, 255, 0.96);
  }

  &.assistant {
    background: rgba(0, 0, 0, 0.96);
  }

  &.active {
    width: 15px;
    height: 3px;
    opacity: 1;
    transform: translateX(-4px);
  }
}

.timeline-node-text {
  display: none;
}

.node-tooltip {
  position: absolute;
  right: 28px;
  top: 50%;
  transform: translateY(-50%) translateX(10px) scale(0.9);
  background-color: var(--el-color-black);
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  z-index: 100;
}

html.dark {
  .nav-mini-btn {
    color: rgba(235, 236, 240, 0.75);
    background: rgba(255, 255, 255, 0.06);
    border: none;
    box-shadow: none;

    &:hover {
      color: rgba(255, 255, 255, 0.96);
      background: rgba(255, 255, 255, 0.12);
      box-shadow: none;
    }
  }

  .timeline-node.user {
    background: rgba(96, 165, 250, 0.98);
  }

  .timeline-node.assistant {
    background: rgba(255, 255, 255, 0.96);
  }

  .node-tooltip {
    background-color: #E5EAF3;
    color: #000;
  }
}

@media (max-height: 760px) {
  .main-area-wrapper {
    --window-nav-raise: 56px;
    --window-nav-safe-bottom: 148px;
    --window-nav-height: 54vh;
  }
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

.mcp-limit-hint.warning {
  color: var(--el-color-danger);
  font-weight: bold;
}

.footer-left-controls {
  display: flex;
  align-items: center;
}

:deep(.image-error-container) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 15px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
}

:deep(.image-error-container:hover) {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

:deep(.image-error-container svg) {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.persistent-btn {
  color: var(--el-text-color-secondary);
  width: 28px;
  height: 28px;
}

.persistent-btn:hover {
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

html.dark .persistent-btn:hover {
  background-color: var(--el-fill-color-darker);
}

.persistent-btn.is-persistent-active {
  color: #67C23A;
}

.persistent-btn.is-persistent-active:hover {
  background-color: rgba(103, 194, 58, 0.1);
}

.window-bg-base {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  background-color: var(--el-bg-color);
  transition: background-color 0.3s ease;
  pointer-events: none;
  will-change: background-color;
}

.window-bg-layer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  pointer-events: none;
  will-change: transform, opacity;
  transform: translateZ(0);

  /* 核心优化：默认透明，且具有过渡效果 */
  opacity: 0;
  transition: opacity 0.4s ease-in-out, filter 0.3s ease;
}

.app-container.has-bg,
html.dark .app-container.has-bg,
body .app-container.has-bg {
  background-color: transparent !important;
  background: none !important;
}

.app-container.has-bg :deep(.title-bar),
.app-container.has-bg :deep(.model-header),
.app-container.has-bg :deep(.input-footer) {
  background-color: transparent !important;
}

.app-container.has-bg :deep(.chat-input-area-vertical) {
  background-color: rgba(255, 255, 255, 0.45) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.app-container.has-bg :deep(.chat-input-area-vertical .el-textarea__inner) {
  background-color: transparent !important;
}

html.dark .app-container.has-bg :deep(.chat-input-area-vertical) {
  background-color: rgba(30, 30, 30, 0.45) !important;
}

html.dark .app-container.has-bg :deep(.title-bar) {

  /* 强制功能按钮（Pin, Top）和 Mac红绿灯图标变亮 */
  .func-btn,
  .traffic-icon {
    color: rgba(255, 255, 255, 0.9) !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    /* 增加文字阴影提高对比度 */
  }

  .func-btn:hover {
    background-color: rgba(255, 255, 255, 0.15);
  }

  /* 强制 Windows/Linux 窗口控制按钮变亮 */
  .win-btn,
  .linux-btn {
    color: rgba(255, 255, 255, 0.9) !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }

  .win-btn:hover,
  .linux-btn:hover {
    background-color: rgba(255, 255, 255, 0.15);
  }

  /* Windows 关闭按钮悬浮仍保持红色 */
  .win-btn.close:hover {
    background-color: #E81123 !important;
    color: white !important;
  }

  /* Linux 关闭按钮悬浮仍保持红色 */
  .linux-btn.close:hover {
    background-color: #E95420 !important;
    color: white !important;
  }

  /* 标题和文字颜色增强 */
  .app-title,
  .conversation-title,
  .download-icon {
    color: rgba(255, 255, 255, 0.95);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  }

  .app-info-inner:hover,
  .conversation-inner:hover {
    background-color: rgba(255, 255, 255, 0.15);
  }

  .divider-vertical {
    background-color: rgba(255, 255, 255, 0.3);
  }
}

.app-container.has-bg :deep(.el-dialog),
.app-container.has-bg :deep(.el-message-box) {
  background-color: rgba(255, 255, 255, 0.9) !important;
  backdrop-filter: none !important;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.1);
}

.app-container.has-bg :deep(.el-dialog__header),
.app-container.has-bg :deep(.el-dialog__body),
.app-container.has-bg :deep(.el-dialog__footer),
.app-container.has-bg :deep(.el-message-box__header),
.app-container.has-bg :deep(.el-message-box__content),
.app-container.has-bg :deep(.el-message-box__btns) {
  background-color: transparent !important;
}

html.dark .app-container.has-bg :deep(.el-dialog),
html.dark .app-container.has-bg :deep(.el-message-box) {
  background-color: rgba(40, 40, 40, 0.9) !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* 弹窗内输入框 */
.app-container.has-bg :deep(.el-dialog .el-textarea__inner),
.app-container.has-bg :deep(.el-dialog .el-input__wrapper) {
  background-color: rgba(240, 240, 240, 0.45) !important;
  backdrop-filter: none !important;
}

html.dark .app-container.has-bg :deep(.el-dialog .el-textarea__inner),
html.dark .app-container.has-bg :deep(.el-dialog .el-input__wrapper) {
  background-color: rgba(20, 20, 20, 0.45) !important;
}

.app-container.has-bg :deep(.option-selector-wrapper),
.app-container.has-bg :deep(.waveform-display-area) {
  background-color: rgba(255, 255, 255, 0.45) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

html.dark .app-container.has-bg :deep(.option-selector-wrapper),
html.dark .app-container.has-bg :deep(.waveform-display-area) {
  background-color: rgba(30, 30, 30, 0.45) !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
}

.app-container.has-bg :deep(.option-selector-wrapper .el-scrollbar__view) {
  /* 确保滚动内容区域背景透明，继承父级 */
  background-color: transparent !important;
}

.app-container.has-bg :deep(.recording-status-text) {
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
}

html.dark .app-container.has-bg :deep(.recording-status-text) {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

/* 模型选择药丸 */
.app-container.has-bg :deep(.model-pill) {
  background-color: rgba(255, 255, 255, 0.6);
  backdrop-filter: none !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.app-container.has-bg :deep(.model-pill:hover) {
  background-color: #fff;
}

html.dark .app-container.has-bg :deep(.model-pill) {
  background-color: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

html.dark .app-container.has-bg :deep(.model-pill:hover) {
  background-color: rgba(0, 0, 0, 0.7);
}

.app-container.has-bg :deep(.user-bubble .el-bubble-content) {
  background-color: rgba(245, 244, 237, 0.7) !important;
  /* 用户指定 */
  backdrop-filter: none !important;
  border: 1px solid rgba(255, 255, 255, 0.45);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* AI 气泡 */
.app-container.has-bg :deep(.ai-bubble .el-bubble-content) {
  background-color: rgba(255, 255, 255, 0.45) !important;
  /* 用户指定 */
  backdrop-filter: none !important;
  border: 1px solid rgba(255, 255, 255, 0.45);
  /* 用户指定 Padding */
  padding: 10px !important;
}

/* 深色模式气泡 */
html.dark .app-container.has-bg :deep(.user-bubble .el-bubble-content) {
  background-color: rgba(47, 47, 47, 0.7) !important;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

html.dark .app-container.has-bg :deep(.ai-bubble .el-bubble-content) {
  background-color: rgba(33, 33, 33, 0.45) !important;
  border-color: rgba(255, 255, 255, 0.1);
}

/* 功能按钮 */
.app-container.has-bg :deep(.footer-actions .el-button.is-circle) {
  background-color: rgba(255, 255, 255, 0.6);
  backdrop-filter: none !important;
}

.app-container.has-bg :deep(.footer-actions .el-button.is-circle:hover) {
  background-color: #fff;
}

html.dark .app-container.has-bg :deep(.footer-actions .el-button.is-circle) {
  background-color: rgba(0, 0, 0, 0.5);
  color: #e0e0e0;
}

html.dark .app-container.has-bg :deep(.footer-actions .el-button.is-circle:hover) {
  background-color: rgba(60, 60, 60, 1);
}

/* 思考模式 */
.app-container.has-bg :deep(.el-thinking .trigger) {
  background-color: rgba(255, 255, 255, 0.7) !important;
  backdrop-filter: none !important;
}

.app-container.has-bg :deep(.el-thinking .content pre) {
  background-color: rgba(255, 255, 255, 0.3) !important;
}

html.dark .app-container.has-bg :deep(.el-thinking .trigger) {
  background-color: rgba(44, 46, 51, 0.7) !important;
}

html.dark .app-container.has-bg :deep(.el-thinking .content pre) {
  background-color: rgba(0, 0, 0, 0.3) !important;
}

.app-container.has-bg :deep(.tool-collapse .el-collapse-item__header) {
  background-color: rgba(255, 255, 255, 0.45) !important;
  backdrop-filter: none !important;
  border-color: rgba(255, 255, 255, 0.2);
}

.app-container.has-bg :deep(.tool-collapse .el-collapse-item__wrap) {
  background-color: transparent !important;
  border-color: rgba(255, 255, 255, 0.2);
}

.app-container.has-bg :deep(.tool-call-details .tool-detail-section pre) {
  background-color: rgba(255, 255, 255, 0.7) !important;
}

html.dark .app-container.has-bg :deep(.tool-collapse .el-collapse-item__header) {
  background-color: rgba(0, 0, 0, 0.7) !important;
  border-color: rgba(255, 255, 255, 0.1);
}

html.dark .app-container.has-bg :deep(.tool-collapse .el-collapse-item__wrap) {
  border-color: rgba(255, 255, 255, 0.1);
}

html.dark .app-container.has-bg :deep(.tool-call-details .tool-detail-section pre) {
  background-color: rgba(0, 0, 0, 0.5) !important;
  border-color: rgba(255, 255, 255, 0.05);
}

.skill-single-row {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
  padding: 4px 10px 0px 0px;
}

.skill-name-fixed {
  flex-shrink: 0;
  font-weight: 600;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-desc-inline {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  /* 自动占据中间剩余空间 */
  min-width: 0;
  opacity: 0.8;
  margin-top: 1px;
}

.subagent-toggle-btn-small {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  transition: all 0.2s;
  background-color: transparent;
  margin-left: 8px;
}

.subagent-toggle-btn-small:hover {
  background-color: var(--el-fill-color-dark);
  color: var(--el-text-color-primary);
}

.subagent-toggle-btn-small.is-active {
  color: #E6A23C;
  background-color: rgba(230, 162, 60, 0.15);
}

/* 确保深色模式下样式正常 */
html.dark .subagent-toggle-btn-small:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.bw-btn.el-button--primary {
  /* 浅色下变黑底，深色下变白底 */
  background-color: var(--el-text-color-primary) !important;
  border-color: var(--el-text-color-primary) !important;
  /* 浅色下变白字，深色下变黑字 */
  color: var(--el-bg-color) !important;
  font-weight: 600;
  transition: opacity 0.2s, transform 0.1s;
}

.bw-btn.el-button--primary:hover {
  opacity: 0.85;
}

.bw-btn.el-button--primary:active {
  transform: scale(0.96);
}

.bw-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: var(--el-text-color-primary) !important;
  border-color: var(--el-text-color-primary) !important;
}

.bw-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner::after) {
  border-color: var(--el-bg-color) !important;
}

.bw-checkbox :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: var(--el-text-color-primary) !important;
  font-weight: 600;
}

.bw-checkbox :deep(.el-checkbox__inner:hover) {
  border-color: var(--el-text-color-primary) !important;
}

.mcp-server-item-wrapper:has(.mcp-server-item.is-checked) {
  border-color: var(--el-text-color-primary) !important;
  /* 黑/白边框 */
  background-color: var(--el-fill-color-light) !important;
  /* 浅灰背景 */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  /* 轻微浮起感 */
}

.mcp-server-item-wrapper:hover {
  border-color: var(--el-text-color-primary) !important;
  background-color: var(--el-fill-color) !important;
}

.mcp-server-item.is-checked {
  background-color: transparent !important;
  /* 让位给外层容器 */
}

.mcp-server-item :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: var(--el-text-color-primary) !important;
  border-color: var(--el-text-color-primary) !important;
}

.mcp-server-item :deep(.el-checkbox__input.is-checked .el-checkbox__inner::after) {
  border-color: var(--el-bg-color) !important;
}

.mcp-server-item .el-tag {
  background-color: transparent !important;
  border-color: var(--el-border-color-darker) !important;
  color: var(--el-text-color-secondary) !important;
  transition: all 0.2s;
}

.mcp-server-item :deep(.el-checkbox__input.is-focus .el-checkbox__inner),
.mcp-server-item :deep(.el-checkbox__inner:hover) {
  border-color: var(--el-text-color-primary) !important;
}

.mcp-server-item :deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner) {
  background-color: var(--el-text-color-primary) !important;
  border-color: var(--el-text-color-primary) !important;
}

.mcp-server-item :deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner::before) {
  background-color: var(--el-bg-color) !important;
}

.mcp-server-item.is-checked .el-tag,
.mcp-server-item-wrapper:hover .el-tag {
  border-color: var(--el-text-color-primary) !important;
  color: var(--el-text-color-primary) !important;
  font-weight: 500;
}

.mcp-server-item .el-tag.type-tag {
  background-color: var(--el-fill-color) !important;
}

html.dark .mcp-server-item-wrapper:has(.mcp-server-item.is-checked) {
  background-color: rgba(255, 255, 255, 0.05) !important;
  box-shadow: none;
}

html.dark .mcp-server-item .el-tag {
  border-color: #4C4D4F !important;
}
</style>
