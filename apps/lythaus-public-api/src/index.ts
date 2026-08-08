import { databaseExpectationsFromEnv, databaseReadinessResponse, inspectDatabaseIdentity, transaction, query, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import type { CreatePostInput, EmailDeliveryReference, TransactionalEmailProvider } from '@lythaus/contracts';
import { createPresignedPutUrl, ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, type AllowedImageType } from '@lythaus/media';
import { assertExpectedHostname, correlationId, json, logEvent } from '@lythaus/observability';
import { constantTimeEqual, decryptField, encryptField, hashPassword, hashResetToken, hmacLookup, needsPasswordRehash, randomToken, signAccessToken, uuidv7, verifyAccessToken, verifyPassword, type PasswordHash, type Principal } from '@lythaus/security';
import { createRemoteJWKSet, jwtVerify } from 'jose';

interface Env extends EnvBindings {
  DB_APP_FRESH: HyperdriveBinding;
  MEDIA_QUARANTINE: NonNullable<EnvBindings['MEDIA_QUARANTINE']>;
  MODERATION_QUEUE: NonNullable<EnvBindings['MODERATION_QUEUE']>;
  R2_ACCOUNT_ID: string;
  LYTHAUS_CONFIG?: NonNullable<EnvBindings['LYTHAUS_CONFIG']>;
}

function hasReadinessAuthorization(request: Request, env: Env): boolean {
  const configured = env.DATABASE_READINESS_TOKEN;
  const supplied = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!configured || !supplied) return false;
  return constantTimeEqual(new TextEncoder().encode(configured), new TextEncoder().encode(supplied));
}

interface EmailAuthInput {
  mode?: 'register' | 'login' | 'resend_verification';
  email?: string;
  password?: string;
  turnstileToken?: string;
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw new Error('invalid_email');
  return email;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function pkceChallenge(verifier: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

function requireAuthSecrets(env: Env): { pepper: string; encryptionKey: string; hmacKey: string; privateKey: string; keyId: string } {
  if (!env.AUTH_PASSWORD_PEPPER_V1 || !env.PII_ENCRYPTION_KEY_V1 || !env.PII_HMAC_KEY_V1 || !env.JWT_PRIVATE_KEY || !env.JWT_KEY_ID) {
    throw new Error('authentication_not_configured');
  }
  return { pepper: env.AUTH_PASSWORD_PEPPER_V1, encryptionKey: env.PII_ENCRYPTION_KEY_V1, hmacKey: env.PII_HMAC_KEY_V1, privateKey: env.JWT_PRIVATE_KEY, keyId: env.JWT_KEY_ID };
}

function hashConfiguredPassword(env: Env, password: string, pepper: string): PasswordHash {
  return hashPassword(password, pepper, {
    fallbackToScrypt: env.PASSWORD_HASH_ALLOW_SCRYPT_FALLBACK === 'true',
    pepperVersion: 'v1',
  });
}

async function verifyTurnstile(env: Env, token: unknown): Promise<void> {
  if (env.TURNSTILE_REQUIRED !== 'true') return;
  if (!env.TURNSTILE_SECRET_KEY || typeof token !== 'string' || token.length < 10) throw new Error('turnstile_required');
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
  });
  if (!response.ok) throw new Error('turnstile_unavailable');
  const result = await response.json() as { success?: boolean };
  if (result.success !== true) throw new Error('turnstile_failed');
}

async function issueSession(env: Env, userId: string, roles: string[] = []): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const secrets = requireAuthSecrets(env);
  const account = await query<{ status: string; token_version: number }>(env.DB_APP_FRESH,
    `SELECT status, token_version FROM identity.users WHERE id = $1`, [userId]);
  if (!account.rows[0] || account.rows[0].status !== 'active') throw new Error('account_unavailable');
  const tokenVersion = Number(account.rows[0].token_version);
  const refreshToken = randomToken(32);
  const refreshHash = hashResetToken(refreshToken);
  const familyId = uuidv7();
  await transaction(env.DB_APP_FRESH, async (client) => {
    await client.query(`INSERT INTO identity.refresh_token_families (id, user_id) VALUES ($1, $2)`, [familyId, userId]);
    await client.query(`INSERT INTO identity.auth_sessions (id, user_id, refresh_family_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3, decode($4, 'base64'), now() + interval '30 days')`, [uuidv7(), userId, familyId, refreshHash]);
  });
  const accessToken = await signAccessToken({ userId, roles, tokenVersion, privateKeyPem: secrets.privateKey, keyId: secrets.keyId });
  return { accessToken, refreshToken, expiresIn: 900 };
}

async function sendEmailTransport(env: Env, input: { to: string; subject: string; html: string }): Promise<EmailDeliveryReference> {
  const providerMode = env.EMAIL_PROVIDER_MODE ?? (env.ENVIRONMENT === 'production' ? 'cloudflare' : 'fallback');
  if (providerMode === 'disabled') throw new Error('provider_unavailable');
  if (providerMode === 'cloudflare') {
    if (!env.EMAIL || !env.EMAIL_FROM) throw new Error('email_delivery_not_configured');
    await env.EMAIL.send({ to: input.to, from: env.EMAIL_FROM, subject: input.subject, html: input.html });
    return { provider: 'cloudflare-email', messageId: 'accepted', acceptedAt: new Date().toISOString() };
  }
  if (providerMode !== 'fallback') throw new Error('email_provider_mode_invalid');
  if (!env.EMAIL_PROVIDER_URL || !env.EMAIL_PROVIDER_TOKEN || !env.EMAIL_FROM) throw new Error('email_delivery_not_configured');
  const response = await fetch(env.EMAIL_PROVIDER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.EMAIL_PROVIDER_TOKEN}` },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: input.to, subject: input.subject, html: input.html }),
  });
  if (!response.ok) throw new Error(`email_delivery_failed_${response.status}`);
  const payload = await response.json().catch(() => ({})) as { messageId?: string };
  return { provider: 'fallback-email', messageId: payload.messageId ?? 'accepted', acceptedAt: new Date().toISOString() };
}

function createTransactionalEmailProvider(env: Env): TransactionalEmailProvider {
  const link = (baseUrl: string | undefined, token: string): string => baseUrl
    ? `<p><a href="${baseUrl}${encodeURIComponent(token)}">Continue securely</a></p>`
    : '';
  return {
    async sendVerification(input) {
      const subject = 'Verify your Lythaus email';
      return sendEmailTransport(env, { to: input.to, subject, html: `<p>${subject}.</p>${link(env.EMAIL_VERIFICATION_BASE_URL, input.token)}` });
    },
    async sendPasswordReset(input) {
      const subject = 'Reset your Lythaus password';
      return sendEmailTransport(env, { to: input.to, subject, html: `<p>${subject}.</p>${link(env.EMAIL_PASSWORD_RESET_BASE_URL, input.token)}` });
    },
    async sendSecurityNotice(input) {
      const subject = 'Lythaus security notice';
      return sendEmailTransport(env, { to: input.to, subject, html: `<p>${subject}.</p><p>${input.reason.replace(/[&<>"']/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value] ?? value))}</p>` });
    },
    async sendEmailChangeNotice(input) {
      const subject = 'Confirm your Lythaus email change';
      return sendEmailTransport(env, { to: input.to, subject, html: `<p>${subject}.</p>${link(env.EMAIL_VERIFICATION_BASE_URL, input.token)}` });
    },
    async sendAccountDeletionNotice(input) {
      const subject = 'Lythaus account deletion requested';
      return sendEmailTransport(env, { to: input.to, subject, html: `<p>${subject}.</p><p>Request reference: ${input.requestId}</p>` });
    },
  };
}

async function deliverAuthEmail(env: Env, input: { type: 'verification' | 'password_reset' | 'security'; to: string; token?: string; reason?: string }): Promise<EmailDeliveryReference> {
  const provider = createTransactionalEmailProvider(env);
  if (input.type === 'verification' && input.token) return provider.sendVerification({ to: input.to, token: input.token });
  if (input.type === 'password_reset' && input.token) return provider.sendPasswordReset({ to: input.to, token: input.token });
  return provider.sendSecurityNotice({ to: input.to, reason: input.reason ?? 'Account security event' });
}

async function emailAuth(request: Request, env: Env): Promise<Response> {
  const input = await readJson<EmailAuthInput>(request, 16 * 1024);
  const email = normalizeEmail(input.email ?? '');
  const password = input.password ?? '';
  if (input.mode !== 'resend_verification' && (password.length < 12 || password.length > 128)) throw new Error('invalid_password');
  if (input.mode === 'register') await verifyTurnstile(env, input.turnstileToken);
  const secrets = requireAuthSecrets(env);
  const lookup = hmacLookup(email, secrets.hmacKey);
  const existing = await query<{ id: string; status: string; password_hash: PasswordHash; verified_at: string | null }>(env.DB_APP_FRESH,
    `SELECT u.id, u.status, c.password_hash, c.verified_at
       FROM identity.email_credentials c JOIN identity.users u ON u.id = c.user_id
      WHERE c.email_lookup_hmac = decode($1, 'base64')`, [lookup]);
  const account = existing.rows[0];
  if (input.mode === 'resend_verification') {
    if (!account || account.verified_at) return privateResponse(request, env, { state: 'verification_required' }, { status: 202 });
    const verificationToken = randomToken(32);
    await query(env.DB_APP_FRESH,
      `INSERT INTO identity.email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, decode($3, 'base64'), now() + interval '30 minutes')`,
      [uuidv7(), account.id, hashResetToken(verificationToken)]);
    await deliverAuthEmail(env, { type: 'verification', to: email, token: verificationToken });
    return privateResponse(request, env, { state: 'verification_required' }, { status: 202 });
  }
  if ((input.mode ?? 'login') === 'register') {
    if (account) throw new Error('account_exists');
    const userId = uuidv7();
    const encrypted = await encryptField(email, secrets.encryptionKey, 'v1');
    const passwordHash = hashConfiguredPassword(env, password, secrets.pepper);
    const verificationToken = randomToken(32);
    await transaction(env.DB_APP_FRESH, async (client) => {
      await client.query(`INSERT INTO identity.users (id) VALUES ($1)`, [userId]);
      await client.query(`INSERT INTO identity.email_credentials (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, hmac_key_version, password_hash) VALUES ($1, convert_to($2, 'utf8'), decode($3, 'base64'), 'v1', 'v1', $4::jsonb)`, [userId, encrypted.ciphertext, lookup, JSON.stringify(passwordHash)]);
      await client.query(`INSERT INTO identity.email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, decode($3, 'base64'), now() + interval '30 minutes')`, [uuidv7(), userId, hashResetToken(verificationToken)]);
      await client.query(`INSERT INTO identity.account_events (id, user_id, event_type, metadata) VALUES ($1, $2, 'email_registration_started', '{}'::jsonb)`, [uuidv7(), userId]);
    });
    await deliverAuthEmail(env, { type: 'verification', to: email, token: verificationToken });
    return privateResponse(request, env, { userId, state: 'verification_required' }, { status: 202 });
  }
  if (!account || account.status !== 'active' || !verifyPassword(password, account.password_hash, secrets.pepper)) throw new Error('invalid_credentials');
  if (!account.verified_at) throw new Error('email_verification_required');
  if (needsPasswordRehash(account.password_hash, 'v1')) {
    const upgradedHash = hashConfiguredPassword(env, password, secrets.pepper);
    await query(env.DB_APP_FRESH,
      `UPDATE identity.email_credentials SET password_hash = $1::jsonb, updated_at = now() WHERE user_id = $2`,
      [JSON.stringify(upgradedHash), account.id]);
  }
  const tokens = await issueSession(env, account.id);
  return privateResponse(request, env, { ...tokens, tokenType: 'Bearer' });
}

async function verifyEmail(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? (await readJson<{ token?: string }>(request, 8 * 1024)).token;
  if (!token || token.length < 32) throw new Error('verification_token_invalid');
  const result = await transaction(env.DB_APP_FRESH, async (client) => {
    const found = await client.query<{ user_id: string }>(`SELECT user_id FROM identity.email_verification_tokens WHERE token_hash = decode($1, 'base64') AND consumed_at IS NULL AND expires_at > now()`, [hashResetToken(token)]);
    if (!found.rows[0]) throw new Error('verification_token_invalid');
    await client.query(`UPDATE identity.email_verification_tokens SET consumed_at = now() WHERE token_hash = decode($1, 'base64') AND consumed_at IS NULL`, [hashResetToken(token)]);
    await client.query(`UPDATE identity.email_credentials SET verified_at = COALESCE(verified_at, now()), updated_at = now() WHERE user_id = $1`, [found.rows[0].user_id]);
    await client.query(`INSERT INTO identity.account_events (id, user_id, event_type, metadata) VALUES ($1, $2, 'email_verified', '{}'::jsonb)`, [uuidv7(), found.rows[0].user_id]);
    return found.rows[0].user_id;
  });
  return response(request, env, { userId: result, state: 'verified' });
}

async function refreshSession(request: Request, env: Env): Promise<Response> {
  const input = await readJson<{ refreshToken?: string; refresh_token?: string }>(request, 16 * 1024);
  const refreshToken = input.refreshToken ?? input.refresh_token;
  if (!refreshToken) throw new Error('refresh_token_required');
  requireAuthSecrets(env);
  const tokenHash = hashResetToken(refreshToken);
  const current = await query<{ session_id: string; user_id: string; family_id: string; status: string }>(env.DB_APP_FRESH,
    `SELECT s.id AS session_id, s.user_id, s.refresh_family_id AS family_id, u.status
       FROM identity.auth_sessions s JOIN identity.refresh_token_families f ON f.id = s.refresh_family_id
       JOIN identity.users u ON u.id = s.user_id
      WHERE s.refresh_token_hash = decode($1, 'base64') AND s.revoked_at IS NULL AND s.expires_at > now() AND f.revoked_at IS NULL`, [tokenHash]);
  const session = current.rows[0];
  if (!session || session.status !== 'active') throw new Error('refresh_token_invalid');
  const replacement = randomToken(32);
  await transaction(env.DB_APP_FRESH, async (client) => {
    const revoked = await client.query(`UPDATE identity.auth_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [session.session_id]);
    if (revoked.rowCount !== 1) {
      await client.query(`UPDATE identity.refresh_token_families SET revoked_at = now() WHERE id = $1`, [session.family_id]);
      throw new Error('refresh_token_reuse');
    }
    await client.query(`UPDATE identity.refresh_token_families SET last_used_at = now() WHERE id = $1`, [session.family_id]);
    await client.query(`INSERT INTO identity.auth_sessions (id, user_id, refresh_family_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3, decode($4, 'base64'), now() + interval '30 days')`, [uuidv7(), session.user_id, session.family_id, hashResetToken(replacement)]);
  });
  const secrets = requireAuthSecrets(env);
  const tokenVersion = await query<{ token_version: number }>(env.DB_APP_FRESH,
    `SELECT token_version FROM identity.users WHERE id = $1`, [session.user_id]);
  const accessToken = await signAccessToken({ userId: session.user_id, tokenVersion: Number(tokenVersion.rows[0]?.token_version ?? 1), privateKeyPem: secrets.privateKey, keyId: secrets.keyId });
  return privateResponse(request, env, { accessToken, refreshToken: replacement, expiresIn: 900, tokenType: 'Bearer' });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const user = await principal(request, env);
  await transaction(env.DB_APP_FRESH, async (client) => {
    await client.query(`UPDATE identity.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [user.userId]);
    await client.query(`UPDATE identity.refresh_token_families SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [user.userId]);
    await client.query(`UPDATE identity.users SET token_version = token_version + 1, updated_at = now() WHERE id = $1`, [user.userId]);
  });
  return privateResponse(request, env, { loggedOut: true });
}

interface OAuthStateRecord {
  verifier: string;
  appState: string;
  redirectUri: string;
  codeChallenge: string;
  clientId: string;
}

interface OAuthExchangeRecord {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  redirectUri: string;
  codeChallenge: string;
  clientId: string;
}

function allowedOAuthRedirect(value: string, env: Env): boolean {
  try {
    const uri = new URL(value);
    if (uri.protocol === 'https:' && uri.pathname === '/auth/callback') {
      const origins = (env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
      return origins.includes(uri.origin);
    }
    return (uri.protocol === 'asora:' || uri.protocol === 'lythaus:' || uri.protocol === 'com.asora.app:')
      && uri.hostname === 'oauth'
      && uri.pathname === '/callback';
  } catch {
    return false;
  }
}

async function googleAuthStart(request: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI || !env.LYTHAUS_CONFIG) throw new Error('google_not_configured');
  const url = new URL(request.url);
  const appState = url.searchParams.get('state') ?? '';
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  const codeChallenge = url.searchParams.get('code_challenge') ?? '';
  const clientId = url.searchParams.get('client_id') ?? '';
  const provider = (url.searchParams.get('idp') ?? 'Google').toLowerCase();
  if (provider !== 'google') throw new Error('provider_unavailable');
  if (!appState || !redirectUri || !codeChallenge || !clientId || !allowedOAuthRedirect(redirectUri, env)) {
    throw new Error('oauth_request_invalid');
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) throw new Error('oauth_challenge_invalid');
  const state = randomToken(24);
  const verifier = randomToken(32);
  const stateRecord: OAuthStateRecord = { verifier, appState, redirectUri, codeChallenge, clientId };
  await env.LYTHAUS_CONFIG.put(`oauth:google:${state}`, JSON.stringify(stateRecord), { expirationTtl: 600 });
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account',
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
  }).toString();
  return new Response(null, { status: 302, headers: { location: authorization.toString(), 'cache-control': 'no-store' } });
}

async function googleAuthCallback(request: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI || !env.GOOGLE_JWKS_URL || !env.LYTHAUS_CONFIG || !env.PII_HMAC_KEY_V1 || !env.PII_ENCRYPTION_KEY_V1 || !env.JWT_PRIVATE_KEY || !env.JWT_KEY_ID) throw new Error('google_not_configured');
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || !code) throw new Error('google_callback_invalid');
  const stateValue = await env.LYTHAUS_CONFIG.get(`oauth:google:${state}`);
  if (!stateValue) throw new Error('google_state_invalid');
  const stateRecord = typeof stateValue === 'string' ? JSON.parse(stateValue) as OAuthStateRecord : null;
  if (!stateRecord?.verifier || !stateRecord.appState || !allowedOAuthRedirect(stateRecord.redirectUri, env)) throw new Error('google_state_invalid');
  await env.LYTHAUS_CONFIG.delete(`oauth:google:${state}`);
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code', code_verifier: stateRecord.verifier }),
  });
  if (!tokenResponse.ok) throw new Error('google_code_exchange_failed');
  const tokenPayload = await tokenResponse.json() as { id_token?: string };
  if (!tokenPayload.id_token) throw new Error('google_id_token_missing');
  const verified = await jwtVerify(tokenPayload.id_token, createRemoteJWKSet(new URL(env.GOOGLE_JWKS_URL)), { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: env.GOOGLE_CLIENT_ID });
  const claims = verified.payload as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!claims.sub || !claims.email || claims.email_verified !== true) throw new Error('google_identity_unverified');
  const email = normalizeEmail(claims.email);
  const subjectHmac = hmacLookup(claims.sub, env.PII_HMAC_KEY_V1);
  const emailHmac = hmacLookup(email, env.PII_HMAC_KEY_V1);
  const existing = await query<{ id: string; status: string }>(env.DB_APP_FRESH,
    `SELECT u.id, u.status FROM identity.provider_links p JOIN identity.users u ON u.id = p.user_id WHERE p.provider = 'google' AND p.provider_subject_hmac = decode($1, 'base64')`, [subjectHmac]);
  let userId = existing.rows[0]?.id;
  let accountStatus = existing.rows[0]?.status;
  if (!userId) {
    const byEmail = await query<{ id: string; status: string; source_provider: string | null; verified_at: string | null }>(env.DB_APP_FRESH,
      `SELECT u.id, u.status, c.source_provider, c.verified_at
         FROM identity.users u
         LEFT JOIN identity.contact_emails c ON c.user_id = u.id AND c.email_lookup_hmac = decode($1, 'base64')
        WHERE EXISTS (SELECT 1 FROM identity.email_credentials e WHERE e.user_id = u.id AND e.email_lookup_hmac = decode($1, 'base64'))
           OR c.user_id IS NOT NULL
        LIMIT 1`, [emailHmac]);
    userId = byEmail.rows[0]?.id;
    accountStatus = byEmail.rows[0]?.status;
    if (userId && accountStatus === 'relink_required') throw new Error('account_relink_required');
    const encryptedSubject = await encryptField(claims.sub, env.PII_ENCRYPTION_KEY_V1, 'v1');
    await transaction(env.DB_APP_FRESH, async (client) => {
      if (!userId) {
        userId = uuidv7();
        await client.query(`INSERT INTO identity.users (id, display_name) VALUES ($1, $2)`, [userId, claims.name?.trim().slice(0, 160) ?? '']);
      }
      await client.query(`INSERT INTO identity.provider_links (id, user_id, provider, provider_subject_ciphertext, provider_subject_hmac) VALUES ($1, $2, 'google', convert_to($3, 'utf8'), decode($4, 'base64')) ON CONFLICT (provider, provider_subject_hmac) DO NOTHING`, [uuidv7(), userId, encryptedSubject.ciphertext, subjectHmac]);
    });
  }
  if (!userId || accountStatus === 'suspended' || accountStatus === 'deleted') throw new Error('account_unavailable');
  const encryptedEmail = await encryptField(email, env.PII_ENCRYPTION_KEY_V1, 'v1');
  await transaction(env.DB_APP_FRESH, async (client) => {
    await client.query(
      `INSERT INTO identity.contact_emails (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, source_provider, verified_at)
       VALUES ($1, convert_to($2, 'utf8'), decode($3, 'base64'), 'v1', 'google', now())
       ON CONFLICT (user_id) DO UPDATE SET email_ciphertext = EXCLUDED.email_ciphertext,
         email_lookup_hmac = EXCLUDED.email_lookup_hmac, encryption_key_version = EXCLUDED.encryption_key_version,
         source_provider = EXCLUDED.source_provider, verified_at = EXCLUDED.verified_at, updated_at = now()`,
      [userId, encryptedEmail.ciphertext, emailHmac]);
    await client.query(`INSERT INTO identity.account_events (id, user_id, event_type, metadata) VALUES ($1, $2, 'google_login', '{}'::jsonb)`, [uuidv7(), userId]);
  });
  const tokens = await issueSession(env, userId);
  const authorizationCode = randomToken(32);
  const exchange: OAuthExchangeRecord = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    redirectUri: stateRecord.redirectUri,
    codeChallenge: stateRecord.codeChallenge,
    clientId: stateRecord.clientId,
  };
  await env.LYTHAUS_CONFIG.put(`oauth:exchange:${authorizationCode}`, JSON.stringify(exchange), { expirationTtl: 120 });
  const appCallback = new URL(stateRecord.redirectUri);
  appCallback.searchParams.set('code', authorizationCode);
  appCallback.searchParams.set('state', stateRecord.appState);
  return new Response(null, { status: 302, headers: { location: appCallback.toString(), 'cache-control': 'no-store' } });
}

async function exchangeOAuthCode(request: Request, env: Env): Promise<Response> {
  if (!env.LYTHAUS_CONFIG) throw new Error('google_not_configured');
  const form = new URLSearchParams(await request.text());
  const code = form.get('code') ?? '';
  const verifier = form.get('code_verifier') ?? '';
  const redirectUri = form.get('redirect_uri') ?? '';
  const clientId = form.get('client_id') ?? '';
  if (form.get('grant_type') !== 'authorization_code' || !code || !verifier) throw new Error('oauth_exchange_invalid');
  const stored = await env.LYTHAUS_CONFIG.get(`oauth:exchange:${code}`);
  if (typeof stored !== 'string') throw new Error('oauth_code_invalid');
  const exchange = JSON.parse(stored) as OAuthExchangeRecord;
  if (exchange.redirectUri !== redirectUri || exchange.clientId !== clientId || !allowedOAuthRedirect(redirectUri, env)) {
    throw new Error('oauth_exchange_invalid');
  }
  if (await pkceChallenge(verifier) !== exchange.codeChallenge) throw new Error('oauth_verifier_invalid');
  await env.LYTHAUS_CONFIG.delete(`oauth:exchange:${code}`);
  return privateResponse(request, env, {
    access_token: exchange.accessToken,
    refresh_token: exchange.refreshToken,
    expires_in: exchange.expiresIn,
    token_type: 'Bearer',
  });
}

async function requestPasswordReset(request: Request, env: Env): Promise<Response> {
  const input = await readJson<{ email?: string; turnstileToken?: string }>(request, 8 * 1024);
  await verifyTurnstile(env, input.turnstileToken);
  const email = normalizeEmail(input.email ?? '');
  if (!env.PII_HMAC_KEY_V1) throw new Error('authentication_not_configured');
  const lookup = hmacLookup(email, env.PII_HMAC_KEY_V1);
  const account = await query<{ id: string }>(env.DB_APP_FRESH,
    `SELECT u.id FROM identity.email_credentials c JOIN identity.users u ON u.id = c.user_id
      WHERE c.email_lookup_hmac = decode($1, 'base64') AND u.status = 'active'`, [lookup]);
  if (account.rows[0]) {
    const token = randomToken(32);
    await query(env.DB_APP_FRESH,
      `INSERT INTO identity.password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, decode($3, 'base64'), now() + interval '30 minutes')`,
      [uuidv7(), account.rows[0].id, hashResetToken(token)]);
    await deliverAuthEmail(env, { type: 'password_reset', to: email, token });
  }
  return response(request, env, { state: 'reset_if_eligible' }, { status: 202 });
}

async function completePasswordReset(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const input = await readJson<{ token?: string; password?: string }>(request, 16 * 1024);
  const token = url.searchParams.get('token') ?? input.token;
  const password = input.password ?? '';
  if (!token || token.length < 32) throw new Error('reset_token_invalid');
  if (password.length < 12 || password.length > 128) throw new Error('invalid_password');
  const secrets = requireAuthSecrets(env);
  const passwordHash = hashConfiguredPassword(env, password, secrets.pepper);
  await transaction(env.DB_APP_FRESH, async (client) => {
    const found = await client.query<{ user_id: string }>(`SELECT user_id FROM identity.password_reset_tokens WHERE token_hash = decode($1, 'base64') AND consumed_at IS NULL AND expires_at > now()`, [hashResetToken(token)]);
    if (!found.rows[0]) throw new Error('reset_token_invalid');
    await client.query(`UPDATE identity.password_reset_tokens SET consumed_at = now() WHERE token_hash = decode($1, 'base64') AND consumed_at IS NULL`, [hashResetToken(token)]);
    await client.query(`UPDATE identity.email_credentials SET password_hash = $1::jsonb, updated_at = now() WHERE user_id = $2`, [JSON.stringify(passwordHash), found.rows[0].user_id]);
    await client.query(`UPDATE identity.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [found.rows[0].user_id]);
    await client.query(`UPDATE identity.refresh_token_families SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [found.rows[0].user_id]);
    await client.query(`UPDATE identity.users SET token_version = token_version + 1, updated_at = now() WHERE id = $1`, [found.rows[0].user_id]);
    await client.query(`INSERT INTO identity.account_events (id, user_id, event_type, metadata) VALUES ($1, $2, 'password_reset_completed', '{}'::jsonb)`, [uuidv7(), found.rows[0].user_id]);
  });
  return response(request, env, { state: 'password_reset_completed' });
}

function corsOrigin(request: Request, env: Env): string | undefined {
  const origin = request.headers.get('origin');
  return origin && (env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).includes(origin)
    ? origin
    : undefined;
}

function response(request: Request, env: Env, body: unknown, init: ResponseInit = {}): Response {
  const result = init.status === 204 ? new Response(null, init) : json(body, init);
  const origin = corsOrigin(request, env);
  if (origin) {
    result.headers.set('access-control-allow-origin', origin);
    result.headers.set('access-control-allow-credentials', 'true');
  }
  result.headers.set('x-correlation-id', correlationId(request));
  result.headers.set('vary', 'Origin, Authorization');
  return result;
}

function privateResponse(request: Request, env: Env, body: unknown, init: ResponseInit = {}): Response {
  const result = response(request, env, body, init);
  result.headers.set('cache-control', 'private, no-store');
  return result;
}

async function principal(request: Request, env: Env): Promise<Principal> {
  const value = request.headers.get('authorization');
  const token = value?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || !env.JWT_PUBLIC_JWKS) throw new Error('authentication_required');
  const subject = await verifyAccessToken(token, env.JWT_PUBLIC_JWKS);
  const account = await query<{ status: string; token_version: number }>(env.DB_APP_FRESH,
    `SELECT status, token_version FROM identity.users WHERE id = $1`, [subject.userId]);
  if (!account.rows[0] || account.rows[0].status !== 'active' || Number(account.rows[0].token_version) !== subject.tokenVersion) {
    throw new Error('authentication_required');
  }
  return subject;
}

async function readJson<T>(request: Request, maxBytes: number): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maxBytes) throw new Error('request_too_large');
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error('request_too_large');
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

type IdempotencyRecord = { state: 'processing' | 'completed'; status?: number; body?: unknown };

async function idempotentMutation(
  request: Request,
  env: Env,
  actorId: string,
  scope: string,
  work: () => Promise<Response>,
): Promise<Response> {
  const key = request.headers.get('idempotency-key')?.trim();
  if (!key) return work();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key)) throw new Error('invalid_idempotency_key');
  const claimed = await query<{ response: IdempotencyRecord }>(env.DB_APP_FRESH,
    `INSERT INTO system.idempotency_keys (scope, key, actor_id, response)
     VALUES ($1, $2, $3, '{"state":"processing"}'::jsonb)
     ON CONFLICT (scope, key) DO NOTHING
     RETURNING response`, [scope, key, actorId]);
  if (claimed.rowCount === 0) {
    const existing = await query<{ actor_id: string | null; response: IdempotencyRecord }>(env.DB_APP_FRESH,
      `SELECT actor_id, response FROM system.idempotency_keys WHERE scope = $1 AND key = $2`, [scope, key]);
    const record = existing.rows[0];
    if (!record || record.actor_id !== actorId) throw new Error('idempotency_key_conflict');
    if (record.response.state === 'processing') throw new Error('idempotency_in_progress');
    return privateResponse(request, env, record.response.body ?? null, { status: record.response.status ?? 200 });
  }
  try {
    const result = await work();
    const rawBody = await result.clone().text();
    const body = rawBody ? JSON.parse(rawBody) : null;
    await query(env.DB_APP_FRESH,
      `UPDATE system.idempotency_keys SET response = $4::jsonb WHERE scope = $1 AND key = $2 AND actor_id = $3`,
      [scope, key, actorId, JSON.stringify({ state: 'completed', status: result.status, body })]);
    return result;
  } catch (error) {
    await query(env.DB_APP_FRESH,
      `DELETE FROM system.idempotency_keys WHERE scope = $1 AND key = $2 AND actor_id = $3`, [scope, key, actorId]).catch(() => undefined);
    throw error;
  }
}

async function createPost(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<CreatePostInput>(request, 64 * 1024);
  if (!input.body?.trim() || !['human', 'ai_assisted', 'ai_generated'].includes(input.declaredCreationMode)) {
    throw new Error('invalid_post');
  }
  if (!['global', 'country', 'province', 'municipality', 'community', 'none'].includes(input.geoScope)) {
    throw new Error('invalid_geo_scope');
  }
  const postId = uuidv7();
  const eventId = uuidv7();
  await transaction(env.DB_APP_FRESH, async (client) => {
    await client.query(
      `INSERT INTO content.posts (id, author_id, body, declared_creation_mode, geo_scope, place_id, moderation_state)
       VALUES ($1, $2, $3, $4, $5, $6, 'under_review')`,
      [postId, user.userId, input.body.trim(), input.declaredCreationMode, input.geoScope, input.placeId ?? null]
    );
    if (input.placeId && input.geoScope !== 'none' && input.geoScope !== 'global') {
      const precision = input.geoScope === 'country' ? 'country'
        : input.geoScope === 'province' ? 'province'
          : input.geoScope === 'municipality' ? 'municipality' : 'community';
      await client.query(
        `INSERT INTO content.post_locations (post_id, place_id, location_source, location_precision)
         VALUES ($1, $2, 'user_selected', $3)`,
        [postId, input.placeId, precision]
      );
    }
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'content.post.created', 'post', $2, $3, $4::jsonb)`,
      [eventId, postId, user.userId, JSON.stringify({ postId, declaredCreationMode: input.declaredCreationMode })]
    );
  });
  return privateResponse(request, env, { postId, eventId }, { status: 201 });
}

async function createUploadSession(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<{ contentType?: string; size?: number }>(request, 16 * 1024);
  if (!input.contentType || !ALLOWED_IMAGE_TYPES.includes(input.contentType as AllowedImageType)) {
    throw new Error('unsupported_media_type');
  }
  if (!input.size || input.size < 1 || input.size > MAX_IMAGE_BYTES) throw new Error('media_size_exceeded');
  const requestedBytes = input.size;
  const requestedContentType = input.contentType as AllowedImageType;
  const checksumSha256 = typeof (input as { checksumSha256?: unknown }).checksumSha256 === 'string'
    ? (input as { checksumSha256: string }).checksumSha256.toLowerCase()
    : '';
  if (!/^[0-9a-f]{64}$/.test(checksumSha256)) throw new Error('checksum_required');
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) throw new Error('media_signing_not_configured');
  const quotaBytes = Number(env.MEDIA_QUOTA_BYTES);
  if (!Number.isSafeInteger(quotaBytes) || quotaBytes < 1) throw new Error('storage_quota_not_configured');
  const uploadSessionId = uuidv7();
  const objectKey = `quarantine/${user.userId}/${uploadSessionId}`;
  const signed = await createPresignedPutUrl({
    accountId: env.R2_ACCOUNT_ID,
    bucket: env.MEDIA_QUARANTINE_BUCKET ?? 'lythaus-media-quarantine',
    key: objectKey,
    contentType: input.contentType as AllowedImageType,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
  await transaction(env.DB_APP_FRESH, async (client) => {
    const ledger = await client.query<{ bytes_reserved: number; bytes_approved: number }>(
      `SELECT bytes_reserved, bytes_approved FROM media.storage_ledger WHERE user_id = $1 FOR UPDATE`, [user.userId]);
    const current = ledger.rows[0] ?? { bytes_reserved: 0, bytes_approved: 0 };
    if (Number(current.bytes_reserved) + Number(current.bytes_approved) + requestedBytes > quotaBytes) throw new Error('storage_quota_exceeded');
    await client.query(
      `INSERT INTO media.storage_ledger (user_id, bytes_reserved) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET bytes_reserved = media.storage_ledger.bytes_reserved + EXCLUDED.bytes_reserved`,
      [user.userId, requestedBytes]
    );
    await client.query(
      `INSERT INTO media.upload_sessions (id, user_id, object_key, content_type, expected_bytes, checksum_sha256, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uploadSessionId, user.userId, objectKey, requestedContentType, requestedBytes, checksumSha256, signed.expiresAt]
    );
  });
  return privateResponse(request, env, {
    uploadSessionId,
    objectKey,
    putUrl: signed.url,
    expiresAt: signed.expiresAt,
    contentType: input.contentType,
    maxBytes: MAX_IMAGE_BYTES,
    checksumSha256,
  }, { status: 201 });
}

async function finaliseUpload(request: Request, env: Env, user: Principal, sessionId: string): Promise<Response> {
  const result = await query<{ object_key: string; expected_bytes: number; checksum_sha256: string; status: string }>(env.DB_APP_FRESH,
    `SELECT object_key, expected_bytes, checksum_sha256, status FROM media.upload_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, user.userId]
  );
  const session = result.rows[0];
  if (!session || session.status !== 'pending') throw new Error('upload_session_invalid');
  const object = await env.MEDIA_QUARANTINE.head(session.object_key);
  if (!object || object.size !== Number(session.expected_bytes)) {
    await rejectUploadReservation(env, user.userId, sessionId, Number(session.expected_bytes));
    throw new Error('upload_object_invalid');
  }
  const source = await env.MEDIA_QUARANTINE.get(session.object_key);
  if (!source) throw new Error('upload_object_invalid');
  const digest = await crypto.subtle.digest('SHA-256', await new Response(source.body).arrayBuffer());
  const checksum = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
  if (checksum !== session.checksum_sha256) {
    await rejectUploadReservation(env, user.userId, sessionId, Number(session.expected_bytes));
    throw new Error('upload_checksum_invalid');
  }
  const eventId = uuidv7();
  await transaction(env.DB_APP_FRESH, async (client) => {
    const updated = await client.query(
      `UPDATE media.upload_sessions SET status = 'queued', observed_bytes = $1, finalised_at = now()
        WHERE id = $2 AND user_id = $3 AND status = 'pending'`,
      [object.size, sessionId, user.userId]
    );
    if (updated.rowCount === 0) throw new Error('upload_session_invalid');
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'media.upload.finalised', 'upload_session', $2, $3, $4::jsonb)`,
      [eventId, sessionId, user.userId, JSON.stringify({ uploadSessionId: sessionId, objectKey: session.object_key })]
    );
  });
  return privateResponse(request, env, { uploadSessionId: sessionId, status: 'queued', eventId });
}

async function rejectUploadReservation(env: Env, userId: string, sessionId: string, bytes: number): Promise<void> {
  await transaction(env.DB_APP_FRESH, async (client) => {
    const updated = await client.query(
      `UPDATE media.upload_sessions SET status = 'rejected' WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [sessionId, userId]);
    if (updated.rowCount !== 0) await client.query(
      `UPDATE media.storage_ledger SET bytes_reserved = greatest(bytes_reserved - $1, 0), bytes_rejected = bytes_rejected + $1, last_reconciled_at = now() WHERE user_id = $2`,
      [bytes, userId]);
  });
}

async function getUserProfile(request: Request, env: Env, userId: string, privateView = false): Promise<Response> {
  const result = await query(env.DB_APP_FRESH,
    `SELECT u.id, u.display_name, u.created_at, h.handle, p.bio, p.avatar_object_id,
            COALESCE(p.trust_passport_visibility, 'public_minimal') AS trust_passport_visibility,
            COALESCE(r.points, 0)::integer AS reputation_score
       FROM identity.users u
       LEFT JOIN identity.handles h ON h.user_id = u.id
       LEFT JOIN social.profiles p ON p.user_id = u.id
       LEFT JOIN trust.reputation_balances r ON r.user_id = u.id
      WHERE u.id = $1 AND u.status = 'active'
        AND ($2::boolean OR COALESCE(p.public_visibility, true))`, [userId, privateView]);
  const profile = result.rows[0] as {
    id: string;
    display_name: string;
    handle: string | null;
    bio: string | null;
    avatar_object_id: string | null;
    trust_passport_visibility: string;
    reputation_score: number;
  } | undefined;
  if (!profile) throw new Error('profile_not_found');
  const body = {
    user: {
      id: profile.id,
      displayName: profile.display_name,
      handle: profile.handle,
      avatarUrl: null,
      bio: profile.bio,
      tier: 'free',
      trustPassportVisibility: profile.trust_passport_visibility,
      reputationScore: Number(profile.reputation_score),
      journalistVerified: false,
      badges: [],
    },
  };
  const output = privateView ? privateResponse(request, env, body) : response(request, env, body);
  if (!privateView) output.headers.set('cache-control', 'public, max-age=30, s-maxage=30');
  return output;
}

async function getUserInfo(request: Request, env: Env, userId: string): Promise<Response> {
  if (!env.PII_ENCRYPTION_KEY_V1) throw new Error('authentication_not_configured');
  const result = await query<{
    id: string;
    email_ciphertext: string | null;
    encryption_key_version: string | null;
    role: string | null;
    reputation_score: number;
    created_at: string;
    last_login_at: string;
  }>(env.DB_APP_FRESH,
    `SELECT u.id,
            convert_from(e.email_ciphertext, 'utf8') AS email_ciphertext,
            e.encryption_key_version,
            a.role,
            COALESCE(r.points, 0)::integer AS reputation_score,
            u.created_at,
            COALESCE((SELECT max(created_at) FROM identity.account_events x WHERE x.user_id = u.id AND x.event_type = 'google_login'), u.created_at) AS last_login_at
       FROM identity.users u
       LEFT JOIN identity.contact_emails e ON e.user_id = u.id
       LEFT JOIN identity.admin_memberships a ON a.user_id = u.id AND a.active = true
       LEFT JOIN trust.reputation_balances r ON r.user_id = u.id
      WHERE u.id = $1 AND u.status = 'active'`, [userId]);
  const user = result.rows[0];
  if (!user?.email_ciphertext || !user.encryption_key_version) throw new Error('userinfo_unavailable');
  const email = await decryptField({
    ciphertext: user.email_ciphertext,
    encryptionKeyVersion: user.encryption_key_version,
  }, env.PII_ENCRYPTION_KEY_V1);
  const role = user.role === 'administrator' ? 'admin' : user.role === 'moderator' || user.role === 'privacy_operator' ? 'moderator' : 'user';
  return privateResponse(request, env, {
    id: user.id,
    sub: user.id,
    email,
    role,
    tier: 'bronze',
    subscription_tier: 'free',
    reputation_score: Number(user.reputation_score),
    created_at: user.created_at,
    last_login_at: user.last_login_at,
  });
}

async function updateProfile(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<{ displayName?: string; bio?: string; trustPassportVisibility?: string }>(request, 16 * 1024);
  const displayName = input.displayName?.trim();
  const bio = input.bio?.trim();
  const visibility = input.trustPassportVisibility;
  if (displayName !== undefined && (displayName.length < 1 || displayName.length > 160)) throw new Error('invalid_display_name');
  if (bio !== undefined && bio.length > 2000) throw new Error('invalid_bio');
  if (visibility !== undefined && !['public_expanded', 'public_minimal', 'private'].includes(visibility)) throw new Error('invalid_profile_visibility');
  await transaction(env.DB_APP_FRESH, async (client) => {
    if (displayName !== undefined) await client.query('UPDATE identity.users SET display_name = $1, updated_at = now() WHERE id = $2', [displayName, user.userId]);
    if (bio !== undefined) await client.query(`INSERT INTO social.profiles (user_id, bio) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET bio = EXCLUDED.bio, updated_at = now()`, [user.userId, bio]);
    if (visibility !== undefined) await client.query(
      `INSERT INTO social.profiles (user_id, public_visibility, trust_passport_visibility)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET public_visibility = EXCLUDED.public_visibility,
         trust_passport_visibility = EXCLUDED.trust_passport_visibility, updated_at = now()`,
      [user.userId, visibility !== 'private', visibility]);
  });
  return getUserProfile(request, env, user.userId, true);
}

async function createFollow(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<{ userId?: string }>(request, 8 * 1024);
  if (!input.userId || input.userId === user.userId) throw new Error('invalid_follow');
  await query(env.DB_APP_FRESH, `INSERT INTO social.follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.userId, input.userId]);
  return privateResponse(request, env, { following: input.userId }, { status: 201 });
}

async function setBlock(request: Request, env: Env, user: Principal, targetUserId: string, blocked: boolean): Promise<Response> {
  if (!targetUserId || targetUserId === user.userId) throw new Error('invalid_block');
  await transaction(env.DB_APP_FRESH, async (client) => {
    if (blocked) {
      await client.query(`INSERT INTO social.blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.userId, targetUserId]);
      await client.query(`DELETE FROM social.follows WHERE (follower_id = $1 AND followed_id = $2) OR (follower_id = $2 AND followed_id = $1)`, [user.userId, targetUserId]);
    } else {
      await client.query(`DELETE FROM social.blocks WHERE blocker_id = $1 AND blocked_id = $2`, [user.userId, targetUserId]);
    }
  });
  return privateResponse(request, env, { userId: targetUserId, blocked });
}

async function setMute(request: Request, env: Env, user: Principal, targetUserId: string, muted: boolean): Promise<Response> {
  if (!targetUserId || targetUserId === user.userId) throw new Error('invalid_mute');
  if (muted) {
    await query(env.DB_APP_FRESH, `INSERT INTO social.mutes (muter_id, muted_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.userId, targetUserId]);
  } else {
    await query(env.DB_APP_FRESH, `DELETE FROM social.mutes WHERE muter_id = $1 AND muted_id = $2`, [user.userId, targetUserId]);
  }
  return privateResponse(request, env, { userId: targetUserId, muted });
}

async function setBookmark(request: Request, env: Env, user: Principal, postId: string, bookmarked: boolean): Promise<Response> {
  if (!postId) throw new Error('invalid_bookmark');
  if (bookmarked) {
    await query(env.DB_APP_FRESH, `INSERT INTO social.bookmarks (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.userId, postId]);
  } else {
    await query(env.DB_APP_FRESH, `DELETE FROM social.bookmarks WHERE user_id = $1 AND post_id = $2`, [user.userId, postId]);
  }
  return privateResponse(request, env, { postId, bookmarked });
}

async function createComment(request: Request, env: Env, user: Principal, postId: string): Promise<Response> {
  const input = await readJson<{ body?: string; parentId?: string }>(request, 32 * 1024);
  const body = input.body?.trim();
  if (!body) throw new Error('invalid_comment');
  const commentId = uuidv7();
  await transaction(env.DB_APP_FRESH, async (client) => {
    await client.query(`INSERT INTO content.comments (id, post_id, author_id, parent_id, body) VALUES ($1, $2, $3, $4, $5)`, [commentId, postId, user.userId, input.parentId ?? null, body]);
    await client.query(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload) VALUES ($1, 'content.comment.created', 'comment', $2, $3, $4::jsonb)`, [uuidv7(), commentId, user.userId, JSON.stringify({ postId, commentId })]);
  });
  return privateResponse(request, env, { commentId }, { status: 201 });
}

async function createReaction(request: Request, env: Env, user: Principal, postId: string): Promise<Response> {
  const input = await readJson<{ reactionType?: string }>(request, 8 * 1024);
  if (!input.reactionType || !/^[a-z0-9:_-]{1,32}$/i.test(input.reactionType)) throw new Error('invalid_reaction');
  await query(env.DB_APP_FRESH, `INSERT INTO social.reactions (user_id, post_id, reaction_type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [user.userId, postId, input.reactionType]);
  return privateResponse(request, env, { postId, reactionType: input.reactionType }, { status: 201 });
}

async function createFlag(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<{ contentType?: string; contentId?: string; reasonCode?: string }>(request, 16 * 1024);
  if (!input.contentType || !input.contentId || !input.reasonCode) throw new Error('invalid_flag');
  const flagId = uuidv7();
  await query(env.DB_APP_FRESH, `INSERT INTO moderation.content_flags (id, reporter_id, content_type, content_id, reason_code) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [flagId, user.userId, input.contentType, input.contentId, input.reasonCode]);
  return privateResponse(request, env, { flagId }, { status: 201 });
}

async function createAppeal(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<{ caseId?: string }>(request, 16 * 1024);
  if (!input.caseId) throw new Error('case_id_required');
  const eligible = await query<{ id: string }>(env.DB_APP_FRESH,
    `SELECT c.id FROM moderation.cases c
      LEFT JOIN content.posts p ON c.content_type = 'post' AND p.id = c.content_id
      LEFT JOIN content.comments m ON c.content_type = 'comment' AND m.id = c.content_id
     WHERE c.id = $1 AND (p.author_id = $2 OR m.author_id = $2)`, [input.caseId, user.userId]);
  if (eligible.rowCount !== 1) throw new Error('appeal_not_allowed');
  const existing = await query<{ id: string }>(env.DB_APP_FRESH, `SELECT id FROM moderation.appeals WHERE case_id = $1 AND appellant_id = $2 AND state = 'open' LIMIT 1`, [input.caseId, user.userId]);
  if (existing.rows[0]) return privateResponse(request, env, { appealId: existing.rows[0].id, state: 'open' });
  const appealId = uuidv7();
  await transaction(env.DB_APP_FRESH, async (client) => {
    await client.query(`INSERT INTO moderation.appeals (id, case_id, appellant_id) VALUES ($1, $2, $3)`, [appealId, input.caseId, user.userId]);
    await client.query(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload) VALUES ($1, 'moderation.appeal.created', 'appeal', $2, $3, $4::jsonb)`, [uuidv7(), appealId, user.userId, JSON.stringify({ appealId, caseId: input.caseId })]);
  });
  return privateResponse(request, env, { appealId, state: 'open' }, { status: 201 });
}

async function getAppeal(request: Request, env: Env, user: Principal, appealId: string): Promise<Response> {
  const result = await query(env.DB_APP_FRESH,
    `SELECT a.id, a.case_id, a.state, a.created_at, a.resolved_at FROM moderation.appeals a WHERE a.id = $1 AND a.appellant_id = $2`, [appealId, user.userId]);
  if (!result.rows[0]) throw new Error('appeal_not_found');
  return privateResponse(request, env, { appeal: result.rows[0] });
}

async function createPrivacyRequest(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<{ requestType?: 'export' | 'delete' | 'rectify' }>(request, 8 * 1024);
  if (!input.requestType || !['export', 'delete', 'rectify'].includes(input.requestType)) throw new Error('invalid_privacy_request');
  const requestId = uuidv7();
  const acceptedAt = await transaction(env.DB_APP_FRESH, async (client) => {
    const created = await client.query<{ created_at: string }>(
      `INSERT INTO privacy.requests (id, subject_id, request_type)
       VALUES ($1, $2, $3)
       RETURNING created_at`,
      [requestId, user.userId, input.requestType],
    );
    await client.query(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload) VALUES ($1, 'privacy.request.created', 'privacy_request', $2, $3, $4::jsonb)`, [uuidv7(), requestId, user.userId, JSON.stringify({ requestType: input.requestType })]);
    return created.rows[0]?.created_at;
  });
  return privateResponse(request, env, {
    requestId,
    requestType: input.requestType,
    state: 'received',
    acceptedAt,
  }, { status: 202 });
}

async function getPrivacyRequestStatus(request: Request, env: Env, user: Principal): Promise<Response> {
  const url = new URL(request.url);
  const requestType = url.searchParams.get('requestType');
  if (requestType && !['export', 'delete', 'rectify'].includes(requestType)) throw new Error('invalid_privacy_request');
  const result = await query<{
    id: string;
    request_type: string;
    state: string;
    created_at: string;
    completed_at: string | null;
  }>(
    env.DB_APP_FRESH,
    `SELECT id, request_type, state, created_at, completed_at
       FROM privacy.requests
      WHERE subject_id = $1
        AND ($2::text IS NULL OR request_type = $2)
      ORDER BY created_at DESC
      LIMIT 1`,
    [user.userId, requestType],
  );
  const row = result.rows[0];
  return privateResponse(request, env, {
    request: row ? {
      requestId: row.id,
      requestType: row.request_type,
      state: row.state,
      acceptedAt: row.created_at,
      completedAt: row.completed_at,
    } : null,
  });
}

async function getStorage(request: Request, env: Env, user: Principal): Promise<Response> {
  const result = await query(env.DB_APP_FRESH, `SELECT bytes_reserved, bytes_uploaded, bytes_approved, bytes_rejected, bytes_exports, object_count, last_reconciled_at FROM media.storage_ledger WHERE user_id = $1`, [user.userId]);
  return privateResponse(request, env, { storage: result.rows[0] ?? { bytes_reserved: 0, bytes_uploaded: 0, bytes_approved: 0, bytes_rejected: 0, bytes_exports: 0, object_count: 0 } });
}

async function updateRegionPreferences(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<{ countryCode?: string | null; regionCode?: string | null; municipalityCode?: string | null; visibilityLevel?: 'private' | 'region' | 'country' }>(request, 8 * 1024);
  const code = (value: string | null | undefined, name: string): string | null => {
    if (value === null || value === undefined || value === '') return null;
    if (!/^[A-Za-z0-9-]{2,32}$/.test(value)) throw new Error(`invalid_${name}`);
    return value.toUpperCase();
  };
  const visibility = input.visibilityLevel ?? 'private';
  if (!['private', 'region', 'country'].includes(visibility)) throw new Error('invalid_visibility_level');
  await query(env.DB_APP_FRESH,
    `INSERT INTO identity.user_region_preferences (user_id, country_code, region_code, municipality_code, visibility_level)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET country_code = EXCLUDED.country_code, region_code = EXCLUDED.region_code,
       municipality_code = EXCLUDED.municipality_code, visibility_level = EXCLUDED.visibility_level, updated_at = now()`,
    [user.userId, code(input.countryCode, 'country_code'), code(input.regionCode, 'region_code'), code(input.municipalityCode, 'municipality_code'), visibility]);
  return privateResponse(request, env, { updated: true });
}

async function updateRetentionRule(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<{ contentType?: 'post' | 'posts' | 'media'; retentionDays?: number }>(request, 8 * 1024);
  const contentType = input.contentType === 'posts' ? 'post' : input.contentType;
  if (!contentType || !['post', 'media'].includes(contentType)) throw new Error('invalid_retention_content_type');
  if (!Number.isInteger(input.retentionDays) || (input.retentionDays ?? 0) < 30 || (input.retentionDays ?? 0) > 3650) {
    throw new Error('invalid_retention_period');
  }
  await query(env.DB_APP_FRESH,
    `SELECT privacy.set_retention_rule($1, $2, $3, make_interval(days => $4::integer), $5)`,
    [uuidv7(), user.userId, contentType, input.retentionDays, 'user-v1']);
  return privateResponse(request, env, { contentType, retentionDays: input.retentionDays });
}

async function getPersonalFeed(request: Request, env: Env, user: Principal): Promise<Response> {
  const result = await query(env.DB_APP_FRESH,
    `SELECT p.id, p.author_id, p.body, p.declared_creation_mode, p.visibility, p.moderation_state,
            p.geo_scope, p.place_id, p.published_at, p.created_at, i.source, i.explanation_basis
       FROM feed.user_inbox i
       JOIN content.posts p ON p.id = i.post_id
      WHERE i.user_id = $1 AND p.visibility IN ('public', 'followers') AND p.moderation_state = 'allowed'
        AND NOT EXISTS (SELECT 1 FROM social.blocks b WHERE b.blocker_id = $1 AND b.blocked_id = p.author_id)
        AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $1 AND m.muted_id = p.author_id)
      ORDER BY i.created_at DESC LIMIT 100`, [user.userId]);
  return privateResponse(request, env, { items: result.rows });
}

async function getPost(request: Request, env: Env, postId: string): Promise<Response> {
  const result = await query(env.DB_APP_FRESH, `SELECT id, author_id, body, declared_creation_mode, visibility, moderation_state, geo_scope, place_id, published_at, created_at FROM content.posts WHERE id = $1 AND visibility = 'public' AND moderation_state = 'allowed'`, [postId]);
  if (!result.rows[0]) throw new Error('post_not_found');
  const output = response(request, env, { post: result.rows[0] });
  output.headers.set('cache-control', 'public, max-age=15, s-maxage=15');
  return output;
}

async function getComments(request: Request, env: Env, postId: string): Promise<Response> {
  const result = await query(env.DB_APP_FRESH, `SELECT id, author_id, parent_id, body, moderation_state, created_at FROM content.comments WHERE post_id = $1 ORDER BY created_at ASC LIMIT 200`, [postId]);
  const output = response(request, env, { items: result.rows });
  output.headers.set('cache-control', 'public, max-age=10, s-maxage=10');
  return output;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = correlationId(request);
    try {
      assertExpectedHostname(request, env.EXPECTED_HOSTNAMES);
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') return response(request, env, null, { status: 204, headers: { 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode' } });
      if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) return response(request, env, { status: 'ok', service: 'lythaus-public-api', environment: env.ENVIRONMENT ?? 'unknown' });
      if (request.method === 'GET' && url.pathname === '/internal/readiness/database-identity') {
        if (!hasReadinessAuthorization(request, env)) return new Response(null, { status: 404 });
        const identity = await inspectDatabaseIdentity(env.DB_APP_FRESH, databaseExpectationsFromEnv(env));
        return privateResponse(request, env, {
          service: 'lythaus-public-api',
          ...databaseReadinessResponse(identity, env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true'),
        });
      }
      if (request.method === 'GET' && (url.pathname === '/ready' || url.pathname === '/api/ready')) {
        await query(env.DB_APP_FRESH, 'SELECT 1 AS ready');
        return response(request, env, { status: 'ready', service: 'lythaus-public-api' });
      }
      if (request.method === 'GET' && url.pathname === '/.well-known/jwks.json') return new Response(env.JWT_PUBLIC_JWKS ?? '{"keys":[]}', { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' } });
      if (request.method === 'GET' && url.pathname === '/api/feed/discover') {
        const result = await query(env.DB_APP_FRESH, `SELECT id, author_id, body, published_at FROM content.posts WHERE visibility = 'public' AND moderation_state = 'allowed' ORDER BY published_at DESC LIMIT 50`);
        const resultResponse = response(request, env, { items: result.rows });
        resultResponse.headers.set('cache-control', 'public, s-maxage=30, stale-while-revalidate=60');
        return resultResponse;
      }
      if (request.method === 'GET' && url.pathname === '/api/feed') return await getPersonalFeed(request, env, await principal(request, env));
      const post = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
      if (request.method === 'GET' && post) return await getPost(request, env, post[1]);
      const comments = url.pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
      if (request.method === 'GET' && comments) return await getComments(request, env, comments[1]);
      if (request.method === 'GET' && url.pathname === '/api/users/me') return await getUserProfile(request, env, (await principal(request, env)).userId, true);
      if ((request.method === 'PUT' || request.method === 'PATCH') && url.pathname === '/api/users/me') {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'profile.update', () => updateProfile(request, env, user));
      }
      const publicProfile = url.pathname.match(/^\/api\/users\/([^/]+)$/);
      if (request.method === 'GET' && publicProfile) return await getUserProfile(request, env, publicProfile[1]);
      if (request.method === 'POST' && (url.pathname === '/api/follows' || url.pathname === '/api/users/follow')) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'follow.create', () => createFollow(request, env, user));
      }
      if (request.method === 'DELETE' && url.pathname.match(/^\/api\/follows\/([^/]+)$/)) {
        const user = await principal(request, env);
        const followedId = url.pathname.match(/^\/api\/follows\/([^/]+)$/)?.[1] ?? '';
        return await idempotentMutation(request, env, user.userId, 'follow.delete', async () => {
          await query(env.DB_APP_FRESH, `DELETE FROM social.follows WHERE follower_id = $1 AND followed_id = $2`, [user.userId, followedId]);
          return privateResponse(request, env, { following: followedId, removed: true });
        });
      }
      if (request.method === 'POST' && (url.pathname === '/api/blocks' || url.pathname === '/api/users/block')) {
        const user = await principal(request, env);
        const input = await readJson<{ userId?: string }>(request, 8 * 1024);
        return await idempotentMutation(request, env, user.userId, 'block.create', () => setBlock(request, env, user, input.userId ?? '', true));
      }
      const block = url.pathname.match(/^\/api\/blocks\/([^/]+)$/);
      if (request.method === 'DELETE' && block) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'block.delete', () => setBlock(request, env, user, block[1], false));
      }
      if (request.method === 'POST' && (url.pathname === '/api/mutes' || url.pathname === '/api/users/mute')) {
        const user = await principal(request, env);
        const input = await readJson<{ userId?: string }>(request, 8 * 1024);
        return await idempotentMutation(request, env, user.userId, 'mute.create', () => setMute(request, env, user, input.userId ?? '', true));
      }
      const mute = url.pathname.match(/^\/api\/mutes\/([^/]+)$/);
      if (request.method === 'DELETE' && mute) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'mute.delete', () => setMute(request, env, user, mute[1], false));
      }
      if (request.method === 'POST' && url.pathname === '/api/bookmarks') {
        const user = await principal(request, env);
        const input = await readJson<{ postId?: string }>(request, 8 * 1024);
        return await idempotentMutation(request, env, user.userId, 'bookmark.create', () => setBookmark(request, env, user, input.postId ?? '', true));
      }
      const bookmark = url.pathname.match(/^\/api\/bookmarks\/([^/]+)$/);
      if (request.method === 'DELETE' && bookmark) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'bookmark.delete', () => setBookmark(request, env, user, bookmark[1], false));
      }
      const comment = url.pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
      if (request.method === 'POST' && comment) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'comment.create', () => createComment(request, env, user, comment[1]));
      }
      const reaction = url.pathname.match(/^\/api\/posts\/([^/]+)\/reactions$/);
      if (request.method === 'POST' && reaction) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'reaction.create', () => createReaction(request, env, user, reaction[1]));
      }
      if (request.method === 'POST' && (url.pathname === '/api/flags' || url.pathname === '/api/content/flags')) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'flag.create', () => createFlag(request, env, user));
      }
      if (request.method === 'POST' && url.pathname === '/api/appeals') {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'appeal.create', () => createAppeal(request, env, user));
      }
      const appeal = url.pathname.match(/^\/api\/appeals\/([^/]+)$/);
      if (request.method === 'GET' && appeal) return await getAppeal(request, env, await principal(request, env), appeal[1]);
      if (request.method === 'GET' && url.pathname === '/api/privacy/requests') {
        return await getPrivacyRequestStatus(request, env, await principal(request, env));
      }
      if (request.method === 'POST' && (url.pathname === '/api/privacy/requests' || url.pathname === '/api/privacy/request')) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'privacy.request.create', () => createPrivacyRequest(request, env, user));
      }
      if (request.method === 'GET' && (url.pathname === '/api/storage' || url.pathname === '/api/storage/usage')) return await getStorage(request, env, await principal(request, env));
      if (request.method === 'PUT' && (url.pathname === '/api/users/me/region' || url.pathname === '/api/privacy/region')) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'region.update', () => updateRegionPreferences(request, env, user));
      }
      if (request.method === 'PUT' && (url.pathname === '/api/users/me/retention' || url.pathname === '/api/privacy/retention')) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'retention.update', () => updateRetentionRule(request, env, user));
      }
      if (request.method === 'GET' && url.pathname === '/api/auth/userinfo') return await getUserInfo(request, env, (await principal(request, env)).userId);
      if (url.pathname === '/api/auth/email' || url.pathname === '/api/authEmail' || url.pathname.startsWith('/api/auth/email/verify') || url.pathname.startsWith('/api/auth/password/reset') || url.pathname === '/api/auth/password-reset') {
        if (env.EMAIL_PROVIDER_MODE === 'disabled') return response(request, env, { error: 'provider_unavailable', provider: 'email', correlationId: id }, { status: 404 });
      }
      if (request.method === 'POST' && (url.pathname === '/api/auth/email' || url.pathname === '/api/authEmail')) return await emailAuth(request, env);
      if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/api/auth/email/verify') return await verifyEmail(request, env);
      if (request.method === 'POST' && (url.pathname === '/api/auth/password/reset/request' || url.pathname === '/api/auth/password-reset')) return await requestPasswordReset(request, env);
      if (request.method === 'POST' && url.pathname === '/api/auth/password/reset/complete') return await completePasswordReset(request, env);
      if (request.method === 'POST' && url.pathname === '/api/auth/refresh') return await refreshSession(request, env);
      if (request.method === 'POST' && url.pathname === '/api/auth/logout') return await logout(request, env);
      if (request.method === 'GET' && (url.pathname === '/api/auth/authorize' || url.pathname === '/api/auth/google')) return await googleAuthStart(request, env);
      if (request.method === 'GET' && url.pathname === '/api/auth/google/callback') return await googleAuthCallback(request, env);
      if (request.method === 'POST' && url.pathname === '/api/auth/token') return await exchangeOAuthCode(request, env);
      if (request.method === 'POST' && url.pathname === '/api/posts') {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'post.create', () => createPost(request, env, user));
      }
      if (request.method === 'POST' && url.pathname === '/api/media/uploads' && env.MEDIA_UPLOADS_ENABLED !== 'true') return response(request, env, { error: 'feature_disabled', feature: 'media_uploads', correlationId: id }, { status: 404 });
      if (request.method === 'POST' && url.pathname === '/api/media/uploads') {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'media.upload.create', () => createUploadSession(request, env, user));
      }
      const finalise = url.pathname.match(/^\/api\/media\/uploads\/([^/]+)\/finalise$/);
      if (request.method === 'POST' && finalise && env.MEDIA_UPLOADS_ENABLED !== 'true') return response(request, env, { error: 'feature_disabled', feature: 'media_uploads', correlationId: id }, { status: 404 });
      if (request.method === 'POST' && finalise) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'media.upload.finalise', () => finaliseUpload(request, env, user, finalise[1]));
      }
      if (url.pathname === '/api/auth/apple' || url.pathname === '/api/auth/world-id' || url.pathname === '/api/auth/world') {
        return response(request, env, { error: 'provider_unavailable', provider: url.pathname.includes('apple') ? 'apple' : 'world_id', correlationId: id }, { status: 404 });
      }
      if (url.pathname.startsWith('/api/video') || url.pathname.startsWith('/api/payments') || url.pathname.startsWith('/api/federation')) {
        return response(request, env, { error: 'feature_disabled', correlationId: id }, { status: 404 });
      }
      return response(request, env, { error: 'not_found', correlationId: id }, { status: 404 });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'request_failed';
      const status = code === 'authentication_required' ? 401 : code === 'not_found' ? 404 : code.endsWith('_unavailable') || code.endsWith('_not_configured') ? 503 : 400;
      logEvent({ service: 'lythaus-public-api', correlationId: id, errorCode: code, route: new URL(request.url).pathname });
      return response(request, env, { error: code, correlationId: id }, { status });
    }
  },
};
