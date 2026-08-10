import type { ReputationLevel } from './reputation-policy.ts';

export type ReviewerQualification = 'none' | 'eligible' | 'trained' | 'suspended';
export type AppealDecision = 'overturn' | 'uphold';
export type AppealRiskClass = 'standard' | 'high';

export const APPEAL_POLICY = Object.freeze({
  version: 'appeals-v1.0.0',
  reviewerCount: 5,
  quorum: 5,
  weightedMajority: 0.6,
  standardVoteWeight: 1,
  level5VoteWeight: 2,
  maximumWeightedLevel5Reviewers: 1,
  standardAdjudicatorsRequired: 1,
  highRiskAdjudicatorsRequired: 2,
});

export interface AppealReviewerCandidate {
  userId: string;
  level: ReputationLevel;
  qualification: ReviewerQualification;
  assignmentEligible: boolean;
  conflict: boolean;
  relatedAccountGroup?: string;
}

export interface AppealReviewerAssignment {
  reviewerId: string;
  levelSnapshot: ReputationLevel;
  qualificationSnapshot: ReviewerQualification;
  voteWeightSnapshot: 1 | 2;
  policyVersion: string;
}

async function assignmentRank(appealId: string, assignmentSeed: string, userId: string): Promise<string> {
  const data = new TextEncoder().encode(`${appealId}:${assignmentSeed}:${userId}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function selectAppealReviewers(input: {
  appealId: string;
  appellantId: string;
  appellantAccountGroup?: string;
  assignmentSeed: string;
  excludedUserIds?: readonly string[];
  candidates: readonly AppealReviewerCandidate[];
}): Promise<readonly AppealReviewerAssignment[]> {
  if (!input.assignmentSeed) throw new Error('appeal_assignment_seed_required');
  const excluded = new Set([input.appellantId, ...(input.excludedUserIds ?? [])]);
  const uniqueCandidates = new Map<string, AppealReviewerCandidate>();

  for (const candidate of input.candidates) {
    if (excluded.has(candidate.userId) || candidate.qualification !== 'trained') continue;
    if (!candidate.assignmentEligible || candidate.conflict) continue;
    if (input.appellantAccountGroup && candidate.relatedAccountGroup === input.appellantAccountGroup) continue;
    uniqueCandidates.set(candidate.userId, candidate);
  }

  const ranked = await Promise.all(Array.from(uniqueCandidates.values(), async (candidate) => ({
    candidate,
    rank: await assignmentRank(input.appealId, input.assignmentSeed, candidate.userId),
  })));
  ranked.sort((left, right) => left.rank.localeCompare(right.rank));
  if (ranked.length < APPEAL_POLICY.reviewerCount) throw new Error('appeal_reviewer_pool_insufficient');

  let weightedLevel5Reviewers = 0;
  return ranked.slice(0, APPEAL_POLICY.reviewerCount).map(({ candidate }) => {
    const receivesLevel5Weight =
      candidate.level === 5 && weightedLevel5Reviewers < APPEAL_POLICY.maximumWeightedLevel5Reviewers;
    if (receivesLevel5Weight) weightedLevel5Reviewers += 1;
    return Object.freeze({
      reviewerId: candidate.userId,
      levelSnapshot: candidate.level,
      qualificationSnapshot: candidate.qualification,
      voteWeightSnapshot: receivesLevel5Weight ? 2 : 1,
      policyVersion: APPEAL_POLICY.version,
    });
  });
}

export interface AppealVote {
  reviewerId: string;
  decision: AppealDecision;
  qualificationSnapshot: ReviewerQualification;
  levelSnapshot: ReputationLevel;
  voteWeightSnapshot: 1 | 2;
  locked: boolean;
  recused: boolean;
}

export interface AppealAdjudication {
  adjudicatorId: string;
  role: 'editorial' | 'journalist';
  trained: boolean;
  decision: AppealDecision;
}

export interface AppealEvaluation {
  status: 'pending_quorum' | 'no_consensus' | 'pending_adjudication' | 'adjudication_disagreement' | 'resolved';
  communityDecision: AppealDecision | null;
  finalDecision: AppealDecision | null;
  completedReviewers: number;
  totalWeight: number;
  overturnWeight: number;
  upholdWeight: number;
  winningShare: number;
  requiredAdjudicators: number;
  policyVersion: string;
}

export function evaluateAppeal(
  votes: readonly AppealVote[],
  adjudications: readonly AppealAdjudication[],
  riskClass: AppealRiskClass,
): AppealEvaluation {
  const reviewerIds = new Set<string>();
  let weightedLevel5Reviewers = 0;
  const effectiveVotes: AppealVote[] = [];

  for (const vote of votes) {
    if (reviewerIds.has(vote.reviewerId)) throw new Error('duplicate_reviewer_vote');
    reviewerIds.add(vote.reviewerId);
    if (!vote.locked || vote.recused || vote.qualificationSnapshot !== 'trained') continue;
    if (vote.voteWeightSnapshot === 2) {
      if (vote.levelSnapshot !== 5) throw new Error('appeal_vote_weight_invalid');
      weightedLevel5Reviewers += 1;
    }
    effectiveVotes.push(vote);
  }
  if (weightedLevel5Reviewers > APPEAL_POLICY.maximumWeightedLevel5Reviewers) {
    throw new Error('appeal_level5_weight_cap_exceeded');
  }

  const requiredAdjudicators = riskClass === 'high'
    ? APPEAL_POLICY.highRiskAdjudicatorsRequired
    : APPEAL_POLICY.standardAdjudicatorsRequired;
  const totalWeight = effectiveVotes.reduce((total, vote) => total + vote.voteWeightSnapshot, 0);
  const overturnWeight = effectiveVotes.filter((vote) => vote.decision === 'overturn').reduce((total, vote) => total + vote.voteWeightSnapshot, 0);
  const upholdWeight = totalWeight - overturnWeight;
  const base = {
    completedReviewers: effectiveVotes.length,
    totalWeight,
    overturnWeight,
    upholdWeight,
    requiredAdjudicators,
    policyVersion: APPEAL_POLICY.version,
  };

  if (effectiveVotes.length < APPEAL_POLICY.quorum) {
    return { ...base, status: 'pending_quorum', communityDecision: null, finalDecision: null, winningShare: 0 };
  }

  const overturnShare = totalWeight === 0 ? 0 : overturnWeight / totalWeight;
  const upholdShare = totalWeight === 0 ? 0 : upholdWeight / totalWeight;
  const communityDecision = overturnShare >= APPEAL_POLICY.weightedMajority
    ? 'overturn'
    : upholdShare >= APPEAL_POLICY.weightedMajority ? 'uphold' : null;
  const winningShare = Math.max(overturnShare, upholdShare);
  if (!communityDecision) {
    return { ...base, status: 'no_consensus', communityDecision: null, finalDecision: null, winningShare };
  }

  const uniqueAdjudications = new Map(adjudications.map((item) => [item.adjudicatorId, item]));
  const qualifiedAdjudications = Array.from(uniqueAdjudications.values()).filter((item) => item.trained);
  if (qualifiedAdjudications.some((item) => item.decision !== communityDecision)) {
    return { ...base, status: 'adjudication_disagreement', communityDecision, finalDecision: null, winningShare };
  }
  const confirmations = qualifiedAdjudications.filter((item) => item.decision === communityDecision).length;
  if (confirmations < requiredAdjudicators) {
    return { ...base, status: 'pending_adjudication', communityDecision, finalDecision: null, winningShare };
  }

  return { ...base, status: 'resolved', communityDecision, finalDecision: communityDecision, winningShare };
}
