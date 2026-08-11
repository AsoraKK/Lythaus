import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPEAL_POLICY,
  PLATFORM_SAFETY_LIMITS,
  REPUTATION_POLICY,
  TIER_POLICIES,
  buildActivityEvent,
  calculateReputationImpact,
  canViewPrivateActivity,
  evaluateAppeal,
  evaluateReputation,
  selectAppealReviewers,
} from '../src/index.ts';

const healthyPillars = {
  accountability: 100,
  contribution: 100,
  conduct: 100,
  sourcing: 100,
  authenticity: 100,
  reviewReliability: 100,
};

const matureReputationInput = {
  totalScore: 1000,
  pillarScores: healthyPillars,
  accountAgeDays: 365,
  activeDays: 100,
  activeWeeks: 30,
  verifiedRegisteredAccount: true,
  accountabilityIdentityDeclared: true,
  qualifyingHumanContributions: 100,
  unresolvedSeriousEnforcement: false,
  activeFeatureRestriction: false,
  suspended: false,
  manipulationInvestigation: false,
  antiGamingEligible: true,
};

test('tier policy only grants News Board to Black and keeps safety limits tier-neutral', () => {
  assert.equal(TIER_POLICIES.free.maxCustomFeeds, 1);
  assert.equal(TIER_POLICIES.premium.maxCustomFeeds, 2);
  assert.equal(TIER_POLICIES.black.maxCustomFeeds, 3);
  assert.equal(TIER_POLICIES.free.newsBoardAccess, 'none');
  assert.equal(TIER_POLICIES.premium.newsBoardAccess, 'none');
  assert.equal(TIER_POLICIES.black.newsBoardAccess, 'full');
  assert.deepEqual(PLATFORM_SAFETY_LIMITS, {
    dailyPosts: 5,
    dailyComments: 50,
    dailyReactions: 100,
    maxFollowStateChangesPerRelationshipPerDay: 2,
    dailyFlags: 20,
    dailyMediaUploads: 20,
    maxMediaBytesPerUpload: 10 * 1024 * 1024,
    dailyAppeals: 1,
    exportCooldownDays: 30,
  });
});

test('reputation promotion requires score, time, pillars, conduct and anti-gaming eligibility', () => {
  assert.equal(evaluateReputation(matureReputationInput).level, 5);
  assert.equal(evaluateReputation({ ...matureReputationInput, accountAgeDays: 20 }).level, 2);
  assert.equal(evaluateReputation({ ...matureReputationInput, activeWeeks: 2 }).level, 2);
  assert.equal(evaluateReputation({ ...matureReputationInput, suspended: true }).level, 0);
  assert.equal(evaluateReputation({ ...matureReputationInput, antiGamingEligible: false }).level, 0);
  assert.equal(REPUTATION_POLICY.levels.at(-1).minimumActiveWeeks, 11);
});

test('popularity, self-interaction, duplicates and disclosed AI do not earn reputation', () => {
  for (const signalType of [
    'ai_assisted_content',
    'ai_generated_content',
    'raw_reaction_received',
    'raw_follow_received',
    'self_interaction',
    'duplicate_content',
  ]) {
    assert.equal(calculateReputationImpact({ signalType, occurrenceInWindow: 1, suspended: false }).impact, 0);
  }
  assert.equal(calculateReputationImpact({ signalType: 'qualifying_human_contribution', occurrenceInWindow: 1, suspended: false }).impact, 10);
  assert.equal(calculateReputationImpact({ signalType: 'qualifying_human_contribution', occurrenceInWindow: 7, suspended: false }).impact, 0);
});

test('activity metadata is private, allowlisted and free of secret-like keys', () => {
  const event = buildActivityEvent({
    id: '01900000-0000-7000-8000-000000000001',
    userId: '01900000-0000-7000-8000-000000000002',
    eventType: 'content.comment_created',
    category: 'content',
    source: 'public_api',
    sourceEventId: '01900000-0000-7000-8000-000000000003',
    correlationId: 'correlation-1',
    title: 'You published a comment',
    explanation: 'Comment was published successfully.',
    result: 'succeeded',
    reputationEffect: 'none',
    appealable: false,
    retentionClass: 'ordinary',
    metadata: { contentType: 'comment', creationMode: 'human' },
    createdAt: '2026-08-10T00:00:00.000Z',
  });
  assert.equal(event.retentionDays, 730);
  assert.equal(canViewPrivateActivity(event.userId, event.userId), true);
  assert.equal(canViewPrivateActivity('other-user', event.userId), false);
  assert.throws(() => buildActivityEvent({ ...event, metadata: { accessToken: 'secret' } }), /sensitive_key/);
  assert.throws(() => buildActivityEvent({ ...event, metadata: { rawText: 'private body' } }), /key_not_allowed/);
});

function ordinaryVote(reviewerId, decision) {
  return { reviewerId, decision, qualificationSnapshot: 'trained', levelSnapshot: 4, voteWeightSnapshot: 1, locked: true, recused: false };
}

test('appeals enforce five-reviewer quorum, exact 60 percent and adjudication', () => {
  const votes = [
    ordinaryVote('r1', 'overturn'),
    ordinaryVote('r2', 'overturn'),
    ordinaryVote('r3', 'overturn'),
    ordinaryVote('r4', 'uphold'),
    ordinaryVote('r5', 'uphold'),
  ];
  assert.equal(evaluateAppeal(votes.slice(0, 4), [], 'standard').status, 'pending_quorum');
  assert.equal(evaluateAppeal(votes, [], 'standard').winningShare, 0.6);
  assert.equal(evaluateAppeal(votes, [], 'standard').status, 'pending_adjudication');
  assert.equal(evaluateAppeal(votes, [{ adjudicatorId: 'a1', role: 'editorial', trained: true, decision: 'overturn' }], 'standard').status, 'resolved');
  assert.equal(evaluateAppeal(votes, [{ adjudicatorId: 'a1', role: 'editorial', trained: true, decision: 'uphold' }], 'standard').status, 'adjudication_disagreement');
});

test('Level 5 vote weighting is qualification-gated and capped', () => {
  const weightedVotes = [
    { ...ordinaryVote('r1', 'overturn'), levelSnapshot: 5, voteWeightSnapshot: 2 },
    ordinaryVote('r2', 'uphold'),
    ordinaryVote('r3', 'uphold'),
    ordinaryVote('r4', 'uphold'),
    ordinaryVote('r5', 'uphold'),
  ];
  const result = evaluateAppeal(weightedVotes, [], 'standard');
  assert.equal(result.reviewerPanelDecision, 'uphold');
  assert.equal(result.upholdWeight, 4);
  assert.throws(() => evaluateAppeal([
    weightedVotes[0],
    { ...ordinaryVote('r2', 'overturn'), levelSnapshot: 5, voteWeightSnapshot: 2 },
    ...weightedVotes.slice(2),
  ], [], 'standard'), /weight_cap_exceeded/);
  assert.equal(APPEAL_POLICY.maximumWeightedLevel5Reviewers, 1);
});

test('high-risk appeals require two distinct agreeing adjudicators', () => {
  const votes = ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => ordinaryVote(id, 'overturn'));
  const one = [{ adjudicatorId: 'a1', role: 'journalist', trained: true, decision: 'overturn' }];
  assert.equal(evaluateAppeal(votes, one, 'high').status, 'pending_adjudication');
  assert.equal(evaluateAppeal(votes, [...one, { adjudicatorId: 'a2', role: 'editorial', trained: true, decision: 'overturn' }], 'high').status, 'resolved');
});

test('reviewer assignment excludes appellant, conflicts, untrained and related accounts', async () => {
  const candidates = Array.from({ length: 10 }, (_, index) => ({
    userId: `reviewer-${index}`,
    level: index < 3 ? 5 : 4,
    qualification: index === 8 ? 'eligible' : 'trained',
    assignmentEligible: true,
    conflict: index === 7,
    relatedAccountGroup: index === 9 ? 'appellant-group' : undefined,
  }));
  candidates.push({ userId: 'appellant', level: 5, qualification: 'trained', assignmentEligible: true, conflict: false });
  const assignments = await selectAppealReviewers({
    appealId: 'appeal-1',
    appellantId: 'appellant',
    appellantAccountGroup: 'appellant-group',
    assignmentSeed: 'server-generated-secret-seed',
    candidates,
  });
  assert.equal(assignments.length, 5);
  assert.equal(assignments.some((item) => item.reviewerId === 'appellant'), false);
  assert.equal(assignments.filter((item) => item.voteWeightSnapshot === 2).length <= 1, true);
});

test('reviewer assignment gives known linked-account groups at most one seat', async () => {
  const candidates = [
    ...Array.from({ length: 4 }, (_, index) => ({
      userId: `linked-${index}`,
      level: 4,
      qualification: 'trained',
      assignmentEligible: true,
      conflict: false,
      relatedAccountGroup: 'linked-group',
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      userId: `independent-${index}`,
      level: 4,
      qualification: 'trained',
      assignmentEligible: true,
      conflict: false,
      relatedAccountGroup: `independent-group-${index}`,
    })),
  ];
  const assignments = await selectAppealReviewers({
    appealId: 'appeal-linked-groups',
    appellantId: 'appellant',
    assignmentSeed: 'server-generated-secret-seed',
    candidates,
  });

  assert.equal(assignments.length, 5);
  assert.equal(assignments.filter((item) => item.reviewerId.startsWith('linked-')).length <= 1, true);
});

test('reviewer assignment fails closed when linked accounts leave fewer than five independent seats', async () => {
  const candidates = Array.from({ length: 8 }, (_, index) => ({
    userId: `linked-only-${index}`,
    level: 4,
    qualification: 'trained',
    assignmentEligible: true,
    conflict: false,
    relatedAccountGroup: index < 5 ? 'shared-group' : `group-${index}`,
  }));

  await assert.rejects(
    selectAppealReviewers({
      appealId: 'appeal-insufficient-independent-groups',
      appellantId: 'appellant',
      assignmentSeed: 'server-generated-secret-seed',
      candidates,
    }),
    /appeal_reviewer_pool_insufficient/,
  );
});
