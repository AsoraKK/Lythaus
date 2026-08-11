import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appealOutcomeAuditPlan,
  assertActionableModerationCase,
  asAppealAdjudication,
  asAppealRiskClass,
  asAppealVote,
  evaluateAppealFromRecords,
  parseAppealAdjudicationRequest,
} from '../src/runtime-policy.ts';

test('moderation decisions require an open case on the active current revision', () => {
  assert.doesNotThrow(() => assertActionableModerationCase({
    caseState: 'open', sourceEventId: 'revision-2', currentSourceEventId: 'revision-2', contentActive: true,
  }));
  assert.throws(() => assertActionableModerationCase({
    caseState: 'resolved', sourceEventId: 'revision-2', currentSourceEventId: 'revision-2', contentActive: true,
  }), /moderation_case_already_resolved/);
  assert.throws(() => assertActionableModerationCase({
    caseState: 'superseded', sourceEventId: 'revision-1', currentSourceEventId: 'revision-2', contentActive: true,
  }), /moderation_case_superseded/);
  assert.throws(() => assertActionableModerationCase({
    caseState: 'open', sourceEventId: 'revision-1', currentSourceEventId: 'revision-2', contentActive: true,
  }), /moderation_case_superseded/);
  assert.throws(() => assertActionableModerationCase({
    caseState: 'open', sourceEventId: 'revision-2', currentSourceEventId: 'revision-2', contentActive: false,
  }), /moderation_case_superseded/);
  assert.throws(() => assertActionableModerationCase({
    caseState: 'open', sourceEventId: 'revision-2', currentSourceEventId: null, contentActive: true,
  }), /moderation_case_superseded/);
});

function vote(reviewerId, decision = 'uphold', overrides = {}) {
  return {
    reviewer_id: reviewerId,
    decision,
    qualification_snapshot: 'trained',
    level_snapshot: 4,
    vote_weight_snapshot: 1,
    assignment_state: 'voted',
    conflict_checked: true,
    current_qualification_state: 'trained',
    ...overrides,
  };
}

function fiveVotes(decision = 'uphold') {
  return Array.from({ length: 5 }, (_, index) => vote(`reviewer-${index + 1}`, decision));
}

test('validates immutable adjudication requests and stored appeal snapshots', () => {
  assert.deepEqual(parseAppealAdjudicationRequest({ decision: 'overturn', reasonCode: 'APPEAL_REVIEW' }), {
    decision: 'overturn', reasonCode: 'APPEAL_REVIEW',
  });
  assert.throws(() => parseAppealAdjudicationRequest({ decision: 'abstain', reasonCode: 'APPEAL_REVIEW' }), /appeal_adjudication_decision_invalid/);
  assert.throws(() => parseAppealAdjudicationRequest({ decision: 'uphold', reasonCode: 'bad code' }), /reason_code_required/);
  assert.equal(asAppealRiskClass('standard'), 'standard');
  assert.equal(asAppealRiskClass('high'), 'high');
  assert.throws(() => asAppealRiskClass('urgent'), /appeal_risk_class_invalid/);

  assert.deepEqual(asAppealVote(vote('reviewer-1', 'overturn', { level_snapshot: 5, vote_weight_snapshot: 2 })), {
    reviewerId: 'reviewer-1', decision: 'overturn', qualificationSnapshot: 'trained', levelSnapshot: 5,
    voteWeightSnapshot: 2, locked: true, recused: false,
  });
  assert.equal(asAppealVote(vote('reviewer-1', 'uphold', { assignment_state: 'recused' })).recused, true);
  assert.equal(asAppealVote(vote('reviewer-1', 'uphold', { conflict_checked: false })).recused, true);
  assert.equal(asAppealVote(vote('reviewer-1', 'uphold', { current_qualification_state: 'suspended' })).recused, true);
  assert.throws(() => asAppealVote(vote('reviewer-1', 'abstain')), /appeal_vote_decision_invalid/);
  assert.throws(() => asAppealVote(vote('reviewer-1', 'uphold', { qualification_snapshot: 'eligible' })), /appeal_vote_qualification_invalid/);
  assert.throws(() => asAppealVote(vote('reviewer-1', 'uphold', { level_snapshot: -1 })), /appeal_vote_level_invalid/);
  assert.throws(() => asAppealVote(vote('reviewer-1', 'uphold', { level_snapshot: 6 })), /appeal_vote_level_invalid/);
  assert.throws(() => asAppealVote(vote('reviewer-1', 'uphold', { vote_weight_snapshot: 3 })), /appeal_vote_weight_invalid/);

  assert.deepEqual(asAppealAdjudication({ adjudicator_id: 'editor-1', adjudicator_role: 'editorial', trained_snapshot: true, decision: 'uphold' }), {
    adjudicatorId: 'editor-1', role: 'editorial', trained: true, decision: 'uphold',
  });
  assert.equal(asAppealAdjudication({ adjudicator_id: 'journalist-1', adjudicator_role: 'journalist', trained_snapshot: false, decision: 'uphold' }).trained, false);
  assert.throws(() => asAppealAdjudication({ adjudicator_id: 'x', adjudicator_role: 'administrator', trained_snapshot: true, decision: 'uphold' }), /appeal_adjudicator_role_invalid/);
  assert.throws(() => asAppealAdjudication({ adjudicator_id: 'x', adjudicator_role: 'editorial', trained_snapshot: true, decision: 'abstain' }), /appeal_adjudication_decision_invalid/);
});

test('evaluates reviewer quorum, recusal, adjudication, and final outcomes', () => {
  const pendingQuorum = evaluateAppealFromRecords({ riskClass: 'standard', votes: fiveVotes().slice(0, 4), adjudications: [] }).evaluation;
  assert.equal(pendingQuorum.status, 'pending_quorum');
  assert.deepEqual(appealOutcomeAuditPlan(pendingQuorum), {
    outcomeState: 'pending_quorum', adjudicationActivityResult: 'pending', reviewerPanelDecision: null,
  });
  assert.equal(evaluateAppealFromRecords({ riskClass: 'standard', votes: fiveVotes(), adjudications: [] }).evaluation.status, 'pending_adjudication');
  assert.deepEqual(evaluateAppealFromRecords({
    riskClass: 'standard', votes: fiveVotes(),
    adjudications: [{ adjudicator_id: 'editor-1', adjudicator_role: 'editorial', trained_snapshot: true, decision: 'uphold' }],
  }), {
    riskClass: 'standard',
    evaluation: {
      status: 'resolved', reviewerPanelDecision: 'uphold', finalDecision: 'uphold', completedReviewers: 5,
      totalWeight: 5, overturnWeight: 0, upholdWeight: 5, winningShare: 1, requiredAdjudicators: 1,
      policyVersion: 'appeals-v1.0.0',
    },
  });
  assert.equal(evaluateAppealFromRecords({
    riskClass: 'high', votes: fiveVotes(),
    adjudications: [{ adjudicator_id: 'editor-1', adjudicator_role: 'editorial', trained_snapshot: true, decision: 'uphold' }],
  }).evaluation.status, 'pending_adjudication');
  assert.equal(evaluateAppealFromRecords({
    riskClass: 'high', votes: fiveVotes(),
    adjudications: [
      { adjudicator_id: 'editor-1', adjudicator_role: 'editorial', trained_snapshot: true, decision: 'uphold' },
      { adjudicator_id: 'journalist-1', adjudicator_role: 'journalist', trained_snapshot: true, decision: 'uphold' },
    ],
  }).evaluation.status, 'resolved');
  const disagreement = evaluateAppealFromRecords({
    riskClass: 'standard', votes: fiveVotes(),
    adjudications: [{ adjudicator_id: 'editor-1', adjudicator_role: 'editorial', trained_snapshot: true, decision: 'overturn' }],
  }).evaluation;
  assert.equal(disagreement.status, 'adjudication_disagreement');
  assert.deepEqual(appealOutcomeAuditPlan(disagreement), {
    outcomeState: 'adjudication_disagreement', adjudicationActivityResult: 'pending', reviewerPanelDecision: 'uphold',
  });
  assert.equal(evaluateAppealFromRecords({
    riskClass: 'standard',
    votes: [
      vote('reviewer-1', 'overturn', { level_snapshot: 5, vote_weight_snapshot: 2 }),
      vote('reviewer-2', 'overturn'), vote('reviewer-3', 'uphold'), vote('reviewer-4', 'uphold'), vote('reviewer-5', 'uphold'),
    ],
    adjudications: [],
  }).evaluation.status, 'no_consensus');
  assert.equal(evaluateAppealFromRecords({
    riskClass: 'standard', votes: [...fiveVotes().slice(0, 4), vote('reviewer-5', 'uphold', { assignment_state: 'recused' })], adjudications: [],
  }).evaluation.status, 'pending_quorum');

  const reversed = evaluateAppealFromRecords({
    riskClass: 'standard', votes: fiveVotes('overturn'),
    adjudications: [{ adjudicator_id: 'editor-1', adjudicator_role: 'editorial', trained_snapshot: true, decision: 'overturn' }],
  }).evaluation;
  assert.deepEqual(appealOutcomeAuditPlan(reversed), {
    outcomeState: 'resolved', adjudicationActivityResult: 'succeeded', reviewerPanelDecision: 'overturn',
    resolution: {
      finalDecision: 'overturn', reverseContent: true, enforcementAction: 'appeal_overturn',
      finalActivity: {
        eventType: 'appeals.decision_reversed', title: 'Appeal decision reversed',
        explanation: 'Your appeal outcome reversed the prior moderation decision.', result: 'reversed',
      },
      auditAction: 'moderation.appeal.outcome_applied', outboxEventType: 'moderation.appeal.resolved',
    },
  });
  const upheld = evaluateAppealFromRecords({
    riskClass: 'standard', votes: fiveVotes(),
    adjudications: [{ adjudicator_id: 'editor-1', adjudicator_role: 'editorial', trained_snapshot: true, decision: 'uphold' }],
  }).evaluation;
  assert.equal(appealOutcomeAuditPlan(upheld).resolution?.finalActivity.eventType, 'appeals.decision_upheld');
});
