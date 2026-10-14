'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const input = fs.readFileSync(path.join(root, 'Anywhere_window', 'src', 'components', 'ChatInput.vue'), 'utf8');
const app = fs.readFileSync(path.join(root, 'Anywhere_window', 'src', 'App.vue'), 'utf8');
const store = fs.readFileSync(path.join(root, 'backend', 'src', 'conversationStore.js'), 'utf8');

const compact = fs.readFileSync(path.join(root, 'backend', 'src', 'compact.js'), 'utf8');

assert.match(input, /const configurationLocked = computed\(\(\) => Boolean\(props\.writeLocked\)\)/);
assert.match(input, /const draftInputLocked = computed\(\(\) => Boolean\(isRecording\.value \|\| props\.writeLocked\)\)/);
assert.match(input, /<div v-if="compacting" class="compact-section-card compact-progress-block">/);
assert.match(input, /\.compact-progress-block \{[\s\S]{0,80}padding: 14px;/);
assert.match(input, /<div class="compact-config-block">/);
assert.match(input, /<template #footer>/);
assert.match(app, /if \(compacting\.value \|\| loading\.value \|\| isPreparingSend\.value\) \{[\s\S]{0,300}enqueueInputToBuffer\(compacting\.value \? '正在压缩/);
assert.match(app, /const enqueueInputToBuffer = \(notice = '正在生成/);
assert.match(store, /const restoredSnapshotId = outermost\.summary_id/);
assert.doesNotMatch(store, /if \(outermost\.summary_id !== requestedSnapshotId\)/);
assert.match(store, /return \{ revision, updatedAt, title: row\.title, restoredSnapshotId \}/);
assert.match(store, /restoredSnapshotId: result\.restoredSnapshotId/);
assert.match(store, /uiMessages = null/);

assert.doesNotMatch(compact, /archivedMessages:\s*deepClone\(sourceMessages\)/);
assert.match(app, /const autoSaveSessionRequestConfig = async/);
assert.match(app, /saveConversationState\(\{[\s\S]{0,700}state:\s*\{\s*\.\.\.getSessionRequestConfigStatePatch\(\),\s*\.\.\.getSessionTransientStatePatch\(\)\s*\}/);
assert.match(app, /delay: AUTO_SAVE_REQUEST_CONFIG_DEBOUNCE_MS,[\s\S]{0,80}stateOnly: true/);
assert.match(app, /const splitChatShowPrefixAtFullCut =/);
assert.match(app, /await executeAutoSaveRequest\(\{ reason: 'conversation-compacted', force: true[\s\S]{0,180}await reloadConversationWindowFromStore/);

console.log('Plugin compaction interaction and authoritative restore regression passed');
