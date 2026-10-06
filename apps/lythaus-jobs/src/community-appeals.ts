import { query, transaction, type HyperdriveBinding } from '@lythaus/db';
import { logEvent } from '@lythaus/observability';
import { communityConfiguration } from '../../../packages/db/src/community-appeal-access.ts';
import { closeCommunityAppeal } from '../../../packages/db/src/community-appeal-closure.ts';

export interface CommunityAppealJobsEnv { DB_JOBS_FRESH: HyperdriveBinding; COMMUNITY_APPEAL_RULES_VERSION?: string }
export async function reconcileCommunityAppeals(env: CommunityAppealJobsEnv) {
  if (!env.COMMUNITY_APPEAL_RULES_VERSION) return { processed: 0 };
  try { await transaction(env.DB_JOBS_FRESH, client => communityConfiguration(client, env.COMMUNITY_APPEAL_RULES_VERSION!)); }
  catch (error) { if (error instanceof Error && error.message === 'community_appeals_unavailable') return { processed: 0 }; throw error; }
  const due = await query<{ appeal_id: string }>(env.DB_JOBS_FRESH,
    `SELECT appeal_id FROM moderation.community_appeal_sessions WHERE state IN ('open', 'extended')
      AND closes_at <= clock_timestamp() ORDER BY closes_at, appeal_id LIMIT 50`);
  let processed = 0;
  for (const row of due.rows) {
    try {
      const result = await transaction(env.DB_JOBS_FRESH, client => closeCommunityAppeal(client, row.appeal_id));
      if (result.created) processed++;
    } catch { logEvent({ service: 'lythaus-jobs', event: 'community_appeal_closure_failed', appealId: row.appeal_id }); }
  }
  return { processed };
}
