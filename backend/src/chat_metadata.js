const yaml = require('js-yaml');

const CHAT_METADATA_VERSION = 1;

function normalizeText(value, fallback = '') {
    if (typeof value === 'string') return value;
    if (value == null) return fallback;
    return String(value);
}

function normalizeFileName(filename = '') {
    const normalized = normalizeText(filename).trim().replace(/[\\/]/g, '');
    if (!normalized) {
        throw new Error('webdav_filename_required');
    }
    return normalized;
}

function stripJsonExtension(filename = '') {
    const normalized = normalizeText(filename).trim();
    return normalized.toLowerCase().endsWith('.json') ? normalized.slice(0, -5) : normalized;
}

function isChatJsonFilename(filename = '') {
    return normalizeText(filename).trim().toLowerCase().endsWith('.json');
}

function normalizeSessionTimestamp(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value < 1e12 ? value * 1000 : value);
        return !Number.isNaN(date.getTime()) && date.getTime() > 0 ? date.toISOString() : '';
    }

    const raw = normalizeText(value).trim();
    if (!raw) return '';

    if (/^\d+$/.test(raw)) {
        const numericValue = Number(raw);
        if (Number.isFinite(numericValue) && numericValue > 0) {
            const date = new Date(raw.length <= 10 ? numericValue * 1000 : numericValue);
            if (!Number.isNaN(date.getTime()) && date.getTime() > 0) return date.toISOString();
        }
    }

    const date = new Date(raw);
    return !Number.isNaN(date.getTime()) && date.getTime() > 0 ? date.toISOString() : '';
}

function createEmptyChatMetadataIndex() {
    return {
        version: CHAT_METADATA_VERSION,
        updatedAt: '',
        chats: {}
    };
}

function normalizeChatMetadataEntry(basename = '', entry = {}) {
    const normalizedBasename = normalizeFileName(basename);
    const title = normalizeText(entry?.title).trim() || stripJsonExtension(normalizedBasename);
    const createdAt = normalizeSessionTimestamp(entry?.createdAt);
    const updatedAt = normalizeSessionTimestamp(entry?.updatedAt);

    return {
        title,
        createdAt: createdAt || updatedAt,
        updatedAt: updatedAt || createdAt
    };
}

function normalizeChatMetadataIndex(input) {
    const raw = input && typeof input === 'object' ? input : {};
    const rawChats = raw.chats && typeof raw.chats === 'object' && !Array.isArray(raw.chats)
        ? raw.chats
        : {};
    const chats = {};

    for (const [rawBasename, rawEntry] of Object.entries(rawChats)) {
        const basenameText = normalizeText(rawBasename).trim();
        if (!basenameText || !isChatJsonFilename(basenameText)) continue;
        try {
            const basename = normalizeFileName(basenameText);
            chats[basename] = normalizeChatMetadataEntry(basename, rawEntry);
        } catch {
            // ignore invalid keys
        }
    }

    const sortedChats = {};
    for (const basename of Object.keys(chats).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))) {
        sortedChats[basename] = chats[basename];
    }

    return {
        version: CHAT_METADATA_VERSION,
        updatedAt: normalizeSessionTimestamp(raw.updatedAt),
        chats: sortedChats
    };
}

function parseChatMetadataYaml(text) {
    const raw = normalizeText(text).trim();
    if (!raw) return createEmptyChatMetadataIndex();
    try {
        const parsed = yaml.load(raw);
        return normalizeChatMetadataIndex(parsed);
    } catch {
        return createEmptyChatMetadataIndex();
    }
}

function serializeChatMetadataYaml(data) {
    const normalized = normalizeChatMetadataIndex(data);
    return yaml.dump({
        version: CHAT_METADATA_VERSION,
        updatedAt: new Date().toISOString(),
        chats: normalized.chats
    }, { lineWidth: -1, noRefs: true });
}

module.exports = {
    CHAT_METADATA_VERSION,
    createEmptyChatMetadataIndex,
    normalizeSessionTimestamp,
    normalizeChatMetadataEntry,
    normalizeChatMetadataIndex,
    parseChatMetadataYaml,
    serializeChatMetadataYaml
};
