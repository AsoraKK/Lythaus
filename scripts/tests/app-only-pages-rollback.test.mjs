import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAppPagesSnapshot } from '../release/app-only-eligibility.mjs';
import { rollbackAppPages } from '../release/app-only-pages-rollback.mjs';

const projectId = '99999999-9999-4999-8999-999999999999';
const id = digit => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const snapshot = (sha, deploymentId) => normalizeAppPagesSnapshot({ success: true, result: {
  id: projectId, name: 'lythaus-web', production_branch: 'main', canonical_deployment: {
    id: deploymentId, project_id: projectId, project_name: 'lythaus-web', environment: 'production',
    is_skipped: false, latest_stage: { name: 'deploy', status: 'success' }, url: `https://${deploymentId.slice(0, 8)}.lythaus-web.pages.dev`,
    deployment_trigger: { metadata: { branch: 'main', commit_dirty: false, commit_hash: sha } },
  },
} }, 'main');
const before = snapshot('a'.repeat(40), id('1'));
const candidate = snapshot('b'.repeat(40), id('2'));
const third = snapshot('c'.repeat(40), id('3'));
const releaseSha = 'b'.repeat(40);

test('unchanged baseline requires no provider mutation', async () => {
  let writes = 0;
  const result = await rollbackAppPages({ before, candidate: null, releaseSha, readCurrent: async () => before, restore: async () => { writes++; } });
  assert.equal(result.status, 'BASELINE_UNCHANGED');
  assert.equal(writes, 0);
});

test('only the bound candidate can restore the exact captured prior app deployment', async () => {
  const reads = [candidate, candidate, before], writes = [];
  const result = await rollbackAppPages({ before, candidate, releaseSha,
    readCurrent: async () => reads.shift(), restore: async input => { writes.push(input); }, delay: async () => {} });
  assert.equal(result.status, 'ROLLED_BACK_PROVIDER_READBACK');
  assert.deepEqual(writes, [{ before, candidate }]);
});

test('a rollback cannot claim success until the original baseline proof is rechecked after provider readback', async () => {
  const reads = [candidate, candidate, before], verified = [];
  const result = await rollbackAppPages({ before, candidate, releaseSha,
    readCurrent: async () => reads.shift(), restore: async () => {},
    verifyBaseline: async snapshot => { verified.push(snapshot); }, delay: async () => {} });
  assert.equal(result.status, 'ROLLED_BACK_PROVIDER_READBACK');
  assert.deepEqual(verified, [before]);

  let readsAfterMutation = 0;
  await assert.rejects(() => rollbackAppPages({ before, candidate, releaseSha,
    readCurrent: async () => { return readsAfterMutation++ === 0 ? candidate : before; },
    restore: async () => {}, verifyBaseline: async () => { throw new Error('dashboard baseline proof mismatch'); }, delay: async () => {} }),
  /dashboard baseline proof mismatch/);
});

test('an unknown candidate or a concurrent unrelated deployment never initiates rollback', async () => {
  for (const [current, bound] of [[candidate, null], [third, candidate]]) {
    let writes = 0;
    await assert.rejects(() => rollbackAppPages({ before, candidate: bound, releaseSha,
      readCurrent: async () => current, restore: async () => { writes++; } }), /candidate is not bound|not the current bound deployment/);
    assert.equal(writes, 0);
  }
});

test('uncertain rollback writes are never retried', async () => {
  let writes = 0;
  await assert.rejects(() => rollbackAppPages({ before, candidate, releaseSha, readCurrent: async () => candidate,
    restore: async () => { writes++; throw new Error('possibly applied'); } }), /outcome is uncertain/);
  assert.equal(writes, 1);
});

test('readback must match the entire prior deployment and cannot accept a concurrent deployment', async () => {
  for (const after of [third, snapshot(before.commitSha, id('4'))]) {
    let calls = 0, writes = 0;
    await assert.rejects(() => rollbackAppPages({ before, candidate, releaseSha,
      readCurrent: async () => (++calls === 1 ? candidate : after), restore: async () => { writes++; }, delay: async () => {} }), /not the current bound deployment/);
    assert.equal(writes, 1);
  }
});

test('a candidate that never rolls back fails after bounded readbacks without a second write', async () => {
  let reads = 0, writes = 0, delays = 0;
  await assert.rejects(() => rollbackAppPages({ before, candidate, releaseSha,
    readCurrent: async () => { reads++; return candidate; }, restore: async () => { writes++; }, delay: async () => { delays++; } }), /provider readback is unverified/);
  assert.equal(reads, 7); assert.equal(writes, 1); assert.equal(delays, 5);
});
