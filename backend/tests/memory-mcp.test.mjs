import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { MEMORY_TOOLS, createMemoryHandlers, memorySummaryDescription } from '../src/memory.js'

const builtinPath = process.argv[2] || new URL('../src/mcp_builtin.js', import.meta.url)
const mcpPath = process.argv[3] || new URL('../src/mcp.js', import.meta.url)
const builtin = await readFile(builtinPath, 'utf8')
const mcp = await readFile(mcpPath, 'utf8')
const desktop = builtin.includes('async function getBuiltinTools(')
const records = new Map([['anywhere_mem_fixture', { _id: 'anywhere_mem_fixture', name: 'Role A', description: 'purpose A', sections: { Main: 'NEVER_IN_INDEX' } }]])
let writesFail = false
const store = {
  get: async id => records.has(id) ? JSON.parse(JSON.stringify(records.get(id))) : null,
  put: async doc => { if (writesFail) return { ok: false, error: 'write failed' }; records.set(doc._id, doc); return { ok: true } },
  remove: async id => { records.delete(id); return { ok: true } }
}
const context = {
  MEMORY_TOOLS, createMemoryHandlers, memorySummaryDescription,
  BUILTIN_TOOLS: { builtin_memory: MEMORY_TOOLS },
  acquireLock: async () => () => {},
  dbGet: async id => ({ ok: records.has(id), doc: await store.get(id) }),
  dbPut: store.put, dbRemove: store.remove,
  dbAllDocs: async () => ({ rows: [...records.values()].map(doc => ({ doc })) }),
  utools: { db: { promises: store, allDocs: () => [...records.values()] } }
}
const handlerStart = builtin.indexOf('    ...createMemoryHandlers({')
const handlerEnd = builtin.indexOf('\n};', handlerStart)
assert.ok(handlerStart > 0 && handlerEnd > handlerStart)
vm.createContext(context)
vm.runInContext(`const handlers = {${builtin.slice(handlerStart, handlerEnd)}\n};`, context)
const getStart = builtin.indexOf(desktop ? 'async function getBuiltinTools(' : 'function getBuiltinTools(')
const getEnd = builtin.indexOf('async function invokeBuiltinTool(', getStart)
const invokeEnd = builtin.indexOf('function killAllBackgroundShells(', getEnd)
vm.runInContext(builtin.slice(getStart, getEnd), context)
vm.runInContext(builtin.slice(getEnd, invokeEnd), context)
const getTools = context.getBuiltinTools, invoke = context.invokeBuiltinTool
const tools = await getTools('builtin_memory')
assert.equal(tools.length, 15)
assert.equal(tools.some(t => t.name === 'list_memories'), false)
assert.ok(tools.some(t => t.name === 'delete_list_item'))
assert.match(tools.find(t => t.name === 'get_memory_summary').description, /purpose A/)
assert.doesNotMatch(tools.find(t => t.name === 'get_memory_summary').description, /NEVER_IN_INDEX/)
const unpack = result => JSON.parse(result)[0].text
assert.match(unpack(await invoke('get_memory_summary', { memory_id: 'fixture' })), /Role A/)
assert.equal(unpack(await invoke('update_memory', { memory_id: 'fixture', name: 'Role B', description: 'purpose B' })), 'Updated.')
assert.equal(records.get('anywhere_mem_fixture').sections.Main, 'NEVER_IN_INDEX')
await assert.rejects(() => invoke('list_memories', {}), /not found/)
writesFail = true
assert.match(unpack(await invoke('update_memory', { memory_id: 'fixture', name: 'must fail' })), /Error:/)
assert.equal(records.get('anywhere_mem_fixture').name, 'Role B')
writesFail = false
// Deep copies prevent prior definitions from accumulating or changing across loads.
const fresh = await getTools('builtin_memory')
assert.match(fresh.find(t => t.name === 'get_memory_summary').description, /purpose B/)
assert.doesNotMatch(fresh.find(t => t.name === 'get_memory_summary').description, /purpose A/)
assert.match(tools.find(t => t.name === 'get_memory_summary').description, /purpose A/)
assert.equal((fresh.find(t => t.name === 'get_memory_summary').description.match(/AVAILABLE MEMORIES/g) || []).length, 1)

const info = { isBuiltin: true, serverConfig: { id: 'builtin_memory' }, rawName: 'get_memory_summary', description: 'stale', enabled: false }
const foreign = { isBuiltin: false, serverConfig: { id: 'external' }, rawName: 'get_memory_summary', description: 'external' }
const map = new Map([['summary_alias', info], ['external_alias', foreign]])
context.getSessionKey = key => key
context.getSessionRuntime = key => key === 'fixture-window' ? { fullToolInfoMap: map } : null
context.fullToolInfoMap = map
const refreshStart = mcp.indexOf(desktop ? 'export async function refreshMemoryTools(' : 'async function refreshMemoryTools(')
const refreshEnd = mcp.indexOf('function buildOpenaiFormattedTools(', refreshStart)
vm.runInContext(mcp.slice(refreshStart, refreshEnd).replace('export ', ''), context)
const updates = await context.refreshMemoryTools('fixture-window')
assert.equal(updates.length, 1); assert.equal(updates[0].name, 'summary_alias')
assert.match(updates[0].description, /purpose B/)
assert.equal(info.enabled, false); assert.equal(foreign.description, 'external')
if (desktop) assert.equal((await context.refreshMemoryTools('unknown-window')).length, 0)
await invoke('delete_memory', { memory_id: 'fixture' })
const afterDelete = await context.refreshMemoryTools('fixture-window')
assert.doesNotMatch(afterDelete[0].description, /Role B|purpose B/)
assert.match(afterDelete[0].description, /No memories yet/)
const searchPayload = unpack(await invoke('search_within_memory', { memory_id: 'missing', query: 'x' }))
assert.match(searchPayload, /not found/)
records.set('anywhere_mem_budget', { _id: 'anywhere_mem_budget', name: 'Budget', sections: { Main: 'alpha '.repeat(500) } })
const payload = unpack(await invoke('search_within_memory', { memory_id: 'budget', query: 'alpha', max_chars: 1000, snippet_length: 1000, limit: 50 }))
assert.ok(payload.length <= 1000)
assert.ok(JSON.parse(payload).results.length > 0)
if (desktop) {
  const ipc = await readFile(new URL('../main/ipcHandler.js', import.meta.url), 'utf8')
  const preload = await readFile(new URL('../preload/window_preload.js', import.meta.url), 'utf8')
  const start = ipc.indexOf("  handleInvoke('mcp:refreshMemoryTools'")
  const end = ipc.indexOf('  handleInvoke(', start + 10)
  let callback, selectedKey
  vm.runInNewContext(ipc.slice(start, end), {
    handleInvoke: (_name, handler) => { callback = handler },
    BrowserWindow: { fromWebContents: () => ({ id: 45 }) },
    mcpApi: { refreshMemoryTools: async key => { selectedKey = key; return [] } }
  })
  await callback({ sender: {} }, { sessionKey: 'window-reference' })
  assert.equal(selectedKey, 'window-reference', 'refresh must use the same logical window key as initialization')
  await callback({ sender: {} })
  assert.equal(selectedKey, '45')
  assert.match(preload, /refreshMemoryTools:.*sessionKey: senderId/)
}
console.log('PASS actual builtin schema/DB adapters/MCP wrapper/bounded payload/index freshness/deleted-tool rejection/alias state/IPC session-key refresh')
