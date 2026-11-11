const ID_PATTERN = /^[A-Za-z0-9._:-]{16,160}$/;

export function normalizeConversationId(value) {
  return typeof value === "string" && ID_PATTERN.test(value.trim())
    ? value.trim()
    : "";
}

export function formatConversationReference(title, conversationId) {
  const id = normalizeConversationId(conversationId);
  if (!id) return "";
  const label =
    (typeof title === "string" ? title : "").replace(/[\r\n]+/g, " ").trim() ||
    "未命名会话";
  const escaped = label.replace(/\\|\[|\]/g, (char) => `\\${char}`);
  return `[${escaped}-ID](${id})`;
}

export function localConversationId(storage) {
  return storage?.format === "sqlite" &&
    storage?.storageMode !== "cloud" &&
    storage?.dirPath
    ? normalizeConversationId(storage.conversationId)
    : "";
}
