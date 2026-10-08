'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const runtimePath = process.env.ANYWHERE_CONVERSATION_RUNTIME
  ? path.resolve(process.env.ANYWHERE_CONVERSATION_RUNTIME)
  : path.resolve(__dirname, '..', 'src', 'conversation_runtime.js');
const store = require(runtimePath);

const appSource = require('fs').readFileSync(path.resolve(__dirname, '..', '..', 'Anywhere_window', 'src', 'App.vue'), 'utf8');
assert.match(appSource, /const usedStorageIds = new Set\(\);[\s\S]{0,500}const usedUiStorageIds = new Set\(\);/, 'window serializer must normalize duplicate cross-client storage IDs before saving');


function desktopShapedSession() {
  const fullHistory = [
    { role: 'system', content: 'system', storageId: 'sys' },
    { role: 'user', content: 'first user', storageId: 'u1' },
    { role: 'assistant', content: 'first assistant', storageId: 'a1' },
    { role: 'user', content: 'second user', storageId: 'u2' },
    { role: 'assistant', content: 'second assistant', storageId: 'a2' },
    { role: 'user', content: 'third user', storageId: 'u3' },
    { role: 'assistant', content: 'third assistant', storageId: 'a3' },
  ];
  // Simulate an imported Desktop UI projection with duplicate UUID/order metadata after
  // a plugin-side edit. The UI sequence intentionally omits u2/a2.
  const chat_show = [
    { role: 'system', content: 'system', storageId: 'sys', uiStorageId: 'ui-system', uiStorageOrder: -1 },
    { role: 'user', content: 'first user', storageId: 'u1', uiStorageId: 'ui-shared', uiStorageOrder: 1 },
    { role: 'assistant', content: 'first assistant', storageId: 'a1', uiStorageId: 'ui-shared', uiStorageOrder: 1 },
    { role: 'user', content: 'third user', storageId: 'u3', uiStorageId: 'ui-tail', uiStorageOrder: 1 },
    { role: 'assistant', content: 'third assistant', storageId: 'a3', uiStorageId: 'ui-tail', uiStorageOrder: 1 },
  ];
  return {
    anywhere_history: true,
    sessionMetadata: { title: 'cross-client UI fixture' },
    fullHistory,
    history: [],
    chat_show,
  };
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-cross-client-ui-'));
  try {
    const initial = desktopShapedSession();
    const created = await store.createConversation({ dirPath: root, title: 'cross-client UI fixture', sessionData: initial });
    const conversationId = created.descriptor.conversationId;
    const holderInstanceId = 'plugin-cross-client-ui';
    const lease = await store.acquireWriteLease({ dirPath: root, conversationId, holderInstanceId, holderApp: 'utools' });
    assert.equal(lease.ok, true);

    const before = await store.openConversation({ dirPath: root, reference: conversationId, activeOnly: false, pageSize: 0 });
    const initialUiIds = before.sessionData.chat_show.map((message) => message.uiStorageId);
    assert.equal(new Set(initialUiIds).size, initialUiIds.length, 'initial import must normalize duplicate UI IDs');
    assert.deepEqual(before.sessionData.chat_show.map((message) => message.storageId), ['sys', 'u1', 'a1', 'u3', 'a3']);

    const edited = before.sessionData;
    edited.chat_show = edited.chat_show.filter((message) => !['u1', 'a1'].includes(message.storageId));
    // Preserve intentionally stale imported order metadata to force the repository replacement path.
    edited.chat_show.forEach((message) => { message.uiStorageOrder = 1; });
    // A Desktop-side UI projection can introduce an ID between retained plugin rows.
    // This must choose the repository replacement path rather than reuse stale orders.
    edited.chat_show.find((message) => message.storageId === 'u3').uiStorageId = 'ui-reinserted';
    const saved = await store.saveConversationSnapshot({
      dirPath: root,
      conversationId,
      expectedRevision: before.descriptor.revision,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      sessionData: edited,
    });
    assert.equal(saved.ok, true);

    const after = await store.openConversation({ dirPath: root, reference: conversationId, activeOnly: false, pageSize: 0 });
    const ui = after.sessionData.chat_show;
    assert.deepEqual(ui.map((message) => message.storageId), ['sys', 'u3', 'a3'], 'plugin UI edit must persist its visible projection');
    assert.equal(new Set(ui.map((message) => message.uiStorageId)).size, ui.length, 'replacement UI IDs must remain unique');
    assert.deepEqual(ui.filter((message) => message.role !== 'system').map((message) => message.uiStorageOrder), [1, 2], 'replacement UI orders must be contiguous');
    assert.deepEqual(after.sessionData.fullHistory.map((message) => message.storageId), ['sys', 'u1', 'a1', 'u2', 'a2', 'u3', 'a3'], 'UI projection update must not rewrite canonical full history');

    const paged = await store.openConversation({ dirPath: root, reference: conversationId, activeOnly: true, pageSize: 2 });
    const pagedEdited = paged.sessionData;
    pagedEdited.chat_show = pagedEdited.chat_show.slice(0, -1);
    const pagedSave = await store.saveConversationSnapshot({
      dirPath: root,
      conversationId,
      expectedRevision: after.descriptor.revision,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch,
      sessionData: pagedEdited,
    });
    assert.equal(pagedSave.ok, true);
    const afterPaged = await store.openConversation({ dirPath: root, reference: conversationId, activeOnly: false, pageSize: 0 });
    assert.deepEqual(afterPaged.sessionData.fullHistory.map((message) => message.storageId), ['sys', 'u1', 'a1', 'u2', 'a2', 'u3', 'a3'], 'paged UI save must preserve unloaded message history');
    assert.equal(new Set(afterPaged.sessionData.chat_show.map((message) => message.uiStorageId)).size, afterPaged.sessionData.chat_show.length);

    await store.releaseWriteLease({ dirPath: root, conversationId, holderInstanceId, leaseEpoch: lease.leaseEpoch });
    console.log('Cross-client UI projection duplicate ID/order and paged preservation regression passed');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

module.exports = { main };

if (require.main === module) main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
