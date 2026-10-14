'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('../src/sqliteSyncDriver.js');
const store = require('../src/conversationStore.js');
const { readLocalProjects, writeLocalProjects, writeLocalProjectsBestEffort } = require('../src/projects.js');

function session(round, patch = {}) {
  const selectedVoice = patch.selectedVoice ?? `voice-${round}`;
  const model = patch.model ?? `provider|model-${round}`;
  const reasoningEffort = patch.reasoningEffort ?? (round === 1 ? 'low' : round === 2 ? 'high' : 'max');
  const activeMcpServerIds = patch.activeMcpServerIds ?? [`mcp-${round}`];
  const activeSkillIds = patch.activeSkillIds ?? [`skill-${round}`];
  const isAutoApproveTools = patch.isAutoApproveTools ?? (round % 2 === 1);
  const firstMessageIndex = round === 3 ? 21 : 1;
  const lastMessageIndex = 200 + (round * 20);
  const fullHistory = [
    { role: 'system', content: 'synthetic-system', storageId: 'system-id' },
    ...Array.from({ length: lastMessageIndex - firstMessageIndex + 1 }, (_, offset) => {
      const messageIndex = firstMessageIndex + offset;
      return {
        role: messageIndex % 2 === 1 ? 'user' : 'assistant',
        content: `round-${round}-message-${messageIndex}`,
        storageId: `message-${messageIndex}`
      };
    })
  ];
  if (round === 3) {
    fullHistory.splice(1, 0, {
      role: 'compaction',
      content: 'synthetic-summary',
      summary: 'synthetic-summary',
      snapshotId: 'synthetic-summary-3',
      storageId: 'synthetic-summary-3'
    });
  }
  return {
    anywhere_history: true,
    CODE: 'AI',
    model,
    sessionMetadata: { title: 'persistence-roundtrip' },
    currentPromptConfig: { model, reasoning_effort: reasoningEffort, voice: selectedVoice },
    selectedVoice,
    activeMcpServerIds,
    activeSkillIds,
    isAutoApproveTools,
    fullHistory,
    history: [],
    chat_show: fullHistory.filter((message) => message.role !== 'tool').map((message, index) => ({
      ...message,
      id: index + 1,
      uiStorageId: `ui-${message.storageId || index + 1}`
    }))
  };
}

async function verifyRecoveredUiProjection(root) {
  const fullHistory = [
    { role: 'compaction', content: 'synthetic-summary', summary: 'synthetic-summary', snapshotId: 'projection-summary', storageId: 'projection-summary' },
    { role: 'user', content: 'before-recovery', storageId: 'projection-before' },
    { role: 'user', content: 'recovered-user', storageId: 'projection-recovered' },
    { role: 'assistant', content: 'after-recovery', storageId: 'projection-after' },
    { role: 'user', content: 'delete-user', storageId: 'projection-delete' },
    { role: 'assistant', content: 'tail-assistant', storageId: 'projection-tail' }
  ];
  const chatShow = [
    { ...fullHistory[0], id: 1, uiStorageId: 'ui-projection-summary' },
    { ...fullHistory[1], id: 2, uiStorageId: 'ui-projection-before' },
    { ...fullHistory[3], id: 3, uiStorageId: 'ui-projection-after' },
    { ...fullHistory[4], id: 4, uiStorageId: 'ui-projection-delete' },
    { ...fullHistory[5], id: 5, uiStorageId: 'ui-projection-tail' }
  ];
  const created = await store.createConversation({
    dirPath: root,
    title: 'recovered-ui-projection',
    sessionData: {
      anywhere_history: true,
      sessionMetadata: { title: 'recovered-ui-projection' },
      activeSkillIds: ['skill-enabled', 'skill-disabled'],
      fullHistory,
      history: [],
      chat_show: chatShow
    }
  });
  const conversationId = created.descriptor.conversationId;
  const holderInstanceId = 'plugin-recovered-ui-holder';
  const lease = await store.acquireWriteLease({ dirPath: root, conversationId, holderInstanceId, holderApp: 'utools-test' });
  const opened = await store.openConversation({ dirPath: root, reference: conversationId, activeOnly: true, pageSize: 200 });
  const edited = opened.sessionData;
  const recovered = edited.fullHistory.find((message) => message.storageId === 'projection-recovered');
  // Simulate a historical UI cache whose bubble content is correct but storageId points at another canonical message.
  edited.chat_show.splice(2, 0, { ...recovered, storageId: 'projection-tail', id: 99, uiStorageId: 'ui-projection-recovered' });
  edited.fullHistory = edited.fullHistory.filter((message) => message.storageId !== 'projection-delete');
  edited.chat_show = edited.chat_show.filter((message) => message.storageId !== 'projection-delete');
  edited.activeSkillIds = ['skill-enabled'];

  const saved = await store.saveConversationSnapshot({
    dirPath: root,
    conversationId,
    expectedRevision: opened.descriptor.revision,
    holderInstanceId,
    leaseEpoch: lease.leaseEpoch,
    title: 'recovered-ui-projection',
    sessionData: edited
  });
  assert.strictEqual(saved.ok, true);

  const reopened = await store.openConversation({ dirPath: root, reference: conversationId, activeOnly: true, pageSize: 200 });
  assert.deepStrictEqual(reopened.sessionData.chat_show.map((message) => message.storageId), [
    'projection-summary',
    'projection-before',
    'projection-recovered',
    'projection-after',
    'projection-tail'
  ]);
  assert.deepStrictEqual(reopened.sessionData.chat_show.map((message) => message.uiStorageOrder), [1, 2, 3, 4, 5]);
  assert.strictEqual(reopened.sessionData.chat_show.find((message) => message.uiStorageId === 'ui-projection-recovered')?.storageId, 'projection-recovered');
  assert.strictEqual(reopened.sessionData.fullHistory.some((message) => message.storageId === 'projection-tail'), true);
  assert.strictEqual(reopened.sessionData.fullHistory.some((message) => message.storageId === 'projection-delete'), false);
  assert.deepStrictEqual(reopened.sessionData.activeSkillIds, ['skill-enabled']);
  await store.releaseWriteLease({ dirPath: root, conversationId, holderInstanceId, leaseEpoch: lease.leaseEpoch });
}


async function verifyUiLinkRepair(root) {
  const created = await store.createConversation({
    dirPath: root,
    title: 'ui-link-repair',
    sessionData: {
      anywhere_history: true,
      sessionMetadata: { title: 'ui-link-repair' },
      fullHistory: [
        { role: 'user', content: 'repair-user', storageId: 'repair-user' },
        { role: 'assistant', content: 'repair-assistant', storageId: 'repair-assistant' }
      ],
      history: [],
      chat_show: [
        { role: 'user', content: [{ type: 'text', text: 'repair-user' }], storageId: 'repair-user', uiStorageId: 'ui-repair-user' },
        { role: 'assistant', content: 'repair-assistant', storageId: 'repair-assistant', uiStorageId: 'ui-repair-assistant' }
      ]
    }
  });
  const db = new DatabaseSync(created.databasePath);
  const canonicalBefore = db.prepare('SELECT ordinal, message_uuid, role_code, payload_json FROM messages ORDER BY ordinal').all();
  db.prepare('UPDATE ui_messages SET message_uuid = ? WHERE ui_uuid = ?').run('missing-canonical-id', 'ui-repair-user');
  db.close();

  const isolated = await store.openConversation({ dirPath: root, reference: created.descriptor.conversationId, activeOnly: true, pageSize: 200 });
  assert.strictEqual(isolated.sessionData.chat_show.find((message) => message.uiStorageId === 'ui-repair-user')?.storageId, undefined);

  const holderInstanceId = 'plugin-ui-link-repair-holder';
  const lease = await store.acquireWriteLease({ dirPath: root, conversationId: created.descriptor.conversationId, holderInstanceId, holderApp: 'utools-test' });
  const repaired = await store.repairConversationUiLinks({
    dirPath: root,
    conversationId: created.descriptor.conversationId,
    expectedRevision: created.descriptor.revision,
    holderInstanceId,
    leaseEpoch: lease.leaseEpoch
  });
  assert.deepStrictEqual({ changed: repaired.changed, rebound: repaired.rebound, unlinked: repaired.unlinked }, { changed: 1, rebound: 1, unlinked: 0 });
  assert.strictEqual(repaired.revision, created.descriptor.revision + 1);
  assert.strictEqual(repaired.backupCreated, true);
  const repairSnapshots = await fs.readdir(path.join(root, '.snapshots'));
  assert.strictEqual(repairSnapshots.filter((name) => name.includes('pre-ui-link-repair')).length, 1);
  const noOpRepair = await store.repairConversationUiLinks({
    dirPath: root,
    conversationId: created.descriptor.conversationId,
    expectedRevision: repaired.revision,
    holderInstanceId,
    leaseEpoch: lease.leaseEpoch
  });
  assert.deepStrictEqual({ changed: noOpRepair.changed, backupCreated: noOpRepair.backupCreated, revision: noOpRepair.revision }, {
    changed: 0,
    backupCreated: false,
    revision: repaired.revision
  });
  assert.strictEqual((await fs.readdir(path.join(root, '.snapshots'))).filter((name) => name.includes('pre-ui-link-repair')).length, 1);

  const reopened = await store.openConversation({ dirPath: root, reference: created.descriptor.conversationId, activeOnly: true, pageSize: 200 });
  assert.strictEqual(reopened.sessionData.chat_show.find((message) => message.uiStorageId === 'ui-repair-user')?.storageId, 'repair-user');
  const verifyDb = new DatabaseSync(created.databasePath, { readOnly: true });
  const canonicalAfter = verifyDb.prepare('SELECT ordinal, message_uuid, role_code, payload_json FROM messages ORDER BY ordinal').all();
  verifyDb.close();
  assert.deepStrictEqual(canonicalAfter, canonicalBefore, 'UI link repair must not modify canonical messages');
  await store.releaseWriteLease({ dirPath: root, conversationId: created.descriptor.conversationId, holderInstanceId, leaseEpoch: lease.leaseEpoch });
}


async function verifyOrphanDatabaseIndexRecovery(root) {
  const sourceRoot = path.join(root, 'orphan-source');
  const orphanRoot = path.join(root, 'orphan-target');
  await fs.mkdir(sourceRoot, { recursive: true });
  await fs.mkdir(orphanRoot, { recursive: true });
  const created = await store.createConversation({
    dirPath: sourceRoot,
    title: 'orphan-index-recovery',
    sessionData: {
      anywhere_history: true,
      sessionMetadata: { title: 'orphan-index-recovery' },
      fullHistory: [{ role: 'user', content: 'orphan-message', storageId: 'orphan-user' }],
      history: [],
      chat_show: [{ role: 'user', content: 'orphan-message', storageId: 'orphan-user', uiStorageId: 'ui-orphan-user' }]
    }
  });
  const orphanDbFile = 'renamed-orphan.db';
  await fs.copyFile(created.databasePath, path.join(orphanRoot, orphanDbFile));
  const unrelated = new DatabaseSync(path.join(orphanRoot, 'unrelated.db'));
  unrelated.exec('CREATE TABLE unrelated(value TEXT)');
  unrelated.close();

  assert.strictEqual(await fs.access(path.join(orphanRoot, 'projects.yaml')).then(() => true, () => false), false);
  const listed = await store.listLocalConversations(orphanRoot);
  assert.strictEqual(listed.length, 1);
  assert.strictEqual(listed[0].conversationId, created.descriptor.conversationId);
  assert.strictEqual(listed[0].basename, orphanDbFile);
  let indexed = await readLocalProjects(orphanRoot);
  assert.strictEqual(indexed.conversations[created.descriptor.conversationId].dbFile, orphanDbFile);
  assert.strictEqual(indexed.conversations[created.descriptor.conversationId].revision, created.descriptor.revision);

  indexed.projects = [{ id: 'kept-project', name: 'Kept Project', files: [], conversationIds: [created.descriptor.conversationId] }];
  indexed.conversations[created.descriptor.conversationId].revision = created.descriptor.revision + 7;
  await writeLocalProjects(orphanRoot, indexed);
  const opened = await store.openConversation({ dirPath: orphanRoot, reference: created.descriptor.conversationId, activeOnly: true, pageSize: 200 });
  assert.strictEqual(opened.descriptor.revision, created.descriptor.revision);
  indexed = await readLocalProjects(orphanRoot);
  assert.strictEqual(indexed.conversations[created.descriptor.conversationId].revision, created.descriptor.revision);
  assert.deepStrictEqual(indexed.projects[0].conversationIds, [created.descriptor.conversationId]);

  const holderInstanceId = 'plugin-orphan-index-holder';
  const lease = await store.acquireWriteLease({ dirPath: orphanRoot, conversationId: created.descriptor.conversationId, holderInstanceId, holderApp: 'utools-test' });
  assert.strictEqual(lease.revision, created.descriptor.revision);
  await store.releaseWriteLease({ dirPath: orphanRoot, conversationId: created.descriptor.conversationId, holderInstanceId, leaseEpoch: lease.leaseEpoch });

  const replacement = await store.createConversation({
    dirPath: sourceRoot,
    title: 'replacement-index-identity',
    sessionData: {
      anywhere_history: true,
      sessionMetadata: { title: 'replacement-index-identity' },
      fullHistory: [{ role: 'user', content: 'replacement-message', storageId: 'replacement-user' }],
      history: [],
      chat_show: [{ role: 'user', content: 'replacement-message', storageId: 'replacement-user', uiStorageId: 'ui-replacement-user' }]
    }
  });
  await fs.copyFile(replacement.databasePath, path.join(orphanRoot, orphanDbFile));
  const replacedList = await store.listLocalConversations(orphanRoot);
  assert.strictEqual(replacedList.length, 1);
  assert.strictEqual(replacedList[0].conversationId, replacement.descriptor.conversationId);
  indexed = await readLocalProjects(orphanRoot);
  assert.strictEqual(indexed.conversations[created.descriptor.conversationId], undefined);
  assert.strictEqual(indexed.conversations[replacement.descriptor.conversationId].dbFile, orphanDbFile);
  assert.deepStrictEqual(indexed.projects[0].conversationIds, []);
}


async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-plugin-persistence-'));
  try {
    const created = await store.createConversation({
      dirPath: root,
      title: 'persistence-roundtrip',
      sessionData: session(1)
    });
    const conversationId = created.descriptor.conversationId;
    const holderInstanceId = 'plugin-persistence-holder';
    const lease = await store.acquireWriteLease({
      dirPath: root,
      conversationId,
      holderInstanceId,
      holderApp: 'utools-test'
    });
    assert.strictEqual(lease.ok, true);

    let revision = Number(created.descriptor.revision) || 0;
    for (let round = 1; round <= 3; round += 1) {
      const snapshot = await store.saveConversationSnapshot({
        dirPath: root,
        conversationId,
        expectedRevision: revision,
        holderInstanceId,
        leaseEpoch: lease.leaseEpoch,
        title: 'persistence-roundtrip',
        sessionData: session(round)
      });
      revision = snapshot.revision;
      const statePatch = {
        model: `provider|patched-${round}`,
        currentPromptConfig: {
          model: `provider|patched-${round}`,
          reasoning_effort: round === 1 ? 'medium' : round === 2 ? 'xhigh' : 'none',
          voice: `patched-voice-${round}`
        },
        selectedVoice: `patched-voice-${round}`,
        activeMcpServerIds: [`patched-mcp-${round}`],
        activeSkillIds: [`patched-skill-${round}`],
        isAutoApproveTools: round !== 3
      };
      const stateSaved = await store.saveConversationState({
        dirPath: root,
        conversationId,
        expectedRevision: revision,
        holderInstanceId,
        leaseEpoch: lease.leaseEpoch,
        title: 'persistence-roundtrip',
        state: statePatch
      });
      revision = stateSaved.revision;

      const opened = await store.openConversation({ dirPath: root, reference: conversationId, activeOnly: true, pageSize: 200 });
      assert.strictEqual(opened.descriptor.revision, revision);
      const lastMessageIndex = 200 + (round * 20);
      assert.strictEqual(opened.sessionData.fullHistory.at(-1)?.content, `round-${round}-message-${lastMessageIndex}`);
      const requestMessages = await store.getConversationRequestMessages({ dirPath: root, conversationId });
      assert.strictEqual(requestMessages.messages.find((message) => message.storageId === 'message-21')?.content, `round-${round}-message-21`);
      if (round === 2) assert.strictEqual(requestMessages.messages.find((message) => message.storageId === 'message-1')?.content, 'round-2-message-1');
      if (round === 3) assert.strictEqual(requestMessages.messages.some((message) => message.storageId === 'message-1'), false);
      assert.strictEqual(opened.sessionData.model, statePatch.model);
      assert.deepStrictEqual(opened.sessionData.currentPromptConfig, statePatch.currentPromptConfig);
      assert.strictEqual(opened.sessionData.selectedVoice, statePatch.selectedVoice);
      assert.deepStrictEqual(opened.sessionData.activeMcpServerIds, statePatch.activeMcpServerIds);
      assert.deepStrictEqual(opened.sessionData.activeSkillIds, statePatch.activeSkillIds);
      assert.strictEqual(opened.sessionData.isAutoApproveTools, statePatch.isAutoApproveTools);
    }

    await verifyRecoveredUiProjection(root);

    await verifyUiLinkRepair(root);

    await verifyOrphanDatabaseIndexRecovery(root);


    const warning = await writeLocalProjectsBestEffort(root, { version: 2, conversations: {}, projects: [] }, async () => {
      throw new Error('synthetic_index_write_failure');
    });
    assert.deepStrictEqual(warning, {
      code: 'conversation_index_sync_failed',
      message: 'conversation_saved_but_index_sync_failed'
    });

    await store.releaseWriteLease({
      dirPath: root,
      conversationId,
      holderInstanceId,
      leaseEpoch: lease.leaseEpoch
    });
    console.log(JSON.stringify({ ok: true, revision, rounds: 3 }));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
