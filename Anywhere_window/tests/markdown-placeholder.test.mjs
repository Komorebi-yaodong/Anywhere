import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'

const source = await fs.readFile(new URL('../src/components/ChatMessage.vue', import.meta.url), 'utf8')
const start = source.indexOf('const preprocessKatexPlainText =')
const end = source.indexOf('const formatMessageContent =', start)
assert.ok(start >= 0 && end > start, 'ChatMessage Markdown preprocessing block must exist')

const context = vm.createContext({ Map, String, computed: () => ({}) })
vm.runInContext(`${source.slice(start, end)}\nglobalThis.markdownApi = { preprocessKatex, normalizeWindowsLocalMarkdownImagePaths };`, context)
const { preprocessKatex, normalizeWindowsLocalMarkdownImagePaths } = context.markdownApi

const dollar = '$'
const replacementSensitiveCode = `\`${dollar}&${dollar}'${dollar}${dollar}\``
const inlineFixture = `${replacementSensitiveCode} trailing text`
assert.equal(preprocessKatex(inlineFixture), inlineFixture, 'inline code must be restored byte-for-byte')

const fencedFixture = `\`\`\`txt\n${dollar}&${dollar}'${dollar}${dollar}\n\`\`\`\ntrailing text`
assert.equal(preprocessKatex(fencedFixture), fencedFixture, 'fenced code must be restored byte-for-byte')

const imageFixture = `${replacementSensitiveCode}\n![fixture](C:\\folder\\file.png)`
const normalizedImage = normalizeWindowsLocalMarkdownImagePaths(imageFixture)
assert.ok(normalizedImage.startsWith(replacementSensitiveCode), 'protected inline code must remain literal during image normalization')
assert.ok(normalizedImage.endsWith('![fixture](C:/folder/file.png)'), 'ordinary Windows image paths must still normalize')

assert.match(source, /replaceAll\(placeholder, \(\) => segment\)/)
assert.doesNotMatch(source, /replaceAll\(placeholder, segment\)/)
console.log(JSON.stringify({ ok: true, suite: 'utools-markdown-placeholder' }))
