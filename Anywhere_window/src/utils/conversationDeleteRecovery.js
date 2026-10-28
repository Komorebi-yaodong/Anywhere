import {createRenderableMutationSignature, rebindUniqueConversationLinks, resolveSafeConversationMutationTarget} from './conversationMessageTarget.js';

const toolIdentity = message => JSON.stringify((message?.tool_calls || []).map(call => call?.id || '').sort());
const fingerprint = message => `${createRenderableMutationSignature(message)}:${toolIdentity(message)}:${message?.storageId || ''}`;

// At most one recovery per click. The caller's live tail and drafts remain authoritative.
export function createConversationDeleteRecovery({getState, canMutate, readHistory, apply, remove, onFailure}) {
  let active = null;
  const recover = (target, authorization = null) => {
    if (active) return active;
    const initial = getState();
    const expected = fingerprint(target);
    const capturedHistory = initial.full.map(message => message?.storageId || `${message?.role}:${createRenderableMutationSignature(message)}`).join('|');
    const capturedUi = initial.ui.map(message => `${message?.uiStorageId || message?.id}:${fingerprint(message)}`).join('|');
    const valid = () => {
      const state = getState();
      return canMutate(authorization) && state.storage?.conversationId === initial.storage?.conversationId
        && state.storage?.dirPath === initial.storage?.dirPath && state.lease === initial.lease
        && state.version === initial.version && state.ui.includes(target) && fingerprint(target) === expected
        && state.full.map(message => message?.storageId || `${message?.role}:${createRenderableMutationSignature(message)}`).join('|') === capturedHistory
        && state.ui.map(message => `${message?.uiStorageId || message?.id}:${fingerprint(message)}`).join('|') === capturedUi;
    };
    active = (async () => {
      if (!valid()) return false;
      const opened = await readHistory(initial.storage);
      if (!valid()) return false;
      const state = getState();
      const persisted = opened?.sessionData?.fullHistory || [];
      if (Number(opened?.descriptor?.revision) !== Number(state.storage?.revision)) throw new Error('conversation_revision_conflict');
      const paging = state.storage?.isPaged === true;
      const lower = Number(state.storage?.loadedFromOrdinal) || 0;
      const known = new Set(state.full.map(message => message?.storageId).filter(Boolean));
      // Only prepend rows outside the loaded canonical window. Never resurrect a locally
      // deleted/edited row inside the window or replace unsaved assistant/user messages.
      const prefix = paging ? persisted.filter(message => message.role !== 'system' && Number(message.storageOrdinal) < lower && !known.has(message.storageId)) : [];
      const merged = [...state.full.filter(message => message.role === 'system'), ...prefix, ...state.full.filter(message => message.role !== 'system')];
      const rebound = rebindUniqueConversationLinks(merged, state.ui);
      const index = state.ui.indexOf(target);
      if (resolveSafeConversationMutationTarget(merged, rebound, index) < 0) return false;
      if (!valid()) return false;
      apply({fullHistory: merged, uiMessages: rebound, loadedFromOrdinal: paging ? (merged.find(message => message.role !== 'system')?.storageOrdinal || lower) : null});
      return await remove(index, authorization, true);
    })().catch(() => false).then(result => {
      if (!result && valid()) onFailure?.();
      return result;
    }).finally(() => {active = null;});
    return active;
  };
  return {recover, isRecovering: () => Boolean(active)};
}
