import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAdminCandidateStagedAtZero,
  assertRollbackSafeAfterPartialActivation,
  assertRollbackStateMatchesBaseline,
  createOwnerTestingActivationHandoff,
  validateOwnerTestingActivationHandoff,
  waitForAdminCandidateStagedAtZero,
} from '../release/owner-testing-activation-handoff.mjs';
import { ACCEPTANCE_ROLLBACK_SNAPSHOT_SCHEMA } from '../release/acceptance-rollback-snapshot.mjs';

const releaseSha = 'a'.repeat(40);
const runId = '987654321012';
const nowMs = Date.parse('2026-11-09T12:00:00.000Z');
const expiry = new Date(nowMs + 90 * 60_000).toISOString();
const candidateId = (digit) => `${digit}`.repeat(8) + '-1111-4111-8111-' + `${digit}`.repeat(12);
const dependencies = (diagnosticExpiresAt = expiry) => ({
  public: { workerName: 'lythaus-public-api-development', versionId: candidateId(1), sourceSha: 'b'.repeat(40), status: 'REUSED_PRODUCTION', provenance: 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION' },
  admin: { workerName: 'lythaus-admin-api-development', versionId: candidateId(2), sourceSha: releaseSha, status: 'NEW_CANDIDATE', provenance: 'BUILT_FROM_RELEASE_SHA' },
  jobs: { workerName: 'lythaus-jobs-development', versionId: candidateId(3), sourceSha: 'c'.repeat(40), status: 'REUSED_PRODUCTION', provenance: 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION' },
  coordinator: { workerName: 'lythaus-auth-acceptance-coordinator-development', versionId: candidateId(4), sourceSha: releaseSha, status: 'NEW_CANDIDATE', provenance: 'BUILT_FROM_RELEASE_SHA' },
  subjectDiagnosticExpiresAt: diagnosticExpiresAt,
});
const snapshot = () => ({
  schemaVersion: ACCEPTANCE_ROLLBACK_SNAPSHOT_SCHEMA,
  workers: {
    public: { versions: [{ versionId: candidateId(5), percentage: 100 }] },
    admin: { versions: [{ versionId: candidateId(6), percentage: 100 }] },
    jobs: { versions: [{ versionId: candidateId(7), percentage: 100 }] },
    coordinator: { versions: [{ versionId: candidateId(8), percentage: 100 }] },
  },
  routes: {
    adminApi: { id: 'admin-route', pattern: 'admin.lythaus.co/api/admin/*', script: 'lythaus-admin-api-development' },
    coordinator: { id: 'coordinator-route', pattern: 'admin.lythaus.co/api/admin/production-auth-acceptance/*', script: 'lythaus-auth-acceptance-coordinator-development' },
  },
});
const workerVersions = () => Object.fromEntries(['public', 'admin', 'jobs', 'coordinator'].map((component) => [component, {
  versionId: dependencies()[component].versionId,
  sourceSha: dependencies()[component].sourceSha,
  status: dependencies()[component].status,
  provenance: dependencies()[component].provenance,
}]));
const handoff = (overrides = {}) => createOwnerTestingActivationHandoff({
  runId,
  runAttempt: 1,
  releaseSha,
  releaseClass: 'AUTH_CRITICAL_RELEASE',
  ownerTesting: true,
  recoveryException: true,
  subjectDiagnostic: true,
  changedComponents: ['admin', 'coordinator'],
  workerVersions: workerVersions(),
  acceptanceStatus: 'PASSED',
  acceptanceRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  acceptanceExpiresAt: new Date(nowMs + 4 * 60 * 60_000).toISOString(),
  candidateDependencies: dependencies(),
  diagnosticNotBefore: (nowMs - 10 * 60_000) / 1000,
  diagnosticExpiresAt: expiry,
  rollbackSnapshot: snapshot(),
  infrastructure: { hyperdriveVerifiedMain: true, databaseIdentityVerified: true, budgetEnforcementVerified: true, planetscaleGrantsVerified: true },
  releaseStateHistory: [{ state: 'PRODUCT_ACCEPTANCE_PASSED', at: '2026-11-09T11:59:00.000Z' }],
  ...overrides,
});

test('activation handoff binds first attempt, exact run, release SHA and candidates', () => {
  const value = handoff();
  const validated = validateOwnerTestingActivationHandoff(value, {
    expectedRunId: runId,
    expectedRunAttempt: 1,
    expectedReleaseSha: releaseSha,
    nowMs,
  });
  assert.equal(validated.runId, runId);
  assert.equal(validated.workerVersions.admin.versionId, candidateId(2));
  assert.throws(() => validateOwnerTestingActivationHandoff(value, {
    expectedRunId: runId,
    expectedRunAttempt: 2,
    expectedReleaseSha: releaseSha,
    nowMs,
  }), /run_binding_mismatch/);
  assert.throws(() => validateOwnerTestingActivationHandoff(value, {
    expectedRunId: `${runId}1`,
    expectedRunAttempt: 1,
    expectedReleaseSha: releaseSha,
    nowMs,
  }), /run_binding_mismatch/);
  assert.throws(() => validateOwnerTestingActivationHandoff(value, {
    expectedRunId: runId,
    expectedRunAttempt: 1,
    expectedReleaseSha: 'f'.repeat(40),
    nowMs,
  }), /release_binding_mismatch/);
});

test('passed Keeper evidence remains historical after its polling window closes while diagnostic activation window is live', () => {
  const value = handoff({ acceptanceExpiresAt: '2026-11-09T11:00:00.000Z' });
  assert.equal(validateOwnerTestingActivationHandoff(value, {
    expectedRunId: runId,
    expectedRunAttempt: 1,
    expectedReleaseSha: releaseSha,
    nowMs,
  }).acceptance.status, 'PASSED');
});

test('activation handoff fails closed when expired, short on 40-minute runway, or outside three-hour window', () => {
  const value = handoff();
  assert.throws(() => validateOwnerTestingActivationHandoff(value, {
    expectedRunId: runId, expectedRunAttempt: 1, expectedReleaseSha: releaseSha,
    nowMs: Date.parse(expiry) - 39 * 60_000,
  }), /runway_insufficient/);
  assert.throws(() => validateOwnerTestingActivationHandoff(value, {
    expectedRunId: runId, expectedRunAttempt: 1, expectedReleaseSha: releaseSha,
    nowMs: Date.parse(expiry),
  }), /runway_insufficient/);
  assert.throws(() => handoff({
    diagnosticNotBefore: nowMs / 1000,
    diagnosticExpiresAt: new Date(nowMs + 3 * 60 * 60_000 + 1000).toISOString(),
    candidateDependencies: dependencies(new Date(nowMs + 3 * 60 * 60_000 + 1000).toISOString()),
  }), /window_invalid/);
});

test('Admin candidate remains at zero traffic during staging and Keeper wait', () => {
  assert.equal(assertAdminCandidateStagedAtZero({ versions: [
    { version_id: candidateId(2), percentage: 0 },
    { version_id: candidateId(6), percentage: 100 },
  ] }, candidateId(2)), true);
  assert.throws(() => assertAdminCandidateStagedAtZero({ versions: [
    { version_id: candidateId(2), percentage: 1 },
    { version_id: candidateId(6), percentage: 99 },
  ] }, candidateId(2)), /received_traffic/);
});

test('zero-traffic verifier waits for exact candidate visibility with a bounded retry', async () => {
  let now = 0;
  let reads = 0;
  const result = await waitForAdminCandidateStagedAtZero({
    candidateVersionId: candidateId(2),
    now: () => now,
    sleep: async milliseconds => { now += milliseconds; },
    pollIntervalMs: 10,
    timeoutMs: 25,
    readDeployment: async () => {
      reads += 1;
      return reads < 3 ? { versions: [] } : { versions: [{ version_id: candidateId(2), percentage: 0 }] };
    },
  });
  assert.deepEqual(result, { status: 'ZERO_TRAFFIC', attempts: 3 });
  assert.equal(now, 20);
});

test('zero-traffic verifier fails immediately on traffic and times out if candidate remains absent', async () => {
  let now = 0;
  let reads = 0;
  await assert.rejects(waitForAdminCandidateStagedAtZero({
    candidateVersionId: candidateId(2),
    readDeployment: async () => ({ versions: [{ version_id: candidateId(2), percentage: 1 }] }),
  }), /received_traffic/);
  await assert.rejects(waitForAdminCandidateStagedAtZero({
    candidateVersionId: candidateId(2),
    now: () => now,
    sleep: async milliseconds => { now += milliseconds; },
    pollIntervalMs: 10,
    timeoutMs: 25,
    readDeployment: async () => { reads += 1; return { versions: [] }; },
  }), /missing_after_timeout/);
  assert.equal(reads, 4);
});

test('live state drift during the human Keeper wait blocks before activation without rollback', () => {
  const before = snapshot();
  const changed = snapshot();
  changed.workers.admin.versions = [{ versionId: candidateId(9), percentage: 100 }];
  assert.throws(() => assertRollbackStateMatchesBaseline(before, changed), /drift_before_activation/);
  assert.equal(assertRollbackStateMatchesBaseline(before, snapshot()), true);
});

test('live state drift while activation approval is pending blocks before activation without rollback', () => {
  const before = snapshot();
  const changed = snapshot();
  changed.routes.coordinator.script = 'unexpected-coordinator';
  assert.throws(() => assertRollbackStateMatchesBaseline(before, changed), /drift_before_activation/);
});

test('partial activation rollback allows only the exact candidate or original baseline state', () => {
  const before = snapshot();
  const live = snapshot();
  live.workers.admin.versions = [{ versionId: candidateId(2), percentage: 100 }];
  assert.equal(assertRollbackSafeAfterPartialActivation(before, live, {
    attemptedComponents: ['admin'],
    candidateVersions: { admin: candidateId(2) },
  }), true);

  const externalDrift = structuredClone(live);
  externalDrift.workers.coordinator.versions = [{ versionId: candidateId(9), percentage: 100 }];
  assert.throws(() => assertRollbackSafeAfterPartialActivation(before, externalDrift, {
    attemptedComponents: ['admin', 'coordinator'],
    candidateVersions: { admin: candidateId(2), coordinator: candidateId(4) },
  }), /external_drift_coordinator/);
});

test('partial activation rollback blocks on external route drift before restoring anything', () => {
  const before = snapshot();
  const live = snapshot();
  live.workers.admin.versions = [{ versionId: candidateId(2), percentage: 100 }];
  live.routes.adminApi.script = 'unrelated-worker';
  assert.throws(() => assertRollbackSafeAfterPartialActivation(before, live, {
    attemptedComponents: ['admin'],
    candidateVersions: { admin: candidateId(2) },
    attemptedRoutes: ['adminApi'],
    candidateRouteTargets: { adminApi: { pattern: 'admin.lythaus.co/api/admin/*', script: 'lythaus-admin-api-development' } },
  }), /external_route_drift_adminApi/);
});
