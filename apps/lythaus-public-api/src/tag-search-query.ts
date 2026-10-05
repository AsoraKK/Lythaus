export const TAGGED_DISCOVERY_SQL = `
  SELECT p.id, p.author_id AS "authorId", p.body, p.published_at AS "publishedAt",
         p.visibility, p.moderation_state AS "moderationState", (p.deleted_at IS NOT NULL) AS "feedItemDeleted",
         declaration.public_label AS "publicLabel", d.topic, d.region_code AS "regionCode",
         COALESCE((SELECT jsonb_object_agg(counted.reaction_type, counted.reaction_count)
                     FROM (SELECT reaction.reaction_type, count(*)::integer AS reaction_count
                             FROM social.reactions reaction WHERE reaction.post_id = p.id
                              AND reaction.reaction_type IN ('like', 'insightful', 'support')
                            GROUP BY reaction.reaction_type) counted), '{}'::jsonb) AS "reactionCounts",
         (SELECT reaction.reaction_type FROM social.reactions reaction
           WHERE reaction.user_id = $1 AND reaction.post_id = p.id
             AND reaction.reaction_type IN ('like', 'insightful', 'support') LIMIT 1) AS "viewerReaction",
         EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = p.author_id) OR (b.blocker_id = p.author_id AND b.blocked_id = $1)) AS "feedBlocked",
         EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $1 AND m.muted_id = p.author_id) AS "feedMuted",
         EXISTS (SELECT 1 FROM social.follows f WHERE f.follower_id = $1 AND f.followed_id = p.author_id) AS "feedFollowsAuthor",
         candidate.scan_truncated AS "tagSearchScanTruncated"
    FROM feed.search_public_posts_by_tag($5, $1, $2, $3, $4, $6) candidate
    LEFT JOIN content.posts p ON p.id = candidate.post_id
    LEFT JOIN content.content_declarations declaration ON declaration.post_id = p.id
    LEFT JOIN feed.discovery_candidates d ON d.post_id = p.id
   WHERE candidate.post_id IS NULL OR (
     p.visibility = 'public' AND p.moderation_state = 'allowed' AND p.deleted_at IS NULL
     AND p.published_at IS NOT NULL
     AND declaration.public_label IN ('Human-authored', 'AI-assisted')
     AND declaration.review_required = false
     AND ($1::uuid IS NULL OR (
       NOT EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = p.author_id) OR (b.blocker_id = p.author_id AND b.blocked_id = $1))
       AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $1 AND m.muted_id = p.author_id)
     ))
     AND ($2::timestamptz IS NULL OR (p.published_at, p.id) < ($2::timestamptz, $3::uuid))
   )
   ORDER BY candidate.published_at DESC, candidate.post_id DESC LIMIT $4`;
