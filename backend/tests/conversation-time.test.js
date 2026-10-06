'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const runtimePath = process.env.ANYWHERE_CONVERSATION_RUNTIME
  ? path.resolve(process.env.ANYWHERE_CONVERSATION_RUNTIME)
  : path.resolve(__dirname, '..', 'src', 'conversation_runtime.js');
const store = require(runtimePath);
const { readLocalProjects } = require('../src/projects.js');

const CREATED_AT = '2021-02-03T04:05:06.000Z';
const UPDATED_AT = '2021-02-04T05:06:07.000Z';

function legacySession(extra = {}) {
  return {
    anywhere_history: true,
    sessionMetadata: { title: 'legacy time fixture' },
    fullHistory: [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'first', timestamp: CREATED_AT },
      { role: 'assistant', content: 'last', completedTimestamp: UPDATED_AT },
    ],
    history: [],
    chat_show: [
      { role: 'user', content: 'first', timestamp: CREATED_AT },
      { role: 'assistant', content: 'last', completedTimestamp: UPDATED_AT },
    ],
    ...extra,
  };
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-plugin-time-'));
  const importedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-plugin-time-import-'));
  try {
    const legacyJson = 'legacy-time.json';
    await fs.writeFile(path.join(root, legacyJson), JSON.stringify(legacySession()), 'utf8');

    const migrated = await store.migrateJsonConversation({ dirPath: root, jsonBasename: legacyJson });
    assert.equal(migrated.descriptor.createdAt, CREATED_AT);
    assert.equal(migrated.descriptor.updatedAt, UPDATED_AT);

    const firstOpen = await store.openConversation({ dirPath: root, reference: migrated.descriptor.conversationId });
    assert.equal(firstOpen.descriptor.createdAt, CREATED_AT);
    assert.equal(firstOpen.sessionData.sessionMetadata.createdAt, CREATED_AT);
    assert.equal(firstOpen.sessionData.sessionMetadata.updatedAt, UPDATED_AT);

    const secondOpen = await store.openConversation({ dirPath: root, reference: migrated.descriptor.conversationId });
    assert.equal(secondOpen.descriptor.createdAt, CREATED_AT);
    assert.equal(secondOpen.sessionData.sessionMetadata.createdAt, CREATED_AT);

    const projects = await readLocalProjects(root);
    assert.equal(projects.conversations[migrated.descriptor.conversationId].createdAt, CREATED_AT);

    const snapshot = await store.readConversationSnapshot({ dirPath: root, conversationId: migrated.descriptor.conversationId });
    const descriptorWithoutTimes = { ...migrated.descriptor };
    delete descriptorWithoutTimes.createdAt;
    delete descriptorWithoutTimes.updatedAt;
    const imported = await store.importConversationSnapshot({
      dirPath: importedRoot,
      descriptor: descriptorWithoutTimes,
      content: snapshot.content,
    });
    assert.equal(imported.descriptor.createdAt, CREATED_AT);
    assert.equal(imported.descriptor.updatedAt, UPDATED_AT);

    const importedOpen = await store.openConversation({ dirPath: importedRoot, reference: migrated.descriptor.conversationId });
    assert.equal(importedOpen.sessionData.sessionMetadata.createdAt, CREATED_AT);
    assert.equal(importedOpen.sessionData.sessionMetadata.updatedAt, UPDATED_AT);


    const lease = await store.acquireWriteLease({
      dirPath: root,
      conversationId: migrated.descriptor.conversationId,
      holderInstanceId: 'time-regression-writer',
      holderApp: 'utools',
    });
    await store.saveConversationSnapshot({
      dirPath: root,
      conversationId: migrated.descriptor.conversationId,
      expectedRevision: 0,
      holderInstanceId: 'time-regression-writer',
      leaseEpoch: lease.leaseEpoch,
      title: migrated.descriptor.title,
      sessionData: firstOpen.sessionData,
    });
    const afterSave = await store.openConversation({ dirPath: root, reference: migrated.descriptor.conversationId });
    assert.equal(afterSave.descriptor.createdAt, CREATED_AT);
    assert.equal(afterSave.sessionData.sessionMetadata.createdAt, CREATED_AT);

    const largeJson = 'large-legacy.json';
    const largePayload = JSON.stringify(legacySession({ padding: 'x'.repeat(16 * 1024 * 1024) }));
    await fs.writeFile(path.join(root, largeJson), largePayload, 'utf8');
    const startedAt = performance.now();
    const listed = await store.listLocalConversations(root);
    const elapsedMs = performance.now() - startedAt;
    assert(listed.some((item) => item.basename === largeJson));
    assert(elapsedMs < 3000, `fast local list exceeded 3000ms: ${elapsedMs.toFixed(2)}ms`);

    console.log(`Plugin conversation time/performance regression passed (${elapsedMs.toFixed(2)}ms)`);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(importedRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
