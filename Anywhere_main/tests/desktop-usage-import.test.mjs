import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'

const source = await fs.readFile(new URL('../src/components/Setting.vue', import.meta.url), 'utf8')
const start = source.indexOf('function importConfig()')
const end = source.indexOf('\n}', start)
assert.ok(start >= 0 && end > start)
let input, received
const backup = { providers: { p: { name: 'Provider' } }, prompts: { AI: {} }, usageStatistics: { version: 1, records: [{ id: 'desktop-only' }] } }
const api = { updateConfig: async (config) => { received = config }, getConfig: async () => ({ config: {} }) }
const sandbox = vm.createContext({
  window: { api }, document: { createElement() { input = { click() {} }; return input } },
  FileReader: class { readAsText() { return this.onload({ target: { result: JSON.stringify(backup) } }) } },
  currentConfig: { value: { webdav: { localChatPath: 'local-plugin-path' }, skillPath: 'local-skills' } },
  ElMessage: { success() {}, error() { assert.fail('Import must not fail') } },
  initCardOrder() {}, t: (key) => key, console
})
vm.runInContext(source.slice(start, end + 2) + '\nthis.importConfig = importConfig', sandbox)
sandbox.importConfig()
await input.onchange({ target: { files: [{}] } })
await new Promise((resolve) => setImmediate(resolve))
assert.ok(received)
assert.equal(received.config.usageStatistics, undefined)
assert.equal(received.config.providers.p.name, 'Provider')
assert.equal(received.config.webdav.localChatPath, 'local-plugin-path')
assert.equal(received.config.skillPath, 'local-skills')
console.log('Plugin real config importer: desktop statistics ignored, ordinary config/local paths preserved')
