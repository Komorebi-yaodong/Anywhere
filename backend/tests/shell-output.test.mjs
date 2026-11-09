import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { TextDecoder } from 'node:util'

const manifest = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))
const desktop = manifest.name === 'anywhere-desktop'
const source = await fs.readFile(
  new URL(desktop ? '../main/core/mcp_builtin.js' : '../src/mcp_builtin.js', import.meta.url),
  'utf8'
)
const start = source.indexOf('    execute_bash_command: async')
const end = source.indexOf('    list_background_shells:', start)
assert.ok(start > 0 && end > start)
const block = source.slice(start, end)
assert.doesNotMatch(
  block,
  /\[CWD:/,
  'the shell wrapper must not add a stale startup-directory label'
)
let output = '',
  stderr = '',
  exitCode = 0,
  processError = null,
  pid = 100
let childWindow = false
const spawned = [],
  files = new Map(),
  shells = new Map()
const context = {
  Buffer,
  TextDecoder,
  setTimeout,
  clearTimeout,
  isWin: true,
  bashCwd: 'C:\\synthetic-home',
  backgroundShells: shells,
  MAX_READ_HARD: 200000,
  COLORLESS_COMMAND_ENV: {},
  os: { tmpdir: () => 'C:\\synthetic-temp' },
  path: path.win32,
  process: { env: {}, kill: () => {} },
  crypto: { randomBytes: () => Buffer.from([1, 2, 3, 4]) },
  require: (name) => {
    if (name === 'crypto') return context.crypto
    if (name === 'child_process') return { spawn: context.spawn }
    throw new Error(`Unexpected module: ${name}`)
  },
  fs: {
    writeFileSync: (file, contents) => files.set(file, contents),
    existsSync: (file) => files.has(file) || file === 'E:\\synthetic-work',
    statSync: () => ({ isDirectory: () => true }),
    unlinkSync: (file) => files.delete(file)
  },
  isChildWindow: () => childWindow,
  callParentShell: async () => 'Parent background response',
  stripTerminalControlSequences: (value) => value,
  appendBgLog() {},
  execSync() {},
  spawn: (shell, args, options) => {
    spawned.push({ shell, args, options })
    const child = new EventEmitter()
    child.pid = pid++
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    queueMicrotask(() => {
      if (processError) child.emit('error', new Error(processError))
      else {
        if (output) child.stdout.emit('data', Buffer.from(output))
        if (stderr) child.stderr.emit('data', Buffer.from(stderr))
        child.emit('close', exitCode)
      }
    })
    return child
  }
}
const execute = vm.runInNewContext(`({${block}}).execute_bash_command`, context)
output = 'E:\\synthetic-work\r\n'
assert.equal(
  await execute({ command: "Set-Location 'E:\\synthetic-work'; (Get-Location).Path" }),
  output
)
assert.equal(
  spawned[0].options.cwd,
  context.bashCwd,
  'remove the label without changing execution policy'
)
assert.equal(files.size, 0)
output = ''
stderr = ''
assert.equal(await execute({ command: '$null = 1' }), 'Command executed successfully.')
output = 'stdout\n'
stderr = 'synthetic error'
exitCode = 1
assert.equal(
  await execute({ command: 'Write-Output stdout; Write-Error synthetic' }),
  'stdout\n\n[Stderr]:\nsynthetic error'
)
processError = 'synthetic spawn failure'
assert.equal(
  await execute({ command: 'Write-Output no' }),
  'Execution error: synthetic spawn failure'
)
processError = null
output = ''
stderr = ''
exitCode = 0
assert.equal(
  await execute({ command: "cd 'E:\\synthetic-work'" }),
  'Directory changed to: E:\\synthetic-work'
)
assert.equal(context.bashCwd, 'E:\\synthetic-work')
output = '[CWD: printed by the command itself]\n'
assert.equal(
  await execute({ command: 'Write-Output marker' }),
  output,
  'do not strip actual command content'
)
output = ''
assert.match(
  await execute({ command: 'Write-Output background', background: true }),
  /^Background process started successfully\.\nID: shell_/
)
childWindow = true
assert.equal(
  await execute({ command: 'Write-Output background', background: true }),
  'Parent background response'
)
assert.equal(files.size, 0)
console.log(
  `PASS ${desktop ? 'Desktop' : 'uTools'} shell stdout/stderr/empty/error/background/cd preserved without injected CWD prefix`
)
