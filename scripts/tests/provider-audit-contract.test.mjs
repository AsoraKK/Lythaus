import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { test } from 'node:test';
import { join, resolve } from 'node:path';
import { canonicalReleaseSchemaContract } from '../ci/product-integrity-schema-contract.mjs';

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

test('PlanetScale contract audit is read-only and delegates exact post-0021 verification', () => {
  assert.match(planetscaleContractAudit, /verify-planetscale-production-schema\.mjs/);
  assert.match(planetscaleContractAudit, /REQUIRE_PRODUCT_INTEGRITY_MIGRATION: 'true'/);
  assert.match(planetscaleContractAudit, /\[releaseRequirementKey\]: false/);
  assert.match(planetscaleContractAudit, /report\[releaseRequirementKey\] = report\.verifierPassed/);
  assert.match(planetscaleContractAudit, /releaseLabel/);
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

test('canonical production release requires the exact post-0021 schema identity', () => {
  assert.match(productionReleaseWorkflow, /\.post0021Required == true/);
  assert.match(productionReleaseWorkflow, /Observed post-0021 schema fingerprint:/);
  assert.match(productionReleaseWorkflow, /Observed post-0021 relation count:/);
  assert.match(productionReleaseWorkflow, /EXPECTED_DATABASE_SCHEMA_FINGERPRINT/);
  assert.match(productionReleaseWorkflow, /EXPECTED_DATABASE_RELATION_COUNT/);
  assert.match(productionReleaseWorkflow, /vars\.PRODUCT_INTEGRITY_DATABASE_SCHEMA_FINGERPRINT/);
  assert.match(productionReleaseWorkflow, /vars\.PRODUCT_INTEGRITY_DATABASE_RELATION_COUNT/);
  assert.doesNotMatch(productionReleaseWorkflow, /post0016Required|Observed post-0016/);
});

test('PlanetScale account audit supplies verifier evidence without mutation or DDL', () => {
  assert.match(planetscaleAccountAudit, /planetScaleServiceTokenAuthorizationHeader\(process\.env\.PLANETSCALE_API_TOKEN \?\? ''\)/);
  assert.match(planetscaleAccountAudit, /Authorization: authorization/);
  assert.doesNotMatch(planetscaleAccountAudit, /Bearer.*token/);
  assert.match(planetscaleWorkflow, /PLANETSCALE_SCHEMA_READ_DATABASE_URL/);
  assert.match(planetscaleWorkflow, /PSCALE_ROLE_IDENTIFIERS/);
  assert.match(planetscaleWorkflow, /vars\.PRODUCT_INTEGRITY_DATABASE_SCHEMA_FINGERPRINT/);
  assert.match(planetscaleWorkflow, /vars\.PRODUCT_INTEGRITY_DATABASE_RELATION_COUNT/);
  assert.match(planetscaleWorkflow, /audit-production-contract\.mjs/);
  assert.match(planetscaleWorkflow, /post0021Required/);
  assert.match(planetscaleWorkflow, /\.post0021Required == true/);
  assert.match(planetscaleWorkflow, /No provider mutation or DDL is performed/);
  assert.doesNotMatch(planetscaleWorkflow, /--request\s+(?:POST|PUT|PATCH|DELETE)/i);
});

test('actual audit wrapper preserves strict certification while emitting sanitized baseline and failure evidence', (t) => {
  const directory = mkdtempSync(join(os.tmpdir(), 'lythaus-account-audit-baseline-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const canonical = canonicalReleaseSchemaContract({ root, committedOnly: true });
  const pgModule = createRequire(import.meta.url).resolve('pg');
  const calls = join(directory, 'calls.jsonl');
  const output = join(directory, 'contract.json');
  const fixturePath = join(directory, 'fixture.mjs');
  const verifierLog = join(directory, 'verifier.log');
  const fixture = [
    "import fs from 'node:fs';",
    "import assert from 'node:assert/strict';",
    "import cp from 'node:child_process';",
    "import { syncBuiltinESMExports } from 'node:module';",
    "import { mock } from 'node:test';",
    'const calls = ' + JSON.stringify(calls) + ';',
    'const complete = process.env.AUDIT_FIXTURE_COMPLETE === "true";',
    'const registry = ' + JSON.stringify(canonical.migrations) + ';',
    'if (!complete) registry.pop();',
    'const relations = ' + JSON.stringify(canonical.relations) + ';',
    'const spawn = cp.spawnSync;',
    'cp.spawnSync = (command, args, options) => { const result = spawn(command, ["--experimental-test-module-mocks", "--import", ' + JSON.stringify(fixturePath) + ', ...args], options); fs.writeFileSync(' + JSON.stringify(verifierLog) + ', String(result.stderr ?? "")); return result; };',
    'syncBuiltinESMExports();',
    "const record = (operation) => fs.appendFileSync(calls, JSON.stringify({ program: process.argv[1], operation }) + '\\n');",
    'mock.module(' + JSON.stringify(pgModule) + ', { defaultExport: { Client: class {',
    "  async connect() { record('connect'); if (process.env.AUDIT_FIXTURE_CONNECT_FAIL === 'true') throw Object.assign(new Error('fixture-private-marker'), { code: '28P01' }); }",
    '  async end() {}',
    '  async query(sql) {',
    '    record(sql);',
    "    const statement = sql.replace(/^\\s*\\/\\*[\\s\\S]*?\\*\\/\\s*/, '');",
    "    assert.ok(/^(BEGIN READ ONLY|SHOW|SELECT|WITH|ROLLBACK)/.test(statement));",
    "    if (sql === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'on' }] };",
    "    if (sql === 'SHOW server_version') return { rows: [{ server_version: '17.6' }] };",
    "    if (sql === 'SELECT version, checksum FROM system.schema_migrations ORDER BY version') {",
    "      if (process.env.AUDIT_FIXTURE_QUERY_FAIL === 'true') throw Object.assign(new Error('fixture-private-marker'), { code: '42501' });",
    '      return { rows: registry, rowCount: registry.length };',
    '    }',
    "    if (sql.includes('SELECT table_type, table_schema, table_name FROM information_schema.tables')) return { rows: relations, rowCount: relations.length };",
    "    if (sql.includes('SELECT table_type, table_schema, table_name\\n')) return { rows: relations, rowCount: relations.length };",
    "    if (sql.includes('COUNT(DISTINCT grantee)')) return { rows: [{ role_count: 4 }] };",
    "    if (sql.includes('FROM information_schema.role_table_grants')) return { rows: [{ privilege_type: 'SELECT', grant_count: 1 }] };",
    "    if (sql.includes('migration-artifact:') || /\\bAS present\\b/.test(sql) || sql.includes('SELECT EXISTS') || sql.includes(\"to_regclass('marketing.waitlist_signups')\") || sql.includes('has_schema_privilege($1')) {",
    "      const row = Object.fromEntries([...sql.matchAll(/\\bAS\\s+([a-z_][a-z0-9_]*)/g)].map(match => [match[1], true]));",
    "      if ('index_build_is_active' in row) row.index_build_is_active = false;",
    "      for (const name of ['runtime_admin_memberships_insert','runtime_user_entitlements_insert','runtime_select','admin_select_hmac','admin_update_ciphertext','admin_verification_token_hash_select','admin_reset_token_hash_select','admin_acceptance_context_select','privacy_select_ciphertext','jobs_verification_hash_select','jobs_reset_hash_select']) if (name in row) row[name] = false;",
    '      return { rows: [row] };',
    '    }',
    '    return { rows: [] };',
    '  }',
    '} } });',
  ].join('\n');
  writeFileSync(fixturePath, fixture);
  const staleFingerprint = 'd60ce56eda3165e4c21e880e594700b92425b75b0e6eec963caf75fc72d8c1e0';
  const cases = [
    { fingerprint: staleFingerprint },
    { fingerprint: canonical.fingerprint },
    { fingerprint: staleFingerprint, connectionFails: true },
    { fingerprint: canonical.fingerprint, complete: true },
    { fingerprint: staleFingerprint, complete: true },
    { fingerprint: staleFingerprint, queryFails: true },
  ];
  for (const scenario of cases) {
    const { fingerprint, connectionFails = false, complete = false, queryFails = false } = scenario;
    writeFileSync(calls, '');
    const result = spawnSync(process.execPath, [
      '--experimental-test-module-mocks', '--import', fixturePath, 'scripts/planetscale/audit-production-contract.mjs',
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
      env: auditTestEnvironment({
        PLANETSCALE_SCHEMA_READ_DATABASE_URL: 'postgresql://schema@fixture.invalid/postgres?sslmode=verify-full',
        PLANETSCALE_CONTRACT_AUDIT_OUTPUT: output,
        EXPECTED_DATABASE_SCHEMA_FINGERPRINT: fingerprint,
        EXPECTED_DATABASE_RELATION_COUNT: '103',
        PSCALE_ROLE_IDENTIFIERS: JSON.stringify({ lythaus_runtime: 'pscale_api_fixturepublic', lythaus_admin: 'pscale_api_fixtureadmin', lythaus_privacy: 'pscale_api_fixtureprivacy', lythaus_jobs: 'pscale_api_fixturejobs' }),
        AUDIT_FIXTURE_CONNECT_FAIL: String(connectionFails),
        AUDIT_FIXTURE_COMPLETE: String(complete),
        AUDIT_FIXTURE_QUERY_FAIL: String(queryFails),
      }),
    });
    const passed = fingerprint === canonical.fingerprint && complete && !connectionFails && !queryFails;
    assert.equal(result.status, passed ? 0 : 1, JSON.stringify(scenario) + '\n' + result.stderr + '\n' + readFileSync(verifierLog, 'utf8'));
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.verifierPassed, passed);
    assert.equal(report.post0021Required, passed);
    assert.equal(report.evidenceClass, passed ? 'RELEASE_CONTRACT' : 'BASELINE_ONLY_NOT_RELEASE_EVIDENCE');
    assert.equal(report.releaseIdentity.configured.fingerprint, fingerprint);
    assert.equal(report.releaseIdentity.required.fingerprint, canonical.fingerprint);
    assert.equal(report.releaseIdentity.configuredMatchesRequired, fingerprint === canonical.fingerprint);
    assert.equal(report.verifierDiagnostic.reason, fingerprint === staleFingerprint
      ? 'configured_release_identity_mismatch' : passed ? null : 'production_schema_verifier_failed');
    const operations = readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
    if (fingerprint === staleFingerprint) {
      assert.ok(operations.every(row => row.program.endsWith('audit-production-contract.mjs')),
        'stale identity must reject before the verifier connects; only the separate baseline connects');
    }
    if (connectionFails || queryFails) {
      assert.deepEqual(report.baselineFailure, { phase: connectionFails ? 'connect' : 'catalog', code: connectionFails ? '28P01' : '42501' });
      assert.equal(report.baselineStatus, 'UNKNOWN/BLOCKED');
      assert.equal(report.transactionReadOnly, !connectionFails);
      assert.equal(report.migrationLedger, undefined);
    } else {
      assert.equal(report.baselineStatus, 'CAPTURED');
      assert.equal(report.transactionReadOnly, true);
      assert.equal(report.migrationLedger.count, complete ? 22 : 21);
      assert.equal(report.migrationLedger.expectedReleaseCount, 22);
      assert.equal(report.migrationLedger.last, complete ? '0021_media_quarantine_cleanup.sql' : '0020_auth_recovery_delivery.sql');
      assert.equal(report.observedSchema.fingerprint, complete ? canonical.fingerprint : staleFingerprint);
      assert.equal(report.observedSchema.matchesRequiredIdentity, complete);
      assert.ok(operations.some(row => row.operation === 'BEGIN READ ONLY'));
      assert.ok(operations.some(row => row.operation === 'ROLLBACK'));
    }
    if (passed) assert.ok(report.verifierOutput.some(line => line.includes('Observed post-0021 schema fingerprint: ' + canonical.fingerprint)));
    else assert.deepEqual(report.verifierOutput, []);
    for (const text of [readFileSync(output, 'utf8'), result.stdout, result.stderr]) {
      assert.ok(!text.includes('fixture-private-marker'));
      assert.ok(!text.includes('postgresql://'));
    }
  }
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

test('actual auth incident audit records Queue facts with read-only SQL and no real email operation', t => {
  const authAccount='e5b7ae46e04698f507b7e4b3d4ef1af0', lifecycleId='1'.repeat(32), deadLetterId='2'.repeat(32);
  const directory = mkdtempSync(join(os.tmpdir(), 'lythaus-auth-queue-audit-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, 'audit.json'), calls = join(directory, 'calls.jsonl');
  const pgModule = createRequire(import.meta.url).resolve('pg');
  const fixture = `
    import fs from 'node:fs';
    import assert from 'node:assert/strict';
    import {mock} from 'node:test';
    mock.module(${JSON.stringify(pgModule)}, {defaultExport:{Client:class {
      async connect(){} async end(){}
      async query(sql){
        assert.ok(/^(BEGIN READ ONLY|SHOW transaction_read_only|SELECT|ROLLBACK)/i.test(sql.trim()));
        return {rows:sql==='SHOW transaction_read_only'?[{transaction_read_only:'on'}]:[]};
      }
    }}});
    const queue=${JSON.stringify({ queue_id: '1'.repeat(32), queue_name: 'lythaus-email-lifecycle-dev', settings: {delivery_paused:false,delivery_delay:0}, consumers_total_count:1, consumers:[{consumer_id:'3'.repeat(32),type:'worker',script_name:'lythaus-jobs-development',dead_letter_queue:'lythaus-email-lifecycle-dlq-dev',settings:{batch_size:25,max_wait_time_ms:5000,max_retries:10,max_concurrency:1}}] })};
    queue.consumers[0].settings.max_concurrency=JSON.parse(process.env.SYNTHETIC_QUEUE_CAP);
    queue.secret='fixture-private-marker';
    globalThis.fetch=async(input,init={})=>{
      const url=new URL(input),method=init.method??'GET';
      assert.equal(url.origin,'https://api.cloudflare.com');
      fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({path:url.pathname,method})+'\\n');
      let result;
      if(url.pathname==='/client/v4/zones/7bc572c8b7cd3c00be9c655176c29382/email/sending/subdomains'){
        assert.equal(method,'GET');result=[{name:'mail.lythaus.co',enabled:true,tag:'fixture-private-marker'}];
      }else if(url.pathname==='/client/v4/accounts/${authAccount}/queues'){
        assert.equal(method,'GET');result=[queue,{queue_id:'${deadLetterId}',queue_name:'lythaus-email-lifecycle-dlq-dev'}];
        return Response.json({success:true,result,result_info:{page:1,per_page:100,count:2,
          total_count:process.env.SYNTHETIC_QUEUE_PARTIAL==='true'?101:2,
          total_pages:process.env.SYNTHETIC_QUEUE_PARTIAL==='true'?2:1}});
      }else if(url.pathname==='/client/v4/accounts/${authAccount}/queues/${lifecycleId}'){
        assert.equal(method,'GET');result=queue;
      }else if(url.pathname==='/client/v4/graphql'){
        assert.equal(method,'POST');const query=JSON.parse(init.body).query;
        assert.match(query,/^query EmailSendingIncident/);assert.doesNotMatch(query,/mutation/);
        return Response.json({data:{viewer:{zones:[{emailSendingAdaptiveGroups:[]}]}}});
      }else assert.fail('Unexpected endpoint; email send and Queue message operations are forbidden');
      return Response.json({success:true,result});
    };
  `;
  for (const [cap, partial] of [[1, false], [null, false], [1, true]]) {
    writeFileSync(calls, '');
    const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--import', `data:text/javascript,${encodeURIComponent(fixture)}`,
      'scripts/ci/audit-production-auth-incident.mjs'], { encoding: 'utf8', timeout: 10000, env: {
      PLANETSCALE_SCHEMA_READ_DATABASE_URL: 'postgresql://schema@fixture.invalid/postgres?sslmode=verify-full',
      CLOUDFLARE_API_TOKEN: 'fixture-private-marker', CLOUDFLARE_ACCOUNT_ID: authAccount,
      CLOUDFLARE_ZONE_ID: '7bc572c8b7cd3c00be9c655176c29382', AUTH_INCIDENT_SEND_PROBE: 'false',
      AUTH_INCIDENT_AUDIT_OUTPUT: output, SYNTHETIC_QUEUE_CAP: JSON.stringify(cap), GITHUB_SHA: 'f'.repeat(40),
      SYNTHETIC_QUEUE_PARTIAL: String(partial),
    } });
    const ready = cap === 1 && !partial;
    assert.equal(result.status, ready ? 0 : 1, result.stderr);
    const serialized = readFileSync(output, 'utf8'), report = JSON.parse(serialized);
    assert.equal(report.mode, 'read_only');
    assert.equal(report.cloudflare.arbitraryRecipientProbe.attempted, false);
    assert.equal(report.cloudflare.dispatchQueue.status, ready ? 'VERIFIED' : 'BLOCKED');
    if (partial) assert.equal(report.cloudflare.dispatchQueue.reason, 'email_dispatch_queue_inventory_incomplete');
    assert.equal(report.cloudflare.remainingSendingQuota.status, 'UNVERIFIED');
    assert.deepEqual(report.failures, ready ? [] : ['cloudflare_dispatch_queue_not_ready']);
    assert.ok(!serialized.includes('fixture-private-marker'));
    const requests = readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(requests.every(call => call.method === 'GET' || (call.method === 'POST' && call.path === '/client/v4/graphql')));
    assert.equal(requests.some(call => call.path === `/client/v4/accounts/${authAccount}/queues/${lifecycleId}`), !partial);
  }
});
