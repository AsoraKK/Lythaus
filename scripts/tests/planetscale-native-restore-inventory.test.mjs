import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parse } from 'yaml';
import { collectNativeRestoreInventory, RESTORE_INVENTORY_TARGET as target } from '../ci/planetscale-native-restore-inventory.mjs';

const now = Date.parse('2026-10-23T10:00:00.000Z');
const canary = 'private-fixture-canary-must-never-appear';
const roles = { lythaus_runtime: 'pscale_api_runtimefixture', lythaus_admin: 'pscale_api_adminfixture',
  lythaus_privacy: 'pscale_api_privacyfixture', lythaus_jobs: 'pscale_api_jobsfixture' };
const environment = { RELEASE_SHA: 'a'.repeat(40), PLANETSCALE_API_TOKEN: 'synthetic-id:synthetic-token',
  CLOUDFLARE_API_TOKEN: 'synthetic-cloudflare-token', PSCALE_ROLE_IDENTIFIERS: JSON.stringify({ ...roles, ignored: canary }),
  PLANETSCALE_ORGANIZATION: canary, PLANETSCALE_DATABASE: canary, CLOUDFLARE_ACCOUNT_ID: canary,
  PLANETSCALE_ADMIN_DATABASE_URL: `postgresql://user:${canary}@unrelated.invalid/postgres`,
};
const manifest = JSON.parse(fs.readFileSync('infrastructure/cloudflare/native-hyperdrive-production.json'));
const bindings = [...new Map(manifest.bindings.map(row => [row.hyperdriveId, row])).values()];
const branch = { id: target.branchId, name: 'main', kind: 'postgresql', deleted_at: null, password: canary };
const backup = (overrides = {}) => ({ id: 'fresh123', state: 'success', created_at: '2026-10-23T08:00:00Z',
  started_at: '2026-10-23T08:00:01Z', completed_at: '2026-10-23T08:02:00Z', expires_at: '2026-10-25T08:00:00Z',
  deleted_at: null, protected: false, size: 1024, pvc_size: 21474836480, uncompressed_size: 2048,
  database_branch: { id: target.branchId, name: 'main', deleted_at: null },
  name: canary, actor: { email: `${canary}@fixture.invalid` }, connection_string: canary, ...overrides });
const page = (rows = [backup()], overrides = {}) => ({ current_page: 1, total_count: rows.length,
  next_page: null, next_page_url: null, data: rows, ignored: canary, ...overrides });
const config = entry => ({ success: true, result: { id: entry.hyperdriveId, name: entry.expectedConfigName,
  origin: { scheme: 'postgres', host: 'aws-eu-central-1-1.pg.psdb.cloud', port: 5432, database: 'postgres',
    user: `${roles[entry.expectedRoleKey]}.${target.branchId}`, password: canary },
  caching: { disabled: true }, mtls: { sslmode: 'verify-full', ca_certificate_id: canary }, ignored: canary } });
const response = value => new Response(JSON.stringify(value));

function fixture({ pages = [page()], change = () => {} } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    let body;
    if (url.endsWith('/main')) body = structuredClone(branch);
    else if (url.includes('/backups?')) body = structuredClone(pages[Number(new URL(url).searchParams.get('page')) - 1]);
    else {
      const entry = bindings.find(row => url.endsWith(`/hyperdrive/configs/${row.hyperdriveId}`));
      assert.ok(entry, 'only canonical configuration IDs may be requested');
      body = config(entry);
    }
    const alternative = change(body, url, calls.length);
    return alternative ?? response(body);
  } };
}
const collect = options => collectNativeRestoreInventory({ environment, now, ...options });
function assertRedacted(report) {
  const text = JSON.stringify(report);
  for (const value of [canary, environment.PLANETSCALE_API_TOKEN, environment.CLOUDFLARE_API_TOKEN,
    'postgresql://', 'psdb.cloud', 'connection_string', 'password', 'authorization', 'ca_certificate_id']) {
    assert.equal(text.includes(value), false, value);
  }
}

test('fixed GETs emit only reviewed source metadata and exact live application SQL names', async () => {
  const f = fixture();
  const report = await collect(f);
  assert.equal(report.status, 'INVENTORY_COLLECTED_NOT_RESTORE_ACCEPTANCE');
  assert.deepEqual(report.blockers, []);
  assert.equal(f.calls.length, 6);
  assert.equal(f.calls[0].url, 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core/branches/main');
  assert.equal(f.calls[1].url, `${f.calls[0].url}/backups?page=1&per_page=100`);
  assert.deepEqual(report.roleMappings.map(row => [row.roleClass, row.sqlRole]), Object.entries(roles));
  for (const { url, options } of f.calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.body, undefined);
    assert.equal(options.headers.authorization, url.startsWith('https://api.planetscale.com/')
      ? environment.PLANETSCALE_API_TOKEN : `Bearer ${environment.CLOUDFLARE_API_TOKEN}`);
    assert.equal(options.headers.accept, 'application/json');
    assert.equal(url.includes(canary), false);
  }
  assert.deepEqual(report.backups[0].providerReportedSizes, { size: 1024, pvc_size: 21474836480, uncompressed_size: 2048 });
  assert.equal(report.freshestFreshSuccessfulBackupId, 'fresh123');
  assert.equal(report.freshestProtectedFreshBackupId, null);
  assert.equal(report.databaseWrites, false);
  assert.equal(report.providerMutations, false);
  assert.equal(report.credentialsCreated, false);
  assert.equal(report.grantReference.restoredGrantPresence, 'NOT_VERIFIED');
  assertRedacted(report);
});

test('complete pagination rebuilds fixed URLs and sorts snapshots without selecting or protecting one', async () => {
  const old = backup({ id: 'old123', created_at: '2026-10-22T02:25:00Z', started_at: '2026-10-22T02:26:00Z',
    completed_at: '2026-10-22T02:31:00Z', protected: true });
  const f = fixture({ pages: [page([old], { total_count: 2, next_page: 2, next_page_url: `https://${canary}.invalid/steal` }),
    page([backup()], { current_page: 2, total_count: 2 })] });
  const report = await collect(f);
  assert.deepEqual(report.backups.map(row => row.id), ['fresh123', 'old123']);
  assert.equal(report.backups[1].fresh, false);
  assert.equal(report.backups[1].startedAfterGrantVerification, false);
  assert.equal(report.backups[0].startedAfterGrantVerification, true);
  assert.equal(report.freshestSuccessfulBackupId, 'fresh123');
  assert.equal(report.freshestProtectedFreshBackupId, null);
  assert.equal(f.calls[2].url.endsWith('/main/backups?page=2&per_page=100'), true);
  assertRedacted(report);
});

test('freshness, expiry, failure and missing sizes stay distinct from completed recovery acceptance', async () => {
  for (const [row, fresh] of [
    [backup({ protected: true }), true],
    [backup({ expires_at: '2026-10-23T09:59:59Z' }), false],
    [backup({ state: 'failed' }), false],
    [backup({ started_at: null, size: null, pvc_size: null, uncompressed_size: null }), true],
  ]) {
    const report = await collect(fixture({ pages: [page([row])] }));
    assert.equal(report.backups[0].fresh, fresh);
    assert.equal(report.grantReference.restoredGrantPresence, 'NOT_VERIFIED');
    assert.match(report.limitations.join(' '), /exact recovery point/);
    assert.match(report.limitations.join(' '), /units and billable/);
  }
  const empty = await collect(fixture({ pages: [page([])] }));
  assert.equal(empty.status, 'INVENTORY_COLLECTED_NOT_RESTORE_ACCEPTANCE');
  assert.equal(empty.freshestFreshSuccessfulBackupId, null);
});

test('invalid local inputs make no request and never print input contents', async () => {
  for (const overrides of [{ RELEASE_SHA: canary }, { PLANETSCALE_API_TOKEN: canary }, { CLOUDFLARE_API_TOKEN: '' },
    { PSCALE_ROLE_IDENTIFIERS: canary }, { PSCALE_ROLE_IDENTIFIERS: JSON.stringify({ ...roles, lythaus_jobs: canary }) }]) {
    let calls = 0;
    const report = await collect({ environment: { ...environment, ...overrides }, fetchImpl: async () => { calls++; } });
    assert.equal(report.status, 'BLOCKED');
    assert.equal(calls, 0);
    assertRedacted(report);
  }
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 1e20]) {
    const report = await collect({ now: value, fetchImpl: async () => { assert.fail('invalid time must not request'); } });
    assert.equal(report.status, 'BLOCKED');
    assert.equal(report.generatedAt, null);
  }
});

test('HTTP denial, throttling, failures and redirects read no body and never retry', async () => {
  for (const status of [401, 403, 429, 500, 302]) {
    for (const failAt of [1, 2, 3]) {
      const f = fixture({ change: (_body, _url, count) => count === failAt
        ? { status, get body() { throw new Error(canary); } } : undefined });
      const report = await collect(f);
      assert.equal(f.calls.length, failAt);
      assert.equal(report.status, 'BLOCKED');
      assert.deepEqual(report.backups, []);
      assert.deepEqual(report.roleMappings, []);
      assertRedacted(report);
    }
  }
});

test('redirected success, changed response origin and transport exceptions never leak credentials', async () => {
  for (const options of [{ status: 200, redirected: true }, { status: 200, url: `https://${canary}.invalid/` }]) {
    const report = await collect({ fetchImpl: async () => options });
    assert.equal(report.status, 'BLOCKED');
    assert.match(report.blockers[0], /redirect_rejected/);
    assertRedacted(report);
  }
  const report = await collect({ fetchImpl: async () => { throw Object.assign(new Error(canary), { code: canary }); } });
  assert.equal(report.blockers[0], 'source_branch_transport_failed');
  assertRedacted(report);
});

test('malformed, oversized and interrupted success bodies fail closed', async () => {
  for (const makeResponse of [() => new Response(canary), () => response([]),
    () => response({ ignored: canary.repeat(40000) }),
    () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(canary)); } })),
    () => new Response(new Uint8Array([0xff, 0xfe]))]) {
    const report = await collect({ fetchImpl: async () => makeResponse() });
    assert.equal(report.status, 'BLOCKED');
    assertRedacted(report);
  }
});

test('mismatched source or invalid backup metadata cannot produce a partial inventory', async () => {
  for (const overrides of [{ id: canary }, { database_branch: { id: 'other123', name: 'main', deleted_at: null } },
    { protected: 'true' }, { state: canary }, { size: canary }, { size: -1 }, { size: 1.5 },
    { completed_at: null }, { completed_at: '2026-10-24T00:00:00Z' }, { completed_at: '2026-02-31T00:00:00Z' }]) {
    const f = fixture({ pages: [page([backup(overrides)])] });
    const report = await collect(f);
    assert.equal(report.status, 'BLOCKED');
    assert.equal(f.calls.length, 2);
    assert.deepEqual(report.backups, []);
    assertRedacted(report);
  }
  const f = fixture({ change: (body, url) => { if (url.endsWith('/main')) body.id = 'other123'; } });
  assert.equal((await collect(f)).blockers[0], 'source_branch_mismatch');
  assert.equal(f.calls.length, 1);
});

test('pagination rejects missing, inconsistent, duplicate, oversized or unbounded inventory', async () => {
  for (const body of [page([], { next_page: 99 }), page([], { total_count: 501 }),
    page([], { current_page: 2 }), page([], { total_count: 1 }), page([backup(), backup()]),
    page(Array.from({ length: 101 }, () => backup()))]) {
    const report = await collect(fixture({ pages: [body] }));
    assert.equal(report.status, 'BLOCKED');
    assert.deepEqual(report.backups, []);
  }
  const pages = Array.from({ length: 5 }, (_, i) => page([backup({ id: `backup${i}` })],
    { current_page: i + 1, total_count: 6, next_page: i + 2 }));
  const f = fixture({ pages });
  assert.equal((await collect(f)).blockers[0], 'backup_pagination_invalid');
  assert.equal(f.calls.length, 6);
  const changed = await collect(fixture({ pages: [page([], { total_count: 1, next_page: 2 }),
    page([], { current_page: 2, total_count: 0 })] }));
  assert.equal(changed.blockers[0], 'backup_inventory_changed_during_collection');
});

test('wrong canonical role, configuration, TLS or origin blocks all output mappings', async () => {
  const mutations = [c => { c.id = canary; }, c => { c.name = canary; },
    c => { c.origin.user = `${roles.lythaus_runtime}.other123`; }, c => { c.origin.host = 'unrelated.psdb.cloud'; },
    c => { c.origin.database = canary; }, c => { c.caching.disabled = false; },
    c => { c.mtls.sslmode = 'require'; }, c => { c.mtls.ca_certificate_id = ''; }];
  for (const mutate of mutations) {
    const f = fixture({ change: (body, url) => { if (url.includes('/hyperdrive/')) mutate(body.result); } });
    const report = await collect(f);
    assert.equal(report.status, 'BLOCKED');
    assert.equal(f.calls.length, 3);
    assert.deepEqual(report.roleMappings, []);
    assertRedacted(report);
  }
});

test('CLI success, denial and transport failure retain only sanitized JSON with the correct status', () => {
  const bodies = [branch, page(), ...bindings.map(config)];
  const cases = [
    [`const bodies=${JSON.stringify(bodies)};let i=0;globalThis.fetch=async()=>new Response(JSON.stringify(bodies[i++]));`, 0],
    [`globalThis.fetch=async()=>new Response(${JSON.stringify(canary)},{status:403});`, 1],
    [`globalThis.fetch=async()=>{throw new Error(${JSON.stringify(canary)})}`, 1],
  ];
  for (const [code, status] of cases) {
    const cli = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(code),
      'scripts/ci/planetscale-native-restore-inventory.mjs'], { env: environment, encoding: 'utf8' });
    assert.equal(cli.status, status);
    assert.equal(cli.stderr, '');
    const report = JSON.parse(cli.stdout);
    assert.equal(report.status, status === 0 ? 'INVENTORY_COLLECTED_NOT_RESTORE_ACCEPTANCE' : 'BLOCKED');
    assertRedacted(report);
  }
});

test('manual inventory is an exclusive protected mode with fixed credentials and registered offline checks', () => {
  const workflow = parse(fs.readFileSync('.github/workflows/planetscale-cutover-identity-preflight.yml', 'utf8'));
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), ['release_sha', 'inspection']);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.inspection.options, ['identity', 'restore-inventory']);
  assert.equal(workflow.on.workflow_dispatch.inputs.inspection.default, 'identity');
  assert.equal(workflow.jobs.inspect.if, "inputs.inspection == 'identity'");
  const job = workflow.jobs.restore_inventory;
  assert.equal(job.if, "inputs.inspection == 'restore-inventory'");
  assert.equal(job.environment, 'production');
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  const collection = job.steps.find(step => step.name === 'Read backup inventory and canonical role mappings');
  assert.deepEqual(Object.keys(collection.env).sort(), ['CLOUDFLARE_API_TOKEN', 'PLANETSCALE_API_TOKEN', 'PSCALE_ROLE_IDENTIFIERS']);
  const text = JSON.stringify(job);
  for (const required of ['GITHUB_REPOSITORY_ID', '1010752912', 'REF_PROTECTED', 'refs/heads/main',
    'GITHUB_SHA', 'git rev-parse HEAD', 'git rev-parse FETCH_HEAD', 'git diff --cached --quiet']) assert.ok(text.includes(required));
  assert.doesNotMatch(text, /DATABASE_URL|workflow_dispatch.*execute|pg_read_all_data|apply-planetscale|wrangler/);
  assert.ok(job.steps.indexOf(collection) > job.steps.findIndex(step => step.name === 'Recheck current main before metadata reads'));
  const upload = job.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload.with['retention-days'], 7);
  const source = fs.readFileSync('scripts/ci/planetscale-native-restore-inventory.mjs', 'utf8');
  assert.doesNotMatch(source, /from ['"]pg['"]|\.query\(|method: ['"](?:POST|PUT|PATCH|DELETE)['"]|console\.(?:warn|error)/);
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /node --test scripts\/tests\/planetscale-native-restore-inventory.test.mjs/);
});
