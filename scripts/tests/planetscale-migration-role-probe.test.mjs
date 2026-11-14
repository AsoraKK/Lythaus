import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { parse } from 'yaml';
import { ownerContext, canonicalRoles, mainConnection, roleInventory, auditMigrationRole, readOnly,
  PUBLIC_PROFILE_SQL, CANONICAL_AUTHORITY_SQL, PROBE_PROFILE_SQL, PUBLIC_KEYS, AUTHORITY_KEYS, PROBE_KEYS,
  ROLES_ENDPOINT, WORKFLOW, hash } from '../ci/planetscale-migration-role-audit.mjs';
import { runProbe, probeConsent, PROFILE_SHA256, REQUEST_PROFILE, SESSION_SQL, OBSERVER_SQL } from '../ci/planetscale-migration-probe.mjs';
import { quietConsumers, proveOneUseRun, proveAudit, extractAudit } from '../ci/planetscale-migration-probe-evidence.mjs';

const canary = 'private-fixture-secret-must-never-be-output';
const source = 'a'.repeat(40), baseTime = Date.parse('2026-11-14T21:00:00.000Z');
const repository = new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1, -1), owner = repository.split('/')[0];
const roles = Object.fromEntries(['runtime', 'admin', 'jobs', 'privacy', 'migrations'].map(label => [`lythaus_${label}`, `pscale_api_fixture${label}`]));
const observer = 'pscale_api_fixtureobserver', candidate = 'pscale_api_fixtureprobe';
const url = role => `postgresql://${role}.vqa2g2xc9wsl:${canary}@aws-eu-central-1-1.pg.psdb.cloud:5432/postgres?sslmode=verify-full`;
const env = { GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_ID: '1010752912', GITHUB_ACTOR: owner,
  GITHUB_ACTOR_ID: '211295889', GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '200', GITHUB_RUN_NUMBER: '2',
  GITHUB_REF: 'refs/heads/main', REF_PROTECTED: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_WORKFLOW_REF: `${repository}/${WORKFLOW}@refs/heads/main`, RELEASE_SHA: source, GITHUB_SHA: source,
  PSCALE_ROLE_IDENTIFIERS: JSON.stringify(roles), PLANETSCALE_ADMIN_DATABASE_URL: url(observer),
  PLANETSCALE_API_TOKEN: 'fixture:token', GH_TOKEN: 'fixture-token' };
const truth = keys => Object.fromEntries(keys.map(key => [key, true]));
const role = (name, overrides = {}) => ({ id: name.replaceAll('_', ''), name, base_username: name,
  username: `${name}.vqa2g2xc9wsl`, branch: { id: 'vqa2g2xc9wsl', name: 'main', deleted_at: null },
  database_name: 'postgres', ready: true, deleted_at: null, expires_at: null, default: false,
  inherited_roles: ['postgres'], with_replication: false, ...overrides });
const approvalRecord = () => ({ schemaVersion: 'lythaus-migration-probe-approval-v1', scope: 'one_catalog_only_probe', sourceSha: source,
  profileSha256: PROFILE_SHA256, expectedRunNumber: 2, operator: owner, reviewer: 'fixture-reviewer',
  approvalReference: 'fixture explicit credential approval', approvedAt: new Date(baseTime - 60000).toISOString(),
  windowStart: new Date(baseTime).toISOString(), windowEnd: new Date(baseTime + 1800000).toISOString(),
  name: 'lythaus-migration-probe-20261114-01', auditRunId: '100', auditArtifactId: '300',
  auditArchiveSha256: 'b'.repeat(64), auditReportSha256: 'c'.repeat(64), authorityEvidence: 'fixture authority and containment permission',
  tokenExpiresAt: new Date(baseTime + 2100000).toISOString(), containmentEvidence: 'fixture named reviewer and operator',
  costEvidence: 'fixture fees and usage included', maximumAllInUsd: 0.01, remainingApprovedUsd: 0.02, existingAuthorityVerified: true });
const audited = () => ({ schemaVersion: 'lythaus-migration-role-audit-v1', sourceMainSha: source, runId: '100', runAttempt: 1,
  generatedAt: new Date(baseTime).toISOString(), status: 'AUDIT_READY_NOT_INSTALL_AUTHORITY', targetVerified: true,
  canonicalIdentitiesVerified: true, authorityReady: true, probeProfileReady: true, authority: truth(AUTHORITY_KEYS),
  publicProfile: truth(PUBLIC_KEYS), functionState: 'ABSENT', canonicalMapSha256: hash(JSON.stringify(roles)),
  providerMutations: false, credentialsCreated: false, databaseWrites: false, installerQualified: false, loginVerified: false });
const run = (id, number) => ({ id, run_number: number, run_attempt: 1, head_sha: source, head_branch: 'main', path: WORKFLOW,
  event: 'workflow_dispatch', actor: { login: owner, id: 211295889 }, status: 'completed', conclusion: 'success', repository: { id: 1010752912 } });

function archive(report) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-audit-fixture-'));
  try {
    const bytes = Buffer.from(JSON.stringify(report)); fs.writeFileSync(path.join(dir, 'migration-role-audit.json'), bytes);
    execFileSync('zip', ['-q', path.join(dir, 'audit.zip'), 'migration-role-audit.json'], { cwd: dir });
    return { bytes, zip: fs.readFileSync(path.join(dir, 'audit.zip')) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function fixture({ changeProvider = () => {}, changeSql = () => {}, changeRead = () => {}, createError, secondError = '28P01' } = {}) {
  let clock = baseTime, created, probeConnections = 0;
  const calls = [], sql = [], configs = [], checkpoints = [], evidence = archive(audited()), approval = approvalRecord();
  approval.auditArchiveSha256 = hash(evidence.zip); approval.auditReportSha256 = hash(evidence.bytes);
  const environment = { ...env, MIGRATION_PROBE_APPROVAL_JSON: JSON.stringify(approval) };
  const read = async suffix => {
    let body;
    if (suffix.startsWith('/actions/runs?status=')) body = { total_count: 0, workflow_runs: [] };
    else if (suffix.includes('/workflows/')) body = { total_count: 2, workflow_runs: [run(200, 2), run(100, 1)] };
    else if (suffix === '/actions/runs/100/attempts/1') body = run(100, 1);
    else if (suffix === '/actions/runs/100/attempts/1/jobs?per_page=100') body = { total_count: 1,
      jobs: [{ name: 'Audit intended migration role without issuing credentials', run_id: 100, status: 'completed', conclusion: 'success' }] };
    else if (suffix === '/actions/artifacts/300') body = { id: 300, workflow_run: { id: 100 },
      name: `migration-role-audit-${source}-100`, expired: false, digest: `sha256:${hash(evidence.zip)}` };
    else assert.fail(`unexpected fixed GitHub read ${suffix}`);
    changeRead(body, suffix); return body;
  };
  const fetchImpl = async (endpoint, options) => {
    calls.push({ endpoint, method: options.method, body: options.body }); let body;
    if (options.method === 'POST') {
      if (createError) throw new Error(canary);
      created = role(candidate, { name: approval.name, password: canary, access_host_url: 'aws-eu-central-1-1.pg.psdb.cloud',
        inherited_roles: [], created_at: new Date(clock).toISOString(), expires_at: new Date(clock + 900000).toISOString() });
      body = structuredClone(created);
    } else if (endpoint.includes('/roles?')) body = { current_page: 1, total_count: 5 + (created ? 1 : 0), next_page: null,
      data: [...Object.values(roles).map(name => role(name)), ...(created ? [created] : [])] };
    else if (endpoint === `${ROLES_ENDPOINT}/${created?.id}`) body = { ...created, ready: false };
    else if (endpoint === ROLES_ENDPOINT.replace(/\/roles$/, '')) body = { id: 'vqa2g2xc9wsl', name: 'main', kind: 'postgresql', deleted_at: null };
    else assert.fail('unexpected provider endpoint');
    changeProvider(body, endpoint, options); return new Response(JSON.stringify(body), { status: options.method === 'POST' ? 201 : 200 });
  };
  const clientFactory = config => {
    configs.push(config); const isProbe = config.connectionString.includes(candidate);
    return { on() {}, async connect() {
      if (isProbe && ++probeConnections === 2 && secondError) throw Object.assign(new Error(canary), { code: secondError });
    }, async query(text, values) {
      sql.push({ text, values }); let body = { rows: [], rowCount: 0 };
      if (text.startsWith('SELECT pg_try_advisory')) body = { rows: [{ locked: true }], rowCount: 1 };
      else if (text.includes(' AS alive')) body = { rows: [{ alive: true }], rowCount: 1 };
      else if (text === CANONICAL_AUTHORITY_SQL) body = { rows: [truth(AUTHORITY_KEYS)], rowCount: 1 };
      else if (text === PUBLIC_PROFILE_SQL) body = { rows: [truth(PUBLIC_KEYS)], rowCount: 1 };
      else if (text === PROBE_PROFILE_SQL) body = { rows: [truth(PROBE_KEYS)], rowCount: 1 };
      else if (text === SESSION_SQL) body = { rows: [{ observer_identity: true, observer_visible: true, role_present: true, sessions: 0 }], rowCount: 1 };
      else if (text === OBSERVER_SQL) body = { rows: [{ visible: true }], rowCount: 1 };
      changeSql(body, text, values); return body;
    }, async end() {} };
  };
  const options = { env: environment, read, download: async () => evidence.zip, fetchImpl, clientFactory,
    now: () => clock, wait: async ms => { clock += ms; }, assertMain: async () => {}, checkpoint: report => checkpoints.push(structuredClone(report)) };
  return { options, calls, sql, configs, checkpoints, approval, evidence };
}

function noSecrets(value) {
  const text = JSON.stringify(value); for (const secret of [canary, env.PLANETSCALE_API_TOKEN, 'postgresql://', ...Object.values(roles), observer, candidate]) {
    assert.equal(text.includes(secret), false, secret);
  }
}

test('protected owner source context rejects tampering', () => {
  ownerContext(env);
  for (const [key, value] of Object.entries({ GITHUB_ACTOR: 'other', GITHUB_ACTOR_ID: '1', GITHUB_REPOSITORY_ID: '2',
    GITHUB_RUN_ATTEMPT: '2', GITHUB_REF: 'refs/heads/fix', REF_PROTECTED: 'false', GITHUB_EVENT_NAME: 'push',
    RELEASE_SHA: 'b'.repeat(40), GITHUB_WORKFLOW_REF: 'other', GITHUB_RUN_ID: '0', GITHUB_RUN_NUMBER: '0' })) {
    assert.throws(() => ownerContext({ ...env, [key]: value }), /protected_owner_context_required/);
  }
});

test('canonical map and observer URL remain exact and distinct', () => {
  assert.deepEqual(canonicalRoles(env.PSCALE_ROLE_IDENTIFIERS), roles); mainConnection(url(observer));
  for (const raw of ['invalid', JSON.stringify({}), JSON.stringify({ ...roles, lythaus_migrations: roles.lythaus_admin })]) {
    assert.throws(() => canonicalRoles(raw), /canonical_role_map/);
  }
  for (const raw of [url(observer).replace('vqa2g2xc9wsl', 'other'), url(observer).replace('verify-full', 'require'),
    url(observer).replace('aws-eu-central-1-1', 'other'), url(observer).replace('/postgres?', '/other?')]) {
    assert.throws(() => mainConnection(raw), /observer_target_invalid/);
  }
});

test('audit proves intended authority without changing connection, map or SQL', async () => {
  const f = fixture(); const report = await auditMigrationRole({ ...f.options, now: baseTime });
  assert.equal(report.status, 'AUDIT_READY_NOT_INSTALL_AUTHORITY');
  assert.equal(report.existingExecutorMatchesCanonical, false); assert.equal(report.functionState, 'ABSENT');
  assert.equal(f.calls.every(call => call.method === 'GET'), true); noSecrets(report);
  assert.equal(f.sql.some(call => /^(?:SET|GRANT|CREATE|UPDATE|INSERT|DELETE|ALTER)\b/.test(call.text)), false);
});

for (const key of [...AUTHORITY_KEYS, ...PUBLIC_KEYS]) test(`audit blocks false predicate ${key}`, async () => {
  const f = fixture({ changeSql(body) { if (Object.hasOwn(body.rows?.[0] ?? {}, key)) body.rows[0][key] = false; } });
  const report = await auditMigrationRole({ ...f.options, now: baseTime });
  assert.equal(report.status, 'BLOCKED'); noSecrets(report);
});

test('ambiguous, incomplete or wrong-branch inventory fails closed', async () => {
  for (const mutate of [body => { body.total_count++; }, body => { body.data.push(body.data[0]); body.total_count++; },
    body => { body.data[0].branch.id = 'other'; }, body => { body.next_page = 3; }]) {
    const f = fixture({ changeProvider(body, endpoint) { if (endpoint.includes('/roles?')) mutate(body); } });
    await assert.rejects(roleInventory(env, f.options.fetchImpl), /role_/);
  }
});

test('blank or altered separate consent never creates or connects', async () => {
  for (const change of [r => { delete r.scope; }, r => { r.extra = true; }, r => { r.sourceSha = 'b'.repeat(40); },
    r => { r.profileSha256 = 'd'.repeat(64); }, r => { r.expectedRunNumber++; }, r => { r.operator = 'other'; },
    r => { r.reviewer = owner; }, r => { r.maximumAllInUsd = 1; }, r => { r.existingAuthorityVerified = false; },
    r => { r.windowEnd = new Date(baseTime + 1800001).toISOString(); }, r => { r.tokenExpiresAt = r.windowEnd; },
    r => { r.windowStart = new Date(baseTime + 1).toISOString(); }]) {
    const f = fixture(); change(f.approval); f.options.env.MIGRATION_PROBE_APPROVAL_JSON = JSON.stringify(f.approval);
    const report = await runProbe(f.options); assert.equal(report.status, 'BLOCKED_NOT_CREATED');
    assert.equal(f.calls.length, 0); assert.equal(f.configs.length, 0); noSecrets(report);
  }
  assert.throws(() => probeConsent(env, baseTime), /separate_approval/);
});

test('one-use history refuses gaps, unknown attempts, missing jobs and any prior probe', async () => {
  for (const changeRead of [(body, suffix) => { if (suffix.includes('/workflows/')) body.workflow_runs[1].run_number = 3; },
    (body, suffix) => { if (suffix.includes('/workflows/')) body.workflow_runs[0].run_attempt = 2; },
    (body, suffix) => { if (suffix.includes('/jobs?')) body.total_count++; },
    (body, suffix) => { if (suffix.includes('/jobs?')) body.jobs[0].name = 'Separate short-lived migration probe'; }]) {
    const f = fixture({ changeRead }); await assert.rejects(proveOneUseRun(env, f.approval, f.options.read));
    const report = await runProbe(f.options); assert.equal(report.requests, 0); noSecrets(report);
  }
});

test('quiet consumer scan refuses active grants and incomplete pagination', async () => {
  for (const body of [{ total_count: 1, workflow_runs: [run(900, 2)] }, { total_count: 1, workflow_runs: [] }]) {
    await assert.rejects(quietConsumers(env, async () => body));
  }
});

test('audit archive provenance rejects wrong hashes, stale report and corrupt ZIP', async () => {
  const f = fixture(); await proveAudit(env, f.approval, { ...f.options, now: baseTime });
  for (const key of ['auditReportSha256', 'auditArchiveSha256']) {
    await assert.rejects(proveAudit(env, { ...f.approval, [key]: 'd'.repeat(64) }, { ...f.options, now: baseTime }));
  }
  await assert.rejects(proveAudit(env, f.approval, { ...f.options, now: baseTime + 3600001 }));
  const bad = Buffer.from(f.evidence.zip); bad[40] ^= 255; assert.throws(() => extractAudit(bad));
});

test('wrong audit execution, repository, job or expired artifact blocks before creation', async () => {
  for (const mutate of [(body, suffix) => { if (suffix === '/actions/runs/100/attempts/1') body.head_sha = 'd'.repeat(40); },
    (body, suffix) => { if (suffix === '/actions/runs/100/attempts/1') body.run_attempt = 2; },
    (body, suffix) => { if (suffix === '/actions/runs/100/attempts/1') body.repository.id = 2; },
    (body, suffix) => { if (suffix.includes('/jobs?')) body.jobs[0].conclusion = 'cancelled'; },
    (body, suffix) => { if (suffix === '/actions/artifacts/300') body.expired = true; }]) {
    const f = fixture({ changeRead: mutate }); const report = await runProbe(f.options);
    assert.equal(report.requests, 0); noSecrets(report);
  }
});

test('precreate observer authority and remaining containment time fail before the sole POST', async () => {
  const f = fixture({ changeSql(body, text) { if (text === OBSERVER_SQL) body.rows[0].visible = false; } });
  assert.equal((await runProbe(f.options)).requests, 0);
  const late = fixture(); late.options.now = () => baseTime + 600001;
  const report = await runProbe(late.options); assert.equal(report.requests, 0);
  assert.equal(report.blocker, 'insufficient_probe_containment_window'); noSecrets(report);
});

test('provider denial, malformed metadata and redirects never retry or leak exception text', async () => {
  for (const fetchImpl of [async () => new Response(canary, { status: 403 }), async () => new Response(canary),
    async () => ({ status: 200, redirected: true }), async () => { throw new Error(canary); }]) {
    const f = fixture(); let calls = 0; f.options.fetchImpl = async (...args) => { calls++; return fetchImpl(...args); };
    const report = await runProbe(f.options); assert.equal(report.requests, 0); assert.equal(calls, 1); noSecrets(report);
  }
});

test('a pre-existing equivalent probe or an unavailable migration lock blocks before creation', async () => {
  const existing = fixture({ changeProvider(body, endpoint) {
    if (endpoint.includes('/roles?')) { body.data[0].name = 'lythaus-migration-probe-20261114-01'; }
  } });
  assert.equal((await runProbe(existing.options)).requests, 0);
  const locked = fixture({ changeSql(body, sql) { if (sql.startsWith('SELECT pg_try_advisory')) body.rows[0].locked = false; } });
  const report = await runProbe(locked.options); assert.equal(report.requests, 0); assert.equal(report.blocker, 'migration_coordination_busy');
});

test('single minimal creation, positive login, actual expiry denial and separate session proofs', async () => {
  const f = fixture(); const report = await runProbe(f.options);
  assert.equal(report.status, 'PROBE_EXPIRED_AND_CLOSED_NOT_MIGRATION_READY'); assert.equal(report.requests, 1);
  assert.equal(report.loginAttempts, 2); assert.equal(report.expiryLoginDenied, true);
  assert.equal(report.initialSessionAbsenceVerified, true); assert.equal(report.finalSessionAbsenceVerified, true);
  const post = f.calls.filter(call => call.method === 'POST'); assert.equal(post.length, 1);
  assert.deepEqual(JSON.parse(post[0].body), { name: f.approval.name, ...REQUEST_PROFILE });
  const configs = f.configs.filter(config => config.connectionString.includes(candidate));
  assert.equal(configs.length, 2); assert.equal(configs[0].connectionString, configs[1].connectionString);
  assert.deepEqual(configs[0].ssl, configs[1].ssl);
  assert.equal(configs.every(config => !config.connectionString.includes(observer)), true);
  assert.equal(f.checkpoints[0].creation, 'UNKNOWN'); noSecrets(report); noSecrets(f.checkpoints);
  assert.equal(report.installerQualified, false);
});

test('uncertain POST never retries or falsely claims no creation', async () => {
  const f = fixture({ createError: true }); const report = await runProbe(f.options);
  assert.equal(report.status, 'CREATION_UNCERTAIN_RECONCILE_ONLY'); assert.equal(report.creation, 'UNKNOWN');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1); assert.equal(report.loginAttempts, 0); noSecrets(report);
});

test('post-create and final checkpoint failures retain the created ID and containment state', async () => {
  for (const failAt of ['ACKNOWLEDGED_REQUIRES_VERIFICATION', 'PROBE_EXPIRED_AND_CLOSED_NOT_MIGRATION_READY']) {
    const f = fixture(); f.options.checkpoint = report => {
      if (report.creation === failAt || report.status === failAt || report.durableCheckpointVerified === false) throw new Error(canary);
    };
    const report = await runProbe(f.options);
    assert.equal(report.status, 'CONTAINMENT_REQUIRED'); assert.equal(report.requests, 1);
    assert.equal(report.createdRoleId, candidate.replaceAll('_', '')); assert.equal(report.durableCheckpointVerified, false);
    assert.equal(report.blocker, 'durable_checkpoint_unavailable'); noSecrets(report);
  }
  const f = fixture(); f.options.checkpoint = () => { throw new Error(canary); };
  const report = await runProbe(f.options); assert.equal(report.creation, 'UNKNOWN');
  assert.equal(report.status, 'CREATION_UNCERTAIN_RECONCILE_ONLY');
  assert.equal(f.calls.some(call => call.method === 'POST'), false); noSecrets(report);
});

test('unsafe returned or effective profile requires containment without fallback', async () => {
  for (const mutate of [b => { b.inherited_roles = ['postgres']; }, b => { b.expires_at = new Date(baseTime + 900001).toISOString(); },
    b => { b.access_host_url = 'wrong.psdb.cloud'; }]) {
    const f = fixture({ changeProvider(body, _endpoint, options) { if (options.method === 'POST') mutate(body); } });
    const report = await runProbe(f.options); assert.equal(report.status, 'CONTAINMENT_REQUIRED');
    assert.equal(report.loginAttempts, 0); noSecrets(report);
  }
  for (const key of PROBE_KEYS) {
    const f = fixture({ changeSql(body, sql) { if (sql === PROBE_PROFILE_SQL) body.rows[0][key] = false; } });
    const report = await runProbe(f.options); assert.equal(report.status, 'CONTAINMENT_REQUIRED');
    assert.equal(report.loginAttempts, 1); noSecrets(report);
  }
});

test('transport errors or successful post-expiry login cannot prove rejection', async () => {
  for (const secondError of ['ECONNRESET', 'ETIMEDOUT', 'CERT_HAS_EXPIRED', null]) {
    const f = fixture({ secondError }); const report = await runProbe(f.options);
    assert.equal(report.status, 'CONTAINMENT_REQUIRED'); assert.equal(report.expiryLoginDenied, false);
    assert.equal(report.loginAttempts, 2); noSecrets(report);
  }
});

test('fresh profile, observer visibility and current main are mandatory', async () => {
  const fresh = fixture({ changeSql(body, text) { if (text === PUBLIC_PROFILE_SQL) body.rows[0].public_connect = false; } });
  assert.equal((await runProbe(fresh.options)).requests, 0);
  const invisible = fixture({ changeSql(body, text) { if (text === SESSION_SQL) body.rows[0].observer_visible = false; } });
  const result = await runProbe(invisible.options); assert.equal(result.status, 'CONTAINMENT_REQUIRED'); assert.equal(result.loginAttempts, 1);
  const main = fixture(); main.options.assertMain = async () => { throw new Error(canary); };
  const report = await runProbe(main.options); assert.equal(report.requests, 0); noSecrets(report);
});

test('CLI refuses missing approval with sanitized output', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/run-planetscale-migration-probe.mjs', 'validate-probe-approval'], { env, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stderr, ''); noSecrets(JSON.parse(result.stdout));
});

test('workflow keeps old defaults and scopes protected inputs after synthetic tests', () => {
  const workflow = parse(fs.readFileSync('.github/workflows/planetscale-cutover-identity-preflight.yml', 'utf8'));
  assert.equal(workflow.on.workflow_dispatch.inputs.inspection.default, 'identity');
  const job = workflow.jobs.migration_role; assert.equal(job.environment, 'production'); assert.equal(job['timeout-minutes'], 30);
  assert.deepEqual(job.permissions, { contents: 'read', actions: 'read' });
  assert.equal(workflow.on.workflow_dispatch.inputs.migration_probe_approval.default, '');
  const runtime = job.steps.findIndex(step => step.env?.PLANETSCALE_ADMIN_DATABASE_URL);
  assert.ok(runtime > job.steps.findIndex(step => step.run?.includes('node --test')));
  assert.equal(job.steps.filter(step => step.env?.PLANETSCALE_ADMIN_DATABASE_URL).length, 1);
  for (const name of ['inspect', 'install_target', 'restore_inventory']) assert.equal(JSON.stringify(workflow.jobs[name]).includes('migration_probe_approval'), false);
  assert.doesNotMatch(JSON.stringify(job), /secrets: write|wrangler|apply-planetscale/);
});

test('SQL contract covers implicit PUBLIC, column ACLs and function reachability without application data', () => {
  assert.match(PUBLIC_PROFILE_SQL, /acldefault/); assert.match(PUBLIC_PROFILE_SQL, /pg_attribute/);
  assert.match(PROBE_PROFILE_SQL, /has_any_column_privilege/); assert.match(PROBE_PROFILE_SQL, /pg_auth_members/);
  for (const sql of [PUBLIC_PROFILE_SQL, CANONICAL_AUTHORITY_SQL, PROBE_PROFILE_SQL, SESSION_SQL]) {
    assert.doesNotMatch(sql, /FROM identity\.|FROM content\.|SET ROLE|INSERT INTO|UPDATE identity/);
  }
});

test('read-only connections close on failed metadata', async () => {
  let closed = false;
  await assert.rejects(readOnly(url(observer), () => ({ async connect() {}, async query() {}, async end() { closed = true; } }),
    async () => { throw new Error(canary); }, 'fixture'));
  assert.equal(closed, true);
});
