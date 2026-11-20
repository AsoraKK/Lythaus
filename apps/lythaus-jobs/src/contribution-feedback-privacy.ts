import type { DatabaseClient } from '@lythaus/db';

async function exists(client: DatabaseClient): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    "SELECT to_regclass('social.contribution_feedback') IS NOT NULL AS present",
  );
  return result.rows[0]?.present === true;
}

export async function exportContributionFeedback(client: DatabaseClient, subjectId: string): Promise<unknown[]> {
  if (!await exists(client)) return [];
  const result = await client.query(
    `SELECT post_id, comment_id, channel, value, created_at, updated_at
       FROM social.contribution_feedback WHERE actor_id = $1 ORDER BY created_at, id`, [subjectId]);
  return result.rows;
}

export async function purgeContributionFeedback(client: DatabaseClient, subjectId: string): Promise<void> {
  if (!await exists(client)) return;
  await client.query(
    `DELETE FROM social.contribution_feedback WHERE actor_id = $1
      OR post_id IN (SELECT id FROM content.posts WHERE author_id = $1)
      OR comment_id IN (SELECT id FROM content.comments WHERE author_id = $1)`, [subjectId]);
}
