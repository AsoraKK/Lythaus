import type { DatabaseClient } from './index.ts';
import type { WebAuthnCredential, AuthenticatorTransport } from '@simplewebauthn/server';
import type { Principal } from '@lythaus/security';

export interface PasskeyAccount {
  userId: string;
  status: string;
  tokenVersion: number;
}

export interface PasskeyCredential {
  id: string;
  user_id: string;
  rp_id: string;
  credential_id: string;
  public_key: Uint8Array;
  sign_count: string;
  user_handle: string;
  device_type: 'singleDevice' | 'multiDevice';
  backed_up: boolean;
  transports: AuthenticatorTransport[];
  name: string;
  revoked_at: string | null;
}

export interface PasskeyChallenge {
  id: string;
  user_id: string | null;
  token_version: number | null;
  purpose: 'register' | 'login' | 'maintenance';
  challenge: string;
  rp_id: string;
  origin: string;
  name: string | null;
}

export async function lockPasskeyAccount(client: DatabaseClient, userId: string, principal?: Principal): Promise<PasskeyAccount> {
  const result = await client.query<{ status: string; token_version: number }>(
    `SELECT status, token_version FROM identity.users WHERE id = $1 FOR UPDATE`, [userId]);
  const row = result.rows[0];
  const email = await client.query(`SELECT user_id FROM identity.email_credentials WHERE user_id = $1 AND verified_at IS NOT NULL`, [userId]);
  if (!row || row.status !== 'active' || email.rowCount !== 1
    || (principal && (principal.userId !== userId || principal.tokenVersion !== row.token_version))) {
    throw new Error('authentication_required');
  }
  return { userId, status: row.status, tokenVersion: row.token_version };
}

export async function lockPasskeyCredential(client: DatabaseClient, credentialId: string, rpId: string, userId: string): Promise<PasskeyCredential> {
  const result = await client.query<PasskeyCredential>(
    `SELECT c.*, s.user_handle FROM identity.passkey_credentials c
       JOIN identity.passkey_subjects s USING (user_id, rp_id)
      WHERE c.credential_id = $1 AND c.rp_id = $2 AND c.user_id = $3 AND c.revoked_at IS NULL
      FOR UPDATE OF c`, [credentialId, rpId, userId]);
  if (!result.rows[0]) throw new Error('passkey_invalid');
  return result.rows[0];
}

export function webAuthnCredential(row: PasskeyCredential): WebAuthnCredential {
  return { id: row.credential_id, publicKey: new Uint8Array(row.public_key), counter: Number(row.sign_count), transports: row.transports };
}

export async function recordPasskeyEvidence(client: DatabaseClient, id: string, userId: string, evidence: Record<string, unknown>): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO identity.account_events (id, user_id, event_type, metadata)
     VALUES ($1, $2, 'security.strong_auth_evidence', $3::jsonb)
     ON CONFLICT (user_id, (metadata->>'policyVersion'), (metadata->>'sourceKey'))
       WHERE event_type = 'security.strong_auth_evidence' DO NOTHING`,
    [id, userId, JSON.stringify(evidence)]);
  return result.rowCount === 1;
}
