import type { Client } from 'pg';
import { uuidv7 } from '@lythaus/security';
import { MONTHLY_REPUTATION_CATALOGUE_HASH, MONTHLY_REPUTATION_POLICY_VERSION, reputationInstant } from '../../contracts/src/monthly-reputation-policy.ts';
import { proposedClosingSundayWeek } from '../../contracts/src/monthly-reputation-decisions.ts';
import { loadMonthlyEarningConfiguration, refreshMonthlyEarningWeek } from './monthly-earning.ts';

export const MONTHLY_PEER_PARTICIPATION_EVENT = 'moderation.community_appeal.resolved';
export const MONTHLY_PEER_PARTICIPATION_FLAG = 'trust.monthly_peer_participation';
export interface MonthlyPeerConfiguration {
  version: string; weeklyRulesVersion: string; appealRulesVersion: string; collectFrom: string; enabled: boolean;
}
export async function loadMonthlyPeerConfiguration(client: Client, version: string, weeklyRulesVersion: string, includePaused = false): Promise<MonthlyPeerConfiguration | null> {
  const configured = (await client.query<{ policy_version: string }>(
    'SELECT policy_version FROM system.feature_flags WHERE flag_key = $1', [MONTHLY_PEER_PARTICIPATION_FLAG])).rows[0];
  if (configured?.policy_version !== MONTHLY_REPUTATION_POLICY_VERSION) return null;
  const flag = (await client.query<{ enabled: boolean; policy_version: string }>(
    'SELECT enabled, policy_version FROM trust.lock_monthly_peer_configuration()')).rows[0];
  if (!flag || flag.policy_version !== MONTHLY_REPUTATION_POLICY_VERSION || (!includePaused && !flag.enabled)) return null;
  const row = (await client.query<{ version: string; weekly_rules_version: string; appeal_rules_version: string; collect_from: Date }>(
    `SELECT version, weekly_rules_version, appeal_rules_version, collect_from FROM trust.monthly_peer_participation_rule_sets
     WHERE version = $1 AND weekly_rules_version = $2 AND policy_version = $3 AND catalogue_hash = $4
       AND mode = 'shadow' AND award_rule = 'one_valid_final_ballot' AND weekly_points = 250
       AND approved_by IS NOT NULL AND approved_at <= clock_timestamp() AND approval_reference IS NOT NULL`,
    [version, weeklyRulesVersion, MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH])).rows[0];
  return row ? { version: row.version, weeklyRulesVersion: row.weekly_rules_version,
    appealRulesVersion: row.appeal_rules_version, collectFrom: row.collect_from.toISOString(), enabled: flag.enabled } : null;
}

export async function recordMonthlyPeerParticipation(client: Client, input: {
  eventId: string; rulesVersion: string; weeklyRulesVersion: string; evaluatedAt: string;
}) {
  const configuration = await loadMonthlyPeerConfiguration(client, input.rulesVersion, input.weeklyRulesVersion);
  if (!configuration) return null;
  const weekly = await loadMonthlyEarningConfiguration(client, input.weeklyRulesVersion);
  if (!weekly) return null;
  reputationInstant(input.evaluatedAt);
  const source = (await client.query<{ aggregate_id: string; payload: { appealId?: string; state?: string }; created_at: Date }>(
    `SELECT aggregate_id, payload, created_at FROM system.outbox_events WHERE id = $1
      AND event_type = $2 AND aggregate_type = 'community_appeal'`, [input.eventId, MONTHLY_PEER_PARTICIPATION_EVENT])).rows[0];
  if (!source || source.payload.appealId !== source.aggregate_id || source.created_at.toISOString() > input.evaluatedAt) {
    throw new Error('monthly_peer_canonical_event_required');
  }
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-peer-participation:${source.aggregate_id}`]);
  const existing = (await client.query<{ rules_version: string; participants: number }>(
    'SELECT rules_version, participants FROM trust.monthly_peer_participation_receipts WHERE appeal_id = $1', [source.aggregate_id])).rows[0];
  if (existing) {
    if (existing.rules_version !== configuration.version) throw new Error('monthly_peer_previous_policy_requires_review');
    return { processed: false, participants: existing.participants };
  }
  const outcome = (await client.query<{ state: string }>(`SELECT session.state FROM moderation.community_appeal_sessions session
    JOIN moderation.appeals appeal ON appeal.id = session.appeal_id
    JOIN moderation.community_appeal_outcomes outcome ON outcome.appeal_id = session.appeal_id
    WHERE session.appeal_id = $1 AND session.rules_version = $2 AND appeal.policy_version = $3
      AND session.review_class = 'standard' AND session.state IN ('resolved_allow', 'resolved_retain', 'unresolved')
      AND session.state = outcome.result ->> 'status' AND outcome.result ->> 'policyVersion' = $3
      AND outcome.recorded_at = session.resolved_at`,
  [source.aggregate_id, configuration.appealRulesVersion, MONTHLY_REPUTATION_POLICY_VERSION])).rows[0];
  if (!outcome || outcome.state !== source.payload.state) throw new Error('monthly_peer_final_outcome_required');
  const participants = (await client.query<{ ballot_id: string; revision_id: string; voter_user_id: string; performed_at: Date }>(
    `SELECT participation.ballot_id, participation.revision_id, ballot.voter_user_id, participation.performed_at
     FROM moderation.community_appeal_valid_participation participation
     JOIN moderation.community_appeal_ballots ballot ON ballot.id = participation.ballot_id
     JOIN moderation.community_appeal_ballot_revisions revision ON revision.id = participation.revision_id AND revision.ballot_id = ballot.id
     JOIN moderation.community_appeal_sessions session ON session.appeal_id = ballot.appeal_id
     JOIN identity.users account ON account.id = ballot.voter_user_id
     WHERE ballot.appeal_id = $1 AND account.status <> 'deleted' AND account.deleted_at IS NULL
       AND revision.choice IN ('allow', 'retain') AND revision.weight = 1 AND revision.context_acknowledged
       AND participation.performed_at = revision.cast_at AND participation.recorded_at = session.resolved_at
       AND revision.cast_at >= session.opens_at AND revision.cast_at < session.closes_at
       AND revision.cast_at >= greatest($2::timestamptz, $3::timestamptz)
       AND NOT EXISTS (SELECT 1 FROM moderation.community_appeal_ballot_revisions newer
         WHERE newer.ballot_id = ballot.id AND newer.revision > revision.revision)
     ORDER BY ballot.voter_user_id, ballot.id`, [source.aggregate_id, configuration.collectFrom, weekly.collectFrom])).rows;
  for (const participant of participants) {
    const performedAt = participant.performed_at.toISOString(), period = proposedClosingSundayWeek(performedAt);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-earning:${participant.voter_user_id}:${period.startsAt}`]);
    const contribution = (await client.query<{ id: string }>(`INSERT INTO trust.monthly_earning_contributions
      (id, subject_user_id, source_type, source_id, policy_version, performed_at, week_start)
      VALUES ($1, $2, 'peer_ballot', $3, $4, $5, $6) RETURNING id`,
    [uuidv7(), participant.voter_user_id, participant.ballot_id, MONTHLY_REPUTATION_POLICY_VERSION, performedAt, period.startsAt])).rows[0];
    const id = uuidv7(), facts = { id, workId: contribution.id, kind: 'peer_ballot', performedAt, state: 'accepted',
      creationMode: 'not_applicable', declarationValid: true, reasonCode: 'valid_final_peer_participation',
      contentFingerprint: null, sourceRevisionId: participant.revision_id, decisionId: null };
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(facts)));
    const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    await client.query(`INSERT INTO trust.monthly_earning_evidence_revisions
      (id, contribution_id, revision, source_event_id, input, input_digest) VALUES ($1, $2, 1, $3, $4::jsonb, $5)`,
    [id, contribution.id, input.eventId, JSON.stringify(facts), digest]);
    await refreshMonthlyEarningWeek(client, { subjectUserId: participant.voter_user_id, startsAt: period.startsAt,
      configuration: weekly, evaluatedAt: input.evaluatedAt });
  }
  await client.query(`INSERT INTO trust.monthly_peer_participation_receipts (appeal_id, source_event_id, rules_version, participants)
    VALUES ($1, $2, $3, $4)`, [source.aggregate_id, input.eventId, configuration.version, participants.length]);
  return { processed: true, participants: participants.length };
}

export async function requireMonthlyPeerIngestionDrained(client: Client, input: {
  subjectUserId: string; weeklyRulesVersion: string; peerRulesVersion: string; startsAt: string; endsAt: string;
}): Promise<MonthlyPeerConfiguration | null> {
  const configuration = await loadMonthlyPeerConfiguration(client, input.peerRulesVersion, input.weeklyRulesVersion, true);
  if (!configuration) return null;
  if (reputationInstant(configuration.collectFrom) >= reputationInstant(input.endsAt)) return null;
  if (!configuration.enabled) throw new Error('monthly_assembly_peer_participation_paused');
  const pending = await client.query(`SELECT 1 FROM moderation.community_appeal_valid_participation participation
    JOIN moderation.community_appeal_ballots ballot ON ballot.id = participation.ballot_id
    JOIN moderation.community_appeal_sessions session ON session.appeal_id = ballot.appeal_id
    WHERE ballot.voter_user_id = $1 AND session.rules_version = $2
      AND participation.performed_at >= greatest($3::timestamptz, $4::timestamptz) AND participation.performed_at < $5
      AND NOT EXISTS (SELECT 1 FROM trust.monthly_peer_participation_receipts receipt WHERE receipt.appeal_id = ballot.appeal_id) LIMIT 1`,
  [input.subjectUserId, configuration.appealRulesVersion, configuration.collectFrom, input.startsAt, input.endsAt]);
  if (pending.rowCount) throw new Error('monthly_assembly_peer_ingestion_pending');
  return configuration;
}
