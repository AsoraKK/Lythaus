import {
  calculateMonthlyReputation,
  MONTHLY_REPUTATION_POLICY_VERSION,
  MONTHLY_REPUTATION_CATALOGUE_HASH,
  type MonthlyReputationCalculation,
  type MonthlyReputationInput,
} from '@lythaus/contracts';
import type { Client } from 'pg';
import {
  previewProspectiveMonthlyReputation, prospectiveReputationLevelForScore,
  PROSPECTIVE_REPUTATION_POLICY_VERSION, PROSPECTIVE_REPUTATION_CATALOGUE_HASH,
} from '../../contracts/src/monthly-reputation-prospective.ts';

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
  input: MonthlyReputationInput | PreparationInput;
  catalogue_hash: string;
  policy_version: string;
}

type PreparationInput = Omit<MonthlyReputationInput, 'policyVersion' | 'quarterlyPoints'> & {
  policyVersion: typeof PROSPECTIVE_REPUTATION_POLICY_VERSION;
  quarterlyPoints: 0 | 150 | 1_000 | 1_150;
  emailPoints: 0 | 1_000;
  suggestionPoints: 0 | 150;
  preparationOnly: true;
};
type PreparationCalculation = Omit<MonthlyReputationCalculation, 'policyVersion' | 'quarterlyPoints'>
  & Pick<PreparationInput, 'policyVersion' | 'quarterlyPoints' | 'emailPoints' | 'suggestionPoints' | 'preparationOnly'>;
export interface MonthlyReputationDisposablePreparation {
  mode: 'disposable_local_pg17';
  evaluatedAt?: string;
}
interface SourceRequest {
  id: string; subjectUserId: string; eventId: string; expectedPreviousId: string | null;
  reasonCode: string; evaluatedAt: string;
}
interface AssessmentRequest {
  eventId: string; assessmentId: string; resultEventId: string; evaluatedAt: string;
}
interface PreparationAssessment extends Omit<MonthlyReputationShadowAssessment, 'calculation'> {
  calculation: PreparationCalculation;
  preparationOnly: true;
  runtimeActivationAllowed: false;
  appliedPoints: 0;
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

async function inputDigest(input: MonthlyReputationInput | PreparationInput): Promise<string> {
  const values: unknown[] = [input.policyVersion, input.sourceMonth, input.sourceCutoff, input.periodPolicyVersion,
    input.weeks.map((week) => [week.weekId, week.revision, week.ownerMonth, week.startsAt,
      week.endsAt, week.lockedAt, week.state, week.points]), input.monthlyPoints, input.quarterlyPoints];
  if (input.policyVersion === PROSPECTIVE_REPUTATION_POLICY_VERSION) {
    values.push([input.emailPoints, input.suggestionPoints, input.preparationOnly]);
  }
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

function calculatePreparationInput(input: PreparationInput, evaluatedAt: string): PreparationCalculation {
  if (input.policyVersion !== PROSPECTIVE_REPUTATION_POLICY_VERSION || input.preparationOnly !== true
    || (input.emailPoints !== 0 && input.emailPoints !== 1_000)
    || (input.suggestionPoints !== 0 && input.suggestionPoints !== 150)
    || input.quarterlyPoints !== input.emailPoints + input.suggestionPoints) {
    throw new Error('monthly_reputation_preparation_components_invalid');
  }
  // Revalidate the immutable summary, reusing the reviewed week/month calculator.
  // Qualification is supplied by the existing private preview at source admission.
  const inherited = calculateMonthlyReputation({ ...input,
    policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, quarterlyPoints: 0 }, evaluatedAt);
  const sourceScore = inherited.sourceScore + input.quarterlyPoints;
  return { ...inherited, policyVersion: PROSPECTIVE_REPUTATION_POLICY_VERSION,
    quarterlyPoints: input.quarterlyPoints, emailPoints: input.emailPoints,
    suggestionPoints: input.suggestionPoints, sourceScore,
    level: prospectiveReputationLevelForScore(sourceScore), preparationOnly: true };
}

async function disposablePreparationAllowed(client: Client, context?: MonthlyReputationDisposablePreparation) {
  if (!context) return false;
  const connection = (client as Client & {
    connectionParameters?: { host: string; database: string };
  }).connectionParameters;
  if (context.mode !== 'disposable_local_pg17' || !connection
    || !['127.0.0.1', 'localhost', '::1'].includes(connection.host)
    || (connection.database !== 'lythaus_monthly_test'
      && !(connection.database === 'postgres' && process.env.GITHUB_ACTIONS === 'true'))) {
    throw new Error('monthly_reputation_preparation_requires_disposable_local_target');
  }
  const target = (await client.query<{ database: string; version: number }>(
    `SELECT current_database() AS database, current_setting('server_version_num')::integer AS version`,
  )).rows[0];
  if (target?.database !== connection.database || target.version < 170000 || target.version >= 180000) {
    throw new Error('monthly_reputation_preparation_requires_disposable_pg17');
  }
  const capability = (await client.query<{ available: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('trust.monthly_reputation_assessments')
        AND attname = 'policy_version' AND NOT attisdropped)
    AND (SELECT count(*) FROM pg_constraint WHERE convalidated AND (
      (conrelid = to_regclass('trust.monthly_reputation_sources')
        AND conname IN ('monthly_reputation_source_policy_catalogue_v2', 'monthly_reputation_source_preparation_components_v2'))
      OR (conrelid = to_regclass('trust.monthly_reputation_assessments')
        AND conname IN ('monthly_reputation_assessment_source_policy_v2', 'monthly_reputation_assessment_caps_v2'))
    )) = 4 AS available`)).rows[0];
  return capability?.available === true;
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

export async function recordMonthlyReputationSource(client: Client, request: SourceRequest & {
  input: MonthlyReputationInput;
}): Promise<{ id: string; revision: number; created: boolean }> {
  if (!await monthlyReputationShadowEnabled(client)) throw new Error('monthly_reputation_shadow_disabled');
  const input = canonicalInput(calculateMonthlyReputation(request.input, request.evaluatedAt));
  return recordCanonicalSource(client, request, input, MONTHLY_REPUTATION_CATALOGUE_HASH);
}

export async function recordPreparedMonthlyReputationSource(client: Client, request: SourceRequest & {
  preview: Parameters<typeof previewProspectiveMonthlyReputation>[0];
}, context?: MonthlyReputationDisposablePreparation) {
  if (!context || !await monthlyReputationShadowEnabled(client)
    || !await disposablePreparationAllowed(client, context)) return null;
  if (request.preview.subjectUserId !== request.subjectUserId) throw new Error('monthly_reputation_preparation_subject_mismatch');
  const preview = previewProspectiveMonthlyReputation(request.preview, request.evaluatedAt);
  if (!preview.proposedCalculation) return null;
  const calculation = preview.proposedCalculation;
  const input = { ...canonicalInput({ ...calculation,
    policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, quarterlyPoints: 0 }),
    policyVersion: PROSPECTIVE_REPUTATION_POLICY_VERSION, quarterlyPoints: calculation.quarterlyPoints,
    emailPoints: calculation.emailPoints, suggestionPoints: calculation.suggestionPoints,
    preparationOnly: true } as PreparationInput;
  calculatePreparationInput(input, request.evaluatedAt);
  const account = await client.query(`SELECT 1 FROM identity.users
    WHERE id = $1 AND status <> 'deleted' AND deleted_at IS NULL`, [request.subjectUserId]);
  if (!account.rowCount) throw new Error('monthly_reputation_preparation_subject_unavailable');
  const result = await recordCanonicalSource(client, request, input, PROSPECTIVE_REPUTATION_CATALOGUE_HASH);
  return { ...result, preparationOnly: true as const, runtimeActivationAllowed: false as const, appliedPoints: 0 as const };
}

async function recordCanonicalSource(client: Client, request: SourceRequest,
  input: MonthlyReputationInput | PreparationInput, catalogueHash: string) {
  for (const id of [request.id, request.subjectUserId, request.eventId]) requireUuidV7(id);
  if (request.expectedPreviousId !== null) requireUuidV7(request.expectedPreviousId);
  if (!/^[a-z][a-z0-9_]{0,99}$/.test(request.reasonCode)) throw new Error('monthly_reputation_reason_invalid');
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
      || row.catalogue_hash !== catalogueHash || row.policy_version !== input.policyVersion) {
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
      catalogueHash, revision, request.expectedPreviousId, request.reasonCode,
      JSON.stringify(input), digest],
  );
  await client.query(
    `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
     VALUES ($1, $2, 'monthly_reputation_source', $3, $4, $5::jsonb)`,
    [request.eventId, MONTHLY_REPUTATION_REQUEST_EVENT, request.id, request.subjectUserId,
      JSON.stringify(input.policyVersion === MONTHLY_REPUTATION_POLICY_VERSION
        ? { sourceId: request.id }
        : { sourceId: request.id, policyVersion: input.policyVersion, preparationOnly: true })],
  );
  return { id: request.id, revision, created: true };
}

export async function assessMonthlyReputationSource(client: Client, request: AssessmentRequest): Promise<MonthlyReputationShadowAssessment | null> {
  return assessCanonicalSource(client, request, false) as Promise<MonthlyReputationShadowAssessment | null>;
}

export async function assessPreparedMonthlyReputationSource(client: Client, request: AssessmentRequest,
  context?: MonthlyReputationDisposablePreparation): Promise<PreparationAssessment | null> {
  if (!context || !await monthlyReputationShadowEnabled(client)
    || !await disposablePreparationAllowed(client, context)) return null;
  return assessCanonicalSource(client, request, true) as Promise<PreparationAssessment | null>;
}

async function assessCanonicalSource(client: Client, request: AssessmentRequest, preparation: boolean) {
  if (!await monthlyReputationShadowEnabled(client)) return null;
  for (const id of [request.eventId, request.assessmentId, request.resultEventId]) requireUuidV7(id);
  const canonical = await client.query<{ aggregate_id: string; actor_id: string; payload: { sourceId?: string; policyVersion?: string } }>(
    `SELECT aggregate_id, actor_id, payload FROM system.outbox_events
      WHERE id = $1 AND event_type = $2 AND aggregate_type = 'monthly_reputation_source'`,
    [request.eventId, MONTHLY_REPUTATION_REQUEST_EVENT],
  );
  const event = canonical.rows[0];
  if (!event || event.payload?.sourceId !== event.aggregate_id) throw new Error('monthly_reputation_canonical_event_required');
  const policyVersion = preparation ? PROSPECTIVE_REPUTATION_POLICY_VERSION : MONTHLY_REPUTATION_POLICY_VERSION;
  const eventPolicy = event.payload.policyVersion ?? MONTHLY_REPUTATION_POLICY_VERSION;
  if (eventPolicy === PROSPECTIVE_REPUTATION_POLICY_VERSION && !preparation) return null;
  if (eventPolicy !== policyVersion) throw new Error('monthly_reputation_event_policy_mismatch');
  const source = await client.query<SourceRow>(
    `SELECT * FROM trust.monthly_reputation_sources WHERE id = $1 AND subject_user_id = $2 AND policy_version = $3`,
    [event.aggregate_id, event.actor_id, policyVersion],
  );
  const row = source.rows[0];
  if (!row) throw new Error('monthly_reputation_source_not_found');
  const catalogueHash = preparation ? PROSPECTIVE_REPUTATION_CATALOGUE_HASH : MONTHLY_REPUTATION_CATALOGUE_HASH;
  if (row.catalogue_hash !== catalogueHash || row.input.policyVersion !== policyVersion
    || await inputDigest(row.input) !== row.input_digest) {
    throw new Error('monthly_reputation_source_integrity_failed');
  }
  const calculation = preparation
    ? calculatePreparationInput(row.input as PreparationInput, request.evaluatedAt)
    : calculateMonthlyReputation(row.input as MonthlyReputationInput, request.evaluatedAt);
  const policyColumn = (await client.query<{ available: boolean }>(`SELECT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('trust.monthly_reputation_assessments')
      AND attname = 'policy_version' AND NOT attisdropped) AS available`)).rows[0]?.available;
  if (preparation && !policyColumn) return null;
  const inserted = await client.query(
    `INSERT INTO trust.monthly_reputation_assessments
       (id, source_id, calculation, weekly_points, monthly_points, quarterly_points, source_score, level${policyColumn ? ', policy_version' : ''})
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8${policyColumn ? ', $9' : ''})
     ON CONFLICT (source_id) DO NOTHING`,
    [request.assessmentId, row.id, JSON.stringify(calculation), calculation.weeklyPoints,
      calculation.monthlyPoints, calculation.quarterlyPoints, calculation.sourceScore, calculation.level,
      ...(policyColumn ? [policyVersion] : [])],
  );
  const created = inserted.rowCount === 1;
  if (created) {
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'trust.monthly_assessment.recorded', 'monthly_reputation_assessment', $2, $3, $4::jsonb)`,
      [request.resultEventId, request.assessmentId, row.subject_user_id,
        JSON.stringify(preparation
          ? { assessmentId: request.assessmentId, sourceId: row.id, mode: 'shadow', policyVersion, preparationOnly: true }
          : { assessmentId: request.assessmentId, sourceId: row.id, mode: 'shadow' })],
    );
  }
  const stored = await client.query<{ id: string; calculation: MonthlyReputationCalculation | PreparationCalculation; policy_version: string | null }>(
    `SELECT id, calculation, to_jsonb(assessment) ->> 'policy_version' AS policy_version
      FROM trust.monthly_reputation_assessments assessment WHERE source_id = $1`, [row.id],
  );
  if (!stored.rows[0]) throw new Error('monthly_reputation_assessment_unavailable');
  if ((stored.rows[0].policy_version ?? MONTHLY_REPUTATION_POLICY_VERSION) !== policyVersion) {
    throw new Error('monthly_reputation_assessment_policy_mismatch');
  }
  await client.query(
    `UPDATE system.outbox_events SET last_error_code = NULL
      WHERE id = $1 AND last_error_code = $2`, [request.eventId, MONTHLY_REPUTATION_PAUSED],
  );
  return { id: stored.rows[0].id, sourceId: row.id, mode: 'shadow' as const, calculation: stored.rows[0].calculation, created,
    ...(preparation ? { preparationOnly: true, runtimeActivationAllowed: false, appliedPoints: 0 } : {}) };
}
