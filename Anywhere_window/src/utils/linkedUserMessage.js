export function createLinkedUserMessagePair({
  storageId,
  uiId,
  historyContent,
  uiContent = historyContent,
  timestamp = '',
  historyExtras = {},
  uiExtras = {}
} = {}) {
  const normalizedStorageId = typeof storageId === 'string' ? storageId.trim() : '';
  if (!normalizedStorageId) throw new Error('user_message_storage_id_required');

  const historyMessage = {
    ...historyExtras,
    role: 'user',
    storageId: normalizedStorageId,
    content: historyContent
  };
  const uiMessage = {
    ...uiExtras,
    id: uiId,
    role: 'user',
    storageId: normalizedStorageId,
    content: uiContent
  };
  if (timestamp) uiMessage.timestamp = timestamp;

  return { storageId: normalizedStorageId, historyMessage, uiMessage };
}
