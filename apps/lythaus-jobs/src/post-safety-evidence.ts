import {
  MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION,
  type ModerationAnalysis,
  type ModerationProvider,
  type ModerationProviderErrorCategory,
} from '../../../packages/authenticity/src/moderation.ts';
import { OPENAI_MODERATION_MODEL } from '../../../packages/authenticity/src/research-config.ts';
import type { UUIDv7 } from '../../../packages/authenticity/src/uuid.ts';
import {
  isCurrentContentModerationRevision,
  parseContentModerationRevision,
  type ContentModerationRevision,
} from './runtime-policy.ts';

export type PostSafetySelection = { enabled: false } | {
  enabled: true;
  provider: 'openai';
  timeoutMs: number;
  flaggedResult: 'REVIEW' | 'BLOCK';
};

export interface PostSafetySnapshot {
  sourceEvent?: {
    id: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    actorId: string | null;
    payload: unknown;
  };
  post?: {
    id: string;
    authorId: string;
    body: string;
    declaredCreationMode: string;
    sourceEventId: string | null;
    moderationState: string;
    deletedAt: string | null;
  };
  account?: { id: string; status: string; deletedAt: string | null };
  protection: { identicalScopedPeerOverride: boolean; independentHold: boolean };
}

export interface PostSafetyDependencies {
  readSnapshot(revision: ContentModerationRevision, phase: 'before' | 'after'): Promise<PostSafetySnapshot>;
  hashBody(body: string): Promise<string>;
  now(): number;
  createProvider(options: { timeoutMs: number; flaggedResult: 'REVIEW' | 'BLOCK'; now(): number }): Pick<ModerationProvider, 'analyseText'>;
}

const POST_SAFETY_CATEGORIES = [
  'harassment', 'harassment/threatening', 'hate', 'hate/threatening', 'illicit', 'illicit/violent',
  'self-harm', 'self-harm/instructions', 'self-harm/intent', 'sexual', 'sexual/minors', 'violence', 'violence/graphic',
] as const;
export type PostSafetyCategory = typeof POST_SAFETY_CATEGORIES[number];
const IMAGE_CAPABLE_CATEGORIES = new Set<PostSafetyCategory>([
  'self-harm', 'self-harm/instructions', 'self-harm/intent', 'sexual', 'violence', 'violence/graphic',
]);

export interface PostSafetyEvidence {
  schemaVersion: 'lythaus-post-safety-evidence-preparation-v1';
  purpose: 'safety';
  applicability: 'evaluation-only';
  revision: ContentModerationRevision;
  provider: 'openai';
  model: typeof OPENAI_MODERATION_MODEL;
  status: 'SUCCESS';
  providerResult: 'ALLOW' | 'REVIEW' | 'BLOCK';
  flagged: boolean;
  categories: Readonly<Record<PostSafetyCategory, boolean>>;
  categoryScores: Readonly<Record<PostSafetyCategory, number>>;
  categoryAppliedInputTypes: Readonly<Record<PostSafetyCategory, readonly string[]>>;
  executionMs: number;
}

type UnknownCategory = ModerationProviderErrorCategory | 'INVALID_CONFIGURATION' | 'MISSING_DEPENDENCY'
  | 'DEPENDENCY_FAILURE' | 'INVALID_SNAPSHOT' | 'INVALID_HASH' | 'PROVIDER_REJECTION';
type StaleReason = 'invalid_event' | 'source_event_missing' | 'source_event_mismatch' | 'post_missing'
  | 'revision_changed' | 'account_inactive' | 'author_changed' | 'terminal_state';
type Delivery = { persisted: false; analyseTextCalls: 0 | 1 };
export type PostSafetyOutcome = Delivery & (
  | { state: 'disabled' }
  | { state: 'stale'; reason: StaleReason; phase: 'before' | 'after' }
  | { state: 'protected'; reason: 'scoped_peer_override' | 'independent_hold'; phase: 'before' | 'after' }
  | { state: 'unknown'; errorCategory: UnknownCategory; httpStatus?: number }
  | { state: 'evidence'; evidence: PostSafetyEvidence }
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const ERROR_CATEGORIES = new Set<ModerationProviderErrorCategory>([
  'MISSING_CREDENTIAL', 'EMPTY_INPUT', 'INVALID_MIME', 'IMAGE_SIZE_LIMIT_EXCEEDED',
  'HTTP_AUTHENTICATION_FAILURE', 'HTTP_RATE_LIMITED', 'HTTP_SERVER_FAILURE', 'HTTP_FAILURE',
  'TIMEOUT', 'NETWORK_FAILURE', 'MALFORMED_RESPONSE', 'UNEXPECTED_SCHEMA',
]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function metadata(value: unknown, valid: (item: unknown, category: PostSafetyCategory) => boolean): boolean {
  return record(value) && Object.keys(value).length === POST_SAFETY_CATEGORIES.length
    && POST_SAFETY_CATEGORIES.every(category => Object.hasOwn(value, category) && valid(value[category], category));
}

function categoryMap<T>(value: Readonly<Record<string, T>>): Record<PostSafetyCategory, T> {
  return Object.fromEntries(POST_SAFETY_CATEGORIES.map(category => [category, value[category]])) as Record<PostSafetyCategory, T>;
}

function normalize(analysis: ModerationAnalysis, revision: ContentModerationRevision, flaggedResult: 'REVIEW' | 'BLOCK'): PostSafetyOutcome {
  const unknown = (errorCategory: UnknownCategory, httpStatus?: number): PostSafetyOutcome => ({
    state: 'unknown', persisted: false, analyseTextCalls: 1, errorCategory,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  });
  if (!record(analysis)) return unknown('UNEXPECTED_SCHEMA');
  const evidence = analysis.providerEvidence;
  if (!evidence || evidence.schemaVersion !== MODERATION_PROVIDER_EVIDENCE_SCHEMA_VERSION
    || analysis.provider !== 'openai' || evidence.provider !== 'openai'
    || analysis.modelVersion !== OPENAI_MODERATION_MODEL || evidence.model !== OPENAI_MODERATION_MODEL
    || !Number.isFinite(evidence.executionMs) || evidence.executionMs < 0
    || analysis.executionMs !== evidence.executionMs) return unknown('UNEXPECTED_SCHEMA');
  const httpStatus = evidence.httpStatus;
  if (httpStatus !== undefined && (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599)) return unknown('UNEXPECTED_SCHEMA');
  if (evidence.status === 'PROVIDER_FAILURE' && analysis.result === 'PROVIDER_FAILURE' && evidence.flagged === null
    && evidence.errorCategory && ERROR_CATEGORIES.has(evidence.errorCategory)) return unknown(evidence.errorCategory, httpStatus);
  if (evidence.status !== 'SUCCESS' || typeof evidence.flagged !== 'boolean' || evidence.errorCategory !== undefined
    || analysis.result !== (evidence.flagged ? flaggedResult : 'ALLOW')
    || !metadata(evidence.categories, item => typeof item === 'boolean')
    || !metadata(evidence.categoryScores, item => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 1)
    || !metadata(evidence.categoryAppliedInputTypes, (item, category) => Array.isArray(item) && item.length <= 8
      && item.every(type => type === 'text' || type === 'image' && IMAGE_CAPABLE_CATEGORIES.has(category)))) return unknown('UNEXPECTED_SCHEMA');
  if (evidence.flagged !== POST_SAFETY_CATEGORIES.some(category => evidence.categories[category])) return unknown('UNEXPECTED_SCHEMA');
  return {
    state: 'evidence', persisted: false, analyseTextCalls: 1,
    evidence: {
      schemaVersion: 'lythaus-post-safety-evidence-preparation-v1', purpose: 'safety', applicability: 'evaluation-only',
      revision: { ...revision }, provider: 'openai', model: evidence.model, status: 'SUCCESS',
      providerResult: evidence.flagged ? flaggedResult : 'ALLOW', flagged: evidence.flagged,
      categories: categoryMap(evidence.categories), categoryScores: categoryMap(evidence.categoryScores),
      categoryAppliedInputTypes: categoryMap(Object.fromEntries(POST_SAFETY_CATEGORIES.map(category =>
        [category, [...evidence.categoryAppliedInputTypes[category]]]))),
      executionMs: evidence.executionMs,
    },
  };
}

export async function preparePostSafetyEvidence(input: {
  eventId: unknown;
  payload: unknown;
  selection?: PostSafetySelection;
}, dependencies: Partial<PostSafetyDependencies> = {}): Promise<PostSafetyOutcome> {
  let analyseTextCalls: 0 | 1 = 0;
  const unknown = (errorCategory: UnknownCategory): PostSafetyOutcome => ({ state: 'unknown', persisted: false, analyseTextCalls, errorCategory });
  if (!input.selection || input.selection.enabled === false) return { state: 'disabled', persisted: false, analyseTextCalls };
  const { provider, timeoutMs, flaggedResult } = input.selection;
  if (input.selection.enabled !== true || provider !== 'openai' || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0
    || (flaggedResult !== 'REVIEW' && flaggedResult !== 'BLOCK')) return unknown('INVALID_CONFIGURATION');
  let revision: ContentModerationRevision;
  try {
    revision = parseContentModerationRevision({ eventId: input.eventId, payload: input.payload, contentIdField: 'postId' });
    if (!UUID.test(revision.contentId) || !UUID.test(revision.sourceEventId)) throw new Error('invalid_event');
  } catch {
    return { state: 'stale', reason: 'invalid_event', phase: 'before', persisted: false, analyseTextCalls };
  }
  const { readSnapshot, hashBody, now, createProvider } = dependencies;
  if (typeof readSnapshot !== 'function' || typeof hashBody !== 'function' || typeof now !== 'function'
    || typeof createProvider !== 'function') return unknown('MISSING_DEPENDENCY');

  async function checked(phase: 'before' | 'after', expectedAuthor?: string): Promise<PostSafetyOutcome | PostSafetySnapshot['post']> {
    const stale = (reason: StaleReason): PostSafetyOutcome => ({ state: 'stale', reason, phase, persisted: false, analyseTextCalls });
    const snapshot = await readSnapshot!(revision, phase);
    if (!snapshot || !record(snapshot.protection)
      || typeof snapshot.protection.identicalScopedPeerOverride !== 'boolean'
      || typeof snapshot.protection.independentHold !== 'boolean') return unknown('INVALID_SNAPSHOT');
    const { post, account, sourceEvent } = snapshot;
    if (!sourceEvent) return stale('source_event_missing');
    let sourceRevision: ContentModerationRevision;
    try { sourceRevision = parseContentModerationRevision({ eventId: sourceEvent.id, payload: sourceEvent.payload, contentIdField: 'postId' }); }
    catch { return stale('source_event_mismatch'); }
    if (sourceEvent.id !== revision.sourceEventId || sourceEvent.aggregateType !== 'post'
      || sourceEvent.aggregateId !== revision.contentId || !['content.post.created', 'content.post.updated'].includes(sourceEvent.eventType)
      || sourceRevision.contentId !== revision.contentId || sourceRevision.declaredCreationMode !== revision.declaredCreationMode
      || sourceRevision.bodyHash !== revision.bodyHash) return stale('source_event_mismatch');
    if (!post) return stale('post_missing');
    if (typeof post.body !== 'string' || !UUID.test(post.authorId)
      || (post.deletedAt !== null && typeof post.deletedAt !== 'string')) return unknown('INVALID_SNAPSHOT');
    if (sourceEvent.actorId !== post.authorId) return stale('source_event_mismatch');
    if (expectedAuthor !== undefined && expectedAuthor !== post.authorId) return stale('author_changed');
    if (!account || account.id !== post.authorId || account.status !== 'active' || account.deletedAt !== null) return stale('account_inactive');
    const bodyHash = await hashBody!(post.body);
    if (!HASH.test(bodyHash)) return unknown('INVALID_HASH');
    const canonical = { contentId: post.id, sourceEventId: post.sourceEventId,
      declaredCreationMode: post.declaredCreationMode, bodyHash, moderationState: post.moderationState, deletedAt: post.deletedAt };
    if (!isCurrentContentModerationRevision({ revision, canonical: { ...canonical, moderationState: 'under_review' } })) return stale('revision_changed');
    if (snapshot.protection.identicalScopedPeerOverride || snapshot.protection.independentHold) return {
      state: 'protected', reason: snapshot.protection.identicalScopedPeerOverride ? 'scoped_peer_override' : 'independent_hold',
      phase, persisted: false, analyseTextCalls,
    };
    if (!isCurrentContentModerationRevision({ revision, canonical })) return stale('terminal_state');
    return post;
  }

  try {
    if (!Number.isFinite(now())) return unknown('DEPENDENCY_FAILURE');
    const before = await checked('before');
    if (!before || 'state' in before) return before ?? unknown('INVALID_SNAPSHOT');
    const selectedProvider = createProvider({ timeoutMs, flaggedResult, now });
    if (!selectedProvider || typeof selectedProvider.analyseText !== 'function') return unknown('MISSING_DEPENDENCY');
    let result: PostSafetyOutcome;
    analyseTextCalls = 1;
    try {
      result = normalize(await selectedProvider.analyseText({ caseId: revision.contentId as UUIDv7, text: before.body }), revision, flaggedResult);
    } catch { result = unknown('PROVIDER_REJECTION'); }
    const after = await checked('after', before.authorId);
    if (!after || 'state' in after) return after ?? unknown('INVALID_SNAPSHOT');
    return result;
  } catch { return unknown('DEPENDENCY_FAILURE'); }
}
