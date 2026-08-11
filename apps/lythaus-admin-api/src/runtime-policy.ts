import {
  evaluateAppeal,
  type AppealAdjudication,
  type AppealEvaluation,
  type AppealRiskClass,
  type AppealVote,
} from '@lythaus/contracts';

export interface AppealVoteRecord {
  reviewer_id: string;
  decision: unknown;
  qualification_snapshot: unknown;
  level_snapshot: unknown;
  vote_weight_snapshot: unknown;
  assignment_state: unknown;
  conflict_checked: unknown;
  current_qualification_state: unknown;
}

export interface AppealAdjudicationRecord {
  adjudicator_id: string;
  adjudicator_role: unknown;
  trained_snapshot: unknown;
  decision: unknown;
}

export function assertActionableModerationCase(input: {
  caseState: unknown;
  sourceEventId: unknown;
  currentSourceEventId: unknown;
  contentActive: boolean;
}): void {
  if (input.caseState === 'superseded') throw new Error('moderation_case_superseded');
  if (input.caseState !== 'open') throw new Error('moderation_case_already_resolved');
  if (!input.contentActive
    || typeof input.sourceEventId !== 'string'
    || typeof input.currentSourceEventId !== 'string'
    || input.sourceEventId !== input.currentSourceEventId) {
    throw new Error('moderation_case_superseded');
  }
}

export function parseAppealAdjudicationRequest(input: {
  decision?: unknown;
  reasonCode?: unknown;
}): { decision: 'overturn' | 'uphold'; reasonCode: string } {
  if (input.decision !== 'overturn' && input.decision !== 'uphold') {
    throw new Error('appeal_adjudication_decision_invalid');
  }
  if (typeof input.reasonCode !== 'string' || !/^[A-Z0-9_.:-]{2,80}$/.test(input.reasonCode)) {
    throw new Error('reason_code_required');
  }
  return { decision: input.decision, reasonCode: input.reasonCode };
}

export function asAppealRiskClass(value: unknown): AppealRiskClass {
  if (value === 'standard' || value === 'high') return value;
  throw new Error('appeal_risk_class_invalid');
}

export function asAppealVote(row: AppealVoteRecord): AppealVote {
  if (row.decision !== 'overturn' && row.decision !== 'uphold') throw new Error('appeal_vote_decision_invalid');
  if (row.qualification_snapshot !== 'trained') throw new Error('appeal_vote_qualification_invalid');
  if (!Number.isInteger(row.level_snapshot) || (row.level_snapshot as number) < 0 || (row.level_snapshot as number) > 5) {
    throw new Error('appeal_vote_level_invalid');
  }
  if (row.vote_weight_snapshot !== 1 && row.vote_weight_snapshot !== 2) throw new Error('appeal_vote_weight_invalid');
  return {
    reviewerId: row.reviewer_id,
    decision: row.decision,
    qualificationSnapshot: 'trained',
    levelSnapshot: row.level_snapshot as AppealVote['levelSnapshot'],
    voteWeightSnapshot: row.vote_weight_snapshot,
    locked: true,
    recused: row.assignment_state !== 'voted' || !row.conflict_checked || row.current_qualification_state !== 'trained',
  };
}

export function asAppealAdjudication(row: AppealAdjudicationRecord): AppealAdjudication {
  if (row.adjudicator_role !== 'editorial' && row.adjudicator_role !== 'journalist') {
    throw new Error('appeal_adjudicator_role_invalid');
  }
  if (row.decision !== 'overturn' && row.decision !== 'uphold') {
    throw new Error('appeal_adjudication_decision_invalid');
  }
  return {
    adjudicatorId: row.adjudicator_id,
    role: row.adjudicator_role,
    trained: row.trained_snapshot === true,
    decision: row.decision,
  };
}

export function evaluateAppealFromRecords(input: {
  riskClass: unknown;
  votes: readonly AppealVoteRecord[];
  adjudications: readonly AppealAdjudicationRecord[];
}): { riskClass: AppealRiskClass; evaluation: AppealEvaluation } {
  const riskClass = asAppealRiskClass(input.riskClass);
  return {
    riskClass,
    evaluation: evaluateAppeal(input.votes.map(asAppealVote), input.adjudications.map(asAppealAdjudication), riskClass),
  };
}

export function appealOutcomeAuditPlan(evaluation: AppealEvaluation): {
  outcomeState: AppealEvaluation['status'];
  adjudicationActivityResult: 'succeeded' | 'pending';
  reviewerPanelDecision: AppealEvaluation['reviewerPanelDecision'];
  resolution?: {
    finalDecision: 'overturn' | 'uphold';
    reverseContent: boolean;
    enforcementAction: 'appeal_overturn' | 'appeal_uphold';
    finalActivity: {
      eventType: 'appeals.decision_reversed' | 'appeals.decision_upheld';
      title: string;
      explanation: string;
      result: 'reversed' | 'succeeded';
    };
    auditAction: 'moderation.appeal.outcome_applied';
    outboxEventType: 'moderation.appeal.resolved';
  };
} {
  const base = {
    outcomeState: evaluation.status,
    adjudicationActivityResult: evaluation.status === 'resolved' ? 'succeeded' as const : 'pending' as const,
    reviewerPanelDecision: evaluation.reviewerPanelDecision,
  };
  if (evaluation.status !== 'resolved' || !evaluation.finalDecision) return base;
  if (evaluation.finalDecision === 'overturn') {
    return {
      ...base,
      resolution: {
        finalDecision: 'overturn',
        reverseContent: true,
        enforcementAction: 'appeal_overturn',
        finalActivity: {
          eventType: 'appeals.decision_reversed',
          title: 'Appeal decision reversed',
          explanation: 'Your appeal outcome reversed the prior moderation decision.',
          result: 'reversed',
        },
        auditAction: 'moderation.appeal.outcome_applied',
        outboxEventType: 'moderation.appeal.resolved',
      },
    };
  }
  return {
    ...base,
    resolution: {
      finalDecision: 'uphold',
      reverseContent: false,
      enforcementAction: 'appeal_uphold',
      finalActivity: {
        eventType: 'appeals.decision_upheld',
        title: 'Appeal decision upheld',
        explanation: 'Your appeal outcome upheld the prior moderation decision.',
        result: 'succeeded',
      },
      auditAction: 'moderation.appeal.outcome_applied',
      outboxEventType: 'moderation.appeal.resolved',
    },
  };
}
