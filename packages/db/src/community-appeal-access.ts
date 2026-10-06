import type { Client } from 'pg';
import { uuidv7 } from '@lythaus/security';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../contracts/src/monthly-reputation-policy.ts';
import { evaluateProposedCommunityAppeal, isEligibleCommunityVoter, type CommunityAppealRules, type CommunityVoterEligibility } from '../../contracts/src/monthly-peer-appeal-policy.ts';

export const COMMUNITY_APPEAL_FLAG = 'moderation.community_appeals';
export const COMMUNITY_REVIEW_QUESTION = 'Was the challenged rule correctly applied to this content version?';
export const communityIso = (value: string | Date) => new Date(value).toISOString();
export async function communityNow(client: Client): Promise<string> {
  return communityIso((await client.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0].now);
}
export async function communityDigest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
export interface CommunityConfiguration { rules: CommunityAppealRules; ballotChangesAllowed: boolean }
export async function communityConfiguration(client: Client, version: string): Promise<CommunityConfiguration> {
  const row = (await client.query<{ configuration: CommunityAppealRules; ballot_changes_allowed: boolean }>(
    `SELECT r.configuration, r.ballot_changes_allowed FROM moderation.community_appeal_rule_sets r
     JOIN system.feature_flags f ON f.flag_key = $2 AND f.enabled AND f.policy_version = r.policy_version
     WHERE r.version = $1 AND r.policy_version = $3 AND r.approved_by IS NOT NULL
       AND r.approved_at <= clock_timestamp() AND r.approval_reference IS NOT NULL`,
    [version, COMMUNITY_APPEAL_FLAG, MONTHLY_REPUTATION_POLICY_VERSION])).rows[0];
  if (!row) throw new Error('community_appeals_unavailable');
  evaluateProposedCommunityAppeal({ policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, reviewClass: 'restricted',
    opensAt: '', closesAt: '', evaluatedAt: '', extensions: 0, rules: row.configuration, ballots: [] });
  return { rules: row.configuration, ballotChangesAllowed: row.ballot_changes_allowed };
}
export interface CommunitySession {
  appeal_id: string; appellant_id: string; case_id: string; challenged_decision_id: string; decided_by: string | null;
  rules_version: string; policy_version: string; source_event_id: string; content_type: 'post' | 'comment'; content_id: string;
  content_hash: string; evidence_hash: string; review_class: 'untriaged' | 'standard' | 'restricted'; state: string;
  safe_preview: string | null; rule_context: string | null; triaged_by: string | null;
  opens_at: Date | null; closes_at: Date | null; resolved_at: Date | null; extensions: number;
}
export async function communitySession(client: Client, appealId: string, lock = false): Promise<CommunitySession> {
  const row = (await client.query<CommunitySession>(
    `SELECT s.*, a.appellant_id, a.case_id, a.policy_version, d.decided_by
     FROM moderation.community_appeal_sessions s JOIN moderation.appeals a ON a.id = s.appeal_id
     JOIN moderation.decisions d ON d.id = s.challenged_decision_id WHERE s.appeal_id = $1
     ${lock ? 'FOR UPDATE OF s' : ''}`, [appealId])).rows[0];
  if (!row || row.policy_version !== MONTHLY_REPUTATION_POLICY_VERSION) throw new Error('appeal_not_found');
  return row;
}
export async function communityEligibility(client: Client, userId: string, session?: CommunitySession): Promise<CommunityVoterEligibility> {
  const row = (await client.query<{ registered: boolean; verified: boolean; restricted: boolean; conflict: boolean; duplicate: boolean }>(
    `SELECT u.status = 'active' AND u.deleted_at IS NULL AS registered, e.verified_at IS NOT NULL AS verified,
       EXISTS (SELECT 1 FROM moderation.community_voting_restrictions r WHERE r.subject_user_id = u.id
         AND (r.appeal_id IS NULL OR r.appeal_id = $2) AND r.starts_at <= clock_timestamp() AND r.expires_at > clock_timestamp()) AS restricted,
       EXISTS (SELECT 1 FROM moderation.community_voting_restrictions r WHERE r.subject_user_id = u.id
         AND (r.appeal_id IS NULL OR r.appeal_id = $2) AND r.starts_at <= clock_timestamp() AND r.expires_at > clock_timestamp()
         AND r.reason_code = 'actual_conflict') AS conflict,
       EXISTS (SELECT 1 FROM moderation.community_voting_restrictions r WHERE r.subject_user_id = u.id
         AND (r.appeal_id IS NULL OR r.appeal_id = $2) AND r.starts_at <= clock_timestamp() AND r.expires_at > clock_timestamp()
         AND r.reason_code = 'established_controlled_duplicate') AS duplicate
     FROM identity.users u LEFT JOIN identity.email_credentials e ON e.user_id = u.id WHERE u.id = $1`,
    [userId, session?.appeal_id ?? null])).rows[0];
  return { registered: row?.registered === true, emailVerified: row?.verified === true,
    activeVotingRestriction: row?.restricted === true, appellant: session?.appellant_id === userId,
    relevantConflict: row?.conflict === true || session?.decided_by === userId || session?.triaged_by === userId,
    establishedControlledDuplicate: row?.duplicate === true };
}
export async function communityAudit(client: Client, session: Pick<CommunitySession, 'appeal_id'>, event: string,
  actorId: string | null, detail: Record<string, unknown>, now: string): Promise<void> {
  await client.query(`INSERT INTO moderation.community_appeal_events (id, appeal_id, actor_id, event_type, detail, recorded_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6)`, [uuidv7(), session.appeal_id, actorId, event, JSON.stringify(detail), now]);
}
export async function communityOutbox(client: Client, appealId: string, event: string, detail: Record<string, unknown>): Promise<string> {
  const id = uuidv7();
  await client.query(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, payload)
    VALUES ($1, $2, 'community_appeal', $3, $4::jsonb)`, [id, event, appealId, JSON.stringify({ appealId, ...detail })]);
  return id;
}
export async function communityClassifierEvidence(client: Client, type: string, id: string, source: string): Promise<unknown[]> {
  return (await client.query(`SELECT provider, model_version, signal FROM moderation.detector_runs
    WHERE content_type = $1 AND content_id = $2 AND source_event_id = $3 ORDER BY provider, model_version, id`, [type, id, source])).rows;
}
export async function readCommunityAppeal(client: Client, userId: string, appealId: string) {
  const session = await communitySession(client, appealId);
  const owner = session.appellant_id === userId;
  const eligible = isEligibleCommunityVoter(await communityEligibility(client, userId, session));
  if (!owner && (!eligible || session.review_class !== 'standard' || session.state === 'withdrawn')) throw new Error('appeal_not_found');
  if (!owner) await communityConfiguration(client, session.rules_version);
  const own = (await client.query(`SELECT r.revision, r.choice, r.reason_code, r.cast_at FROM moderation.community_appeal_ballots b
    JOIN LATERAL (SELECT revision, choice, reason_code, cast_at FROM moderation.community_appeal_ballot_revisions
      WHERE ballot_id = b.id ORDER BY revision DESC LIMIT 1) r ON true WHERE b.appeal_id = $1 AND b.voter_user_id = $2`, [appealId, userId])).rows[0];
  const closed = ['resolved_allow', 'resolved_retain', 'unresolved'].includes(session.state);
  const outcome = closed ? (await client.query('SELECT result, restoration FROM moderation.community_appeal_outcomes WHERE appeal_id = $1', [appealId])).rows[0] : undefined;
  return { appealId, policyVersion: session.policy_version, rulesVersion: session.rules_version, state: session.state,
    reviewClass: session.review_class, opensAt: session.opens_at ? communityIso(session.opens_at) : null,
    closesAt: session.closes_at ? communityIso(session.closes_at) : null, extensions: session.extensions,
    question: COMMUNITY_REVIEW_QUESTION, ownBallot: own ?? null, outcome: outcome ?? null,
    evidence: session.review_class === 'standard' ? { preview: session.safe_preview, ruleContext: session.rule_context,
      version: session.source_event_id, evidenceHash: session.evidence_hash } : null };
}
export async function communityReviewQueue(client: Client, userId: string, rulesVersion: string) {
  await communityConfiguration(client, rulesVersion);
  if (!isEligibleCommunityVoter(await communityEligibility(client, userId))) throw new Error('appeal_vote_not_allowed');
  const candidates = (await client.query<{ appeal_id: string }>(`SELECT s.appeal_id FROM moderation.community_appeal_sessions s
    JOIN moderation.appeals a ON a.id = s.appeal_id JOIN moderation.decisions d ON d.id = s.challenged_decision_id
    WHERE s.review_class = 'standard' AND s.state IN ('open', 'extended') AND s.closes_at > clock_timestamp()
      AND a.appellant_id <> $1 AND d.decided_by IS DISTINCT FROM $1 AND s.triaged_by IS DISTINCT FROM $1
      AND NOT EXISTS (SELECT 1 FROM moderation.community_voting_restrictions r WHERE r.subject_user_id = $1
        AND r.appeal_id = s.appeal_id AND r.starts_at <= clock_timestamp() AND r.expires_at > clock_timestamp())
    ORDER BY random() LIMIT 20`, [userId])).rows;
  const items = [];
  for (const row of candidates) items.push(await readCommunityAppeal(client, userId, row.appeal_id));
  return { state: items.length ? 'available' : 'no_case_available', items };
}

export async function assertCommunityTriageActor(client: Client, userId: string, session?: CommunitySession): Promise<void> {
  const admin = (await client.query(`SELECT 1 FROM identity.admin_memberships m JOIN identity.users u ON u.id = m.user_id
    WHERE m.user_id = $1 AND m.active AND m.role IN ('owner', 'administrator', 'moderator') AND u.status = 'active' AND u.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM moderation.community_voting_restrictions r WHERE r.subject_user_id = m.user_id
        AND r.reason_code = 'actual_conflict' AND (r.appeal_id IS NULL OR r.appeal_id = $2)
        AND r.starts_at <= clock_timestamp() AND r.expires_at > clock_timestamp())`, [userId, session?.appeal_id ?? null])).rowCount;
  if (!admin || session?.appellant_id === userId || session?.decided_by === userId) throw new Error('community_appeal_triage_not_allowed');
}
export async function communityTriageQueue(client: Client, userId: string, rulesVersion: string) {
  await communityConfiguration(client, rulesVersion);
  await assertCommunityTriageActor(client, userId);
  const items = (await client.query(`SELECT s.appeal_id AS "appealId", s.state, s.review_class AS "reviewClass",
    s.rules_version AS "rulesVersion" FROM moderation.community_appeal_sessions s
    JOIN moderation.appeals a ON a.id = s.appeal_id JOIN moderation.decisions d ON d.id = s.challenged_decision_id
    WHERE s.state IN ('submitted', 'restricted_review', 'unresolved') AND a.appellant_id <> $1 AND d.decided_by IS DISTINCT FROM $1
    ORDER BY a.created_at, a.id LIMIT 50`, [userId])).rows;
  return { items };
}
export async function readCommunityTriageEvidence(client: Client, userId: string, appealId: string) {
  const session = await communitySession(client, appealId);
  await assertCommunityTriageActor(client, userId, session);
  if (session.review_class === 'restricted') throw new Error('community_appeal_restricted_evidence_forbidden');
  const evidence = (await client.query('SELECT frozen_content, classifier_evidence FROM moderation.community_appeal_evidence WHERE appeal_id = $1', [appealId])).rows[0];
  return { appealId, state: session.state, challengedDecisionId: session.challenged_decision_id,
    version: session.source_event_id, evidenceHash: session.evidence_hash, evidence };
}
