'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const backendRoot = path.join(root, 'backend');
const sourceRoot = path.join(backendRoot, 'src');
const nativeRoot = path.join(sourceRoot, 'sqlite-native');
const runtime = require('../src/utoolsRuntime.js');

const expectedProfiles = {
  u7: { abi: '110', version: '8.7.0', electron: '22.x' },
  u8: { abi: '132', version: '12.4.1', electron: '34.5.8' },
};
const expectedTargets = ['win32-x64', 'darwin-arm64', 'darwin-x64', 'linux-x64'];

const catalog = JSON.parse(fs.readFileSync(path.join(nativeRoot, 'manifest.json'), 'utf8'));
assert.strictEqual(catalog.format, 2);
assert.deepStrictEqual(Object.keys(catalog.profiles).sort(), ['u7', 'u8']);

for (const [profileName, expected] of Object.entries(expectedProfiles)) {
  const profile = catalog.profiles[profileName];
  assert.strictEqual(String(profile.moduleAbi), expected.abi);
  const manifestPath = path.join(nativeRoot, profile.manifest);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(String(manifest.moduleAbi), expected.abi);
  assert.strictEqual(manifest.version, expected.version);
  assert.strictEqual(manifest.electronVersion, expected.electron);
  assert.deepStrictEqual(Object.keys(manifest.targets).sort(), expectedTargets.slice().sort());
  for (const target of expectedTargets) {
    const bindingPath = path.join(path.dirname(manifestPath), target, 'better_sqlite3.node');
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(bindingPath)).digest('hex');
    assert.strictEqual(actualHash, manifest.targets[target].sha256, `${profileName}/${target} binding hash mismatch`);
  }
}

assert.strictEqual(runtime.getUtoolsRuntime('110').id, 'u7');
assert.strictEqual(runtime.getUtoolsRuntime('132').id, 'u8');
assert.strictEqual(runtime.getUtoolsRuntime('999'), null);
assert.throws(() => runtime.requireSupportedUtoolsRuntime('999'), /utools_runtime_unsupported/);
assert.strictEqual(runtime.isUtools8OrLater('110'), false);
assert.strictEqual(runtime.isUtools8OrLater('132'), true);
assert.strictEqual(runtime.supportsBrowserWindowOAuthFallback('110'), true);
assert.strictEqual(runtime.supportsBrowserWindowOAuthFallback('132'), false);

const u7Feature = runtime.setCompatibleFeatureDescription({ code: 'test', description: 'stale' }, 'U7', '110');
assert.deepStrictEqual(u7Feature, { code: 'test', explain: 'U7' });
const u8Feature = runtime.setCompatibleFeatureDescription({ code: 'test', explain: 'stale' }, 'U8', '132');
assert.deepStrictEqual(u8Feature, { code: 'test', description: 'U8' });
assert.strictEqual(runtime.getCompatibleFeatureDescription({ explain: 'legacy' }, '110'), 'legacy');
assert.strictEqual(runtime.getCompatibleFeatureDescription({ description: 'modern' }, '132'), 'modern');
assert.strictEqual(runtime.getCompatibleFeatureDescription({ explain: 'legacy' }, '132'), 'legacy');

const baseWindowOptions = {
  useContentSize: true,
  webPreferences: { preload: './window_preload.js' },
};
const u7WindowOptions = runtime.createCompatibleWindowOptions(baseWindowOptions, { devTools: true, moduleAbi: '110' });
assert.strictEqual(u7WindowOptions.useContentSize, true);
assert.strictEqual(u7WindowOptions.webPreferences.devTools, true);
const u8WindowOptions = runtime.createCompatibleWindowOptions(baseWindowOptions, { devTools: true, moduleAbi: '132' });
assert.strictEqual(Object.hasOwn(u8WindowOptions, 'useContentSize'), false);
assert.strictEqual(Object.hasOwn(u8WindowOptions.webPreferences, 'devTools'), false);
assert.strictEqual(u8WindowOptions.webPreferences.preload, './window_preload.js');

const pluginConfig = JSON.parse(fs.readFileSync(path.join(root, 'v2.0.0', 'plugin.json'), 'utf8'));
assert.strictEqual(pluginConfig.main, 'main/index.html');
for (const feature of pluginConfig.features) {
  // explain/description are both optional static fields but each major
  // documents only one spelling. Keep the manifest on the safe intersection;
  // runtime-created features receive the ABI-specific field.
  assert.strictEqual(Object.hasOwn(feature, 'explain'), false, `${feature.code} static manifest must not send the U7-only field to U8`);
  assert.strictEqual(Object.hasOwn(feature, 'description'), false, `${feature.code} static manifest must not send the U8-only field to U7`);
}
const appendFilesCommand = pluginConfig.features.find((feature) => feature.code === 'append_global').cmds.find((command) => command.type === 'files');
assert.strictEqual(Object.hasOwn(appendFilesCommand, 'match'), false, 'U8 ignores broad file match regexes; unfiltered files is portable');

const packageJson = JSON.parse(fs.readFileSync(path.join(backendRoot, 'package.json'), 'utf8'));
assert.strictEqual(packageJson.dependencies['better-sqlite3-u7'], 'npm:better-sqlite3@8.7.0');
assert.strictEqual(packageJson.dependencies['better-sqlite3-u8'], 'npm:better-sqlite3@12.4.1');
assert.strictEqual(Object.hasOwn(packageJson.dependencies, 'better-sqlite3'), false, 'all native database loads must use an ABI alias');

const dataSource = fs.readFileSync(path.join(sourceRoot, 'data.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(sourceRoot, 'preload.js'), 'utf8');
const sqliteDriverSource = fs.readFileSync(path.join(sourceRoot, 'sqliteSyncDriver.js'), 'utf8');
const oauthCallbackSource = fs.readFileSync(path.join(sourceRoot, 'mcp_oauth_cb.js'), 'utf8');
const oauthStoreSource = fs.readFileSync(path.join(sourceRoot, 'mcp_oauth_store.js'), 'utf8');
const copyScriptSource = fs.readFileSync(path.join(backendRoot, 'scripts', 'copy-sqlite-native.js'), 'utf8');
assert.match(dataSource, /setCompatibleFeatureDescription/);
assert.match(dataSource, /getCompatibleFeatureDescription/);
assert.match(dataSource, /createCompatibleWindowOptions/);
assert.match(preloadSource, /expectedModuleAbi:\s*getCurrentModuleAbi\(\)/);
assert.match(sqliteDriverSource, /better-sqlite3-u7/);
assert.match(sqliteDriverSource, /better-sqlite3-u8/);
assert.match(sqliteDriverSource, /requireSupportedUtoolsRuntime/);
assert.match(sqliteDriverSource, /runtime\.nativeDirectory/);
assert.match(oauthCallbackSource, /supportsBrowserWindowOAuthFallback\(\)/);
assert.match(oauthCallbackSource, /mcp_oauth_loopback_callback_failed/);
assert.match(oauthStoreSource, /isUtools8OrLater\(\)/);
assert.match(oauthStoreSource, /mcp_oauth_native_id_unavailable/);
assert.match(copyScriptSource, /catalog\.profiles/);
assert.match(copyScriptSource, /profileName, targetName/);

console.log('uTools 7/8 runtime compatibility contract passed');
