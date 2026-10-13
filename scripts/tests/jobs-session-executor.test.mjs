import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { parse } from 'yaml';
import { prepare, execute, recover, validateRecord, clonePayload, digest, FLAG, TARGETS,
  versionProjection } from '../release/jobs-session-lifecycle.mjs';
import { boundedJson, createApi, workflowGate, assertSharedWorkerLock, REPO } from '../ci/jobs-session-executor.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sourceSha = 'a'.repeat(40);
const executorSha = 'b'.repeat(40);
const durable = { artifactId: '123', artifactDigest: 'sha256:' + 'c'.repeat(64) };
const metadata = { sessionRole: 'pscale_api_9jfbtij9y4b2', currentRole: 'pscale_api_9jfbtij9y4b2',
  database: 'postgres', isolation: 'read committed', defaultIsolation: 'read committed', searchPath: 'public',
  memberships: 0, readOnly: true, superuser: false, canLogin: true, bypassRls: false,
  createRole: false, createDb: false, inherit: true, trustUsage: true, publicCreate: false,
  identityCreate: false, trustCreate: false, usersUpdate: false, usersIdSelect: true,
  usersStatusSelect: true, usersRls: false, usersForceRls: false };
function fixture() {
  const versions = {};
  const active = {};
  const settings = {};
  const expected = {};
  const calls = [];
  let counter = 100;
  for (const [component, number] of [['public', 1], ['jobs', 2]]) {
    const version = { id: id(number), annotations: { 'workers/tag': sourceSha },
      main_module: 'index.js', compatibility_date: '2026-07-27', compatibility_flags: ['nodejs_compat'],
      modules: [{ name: 'index.js', content_type: 'application/javascript+module', content_base64: Buffer.from('synthetic source private sentinel').toString('base64') }],
      limits: { cpu_ms: 30 }, bindings: [
        { name: 'WORKER_VERSION', type: 'version_metadata' },
        { name: 'DATABASE_READINESS_TOKEN', type: 'secret_text' },
        { name: 'UNRELATED', type: 'plain_text', text: 'raw configuration sentinel' },
        { name: 'DB_JOBS_FRESH', type: 'hyperdrive', id: '442bb04b99004cb38c6974ec031d65ee' },
        { name: 'JOBS_COMPATIBILITY', type: 'service', service: TARGETS.jobs },
      ] };
    versions[version.id] = version;
    active[component] = { id: id(number + 10), strategy: 'percentage', versions: [{ version_id: version.id, percentage: 100 }] };
    settings[component] = { name: TARGETS[component], logpush: false, tags: ['private settings sentinel'],
      subdomain: { enabled: false, previews_enabled: false }, observability: { enabled: true } };
    expected[component] = { versionId: version.id, deploymentId: active[component].id };
  }
  const api = {
    async releaseGuard() { calls.push('guard'); },
    async snapshot(component, versionId) { calls.push('read:' + component); return structuredClone({ deployment: active[component], version: versions[versionId], settings: settings[component] }); },
    async createCandidate(component, payload) {
      calls.push('create:' + component);
      const candidate = structuredClone({ ...payload, id: id(++counter) });
      candidate.bindings = payload.bindings.map(binding => binding.type === 'inherit'
        ? structuredClone(versions[binding.version_id].bindings.find(value => value.name === binding.name)) : binding);
      versions[candidate.id] = candidate;
      return { id: candidate.id };
    },
    async getVersion(component, versionId) { return structuredClone(versions[versionId]); },
    async deploy(component, list) {
      calls.push('deploy:' + component + ':' + list.length);
      active[component] = { id: id(++counter), strategy: 'percentage', versions: structuredClone(list) };
      return structuredClone(active[component]);
    },
    async findCandidates(component, marker) { return Object.values(versions).filter(version => version.annotations?.['workers/message'] === marker).map(version => structuredClone(version)); },
    async deleteCandidate(component, versionId) { calls.push('delete:' + component); delete versions[versionId]; },
    async versionExists(component, versionId) { return versionId in versions; },
    async probe(candidates) {
      calls.push('probe');
      return { service: 'lythaus-public-api', publicWorkerVersionId: candidates.public, jobsWorkerVersionId: candidates.jobs,
        publicReleaseTag: sourceSha, jobsReleaseTag: sourceSha, rawSecret: 'provider secret sentinel',
        receipt: { schemaVersion: 'lythaus-jobs-reputation-session-v1', status: 'observed', rollbackConfirmed: true,
          metadata: { ...metadata, privateData: 'content sentinel' } } };
    },
  };
  return { api, versions, active, settings, calls, expected };
}
async function prepared(f = fixture()) {
  const record = await prepare({ api: f.api, expected: f.expected, runId: '1234', attempt: '1', sourceSha, executorSha });
  f.calls.length = 0;
  return { ...f, record };
}
const run = f => execute({ api: f.api, record: f.record, durable });
const mutations = calls => calls.filter(value => /^(create|deploy|delete|probe):?/.test(value));

test('one pinned request, exact inherited bindings, original versions restored and candidate versions deleted', async () => {
  const f = await prepared();
  const payload = clonePayload(f.versions[id(1)], 'synthetic');
  assert(payload.bindings.filter(value => value.name !== FLAG).every(value => value.type === 'inherit' && value.version_id === id(1)));
  assert(!JSON.stringify(payload).includes('raw configuration sentinel'));
  const result = await run(f);
  assert.equal(result.status, 'observed');
  assert.equal(result.restoration.status, 'restored_verified');
  assert.equal(f.calls.filter(value => value === 'probe').length, 1);
  assert.deepEqual(f.active.public.versions, [{ version_id: id(1), percentage: 100 }]);
  assert.deepEqual(f.active.jobs.versions, [{ version_id: id(2), percentage: 100 }]);
  assert.equal(Object.keys(f.versions).length, 2);
  for (const sentinel of ['provider secret sentinel', 'content sentinel', 'raw configuration sentinel', 'private settings sentinel', 'synthetic source private sentinel']) {
    assert(!JSON.stringify([result, f.record]).includes(sentinel));
  }
  assert.equal(result.probe.receipt.prerequisitesMet, true);
});
for (const field of ['versionId', 'deploymentId']) test(`expected ${field} mismatch fails before writes`, async () => {
  const f = fixture(); f.expected.public[field] = id(99);
  await assert.rejects(prepare({ api: f.api, expected: f.expected, runId: '1234', attempt: '1', sourceSha, executorSha }));
  assert.deepEqual(mutations(f.calls), []);
});
for (const alteration of ['enabled flag', 'unknown field', 'unknown binding', 'secret value', 'assets', 'migration', 'previews', 'missing modules', 'foreign tag', 'duplicate binding']) {
  test(`unsupported ${alteration} rejected during preparation`, async () => {
    const f = fixture(); const v = f.versions[id(1)];
    if (alteration === 'enabled flag') v.bindings.push({ name: FLAG, type: 'plain_text', text: 'true' });
    if (alteration === 'unknown field') v.new_provider_setting = true;
    if (alteration === 'unknown binding') v.bindings[0].type = 'unreviewed';
    if (alteration === 'secret value') v.bindings[1].text = 'unreturnable';
    if (alteration === 'assets') v.assets = { jwt: 'secret' };
    if (alteration === 'migration') v.migrations = { new_tag: 'v2' };
    if (alteration === 'previews') f.settings.public.subdomain.previews_enabled = true;
    if (alteration === 'missing modules') v.modules = [];
    if (alteration === 'foreign tag') v.annotations['workers/tag'] = 'd'.repeat(40);
    if (alteration === 'duplicate binding') v.bindings.push(v.bindings[0]);
    await assert.rejects(prepare({ api: f.api, expected: f.expected, runId: '1234', attempt: '1', sourceSha, executorSha }));
    assert.deepEqual(mutations(f.calls), []);
  });
}
test('absent durable record stops before any provider call', async () => {
  const f = await prepared();
  await assert.rejects(execute({ api: f.api, record: f.record }), /durable_recovery_missing/);
  assert.deepEqual(f.calls, []);
});
for (const field of ['settings', 'deployment', 'source']) test(`baseline ${field} race stops before mutation`, async () => {
  const f = await prepared();
  if (field === 'settings') f.settings.jobs.logpush = true;
  if (field === 'deployment') f.active.jobs.id = id(99);
  if (field === 'source') f.versions[id(2)].modules[0].content_base64 = Buffer.from('other').toString('base64');
  assert.equal((await run(f)).status, 'failed');
  assert.deepEqual(mutations(f.calls), []);
});
test('concurrent release observed by guard stops before mutation', async () => {
  const f = await prepared(); f.api.releaseGuard = async () => { throw new Error('private provider detail'); };
  assert.equal((await run(f)).status, 'failed'); assert.deepEqual(mutations(f.calls), []);
});
for (const boundary of ['upload acknowledgement', 'deployment acknowledgement', 'second worker upload', 'probe']) {
  test(`${boundary} failure restores both and never retries the request`, async () => {
    const f = await prepared();
    if (boundary === 'upload acknowledgement' || boundary === 'second worker upload') {
      const create = f.api.createCandidate;
      f.api.createCandidate = async (component, payload) => {
        const value = await create(component, payload);
        if (boundary === 'upload acknowledgement' || component === 'public') throw new Error('private failure');
        return value;
      };
    } else if (boundary === 'deployment acknowledgement') {
      const deploy = f.api.deploy;
      f.api.deploy = async (component, list) => { const value = await deploy(component, list); if (list.length === 2) throw new Error('private failure'); return value; };
    } else f.api.probe = async () => { f.calls.push('probe'); throw new Error('raw response'); };
    const result = await run(f);
    assert.equal(result.status, 'failed'); assert.equal(result.restoration.status, 'restored_verified');
    assert.equal(f.calls.filter(value => value === 'probe').length, boundary === 'probe' ? 1 : 0);
    assert.equal(Object.keys(f.versions).length, 2);
  });
}
test('probe mismatched version rejected without retaining injected fields', async () => {
  const f = await prepared(); const probe = f.api.probe;
  f.api.probe = async pins => ({ ...await probe(pins), jobsWorkerVersionId: id(99) });
  const result = await run(f); assert.equal(result.status, 'failed'); assert.equal(result.probe, null); assert.equal(result.restoration.status, 'restored_verified');
});
test('unknown role is masked and fabricated success is recalculated false', async () => {
  const f = await prepared(); const probe = f.api.probe;
  f.api.probe = async pins => {
    const result = await probe(pins); result.receipt.metadata.currentRole = 'private role sentinel'; result.receipt.prerequisitesMet = true; return result;
  };
  const result = await run(f); assert.equal(result.status, 'observed'); assert.equal(result.probe.receipt.prerequisitesMet, false);
  assert(!JSON.stringify(result).includes('private role sentinel'));
});
test('restoration failure is explicit; independent bounded recovery performs no probe', async () => {
  const f = await prepared(); const deploy = f.api.deploy;
  f.api.deploy = async (component, list) => { if (component === 'public' && list.length === 1) throw new Error('raw secret'); return deploy(component, list); };
  const result = await run(f); assert.equal(result.status, 'failed'); assert.equal(result.restoration.workers.public, 'restoration_unverified');
  assert.equal(result.restoration.workers.jobs, 'restored_verified');
  f.api.deploy = deploy; f.calls.length = 0;
  assert.equal((await recover({ api: f.api, record: f.record })).status, 'restored_verified');
  assert(!f.calls.includes('probe'));
});
test('candidate deletion acknowledgement is not certified without verified absence', async () => {
  const f = await prepared(); f.api.deleteCandidate = async () => undefined;
  assert.equal((await run(f)).restoration.status, 'restoration_unverified');
});
test('cancel between worker stages restores partial exposure and does not probe', async () => {
  const f = await prepared(); const controller = new AbortController(); const deploy = f.api.deploy;
  f.api.deploy = async (component, list) => { const value = await deploy(component, list); if (component === 'jobs' && list.length === 2) controller.abort(); return value; };
  const result = await execute({ api: f.api, record: f.record, durable, signal: controller.signal });
  assert.equal(result.status, 'cancelled'); assert.equal(result.restoration.status, 'restored_verified'); assert(!f.calls.includes('probe'));
});
test('runner loss recovered from immutable baseline plus provider marker without local candidate IDs', async () => {
  const f = await prepared();
  const candidate = await f.api.createCandidate('jobs', clonePayload(f.versions[id(2)], 'jobs-session:1234:1:jobs'));
  await f.api.deploy('jobs', [{ version_id: id(2), percentage: 100 }, { version_id: candidate.id, percentage: 0 }]);
  f.calls.length = 0;
  assert.equal((await recover({ api: f.api, record: JSON.parse(JSON.stringify(f.record)) })).status, 'restored_verified');
  assert(!f.calls.includes('probe')); assert.equal(Object.keys(f.versions).length, 2);
});
test('concurrent release is never overwritten by restoration', async () => {
  const f = await prepared(); const create = f.api.createCandidate;
  f.api.createCandidate = async (component, payload) => {
    const result = await create(component, payload); f.active[component] = { id: id(88), strategy: 'percentage', versions: [{ version_id: id(99), percentage: 100 }] }; return result;
  };
  const result = await run(f); assert.equal(result.restoration.status, 'restoration_unverified');
  assert.equal(f.active.jobs.versions[0].version_id, id(99)); assert(!f.calls.some(value => value.startsWith('deploy:jobs')));
});
test('record rejects extra fields, unsafe versions, and repeat attempts', async () => {
  const f = await prepared();
  for (const value of [{ ...f.record, token: 'secret' }, { ...f.record, attempt: '2' },
    { ...f.record, workers: { ...f.record.workers, public: { ...f.record.workers.public, versionId: '../../other' } } }]) assert.throws(() => validateRecord(value));
});
test('stable hashes bind exact modules and unrelated configuration', () => {
  const f = fixture(); const before = digest(versionProjection(f.versions[id(1)]));
  f.versions[id(1)].limits.cpu_ms++;
  assert.notEqual(digest(versionProjection(f.versions[id(1)])), before);
});
test('original false flag is restored exactly', async () => {
  const f = fixture(); f.versions[id(1)].bindings.push({ name: FLAG, type: 'plain_text', text: 'false' });
  const value = await prepared(f); assert.equal((await run(value)).restoration.status, 'restored_verified');
  assert.equal(f.versions[id(1)].bindings.find(binding => binding.name === FLAG).text, 'false');
});
for (const kind of ['redirect', 'timeout', 'body timeout', 'oversized', 'invalid JSON', 'abort']) {
  test(`bounded request rejects ${kind} with sanitized errors`, async () => {
    const controller = new AbortController(); if (kind === 'abort') controller.abort();
    const fetchImpl = async (url, init) => {
      assert.equal(init.redirect, 'manual');
      if (kind === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://private.example/secret' } });
      if (kind === 'timeout') return new Promise(() => {});
      if (kind === 'body timeout') return new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } });
      return new Response(kind === 'invalid JSON' ? 'raw private string' : JSON.stringify({ raw: 'x'.repeat(200) }), { headers: { 'content-type': 'application/json' } });
    };
    await assert.rejects(boundedJson(fetchImpl, 'https://synthetic.invalid', { signal: controller.signal }, { timeoutMs: 10, maxBytes: 50 }), /^Error: request_unavailable$/);
  });
}
test('API adapter uses fixed targets, exact inheritance endpoint, one request and private receipt bound', async () => {
  const calls = [];
  const api = createApi({ cloudflareToken: 'private cf token', githubToken: 'private gh token', readinessToken: 'private readiness token', runId: '1234',
    fetchImpl: async (url, init) => { calls.push({ url, init }); return Response.json(url.startsWith('https://api.lythaus.co') ? { receipt: 'synthetic' } : { success: true, result: { id: id(33) } }); } });
  await api.createCandidate('jobs', { bindings: [{ name: 'TOKEN', type: 'inherit', version_id: id(2) }] });
  await api.probe({ public: id(1), jobs: id(2) });
  assert(calls[0].url.endsWith('/workers/lythaus-jobs-development/versions?deploy=false'));
  assert.equal(calls[1].url, 'https://api.lythaus.co/internal/readiness/jobs-reputation-session');
  assert.equal(calls[1].init.headers['Cloudflare-Workers-Version-Overrides'], `${TARGETS.public}="${id(1)}", ${TARGETS.jobs}="${id(2)}"`);
  assert.throws(() => api.getVersion('foreign', id(1)), /target_invalid/);
});
function gateFixture() {
  const env = { GITHUB_REPOSITORY: REPO, GITHUB_REF: 'refs/heads/main', REF_PROTECTED: 'true',
    GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '1234', GITHUB_SHA: executorSha };
  const original = { id: 1234, event: 'workflow_dispatch', head_branch: 'main', head_sha: executorSha,
    run_attempt: 1, status: 'in_progress', path: '.github/workflows/jobs-session-one-shot.yml', repository: { full_name: REPO } };
  const history = { total_count: 1, workflow_runs: [original] };
  const api = { gh: async route => route.includes('/runs?') ? history : route.includes('/workflows/')
    ? { state: 'active', path: '.github/workflows/jobs-session-recovery.yml' } : original };
  return { env, original, history, api };
}
test('protected current main/run gate succeeds', async () => { const f = gateFixture(); await workflowGate(f.api, f.env); });
test('known skipped execution permits fresh preflight under existing authorization', async () => {
  const f = gateFixture(); f.history.workflow_runs.push({ id: 1 }); const gh = f.api.gh;
  f.api.gh = async route => route.includes('/1/jobs?') ? { total_count: 1, jobs: [{ steps: [{ name: 'Execute one diagnostic and verify restoration', conclusion: 'skipped' }] }] } : gh(route);
  await workflowGate(f.api, f.env);
});
test('prior attempted execution blocks replay even after artifact expiry', async () => {
  const f = gateFixture(); f.history.workflow_runs.push({ id: 1 }); const gh = f.api.gh;
  f.api.gh = async route => route.includes('/1/jobs?') ? { total_count: 1, jobs: [{ steps: [{ name: 'Execute one diagnostic and verify restoration', conclusion: 'failure' }] }] } : gh(route);
  await assert.rejects(workflowGate(f.api, f.env), /one_shot_already_requested/);
});
for (const kind of ['branch', 'protection', 'attempt', 'source', 'event', 'missing recovery', 'prior request']) {
  test(`workflow rejects ${kind} before provider mutation`, async () => {
    const f = gateFixture();
    if (kind === 'branch') f.env.GITHUB_REF = 'refs/heads/untrusted';
    if (kind === 'protection') f.env.REF_PROTECTED = 'false';
    if (kind === 'attempt') f.env.GITHUB_RUN_ATTEMPT = '2';
    if (kind === 'source') f.original.head_sha = sourceSha;
    if (kind === 'event') f.original.event = 'pull_request';
    if (kind === 'missing recovery') f.api.gh = async route => route.includes('/workflows/') ? { state: 'disabled' } : f.original;
    if (kind === 'prior request') f.history.workflow_runs.push({ id: 1 });
    await assert.rejects(workflowGate(f.api, f.env));
  });
}
test('current rollback locking gap is an explicit pre-mutation blocker', () => {
  assert.throws(() => assertSharedWorkerLock(), /shared_worker_lock_unavailable/);
  const locked = 'concurrency:\n  group: lythaus-production-workers\n  cancel-in-progress: false\n';
  const canonical = locked.replace('lythaus-production-workers', 'lythaus-canonical-production-release');
  assert.doesNotThrow(() => assertSharedWorkerLock(name => {
    if (name.endsWith('production-release.yml')) return canonical + `jobs:\n  rollback:\n    ${locked.replaceAll('\n', '\n    ')}`;
    if (name.endsWith('jobs-session-one-shot.yml')) return canonical + `jobs:\n  diagnose:\n    ${locked.replaceAll('\n', '\n    ')}`;
    if (name.endsWith('jobs-session-recovery.yml')) return canonical + `jobs:\n  recover:\n    ${locked.replaceAll('\n', '\n    ')}`;
    return locked;
  }));
});
test('protected workflow persists baseline before execution; recovery has no readiness credential or probe', () => {
  const main = parse(fs.readFileSync('.github/workflows/jobs-session-one-shot.yml', 'utf8'));
  const recovery = parse(fs.readFileSync('.github/workflows/jobs-session-recovery.yml', 'utf8'));
  assert.equal(main.concurrency.group, 'lythaus-canonical-production-release');
  assert.equal(recovery.concurrency.group, main.concurrency.group);
  assert.equal(main.jobs.diagnose.concurrency.group, 'lythaus-production-workers');
  assert.equal(recovery.jobs.recover.concurrency.group, main.jobs.diagnose.concurrency.group);
  assert.equal(main.jobs.diagnose.environment, 'production');
  assert.equal(recovery.jobs.recover.environment, 'production');
  const steps = main.jobs.diagnose.steps;
  assert(steps.findIndex(step => step.id === 'baseline') < steps.findIndex(step => step.run?.endsWith(' execute')));
  assert.equal(steps.find(step => step.id === 'baseline').with['retention-days'], 7);
  assert.equal(steps.find(step => step.id === 'baseline').with['include-hidden-files'], true);
  assert(!JSON.stringify(recovery).includes('DATABASE_READINESS_TOKEN'));
  assert(!JSON.stringify(recovery).includes('executor.mjs execute'));
  for (const file of ['apps/lythaus-public-api/wrangler.jsonc', 'apps/lythaus-jobs/wrangler.jsonc']) assert(!fs.readFileSync(file, 'utf8').includes(FLAG));
});
test('documented delete envelope without result is supported and absence is checked separately', async () => {
  const calls = [];
  const api = createApi({ cloudflareToken: 'synthetic', githubToken: 'synthetic', runId: '1234', fetchImpl: async (url, init) => {
    calls.push(init.method);
    return init.method === 'DELETE' ? Response.json({ success: true }) : new Response(null, { status: 404 });
  } });
  await api.deleteCandidate('jobs', id(2));
  assert.equal(await api.versionExists('jobs', id(2)), false);
  assert.deepEqual(calls, ['DELETE', 'GET']);
});
test('503 sanitized unavailable receipt is retained without retry', async () => {
  const api = createApi({ cloudflareToken: 'synthetic', githubToken: 'synthetic', readinessToken: 'synthetic', runId: '1234',
    fetchImpl: async () => Response.json({ status: 'synthetic unavailable' }, { status: 503 }) });
  assert.deepEqual(await api.probe({ public: id(1), jobs: id(2) }), { status: 'synthetic unavailable' });
});
test('cancel during upload does not deploy the staged version', async () => {
  const f = await prepared(); const create = f.api.createCandidate; const controller = new AbortController();
  f.api.createCandidate = async (component, payload) => { const result = await create(component, payload); controller.abort(); return result; };
  const result = await execute({ api: f.api, record: f.record, durable, signal: controller.signal });
  assert.equal(result.status, 'cancelled'); assert.equal(result.restoration.status, 'restored_verified');
  assert(!f.calls.some(value => value.startsWith('deploy:'))); assert(!f.calls.includes('probe'));
});
