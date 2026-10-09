import type { DatabaseClient } from './index.ts';
import { supportTimestamp, supportUuid } from '../../contracts/src/account-support.ts';
import { ACTIVITY_ACCOUNT_LIMIT, ACTIVITY_NOTICE, ACTIVITY_NOTICE_VERSION, ACTIVITY_RETENTION_DAYS,
  activityMetric, activityWindows, type ActivityMetric } from '../../contracts/src/activity-measurement.ts';

export type ActivityClient = Pick<DatabaseClient, 'query'>;
export type ActivityConsentState = Readonly<{
  pilotEnabled: boolean; granted: boolean; revision: number; epoch: string | null; continuousSince: string | null;
}>;
export type ActivitySummary = Readonly<{
  contractVersion: 'activity-pilot-v1'; enabled: boolean; sampledAt: string; timezone: 'UTC';
  source: 'privacy.account_active_days'; population: string; windowBasis: 'completed_utc_days';
  retentionDays: 61; accountLimit: 5000; metrics: Readonly<Record<'dau' | 'wau' | 'mau' | 'quiet', ActivityMetric>>;
}>;

export async function bindActivityActor(client: ActivityClient, actorId: string): Promise<void> {
  if (!supportUuid(actorId)) throw new Error('activity_account_required');
  await client.query("SET LOCAL statement_timeout = '1500ms'");
  await client.query("SELECT set_config('lythaus.activity_subject', $1, true)", [actorId]);
}

export function activityConsentState(value: unknown): ActivityConsentState {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.pilotEnabled !== 'boolean' || typeof row.granted !== 'boolean'
    || !Number.isSafeInteger(row.revision) || Number(row.revision) < 0
    || (row.revision === 0 ? row.epoch !== null || row.granted : !supportUuid(row.epoch))
    || (row.granted ? row.continuousSince === null : row.continuousSince !== null)) throw new Error('activity_source_unavailable');
  return { pilotEnabled: row.pilotEnabled, granted: row.granted, revision: Number(row.revision), epoch: row.epoch as string | null,
    continuousSince: row.continuousSince === null ? null : supportTimestamp(row.continuousSince) };
}

export async function readActivityConsent(client: ActivityClient): Promise<ActivityConsentState> {
  const result = await client.query<{ state: unknown }>('SELECT privacy.activity_measurement_status() AS state');
  return activityConsentState(result.rows[0]?.state);
}

export async function setActivityConsent(client: ActivityClient, input: { id: string; enabled: boolean; expectedRevision: number; expectedEpoch: string | null }): Promise<ActivityConsentState> {
  const result = await client.query<{ state: unknown }>('SELECT privacy.set_activity_measurement_consent($1,$2,$3,$4,$5) AS state',
    [input.id, input.enabled, input.expectedRevision, input.expectedEpoch, ACTIVITY_NOTICE_VERSION]);
  return activityConsentState(result.rows[0]?.state);
}

export async function recordActivityRender(client: ActivityClient, revision: number, epoch: string): Promise<{ activeDay: string; inserted: boolean }> {
  const result = await client.query<{ result: { activeDay?: unknown; inserted?: unknown } }>('SELECT privacy.record_activity_measurement_day($1,$2) AS result', [revision, epoch]);
  const row = result.rows[0]?.result;
  if (!row || typeof row.activeDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.activeDay) || typeof row.inserted !== 'boolean') throw new Error('activity_source_unavailable');
  supportTimestamp(row.activeDay + 'T00:00:00.000Z');
  return { activeDay: row.activeDay, inserted: row.inserted };
}

export function activitySummary(value: unknown): ActivitySummary {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.enabled !== 'boolean') throw new Error('activity_source_unavailable');
  const sampledAt = supportTimestamp(row.sampledAt), windows = activityWindows(sampledAt);
  const periods = row.periods as Record<string, { observed: unknown; cohortSize: unknown; covered: unknown }> | undefined;
  const capacityExceeded = row.enabled && (!Number.isSafeInteger(row.accountRows) || Number(row.accountRows) > ACTIVITY_ACCOUNT_LIMIT || Number(row.accountRows) < 0);
  const metric = (span: string, window: { since: string; until: string }, quiet = false) => activityMetric({
    observed: periods?.[span]?.observed, cohortSize: periods?.[span]?.cohortSize, covered: periods?.[span]?.covered === true,
    enabled: row.enabled === true, capacityExceeded, quiet, window,
  });
  return { contractVersion: 'activity-pilot-v1', enabled: row.enabled, sampledAt, timezone: 'UTC', source: 'privacy.account_active_days',
    population: 'Retained active non-acceptance accounts continuously opted in for the complete metric window. Excludes held accounts, nonconsenting accounts, new consent episodes and missing pre-cutover history. Cohorts differ by window; public contributors are a separate population.',
    windowBasis: 'completed_utc_days', retentionDays: ACTIVITY_RETENTION_DAYS, accountLimit: ACTIVITY_ACCOUNT_LIMIT,
    metrics: { dau: metric('1', windows.dau), wau: metric('7', windows.wau), mau: metric('30', windows.mau), quiet: metric('60', windows.quiet, true) } };
}

export async function readActivitySummary(client: ActivityClient): Promise<ActivitySummary> {
  const result = await client.query<{ result: unknown }>('SELECT privacy.activity_measurement_aggregate() AS result');
  return activitySummary(result.rows[0]?.result);
}

export function activityConsentResponse(state: ActivityConsentState, accountScope: string) {
  return { ...state, accountScope, noticeVersion: ACTIVITY_NOTICE_VERSION, notice: ACTIVITY_NOTICE, retentionDays: ACTIVITY_RETENTION_DAYS };
}
