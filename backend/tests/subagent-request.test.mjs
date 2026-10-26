import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { formatSubAgentError, requestSubAgentCompletion } from '../src/subAgentRequest.js'

const keepAlive = setInterval(() => {}, 1000)
try {
  for (const status of [401, 429, 502]) {
    const logs = []
    const error = Object.assign(new Error('synthetic failure Bearer sk-test-secret'), { status })
    await assert.rejects(requestSubAgentCompletion(async () => { throw error }, { apiKey: 'sk-test-secret' }, text => logs.push(text)))
    assert.match(logs.at(-1), new RegExp(`HTTP ${status}`))
    assert.ok(!logs.join('').includes('sk-test-secret'))
  }
  assert.match(formatSubAgentError(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } })), /network_error.*ECONNRESET/)
  const logs = []
  let requestSignal
  await assert.rejects(requestSubAgentCompletion(params => { requestSignal = params.signal; return new Promise(() => {}) }, {}, text => logs.push(text), { timeoutMs: 35, progressMs: 5 }), /deadline/)
  assert.equal(requestSignal.aborted, true)
  assert.ok(logs.some(line => line.includes('[Waiting]')))
  assert.match(logs.at(-1), /SUBAGENT_REQUEST_TIMEOUT/)
  const parent = new AbortController()
  const cancelled = requestSubAgentCompletion(() => new Promise(() => {}), { signal: parent.signal }, () => {})
  parent.abort()
  await assert.rejects(cancelled, { name: 'AbortError' })
  let called = false
  await assert.rejects(requestSubAgentCompletion(() => { called = true }, { signal: parent.signal }, () => {}), { name: 'AbortError' })
  assert.equal(called, false)
  assert.deepEqual(await requestSubAgentCompletion(async () => ({ ok: true }), {}, () => {}), { ok: true })

  // Exercise real runner failure and background terminal state without provider credentials/Electron.
  const source = await fs.readFile(new URL('../src/mcp_builtin.js', import.meta.url), 'utf8')
  const plugin = source.includes("const { createChatCompletion } = require")
  const runnerStart = source.indexOf('async function runSubAgent(')
  const runner = source.slice(runnerStart, source.indexOf('// --- Execution Handlers ---', runnerStart))
    .replace("await import('./mcp.js')", "require('./mcp.js')")
  const executeStart = source.indexOf('function executeBackgroundSubAgent(')
  const execute = source.slice(executeStart, source.indexOf('async function createBackgroundSubAgent(', executeStart))
  const updates = []
  const data = { getConfig: async () => ({ config: {} }), resolveDefaultAssistantModel: () => 'provider|model' }
  const context = vm.createContext({
    ...data, require: name => name === './data.js' ? data : { invokeMcpTool: async () => { throw new Error('must not execute tools on request failure') } },
    resolveProviderConfigByModel: () => ({ baseUrl: 'https://synthetic.invalid', apiKey: 'sk-test-secret', modelName: 'model' }),
    createChatCompletion: async () => { throw Object.assign(new Error('synthetic 429 sk-test-secret'), { status: 429 }) },
    formatSubAgentError, requestSubAgentCompletion,
    normalizeSubAgentText: value => String(value), limitSubAgentLog: value => value,
    toSubAgentSnapshot: value => ({ status: value.status, error: value.error }), trimSubAgentTasks: () => {}, Date, AbortController
  })
  const start = vm.runInContext(`${runner}\n${execute}\nexecuteBackgroundSubAgent`, context)
  const task = { controller: new AbortController(), latestLog: '' }
  start(task, { task: 'synthetic', tools: [] }, { tools: [], onUpdate: (_log, snapshot) => updates.push(snapshot) })
  for (let i = 0; i < 20 && !task.finishedAt; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(task.status, 'failed')
  assert.match(task.error, /HTTP 429/)
  assert.ok(!task.latestLog.includes('sk-test-secret'))
  assert.equal(updates.at(-1).status, 'failed')
  console.log(`PASS Sub-Agent ${plugin ? 'uTools' : 'Desktop'} HTTP/network/deadline/progress/cancel/redaction/terminal-state regression`)
} finally {
  clearInterval(keepAlive)
}
