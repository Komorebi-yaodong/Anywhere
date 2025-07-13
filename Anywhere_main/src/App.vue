<script setup>
import { ref, watch } from 'vue'
import Chats from './components/Chats.vue'
import Prompts from './components/Prompts.vue'
import Setting from './components/Setting.vue'
import Providers from './components/Providers.vue'
import { useI18n } from 'vue-i18n'
import { ChatDotRound, MagicStick, Cloudy, Setting as SettingIcon } from '@element-plus/icons-vue'

const { t, locale } = useI18n()
const tab = ref(0);
const header_text = ref(t('app.header.chats'));

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
  <div class="common-layout">
    <el-container>
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

      <el-main>
        <Chats v-if="tab === 0" />
        <Prompts v-if="tab === 1" />
        <Providers v-if="tab === 2" />
        <Setting v-if="tab === 3" />
      </el-main>
    </el-container>
  </div>
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
  /* 关键：让子组件处理滚动，这里设置为 hidden 防止出现双重滚动条 */
  overflow: hidden;
  background-color: var(--bg-primary);
}

.blank-col {
  min-width: 32px;
}
</style>