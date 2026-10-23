import { nextReputationMonth, reputationInstant, requireSourceMonth } from './monthly-reputation-policy.ts';
import { validateMonthlyMaintenanceRules, type MonthlyMaintenanceEvidence, type MonthlyMaintenanceRules, type calculateMonthlyMaintenance } from './monthly-maintenance-policy.ts';
import { evaluateMonthlySecurityGrace, MONTHLY_SECURITY_GRACE_POLICY } from './monthly-security-grace.ts';

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
  securityRequirementVersion: typeof MONTHLY_SECURITY_GRACE_POLICY;
  commonBenefitAction: 'monthly.credential_maintenance' | 'monthly.mfa_maintenance';
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
    evidence: MonthlyMaintenanceEvidence[] = [], grace?: ReturnType<typeof evaluateMonthlySecurityGrace>['grace']) => ({ state, reason, period,
    intervals: timeline.intervals, mappingVersion: input.mapping?.version ?? null, evidence, grace,
    commonBenefitAction: input.mapping?.commonBenefitAction ?? null });
  if (input.enabled !== true) return output('inactive', 'collection_disabled');
  const mapping = input.mapping;
  if (!mapping) return output('unavailable', 'option_award_mapping_pending');
  if (mapping.status !== 'approved_for_shadow' || !mapping.version || mapping.policyVersion !== input.policyVersion
    || mapping.catalogueHash !== input.catalogueHash || mapping.maintenanceRulesVersion !== input.rules.version
    || mapping.timezone !== 'UTC' || mapping.securityRequirementVersion !== MONTHLY_SECURITY_GRACE_POLICY
    || !['monthly.credential_maintenance', 'monthly.mfa_maintenance'].includes(mapping.commonBenefitAction)) return output('unavailable', 'versioned_mapping_unavailable');
  if (now < cutoff) return output('open', 'calendar_month_open');
  if (now < settled) return output('settling', 'month_settlement_pending');
  if (!timeline.complete || collectFrom > start) return output('insufficient_evidence', 'coverage_history_incomplete');
  const intervals = timeline.intervals.filter(item => reputationInstant(item.effectiveAt) < cutoff
    && (item.effectiveUntil === null || reputationInstant(item.effectiveUntil) > Math.max(start, reputationInstant(item.effectiveAt))));
  if (intervals.some(item => item.sourceKind === 'device_preference')) return output('unavailable', 'local_choice_is_not_credential_coverage');
  if (Object.values(mapping.options).flat().some(p => !['mfa', 'credential'].includes(p))) return output('unavailable', 'selected_option_unmapped');
  const protections = intervals.filter(interval => interval.state === 'enabled')
    .flatMap(interval => mapping.options[interval.optionKey] ?? []);
  if (protections.some((p: Protection) => input.rules.capabilities[p] !== 'verified_authentication')) return output('unavailable', 'credential_capability_unavailable');
  const commonBudget = mapping.commonBenefitAction === 'monthly.mfa_maintenance' ? 'mfa' : 'credential';
  if (input.rules.capabilities[commonBudget] !== 'verified_authentication') {
    return output('unavailable', 'common_security_benefit_unavailable');
  }
  const result = evaluateMonthlySecurityGrace({ subjectUserId: input.subjectUserId, startsAt: startAt, cutoffAt,
    intervals: timeline.intervals, mapping, serverEvidence: input.serverEvidence });
  return output(result.eligible ? 'ready' : 'insufficient_evidence', result.reason, result.evidence, result.grace);
}

export function applyCommonSecurityBenefit(report: ReturnType<typeof calculateMonthlyMaintenance>, decision: {
  state: string; reason: string; commonBenefitAction?: string | null; evidence: readonly MonthlyMaintenanceEvidence[];
}) {
  const actions = report.actions.map(action => {
    if (!['monthly.credential_maintenance', 'monthly.mfa_maintenance'].includes(action.actionId)) return action;
    const accepted = decision.state === 'ready' && action.actionId === decision.commonBenefitAction && action.state !== 'unavailable';
    return { ...action, points: accepted ? action.maximumPoints : 0,
      state: accepted ? 'accepted' as const : decision.state === 'unavailable' || action.state === 'unavailable' ? 'unavailable' as const
        : decision.state === 'ready' ? 'withheld' as const : 'insufficient_evidence' as const,
      reasonCode: accepted ? 'monthly_security_requirement_met' : action.state === 'unavailable' ? action.reasonCode
        : decision.state === 'ready' ? 'single_common_security_benefit_only' : decision.reason,
      evidenceIds: accepted ? decision.evidence.map(item => item.id) : [],
      validFrom: accepted ? `${report.sourceMonth}-01T00:00:00.000Z` : null,
      validUntil: accepted ? report.sourceCutoff : null };
  });
  return { ...report, actions, monthlyPoints: actions.filter(action => action.actionId.startsWith('monthly.')).reduce((sum, action) => sum + action.points, 0) };
}
