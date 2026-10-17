'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const preloadSource = fs.readFileSync(path.join(root, 'backend', 'src', 'preload.js'), 'utf8');
const lazyRuntimeSource = fs.readFileSync(path.join(root, 'backend', 'src', 'lazy_runtime.js'), 'utf8');

assert.match(preloadSource, /function getLazyRuntime\(\)\s*\{[\s\S]{0,180}lazy_runtime\.js/,
  'main preload must load heavyweight modules through the shared lazy runtime');
assert.doesNotMatch(preloadSource,
  /require\(['"]\.\/(?:chat|mcp_builtin|mcp|skill|compact|mcp_oauth_store|mcp_oauth_provider)\.js['"]\)/,
  'main preload must not duplicate lazy runtime dependencies');

for (const exportName of [
  'createChatCompletion', 'getRandomItem', 'batchTestProviderKeys',
  'invokeBuiltinTool', 'handleBgShellRequest', 'killAllBackgroundShells',
  'initializeMcpClient', 'invokeMcpTool', 'closeMcpClient',
  'connectAndFetchTools', 'connectAndInvokeTool', 'ensureMcpAuthenticated', 'getMcpAuthStatus',
  'listSkills', 'getSkillDetails', 'generateSkillToolDefinition', 'resolveSkillInvocation',
  'saveSkill', 'deleteSkill', 'exportSkillToPackage', 'exportSkillPackageBuffer',
  'extractSkillPackage', 'importSkillPackageBuffer', 'oauthStore', 'oauthProvider',
]) {
  assert.match(lazyRuntimeSource, new RegExp(`\\b${exportName}\\b`), `lazy runtime must expose ${exportName}`);
}

console.log('Preload lazy-runtime deduplication contract passed');
