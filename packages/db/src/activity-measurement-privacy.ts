import type { ActivityClient } from './activity-measurement.ts';
import { supportUuid } from '../../contracts/src/account-support.ts';

// An uninstalled optional pilot must not break unrelated DSRs. A partially
// installed or rolled-back pilot fails closed instead of claiming no data.
export async function activityPrivacyReadiness(client: ActivityClient): Promise<'absent' | 'ready'> {
  const result = await client.query<{ objects: number; declared: boolean }>(`SELECT
    ((to_regclass('privacy.activity_measurement_configuration') IS NOT NULL)::integer +
     (to_regclass('privacy.activity_measurement_consents') IS NOT NULL)::integer +
     (to_regclass('privacy.account_active_days') IS NOT NULL)::integer +
     (to_regclass('privacy.activity_measurement_coverage') IS NOT NULL)::integer +
     (to_regprocedure('privacy.export_activity_measurement(uuid,uuid)') IS NOT NULL)::integer +
     (to_regprocedure('privacy.purge_activity_measurement(uuid,uuid)') IS NOT NULL)::integer +
     (to_regprocedure('privacy.expire_activity_measurement(integer)') IS NOT NULL)::integer +
     (to_regprocedure('privacy.reconcile_activity_measurement_locations(uuid)') IS NOT NULL)::integer) AS objects,
    (to_regprocedure('privacy.activity_measurement_installation_marker()') IS NOT NULL) AS declared`);
  const row = result.rows[0];
  if (row?.objects === 0 && row.declared === false) return 'absent';
  if (row?.objects === 8 && row.declared === true) return 'ready';
  throw new Error('activity_privacy_schema_incomplete');
}

function subject(value: string): string {
  if (!supportUuid(value)) throw new Error('activity_privacy_subject_invalid');
  return value;
}

export async function exportActivityMeasurement(client: ActivityClient, requestId: string, subjectId: string) {
  const result = await client.query<{ result: unknown }>('SELECT privacy.export_activity_measurement($1,$2) AS result', [subject(requestId), subject(subjectId)]);
  const value = result.rows[0]?.result as { consent?: unknown; activeDates?: unknown } | undefined;
  if (!value || !Array.isArray(value.activeDates) || value.activeDates.length > 61
    || value.activeDates.some(day => typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day))) throw new Error('activity_privacy_unavailable');
  return value;
}

export async function purgeActivityMeasurement(client: ActivityClient, requestId: string, subjectId: string): Promise<number> {
  const result = await client.query<{ removed: number }>('SELECT privacy.purge_activity_measurement($1,$2) AS removed', [subject(requestId), subject(subjectId)]);
  if (!Number.isInteger(result.rows[0]?.removed) || result.rows[0].removed < 0) throw new Error('activity_privacy_unavailable');
  return result.rows[0].removed;
}

export async function reconcileActivityMeasurementLocations(client: ActivityClient, subjectId: string): Promise<void> {
  await client.query('SELECT privacy.reconcile_activity_measurement_locations($1)', [subject(subjectId)]);
}

export async function expireActivityMeasurement(client: ActivityClient, limit = 500): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('activity_invalid_batch');
  const result = await client.query<{ removed: number }>('SELECT privacy.expire_activity_measurement($1) AS removed', [limit]);
  if (!Number.isInteger(result.rows[0]?.removed) || result.rows[0].removed < 0 || result.rows[0].removed > limit) throw new Error('activity_privacy_unavailable');
  return result.rows[0].removed;
}
