import type { Client } from 'pg';
import { uuidv7 } from '@lythaus/security';
import { enforceContentDeclaration } from '../../contracts/src/content-policy.ts';
import { MONTHLY_REPUTATION_CATALOGUE_HASH, MONTHLY_REPUTATION_POLICY_VERSION, reputationInstant } from '../../contracts/src/monthly-reputation-policy.ts';
import { proposedClosingSundayWeek } from '../../contracts/src/monthly-reputation-decisions.ts';
import { calculateProposedWeeklyEarning, validateWeeklyEarningRules, type WeeklyContributionEvidence, type WeeklyEarningRules } from '../../contracts/src/monthly-earning-policy.ts';
import { monthlyReputationShadowEnabled } from './monthly-reputation.ts';

export const MONTHLY_EARNING_SOURCE_EVENTS = [
  'content.post.created', 'content.post.updated', 'content.post.published', 'content.post.deleted',
  'content.comment.created', 'content.comment.updated', 'content.comment.published', 'content.comment.deleted',
  'moderation.content.blocked',
] as const;

export interface MonthlyEarningConfiguration { rules: WeeklyEarningRules; collectFrom: string }
interface ContentEvidence extends WeeklyContributionEvidence {
  reasonCode: string;
  contentFingerprint: string | null;
  sourceRevisionId: string | null;
  decisionId: string | null;
}
interface ContentRow {
  author_id: string; body: string; created_at: Date; deleted_at: Date | null; revision_performed_at: Date | null;
  declared_creation_mode: string; moderation_source_event_id: string | null; moderation_state: string;
  publicly_eligible: boolean; subject_deleted: boolean; own_thread: boolean; parent_id: string | null;
  decision_id: string | null; decision_outcome: string | null; decided_by: string | null;
  decision_policy: string | null; community_allow: boolean;
}
const iso = (value: string | Date) => new Date(value).toISOString();
async function digest(value: unknown): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadMonthlyEarningConfiguration(client: Client, version: string): Promise<MonthlyEarningConfiguration | null> {
  if (!await monthlyReputationShadowEnabled(client)) return null;
  const result = await client.query<{ configuration: WeeklyEarningRules; collect_from: Date }>(
    `SELECT configuration, collect_from FROM trust.monthly_earning_rule_sets
      WHERE version = $1 AND policy_version = $2 AND catalogue_hash = $3 AND mode = 'shadow'`,
    [version, MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH]);
  if (!result.rows[0]) return null;
  validateWeeklyEarningRules(result.rows[0].configuration);
  return { rules: result.rows[0].configuration, collectFrom: iso(result.rows[0].collect_from) };
}

async function contentEvidence(client: Client, type: 'post' | 'comment', id: string): Promise<ContentRow | undefined> {
  const contentSql = type === 'post'
    ? `SELECT p.author_id, p.body, p.created_at, p.deleted_at, p.declared_creation_mode,
         p.moderation_source_event_id, p.moderation_state, p.visibility = 'public' AS publicly_eligible,
         true AS own_thread, NULL::uuid AS parent_id, u.status = 'deleted' OR u.deleted_at IS NOT NULL AS subject_deleted
       FROM content.posts p JOIN identity.users u ON u.id = p.author_id WHERE p.id = $1 FOR SHARE OF p`
    : `SELECT c.author_id, c.body, c.created_at, c.deleted_at, c.declared_creation_mode,
         c.moderation_source_event_id, c.moderation_state,
         p.visibility = 'public' AND p.deleted_at IS NULL AND p.moderation_state = 'allowed' AS publicly_eligible,
         p.author_id = c.author_id AS own_thread, c.parent_id,
         u.status = 'deleted' OR u.deleted_at IS NOT NULL AS subject_deleted
       FROM content.comments c JOIN content.posts p ON p.id = c.post_id
       JOIN identity.users u ON u.id = c.author_id WHERE c.id = $1 FOR SHARE OF c, p`;
  const result = await client.query<ContentRow>(
    `WITH current_content AS (${contentSql})
     SELECT c.*, source.created_at AS revision_performed_at,
       decision.id AS decision_id, decision.outcome AS decision_outcome, decision.decided_by,
       decision.policy_version AS decision_policy, false AS community_allow
     FROM current_content c LEFT JOIN system.outbox_events source ON source.id = c.moderation_source_event_id
     LEFT JOIN LATERAL (
       SELECT d.id, d.outcome, d.decided_by, d.policy_version FROM moderation.decisions d
       JOIN moderation.cases m ON m.id = d.case_id
       WHERE m.content_id = $1 AND m.content_type = $2 AND m.source_event_id = c.moderation_source_event_id
       ORDER BY d.created_at DESC, d.id DESC LIMIT 1
     ) decision ON true`, [id, type]);
  const row = result.rows[0];
  if (row?.decision_policy === MONTHLY_REPUTATION_POLICY_VERSION && row.decision_outcome === 'allow' && !row.decided_by) {
    row.community_allow = (await client.query(`SELECT 1 FROM moderation.decisions d
      JOIN moderation.community_appeal_sessions s ON s.challenged_decision_id IN
        (SELECT id FROM moderation.decisions WHERE case_id = d.case_id)
      JOIN moderation.community_appeal_outcomes o ON o.appeal_id = s.appeal_id AND o.recorded_at = d.created_at
      WHERE d.id = $1 AND s.state = 'resolved_allow' AND o.restoration = 'restored'
        AND s.content_id = $2 AND s.content_type = $3 AND s.source_event_id = $4`,
    [row.decision_id, id, type, row.moderation_source_event_id])).rowCount === 1;
  }
  return row;
}

export async function refreshMonthlyEarningWeek(client: Client, input: {
  subjectUserId: string; startsAt: string; configuration: MonthlyEarningConfiguration; evaluatedAt: string;
}) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-earning:${input.subjectUserId}:${input.startsAt}`]);
  const previous = await client.query<{ id: string; week_id: string; revision: number; state: string; input_digest: string; rules_version: string }>(
    `SELECT id, week_id, revision, state, input_digest, rules_version FROM trust.monthly_earning_week_revisions
      WHERE subject_user_id = $1 AND week_start = $2 AND policy_version = $3 ORDER BY revision DESC LIMIT 1`,
    [input.subjectUserId, input.startsAt, MONTHLY_REPUTATION_POLICY_VERSION]);
  const old = previous.rows[0];
  if (old && old.rules_version !== input.configuration.rules.version) throw new Error('monthly_earning_period_rules_locked');
  const latest = await client.query<{ input: ContentEvidence }>(
    `SELECT evidence.input FROM trust.monthly_earning_contributions contribution
     JOIN LATERAL (SELECT input FROM trust.monthly_earning_evidence_revisions
       WHERE contribution_id = contribution.id ORDER BY revision DESC LIMIT 1) evidence ON true
     WHERE contribution.subject_user_id = $1 AND contribution.week_start = $2 AND contribution.policy_version = $3
     ORDER BY contribution.performed_at, contribution.source_id`,
    [input.subjectUserId, input.startsAt, MONTHLY_REPUTATION_POLICY_VERSION]);
  const fingerprints = new Set<string>();
  const contributions = latest.rows.map(({ input: evidence }) => {
    if (evidence.state !== 'accepted' || !evidence.contentFingerprint) return evidence;
    if (fingerprints.has(evidence.contentFingerprint)) return { ...evidence, state: 'withheld' as const, reasonCode: 'duplicate_work' };
    fingerprints.add(evidence.contentFingerprint);
    return evidence;
  });
  const calculation = { ...calculateProposedWeeklyEarning({ ...input, rules: input.configuration.rules, contributions, reception: [] }), evidence: contributions };
  const inputDigest = await digest(calculation);
  if (old?.input_digest === inputDigest) return { id: old.id, weekId: old.week_id, revision: old.revision, created: false, calculation };
  const id = uuidv7(), weekId = old?.week_id ?? uuidv7(), revision = (old?.revision ?? 0) + 1;
  const state = old && ['locked', 'corrected'].includes(old.state) ? 'corrected' : calculation.state;
  await client.query(
    `INSERT INTO trust.monthly_earning_week_revisions
      (id, week_id, subject_user_id, week_start, policy_version, rules_version, revision, state, points, calculation, input_digest)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
    [id, weekId, input.subjectUserId, input.startsAt, MONTHLY_REPUTATION_POLICY_VERSION,
      input.configuration.rules.version, revision, state, calculation.points, JSON.stringify(calculation), inputDigest]);
  await client.query(
    `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
      VALUES ($1, 'trust.monthly_week.revised', 'monthly_reputation_week', $2, $3, $4::jsonb)`,
    [uuidv7(), weekId, input.subjectUserId, JSON.stringify({ weekId, revisionId: id, sourceMonth: calculation.ownerMonth })]);
  return { id, weekId, revision, created: true, calculation };
}

export async function recordMonthlyContentEarning(client: Client, request: {
  eventId: string; rulesVersion: string; evaluatedAt: string;
}) {
  const configuration = await loadMonthlyEarningConfiguration(client, request.rulesVersion);
  if (!configuration) return null;
  reputationInstant(request.evaluatedAt);
  const event = (await client.query<{ event_type: string; aggregate_type: string; aggregate_id: string; created_at: Date }>(
    `SELECT event_type, aggregate_type, aggregate_id, created_at FROM system.outbox_events WHERE id = $1 AND event_type = ANY($2::text[])`,
    [request.eventId, MONTHLY_EARNING_SOURCE_EVENTS])).rows[0];
  if (!event) throw new Error('monthly_earning_canonical_event_required');
  if (iso(event.created_at) > request.evaluatedAt) throw new Error('monthly_earning_event_in_future');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-earning-event:${request.eventId}`]);
  if ((await client.query('SELECT 1 FROM trust.monthly_earning_receipts WHERE event_id = $1 AND policy_version = $2',
    [request.eventId, MONTHLY_REPUTATION_POLICY_VERSION])).rowCount) return { processed: false };
  const recordReceipt = async (subjectId: string | null) => client.query(
    `INSERT INTO trust.monthly_earning_receipts (event_id, policy_version, subject_user_id) VALUES ($1, $2, $3)`,
    [request.eventId, MONTHLY_REPUTATION_POLICY_VERSION, subjectId]);
  if (!['post', 'comment'].includes(event.aggregate_type) || iso(event.created_at) < configuration.collectFrom) {
    await recordReceipt(null); return { processed: true };
  }
  const sourceType = event.aggregate_type as 'post' | 'comment';
  const content = await contentEvidence(client, sourceType, event.aggregate_id);
  const existing = (await client.query<{ id: string; subject_user_id: string; performed_at: Date; week_start: Date; subject_deleted: boolean }>(
    `SELECT contribution.id, subject_user_id, performed_at, week_start,
       account.status = 'deleted' OR account.deleted_at IS NOT NULL AS subject_deleted
      FROM trust.monthly_earning_contributions contribution JOIN identity.users account ON account.id = subject_user_id
      WHERE policy_version = $1 AND source_type = $2 AND source_id = $3`,
    [MONTHLY_REPUTATION_POLICY_VERSION, sourceType, event.aggregate_id])).rows[0];
  if (!content && !existing) { await recordReceipt(null); return { processed: true }; }
  if (content?.subject_deleted || existing?.subject_deleted) { await recordReceipt(null); return { processed: true }; }
  const subjectId = content?.author_id ?? existing!.subject_user_id;
  const performedAt = iso(existing?.performed_at ?? content!.created_at);
  if (performedAt < configuration.collectFrom) { await recordReceipt(subjectId); return { processed: true }; }
  const week = proposedClosingSundayWeek(performedAt);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-earning:${subjectId}:${week.startsAt}`]);
  const base = (await client.query<{ id: string }>(
    `INSERT INTO trust.monthly_earning_contributions (id, subject_user_id, source_type, source_id, policy_version, performed_at, week_start)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (policy_version, source_type, source_id) DO NOTHING RETURNING id`,
    [uuidv7(), subjectId, sourceType, event.aggregate_id, MONTHLY_REPUTATION_POLICY_VERSION, performedAt, week.startsAt])).rows[0]
    ?? (await client.query<{ id: string }>(`SELECT id FROM trust.monthly_earning_contributions WHERE policy_version = $1 AND source_type = $2 AND source_id = $3`,
      [MONTHLY_REPUTATION_POLICY_VERSION, sourceType, event.aggregate_id])).rows[0];
  let state: ContentEvidence['state'] = 'pending_review', reasonCode = 'publication_review_pending';
  let declarationValid = false;
  let creationMode: ContentEvidence['creationMode'] = 'unknown';
  if (content) {
    try { creationMode = enforceContentDeclaration({ body: content.body, declaredCreationMode: content.declared_creation_mode }).declaredCreationMode; declarationValid = true; } catch { declarationValid = false; }
  }
  if (!content || content.deleted_at) { state = 'reversed'; reasonCode = 'content_deleted'; }
  else if (!content.publicly_eligible || content.moderation_state === 'blocked' || !declarationValid) {
    state = 'withheld'; reasonCode = !declarationValid ? 'declaration_ineligible' : 'publication_ineligible';
  } else if (content.revision_performed_at && iso(content.revision_performed_at) >= week.endsAt) {
    reasonCode = 'cross_period_revision_requires_review';
  } else if (content.moderation_state === 'allowed' && content.decision_outcome === 'allow'
    && ((content.decided_by && content.decided_by !== subjectId) || content.community_allow) && content.revision_performed_at) {
    state = sourceType === 'post' ? 'accepted' : 'pending_review';
    reasonCode = sourceType === 'post' ? content.community_allow ? 'community_appeal_publication_accepted' : 'independent_publication_accepted' : 'context_review_required';
  }
  const old = (await client.query<{ revision: number; input_digest: string; input: ContentEvidence }>(
    'SELECT revision, input_digest, input FROM trust.monthly_earning_evidence_revisions WHERE contribution_id = $1 ORDER BY revision DESC LIMIT 1', [base.id])).rows[0];
  let facts: Omit<ContentEvidence, 'id'> = { workId: base.id, kind: !content && old ? old.input.kind : sourceType === 'post' ? 'post'
    : content?.own_thread ? content.parent_id ? 'own_reply' : 'own_comment' : content?.parent_id ? 'other_reply' : 'other_comment',
    performedAt, state, creationMode, declarationValid, reasonCode,
    contentFingerprint: content && !content.deleted_at ? await digest(content.body.normalize('NFC').trim()) : null,
    sourceRevisionId: content?.moderation_source_event_id ?? null, decisionId: content?.decision_id ?? null };
  if ((!content || content.deleted_at) && old?.input.state === 'accepted'
    && content?.moderation_state !== 'blocked' && event.event_type !== 'moderation.content.blocked') {
    const { id: previousEvidenceId, ...previousFacts } = old.input;
    facts = { ...previousFacts, reasonCode: 'legitimate_deletion_preserved' };
  }
  const inputDigest = await digest(facts);
  if (old?.input_digest !== inputDigest) {
    const id = uuidv7();
    await client.query(`INSERT INTO trust.monthly_earning_evidence_revisions (id, contribution_id, revision, source_event_id, input, input_digest)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)`, [id, base.id, (old?.revision ?? 0) + 1, request.eventId, JSON.stringify({ id, ...facts }), inputDigest]);
  }
  const result = await refreshMonthlyEarningWeek(client, { subjectUserId: subjectId, startsAt: week.startsAt, configuration, evaluatedAt: request.evaluatedAt });
  await recordReceipt(subjectId);
  return { processed: true, ...result };
}
