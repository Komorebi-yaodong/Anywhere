'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function findUtoolsExecutable() {
  const candidates = [
    process.env.UTOOLS_EXECUTABLE,
    process.platform === 'win32' && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'utools', 'uTools.exe')
      : '',
    process.platform === 'darwin' ? '/Applications/uTools.app/Contents/MacOS/uTools' : '',
    process.platform === 'linux' ? '/opt/uTools/utools' : ''
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

const executable = findUtoolsExecutable();
if (!executable) {
  console.log('uTools executable not found; ABI 110 DB helper integration skipped');
  process.exit(0);
}

const runnerPath = path.resolve(__dirname, 'conversation-db-helper-utools-runner.js');
const result = spawnSync(executable, [runnerPath], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
  windowsHide: true,
  timeout: 90_000,
  maxBuffer: 10 * 1024 * 1024
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  throw new Error(`uTools DB helper integration failed with status ${result.status}`);
}

const lines = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean);
const payload = JSON.parse(lines[lines.length - 1]);
assert.strictEqual(payload.ok, true);
assert.strictEqual(payload.node, '16.17.1');
assert.strictEqual(payload.electron, '22.3.27');
assert.strictEqual(payload.modules, '110');
assert.ok(Number(payload.firstPid) > 0);
assert.ok(Number(payload.secondPid) > 0);
assert.notStrictEqual(payload.firstPid, payload.secondPid);
assert.ok(Number(payload.revision) >= 2);
console.log(JSON.stringify(payload));

const allApiPath = path.resolve(__dirname, 'conversation-db-helper-all-api.test.js');
const allApiResult = spawnSync(executable, [allApiPath], {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    ANYWHERE_HELPER_USE_PUBLIC: '1'
  },
  encoding: 'utf8',
  windowsHide: true,
  timeout: 120_000,
  maxBuffer: 10 * 1024 * 1024
});
if (allApiResult.error) throw allApiResult.error;
if (allApiResult.status !== 0) {
  process.stdout.write(allApiResult.stdout || '');
  process.stderr.write(allApiResult.stderr || '');
  throw new Error(`uTools DB helper all-API integration failed with status ${allApiResult.status}`);
}
const allApiLines = String(allApiResult.stdout || '').trim().split(/\r?\n/).filter(Boolean);
const allApiPayload = JSON.parse(allApiLines[allApiLines.length - 1]);
assert.strictEqual(allApiPayload.ok, true);
assert.strictEqual(allApiPayload.node, '16.17.1');
assert.strictEqual(allApiPayload.electron, '22.3.27');
assert.strictEqual(allApiPayload.modules, '110');
assert.strictEqual(allApiPayload.publishedRuntime, true);
assert.ok(Number(allApiPayload.methods) >= 22);
console.log(JSON.stringify(allApiPayload));
