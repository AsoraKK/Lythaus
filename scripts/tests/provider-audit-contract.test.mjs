import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { test } from 'node:test';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const auditTestEnvironment = (overrides) => {
  const environment = { ...process.env, ...overrides };
  delete environment.NODE_TEST_CONTEXT;
  return environment;
};

const cloudflareAudit = read('scripts/cloudflare/audit-account.mjs');
const cloudflareWorkflow = read('.github/workflows/cloudflare-domain-audit.yml');
const planetscaleContractAudit = read('scripts/planetscale/audit-production-contract.mjs');
const planetscaleAccountAudit = read('scripts/planetscale/audit-account.mjs');
const planetscaleWorkflow = read('.github/workflows/planetscale-account-audit.yml');
const productionReleaseWorkflow = read('.github/workflows/production-release.yml');
const authIncidentAudit = read('scripts/ci/audit-production-auth-incident.mjs');
const authIncidentDatabase = read('scripts/ci/auth-incident-database-contract.mjs');

test('incident diagnostics default to read-only aggregates and require explicit approval to send',()=>{
  assert.match(authIncidentAudit,/AUTH_INCIDENT_SEND_PROBE === 'true'/);
  assert.ok(authIncidentAudit.indexOf('if (!sendProbe)')<authIncidentAudit.indexOf("method: 'POST',",authIncidentAudit.indexOf('if (!sendProbe)')));
  assert.match(authIncidentAudit,/reason:'explicit_send_approval_required'/);
  assert.match(authIncidentAudit,/captureIncidentDatabaseEvidence\(client\)/);
  assert.match(authIncidentDatabase,/oldest_pending_seconds/);
  assert.match(authIncidentDatabase,/abandoned_leases/);
  assert.match(authIncidentDatabase,/recoveryIntake24h/);
  assert.doesNotMatch(authIncidentDatabase,/SELECT[^;]+provider_message_id/);
});

test('Cloudflare inventory prefers canonical deployment token and throttles account reads', () => {
  assert.match(cloudflareAudit, /CLOUDFLARE_API_TOKEN \|\| process\.env\.CLOUDFLARE_AUDIT_API_TOKEN/);
  assert.match(cloudflareAudit, /response\.status === 429/);
  assert.match(cloudflareAudit, /for \(const \[name, url\] of Object\.entries\(endpoints\)\)/);
  assert.match(cloudflareAudit, /await sleep\(300\)/);
  assert.doesNotMatch(cloudflareAudit, /Promise\.all\(Object\.entries\(endpoints\)/);
});

test('Cloudflare inventory cannot pass as empty when provider evidence is incomplete', () => {
  assert.match(cloudflareAudit, /complete: requiredLythausFailures\.length === 0/);
  assert.match(cloudflareAudit, /failedEndpoints/);
  assert.match(cloudflareAudit, /requiredLythausFailures/);
  assert.match(cloudflareWorkflow, /Require complete provider evidence/);
  assert.match(cloudflareWorkflow, /\.complete == true/);
  assert.match(cloudflareWorkflow, /adminWorkerSettings\.state\.ok == true/);
  assert.match(cloudflareWorkflow, /provider state remains UNKNOWN\/BLOCKED/);
});

test('PlanetScale contract audit is read-only and delegates exact post-0020 verification', () => {
  assert.match(planetscaleContractAudit, /verify-planetscale-production-schema\.mjs/);
  assert.match(planetscaleContractAudit, /REQUIRE_PRODUCT_INTEGRITY_MIGRATION: 'true'/);
  assert.match(planetscaleContractAudit, /post0020Required: true/);
  assert.match(planetscaleContractAudit, /Observed post-0020 schema fingerprint:/);
  assert.match(planetscaleContractAudit, /Observed post-0020 relation count:/);
  assert.match(planetscaleContractAudit, /BEGIN READ ONLY/);
  assert.match(planetscaleContractAudit, /SHOW transaction_read_only/);
  assert.match(planetscaleContractAudit, /SHOW server_version/);
  assert.match(planetscaleContractAudit, /FROM pg_extension/);
  assert.match(planetscaleContractAudit, /FROM system\.schema_migrations/);
  assert.match(planetscaleContractAudit, /information_schema\.role_table_grants/);
  assert.doesNotMatch(
    planetscaleContractAudit,
    /client\.query\(\s*['"`]\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i,
  );
});

test('canonical production release requires the exact post-0020 schema identity', () => {
  assert.match(productionReleaseWorkflow, /\.post0020Required == true/);
  assert.match(productionReleaseWorkflow, /Observed post-0020 schema fingerprint:/);
  assert.match(productionReleaseWorkflow, /Observed post-0020 relation count:/);
  assert.match(productionReleaseWorkflow, /EXPECTED_DATABASE_SCHEMA_FINGERPRINT/);
  assert.match(productionReleaseWorkflow, /EXPECTED_DATABASE_RELATION_COUNT/);
  assert.doesNotMatch(productionReleaseWorkflow, /post0016Required|Observed post-0016/);
});

test('PlanetScale account audit supplies verifier evidence without mutation or DDL', () => {
  assert.match(planetscaleAccountAudit, /planetScaleServiceTokenAuthorizationHeader\(process\.env\.PLANETSCALE_API_TOKEN \?\? ''\)/);
  assert.match(planetscaleAccountAudit, /Authorization: authorization/);
  assert.doesNotMatch(planetscaleAccountAudit, /Bearer.*token/);
  assert.match(planetscaleWorkflow, /PLANETSCALE_SCHEMA_READ_DATABASE_URL/);
  assert.match(planetscaleWorkflow, /PSCALE_ROLE_IDENTIFIERS/);
  assert.match(planetscaleWorkflow, /PRODUCT_INTEGRITY_DATABASE_SCHEMA_FINGERPRINT/);
  assert.match(planetscaleWorkflow, /PRODUCT_INTEGRITY_DATABASE_RELATION_COUNT/);
  assert.match(planetscaleWorkflow, /audit-production-contract\.mjs/);
  assert.match(planetscaleWorkflow, /post0020Required/);
  assert.match(planetscaleWorkflow, /\.post0020Required == true/);
  assert.match(planetscaleWorkflow, /No provider mutation or DDL is performed/);
  assert.doesNotMatch(planetscaleWorkflow, /--request\s+(?:POST|PUT|PATCH|DELETE)/i);
});

test('PlanetScale account audit sends the service-token pair without a scheme or logging it', (t) => {
  const directory = mkdtempSync(join(os.tmpdir(), 'lythaus-planetscale-audit-auth-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fixture = join(directory, 'fetch.mjs');
  const requestsPath = join(directory, 'requests.jsonl');
  const output = join(directory, 'audit.json');
  const tokenPair = 'fixture-service-id:fixture-service-secret';
  writeFileSync(fixture, [
    "import { appendFileSync } from 'node:fs';",
    'globalThis.fetch = async (url, init = {}) => {',
    '  const parsedUrl = new URL(url);',
    "  if (parsedUrl.origin !== 'https://api.planetscale.com') throw new Error('Unexpected destination');",
    "  if ((init.method ?? 'GET') !== 'GET') throw new Error('Audit attempted a mutation');",
    "  appendFileSync(process.env.PLANETSCALE_TEST_REQUESTS, JSON.stringify({ url: String(url), authorization: init.headers?.Authorization }) + '\\n');",
    "  const payload = parsedUrl.pathname.endsWith('/branches')",
    "    ? { data: [{ name: 'main', production: true }, { name: 'development', production: false }] }",
    "    : { name: 'lythaus-core', branches_count: 2, region: { slug: 'us-east-1' } };",
    '  return new Response(JSON.stringify(payload), { status: 200 });',
    '};',
  ].join('\n'));

  const result = spawnSync(process.execPath, ['--import', fixture, 'scripts/planetscale/audit-account.mjs'], {
    cwd: root,
    env: auditTestEnvironment({
      PLANETSCALE_API_TOKEN: tokenPair,
      PLANETSCALE_TEST_REQUESTS: requestsPath,
      PLANETSCALE_AUDIT_OUTPUT: output,
    }),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(tokenPair), 'stdout must not contain the configured credential');
  assert.ok(!result.stderr.includes(tokenPair), 'stderr must not contain the configured credential');
  const requests = readFileSync(requestsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(new URL(request.url).hostname, 'api.planetscale.com');
    assert.ok(request.authorization === tokenPair, 'PlanetScale service-token ID:Token must be sent verbatim');
    assert.ok(!request.authorization.startsWith('Bearer '), 'service-token authentication must not use Bearer');
  }
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).assertions.exactlyOneProductionMain, true);
});

test('PlanetScale account audit rejects empty or malformed service-token pairs safely', (t) => {
  const directory = mkdtempSync(join(os.tmpdir(), 'lythaus-planetscale-audit-invalid-auth-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fixture = join(directory, 'fetch.mjs');
  writeFileSync(fixture, [
    "import { appendFileSync } from 'node:fs';",
    "globalThis.fetch = async () => { appendFileSync(process.env.PLANETSCALE_TEST_REQUESTS, 'called\\n'); return new Response('{}', { status: 200 }); };",
  ].join('\n'));

  const invalidPairs = [
    '',
    'fixture-malformed-no-delimiter',
    ':fixture-service-secret',
    'fixture-service-id:',
    'fixture-service-id:fixture-secret:extra',
    'fixture-service-id:fixture secret',
    ...Array.from({ length: 0x20 }, (_, index) => 'fixture-service-id:fixture-secret' + String.fromCharCode(0x80 + index)),
    'fixture-service-id:fixture-secret\r\nX-Injected: yes',
  ];

  for (const [index, tokenPair] of invalidPairs.entries()) {
    const requestsPath = join(directory, 'requests-' + index + '.txt');
    const result = spawnSync(process.execPath, ['--import', fixture, 'scripts/planetscale/audit-account.mjs'], {
      cwd: root,
      env: auditTestEnvironment({
        PLANETSCALE_API_TOKEN: tokenPair,
        PLANETSCALE_TEST_REQUESTS: requestsPath,
        PLANETSCALE_AUDIT_OUTPUT: join(directory, 'audit-' + index + '.json'),
      }),
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0, 'invalid service-token pairs must fail before making requests');
    assert.match(result.stderr, /PLANETSCALE_API_TOKEN must contain the service-token ID and token separated by a single colon/);
    if (tokenPair.length > 0) {
      assert.ok(!result.stderr.includes(tokenPair), 'validation errors must not echo credential input');
      assert.ok(!result.stdout.includes(tokenPair), 'stdout must not contain malformed credential input');
    }
    assert.equal(existsSync(requestsPath), false, 'invalid credentials must fail before provider calls');
  }
});

test('PlanetScale account audit redacts echoed service-token values from provider errors', (t) => {
  const directory = mkdtempSync(join(os.tmpdir(), 'lythaus-planetscale-audit-redaction-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fixture = join(directory, 'fetch.mjs');
  const tokenId = 'fixture-service-id';
  const tokenSecret = 'fixture-service-secret';
  const tokenPair = tokenId + ':' + tokenSecret;
  writeFileSync(fixture, [
    'globalThis.fetch = async (url, init = {}) => {',
    "  if (new URL(url).hostname !== 'api.planetscale.com') throw new Error('Unexpected destination');",
    "  if ((init.method ?? 'GET') !== 'GET') throw new Error('Audit attempted a mutation');",
    "  const [serviceTokenId, serviceToken] = process.env.PLANETSCALE_API_TOKEN.split(':');",
    "  const message = 'rejected ' + process.env.PLANETSCALE_API_TOKEN + ' ' + serviceTokenId + ' ' + serviceToken;",
    "  return new Response(JSON.stringify({ error: { message } }), { status: 401 });",
    '};',
  ].join('\n'));

  const result = spawnSync(process.execPath, ['--import', fixture, 'scripts/planetscale/audit-account.mjs'], {
    cwd: root,
    env: auditTestEnvironment({
      PLANETSCALE_API_TOKEN: tokenPair,
      PLANETSCALE_AUDIT_OUTPUT: join(directory, 'audit.json'),
    }),
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PlanetScale database inventory failed: 401 rejected \[redacted\] \[redacted\] \[redacted\]/);
  for (const credential of [tokenPair, tokenId, tokenSecret]) {
    assert.ok(!result.stderr.includes(credential), 'provider errors must not echo service-token components');
    assert.ok(!result.stdout.includes(credential), 'stdout must not contain service-token components');
  }
});

test('production auth incident audit uses only aggregate-safe verifier columns', () => {
  for (const column of ['status', 'verification_state', 'created_at', 'event_type', 'purpose', 'action']) {
    assert.ok(authIncidentDatabase.includes(`COUNT(${column})`));
  }
  assert.doesNotMatch(authIncidentDatabase, /COUNT\(\*\)|SELECT\s+\*/);
  assert.doesNotMatch(authIncidentDatabase, /email_ciphertext|password_hash|email_lookup_hmac/);
  assert.match(authIncidentAudit, /BEGIN READ ONLY/);
  assert.match(authIncidentDatabase, /SHOW transaction_read_only/);
});
