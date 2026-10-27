import assert from 'node:assert/strict';
import test from 'node:test';
import { RUN12, assertRun12Payloads, verifyRun12ReviewedCleanup } from '../ci/planetscale-native-restore-run12-reconciliation.mjs';
import { syntheticRun12Metadata } from './planetscale-native-restore-run12-fixture.mjs';

test('synthetic metadata admits only the pinned failed qualification and consumed successful cleanup', async () => {
  const f = syntheticRun12Metadata();
  const proof = await verifyRun12ReviewedCleanup(f.run, f.read, { GITHUB_REPOSITORY: f.repository });
  assert.equal(f.synthetic, true); assert.equal(proof.runId, '40360605402');
  assert.equal(proof.backupId, 'tfqwht9d9bt4'); assert.equal(proof.targetId, 'p0behfjbhkp1');
  assert.equal(proof.cleanupOutcome, 'DELETED_AND_READBACK_VERIFIED'); assert.equal(proof.consumedCleanupRunNumber, 2);
  assert.equal(proof.qualificationOutcome, 'FAILED'); assert.equal(proof.recoveryAcceptance, 'NOT_CERTIFIED');
  assert.equal(f.calls.length, 9); assert.ok(f.calls.every(path => !path.includes('/zip')));
});

const job = `/actions/runs/${RUN12.cleanupRunId}/jobs?per_page=100`;
const artifacts = `/actions/runs/${RUN12.cleanupRunId}/artifacts?per_page=100`;
const comment = `/issues/comments/${RUN12.commentId}`;
for (const [name, mutate] of [
  ['qualification retry', f => { f.run.run_attempt = 2; }],
  ['qualification wrong source', f => { f.run.head_sha = 'b'.repeat(40); }],
  ['qualification unknown outcome', f => { f.run.conclusion = 'cancelled'; }],
  ['cleanup wrong run', f => { f.responses.get(`/actions/runs/${RUN12.cleanupRunId}`).run_number = 3; }],
  ['cleanup incomplete', f => { f.responses.get(`/actions/runs/${RUN12.cleanupRunId}`).status = 'in_progress'; }],
  ['cleanup wrong repository', f => { f.responses.get(`/actions/runs/${RUN12.cleanupRunId}`).repository.id = 2; }],
  ['cleanup failed', f => { f.responses.get(`/actions/runs/${RUN12.cleanupRunId}`).conclusion = 'failure'; }],
  ['malformed job inventory', f => { f.responses.set(job, null); }],
  ['missing durable upload', f => { f.responses.get(job).jobs[0].steps[0].conclusion = 'skipped'; }],
  ['missing deletion', f => { f.responses.get(job).jobs[0].steps[2].conclusion = 'skipped'; }],
  ['extra cleanup job', f => { f.responses.get(job).total_count = 2; }],
  ['extra cleanup step', f => { f.responses.get(job).jobs[0].steps.push({ name: 'extra', status: 'completed' }); }],
  ['hidden failed cleanup step', f => { f.responses.get(job).jobs[0].steps.at(-1).conclusion = 'failure'; }],
  ['missing approval', f => { f.responses.set(`/actions/runs/${RUN12.cleanupRunId}/approvals`, []); }],
  ['wrong human', f => { f.responses.get(`/actions/runs/${RUN12.runId}/approvals`)[0].user.login = 'other'; }],
  ['wrong human identity', f => { f.responses.get(`/actions/runs/${RUN12.runId}/approvals`)[0].user.id = 2; }],
  ['missing pending artifact', f => { f.responses.get(artifacts).artifacts.shift(); }],
  ['malformed artifact inventory', f => { f.responses.set(artifacts, null); }],
  ['changed archive digest', f => { f.responses.get(artifacts).artifacts[1].digest = 'sha256:' + '0'.repeat(64); }],
  ['changed artifact run', f => { f.responses.get(artifacts).artifacts[0].workflow_run.id = 99; }],
  ['expired original artifact', f => { f.responses.get(artifacts).artifacts[0].expired = true; }],
  ['moved evidence head', f => { f.responses.get(`/pulls/${RUN12.evidencePr}`).head.sha = 'b'.repeat(40); }],
  ['third evidence file', f => { f.responses.get(`/pulls/${RUN12.evidencePr}`).changed_files = 3; }],
  ['edited attestation', f => { f.responses.get(comment).updated_at = '2026-10-26T17:38:29Z'; }],
  ['copied attestation', f => { f.responses.get(comment).issue_url += '-copy'; }],
  ['wrong attestation target', f => { f.responses.get(comment).body = f.responses.get(comment).body.replace(RUN12.targetId, 'other'); }],
]) test(`synthetic reviewed history rejects ${name}`, async () => {
  const f = syntheticRun12Metadata(); mutate(f);
  await assert.rejects(() => verifyRun12ReviewedCleanup(f.run, f.read, { GITHUB_REPOSITORY: f.repository }), /prior_reviewed_cleanup_/);
});

test('unavailable GitHub evidence stops without alternate reads or provider operations', async () => {
  const f = syntheticRun12Metadata(); let reads = 0;
  await assert.rejects(() => verifyRun12ReviewedCleanup(f.run, async () => { reads++; throw new Error('synthetic-denial'); },
    { GITHUB_REPOSITORY: f.repository }), /synthetic-denial/);
  assert.equal(reads, 1);
});

test('private original payloads cannot be replaced by synthetic or missing evidence', () => {
  for (const values of [[undefined, undefined, undefined], [Buffer.from('{}'), Buffer.from('{}'), Buffer.from('{}')]]) {
    assert.throws(() => assertRun12Payloads(...values), /prior_reviewed_cleanup_payload_hash_mismatch/);
  }
});
