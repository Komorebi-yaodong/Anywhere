const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const READ_TIMEOUT_MS = 60000
const MIME_EXTENSIONS = {
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/gzip': '.gz',
  'application/x-7z-compressed': '.7z',
  'application/x-rar-compressed': '.rar',
  'application/vnd.rar': '.rar',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/html': '.html',
  'text/plain': '.txt',
  'application/json': '.json',
  'image/png': '.png',
  'image/jpeg': '.jpg'
}

function checkCancelled(signal) {
  if (signal?.aborted) {
    const error = new Error('Web fetch cancelled; no incomplete download was kept.')
    error.name = 'AbortError'
    throw error
  }
}

function validateUrl(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Only http:// and https:// URLs are supported.')
  return url.href
}

function dispositionFilename(disposition) {
  const extended = disposition.match(/(?:^|;)\s*filename\*\s*=\s*(?:"([^"]*)"|([^;]*))/i)
  if (extended) {
    const value = (extended[1] ?? extended[2]).trim()
    const match = value.match(/^UTF-8'[^']*'(.*)$/i)
    if (match) {
      try {
        return decodeURIComponent(match[1])
      } catch {
        /* Fall back to filename. */
      }
    }
  }
  const basic = disposition.match(/(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]*))/i)
  return basic ? (basic[1] ?? basic[2]).trim().replace(/\\"/g, '"') : ''
}

function safeFilename(value) {
  // Treat both slash styles as separators on every OS; never trust server paths.
  let name = String(value)
    .split(/[\\/]/)
    .pop()
    .replace(/[<>:"/\\|?*\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '_')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .replace(/^[. ]+|[. ]+$/g, '')
  if (!name) name = 'download'
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) name = `_${name}`
  const extension = path.extname(name).slice(0, 20)
  const stem = name.slice(0, name.length - path.extname(name).length) || 'download'
  // Bound UTF-8 bytes as well as characters, including room for collision suffixes.
  let shortened = ''
  for (const char of stem) {
    if (Buffer.byteLength(shortened + char + extension, 'utf8') > 180) break
    shortened += char
  }
  return (shortened || 'download') + extension
}

function resolveFilename(response, url, contentType, signatureExtension) {
  const disposition = dispositionFilename(response.headers.get('content-disposition') || '')
  let name = disposition
  if (!name) {
    const segment = new URL(url).pathname.split('/').pop() || ''
    try {
      name = decodeURIComponent(segment)
    } catch {
      name = segment
    }
  }
  name = safeFilename(name || 'download')
  if (!path.extname(name)) {
    name +=
      (signatureExtension !== '.bin' && signatureExtension) ||
      MIME_EXTENSIONS[contentType] ||
      signatureExtension ||
      ''
  }
  return name
}

function binarySignature(bytes) {
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return '.pdf'
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 3 && bytes[3] === 4) ||
      (bytes[2] === 5 && bytes[3] === 6) ||
      (bytes[2] === 7 && bytes[3] === 8))
  )
    return '.zip'
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return '.gz'
  if (bytes.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))) return '.7z'
  if (bytes.subarray(0, 4).toString('ascii') === 'Rar!') return '.rar'
  // NUL/control bytes are not readable UTF-8 webpage content.
  if (bytes.some((byte) => byte === 0 || byte < 0x09 || (byte > 0x0d && byte < 0x20))) return '.bin'
  return ''
}

function isTextType(contentType) {
  return (
    contentType.startsWith('text/') ||
    /(?:json|xml|javascript|ecmascript|yaml|toml)(?:$|[+.-])/.test(contentType)
  )
}

function openBody(response, signal) {
  const body = response.body
  const reader = body?.getReader?.()
  const iterator =
    !reader &&
    (body?.[Symbol.asyncIterator]?.() || (!body && { next: async () => ({ done: true }) }))
  if (!reader && !iterator) throw new Error('The response has no readable body.')
  let stopped = false
  let ended = false
  let failure = null
  let pendingReject = null
  const stop = () => {
    if (stopped) return
    stopped = true
    if (reader) Promise.resolve(reader.cancel()).catch(() => {})
    else if (typeof body?.destroy === 'function') body.destroy()
    else Promise.resolve(iterator.return?.()).catch(() => {})
  }
  const onAbort = () => {
    stop()
    const error = new Error('Web fetch cancelled; no incomplete download was kept.')
    error.name = 'AbortError'
    pendingReject?.(error)
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  return {
    async next() {
      checkCancelled(signal)
      if (failure) throw failure
      if (ended) return null
      let timer
      try {
        const result = await Promise.race([
          reader ? reader.read() : iterator.next(),
          new Promise((_, reject) => {
            pendingReject = reject
            timer = setTimeout(() => {
              failure = new Error(
                'Web response stalled for 60 seconds; no incomplete download was kept.'
              )
              reject(failure)
              stop()
            }, READ_TIMEOUT_MS)
          })
        ])
        checkCancelled(signal)
        if (failure) throw failure
        ended = result.done
        return result.done ? null : Buffer.from(result.value)
      } finally {
        clearTimeout(timer)
        pendingReject = null
      }
    },
    close() {
      signal?.removeEventListener('abort', onAbort)
      stop()
    }
  }
}

async function publishDownload(temporaryPath, directory, filename, signal) {
  const extension = path.extname(filename)
  const stem = filename.slice(0, filename.length - extension.length)
  for (let index = 0; index < 10000; index++) {
    checkCancelled(signal)
    const candidate = path.join(directory, index ? `${stem} (${index})${extension}` : filename)
    try {
      // Publish completed bytes without ever replacing an existing path (including symlinks).
      try {
        await fs.promises.link(temporaryPath, candidate)
      } catch (error) {
        if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS'].includes(error.code)) throw error
        // FAT/network volumes may not support hard links. COPYFILE_EXCL still forbids replacement.
        await fs.promises.copyFile(temporaryPath, candidate, fs.constants.COPYFILE_EXCL)
      }
      return candidate
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }
  throw new Error('Too many files with the same download name.')
}

async function saveDownload({ response, reader, initial, directory, filename, signal }) {
  checkCancelled(signal)
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) {
    throw new Error('The system default Downloads directory is unavailable.')
  }
  await fs.promises.mkdir(directory, { recursive: true })
  const temporaryPath = path.join(directory, `.anywhere-${randomUUID()}.part`)
  let handle
  let created = false
  let bytes = 0
  try {
    checkCancelled(signal)
    handle = await fs.promises.open(temporaryPath, 'wx')
    created = true
    let chunk = initial
    while (chunk !== null) {
      checkCancelled(signal)
      for (let position = 0; position < chunk.length; ) {
        const { bytesWritten } = await handle.write(chunk, position, chunk.length - position)
        if (!bytesWritten) throw new Error('Unable to write download data.')
        position += bytesWritten
      }
      bytes += chunk.length
      chunk = await reader.next()
    }
    const expected = response.headers.get('content-length')
    const encoding = response.headers.get('content-encoding')
    if (
      expected &&
      /^\d+$/.test(expected) &&
      (!encoding || encoding === 'identity') &&
      Number(expected) !== bytes
    ) {
      throw new Error('Incomplete download: the received size differs from Content-Length.')
    }
    checkCancelled(signal)
    await handle.close()
    handle = null
    const filePath = await publishDownload(temporaryPath, directory, filename, signal)
    return { file_path: filePath, filename: path.basename(filePath), size_bytes: bytes }
  } finally {
    try {
      if (handle) await handle.close()
    } finally {
      // Only this request's exclusive temporary file can be removed.
      if (created) await fs.promises.unlink(temporaryPath)
    }
  }
}

async function fetchWebResource(
  args,
  { fetchImpl, getDownloadsDirectory, renderHtml, signal, maxRead = 32000, hardMaxRead = 48000 }
) {
  let reader
  try {
    checkCancelled(signal)
    const url = validateUrl(args.url)
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: 'https://www.google.com/'
      },
      redirect: 'follow',
      signal
    })
    reader = openBody(response, signal)
    checkCancelled(signal)
    if (response.status === 403 || response.status === 521)
      return `Failed to fetch URL (Anti-bot protection ${response.status}).`
    if (!response.ok || response.status === 206)
      return `Failed to fetch URL. Status: ${response.status} ${response.statusText}`
    const finalUrl = validateUrl(response.url || url)
    const contentType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    const disposition = response.headers.get('content-disposition') || ''
    const initialChunks = []
    let initialBytes = 0
    while (initialBytes < 512) {
      const chunk = await reader.next()
      if (chunk === null) break
      initialChunks.push(chunk)
      initialBytes += chunk.length
    }
    const initial = Buffer.concat(initialChunks)
    const signatureExtension = binarySignature(initial.subarray(0, 512))
    const shouldDownload =
      args.download === true ||
      /^\s*attachment(?:;|$)/i.test(disposition) ||
      !!signatureExtension ||
      (!!contentType && !isTextType(contentType)) ||
      (!contentType &&
        /\.(?:pdf|zip|gz|7z|rar|docx?|xlsx?|pptx?|exe|dmg|apk|mp[34]|png|jpe?g|gif|webp)$/i.test(
          new URL(finalUrl).pathname
        ))
    if (shouldDownload) {
      // A paginated webpage follow-up must not accidentally create repeated binary downloads.
      if (Number(args.offset) > 0)
        throw new Error(
          'File responses cannot be paginated. Use offset=0 to download the complete file.'
        )
      const saved = await saveDownload({
        response,
        reader,
        initial,
        directory: await getDownloadsDirectory(),
        filename: resolveFilename(response, finalUrl, contentType, signatureExtension),
        signal
      })
      return JSON.stringify(
        {
          downloaded: true,
          ...saved,
          content_type: contentType || 'application/octet-stream',
          url: finalUrl,
          message:
            'Saved to the system default Downloads directory. File bytes were not parsed or added to model context. Not opened, executed or extracted. Use a local file-reading/viewing tool if needed.'
        },
        null,
        2
      )
    }
    const chunks = [initial]
    for (let chunk = await reader.next(); chunk !== null; chunk = await reader.next())
      chunks.push(chunk)
    const rawText = Buffer.concat(chunks).toString('utf8')
    let text
    if (/(?:^|[+/])json$/.test(contentType)) {
      try {
        text = JSON.stringify(JSON.parse(rawText), null, 2)
      } catch {
        text = rawText
      }
    } else if (
      contentType === 'text/html' ||
      contentType === 'application/xhtml+xml' ||
      /<\s*(?:!doctype\s+html|html|head|body)(?:\s|>)/i.test(rawText.slice(0, 2048))
    ) {
      text = await renderHtml(rawText, finalUrl)
    } else {
      text = rawText
    }
    checkCancelled(signal)
    const requested = Number(args.length)
    const length = Math.max(
      1,
      Math.floor(
        Math.min(Number.isFinite(requested) && requested > 0 ? requested : maxRead, hardMaxRead)
      )
    )
    const offset = Number(args.offset)
    const start = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
    let result = text.substring(start, start + length)
    const nextOffset = start + result.length
    if (nextOffset < text.length) {
      result += `\n\n--- [SYSTEM NOTE: CONTENT TRUNCATED] ---\nTotal characters: ${text.length}. Current chunk: ${start}-${nextOffset}.\nRemaining: ${text.length - nextOffset}. Call 'builtin_web_fetch' with offset=${nextOffset} to read more.\n`
    } else if (start > 0) result += '\n\n--- [SYSTEM NOTE: END OF PAGE REACHED] ---'
    return result
  } catch (error) {
    return `Error fetching URL: ${error.message}`
  } finally {
    reader?.close()
  }
}

module.exports = { fetchWebResource }
