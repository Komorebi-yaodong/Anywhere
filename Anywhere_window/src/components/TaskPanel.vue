<script setup>
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { ElIcon } from 'element-plus';
import { List, Close, Check, Loading } from '@element-plus/icons-vue';

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  visible: { type: Boolean, default: false }
});

defineEmits(['close']);

const panelRef = ref(null);
const pos = reactive({ x: 0, y: 64 });
const initialized = ref(false);

const completedCount = computed(() => props.tasks.filter(t => t.status === 'completed').length);

// 首次显示时定位到右上角
watch(
  () => props.visible,
  (v) => {
    if (v && !initialized.value) {
      nextTick(() => {
        // 默认放右上：header（系统提示词）下方、右侧导航列左侧，避免遮挡两者
        const w = panelRef.value?.offsetWidth || 300;
        const navClearance = 50; // 右侧导航列 width 30 + right 10 + 间距
        pos.x = Math.max(12, window.innerWidth - w - navClearance);
        const mainTop = document.querySelector('.chat-main')?.getBoundingClientRect().top;
        pos.y = (typeof mainTop === 'number' && mainTop > 8) ? mainTop + 8 : 96;
        initialized.value = true;
      });
    }
  }
);

// --- 自定义指针拖拽 ---
let dragging = false;
let startX = 0;
let startY = 0;
let baseX = 0;
let baseY = 0;

const onMouseMove = (e) => {
  if (!dragging) return;
  const w = panelRef.value?.offsetWidth || 300;
  const h = panelRef.value?.offsetHeight || 200;
  let nx = baseX + (e.clientX - startX);
  let ny = baseY + (e.clientY - startY);
  nx = Math.max(0, Math.min(nx, window.innerWidth - w));
  ny = Math.max(0, Math.min(ny, window.innerHeight - h));
  pos.x = nx;
  pos.y = ny;
};

const onMouseUp = () => {
  dragging = false;
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
};

const onHeaderMouseDown = (e) => {
  if (e.button !== 0) return;
  dragging = true;
  startX = e.clientX;
  startY = e.clientY;
  baseX = pos.x;
  baseY = pos.y;
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  e.preventDefault();
};

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
});
</script>

<template>
  <div v-show="visible" ref="panelRef" class="task-panel" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
    <div class="task-panel-header" @mousedown="onHeaderMouseDown">
      <div class="task-panel-title">
        <el-icon :size="14"><List /></el-icon>
        <span>任务进度</span>
        <span class="task-progress-count">{{ completedCount }}/{{ tasks.length }}</span>
      </div>
      <div class="task-panel-close" @mousedown.stop @click="$emit('close')">
        <el-icon :size="14"><Close /></el-icon>
      </div>
    </div>

    <div class="task-panel-body custom-scrollbar">
      <div v-if="tasks.length === 0" class="task-empty">暂无任务</div>
      <div v-for="task in tasks" :key="task.id" class="task-item">
        <div class="task-row">
          <span class="task-status">
            <el-icon v-if="task.status === 'completed'" :size="16" class="ts-done"><Check /></el-icon>
            <el-icon v-else-if="task.status === 'in_progress'" :size="15" class="ts-loading spin"><Loading /></el-icon>
            <span v-else class="ts-pending"></span>
          </span>
          <span class="task-content" :class="{ done: task.status === 'completed' }">{{ task.content }}</span>
        </div>
        <div v-if="task.steps && task.steps.length" class="task-steps">
          <div v-for="(step, si) in task.steps" :key="si" class="step-row">
            <span class="step-status">
              <el-icon v-if="step.status === 'completed'" :size="13" class="ts-done"><Check /></el-icon>
              <el-icon v-else-if="step.status === 'in_progress'" :size="12" class="ts-loading spin"><Loading /></el-icon>
              <span v-else class="ts-pending ts-pending-sm"></span>
            </span>
            <span class="step-content" :class="{ done: step.status === 'completed' }">{{ step.content }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-panel {
  position: fixed;
  z-index: 2000;
  width: 300px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
}

html.dark .task-panel {
  background-color: rgba(32, 32, 32, 0.5);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
}

.task-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 8px 12px;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.task-panel-header:active {
  cursor: grabbing;
}

.task-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.task-progress-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  padding: 1px 6px;
  border-radius: 8px;
  background-color: var(--el-fill-color);
}

.task-panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  transition: all 0.18s ease;
}

.task-panel-close:hover {
  background-color: var(--el-fill-color);
  color: var(--el-text-color-primary);
}

.task-panel-body {
  padding: 8px 12px 12px;
  overflow-y: auto;
}

.task-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 16px 0;
}

.task-item + .task-item {
  margin-top: 8px;
}

.task-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.task-status {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-status {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-status :deep(.el-icon),
.step-status :deep(.el-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ts-done {
  color: var(--el-color-success);
}

.ts-loading {
  color: var(--el-color-primary);
}

.ts-pending {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--el-text-color-placeholder);
}

.ts-pending-sm {
  width: 6px;
  height: 6px;
}

.task-content {
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.task-content.done {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
}

.task-steps {
  margin: 4px 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.step-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.step-content {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
  word-break: break-word;
}

.step-content.done {
  color: var(--el-text-color-placeholder);
  text-decoration: line-through;
}

.spin {
  animation: task-spin 1s linear infinite;
  transform-origin: center;
}

@keyframes task-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.task-panel-body::-webkit-scrollbar {
  width: 6px;
}

.task-panel-body::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color);
  border-radius: 3px;
}
</style>
