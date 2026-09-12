import { mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

export const WP004B_BUDGET_ACCOUNTING_SCHEMA_VERSION = 'lythaus-wp004b-call-accounting-v1' as const;
export const WP004B_BUDGET_FINALIZER_SCHEMA_VERSION = 'lythaus-wp004b-budget-finalizer-v1' as const;
export const WP004B_MAX_JUDGE_CALLS = 3 as const;
export const WP004B_MAX_TOTAL_CALLS = 3 as const;
export const WP004B_RETRIES_ALLOWED = 0 as const;
export const WP004B_ACCOUNTING_PROVIDER = 'cloudflare-workers-ai' as const;
export const WP004B_ACCOUNTING_CASE_IDS = ['B1', 'B2', 'B3'] as const;
export const WP004B_JSON_SCHEMA_CAPABILITY_CASE_IDS = ['G1', 'G2'] as const;
export const WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS = 2 as const;
export const WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_CASE_IDS = ['H1'] as const;
export const WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS = 1 as const;
const SAFE_ENVELOPE_CLASSIFICATIONS = new Set([
  'DIRECT_CANONICAL', 'RESPONSE_OBJECT', 'RESPONSE_STRING', 'RESULT_STRING', 'OUTPUT_TEXT_STRING', 'CHAT_COMPLETION', 'UNKNOWN',
]);
const SAFE_NORMALIZATION_FAILURE_CODES = new Set([
  'RESPONSE_MISSING', 'RESPONSE_TYPE_UNSUPPORTED', 'RESPONSE_STRING_NOT_JSON', 'RESPONSE_OBJECT_UNWRAP_FAILED',
  'SCHEMA_VERSION_INVALID', 'PRIMARY_HYPOTHESIS_INVALID', 'ALTERNATIVES_INVALID', 'SUPPORTING_EVIDENCE_INVALID',
  'CONTRADICTORY_EVIDENCE_INVALID', 'UNKNOWN_EVIDENCE_REFERENCE', 'MISSING_EVIDENCE_INVALID', 'UNCERTAINTY_INVALID',
  'REQUIRES_REVIEW_INVALID', 'ADDITIONAL_TEST_INVALID', 'REASONED_RECHECK_INVALID', 'RATIONALE_INVALID',
  'ENFORCEMENT_AUTHORITY_INVALID', 'FORBIDDEN_FIELD_PRESENT', 'CHOICES_MISSING', 'CHOICES_TYPE_UNSUPPORTED',
  'CHOICES_EMPTY', 'CHOICE_COUNT_INVALID', 'CHOICE_INVALID', 'MESSAGE_MISSING', 'MESSAGE_INVALID',
  'MESSAGE_CONTENT_MISSING', 'MESSAGE_CONTENT_TYPE_UNSUPPORTED', 'MESSAGE_CONTENT_NOT_JSON', 'FINISH_REASON_TRUNCATED',
  'FINISH_REASON_UNSUPPORTED', 'UNEXPECTED_TOOL_CALL', 'UNKNOWN_RESPONSE_SHAPE', 'MINIMAL_SCHEMA_INVALID',
]);

export const WP004B_ACCOUNTING_FAILURE_STAGES = [
  'NOT_STARTED',
  'PRE_CALL_VALIDATION',
  'REQUEST_SENT',
  'TRANSPORT',
  'PROVIDER_ENVELOPE',
  'CANONICAL_SCHEMA',
  'EPISTEMIC_EVALUATION',
  'CASE_EXPECTATION',
  'REPORTING',
  'COMPLETED',
] as const;
export type Wp004bAccountingFailureStage = (typeof WP004B_ACCOUNTING_FAILURE_STAGES)[number];

export interface Wp004bCallRecord {
  caseId: string;
  sequenceNumber: number;
  provider: typeof WP004B_ACCOUNTING_PROVIDER;
  model: string;
  callAttempted: true;
  transportCompleted: boolean;
  canonicalSuccess: boolean;
  failureStage: Wp004bAccountingFailureStage;
  executionMs: number | null;
  retryCount: 0;
  httpStatus: number | null;
  providerEnvelopeClassification: string | null;
  normalizationFailureCode: string | null;
  ambiguousSend: boolean;
}

export interface Wp004bCaseAccounting {
  caseId: string;
  sequenceNumber: number | null;
  callAttempted: boolean;
  transportCompleted: boolean;
  canonicalSuccess: boolean;
  failureStage: Wp004bAccountingFailureStage;
  executionMs: number | null;
  retryCount: 0;
  httpStatus: number | null;
  providerEnvelopeClassification: string | null;
  normalizationFailureCode: string | null;
  resultAvailable: boolean;
  ambiguousSend: boolean;
}

export interface Wp004bBudgetJournal {
  schemaVersion: typeof WP004B_BUDGET_ACCOUNTING_SCHEMA_VERSION;
  budget: {
    maxJudgeCalls: number;
    maxTotalCalls: number;
    retriesAllowed: typeof WP004B_RETRIES_ALLOWED;
  };
  caseOrder: readonly string[];
  observed: {
    judgeCallsAttempted: number;
    totalCallsAttempted: number;
    retries: number;
  };
  attempts: readonly Wp004bCallRecord[];
  cases: readonly Wp004bCaseAccounting[];
  budgetIntegrity: 'PASS' | 'FAIL';
  scientificValidity: 'VALID_FOR_SCIENTIFIC_SCORING' | 'INVALID_FOR_SCIENTIFIC_SCORING';
}

export interface Wp004bBudgetReservation {
  caseId: string;
  sequenceNumber: number;
}

export interface Wp004bTransportUpdate {
  transportCompleted: boolean;
  canonicalSuccess: boolean;
  executionMs?: number | null;
  httpStatus?: number | null;
  providerEnvelopeClassification?: string | null;
  normalizationFailureCode?: string | null;
  ambiguousSend?: boolean;
  failureStage?: Wp004bAccountingFailureStage;
}

export interface Wp004bBudgetFinalizerSummary {
  schemaVersion: typeof WP004B_BUDGET_FINALIZER_SCHEMA_VERSION;
  budget: Wp004bBudgetJournal['budget'];
  observed: Wp004bBudgetJournal['observed'];
  cases: readonly Pick<Wp004bCaseAccounting, 'caseId' | 'sequenceNumber' | 'callAttempted' | 'transportCompleted' | 'canonicalSuccess' | 'failureStage' | 'executionMs' | 'retryCount' | 'httpStatus' | 'providerEnvelopeClassification' | 'normalizationFailureCode' | 'resultAvailable' | 'ambiguousSend'>[];
  budgetIntegrity: Wp004bBudgetJournal['budgetIntegrity'];
  scientificValidity: Wp004bBudgetJournal['scientificValidity'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeInteger(value: unknown, fallback: number | null = null): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function safeExecutionMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function safeToken(value: unknown, maxLength = 96): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return null;
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value) ? value : null;
}

function safeModel(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 160) return null;
  return /^[@A-Za-z0-9][@A-Za-z0-9_./:-]*$/.test(value) ? value : null;
}

function safeEnvelopeClassification(value: unknown): string | null {
  return typeof value === 'string' && SAFE_ENVELOPE_CLASSIFICATIONS.has(value) ? value : null;
}

function safeNormalizationCode(value: unknown): string | null {
  return typeof value === 'string' && SAFE_NORMALIZATION_FAILURE_CODES.has(value) ? value : null;
}

function safeAttempt(value: unknown): (Wp004bCallRecord & { caseId: string; sequenceNumber: number }) | null {
  if (!isRecord(value)) return null;
  const caseId = safeToken(value.caseId, 160);
  const sequenceNumber = safeInteger(value.sequenceNumber);
  const model = safeModel(value.model);
  if (!caseId || sequenceNumber === null || !model || value.provider !== WP004B_ACCOUNTING_PROVIDER || value.callAttempted !== true
    || typeof value.transportCompleted !== 'boolean' || typeof value.canonicalSuccess !== 'boolean' || !isKnownStage(value.failureStage)
    || value.retryCount !== 0 || !isNullableExecutionMs(value.executionMs) || !isNullableInteger(value.httpStatus)
    || !isNullableSafeCode(value.providerEnvelopeClassification, safeEnvelopeClassification)
    || !isNullableSafeCode(value.normalizationFailureCode, safeNormalizationCode) || typeof value.ambiguousSend !== 'boolean') return null;
  return {
    caseId,
    sequenceNumber,
    provider: WP004B_ACCOUNTING_PROVIDER,
    model,
    callAttempted: true,
    transportCompleted: value.transportCompleted === true,
    canonicalSuccess: value.canonicalSuccess === true,
    failureStage: value.failureStage,
    executionMs: safeExecutionMs(value.executionMs),
    retryCount: 0,
    httpStatus: safeInteger(value.httpStatus),
    providerEnvelopeClassification: safeEnvelopeClassification(value.providerEnvelopeClassification),
    normalizationFailureCode: safeNormalizationCode(value.normalizationFailureCode),
    ambiguousSend: value.ambiguousSend === true,
  };
}

function isKnownStage(value: unknown): value is Wp004bAccountingFailureStage {
  return typeof value === 'string' && (WP004B_ACCOUNTING_FAILURE_STAGES as readonly string[]).includes(value);
}

function isNullableInteger(value: unknown): boolean {
  return value === null || safeInteger(value) !== null;
}

function isNullableExecutionMs(value: unknown): boolean {
  return value === null || safeExecutionMs(value) !== null;
}

function isNullableSafeCode(value: unknown, safeValue: (candidate: unknown) => string | null): boolean {
  return value === null || safeValue(value) !== null;
}

function cloneCase(value: Wp004bCaseAccounting): Wp004bCaseAccounting {
  return { ...value };
}

function cloneAttempt(value: Wp004bCallRecord): Wp004bCallRecord {
  return { ...value };
}

export class Wp004bBudgetLedger {
  readonly provider = WP004B_ACCOUNTING_PROVIDER;
  readonly model: string;
  readonly caseOrder: readonly string[];
  readonly maxJudgeCalls: number;
  readonly maxTotalCalls: number;
  readonly retriesAllowed = WP004B_RETRIES_ALLOWED;
  private readonly attempts: Wp004bCallRecord[] = [];
  private readonly caseState = new Map<string, Wp004bCaseAccounting>();

  constructor(options: { model: string; caseIds?: readonly string[]; maxJudgeCalls?: number; maxTotalCalls?: number }) {
    const model = safeModel(options.model);
    if (!model) throw new Error('WP004B_ACCOUNTING_MODEL_INVALID');
    const caseIds = options.caseIds ?? WP004B_ACCOUNTING_CASE_IDS;
    if (caseIds.length === 0 || new Set(caseIds).size !== caseIds.length || caseIds.some((item) => !safeToken(item, 160))) {
      throw new Error('WP004B_ACCOUNTING_CASES_INVALID');
    }
    this.model = model;
    this.caseOrder = [...caseIds];
    this.maxJudgeCalls = options.maxJudgeCalls ?? WP004B_MAX_JUDGE_CALLS;
    this.maxTotalCalls = options.maxTotalCalls ?? WP004B_MAX_TOTAL_CALLS;
    if (!Number.isInteger(this.maxJudgeCalls) || !Number.isInteger(this.maxTotalCalls)
      || this.maxJudgeCalls < 1 || this.maxTotalCalls < 1
      || this.maxJudgeCalls > WP004B_MAX_JUDGE_CALLS || this.maxTotalCalls > WP004B_MAX_TOTAL_CALLS
      || this.maxJudgeCalls !== this.maxTotalCalls) throw new Error('WP004B_ACCOUNTING_BUDGET_INVALID');
    for (const caseId of this.caseOrder) {
      this.caseState.set(caseId, {
        caseId,
        sequenceNumber: null,
        callAttempted: false,
        transportCompleted: false,
        canonicalSuccess: false,
        failureStage: 'NOT_STARTED',
        executionMs: null,
        retryCount: 0,
        httpStatus: null,
        providerEnvelopeClassification: null,
        normalizationFailureCode: null,
        resultAvailable: false,
        ambiguousSend: false,
      });
    }
  }

  preCallValidation(caseId: string): void {
    const state = this.requireCase(caseId);
    if (state.callAttempted) throw new Error('WP004B_CASE_CALL_CAP_EXCEEDED');
    state.failureStage = 'PRE_CALL_VALIDATION';
  }

  reserveCall(caseId: string): Wp004bBudgetReservation {
    const state = this.requireCase(caseId);
    if (state.callAttempted) throw new Error('WP004B_CASE_CALL_CAP_EXCEEDED');
    if (this.attempts.length >= this.maxJudgeCalls || this.attempts.length >= this.maxTotalCalls) throw new Error('WP004B_CALL_CAP_EXCEEDED');
    const sequenceNumber = this.attempts.length + 1;
    const record: Wp004bCallRecord = {
      caseId,
      sequenceNumber,
      provider: this.provider,
      model: this.model,
      callAttempted: true,
      transportCompleted: false,
      canonicalSuccess: false,
      failureStage: 'REQUEST_SENT',
      executionMs: null,
      retryCount: 0,
      httpStatus: null,
      providerEnvelopeClassification: null,
      normalizationFailureCode: null,
      ambiguousSend: false,
    };
    this.attempts.push(record);
    Object.assign(state, {
      sequenceNumber,
      callAttempted: true,
      failureStage: 'REQUEST_SENT',
    });
    return { caseId, sequenceNumber };
  }

  postTransport(caseId: string, update: Wp004bTransportUpdate): void {
    const record = this.requireAttempt(caseId);
    const state = this.requireCase(caseId);
    const failureStage = update.failureStage ?? (update.transportCompleted
      ? (update.canonicalSuccess ? 'PROVIDER_ENVELOPE' : 'CANONICAL_SCHEMA')
      : 'TRANSPORT');
    if (!WP004B_ACCOUNTING_FAILURE_STAGES.includes(failureStage)) throw new Error('WP004B_ACCOUNTING_STAGE_INVALID');
    Object.assign(record, {
      transportCompleted: Boolean(update.transportCompleted),
      canonicalSuccess: Boolean(update.canonicalSuccess),
      failureStage,
      executionMs: safeExecutionMs(update.executionMs),
      httpStatus: safeInteger(update.httpStatus),
      providerEnvelopeClassification: safeEnvelopeClassification(update.providerEnvelopeClassification),
      normalizationFailureCode: safeNormalizationCode(update.normalizationFailureCode),
      ambiguousSend: Boolean(update.ambiguousSend),
    });
    Object.assign(state, {
      transportCompleted: record.transportCompleted,
      canonicalSuccess: record.canonicalSuccess,
      failureStage: record.failureStage,
      executionMs: record.executionMs,
      httpStatus: record.httpStatus,
      providerEnvelopeClassification: record.providerEnvelopeClassification,
      normalizationFailureCode: record.normalizationFailureCode,
      ambiguousSend: record.ambiguousSend,
    });
  }

  setStage(caseId: string, nextStage: Wp004bAccountingFailureStage): void {
    const record = this.requireAttempt(caseId);
    const state = this.requireCase(caseId);
    if (!WP004B_ACCOUNTING_FAILURE_STAGES.includes(nextStage)) throw new Error('WP004B_ACCOUNTING_STAGE_INVALID');
    record.failureStage = nextStage;
    state.failureStage = nextStage;
  }

  markResultAvailable(caseId: string): void {
    this.requireAttempt(caseId);
    this.requireCase(caseId).resultAvailable = true;
  }

  markResultUnavailable(caseId: string): void {
    this.requireAttempt(caseId);
    this.requireCase(caseId).resultAvailable = false;
  }

  markAmbiguousSend(caseId: string, executionMs: number | null = null): void {
    this.postTransport(caseId, {
      transportCompleted: false,
      canonicalSuccess: false,
      executionMs,
      ambiguousSend: true,
      failureStage: 'REQUEST_SENT',
    });
  }

  snapshot(): Wp004bBudgetJournal {
    const attempts = this.attempts.map(cloneAttempt);
    const cases = this.caseOrder.map((caseId) => cloneCase(this.requireCase(caseId)));
    const budgetIntegrity = this.isBudgetIntact(attempts, cases) ? 'PASS' : 'FAIL';
    const scientificValidity = budgetIntegrity === 'PASS'
      && cases.every((item) => item.callAttempted && item.resultAvailable && !item.ambiguousSend)
      ? 'VALID_FOR_SCIENTIFIC_SCORING'
      : 'INVALID_FOR_SCIENTIFIC_SCORING';
    return {
      schemaVersion: WP004B_BUDGET_ACCOUNTING_SCHEMA_VERSION,
      budget: { maxJudgeCalls: this.maxJudgeCalls, maxTotalCalls: this.maxTotalCalls, retriesAllowed: WP004B_RETRIES_ALLOWED },
      caseOrder: [...this.caseOrder],
      observed: { judgeCallsAttempted: attempts.length, totalCallsAttempted: attempts.length, retries: attempts.reduce((sum, item) => sum + item.retryCount, 0) },
      attempts,
      cases,
      budgetIntegrity,
      scientificValidity,
    };
  }

  private isBudgetIntact(attempts: readonly Wp004bCallRecord[], cases: readonly Wp004bCaseAccounting[]): boolean {
    if (attempts.length > this.maxJudgeCalls || attempts.length > this.maxTotalCalls) return false;
    if (attempts.some((item, index) => item.sequenceNumber !== index + 1 || item.retryCount !== 0 || item.callAttempted !== true || item.provider !== this.provider || item.model !== this.model)) return false;
    if (cases.some((item) => {
      const attempt = attempts.find((candidate) => candidate.caseId === item.caseId);
      return item.retryCount !== 0
        || item.callAttempted !== Boolean(attempt)
        || item.sequenceNumber !== (attempt?.sequenceNumber ?? null);
    })) return false;
    return new Set(attempts.map((item) => item.caseId)).size === attempts.length;
  }

  private requireCase(caseId: string): Wp004bCaseAccounting {
    const state = this.caseState.get(caseId);
    if (!state) throw new Error('WP004B_CASE_UNKNOWN');
    return state;
  }

  private requireAttempt(caseId: string): Wp004bCallRecord {
    const attempt = this.attempts.find((item) => item.caseId === caseId);
    if (!attempt) throw new Error('WP004B_CALL_NOT_RESERVED');
    return attempt;
  }
}

export function createWp004bBudgetLedger(options: ConstructorParameters<typeof Wp004bBudgetLedger>[0]): Wp004bBudgetLedger {
  return new Wp004bBudgetLedger(options);
}

function sameCaseOrder(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((caseId, index) => caseId === expected[index]);
}

function isSupportedAccountingProfile(caseOrder: readonly string[], maxJudgeCalls: number | null, maxTotalCalls: number | null): boolean {
  return (maxJudgeCalls === WP004B_MAX_JUDGE_CALLS && maxTotalCalls === WP004B_MAX_TOTAL_CALLS && sameCaseOrder(caseOrder, WP004B_ACCOUNTING_CASE_IDS))
    || (maxJudgeCalls === WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS && maxTotalCalls === WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS
      && sameCaseOrder(caseOrder, WP004B_JSON_SCHEMA_CAPABILITY_CASE_IDS))
    || (maxJudgeCalls === WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS
      && maxTotalCalls === WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS
      && sameCaseOrder(caseOrder, WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_CASE_IDS));
}

export interface Wp004bFinalizerProfile {
  caseOrder: readonly string[];
  maxJudgeCalls: number;
  maxTotalCalls: number;
}

function profileForFinalizer(profile: Partial<Wp004bFinalizerProfile> = {}): Wp004bFinalizerProfile {
  const minimalConfirmation = profile.maxJudgeCalls === WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS
    && profile.maxTotalCalls === WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS
    && sameCaseOrder(profile.caseOrder ?? WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_CASE_IDS, WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_CASE_IDS);
  if (minimalConfirmation) return {
    caseOrder: [...WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_CASE_IDS],
    maxJudgeCalls: WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS,
    maxTotalCalls: WP004B_JSON_SCHEMA_MINIMAL_CONFIRMATION_MAX_CALLS,
  };
  const capability = profile.maxJudgeCalls === WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS
    && profile.maxTotalCalls === WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS
    && sameCaseOrder(profile.caseOrder ?? WP004B_JSON_SCHEMA_CAPABILITY_CASE_IDS, WP004B_JSON_SCHEMA_CAPABILITY_CASE_IDS);
  if (capability) return {
    caseOrder: [...WP004B_JSON_SCHEMA_CAPABILITY_CASE_IDS],
    maxJudgeCalls: WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS,
    maxTotalCalls: WP004B_JSON_SCHEMA_CAPABILITY_MAX_CALLS,
  };
  return {
    caseOrder: [...WP004B_ACCOUNTING_CASE_IDS],
    maxJudgeCalls: WP004B_MAX_JUDGE_CALLS,
    maxTotalCalls: WP004B_MAX_TOTAL_CALLS,
  };
}

export function buildWp004bBudgetFinalizerSummary(input: unknown, expectedProfile: Partial<Wp004bFinalizerProfile> = {}): Wp004bBudgetFinalizerSummary {
  if (!isRecord(input) || input.schemaVersion !== WP004B_BUDGET_ACCOUNTING_SCHEMA_VERSION
    || !isRecord(input.budget) || !isRecord(input.observed) || !Array.isArray(input.cases) || !Array.isArray(input.attempts) || !Array.isArray(input.caseOrder)) {
    return emergencyFinalizerSummary(expectedProfile);
  }
  const observed = {
    judgeCallsAttempted: safeInteger(input.observed.judgeCallsAttempted),
    totalCallsAttempted: safeInteger(input.observed.totalCallsAttempted),
    retries: safeInteger(input.observed.retries),
  };
  const budget = {
    maxJudgeCalls: safeInteger(input.budget.maxJudgeCalls),
    maxTotalCalls: safeInteger(input.budget.maxTotalCalls),
    retriesAllowed: safeInteger(input.budget.retriesAllowed),
  };
  const caseOrder = input.caseOrder.map((value) => safeToken(value, 160)).filter((value): value is string => value !== null);
  const attempts = input.attempts.map(safeAttempt);
  const casesStructurallySafe = input.cases.every((value) => {
    if (!isRecord(value)) return false;
    return safeToken(value.caseId, 160) !== null
      && typeof value.callAttempted === 'boolean'
      && typeof value.transportCompleted === 'boolean'
      && typeof value.canonicalSuccess === 'boolean'
      && isKnownStage(value.failureStage)
      && value.retryCount === 0
      && isNullableExecutionMs(value.executionMs)
      && isNullableInteger(value.httpStatus)
      && isNullableSafeCode(value.providerEnvelopeClassification, safeEnvelopeClassification)
      && isNullableSafeCode(value.normalizationFailureCode, safeNormalizationCode)
      && typeof value.resultAvailable === 'boolean'
      && typeof value.ambiguousSend === 'boolean';
  });
  const cases = input.cases.map((value) => {
    const item = isRecord(value) ? value : {};
    const rawCaseId = safeToken(item.caseId, 160);
    return {
      caseId: rawCaseId && caseOrder.includes(rawCaseId) ? rawCaseId : 'UNKNOWN_CASE',
      sequenceNumber: safeInteger(item.sequenceNumber),
      callAttempted: item.callAttempted === true,
      transportCompleted: item.transportCompleted === true,
      canonicalSuccess: item.canonicalSuccess === true,
      failureStage: isKnownStage(item.failureStage) ? item.failureStage : 'REPORTING',
      executionMs: safeExecutionMs(item.executionMs),
      retryCount: 0 as const,
      httpStatus: safeInteger(item.httpStatus),
      providerEnvelopeClassification: safeEnvelopeClassification(item.providerEnvelopeClassification),
      normalizationFailureCode: safeNormalizationCode(item.normalizationFailureCode),
      resultAvailable: item.resultAvailable === true,
      ambiguousSend: item.ambiguousSend === true,
    };
  });
  const attemptsValid = attempts.every((item, index) => item !== null
    && item.callAttempted
    && item.sequenceNumber === index + 1
    && caseOrder.includes(item.caseId)
    && attempts.findIndex((other) => other?.caseId === item.caseId) === index);
  const caseAccountingMatches = cases.length === caseOrder.length
    && cases.every((item) => {
      const attempt = attempts.find((candidate) => candidate?.caseId === item.caseId);
      return item.caseId !== 'UNKNOWN_CASE'
        && item.callAttempted === Boolean(attempt)
        && item.sequenceNumber === (attempt?.sequenceNumber ?? null);
    });
  const budgetIntegrity = input.budgetIntegrity === 'PASS'
    && observed.judgeCallsAttempted !== null
    && observed.totalCallsAttempted !== null
    && observed.retries === 0
    && isSupportedAccountingProfile(caseOrder, budget.maxJudgeCalls, budget.maxTotalCalls)
    && budget.retriesAllowed === WP004B_RETRIES_ALLOWED
    && observed.judgeCallsAttempted <= WP004B_MAX_JUDGE_CALLS
    && observed.totalCallsAttempted <= WP004B_MAX_TOTAL_CALLS
    && observed.judgeCallsAttempted === attempts.length
    && observed.totalCallsAttempted === attempts.length
    && new Set(caseOrder).size === caseOrder.length
    && attemptsValid
    && casesStructurallySafe
    && caseAccountingMatches
    ? 'PASS' : 'FAIL';
  const scientificValidity = budgetIntegrity === 'PASS'
    && input.scientificValidity === 'VALID_FOR_SCIENTIFIC_SCORING'
    && cases.every((item) => item.callAttempted && item.resultAvailable && !item.ambiguousSend)
    ? 'VALID_FOR_SCIENTIFIC_SCORING' : 'INVALID_FOR_SCIENTIFIC_SCORING';
  return { schemaVersion: WP004B_BUDGET_FINALIZER_SCHEMA_VERSION, budget: budget as Wp004bBudgetFinalizerSummary['budget'], observed: observed as Wp004bBudgetFinalizerSummary['observed'], cases, budgetIntegrity, scientificValidity };
}

export function emergencyFinalizerSummary(profile: Partial<Wp004bFinalizerProfile> = {}): Wp004bBudgetFinalizerSummary {
  const selected = profileForFinalizer(profile);
  return {
    schemaVersion: WP004B_BUDGET_FINALIZER_SCHEMA_VERSION,
    budget: { maxJudgeCalls: selected.maxJudgeCalls, maxTotalCalls: selected.maxTotalCalls, retriesAllowed: WP004B_RETRIES_ALLOWED },
    observed: { judgeCallsAttempted: 0, totalCallsAttempted: 0, retries: 0 },
    cases: selected.caseOrder.map((caseId) => ({
      caseId, sequenceNumber: null, callAttempted: false, transportCompleted: false, canonicalSuccess: false, failureStage: 'NOT_STARTED' as const,
      executionMs: null, retryCount: 0 as const, httpStatus: null, providerEnvelopeClassification: null,
      normalizationFailureCode: null, resultAvailable: false, ambiguousSend: false,
    })),
    budgetIntegrity: 'FAIL',
    scientificValidity: 'INVALID_FOR_SCIENTIFIC_SCORING',
  };
}

export async function writeWp004bAtomicJson(filePath: string, value: unknown): Promise<void> {
  const absolutePath = path.resolve(filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporaryPath, 'w');
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
