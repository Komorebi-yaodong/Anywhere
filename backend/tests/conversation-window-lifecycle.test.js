'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const appSource = fs.readFileSync(path.join(root, 'Anywhere_window', 'src', 'App.vue'), 'utf8');
const windowPreloadSource = fs.readFileSync(path.join(root, 'backend', 'src', 'window_preload.js'), 'utf8');
const parentPreloadSource = fs.readFileSync(path.join(root, 'backend', 'src', 'preload.js'), 'utf8');

assert.match(appSource, /await loadSession\(opened\.sessionData\);[\s\S]{0,300}autoCloseOnBlur\.value = false;[\s\S]{0,120}syncAutoCloseOnBlurListener\(\);[\s\S]{0,120}await acquireCurrentConversationLease\(\);/, 'restored conversations must disable blur auto-close before acquiring the lease');
assert.match(appSource, /autoCloseOnBlur\.value && !loading\.value && !compacting\.value/, 'compaction must suppress blur auto-close');
assert.match(appSource, /registerConversationWriteLease\?\.\(\{[\s\S]*holderInstanceId: conversationInstanceId,[\s\S]*leaseEpoch: lease\.leaseEpoch/, 'successful lease acquisition must register the lease with the parent window');
assert.match(appSource, /if \(released\) window\.api\.clearRegisteredConversationWriteLease\?\.\(\);/, 'parent registration must only clear after release succeeds');

assert.match(windowPreloadSource, /event: 'conversation-lease-register'/);
assert.match(windowPreloadSource, /event: 'conversation-lease-clear'/);
assert.doesNotMatch(parentPreloadSource, /\bbw\.on\s*\(/, 'uTools BrowserWindow proxies do not support instance events');
assert.doesNotMatch(parentPreloadSource, /\bbw\.once\s*\(/, 'uTools BrowserWindow proxies do not support instance events');
assert.doesNotMatch(parentPreloadSource, /webContents\?\.on\?\./, 'uTools WebContents proxies do not support instance events');
assert.match(parentPreloadSource, /const WINDOW_LEASE_PROBE_INTERVAL_MS = 2000/);
assert.match(parentPreloadSource, /typeof bw\.isDestroyed !== 'function' \|\| bw\.isDestroyed\(\)/);
assert.match(parentPreloadSource, /typeof bw\.webContents\?\.isCrashed === 'function' && bw\.webContents\.isCrashed\(\)/);
assert.match(parentPreloadSource, /function releaseRegisteredWindowLease\(senderId, reason = 'closed'\)/);
assert.match(parentPreloadSource, /getConversationModule\(\)\.releaseWriteLease\(lease\)/);
assert.match(parentPreloadSource, /case 'conversation-lease-register':/);
assert.match(parentPreloadSource, /case 'conversation-lease-clear':/);

const topLevelWindowMapImport = parentPreloadSource.indexOf("\nconst { windowMap } = require('./data.js');")
const leaseRegistryStart = parentPreloadSource.indexOf('const windowConversationLeaseRegistry = new Map();')
const windowEventHubStart = parentPreloadSource.indexOf("ipcRenderer.on('window-event'")
const appendHandlerStart = parentPreloadSource.indexOf("'append_to_window': async")
const settingsHandlerStart = parentPreloadSource.indexOf("'Anywhere Settings': async")
assert(topLevelWindowMapImport >= 0 && leaseRegistryStart > topLevelWindowMapImport && windowEventHubStart > leaseRegistryStart, 'lease cleanup helpers must be declared at module scope before the window event hub')
assert(!(leaseRegistryStart > appendHandlerStart && leaseRegistryStart < settingsHandlerStart), 'lease cleanup helpers must not be nested inside append_to_window')

console.log('Plugin conversation window lifecycle regression passed');
