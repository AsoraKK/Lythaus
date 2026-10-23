import { nextReputationMonth, reputationInstant, requireSourceMonth } from './monthly-reputation-policy.ts';
import { validateMonthlyMaintenanceRules, type MonthlyMaintenanceEvidence, type MonthlyMaintenanceRules } from './monthly-maintenance-policy.ts';

type Protection = 'mfa' | 'credential';
export interface SecurityChoiceChange {
  id: string;
  subjectUserId: string;
  revision: number;
  sourceKind: 'device_preference' | 'account_credential';
  optionKey: string;
  credentialId: string | null;
  state: 'enabled' | 'disabled' | 'revoked';
  effectiveAt: string;
}

export interface SecurityChoiceInterval extends SecurityChoiceChange { effectiveUntil: string | null }

export interface SecurityChoiceMapping {
  version: string;
  status: 'approved_for_shadow';
  policyVersion: string;
  catalogueHash: string;
  maintenanceRulesVersion: string;
  timezone: 'UTC';
  options: Readonly<Record<string, readonly Protection[]>>;
}

export function securityChoiceIntervals(subjectUserId: string, changes: readonly SecurityChoiceChange[]) {
  const ordered = [...changes].sort((a, b) => a.revision - b.revision);
  const ids = new Set<string>();
  let previousRevision = 0, previousTime = -Infinity, complete = true;
  for (const change of ordered) {
    const time = reputationInstant(change.effectiveAt);
    if (change.subjectUserId !== subjectUserId || !change.id || ids.has(change.id)
      || !Number.isSafeInteger(change.revision) || change.revision < 1
      || !change.optionKey || !['device_preference', 'account_credential'].includes(change.sourceKind)
      || !['enabled', 'disabled', 'revoked'].includes(change.state)
      || change.revision <= previousRevision || time < previousTime) {
      throw new Error('monthly_security_choice_invalid');
    }
    if (change.revision !== previousRevision + 1) complete = false;
    ids.add(change.id); previousRevision = change.revision; previousTime = time;
  }
  const intervals: SecurityChoiceInterval[] = ordered.map((change, index) => ({ ...change,
    effectiveUntil: ordered[index + 1]?.effectiveAt ?? null }));
  return { intervals, complete };
}

export function selectedSecurityMaintenanceEvidence(input: {
  enabled?: boolean; subjectUserId: string; sourceMonth: string; evaluatedAt: string; collectFrom: string;
  policyVersion: string; catalogueHash: string; rules: MonthlyMaintenanceRules;
  mapping?: SecurityChoiceMapping; changes: readonly SecurityChoiceChange[];
  serverEvidence: readonly MonthlyMaintenanceEvidence[];
}) {
  requireSourceMonth(input.sourceMonth);
  validateMonthlyMaintenanceRules(input.rules);
  const startAt = `${input.sourceMonth}-01T00:00:00.000Z`;
  const cutoffAt = `${nextReputationMonth(input.sourceMonth)}-01T00:00:00.000Z`;
  const start = reputationInstant(startAt), cutoff = reputationInstant(cutoffAt);
  const now = reputationInstant(input.evaluatedAt), collectFrom = reputationInstant(input.collectFrom);
  const settled = cutoff + input.rules.monthSettlementHours * 3_600_000;
  const period = { startAt, cutoffAt, settledAt: new Date(settled).toISOString(), timezone: 'UTC' as const };
  const timeline = securityChoiceIntervals(input.subjectUserId, input.changes);
  const output = (state: 'inactive' | 'unavailable' | 'open' | 'settling' | 'insufficient_evidence' | 'ready', reason: string,
    evidence: MonthlyMaintenanceEvidence[] = []) => ({ state, reason, period,
    intervals: timeline.intervals, mappingVersion: input.mapping?.version ?? null, evidence });
  if (input.enabled !== true) return output('inactive', 'collection_disabled');
  const mapping = input.mapping;
  if (!mapping) return output('unavailable', 'option_award_mapping_pending');
  if (mapping.status !== 'approved_for_shadow' || !mapping.version || mapping.policyVersion !== input.policyVersion
    || mapping.catalogueHash !== input.catalogueHash || mapping.maintenanceRulesVersion !== input.rules.version
    || mapping.timezone !== 'UTC') return output('unavailable', 'versioned_mapping_unavailable');
  if (now < cutoff) return output('open', 'calendar_month_open');
  if (now < settled) return output('settling', 'month_settlement_pending');
  if (!timeline.complete || collectFrom > start) return output('insufficient_evidence', 'coverage_history_incomplete');
  const intervals = timeline.intervals.filter(item => reputationInstant(item.effectiveAt) < cutoff
    && (item.effectiveUntil === null || reputationInstant(item.effectiveUntil) > Math.max(start, reputationInstant(item.effectiveAt))));
  if (intervals.some(item => item.sourceKind === 'device_preference')) return output('unavailable', 'local_choice_is_not_credential_coverage');
  let through = start, selected: string | undefined;
  for (const interval of intervals) {
    if (reputationInstant(interval.effectiveAt) > through || interval.state !== 'enabled' || !interval.credentialId) {
      return output('insufficient_evidence', 'selection_gap_or_disabled');
    }
    selected ??= interval.optionKey;
    if (interval.optionKey !== selected) return output('insufficient_evidence', 'selected_option_changed_midmonth');
    through = interval.effectiveUntil === null ? cutoff : Math.min(cutoff, reputationInstant(interval.effectiveUntil));
  }
  if (through < cutoff || !selected) return output('insufficient_evidence', 'incomplete_calendar_month_selection');
  const protections = mapping.options[selected];
  if (!Array.isArray(protections) || !protections.length || new Set(protections).size !== protections.length
    || protections.some(p => !['mfa', 'credential'].includes(p))) return output('unavailable', 'selected_option_unmapped');
  if (protections.some((p: Protection) => input.rules.capabilities[p] !== 'verified_authentication')) return output('unavailable', 'credential_capability_unavailable');
  const evidence: MonthlyMaintenanceEvidence[] = [], seen = new Set<string>();
  for (const item of input.serverEvidence) {
    if (item.subjectUserId !== input.subjectUserId || !item.id || seen.has(item.id)) throw new Error('monthly_security_evidence_invalid');
    seen.add(item.id);
    const performed = reputationInstant(item.performedAt);
    if (item.revokedAt !== null && reputationInstant(item.revokedAt) < performed) throw new Error('monthly_security_evidence_invalid');
    if (item.facts.kind !== 'protection' && item.facts.kind !== 'authentication') continue;
    const facts = item.facts;
    const allowed = facts.protections.filter(p => protections.includes(p));
    if (!allowed.length) continue;
    for (const interval of intervals) {
      if (interval.credentialId !== facts.credentialId) continue;
      const from = reputationInstant(interval.effectiveAt);
      const until = interval.effectiveUntil === null ? Infinity : reputationInstant(interval.effectiveUntil);
      if (facts.kind === 'authentication') {
        if (performed >= from && performed < until) evidence.push({ ...item, facts: { ...facts, protections: allowed } });
        continue;
      }
      const expires = facts.expiresAt === null ? Infinity : reputationInstant(facts.expiresAt);
      const end = Math.min(expires, until, item.revokedAt === null ? Infinity : reputationInstant(item.revokedAt));
      const begins = Math.max(performed, from);
      if (begins >= end) continue;
      evidence.push({ ...item, id: `${item.id}:${interval.id}`, performedAt: new Date(begins).toISOString(),
        facts: { ...facts, protections: allowed, expiresAt: Number.isFinite(end) ? new Date(end).toISOString() : null } });
    }
  }
  return output('ready', 'server_evidence_prepared_for_existing_calculator', evidence);
}
