import type { Client } from 'pg';
import { uuidv7 } from '@lythaus/security';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../contracts/src/monthly-reputation-policy.ts';
import { isEligibleCommunityVoter } from '../../contracts/src/monthly-peer-appeal-policy.ts';
import { assertCommunityTriageActor, communityAudit, communityClassifierEvidence, communityConfiguration, communityDigest, communityEligibility,
  communityIso, communityNow, communityOutbox, communitySession } from './community-appeal-access.ts';

export async function submitCommunityAppeal(client: Client, input: {
  userId: string; caseId: string; statement: string; rulesVersion: string;
}) {
  await communityConfiguration(client, input.rulesVersion);
  if (typeof input.statement !== 'string' || !input.statement.trim() || input.statement.length > 2000) throw new Error('appeal_statement_required');
  const row = (await client.query<{ content_type: 'post' | 'comment'; content_id: string; source_event_id: string; decision_id: string }>(
    `SELECT c.content_type, c.content_id, c.source_event_id, d.id AS decision_id FROM moderation.cases c
     JOIN LATERAL (SELECT id, outcome FROM moderation.decisions WHERE case_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) d ON true
     WHERE c.id = $1 AND c.content_type IN ('post', 'comment') AND c.state IN ('open', 'resolved') AND d.outcome IN ('block', 'queue')
     FOR UPDATE OF c`, [input.caseId])).rows[0];
  if (!row) throw new Error('appeal_not_allowed');
  const table = row.content_type === 'post' ? 'content.posts' : 'content.comments';
  const content = (await client.query<{ author_id: string; body: string; declared_creation_mode: string; moderation_source_event_id: string; deleted_at: Date | null }>(
    `SELECT author_id, body, declared_creation_mode, moderation_source_event_id, deleted_at FROM ${table} WHERE id = $1 FOR SHARE`, [row.content_id])).rows[0];
  if (!content || content.author_id !== input.userId || content.deleted_at || content.moderation_source_event_id !== row.source_event_id) throw new Error('appeal_not_allowed');
  const existing = (await client.query<{ appeal_id: string; state: string }>(
    'SELECT appeal_id, state FROM moderation.community_appeal_sessions WHERE challenged_decision_id = $1', [row.decision_id])).rows[0];
  if (existing) return { appealId: existing.appeal_id, state: existing.state, policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, created: false };
  const legacy = await client.query(`SELECT 1 FROM moderation.appeals WHERE case_id = $1 AND appellant_id = $2
    AND state = 'open' AND policy_version <> $3`, [input.caseId, input.userId, MONTHLY_REPUTATION_POLICY_VERSION]);
  if (legacy.rowCount) throw new Error('community_appeal_legacy_case_pending');
  const id = uuidv7(), now = await communityNow(client);
  const classifiers = await communityClassifierEvidence(client, row.content_type, row.content_id, row.source_event_id);
  await client.query(`INSERT INTO moderation.appeals (id, case_id, appellant_id, statement, risk_class, policy_version, state)
    VALUES ($1, $2, $3, $4, 'standard', $5, 'submitted')`, [id, input.caseId, input.userId, input.statement.trim(), MONTHLY_REPUTATION_POLICY_VERSION]);
  await client.query(`INSERT INTO moderation.community_appeal_sessions
    (appeal_id, rules_version, challenged_decision_id, source_event_id, content_type, content_id, content_hash, evidence_hash)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, input.rulesVersion, row.decision_id, row.source_event_id,
    row.content_type, row.content_id, await communityDigest({ body: content.body, declaration: content.declared_creation_mode }), await communityDigest(classifiers)]);
  await client.query(`INSERT INTO moderation.community_appeal_evidence (appeal_id, frozen_content, classifier_evidence)
    VALUES ($1, $2::jsonb, $3::jsonb)`, [id, JSON.stringify({ body: content.body, declaration: content.declared_creation_mode }), JSON.stringify(classifiers)]);
  await communityAudit(client, { appeal_id: id }, 'submitted', input.userId, { decisionId: row.decision_id }, now);
  await communityOutbox(client, id, 'moderation.community_appeal.submitted', { state: 'submitted' });
  return { appealId: id, state: 'submitted', policyVersion: MONTHLY_REPUTATION_POLICY_VERSION, created: true };
}

export async function triageCommunityAppeal(client: Client, input: {
  appealId: string; actorId: string; reviewClass: 'standard' | 'restricted'; safePreview?: string; ruleContext?: string; reasonCode: string;
}) {
  const session = await communitySession(client, input.appealId, true);
  const configuration = await communityConfiguration(client, session.rules_version);
  await assertCommunityTriageActor(client, input.actorId, session);
  if (session.state !== 'submitted') throw new Error('community_appeal_state_conflict');
  if (!['standard', 'restricted'].includes(input.reviewClass) || !/^[a-z][a-z0-9_]{1,79}$/.test(input.reasonCode)) throw new Error('community_appeal_triage_invalid');
  if (input.reviewClass === 'standard' && (typeof input.safePreview !== 'string' || !input.safePreview.trim() || input.safePreview.length > 100000
    || typeof input.ruleContext !== 'string' || !input.ruleContext.trim() || input.ruleContext.length > 4000)) throw new Error('community_appeal_safe_evidence_required');
  if (input.reviewClass === 'restricted' && (input.safePreview || input.ruleContext)) throw new Error('community_appeal_restricted_evidence_forbidden');
  const now = await communityNow(client);
  const closesAt = input.reviewClass === 'standard' ? new Date(Date.parse(now) + configuration.rules.initialHours * 3_600_000).toISOString() : null;
  const state = input.reviewClass === 'standard' ? 'open' : 'restricted_review';
  await communityAudit(client, session, 'triaged', input.actorId, { reviewClass: input.reviewClass, reasonCode: input.reasonCode }, now);
  await client.query(`UPDATE moderation.community_appeal_sessions SET review_class = $2, state = $3, safe_preview = $4,
    rule_context = $5, triaged_by = $6, opens_at = $7, closes_at = $8 WHERE appeal_id = $1`,
    [input.appealId, input.reviewClass, state, input.safePreview?.trim() ?? null, input.ruleContext?.trim() ?? null,
      input.actorId, input.reviewClass === 'standard' ? now : null, closesAt]);
  await client.query('UPDATE moderation.appeals SET state = $2, expires_at = $3 WHERE id = $1', [input.appealId, state, closesAt]);
  await communityAudit(client, session, state, input.actorId, { closesAt }, now);
  await communityOutbox(client, input.appealId, `moderation.community_appeal.${state}`, { state, closesAt });
  return { appealId: input.appealId, state, opensAt: input.reviewClass === 'standard' ? now : null, closesAt };
}

export interface CommunityBallotInput {
  appealId: string; userId: string; expectedRevision: number; idempotencyKey: string;
  choice: 'allow' | 'retain' | 'recuse' | 'cannot_assess';
  reasonCode: 'rule_misapplied' | 'rule_applies' | 'insufficient_context' | 'conflict'; contextAcknowledged: boolean;
}
export async function castCommunityBallot(client: Client, input: CommunityBallotInput) {
  const reasons = { allow: ['rule_misapplied'], retain: ['rule_applies'], recuse: ['conflict'], cannot_assess: ['insufficient_context'] };
  if (!Object.hasOwn(reasons, input.choice) || !reasons[input.choice].includes(input.reasonCode) || input.contextAcknowledged !== true
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('appeal_vote_invalid');
  if (typeof input.idempotencyKey !== 'string' || !input.idempotencyKey.trim() || input.idempotencyKey.length > 200) throw new Error('idempotency_key_required');
  const session = await communitySession(client, input.appealId, true);
  const configuration = await communityConfiguration(client, session.rules_version);
  const existing = (await client.query<{ id: string; ballot_id: string; revision: number; choice: string; reason_code: string; idempotency_key: string; cast_at: Date }>(
    `SELECT r.* FROM moderation.community_appeal_ballots b JOIN moderation.community_appeal_ballot_revisions r ON r.ballot_id = b.id
      WHERE b.appeal_id = $1 AND b.voter_user_id = $2 ORDER BY r.revision DESC`, [input.appealId, input.userId])).rows;
  const replay = existing.find(row => row.idempotency_key === input.idempotencyKey);
  if (replay) {
    if (replay.choice !== input.choice || replay.reason_code !== input.reasonCode || replay.revision !== input.expectedRevision + 1) throw new Error('idempotency_key_conflict');
    return { ballotId: replay.ballot_id, revision: replay.revision, choice: replay.choice, castAt: communityIso(replay.cast_at), created: false };
  }
  const now = await communityNow(client);
  if (session.review_class !== 'standard' || !['open', 'extended'].includes(session.state) || !session.closes_at || !session.opens_at
    || now >= communityIso(session.closes_at) || now < communityIso(session.opens_at)) throw new Error('community_appeal_closed');
  if (!isEligibleCommunityVoter(await communityEligibility(client, input.userId, session))) throw new Error('appeal_vote_not_allowed');
  const previous = existing[0];
  if ((previous?.revision ?? 0) !== input.expectedRevision) throw new Error('community_appeal_revision_conflict');
  if (previous && !configuration.ballotChangesAllowed) throw new Error('appeal_vote_locked');
  const ballotId = previous?.ballot_id ?? uuidv7(), revision = input.expectedRevision + 1;
  if (!previous) await client.query(`INSERT INTO moderation.community_appeal_ballots (id, appeal_id, voter_user_id) VALUES ($1, $2, $3)`, [ballotId, input.appealId, input.userId]);
  const inserted = await client.query<{ cast_at: Date }>(`WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS cast_at)
    INSERT INTO moderation.community_appeal_ballot_revisions
    (id, ballot_id, revision, weight, choice, reason_code, context_acknowledged, idempotency_key, cast_at)
    SELECT $1, $2, $3, 1, $4, $5, true, $6, cast_at FROM instant WHERE cast_at >= $7 AND cast_at < $8 RETURNING cast_at`,
    [uuidv7(), ballotId, revision, input.choice, input.reasonCode, input.idempotencyKey, session.opens_at, session.closes_at]);
  if (!inserted.rows[0]) throw new Error('community_appeal_closed');
  const castAt = communityIso(inserted.rows[0].cast_at);
  await communityAudit(client, session, 'ballot_recorded', input.userId, { ballotId, revision }, castAt);
  return { ballotId, revision, choice: input.choice, castAt, created: true };
}

export async function withdrawCommunityAppeal(client: Client, appealId: string, userId: string) {
  const session = await communitySession(client, appealId, true);
  if (session.appellant_id !== userId) throw new Error('appeal_not_found');
  if (session.state === 'withdrawn') return { appealId, state: 'withdrawn' };
  if (!['submitted', 'restricted_review', 'open', 'extended'].includes(session.state)
    || (session.closes_at && await communityNow(client) >= communityIso(session.closes_at))) throw new Error('community_appeal_closed');
  await client.query("UPDATE moderation.community_appeal_sessions SET state = 'withdrawn' WHERE appeal_id = $1", [appealId]);
  await client.query("UPDATE moderation.appeals SET state = 'withdrawn' WHERE id = $1", [appealId]);
  await communityAudit(client, session, 'withdrawn', userId, {}, await communityNow(client));
  await communityOutbox(client, appealId, 'moderation.community_appeal.withdrawn', { state: 'withdrawn' });
  return { appealId, state: 'withdrawn' };
}
