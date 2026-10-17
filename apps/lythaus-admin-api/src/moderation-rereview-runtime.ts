import type { DatabaseClient } from '@lythaus/db';
import { uuidv7 } from '@lythaus/security';
import { parseReasonCode, rejectUnknownFields } from './admin-runtime-policy.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESOLVED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export interface ModerationRereviewRevision {
  resolvedAt: string;
  sourceEventId: string;
  decisionId: string;
}

export interface ModerationRereviewRequest {
  expectedCaseState: 'resolved';
  expectedRevision: ModerationRereviewRevision;
  reasonCode: string;
}

interface ModerationCaseRow {
  content_type: string;
  content_id: string;
  policy_version: string;
  state: string;
  source_event_id: string;
  resolved_at_revision: string | null;
}

interface ModerationDecisionRow {
  id: string;
  outcome: string;
  policy_version: string;
  decided_by: string | null;
  created_at: Date | string;
}

interface ModerationContentRow {
  current_source_event_id: string | null;
  content_active: boolean;
}

function parseExpectedRevision(value: unknown): ModerationRereviewRevision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('moderation_case_revision_conflict');
  }
  const revision = rejectUnknownFields(value, ['resolvedAt', 'sourceEventId', 'decisionId']);
  if (typeof revision.resolvedAt !== 'string' || !RESOLVED_AT_PATTERN.test(revision.resolvedAt)
    || !Number.isFinite(Date.parse(revision.resolvedAt))
    || typeof revision.sourceEventId !== 'string' || !UUID_PATTERN.test(revision.sourceEventId)
    || typeof revision.decisionId !== 'string' || !UUID_PATTERN.test(revision.decisionId)) {
    throw new Error('moderation_case_revision_conflict');
  }
  return {
    resolvedAt: revision.resolvedAt,
    sourceEventId: revision.sourceEventId,
    decisionId: revision.decisionId,
  };
}

export function parseModerationRereviewRequest(input: unknown): ModerationRereviewRequest {
  const body = rejectUnknownFields(input, ['expectedCaseState', 'expectedRevision', 'reasonCode']);
  if (body.expectedCaseState !== 'resolved') throw new Error('moderation_case_state_conflict');
  return {
    expectedCaseState: 'resolved',
    expectedRevision: parseExpectedRevision(body.expectedRevision),
    reasonCode: parseReasonCode(body.reasonCode),
  };
}

export async function reopenModerationCase(
  client: Pick<DatabaseClient, 'query'>,
  caseId: string,
  actor: { userId: string; role: string },
  correlation: string,
  input: unknown,
): Promise<{ caseId: string; state: 'open'; moderationState: 'under_review'; revision: null }> {
  const request = parseModerationRereviewRequest(input);
  const existing = await client.query<ModerationCaseRow>(
    `SELECT content_type, content_id, policy_version, state, source_event_id::text AS source_event_id,
            to_char(resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS resolved_at_revision
       FROM moderation.cases
      WHERE id = $1
      FOR UPDATE`,
    [caseId],
  );
  const moderationCase = existing.rows[0];
  if (!moderationCase) throw new Error('moderation_case_not_found');
  if (moderationCase.state === 'superseded') throw new Error('moderation_case_superseded');
  if (moderationCase.state !== request.expectedCaseState) throw new Error('moderation_case_state_conflict');

  const latestDecisionResult = await client.query<ModerationDecisionRow>(
    `SELECT id::text AS id, outcome, policy_version, decided_by::text AS decided_by, created_at
       FROM moderation.decisions
      WHERE case_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [caseId],
  );
  const latestDecision = latestDecisionResult.rows[0];
  const expectedRevision = request.expectedRevision;
  if (!latestDecision || moderationCase.resolved_at_revision === null
    || moderationCase.resolved_at_revision !== expectedRevision.resolvedAt
    || moderationCase.source_event_id !== expectedRevision.sourceEventId
    || latestDecision.id !== expectedRevision.decisionId) {
    throw new Error('moderation_case_revision_conflict');
  }

  let contentResult;
  if (moderationCase.content_type === 'post') {
    contentResult = await client.query<ModerationContentRow>(
      `SELECT moderation_source_event_id::text AS current_source_event_id,
              deleted_at IS NULL AS content_active
         FROM content.posts
        WHERE id = $1
        FOR UPDATE`,
      [moderationCase.content_id],
    );
  } else if (moderationCase.content_type === 'comment') {
    contentResult = await client.query<ModerationContentRow>(
      `SELECT moderation_source_event_id::text AS current_source_event_id,
              deleted_at IS NULL AS content_active
         FROM content.comments
        WHERE id = $1
        FOR UPDATE`,
      [moderationCase.content_id],
    );
  } else if (moderationCase.content_type === 'profile') {
    contentResult = await client.query<ModerationContentRow>(
      `SELECT profile.moderation_source_event_id::text AS current_source_event_id,
              users.status = 'active' AS content_active
         FROM social.profiles profile
         JOIN identity.users users ON users.id = profile.user_id
        WHERE profile.user_id = $1
        FOR UPDATE OF profile, users`,
      [moderationCase.content_id],
    );
  } else {
    throw new Error('moderation_case_superseded');
  }
  const content = contentResult.rows[0];
  if (!content || content.content_active !== true
    || content.current_source_event_id !== moderationCase.source_event_id) {
    throw new Error('moderation_case_superseded');
  }

  const caseUpdate = await client.query(
    `UPDATE moderation.cases
        SET state = 'open', resolved_at = NULL
      WHERE id = $1 AND state = 'resolved' AND resolved_at = $2::timestamptz
        AND source_event_id = $3::uuid
        AND $4::uuid = (
          SELECT decision.id FROM moderation.decisions decision
           WHERE decision.case_id = moderation.cases.id
           ORDER BY decision.created_at DESC, decision.id DESC
           LIMIT 1
        )`,
    [caseId, expectedRevision.resolvedAt, expectedRevision.sourceEventId, expectedRevision.decisionId],
  );
  if (caseUpdate.rowCount !== 1) throw new Error('moderation_case_revision_conflict');

  let contentUpdate;
  if (moderationCase.content_type === 'post') {
    contentUpdate = await client.query(
      `UPDATE content.posts
          SET moderation_state = 'under_review', published_at = NULL, updated_at = now()
        WHERE id = $1 AND moderation_source_event_id = $2::uuid AND deleted_at IS NULL`,
      [moderationCase.content_id, expectedRevision.sourceEventId],
    );
  } else if (moderationCase.content_type === 'comment') {
    contentUpdate = await client.query(
      `UPDATE content.comments
          SET moderation_state = 'under_review', updated_at = now()
        WHERE id = $1 AND moderation_source_event_id = $2::uuid AND deleted_at IS NULL`,
      [moderationCase.content_id, expectedRevision.sourceEventId],
    );
  } else {
    contentUpdate = await client.query(
      `UPDATE social.profiles
          SET moderation_state = 'under_review', updated_at = now()
        WHERE user_id = $1 AND moderation_source_event_id = $2::uuid`,
      [moderationCase.content_id, expectedRevision.sourceEventId],
    );
  }
  if (contentUpdate.rowCount !== 1) throw new Error('moderation_case_superseded');

  await client.query(
    `INSERT INTO system.audit_events
       (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
     VALUES ($1, $2, 'moderation.case.reopened', 'moderation_case', $3, $4, $5, $6::jsonb)`,
    [uuidv7(), actor.userId, caseId, request.reasonCode, correlation, JSON.stringify({
      role: actor.role,
      expectedCaseState: request.expectedCaseState,
      previousState: 'resolved',
      nextState: 'open',
      moderationState: 'under_review',
      previousRevision: expectedRevision,
      previousDecisionOutcome: latestDecision.outcome,
      previousDecisionPolicyVersion: latestDecision.policy_version,
      previousDecisionActorId: latestDecision.decided_by,
    })],
  );

  return { caseId, state: 'open', moderationState: 'under_review', revision: null };
}
