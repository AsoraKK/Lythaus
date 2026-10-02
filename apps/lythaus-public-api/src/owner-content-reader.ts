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
  const match = new URL(request.url).pathname.match(/^\/api\/(posts|comments)\/([^/]+)\/owner-view$/);
  if (request.method !== 'GET' || !match) return undefined;
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
