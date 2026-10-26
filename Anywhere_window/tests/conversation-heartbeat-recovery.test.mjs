import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'

const sourcePath = process.argv[2] || new URL('../src/App.vue', import.meta.url)
const source = await fs.readFile(sourcePath, 'utf8')
const start = source.indexOf('    let heartbeatInFlight = false;')
assert.ok(start >= 0, 'guarded heartbeat must be installed')
const block = source.slice(start, source.indexOf('    }, 5000);', start) + '    }, 5000);'.length)
let now = 100_000
const NativeDate = Date
class Clock extends NativeDate { static now() { return now } }
function harness() {
  const warnings = []
  let tick, stopped = false, response = async () => ({ ok: true, expiresAt: new NativeDate(now + 30_000).toISOString() })
  const lease = { leaseEpoch: 1, expiresAt: new NativeDate(now + 30_000).toISOString() }
  const context = {
    Date: Clock, Number, Error, conversationInstanceId: 'synthetic-holder',
    conversationLease: { value: lease },
    currentConversationStorage: { value: { conversationId: 'synthetic', dirPath: 'synthetic-dir' } },
    currentConfig: { value: {} }, conversationReadOnly: { value: false }, conversationLeasePending: { value: false },
    window: { api: { heartbeatConversationWriteLease: (...args) => response(...args) } },
    showDismissibleMessage: { warning: text => warnings.push(text) },
    stopConversationLeaseHeartbeat: () => { stopped = true },
    setInterval: fn => { tick = fn; return 1 }, conversationLeaseHeartbeatTimer: null
  }
  vm.runInNewContext(block, context)
  return { context, lease, tick: () => tick(), warnings, stopped: () => stopped, respond: fn => { response = fn } }
}
const h = harness()
h.respond(async () => { throw new Error('synthetic SQLITE_BUSY / IPC unavailable') })
await h.tick()
assert.equal(h.context.conversationReadOnly.value, false)
assert.equal(h.context.conversationLease.value, h.lease)
assert.equal(h.context.conversationLeasePending.value, false)
now += 31_000
await h.tick()
assert.equal(h.context.conversationLeasePending.value, true, 'expired confirmed lease pauses writes')
assert.equal(h.stopped(), false, 'transient errors must keep retrying')
h.respond(async () => ({ ok: true, expiresAt: new NativeDate(now + 30_000).toISOString() }))
await h.tick()
assert.equal(h.context.conversationLeasePending.value, false, 'same epoch renewal recovers without reopening')
assert.equal(h.lease.expiresAt, new NativeDate(now + 30_000).toISOString())
h.respond(async () => ({ ok: false }))
await h.tick()
assert.equal(h.context.conversationReadOnly.value, true)
assert.equal(h.context.conversationLease.value, null)
assert.equal(h.stopped(), true)

const stale = harness()
let resolve, calls = 0
stale.respond(() => { calls++; return new Promise(yes => { resolve = yes }) })
const pending = stale.tick()
await stale.tick()
assert.equal(calls, 1, 'heartbeats cannot overlap')
stale.context.conversationLease.value = { leaseEpoch: 2 }
resolve({ ok: false })
await pending
assert.equal(stale.context.conversationReadOnly.value, false, 'late old-epoch reply cannot revoke new lease')
assert.equal(stale.context.conversationLease.value.leaseEpoch, 2)

const hung = harness()
let finishHung
hung.respond(() => new Promise(yes => { finishHung = yes }))
const hungRequest = hung.tick()
now += 31_000
await hung.tick()
assert.equal(hung.context.conversationLeasePending.value, true, 'in-flight hung heartbeat cannot permit writes past expiry')
finishHung({ok: true, expiresAt: new NativeDate(now + 30_000).toISOString()})
await hungRequest
assert.equal(hung.context.conversationLeasePending.value, false)
const accessBlock = source.slice(source.indexOf('const ensureConversationWriteAccess ='), source.indexOf('\n};', source.indexOf('const ensureConversationWriteAccess =')) + 3)
const checkAccess = vm.runInNewContext(`${accessBlock}; ensureConversationWriteAccess`, hung.context)
hung.lease.expiresAt = new NativeDate(now - 1).toISOString()
assert.equal(checkAccess(), false, 'write gate checks confirmed expiry even before next timer fires')


const closed = harness()
closed.respond(() => new Promise(yes => { resolve = yes }))
const old = closed.tick()
closed.context.conversationLease.value = null
resolve({ ok: false })
await old
assert.equal(closed.context.conversationReadOnly.value, false, 'late release reply cannot alter closed window state')
const malformed = harness()
malformed.respond(async () => undefined)
await malformed.tick()
assert.equal(malformed.context.conversationReadOnly.value, false, 'malformed IPC is not confirmed ownership loss')
console.log('PASS heartbeat transient/expiry/recovery/confirmed-loss/single-flight/stale-release guards')
