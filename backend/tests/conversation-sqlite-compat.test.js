'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const runtimePath = process.env.ANYWHERE_CONVERSATION_RUNTIME
  ? path.resolve(process.env.ANYWHERE_CONVERSATION_RUNTIME)
  : path.resolve(__dirname, '..', 'src', 'conversation_runtime.js');
const store = require(runtimePath);

function createSession(messageCount = 12) {
  const fullHistory = [
    { role: 'system', content: 'compat-system' },
    ...Array.from({ length: messageCount }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `compat-message-${index + 1}`,
    })),
  ];
  return {
    anywhere_history: true,
    sessionMetadata: {
      title: 'SQLite compatibility fixture',
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:01.000Z',
    },
    fullHistory,
    history: fullHistory,
    chat_show: fullHistory.filter((message) => message.role !== 'system'),
    draft: 'compat-draft',
  };
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-sqlite-compat-'));
  const localDir = path.join(root, 'local');
  const importDir = path.join(root, 'imported');
  await fs.mkdir(localDir, { recursive: true });

  try {
    const legacyFilename = 'legacy-session.json';
    await fs.writeFile(
      path.join(localDir, legacyFilename),
      JSON.stringify(createSession()),
      'utf8',
    );

    const migration = await store.migrateJsonConversation({
      dirPath: localDir,
      jsonBasename: legacyFilename,
      instanceId: 'compat-migrator',
      appType: 'utools',
    });
    assert.equal(migration.ok, true);
    assert.equal(migration.migrated, true);
    assert.match(migration.descriptor.conversationId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    const listed = await store.listLocalConversations(localDir);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].format, 'sqlite');
    assert.equal(listed[0].title, 'SQLite compatibility fixture');

    const opened = await store.openConversation({
      dirPath: localDir,
      reference: migration.descriptor.conversationId,
      activeOnly: true,
      pageSize: 5,
    });
    assert.equal(opened.ok, true);
    assert.equal(opened.sessionData.fullHistory.length, 6);
    assert.equal(opened.sessionData.fullHistory[0].role, 'system');
    assert.equal(opened.sessionData.conversationStorage.isPaged, true);

    const requestMessages = await store.getConversationRequestMessages({
      dirPath: localDir,
      conversationId: migration.descriptor.conversationId,
    });
    assert.equal(requestMessages.messages.length, 13);

    const page = await store.loadConversationPage({
      dirPath: localDir,
      conversationId: migration.descriptor.conversationId,
      beforeOrdinal: opened.sessionData.conversationStorage.loadedFromOrdinal,
      pageSize: 5,
    });
    assert.equal(page.ok, true);
    assert.ok(page.messages.length >= 1);

    const lease = await store.acquireWriteLease({
      dirPath: localDir,
      conversationId: migration.descriptor.conversationId,
      holderInstanceId: 'compat-writer',
      holderApp: 'utools',
    });
    assert.equal(lease.ok, true);

    const renamed = await store.renameConversation({
      dirPath: localDir,
      conversationId: migration.descriptor.conversationId,
      title: 'Renamed compatibility fixture',
      expectedRevision: opened.descriptor.revision,
      holderInstanceId: 'compat-writer',
      leaseEpoch: lease.leaseEpoch,
    });
    assert.equal(renamed.revision, opened.descriptor.revision + 1);

    const heartbeat = await store.heartbeatWriteLease({
      dirPath: localDir,
      conversationId: migration.descriptor.conversationId,
      holderInstanceId: 'compat-writer',
      leaseEpoch: lease.leaseEpoch,
    });
    assert.equal(heartbeat.ok, true);

    const snapshot = await store.readConversationSnapshot({
      dirPath: localDir,
      conversationId: migration.descriptor.conversationId,
    });
    assert.ok(Buffer.isBuffer(snapshot.content));
    assert.ok(snapshot.content.length > 0);

    const descriptor = await store.getConversationDescriptor({
      dirPath: localDir,
      reference: migration.descriptor.conversationId,
    });
    const imported = await store.importConversationSnapshot({
      dirPath: importDir,
      descriptor: descriptor.descriptor,
      content: snapshot.content,
    });
    assert.equal(imported.ok, true);

    const importedOpened = await store.openConversation({
      dirPath: importDir,
      reference: migration.descriptor.conversationId,
      activeOnly: true,
      pageSize: 5,
    });
    assert.equal(importedOpened.descriptor.title, 'Renamed compatibility fixture');
    assert.equal(importedOpened.sessionData.fullHistory.length, 6);

    const released = await store.releaseWriteLease({
      dirPath: localDir,
      conversationId: migration.descriptor.conversationId,
      holderInstanceId: 'compat-writer',
      leaseEpoch: lease.leaseEpoch,
    });
    assert.equal(released.ok, true);

    return {
      ok: true,
      runtimePath,
      listed: listed.length,
      pagedMessages: opened.sessionData.fullHistory.length,
      requestMessages: requestMessages.messages.length,
      snapshotBytes: snapshot.content.length,
    };
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

module.exports = { main };

if (require.main === module) {
  main()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
