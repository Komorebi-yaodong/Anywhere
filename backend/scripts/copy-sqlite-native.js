'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(backendRoot, 'src', 'sqlite-native');
const targetRoot = path.join(backendRoot, 'public', 'sqlite-native');
const manifestPath = path.join(sourceRoot, 'manifest.json');
const helperFiles = [
  'conversation_db_helper.js',
  'conversationDbHelperDiagnostics.js'
];

fs.rmSync(path.join(backendRoot, 'public', 'sqlite_worker.js'), { force: true });

if (!fs.existsSync(manifestPath)) {
  throw new Error(`SQLite native manifest missing: ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const targets = manifest?.targets && typeof manifest.targets === 'object'
  ? manifest.targets
  : {};
const targetNames = Object.keys(targets);
if (targetNames.length === 0) throw new Error('SQLite native manifest has no targets');

fs.rmSync(targetRoot, { recursive: true, force: true });
for (const targetName of targetNames) {
  const expectedHash = String(targets[targetName]?.sha256 || '').toLowerCase();
  const sourceFile = path.join(sourceRoot, targetName, 'better_sqlite3.node');
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`SQLite native binding missing for ${targetName}: ${sourceFile}`);
  }
  const content = fs.readFileSync(sourceFile);
  const actualHash = crypto.createHash('sha256').update(content).digest('hex');
  if (!expectedHash || actualHash !== expectedHash) {
    throw new Error(`SQLite native binding checksum mismatch for ${targetName}`);
  }
  const targetDir = path.join(targetRoot, targetName);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourceFile, path.join(targetDir, 'better_sqlite3.node'));
}

fs.copyFileSync(manifestPath, path.join(targetRoot, 'manifest.json'));
const licensePath = path.join(sourceRoot, 'LICENSE.better-sqlite3.txt');
if (!fs.existsSync(licensePath)) throw new Error(`SQLite license missing: ${licensePath}`);
fs.copyFileSync(licensePath, path.join(targetRoot, 'LICENSE.better-sqlite3.txt'));
for (const helperFile of helperFiles) {
  const sourceFile = path.join(backendRoot, 'src', helperFile);
  if (!fs.existsSync(sourceFile)) throw new Error(`Conversation DB helper source missing: ${sourceFile}`);
  fs.copyFileSync(sourceFile, path.join(backendRoot, 'public', helperFile));
}
console.log(`Copied ${targetNames.length} verified SQLite native bindings.`);
