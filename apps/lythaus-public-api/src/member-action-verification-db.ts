import type { DatabaseClient } from '@lythaus/db';
import { hashResetToken, randomToken, uuidv7, verifyLoginPassword, type PasswordHash, type Principal } from '@lythaus/security';
import { issueRecentAccountProof, parseAccountProof, proofMatches,
  sensitiveOperationDigest, type RecentAccountProof, type SensitiveOperation } from '../../../packages/security/src/member-action-verification.ts';
import { lockRefreshSession } from './auth-account-transaction.ts';

const hashSecret = (secret: string) => hashResetToken(`lythaus-account-action-v1:${secret}`);

async function availableQuery(client: DatabaseClient, sql: string, values: unknown[]) {
  try { return await client.query(sql, values); }
  catch { throw new Error('recent_authentication_unavailable'); }
}

async function lockVerificationSession(client: DatabaseClient, user: Principal, refreshCredential: string | undefined) {
  if (!refreshCredential || !/^[A-Za-z0-9_-]{32,256}$/.test(refreshCredential)) throw new Error('recent_authentication_unavailable');
  let current;
  try { current = await lockRefreshSession(client, hashResetToken(refreshCredential)); }
  catch { throw new Error('recent_authentication_unavailable'); }
  if (!current || current.userId !== user.userId || current.status !== 'active' || current.tokenState !== 'active') {
    throw new Error('recent_authentication_required');
  }
  const account = await availableQuery(client,
    `SELECT id FROM identity.users WHERE id = $1 AND status = 'active' AND deleted_at IS NULL
      AND token_version = $2 FOR UPDATE`, [user.userId, user.tokenVersion]);
  if (account.rowCount !== 1) throw new Error('authentication_required');
  return { ...user, sessionFamilyId: current.familyId };
}

export async function createRecentAccountProof(client: DatabaseClient, input: {
  enabled: boolean; user: Principal; password: unknown; operation: SensitiveOperation; pepper: string; bindingKey: string; refreshCredential?: string;
}) {
  if (!input.enabled) throw new Error('recent_authentication_unavailable');
  const session = await lockVerificationSession(client, input.user, input.refreshCredential);
  return issueRecentAccountProof<PasswordHash>({
    async loadCredential() {
      const result = await availableQuery(client,
        `SELECT user_id, password_hash FROM identity.email_credentials
          WHERE user_id = $1 AND verified_at IS NOT NULL FOR SHARE`, [input.user.userId]);
      const row = result.rows[0] as { user_id: string; password_hash: PasswordHash } | undefined;
      return row ? { credentialId: row.user_id, passwordHash: row.password_hash } : undefined;
    },
    verifyPassword: (password, hash) => verifyLoginPassword(password, hash, input.pepper),
    randomSecret: () => randomToken(32), newId: uuidv7, hashSecret,
    hashOperation: operation => sensitiveOperationDigest(operation, input.bindingKey),
    async persist(proof) {
      const result = await availableQuery(client,
        `WITH stamp AS (SELECT clock_timestamp() AS verified_at)
         INSERT INTO identity.account_action_verifications
           (id, user_id, refresh_family_id, token_version, action, operation_hash, secret_hash, credential_id, verified_at, expires_at)
         SELECT $1, $2, $3, $4, $5, decode($6, 'hex'), decode($7, 'base64'), $8, stamp.verified_at,
           stamp.verified_at + interval '5 minutes' FROM stamp RETURNING verified_at, expires_at`,
        [proof.id, input.user.userId, session.sessionFamilyId, input.user.tokenVersion, proof.action,
          proof.operationHash, proof.secretHash, proof.credentialId]);
      const row = result.rows[0] as { verified_at: Date; expires_at: Date } | undefined;
      if (!row) throw new Error('recent_authentication_unavailable');
      return { verifiedAt: row.verified_at.toISOString(), expiresAt: row.expires_at.toISOString() };
    },
  }, { enabled: input.enabled, session, password: input.password, operation: input.operation });
}

export async function consumeRecentAccountProof(client: DatabaseClient, input: {
  enabled: boolean; user: Principal; proof: string | null; operation: SensitiveOperation | undefined; bindingKey?: string; refreshCredential?: string;
}): Promise<void> {
  if (!input.enabled) return;
  if (!input.operation) throw new Error('recent_authentication_operation_unavailable');
  if (!input.bindingKey) throw new Error('recent_authentication_unavailable');
  const supplied = parseAccountProof(input.proof);
  const session = await lockVerificationSession(client, input.user, input.refreshCredential);
  const result = await availableQuery(client,
    `SELECT id, user_id, refresh_family_id, token_version, action, encode(operation_hash, 'hex') AS operation_hash,
       encode(secret_hash, 'base64') AS secret_hash, credential_id, verified_at, expires_at, consumed_at,
       clock_timestamp() AS evaluated_at
     FROM identity.account_action_verifications WHERE id = $1 FOR UPDATE`, [supplied.id]);
  const row = result.rows[0];
  if (!row) throw new Error('recent_authentication_required');
  const proof: RecentAccountProof = { id: row.id as string, userId: row.user_id as string,
    sessionFamilyId: row.refresh_family_id as string, tokenVersion: Number(row.token_version),
    action: row.action as RecentAccountProof['action'], operationHash: row.operation_hash as string,
    secretHash: row.secret_hash as string, credentialId: row.credential_id as string,
    verifiedAt: (row.verified_at as Date).toISOString(), expiresAt: (row.expires_at as Date).toISOString(),
    consumedAt: (row.consumed_at as Date | null)?.toISOString() ?? null };
  if (!proofMatches({ proof, session, action: input.operation.action,
    operationHash: await sensitiveOperationDigest(input.operation, input.bindingKey), secretHash: hashSecret(supplied.secret),
    now: (row.evaluated_at as Date).getTime() })) throw new Error('recent_authentication_required');
  const consumed = await availableQuery(client,
    `UPDATE identity.account_action_verifications SET consumed_at = clock_timestamp()
      WHERE id = $1 AND consumed_at IS NULL AND verified_at <= clock_timestamp() AND expires_at > clock_timestamp()
      RETURNING id`, [supplied.id]);
  if (consumed.rowCount !== 1) throw new Error('recent_authentication_required');
}
