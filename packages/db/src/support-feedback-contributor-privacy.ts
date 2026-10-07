import type { DatabaseClient } from './index.ts';
import { supportUuid } from '../../contracts/src/account-support.ts';
import { parseSupportServicePolicy, supportFailureCode, supportObject } from './support-feedback-policy.ts';

const TYPES = ['message', 'note', 'evidence', 'decision'] as const;
type ContributionType = typeof TYPES[number];
type Contribution = Readonly<{ id: string; type: ContributionType; createdAt: string;
  content: 'withheld_pending_privacy_review' }>;
const ERRORS = new Set(['support_privacy_invalid', 'support_privacy_held', 'support_policy_invalid', 'support_privacy_schema_unavailable']);
function uuid(value: unknown): string {
  if (!supportUuid(value)) throw new Error('support_privacy_invalid');
  return value.toLowerCase();
}
function participantSubjects(ids: '$1::uuid[]' | 'ARRAY[r.id]::uuid[]'): string {
  return `SELECT request.submitter_id AS subject_id FROM support.requests request WHERE request.id=ANY(${ids})
    UNION SELECT author_id FROM support.messages WHERE request_id=ANY(${ids})
    UNION SELECT author_id FROM support.notes WHERE request_id=ANY(${ids})
    UNION SELECT author_id FROM support.evidence WHERE request_id=ANY(${ids})
    UNION SELECT actor_id FROM support.decisions WHERE request_id=ANY(${ids})
    UNION SELECT actor.id FROM support.operation_refs ref JOIN system.audit_events audit ON audit.id=ref.audit_id
      JOIN identity.users actor ON actor.id::text IN (audit.actor_id::text,audit.metadata->>'actorId')
      WHERE ref.request_id=ANY(${ids}) AND audit.action LIKE 'support.%' AND audit.metadata->>'requestId'=ref.request_id::text
    UNION SELECT event.actor_id FROM support.operation_refs ref JOIN system.outbox_events event ON event.id=ref.outbox_id
      WHERE ref.request_id=ANY(${ids}) AND event.event_type='support.workflow.changed' AND event.aggregate_id=ref.request_id
    UNION SELECT replay.actor_id FROM support.operation_refs ref JOIN system.idempotency_keys replay
      ON replay.scope=ref.idempotency_scope AND replay.key=ref.idempotency_key
      WHERE ref.request_id=ANY(${ids}) AND replay.scope LIKE 'support:%' AND replay.response->>'requestId'=ref.request_id::text`;
}
export const SUPPORT_REQUEST_HELD = `EXISTS(SELECT 1 FROM privacy.legal_holds hold WHERE hold.active
  AND hold.subject_id IN (${participantSubjects('ARRAY[r.id]::uuid[]')}))`;

export async function lockSupportScrubParticipants(client: DatabaseClient, requestIds: readonly string[]): Promise<void> {
  if (!requestIds.length) return;
  const subjects = await client.query<{ id: string }>(`SELECT actor.id FROM identity.users actor
    WHERE actor.id IN (${participantSubjects('$1::uuid[]')}) ORDER BY actor.id FOR UPDATE NOWAIT`, [requestIds]);
  const holds = await client.query<{ id: string; active: boolean }>(`SELECT id,active FROM privacy.legal_holds
    WHERE subject_id=ANY($1::uuid[]) ORDER BY id FOR SHARE NOWAIT`, [subjects.rows.map(row => row.id)]);
  if (holds.rows.some(row => row.active)) throw new Error('support_privacy_held');
}

export async function reconcileSupportLocationHoldFacts(client: DatabaseClient, subjectId: string): Promise<void> {
  await client.query(`UPDATE privacy.subject_data_locations location SET legal_hold_state=CASE
    WHEN EXISTS(SELECT 1 FROM privacy.legal_holds hold WHERE hold.subject_id=$1 AND hold.active)
      OR EXISTS(SELECT 1 FROM support.requests r WHERE (${SUPPORT_REQUEST_HELD}) AND (
        (location.resource_reference='support.requests' AND location.entity_id=r.id)
        OR (location.resource_reference='support.messages' AND EXISTS(SELECT 1 FROM support.messages item WHERE item.id=location.entity_id AND item.request_id=r.id))
        OR (location.resource_reference='support.notes' AND EXISTS(SELECT 1 FROM support.notes item WHERE item.id=location.entity_id AND item.request_id=r.id))
        OR (location.resource_reference='support.evidence' AND EXISTS(SELECT 1 FROM support.evidence item WHERE item.id=location.entity_id AND item.request_id=r.id))
        OR (location.resource_reference='support.decisions' AND EXISTS(SELECT 1 FROM support.decisions item WHERE item.id=location.entity_id AND item.request_id=r.id))
        OR (location.resource_reference='support.operation_refs' AND EXISTS(SELECT 1 FROM support.operation_refs item WHERE item.audit_id=location.entity_id AND item.request_id=r.id))
        OR (location.entity_type='support_audit' AND EXISTS(SELECT 1 FROM system.audit_events item WHERE item.id=location.entity_id AND item.action LIKE 'support.%' AND item.metadata->>'requestId'=r.id::text))
        OR (location.entity_type='support_intent' AND EXISTS(SELECT 1 FROM support.operation_refs item WHERE item.outbox_id=location.entity_id AND item.request_id=r.id))
        OR (location.entity_type='support_idempotency' AND location.entity_id=r.id)))
    THEN 'active' ELSE 'none' END
    WHERE location.subject_id=$1 AND location.store_type='planetscale'
      AND (location.resource_reference LIKE 'support.%' OR location.entity_type IN ('support_audit','support_intent','support_idempotency'))`, [uuid(subjectId)]);
}

const OWN_CONTRIBUTIONS = `SELECT item.id,'message'::text AS type,item.created_at FROM support.messages item
    JOIN support.requests request ON request.id=item.request_id WHERE item.author_id=$1 AND request.submitter_id<>$1
  UNION ALL SELECT id,'note',created_at FROM support.notes WHERE author_id=$1
  UNION ALL SELECT id,'evidence',created_at FROM support.evidence WHERE author_id=$1
  UNION ALL SELECT id,'decision',created_at FROM support.decisions WHERE actor_id=$1`;
type Cursor = { requestId: string; subjectId: string; afterId: string; afterType: ContributionType;
  throughId: string; throughType: ContributionType };
function type(value: unknown): ContributionType {
  if (!TYPES.includes(value as ContributionType)) throw new Error('support_privacy_invalid');
  return value as ContributionType;
}

export async function exportOwnSupportContributionsForPrivacy(client: DatabaseClient, requestId: unknown,
  expectedSubjectId: unknown, suppliedPolicy: unknown, cursor: unknown = null): Promise<Readonly<{
    projection: 'authorship_metadata_pending_review'; items: readonly Contribution[]; nextCursor: string | null;
  }>> {
  try {
    const policy = parseSupportServicePolicy(suppliedPolicy), request = uuid(requestId), subject = uuid(expectedSubjectId);
    const resolved = await client.query<{ subject_id: string }>(`SELECT subject_id FROM privacy.requests
      WHERE id=$1 AND request_type='export' AND state=ANY($2::text[]) FOR SHARE`, [request, policy.privacy.requestStates]);
    if (resolved.rows[0]?.subject_id !== subject) throw new Error('support_privacy_invalid');
    const actor = await client.query('SELECT id FROM identity.users WHERE id=$1 FOR SHARE', [subject]);
    if (actor.rows.length !== 1) throw new Error('support_privacy_invalid');
    let after: Cursor | null = null;
    if (cursor !== null) {
      if (typeof cursor !== 'string' || new TextEncoder().encode(cursor).length > 1024) throw new Error('support_privacy_invalid');
      let value: unknown;
      try { value = JSON.parse(cursor); } catch { throw new Error('support_privacy_invalid'); }
      const parsed = supportObject(value, ['requestId','subjectId','afterId','afterType','throughId','throughType'], 'support_privacy_invalid');
      after = { requestId: uuid(parsed.requestId), subjectId: uuid(parsed.subjectId), afterId: uuid(parsed.afterId),
        afterType: type(parsed.afterType), throughId: uuid(parsed.throughId), throughType: type(parsed.throughType) };
      if (after.requestId !== request || after.subjectId !== subject) throw new Error('support_privacy_invalid');
      if (after.afterId > after.throughId || (after.afterId === after.throughId && after.afterType > after.throughType)) {
        throw new Error('support_privacy_invalid');
      }
    }
    try { await client.query('SELECT privacy.reconcile_support_subject_data_locations($1)', [subject]); }
    catch { throw new Error('support_privacy_schema_unavailable'); }
    await reconcileSupportLocationHoldFacts(client, subject);
    const high = after ? { id: after.throughId, type: after.throughType } : (await client.query<{ id: string; type: ContributionType }>(
      `SELECT id,type FROM (${OWN_CONTRIBUTIONS}) own ORDER BY id DESC,type DESC LIMIT 1`, [subject])).rows[0];
    if (!high) return Object.freeze({ projection: 'authorship_metadata_pending_review', items: Object.freeze([]), nextCursor: null });
    const rows = await client.query<{ id: string; type: ContributionType; createdAt: string }>(
      `SELECT id,type,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
        FROM (${OWN_CONTRIBUTIONS}) own WHERE (id,type)<=($2::uuid,$3::text)
          AND ($4::uuid IS NULL OR (id,type)>($4::uuid,$5::text)) ORDER BY id,type LIMIT $6`,
      [subject, high.id, high.type, after?.afterId ?? null, after?.afterType ?? null, policy.privacy.batch + 1]);
    const page = rows.rows.slice(0, policy.privacy.batch);
    const items = Object.freeze(page.map(row => Object.freeze({ id: row.id, type: row.type, createdAt: row.createdAt,
      content: 'withheld_pending_privacy_review' as const })));
    const last = page.at(-1);
    const nextCursor = rows.rows.length > policy.privacy.batch && last ? JSON.stringify({ requestId: request, subjectId: subject,
      afterId: last.id, afterType: last.type, throughId: high.id, throughType: high.type }) : null;
    return Object.freeze({ projection: 'authorship_metadata_pending_review', items, nextCursor });
  } catch (error) { throw new Error(supportFailureCode(error, ERRORS, 'support_privacy_unavailable')); }
}
