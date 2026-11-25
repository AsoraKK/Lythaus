import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import { loadArtifacts, workerVersionCode } from './new-core-isolated-worker.mjs';

const [sourceDir, artifactDir] = process.argv.slice(2).map(path => resolve(path));
const require = createRequire(join(sourceDir, 'node_modules/wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const configBytes = await readFile(join(sourceDir, 'apps/lythaus-admin-api/wrangler.new-core-test.jsonc'));
const digest = data => createHash('sha256').update(data).digest('hex');
assert.equal(digest(configBytes), '0056b85f1b4b2ab10c01db76ea7a587744ef6224ff274afdfc835d5fa3c4a6ac');
const config = JSON.parse(configBytes);
const code = workerVersionCode(await loadArtifacts({ sourceDir, artifactDir }));
const indexBytes = await readFile(join(artifactDir, 'assets/index.html'));
const host = config.vars.EXPECTED_HOSTNAMES;
const databaseTest = process.argv[4] === '--local-pg';
let localPg;
if (databaseTest) {
  localPg = new URL(process.env.LOCAL_SCOPED_PG_FIXTURE);
  assert.equal(localPg.protocol, 'postgresql:');
  assert.equal(localPg.hostname, '127.0.0.1');
  assert.equal(localPg.username, 'lythaus_admin');
  assert.equal(localPg.pathname, '/postgres');
  assert.ok(localPg.port && !localPg.search && !localPg.hash);
}
const issuer = 'https://isolated-jwt-fixture.invalid';
const audience = digest('local-only');
const jwksUrl = issuer + '/cdn-cgi/access/certs';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const keyId = 'local-fixture';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: keyId, use: 'sig', alg: 'RS256' };
const seconds = Math.floor(Date.now() / 1000);
const claims = { aud: audience, iss: issuer, sub: 'local-asset-reader', iat: seconds, exp: seconds + 300 };
function assertion(overrides = {}, signingKey = privateKey, algorithm = 'RS256') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = encode({ alg: algorithm, kid: keyId }) + '.' + encode({ ...claims, ...overrides });
  const signature = sign(algorithm === 'RS512' ? 'RSA-SHA512' : 'RSA-SHA256', Buffer.from(input), signingKey);
  return input + '.' + signature.toString('base64url');
}
let assetReads = 0;
let jwksReads = 0;
let unexpectedOutbound = 0;
const bindings = { ...config.vars, ACCESS_TEAM_DOMAIN: new URL(issuer).host, ACCESS_AUDIENCES: audience,
  ...(databaseTest ? {ACCESS_SUBJECT_HMAC_KEY:'disposable-database-fixture'} : {}),
  ACCESS_JWKS_URL: jwksUrl, NEW_CORE_ACCESS_ISSUER: issuer, NEW_CORE_ACCESS_AUDIENCE_SHA256: digest(audience) };
const modules = code.modules.map(mod => ({
  type: mod.content_type === 'text/plain' ? 'Text' : 'ESModule', path: mod.name,
  contents: Buffer.from(mod.content_base64, 'base64'),
}));
assert.equal(modules[0].path, code.main_module);
const local = new Miniflare(convertV4MiniflareOptions({ workers: [{
  name: 'isolated-worker-runtime-test', modulesRoot: process.cwd(), modules,
  ...(databaseTest ? {hyperdrives:{DB_ADMIN_FRESH:localPg.toString()}} : {}),
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, bindings,
  serviceBindings: { ASSETS: request => {
    assert.equal(new URL(request.url).pathname, '/flags');
    assetReads++;
    return new Response(indexBytes, { headers: { 'content-type': 'text/html' } });
  } },
  outboundService: request => {
    if (request.url !== jwksUrl || request.method !== 'GET') {
      unexpectedOutbound++;
      return new Response(null, { status: 403 });
    }
    jwksReads++;
    return Response.json({ keys: [jwk] });
  },
}] }));
try {
  await local.ready;
  const invalidAssertions = [
    ['absent', undefined], ['malformed', 'malformed'], ['bad signature', assertion({}, otherKey)],
    ['expired', assertion({ exp: seconds - 300 })], ['wrong issuer', assertion({ iss: 'https://other.invalid' })],
    ['wrong audience', assertion({ aud: 'invalid' })],
    ['missing subject with email claim', assertion({ sub: undefined, email: 'fixture@example.invalid' })],
    ['blank subject', assertion({ sub: ' ' })],
    ['missing expiry', assertion({ exp: undefined })], ['not valid yet', assertion({ nbf: seconds + 300 })],
    ['wrong algorithm', assertion({}, privateKey, 'RS512')],
  ];
  for (const [label, token] of invalidAssertions) {
    const headers = token ? { 'cf-access-jwt-assertion': token } : {};
    const result = await local.dispatchFetch('https://' + host + '/flags', { headers });
    assert.equal(result.status, 401, label);
    await result.arrayBuffer();
    assert.equal(assetReads, 0, label);
  }
  const headers = { 'cf-access-jwt-assertion': assertion() };
  for (const origin of ['https://other.invalid', 'https://' + host + ':8443', 'http://' + host]) {
    const response = await local.dispatchFetch(origin + '/flags', { headers });
    assert.equal(response.status, 404, 'origin');
    await response.arrayBuffer();
    assert.equal(assetReads, 0);
  }
  const accepted = await local.dispatchFetch('https://' + host + '/flags', { headers });
  assert.equal(accepted.status, 200);
  assert.equal(digest(Buffer.from(await accepted.arrayBuffer())), digest(indexBytes));
  assert.equal(assetReads, 1);
  assert.ok(jwksReads > 0);
  assert.equal(unexpectedOutbound, 0);
  if (databaseTest) {
    const read = async (label,path,expected) => {
      const r = await local.dispatchFetch('https://' + host + path, { headers });
      assert.equal(r.status, expected, label);
      assert.ok(r.headers.get('content-type').includes('application/json'));
      const data = await r.json();
      if (expected === 403) assert.equal(data.error, 'admin_role_required');
    };
    await read('nonmember', '/api/admin/moderation/cases', 403);
    const bootstrap = () => local.dispatchFetch('https://' + host + '/api/admin/bootstrap/first-administrator', {
      method: 'POST', headers: {...headers, origin:'https://' + host, 'content-type':'application/json'},
      body: JSON.stringify({confirmation:'BOOTSTRAP FIRST ADMINISTRATOR'}),
    });
    const boots = await Promise.all([bootstrap(),bootstrap()]);
    assert.deepEqual(boots.map(r=>r.status).sort(), [201,409]);
    for (const r of boots) await r.arrayBuffer();
    await read('health','/api/admin/health',200);
    await read('moderation','/api/admin/moderation/cases',200);
    const closed = await bootstrap();
    assert.equal(closed.status,409);
    assert.equal((await closed.json()).error,'bootstrap_closed');
    assert.equal(unexpectedOutbound,0);
  }
  console.log(JSON.stringify({ workerdStartup: true, deniedAssertions: invalidAssertions.length, deniedOrigins: 3,
    verifiedSignedAsset: true, externalRequests: 0, localDatabaseTest:databaseTest }));
} finally {
  await local.dispose();
}
