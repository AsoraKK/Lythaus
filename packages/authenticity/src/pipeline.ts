import {
  createDecisionAudit,
  createAuthenticityCase,
  type AuthenticityCase,
  type AuthenticityRecommendation,
  type ModerationDecision,
  type PolicyDecision,
  type PipelineState,
  type ProcessingMode,
} from './contracts.ts';
import { createModerationDecision, type ModerationAnalysis } from './moderation.ts';
import { uuidv7, type UUIDv7 } from './uuid.ts';

const ALLOWED_TRANSITIONS: Readonly<Record<PipelineState, readonly PipelineState[]>> = {
  SUBMISSION: ['PREFLIGHT', 'STOP'],
  PREFLIGHT: ['CHEAP_FORENSICS', 'SAFETY_MODERATION', 'FAST_AUTHENTICITY', 'STOP'],
  CHEAP_FORENSICS: ['SAFETY_MODERATION', 'FAST_AUTHENTICITY', 'DETERMINISTIC_POLICY', 'STOP'],
  SAFETY_MODERATION: ['FAST_AUTHENTICITY', 'UNCERTAINTY_ROUTER', 'DETERMINISTIC_POLICY', 'QUARANTINE_AUDIT', 'STOP'],
  QUARANTINE_AUDIT: ['STOP', 'REVIEW'],
  FAST_AUTHENTICITY: ['UNCERTAINTY_ROUTER', 'SAFETY_MODERATION', 'QUARANTINE_AUDIT', 'DETERMINISTIC_POLICY', 'REVIEW', 'STOP'],
  UNCERTAINTY_ROUTER: ['DEEP_AUTHENTICITY', 'GPT_OSS_REASONING', 'SAFETY_MODERATION', 'QUARANTINE_AUDIT', 'DETERMINISTIC_POLICY', 'REVIEW', 'STOP'],
  DEEP_AUTHENTICITY: ['GPT_OSS_REASONING', 'SAFETY_MODERATION', 'QUARANTINE_AUDIT', 'DETERMINISTIC_POLICY', 'REVIEW', 'STOP'],
  GPT_OSS_REASONING: ['SAFETY_MODERATION', 'QUARANTINE_AUDIT', 'DETERMINISTIC_POLICY', 'REVIEW', 'STOP'],
  DETERMINISTIC_POLICY: ['RESULT', 'REVIEW', 'APPEAL', 'STOP'],
  RESULT: ['REVIEW', 'APPEAL'],
  REVIEW: ['APPEAL', 'STOP'],
  APPEAL: ['RESULT', 'REVIEW', 'STOP'],
  STOP: [],
};

export function transitionPipelineState(current: PipelineState, next: PipelineState): PipelineState {
  if (!ALLOWED_TRANSITIONS[current].includes(next)) throw new Error(`pipeline_transition_invalid:${current}->${next}`);
  return next;
}

export interface PipelineHooks {
  preflight?: () => Promise<void>;
  cheapForensics?: () => Promise<void>;
  moderation?: () => Promise<ModerationDecision | ModerationAnalysis>;
  fastAuthenticity?: () => Promise<AuthenticityRecommendation>;
  routeUncertainty?: (recommendation: AuthenticityRecommendation | null) => Promise<'DEEP' | 'SHALLOW' | 'ABSTAIN'>;
  deepAuthenticity?: () => Promise<AuthenticityRecommendation>;
  judge?: (recommendation: AuthenticityRecommendation) => Promise<AuthenticityRecommendation>;
  deterministicPolicy?: (input: { caseRecord: AuthenticityCase; moderation: ModerationDecision | null; authenticity: AuthenticityRecommendation | null }) => Promise<PolicyDecision>;
};

export interface FoundationPipelineInput {
  caseRecord?: AuthenticityCase;
  contentKind: AuthenticityCase['contentKind'];
  processingMode: ProcessingMode;
  hooks?: PipelineHooks;
  allowDeepAnalysis?: boolean;
  customOrder?: readonly ('MODERATION' | 'AUTHENTICITY')[];
}

export interface FoundationPipelineResult {
  caseRecord: AuthenticityCase;
  states: readonly PipelineState[];
  moderationDecision: ModerationDecision | null;
  authenticityRecommendation: AuthenticityRecommendation | null;
  policyDecision: PolicyDecision;
  stoppedAt: PipelineState | null;
}

function appendState(states: PipelineState[], next: PipelineState): void {
  transitionPipelineState(states[states.length - 1], next);
  states.push(next);
}

function normalizeModeration(caseId: UUIDv7, value: ModerationDecision | ModerationAnalysis): ModerationDecision {
  return 'id' in value ? value : createModerationDecision(caseId, value);
}

function isSafetyBlock(decision: ModerationDecision | null): boolean {
  return decision !== null && decision.result === 'BLOCK';
}

export function foundationPolicyDecision(input: { caseRecord: AuthenticityCase; moderation: ModerationDecision | null; authenticity: AuthenticityRecommendation | null }): PolicyDecision {
  const safetyBlocked = input.moderation?.result === 'BLOCK';
  const providerFailure = input.moderation?.result === 'PROVIDER_FAILURE';
  const classification = safetyBlocked ? 'QUARANTINE' : 'REVIEW';
  const enforcementAction = safetyBlocked ? 'QUARANTINE' : 'REVIEW';
  const reasonCodes = safetyBlocked
    ? ['SAFETY_BLOCK_INDEPENDENT_OF_AUTHENTICITY']
    : providerFailure
      ? ['SAFETY_PROVIDER_FAILURE_REVIEW_REQUIRED']
      : ['AUTHENTICITY_SHADOW_MODE', input.authenticity ? 'MODEL_RECOMMENDATION_NOT_ENFORCING' : 'AUTHENTICITY_NOT_RUN'];
  return {
    id: uuidv7(),
    caseId: input.caseRecord.id,
    classification,
    enforcementAction,
    source: 'DETERMINISTIC_APPLICATION_CODE',
    authenticityEnforcementEnabled: false,
    audit: createDecisionAudit({
      reasonCodes,
      finalClassification: classification,
      applicability: 'applicable',
      uncertainty: { grade: 'unknown', lowerBound: null, upperBound: null, rationale: 'Foundation 001 does not grant authenticity model enforcement authority.' },
    }),
  };
}

export async function runFoundationPipeline(input: FoundationPipelineInput): Promise<FoundationPipelineResult> {
  const caseRecord = input.caseRecord ?? createAuthenticityCase({ contentKind: input.contentKind, processingMode: input.processingMode });
  const hooks = input.hooks ?? {};
  const states: PipelineState[] = ['SUBMISSION'];
  let moderationDecision: ModerationDecision | null = null;
  let authenticityRecommendation: AuthenticityRecommendation | null = null;
  let stoppedAt: PipelineState | null = null;
  appendState(states, 'PREFLIGHT');
  await hooks.preflight?.();
  appendState(states, 'CHEAP_FORENSICS');
  await hooks.cheapForensics?.();

  const shouldModerate = input.processingMode !== 'AUTHENTICITY_ONLY';
  const shouldAuthenticate = input.processingMode !== 'MODERATION_ONLY';
  const runModeration = async (stateAlreadySet = false): Promise<void> => {
    if (!hooks.moderation) return;
    if (!stateAlreadySet && states[states.length - 1] !== 'SAFETY_MODERATION') appendState(states, 'SAFETY_MODERATION');
    moderationDecision = normalizeModeration(caseRecord.id, await hooks.moderation());
  };
  const runAuthenticity = async (stateAlreadySet = false): Promise<void> => {
    if (!hooks.fastAuthenticity) return;
    if (!stateAlreadySet) appendState(states, 'FAST_AUTHENTICITY');
    authenticityRecommendation = await hooks.fastAuthenticity();
    appendState(states, 'UNCERTAINTY_ROUTER');
    const route = await hooks.routeUncertainty?.(authenticityRecommendation) ?? 'SHALLOW';
    if (route === 'DEEP' && input.allowDeepAnalysis && hooks.deepAuthenticity) {
      appendState(states, 'DEEP_AUTHENTICITY');
      authenticityRecommendation = await hooks.deepAuthenticity();
    }
    if (route !== 'ABSTAIN' && hooks.judge && authenticityRecommendation) {
      appendState(states, 'GPT_OSS_REASONING');
      authenticityRecommendation = await hooks.judge(authenticityRecommendation);
    }
  };

  if (input.processingMode === 'PARALLEL') {
    if (shouldModerate && hooks.moderation) appendState(states, 'SAFETY_MODERATION');
    if (shouldAuthenticate && hooks.fastAuthenticity) appendState(states, 'FAST_AUTHENTICITY');
    await Promise.all([shouldModerate ? runModeration(true) : Promise.resolve(), shouldAuthenticate ? runAuthenticity(true) : Promise.resolve()]);
  } else if (input.processingMode === 'AUTHENTICITY_THEN_MODERATION') {
    if (shouldAuthenticate) await runAuthenticity();
    if (shouldModerate) await runModeration();
  } else if (input.processingMode === 'CUSTOM_POLICY') {
    for (const step of input.customOrder ?? ['MODERATION', 'AUTHENTICITY']) {
      if (step === 'MODERATION' && shouldModerate) await runModeration();
      if (step === 'AUTHENTICITY' && shouldAuthenticate && !isSafetyBlock(moderationDecision)) await runAuthenticity();
    }
  } else {
    if (shouldModerate) await runModeration();
    if (isSafetyBlock(moderationDecision)) {
      appendState(states, 'QUARANTINE_AUDIT');
      appendState(states, 'STOP');
      stoppedAt = 'STOP';
    } else if (shouldAuthenticate) {
      await runAuthenticity();
    }
  }

  if (!stoppedAt && isSafetyBlock(moderationDecision)) {
    if (states[states.length - 1] !== 'QUARANTINE_AUDIT') appendState(states, 'QUARANTINE_AUDIT');
    appendState(states, 'STOP');
    stoppedAt = 'STOP';
  }
  if (!stoppedAt) {
    appendState(states, 'DETERMINISTIC_POLICY');
    const policyDecision = await hooks.deterministicPolicy?.({ caseRecord, moderation: moderationDecision, authenticity: authenticityRecommendation })
      ?? foundationPolicyDecision({ caseRecord, moderation: moderationDecision, authenticity: authenticityRecommendation });
    if (policyDecision.classification === 'REVIEW') appendState(states, 'REVIEW');
    else appendState(states, 'RESULT');
    return { caseRecord: { ...caseRecord, state: states[states.length - 1], status: policyDecision.classification === 'REVIEW' ? 'REVIEW' : 'COMPLETED', finalDecisionId: policyDecision.id, updatedAt: new Date().toISOString() }, states, moderationDecision, authenticityRecommendation, policyDecision, stoppedAt: null };
  }
  const policyDecision = foundationPolicyDecision({ caseRecord, moderation: moderationDecision, authenticity: authenticityRecommendation });
  return { caseRecord: { ...caseRecord, state: 'STOP', status: 'QUARANTINED', finalDecisionId: policyDecision.id, updatedAt: new Date().toISOString() }, states, moderationDecision, authenticityRecommendation, policyDecision, stoppedAt };
}
