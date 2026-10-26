import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { RESTORE, requireThat, RestoreFailure } from './planetscale-native-restore-contract.mjs';
import { githubReadiness } from './planetscale-native-restore-check.mjs';
import { githubRead, validateCleanupEvidence, QUALIFICATION_WORKFLOW, CLEANUP_WORKFLOW,
  RECORD_PATH, artifactPath, decimal, sha256 } from './planetscale-native-restore-evidence.mjs';
import { assertUploadedArtifact } from './planetscale-native-restore-cleanup.mjs';

export const REVIEWED_CLEANUP_POLICY_STATUS = 'REVIEWED_EVIDENCE_REQUIRES_SEPARATE_ACTION_APPROVAL';
const repositoryId = 1010752912, qualificationWorkflowId = 394786946;
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const maxDataBytes = 256 * 1024;

export function unmergedCleanupAttestation(headSha, record, report) {
  return `I reviewed unmerged native restore evidence ${record.recordSha256} at PR head ${headSha}, `
    + `qualification bytes ${record.evidenceSha256}, for target ${report.createdTargetId}. `
    + `I approve one cleanup attempt ${record.nativeRestoreCleanup.workflowId}/${record.nativeRestoreCleanup.runNumber}. `
    + `Qualification outcome: ${report.qualificationOutcome}. This does not certify recovery.`;
}

function assertPinnedPr(pr, env, report, reconcile = false) {
  requireThat(pr?.number === Number(env.EVIDENCE_PR) && pr.state === 'open' && pr.merged === false
    && pr.head?.sha === env.EVIDENCE_SHA && pr.head.repo?.id === repositoryId
    && pr.head.repo.full_name === env.GITHUB_REPOSITORY && pr.base?.repo?.id === repositoryId
    && pr.base.repo.full_name === env.GITHUB_REPOSITORY && pr.base.ref === 'main'
    && (reconcile || pr.base.sha === report.sourceMainSha && pr.changed_files === 2),
  'reviewed_unmerged_pr_binding_invalid');
}

function assertPinnedComment(comment, env, record, report) {
  requireThat(comment?.id === Number(env.REVIEW_COMMENT_ID) && comment.user?.type === 'User'
    && comment.user.login === record.review.reviewedBy && comment.user.login === report.reviewWindow.reviewer
    && comment.issue_url === `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues/${env.EVIDENCE_PR}`
    && comment.body === unmergedCleanupAttestation(env.EVIDENCE_SHA, record, report)
    && comment.created_at === comment.updated_at
    && Date.parse(comment.created_at) >= Date.parse(record.review.reviewedAt)
    && Date.parse(comment.created_at) <= Date.parse(report.reviewByAt), 'reviewed_exact_human_review_required');
}

async function readBlob(file, read) {
  requireThat(sha(file.sha), 'reviewed_data_blob_identity_invalid');
  const blob = await read(`/git/blobs/${file.sha}`);
  requireThat(blob?.sha === file.sha && blob.encoding === 'base64' && Number.isSafeInteger(blob.size)
    && blob.size > 0 && blob.size <= maxDataBytes && typeof blob.content === 'string'
    && blob.content.length <= maxDataBytes * 2, 'reviewed_data_blob_invalid');
  const encoded = blob.content.replace(/\n/g, '');
  requireThat(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded),
    'reviewed_data_blob_invalid');
  const bytes = Buffer.from(encoded, 'base64');
  const gitSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  requireThat(bytes.length === blob.size && gitSha === file.sha, 'reviewed_data_blob_hash_mismatch');
  return bytes;
}

async function assertRegularDataFiles(headSha, files, read) {
  const commit = await read(`/git/commits/${headSha}`);
  requireThat(commit?.sha === headSha && sha(commit.tree?.sha), 'reviewed_pinned_commit_invalid');
  const trees = new Map();
  for (const file of files) {
    let treeSha = commit.tree.sha;
    const segments = file.filename.split('/');
    for (let index = 0; index < segments.length; index++) {
      if (!trees.has(treeSha)) trees.set(treeSha, await read(`/git/trees/${treeSha}`));
      const tree = trees.get(treeSha);
      requireThat(tree?.sha === treeSha && tree.truncated === false && Array.isArray(tree.tree)
        && tree.tree.length <= 10000, 'reviewed_pinned_tree_invalid');
      const matches = tree.tree.filter(entry => entry.path === segments[index]);
      requireThat(matches.length === 1 && sha(matches[0].sha), 'reviewed_pinned_path_invalid');
      const entry = matches[0];
      if (index === segments.length - 1) requireThat(entry.type === 'blob' && entry.mode === '100644'
        && entry.sha === file.sha, 'reviewed_data_must_be_regular_file');
      else {
        requireThat(entry.type === 'tree' && entry.mode === '040000', 'reviewed_pinned_path_indirection');
        treeSha = entry.sha;
      }
    }
  }
}

function assertConsent(env, record, report, now) {
  let consent;
  try { consent = JSON.parse(env.CLEANUP_APPROVAL_JSON); }
  catch { throw new RestoreFailure('separate_cleanup_owner_approval_required'); }
  requireThat(consent?.action === 'delete_only_original_acknowledged_target_once'
    && consent.cleanupSha === env.RELEASE_SHA && consent.evidenceSha === env.EVIDENCE_SHA
    && consent.qualificationRunId === report.runId && consent.targetId === report.createdTargetId
    && consent.recordSha256 === record.recordSha256 && consent.operator === report.reviewWindow.operator
    && consent.maximumUsd === RESTORE.maximumUsd && typeof consent.reference === 'string' && consent.reference.length >= 8
    && Date.parse(consent.expiresAt) > now && Date.parse(consent.expiresAt) <= Date.parse(report.cleanupDeadlineAt),
  'cleanup_owner_approval_binding_invalid');
}

export async function proveReviewedCleanupContext({ env, evidence, evidenceHead, now = Date.now(), reconcile = false,
  read = suffix => githubRead(env, suffix), assertMain = () => githubReadiness(env) }) {
  await assertMain();
  const { report, record, bytes, recordBytes } = evidence;
  requireThat(sha(env.EVIDENCE_SHA) && evidenceHead === env.EVIDENCE_SHA
    && sha(env.RELEASE_SHA) && (reconcile || env.RELEASE_SHA === report.sourceMainSha) && env.EVIDENCE_SHA !== env.RELEASE_SHA
    && decimal(env.EVIDENCE_PR) && decimal(env.REVIEW_COMMENT_ID) && decimal(env.QUALIFICATION_RUN_ID)
    && decimal(env.GITHUB_RUN_ID) && decimal(env.GITHUB_RUN_NUMBER) && env.GITHUB_RUN_ATTEMPT === '1',
  'reviewed_cleanup_execution_context_invalid');
  const { intent, creation, deadline } = validateCleanupEvidence({ ...evidence,
    qualificationRunId: env.QUALIFICATION_RUN_ID, now, reconcile });
  if (reconcile) {
    const lineage = await read(`/compare/${report.sourceMainSha}...${env.RELEASE_SHA}`);
    requireThat(lineage.merge_base_commit?.sha === report.sourceMainSha,
      'reviewed_qualification_not_in_protected_main_history');
  }
  requireThat(report.mode === 'execute' && intent.qualificationWorkflowId === qualificationWorkflowId
    && report.providerMutations.filter(row => row.action === 'create_fixed_restore').length === 1,
  'reviewed_original_qualification_required');
  requireThat(record.review.reviewedBy === report.reviewWindow.reviewer
    && Date.parse(record.review.reviewedAt) <= Date.parse(report.reviewByAt), 'reserved_review_window_not_met');

  const pr = await read(`/pulls/${env.EVIDENCE_PR}`);
  assertPinnedPr(pr, env, report, reconcile);
  const comparison = await read(`/compare/${report.sourceMainSha}...${env.EVIDENCE_SHA}`);
  const paths = [RECORD_PATH, artifactPath(report.runId)];
  requireThat(comparison.merge_base_commit?.sha === report.sourceMainSha && comparison.status === 'ahead'
    && comparison.ahead_by >= 1 && Array.isArray(comparison.files) && comparison.files.length === 2
    && new Set(comparison.files.map(file => file.filename)).size === 2
    && comparison.files.every(file => paths.includes(file.filename) && ['added', 'modified'].includes(file.status)),
  'reviewed_pr_must_contain_only_canonical_data');
  await assertRegularDataFiles(env.EVIDENCE_SHA, comparison.files, read);
  const recordData = await readBlob(comparison.files.find(file => file.filename === RECORD_PATH), read);
  const qualificationData = await readBlob(comparison.files.find(file => file.filename === artifactPath(report.runId)), read);
  let parsedRecord, parsedReport;
  try { parsedRecord = JSON.parse(recordData); parsedReport = JSON.parse(qualificationData); }
  catch { throw new RestoreFailure('reviewed_pinned_data_json_invalid'); }
  requireThat(Buffer.isBuffer(bytes) && bytes.equals(qualificationData) && sha256(qualificationData) === record.evidenceSha256
    && Buffer.isBuffer(recordBytes) && recordBytes.equals(recordData)
    && isDeepStrictEqual(parsedReport, report) && isDeepStrictEqual(parsedRecord, record),
  'reviewed_pinned_data_bytes_mismatch');
  assertPinnedComment(await read(`/issues/comments/${env.REVIEW_COMMENT_ID}`), env, record, report);

  const original = await read(`/actions/runs/${report.runId}`);
  requireThat(original.id === Number(report.runId) && original.workflow_id === qualificationWorkflowId
    && original.head_sha === report.sourceMainSha && original.head_branch === 'main' && original.path === QUALIFICATION_WORKFLOW
    && original.event === 'workflow_dispatch' && original.run_attempt === 1 && original.status === 'completed'
    && original.repository?.id === repositoryId && original.repository.full_name === env.GITHUB_REPOSITORY
    && original.head_repository?.id === repositoryId
    && (report.qualificationOutcome === 'PASSED' ? original.conclusion === 'success'
      : ['failure', 'cancelled', 'timed_out'].includes(original.conclusion)), 'qualification_run_provenance_invalid');
  const jobs = await read(`/actions/runs/${report.runId}/jobs?per_page=100`);
  requireThat(jobs.total_count === jobs.jobs?.length && jobs.total_count <= 100
    && jobs.jobs.some(job => job.name === 'Qualify isolated native restore without cleanup'
      && job.run_id === Number(report.runId) && job.run_attempt === 1 && job.head_sha === report.sourceMainSha
      && job.status === 'completed' && job.steps?.some(step => step.name === 'Upload immutable qualification evidence'
        && step.conclusion === 'success')), 'qualification_upload_failed_or_unproven');
  const uploaded = await read(`/actions/artifacts/${intent.artifactId}`);
  assertUploadedArtifact(uploaded, { id: intent.artifactId, runId: report.runId,
    name: `native-restore-qualification-${report.sourceMainSha}-${report.runId}`, archiveSha256: intent.artifactArchiveSha256 });
  requireThat(uploaded.workflow_run.repository_id === repositoryId && uploaded.workflow_run.head_sha === report.sourceMainSha,
    'reviewed_artifact_provenance_invalid');
  const originalApprovals = await read(`/actions/runs/${report.runId}/approvals`);
  const approved = rows => Array.isArray(rows) && rows.some(row => row.state === 'approved'
    && row.user?.type === 'User' && row.user.login === report.reviewWindow.operator
    && row.environments?.some(environment => environment.name === 'production'));
  requireThat(approved(originalApprovals), 'reviewed_human_qualification_review_required');
  const current = await read(`/actions/runs/${env.GITHUB_RUN_ID}`);
  requireThat(current.id === Number(env.GITHUB_RUN_ID) && current.workflow_id === intent.workflowId
    && current.head_sha === env.RELEASE_SHA && current.head_branch === 'main' && current.path === CLEANUP_WORKFLOW
    && current.event === 'workflow_dispatch' && current.run_attempt === 1
    && current.run_number === Number(env.GITHUB_RUN_NUMBER) && current.repository?.id === repositoryId,
  'cleanup_workflow_identity_invalid');
  requireThat(approved(await read(`/actions/runs/${env.GITHUB_RUN_ID}/approvals`)), 'human_cleanup_production_review_required');
  if (!reconcile) {
    requireThat(current.run_number === intent.runNumber, 'cleanup_permit_consumed_or_wrong_run_number');
    requireThat(now < Date.parse(report.cleanupStartByAt), 'cleanup_start_window_missed');
    assertConsent(env, record, report, now);
  }
  const assertEvidenceUnchanged = async () => {
    assertPinnedPr(await read(`/pulls/${env.EVIDENCE_PR}`), env, report, reconcile);
    assertPinnedComment(await read(`/issues/comments/${env.REVIEW_COMMENT_ID}`), env, record, report);
  };
  await assertEvidenceUnchanged();
  return { intent, creation, deadline, report, record, current, reviewer: record.review.reviewedBy,
    evidence, assertEvidenceUnchanged, policyStatus: REVIEWED_CLEANUP_POLICY_STATUS };
}
