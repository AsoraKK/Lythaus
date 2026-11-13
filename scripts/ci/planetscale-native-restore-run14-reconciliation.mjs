import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { object, requireThat } from './planetscale-native-restore-contract.mjs';
import { hash0021RestoreEvidenceRecord } from './planetscale-0021-only-contract.mjs';

export const RUN14 = Object.freeze({
  runId: '40470687953', runNumber: 14, runAttempt: 1, workflowId: 394786946,
  workflowPath: '.github/workflows/planetscale-native-restore-check.yml',
  jobId: 122076816421, headSha: '8dd80c4734ac5dad57c4e7338660b4e629c58da1',
  sourceId: 'vqa2g2xc9wsl', backupId: '6vew80jo0epr', targetId: 'p5953kdp72ac',
  targetName: 'lythaus-0021-native-restore-check-20261027-01',
  reportSha256: '741b984dc35cf651156bdb99a9abedb9c4fef04b27a0f0ccc7413e82e343f354',
  qualificationArtifactId: 12718234369,
  qualificationArchiveSha256Text: '7e66ea427d9804594946aa71bb9321c6d4f25a906dfd59eef17d6b43e2c6583f',
  evidenceCommit: 'cd7512a19353874586cc0573b97158a8086b6468',
  historicalRecordSha256: 'c8af5a2658260bfd1999db2c692da4ab26571c774b8f18a75374214b196b1ca1',
  currentRecordSha256: '8658fad0d90b44b94ac7c2def552f3cbae10e7c05fb6420f2b5fb6fd2ea2bcda',
  cleanupRunId: '40475075010', cleanupRunNumber: 3, cleanupRunAttempt: 1,
  cleanupWorkflowId: 394840164, cleanupWorkflowPath: '.github/workflows/planetscale-native-restore-cleanup.yml',
  cleanupJobId: 122091204998, cleanupArtifactId: 12720920605,
  cleanupArtifactName: 'native-restore-cleanup-40470687953-40475075010', cleanupArtifactSize: 1635,
  cleanupArtifactDigestText: '3b99b99de6374e227dfe8b6b63e2835d799e7335f5f862bbb5d9f00a1b43379e',
  cleanupHeadSha: '8dd80c4734ac5dad57c4e7338660b4e629c58da1',
  cleanupFinishedAt: '2026-10-27T08:44:47Z', cleanupResultLoggedAt: '2026-10-27T08:44:43.3951079Z',
  operator: 'AsoraKK', operatorId: 211295889,
});

// These values are transcribed from the retained run #3 cleanup log. They pin
// log statements as text; neither ZIP digest is presented as byte-verified.
export const RUN14_LOG_ATTESTATION = Object.freeze({
  qualificationRunId: RUN14.runId, qualificationRunNumber: RUN14.runNumber,
  qualificationRunAttempt: RUN14.runAttempt, qualificationWorkflowId: RUN14.workflowId,
  qualificationWorkflowPath: RUN14.workflowPath, qualificationHeadSha: RUN14.headSha,
  qualificationJobId: RUN14.jobId, qualificationReportSha256: RUN14.reportSha256,
  qualificationArtifactId: RUN14.qualificationArtifactId,
  qualificationArchiveSha256Text: RUN14.qualificationArchiveSha256Text,
  targetId: RUN14.targetId, targetName: RUN14.targetName, sourceId: RUN14.sourceId, backupId: RUN14.backupId,
  evidenceCommit: RUN14.evidenceCommit, historicalRecordSha256: RUN14.historicalRecordSha256,
  cleanupRunId: RUN14.cleanupRunId, cleanupRunNumber: RUN14.cleanupRunNumber,
  cleanupRunAttempt: RUN14.cleanupRunAttempt, cleanupWorkflowId: RUN14.cleanupWorkflowId,
  cleanupWorkflowPath: RUN14.cleanupWorkflowPath, cleanupHeadSha: RUN14.cleanupHeadSha,
  cleanupJobId: RUN14.cleanupJobId, cleanupArtifactId: RUN14.cleanupArtifactId,
  cleanupArtifactName: RUN14.cleanupArtifactName, cleanupArtifactSize: RUN14.cleanupArtifactSize,
  cleanupArtifactDigestText: RUN14.cleanupArtifactDigestText,
  cleanupResultLoggedAt: RUN14.cleanupResultLoggedAt,
  cleanupResult: 'DELETED_AND_READBACK_VERIFIED', deletionVerified: true,
  recoveryCertified: false, recoveryAcceptance: 'NOT_CERTIFIED',
});

const evidenceRoot = new URL('../../docs/evidence/production-cutover/0021-restore-evidence/', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function pinnedEvidenceBytes(relative) {
  const file = new URL(relative, evidenceRoot);
  try {
    const stat = fs.lstatSync(file);
    requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 1048576,
      'prior_run14_evidence_file_invalid');
    requireThat(fs.realpathSync(file) === file.pathname, 'prior_run14_evidence_file_indirection');
    return fs.readFileSync(file);
  } catch {
    throw new Error('prior_run14_evidence_file_unavailable');
  }
}

export function readRun14Evidence() {
  return {
    reportBytes: pinnedEvidenceBytes('artifacts/qualification-40470687953.json'),
    recordBytes: pinnedEvidenceBytes('6vew80jo0epr.json'),
  };
}

export function assertRun14LogAttestation(attestation) {
  requireThat(isDeepStrictEqual(attestation, RUN14_LOG_ATTESTATION), 'prior_run14_log_attestation_mismatch');
  return true;
}

export function assertRun14Evidence(reportBytes, recordBytes) {
  requireThat(ArrayBuffer.isView(reportBytes) && ArrayBuffer.isView(recordBytes)
    && sha256(reportBytes) === RUN14.reportSha256, 'prior_run14_report_hash_mismatch');
  let report, record;
  try {
    report = JSON.parse(Buffer.from(reportBytes).toString('utf8'));
    record = JSON.parse(Buffer.from(recordBytes).toString('utf8'));
  } catch { throw new Error('prior_run14_evidence_json_invalid'); }
  requireThat(object(report) && report.runId === RUN14.runId && report.sourceMainSha === RUN14.headSha
    && report.phase === 'qualification' && report.mode === 'execute'
    && report.qualificationOutcome === 'PASSED' && report.recoveryAcceptance === 'NOT_CERTIFIED'
    && report.createdTargetId === RUN14.targetId && report.backupId === RUN14.backupId
    && report.targetName === RUN14.targetName, 'prior_run14_report_identity_mismatch');
  requireThat(object(record) && record.schemaVersion === 'lythaus-0021-restore-evidence-v1'
    && record.recordSha256 === RUN14.currentRecordSha256
    && hash0021RestoreEvidenceRecord(record) === RUN14.currentRecordSha256
    && record.evidenceSha256 === RUN14.reportSha256
    && record.artifactPath === 'docs/evidence/production-cutover/0021-restore-evidence/artifacts/qualification-40470687953.json'
    && record.artifactStatus === 'VERIFIED_NATIVE_QUALIFICATION_ONLY'
    && record.sourceBranch?.id === RUN14.sourceId && record.sourceBranch.name === 'main'
    && record.selectedBackupId === RUN14.backupId
    && record.restoredBranch?.id === RUN14.targetId && record.restoredBranch.name === RUN14.targetName
    && record.nativeRestoreCleanup?.schemaVersion === 'native-restore-cleanup-intent-v1'
    && record.nativeRestoreCleanup.state === 'DELETE_PENDING'
    && record.nativeRestoreCleanup.qualificationSha === RUN14.headSha
    && record.nativeRestoreCleanup.qualificationRunId === RUN14.runId
    && record.nativeRestoreCleanup.qualificationWorkflowId === RUN14.workflowId
    && record.nativeRestoreCleanup.targetId === RUN14.targetId
    && record.nativeRestoreCleanup.workflowId === RUN14.cleanupWorkflowId
    && record.nativeRestoreCleanup.runNumber === RUN14.cleanupRunNumber
    && record.nativeRestoreCleanup.artifactId === RUN14.qualificationArtifactId
    && record.nativeRestoreCleanup.artifactArchiveSha256 === RUN14.qualificationArchiveSha256Text
    && record.nativeRestoreCleanup.evidenceOutcome === 'PASSED', 'prior_run14_record_identity_mismatch');
  requireThat(Array.isArray(record.unresolvedGates)
    && record.unresolvedGates.includes('independent_recovery_destination')
    && record.rpoRtoAcceptance?.ownerTestingOnly === true
    && record.rpoRtoAcceptance.actualTransactionLossMeasured === false
    && record.rpoRtoAcceptance.fullProductionFailoverRtoMeasured === false
    && Date.parse(record.rpoRtoAcceptance.acceptedAt) > Date.parse(RUN14.cleanupFinishedAt),
  'prior_run14_recovery_gate_promoted');
  return { reportSha256: RUN14.reportSha256, currentRecordSha256: RUN14.currentRecordSha256,
    qualificationArchiveSha256Text: RUN14.qualificationArchiveSha256Text,
    qualificationArchiveBytesVerified: false, historicalRecordSha256: RUN14.historicalRecordSha256,
    historicalRecordBytesIncluded: false };
}

function assertRun(run, env, cleanup) {
  const id = cleanup ? RUN14.cleanupRunId : RUN14.runId;
  const number = cleanup ? RUN14.cleanupRunNumber : RUN14.runNumber;
  const workflowId = cleanup ? RUN14.cleanupWorkflowId : RUN14.workflowId;
  const workflowPath = cleanup ? RUN14.cleanupWorkflowPath : RUN14.workflowPath;
  const headSha = cleanup ? RUN14.cleanupHeadSha : RUN14.headSha;
  const title = cleanup ? 'Native restore cleanup ' + RUN14.runId : 'Native restore execute ' + RUN14.headSha;
  requireThat(object(run) && String(run.id) === id && run.run_number === number && run.run_attempt === 1
    && run.workflow_id === workflowId && run.path === workflowPath && run.event === 'workflow_dispatch'
    && run.head_sha === headSha && run.head_branch === 'main' && run.status === 'completed'
    && run.conclusion === 'success' && run.display_title === title && run.name === title
    && run.repository?.id === 1010752912 && run.repository.full_name === env.GITHUB_REPOSITORY
    && run.head_repository?.id === 1010752912 && run.head_repository.full_name === env.GITHUB_REPOSITORY
    && Array.isArray(run.pull_requests) && run.pull_requests.length === 0,
  'prior_run14_cleanup_provenance_mismatch');
}

function assertJob(job, jobs, cleanup) {
  const id = cleanup ? RUN14.cleanupRunId : RUN14.runId;
  const jobId = cleanup ? RUN14.cleanupJobId : RUN14.jobId;
  const expectedLength = cleanup ? 18 : 13;
  const expectedJobName = cleanup ? 'Review evidence before single target cleanup' : 'Qualify isolated native restore without cleanup';
  const requiredSteps = cleanup ? [
    ['Prove exact reviewed evidence and immutable qualification upload', 'success'],
    ['Download immutable qualification artifact', 'success'],
    ['Verify unchanged qualification bytes and stage one-use pending intent', 'success'],
    ['Persist pending deletion before any DELETE', 'success'],
    ['Download and verify durable pending attempt', 'success'],
    ['Delete original acknowledged target once after reviewed durable evidence', 'success'],
    ['Reconcile read-only without retrying deletion or qualification', 'skipped'],
    ['Retain separate sanitized cleanup receipt', 'success'],
  ] : [
    ['Run fixed-target runner using only existing protected access', 'success'],
    ['Finalize immutable qualification evidence without provider access', 'success'],
    ['Upload immutable qualification evidence', 'success'],
  ];
  requireThat(object(jobs) && jobs.total_count === 1 && Array.isArray(jobs.jobs) && jobs.jobs.length === 1
    && object(job) && job.id === jobId && String(job.run_id) === id && job.run_attempt === 1
    && job.head_sha === (cleanup ? RUN14.cleanupHeadSha : RUN14.headSha) && job.name === expectedJobName
    && job.status === 'completed' && job.conclusion === 'success'
    && Number.isSafeInteger(job.runner_id) && job.runner_id > 0
    && Array.isArray(job.steps) && job.steps.length === expectedLength
    && job.steps.every(step => object(step) && step.status === 'completed' && ['success', 'skipped'].includes(step.conclusion))
    && new Set(job.steps.map(step => step.name)).size === job.steps.length
    && requiredSteps.every(([name, conclusion]) => job.steps.some(step => step.name === name && step.conclusion === conclusion)),
  'prior_run14_cleanup_job_evidence_mismatch');
}

async function assertApproval(runId, read) {
  const approvals = await read('/actions/runs/' + runId + '/approvals');
  requireThat(Array.isArray(approvals) && approvals.length === 1 && object(approvals[0])
    && approvals[0].state === 'approved' && approvals[0].user?.type === 'User'
    && approvals[0].user.login === RUN14.operator && approvals[0].user.id === RUN14.operatorId
    && approvals[0].environments?.some(row => row.name === 'production'),
  'prior_run14_cleanup_human_approval_mismatch');
}

async function assertUnavailableArtifacts(runId, read) {
  const artifacts = await read('/actions/runs/' + runId + '/artifacts?per_page=100');
  requireThat(object(artifacts) && artifacts.total_count === 0 && Array.isArray(artifacts.artifacts)
    && artifacts.artifacts.length === 0, 'prior_run14_archive_availability_changed');
}

export async function verifyRun14Cleanup(run, read, env, {
  evidence = readRun14Evidence(),
} = {}) {
  const evidenceProof = assertRun14Evidence(evidence.reportBytes, evidence.recordBytes);
  assertRun(run, env, false);
  const cleanupRun = await read('/actions/runs/' + RUN14.cleanupRunId);
  assertRun(cleanupRun, env, true);
  for (const [cleanup, runId] of [[false, RUN14.runId], [true, RUN14.cleanupRunId]]) {
    const jobs = await read('/actions/runs/' + runId + '/jobs?per_page=100');
    assertJob(jobs?.jobs?.[0], jobs, cleanup);
    await assertApproval(runId, read);
    await assertUnavailableArtifacts(runId, read);
  }
  return { status: 'PINNED_RUN14_LOG_CLEANUP_RECONCILED', runId: RUN14.runId,
    runNumber: RUN14.runNumber, runAttempt: RUN14.runAttempt, workflowId: RUN14.workflowId,
    headSha: RUN14.headSha, sourceId: RUN14.sourceId, backupId: RUN14.backupId,
    targetName: RUN14.targetName, targetId: RUN14.targetId, qualificationOutcome: 'PASSED',
    recoveryAcceptance: 'NOT_CERTIFIED', recoveryCertified: false,
    cleanupRunId: RUN14.cleanupRunId, cleanupRunNumber: RUN14.cleanupRunNumber,
    cleanupRunAttempt: RUN14.cleanupRunAttempt, cleanupWorkflowId: RUN14.cleanupWorkflowId,
    cleanupJobId: RUN14.cleanupJobId, cleanupOutcome: RUN14_LOG_ATTESTATION.cleanupResult,
    deletionVerified: true, evidenceCommit: RUN14.evidenceCommit,
    historicalRecordSha256: RUN14.historicalRecordSha256, currentRecordSha256: evidenceProof.currentRecordSha256,
    qualificationArtifactId: RUN14.qualificationArtifactId,
    qualificationArchiveSha256Text: RUN14.qualificationArchiveSha256Text,
    qualificationArchiveBytesVerified: false, cleanupArtifactId: RUN14.cleanupArtifactId,
    cleanupArtifactDigestText: RUN14.cleanupArtifactDigestText, cleanupArtifactBytesVerified: false,
    historicalRecordBytesIncluded: false,
    evidenceLimitations: ['qualification ZIP and cleanup artifact ZIP are unavailable; logged digest text is not byte verification',
      'historical cleanup record bytes are not included; its pinned hash is bound by the cleanup log',
      'run #14 is qualification-only and does not certify recovery'],
  };
}
