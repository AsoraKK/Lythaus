import type { Client } from 'pg';
import { MONTHLY_REPUTATION_CATALOGUE_HASH, MONTHLY_REPUTATION_POLICY_VERSION } from '../../contracts/src/monthly-reputation-policy.ts';
import { monthlyEarningSourceEvents } from './monthly-earning.ts';

export async function monthlyContextDependencyCandidates(client: Client, weeklyRulesVersion: string) {
  if (!(await client.query(`SELECT 1 FROM system.feature_flags WHERE flag_key = 'trust.monthly_context_review' AND policy_version = $1`,
    [MONTHLY_REPUTATION_POLICY_VERSION])).rowCount) return [];
  return (await client.query<{ event_id: string; comment_id: string; rules_version: string }>(`WITH reviews AS (
    SELECT DISTINCT ON (comment_id) * FROM trust.monthly_context_reviews ORDER BY comment_id, revision DESC
  ) SELECT event.id AS event_id, review.comment_id, review.rules_version FROM reviews review
    JOIN trust.monthly_context_rule_sets rules ON rules.version = review.rules_version
    JOIN trust.monthly_earning_rule_sets weekly ON weekly.version = rules.weekly_rules_version
    JOIN identity.users account ON account.id = review.subject_user_id
    JOIN system.outbox_events event ON (event.aggregate_type = 'post' AND event.aggregate_id = review.thread_id)
      OR (event.aggregate_type = 'comment' AND event.aggregate_id = review.parent_id)
    WHERE event.event_type = ANY($1::text[]) AND event.created_at >= greatest(rules.collect_from, weekly.collect_from)
      AND rules.weekly_rules_version = $2 AND rules.policy_version = $3 AND rules.catalogue_hash = $4
      AND rules.approved_by IS NOT NULL AND rules.approved_at <= clock_timestamp()
      AND rules.collection_privacy_version = 'monthly-privacy-v1'
      AND account.status <> 'deleted' AND account.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM trust.monthly_context_dependency_receipts receipt
        WHERE receipt.event_id = event.id AND receipt.comment_id = review.comment_id)
    ORDER BY event.created_at, event.id, review.comment_id LIMIT 50`,
  [monthlyEarningSourceEvents(), weeklyRulesVersion, MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH])).rows;
}
