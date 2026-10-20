import type { DatabaseClient } from '@lythaus/db';
import { isUuidV7 } from '../../../packages/authenticity/src/uuid.ts';
import { identicalCommunityAppealOverride } from '../../../packages/db/src/community-appeal-closure.ts';
import { isCurrentContentModerationRevision, parseContentModerationRevision, type ContentModerationRevision } from './runtime-policy.ts';

export interface ReviewContent {
  id: string;
  author_id: string;
  body: string;
  declared_creation_mode: 'human' | 'ai_assisted';
  moderation_state: string;
  deleted_at: string | null;
  moderation_source_event_id: string | null;
  author_status: string;
  author_deleted_at: string | null;
}

export async function lockActiveTextReviewAuthor(client: DatabaseClient, authorId: string): Promise<'locked' | 'ineligible' | 'unavailable'> {
  const permission = (await client.query<{ available: boolean }>(`SELECT COALESCE(has_function_privilege(current_user,
    to_regprocedure('trust.lock_reputation_subject(uuid)')::oid, 'EXECUTE'), false) AS available`)).rows[0];
  if (permission?.available !== true) return 'unavailable';
  const locked = (await client.query<{ status: string }>(
    'SELECT status FROM trust.lock_reputation_subject($1::pg_catalog.uuid)', [authorId],
  )).rows[0];
  if (locked?.status !== 'active') return 'ineligible';
  const account = (await client.query<{ deleted_at: string | null }>(
    'SELECT deleted_at FROM identity.users WHERE id = $1', [authorId],
  )).rows[0];
  return account?.deleted_at === null ? 'locked' : 'ineligible';
}

export async function readTextReviewSnapshot(client: DatabaseClient, input: {
  contentType: 'post' | 'comment';
  revision: ContentModerationRevision;
  eventType: unknown;
  communityAppealsEnabled: boolean;
  hashBody(body: string): Promise<string>;
  lock?: boolean;
  expectedAuthorId?: string;
}): Promise<{ state: 'current'; content: ReviewContent } | { state: 'stale' | 'protected' }> {
  const { revision, contentType } = input;
  if (!isUuidV7(revision.contentId) || !isUuidV7(revision.sourceEventId)
    || ![`content.${contentType}.created`, `content.${contentType}.updated`].includes(String(input.eventType))) return { state: 'stale' };
  const table = contentType === 'post' ? 'content.posts' : 'content.comments';
  const content = (await client.query<ReviewContent>(`SELECT item.id, item.author_id, item.body, item.declared_creation_mode,
    item.moderation_state, item.deleted_at, item.moderation_source_event_id,
    author.status AS author_status, author.deleted_at AS author_deleted_at
    FROM ${table} item JOIN identity.users author ON author.id = item.author_id WHERE item.id = $1
    ${input.lock ? 'FOR UPDATE OF item NOWAIT' : ''}`, [revision.contentId])).rows[0];
  if (!content || content.author_status !== 'active' || content.author_deleted_at !== null
    || input.expectedAuthorId !== undefined && content.author_id !== input.expectedAuthorId) return { state: 'stale' };
  if (input.lock) await client.query(`SELECT id FROM moderation.cases WHERE content_type = $1 AND content_id = $2
    ORDER BY id FOR UPDATE NOWAIT`, [contentType, revision.contentId]);
  const source = (await client.query<{
    id: string; event_type: string; aggregate_type: string; aggregate_id: string; actor_id: string | null; payload: unknown;
  }>('SELECT id, event_type, aggregate_type, aggregate_id, actor_id, payload FROM system.outbox_events WHERE id = $1',
  [revision.sourceEventId])).rows[0];
  let canonicalSource: ContentModerationRevision;
  try { canonicalSource = parseContentModerationRevision({ eventId: source?.id, payload: source?.payload,
    contentIdField: contentType === 'post' ? 'postId' : 'commentId' }); } catch { return { state: 'stale' }; }
  if (!source || source.event_type !== input.eventType || source.aggregate_type !== contentType
    || source.aggregate_id !== content.id || source.actor_id !== content.author_id
    || canonicalSource.contentId !== revision.contentId || canonicalSource.sourceEventId !== revision.sourceEventId
    || canonicalSource.bodyHash !== revision.bodyHash || canonicalSource.declaredCreationMode !== revision.declaredCreationMode) return { state: 'stale' };
  if (!isCurrentContentModerationRevision({ revision, canonical: { contentId: content.id,
    sourceEventId: content.moderation_source_event_id, bodyHash: await input.hashBody(content.body),
    declaredCreationMode: content.declared_creation_mode, moderationState: content.moderation_state,
    deletedAt: content.deleted_at } })) return { state: 'stale' };
  if (input.communityAppealsEnabled && await identicalCommunityAppealOverride(client, { contentType,
    contentId: content.id, sourceEventId: revision.sourceEventId, body: content.body,
    declaredCreationMode: content.declared_creation_mode })) return { state: 'protected' };
  const hold = await client.query(`SELECT 1 FROM moderation.cases WHERE content_type = $1 AND content_id = $2
    AND source_event_id = $3 AND state <> 'superseded' LIMIT 1`, [contentType, revision.contentId, revision.sourceEventId]);
  return hold.rowCount ? { state: 'protected' } : { state: 'current', content };
}
