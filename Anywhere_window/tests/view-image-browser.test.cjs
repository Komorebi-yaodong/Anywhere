// Run with an isolated Electron executable, not the real Anywhere/uTools app:
// electron tests/view-image-browser.test.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const vm = require('node:vm')
const zlib = require('node:zlib')
const { app, BrowserWindow } = require('electron')
const root = path.resolve(__dirname, '..')
const desktop = fs.existsSync(path.join(root, 'render', 'window', 'App.vue'))
const windowRoot = desktop ? path.join(root, 'render', 'window') : path.join(root, 'src')
const backendPath = desktop
  ? path.join(root, 'main', 'core', 'mcp_builtin.js')
  : path.join(root, '..', 'backend', 'src', 'mcp_builtin.js')
const source = fs.readFileSync(path.join(windowRoot, 'utils', 'viewImageCompression.js'), 'utf8')
const backend = fs.readFileSync(backendPath, 'utf8')
const vue = fs.readFileSync(path.join(windowRoot, 'App.vue'), 'utf8')
// An optional explicitly supplied local fixture is read-only, never uploaded or overwritten.
const fixturePath = process.argv[2] ? path.resolve(process.argv[2]) : null
const fixtureHash = fixturePath
  ? crypto.createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex')
  : null
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'anywhere-image-codec-'))
app.setPath('userData', path.join(temp, 'profile'))
app.disableHardwareAcceleration()

function crc32(data) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(kind, data) {
  const type = Buffer.from(kind)
  const out = Buffer.alloc(data.length + 12)
  out.writeUInt32BE(data.length, 0)
  type.copy(out, 4)
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([type, data])), data.length + 8)
  return out
}
function rawPng(transparent) {
  const width = 640,
    height = 360,
    row = width * 4 + 1
  const raw = Buffer.alloc(row * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * row + 1 + x * 4
      raw[i] = x % 256
      raw[i + 1] = y % 256
      raw[i + 2] = 180
      raw[i + 3] = transparent && x < 40 ? 0 : 255
    }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 0 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}
let win
app
  .whenReady()
  .then(async () => {
    // Synthetic files only. Exercise the actual backend handler and its path/size protections.
    const helpers = backend.slice(
      backend.indexOf('const MAX_VIEW_IMAGE_BYTES'),
      backend.indexOf('function estimatePdfPageCount')
    )
    const start = backend.indexOf('    view_image: async')
    const handler = backend.slice(start, backend.indexOf('    view_pdf: async', start))
    const view = vm.runInNewContext(`${helpers}\n({${handler}}).view_image`, {
      Buffer,
      fs,
      path,
      resolvePath: (value) => value,
      isPathSafe: (value) => value.startsWith(temp) || value === fixturePath
    })
    const inputPaths = [path.join(temp, 'opaque.png'), path.join(temp, 'alpha.png')]
    fs.writeFileSync(inputPaths[0], rawPng(false))
    fs.writeFileSync(inputPaths[1], rawPng(true))
    const hashes = inputPaths.map((file) =>
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    )
    const opaque = await view({ file_path: inputPaths[0], detail: 'original' })
    const alpha = await view({ file_path: inputPaths[1] })
    const fixture = fixturePath ? await view({ file_path: fixturePath }) : null
    if (fixturePath) assert.equal(fixture.__anywhereToolResult, 'image', String(fixture))
    assert.equal(opaque.__anywhereToolResult, 'image')
    assert.equal(alpha.__anywhereToolResult, 'image')
    assert.match(await view({ file_path: temp }), /not a file/)
    assert.match(await view({ file_path: path.join(temp, 'missing.png') }), /Error viewing image/)
    fs.writeFileSync(path.join(temp, 'invalid.png'), 'not an image')
    assert.match(await view({ file_path: path.join(temp, 'invalid.png') }), /invalid image/)
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(view({ file_path: inputPaths[0] }, null, controller.signal), {
      name: 'AbortError'
    })
    const getPayload = /const getViewImagePayload =[^;]+;/.exec(vue)[0]
    const messageStart = vue.indexOf('const createViewImageMessage =')
    const message = vue.slice(
      messageStart,
      vue.indexOf('\nconst createViewPdfMessage', messageStart)
    )
    win = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    })
    await win.loadURL(
      'data:text/html,<html><body>Isolated synthetic image codec test</body></html>'
    )
    const report = await win.webContents.executeJavaScript(`(async () => {
    ${source.replace('export async function', 'async function')}
    ${getPayload}
    const messageIdCounter = {value: 1};
    const createConversationStorageId = () => 'synthetic-image-storage';
    ${message}
    const check = (value, text) => { if (!value) throw new Error(text); };
    const inputs = ${JSON.stringify([opaque, alpha])};
    const makeResult = (url, detail = 'high') => ({ __anywhereToolResult: 'image',
      image: { mimeType: url.slice(5, url.indexOf(';')), encodedBytes: url.split(',')[1], detail }, display: {text: 'Synthetic browser fixture.'} });
    const decode = url => new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = url; });
    const rows = [];
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const before = JSON.stringify(input);
      const output = await getViewImagePayload(input);
      const decoded = await decode(output.dataUrl);
      check(decoded.naturalWidth === 640 && decoded.naturalHeight === 360, 'dimensions changed');
      check(output.bytes < input.display.bytes, 'uncompressed PNG did not shrink');
      check(JSON.stringify(input) === before, 'source mutated');
      if (i === 0) check(output.detail === 'original', 'original hint bypassed/changed');
      if (i === 1) {
        check(output.mimeType === 'image/png', 'transparent image converted to JPEG');
        const c = document.createElement('canvas'); c.width = 640; c.height = 360;
        c.getContext('2d').drawImage(decoded, 0, 0);
        check(c.getContext('2d').getImageData(0, 0, 1, 1).data[3] === 0, 'alpha lost');
      }
      const stored = createViewImageMessage('synthetic-call', output);
      check(stored.content[1].image_url.url === output.dataUrl && stored.storageId === 'synthetic-image-storage', 'optimized bytes not used by durable message');
      rows.push({name: i ? 'alpha PNG' : 'opaque PNG', from: input.display.bytes, to: output.bytes, mime: output.mimeType});
    }
    const c = document.createElement('canvas'); c.width = 900; c.height = 500;
    const ctx = c.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 900, 500); gradient.addColorStop(0, '#246'); gradient.addColorStop(1, '#fea');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 900, 500);
    ctx.fillStyle = 'black'; ctx.font = '24px sans-serif'; ctx.fillText('Anywhere synthetic text 0123456789', 30, 90);
    for (const mime of ['image/jpeg', 'image/webp']) {
      const input = makeResult(c.toDataURL(mime, 1));
      const output = await getViewImagePayload(input);
      const decoded = await decode(output.dataUrl);
      check(decoded.naturalWidth === 900 && decoded.naturalHeight === 500, mime + ' dimensions');
      check(output.bytes <= atob(input.image.encodedBytes).length, mime + ' got larger');
      rows.push({name: mime, from: atob(input.image.encodedBytes).length, to: output.bytes, mime: output.mimeType});
    }
    const gif = makeResult('data:image/gif;base64,R0lGODlhKAAUAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAZAAAACwAAAAAKAAUAAAIMAABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkxQDAgAh+QQBZAABACwAAAAAKAAUAIEAAP8AAAAAAAAAAAAIMAABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkxQDAgA7');
    const gifOutput = await getViewImagePayload(gif);
    const gifDecoded = await decode(gifOutput.dataUrl);
    check(gifDecoded.naturalWidth === 40 && gifDecoded.naturalHeight === 20, 'GIF decode');
    if (gifOutput.optimized) check(gifOutput.displayText.includes('Static preview'), 'GIF needs static notice');
    rows.push({name: 'animated GIF', from: atob(gif.image.encodedBytes).length, to: gifOutput.bytes, mime: gifOutput.mimeType});
    // A JPEG produced at the same quality should not be re-encoded larger.
    const small = makeResult(c.toDataURL('image/jpeg', 0.8));
    const noGrowth = await getViewImagePayload(small);
    check(noGrowth.bytes <= atob(small.image.encodedBytes).length, 'no-growth failed');
    let rejected = false;
    try { await getViewImagePayload(makeResult('data:image/png;base64,YmFk')); } catch { rejected = true; }
    check(rejected, 'invalid decoder input accepted');
    const cancel = new AbortController(); cancel.abort(); rejected = false;
    try { await getViewImagePayload(inputs[0], cancel.signal); } catch (e) { rejected = e.name === 'AbortError'; }
    check(rejected, 'pre-cancel accepted');
    const inFlight = new AbortController(); const pending = getViewImagePayload(inputs[0], inFlight.signal);
    inFlight.abort(); rejected = false;
    try { await pending; } catch (e) { rejected = e.name === 'AbortError'; }
    check(rejected, 'in-flight cancel accepted');
    const fixture = ${JSON.stringify(fixture)};
    if (fixture) {
      const output = await getViewImagePayload(fixture);
      const decoded = await decode(output.dataUrl);
      check(decoded.naturalWidth === fixture.display.width && decoded.naturalHeight === fixture.display.height, 'fixture dimensions changed');
      check(output.bytes <= fixture.display.bytes, 'fixture got larger');
      rows.push({name: 'explicit local fixture', from: fixture.display.bytes, to: output.bytes, mime: output.mimeType,
        width: output.width, height: output.height, base64Chars: output.dataUrl.split(',')[1].length});
    }
    return rows;
  })()`)
    inputPaths.forEach((file, i) =>
      assert.equal(
        crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
        hashes[i],
        'synthetic source file modified'
      )
    )
    if (fixturePath)
      assert.equal(
        crypto.createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex'),
        fixtureHash,
        'explicit fixture modified'
      )
    console.log(
      JSON.stringify({
        ok: true,
        fixtureUnchanged: fixturePath ? true : undefined,
        project: desktop ? 'Desktop' : 'uTools',
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        abi: process.versions.modules,
        report
      })
    )
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    if (win && !win.isDestroyed()) win.destroy()
    const code = process.exitCode || 0
    app.exit(code)
  })
app.on('will-quit', () => {
  // Only remove files created by this isolated test; never touch a product profile.
  try {
    fs.rmSync(temp, { recursive: true, force: true })
  } catch {
    /* Chromium may release profile handles after exit. */
  }
})
