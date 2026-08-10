import { buildActivityEvent, type ActivityEvent, type ActivityEventInput } from '@lythaus/contracts';
import type { Client } from 'pg';

export interface ActivityCursor {
  createdAt: string;
  id: string;
}

export interface ActivityPage {
  items: readonly ActivityEvent[];
  nextCursor: ActivityCursor | null;
}

function retentionUntil(createdAt: string, retentionDays: number): string {
  const createdTime = Date.parse(createdAt);
  if (!Number.isFinite(createdTime)) throw new Error('activity_created_at_invalid');
  return new Date(createdTime + retentionDays * 86_400_000).toISOString();
}

export async function recordUserActivity(client: Client, input: ActivityEventInput): Promise<ActivityEvent> {
  const event = buildActivityEvent(input);
  const result = await client.query<ActivityEvent>(
    `WITH inserted AS (
       INSERT INTO trust.user_activity_events
         (id, user_id, actor_user_id, event_type, category, source, source_event_id, correlation_id,
          title, explanation, result, reason_code, policy_version, object_type, object_id,
          reputation_effect, appealable, metadata, retention_class, retention_until, created_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18::jsonb, $19, $20, $21)
       ON CONFLICT (user_id, source_event_id, event_type) DO NOTHING
       RETURNING id, user_id AS "userId", actor_user_id AS "actorUserId", event_type AS "eventType",
         category, source, source_event_id AS "sourceEventId", correlation_id AS "correlationId",
         title, explanation, result, reason_code AS "reasonCode", policy_version AS "policyVersion",
         object_type AS "objectType", object_id AS "objectId", reputation_effect AS "reputationEffect",
         appealable, retention_class AS "retentionClass", metadata, created_at AS "createdAt"
     )
     SELECT *, $22::integer AS "retentionDays" FROM inserted
     UNION ALL
     SELECT id, user_id AS "userId", actor_user_id AS "actorUserId", event_type AS "eventType",
       category, source, source_event_id AS "sourceEventId", correlation_id AS "correlationId",
       title, explanation, result, reason_code AS "reasonCode", policy_version AS "policyVersion",
       object_type AS "objectType", object_id AS "objectId", reputation_effect AS "reputationEffect",
       appealable, retention_class AS "retentionClass", metadata, created_at AS "createdAt",
       $22::integer AS "retentionDays"
       FROM trust.user_activity_events
      WHERE user_id = $2 AND source_event_id = $7 AND event_type = $4
     LIMIT 1`,
    [
      event.id,
      event.userId,
      event.actorUserId ?? null,
      event.eventType,
      event.category,
      event.source,
      event.sourceEventId,
      event.correlationId,
      event.title,
      event.explanation,
      event.result,
      event.reasonCode ?? null,
      event.policyVersion,
      event.objectType ?? null,
      event.objectId ?? null,
      event.reputationEffect,
      event.appealable,
      JSON.stringify(event.metadata),
      event.retentionClass,
      retentionUntil(event.createdAt, event.retentionDays),
      event.createdAt,
      event.retentionDays,
    ],
  );
  if (!result.rows[0]) throw new Error('activity_event_not_recorded');
  return Object.freeze(result.rows[0]);
}

export async function listUserActivity(
  client: Client,
  userId: string,
  options: { limit?: number; cursor?: ActivityCursor; category?: string } = {},
): Promise<ActivityPage> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const values: unknown[] = [userId, limit + 1];
  const predicates = ['user_id = $1'];
  if (options.cursor) {
    values.push(options.cursor.createdAt, options.cursor.id);
    predicates.push(`(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
  }
  if (options.category) {
    values.push(options.category);
    predicates.push(`category = $${values.length}`);
  }
  const result = await client.query<ActivityEvent>(
    `SELECT id, user_id AS "userId", actor_user_id AS "actorUserId", event_type AS "eventType",
       category, source, source_event_id AS "sourceEventId", correlation_id AS "correlationId",
       title, explanation, result, reason_code AS "reasonCode", policy_version AS "policyVersion",
       object_type AS "objectType", object_id AS "objectId", reputation_effect AS "reputationEffect",
       appealable, retention_class AS "retentionClass", metadata, created_at AS "createdAt",
       CASE retention_class WHEN 'ordinary' THEN 730 WHEN 'security' THEN 365 ELSE 90 END AS "retentionDays"
       FROM trust.user_activity_events
      WHERE ${predicates.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    values,
  );
  const hasMore = result.rows.length > limit;
  const items = result.rows.slice(0, limit).map((item) => Object.freeze(item));
  const tail = items.at(-1);
  return {
    items,
    nextCursor: hasMore && tail ? { createdAt: tail.createdAt, id: tail.id } : null,
  };
}
