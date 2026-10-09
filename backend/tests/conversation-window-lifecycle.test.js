'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const appSource = fs.readFileSync(path.join(root, 'Anywhere_window', 'src', 'App.vue'), 'utf8');
const windowPreloadSource = fs.readFileSync(path.join(root, 'backend', 'src', 'window_preload.js'), 'utf8');
const parentPreloadSource = fs.readFileSync(path.join(root, 'backend', 'src', 'preload.js'), 'utf8');
const helperClientSource = fs.readFileSync(path.join(root, 'backend', 'src', 'conversationDbHelperClient.js'), 'utf8');
const helperSource = fs.readFileSync(path.join(root, 'backend', 'src', 'conversation_db_helper.js'), 'utf8');
const helperDiagnosticSource = fs.readFileSync(path.join(root, 'backend', 'src', 'conversationDbHelperDiagnostics.js'), 'utf8');

assert.match(appSource, /await loadSession\(opened\.sessionData\);[\s\S]{0,300}autoCloseOnBlur\.value = false;[\s\S]{0,120}syncAutoCloseOnBlurListener\(\);[\s\S]{0,120}await acquireCurrentConversationLease\(\);/, 'restored conversations must disable blur auto-close before acquiring the lease');
assert.match(appSource, /autoCloseOnBlur\.value && !loading\.value && !compacting\.value/, 'compaction must suppress blur auto-close');
assert.match(appSource, /appendFullHistory\(\{ role: "user", content: contentForHistory \}\);[\s\S]{0,400}prompt\.value = "";[\s\S]{0,160}scheduleAutoSave\(\{ reason: 'user-message', immediate: true \}\);/, 'consumed prompt must clear before the immediate user-message snapshot');
assert.match(appSource, /prompt\.value = savedPrompt;[\s\S]{0,220}scheduleInputDraftAutoSave\('buffer-restored-draft'\)/, 'buffer-restored unsent drafts must be persisted after the buffered message snapshot');

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
assert.match(parentPreloadSource, /conversationDbHelperClient\.invoke\('releaseConversationWriteLease', \[lease\]\)/);
assert.match(parentPreloadSource, /case 'conversation-lease-register':/);
assert.match(parentPreloadSource, /case 'conversation-lease-clear':/);
const rendererNativePatterns = /getConversationModule|conversation_runtime|conversationStore|sqliteSyncDriver|better-sqlite3|sqlite-native/;
assert.doesNotMatch(windowPreloadSource, rendererNativePatterns, 'conversation renderer must not load the native SQLite repository');
assert.doesNotMatch(parentPreloadSource, rendererNativePatterns, 'parent uTools renderer must not load the native SQLite repository');
assert.match(windowPreloadSource, /createConversationRpcClient/);
assert.match(parentPreloadSource, /createConversationRpcRequestHandler/);
assert.match(parentPreloadSource, /windowRpcCapabilityMap\.delete\(senderId\)/);
assert.match(windowPreloadSource, /delete safeData\.conversationRpcCapability;/, 'RPC capability must not be exposed to the Vue renderer');
assert.match(parentPreloadSource, /crypto\.timingSafeEqual\(expectedBytes, actualBytes\)/, 'parent RPC authorization must compare the per-window capability');
assert.match(windowPreloadSource, /heartbeatConversationWriteLease: invokeConversationLeaseHeartbeat/, 'conversation lease heartbeat must be single-flight across parent RPC');
assert.match(parentPreloadSource, /method === 'acquireConversationWriteLease'[\s\S]{0,700}windowConversationLeaseRegistry\.set\(request\.senderId, lease\)/, 'parent must register a successful lease before replying to the child');
assert.match(parentPreloadSource, /method === 'releaseConversationWriteLease'[\s\S]{0,300}windowConversationLeaseRegistry\.delete\(request\.senderId\)/, 'parent must clear a released lease without waiting for another child message');
assert.match(parentPreloadSource, /result = await invokeConversationHelperMethod\(method, args, \{ operationId \}\)/, 'all window conversation methods must run through the DB helper');
assert.match(parentPreloadSource, /conversationDbHelperClient\.invoke\('getConversationRequestMessages', \[input\]\)/, 'main-panel request history reads must run through the DB helper');
assert.match(parentPreloadSource, /const operationId = request\.requestId;/, 'child, parent, and helper diagnostics must share one random operation id');
assert.match(windowPreloadSource, /child-rpc-dispatch/);
assert.match(parentPreloadSource, /rpc-received/);
assert.match(parentPreloadSource, /window-terminal/);
assert.match(helperClientSource, /ELECTRON_RUN_AS_NODE: '1'/);
assert.match(helperClientSource, /spawn\(normalizedExecPath/);
assert.match(helperClientSource, /stdio: \['pipe', 'pipe', 'pipe'\]/);
assert.match(helperClientSource, /createJsonLineParser/);
assert.match(helperClientSource, /serializeJsonLine/);
assert.match(helperClientSource, /conversation_db_helper_breakpoint_exit/);
assert.doesNotMatch(helperClientSource, /fork\(|process\.send|process\.on\('message'|serialization: 'advanced'|windowMap|\.close\(\)|\.destroy\(\)/, 'helper client must use stdio JSONL and never control a uTools window');
assert.doesNotMatch(helperSource, /process\.send|process\.on\('message'|process\.on\('disconnect'/, 'helper must use stdin/stdout JSONL rather than Node IPC');
assert.match(helperSource, /createJsonLineParser/);
assert.match(helperSource, /serializeJsonLine/);
assert.match(helperSource, /getConversationRpcTarget\(method\)/, 'helper must enforce the shared fixed method whitelist');
assert.match(helperSource, /repositoryMethod = repository\?\.\[target\]/, 'helper must use only the mapped repository target');
assert.match(helperClientSource, /getConversationRpcTarget\(method\)/, 'client must reject methods outside the shared whitelist before spawning');
assert.doesNotMatch(helperDiagnosticSource, /conversationId|holderInstanceId|dirPath|sessionData|fullHistory|chat_show|content/, 'diagnostic logger must not whitelist sensitive conversation fields');


const dataSource = fs.readFileSync(path.join(root, 'backend', 'src', 'data.js'), 'utf8');
assert.match(dataSource, /msg\.conversationRpcCapability = conversationRpcCapability;/);
assert.match(dataSource, /Window creation queue error:[\s\S]{0,160}windowRpcCapabilityMap\.delete\(senderId\)|windowRpcCapabilityMap\.delete\(senderId\);[\s\S]{0,160}Window creation queue error:/, 'failed window creation must clear the RPC capability');



const topLevelWindowMapImport = parentPreloadSource.indexOf("\nconst { windowMap, windowRpcCapabilityMap } = require('./data.js');")
const leaseRegistryStart = parentPreloadSource.indexOf('const windowConversationLeaseRegistry = new Map();')
const windowEventHubStart = parentPreloadSource.indexOf("ipcRenderer.on('window-event'")
const appendHandlerStart = parentPreloadSource.indexOf("'append_to_window': async")
const settingsHandlerStart = parentPreloadSource.indexOf("'Anywhere Settings': async")
assert(topLevelWindowMapImport >= 0 && leaseRegistryStart > topLevelWindowMapImport && windowEventHubStart > leaseRegistryStart, 'lease cleanup helpers must be declared at module scope before the window event hub')
assert(!(leaseRegistryStart > appendHandlerStart && leaseRegistryStart < settingsHandlerStart), 'lease cleanup helpers must not be nested inside append_to_window')

console.log('Plugin conversation window lifecycle regression passed');
