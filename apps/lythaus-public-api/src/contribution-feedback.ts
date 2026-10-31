import type { DatabaseClient } from '@lythaus/db';
import { commentParentVisibilitySql, commentPostVisibilitySql } from '../../../packages/db/src/comment-visibility.ts';

export type FeedbackTarget = { type: 'post' | 'comment'; id: string };
export type FeedbackChannel = 'quality' | 'emotion';
export type QualityValue = 'like' | 'dislike';
export type EmotionValue = 'amused' | 'sad' | 'angry' | 'surprised' | 'appreciative';
export type FeedbackValue = QualityValue | EmotionValue;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const values: Record<FeedbackChannel, readonly FeedbackValue[]> = {
  quality: ['like', 'dislike'],
  emotion: ['amused', 'sad', 'angry', 'surprised', 'appreciative'],
};

type VisibilityPathRow = { id: string; parent_id: string | null; post_id: string; author_id: string; post_author_id: string };

async function visibilityPath(client: DatabaseClient, target: FeedbackTarget): Promise<VisibilityPathRow[]> {
  const result = target.type === 'post'
    ? await client.query<VisibilityPathRow>(`SELECT post.id, NULL::uuid AS parent_id, post.id AS post_id,
        post.author_id, post.author_id AS post_author_id FROM content.posts post WHERE post.id = $1`, [target.id])
    : await client.query<VisibilityPathRow>(`WITH RECURSIVE ancestry AS (
        SELECT c.id, c.parent_id, c.post_id, c.author_id, ARRAY[c.id] AS path
          FROM content.comments c WHERE c.id = $1
        UNION ALL
        SELECT parent.id, parent.parent_id, parent.post_id, parent.author_id, ancestry.path || parent.id
          FROM content.comments parent JOIN ancestry ON parent.id = ancestry.parent_id AND parent.post_id = ancestry.post_id
         WHERE NOT parent.id = ANY(ancestry.path) AND cardinality(ancestry.path) < 64
      ) SELECT ancestry.id, ancestry.parent_id, ancestry.post_id, ancestry.author_id, post.author_id AS post_author_id
          FROM ancestry JOIN content.posts post ON post.id = ancestry.post_id ORDER BY ancestry.id`, [target.id]);
  return result.rows;
}

/** Hold every record that visibility depends on until the feedback transaction ends. */
async function lockFeedbackVisibility(client: DatabaseClient, target: FeedbackTarget, actor: string): Promise<void> {
  const missing = target.type === 'post' ? 'post_not_found' : 'comment_not_found';
  const before = await visibilityPath(client, target);
  if (before.length === 0) throw new Error(missing);
  const users = [...new Set([actor, ...before.flatMap(row => [row.author_id, row.post_author_id])])];
  const accounts = await client.query<{ id: string; status: string; deleted_at: string | null }>(
    'SELECT id, status, deleted_at FROM identity.users WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE', [users]);
  if (!accounts.rows.some(row => row.id === actor.toLowerCase() && row.status === 'active' && row.deleted_at === null)) {
    throw new Error('authentication_required');
  }
  await client.query('SELECT id FROM content.posts WHERE id = $1 FOR SHARE', [before[0].post_id]);
  if (target.type === 'comment') {
    await client.query('SELECT id FROM content.comments WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE', [before.map(row => row.id)]);
  }
  await client.query('SELECT post_id FROM content.content_declarations WHERE post_id = $1 FOR SHARE', [before[0].post_id]);
  // The path could have changed while locks were being acquired. Fail closed and retry at the caller.
  if (JSON.stringify(before) !== JSON.stringify(await visibilityPath(client, target))) throw new Error(missing);
}

export function feedbackTarget(type: string, rawId: string): FeedbackTarget {
  let id: string;
  try { id = decodeURIComponent(rawId); } catch { throw new Error('post_not_found'); }
  if ((type !== 'post' && type !== 'comment') || !uuid.test(id)) throw new Error('post_not_found');
  return { type, id: id.toLowerCase() };
}

export function feedbackInput(channel: string, value: unknown): { channel: FeedbackChannel; value: FeedbackValue | null } {
  if (channel !== 'quality' && channel !== 'emotion') throw new Error('invalid_reaction');
  if (value !== null && (typeof value !== 'string' || !values[channel].includes(value as FeedbackValue))) {
    throw new Error('invalid_reaction');
  }
  return { channel, value: value as FeedbackValue | null };
}

async function visibleTarget(client: DatabaseClient, target: FeedbackTarget, actor: string | null): Promise<string> {
  const sql = target.type === 'post'
    ? `SELECT post.author_id FROM content.posts post
       WHERE post.id = $1 AND ${commentPostVisibilitySql('$2')}
         AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $2 AND m.muted_id = post.author_id)
       FOR SHARE OF post`
    : `SELECT comment.author_id FROM content.comments comment
       JOIN content.posts post ON post.id = comment.post_id
       JOIN identity.users author ON author.id = comment.author_id AND author.status = 'active' AND author.deleted_at IS NULL
       WHERE comment.id = $1 AND comment.deleted_at IS NULL AND comment.moderation_state = 'allowed'
         AND comment.declared_creation_mode IN ('human', 'ai_assisted')
         AND ${commentPostVisibilitySql('$2')} AND ${commentParentVisibilitySql('$2')}
         AND NOT EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = comment.author_id)
           OR (b.blocker_id = comment.author_id AND b.blocked_id = $2))
         AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $2 AND m.muted_id = comment.author_id)
       FOR SHARE OF comment, post`;
  const result = await client.query<{ author_id: string }>(sql, [target.id, actor]);
  if (!result.rows[0]) throw new Error(target.type === 'post' ? 'post_not_found' : 'comment_not_found');
  return result.rows[0].author_id;
}

export interface FeedbackSummary {
  target: FeedbackTarget;
  quality: { counts: Record<QualityValue, number>; myValue: QualityValue | null };
  emotion: { counts: Record<EmotionValue, number>; myValue: EmotionValue | null };
}

async function summary(client: DatabaseClient, target: FeedbackTarget, actor: string | null): Promise<FeedbackSummary> {
  const column = target.type === 'post' ? 'post_id' : 'comment_id';
  const result = await client.query<{ channel: FeedbackChannel; value: FeedbackValue; count: number; mine: boolean }>(
    `SELECT feedback.channel, feedback.value, count(*)::integer AS count,
            bool_or(feedback.actor_id = $2) AS mine
       FROM social.contribution_feedback feedback
       JOIN identity.users actor ON actor.id = feedback.actor_id AND actor.status = 'active' AND actor.deleted_at IS NULL
      WHERE feedback.${column} = $1
        AND NOT EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = feedback.actor_id)
          OR (b.blocker_id = feedback.actor_id AND b.blocked_id = $2))
        AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $2 AND m.muted_id = feedback.actor_id)
      GROUP BY feedback.channel, feedback.value`, [target.id, actor]);
  const output: FeedbackSummary = {
    target,
    quality: { counts: { like: 0, dislike: 0 }, myValue: null },
    emotion: { counts: { amused: 0, sad: 0, angry: 0, surprised: 0, appreciative: 0 }, myValue: null },
  };
  for (const row of result.rows) {
    if (row.channel === 'quality' && values.quality.includes(row.value)) {
      const value = row.value as QualityValue;
      output.quality.counts[value] = row.count;
      if (row.mine) output.quality.myValue = value;
    } else if (row.channel === 'emotion' && values.emotion.includes(row.value)) {
      const value = row.value as EmotionValue;
      output.emotion.counts[value] = row.count;
      if (row.mine) output.emotion.myValue = value;
    }
  }
  return output;
}

export async function readFeedback(client: DatabaseClient, target: FeedbackTarget, actor: string | null): Promise<FeedbackSummary> {
  await visibleTarget(client, target, actor);
  return summary(client, target, actor);
}

export async function changeFeedback(client: DatabaseClient, input: {
  target: FeedbackTarget; actor: string; channel: FeedbackChannel; value: FeedbackValue | null; id: string;
  audit: (changed: boolean) => Promise<void>;
}): Promise<{ changed: boolean; summary: FeedbackSummary }> {
  const { target, actor, channel, value, id } = input;
  feedbackInput(channel, value);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`feedback:${actor.toLowerCase()}:${target.type}:${target.id.toLowerCase()}:${channel}`]);
  await lockFeedbackVisibility(client, target, actor);
  const author = await visibleTarget(client, target, actor);
  if (author === actor.toLowerCase()) throw new Error('self_reaction_not_allowed');
  const column = target.type === 'post' ? 'post_id' : 'comment_id';
  const existing = await client.query<{ value: FeedbackValue }>(
    `SELECT value FROM social.contribution_feedback WHERE actor_id = $1 AND ${column} = $2 AND channel = $3`,
    [actor, target.id, channel]);
  const changed = (existing.rows[0]?.value ?? null) !== value;
  if (changed) {
    if (value === null) {
      await client.query(`DELETE FROM social.contribution_feedback WHERE actor_id = $1 AND ${column} = $2 AND channel = $3`, [actor, target.id, channel]);
    } else if (existing.rows[0]) {
      await client.query(`UPDATE social.contribution_feedback SET value = $4, updated_at = now() WHERE actor_id = $1 AND ${column} = $2 AND channel = $3`, [actor, target.id, channel, value]);
    } else {
      await client.query(`INSERT INTO social.contribution_feedback (id, actor_id, ${column}, channel, value) VALUES ($1, $2, $3, $4, $5)`, [id, actor, target.id, channel, value]);
    }
    await input.audit(true);
  }
  return { changed, summary: await summary(client, target, actor) };
}
