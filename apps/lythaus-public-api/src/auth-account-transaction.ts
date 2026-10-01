import type { DatabaseClient } from '@lythaus/db';
import type { PasswordHash } from '@lythaus/security';
import type { AuthAccount, RefreshSessionRecord } from './auth-session-runtime.ts';

export async function lockLoginAccount(
  client: DatabaseClient,
  userId: string,
  verifiedPasswordHash: PasswordHash,
): Promise<AuthAccount | undefined> {
  const account = await client.query<{ status: string; token_version: number }>(
    `SELECT status, token_version FROM identity.users WHERE id = $1 FOR UPDATE`, [userId]);
  if (!account.rows[0] || account.rows[0].status !== 'active') return undefined;
  const credential = await client.query(
    `SELECT user_id FROM identity.email_credentials
      WHERE user_id = $1 AND verified_at IS NOT NULL AND password_hash = $2::jsonb`,
    [userId, JSON.stringify(verifiedPasswordHash)]);
  if (credential.rowCount !== 1) return undefined;
  return { status: account.rows[0].status, tokenVersion: Number(account.rows[0].token_version) };
}

export async function lockRefreshSession(client: DatabaseClient, tokenHash: string): Promise<RefreshSessionRecord | undefined> {
  const owner = await client.query<{ user_id: string }>(
    `SELECT user_id FROM identity.auth_sessions WHERE refresh_token_hash = decode($1, 'base64')`, [tokenHash]);
  if (!owner.rows[0]) return undefined;
  await client.query(`SELECT id FROM identity.users WHERE id = $1 FOR UPDATE`, [owner.rows[0].user_id]);
  const result = await client.query<{
    session_id: string; user_id: string; family_id: string; status: string;
    token_state: RefreshSessionRecord['tokenState'];
  }>(
    `SELECT s.id AS session_id, s.user_id, s.refresh_family_id AS family_id, u.status,
            CASE WHEN f.revoked_at IS NOT NULL THEN 'family_revoked'
                 WHEN s.expires_at <= now() THEN 'expired'
                 WHEN s.revoked_at IS NOT NULL THEN 'revoked'
                 ELSE 'active' END AS token_state
       FROM identity.auth_sessions s
       JOIN identity.refresh_token_families f ON f.id = s.refresh_family_id
       JOIN identity.users u ON u.id = s.user_id
      WHERE s.refresh_token_hash = decode($1, 'base64')`, [tokenHash]);
  const row = result.rows[0];
  return row ? { sessionId: row.session_id, userId: row.user_id, familyId: row.family_id, status: row.status, tokenState: row.token_state } : undefined;
}
