'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'Anywhere_window', 'src', 'App.vue'), 'utf8');

assert.match(source, /import \{ resolveSafeConversationMutationTarget \} from '\.\/utils\/conversationMessageTarget\.js';/);
assert.match(source, /const fullStartIndex = resolveSafeConversationMutationTarget\(fullHistory\.value, chat_show\.value, index\)/);
assert.match(source, /if \(fullStartIndex < 0\)[\s\S]{0,120}已阻止删除/);
assert.doesNotMatch(source, /matchedStorageIndex >= 0 \? matchedStorageIndex : fullVisibleIndexes\[index\]/);
assert.doesNotMatch(source, /reportConversationDeleteDiagnostic|reportConversationSaveDiagnostic/);
assert.match(source, /scheduleAutoSave\(\{ reason: 'message-deleted', immediate: true \}\)/);

console.log('Plugin conversation message delete regression passed');
