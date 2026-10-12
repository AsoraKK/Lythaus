import { supportTimestamp, supportUuid } from './account-support.ts';

export type SupportFeedbackKind = 'problem' | 'suggestion';

export interface SupportFeedbackPolicy {
  readonly limits: Readonly<{
    titleBytes: number;
    detailBytes: number;
    stepsBytes: number;
    contextBytes: number;
    memberMessageBytes: number;
    titleCharacters?: number;
    detailCharacters?: number;
    stepsCharacters?: number;
    memberMessageCharacters?: number;
  }>;
  readonly categories: Readonly<Record<SupportFeedbackKind, readonly string[]>>;
  readonly states: Readonly<Record<SupportFeedbackKind, readonly string[]>>;
}

export type ProblemSubmission = Readonly<{
  kind: 'problem';
  category: string;
  title: string;
  actual: string;
  expected: string;
  reproductionSteps?: string;
  appVersion?: string;
  platform?: string;
}>;

export type SuggestionSubmission = Readonly<{
  kind: 'suggestion';
  category: string;
  title: string;
  improvement: string;
  benefit: string;
}>;

export type SupportSubmission = ProblemSubmission | SuggestionSubmission;

type SupportReadFields = Readonly<{
  id: string;
  revision: number;
  state: string;
  createdAt: string;
  updatedAt: string;
  memberMessage: string | null;
  closed?: boolean;
}>;

export type MemberSupportRequest = SupportSubmission & SupportReadFields;
export type OwnerSupportRequest = MemberSupportRequest & Readonly<{ submitterId: string }>;

const POLICY_ERROR = 'support_feedback_policy_invalid';
const SUBMISSION_ERROR = 'support_feedback_submission_invalid';
const RECORD_ERROR = 'support_feedback_record_invalid';
const LIMIT_FIELDS = ['titleBytes', 'detailBytes', 'stepsBytes', 'contextBytes', 'memberMessageBytes'] as const;
const CHARACTER_FIELDS = ['titleCharacters', 'detailCharacters', 'stepsCharacters', 'memberMessageCharacters'] as const;
const SUBMISSION_FIELDS = {
  problem: ['kind', 'category', 'title', 'actual', 'expected', 'reproductionSteps', 'appVersion', 'platform'],
  suggestion: ['kind', 'category', 'title', 'improvement', 'benefit'],
} as const;
const DETAIL_FIELDS = ['actual', 'expected', 'reproductionSteps', 'appVersion', 'platform', 'improvement', 'benefit'] as const;

function guard<T>(error: string, work: () => T): T {
  try { return work(); } catch { throw new Error(error); }
}

function record(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(error);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)
      || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error(error);
    result[key] = descriptor.value;
  }
  return result;
}

function shape(value: unknown, fields: readonly string[], error: string): Record<string, unknown> {
  const result = record(value, error);
  if (Object.keys(result).some(key => !fields.includes(key))) throw new Error(error);
  return result;
}

function requireFields(input: Record<string, unknown>, fields: readonly string[], error: string): void {
  if (fields.some(key => !Object.hasOwn(input, key))) throw new Error(error);
}

function code(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value)) throw new Error(error);
  return value;
}

function codes(value: unknown): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error(POLICY_ERROR);
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isSafeInteger(length) || length < 1 || Reflect.ownKeys(value).length !== length + 1) throw new Error(POLICY_ERROR);
  const result: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error(POLICY_ERROR);
    const item = code(descriptor.value, POLICY_ERROR);
    if (result.includes(item)) throw new Error(POLICY_ERROR);
    result.push(item);
  }
  return Object.freeze(result);
}

function perKindCodes(value: unknown): Readonly<Record<SupportFeedbackKind, readonly string[]>> {
  const input = shape(value, ['problem', 'suggestion'], POLICY_ERROR);
  requireFields(input, ['problem', 'suggestion'], POLICY_ERROR);
  return Object.freeze({ problem: codes(input.problem), suggestion: codes(input.suggestion) });
}

export function parseSupportFeedbackPolicy(value: unknown): SupportFeedbackPolicy {
  return guard(POLICY_ERROR, () => {
    const input = shape(value, ['limits', 'categories', 'states'], POLICY_ERROR);
    requireFields(input, ['limits', 'categories', 'states'], POLICY_ERROR);
    const limits = shape(input.limits, [...LIMIT_FIELDS, ...CHARACTER_FIELDS], POLICY_ERROR);
    requireFields(limits, LIMIT_FIELDS, POLICY_ERROR);
    for (const key of LIMIT_FIELDS) {
      if (!Number.isSafeInteger(limits[key]) || Number(limits[key]) < 1) throw new Error(POLICY_ERROR);
    }
    const characters: Record<string, number> = {};
    for (const key of CHARACTER_FIELDS) {
      if (!Object.hasOwn(limits, key)) continue;
      if (!Number.isSafeInteger(limits[key]) || Number(limits[key]) < 1) throw new Error(POLICY_ERROR);
      characters[key] = Number(limits[key]);
    }
    return Object.freeze({
      limits: Object.freeze({ titleBytes: Number(limits.titleBytes), detailBytes: Number(limits.detailBytes),
        stepsBytes: Number(limits.stepsBytes), contextBytes: Number(limits.contextBytes), memberMessageBytes: Number(limits.memberMessageBytes), ...characters }),
      categories: perKindCodes(input.categories), states: perKindCodes(input.states),
    });
  });
}

function text(value: unknown, maximum: number, error: string, maximumCharacters?: number): string {
  if (typeof value !== 'string' || value.length > maximum) throw new Error(error);
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if ((unit < 32 && ![9, 10, 13].includes(unit)) || unit === 127) throw new Error(error);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(error);
      bytes += 4; index += 1;
    } else {
      if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error(error);
      bytes += unit < 128 ? 1 : unit < 2048 ? 2 : 3;
    }
    if (bytes > maximum) throw new Error(error);
  }
  const result = value.trim();
  if (!result || (maximumCharacters !== undefined && [...result].length > maximumCharacters)) throw new Error(error);
  return result;
}

function optionalText(input: Record<string, unknown>, key: string, maximum: number, error: string, maximumCharacters?: number): string | undefined {
  return Object.hasOwn(input, key) ? text(input[key], maximum, error, maximumCharacters) : undefined;
}

function submission(input: Record<string, unknown>, policy: SupportFeedbackPolicy, error: string): SupportSubmission {
  requireFields(input, ['kind', 'category', 'title'], error);
  if (input.kind !== 'problem' && input.kind !== 'suggestion') throw new Error(error);
  const kind = input.kind, fields: readonly string[] = SUBMISSION_FIELDS[kind];
  if (DETAIL_FIELDS.some(key => Object.hasOwn(input, key) && !fields.includes(key))) throw new Error(error);
  const category = code(input.category, error);
  if (!policy.categories[kind].includes(category)) throw new Error(error);
  const title = text(input.title, policy.limits.titleBytes, error, policy.limits.titleCharacters);
  if (kind === 'suggestion') {
    requireFields(input, ['improvement', 'benefit'], error);
    return Object.freeze({ kind, category, title,
      improvement: text(input.improvement, policy.limits.detailBytes, error, policy.limits.detailCharacters), benefit: text(input.benefit, policy.limits.detailBytes, error, policy.limits.detailCharacters) });
  }
  requireFields(input, ['actual', 'expected'], error);
  const reproductionSteps = optionalText(input, 'reproductionSteps', policy.limits.stepsBytes, error, policy.limits.stepsCharacters);
  const appVersion = optionalText(input, 'appVersion', policy.limits.contextBytes, error);
  const platform = optionalText(input, 'platform', policy.limits.contextBytes, error);
  return Object.freeze({ kind, category, title,
    actual: text(input.actual, policy.limits.detailBytes, error, policy.limits.detailCharacters), expected: text(input.expected, policy.limits.detailBytes, error, policy.limits.detailCharacters),
    ...(reproductionSteps === undefined ? {} : { reproductionSteps }), ...(appVersion === undefined ? {} : { appVersion }),
    ...(platform === undefined ? {} : { platform }),
  });
}

export function parseSupportSubmission(value: unknown, suppliedPolicy: unknown): SupportSubmission {
  const policy = parseSupportFeedbackPolicy(suppliedPolicy);
  return guard(SUBMISSION_ERROR, () => {
    const input = record(value, SUBMISSION_ERROR);
    if (input.kind !== 'problem' && input.kind !== 'suggestion') throw new Error(SUBMISSION_ERROR);
    shape(input, SUBMISSION_FIELDS[input.kind], SUBMISSION_ERROR);
    return submission(input, policy, SUBMISSION_ERROR);
  });
}

function project(value: unknown, policy: SupportFeedbackPolicy): { member: MemberSupportRequest; submitterId: string } {
  const input = record(value, RECORD_ERROR), details = submission(input, policy, RECORD_ERROR);
  requireFields(input, ['id', 'submitterId', 'revision', 'state', 'createdAt', 'updatedAt', 'memberMessage'], RECORD_ERROR);
  if (!supportUuid(input.id) || input.id[14] !== '7' || !supportUuid(input.submitterId)
    || !Number.isSafeInteger(input.revision) || Number(input.revision) < 1) throw new Error(RECORD_ERROR);
  const state = code(input.state, RECORD_ERROR);
  if (!policy.states[details.kind].includes(state)) throw new Error(RECORD_ERROR);
  let createdAt: string, updatedAt: string;
  try { createdAt = supportTimestamp(input.createdAt); updatedAt = supportTimestamp(input.updatedAt); }
  catch { throw new Error(RECORD_ERROR); }
  if (updatedAt < createdAt) throw new Error(RECORD_ERROR);
  const memberMessage = input.memberMessage === null ? null : text(input.memberMessage, policy.limits.memberMessageBytes, RECORD_ERROR, policy.limits.memberMessageCharacters);
  if (Object.hasOwn(input, 'closed') && typeof input.closed !== 'boolean') throw new Error(RECORD_ERROR);
  return { member: Object.freeze({ ...details, id: input.id.toLowerCase(), revision: Number(input.revision), state, createdAt, updatedAt, memberMessage,
    ...(Object.hasOwn(input, 'closed') ? { closed: input.closed as boolean } : {}) }),
    submitterId: input.submitterId.toLowerCase() };
}

export function projectMemberSupportRequest(value: unknown, currentMemberId: unknown, suppliedPolicy: unknown): MemberSupportRequest {
  const policy = parseSupportFeedbackPolicy(suppliedPolicy);
  return guard(RECORD_ERROR, () => {
    if (!supportUuid(currentMemberId)) throw new Error(RECORD_ERROR);
    const result = project(value, policy);
    if (result.submitterId !== currentMemberId.toLowerCase()) throw new Error(RECORD_ERROR);
    return result.member;
  });
}

export function projectOwnerSupportRequest(value: unknown, suppliedPolicy: unknown): OwnerSupportRequest {
  const policy = parseSupportFeedbackPolicy(suppliedPolicy);
  return guard(RECORD_ERROR, () => {
    const result = project(value, policy);
    return Object.freeze({ ...result.member, submitterId: result.submitterId });
  });
}
