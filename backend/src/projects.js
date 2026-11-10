const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { createHash, randomUUID } = require('crypto');
const { writeDurableFile, withFileTransaction } = require('./durableFiles.js');

const PROJECTS_FILENAME = 'projects.yaml';
const PROJECTS_VERSION = 2;

function normalizeText(value, fallback = '') {
    if (typeof value === 'string') return value;
    if (value == null) return fallback;
    return String(value);
}

function normalizeTimestamp(value) {
    if (value == null || value === '') return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function slugifyProjectId(name = '') {
    const base = normalizeText(name).trim().toLowerCase();
    const slug = base.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    return slug || `project-${Date.now().toString(36)}`;
}

function emptyProjectsData() {
    return { version: PROJECTS_VERSION, conversations: {}, projects: [] };
}

function normalizeConversationEntry(rawId, rawEntry = {}) {
    const conversationId = normalizeText(rawEntry.conversationId || rawEntry.id || rawId).trim();
    const dbFile = normalizeText(rawEntry.dbFile).trim().replace(/[\\/]/g, '');
    if (!conversationId || !dbFile) return null;
    const legacyJson = normalizeText(rawEntry.legacyJson).trim().replace(/[\\/]/g, '');
    const title = normalizeText(rawEntry.title).trim();
    const createdAt = normalizeTimestamp(rawEntry.createdAt);
    const updatedAt = normalizeTimestamp(rawEntry.updatedAt);
    return {
        conversationId,
        dbFile,
        title: title || (legacyJson.toLowerCase().endsWith('.json') ? legacyJson.slice(0, -5) : conversationId),
        legacyJson,
        storageMode: normalizeText(rawEntry.storageMode, 'local').trim() || 'local',
        revision: Math.max(0, Math.floor(Number(rawEntry.revision) || 0)),
        createdAt: createdAt || updatedAt,
        updatedAt: updatedAt || createdAt,
        schemaVersion: Math.max(1, Math.floor(Number(rawEntry.schemaVersion) || 1))
    };
}

function normalizeProjects(input) {
    const data = input && typeof input === 'object' ? input : {};
    const rawConversations = data.conversations && typeof data.conversations === 'object' && !Array.isArray(data.conversations)
        ? data.conversations : {};
    const conversations = {};
    for (const [rawId, rawEntry] of Object.entries(rawConversations)) {
        const normalized = normalizeConversationEntry(rawId, rawEntry);
        if (!normalized || conversations[normalized.conversationId]) continue;
        conversations[normalized.conversationId] = normalized;
    }

    const conversationByLegacy = new Map();
    Object.values(conversations).forEach((entry) => {
        if (entry.legacyJson) conversationByLegacy.set(entry.legacyJson, entry.conversationId);
    });

    const seenFiles = new Set();
    const seenConversationIds = new Set();
    const seenIds = new Set();
    const projects = [];
    for (const rawProject of Array.isArray(data.projects) ? data.projects : []) {
        if (!rawProject || typeof rawProject !== 'object') continue;
        const name = normalizeText(rawProject.name).trim();
        let id = normalizeText(rawProject.id).trim() || slugifyProjectId(name);
        if (seenIds.has(id)) {
            let suffix = 2;
            let candidate = `${id}-${suffix}`;
            while (seenIds.has(candidate)) candidate = `${id}-${++suffix}`;
            id = candidate;
        }
        seenIds.add(id);

        const files = [];
        for (const rawFile of Array.isArray(rawProject.files) ? rawProject.files : []) {
            const basename = normalizeText(rawFile).trim();
            if (!basename || seenFiles.has(basename)) continue;
            seenFiles.add(basename);
            files.push(basename);
        }
        const conversationIds = [];
        for (const rawConversationId of Array.isArray(rawProject.conversationIds) ? rawProject.conversationIds : []) {
            const conversationId = normalizeText(rawConversationId).trim();
            if (!conversationId || !conversations[conversationId] || seenConversationIds.has(conversationId)) continue;
            seenConversationIds.add(conversationId);
            conversationIds.push(conversationId);
        }
        for (const basename of files) {
            const conversationId = conversationByLegacy.get(basename);
            if (!conversationId || seenConversationIds.has(conversationId)) continue;
            seenConversationIds.add(conversationId);
            conversationIds.push(conversationId);
        }
        projects.push({ id, name: name || id, files, conversationIds });
    }
    return { version: PROJECTS_VERSION, conversations, projects, ...(typeof data._localRevision === 'string' ? { _localRevision: data._localRevision } : {}) };
}

function parseProjectsYaml(text) {
  const raw = normalizeText(text).trim()
  if (!raw) throw new Error('projects_index_invalid')
  let parsed
  try { parsed = yaml.load(raw) } catch { throw new Error('projects_index_invalid') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || !Array.isArray(parsed.projects)
      || (parsed.conversations !== undefined && (!parsed.conversations || typeof parsed.conversations !== 'object' || Array.isArray(parsed.conversations)))) {
    throw new Error('projects_index_invalid')
  }
  return normalizeProjects(parsed)
}

function serializeProjectsYaml(data) {
  const normalized = normalizeProjects(data)
  delete normalized._localRevision
  return yaml.dump(normalized, { lineWidth: -1, noRefs: true })
}

function resolveLocalProjectsPath(dirPath) {
  const normalizedDir = normalizeText(dirPath).trim()
  if (!normalizedDir) throw new Error('projects_local_dir_required')
  return path.join(path.resolve(normalizedDir), PROJECTS_FILENAME)
}

function projectRevision(data) {
  // Metadata-only autosaves must not make an unchanged folder tree stale in the UI.
  return createHash('sha256').update(JSON.stringify(normalizeProjects(data).projects)).digest('hex')
}

async function readProjectsUnlocked(filePath, { recover = true } = {}) {
  let original = null
  let missing = false
  try {
    original = await fs.readFile(filePath)
    const data = parseProjectsYaml(original.toString('utf8'))
    return { ...data, _localRevision: projectRevision(data) }
  } catch (error) {
    missing = error?.code === 'ENOENT'
    if (!missing && error?.message !== 'projects_index_invalid') throw error
  }
  let lastGood
  try { lastGood = await fs.readFile(`${filePath}.last-good`) }
  catch (error) {
    if (error?.code !== 'ENOENT') throw error
    if (!missing) throw new Error('projects_index_invalid_no_backup')
    const data = emptyProjectsData()
    return { ...data, _localRevision: projectRevision(data) }
  }
  const data = parseProjectsYaml(lastGood.toString('utf8'))
  if (!recover) return { ...data, _localRevision: projectRevision(data) }
  if (original) {
    const preserved = `${filePath}.${Date.now()}.${randomUUID()}.corrupt`
    await fs.copyFile(filePath, preserved, 1)
  }
  await writeDurableFile(filePath, lastGood, value => parseProjectsYaml(value.toString('utf8')))
  return { ...data, _localRevision: projectRevision(data) }
}

async function commitProjectsUnlocked(filePath, current, next) {
  // Keep a validated rollback generation; it cannot be poisoned by malformed input.
  const bytes = serializeProjectsYaml(next)
  parseProjectsYaml(bytes)
  if (bytes === serializeProjectsYaml(current)) return { ok: true, path: filePath, data: { ...normalizeProjects(current), _localRevision: projectRevision(current) } }
  await writeDurableFile(`${filePath}.last-good`, serializeProjectsYaml(current), value => parseProjectsYaml(value.toString('utf8')))
  await writeDurableFile(filePath, bytes, value => parseProjectsYaml(value.toString('utf8')))
  return { ok: true, path: filePath, data: { ...normalizeProjects(next), _localRevision: projectRevision(next) } }
}

async function readLocalProjects(dirPath, { readOnly = false } = {}) {
  if (!normalizeText(dirPath).trim()) return emptyProjectsData()
  const filePath = resolveLocalProjectsPath(dirPath)
  if (readOnly) return readProjectsUnlocked(filePath, { recover: false })
  return withFileTransaction(filePath, () => readProjectsUnlocked(filePath))
}

// All internal changes apply a delta to the current index under the same cross-process lock.
async function mutateLocalProjects(dirPath, mutate) {
  const filePath = resolveLocalProjectsPath(dirPath)
  return withFileTransaction(filePath, async () => {
    const current = await readProjectsUnlocked(filePath)
    const next = await mutate(current)
    return commitProjectsUnlocked(filePath, current, next)
  })
}

async function writeLocalProjects(dirPath, data) {
  return mutateLocalProjects(dirPath, current => {
    if (data?._localRevision !== current._localRevision) throw new Error('项目目录已更新，请刷新后重试 (projects_index_conflict)')
    // Folder edits must never replace the database descriptor registry with a UI snapshot.
    return { ...current, projects: normalizeProjects({ ...data, conversations: current.conversations }).projects }
  })
}

async function writeLocalProjectsBestEffort(dirPath, mutate) {
  try {
    await mutateLocalProjects(dirPath, mutate)
    return null
  } catch (error) {
    console.warn('[conversation] SQLite commit succeeded but projects index sync failed:', error?.code || 'index_sync_failed')
    return { code: 'conversation_index_sync_failed', message: 'conversation_saved_but_index_sync_failed' }
  }
}

function removeBasenameFromProjects(projects, basename) {
    const target = normalizeText(basename).trim();
    return target ? projects.map((project) => ({ ...project, files: project.files.filter((file) => file !== target) })) : projects;
}

function removeConversationFromProjects(projects, conversationId) {
    const target = normalizeText(conversationId).trim();
    return target ? projects.map((project) => ({ ...project, conversationIds: project.conversationIds.filter((id) => id !== target) })) : projects;
}

function mergeFileAssignment(input, { basename, projectId, projectName } = {}) {
    const data = normalizeProjects(input);
    const target = normalizeText(basename).trim();
    if (!target) return data;
    const mappedConversationId = Object.values(data.conversations).find((entry) => entry.legacyJson === target)?.conversationId || '';
    let projects = removeBasenameFromProjects(data.projects, target);
    if (mappedConversationId) projects = removeConversationFromProjects(projects, mappedConversationId);
    const normalizedProjectId = normalizeText(projectId).trim();
    if (!normalizedProjectId) return normalizeProjects({ ...data, projects });
    let found = false;
    projects = projects.map((project) => {
        if (project.id !== normalizedProjectId) return project;
        found = true;
        return {
            ...project,
            files: [...project.files, target],
            conversationIds: mappedConversationId ? [...project.conversationIds, mappedConversationId] : project.conversationIds
        };
    });
    if (!found) projects.push({ id: normalizedProjectId, name: normalizeText(projectName).trim() || normalizedProjectId, files: [target], conversationIds: mappedConversationId ? [mappedConversationId] : [] });
    return normalizeProjects({ ...data, projects });
}

function mergeProjectAssignment(input, project = {}) {
    const data = normalizeProjects(input);
    const projectId = normalizeText(project.id).trim();
    if (!projectId) return data;
    const projectName = normalizeText(project.name).trim() || projectId;
    const incomingFiles = Array.isArray(project.files) ? project.files.map((file) => normalizeText(file).trim()).filter(Boolean) : [];
    const incomingConversationIds = Array.isArray(project.conversationIds)
        ? project.conversationIds.map((id) => normalizeText(id).trim()).filter((id) => data.conversations[id]) : [];
    const incomingFileSet = new Set(incomingFiles);
    const incomingConversationSet = new Set(incomingConversationIds);
    let projects = data.projects.map((existing) => ({
        ...existing,
        files: existing.files.filter((file) => !incomingFileSet.has(file)),
        conversationIds: existing.conversationIds.filter((id) => !incomingConversationSet.has(id))
    }));
    let found = false;
    projects = projects.map((existing) => {
        if (existing.id !== projectId) return existing;
        found = true;
        return { ...existing, name: projectName, files: incomingFiles, conversationIds: incomingConversationIds };
    });
    if (!found) projects.push({ id: projectId, name: projectName, files: incomingFiles, conversationIds: incomingConversationIds });
    return normalizeProjects({ ...data, projects });
}

function registerConversation(input, descriptor = {}, { projectId = '', projectName = '' } = {}) {
    const data = normalizeProjects(input);
    const normalized = normalizeConversationEntry(descriptor.conversationId || descriptor.id, descriptor);
    if (!normalized) throw new Error('conversation_descriptor_invalid');
    const conversations = { ...data.conversations, [normalized.conversationId]: normalized };
    let projects = data.projects;
    if (projectId) {
        projects = removeConversationFromProjects(projects, normalized.conversationId);
        let found = false;
        projects = projects.map((project) => {
            if (project.id !== projectId) return project;
            found = true;
            return { ...project, conversationIds: [...project.conversationIds, normalized.conversationId] };
        });
        if (!found) projects.push({ id: projectId, name: projectName || projectId, files: [], conversationIds: [normalized.conversationId] });
    }
    return normalizeProjects({ ...data, version: PROJECTS_VERSION, conversations, projects });
}

function updateConversation(input, conversationId, patch = {}) {
    const data = normalizeProjects(input);
    const current = data.conversations[normalizeText(conversationId).trim()];
    if (!current) return data;
    if (patch.revision !== undefined && Number(patch.revision) < Number(current.revision)) return data;
    const next = normalizeConversationEntry(current.conversationId, { ...current, ...patch, conversationId: current.conversationId });
    return normalizeProjects({ ...data, conversations: { ...data.conversations, [current.conversationId]: next } });
}


function assignConversationProject(input, conversationId, projectId) {
    const data = normalizeProjects(input);
    const targetConversationId = normalizeText(conversationId).trim();
    const descriptor = data.conversations[targetConversationId];
    if (!descriptor) return data;

    const legacyAliases = new Set([
        descriptor.legacyJson,
        descriptor.dbFile,
        descriptor.title,
        descriptor.title ? `${descriptor.title}.json` : ''
    ].map((value) => normalizeText(value).trim()).filter(Boolean));
    const currentProject = data.projects.find((project) => project.conversationIds.includes(targetConversationId))
        || data.projects.find((project) => project.files.some((file) => legacyAliases.has(file)));
    const targetProjectId = projectId === undefined
        ? normalizeText(currentProject?.id).trim()
        : normalizeText(projectId).trim();

    let projects = data.projects.map((project) => ({
        ...project,
        files: project.files.filter((file) => !legacyAliases.has(file)),
        conversationIds: project.conversationIds.filter((id) => id !== targetConversationId)
    }));

    if (targetProjectId) {
        projects = projects.map((project) => project.id === targetProjectId
            ? { ...project, conversationIds: [...project.conversationIds, targetConversationId] }
            : project);
    }

    return normalizeProjects({ ...data, projects });
}

function removeConversation(input, conversationId) {
    const data = normalizeProjects(input);
    const target = normalizeText(conversationId).trim();
    if (!target || !data.conversations[target]) return data;
    const conversations = { ...data.conversations };
    delete conversations[target];
    return normalizeProjects({ ...data, conversations, projects: removeConversationFromProjects(data.projects, target) });
}

function findConversation(input, reference = '') {
    const data = normalizeProjects(input);
    const target = normalizeText(reference).trim();
    if (!target) return null;
    if (data.conversations[target]) return { ...data.conversations[target] };
    const found = Object.values(data.conversations).find((entry) => entry.dbFile === target || entry.legacyJson === target);
    return found ? { ...found } : null;
}

function findProjectByBasename(input, basename) {
    const data = normalizeProjects(input);
    const target = normalizeText(basename).trim();
    if (!target) return null;
    const conversationId = findConversation(data, target)?.conversationId || '';
    for (const project of data.projects) {
        if (project.files.includes(target) || (conversationId && project.conversationIds.includes(conversationId))) return { id: project.id, name: project.name };
    }
    return null;
}

module.exports = {
    PROJECTS_FILENAME,
    PROJECTS_VERSION,
    normalizeProjects,
    parseProjectsYaml,
    serializeProjectsYaml,
    readLocalProjects,
    writeLocalProjects,
    mutateLocalProjects,
    writeLocalProjectsBestEffort,
    mergeFileAssignment,
    mergeProjectAssignment,
    registerConversation,
    updateConversation,
    assignConversationProject,
    removeConversation,
    findConversation,
    findProjectByBasename
};
