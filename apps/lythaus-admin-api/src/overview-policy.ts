export const OVERVIEW_ROW_LIMIT = 5000;
export const OVERVIEW_CACHE_SECONDS = 60;
export const OVERVIEW_PERIODS = ['today', 'mtd', 'ytd'] as const;
export type OverviewPeriod = typeof OVERVIEW_PERIODS[number];
export interface OverviewWindow { start: string; end: string }
export interface OverviewScope {
  period: OverviewPeriod;
  current: OverviewWindow;
  previous: OverviewWindow;
  comparable: boolean;
}
export interface OverviewMetric {
  value: number | null;
  previous: number | null;
  changePercent: number | null;
  availability: 'available' | 'unavailable';
  reason: string | null;
  source: string;
  definition: string;
  unit: 'count' | 'ratio';
}

export function overviewScope(period: string, now: Date): OverviewScope {
  if (!OVERVIEW_PERIODS.includes(period as OverviewPeriod) || !Number.isFinite(now.getTime())) throw new Error('overview_invalid_period');
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  const start = period === 'today' ? Date.UTC(y, m, d) : period === 'mtd' ? Date.UTC(y, m, 1) : Date.UTC(y, 0, 1);
  const previousStart = period === 'today' ? Date.UTC(y, m, d - 1) : period === 'mtd' ? Date.UTC(y, m - 1, 1) : Date.UTC(y - 1, 0, 1);
  const elapsed = now.getTime() - start;
  const previousEnd = Math.min(previousStart + elapsed, start);
  return { period: period as OverviewPeriod,
    current: { start: new Date(start).toISOString(), end: now.toISOString() },
    previous: { start: new Date(previousStart).toISOString(), end: new Date(previousEnd).toISOString() },
    comparable: previousEnd - previousStart === elapsed };
}

export function countValue(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function overviewMetric(value: number | null, previous: number | null, source: string, definition: string, reason: string | null = null, unit: 'count' | 'ratio' = 'count'): OverviewMetric {
  return { value, previous, changePercent: value !== null && previous !== null && previous > 0 ? (value - previous) / previous * 100 : null,
    availability: value === null ? 'unavailable' : 'available', reason: value === null ? reason ?? 'source_unavailable' : null,
    source, definition, unit };
}

export const OVERVIEW_GAPS = {
  newVerifiedUsers: 'First-ever verification history is not certified complete. Current verified_at and repeat verification events cannot establish new verified users.',
  returningUsers: 'No complete member activity history with a defined returning-user event set and coverage start.',
  retentionRate: 'No certified activity cohort, observation window or complete cohort history. An empty cohort is unavailable.',
  quietUsers: 'No complete last-activity record or approved inactivity window. Account status and traffic requests are not activity.',
  upgrades: 'Entitlement changes can be administrative; authoritative paid subscription transition records are unavailable.',
  cancellations: 'Authoritative payment-provider cancellation records are unavailable.',
  revenue: 'No authoritative payment ledger, refunds, currency and revenue recognition contract.',
  suspectedAiFlags: 'Member reason-coded flags are not a certified AI-suspicion event taxonomy; automated evidence is separate from confirmed classifications.',
  confirmedAiClassifications: 'No approved confirmed-classification metric contract; private automated evaluation evidence is not a confirmed label.',
  appealOutcomes: 'Appeal outcome metric definitions and policy reconciliation belong to the rewards/appeals lane. Queue entries are not outcomes.',
} as const;

export function unavailableProviderTelemetry() {
  return {
    cloudflare: { enabled: false, status: 'unavailable', reason: 'Approved runtime telemetry access is not configured. Request, error, latency, queue and billing data are unavailable.',
      sampledAt: null, requests: null, errors: null, latencyMs: null, queues: null, accruedCost: null, finalizedCost: null, currency: null, accountingPeriod: null },
    planetscale: { enabled: false, status: 'unavailable', reason: 'Approved runtime telemetry access is not configured. Storage, connection, query health, billing attribution and currency require verified provider data.',
      sampledAt: null, storageBytes: null, connections: null, queryLatencyMs: null, accruedCost: null, finalizedCost: null, currency: null, accountingPeriod: null },
  };
}
