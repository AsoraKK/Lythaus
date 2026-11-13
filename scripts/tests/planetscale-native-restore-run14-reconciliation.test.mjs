import assert from 'node:assert/strict';
import test from 'node:test';
import { hash0021RestoreEvidenceRecord } from '../ci/planetscale-0021-only-contract.mjs';
import { RUN14, RUN14_LOG_ATTESTATION, assertRun14Evidence, assertRun14LogAttestation,
  readRun14Evidence, verifyRun14Cleanup } from '../ci/planetscale-native-restore-run14-reconciliation.mjs';
import { syntheticRun14Metadata } from './planetscale-native-restore-run14-fixture.mjs';

const env = { GITHUB_REPOSITORY: 'AsoraKK/Lythaus' };

test('run-14 reconciliation accepts only the exact pinned log attestation', () => {
  assert.equal(assertRun14LogAttestation(RUN14_LOG_ATTESTATION), true);
  assert.deepEqual(RUN14_LOG_ATTESTATION, {
    qualificationRunId: '40470687953', qualificationRunNumber: 14, qualificationRunAttempt: 1,
    qualificationWorkflowId: 394786946, qualificationWorkflowPath: '.github/workflows/planetscale-native-restore-check.yml',
    qualificationHeadSha: '8dd80c4734ac5dad57c4e7338660b4e629c58da1', qualificationJobId: 122076816421,
    qualificationReportSha256: '741b984dc35cf651156bdb99a9abedb9c4fef04b27a0f0ccc7413e82e343f354',
    qualificationArtifactId: 12718234369,
    qualificationArchiveSha256Text: '7e66ea427d9804594946aa71bb9321c6d4f25a906dfd59eef17d6b43e2c6583f',
    targetId: 'p5953kdp72ac', targetName: 'lythaus-0021-native-restore-check-20261027-01',
    sourceId: 'vqa2g2xc9wsl', backupId: '6vew80jo0epr',
    evidenceCommit: 'cd7512a19353874586cc0573b97158a8086b6468',
    historicalRecordSha256: 'c8af5a2658260bfd1999db2c692da4ab26571c774b8f18a75374214b196b1ca1',
    cleanupRunId: '40475075010', cleanupRunNumber: 3, cleanupRunAttempt: 1,
    cleanupWorkflowId: 394840164, cleanupWorkflowPath: '.github/workflows/planetscale-native-restore-cleanup.yml',
    cleanupHeadSha: '8dd80c4734ac5dad57c4e7338660b4e629c58da1', cleanupJobId: 122091204998,
    cleanupArtifactId: 12720920605, cleanupArtifactName: 'native-restore-cleanup-40470687953-40475075010',
    cleanupArtifactSize: 1635,
    cleanupArtifactDigestText: '3b99b99de6374e227dfe8b6b63e2835d799e7335f5f862bbb5d9f00a1b43379e',
    cleanupResultLoggedAt: '2026-10-27T08:44:43.3951079Z',
    cleanupResult: 'DELETED_AND_READBACK_VERIFIED', deletionVerified: true,
    recoveryCertified: false, recoveryAcceptance: 'NOT_CERTIFIED',
  });
  for (const [field, value] of [
    ['qualificationRunId', '40470687954'], ['qualificationRunNumber', 15], ['qualificationRunAttempt', 2],
    ['qualificationWorkflowId', 1], ['qualificationWorkflowPath', '.github/workflows/other.yml'],
    ['qualificationHeadSha', '0'.repeat(40)], ['evidenceCommit', '1'.repeat(40)],
    ['historicalRecordSha256', '2'.repeat(64)], ['qualificationArtifactId', 12718234370],
    ['qualificationArchiveSha256Text', '3'.repeat(64)], ['cleanupRunId', '40475075011'],
    ['cleanupRunNumber', 4], ['cleanupRunAttempt', 2], ['cleanupWorkflowId', 1],
    ['cleanupHeadSha', '4'.repeat(40)], ['cleanupArtifactId', 12720920606],
    ['cleanupArtifactDigestText', '5'.repeat(64)], ['cleanupResult', 'TARGET_ABSENT_UNVERIFIED'],
    ['deletionVerified', false], ['recoveryCertified', true], ['recoveryAcceptance', 'CERTIFIED'],
  ]) {
    assert.throws(() => assertRun14LogAttestation({ ...RUN14_LOG_ATTESTATION, [field]: value }),
      /prior_run14_log_attestation_mismatch/, field);
  }
  const missing = { ...RUN14_LOG_ATTESTATION };
  delete missing.cleanupArtifactId;
  assert.throws(() => assertRun14LogAttestation(missing), /prior_run14_log_attestation_mismatch/);
  assert.throws(() => assertRun14LogAttestation({ ...RUN14_LOG_ATTESTATION, extra: true }),
    /prior_run14_log_attestation_mismatch/);
});

test('run-14 evidence binds exact report and current record without certifying recovery', () => {
  const evidence = readRun14Evidence();
  const proof = assertRun14Evidence(evidence.reportBytes, evidence.recordBytes);
  assert.deepEqual(proof, { reportSha256: RUN14.reportSha256, currentRecordSha256: RUN14.currentRecordSha256,
    qualificationArchiveSha256Text: RUN14.qualificationArchiveSha256Text,
    qualificationArchiveBytesVerified: false, historicalRecordSha256: RUN14.historicalRecordSha256,
    historicalRecordBytesIncluded: false });
  assert.throws(() => assertRun14Evidence(Buffer.concat([evidence.reportBytes, Buffer.from(' ')]), evidence.recordBytes),
    /prior_run14_report_hash_mismatch/);
  for (const mutate of [
    record => { record.recordSha256 = 'a'.repeat(64); },
    record => { record.nativeRestoreCleanup.artifactId += 1; },
    record => { record.nativeRestoreCleanup.artifactArchiveSha256 = 'b'.repeat(64); },
    record => { record.unresolvedGates = []; },
    record => { record.rpoRtoAcceptance.acceptedAt = '2026-10-27T08:00:00Z'; },
    record => { delete record.nativeRestoreCleanup; record.recordSha256 = hash0021RestoreEvidenceRecord(record); },
  ]) {
    const record = JSON.parse(Buffer.from(evidence.recordBytes).toString('utf8'));
    mutate(record);
    const bytes = Buffer.from(JSON.stringify(record));
    assert.throws(() => assertRun14Evidence(evidence.reportBytes, bytes));
  }
});

test('exact run-14 history entry reconciles with non-certifying API proof and GET-only reads', async () => {
  const fixture = syntheticRun14Metadata();
  const proof = await verifyRun14Cleanup(fixture.run, fixture.read, env);
  assert.equal(proof.status, 'PINNED_RUN14_LOG_CLEANUP_RECONCILED');
  assert.equal(proof.runId, RUN14.runId);
  assert.equal(proof.cleanupRunId, RUN14.cleanupRunId);
  assert.equal(proof.cleanupOutcome, 'DELETED_AND_READBACK_VERIFIED');
  assert.equal(proof.cleanupArtifactDigestText, '3b99b99de6374e227dfe8b6b63e2835d799e7335f5f862bbb5d9f00a1b43379e');
  assert.equal(proof.deletionVerified, true);
  assert.equal(proof.recoveryAcceptance, 'NOT_CERTIFIED');
  assert.equal(proof.recoveryCertified, false);
  assert.equal(proof.qualificationArchiveBytesVerified, false);
  assert.equal(proof.cleanupArtifactBytesVerified, false);
  assert.ok(fixture.calls.every(path => path.startsWith('/actions/runs/')));
});

test('run-14 API provenance, jobs, approvals, and absent archives fail closed on drift', async () => {
  const candidates = [
    ['run id', '/actions/runs/' + RUN14.runId, value => { value.id += 1; }],
    ['run attempt', '/actions/runs/' + RUN14.runId, value => { value.run_attempt = 2; }],
    ['run workflow', '/actions/runs/' + RUN14.runId, value => { value.workflow_id += 1; }],
    ['run head commit', '/actions/runs/' + RUN14.runId, value => { value.head_sha = 'c'.repeat(40); }],
    ['cleanup attempt', '/actions/runs/' + RUN14.cleanupRunId, value => { value.run_attempt = 2; }],
    ['cleanup workflow', '/actions/runs/' + RUN14.cleanupRunId, value => { value.workflow_id += 1; }],
    ['cleanup commit', '/actions/runs/' + RUN14.cleanupRunId, value => { value.head_sha = 'd'.repeat(40); }],
    ['job id', '/actions/runs/' + RUN14.cleanupRunId + '/jobs?per_page=100', value => { value.jobs[0].id += 1; }],
    ['approval', '/actions/runs/' + RUN14.cleanupRunId + '/approvals', value => { value[0].user.id += 1; }],
    ['archive availability', '/actions/runs/' + RUN14.cleanupRunId + '/artifacts?per_page=100', value => {
      value.total_count = 1; value.artifacts = [{ id: RUN14.cleanupArtifactId }];
    }],
  ];
  for (const [label, route, mutate] of candidates) {
    const fixture = syntheticRun14Metadata();
    const value = fixture.responses.get(route);
    mutate(value);
    if (route === '/actions/runs/' + RUN14.runId) Object.assign(fixture.run, value);
    await assert.rejects(() => verifyRun14Cleanup(fixture.run, fixture.read, env), undefined, label);
  }
});

test('run-14 attestation claims and required provenance fields cannot be omitted', async () => {
  const fixture = syntheticRun14Metadata();
  const falseRecoveryClaim = { ...RUN14_LOG_ATTESTATION, recoveryCertified: true };
  assert.throws(() => assertRun14LogAttestation(falseRecoveryClaim), /prior_run14_log_attestation_mismatch/);
  const missingRecordBytes = { ...readRun14Evidence(), recordBytes: undefined };
  await assert.rejects(() => verifyRun14Cleanup(fixture.run, fixture.read, env,
    { evidence: missingRecordBytes }), /prior_run14_report_hash_mismatch/);
});
