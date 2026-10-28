import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import vm from 'node:vm'
import http from 'node:http'
import { Readable } from 'node:stream'
import { fetchWebResource } from '../src/webFetch.js'

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-web-fetch-test-'))
const downloads = path.join(temporaryRoot, 'redirected-downloads')
let checks = 0
let renders = 0
let directoryRequests = 0
const pdf = Buffer.from('%PDF-1.7\nsynthetic document\n%%EOF')
const zip = Buffer.from([0x50, 0x4b, 3, 4, 0, 1, 2, 3])
const html =
  '<!doctype html><html><head><title>Synthetic</title></head><body><article>' +
  'readable content '.repeat(80) +
  '</article></body></html>'
function headers(values) {
  return { get: (name) => values[name.toLowerCase()] ?? null }
}
function response(
  bytes,
  type = '',
  extra = {},
  { status = 200, url = 'https://synthetic.invalid/resource' } = {}
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Synthetic',
    url,
    headers: headers({ 'content-type': type, 'content-length': String(bytes.length), ...extra }),
    body: Readable.from([bytes.subarray(0, 2), bytes.subarray(2, 7), bytes.subarray(7)])
  }
}
const options = {
  getDownloadsDirectory: () => {
    directoryRequests++
    return downloads
  },
  renderHtml: async (text, url) => {
    renders++
    return `URL: ${url}\n${text}`
  }
}
const run = (result, args = {}, extra = {}) =>
  fetchWebResource(
    { url: 'https://synthetic.invalid/resource', ...args },
    {
      ...options,
      fetchImpl: async () => result,
      ...extra
    }
  )
async function saved(result, expected) {
  const data = JSON.parse(result)
  assert.equal(data.downloaded, true)
  assert.equal(data.size_bytes, expected.length)
  assert.equal(path.dirname(data.file_path), downloads)
  assert.deepEqual(await fs.readFile(data.file_path), expected)
  if (expected.length) assert.ok(!result.includes(expected.toString('base64')))
  checks++
  return data
}
async function noPartial() {
  assert.equal((await fs.readdir(downloads)).filter((name) => name.endsWith('.part')).length, 0)
  checks++
}

try {
  const pdfInfo = await saved(await run(response(pdf, 'application/pdf')), pdf)
  assert.equal(pdfInfo.filename, 'resource.pdf')
  assert.equal(pdfInfo.content_type, 'application/pdf')
  const zipInfo = await saved(
    await run(
      response(
        zip,
        'application/zip',
        {},
        { url: 'https://cdn.invalid/final/archive.zip?token=synthetic' }
      )
    ),
    zip
  )
  assert.equal(zipInfo.filename, 'archive.zip')
  assert.match(zipInfo.url, /cdn\.invalid/)
  assert.equal(renders, 0, 'Binary responses must never reach HTML conversion')

  const unicode = await saved(
    await run(
      response(pdf, 'application/pdf', {
        'content-disposition':
          "attachment; filename=legacy.pdf; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf"
      })
    ),
    pdf
  )
  assert.equal(unicode.filename, '报告.pdf')
  const invalidEncoded = await saved(
    await run(
      response(pdf, 'application/pdf', {
        'content-disposition': "attachment; filename=safe.pdf; filename*=UTF-8''%ZZ"
      })
    ),
    pdf
  )
  assert.equal(invalidEncoded.filename, 'safe.pdf')
  for (const name of [
    '../../CON.pdf',
    '..\\..\\CON.pdf',
    'NUL.pdf',
    'evil:ads.zip',
    'unsafe<>|?.pdf',
    '....',
    '长'.repeat(160) + '.pdf'
  ]) {
    const data = await saved(
      await run(
        response(pdf, 'application/pdf', {
          'content-disposition': `attachment; filename="${name}"`
        })
      ),
      pdf
    )
    assert.ok(!/[<>:"/\\|?*]/.test(data.filename))
    assert.ok(Buffer.byteLength(data.filename) < 240)
    assert.ok(!/^(CON|NUL)(?:\.|$)/i.test(data.filename))
  }
  const encodedPath = await saved(
    await run(
      response(zip, '', {}, { url: 'https://synthetic.invalid/%2e%2e%2f..%5Carchive.zip' })
    ),
    zip
  )
  assert.match(encodedPath.filename, /^archive(?: \(\d+\))?\.zip$/)
  assert.equal(await fs.readFile(pdfInfo.file_path, 'utf8'), pdf.toString())

  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () =>
      run(
        response(zip, 'application/zip', {
          'content-disposition': 'attachment; filename=concurrent.zip'
        })
      )
    )
  )
  const names = new Set()
  for (const value of concurrent) names.add((await saved(value, zip)).filename)
  assert.equal(names.size, 8, 'Concurrent downloads must not replace one another')
  await noPartial()

  const beforeText = directoryRequests
  const page = await run(response(Buffer.from(html), 'text/html'), { length: 20 })
  assert.match(page, /CONTENT TRUNCATED/)
  const next = await run(response(Buffer.from(html), 'text/html'), { length: 20, offset: 20 })
  assert.notEqual(page.slice(0, 20), next.slice(0, 20))
  assert.match(await run(response(Buffer.from('plain text'), 'text/plain')), /^plain text$/)
  assert.match(
    await run(response(Buffer.from('# Markdown\ncontent'), 'text/markdown')),
    /^# Markdown/
  )
  assert.equal(
    await run(response(Buffer.from('{"valid":true}'), 'application/json')),
    '{\n  "valid": true\n}'
  )
  assert.equal(await run(response(Buffer.from('{broken'), 'application/json')), '{broken')
  assert.equal(
    await run(response(Buffer.from('<feed>item</feed>'), 'application/xml')),
    '<feed>item</feed>'
  )
  assert.equal(await run(response(Buffer.from('unknown text'), '')), 'unknown text')
  assert.equal(directoryRequests, beforeText, 'Reading text must not resolve/create Downloads')
  checks += 9

  const forced = await saved(
    await run(response(Buffer.from(html), 'text/html'), { download: true, length: 1 }),
    Buffer.from(html)
  )
  assert.equal(forced.filename, 'resource.html')
  await saved(
    await run(
      response(Buffer.from('attachment text'), 'text/plain', {
        'content-disposition': 'attachment; filename=note.txt'
      })
    ),
    Buffer.from('attachment text')
  )
  await saved(await run(response(pdf, 'text/plain')), pdf)
  await saved(await run(response(zip, '')), zip)
  await saved(
    await run(response(Buffer.alloc(4096, 0xab), 'application/octet-stream')),
    Buffer.alloc(4096, 0xab)
  )
  // A .pdf URL that actually returns HTML must still be read (e.g. sign-in/error pages).
  assert.match(
    await run(
      response(Buffer.from(html), 'text/html', {}, { url: 'https://synthetic.invalid/report.pdf' })
    ),
    /readable content/
  )
  assert.equal(await run(response(Buffer.from(''), 'text/plain', {}, { status: 204 })), '')
  await saved(await run(response(Buffer.alloc(0), 'application/zip')), Buffer.alloc(0))

  const beforeErrors = (await fs.readdir(downloads)).sort()
  assert.match(await run(response(pdf, 'application/pdf'), { offset: 1 }), /cannot be paginated/)
  assert.match(await run(response(pdf, 'application/pdf', {}, { status: 404 })), /404/)
  assert.match(await run(response(pdf, 'application/pdf', {}, { status: 403 })), /Anti-bot/)
  assert.match(await run(response(pdf, 'application/pdf', {}, { status: 206 })), /206/)
  assert.match(
    await run(response(pdf, 'application/pdf', { 'content-length': '9999' })),
    /Incomplete download/
  )
  const broken = response(pdf, 'application/pdf')
  broken.body = Readable.from(
    (async function* () {
      yield Buffer.alloc(1024, 1)
      throw new Error('synthetic disconnect')
    })()
  )
  assert.match(await run(broken), /synthetic disconnect/)
  const cancelled = new AbortController()
  cancelled.abort()
  let networkCalled = false
  assert.match(
    await run(
      null,
      {},
      {
        signal: cancelled.signal,
        fetchImpl: async () => {
          networkCalled = true
        }
      }
    ),
    /cancelled/
  )
  assert.equal(networkCalled, false)

  // Cancel a pending body read after the exclusive temporary file has been created.
  const controller = new AbortController()
  let cancelledBody = false
  let reads = 0
  let pendingReadResolve
  const hanging = response(pdf, 'application/pdf')
  hanging.body = {
    getReader: () => ({
      read: async () => {
        if (++reads === 1) return { value: Buffer.alloc(1024, 1), done: false }
        return new Promise((resolve) => {
          pendingReadResolve = resolve
        })
      },
      cancel: async () => {
        cancelledBody = true
        pendingReadResolve?.({ done: true })
      }
    })
  }
  const waiting = run(hanging, {}, { signal: controller.signal })
  for (let index = 0; index < 200 && !pendingReadResolve; index++)
    await new Promise((resolve) => setTimeout(resolve, 5))
  assert.ok(pendingReadResolve)
  controller.abort()
  assert.match(await waiting, /cancelled/)
  assert.equal(cancelledBody, true)
  assert.match(
    await run(response(pdf, 'application/pdf'), {}, { getDownloadsDirectory: () => 'relative' }),
    /Downloads directory is unavailable/
  )
  assert.match(
    await run(response(pdf, 'application/pdf'), { url: 'file:///synthetic.pdf' }),
    /Only http/
  )
  assert.deepEqual((await fs.readdir(downloads)).sort(), beforeErrors)
  await noPartial()
  checks += 11

  // Run the actual registered handler, not just the helper: native path, fetch stack and converter wiring.
  const source = await fs.readFile(new URL('../src/mcp_builtin.js', import.meta.url), 'utf8')
  const plugin = source.includes('const { fetchWebResource } = require')
  const start = source.indexOf('    builtin_web_fetch: async (args')
  const end = source.indexOf('    // Background Sub-Agent handlers', start)
  let requestedPath
  let upstreamSignal
  let networkResult
  let conversionFailed = false
  const native = {
    getPath: (name) => {
      requestedPath = name
      return downloads
    }
  }
  const fetcher = async (url, options) => {
    upstreamSignal = options.signal
    return networkResult
  }
  const handler = vm.runInNewContext(`({${source.slice(start, end)}}).builtin_web_fetch`, {
    fetchWebResource,
    app: native,
    utools: native,
    fetchWithProxy: fetcher,
    fetch: fetcher,
    MAX_READ: 32000,
    MAX_READ_HARD: 48000,
    extractMetadata: () => ({ title: 'Synthetic', description: 'Synthetic description' }),
    convertHtmlWithMarkitdownJs: async () => {
      if (conversionFailed) throw new Error('synthetic conversion error')
      return 'converted webpage '.repeat(80)
    },
    convertHtmlToMarkdown: () => 'fallback webpage '.repeat(80),
    console: { warn() {} }
  })
  networkResult = response(pdf, 'application/pdf')
  const nativeSignal = new AbortController().signal
  await saved(await handler({ url: 'https://synthetic.invalid/document' }, null, nativeSignal), pdf)
  assert.equal(requestedPath, 'downloads')
  assert.equal(upstreamSignal, nativeSignal)
  networkResult = response(Buffer.from(html), 'text/html')
  assert.match(await handler({ url: 'https://synthetic.invalid/page' }), /converted webpage/)
  conversionFailed = true
  networkResult = response(Buffer.from(html), 'text/html')
  assert.match(await handler({ url: 'https://synthetic.invalid/page' }), /fallback webpage/)
  const definitionStart = source.lastIndexOf(
    '        {',
    source.indexOf('name: "builtin_web_fetch"')
  )
  const definitionEnd = source.indexOf('\n    ],', definitionStart)
  const definition = vm.runInNewContext(`(${source.slice(definitionStart, definitionEnd)})`, {
    MAX_READ: 32000,
    MAX_READ_HARD: 48000
  })
  assert.equal(definition.inputSchema.properties.download.type, 'boolean')
  assert.match(definition.description, /automatically saved/)
  checks += 5

  // Real HTTP redirect + streaming transfer via the environment's fetch (Electron's global fetch in host probes).
  if (typeof fetch === 'function') {
    const server = http.createServer((request, result) => {
      if (request.url === '/redirect') {
        result.writeHead(302, { location: '/streamed.zip' })
        result.end()
        return
      }
      result.writeHead(200, {
        'content-type': 'application/zip',
        'content-disposition': "attachment; filename*=UTF-8''streamed.zip",
        'content-length': zip.length
      })
      result.write(zip.subarray(0, 2))
      setTimeout(() => result.end(zip.subarray(2)), 10)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const real = await fetchWebResource(
        { url: `http://127.0.0.1:${server.address().port}/redirect` },
        { ...options, fetchImpl: fetch }
      )
      assert.equal((await saved(real, zip)).filename, 'streamed.zip')
    } finally {
      server.closeAllConnections?.()
      await new Promise((resolve) => server.close(resolve))
    }
  }

  // Force an unsupported-hardlink volume and a stalled read without waiting a real minute.
  const helperSource = await fs.readFile(
    new URL('../src/webFetch.js', import.meta.url),
    'utf8'
  )
  const helperBody = helperSource
    .replace(/^import .*\n/gm, '')
    .replace(/^const .* = require\('node:[^']+'\)\r?\n/gm, '')
    .replace(/^export /gm, '')
    .replace(/^module\.exports =.*$/gm, '')
  let timerCallback
  let timeoutBodyCancelled = false
  const unsupportedLinks = {
    constants: fsSync.constants,
    promises: {
      ...fsSync.promises,
      link: async () => {
        throw Object.assign(new Error('unsupported'), { code: 'ENOTSUP' })
      }
    }
  }
  const simulated = vm.runInNewContext(helperBody + '\nfetchWebResource', {
    fs: unsupportedLinks,
    path,
    randomUUID: () => 'synthetic-' + Math.random().toString(36).slice(2),
    Buffer,
    URL,
    setTimeout: (callback) => {
      timerCallback = callback
      return 1
    },
    clearTimeout() {}
  })
  const copy = await simulated(
    { url: 'https://synthetic.invalid/fat.zip' },
    { ...options, fetchImpl: async () => response(zip, 'application/zip') }
  )
  await saved(copy, zip)
  const stalled = response(pdf, 'application/pdf')
  stalled.body = {
    getReader: () => ({
      read: () => new Promise(() => {}),
      cancel: async () => {
        timeoutBodyCancelled = true
      }
    })
  }
  timerCallback = null
  const timeout = simulated(
    { url: 'https://synthetic.invalid/stall' },
    { ...options, fetchImpl: async () => stalled }
  )
  for (let index = 0; index < 20 && !timerCallback; index++) await Promise.resolve()
  assert.ok(timerCallback)
  timerCallback()
  assert.match(await timeout, /stalled for 60 seconds/)
  assert.equal(timeoutBodyCancelled, true)
  await noPartial()
  checks += 2
  console.log(
    `PASS ${plugin ? 'uTools' : 'Desktop'} web fetch: ${checks} checks; binary/text/native-path/redirect/concurrency/cancellation/failure/timeout/fallback regression`
  )
} finally {
  // This test owns only the directory it created; never touch the real Downloads directory.
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
