import { pathToFileURL } from 'node:url';
import { RESTORE, approvalRecord, requireThat, failureCode } from './planetscale-native-restore-contract.mjs';

export const DEPENDENCY_SETUP_RESERVE_MS = 5 * 60000;

export function checkSetupWindow(environment, now = Date.now()) {
  requireThat(Number.isFinite(now), 'admission_time_invalid');
  approvalRecord(environment.RESTORE_CHECK_APPROVAL_JSON, environment, now);
  const latestStart = now + DEPENDENCY_SETUP_RESERVE_MS;
  const approval = approvalRecord(environment.RESTORE_CHECK_APPROVAL_JSON, environment, latestStart);
  requireThat(latestStart + RESTORE.maximumMs <= Date.parse(RESTORE.backupCompletedAt) + 24 * 3600000,
    'pinned_backup_window_exhausted_before_setup');
  return { status: 'STATIC_WINDOW_PASSED_LIVE_ADMISSION_STILL_REQUIRED',
    checkedAt: new Date(now).toISOString(), setupReserveMs: DEPENDENCY_SETUP_RESERVE_MS,
    latestReservedRunnerStartAt: new Date(latestStart).toISOString(),
    approvalExpiresAt: approval.expiresAt, backupId: RESTORE.backupId,
    providerMetadataVerified: false, cumulativeBudgetVerified: false, mutationAuthorized: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(checkSetupWindow(process.env)) + '\n'); }
  catch (error) {
    process.stdout.write(JSON.stringify({ status: 'BLOCKED_WITHOUT_PROVIDER_ACCESS', blockers: [failureCode(error)] }) + '\n');
    process.exitCode = 1;
  }
}
