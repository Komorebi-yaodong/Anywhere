'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const runtimePath = process.env.ANYWHERE_CONVERSATION_RUNTIME
  ? path.resolve(process.env.ANYWHERE_CONVERSATION_RUNTIME)
  : path.resolve(__dirname, '..', 'src', 'conversation_runtime.js');
const store = require(runtimePath);

function session(content) {
  return {
    anywhere_history: true,
    sessionMetadata: { title: 'lease regression fixture' },
    fullHistory: [
      { role: 'system', content: 'lease-system' },
      { role: 'user', content },
    ],
    history: [],
    chat_show: [{ role: 'user', content }],
  };
}

async function expectLeaseLost(operation) {
  await assert.rejects(operation, /conversation_write_lease_lost/);
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'anywhere-plugin-lease-'));
  try {
    const created = await store.createConversation({ dirPath: root, title: 'lease fixture', sessionData: session('initial') });
    const conversationId = created.descriptor.conversationId;
    const writerA = 'plugin-window-a';
    const writerB = 'plugin-window-b';

    const leaseA = await store.acquireWriteLease({ dirPath: root, conversationId, holderInstanceId: writerA, holderApp: 'utools' });
    assert.equal(leaseA.ok, true);
    const blockedB = await store.acquireWriteLease({ dirPath: root, conversationId, holderInstanceId: writerB, holderApp: 'utools' });
    assert.equal(blockedB.ok, false);
    assert.equal(blockedB.readonly, true);

    await expectLeaseLost(() => store.saveConversationSnapshot({
      dirPath: root,
      conversationId,
      expectedRevision: 0,
      title: 'lease fixture',
      sessionData: session('bypass-attempt'),
    }));
    await expectLeaseLost(() => store.appendMessages({
      dirPath: root,
      conversationId,
      messages: [{ role: 'user', content: 'append-bypass' }],
    }));
    await expectLeaseLost(() => store.renameConversation({
      dirPath: root,
      conversationId,
      title: 'rename-bypass',
      expectedRevision: 0,
    }));

    const backup = await store.readConversationSnapshot({ dirPath: root, conversationId });
    await expectLeaseLost(() => store.importConversationSnapshot({
      dirPath: root,
      descriptor: created.descriptor,
      content: backup.content,
    }));

    const renewedA = await store.acquireWriteLease({ dirPath: root, conversationId, holderInstanceId: writerA, holderApp: 'utools' });
    assert.equal(renewedA.ok, true);
    assert.equal(renewedA.leaseEpoch, leaseA.leaseEpoch);

    const savedA = await store.saveConversationSnapshot({
      dirPath: root,
      conversationId,
      expectedRevision: 0,
      holderInstanceId: writerA,
      leaseEpoch: leaseA.leaseEpoch,
      title: 'lease fixture',
      sessionData: session('writer-a'),
    });
    assert.equal(savedA.revision, 1);

    const takeoverB = await store.acquireWriteLease({
      dirPath: root,
      conversationId,
      holderInstanceId: writerB,
      holderApp: 'utools',
      force: true,
    });
    assert.equal(takeoverB.ok, true);
    assert.equal(takeoverB.leaseEpoch, leaseA.leaseEpoch + 1);

    await expectLeaseLost(() => store.saveConversationSnapshot({
      dirPath: root,
      conversationId,
      expectedRevision: 1,
      holderInstanceId: writerA,
      leaseEpoch: leaseA.leaseEpoch,
      title: 'lease fixture',
      sessionData: session('stale-a'),
    }));

    const savedB = await store.saveConversationSnapshot({
      dirPath: root,
      conversationId,
      expectedRevision: 1,
      holderInstanceId: writerB,
      leaseEpoch: takeoverB.leaseEpoch,
      title: 'lease fixture',
      sessionData: session('writer-b'),
    });
    assert.equal(savedB.revision, 2);
    const opened = await store.openConversation({ dirPath: root, reference: conversationId, activeOnly: true });
    assert.equal(opened.sessionData.fullHistory.at(-1)?.content, 'writer-b');

    await store.releaseWriteLease({ dirPath: root, conversationId, holderInstanceId: writerB, leaseEpoch: takeoverB.leaseEpoch });
    return { ok: true, conversationId, finalRevision: opened.descriptor.revision };
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}

module.exports = { main };
