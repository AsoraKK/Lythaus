import { parseSupportFeedbackPolicy, type SupportFeedbackKind, type SupportFeedbackPolicy } from '../../contracts/src/support-feedback.ts';

export interface SupportTransition {
  readonly kind: SupportFeedbackKind;
  readonly from: string;
  readonly to: string;
  readonly terminal: boolean;
  readonly reasons: readonly string[];
  readonly evidenceTypes: readonly string[];
}
export interface SupportServicePolicy {
  readonly version: string;
  readonly contract: SupportFeedbackPolicy;
  readonly initial: Readonly<Record<SupportFeedbackKind, string>>;
  readonly transitions: readonly SupportTransition[];
  readonly evidenceTypes: readonly string[];
  readonly limits: Readonly<{
    page: number; messages: number; privateItems: number; messageBytes: number; noteBytes: number;
    evidenceBytes: number; referenceBytes: number; rateWindowSeconds: number; memberMutations: number; ownerMutations: number;
  }>;
  readonly privacy: Readonly<{ retentionSeconds: number; batch: number; requestStates: readonly string[]; deleteAudit: boolean }>;
}
const ERROR = 'support_policy_invalid';
export function supportFailureCode(error: unknown, allowed: ReadonlySet<string>, fallback: string): string {
  try {
    if(error instanceof Error){
      const descriptor=Object.getOwnPropertyDescriptor(error,'message');
      if(descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'&&allowed.has(descriptor.value))return descriptor.value;
    }
  } catch {}
  return fallback;
}
export function supportObject(value: unknown, allowed?: readonly string[], error = 'support_input_invalid'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) throw new Error(error);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key) || !d?.enumerable || !Object.hasOwn(d, 'value')
      || (allowed && !allowed.includes(key))) throw new Error(error);
    result[key] = d.value;
  }
  return result;
}
export function supportText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum || /[\ud800-\udfff]/u.test(value) || new TextEncoder().encode(value).length > maximum
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || !value.trim()) throw new Error('support_input_invalid');
  return value.trim();
}
function code(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value)) throw new Error(ERROR);
  return value;
}
function positive(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(ERROR);
  return value;
}
function list(value: unknown, allowEmpty = false): readonly string[] {
  const items = supportArray(value);
  if (!allowEmpty && items.length === 0) throw new Error(ERROR);
  const result: string[] = [];
  for (const value of items) {
    const item = code(value); if (result.includes(item)) throw new Error(ERROR); result.push(item);
  }
  return Object.freeze(result);
}
export function supportArray(value: unknown, maximum = 100): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error('support_input_invalid');
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum || Reflect.ownKeys(value).length !== length + 1) throw new Error('support_input_invalid');
  const result: unknown[] = [];
  for (let i = 0; i < length; i += 1) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) throw new Error('support_input_invalid'); result.push(d.value);
  }
  return result;
}
export function parseSupportServicePolicy(value: unknown): SupportServicePolicy {
  try {
    const p = supportObject(value, ['version', 'contract', 'initial', 'transitions', 'evidenceTypes', 'limits', 'privacy'], ERROR);
    const contract = parseSupportFeedbackPolicy(p.contract), initial = supportObject(p.initial, ['problem', 'suggestion'], ERROR);
    const starts = Object.freeze({ problem: code(initial.problem), suggestion: code(initial.suggestion) });
    if (!contract.states.problem.includes(starts.problem) || !contract.states.suggestion.includes(starts.suggestion)) throw new Error(ERROR);
    const evidenceTypes = list(p.evidenceTypes);
    const suppliedTransitions = supportArray(p.transitions);
    if (suppliedTransitions.length === 0) throw new Error(ERROR);
    const transitions = suppliedTransitions.map(value => {
      const t = supportObject(value, ['kind', 'from', 'to', 'terminal', 'reasons', 'evidenceTypes'], ERROR);
      if ((t.kind !== 'problem' && t.kind !== 'suggestion') || typeof t.terminal !== 'boolean') throw new Error(ERROR);
      const from = code(t.from), to = code(t.to), reasons = list(t.reasons), required = list(t.evidenceTypes, !t.terminal);
      if (from === to || !contract.states[t.kind].includes(from) || !contract.states[t.kind].includes(to)
        || required.some(x => !evidenceTypes.includes(x))) throw new Error(ERROR);
      return Object.freeze({ kind: t.kind, from, to, terminal: t.terminal, reasons, evidenceTypes: required }) as SupportTransition;
    });
    if (new Set(transitions.map(t => `${t.kind}:${t.from}:${t.to}`)).size !== transitions.length) throw new Error(ERROR);
    const fields = ['page', 'messages', 'privateItems', 'messageBytes', 'noteBytes', 'evidenceBytes', 'referenceBytes', 'rateWindowSeconds', 'memberMutations', 'ownerMutations'] as const;
    const supplied = supportObject(p.limits, fields, ERROR), limits = Object.fromEntries(fields.map(k => [k, positive(supplied[k], ['page', 'messages', 'privateItems'].includes(k) ? 100 : Number.MAX_SAFE_INTEGER)])) as unknown as SupportServicePolicy['limits'];
    if(transitions.some(t=>t.evidenceTypes.length>limits.privateItems))throw new Error(ERROR);
    const privacy = supportObject(p.privacy, ['retentionSeconds', 'batch', 'requestStates', 'deleteAudit'], ERROR);
    if (typeof privacy.deleteAudit !== 'boolean') throw new Error(ERROR);
    return Object.freeze({ version: code(p.version), contract, initial: starts, transitions: Object.freeze(transitions), evidenceTypes,
      limits: Object.freeze(limits), privacy: Object.freeze({ retentionSeconds: positive(privacy.retentionSeconds), batch: positive(privacy.batch, 100), requestStates: list(privacy.requestStates), deleteAudit: privacy.deleteAudit }) });
  } catch { throw new Error(ERROR); }
}
