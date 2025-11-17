<script setup>
import { ElHeader, ElTooltip, ElButton, ElIcon } from 'element-plus';
import { Download, Loading } from '@element-plus/icons-vue';

defineProps({
  favicon: String,
  modelMap: Object,
  model: String,
  autoCloseOnBlur: Boolean,
  isAlwaysOnTop: Boolean,
  isMcpLoading: Boolean,
});

const emit = defineEmits([
  'save-window-size',
  'open-model-dialog',
  'toggle-pin',
  'toggle-always-on-top',
  'save-session'
]);
</script>

<template>
  <el-header class="header">
    <div class="header-content-wrapper">
      <div class="header-left">
        <el-tooltip content="保存窗口位置、大小与缩放" placement="bottom">
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
            <!-- 失焦关闭图标（空心圆） -->
            <svg v-show="autoCloseOnBlur" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor"
                d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
            </svg>
            <!-- 取消失焦关闭，固定窗口图表（实心锁） -->
            <svg v-show="!autoCloseOnBlur" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor"
                d="M12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-9h-1V7c0-2.76-2.24-5-5-5S7 4.24 7 7v1H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 7c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v1H8.9V7z" />
            </svg>
          </el-button>
        </el-tooltip>

        <!-- 窗口置顶功能 -->
        <el-tooltip :content="isAlwaysOnTop ? '取消置顶' : '窗口置顶'" placement="bottom">
          <el-button @click="emit('toggle-always-on-top')">
            <!-- 已置顶 (新的描边风格Pin图标) -->
            <svg v-if="isAlwaysOnTop" viewBox="0 0 24 24" width="16" height="16" fill="none"
              xmlns="http://www.w3.org/2000/svg">
              <path
                d="M14.6358 3.90949C15.2888 3.47412 15.6153 3.25643 15.9711 3.29166C16.3269 3.32689 16.6044 3.60439 17.1594 4.15938L19.8406 6.84062C20.3956 7.39561 20.6731 7.67311 20.7083 8.02888C20.7436 8.38465 20.5259 8.71118 20.0905 9.36424L18.4419 11.8372C17.88 12.68 17.5991 13.1013 17.3749 13.5511C17.2086 13.8845 17.0659 14.2292 16.9476 14.5825C16.7882 15.0591 16.6889 15.5557 16.4902 16.5489L16.2992 17.5038C16.2986 17.5072 16.2982 17.5089 16.298 17.5101C16.1556 18.213 15.3414 18.5419 14.7508 18.1351C14.7497 18.1344 14.7483 18.1334 14.7455 18.1315V18.1315C14.7322 18.1223 14.7255 18.1177 14.7189 18.1131C11.2692 15.7225 8.27754 12.7308 5.88691 9.28108C5.88233 9.27448 5.87772 9.26782 5.86851 9.25451V9.25451C5.86655 9.25169 5.86558 9.25028 5.86486 9.24924C5.45815 8.65858 5.78704 7.84444 6.4899 7.70202C6.49113 7.70177 6.49282 7.70144 6.49618 7.70076L7.45114 7.50977C8.44433 7.31113 8.94092 7.21182 9.4175 7.05236C9.77083 6.93415 10.1155 6.79139 10.4489 6.62514C10.8987 6.40089 11.32 6.11998 12.1628 5.55815L14.6358 3.90949Z"
                stroke="currentColor" stroke-width="2"></path>
              <path d="M5 19L9.5 14.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
            </svg>
            <!-- 未置顶 (窗口图标) -->
            <svg v-else viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor"
                d="M20,8 L20,5.5 C20,4.67157288 19.3284271,4 18.5,4 L5.5,4 C4.67157288,4 4,4.67157288 4,5.5 L4,8 L20,8 Z M20,9 L4,9 L4,18.5 C4,19.3284271 4.67157288,20 5.5,20 L18.5,20 C19.3284271,20 20,19.3284271 20,18.5 L20,9 Z M3,5.5 C3,4.11928813 4.11928813,3 5.5,3 L18.5,3 C19.8807119,3 21,4.11928813 21,5.5 L21,18.5 C21,19.8807119 19.8807119,21 18.5,21 L5.5,21 C4.11928813,21 3,19.8807119 3,18.5 L3,5.5 Z" />
            </svg>
          </el-button>
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