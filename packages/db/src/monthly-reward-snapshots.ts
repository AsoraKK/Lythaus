import type { Client } from 'pg';
import { uuidv7 } from '@lythaus/security';
import { MONTHLY_REPUTATION_CATALOGUE_HASH, MONTHLY_REPUTATION_POLICY_VERSION, nextReputationMonth, requireSourceMonth } from '../../contracts/src/monthly-reputation-policy.ts';
import { MONTHLY_REPUTATION_DECISIONS } from '../../contracts/src/monthly-reputation-decisions.ts';

export const MONTHLY_REWARD_SNAPSHOT_FLAG = 'trust.monthly_reward_snapshots';
export const MONTHLY_REWARD_SNAPSHOT_EVENT = 'trust.monthly_reward_snapshot.recorded';
export const MONTHLY_REWARD_CORRECTION_EVENT = 'trust.monthly_reward_snapshot.correction_approved';
export interface MonthlyRewardSnapshotConfiguration {
  version: string; mode: 'shadow' | 'confirmed'; first_source_month: Date;
  weekly_rules_version: string; maintenance_rules_version: string;
  decision_approvals: Record<string, unknown>;
}
interface Snapshot {
  id: string; subject_user_id: string; source_month: Date; effective_month: Date;
  mode: 'shadow' | 'confirmed'; revision: number; assessment_id: string; source_id: string;
  source_revision: number; source_score: number; level: number; rules_version: string;
}
function requireUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))
    throw new Error('monthly_reward_id_invalid');
}
async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
}
export async function monthlyRewardSnapshotConfiguration(client: Client, version?: string) {
  if (!version) return null;
  const installed = await client.query<{ available: boolean }>(`SELECT
    to_regclass('trust.monthly_reputation_sources') IS NOT NULL
      AND to_regclass('trust.monthly_reputation_assemblies') IS NOT NULL
      AND to_regclass('trust.monthly_reputation_assessments') IS NOT NULL
      AND to_regclass('trust.monthly_reward_snapshots') IS NOT NULL
      AND to_regclass('trust.monthly_reward_snapshot_rule_sets') IS NOT NULL
      AND to_regprocedure('trust.lock_monthly_reward_configuration()') IS NOT NULL
      AND to_regprocedure('trust.lock_monthly_reward_subject(uuid)') IS NOT NULL AS available`);
  if (!installed.rows[0]?.available) return null;
  if (!(await client.query('SELECT 1 FROM system.feature_flags WHERE flag_key = $1 AND policy_version = $2',
    [MONTHLY_REWARD_SNAPSHOT_FLAG,MONTHLY_REPUTATION_POLICY_VERSION])).rowCount) return null;
  const flags = await client.query<{ enabled: boolean; policy_version: string }>('SELECT * FROM trust.lock_monthly_reward_configuration()');
  if (flags.rowCount !== 2 || flags.rows.some(flag => !flag.enabled || flag.policy_version !== MONTHLY_REPUTATION_POLICY_VERSION)) return null;
  const rules = (await client.query<MonthlyRewardSnapshotConfiguration>(`SELECT version,mode,first_source_month,
    weekly_rules_version,maintenance_rules_version,decision_approvals FROM trust.monthly_reward_snapshot_rule_sets
    WHERE version = $1 AND policy_version = $2 AND catalogue_hash = $3
      AND collection_privacy_version = 'monthly-privacy-v1' AND approved_by IS NOT NULL
      AND approved_at <= clock_timestamp() AND approval_reference IS NOT NULL`,
  [version,MONTHLY_REPUTATION_POLICY_VERSION,MONTHLY_REPUTATION_CATALOGUE_HASH])).rows[0];
  if (!rules || (rules.mode === 'confirmed' && MONTHLY_REPUTATION_DECISIONS.some(id =>
    typeof rules.decision_approvals[id] !== 'string' || (rules.decision_approvals[id] as string).trim().length < 1
    || (rules.decision_approvals[id] as string).length > 500))) return null;
  return rules;
}
async function latestSnapshot(client: Client, subjectId: string, effectiveMonth: string, mode: string) {
  return (await client.query<Snapshot>(`SELECT * FROM trust.monthly_reward_snapshots
    WHERE subject_user_id = $1 AND effective_month = $2::date AND mode = $3 ORDER BY revision DESC LIMIT 1`,
  [subjectId,`${effectiveMonth}-01`,mode])).rows[0];
}
interface AssessedSource {
  assessment_id: string; source_id: string; subject_user_id: string; source_month: Date;
  revision: number; source_score: number; level: number; catalogue_hash: string;
  weekly_rules_version: string; maintenance_rules_version: string; report: { mode?: string };
}
async function assessedSource(client: Client, assessmentId: string) {
  return (await client.query<AssessedSource>(`SELECT assessment.id AS assessment_id,source.id AS source_id,
    source.subject_user_id,source.source_month,source.revision,assessment.source_score,assessment.level,source.catalogue_hash,
    assembly.weekly_rules_version,assembly.rules_version AS maintenance_rules_version,assembly.report
    FROM trust.monthly_reputation_assessments assessment
    JOIN trust.monthly_reputation_sources source ON source.id = assessment.source_id
    JOIN trust.monthly_reputation_assemblies assembly ON assembly.source_id = source.id
    WHERE assessment.id = $1 AND source.policy_version = $2 AND assessment.mode = 'shadow'`,
  [assessmentId,MONTHLY_REPUTATION_POLICY_VERSION])).rows[0];
}
async function lockSnapshotPeriod(client: Client, subjectId: string, month: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`monthly-reputation:${subjectId}:${month}`]);
  if (!(await client.query<{ allowed: boolean }>('SELECT trust.lock_monthly_reward_subject($1) AS allowed',[subjectId])).rows[0]?.allowed)
    throw new Error('monthly_reward_subject_unavailable');
}
async function validateSource(client: Client, source: AssessedSource, configuration: MonthlyRewardSnapshotConfiguration) {
  const month = source.source_month.toISOString().slice(0,7);
  if (source.catalogue_hash !== MONTHLY_REPUTATION_CATALOGUE_HASH || source.report.mode !== 'shadow'
    || source.weekly_rules_version !== configuration.weekly_rules_version
    || source.maintenance_rules_version !== configuration.maintenance_rules_version) throw new Error('monthly_reward_source_policy_mismatch');
  const latest = (await client.query<{ id: string }>(`SELECT id FROM trust.monthly_reputation_sources
    WHERE subject_user_id = $1 AND source_month = $2 AND policy_version = $3 ORDER BY revision DESC LIMIT 1`,
  [source.subject_user_id,source.source_month,MONTHLY_REPUTATION_POLICY_VERSION])).rows[0];
  if (latest?.id !== source.source_id) throw new Error('monthly_reward_source_superseded');
  if (!(await client.query<{ settled: boolean }>(`SELECT (($1::date + interval '1 month') AT TIME ZONE 'UTC')
      + (configuration ->> 'monthSettlementHours')::integer * interval '1 hour' <= clock_timestamp() AS settled
    FROM trust.monthly_maintenance_rule_sets WHERE version = $2`,
  [source.source_month,configuration.maintenance_rules_version])).rows[0]?.settled) throw new Error('monthly_reward_source_not_settled');
  return month;
}
async function insertSnapshot(client: Client, configuration: MonthlyRewardSnapshotConfiguration, source: AssessedSource,
  sourceEventId: string, previous?: Snapshot, correctionId?: string) {
  const id = uuidv7(), eventId = uuidv7(), sourceMonth = source.source_month.toISOString().slice(0,7);
  const effectiveMonth = nextReputationMonth(sourceMonth), revision = (previous?.revision ?? 0) + 1;
  await client.query(`INSERT INTO trust.monthly_reward_snapshots
    (id,subject_user_id,source_month,effective_month,rules_version,policy_version,mode,revision,supersedes_id,
      assessment_id,source_id,source_revision,source_score,level,correction_id,source_event_id)
    VALUES ($1,$2,$3::date,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
  [id,source.subject_user_id,`${sourceMonth}-01`,`${effectiveMonth}-01`,configuration.version,MONTHLY_REPUTATION_POLICY_VERSION,
    configuration.mode,revision,previous?.id ?? null,source.assessment_id,source.source_id,source.revision,
    source.source_score,source.level,correctionId ?? null,sourceEventId]);
  await client.query(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload)
    VALUES ($1,$2,'monthly_reward_snapshot',$3,$4,$5::jsonb)`,
  [eventId,MONTHLY_REWARD_SNAPSHOT_EVENT,id,source.subject_user_id,JSON.stringify({ snapshotId:id,revision,mode:configuration.mode,
    sourceMonth,effectiveMonth,policyVersion:MONTHLY_REPUTATION_POLICY_VERSION })]);
  return { id,revision,sourceMonth,effectiveMonth,level:source.level,sourceScore:source.source_score,mode:configuration.mode,created:true };
}

export async function publishMonthlyRewardSnapshot(client: Client, input: { eventId: string; rulesVersion?: string }) {
  const configuration = await monthlyRewardSnapshotConfiguration(client,input.rulesVersion);
  if (!configuration) return null;
  requireUuid(input.eventId);
  const event = (await client.query<{ aggregate_id: string; actor_id: string; payload: { assessmentId?: string; sourceId?: string; mode?: string } }>(
    `SELECT aggregate_id,actor_id,payload FROM system.outbox_events WHERE id = $1
      AND event_type = 'trust.monthly_assessment.recorded' AND aggregate_type = 'monthly_reputation_assessment'`,[input.eventId])).rows[0];
  const source = event ? await assessedSource(client,event.aggregate_id) : undefined;
  if (!event || !source || event.actor_id !== source.subject_user_id || event.payload.assessmentId !== source.assessment_id
    || event.payload.sourceId !== source.source_id || event.payload.mode !== 'shadow') throw new Error('monthly_reward_canonical_assessment_required');
  const month = source.source_month.toISOString().slice(0,7);
  await lockSnapshotPeriod(client,source.subject_user_id,month);
  const receipt = (await client.query<{ state: string; snapshot_id: string | null }>(
    'SELECT state,snapshot_id FROM trust.monthly_reward_snapshot_receipts WHERE event_id = $1 AND rules_version = $2',
    [input.eventId,configuration.version])).rows[0];
  if (receipt) return { state:receipt.state,id:receipt.snapshot_id,mode:configuration.mode,created:false };
  const recordReceipt = async (state: string, snapshotId: string | null) => client.query(`INSERT INTO trust.monthly_reward_snapshot_receipts
    (event_id,rules_version,mode,subject_user_id,assessment_id,snapshot_id,state) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [input.eventId,configuration.version,configuration.mode,source.subject_user_id,source.assessment_id,snapshotId,state]);
  const replay = (await client.query<Snapshot>('SELECT * FROM trust.monthly_reward_snapshots WHERE assessment_id = $1 AND mode = $2',
    [source.assessment_id,configuration.mode])).rows[0];
  if (replay) {
    const state = replay.rules_version === configuration.version ? 'published' : 'snapshot_policy_requires_review';
    await recordReceipt(state,replay.id); return { state,id:replay.id,revision:replay.revision,mode:replay.mode,created:false };
  }
  if (source.source_month < configuration.first_source_month) {
    await recordReceipt('before_cutover',null); return { state:'before_cutover' as const,mode:configuration.mode,created:false };
  }
  try { await validateSource(client,source,configuration); } catch (error) {
    if (!(error instanceof Error) || error.message !== 'monthly_reward_source_superseded') throw error;
    await recordReceipt('superseded',null); return { state:'superseded' as const,mode:configuration.mode,created:false };
  }
  const previous = await latestSnapshot(client,source.subject_user_id,nextReputationMonth(month),configuration.mode);
  if (previous) {
    const state = previous.rules_version === configuration.version ? 'correction_approval_pending' : 'snapshot_policy_requires_review';
    await recordReceipt(state,previous.id);
    return { state,id:previous.id,revision:previous.revision,mode:previous.mode,created:false };
  }
  const snapshot = await insertSnapshot(client,configuration,source,input.eventId);
  await recordReceipt('published',snapshot.id);
  return snapshot;
}

export async function approveMonthlyRewardSnapshotCorrection(client: Client, input: {
  actorId: string; subjectId: string; snapshotId: string; assessmentId: string; rulesVersion: string;
  expectedSnapshotRevision: number; reasonCode: string; evidenceReference: string; idempotencyKey: string;
}) {
  for (const value of [input.actorId,input.subjectId,input.snapshotId,input.assessmentId,input.idempotencyKey]) requireUuid(value);
  if (!Number.isSafeInteger(input.expectedSnapshotRevision) || input.expectedSnapshotRevision < 1
    || !/^[a-z][a-z0-9_]{1,99}$/.test(input.reasonCode) || typeof input.evidenceReference !== 'string'
    || input.evidenceReference.trim().length < 1 || input.evidenceReference.length > 500) throw new Error('monthly_reward_correction_invalid');
  const configuration = await monthlyRewardSnapshotConfiguration(client,input.rulesVersion);
  if (!configuration) throw new Error('monthly_reward_snapshot_unavailable');
  const source = await assessedSource(client,input.assessmentId);
  if (!source || source.subject_user_id !== input.subjectId) throw new Error('monthly_reward_correction_scope_invalid');
  const month = source.source_month.toISOString().slice(0,7);
  await lockSnapshotPeriod(client,input.subjectId,month);
  if (!(await client.query<{ allowed: boolean }>('SELECT trust.lock_monthly_reward_reviewer($1,$2) AS allowed',
    [input.actorId,input.subjectId])).rows[0]?.allowed) throw new Error('monthly_reward_correction_actor_not_allowed');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`monthly-reward-correction:${input.actorId}:${input.idempotencyKey}`]);
  const requestDigest = await digest([input.subjectId,input.snapshotId,input.assessmentId,input.rulesVersion,
    input.expectedSnapshotRevision,input.reasonCode,input.evidenceReference]);
  const replay = (await client.query<{ id: string; source_event_id: string; request_digest: string }>(
    'SELECT id,source_event_id,request_digest FROM trust.monthly_reward_snapshot_corrections WHERE actor_id = $1 AND idempotency_key = $2',
    [input.actorId,input.idempotencyKey])).rows[0];
  if (replay) {
    if (replay.request_digest !== requestDigest) throw new Error('monthly_reward_idempotency_reused');
    return { id:replay.id,sourceEventId:replay.source_event_id,created:false };
  }
  await validateSource(client,source,configuration);
  if (source.source_month < configuration.first_source_month) throw new Error('monthly_reward_correction_scope_invalid');
  const previous = await latestSnapshot(client,input.subjectId,nextReputationMonth(month),configuration.mode);
  if (previous?.id !== input.snapshotId || previous.revision !== input.expectedSnapshotRevision
    || previous.assessment_id === input.assessmentId || previous.rules_version !== input.rulesVersion)
    throw new Error('monthly_reward_snapshot_revision_conflict');
  const id = uuidv7(), eventId = uuidv7();
  await client.query(`INSERT INTO trust.monthly_reward_snapshot_corrections
    (id,subject_user_id,snapshot_id,target_assessment_id,rules_version,actor_id,reason_code,evidence_reference,
      idempotency_key,request_digest,source_event_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
  [id,input.subjectId,input.snapshotId,input.assessmentId,input.rulesVersion,input.actorId,input.reasonCode,input.evidenceReference,
    input.idempotencyKey,requestDigest,eventId]);
  await client.query(`INSERT INTO system.outbox_events (id,event_type,aggregate_type,aggregate_id,actor_id,payload,created_at)
    SELECT $1,$2,'monthly_reward_snapshot_correction',id,$3,$4::jsonb,recorded_at
    FROM trust.monthly_reward_snapshot_corrections WHERE id = $5`,
  [eventId,MONTHLY_REWARD_CORRECTION_EVENT,input.actorId,JSON.stringify({ correctionId:id,policyVersion:MONTHLY_REPUTATION_POLICY_VERSION }),id]);
  return { id,sourceEventId:eventId,created:true };
}

export async function applyMonthlyRewardSnapshotCorrection(client: Client, input: { eventId: string; rulesVersion?: string }) {
  const configuration = await monthlyRewardSnapshotConfiguration(client,input.rulesVersion);
  if (!configuration) return null;
  requireUuid(input.eventId);
  const correction = (await client.query<{ id: string; subject_user_id: string; snapshot_id: string; target_assessment_id: string }>(
    `SELECT correction.id,correction.subject_user_id,correction.snapshot_id,correction.target_assessment_id
    FROM trust.monthly_reward_snapshot_corrections correction JOIN system.outbox_events event ON event.id = correction.source_event_id
    WHERE event.id = $1 AND event.event_type = $2 AND event.aggregate_type = 'monthly_reward_snapshot_correction'
      AND event.aggregate_id = correction.id AND event.actor_id = correction.actor_id AND event.created_at = correction.recorded_at
      AND event.payload @> jsonb_build_object('correctionId',correction.id::text,'policyVersion',$3::text)
      AND correction.rules_version = $4`,
  [input.eventId,MONTHLY_REWARD_CORRECTION_EVENT,MONTHLY_REPUTATION_POLICY_VERSION,configuration.version])).rows[0];
  if (!correction) throw new Error('monthly_reward_canonical_correction_required');
  const source = await assessedSource(client,correction.target_assessment_id);
  if (!source || source.subject_user_id !== correction.subject_user_id) throw new Error('monthly_reward_correction_scope_invalid');
  const month = source.source_month.toISOString().slice(0,7);
  await lockSnapshotPeriod(client,source.subject_user_id,month);
  const receipt = (await client.query<{ state: string; snapshot_id: string | null }>(
    'SELECT state,snapshot_id FROM trust.monthly_reward_snapshot_receipts WHERE event_id = $1 AND rules_version = $2',
    [input.eventId,configuration.version])).rows[0];
  if (receipt) return { state:receipt.state,id:receipt.snapshot_id,mode:configuration.mode,created:false };
  const recordReceipt = async (state: string, snapshotId: string | null) => client.query(`INSERT INTO trust.monthly_reward_snapshot_receipts
    (event_id,rules_version,mode,subject_user_id,assessment_id,snapshot_id,state) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [input.eventId,configuration.version,configuration.mode,source.subject_user_id,source.assessment_id,snapshotId,state]);
  const replay = (await client.query<Snapshot>('SELECT * FROM trust.monthly_reward_snapshots WHERE correction_id = $1',[correction.id])).rows[0];
  if (replay) { await recordReceipt('published',replay.id); return { id:replay.id,revision:replay.revision,mode:replay.mode,created:false }; }
  try { await validateSource(client,source,configuration); } catch (error) {
    if (!(error instanceof Error) || error.message !== 'monthly_reward_source_superseded') throw error;
    await recordReceipt('superseded',null); return { state:'superseded' as const,mode:configuration.mode,created:false };
  }
  const previous = await latestSnapshot(client,source.subject_user_id,nextReputationMonth(month),configuration.mode);
  if (previous?.id !== correction.snapshot_id) {
    await recordReceipt('superseded',null); return { state:'superseded' as const,mode:configuration.mode,created:false };
  }
  const snapshot = await insertSnapshot(client,configuration,source,input.eventId,previous,correction.id);
  await recordReceipt('published',snapshot.id);
  return snapshot;
}

export async function readOwnMonthlyRewardSnapshot(client: Client, input: { subjectId: string; rulesVersion?: string; effectiveMonth?: string }) {
  requireUuid(input.subjectId);
  let month = input.effectiveMonth ?? new Date().toISOString().slice(0,7);
  requireSourceMonth(month);
  if (!input.rulesVersion) return { state:'unavailable' as const,reasonCode:'approval_unavailable',effectiveMonth:month };
  const currentMonth = (await client.query<{ month: string }>("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM') AS month")).rows[0].month;
  month = input.effectiveMonth ?? currentMonth;
  requireSourceMonth(month);
  const configuration = await monthlyRewardSnapshotConfiguration(client,input.rulesVersion);
  if (!configuration) return { state:'unavailable' as const,reasonCode:'approval_unavailable',effectiveMonth:month };
  if (!(await client.query<{ allowed: boolean }>('SELECT trust.lock_monthly_reward_subject($1) AS allowed',[input.subjectId])).rows[0]?.allowed)
    throw new Error('monthly_reward_subject_unavailable');
  if (month > currentMonth) return { state:'pending' as const,reasonCode:'future_month_unconfirmed',effectiveMonth:month };
  if (month < nextReputationMonth(configuration.first_source_month.toISOString().slice(0,7)))
    return { state:'unavailable' as const,reasonCode:'before_policy_cutover',effectiveMonth:month };
  const snapshot = await latestSnapshot(client,input.subjectId,month,configuration.mode);
  if (snapshot && snapshot.rules_version !== configuration.version)
    return { state:'pending' as const,reasonCode:'snapshot_policy_requires_review',effectiveMonth:month };
  if (snapshot) return { state:configuration.mode,reasonCode:'source_month_assessed',effectiveMonth:month,
    sourceMonth:snapshot.source_month.toISOString().slice(0,7),snapshotId:snapshot.id,revision:snapshot.revision,
    sourceRevision:snapshot.source_revision,sourceScore:snapshot.source_score,level:snapshot.level,
    policyVersion:MONTHLY_REPUTATION_POLICY_VERSION };
  const anyHistory = await client.query(`SELECT 1 FROM trust.monthly_reputation_sources WHERE subject_user_id = $1 LIMIT 1`,[input.subjectId]);
  if (anyHistory.rowCount) return { state:'pending' as const,reasonCode:'settlement_pending',effectiveMonth:month };
  return { state:'pending' as const,reasonCode:'no_previous_assessment',effectiveMonth:month,level:1,levelKind:'unassessed_default',sourceScore:null,
    sourceMonth:null,snapshotId:null,revision:0,policyVersion:MONTHLY_REPUTATION_POLICY_VERSION };
}
