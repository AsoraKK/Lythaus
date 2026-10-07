import { transaction, type HyperdriveBinding } from '@lythaus/db';
import { activityPrivacyReadiness, exportActivityMeasurement, purgeActivityMeasurement, expireActivityMeasurement, reconcileActivityMeasurementLocations } from '../../../packages/db/src/activity-measurement-privacy.ts';

export async function activityMeasurementPrivacyExport(binding: HyperdriveBinding, requestId: string, subjectId: string, run = transaction) {
  return run(binding, async client => await activityPrivacyReadiness(client) === 'absent'
    ? { status: 'not_collected' as const, noticeVersion: 'activity-account-day-v1' }
    : exportActivityMeasurement(client, requestId, subjectId));
}

export async function activityMeasurementPrivacyDelete(binding: HyperdriveBinding, requestId: string, subjectId: string, run = transaction) {
  return run(binding, async client => await activityPrivacyReadiness(client) === 'absent'
    ? 0 : purgeActivityMeasurement(client, requestId, subjectId));
}

export async function activityMeasurementPrivacyReconcile(binding: HyperdriveBinding, subjectId: string, run = transaction) {
  return run(binding, async client => { if (await activityPrivacyReadiness(client) === 'ready') await reconcileActivityMeasurementLocations(client, subjectId); });
}

export async function activityMeasurementRetentionBatch(binding: HyperdriveBinding, run = transaction) {
  return run(binding, async client => await activityPrivacyReadiness(client) === 'absent'
    ? 0 : expireActivityMeasurement(client, 500));
}
