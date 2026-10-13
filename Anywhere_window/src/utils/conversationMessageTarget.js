function normalizeRenderableContent(content) {
  if (!Array.isArray(content)) return content ?? null;
  const parts = content.filter((part) => part && !part.isTranscript);
  if (parts.length > 0 && parts.every((part) => part?.type === 'text')) {
    return parts.map((part) => part.text ?? '').join('');
  }
  return parts.map((part) => (
    part?.type === 'text' ? { type: 'text', text: part.text ?? '' } : part
  ));
}

export function createRenderableMutationSignature(message = {}) {
  if (!message || !['user', 'assistant'].includes(message.role)) return '';
  return JSON.stringify({
    role: message.role,
    content: normalizeRenderableContent(message.content)
  });
}

function findCompactionIndex(fullHistory, uiMessage) {
  const snapshotId = typeof uiMessage?.snapshotId === 'string' && uiMessage.snapshotId
    ? uiMessage.snapshotId
    : (typeof uiMessage?.id === 'string' ? uiMessage.id : '');
  if (!snapshotId) return -1;
  return fullHistory.findIndex((message) => (
    message?.role === 'compaction'
    && (message?.snapshotId === snapshotId || message?.id === snapshotId)
  ));
}

function collectNeighborSignatures(chatShow = [], startIndex, step, limit = 3) {
  const anchors = [];
  for (let index = startIndex; index >= 0 && index < chatShow.length && anchors.length < limit; index += step) {
    const signature = createRenderableMutationSignature(chatShow[index]);
    if (signature) anchors.push(signature);
  }
  return anchors;
}

function matchesNeighborAnchors(fullHistory, candidateIndex, previousAnchors, nextAnchors) {
  let cursor = candidateIndex - 1;
  for (const signature of previousAnchors) {
    while (cursor >= 0 && createRenderableMutationSignature(fullHistory[cursor]) !== signature) cursor -= 1;
    if (cursor < 0) return false;
    cursor -= 1;
  }

  cursor = candidateIndex + 1;
  for (const signature of nextAnchors) {
    while (cursor < fullHistory.length && createRenderableMutationSignature(fullHistory[cursor]) !== signature) cursor += 1;
    if (cursor >= fullHistory.length) return false;
    cursor += 1;
  }
  return true;
}

function resolveUniqueAnchoredTarget(fullHistory = [], chatShow = [], showIndex = -1, targetSignature = '') {
  if (!targetSignature) return -1;
  const previousAnchors = collectNeighborSignatures(chatShow, showIndex - 1, -1);
  const nextAnchors = collectNeighborSignatures(chatShow, showIndex + 1, 1);
  const candidates = [];
  for (let index = 0; index < fullHistory.length; index += 1) {
    if (createRenderableMutationSignature(fullHistory[index]) !== targetSignature) continue;
    if (!matchesNeighborAnchors(fullHistory, index, previousAnchors, nextAnchors)) continue;
    candidates.push(index);
    if (candidates.length > 1) return -1;
  }
  return candidates.length === 1 ? candidates[0] : -1;
}

export function resolveVerifiedStorageTarget(fullHistory = [], chatShow = [], showIndex = -1) {
  const uiMessage = Array.isArray(chatShow) ? chatShow[showIndex] : null;
  if (!Array.isArray(fullHistory) || !uiMessage || typeof uiMessage !== 'object') return -1;
  if (uiMessage.role === 'compaction') return findCompactionIndex(fullHistory, uiMessage);

  const storageId = typeof uiMessage.storageId === 'string' ? uiMessage.storageId.trim() : '';
  if (!storageId) return -1;
  const candidateIndex = fullHistory.findIndex((message) => message?.storageId === storageId);
  if (candidateIndex < 0) return -1;
  const candidate = fullHistory[candidateIndex];
  const uiSignature = createRenderableMutationSignature(uiMessage);
  if (candidate?.role !== uiMessage.role || !uiSignature || createRenderableMutationSignature(candidate) !== uiSignature) return -1;

  return candidateIndex;
}

export function resolveSafeConversationMutationTarget(fullHistory = [], chatShow = [], showIndex = -1) {
  const uiMessage = Array.isArray(chatShow) ? chatShow[showIndex] : null;
  if (!uiMessage) return -1;

  const verifiedIndex = resolveVerifiedStorageTarget(fullHistory, chatShow, showIndex);
  if (verifiedIndex >= 0) return verifiedIndex;
  return resolveUniqueAnchoredTarget(fullHistory, chatShow, showIndex, createRenderableMutationSignature(uiMessage));
}
