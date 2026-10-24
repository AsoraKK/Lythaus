import { reputationInstant } from './monthly-reputation-policy.ts';
import type { MonthlyMaintenanceEvidence } from './monthly-maintenance-policy.ts';
import type { SecurityChoiceInterval, SecurityChoiceMapping } from './monthly-security-choice.ts';

export const MONTHLY_SECURITY_GRACE_POLICY = 'member-security-calendar-grace-24h-v1';
export const MONTHLY_SECURITY_GRACE_MS = 24 * 60 * 60 * 1000;
type Span = [number, number];

function union(spans: readonly Span[]): Span[] {
  const result: Span[] = [];
  for (const [start, end] of [...spans].filter(([a, b]) => a < b).sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}
function subtract(spans: readonly Span[], covered: readonly Span[]): Span[] {
  return union(spans).flatMap(([start, end]) => {
    const result: Span[] = []; let through = start;
    for (const [a, b] of union(covered)) {
      if (b <= through || a >= end) continue;
      if (a > through) result.push([through, Math.min(a, end)]);
      through = Math.max(through, b);
    }
    if (through < end) result.push([through, end]);
    return result;
  });
}
const duration = (spans: readonly Span[]) => spans.reduce((sum, [a, b]) => sum + b - a, 0);
const describe = (spans: readonly Span[]) => spans.map(([a, b]) => ({ startsAt: new Date(a).toISOString(), endsAt: new Date(b).toISOString() }));

export function evaluateMonthlySecurityGrace(input: {
  subjectUserId: string; startsAt: string; cutoffAt: string; intervals: readonly SecurityChoiceInterval[];
  mapping: SecurityChoiceMapping; serverEvidence: readonly MonthlyMaintenanceEvidence[];
}) {
  const start = reputationInstant(input.startsAt), cutoff = reputationInstant(input.cutoffAt);
  const clip = (from: number, until: number): Span => [Math.max(start, from), Math.min(cutoff, until)];
  const protectedSpans: Span[] = [], knownOff: Span[] = [];
  const evidence: MonthlyMaintenanceEvidence[] = [], seen = new Set<string>();
  let enrolledBeforeMonth = false, unmapped = false;
  const choices = input.intervals.filter(choice => reputationInstant(choice.effectiveAt) < cutoff);
  for (const choice of choices) {
    const protections = input.mapping.options[choice.optionKey];
    const from = reputationInstant(choice.effectiveAt), until = choice.effectiveUntil === null ? cutoff : reputationInstant(choice.effectiveUntil);
    if (until <= Math.max(start, from)) continue;
    if (choice.sourceKind !== 'account_credential' || !choice.credentialId || !protections?.length) { unmapped = true; continue; }
    if (choice.state !== 'enabled') knownOff.push(clip(from, until));
  }
  for (const item of input.serverEvidence) {
    if (item.subjectUserId !== input.subjectUserId || !item.id || seen.has(item.id)) throw new Error('monthly_security_evidence_invalid');
    seen.add(item.id);
    const performed = reputationInstant(item.performedAt);
    const revoked = item.revokedAt === null ? Infinity : reputationInstant(item.revokedAt);
    if (revoked < performed) throw new Error('monthly_security_evidence_invalid');
    const facts = item.facts;
    if (facts.kind !== 'protection') continue;
    const expires = facts.expiresAt === null ? Infinity : reputationInstant(facts.expiresAt);
    if (expires <= performed) throw new Error('monthly_security_evidence_invalid');
    const actualEnd = Math.min(expires, revoked);
    for (const choice of choices) {
      if (choice.sourceKind !== 'account_credential' || choice.credentialId !== facts.credentialId) continue;
      const allowed = facts.protections.filter(p => input.mapping.options[choice.optionKey]?.includes(p));
      if (!allowed.length) continue;
      const from = reputationInstant(choice.effectiveAt), until = choice.effectiveUntil === null ? cutoff : reputationInstant(choice.effectiveUntil);
      if (choice.state !== 'enabled') continue;
      const begins = Math.max(performed, from), ends = Math.min(actualEnd, until);
      if (begins <= start && begins < ends) enrolledBeforeMonth = true;
      if (Number.isFinite(actualEnd)) knownOff.push(clip(Math.max(actualEnd, from), until));
      const span = clip(begins, ends);
      if (span[0] >= span[1]) continue;
      protectedSpans.push(span);
      evidence.push({ ...item, id: `${item.id}:${choice.id}`, performedAt: new Date(span[0]).toISOString(),
        facts: { ...facts, protections: allowed, expiresAt: new Date(span[1]).toISOString() } });
    }
  }
  const protectedUnion = union(protectedSpans);
  const unprotected = subtract(knownOff, protectedUnion);
  const unknown = subtract([[start, cutoff]], [...protectedUnion, ...unprotected]);
  for (const item of input.serverEvidence) {
    const facts = item.facts;
    if (facts.kind !== 'authentication') continue;
    const performed = reputationInstant(item.performedAt);
    if (performed < start || performed >= cutoff || item.revokedAt !== null && reputationInstant(item.revokedAt) < cutoff) continue;
    if (evidence.some(coverage => coverage.facts.kind === 'protection' && coverage.facts.credentialId === facts.credentialId
      && facts.protections.some(p => coverage.facts.kind === 'protection' && coverage.facts.protections.includes(p))
      && performed >= reputationInstant(coverage.performedAt)
      && performed < reputationInstant(coverage.facts.expiresAt!))) evidence.push(item);
  }
  const grace = { policyVersion: MONTHLY_SECURITY_GRACE_POLICY, allowanceMs: MONTHLY_SECURITY_GRACE_MS,
    verifiedUnprotectedMs: duration(unprotected), unknownMs: duration(unknown),
    protectedMs: duration(protectedUnion), unprotectedIntervals: describe(unprotected), unknownIntervals: describe(unknown) };
  const reason = unmapped ? 'selected_option_unmapped' : !enrolledBeforeMonth ? 'not_enrolled_before_calendar_month'
    : unknown.length ? 'coverage_telemetry_unknown' : grace.verifiedUnprotectedMs > MONTHLY_SECURITY_GRACE_MS ? 'monthly_grace_exceeded'
      : !evidence.some(item => item.facts.kind === 'authentication') ? 'qualifying_authentication_missing' : 'monthly_security_requirement_met';
  return { eligible: reason === 'monthly_security_requirement_met', reason, grace,
    evidence: reason === 'monthly_security_requirement_met' ? evidence : [] };
}
