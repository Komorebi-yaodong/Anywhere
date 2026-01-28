<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch, h, computed, defineAsyncComponent } from 'vue';
import { ElContainer, ElMain, ElDialog, ElImageViewer, ElMessage, ElMessageBox, ElInput, ElButton, ElCheckbox, ElButtonGroup, ElTag, ElTooltip, ElIcon, ElAvatar, ElSwitch } from 'element-plus';
import { createClient } from "webdav/web";
import { DocumentCopy, QuestionFilled, Download, Search, Tools, CaretRight, Collection, Warning, Cpu } from '@element-plus/icons-vue';

import TitleBar from './components/TitleBar.vue';
import ChatHeader from './components/ChatHeader.vue';
const ChatMessage = defineAsyncComponent(() => import('./components/ChatMessage.vue'));
import ChatInput from './components/ChatInput.vue';
import ModelSelectionDialog from './components/ModelSelectionDialog.vue';

import DOMPurify from 'dompurify';
import { marked } from 'marked';

import TextSearchUI from './utils/TextSearchUI.js';
import { formatTimestamp, sanitizeToolArgs } from './utils/formatters.js';

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

// 核心状态：是否粘滞在底部
const isSticky = ref(true);
let chatObserver = null;    // DOM 观察器实例

let autoSaveInterval = null;

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
const isAlwaysOnTop = ref(true);
const currentOS = ref('win');

const currentProviderID = ref(defaultConfig.config.providerOrder[0]);
const base_url = ref("");
const api_key = ref("");
const history = ref([]);
const chat_show = ref([]);
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
      console.log(`[Background] Cache miss, downloading in background: ${newUrl}`);
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

const changeModel_page = ref(false);
const systemPromptDialogVisible = ref(false);
const systemPromptContent = ref('');
const imageViewerVisible = ref(false);
const imageViewerSrcList = ref([]);
const imageViewerInitialIndex = ref(0);

const toolCallControllers = ref(new Map());
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
const handleToggleAutoApprove = (val) => {
  isAutoApproveTools.value = val;

  if (val) {
    pendingToolApprovals.value.forEach((resolve, id) => {
      resolve(true);
    });
    pendingToolApprovals.value.clear();

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

const isMcpDialogVisible = ref(false);
const sessionMcpServerIds = ref([]);
const openaiFormattedTools = ref([]);
const mcpSearchQuery = ref('');
const isMcpLoading = ref(false);
const mcpFilter = ref('all');
const mcpToolCache = ref({});
const expandedMcpServers = ref(new Set());

const toggleMcpServerExpansion = (serverId) => {
  if (expandedMcpServers.value.has(serverId)) {
    expandedMcpServers.value.delete(serverId);
  } else {
    expandedMcpServers.value.add(serverId);
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
    } catch (e) {
      console.error("Fetch skills failed:", e);
    }
  }
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
    if (currentConfig.value.mcpServers) {
        const builtinIds = Object.entries(currentConfig.value.mcpServers)
          .filter(([, server]) => server.type === 'builtin')
          .map(([id]) => id);
        
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
            await applyMcpTools(false); // 重新加载 MCP
            return; 
        }
    }
    showDismissibleMessage.success(`已启用 Skill "${skillName}"`);
  } else {
    sessionSkillIds.value.splice(index, 1);
    // 同步删除 temp
    const tempIndex = tempSessionSkillIds.value.indexOf(skillName);
    if(tempIndex !== -1) tempSessionSkillIds.value.splice(tempIndex, 1);
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

  if (sessionSkillIds.value.length > 0 && currentConfig.value.mcpServers) {
    const builtinIds = Object.entries(currentConfig.value.mcpServers)
      .filter(([, server]) => server.type === 'builtin')
      .map(([id]) => id);

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
      await applyMcpTools(false);
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
  focusedMessageIndex.value = null;

  // 点击按钮时，为了视觉反馈，可以使用平滑滚动
  scrollToBottom('smooth');

  setTimeout(() => { isForcingScroll.value = false; }, 500);
};

const findFocusedMessageIndex = () => {
  const container = chatContainerRef.value?.$el;
  if (!container) return;
  const scrollTop = container.scrollTop;
  let closestIndex = -1;
  let smallestDistance = Infinity;
  for (let i = chat_show.value.length - 1; i >= 0; i--) {
    const msgComponent = getMessageComponentByIndex(i);
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

// 滚动监听：仅负责更新 isSticky 状态和 UI 按钮显示
const handleScroll = (event) => {
  if (isForcingScroll.value) return;

  const el = event.target;
  if (!el) return;

  // 计算距离底部的距离
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  const tolerance = 20; // 容差值

  // 核心逻辑：用户只要向上滚动离开底部，就取消粘滞；一旦触底，重新激活粘滞
  const atBottom = distanceToBottom <= tolerance;

  if (atBottom) {
    if (!isSticky.value) isSticky.value = true;
    if (!isAtBottom.value) isAtBottom.value = true;
    showScrollToBottomButton.value = false;
    focusedMessageIndex.value = null;
  } else {
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
  const targetComponent = getMessageComponentByIndex(currentIndex);
  const container = chatContainerRef.value?.$el;
  if (!targetComponent || !container) return;
  const element = targetComponent.$el;
  const scrollDifference = container.scrollTop - element.offsetTop;
  if (scrollDifference > 5) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (currentIndex > 0) {
    const newIndex = currentIndex - 1;
    focusedMessageIndex.value = newIndex;
    const previousComponent = getMessageComponentByIndex(newIndex);
    if (previousComponent) previousComponent.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const navigateToNextMessage = () => {
  findFocusedMessageIndex();
  if (focusedMessageIndex.value !== null && focusedMessageIndex.value < chat_show.value.length - 1) {
    focusedMessageIndex.value++;
    const targetComponent = getMessageComponentByIndex(focusedMessageIndex.value);
    if (targetComponent) targetComponent.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    forceScrollToBottom();
  }
};

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
const handleOpenModelDialog = async () => {
  try {
    const result = await window.api.getConfig();
    if (result && result.config) {
      currentConfig.value.providers = result.config.providers;
      currentConfig.value.providerOrder = result.config.providerOrder;

      const newModelList = [];
      const newModelMap = {};
      currentConfig.value.providerOrder.forEach(id => {
        const provider = currentConfig.value.providers[id];
        if (provider?.enable) {
          provider.modelList.forEach(m => {
            const key = `${id}|${m}`;
            newModelList.push({ key, value: key, label: `${provider.name}|${m}` });
            newModelMap[key] = `${provider.name}|${m}`;
          });
        }
      });
      modelList.value = newModelList;
      modelMap.value = newModelMap;

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
  if (autoCloseOnBlur.value) window.addEventListener('blur', closePage);
  else window.removeEventListener('blur', closePage);
};
const handleToggleAlwaysOnTop = () => {
  window.api.toggleAlwaysOnTop();
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
  if (isFilePickerOpen.value) {
    isFilePickerOpen.value = false;
  }
  setTimeout(() => {
    if (systemPromptDialogVisible.value) {
      return;
    }
    if (document.activeElement && document.activeElement.tagName.toLowerCase() === 'textarea' && document.activeElement.closest('.editing-wrapper')) {
      return;
    }
    if (document.activeElement && document.activeElement.closest('.text-search-container')) {
      return;
    }
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
  const element = childComponent?.$el;

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

const closePage = async () => {
  // 1. 如果是为了打开文件选择器而失去焦点，拦截关闭
  if (isFilePickerOpen.value) return;

  // 条件：配置了本地存储路径 且 当前对话已有名称
  if (currentConfig.value?.webdav?.localChatPath && defaultConversationName.value) {
    try {
      await autoSaveSession();
    } catch (e) {
      console.error("关闭时自动保存失败:", e);
    }
  }

  // 3. 关闭窗口
  // window.close();
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

  if (window.api && window.api.onAlwaysOnTopChanged) {
    window.api.onAlwaysOnTopChanged((newState) => {
      isAlwaysOnTop.value = newState;
    });
  }

  textSearchInstance = new TextSearchUI({
    scope: '.chat-main',
    theme: currentConfig.value?.isDarkMode ? 'dark' : 'light'
  });

  window.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('blur', handleWindowBlur);
  const chatMainElement = chatContainerRef.value?.$el;
  if (chatMainElement) {
    chatMainElement.addEventListener('click', handleMarkdownImageClick);

    chatObserver = new MutationObserver(() => {
      // 只要处于粘滞状态，任何 DOM 变化（文字生成、元素高度变化）
      // 都立即将 scrollTop 设为最大值。这在浏览器重绘前发生，因此视觉上是“内容上推”。
      if (isSticky.value) {
        chatMainElement.scrollTop = chatMainElement.scrollHeight;
      }
    });

    // 监听子节点变化（新消息）和子树字符数据变化（打字机效果）
    chatObserver.observe(chatMainElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  const initializeWindow = async (data = null) => {
    try {
      const configData = await window.api.getConfig();
      currentConfig.value = configData.config;
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

    const code = data?.code || "AI";
    const currentPromptConfig = currentConfig.value.prompts[code] || defaultConfig.config.prompts.AI;
    if (currentPromptConfig.backgroundImage) {
      loadBackground(currentPromptConfig.backgroundImage);
    }
    isAlwaysOnTop.value = data?.isAlwaysOnTop ?? currentPromptConfig.isAlwaysOnTop ?? true;
    zoomLevel.value = currentPromptConfig.zoom || currentConfig.value.zoom || 1;
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
      favicon.value = currentConfig.value.isDarkMode ? "favicon-b.png" : "favicon.png";
    }

    autoCloseOnBlur.value = currentPromptConfig.autoCloseOnBlur ?? false;
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
    if (data) {
      basic_msg.value = { code: data.code, type: data.type, payload: data.payload };
      if (data.filename) defaultConversationName.value = data.filename.replace(/\.json$/i, '');

      if (data.type === "over" && data.payload) {
        let sessionLoaded = false;
        try {
          let old_session = JSON.parse(data.payload);
          if (old_session && old_session.anywhere_history === true) { sessionLoaded = true; await loadSession(old_session); autoCloseOnBlur.value = false; }
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
        if (currentPromptConfig.isDirectSend_normal) {
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
            if (fileObject) { sessionLoaded = await checkAndLoadSessionFromFile(fileObject); }
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
    if (autoCloseOnBlur.value) {
      window.addEventListener('blur', closePage);
    }

    // --- MCP 加载逻辑 ---
    const defaultMcpServers = currentPromptConfig.defaultMcpServers || [];
    let mcpServersToLoad = [...defaultMcpServers];

    // 如果存在 Skill，强制合并内置 MCP 服务
    if (sessionSkillIds.value.length > 0 && currentConfig.value.mcpServers) {
      const builtinIds = Object.entries(currentConfig.value.mcpServers)
        .filter(([, server]) => server.type === 'builtin')
        .map(([id]) => id);
      // 去重合并
      mcpServersToLoad = [...new Set([...mcpServersToLoad, ...builtinIds])];
    }

    if (mcpServersToLoad.length > 0) {
      // 过滤出有效的 ID
      const validIds = mcpServersToLoad.filter(id =>
        currentConfig.value.mcpServers && currentConfig.value.mcpServers[id]
      );

      sessionMcpServerIds.value = [...validIds];
      tempSessionMcpServerIds.value = [...validIds];
      await applyMcpTools(false);
    }

    await fetchSkillsList();

    if (shouldDirectSend) {
      scrollToBottom();
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
  if (autoSaveInterval) clearInterval(autoSaveInterval);
  autoSaveInterval = setInterval(autoSaveSession, 15000);
  window.addEventListener('error', handleGlobalImageError, true);
  window.addEventListener('keydown', handleGlobalKeyDown);

  if (window.api && window.api.onConfigUpdated) {
    window.api.onConfigUpdated((newConfig) => {
      if (newConfig) {
        currentConfig.value = newConfig;
        if (newConfig.zoom !== undefined) {
          zoomLevel.value = newConfig.zoom;
        }
      }
    });
  }
});

const autoSaveSession = async () => {
  if (loading.value || !currentConfig.value?.webdav?.localChatPath) {
    return;
  }

  // 2. 获取当前快捷助手的配置
  const promptConfig = currentConfig.value?.prompts?.[CODE.value];
  const isAutoSaveConfigEnabled = promptConfig?.autoSaveChat ?? true;

  if (!defaultConversationName.value && !isAutoSaveConfigEnabled) {
    return;
  }

  // 自动命名逻辑：
  if (!defaultConversationName.value && chat_show.value.length > 0) {
    const firstUserMsg = chat_show.value.find(msg => msg.role === 'user');
    if (firstUserMsg) {
      let namePrefix = '';
      const content = firstUserMsg.content;

      // 提取并清洗用户输入内容，作为文件名前缀
      if (Array.isArray(content)) {
        const hasImage = content.some(p => p.type === 'image_url');
        const hasFile = content.some(p => p.type === 'file');
        const textPart = content.find(p => p.type === 'text');

        if (hasImage) {
          namePrefix = '图片';
        } else if (hasFile) {
          namePrefix = '文件';
        } else if (textPart?.text) {
          namePrefix = textPart.text.slice(0, 20).replace(/[\\/:*?"<>|\n\r]/g, '').trim();
        }
      } else if (typeof content === 'string') {
        namePrefix = content.slice(0, 20).replace(/[\\/:*?"<>|\n\r]/g, '').trim();
      }

      if (namePrefix) {
        // 清洗智能助手名称中的非法字符 (如 /, \, :, *, ?, ", <, >, |)
        const safeCodeName = CODE.value.replace(/[\\/:*?"<>|]/g, '_');

        // 添加时间戳避免文件名重复覆盖
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

        // 组合文件名
        defaultConversationName.value = `${namePrefix}-${safeCodeName}-${timestamp}`;
      }
    }
  }

  // 5. 如果经过尝试后仍然没有对话名称（例如空对话），则不保存
  if (!defaultConversationName.value) {
    return;
  }

  // 6. 执行写入操作
  try {
    const sessionData = getSessionDataAsObject();
    const jsonString = JSON.stringify(sessionData, null, 2);
    const filePath = `${currentConfig.value.webdav.localChatPath}/${defaultConversationName.value}.json`;
    await window.api.writeLocalFile(filePath, jsonString);
  } catch (error) {
    console.error('Auto-save failed:', error);
  }
};

onBeforeUnmount(async () => {
  window.removeEventListener('wheel', handleWheel);
  window.removeEventListener('focus', handleWindowFocus);
  window.removeEventListener('blur', handleWindowBlur);
  if (textSearchInstance) textSearchInstance.destroy();
  if (!autoCloseOnBlur.value) window.removeEventListener('blur', closePage);
  const chatMainElement = chatContainerRef.value?.$el;
  if (chatMainElement) chatMainElement.removeEventListener('click', handleMarkdownImageClick);
  await window.api.closeMcpClient();
  window.removeEventListener('error', handleGlobalImageError, true);
  window.removeEventListener('keydown', handleGlobalKeyDown);

  if (chatObserver) {
    chatObserver.disconnect();
    chatObserver = null;
  }
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

const getSessionDataAsObject = () => {
  const currentPromptConfig = currentConfig.value.prompts[CODE.value] || {};
  return {
    anywhere_history: true, CODE: CODE.value, basic_msg: basic_msg.value, isInit: isInit.value,
    autoCloseOnBlur: autoCloseOnBlur.value, model: model.value,
    currentPromptConfig: currentPromptConfig, history: history.value, chat_show: chat_show.value, selectedVoice: selectedVoice.value,
    activeMcpServerIds: sessionMcpServerIds.value || [],
    activeSkillIds: sessionSkillIds.value || [],
    isAutoApproveTools: isAutoApproveTools.value
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
        h('p', { style: 'margin-bottom: 15px; font-size: 14px; color: var(--el-text-color-regular);' }, '请输入会话名称。'),
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

const saveSessionAsHtml = async () => {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const fileTimestamp = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const defaultBasename = defaultConversationName.value || `${CODE.value || 'AI'}-${fileTimestamp}`;
  const inputValue = ref(defaultBasename);

  const defaultAiSvg = `<svg width="200" height="200" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="#FDA5A5" /><g stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"><rect x="25" y="32" width="50" height="42" rx="8" /><line x1="40" y1="63" x2="60" y2="63" /><line x1="35" y1="32" x2="32" y2="22" /><line x1="65" y1="32" x2="68" y2="22" /></g><g fill="white" stroke="none"><circle cx="40" cy="48" r="3.5" /><circle cx="60" cy="48" r="3.5" /><circle cx="32" cy="20" r="3" /><circle cx="68" cy="20" r="3" /></g></svg>`;

  const generateHtmlContent = () => {
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
        h('p', { style: 'margin-bottom: 15px; font-size: 14px; color: var(--el-text-color-regular);' }, '请输入会话名称。'),
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
            const htmlContent = generateHtmlContent();
            await window.api.saveFile({ title: '保存为 HTML', defaultPath: finalFilename, buttonLabel: '保存', filters: [{ name: 'HTML 文件', extensions: ['html'] }, { name: '所有文件', extensions: ['*'] }], fileContent: htmlContent });
            defaultConversationName.value = finalBasename;
            showDismissibleMessage.success('会话已成功保存为 HTML！');
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
            let fullDefaultPath = finalFilename;
            const localChatPath = currentConfig.value.webdav?.localChatPath;
            if (localChatPath) {
              const separator = basic_msg.value.os === 'win' ? '\\' : '/';
              fullDefaultPath = `${localChatPath}${separator}${finalFilename}`;
            }

            await window.api.saveFile({
              title: '保存聊天会话',
              defaultPath: fullDefaultPath,
              buttonLabel: '保存',
              filters: [{ name: 'JSON 文件', extensions: ['json'] }, { name: '所有文件', extensions: ['*'] }],
              fileContent: jsonString
            });

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

  try {
    const { value: userInput } = await ElMessageBox.prompt(
      '请输入新的会话名称',
      '重命名对话',
      {
        inputValue: oldBaseName,
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        inputValidator: (val) => {
          if (!val || !val.trim()) return '名称不能为空';
          if (/[\\/:*?"<>|]/.test(val)) return '文件名包含非法字符';
          return true;
        },
        customClass: 'filename-prompt-dialog', // 复用已有的弹窗样式
      }
    );

    let newBaseName = (userInput || "").trim();
    if (newBaseName.toLowerCase().endsWith('.json')) newBaseName = newBaseName.slice(0, -5);

    if (newBaseName === oldBaseName) return;

    const newFilename = `${newBaseName}.json`;
    const newFilePath = `${localPath}/${newFilename}`;

    // 检查本地是否存在同名文件
    const files = await window.api.listJsonFiles(localPath);
    if (files.some(f => f.basename === newFilename)) {
      showDismissibleMessage.error(`文件名 "${newFilename}" 已存在，操作取消`);
      return;
    }

    // 执行本地重命名
    await window.api.renameLocalFile(oldFilePath, newFilePath);
    defaultConversationName.value = newBaseName;
    showDismissibleMessage.success('本地重命名成功');

    // 尝试同步重命名云端文件
    const { url, username, password, data_path } = currentConfig.value.webdav || {};
    if (url && data_path) {
      try {
        const client = createClient(url, { username, password });
        const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
        const oldRemotePath = `${remoteDir}/${oldFilename}`;
        const newRemotePath = `${remoteDir}/${newFilename}`;

        // 检查云端是否存在该文件
        if (await client.exists(oldRemotePath)) {
          await ElMessageBox.confirm(
            '云端也存在同名文件，是否同步重命名？',
            '同步操作提示',
            { confirmButtonText: '是', cancelButtonText: '否', type: 'info' }
          );
          await client.moveFile(oldRemotePath, newRemotePath);
          showDismissibleMessage.success('云端同步重命名成功');
        }
      } catch (e) {
        if (e !== 'cancel' && e !== 'close') {
          console.warn('Cloud rename skipped:', e);
        }
      }
    }

  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      showDismissibleMessage.error(`操作失败: ${error.message}`);
    }
  }
};

const handleSaveAction = async () => {
  if (autoCloseOnBlur.value) handleTogglePin();
  const isCloudEnabled = currentConfig.value.webdav?.url && currentConfig.value.webdav?.data_path;
  const saveOptions = [];

  // 只有当已存在本地文件名（即已保存过）且配置了本地路径时，才显示重命名选项
  if (currentConfig.value.webdav?.localChatPath && defaultConversationName.value) {
    saveOptions.push({
      title: '重命名对话',
      description: '修改当前对话名称，并同步修改本地文件（以及云端文件）。',
      buttonType: 'warning',
      action: handleRenameSession
    });
  }

  if (isCloudEnabled) {
    saveOptions.push({ title: '保存到云端', description: '同步到 WebDAV 服务器，支持跨设备访问。', buttonType: 'success', action: saveSessionToCloud });
  }

  saveOptions.push({ title: '保存为 JSON', description: '保存为可恢复的会話文件，便于下次继续。', buttonType: 'primary', action: saveSessionAsJson, isDefault: true });
  saveOptions.push({ title: '保存为 Markdown', description: '导出为可读性更强的 .md 文件，适合分享。', buttonType: '', action: saveSessionAsMarkdown });
  saveOptions.push({ title: '保存为 HTML', description: '导出为带样式的网页文件，保留格式和图片。', buttonType: '', action: saveSessionAsHtml });

  const messageVNode = h('div', { class: 'save-options-list' }, saveOptions.map(opt => {
    const trigger = () => { ElMessageBox.close(); opt.action(); };

    return h('div', { class: 'save-option-item', onClick: trigger }, [
      h('div', { class: 'save-option-text' }, [
        h('h4', null, opt.title), h('p', null, opt.description)
      ]),
      h(ElButton, {
        type: opt.buttonType,
        plain: true,
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
    selectedVoice.value = jsonData.selectedVoice || '';
    tempReasoningEffort.value = jsonData.currentPromptConfig?.reasoning_effort || 'default';
    isAutoApproveTools.value = jsonData.isAutoApproveTools || true;

    const configData = await window.api.getConfig();
    currentConfig.value = configData.config;

    zoomLevel.value = currentConfig.value.zoom || 1;
    if (window.api && typeof window.api.setZoomFactor === 'function') window.api.setZoomFactor(zoomLevel.value);

    if (currentConfig.value.isDarkMode) { document.documentElement.classList.add('dark'); }
    else { document.documentElement.classList.remove('dark'); }

    const currentPromptConfigFromLoad = jsonData.currentPromptConfig || currentConfig.value.prompts[CODE.value];
    if (currentPromptConfigFromLoad && currentPromptConfigFromLoad.icon) {
      AIAvart.value = currentPromptConfigFromLoad.icon;
      favicon.value = currentPromptConfigFromLoad.icon;
    } else {
      AIAvart.value = "ai.svg";
      favicon.value = currentConfig.value.isDarkMode ? "favicon-b.png" : "favicon.png";
    }

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
      applyMcpTools(false);
    } else {
      sessionMcpServerIds.value = [];
      tempSessionMcpServerIds.value = [];
      applyMcpTools(false);
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

async function applyMcpTools(show_none = true) {
  isMcpDialogVisible.value = false;
  isMcpLoading.value = true;
  await nextTick();

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
        env: serverConf.env,
        headers: serverConf.headers,
        isPersistent: serverConf.isPersistent,
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

const askAI = async (forceSend = false) => {
  if (loading.value) return;
  if (isMcpLoading.value) {
    showDismissibleMessage.info('正在加载工具，请稍后再试...');
    return;
  }

  // --- 1. 处理用户输入 (保持不变) ---
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

        autoSaveSession();

      } else return;
    } else return;
    prompt.value = "";
  }

  // --- 2. 初始化 AI 回合 ---
  loading.value = true;
  signalController.value = new AbortController();
  await nextTick();

  isSticky.value = true;
  scrollToBottom('auto');

  const currentPromptConfig = currentConfig.value.prompts[CODE.value];
  const isVoiceReply = !!selectedVoice.value;
  let useStream = currentPromptConfig?.stream && !isVoiceReply;
  let tool_calls_count = 0;

  let currentAssistantChatShowIndex = -1;

  try {
    const { OpenAI } = await import('openai');

    const openai = new OpenAI({
      apiKey: () => window.api.getRandomItem(api_key.value),
      baseURL: base_url.value,
      dangerouslyAllowBrowser: true,
      maxRetries: 3,
    });

    // --- 3. 开始工具调用循环 ---
    while (!signalController.value.signal.aborted) {
      chatInputRef.value?.focus({ cursor: 'end' });

      // --- 为本次请求创建临时消息列表 ---
      let messagesForThisRequest = JSON.parse(JSON.stringify(history.value));

      messagesForThisRequest = messagesForThisRequest.filter(msg => {
        if (msg.role === 'system' && (!msg.content || msg.content.trim() === '')) {
          return false;
        }
        return true;
      });

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

      const payload = {
        model: model.value.split("|")[1],
        messages: messagesForThisRequest,
        stream: useStream,
      };

      if (currentPromptConfig?.isTemperature) payload.temperature = currentPromptConfig.temperature;
      if (tempReasoningEffort.value && tempReasoningEffort.value !== 'default') payload.reasoning_effort = tempReasoningEffort.value;

      // --- 构建工具列表 (MCP + Skill) ---
      let activeTools = [...openaiFormattedTools.value];

      // [新增] 注入 Skill 工具定义
      if (sessionSkillIds.value.length > 0 && currentConfig.value.skillPath) {
        try {
          const skillToolDef = await window.api.getSkillToolDefinition(currentConfig.value.skillPath, sessionSkillIds.value);
          if (skillToolDef) {
            activeTools.push(skillToolDef);
          }
        } catch (e) {
          console.error("Failed to generate skill tool definition:", e);
        }
      }

      if (activeTools.length > 0) {
        payload.tools = activeTools;
        payload.tool_choice = "auto";
      }

      if (isVoiceReply) {
        payload.stream = false;
        useStream = false;
        payload.modalities = ["text", "audio"];
        payload.audio = { voice: selectedVoice.value.split('-')[0].trim(), format: "wav" };
      }

      const assistantMessageId = messageIdCounter.value++;
      chat_show.value.push({
        id: assistantMessageId,
        role: "assistant", content: [], reasoning_content: "", status: "",
        aiName: modelMap.value[model.value] || model.value.split('|')[1],
        voiceName: selectedVoice.value, tool_calls: []
      });
      currentAssistantChatShowIndex = chat_show.value.length - 1;

      if (isAtBottom.value) scrollToBottom('auto');

      let responseMessage;

      if (useStream) {
        const stream = await openai.chat.completions.create(payload, { signal: signalController.value.signal });

        let aggregatedReasoningContent = "";
        let aggregatedContent = "";
        let aggregatedToolCalls = [];
        let aggregatedExtraContent = null;
        let lastUpdateTime = Date.now();

        for await (const part of stream) {
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

          if (delta.reasoning_content) {
            aggregatedReasoningContent += delta.reasoning_content;
            if (chat_show.value[currentAssistantChatShowIndex].status !== 'thinking') {
              chat_show.value[currentAssistantChatShowIndex].status = 'thinking';
            }

            if (Date.now() - lastUpdateTime > 100) {
              chat_show.value[currentAssistantChatShowIndex].reasoning_content = aggregatedReasoningContent;
              lastUpdateTime = Date.now();
            }
          }
          if (delta.content) {
            aggregatedContent += delta.content;
            if (chat_show.value[currentAssistantChatShowIndex].status == 'thinking') {
              chat_show.value[currentAssistantChatShowIndex].status = 'end';
            }

            if (Date.now() - lastUpdateTime > 100) {
              chat_show.value[currentAssistantChatShowIndex].content = [{ type: 'text', text: aggregatedContent }];
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

              if (toolCallChunk.extra_content) {
                currentTool.extra_content = { ...currentTool.extra_content, ...toolCallChunk.extra_content };
              }
            }
          }
        }

        responseMessage = {
          role: 'assistant',
          content: aggregatedContent || null,
          reasoning_content: aggregatedReasoningContent || null,
          extra_content: aggregatedExtraContent
        };

        if (aggregatedToolCalls.length > 0) {
          responseMessage.tool_calls = aggregatedToolCalls.filter(tc => tc.id && tc.function.name);
        }
      } else {
        const response = await openai.chat.completions.create(payload, { signal: signalController.value.signal });
        responseMessage = response.choices[0].message;
      }

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        responseMessage.tool_calls.forEach(tc => {
          if (tc.function && tc.function.arguments) {
            tc.function.arguments = sanitizeToolArgs(tc.function.arguments);
          }
        });
      }

      history.value.push(responseMessage);

      const currentBubble = chat_show.value[currentAssistantChatShowIndex];
      if (responseMessage.content) {
        currentBubble.content = [{ type: 'text', text: responseMessage.content }];
      }
      if (responseMessage.reasoning_content) {
        currentBubble.reasoning_content = responseMessage.reasoning_content;
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

        const toolMessages = await Promise.all(
          responseMessage.tool_calls.map(async (toolCall) => {
            const uiToolCall = currentBubble.tool_calls.find(t => t.id === toolCall.id);
            let toolContent;

            if (!isAutoApproveTools.value) {
              try {
                const isApproved = await new Promise((resolve) => {
                  pendingToolApprovals.value.set(toolCall.id, resolve);
                });

                if (!isApproved) {
                  if (uiToolCall) {
                    uiToolCall.approvalStatus = 'rejected';
                    uiToolCall.result = '用户已取消执行';
                  }
                  return {
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: toolCall.function.name,
                    content: "User denied this tool execution."
                  };
                }
              } catch (e) {
              }
            }

            if (uiToolCall) {
              uiToolCall.approvalStatus = 'executing';
              uiToolCall.result = '执行中...';
            }
            const controller = new AbortController();
            toolCallControllers.value.set(toolCall.id, controller);

            try {
              const toolArgs = JSON.parse(toolCall.function.arguments);

              // 区分 Skill 调用和普通 MCP 调用
              if (toolCall.function.name === 'Skill') {
                // 调用 Skill
                if (uiToolCall) uiToolCall.result = `Activating skill: ${toolArgs.skill}...`;

                // 1. 构建上下文 (复用 sub_agent 的逻辑)
                // 注意：需要确保 activeTools 变量在当前作用域可用 (askAI 函数内部已有)
                let executionContext = null;
                const currentApiKey = api_key.value;
                const currentBaseUrl = base_url.value;
                const currentModelName = model.value.split('|')[1] || model.value;

                // 定义实时日志回调
                const onUpdateCallback = (logContent) => {
                  if (uiToolCall) {
                    uiToolCall.result = logContent + "\n\n[Skill (Sub-Agent) Running...]";
                  }
                };

                executionContext = {
                  apiKey: currentApiKey,
                  baseUrl: currentBaseUrl,
                  model: currentModelName,
                  // 传入所有可用工具，Skill 内部会根据配置进行过滤
                  tools: activeTools.filter(t => t.function.name !== 'sub_agent'),
                  mcpSystemPrompt: mcpSystemPromptStr, // 确保 mcpSystemPromptStr 变量在作用域内
                  onUpdate: onUpdateCallback
                };

                // 2. 调用 API，传入完整参数对象和上下文
                // toolArgs 现在是完整的 JSON 对象 (包含 args, context, planning_level 等)
                toolContent = await window.api.resolveSkillInvocation(
                  currentConfig.value.skillPath,
                  toolArgs.skill,
                  toolArgs, // 传入整个对象
                  executionContext,
                  toolCallControllers.value.get(toolCall.id)?.signal || signalController.value.signal
                );

                // 3. 处理结果显示
                if (uiToolCall) {
                  // 检查返回内容是否包含特定标记，判断是普通指令还是子智能体结果
                  if (toolContent.includes("[Sub-Agent]")) {
                    const currentLog = uiToolCall.result ? uiToolCall.result.replace("\n\n[Skill (Sub-Agent) Running...]", "") : "";
                    // 避免重复追加
                    if (!currentLog.includes(toolContent)) {
                      uiToolCall.result = `${currentLog}\n\n=== Skill Execution Result ===\n${toolContent}`;
                    } else {
                      uiToolCall.result = currentLog;
                    }
                  } else {
                    uiToolCall.result = `[Skill Instructions Loaded]\n${toolContent}`;
                  }
                }

              } else {
                // 原有 MCP 调用逻辑
                let executionContext = null;

                if (toolCall.function.name === 'sub_agent') {
                  const currentApiKey = api_key.value;
                  const currentBaseUrl = base_url.value;
                  const currentModelName = model.value.split('|')[1] || model.value;

                  // 1. 获取全量工具列表 (排除 sub_agent 自身)
                  const toolsContext = activeTools.filter(t => t.function.name !== 'sub_agent');

                  // 2. 定义实时更新回调
                  const onUpdateCallback = (logContent) => {
                    if (uiToolCall) {
                      uiToolCall.result = logContent + "\n\n[Sub-Agent 执行中...]";
                    }
                  };

                  // 3. 组装上下文
                  executionContext = {
                    apiKey: currentApiKey,
                    baseUrl: currentBaseUrl,
                    model: currentModelName,
                    tools: toolsContext,
                    mcpSystemPrompt: mcpSystemPromptStr,
                    onUpdate: onUpdateCallback
                  };
                }

                // 执行 MCP 工具
                const result = await window.api.invokeMcpTool(
                  toolCall.function.name,
                  toolArgs,
                  toolCallControllers.value.get(toolCall.id)?.signal || signalController.value.signal,
                  executionContext
                );

                toolContent = Array.isArray(result) ? result.filter(item => item?.type === 'text' && typeof item.text === 'string').map(item => item.text).join('\n\n') : String(result);

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

              if (uiToolCall) uiToolCall.approvalStatus = 'finished';

            } catch (e) {
              if (e.name === 'AbortError') {
                toolContent = "Error: Tool call was canceled by the user.";
                if (uiToolCall) uiToolCall.approvalStatus = 'rejected';
              } else {
                toolContent = `{'result':'工具执行或参数解析错误: ${e.message}'}`;
                if (uiToolCall) uiToolCall.approvalStatus = 'finished';
              }
              if (uiToolCall) uiToolCall.result = toolContent;
            } finally {
              toolCallControllers.value.delete(toolCall.id);
            }
            return { tool_call_id: toolCall.id, role: "tool", name: toolCall.function.name, content: toolContent };
          })
        );

        history.value.push(...toolMessages);
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
    let errorDisplay = `发生错误: ${error.message || '未知错误'}`;
    if (error.name === 'AbortError') errorDisplay = "请求已取消";

    const errorBubbleIndex = currentAssistantChatShowIndex > -1 ? currentAssistantChatShowIndex : chat_show.value.length;
    if (currentAssistantChatShowIndex === -1) {
      chat_show.value.push({
        id: messageIdCounter.value++, role: "assistant", content: [],
        aiName: modelMap.value[model.value] || model.value.split('|')[1], voiceName: selectedVoice.value
      });
    }
    const currentBubble = chat_show.value[errorBubbleIndex];
    if (chat_show.value[errorBubbleIndex].reasoning_content && currentBubble.status === 'thinking') {
      chat_show.value[errorBubbleIndex].status = "error";
    }

    let existingText = "";
    if (currentBubble.content && Array.isArray(currentBubble.content)) {
      existingText = currentBubble.content
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('');
    } else if (typeof currentBubble.content === 'string') {
      existingText = currentBubble.content;
    }

    if (existingText && existingText.trim().length > 0) {
      const combinedText = `${existingText}\n\n> **Error**: ${errorDisplay}`;
      currentBubble.content = [{ type: "text", text: combinedText }];
      history.value.push({
        role: 'assistant',
        content: combinedText,
        reasoning_content: currentBubble.reasoning_content || null
      });
    } else {
      currentBubble.content = [{ type: "text", text: `${errorDisplay}` }];
      history.value.push({
        role: 'assistant',
        content: `${errorDisplay}`,
        reasoning_content: currentBubble.reasoning_content || null
      });
    }

  } finally {
    loading.value = false;
    signalController.value = null;
    if (currentAssistantChatShowIndex > -1) {
      chat_show.value[currentAssistantChatShowIndex].completedTimestamp = new Date().toLocaleString('sv-SE');
    }
    await nextTick();
    chatInputRef.value?.focus({ cursor: 'end' });
    autoSaveSession();
  }
};

const cancelAskAI = () => { if (loading.value && signalController.value) { signalController.value.abort(); chatInputRef.value?.focus(); } };
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
  defaultConversationName.value = "";
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

  await applyMcpTools(false);
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

  // 2. 缩放快捷键控制
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

const handleOpenSearch = () => {
  if (textSearchInstance) {
    textSearchInstance.show();
  }
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
      <ChatHeader :modelMap="modelMap" :model="model" :is-mcp-loading="isMcpLoading" :systemPrompt="currentSystemPrompt"
        @open-model-dialog="handleOpenModelDialog" @show-system-prompt="handleShowSystemPrompt"
        @open-search="handleOpenSearch" />

      <div class="main-area-wrapper">
        <el-main ref="chatContainerRef" class="chat-main custom-scrollbar" @click="handleMarkdownImageClick"
          @scroll="handleScroll">
          <ChatMessage v-for="(message, index) in chat_show" :key="message.id" :is-auto-approve="isAutoApproveTools"
            @update-auto-approve="handleToggleAutoApprove" @confirm-tool="handleToolApproval"
            @reject-tool="handleToolApproval" :ref="el => setMessageRef(el, message.id)" :message="message"
            :index="index" :is-last-message="index === chat_show.length - 1" :is-loading="loading"
            :user-avatar="UserAvart" :ai-avatar="AIAvart" :is-collapsed="isCollapsed(index)"
            :is-dark-mode="currentConfig.isDarkMode" @delete-message="handleDeleteMessage" @copy-text="handleCopyText"
            @re-ask="handleReAsk" @toggle-collapse="handleToggleCollapse" @show-system-prompt="handleShowSystemPrompt"
            @avatar-click="onAvatarClick" @edit-message-requested="handleEditStart" @edit-finished="handleEditEnd"
            @edit-message="handleEditMessage" @cancel-tool-call="handleCancelToolCall" />
        </el-main>

        <div v-if="showScrollToBottomButton" class="scroll-to-bottom-wrapper">
          <!-- 1. 回到顶部按钮 -->
          <el-tooltip content="回到顶部" placement="left" :show-after="500">
            <el-button class="scroll-nav-btn" @click="scrollToTop">
              <el-icon :size="14">
                <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                  <path
                    d="M492.367 74.709h46.406L960 503.076l-46.406 46.406-403.379-403.378-399.809 403.378L64 503.076 492.367 74.709z m0 399.809h46.406L960 902.884l-46.406 46.406-403.379-399.808-399.809 399.809L64 902.884l428.367-428.366z">
                  </path>
                </svg>
              </el-icon>
            </el-button>
          </el-tooltip>

          <!-- 2. 上一条消息 -->
          <el-tooltip content="上一条消息" placement="left" :show-after="500">
            <el-button class="scroll-nav-btn" @click="navigateToPreviousMessage">
              <el-icon :size="14">
                <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                  <path d="M902.5 749.2l57.5-57.5-421.6-416.9h-52.7L64 691.7l57.5 57.5 388.1-392.9 392.9 392.9z"></path>
                </svg>
              </el-icon>
            </el-button>
          </el-tooltip>

          <!-- 3. 下一条消息 -->
          <el-tooltip :content="nextButtonTooltip" placement="left" :show-after="500">
            <el-button class="scroll-nav-btn" @click="navigateToNextMessage">
              <el-icon :size="14">
                <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                  <path d="M121.5 274.8L64 332.3l421.6 416.9h52.7l421.6-416.9-57.5-57.5-388.1 392.9-392.8-392.9z">
                  </path>
                </svg>
              </el-icon>
            </el-button>
          </el-tooltip>

          <!-- 4. 跳到底部按钮 -->
          <el-tooltip content="跳到底部" placement="left" :show-after="500">
            <el-button class="scroll-nav-btn" @click="forceScrollToBottom">
              <el-icon :size="14">
                <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                  <path
                    d="M535.203 545.912h-46.406L64 121.116l46.406-46.406 403.378 399.809 399.81-399.81L960 121.116 535.203 545.912z m0 403.379h-46.406L64 524.494l46.406-49.976 403.378 403.379 399.809-403.379L960 524.494 535.203 949.291z">
                  </path>
                </svg>
              </el-icon>
            </el-button>
          </el-tooltip>
        </div>

        <ChatInput ref="chatInputRef" v-model:prompt="prompt" v-model:fileList="fileList"
          v-model:selectedVoice="selectedVoice" v-model:tempReasoningEffort="tempReasoningEffort" :loading="loading"
          :ctrlEnterToSend="currentConfig.CtrlEnterToSend" :layout="inputLayout" :voiceList="currentConfig.voiceList"
          :is-mcp-active="isMcpActive" :all-mcp-servers="availableMcpServers" :active-mcp-ids="sessionMcpServerIds"
          :active-skill-ids="sessionSkillIds" :all-skills="allSkillsList" @submit="handleSubmit" @cancel="handleCancel"
          @clear-history="handleClearHistory" @remove-file="handleRemoveFile" @upload="handleUpload"
          @send-audio="handleSendAudio" @open-mcp-dialog="handleOpenMcpDialog" @pick-file-start="handlePickFileStart"
          @toggle-mcp="handleQuickMcpToggle" @toggle-skill="handleQuickSkillToggle" @open-skill-dialog="toggleSkillDialog" />
      </div>
    </el-container>
  </main>

  <ModelSelectionDialog v-model="changeModel_page" :modelList="modelList" :currentModel="model"
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
    @close="imageViewerVisible = false" :hide-on-click-modal="true" teleported />
  <div v-if="imageViewerVisible" class="custom-viewer-actions">
    <el-button type="primary" :icon="DocumentCopy" circle @click="handleCopyImageFromViewer(imageViewerSrcList[0])"
      title="复制图片" />
    <el-button type="primary" :icon="Download" circle @click="handleDownloadImageFromViewer(imageViewerSrcList[0])"
      title="下载图片" />
  </div>

  <el-dialog v-model="isMcpDialogVisible" width="80%" custom-class="mcp-dialog no-header-dialog" @close="focusOnInput"
    :show-close="false">
    <template #header>
      <div style="display: none;"></div>
    </template>
    <div class="mcp-dialog-content">
      <div class="mcp-dialog-toolbar">
        <el-button-group>
          <el-button :type="mcpFilter === 'all' ? 'primary' : ''" @click="mcpFilter = 'all'">全部</el-button>
          <el-button :type="mcpFilter === 'selected' ? 'primary' : ''" @click="mcpFilter = 'selected'">已选
          </el-button>
          <el-button :type="mcpFilter === 'unselected' ? 'primary' : ''" @click="mcpFilter = 'unselected'">未选
          </el-button>
        </el-button-group>
        <el-button-group>
          <el-button @click="selectAllMcpServers">全选</el-button>
          <el-button @click="clearMcpTools">清空</el-button>
        </el-button-group>
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
                所有临时连接共占1个名额
              </template>
              <el-icon style="vertical-align: middle; margin-left: 4px; cursor: help;">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </span>
          <el-checkbox v-model="isAutoApproveTools" label="自动批准工具调用" style="margin-left: 40px; margin-right: 0;" />
        </div>
        <div>
          <el-button type="primary"
            @click="sessionMcpServerIds = [...tempSessionMcpServerIds]; applyMcpTools();">应用</el-button>
        </div>
      </div>
    </template>
  </el-dialog>

  <el-dialog v-model="isSkillDialogVisible" width="80%" custom-class="mcp-dialog no-header-dialog" :show-close="false">
    <template #header>
      <div style="display: none;"></div>
    </template>

    <div class="mcp-dialog-content">
      <!-- 顶部工具栏 -->
      <div class="mcp-dialog-toolbar">
        <el-button-group>
          <el-button :type="skillFilter === 'all' ? 'primary' : ''" @click="skillFilter = 'all'">全部</el-button>
          <el-button :type="skillFilter === 'selected' ? 'primary' : ''"
            @click="skillFilter = 'selected'">已选</el-button>
          <el-button :type="skillFilter === 'unselected' ? 'primary' : ''"
            @click="skillFilter = 'unselected'">未选</el-button>
        </el-button-group>
        <el-button-group>
          <el-button @click="selectAllSkills">全选</el-button>
          <el-button @click="clearSkills">清空</el-button>
        </el-button-group>
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
        <el-button type="primary" @click="handleSkillSelectionConfirm">确定</el-button>
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
  margin-bottom: 15px;
  flex-shrink: 0;
  padding: 0 5px;
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
  padding: 0 10px;
  margin: 0;
  overflow-y: auto;
  scroll-behavior: auto !important;
  background-color: transparent !important;
  scrollbar-gutter: stable;
  will-change: scroll-position;
  transform: translateZ(0);
}

.scroll-to-bottom-wrapper {
  position: absolute;
  bottom: 110px;
  right: 0.5%;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0px;
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
  transition: all 0.2s ease;
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
  // border: 1px solid rgba(255, 255, 255, 0.5);
  // box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

.app-container.has-bg :deep(.chat-input-area-vertical .el-textarea__inner) {
  background-color: transparent !important;
}

html.dark .app-container.has-bg :deep(.chat-input-area-vertical) {
  background-color: rgba(30, 30, 30, 0.45) !important;
  // border: 1px solid rgba(255, 255, 255, 0.1);
  // box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
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
</style>