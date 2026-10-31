import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createAppOnlyAcceptanceContext, assertAppOnlyKeeperRun, assertAppOnlyWorkerSourcesAncestral } from '../release/app-only-acceptance.mjs';
import { REUSED_WORKER_NAMES } from '../release/app-only-eligibility.mjs';

const releaseSha = 'a'.repeat(40);
const sourceSha = 'b'.repeat(40);
const now = Date.parse('2026-10-29T12:02:00.000Z');
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
function input() {
  return { releaseSha, now, capture: { schemaVersion: 1, startedAt: '2026-10-29T12:00:00.000Z', capturedAt: '2026-10-29T12:01:00.000Z',
    workers: Object.fromEntries(Object.entries(REUSED_WORKER_NAMES).map(([component, workerName], index) => [component,
      { workerName, versionId: ids[index], sourceSha, createdAt: '2026-10-28T12:00:00.000Z', percentage: 100 }])) },
  routeSnapshots: { adminApi: { route: { id: 'admin-route', pattern: 'admin.lythaus.co/api/admin/*', script: REUSED_WORKER_NAMES.admin } },
    coordinator: { route: { id: 'keeper-route', pattern: 'admin.lythaus.co/api/admin/production-auth-acceptance/*', script: REUSED_WORKER_NAMES.coordinator } } } };
}
function runFor(context) {
  return { acceptanceRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', releaseSha, status: 'completed',
    candidate: structuredClone(context.candidate), candidateDependencies: structuredClone(context.dependencies),
    rollbackSnapshot: structuredClone(context.rollbackSnapshot), expiresAt: '2026-10-29T13:00:00.000Z' };
}

test('all four live versions and both routes bind to an existing Keeper contract', () => {
  const context = createAppOnlyAcceptanceContext(input());
  assert.deepEqual(Object.keys(context.dependencies).sort(), Object.keys(REUSED_WORKER_NAMES).sort());
  for (const component of Object.keys(REUSED_WORKER_NAMES)) {
    assert.equal(context.dependencies[component].status, 'REUSED_PRODUCTION');
    assert.equal(context.dependencies[component].provenance, 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION');
    assert.deepEqual(context.rollbackSnapshot.workers[component].versions, [{ versionId: context.dependencies[component].versionId, percentage: 100 }]);
  }
  assert.equal(assertAppOnlyKeeperRun({ run: runFor(context), context, now, requireCompleted: true }).status, 'completed');
});

test('missing, stale, split, future or misrouted provider observations fail closed', () => {
  for (const mutate of [
    v => { delete v.capture.workers.jobs; },
    v => { v.capture.workers.public.percentage = 99; },
    v => { v.capture.workers.coordinator.createdAt = '2026-10-29T12:00:01.000Z'; },
    v => { v.capture.capturedAt = '2026-10-29T11:00:00.000Z'; },
    v => { v.capture.capturedAt = '2026-10-29T12:03:00.000Z'; },
    v => { v.routeSnapshots.adminApi.route.script = REUSED_WORKER_NAMES.public; },
    v => { v.routeSnapshots.coordinator.route = null; },
    v => { v.routeSnapshots.other = {}; },
  ]) {
    const v = input(); mutate(v);
    assert.throws(() => createAppOnlyAcceptanceContext(v));
  }
});

test('a resumed run rejects changed source, version, route, release, expiry and pending acceptance', () => {
  const context = createAppOnlyAcceptanceContext(input());
  for (const mutate of [
    r => { r.releaseSha = 'c'.repeat(40); },
    r => { r.candidate.workerVersionId = ids[1]; },
    r => { r.candidate.sourceReleaseSha = 'c'.repeat(40); },
    r => { r.candidate.uploadedAt = '2026-10-28T12:01:00.000Z'; },
    r => { r.candidate.stagedAt = '2026-10-29T12:03:00.000Z'; },
    r => { r.candidateDependencies.admin.versionId = ids[0]; },
    r => { r.rollbackSnapshot.routes.coordinator.script = REUSED_WORKER_NAMES.admin; },
    r => { r.rollbackSnapshot.workers.jobs.versions[0].percentage = 99; },
    r => { r.expiresAt = '2026-10-29T12:01:00.000Z'; },
    r => { r.status = 'pending'; },
  ]) {
    const run = runFor(context); mutate(run);
    assert.throws(() => assertAppOnlyKeeperRun({ run, context, now, requireCompleted: true }));
  }
  const pending = runFor(context); pending.status = 'in_progress';
  assert.equal(assertAppOnlyKeeperRun({ run: pending, context, now }).status, 'in_progress');
});

test('Worker sources must be available ancestors, not guessed tags or tree objects', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dependencies = Object.fromEntries(Object.keys(REUSED_WORKER_NAMES).map(key => [key, { sourceSha: head }]));
  assert.doesNotThrow(() => assertAppOnlyWorkerSourcesAncestral('.', head, dependencies));
  dependencies.public.sourceSha = 'f'.repeat(40);
  assert.throws(() => assertAppOnlyWorkerSourcesAncestral('.', head, dependencies), /not an available ancestor/);
  assert.throws(() => assertAppOnlyWorkerSourcesAncestral('.', 'main', dependencies), /inventory invalid/);
});
