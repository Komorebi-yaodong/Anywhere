import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
const desktop = createRequire(import.meta.url)('../src/conversationStore.js')

export async function verifyFork(store = desktop) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-fork-'))
  try {
    const fullHistory = [
      {role: 'system', content: 'synthetic rules', storageId: 'sys'},
      {role: 'user', content: [{type: 'text', text: 'ask'}, {type: 'image_url', image_url: {url: 'data:image/png;base64,AQID'}}], storageId: 'u'},
      {role: 'assistant', content: null, tool_calls: [{id: 'call-fork', type: 'function', function: {name: 'synthetic', arguments: '{}'}}], storageId: 'a'},
      {role: 'tool', tool_call_id: 'call-fork', content: 'result', storageId: 't'},
      {role: 'assistant', content: 'later answer', storageId: 'later'}
    ]
    const chat_show = fullHistory.filter(m => m.role !== 'tool').map((m, i) => ({...m, id: i+1, uiStorageId: `ui-${m.storageId}`}))
    const created = await store.createConversation({dirPath: root, title: 'Steam游戏调研', sessionData: {CODE: 'Code', basic_msg: {conversation: {tail: 'original initializer must not leak'}}, fullHistory, chat_show, promptDraft: 'private unsent', pendingAppendBuffer: [{text: 'unsent'}]}})
    const input = {dirPath: root, conversationId: created.descriptor.conversationId, uiMessageId: 'ui-a'}
    const [first, second] = await Promise.all([store.forkConversation(input), store.forkConversation(input)])
    assert.equal(first.descriptor.title, 'fork-Steam游戏调研')
    assert.equal(second.descriptor.title, 'fork1-Steam游戏调研')
    assert.notEqual(first.descriptor.conversationId, input.conversationId)
    assert.deepEqual(first.sessionData.fullHistory.map(m => m.storageId), ['sys','u','a','t'])
    assert.deepEqual(first.sessionData.chat_show.map(m => m.uiStorageId), ['ui-sys','ui-u','ui-a'])
    assert.equal(first.sessionData.CODE, 'Code')
    assert.equal(JSON.stringify(first.sessionData.basic_msg).includes('original initializer'), false)
    assert.equal(first.sessionData.promptDraft, '')
    assert.deepEqual(first.sessionData.pendingAppendBuffer, [])
    assert.equal(first.sessionData.fullHistory[1].content[1].image_url.url, fullHistory[1].content[1].image_url.url)
    const third = await store.forkConversation({...input, conversationId: first.descriptor.conversationId, uiMessageId: 'ui-u'})
    assert.equal(third.descriptor.title, 'fork2-Steam游戏调研')
    assert.equal(third.sessionData.fullHistory.length, 2)
    await assert.rejects(store.forkConversation({...input, uiMessageId: 'missing'}), /conversation_fork_message_not_found/)
    const original = await store.openConversation({dirPath: root, reference: input.conversationId, activeOnly: false, pageSize: 0})
    assert.equal(original.sessionData.fullHistory.length, 5)
    assert.equal(original.descriptor.title, 'Steam游戏调研')
    const reopened = await store.openConversation({dirPath: root, reference: first.descriptor.conversationId, activeOnly: false, pageSize: 0})
    assert.equal(reopened.sessionData.fullHistory.length, 4)
    console.log('PASS fork prefix/tools/attachments/names/concurrency/source-unchanged/reopen')
  } finally {await fs.rm(root, {recursive: true, force: true})}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await verifyFork()
