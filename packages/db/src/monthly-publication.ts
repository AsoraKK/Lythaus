import type { Client } from 'pg';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../contracts/src/monthly-reputation-policy.ts';

export async function isMonthlyCommunityPublication(client: Client, input: {
  decisionId: string | null; policyVersion: string | null; outcome: string | null; decidedBy: string | null;
  contentId: string; contentType: 'post' | 'comment'; sourceRevisionId: string | null;
}): Promise<boolean> {
  if (input.policyVersion !== MONTHLY_REPUTATION_POLICY_VERSION || input.outcome !== 'allow' || input.decidedBy) return false;
  if (!(await client.query(`SELECT 1 FROM system.feature_flags WHERE flag_key = 'moderation.community_appeals' AND policy_version = $1`,
    [MONTHLY_REPUTATION_POLICY_VERSION])).rowCount) return false;
  return (await client.query(`SELECT 1 FROM moderation.decisions d
    JOIN moderation.community_appeal_sessions s ON s.challenged_decision_id IN (SELECT id FROM moderation.decisions WHERE case_id = d.case_id)
    JOIN moderation.community_appeal_outcomes o ON o.appeal_id = s.appeal_id AND o.recorded_at = d.created_at
    WHERE d.id = $1 AND s.state = 'resolved_allow' AND o.restoration = 'restored'
      AND s.content_id = $2 AND s.content_type = $3 AND s.source_event_id = $4`,
  [input.decisionId, input.contentId, input.contentType, input.sourceRevisionId])).rowCount === 1;
}
