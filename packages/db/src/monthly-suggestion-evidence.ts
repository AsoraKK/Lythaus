import type { DatabaseClient } from './index.ts';
import { supportTimestamp, supportUuid } from '../../contracts/src/account-support.ts';

export const SUGGESTION_OBSERVATION_VERSION = 'support-suggestion-observation-v1';
const MAX_HISTORY = 256;
const TIME = (column: string) => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const SOURCE_REQUIRED = 'monthly_suggestion_canonical_history_required';

export interface SuggestionWorkflowObservation {
  eventId: string;
  decisionId: string;
  requestId: string;
  subjectUserId: string;
  reviewerUserId: string;
  sourceRevision: number;
  previousDecisionId: string | null;
  supportPolicyVersion: string;
  fromState: string;
  toState: string;
  reasonCode: string;
  performedAt: string;
  decidedAt: string;
  observedUtcMonth: string;
  observedUtcQuarter: string;
  evidence: readonly Readonly<{ id: string; type: string; authorUserId: string; sourceRevision: number; recordedAt: string }>[];
  exclusionReasons: readonly ('self_interaction' | 'duplicate_reference')[];
  earningStatus: 'excluded' | 'policy_pending';
}

function uuid(value: unknown): string {
  if (!supportUuid(value)) throw new Error('monthly_suggestion_input_invalid');
  return value.toLowerCase();
}
function canonical(condition: unknown): asserts condition {
  if (!condition) throw new Error(SOURCE_REQUIRED);
}
function code(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
}
type Row = Record<string, any>;

export async function loadPreparedSuggestionEvidence(client: DatabaseClient, input: {
  requestId: string;
  subjectUserId: string;
  supportPolicyVersion: string;
  deliveredEventIds?: readonly string[];
}) {
  const requestId = uuid(input.requestId), subjectUserId = uuid(input.subjectUserId);
  if (typeof input.supportPolicyVersion !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(input.supportPolicyVersion)
    || (input.deliveredEventIds !== undefined && (!Array.isArray(input.deliveredEventIds) || input.deliveredEventIds.length > MAX_HISTORY))) {
    throw new Error('monthly_suggestion_input_invalid');
  }
  const deliveries = input.deliveredEventIds === undefined ? null : new Set(input.deliveredEventIds.map(uuid));
  const row = (await client.query<Row>(`SELECT r.id, r.submitter_id, r.policy_version, r.state, r.revision,
      ${TIME('r.created_at')} AS performed_at,
      (SELECT coalesce(jsonb_agg(history.item ORDER BY history.revision), '[]'::jsonb) FROM (
        SELECT d.revision, jsonb_build_object('id',d.id,'actor',d.actor_id,'revision',d.revision,
          'fromState',d.from_state,'toState',d.to_state,'reason',d.reason_code,'policy',d.policy_version,
          'evidenceIds',d.evidence_ids,'decidedAt',${TIME('d.created_at')}) AS item
        FROM support.decisions d WHERE d.request_id=r.id ORDER BY d.revision LIMIT ${MAX_HISTORY + 1}
      ) history) AS decisions,
      (SELECT coalesce(jsonb_agg(history.item ORDER BY history.revision), '[]'::jsonb) FROM (
        SELECT e.revision, jsonb_build_object('id',e.id,'type',e.evidence_type,'author',e.author_id,
          'revision',e.revision,'recordedAt',${TIME('e.created_at')}) AS item
        FROM support.evidence e WHERE e.request_id=r.id ORDER BY e.revision LIMIT ${MAX_HISTORY + 1}
      ) history) AS evidence,
      (SELECT coalesce(jsonb_agg(history.item), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id',o.id,'actor',o.actor_id,'payload',o.payload) AS item
        FROM system.outbox_events o WHERE o.aggregate_id=r.id AND o.aggregate_type='support_request'
          AND o.event_type='support.workflow.changed' LIMIT ${MAX_HISTORY + 1}
      ) history) AS events,
      (SELECT coalesce(jsonb_agg(history.item), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id',a.id,'actor',a.actor_id,'reason',a.reason_code,'metadata',a.metadata) AS item
        FROM system.audit_events a WHERE a.target_id=r.id AND a.target_type='support_request'
          AND a.action='support.decision' LIMIT ${MAX_HISTORY + 1}
      ) history) AS audits
    FROM support.requests r JOIN identity.users account ON account.id=r.submitter_id
    WHERE r.id=$1 AND r.submitter_id=$2 AND r.kind='suggestion' AND r.deleted_at IS NULL
      AND account.status <> 'deleted' AND account.deleted_at IS NULL`, [requestId, subjectUserId])).rows[0];
  if (!row) return null;
  if (row.policy_version !== input.supportPolicyVersion) throw new Error('monthly_suggestion_source_policy_mismatch');
  const decisions: Row[] = row.decisions, evidence: Row[] = row.evidence, events: Row[] = row.events, audits: Row[] = row.audits;
  for (const history of [decisions, evidence, events, audits]) canonical(Array.isArray(history) && history.length <= MAX_HISTORY);
  canonical(audits.length === decisions.length);
  const performedAt = supportTimestamp(row.performed_at);
  const observations: SuggestionWorkflowObservation[] = [];
  const seenEvents = new Set<string>(), seenDecisions = new Set<string>();
  let previous: Row | null = null;
  for (const decision of decisions) {
    canonical(supportUuid(decision.id) && supportUuid(decision.actor) && !seenDecisions.has(decision.id)
      && Number.isSafeInteger(decision.revision) && decision.revision > (previous?.revision ?? 1) && decision.revision <= row.revision
      && code(decision.fromState) && code(decision.toState) && code(decision.reason)
      && decision.policy === row.policy_version && (!previous || decision.fromState === previous.toState));
    seenDecisions.add(decision.id);
    const decidedAt = supportTimestamp(decision.decidedAt);
    canonical(decidedAt >= performedAt && (!previous || decidedAt >= previous.decidedAt));
    const matchingEvents = events.filter(event => event.payload?.revision === decision.revision);
    const matchingAudits = audits.filter(audit => audit.metadata?.revision === decision.revision);
    canonical(matchingEvents.length === 1 && matchingAudits.length === 1);
    const event = matchingEvents[0], audit = matchingAudits[0], payload = event.payload, metadata = audit.metadata;
    canonical(supportUuid(event.id) && !seenEvents.has(event.id) && event.actor === decision.actor
      && Object.keys(payload).sort().join(',') === 'kind,requestId,revision,state,subjectId'
      && payload.requestId === requestId && payload.subjectId === subjectUserId && payload.kind === 'suggestion' && payload.state === decision.toState
      && supportUuid(audit.id) && audit.actor === decision.actor && audit.reason === 'SUPPORT_OPERATION'
      && metadata.actorId === decision.actor && metadata.requestId === requestId && metadata.subjectId === subjectUserId
      && metadata.kind === 'suggestion' && metadata.state === decision.toState && metadata.policyVersion === row.policy_version);
    seenEvents.add(event.id);
    canonical(Array.isArray(decision.evidenceIds) && new Set(decision.evidenceIds).size === decision.evidenceIds.length);
    const privateEvidence = decision.evidenceIds.map((id: unknown) => {
      const found = evidence.filter(item => item.id === id);
      canonical(supportUuid(id) && found.length === 1);
      const item = found[0], recordedAt = supportTimestamp(item.recordedAt);
      canonical(code(item.type) && supportUuid(item.author) && Number.isSafeInteger(item.revision)
        && item.revision > 1 && item.revision < decision.revision && recordedAt >= performedAt && recordedAt <= decidedAt);
      return Object.freeze({ id: id.toLowerCase(), type: item.type, authorUserId: item.author,
        sourceRevision: item.revision, recordedAt });
    });
    const exclusionReasons: ('self_interaction' | 'duplicate_reference')[] = [];
    if (decision.actor === subjectUserId) exclusionReasons.push('self_interaction');
    if (privateEvidence.some(item => item.type === 'duplicate_reference')) exclusionReasons.push('duplicate_reference');
    const month = decidedAt.slice(0, 7), quarter = Math.ceil(Number(decidedAt.slice(5, 7)) / 3);
    observations.push(Object.freeze({ eventId: event.id, decisionId: decision.id, requestId, subjectUserId,
      reviewerUserId: decision.actor, sourceRevision: decision.revision, previousDecisionId: previous?.id ?? null,
      supportPolicyVersion: decision.policy, fromState: decision.fromState, toState: decision.toState, reasonCode: decision.reason,
      performedAt, decidedAt, observedUtcMonth: month, observedUtcQuarter: `${month.slice(0, 4)}-Q${quarter}`,
      evidence: Object.freeze(privateEvidence), exclusionReasons: Object.freeze(exclusionReasons),
      earningStatus: exclusionReasons.length ? 'excluded' : 'policy_pending' }));
    previous = decision;
  }
  canonical(!previous || previous.toState === row.state);
  if (deliveries) canonical([...deliveries].every(id => seenEvents.has(id)));
  return Object.freeze({ adapterVersion: SUGGESTION_OBSERVATION_VERSION, status: 'earning_policy_pending' as const,
    sourceMeaning: 'recorded_support_workflow_only' as const,
    appliedPoints: 0 as const, runtimeActivationAllowed: false as const, earningRevisions: Object.freeze([] as never[]),
    pendingGates: Object.freeze(['earning_reviewer_authority', 'usefulness_and_human_authorship_rubric',
      'manipulation_and_competing_award_checks', 'cross_request_duplicate_identity', 'acceptance_and_reversal_mapping',
      'complete_earning_source_history', 'prospective_cutover_and_calendar_timezone', 'durable_ingestion_and_settlement_integration'] as const),
    observations: Object.freeze(observations.filter(item => !deliveries || deliveries.has(item.eventId))) });
}
