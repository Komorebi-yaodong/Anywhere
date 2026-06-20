<script setup>
import { ref, onMounted, computed, watch, onUnmounted, nextTick, onActivated, onDeactivated, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { createClient } from "webdav/web";
import { Refresh, Delete as DeleteIcon, ChatDotRound, Edit, Upload, Download, Switch, QuestionFilled, Brush, Share, Plus, ArrowRight, Folder } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n();
const currentConfig = inject('config');

// --- Component State ---
const activeView = ref('local');
const localChatPath = ref('');
const webdavConfig = ref(null);
const isWebdavConfigValid = ref(false);
const isCloudDataLoaded = ref(false);

const localChatFiles = ref([]);
const cloudChatFiles = ref([]);
const isTableLoading = ref(false);
const selectedFiles = ref([]);
const currentPage = ref(1);
const pageSize = ref(20);
const singleFileSyncing = ref({});
const isDeletingFiles = ref(false);
const sortMode = ref('createdAt');
const sortDirection = ref('desc');

// --- 项目（目录）分组拖拽状态 ---
const draggedFileBasenames = ref([]);
const dragOverProjectTarget = ref('');
const isProjectDragging = ref(false);
const dragGhostX = ref(0);
const dragGhostY = ref(0);
const dragGhostLabel = ref('');

// --- 项目（目录）分组状态 ---
const COLLAPSED_PROJECTS_STORAGE_KEY = 'chats-collapsed-projects';

function loadCollapsedProjectIds() {
    try {
        const raw = localStorage.getItem(COLLAPSED_PROJECTS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

function persistCollapsedProjectIds(ids) {
    try {
        localStorage.setItem(COLLAPSED_PROJECTS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
    } catch {
        // ignore localStorage persistence failure
    }
}

const localProjects = ref({ version: 1, projects: [] });
const cloudProjects = ref({ version: 1, projects: [] });
const collapsedProjectIds = ref(new Set(loadCollapsedProjectIds()));
const projectDeleteDialog = ref({ visible: false, id: '', name: '', busy: false });
const PROJECT_UNGROUPED_DROP_ID = '__ungrouped__';

watch(() => currentConfig.value?.webdav, (newWebdav) => {
    if (newWebdav) {
        const oldLocalPath = localChatPath.value;
        localChatPath.value = newWebdav.localChatPath || '';
        webdavConfig.value = newWebdav;
        isWebdavConfigValid.value = !!(webdavConfig.value.url && webdavConfig.value.data_path);
        
        // 如果本地路径发生变化，且当前在"本地对话"视图，则重新获取列表
        if (oldLocalPath !== localChatPath.value) {
            if (activeView.value === 'local') {
                if (localChatPath.value) {
                    fetchLocalFiles(true);
                } else {
                    localChatFiles.value = [];
                }
            }
        }
    }
}, { deep: true });

// --- Sync Progress State ---
const isSyncing = ref(false);
const syncProgress = ref(0);
const syncStatusText = ref('');
const syncAbortController = ref(null);

// --- 自动清理功能状态 ---
const showCleanDialog = ref(false);
const cleanDaysOption = ref(30); 
const cleanCustomDays = ref(60);
const isCleaning = ref(false);

// --- 框选功能状态 ---
const isDragActive = ref(false); // 视觉上的选框是否显示
const selectionBox = ref({ top: 0, left: 0, width: 0, height: 0 });
const chatListRef = ref(null);

let startX = 0;
let startY = 0;
let isMouseDown = false;
let hasMoved = false; 
// 记录拖拽开始前哪些文件是选中的 (Set<Basename>)
let initialSelectionSnap = new Set(); 


const normalizeDateValue = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const safeDateValue = (value) => {
    const normalized = normalizeDateValue(value);
    return normalized ? new Date(normalized).getTime() : 0;
};

const normalizeTitleValue = (file) => {
    const basename = formatFilenameDisplay(file?.basename || '');
    if (basename) return basename;
    return typeof file?.title === 'string' && file.title.trim() ? file.title.trim() : '';
};

const collectMessageTimestamps = (sessionData) => {
    const timestamps = [];
    const messageLists = [sessionData?.chat_show, sessionData?.history];

    messageLists.forEach((messages) => {
        if (!Array.isArray(messages)) return;
        messages.forEach((message) => {
            [message?.timestamp, message?.completedTimestamp, message?.updatedAt, message?.createdAt].forEach((candidate) => {
                const normalized = normalizeDateValue(candidate);
                if (normalized) timestamps.push(normalized);
            });
        });
    });

    return timestamps.sort((a, b) => new Date(a) - new Date(b));
};

const normalizeSessionFile = (file, sessionData = null) => {
    const sessionMetadata = sessionData?.sessionMetadata || {};
    const timestamps = sessionData ? collectMessageTimestamps(sessionData) : [];
    const fallbackCreatedAt = timestamps[0] || normalizeDateValue(file.createdAt) || normalizeDateValue(file.birthtime) || normalizeDateValue(file.lastmod);
    const fallbackUpdatedAt = timestamps[timestamps.length - 1] || normalizeDateValue(file.updatedAt) || normalizeDateValue(file.lastmod) || fallbackCreatedAt;

    return {
        ...file,
        title: (typeof sessionMetadata.title === 'string' && sessionMetadata.title.trim()) || normalizeTitleValue(file),
        createdAt: normalizeDateValue(sessionMetadata.createdAt) || fallbackCreatedAt,
        updatedAt: normalizeDateValue(sessionMetadata.updatedAt) || fallbackUpdatedAt,
    };
};


const isCloudView = computed(() => activeView.value === 'cloud');
const showCreatedAtColumn = computed(() => !isCloudView.value);
const chatTableColumns = computed(() => (
    showCreatedAtColumn.value
        ? '22px minmax(0, 1.3fr) minmax(96px, 0.9fr) minmax(96px, 0.9fr) minmax(58px, 0.5fr) 120px'
        : '22px minmax(0, 1.8fr) minmax(104px, 0.9fr) minmax(64px, 0.5fr) 120px'
));

const getSortDirectionLabel = () => sortDirection.value === 'asc' ? '↑' : '↓';

const getColumnSortLabel = (mode) => `${t(`chats.sort.${mode}`)} ${getSortDirectionLabel()}`;

const toggleSort = (mode) => {
    if (mode === 'createdAt' && isCloudView.value) {
        return;
    }

    if (sortMode.value === mode) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortMode.value = mode;
        sortDirection.value = mode === 'name' ? 'asc' : 'desc';
    }

    currentPage.value = 1;
};

const ensureValidSortModeForView = () => {
    if (isCloudView.value && sortMode.value === 'createdAt') {
        sortMode.value = 'updatedAt';
        sortDirection.value = 'desc';
    }
};

const compareFilesBySortMode = (a, b) => {
    let result = 0;

    if (sortMode.value === 'name') {
        result = normalizeTitleValue(a).localeCompare(normalizeTitleValue(b), undefined, { numeric: true, sensitivity: 'base' });
    } else if (sortMode.value === 'updatedAt') {
        result = safeDateValue(b.updatedAt || b.lastmod || b.createdAt) - safeDateValue(a.updatedAt || a.lastmod || a.createdAt);
    } else if (sortMode.value === 'size') {
        result = Number(b.size || 0) - Number(a.size || 0);
    } else {
        result = safeDateValue(b.createdAt || b.lastmod) - safeDateValue(a.createdAt || a.lastmod);
    }

    return sortDirection.value === 'asc' ? -result : result;
};

const getCompareTimestamp = (file) => {
    return file.updatedAt || file.lastmod || file.createdAt;
};

const shouldUploadFile = (local, cloudFile) => {
    if (!cloudFile) return true;
    return safeDateValue(getCompareTimestamp(local)) > safeDateValue(getCompareTimestamp(cloudFile));
};

const shouldDownloadFile = (cloud, localFile) => {
    if (!localFile) return true;
    return safeDateValue(getCompareTimestamp(cloud)) > safeDateValue(getCompareTimestamp(localFile));
};

// --- Computed Properties ---
const getFileMap = (fileList) => new Map(fileList.map(f => [f.basename, f]));

const uploadableCount = computed(() => {
    if (!isWebdavConfigValid.value) return 0;
    const cloudMap = getFileMap(cloudChatFiles.value);
    return localChatFiles.value.filter(local => shouldUploadFile(local, cloudMap.get(local.basename))).length;
});

const downloadableCount = computed(() => {
    if (!isWebdavConfigValid.value) return 0;
    const localMap = getFileMap(localChatFiles.value);
    return cloudChatFiles.value.filter(cloud => shouldDownloadFile(cloud, localMap.get(cloud.basename))).length;
});

const currentFiles = computed(() => {
    const fileList = activeView.value === 'local' ? localChatFiles.value : cloudChatFiles.value;
    return [...fileList].sort(compareFilesBySortMode);
});
const paginatedFiles = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return currentFiles.value.slice(start, end);
});

// --- 项目分组视图 ---
const activeProjectsData = computed(() =>
    activeView.value === 'local' ? localProjects.value : cloudProjects.value
);

const fileByBasename = computed(() => {
    const fileList = activeView.value === 'local' ? localChatFiles.value : cloudChatFiles.value;
    return new Map(fileList.map((f) => [f.basename, f]));
});

const getJsonBasenameCandidate = (value) => {
    const basename = String(value || '').trim();
    if (!basename) return '';
    return basename.toLowerCase().endsWith('.json') ? basename : `${basename}.json`;
};

const resolveProjectFileBasename = (value, map = fileByBasename.value) => {
    const basename = String(value || '').trim();
    if (!basename) return '';
    if (map.has(basename)) return basename;
    const jsonBasename = getJsonBasenameCandidate(basename);
    return map.has(jsonBasename) ? jsonBasename : basename;
};

const isSameProjectFile = (projectFile, basename) => {
    const rawProjectFile = String(projectFile || '').trim();
    const rawBasename = String(basename || '').trim();
    if (!rawProjectFile || !rawBasename) return false;
    return rawProjectFile === rawBasename || getJsonBasenameCandidate(rawProjectFile) === rawBasename;
};

const assignedBasenames = computed(() => {
    const set = new Set();
    const projects = Array.isArray(activeProjectsData.value?.projects) ? activeProjectsData.value.projects : [];
    const map = fileByBasename.value;
    projects.forEach((project) => {
        (Array.isArray(project?.files) ? project.files : []).forEach((bn) => {
            const basename = resolveProjectFileBasename(bn, map);
            if (basename) set.add(basename);
        });
    });
    return set;
});

// 项目按 name 字典序置顶；项目内文件按当前排序模式排序；保留空项目以便拖入。
const projectGroups = computed(() => {
    const projects = Array.isArray(activeProjectsData.value?.projects) ? [...activeProjectsData.value.projects] : [];
    projects.sort((a, b) =>
        String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { numeric: true, sensitivity: 'base' })
    );
    const map = fileByBasename.value;
    return projects.map((project) => {
        const files = (Array.isArray(project?.files) ? project.files : [])
            .map((bn) => map.get(resolveProjectFileBasename(bn, map)))
            .filter(Boolean)
            .sort(compareFilesBySortMode);
        return {
            id: project.id,
            name: project.name || project.id,
            files,
            count: files.length,
            collapsed: collapsedProjectIds.value.has(project.id)
        };
    });
});

// 未分组文件（参与分页）
const ungroupedFiles = computed(() => {
    const assigned = assignedBasenames.value;
    return currentFiles.value.filter((f) => !assigned.has(f.basename));
});

const paginatedUngrouped = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return ungroupedFiles.value.slice(start, end);
});

// 扁平渲染行：项目头 + 项目内文件 + 未分组标签 + 未分组文件
const displayRows = computed(() => {
    const rows = [];
    const groups = projectGroups.value;
    groups.forEach((group) => {
        rows.push({ kind: 'project', id: group.id, name: group.name, count: group.count, collapsed: group.collapsed });
        if (!group.collapsed) {
            group.files.forEach((file) => rows.push({ kind: 'file', file, projectId: group.id }));
        }
    });
    const ungrouped = paginatedUngrouped.value;
    if (groups.length > 0) {
        rows.push({ kind: 'ungrouped-label' });
    }
    ungrouped.forEach((file) => rows.push({ kind: 'file', file, projectId: null }));
    return rows;
});

// 当前可见文件（用于全选/框选）
const visibleFiles = computed(() => displayRows.value.filter((r) => r.kind === 'file').map((r) => r.file));

// --- Helper Functions ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
};
const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024; const dm = decimals < 0 ? 0 : decimals; const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const handleWindowFocus = () => {
    refreshData(true);
};

onMounted(async () => {
    try {
        const result = await window.api.getConfig();
        if (result && result.config && result.config.webdav) {
            localChatPath.value = result.config.webdav.localChatPath;
            webdavConfig.value = result.config.webdav;
            isWebdavConfigValid.value = !!(webdavConfig.value.url && webdavConfig.value.data_path);
            if (localChatPath.value) await fetchLocalFiles();
        }
    } catch (error) { 
        ElMessage.error(t('chats.alerts.configError')); 
    }
});

onActivated(() => {
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mouseup', onGlobalMouseUp);
    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('wheel', onProjectDragWheel, { passive: false });
    refreshData(true);
});

onDeactivated(() => {
    window.removeEventListener('focus', handleWindowFocus);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('mouseup', onGlobalMouseUp);
    window.removeEventListener('mousemove', onGlobalMouseMove);
    window.removeEventListener('wheel', onProjectDragWheel);
});

onUnmounted(() => {
    window.removeEventListener('focus', handleWindowFocus);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('mouseup', onGlobalMouseUp);
    window.removeEventListener('mousemove', onGlobalMouseMove);
    window.removeEventListener('wheel', onProjectDragWheel);
});

// --- 框选核心逻辑 ---

const onMouseDown = (e) => {
    if (e.button !== 0) return; // 仅左键

    // 排除特定交互元素（名称区改用拖拽改归属，时间/大小区才触发框选）
    if (e.target.closest('.list-checkbox') || e.target.closest('.list-actions') || e.target.closest('.el-button') || e.target.closest('.project-header') || e.target.closest('.list-title')) {
        return;
    }

    isMouseDown = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;

    // 快照：记录当前已选中的文件ID
    initialSelectionSnap = new Set(selectedFiles.value.map(f => f.basename));

    selectionBox.value = { left: startX, top: startY, width: 0, height: 0 };
    
    // 不在此处 preventDefault，以便支持点击事件冒泡
};

const onGlobalMouseMove = (e) => {
    if (dragPending) {
        handleProjectDragMove(e);
        return;
    }
    if (!isMouseDown) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    // 移动阈值判定，防止点击时的微小抖动被误判为拖拽
    if (!hasMoved && (Math.abs(currentX - startX) > 5 || Math.abs(currentY - startY) > 5)) {
        hasMoved = true;
        isDragActive.value = true; 
        // 拖拽开始，清除浏览器默认的文本选择
        window.getSelection()?.removeAllRanges();
    }

    if (hasMoved) {
        e.preventDefault(); // 阻止后续默认行为
        
        // 计算选框几何
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        selectionBox.value = { left, top, width, height };

        // 实时更新选中状态 (XOR 逻辑)
        updateSelectionInvert();
    }
};

const updateSelectionInvert = () => {
    if (!chatListRef.value) return;

    const items = chatListRef.value.querySelectorAll('.chat-list-item');
    const boxRect = {
        left: selectionBox.value.left,
        top: selectionBox.value.top,
        right: selectionBox.value.left + selectionBox.value.width,
        bottom: selectionBox.value.top + selectionBox.value.height
    };

    const currentInBox = new Set();

    // 1. 找出当前所有在框内的文件（以 data-basename 标识，兼容分组渲染）
    items.forEach((item) => {
        const basename = item.dataset?.basename;
        if (!basename) return;
        const itemRect = item.getBoundingClientRect();

        // AABB 碰撞检测
        const isIntersecting = !(
            boxRect.left > itemRect.right ||
            boxRect.right < itemRect.left ||
            boxRect.top > itemRect.bottom ||
            boxRect.bottom < itemRect.top
        );

        if (isIntersecting) {
            currentInBox.add(basename);
        }
    });

    // 2. 应用反转逻辑 (XOR)，仅作用于当前可见文件
    // 最终状态 = 初始状态 XOR 框选状态
    selectedFiles.value = visibleFiles.value.filter(file => {
        const wasSelected = initialSelectionSnap.has(file.basename);
        const isInBox = currentInBox.has(file.basename);

        if (isInBox) {
            return !wasSelected; // 反转
        } else {
            return wasSelected;  // 保持
        }
    });
};

const onGlobalMouseUp = (e) => {
    if (dragPending) {
        finishProjectDrag();
        return;
    }
    if (isMouseDown) {
        // 如果没有发生拖拽，且没有按住 Ctrl/Shift，且点击的是空白处（不是列表项），则清空选择
        // 这是为了符合“点击空白处取消选择”的直觉
        if (!hasMoved && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            if (!e.target.closest('.chat-list-item')) {
                selectedFiles.value = [];
            }
        }
    }

    isMouseDown = false;
    
    if (isDragActive.value) {
        isDragActive.value = false;
        // 延时重置 hasMoved，防止触发 click 事件
        setTimeout(() => { hasMoved = false; }, 0);
    } else {
        hasMoved = false;
    }
    
    selectionBox.value = { top: 0, left: 0, width: 0, height: 0 };
};

// 列表项点击处理 (保持原有逻辑)
const handleItemClick = (file) => {
    // 如果刚刚发生了框选或项目拖拽，则忽略此次点击（避免抬起鼠标时触发 click 导致状态再次反转）
    if (hasMoved || justDraggedProject) return;

    toggleFileSelection(file, !isFileSelected(file));
};

const handleKeyDown = (e) => {
    const activeEl = document.activeElement;
    const tagName = activeEl.tagName;
    
    if (
        (tagName === 'INPUT' && !['checkbox', 'radio'].includes(activeEl.type)) || 
        tagName === 'TEXTAREA' || 
        activeEl.isContentEditable
    ) {
        return;
    }

    // Ctrl+A 全选
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        toggleSelectAll();
        return;
    }

    if (e.key === 'Delete' || (e.key === 'Backspace' && !e.altKey && !e.ctrlKey && !e.shiftKey)) {
        if (e.repeat) return;
        if (selectedFiles.value.length > 0) {
            e.preventDefault();
            deleteFiles(selectedFiles.value);
        }
    }
};


watch(sortMode, () => {
    currentPage.value = 1;
});

watch(activeView, () => {
    ensureValidSortModeForView();
}, { immediate: true });

watch(activeView, async (newView) => {
    if (newView === 'cloud' && !isCloudDataLoaded.value && isWebdavConfigValid.value) {
        await fetchCloudFiles();
        isCloudDataLoaded.value = true;
    } else if (newView === 'local' && localChatPath.value) {
        await fetchLocalFiles();
    }
    selectedFiles.value = []; 
});

// --- Main Functions ---
async function fetchLocalFiles(silent = false) {
    if (!localChatPath.value) return;
    if (!silent) isTableLoading.value = true;
    try {
        const files = await window.api.listJsonFiles(localChatPath.value);
        localChatFiles.value = files.map(file => normalizeSessionFile(file));
        await fetchLocalProjects();
    } catch (error) {
        ElMessage.error(`读取本地文件列表失败: ${error.message}`);
        localChatFiles.value = [];
    } finally {
        isTableLoading.value = false;
    }
}

async function fetchCloudFiles(silent = false) {
    if (!isWebdavConfigValid.value) return;
    if (!silent) isTableLoading.value = true;
    try {
        const { url, username, password, data_path } = webdavConfig.value;
        const client = createClient(url, { username, password });
        const remoteDir = data_path.endsWith('/') ? data_path.slice(0, -1) : data_path;
        if (!(await client.exists(remoteDir))) await client.createDirectory(remoteDir, { recursive: true });
        const response = await client.getDirectoryContents(remoteDir, { details: true });
        const directoryItems = Array.isArray(response) ? response : (Array.isArray(response?.data) ? response.data : []);
        const jsonFiles = directoryItems.filter(item => item.type === 'file' && item.basename && item.basename.endsWith('.json'));
        cloudChatFiles.value = jsonFiles.map(file => normalizeSessionFile(file));
        await fetchCloudProjects();
    } catch (error) {
        ElMessage.error(`${t('chats.alerts.fetchFailed')}: ${error.message}`);
        cloudChatFiles.value = [];
    } finally {
        isTableLoading.value = false;
    }
}

async function refreshData(silent = false) {
    if (activeView.value === 'local') {
        if (localChatPath.value) {
            await fetchLocalFiles(silent);
        }
    } else if (activeView.value === 'cloud') {
        if (isWebdavConfigValid.value) {
            await fetchCloudFiles(silent);
            isCloudDataLoaded.value = true;
        }
    }
}


// --- 项目分组：数据装载 / 持久化 ---
const normalizeProjectsResult = (result) => {
    const projects = Array.isArray(result?.projects) ? result.projects : [];
    return {
        version: Number(result?.version) || 1,
        projects: projects
            .filter((p) => p && typeof p === 'object')
            .map((p) => ({
                id: String(p.id || '').trim(),
                name: String(p.name || '').trim() || String(p.id || '').trim(),
                files: Array.isArray(p.files) ? p.files.map((f) => String(f || '').trim()).filter(Boolean) : []
            }))
            .filter((p) => p.id)
    };
};

const buildCloudProjectsRemotePath = () => {
    const dp = String(webdavConfig.value?.data_path || '');
    const dir = dp.endsWith('/') ? dp.slice(0, -1) : dp;
    return `${dir}/projects.yaml`;
};

async function readCloudProjectsViaWebdav() {
    const { url, username, password } = webdavConfig.value;
    const client = createClient(url, { username, password });
    const remotePath = buildCloudProjectsRemotePath();
    try {
        if (!(await client.exists(remotePath))) return { version: 1, projects: [] };
        const text = await client.getFileContents(remotePath, { format: 'text' });
        const parsed = await window.api.parseProjectsYaml(typeof text === 'string' ? text : String(text));
        return normalizeProjectsResult(parsed);
    } catch (error) {
        console.warn('[chats] 读取云端项目失败:', error);
        return { version: 1, projects: [] };
    }
}

async function writeCloudProjectsViaWebdav(data) {
    const { url, username, password } = webdavConfig.value;
    const client = createClient(url, { username, password });
    const remotePath = buildCloudProjectsRemotePath();
    const content = await window.api.serializeProjectsYaml(data);
    await client.putFileContents(remotePath, content, { overwrite: true });
}

async function fetchLocalProjects() {
    if (!localChatPath.value) {
        localProjects.value = { version: 1, projects: [] };
        return;
    }
    try {
        const result = await window.api.readLocalProjects(localChatPath.value);
        localProjects.value = normalizeProjectsResult(result);
    } catch (error) {
        console.warn('[chats] 读取本地项目失败:', error);
        localProjects.value = { version: 1, projects: [] };
    }
}

async function fetchCloudProjects() {
    if (!isWebdavConfigValid.value) {
        cloudProjects.value = { version: 1, projects: [] };
        return;
    }
    cloudProjects.value = await readCloudProjectsViaWebdav();
}

async function persistLocalProjects() {
    if (!localChatPath.value) return;
    await window.api.writeLocalProjects(localChatPath.value, localProjects.value);
}

async function persistCloudProjects() {
    if (!isWebdavConfigValid.value) return;
    await writeCloudProjectsViaWebdav(cloudProjects.value);
}

const toggleProjectCollapse = (projectId) => {
    const id = String(projectId || '');
    if (!id) return;
    const next = new Set(collapsedProjectIds.value);
    if (next.has(id)) {
        next.delete(id);
    } else {
        next.add(id);
    }
    collapsedProjectIds.value = next;
    persistCollapsedProjectIds(next);
};

// --- 项目 CRUD ---
const setActiveProjectsData = (data) => {
    if (activeView.value === 'local') {
        localProjects.value = data;
    } else {
        cloudProjects.value = data;
    }
};

async function persistActiveProjects() {
    if (activeView.value === 'local') {
        await persistLocalProjects();
    } else {
        await persistCloudProjects();
    }
}

function generateProjectId(name) {
    const base = String(name || '').trim().toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
    let id = base || `project-${Date.now().toString(36)}`;
    const existing = new Set((activeProjectsData.value.projects || []).map((p) => p.id));
    if (!existing.has(id)) return id;
    let suffix = 2;
    while (existing.has(`${id}-${suffix}`)) suffix += 1;
    return `${id}-${suffix}`;
}

async function createProject() {
    if (activeView.value === 'local' ? !localChatPath.value : !isWebdavConfigValid.value) return;
    try {
        const { value } = await ElMessageBox.prompt(t('chats.projects.createPrompt'), t('chats.projects.create'), {
            inputPattern: /\S/,
            inputErrorMessage: t('chats.projects.nameRequired')
        });
        const name = String(value || '').trim();
        if (!name) return;
        const projects = [...(activeProjectsData.value.projects || [])];
        if (projects.some((p) => p.name === name)) {
            ElMessage.warning(t('chats.projects.nameExists'));
            return;
        }
        projects.push({ id: generateProjectId(name), name, files: [] });
        setActiveProjectsData({ version: activeProjectsData.value.version || 1, projects });
        await persistActiveProjects();
        ElMessage.success(t('chats.projects.createSuccess'));
    } catch (error) {
        if (error !== 'cancel' && error !== 'close') ElMessage.error(String(error?.message || error));
    }
}

async function renameProject(projectId) {
    const project = (activeProjectsData.value.projects || []).find((p) => p.id === projectId);
    if (!project) return;
    try {
        const { value } = await ElMessageBox.prompt(t('chats.projects.renamePrompt'), t('chats.projects.rename'), {
            inputValue: project.name,
            inputPattern: /\S/,
            inputErrorMessage: t('chats.projects.nameRequired')
        });
        const name = String(value || '').trim();
        if (!name || name === project.name) return;
        if ((activeProjectsData.value.projects || []).some((p) => p.id !== projectId && p.name === name)) {
            ElMessage.warning(t('chats.projects.nameExists'));
            return;
        }
        const projects = (activeProjectsData.value.projects || []).map((p) =>
            p.id === projectId ? { ...p, name } : p
        );
        setActiveProjectsData({ version: activeProjectsData.value.version || 1, projects });
        await persistActiveProjects();
        ElMessage.success(t('chats.projects.renameSuccess'));
    } catch (error) {
        if (error !== 'cancel' && error !== 'close') ElMessage.error(String(error?.message || error));
    }
}

function deleteProject(projectId) {
    const project = (activeProjectsData.value.projects || []).find((p) => p.id === projectId);
    if (!project) return;
    projectDeleteDialog.value = { visible: true, id: project.id, name: project.name, busy: false };
}

// 仅删除项目：内部对话移回未分组，不删除对话文件
async function confirmDeleteProjectKeepChats() {
    const { id } = projectDeleteDialog.value;
    if (!id) return;
    projectDeleteDialog.value.busy = true;
    try {
        const projects = (activeProjectsData.value.projects || []).filter((p) => p.id !== id);
        setActiveProjectsData({ version: activeProjectsData.value.version || 1, projects });
        await persistActiveProjects();
        ElMessage.success(t('chats.projects.deleteSuccess'));
        projectDeleteDialog.value.visible = false;
    } catch (error) {
        ElMessage.error(String(error?.message || error));
    } finally {
        projectDeleteDialog.value.busy = false;
    }
}

// 删除项目及其内部对话历史（真实删除对话文件）
async function confirmDeleteProjectWithChats() {
    const { id } = projectDeleteDialog.value;
    if (!id) return;
    projectDeleteDialog.value.busy = true;
    try {
        const group = projectGroups.value.find((g) => g.id === id);
        const files = group ? group.files : [];
        const client = (activeView.value === 'cloud' && isWebdavConfigValid.value)
            ? createClient(webdavConfig.value.url, { username: webdavConfig.value.username, password: webdavConfig.value.password })
            : null;
        for (const file of files) {
            if (activeView.value === 'local') {
                const localPath = file?.path || `${localChatPath.value}/${file.basename}`;
                await window.api.deleteLocalFile(localPath);
            } else if (client) {
                await client.deleteFile(`${webdavConfig.value.data_path}/${file.basename}`);
            }
        }
        const projects = (activeProjectsData.value.projects || []).filter((p) => p.id !== id);
        setActiveProjectsData({ version: activeProjectsData.value.version || 1, projects });
        await persistActiveProjects();
        ElMessage.success(t('chats.projects.deleteWithChatsSuccess', { count: files.length }));
        projectDeleteDialog.value.visible = false;
        selectedFiles.value = [];
        await refreshData();
    } catch (error) {
        ElMessage.error(String(error?.message || error));
    } finally {
        projectDeleteDialog.value.busy = false;
    }
}

// --- 自定义指针拖拽改归属（不用原生 HTML5 DnD，以便拖拽时滚轮可用、命中更可靠）---
let dragPending = false;
let dragActivated = false;
let dragStartX = 0;
let dragStartY = 0;
let dragPendingBasenames = [];
let lastDragClientX = 0;
let lastDragClientY = 0;
let justDraggedProject = false;

let projectAutoScrollRAF = null;
let projectAutoScrollDir = 0;
const PROJECT_AUTOSCROLL_EDGE = 56;
const PROJECT_AUTOSCROLL_SPEED = 14;

const getChatScrollWrap = () => chatListRef.value?.closest('.el-scrollbar__wrap') || null;

const stopProjectAutoScroll = () => {
    if (projectAutoScrollRAF) {
        cancelAnimationFrame(projectAutoScrollRAF);
        projectAutoScrollRAF = null;
    }
    projectAutoScrollDir = 0;
};

const runProjectAutoScroll = () => {
    const wrap = getChatScrollWrap();
    if (!wrap || !projectAutoScrollDir || !isProjectDragging.value) {
        projectAutoScrollRAF = null;
        projectAutoScrollDir = 0;
        return;
    }
    wrap.scrollTop += projectAutoScrollDir * PROJECT_AUTOSCROLL_SPEED;
    updateDragTarget(lastDragClientX, lastDragClientY);
    projectAutoScrollRAF = requestAnimationFrame(runProjectAutoScroll);
};

const updateAutoScrollByY = (y) => {
    const wrap = getChatScrollWrap();
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    let dir = 0;
    if (y < rect.top + PROJECT_AUTOSCROLL_EDGE) dir = -1;
    else if (y > rect.bottom - PROJECT_AUTOSCROLL_EDGE) dir = 1;
    projectAutoScrollDir = dir;
    if (dir) {
        if (!projectAutoScrollRAF) projectAutoScrollRAF = requestAnimationFrame(runProjectAutoScroll);
    } else {
        stopProjectAutoScroll();
    }
};

// 命中检测：返回项目 id、PROJECT_UNGROUPED_DROP_ID 或 ''（无效目标）
const resolveDropTarget = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return '';
    const header = el.closest('.project-header');
    if (header) return header.dataset.projectId || '';
    const label = el.closest('.ungrouped-label');
    if (label) return PROJECT_UNGROUPED_DROP_ID;
    const row = el.closest('.chat-list-item');
    if (row) return row.dataset.projectId ? row.dataset.projectId : PROJECT_UNGROUPED_DROP_ID;
    if (el.closest('.chat-list')) return PROJECT_UNGROUPED_DROP_ID;
    return '';
};

const updateDragTarget = (x, y) => {
    dragOverProjectTarget.value = resolveDropTarget(x, y);
};

const onTitleMouseDown = (file, event) => {
    if (event.button !== 0) return;
    dragPendingBasenames = (isFileSelected(file) && selectedFiles.value.length > 0)
        ? selectedFiles.value.map((f) => f.basename)
        : [file.basename];
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    lastDragClientX = event.clientX;
    lastDragClientY = event.clientY;
    dragPending = true;
    dragActivated = false;
};

const handleProjectDragMove = (event) => {
    lastDragClientX = event.clientX;
    lastDragClientY = event.clientY;
    if (!dragActivated) {
        if (Math.abs(event.clientX - dragStartX) <= 5 && Math.abs(event.clientY - dragStartY) <= 5) {
            return;
        }
        dragActivated = true;
        isProjectDragging.value = true;
        draggedFileBasenames.value = dragPendingBasenames;
        dragGhostLabel.value = dragPendingBasenames.length > 1
            ? t('chats.projects.dragCount', { count: dragPendingBasenames.length })
            : formatFilenameDisplay(dragPendingBasenames[0]);
        window.getSelection()?.removeAllRanges();
    }
    dragGhostX.value = event.clientX + 14;
    dragGhostY.value = event.clientY + 14;
    updateDragTarget(event.clientX, event.clientY);
    updateAutoScrollByY(event.clientY);
};

const resetProjectDragState = () => {
    dragPending = false;
    dragActivated = false;
    dragPendingBasenames = [];
    isProjectDragging.value = false;
    draggedFileBasenames.value = [];
    dragOverProjectTarget.value = '';
    stopProjectAutoScroll();
};

async function finishProjectDrag() {
    const wasActivated = dragActivated;
    const basenames = [...draggedFileBasenames.value];
    const target = dragOverProjectTarget.value;
    resetProjectDragState();
    if (!wasActivated || !basenames.length) return;
    justDraggedProject = true;
    setTimeout(() => { justDraggedProject = false; }, 0);
    if (!target) return; // 拖到列表外，视为取消
    const projectId = target === PROJECT_UNGROUPED_DROP_ID ? '' : target;
    await assignFilesToProject(basenames, projectId);
}

const onProjectDragWheel = (event) => {
    if (!isProjectDragging.value) return;
    const wrap = getChatScrollWrap();
    if (!wrap) return;
    event.preventDefault();
    wrap.scrollTop += event.deltaY;
    updateDragTarget(lastDragClientX, lastDragClientY);
};

async function assignFilesToProject(basenames, projectId) {
    if (!Array.isArray(basenames) || basenames.length === 0) return;
    try {
        const draggedSet = new Set(basenames.map((n) => getJsonBasenameCandidate(n)));
        // 先从所有项目移除（兼容带/不带 .json），保证单一归属
        let projects = (activeProjectsData.value.projects || []).map((p) => ({
            ...p,
            files: (Array.isArray(p.files) ? p.files : []).filter((f) => !draggedSet.has(getJsonBasenameCandidate(f)))
        }));
        if (projectId) {
            if (!projects.some((p) => p.id === projectId)) return;
            projects = projects.map((p) =>
                p.id === projectId ? { ...p, files: [...p.files, ...basenames] } : p
            );
        }
        setActiveProjectsData({ version: activeProjectsData.value.version || 1, projects });
        await persistActiveProjects();
        selectedFiles.value = [];
        ElMessage.success(t('chats.projects.moveSuccess'));
    } catch (error) {
        ElMessage.error(`${t('chats.projects.moveFailed')}: ${error?.message || error}`);
    }
}

// --- 项目归属的云端同步 ---
const findProjectOfBasename = (projectsData, basename) => {
    for (const project of (projectsData?.projects || [])) {
        if ((project.files || []).some((f) => isSameProjectFile(f, basename))) {
            return { id: project.id, name: project.name };
        }
    }
    return null;
};

// 单文件同步后，把它的项目归属同步到对端 projects.yaml（读一端归属→改对端→写对端）
const syncFileAssignmentAcross = async (basename, direction) => {
    try {
        if (direction === 'upload') {
            const proj = findProjectOfBasename(localProjects.value, basename);
            const cloudData = await readCloudProjectsViaWebdav();
            const merged = await window.api.mergeFileAssignment(cloudData, { basename, projectId: proj?.id || '', projectName: proj?.name || '' });
            await writeCloudProjectsViaWebdav(merged);
            cloudProjects.value = normalizeProjectsResult(merged);
        } else {
            const proj = findProjectOfBasename(cloudProjects.value, basename);
            const localData = normalizeProjectsResult(await window.api.readLocalProjects(localChatPath.value));
            const merged = await window.api.mergeFileAssignment(localData, { basename, projectId: proj?.id || '', projectName: proj?.name || '' });
            await window.api.writeLocalProjects(localChatPath.value, merged);
            localProjects.value = normalizeProjectsResult(merged);
        }
    } catch (error) {
        console.warn('[projects] 同步单文件项目归属失败:', error);
    }
};

const syncProject = (projectId) =>
    activeView.value === 'local' ? syncProjectToCloud(projectId) : syncProjectToLocal(projectId);

async function syncProjectToCloud(projectId) {
    if (!isWebdavConfigValid.value) return ElMessage.warning(t('chats.alerts.webdavRequired'));
    const group = projectGroups.value.find((g) => g.id === projectId);
    if (!group) return;
    const basenames = group.files.map((f) => f.basename);
    try {
        if (basenames.length > 0) {
            const tasks = basenames.map((bn) => ({
                name: bn,
                action: (signal) => forceSyncFile(bn, 'upload', signal, { syncProject: false })
            }));
            await executeSync(tasks, t('chats.alerts.syncConfirmUploadTitle'));
        }
        const cloudData = await readCloudProjectsViaWebdav();
        const merged = await window.api.mergeProjectAssignment(cloudData, { id: group.id, name: group.name, files: basenames });
        await writeCloudProjectsViaWebdav(merged);
        cloudProjects.value = normalizeProjectsResult(merged);
        ElMessage.success(t('chats.projects.syncProjectSuccess'));
        await refreshData();
    } catch (error) {
        if (error?.message !== 'Cancelled') ElMessage.error(String(error?.message || error));
    }
}

async function syncProjectToLocal(projectId) {
    if (!localChatPath.value) return ElMessage.warning(t('chats.alerts.localPathRequired'));
    const group = projectGroups.value.find((g) => g.id === projectId);
    if (!group) return;
    const basenames = group.files.map((f) => f.basename);
    try {
        if (basenames.length > 0) {
            const tasks = basenames.map((bn) => ({
                name: bn,
                action: (signal) => forceSyncFile(bn, 'download', signal, { syncProject: false })
            }));
            await executeSync(tasks, t('chats.alerts.syncConfirmDownloadTitle'));
        }
        const localData = normalizeProjectsResult(await window.api.readLocalProjects(localChatPath.value));
        const merged = await window.api.mergeProjectAssignment(localData, { id: group.id, name: group.name, files: basenames });
        await window.api.writeLocalProjects(localChatPath.value, merged);
        localProjects.value = normalizeProjectsResult(merged);
        ElMessage.success(t('chats.projects.syncProjectSuccess'));
        await refreshData();
    } catch (error) {
        if (error?.message !== 'Cancelled') ElMessage.error(String(error?.message || error));
    }
}

// 批量同步结束后，一次性把多文件的项目归属合并进对端 yaml（读一次、改、写一次，避免并发竞争）
async function syncProjectsBulk(basenames, direction) {
    if (!Array.isArray(basenames) || basenames.length === 0) return;
    try {
        if (direction === 'upload') {
            let cloudData = await readCloudProjectsViaWebdav();
            for (const bn of basenames) {
                const proj = findProjectOfBasename(localProjects.value, bn);
                cloudData = await window.api.mergeFileAssignment(cloudData, { basename: bn, projectId: proj?.id || '', projectName: proj?.name || '' });
            }
            await writeCloudProjectsViaWebdav(cloudData);
            cloudProjects.value = normalizeProjectsResult(cloudData);
        } else {
            let localData = normalizeProjectsResult(await window.api.readLocalProjects(localChatPath.value));
            for (const bn of basenames) {
                const proj = findProjectOfBasename(cloudProjects.value, bn);
                localData = await window.api.mergeFileAssignment(localData, { basename: bn, projectId: proj?.id || '', projectName: proj?.name || '' });
            }
            await window.api.writeLocalProjects(localChatPath.value, localData);
            localProjects.value = normalizeProjectsResult(localData);
        }
        await refreshData();
    } catch (error) {
        console.warn('[projects] 批量同步项目归属失败:', error);
    }
}


const handleItemContextMenu = async (file, event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (hasMoved) return;

    await startChat(file);
};

async function startChat(file) {
    ElMessage.info(t('chats.alerts.loadingChat'));
    try {
        let jsonString;
        if (activeView.value === 'local') {
            jsonString = await window.api.readLocalFile(file.path);
        } else {
            const { url, username, password, data_path } = webdavConfig.value;
            const client = createClient(url, { username, password });
            jsonString = await client.getFileContents(`${data_path.endsWith('/') ? data_path.slice(0, -1) : data_path}/${file.basename}`, { format: "text" });
        }
        await window.api.coderedirect('恢复聊天', JSON.stringify({ sessionData: jsonString, filename: file.basename }));
        ElMessage.success(t('chats.alerts.restoreInitiated'));
    } catch (error) { 
        ElMessage.error(`${t('chats.alerts.restoreFailed')}: ${error.message}`); 
    }
}


async function renameRemoteSessionFileWithMetadata(client, remoteDir, oldFilename, newFilename) {
    const normalizedRemoteDir = String(remoteDir || '').endsWith('/') ? String(remoteDir).slice(0, -1) : String(remoteDir || '');
    const oldRemotePath = `${normalizedRemoteDir}/${oldFilename}`;
    const newRemotePath = `${normalizedRemoteDir}/${newFilename}`;
    const nextTitle = newFilename.toLowerCase().endsWith('.json') ? newFilename.slice(0, -5) : newFilename;

    await client.moveFile(oldRemotePath, newRemotePath);

    try {
        const content = await client.getFileContents(newRemotePath, { format: 'text' });
        const sessionData = JSON.parse(typeof content === 'string' ? content : String(content));
        if (sessionData && sessionData.anywhere_history === true && typeof sessionData === 'object') {
            const sessionMetadata =
                sessionData.sessionMetadata && typeof sessionData.sessionMetadata === 'object'
                    ? sessionData.sessionMetadata
                    : {};

            if ((sessionMetadata.title || '').trim() !== nextTitle) {
                sessionData.sessionMetadata = {
                    ...sessionMetadata,
                    title: nextTitle
                };
                await client.putFileContents(newRemotePath, JSON.stringify(sessionData, null, 2), { overwrite: true });
            }
        }
    } catch {
        // ignore remote metadata sync failure to preserve rename compatibility
    }
}
async function exportLocalChat(file) {
    if (activeView.value !== 'local') return;
    if (!file?.path) {
        ElMessage.warning(t('chats.alerts.localFileMissing'));
        return;
    }

    try {
        const result = await window.api.exportLocalChatFile(file.path, {
            title: t('chats.export.dialogTitle'),
            defaultPath: file.basename,
            filters: [{ name: 'JSON Files', extensions: ['json'] }]
        });

        if (result?.cancelled) {
            ElMessage.info(t('chats.export.cancelled'));
            return;
        }

        if (result?.path) {
            window.api.shellShowItemInFolder(result.path);
        }

        ElMessage.success(t('chats.export.success'));
    } catch (error) {
        ElMessage.error(`${t('chats.export.failed')}: ${error.message}`);
    }
}



async function renameFile(file) {
    const defaultInputValue = file.title || (file.basename.endsWith('.json') ? file.basename.slice(0, -5) : file.basename);
    try {
        const { value: userInput } = await ElMessageBox.prompt(t('chats.rename.promptMessage'), t('chats.rename.promptTitle'), { inputValue: defaultInputValue });
        let finalFilename = (userInput || "").trim();
        if (!finalFilename.toLowerCase().endsWith('.json')) finalFilename += '.json';
        if (finalFilename === file.basename || finalFilename === '.json') return;

        if (activeView.value === 'local') {
            await window.api.renameLocalFile(file.path, `${localChatPath.value}/${finalFilename}`);
            if (isWebdavConfigValid.value && cloudChatFiles.value.some(f => f.basename === file.basename)) {
                const confirm = await ElMessageBox.confirm(
                    t('chats.rename.syncCloudConfirm'),
                    t('chats.rename.syncTitle'),
                    { type: 'info' }
                ).catch(() => false);
                if (confirm) {
                    const client = createClient(webdavConfig.value.url, { username: webdavConfig.value.username, password: webdavConfig.value.password });
                    await renameRemoteSessionFileWithMetadata(client, webdavConfig.value.data_path, file.basename, finalFilename);
                }
            }
        } else { // cloud
            const client = createClient(webdavConfig.value.url, { username: webdavConfig.value.username, password: webdavConfig.value.password });
            await renameRemoteSessionFileWithMetadata(client, webdavConfig.value.data_path, file.basename, finalFilename);
            if (localChatFiles.value.some(f => f.basename === file.basename)) {
                const confirm = await ElMessageBox.confirm(
                    t('chats.rename.syncLocalConfirm'),
                    t('chats.rename.syncTitle'),
                    { type: 'info' }
                ).catch(() => false);
                if (confirm) await window.api.renameLocalFile(`${localChatPath.value}/${file.basename}`, `${localChatPath.value}/${finalFilename}`);
            }
        }
        ElMessage.success(t('chats.alerts.renameSuccess'));
        await refreshData();
    } catch (error) {
        if (error !== 'cancel' && error !== 'close') ElMessage.error(`${t('chats.alerts.renameFailed')}: ${error.message}`);
    }
}
async function deleteFiles(filesToDelete) {
    if (isDeletingFiles.value) return; // 拦截正在进行中的删除操作

    if (filesToDelete.length === 0) {
        ElMessage.warning(t('common.noFileSelected'));
        return;
    }

    isDeletingFiles.value = true; // 上锁
    try {
        await ElMessageBox.confirm(t('common.confirmDeleteMultiple', { count: filesToDelete.length }), t('common.warningTitle'), { type: 'warning' });

        let syncDeletions = false;

        if (isWebdavConfigValid.value && localChatPath.value) {
            const localMap = new Map(localChatFiles.value.map(f => [f.basename, f]));
            const cloudMap = new Map(cloudChatFiles.value.map(f => [f.basename, f]));

            const counterpartFiles = filesToDelete.filter(file => {
                return activeView.value === 'local' ? cloudMap.has(file.basename) : localMap.has(file.basename);
            });

            if (counterpartFiles.length > 0) {
                const location = activeView.value === 'local' ? t('chats.view.cloud') : t('chats.view.local');
                try {
                    await ElMessageBox.confirm(
                        t('chats.alerts.confirmSyncDeleteMessage', { count: counterpartFiles.length, location: location }),
                        t('chats.alerts.confirmSyncDeleteTitle'),
                        { type: 'info' }
                    );
                    syncDeletions = true;
                } catch (e) {
                    syncDeletions = false;
                }
            }
        }

        isTableLoading.value = true;
        const client = isWebdavConfigValid.value ? createClient(webdavConfig.value.url, { username: webdavConfig.value.username, password: webdavConfig.value.password }) : null;

        for (const file of filesToDelete) {
            if (activeView.value === 'local') {
                await window.api.deleteLocalFile(file.path);
                if (syncDeletions && client && cloudChatFiles.value.some(f => f.basename === file.basename)) {
                    await client.deleteFile(`${webdavConfig.value.data_path}/${file.basename}`);
                }
            } else { // cloud view
                if (client) {
                    await client.deleteFile(`${webdavConfig.value.data_path}/${file.basename}`);
                    if (syncDeletions && localChatFiles.value.some(f => f.basename === file.basename)) {
                        await window.api.deleteLocalFile(`${localChatPath.value}/${file.basename}`);
                    }
                }
            }
        }

        ElMessage.success(t('common.deleteSuccessMultiple'));
        await refreshData();
        selectedFiles.value = [];

    } catch (error) {
        if (error !== 'cancel' && error !== 'close') {
            ElMessage.error(`${t('common.deleteFailedMultiple')}: ${error.message}`);
        }
    } finally {
        isTableLoading.value = false;
        isDeletingFiles.value = false; // 释放锁
    }
}
const handleSelectionChange = (val) => selectedFiles.value = val;

const cancelSync = () => {
    if (syncAbortController.value) {
        syncAbortController.value.abort();
    }
};

async function runConcurrentTasks(tasks, signal, concurrencyLimit = 3) {
    const results = { completed: 0, failed: 0, failedFiles: [] };
    const queue = [...tasks];

    const worker = async () => {
        while (queue.length > 0) {
            if (signal.aborted) throw new Error("Cancelled");
            const task = queue.shift();
            try {
                await task.action(signal);
                results.completed++;
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw new Error("Cancelled");
                }
                results.failed++;
                results.failedFiles.push(task.name);
                console.error(`Task failed for ${task.name}:`, error);
            } finally {
                if (!signal.aborted) {
                    syncProgress.value = Math.round(((results.completed + results.failed) / tasks.length) * 100);
                    syncStatusText.value = t('chats.alerts.syncProcessing', { completed: results.completed + results.failed, total: tasks.length });
                }
            }
        }
    };

    const workers = Array(concurrencyLimit).fill(null).map(worker);
    await Promise.all(workers);
    return results;
}

async function intelligentUpload() {
    if (!isWebdavConfigValid.value) return ElMessage.warning(t('chats.alerts.webdavRequired'));
    const filesToUpload = localChatFiles.value.filter(local => shouldUploadFile(local, getFileMap(cloudChatFiles.value).get(local.basename)));
    if (filesToUpload.length === 0) return ElMessage.info(t('chats.alerts.syncNoUpload'));

    try {
        await ElMessageBox.confirm(
            t('chats.tooltips.uploadChanges', { count: filesToUpload.length }) + ' ' + t('chats.alerts.continueConfirm'),
            t('chats.alerts.syncConfirmUploadTitle'),
            { type: 'info' }
        );
        const tasks = filesToUpload.map(file => ({ name: file.basename, action: (signal) => forceSyncFile(file.basename, 'upload', signal, { syncProject: false }) }));
        await executeSync(tasks, t('chats.alerts.syncConfirmUploadTitle'));
        // 批量结束后统一把这些文件的项目归属合并进云端 yaml（避免并发读写竞争）
        await syncProjectsBulk(filesToUpload.map(f => f.basename), 'upload');
    } catch (error) {
        if (error === 'cancel' || error === 'close') return;
        ElMessage.error(`${error.message}`);
    }
}

async function intelligentDownload() {
    if (!localChatPath.value) return ElMessage.warning(t('chats.alerts.localPathRequired'));
    const filesToDownload = cloudChatFiles.value.filter(cloud => shouldDownloadFile(cloud, getFileMap(localChatFiles.value).get(cloud.basename)));
    if (filesToDownload.length === 0) return ElMessage.info(t('chats.alerts.syncNoDownload'));

    try {
        await ElMessageBox.confirm(
            t('chats.tooltips.downloadChanges', { count: filesToDownload.length }) + ' ' + t('chats.alerts.continueConfirm'),
            t('chats.alerts.syncConfirmDownloadTitle'),
            { type: 'info' }
        );
        const tasks = filesToDownload.map(file => ({ name: file.basename, action: (signal) => forceSyncFile(file.basename, 'download', signal, { syncProject: false }) }));
        await executeSync(tasks, t('chats.alerts.syncConfirmDownloadTitle'));
        await syncProjectsBulk(filesToDownload.map(f => f.basename), 'download');
    } catch (error) {
        if (error === 'cancel' || error === 'close') return;
        ElMessage.error(`${error.message}`);
    }
}

async function executeSync(tasks, title) {
    isSyncing.value = true;
    syncProgress.value = 0;
    syncAbortController.value = new AbortController();
    syncStatusText.value = title === t('chats.alerts.syncConfirmUploadTitle') ? t('chats.alerts.syncPreparingUpload') : t('chats.alerts.syncPreparingDownload');

    try {
        const results = await runConcurrentTasks(tasks, syncAbortController.value.signal);
        let message = title === t('chats.alerts.syncConfirmUploadTitle') ? t('chats.alerts.syncSuccessUpload', { count: results.completed }) : t('chats.alerts.syncSuccessDownload', { count: results.completed });
        if (results.failed > 0) message += ` ${t('chats.alerts.syncFailedPartially', { failedCount: results.failed })}`;
        ElMessage.success(message);
        await refreshData();
    } catch (error) {
        if (error.message === 'Cancelled') {
            ElMessage.warning(t('chats.alerts.syncCancelled'));
        } else {
            ElMessage.error(t('chats.alerts.syncFailed', { message: error.message }));
        }
    } finally {
        isSyncing.value = false;
        syncAbortController.value = null;
    }
}

async function forceSyncFile(basename, direction, signal, options = {}) {
    const { syncProject = true } = options;
    singleFileSyncing.value[basename] = true;
    try {
        const client = createClient(webdavConfig.value.url, { username: webdavConfig.value.username, password: webdavConfig.value.password });
        const remotePath = `${webdavConfig.value.data_path}/${basename}`;
        const localPath = `${localChatPath.value}/${basename}`;

        if (direction === 'upload') {
            const localFile = localChatFiles.value.find(f => f.basename === basename);
            if (!localFile) throw new Error(`本地文件 "${basename}" 未找到`);

            const content = await window.api.readLocalFile(localPath, signal);
            await client.putFileContents(remotePath, content, { overwrite: true, signal });

        } else { // download
            const cloudFile = cloudChatFiles.value.find(f => f.basename === basename);
            if (!cloudFile) throw new Error(`云端文件 "${basename}" 未找到`);

            const content = await client.getFileContents(remotePath, { format: 'text', signal });
            await window.api.writeLocalFile(localPath, content, signal);

            await window.api.setFileMtime(localPath, cloudFile.updatedAt || cloudFile.lastmod);
        }

        // 单文件同步时连带把该文件的项目归属同步到对端 projects.yaml（批量同步走末尾统一合并）
        if (syncProject) {
            await syncFileAssignmentAcross(basename, direction);
        }
    } catch (error) {
        if (error.name === 'AbortError') throw new Error("Cancelled");
        ElMessage.error(`同步文件 "${basename}" 失败: ${error.message}`);
        throw error;
    } finally {
        singleFileSyncing.value[basename] = false;
    }
}

const computedFilesToClean = computed(() => {
    const days = cleanDaysOption.value === -1 ? cleanCustomDays.value : cleanDaysOption.value;
    if (!days || days < 1) return [];

    // 计算截止时间戳
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return currentFiles.value.filter(file => {
        const fileDate = new Date(file.updatedAt || file.lastmod || file.createdAt);
        return fileDate < cutoffDate;
    });
});

const totalCleanSize = computed(() => {
    return computedFilesToClean.value.reduce((acc, file) => acc + (file.size || 0), 0);
});

function openCleanDialog() {
    showCleanDialog.value = true;
}

async function executeAutoClean() {
    const filesToDelete = computedFilesToClean.value;
    if (filesToDelete.length === 0) return;

    isCleaning.value = true;
    try {
        const client = isWebdavConfigValid.value ? createClient(webdavConfig.value.url, { username: webdavConfig.value.username, password: webdavConfig.value.password }) : null;

        const tasks = filesToDelete.map(file => async () => {
            if (activeView.value === 'local') {
                await window.api.deleteLocalFile(file.path);
            } else {
                if (client) {
                    await client.deleteFile(`${webdavConfig.value.data_path}/${file.basename}`);
                }
            }
        });

        const batchSize = 5;
        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            await Promise.all(batch.map(t => t()));
        }

        ElMessage.success(t('chats.clean.success', { count: filesToDelete.length }));
        await refreshData();
        showCleanDialog.value = false;
        selectedFiles.value = [];

    } catch (error) {
        ElMessage.error(`清理失败: ${error.message}`);
    } finally {
        isCleaning.value = false;
    }
}

const isFileSelected = (file) => {
    return selectedFiles.value.some(f => f.basename === file.basename);
};

const toggleFileSelection = (file, isChecked) => {
    if (isChecked) {
        if (!isFileSelected(file)) {
            selectedFiles.value.push(file);
        }
    } else {
        selectedFiles.value = selectedFiles.value.filter(f => f.basename !== file.basename);
    }
};

const formatFilenameDisplay = (basename) => {
    return basename.endsWith('.json') ? basename.slice(0, -5) : basename;
};

const isAllSelected = computed(() => {
    if (visibleFiles.value.length === 0) return false;
    return visibleFiles.value.every(f => isFileSelected(f));
});

const toggleSelectAll = () => {
    if (isAllSelected.value) {
        const visibleNames = new Set(visibleFiles.value.map(f => f.basename));
        selectedFiles.value = selectedFiles.value.filter(f => !visibleNames.has(f.basename));
    } else {
        visibleFiles.value.forEach(f => {
            if (!isFileSelected(f)) selectedFiles.value.push(f);
        });
    }
};

</script>

<template>
    <div class="chats-page-container">
        <div class="chats-content-wrapper">
            <div class="info-button-container">
                <el-popover placement="bottom-start" :title="t('chats.info.title')" :width="450" trigger="click">
                    <template #reference>
                        <el-button :icon="QuestionFilled" circle />
                    </template>
                    <div class="info-popover-content">
                        <p v-html="t('chats.info.localDesc', { path: localChatPath || t('chats.info.pathNotSet') })">
                        </p>
                        <p v-html="t('chats.info.cloudDesc')"></p>
                    </div>
                </el-popover>
                <el-tooltip :content="t('chats.clean.button')" placement="bottom">
                    <el-button :icon="Brush" circle @click="openCleanDialog" />
                </el-tooltip>
                <el-tooltip :content="t('chats.projects.create')" placement="bottom">
                    <el-button :icon="Plus" circle @click="createProject"
                        :disabled="activeView === 'local' ? !localChatPath : !isWebdavConfigValid" />
                </el-tooltip>
            </div>
            <div class="sync-buttons-container">
                <el-tooltip :content="t('chats.tooltips.uploadChanges', { count: uploadableCount })" placement="bottom">
                    <el-badge :value="uploadableCount" :hidden="uploadableCount === 0" type="primary">
                        <el-button :icon="Upload" @click="intelligentUpload" circle
                            :disabled="!isWebdavConfigValid || !localChatPath" />
                    </el-badge>
                </el-tooltip>
                <el-tooltip :content="t('chats.tooltips.downloadChanges', { count: downloadableCount })"
                    placement="bottom">
                    <el-badge :value="downloadableCount" :hidden="downloadableCount === 0" type="success">
                        <el-button :icon="Download" @click="intelligentDownload" circle
                            :disabled="!isWebdavConfigValid || !localChatPath" />
                    </el-badge>
                </el-tooltip>
            </div>
            <div class="view-selector">
                <el-radio-group v-model="activeView" @change="currentPage = 1">
                    <el-radio-button value="local">{{ t('chats.view.local') }}</el-radio-button>
                    <el-radio-button value="cloud" :disabled="!isWebdavConfigValid">{{ t('chats.view.cloud')
                        }}</el-radio-button>
                </el-radio-group>
            </div>

            <div class="table-container">
                <!-- 拖拽选框 -->
                <div v-show="isDragActive" class="selection-box" :style="{
                    top: selectionBox.top + 'px',
                    left: selectionBox.left + 'px',
                    width: selectionBox.width + 'px',
                    height: selectionBox.height + 'px'
                }"></div>

                <!-- 空状态：本地未配置 -->
                <div v-if="activeView === 'local' && !localChatPath" class="config-prompt-small">
                    <el-empty :description="t('chats.configRequired.localPathDescription')">
                        <template #image>
                            <el-icon :size="50" color="#909399">
                                <Edit />
                            </el-icon>
                        </template>
                    </el-empty>
                </div>

                <!-- 空状态：云端未配置 -->
                <div v-else-if="activeView === 'cloud' && !isWebdavConfigValid" class="config-prompt-small">
                    <el-empty :description="t('chats.configRequired.webdavDescription')">
                        <template #image>
                            <el-icon :size="50" color="#909399">
                                <Edit />
                            </el-icon>
                        </template>
                    </el-empty>
                </div>

                <!-- 空状态：无文件 -->
                <div v-else-if="displayRows.length === 0 && !isTableLoading" class="config-prompt-small">
                    <el-empty :description="t('common.noFileSelected').replace('选中', '')" :image-size="80" />
                </div>

                <!-- 列表视图 -->
                <div v-else class="chat-table-shell" v-loading="isTableLoading" :style="{ '--chat-table-columns': chatTableColumns }">
                    <div class="chat-table-header">
                        <div class="chat-column chat-column-checkbox"></div>
                        <button type="button" class="chat-column chat-column-title sortable" :class="{ active: sortMode === 'name' }"
                            :title="getColumnSortLabel('name')" @click="toggleSort('name')">
                            <span>{{ t('chats.table.filename') }}</span>
                            <span v-if="sortMode === 'name'" class="sort-indicator">{{ getSortDirectionLabel() }}</span>
                        </button>
                        <button v-if="showCreatedAtColumn" type="button" class="chat-column chat-column-created sortable"
                            :class="{ active: sortMode === 'createdAt' }" :title="getColumnSortLabel('createdAt')" @click="toggleSort('createdAt')">
                            <span>{{ t('chats.table.createdTime') }}</span>
                            <span v-if="sortMode === 'createdAt'" class="sort-indicator">{{ getSortDirectionLabel() }}</span>
                        </button>
                        <button type="button" class="chat-column chat-column-updated sortable" :class="{ active: sortMode === 'updatedAt' }"
                            :title="getColumnSortLabel('updatedAt')" @click="toggleSort('updatedAt')">
                            <span>{{ t('chats.table.modifiedTime') }}</span>
                            <span v-if="sortMode === 'updatedAt'" class="sort-indicator">{{ getSortDirectionLabel() }}</span>
                        </button>
                        <button type="button" class="chat-column chat-column-size sortable" :class="{ active: sortMode === 'size' }"
                            :title="getColumnSortLabel('size')" @click="toggleSort('size')">
                            <span>{{ t('chats.table.size') }}</span>
                            <span v-if="sortMode === 'size'" class="sort-indicator">{{ getSortDirectionLabel() }}</span>
                        </button>
                        <div class="chat-column chat-column-actions">{{ t('chats.table.actions') }}</div>
                    </div>
                    <el-scrollbar view-class="chat-list-view">
                    <!-- 绑定 mousedown 启动框选；项目拖拽改用自定义指针拖拽（见 onTitleMouseDown） -->
                    <div class="chat-list" ref="chatListRef" @mousedown="onMouseDown">
                        <template v-for="row in displayRows" :key="row.kind === 'file' ? `file-${row.file.basename}` : (row.kind === 'project' ? `proj-${row.id}` : 'ungrouped-label')">

                            <!-- 项目头行 -->
                            <div v-if="row.kind === 'project'" class="project-header"
                                :class="{ 'drag-over': dragOverProjectTarget === row.id }"
                                :data-project-id="row.id"
                                @click="toggleProjectCollapse(row.id)">
                                <el-icon class="project-caret" :class="{ expanded: !row.collapsed }"><ArrowRight /></el-icon>
                                <el-icon class="project-folder"><Folder /></el-icon>
                                <span class="project-name" :title="row.name">{{ row.name }}</span>
                                <span class="project-count">{{ row.count }}</span>
                                <div class="project-actions" @click.stop>
                                    <el-tooltip v-if="isWebdavConfigValid"
                                        :content="activeView === 'local' ? t('chats.projects.syncToCloud') : t('chats.projects.syncToLocal')"
                                        placement="top" :show-after="500">
                                        <el-button link type="primary" :icon="Switch" class="action-icon-btn"
                                            @click.stop="syncProject(row.id)" />
                                    </el-tooltip>
                                    <el-tooltip :content="t('chats.projects.rename')" placement="top" :show-after="500">
                                        <el-button link type="warning" :icon="Edit" class="action-icon-btn"
                                            @click.stop="renameProject(row.id)" />
                                    </el-tooltip>
                                    <el-tooltip :content="t('chats.projects.delete')" placement="top" :show-after="500">
                                        <el-button link type="danger" :icon="DeleteIcon" class="action-icon-btn"
                                            @click.stop="deleteProject(row.id)" />
                                    </el-tooltip>
                                </div>
                            </div>

                            <!-- 未分组分隔标签（同时作为"移出项目"放置目标） -->
                            <div v-else-if="row.kind === 'ungrouped-label'" class="ungrouped-label"
                                :class="{ 'drag-over': dragOverProjectTarget === PROJECT_UNGROUPED_DROP_ID }">
                                {{ t('chats.projects.ungrouped') }}
                            </div>

                            <!-- 文件行 -->
                            <div v-else class="chat-list-item"
                                :class="{ 'is-selected': isFileSelected(row.file), 'in-project': row.projectId }"
                                :data-basename="row.file.basename"
                                :data-project-id="row.projectId || ''"
                                @click="handleItemClick(row.file)"
                                @contextmenu.prevent.stop="handleItemContextMenu(row.file, $event)">

                                <!-- 左侧：选择框 -->
                                <div class="list-checkbox">
                                    <el-checkbox :model-value="isFileSelected(row.file)"
                                        @change="(val) => toggleFileSelection(row.file, val)" @click.stop />
                                </div>

                                <div class="list-title" :title="normalizeTitleValue(row.file)"
                                    @mousedown="onTitleMouseDown(row.file, $event)">
                                    {{ normalizeTitleValue(row.file) }}
                                </div>
                                <div v-if="showCreatedAtColumn" class="meta-created">{{ formatDate(row.file.createdAt || row.file.lastmod) }}</div>
                                <div class="meta-updated">{{ formatDate(row.file.updatedAt || row.file.lastmod || row.file.createdAt) }}</div>
                                <div class="meta-size">{{ formatBytes(row.file.size) }}</div>

                                <!-- 右侧：仅操作按钮 -->
                                <div class="list-actions">
                                    <!-- 1. 聊天按钮 -->
                                    <el-tooltip :content="t('chats.actions.chat')" placement="top" :show-after="500">
                                        <el-button link type="primary" :icon="ChatDotRound"
                                            class="action-icon-btn chat-highlight" @click.stop="startChat(row.file)" />
                                    </el-tooltip>
                                    <!-- 2. 分享/导出按钮（仅本地） -->
                                    <el-tooltip v-if="activeView === 'local'" :content="t('chats.actions.share')" placement="top" :show-after="500">
                                        <el-button link type="success" :icon="Share" class="action-icon-btn"
                                            @click.stop="exportLocalChat(row.file)" />
                                    </el-tooltip>

                                    <!-- 3. 同步按钮 -->
                                    <el-tooltip
                                        :content="activeView === 'local' ? t('chats.tooltips.forceUpload') : t('chats.tooltips.forceDownload')"
                                        placement="top" :show-after="500">
                                        <el-button link type="primary" :icon="Switch" class="action-icon-btn"
                                            @click.stop="forceSyncFile(row.file.basename, activeView === 'local' ? 'upload' : 'download')"
                                            :loading="singleFileSyncing[row.file.basename]" />
                                    </el-tooltip>

                                    <!-- 4. 重命名按钮 -->
                                    <el-tooltip :content="t('chats.actions.rename')" placement="top" :show-after="500">
                                        <el-button link type="warning" :icon="Edit" class="action-icon-btn"
                                            @click.stop="renameFile(row.file)" />
                                    </el-tooltip>

                                    <!-- 5. 删除按钮 -->
                                    <el-tooltip :content="t('chats.actions.delete')" placement="top" :show-after="500">
                                        <el-button link type="danger" :icon="DeleteIcon" class="action-icon-btn"
                                            @click.stop="deleteFiles([row.file])" />
                                    </el-tooltip>
                                </div>
                            </div>
                        </template>
                    </div>
                </el-scrollbar>
                </div>
            </div>

            <div class="footer-bar">
                <div class="footer-left">
                    <el-checkbox :model-value="isAllSelected" @change="toggleSelectAll" :label="t('common.selectAll')" size="large"
                        :disabled="visibleFiles.length === 0" />
                    <span v-if="selectedFiles.length > 0" class="selection-count">{{ t('chats.selection.count', { count: selectedFiles.length }) }}</span>
                </div>
                <div class="footer-center">
                    <el-pagination v-if="ungroupedFiles.length > 0" v-model:current-page="currentPage"
                        v-model:page-size="pageSize" :page-sizes="[10, 20, 50, 100]" :total="ungroupedFiles.length"
                        :pager-count="5" layout="total, sizes, prev, pager, next, jumper" background size="small" />
                </div>
                <div class="footer-right">
                    <el-tooltip :content="t('common.refresh')" placement="top">
                        <el-button :icon="Refresh" circle @click="refreshData" />
                    </el-tooltip>
                    <el-tooltip :content="t('common.deleteSelected')" placement="top">
                        <el-button type="danger" :icon="DeleteIcon" circle @click="deleteFiles(selectedFiles)"
                            :disabled="selectedFiles.length === 0" />
                    </el-tooltip>
                </div>
            </div>
        </div>
    </div>
    <el-dialog v-model="isSyncing" :title="t('chats.alerts.syncInProgress')" :close-on-click-modal="false"
        :show-close="false" :close-on-press-escape="false" width="400px" center>
        <div class="sync-progress-container">
            <el-progress :percentage="syncProgress" :stroke-width="10" striped striped-flow />
            <p class="sync-status-text">{{ syncStatusText }}</p>
        </div>
        <template #footer>
            <el-button @click="cancelSync">{{ t('common.cancel') }}</el-button>
        </template>
    </el-dialog>

    <el-dialog v-model="showCleanDialog" :title="t('chats.clean.title')" width="500px" append-to-body>
        <div class="clean-dialog-body">
            <div class="clean-options">
                <span class="label">{{ t('chats.clean.timeRangeLabel') }}:</span>
                <el-select v-model="cleanDaysOption" style="width: 140px; margin-right: 10px;">
                    <el-option :label="t('chats.clean.ranges.3')" :value="3" />
                    <el-option :label="t('chats.clean.ranges.7')" :value="7" />
                    <el-option :label="t('chats.clean.ranges.30')" :value="30" />
                    <el-option :label="t('chats.clean.ranges.custom')" :value="-1" />
                </el-select>
                <el-input-number v-if="cleanDaysOption === -1" v-model="cleanCustomDays" :min="1" :max="3650"
                    style="width: 120px;" controls-position="right" />
            </div>

            <div class="clean-preview">
                <p v-if="computedFilesToClean.length > 0" class="preview-title">
                    {{ t('chats.clean.previewTitle', {
                        count: computedFilesToClean.length,
                        days: cleanDaysOption === -1 ? cleanCustomDays : cleanDaysOption,
                        size: formatBytes(totalCleanSize)
                    }) }}
                </p>
                <p v-else class="preview-title text-gray">{{ t('chats.clean.noFilesFound') }}</p>

                <el-scrollbar max-height="30vh" v-if="computedFilesToClean.length > 0" class="custom-clean-scrollbar">
                    <ul class="file-preview-list">
                        <li v-for="file in computedFilesToClean" :key="file.basename">
                            <span class="fname">{{ file.basename }}</span>
                            <span class="fdate">{{ formatDate(file.updatedAt || file.lastmod || file.createdAt) }}</span>
                        </li>
                    </ul>
                </el-scrollbar>
            </div>
        </div>
        <template #footer>
            <el-button @click="showCleanDialog = false">{{ t('common.cancel') }}</el-button>
            <el-button type="danger" @click="executeAutoClean" :loading="isCleaning"
                :disabled="computedFilesToClean.length === 0">
                {{ t('chats.clean.confirmBtn') }}
            </el-button>
        </template>
    </el-dialog>

    <!-- 删除项目：三选项 -->
    <el-dialog v-model="projectDeleteDialog.visible" :title="t('chats.projects.delete')" width="420px" append-to-body
        align-center class="project-delete-dialog">
        <p class="project-delete-message">{{ t('chats.projects.deleteDialogMessage', { name: projectDeleteDialog.name }) }}</p>
        <div class="project-delete-options">
            <button type="button" class="project-delete-option" :disabled="projectDeleteDialog.busy"
                @click="confirmDeleteProjectKeepChats">
                <span class="opt-title">{{ t('chats.projects.deleteKeepChats') }}</span>
                <span class="opt-desc">{{ t('chats.projects.deleteKeepChatsDesc') }}</span>
            </button>
            <button type="button" class="project-delete-option danger" :disabled="projectDeleteDialog.busy"
                @click="confirmDeleteProjectWithChats">
                <span class="opt-title">{{ t('chats.projects.deleteWithChats') }}</span>
                <span class="opt-desc">{{ t('chats.projects.deleteWithChatsDesc') }}</span>
            </button>
        </div>
        <template #footer>
            <el-button :disabled="projectDeleteDialog.busy" @click="projectDeleteDialog.visible = false">
                {{ t('chats.projects.deleteCancel') }}
            </el-button>
        </template>
    </el-dialog>

    <!-- 自定义拖拽悬浮提示 -->
    <div v-show="isProjectDragging" class="drag-ghost" :style="{ top: dragGhostY + 'px', left: dragGhostX + 'px' }">
        {{ dragGhostLabel }}
    </div>
</template>

<style scoped>
/* 框选矩形样式 */
.selection-box {
    position: fixed; /* 使用 fixed 定位，直接基于视口 */
    background-color: rgba(24, 24, 27, 0.1); /* Panda Black 10% */
    border: 1px solid rgba(24, 24, 27, 0.2); /* Panda Black 20% */
    z-index: 9999;
    pointer-events: none; /* 确保不阻挡鼠标事件 */
}

/* 深色模式下的选框 */
:global(html.dark) .selection-box {
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.view-selector {
    padding: 5px 100px 0px 100px;
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.chats-page-container {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    padding: 21px;
    box-sizing: border-box;
    overflow: hidden;
    background-color: var(--bg-primary);
}

.config-prompt {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    height: 100%;
    text-align: center;
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    box-shadow: 0 0 0 1px var(--border-primary);
}

.config-prompt-title {
    font-size: 18px;
    color: var(--text-primary);
    margin-top: 0;
    margin-bottom: 8px;
    font-weight: 600;
}

:deep(.el-empty__description p) {
    color: var(--text-secondary);
    font-size: 14px;
}

.chats-content-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    box-shadow: 0 0 0 1px var(--border-primary), var(--shadow-sm);
    overflow: hidden;
}

.table-container {
    flex-grow: 1;
    overflow: hidden;
    padding: 5px 0px 10px 10px;
    position: relative; /* 为选框提供定位上下文 (虽然我们用了 fixed，但保持结构清晰) */
    user-select: none;  /* 防止拖拽时选中文本 */
}

/* === 表头（可点击排序） === */
.chat-table-shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.chat-table-header {
    display: grid;
    grid-template-columns: var(--chat-table-columns);
    align-items: center;
    gap: 8px;
    padding: 0 12px 8px 12px;
    margin: 2px 10px 4px 0;
    border-bottom: 1px solid var(--border-primary);
}

.chat-column {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-width: 0;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    letter-spacing: 0.02em;
    white-space: nowrap;
}

.chat-column.sortable {
    justify-content: flex-start;
    gap: 4px;
    width: 100%;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    transition: color 0.2s ease;
}

.chat-column.sortable:hover,
.chat-column.sortable.active {
    color: var(--el-color-primary);
}

.sort-indicator {
    font-size: 10px;
    line-height: 1;
}

.chat-column-actions {
    justify-content: flex-start;
    padding-right: 0;
}

.chat-table-shell :deep(.el-scrollbar) {
    min-height: 0;
    flex: 1;
}

/* === 紧凑列表样式 Start === */
.chat-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-right: 10px;
    min-height: 100%; /* 确保拖拽空白处也能触发 */
    cursor: default;  /* 默认鼠标 */
}

.chat-list-item {
    display: grid;
    grid-template-columns: var(--chat-table-columns);
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background-color: transparent;
    border-radius: 16px 8px 8px 16px;
    transition: background-color 0.2s;
    cursor: pointer;
    position: relative;
    height: 40px;
    box-sizing: border-box;
    width: 100%;
}

.chat-list-item:hover {
    background-color: var(--bg-tertiary);
    border-radius: 16px 8px 8px 16px;
}

.chat-list-item.is-selected {
    background-color: var(--el-color-primary-light-9);
}

/* 深色模式下的选中状态 */
:global(html.dark) .chat-list-item.is-selected {
    background-color: rgba(64, 158, 255, 0.15);
}

.list-checkbox {
    width: 0;
    margin-right: 0;
    display: flex;
    align-items: center;
    opacity: 0;
    overflow: hidden;
    transition: all 0.2s ease;
    pointer-events: none;
}

.chat-list-item:hover .list-checkbox {
    pointer-events: auto;
}

.chat-list-item.is-selected .list-checkbox {
    width: 24px;
    margin-right: 0px;
    opacity: 1;
    pointer-events: auto;
}

.list-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    padding-right: 6px;
}

.meta-created,
.meta-updated,
.meta-size {
    min-width: 0;
    font-size: 11px;
    color: var(--text-tertiary);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.list-actions {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 2px;
    min-width: 0;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.2s;
}

.chat-list-item:hover .list-actions,
.chat-list-item.is-selected .list-actions {
    opacity: 1;
}

.action-icon-btn {
    font-size: 14px;
    padding: 4px;
    margin-left: 0 !important;
    color: var(--text-secondary);
}

.action-icon-btn:hover {
    color: var(--el-color-primary);
    background-color: rgba(0, 0, 0, 0.05);
}

.action-icon-btn.chat-highlight {
    color: var(--text-secondary);
}

.action-icon-btn.chat-highlight:hover {
    color: var(--el-color-primary);
}

:deep(.chat-list-view) {
    min-height: 100%;
}

.footer-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    flex-wrap: nowrap;
    gap: 10px;
    padding: 10px 15px;
    border-top: 1px solid var(--border-primary);
    background-color: var(--bg-primary);
    flex-shrink: 0;
}

.footer-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 70px;
}

.selection-count {
    font-size: 12px;
    color: var(--el-color-primary);
    font-weight: 500;
}

.footer-center {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    justify-content: center;
    overflow: hidden;
}

.footer-right {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: flex-end;
    min-width: 70px;
}

:deep(.el-pagination) {
    --el-pagination-text-color: var(--text-secondary);
}

:deep(.el-pagination) {
    flex-wrap: nowrap;
    max-width: 100%;
}

:deep(.el-pagination .el-pagination__sizes),
:deep(.el-pagination .el-pagination__total),
:deep(.el-pagination .el-pagination__jump) {
    white-space: nowrap;
}


:deep(.el-pagination.is-background .el-pager li),
:deep(.el-pagination.is-background .btn-prev),
:deep(.el-pagination.is-background .btn-next) {
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
}

:deep(.el-pagination.is-background .el-pager li:not(.is-disabled).is-active) {
    background-color: var(--bg-accent);
    color: var(--text-on-accent);
}

:deep(.el-pagination.is-background .el-pager li:hover) {
    color: var(--text-accent);
}

:deep(.el-pagination.is-background .btn-prev:hover),
:deep(.el-pagination.is-background .btn-next:hover) {
    color: var(--text-accent);
}

.config-prompt-small {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
}

.sync-progress-container {
    padding: 20px;
    text-align: center;
}

.sync-status-text {
    margin-top: 15px;
    color: var(--text-secondary);
}

.sync-buttons-container {
    position: absolute;
    top: 8px;
    right: 20px;
    z-index: 10;
    display: flex;
    gap: 8px;
}

.sync-buttons-container .el-button {
    width: 32px;
    height: 32px;
}

.sync-buttons-container :deep(.el-badge__content) {
    font-size: 10px;
    padding: 0 5px;
    height: 16px;
    line-height: 16px;
    min-width: 16px;
    border-width: 1px;
    transform: translateY(-50%) translateX(70%);
}

html.dark .sync-buttons-container :deep(.el-badge__content--primary) {
    background-color: var(--el-color-primary);
    color: var(--bg-primary);
}

.info-button-container {
    position: absolute;
    top: 8px;
    left: 20px;
    z-index: 10;
}

.info-button-container .el-button {
    width: 32px;
    height: 32px;
}

.info-popover-content p {
    margin: 0 0 8px 0;
    line-height: 1.6;
    color: var(--text-secondary);
}

.info-popover-content p:last-child {
    margin-bottom: 0;
}

.info-popover-content strong {
    color: var(--text-primary);
}

.info-popover-content code {
    background-color: var(--bg-tertiary);
    color: var(--el-color-primary);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
    word-break: break-all;
}

.clean-options {
    display: flex;
    align-items: center;
    margin-top: 10px;
}

.clean-options .label {
    margin-right: 10px;
    font-weight: 500;
    color: var(--text-primary);
}

.clean-preview {
    margin-top: 15px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    padding: 10px 10px 5px 10px;
    background-color: var(--bg-tertiary);
}

.preview-title {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-color-danger);
}

.preview-title.text-gray {
    color: var(--text-tertiary);
}

.file-preview-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.custom-clean-scrollbar {
    width: 100%;
}

.custom-clean-scrollbar :deep(.el-scrollbar__view) {
    display: block;
}

html.dark .custom-clean-scrollbar :deep(.el-scrollbar__thumb) {
    background-color: var(--text-tertiary);
    opacity: 0.5;
}

html.dark .custom-clean-scrollbar :deep(.el-scrollbar__thumb:hover) {
    background-color: var(--text-secondary);
    opacity: 0.8;
}

.file-preview-list li {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    padding: 4px 0;
    border-bottom: 1px dashed var(--border-primary);
    color: var(--text-secondary);
}

.file-preview-list li:last-child {
    border-bottom: none;
}

.file-preview-list .fname {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 10px;
}

.file-preview-list .fdate {
    flex-shrink: 0;
    color: var(--text-tertiary);
    margin-right: 12px;
}

/* --- 项目分组 --- */
.project-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-top: 2px;
    border-radius: 10px;
    cursor: pointer;
    user-select: none;
    background-color: var(--bg-tertiary);
    transition: background-color 0.2s;
}

.project-header:hover {
    background-color: var(--bg-accent-soft, var(--bg-tertiary));
}

.project-header.drag-over {
    outline: 2px dashed var(--el-color-primary);
    outline-offset: -2px;
    background-color: var(--el-color-primary-light-9);
}

.ungrouped-label.drag-over {
    outline: 2px dashed var(--el-color-primary);
    outline-offset: -2px;
    border-radius: 8px;
    color: var(--el-color-primary);
}

.project-caret {
    font-size: 13px;
    color: var(--text-tertiary);
    transition: transform 0.2s ease;
}

.project-caret.expanded {
    transform: rotate(90deg);
}

.project-folder {
    font-size: 14px;
    color: var(--el-color-primary);
}

.project-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 0 1 auto;
}

.project-count {
    font-size: 11px;
    color: var(--text-tertiary);
    background-color: var(--bg-primary);
    border-radius: 10px;
    padding: 0 8px;
    line-height: 18px;
    min-width: 18px;
    text-align: center;
}

.project-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
}

.project-header:hover .project-actions {
    opacity: 1;
}

/* 未分组分隔标签 */
.ungrouped-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    padding: 10px 12px 4px;
    letter-spacing: 0.02em;
}

/* 项目内文件行缩进 */
.chat-list-item.in-project {
    padding-left: 28px;
}

/* 自定义拖拽悬浮提示 */
.drag-ghost {
    position: fixed;
    z-index: 99999;
    pointer-events: none;
    max-width: 260px;
    padding: 4px 10px;
    border-radius: 8px;
    background-color: var(--el-color-primary);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.project-delete-message {
    margin: 0 0 16px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary);
}

.project-delete-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.project-delete-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md, 10px);
    background-color: var(--bg-primary);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.1s ease;
}

.project-delete-option:hover {
    border-color: var(--el-color-primary);
    background-color: var(--el-color-primary-light-9);
}

.project-delete-option:active {
    transform: scale(0.995);
}

.project-delete-option:disabled {
    cursor: not-allowed;
    opacity: 0.6;
}

.project-delete-option.danger:hover {
    border-color: var(--el-color-danger);
    background-color: var(--el-color-danger-light-9);
}

.project-delete-option .opt-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
}

.project-delete-option.danger .opt-title {
    color: var(--el-color-danger);
}

.project-delete-option .opt-desc {
    font-size: 12px;
    color: var(--text-tertiary);
}
</style>

<style>
.project-delete-dialog .el-dialog__header {
    padding: 20px 20px 14px;
    margin-right: 0;
    border-bottom: 1px solid var(--border-primary);
}

.project-delete-dialog .el-dialog__body {
    padding: 18px 20px 6px;
}

.project-delete-dialog .el-dialog__footer {
    padding: 8px 20px 18px;
}

.project-delete-dialog .el-dialog__title {
    font-size: 16px;
    font-weight: 600;
}
</style>