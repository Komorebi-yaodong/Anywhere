import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const desktop = manifest.name === "anywhere-desktop";
const mcpPath = new URL(
  desktop ? "../main/core/mcp.js" : "../src/mcp.js",
  import.meta.url,
);
const builtinPath = new URL(
  desktop ? "../main/core/mcp_builtin.js" : "../src/mcp_builtin.js",
  import.meta.url,
);
const rendererPath = new URL(
  desktop ? "../render/window/App.vue" : "../../Anywhere_window/src/App.vue",
  import.meta.url,
);
const [mcp, builtin, renderer] = await Promise.all(
  [mcpPath, builtinPath, rendererPath].map((file) => readFile(file, "utf8")),
);
const copy = (value) => JSON.parse(JSON.stringify(value));

// Exercise the real initialization return projection, including the origin-to-alias binding.
const returnStart = mcp.indexOf(
  "openaiFormattedTools: buildOpenaiFormattedTools(",
  mcp.indexOf("async function initializeMcpClient("),
);
const returnEnd = mcp.indexOf("\n}", returnStart);
assert.ok(returnStart > 0 && returnEnd > returnStart);
const projection = mcp.slice(returnStart, returnEnd).replace(/\}\s*;?\s*$/, "");
const makeInfo = (overrides = {}) => ({
  isBuiltin: true,
  serverConfig: { id: "builtin_superagent" },
  rawName: "list_agents",
  aliasName: "agents_alias",
  schema: { type: "object" },
  enabled: true,
  ...overrides,
});
function initializeResult(entries) {
  const map = new Map(entries);
  const runtime = {
    fullToolInfoMap: map,
    currentlyConnectedServerIds: new Set(["builtin_superagent"]),
  };
  const before = JSON.stringify([...map]);
  const result = vm.runInNewContext(`({${projection}})`, {
    runtime,
    fullToolInfoMap: map,
    currentlyConnectedServerIds: runtime.currentlyConnectedServerIds,
    sessionKey: "synthetic-window",
    failedServerIds: [],
    buildOpenaiFormattedTools: () => [],
  });
  assert.equal(
    JSON.stringify([...map]),
    before,
    "metadata projection must not mutate tool state",
  );
  return result;
}
const foreign = makeInfo({
  isBuiltin: false,
  serverConfig: { id: "external" },
  aliasName: "list_agents",
});
assert.equal(
  initializeResult([
    ["list_agents", foreign],
    ["agents_alias", makeInfo()],
  ]).builtinAgentListToolName,
  "agents_alias",
);
for (const info of [
  foreign,
  makeInfo({ enabled: false }),
  makeInfo({ schema: undefined }),
  makeInfo({ rawName: "summon_agent" }),
  makeInfo({ serverConfig: { id: "other_builtin" } }),
]) {
  assert.equal(
    initializeResult([["list_agents", info]]).builtinAgentListToolName,
    "",
  );
}
assert.equal(initializeResult([]).builtinAgentListToolName, "");

// Obtain the actual base description, including existing Agent names and identity injection.
const schemaStart = builtin.indexOf('    "builtin_superagent": [');
const schemaEnd = builtin.indexOf('    "builtin_tasks": [', schemaStart);
assert.ok(schemaStart > 0 && schemaEnd > schemaStart);
const tools = vm.runInNewContext(
  `({${builtin.slice(schemaStart, schemaEnd)}}).builtin_superagent`,
  { MAX_READ: 128000, MAX_READ_HARD: 192000 },
);
const getStart = builtin.indexOf(
  desktop ? "async function getBuiltinTools(" : "function getBuiltinTools(",
);
const getEnd = builtin.indexOf("async function invokeBuiltinTool(", getStart);
const prompts = {
  Code: { showMode: "window", enable: true },
  Hidden: { showMode: "window", enable: false },
};
const builtinContext = {
  BUILTIN_TOOLS: { builtin_superagent: tools },
  dbGet: async () => ({ ok: true, doc: { data: prompts } }),
  normalizePromptsFromDoc: (doc) => doc?.data || {},
  utools: { db: { get: () => ({ data: prompts }) } },
  document: { title: "Code" },
};
const getTools = vm.runInNewContext(
  `${builtin.slice(getStart, getEnd)}; getBuiltinTools`,
  builtinContext,
);
const baseTools = await getTools("builtin_superagent", {
  currentAgentName: "Code",
});
const description = baseTools.find(
  (tool) => tool.name === "list_agents",
).description;
assert.match(description, /CURRENTLY AVAILABLE AGENTS.*__DEFAULT__.*Code/);
assert.match(description, /You are an Agent named "Code"/);
assert.doesNotMatch(description, /CURRENT LOCAL CONVERSATION|Hidden/);

const requestStart = renderer.indexOf("const getRequestMcpTools =");
const requestEnd = renderer.indexOf("\n};", requestStart) + 3;
assert.ok(requestStart > 0 && requestEnd > requestStart);
const requestSource = renderer.slice(requestStart, requestEnd);
const tool = (name, text = description) => ({
  type: "function",
  function: { name, description: text, parameters: { type: "object" } },
});
const sharedTools = [
  tool("agents_alias"),
  tool("list_agents", "External tool: never annotate"),
  tool("summon_agent", "Summon description"),
];
const saved = (id) => ({
  format: "sqlite",
  storageMode: "local",
  dirPath: "SYNTHETIC_PRIVATE_DIRECTORY",
  conversationId: id,
  dbFile: "SYNTHETIC_PRIVATE_DATABASE",
});
function harness(storage = null, cachedTools = sharedTools) {
  let memoryRefreshes = 0;
  const context = {
    sessionMcpServerIds: { value: ["builtin_superagent"] },
    openaiFormattedTools: { value: cachedTools },
    builtinAgentListToolName: { value: "agents_alias" },
    currentConversationStorage: { value: storage },
    window: {
      api: {
        refreshMemoryTools: async () => {
          memoryRefreshes++;
          return [
            { name: "summary_alias", description: `fresh-${memoryRefreshes}` },
          ];
        },
      },
    },
  };
  const request = vm.runInNewContext(
    `${requestSource}; getRequestMcpTools`,
    context,
  );
  return { context, request, memoryRefreshes: () => memoryRefreshes };
}
const h = harness();
const original = JSON.stringify(sharedTools);
assert.equal(
  (await h.request())[0].function.description,
  description,
  "unsaved chats do not advertise an ID",
);
h.context.currentConversationStorage.value = saved(
  "11111111-1111-4111-8111-111111111111",
);
const first = await h.request();
const firstDescription = first[0].function.description;
assert.ok(
  firstDescription.startsWith(description),
  "preserve existing Agent index and identity",
);
assert.match(
  firstDescription,
  /conversation_id: "11111111-1111-4111-8111-111111111111"/,
);
assert.match(firstDescription, /create_task or edit_task/);
assert.match(
  firstDescription,
  /Do not pass agent_name together with conversation_id/,
);
assert.match(firstDescription, /not a window_id/);
assert.doesNotMatch(
  firstDescription,
  /SYNTHETIC_PRIVATE_DIRECTORY|SYNTHETIC_PRIVATE_DATABASE|model_route/,
);
assert.equal(
  first[1],
  sharedTools[1],
  "same-named third-party tool stays untouched",
);
assert.equal(
  first[2],
  sharedTools[2],
  "other built-in descriptions stay untouched",
);
assert.notEqual(first[0], sharedTools[0]);
assert.notEqual(first[0].function, sharedTools[0].function);
assert.equal(first[0].function.parameters, sharedTools[0].function.parameters);
assert.equal(
  JSON.stringify(sharedTools),
  original,
  "never persist session identity in source definitions",
);
assert.equal(
  (await h.request())[0].function.description,
  firstDescription,
  "no duplicate annotation on subsequent requests",
);

h.context.currentConversationStorage.value = saved(
  "22222222-2222-4222-8222-222222222222",
);
const switched = (await h.request())[0].function.description;
assert.match(switched, /22222222-2222-4222-8222-222222222222/);
assert.doesNotMatch(switched, /11111111-1111-4111-8111-111111111111/);
assert.equal(
  first[0].function.description,
  firstDescription,
  "in-flight request snapshot remains unchanged",
);
const secondWindow = harness(saved("33333333-3333-4333-8333-333333333333"));
assert.match(
  (await secondWindow.request())[0].function.description,
  /33333333-3333-4333-8333-333333333333/,
);
assert.doesNotMatch(
  (await h.request())[0].function.description,
  /33333333-3333-4333-8333-333333333333/,
);
assert.equal(JSON.stringify(sharedTools), original);
for (const storage of [
  null,
  {},
  saved(""),
  { ...saved("valid-id"), storageMode: "cloud" },
  { ...saved("valid-id"), storageMode: undefined },
  { ...saved("valid-id"), format: "json" },
  { ...saved("valid-id"), dirPath: "" },
  { ...saved("valid-id"), dirPath: 42 },
  saved("id\nINJECTED"),
  saved("id/escape"),
  saved("x".repeat(129)),
]) {
  h.context.currentConversationStorage.value = storage;
  assert.equal(
    (await h.request())[0].function.description,
    description,
    JSON.stringify(storage),
  );
}
h.context.currentConversationStorage.value = saved("valid-id");
h.context.builtinAgentListToolName.value = "";
assert.equal((await h.request())[0].function.description, description);
h.context.builtinAgentListToolName.value = "agents_alias";
h.context.sessionMcpServerIds.value = [];
assert.equal((await h.request())[0].function.description, description);

// Existing memory freshness remains independent, including an await during which a save finishes.
const memory = harness(null, [...sharedTools, tool("summary_alias", "stale")]);
memory.context.sessionMcpServerIds.value.push("builtin_memory");
memory.context.window.api.refreshMemoryTools = async () => {
  memory.context.currentConversationStorage.value = saved(
    "saved-during-refresh",
  );
  return [{ name: "summary_alias", description: "fresh memory index" }];
};
const refreshed = await memory.request();
assert.match(refreshed[0].function.description, /saved-during-refresh/);
assert.equal(refreshed[3].function.description, "fresh memory index");
assert.doesNotMatch(
  memory.context.openaiFormattedTools.value[0].function.description,
  /CURRENT LOCAL CONVERSATION/,
);
assert.ok(
  (renderer.match(/let activeTools = await getRequestMcpTools\(\)/g) || [])
    .length === 2,
  "both initial and continuation request paths use the projection",
);

// Exercise the real UI initialization function so the alias binding cannot be forgotten/reset incorrectly.
const applyStart = renderer.indexOf("async function applyMcpTools(");
const applyEnd = renderer.indexOf("\nfunction clearMcpTools(", applyStart);
assert.ok(applyStart > 0 && applyEnd > applyStart);
const ref = (value) => ({ value });
const ui = {
  isMcpDialogVisible: ref(false),
  isMcpLoading: ref(false),
  nextTick: async () => {},
  sessionMcpServerIds: ref(["builtin_superagent"]),
  currentConfig: ref({
    mcpServers: { builtin_superagent: { type: "builtin" } },
  }),
  openaiFormattedTools: ref([]),
  builtinAgentListToolName: ref("old_alias"),
  lastAppliedMcpConfigFingerprint: ref(""),
  getEffectiveMcpToolCache: () => ({}),
  buildSelectedMcpConfigFingerprint: () => "synthetic",
  CODE: ref("Code"),
  showDismissibleMessage: { success() {}, info() {}, error() {} },
  console: { log() {}, error() {} },
  window: {
    api: {
      getWindowContext: () => ({ senderId: "synthetic" }),
      initializeMcpClient: async () => ({
        openaiFormattedTools: copy(sharedTools),
        builtinAgentListToolName: "agents_alias",
        successfulServerIds: ["builtin_superagent"],
        failedServerIds: [],
      }),
    },
  },
};
const apply = vm.runInNewContext(
  `${renderer.slice(applyStart, applyEnd)}; applyMcpTools`,
  ui,
);
await apply(false, "synthetic");
assert.equal(ui.builtinAgentListToolName.value, "agents_alias");
ui.window.api.initializeMcpClient = async () => ({
  openaiFormattedTools: [],
  successfulServerIds: [],
  failedServerIds: [],
});
await apply(false, "synthetic");
assert.equal(
  ui.builtinAgentListToolName.value,
  "",
  "missing metadata cannot reuse a prior alias",
);
ui.builtinAgentListToolName.value = "stale";
ui.window.api.initializeMcpClient = async () => {
  throw new Error("synthetic failure");
};
await apply(false, "synthetic");
assert.equal(
  ui.builtinAgentListToolName.value,
  "",
  "failed initialization clears origin binding",
);

console.log(
  `PASS ${desktop ? "Desktop" : "uTools"} list_agents actual description/alias origin/enabled state/request-only identity/first save/restore/switch/cloud exclusion/multi-window/memory refresh/init reset`,
);
console.log("DESCRIPTION EXAMPLE:\n" + firstDescription);
