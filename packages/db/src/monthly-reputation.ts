import {
  calculateMonthlyReputation,
  MONTHLY_REPUTATION_POLICY_VERSION,
  MONTHLY_REPUTATION_CATALOGUE_HASH,
  type MonthlyReputationCalculation,
  type MonthlyReputationInput,
} from '@lythaus/contracts';
import type { Client } from 'pg';

export const MONTHLY_REPUTATION_SHADOW_FLAG = 'trust.monthly_reputation_shadow';
export const MONTHLY_REPUTATION_REQUEST_EVENT = 'trust.monthly_assessment.requested';
export const MONTHLY_REPUTATION_PAUSED = 'monthly_reputation_shadow_paused';

interface SourceRow {
  id: string;
  subject_user_id: string;
  revision: number;
  supersedes_id: string | null;
  reason_code: string;
  input_digest: string;
  input: MonthlyReputationInput;
  catalogue_hash: string;
}

export interface MonthlyReputationShadowAssessment {
  id: string;
  sourceId: string;
  mode: 'shadow';
  calculation: MonthlyReputationCalculation;
  created: boolean;
}

function requireUuidV7(value: string): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('monthly_reputation_id_invalid');
  }
}

async function inputDigest(input: MonthlyReputationInput): Promise<string> {
  const values = [input.policyVersion, input.sourceMonth, input.sourceCutoff, input.periodPolicyVersion,
    input.weeks.map((week) => [week.weekId, week.revision, week.ownerMonth, week.startsAt,
      week.endsAt, week.lockedAt, week.state, week.points]), input.monthlyPoints, input.quarterlyPoints];
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(values)));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function canonicalInput(calculation: MonthlyReputationCalculation): MonthlyReputationInput {
  return {
    policyVersion: calculation.policyVersion,
    sourceMonth: calculation.sourceMonth,
    sourceCutoff: calculation.sourceCutoff,
    periodPolicyVersion: calculation.periodPolicyVersion,
    weeks: calculation.weeks.map((week) => ({
      weekId: week.weekId, revision: week.revision, ownerMonth: week.ownerMonth,
      startsAt: week.startsAt, endsAt: week.endsAt, lockedAt: week.lockedAt,
      state: week.state, points: week.points,
    })),
    monthlyPoints: calculation.monthlyPoints,
    quarterlyPoints: calculation.quarterlyPoints,
  };
}

export async function monthlyReputationShadowEnabled(client: Client): Promise<boolean> {
  const flag = await client.query<{ enabled: boolean; policy_version: string }>(
    'SELECT enabled, policy_version FROM system.feature_flags WHERE flag_key = $1',
    [MONTHLY_REPUTATION_SHADOW_FLAG],
  );
  return flag.rows[0]?.enabled === true && flag.rows[0]?.policy_version === MONTHLY_REPUTATION_POLICY_VERSION;
}

export async function deferMonthlyReputationRequest(client: Client, eventId: string): Promise<void> {
  requireUuidV7(eventId);
  const deferred = await client.query(
    `UPDATE system.outbox_events SET last_error_code = $2
      WHERE id = $1 AND event_type = $3 AND aggregate_type = 'monthly_reputation_source'
        AND payload ->> 'sourceId' = aggregate_id::text
      RETURNING id`,
    [eventId, MONTHLY_REPUTATION_PAUSED, MONTHLY_REPUTATION_REQUEST_EVENT],
  );
  if (deferred.rowCount !== 1) throw new Error('monthly_reputation_canonical_event_required');
  await client.query(
    `DELETE FROM system.consumer_inbox WHERE consumer_name = 'lythaus-jobs'
      AND event_id = $1 AND state = 'processing'`, [eventId],
  );
}

export async function recordMonthlyReputationSource(client: Client, request: {
  id: string;
  subjectUserId: string;
  eventId: string;
  expectedPreviousId: string | null;
  reasonCode: string;
  input: MonthlyReputationInput;
  evaluatedAt: string;
}): Promise<{ id: string; revision: number; created: boolean }> {
  if (!await monthlyReputationShadowEnabled(client)) throw new Error('monthly_reputation_shadow_disabled');
  for (const id of [request.id, request.subjectUserId, request.eventId]) requireUuidV7(id);
  if (request.expectedPreviousId !== null) requireUuidV7(request.expectedPreviousId);
  if (!/^[a-z][a-z0-9_]{0,99}$/.test(request.reasonCode)) throw new Error('monthly_reputation_reason_invalid');
  const input = canonicalInput(calculateMonthlyReputation(request.input, request.evaluatedAt));
  const digest = await inputDigest(input);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `monthly-reputation:${request.subjectUserId}:${input.sourceMonth}`,
  ]);
  const existing = await client.query<SourceRow>(
    'SELECT * FROM trust.monthly_reputation_sources WHERE id = $1', [request.id],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (row.subject_user_id !== request.subjectUserId || row.input_digest !== digest
      || row.reason_code !== request.reasonCode || row.supersedes_id !== request.expectedPreviousId
      || row.catalogue_hash !== MONTHLY_REPUTATION_CATALOGUE_HASH) {
      throw new Error('monthly_reputation_source_id_reused');
    }
    return { id: row.id, revision: row.revision, created: false };
  }
  const previous = await client.query<{ id: string; revision: number }>(
    `SELECT id, revision FROM trust.monthly_reputation_sources
      WHERE subject_user_id = $1 AND source_month = $2::date AND policy_version = $3
      ORDER BY revision DESC LIMIT 1`,
    [request.subjectUserId, `${input.sourceMonth}-01`, input.policyVersion],
  );
  if ((previous.rows[0]?.id ?? null) !== request.expectedPreviousId) {
    throw new Error('monthly_reputation_source_revision_conflict');
  }
  const revision = (previous.rows[0]?.revision ?? 0) + 1;
  await client.query(
    `INSERT INTO trust.monthly_reputation_sources
       (id, subject_user_id, source_month, policy_version, catalogue_hash, revision,
        supersedes_id, reason_code, input, input_digest)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
    [request.id, request.subjectUserId, `${input.sourceMonth}-01`, input.policyVersion,
      MONTHLY_REPUTATION_CATALOGUE_HASH, revision, request.expectedPreviousId, request.reasonCode,
      JSON.stringify(input), digest],
  );
  await client.query(
    `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
     VALUES ($1, $2, 'monthly_reputation_source', $3, $4, $5::jsonb)`,
    [request.eventId, MONTHLY_REPUTATION_REQUEST_EVENT, request.id, request.subjectUserId,
      JSON.stringify({ sourceId: request.id })],
  );
  return { id: request.id, revision, created: true };
}

export async function assessMonthlyReputationSource(client: Client, request: {
  eventId: string;
  assessmentId: string;
  resultEventId: string;
  evaluatedAt: string;
}): Promise<MonthlyReputationShadowAssessment | null> {
  if (!await monthlyReputationShadowEnabled(client)) return null;
  for (const id of [request.eventId, request.assessmentId, request.resultEventId]) requireUuidV7(id);
  const canonical = await client.query<{ aggregate_id: string; actor_id: string; payload: { sourceId?: string } }>(
    `SELECT aggregate_id, actor_id, payload FROM system.outbox_events
      WHERE id = $1 AND event_type = $2 AND aggregate_type = 'monthly_reputation_source'`,
    [request.eventId, MONTHLY_REPUTATION_REQUEST_EVENT],
  );
  const event = canonical.rows[0];
  if (!event || event.payload?.sourceId !== event.aggregate_id) throw new Error('monthly_reputation_canonical_event_required');
  const source = await client.query<SourceRow>(
    `SELECT * FROM trust.monthly_reputation_sources WHERE id = $1 AND subject_user_id = $2 AND policy_version = $3`,
    [event.aggregate_id, event.actor_id, MONTHLY_REPUTATION_POLICY_VERSION],
  );
  const row = source.rows[0];
  if (!row) throw new Error('monthly_reputation_source_not_found');
  if (row.catalogue_hash !== MONTHLY_REPUTATION_CATALOGUE_HASH || await inputDigest(row.input) !== row.input_digest) {
    throw new Error('monthly_reputation_source_integrity_failed');
  }
  const calculation = calculateMonthlyReputation(row.input, request.evaluatedAt);
  const inserted = await client.query(
    `INSERT INTO trust.monthly_reputation_assessments
       (id, source_id, calculation, weekly_points, monthly_points, quarterly_points, source_score, level)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
     ON CONFLICT (source_id) DO NOTHING`,
    [request.assessmentId, row.id, JSON.stringify(calculation), calculation.weeklyPoints,
      calculation.monthlyPoints, calculation.quarterlyPoints, calculation.sourceScore, calculation.level],
  );
  const created = inserted.rowCount === 1;
  if (created) {
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'trust.monthly_assessment.recorded', 'monthly_reputation_assessment', $2, $3, $4::jsonb)`,
      [request.resultEventId, request.assessmentId, row.subject_user_id,
        JSON.stringify({ assessmentId: request.assessmentId, sourceId: row.id, mode: 'shadow' })],
    );
  }
  const stored = await client.query<{ id: string; calculation: MonthlyReputationCalculation }>(
    'SELECT id, calculation FROM trust.monthly_reputation_assessments WHERE source_id = $1', [row.id],
  );
  if (!stored.rows[0]) throw new Error('monthly_reputation_assessment_unavailable');
  await client.query(
    `UPDATE system.outbox_events SET last_error_code = NULL
      WHERE id = $1 AND last_error_code = $2`, [request.eventId, MONTHLY_REPUTATION_PAUSED],
  );
  return { id: stored.rows[0].id, sourceId: row.id, mode: 'shadow', calculation: stored.rows[0].calculation, created };
}
