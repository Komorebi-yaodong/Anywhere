'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/data.js'), 'utf8');
const start = source.indexOf('const conversationWindowOpens =');
const block = source.slice(start, source.indexOf('async function createConversationWindow', start));
let created = 0, shown = 0, focused = 0, finish;
const windowMap = new Map();
const context = {path, Map, JSON, String, windowMap, createConversationWindow: () => {
  created++;
  return new Promise(resolve => { finish = () => {
    const id = `window-${created}`;
    windowMap.set(id, {isDestroyed: () => false, show: () => shown++, focus: () => focused++});
    resolve(id);
  }; });
}};
const open = vm.runInNewContext(`${block}; openWindow`, context);
(async () => {
  const msg = {conversation: {descriptor: {conversationId: 'fixture'}, dirPath: 'synthetic-dir'}};
  const a = open({}, msg), b = open({}, msg);
  assert.equal(created, 1, 'concurrent opens share one creation');
  finish();
  assert.equal(await a, await b);
  assert.equal(await open({}, msg), 'window-1');
  assert.equal(shown, 1);
  assert.equal(focused, 1);
  assert.equal(await open({}, {...msg, preserveExistingVisibility: true}), 'window-1');
  assert.equal(shown, 1); assert.equal(focused, 1, 'scheduled task does not reveal/refocus an existing window');
  windowMap.get('window-1').isDestroyed = () => true;
  const c = open({}, msg); finish();
  assert.equal(await c, 'window-2');
  assert.equal(created, 2);
  console.log('PASS plugin same-client open single-flight / focus / destroyed-window reuse');
})().catch(error => {console.error(error); process.exitCode = 1;});
