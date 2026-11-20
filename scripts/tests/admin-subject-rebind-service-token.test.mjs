import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { auditRebindServiceTokens, inspectServiceAuthority, serviceGrantInventory, serviceSource, serviceAuditFailure,
  RebindServiceReader, TOKEN_SOURCES, REQUIRED_ROLE_PERMISSIONS, QUALIFICATION_PROFILE, QUALIFICATION_PROFILE_SHA256,
  SERVICE_AUDIT_SCHEMA, SERVICE_AUDIT_JOB, digest, utcMicros } from '../ci/admin-subject-rebind-service-token.mjs';

const source = 'a'.repeat(40), now = Date.parse('2026-11-15T14:00:00.000Z');
const repository = new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1, -1);
const canary = 'synthetic-token-never-in-receipts';
const environment = () => ({ GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_ID: '1010752912',
  GITHUB_ACTOR: repository.split('/')[0], GITHUB_ACTOR_ID: '211295889', GITHUB_RUN_ATTEMPT: '1',
  GITHUB_RUN_ID: '123', GITHUB_RUN_NUMBER: '24', GITHUB_REF: 'refs/heads/main', REF_PROTECTED: 'true',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/planetscale-cutover-identity-preflight.yml@refs/heads/main`,
  RELEASE_SHA: source, GITHUB_SHA: source, INSPECTION: 'rebind-service-token-audit',
  MIGRATION_PROBE_APPROVAL_JSON: '', ADMIN_REBIND_CONNECTION: 'existing',
  PLANETSCALE_SERVICE_TOKEN_ID: 'syntheticpair', PLANETSCALE_SERVICE_TOKEN: canary,
  PLANETSCALE_API_TOKEN: `syntheticcombined:${canary}` });

function fixture() {
  const env = environment(), calls = [], gates = [];
  const database = { id: 'hzhe0cbn6rxi', name: 'lythaus-core', kind: 'postgresql' };
  const branch = { id: 'vqa2g2xc9wsl', name: 'main', kind: 'postgresql', deleted_at: null, production: true };
  const token = { expires_at: '2026-11-15T18:00:00.000001Z', token: canary, name: canary };
  const grants = { type: 'list', current_page: 1, total_count: 1, next_page: null,
    data: [{ id: 'grant1', resource_type: 'Database', resource_id: database.id, resource_name: database.name,
      accesses: REQUIRED_ROLE_PERMISSIONS.map(access => ({ access, description: canary })) }] };
  const fetchImpl = async (url, request) => {
    calls.push({ url, method: request.method });
    assert.equal(request.method, 'GET'); assert.equal(request.body, undefined); assert.equal(request.redirect, 'error');
    assert.ok(request.signal instanceof AbortSignal); assert.match(request.headers.authorization, /synthetic.*:/);
    let body;
    if (url.endsWith('/databases/lythaus-core')) body = database;
    else if (url.endsWith('/branches/main')) body = branch;
    else if (url.includes('/grants?')) body = grants;
    else if (/\/service-tokens\/[a-z]+$/.test(url)) body = { ...token, id: url.split('/').at(-1) };
    else assert.fail('unexpected GET route');
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const options = { env, now, fetchImpl, assertCheckout: async () => gates.push('checkout'),
    assertMain: async () => gates.push('main'), quiet: async () => gates.push('quiet') };
  return { env, options, database, branch, token, grants, calls, gates, fetchImpl };
}

function redacted(report) {
  const serialized = JSON.stringify(report);
  for (const value of [canary, 'syntheticpair', 'syntheticcombined', 'authorization', 'resource_id', 'description']) {
    assert.equal(serialized.includes(value), false, value);
  }
  for (const key of ['providerMutations', 'credentialsCreated', 'databaseWrites', 'settingsChanged', 'installationAuthorized', 'ownerLoginVerified']) {
    assert.equal(report[key], false);
  }
}

test('audit is GET-only, source-specific, sanitized and explicitly not issuance or installation proof', async () => {
  const f = fixture(), report = await auditRebindServiceTokens(f.options);
  assert.deepEqual(f.gates, ['checkout', 'main', 'quiet', 'main']); assert.equal(f.calls.length, 8);
  assert.equal(report.schemaVersion, SERVICE_AUDIT_SCHEMA);
  assert.equal(report.status, 'REVIEWED_SOURCE_AVAILABLE_NOT_CREDENTIAL_APPROVAL');
  assert.equal(report.recommendedSource, 'migration_service_pair'); assert.equal(report.sourceMainSha, source);
  assert.equal(report.runId, '123'); assert.equal(report.runAttempt, 1);
  assert.equal(report.profileSha256, QUALIFICATION_PROFILE_SHA256);
  for (const row of report.sources) {
    assert.equal(row.status, 'DECLARED_AUTHORITY_VERIFIED_NOT_ISSUANCE_PROOF');
    assert.equal(row.issuanceObserved, false); assert.equal(row.sqlProfileVerified, false); assert.equal(row.credentialCreated, false);
    assert.equal(row.grantPaginationComplete, true); assert.equal(row.grantPages, 1); assert.equal(row.grantRows, 1);
    assert.deepEqual(row.missingPermissions, []); assert.match(row.tokenFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(row.tokenExpiresAt, f.token.expires_at);
  }
  assert.notEqual(report.sources[0].tokenFingerprint, report.sources[1].tokenFingerprint); redacted(report);
});

test('one-hour qualification profile is exact; this audit cannot execute it', () => {
  assert.deepEqual(QUALIFICATION_PROFILE, { ttl: 3600, inherited_roles: ['postgres'], with_replication: false });
  assert.equal(QUALIFICATION_PROFILE_SHA256, digest(JSON.stringify(QUALIFICATION_PROFILE)));
  assert.equal(Object.isFrozen(QUALIFICATION_PROFILE), true); assert.equal(Object.isFrozen(QUALIFICATION_PROFILE.inherited_roles), true);
});

test('missing, partial and malformed existing sources fail closed without fallback creation', async () => {
  for (const change of [env => { delete env.PLANETSCALE_SERVICE_TOKEN; delete env.PLANETSCALE_SERVICE_TOKEN_ID; },
    env => delete env.PLANETSCALE_SERVICE_TOKEN, env => delete env.PLANETSCALE_SERVICE_TOKEN_ID,
    env => { env.PLANETSCALE_SERVICE_TOKEN = 'bad\nvalue'; }]) {
    const f = fixture(); change(f.env); delete f.env.PLANETSCALE_API_TOKEN;
    const report = await auditRebindServiceTokens(f.options);
    assert.equal(report.status, 'BLOCKED_NO_QUALIFIED_EXISTING_SOURCE'); assert.equal(report.recommendedSource, null);
    assert.equal(f.calls.length, 0); redacted(report);
  }
  assert.throws(() => serviceSource(environment(), 'new_token'), /service_token_source_invalid/);
  for (const raw of ['password-only', 'id:bad\nvalue', 'id:token:extra', ' ID:token']) {
    const env = environment(); env.PLANETSCALE_API_TOKEN = raw;
    assert.equal(serviceSource(env, 'existing_api_token').status, 'MALFORMED');
  }
});

test('qualified combined token is a distinct explicit recommendation when the dedicated pair is missing', async () => {
  const f = fixture(); delete f.env.PLANETSCALE_SERVICE_TOKEN; delete f.env.PLANETSCALE_SERVICE_TOKEN_ID;
  const report = await auditRebindServiceTokens(f.options);
  assert.equal(report.recommendedSource, 'existing_api_token'); assert.equal(f.calls.length, 4); redacted(report);
});

test('shared token self observations survive a denied grants list without qualifying the source', async () => {
  const f = fixture();
  const db = { resource_type: 'Database', resource_id: f.database.id,
    resource: { id: f.database.id, name: f.database.name, deleted_at: null } };
  const org = { resource_type: 'Organization', resource_id: 'im68in7j2miy', resource: { id: 'im68in7j2miy', name: 'lythaus' } };
  f.token.service_token_accesses = [ { ...db, access: 'read_database' }, { ...db, access: 'read_database' },
    { ...db, access: 'restore_production_branch_backups' }, { ...db, access: canary },
    { ...db, resource_id: 'otherdb', access: 'delete_production_branch' },
    { ...org, access: 'read_service_tokens' }, { ...org, access: 'write_service_tokens' },
    { ...org, resource: { id: 'otherorg', name: 'lythaus' }, access: 'delete_service_tokens' } ];
  f.options.fetchImpl = (url, options) => url.includes('/grants?') ? new Response(canary, { status: 404 }) : f.fetchImpl(url, options);
  const report = await auditRebindServiceTokens(f.options);
  assert.equal(report.recommendedSource, null);
  assert.equal(report.sources[0].sharedSelfRecord, undefined);
  assert.equal(report.sources[1].operationClass, 'service_token_grants_read');
  assert.equal(report.sources[1].completedChecks.grantPaginationComplete, false);
  assert.deepEqual(report.sources[1].sharedSelfRecord, { lifetimeCoversWindow: true,
    oldCoreActionsObserved: ['read_database', 'restore_production_branch_backups'],
    organizationActionsObserved: ['read_service_tokens', 'write_service_tokens'], otherOrUnclassifiedAccessObserved: true });
  redacted(report);
});

test('absent or malformed inline access rows remain unknown, with no invented permissions', async () => {
  for (const rows of [undefined, [null], [{ resource_type: 123, access: 'write_service_tokens' }]]) {
    const f = fixture(); f.token.service_token_accesses = rows;
    const report = await auditRebindServiceTokens(f.options);
    assert.deepEqual(report.sources[1].sharedSelfRecord, { lifetimeCoversWindow: true,
      oldCoreActionsObserved: null, organizationActionsObserved: null, otherOrUnclassifiedAccessObserved: null });
    redacted(report);
  }
});

test('denied authority is reported once per source without raw response or error leakage', async () => {
  for (const status of [401, 403, 404, 500]) {
    const f = fixture(); let calls = 0;
    f.options.fetchImpl = async () => { calls++; return new Response(canary, { status }); };
    const report = await auditRebindServiceTokens(f.options);
    assert.equal(calls, 2); assert.equal(report.recommendedSource, null);
    assert.ok(report.sources.every(row => row.status === 'BLOCKED_AUTHORITY_UNVERIFIED' && row.httpStatus === status));
    redacted(report);
  }
  const f = fixture(); f.options.fetchImpl = async () => { throw new Error(canary); };
  redacted(await auditRebindServiceTokens(f.options));
});

test('404 failures retain the exact fixed operation and only previously verified checkpoints without retries', async () => {
  const operations = ['database_metadata_read', 'main_branch_metadata_read', 'service_token_metadata_read', 'service_token_grants_read'];
  const names = ['databaseVerified', 'productionBranchVerified', 'selfMetadataVerified', 'tokenExpiryKnown', 'grantPaginationComplete'];
  const requestId = '01900000-0000-7000-8000-000000000001';
  for (let failed = 0; failed < operations.length; failed++) {
    const f = fixture(); delete f.env.PLANETSCALE_SERVICE_TOKEN; delete f.env.PLANETSCALE_SERVICE_TOKEN_ID;
    let count = 0, bodyReads = 0, cancelled = 0;
    f.options.fetchImpl = async (url, request) => {
      if (count++ === failed) return { status: 404, url, redirected: false, headers: new Headers({ 'x-request-id': requestId }),
        body: { cancel: async () => { cancelled++; }, [Symbol.asyncIterator]: () => { bodyReads++; throw new Error(canary); } } };
      return f.fetchImpl(url, request);
    };
    const report = await auditRebindServiceTokens(f.options), failure = report.sources[1];
    assert.equal(report.status, 'BLOCKED_NO_QUALIFIED_EXISTING_SOURCE'); assert.equal(report.recommendedSource, null);
    assert.equal(failure.operationClass, operations[failed]); assert.equal(failure.httpStatus, 404);
    assert.equal(failure.requestId, requestId); assert.equal(failure.requestPage, failed === 3 ? 1 : null);
    assert.equal(Object.hasOwn(failure, 'sharedSelfRecord'), failed === 3);
    assert.match(failure.tokenFingerprint, /^[a-f0-9]{64}$/); assert.equal(count, failed + 1); assert.equal(bodyReads, 0); assert.equal(cancelled, 1);
    const verified = failed === 3 ? 4 : failed;
    assert.deepEqual(failure.completedChecks, Object.fromEntries(names.map((name, index) => [name, index < verified])));
    assert.equal(JSON.stringify(report).includes('https://'), false); redacted(report);
  }
});

test('partial grants remain unqualified and identify the failed page without exposing rows or provider text', async () => {
  const f = fixture(); delete f.env.PLANETSCALE_SERVICE_TOKEN; delete f.env.PLANETSCALE_SERVICE_TOKEN_ID;
  f.grants.next_page = 2; f.grants.total_count = 2;
  let failedRequests = 0;
  f.options.fetchImpl = async (url, request) => {
    if (url.includes('/grants?page=2&')) { failedRequests++; return new Response(canary, { status: 403 }); }
    return f.fetchImpl(url, request);
  };
  const report = await auditRebindServiceTokens(f.options), row = report.sources[1];
  assert.equal(row.operationClass, 'service_token_grants_read'); assert.equal(row.requestPage, 2); assert.equal(failedRequests, 1);
  assert.equal(row.completedChecks.tokenExpiryKnown, true); assert.equal(row.completedChecks.grantPaginationComplete, false);
  assert.equal(report.recommendedSource, null); assert.equal(row.status, 'BLOCKED_AUTHORITY_UNVERIFIED'); redacted(report);
});

test('request-ID headers are a strict consistent UUID whitelist; error bodies are never read', async () => {
  const id = '01900000-0000-7000-8000-000000000001', other = '01900000-0000-7000-8000-000000000002';
  for (const [headers, expected] of [[{}, null], [{ 'x-request-id': canary }, null],
    [{ 'x-request-id': id, 'x-pscale-request-id': other }, null], [{ 'x-planetscale-request-id': id }, id],
    [{ 'x-request-id': id, 'x-pscale-request-id': id }, id]]) {
    const f = fixture(); f.options.fetchImpl = async () => new Response(canary, { status: 404, headers });
    const report = await auditRebindServiceTokens(f.options);
    assert.ok(report.sources.every(row => row.requestId === expected)); redacted(report);
  }
});

test('transport or malformed success failures keep the safe operation without manufacturing verified progress', async () => {
  for (const malformed of [false, true]) {
    const f = fixture(); delete f.env.PLANETSCALE_SERVICE_TOKEN; delete f.env.PLANETSCALE_SERVICE_TOKEN_ID;
    f.options.fetchImpl = async (url, request) => {
      if (url.includes('/service-tokens/')) {
        if (malformed) return new Response(canary);
        throw new Error(canary);
      }
      return f.fetchImpl(url, request);
    };
    const report = await auditRebindServiceTokens(f.options), row = report.sources[1];
    assert.equal(row.operationClass, 'service_token_metadata_read'); assert.equal(row.httpStatus, null); assert.equal(row.requestId, null);
    assert.equal(row.completedChecks.productionBranchVerified, true); assert.equal(row.completedChecks.selfMetadataVerified, false);
    assert.equal(report.recommendedSource, null); redacted(report);
  }
});

test('successful database metadata alone never establishes token grant authority', async () => {
  for (const permission of REQUIRED_ROLE_PERMISSIONS) {
    const f = fixture(); f.grants.data[0].accesses = f.grants.data[0].accesses.filter(row => row.access !== permission);
    const report = await auditRebindServiceTokens(f.options);
    assert.equal(report.recommendedSource, null); assert.ok(report.sources.every(row => row.missingPermissions.includes(permission)));
    redacted(report);
  }
});

test('grants for another resource, wildcards and unrecognized access names never supply target authority', async () => {
  for (const change of [row => { row.resource_id = 'anotherdatabase'; }, row => { row.resource_name = 'anotherdatabase'; },
    row => { row.resource_type = 'Organization'; }, row => { row.accesses = [{ access: '*' }]; },
    row => { row.accesses = [{ access: 'create_branch_password' }]; }]) {
    const f = fixture(); change(f.grants.data[0]); const report = await auditRebindServiceTokens(f.options);
    assert.equal(report.recommendedSource, null); assert.equal(report.sources[0].status, 'BLOCKED'); redacted(report);
  }
});

test('exact database, main branch and native self identity are required', async () => {
  for (const change of [f => { f.database.id = 'wrong'; }, f => { f.database.name = 'wrong'; },
    f => { f.database.kind = 'mysql'; }, f => { f.branch.id = 'wrong'; }, f => { f.branch.name = 'other'; },
    f => { f.branch.production = false; }, f => { f.branch.deleted_at = '2026-11-01T00:00:00Z'; },
    f => { delete f.branch.deleted_at; }, f => { f.token.deleted_at = '2026-11-01T00:00:00Z'; }]) {
    const f = fixture(); change(f); const report = await auditRebindServiceTokens(f.options);
    assert.equal(report.recommendedSource, null); redacted(report);
  }
  const f = fixture(), original = f.fetchImpl;
  f.options.fetchImpl = async (url, request) => /\/service-tokens\/[a-z]+$/.test(url)
    ? new Response(JSON.stringify({ ...f.token, id: 'anotherid' })) : original(url, request);
  assert.equal((await auditRebindServiceTokens(f.options)).recommendedSource, null);
});

test('native token expiry must be known and cover the entire two-hour window plus margin', async () => {
  for (const expiry of [undefined, 'invalid', '2026-11-15T16:00:00Z', '2026-11-15T16:05:00Z', '2026-11-15T16:04:59.999999Z']) {
    const f = fixture(); if (expiry === undefined) delete f.token.expires_at; else f.token.expires_at = expiry;
    assert.equal((await auditRebindServiceTokens(f.options)).recommendedSource, null);
  }
  for (const expiry of [null, '2026-11-15T16:05:00.000001Z']) {
    const f = fixture(); f.token.expires_at = expiry;
    assert.equal((await auditRebindServiceTokens(f.options)).recommendedSource, 'migration_service_pair');
  }
  assert.equal(utcMicros('2026-11-15T14:00:00.123456Z'), BigInt(now) * 1000n + 123456n);
  for (const invalid of ['2026-02-30T00:00:00Z', '2026-11-15T14:00:00+00:00', '2026-11-15T14:00:00.1234567Z', null]) {
    assert.equal(utcMicros(invalid), null);
  }
});

test('complete paginated grants combine only exact target grants and reject inconsistent or ambiguous pages', async () => {
  const f = fixture();
  const first = structuredClone(f.grants); first.total_count = 2; first.next_page = 2;
  const second = structuredClone(f.grants); second.current_page = 2; second.total_count = 2; second.data[0].id = 'grant2';
  first.data[0].accesses = first.data[0].accesses.slice(0, 2); second.data[0].accesses = second.data[0].accesses.slice(2);
  const reader = { get: async path => path.includes('page=1&') ? first : second };
  assert.deepEqual((await serviceGrantInventory(reader)).pages, 2);
  for (const change of [() => { second.current_page = 1; }, () => { second.total_count = 3; },
    () => { second.data[0].id = 'grant1'; }, () => { second.next_page = 4; },
    () => { second.data = []; }, () => { second.type = 'unknown'; }, () => { delete second.next_page; }]) {
    const saved = structuredClone(second); change();
    await assert.rejects(serviceGrantInventory(reader));
    for (const key of Object.keys(second)) delete second[key]; Object.assign(second, saved);
  }
  let pages = 0;
  await assert.rejects(serviceGrantInventory({ get: async () => ({ type: 'list', current_page: ++pages,
    next_page: pages + 1, data: [{ ...first.data[0], id: `grant${pages}` }] }) }), /pagination_unverified/);
  assert.equal(pages, 5);
});

test('malformed grant records fail closed without exposing resource contents', async () => {
  for (const change of [row => { row.id = '../escape'; }, row => { delete row.resource_type; },
    row => { row.accesses = ['read_database']; }, row => { row.accesses = [{ access: null }]; },
    row => { row.accesses = Array.from({ length: 101 }, () => ({ access: 'read_database' })); }]) {
    const f = fixture(); change(f.grants.data[0]); const report = await auditRebindServiceTokens(f.options);
    assert.equal(report.recommendedSource, null); redacted(report);
  }
});

test('GET transport is closed to foreign paths, redirects, malformed/large bodies and arbitrary methods', async () => {
  const f = fixture(), reader = new RebindServiceReader(f.env, TOKEN_SOURCES[0], f.fetchImpl);
  for (const path of ['https://evil.test', '/token/../escape', '/branches/other', '/branches/main/roles?page=6&per_page=100',
    '/token/grants?page=1&per_page=100&extra=true', '/branches/main/roles/id/extra']) {
    await assert.rejects(reader.get(path), /path_forbidden/);
  }
  assert.equal(f.calls.length, 0); assert.equal(reader.request, undefined); assert.equal(reader.authorization, undefined);
  for (const response of [new Response('{}', { status: 302 }), new Response('not json'), new Response('[]'),
    new Response(new Uint8Array([0xff])), new Response('x'.repeat(1048577))]) {
    const transport = new RebindServiceReader(f.env, TOKEN_SOURCES[0], async () => response);
    await assert.rejects(transport.get(''));
  }
});

test('wrong actor, source, attempt, branch or mixed operation inputs are rejected before protected reads', async () => {
  for (const [key, value] of [['GITHUB_ACTOR', 'another'], ['GITHUB_ACTOR_ID', '1'], ['GITHUB_RUN_ATTEMPT', '2'],
    ['GITHUB_REPOSITORY_ID', '1'], ['GITHUB_SHA', 'b'.repeat(40)], ['REF_PROTECTED', 'false'],
    ['GITHUB_REF', 'refs/heads/other'], ['GITHUB_EVENT_NAME', 'push'], ['INSPECTION', 'migration-probe'],
    ['MIGRATION_PROBE_APPROVAL_JSON', '{}'], ['ADMIN_REBIND_EPHEMERAL_APPROVAL_JSON', '{}'], ['ADMIN_REBIND_CONNECTION', 'separate']]) {
    const f = fixture(); f.env[key] = value;
    await assert.rejects(auditRebindServiceTokens(f.options)); assert.equal(f.calls.length, 0); assert.equal(f.gates.length, 0);
  }
});

test('checkout, exact main checks, busy consumers or moved main fail closed', async () => {
  for (const gate of ['assertCheckout', 'assertMain', 'quiet']) {
    const f = fixture(); f.options[gate] = async () => { throw new Error(canary); };
    await assert.rejects(auditRebindServiceTokens(f.options)); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); let checks = 0;
  f.options.assertMain = async () => { if (++checks === 2) throw new Error('main moved'); };
  await assert.rejects(auditRebindServiceTokens(f.options)); assert.equal(checks, 2);
});

test('production defaults enforce real checkout, protected main checks and consumer evidence', async () => {
  const f = fixture(); delete f.options.assertCheckout;
  await assert.rejects(auditRebindServiceTokens(f.options), /checkout_changed/); assert.equal(f.calls.length, 0);
  const g = fixture(); delete g.options.assertMain; delete g.options.quiet;
  g.options.read = async () => ({ protected: false });
  await assert.rejects(auditRebindServiceTokens(g.options), /protected_main_moved/); assert.equal(g.calls.length, 0);
});

test('failure receipt and CLI never serialize arbitrary errors, inputs or stack traces', () => {
  redacted(serviceAuditFailure(new Error(canary), { env: environment(), now }));
  const result = spawnSync(process.execPath, ['scripts/ci/admin-subject-rebind-service-token.mjs'], {
    env: { PATH: process.env.PATH, RELEASE_SHA: canary }, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout); assert.equal(report.blocker, 'protected_owner_context_required'); redacted(report);
});

test('exclusive protected workflow has no database URL, role map, credential writer or settings authority', () => {
  const workflow = parse(fs.readFileSync('.github/workflows/planetscale-cutover-identity-preflight.yml', 'utf8'));
  const job = workflow.jobs.rebind_service_token;
  assert.equal(job.if, "inputs.inspection == 'rebind-service-token-audit'"); assert.equal(job.name, SERVICE_AUDIT_JOB);
  assert.equal(job.environment, 'production'); assert.equal(job['timeout-minutes'], 10);
  assert.deepEqual(job.permissions, { contents: 'read', actions: 'read', checks: 'read' });
  const step = job.steps.find(value => value.env?.PLANETSCALE_SERVICE_TOKEN);
  assert.deepEqual(Object.keys(step.env).sort(), ['GH_TOKEN', 'PLANETSCALE_API_TOKEN', 'PLANETSCALE_SERVICE_TOKEN', 'PLANETSCALE_SERVICE_TOKEN_ID']);
  assert.ok(job.steps.indexOf(step) > job.steps.findIndex(value => value.name === 'Validate service-token audit with synthetic inputs'));
  const guards = job.steps.find(value => value.name === 'Require first-attempt owner and exact protected source').run;
  for (const text of ['1010752912', '211295889', 'refs/heads/main', 'REF_PROTECTED', 'GITHUB_RUN_ATTEMPT',
    'GITHUB_SHA', 'git rev-parse HEAD', 'git rev-parse FETCH_HEAD', 'test -z "$MIGRATION_PROBE_APPROVAL_JSON"']) assert.ok(guards.includes(text));
  assert.doesNotMatch(JSON.stringify(job), /DATABASE_URL|PSCALE_ROLE_IDENTIFIERS|apply-planetscale|wrangler|contents:write|secrets:write/);
  const upload = job.steps.find(value => value.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload.with['retention-days'], 7); assert.equal(upload.if, 'always()');
  assert.equal(upload.with.path, '${{ runner.temp }}/rebind-service-token-audit.json');
  const source = fs.readFileSync('scripts/ci/admin-subject-rebind-service-token.mjs', 'utf8');
  assert.doesNotMatch(source, /method: ['"](?:POST|PUT|PATCH|DELETE)['"]|\.query\(|from ['"]pg['"]/);
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.ok(ci.includes('scripts/tests/admin-subject-rebind-service-token.test.mjs'));
});
