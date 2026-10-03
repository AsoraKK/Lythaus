import type { Client } from 'pg';
import { uuidv7 } from '@lythaus/security';
import { MONTHLY_REPUTATION_POLICY_VERSION, nextReputationMonth, reputationInstant, requireSourceMonth, type LockedReputationWeek } from '../../contracts/src/monthly-reputation-policy.ts';
import { calculateMonthlyMaintenance } from '../../contracts/src/monthly-maintenance-policy.ts';
import { proposedClosingSundayWeeks } from '../../contracts/src/monthly-reputation-decisions.ts';
import { loadMonthlyEarningConfiguration, MONTHLY_EARNING_SOURCE_EVENTS } from './monthly-earning.ts';
import { loadMonthlyMaintenanceConfiguration, readMonthlyMaintenanceEvidence } from './monthly-maintenance.ts';
import { recordMonthlyReputationSource } from './monthly-reputation.ts';
import { requireMonthlyPeerIngestionDrained } from './monthly-peer-participation.ts';

export async function assembleMonthlyReputation(client: Client, input: {
  subjectUserId: string; sourceMonth: string; weeklyRulesVersion: string; maintenanceRulesVersion: string; evaluatedAt: string; peerRulesVersion?: string;
}) {
  requireSourceMonth(input.sourceMonth);
  const evaluated = reputationInstant(input.evaluatedAt);
  const weekly = await loadMonthlyEarningConfiguration(client, input.weeklyRulesVersion);
  const maintenance = await loadMonthlyMaintenanceConfiguration(client, input.maintenanceRulesVersion);
  if (!weekly || !maintenance) return null;
  const sourceCutoff = `${nextReputationMonth(input.sourceMonth)}-01T00:00:00.000Z`;
  if (evaluated < reputationInstant(sourceCutoff) + maintenance.rules.monthSettlementHours * 3_600_000) {
    throw new Error('monthly_assembly_source_not_settled');
  }
  if (sourceCutoff <= weekly.collectFrom || sourceCutoff <= maintenance.collectFrom) return null;
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-reputation:${input.subjectUserId}:${input.sourceMonth}`]);
  const account = (await client.query<{ created_at: Date }>(
    'SELECT created_at FROM trust.lock_monthly_reputation_subject($1)', [input.subjectUserId])).rows[0];
  if (!account || account.created_at.toISOString() >= sourceCutoff) return null;
  const previous = (await client.query<{ id: string; revision: number; evidence_digest: string | null;
    rules_version: string | null; weekly_rules_version: string | null; report: unknown }>(
    `SELECT source.id, source.revision, assembly.evidence_digest, assembly.rules_version, assembly.weekly_rules_version, assembly.report
     FROM trust.monthly_reputation_sources source LEFT JOIN trust.monthly_reputation_assemblies assembly ON assembly.source_id = source.id
     WHERE source.subject_user_id = $1 AND source.source_month = $2::date AND source.policy_version = $3
     ORDER BY source.revision DESC LIMIT 1`, [input.subjectUserId, `${input.sourceMonth}-01`, MONTHLY_REPUTATION_POLICY_VERSION])).rows[0];
  if (previous && (!previous.evidence_digest || previous.rules_version !== maintenance.rules.version
    || previous.weekly_rules_version !== weekly.rules.version)) throw new Error('monthly_assembly_previous_policy_requires_review');
  const periods = proposedClosingSundayWeeks(input.sourceMonth);
  const peer = input.peerRulesVersion ? await requireMonthlyPeerIngestionDrained(client, { subjectUserId: input.subjectUserId,
    peerRulesVersion: input.peerRulesVersion, weeklyRulesVersion: input.weeklyRulesVersion,
    startsAt: periods[0].startsAt, endsAt: periods.at(-1)!.endsAt }) : null;
  const previousPeerVersion = previous?.report && typeof previous.report === 'object'
    ? (previous.report as { peerRulesVersion?: string | null }).peerRulesVersion ?? null : null;
  if (previous && previousPeerVersion !== (peer?.version ?? null)) throw new Error('monthly_assembly_previous_policy_requires_review');
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
  [input.subjectUserId, MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_EARNING_SOURCE_EVENTS,
    weekly.collectFrom, periods[0].startsAt, periods.at(-1)!.endsAt]);
  if (pending.rowCount) throw new Error('monthly_assembly_ingestion_pending');
  const weeks = (await client.query<{ id: string; week_id: string; revision: number; state: LockedReputationWeek['state'] | 'open' | 'settling';
    points: number; week_start: Date; recorded_at: Date; rules_version: string; calculation: Record<string, unknown> }>(
    `SELECT DISTINCT ON (week_start) id, week_id, revision, state, points, week_start, recorded_at, rules_version, calculation
     FROM trust.monthly_earning_week_revisions WHERE subject_user_id = $1 AND policy_version = $2
       AND week_start = ANY($3::timestamptz[]) ORDER BY week_start, revision DESC`,
    [input.subjectUserId, MONTHLY_REPUTATION_POLICY_VERSION, periods.map(period => period.startsAt)])).rows;
  if (weeks.some(week => !['locked', 'corrected'].includes(week.state))) throw new Error('monthly_assembly_week_not_settled');
  if (weeks.some(week => week.rules_version !== weekly.rules.version)) throw new Error('monthly_assembly_week_policy_mismatch');
  const locked: LockedReputationWeek[] = weeks.map(week => {
    const period = periods.find(candidate => candidate.startsAt === week.week_start.toISOString())!;
    return { weekId: week.week_id, revision: week.revision, state: week.state as LockedReputationWeek['state'],
      points: week.points, startsAt: period.startsAt, endsAt: period.endsAt, ownerMonth: input.sourceMonth,
      lockedAt: week.recorded_at.toISOString() };
  });
  const observations = await readMonthlyMaintenanceEvidence(client, input.subjectUserId, sourceCutoff);
  const maintenanceReport = calculateMonthlyMaintenance({ subjectUserId: input.subjectUserId, sourceMonth: input.sourceMonth,
    rules: maintenance.rules, evidence: observations.evidence });
  const report = { policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, mode: 'shadow', sourceMonth: input.sourceMonth,
    sourceCutoff, rulesVersion: maintenance.rules.version, weeklyRulesVersion: weekly.rules.version,
    peerRulesVersion: peer?.version ?? null,
    maintenance: maintenanceReport, weeks: weeks.map(week => ({ revisionId: week.id, weekId: week.week_id,
      revision: week.revision, calculation: { ...week.calculation, state: week.state } })),
    missingWeeks: periods.filter(period => !locked.some(week => week.startsAt === period.startsAt)).map(period => ({ ...period,
      points: 0, reasonCode: period.endsAt <= weekly.collectFrom ? 'before_collection' : period.endsAt <= account.created_at.toISOString() ? 'before_account' : 'no_recorded_activity' })),
    observationIds: observations.observationIds, revocationIds: observations.revocationIds };
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ locked, report })));
  const evidenceDigest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  if (previous?.evidence_digest === evidenceDigest) return { sourceId: previous.id, revision: previous.revision, created: false, report: previous.report };
  const source = await recordMonthlyReputationSource(client, { id: uuidv7(), eventId: uuidv7(), subjectUserId: input.subjectUserId,
    expectedPreviousId: previous?.id ?? null, reasonCode: previous ? 'source_evidence_corrected' : 'closed_month_assembled', evaluatedAt: input.evaluatedAt,
    input: { policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, sourceMonth: input.sourceMonth, sourceCutoff,
      periodPolicyVersion: weekly.rules.periodPolicyVersion, weeks: locked, monthlyPoints: maintenanceReport.monthlyPoints,
      quarterlyPoints: maintenanceReport.quarterlyPoints } });
  await client.query(`INSERT INTO trust.monthly_reputation_assemblies
    (source_id, subject_user_id, source_month, rules_version, weekly_rules_version, evidence_digest,
      week_revision_ids, observation_ids, revocation_ids, report)
    VALUES ($1, $2, $3::date, $4, $5, $6, $7::uuid[], $8::uuid[], $9::uuid[], $10::jsonb)`,
  [source.id, input.subjectUserId, `${input.sourceMonth}-01`, maintenance.rules.version, weekly.rules.version, evidenceDigest,
    weeks.map(week => week.id), observations.observationIds, observations.revocationIds, JSON.stringify(report)]);
  return { sourceId: source.id, revision: source.revision, created: true, report };
}
