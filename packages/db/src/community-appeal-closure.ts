import type { Client } from 'pg';
import { uuidv7 } from '@lythaus/security';
import { enforceContentDeclaration } from '../../contracts/src/content-policy.ts';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../contracts/src/monthly-reputation-policy.ts';
import { evaluateProposedCommunityAppeal, isEligibleCommunityVoter, type CommunityBallotRevision } from '../../contracts/src/monthly-peer-appeal-policy.ts';
import { communityAudit, communityClassifierEvidence, communityConfiguration, communityDigest, communityEligibility,
  communityIso, communityNow, communityOutbox, communitySession, type CommunitySession } from './community-appeal-access.ts';

async function notifyCommunityParticipants(client: Client, session: CommunitySession, eventId: string, type: string) {
  const recipients = (await client.query<{ id: string }>(`SELECT u.id FROM identity.users u WHERE u.deleted_at IS NULL AND u.status <> 'deleted'
    AND (u.id = $1 OR EXISTS (SELECT 1 FROM moderation.community_appeal_ballots b WHERE b.appeal_id = $2 AND b.voter_user_id = u.id))
    AND COALESCE((SELECT moderation_enabled FROM feed.notification_preferences WHERE user_id = u.id), true)`, [session.appellant_id, session.appeal_id])).rows;
  for (const recipient of recipients) await client.query(`INSERT INTO feed.notifications
    (id, recipient_id, notification_type, entity_id, source_event_id, policy_version)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, [uuidv7(), recipient.id, type, session.appeal_id, eventId, session.policy_version]);
}

async function restoreChallengedContent(client: Client, session: CommunitySession, now: string) {
  await client.query(`INSERT INTO moderation.community_appeal_overrides
    (appeal_id, decision_id, content_type, content_id, source_event_id, content_hash, evidence_hash, recorded_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [session.appeal_id, session.challenged_decision_id, session.content_type,
    session.content_id, session.source_event_id, session.content_hash, session.evidence_hash, now]);
  const table = session.content_type === 'post' ? 'content.posts' : 'content.comments';
  const content = (await client.query<{ body: string; declared_creation_mode: string; author_id: string; post_id: string | null; parent_id: string | null;
    moderation_source_event_id: string; deleted_at: Date | null }>(
    `SELECT body, declared_creation_mode, author_id, moderation_source_event_id, deleted_at,
      ${session.content_type === 'post' ? 'NULL::uuid AS post_id, NULL::uuid AS parent_id' : 'post_id, parent_id'}
     FROM ${table} WHERE id = $1 FOR UPDATE`, [session.content_id])).rows[0];
  if (!content || content.deleted_at || content.moderation_source_event_id !== session.source_event_id
    || await communityDigest({ body: content.body, declaration: content.declared_creation_mode }) !== session.content_hash) return 'content_changed_or_deleted';
  const hold = await client.query(`SELECT 1 FROM moderation.cases c
    JOIN LATERAL (SELECT id, outcome FROM moderation.decisions WHERE case_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) d ON true
    WHERE c.content_type = $1 AND c.content_id = $2 AND c.source_event_id = $3 AND c.state <> 'superseded'
      AND d.outcome IN ('block', 'queue') AND d.id <> $4 LIMIT 1`,
    [session.content_type, session.content_id, session.source_event_id, session.challenged_decision_id]);
  if (hold.rowCount) return 'independent_hold';
  let label: string;
  try { label = enforceContentDeclaration({ body: content.body, declaredCreationMode: content.declared_creation_mode }).publicLabel; }
  catch { return 'publication_rule_hold'; }
  if (session.content_type === 'post') {
    const declaration = await client.query(`UPDATE content.content_declarations SET public_label = $2, review_required = false, updated_at = $3 WHERE post_id = $1`, [session.content_id, label, now]);
    if (declaration.rowCount !== 1) throw new Error('moderation_declaration_missing');
    await client.query(`UPDATE content.posts SET moderation_state = 'allowed', published_at = COALESCE(published_at, $2), updated_at = $2 WHERE id = $1`, [session.content_id, now]);
  } else {
    await client.query("UPDATE content.comments SET moderation_state = 'allowed', updated_at = $2 WHERE id = $1", [session.content_id, now]);
  }
  const decisionId = uuidv7();
  await client.query(`INSERT INTO moderation.decisions (id, case_id, outcome, public_label, policy_version, created_at)
    VALUES ($1, $2, 'allow', $3, $4, $5)`, [decisionId, session.case_id, label, MONTHLY_REPUTATION_POLICY_VERSION, now]);
  await client.query("UPDATE moderation.cases SET state = 'resolved', resolved_at = $2 WHERE id = $1", [session.case_id, now]);
  await client.query(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [uuidv7(), `content.${session.content_type}.published`, session.content_type,
    session.content_id, session.appellant_id, JSON.stringify({ authorId: session.appellant_id, contentId: session.content_id,
      contentType: session.content_type, declaredCreationMode: content.declared_creation_mode, reasonCode: 'community_appeal_allow',
      sourceEventId: session.source_event_id, appealId: session.appeal_id, decisionId, policyVersion: MONTHLY_REPUTATION_POLICY_VERSION,
      ...(session.content_type === 'comment' ? { postId: content.post_id, parentId: content.parent_id } : {}) })]);
  return 'restored';
}

export async function closeCommunityAppeal(client: Client, appealId: string) {
  const session = await communitySession(client, appealId, true);
  const existing = (await client.query('SELECT result, restoration FROM moderation.community_appeal_outcomes WHERE appeal_id = $1', [appealId])).rows[0];
  if (existing) return { ...existing, created: false };
  if (session.review_class !== 'standard' || !['open', 'extended'].includes(session.state)) return { state: session.state, created: false };
  const configuration = await communityConfiguration(client, session.rules_version);
  const now = await communityNow(client);
  if (!session.closes_at || !session.opens_at || now < communityIso(session.closes_at)) return { state: session.state, created: false };
  await client.query("UPDATE moderation.community_appeal_sessions SET state = 'closing' WHERE appeal_id = $1", [appealId]);
  const rows = (await client.query<{ id: string; ballot_id: string; voter_user_id: string; revision: number; choice: CommunityBallotRevision['choice']; cast_at: Date }>(
    `SELECT r.id, b.id AS ballot_id, b.voter_user_id, r.revision, r.choice, r.cast_at FROM moderation.community_appeal_ballots b
     JOIN LATERAL (SELECT * FROM moderation.community_appeal_ballot_revisions WHERE ballot_id = b.id ORDER BY revision DESC LIMIT 1) r ON true
     WHERE b.appeal_id = $1 ORDER BY b.id`, [appealId])).rows;
  const ballots: CommunityBallotRevision[] = [];
  for (const row of rows) ballots.push({ policyVersion: session.policy_version, voterUserId: row.voter_user_id,
    revision: row.revision, weight: 1, choice: row.choice, castAt: communityIso(row.cast_at), valid: true,
    eligibility: await communityEligibility(client, row.voter_user_id, session) });
  const result = evaluateProposedCommunityAppeal({ policyVersion: session.policy_version, reviewClass: 'standard',
    opensAt: communityIso(session.opens_at), closesAt: communityIso(session.closes_at), evaluatedAt: now,
    extensions: session.extensions, rules: configuration.rules, ballots });
  if (result.status === 'open' || result.status === 'restricted_review') throw new Error('community_appeal_closure_invalid');
  if (result.status === 'extension_required') {
    const closesAt = new Date(Date.parse(communityIso(session.closes_at)) + configuration.rules.extensionHours * 3_600_000).toISOString();
    await client.query(`UPDATE moderation.community_appeal_sessions SET state = 'extended', extensions = extensions + 1, closes_at = $2 WHERE appeal_id = $1`, [appealId, closesAt]);
    await client.query("UPDATE moderation.appeals SET state = 'extended', expires_at = $2 WHERE id = $1", [appealId, closesAt]);
    await communityAudit(client, session, 'extended', null, { reason: result.reason, closesAt }, now);
    const eventId = await communityOutbox(client, appealId, 'moderation.community_appeal.extended', { state: 'extended', closesAt });
    await notifyCommunityParticipants(client, session, eventId, 'appeals.community_extended');
    return { state: 'extended', closesAt, created: true };
  }
  const restoration = result.status === 'resolved_allow' ? await restoreChallengedContent(client, session, now) : 'not_applicable';
  await client.query(`INSERT INTO moderation.community_appeal_outcomes (appeal_id, result, restoration, recorded_at)
    VALUES ($1, $2::jsonb, $3, $4)`, [appealId, JSON.stringify(result), restoration, now]);
  for (let index = 0; index < ballots.length; index++) {
    const ballot = ballots[index], row = rows[index];
    if (!isEligibleCommunityVoter(ballot.eligibility) || !['allow', 'retain'].includes(ballot.choice)) continue;
    await client.query(`INSERT INTO moderation.community_appeal_valid_participation (ballot_id, revision_id, performed_at, recorded_at)
      SELECT ballot_id, id, cast_at, $3 FROM moderation.community_appeal_ballot_revisions WHERE id = $2 AND ballot_id = $1`,
    [row.ballot_id, row.id, now]);
  }
  await client.query('UPDATE moderation.community_appeal_sessions SET state = $2, resolved_at = $3 WHERE appeal_id = $1', [appealId, result.status, now]);
  await client.query('UPDATE moderation.appeals SET state = $2, resolved_at = $3 WHERE id = $1', [appealId, result.status, now]);
  await communityAudit(client, session, result.status, null, { ...result, restoration }, now);
  const eventId = await communityOutbox(client, appealId, 'moderation.community_appeal.resolved', { state: result.status, restoration });
  await notifyCommunityParticipants(client, session, eventId, 'appeals.community_resolved');
  return { result, restoration, created: true };
}

export async function identicalCommunityAppealOverride(client: Client, input: {
  contentType: 'post' | 'comment'; contentId: string; sourceEventId: string; body: string; declaredCreationMode: string;
}): Promise<boolean> {
  const overrides = (await client.query<{ evidence_hash: string }>(`SELECT evidence_hash FROM moderation.community_appeal_overrides
    WHERE content_type = $1 AND content_id = $2 AND source_event_id = $3 AND content_hash = $4`,
    [input.contentType, input.contentId, input.sourceEventId, await communityDigest({ body: input.body, declaration: input.declaredCreationMode })])).rows;
  if (!overrides.length) return false;
  const hash = await communityDigest(await communityClassifierEvidence(client, input.contentType, input.contentId, input.sourceEventId));
  return overrides.some(row => row.evidence_hash === hash);
}
