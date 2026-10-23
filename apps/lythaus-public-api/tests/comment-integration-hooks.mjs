import assert from 'node:assert/strict';

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'Comment integration anchor must occur exactly once');
  return source.replace(before, after);
}

export function integratePublicApiComments(source) {
  const start = source.indexOf('async function getComments(');
  const end = source.indexOf('async function dispatchBeta(', start);
  assert.ok(start > 0 && end > start);
  source = source.slice(0, start) + `async function getComments(request: Request, env: Env, postId: string, viewer?: Principal): Promise<Response> {
  try {
    const body = await readCommentThread({ request, postId, viewerId: viewer?.userId ?? null,
      query: (sql, values) => query(env.DB_APP_FRESH, sql, [...values]) });
    return privateResponse(request, env, body);
  } catch (error) {
    const status = commentThreadErrorStatus(error);
    if (status) return privateResponse(request, env, { error: (error as Error).message }, { status });
    throw error;
  }
}

` + source.slice(end);
  const targetStart = source.indexOf('      const parent = await client.query<{ depth: number }>(', source.indexOf('async function createComment('));
  const targetEnd = source.indexOf('      depth = replyDepth(parent.rows[0]);', targetStart);
  assert.ok(targetStart > 0 && targetEnd > targetStart);
  source = source.slice(0, targetStart) + `      const parent = await client.query<{ depth: number }>(commentReplyTargetQuery, [comment.parentId, postId, user.userId]);
      depth = nestedReplyDepth(parent.rows[0]);` + source.slice(targetEnd + '      depth = replyDepth(parent.rows[0]);'.length);
  const notificationStart = source.indexOf('async function notifications(');
  const notificationEnd = source.indexOf('async function notificationAction(', notificationStart);
  assert.ok(notificationStart > 0 && notificationEnd > notificationStart);
  let notifications = source.slice(notificationStart, notificationEnd);
  notifications = replaceOnce(notifications, 'entity_id AS "entityId",', `entity_id AS "entityId",
              CASE WHEN notification_type IN ('reply', 'content.reply_received', 'content.comment_received')
                THEN (SELECT '/post/' || comment.post_id::text || '?commentId=' || comment.id::text
                        FROM content.comments comment WHERE comment.id = feed.notifications.entity_id)
              END AS deeplink,`);
  notifications = replaceOnce(notifications, 'WHERE recipient_id = $1 AND dismissed_at IS NULL\n', 'WHERE recipient_id = $1 AND dismissed_at IS NULL AND ${commentNotificationVisibilitySql}\n');
  notifications = replaceOnce(notifications, 'WHERE recipient_id = $1 AND read_at IS NULL AND dismissed_at IS NULL`', 'WHERE recipient_id = $1 AND read_at IS NULL AND dismissed_at IS NULL AND ${commentNotificationVisibilitySql}`');
  source = source.slice(0, notificationStart) + notifications + source.slice(notificationEnd);
  source = replaceOnce(source, 'FROM feed.notifications WHERE recipient_id = $1 AND read_at IS NULL AND dismissed_at IS NULL`',
    'FROM feed.notifications WHERE recipient_id = $1 AND read_at IS NULL AND dismissed_at IS NULL AND ${commentNotificationVisibilitySql}`');
  return `import { readCommentThread, commentThreadErrorStatus } from './comment-thread-reader.ts';
import { commentReplyTargetQuery, nestedReplyDepth } from '../../../packages/db/src/comment-visibility.ts';
import { commentNotificationVisibilitySql } from '../../../packages/db/src/comment-notifications.ts';
` + source;
}

export function integrateJobsCommentNotifications(source) {
  const start = source.indexOf('      const authorId = stringValue(payload.authorId);', source.indexOf('async function processNotificationSource('));
  const end = source.indexOf("    if (eventType === 'social.follow.created')", start);
  assert.ok(start > 0 && end > start);
  return `import { commentNotificationRecipientQuery, commentNotificationRevisionLockQuery } from '../../../packages/db/src/comment-notifications.ts';
` + source.slice(0, start) + `      await client.query(commentNotificationRevisionLockQuery, [eventId]);
      const recipient = await client.query<{ recipient_id: string; notification_type: string; comment_id: string }>(commentNotificationRecipientQuery, [eventId]);
      if (recipient.rows[0]) await insertPreferenceAwareNotification(client, {
        recipientId: recipient.rows[0].recipient_id,
        notificationType: recipient.rows[0].notification_type,
        entityId: recipient.rows[0].comment_id,
        sourceEventId: eventId,
        policyVersion: ACTIVITY_POLICY_VERSION,
        preferenceClass: 'replies',
      });
      return;
    }
` + source.slice(end);
}

export function integrateAdminCommentRevision(source) {
  return replaceOnce(source, '            parentId: moderationCase.parent_id,',
    "            parentId: moderationCase.parent_id,\n            ...(moderationCase.content_type === 'comment' ? { sourceEventId: moderationCase.source_event_id, decisionId } : {}),");
}

export function integrateCommentNotificationNavigation(source) {
  source = replaceOnce(source, "        nativeType: json['notificationType'] as String,",
    "        nativeType: json['notificationType'] as String,\n        deeplink: commentNotificationLink(json),");
  return "import 'package:lythaus/features/feed/domain/comment_notification_link.dart';\n" + source;
}
