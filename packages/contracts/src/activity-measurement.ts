import { supportTimestamp, supportUuid } from './account-support.ts';

export const ACTIVITY_NOTICE_VERSION = 'activity-account-day-v1';
export const ACTIVITY_PURPOSE = 'account_daily_activity';
export const ACTIVITY_FLAG = 'analytics.account_daily_activity_pilot';
export const ACTIVITY_RETENTION_DAYS = 61;
export const ACTIVITY_ACCOUNT_LIMIT = 5000;
export const ACTIVITY_NOTICE = 'Optional account-linked activity measurement: when you choose to take part, Lythaus records one active UTC date for your account when the app renders visibly in the foreground, including an empty feed. We use these dates to measure activity and quiet accounts within the consenting cohort. We do not record browsed URLs, viewed content or browsing history for this purpose. Activity dates expire within 61 days. You can withdraw here at any time; withdrawal removes these activity dates. Your consent decisions remain in the existing account consent record and are included in your data export.';

export type ActivityMetricState = 'available' | 'partial' | 'unavailable';
export type ActivityMetric = Readonly<{
  state: ActivityMetricState;
  value: number | null;
  observedLowerBound: number | null;
  cohortSize: number | null;
  since: string;
  until: string;
  reason: string | null;
}>;

function input(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('activity_invalid_request');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !keys.includes(key) || !field?.enumerable || !Object.hasOwn(field, 'value')) throw new Error('activity_invalid_request');
    result[key] = field.value;
  }
  if (keys.some(key => !Object.hasOwn(result, key))) throw new Error('activity_invalid_request');
  return result;
}

function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('activity_invalid_request');
  return Number(value);
}

function accountScope(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('activity_invalid_request');
  return value;
}

export function activityConsentInput(value: unknown) {
  const row = input(value, ['enabled', 'expectedRevision', 'expectedEpoch', 'accountScope', 'noticeVersion']);
  if (typeof row.enabled !== 'boolean' || row.noticeVersion !== ACTIVITY_NOTICE_VERSION) throw new Error('activity_invalid_request');
  const expectedRevision = revision(row.expectedRevision);
  if (expectedRevision === 0 ? row.expectedEpoch !== null : !supportUuid(row.expectedEpoch)) throw new Error('activity_invalid_request');
  return { enabled: row.enabled, expectedRevision, expectedEpoch: row.expectedEpoch as string | null,
    accountScope: accountScope(row.accountScope), noticeVersion: ACTIVITY_NOTICE_VERSION };
}

export function activityRenderInput(value: unknown) {
  const row = input(value, ['signal', 'consentRevision', 'consentEpoch', 'accountScope', 'noticeVersion']);
  if (row.signal !== 'foreground_app_render' || row.noticeVersion !== ACTIVITY_NOTICE_VERSION || revision(row.consentRevision) === 0
    || !supportUuid(row.consentEpoch)) throw new Error('activity_invalid_request');
  return { signal: 'foreground_app_render', consentRevision: revision(row.consentRevision), consentEpoch: row.consentEpoch as string,
    accountScope: accountScope(row.accountScope), noticeVersion: ACTIVITY_NOTICE_VERSION };
}

export function activityWindows(at: unknown) {
  const timestamp = supportTimestamp(at);
  const until = new Date(timestamp);
  until.setUTCHours(0, 0, 0, 0);
  const window = (days: number, end = until) => {
    const since = new Date(end);
    since.setUTCDate(since.getUTCDate() - days);
    return { since: since.toISOString(), until: end.toISOString() };
  };
  const recent = window(30);
  return { dau: window(1), wau: window(7), mau: recent, quiet: window(60), previousQuiet: window(30, new Date(recent.since)), recentQuiet: recent };
}

export function activityMetric(input: {
  observed: unknown; cohortSize: unknown; covered: boolean; enabled: boolean; capacityExceeded?: boolean;
  quiet?: boolean; window: { since: string; until: string };
}): ActivityMetric {
  const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= ACTIVITY_ACCOUNT_LIMIT ? Number(value) : null;
  const observed = count(input.observed), cohort = count(input.cohortSize);
  const reason = !input.enabled ? 'pilot_disabled' : input.capacityExceeded ? 'snapshot_capacity_exceeded'
    : observed === null || cohort === null || observed > cohort ? 'source_unavailable'
    : cohort === 0 ? 'no_observable_cohort' : !input.covered ? 'incomplete_measurement_coverage' : null;
  const available = reason === null;
  const partial = reason === 'incomplete_measurement_coverage' && !input.quiet && observed !== null && observed > 0;
  return { state: available ? 'available' : partial ? 'partial' : 'unavailable', value: available ? observed : null,
    observedLowerBound: partial ? observed : null, cohortSize: !input.enabled || input.capacityExceeded ? null : cohort,
    ...input.window, reason };
}
