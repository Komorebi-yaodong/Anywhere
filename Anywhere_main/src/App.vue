<script setup>
import { ref, watch, onMounted, provide } from 'vue'
import Chats from './components/Chats.vue'
import Prompts from './components/Prompts.vue'
import Setting from './components/Setting.vue'
import Providers from './components/Providers.vue'
import { useI18n } from 'vue-i18n'
import { ChatDotRound, MagicStick, Cloudy, Setting as SettingIcon } from '@element-plus/icons-vue'

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

onMounted(async () => {
  try {
    const result = await window.api.getConfig();
    if (result && result.config) {
      const baseConfig = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
      config.value = Object.assign({}, baseConfig, result.config);
    } else {
      config.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
    }
  } catch (error) {
    console.error("Error fetching config in App.vue:", error);
    config.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
  }
  
  // [NEW] Immediately apply dark mode on mount
  if (config.value?.isDarkMode) {
      document.documentElement.classList.add('dark');
  } else {
      document.documentElement.classList.remove('dark');
  }
});


function changeTab(newTab) {
  tab.value = newTab;
  updateHeaderText();
}

function updateHeaderText() {
  const tabMap = {
    0: 'app.header.chats',
    1: 'app.header.prompts',
    2: 'app.header.providers',
    3: 'app.header.settings'
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
            <el-tooltip :content="t('app.tabs.chats')" placement="bottom">
              <el-button class="tab-button" text @click="changeTab(0)" :class="{ 'active-tab': tab === 0 }">
                <el-icon :size="18"><ChatDotRound /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip :content="t('app.tabs.prompts')" placement="bottom">
              <el-button class="tab-button" text @click="changeTab(1)" :class="{ 'active-tab': tab === 1 }">
                <el-icon :size="18"><MagicStick /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip :content="t('app.tabs.providers')" placement="bottom">
              <el-button class="tab-button" text @click="changeTab(2)" :class="{ 'active-tab': tab === 2 }">
                <el-icon :size="18"><Cloudy /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip :content="t('app.tabs.settings')" placement="bottom">
              <el-button class="tab-button" text @click="changeTab(3)" :class="{ 'active-tab': tab === 3 }">
                <el-icon :size="18"><SettingIcon /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </el-col>
      </el-row>
    </el-header>

    <el-main v-if="config">
        <Chats v-if="tab === 0" />
        <Prompts v-if="tab === 1" />
        <Providers v-if="tab === 2" />
        <Setting v-if="tab === 3" />
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
  padding: 0 20px;
  height: 60px;
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
  gap: 8px;
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