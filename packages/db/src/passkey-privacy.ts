import type { DatabaseClient } from './index.ts';

async function passkeySchemaInstalled(client: DatabaseClient): Promise<boolean> {
  const result = await client.query<{ tables: number }>(`SELECT
    (to_regclass('identity.passkey_subjects') IS NOT NULL)::integer
    + (to_regclass('identity.passkey_credentials') IS NOT NULL)::integer
    + (to_regclass('identity.passkey_challenges') IS NOT NULL)::integer AS tables`);
  if (result.rows[0]?.tables === 0) return false;
  if (result.rows[0]?.tables !== 3) throw new Error('passkey_schema_incomplete');
  return true;
}

export async function exportPasskeyMetadata(client: DatabaseClient, userId: string): Promise<unknown[]> {
  if (!await passkeySchemaInstalled(client)) return [];
  const result = await client.query(`SELECT id, rp_id AS "rpId", name, device_type AS "deviceType",
    backed_up AS "backedUp", transports, created_at AS "createdAt", last_used_at AS "lastUsedAt",
    last_verified_at AS "lastVerifiedAt", revoked_at AS "revokedAt"
    FROM identity.passkey_credentials WHERE user_id = $1 ORDER BY created_at, id`, [userId]);
  return result.rows;
}

export async function reconcilePasskeyPrivacyLocations(client: DatabaseClient, userId: string): Promise<void> {
  if (!await passkeySchemaInstalled(client)) return;
  await client.query(`INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived,
     retention_class, legal_hold_state, deletion_state, last_verified_at)
    SELECT $1::uuid, 'planetscale', source.resource, source.kind, source.id, 'authoritative', 'account',
      CASE WHEN EXISTS (SELECT 1 FROM privacy.legal_holds WHERE subject_id = $1 AND active) THEN 'active' ELSE 'none' END,
      'present', now()
    FROM (
      SELECT DISTINCT 'identity.passkey_subjects' AS resource, 'passkey_subject' AS kind, user_id AS id
        FROM identity.passkey_subjects WHERE user_id = $1
      UNION ALL SELECT 'identity.passkey_credentials', 'passkey_credential', id
        FROM identity.passkey_credentials WHERE user_id = $1
      UNION ALL SELECT 'identity.passkey_challenges', 'passkey_challenge', id
        FROM identity.passkey_challenges WHERE user_id = $1
    ) source
    ON CONFLICT (subject_id, store_type, resource_reference, entity_type, entity_key)
    DO UPDATE SET legal_hold_state = EXCLUDED.legal_hold_state,
      deletion_state = 'present', last_verified_at = now()`, [userId]);
}

export async function erasePasskeyData(client: DatabaseClient, userId: string): Promise<void> {
  if (!await passkeySchemaInstalled(client)) return;
  const account = await client.query<{ status: string }>(
    `SELECT status FROM identity.users WHERE id = $1 FOR UPDATE`, [userId]);
  const hold = await client.query(`SELECT 1 FROM privacy.legal_holds WHERE subject_id = $1 AND active`, [userId]);
  if (!['locked', 'deleted'].includes(account.rows[0]?.status ?? '') || hold.rowCount !== 0) {
    throw new Error('passkey_erasure_blocked');
  }
  await client.query(`DELETE FROM identity.passkey_challenges WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM identity.passkey_subjects WHERE user_id = $1`, [userId]);
  await client.query(`UPDATE privacy.subject_data_locations SET deletion_state = 'deleted', last_verified_at = now()
    WHERE subject_id = $1 AND resource_reference IN
      ('identity.passkey_subjects', 'identity.passkey_credentials', 'identity.passkey_challenges')`, [userId]);
}

export async function purgeExpiredPasskeyChallenges(client: DatabaseClient): Promise<number> {
  if (!await passkeySchemaInstalled(client)) return 0;
  const result = await client.query(`DELETE FROM identity.passkey_challenges challenge
    WHERE expires_at < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM privacy.legal_holds hold WHERE hold.subject_id = challenge.user_id AND hold.active)`);
  return result.rowCount ?? 0;
}
