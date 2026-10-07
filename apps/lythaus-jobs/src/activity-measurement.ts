import { transaction, type DatabaseClient, type HyperdriveBinding } from '@lythaus/db';
import { activityPrivacyReadiness, exportActivityMeasurement, purgeActivityMeasurement, expireActivityMeasurement, reconcileActivityMeasurementLocations } from '../../../packages/db/src/activity-measurement-privacy.ts';

function boundedPrivacy<T>(binding: HyperdriveBinding, work: (client: DatabaseClient) => Promise<T>, run = transaction) {
  return run(binding, async client => {
    await client.query("SET LOCAL statement_timeout = '1500ms'");
    return work(client);
  });
}

export async function activityMeasurementPrivacyExport(binding: HyperdriveBinding, requestId: string, subjectId: string, run = transaction) {
  return boundedPrivacy(binding, async client => await activityPrivacyReadiness(client) === 'absent'
    ? { status: 'not_collected' as const, noticeVersion: 'activity-account-day-v1' }
    : exportActivityMeasurement(client, requestId, subjectId), run);
}

export async function activityMeasurementPrivacyDelete(binding: HyperdriveBinding, requestId: string, subjectId: string, run = transaction) {
  return boundedPrivacy(binding, async client => await activityPrivacyReadiness(client) === 'absent'
    ? 0 : purgeActivityMeasurement(client, requestId, subjectId), run);
}

export async function activityMeasurementPrivacyReconcile(binding: HyperdriveBinding, subjectId: string, run = transaction) {
  return boundedPrivacy(binding, async client => { if (await activityPrivacyReadiness(client) === 'ready') await reconcileActivityMeasurementLocations(client, subjectId); }, run);
}

export async function activityMeasurementRetentionBatch(binding: HyperdriveBinding, run = transaction) {
  return boundedPrivacy(binding, async client => await activityPrivacyReadiness(client) === 'absent'
    ? 0 : expireActivityMeasurement(client, 500), run);
}

// Existing fifteen-minute scheduler and native retention workflow share the
// same bounded purpose-local drain. Each batch commits independently, so a
// retry resumes safely; exhaustion signals backlog instead of false success.
export async function activityMeasurementRetentionCleanup(binding: HyperdriveBinding, batch = activityMeasurementRetentionBatch) {
  let removed = 0;
  for (let index = 0; index < 20; index++) {
    const count = await batch(binding);
    removed += count;
    if (count < 500) return removed;
  }
  throw new Error('activity_retention_backlog');
}
