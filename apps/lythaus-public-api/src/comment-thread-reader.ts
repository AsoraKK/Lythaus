import { commentPostVisibilitySql } from '../../../packages/db/src/comment-visibility.ts';
import { FEED_AUTHOR_FIELDS, FEED_AUTHOR_JOINS } from './feed-author-projection.ts';
import { requireFeedPostId } from './feed-runtime-policy.ts';

type CommentSort = 'oldest' | 'newest';
type ThreadQuery = (sql: string, values: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

interface CommentCursor {
  version: 1;
  postId: string;
  sort: CommentSort;
  conversationId: string | null;
  view: 'conversations' | 'legacy';
  snapshot: string;
  timestamp: string;
  id: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 23) === value.slice(0, 23);
}

function threadQuery(sort: CommentSort, view: CommentCursor['view'], conversationId: string | null, targetId: string | null): string {
  const descending = sort === 'newest' && !conversationId;
  return `WITH RECURSIVE snapshot AS (SELECT COALESCE($6::timestamptz, statement_timestamp()) AS at),
  visible_thread AS (
    SELECT root.*, root.id AS root_id, ARRAY[root.id] AS path
      FROM content.comments root JOIN identity.users root_author ON root_author.id = root.author_id
      CROSS JOIN snapshot
     WHERE root.post_id = $1 AND root.parent_id IS NULL AND root.depth = 0
       AND root.moderation_state = 'allowed' AND root.declared_creation_mode IN ('human', 'ai_assisted')
       AND root_author.status = 'active' AND root_author.deleted_at IS NULL AND root.created_at <= snapshot.at
       AND NOT EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = root.author_id)
         OR (b.blocker_id = root.author_id AND b.blocked_id = $2))
       AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $2 AND m.muted_id = root.author_id)
    UNION ALL
    SELECT child.*, visible_thread.root_id, visible_thread.path || child.id
      FROM content.comments child JOIN visible_thread ON child.parent_id = visible_thread.id AND child.post_id = visible_thread.post_id
      JOIN identity.users child_author ON child_author.id = child.author_id CROSS JOIN snapshot
     WHERE child.depth = 1 AND child.moderation_state = 'allowed' AND child.declared_creation_mode IN ('human', 'ai_assisted')
       AND child_author.status = 'active' AND child_author.deleted_at IS NULL AND child.created_at <= snapshot.at
       AND NOT child.id = ANY(visible_thread.path) AND cardinality(visible_thread.path) < 64
       AND NOT EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = child.author_id)
         OR (b.blocker_id = child.author_id AND b.blocked_id = $2))
       AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $2 AND m.muted_id = child.author_id)
  )
  SELECT comment.id, comment.author_id AS "authorId", ${FEED_AUTHOR_FIELDS}, comment.parent_id AS "parentId", comment.depth,
       comment.root_id AS "conversationId", CASE WHEN comment.deleted_at IS NULL THEN comment.body ELSE NULL END AS body,
       comment.declared_creation_mode AS "declaredCreationMode", comment.moderation_state AS "moderationState",
       (comment.deleted_at IS NOT NULL) AS deleted,
       to_char(comment.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt", comment.updated_at AS "updatedAt",
       to_char(comment.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorCreatedAt",
       to_char(snapshot.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "snapshotAt",
       (SELECT count(*)::integer FROM visible_thread replies
         WHERE replies.root_id = comment.id AND replies.parent_id IS NOT NULL AND replies.deleted_at IS NULL) AS "replyCount",
       CASE WHEN reply_target.deleted_at IS NULL THEN reply_target.author_id END AS "replyToAuthorId",
       (reply_target.deleted_at IS NOT NULL) AS "replyToDeleted"
  FROM visible_thread comment JOIN content.posts post ON post.id = comment.post_id
  JOIN identity.users author ON author.id = comment.author_id
  LEFT JOIN content.comments reply_target ON reply_target.id = comment.parent_id
  ${FEED_AUTHOR_JOINS} CROSS JOIN snapshot
 WHERE ${commentPostVisibilitySql('$2')}
   AND ($7::uuid IS NULL OR comment.root_id = $7)
   ${targetId ? '' : conversationId ? 'AND comment.parent_id IS NOT NULL' : view === 'conversations' ? 'AND comment.parent_id IS NULL' : ''}
   AND ($8::uuid IS NULL OR comment.id = $8)
   AND ($3::timestamptz IS NULL OR (comment.created_at, comment.id) ${descending ? '<' : '>'} ($3::timestamptz, $4::uuid))
 ORDER BY comment.created_at ${descending ? 'DESC' : 'ASC'}, comment.id ${descending ? 'DESC' : 'ASC'} LIMIT $5`;
}

const conversationAccessQuery = `SELECT comment.id FROM content.comments comment
  JOIN content.posts post ON post.id = comment.post_id
  JOIN identity.users author ON author.id = comment.author_id AND author.status = 'active' AND author.deleted_at IS NULL
 WHERE comment.post_id = $1 AND comment.id = $3 AND comment.parent_id IS NULL AND comment.depth = 0
   AND comment.moderation_state = 'allowed' AND comment.declared_creation_mode IN ('human', 'ai_assisted')
   AND ${commentPostVisibilitySql('$2')}
   AND NOT EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = comment.author_id)
     OR (b.blocker_id = comment.author_id AND b.blocked_id = $2))
   AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $2 AND m.muted_id = comment.author_id)`;

export async function readCommentThread(input: {
  request: Request;
  postId: string;
  viewerId: string | null;
  query: ThreadQuery;
}): Promise<Record<string, unknown>> {
  const postId = requireFeedPostId(input.postId);
  const params = new URL(input.request.url).searchParams;
  const view = params.get('view') === 'conversations' ? 'conversations' : 'legacy';
  const requestedSort = params.get('sort') ?? (view === 'conversations' ? 'newest' : 'oldest');
  if (requestedSort === 'most_relevant') throw new Error('comment_sort_unavailable');
  if (!['oldest', 'newest'].includes(requestedSort)) throw new Error('invalid_pagination');
  const sort = requestedSort as CommentSort;
  const conversationId = params.get('conversationId');
  if (conversationId !== null && !uuid.test(conversationId)) throw new Error('invalid_pagination');
  const targetId = params.get('targetId');
  if (targetId !== null && (!uuid.test(targetId) || params.has('cursor'))) throw new Error('invalid_pagination');
  const rawLimit = params.get('limit') ?? '25';
  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100) throw new Error('invalid_pagination');
  const limit = Number(rawLimit);
  let cursor: CommentCursor | undefined;
  const rawCursor = params.get('cursor');
  if (rawCursor !== null) {
    try {
      if (rawCursor.length > 2048) throw new Error();
      cursor = JSON.parse(atob(rawCursor.replaceAll('-', '+').replaceAll('_', '/'))) as CommentCursor;
      if (cursor.version !== 1 || cursor.postId !== postId || cursor.sort !== sort || cursor.view !== view
        || cursor.conversationId !== conversationId || !validTime(cursor.snapshot) || !validTime(cursor.timestamp)
        || !uuid.test(cursor.id)) throw new Error();
    } catch { throw new Error('invalid_pagination'); }
  }
  const refresh = params.get('refresh') === 'true';
  if (refresh && !conversationId) throw new Error('invalid_pagination');
  if (conversationId) {
    const access = await input.query(conversationAccessQuery, [postId, input.viewerId, conversationId]);
    if (!access.rows[0]) throw new Error('comment_not_found');
  }
  const result = await input.query(threadQuery(sort, view, conversationId, targetId), [postId, input.viewerId,
    cursor?.timestamp ?? null, cursor?.id ?? null, limit + 1, refresh ? null : cursor?.snapshot ?? null, conversationId, targetId]);
  const rows = result.rows.slice(0, limit);
  const tail = rows.at(-1);
  const tailCursor = tail ? btoa(JSON.stringify({ version: 1, postId, sort, view, conversationId,
    snapshot: tail.snapshotAt, timestamp: tail.cursorCreatedAt, id: tail.id })).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') : null;
  const nextCursor = result.rows.length > limit ? tailCursor : null;
  const items = rows.map(({ cursorCreatedAt: _, snapshotAt: __, ...row }) => row);
  return { items, nextCursor, refreshCursor: conversationId ? tailCursor ?? rawCursor : null,
    capabilities: { conversations: true, nestedReplies: true,
    sorts: ['newest', 'oldest'], mostRelevantAvailable: false,
    mostRelevantUnavailableReason: 'Comment usefulness signals have not been validated.' } };
}

export function commentThreadErrorStatus(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.message === 'invalid_pagination') return 400;
  if (error.message === 'comment_sort_unavailable') return 503;
  return undefined;
}
