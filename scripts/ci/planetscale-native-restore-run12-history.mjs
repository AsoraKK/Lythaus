import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { object, requireThat } from './planetscale-native-restore-contract.mjs';
import { hash0021RestoreEvidenceRecord } from './planetscale-0021-only-contract.mjs';
import { RUN12, RUN12_ARTIFACTS, verifyRun12ReviewedCleanup } from './planetscale-native-restore-run12-reconciliation.mjs';

// This exact historical exception is not an archive reconstruction or a fresh
// recovery certificate. The original strict verifier remains unchanged.
export const RUN12_HISTORICAL_LOG_ATTESTATION = Object.freeze({
  qualificationRunId: RUN12.runId, qualificationJobId: RUN12.jobId,
  cleanupRunId: RUN12.cleanupRunId, cleanupJobId: RUN12.cleanupJobId,
  sourceLogUrl: 'https://api.github.com/repos/AsoraKK/Lythaus/actions/jobs/121741463878/logs',
  evidenceCommit: RUN12.evidenceHead, originalRecordSha256: RUN12.recordSha256,
  targetId: RUN12.targetId, cleanupResult: 'DELETED_AND_READBACK_VERIFIED',
  recoveryCertified: false, qualificationOutcome: 'FAILED', recoveryAcceptance: 'NOT_CERTIFIED',
  qualificationArchiveSha256Text: RUN12_ARTIFACTS[0].digest.slice(7),
  pendingArchiveSha256Text: RUN12_ARTIFACTS[1].digest.slice(7),
  cleanupArchiveSha256Text: RUN12_ARTIFACTS[2].digest.slice(7),
});

const root = new URL('../../docs/evidence/production-cutover/historical-cleanup/run12/', import.meta.url);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const recordBytesSha256 = '08d94db176da61c1435f5a6625c4d995deaf37fa926e158ee64c2b1e37d796d3';
const qualificationWorkflow = '.github/workflows/planetscale-native-restore-check.yml';
const cleanupWorkflow = '.github/workflows/planetscale-native-restore-cleanup.yml';

function pinnedBytes(name) {
  const file = new URL(name, root);
  try {
    const stat = fs.lstatSync(file);
    requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 1048576
      && fs.realpathSync(file) === file.pathname, 'prior_run12_historical_file_invalid');
    return fs.readFileSync(file);
  } catch { throw new Error('prior_run12_historical_file_unavailable'); }
}

export function readRun12HistoricalEvidence() {
  return { qualificationBytes: pinnedBytes('qualification-40360605402.json'),
    recordBytes: pinnedBytes('original-review-record.json') };
}

export function assertRun12HistoricalEvidence(evidence) {
  requireThat(object(evidence) && ArrayBuffer.isView(evidence.qualificationBytes)
    && ArrayBuffer.isView(evidence.recordBytes)
    && sha256(evidence.qualificationBytes) === RUN12.qualificationSha256
    && sha256(evidence.recordBytes) === recordBytesSha256, 'prior_run12_historical_bytes_mismatch');
  let report, record;
  try {
    report = JSON.parse(Buffer.from(evidence.qualificationBytes).toString('utf8'));
    record = JSON.parse(Buffer.from(evidence.recordBytes).toString('utf8'));
  } catch { throw new Error('prior_run12_historical_json_invalid'); }
  requireThat(object(report) && report.runId === RUN12.runId && report.sourceMainSha === RUN12.headSha
    && report.phase === 'qualification' && report.mode === 'execute'
    && report.status === 'DENIED' && report.qualificationOutcome === 'FAILED'
    && report.recoveryAcceptance === 'NOT_CERTIFIED' && report.sourceBranchId === RUN12.sourceId
    && report.backupId === RUN12.backupId && report.createdTargetId === RUN12.targetId
    && report.targetName === RUN12.targetName && report.creation?.id === RUN12.targetId
    && report.creation.acknowledged === true && report.credentialActions?.length === 0,
  'prior_run12_historical_report_mismatch');
  requireThat(object(record) && record.recordSha256 === RUN12.recordSha256
    && hash0021RestoreEvidenceRecord(record) === RUN12.recordSha256
    && record.evidenceSha256 === RUN12.qualificationSha256
    && record.artifactStatus === 'VERIFIED_FAILED_QUALIFICATION'
    && record.sourceBranch?.id === RUN12.sourceId && record.selectedBackupId === RUN12.backupId
    && record.restoredBranch?.id === RUN12.targetId && record.restoredBranch.name === RUN12.targetName
    && record.nativeRestoreCleanup?.state === 'DELETE_PENDING'
    && record.nativeRestoreCleanup.qualificationRunId === RUN12.runId
    && record.nativeRestoreCleanup.targetId === RUN12.targetId
    && record.nativeRestoreCleanup.workflowId === RUN12.cleanupWorkflowId
    && record.nativeRestoreCleanup.runNumber === RUN12.cleanupRunNumber
    && record.nativeRestoreCleanup.artifactId === RUN12_ARTIFACTS[0].id
    && record.nativeRestoreCleanup.artifactArchiveSha256 === RUN12_ARTIFACTS[0].digest.slice(7)
    && record.nativeRestoreCleanup.evidenceOutcome === 'FAILED'
    && Array.isArray(record.unresolvedGates) && record.unresolvedGates.includes('rpo_rto_acceptance')
    && record.unresolvedGates.includes('independent_recovery_destination'),
  'prior_run12_historical_record_mismatch');
  return { qualificationPayloadBytesVerified: true, originalReviewRecordBytesVerified: true,
    qualificationSha256: RUN12.qualificationSha256, originalReviewRecordBytesSha256: recordBytesSha256,
    originalReviewRecordSha256: RUN12.recordSha256, evidenceCommit: RUN12.evidenceHead };
}

function assertRun(run, env, cleanup) {
  const id = cleanup ? RUN12.cleanupRunId : RUN12.runId;
  const title = cleanup ? `Native restore cleanup ${RUN12.runId}` : `Native restore execute ${RUN12.headSha}`;
  requireThat(object(run) && String(run.id) === id && run.run_number === (cleanup ? 2 : 12) && run.run_attempt === 1
    && run.workflow_id === (cleanup ? RUN12.cleanupWorkflowId : RUN12.workflowId)
    && run.path === (cleanup ? cleanupWorkflow : qualificationWorkflow) && run.event === 'workflow_dispatch'
    && run.head_sha === RUN12.headSha && run.head_branch === 'main' && run.status === 'completed'
    && run.conclusion === (cleanup ? 'success' : 'failure') && run.display_title === title && run.name === title
    && run.repository?.id === 1010752912 && run.repository.full_name === env.GITHUB_REPOSITORY
    && run.head_repository?.id === 1010752912 && run.head_repository.full_name === env.GITHUB_REPOSITORY
    && Array.isArray(run.pull_requests) && run.pull_requests.length === 0, 'prior_reviewed_cleanup_run_provenance_mismatch');
}

export async function verifyRun12CleanupHistory(run, read, env, { evidence } = {}) {
  assertRun(run, env, false);
  const inventories = await Promise.all([RUN12.runId, RUN12.cleanupRunId].map(id =>
    read(`/actions/runs/${id}/artifacts?per_page=100`)));
  requireThat(inventories.every(value => object(value) && Number.isSafeInteger(value.total_count)
    && value.total_count >= 0 && value.total_count <= 100 && Array.isArray(value.artifacts)
    && value.artifacts.length === value.total_count), 'prior_run12_archive_inventory_invalid');
  // Available or partially available archives must take the unchanged strict
  // verifier. A failure there never falls back to the historical log profile.
  if (inventories.some(value => value.total_count > 0)) return verifyRun12ReviewedCleanup(run, read, env);
  const evidenceProof = assertRun12HistoricalEvidence(evidence ?? readRun12HistoricalEvidence());
  const human = env.GITHUB_REPOSITORY.split('/')[0];
  assertRun(await read(`/actions/runs/${RUN12.cleanupRunId}`), env, true);
  for (const cleanup of [false, true]) {
    const runId = cleanup ? RUN12.cleanupRunId : RUN12.runId;
    const jobs = await read(`/actions/runs/${runId}/jobs?per_page=100`), job = jobs?.jobs?.[0];
    const requiredSteps = cleanup ? [
      ['Persist pending deletion before any DELETE', 'success'], ['Download and verify durable pending attempt', 'success'],
      ['Delete original acknowledged target once after reviewed durable evidence', 'success'],
      ['Reconcile read-only without retrying deletion or qualification', 'skipped'], ['Retain separate sanitized cleanup receipt', 'success'],
    ] : [['Run fixed-target runner using only existing protected access', 'failure'],
      ['Finalize immutable qualification evidence without provider access', 'success'], ['Upload immutable qualification evidence', 'success']];
    requireThat(object(jobs) && jobs.total_count === 1 && Array.isArray(jobs.jobs) && jobs.jobs.length === 1
      && object(job) && job.id === (cleanup ? RUN12.cleanupJobId : RUN12.jobId)
      && String(job.run_id) === runId && job.run_attempt === 1 && job.head_sha === RUN12.headSha
      && job.name === (cleanup ? 'Review evidence before single target cleanup' : 'Qualify isolated native restore without cleanup')
      && job.status === 'completed' && job.conclusion === (cleanup ? 'success' : 'failure')
      && Number.isSafeInteger(job.runner_id) && job.runner_id > 0
      && Array.isArray(job.steps) && job.steps.length === (cleanup ? 18 : 13)
      && job.steps.every(step => object(step) && step.status === 'completed'
        && (['success', 'skipped'].includes(step.conclusion) || !cleanup
          && step.name === 'Run fixed-target runner using only existing protected access' && step.conclusion === 'failure'))
      && new Set(job.steps.map(step => step.name)).size === job.steps.length
      && requiredSteps.every(([name, conclusion]) => job.steps.some(step => step.name === name && step.conclusion === conclusion)),
    'prior_reviewed_cleanup_job_evidence_mismatch');
    const approvals = await read(`/actions/runs/${runId}/approvals`);
    requireThat(Array.isArray(approvals) && approvals.length === 1 && object(approvals[0]) && approvals[0].state === 'approved'
      && approvals[0].user?.type === 'User' && approvals[0].user.login === human && approvals[0].user.id === RUN12.humanId
      && approvals[0].environments?.some(row => row.name === 'production'), 'prior_reviewed_cleanup_human_approval_mismatch');
    const artifacts = await read(`/actions/runs/${runId}/artifacts?per_page=100`);
    requireThat(object(artifacts) && artifacts.total_count === 0 && Array.isArray(artifacts.artifacts)
      && artifacts.artifacts.length === 0, 'prior_run12_archive_availability_changed');
  }
  const pr = await read(`/pulls/${RUN12.evidencePr}`);
  requireThat(object(pr) && pr.number === RUN12.evidencePr && pr.head?.sha === RUN12.evidenceHead
    && pr.head.repo?.id === 1010752912 && pr.head.repo.full_name === env.GITHUB_REPOSITORY
    && pr.base?.repo?.id === 1010752912 && pr.base.repo.full_name === env.GITHUB_REPOSITORY && pr.base.ref === 'main'
    && pr.changed_files === 2, 'prior_reviewed_cleanup_evidence_head_mismatch');
  const comment = await read(`/issues/comments/${RUN12.commentId}`);
  const body = `I reviewed unmerged native restore evidence ${RUN12.recordSha256} at PR head ${RUN12.evidenceHead}, `
    + `qualification bytes ${RUN12.qualificationSha256}, for target ${RUN12.targetId}. `
    + `I approve one cleanup attempt ${RUN12.cleanupWorkflowId}/2. Qualification outcome: FAILED. This does not certify recovery.`;
  requireThat(object(comment) && comment.id === RUN12.commentId && comment.user?.type === 'User' && comment.user.login === human
    && comment.user.id === RUN12.humanId && comment.created_at === RUN12.reviewedAt && comment.updated_at === RUN12.reviewedAt
    && comment.issue_url === `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues/${RUN12.evidencePr}` && comment.body === body,
  'prior_reviewed_cleanup_exact_attestation_mismatch');
  return { status: 'PINNED_RUN12_LOG_CLEANUP_RECONCILED', runId: RUN12.runId,
    runNumber: RUN12.runNumber, runAttempt: 1, headSha: RUN12.headSha,
    backupId: RUN12.backupId, targetName: RUN12.targetName, targetId: RUN12.targetId,
    qualificationOutcome: 'FAILED', recoveryAcceptance: 'NOT_CERTIFIED', recoveryCertified: false,
    cleanupRunId: RUN12.cleanupRunId, cleanupWorkflowId: RUN12.cleanupWorkflowId,
    consumedCleanupRunNumber: 2, cleanupOutcome: RUN12_HISTORICAL_LOG_ATTESTATION.cleanupResult,
    historicalDeletionLogAttested: true, currentTargetAbsenceVerified: false,
    evidenceBasis: 'PINNED_GIT_PAYLOADS_REVIEW_AND_HISTORICAL_LOG_ATTESTATION',
    ...evidenceProof,
    qualificationArtifactId: RUN12_ARTIFACTS[0].id,
    qualificationArchiveSha256Text: RUN12_ARTIFACTS[0].digest.slice(7),
    pendingPayloadSha256Text: RUN12.pendingSha256, cleanupReceiptPayloadSha256Text: RUN12.receiptSha256,
    qualificationArchiveBytesVerified: false, pendingPayloadBytesVerified: false,
    cleanupReceiptPayloadBytesVerified: false, cleanupArtifactBytesVerified: false,
    evidenceLimitations: [
      'Original qualification, pending and final cleanup ZIPs are unavailable; their logged digest text is not byte verification.',
      'The qualification and original review-record bytes are pinned Git payloads, not proof of membership in an unavailable ZIP.',
      'The pending and final cleanup payload bytes are unavailable; cleanup closure is a reviewed historical log attestation.',
      'Run 12 remains FAILED and NOT_CERTIFIED; current target absence and every fresh recovery gate remain mandatory.',
    ],
  };
}
