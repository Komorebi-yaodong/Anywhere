<template>
    <div class="title-bar" 
         :class="{ dark: isDarkMode }"
         :style="{ backgroundColor: isDarkMode ? '#1F2327' : '#EAEAEA' }">

        <!-- macOS Layout -->
        <template v-if="os === 'macos'">
            <div class="window-controls macos-controls">
                <button class="control-btn close" @click="handleClose">
                    <svg x="0px" y="0px" viewBox="0 0 6.4 6.4">
                        <polygon fill="#4d0000" points="6.4,0.8 5.6,0 3.2,2.4 0.8,0 0,0.8 2.4,3.2 0,5.6 0.8,6.4 3.2,4 5.6,6.4 6.4,5.6 4,3.2"></polygon>
                    </svg>
                </button>
            </div>
            <div class="title-and-actions macos">
                <!-- 子元素被明确标记为 no-drag -->
                <img v-if="favicon" :src="favicon" class="favicon-icon no-drag" />
                <span class="title-text no-drag">{{ title }}</span>
                <div class="actions-slot no-drag">
                    <slot></slot>
                </div>
            </div>
            <div class="spacer macos"></div>
        </template>

        <!-- Windows & Linux Layout -->
        <template v-else>
            <div class="title-and-actions">
                <!-- 子元素被明确标记为 no-drag -->
                <img v-if="favicon" :src="favicon" class="favicon-icon no-drag" />
                <span class="title-text no-drag">{{ title }}</span>
                <div class="actions-slot no-drag">
                    <slot></slot>
                </div>
            </div>
            <div class="window-controls win-controls">
                <button class="control-btn close" @click="handleClose">
                    <svg x="0px" y="0px" viewBox="0 0 10.2 10.2">
                        <polygon fill="currentColor" points="10.2,0.7 9.5,0 5.1,4.4 0.7,0 0,0.7 4.4,5.1 0,9.5 0.7,10.2 5.1,5.8 9.5,10.2 10.2,9.5 5.8,5.1"></polygon>
                    </svg>
                </button>
            </div>
        </template>
    </div>
</template>

<script setup>
defineProps({
    os: {
        type: String,
        required: true,
        validator: (value) => ['macos', 'win', 'linux'].includes(value),
    },
    isDarkMode: {
        type: Boolean,
        default: false,
    },
    title: {
        type: String,
        default: 'Application'
    },
    favicon: {
        type: String,
        required: false
    }
});

const handleClose = () => window.close(); 
</script>

<style scoped>
/* --- Base Styles --- */
.title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 40px;
    width: 100%;
    flex-shrink: 0;
    user-select: none;
    /* KEY: 整个标题栏是可拖拽的背景 */
    -webkit-app-region: drag; 
    position: relative;
    z-index: 100;
    box-sizing: border-box;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.dark.title-bar {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}


/* --- CHANGED: 容器不再是 no-drag --- */
.title-and-actions {
    flex-grow: 1; 
    display: flex;
    align-items: center;
    height: 100%;
    overflow: hidden;
    padding: 0 10px;
    /* -webkit-app-region: no-drag;  <-- REMOVED FROM HERE */
}

/* --- NEW: 创建一个通用 no-drag 类 --- */
.no-drag {
    -webkit-app-region: no-drag;
}

.favicon-icon {
    width: 18px;
    height: 18px;
    margin-right: 8px;
    flex-shrink: 0;
}
.title-text {
    font-size: 13px;
    font-weight: 500;
    color: #333;
    white-space: nowrap;
    margin-right: 16px;
    flex-shrink: 0;
}
.dark .title-text {
    color: #E0E0E0;
}
.actions-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 0;
}


/* --- macOS specific styles --- */
.macos-controls {
    padding: 0 12px;
    width: 75px; 
    box-sizing: border-box;
    -webkit-app-region: no-drag; /* 控件容器整体不可拖拽 */
}
.title-and-actions.macos {
    justify-content: center;
    padding: 0;
}
.spacer.macos {
    width: 75px;
    height: 100%;
    flex-shrink: 0;
}
.macos-controls .control-btn {
    width: 12px; height: 12px; border-radius: 50%; border: none; margin-right: 8px;
    padding: 0; display: flex; align-items: center; justify-content: center;
    cursor: pointer; background-color: #ccc;
}
.macos-controls .control-btn.close { background-color: #ff5f56; }
.macos-controls .control-btn svg { width: 60%; height: 60%; opacity: 0; transition: opacity 0.2s; }
.macos-controls:hover .control-btn svg { opacity: 1; }

/* --- Windows/Linux specific styles --- */
.win-controls {
    height: 100%;
    flex-shrink: 0;
    -webkit-app-region: no-drag; /* 控件容器整体不可拖拽 */
}
.win-controls .control-btn {
    width: 46px; height: 100%; border: none; background-color: transparent;
    color: #666; display: flex; align-items: center; justify-content: center;
    padding: 0; cursor: pointer; transition: background-color 0.2s;
}
.win-controls .control-btn svg { width: 10px; height: 10px; }
.win-controls .control-btn:hover { background-color: rgba(0, 0, 0, 0.1); }
.win-controls .control-btn.close:hover { background-color: #e81123; color: white; }

/* Dark Mode Styles */
.dark .win-controls .control-btn { color: #ccc; }
.dark .win-controls .control-btn:hover { background-color: rgba(255, 255, 255, 0.1); }
.dark .win-controls .control-btn.close:hover { background-color: #e81123; color: white; }
</style>