import type { Client } from 'pg';
import { uuidv7 } from '@lythaus/security';
import { calculateMonthlyRewardsV05, validateRewardsV05Configuration, projectRewardsV05Candidate,
  MONTHLY_REWARDS_V05, REWARDS_V05_CONFIGURATION, type RewardsV05Configuration,
  type MonthlyRewardsV05Candidate } from '../../contracts/src/monthly-rewards-v05.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION, nextReputationMonth, requireSourceMonth,
  type LockedReputationWeek } from '../../contracts/src/monthly-reputation-policy.ts';
import { proposedClosingSundayWeeks } from '../../contracts/src/monthly-reputation-decisions.ts';
import { loadMonthlyEarningConfiguration, monthlyEarningSourceEvents } from './monthly-earning.ts';
import { loadMonthlyMaintenanceConfiguration, readMonthlyMaintenanceEvidence } from './monthly-maintenance.ts';
import { requireMonthlyPeerIngestionDrained } from './monthly-peer-participation.ts';
import { requireMonthlyContextIngestionDrained } from './monthly-context-review.ts';

export async function monthlyRewardsV05Configuration(client: Client, version?: string) {
  if (!version) return null;
  if (version !== REWARDS_V05_CONFIGURATION.version) return null;
  const installed = (await client.query<{ available: boolean }>(`SELECT
    to_regclass('trust.monthly_rewards_v05_rule_sets') IS NOT NULL
    AND to_regclass('trust.monthly_rewards_v05_candidates') IS NOT NULL
    AND to_regprocedure('trust.lock_monthly_rewards_v05_configuration(text)') IS NOT NULL AS available`)).rows[0];
  if (!installed?.available) return null;
  const row = (await client.query<{ configuration: RewardsV05Configuration }>(
    'SELECT configuration FROM trust.lock_monthly_rewards_v05_configuration($1)', [version])).rows[0];
  if (!row) return null;
  validateRewardsV05Configuration(row.configuration);
  return row.configuration;
}

export async function rewardsV05ReconciliationCandidates(client: Client, configuration: RewardsV05Configuration) {
  validateRewardsV05Configuration(configuration);
  if (!configuration.firstSourceMonth) return [];
  return (await client.query<{ subject_user_id: string; source_month: string }>(
    `SELECT account.id AS subject_user_id, to_char(period.month, 'YYYY-MM') AS source_month
     FROM identity.users account CROSS JOIN generate_series($1::date,
       (date_trunc('month', now() AT TIME ZONE 'UTC') - interval '1 month')::date, interval '1 month') period(month)
     LEFT JOIN trust.monthly_rewards_v05_reconciliation_attempts attempt
       ON attempt.subject_user_id = account.id AND attempt.source_month = period.month::date AND attempt.rules_version = $2
     WHERE account.status = 'active' AND account.deleted_at IS NULL AND NOT account.is_production_acceptance
       AND account.created_at < (period.month + interval '1 month') AT TIME ZONE 'UTC'
     ORDER BY attempt.attempted_at NULLS FIRST, period.month, account.id LIMIT 50`,
    [`${configuration.firstSourceMonth}-01`, configuration.version])).rows;
}

export async function recordRewardsV05ReconciliationAttempt(client: Client, input: {
  subjectUserId: string; sourceMonth: string; rulesVersion: string;
}) {
  requireSourceMonth(input.sourceMonth);
  return (await client.query<{ recorded: boolean }>(
    'SELECT trust.record_monthly_rewards_v05_attempt($1,$2,$3::date,$4) AS recorded',
    [uuidv7(), input.subjectUserId, `${input.sourceMonth}-01`, input.rulesVersion])).rows[0]?.recorded === true;
}

export async function assembleRewardsV05Candidate(client: Client, input: {
  subjectUserId: string; sourceMonth: string; version?: string; peerRulesVersion?: string; contextRulesVersion?: string;
}) {
  const configuration = await monthlyRewardsV05Configuration(client, input.version);
  if (!configuration || !configuration.weeklyRulesVersion || !configuration.maintenanceRulesVersion) return null;
  const weeklyRulesVersion = configuration.weeklyRulesVersion;
  requireSourceMonth(input.sourceMonth);
  const weekly = await loadMonthlyEarningConfiguration(client, configuration.weeklyRulesVersion);
  const maintenance = await loadMonthlyMaintenanceConfiguration(client, configuration.maintenanceRulesVersion);
  if (!weekly || !maintenance) return null;
  if (configuration.settlementHours !== maintenance.rules.monthSettlementHours) {
    throw new Error('monthly_rewards_v05_settlement_configuration_mismatch');
  }
  const evaluatedAt = (await client.query<{ evaluated_at: Date }>('SELECT clock_timestamp() AS evaluated_at')).rows[0].evaluated_at.toISOString();
  const cutoff = `${nextReputationMonth(input.sourceMonth)}-01T00:00:00.000Z`;
  if (evaluatedAt < cutoff || cutoff <= weekly.collectFrom || cutoff <= maintenance.collectFrom) return null;
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-rewards-v05:${input.subjectUserId}:${input.sourceMonth}`]);
  const member = await client.query('SELECT created_at FROM trust.lock_monthly_reputation_subject($1)', [input.subjectUserId]);
  if (member.rowCount !== 1) return null;
  const periods = proposedClosingSundayWeeks(input.sourceMonth);
  let ingestionComplete = true;
  const ingestionBlockers: string[] = [];
  for (const verify of [
    () => requireMonthlyPeerIngestionDrained(client, { subjectUserId: input.subjectUserId,
      peerRulesVersion: input.peerRulesVersion, weeklyRulesVersion,
      startsAt: periods[0].startsAt, endsAt: periods.at(-1)!.endsAt }),
    () => requireMonthlyContextIngestionDrained(client, { subjectUserId: input.subjectUserId,
      contextRulesVersion: input.contextRulesVersion, weeklyRulesVersion,
      startsAt: periods[0].startsAt, endsAt: periods.at(-1)!.endsAt }),
  ]) {
    try { await verify(); }
    catch (error) {
      if (!(error instanceof Error) || !['monthly_assembly_peer_ingestion_pending',
        'monthly_assembly_context_ingestion_pending'].includes(error.message)) throw error;
      ingestionComplete = false;
      ingestionBlockers.push(error.message);
    }
  }
  const pending = await client.query(`SELECT 1 FROM system.outbox_events event
    LEFT JOIN content.posts post ON event.aggregate_type = 'post' AND post.id = event.aggregate_id
    LEFT JOIN content.comments comment ON event.aggregate_type = 'comment' AND comment.id = event.aggregate_id
    LEFT JOIN trust.monthly_earning_contributions contribution ON contribution.source_id = event.aggregate_id
      AND contribution.source_type = event.aggregate_type AND contribution.policy_version = $2
    WHERE event.event_type = ANY($3::text[]) AND event.created_at >= $4
      AND coalesce(contribution.subject_user_id, post.author_id, comment.author_id) = $1
      AND coalesce(contribution.performed_at, post.created_at, comment.created_at) >= $5
      AND coalesce(contribution.performed_at, post.created_at, comment.created_at) < $6
      AND NOT EXISTS (SELECT 1 FROM trust.monthly_earning_receipts receipt
        WHERE receipt.event_id = event.id AND receipt.policy_version = $2) LIMIT 1`,
  [input.subjectUserId, MONTHLY_REPUTATION_POLICY_VERSION, monthlyEarningSourceEvents(true),
    weekly.collectFrom, periods[0].startsAt, periods.at(-1)!.endsAt]);
  if (pending.rowCount) { ingestionComplete = false; ingestionBlockers.push('content_ingestion_pending'); }
  const rows = (await client.query<{ week_id: string; revision: number; state: string; points: number;
    week_start: Date; recorded_at: Date; rules_version: string }>(`SELECT DISTINCT ON (week_start)
      week_id, revision, state, points, week_start, recorded_at, rules_version
    FROM trust.monthly_earning_week_revisions WHERE subject_user_id = $1 AND policy_version = $2
      AND week_start = ANY($3::timestamptz[]) ORDER BY week_start, revision DESC`,
  [input.subjectUserId, MONTHLY_REPUTATION_POLICY_VERSION, periods.map(period => period.startsAt)])).rows;
  if (rows.some(row => row.rules_version !== weekly.rules.version)) throw new Error('monthly_rewards_v05_week_policy_mismatch');
  if (rows.some(row => !['locked', 'corrected'].includes(row.state))) {
    ingestionComplete = false; ingestionBlockers.push('weekly_settlement_pending');
  }
  const weeks: LockedReputationWeek[] = rows.filter(row => ['locked', 'corrected'].includes(row.state)).map(row => {
    const period = periods.find(period => period.startsAt === row.week_start.toISOString())!;
    return { ...period, weekId: row.week_id, revision: row.revision, state: row.state as 'locked' | 'corrected',
      points: row.points, lockedAt: row.recorded_at.toISOString() };
  });
  const observed = await readMonthlyMaintenanceEvidence(client, input.subjectUserId, cutoff);
  const candidate = calculateMonthlyRewardsV05({ subjectUserId: input.subjectUserId, sourceMonth: input.sourceMonth,
    evaluatedAt, configuration, weeks, maintenanceRules: maintenance.rules, evidence: observed.evidence,
    securityCoverage: [], suggestionRevisions: [], ingestionComplete });
  if (!candidate) return null;
  const eligibleWeeklyRules = weekly.rules.contributionEligibilityVersion === 'human-contributions-2026-10-v1';
  const report = { ...candidate, canonicalIngestionComplete: ingestionComplete,
    inheritance: { weeklyPolicyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
      weeklyRulesVersion: weekly.rules.version, contributionEligibilityVersion: weekly.rules.contributionEligibilityVersion ?? null,
      maintenanceRulesVersion: maintenance.rules.version },
    settlementState: 'evidence_pending' as const,
    finalisationBlockers: [...candidate.finalisationBlockers, ...ingestionBlockers, 'suggestion_evidence_producer_unavailable',
      ...(!eligibleWeeklyRules ? ['prospective_weekly_eligibility_pending'] : [])] };
  const digest = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(report)))).toString('hex');
  const previous = (await client.query<{ id: string; revision: number; evidence_digest: string }>(
    `SELECT id, revision, evidence_digest FROM trust.monthly_rewards_v05_candidates
     WHERE subject_user_id = $1 AND source_month = $2::date ORDER BY revision DESC LIMIT 1`,
    [input.subjectUserId, `${input.sourceMonth}-01`])).rows[0];
  if (previous?.evidence_digest === digest) {
    await client.query('UPDATE trust.monthly_rewards_v05_candidates SET checked_at = clock_timestamp() WHERE id = $1', [previous.id]);
    return { created: false, report };
  }
  await client.query(`INSERT INTO trust.monthly_rewards_v05_candidates
    (id, subject_user_id, source_month, revision, rules_version, evidence_digest, report)
    VALUES ($1, $2, $3::date, $4, $5, $6, $7::jsonb)`,
  [uuidv7(), input.subjectUserId, `${input.sourceMonth}-01`, (previous?.revision ?? 0) + 1,
    configuration.version, digest, JSON.stringify(report)]);
  return { created: true, report };
}

export async function readOwnRewardsV05Candidate(client: Client, input: { subjectId: string; version?: string }) {
  if (!await monthlyRewardsV05Configuration(client, input.version)) return null;
  const row = (await client.query<{ report: MonthlyRewardsV05Candidate & {
    inheritance?: { weeklyPolicyVersion: string; weeklyRulesVersion: string; contributionEligibilityVersion: string | null; maintenanceRulesVersion: string };
  } }>(
    `SELECT candidate.report FROM trust.monthly_rewards_v05_candidates candidate
     JOIN identity.users account ON account.id = candidate.subject_user_id
     WHERE candidate.subject_user_id = $1 AND candidate.rules_version = $2
       AND account.status = 'active' AND account.deleted_at IS NULL
       AND candidate.source_month = (date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC') - interval '1 month')::date
     ORDER BY candidate.revision DESC LIMIT 1`, [input.subjectId, input.version])).rows[0];
  return row ? { ...projectRewardsV05Candidate(row.report),
    inheritance: row.report.inheritance ? {
      weeklyPolicyVersion: row.report.inheritance.weeklyPolicyVersion,
      weeklyRulesVersion: row.report.inheritance.weeklyRulesVersion,
      contributionEligibilityVersion: row.report.inheritance.contributionEligibilityVersion,
      maintenanceRulesVersion: row.report.inheritance.maintenanceRulesVersion,
    } : null,
    eligibilityState: row.report.inheritance?.contributionEligibilityVersion === 'human-contributions-2026-10-v1'
      ? 'candidate' as const : 'pending' as const } : null;
}
