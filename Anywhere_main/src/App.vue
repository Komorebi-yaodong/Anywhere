<script setup>
import { ref, watch, onMounted, provide, onBeforeUnmount, computed } from 'vue'
import Chats from './components/Chats.vue'
import Prompts from './components/Prompts.vue'
import Mcp from './components/Mcp.vue'
import Setting from './components/Setting.vue'
import Providers from './components/Providers.vue'
import Skills from './components/Skills.vue'

import { useI18n } from 'vue-i18n'
import { Collection, Bell, Document } from '@element-plus/icons-vue'
import { marked } from 'marked';
import { ElBadge } from 'element-plus'; // 确保引入 ElBadge

const { t, locale } = useI18n()
const tab = ref(0);
const header_text = ref(t('app.header.chats'));

const config = ref(null);

//将 config provide 给所有子组件
provide('config', config);

// This watcher is now very effective because of the CSS variables and shared state.
watch(() => config.value?.isDarkMode, (isDark) => {
  if (isDark === undefined) return;
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}, { deep: true });

const handleGlobalEsc = (e) => {
  if (e.key === 'Escape') {
    // 1. 优先检查图片预览组件 (Image Viewer)
    const imageViewerCloseBtn = document.querySelector('.el-image-viewer__close');
    if (imageViewerCloseBtn && window.getComputedStyle(imageViewerCloseBtn).display !== 'none') {
      e.stopPropagation(); // 阻止 uTools 退出
      imageViewerCloseBtn.click(); // 手动触发关闭
      return;
    }

    // 2. 检查可见的弹窗遮罩层 (Dialog Overlays)
    const overlays = Array.from(document.querySelectorAll('.el-overlay')).filter(el => {
      return el.style.display !== 'none' && !el.classList.contains('is-hidden');
    });

    if (overlays.length > 0) {
      // 找到层级最高（最上层）的弹窗
      const topOverlay = overlays.reduce((max, current) => {
        return (parseInt(window.getComputedStyle(current).zIndex) || 0) >
               (parseInt(window.getComputedStyle(max).zIndex) || 0) ? current : max;
      });

      // 阻止 uTools 退出
      e.stopPropagation();

      // A. 尝试点击右上角的关闭(X)按钮
      const headerBtn = topOverlay.querySelector('.el-dialog__headerbtn, .el-message-box__headerbtn');
      if (headerBtn) {
        headerBtn.click();
        return;
      }

      // B. 尝试点击底部的取消/关闭按钮
      const footer = topOverlay.querySelector('.el-dialog__footer, .el-message-box__btns');
      if (footer) {
        // 特殊处理 Setting.vue 中备份管理的布局 (关闭按钮在 .footer-right)
        const rightBtn = footer.querySelector('.footer-right .el-button');
        if (rightBtn) {
          rightBtn.click();
          return;
        }
        // 通用处理：点击底部第一个按钮 (通常是 取消/Cancel)
        const buttons = footer.querySelectorAll('.el-button');
        if (buttons.length > 0) {
          buttons[0].click();
          return;
        }
      }
    }
  }
};

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
const handleSystemThemeChange = (e) => {
  // 只有当设置为 "system" 时才响应
  if (config.value?.themeMode === 'system') {
    const isDark = e.matches;
    if (config.value.isDarkMode !== isDark) {
      config.value.isDarkMode = isDark;
      // 同步更新到数据库，确保独立窗口打开时也是正确的颜色
      if (window.api && window.api.saveSetting) {
        window.api.saveSetting('isDarkMode', isDark);
      }
    }
  }
};

const showDocDialog = ref(false);
const docLoading = ref(false);
const currentDocContent = ref('');
const activeDocIndex = ref('0');

// 文档列表配置，增加 i18nKey 用于动态标题，lastUpdated 动态获取
const docList = ref([
  { i18nKey: 'doc.titles.chat', file: 'chat_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.ai', file: 'ai_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.mcp', file: 'mcp_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.skill', file: 'skill_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.provider', file: 'provider_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.setting', file: 'setting_doc.md', lastUpdated: null }
]);

// 阅读状态管理
const readStatusKey = 'anywhere_doc_last_read';
const docReadMap = ref({});

// 初始化读取状态
const loadReadStatus = () => {
  try {
    const stored = localStorage.getItem(readStatusKey);
    docReadMap.value = stored ? JSON.parse(stored) : {};
  } catch (e) {
    docReadMap.value = {};
  }
};

// 预取所有文档的元数据（更新时间）
const fetchAllDocsMetadata = async () => {
  // 使用镜像代理
  const baseUrl = 'https://raw.githubusercontent.com/Komorebi-yaodong/Anywhere/main/docs/';
  // 正则匹配：**文档更新时间：2026年1月28日**
  const dateRegex = /\*\*文档更新时间：(\d{4})年(\d{1,2})月(\d{1,2})日\*\*/;

  const promises = docList.value.map(async (doc) => {
    try {
      const response = await fetch(`${baseUrl}${doc.file}`);
      if (!response.ok) return;
      const text = await response.text();
      
      const match = text.match(dateRegex);
      if (match) {
        // 转换为兼容格式 YYYY/MM/DD 00:00:00
        const year = match[1];
        const month = match[2];
        const day = match[3];
        // 假设更新时间为当天的开始，确保只要用户在当天任意时刻阅读过，updatedTime(00:00) <= readTime(XX:XX) 就会不显示红点
        doc.lastUpdated = `${year}/${month}/${day} 00:00:00`;
      }
    } catch (e) {
      console.warn(`Failed to fetch metadata for ${doc.file}`, e);
    }
  });

  await Promise.all(promises);
};

// 检查是否有更新
const checkDocHasUpdate = (index) => {
  const doc = docList.value[index];
  if (!doc || !doc.lastUpdated) return false;
  
  // 从配置中读取状态
  const readMap = config.value?.docReadStatus || {};
  const lastRead = readMap[doc.file];
  
  // 如果从未读过，或者更新时间晚于阅读时间，显示红点
  if (!lastRead) return true;
  
  // Date比较
  const updateTime = new Date(doc.lastUpdated).getTime();
  const readTime = new Date(lastRead).getTime();
  
  return updateTime > readTime;
};

// 检查是否有任意文档更新（用于铃铛图标）
const hasAnyUpdate = computed(() => {
  return docList.value.some((_, index) => checkDocHasUpdate(index));
});

// 标记文档为已读
const markDocAsRead = async (filename) => {
  if (!config.value) return;

  // 1. 初始化对象 (如果不存在)
  if (!config.value.docReadStatus) {
    config.value.docReadStatus = {};
  }

  // 2. 更新内存中的配置 (触发界面响应)
  config.value.docReadStatus[filename] = new Date().toISOString();

  // 3. 持久化保存到 uTools 数据库，这里保存整个 docReadStatus 对象
  try {
    await window.api.saveSetting('docReadStatus', JSON.parse(JSON.stringify(config.value.docReadStatus)));
  } catch (e) {
    console.error("保存阅读状态失败:", e);
  }
};

const fetchAndParseDoc = async (filename) => {
  // 标记当前文档为已读
  markDocAsRead(filename);

  docLoading.value = true;
  try {
    // 使用 GitHub 镜像代理地址
    const baseUrl = 'https://raw.githubusercontent.com/Komorebi-yaodong/Anywhere/main/docs/';
    const response = await fetch(`${baseUrl}${filename}`);
    if (!response.ok) throw new Error('Network response was not ok');
    
    let text = await response.text();

    // 图片路径修正逻辑 (同样使用镜像)
    const imgBaseUrl = 'https://raw.githubusercontent.com/Komorebi-yaodong/Anywhere/main/image/';
    
    // 替换 Windows 风格反斜杠路径 (..\image\) 和 Unix 风格路径 (../image/)
    text = text.replace(/!\[(.*?)\]\((\.\.[\\/])?image[\\/](.*?)\)/g, (match, alt, prefix, filename) => {
        // 对文件名进行 encodeURI 处理，防止中文乱码
        return `![${alt}](${imgBaseUrl}${encodeURIComponent(filename)})`;
    });

    currentDocContent.value = marked.parse(text);
  } catch (error) {
    console.error('Failed to load doc:', error);
    currentDocContent.value = `<h3>${t('doc.loadFailed')}</h3><p>${t('doc.checkNetwork')}</p>`;
  } finally {
    docLoading.value = false;
  }
};

// 监听文档切换
watch(activeDocIndex, (newIndex) => {
  const doc = docList.value[newIndex];
  if (doc) {
    fetchAndParseDoc(doc.file);
  }
});

// 打开弹窗时加载第一个文档，并更新阅读状态
const openHelpDialog = () => {
  showDocDialog.value = true;
  
  const index = parseInt(activeDocIndex.value) || 0;
  const targetDoc = docList.value[index];
  
  if (targetDoc) {
    // 无论是首次打开还是切换，都重新加载（可能内容有变）并标记已读
    fetchAndParseDoc(targetDoc.file);
  }
};

const handleDocLinks = (event) => {
  const target = event.target.closest('a');
  if (!target) return;

  // 阻止默认跳转（防止在当前窗口打开导致页面白屏）
  event.preventDefault();
  
  const href = target.getAttribute('href');
  if (!href) return;

  // 1. 处理 HTTP/HTTPS 外部链接 -> 调用系统浏览器打开
  if (href.startsWith('http://') || href.startsWith('https://')) {
    if (window.utools && window.utools.shellOpenExternal) {
      window.utools.shellOpenExternal(href);
    } else {
      window.open(href, '_blank'); // 兜底方案
    }
    return;
  }

  // 2. 处理文档间跳转 (例如: ./mcp_doc.md) -> 切换左侧菜单
  if (href.endsWith('.md')) {
    // 提取文件名 (兼容 ./xxx.md 或 xxx.md)
    const filename = href.split(/[/\\]/).pop();
    const targetIndex = docList.value.findIndex(doc => doc.file === filename);
    
    if (targetIndex !== -1) {
      activeDocIndex.value = String(targetIndex);
    }
  }
};

onMounted(async () => {
  // 异步获取文档更新时间，获取后会自动更新UI红点
  fetchAllDocsMetadata();

  window.addEventListener('keydown', handleGlobalEsc, true);
  mediaQuery.addEventListener('change', handleSystemThemeChange);
  try {
    const result = await window.api.getConfig();
    if (result && result.config) {
      const baseConfig = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
      config.value = Object.assign({}, baseConfig, result.config);
      if (config.value.themeMode === 'system') {
        const systemDark = mediaQuery.matches;
        if (config.value.isDarkMode !== systemDark) {
          config.value.isDarkMode = systemDark;
          window.api.saveSetting('isDarkMode', systemDark);
        }
      }
    } else {
      config.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
    }
  } catch (error) {
    console.error("Error fetching config in App.vue:", error);
    config.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
  }

  // Immediately apply dark mode on mount
  if (config.value?.isDarkMode) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalEsc, true);
  mediaQuery.removeEventListener('change', handleSystemThemeChange);
});

function changeTab(newTab) {
  tab.value = newTab;
  updateHeaderText();
}

function updateHeaderText() {
  const tabMap = {
    0: 'app.header.chats',
    1: 'app.header.prompts',
    2: 'app.header.mcp',
    3: 'app.header.skills',
    4: 'app.header.providers',
    5: 'app.header.settings'
  };
  header_text.value = t(tabMap[tab.value]);
}

watch(locale, () => {
  updateHeaderText();
});
</script>

<template>
  <el-container class="common-layout">
    <el-header>
      <el-row :gutter="0" class="header-row" align="middle">
        <!-- 左侧：帮助文档按钮 -->
        <el-col :span="6" class="left-actions-col">
          <el-tooltip :content="t('app.header.help') || '使用指南'" placement="bottom">
            <el-button class="tab-button" text @click="openHelpDialog">
              <el-badge :is-dot="hasAnyUpdate" class="bell-badge">
                <el-icon :size="20"><Bell /></el-icon>
              </el-badge>
            </el-button>
          </el-tooltip>
        </el-col>
        
        <el-col :span="12" class="header-title-col">
          <el-text class="header-title-text">{{ header_text }}</el-text>
        </el-col>
        <el-col :span="6" class="tabs-col">
          <div class="tabs-container">
            <!-- 1. Chats (云端对话) -->
            <el-tooltip :content="t('app.tabs.chats')" placement="bottom">
              <el-button class="tab-button" text @click="changeTab(0)" :class="{ 'active-tab': tab === 0 }">
                <el-icon :size="20">
                  <svg t="1765030297139" class="icon" viewBox="0 0 1024 1024" version="1.1"
                    xmlns="http://www.w3.org/2000/svg" p-id="72601" width="200" height="200">
                    <path
                      d="M512 64c259.2 0 469.333333 200.576 469.333333 448s-210.133333 448-469.333333 448a484.48 484.48 0 0 1-232.725333-58.88l-116.394667 50.645333a42.666667 42.666667 0 0 1-58.517333-49.002666l29.76-125.013334C76.629333 703.402667 42.666667 611.477333 42.666667 512 42.666667 264.576 252.8 64 512 64z m0 64C287.488 128 106.666667 300.586667 106.666667 512c0 79.573333 25.557333 155.434667 72.554666 219.285333l5.525334 7.317334 18.709333 24.192-26.965333 113.237333 105.984-46.08 27.477333 15.018667C370.858667 878.229333 439.978667 896 512 896c224.512 0 405.333333-172.586667 405.333333-384S736.512 128 512 128z m-157.696 341.333333a42.666667 42.666667 0 1 1 0 85.333334 42.666667 42.666667 0 0 1 0-85.333334z m159.018667 0a42.666667 42.666667 0 1 1 0 85.333334 42.666667 42.666667 0 0 1 0-85.333334z m158.997333 0a42.666667 42.666667 0 1 1 0 85.333334 42.666667 42.666667 0 0 1 0-85.333334z"
                      fill="currentColor" p-id="72602"></path>
                  </svg>
                </el-icon>
              </el-button>
            </el-tooltip>

            <!-- 2. Prompts (快捷助手/Agent) -->
            <el-tooltip :content="t('app.tabs.prompts')" placement="bottom">
              <el-button class="tab-button" text @click="changeTab(1)" :class="{ 'active-tab': tab === 1 }">
                <el-icon :size="20">
                  <svg t="1765030347985" class="icon" viewBox="0 0 1024 1024" version="1.1"
                    xmlns="http://www.w3.org/2000/svg" p-id="77085" width="200" height="200">
                    <path
                      d="M617.92 198.784A270.4 270.4 0 0 1 888.32 469.12v225.344a270.464 270.464 0 0 1-270.4 270.464h-315.52A270.4 270.4 0 0 1 32 694.528v-225.28a270.4 270.4 0 0 1 270.4-270.464h315.52z m0 90.112h-315.52a180.288 180.288 0 0 0-180.288 180.288v225.344a180.288 180.288 0 0 0 180.288 180.288h315.52a180.288 180.288 0 0 0 180.288-180.288v-225.28a180.288 180.288 0 0 0-180.288-180.352z"
                      p-id="77086"></path>
                    <path
                      d="M324.928 491.712c30.08 0 45.12 15.04 45.12 45.056v90.176c0 30.08-15.04 45.056-45.12 45.056-30.016 0-45.056-15.04-45.056-45.056V536.768c0-30.08 15.04-45.056 45.056-45.056zM594.944 483.584a38.336 38.336 0 0 1 45.952 61.312l-49.28 36.992 49.28 36.928a38.336 38.336 0 0 1 10.496 49.28l-2.816 4.352a38.272 38.272 0 0 1-53.632 7.68l-66.112-49.6a60.8 60.8 0 0 1 0-97.28l66.112-49.664zM922.944 220.544l-21.312 44.544a17.536 17.536 0 0 1-7.104 7.488 21.312 21.312 0 0 1-21.376 0 17.536 17.536 0 0 1-7.104-7.488l-21.376-44.544a44.608 44.608 0 0 0-21.312-20.608l-37.696-17.984a18.368 18.368 0 0 1-7.296-6.144 15.232 15.232 0 0 1-2.688-8.576c0-3.008 0.896-6.016 2.688-8.576a18.368 18.368 0 0 1 7.296-6.144l37.76-17.92a44.8 44.8 0 0 0 21.248-20.736l21.376-44.48a17.536 17.536 0 0 1 7.04-7.488 21.376 21.376 0 0 1 21.44 0c3.2 1.792 5.632 4.48 7.04 7.488l21.376 44.48a44.672 44.672 0 0 0 21.376 20.672l37.632 17.92a18.368 18.368 0 0 1 7.36 6.208 15.168 15.168 0 0 1 0 17.152 18.368 18.368 0 0 1-7.36 6.144l-37.632 17.92a44.608 44.608 0 0 0-21.376 20.672z"
                      p-id="77087"></path>
                  </svg>
                </el-icon>
              </el-button>
            </el-tooltip>

            <!-- 3. MCP -->
            <el-tooltip :content="t('app.tabs.mcp')" placement="bottom">
              <el-button class="tab-button" text @click="changeTab(2)" :class="{ 'active-tab': tab === 2 }">
                <el-icon :size="19">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"></path>
                    <path d="m18 15 4-4"></path>
                    <path
                      d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5">
                    </path>
                  </svg>
                </el-icon>
              </el-button>
            </el-tooltip>

            <!-- 4. Skills -->
            <el-tooltip :content="t('app.tabs.skills')" placement="bottom">
              <el-button class="tab-button" text @click="changeTab(3)" :class="{ 'active-tab': tab === 3 }">
                <el-icon :size="20">
                  <Collection />
                </el-icon>
              </el-button>
            </el-tooltip>

            <!-- 5. Providers (云服务商) -->
            <el-tooltip :content="t('app.tabs.providers')" placement="bottom">
              <el-button class="tab-button" text @click="changeTab(4)" :class="{ 'active-tab': tab === 4 }">
                <el-icon :size="20">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
                  </svg>
                </el-icon>
              </el-button>
            </el-tooltip>

            <!-- 6. Settings (设置) -->
            <el-tooltip :content="t('app.tabs.settings')" placement="bottom">
              <el-button class="tab-button" text @click="changeTab(5)" :class="{ 'active-tab': tab === 5 }">
                <el-icon :size="18">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path
                      d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z">
                    </path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </el-col>
      </el-row>
    </el-header>

    <el-main v-if="config">
      <Chats v-if="tab === 0" key="chats" />
      <Prompts v-if="tab === 1" key="prompts" />
      <Mcp v-if="tab === 2" key="mcp" />
      <Skills v-if="tab === 3" key="skills" />
      <Providers v-if="tab === 4" key="providers" />
      <Setting v-if="tab === 5" key="settings" />
    </el-main>

    <!-- 帮助文档弹窗 -->
    <el-dialog v-model="showDocDialog" :title="t('doc.title')" width="80%" :lock-scroll="false" class="doc-dialog">
      <div class="doc-container">
        <div class="doc-sidebar">
          <el-menu :default-active="activeDocIndex" @select="(index) => activeDocIndex = index" class="doc-menu">
            <el-menu-item v-for="(doc, index) in docList" :key="index" :index="String(index)">
              <el-icon><Document /></el-icon>
              <span class="menu-item-text">
                {{ t(doc.i18nKey) }}
                <!-- 文档具体红点 -->
                <span v-if="checkDocHasUpdate(index)" class="doc-update-dot"></span>
              </span>
            </el-menu-item>
          </el-menu>
        </div>
        <div class="doc-content" v-loading="docLoading" :element-loading-text="t('doc.loading')">
          <el-scrollbar height="60vh">
            <div class="markdown-body" v-html="currentDocContent" @click="handleDocLinks"></div>
          </el-scrollbar>
        </div>
      </div>
    </el-dialog>
  </el-container>
</template>

<style scoped>
.common-layout,
.el-container {
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  overflow: hidden;
  background-color: var(--bg-primary);
  display: flex;
  flex-direction: column;
}

.el-header {
  padding: 0px 20px 0px 0px;
  height: 50px;
  display: flex;
  align-items: center;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
  z-index: 10;
}

.header-row {
  width: 100%;
}

.header-title-col {
  display: flex;
  justify-content: center;
  align-items: center;
}

.header-title-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.5px;
  transition: color 0.3s ease;
}

.tabs-col {
  display: flex;
  justify-content: flex-end;
}

.tabs-container {
  display: flex;
  gap: 0px;
  background-color: var(--bg-tertiary);
  padding: 4px;
  border-radius: var(--radius-md);
}

.tab-button {
  padding: 8px;
  border: none;
  background-color: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  transition: background-color 0.2s, color 0.2s;
  height: 32px;
  width: 32px;
}

.tab-button:hover {
  background-color: var(--bg-secondary);
  color: var(--text-primary);
}

.active-tab {
  background-color: var(--bg-secondary);
  color: var(--text-accent);
  box-shadow: var(--shadow-sm);
}

.el-main {
  padding: 0;
  flex-grow: 1;
  overflow-y: auto;
  background-color: var(--bg-primary);
}

.blank-col {
  min-width: 32px;
}

.left-actions-col {
  display: flex;
  align-items: center;
  padding-left: 20px;
}

/* 修复双重 Border 问题：移除上边框，仅保留其他三边 */
.doc-container {
  display: flex;
  height: 60vh;
  border: 1px solid var(--border-primary);
  border-top: none; /* 关键修复 */
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  overflow: hidden;
}

/* 铃铛徽章样式微调 */
.bell-badge :deep(.el-badge__content.is-fixed.is-dot) {
  right: 2px;
  top: 2px;
}

.doc-sidebar {
  width: 150px;
  border-right: 1px solid var(--border-primary);
  background-color: var(--bg-secondary);
  flex-shrink: 0;
}

.doc-menu {
  border-right: none;
  background-color: transparent;
}

.doc-menu :deep(.el-menu-item) {
  height: 40px;
  line-height: 40px;
  color: var(--text-secondary);
  font-size: 14px;
}

.doc-menu :deep(.el-menu-item:hover) {
  background-color: var(--bg-tertiary);
}

.doc-menu :deep(.el-menu-item.is-active) {
  color: var(--text-accent);
  background-color: var(--bg-tertiary);
  font-weight: 600;
  border-right: 2px solid var(--text-accent);
}

/* 侧边栏菜单项布局：文字与红点分离 */
.menu-item-text {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

/* 文档更新红点样式 */
.doc-update-dot {
  width: 6px;
  height: 6px;
  background-color: var(--el-color-danger);
  border-radius: 50%;
  margin-left: 8px;
  display: inline-block;
}

.doc-content {
  flex: 1;
  background-color: var(--bg-primary);
  padding: 0;
  overflow: hidden;
}

.markdown-body {
  padding: 0px 40px;
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  font-size: 15px; /* 稍微调大字号更易阅读 */
  line-height: 1.75; /* 增加行高，增加呼吸感 */
  -webkit-font-smoothing: antialiased; /* 让字体在 Mac 上更清晰 */
}

/* 标题样式优化 */
.markdown-body :deep(h1), 
.markdown-body :deep(h2) {
  border-bottom: 1px solid var(--border-primary);
  padding-bottom: 0.4em;
  margin-top: 1.5em;
  margin-bottom: 1em;
  color: var(--text-primary);
  font-weight: 700; /* 强制加粗 */
  letter-spacing: -0.01em; /* 标题字间距微调 */
  line-height: 1.3;
}

.markdown-body :deep(h3), 
.markdown-body :deep(h4) {
  margin-top: 1.4em;
  margin-bottom: 0.8em;
  color: var(--text-primary);
  font-weight: 600; /* 强制加粗 */
  line-height: 1.4;
}

/* 正文段落 */
.markdown-body :deep(p) {
  margin-bottom: 1.2em;
  text-align: justify; /* 两端对齐，使大段文字更整齐 */
}

/* 列表优化 */
.markdown-body :deep(ul), 
.markdown-body :deep(ol) {
  padding-left: 24px;
  margin-bottom: 1.2em;
}

.markdown-body :deep(li) {
  margin-bottom: 0.4em; /* 列表项之间增加一点间距 */
}

/* 粗体优化 */
.markdown-body :deep(strong),
.markdown-body :deep(b) {
  font-weight: 700;
  color: var(--text-primary);
}

/* 行内代码块优化 */
.markdown-body :deep(code) {
  background-color: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  /* 等宽字体栈 */
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.85em;
  color: var(--el-color-primary); /* 使用主题色，让代码更显眼 */
  margin: 0 2px;
}

/* 多行代码块 */
.markdown-body :deep(pre) {
  background-color: var(--bg-tertiary);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin-bottom: 1.2em;
  line-height: 1.5;
  border: 1px solid var(--border-primary);
}

.markdown-body :deep(pre code) {
  background-color: transparent;
  padding: 0;
  color: var(--text-primary);
  margin: 0;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}

/* 引用块优化 */
.markdown-body :deep(blockquote) {
  margin: 1.2em 0;
  padding: 8px 16px;
  color: var(--text-secondary);
  border-left: 4px solid var(--el-color-primary); /* 使用主题色作为边框 */
  background-color: var(--bg-tertiary); /* 改用浅色背景而不是纯灰 */
  border-radius: 0 4px 4px 0;
}

.markdown-body :deep(blockquote p) {
  margin-bottom: 0; /* 引用块内的段落去掉底部间距 */
}

/* 图片优化 */
.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 12px 0;
  border: 1px solid var(--border-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); /* 增加轻微阴影 */
  display: block; /* 防止图片底部有空隙 */
}

/* 链接优化 */
.markdown-body :deep(a) {
  color: var(--el-color-primary);
  text-decoration: none;
  font-weight: 500;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
  cursor: pointer;
}
.markdown-body :deep(a:hover) {
  border-bottom-color: var(--el-color-primary); /* 悬浮时显示下划线效果 */
}

/* 弹窗样式微调 */
:deep(.doc-dialog .el-dialog__body) {
  padding: 0 !important;
}
:deep(.doc-dialog .el-dialog__header) {
  padding: 5px 15px 15px 15px !important;
  margin-right: 0;
  border-bottom: 1px solid var(--border-primary);
}
</style>