<script setup>
import { ref, watch, onMounted, provide, onBeforeUnmount } from 'vue'
import Chats from './components/Chats.vue'
import Prompts from './components/Prompts.vue'
import Mcp from './components/Mcp.vue' // 引入新组件
import Setting from './components/Setting.vue'
import Providers from './components/Providers.vue'
import { useI18n } from 'vue-i18n'
import { ChatDotRound, MagicStick, Cloudy, Setting as SettingIcon } from '@element-plus/icons-vue' // 移除 Server

const { t, locale } = useI18n()
const tab = ref(0);
const header_text = ref(t('app.header.chats'));

const config = ref(null);

// [MODIFIED] 将 config provide 给所有子组件
provide('config', config);

// This watcher is now very effective because of the CSS variables and shared state.
watch(() => config.value?.isDarkMode, (isDark) => {
  if (isDark === undefined) return;
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}, { deep: true }); // [MODIFIED] deep watch might be more robust here

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
      // 同时支持 Dialog 和 MessageBox 的关闭按钮类名
      const headerBtn = topOverlay.querySelector('.el-dialog__headerbtn, .el-message-box__headerbtn');
      if (headerBtn) {
        headerBtn.click();
        return;
      }

      // B. 尝试点击底部的取消/关闭按钮
      // 同时支持 Dialog Footer 和 MessageBox Buttons 容器
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

onMounted(async () => {
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
    3: 'app.header.providers',
    4: 'app.header.settings'
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
        <el-col :span="6" class="blank-col"></el-col>
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

            <!-- 4. Providers (云服务商) -->
            <el-tooltip :content="t('app.tabs.providers')" placement="bottom">
              <el-button class="tab-button" text @click="changeTab(3)" :class="{ 'active-tab': tab === 3 }">
                <el-icon :size="20">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
                  </svg>
                </el-icon>
              </el-button>
            </el-tooltip>

            <!-- 5. Settings (设置) -->
            <el-tooltip :content="t('app.tabs.settings')" placement="bottom">
              <el-button class="tab-button" text @click="changeTab(4)" :class="{ 'active-tab': tab === 4 }">
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
      <Providers v-if="tab === 3" key="providers" />
      <Setting v-if="tab === 4" key="settings" />
    </el-main>
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
</style>