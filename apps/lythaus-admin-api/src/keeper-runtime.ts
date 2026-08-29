import { query, transaction, type DatabaseClient, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { encodeCursor } from '@lythaus/contracts';
import { json } from '@lythaus/observability';
import { decryptField, encryptField, hashAuthToken, hashPassword, hmacLookup, randomToken, uuidv7 } from '@lythaus/security';
import { assertWaitlistAdminRole, assertWaitlistStatusTransition, parseWaitlistId, requireWaitlistEncryptionKey } from './waitlist-runtime-policy.ts';
import { readBoundedJson } from './request-body-policy.ts';
import {
  adminUserPageRequest,
  adminWaitlistFilters,
  parseAdminUserId,
  parseDisplayName,
  parseHandle,
  parseReasonCode,
  parseSource,
  rejectUnknownFields,
  requireConfirmation,
  type AdminUserPageRequest,
} from './admin-runtime-policy.ts';
import { createAuthEmailDispatchAdapter } from './auth-email-dispatch-adapter.ts';

export interface KeeperEnv extends EnvBindings {
  DB_ADMIN_FRESH: HyperdriveBinding;
  DB_PRIVACY_FRESH: HyperdriveBinding;
}

interface AdminActorLike {
  userId: string;
  role: string;
}

interface UserRecord {
  id: string;
  display_name: string;
  handle: string | null;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
  deleted_at: string | Date | null;
  email_ciphertext: string | null;
  encryption_key_version: string | null;
  verified_at: string | Date | null;
  email_status: string | null;
  source: string | null;
  last_login_at: string | Date | null;
  current_session_count: string | number;
  subscription_tier: string;
}

interface WaitlistRecord {
  id: string;
  email_ciphertext: string;
  encryption_key_version: string;
  status: string;
  source: string;
  consent_version: string;
  created_at: string | Date;
  updated_at: string | Date;
  retention_hold: boolean;
}

function requireKeeperAdmin(actor: AdminActorLike): void {
  if (!['administrator', 'owner'].includes(actor.role)) throw new Error('admin_role_required');
}

function requireAuthData(env: KeeperEnv): { encryptionKey: string; hmacKey: string; pepper: string } {
  if (!env.PII_ENCRYPTION_KEY_V1 || !env.PII_HMAC_KEY_V1 || !env.AUTH_PASSWORD_PEPPER_V1) {
    throw new Error('auth_data_unavailable');
  }
  return { encryptionKey: env.PII_ENCRYPTION_KEY_V1, hmacKey: env.PII_HMAC_KEY_V1, pepper: env.AUTH_PASSWORD_PEPPER_V1 };
}

function iso(value: string | Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid_email');
  const email = value.normalize('NFKC').trim().toLowerCase();
  if (email.length < 3 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalid_email');
  return email;
}

function objectBody(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_json');
  return input as Record<string, unknown>;
}

function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!value || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) throw new Error('idempotency_key_required');
  return value;
}

type IdempotencyPayload = { state?: string; body?: Record<string, unknown> } & Record<string, unknown>;

async function claimKeeperIdempotency(client: DatabaseClient, scope: string, key: string, actorId: string): Promise<Record<string, unknown> | null> {
  const claimed = await client.query<{ response: IdempotencyPayload }>(
    `INSERT INTO system.idempotency_keys (scope, key, actor_id, response)
     VALUES ($1, $2, $3, '{"state":"processing"}'::jsonb)
     ON CONFLICT (scope, key) DO NOTHING
     RETURNING response`, [scope, key, actorId]);
  if (claimed.rowCount === 1) return null;
  const existing = await client.query<{ actor_id: string | null; response: IdempotencyPayload }>(
    `SELECT actor_id, response FROM system.idempotency_keys WHERE scope = $1 AND key = $2`, [scope, key]);
  if (!existing.rows[0] || existing.rows[0].actor_id !== actorId) throw new Error('idempotency_key_reused');
  if (existing.rows[0].response.state === 'processing') throw new Error('idempotency_in_progress');
  return existing.rows[0].response.body ?? existing.rows[0].response;
}

async function finalizeKeeperIdempotency(client: DatabaseClient, scope: string, key: string, actorId: string, body: Record<string, unknown>): Promise<void> {
  const finalized = await client.query(
    `UPDATE system.idempotency_keys SET response = $4::jsonb
      WHERE scope = $1 AND key = $2 AND actor_id = $3 AND response ->> 'state' = 'processing'`,
    [scope, key, actorId, JSON.stringify({ state: 'completed', body })]);
  if (finalized.rowCount !== 1) throw new Error('idempotency_finalize_failed');
}

function mutationHeaders(correlation: string): HeadersInit {
  return { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' };
}

async function decryptEmail(row: Pick<UserRecord, 'email_ciphertext' | 'encryption_key_version'>, env: KeeperEnv): Promise<string | null> {
  if (!row.email_ciphertext || !row.encryption_key_version) return null;
  if (!env.PII_ENCRYPTION_KEY_V1) throw new Error('auth_data_unavailable');
  return decryptField({ ciphertext: row.email_ciphertext, encryptionKeyVersion: row.encryption_key_version }, env.PII_ENCRYPTION_KEY_V1);
}

function userOutput(row: UserRecord, email: string | null): Record<string, unknown> {
  return {
    id: row.id,
    email,
    displayName: row.display_name,
    handle: row.handle,
    status: row.status,
    verificationState: row.verified_at ? 'verified' : 'pending_verification',
    verifiedAt: iso(row.verified_at),
    emailStatus: row.email_status ?? null,
    source: row.source,
    subscriptionTier: row.subscription_tier,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    deletedAt: iso(row.deleted_at),
    lastLoginAt: iso(row.last_login_at),
    currentSessionCount: Number(row.current_session_count ?? 0),
  };
}

function userQuery(page: AdminUserPageRequest, env: KeeperEnv): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const conditions = ['1 = 1'];
  const add = (value: unknown): string => { values.push(value); return `$${values.length}`; };
  if (page.query) {
    if (page.query.includes('@')) {
      const keys = requireAuthData(env);
      conditions.push(`COALESCE(c.email_lookup_hmac, e.email_lookup_hmac) = decode(${add(hmacLookup(page.query, keys.hmacKey))}, 'base64')`);
    } else {
      const pattern = `%${page.query.toLowerCase()}%`;
      const parameter = add(pattern);
      conditions.push(`(u.id::text = ${parameter} OR lower(u.display_name) LIKE ${parameter} OR lower(h.handle_normalized) LIKE ${parameter})`);
    }
  }
  if (page.status === 'verified') conditions.push('COALESCE(c.verified_at, e.verified_at) IS NOT NULL');
  if (page.status === 'pending_verification') conditions.push('COALESCE(c.verified_at, e.verified_at) IS NULL');
  if (page.status && !['verified', 'pending_verification'].includes(page.status)) conditions.push(`u.status = ${add(page.status)}`);
  if (page.source) {
    const sourceParameter = add(page.source);
    conditions.push(`(EXISTS (SELECT 1 FROM identity.provider_links source_link WHERE source_link.user_id = u.id AND source_link.provider = ${sourceParameter}) OR COALESCE(c.source_provider, CASE WHEN e.user_id IS NOT NULL THEN 'email' END) = ${sourceParameter})`);
  }
  if (page.createdAfter) conditions.push(`u.created_at >= ${add(page.createdAfter)}::timestamptz`);
  if (page.createdBefore) conditions.push(`u.created_at < ${add(page.createdBefore)}::timestamptz`);
  if (page.cursor) {
    conditions.push(`(u.created_at, u.id) < (${add(page.cursor.timestamp)}::timestamptz, ${add(page.cursor.id)}::uuid)`);
  }
  return {
    sql: `SELECT u.id, u.display_name, h.handle, u.status, u.created_at, u.updated_at, u.deleted_at,
                 convert_from(COALESCE(c.email_ciphertext, e.email_ciphertext), 'utf8') AS email_ciphertext,
                 COALESCE(c.encryption_key_version, e.encryption_key_version) AS encryption_key_version,
                 COALESCE(c.verified_at, e.verified_at) AS verified_at,
                 email_delivery.email_status,
                 COALESCE(source_link.provider, c.source_provider, CASE WHEN e.user_id IS NOT NULL THEN 'email' END) AS source,
                 COALESCE((SELECT max(event.created_at) FROM identity.account_events event
                           WHERE event.user_id = u.id AND event.event_type IN ('email_login', 'google_login')), u.created_at) AS last_login_at,
                 (SELECT count(*) FROM identity.auth_sessions session
                   WHERE session.user_id = u.id AND session.revoked_at IS NULL AND session.expires_at > now()) AS current_session_count,
                 COALESCE(entitlement.subscription_tier, 'free') AS subscription_tier
            FROM identity.users u
            LEFT JOIN identity.handles h ON h.user_id = u.id
            LEFT JOIN identity.contact_emails c ON c.user_id = u.id
            LEFT JOIN identity.email_credentials e ON e.user_id = u.id
            LEFT JOIN LATERAL (SELECT provider FROM identity.provider_links
                                WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) source_link ON true
            LEFT JOIN LATERAL (SELECT outbox.state AS email_status
                                FROM system.transactional_email_outbox outbox
                                INNER JOIN identity.email_verification_tokens challenge ON challenge.id = outbox.challenge_id
                               WHERE challenge.user_id = u.id
                                 AND outbox.purpose IN ('invite', 'verification')
                               ORDER BY outbox.created_at DESC LIMIT 1) email_delivery ON true
            LEFT JOIN identity.user_entitlements entitlement ON entitlement.user_id = u.id
           WHERE ${conditions.join(' AND ')}
           ORDER BY u.created_at DESC, u.id DESC
           LIMIT ${add(page.limit + 1)}`,
    values,
  };
}

export async function listAdminUsers(request: Request, env: KeeperEnv, actor: AdminActorLike, correlation: string): Promise<Response> {
  requireKeeperAdmin(actor);
  const page = adminUserPageRequest(new URL(request.url));
  const built = userQuery(page, env);
  const result = await query<UserRecord>(env.DB_ADMIN_FRESH, built.sql, built.values);
  const hasMore = result.rows.length > page.limit;
  const rows = result.rows.slice(0, page.limit);
  const items = await Promise.all(rows.map(async (row: UserRecord) => userOutput(row, await decryptEmail(row, env))));
  const tail = rows.at(-1);
  await query(env.DB_ADMIN_FRESH,
    `INSERT INTO system.audit_events (id, actor_id, action, target_type, reason_code, correlation_id, metadata)
     VALUES ($1, $2, 'identity.users_viewed', 'user_collection', 'USERS_LIST_VIEW', $3, $4::jsonb)`,
    [uuidv7(), actor.userId, correlation, JSON.stringify({ returnedRowCount: items.length, requestedLimit: page.limit, hasCursor: Boolean(page.cursor), hasMore })]);
  return json({ items, nextCursor: hasMore && tail ? encodeCursor({ timestamp: new Date(tail.created_at).toISOString(), id: tail.id }) : null }, { headers: mutationHeaders(correlation) });
}

export async function getAdminUser(_request: Request, env: KeeperEnv, actor: AdminActorLike, rawUserId: string, correlation: string): Promise<Response> {
  requireKeeperAdmin(actor);
  const userId = parseAdminUserId(rawUserId);
  const result = await query<UserRecord>(env.DB_ADMIN_FRESH,
    `SELECT u.id, u.display_name, h.handle, u.status, u.created_at, u.updated_at, u.deleted_at,
            convert_from(COALESCE(c.email_ciphertext, e.email_ciphertext), 'utf8') AS email_ciphertext,
            COALESCE(c.encryption_key_version, e.encryption_key_version) AS encryption_key_version,
            COALESCE(c.verified_at, e.verified_at) AS verified_at,
            email_delivery.email_status,
            COALESCE(pl.provider, c.source_provider, CASE WHEN e.user_id IS NOT NULL THEN 'email' END) AS source,
            COALESCE((SELECT max(event.created_at) FROM identity.account_events event WHERE event.user_id = u.id AND event.event_type IN ('email_login', 'google_login')), u.created_at) AS last_login_at,
            (SELECT count(*) FROM identity.auth_sessions session WHERE session.user_id = u.id AND session.revoked_at IS NULL AND session.expires_at > now()) AS current_session_count,
            COALESCE(entitlement.subscription_tier, 'free') AS subscription_tier
       FROM identity.users u
       LEFT JOIN identity.handles h ON h.user_id = u.id
       LEFT JOIN identity.contact_emails c ON c.user_id = u.id
       LEFT JOIN identity.email_credentials e ON e.user_id = u.id
       LEFT JOIN LATERAL (SELECT provider FROM identity.provider_links WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) pl ON true
       LEFT JOIN LATERAL (SELECT outbox.state AS email_status
                            FROM system.transactional_email_outbox outbox
                            INNER JOIN identity.email_verification_tokens challenge ON challenge.id = outbox.challenge_id
                           WHERE challenge.user_id = u.id
                             AND outbox.purpose IN ('invite', 'verification')
                           ORDER BY outbox.created_at DESC LIMIT 1) email_delivery ON true
       LEFT JOIN identity.user_entitlements entitlement ON entitlement.user_id = u.id
      WHERE u.id = $1`, [userId]);
  const row = result.rows[0];
  if (!row) throw new Error('user_not_found');
  const [email, activity] = await Promise.all([
    decryptEmail(row, env),
    query<{ event_type: string; created_at: string | Date }>(env.DB_ADMIN_FRESH,
      `SELECT event_type, created_at FROM identity.account_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId]),
  ]);
  await query(env.DB_ADMIN_FRESH,
    `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id)
     VALUES ($1, $2, 'identity.user_viewed', 'user', $3, 'USER_DETAIL_VIEW', $4)`,
    [uuidv7(), actor.userId, userId, correlation]);
  return json({
    user: userOutput(row, email),
    activity: activity.rows.map((event) => ({ eventType: event.event_type, occurredAt: iso(event.created_at) })),
  }, { headers: mutationHeaders(correlation) });
}

export async function patchAdminUser(request: Request, env: KeeperEnv, actor: AdminActorLike, rawUserId: string, correlation: string): Promise<Response> {
  requireKeeperAdmin(actor);
  const userId = parseAdminUserId(rawUserId);
  const input = objectBody(await readBoundedJson(request));
  rejectUnknownFields(input, ['displayName', 'handle', 'reasonCode', 'confirmation']);
  const reasonCode = parseReasonCode(input.reasonCode);
  requireConfirmation(input.confirmation, 'UPDATE PROFILE');
  if (input.email !== undefined) throw new Error('email_change_requires_public_flow');
  const displayName = input.displayName === undefined ? undefined : parseDisplayName(input.displayName);
  const handle = input.handle === undefined ? undefined : parseHandle(input.handle);
  if (displayName === undefined && handle === undefined) throw new Error('unknown_field');
  const result = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const current = await client.query<{ display_name: string; handle: string | null }>(
      `SELECT u.display_name, h.handle FROM identity.users u LEFT JOIN identity.handles h ON h.user_id = u.id WHERE u.id = $1 FOR UPDATE`, [userId]);
    if (!current.rows[0]) throw new Error('user_not_found');
    const before = current.rows[0];
    if (displayName !== undefined) await client.query(`UPDATE identity.users SET display_name = $1, updated_at = now() WHERE id = $2`, [displayName, userId]);
    if (handle !== undefined) await client.query(
      `INSERT INTO identity.handles (user_id, handle, handle_normalized) VALUES ($1, $2, lower($2))
       ON CONFLICT (user_id) DO UPDATE SET handle = EXCLUDED.handle, handle_normalized = EXCLUDED.handle_normalized, updated_at = now()`, [userId, handle]);
    const after = { displayName: displayName ?? before.display_name, handle: handle ?? before.handle };
    await client.query(
      `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
       VALUES ($1, $2, 'identity.user_profile_changed', 'user', $3, $4, $5, $6::jsonb)`,
      [uuidv7(), actor.userId, userId, reasonCode, correlation, JSON.stringify({ before: { displayName: before.display_name, handle: before.handle }, after })]);
    return after;
  });
  return json({ userId, ...result }, { headers: mutationHeaders(correlation) });
}

async function prepareVerificationToken(client: DatabaseClient, userId: string): Promise<{ token: string; challengeId: string }> {
  const token = randomToken(32);
  const challengeId = uuidv7();
  await client.query(
    `UPDATE identity.email_verification_tokens
        SET superseded_at = now()
      WHERE user_id = $1 AND consumed_at IS NULL AND superseded_at IS NULL`,
    [userId],
  );
  await client.query(
    `INSERT INTO identity.email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, decode($3, 'base64'), now() + interval '30 minutes')`,
    [challengeId, userId, hashAuthToken(token, 'verification')]);
  return { token, challengeId };
}

function encryptedToken(token: string, encryptionKey: string): Promise<{ ciphertext: string; encryptionKeyVersion: string }> {
  return encryptField(token, encryptionKey, 'v1');
}

export async function inviteAdminUser(request: Request, env: KeeperEnv, actor: AdminActorLike, correlation: string): Promise<Response> {
  requireKeeperAdmin(actor);
  const keys = requireAuthData(env);
  const input = objectBody(await readBoundedJson(request));
  rejectUnknownFields(input, ['email', 'displayName', 'handle', 'reasonCode', 'confirmation']);
  const email = normalizeEmail(input.email);
  const displayName = input.displayName === undefined ? '' : parseDisplayName(input.displayName);
  const handle = input.handle === undefined ? undefined : parseHandle(input.handle);
  const reasonCode = parseReasonCode(input.reasonCode);
  requireConfirmation(input.confirmation, 'INVITE ACCOUNT');
  const temporaryPasswordHash = hashPassword(randomToken(32), keys.pepper, { fallbackToScrypt: env.PASSWORD_HASH_ALLOW_SCRYPT_FALLBACK === 'true', pepperVersion: 'v1' });
  const dispatcher = createAuthEmailDispatchAdapter(env);
  const userId = uuidv7();
  const result = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const duplicate = await client.query(`SELECT user_id FROM identity.email_credentials WHERE email_lookup_hmac = decode($1, 'base64') UNION ALL SELECT user_id FROM identity.contact_emails WHERE email_lookup_hmac = decode($1, 'base64') LIMIT 1`, [hmacLookup(email, keys.hmacKey)]);
    if (duplicate.rowCount) throw new Error('user_email_exists');
    await client.query(`INSERT INTO identity.users (id, status, display_name) VALUES ($1, 'active', $2)`, [userId, displayName]);
    if (handle !== undefined) await client.query(`INSERT INTO identity.handles (user_id, handle, handle_normalized) VALUES ($1, $2, lower($2))`, [userId, handle]);
    const verificationToken = randomToken(32);
    const challengeId = uuidv7();
    const encrypted = await encryptedToken(verificationToken, keys.encryptionKey);
    const encryptedEmail = await encryptField(email, keys.encryptionKey, 'v1');
    await client.query(
      `INSERT INTO identity.email_credentials (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, hmac_key_version, password_hash)
       VALUES ($1, convert_to($2, 'utf8'), decode($3, 'base64'), 'v1', 'v1', $4::jsonb)`,
      [userId, encryptedEmail.ciphertext, hmacLookup(email, keys.hmacKey), JSON.stringify(temporaryPasswordHash)]);
    await client.query(
      `INSERT INTO identity.contact_emails (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, source_provider)
       VALUES ($1, convert_to($2, 'utf8'), decode($3, 'base64'), 'v1', 'email')`,
      [userId, encryptedEmail.ciphertext, hmacLookup(email, keys.hmacKey)]);
    await client.query(
      `UPDATE identity.email_verification_tokens
          SET superseded_at = now()
        WHERE user_id = $1 AND consumed_at IS NULL AND superseded_at IS NULL`, [userId]);
    await client.query(
      `INSERT INTO identity.email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, decode($3, 'base64'), now() + interval '30 minutes')`,
      [challengeId, userId, hashAuthToken(verificationToken, 'verification')]);
    await dispatcher.enqueue(client, {
      actorId: actor.userId, correlationId: correlation, kind: 'account_invitation', userId, challengeId,
      tokenCiphertext: encrypted.ciphertext, tokenKeyVersion: encrypted.encryptionKeyVersion,
    });
    await client.query(
      `INSERT INTO identity.account_events (id, user_id, actor_id, event_type, metadata) VALUES ($1, $2, $3, 'account_invited', $4::jsonb)`,
      [uuidv7(), userId, actor.userId, JSON.stringify({ verificationState: 'pending_verification' })]);
    await client.query(
      `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
       VALUES ($1, $2, 'identity.account_invited', 'user', $3, $4, $5, $6::jsonb)`,
      [uuidv7(), actor.userId, userId, reasonCode, correlation, JSON.stringify({ verificationState: 'pending_verification' })]);
    return { userId, status: 'active', verificationState: 'pending_verification' };
  });
  return json(result, { status: 201, headers: mutationHeaders(correlation) });
}

export async function resendAdminVerification(request: Request, env: KeeperEnv, actor: AdminActorLike, rawUserId: string, correlation: string): Promise<Response> {
  requireKeeperAdmin(actor);
  const keys = requireAuthData(env);
  const userId = parseAdminUserId(rawUserId);
  const input = objectBody(await readBoundedJson(request));
  rejectUnknownFields(input, ['reasonCode', 'confirmation']);
  const reasonCode = parseReasonCode(input.reasonCode);
  requireConfirmation(input.confirmation, 'RESEND VERIFICATION');
  const dispatcher = createAuthEmailDispatchAdapter(env);
  const result = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const current = await client.query<{ status: string; verified_at: string | null }>(
      `SELECT u.status, e.verified_at FROM identity.users u LEFT JOIN identity.email_credentials e ON e.user_id = u.id WHERE u.id = $1 FOR UPDATE`, [userId]);
    if (!current.rows[0]) throw new Error('user_not_found');
    if (current.rows[0].verified_at) throw new Error('email_already_verified');
    if (['deleted', 'suspended', 'locked'].includes(current.rows[0].status)) throw new Error('invalid_account_status');
    const prepared = await prepareVerificationToken(client, userId);
    const encrypted = await encryptedToken(prepared.token, keys.encryptionKey);
    await dispatcher.enqueue(client, { actorId: actor.userId, correlationId: correlation, kind: 'verification_resend', userId, challengeId: prepared.challengeId, tokenCiphertext: encrypted.ciphertext, tokenKeyVersion: encrypted.encryptionKeyVersion });
    await client.query(
      `INSERT INTO identity.account_events (id, user_id, actor_id, event_type, metadata) VALUES ($1, $2, $3, 'email_verification_requested', $4::jsonb)`,
      [uuidv7(), userId, actor.userId, JSON.stringify({ deliveryState: 'queued' })]);
    await client.query(
      `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
       VALUES ($1, $2, 'identity.email_verification_resent', 'user', $3, $4, $5, $6::jsonb)`,
      [uuidv7(), actor.userId, userId, reasonCode, correlation, JSON.stringify({ deliveryState: 'queued' })]);
    return { userId, deliveryState: 'queued' };
  });
  return json(result, { headers: mutationHeaders(correlation) });
}

export async function revokeAdminUserSessions(request: Request, env: KeeperEnv, actor: AdminActorLike, rawUserId: string, correlation: string): Promise<Response> {
  requireKeeperAdmin(actor);
  const userId = parseAdminUserId(rawUserId);
  const input = objectBody(await readBoundedJson(request));
  rejectUnknownFields(input, ['reasonCode', 'confirmation']);
  const reasonCode = parseReasonCode(input.reasonCode);
  requireConfirmation(input.confirmation, 'REVOKE SESSIONS');
  const result = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const existing = await client.query(`SELECT id FROM identity.users WHERE id = $1 FOR UPDATE`, [userId]);
    if (!existing.rowCount) throw new Error('user_not_found');
    const sessions = await client.query(`UPDATE identity.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    const families = await client.query(`UPDATE identity.refresh_token_families SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    await client.query(`UPDATE identity.users SET token_version = token_version + 1, updated_at = now() WHERE id = $1`, [userId]);
    await client.query(`INSERT INTO identity.account_events (id, user_id, actor_id, event_type, metadata) VALUES ($1, $2, $3, 'sessions_revoked', $4::jsonb)`, [uuidv7(), userId, actor.userId, JSON.stringify({ reasonCode })]);
    await client.query(`INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata) VALUES ($1, $2, 'identity.sessions_revoked', 'user', $3, $4, $5, $6::jsonb)`, [uuidv7(), actor.userId, userId, reasonCode, correlation, JSON.stringify({ sessionCount: sessions.rowCount ?? 0, refreshFamilyCount: families.rowCount ?? 0 })]);
    return { userId, revokedSessionCount: sessions.rowCount ?? 0, revokedRefreshFamilyCount: families.rowCount ?? 0 };
  });
  return json(result, { headers: mutationHeaders(correlation) });
}

export async function deleteAdminUser(request: Request, env: KeeperEnv, actor: AdminActorLike, rawUserId: string, correlation: string): Promise<Response> {
  requireKeeperAdmin(actor);
  const userId = parseAdminUserId(rawUserId);
  const idempotencyKey = requireIdempotencyKey(request);
  const input = objectBody(await readBoundedJson(request));
  rejectUnknownFields(input, ['reasonCode', 'confirmation']);
  const reasonCode = parseReasonCode(input.reasonCode);
  requireConfirmation(input.confirmation, `DELETE ${userId}`);
  const idempotencyScope = `admin.user.delete:${userId}`;
  const result = await transaction(env.DB_PRIVACY_FRESH, async (client) => {
    const replay = await claimKeeperIdempotency(client, idempotencyScope, idempotencyKey, actor.userId);
    if (replay) return replay;
    const user = await client.query<{ status: string }>(`SELECT status FROM identity.users WHERE id = $1 FOR UPDATE`, [userId]);
    if (!user.rows[0]) throw new Error('user_not_found');
    const legalHold = await client.query<{ active: boolean }>(`SELECT EXISTS (SELECT 1 FROM privacy.legal_holds WHERE subject_id = $1 AND active = true) AS active`, [userId]);
    const existing = await client.query<{ id: string }>(`SELECT id FROM privacy.requests WHERE subject_id = $1 AND request_type = 'delete' AND state IN ('received', 'processing') ORDER BY created_at DESC LIMIT 1`, [userId]);
    const requestId = existing.rows[0]?.id ?? uuidv7();
    if (!existing.rows[0]) await client.query(`INSERT INTO privacy.requests (id, subject_id, request_type, state) VALUES ($1, $2, 'delete', 'received')`, [requestId, userId]);
    await client.query(`UPDATE identity.users SET status = 'deleted', deleted_at = COALESCE(deleted_at, now()), token_version = token_version + 1, updated_at = now() WHERE id = $1`, [userId]);
    await client.query(`UPDATE identity.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    await client.query(`UPDATE identity.refresh_token_families SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    if (!existing.rows[0]) await client.query(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload) VALUES ($1, 'privacy.request.created', 'privacy_request', $2, $3, $4::jsonb)`, [uuidv7(), requestId, actor.userId, JSON.stringify({ requestId, requestType: 'delete', subjectId: userId })]);
    await client.query(`INSERT INTO identity.account_events (id, user_id, actor_id, event_type, metadata) VALUES ($1, $2, $3, 'account_deletion_requested', $4::jsonb)`, [uuidv7(), userId, actor.userId, JSON.stringify({ requestId, legalHold: Boolean(legalHold.rows[0]?.active) })]);
    const response = { userId, requestId, status: 'deleted', legalHold: Boolean(legalHold.rows[0]?.active), purgeState: legalHold.rows[0]?.active ? 'blocked_by_legal_hold' : 'pending_purge' };
    await client.query(`INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata) VALUES ($1, $2, 'identity.account_deletion_requested', 'user', $3, $4, $5, $6::jsonb)`, [uuidv7(), actor.userId, userId, reasonCode, correlation, JSON.stringify({ requestId, legalHold: response.legalHold })]);
    await finalizeKeeperIdempotency(client, idempotencyScope, idempotencyKey, actor.userId, response);
    return response;
  });
  return json(result, { status: 202, headers: mutationHeaders(correlation) });
}

export async function getAdminAuthSummary(_request: Request, env: KeeperEnv, actor: AdminActorLike, correlation: string): Promise<Response> {
  requireKeeperAdmin(actor);
  const result = await query(env.DB_ADMIN_FRESH,
    `SELECT
       count(*) FILTER (WHERE u.status <> 'deleted')::integer AS total_accounts,
       count(*) FILTER (WHERE COALESCE(c.verified_at, e.verified_at) IS NOT NULL AND u.status <> 'deleted')::integer AS verified,
       count(*) FILTER (WHERE COALESCE(c.verified_at, e.verified_at) IS NULL AND u.status <> 'deleted')::integer AS pending_verification,
       count(*) FILTER (WHERE u.status = 'active')::integer AS active,
       count(*) FILTER (WHERE u.status = 'relink_required')::integer AS relink_required,
       count(*) FILTER (WHERE u.status = 'suspended')::integer AS suspended,
       count(*) FILTER (WHERE u.status = 'locked')::integer AS locked,
       count(*) FILTER (WHERE u.status = 'deleted')::integer AS deleted,
       count(*) FILTER (WHERE u.created_at >= now() - interval '24 hours' AND u.status <> 'deleted')::integer AS signups_last_24_hours,
       count(*) FILTER (WHERE u.created_at >= now() - interval '7 days' AND u.status <> 'deleted')::integer AS signups_last_7_days,
       (SELECT count(*) FROM marketing.waitlist_signups WHERE status = 'waiting')::integer AS waitlist_total_waiting,
       (SELECT count(*) FROM marketing.waitlist_signups WHERE created_at >= now() - interval '24 hours')::integer AS waitlist_last_24_hours,
       (SELECT count(*) FROM marketing.waitlist_signups WHERE created_at >= now() - interval '7 days')::integer AS waitlist_last_7_days
     FROM identity.users u
     LEFT JOIN identity.contact_emails c ON c.user_id = u.id
     LEFT JOIN identity.email_credentials e ON e.user_id = u.id`, []);
  const row = result.rows[0] ?? {};
  await query(env.DB_ADMIN_FRESH,
    `INSERT INTO system.audit_events (id, actor_id, action, target_type, reason_code, correlation_id, metadata) VALUES ($1, $2, 'identity.auth_summary_viewed', 'auth_summary', 'AUTH_SUMMARY_VIEW', $3, '{}'::jsonb)`,
    [uuidv7(), actor.userId, correlation]);
  return json({ accounts: {
    total: Number(row.total_accounts ?? 0), verified: Number(row.verified ?? 0), pendingVerification: Number(row.pending_verification ?? 0),
    active: Number(row.active ?? 0), relinkRequired: Number(row.relink_required ?? 0), suspended: Number(row.suspended ?? 0),
    locked: Number(row.locked ?? 0), deleted: Number(row.deleted ?? 0), signupsLast24Hours: Number(row.signups_last_24_hours ?? 0), signupsLast7Days: Number(row.signups_last_7_days ?? 0),
  }, waitlist: {
    totalWaiting: Number(row.waitlist_total_waiting ?? 0),
    last24Hours: Number(row.waitlist_last_24_hours ?? 0),
    last7Days: Number(row.waitlist_last_7_days ?? 0),
  } }, { headers: mutationHeaders(correlation) });
}

export async function getAdminEmailHealth(_request: Request, env: KeeperEnv, actor: AdminActorLike, correlation: string): Promise<Response> {
  requireKeeperAdmin(actor);
  const result = await query(env.DB_ADMIN_FRESH,
    `SELECT count(*) FILTER (WHERE state IN ('queued', 'processing'))::integer AS queued,
            count(*) FILTER (WHERE state IN ('provider_accepted', 'delivered', 'deferred', 'bounced', 'rejected', 'failed', 'complained'))::integer AS dispatched,
            count(*) FILTER (WHERE state IN ('bounced', 'rejected', 'failed', 'complained'))::integer AS failed,
            count(*) FILTER (WHERE created_at >= now() - interval '24 hours' AND accepted_at IS NOT NULL)::integer AS accepted_last_24_hours,
            count(*) FILTER (WHERE created_at >= now() - interval '24 hours' AND state = 'delivered')::integer AS delivered_last_24_hours,
            count(*) FILTER (WHERE created_at >= now() - interval '24 hours' AND (state IN ('bounced', 'rejected', 'failed', 'complained') OR provider_error_code IS NOT NULL))::integer AS failures_last_24_hours,
            max(updated_at) AS last_event_at
       FROM system.transactional_email_outbox`, []);
  const row = result.rows[0] ?? {};
  const failed = Number(row.failed ?? 0);
  await query(env.DB_ADMIN_FRESH,
    `INSERT INTO system.audit_events (id, actor_id, action, target_type, reason_code, correlation_id, metadata) VALUES ($1, $2, 'identity.email_health_viewed', 'email_health', 'EMAIL_HEALTH_VIEW', $3, '{}'::jsonb)`,
    [uuidv7(), actor.userId, correlation]);
  return json({ status: failed > 0 ? 'degraded' : 'healthy', providerLifecycle: 'available', reason: null, queued: Number(row.queued ?? 0), dispatched: Number(row.dispatched ?? 0), failed, acceptedLast24Hours: Number(row.accepted_last_24_hours ?? 0), deliveredLast24Hours: Number(row.delivered_last_24_hours ?? 0), failuresLast24Hours: Number(row.failures_last_24_hours ?? 0), lastEventAt: iso(row.last_event_at) }, { headers: mutationHeaders(correlation) });
}

export async function createWaitlistEntry(request: Request, env: KeeperEnv, actor: AdminActorLike, correlation: string): Promise<Response> {
  assertWaitlistAdminRole(actor.role);
  const encryptionKey = requireWaitlistEncryptionKey(env.PII_ENCRYPTION_KEY_V1);
  const hmacKey = typeof env.PII_HMAC_KEY_V1 === 'string' && env.PII_HMAC_KEY_V1 ? env.PII_HMAC_KEY_V1 : (() => { throw new Error('waitlist_unavailable'); })();
  const input = objectBody(await readBoundedJson(request));
  rejectUnknownFields(input, ['email', 'source', 'consentVersion', 'reasonCode', 'confirmation']);
  const email = normalizeEmail(input.email);
  const source = input.source === undefined ? 'keeper' : parseSource(input.source);
  if (input.consentVersion !== undefined && (typeof input.consentVersion !== 'string' || !input.consentVersion.trim())) throw new Error('invalid_source');
  const consentVersion = input.consentVersion === undefined ? 'waitlist-v1' : (input.consentVersion as string).trim();
  if (consentVersion.length > 80) throw new Error('invalid_source');
  const reasonCode = parseReasonCode(input.reasonCode);
  requireConfirmation(input.confirmation, 'ADD WAITLIST');
  const encrypted = await encryptField(email, encryptionKey, 'v1');
  const id = uuidv7();
  const result = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const duplicate = await client.query(`SELECT id FROM marketing.waitlist_signups WHERE email_lookup_hmac = decode($1, 'base64') FOR UPDATE`, [hmacLookup(email, hmacKey)]);
    if (duplicate.rowCount) throw new Error('waitlist_duplicate');
    await client.query(`INSERT INTO marketing.waitlist_signups (id, email_lookup_hmac, email_ciphertext, encryption_key_version, source, consent_version) VALUES ($1, decode($2, 'base64'), convert_to($3, 'utf8'), 'v1', $4, $5)`, [id, hmacLookup(email, hmacKey), encrypted.ciphertext, source, consentVersion]);
    await client.query(`INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata) VALUES ($1, $2, 'marketing.waitlist_created', 'marketing.waitlist', $3, $4, $5, $6::jsonb)`, [uuidv7(), actor.userId, id, reasonCode, correlation, JSON.stringify({ source, consentVersion })]);
    return { id, status: 'waiting', source };
  });
  return json(result, { status: 201, headers: mutationHeaders(correlation) });
}

export async function updateAdminWaitlistEntry(request: Request, env: KeeperEnv, actor: AdminActorLike, rawId: string, correlation: string): Promise<Response> {
  assertWaitlistAdminRole(actor.role);
  const id = parseWaitlistId(rawId);
  const input = objectBody(await readBoundedJson(request));
  rejectUnknownFields(input, ['status', 'source', 'reasonCode', 'confirmation']);
  const reasonCode = parseReasonCode(input.reasonCode);
  requireConfirmation(input.confirmation, 'UPDATE WAITLIST');
  const source = input.source === undefined ? undefined : parseSource(input.source);
  const status = input.status === undefined ? undefined : (typeof input.status === 'string' && ['invited', 'converted', 'unsubscribed'].includes(input.status) ? input.status : (() => { throw new Error('invalid_waitlist_status'); })());
  if (source === undefined && status === undefined) throw new Error('unknown_field');
  const result = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const current = await client.query<WaitlistRecord>(`SELECT id, status, source, consent_version, created_at, updated_at, retention_hold, convert_from(email_ciphertext, 'utf8') AS email_ciphertext, encryption_key_version FROM marketing.waitlist_signups WHERE id = $1 FOR UPDATE`, [id]);
    if (!current.rows[0]) throw new Error('waitlist_not_found');
    const row = current.rows[0];
    if (status !== undefined) assertWaitlistStatusTransition(row.status, status as never);
    await client.query(`UPDATE marketing.waitlist_signups SET status = COALESCE($2, status), source = COALESCE($3, source), updated_at = now(), invited_at = CASE WHEN $2 = 'invited' THEN COALESCE(invited_at, now()) ELSE invited_at END, converted_at = CASE WHEN $2 = 'converted' THEN COALESCE(converted_at, now()) ELSE converted_at END, unsubscribed_at = CASE WHEN $2 = 'unsubscribed' THEN COALESCE(unsubscribed_at, now()) ELSE unsubscribed_at END, purge_after = CASE WHEN $2 IN ('converted', 'unsubscribed') THEN LEAST(purge_after, now() + interval '30 days') ELSE purge_after END WHERE id = $1`, [id, status ?? null, source ?? null]);
    const after = { status: status ?? row.status, source: source ?? row.source };
    await client.query(`INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata) VALUES ($1, $2, 'marketing.waitlist_changed', 'marketing.waitlist', $3, $4, $5, $6::jsonb)`, [uuidv7(), actor.userId, id, reasonCode, correlation, JSON.stringify({ before: { status: row.status, source: row.source }, after })]);
    return { id, ...after };
  });
  return json(result, { headers: mutationHeaders(correlation) });
}

export async function deleteWaitlistEntry(request: Request, env: KeeperEnv, actor: AdminActorLike, rawId: string, correlation: string): Promise<Response> {
  assertWaitlistAdminRole(actor.role);
  const id = parseWaitlistId(rawId);
  const idempotencyKey = requireIdempotencyKey(request);
  const input = objectBody(await readBoundedJson(request));
  rejectUnknownFields(input, ['reasonCode', 'confirmation']);
  const reasonCode = parseReasonCode(input.reasonCode);
  requireConfirmation(input.confirmation, `DELETE WAITLIST ${id}`);
  const idempotencyScope = `admin.waitlist.delete:${id}`;
  const result = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const replay = await claimKeeperIdempotency(client, idempotencyScope, idempotencyKey, actor.userId);
    if (replay) return replay;
    const current = await client.query<{ status: string; retention_hold: boolean }>(`SELECT status, retention_hold FROM marketing.waitlist_signups WHERE id = $1 FOR UPDATE`, [id]);
    if (!current.rows[0]) throw new Error('waitlist_not_found');
    await client.query(`UPDATE marketing.waitlist_signups SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, now()), purge_after = CASE WHEN retention_hold THEN purge_after ELSE LEAST(purge_after, now() + interval '30 days') END, updated_at = now() WHERE id = $1`, [id]);
    const response = { id, status: 'unsubscribed', purgeBlockedByRetentionHold: current.rows[0].retention_hold };
    await client.query(`INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata) VALUES ($1, $2, 'marketing.waitlist_deleted', 'marketing.waitlist', $3, $4, $5, $6::jsonb)`, [uuidv7(), actor.userId, id, reasonCode, correlation, JSON.stringify({ previousStatus: current.rows[0].status, retentionHold: current.rows[0].retention_hold })]);
    await finalizeKeeperIdempotency(client, idempotencyScope, idempotencyKey, actor.userId, response);
    return response;
  });
  return json(result, { status: 202, headers: mutationHeaders(correlation) });
}
