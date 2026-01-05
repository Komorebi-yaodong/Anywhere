<script setup>
import { computed } from 'vue';
import { ElTooltip, ElIcon } from 'element-plus';
import { Download, FullScreen, Close, CloseBold, Minus } from '@element-plus/icons-vue';

const props = defineProps({
  favicon: String,
  promptName: String, 
  conversationName: String,
  isAlwaysOnTop: Boolean,
  autoCloseOnBlur: Boolean,
  isDarkMode: Boolean,
  os: { type: String, default: 'win' }
});

const emit = defineEmits([
  'save-window-size',
  'save-session',
  'toggle-pin',
  'toggle-always-on-top',
  'minimize',
  'maximize',
  'close'
]);

const displayConversationName = computed(() => {
  return props.conversationName || '临时对话';
});

const isMac = computed(() => props.os === 'macos' || props.os === 'darwin');
const isWin = computed(() => props.os === 'win');
const isLinux = computed(() => !isMac.value && !isWin.value);
</script>

<template>
  <div class="title-bar" :class="[`os-${os}`, { 'dark-mode': isDarkMode }]">
    
    <!-- 1. 左侧区域 -->
    <div class="left-container">
      <!-- macOS 红绿灯 -->
      <div v-if="isMac" class="window-controls mac-traffic-lights no-drag">
        <!-- 关闭 (使用 CloseBold 更粗) -->
        <div class="traffic-btn close" @click="emit('close')">
          <el-icon class="traffic-icon"><CloseBold /></el-icon>
        </div>
        <!-- 最小化 -->
        <div class="traffic-btn minimize" @click="emit('minimize')">
          <el-icon class="traffic-icon icon-minus"><Minus /></el-icon>
        </div>
        <!-- 最大化/全屏 -->
        <div class="traffic-btn maximize" @click="emit('maximize')">
          <el-icon class="traffic-icon icon-fullscreen"><FullScreen /></el-icon>
        </div>
      </div>

      <!-- App 信息 -->
      <div class="app-info no-drag" @click="emit('save-window-size')" @dblclick.stop="emit('maximize')">
        <el-tooltip content="点击保存当前窗口大小与位置 / 双击全屏" placement="bottom" :show-after="500">
          <div class="app-info-inner">
            <img :src="favicon" class="app-logo" alt="Logo">
            <span class="app-title">{{ promptName || 'Anywhere' }}</span>
          </div>
        </el-tooltip>
      </div>

      <div class="divider-vertical"></div>

      <!-- 对话名称 -->
      <div class="conversation-info no-drag" @click="emit('save-session')" @dblclick.stop="emit('maximize')">
        <el-tooltip content="点击保存会话" placement="bottom" :show-after="500">
          <div class="conversation-inner">
            <span class="conversation-title">{{ displayConversationName }}</span>
            <el-icon class="download-icon"><Download /></el-icon>
          </div>
        </el-tooltip>
      </div>
    </div>

    <!-- 2. 右侧区域 -->
    <div class="right-container">
      <!-- 功能开关组 -->
      <div class="function-group no-drag">
        <el-tooltip :content="autoCloseOnBlur ? '失焦自动关闭: 开' : '失焦自动关闭: 关'" placement="bottom" :show-after="500">
          <div class="func-btn" @click="emit('toggle-pin')" :class="{ 'active': !autoCloseOnBlur }">
             <svg v-if="!autoCloseOnBlur" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6-9h-1V7c0-2.76-2.24-5-5-5S7 4.24 7 7v1H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 7c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v1H8.9V7z"/></svg>
             <svg v-else viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
          </div>
        </el-tooltip>

        <el-tooltip :content="isAlwaysOnTop ? '取消置顶' : '置顶窗口'" placement="bottom" :show-after="500">
          <div class="func-btn" @click="emit('toggle-always-on-top')" :class="{ 'active': isAlwaysOnTop }">
            <svg v-if="isAlwaysOnTop" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.6358 3.90949C15.2888 3.47412 15.6153 3.25643 15.9711 3.29166C16.3269 3.32689 16.6044 3.60439 17.1594 4.15938L19.8406 6.84062C20.3956 7.39561 20.6731 7.67311 20.7083 8.02888C20.7436 8.38465 20.5259 8.71118 20.0905 9.36424L18.4419 11.8372C17.88 12.68 17.5991 13.1013 17.3749 13.5511C17.2086 13.8845 17.0659 14.2292 16.9476 14.5825C16.7882 15.0591 16.6889 15.5557 16.4902 16.5489L16.2992 17.5038C16.2986 17.5072 16.2982 17.5089 16.298 17.5101C16.1556 18.213 15.3414 18.5419 14.7508 18.1351C14.7497 18.1344 14.7483 18.1334 14.7455 18.1315V18.1315C14.7322 18.1223 14.7255 18.1177 14.7189 18.1131C11.2692 15.7225 8.27754 12.7308 5.88691 9.28108C5.88233 9.27448 5.87772 9.26782 5.86851 9.25451V9.25451C5.86655 9.25169 5.86558 9.25028 5.86486 9.24924C5.45815 8.65858 5.78704 7.84444 6.4899 7.70202C6.49113 7.70177 6.49282 7.70144 6.49618 7.70076L7.45114 7.50977C8.44433 7.31113 8.94092 7.21182 9.4175 7.05236C9.77083 6.93415 10.1155 6.79139 10.4489 6.62514C10.8987 6.40089 11.32 6.11998 12.1628 5.55815L14.6358 3.90949Z"/><path d="M5 19L9.5 14.5" stroke-linecap="round"/></svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M20,8 L20,5.5 C20,4.67157288 19.3284271,4 18.5,4 L5.5,4 C4.67157288,4 4,4.67157288 4,5.5 L4,8 L20,8 Z M20,9 L4,9 L4,18.5 C4,19.3284271 4.67157288,20 5.5,20 L18.5,20 C19.3284271,20 20,19.3284271 20,18.5 L20,9 Z M3,5.5 C3,4.11928813 4.11928813,3 5.5,3 L18.5,3 C19.8807119,3 21,4.11928813 21,5.5 L21,18.5 C21,19.8807119 19.8807119,21 18.5,21 L5.5,21 C4.11928813,21 3,19.8807119 3,18.5 L3,5.5 Z" /></svg>
          </div>
        </el-tooltip>
      </div>

      <div class="divider-vertical" v-if="isWin"></div>

      <!-- Windows 窗口控制 -->
      <div v-if="isWin" class="window-controls win-controls no-drag">
        <div class="win-btn minimize" @click="emit('minimize')" title="最小化">
          <el-icon><Minus /></el-icon>
        </div>
        <div class="win-btn maximize" @click="emit('maximize')" title="最大化">
          <el-icon><FullScreen /></el-icon>
        </div>
        <div class="win-btn close" @click="emit('close')" title="关闭">
          <el-icon><Close /></el-icon>
        </div>
      </div>

      <!-- Linux 窗口控制 -->
      <div v-if="isLinux" class="window-controls linux-controls no-drag">
        <div class="linux-btn minimize" @click="emit('minimize')">
          <el-icon><Minus /></el-icon>
        </div>
        <div class="linux-btn maximize" @click="emit('maximize')">
          <el-icon><FullScreen /></el-icon>
        </div>
        <div class="linux-btn close" @click="emit('close')">
          <el-icon><Close /></el-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title-bar {
  height: 40px; 
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--el-bg-color);
  user-select: none;
  -webkit-app-region: drag;
  box-sizing: border-box;
  padding: 0 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
  z-index: 100;
  background-color: transparent;
}

.os-macos {
  padding-left: 14px;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.left-container {
  display: flex;
  align-items: center;
  /* flex: 1; */ 
  flex-shrink: 1; /* 允许收缩 */
  min-width: 0;
  gap: 8px; /* 减小间距 */
  margin-right: 10px; /* 保证与右侧至少有间距 */
}

.right-container {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  height: 100%;
  margin-left: auto; /* 将右侧容器推到最右边，中间留出拖拽空隙 */
}

/* App Info & Conversation Title */
.app-info-inner, .conversation-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background-color 0.2s;
  height: 24px;
}

.app-info-inner:hover, .conversation-inner:hover {
  background-color: var(--el-fill-color);
}

.app-logo {
  width: 16px;
  height: 16px;
  display: block;
}

.app-title {
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  line-height: 1;
  padding-top: 2px; 
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-inner {
  max-width: 100%;
}

.conversation-title {
  font-weight: 500;
  font-size: 13px;
  color: var(--el-text-color-regular);
  max-width: 90px; 
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
  padding-top: 2px; 
}

.download-icon {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.divider-vertical {
  width: 1px;
  height: 14px;
  background-color: var(--el-border-color);
  flex-shrink: 0;
}

/* ============ 功能按钮 (Pin, Top) ============ */
.function-group {
  display: flex;
  gap: 0px;
  margin-right:4px;
  align-items: center;
  height: 100%;
}

.func-btn {
  width: 40px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: default;
  color: var(--el-text-color-secondary);
  transition: background-color 0.1s;
  background-color: transparent;
}

.func-btn:hover {
  background-color: rgba(0, 0, 0, 0.05);
  color: var(--el-text-color-primary);
}

.dark-mode .func-btn:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.func-btn.active {
  color: var(--el-text-color-primary);
  font-weight: bold;
}

/* ============ Windows 样式 ============ */
.win-controls {
  display: flex;
  gap: 0px; /* Windows 原生风格按钮通常是紧挨着的 */
  margin-right: 0px; /* Windows 按钮通常靠边 */
  align-items: center;
  height: 100%;
  margin-left:4px;
}

.win-btn {
  width: 40px; /* Windows 标准宽度较大 */
  height: 32px;
  /* border-radius: 6px; */ /* Windows 按钮通常没有圆角 */
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  transition: all 0.1s;
  font-size: 12px; 
}

.win-btn:hover {
  background-color: var(--el-fill-color);
  color: var(--el-text-color-primary);
}

.win-btn.close:hover {
  background-color: #E81123;
  color: white;
}

/* ============ macOS 样式 ============ */
.mac-traffic-lights {
  display: flex;
  gap: 8px; 
  margin-right: 12px;
  align-items: center;
  height: 100%;
  padding-left: 2px;
}

.traffic-btn {
  width: 13px; /* 微调尺寸 */
  height: 13px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
  
  transform-origin: center center;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform;
}

.traffic-btn.close { background-color: #FF5F57; border: 0.5px solid #E0443E; }
.traffic-btn.minimize { background-color: #FFBD2E; border: 0.5px solid #D69E2E; }
.traffic-btn.maximize { background-color: #28C840; border: 0.5px solid #1C9A29; }

.mac-traffic-lights:hover .traffic-btn {
  transform: scale(1.1); 
}

.mac-traffic-lights:hover .traffic-icon {
  opacity: 1;
  color: rgba(0, 0, 0, 0.6);
}

.traffic-btn:active {
  transform: scale(0.95) !important;
  filter: brightness(0.9);
}

.traffic-icon {
  font-size: 7px; 
  color: rgba(0, 0, 0, 0.6);
  opacity: 0; 
  transition: opacity 0.2s ease, color 0.1s ease;
}

.traffic-icon :deep(svg) {
  stroke: currentColor;
  stroke-width: 60px; 
}

.icon-minus :deep(svg) { stroke-width: 80px; }
.icon-fullscreen :deep(svg) { stroke-width: 40px; }

.dark-mode .traffic-btn {
  border: none;
  box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.1);
}
.dark-mode .traffic-icon {
  color: rgba(0, 0, 0, 0.7);
}

/* ============ Linux 样式 ============ */
.linux-controls {
  display: flex;
  gap: 6px;
  margin-right: 12px;
  align-items: center;
}

.linux-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-regular);
  background-color: transparent;
  transition: all 0.2s;
  font-size: 12px; 
}

.linux-btn:hover {
  background-color: var(--el-fill-color-dark);
  color: var(--el-text-color-primary);
  transform: scale(1.1);
}

.linux-btn.close:hover {
  background-color: #E95420;
  color: white;
}
</style>