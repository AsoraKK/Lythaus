import type { Client } from 'pg';
import { MONTHLY_REPUTATION_POLICY_VERSION } from '../../contracts/src/monthly-reputation-policy.ts';
import { loadMonthlyMaintenanceConfiguration } from './monthly-maintenance.ts';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX = /^[0-9a-f]{64}$/i;

function requireUuidV7(value: string): void {
  if (typeof value !== 'string' || !UUID_V7.test(value)) throw new Error('monthly_email_renewal_request_invalid');
}

async function requestDigest(value: { subjectUserId: string; rulesVersion: string; tokenHash: string }): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function requireRenewalConfiguration(client: Client, version: string): Promise<void> {
  const renewalFlag = await client.query<{ enabled: boolean; policy_version: string }>(
    `SELECT enabled, policy_version FROM system.feature_flags
      WHERE flag_key = 'trust.monthly_email_renewal'`);
  const configuration = await loadMonthlyMaintenanceConfiguration(client, version, true);
  if (renewalFlag.rows[0]?.enabled !== true || renewalFlag.rows[0].policy_version !== MONTHLY_REPUTATION_POLICY_VERSION
    || !configuration) {
    throw new Error('monthly_email_renewal_unavailable');
  }
  const collection = await client.query<{ started: boolean }>(
    `SELECT rules.collect_from <= clock_timestamp() AS started
       FROM trust.monthly_maintenance_rule_sets rules WHERE rules.version = $1`, [version]);
  if (collection.rows[0]?.started !== true) throw new Error('monthly_email_renewal_unavailable');
}

export async function createMonthlyEmailRenewalChallenge(client: Client, input: {
  subjectUserId: string; challengeId: string; tokenHash: string; idempotencyKey: string; rulesVersion: string;
}) {
  requireUuidV7(input.subjectUserId);
  requireUuidV7(input.challengeId);
  requireUuidV7(input.idempotencyKey);
  if (!SHA256_HEX.test(input.tokenHash) || typeof input.rulesVersion !== 'string' || !input.rulesVersion) {
    throw new Error('monthly_email_renewal_request_invalid');
  }
  await requireRenewalConfiguration(client, input.rulesVersion);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-email-renewal-subject:${input.subjectUserId}`]);
  const subject = await client.query<{ email_binding_digest: string }>(
    `SELECT encode(public.digest(credential.email_lookup_hmac, 'sha256'), 'hex') AS email_binding_digest
       FROM identity.users account JOIN identity.email_credentials credential ON credential.user_id = account.id
      WHERE account.id = $1 AND account.status = 'active' AND account.deleted_at IS NULL
        AND credential.verified_at IS NOT NULL FOR SHARE OF account, credential`, [input.subjectUserId]);
  if (!subject.rows[0]) throw new Error('monthly_email_renewal_subject_unavailable');
  const digest = await requestDigest({ subjectUserId: input.subjectUserId, rulesVersion: input.rulesVersion, tokenHash: input.tokenHash.toLowerCase() });
  const replay = await client.query<{ id: string; expires_at: Date; request_digest: string }>(
    `SELECT id, expires_at, request_digest FROM trust.monthly_email_renewal_challenges
      WHERE subject_user_id = $1 AND idempotency_key = $2 FOR UPDATE`, [input.subjectUserId, input.idempotencyKey]);
  if (replay.rows[0]) {
    if (replay.rows[0].request_digest !== digest) throw new Error('monthly_email_renewal_idempotency_reused');
    return { created: false, challengeId: replay.rows[0].id, expiresAt: replay.rows[0].expires_at.toISOString() };
  }
  await client.query(`UPDATE trust.monthly_email_renewal_challenges SET invalidated_at = clock_timestamp()
    WHERE subject_user_id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL`, [input.subjectUserId]);
  const inserted = await client.query<{ id: string; expires_at: Date }>(
    `INSERT INTO trust.monthly_email_renewal_challenges
      (id, subject_user_id, token_hash, email_binding_digest, rules_version, idempotency_key, request_digest, expires_at)
     VALUES ($1, $2, decode($3, 'hex'), decode($4, 'hex'), $5, $6, $7,
       clock_timestamp() + interval '30 minutes') RETURNING id, expires_at`,
    [input.challengeId, input.subjectUserId, input.tokenHash.toLowerCase(), subject.rows[0].email_binding_digest,
      input.rulesVersion, input.idempotencyKey, digest]);
  return { created: true, challengeId: inserted.rows[0].id, expiresAt: inserted.rows[0].expires_at.toISOString() };
}

export async function consumeMonthlyEmailRenewalChallenge(client: Client, input: { tokenHash: string; sourceEventId: string }) {
  requireUuidV7(input.sourceEventId);
  if (!SHA256_HEX.test(input.tokenHash)) throw new Error('monthly_email_renewal_request_invalid');
  const identified = await client.query<{ id: string; subject_user_id: string; rules_version: string }>(
    `SELECT id, subject_user_id, rules_version FROM trust.monthly_email_renewal_challenges
      WHERE token_hash = decode($1, 'hex')`, [input.tokenHash.toLowerCase()]);
  const initial = identified.rows[0];
  if (!initial) throw new Error('monthly_email_renewal_challenge_invalid');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-email-renewal-subject:${initial.subject_user_id}`]);
  await requireRenewalConfiguration(client, initial.rules_version);
  const subject = await client.query<{ email_binding_digest: string }>(
    `SELECT encode(public.digest(credential.email_lookup_hmac, 'sha256'), 'hex') AS email_binding_digest
       FROM identity.users account JOIN identity.email_credentials credential ON credential.user_id = account.id
      WHERE account.id = $1 AND account.status = 'active' AND account.deleted_at IS NULL
        AND credential.verified_at IS NOT NULL FOR SHARE OF account, credential`, [initial.subject_user_id]);
  if (!subject.rows[0]) throw new Error('monthly_email_renewal_subject_unavailable');
  const challenge = await client.query<{ id: string; subject_user_id: string; rules_version: string; email_binding_digest: Buffer;
      consumed_at: Date | null; invalidated_at: Date | null; source_event_id: string | null }>(
    `SELECT id, subject_user_id, rules_version, email_binding_digest, consumed_at, invalidated_at, source_event_id
       FROM trust.monthly_email_renewal_challenges WHERE id = $1 AND token_hash = decode($2, 'hex') FOR UPDATE`,
    [initial.id, input.tokenHash.toLowerCase()]);
  const row = challenge.rows[0];
  if (!row) throw new Error('monthly_email_renewal_challenge_invalid');
  if (row.consumed_at) {
    const proof = await client.query<{ source_event_id: string; performed_at: string }>(
      `SELECT source_event_id,
         to_char(performed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS performed_at
         FROM trust.monthly_maintenance_observations
        WHERE subject_user_id = $1 AND facts ->> 'emailVersion' = $2 AND kind = 'email_control'`, [row.subject_user_id, row.id]);
    if (!proof.rows[0] || proof.rows[0].source_event_id !== row.source_event_id) {
      throw new Error('monthly_email_renewal_receipt_incomplete');
    }
    return { created: false, challengeId: row.id, sourceEventId: proof.rows[0].source_event_id, performedAt: proof.rows[0].performed_at };
  }
  if (row.invalidated_at || row.email_binding_digest.toString('hex') !== subject.rows[0].email_binding_digest) {
    throw new Error('monthly_email_renewal_challenge_invalid');
  }
  const collision = await client.query('SELECT 1 FROM system.outbox_events WHERE id = $1 UNION ALL SELECT 1 FROM trust.monthly_maintenance_observations WHERE id = $1', [input.sourceEventId]);
  if (collision.rowCount) throw new Error('monthly_email_renewal_source_reused');
  const consumed = await client.query<{ consumed_at: string }>(
    `UPDATE trust.monthly_email_renewal_challenges SET consumed_at = clock_timestamp(), source_event_id = $2
      WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > clock_timestamp()
      RETURNING to_char(consumed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS consumed_at`, [row.id, input.sourceEventId]);
  if (!consumed.rows[0]) throw new Error('monthly_email_renewal_challenge_invalid');
  const performedAt = consumed.rows[0].consumed_at;
  const event = await client.query(`INSERT INTO system.outbox_events
    (id, event_type, aggregate_type, aggregate_id, actor_id, payload, created_at)
    SELECT $1, 'identity.email.renewed', 'monthly_email_renewal', $2, $3, $4::jsonb, challenge.consumed_at
      FROM trust.monthly_email_renewal_challenges challenge
     WHERE challenge.id = $2 AND challenge.source_event_id = $1 AND challenge.consumed_at IS NOT NULL
    RETURNING id`,
  [input.sourceEventId, row.id, row.subject_user_id,
    JSON.stringify({ userId: row.subject_user_id, challengeId: row.id, rulesVersion: row.rules_version })]);
  if (event.rowCount !== 1) throw new Error('monthly_email_renewal_receipt_incomplete');
  const observation = await client.query(`INSERT INTO trust.monthly_maintenance_observations
    (id, subject_user_id, source_event_id, kind, performed_at, facts, email_binding_digest)
    SELECT $1, $2, $1, 'email_control', challenge.consumed_at, $3::jsonb, challenge.email_binding_digest
      FROM trust.monthly_email_renewal_challenges challenge
     WHERE challenge.id = $4 AND challenge.source_event_id = $1 AND challenge.consumed_at IS NOT NULL
    RETURNING id`,
  [input.sourceEventId, row.subject_user_id, JSON.stringify({ kind: 'email_control', emailVersion: row.id }), row.id]);
  if (observation.rowCount !== 1) throw new Error('monthly_email_renewal_receipt_incomplete');
  return { created: true, challengeId: row.id, sourceEventId: input.sourceEventId, performedAt };
}
