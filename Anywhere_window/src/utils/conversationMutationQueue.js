export function mergeConversationMutationRequests(currentRequest = null, incomingRequest = null) {
  if (!currentRequest) return incomingRequest ? { ...incomingRequest } : null;
  if (!incomingRequest) return { ...currentRequest };
  return {
    force: Boolean(currentRequest.force || incomingRequest.force),
    reason: incomingRequest.reason || currentRequest.reason || 'queued',
    version: Math.max(Number(currentRequest.version) || 0, Number(incomingRequest.version) || 0),
    skipProjectAssignment: Boolean(currentRequest.skipProjectAssignment && incomingRequest.skipProjectAssignment),
    stateOnly: currentRequest.stateOnly === true && incomingRequest.stateOnly === true
  };
}

export function createConversationPersistenceTracker() {
  let requiredMutationVersion = 0;
  let requiredFullSnapshotVersion = 0;
  let persistedMutationVersion = 0;
  let persistedFullSnapshotVersion = 0;

  const normalizeVersion = (version) => Math.max(0, Number(version) || 0);
  const markRequired = ({ version = 0, stateOnly = false } = {}) => {
    const normalizedVersion = normalizeVersion(version);
    requiredMutationVersion = Math.max(requiredMutationVersion, normalizedVersion);
    if (stateOnly !== true) {
      requiredFullSnapshotVersion = Math.max(requiredFullSnapshotVersion, normalizedVersion);
    }
  };
  const markPersisted = ({ version = 0, stateOnly = false } = {}) => {
    const normalizedVersion = normalizeVersion(version);
    persistedMutationVersion = Math.max(persistedMutationVersion, normalizedVersion);
    if (stateOnly !== true) {
      persistedFullSnapshotVersion = Math.max(persistedFullSnapshotVersion, normalizedVersion);
    }
  };
  const getState = () => ({
    requiredMutationVersion,
    requiredFullSnapshotVersion,
    persistedMutationVersion,
    persistedFullSnapshotVersion,
    hasUnpersistedMutations: requiredMutationVersion > persistedMutationVersion,
    hasUnpersistedFullSnapshot: requiredFullSnapshotVersion > persistedFullSnapshotVersion
  });
  const reset = () => {
    requiredMutationVersion = 0;
    requiredFullSnapshotVersion = 0;
    persistedMutationVersion = 0;
    persistedFullSnapshotVersion = 0;
  };

  return { markRequired, markPersisted, getState, reset };
}



export async function completeConversationClose({ persist, release, close } = {}) {
  if (typeof persist !== 'function' || typeof release !== 'function' || typeof close !== 'function') {
    throw new TypeError('conversation_close_callbacks_required');
  }
  const saved = await persist();
  if (saved !== true) throw new Error('conversation_close_save_incomplete');
  await release();
  await close();
  return true;
}

export function createConversationMutationQueue(executeMutation) {
  if (typeof executeMutation !== 'function') {
    throw new TypeError('conversation_mutation_executor_required');
  }

  let pendingRequest = null;
  let running = false;
  let waiters = [];
  let idleWaiters = [];

  const settleThrough = (version, result, error = null) => {
    const remaining = [];
    for (const waiter of waiters) {
      if (waiter.version <= version) {
        if (error) waiter.reject(error);
        else waiter.resolve(result);
      } else {
        remaining.push(waiter);
      }
    }
    waiters = remaining;
  };

  const settleIdle = () => {
    if (running || pendingRequest) return;
    const pendingIdleWaiters = idleWaiters;
    idleWaiters = [];
    pendingIdleWaiters.forEach((resolve) => resolve(true));
  };

  const pump = async () => {
    if (running) return;
    running = true;
    try {
      while (pendingRequest) {
        const request = pendingRequest;
        pendingRequest = null;
        const version = Math.max(0, Number(request.version) || 0);
        try {
          const result = await executeMutation(request) === true;
          settleThrough(version, result);
        } catch (error) {
          settleThrough(version, false, error);
        }
      }
    } finally {
      running = false;
      if (pendingRequest) void pump();
      else settleIdle();
    }
  };

  const enqueue = (request = {}) => {
    const normalizedRequest = { ...request, version: Math.max(0, Number(request.version) || 0) };
    pendingRequest = mergeConversationMutationRequests(pendingRequest, normalizedRequest);
    const completion = new Promise((resolve, reject) => {
      waiters.push({ version: normalizedRequest.version, resolve, reject });
    });
    void pump();
    return completion;
  };

  const whenIdle = () => {
    if (!running && !pendingRequest) return Promise.resolve(true);
    return new Promise((resolve) => { idleWaiters.push(resolve); });
  };

  return {
    enqueue,
    whenIdle,
    getPendingRequest: () => pendingRequest ? { ...pendingRequest } : null
  };
}
