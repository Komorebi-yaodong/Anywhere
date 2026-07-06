<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, computed, inject, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { createClient } from 'webdav/web';
import {
  FolderOpened, Refresh, Edit, Delete, Plus,
  Document, UploadFilled, QuestionFilled, Search,
  Collection, Folder, FolderAdd, Cpu, Warning, Close, Download
} from '@element-plus/icons-vue';

const { t } = useI18n();
const currentConfig = inject('config');

const skillPath = ref('');
const skillsList = ref([]);
const searchQuery = ref('');
const isLoading = ref(false);
const showExportDialog = ref(false);
const skillsToExport = ref([]);
const hideEnvOnExport = ref(true);
const isExporting = ref(false);

const showWebdavSyncDialog = ref(false);
const showWebdavManagerDialog = ref(false);
const skillWebdavLoading = ref(false);
const localSkillsForSync = ref([]);
const skillsToSync = ref([]);
const cloudSkills = ref([]);
const cloudSkillSelection = ref([]);

const selectableDragState = reactive({
  active: false,
  mode: '',
  targetSelected: true,
  lastIndex: {
    sync: -1,
    cloud: -1
  }
});

function getSelectableItems(mode) {
  return mode === 'cloud' ? cloudSkills.value : localSkillsForSync.value;
}

function getSelectableSelectionRef(mode) {
  return mode === 'cloud' ? cloudSkillSelection : skillsToSync;
}

function getSelectableId(item = {}) {
  return String(item?.id || '').trim();
}

function isSelectableSelected(mode, id) {
  return getSelectableSelectionRef(mode).value.includes(id);
}

function setSelectableSelection(mode, ids = []) {
  const next = Array.from(new Set(ids.map(id => String(id || '').trim()).filter(Boolean)));
  getSelectableSelectionRef(mode).value = next;
}

function setSelectableItemSelected(mode, item, selected) {
  if (skillWebdavLoading.value) return;
  const id = getSelectableId(item);
  if (!id) return;
  const current = new Set(getSelectableSelectionRef(mode).value);
  if (selected) current.add(id);
  else current.delete(id);
  setSelectableSelection(mode, Array.from(current));
}

function toggleSelectableItem(mode, item, selected = undefined) {
  const id = getSelectableId(item);
  if (!id) return;
  const nextSelected = typeof selected === 'boolean' ? selected : !isSelectableSelected(mode, id);
  setSelectableItemSelected(mode, item, nextSelected);
}

function selectSelectableRange(mode, fromIndex, toIndex, selected = true) {
  const items = getSelectableItems(mode);
  const start = Math.max(0, Math.min(fromIndex, toIndex));
  const end = Math.min(items.length - 1, Math.max(fromIndex, toIndex));
  const current = new Set(getSelectableSelectionRef(mode).value);
  for (let index = start; index <= end; index += 1) {
    const id = getSelectableId(items[index]);
    if (!id) continue;
    if (selected) current.add(id);
    else current.delete(id);
  }
  setSelectableSelection(mode, Array.from(current));
}

function handleSelectableMouseDown(mode, item, index, event) {
  if (skillWebdavLoading.value || event?.button !== 0) return;
  event?.preventDefault?.();
  if (event?.shiftKey && selectableDragState.lastIndex[mode] >= 0) {
    selectSelectableRange(mode, selectableDragState.lastIndex[mode], index, true);
    selectableDragState.lastIndex[mode] = index;
    return;
  }
  const targetSelected = !isSelectableSelected(mode, getSelectableId(item));
  selectableDragState.active = true;
  selectableDragState.mode = mode;
  selectableDragState.targetSelected = targetSelected;
  selectableDragState.lastIndex[mode] = index;
  toggleSelectableItem(mode, item, targetSelected);
  window.addEventListener('mouseup', stopSelectableDrag, { once: true });
}

function handleSelectableMouseEnter(mode, item) {
  if (!selectableDragState.active || selectableDragState.mode !== mode || skillWebdavLoading.value) return;
  toggleSelectableItem(mode, item, selectableDragState.targetSelected);
}

function stopSelectableDrag() {
  selectableDragState.active = false;
  selectableDragState.mode = '';
}

function selectAllSelectable(mode) {
  if (skillWebdavLoading.value) return;
  setSelectableSelection(mode, getSelectableItems(mode).map(getSelectableId));
}

function clearSelectableSelection(mode) {
  if (skillWebdavLoading.value) return;
  setSelectableSelection(mode, []);
}

function invertSelectableSelection(mode) {
  if (skillWebdavLoading.value) return;
  const current = new Set(getSelectableSelectionRef(mode).value);
  const next = getSelectableItems(mode)
    .map(getSelectableId)
    .filter(id => id && !current.has(id));
  setSelectableSelection(mode, next);
}

function getSelectedCloudSkillRows() {
  const selectedIds = new Set(cloudSkillSelection.value);
  return cloudSkills.value.filter(item => selectedIds.has(getSelectableId(item)));
}

function sleep(ms = 0) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function runSkillTasksWithConcurrency(items, worker, concurrency = 1, options = {}) {
  const queue = [...items];
  const results = [];
  const workerCount = Math.min(Math.max(1, concurrency), queue.length || 1);
  const retries = Number.isFinite(options.retries) ? Math.max(0, options.retries) : 1;
  const retryDelay = Number.isFinite(options.retryDelay) ? Math.max(0, options.retryDelay) : 250;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      const item = queue.shift();
      let lastError = null;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const result = await worker(item, attempt);
          results.push({ ...result, attempts: attempt + 1 });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < retries) {
            await sleep(retryDelay * (attempt + 1));
          }
        }
      }
      if (lastError) {
        results.push({ ok: false, item, error: lastError, attempts: retries + 1 });
      }
      await sleep(40);
    }
  }));

  return results;
}

const SKILL_WEBDAV_MAX_PACKAGE_SIZE = 50 * 1024 * 1024;
const skillSyncProgressVisible = ref(false);
const skillSyncProgress = reactive({
  current: 0,
  total: 0,
  completed: 0,
  success: 0,
  failed: 0,
  phase: '',
  skillId: '',
  cancelled: false,
  results: []
});

function resetSkillSyncProgress(total = 0) {
  skillSyncProgress.current = 0;
  skillSyncProgress.total = total;
  skillSyncProgress.completed = 0;
  skillSyncProgress.success = 0;
  skillSyncProgress.failed = 0;
  skillSyncProgress.phase = '';
  skillSyncProgress.skillId = '';
  skillSyncProgress.cancelled = false;
  skillSyncProgress.results = [];
}

function updateSkillSyncProgress(payload = {}) {
  if (Number.isFinite(payload.current)) skillSyncProgress.current = payload.current;
  if (Number.isFinite(payload.total)) skillSyncProgress.total = payload.total;
  if (Number.isFinite(payload.completed)) skillSyncProgress.completed = payload.completed;
  if (typeof payload.phase === 'string') skillSyncProgress.phase = payload.phase;
  if (typeof payload.skillId === 'string') skillSyncProgress.skillId = payload.skillId;
  if (payload.result && typeof payload.result === 'object') {
    skillSyncProgress.results = [...skillSyncProgress.results, payload.result];
    skillSyncProgress.success = skillSyncProgress.results.filter(item => item.ok).length;
    skillSyncProgress.failed = skillSyncProgress.results.filter(item => !item.ok).length;
  }
}

const skillSyncProgressPercent = computed(() => {
  if (!skillSyncProgress.total) return 0;
  return Math.min(100, Math.round((skillSyncProgress.completed / skillSyncProgress.total) * 100));
});

function cancelSkillWebdavSync() {
  if (!skillWebdavLoading.value || skillSyncProgress.cancelled) return;
  skillSyncProgress.cancelled = true;
}

onBeforeUnmount(() => {
  stopSelectableDrag();
  window.removeEventListener('mouseup', stopSelectableDrag);
});


// 编辑对话框状态
const showEditDialog = ref(false);
const isNewSkill = ref(false);
const activeEditTab = ref('info'); // info | files
const editingSkill = reactive({
  id: '',
  name: '',
  description: '',
  instructions: '',
  enabled: true,
  forkMode: false,
  allowedTools: '',
  extraMetadata: {},
  files: [],
  absolutePath: ''
});

const pendingImportPath = ref('');

// 弹窗拖拽状态
const isDialogDragOver = ref(false);

// 计算属性
const filteredSkills = computed(() => {
  if (!searchQuery.value) return skillsList.value;
  const query = searchQuery.value.toLowerCase();
  return skillsList.value.filter(s =>
    s.name.toLowerCase().includes(query) ||
    s.description.toLowerCase().includes(query)
  );
});

onMounted(async () => {
  if (currentConfig.value && currentConfig.value.skillPath) {
    skillPath.value = currentConfig.value.skillPath;
    await refreshSkills();
  }
});

watch(() => currentConfig.value?.skillPath, (newPath) => {
  if (newPath && newPath !== skillPath.value) {
    skillPath.value = newPath;
    refreshSkills();
  }
});

async function selectSkillPath() {
  const path = await window.api.selectDirectory();
  if (path) {
    skillPath.value = path;
    currentConfig.value.skillPath = path;
    await window.api.saveSetting('skillPath', path);
    await refreshSkills();
  }
}

async function refreshSkills() {
  if (!skillPath.value) return;
  isLoading.value = true;
  try {
    const rawList = await window.api.listSkills(skillPath.value);
    skillsList.value = rawList.map(s => ({
      ...s,
      enabled: !s.disabled
    }));
  } catch (e) {
    ElMessage.error(t('skills.alerts.listFailed') + ': ' + e.message);
  } finally {
    isLoading.value = false;
  }
}

function prepareAddSkill() {
  isNewSkill.value = true;
  activeEditTab.value = 'info';
  pendingImportPath.value = '';
  Object.assign(editingSkill, {
    id: '',
    name: '',
    description: '',
    instructions: '',
    enabled: true,
    forkMode: false,
    allowedTools: '',
    extraMetadata: {},
    files: [],
    absolutePath: ''
  });
  showEditDialog.value = true;
}

async function prepareEditSkill(skillId) {
  isNewSkill.value = false;
  activeEditTab.value = 'info';
  try {
    const details = await window.api.getSkillDetails(skillPath.value, skillId);
    const meta = details.metadata;

    const {
      name,
      description,
      context,
      ['allowed-tools']: allowedTools,
      ['disable-model-invocation']: disableModelInvocation,
      ...extraMetadata
    } = meta;

    Object.assign(editingSkill, {
      id: details.id,
      name: name || details.id,
      description: description || '',
      instructions: details.content || '',
      enabled: disableModelInvocation !== true,
      forkMode: context === 'fork',
      allowedTools: Array.isArray(allowedTools) ? allowedTools.join(', ') : (allowedTools || ''),
      extraMetadata,
      files: details.files || [],
      absolutePath: details.absolutePath
    });
    showEditDialog.value = true;
  } catch (e) {
    ElMessage.error(t('skills.alerts.loadFailed') + ': ' + e.message);
  }
}

// 快速切换启用状态
async function toggleSkillEnabled(skill, newValue) {
  skill.enabled = newValue;
  try {
    const details = await window.api.getSkillDetails(skillPath.value, skill.id);
    const meta = details.metadata;
    if (newValue) delete meta['disable-model-invocation'];
    else meta['disable-model-invocation'] = true;
    await saveSkillContent(skill.id, meta, details.content);
  } catch (e) {
    skill.enabled = !newValue;
    ElMessage.error(t('skills.alerts.statusUpdateFailed') + ': ' + e.message);
  }
}

// 快速切换 Fork 模式
async function toggleSkillFork(skill, newValue) {
  skill.context = newValue ? 'fork' : 'normal';
  try {
    const details = await window.api.getSkillDetails(skillPath.value, skill.id);
    const meta = details.metadata;
    if (newValue) meta['context'] = 'fork';
    else delete meta['context'];
    await saveSkillContent(skill.id, meta, details.content);
    ElMessage.success(newValue ? t('skills.alerts.forkOn') : t('skills.alerts.forkOff'));
  } catch (e) {
    ElMessage.error(t('skills.alerts.forkUpdateFailed') + ': ' + e.message);
  }
}

function formatYamlScalar(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function appendYamlField(lines, key, value) {
  if (value === undefined || value === null || value === '') return;

  if (Array.isArray(value)) {
    const formatted = value
      .map(item => {
        const str = String(item).replace(/"/g, '\\"');
        return `"${str}"`;
      })
      .join(', ');
    lines.push(`${key}: [${formatted}]`);
    return;
  }

  if (typeof value === 'string' && value.includes('\n')) {
    lines.push(`${key}: |`);
    value.split(/\r?\n/).forEach(line => {
      lines.push(`  ${line}`);
    });
    return;
  }

  lines.push(`${key}: ${formatYamlScalar(value)}`);
}

async function saveSkillContent(dirName, metadata, body) {
  const lines = ['---'];
  appendYamlField(lines, 'name', metadata.name);
  appendYamlField(lines, 'description', metadata.description);
  appendYamlField(lines, 'argument-hint', metadata['argument-hint']);
  appendYamlField(lines, 'user-invocable', metadata['user-invocable']);
  if (metadata['disable-model-invocation'] === true) lines.push('disable-model-invocation: true');
  if (metadata.context === 'fork') lines.push('context: fork');
  appendYamlField(lines, 'agent', metadata.agent);
  appendYamlField(lines, 'model', metadata.model);
  appendYamlField(lines, 'allowed-tools', metadata['allowed-tools']);

  lines.push('---');
  lines.push('');
  lines.push(body || '');

  const content = lines.join('\n');
  return await window.api.saveSkill(skillPath.value, dirName, content);
}

async function saveEditDialog() {
  if (!editingSkill.name) {
    ElMessage.warning(t('skills.alerts.nameRequired'));
    return;
  }

  const metadata = {
    ...editingSkill.extraMetadata,
    name: editingSkill.name,
    description: editingSkill.description,
  };

  if (!editingSkill.enabled) metadata['disable-model-invocation'] = true;
  if (editingSkill.forkMode) metadata['context'] = 'fork';

  if (editingSkill.allowedTools) {
    metadata['allowed-tools'] = editingSkill.allowedTools.split(/[,，]/).map(t => t.trim()).filter(Boolean);
  }

  let dirName = editingSkill.id;
  if (isNewSkill.value) {
    dirName = editingSkill.name.replace(/[\\/:*?"<>|]/g, '-').toLowerCase();
  }

  try {
    // 只要有 pendingImportPath，无论是新建还是编辑，都执行文件夹拷贝
    if (pendingImportPath.value) {
      const targetDir = window.api.pathJoin(skillPath.value, dirName);
      if (!isNewSkill.value) {
        // 只有当 ID (文件夹名) 没变时，才需要清空当前目录。
        // 如果 ID 变了，相当于新目录，不需要清空。
        if (dirName === editingSkill.id) {
          await window.api.deleteSkill(skillPath.value, dirName);
        }
      }

      // 执行全量拷贝
      await window.api.copyLocalPath(pendingImportPath.value, targetDir);
    }

    // 保存 SKILL.md (覆盖拷贝过来的旧配置，以当前 UI 编辑的内容为准)
    const success = await saveSkillContent(dirName, metadata, editingSkill.instructions);

    if (success) {
      ElMessage.success(t('common.saveSuccess'));
      showEditDialog.value = false;
      // 导入完成后重置 pendingImportPath
      pendingImportPath.value = '';
      refreshSkills();
    } else {
      throw new Error('Save returned false');
    }
  } catch (e) {
    ElMessage.error(t('common.saveFailed') + ': ' + e.message);
  }
}

async function openSkillFolder(skill) {
  const targetPath = skill?.path || (skillPath.value && skill?.id ? window.api.pathJoin(skillPath.value, skill.id) : '');
  if (!targetPath) {
    ElMessage.warning(t('skills.alerts.openFolderPathMissing'));
    return;
  }

  try {
    const result = await window.api.shellOpenPath(targetPath);
    if (result?.ok === false) {
      throw new Error(result.message || result.reason || t('common.operationFailed'));
    }
  } catch (e) {
    ElMessage.error(t('skills.alerts.openFolderFailed') + ': ' + e.message);
  }
}

function deleteSkillFunc(skill) {
  ElMessageBox.confirm(
    t('skills.alerts.deleteConfirm', { name: skill.name }),
    t('common.warningTitle'),
    { type: 'warning' }
  ).then(async () => {
    const success = await window.api.deleteSkill(skillPath.value, skill.id);
    if (success) {
      ElMessage.success(t('common.deleteSuccess'));
      refreshSkills();
    } else {
      ElMessage.error(t('common.deleteFailed'));
    }
  }).catch(() => { });
}

// --- 文件管理 (Drag & Drop + 文件夹上传) ---
const fileInputRef = ref(null);
const folderInputRef = ref(null);

function triggerFileUpload() { fileInputRef.value?.click(); }
function triggerFolderUpload() { folderInputRef.value?.click(); }

async function processUpload(fileObj) {
  try {
    const targetPath = window.api.pathJoin(editingSkill.absolutePath, fileObj.name);
    if (fileObj.path) await window.api.copyLocalPath(fileObj.path, targetPath);
    else {
      const reader = new FileReader();
      reader.onload = async (e) => await window.api.writeLocalFile(targetPath, e.target.result);
      reader.readAsText(fileObj);
    }
  } catch (err) {
    throw new Error(`Failed to upload ${fileObj.name}: ${err.message}`);
  }
}

async function handleBatchUpload(files) {
  if (!files || files.length === 0) return;
  const loadingInstance = ElMessage.info({ message: t('skills.filesTab.uploading'), duration: 0 });
  try {
    for (let i = 0; i < files.length; i++) await processUpload(files[i]);
    ElMessage.success(t('skills.alerts.uploadSuccess'));
    const details = await window.api.getSkillDetails(skillPath.value, editingSkill.id);
    editingSkill.files = details.files;
  } catch (err) {
    ElMessage.error(t('skills.alerts.uploadFailed') + ': ' + err.message);
  } finally {
    loadingInstance.close();
    if (fileInputRef.value) fileInputRef.value.value = '';
    if (folderInputRef.value) folderInputRef.value.value = '';
  }
}

function handleFileChange(event) { handleBatchUpload(event.target.files); }

// --- 弹窗拖拽逻辑 (解析 Skill) ---
function onDialogDragOver(e) { e.preventDefault(); isDialogDragOver.value = true; }
function onDialogDragLeave(e) {
  if (e.relatedTarget === null || !e.currentTarget.contains(e.relatedTarget)) {
    isDialogDragOver.value = false;
  }
}

function parseYamlScalar(rawValue) {
  const value = rawValue.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];

    const items = [];
    let current = '';
    let quote = null;

    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if ((ch === '"' || ch === "'") && inner[i - 1] !== '\\') {
        quote = quote === ch ? null : (quote || ch);
        current += ch;
        continue;
      }
      if (ch === ',' && !quote) {
        items.push(parseYamlScalar(current));
        current = '';
        continue;
      }
      current += ch;
    }

    if (current.trim()) items.push(parseYamlScalar(current));
    return items;
  }

  return value;
}

function parseFrontmatterSimple(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const regex = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;
  const match = normalized.match(regex);
  if (!match) return { metadata: {}, body: normalized };

  const yamlStr = match[1];
  const body = match[2];
  const metadata = {};
  const lines = yamlStr.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) continue;

    const key = keyMatch[1].trim();
    const rawValue = keyMatch[2] ?? '';

    if (rawValue === '|' || rawValue === '>') {
      const blockLines = [];
      for (i = i + 1; i < lines.length; i++) {
        const nextLine = lines[i];
        if (!nextLine.trim()) {
          blockLines.push('');
          continue;
        }
        if (!/^\s+/.test(nextLine)) {
          i -= 1;
          break;
        }
        blockLines.push(nextLine.replace(/^\s{2}/, '').replace(/^\t/, ''));
      }
      metadata[key] = blockLines.join(rawValue === '>' ? ' ' : '\n').trim();
      continue;
    }

    if (rawValue === '') {
      const listItems = [];
      let foundIndentedList = false;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (!nextLine.trim()) {
          if (foundIndentedList) continue;
          break;
        }
        const listMatch = nextLine.match(/^\s*-\s+(.*)$/);
        if (!listMatch) break;
        foundIndentedList = true;
        listItems.push(parseYamlScalar(listMatch[1]));
        i = j;
      }
      metadata[key] = foundIndentedList ? listItems : '';
      continue;
    }

    metadata[key] = parseYamlScalar(rawValue);
  }

  return { metadata, body };
}

async function onDialogDrop(e) {
  e.preventDefault();
  isDialogDragOver.value = false;
  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;

  const item = files[0];
  if (!item.path) return;

  try {
    let isSkillPackage = false;
    let importContent = '';
    let importPath = '';

    // 情况 A: 直接拖入 SKILL.md 文件
    if (item.name === 'SKILL.md' || item.name.toLowerCase() === 'skill.md') {
      importContent = await window.api.readLocalFile(item.path);
      importPath = window.api.pathJoin(item.path, '..'); // 记录父级目录用于拷贝资源
      isSkillPackage = true;
    }
    // 情况 B: 拖入 .skill 文件 (Zip 包)
    else if (item.name.toLowerCase().endsWith('.skill') || item.name.toLowerCase().endsWith('.zip')) {
      const loadingInstance = ElMessage.info({ message: t('skills.alerts.extracting'), duration: 0 });
      try {
        // 解压到临时目录 (后端会智能返回包含 SKILL.md 的实际目录)
        const tempDir = await window.api.extractSkillPackage(item.path);
        const skillMdPath = window.api.pathJoin(tempDir, 'SKILL.md');

        if (await window.api.readLocalFile(skillMdPath).then(() => true).catch(() => false)) {
          importContent = await window.api.readLocalFile(skillMdPath);
          importPath = tempDir; // 记录临时目录路径
          isSkillPackage = true;
        } else {
          throw new Error(t('skills.alerts.invalidPackage'));
        }
      } finally {
        loadingInstance.close();
      }
    }
    // 情况 C: 拖入文件夹 (尝试查找内部的 SKILL.md)
    else {
      const skillMdPath = window.api.pathJoin(item.path, 'SKILL.md');
      try {
        importContent = await window.api.readLocalFile(skillMdPath);
        importPath = item.path; // 记录文件夹路径
        isSkillPackage = true;
      } catch (err) {
        // 不是 Skill 包，忽略
        isSkillPackage = false;
      }
    }

    // 逻辑分支 1：如果是 Skill 包，执行导入/替换逻辑
    if (isSkillPackage) {
      // 记录待导入路径
      if (importPath) {
        pendingImportPath.value = importPath;
      }

      const { metadata, body } = parseFrontmatterSimple(importContent);
      applyImportedMetadata(metadata, body);

      // 如果是新 Skill 且没名字，尝试用文件名(去掉后缀)或元数据
      if (!editingSkill.name) {
        if (metadata.name) editingSkill.name = metadata.name;
        else editingSkill.name = item.name.replace(/\.skill$/i, '');
      }

      // 提示信息
      const actionText = activeEditTab.value === 'files' ? " (已准备替换当前 Skill)" : " (检测到完整 Skill 包)";
      ElMessage.success(t('skills.alerts.parseSuccess') + actionText + "，请点击保存以应用");

      return;
    }

    // 逻辑分支 2：如果不是 Skill 包，且在“文件管理”Tab，则视为普通文件上传
    if (activeEditTab.value === 'files') {
      if (!isNewSkill.value) {
        handleBatchUpload(files);
      } else {
        ElMessage.warning(t('skills.alerts.saveFirstHint') || "请先保存 Skill 后再上传文件");
      }
      return;
    }

    // 逻辑分支 3：不是 Skill 包，且在“基本信息”Tab，报错
    ElMessage.warning(t('skills.alerts.noSkillMd'));
    // 仅在新建时尝试回填名字，编辑时不覆盖
    if (isNewSkill.value) {
      editingSkill.name = item.name;
    }

  } catch (err) {
    ElMessage.error(t('skills.alerts.parseFailed') + ': ' + err.message);
  }
}

// 辅助函数：应用解析出的元数据
function applyImportedMetadata(metadata, body) {
  const {
    name,
    description,
    context,
    ['allowed-tools']: allowedTools,
    ['disable-model-invocation']: disableModelInvocation,
    ...extraMetadata
  } = metadata;

  if (name) editingSkill.name = name;
  if (description) editingSkill.description = description;
  editingSkill.enabled = disableModelInvocation !== true;

  if (allowedTools) {
    editingSkill.allowedTools = Array.isArray(allowedTools) ? allowedTools.join(', ') : allowedTools;
  } else {
    editingSkill.allowedTools = '';
  }
  // 兼容布尔值和字符串的 context 配置
  editingSkill.forkMode = context === 'fork';
  editingSkill.extraMetadata = extraMetadata;

  editingSkill.instructions = body.trim();
}

function deleteSkillFile(fileNode) {
  ElMessageBox.confirm(
    t('skills.alerts.deleteFileConfirm', { name: fileNode.name }),
    t('common.warningTitle'),
    { type: 'warning' }
  ).then(async () => {
    await window.api.deleteSkill(editingSkill.absolutePath, fileNode.path);
    const details = await window.api.getSkillDetails(skillPath.value, editingSkill.id);
    editingSkill.files = details.files;
    ElMessage.success(t('common.deleteSuccess'));
  }).catch((e) => { console.error(e); });
}

function openExportDialog() {
  // 如果没有技能，提示并返回
  if (skillsList.value.length === 0) {
    ElMessage.warning(t('skills.noSkills'));
    return;
  }
  // 重置选择状态（默认不全选，或者你可以改为默认全选）
  skillsToExport.value = [];
  hideEnvOnExport.value = true;
  // 打开弹窗
  showExportDialog.value = true;
}

async function handleExportSkills() {
  if (skillsToExport.value.length === 0) {
    return;
  }

  // 1. 选择导出目录
  const result = await window.api.selectDirectory();
  if (!result) return;
  const outputDir = result;

  isExporting.value = true;
  try {
    const exportPromises = skillsToExport.value.map(skillId =>
      window.api.exportSkillToPackage(skillPath.value, skillId, outputDir, {
        hideEnv: hideEnvOnExport.value
      })
    );

    const results = await Promise.all(exportPromises);

    ElMessage.success(t('skills.export.success', { count: results.length }));
    showExportDialog.value = false;

    // 打开导出目录
    if (results.length > 0) {
      window.api.shellShowItemInFolder(results[0]);
    }
  } catch (e) {
    console.error(e);
    ElMessage.error("导出失败: " + e.message);
  } finally {
    isExporting.value = false;
  }
}


function buildSkillWebdavConfig() {
  return {
    url: currentConfig.value?.webdav?.url || '',
    username: currentConfig.value?.webdav?.username || '',
    password: currentConfig.value?.webdav?.password || ''
  };
}

function getSkillWebdavRemoteRoot() {
  const basePath = String(currentConfig.value?.webdav?.path || '/anywhere').trim() || '/anywhere';
  return `${basePath.endsWith('/') ? basePath.slice(0, -1) : basePath}/skill`;
}

function formatCloudTime(value = '') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '';
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

async function ensureSkillWebdavDirectory(client, remoteRoot) {
  try {
    if (!(await client.exists(remoteRoot))) {
      await client.createDirectory(remoteRoot, { recursive: true });
    }
  } catch (error) {
    console.warn('[Skills] ensure remote dir failed:', error);
    throw error;
  }
}

async function openWebdavSyncDialog() {
  if (!skillPath.value) {
    ElMessage.warning(t('skills.pathNotSet'));
    return;
  }
  if (!currentConfig.value?.webdav?.url) {
    ElMessage.warning('请先在设置中配置 WebDAV');
    return;
  }
  localSkillsForSync.value = Array.isArray(skillsList.value) ? skillsList.value : [];
  setSelectableSelection('sync', localSkillsForSync.value.map(item => item.id));
  showWebdavSyncDialog.value = true;
}

async function syncSelectedSkillsToWebdav() {
  if (!skillPath.value || skillsToSync.value.length === 0) {
    ElMessage.warning(t('common.noFileSelected'));
    return;
  }

  skillWebdavLoading.value = true;
  skillSyncProgressVisible.value = true;
  resetSkillSyncProgress(skillsToSync.value.length);
  try {
    const { url, username, password } = buildSkillWebdavConfig();
    const client = createClient(url, { username, password });
    const remoteRoot = getSkillWebdavRemoteRoot();
    await ensureSkillWebdavDirectory(client, remoteRoot);

    let processed = 0;
    const selectedIds = [...skillsToSync.value];
    const results = await runSkillTasksWithConcurrency(selectedIds, async (skillId) => {
      if (skillSyncProgress.cancelled) {
        throw new Error('已取消');
      }
      updateSkillSyncProgress({
        current: processed + 1,
        total: selectedIds.length,
        phase: '导出并上传',
        skillId
      });
      const packageBuffer = await window.api.exportSkillPackageBuffer(skillPath.value, skillId, { hideEnv: false });
      const packageSize = packageBuffer?.byteLength ?? packageBuffer?.length ?? 0;
      if (packageSize > SKILL_WEBDAV_MAX_PACKAGE_SIZE) {
        throw new Error(`Skill 包超过 ${(SKILL_WEBDAV_MAX_PACKAGE_SIZE / 1024 / 1024).toFixed(0)}MB 限制`);
      }
      await client.putFileContents(`${remoteRoot}/${skillId}.skill`, packageBuffer, { overwrite: true });
      processed += 1;
      const result = { ok: true, skillId, message: '同步成功' };
      updateSkillSyncProgress({
        current: processed,
        completed: processed,
        result,
        phase: '上传完成',
        skillId
      });
      return result;
    }, 2, { retries: 1, retryDelay: 300 });

    const success = results.filter(item => item.ok).length;
    const failedResults = results.filter(item => !item.ok).map(item => ({
      ok: false,
      skillId: typeof item.item === 'string' ? item.item : getSelectableId(item.item),
      message: item.error?.message || '同步失败'
    }));
    skillSyncProgress.completed = Math.min(selectedIds.length, success + failedResults.length);
    skillSyncProgress.current = skillSyncProgress.completed;

    if (failedResults.length > 0) {
      failedResults.forEach(result => {
        if (!skillSyncProgress.results.some(row => row.skillId === result.skillId && !row.ok)) {
          updateSkillSyncProgress({ result });
        }
      });
      ElMessage.warning(`Skill 同步完成：成功 ${success} 个，失败 ${failedResults.length} 个`);
    } else if (skillSyncProgress.cancelled) {
      ElMessage.warning(`Skill 同步已取消，已完成 ${success} 个`);
    } else {
      ElMessage.success(`已同步 ${success} 个 Skill 到云端`);
      showWebdavSyncDialog.value = false;
    }
  } catch (error) {
    ElMessage.error(`Skill 同步失败: ${error.message}`);
  } finally {
    skillWebdavLoading.value = false;
    skillSyncProgress.phase = skillSyncProgress.cancelled ? '已取消' : '已完成';
  }
}

async function fetchCloudSkills() {
  skillWebdavLoading.value = true;
  try {
    const { url, username, password } = buildSkillWebdavConfig();
    const client = createClient(url, { username, password });
    const remoteRoot = getSkillWebdavRemoteRoot();

    if (!(await client.exists(remoteRoot))) {
      cloudSkills.value = [];
      cloudSkillSelection.value = [];
      return;
    }

    const response = await client.getDirectoryContents(remoteRoot, { details: true });
    const contents = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
    cloudSkills.value = contents
      .filter(item => item.type === 'file' && String(item.basename || '').toLowerCase().endsWith('.skill'))
      .map(item => ({
        id: String(item.basename || '').replace(/\.skill$/i, ''),
        name: String(item.basename || '').replace(/\.skill$/i, ''),
        basename: item.basename,
        size: item.size || 0,
        updatedAt: item.lastmod || item.updatedAt || ''
      }))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    cloudSkillSelection.value = [];
  } catch (error) {
    cloudSkills.value = [];
    ElMessage.error(`获取云端 Skill 失败: ${error.message}`);
  } finally {
    skillWebdavLoading.value = false;
  }
}

async function openWebdavManagerDialog() {
  if (!skillPath.value) {
    ElMessage.warning(t('skills.pathNotSet'));
    return;
  }
  if (!currentConfig.value?.webdav?.url) {
    ElMessage.warning('请先在设置中配置 WebDAV');
    return;
  }
  showWebdavManagerDialog.value = true;
  await fetchCloudSkills();
}

async function pullCloudSkill(skill) {
  if (!skillPath.value) {
    ElMessage.warning(t('skills.pathNotSet'));
    return;
  }
  skillWebdavLoading.value = true;
  skillSyncProgressVisible.value = true;
  resetSkillSyncProgress(1);
  try {
    const { url, username, password } = buildSkillWebdavConfig();
    const client = createClient(url, { username, password });
    const remoteRoot = getSkillWebdavRemoteRoot();
    updateSkillSyncProgress({ current: 1, total: 1, phase: '下载并导入', skillId: skill.id });
    const content = await client.getFileContents(`${remoteRoot}/${skill.id}.skill`, { format: 'binary' });
    await window.api.importSkillPackageBuffer(skillPath.value, skill.id, content);
    updateSkillSyncProgress({
      current: 1,
      completed: 1,
      phase: '导入完成',
      skillId: skill.id,
      result: { ok: true, skillId: skill.id, message: '拉取成功' }
    });
    ElMessage.success('已拉取到本地');
    await refreshSkills();
  } catch (error) {
    updateSkillSyncProgress({
      completed: 1,
      result: { ok: false, skillId: skill.id, message: error.message || '拉取失败' }
    });
    ElMessage.error(`拉取 Skill 失败: ${error.message}`);
  } finally {
    skillWebdavLoading.value = false;
    skillSyncProgress.phase = '已完成';
  }
}

async function pullSelectedCloudSkills() {
  const selectedRows = getSelectedCloudSkillRows();
  if (!selectedRows.length) {
    ElMessage.warning(t('common.noFileSelected'));
    return;
  }

  skillWebdavLoading.value = true;
  skillSyncProgressVisible.value = true;
  resetSkillSyncProgress(selectedRows.length);
  try {
    const { url, username, password } = buildSkillWebdavConfig();
    const client = createClient(url, { username, password });
    const remoteRoot = getSkillWebdavRemoteRoot();
    let processed = 0;

    const results = await runSkillTasksWithConcurrency(selectedRows, async (skill) => {
      if (skillSyncProgress.cancelled) {
        throw new Error('已取消');
      }
      updateSkillSyncProgress({
        current: processed + 1,
        total: selectedRows.length,
        phase: '下载并导入',
        skillId: skill.id
      });
      const content = await client.getFileContents(`${remoteRoot}/${skill.id}.skill`, { format: 'binary' });
      await window.api.importSkillPackageBuffer(skillPath.value, skill.id, content);
      processed += 1;
      const result = { ok: true, skillId: skill.id, message: '拉取成功' };
      updateSkillSyncProgress({
        current: processed,
        completed: processed,
        phase: '导入完成',
        skillId: skill.id,
        result
      });
      return result;
    }, 2, { retries: 1, retryDelay: 250 });

    const success = results.filter(item => item.ok).length;
    const failedResults = results.filter(item => !item.ok).map(item => ({
      ok: false,
      skillId: getSelectableId(item.item),
      message: item.error?.message || '拉取失败'
    }));
    skillSyncProgress.completed = Math.min(selectedRows.length, success + failedResults.length);
    skillSyncProgress.current = skillSyncProgress.completed;

    if (failedResults.length > 0) {
      failedResults.forEach(result => {
        if (!skillSyncProgress.results.some(row => row.skillId === result.skillId && !row.ok)) {
          updateSkillSyncProgress({ result });
        }
      });
      ElMessage.warning(`拉取完成：成功 ${success} 个，失败 ${failedResults.length} 个`);
    } else if (skillSyncProgress.cancelled) {
      ElMessage.warning(`拉取已取消，已完成 ${success} 个`);
    } else {
      ElMessage.success(`拉取完成：成功 ${success} 个`);
    }
    await refreshSkills();
  } catch (error) {
    ElMessage.error(`批量拉取 Skill 失败: ${error.message}`);
  } finally {
    skillWebdavLoading.value = false;
    skillSyncProgress.phase = skillSyncProgress.cancelled ? '已取消' : '已完成';
  }
}

async function deleteSelectedCloudSkills() {
  if (!cloudSkillSelection.value.length) {
    ElMessage.warning(t('common.noFileSelected'));
    return;
  }

  await ElMessageBox.confirm(`确定删除选中的 ${cloudSkillSelection.value.length} 个云端 Skill 吗？`, t('common.warningTitle'), { type: 'warning' });
  skillWebdavLoading.value = true;
  try {
    const { url, username, password } = buildSkillWebdavConfig();
    const client = createClient(url, { username, password });
    const remoteRoot = getSkillWebdavRemoteRoot();
    for (const skillId of cloudSkillSelection.value) {
      await client.deleteFile(`${remoteRoot}/${skillId}.skill`);
    }
    ElMessage.success(t('common.deleteSuccess'));
    await fetchCloudSkills();
  } catch (error) {
    ElMessage.error(`删除云端 Skill 失败: ${error.message}`);
  } finally {
    skillWebdavLoading.value = false;
  }
}

</script>

<template>
  <div class="page-container">
    <el-scrollbar class="main-content-scrollbar">
      <div class="content-wrapper">

        <div class="path-bar-container" v-if="skillPath">
          <el-input v-model="searchQuery" :placeholder="t('skills.searchPlaceholder')" :prefix-icon="Search"
            clearable />
        </div>

        <div v-if="!skillPath" class="empty-state">
          <el-empty :description="t('skills.pathNotSet')">
            <el-button type="primary" :icon="FolderOpened" @click="selectSkillPath">
              {{ t('skills.setPathBtn') }}
            </el-button>
          </el-empty>
        </div>

        <div v-else-if="filteredSkills.length === 0" class="empty-state">
          <el-empty :description="t('skills.noSkills')" />
        </div>

        <div v-else class="skills-grid-container">
          <div v-for="skill in filteredSkills" :key="skill.id" class="skill-card">
            <div class="skill-card-header">
              <el-avatar shape="square" :size="32" class="skill-card-icon">
                <el-icon :size="20">
                  <Collection />
                </el-icon>
              </el-avatar>

              <div class="skill-card-title-group">
                <span class="skill-name">{{ skill.name }}</span>
                <span class="skill-id-sub">{{ skill.id }}</span>
              </div>

              <div class="skill-header-actions">
                <el-tooltip
                  :content="skill.context === 'fork' ? t('skills.tooltips.forkOn') : t('skills.tooltips.forkOff')"
                  placement="top">
                  <div class="subagent-toggle-btn" :class="{ 'is-active': skill.context === 'fork' }"
                    @click.stop="toggleSkillFork(skill, skill.context !== 'fork')">
                    <el-icon :size="16">
                      <Cpu />
                    </el-icon>
                  </div>
                </el-tooltip>

                <el-switch :model-value="skill.enabled" @change="(val) => toggleSkillEnabled(skill, val)" size="small"
                  class="skill-active-toggle" />
              </div>
            </div>

            <div class="skill-card-body">
              <p class="skill-description">{{ skill.description }}</p>
            </div>

            <div class="skill-card-footer">
              <div class="skill-tags">
                <el-tag v-if="skill.context === 'fork'" size="small" type="warning" effect="plain"
                  round>Sub-Agent</el-tag>
                <el-tag v-if="skill.allowedTools && skill.allowedTools.length > 0" size="small" type="info"
                  effect="plain" round>Tools</el-tag>
              </div>
              <div class="skill-actions">
                <el-tooltip :content="t('skills.tooltips.openFolder')" placement="top">
                  <el-button :icon="FolderOpened" text circle @click="openSkillFolder(skill)" class="action-btn-compact" />
                </el-tooltip>
                <el-button :icon="Edit" text circle @click="prepareEditSkill(skill.id)" class="action-btn-compact" />
                <el-button :icon="Delete" text circle type="danger" @click="deleteSkillFunc(skill)"
                  class="action-btn-compact" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </el-scrollbar>

    <el-tooltip :content="t('skills.tooltips.refresh')" placement="left">
      <el-button class="refresh-fab-button" :icon="Refresh" type="primary" circle @click="refreshSkills" />
    </el-tooltip>

    <div class="bottom-actions-container">
      <el-button class="action-btn" @click="prepareAddSkill" :icon="Plus" type="primary" :disabled="!skillPath">
        {{ t('skills.addTitle') }}
      </el-button>
      <el-button class="action-btn" @click="openExportDialog" :icon="Download" :disabled="!skillPath">
        {{ t('skills.export.button') }}
      </el-button>
      <el-button class="action-btn skill-sync-split-btn" :disabled="!skillPath">
        <span class="split-left" @click.stop="openWebdavSyncDialog">云端同步</span>
        <span class="split-divider"></span>
        <span class="split-right" @click.stop="openWebdavManagerDialog">拉取</span>
      </el-button>
      <el-button class="action-btn" @click="selectSkillPath" :icon="FolderOpened">
        {{ t('skills.setPathBtn') }}
      </el-button>
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="showEditDialog" width="650px" :close-on-click-modal="false" class="skill-edit-dialog">
      <template #header>
        <div class="dialog-header-row" style="justify-content: space-between; width: 100%; padding-right: 30px;">
          <div style="display: flex; align-items: baseline; gap: 12px;">
            <span class="dialog-title">{{ isNewSkill ? t('skills.addTitle') : t('skills.editTitle') }}</span>
            <span class="drag-hint-text" v-if="isNewSkill">
              <el-icon style="vertical-align: middle; margin-right:4px;">
                <FolderAdd />
              </el-icon>
              {{ t('skills.dialog.dragHint') }}
            </span>
          </div>

          <el-radio-group v-model="activeEditTab" size="small">
            <el-radio-button value="info">{{ t('skills.tabs.info') }}</el-radio-button>
            <el-radio-button value="files" :disabled="isNewSkill">{{ t('skills.tabs.files') }}</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <div v-if="isDialogDragOver" class="dialog-drag-overlay">
        <div class="drag-content">
          <el-icon :size="48">
            <FolderAdd />
          </el-icon>
          <p>{{ t('skills.dialog.dropHint') }}</p>
        </div>
      </div>

      <div class="dialog-content-wrapper" @dragover="onDialogDragOver" @dragleave="onDialogDragLeave"
        @drop="onDialogDrop">
        <el-tabs v-model="activeEditTab" class="skill-edit-tabs">
          <el-tab-pane :label="t('skills.tabs.info')" name="info">
            <el-scrollbar max-height="45vh" class="dialog-form-scrollbar" view-class="dialog-form-view">
              <el-form label-position="top" class="skill-form">
                <div class="form-split-layout">
                  <div class="left-col">
                    <el-form-item required>
                      <template #label><span class="custom-label">{{ t('skills.form.name') }}</span></template>
                      <el-input v-model="editingSkill.name" :placeholder="t('skills.form.namePlaceholder')" />
                    </el-form-item>

                    <el-form-item :label="t('skills.form.description')">
                      <el-scrollbar class="textarea-scrollbar-wrapper" max-height="160px"
                        view-class="textarea-scrollbar-view">
                        <el-input v-model="editingSkill.description" type="textarea" :autosize="{ minRows: 5 }"
                          resize="none" class="transparent-textarea" :placeholder="t('skills.form.descPlaceholder')" />
                      </el-scrollbar>
                    </el-form-item>

                    <el-form-item>
                      <template #label>
                        <div class="label-with-hint">
                          <span>{{ t('skills.form.allowedTools') }}</span>
                          <span class="label-subtext">{{ t('skills.form.toolsHint') }}</span>
                        </div>
                      </template>
                      <el-input v-model="editingSkill.allowedTools" :placeholder="t('skills.form.toolsPlaceholder')" />
                    </el-form-item>
                  </div>

                  <div class="right-col">
                    <el-form-item :label="t('skills.form.instructions')" class="instructions-item">
                      <el-scrollbar class="textarea-scrollbar-wrapper full-height" view-class="textarea-scrollbar-view">
                        <el-input v-model="editingSkill.instructions" type="textarea" :autosize="{ minRows: 15 }"
                          :placeholder="t('skills.form.instructionPlaceholder')"
                          class="code-font transparent-textarea full-height-textarea" resize="none" />
                      </el-scrollbar>
                    </el-form-item>
                  </div>
                </div>
              </el-form>
            </el-scrollbar>
          </el-tab-pane>

          <el-tab-pane :label="t('skills.tabs.files')" name="files" :disabled="isNewSkill">
            <div class="files-tab-content">
              <div class="files-toolbar">
                <el-button type="primary" size="small" :icon="UploadFilled" @click="triggerFileUpload">
                  {{ t('skills.uploadFile') }}
                </el-button>
                <el-button type="warning" plain size="small" :icon="FolderAdd" @click="triggerFolderUpload">
                  {{ t('skills.uploadFolder') }}
                </el-button>
                <input ref="fileInputRef" type="file" multiple style="display:none" @change="handleFileChange" />
                <input ref="folderInputRef" type="file" webkitdirectory style="display:none"
                  @change="handleFileChange" />
                <span class="file-hint-text">{{ t('skills.filesTab.hint') }}</span>
              </div>

              <div class="files-tree-container">
                <el-scrollbar max-height="35vh">
                  <el-tree :data="editingSkill.files" node-key="path" :props="{ label: 'name', children: 'children' }"
                    :empty-text="t('skills.filesTab.empty')">
                    <template #default="{ node, data }">
                      <span class="custom-tree-node">
                        <span class="tree-icon">
                          <el-icon v-if="data.type === 'directory'" color="#E6A23C">
                            <Folder />
                          </el-icon>
                          <el-icon v-else color="#909399">
                            <Document />
                          </el-icon>
                        </span>
                        <span class="tree-label">{{ node.label }}</span>
                        <span v-if="data.type === 'file'" class="tree-meta">{{ data.size }}</span>
                        <span class="tree-actions" @click.stop>
                          <el-button link type="danger" :icon="Delete" size="small" @click="deleteSkillFile(data)" />
                        </span>
                      </span>
                    </template>
                  </el-tree>
                </el-scrollbar>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>

      <template #footer>
        <el-button @click="showEditDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveEditDialog">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="showExportDialog" :title="t('skills.export.title')" width="500px" :close-on-click-modal="false">
      <div class="export-dialog-content">
        <p style="margin-top:0; color:var(--el-text-color-secondary); font-size:13px;">
          {{ t('skills.export.hint') }}
        </p>
        <el-scrollbar max-height="35vh" class="export-list-scroll">
          <div v-if="skillsList.length === 0" style="text-align: center; padding: 20px; color: var(--text-tertiary);">
            {{ t('skills.export.empty') }}
          </div>
          <el-checkbox-group v-model="skillsToExport" v-else>
            <div v-for="skill in skillsList" :key="skill.id" class="export-item-row">
              <el-checkbox :value="skill.id">
                <span class="export-skill-name">{{ skill.name }}</span>
                <span class="export-skill-id">{{ skill.id }}</span>
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </el-scrollbar>
        <div class="export-actions-bar" style="margin-top:10px; display:flex; justify-content:space-between;">
          <el-button size="small" @click="skillsToExport = skillsList.map(s => s.id)">{{ t('skills.export.selectAll')
          }}</el-button>
          <el-button size="small" @click="skillsToExport = []">{{ t('skills.export.clear') }}</el-button>
        </div>
      </div>
      <template #footer>
        <div class="export-dialog-footer">
          <el-checkbox v-model="hideEnvOnExport">{{ t('skills.export.hideEnv') }}</el-checkbox>
          <div class="export-dialog-footer-actions">
            <el-button @click="showExportDialog = false">{{ t('common.cancel') }}</el-button>
            <el-button type="primary" @click="handleExportSkills" :loading="isExporting"
              :disabled="skillsToExport.length === 0">
              {{ t('skills.export.confirmBtn') }}
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="showWebdavSyncDialog" title="同步 Skill 到 WebDAV" width="580px" top="4vh" :close-on-click-modal="false" class="skill-webdav-sync-dialog">
      <div class="selectable-toolbar">
        <span class="selectable-count">已选 {{ skillsToSync.length }} / {{ localSkillsForSync.length }}</span>
        <div class="selectable-actions">
          <el-button size="small" text @click="selectAllSelectable('sync')" :disabled="skillWebdavLoading">全选</el-button>
          <el-button size="small" text @click="clearSelectableSelection('sync')" :disabled="skillWebdavLoading">清空</el-button>
          <el-button size="small" text @click="invertSelectableSelection('sync')" :disabled="skillWebdavLoading">反选</el-button>
        </div>
      </div>
      <el-scrollbar max-height="280px" class="selectable-list-scroll skill-sync-list-scroll">
        <div class="selectable-list" :class="{ 'is-disabled': skillWebdavLoading }">
          <div
            v-for="(skill, index) in localSkillsForSync"
            :key="skill.id"
            class="selectable-row"
            :class="{ 'is-selected': isSelectableSelected('sync', skill.id) }"
            @mousedown="handleSelectableMouseDown('sync', skill, index, $event)"
            @mouseenter="handleSelectableMouseEnter('sync', skill)"
          >
            <el-checkbox :model-value="isSelectableSelected('sync', skill.id)" @click.prevent />
            <div class="selectable-main">
              <div class="selectable-title">{{ skill.name || skill.id }}</div>
              <div class="selectable-subtitle">{{ skill.id }}</div>
            </div>
          </div>
        </div>
      </el-scrollbar>
      <div class="selectable-hint">提示：点击行可切换选择，按住鼠标拖过多行可批量选择/取消，Shift + 点击可范围选择。</div>
      <template #footer>
        <el-button @click="showWebdavSyncDialog = false" :disabled="skillWebdavLoading">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="skillWebdavLoading" @click="syncSelectedSkillsToWebdav">同步</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="skillSyncProgressVisible" title="Skill 云端同步进度" width="520px" top="8vh" :close-on-click-modal="false" :show-close="!skillWebdavLoading">
      <div class="skill-sync-progress-panel">
        <el-progress :percentage="skillSyncProgressPercent" :status="skillSyncProgress.failed > 0 ? 'warning' : undefined" />
        <div class="skill-sync-progress-meta">
          <span>已处理 {{ skillSyncProgress.completed }} / {{ skillSyncProgress.total }}</span>
          <span>成功 {{ skillSyncProgress.success }}，失败 {{ skillSyncProgress.failed }}</span>
        </div>
        <div class="skill-sync-current" v-if="skillSyncProgress.total > 0">
          当前：{{ skillSyncProgress.skillId || '-' }}
          <span v-if="skillSyncProgress.phase">（{{ skillSyncProgress.phase }}）</span>
        </div>
        <el-alert v-if="skillSyncProgress.cancelled" title="正在取消任务，已开始的当前项会尽快停止" type="warning" :closable="false" show-icon />
        <el-scrollbar v-if="skillSyncProgress.results.some(item => !item.ok)" max-height="140px" class="skill-sync-failures">
          <div v-for="item in skillSyncProgress.results.filter(row => !row.ok)" :key="item.skillId" class="skill-sync-failure-row">
            <strong>{{ item.skillId }}</strong>
            <span>{{ item.message || '操作失败' }}</span>
          </div>
        </el-scrollbar>
      </div>
      <template #footer>
        <el-button v-if="skillWebdavLoading" type="warning" plain @click="cancelSkillWebdavSync" :disabled="skillSyncProgress.cancelled">取消</el-button>
        <el-button v-else @click="skillSyncProgressVisible = false">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showWebdavManagerDialog" title="云端 Skill 管理" width="640px" top="3vh" :close-on-click-modal="false" class="skill-cloud-manager-dialog">
      <div v-loading="skillWebdavLoading" class="cloud-skill-manager-panel">
        <div class="selectable-toolbar">
          <span class="selectable-count">已选 {{ cloudSkillSelection.length }} / {{ cloudSkills.length }}</span>
          <div class="selectable-actions">
            <el-button size="small" text @click="selectAllSelectable('cloud')" :disabled="skillWebdavLoading">全选</el-button>
            <el-button size="small" text @click="clearSelectableSelection('cloud')" :disabled="skillWebdavLoading">清空</el-button>
            <el-button size="small" text @click="invertSelectableSelection('cloud')" :disabled="skillWebdavLoading">反选</el-button>
          </div>
        </div>
        <div class="cloud-skill-header">
          <span></span>
          <span>名称</span>
          <span>ID</span>
          <span>更新时间</span>
          <span>操作</span>
        </div>
        <el-scrollbar max-height="260px" class="selectable-list-scroll cloud-skill-scroll">
          <div class="selectable-list" :class="{ 'is-disabled': skillWebdavLoading }">
            <div
              v-for="(skill, index) in cloudSkills"
              :key="skill.id"
              class="selectable-row cloud-skill-row"
              :class="{ 'is-selected': isSelectableSelected('cloud', skill.id) }"
              @mousedown="handleSelectableMouseDown('cloud', skill, index, $event)"
              @mouseenter="handleSelectableMouseEnter('cloud', skill)"
            >
              <el-checkbox :model-value="isSelectableSelected('cloud', skill.id)" @click.prevent />
              <div class="cloud-skill-name">
                <div class="selectable-title">{{ skill.name || skill.id }}</div>
                <div class="selectable-subtitle">{{ skill.basename }}</div>
              </div>
              <div class="cloud-skill-id">{{ skill.id }}</div>
              <div class="cloud-skill-time">{{ formatCloudTime(skill.updatedAt) }}</div>
              <div class="cloud-skill-actions">
                <el-button link type="primary" @mousedown.stop @click="pullCloudSkill(skill)">拉取</el-button>
              </div>
            </div>
          </div>
        </el-scrollbar>
        <div class="selectable-hint">提示：点击行/拖过多行可多选，Shift + 点击可范围选择；“拉取选中”会批量拉取所选 Skill。</div>
      </div>
      <template #footer>
        <div class="export-dialog-footer">
          <el-button :icon="Refresh" @click="fetchCloudSkills" :disabled="skillWebdavLoading"></el-button>
          <div class="export-dialog-footer-actions">
            <el-button type="primary" plain @click="pullSelectedCloudSkills" :disabled="cloudSkillSelection.length === 0" :loading="skillWebdavLoading">拉取选中</el-button>
            <el-button type="danger" plain @click="deleteSelectedCloudSkills" :disabled="cloudSkillSelection.length === 0 || skillWebdavLoading">{{ t('common.deleteSelected') }}</el-button>
            <el-button @click="showWebdavManagerDialog = false" :disabled="skillWebdavLoading">{{ t('common.close') }}</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<style scoped>
/* ================== 全局布局 ================== */
.page-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background-color: var(--bg-primary);
  position: relative;
}

.main-content-scrollbar {
  flex-grow: 1;
}

.content-wrapper {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0px 24px 80px 24px;
}

.path-bar-container {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--bg-primary);
  padding: 8px 0px 8px 0px;
  margin: 0px 0px 5px 0px;
}

.path-bar-container :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--border-primary) inset !important;
}

.path-bar-container :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--text-accent) inset !important;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: calc(100vh - 200px);
}

/* ================== 卡片列表 ================== */
.skills-grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 15px;
}

.skill-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  padding: 10px 16px 6px 16px;
  display: flex;
  flex-direction: column;
  transition: all 0.2s ease-in-out;
}

.skill-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
  border-color: var(--border-accent);
}

.skill-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.skill-card-icon {
  flex-shrink: 0;
  background-color: var(--bg-tertiary);
  color: var(--el-text-color-secondary);
}

.skill-card-title-group {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.skill-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-id-sub {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: monospace;
  opacity: 0.8;
}

.skill-header-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.skill-active-toggle {
  margin-left: 2px;
}

/* 子智能体开关按钮样式 */
.subagent-toggle-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-tertiary);
  transition: all 0.2s;
  background-color: transparent;
  border: 1px solid transparent;
}

.subagent-toggle-btn:hover {
  background-color: var(--bg-tertiary);
  color: var(--text-secondary);
}

.subagent-toggle-btn.is-active {
  color: #E6A23C;
  background-color: rgba(230, 162, 60, 0.1);
  border-color: rgba(230, 162, 60, 0.3);
}

.skill-card-body {
  flex-grow: 1;
  margin-bottom: 8px;
  padding-left: 2px;
}

.skill-description {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.skill-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-top: 1px dashed var(--border-primary);
  padding-top: 6px;
}

.skill-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-grow: 1;
  min-width: 0;
}

.skill-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.action-btn-compact {
  padding: 6px;
  margin-left: 0 !important;
}

/* ================== 底部操作栏 & 刷新按钮 ================== */
.skill-sync-progress-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skill-sync-progress-meta {
  display: flex;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 13px;
}

.skill-sync-current {
  color: var(--text-primary);
  font-size: 13px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: 8px 10px;
}

.skill-sync-failures {
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
}

.skill-sync-failure-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-primary);
}

.skill-sync-failure-row:last-child {
  border-bottom: none;
}

/* ================== 底部操作栏 & 刷新按钮 ================== */
.bottom-actions-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 8px 14px;
  background-color: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-top: 1px solid var(--border-primary);
  z-index: 20;
}

html.dark .bottom-actions-container {
  background-color: rgba(23, 24, 28, 0.7);
}

.skill-sync-split-btn {
  display: inline-flex;
  align-items: center;
  gap: 0;
  padding: 0 !important;
  overflow: hidden;
}

.skill-sync-split-btn .split-left,
.skill-sync-split-btn .split-right {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  min-height: 30px;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.skill-sync-split-btn .split-left:hover,
.skill-sync-split-btn .split-right:hover {
  background: var(--bg-tertiary);
}

.skill-sync-split-btn .split-left,
.skill-sync-split-btn .split-right {
  cursor: pointer;
}

.skill-sync-split-btn.is-disabled .split-left,
.skill-sync-split-btn.is-disabled .split-right,
.skill-sync-split-btn:disabled .split-left,
.skill-sync-split-btn:disabled .split-right {
  cursor: not-allowed;
}

.skill-sync-split-btn .split-divider {
  width: 1px;
  align-self: stretch;
  background: var(--border-primary);
}

.action-btn {
  flex-grow: 0;
  min-width: 132px;
  height: 30px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
}

/* 修复刷新按钮位置 */
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

/* ================== 弹窗样式优化 ================== */

.dialog-drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(var(--el-color-primary-rgb), 0.08);
  backdrop-filter: blur(2px);
  z-index: 200;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 3px dashed var(--el-color-primary);
  margin: 5px;
  border-radius: 8px;
  pointer-events: none;
}

.drag-content {
  text-align: center;
  color: var(--el-color-primary);
  background: var(--bg-secondary);
  padding: 30px 50px;
  border-radius: 12px;
  box-shadow: var(--shadow-md);
}

.dialog-header-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.drag-hint-text {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: normal;
  display: inline-flex;
  align-items: center;
  background-color: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 12px;
}

.dialog-content-wrapper {
  position: relative;
  height: 100%;
}

.dialog-form-scrollbar {
  width: 100%;
}

:deep(.dialog-form-view) {
  padding: 4px 16px 4px 4px;
}

.form-split-layout {
  display: flex;
  gap: 20px;
  width: 100%;
  margin-top: 5px;
}

.left-col {
  flex: 0 0 44%;
  display: flex;
  flex-direction: column;
  gap: 0px;
}

.right-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.custom-label {
  font-weight: 600;
  font-size: 14px;
}

.label-with-hint {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  width: 100%;
}

.label-subtext {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: normal;
  margin-left: 8px;
}

.textarea-scrollbar-wrapper {
  width: 100%;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  background-color: var(--bg-tertiary);
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.textarea-scrollbar-wrapper:focus-within {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

.textarea-scrollbar-wrapper.full-height {
  height: 100%;
}

.transparent-textarea :deep(.el-textarea__inner),
.transparent-textarea :deep(.el-textarea__inner:focus),
.transparent-textarea :deep(.el-textarea__inner:hover) {
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 8px 12px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.6;
}

.transparent-textarea :deep(.el-textarea__inner::-webkit-scrollbar) {
  display: none;
}

:deep(.textarea-scrollbar-view) {
  padding-right: 2px;
}

:deep(.textarea-scrollbar-wrapper .el-scrollbar__thumb) {
  background-color: var(--el-text-color-disabled) !important;
  opacity: 0.5;
}

:deep(.textarea-scrollbar-wrapper .el-scrollbar__thumb:hover) {
  background-color: var(--el-text-color-secondary) !important;
  opacity: 0.8;
}

html.dark .textarea-scrollbar-wrapper {
  background-color: var(--bg-tertiary);
  border-color: var(--border-primary);
}

html.dark :deep(.textarea-scrollbar-wrapper .el-scrollbar__thumb) {
  background-color: var(--text-tertiary) !important;
}

html.dark :deep(.textarea-scrollbar-wrapper .el-scrollbar__thumb:hover) {
  background-color: var(--text-secondary) !important;
}

.code-font :deep(.el-textarea__inner) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
}

.full-height-textarea :deep(.el-textarea__inner) {
  height: 100% !important;
  min-height: 320px;
}

.instructions-item {
  height: 100%;
  display: flex;
  flex-direction: column;
  margin-bottom: 0 !important;
}

.instructions-item :deep(.el-form-item__content) {
  flex-grow: 1;
  height: 100%;
}

.files-tab-content {
  padding-top: 8px;
}

.files-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.file-hint-text {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: auto;
}

.files-tree-container {
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  background-color: var(--bg-tertiary);
  padding: 10px;
}

.custom-tree-node {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  padding-right: 8px;
  min-width: 0;
}

.tree-icon {
  margin-right: 6px;
  display: flex;
  align-items: center;
}

.tree-label {
  flex: 1;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-meta {
  color: var(--text-tertiary);
  font-size: 11px;
  margin-right: 15px;
  flex-shrink: 0;
}

.tree-actions {
  opacity: 0;
  transition: opacity 0.2s;
}

.custom-tree-node:hover .tree-actions {
  opacity: 1;
}

:deep(.el-tree) {
  background-color: transparent;
  color: var(--text-primary);
}

:deep(.el-tree-node__content) {
  height: 28px;
  border-radius: 4px;
}

:deep(.el-tree-node__content:hover) {
  background-color: var(--bg-secondary);
}

:deep(.el-tree-node:focus > .el-tree-node__content) {
  background-color: var(--bg-secondary);
}

.skill-edit-tabs :deep(.el-tabs__header) {
  display: none;
}

.skill-edit-tabs :deep(.el-tabs__content) {
  padding: 0;
}

:deep(.skill-edit-dialog .el-dialog__header) {
  display: flex;
  align-items: center;
  padding: 15px 20px 10px 20px !important;
  margin-right: 0;
}

.export-list-scroll {
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  padding: 10px;
  background-color: var(--bg-tertiary);
}

.export-item-row {
  margin-bottom: 8px;
}

.export-item-row:last-child {
  margin-bottom: 0;
}

.export-skill-name {
  font-weight: 600;
  margin-right: 8px;
  color: var(--text-primary);
}

.export-skill-id {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: monospace;
}

.export-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.export-dialog-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.selectable-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-primary);
  border-radius: 9px;
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
}

.selectable-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.selectable-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.selectable-list-scroll {
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  background-color: var(--bg-tertiary);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.selectable-list {
  padding: 8px;
  user-select: none;
}

.selectable-list.is-disabled {
  opacity: 0.64;
  pointer-events: none;
}

.selectable-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  cursor: pointer;
  transition: background-color 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.selectable-row + .selectable-row {
  margin-top: 4px;
}

.selectable-row:hover {
  background-color: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  border-color: color-mix(in srgb, var(--border-primary) 78%, transparent);
}

.selectable-row.is-selected {
  background: linear-gradient(180deg, rgba(64, 158, 255, 0.12) 0%, rgba(64, 158, 255, 0.08) 100%);
  border-color: rgba(64, 158, 255, 0.42);
  box-shadow: 0 10px 24px -24px rgba(64, 158, 255, 0.95), 0 0 0 1px rgba(64, 158, 255, 0.16) inset;
}

.selectable-main {
  min-width: 0;
  flex: 1;
}

.selectable-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selectable-subtitle {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selectable-hint {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-tertiary);
}

:deep(.skill-webdav-sync-dialog .el-dialog__header) {
  padding: 13px 16px 8px;
}

:deep(.skill-webdav-sync-dialog .el-dialog__body) {
  padding: 8px 16px 10px;
}

:deep(.skill-webdav-sync-dialog .el-dialog__footer) {
  padding: 8px 16px 12px;
  border-top: 1px solid var(--border-primary);
}

.skill-webdav-sync-dialog .selectable-toolbar {
  margin-bottom: 8px;
}

.skill-webdav-sync-dialog .selectable-hint {
  margin-top: 8px;
}

.skill-webdav-sync-dialog .selectable-row {
  min-height: 40px;
  padding: 7px 10px;
}

.skill-webdav-sync-dialog .selectable-list {
  padding: 6px;
}

.cloud-skill-manager-panel {
  min-height: 132px;
}

.cloud-skill-header,
.cloud-skill-row {
  display: grid;
  grid-template-columns: 28px minmax(130px, 1.2fr) minmax(96px, 0.9fr) 104px 42px;
  align-items: center;
  column-gap: 8px;
}

.cloud-skill-header {
  padding: 1px 10px 6px 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--text-tertiary);
}

.cloud-skill-row {
  min-height: 46px;
}

.cloud-skill-name,
.cloud-skill-id,
.cloud-skill-time {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cloud-skill-id {
  font-family: monospace;
  font-size: 11px;
  color: var(--text-secondary);
}

.cloud-skill-time {
  font-size: 11px;
  color: var(--text-secondary);
}

.cloud-skill-actions {
  display: flex;
  justify-content: center;
}

:deep(.skill-cloud-manager-dialog .el-dialog__header) {
  padding: 11px 12px 6px;
}

:deep(.skill-cloud-manager-dialog .el-dialog__body) {
  padding: 6px 10px 7px;
}

:deep(.skill-cloud-manager-dialog .el-dialog__footer) {
  padding: 6px 10px 9px;
  border-top: 1px solid var(--border-primary);
}

.skill-cloud-manager-dialog .export-dialog-footer-actions :deep(.el-button),
.skill-cloud-manager-dialog .selectable-actions :deep(.el-button) {
  font-size: 12px;
  padding-left: 8px;
  padding-right: 8px;
}


</style>