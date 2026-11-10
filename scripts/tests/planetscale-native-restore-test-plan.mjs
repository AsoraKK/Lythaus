import { RESTORE } from '../ci/planetscale-native-restore-contract.mjs';
import { buildRestorePlan, restorePlanSha256 } from '../ci/planetscale-native-restore-plan.mjs';

export const TEST_RELEASE_SHA = 'a'.repeat(40);
export const TEST_BACKUP_ID = 'muprxxetwfet';
export const TEST_BACKUP_COMPLETED_AT = '2026-11-09T02:51:08.741Z';
export const TEST_TARGET = 'lythaus-0021-native-restore-check-20261109-01';
export const TEST_TARGET_BYTES = RESTORE.bytes;
export const TEST_PINS = Object.freeze({ backupId: TEST_BACKUP_ID, backupCompletedAt: TEST_BACKUP_COMPLETED_AT,
  target: TEST_TARGET, targetBytes: TEST_TARGET_BYTES });

export function testBackup(overrides = {}) {
  return { id: TEST_BACKUP_ID, database_branch: { id: RESTORE.sourceId, name: 'main', deleted_at: null },
    state: 'success', deleted_at: null, protected: true, completed_at: TEST_BACKUP_COMPLETED_AT,
    expires_at: '2026-11-11T02:49:03.258Z', pvc_size: 27917287424, uncompressed_size: 53352281,
    restored_branches: [], ...overrides };
}

export function testPlan({ pins = TEST_PINS, backup = testBackup(), schemaMode = 'pre-0021',
  releaseSha = TEST_RELEASE_SHA } = {}) {
  return buildRestorePlan(pins, backup, { releaseSha, schemaMode, sourceBranchId: RESTORE.sourceId });
}

export function testPlanSha(plan = testPlan(), schemaMode = plan.schemaMode) {
  return restorePlanSha256(plan, { releaseSha: plan.releaseSha, schemaMode, sourceBranchId: RESTORE.sourceId });
}

export const TEST_PLAN = testPlan();
