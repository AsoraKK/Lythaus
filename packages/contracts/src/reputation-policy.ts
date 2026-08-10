export type ReputationLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const REPUTATION_PILLARS = [
  'accountability',
  'contribution',
  'conduct',
  'sourcing',
  'authenticity',
  'reviewReliability',
] as const;

export type ReputationPillar = (typeof REPUTATION_PILLARS)[number];
export type ReputationPillarScores = Readonly<Record<ReputationPillar, number>>;

export const REPUTATION_PILLAR_BASELINES: ReputationPillarScores = Object.freeze({
  accountability: 70,
  contribution: 0,
  conduct: 100,
  sourcing: 0,
  authenticity: 100,
  reviewReliability: 50,
});

export interface ReputationEvaluationInput {
  totalScore: number;
  pillarScores: ReputationPillarScores;
  accountAgeDays: number;
  activeDays: number;
  activeWeeks: number;
  verifiedRegisteredAccount: boolean;
  accountabilityIdentityDeclared: boolean;
  qualifyingHumanContributions: number;
  unresolvedSeriousEnforcement: boolean;
  activeFeatureRestriction: boolean;
  suspended: boolean;
  manipulationInvestigation: boolean;
  antiGamingEligible: boolean;
}

export interface ReputationLevelGate {
  level: ReputationLevel;
  name: string;
  minimumScore: number;
  minimumAccountAgeDays: number;
  minimumActiveDays: number;
  minimumActiveWeeks: number;
  minimumHumanContributions: number;
  minimumPillars: Partial<ReputationPillarScores>;
  requiresVerifiedAccount: boolean;
  requiresAccountabilityDeclaration: boolean;
}

export const REPUTATION_POLICY = Object.freeze({
  version: 'reputation-v2.0.0',
  pillarBaselines: REPUTATION_PILLAR_BASELINES,
  levels: [
    { level: 0, name: 'New', minimumScore: 0, minimumAccountAgeDays: 0, minimumActiveDays: 0, minimumActiveWeeks: 0, minimumHumanContributions: 0, minimumPillars: {}, requiresVerifiedAccount: false, requiresAccountabilityDeclaration: false },
    { level: 1, name: 'Accountable Participant', minimumScore: 10, minimumAccountAgeDays: 1, minimumActiveDays: 1, minimumActiveWeeks: 1, minimumHumanContributions: 0, minimumPillars: { accountability: 20, conduct: 20 }, requiresVerifiedAccount: true, requiresAccountabilityDeclaration: true },
    { level: 2, name: 'Consistent Contributor', minimumScore: 60, minimumAccountAgeDays: 14, minimumActiveDays: 4, minimumActiveWeeks: 2, minimumHumanContributions: 2, minimumPillars: { accountability: 30, contribution: 25, conduct: 35, authenticity: 30 }, requiresVerifiedAccount: true, requiresAccountabilityDeclaration: true },
    { level: 3, name: 'Trusted Contributor', minimumScore: 150, minimumAccountAgeDays: 28, minimumActiveDays: 12, minimumActiveWeeks: 4, minimumHumanContributions: 8, minimumPillars: { accountability: 45, contribution: 45, conduct: 55, sourcing: 15, authenticity: 50 }, requiresVerifiedAccount: true, requiresAccountabilityDeclaration: true },
    { level: 4, name: 'Established Contributor', minimumScore: 300, minimumAccountAgeDays: 60, minimumActiveDays: 24, minimumActiveWeeks: 8, minimumHumanContributions: 20, minimumPillars: { accountability: 65, contribution: 65, conduct: 75, sourcing: 35, authenticity: 70 }, requiresVerifiedAccount: true, requiresAccountabilityDeclaration: true },
    { level: 5, name: 'Highly Trusted Contributor', minimumScore: 500, minimumAccountAgeDays: 105, minimumActiveDays: 40, minimumActiveWeeks: 11, minimumHumanContributions: 35, minimumPillars: { accountability: 80, contribution: 80, conduct: 90, sourcing: 55, authenticity: 85 }, requiresVerifiedAccount: true, requiresAccountabilityDeclaration: true },
  ] satisfies readonly ReputationLevelGate[],
});

export interface ReputationEvaluation {
  level: ReputationLevel;
  levelName: string;
  policyVersion: string;
  promotionBlockers: readonly string[];
}

function gateBlockers(input: ReputationEvaluationInput, gate: ReputationLevelGate): string[] {
  const blockers: string[] = [];
  if (input.totalScore < gate.minimumScore) blockers.push('minimum_score');
  if (input.accountAgeDays < gate.minimumAccountAgeDays) blockers.push('account_age');
  if (input.activeDays < gate.minimumActiveDays) blockers.push('active_days');
  if (input.activeWeeks < gate.minimumActiveWeeks) blockers.push('active_weeks');
  if (input.qualifyingHumanContributions < gate.minimumHumanContributions) blockers.push('qualifying_human_contributions');
  if (gate.requiresVerifiedAccount && !input.verifiedRegisteredAccount) blockers.push('verified_registered_account');
  if (gate.requiresAccountabilityDeclaration && !input.accountabilityIdentityDeclared) blockers.push('accountability_identity_declared');
  for (const [pillar, minimum] of Object.entries(gate.minimumPillars)) {
    if (input.pillarScores[pillar as ReputationPillar] < Number(minimum)) blockers.push(`pillar_${pillar}`);
  }
  if (input.unresolvedSeriousEnforcement) blockers.push('unresolved_serious_enforcement');
  if (input.activeFeatureRestriction) blockers.push('active_feature_restriction');
  if (input.suspended) blockers.push('suspended');
  if (input.manipulationInvestigation) blockers.push('manipulation_investigation');
  if (!input.antiGamingEligible) blockers.push('anti_gaming_eligibility');
  return blockers;
}

export function evaluateReputation(input: ReputationEvaluationInput): ReputationEvaluation {
  let achievedGate = REPUTATION_POLICY.levels[0];
  for (const gate of REPUTATION_POLICY.levels.slice(1)) {
    if (gateBlockers(input, gate).length > 0) break;
    achievedGate = gate;
  }

  const nextGate = REPUTATION_POLICY.levels.find((gate) => gate.level === achievedGate.level + 1);
  return Object.freeze({
    level: achievedGate.level,
    levelName: achievedGate.name,
    policyVersion: REPUTATION_POLICY.version,
    promotionBlockers: nextGate ? gateBlockers(input, nextGate) : [],
  });
}

export type ReputationSignalType =
  | 'email_verified'
  | 'accountability_identity_declared'
  | 'qualifying_human_contribution'
  | 'verified_source'
  | 'confirmed_spam'
  | 'confirmed_harassment'
  | 'authenticity_evasion'
  | 'reliable_review'
  | 'reputation_event_reversal'
  | 'ai_assisted_content'
  | 'ai_generated_content'
  | 'raw_reaction_received'
  | 'raw_follow_received'
  | 'self_interaction'
  | 'duplicate_content';

export type ReputationEventDisposition = 'positive' | 'negative' | 'withheld' | 'reversed';

export interface ReputationEventPolicy {
  pillar: ReputationPillar | null;
  disposition: ReputationEventDisposition;
  baseImpact: number;
  oneTime?: boolean;
  dailyDiminishing?: boolean;
}

export const REPUTATION_EVENT_CATALOG: Readonly<Record<ReputationSignalType, ReputationEventPolicy>> = Object.freeze({
  email_verified: { pillar: 'accountability', disposition: 'positive', baseImpact: 5, oneTime: true },
  accountability_identity_declared: { pillar: 'accountability', disposition: 'positive', baseImpact: 5, oneTime: true },
  qualifying_human_contribution: { pillar: 'contribution', disposition: 'positive', baseImpact: 10, dailyDiminishing: true },
  verified_source: { pillar: 'sourcing', disposition: 'positive', baseImpact: 5 },
  confirmed_spam: { pillar: 'conduct', disposition: 'negative', baseImpact: -20 },
  confirmed_harassment: { pillar: 'conduct', disposition: 'negative', baseImpact: -30 },
  authenticity_evasion: { pillar: 'authenticity', disposition: 'negative', baseImpact: -25 },
  reliable_review: { pillar: 'reviewReliability', disposition: 'positive', baseImpact: 5 },
  reputation_event_reversal: { pillar: null, disposition: 'reversed', baseImpact: 0 },
  ai_assisted_content: { pillar: null, disposition: 'withheld', baseImpact: 0 },
  ai_generated_content: { pillar: null, disposition: 'withheld', baseImpact: 0 },
  raw_reaction_received: { pillar: null, disposition: 'withheld', baseImpact: 0 },
  raw_follow_received: { pillar: null, disposition: 'withheld', baseImpact: 0 },
  self_interaction: { pillar: null, disposition: 'withheld', baseImpact: 0 },
  duplicate_content: { pillar: null, disposition: 'withheld', baseImpact: 0 },
});

export interface ReputationImpactInput {
  signalType: ReputationSignalType;
  occurrenceInWindow: number;
  suspended: boolean;
  reversalOfImpact?: number;
}

export interface ReputationImpact {
  impact: number;
  explanationCode: string;
  disposition: ReputationEventDisposition;
  pillar: ReputationPillar | null;
}

export function calculateReputationImpact(input: ReputationImpactInput): ReputationImpact {
  const policy = REPUTATION_EVENT_CATALOG[input.signalType];
  const occurrence = Number.isFinite(input.occurrenceInWindow)
    ? Math.max(1, Math.floor(input.occurrenceInWindow))
    : 1;
  if (policy.disposition === 'withheld') {
    return { impact: 0, explanationCode: `${input.signalType}_not_reputation_eligible`, disposition: 'withheld', pillar: policy.pillar };
  }
  if (input.suspended && policy.disposition === 'positive') {
    return { impact: 0, explanationCode: 'normal_earning_suspended', disposition: 'withheld', pillar: policy.pillar };
  }
  if (policy.disposition === 'reversed') {
    const reversalOfImpact = input.reversalOfImpact;
    if (typeof reversalOfImpact !== 'number' || !Number.isFinite(reversalOfImpact) || reversalOfImpact === 0) {
      return { impact: 0, explanationCode: 'reversal_reference_required', disposition: 'withheld', pillar: policy.pillar };
    }
    return { impact: -Math.round(reversalOfImpact), explanationCode: 'reputation_event_reversed', disposition: 'reversed', pillar: policy.pillar };
  }
  if (policy.disposition === 'negative') {
    return { impact: policy.baseImpact, explanationCode: input.signalType, disposition: 'negative', pillar: policy.pillar };
  }
  if (policy.oneTime && occurrence > 1) {
    return { impact: 0, explanationCode: `${input.signalType}_already_recorded`, disposition: 'withheld', pillar: policy.pillar };
  }
  const diminishingMultiplier = policy.dailyDiminishing
    ? occurrence === 1 ? 1 : occurrence <= 3 ? 0.5 : occurrence <= 6 ? 0.25 : 0
    : 1;
  return {
    impact: Math.round(policy.baseImpact * diminishingMultiplier),
    explanationCode: diminishingMultiplier === 0 ? 'healthy_activity_cap_reached' : input.signalType,
    disposition: diminishingMultiplier === 0 ? 'withheld' : 'positive',
    pillar: policy.pillar,
  };
}

export function publicReputationSummary(evaluation: ReputationEvaluation): {
  level: ReputationLevel;
  label: string;
  policyVersion: string;
} {
  return {
    level: evaluation.level,
    label: evaluation.levelName,
    policyVersion: evaluation.policyVersion,
  };
}
