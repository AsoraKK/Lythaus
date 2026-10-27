import { createHash } from 'node:crypto';
import { object, requireThat } from './planetscale-native-restore-contract.mjs';

export const RUN12 = Object.freeze({
  runId: '40360605402', runNumber: 12, runAttempt: 1, workflowId: 394786946, jobId: 121704693794,
  headSha: '9e9759181069c3636af3ffefe1d8ec9a3de22f37', sourceId: 'vqa2g2xc9wsl',
  backupId: 'tfqwht9d9bt4', targetId: 'p0behfjbhkp1', targetName: 'lythaus-0021-native-restore-check-20261026-01',
  cleanupRunId: '40371017566', cleanupRunNumber: 2, cleanupWorkflowId: 394840164, cleanupJobId: 121741463878,
  evidencePr: 1119, evidenceHead: '1f00a9f6d6df8dd88a136c8d962a7da8ba529d99', commentId: 6423086516,
  humanId: 211295889, reviewedAt: '2026-10-26T17:38:28Z',
  recordSha256: 'a7768f48922f6fff850a1c8748a9ad23a5f9d2a68fded0ee9929d3231f4ecbb6',
  qualificationSha256: '9c04f2c72dd764d38fdf8dd0ad03ec174f4a88f1e460d4ee496e8145f373a46b',
  pendingSha256: 'fd837b8d403feb8b45126ffc9a7954862a09a564fcf8a3be32938a0a6a705247',
  receiptSha256: 'a181c6942c027c031c2ab10c46d1065688b93521f960ea0659bda52e955b9840',
});
const qualificationWorkflow = '.github/workflows/planetscale-native-restore-check.yml';
const cleanupWorkflow = '.github/workflows/planetscale-native-restore-cleanup.yml';
export const RUN12_ARTIFACTS = Object.freeze([
  Object.freeze({ id: 12667469785, runId: RUN12.runId, size: 3626,
    name: `native-restore-qualification-${RUN12.headSha}-${RUN12.runId}`,
    digest: 'sha256:dff172738fea2ec32763938670f995728e97e2f105a56c040fd3d52556504821' }),
  Object.freeze({ id: 12672082990, runId: RUN12.cleanupRunId, size: 579,
    name: `native-restore-cleanup-pending-${RUN12.runId}-${RUN12.targetId}-2`,
    digest: 'sha256:da77cb00ca0a76ac9b734f436fd1f78dc1cd0ce29d213f4423c1327d2c530c45' }),
  Object.freeze({ id: 12673026254, runId: RUN12.cleanupRunId, size: 1640,
    name: `native-restore-cleanup-${RUN12.runId}-${RUN12.cleanupRunId}`,
    digest: 'sha256:ef23c27b91516bd3b6619151a8fe8c5067f40b307c97897ae3c3222b4b691975' }),
]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function assertRun12Payloads(qualificationBytes, pendingBytes, receiptBytes) {
  requireThat([qualificationBytes, pendingBytes, receiptBytes].every(bytes => ArrayBuffer.isView(bytes))
    && sha256(qualificationBytes) === RUN12.qualificationSha256
    && sha256(pendingBytes) === RUN12.pendingSha256 && sha256(receiptBytes) === RUN12.receiptSha256,
  'prior_reviewed_cleanup_payload_hash_mismatch');
  const [report, pending, receipt] = [qualificationBytes, pendingBytes, receiptBytes].map(bytes => JSON.parse(Buffer.from(bytes)));
  requireThat(report.runId === RUN12.runId && report.sourceMainSha === RUN12.headSha
    && report.backupId === RUN12.backupId && report.targetName === RUN12.targetName
    && report.createdTargetId === RUN12.targetId && report.sourceBranchId === RUN12.sourceId
    && report.creation?.acknowledged === true && report.creation.id === RUN12.targetId
    && report.creation.name === RUN12.targetName && report.creation.kind === 'postgresql' && report.creation.default === false
    && report.creation.sourceBranchId === RUN12.sourceId && report.creation.createdAt === '2026-10-26T16:39:03.695Z'
    && report.status === 'DENIED' && report.qualificationOutcome === 'FAILED' && report.recoveryAcceptance === 'NOT_CERTIFIED'
    && JSON.stringify(report.blockers) === '["provider_access_denied"]'
    && report.providerMutations?.length === 2 && report.providerMutations[0].action === 'create_fixed_restore'
    && report.providerMutations[0].outcome === 'ACKNOWLEDGED'
    && report.providerMutations[1].action === 'reset_copied_pscale_api_47syed2xlt6p'
    && report.providerMutations[1].outcome === 'DENIED' && report.credentialActions?.length === 0,
  'prior_reviewed_cleanup_qualification_mismatch');
  requireThat(pending.schemaVersion === 'native-restore-cleanup-attempt-v1' && pending.state === 'DELETE_PENDING'
    && pending.qualificationRunId === RUN12.runId && pending.qualificationSha === RUN12.headSha
    && pending.cleanupRunId === RUN12.cleanupRunId && pending.cleanupSha === RUN12.headSha
    && pending.workflowId === RUN12.cleanupWorkflowId && pending.runNumber === 2 && pending.attempt === 1
    && pending.evidenceSha === RUN12.evidenceHead && pending.recordSha256 === RUN12.recordSha256
    && pending.targetId === RUN12.targetId && pending.targetName === RUN12.targetName
    && pending.targetCreatedAt === report.creation.createdAt
    && pending.backupId === RUN12.backupId && pending.sourceBranchId === RUN12.sourceId
    && pending.recoveryCertified === false && pending.deadlineAt === report.cleanupDeadlineAt,
  'prior_reviewed_cleanup_pending_mismatch');
  requireThat(receipt.schemaVersion === 'native-restore-cleanup-receipt-v1'
    && receipt.state === 'DELETED_AND_READBACK_VERIFIED' && receipt.cleanupRunId === RUN12.cleanupRunId
    && receipt.qualificationRunId === RUN12.runId && receipt.cleanupSha === RUN12.headSha
    && receipt.qualificationSha === RUN12.headSha && receipt.targetId === RUN12.targetId
    && receipt.pendingSha256 === RUN12.pendingSha256 && receipt.preDeleteBindingVerified === true
    && receipt.deleteAcknowledgment === 'ACKNOWLEDGED' && receipt.deletionVerified === true
    && receipt.recoveryCertified === false && receipt.blockers?.length === 0
    && receipt.deletionObservations?.length === 1 && receipt.deletionObservations[0].attempt === 1
    && receipt.deletionObservations[0].state === 'ABSENCE_VERIFIED'
    && receipt.finishedAt === '2026-10-26T17:44:30.829Z' && Date.parse(receipt.finishedAt) < Date.parse(pending.deadlineAt),
  'prior_reviewed_cleanup_receipt_mismatch');
  return { qualificationOutcome: 'FAILED', recoveryAcceptance: 'NOT_CERTIFIED', targetId: RUN12.targetId,
    cleanupOutcome: 'DELETED_AND_READBACK_VERIFIED', pendingSha256: RUN12.pendingSha256, receiptSha256: RUN12.receiptSha256 };
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

export async function verifyRun12ReviewedCleanup(run, read, env) {
  const human = env.GITHUB_REPOSITORY.split('/')[0];
  assertRun(run, env, false);
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
    const expected = RUN12_ARTIFACTS.filter(row => row.runId === runId);
    requireThat(object(artifacts) && artifacts.total_count === expected.length && Array.isArray(artifacts.artifacts)
      && artifacts.artifacts.length === expected.length
      && expected.every(pin => artifacts.artifacts.some(row => object(row) && row.id === pin.id && row.name === pin.name
        && row.size_in_bytes === pin.size && row.digest === pin.digest && row.expired === false
        && String(row.workflow_run?.id) === runId && row.workflow_run.repository_id === 1010752912
        && row.workflow_run.head_repository_id === 1010752912 && row.workflow_run.head_sha === RUN12.headSha)),
    'prior_reviewed_cleanup_artifact_mismatch');
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
  return { status: 'PINNED_REVIEWED_CLEANUP_RECONCILED', runId: RUN12.runId, runNumber: 12, runAttempt: 1,
    headSha: RUN12.headSha, backupId: RUN12.backupId, targetName: RUN12.targetName, targetId: RUN12.targetId,
    qualificationOutcome: 'FAILED', recoveryAcceptance: 'NOT_CERTIFIED', cleanupRunId: RUN12.cleanupRunId,
    cleanupWorkflowId: RUN12.cleanupWorkflowId, consumedCleanupRunNumber: 2, cleanupOutcome: 'DELETED_AND_READBACK_VERIFIED',
    evidenceBasis: 'PINNED_ARCHIVE_DIGESTS_AND_REVIEWED_OFFLINE_PAYLOAD_HASHES',
    qualificationSha256: RUN12.qualificationSha256, pendingSha256: RUN12.pendingSha256, receiptSha256: RUN12.receiptSha256 };
}
