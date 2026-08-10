import {
  calculateReputationImpact,
  evaluateReputation,
  REPUTATION_EVENT_CATALOG,
  REPUTATION_PILLAR_BASELINES,
  REPUTATION_POLICY,
  type ReputationEventDisposition,
  type ReputationLevel,
  type ReputationPillar,
  type ReputationPillarScores,
  type ReputationSignalType,
} from '@lythaus/contracts';
import type { Client } from 'pg';

export interface ReputationSignalInput {
  id: string;
  subjectUserId: string;
  signalType: ReputationSignalType;
  sourceEventId: string;
  contentId?: string;
  moderationDecisionId?: string;
  appealId?: string;
  reversalReference?: string;
  occurredAt: string;
}

export interface ReputationEventRecord {
  id: string;
  subjectUserId: string;
  contentId: string | null;
  eventType: ReputationSignalType;
  pillar: ReputationPillar | null;
  impact: number;
  policyVersion: string;
  sourceEventId: string;
  moderationDecisionId: string | null;
  appealId: string | null;
  status: 'effective' | 'withheld' | 'reversed' | 'expired';
  explanationCode: string;
  reversalReference: string | null;
  createdAt: string;
}

export interface ReputationProfileSnapshot {
  userId: string;
  policyVersion: string;
  currentLevel: ReputationLevel;
  totalScore: number;
  pillarScores: ReputationPillarScores;
  activeDays: number;
  activeWeeks: number;
  qualifyingHumanContributions: number;
  promotionBlockers: readonly string[];
  status: 'active' | 'restricted' | 'suspended' | 'under_investigation';
  evaluatedAt: string;
}

export interface ReputationMutationResult {
  event: ReputationEventRecord;
  profile: ReputationProfileSnapshot;
  previousLevel: ReputationLevel;
  disposition: ReputationEventDisposition;
  created: boolean;
}

interface UserStandingRow {
  status: string;
  created_at: string;
  verified_registered_account: boolean;
  accountability_identity_declared: boolean;
  unresolved_serious_enforcement: boolean;
  active_feature_restriction: boolean;
  manipulation_investigation: boolean;
  anti_gaming_eligible: boolean;
}

interface AggregateRow {
  total_score: string;
  accountability: string;
  contribution: string;
  conduct: string;
  sourcing: string;
  authenticity: string;
  review_reliability: string;
  active_days: number;
  active_weeks: number;
  qualifying_human_contributions: number;
}

interface ExistingEventRow {
  id: string;
  subject_user_id: string;
  content_id: string | null;
  event_type: ReputationSignalType;
  pillar: ReputationPillar | null;
  impact: string;
  policy_version: string;
  source_event_id: string;
  moderation_decision_id: string | null;
  appeal_id: string | null;
  status: ReputationEventRecord['status'];
  explanation_code: string;
  reversal_reference: string | null;
  created_at: string;
}

function clampPillar(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function eventRecord(row: ExistingEventRow): ReputationEventRecord {
  return {
    id: row.id,
    subjectUserId: row.subject_user_id,
    contentId: row.content_id,
    eventType: row.event_type,
    pillar: row.pillar,
    impact: Number(row.impact),
    policyVersion: row.policy_version,
    sourceEventId: row.source_event_id,
    moderationDecisionId: row.moderation_decision_id,
    appealId: row.appeal_id,
    status: row.status,
    explanationCode: row.explanation_code,
    reversalReference: row.reversal_reference,
    createdAt: row.created_at,
  };
}

const EVENT_COLUMNS = `id, subject_user_id, content_id, event_type, pillar, impact,
  policy_version, source_event_id, moderation_decision_id, appeal_id, status,
  explanation_code, reversal_reference, created_at`;

async function findEventBySource(
  client: Client,
  subjectUserId: string,
  sourceEventId: string,
  signalType: ReputationSignalType,
): Promise<ReputationEventRecord | null> {
  const result = await client.query<ExistingEventRow>(
    `SELECT ${EVENT_COLUMNS}
       FROM trust.reputation_events
      WHERE subject_user_id = $1 AND source_event_id = $2 AND event_type = $3`,
    [subjectUserId, sourceEventId, signalType],
  );
  return result.rows[0] ? eventRecord(result.rows[0]) : null;
}

export async function refreshReputationProfile(
  client: Client,
  userId: string,
): Promise<{ profile: ReputationProfileSnapshot; previousLevel: ReputationLevel }> {
  const previous = await client.query<{ current_level: ReputationLevel }>(
    `SELECT current_level FROM trust.reputation_profiles WHERE user_id = $1`,
    [userId],
  );
  const standingResult = await client.query<UserStandingRow>(
    `SELECT users.status, users.created_at,
            (credentials.verified_at IS NOT NULL OR contact.verified_at IS NOT NULL) AS verified_registered_account,
            EXISTS (
              SELECT 1 FROM trust.accountability_signals signal
               WHERE signal.user_id = users.id
                 AND signal.signal_type = 'accountability_identity_declared'
                 AND signal.signal_value > 0
            ) AS accountability_identity_declared,
            EXISTS (
              SELECT 1 FROM moderation.enforcement_events enforcement
               WHERE enforcement.subject_id = users.id
                 AND enforcement.action = 'block'
                 AND enforcement.created_at >= now() - interval '90 days'
                 AND NOT EXISTS (
                   SELECT 1 FROM moderation.enforcement_events reversal
                    WHERE reversal.case_id = enforcement.case_id
                      AND reversal.action = 'appeal_overturn'
                      AND reversal.created_at > enforcement.created_at
                 )
            ) AS unresolved_serious_enforcement,
            EXISTS (
              SELECT 1 FROM moderation.enforcement_events enforcement
               WHERE enforcement.subject_id = users.id
                 AND enforcement.action IN ('restrict', 'feature_restrict')
                 AND enforcement.created_at >= now() - interval '90 days'
            ) AS active_feature_restriction,
            EXISTS (
              SELECT 1 FROM moderation.cases moderation_case
               WHERE moderation_case.content_type = 'account'
                 AND moderation_case.content_id = users.id
                 AND moderation_case.state = 'open'
            ) AS manipulation_investigation,
            NOT EXISTS (
              SELECT 1 FROM trust.reputation_events event
               WHERE event.subject_user_id = users.id
                 AND event.status = 'effective'
                 AND event.event_type IN ('confirmed_spam', 'authenticity_evasion', 'self_interaction', 'duplicate_content')
                 AND event.effective_at >= now() - interval '30 days'
            ) AS anti_gaming_eligible
       FROM identity.users users
       LEFT JOIN identity.email_credentials credentials ON credentials.user_id = users.id
       LEFT JOIN identity.contact_emails contact ON contact.user_id = users.id
      WHERE users.id = $1`,
    [userId],
  );
  const standing = standingResult.rows[0];
  if (!standing) throw new Error('reputation_subject_not_found');

  const aggregateResult = await client.query<AggregateRow>(
    `SELECT COALESCE(sum(impact) FILTER (WHERE status = 'effective'), 0)::text AS total_score,
            COALESCE(sum(impact) FILTER (WHERE status = 'effective' AND pillar = 'accountability'), 0)::text AS accountability,
            COALESCE(sum(impact) FILTER (WHERE status = 'effective' AND pillar = 'contribution'), 0)::text AS contribution,
            COALESCE(sum(impact) FILTER (WHERE status = 'effective' AND pillar = 'conduct'), 0)::text AS conduct,
            COALESCE(sum(impact) FILTER (WHERE status = 'effective' AND pillar = 'sourcing'), 0)::text AS sourcing,
            COALESCE(sum(impact) FILTER (WHERE status = 'effective' AND pillar = 'authenticity'), 0)::text AS authenticity,
            COALESCE(sum(impact) FILTER (WHERE status = 'effective' AND pillar = 'reviewReliability'), 0)::text AS review_reliability,
            count(DISTINCT (effective_at AT TIME ZONE 'UTC')::date)
              FILTER (WHERE status = 'effective' AND impact > 0)::integer AS active_days,
            count(DISTINCT date_trunc('week', effective_at AT TIME ZONE 'UTC'))
              FILTER (WHERE status = 'effective' AND impact > 0)::integer AS active_weeks,
            count(*) FILTER (
              WHERE status = 'effective' AND event_type = 'qualifying_human_contribution' AND impact > 0
            )::integer AS qualifying_human_contributions
       FROM trust.reputation_events
      WHERE subject_user_id = $1`,
    [userId],
  );
  const aggregate = aggregateResult.rows[0];
  if (!aggregate) throw new Error('reputation_aggregate_unavailable');
  const pillarScores: ReputationPillarScores = {
    accountability: clampPillar(REPUTATION_PILLAR_BASELINES.accountability + Number(aggregate.accountability)),
    contribution: clampPillar(REPUTATION_PILLAR_BASELINES.contribution + Number(aggregate.contribution)),
    conduct: clampPillar(REPUTATION_PILLAR_BASELINES.conduct + Number(aggregate.conduct)),
    sourcing: clampPillar(REPUTATION_PILLAR_BASELINES.sourcing + Number(aggregate.sourcing)),
    authenticity: clampPillar(REPUTATION_PILLAR_BASELINES.authenticity + Number(aggregate.authenticity)),
    reviewReliability: clampPillar(REPUTATION_PILLAR_BASELINES.reviewReliability + Number(aggregate.review_reliability)),
  };
  const accountAgeDays = Math.max(0, Math.floor((Date.now() - Date.parse(standing.created_at)) / 86_400_000));
  const suspended = standing.status === 'suspended' || standing.status === 'locked';
  const evaluation = evaluateReputation({
    totalScore: Math.max(0, Math.round(Number(aggregate.total_score))),
    pillarScores,
    accountAgeDays,
    activeDays: aggregate.active_days,
    activeWeeks: aggregate.active_weeks,
    verifiedRegisteredAccount: standing.verified_registered_account,
    accountabilityIdentityDeclared: standing.accountability_identity_declared,
    qualifyingHumanContributions: aggregate.qualifying_human_contributions,
    unresolvedSeriousEnforcement: standing.unresolved_serious_enforcement,
    activeFeatureRestriction: standing.active_feature_restriction,
    suspended,
    manipulationInvestigation: standing.manipulation_investigation,
    antiGamingEligible: standing.anti_gaming_eligible,
  });
  const profileStatus: ReputationProfileSnapshot['status'] = suspended
    ? 'suspended'
    : standing.manipulation_investigation
      ? 'under_investigation'
      : standing.active_feature_restriction || standing.unresolved_serious_enforcement
        ? 'restricted'
        : 'active';
  const evaluatedAt = new Date().toISOString();
  await client.query(
    `INSERT INTO trust.reputation_profiles
       (user_id, policy_version, current_level, total_score, accountability_score,
        contribution_score, conduct_score, sourcing_score, authenticity_score,
        review_reliability_score, active_days, active_weeks, qualifying_human_contributions,
        promotion_blockers, status, evaluated_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $16)
     ON CONFLICT (user_id) DO UPDATE SET
       policy_version = EXCLUDED.policy_version,
       current_level = EXCLUDED.current_level,
       total_score = EXCLUDED.total_score,
       accountability_score = EXCLUDED.accountability_score,
       contribution_score = EXCLUDED.contribution_score,
       conduct_score = EXCLUDED.conduct_score,
       sourcing_score = EXCLUDED.sourcing_score,
       authenticity_score = EXCLUDED.authenticity_score,
       review_reliability_score = EXCLUDED.review_reliability_score,
       active_days = EXCLUDED.active_days,
       active_weeks = EXCLUDED.active_weeks,
       qualifying_human_contributions = EXCLUDED.qualifying_human_contributions,
       promotion_blockers = EXCLUDED.promotion_blockers,
       status = EXCLUDED.status,
       evaluated_at = EXCLUDED.evaluated_at,
       updated_at = EXCLUDED.updated_at`,
    [
      userId,
      REPUTATION_POLICY.version,
      evaluation.level,
      Math.max(0, Math.round(Number(aggregate.total_score))),
      pillarScores.accountability,
      pillarScores.contribution,
      pillarScores.conduct,
      pillarScores.sourcing,
      pillarScores.authenticity,
      pillarScores.reviewReliability,
      aggregate.active_days,
      aggregate.active_weeks,
      aggregate.qualifying_human_contributions,
      JSON.stringify(evaluation.promotionBlockers),
      profileStatus,
      evaluatedAt,
    ],
  );
  await client.query(
    `INSERT INTO trust.reputation_balances (user_id, points, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET points = EXCLUDED.points, updated_at = EXCLUDED.updated_at`,
    [userId, Math.max(0, Math.round(Number(aggregate.total_score))), evaluatedAt],
  );
  return {
    previousLevel: previous.rows[0]?.current_level ?? 0,
    profile: {
      userId,
      policyVersion: evaluation.policyVersion,
      currentLevel: evaluation.level,
      totalScore: Math.max(0, Math.round(Number(aggregate.total_score))),
      pillarScores,
      activeDays: aggregate.active_days,
      activeWeeks: aggregate.active_weeks,
      qualifyingHumanContributions: aggregate.qualifying_human_contributions,
      promotionBlockers: evaluation.promotionBlockers,
      status: profileStatus,
      evaluatedAt,
    },
  };
}

export async function recordReputationSignal(
  client: Client,
  input: ReputationSignalInput,
): Promise<ReputationMutationResult> {
  if (!Number.isFinite(Date.parse(input.occurredAt))) throw new Error('reputation_event_time_invalid');
  const subject = await client.query<{ status: string }>(
    `SELECT status FROM identity.users WHERE id = $1 FOR UPDATE`,
    [input.subjectUserId],
  );
  if (!subject.rows[0]) throw new Error('reputation_subject_not_found');
  const existing = await findEventBySource(client, input.subjectUserId, input.sourceEventId, input.signalType);
  if (existing) {
    const recomputed = await refreshReputationProfile(client, input.subjectUserId);
    return {
      event: existing,
      profile: recomputed.profile,
      previousLevel: recomputed.previousLevel,
      disposition: existing.status === 'withheld' ? 'withheld' : existing.status === 'reversed' ? 'reversed' : existing.impact < 0 ? 'negative' : 'positive',
      created: false,
    };
  }

  const policy = REPUTATION_EVENT_CATALOG[input.signalType];
  const occurrenceResult = await client.query<{ occurrence_count: number }>(
    policy.oneTime
      ? `SELECT count(*)::integer AS occurrence_count FROM trust.reputation_events
          WHERE subject_user_id = $1 AND event_type = $2 AND status = 'effective'`
      : `SELECT count(*)::integer AS occurrence_count FROM trust.reputation_events
          WHERE subject_user_id = $1 AND event_type = $2
            AND effective_at >= date_trunc('day', $3::timestamptz)
            AND effective_at < date_trunc('day', $3::timestamptz) + interval '1 day'`,
    policy.oneTime
      ? [input.subjectUserId, input.signalType]
      : [input.subjectUserId, input.signalType, input.occurredAt],
  );
  let reversal: ExistingEventRow | undefined;
  if (input.signalType === 'reputation_event_reversal') {
    if (!input.reversalReference) throw new Error('reputation_reversal_reference_required');
    const reversed = await client.query<ExistingEventRow>(
      `SELECT ${EVENT_COLUMNS}
         FROM trust.reputation_events
        WHERE id = $1 AND subject_user_id = $2
        FOR UPDATE`,
      [input.reversalReference, input.subjectUserId],
    );
    reversal = reversed.rows[0];
    if (!reversal) throw new Error('reputation_reversal_reference_invalid');
    if (reversal.status !== 'effective') throw new Error('reputation_event_not_reversible');
  }
  const impact = calculateReputationImpact({
    signalType: input.signalType,
    occurrenceInWindow: (occurrenceResult.rows[0]?.occurrence_count ?? 0) + 1,
    suspended: subject.rows[0].status === 'suspended' || subject.rows[0].status === 'locked',
    reversalOfImpact: reversal ? Number(reversal.impact) : undefined,
  });
  const status: ReputationEventRecord['status'] = impact.disposition === 'withheld'
    ? 'withheld'
    : impact.disposition === 'reversed'
      ? 'reversed'
      : 'effective';
  if (reversal) {
    await client.query(`UPDATE trust.reputation_events SET status = 'reversed' WHERE id = $1`, [reversal.id]);
  }
  const inserted = await client.query<ExistingEventRow>(
    `INSERT INTO trust.reputation_events
       (id, subject_user_id, content_id, event_type, pillar, impact, policy_version,
        points_delta, source_event_id, moderation_decision_id, appeal_id, status,
        effective_at, explanation_code, visibility, reversal_reference, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $8, $9, $10, $11, $12, $13, 'private', $14, $12)
     ON CONFLICT DO NOTHING
     RETURNING ${EVENT_COLUMNS}`,
    [
      input.id,
      input.subjectUserId,
      input.contentId ?? null,
      input.signalType,
      reversal?.pillar ?? impact.pillar,
      impact.impact,
      REPUTATION_POLICY.version,
      input.sourceEventId,
      input.moderationDecisionId ?? null,
      input.appealId ?? null,
      status,
      input.occurredAt,
      impact.explanationCode,
      input.reversalReference ?? null,
    ],
  );
  const persisted = inserted.rows[0]
    ? eventRecord(inserted.rows[0])
    : await findEventBySource(client, input.subjectUserId, input.sourceEventId, input.signalType);
  if (!persisted) throw new Error('reputation_event_not_recorded');
  const recomputed = await refreshReputationProfile(client, input.subjectUserId);
  return {
    event: persisted,
    profile: recomputed.profile,
    previousLevel: recomputed.previousLevel,
    disposition: impact.disposition,
    created: Boolean(inserted.rows[0]),
  };
}
