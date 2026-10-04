import { MONTHLY_REPUTATION_POLICY_VERSION, reputationInstant } from './monthly-reputation-policy.ts';

export const PROPOSED_COMMUNITY_APPEAL_RULES = Object.freeze({
  version: 'community-appeal-defaults-proposal-v1',
  status: 'pending_owner_approval' as const,
  initialHours: 48,
  quorum: 5,
  threshold: 'strict_majority' as const,
  extensionHours: 24,
  maximumExtensions: 1,
});

export interface CommunityVoterEligibility {
  registered: boolean;
  emailVerified: boolean;
  activeVotingRestriction: boolean;
  appellant: boolean;
  relevantConflict: boolean;
  establishedControlledDuplicate: boolean;
}

export function isEligibleCommunityVoter(eligibility: CommunityVoterEligibility): boolean {
  return eligibility.registered === true && eligibility.emailVerified === true
    && eligibility.activeVotingRestriction === false && eligibility.appellant === false
    && eligibility.relevantConflict === false && eligibility.establishedControlledDuplicate === false;
}

export interface CommunityBallotRevision {
  policyVersion: string;
  voterUserId: string;
  revision: number;
  weight: 1;
  choice: 'allow' | 'retain' | 'recuse' | 'cannot_assess';
  castAt: string;
  valid: boolean;
  eligibility: CommunityVoterEligibility;
}

export interface CommunityAppealRules {
  version: string;
  status: 'pending_owner_approval';
  initialHours: number;
  quorum: number;
  threshold: 'strict_majority';
  extensionHours: number;
  maximumExtensions: number;
}

export type CommunityAppealEvaluation =
  | { status: 'open' | 'restricted_review'; policyVersion: string; rulesVersion: string }
  | {
    status: 'resolved_allow' | 'resolved_retain' | 'extension_required' | 'unresolved';
    policyVersion: string;
    rulesVersion: string;
    validBallots: number;
    allow: number;
    retain: number;
    reason: 'strict_majority' | 'tie' | 'no_quorum';
  };

export function evaluateProposedCommunityAppeal(input: {
  policyVersion: string;
  reviewClass: 'standard' | 'restricted';
  opensAt: string;
  closesAt: string;
  evaluatedAt: string;
  extensions: number;
  rules: CommunityAppealRules;
  ballots: readonly CommunityBallotRevision[];
}): CommunityAppealEvaluation {
  if (input.policyVersion !== MONTHLY_REPUTATION_POLICY_VERSION) throw new Error('community_appeal_policy_unsupported');
  const rules = input.rules;
  if (!rules || rules.status !== 'pending_owner_approval' || !rules.version
    || rules.threshold !== 'strict_majority'
    || !Number.isSafeInteger(rules.quorum) || rules.quorum < 1
    || !Number.isSafeInteger(rules.initialHours) || rules.initialHours < 1
    || !Number.isSafeInteger(rules.extensionHours) || rules.extensionHours < 1
    || !Number.isSafeInteger(rules.maximumExtensions) || rules.maximumExtensions < 0) {
    throw new Error('community_appeal_rules_invalid');
  }
  if (!Number.isSafeInteger(input.extensions) || input.extensions < 0 || input.extensions > rules.maximumExtensions) {
    throw new Error('community_appeal_extension_invalid');
  }
  const base = { policyVersion: input.policyVersion, rulesVersion: rules.version };
  if (input.reviewClass === 'restricted') return { ...base, status: 'restricted_review' };
  if (input.reviewClass !== 'standard') throw new Error('community_appeal_review_class_invalid');
  const opensAt = reputationInstant(input.opensAt);
  const closesAt = reputationInstant(input.closesAt);
  const evaluatedAt = reputationInstant(input.evaluatedAt);
  const duration = (rules.initialHours + input.extensions * rules.extensionHours) * 3_600_000;
  if (!Number.isSafeInteger(duration) || closesAt - opensAt !== duration) throw new Error('community_appeal_window_invalid');
  if (evaluatedAt < closesAt) return { ...base, status: 'open' };
  const latest = new Map<string, CommunityBallotRevision>();
  const revisions = new Set<string>();
  for (const ballot of input.ballots) {
    if (ballot.policyVersion !== input.policyVersion) throw new Error('community_appeal_ballot_policy_mismatch');
    if (ballot.weight !== 1) throw new Error('community_appeal_equal_weight_required');
    if (typeof ballot.voterUserId !== 'string' || !ballot.voterUserId
      || !Number.isSafeInteger(ballot.revision) || ballot.revision < 1
      || !['allow', 'retain', 'recuse', 'cannot_assess'].includes(ballot.choice)
      || typeof ballot.valid !== 'boolean') throw new Error('community_appeal_ballot_invalid');
    const castAt = reputationInstant(ballot.castAt);
    if (castAt < opensAt || castAt >= closesAt) throw new Error('community_appeal_ballot_outside_window');
    const key = `${ballot.voterUserId}:${ballot.revision}`;
    if (revisions.has(key)) throw new Error('community_appeal_duplicate_revision');
    revisions.add(key);
    const previous = latest.get(ballot.voterUserId);
    if (!previous || previous.revision < ballot.revision) latest.set(ballot.voterUserId, ballot);
  }
  const votes = [...latest.values()].filter(ballot => ballot.valid && isEligibleCommunityVoter(ballot.eligibility)
    && (ballot.choice === 'allow' || ballot.choice === 'retain'));
  const allow = votes.filter(ballot => ballot.choice === 'allow').length;
  const retain = votes.length - allow;
  const tally = { ...base, validBallots: votes.length, allow, retain };
  if (votes.length < rules.quorum || allow === retain) {
    return { ...tally, status: input.extensions < rules.maximumExtensions ? 'extension_required' : 'unresolved',
      reason: votes.length < rules.quorum ? 'no_quorum' : 'tie' };
  }
  return { ...tally, status: allow > retain ? 'resolved_allow' : 'resolved_retain', reason: 'strict_majority' };
}
