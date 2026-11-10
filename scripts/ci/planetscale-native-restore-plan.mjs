import { createHash } from 'node:crypto';

export const RESTORE_PLAN_SCHEMA = 'lythaus-native-restore-plan-v1';
export const TARGET_BYTES_MIN = 20 * 1024 ** 3;
export const TARGET_BYTES_MAX = 32 * 1024 ** 3;
const PLAN_KEYS = ['backup', 'releaseSha', 'schemaMode', 'schemaVersion', 'sourceBranchId', 'target'];
const BACKUP_KEYS = ['completedAt', 'expiresAt', 'id', 'protected', 'pvcBytes', 'restoredBranches', 'uncompressedBytes'];
const TARGET_KEYS = ['maximumStorageBytes', 'minimumStorageBytes', 'name'];
const PIN_KEYS = ['backupCompletedAt', 'backupId', 'target', 'targetBytes'];
const safeId = value => typeof value === 'string' && /^[a-z0-9]{1,64}$/.test(value);
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const canonicalTime = value => {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(0); date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  date.setUTCHours(Number(hour), Number(minute), Number(second), 0);
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day) && date.getUTCHours() === Number(hour)
    && date.getUTCMinutes() === Number(minute) && date.getUTCSeconds() === Number(second);
};
const providerTime = canonicalTime;
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const requirePlan = (condition, code) => { if (!condition) fail(code); };

function targetNameValid(value) {
  if (typeof value !== 'string' || !/^lythaus-0021-native-restore-check-\d{8}-\d{2}$/.test(value)) return false;
  const date = value.slice('lythaus-0021-native-restore-check-'.length, -3);
  const year = Number(date.slice(0, 4)), month = Number(date.slice(4, 6)), day = Number(date.slice(6, 8));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function parseRestorePlanPins(raw) {
  let pins;
  try { pins = JSON.parse(raw); } catch { fail('restore_plan_pins_required'); }
  requirePlan(exactKeys(pins, PIN_KEYS) && safeId(pins.backupId) && canonicalTime(pins.backupCompletedAt)
    && targetNameValid(pins.target) && Number.isSafeInteger(pins.targetBytes)
    && pins.targetBytes >= TARGET_BYTES_MIN && pins.targetBytes <= TARGET_BYTES_MAX
    && pins.targetBytes % (1024 ** 3) === 0, 'restore_plan_pins_invalid');
  return Object.freeze({ backupId: pins.backupId, backupCompletedAt: pins.backupCompletedAt,
    target: pins.target, targetBytes: pins.targetBytes });
}

function normalizedHistory(rows, { canonical = false } = {}) {
  requirePlan(Array.isArray(rows) && rows.length <= 1000, 'backup_restore_history_incomplete');
  const seen = new Set();
  const normalized = rows.map(row => {
    requirePlan(row !== null && typeof row === 'object' && !Array.isArray(row)
      && (canonical ? exactKeys(row, ['deletedAt', 'id', 'name'])
        : !Object.hasOwn(row, 'deletedAt') && Object.hasOwn(row, 'deleted_at')),
    'backup_restore_history_invalid');
    const deletedAt = canonical ? row.deletedAt : row.deleted_at;
    requirePlan(row !== null && typeof row === 'object' && safeId(row.id)
      && typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 100
      && (deletedAt === null || providerTime(deletedAt)),
    'backup_restore_history_invalid');
    requirePlan(!seen.has(row.id), 'backup_restore_history_duplicate'); seen.add(row.id);
    return { id: row.id, name: row.name, deletedAt: deletedAt ?? null };
  });
  return normalized.sort((a, b) => a.id.localeCompare(b.id));
}

export function canonicalRestorePlan(plan, { sourceBranchId, releaseSha, schemaMode, requireProtected = false,
  now, maximumMs, enforceFreshness = false } = {}) {
  requirePlan(exactKeys(plan, PLAN_KEYS) && plan.schemaVersion === RESTORE_PLAN_SCHEMA
    && plan.releaseSha === releaseSha && /^[a-f0-9]{40}$/.test(plan.releaseSha ?? '')
    && plan.schemaMode === schemaMode && ['pre-0021', 'post-0021'].includes(plan.schemaMode)
    && plan.sourceBranchId === sourceBranchId && safeId(plan.sourceBranchId), 'restore_plan_identity_invalid');
  const backup = plan.backup, target = plan.target;
  requirePlan(exactKeys(backup, BACKUP_KEYS) && safeId(backup.id) && canonicalTime(backup.completedAt)
    && canonicalTime(backup.expiresAt) && typeof backup.protected === 'boolean'
    && Number.isSafeInteger(backup.pvcBytes) && backup.pvcBytes > 0
    && Number.isSafeInteger(backup.uncompressedBytes) && backup.uncompressedBytes > 0
    && Array.isArray(backup.restoredBranches), 'restore_plan_backup_invalid');
  requirePlan(exactKeys(target, TARGET_KEYS) && targetNameValid(target.name)
    && Number.isSafeInteger(target.minimumStorageBytes) && target.minimumStorageBytes >= TARGET_BYTES_MIN
    && target.minimumStorageBytes <= TARGET_BYTES_MAX && target.minimumStorageBytes % (1024 ** 3) === 0
    && target.maximumStorageBytes === target.minimumStorageBytes, 'restore_plan_target_invalid');
  const restoredBranches = normalizedHistory(backup.restoredBranches, { canonical: true });
  requirePlan(backup.pvcBytes <= target.minimumStorageBytes && backup.uncompressedBytes <= target.minimumStorageBytes,
    'restore_plan_target_too_small');
  if (requireProtected) requirePlan(backup.protected === true, 'restore_plan_backup_not_protected');
  if (enforceFreshness) {
    const completed = Date.parse(backup.completedAt), expires = Date.parse(backup.expiresAt);
    requirePlan(Number.isFinite(now) && Number.isSafeInteger(maximumMs) && maximumMs > 0
      && completed <= now && now + maximumMs <= completed + 24 * 3600000
      && expires > now + maximumMs, 'backup_stale_or_test_window_too_short');
  }
  return Object.freeze({ schemaVersion: RESTORE_PLAN_SCHEMA, releaseSha: plan.releaseSha, schemaMode: plan.schemaMode,
    sourceBranchId: plan.sourceBranchId,
    backup: Object.freeze({ id: backup.id, completedAt: backup.completedAt, expiresAt: backup.expiresAt,
      pvcBytes: backup.pvcBytes, uncompressedBytes: backup.uncompressedBytes, protected: backup.protected,
      restoredBranches: Object.freeze(restoredBranches.map(Object.freeze)) }),
    target: Object.freeze({ name: target.name, minimumStorageBytes: target.minimumStorageBytes,
      maximumStorageBytes: target.maximumStorageBytes }) });
}

export function buildRestorePlan(pins, backup, { releaseSha, schemaMode, sourceBranchId, allowedRestoredTarget }) {
  requirePlan(exactKeys(pins, PIN_KEYS) && safeId(pins.backupId) && backup?.id === pins.backupId
    && backup.database_branch?.id === sourceBranchId && backup.database_branch.name === 'main'
    && backup.database_branch.deleted_at === null && backup.state === 'success' && backup.deleted_at === null
    && backup.completed_at === pins.backupCompletedAt && canonicalTime(backup.completed_at)
    && canonicalTime(backup.expires_at) && Number.isSafeInteger(backup.pvc_size) && backup.pvc_size > 0
    && Number.isSafeInteger(backup.uncompressed_size) && backup.uncompressed_size > 0
    && typeof backup.protected === 'boolean', 'restore_plan_live_backup_mismatch');
  const plan = { schemaVersion: RESTORE_PLAN_SCHEMA, releaseSha, schemaMode, sourceBranchId,
    backup: { id: backup.id, completedAt: backup.completed_at, expiresAt: backup.expires_at,
      pvcBytes: backup.pvc_size, uncompressedBytes: backup.uncompressed_size, protected: backup.protected,
      restoredBranches: normalizedHistory(backup.restored_branches) },
    target: { name: pins.target, minimumStorageBytes: pins.targetBytes, maximumStorageBytes: pins.targetBytes } };
  const normalized = canonicalRestorePlan(plan, { releaseSha, schemaMode, sourceBranchId });
  const targetHistory = normalized.backup.restoredBranches.filter(row => row.name === normalized.target.name);
  if (allowedRestoredTarget) {
    requirePlan(safeId(allowedRestoredTarget.id) && allowedRestoredTarget.name === normalized.target.name
      && targetHistory.length === 1 && targetHistory[0].id === allowedRestoredTarget.id
      && targetHistory[0].deletedAt === null, 'restore_plan_created_target_binding_invalid');
  } else requirePlan(targetHistory.length === 0, 'backup_target_history_unexpected');
  return normalized;
}

export function restorePlanSha256(plan, options) {
  const normalized = canonicalRestorePlan(plan, options);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function assertLiveBackupMatchesPlan(plan, backup, options) {
  const requireProtected = options?.requireProtected !== false;
  const normalized = canonicalRestorePlan(plan, { ...options, requireProtected, enforceFreshness: true });
  const candidatePins = { backupId: normalized.backup.id, backupCompletedAt: normalized.backup.completedAt,
    target: normalized.target.name, targetBytes: normalized.target.minimumStorageBytes };
  const live = buildRestorePlan(candidatePins, backup, { releaseSha: normalized.releaseSha,
    schemaMode: normalized.schemaMode, sourceBranchId: normalized.sourceBranchId,
    ...(options?.allowedRestoredTarget ? { allowedRestoredTarget: options.allowedRestoredTarget } : {}) });
  if (options?.allowedRestoredTarget) {
    const target = options.allowedRestoredTarget;
    requirePlan(safeId(target.id) && target.name === normalized.target.name
      && !normalized.backup.restoredBranches.some(row => row.name === target.name || row.id === target.id),
    'restore_plan_created_target_binding_invalid');
    const expectedHistory = [...normalized.backup.restoredBranches,
      { id: target.id, name: target.name, deletedAt: null }].sort((a, b) => a.id.localeCompare(b.id));
    const expected = { ...normalized, backup: { ...normalized.backup, restoredBranches: expectedHistory } };
    requirePlan(JSON.stringify(live) === JSON.stringify(expected), 'restore_plan_live_metadata_changed');
  } else requirePlan(JSON.stringify(live) === JSON.stringify(normalized), 'restore_plan_live_metadata_changed');
  if (requireProtected) requirePlan(normalized.backup.protected === true, 'backup_protection_unconfirmed');
  return normalized;
}

export function planErrorCode(error) { return typeof error?.code === 'string' ? error.code : 'restore_plan_invalid'; }
