import assert from 'node:assert/strict';
import test from 'node:test';
import { RUN12, verifyRun12ReviewedCleanup } from '../ci/planetscale-native-restore-run12-reconciliation.mjs';
import { assertRun12HistoricalEvidence, readRun12HistoricalEvidence,
  verifyRun12CleanupHistory } from '../ci/planetscale-native-restore-run12-history.mjs';
import { syntheticRun12Metadata } from './planetscale-native-restore-run12-fixture.mjs';

const env = { GITHUB_REPOSITORY: 'AsoraKK/Lythaus' };
const archivePath = id => `/actions/runs/${id}/artifacts?per_page=100`;
function fixture(absent = true) {
  const f = syntheticRun12Metadata(env.GITHUB_REPOSITORY);
  if (absent) for (const id of [RUN12.runId, RUN12.cleanupRunId]) {
    f.responses.set(archivePath(id), { total_count: 0, artifacts: [] });
  }
  return f;
}

test('run-12 historical evidence verifies actual pinned Git payload bytes without asserting ZIP membership', () => {
  const evidence = readRun12HistoricalEvidence();
  const proof = assertRun12HistoricalEvidence(evidence);
  assert.equal(proof.qualificationPayloadBytesVerified, true);
  assert.equal(proof.originalReviewRecordBytesVerified, true);
  assert.equal(proof.qualificationSha256, RUN12.qualificationSha256);
  assert.equal(proof.originalReviewRecordSha256, RUN12.recordSha256);
  assert.equal(proof.evidenceCommit, RUN12.evidenceHead);
  for (const field of ['qualificationBytes', 'recordBytes']) {
    assert.throws(() => assertRun12HistoricalEvidence({ ...evidence, [field]: undefined }),
      /prior_run12_historical_bytes_mismatch/);
    assert.throws(() => assertRun12HistoricalEvidence({ ...evidence,
      [field]: Buffer.concat([evidence[field], Buffer.from(' ')]) }), /prior_run12_historical_bytes_mismatch/);
  }
});

test('available run-12 artifacts retain the exact unchanged strict verifier result', async () => {
  const direct = fixture(false), wrapped = fixture(false);
  const expected = await verifyRun12ReviewedCleanup(direct.run, direct.read, env);
  const actual = await verifyRun12CleanupHistory(wrapped.run, wrapped.read, env, { evidence: {} });
  assert.deepEqual(actual, expected);
  assert.equal(actual.status, 'PINNED_REVIEWED_CLEANUP_RECONCILED');
});

test('only empty complete archive inventories permit non-certifying historical closure', async () => {
  const f = fixture();
  const proof = await verifyRun12CleanupHistory(f.run, f.read, env);
  assert.equal(proof.status, 'PINNED_RUN12_LOG_CLEANUP_RECONCILED');
  assert.equal(proof.qualificationOutcome, 'FAILED');
  assert.equal(proof.recoveryAcceptance, 'NOT_CERTIFIED');
  assert.equal(proof.recoveryCertified, false);
  assert.equal(proof.historicalDeletionLogAttested, true);
  assert.equal(proof.currentTargetAbsenceVerified, false);
  for (const field of ['qualificationArchiveBytesVerified', 'pendingPayloadBytesVerified',
    'cleanupReceiptPayloadBytesVerified', 'cleanupArtifactBytesVerified']) assert.equal(proof[field], false);
  assert.equal(proof.pendingPayloadSha256Text, RUN12.pendingSha256);
  assert.equal(proof.cleanupReceiptPayloadSha256Text, RUN12.receiptSha256);
  assert.ok(f.calls.every(path => /^\/(actions\/runs\/|pulls\/1119$|issues\/comments\/6423086516$)/.test(path)));
});

test('partially available, expired or changed archives fail strict checks without a log fallback', async () => {
  for (const mutate of [
    f => { f.responses.set(archivePath(RUN12.cleanupRunId), { total_count: 0, artifacts: [] }); },
    f => { f.responses.get(archivePath(RUN12.runId)).artifacts[0].expired = true; },
    f => { f.responses.get(archivePath(RUN12.runId)).artifacts[0].digest = 'sha256:' + 'a'.repeat(64); },
  ]) {
    const f = fixture(false); mutate(f);
    await assert.rejects(() => verifyRun12CleanupHistory(f.run, f.read, env),
      /prior_reviewed_cleanup_artifact_mismatch/);
  }
});

test('invalid or changing archive inventories are not treated as missing evidence', async () => {
  for (const value of [undefined, {}, { total_count: -1, artifacts: [] },
    { total_count: 1, artifacts: [] }, { total_count: 0, artifacts: undefined }]) {
    const f = fixture(); f.responses.set(archivePath(RUN12.runId), value);
    await assert.rejects(() => verifyRun12CleanupHistory(f.run, f.read, env), /prior_run12_archive_inventory_invalid/);
  }
  const f = fixture(); let calls = 0;
  const read = async path => {
    if (path === archivePath(RUN12.runId) && ++calls > 1) return { total_count: 1, artifacts: [{ id: 1 }] };
    return f.read(path);
  };
  await assert.rejects(() => verifyRun12CleanupHistory(f.run, read, env), /prior_run12_archive_availability_changed/);
});

test('historical closure still requires original run, job, human approval, PR and exact owner review', async () => {
  const changes = [
    [`/actions/runs/${RUN12.cleanupRunId}`, value => { value.head_sha = 'b'.repeat(40); }],
    [`/actions/runs/${RUN12.cleanupRunId}/jobs?per_page=100`, value => { value.jobs[0].id++; }],
    [`/actions/runs/${RUN12.cleanupRunId}/jobs?per_page=100`, value => { value.jobs[0].steps[0].conclusion = 'failure'; }],
    [`/actions/runs/${RUN12.cleanupRunId}/approvals`, value => { value[0].user.type = 'Bot'; }],
    [`/actions/runs/${RUN12.cleanupRunId}/approvals`, value => { value[0].user.id++; }],
    [`/pulls/${RUN12.evidencePr}`, value => { value.head.sha = 'c'.repeat(40); }],
    [`/issues/comments/${RUN12.commentId}`, value => { value.body += ' '; }],
    [`/issues/comments/${RUN12.commentId}`, value => { value.updated_at = '2026-11-13T00:00:00Z'; }],
  ];
  for (const [path, mutate] of changes) {
    const f = fixture(); mutate(f.responses.get(path));
    await assert.rejects(() => verifyRun12CleanupHistory(f.run, f.read, env), undefined, path);
  }
  for (const patch of [{ id: 99 }, { run_attempt: 2 }, { conclusion: 'success' }, { head_sha: 'd'.repeat(40) }]) {
    const f = fixture();
    await assert.rejects(() => verifyRun12CleanupHistory({ ...f.run, ...patch }, f.read, env),
      /prior_reviewed_cleanup_run_provenance_mismatch/);
    assert.deepEqual(f.calls, []);
  }
});

test('missing pinned payloads cannot use the historical profile even with successful cleanup metadata', async () => {
  const f = fixture();
  await assert.rejects(() => verifyRun12CleanupHistory(f.run, f.read, env, { evidence: {} }),
    /prior_run12_historical_bytes_mismatch/);
});
