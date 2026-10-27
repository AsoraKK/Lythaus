import assert from 'node:assert/strict';
import test from 'node:test';
import { RESTORE, RestoreFailure } from '../ci/planetscale-native-restore-contract.mjs';
import { reconcileReviewedTarget, deleteReviewedTarget } from '../ci/planetscale-native-restore-cleanup.mjs';
import { proveUnmergedCleanupContext } from '../ci/planetscale-native-restore-unmerged-cleanup-prototype.mjs';
import { fixture, start, codeSha, evidenceSha, time } from './planetscale-native-restore-unmerged-cleanup-fixture.mjs';

function lateFixture(drift = false) {
  const f = fixture('FAILED'), originalRead = f.options.read;
  const currentSha = drift ? 'c'.repeat(40) : codeSha;
  f.env.RELEASE_SHA = currentSha; f.env.GITHUB_RUN_ID = '34567'; f.env.GITHUB_RUN_NUMBER = '3';
  f.setClock(start + 180 * 60000);
  delete f.env.CLEANUP_APPROVAL_JSON; delete f.env.PENDING_ARTIFACT_ID; delete f.env.PENDING_ARTIFACT_DIGEST;
  delete f.options.pendingBytes; delete f.options.downloadedPending;
  f.options.assertMain = async () => { f.calls.push('MAIN'); assert.equal(f.env.RELEASE_SHA, currentSha); };
  f.overrides.set('/actions/runs/34567', row => ({ ...row, head_sha: currentSha, run_number: 3 }));
  if (drift) f.overrides.set('/pulls/999', row => ({ ...row, base: { ...row.base, sha: currentSha }, changed_files: 4 }));
  f.options.read = async suffix => {
    if (suffix === `/compare/${codeSha}...${currentSha}`) {
      f.calls.push(`GITHUB ${suffix}`); return { merge_base_commit: { sha: codeSha } };
    }
    assert.notEqual(suffix, `/compare/${evidenceSha}...${currentSha}`, 'unmerged evidence ancestry is not a read-only prerequisite');
    return originalRead(suffix);
  };
  f.options.proveContext = proveUnmergedCleanupContext;
  f.options.api.authority = async () => { throw Error('late observation must not renew deletion authority'); };
  return f;
}

for (const drift of [false, true]) for (const absent of [false, true]) {
  test(`late unmerged observation with main drift=${drift}, absent=${absent} does not renew deletion authority`, async () => {
    const f = lateFixture(drift), immutable = Buffer.from(f.evidence.bytes);
    f.setDeleted(absent);
    const result = await reconcileReviewedTarget(f.options);
    assert.equal(result.state, absent ? 'ABSENCE_OBSERVED_READ_ONLY' : 'TARGET_PRESENT_READ_ONLY');
    assert.equal(result.providerMutations, false); assert.equal(result.deletionVerified, false); assert.equal(result.recoveryCertified, false);
    assert.deepEqual(f.evidence.bytes, immutable); assert.equal(f.report.approvalExpiresAt, time(120));
    assert.equal(f.report.cleanupDeadlineAt, time(120)); assert.equal(f.report.cleanupPermit.runNumber, 2);
    assert.equal(f.calls.some(call => /^(DELETE|POST|PATCH|AUTHORITY)/.test(call)), false);
    assert.equal(f.calls.some(call => call.includes('/actions/artifacts/52')), false);
    const retry = await deleteReviewedTarget(f.options);
    assert.equal(retry.state, 'BLOCKED_WITHOUT_DELETE');
    assert.equal(f.calls.some(call => call.startsWith('DELETE ')), false);
  });
}

for (const [name, change] of [
  ['wrong original run', f => f.overrides.set('/actions/runs/12345', row => ({ ...row, id: 9 }))],
  ['wrong original artifact', f => f.overrides.set('/actions/artifacts/51', row => ({ ...row, digest: 'sha256:' + 'f'.repeat(64) }))],
  ['changed downloaded qualification', f => { f.options.downloadedQualification = Buffer.from('{}'); }],
  ['moved evidence head', f => f.overrides.set('/pulls/999', row => ({ ...row, head: { ...row.head, sha: 'f'.repeat(40) } }))],
  ['edited human comment', f => f.overrides.set('/issues/comments/88', row => ({ ...row, updated_at: time(180) }))],
  ['foreign repository', f => f.overrides.set('/pulls/999', row => ({ ...row, head: { ...row.head, repo: { id: 9 } } }))],
  ['main lacks qualification lineage', f => {
    const read = f.options.read;
    f.options.read = suffix => suffix === `/compare/${codeSha}...${f.env.RELEASE_SHA}`
      ? { merge_base_commit: { sha: 'f'.repeat(40) } } : read(suffix);
  }],
  ['current protected main cannot be verified', f => { f.options.assertMain = async () => { throw new RestoreFailure('current_protected_main_changed'); }; }],
  ['same-name replacement', f => {
    const request = f.options.api.request;
    f.options.api.request = async (path, options) => {
      const row = await request(path, options); return path === `/branches/${RESTORE.target}` ? { ...row, id: 'replacement123' } : row;
    };
  }],
  ['GET access denied', f => { f.options.api.request = async () => { throw new RestoreFailure('provider_access_denied', 'DENIED'); }; }],
  ['malformed GET response', f => { f.options.api.request = async () => ({}); }],
  ['incomplete absence inventory', f => {
    f.setDeleted(true); f.options.api.list = async () => { throw new RestoreFailure('provider_pagination_incomplete'); };
  }],
]) test(`late unmerged observation blocks ${name} without mutation or absence certification`, async () => {
  const f = lateFixture(true); change(f);
  const result = await reconcileReviewedTarget(f.options);
  assert.equal(result.state, 'TARGET_PRESENT_OR_BINDING_UNCERTAIN');
  assert.equal(result.providerMutations, false); assert.equal(result.deletionVerified, false); assert.equal(result.recoveryCertified, false);
  assert.equal(f.calls.some(call => /^(DELETE|POST|PATCH|AUTHORITY)/.test(call)), false);
});
