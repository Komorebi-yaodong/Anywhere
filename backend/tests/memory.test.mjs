import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { MEMORY_TOOLS, createMemoryHandlers, memorySummaryDescription } from '../src/memory.js'

const docs = new Map([
  ['anywhere_mem_old', { _id: 'anywhere_mem_old', name: 'Old role', sections: { Main: 'alpha beta alpha', Items: [{ name: 'same one', value: 1 }, { name: 'same two', value: 2 }] } }],
  ['anywhere_mem_other', { _id: 'anywhere_mem_other', name: 'Other role', description: 'unrelated role', sections: { Main: 'alpha SECRET_OTHER_ROLE' } }]
])
const copy = value => value === undefined ? null : JSON.parse(JSON.stringify(value))
const locks = new Map()
let counter = 0, failPut = false, failRemove = false
const handlers = createMemoryHandlers({
  get: async id => copy(docs.get(id)),
  put: async doc => {
    if (failPut) return { ok: false, error: 'synthetic write failure' }
    docs.set(doc._id, copy(doc)); return { ok: true }
  },
  remove: async id => {
    if (failRemove) return { ok: false, error: 'synthetic remove failure' }
    docs.delete(id); return { ok: true }
  },
  acquireLock: async id => {
    const previous = locks.get(id) || Promise.resolve()
    let release
    const current = new Promise(resolve => { release = resolve })
    locks.set(id, current)
    await previous
    return () => { if (locks.get(id) === current) locks.delete(id); release() }
  },
  makeId: () => `new-${counter++}`
})
const call = (name, args) => handlers[name](args)
const error = async (name, args, pattern = /^Error:/) => assert.match(await call(name, args), pattern)
assert.equal(MEMORY_TOOLS.length, 15)
assert.equal(MEMORY_TOOLS.some(t => t.name === 'list_memories'), false)
assert.equal(handlers.list_memories, undefined)
assert.match(await call('get_memory_summary', { memory_id: 'old' }), /Description: \n/)
assert.match(await call('get_full_memory', { memory_id: 'old' }), /alpha beta alpha/)
const index = memorySummaryDescription([...docs.values(), { _id: 'not_memory', name: 'hidden' }])
assert.match(index, /Old role/); assert.doesNotMatch(index, /SECRET_OTHER_ROLE|hidden|alpha beta/)
assert.match(await call('create_memory', { name: 'Synthetic', description: 'purpose', content: 'body' }), /new-0/)
assert.equal(docs.get('anywhere_mem_new-0').description, 'purpose')
assert.equal(await call('update_memory', { memory_id: 'old', name: 'Renamed role', description: 'new purpose' }), 'Updated.')
assert.equal(docs.get('anywhere_mem_old').name, 'Renamed role')
assert.equal(docs.get('anywhere_mem_old').sections.Main, 'alpha beta alpha')
assert.match(memorySummaryDescription([...docs.values()]), /new purpose/)
assert.doesNotMatch(memorySummaryDescription([...docs.values()]), /Old role/)
await error('update_memory', { memory_id: 'old' })
await error('update_memory', { memory_id: 'old', name: '' })
await call('update_memory', { memory_id: 'old', description: '' })
assert.equal(docs.get('anywhere_mem_old').description, '')
await error('replace_memory_text', { memory_id: 'old', section: 'Main', old_text: 'alpha', new_text: 'x' }, /Ambiguous/)
await error('replace_memory_text', { memory_id: 'old', section: 'Main', old_text: '', new_text: 'x' })
await error('replace_memory_text', { memory_id: 'old', section: 'Main', old_text: 'missing', new_text: 'x' })
await call('replace_memory_text', { memory_id: 'old', section: 'Main', old_text: 'beta', new_text: '$& literal' })
assert.equal(docs.get('anywhere_mem_old').sections.Main, 'alpha $& literal alpha')
await call('replace_memory_text', { memory_id: 'old', section: 'Main', old_text: 'alpha', new_text: 'gamma', replace_all: true })
assert.equal(docs.get('anywhere_mem_old').sections.Main, 'gamma $& literal gamma')
await call('update_section', { memory_id: 'old', section: 'Overlap', content: 'aaa', mode: 'replace' })
await error('replace_memory_text', { memory_id: 'old', section: 'Overlap', old_text: 'aa', new_text: 'b' }, /Ambiguous/)
await call('delete_section', { memory_id: 'old', section: 'Overlap' })
await call('rename_section', { memory_id: 'old', section: 'Main', new_name: 'Notes' })
assert.equal(docs.get('anywhere_mem_old').sections.Main, undefined)
await error('rename_section', { memory_id: 'old', section: 'Notes', new_name: 'Items' })
await error('delete_section', { memory_id: 'old', section: 'unknown' })
await call('delete_section', { memory_id: 'old', section: 'Notes' })
assert.equal(docs.get('anywhere_mem_old').sections.Notes, undefined)
await call('update_section', { memory_id: 'old', section: '__proto__', content: 'safe value' })
assert.equal(({}).polluted, undefined)
assert.equal(await call('get_section', { memory_id: 'old', section: '__proto__' }), 'safe value')
await error('update_section', { memory_id: 'old', section: 'toString', content: 'bad', mode: 'oops' })
for (const name of ['update_list_item', 'delete_list_item']) {
  await error(name, { memory_id: 'old', section: 'Items', item_identifier: 'same', updates: {} }, /Ambiguous/)
}
await error('move_list_item', { memory_id: 'old', from_section: 'Items', to_section: 'New', item_identifier: 'same' }, /Ambiguous/)
assert.equal(docs.get('anywhere_mem_old').sections.New, undefined)
await error('delete_list_item', { memory_id: 'old', section: 'Items', item_index: 8 })
await error('delete_list_item', { memory_id: 'old', section: 'Items', item_index: 0, item_identifier: 'same one' })
await call('update_list_item', { memory_id: 'old', section: 'Items', item_identifier: 'same one', updates: { value: 3 } })
await call('delete_list_item', { memory_id: 'old', section: 'Items', item_index: 1 })
assert.equal(docs.get('anywhere_mem_old').sections.Items.length, 1)
await call('move_list_item', { memory_id: 'old', from_section: 'Items', to_section: 'Moved', item_index: 0 })
assert.deepEqual(docs.get('anywhere_mem_old').sections.Moved, [{ name: 'same one', value: 3 }])
await Promise.all(Array.from({ length: 10 }, (_, i) => call('add_to_list', { memory_id: 'old', section: 'Queue', item: { i } })))
assert.equal(docs.get('anywhere_mem_old').sections.Queue.length, 10)
failPut = true
await error('update_memory', { memory_id: 'old', name: 'must not persist' })
assert.equal(docs.get('anywhere_mem_old').name, 'Renamed role')
failPut = false; failRemove = true
await error('delete_memory', { memory_id: 'new-0' })
assert.ok(docs.has('anywhere_mem_new-0'))
failRemove = false
await call('delete_memory', { memory_id: 'new-0' })
assert.doesNotMatch(memorySummaryDescription([...docs.values()]), /Synthetic/)

await call('update_section', { memory_id: 'old', section: 'Search', content: 'alpha '.repeat(400), mode: 'replace' })
const args = { memory_id: 'old', query: 'ALPHA', limit: 2, snippet_length: 40 }
const first = await call('search_within_memory', args)
assert.equal(first.results.length, 2); assert.equal(first.has_more, true); assert.equal(first.next_offset, 2)
assert.ok(first.results.every(r => r.memory_id === 'old' && r.snippet.length <= 40))
const second = await call('search_within_memory', { ...args, offset: first.next_offset })
assert.notEqual(first.results[0].position, second.results[0].position)
assert.doesNotMatch(JSON.stringify(first), /SECRET_OTHER_ROLE/)
const multi = await call('search_within_memory', { memory_ids: ['old', 'other'], query: 'SECRET_OTHER_ROLE' })
assert.equal(multi.results[0].memory_id, 'other')
for (const a of [{ query: 'x' }, { memory_id: 'old', memory_ids: ['other'], query: 'x' }, { memory_ids: [], query: 'x' }, { memory_id: 'old', query: ' ' }, { memory_ids: ['old', 'missing'], query: 'alpha', limit: 1 }]) await error('search_within_memory', a)
const bounded = await call('search_within_memory', { memory_id: 'old', query: 'alpha', limit: 50, snippet_length: 1000, max_chars: 1000 })
assert.ok(JSON.stringify(bounded, null, 2).length <= 1000)
assert.ok(bounded.results.length > 0); assert.equal(bounded.has_more, true); assert.equal(bounded.truncated, true)
assert.ok(bounded.next_offset > 0)
assert.equal(locks.size, 0)

// Execute actual renderer request-time refresh in isolation. No host app, real DB or provider.
const rendererPath = process.argv[2] || new URL('../../Anywhere_window/src/App.vue', import.meta.url)
const renderer = await readFile(rendererPath, 'utf8')
const start = renderer.indexOf('const getRequestMcpTools =')
const end = renderer.indexOf('\n};', start) + 3
assert.ok(start >= 0 && end > start)
let refreshes = 0
const context = {
  sessionMcpServerIds: { value: ['builtin_memory'] },
  openaiFormattedTools: { value: [{ type: 'function', function: { name: 'summary_alias', description: 'stale', parameters: {} } }, { type: 'function', function: { name: 'external', description: 'untouched' } }] },
  window: { api: { refreshMemoryTools: async () => { refreshes++; return [{ name: 'summary_alias', description: `fresh-${refreshes}` }] } } }
}
const refresh = vm.runInNewContext(`${renderer.slice(start, end)}; getRequestMcpTools`, context)
assert.equal((await refresh())[0].function.description, 'fresh-1')
assert.equal((await refresh())[0].function.description, 'fresh-2')
assert.equal(context.openaiFormattedTools.value[1].function.description, 'untouched')
context.sessionMcpServerIds.value = []
await refresh(); assert.equal(refreshes, 2)
assert.ok((renderer.match(/let activeTools = await getRequestMcpTools\(\)/g) || []).length === 2)
console.log('PASS memory compatibility/metadata discovery/exact edits/deletion/ambiguity/locking/storage errors/bounded scoped search/renderer refresh')
