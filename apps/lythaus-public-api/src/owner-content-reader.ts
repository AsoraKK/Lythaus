import { classifyPublicError } from './auth-runtime-policy.ts';

export interface OwnerContentReadDependencies {
  authenticate: () => Promise<{ userId: string }>;
  query: (sql: string, values: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  respond: (body: Record<string, unknown>, status: number) => Response;
}

// These are private known-ID reads. Public feed eligibility is deliberately
// separate, and post ownership never grants access to another author's comment.
export const ownerPostQuery = `SELECT post.id, post.author_id AS "authorId", post.body,
       post.declared_creation_mode AS "declaredCreationMode", post.visibility,
       post.moderation_state AS "moderationState", post.created_at AS "createdAt",
       post.updated_at AS "updatedAt", (post.deleted_at IS NOT NULL) AS deleted
  FROM content.posts post
  JOIN identity.users author ON author.id = post.author_id AND author.status = 'active'
 WHERE post.id = $1::uuid AND post.author_id = $2::uuid AND post.deleted_at IS NULL
   AND post.moderation_state IN ('allowed', 'under_review')`;

export const ownerPostsQuery = `SELECT post.id, post.author_id AS "authorId", post.body,
       post.declared_creation_mode AS "declaredCreationMode", post.visibility,
       post.moderation_state AS "moderationState", post.published_at AS "publishedAt",
       post.created_at AS "createdAt", post.updated_at AS "updatedAt",
       to_char(post.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorCreatedAt",
       (post.deleted_at IS NOT NULL) AS deleted
  FROM content.posts post
  JOIN identity.users author ON author.id = post.author_id AND author.status = 'active'
 WHERE post.author_id = $1::uuid AND post.deleted_at IS NULL
   AND post.moderation_state IN ('allowed', 'under_review')
   AND post.declared_creation_mode IN ('human', 'ai_assisted')
   AND ($2::timestamptz IS NULL OR (post.created_at, post.id) < ($2::timestamptz, $3::uuid))
 ORDER BY post.created_at DESC, post.id DESC LIMIT $4`;

export const ownerCommentQuery = `SELECT comment.id, comment.post_id AS "postId",
       comment.author_id AS "authorId", comment.parent_id AS "parentId", comment.depth,
       comment.body, comment.declared_creation_mode AS "declaredCreationMode",
       comment.moderation_state AS "moderationState", comment.created_at AS "createdAt",
       comment.updated_at AS "updatedAt", (comment.deleted_at IS NOT NULL) AS deleted
  FROM content.comments comment
  JOIN identity.users author ON author.id = comment.author_id AND author.status = 'active'
  JOIN content.posts post ON post.id = comment.post_id AND post.deleted_at IS NULL
 WHERE comment.id = $1::uuid AND comment.author_id = $2::uuid AND comment.deleted_at IS NULL
   AND comment.moderation_state IN ('allowed', 'under_review')`;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cursorTimestamp = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/;
const ownerPostsPageSize = 8;
const ownerPostsMaximumPageSize = 20;

interface OwnerPostsCursor {
  timestamp: string;
  id: string;
}

function isValidCursorTimestamp(value: string): boolean {
  const match = value.match(cursorTimestamp);
  if (!match) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const parsed = new Date(timestamp);
  const [, year, month, day, hour, minute, second, microseconds] = match;
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() + 1 === Number(month)
    && parsed.getUTCDate() === Number(day)
    && parsed.getUTCHours() === Number(hour)
    && parsed.getUTCMinutes() === Number(minute)
    && parsed.getUTCSeconds() === Number(second)
    && parsed.getUTCMilliseconds() === Number(microseconds.slice(0, 3));
}

function parseOwnerPostsCursor(value: string | null): OwnerPostsCursor | undefined | false {
  if (value === null) return undefined;
  if (value.length > 512) return false;
  try {
    const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const candidate = JSON.parse(decoded) as Record<string, unknown>;
    if (typeof candidate.timestamp !== 'string'
        || !isValidCursorTimestamp(candidate.timestamp)
        || typeof candidate.id !== 'string' || !uuid.test(candidate.id)) return false;
    return { timestamp: candidate.timestamp, id: candidate.id };
  } catch {
    return false;
  }
}

function encodeOwnerPostsCursor(cursor: OwnerPostsCursor): string {
  return btoa(JSON.stringify(cursor)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function parseOwnerPostsLimit(value: string | null): number | undefined {
  if (value === null) return ownerPostsPageSize;
  if (!/^\d+$/.test(value)) return undefined;
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= ownerPostsMaximumPageSize
    ? limit : undefined;
}

export function presentOwnerPost(
  row: Record<string, unknown> | undefined,
  actorId: string,
): Record<string, unknown> {
  if (!row || row.authorId !== actorId || row.deleted !== false
      || !['allowed', 'under_review'].includes(String(row.moderationState))
      || !['human', 'ai_assisted'].includes(String(row.declaredCreationMode))
      || !['public', 'followers', 'private'].includes(String(row.visibility))
      || typeof row.id !== 'string' || typeof row.body !== 'string') {
    throw new Error('post_not_found');
  }
  return {
    id: row.id,
    authorId: row.authorId,
    body: row.body,
    declaredCreationMode: row.declaredCreationMode,
    moderationState: row.moderationState,
    visibility: row.visibility,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function presentOwnerContent(
  kind: 'post' | 'comment',
  row: Record<string, unknown> | undefined,
  actorId: string,
): Record<string, unknown> {
  if (!row || row.authorId !== actorId || row.deleted !== false
      || !['allowed', 'under_review'].includes(String(row.moderationState))
      || !['human', 'ai_assisted'].includes(String(row.declaredCreationMode))
      || typeof row.body !== 'string') throw new Error(`${kind}_not_found`);
  const common = {
    id: row.id, authorId: row.authorId, body: row.body,
    declaredCreationMode: row.declaredCreationMode, moderationState: row.moderationState,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
  return kind === 'post'
    ? { ...common, visibility: row.visibility }
    : { ...common, postId: row.postId, parentId: row.parentId, depth: row.depth, deleted: false };
}

export async function handleOwnerContentRead(
  request: Request,
  dependencies: OwnerContentReadDependencies,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/(posts|comments)\/([^/]+)\/owner-view$/);
  const ownerPostsList = url.pathname === '/api/users/me/posts';
  if (request.method !== 'GET' || (!match && !ownerPostsList)) return undefined;
  if (ownerPostsList) {
    try {
      const actor = await dependencies.authenticate();
      const limit = parseOwnerPostsLimit(url.searchParams.get('limit'));
      const cursor = parseOwnerPostsCursor(url.searchParams.get('cursor'));
      if (limit === undefined || cursor === false) {
        return dependencies.respond({ error: 'invalid_pagination' }, 400);
      }
      const result = await dependencies.query(ownerPostsQuery, [
        actor.userId,
        cursor?.timestamp ?? null,
        cursor?.id ?? null,
        limit + 1,
      ]);
      const hasMore = result.rows.length > limit;
      const rows = result.rows.slice(0, limit);
      const items = rows.map((row) => presentOwnerPost(row, actor.userId));
      const tail = rows.at(-1);
      const nextCursor = hasMore && tail
        && typeof tail.cursorCreatedAt === 'string' && typeof tail.id === 'string'
        ? encodeOwnerPostsCursor({ timestamp: tail.cursorCreatedAt, id: tail.id })
        : null;
      return dependencies.respond({ items, nextCursor }, 200);
    } catch (error) {
      const classified = classifyPublicError(error);
      return dependencies.respond({ error: classified.exposedCode }, classified.status);
    }
  }
  if (!match) return undefined;
  const kind = match[1] === 'posts' ? 'post' : 'comment';
  try {
    const actor = await dependencies.authenticate();
    let id: string;
    try { id = decodeURIComponent(match[2]); }
    catch { throw new Error(`${kind}_not_found`); }
    if (!uuid.test(id)) throw new Error(`${kind}_not_found`);
    const result = await dependencies.query(kind === 'post' ? ownerPostQuery : ownerCommentQuery, [id, actor.userId]);
    const item = presentOwnerContent(kind, result.rows[0], actor.userId);
    return dependencies.respond({ [kind]: item }, 200);
  } catch (error) {
    const classified = classifyPublicError(error);
    return dependencies.respond({ error: classified.exposedCode }, classified.status);
  }
}
