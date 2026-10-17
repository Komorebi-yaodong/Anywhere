'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(backendRoot, 'src', 'sqlite-native');
const targetRoot = path.join(backendRoot, 'public', 'sqlite-native');
const catalogPath = path.join(sourceRoot, 'manifest.json');
const helperFiles = [
  'conversation_db_helper.js',
  'conversationDbHelperJsonProtocol.js',
  'conversationWindowRpc.js'
];

fs.rmSync(path.join(backendRoot, 'public', 'sqlite_worker.js'), { force: true });
fs.rmSync(path.join(backendRoot, 'public', 'conversationDbHelperDiagnostics.js'), { force: true });

if (!fs.existsSync(catalogPath)) {
  throw new Error(`SQLite native catalog missing: ${catalogPath}`);
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const profiles = catalog?.profiles && typeof catalog.profiles === 'object'
  ? catalog.profiles
  : {};
const profileNames = Object.keys(profiles);
if (profileNames.length === 0) throw new Error('SQLite native catalog has no profiles');

fs.rmSync(targetRoot, { recursive: true, force: true });
for (const profileName of profileNames) {
  const profile = profiles[profileName] || {};
  const manifestRelativePath = String(profile.manifest || '').trim();
  const manifestPath = path.join(sourceRoot, manifestRelativePath);
  const profileRoot = path.dirname(manifestPath);
  if (!manifestRelativePath || !fs.existsSync(manifestPath)) {
    throw new Error(`SQLite native manifest missing for ${profileName}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (String(manifest.moduleAbi || '') !== String(profile.moduleAbi || '')) {
    throw new Error(`SQLite native ABI catalog mismatch for ${profileName}`);
  }
  const targets = manifest?.targets && typeof manifest.targets === 'object'
    ? manifest.targets
    : {};
  const targetNames = Object.keys(targets);
  if (targetNames.length === 0) throw new Error(`SQLite native manifest has no targets for ${profileName}`);

  for (const targetName of targetNames) {
    const expectedHash = String(targets[targetName]?.sha256 || '').toLowerCase();
    const sourceFile = path.join(profileRoot, targetName, 'better_sqlite3.node');
    if (!fs.existsSync(sourceFile)) {
      throw new Error(`SQLite native binding missing for ${profileName}/${targetName}: ${sourceFile}`);
    }
    const content = fs.readFileSync(sourceFile);
    const actualHash = crypto.createHash('sha256').update(content).digest('hex');
    if (!expectedHash || actualHash !== expectedHash) {
      throw new Error(`SQLite native binding checksum mismatch for ${profileName}/${targetName}`);
    }
    const targetDir = path.join(targetRoot, profileName, targetName);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(sourceFile, path.join(targetDir, 'better_sqlite3.node'));
  }

  const targetProfileRoot = path.join(targetRoot, profileName);
  fs.mkdirSync(targetProfileRoot, { recursive: true });
  fs.copyFileSync(manifestPath, path.join(targetProfileRoot, 'manifest.json'));
  const licensePath = path.join(profileRoot, 'LICENSE.better-sqlite3.txt');
  if (!fs.existsSync(licensePath)) throw new Error(`SQLite license missing for ${profileName}: ${licensePath}`);
  fs.copyFileSync(licensePath, path.join(targetProfileRoot, 'LICENSE.better-sqlite3.txt'));
}

fs.copyFileSync(catalogPath, path.join(targetRoot, 'manifest.json'));
for (const helperFile of helperFiles) {
  const sourceFile = path.join(backendRoot, 'src', helperFile);
  if (!fs.existsSync(sourceFile)) throw new Error(`Conversation DB helper source missing: ${sourceFile}`);
  fs.copyFileSync(sourceFile, path.join(backendRoot, 'public', helperFile));
}
console.log(`Copied ${profileNames.length} verified SQLite native profiles.`);
