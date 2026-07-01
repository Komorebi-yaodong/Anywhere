// MCP auth regression tests — standalone node script (no test framework).
// Run: node tests/test_mcp_auth_regressions.js

const Module = require('module');

const memdb = {};
global.utools = {
	getNativeId: () => 'test-native-id',
	getAppId: () => 'test-app-id',
	db: {
		promises: {
			get: async (id) => memdb[id] || null,
			put: async (doc) => {
				if (doc._id && doc._rev) memdb[doc._id] = { _id: doc._id, _rev: doc._rev + 1, data: doc.data };
				else if (memdb[doc._id]) memdb[doc._id] = { _id: doc._id, _rev: memdb[doc._id]._rev + 1, data: doc.data };
				else memdb[doc._id] = { _id: doc._id, _rev: '1', data: doc.data };
			}
		}
	}
};

const capturedConfigs = [];
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
	if (request === '@langchain/mcp-adapters') {
		return {
			MultiServerMCPClient: class MockMultiServerMCPClient {
				constructor(configs) {
					this.configs = configs;
					capturedConfigs.push(configs);
				}
				async getTools() { return []; }
				async close() { }
			}
		};
	}
	return originalLoad.call(this, request, parent, isMain);
};

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
	if (cond) { passed++; console.log(`  PASS  ${name}`); }
	else { failed++; console.error(`  FAIL  ${name} ${detail || ''}`); }
}
async function run(name, fn) {
	try { await fn(); } catch (e) { failed++; console.error(`  FAIL  ${name} (threw)`, e); }
}

(async () => {
	try {
		const store = require('../src/mcp_oauth_store.js');
		const mcp = require('../src/mcp.js');

		console.log('\n[1] stdio OAuth env injection');
		await run('connectAndFetchTools injects current stdio access token', async () => {
			capturedConfigs.length = 0;
			await store.saveTokens('stdio-srv', {
				access_token: 'ACCESS-123',
				refresh_token: 'REFRESH-123',
				expires_at: Date.now() + 120000
			});
			await mcp.connectAndFetchTools('stdio-srv', {
				transport: 'stdio',
				command: 'node',
				auth: { type: 'oauth', oauth: { envMapping: ['CUSTOM_OAUTH_TOKEN'] } }
			});
			const runtimeConfig = capturedConfigs[0] && capturedConfigs[0]['stdio-srv'];
			ok('custom token env is injected', runtimeConfig && runtimeConfig.env && runtimeConfig.env.CUSTOM_OAUTH_TOKEN === 'ACCESS-123');
			ok('expiry env is injected', runtimeConfig && runtimeConfig.env && runtimeConfig.env.OAUTH_EXPIRES_AT);
		});

		await run('expired stdio token requests reauth before spawn', async () => {
			capturedConfigs.length = 0;
			await store.saveTokens('expired-srv', {
				access_token: 'OLD-ACCESS',
				refresh_token: 'OLD-REFRESH',
				expires_at: Date.now() - 120000
			});
			let needsReauth = false;
			try {
				await mcp.connectAndFetchTools('expired-srv', {
					transport: 'stdio',
					command: 'node',
					auth: { type: 'oauth', oauth: { envMapping: ['CUSTOM_OAUTH_TOKEN'] } }
				});
			} catch (e) {
				needsReauth = Boolean(e && e.needsReauth && /expired/i.test(String(e.message || e)));
			}
			ok('expired token throws needsReauth', needsReauth);
			ok('client is not spawned with expired token', capturedConfigs.length === 0);
		});

		console.log('\n[2] auth cache fingerprint');
		await run('tool fetch key includes auth changes', () => {
			const getToolFetchKey = mcp._test && mcp._test.getToolFetchKey;
			ok('test hook exposes getToolFetchKey', typeof getToolFetchKey === 'function');
			if (typeof getToolFetchKey !== 'function') return;
			const keyA = getToolFetchKey('srv', { transport: 'http', url: 'https://mcp.example', auth: { type: 'bearer', bearerToken: 'A' } });
			const keyB = getToolFetchKey('srv', { transport: 'http', url: 'https://mcp.example', auth: { type: 'bearer', bearerToken: 'B' } });
			const keyC = getToolFetchKey('srv', { transport: 'http', url: 'https://mcp.example', auth: { type: 'oauth', oauth: { scopes: ['x'] } } });
			ok('bearer token changes key', keyA !== keyB);
			ok('auth type changes key', keyA !== keyC);
		});
	} finally {
		Module._load = originalLoad;
	}

	console.log(`\nResult: ${passed} passed, ${failed} failed`);
	process.exit(failed === 0 ? 0 : 1);
})().catch(e => { Module._load = originalLoad; console.error('FATAL', e); process.exit(1); });
