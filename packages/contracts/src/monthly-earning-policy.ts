import { MONTHLY_REPUTATION_POLICY_VERSION, reputationInstant } from './monthly-reputation-policy.ts';
import { proposedClosingSundayWeek } from './monthly-reputation-decisions.ts';

export interface WeeklyEarningRules {
  version: string;
  status: 'pending_owner_approval';
  periodPolicyVersion: string;
  settlementHours: number;
  discussionContributions: number;
  sourceUnitPoints: number;
  helpUnitPoints: number;
  breadthRequiredFamilies: number;
  usefulnessMinimum: number;
  usefulnessFullPercent: number;
  usefulnessPartialPercent: number;
  receptionOutcomePoints: number;
}

export const PROPOSED_WEEKLY_EARNING_RULES = Object.freeze<WeeklyEarningRules>({
  version: 'weekly-earning-defaults-proposal-v1', status: 'pending_owner_approval' as const,
  periodPolicyVersion: 'closing-sunday-utc-proposal-v1', settlementHours: 72,
  discussionContributions: 1, sourceUnitPoints: 150, helpUnitPoints: 125,
  breadthRequiredFamilies: 4, usefulnessMinimum: 5, usefulnessFullPercent: 80,
  usefulnessPartialPercent: 60, receptionOutcomePoints: 125,
});

export type PrimaryContributionKind = 'post' | 'own_comment' | 'own_reply' | 'other_comment'
  | 'other_reply' | 'source' | 'correction' | 'help' | 'accessibility' | 'peer_ballot';
export type ContributionEvidenceState = 'accepted' | 'pending_review' | 'withheld' | 'reversed';

export interface WeeklyContributionEvidence {
  id: string;
  workId: string;
  kind: PrimaryContributionKind;
  performedAt: string;
  state: ContributionEvidenceState;
  creationMode: 'human' | 'ai_assisted' | 'not_applicable' | 'unknown';
  declarationValid: boolean;
}

export interface WeeklyReceptionEvidence {
  id: string;
  kind: 'usefulness' | 'discussion' | 'value';
  actorId: string;
  contextId: string;
  performedAt: string;
  state: ContributionEvidenceState;
  supportingWorkIds: readonly string[];
  helpful: boolean;
}

const ACTIONS = [
  ['three_human_posts', 'posts', 250], ['own_post_comment', 'own_discussion', 150],
  ['own_post_reply', 'own_discussion', 150], ['other_post_comment', 'other_discussion', 150],
  ['other_post_reply', 'other_discussion', 150], ['reception.usefulness', 'reception_usefulness', 250],
  ['reception.discussion', 'reception_discussion', 250], ['reception.value', 'reception_value', 250],
  ['declaration_compliance', 'declaration', 50], ['human_authorship', 'human_authorship', 200],
  ['peer_appeal_participation', 'peer_review', 250], ['accepted_source', 'source_correction', 300],
  ['accepted_correction', 'source_correction', 300], ['accepted_help', 'help_accessibility', 250],
  ['accepted_accessibility', 'help_accessibility', 250], ['breadth', 'breadth', 150],
] as const;
const PRIMARY_ACTION: Record<PrimaryContributionKind, string> = {
  post: 'three_human_posts', own_comment: 'own_post_comment', own_reply: 'own_post_reply',
  other_comment: 'other_post_comment', other_reply: 'other_post_reply', source: 'accepted_source',
  correction: 'accepted_correction', help: 'accepted_help', accessibility: 'accepted_accessibility',
  peer_ballot: 'peer_appeal_participation',
};
const STATES = ['accepted', 'pending_review', 'withheld', 'reversed'];

export function validateWeeklyEarningRules(rules: WeeklyEarningRules): void {
  if (!rules || rules.status !== 'pending_owner_approval' || !rules.version
    || rules.periodPolicyVersion !== 'closing-sunday-utc-proposal-v1') throw new Error('monthly_earning_rules_invalid');
  for (const [value, maximum] of [
    [rules.settlementHours, 720], [rules.discussionContributions, 100], [rules.sourceUnitPoints, 300],
    [rules.helpUnitPoints, 250], [rules.breadthRequiredFamilies, 6], [rules.usefulnessMinimum, 1000],
    [rules.usefulnessFullPercent, 100], [rules.usefulnessPartialPercent, 100], [rules.receptionOutcomePoints, 250],
  ]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error('monthly_earning_rules_invalid');
  }
  if (rules.usefulnessPartialPercent >= rules.usefulnessFullPercent) throw new Error('monthly_earning_rules_invalid');
}

export interface WeeklyActionResult {
  actionId: string;
  capGroup: string;
  allowance: number;
  remainingInGroup: number;
  points: number;
  accepted: number;
  pending: number;
  withheld: number;
  evidenceIds: string[];
  reason: 'no_evidence' | 'pending_review' | 'withheld' | 'milestone_incomplete' | 'shared_cap_reached' | 'earned' | 'insufficient_evidence';
}

export function calculateProposedWeeklyEarning(input: {
  subjectUserId: string;
  startsAt: string;
  evaluatedAt: string;
  rules: WeeklyEarningRules;
  contributions: readonly WeeklyContributionEvidence[];
  reception: readonly WeeklyReceptionEvidence[];
}) {
  validateWeeklyEarningRules(input.rules);
  const week = proposedClosingSundayWeek(input.startsAt);
  if (week.startsAt !== input.startsAt) throw new Error('monthly_earning_week_invalid');
  const start = reputationInstant(week.startsAt), end = reputationInstant(week.endsAt);
  const evaluated = reputationInstant(input.evaluatedAt);
  if (evaluated < start) throw new Error('monthly_earning_performance_time_invalid');
  const identities = new Set<string>();
  const works = new Set<string>();
  const validInstant = (value: string) => {
    const time = reputationInstant(value);
    if (time < start || time >= end || time > evaluated) throw new Error('monthly_earning_performance_time_invalid');
  };
  const rows: WeeklyActionResult[] = ACTIONS.map(([action, capGroup, allowance]) => ({
    actionId: `weekly.${action}`, capGroup, allowance, remainingInGroup: allowance, points: 0, accepted: 0, pending: 0,
    withheld: 0, evidenceIds: [], reason: 'no_evidence',
  }));
  const row = (action: string) => rows.find(item => item.actionId === `weekly.${action}`)!;
  const primary = [...input.contributions].sort((a, b) => a.performedAt.localeCompare(b.performedAt) || a.workId.localeCompare(b.workId));
  for (const evidence of primary) {
    if (!evidence.id || !evidence.workId || identities.has(evidence.id) || works.has(evidence.workId)
      || !Object.hasOwn(PRIMARY_ACTION, evidence.kind) || !STATES.includes(evidence.state)
      || !['human', 'ai_assisted', 'not_applicable', 'unknown'].includes(evidence.creationMode)
      || typeof evidence.declarationValid !== 'boolean') throw new Error('monthly_earning_evidence_invalid');
    validInstant(evidence.performedAt);
    if (evidence.state === 'accepted' && ['post', 'own_comment', 'own_reply', 'other_comment', 'other_reply'].includes(evidence.kind)
      && (!evidence.declarationValid || !['human', 'ai_assisted'].includes(evidence.creationMode))) throw new Error('monthly_earning_evidence_invalid');
    identities.add(evidence.id); works.add(evidence.workId);
    const action = row(PRIMARY_ACTION[evidence.kind]);
    if (evidence.state === 'pending_review') action.pending++;
    else if (evidence.state !== 'accepted') action.withheld++;
    else action.accepted++;
  }
  const accepted = primary.filter(item => item.state === 'accepted');
  const awards = new Map<string, number>();
  const award = (action: string, points: number, evidenceIds: string[]) => {
    const target = row(action);
    const remaining = target.allowance - (awards.get(target.capGroup) ?? 0);
    const granted = Math.min(remaining, points);
    target.points += granted;
    target.evidenceIds.push(...evidenceIds);
    target.reason = target.points ? 'earned' : 'shared_cap_reached';
    awards.set(target.capGroup, (awards.get(target.capGroup) ?? 0) + granted);
  };
  const posts = accepted.filter(item => item.kind === 'post' && item.creationMode === 'human');
  if (posts.length >= 3) award('three_human_posts', 250, posts.slice(0, 3).map(item => item.id));
  const content = accepted.filter(item => ['post', 'own_comment', 'own_reply', 'other_comment', 'other_reply'].includes(item.kind));
  const compliant = content.filter(item => item.declarationValid && ['human', 'ai_assisted'].includes(item.creationMode));
  if (compliant.length) award('declaration_compliance', 50, compliant.map(item => item.id));
  const human = compliant.filter(item => item.creationMode === 'human');
  if (human.length) award('human_authorship', 200, human.map(item => item.id));
  for (const kinds of [['own_comment', 'own_reply'], ['other_comment', 'other_reply']]) {
    const discussion = accepted.filter(item => kinds.includes(item.kind));
    if (discussion.length >= input.rules.discussionContributions) {
      const completion = discussion[input.rules.discussionContributions - 1];
      award(PRIMARY_ACTION[completion.kind], 150, discussion.slice(0, input.rules.discussionContributions).map(item => item.id));
    }
  }
  for (const item of accepted) {
    if (['source', 'correction'].includes(item.kind)) award(PRIMARY_ACTION[item.kind], input.rules.sourceUnitPoints, [item.id]);
    if (['help', 'accessibility'].includes(item.kind)) award(PRIMARY_ACTION[item.kind], input.rules.helpUnitPoints, [item.id]);
    if (item.kind === 'peer_ballot') award('peer_appeal_participation', 250, [item.id]);
  }
  const acceptedWork = new Set(accepted.map(item => item.workId));
  const reception = [...input.reception].sort((a, b) => a.performedAt.localeCompare(b.performedAt) || a.id.localeCompare(b.id));
  const unique = new Set<string>();
  const counted: WeeklyReceptionEvidence[] = [];
  for (const item of reception) {
    if (!item.id || identities.has(item.id) || !['usefulness', 'discussion', 'value'].includes(item.kind)
      || !STATES.includes(item.state) || !item.actorId || !item.contextId || typeof item.helpful !== 'boolean'
      || !Array.isArray(item.supportingWorkIds) || !item.supportingWorkIds.length) throw new Error('monthly_earning_evidence_invalid');
    validInstant(item.performedAt); identities.add(item.id);
    const target = row(`reception.${item.kind}`);
    const actorKey = `${item.kind}:actor:${item.actorId}`, contextKey = `${item.kind}:context:${item.contextId}`;
    if (item.state === 'pending_review') { target.pending++; continue; }
    if (item.state !== 'accepted' || item.actorId === input.subjectUserId
      || item.supportingWorkIds.some(id => !acceptedWork.has(id)) || unique.has(actorKey)
      || (item.kind !== 'usefulness' && unique.has(contextKey))) { target.withheld++; continue; }
    unique.add(actorKey); unique.add(contextKey); target.accepted++; counted.push(item);
  }
  const helpfulness = counted.filter(item => item.kind === 'usefulness');
  if (helpfulness.length >= input.rules.usefulnessMinimum) {
    const helpful = helpfulness.filter(item => item.helpful).length * 100;
    const points = helpful >= input.rules.usefulnessFullPercent * helpfulness.length ? 250
      : helpful >= input.rules.usefulnessPartialPercent * helpfulness.length ? 125 : 0;
    if (points) award('reception.usefulness', points, helpfulness.map(item => item.id));
  } else row('reception.usefulness').reason = 'insufficient_evidence';
  for (const item of counted.filter(item => item.kind !== 'usefulness')) {
    award(`reception.${item.kind}`, input.rules.receptionOutcomePoints, [item.id]);
  }
  const families = ['posts', 'own_discussion', 'other_discussion', 'peer_review', 'source_correction', 'help_accessibility']
    .filter(group => (awards.get(group) ?? 0) > 0);
  if (families.length >= input.rules.breadthRequiredFamilies) award('breadth', 150,
    rows.filter(item => families.includes(item.capGroup)).flatMap(item => item.evidenceIds));
  for (const item of rows) {
    item.remainingInGroup = item.allowance - (awards.get(item.capGroup) ?? 0);
    if (item.reason !== 'no_evidence') continue;
    item.reason = item.accepted ? 'milestone_incomplete' : item.pending ? 'pending_review' : item.withheld ? 'withheld' : 'no_evidence';
  }
  const points = rows.reduce((sum, item) => sum + item.points, 0);
  if (points > 2500) throw new Error('monthly_earning_cap_exceeded');
  return { policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, rulesVersion: input.rules.version,
    ...week, points, actions: rows, completedFamilies: families,
    state: evaluated < end ? 'open' as const : evaluated < end + input.rules.settlementHours * 3_600_000 ? 'settling' as const : 'locked' as const };
}
