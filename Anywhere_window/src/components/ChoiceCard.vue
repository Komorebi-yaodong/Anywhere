<script setup>
import { reactive, ref, computed, nextTick } from 'vue';
import { ElButton, ElInput, ElTag, ElIcon } from 'element-plus';
import { Check, ChatLineRound, EditPen, ArrowLeft, ArrowRight } from '@element-plus/icons-vue';

const props = defineProps({
  questions: { type: Array, default: () => [] }
});

const emit = defineEmits(['submit']);

// 每个问题的草稿状态：mode 为 options / custom / discuss，三者互斥
const drafts = reactive(
  props.questions.map(() => ({ mode: '', selected: [], customText: '' }))
);

const currentIndex = ref(0);
const total = computed(() => props.questions.length);
const currentQuestion = computed(() => props.questions[currentIndex.value] || {});

const optionLetter = (index) => String.fromCharCode(65 + index);

const isOptionSelected = (qi, label) =>
  drafts[qi]?.mode === 'options' && drafts[qi].selected.includes(label);

const selectOption = (qi, label) => {
  const d = drafts[qi];
  if (!d) return;
  // 单选：每题只选一个；想表达多个想法请用"其他想法"输入
  d.mode = 'options';
  d.selected = [label];
  d.customText = '';
};

const customInputRef = ref(null);
const chooseCustom = (qi) => {
  const d = drafts[qi];
  if (!d) return;
  d.mode = 'custom';
  d.selected = [];
  nextTick(() => {
    customInputRef.value?.focus?.();
  });
};

const chooseDiscuss = (qi) => {
  const d = drafts[qi];
  if (!d) return;
  d.mode = 'discuss';
  d.selected = [];
  d.customText = '';
};

const isAnswered = (qi) => {
  const d = drafts[qi];
  if (!d) return false;
  if (d.mode === 'discuss') return true;
  if (d.mode === 'custom') return d.customText.trim().length > 0;
  if (d.mode === 'options') return d.selected.length > 0;
  return false;
};

const allAnswered = computed(() => props.questions.every((_, i) => isAnswered(i)));

const goPrev = () => {
  if (currentIndex.value > 0) currentIndex.value -= 1;
};

const goNext = () => {
  if (currentIndex.value < total.value - 1) currentIndex.value += 1;
};

// 在"其他想法"输入框：Ctrl+Enter 换行；普通 Enter 进入下一题或提交
const handleCustomEnter = (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const textarea = e.target;
    const d = drafts[currentIndex.value];
    if (!d || !textarea) return;
    const start = textarea.selectionStart ?? d.customText.length;
    const end = textarea.selectionEnd ?? d.customText.length;
    d.customText = d.customText.slice(0, start) + '\n' + d.customText.slice(end);
    nextTick(() => {
      textarea.selectionStart = textarea.selectionEnd = start + 1;
    });
    return;
  }
  e.preventDefault();
  if (currentIndex.value < total.value - 1) goNext();
  else onSubmit();
};

const onSubmit = () => {
  if (!allAnswered.value) {
    // 跳到第一个未作答的问题
    const firstUnanswered = props.questions.findIndex((_, i) => !isAnswered(i));
    if (firstUnanswered >= 0) currentIndex.value = firstUnanswered;
    return;
  }
  const responses = props.questions.map((q, i) => {
    const d = drafts[i];
    if (d.mode === 'discuss') return { questionIndex: i, type: 'discuss', question: q.question };
    if (d.mode === 'custom') return { questionIndex: i, type: 'custom', customText: d.customText.trim(), question: q.question };
    return { questionIndex: i, type: 'options', selected: d.selected.slice(), question: q.question };
  });
  emit('submit', { responses });
};
</script>

<template>
  <div class="choice-card">
    <div v-if="total > 1" class="choice-progress">
      <span class="choice-progress-text">问题 {{ currentIndex + 1 }} / {{ total }}</span>
      <div class="choice-dots">
        <span
          v-for="(q, i) in questions"
          :key="i"
          class="choice-dot"
          :class="{ active: i === currentIndex, answered: isAnswered(i) }"
          @click="currentIndex = i"
        ></span>
      </div>
    </div>

    <div class="choice-question">
      <div class="choice-q-head">
        <el-tag v-if="currentQuestion.header" size="small" effect="plain" round class="choice-header-tag">
          {{ currentQuestion.header }}
        </el-tag>
        <span class="choice-q-text">{{ currentQuestion.question }}</span>
      </div>

      <div class="choice-options">
        <div
          v-for="(opt, oi) in (currentQuestion.options || [])"
          :key="oi"
          class="choice-option"
          :class="{ 'is-selected': isOptionSelected(currentIndex, opt.label) }"
          @click="selectOption(currentIndex, opt.label)"
        >
          <span class="choice-letter">{{ optionLetter(oi) }}</span>
          <div class="choice-option-body">
            <div class="choice-option-label">{{ opt.label }}</div>
            <div v-if="opt.description" class="choice-option-desc">{{ opt.description }}</div>
          </div>
          <el-icon v-if="isOptionSelected(currentIndex, opt.label)" class="choice-check"><Check /></el-icon>
        </div>

        <!-- 倒数第二项：其他想法（输入框） -->
        <div
          class="choice-option choice-special"
          :class="{ 'is-selected': drafts[currentIndex].mode === 'custom' }"
          @click="chooseCustom(currentIndex)"
        >
          <span class="choice-letter"><el-icon :size="13"><EditPen /></el-icon></span>
          <div class="choice-option-body">
            <div class="choice-option-label">其他想法（自己输入）</div>
            <el-input
              v-if="drafts[currentIndex].mode === 'custom'"
              ref="customInputRef"
              v-model="drafts[currentIndex].customText"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 4 }"
              resize="none"
              placeholder="输入你的想法…"
              class="choice-custom-input"
              @click.stop
              @keydown.enter="handleCustomEnter"
            />
          </div>
        </div>

        <!-- 最后一项：聊聊这个 -->
        <div
          class="choice-option choice-special"
          :class="{ 'is-selected': drafts[currentIndex].mode === 'discuss' }"
          @click="chooseDiscuss(currentIndex)"
        >
          <span class="choice-letter"><el-icon :size="13"><ChatLineRound /></el-icon></span>
          <div class="choice-option-body">
            <div class="choice-option-label">聊聊这个（继续讨论）</div>
          </div>
        </div>
      </div>
    </div>

    <div class="choice-actions">
      <el-button v-if="total > 1" size="small" text :icon="ArrowLeft" :disabled="currentIndex === 0" @click="goPrev">
        上一题
      </el-button>
      <div class="choice-actions-spacer"></div>
      <el-button v-if="currentIndex < total - 1" size="small" @click="goNext">
        下一题<el-icon class="el-icon--right"><ArrowRight /></el-icon>
      </el-button>
      <el-button v-else type="primary" size="small" :icon="Check" :disabled="!allAnswered" @click="onSubmit">
        提交选择
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.choice-card {
  margin-top: 8px;
  padding: 12px;
  border-radius: 12px;
  background-color: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  animation: choice-slide-in 0.25s ease;
}

@keyframes choice-slide-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.choice-progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.choice-progress-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.choice-dots {
  display: flex;
  align-items: center;
  gap: 5px;
}

.choice-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--el-border-color);
  cursor: pointer;
  transition: all 0.18s ease;
}

.choice-dot.answered {
  background-color: var(--el-color-success);
}

.choice-dot.active {
  background-color: var(--el-color-primary);
  transform: scale(1.3);
}

.choice-q-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.choice-q-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.5;
}

.choice-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.choice-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease;
}

.choice-option:hover {
  border-color: var(--el-color-primary);
  background-color: var(--el-fill-color);
}

.choice-option.is-selected {
  border-color: var(--el-color-primary);
  /* 用基于主色的半透明色，深浅模式下都能保持对比 */
  background-color: color-mix(in srgb, var(--el-color-primary) 14%, transparent);
}

.choice-letter {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  background-color: var(--el-fill-color);
  box-sizing: border-box;
}

.choice-letter :deep(.el-icon) {
  display: inline-flex;
}

/* 选中只加主色描边，徽标底色与文字不变，确保深/浅色下 A/B/C 始终可见 */
.choice-option.is-selected .choice-letter {
  color: var(--el-color-primary);
  box-shadow: inset 0 0 0 1.5px var(--el-color-primary);
}

.choice-special .choice-letter {
  color: var(--el-color-primary);
}

.choice-option-body {
  flex: 1;
  min-width: 0;
}

.choice-option-label {
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.5;
}

.choice-option-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  margin-top: 2px;
}

.choice-custom-input {
  margin-top: 6px;
}

.choice-check {
  flex-shrink: 0;
  color: var(--el-color-primary);
  margin-top: 3px;
}

.choice-actions {
  display: flex;
  align-items: center;
  margin-top: 12px;
}

.choice-actions-spacer {
  flex: 1;
}
</style>
