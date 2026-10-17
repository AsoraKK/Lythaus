import type { DatabaseClient } from './index.ts';

type ReviewClient = Pick<DatabaseClient, 'query'>;

export async function readModerationReviewCycle(client: ReviewClient, caseId: string): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM system.audit_events
      WHERE target_type = 'moderation_case' AND target_id = $1
        AND action = 'moderation.case.reopened'
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [caseId],
  );
  return result.rows[0]?.id ?? null;
}

export async function assertExpectedModerationReviewCycle(
  client: ReviewClient, caseId: string, expected: unknown,
): Promise<string | null> {
  const current = await readModerationReviewCycle(client, caseId);
  if ((expected ?? null) !== current) throw new Error('moderation_case_revision_conflict');
  return current;
}

export async function moderationReviewNeedsStaffDecision(client: ReviewClient, caseId: string): Promise<boolean> {
  const cycleId = await readModerationReviewCycle(client, caseId);
  if (!cycleId) return false;
  const fresh = await client.query(
    `SELECT 1 FROM moderation.decisions decision
      JOIN identity.admin_memberships membership ON membership.user_id = decision.decided_by AND membership.active
        AND membership.role IN ('owner', 'administrator', 'moderator')
      JOIN identity.users actor ON actor.id = membership.user_id AND actor.status = 'active' AND actor.deleted_at IS NULL
     WHERE decision.case_id = $1
       AND decision.id = (
         SELECT latest.id FROM moderation.decisions latest WHERE latest.case_id = $1
          ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
       )
       AND EXISTS (
         SELECT 1 FROM system.audit_events audit
          WHERE audit.target_type = 'moderation_case' AND audit.target_id = decision.case_id
            AND audit.action = 'moderation.decision' AND audit.actor_id = decision.decided_by
            AND audit.metadata->>'decisionId' = decision.id::text
            AND audit.metadata->>'reviewCycleId' = $2
       )`,
    [caseId, cycleId],
  );
  return fresh.rowCount !== 1;
}
