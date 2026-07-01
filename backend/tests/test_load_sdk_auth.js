// Verify loadSdkAuth (exported from mcp_oauth_provider.js) resolves the SDK
// auth module in the current environment. In the non-bundled test env the
// top-level static require fails (pnpm isolation), so loadSdkAuth falls back
// to dynamic resolution via the adapter's dependency tree.
const provider = require('../src/mcp_oauth_provider.js');
try {
  const mod = provider.loadSdkAuth();
  console.log('loadSdkAuth OK: exports=' + Object.keys(mod).slice(0, 6).join(',') + '...');
  console.log('has auth fn:', typeof mod.auth === 'function');
  console.log('has UnauthorizedError:', typeof mod.UnauthorizedError === 'function');
  process.exit(0);
} catch (e) {
  console.error('loadSdkAuth FAILED:', e.message);
  process.exit(1);
}
