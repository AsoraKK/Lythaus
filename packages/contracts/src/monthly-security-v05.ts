import { reputationInstant, nextReputationMonth, requireSourceMonth } from './monthly-reputation-policy.ts';
import { calculateMonthlyMaintenance, type MonthlyMaintenanceEvidence, type MonthlyMaintenanceRules } from './monthly-maintenance-policy.ts';

export const MONTHLY_SECURITY_V05 = 'monthly-security-independent-categories-v0.5';
export const SECURITY_GRACE_MS = 24 * 60 * 60 * 1000;
type Span = [number, number];
type Category = 'mfa' | 'credential';

export interface SecurityCoverageV05 {
  category: Category;
  collectionStartsAt: string;
  completeThrough: string;
  knownUnprotected: readonly { startsAt: string; endsAt: string }[];
}

function union(spans: readonly Span[]): Span[] {
  const result: Span[] = [];
  for (const [from, until] of [...spans].filter(([a, b]) => a < b).sort(([a], [b]) => a - b)) {
    const prior = result.at(-1);
    if (prior && from <= prior[1]) prior[1] = Math.max(prior[1], until);
    else result.push([from, until]);
  }
  return result;
}
function subtract(spans: readonly Span[], covered: readonly Span[]): Span[] {
  return union(spans).flatMap(([from, until]) => {
    const result: Span[] = []; let through = from;
    for (const [a, b] of union(covered)) {
      if (b <= through || a >= until) continue;
      if (a > through) result.push([through, Math.min(a, until)]);
      through = Math.max(through, b);
    }
    if (through < until) result.push([through, until]);
    return result;
  });
}
const duration = (spans: readonly Span[]) => union(spans).reduce((sum, [a, b]) => sum + b - a, 0);

export function calculateSecurityMaintenanceV05(input: {
  subjectUserId: string; sourceMonth: string; rules: MonthlyMaintenanceRules;
  evidence: readonly MonthlyMaintenanceEvidence[]; coverage: readonly SecurityCoverageV05[];
}) {
  requireSourceMonth(input.sourceMonth);
  const baseline = calculateMonthlyMaintenance(input);
  const start = reputationInstant(`${input.sourceMonth}-01T00:00:00.000Z`);
  const cutoff = reputationInstant(`${nextReputationMonth(input.sourceMonth)}-01T00:00:00.000Z`);
  if (!Array.isArray(input.coverage) || input.coverage.some((row, index) =>
    !['mfa', 'credential'].includes(row.category) || input.coverage.findIndex(other => other.category === row.category) !== index)) {
    throw new Error('monthly_security_coverage_invalid');
  }
  const categories = (['mfa', 'credential'] as const).map(category => {
    const maximumPoints = category === 'mfa' ? 250 : 1_000;
    const report = (reasonCode: string, protectedMs = 0, unprotectedMs = 0, unknownMs = cutoff - start, evidenceIds: string[] = []) => ({
      actionId: `monthly.${category}_maintenance`, maximumPoints,
      points: reasonCode === 'qualifying_evidence' ? maximumPoints : 0,
      state: reasonCode === 'capability_unavailable' ? 'unavailable' as const
        : reasonCode === 'qualifying_evidence' ? 'accepted' as const : 'insufficient_evidence' as const,
      reasonCode, evidenceIds, grace: { allowanceMs: SECURITY_GRACE_MS, protectedMs, unprotectedMs, unknownMs },
    });
    if (input.rules.capabilities[category] !== 'verified_authentication') return report('capability_unavailable');
    const coverage = input.coverage.find(row => row.category === category);
    if (!coverage) return report('coverage_producer_unavailable');
    const collectsFrom = reputationInstant(coverage.collectionStartsAt);
    const completeThrough = reputationInstant(coverage.completeThrough);
    if (completeThrough < collectsFrom || !Array.isArray(coverage.knownUnprotected)) throw new Error('monthly_security_coverage_invalid');
    const clip = (a: number, b: number): Span => [Math.max(start, a), Math.min(cutoff, b)];
    const protectedIntervals = input.evidence.flatMap(item => {
      if (item.facts.kind !== 'protection' || !item.facts.protections.includes(category)) return [];
      const from = reputationInstant(item.performedAt);
      const until = Math.min(item.revokedAt === null ? Infinity : reputationInstant(item.revokedAt),
        item.facts.expiresAt === null ? Infinity : reputationInstant(item.facts.expiresAt));
      return from < cutoff && until > start ? [{ item, from, until }] : [];
    });
    const protectedSpans = union(protectedIntervals.map(row => clip(row.from, row.until)));
    const off = coverage.knownUnprotected.map(row => {
      const a = reputationInstant(row.startsAt), b = reputationInstant(row.endsAt);
      if (b <= a || a < collectsFrom || b > completeThrough) throw new Error('monthly_security_coverage_invalid');
      return clip(a, b);
    });
    const unprotected = subtract(off, protectedSpans);
    const unknown = subtract([[start, cutoff]], [...protectedSpans, ...unprotected]);
    const protectedMs = duration(protectedSpans), unprotectedMs = duration(unprotected), unknownMs = duration(unknown);
    const ids = protectedIntervals.map(row => row.item.id);
    if (collectsFrom > start || completeThrough < cutoff || unknownMs > 0) return report('coverage_history_incomplete', protectedMs, unprotectedMs, unknownMs, ids);
    if (!protectedIntervals.some(row => row.from <= start && row.until > start)) return report('not_enrolled_before_calendar_month', protectedMs, unprotectedMs, unknownMs, ids);
    if (unprotectedMs > SECURITY_GRACE_MS) return report('monthly_grace_exceeded', protectedMs, unprotectedMs, unknownMs, ids);
    const authentication = input.evidence.find(item => item.facts.kind === 'authentication'
      && item.facts.protections.includes(category) && reputationInstant(item.performedAt) >= start
      && reputationInstant(item.performedAt) < cutoff && (item.revokedAt === null || reputationInstant(item.revokedAt) >= cutoff)
      && protectedIntervals.some(row => row.item.facts.kind === 'protection' && item.facts.kind === 'authentication'
        && row.item.facts.credentialId === item.facts.credentialId
        && reputationInstant(item.performedAt) >= row.from && reputationInstant(item.performedAt) < row.until));
    return authentication ? report('qualifying_evidence', protectedMs, unprotectedMs, unknownMs, [...ids, authentication.id])
      : report('qualifying_authentication_missing', protectedMs, unprotectedMs, unknownMs, ids);
  });
  return { policyVersion: MONTHLY_SECURITY_V05, categories,
    monthlyPoints: baseline.monthlyPoints - baseline.actions.filter(row =>
      ['monthly.mfa_maintenance', 'monthly.credential_maintenance'].includes(row.actionId)).reduce((sum, row) => sum + row.points, 0)
      + categories.reduce((sum, row) => sum + row.points, 0),
    maximumSecurityPoints: 1_250 as const };
}
