import type { Client } from 'pg';
import { uuidv7 } from '@lythaus/security';
import { enforceContentDeclaration } from '../../contracts/src/content-policy.ts';
import { MONTHLY_REPUTATION_CATALOGUE_HASH, MONTHLY_REPUTATION_POLICY_VERSION } from '../../contracts/src/monthly-reputation-policy.ts';
import { proposedClosingSundayWeek } from '../../contracts/src/monthly-reputation-decisions.ts';
import { isMonthlyCommunityPublication } from './monthly-publication.ts';

export const MONTHLY_CONTEXT_EVENT = 'trust.contextual_contribution.reviewed';
const FLAG = 'trust.monthly_context_review';
async function digest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
interface ContextConfiguration { version: string; weekly_rules_version: string; rubric_version: string; collect_from: Date }
export async function monthlyContextConfiguration(client: Client, version?: string, weeklyVersion?: string, includePaused = false) {
  if (!version) return null;
  const preflight = await client.query(`SELECT 1 FROM system.feature_flags WHERE flag_key = $1 AND policy_version = $2`,
    [FLAG, MONTHLY_REPUTATION_POLICY_VERSION]);
  if (!preflight.rowCount) return null;
  const flags = await client.query<{ flag_key: string; enabled: boolean; policy_version: string }>('SELECT * FROM trust.lock_monthly_context_configuration()');
  if (flags.rowCount !== 2 || flags.rows.some(flag => flag.policy_version !== MONTHLY_REPUTATION_POLICY_VERSION
    || (!includePaused && !flag.enabled))) return null;
  return (await client.query<ContextConfiguration>(`SELECT version, weekly_rules_version, rubric_version, collect_from
    FROM trust.monthly_context_rule_sets WHERE version = $1 AND policy_version = $2 AND catalogue_hash = $3
      AND mode = 'shadow' AND collection_privacy_version = 'monthly-privacy-v1'
      AND approved_by IS NOT NULL AND approved_at <= clock_timestamp() AND approval_reference IS NOT NULL
      AND ($4::text IS NULL OR weekly_rules_version = $4)`,
  [version, MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH, weeklyVersion ?? null])).rows[0] ?? null;
}
interface ContextScope {
  author_id: string; created_at: Date; body: string; declared_creation_mode: string; deleted_at: Date | null;
  moderation_state: string; source_revision_id: string; thread_id: string; thread_revision_id: string;
  thread_body: string; thread_deleted: Date | null; thread_state: string; visibility: string;
  parent_id: string | null; parent_revision_id: string | null; parent_body: string | null;
  parent_state: string | null; parent_deleted: Date | null;
  own_thread: boolean;
}
async function contextScope(client: Client, commentId: string): Promise<ContextScope | undefined> {
  const row = (await client.query<ContextScope>(`SELECT c.author_id, c.created_at, c.body, c.declared_creation_mode,
    c.deleted_at, c.moderation_state, c.moderation_source_event_id AS source_revision_id,
    p.id AS thread_id, p.moderation_source_event_id AS thread_revision_id, p.body AS thread_body,
    p.deleted_at AS thread_deleted, p.moderation_state AS thread_state, p.visibility, c.parent_id, p.author_id = c.author_id AS own_thread
    FROM content.comments c JOIN content.posts p ON p.id = c.post_id WHERE c.id = $1 FOR SHARE OF c, p`, [commentId])).rows[0];
  if (!row) return undefined;
  row.parent_revision_id = null; row.parent_body = null; row.parent_state = null; row.parent_deleted = null;
  if (row.parent_id) {
    const parent = (await client.query<{ moderation_source_event_id: string; body: string; moderation_state: string; deleted_at: Date | null }>(
      'SELECT moderation_source_event_id, body, moderation_state, deleted_at FROM content.comments WHERE id = $1 AND post_id = $2 FOR SHARE',
      [row.parent_id, row.thread_id])).rows[0];
    if (!parent) throw new Error('monthly_context_scope_changed');
    row.parent_revision_id = parent.moderation_source_event_id; row.parent_body = parent.body;
    row.parent_state = parent.moderation_state; row.parent_deleted = parent.deleted_at;
  }
  return row;
}
const scopeHash = (scope: ContextScope) => digest([scope.source_revision_id, scope.body.normalize('NFC'),
  scope.thread_id, scope.thread_revision_id, scope.thread_body.normalize('NFC'),
  scope.parent_id, scope.parent_revision_id, scope.parent_body?.normalize('NFC') ?? null, scope.parent_state]);
interface ContextReview {
  id: string; subject_user_id: string; performed_at: Date; rules_version: string; revision: number; source_revision_id: string;
  thread_id: string; thread_revision_id: string; parent_id: string | null; parent_revision_id: string | null;
  scope_hash: string; decision: 'accepted' | 'withheld' | 'reversed'; request_digest: string; source_event_id: string;
  thread_fingerprint: string; parent_fingerprint: string | null;
  earning_facts: { kind: 'own_comment' | 'own_reply' | 'other_comment' | 'other_reply'; creationMode: 'human' | 'ai_assisted' | 'unknown';
    declarationValid: boolean; contentFingerprint: string; sourceRevisionId: string; decisionId: string | null; publicationAccepted: boolean };
}
async function retainedEarningFacts(client: Client, commentId: string, scope: ContextScope) {
  let creationMode: ContextReview['earning_facts']['creationMode'] = 'unknown', declarationValid = false;
  try { creationMode = enforceContentDeclaration({ body: scope.body, declaredCreationMode: scope.declared_creation_mode }).declaredCreationMode;
    declarationValid = true; } catch { declarationValid = false; }
  const publication = (await client.query<{ id: string; decided_by: string | null; outcome: string; created_at: Date; policy_version: string }>(
    `SELECT decision.id, decision.decided_by, decision.outcome, decision.policy_version, source.created_at FROM moderation.decisions decision
     JOIN moderation.cases review ON review.id = decision.case_id
     JOIN system.outbox_events source ON source.id = review.source_event_id
     WHERE review.content_type = 'comment' AND review.content_id = $1 AND review.source_event_id = $2
     ORDER BY decision.created_at DESC, decision.id DESC LIMIT 1`, [commentId, scope.source_revision_id])).rows[0];
  const communityAllowed = publication && await isMonthlyCommunityPublication(client, {
    decisionId: publication.id, policyVersion: publication.policy_version, outcome: publication.outcome,
    decidedBy: publication.decided_by, contentId: commentId, contentType: 'comment', sourceRevisionId: scope.source_revision_id });
  return { kind: scope.own_thread ? scope.parent_id ? 'own_reply' as const : 'own_comment' as const
    : scope.parent_id ? 'other_reply' as const : 'other_comment' as const,
    creationMode, declarationValid, contentFingerprint: await digest(scope.body.normalize('NFC').trim()),
    sourceRevisionId: scope.source_revision_id, decisionId: publication?.id ?? null,
    publicationAccepted: publication?.outcome === 'allow' && ((!!publication.decided_by && publication.decided_by !== scope.author_id) || !!communityAllowed)
      && publication.created_at.toISOString() < proposedClosingSundayWeek(scope.created_at.toISOString()).endsAt
      && scope.moderation_state === 'allowed' && scope.visibility === 'public' && scope.thread_state === 'allowed'
      && !scope.thread_deleted && (!scope.parent_id || scope.parent_state === 'allowed') && declarationValid };
}
export interface ContextReviewRequest {
  commentId: string; actorId: string; rulesVersion: string; rubricVersion: string;
  sourceRevisionId: string; threadRevisionId: string; parentRevisionId: string | null;
  decision: ContextReview['decision']; reasonCode: string; evidenceReference: string;
  expectedRevision: number; idempotencyKey: string;
}
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function recordMonthlyContextReview(client: Client, input: ContextReviewRequest) {
  if (![input.commentId, input.actorId, input.sourceRevisionId, input.threadRevisionId].every(uuid)
    || (input.parentRevisionId !== null && !uuid(input.parentRevisionId)) || !uuid(input.idempotencyKey)
    || input.idempotencyKey[14] !== '7' || !['accepted', 'withheld', 'reversed'].includes(input.decision)
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
    || typeof input.reasonCode !== 'string' || !/^[a-z][a-z0-9_]{1,99}$/.test(input.reasonCode)
    || typeof input.evidenceReference !== 'string' || !input.evidenceReference.trim() || input.evidenceReference.length > 500)
    throw new Error('monthly_context_request_invalid');
  const configuration = await monthlyContextConfiguration(client, input.rulesVersion);
  if (!configuration) throw new Error('monthly_context_unavailable');
  if (input.rubricVersion !== configuration.rubric_version) throw new Error('monthly_context_rubric_mismatch');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-context-command:${input.actorId}:${input.idempotencyKey}`]);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-context-comment:${input.commentId}`]);
  const previous = (await client.query<ContextReview>('SELECT * FROM trust.monthly_context_reviews WHERE comment_id = $1 ORDER BY revision DESC LIMIT 1', [input.commentId])).rows[0];
  const scope = await contextScope(client, input.commentId);
  const subjectId = scope?.author_id ?? previous?.subject_user_id;
  if (!subjectId) throw new Error('monthly_context_comment_not_found');
  if (!(await client.query<{ allowed: boolean }>('SELECT trust.lock_monthly_context_actor($1, $2) AS allowed',
    [input.actorId, subjectId])).rows[0].allowed) throw new Error('monthly_context_actor_not_allowed');
  const requestDigest = await digest(input);
  const replay = (await client.query<ContextReview>('SELECT * FROM trust.monthly_context_reviews WHERE actor_id = $1 AND idempotency_key = $2',
    [input.actorId, input.idempotencyKey])).rows[0];
  if (replay) {
    if (replay.request_digest !== requestDigest) throw new Error('monthly_context_idempotency_reused');
    return { reviewId: replay.id, revision: replay.revision, sourceEventId: replay.source_event_id, created: false };
  }
  if ((previous?.revision ?? 0) !== input.expectedRevision) throw new Error('monthly_context_revision_conflict');
  if (previous && previous.rules_version !== input.rulesVersion) throw new Error('monthly_context_rules_locked');
  const binding = scope ? { source_revision_id: scope.source_revision_id, thread_id: scope.thread_id,
    thread_revision_id: scope.thread_revision_id, parent_id: scope.parent_id, parent_revision_id: scope.parent_revision_id,
    scope_hash: await scopeHash(scope) } : previous!;
  if (binding.source_revision_id !== input.sourceRevisionId || binding.thread_revision_id !== input.threadRevisionId
    || binding.parent_revision_id !== input.parentRevisionId) throw new Error('monthly_context_scope_changed');
  if (input.decision === 'accepted') {
    if (!scope || scope.deleted_at || scope.thread_deleted || scope.moderation_state !== 'allowed'
      || scope.thread_state !== 'allowed' || scope.visibility !== 'public' || scope.created_at < configuration.collect_from)
      throw new Error('monthly_context_publication_ineligible');
    if (scope.parent_id && (scope.parent_state !== 'allowed' || scope.parent_deleted)) throw new Error('monthly_context_publication_ineligible');
    enforceContentDeclaration({ body: scope.body, declaredCreationMode: scope.declared_creation_mode });
  } else if (!scope && (!previous || input.decision !== 'reversed')) throw new Error('monthly_context_comment_not_found');
  const id = uuidv7(), eventId = uuidv7(), revision = (previous?.revision ?? 0) + 1;
  const earningFacts = scope ? await retainedEarningFacts(client, input.commentId, scope) : previous!.earning_facts;
  await client.query(`INSERT INTO trust.monthly_context_reviews
    (id, comment_id, subject_user_id, actor_id, rules_version, revision, source_revision_id, thread_id,
     thread_revision_id, parent_id, parent_revision_id, scope_hash, decision, reason_code, evidence_reference,
     idempotency_key, request_digest, source_event_id, performed_at, earning_facts, thread_fingerprint, parent_fingerprint)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22)`,
  [id, input.commentId, subjectId, input.actorId, input.rulesVersion, revision, binding.source_revision_id,
    binding.thread_id, binding.thread_revision_id, binding.parent_id, binding.parent_revision_id, binding.scope_hash,
    input.decision, input.reasonCode, input.evidenceReference, input.idempotencyKey, requestDigest, eventId,
    scope?.created_at ?? previous!.performed_at, JSON.stringify(earningFacts),
    scope ? await digest(scope.thread_body.normalize('NFC')) : previous!.thread_fingerprint,
    scope ? scope.parent_body === null ? null : await digest(scope.parent_body.normalize('NFC')) : previous!.parent_fingerprint]);
  await client.query(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
    SELECT $1, $2, 'comment', $3::uuid, $4::uuid, $5::jsonb, recorded_at FROM trust.monthly_context_reviews WHERE id = $6`, [eventId, MONTHLY_CONTEXT_EVENT, input.commentId, input.actorId,
    JSON.stringify({ reviewId: id, revision, policyVersion: MONTHLY_REPUTATION_POLICY_VERSION }), id]);
  return { reviewId: id, revision, sourceEventId: eventId, created: true };
}

export async function readMonthlyContextEarning(client: Client, input: {
  commentId: string; subjectId: string; rulesVersion?: string; weeklyRulesVersion: string; canonicalEventId?: string;
}) {
  const configuration = await monthlyContextConfiguration(client, input.rulesVersion, input.weeklyRulesVersion, true);
  if (!configuration) {
    if (input.canonicalEventId) throw new Error('monthly_context_canonical_review_required');
    return null;
  }
  if (input.canonicalEventId && !(await client.query(`SELECT 1 FROM trust.monthly_context_reviews review
    JOIN system.outbox_events event ON event.id = review.source_event_id
    WHERE review.comment_id = $1 AND review.subject_user_id = $2 AND review.source_event_id = $3
      AND review.rules_version = $4 AND event.event_type = $5 AND event.aggregate_type = 'comment'
      AND event.aggregate_id = review.comment_id AND event.actor_id = review.actor_id
      AND event.created_at = review.recorded_at
      AND event.payload @> jsonb_build_object('reviewId', review.id::text, 'revision', review.revision,
        'policyVersion', $6::text)`,
  [input.commentId, input.subjectId, input.canonicalEventId, configuration.version, MONTHLY_CONTEXT_EVENT,
    MONTHLY_REPUTATION_POLICY_VERSION])).rowCount) throw new Error('monthly_context_canonical_review_required');
  const review = (await client.query<ContextReview>(`SELECT * FROM trust.monthly_context_reviews
    WHERE comment_id = $1 AND subject_user_id = $2 AND rules_version = $3 ORDER BY revision DESC LIMIT 1`,
  [input.commentId, input.subjectId, configuration.version])).rows[0];
  if (!review) return null;
  const scope = await contextScope(client, input.commentId);
  const scopeMatches = !!scope && scope.author_id === input.subjectId && review.scope_hash === await scopeHash(scope);
  let scopeInvalidated = !!scope && !scopeMatches;
  if (!scope) {
    const frame = (await client.query<{ kind: string; body: string; moderation_source_event_id: string; moderation_state: string }>(
      `SELECT 'thread' AS kind, body, moderation_source_event_id, moderation_state FROM content.posts WHERE id = $1 FOR SHARE`, [review.thread_id])).rows;
    if (review.parent_id) frame.push(...(await client.query<{ kind: string; body: string; moderation_source_event_id: string; moderation_state: string }>(
      `SELECT 'parent' AS kind, body, moderation_source_event_id, moderation_state FROM content.comments WHERE id = $1 FOR SHARE`, [review.parent_id])).rows);
    for (const item of frame) if (item.moderation_state === 'blocked'
      || item.moderation_source_event_id !== (item.kind === 'thread' ? review.thread_revision_id : review.parent_revision_id)
      || await digest(item.body.normalize('NFC')) !== (item.kind === 'thread' ? review.thread_fingerprint : review.parent_fingerprint)) scopeInvalidated = true;
    if ((await client.query(`SELECT 1 FROM system.outbox_events event WHERE event.aggregate_id = ANY($1::uuid[])
      AND event.event_type IN ('content.post.updated', 'content.comment.updated') AND event.created_at >
        (SELECT recorded_at FROM trust.monthly_context_reviews WHERE id = $2)
      AND NOT event.id = ANY($3::uuid[]) LIMIT 1`, [ [input.commentId, review.thread_id, review.parent_id].filter(Boolean), review.id,
        [review.source_revision_id, review.thread_revision_id, review.parent_revision_id].filter(Boolean) ])).rowCount) scopeInvalidated = true;
  }
  const independentlyBlocked = (await client.query(`SELECT 1 FROM moderation.cases review_case
    JOIN unnest($1::uuid[], $2::uuid[]) binding(content_id, source_revision_id)
      ON review_case.content_id = binding.content_id AND review_case.source_event_id = binding.source_revision_id
    JOIN LATERAL (SELECT outcome FROM moderation.decisions WHERE case_id = review_case.id ORDER BY created_at DESC, id DESC LIMIT 1) decision ON true
    WHERE decision.outcome = 'block' LIMIT 1`, [[input.commentId, review.thread_id, review.parent_id].filter(Boolean),
    [review.source_revision_id, review.thread_revision_id, review.parent_revision_id].filter(Boolean)])).rowCount !== 0;
  if (independentlyBlocked || scope?.moderation_state === 'blocked' || scope?.thread_state === 'blocked' || scope?.parent_state === 'blocked') scopeInvalidated = true;
  const ordinaryDeletion = !scope || !!scope.deleted_at || !!scope.thread_deleted || !!scope.parent_deleted;
  return { reviewId: review.id, decision: review.decision, sourceRevisionId: review.source_revision_id,
    scopeMatches, scopeInvalidated,
    performedAt: review.performed_at.toISOString(), facts: review.earning_facts,
    retainedAccepted: ordinaryDeletion && !scopeInvalidated && review.decision === 'accepted' && review.earning_facts.publicationAccepted };
}

export async function requireMonthlyContextIngestionDrained(client: Client, input: {
  subjectUserId: string; weeklyRulesVersion: string; contextRulesVersion?: string; startsAt: string; endsAt: string;
}) {
  if (!(await client.query('SELECT 1 FROM system.feature_flags WHERE flag_key = $1 AND policy_version = $2',
    [FLAG, MONTHLY_REPUTATION_POLICY_VERSION])).rowCount) return null;
  const versions = await client.query<{ rules_version: string }>(`SELECT DISTINCT review.rules_version FROM trust.monthly_context_reviews review
    JOIN trust.monthly_context_rule_sets rules ON rules.version = review.rules_version
    WHERE review.subject_user_id = $1 AND review.performed_at >= $2 AND review.performed_at < $3
      AND rules.weekly_rules_version = $4`, [input.subjectUserId, input.startsAt, input.endsAt, input.weeklyRulesVersion]);
  const version = input.contextRulesVersion ?? versions.rows[0]?.rules_version;
  if (versions.rows.some(row => row.rules_version !== version)) throw new Error('monthly_assembly_context_policy_requires_review');
  const configuration = await monthlyContextConfiguration(client, version, input.weeklyRulesVersion, true);
  if (!configuration) {
    if (versions.rowCount) throw new Error('monthly_assembly_context_policy_requires_review');
    return null;
  }
  if (configuration.collect_from.toISOString() >= input.endsAt) return null;
  const pending = await client.query(`SELECT 1 FROM trust.monthly_context_reviews review
    WHERE review.subject_user_id = $1 AND review.performed_at >= $2 AND review.performed_at < $3
      AND (NOT EXISTS (SELECT 1 FROM trust.monthly_earning_receipts WHERE event_id = review.source_event_id AND policy_version = $4)
        OR EXISTS (SELECT 1 FROM system.outbox_events event WHERE event.event_type = ANY($5::text[])
          AND event.created_at >= greatest($6::timestamptz,
            (SELECT collect_from FROM trust.monthly_earning_rule_sets WHERE version = $7))
          AND ((event.aggregate_type = 'post' AND event.aggregate_id = review.thread_id)
            OR (event.aggregate_type = 'comment' AND event.aggregate_id = review.parent_id))
          AND NOT EXISTS (SELECT 1 FROM trust.monthly_context_dependency_receipts receipt
            WHERE receipt.event_id = event.id AND receipt.comment_id = review.comment_id))) LIMIT 1`,
  [input.subjectUserId, input.startsAt, input.endsAt, MONTHLY_REPUTATION_POLICY_VERSION,
    ['content.post.created', 'content.post.updated', 'content.post.published', 'content.post.deleted',
      'content.comment.created', 'content.comment.updated', 'content.comment.published', 'content.comment.deleted', 'moderation.content.blocked'], configuration.collect_from, input.weeklyRulesVersion]);
  if (pending.rowCount) throw new Error('monthly_assembly_context_ingestion_pending');
  return configuration;
}
