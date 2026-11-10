import { pathToFileURL } from 'node:url';
import { RESTORE, RestoreFailure, approvalRecord, requireThat, failureCode } from './planetscale-native-restore-contract.mjs';
import { parseRestorePlanPins, planErrorCode } from './planetscale-native-restore-plan.mjs';

export const DEPENDENCY_SETUP_RESERVE_MS = 5 * 60000;

export function checkSetupWindow(environment, now = Date.now()) {
  requireThat(Number.isFinite(now), 'admission_time_invalid');
  let pins;
  try { pins = parseRestorePlanPins(environment.RESTORE_CHECK_PLAN_PINS_JSON); }
  catch (error) { throw new RestoreFailure(planErrorCode(error)); }
  const initialApproval = approvalRecord(environment.RESTORE_CHECK_APPROVAL_JSON, environment, now);
  requireThat(pins.backupId === initialApproval.plan.backup.id
    && pins.backupCompletedAt === initialApproval.plan.backup.completedAt
    && pins.target === initialApproval.plan.target.name
    && pins.targetBytes === initialApproval.plan.target.minimumStorageBytes
    && pins.targetBytes === initialApproval.plan.target.maximumStorageBytes, 'restore_plan_pins_approval_mismatch');
  const latestStart = now + DEPENDENCY_SETUP_RESERVE_MS;
  requireThat(latestStart + RESTORE.maximumMs <= Date.parse(pins.backupCompletedAt) + 24 * 3600000,
    'pinned_backup_window_exhausted_before_setup');
  requireThat(Date.parse(initialApproval.plan.backup.expiresAt) > latestStart + RESTORE.maximumMs,
    'pinned_backup_expiry_insufficient_before_setup');
  const approval = approvalRecord(environment.RESTORE_CHECK_APPROVAL_JSON, environment, latestStart);
  return { status: 'STATIC_WINDOW_PASSED_LIVE_ADMISSION_STILL_REQUIRED',
    checkedAt: new Date(now).toISOString(), setupReserveMs: DEPENDENCY_SETUP_RESERVE_MS,
    latestReservedRunnerStartAt: new Date(latestStart).toISOString(),
    approvalExpiresAt: approval.expiresAt, backupId: pins.backupId, planSha256: approval.planSha256,
    targetName: pins.target, targetBytes: pins.targetBytes,
    providerMetadataVerified: false, cumulativeBudgetVerified: false, mutationAuthorized: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(checkSetupWindow(process.env)) + '\n'); }
  catch (error) {
    process.stdout.write(JSON.stringify({ status: 'BLOCKED_WITHOUT_PROVIDER_ACCESS', blockers: [failureCode(error)] }) + '\n');
    process.exitCode = 1;
  }
}
