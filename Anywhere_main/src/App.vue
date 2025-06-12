<script setup>
import { ref, watch } from 'vue' // 引入 watch
import Prompts from './components/Prompts.vue'
import Setting from './components/Setting.vue'
import Providers from './components/Providers.vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n() // locale 是一个 ref
const tab = ref(0);
const header_text = ref(t('app.header.prompts')); // 初始化时使用 t()

function changeTab(newTab) {
  if (newTab === 0) {
    header_text.value = t('app.header.prompts');
    tab.value = 0;
  } else if (newTab === 1) {
    header_text.value = t('app.header.providers');
    tab.value = 1;
  } else if (newTab === 2) {
    header_text.value = t('app.header.settings');
    tab.value = 2;
  }
}

// 使用 watch 来监听 locale 的变化
watch(locale, (newLocaleValue) => {
  // 当语言切换时，重新获取翻译后的 header_text
  // 注意：此时 t 函数会自动使用新的 newLocaleValue
  if (tab.value === 0) {
    header_text.value = t('app.header.prompts');
  } else if (tab.value === 1) {
    header_text.value = t('app.header.providers');
  } else if (tab.value === 2) {
    header_text.value = t('app.header.settings');
  }
});
</script>

<template>
  <div class="common-layout">
    <el-container>
      <el-header>
        <el-row :gutter="0" class="header-row" align="middle">
          <el-col :span="3" class="blank-col">
          </el-col>
          <el-col :span="15" class="header-title-col">
            <el-text class="header-title-text">{{ header_text }}</el-text>
          </el-col>
          <el-col :span="6" class="tabs-col">
            <div class="tabs-container">
              <el-button
                class="tab-button"
                text
                @click="changeTab(0)"
                :class="{ 'active-tab': tab === 0 }"
                :title="t('app.tabs.prompts')"
              >
                <span class="icon">🚀</span>
              </el-button>
              <el-button
                class="tab-button"
                text
                @click="changeTab(1)"
                :class="{ 'active-tab': tab === 1 }"
                :title="t('app.tabs.providers')"
              >
                <span class="icon">☁️</span>
              </el-button>
              <el-button
                class="tab-button"
                text
                @click="changeTab(2)"
                :class="{ 'active-tab': tab === 2 }"
                :title="t('app.tabs.settings')"
              >
                <span class="icon">⚙️</span>
              </el-button>
            </div>
          </el-col>
        </el-row>
      </el-header>

      <el-main>
        <Prompts v-if="tab === 0" />
        <Providers v-if="tab === 1" />
        <Setting v-if="tab === 2" />
      </el-main>
    </el-container>
  </div>
</template>

<style scoped>
.common-layout {
  display: flex;
  flex-direction: column;
  min-width: 400px;
  min-height: 250px;
  max-width: 1200px;
  max-height: 900px;
  width: 93vw;
  height: 88vh;
  overflow: hidden;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  background-color: #f7f7f8;
}

.el-container {
  height: 100%;
}

.el-header {
  padding: 0 20px;
  height: 50px;
  background-color: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
}

.header-row {
  width: 100%;
}

.header-title-col {
  display: flex;
  justify-content: center;
}

.header-title-text {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.tabs-col {
  display: flex;
  justify-content: flex-end;
}

.tabs-container {
  display: flex;
  gap: 4px;
}

.tab-button {
  padding: 8px 12px;
  border: none;
  background-color: transparent;
  color: #6b7280;
  border-radius: 6px;
  transition: background-color 0.2s, color 0.2s;
}

.tab-button .icon {
  font-size: 18px;
}

.tab-button:hover {
  background-color: #f3f4f6;
  color: #374151;
}

.active-tab {
  background-color: #e0f2fe;
  color: #0284c7;
  font-weight: 500;
}

.el-main {
  padding: 0;
  background-color: #f7f7f8;
  width: 100%;
  height: calc(100% - 50px);
  overflow-y: hidden;
  overflow-x: hidden;
}

.blank-col {
  min-width: 50px;
}
</style>
