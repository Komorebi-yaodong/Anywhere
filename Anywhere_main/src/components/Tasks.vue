<script setup>
import { ref, watch, reactive, onMounted, onActivated, onDeactivated, computed, inject } from 'vue'
import { Plus, Delete, Document, Edit, Search, InfoFilled, Refresh, Clock, Setting as SettingIcon, List, VideoPlay } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';

const { t } = useI18n();
const currentConfig = inject('config');
const activeTaskId = ref(null);
const searchQuery = ref('');

// 收集可用的快捷助手 (只允许独立窗口模式)
const availablePrompts = computed(() => {
    if (!currentConfig.value || !currentConfig.value.prompts) return [];
    const prompts = Object.entries(currentConfig.value.prompts)
        .filter(([key, p]) => p.showMode === 'window')
        .map(([key, p]) => ({ label: key, value: key }))
        .sort((a, b) => a.label.localeCompare(b.label));

    return [{ label: t('tasks.defaultPromptLabel'), value: '__DEFAULT__' }, ...prompts];
});

const availableModels = computed(() => {
    const models = [];
    if (!currentConfig.value || !currentConfig.value.providers) return models;
    
    const folders = currentConfig.value.providerFolders || {};
    const order = currentConfig.value.providerOrder || [];
    
    // 1. 文件夹按字母序排序
    const sortedFolderIds = Object.keys(folders).sort((a, b) => 
        (folders[a].name || '').localeCompare(folders[b].name || '')
    );

    const orderedProviderIds = [];
    // 2. 提取文件夹内的服务商
    sortedFolderIds.forEach(folderId => {
        order.forEach(id => {
            const p = currentConfig.value.providers[id];
            if (p && p.folderId === folderId) orderedProviderIds.push(id);
        });
    });
    // 3. 提取根目录的服务商
    order.forEach(id => {
        const p = currentConfig.value.providers[id];
        if (p && (!p.folderId || !folders[p.folderId])) orderedProviderIds.push(id);
    });

    orderedProviderIds.forEach(providerId => {
        const provider = currentConfig.value.providers[providerId];
        if (provider && provider.enable && provider.modelList && provider.modelList.length > 0) {
            provider.modelList.forEach(modelName => {
                models.push({
                    value: `${providerId}|${modelName}`,
                    label: `${provider.name} | ${modelName}`
                });
            });
        }
    });
    return models;
});

// 获取可用的 MCP 服务
const availableMcpServers = computed(() => {
    if (!currentConfig.value || !currentConfig.value.mcpServers) return [];
    return Object.entries(currentConfig.value.mcpServers)
        .filter(([, server]) => server.isActive)
        .map(([id, server]) => ({ value: id, label: server.name }))
        .sort((a, b) => a.label.localeCompare(b.label));
});

// 获取所有技能
const availableSkills = ref([]);

onMounted(async () => {
    if (!currentConfig.value.tasks) currentConfig.value.tasks = {};
    const taskIds = Object.keys(currentConfig.value.tasks);
    if (taskIds.length > 0) activeTaskId.value = taskIds[0];

    if (currentConfig.value.skillPath) {
        try {
            const skills = await window.api.listSkills(currentConfig.value.skillPath);
            availableSkills.value = skills.sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) { console.error(e); }
    }
});

onActivated(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
});

onDeactivated(() => {
    window.removeEventListener('keydown', handleGlobalKeyDown);
});

watch(() => currentConfig.value?.tasks, (newTasks) => {
    if (newTasks && !activeTaskId.value) {
        const taskIds = Object.keys(newTasks);
        if (taskIds.length > 0) {
            activeTaskId.value = taskIds[0];
        }
    }
}, { deep: true });

// 按照任务名称字典序排序
const sortedTasks = computed(() => {
    if (!currentConfig.value.tasks) return [];
    return Object.entries(currentConfig.value.tasks)
        .map(([id, task]) => ({ id, ...task }))
        .sort((a, b) => a.name.localeCompare(b.name));
});

const filteredTasks = computed(() => {
    if (!searchQuery.value) return sortedTasks.value;
    const q = searchQuery.value.toLowerCase();
    return sortedTasks.value.filter(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
});

const selectedTask = computed(() => {
    if (activeTaskId.value && currentConfig.value.tasks) {
        return currentConfig.value.tasks[activeTaskId.value];
    }
    return null;
});

async function atomicSave(updateFunction) {
    try {
        const latestConfigData = await window.api.getConfig();
        const latestConfig = latestConfigData.config;
        if (!latestConfig.tasks) latestConfig.tasks = {};
        updateFunction(latestConfig);
        await window.api.updateConfigWithoutFeatures({ config: latestConfig });
        currentConfig.value = latestConfig;
    } catch (error) {
        ElMessage.error(t('common.saveFailed'));
    }
}

// 手动刷新配置
async function refreshTasksConfig() {
    try {
        const latestConfigData = await window.api.getConfig();
        if (latestConfigData && latestConfigData.config) {
            currentConfig.value = latestConfigData.config;
            ElMessage.success(t('tasks.refreshSuccess'));
        }
    } catch (error) {
        ElMessage.error(t('tasks.refreshFailed'));
    }
}

// 添加任务
const showAddDialog = ref(false);
const showGlobalSettingDialog = ref(false);
const addTaskForm = reactive({ name: "" });

function saveGlobalTaskModel(val) {
    atomicSave(config => {
        config.defaultTaskModel = val;
    });
    ElMessage.success(t('tasks.defaultModelUpdated'));
}

function handleAddTask() {
    const name = addTaskForm.name.trim();
    if (!name) return;
    if (/[\\/:*?"<>|]/.test(name)) {
        ElMessage.warning(t('tasks.nameInvalidChar'));
        return;
    }

    const taskId = `task_${Date.now()}`;

    const builtinIds = Object.entries(currentConfig.value.mcpServers || {})
        .filter(([, server]) => server.type === 'builtin' && server.isActive !== false)
        .map(([id]) => id);

    atomicSave(config => {
        config.tasks[taskId] = {
            name: name,
            triggerType: 'interval',
            intervalMinutes: 60,
            intervalStartTime: '00:00',
            intervalTimeRanges: [],
            dailyTime: '12:00',
            weeklyDays: [1, 2, 3, 4, 5],
            weeklyTime: '12:00',
            monthlyDays: [1],
            monthlyTime: '12:00',
            singleDate: new Date().toLocaleDateString('sv-SE'),
            singleTime: '12:00',
            promptKey: '__DEFAULT__',
            description: '',
            extraMcp: builtinIds,
            extraSkills: [],
            autoSave: true,
            autoClose: true,
            enabled: false,
            history: []
        };
        activeTaskId.value = taskId;
    });

    addTaskForm.name = "";
    showAddDialog.value = false;
}

const showRenameDialog = ref(false);
const renameTaskForm = reactive({ name: "" });

function openRenameTaskDialog() {
    if (selectedTask.value) {
        renameTaskForm.name = selectedTask.value.name;
        showRenameDialog.value = true;
    }
}

function handleRenameTask() {
    const newName = renameTaskForm.name.trim();
    if (!newName) {
        ElMessage.warning(t('tasks.addDialogNamePlaceholder'));
        return;
    }
    if (/[\\/:*?"<>|]/.test(newName)) {
        ElMessage.warning(t('tasks.nameInvalidFileSystem'));
        return;
    }

    saveTaskSetting('name', newName);

    showRenameDialog.value = false;
    ElMessage.success(t('common.saveSuccess'));
}

function deleteTask() {
    if (!activeTaskId.value) return;
    ElMessageBox.confirm(t('tasks.deleteConfirm'), t('tasks.warning'), { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }).then(() => {
        const idToDelete = activeTaskId.value;
        atomicSave(config => {
            delete config.tasks[idToDelete];
            const remaining = Object.keys(config.tasks);
            activeTaskId.value = remaining.length > 0 ? remaining[0] : null;
        });
        ElMessage.success(t('tasks.deleted'));
    }).catch(() => { });
}

// 清除历史记录与对应文件
async function clearTaskHistory() {
    if (!selectedTask.value || !selectedTask.value.history || selectedTask.value.history.length === 0) {
        ElMessage.info(t('tasks.noHistoryToClear'));
        return;
    }

    try {
        await ElMessageBox.confirm(
            t('tasks.clearHistoryConfirm'),
            t('tasks.dangerConfirm'),
            { confirmButtonText: t('tasks.confirmClear'), cancelButtonText: t('common.cancel'), type: 'error' }
        );

        // 提取本地路径
        const localPath = currentConfig.value.webdav?.localChatPath;
        let deleteCount = 0;

        if (localPath) {
            // 遍历所有带有 json 文件的日志记录，并尝试从本地删除
            for (const log of selectedTask.value.history) {
                if (log.file && log.file.endsWith('.json')) {
                    // 使用原生 path.join 防呆，若不可用则使用正则过滤掉双斜杠
                    let filePath = "";
                    if (window.api && window.api.pathJoin) {
                        filePath = window.api.pathJoin(localPath, log.file);
                    } else {
                        filePath = `${localPath}/${log.file}`.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
                    }

                    try {
                        await window.api.deleteLocalFile(filePath);
                        deleteCount++;
                    } catch (err) {
                        console.warn(`本地文件删除跳过或失败: ${filePath}`, err);
                    }
                }
            }
        }

        // 库中数据清空 (增加 await 确保原子保存完成)
        await atomicSave(config => {
            config.tasks[activeTaskId.value].history = [];
        });

        // 界面数据响应式更新
        if (currentConfig.value.tasks[activeTaskId.value]) {
            currentConfig.value.tasks[activeTaskId.value].history = [];
        }

        const msg = deleteCount > 0
            ? t('tasks.historyClearedWithFiles', { count: deleteCount })
            : t('tasks.historyCleared');
        ElMessage.success(msg);
    } catch (e) {
        // 用户取消
    }
}

async function saveTaskSetting(key, value) {
    if (!activeTaskId.value) return;
    if (key === 'name' && /[\\/:*?"<>|]/.test(value)) {
        ElMessage.warning(t('tasks.nameInvalidFileSystem'));
        return;
    }

    if (currentConfig.value.tasks[activeTaskId.value]) {
        currentConfig.value.tasks[activeTaskId.value][key] = value;
        if (key === 'enabled' && value === true) {
            currentConfig.value.tasks[activeTaskId.value].lastRunTime = Date.now();
        }
    }

    atomicSave(config => {
        config.tasks[activeTaskId.value][key] = value;
        // 同步保存到数据库
        if (key === 'enabled' && value === true) {
            config.tasks[activeTaskId.value].lastRunTime = Date.now();
        }
    });
}

async function runTaskNow() {
    if (!activeTaskId.value) return;
    try {
        await window.api.runTaskNow(activeTaskId.value);
    } catch (error) {
        console.error(error);
    }
}

const handleGlobalKeyDown = (e) => {
    if (!activeTaskId.value) return;

    const activeEl = document.activeElement;
    const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable;

    if (isInput) return;

    if (e.key === 'Delete' || (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey)) {
        deleteTask();
    }
};

const formatTime = (ts) => {
    if (!ts) return t('tasks.neverExecuted');
    return new Date(ts).toLocaleString('zh-CN'); // 日期时间格式建议保留本地化
}

async function openTaskChat(logFile) {
    if (!logFile || !logFile.endsWith('.json')) return;

    const localPath = currentConfig.value.webdav?.localChatPath;
    if (!localPath) {
        ElMessage.warning(t('chats.alerts.localPathRequired') || '请先配置本地对话路径');
        return;
    }

    let filePath = "";
    if (window.api && window.api.pathJoin) {
        filePath = window.api.pathJoin(localPath, logFile);
    } else {
        filePath = `${localPath}/${logFile}`.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    }

    try {
        ElMessage.info(t('chats.alerts.loadingChat') || '正在加载对话...');
        const jsonString = await window.api.readLocalFile(filePath);
        // 将 t('chats.alerts.restoreChat') || '恢复聊天' 修改为硬编码的 '恢复聊天'
        await window.api.coderedirect('恢复聊天', JSON.stringify({ sessionData: jsonString, filename: logFile }));
        ElMessage.success(t('chats.alerts.restoreInitiated') || '对话已开始');
    } catch (error) {
        ElMessage.error((t('chats.alerts.restoreFailed') || '无法打开对话') + `: ${error.message}`);
    }
}
</script>

<template>
    <div class="tasks-page-container">
        <div class="tasks-content-wrapper">
            <el-container>
                <!-- 左侧任务列表 -->
                <el-aside width="240px" class="tasks-aside">
                    <div class="search-container" style="padding: 10px;">
                        <el-input v-model="searchQuery" :placeholder="t('tasks.searchPlaceholder')"
                            :prefix-icon="Search" clearable size="small" />
                    </div>
                    <el-scrollbar class="task-list-scrollbar">
                        <div v-for="task in filteredTasks" :key="task.id" class="task-item"
                            :class="{ 'active': activeTaskId === task.id, 'disabled': !task.enabled }"
                            @click="activeTaskId = task.id">
                            <span class="task-item-name">{{ task.name }}</span>
                            <el-tag v-if="!task.enabled" type="info" size="small" effect="dark" round>{{
                                t('tasks.statusDisabled') }}</el-tag>
                        </div>
                        <div v-if="filteredTasks.length === 0" class="no-tasks">
                            {{ t('tasks.noTasks') }}
                        </div>
                    </el-scrollbar>
                    <div class="aside-actions" style="display: flex; gap: 8px;">
                        <el-button type="primary" :icon="Plus" @click="showAddDialog = true" class="add-task-btn"
                            style="flex: 1; margin: 0;">
                            {{ t('tasks.addBtn') }}
                        </el-button>
                        <el-tooltip :content="t('tasks.globalSettingsTooltip')" placement="top">
                            <el-button :icon="SettingIcon" @click="showGlobalSettingDialog = true"
                                style="margin: 0; padding: 8px 12px; border-radius: 6px;" />
                        </el-tooltip>
                    </div>
                </el-aside>

                <!-- 右侧任务详情 -->
                <el-main class="task-main-content">
                    <el-scrollbar class="task-details-scrollbar">
                        <div v-if="selectedTask" class="task-details">

                            <!-- 顶部标题区 -->
                            <div class="task-header">
                                <div class="task-title-actions">
                                    <h2 class="task-name-display" @click="openRenameTaskDialog">
                                        {{ selectedTask.name }}
                                        <el-tooltip :content="t('common.edit')" placement="top">
                                            <el-icon class="edit-icon">
                                                <Edit />
                                            </el-icon>
                                        </el-tooltip>
                                    </h2>
                                    <el-button type="danger" :icon="Delete" circle plain size="default"
                                        @click="deleteTask" :title="t('tasks.deleteTaskTooltip')"
                                        style="margin-left: 12px;" />
                                </div>
                                <div class="task-header-controls">
                                    <el-tooltip :content="t('tasks.testTaskTooltip')" placement="top">
                                        <el-icon class="test-run-btn" @click="runTaskNow">
                                            <VideoPlay />
                                        </el-icon>
                                    </el-tooltip>

                                    <span class="control-label">{{ t('tasks.enableTaskLabel') }}</span>
                                    <el-switch v-model="selectedTask.enabled"
                                        @change="(val) => saveTaskSetting('enabled', val)" size="large" />
                                </div>
                            </div>

                            <el-form label-position="top" class="task-form">

                                <!-- 卡片 1: 触发规则 -->
                                <div class="task-card">
                                    <div class="task-card-header">
                                        <el-icon>
                                            <Clock />
                                        </el-icon> <span>{{ t('tasks.triggerRulesTitle') }}</span>
                                    </div>
                                    <div class="task-card-body">
                                        <el-row :gutter="20">
                                            <el-col :span="24" style="margin-bottom: 15px;">
                                                <el-radio-group v-model="selectedTask.triggerType"
                                                    class="trigger-type-group"
                                                    @change="(val) => saveTaskSetting('triggerType', val)">
                                                    <el-radio-button value="single">{{ t('tasks.triggerSingle')
                                                    }}</el-radio-button>
                                                    <el-radio-button value="interval">{{ t('tasks.triggerInterval')
                                                    }}</el-radio-button>
                                                    <el-radio-button value="daily">{{ t('tasks.triggerDaily')
                                                    }}</el-radio-button>
                                                    <el-radio-button value="weekly">{{ t('tasks.triggerWeekly')
                                                    }}</el-radio-button>
                                                    <el-radio-button value="monthly">{{ t('tasks.triggerMonthly')
                                                    }}</el-radio-button>
                                                </el-radio-group>
                                            </el-col>

                                            <template v-if="selectedTask.triggerType === 'single'">
                                                <el-col :span="12">
                                                    <el-form-item :label="t('tasks.singleDateLabel')">
                                                        <el-date-picker v-model="selectedTask.singleDate" type="date"
                                                            value-format="YYYY-MM-DD"
                                                            @change="(val) => saveTaskSetting('singleDate', val)"
                                                            style="width: 100%;" :clearable="false" />
                                                    </el-form-item>
                                                </el-col>
                                                <el-col :span="12">
                                                    <el-form-item :label="t('tasks.singleTimeLabel')">
                                                        <el-time-picker v-model="selectedTask.singleTime" format="HH:mm"
                                                            value-format="HH:mm"
                                                            @change="(val) => saveTaskSetting('singleTime', val)"
                                                            style="width: 100%;" :clearable="false" />
                                                    </el-form-item>
                                                </el-col>
                                            </template>

                                            <template v-if="selectedTask.triggerType === 'interval'">
                                                <el-col :span="12">
                                                    <el-form-item :label="t('tasks.intervalMinutesLabel')">
                                                        <el-input-number v-model="selectedTask.intervalMinutes" :min="1"
                                                            @change="(val) => saveTaskSetting('intervalMinutes', val)"
                                                            style="width: 100%;" controls-position="right" />
                                                    </el-form-item>
                                                </el-col>
                                                <el-col :span="12">
                                                    <el-form-item :label="t('tasks.intervalStartTimeLabel')">
                                                        <el-time-picker v-model="selectedTask.intervalStartTime"
                                                            format="HH:mm" value-format="HH:mm"
                                                            @change="(val) => saveTaskSetting('intervalStartTime', val)"
                                                            style="width: 100%;"
                                                            :placeholder="t('tasks.intervalStartTimePlaceholder')" />
                                                    </el-form-item>
                                                </el-col>
                                                <el-col :span="24" style="margin-top: 10px;">
                                                    <el-form-item :label="t('tasks.intervalTimeRangesLabel')">
                                                        <div v-for="(range, index) in selectedTask.intervalTimeRanges"
                                                            :key="index"
                                                            style="display: flex; gap: 10px; margin-bottom: 8px; align-items: center; width: 100%;">
                                                            <el-time-picker
                                                                v-model="selectedTask.intervalTimeRanges[index]"
                                                                is-range
                                                                :range-separator="t('tasks.timeRangeSeparator')"
                                                                :start-placeholder="t('tasks.timeRangeStart')"
                                                                :end-placeholder="t('tasks.timeRangeEnd')"
                                                                format="HH:mm" value-format="HH:mm" style="flex: 1;"
                                                                @change="(val) => { if (!val) selectedTask.intervalTimeRanges.splice(index, 1); saveTaskSetting('intervalTimeRanges', selectedTask.intervalTimeRanges) }" />
                                                            <el-button type="danger" :icon="Delete" circle plain
                                                                size="small"
                                                                @click="() => { selectedTask.intervalTimeRanges.splice(index, 1); saveTaskSetting('intervalTimeRanges', selectedTask.intervalTimeRanges) }" />
                                                        </div>
                                                        <el-button size="small" :icon="Plus" plain
                                                            @click="() => { if (!selectedTask.intervalTimeRanges) selectedTask.intervalTimeRanges = []; selectedTask.intervalTimeRanges.push(['09:00', '18:00']); saveTaskSetting('intervalTimeRanges', selectedTask.intervalTimeRanges) }">
                                                            {{ t('tasks.addTimeRange') }}
                                                        </el-button>
                                                    </el-form-item>
                                                </el-col>
                                            </template>

                                            <template v-if="selectedTask.triggerType === 'daily'">
                                                <el-col :span="12">
                                                    <el-form-item :label="t('tasks.dailyTimeLabel')">
                                                        <el-time-picker v-model="selectedTask.dailyTime" format="HH:mm"
                                                            value-format="HH:mm"
                                                            @change="(val) => saveTaskSetting('dailyTime', val)"
                                                            style="width: 100%;" />
                                                    </el-form-item>
                                                </el-col>
                                            </template>

                                            <template v-if="selectedTask.triggerType === 'weekly'">
                                                <el-col :span="24">
                                                    <el-form-item :label="t('tasks.weeklySettingsLabel')"
                                                        class="compact-form-item">
                                                        <el-checkbox-group v-model="selectedTask.weeklyDays"
                                                            @change="(val) => saveTaskSetting('weeklyDays', val)"
                                                            style="margin-bottom: 10px;">
                                                            <el-checkbox-button :value="1">{{ t('tasks.weekdays.1')
                                                            }}</el-checkbox-button>
                                                            <el-checkbox-button :value="2">{{ t('tasks.weekdays.2')
                                                            }}</el-checkbox-button>
                                                            <el-checkbox-button :value="3">{{ t('tasks.weekdays.3')
                                                            }}</el-checkbox-button>
                                                            <el-checkbox-button :value="4">{{ t('tasks.weekdays.4')
                                                            }}</el-checkbox-button>
                                                            <el-checkbox-button :value="5">{{ t('tasks.weekdays.5')
                                                            }}</el-checkbox-button>
                                                            <el-checkbox-button :value="6">{{ t('tasks.weekdays.6')
                                                            }}</el-checkbox-button>
                                                            <el-checkbox-button :value="0">{{ t('tasks.weekdays.0')
                                                            }}</el-checkbox-button>
                                                        </el-checkbox-group>
                                                    </el-form-item>
                                                </el-col>
                                                <el-col :span="12">
                                                    <el-form-item :label="t('tasks.weeklyTimeLabel')">
                                                        <el-time-picker v-model="selectedTask.weeklyTime" format="HH:mm"
                                                            value-format="HH:mm"
                                                            @change="(val) => saveTaskSetting('weeklyTime', val)"
                                                            style="width: 100%;" />
                                                    </el-form-item>
                                                </el-col>
                                            </template>

                                            <template v-if="selectedTask.triggerType === 'monthly'">
                                                <el-col :span="12">
                                                    <el-form-item :label="t('tasks.monthlyDayLabel')">
                                                        <el-select :model-value="selectedTask.monthlyDays || []"
                                                            multiple clearable placeholder="请选择触发日期 (可多选)"
                                                            @change="(val) => { selectedTask.monthlyDays = val; saveTaskSetting('monthlyDays', val) }"
                                                            style="width: 100%;">
                                                            <el-option v-for="day in 31" :key="day" :label="`${day}日`"
                                                                :value="day" />
                                                        </el-select>
                                                    </el-form-item>
                                                </el-col>
                                                <el-col :span="12">
                                                    <el-form-item :label="t('tasks.monthlyTimeLabel')">
                                                        <el-time-picker v-model="selectedTask.monthlyTime"
                                                            format="HH:mm" value-format="HH:mm"
                                                            @change="(val) => saveTaskSetting('monthlyTime', val)"
                                                            style="width: 100%;" />
                                                    </el-form-item>
                                                </el-col>
                                            </template>
                                        </el-row>
                                    </div>
                                </div>

                                <!-- 卡片 2: 执行内容与助手 -->
                                <div class="task-card">
                                    <div class="task-card-header">
                                        <el-icon>
                                            <Document />
                                        </el-icon> <span>{{ t('tasks.executionContentTitle') }}</span>
                                    </div>
                                    <div class="task-card-body">
                                        <el-form-item>
                                            <template #label>{{ t('tasks.targetPromptLabel') }} <el-tooltip
                                                    :content="t('tasks.targetPromptTooltip')"><el-icon>
                                                        <InfoFilled />
                                                    </el-icon></el-tooltip></template>
                                            <el-select v-model="selectedTask.promptKey"
                                                @change="(val) => saveTaskSetting('promptKey', val)"
                                                style="width: 100%;">
                                                <el-option v-for="item in availablePrompts" :key="item.value"
                                                    :label="item.label" :value="item.value" />
                                            </el-select>
                                        </el-form-item>
                                        <el-form-item :label="t('tasks.promptContentLabel')"
                                            class="task-desc-form-item">
                                            <el-scrollbar max-height="220px" class="task-textarea-scrollbar">
                                                <el-input v-model="selectedTask.description" type="textarea"
                                                    :autosize="{ minRows: 4 }" resize="none"
                                                    :placeholder="t('tasks.promptContentPlaceholder')"
                                                    @change="(val) => saveTaskSetting('description', val)"
                                                    class="task-textarea" />
                                            </el-scrollbar>
                                        </el-form-item>
                                    </div>
                                </div>

                                <!-- 卡片 3: 行为与高级集成 -->
                                <div class="task-card">
                                    <div class="task-card-header">
                                        <el-icon>
                                            <SettingIcon />
                                        </el-icon> <span>{{ t('tasks.advancedSettingsTitle') }}</span>
                                    </div>
                                    <div class="task-card-body">
                                        <el-row :gutter="20">
                                            <el-col :span="12">
                                                <el-form-item :label="t('tasks.overrideMcpLabel')">
                                                    <el-select v-model="selectedTask.extraMcp" multiple filterable
                                                        clearable :reserve-keyword="false"
                                                        @change="(val) => saveTaskSetting('extraMcp', val)"
                                                        style="width: 100%;"
                                                        :placeholder="t('tasks.overrideMcpPlaceholder')">
                                                        <el-option v-for="mcp in availableMcpServers" :key="mcp.value"
                                                            :label="mcp.label" :value="mcp.value" />
                                                    </el-select>
                                                </el-form-item>
                                            </el-col>
                                            <el-col :span="12">
                                                <el-form-item :label="t('tasks.overrideSkillsLabel')">
                                                    <el-select v-model="selectedTask.extraSkills" multiple filterable
                                                        clearable :reserve-keyword="false"
                                                        @change="(val) => saveTaskSetting('extraSkills', val)"
                                                        style="width: 100%;"
                                                        :placeholder="t('tasks.overrideSkillsPlaceholder')">
                                                        <el-option v-for="skill in availableSkills" :key="skill.name"
                                                            :label="skill.name" :value="skill.name" />
                                                    </el-select>
                                                </el-form-item>
                                            </el-col>
                                            <el-col :span="24" style="margin-top: 5px;">
                                                <el-form-item :label="t('tasks.backgroundOptionsLabel')">
                                                    <div class="toggle-group">
                                                        <el-checkbox v-model="selectedTask.autoSave"
                                                            @change="(val) => saveTaskSetting('autoSave', val)">
                                                            {{ t('tasks.autoSaveLabel') }}
                                                            <el-tooltip :content="t('tasks.autoSaveTooltip')"
                                                                placement="top">
                                                                <el-icon
                                                                    style="margin-left: 4px; vertical-align: middle;">
                                                                    <InfoFilled />
                                                                </el-icon>
                                                            </el-tooltip>
                                                        </el-checkbox>
                                                        <el-checkbox v-model="selectedTask.autoClose"
                                                            @change="(val) => saveTaskSetting('autoClose', val)"
                                                            :label="t('tasks.autoCloseLabel')" />
                                                    </div>
                                                </el-form-item>
                                            </el-col>
                                        </el-row>
                                    </div>
                                </div>

                                <!-- 卡片 4: 历史执行记录 -->
                                <div class="task-card log-card">
                                    <div class="task-card-header"
                                        style="justify-content: space-between; border-bottom: none; padding-bottom: 0;">
                                        <div style="display: flex; align-items: center; gap: 6px;"><el-icon>
                                                <List />
                                            </el-icon> <span>{{ t('tasks.recentHistoryTitle') }}</span></div>

                                        <!-- 修改点：添加了并排的刷新与清空按钮 -->
                                        <div style="display: flex; gap: 10px;">
                                            <el-button size="small" :icon="Refresh" @click="refreshTasksConfig">{{
                                                t('tasks.refreshHistoryBtn')
                                            }}</el-button>
                                            <el-button size="small" type="danger" plain :icon="Delete"
                                                @click="clearTaskHistory">{{
                                                    t('tasks.clearHistoryBtn') }}</el-button>
                                        </div>

                                    </div>
                                    <div class="task-card-body" style="padding-top: 10px;">
                                        <div class="history-list">
                                            <div v-if="!selectedTask.history || selectedTask.history.length === 0"
                                                class="no-history">{{
                                                    t('tasks.noExecutionHistory') }}</div>
                                            <div v-else class="history-item"
                                                v-for="(log, i) in selectedTask.history.slice(0, 8)" :key="i">
                                                <span class="log-time">{{ formatTime(log.time) }}</span>
                                                <el-tag size="small"
                                                    :type="log.status === 'success' ? 'success' : 'danger'"
                                                    class="log-status">{{
                                                        log.status === 'success' ? t('tasks.statusSuccess') :
                                                            t('tasks.statusFail') }}</el-tag>
                                                <span class="log-file" :title="log.file"
                                                    :class="{ 'clickable': log.file && log.file.endsWith('.json') }"
                                                    @click="openTaskChat(log.file)">
                                                    <el-icon style="margin-right: 4px; vertical-align: middle;">
                                                        <Document />
                                                    </el-icon>
                                                    {{ log.file }}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </el-form>
                        </div>
                        <el-empty v-else :description="t('tasks.noTasks')" class="empty-state-main" />
                    </el-scrollbar>
                </el-main>
            </el-container>
        </div>

        <!-- 全局悬浮刷新按钮 -->
        <el-button class="refresh-fab-button" :icon="Refresh" type="primary" circle @click="refreshTasksConfig"
            :title="t('tasks.refreshFabTitle')" />

        <el-dialog v-model="showAddDialog" :title="t('tasks.addDialogTitle')" width="400px"
            :close-on-click-modal="false">
            <el-form :model="addTaskForm" @submit.prevent="handleAddTask">
                <el-form-item :label="t('tasks.addDialogNameLabel')" required>
                    <el-input v-model="addTaskForm.name" :placeholder="t('tasks.addDialogNamePlaceholder')"
                        @keyup.enter="handleAddTask" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="showAddDialog = false">{{ t('common.cancel') }}</el-button>
                <el-button type="primary" @click="handleAddTask">{{ t('common.confirm') }}</el-button>
            </template>
        </el-dialog>

        <el-dialog v-model="showRenameDialog" :title="t('chats.rename.promptTitle')" width="400px"
            :close-on-click-modal="false">
            <el-form :model="renameTaskForm" @submit.prevent="handleRenameTask">
                <el-form-item :label="t('tasks.addDialogNameLabel')" required>
                    <el-input v-model="renameTaskForm.name" :placeholder="t('tasks.addDialogNamePlaceholder')"
                        @keyup.enter="handleRenameTask" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="showRenameDialog = false">{{ t('common.cancel') }}</el-button>
                <el-button type="primary" @click="handleRenameTask">{{ t('common.confirm') }}</el-button>
            </template>
        </el-dialog>

        <!-- 默认助手设置弹窗 -->
        <el-dialog v-model="showGlobalSettingDialog" :title="t('tasks.globalSettingsDialogTitle')" width="400px"
            :close-on-click-modal="false">
            <el-form label-position="top">
                <el-form-item>
                    <template #label>
                        {{ t('tasks.executionModelLabel') }}
                        <el-tooltip :content="t('tasks.executionModelTooltip')"><el-icon>
                                <InfoFilled />
                            </el-icon></el-tooltip>
                    </template>
                    <el-select v-model="currentConfig.defaultTaskModel" filterable style="width: 100%;"
                        @change="saveGlobalTaskModel">
                        <el-option v-for="item in availableModels" :key="item.value" :label="item.label"
                            :value="item.value" />
                    </el-select>
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="showGlobalSettingDialog = false">{{ t('common.close') }}</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<style scoped>
/* ====== 布局与外壳 ====== */
.tasks-page-container {
    height: 100%;
    width: 100%;
    padding: 0;
    box-sizing: border-box;
    background-color: var(--bg-primary);
    display: flex;
    position: relative;
}

.tasks-content-wrapper {
    flex-grow: 1;
    width: 100%;
    display: flex;
    padding: 20px;
    gap: 20px;
    overflow: hidden;
    box-sizing: border-box;
}

.tasks-content-wrapper>.el-container {
    width: 100%;
    height: 100%;
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-primary);
    overflow: hidden;
}

/* ====== 左侧边栏 ====== */
.tasks-aside {
    background-color: var(--bg-primary);
    border-right: 1px solid var(--border-primary);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.task-list-scrollbar {
    flex-grow: 1;
    padding: 8px;
}

.task-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 14px;
    margin-bottom: 4px;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s;
    font-size: 14px;
    color: var(--text-primary);
}

.task-item-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
}

.task-item:hover {
    background-color: var(--bg-tertiary);
}

.task-item.active {
    background-color: var(--bg-accent);
    color: var(--text-on-accent);
}

.task-item.disabled .task-item-name {
    color: var(--text-tertiary);
    text-decoration: line-through;
}

.no-tasks {
    padding: 20px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 14px;
}

.aside-actions {
    padding: 12px;
    border-top: 1px solid var(--border-primary);
}

.add-task-btn {
    width: 100%;
    border-radius: 6px;
    font-weight: 500;
}

/* ====== 右侧主内容区 ====== */
.task-main-content {
    background-color: var(--bg-secondary);
    height: 100%;
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.task-details-scrollbar {
    flex-grow: 1;
    height: 100%;
    width: 100%;
}

.task-details {
    padding: 20px 30px;
    box-sizing: border-box;
    max-width: 100%;
    overflow-x: hidden;
}

.empty-state-main {
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
}

/* ====== 顶部 Header ====== */
.task-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-primary);
    padding-bottom: 15px;
    margin-bottom: 20px;
    overflow: hidden;
}

.task-title-actions {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    margin-right: 15px;
}

.task-name-display {
    font-size: 22px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;

    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.task-name-display .edit-icon {
    margin-left: 10px;
    color: var(--text-secondary);
    font-size: 16px;
    opacity: 0;
    transition: opacity 0.2s;
}

.task-name-display:hover .edit-icon {
    opacity: 1;
}

.task-header-controls {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
}

.control-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
}

/* ====== 卡片化设计 ====== */
.task-card {
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    margin-bottom: 20px;
    transition: box-shadow 0.2s;
    box-sizing: border-box;
    width: 100%;
}

.task-card:hover {
    border-color: var(--text-accent);
}

.task-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    border-bottom: 1px dashed var(--border-primary);
}

.task-card-body {
    padding: 16px;
}

/* ====== 表单细节 ====== */
.task-form :deep(.el-form-item__label) {
    font-weight: 500;
    color: var(--text-secondary);
    padding-bottom: 4px;
}

.compact-form-item {
    margin-bottom: 0;
}

.toggle-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
}

.task-textarea :deep(.el-textarea__inner) {
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    color: var(--text-primary);
}

.task-textarea :deep(.el-textarea__inner:focus) {
    box-shadow: 0 0 0 1px var(--text-accent) inset !important;
}

/* ====== 执行记录列表 ====== */
.history-list {
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-sm);
    overflow: hidden;
}

.no-history {
    font-size: 13px;
    color: var(--text-tertiary);
    text-align: center;
    padding: 20px;
}

.history-item {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 10px 15px;
    border-bottom: 1px solid var(--border-primary);
    font-size: 13px;
    transition: background-color 0.2s;
}

.history-item:hover {
    background-color: var(--bg-tertiary);
}

.history-item:last-child {
    border-bottom: none;
}

.log-time {
    color: var(--text-secondary);
    width: 140px;
    font-family: monospace;
    flex-shrink: 0;
}

.log-status {
    width: 65px;
    text-align: center;
    flex-shrink: 0;
}

.log-file {
    color: var(--text-primary);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.9;
}

.log-file.clickable {
    color: var(--el-color-primary);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color 0.2s, color 0.2s;
}

.log-file.clickable:hover {
    text-decoration-color: var(--el-color-primary);
    opacity: 1;
}

/* 悬浮刷新按钮 */
.refresh-fab-button {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 21;
    width: 24px;
    height: 24px;
    font-size: 16px;
    box-shadow: var(--el-box-shadow-light);
}

html.dark .task-form :deep(.el-input__wrapper),
html.dark .task-form :deep(.el-select__wrapper),
html.dark .task-form :deep(.el-textarea__inner) {
    background-color: var(--bg-secondary) !important;
    /* 使用更深的背景色产生层级感 */
    box-shadow: 0 0 0 1px var(--border-primary) inset !important;
}

html.dark .task-form :deep(.el-input__wrapper.is-focus),
html.dark .task-form :deep(.el-select__wrapper.is-focused),
html.dark .task-form :deep(.el-textarea__inner:focus) {
    box-shadow: 0 0 0 1px var(--text-primary) inset !important;
    /* 聚焦时高亮边框 */
}

.task-textarea-scrollbar {
    width: 100%;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background-color: var(--bg-primary);
    transition: all 0.2s;
    box-sizing: border-box;
}

html.dark .task-textarea-scrollbar {
    background-color: var(--bg-secondary);
    /* 深色模式使用更深的背景模拟下凹 */
}

.task-textarea-scrollbar:focus-within {
    border-color: var(--text-accent);
    box-shadow: 0 0 0 1px var(--text-accent) inset;
}

.task-textarea-scrollbar :deep(.el-textarea__inner),
.task-textarea-scrollbar :deep(.el-textarea__inner:focus),
.task-textarea-scrollbar :deep(.el-textarea__inner:hover) {
    background-color: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 8px 12px;
}

.task-textarea-scrollbar :deep(.el-textarea__inner::-webkit-scrollbar) {
    display: none;
}

html.dark .task-textarea-scrollbar :deep(.el-scrollbar__thumb) {
    background-color: var(--text-tertiary);
    opacity: 0.5;
}

html.dark .task-textarea-scrollbar :deep(.el-scrollbar__thumb:hover) {
    background-color: var(--text-secondary);
    opacity: 0.8;
}

/* 立即运行测试按钮样式 */
.test-run-btn {
    font-size: 28px;
    color: var(--el-color-success);
    cursor: pointer;
    margin-right: 10px;
    transition: all 0.2s cubic-bezier(0.25, 0.8, 0.5, 1);
}

.test-run-btn:hover {
    transform: scale(1.15);
    filter: brightness(1.1);
}

.test-run-btn:active {
    transform: scale(0.95);
}

.trigger-type-group {
    display: flex;
    width: 100%;
}

.trigger-type-group :deep(.el-radio-button) {
    flex: 1;
}

.trigger-type-group :deep(.el-radio-button__inner) {
    width: 100%;
    padding-left: 0;
    padding-right: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>