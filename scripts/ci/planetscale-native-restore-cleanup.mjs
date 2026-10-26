import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { RESTORE, RestoreCleanupApi, RestoreFailure, requireThat, failureCode, checkOwnedBranch } from './planetscale-native-restore-contract.mjs';
import { githubReadiness } from './planetscale-native-restore-check.mjs';
import { githubRead, readTrackedEvidence, validateCleanupEvidence, verifyReviewedEvidence,
  QUALIFICATION_WORKFLOW, CLEANUP_WORKFLOW, RECORD_PATH, artifactPath, decimal, sha256 } from './planetscale-native-restore-evidence.mjs';

const targetPath = `/branches/${RESTORE.target}`, backupPath = `/branches/main/backups/${RESTORE.backupId}`;
const encode = value => JSON.stringify(value, null, 2) + '\n';
const artifactName = report => `native-restore-qualification-${report.sourceMainSha}-${report.runId}`;
export const pendingName = (report, intent) => `native-restore-cleanup-pending-${report.runId}-${report.createdTargetId}-${intent.runNumber}`;

export function assertUploadedArtifact(artifact, { id, runId, name, archiveSha256 }) {
  requireThat(artifact?.id === Number(id) && artifact.name === name && artifact.expired === false
    && artifact.workflow_run?.id === Number(runId) && artifact.digest === `sha256:${archiveSha256}`
    && Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 1048576,
  'immutable_uploaded_artifact_proof_required');
}

export function assertDownloadedQualification(evidence, downloaded) {
  requireThat(Buffer.isBuffer(downloaded) && downloaded.equals(evidence.bytes)
    && sha256(downloaded) === evidence.record.evidenceSha256, 'downloaded_qualification_artifact_mismatch');
}

function cleanupConsent(env, evidence, now) {
  let consent;
  try { consent = JSON.parse(env.CLEANUP_APPROVAL_JSON); } catch { throw new RestoreFailure('separate_cleanup_owner_approval_required'); }
  const { record, report } = evidence;
  requireThat(consent?.action === 'delete_only_original_acknowledged_target_once'
    && consent.cleanupSha === env.RELEASE_SHA && consent.evidenceSha === env.EVIDENCE_SHA
    && consent.qualificationRunId === report.runId && consent.targetId === report.createdTargetId
    && consent.recordSha256 === record.recordSha256 && consent.operator === report.reviewWindow?.operator
    && consent.maximumUsd === 5 && typeof consent.reference === 'string' && consent.reference.length >= 8
    && Date.parse(consent.expiresAt) > now && Date.parse(consent.expiresAt) <= Date.parse(report.cleanupDeadlineAt),
  'cleanup_owner_approval_binding_invalid');
  return consent;
}

export async function proveCleanupContext({ env, evidence, now = Date.now(), reconcile = false,
  read = suffix => githubRead(env, suffix), assertMain = () => githubReadiness(env), evidenceHead }) {
  await assertMain();
  requireThat(/^[a-f0-9]{40}$/.test(env.EVIDENCE_SHA ?? '') && evidenceHead === env.EVIDENCE_SHA && (reconcile || env.EVIDENCE_SHA === env.RELEASE_SHA)
    && decimal(env.QUALIFICATION_RUN_ID ?? '') && decimal(env.GITHUB_RUN_ID ?? '')
    && decimal(env.GITHUB_RUN_NUMBER ?? '') && env.GITHUB_RUN_ATTEMPT === '1', 'cleanup_execution_context_invalid');
  const { intent, creation, deadline } = validateCleanupEvidence({ ...evidence, qualificationRunId: env.QUALIFICATION_RUN_ID, now, reconcile });
  const { report, record } = evidence;
  const reviewer = record.review?.reviewedBy ?? null;
  if (reconcile) {
    const lineage = await read(`/compare/${env.EVIDENCE_SHA}...${env.RELEASE_SHA}`);
    requireThat(lineage.merge_base_commit?.sha === env.EVIDENCE_SHA, 'reconciliation_evidence_not_in_protected_main_history');
  } else {
    await verifyReviewedEvidence({ env, evidenceSha: env.EVIDENCE_SHA, prNumber: env.EVIDENCE_PR,
      commentId: env.REVIEW_COMMENT_ID, evidence, read });
    requireThat(reviewer === report.reviewWindow?.reviewer && Date.parse(record.review.reviewedAt) <= Date.parse(report.reviewByAt),
      'reserved_review_window_not_met');
    const sourceDelta = await read(`/compare/${report.sourceMainSha}...${env.RELEASE_SHA}`);
    requireThat(sourceDelta.merge_base_commit?.sha === report.sourceMainSha && Array.isArray(sourceDelta.files)
      && sourceDelta.files.every(file => [RECORD_PATH, artifactPath(report.runId)].includes(file.filename)),
    'cleanup_code_changed_since_qualification');
  }
  const original = await read(`/actions/runs/${report.runId}`);
  requireThat(original.id === Number(report.runId) && original.workflow_id === intent.qualificationWorkflowId
    && original.head_sha === report.sourceMainSha && original.head_branch === 'main' && original.path === QUALIFICATION_WORKFLOW
    && original.event === 'workflow_dispatch' && original.run_attempt === 1 && original.status === 'completed'
    && original.repository?.id === 1010752912, 'qualification_run_provenance_invalid');
  const jobs = await read(`/actions/runs/${report.runId}/jobs?per_page=100`);
  requireThat(jobs.total_count === jobs.jobs?.length && jobs.total_count <= 100
    && jobs.jobs.some(job => job.name === 'Qualify isolated native restore without cleanup'
      && job.status === 'completed' && job.steps?.some(step => step.name === 'Upload immutable qualification evidence'
        && step.conclusion === 'success')), 'qualification_upload_failed_or_unproven');
  const uploaded = await read(`/actions/artifacts/${intent.artifactId}`);
  assertUploadedArtifact(uploaded, { id: intent.artifactId, runId: report.runId,
    name: artifactName(report), archiveSha256: intent.artifactArchiveSha256 });
  const current = await read(`/actions/runs/${env.GITHUB_RUN_ID}`);
  requireThat(current.id === Number(env.GITHUB_RUN_ID) && Number.isSafeInteger(current.workflow_id) && current.workflow_id > 0
    && (reconcile || current.workflow_id === intent.workflowId)
    && current.head_sha === env.RELEASE_SHA && current.head_branch === 'main' && current.path === CLEANUP_WORKFLOW
    && current.event === 'workflow_dispatch' && current.run_attempt === 1
    && current.run_number === Number(env.GITHUB_RUN_NUMBER) && current.repository?.id === 1010752912,
  'cleanup_workflow_identity_invalid');
  const approvals = await read(`/actions/runs/${env.GITHUB_RUN_ID}/approvals`);
  requireThat(Array.isArray(approvals) && approvals.some(row => row.state === 'approved'
    && row.user?.type === 'User' && row.user.login === report.reviewWindow.operator
    && row.environments?.some(environment => environment.name === 'production')), 'human_cleanup_production_review_required');
  if (!reconcile) {
    requireThat(current.run_number === intent.runNumber, 'cleanup_permit_consumed_or_wrong_run_number');
    requireThat(now < Date.parse(report.cleanupStartByAt), 'cleanup_start_window_missed');
    cleanupConsent(env, evidence, now);
  }
  return { intent, creation, deadline, report, record, current, reviewer };
}

export function pendingReceipt(context, env) {
  return { schemaVersion: 'native-restore-cleanup-attempt-v1', state: 'DELETE_PENDING',
    qualificationSha: context.report.sourceMainSha, qualificationRunId: context.report.runId,
    evidenceSha: env.EVIDENCE_SHA, recordSha256: context.record.recordSha256,
    cleanupSha: env.RELEASE_SHA, cleanupRunId: env.GITHUB_RUN_ID,
    workflowId: context.intent.workflowId, runNumber: context.intent.runNumber, attempt: 1,
    sourceBranchId: RESTORE.sourceId, backupId: RESTORE.backupId, targetId: context.creation.id,
    targetName: RESTORE.target, targetCreatedAt: context.creation.createdAt,
    deadlineAt: context.report.cleanupDeadlineAt, recoveryCertified: false };
}

export async function provePendingUpload({ env, context, pendingBytes, downloadedBytes, read = suffix => githubRead(env, suffix) }) {
  const expected = Buffer.from(encode(pendingReceipt(context, env)));
  requireThat(Buffer.isBuffer(pendingBytes) && Buffer.isBuffer(downloadedBytes)
    && pendingBytes.equals(expected) && downloadedBytes.equals(expected), 'pending_attempt_bytes_mismatch');
  requireThat(decimal(env.PENDING_ARTIFACT_ID ?? '') && /^[a-f0-9]{64}$/.test(env.PENDING_ARTIFACT_DIGEST ?? ''),
    'pending_attempt_upload_not_acknowledged');
  const artifact = await read(`/actions/artifacts/${env.PENDING_ARTIFACT_ID}`);
  assertUploadedArtifact(artifact, { id: env.PENDING_ARTIFACT_ID, runId: env.GITHUB_RUN_ID,
    name: pendingName(context.report, context.intent), archiveSha256: env.PENDING_ARTIFACT_DIGEST });
  return sha256(expected);
}

function deletionTimestampValid(branch, context, now) {
  const value = branch?.deleted_at, time = typeof value === 'string' ? Date.parse(value) : NaN;
  return branch?.id === context.creation.id && branch.name === RESTORE.target && branch.kind === 'postgresql'
    && branch.default === false && branch.restored_from_branch?.id === RESTORE.sourceId
    && branch.created_at === context.creation.createdAt && typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    && Number.isFinite(time) && time >= Date.parse(context.creation.createdAt) && time <= now
    && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19);
}

export async function observeOwnedTarget(api, context, now, allowDeleted = false, allowPresent = false, signal) {
  let present = false;
  const branch = await api.request(targetPath, { absent: allowDeleted, signal });
  signal?.throwIfAborted();
  if (branch === null) {
    requireThat(allowDeleted, 'owned_target_absence_not_expected');
  } else if (!(allowDeleted && deletionTimestampValid(branch, context, now))) {
    checkOwnedBranch(branch, context.creation.id);
    requireThat(branch.created_at === context.creation.createdAt, 'owned_target_creation_timestamp_changed');
    if (allowDeleted && !allowPresent) throw new RestoreFailure('target_deletion_not_confirmed');
    present = true;
  }
  if (!allowPresent) {
    const backup = await api.request(backupPath, { signal });
    signal?.throwIfAborted();
    requireThat(backup.id === RESTORE.backupId && backup.database_branch?.id === RESTORE.sourceId
      && backup.database_branch.name === 'main', 'cleanup_backup_identity_changed');
    if (!allowDeleted) requireThat(backup.protected === true && backup.restored_branches?.some(row => row.id === context.creation.id
      && row.name === RESTORE.target), 'cleanup_backup_binding_changed');
  }
  if (allowDeleted && !present) {
    const inventory = await api.list('/branches', { signal });
    signal?.throwIfAborted();
    for (const row of inventory.filter(row => row.id === context.creation.id || row.name === RESTORE.target)) {
      requireThat(deletionTimestampValid(row, context, now), 'target_identity_still_present_or_replaced');
    }
  }
  return { targetId: context.creation.id, present, absent: branch === null, deletionObserved: allowDeleted && !present };
}

export async function deleteReviewedTarget({ env, evidence, evidenceHead, downloadedQualification, pendingBytes, downloadedPending,
  read = suffix => githubRead(env, suffix), assertMain, api = new RestoreCleanupApi(env.PLANETSCALE_RESTORE_API_TOKEN),
  now = Date.now, checkpoint = () => {}, sleep = milliseconds => delay(milliseconds) }) {
  const receipt = { schemaVersion: 'native-restore-cleanup-receipt-v1', phase: 'cleanup', state: 'NOT_ATTEMPTED',
    cleanupSha: env.RELEASE_SHA, cleanupRunId: env.GITHUB_RUN_ID, qualificationRunId: env.QUALIFICATION_RUN_ID,
    providerMutations: false, deletionVerified: false, recoveryCertified: false, blockers: [] };
  let attempted = false, context;
  try {
    context = await proveCleanupContext({ env, evidence, evidenceHead, now: now(), read, assertMain });
    assertDownloadedQualification(evidence, downloadedQualification);
    receipt.pendingSha256 = await provePendingUpload({ env, context, pendingBytes, downloadedBytes: downloadedPending, read });
    receipt.targetId = context.creation.id; receipt.qualificationSha = context.report.sourceMainSha;
    await api.authority(() => {}, false, context.deadline);
    await observeOwnedTarget(api, context, now()); receipt.preDeleteBindingVerified = true;
    requireThat(now() < context.deadline - 60000, 'cleanup_phase_deadline_expired');
    receipt.state = 'DELETE_PENDING'; await checkpoint(structuredClone(receipt));
    if (assertMain) await assertMain(); else await githubReadiness(env);
    const finalTarget = await api.request(targetPath);
    checkOwnedBranch(finalTarget, context.creation.id);
    requireThat(finalTarget.created_at === context.creation.createdAt, 'owned_target_creation_timestamp_changed');
    const deleteAt = now();
    requireThat(deleteAt < context.deadline - 60000 && deleteAt < Date.parse(context.report.approvalExpiresAt),
      'cleanup_phase_deadline_expired');
    cleanupConsent(env, evidence, deleteAt);
    attempted = true; receipt.providerMutations = true;
    let deleteError;
    try { await api.request(targetPath, { method: 'DELETE' }); receipt.deleteAcknowledgment = 'ACKNOWLEDGED'; }
    catch (error) { deleteError = error; receipt.deleteAcknowledgment = 'UNKNOWN_OR_DENIED'; receipt.blockers.push(failureCode(error)); }
    receipt.deletionObservations = [];
    let absent = false;
    for (let attempt = 1; attempt <= 12 && now() < context.deadline; attempt++) {
      const signal = AbortSignal.timeout(Math.max(1, Math.min(15000, context.deadline - now())));
      const observation = await observeOwnedTarget(api, context, now(), true, true, signal);
      receipt.deletionObservations.push({ attempt, observedAt: new Date(now()).toISOString(),
        state: observation.present ? 'PRESENT' : 'ABSENCE_VERIFIED' });
      if (observation.deletionObserved) { absent = true; break; }
      if (attempt < 12) await sleep(Math.min(5000, Math.max(0, context.deadline - now())));
    }
    requireThat(absent, 'target_deletion_not_confirmed');
    receipt.state = deleteError ? 'DELETED_READBACK_VERIFIED_ACK_UNCERTAIN' : 'DELETED_AND_READBACK_VERIFIED';
    receipt.deletionVerified = true;
  } catch (error) {
    receipt.blockers.push(failureCode(error));
    receipt.state = attempted ? 'DELETE_OUTCOME_UNCERTAIN_READ_ONLY_RECONCILIATION_REQUIRED' : 'BLOCKED_WITHOUT_DELETE';
  }
  receipt.finishedAt = new Date(now()).toISOString();
  await checkpoint(structuredClone(receipt)); return receipt;
}

export async function reconcileReviewedTarget({ env, evidence, evidenceHead, downloadedQualification, read = suffix => githubRead(env, suffix), assertMain,
  api = new RestoreCleanupApi(env.PLANETSCALE_RESTORE_API_TOKEN), now = Date.now }) {
  const receipt = { schemaVersion: 'native-restore-cleanup-receipt-v1', phase: 'read-only-reconciliation',
    cleanupSha: env.RELEASE_SHA, cleanupRunId: env.GITHUB_RUN_ID, qualificationRunId: env.QUALIFICATION_RUN_ID,
    providerMutations: false, deletionVerified: false, recoveryCertified: false, blockers: [] };
  try {
    const context = await proveCleanupContext({ env, evidence, evidenceHead, now: now(), reconcile: true, read, assertMain });
    assertDownloadedQualification(evidence, downloadedQualification);
    const observation = await observeOwnedTarget(api, context, now(), true, true);
    receipt.state = observation.present ? 'TARGET_PRESENT_READ_ONLY' : 'ABSENCE_OBSERVED_READ_ONLY'; receipt.targetId = observation.targetId;
  } catch (error) { receipt.state = 'TARGET_PRESENT_OR_BINDING_UNCERTAIN'; receipt.blockers.push(failureCode(error)); }
  receipt.finishedAt = new Date(now()).toISOString(); return receipt;
}

async function main() {
  const env = process.env, stage = process.argv[2], root = env.EVIDENCE_CHECKOUT, directory = env.EVIDENCE_DIR;
  requireThat(root && directory && path.isAbsolute(directory) && ['prepare','stage','delete','reconcile'].includes(stage), 'cleanup_cli_context_invalid');
  requireThat(['cleanup','reconcile'].includes(env.CLEANUP_MODE) && (stage !== 'reconcile' || env.CLEANUP_MODE === 'reconcile')
    && (!['stage','delete'].includes(stage) || env.CLEANUP_MODE === 'cleanup'), 'cleanup_cli_mode_invalid');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const evidence = readTrackedEvidence(root, env.QUALIFICATION_RUN_ID);
  const evidenceHead = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const write = (name, value, exclusive = false) => fs.writeFileSync(path.join(directory, name), encode(value), { mode: 0o600, ...(exclusive ? { flag: 'wx' } : {}) });
  const context = await proveCleanupContext({ env, evidence, evidenceHead, now: Date.now(), reconcile: env.CLEANUP_MODE === 'reconcile' });
  if (stage === 'prepare') {
    requireThat(env.GITHUB_OUTPUT, 'github_output_required');
    fs.appendFileSync(env.GITHUB_OUTPUT, `qualification_artifact_id=${context.intent.artifactId}\nqualification_run_id=${context.report.runId}\npending_name=${pendingName(context.report, context.intent)}\n`);
  } else if (stage === 'stage') {
    assertDownloadedQualification(evidence, fs.readFileSync(path.join(env.QUALIFICATION_DOWNLOAD, 'qualification.json')));
    write('pending.json', pendingReceipt(context, env), true);
  } else {
    const result = stage === 'reconcile'
      ? await reconcileReviewedTarget({ env, evidence, evidenceHead,
        downloadedQualification: fs.readFileSync(path.join(env.QUALIFICATION_DOWNLOAD, 'qualification.json')) })
      : await deleteReviewedTarget({ env, evidence, evidenceHead,
        downloadedQualification: fs.readFileSync(path.join(env.QUALIFICATION_DOWNLOAD, 'qualification.json')),
        pendingBytes: fs.readFileSync(path.join(directory, 'pending.json')),
        downloadedPending: fs.readFileSync(path.join(env.PENDING_DOWNLOAD, 'pending.json')),
        checkpoint: receipt => write('cleanup.json', receipt) });
    write('cleanup.json', result);
    process.stdout.write(JSON.stringify({ state: result.state, deletionVerified: result.deletionVerified, blockers: result.blockers }) + '\n');
    if (stage === 'delete' && !result.deletionVerified) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); }
  catch (error) {
    const receipt = { schemaVersion: 'native-restore-cleanup-receipt-v1', phase: 'cleanup-cli',
      state: process.argv[2] === 'delete' ? 'OUTCOME_UNPROVEN_READ_ONLY_RECONCILIATION_REQUIRED' : 'BLOCKED_WITHOUT_DELETE',
      deletionVerified: false, recoveryCertified: false, blockers: [failureCode(error)] };
    if (process.env.EVIDENCE_DIR && path.isAbsolute(process.env.EVIDENCE_DIR)) {
      try {
        fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(process.env.EVIDENCE_DIR, 'cleanup.json'), encode(receipt), { mode: 0o600 });
      } catch {}
    }
    process.stdout.write(JSON.stringify(receipt) + '\n'); process.exitCode = 1;
  }
}
