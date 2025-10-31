<script setup>
import { ElHeader, ElTooltip, ElButton, ElIcon } from 'element-plus';
import { Download, CoffeeCup, Lollipop, Loading } from '@element-plus/icons-vue'

defineProps({
  favicon: String,
  modelMap: Object,
  model: String,
  autoCloseOnBlur: Boolean,
  temporary: Boolean,
  isMcpLoading: Boolean,
});

const emit = defineEmits([
  'save-window-size',
  'open-model-dialog',
  'toggle-pin',
  'toggle-memory',
  'save-session'
]);
</script>

<template>
  <el-header class="header">
    <div class="header-content-wrapper">
      <div class="header-left">
        <el-tooltip content="保存窗口大小、位置及缩放" placement="bottom">
          <el-button @click="emit('save-window-size')">
            <img :src="favicon" class="windows-logo" alt="App logo">
          </el-button>
        </el-tooltip>
      </div>
      <div class="header-center">
        <el-button class="model-selector-btn" @click="emit('open-model-dialog')" :disabled="isMcpLoading">
          <el-icon v-if="isMcpLoading" class="is-loading" style="margin-right: 6px;">
            <Loading />
          </el-icon>
          {{ isMcpLoading ? '加载工具中...' : (modelMap[model] || '选择模型') }}
        </el-button>
      </div>
      <div class="header-right">
        <el-tooltip :content="autoCloseOnBlur ? '失焦时自动关闭窗口' : '保持窗口开启'" placement="bottom">
          <el-button @click="emit('toggle-pin')">
            <svg v-show="autoCloseOnBlur" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor"
                d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
            </svg>
            <svg v-show="!autoCloseOnBlur" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor"
                d="M12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-9h-1V7c0-2.76-2.24-5-5-5S7 4.24 7 7v1H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 7c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v1H8.9V7z" />
            </svg>
          </el-button>
        </el-tooltip>
        <el-tooltip :content="temporary ? '无记忆模式' : '记忆模式'" placement="bottom">
          <el-button @click="emit('toggle-memory')" :icon="temporary ? Lollipop : CoffeeCup" />
        </el-tooltip>
        <el-tooltip content="保存会话" placement="bottom">
          <el-button @click="emit('save-session')" :icon="Download" />
        </el-tooltip>
      </div>
    </div>
  </el-header>
</template>

<style scoped>
.header {
  height: 40px;
  width: 100%;
  padding: 0;
  flex-shrink: 0;
  z-index: 10;
  background-color: var(--el-bg-color);
  display: flex;
  align-items: center;
}

.header-content-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 10px;
}

.header-left,
.header-right {
  flex-shrink: 0;
}

.header-center {
  flex-grow: 1;
  min-width: 0;
  text-align: center;
}

.header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.header .el-button {
  height: 30px;
  width: 30px;
  padding: 0;
  margin: 0;
  border: none;
  background-color: transparent;
  color: var(--el-text-color-regular);
  border-radius: var(--el-border-radius-base);
  transition: background-color .2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header .el-button:hover:not(:disabled) {
  background-color: var(--el-fill-color-light);
}

.header .windows-logo {
  width: 18px;
  height: 18px;
  cursor: pointer;
  vertical-align: middle;
}

.header .model-selector-btn {
  max-width: 100%;
  width: auto;
  height: 32px;
  padding: 0 10px;
  margin: 0 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Microsoft YaHei', sans-serif;
  font-size: var(--el-font-size-normal);
  color: var(--el-text-color-primary);
}
</style>