import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'

const root = new URL('../', import.meta.url)
const desktop = await fs.access(new URL('render/window/App.vue', root)).then(
  () => true,
  () => false
)
const windowRoot = new URL(desktop ? 'render/window/' : 'src/', root)
const source = await fs.readFile(new URL('utils/viewImageCompression.js', windowRoot), 'utf8')
const app = await fs.readFile(new URL('App.vue', windowRoot), 'utf8')

function setup({
  pngSize = 30,
  jpegSize = 20,
  transparent = false,
  badImage = false,
  badPng = false,
  noCanvas = false,
  huge = false,
  abortDuringEncoding = null,
  deferLoad = false
} = {}) {
  const calls = [],
    canvases = [],
    images = [],
    listeners = new Set()
  let load
  class ImageMock {
    naturalWidth = huge ? 2000000 : 40
    naturalHeight = 20
    set src(value) {
      this.url = value
      if (value) {
        load = () => (badImage ? this.onerror?.() : this.onload?.())
        if (!deferLoad) queueMicrotask(load)
      }
    }
  }
  const document = {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () =>
          noCanvas
            ? null
            : {
                drawImage(image) {
                  images.push(image)
                },
                getImageData: () => ({ data: new Uint8Array([0, 0, 0, transparent ? 0 : 255]) })
              },
        toBlob(callback, mimeType, quality) {
          calls.push({ mimeType, quality })
          queueMicrotask(() => {
            abortDuringEncoding?.abort()
            callback(
              badPng && mimeType === 'image/png'
                ? null
                : new Blob([new Uint8Array(mimeType === 'image/png' ? pngSize : jpegSize)], {
                    type: mimeType
                  })
            )
          })
        }
      }
      canvases.push(canvas)
      return canvas
    }
  }
  const context = vm.createContext({
    Image: ImageMock,
    document,
    Uint8Array,
    queueMicrotask,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64')
  })
  const prepare = vm.runInContext(
    source.replace('export async function', 'async function') + '\nprepareViewImagePayload',
    context
  )
  return { prepare, calls, canvases, images, load: () => load(), listeners }
}
const result = (mimeType = 'image/png', size = 100, detail = 'high') => ({
  __anywhereToolResult: 'image',
  image: { mimeType, encodedBytes: Buffer.alloc(size, 123).toString('base64'), detail },
  display: { text: 'Synthetic input.' }
})
const clean = (state) => {
  assert.ok(state.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0))
  assert.ok(state.images.every((image) => image.url === ''))
}

let state = setup()
assert.equal(await state.prepare({ __anywhereToolResult: 'pdf' }), null)
assert.equal(state.calls.length, 0)
for (const invalid of [result('image/svg+xml'), { __anywhereToolResult: 'image', image: {} }]) {
  await assert.rejects(state.prepare(invalid), /Invalid view_image/)
}
for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
  state = setup()
  const input = result(mime)
  const before = JSON.stringify(input)
  const output = await state.prepare(input)
  assert.match(output.dataUrl, /^data:image\/jpeg;base64,/)
  assert.equal(Buffer.from(output.dataUrl.split(',')[1], 'base64').length, 20)
  assert.equal(output.width, 40)
  assert.equal(output.height, 20)
  assert.equal(output.optimized, true)
  assert.match(output.displayText, /100 → 20 bytes/)
  assert.equal(JSON.stringify(input), before, 'source IPC payload must not be mutated')
  assert.deepEqual(state.calls, [
    { mimeType: 'image/png', quality: undefined },
    { mimeType: 'image/jpeg', quality: 0.8 }
  ])
  if (['image/gif', 'image/webp'].includes(mime)) assert.match(output.displayText, /Static preview/)
  clean(state)
}
state = setup({ pngSize: 10 })
assert.equal((await state.prepare(result())).mimeType, 'image/png')
clean(state)
state = setup({ transparent: true })
assert.equal((await state.prepare(result())).mimeType, 'image/png')
assert.equal(state.calls.length, 1, 'transparent images must never use JPEG')
clean(state)
state = setup({ pngSize: 110, jpegSize: 120 })
let input = result('image/jpeg', 100, 'original')
let output = await state.prepare(input)
assert.equal(output.dataUrl, `data:image/jpeg;base64,${input.image.encodedBytes}`)
assert.equal(output.detail, 'original')
assert.equal(output.optimized, false)
assert.match(output.displayText, /already smaller/)
clean(state)
state = setup({ pngSize: 6 * 1024 * 1024, jpegSize: 5 * 1024 * 1024 + 1 })
output = await state.prepare(result('image/jpeg', 7 * 1024 * 1024, 'original'))
assert.ok(output.bytes > 5 * 1024 * 1024, 'no 5MB target or resize/quality loops')
assert.equal(output.optimized, true)
assert.equal(output.detail, 'original')
assert.equal(state.calls.length, 2)
clean(state)
for (const options of [{ badImage: true }, { badPng: true }, { noCanvas: true }, { huge: true }]) {
  state = setup(options)
  await assert.rejects(state.prepare(result()), /decode|encode|unavailable|dimensions/)
  clean(state)
}
let controller = new AbortController()
controller.abort()
state = setup()
await assert.rejects(state.prepare(result(), controller.signal), { name: 'AbortError' })
assert.equal(state.canvases.length, 0)
controller = new AbortController()
state = setup({ deferLoad: true })
const pending = state.prepare(result(), controller.signal)
controller.abort()
await assert.rejects(pending, { name: 'AbortError' })
controller = new AbortController()
state = setup({ abortDuringEncoding: controller })
await assert.rejects(state.prepare(result(), controller.signal), { name: 'AbortError' })
assert.equal(state.calls.length, 1)
clean(state)
assert.match(app, /const getViewImagePayload = prepareViewImagePayload;/)
assert.match(
  app,
  /const imagePayload = await getViewImagePayload\(result,[^\n]*\);\s*throwIfTurnAborted\(\);/
)
assert.match(
  app,
  /const createViewImageMessage[\s\S]{0,180}?storageId:\s*createConversationStorageId\(\)/
)
assert.ok(!/\.resize\(|\.writeFile\(|MAX_OUTPUT|TARGET_BYTES/.test(source))
console.log(
  `PASS ${desktop ? 'Desktop' : 'uTools'} view_image single-pass PNG/JPEG, alpha, no-growth, >5MB, abort/error cleanup and pre-history integration`
)
