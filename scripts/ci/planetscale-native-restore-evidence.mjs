import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { RESTORE, RestoreFailure, requireThat, object } from './planetscale-native-restore-contract.mjs';
import { hash0021RestoreEvidenceRecord, REQUIRED_0021_RESTORE_SCOPE } from './planetscale-0021-only-contract.mjs';

export const QUALIFICATION_WORKFLOW = '.github/workflows/planetscale-native-restore-check.yml';
export const CLEANUP_WORKFLOW = '.github/workflows/planetscale-native-restore-cleanup.yml';
export const RECORD_PATH = `docs/evidence/production-cutover/0021-restore-evidence/${RESTORE.backupId}.json`;
export const artifactPath = runId => `docs/evidence/production-cutover/0021-restore-evidence/artifacts/qualification-${runId}.json`;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const decimal = value => typeof value === 'string' && /^[1-9]\d{0,17}$/.test(value);

export function finalizeQualificationEvidence(directory, now = Date.now()) {
  const destination = path.join(directory, 'qualification.json');
  if (fs.existsSync(destination)) return sha256(fs.readFileSync(destination));
  const checkpoint = path.join(directory, 'checkpoint.json');
  requireThat(fs.existsSync(checkpoint), 'qualification_checkpoint_unavailable');
  const report = JSON.parse(fs.readFileSync(checkpoint, 'utf8'));
  requireThat(report.phase === 'qualification' && report.backupId === RESTORE.backupId && report.targetName === RESTORE.target,
    'qualification_checkpoint_invalid');
  report.status = 'INTERRUPTED_QUALIFICATION_REQUIRES_REVIEW'; report.qualificationOutcome = 'UNKNOWN';
  report.recoveryAcceptance = 'NOT_CERTIFIED'; report.verifiedScope = []; report.finishedAt = new Date(now).toISOString();
  report.costEscalationRequired = true;
  if (report.creation?.acknowledged === true && report.creation.id === report.createdTargetId) {
    report.state = 'TARGET_RETAINED_PENDING_REVIEW'; report.cleanup = 'TARGET_RETAINED_PENDING_REVIEW';
  }
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 }); return sha256(bytes);
}

export async function githubRead(env, suffix, fetchImpl = fetch) {
  requireThat(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/Lythaus$/.test(env.GITHUB_REPOSITORY ?? '') && env.GH_TOKEN,
    'github_read_context_invalid');
  requireThat(/^\/(?:actions|pulls|issues|compare|git)\//.test(suffix), 'github_evidence_path_invalid');
  const url = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}${suffix}`;
  let response;
  try { response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json' } }); }
  catch { throw new RestoreFailure('github_evidence_transport_failed'); }
  requireThat(response.status === 200 && !response.redirected && (!response.url || response.url === url), 'github_evidence_read_failed');
  const chunks = []; let size = 0;
  try {
    for await (const chunk of response.body) { size += chunk.byteLength; if (size > 1048576) throw new Error(); chunks.push(chunk); }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch { throw new RestoreFailure('github_evidence_response_invalid'); }
}

export async function inspectCleanupReservation(env, read = suffix => githubRead(env, suffix)) {
  const workflow = await read(`/actions/workflows/${path.posix.basename(CLEANUP_WORKFLOW)}`);
  requireThat(Number.isSafeInteger(workflow.id) && workflow.id > 0 && workflow.path === CLEANUP_WORKFLOW
    && workflow.state === 'active', 'cleanup_workflow_identity_unavailable');
  const history = await read(`/actions/workflows/${workflow.id}/runs?per_page=100`);
  requireThat(Number.isInteger(history.total_count) && history.total_count <= 100 && Array.isArray(history.workflow_runs)
    && history.workflow_runs.length === history.total_count, 'cleanup_reservation_history_incomplete');
  const numbers = history.workflow_runs.map(run => run.run_number);
  requireThat(numbers.every(value => Number.isSafeInteger(value) && value > 0) && new Set(numbers).size === numbers.length,
    'cleanup_run_numbers_invalid');
  return { workflowId: workflow.id, runNumber: Math.max(0, ...numbers) + 1 };
}

export function readTrackedEvidence(root, qualificationRunId, git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })) {
  requireThat(decimal(qualificationRunId), 'qualification_run_id_invalid');
  const read = relative => {
    const file = path.join(root, relative), entry = git(['ls-files', '--stage', '--', relative]).trim();
    requireThat(/^100644 [a-f0-9]{40} 0\t/.test(entry) && entry.endsWith('\t' + relative), 'canonical_evidence_not_tracked_regular_file');
    const stat = fs.lstatSync(file);
    requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 1048576, 'canonical_evidence_file_invalid');
    requireThat(fs.realpathSync(file) === path.join(fs.realpathSync(root), relative), 'canonical_evidence_path_indirection');
    const bytes = fs.readFileSync(file);
    const committed = git(['show', `HEAD:${relative}`]);
    requireThat(Buffer.from(committed).equals(bytes), 'canonical_evidence_worktree_modified');
    return bytes;
  };
  const recordBytes = read(RECORD_PATH), bytes = read(artifactPath(qualificationRunId));
  let record, report;
  try { record = JSON.parse(recordBytes); report = JSON.parse(bytes); } catch { throw new RestoreFailure('canonical_evidence_json_invalid'); }
  return { record, report, recordBytes, bytes };
}

export function validateCleanupEvidence({ record, report, bytes, qualificationRunId, now, reconcile = false }) {
  const intent = record?.nativeRestoreCleanup, creation = report?.creation;
  requireThat(object(record) && record.schemaVersion === 'lythaus-0021-restore-evidence-v1'
    && record.recordSha256 === hash0021RestoreEvidenceRecord(record) && digest(record.evidenceSha256)
    && record.evidenceSha256 === sha256(bytes) && record.artifactPath === artifactPath(qualificationRunId), 'canonical_evidence_hash_or_path_mismatch');
  requireThat(record.sourceBranch?.id === RESTORE.sourceId && record.sourceBranch.name === 'main'
    && record.selectedBackupId === RESTORE.backupId && report.sourceBranchId === RESTORE.sourceId
    && report.backupId === RESTORE.backupId && report.targetName === RESTORE.target, 'canonical_source_or_backup_mismatch');
  requireThat(decimal(qualificationRunId) && report.runId === qualificationRunId && sha(report.sourceMainSha)
    && report.phase === 'qualification' && report.state === 'TARGET_RETAINED_PENDING_REVIEW'
    && report.cleanup === 'TARGET_RETAINED_PENDING_REVIEW' && report.recoveryAcceptance === 'NOT_CERTIFIED', 'qualification_not_retained_or_proven');
  requireThat(creation?.acknowledged === true && creation.id === report.createdTargetId && creation.id !== RESTORE.sourceId
    && /^[a-z0-9]{1,64}$/.test(creation.id) && creation.name === RESTORE.target && creation.sourceBranchId === RESTORE.sourceId
    && creation.kind === 'postgresql' && creation.default === false
    && record.restoredBranch?.id === creation.id && record.restoredBranch.name === RESTORE.target
    && record.restoredBranch.createdAt === creation.createdAt && ['ready','retained'].includes(record.restoredBranch.state)
    && report.providerMutations?.filter(item => item.action === 'create_fixed_restore' && item.outcome === 'ACKNOWLEDGED').length === 1,
  'original_acknowledged_creation_required');
  requireThat(object(intent) && intent.schemaVersion === 'native-restore-cleanup-intent-v1' && intent.state === 'DELETE_PENDING'
    && intent.qualificationSha === report.sourceMainSha && intent.qualificationRunId === qualificationRunId
    && intent.targetId === creation.id && intent.workflowId === report.cleanupPermit?.workflowId
    && intent.runNumber === report.cleanupPermit?.runNumber && Number.isSafeInteger(intent.workflowId) && intent.workflowId > 0
    && Number.isSafeInteger(intent.runNumber) && intent.runNumber > 0
    && decimal(String(intent.qualificationWorkflowId)) && decimal(String(intent.artifactId))
    && digest(intent.artifactArchiveSha256) && intent.evidenceOutcome === report.qualificationOutcome,
  'immutable_one_use_cleanup_intent_required');
  const verified = Date.parse(record.verifiedAt), finished = Date.parse(report.finishedAt), reviewed = Date.parse(record.review?.reviewedAt);
  requireThat(Number.isFinite(verified) && verified === Date.parse(report.verifiedAt ?? report.finishedAt)
    && Number.isFinite(finished) && Number.isFinite(reviewed) && reviewed >= finished && reviewed <= now
    && /^[A-Za-z0-9-]{1,39}$/.test(record.review?.reviewedBy ?? '')
    && typeof record.review.reference === 'string' && record.review.reference.length >= 8, 'canonical_review_missing_or_invalid');
  requireThat(Array.isArray(record.verifiedScope) && Array.isArray(record.unresolvedGates)
    && record.verifiedScope.every(scope => REQUIRED_0021_RESTORE_SCOPE.includes(scope))
    && record.unresolvedGates.every(scope => REQUIRED_0021_RESTORE_SCOPE.includes(scope)), 'canonical_scope_invalid');
  if (report.qualificationOutcome !== 'PASSED') requireThat(record.verifiedScope.length === 0
    && REQUIRED_0021_RESTORE_SCOPE.every(scope => record.unresolvedGates.includes(scope)), 'failure_evidence_cannot_certify_recovery');
  requireThat(['PASSED', 'FAILED', 'UNKNOWN'].includes(report.qualificationOutcome), 'qualification_outcome_invalid');
  const deadline = Date.parse(report.cleanupDeadlineAt), created = Date.parse(creation.createdAt), started = Date.parse(report.startedAt);
  requireThat(Number.isFinite(started) && Number.isFinite(deadline) && Number.isFinite(created)
    && deadline === started + RESTORE.maximumMs && created >= started - 60000 && created <= finished
    && Date.parse(report.escalationAt) === started + 45 * 60000
    && Date.parse(report.reviewByAt) === started + 60 * 60000
    && Date.parse(report.cleanupStartByAt) === started + 105 * 60000, 'phase_deadline_invalid');
  if (!reconcile) requireThat(now < deadline - 60000 && now < Date.parse(report.approvalExpiresAt), 'cleanup_phase_deadline_expired');
  return { intent, creation, deadline };
}

export function reviewAttestation(evidenceSha, record, report) {
  return `I reviewed native restore evidence ${record.recordSha256} at ${evidenceSha} for target ${report.createdTargetId}. `
    + `I approve one cleanup attempt ${record.nativeRestoreCleanup.workflowId}/${record.nativeRestoreCleanup.runNumber}. `
    + `Qualification outcome: ${report.qualificationOutcome}. This does not certify recovery.`;
}

export async function verifyReviewedEvidence({ env, evidenceSha, prNumber, commentId, evidence, read = suffix => githubRead(env, suffix) }) {
  requireThat(sha(evidenceSha) && decimal(prNumber) && decimal(commentId), 'review_binding_inputs_invalid');
  const { record, report } = evidence;
  const pr = await read(`/pulls/${prNumber}`);
  requireThat(pr.head?.repo?.id === 1010752912 && pr.head.sha === evidenceSha
    && ['open','closed'].includes(pr.state), 'reviewed_evidence_commit_mismatch');
  const comparison = await read(`/compare/${report.sourceMainSha}...${evidenceSha}`);
  const allowed = new Set([RECORD_PATH, artifactPath(report.runId)]);
  requireThat(comparison.merge_base_commit?.sha === report.sourceMainSha && Array.isArray(comparison.files)
    && comparison.files.length === 2 && comparison.files.every(file => allowed.has(file.filename) && ['added','modified'].includes(file.status)),
  'evidence_commit_must_contain_only_canonical_data');
  const comment = await read(`/issues/comments/${commentId}`);
  requireThat(comment.user?.type === 'User' && comment.user.login === record.review.reviewedBy
    && comment.issue_url === `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues/${prNumber}`
    && comment.body === reviewAttestation(evidenceSha, record, report) && comment.created_at === comment.updated_at
    && Date.parse(comment.created_at) >= Date.parse(record.review.reviewedAt)
    && Date.parse(comment.created_at) <= Date.parse(report.reviewByAt), 'exact_human_evidence_review_required');
  return { evidenceSha, recordSha256: record.recordSha256, reviewer: comment.user.login, commentId };
}
