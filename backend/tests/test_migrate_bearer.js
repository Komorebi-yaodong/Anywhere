// Standalone test for migrateLegacyBearer logic (extracted from Mcp.vue).
// Run: node tests/test_migrate_bearer.js
function normalizeAuth(auth) {
  if (!auth || typeof auth !== 'object') return { type: 'none', bearerToken: '' };
  return { type: auth.type || 'none', bearerToken: auth.bearerToken || '' };
}
function migrateLegacyBearer(headers, auth) {
  if (!headers || typeof headers !== 'object') return { headers, auth };
  const raw = headers['Authorization'] || headers['authorization'];
  if (typeof raw !== 'string') return { headers, auth };
  const m = raw.match(/^\s*Bearer\s+(.+?)\s*$/i);
  if (!m) return { headers, auth };
  const existing = auth && (auth.type === 'bearer' || auth.type === 'oauth');
  if (existing) return { headers, auth };
  const nh = { ...headers };
  delete nh['Authorization'];
  delete nh['authorization'];
  const na = normalizeAuth(auth);
  na.type = 'bearer';
  na.bearerToken = m[1];
  return { headers: nh, auth: na, migrated: true };
}
let pass = 0, fail = 0;
function ck(n, c) { if (c) pass++; else { fail++; console.error('FAIL', n); } }

let r = migrateLegacyBearer({ Authorization: 'Bearer abc123' }, { type: 'none' });
ck('bearer migrates', r.migrated === true && r.auth.bearerToken === 'abc123' && !r.headers.Authorization);

r = migrateLegacyBearer({ Authorization: 'Basic xxx' }, { type: 'none' });
ck('basic stays', r.migrated === undefined && r.headers.Authorization === 'Basic xxx');

r = migrateLegacyBearer({ Authorization: 'Bearer new' }, { type: 'bearer', bearerToken: 'old' });
ck('existing not overridden', r.migrated === undefined && r.auth.bearerToken === 'old' && r.headers.Authorization === 'Bearer new');

r = migrateLegacyBearer({ Foo: 'bar' }, { type: 'none' });
ck('no header noop', r.migrated === undefined);

r = migrateLegacyBearer({ authorization: 'Bearer zzz' }, { type: 'none' });
ck('lowercase key migrates', r.migrated === true && r.auth.bearerToken === 'zzz');

// batch: iterate servers
const servers = {
  s1: { headers: { Authorization: 'Bearer tok1' } },
  s2: { headers: { Authorization: 'Basic xyz' } },
  s3: { auth: { type: 'oauth' }, headers: { Authorization: 'Bearer keep' } }
};
let anyM = false;
for (const sid of Object.keys(servers)) {
  const srv = servers[sid];
  const rr = migrateLegacyBearer(srv.headers || {}, srv.auth);
  srv.headers = rr.headers; srv.auth = rr.auth;
  if (rr.migrated) anyM = true;
}
ck('batch migrated s1', servers.s1.auth.type === 'bearer' && servers.s1.auth.bearerToken === 'tok1' && !servers.s1.headers.Authorization);
ck('batch kept basic s2', servers.s2.headers.Authorization === 'Basic xyz');
ck('batch kept existing oauth s3', servers.s3.auth.type === 'oauth' && servers.s3.headers.Authorization === 'Bearer keep');
ck('batch flagged anyMigrated', anyM === true);

console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
