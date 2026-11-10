const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

// Only replace after a complete write + flush + validation. In particular, never unlink the
// destination to work around Windows sharing/antivirus errors: keep the previous good file.
async function writeDurableFile(filePath, bytes, validate = () => {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  let handle
  try {
    handle = await fs.open(temporary, 'wx', 0o600)
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = null
    validate(await fs.readFile(temporary))
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(temporary, filePath); break }
      catch (error) {
        if (!['EPERM', 'EACCES', 'EEXIST', 'EBUSY'].includes(error?.code) || attempt >= 6) throw error
        await wait(40 * (attempt + 1))
      }
    }
    // POSIX directory fsync persists the rename; Windows does not expose directory flushing.
    if (process.platform !== 'win32') {
      const directory = await fs.open(path.dirname(filePath), 'r')
      try { await directory.sync() } finally { await directory.close() }
    }
  } finally {
    await handle?.close().catch(() => {})
    await fs.rm(temporary, { force: true }).catch(() => {})
  }
}

// A filesystem lock covers separate renderer/helper processes, not only one JS module's queue.
// A living owner is never evicted by elapsed time. Crash leftovers are recovered by PID liveness.
async function withFileTransaction(filePath, execute) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const lock = `${filePath}.write-lock`
  const token = `${process.pid}-${randomUUID()}.owner`
  const claim = `${lock}.${token}.claim`
  const deadline = Date.now() + 15000
  let acquired = false
  await fs.mkdir(claim, { mode: 0o700 })
  try {
    const handle = await fs.open(path.join(claim, token), 'wx', 0o600)
    try { await handle.writeFile(String(process.pid)); await handle.sync() } finally { await handle.close() }
    while (!acquired) {
      try {
        await fs.rename(claim, lock)
        acquired = true
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES', 'EBUSY'].includes(error?.code)) throw error
        try {
          const owners = await fs.readdir(lock)
          // Publication always contains an owner; an empty shared directory can only be a
          // release/reclamation interrupted by a crash. rmdir cannot remove a new nonempty owner.
          if (owners.length === 0) await fs.rmdir(lock)
          if (owners.length === 1 && /^\d+-[a-f0-9-]+\.owner$/.test(owners[0])) {
            const pid = Number(owners[0].split('-')[0])
            let alive = true
            try { process.kill(pid, 0) } catch (probe) { if (probe?.code === 'ESRCH') alive = false }
            if (!alive) {
              // Only the reclaimer removing the unique old owner may remove that generation.
              await fs.unlink(path.join(lock, owners[0]))
              await fs.rmdir(lock)
            }
          }
        } catch { /* Unknown/permission failures never authorize stealing a writer's lock. */ }
        if (Date.now() >= deadline) throw new Error('local_file_transaction_busy')
        await wait(30 + Math.floor(Math.random() * 40))
      }
    }
    return await execute()
  } finally {
    const directory = acquired ? lock : claim
    try { await fs.unlink(path.join(directory, token)); await fs.rmdir(directory) }
    catch (error) { if (error?.code !== 'ENOENT') console.warn('[storage] lock cleanup failed:', error?.code || 'unknown') }
  }
}

module.exports = { writeDurableFile, withFileTransaction };
