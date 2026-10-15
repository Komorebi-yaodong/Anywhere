import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const linkedCalls = source.match(/appendLinkedUserMessage\s*\(/g) || []
assert.ok(linkedCalls.length >= 6, 'all plugin user-message entry points must use the linked append helper')
assert.doesNotMatch(
  source,
  /appendFullHistory\s*\(\s*\{\s*role:\s*['"]user['"][\s\S]{0,500}?chat_show\.value\.push\s*\(\s*\{[^}]*role:\s*['"]user['"]/
)
assert.match(source, /const createViewImageMessage[\s\S]{0,180}?storageId:\s*createConversationStorageId\(\)/)
assert.match(source, /const createViewPdfMessage[\s\S]{0,180}?storageId:\s*createConversationStorageId\(\)/)

console.log('Plugin user message linking contract passed')
