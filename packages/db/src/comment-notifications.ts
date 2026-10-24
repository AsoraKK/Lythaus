import { commentParentVisibilitySql, commentPostVisibilitySql } from './comment-visibility.ts';

const currentCommentRevisionSql = `source.payload->>'sourceEventId' = comment.moderation_source_event_id::text`;
const currentCommentPublicationSql = `${currentCommentRevisionSql}
  AND EXISTS (SELECT 1 FROM moderation.cases current_case
    JOIN moderation.decisions decision ON decision.case_id = current_case.id
    WHERE current_case.content_type = 'comment' AND current_case.content_id = comment.id
      AND current_case.source_event_id = comment.moderation_source_event_id AND current_case.state = 'resolved'
      AND decision.id::text = source.payload->>'decisionId' AND decision.outcome = 'allow'
      AND decision.id = (SELECT latest.id FROM moderation.decisions latest WHERE latest.case_id = current_case.id
        ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1))`;

export const commentNotificationRevisionLockQuery = `SELECT comment.id FROM content.comments comment
  JOIN system.outbox_events source ON source.aggregate_id = comment.id
 WHERE source.id = $1 AND source.event_type = 'content.comment.published' AND source.aggregate_type = 'comment'
 FOR SHARE OF comment`;

export const commentNotificationRecipientQuery = `SELECT recipient.id AS recipient_id,
       CASE WHEN comment.parent_id IS NULL THEN 'content.comment_received' ELSE 'content.reply_received' END AS notification_type,
       comment.id AS comment_id
  FROM system.outbox_events source
  JOIN content.comments comment ON comment.id = source.aggregate_id
  JOIN content.posts post ON post.id = comment.post_id
  JOIN identity.users author ON author.id = comment.author_id AND author.status = 'active' AND author.deleted_at IS NULL
  LEFT JOIN content.comments comment_parent ON comment_parent.id = comment.parent_id
  JOIN identity.users recipient ON recipient.id = COALESCE(comment_parent.author_id, post.author_id)
    AND recipient.status = 'active' AND recipient.deleted_at IS NULL
 WHERE source.id = $1 AND source.event_type = 'content.comment.published' AND source.aggregate_type = 'comment'
   AND comment.moderation_state = 'allowed' AND comment.deleted_at IS NULL
   AND comment.moderation_source_event_id IS NOT NULL AND ${currentCommentPublicationSql}
   AND comment.declared_creation_mode IN ('human', 'ai_assisted')
   AND (comment.parent_id IS NULL OR comment_parent.deleted_at IS NULL)
   AND recipient.id <> comment.author_id
   AND ${commentPostVisibilitySql('recipient.id')}
   AND ${commentParentVisibilitySql('recipient.id')}
   AND NOT EXISTS (SELECT 1 FROM social.blocks b
     WHERE (b.blocker_id = recipient.id AND b.blocked_id = comment.author_id)
        OR (b.blocker_id = comment.author_id AND b.blocked_id = recipient.id))
   AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = recipient.id AND m.muted_id = comment.author_id)`;

export const commentNotificationVisibilitySql = `(feed.notifications.notification_type NOT IN ('reply', 'content.reply_received', 'content.comment_received')
  OR EXISTS (
    SELECT 1 FROM content.comments comment
    JOIN content.posts post ON post.id = comment.post_id
    JOIN identity.users author ON author.id = comment.author_id AND author.status = 'active' AND author.deleted_at IS NULL
    JOIN system.outbox_events source ON source.id = feed.notifications.source_event_id
      AND source.aggregate_id = comment.id AND source.aggregate_type = 'comment' AND source.event_type = 'content.comment.published'
    WHERE comment.id = feed.notifications.entity_id AND comment.moderation_state = 'allowed' AND comment.deleted_at IS NULL
      AND ${currentCommentRevisionSql}
      AND source.payload->>'decisionId' IS NOT NULL
      AND comment.declared_creation_mode IN ('human', 'ai_assisted')
      AND ${commentPostVisibilitySql('feed.notifications.recipient_id')}
      AND ${commentParentVisibilitySql('feed.notifications.recipient_id')}
      AND NOT EXISTS (SELECT 1 FROM social.blocks b
        WHERE (b.blocker_id = feed.notifications.recipient_id AND b.blocked_id = comment.author_id)
           OR (b.blocker_id = comment.author_id AND b.blocked_id = feed.notifications.recipient_id))
      AND NOT EXISTS (SELECT 1 FROM social.mutes m
        WHERE m.muter_id = feed.notifications.recipient_id AND m.muted_id = comment.author_id)
  ))`;
