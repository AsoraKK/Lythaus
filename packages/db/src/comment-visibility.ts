type CommentViewer = '$1' | '$2' | '$3' | 'recipient.id' | 'feed.notifications.recipient_id';

export function commentPostVisibilitySql(viewer: CommentViewer): string {
  return `post.deleted_at IS NULL AND post.moderation_state = 'allowed'
    AND EXISTS (SELECT 1 FROM identity.users post_author
      WHERE post_author.id = post.author_id AND post_author.status = 'active' AND post_author.deleted_at IS NULL)
    AND EXISTS (SELECT 1 FROM content.content_declarations post_declaration
      WHERE post_declaration.post_id = post.id AND post_declaration.public_label IN ('Human-authored', 'AI-assisted'))
    AND (post.visibility = 'public' OR post.author_id = ${viewer}
      OR (post.visibility = 'followers' AND EXISTS (SELECT 1 FROM social.follows f
        WHERE f.follower_id = ${viewer} AND f.followed_id = post.author_id)))
    AND NOT EXISTS (SELECT 1 FROM social.blocks b
      WHERE (b.blocker_id = ${viewer} AND b.blocked_id = post.author_id)
         OR (b.blocker_id = post.author_id AND b.blocked_id = ${viewer}))`;
}

export function commentParentVisibilitySql(viewer: CommentViewer, maximumPath = 64): string {
  if (!Number.isInteger(maximumPath) || maximumPath < 2 || maximumPath > 64) throw new Error('invalid_comment_path_limit');
  return `((comment.parent_id IS NULL AND comment.depth = 0) OR (comment.depth = 1 AND EXISTS (
    WITH RECURSIVE ancestry AS (
      SELECT parent.*, ARRAY[comment.id, parent.id] AS path FROM content.comments parent
       WHERE parent.id = comment.parent_id AND parent.post_id = comment.post_id AND parent.id <> comment.id
      UNION ALL
      SELECT parent.*, ancestry.path || parent.id FROM content.comments parent
       JOIN ancestry ON parent.id = ancestry.parent_id AND parent.post_id = comment.post_id
       WHERE NOT parent.id = ANY(ancestry.path) AND cardinality(ancestry.path) < ${maximumPath}
    )
    SELECT 1 WHERE EXISTS (SELECT 1 FROM ancestry WHERE parent_id IS NULL AND depth = 0)
      AND NOT EXISTS (SELECT 1 FROM ancestry thread_parent
        WHERE thread_parent.moderation_state <> 'allowed'
          OR thread_parent.declared_creation_mode NOT IN ('human', 'ai_assisted')
          OR (thread_parent.parent_id IS NOT NULL AND thread_parent.depth <> 1)
          OR NOT EXISTS (SELECT 1 FROM identity.users parent_author
            WHERE parent_author.id = thread_parent.author_id AND parent_author.status = 'active' AND parent_author.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM social.blocks b
            WHERE (b.blocker_id = ${viewer} AND b.blocked_id = thread_parent.author_id)
               OR (b.blocker_id = thread_parent.author_id AND b.blocked_id = ${viewer}))
          OR EXISTS (SELECT 1 FROM social.mutes m
            WHERE m.muter_id = ${viewer} AND m.muted_id = thread_parent.author_id))
  )))`;
}

export const commentReplyTargetQuery = `SELECT comment.depth FROM content.comments comment
  JOIN content.posts post ON post.id = comment.post_id
  JOIN identity.users author ON author.id = comment.author_id AND author.status = 'active' AND author.deleted_at IS NULL
 WHERE comment.id = $1 AND comment.post_id = $2 AND comment.deleted_at IS NULL
   AND comment.moderation_state = 'allowed' AND comment.declared_creation_mode IN ('human', 'ai_assisted')
   AND ${commentPostVisibilitySql('$3')}
   AND ${commentParentVisibilitySql('$3', 63)}
   AND NOT EXISTS (SELECT 1 FROM social.blocks b
     WHERE (b.blocker_id = $3 AND b.blocked_id = comment.author_id) OR (b.blocker_id = comment.author_id AND b.blocked_id = $3))
   AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $3 AND m.muted_id = comment.author_id)
 FOR SHARE OF comment`;

export function nestedReplyDepth(parent: { depth: unknown } | undefined): 1 {
  if (!parent || (parent.depth !== 0 && parent.depth !== 1)) throw new Error('invalid_comment_parent');
  return 1;
}

export const commentConversationRootSql = `(WITH RECURSIVE ancestry AS (
  SELECT comment.id, comment.parent_id, ARRAY[comment.id] AS path
  UNION ALL
  SELECT parent.id, parent.parent_id, ancestry.path || parent.id
    FROM content.comments parent JOIN ancestry ON parent.id = ancestry.parent_id
   WHERE parent.post_id = comment.post_id AND NOT parent.id = ANY(ancestry.path) AND cardinality(ancestry.path) < 64
) SELECT id FROM ancestry WHERE parent_id IS NULL LIMIT 1)`;
