import type { Client } from 'pg';
import { MONTHLY_REPUTATION_CATALOGUE_HASH, MONTHLY_REPUTATION_POLICY_VERSION } from '../../contracts/src/monthly-reputation-policy.ts';
import { validateMonthlyMaintenanceRules, type MonthlyMaintenanceRules, type MonthlyMaintenanceEvidence, type MaintenanceFacts } from '../../contracts/src/monthly-maintenance-policy.ts';
import { monthlyReputationShadowEnabled } from './monthly-reputation.ts';

export async function loadMonthlyMaintenanceConfiguration(client: Client, version: string, forCollection = false) {
  if (forCollection) {
    const schema = await client.query<{ available: boolean }>(`SELECT
      to_regclass('system.feature_flags') IS NOT NULL
      AND to_regclass('system.outbox_events') IS NOT NULL
      AND to_regclass('identity.email_verification_tokens') IS NOT NULL
      AND to_regclass('identity.email_credentials') IS NOT NULL
      AND to_regclass('identity.users') IS NOT NULL
      AND to_regclass('trust.monthly_maintenance_rule_sets') IS NOT NULL
      AND to_regclass('trust.monthly_maintenance_observations') IS NOT NULL
      AND to_regclass('trust.monthly_maintenance_revocations') IS NOT NULL AS available`);
    if (!schema.rows[0]?.available) return null;
    const flag = (await client.query<{ enabled: boolean; policy_version: string }>(
      'SELECT enabled, policy_version FROM system.feature_flags WHERE flag_key = $1', ['trust.monthly_reputation_shadow'])).rows[0];
    if (flag?.enabled !== true || flag.policy_version !== MONTHLY_REPUTATION_POLICY_VERSION) return null;
  } else if (!await monthlyReputationShadowEnabled(client)) return null;
  const row = (await client.query<{ configuration: MonthlyMaintenanceRules; collect_from: Date }>(
    `SELECT configuration, collect_from FROM trust.monthly_maintenance_rule_sets
      WHERE version = $1 AND policy_version = $2 AND catalogue_hash = $3 AND mode = 'shadow'
        AND (NOT $4::boolean OR collection_privacy_version = 'monthly-privacy-v1')`,
    [version, MONTHLY_REPUTATION_POLICY_VERSION, MONTHLY_REPUTATION_CATALOGUE_HASH, forCollection])).rows[0];
  if (!row) return null;
  validateMonthlyMaintenanceRules(row.configuration);
  return { rules: row.configuration, collectFrom: row.collect_from.toISOString() };
}

export async function recordMonthlyEmailControl(client: Client, input: {
  rulesVersion: string; sourceEventId: string; verificationTokenId: string;
}) {
  const configuration = await loadMonthlyMaintenanceConfiguration(client, input.rulesVersion, true);
  if (!configuration) return null;
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`monthly-email-control:${input.sourceEventId}`]);
  const existing = (await client.query<{ facts: MaintenanceFacts }>(
    'SELECT facts FROM trust.monthly_maintenance_observations WHERE source_event_id = $1', [input.sourceEventId])).rows[0];
  if (existing) {
    if (existing.facts.kind !== 'email_control' || existing.facts.emailVersion !== input.verificationTokenId) {
      throw new Error('monthly_maintenance_source_reused');
    }
    return { recorded: false };
  }
  const proof = (await client.query<{ user_id: string; performed_at: Date; email_binding_digest: Buffer }>(
    `SELECT credential.user_id, token.consumed_at AS performed_at,
       digest(credential.email_lookup_hmac, 'sha256') AS email_binding_digest
     FROM system.outbox_events event JOIN identity.email_verification_tokens token ON token.id = $2
     JOIN identity.email_credentials credential ON credential.user_id = token.user_id
     JOIN identity.users account ON account.id = credential.user_id
     WHERE event.id = $1 AND event.event_type = 'identity.email.verified' AND event.aggregate_type = 'user'
       AND event.aggregate_id = token.user_id AND event.actor_id = token.user_id
       AND token.consumed_at = event.created_at AND token.consumed_at = credential.verified_at
       AND token.consumed_at < token.expires_at AND token.superseded_at IS NULL
       AND account.status = 'active' AND account.deleted_at IS NULL
     FOR SHARE OF credential`, [input.sourceEventId, input.verificationTokenId])).rows[0];
  if (!proof) throw new Error('monthly_maintenance_canonical_email_required');
  if (proof.performed_at.toISOString() < configuration.collectFrom) return { recorded: false };
  const inserted = await client.query(`INSERT INTO trust.monthly_maintenance_observations
    (id, subject_user_id, source_event_id, kind, performed_at, facts, email_binding_digest)
    VALUES ($1, $2, $1, 'email_control', $3, $4::jsonb, $5) ON CONFLICT (source_event_id) DO NOTHING`,
  [input.sourceEventId, proof.user_id, proof.performed_at,
    JSON.stringify({ kind: 'email_control', emailVersion: input.verificationTokenId }), proof.email_binding_digest]);
  return { recorded: inserted.rowCount === 1 };
}

export async function readMonthlyMaintenanceEvidence(client: Client, subjectUserId: string, cutoff: string) {
  const rows = (await client.query<{ id: string; subject_user_id: string; performed_at: Date; facts: MaintenanceFacts; revoked_at: Date | null }>(
    `SELECT observation.id, observation.subject_user_id, observation.performed_at, observation.facts, revocation.revoked_at
     FROM trust.monthly_maintenance_observations observation
     LEFT JOIN trust.monthly_maintenance_revocations revocation ON revocation.observation_id = observation.id
     WHERE observation.subject_user_id = $1 AND (observation.performed_at < $2 OR observation.kind = 'integrity_assessment')
     ORDER BY observation.performed_at, observation.id`, [subjectUserId, cutoff])).rows;
  const evidence: MonthlyMaintenanceEvidence[] = rows.map(row => ({ id: row.id, subjectUserId: row.subject_user_id,
    performedAt: row.performed_at.toISOString(), revokedAt: row.revoked_at?.toISOString() ?? null, facts: row.facts }));
  return { evidence, observationIds: evidence.map(row => row.id), revocationIds: evidence.filter(row => row.revokedAt !== null).map(row => row.id) };
}
