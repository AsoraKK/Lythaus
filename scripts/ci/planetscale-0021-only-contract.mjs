import { createHash } from 'node:crypto';
import { exactRegistryPrefix } from './planetscale-migration-reconciliation.mjs';

export const MIGRATION_0020 = '0020_auth_recovery_delivery.sql';
export const MIGRATION_0021 = '0021_media_quarantine_cleanup.sql';
export const RETRYABLE_0021_STATES = Object.freeze(['NOT_APPLIED', 'COLUMN_ONLY', 'INVALID_INDEX_RETRYABLE']);
export const REQUIRED_0021_RESTORE_SCOPE = Object.freeze([
  'backup_binding',
  'restore_completion',
  'schema_extensions_indexes',
  'canonical_registry',
  'effective_runtime_privileges',
  'application_smoke',
  'rpo_rto_acceptance',
  'independent_recovery_destination',
]);
export const RESTORE_EVIDENCE_SCHEMA = 'lythaus-0021-restore-evidence-v1';

export function serialize0021PlanReadyOutput(blockers) {
  return (blockers.length === 0).toString();
}

export function is0021PlanReadyOutput(value) {
  return value === 'true';
}

export function assess0021ExecutionConsent({ releaseSha, approvedSha, approvalReference }) {
  const blockers = [];
  const validSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
  const reference = typeof approvalReference === 'string' ? approvalReference.trim() : '';
  if (!validSha(releaseSha)) blockers.push('release_sha_missing_or_invalid');
  if (!validSha(approvedSha)) blockers.push('0021_execution_approved_sha_missing_or_invalid');
  else if (approvedSha !== releaseSha) blockers.push('0021_execution_approved_sha_does_not_match_release');
  if (!reference) blockers.push('0021_execution_approval_reference_missing');
  return {
    ok: blockers.length === 0,
    blockers,
    migration: MIGRATION_0021,
    releaseSha: validSha(releaseSha) ? releaseSha : null,
    approvedSha: validSha(approvedSha) ? approvedSha : null,
    approvalReference: reference || null,
  };
}

export function resolve0021BackupId(requestedId, existingId) {
  return (typeof requestedId === 'string' ? requestedId.trim() : '')
    || (typeof existingId === 'string' ? existingId.trim() : '');
}

function timestamp(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hash0021RestoreEvidenceRecord(record) {
  const safeRecord = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  const { recordSha256: _recordSha256, ...body } = safeRecord;
  return createHash('sha256').update(canonicalJson(body)).digest('hex');
}

export function assess0021RestoreEvidence({ record, recordPath = null, sourceBranch, backup, selectedBackupId, now = Date.now() }) {
  const blockers = [];
  const safeRecord = record && typeof record === 'object' && !Array.isArray(record) ? record : null;
  const safeSource = sourceBranch && typeof sourceBranch === 'object' ? sourceBranch : {};
  const safeBackup = backup && typeof backup === 'object' ? backup : {};
  const verifiedAt = timestamp(safeRecord?.verifiedAt);
  const restoredBranch = safeRecord?.restoredBranch && typeof safeRecord.restoredBranch === 'object' ? safeRecord.restoredBranch : {};
  const restoredBranchCreatedAt = timestamp(restoredBranch.createdAt);
  const review = safeRecord?.review && typeof safeRecord.review === 'object' ? safeRecord.review : {};
  const reviewedAt = timestamp(review.reviewedAt);
  const reviewedBy = typeof review.reviewedBy === 'string' ? review.reviewedBy.trim() : '';
  const reviewReference = typeof review.reference === 'string' ? review.reference.trim() : '';
  const evidenceSha256 = typeof safeRecord?.evidenceSha256 === 'string' ? safeRecord.evidenceSha256 : '';
  const recordSha256 = typeof safeRecord?.recordSha256 === 'string' ? safeRecord.recordSha256 : '';
  const verifiedScope = Array.isArray(safeRecord?.verifiedScope) ? safeRecord.verifiedScope : null;
  const unresolvedGates = Array.isArray(safeRecord?.unresolvedGates) ? safeRecord.unresolvedGates : null;

  if (!safeRecord) blockers.push('restore_evidence_record_missing_or_invalid');
  else if (safeRecord.schemaVersion !== RESTORE_EVIDENCE_SCHEMA) blockers.push('restore_evidence_schema_version_mismatch');
  if (!safeRecord?.sourceBranch || safeRecord.sourceBranch.name !== 'main'
    || !safeSource.id || safeRecord.sourceBranch.id !== safeSource.id) blockers.push('restore_evidence_source_branch_mismatch');
  if (typeof selectedBackupId !== 'string' || selectedBackupId.trim() === '') blockers.push('restore_evidence_selected_backup_missing');
  if (!safeRecord?.selectedBackupId || safeRecord.selectedBackupId !== selectedBackupId
    || !safeBackup.id || safeBackup.id !== selectedBackupId) blockers.push('restore_evidence_selected_backup_mismatch');
  if (typeof restoredBranch.id !== 'string' || restoredBranch.id.trim() === '' || restoredBranch.id === safeSource.id) {
    blockers.push('restore_evidence_restored_branch_missing_or_mismatched');
  }
  if (!['ready', 'deleted'].includes(restoredBranch.state)) blockers.push('restore_evidence_restored_branch_state_invalid');

  if (verifiedAt === null || verifiedAt > now) blockers.push('restore_evidence_timestamp_missing_invalid_or_future');
  if (restoredBranchCreatedAt === null || (verifiedAt !== null && restoredBranchCreatedAt > verifiedAt)) {
    blockers.push('restore_evidence_restored_branch_timestamp_invalid');
  }
  const backupCompletedAt = timestamp(safeBackup.completed_at);
  const backupExpiresAt = timestamp(safeBackup.expires_at);
  if (verifiedAt !== null && (backupCompletedAt === null || verifiedAt < backupCompletedAt)) {
    blockers.push('restore_evidence_stale_or_precedes_selected_backup');
  }
  if (verifiedAt !== null && backupExpiresAt !== null && verifiedAt >= backupExpiresAt) {
    blockers.push('restore_evidence_stale_for_selected_backup');
  }
  if (backupExpiresAt === null || backupExpiresAt <= now) blockers.push('restore_evidence_selected_backup_expired_or_unknown');

  if (!/^[a-f0-9]{64}$/.test(evidenceSha256)) blockers.push('restore_evidence_artifact_hash_missing_or_invalid');
  if (!/^[a-f0-9]{64}$/.test(recordSha256) || recordSha256 !== hash0021RestoreEvidenceRecord(safeRecord)) {
    blockers.push('restore_evidence_record_hash_missing_or_mismatched');
  }
  if (!verifiedScope || verifiedScope.some(scope => typeof scope !== 'string' || scope.trim() === '')) {
    blockers.push('restore_evidence_verified_scope_missing_or_invalid');
  } else {
    for (const scope of REQUIRED_0021_RESTORE_SCOPE) {
      if (!verifiedScope.includes(scope)) blockers.push(`restore_evidence_scope_missing:${scope}`);
    }
  }
  if (!unresolvedGates || unresolvedGates.some(gate => typeof gate !== 'string' || gate.trim() === '')) {
    blockers.push('restore_evidence_unresolved_gates_missing_or_invalid');
  } else if (unresolvedGates.length > 0) {
    blockers.push('restore_evidence_has_unresolved_gates');
  }
  if (reviewedAt === null || reviewedAt > now || !reviewedBy || !reviewReference) {
    blockers.push('restore_evidence_review_missing_or_invalid');
  } else if (verifiedAt !== null && reviewedAt < verifiedAt) {
    blockers.push('restore_evidence_review_precedes_verification');
  }

  return {
    ok: blockers.length === 0,
    blockers,
    recordPath,
    schemaVersion: safeRecord?.schemaVersion ?? null,
    sourceBranch: safeRecord?.sourceBranch ?? null,
    selectedBackupId: safeRecord?.selectedBackupId ?? null,
    restoredBranch: {
      id: restoredBranch.id ?? null,
      state: restoredBranch.state ?? null,
      createdAt: restoredBranchCreatedAt === null ? null : new Date(restoredBranchCreatedAt).toISOString(),
    },
    verifiedAt: verifiedAt === null ? null : new Date(verifiedAt).toISOString(),
    evidenceSha256: /^[a-f0-9]{64}$/.test(evidenceSha256) ? evidenceSha256 : null,
    recordSha256: /^[a-f0-9]{64}$/.test(recordSha256) ? recordSha256 : null,
    verifiedScope: verifiedScope ?? [],
    unresolvedGates: unresolvedGates ?? [],
    review: {
      reviewedAt: reviewedAt === null ? null : new Date(reviewedAt).toISOString(),
      reviewedBy: reviewedBy || null,
      reference: reviewReference || null,
    },
  };
}

export function assessPlanetScaleBackupEvidence({ branch, backup, backupId, restoreEvidenceRecord, restoreEvidenceRecordPath = null, now = Date.now() }) {
  const blockers = [];
  const safeBranch = branch && typeof branch === 'object' ? branch : {};
  const safeBackup = backup && typeof backup === 'object' ? backup : {};
  if (!safeBranch.name || safeBranch.name !== 'main') blockers.push('branch_name_not_main');
  if (safeBranch.kind !== 'postgresql') blockers.push('branch_kind_not_postgresql');
  if (safeBranch.state !== 'ready' || safeBranch.ready !== true) blockers.push('branch_not_ready');
  if (safeBranch.production !== true) blockers.push('branch_not_marked_production');
  if (safeBranch.deleted_at !== null) blockers.push('branch_deleted_or_deletion_state_unknown');
  if (safeBranch.deletion_protected !== true) blockers.push('branch_deletion_protection_missing');
  const restoreChecklistAt = timestamp(safeBranch.restore_checklist_completed_at);

  if (typeof backupId !== 'string' || backupId.trim() === '') blockers.push('backup_id_missing');
  if (!safeBackup.id || safeBackup.id !== backupId) blockers.push('backup_id_mismatch');
  if (safeBackup.state !== 'success') blockers.push('backup_not_successful');
  const createdAt = timestamp(safeBackup.created_at);
  const completedAt = timestamp(safeBackup.completed_at);
  const expiresAt = timestamp(safeBackup.expires_at);
  if (createdAt === null || createdAt > now) blockers.push('backup_created_at_missing_or_invalid');
  if (completedAt === null || completedAt > now || (createdAt !== null && completedAt < createdAt)) blockers.push('backup_completed_at_missing_or_invalid');
  if (expiresAt === null || expiresAt <= now || (completedAt !== null && expiresAt <= completedAt)) blockers.push('backup_expired_or_expiry_invalid');
  if (safeBackup.deleted_at !== null) blockers.push('backup_deleted_or_deletion_state_unknown');
  if (safeBackup.protected !== true) blockers.push('backup_not_deletion_protected');
  if (safeBackup.database_branch?.name !== 'main' || safeBackup.database_branch?.deleted_at !== null) blockers.push('backup_source_branch_mismatch_or_deleted');
  if (safeBranch.id && safeBackup.database_branch?.id && safeBranch.id !== safeBackup.database_branch.id) blockers.push('backup_source_branch_id_mismatch');

  const restoreEvidence = assess0021RestoreEvidence({
    record: restoreEvidenceRecord,
    recordPath: restoreEvidenceRecordPath,
    sourceBranch: safeBranch,
    backup: safeBackup,
    selectedBackupId: backupId,
    now,
  });
  blockers.push(...restoreEvidence.blockers);

  return {
    ok: blockers.length === 0,
    blockers,
    branch: {
      id: safeBranch.id ?? null,
      name: safeBranch.name ?? null,
      kind: safeBranch.kind ?? null,
      state: safeBranch.state ?? null,
      ready: safeBranch.ready === true,
      production: safeBranch.production === true,
      deletionProtected: safeBranch.deletion_protected === true,
      restoreChecklistMarkedAt: restoreChecklistAt === null ? null : new Date(restoreChecklistAt).toISOString(),
      restoreChecklistSemantics: 'Informational marker for the restored replacement branch checklist; it is not proof of source main recoverability.',
    },
    backup: {
      id: safeBackup.id ?? null,
      state: safeBackup.state ?? null,
      createdAt: createdAt === null ? null : new Date(createdAt).toISOString(),
      completedAt: completedAt === null ? null : new Date(completedAt).toISOString(),
      expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
      protected: safeBackup.protected === true,
      sourceBranch: safeBackup.database_branch?.name ?? null,
    },
    restoreEvidence,
  };
}

export function assessOperatorCostEstimate({ estimateUsd, reference, ceilingUsd }) {
  const blockers = [];
  const estimateText = typeof estimateUsd === 'string' ? estimateUsd.trim() : '';
  const referenceText = typeof reference === 'string' ? reference.trim() : '';
  const ceilingText = typeof ceilingUsd === 'string' ? ceilingUsd.trim() : '';
  const estimate = estimateText === '' ? Number.NaN : Number(estimateText);
  const ceiling = ceilingText === '' ? Number.NaN : Number(ceilingText);
  if (!Number.isFinite(estimate) || estimate < 0) blockers.push('operator_cost_estimate_missing_or_invalid');
  if (!referenceText) blockers.push('operator_cost_estimate_reference_missing');
  if (!Number.isFinite(ceiling) || ceiling <= 0) blockers.push('positive_cost_ceiling_missing_or_invalid');
  if (Number.isFinite(estimate) && Number.isFinite(ceiling) && estimate > ceiling) blockers.push('operator_cost_estimate_exceeds_ceiling');
  return {
    ok: blockers.length === 0,
    blockers,
    estimateUsd: Number.isFinite(estimate) && estimate >= 0 ? estimate : null,
    reference: referenceText || null,
    ceilingUsd: Number.isFinite(ceiling) && ceiling > 0 ? ceiling : null,
    ceilingSemantics: 'The ceiling is a review gate for the operator estimate; it does not enforce or cap provider spend.',
  };
}

export function assess0021RegistryState(rows, stagedState) {
  const registryRows = Array.isArray(rows) ? rows : [];
  if (exactRegistryPrefix(registryRows, MIGRATION_0021)) {
    if (stagedState === 'FULLY_APPLIED') return { state: 'COMPLETE', ok: true, needsApply: false, blockers: [] };
    return { state: 'REGISTRY_SCHEMA_MISMATCH', ok: false, needsApply: false, blockers: ['0021_registry_prefix_requires_exact_fully_applied_schema'] };
  }
  if (!exactRegistryPrefix(registryRows, MIGRATION_0020)) {
    return { state: 'REGISTRY_PREFIX_MISMATCH', ok: false, needsApply: false, blockers: ['registry_must_be_exact_through_0020_or_0021'] };
  }
  if (stagedState === 'FULLY_APPLIED') {
    return { state: 'RECOVERY_REQUIRED', ok: true, needsApply: false, needsRecovery: true, blockers: [] };
  }
  if (RETRYABLE_0021_STATES.includes(stagedState)) {
    return { state: stagedState, ok: true, needsApply: true, blockers: [] };
  }
  return { state: stagedState ?? 'UNKNOWN', ok: false, needsApply: false, blockers: [`0021_schema_state_not_retryable:${stagedState ?? 'unknown'}`] };
}
