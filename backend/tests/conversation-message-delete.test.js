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
assert.doesNotMatch(source, /reportConversationDeleteDiagnostic|reportConversationSaveDiagnostic/);
assert.match(source, /scheduleAutoSave\(\{ reason: 'message-deleted', immediate: true \}\)/);

console.log('Plugin conversation message delete regression passed');
