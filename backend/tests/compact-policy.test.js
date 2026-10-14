'use strict';

const assert = require('assert');
const { performance } = require('perf_hooks');
const {
  selectCompactionCut,
  createCompactionTimeoutContext,
  estimateMessagesTokens,
  estimateVisualImageTokens
} = require('../src/compact.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toolChainHistory() {
  return {
    systemMessages: [{ role: 'system', content: 'system rules' }],
    windowMessages: [
      { role: 'user', content: 'please complete this long running task ' + 'u '.repeat(260) },
      { role: 'assistant', content: 'I will inspect the project. ' + 'a '.repeat(260) },
      { role: 'assistant', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: 'tool result ' + 'r '.repeat(440) },
      { role: 'assistant', content: 'The first inspection is complete. ' + 'b '.repeat(260) },
      { role: 'assistant', tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'grep_search', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_2', content: 'second tool result ' + 's '.repeat(440) },
      { role: 'assistant', content: 'I have completed the second iteration. ' + 'c '.repeat(260) },
      { role: 'assistant', content: 'final in-progress reasoning ' + 'd '.repeat(260) }
    ]
  };
}

function candidates(input) {
  return selectCompactionCut({ ...input, thresholdTokens: Number.MAX_SAFE_INTEGER, preferredMaxTokens: Number.MAX_SAFE_INTEGER, includeCandidates: true }).candidates;
}

function verifyRatioWindow(ratio) {
  const input = toolChainHistory();
  const options = candidates(input);
  const target = options.find((item) => item.cutIndex > 1 && item.tokens > 0);
  assert(target, 'fixture must expose a nontrivial safe tool-chain boundary');
  const contextLength = Math.ceil(target.tokens / ratio);
  const thresholdTokens = Math.floor(contextLength * ratio);
  const preferredMaxTokens = Math.floor(contextLength * (ratio + ((1 - ratio) * 0.5)));
  const selected = selectCompactionCut({
    ...input,
    thresholdTokens,
    preferredMaxTokens,
    keepRecentRounds: 3
  });
  assert(selected.cutIndex > 0, `${ratio} must find a fallback boundary for a single-user tool chain`);
  assert(selected.tokens >= thresholdTokens && selected.tokens <= preferredMaxTokens, `${ratio} must prefer its configured threshold window`);
  return { selected, input };
}

async function main() {

  const pngHeader = Buffer.alloc(24);
  pngHeader[0] = 0x89;
  pngHeader.write('PNG', 1, 'ascii');
  pngHeader.writeUInt32BE(640, 16);
  pngHeader.writeUInt32BE(480, 20);
  const manualImage = `data:image/png;base64,${pngHeader.toString('base64')}`;
  const baseUserTokens = estimateMessagesTokens([{ role: 'user', content: [] }], { modelInput: 'qwen3-vl' });
  const imageTokens = estimateMessagesTokens([{ role: 'user', content: [{ type: 'image_url', image_url: { url: manualImage } }] }], { modelInput: 'qwen3-vl' });
  assert.equal(imageTokens - baseUserTokens, estimateVisualImageTokens({ width: 640, height: 480, modelInput: 'qwen3-vl' }));
  assert.notEqual(
    estimateVisualImageTokens({ width: 640, height: 480, modelInput: 'qwen3-vl' }),
    estimateVisualImageTokens({ width: 640, height: 480, modelInput: 'qwen2.5-vl' }),
    'Qwen3-VL and Qwen2.5-VL must use their respective visual patch sizes'
  );
  const perHighResolutionPage = estimateVisualImageTokens({ width: 4096, height: 4096, modelInput: 'qwen3-vl' });
  const pdfTokens = estimateMessagesTokens([{ role: 'user', content: [{
    type: 'file',
    file: { filename: 'synthetic.pdf', file_data: 'data:application/pdf;base64,JVBERi0=', tokenEstimate: { pageCount: 10 } }
  }] }], { modelInput: 'qwen3-vl' });
  assert.equal(pdfTokens - baseUserTokens, perHighResolutionPage * 10, 'a 10-page PDF must be estimated as 10 high-resolution visual pages');

  const legacyPdfBody = `%PDF-1.7\n${'/Type /Page\n'.repeat(10)}`;
  const legacyPdfTokens = estimateMessagesTokens([{ role: 'user', content: [{
    type: 'file',
    file: { filename: 'legacy.pdf', file_data: `data:application/pdf;base64,${Buffer.from(legacyPdfBody, 'latin1').toString('base64')}` }
  }] }], { modelInput: 'qwen3-vl' });
  assert.equal(legacyPdfTokens - baseUserTokens, perHighResolutionPage * 10, 'legacy PDFs without metadata must lazily recover their page count');


  const eighty = verifyRatioWindow(0.8);
  const ninety = verifyRatioWindow(0.9);
  assert.equal(eighty.selected.strategy, 'ai_unit_keep');
  assert.equal(ninety.selected.strategy, 'ai_unit_keep');
  assert.equal(eighty.selected.retentionKind, 'ai');
  assert.equal(ninety.selected.retentionKind, 'ai');

  const { windowMessages } = toolChainHistory();
  const openToolCall = selectCompactionCut({
    systemMessages: [],
    windowMessages: windowMessages.slice(0, 4),
    thresholdTokens: 1,
    preferredMaxTokens: Number.MAX_SAFE_INTEGER,
    keepRecentRounds: 0
  });
  assert.notEqual(openToolCall.cutIndex, 3, 'must not cut between assistant tool_calls and matching tool result');
  assert(openToolCall.cutIndex === 1 || openToolCall.cutIndex >= 4, 'selection must remain at a protocol-safe boundary');


  const largeHistory = [{ role: 'user', content: 'long task' }];
  for (let index = 0; index < 800; index += 1) {
    const id = `perf_${index}`;
    largeHistory.push({ role: 'assistant', tool_calls: [{ id, type: 'function', function: { name: 'tool', arguments: '{}' } }] });
    largeHistory.push({ role: 'tool', tool_call_id: id, content: 'result '.repeat(80) });
    largeHistory.push({ role: 'assistant', content: 'iteration complete' });
  }
  const perfStartedAt = performance.now();
  const largeSelection = selectCompactionCut({
    systemMessages: [{ role: 'system', content: 'rules' }],
    windowMessages: largeHistory,
    thresholdTokens: 1,
    preferredMaxTokens: Number.MAX_SAFE_INTEGER,
    keepRecentRounds: 3
  });
  const perfElapsedMs = performance.now() - perfStartedAt;
  assert(largeSelection.cutIndex > 0);
  assert(perfElapsedMs < 3000, `linear cut selection exceeded 3000ms: ${perfElapsedMs.toFixed(2)}ms`);

  const idle = createCompactionTimeoutContext(null, { totalTimeoutMs: 50, idleTimeoutMs: 10 });
  await wait(30);
  assert.equal(idle.signal.aborted, true);
  assert.equal(idle.getTimeoutCode(), 'compact_stream_idle_timeout');
  idle.cleanup();

  const total = createCompactionTimeoutContext(null, { totalTimeoutMs: 10, idleTimeoutMs: 50 });
  await wait(30);
  assert.equal(total.signal.aborted, true);
  assert.equal(total.getTimeoutCode(), 'compact_request_timeout');
  total.cleanup();

  console.log('Plugin compaction policy regression passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
