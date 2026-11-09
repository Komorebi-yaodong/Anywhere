import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

const manifest = JSON.parse(await fsp.readFile(new URL('../package.json', import.meta.url), 'utf8'))
const desktop = manifest.name === 'anywhere-desktop'
const builtinPath = new URL(
  desktop ? '../main/core/mcp_builtin.js' : '../src/mcp_builtin.js',
  import.meta.url
)
const source = await fsp.readFile(builtinPath, 'utf8')

const helperStart = source.indexOf('function inspectViewableImage(')
const helperEnd = source.indexOf('function estimatePdfPageCount(', helperStart)
const handlerStart = source.indexOf('    view_image: async')
const handlerEnd = source.indexOf('    view_pdf: async', handlerStart)
assert.ok(
  helperStart > 0 && helperEnd > helperStart && handlerStart > 0 && handlerEnd > handlerStart
)

// 1x1 PNG; the IHDR width/height fields at offsets 16/20 are what the real decoder reads.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const oversizedPng = Buffer.from(PNG_1X1)
oversizedPng.writeUInt32BE(6000, 16)
oversizedPng.writeUInt32BE(6000, 20)

let fetchCalls = 0
let sockets = new Set()
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname === '/photo.png') {
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(PNG_1X1.length) })
    res.end(PNG_1X1)
    return
  }
  if (url.pathname === '/download') {
    // Mirrors a signed CDN URL: no file extension, query string carries the credential.
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': String(PNG_1X1.length)
    })
    res.end(PNG_1X1)
    return
  }
  if (url.pathname === '/huge-declared.png') {
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(25 * 1024 * 1024) })
    res.end()
    return
  }
  if (url.pathname === '/huge-stream.png') {
    res.writeHead(200, { 'content-type': 'image/png' })
    const chunk = Buffer.alloc(4096, 0x89)
    for (let i = 0; i < 4; i += 1) res.write(chunk)
    res.end()
    return
  }
  if (url.pathname === '/big-dimensions.png') {
    res.writeHead(200, {
      'content-type': 'image/png',
      'content-length': String(oversizedPng.length)
    })
    res.end(oversizedPng)
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('missing')
})
server.on('connection', (socket) => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

function makeContext(fetchImpl) {
  const context = {
    Buffer,
    URL,
    AbortController,
    Uint8Array,
    setTimeout,
    clearTimeout,
    Math,
    Error,
    Object,
    Number,
    String,
    fs,
    path,
    resolvePath: (value) => path.resolve(value),
    isPathSafe: () => true,
    MAX_VIEW_IMAGE_BYTES: 20 * 1024 * 1024,
    MAX_VIEW_IMAGE_PIXELS: 24 * 1024 * 1024,
    VIEW_IMAGE_FORMAT_HINT: 'Supported formats: PNG, JPEG, WebP, GIF.',
    // Desktop must reach the network only through fetchWithProxy (Electron net.fetch on the
    // session that carries networkProxy). A bare fetch here would silently bypass the proxy.
    fetch: async (...args) => {
      if (desktop) throw new Error('bare fetch must not be used on Desktop')
      fetchCalls += 1
      return fetchImpl(...args)
    },
    fetchWithProxy: async (...args) => {
      fetchCalls += 1
      return fetchImpl(...args)
    }
  }
  vm.createContext(context)
  vm.runInContext(source.slice(helperStart, helperEnd), context)
  const handler = vm.runInContext(
    `({${source.slice(handlerStart, handlerEnd)}}).view_image`,
    context
  )
  return { context, handler }
}

const countedFetch = async (...args) => fetch(...args)
const { context, handler } = makeContext(countedFetch)
const viewImage = (args, signal) => handler(args, null, signal)

try {
  const remote = await viewImage({ file_path: `${origin}/photo.png` })
  assert.equal(remote.__anywhereToolResult, 'image')
  assert.equal(remote.image.mimeType, 'image/png')
  assert.equal(remote.image.detail, 'high')
  assert.equal(remote.image.encodedBytes, PNG_1X1.toString('base64'))
  assert.equal(remote.display.fileName, 'photo.png')
  assert.equal(remote.display.bytes, PNG_1X1.length)
  assert.match(
    remote.display.text,
    /^Remote image loaded for visual inspection: photo\.png \(PNG, 1×1,/
  )
  assert.doesNotMatch(remote.display.text, /127\.0\.0\.1|rkey/)

  const signed = await viewImage({ file_path: `${origin}/download?appid=1406&rkey=secret` })
  assert.equal(
    signed.display.fileName,
    'download',
    'no-extension CDN URL falls back to its last path segment'
  )
  assert.equal(signed.image.detail, 'high')
  assert.doesNotMatch(JSON.stringify(signed), /secret/, 'credentials stay out of the tool result')
  assert.equal(
    (await viewImage({ file_path: `${origin}/photo.png`, detail: 'original' })).image.detail,
    'original'
  )

  const notFound = await viewImage({ file_path: `${origin}/missing.png` })
  assert.match(notFound, /^Error viewing image: HTTP 404/)
  assert.doesNotMatch(notFound, /ENOENT|127\.0\.0\.1/)

  const tooLarge = await viewImage({ file_path: `${origin}/huge-declared.png` })
  assert.match(tooLarge, /Image is too large for visual inspection/)

  const bigDimensions = await viewImage({ file_path: `${origin}/big-dimensions.png` })
  assert.match(bigDimensions, /Image dimensions exceed the [\d.]+MP visual inspection limit/)

  const beforeSchemeCheck = fetchCalls
  for (const unsupported of [
    'data:image/png;base64,AAAA',
    'ftp://example.invalid/a.png',
    'file:///tmp/a.png'
  ]) {
    assert.match(
      await viewImage({ file_path: unsupported }),
      /^Error: view_image accepts a local absolute path or an http\(s\) URL only\.$/
    )
  }
  assert.equal(fetchCalls, beforeSchemeCheck, 'unsupported schemes never reach the network')

  assert.equal(await viewImage({ file_path: '   ' }), 'Error: file_path is required.')
  assert.equal(await viewImage({}), 'Error: file_path is required.')
  assert.match(
    await viewImage({ file_path: `${origin}/photo.png`, detail: 'low' }),
    /detail only supports/
  )

  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    () => viewImage({ file_path: `${origin}/photo.png` }, controller.signal),
    (error) => error?.name === 'AbortError'
  )

  // Transport errors from the proxy-aware channel surface as a readable tool error.
  const proxyFailure = makeContext(async () => {
    throw new Error('web_request_timeout_30000ms')
  })
  assert.equal(
    await proxyFailure.handler({ file_path: `${origin}/photo.png` }, null, null),
    'Error viewing image: web_request_timeout_30000ms'
  )
  if (desktop) {
    assert.match(
      source,
      /readRemoteImageBytes\(requestedPath, \{ signal, fetchImpl: fetchWithProxy \}\)/
    )
    assert.doesNotMatch(
      source,
      /readRemoteImageBytes\(requestedPath, \{ signal, fetchImpl: fetch \}\)/
    )
  } else {
    assert.match(source, /const fetchImpl = typeof fetch === 'function' \? fetch : null/)
  }

  // Local files keep the previous behaviour and never touch the network.
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'anywhere-view-image-'))
  const localFile = path.join(dir, 'local.png')
  await fsp.writeFile(localFile, PNG_1X1)
  const beforeLocal = fetchCalls
  const local = await viewImage({ file_path: localFile })
  assert.equal(local.__anywhereToolResult, 'image')
  assert.equal(local.display.fileName, 'local.png')
  assert.match(local.display.text, /^Local image loaded for visual inspection: local\.png/)
  assert.equal(fetchCalls, beforeLocal, 'local paths never fetch')
  assert.equal(
    await viewImage({ file_path: path.join(dir, 'missing.png') }),
    `Error viewing image: ENOENT: no such file or directory, stat '${path.join(dir, 'missing.png')}'`
  )
  await fsp.rm(dir, { recursive: true, force: true })

  // A chunked body without Content-Length is still read through the stream path and inspected.
  const streamed = await viewImage({ file_path: `${origin}/huge-stream.png` })
  assert.match(streamed, /Unsupported or invalid image data/)
  // The byte cap is enforced while streaming, before the body is buffered in full.
  const networkFetch = desktop ? context.fetchWithProxy : context.fetch
  await assert.rejects(
    () =>
      context.readRemoteImageBytes(`${origin}/huge-stream.png`, {
        fetchImpl: networkFetch,
        maxBytes: 1024
      }),
    /Image is too large for visual inspection/
  )
  // Cleanup and allocation bounds use synthetic streams, never the supplied private CDN URL.
  const readRemote = context.readRemoteImageBytes
  let cancelled = 0
  let released = 0
  let arrayBufferCalls = 0
  const fakeBody = (read) => ({
    getReader: () => ({
      read,
      cancel: async () => {
        cancelled += 1
      },
      releaseLock: () => {
        released += 1
      }
    }),
    cancel: async () => {
      cancelled += 1
    }
  })
  const response = (body) => ({ ok: true, headers: { get: () => null }, body })
  await assert.rejects(
    () =>
      readRemote('https://synthetic.invalid/image', {
        maxBytes: 4,
        fetchImpl: async () =>
          response(fakeBody(async () => ({ done: false, value: Buffer.alloc(5) })))
      }),
    /too large/
  )
  assert.equal(cancelled, 1)
  assert.equal(released, 1)
  await assert.rejects(
    () =>
      readRemote('https://synthetic.invalid/image', {
        maxBytes: 4,
        fetchImpl: async () => ({
          ...response(
            fakeBody(() => {
              throw new Error('must not read')
            })
          ),
          headers: { get: () => '999999999999999999999999999' }
        })
      }),
    /too large/
  )
  assert.equal(cancelled, 2, 'oversized headers cancel the response without opening a reader')
  await assert.rejects(
    () =>
      readRemote('https://synthetic.invalid/image', {
        fetchImpl: async () => ({ ok: false, status: 403, body: fakeBody(() => {}) })
      }),
    /HTTP 403/
  )
  assert.equal(cancelled, 3, 'HTTP failures release the response too')
  await assert.rejects(
    () =>
      readRemote('https://synthetic.invalid/image', {
        fetchImpl: async () => ({
          ...response(null),
          arrayBuffer: () => {
            arrayBufferCalls += 1
            return new ArrayBuffer(0)
          }
        })
      }),
    /readable stream/
  )
  assert.equal(arrayBufferCalls, 0, 'no unbounded arrayBuffer fallback')

  let readStarted
  const started = new Promise((resolve) => {
    readStarted = resolve
  })
  const readingController = new AbortController()
  const reading = readRemote('https://synthetic.invalid/image', {
    signal: readingController.signal,
    fetchImpl: async () =>
      response(
        fakeBody(() => {
          readStarted()
          return new Promise(() => {})
        })
      )
  })
  await started
  readingController.abort()
  await assert.rejects(
    () => reading,
    (error) => error.name === 'AbortError'
  )
  assert.equal(cancelled, 4, 'cancel while awaiting body data releases the reader')
  await assert.rejects(
    () =>
      readRemote('https://synthetic.invalid/image', {
        timeoutMs: 20,
        fetchImpl: async () => response(fakeBody(() => new Promise(() => {})))
      }),
    /timed out/
  )
  assert.equal(cancelled, 5)
  let nodeDestroyed = false
  const nodeBody = {
    [Symbol.asyncIterator]: async function* () {
      yield PNG_1X1.subarray(0, 20)
      yield PNG_1X1.subarray(20)
    },
    destroy: () => {
      nodeDestroyed = true
    }
  }
  assert.equal(
    (
      await readRemote('https://synthetic.invalid/image', {
        fetchImpl: async () => response(nodeBody)
      })
    ).toString('base64'),
    PNG_1X1.toString('base64')
  )
  assert.equal(nodeDestroyed, false)
  assert.equal(context.hasUrlScheme('C:\\synthetic\\image.png'), false)
  assert.equal(context.hasUrlScheme('D:/synthetic/image.png'), false)

  assert.equal(typeof context.describeRemoteImageName('https://x.invalid/'), 'string')
  assert.equal(context.describeRemoteImageName('https://x.invalid/'), 'image')
  assert.equal(context.describeRemoteImageName('not a url'), 'image')
  assert.equal(
    context.describeRemoteImageName('https://x.invalid/%E5%9B%BE%20%E7%89%87.png'),
    '图 片.png'
  )
  assert.equal(context.describeRemoteImageName('https://x.invalid/a%00b.png'), 'ab.png')

  console.log(
    `PASS ${desktop ? 'Desktop' : 'uTools'} view_image http(s) URL fetch/stream cap/dimension cap/404/unsupported scheme/abort/local regression`
  )
} finally {
  for (const socket of sockets) socket.destroy()
  await new Promise((resolve) => server.close(resolve))
}
