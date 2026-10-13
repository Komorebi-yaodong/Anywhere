'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function run() {
  const root = path.resolve(__dirname, '..', '..');
  const appSource = fs.readFileSync(path.join(root, 'Anywhere_window', 'src', 'App.vue'), 'utf8');
  const queueModule = await import(pathToFileURL(path.join(root, 'Anywhere_window', 'src', 'utils', 'conversationMutationQueue.js')).href);
  const targetModule = await import(pathToFileURL(path.join(root, 'Anywhere_window', 'src', 'utils', 'conversationMessageTarget.js')).href);
  const {
    completeConversationClose,
    createConversationMutationQueue,
    createConversationPersistenceTracker,
    mergeConversationMutationRequests
  } = queueModule;
  const { resolveSafeConversationMutationTarget } = targetModule;

  const canonicalForDelete = [
    { role: 'user', content: 'first', storageId: 'canonical-first' },
    { role: 'assistant', content: 'reply', storageId: 'canonical-reply' },
    { role: 'user', content: 'second', storageId: 'canonical-second' }
  ];
  assert.strictEqual(resolveSafeConversationMutationTarget(canonicalForDelete, [
    { role: 'user', content: 'first', storageId: 'canonical-first' }
  ], 0), 0);
  assert.strictEqual(resolveSafeConversationMutationTarget(canonicalForDelete, [
    { role: 'user', content: 'first', storageId: 'canonical-second' },
    { role: 'assistant', content: 'reply', storageId: 'canonical-reply' }
  ], 0), 0, 'a stale UI storageId must rebind to the uniquely matching canonical message');
  assert.strictEqual(resolveSafeConversationMutationTarget(canonicalForDelete, [
    { role: 'user', content: 'missing', storageId: 'canonical-second' }
  ], 0), -1, 'an unresolvable UI row must not delete its stale storage target');
  assert.strictEqual(resolveSafeConversationMutationTarget([
    { role: 'user', content: 'duplicate', storageId: 'canonical-a' },
    { role: 'user', content: 'duplicate', storageId: 'canonical-b' }
  ], [
    { role: 'user', content: 'duplicate', storageId: 'stale-id' }
  ], 0), -1, 'ambiguous stale UI rows must fail closed');


  const merged = mergeConversationMutationRequests(
    { reason: 'config', version: 2, stateOnly: true, force: false, skipProjectAssignment: true },
    { reason: 'message', version: 3, stateOnly: false, force: true, skipProjectAssignment: false }
  );
  assert.deepStrictEqual(merged, {
    reason: 'message',
    version: 3,
    stateOnly: false,
    force: true,
    skipProjectAssignment: false
  });

  let releaseFirst;
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const calls = [];
  const queue = createConversationMutationQueue(async (request) => {
    calls.push({ ...request });
    if (request.version === 1) {
      markFirstStarted();
      await firstGate;
    }
    return true;
  });

  const firstDrain = queue.enqueue({ reason: 'old-snapshot', version: 1, stateOnly: false });
  await firstStarted;
  const configDrain = queue.enqueue({ reason: 'config', version: 2, stateOnly: true });
  const closeDrain = queue.enqueue({ reason: 'window-close-final', version: 3, stateOnly: false, force: true });
  releaseFirst();
  assert.strictEqual(await firstDrain, true);
  assert.strictEqual(await configDrain, true);
  assert.strictEqual(await closeDrain, true);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[1].version, 3);
  assert.strictEqual(calls[1].stateOnly, false);
  assert.strictEqual(calls[1].force, true);

  let releaseFailedOld;
  let markFailedOldStarted;
  const failedOldStarted = new Promise((resolve) => { markFailedOldStarted = resolve; });
  const failedOldGate = new Promise((resolve) => { releaseFailedOld = resolve; });
  const recoveryCalls = [];
  const recoveryQueue = createConversationMutationQueue(async (request) => {
    recoveryCalls.push({ ...request });
    if (request.version === 4) {
      markFailedOldStarted();
      await failedOldGate;
      return false;
    }
    return true;
  });
  const failedOldDrain = recoveryQueue.enqueue({ reason: 'old-failed', version: 4, stateOnly: true });
  await failedOldStarted;
  const recoveredCloseDrain = recoveryQueue.enqueue({ reason: 'window-close-final', version: 5, stateOnly: false });
  releaseFailedOld();
  assert.strictEqual(await failedOldDrain, false);
  assert.strictEqual(await recoveredCloseDrain, true, 'a later full snapshot may durably cover an earlier failed mutation');
  assert.deepStrictEqual(recoveryCalls.map((request) => request.version), [4, 5]);

  const persistenceTracker = createConversationPersistenceTracker();
  persistenceTracker.markRequired({ version: 1, stateOnly: false });
  persistenceTracker.markRequired({ version: 2, stateOnly: true });
  persistenceTracker.markPersisted({ version: 2, stateOnly: true });
  assert.deepStrictEqual(persistenceTracker.getState(), {
    requiredMutationVersion: 2,
    requiredFullSnapshotVersion: 1,
    persistedMutationVersion: 2,
    persistedFullSnapshotVersion: 0,
    hasUnpersistedMutations: false,
    hasUnpersistedFullSnapshot: true
  }, 'a successful config patch must not hide an earlier failed full snapshot');
  persistenceTracker.markRequired({ version: 3, stateOnly: false });
  persistenceTracker.markPersisted({ version: 3, stateOnly: false });
  assert.strictEqual(persistenceTracker.getState().hasUnpersistedFullSnapshot, false);


  const failedCloseEvents = [];
  await assert.rejects(
    completeConversationClose({
      persist: async () => false,
      release: async () => { failedCloseEvents.push('release'); },
      close: async () => { failedCloseEvents.push('close'); }
    }),
    /conversation_close_save_incomplete/
  );
  assert.deepStrictEqual(failedCloseEvents, [], 'failed persistence must keep the lease and window open');

  const successfulCloseEvents = [];
  assert.strictEqual(await completeConversationClose({
    persist: async () => { successfulCloseEvents.push('persist'); return true; },
    release: async () => { successfulCloseEvents.push('release'); },
    close: async () => { successfulCloseEvents.push('close'); }
  }), true);
  assert.deepStrictEqual(successfulCloseEvents, ['persist', 'release', 'close']);

  assert.doesNotMatch(appSource, /skipQueueWhenBusy|queuedAutoSaveRequest|lastPersistedSessionVersion/);
  assert.match(appSource, /const persistLatestSessionBeforeClose = async[\s\S]{0,2400}await autoSaveMutationQueue\.whenIdle\(\)[\s\S]{0,900}persistedFullSnapshotVersion >= targetVersion/);
  assert.match(appSource, /return await completeConversationClose\(\{[\s\S]{0,500}persistLatestSessionBeforeClose\(shouldForceSave\)[\s\S]{0,300}release: releaseCurrentConversationLease/);
  assert.match(appSource, /watch\(\[model, selectedVoice, tempReasoningEffort, sessionMcpServerIds, sessionSkillIds, isAutoApproveTools\]/);
  assert.match(appSource, /state: getSessionRequestConfigStatePatch\(\)/);
  assert.match(appSource, /typeof jsonData\.isAutoApproveTools === 'boolean'/);
  assert.match(appSource, /const isClosingWindow = ref\(false\)/);
  assert.match(appSource, /settlementPromise: turnSettlementPromise,[\s\S]{0,120}resolveSettlement: resolveTurnSettlement/);
  assert.match(appSource, /turnMeta\.resolveSettlement\?\.\(\)/);
  assert.match(appSource, /const assistantSettlementPromise = activeAssistantTurnMeta\?\.settlementPromise[\s\S]{0,240}waitForAssistantTurnToSettleBeforeClose\(assistantSettlementPromise\)/);

  assert.match(appSource, /isRestoringSessionSnapshot \|\| conversationReadOnly\.value \|\| conversationLeasePending\.value/);
  assert.match(appSource, /const hasUnpersistedSession = persistenceState\.hasUnpersistedMutations \|\| persistenceState\.hasUnpersistedFullSnapshot[\s\S]{0,450}conversation_unpersisted_changes_without_write_access/);
  assert.match(appSource, /conversationPersistenceTracker\.markPersisted\(\{ version, stateOnly: false \}\)/);
  assert.match(appSource, /conversationPersistenceTracker\.markPersisted\(\{ version, stateOnly: true \}\)/);

  assert.match(appSource, /acquireConversationWriteLease\(\{[\s\S]{0,700}repairConversationUiLinks\(\{/);
  assert.match(appSource, /repairConversationUiLinks\(\{[\s\S]{0,700}registerConversationWriteLease/);
  assert.match(appSource, /if \(Number\(repaired\?\.changed\) > 0\)[\s\S]{0,500}reloadConversationWindowFromStore/);
  assert.match(appSource, /const failedLease = conversationLease\.value;[\s\S]{0,500}releaseConversationWriteLease/);


  assert.match(appSource, /const waitForPendingWindowMutationsBeforeClose = async[\s\S]{0,900}activeApplyMcpPromise/);
  assert.match(appSource, /if \(isClosingWindow\.value \|\| !ensureConversationWriteAccess\(true\)\) return/);
  assert.match(appSource, /await waitForAssistantTurnToSettleBeforeClose\(assistantSettlementPromise\);[\s\S]{0,120}await waitForPendingWindowMutationsBeforeClose\(\)/);

  assert.match(appSource, /if \(!added\) return;[\s\S]{0,500}if \(isClosingWindow\.value\) return;[\s\S]{0,160}loading\.value = true/);

  assert.match(appSource, /:write-locked="conversationReadOnly \|\| conversationLeasePending \|\| isClosingWindow"/);

  console.log('Plugin conversation persistence lifecycle regression passed');
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
