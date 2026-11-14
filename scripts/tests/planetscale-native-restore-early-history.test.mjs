import assert from 'node:assert/strict';
import test from 'node:test';
import { EARLY_RUNS, readRun8Observation, assertRun8Observation,
  verifyRun8History, verifyRun9History } from '../ci/planetscale-native-restore-early-history.mjs';
import { assertPinnedManualCleanupProof } from '../ci/planetscale-native-restore-check.mjs';

const repository = new URL('https://github.com/AsoraKK/Lythaus/').pathname.slice(1, -1);
const env = { GITHUB_REPOSITORY: repository };
const archivePath = pin => `/actions/runs/${pin.runId}/artifacts?per_page=100`;
const options = { strictVerifier: async () => { throw new Error('unexpected_strict_path'); },
  assertManualPayloads: assertPinnedManualCleanupProof };
const verify = (pin, f, extra = {}) => (pin === EARLY_RUNS.run8 ? verifyRun8History : verifyRun9History)(
  f.run, f.read, env, { ...options, ...extra });

function fixture(pin) {
  const steps = [
    ['Set up job', 1, 'success'],
    ['Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 2, 'success'],
    ['Require exact protected main before loading dependencies or credentials', 3, 'success'],
    ['Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 4, 'success'],
    ['Run npm ci --ignore-scripts --no-audit', 5, 'success'],
    ['Run fixed-target runner using only existing protected access', 6, 'failure'],
    ['Finalize immutable qualification evidence without provider access', 7, 'success'],
    ['Summarize retained target and review deadlines', 8, 'success'],
    ['Upload immutable qualification evidence', 9, 'success'],
    ['Post Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 17, 'skipped'],
    ['Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 18, 'success'],
    ['Complete job', 19, 'success'],
  ];
  const run = { id: Number(pin.runId), run_number: pin.runNumber, run_attempt: 1,
    workflow_id: 394786946, path: '.github/workflows/planetscale-native-restore-check.yml',
    head_sha: pin.headSha, head_branch: 'main', event: 'workflow_dispatch', status: 'completed', conclusion: 'failure',
    name: `Native restore execute ${pin.headSha}`, display_title: `Native restore execute ${pin.headSha}`,
    repository: { id: 1010752912, full_name: repository }, head_repository: { id: 1010752912, full_name: repository }, pull_requests: [] };
  const responses = new Map([
    [archivePath(pin), { total_count: 0, artifacts: [] }],
    [`/actions/runs/${pin.runId}/jobs?per_page=100`, { total_count: 1, jobs: [{
      id: pin.jobId, run_id: run.id, run_attempt: 1, head_sha: pin.headSha,
      name: 'Qualify isolated native restore without cleanup', status: 'completed', conclusion: 'failure',
      runner_id: 100, runner_name: 'synthetic-github-runner', runner_group_id: 1,
      steps: steps.map(([name, number, conclusion]) => ({ name, number, status: 'completed', conclusion })),
    }] }],
    [`/actions/runs/${pin.runId}/approvals`, [{ state: 'approved', user: { type: 'User', id: 211295889,
      login: repository.split('/')[0] }, environments: [{ name: 'production' }] }]],
  ]);
  const calls = [];
  return { run, responses, calls, read: async path => {
    calls.push(path); assert.ok(responses.has(path), `unexpected read ${path}`);
    return structuredClone(responses.get(path));
  } };
}

test('run-8 observation pins new evidence bytes and never claims the missing original payload', () => {
  const raw = readRun8Observation(), record = JSON.parse(raw);
  assert.equal(assertRun8Observation(raw).sourceRoleFailureBeforeCreateAttested, true);
  assert.equal(record.originalQualificationPayloadSha256, null);
  assert.equal(record.originalQualificationPayloadBytesVerified, false);
  assert.equal(record.originalQualificationArchiveBytesVerified, false);
  assert.equal(record.sourceControlFlow.runnerSha256,
    '94ffc283894246063ef694a6a1a887ba77983bff142e25354ed1056b82bcfc10');
  for (const changed of [undefined, Buffer.from('{}'), Buffer.concat([raw, Buffer.from(' ')]),
    Buffer.from(raw.toString().replace('NOT_NEEDED', 'DELETED'))]) {
    assert.throws(() => assertRun8Observation(changed), /early_history_log_observation_mismatch/);
  }
});

test('both absent-archive profiles are explicitly non-certifying and retain distinct evidence limits', async () => {
  const precreate = await verify(EARLY_RUNS.run8, fixture(EARLY_RUNS.run8));
  const manual = await verify(EARLY_RUNS.run9, fixture(EARLY_RUNS.run9));
  for (const proof of [precreate, manual]) {
    assert.equal(proof.recoveryAcceptance, 'NOT_CERTIFIED'); assert.equal(proof.recoveryCertified, false);
    assert.equal(proof.originalQualificationArchiveBytesVerified, false);
    assert.equal(proof.artifactCount, 0); assert.ok(proof.evidenceLimitations.length > 0);
  }
  assert.equal(precreate.originalQualificationPayloadBytesVerified, false);
  assert.equal(precreate.artifactProviderMutationCount, null);
  assert.equal(precreate.artifactCredentialActionCount, null);
  assert.equal(precreate.originalQualificationPayloadSha256, null);
  assert.equal(manual.qualificationPayloadBytesVerified, true);
  assert.equal(manual.manualReceiptPayloadBytesVerified, true);
  assert.equal(manual.currentTargetAbsenceVerified, false);
  assert.equal(manual.targetId, 'gnbnmpsu7r5k');
  assert.equal(manual.cleanupMode, 'MANUAL'); assert.equal(manual.cleanupOutcome, 'TARGET_ABSENT_VERIFIED');
});

test('any available archive delegates to strict verification and never falls back on its failure', async () => {
  for (const pin of Object.values(EARLY_RUNS)) {
    const f = fixture(pin); f.responses.set(archivePath(pin), { total_count: 1, artifacts: [{ id: 999, expired: true }] });
    const strictProof = { runId: pin.runId, status: pin.strictStatus, originalStrictResult: true };
    let strictCalls = 0;
    assert.equal(await verify(pin, f, { strictVerifier: async (run, read, environment) => {
      strictCalls++; assert.equal(run, f.run); assert.equal(read, f.read); assert.equal(environment, env); return strictProof;
    } }), strictProof);
    assert.equal(strictCalls, 1);
    await assert.rejects(() => verify(pin, f, { strictVerifier: async () => { throw new Error('strict_archive_mismatch'); } }),
      /strict_archive_mismatch/);
    await assert.rejects(() => verify(pin, f, { strictVerifier: async () => ({ runId: '99', status: pin.strictStatus }) }),
      /early_history_strict_result_mismatch/);
    assert.ok(f.calls.every(path => path === archivePath(pin)));
  }
});

test('incomplete or changing archive inventories cannot authorize a historical profile', async () => {
  for (const pin of Object.values(EARLY_RUNS)) {
    for (const value of [undefined, {}, { total_count: -1, artifacts: [] }, { total_count: 101, artifacts: [] },
      { total_count: 1, artifacts: [] }, { total_count: 0, artifacts: undefined }]) {
      const f = fixture(pin); f.responses.set(archivePath(pin), value);
      await assert.rejects(() => verify(pin, f), /early_history_archive_inventory_invalid/);
    }
    const f = fixture(pin); let count = 0;
    const originalRead = f.read;
    f.read = async path => path === archivePath(pin) && ++count === 2
      ? { total_count: 1, artifacts: [{ id: pin.artifactId }] } : originalRead(path);
    await assert.rejects(() => verify(pin, f), /early_history_archive_availability_changed/);
  }
});

test('absent archives still require exact run, job, ordered steps and named human approval', async () => {
  for (const pin of Object.values(EARLY_RUNS)) {
    for (const change of [{ id: 99 }, { run_attempt: 2 }, { workflow_id: 1 }, { head_sha: 'a'.repeat(40) },
      { event: 'push' }, { conclusion: 'success' }, { head_branch: 'other' }, { pull_requests: [{}] }]) {
      const f = fixture(pin); Object.assign(f.run, change);
      await assert.rejects(() => verify(pin, f), /early_history_run_provenance_mismatch/);
      assert.deepEqual(f.calls, []);
    }
    const jobPath = `/actions/runs/${pin.runId}/jobs?per_page=100`, approvalPath = `/actions/runs/${pin.runId}/approvals`;
    for (const mutate of [
      f => { f.responses.get(jobPath).total_count = 2; },
      f => { f.responses.get(jobPath).jobs[0].id++; },
      f => { f.responses.get(jobPath).jobs[0].runner_id = 0; },
      f => { f.responses.get(jobPath).jobs[0].steps.reverse(); },
      f => { f.responses.get(jobPath).jobs[0].steps[5].conclusion = 'success'; },
      f => { f.responses.set(approvalPath, []); },
      f => { f.responses.get(approvalPath)[0].user.id++; },
      f => { f.responses.get(approvalPath)[0].user.type = 'Bot'; },
      f => { f.responses.get(approvalPath)[0].user.login = 'other'; },
      f => { f.responses.get(approvalPath)[0].environments = [{ name: 'staging' }]; },
    ]) {
      const f = fixture(pin); mutate(f);
      await assert.rejects(() => verify(pin, f), /early_history_(job_mismatch|human_approval_mismatch)/);
    }
  }
});

test('missing observations or manual payload verifiers cannot be replaced with a success claim', async () => {
  await assert.rejects(() => verify(EARLY_RUNS.run8, fixture(EARLY_RUNS.run8), { observationBytes: Buffer.from('{}') }),
    /early_history_log_observation_mismatch/);
  await assert.rejects(() => verify(EARLY_RUNS.run9, fixture(EARLY_RUNS.run9), { assertManualPayloads: undefined }),
    /early_history_manual_verifier_required/);
  await assert.rejects(() => verify(EARLY_RUNS.run9, fixture(EARLY_RUNS.run9),
    { assertManualPayloads: () => ({ manualOperator: repository.split('/')[0], recoveryAcceptance: 'CERTIFIED' }) }),
  /early_history_manual_proof_mismatch/);
  await assert.rejects(() => verify(EARLY_RUNS.run8, fixture(EARLY_RUNS.run8), { strictVerifier: undefined }),
    /early_history_strict_verifier_required/);
});
