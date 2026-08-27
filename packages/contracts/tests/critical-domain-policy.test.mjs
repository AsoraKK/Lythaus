import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_POLICY_VERSION,
  APPEAL_POLICY,
  PLATFORM_SAFETY_LIMITS,
  REPUTATION_EVENT_CATALOG,
  REPUTATION_PILLAR_BASELINES,
  buildActivityEvent,
  calculateReputationImpact,
  canViewPrivateActivity,
  evaluateAppeal,
  evaluateReputation,
  hasNewsBoardAccess,
  normalizeUserTier,
  publicReputationSummary,
  sanitizeActivityMetadata,
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

const matureReputation = {
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

function activity(overrides = {}) {
  return {
    id: '01900000-0000-7000-8000-000000000001',
    userId: '01900000-0000-7000-8000-000000000002',
    eventType: 'content.declaration_selected',
    category: 'content',
    source: 'public_api',
    sourceEventId: '01900000-0000-7000-8000-000000000003',
    correlationId: 'correlation-1',
    title: 'Content declaration selected',
    explanation: 'The author selected a declared creation mode.',
    result: 'succeeded',
    reputationEffect: 'none',
    appealable: false,
    retentionClass: 'ordinary',
    createdAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

function vote(reviewerId, decision, overrides = {}) {
  return {
    reviewerId,
    decision,
    qualificationSnapshot: 'trained',
    levelSnapshot: 4,
    voteWeightSnapshot: 1,
    locked: true,
    recused: false,
    ...overrides,
  };
}

test('tier enforcement keeps feeds paid but safety limits neutral', () => {
  assert.equal(normalizeUserTier('premium'), 'premium');
  assert.equal(normalizeUserTier('black'), 'black');
  assert.equal(normalizeUserTier('admin'), 'free');
  assert.equal(hasNewsBoardAccess('free'), false);
  assert.equal(hasNewsBoardAccess('black'), true);
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

test('activity ledger sanitizes private metadata and records declaration selection', () => {
  assert.equal(ACTIVITY_EVENT_TYPES.includes('content.declaration_selected'), true);
  assert.deepEqual(sanitizeActivityMetadata('account', {
    authenticationMethod: 'email',
    changedField: 1,
    sessionAction: false,
  }), { authenticationMethod: 'email', changedField: 1, sessionAction: false });
  assert.deepEqual(sanitizeActivityMetadata('privacy', {
    requestType: 'export',
    requestState: 'received',
  }), { requestType: 'export', requestState: 'received' });
  assert.throws(() => sanitizeActivityMetadata('privacy', { token: 'secret' }), /activity_metadata_sensitive_key/);
  assert.throws(() => sanitizeActivityMetadata('content', { rawText: 'private post' }), /activity_metadata_key_not_allowed/);
  assert.throws(() => sanitizeActivityMetadata('content', { contentType: { nested: true } }), /activity_metadata_value_not_allowed/);
  assert.throws(() => sanitizeActivityMetadata('content', { contentType: 'x'.repeat(161) }), /activity_metadata_value_too_long/);

  const event = buildActivityEvent(activity({ metadata: { contentType: 'post', creationMode: 'human' } }));
  assert.equal(event.policyVersion, ACTIVITY_POLICY_VERSION);
  assert.equal(event.retentionDays, 730);
  assert.throws(() => buildActivityEvent(activity({ id: '' })), /activity_event_identity_required/);
  assert.throws(() => buildActivityEvent(activity({ actorUserId: 'other-user' })), /activity_actor_mismatch/);
  assert.equal(buildActivityEvent(activity({ source: 'admin_api', actorUserId: 'other-user', retentionClass: 'moderation' })).retentionDays, 90);
  assert.equal(buildActivityEvent(activity({ retentionClass: 'security' })).retentionDays, 365);
  assert.equal(canViewPrivateActivity(event.userId, event.userId), true);
  assert.equal(canViewPrivateActivity('admin', event.userId, ['privacy:activity:read']), true);
  assert.equal(canViewPrivateActivity('other', event.userId), false);
});

test('reputation policy resists shortcuts and distinguishes event dispositions', () => {
  assert.equal(evaluateReputation(matureReputation).level, 5);
  const blocked = evaluateReputation({
    ...matureReputation,
    totalScore: 0,
    pillarScores: { accountability: 0, contribution: 0, conduct: 0, sourcing: 0, authenticity: 0, reviewReliability: 0 },
    accountAgeDays: 0,
    activeDays: 0,
    activeWeeks: 0,
    verifiedRegisteredAccount: false,
    accountabilityIdentityDeclared: false,
    qualifyingHumanContributions: 0,
    unresolvedSeriousEnforcement: true,
    activeFeatureRestriction: true,
    suspended: true,
    manipulationInvestigation: true,
    antiGamingEligible: false,
  });
  assert.equal(blocked.level, 0);
  assert.equal(blocked.promotionBlockers.includes('suspended'), true);
  assert.equal(publicReputationSummary(evaluateReputation({ ...matureReputation, accountAgeDays: 20 })).level, 2);

  assert.equal(REPUTATION_EVENT_CATALOG.verified_source.pillar, 'sourcing');
  assert.deepEqual(calculateReputationImpact({ signalType: 'email_verified', occurrenceInWindow: 1, suspended: false }), {
    impact: 5, explanationCode: 'email_verified', disposition: 'positive', pillar: 'accountability',
  });
  assert.equal(calculateReputationImpact({ signalType: 'email_verified', occurrenceInWindow: 2, suspended: false }).disposition, 'withheld');
  assert.equal(calculateReputationImpact({ signalType: 'accountability_identity_declared', occurrenceInWindow: 1, suspended: false }).impact, 5);
  assert.equal(calculateReputationImpact({ signalType: 'qualifying_human_contribution', occurrenceInWindow: 1, suspended: false }).impact, 10);
  assert.equal(calculateReputationImpact({ signalType: 'qualifying_human_contribution', occurrenceInWindow: 2, suspended: false }).impact, 5);
  assert.equal(calculateReputationImpact({ signalType: 'qualifying_human_contribution', occurrenceInWindow: 4, suspended: false }).impact, 3);
  assert.equal(calculateReputationImpact({ signalType: 'qualifying_human_contribution', occurrenceInWindow: 7, suspended: false }).explanationCode, 'healthy_activity_cap_reached');
  assert.equal(calculateReputationImpact({ signalType: 'qualifying_human_contribution', occurrenceInWindow: Number.NaN, suspended: false }).impact, 10);
  assert.equal(calculateReputationImpact({ signalType: 'verified_source', occurrenceInWindow: 1, suspended: false }).impact, 5);
  assert.equal(calculateReputationImpact({ signalType: 'reliable_review', occurrenceInWindow: 1, suspended: false }).pillar, 'reviewReliability');
  assert.equal(calculateReputationImpact({ signalType: 'confirmed_spam', occurrenceInWindow: 1, suspended: false }).impact, -20);
  assert.equal(calculateReputationImpact({ signalType: 'confirmed_harassment', occurrenceInWindow: 1, suspended: false }).impact, -30);
  assert.equal(calculateReputationImpact({ signalType: 'authenticity_evasion', occurrenceInWindow: 1, suspended: false }).impact, -25);
  assert.equal(calculateReputationImpact({ signalType: 'raw_reaction_received', occurrenceInWindow: 1, suspended: false }).impact, 0);
  assert.equal(calculateReputationImpact({ signalType: 'ai_assisted_content', occurrenceInWindow: 1, suspended: false }).impact, 0);
  assert.equal(calculateReputationImpact({ signalType: 'qualifying_human_contribution', occurrenceInWindow: 1, suspended: true }).explanationCode, 'normal_earning_suspended');
  assert.equal(calculateReputationImpact({ signalType: 'confirmed_spam', occurrenceInWindow: 1, suspended: true }).impact, -20);
  assert.equal(calculateReputationImpact({ signalType: 'reputation_event_reversal', occurrenceInWindow: 1, suspended: false, reversalOfImpact: 10 }).impact, -10);
  assert.equal(calculateReputationImpact({ signalType: 'reputation_event_reversal', occurrenceInWindow: 1, suspended: false, reversalOfImpact: -20 }).impact, 20);
  assert.equal(calculateReputationImpact({ signalType: 'reputation_event_reversal', occurrenceInWindow: 1, suspended: false }).explanationCode, 'reversal_reference_required');
});

test('reputation baselines make gated levels attainable and misconduct can demote', () => {
  assert.deepEqual(REPUTATION_PILLAR_BASELINES, {
    accountability: 70,
    contribution: 0,
    conduct: 100,
    sourcing: 0,
    authenticity: 100,
    reviewReliability: 50,
  });

  const scoreFor = (pillarScores) => Object.values(pillarScores).reduce((total, score) => total + score, 0);
  const impactFor = (signalType, occurrenceInWindow = 1) => calculateReputationImpact({ signalType, occurrenceInWindow, suspended: false }).impact;
  const l1Pillars = {
    ...REPUTATION_PILLAR_BASELINES,
    accountability: REPUTATION_PILLAR_BASELINES.accountability
      + impactFor('email_verified')
      + impactFor('accountability_identity_declared'),
  };
  const levelOne = {
    ...matureReputation,
    totalScore: scoreFor(l1Pillars),
    pillarScores: l1Pillars,
    accountAgeDays: 1,
    activeDays: 1,
    activeWeeks: 1,
    qualifyingHumanContributions: 0,
  };
  assert.equal(evaluateReputation(levelOne).level, 1);
  assert.equal(evaluateReputation({ ...levelOne, activeWeeks: 0 }).level, 0);
  assert.equal(evaluateReputation({ ...levelOne, verifiedRegisteredAccount: false }).level, 0);

  const dailyContribution = Array.from({ length: 6 }, (_, index) => impactFor('qualifying_human_contribution', index + 1))
    .reduce((total, impact) => total + impact, 0);
  const l5Pillars = {
    ...REPUTATION_PILLAR_BASELINES,
    accountability: l1Pillars.accountability,
    contribution: dailyContribution * 6,
    sourcing: impactFor('verified_source') * 11,
  };
  const levelFive = {
    ...matureReputation,
    totalScore: scoreFor(l5Pillars),
    pillarScores: l5Pillars,
    accountAgeDays: 105,
    activeDays: 40,
    activeWeeks: 11,
    qualifyingHumanContributions: 36,
  };
  assert.equal(evaluateReputation(levelFive).level, 5);

  const tooYoung = evaluateReputation({ ...levelFive, accountAgeDays: 104 });
  assert.equal(tooYoung.level, 4);
  assert.equal(tooYoung.promotionBlockers.includes('account_age'), true);
  const missingSourcing = evaluateReputation({
    ...levelFive,
    totalScore: levelFive.totalScore - 1,
    pillarScores: { ...levelFive.pillarScores, sourcing: 54 },
  });
  assert.equal(missingSourcing.level, 4);
  assert.equal(missingSourcing.promotionBlockers.includes('pillar_sourcing'), true);

  const confirmedSpam = calculateReputationImpact({ signalType: 'confirmed_spam', occurrenceInWindow: 1, suspended: false });
  const demoted = evaluateReputation({
    ...levelFive,
    totalScore: levelFive.totalScore + confirmedSpam.impact,
    pillarScores: { ...levelFive.pillarScores, conduct: levelFive.pillarScores.conduct + confirmedSpam.impact },
  });
  assert.equal(confirmedSpam.pillar, 'conduct');
  assert.equal(demoted.level, 4);
  assert.equal(demoted.promotionBlockers.includes('pillar_conduct'), true);
});

test('appeal policy rejects collusion and resolves only qualified consensus', async () => {
  await assert.rejects(selectAppealReviewers({ appealId: 'appeal', appellantId: 'appellant', assignmentSeed: '', candidates: [] }), /appeal_assignment_seed_required/);
  const candidates = [
    { userId: 'appellant', level: 5, qualification: 'trained', assignmentEligible: true, conflict: false },
    { userId: 'excluded', level: 5, qualification: 'trained', assignmentEligible: true, conflict: false },
    { userId: 'untrained', level: 5, qualification: 'eligible', assignmentEligible: true, conflict: false },
    { userId: 'ineligible', level: 5, qualification: 'trained', assignmentEligible: false, conflict: false },
    { userId: 'conflict', level: 5, qualification: 'trained', assignmentEligible: true, conflict: true },
    { userId: 'related', level: 5, qualification: 'trained', assignmentEligible: true, conflict: false, relatedAccountGroup: 'group-a' },
  ];
  await assert.rejects(selectAppealReviewers({ appealId: 'appeal', appellantId: 'appellant', appellantAccountGroup: 'group-a', assignmentSeed: 'seed', excludedUserIds: ['excluded'], candidates }), /appeal_reviewer_pool_insufficient/);
  for (let index = 0; index < 6; index += 1) candidates.push({ userId: `eligible-${index}`, level: index < 2 ? 5 : 4, qualification: 'trained', assignmentEligible: true, conflict: false });
  const assigned = await selectAppealReviewers({ appealId: 'appeal', appellantId: 'appellant', appellantAccountGroup: 'group-a', assignmentSeed: 'seed', excludedUserIds: ['excluded'], candidates });
  assert.equal(assigned.length, APPEAL_POLICY.reviewerCount);
  assert.equal(assigned.some((item) => ['appellant', 'excluded', 'untrained', 'ineligible', 'conflict', 'related'].includes(item.reviewerId)), false);
  assert.equal(assigned.filter((item) => item.voteWeightSnapshot === 2).length <= 1, true);

  const quorumVotes = ['r1', 'r2', 'r3', 'r4', 'r5'].map((id, index) => vote(id, index < 3 ? 'overturn' : 'uphold'));
  assert.equal(evaluateAppeal(quorumVotes.slice(0, 4), [], 'standard').status, 'pending_quorum');
  assert.throws(() => evaluateAppeal([quorumVotes[0], quorumVotes[0]], [], 'standard'), /duplicate_reviewer_vote/);
  assert.throws(() => evaluateAppeal([vote('invalid-weight', 'uphold', { levelSnapshot: 4, voteWeightSnapshot: 2 })], [], 'standard'), /appeal_vote_weight_invalid/);
  assert.throws(() => evaluateAppeal([
    vote('w1', 'uphold', { levelSnapshot: 5, voteWeightSnapshot: 2 }),
    vote('w2', 'uphold', { levelSnapshot: 5, voteWeightSnapshot: 2 }),
  ], [], 'standard'), /appeal_level5_weight_cap_exceeded/);
  assert.equal(evaluateAppeal([
    ...quorumVotes,
    vote('unlocked', 'overturn', { locked: false }),
    vote('recused', 'overturn', { recused: true }),
    vote('untrained-vote', 'overturn', { qualificationSnapshot: 'eligible' }),
  ], [], 'standard').status, 'pending_adjudication');
  assert.equal(evaluateAppeal([
    vote('a', 'overturn'), vote('b', 'overturn'), vote('c', 'overturn'),
    vote('d', 'uphold'), vote('e', 'uphold'), vote('f', 'uphold'),
  ], [], 'standard').status, 'no_consensus');
  assert.equal(evaluateAppeal(quorumVotes, [{ adjudicatorId: 'untrained', role: 'editorial', trained: false, decision: 'overturn' }], 'standard').status, 'pending_adjudication');
  assert.equal(evaluateAppeal(quorumVotes, [{ adjudicatorId: 'a1', role: 'editorial', trained: true, decision: 'uphold' }], 'standard').status, 'adjudication_disagreement');
  assert.equal(evaluateAppeal(quorumVotes, [{ adjudicatorId: 'a1', role: 'editorial', trained: true, decision: 'overturn' }], 'standard').status, 'resolved');
  assert.equal(evaluateAppeal(quorumVotes, [{ adjudicatorId: 'a1', role: 'editorial', trained: true, decision: 'overturn' }], 'high').status, 'pending_adjudication');
  assert.equal(evaluateAppeal(quorumVotes, [
    { adjudicatorId: 'a1', role: 'editorial', trained: true, decision: 'overturn' },
    { adjudicatorId: 'a2', role: 'journalist', trained: true, decision: 'overturn' },
  ], 'high').status, 'resolved');
});
