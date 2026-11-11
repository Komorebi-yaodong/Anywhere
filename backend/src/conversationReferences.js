const fs = require("fs").promises;
const { readLocalProjects } = require("./projects.js");

function normalizeSummonTarget(args = {}) {
  const source =
    args && typeof args === "object" && !Array.isArray(args) ? args : {};
  if (Object.prototype.hasOwnProperty.call(source, "conversation_id")) {
    if (
      typeof source.conversation_id !== "string" ||
      !/^[A-Za-z0-9._:-]{16,160}$/.test(source.conversation_id.trim())
    )
      throw new Error("conversation_id_invalid");
    if (
      ["agent_name", "text", "file_paths", "enable_tools", "model_route"].some(
        (key) => source[key] !== undefined,
      )
    )
      throw new Error(
        "conversation_id_mode_accepts_no_agent_or_message_parameters",
      );
    return { conversationId: source.conversation_id.trim() };
  }
  if (
    typeof source.agent_name !== "string" ||
    !source.agent_name.trim() ||
    typeof source.text !== "string"
  )
    throw new Error("new_agent_requires_agent_name_and_text");
  return { agentName: source.agent_name.trim() };
}

// UI-only metadata: no SQLite opening, migration, history, or index recovery writes.
async function listConversationReferences(dirPath) {
  if (typeof dirPath !== "string" || !dirPath.trim()) return [];
  const index = await readLocalProjects(dirPath, { readOnly: true });
  const entries = await fs
    .readdir(dirPath, { withFileTypes: true })
    .catch((error) => {
      if (error?.code === "ENOENT") return [];
      throw error;
    });
  const files = new Set(
    entries.filter((item) => item.isFile()).map((item) => item.name),
  );
  return Object.values(index.conversations || {})
    .filter(
      (item) =>
        /^[A-Za-z0-9._:-]{16,160}$/.test(item.conversationId) &&
        item.storageMode !== "cloud" &&
        item.dbFile.endsWith(".db") &&
        files.has(item.dbFile),
    )
    .map((item) => ({
      conversationId: item.conversationId,
      title: item.title || "未命名会话",
      projectNames: (index.projects || [])
        .filter(
          (project) =>
            project.conversationIds?.includes(item.conversationId) ||
            project.files?.includes(item.dbFile) ||
            (item.legacyJson && project.files?.includes(item.legacyJson)),
        )
        .map((project) => project.name),
      updatedAt: item.updatedAt || "",
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

module.exports = { normalizeSummonTarget, listConversationReferences };
