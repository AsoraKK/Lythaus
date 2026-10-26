import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { RESTORE } from '../ci/planetscale-native-restore-contract.mjs';
import { runReviewedCleanupCli } from '../ci/planetscale-native-restore-reviewed-cleanup.mjs';
import { rehearsal } from './planetscale-native-restore-cleanup-command-fixture.mjs';
import { start, time } from './planetscale-native-restore-unmerged-cleanup-fixture.mjs';

const githubToken = 'synthetic-github-access', providerToken = 'restoresynthetic:synthetic-provider-access';
const gitBase = 'https://api.github.com/repos/SyntheticOwner/Lythaus';
const providerBase = `https://api.planetscale.com/v1/organizations/${RESTORE.organization}/databases/${RESTORE.database}`;

function production(t, outcome = 'PASSED', options = {}) {
  const f = rehearsal(t, outcome, options), calls = [], responses = new Map(), output = [];
  Object.assign(f.env, { GH_TOKEN: githubToken, PLANETSCALE_RESTORE_API_TOKEN: providerToken,
    GITHUB_OUTPUT: path.join(f.root, 'github-output') });
  fs.writeFileSync(f.env.GITHUB_OUTPUT, '', { mode: 0o600 });
  const fault = {};
  const fetchImpl = async (raw, request) => {
    const url = new URL(raw); calls.push({ url: raw, method: request.method, headers: request.headers });
    if (url.origin === 'https://api.github.com') {
      assert.equal(request.headers.authorization, `Bearer ${githubToken}`);
      if (url.pathname.endsWith('/zip')) {
        const id = url.pathname.split('/').at(-2);
        return new Response(null, { status: 302, headers: { location: `https://test.blob.core.windows.net/${id}.zip?sig=private-signed-fixture` } });
      }
      const suffix = raw.slice(gitBase.length);
      let response;
      if (suffix === '') response = { id: 1010752912, full_name: f.env.GITHUB_REPOSITORY };
      else if (suffix === '/branches/main') response = { protected: true, commit: { sha: fault.mainSha ?? f.env.RELEASE_SHA } };
      else response = await f.transports.read(suffix);
      responses.set(raw, response); return Response.json(response);
    }
    if (url.hostname === 'test.blob.core.windows.net') {
      assert.equal(request.credentials, 'omit'); assert.deepEqual(request.headers, { accept: 'application/octet-stream' });
      if (fault.storageError) throw Error(`${raw} ${githubToken} ${providerToken} private-response`);
      const id = url.pathname.split('/').at(-1).replace('.zip', '');
      return new Response(fault.archive ?? f.archives.get(id));
    }
    assert.equal(url.origin, 'https://api.planetscale.com');
    assert.equal(request.headers.authorization, providerToken);
    if (fault.providerDenied) return Response.json({ error: 'private provider response' }, { status: 403 });
    if (raw === providerBase) return Response.json({ id: RESTORE.databaseId, name: RESTORE.database, kind: 'postgresql' });
    if (raw.includes('/service-tokens/restoresynthetic')) return Response.json({ id: 'restoresynthetic', expires_at: fault.tokenExpiry ?? null,
      service_token_accesses: ['read_database', 'read_branch', 'delete_branch', 'delete_production_branch', 'read_backups'].map(access => ({
        access, resource_id: RESTORE.databaseId, resource_type: 'database',
        resource: { id: RESTORE.databaseId, name: RESTORE.database, deleted_at: null } })) });
    const suffix = raw.slice(providerBase.length);
    if (suffix.startsWith('/branches?page=')) return Response.json({ current_page: 1, next_page: null, total_count: 1,
      data: [{ id: RESTORE.sourceId, name: 'main' }] });
    if (request.method === 'DELETE' && fault.uncertainDelete) {
      f.setClock(start + 120 * 60000 - 1); fault.finishReadback = true;
      return Response.json({ error: 'private provider response' }, { status: 503 });
    }
    const row = await f.transports.api.request(suffix, { method: request.method });
    if (fault.finishReadback && suffix === `/branches/${RESTORE.target}`) f.setClock(start + 120 * 60000);
    if (request.method === 'DELETE') return new Response(null, { status: 204 });
    return row === null ? new Response(null, { status: 404 }) : Response.json(row);
  };
  const cli = stage => runReviewedCleanupCli({ argv: [stage], env: f.env, fetchImpl, now: f.options.now,
    stdout: value => output.push(value) });
  const handoff = async () => {
    const name = fs.readFileSync(f.env.GITHUB_OUTPUT, 'utf8').split('\n').find(line => line.startsWith('pending_name=')).slice('pending_name='.length);
    const ack = await f.transports.uploadArtifact({ name,
    runId: f.env.GITHUB_RUN_ID, filename: 'pending.json', bytes: fs.readFileSync(path.join(f.env.EVIDENCE_DIR, 'pending.json')) });
    f.env.PENDING_ARTIFACT_ID = ack.artifactId; f.env.PENDING_ARTIFACT_DIGEST = ack.archiveSha256;
  };
  const through = async last => {
    for (const stage of ['prepare', 'download', 'stage', 'verify-pending', 'delete']) {
      if (stage === 'verify-pending') await handoff();
      const result = await cli(stage); if (result.exitCode !== 0 || stage === last) return result;
    }
  };
  return { ...f, calls, responses, output, fault, fetchImpl, cli, handoff, through };
}
const providerWrites = f => f.calls.filter(call => call.url.startsWith('https://api.planetscale.com') && call.method !== 'GET');

for (const outcome of ['PASSED', 'FAILED']) test(`production CLI and Actions-style upload handoff clean ${outcome} evidence once`, async t => {
  const f = production(t, outcome), result = await f.through('delete');
  assert.equal(result.exitCode, 0); assert.equal(result.result.deletionVerified, true);
  assert.equal(result.result.recoveryCertified, false); assert.equal(providerWrites(f).length, 1);
  assert.equal(providerWrites(f)[0].method, 'DELETE');
  const outputs = fs.readFileSync(f.env.GITHUB_OUTPUT, 'utf8');
  assert.match(outputs, /qualification_artifact_id=51\nqualification_run_id=12345\npending_name=native-restore-cleanup-pending-/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.env.EVIDENCE_DIR, 'pending-upload.json'))).artifactId, '52');
  assert.equal(f.output.some(value => value.includes('OWNER_APPROVAL_REQUIRED')), false);
  const retry = await f.cli('delete'); assert.equal(retry.exitCode, 1); assert.equal(providerWrites(f).length, 1);
});

test('prepare, download, stage and pending verification never read or construct provider credentials', async t => {
  const f = production(t); let reads = 0;
  Object.defineProperty(f.env, 'PLANETSCALE_RESTORE_API_TOKEN', { configurable: true, enumerable: true,
    get() { reads++; throw Error('provider token must remain unavailable'); } });
  const result = await f.through('verify-pending');
  assert.equal(result.exitCode, 0); assert.equal(reads, 0);
  assert.equal(f.calls.some(call => call.url.startsWith('https://api.planetscale.com')), false);
});

test('CLI download failure and its private receipt redact signed URLs, credentials and response details', async t => {
  const f = production(t); assert.equal((await f.cli('prepare')).exitCode, 0); f.fault.storageError = true;
  const result = await f.cli('download'); assert.equal(result.exitCode, 1);
  assert.equal(result.result.providerMutations, false);
  const receipt = fs.readFileSync(path.join(f.env.EVIDENCE_DIR, 'stage-error-download.json'), 'utf8');
  assert.doesNotMatch(receipt + f.output.join(''), /private-signed-fixture|synthetic-github-access|synthetic-provider-access|private-response/);
  assert.equal(fs.statSync(path.join(f.env.EVIDENCE_DIR, 'stage-error-download.json')).mode & 0o077, 0);
  assert.equal(providerWrites(f).length, 0);
});

for (const stage of ['prepare', 'download', 'stage', 'verify-pending', 'delete', 'reconcile']) {
  test(`production ${stage} failure exits nonzero and preserves only a sanitized receipt`, async t => {
    const f = production(t);
    if (stage === 'prepare') f.fault.mainSha = 'f'.repeat(40);
    if (stage === 'download') { await f.through('prepare'); f.fault.storageError = true; }
    if (stage === 'stage') {
      await f.through('download'); fs.writeFileSync(path.join(f.env.EVIDENCE_DIR, 'pending.json'), 'existing', { mode: 0o600 });
    }
    if (stage === 'verify-pending') await f.through('stage');
    if (stage === 'delete') { await f.through('verify-pending'); fs.unlinkSync(path.join(f.env.EVIDENCE_DIR, 'pending-download.zip')); }
    if (stage === 'reconcile') { f.env.CLEANUP_MODE = 'reconcile'; await f.through('download'); f.fault.providerDenied = true; }
    const result = await f.cli(stage); assert.equal(result.exitCode, 1); assert.equal(providerWrites(f).length, 0);
    assert.equal(result.result.recoveryCertified, false); assert.equal(result.result.deletionVerified, false);
    const filename = stage === 'reconcile' ? 'reconciliation.json' : `stage-error-${stage}.json`;
    const saved = fs.readFileSync(path.join(f.env.EVIDENCE_DIR, filename), 'utf8');
    assert.doesNotMatch(saved + f.output.join(''), /private-signed-fixture|synthetic-github-access|synthetic-provider-access|private provider response/);
    assert.equal(JSON.parse(saved).providerMutations, stage === 'delete' ? 'UNPROVEN' : false);
    assert.equal(fs.statSync(path.join(f.env.EVIDENCE_DIR, filename)).mode & 0o077, 0);
  });
}

for (const [label, stage, mutate] of [
  ['missing pending action acknowledgement', 'verify-pending', () => {}],
  ['changed immutable pending archive', 'verify-pending', async f => { await f.handoff(); f.fault.archive = Buffer.from('wrong archive'); }],
  ['consumed cleanup run', 'delete', f => { f.env.GITHUB_RUN_NUMBER = '3'; }],
  ['moved evidence head', 'delete', f => f.overrides.set('/pulls/999', row => ({ ...row, head: { ...row.head, sha: 'f'.repeat(40) } }))],
  ['expired provider token', 'delete', f => { f.fault.tokenExpiry = time(64); }],
]) test(`production CLI blocks ${label} without DELETE`, async t => {
  const f = production(t); await f.through(stage === 'verify-pending' ? 'stage' : 'verify-pending');
  await mutate(f); const result = await f.cli(stage);
  assert.equal(result.exitCode, 1); assert.equal(result.result.deletionVerified, false); assert.equal(providerWrites(f).length, 0);
});

test('production GET-only CLI observes an uncertain DELETE later under real main drift and expired consent', async t => {
  const f = production(t); await f.through('verify-pending'); f.fault.uncertainDelete = true;
  const uncertain = await f.cli('delete'); assert.equal(uncertain.exitCode, 1); assert.equal(providerWrites(f).length, 1);
  assert.equal(uncertain.result.state, 'DELETE_OUTCOME_UNCERTAIN_READ_ONLY_RECONCILIATION_REQUIRED');
  fs.writeFileSync(path.join(f.code, 'later'), 'later qualified main history\n'); f.git(f.code, ['add', 'later']); f.commit(f.code, 'Later protected main');
  const currentSha = f.git(f.code, ['rev-parse', 'HEAD']).trim();
  Object.assign(f.env, { RELEASE_SHA: currentSha, GITHUB_SHA: currentSha, GITHUB_RUN_ID: '23457', GITHUB_RUN_NUMBER: '3',
    CLEANUP_MODE: 'reconcile', EVIDENCE_DIR: path.join(f.root, 'late-read-only') });
  f.overrides.set('/pulls/999', row => ({ ...row, changed_files: 3, base: { ...row.base, sha: currentSha } }));
  f.setClock(start + 180 * 60000); f.setDeleted(true); f.fault.finishReadback = false;
  delete f.env.CLEANUP_APPROVAL_JSON; const boundary = f.calls.length;
  assert.equal((await f.cli('prepare')).exitCode, 0); assert.equal((await f.cli('download')).exitCode, 0);
  const result = await f.cli('reconcile'); assert.equal(result.exitCode, 0);
  assert.equal(result.result.state, 'ABSENCE_OBSERVED_READ_ONLY'); assert.equal(result.result.deletionVerified, false);
  assert.equal(f.calls.slice(boundary).some(call => call.method !== 'GET'), false);
  assert.equal(f.calls.slice(boundary).some(call => call.url.includes('/service-tokens/')), false);
  assert.equal(fs.readdirSync(f.env.EVIDENCE_DIR).some(name => /pending|delete-attempt/.test(name)), false);
});

test('standalone production process emits real Actions outputs and sanitized failure exit codes', async t => {
  const f = production(t); assert.equal((await f.cli('prepare')).exitCode, 0);
  const metadata = path.join(f.root, 'metadata.json'), shim = path.join(f.root, 'fetch-shim.mjs');
  fs.writeFileSync(metadata, JSON.stringify(Object.fromEntries(f.responses)), { mode: 0o600 });
  fs.writeFileSync(shim, "import fs from 'node:fs';Date.now=()=>Number(process.env.REVIEWED_TEST_NOW);const records=JSON.parse(fs.readFileSync(process.env.REVIEWED_TEST_METADATA));globalThis.fetch=async url=>{if(!Object.hasOwn(records,url))throw Error('unexpected fixture route');return Response.json(records[url]);};\n", { mode: 0o600 });
  const command = new URL('../ci/planetscale-native-restore-reviewed-cleanup.mjs', import.meta.url).pathname;
  const environment = { ...f.env, PATH: process.env.PATH, REVIEWED_TEST_METADATA: metadata, REVIEWED_TEST_NOW: String(f.options.now()),
    EVIDENCE_DIR: path.join(f.root, 'subprocess-state'), GITHUB_OUTPUT: path.join(f.root, 'subprocess-output') };
  const result = spawnSync(process.execPath, ['--import', shim, command, 'prepare'], { env: environment, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout); assert.match(JSON.parse(result.stdout).status, /REVIEWED_EVIDENCE/);
  assert.match(fs.readFileSync(environment.GITHUB_OUTPUT, 'utf8'), /qualification_artifact_id=51/);
  const failed = spawnSync(process.execPath, ['--import', shim, command, 'invalid-signed-private'], { env: environment, encoding: 'utf8' });
  assert.equal(failed.status, 1); assert.doesNotMatch(failed.stdout + failed.stderr, /invalid-signed-private|synthetic-provider-access/);
  assert.equal(JSON.parse(failed.stdout).blockers[0], 'reviewed_stage_context_invalid');
});

test('workflow selects the production CLI, real pinned upload action and secret-free verification stages', () => {
  const workflow = YAML.parse(fs.readFileSync(new URL('../../.github/workflows/planetscale-native-restore-cleanup.yml', import.meta.url), 'utf8'));
  const steps = workflow.jobs.cleanup.steps, command = 'node scripts/ci/planetscale-native-restore-reviewed-cleanup.mjs';
  assert.deepEqual(steps.filter(step => step.run?.startsWith(command)).map(step => step.run.slice(command.length + 1)),
    ['prepare', 'download', 'stage', 'verify-pending', 'delete', 'reconcile']);
  const upload = steps.find(step => step.id === 'pending'), stage = steps.findIndex(step => step.run === `${command} stage`);
  const verify = steps.findIndex(step => step.run === `${command} verify-pending`), deletion = steps.findIndex(step => step.run === `${command} delete`);
  assert.match(upload.uses, /^actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02$/);
  assert.equal(upload.with.overwrite, false); assert.ok(stage < steps.indexOf(upload) && steps.indexOf(upload) < verify && verify < deletion);
  for (const step of steps) if (step.env?.PLANETSCALE_RESTORE_API_TOKEN) assert.ok([`${command} delete`, `${command} reconcile`].includes(step.run));
  assert.equal(workflow.permissions.actions, 'read'); assert.equal(workflow.jobs.cleanup.environment, 'production');
});
