<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
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
const panelMaxHeight = ref('60vh');
const placement = reactive({ xRatio: 1, yRatio: 0 });

const EDGE_GAP = 12;
const HEADER_GAP = 8;
const NAV_GAP = 12;
const INPUT_GAP = 12;
const DEFAULT_PANEL_WIDTH = 300;
const DEFAULT_PANEL_HEIGHT = 200;
const MIN_VISIBLE_HEIGHT = 120;

const completedCount = computed(() => props.tasks.filter(t => t.status === 'completed').length);

const getRect = (selector) => document.querySelector(selector)?.getBoundingClientRect?.() || null;
const clampRatio = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const getPanelSize = () => ({
  width: panelRef.value?.offsetWidth || DEFAULT_PANEL_WIDTH,
  height: panelRef.value?.offsetHeight || DEFAULT_PANEL_HEIGHT
});

const getSafeArea = () => {
  const mainRect = getRect('.chat-main');
  const headerRect = getRect('.model-header');
  const navRect = getRect('.unified-nav-sidebar');
  const inputRect = getRect('.chat-input-area-vertical');

  const topBase = mainRect?.top ?? headerRect?.bottom ?? 56;
  const top = Math.max(EDGE_GAP, Math.round(topBase + HEADER_GAP));

  let right = window.innerWidth - EDGE_GAP;
  if (navRect && navRect.left > 0) {
    right = Math.min(right, Math.round(navRect.left - NAV_GAP));
  }

  let bottom = window.innerHeight - EDGE_GAP;
  if (inputRect && inputRect.top > top) {
    bottom = Math.min(bottom, Math.round(inputRect.top - INPUT_GAP));
  }

  if (bottom - top < MIN_VISIBLE_HEIGHT) {
    bottom = window.innerHeight - EDGE_GAP;
  }

  return {
    left: EDGE_GAP,
    top,
    right: Math.max(EDGE_GAP + 160, right),
    bottom: Math.max(top + MIN_VISIBLE_HEIGHT, bottom)
  };
};

const syncPanelMaxHeight = (area = getSafeArea()) => {
  const availableHeight = Math.max(MIN_VISIBLE_HEIGHT, area.bottom - area.top);
  panelMaxHeight.value = `${Math.round(Math.min(window.innerHeight * 0.6, availableHeight))}px`;
};

const clampPosition = (x = pos.x, y = pos.y, area = getSafeArea()) => {
  syncPanelMaxHeight(area);
  const { width, height } = getPanelSize();
  const maxX = Math.max(area.left, area.right - width);
  const maxY = Math.max(area.top, area.bottom - height);

  return {
    x: Math.round(Math.min(Math.max(x, area.left), maxX)),
    y: Math.round(Math.min(Math.max(y, area.top), maxY))
  };
};

const updatePlacementFromPosition = (x = pos.x, y = pos.y) => {
  const area = getSafeArea();
  syncPanelMaxHeight(area);
  const { width, height } = getPanelSize();
  const maxX = Math.max(area.left, area.right - width);
  const maxY = Math.max(area.top, area.bottom - height);
  const spanX = maxX - area.left;
  const spanY = maxY - area.top;

  placement.xRatio = spanX > 0 ? clampRatio((x - area.left) / spanX) : 0;
  placement.yRatio = spanY > 0 ? clampRatio((y - area.top) / spanY) : 0;
};

const getPositionFromPlacement = (area = getSafeArea()) => {
  syncPanelMaxHeight(area);
  const { width, height } = getPanelSize();
  const maxX = Math.max(area.left, area.right - width);
  const maxY = Math.max(area.top, area.bottom - height);
  const spanX = maxX - area.left;
  const spanY = maxY - area.top;
  const x = area.left + spanX * clampRatio(placement.xRatio);
  const y = area.top + spanY * clampRatio(placement.yRatio);
  return clampPosition(x, y, area);
};

const applyPlacementToSafeArea = async () => {
  await nextTick();
  const next = getPositionFromPlacement();
  pos.x = next.x;
  pos.y = next.y;
};

const placeAtDefaultAnchor = async () => {
  await nextTick();
  placement.xRatio = 1;
  placement.yRatio = 0;
  await applyPlacementToSafeArea();
  initialized.value = true;
};

// 首次显示时吸附到 header 下方、右侧导航左侧、输入框上方的安全区域
watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    if (!initialized.value) placeAtDefaultAnchor();
    else applyPlacementToSafeArea();
  }
);

watch(
  () => props.tasks,
  () => {
    if (props.visible) applyPlacementToSafeArea();
  },
  { deep: true }
);

// --- 自定义指针拖拽 ---
let dragging = false;
let startX = 0;
let startY = 0;
let baseX = 0;
let baseY = 0;

const onMouseMove = (e) => {
  if (!dragging) return;
  let nx = baseX + (e.clientX - startX);
  let ny = baseY + (e.clientY - startY);
  const next = clampPosition(nx, ny);
  pos.x = next.x;
  pos.y = next.y;
};

const onMouseUp = () => {
  if (dragging) {
    updatePlacementFromPosition();
  }
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

const onWindowResize = () => {
  if (props.visible || initialized.value) {
    applyPlacementToSafeArea();
  }
};

onMounted(() => {
  window.addEventListener('resize', onWindowResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
});
</script>

<template>
  <div v-show="visible" ref="panelRef" class="task-panel"
    :style="{ left: pos.x + 'px', top: pos.y + 'px', maxHeight: panelMaxHeight }">
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
  --task-panel-bg: rgba(255, 255, 255, 0.55);
  --task-panel-border: rgba(15, 23, 42, 0.12);
  --task-panel-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
  --task-panel-header-border: rgba(15, 23, 42, 0.1);
  --task-panel-text-primary: #1f2937;
  --task-panel-text-regular: #374151;
  --task-panel-text-secondary: #64748b;
  --task-panel-text-placeholder: #94a3b8;
  --task-panel-fill: rgba(15, 23, 42, 0.06);
  --task-panel-fill-hover: rgba(15, 23, 42, 0.09);
  --task-panel-scroll-thumb: rgba(100, 116, 139, 0.45);

  position: fixed;
  z-index: 2000;
  width: min(300px, calc(100vw - 24px));
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  background-color: var(--task-panel-bg);
  color: var(--task-panel-text-primary);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  border: 1px solid var(--task-panel-border);
  box-shadow: var(--task-panel-shadow);
}

html.dark .task-panel {
  --task-panel-bg: rgba(32, 32, 32, 0.86);
  --task-panel-border: rgba(255, 255, 255, 0.12);
  --task-panel-shadow: 0 10px 30px rgba(0, 0, 0, 0.42);
  --task-panel-header-border: rgba(255, 255, 255, 0.1);
  --task-panel-text-primary: #f3f4f6;
  --task-panel-text-regular: #d1d5db;
  --task-panel-text-secondary: #aeb6c2;
  --task-panel-text-placeholder: #7f8794;
  --task-panel-fill: rgba(255, 255, 255, 0.08);
  --task-panel-fill-hover: rgba(255, 255, 255, 0.12);
  --task-panel-scroll-thumb: rgba(156, 163, 175, 0.45);
}

.task-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 8px 12px;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid var(--task-panel-header-border);
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
  color: var(--task-panel-text-primary);
}

.task-progress-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--task-panel-text-secondary);
  padding: 1px 6px;
  border-radius: 8px;
  background-color: var(--task-panel-fill);
}

.task-panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--task-panel-text-secondary);
  transition: all 0.18s ease;
}

.task-panel-close:hover {
  background-color: var(--task-panel-fill-hover);
  color: var(--task-panel-text-primary);
}

.task-panel-body {
  padding: 8px 12px 12px;
  overflow-y: auto;
}

.task-empty {
  font-size: 12px;
  color: var(--task-panel-text-placeholder);
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
  background-color: var(--task-panel-text-placeholder);
}

.ts-pending-sm {
  width: 6px;
  height: 6px;
}

.task-content {
  font-size: 13px;
  line-height: 1.5;
  color: var(--task-panel-text-primary);
  word-break: break-word;
}

.task-content.done {
  color: var(--task-panel-text-secondary);
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
  color: var(--task-panel-text-regular);
  word-break: break-word;
}

.step-content.done {
  color: var(--task-panel-text-placeholder);
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
  background-color: var(--task-panel-scroll-thumb);
  border-radius: 3px;
}
</style>
