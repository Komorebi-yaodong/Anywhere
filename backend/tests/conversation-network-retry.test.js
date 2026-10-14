'use strict';

const assert = require('assert');

async function run() {
  const retry = await import(require('url').pathToFileURL(require('path').resolve(__dirname, '..', '..', 'Anywhere_window', 'src', 'utils', 'conversationNetworkRetry.js')).href);
  const {
    MAX_AUTOMATIC_NETWORK_RETRIES,
    createNetworkRetryingStream,
    getNetworkRetryDelayMs,
    isRetryableNetworkError,
    runWithNetworkRetries,
    waitForNetworkRetryDelay
  } = retry;
  const networkError = () => new Error('network error');
  const collect = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
  };

  assert.strictEqual(MAX_AUTOMATIC_NETWORK_RETRIES, 3);
  assert.deepStrictEqual([1, 2, 3].map(getNetworkRetryDelayMs), [1000, 2000, 4000]);
  assert.strictEqual(isRetryableNetworkError(networkError()), true);
  assert.strictEqual(isRetryableNetworkError(new Error('HTTP 401 unauthorized')), false);
  assert.strictEqual(isRetryableNetworkError(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })), false);

  let requestAttempts = 0;
  const retryNotices = [];
  const retryDelays = [];
  const result = await runWithNetworkRetries(async () => {
    requestAttempts += 1;
    if (requestAttempts <= 3) throw networkError();
    return 'ok';
  }, {
    maxRetries: MAX_AUTOMATIC_NETWORK_RETRIES,
    onRetry: ({ retryAttempt, maxRetries, delayMs }) => retryNotices.push({ retryAttempt, maxRetries, delayMs }),
    wait: async (delayMs) => { retryDelays.push(delayMs); }
  });
  assert.strictEqual(result, 'ok');
  assert.strictEqual(requestAttempts, 4, 'first request plus three extra retries');
  assert.deepStrictEqual(retryNotices, [
    { retryAttempt: 1, maxRetries: 3, delayMs: 1000 },
    { retryAttempt: 2, maxRetries: 3, delayMs: 2000 },
    { retryAttempt: 3, maxRetries: 3, delayMs: 4000 }
  ]);
  assert.deepStrictEqual(retryDelays, [1000, 2000, 4000]);

  let terminalAttempts = 0;
  await assert.rejects(
    runWithNetworkRetries(async () => {
      terminalAttempts += 1;
      throw new Error('HTTP 400 invalid_request_error');
    }, { maxRetries: MAX_AUTOMATIC_NETWORK_RETRIES, wait: async () => assert.fail('4xx must not retry') }),
    /400/
  );
  assert.strictEqual(terminalAttempts, 1);

  const abortController = new AbortController();
  const delayed = waitForNetworkRetryDelay(10_000, abortController.signal);
  abortController.abort();
  await assert.rejects(delayed, /aborted/i);

  let streamAttempts = 0;
  async function* failBeforeOutput() {
    throw networkError();
  }
  async function* succeedAfterRetry() {
    yield { type: 'response.output_text.delta', delta: 'recovered' };
  }
  const recoveredChunks = await collect(createNetworkRetryingStream(() => {
    streamAttempts += 1;
    return streamAttempts === 1 ? failBeforeOutput() : succeedAfterRetry();
  }, {
    maxRetries: MAX_AUTOMATIC_NETWORK_RETRIES,
    isMeaningfulChunk: (chunk) => Boolean(chunk?.delta),
    wait: async () => {}
  }));
  assert.strictEqual(streamAttempts, 2);
  assert.deepStrictEqual(recoveredChunks, [{ type: 'response.output_text.delta', delta: 'recovered' }]);

  let partialStreamAttempts = 0;
  async function* failAfterOutput() {
    yield { type: 'response.output_text.delta', delta: 'partial' };
    throw networkError();
  }
  await assert.rejects(
    collect(createNetworkRetryingStream(() => {
      partialStreamAttempts += 1;
      return failAfterOutput();
    }, {
      maxRetries: MAX_AUTOMATIC_NETWORK_RETRIES,
      isMeaningfulChunk: (chunk) => Boolean(chunk?.delta),
      wait: async () => assert.fail('a partial stream must not be replayed')
    })),
    /network error/
  );
  assert.strictEqual(partialStreamAttempts, 1);

  console.log('Plugin conversation network retry regression passed');
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
