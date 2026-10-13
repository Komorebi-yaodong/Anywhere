'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const store = require('../src/conversationStore.js');
const { writeLocalProjectsBestEffort } = require('../src/projects.js');

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
