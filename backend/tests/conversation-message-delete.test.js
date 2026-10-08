'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'Anywhere_window', 'src', 'App.vue'), 'utf8');

assert.match(source, /const messageStorageId = typeof messageToDelete\?\.storageId === 'string'/);
assert.match(source, /fullHistory\.value\.findIndex\(\(message\) => message\?\.storageId === messageStorageId\)/);
assert.match(source, /const fullStartIndex = matchedStorageIndex >= 0 \? matchedStorageIndex : fullVisibleIndexes\[index\]/);
assert.match(source, /if \(Number\.isInteger\(fullStartIndex\) && fullStartIndex >= 0\)/, 'delete must never pass -1 to splice');
assert.match(source, /reportConversationDeleteDiagnostic\?\.\(\{[\s\S]{0,180}phase: 'before-save'/);
assert.match(source, /scheduleAutoSave\(\{ reason: 'message-deleted', immediate: true \}\)/);
assert.match(source, /phase: 'snapshot-start'/);
assert.match(source, /phase: 'snapshot-complete'/);
assert.match(source, /phase: 'snapshot-failed'/);

console.log('Plugin conversation message delete regression passed');
