import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePriorCanonicalRun } from '../ci/resolve-prior-canonical-run.mjs';

const sha = 'a'.repeat(40);
const run = (id, created_at) => ({ id, created_at, name: 'Canonical production release', path: '.github/workflows/production-release.yml',
  head_sha: sha, head_branch: 'main', event: 'workflow_dispatch', status: 'completed', conclusion: 'success',
  repository: { id: 1010752912 }, head_repository: { id: 1010752912 } });
const page = () => [{ total_count: 2, workflow_runs: [run(12, '2026-10-28T12:00:00Z'), run(13, '2026-10-29T12:00:00Z')] }];

test('the latest exact successful canonical run is selected deterministically', () => {
  assert.equal(resolvePriorCanonicalRun(sha, page()), '13');
});
test('incomplete, ambiguous, foreign or unsuccessful listings fail closed', () => {
  for (const mutate of [
    p => { p[0].total_count = 3; }, p => { p[0].workflow_runs[0].id = 13; },
    p => { p[0].workflow_runs[0].head_sha = 'b'.repeat(40); }, p => { p[0].workflow_runs[0].repository.id = 1; },
    p => { p[0].workflow_runs[0].conclusion = 'failure'; }, p => { p[0].workflow_runs[0].event = 'push'; },
  ]) { const p = page(); mutate(p); assert.throws(() => resolvePriorCanonicalRun(sha, p)); }
});
