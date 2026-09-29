import { lockAuthDelivery, type DatabaseClient } from '@lythaus/db';
import { uuidv7, type PasswordHash } from '@lythaus/security';

export async function persistRecoveryIntake(client: DatabaseClient, correlation: string, work: () => Promise<string>): Promise<string> {
  await client.query('SAVEPOINT recovery_intake');
  let outcome: string;
  try {
    outcome = await work();
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT recovery_intake');
    outcome = 'failed';
  }
  await client.query('RELEASE SAVEPOINT recovery_intake');
  await client.query(`INSERT INTO system.audit_events(id,action,reason_code,correlation_id,metadata)
    VALUES($1,'auth.recovery.intake',$2,$3,'{}'::jsonb)`, [uuidv7(),outcome,correlation]);
  return outcome;
}

export interface RecoveryAccount {
  id: string;
  status: string;
  protected_identity: boolean;
  contact_ciphertext: string | null;
  contact_key_version: string | null;
  contact_lookup: string | null;
  contact_verified: boolean;
  credential_lookup: string | null;
  credential_verified: boolean;
}

export function recoveryPlan(account: RecoveryAccount | undefined): 'reset_password' | 'credential_setup' | 'suppressed' | 'support_required' {
  if (!account || !['active', 'relink_required'].includes(account.status)) return 'suppressed';
  if (account.protected_identity) return 'support_required';
  if (!account.contact_ciphertext || !account.contact_lookup || account.contact_key_version !== 'v1') return 'support_required';
  if (account.credential_lookup && account.credential_lookup !== account.contact_lookup) return 'support_required';
  if (!account.credential_lookup && !account.contact_verified) return 'support_required';
  return account.credential_verified && account.status === 'active' ? 'reset_password' : 'credential_setup';
}

export async function lockRecoveryAccount(client: DatabaseClient, userId: string): Promise<RecoveryAccount | undefined> {
  await lockAuthDelivery(client, userId);
  await client.query('SELECT id FROM identity.users WHERE id=$1 FOR UPDATE', [userId]);
  const result = await client.query<RecoveryAccount>(
    `SELECT u.id, u.status,
            EXISTS (SELECT 1 FROM identity.admin_memberships a WHERE a.user_id=u.id) AS protected_identity,
            convert_from(e.email_ciphertext,'utf8') AS contact_ciphertext,
            e.encryption_key_version AS contact_key_version,
            encode(e.email_lookup_hmac,'base64') AS contact_lookup,
            e.verified_at IS NOT NULL AS contact_verified,
            encode(c.email_lookup_hmac,'base64') AS credential_lookup,
            c.verified_at IS NOT NULL AS credential_verified
       FROM identity.users u
       LEFT JOIN identity.contact_emails e ON e.user_id=u.id
       LEFT JOIN identity.email_credentials c ON c.user_id=u.id
      WHERE u.id=$1`, [userId]);
  return result.rows[0];
}

export async function findRecoveryUser(client: DatabaseClient, lookup: string): Promise<string | undefined> {
  const result = await client.query<{ user_id: string }>(
    `SELECT user_id FROM identity.contact_emails WHERE email_lookup_hmac=decode($1,'base64')
     UNION SELECT user_id FROM identity.email_credentials WHERE email_lookup_hmac=decode($1,'base64')`, [lookup]);
  return result.rows.length === 1 ? result.rows[0].user_id : undefined;
}

export async function claimRegistrationAddress(client: DatabaseClient, lookup: string): Promise<boolean> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,9271))', [lookup]);
  const existing = await client.query(
    `SELECT user_id FROM identity.contact_emails WHERE email_lookup_hmac=decode($1,'base64')
     UNION SELECT user_id FROM identity.email_credentials WHERE email_lookup_hmac=decode($1,'base64')`, [lookup]);
  return existing.rowCount === 0;
}

export async function establishVerifiedCredential(client: DatabaseClient, account: RecoveryAccount, passwordHash: PasswordHash): Promise<void> {
  if (recoveryPlan(account) !== 'credential_setup') throw new Error('verification_token_invalid');
  const credential = await client.query(
    `INSERT INTO identity.email_credentials
       (user_id,email_ciphertext,email_lookup_hmac,encryption_key_version,hmac_key_version,password_hash,verified_at)
     VALUES($1,convert_to($2,'utf8'),decode($3,'base64'),'v1','v1',$4::jsonb,now())
     ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,verified_at=now(),updated_at=now()
       WHERE identity.email_credentials.verified_at IS NULL OR $5='relink_required'`,
    [account.id, account.contact_ciphertext, account.contact_lookup, JSON.stringify(passwordHash), account.status]);
  if (credential.rowCount !== 1) throw new Error('verification_token_invalid');
  await client.query('UPDATE identity.contact_emails SET verified_at=COALESCE(verified_at,now()),updated_at=now() WHERE user_id=$1', [account.id]);
  await client.query("UPDATE identity.users SET status='active',token_version=token_version+1,updated_at=now() WHERE id=$1 AND status IN ('active','relink_required')", [account.id]);
  await client.query('UPDATE identity.auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [account.id]);
  await client.query('UPDATE identity.refresh_token_families SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [account.id]);
}
