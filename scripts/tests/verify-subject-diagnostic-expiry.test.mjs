import assert from 'node:assert/strict';
import test from 'node:test';
import { SUBJECT_DIAGNOSTIC_MIN_ACTIVATION_REMAINING_SECONDS, verifySubjectDiagnosticExpiry } from '../ci/verify-subject-diagnostic-expiry.mjs';

const releaseSha = 'a'.repeat(40);
const expiry = '2026-11-08T13:00:00Z';
const dependencies = JSON.stringify({
  public: { workerName: 'lythaus-public-api-development' },
  admin: { workerName: 'lythaus-admin-api-development', versionId: '11111111-1111-4111-8111-111111111111', sourceSha: releaseSha, status: 'NEW_CANDIDATE', provenance: 'BUILT_FROM_RELEASE_SHA' },
  jobs: { workerName: 'lythaus-jobs-development' },
  coordinator: { workerName: 'lythaus-auth-acceptance-coordinator-development' },
  subjectDiagnosticExpiresAt: expiry,
});

test('activation accepts only a live expiry bound to the exact Admin candidate', () => {
  assert.deepEqual(verifySubjectDiagnosticExpiry({
    enabled: true, expiresAt: expiry, candidateDependenciesJson: dependencies,
    adminWorkerVersion: '11111111-1111-4111-8111-111111111111',
    adminWorkerSourceSha: releaseSha, releaseSha, nowMs: Date.parse('2026-11-08T12:00:00Z'),
  }), { status: 'live', expiresAt: expiry });
});

test('activation rejects expired, missing, or candidate-mismatched policy receipts', () => {
  const base = {
    enabled: true, expiresAt: expiry, candidateDependenciesJson: dependencies,
    adminWorkerVersion: '11111111-1111-4111-8111-111111111111',
    adminWorkerSourceSha: releaseSha, releaseSha, nowMs: Date.parse('2026-11-08T12:00:00Z'),
  };
  assert.throws(() => verifySubjectDiagnosticExpiry({ ...base, nowMs: Date.parse('2026-11-08T13:00:00Z') }), /expired_before_activation/);
  assert.throws(() => verifySubjectDiagnosticExpiry({ ...base, expiresAt: '' }), /expired_before_activation/);
  assert.throws(() => verifySubjectDiagnosticExpiry({ ...base, adminWorkerVersion: '22222222-2222-4222-8222-222222222222' }), /candidate_binding_mismatch/);
  assert.throws(() => verifySubjectDiagnosticExpiry({ ...base, releaseSha: 'b'.repeat(40) }), /candidate_binding_mismatch/);
});

test('activation requires runway for the complete release activation job', () => {
  const base = {
    enabled: true, expiresAt: expiry, candidateDependenciesJson: dependencies,
    adminWorkerVersion: '11111111-1111-4111-8111-111111111111',
    adminWorkerSourceSha: releaseSha, releaseSha,
  };
  const exactRunwayNow = Date.parse(expiry) - SUBJECT_DIAGNOSTIC_MIN_ACTIVATION_REMAINING_SECONDS * 1000;
  assert.equal(verifySubjectDiagnosticExpiry({ ...base, nowMs: exactRunwayNow }).status, 'live');
  assert.throws(() => verifySubjectDiagnosticExpiry({ ...base, nowMs: exactRunwayNow + 1000 }), /activation_runway_insufficient/);
});

test('disabled activation rejects a leftover diagnostic expiry and otherwise remains unchanged', () => {
  assert.deepEqual(verifySubjectDiagnosticExpiry({ enabled: false }), { status: 'disabled' });
  assert.throws(() => verifySubjectDiagnosticExpiry({ enabled: false, expiresAt: expiry }), /unrequested_policy_present/);
});
