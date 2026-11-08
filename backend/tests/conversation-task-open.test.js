'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8');
const start = source.indexOf('async function runConversationTask(');
const block = source.slice(start, source.indexOf('async function runScheduledTask(', start));
let ready = false, opened = 0, delivered = 0;
const win = {isDestroyed: () => false};
const context = {Date, Error,
  conversationDbHelperClient: {invoke: async (method, args) => {assert.equal(method, 'openConversation'); assert.equal(args[0].reference, 'target'); return {sessionData: {CODE: 'Code'}};}},
  openWindow: async (_config, message) => {opened++; assert.equal(message.type, 'conversation'); assert.equal(message.preserveExistingVisibility, true); return 'window';},
  windowMap: {get: () => Object.assign(win, {__conversationTaskReady: ready})},
  setTimeout: fn => {ready = true; fn();},
  conversationTaskDelivery: {deliver: async () => {assert.equal(ready, true); delivered++; return {ok: true};}}
};
const run = vm.runInNewContext(`${block}; runConversationTask`, context);
(async () => {
  const task = {conversationId: 'target', promptKey: '', description: 'instruction'};
  await run('task', task, {webdav: {localChatPath: 'fixture'}});
  assert.equal(opened, 1); assert.equal(delivered, 1);
  await assert.rejects(run('task', {...task, promptKey: '__DEFAULT__'}, {}), /task_target_conflict/);
  await assert.rejects(run('task', task, {}), /task_local_storage_required/);
  assert.equal(delivered, 1);
  console.log('PASS plugin task waits explicit preload/Renderer readiness, exclusive target and storage guard');
})().catch(error => {console.error(error); process.exitCode = 1;});
