// Use Chromium's codecs in both Desktop and uTools (including V7/Node 16).
// nativeImage cannot decode the WebP/GIF formats accepted by view_image on V7.
const JPEG_QUALITY = 0.8
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_PIXELS = 24 * 1024 * 1024

const throwIfAborted = (signal) => {
  if (signal?.aborted) {
    const error = new Error('Image optimization cancelled by user.')
    error.name = 'AbortError'
    throw error
  }
}

const loadImage = (dataUrl, signal) =>
  new Promise((resolve, reject) => {
    throwIfAborted(signal)
    const image = new Image()
    const cleanup = () => {
      image.onload = null
      image.onerror = null
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      cleanup()
      image.src = ''
      const error = new Error('Image optimization cancelled by user.')
      error.name = 'AbortError'
      reject(error)
    }
    image.onload = () => {
      cleanup()
      resolve(image)
    }
    image.onerror = () => {
      cleanup()
      image.src = ''
      reject(new Error('Unable to decode view_image data for optimization.'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    image.src = dataUrl
  })

const encodeCanvas = (canvas, mimeType, signal) =>
  new Promise((resolve, reject) => {
    throwIfAborted(signal)
    canvas.toBlob(
      (blob) => {
        try {
          throwIfAborted(signal)
          if (!blob || blob.size === 0 || blob.type !== mimeType) {
            throw new Error(`Unable to encode view_image as ${mimeType}.`)
          }
          resolve(blob)
        } catch (error) {
          reject(error)
        }
      },
      mimeType,
      mimeType === 'image/jpeg' ? JPEG_QUALITY : undefined
    )
  })

const hasTransparency = (context, width, height) => {
  // Scan in strips instead of allocating a second full-size RGBA bitmap.
  for (let top = 0; top < height; top += 64) {
    const pixels = context.getImageData(0, top, width, Math.min(64, height - top)).data
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 255) return true
    }
  }
  return false
}

const blobToDataUrl = async (blob, signal) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  throwIfAborted(signal)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  }
  return `data:${blob.type};base64,${btoa(binary)}`
}

export async function prepareViewImagePayload(result, signal) {
  if (result?.__anywhereToolResult !== 'image') return null
  const mimeType = result?.image?.mimeType
  const encodedBytes = result?.image?.encodedBytes
  if (
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType) ||
    typeof encodedBytes !== 'string' ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedBytes)
  ) {
    throw new Error('Invalid view_image payload.')
  }
  throwIfAborted(signal)
  const originalBytes =
    Math.floor((encodedBytes.length * 3) / 4) -
    (encodedBytes.endsWith('==') ? 2 : encodedBytes.endsWith('=') ? 1 : 0)
  if (originalBytes > MAX_IMAGE_BYTES) throw new Error('view_image exceeds the 20 MiB input limit.')
  const originalUrl = `data:${mimeType};base64,${encodedBytes}`
  const image = await loadImage(originalUrl, signal)
  let canvas
  try {
    throwIfAborted(signal)
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
      throw new Error('Invalid or excessive view_image dimensions.')
    }
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas image optimization is unavailable.')
    context.drawImage(image, 0, 0)
    const transparent = hasTransparency(context, width, height)
    // A single lossless PNG encoding and, for opaque images, one JPEG encoding.
    // No target-size loop, resizing, source-file writes, or history migration.
    const png = await encodeCanvas(canvas, 'image/png', signal)
    let best = png
    if (!transparent) {
      const jpeg = await encodeCanvas(canvas, 'image/jpeg', signal)
      if (jpeg.size < best.size) best = jpeg
    }
    throwIfAborted(signal)
    const changed = best.size < originalBytes
    const dataUrl = changed ? await blobToDataUrl(best, signal) : originalUrl
    throwIfAborted(signal)
    const bytes = changed ? best.size : originalBytes
    const format = changed
      ? best.type === 'image/png'
        ? 'PNG (lossless)'
        : 'JPEG (quality 80)'
      : 'original encoding'
    const status = changed
      ? `Single-pass optimization: ${originalBytes} → ${bytes} bytes, ${format}, ${width}×${height}; original dimensions preserved.`
      : `Single-pass PNG${transparent ? '' : '/JPEG'} optimization attempted; original encoding was already smaller (${bytes} bytes).`
    const staticNotice =
      changed && ['image/gif', 'image/webp'].includes(mimeType)
        ? ' Static preview only; animation, if present, is not included.'
        : ''
    const displayText =
      typeof result?.display?.text === 'string'
        ? result.display.text
        : 'Local image loaded for visual inspection.'
    return {
      dataUrl,
      detail: result?.image?.detail === 'original' ? 'original' : 'high',
      displayText: `${displayText}\n${status}${staticNotice}`,
      width,
      height,
      bytes,
      mimeType: changed ? best.type : mimeType,
      optimized: changed
    }
  } finally {
    // Release the decoded image and backing canvas even after cancel/codec errors.
    image.src = ''
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}
