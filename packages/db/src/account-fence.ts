import type { DatabaseClient } from './index.ts';

export async function postReviewAuthorLockAvailable(client: DatabaseClient): Promise<boolean> {
  const permission = (await client.query<{ available: boolean }>(`SELECT COALESCE(
    has_function_privilege(current_user,
      to_regprocedure('trust.lock_active_post_review_author(uuid,uuid,uuid)')::oid, 'EXECUTE'), false) AS available`)).rows[0];
  return permission?.available === true;
}

export async function lockActivePostReviewAuthor(client: DatabaseClient, input: {
  postId: string;
  sourceEventId: string;
  expectedAuthorId: string;
}): Promise<'locked' | 'ineligible' | 'unavailable'> {
  if (!await postReviewAuthorLockAvailable(client)) return 'unavailable';
  const result = (await client.query<{ locked: boolean | null }>(
    'SELECT trust.lock_active_post_review_author($1::uuid,$2::uuid,$3::uuid) AS locked',
    [input.postId, input.sourceEventId, input.expectedAuthorId],
  )).rows[0];
  return result?.locked === true ? 'locked' : 'ineligible';
}
