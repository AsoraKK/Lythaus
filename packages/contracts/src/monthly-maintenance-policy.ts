import { MONTHLY_REPUTATION_POLICY_VERSION, nextReputationMonth, reputationInstant, requireSourceMonth } from './monthly-reputation-policy.ts';
import { proposedQuarterlyEmailComponent, proposedQuarterlyEmailExpiry } from './monthly-reputation-decisions.ts';

export interface MonthlyMaintenanceRules {
  version: string;
  status: 'pending_owner_approval';
  monthSettlementHours: number;
  protectionCoverage: 'whole_calendar_month';
  emailValidity: 'three_calendar_months';
  integrityRubric: string | null;
  refresherPolicy: string | null;
  capabilities: {
    integrity: 'unavailable' | 'reviewed_assessment';
    mfa: 'unavailable' | 'verified_authentication';
    credential: 'unavailable' | 'verified_authentication';
    challenge: 'unavailable' | 'account_bound_turnstile';
    refresher: 'unavailable' | 'server_comprehension';
    email: 'verified_email_control';
  };
}

export const PROPOSED_MONTHLY_MAINTENANCE_RULES = Object.freeze<MonthlyMaintenanceRules>({
  version: 'monthly-maintenance-defaults-proposal-v1', status: 'pending_owner_approval',
  monthSettlementHours: 72, protectionCoverage: 'whole_calendar_month', emailValidity: 'three_calendar_months',
  integrityRubric: null, refresherPolicy: null,
  capabilities: Object.freeze({ integrity: 'unavailable', mfa: 'unavailable', credential: 'unavailable',
    challenge: 'unavailable', refresher: 'unavailable', email: 'verified_email_control' }),
});

export type MaintenanceFacts =
  | { kind: 'email_control'; emailVersion: string }
  | { kind: 'integrity_assessment'; sourceMonth: string; rubricVersion: string;
      status: 'eligible' | 'pending_review' | 'insufficient_evidence' | 'confirmed_ineligible' }
  | { kind: 'protection'; credentialId: string; protections: readonly ('mfa' | 'credential')[]; expiresAt: string | null }
  | { kind: 'authentication'; credentialId: string; protections: readonly ('mfa' | 'credential')[] }
  | { kind: 'anti_automation'; provider: 'turnstile'; contextId: string; action: string; hostname: string; accountBound: true }
  | { kind: 'policy_refresher'; policyVersion: string };

export interface MonthlyMaintenanceEvidence {
  id: string;
  subjectUserId: string;
  performedAt: string;
  revokedAt: string | null;
  facts: MaintenanceFacts;
}

export interface MonthlyMaintenanceAction {
  actionId: string;
  maximumPoints: number;
  points: number;
  state: 'accepted' | 'pending_review' | 'withheld' | 'insufficient_evidence' | 'unavailable';
  reasonCode: string;
  evidenceIds: readonly string[];
  validFrom: string | null;
  validUntil: string | null;
}

export function validateMonthlyMaintenanceRules(rules: MonthlyMaintenanceRules): void {
  if (!rules || !rules.version || rules.status !== 'pending_owner_approval'
    || rules.protectionCoverage !== 'whole_calendar_month' || rules.emailValidity !== 'three_calendar_months'
    || !Number.isSafeInteger(rules.monthSettlementHours) || rules.monthSettlementHours < 1 || rules.monthSettlementHours > 720
    || !rules.capabilities) throw new Error('monthly_maintenance_rules_invalid');
  for (const [key, allowed] of Object.entries({ integrity: 'reviewed_assessment', mfa: 'verified_authentication',
    credential: 'verified_authentication', challenge: 'account_bound_turnstile', refresher: 'server_comprehension', email: 'verified_email_control' })) {
    const capability = rules.capabilities[key as keyof MonthlyMaintenanceRules['capabilities']];
    if (capability !== allowed && (key === 'email' || capability !== 'unavailable')) throw new Error('monthly_maintenance_rules_invalid');
  }
  if ((rules.capabilities.integrity !== 'unavailable' && !rules.integrityRubric)
    || (rules.capabilities.refresher !== 'unavailable' && !rules.refresherPolicy)) throw new Error('monthly_maintenance_rules_invalid');
}

export function calculateMonthlyMaintenance(input: {
  subjectUserId: string; sourceMonth: string; rules: MonthlyMaintenanceRules;
  evidence: readonly MonthlyMaintenanceEvidence[];
}) {
  validateMonthlyMaintenanceRules(input.rules);
  requireSourceMonth(input.sourceMonth);
  const startsAt = `${input.sourceMonth}-01T00:00:00.000Z`;
  const cutoffAt = `${nextReputationMonth(input.sourceMonth)}-01T00:00:00.000Z`;
  const start = reputationInstant(startsAt), cutoff = reputationInstant(cutoffAt);
  const seen = new Set<string>();
  const evidence = [...input.evidence].sort((a, b) => a.performedAt.localeCompare(b.performedAt) || a.id.localeCompare(b.id));
  for (const item of evidence) {
    if (!item.id || seen.has(item.id) || item.subjectUserId !== input.subjectUserId) throw new Error('monthly_maintenance_evidence_invalid');
    seen.add(item.id);
    const performed = reputationInstant(item.performedAt);
    if (item.revokedAt !== null && reputationInstant(item.revokedAt) < performed) throw new Error('monthly_maintenance_evidence_invalid');
    const facts = item.facts;
    const reference = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 150;
    const protections = (value: unknown) => Array.isArray(value) && value.length > 0 && value.length <= 2
      && new Set(value).size === value.length && value.every(entry => entry === 'mfa' || entry === 'credential');
    if (!facts || !['email_control', 'integrity_assessment', 'protection', 'authentication', 'anti_automation', 'policy_refresher'].includes(facts.kind)
      || (facts.kind === 'email_control' && !reference(facts.emailVersion))
      || (facts.kind === 'integrity_assessment' && (!reference(facts.rubricVersion)
        || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(facts.sourceMonth)
        || !['eligible', 'pending_review', 'insufficient_evidence', 'confirmed_ineligible'].includes(facts.status)))
      || ((facts.kind === 'protection' || facts.kind === 'authentication') && (!reference(facts.credentialId) || !protections(facts.protections)))
      || (facts.kind === 'anti_automation' && (facts.provider !== 'turnstile' || facts.accountBound !== true
        || !reference(facts.contextId) || !reference(facts.action) || !reference(facts.hostname)))
      || (facts.kind === 'policy_refresher' && !reference(facts.policyVersion))) throw new Error('monthly_maintenance_evidence_invalid');
    if (item.facts.kind === 'protection' && item.facts.expiresAt !== null && reputationInstant(item.facts.expiresAt) <= performed) throw new Error('monthly_maintenance_evidence_invalid');
  }
  const liveAtCutoff = (item: MonthlyMaintenanceEvidence) => item.revokedAt === null || reputationInstant(item.revokedAt) >= cutoff;
  const duringMonth = (item: MonthlyMaintenanceEvidence) => reputationInstant(item.performedAt) >= start && reputationInstant(item.performedAt) < cutoff;
  const actions: MonthlyMaintenanceAction[] = [];
  function action(name: string, maximumPoints: number, capability: keyof MonthlyMaintenanceRules['capabilities']): MonthlyMaintenanceAction {
    const unavailable = input.rules.capabilities[capability] === 'unavailable';
    const row: MonthlyMaintenanceAction = { actionId: name, maximumPoints, points: 0,
      state: unavailable ? 'unavailable' : 'insufficient_evidence', reasonCode: unavailable ? 'capability_unavailable' : 'qualifying_evidence_missing',
      evidenceIds: [], validFrom: null, validUntil: null };
    actions.push(row); return row;
  }
  function accept(row: MonthlyMaintenanceAction, supporting: readonly MonthlyMaintenanceEvidence[]) {
    row.points = row.maximumPoints; row.state = 'accepted'; row.reasonCode = 'qualifying_evidence';
    row.evidenceIds = [...new Set(supporting.map(item => item.id))].sort();
  }
  const integrity = action('monthly.account_integrity', 500, 'integrity');
  if (integrity.state !== 'unavailable') {
    const assessment = evidence.filter(item => item.facts.kind === 'integrity_assessment'
      && item.facts.sourceMonth === input.sourceMonth && item.facts.rubricVersion === input.rules.integrityRubric && liveAtCutoff(item)).at(-1);
    if (assessment?.facts.kind === 'integrity_assessment') {
      integrity.evidenceIds = [assessment.id];
      if (assessment.facts.status === 'eligible') accept(integrity, [assessment]);
      else { integrity.state = assessment.facts.status === 'confirmed_ineligible' ? 'withheld' : assessment.facts.status; integrity.reasonCode = assessment.facts.status; }
    }
  }
  for (const [protection, name, maximum] of [['mfa', 'monthly.mfa_maintenance', 250], ['credential', 'monthly.credential_maintenance', 1000]] as const) {
    const row = action(name, maximum, protection);
    if (row.state === 'unavailable') continue;
    const coverage = evidence.flatMap(item => {
      if (item.facts.kind !== 'protection' || !item.facts.protections.includes(protection)) return [];
      const from = reputationInstant(item.performedAt);
      const until = Math.min(item.revokedAt === null ? Infinity : reputationInstant(item.revokedAt),
        item.facts.expiresAt === null ? Infinity : reputationInstant(item.facts.expiresAt));
      return from < cutoff && until > start ? [{ item, from, until, credentialId: item.facts.credentialId }] : [];
    });
    let through = start;
    for (const interval of coverage) { if (interval.from > through) break; through = Math.max(through, interval.until); }
    row.evidenceIds = coverage.map(interval => interval.item.id);
    if (through < cutoff) { row.reasonCode = 'incomplete_month_coverage'; continue; }
    const authentication = evidence.find(item => item.facts.kind === 'authentication'
      && item.facts.protections.includes(protection) && duringMonth(item) && liveAtCutoff(item)
      && coverage.some(interval => item.facts.kind === 'authentication' && interval.credentialId === item.facts.credentialId
        && reputationInstant(item.performedAt) >= interval.from && reputationInstant(item.performedAt) < interval.until));
    if (!authentication) { row.reasonCode = 'qualifying_authentication_missing'; continue; }
    accept(row, [...coverage.map(interval => interval.item), authentication]); row.validFrom = startsAt; row.validUntil = cutoffAt;
  }
  const challenge = action('monthly.anti_automation', 500, 'challenge');
  if (challenge.state !== 'unavailable') {
    const proof = evidence.find(item => item.facts.kind === 'anti_automation' && item.facts.provider === 'turnstile'
      && item.facts.accountBound === true && item.facts.contextId && item.facts.action && item.facts.hostname && duringMonth(item) && liveAtCutoff(item));
    if (proof) accept(challenge, [proof]);
  }
  const refresher = action('monthly.policy_refresher', 250, 'refresher');
  if (refresher.state !== 'unavailable') {
    const proof = evidence.find(item => item.facts.kind === 'policy_refresher' && item.facts.policyVersion === input.rules.refresherPolicy && duringMonth(item) && liveAtCutoff(item));
    if (proof) accept(refresher, [proof]);
  }
  const email = action('quarterly.email_control', 1000, 'email');
  const proof = evidence.filter(item => item.facts.kind === 'email_control' && reputationInstant(item.performedAt) < cutoff).at(-1);
  if (proof?.facts.kind === 'email_control') {
    const component = proposedQuarterlyEmailComponent({ subjectUserId: input.subjectUserId,
      emailVersion: proof.facts.emailVersion, sourceCutoff: cutoffAt,
      proof: { subjectUserId: proof.subjectUserId, emailVersion: proof.facts.emailVersion, verifiedAt: proof.performedAt, revokedAt: proof.revokedAt } });
    email.evidenceIds = [proof.id]; email.validFrom = proof.performedAt; email.validUntil = proposedQuarterlyEmailExpiry(proof.performedAt);
    if (component.points) accept(email, [proof]);
    else { email.state = 'withheld'; email.reasonCode = component.reason; }
  }
  return { policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, rulesVersion: input.rules.version,
    sourceMonth: input.sourceMonth, sourceCutoff: cutoffAt, actions,
    monthlyPoints: actions.filter(row => row.actionId.startsWith('monthly.')).reduce((sum, row) => sum + row.points, 0),
    quarterlyPoints: email.points as 0 | 1000 };
}
