<script setup>
import { ref, reactive, onMounted, computed, inject, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
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
const isExporting = ref(false);

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

    Object.assign(editingSkill, {
      id: details.id,
      name: meta.name || details.id,
      description: meta.description || '',
      instructions: details.content || '',
      enabled: meta['disable-model-invocation'] !== true,
      forkMode: meta.context === 'fork',
      allowedTools: Array.isArray(meta['allowed-tools']) ? meta['allowed-tools'].join(', ') : (meta['allowed-tools'] || ''),
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

async function saveSkillContent(dirName, metadata, body) {
  const lines = ['---'];
  if (metadata.name) lines.push(`name: ${metadata.name}`);
  if (metadata.description) lines.push(`description: ${metadata.description}`);
  if (metadata['disable-model-invocation'] === true) lines.push('disable-model-invocation: true');
  if (metadata.context === 'fork') lines.push('context: fork');

  if (metadata['allowed-tools']) {
    let tools = metadata['allowed-tools'];
    if (typeof tools === 'string') lines.push(`allowed-tools: [${tools}]`);
    else if (Array.isArray(tools)) lines.push(`allowed-tools: [${tools.join(', ')}]`);
  }

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

function parseFrontmatterSimple(text) {
  const regex = /^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*([\s\S]*)$/;
  const match = text.match(regex);
  if (!match) return { metadata: {}, body: text };

  const yamlStr = match[1];
  const body = match[2];
  const metadata = {};

  yamlStr.split('\n').forEach(line => {
    const parts = line.split(':');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      let value = parts.slice(1).join(':').trim();
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim());
      }
      metadata[key] = value;
    }
  });
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
    if (item.name.toLowerCase() === 'skill.md') {
        importContent = await window.api.readLocalFile(item.path);
        importPath = window.api.pathJoin(item.path, '..'); // 记录父级目录用于拷贝资源
        isSkillPackage = true;
    }
    // 情况 B: 拖入 .skill 文件 (Zip 包)
    else if (item.name.toLowerCase().endsWith('.skill')) {
        const loadingInstance = ElMessage.info({ message: '正在解压 Skill 包...', duration: 0 });
        try {
            // 解压到临时目录
            const tempDir = await window.api.extractSkillPackage(item.path);
            const skillMdPath = window.api.pathJoin(tempDir, 'SKILL.md');
            
            if (await window.api.readLocalFile(skillMdPath).then(() => true).catch(() => false)) {
                importContent = await window.api.readLocalFile(skillMdPath);
                importPath = tempDir; // 记录临时目录路径
                isSkillPackage = true;
            } else {
                throw new Error("无效的 .skill 包：根目录下未找到 SKILL.md");
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
  if (metadata.name) editingSkill.name = metadata.name;
  if (metadata.description) editingSkill.description = metadata.description;
  if (metadata['allowed-tools']) {
    const tools = metadata['allowed-tools'];
    editingSkill.allowedTools = Array.isArray(tools) ? tools.join(', ') : tools;
  }
  // 兼容布尔值和字符串的 context 配置
  if (metadata.context === 'fork') editingSkill.forkMode = true;
  
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
      window.api.exportSkillToPackage(skillPath.value, skillId, outputDir)
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
      <el-button class="action-btn" @click="prepareAddSkill" :icon="Plus" type="primary">
        {{ t('skills.addTitle') }}
      </el-button>
      <el-button class="action-btn" @click="openExportDialog" :icon="Download">
        {{ t('skills.export.button') }}
      </el-button>
      <el-button class="action-btn" @click="selectSkillPath" :icon="FolderOpened">
        {{ t('skills.setPathBtn') }}
      </el-button>
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="showEditDialog" width="650px" :close-on-click-modal="false" class="skill-edit-dialog">
      <template #header>
        <div class="dialog-header-row" style="justify-content: space-between; width: 100%; padding-right: 30px;">
          <!-- 左侧：标题 -->
          <div style="display: flex; align-items: baseline; gap: 12px;">
            <span class="dialog-title">{{ isNewSkill ? t('skills.addTitle') : t('skills.editTitle') }}</span>
            <span class="drag-hint-text" v-if="isNewSkill">
              <el-icon style="vertical-align: middle; margin-right:4px;">
                <FolderAdd />
              </el-icon>
              {{ t('skills.dialog.dragHint') }}
            </span>
          </div>
          
          <!-- 右侧：Tab 切换器 -->
          <el-radio-group v-model="activeEditTab" size="small">
            <el-radio-button value="info">{{ t('skills.tabs.info') }}</el-radio-button>
            <el-radio-button value="files" :disabled="isNewSkill">{{ t('skills.tabs.files') }}</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <!-- 拖拽覆盖层 -->
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
            <!-- 滚动容器 -->
            <el-scrollbar max-height="45vh" class="dialog-form-scrollbar" view-class="dialog-form-view">
              <el-form label-position="top" class="skill-form">

                <!-- 左右分栏布局 -->
                <div class="form-split-layout">
                  <!-- 左侧：基础信息 -->
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

                  <!-- 右侧：详细指令 (占据剩余高度) -->
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
           <el-button size="small" @click="skillsToExport = skillsList.map(s=>s.id)">{{ t('skills.export.selectAll') }}</el-button>
           <el-button size="small" @click="skillsToExport = []">{{ t('skills.export.clear') }}</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="showExportDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleExportSkills" :loading="isExporting" :disabled="skillsToExport.length === 0">
          {{ t('skills.export.confirmBtn') }}
        </el-button>
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
.bottom-actions-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 12px 24px;
  background-color: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-top: 1px solid var(--border-primary);
  z-index: 20;
}

html.dark .bottom-actions-container {
  background-color: rgba(23, 24, 28, 0.7);
}

.action-btn {
  flex-grow: 0;
  min-width: 180px;
  font-weight: 500;
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

/* 分栏布局 */
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

/* 右侧列相关样式 */
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

/* ================== 统一文本框样式 (Scrollbar + Input) ================== */

/* 1. 统一的滚动条包裹容器：负责提供边框、背景和圆角 */
.textarea-scrollbar-wrapper {
  width: 100%;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  background-color: var(--bg-tertiary);
  transition: border-color 0.2s;
  box-sizing: border-box;
}

/* 聚焦时高亮容器边框 */
.textarea-scrollbar-wrapper:focus-within {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

/* 右侧全高修饰符 */
.textarea-scrollbar-wrapper.full-height {
  height: 100%;
}

/* 2. 内部透明 Input：完全透明，无边框，无原生滚动条 */
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

/* 移除 Input 自身可能的原生滚动条 */
.transparent-textarea :deep(.el-textarea__inner::-webkit-scrollbar) {
  display: none;
}

/* 调整 el-scrollbar 内部视图的 padding */
:deep(.textarea-scrollbar-view) {
  padding-right: 2px;
}

/* --- 滚动条滑块样式适配 --- */

/* 浅色模式 */
:deep(.textarea-scrollbar-wrapper .el-scrollbar__thumb) {
  background-color: var(--el-text-color-disabled) !important;
  opacity: 0.5;
}

:deep(.textarea-scrollbar-wrapper .el-scrollbar__thumb:hover) {
  background-color: var(--el-text-color-secondary) !important;
  opacity: 0.8;
}

/* 深色模式覆盖 */
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

/* 强制等宽字体 */
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

/* ================== 文件管理 Tab ================== */
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

/* 移除 Tab 内容区的默认 padding，让其撑满 */
.skill-edit-tabs :deep(.el-tabs__content) {
  padding: 0;
}

/* 调整对话框 Header 的布局以适配 flex */
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
</style>