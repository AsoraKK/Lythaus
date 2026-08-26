import { databaseExpectationsFromEnv, databaseReadinessResponse, inspectDatabaseIdentity, listUserActivity, recordUserActivity, transaction, query, type DatabaseClient, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { APPEAL_POLICY, PLATFORM_SAFETY_LIMITS, REPUTATION_POLICY, REWARD_ACCESS_POLICY, REWARD_CATALOG, normalizeUserTier, type ActivityCategory, type ActivityEventType, type CreatePostInput, type EmailDeliveryReference, type ReputationEffect, type TransactionalEmailProvider, type UserTier } from '@lythaus/contracts';
import { createPresignedPutUrl, ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, type AllowedImageType } from '@lythaus/media';
import { assertExpectedHostname, correlationId, json, logEvent } from '@lythaus/observability';
import { constantTimeEqual, decryptField, encryptField, hashPassword, hashResetToken, hmacLookup, needsPasswordRehash, randomToken, signAccessToken, uuidv7, verifyAccessToken, verifyPassword, type PasswordHash, type Principal } from '@lythaus/security';
import { classifyPublicError, idempotencyKey, isCurrentActivePrincipal, normalizeEmailAddress, planEmailRegistration, planExistingIdempotencyRecord, prepareEmailAuthAttempt, rateLimitPlan, requireAuthSecrets, requireRefreshToken, requireResetPassword, requireToken, requiresTurnstileVerification } from './auth-runtime-policy.ts';
import { runClaimedIdempotentWork } from './idempotency-runtime.ts';
import { issueAuthSession, revokeAllAuthSessions, rotateAuthSession } from './auth-session-runtime.ts';
import { assertDistinctReactionAuthor, contentDeletionPlan, planCommentCreation, planCommentRevision, planPostPublication, planPostRevision, planReactionChange, planRelationshipMutation, replyDepth } from './content-runtime-policy.ts';
import { assertCommentFeedItemEligibility, assertCustomFeedAvailable, assertFeedItemEligibility, assertNewsBoardItemEligibility, commentPublicLabel, entitlementsForTier, feedResponsePlan, requireNewsBoardAccess, type FeedSurface } from './feed-runtime-policy.ts';
import { optionalPrivacyRequestType, privacyExportAccessActivity, privacyRequestPlan, requirePrivacyExportDependencies, requirePrivacyExportObject, retentionRulePlan } from './privacy-runtime-policy.ts';
import { normalizeNotificationDevice, normalizeNotificationPreferences } from './notification-policy.ts';
import { encodeCursor, enforceContentDeclaration, normalizeCustomFeedRules, pageRequest, reputationBand } from './product-policy.ts';
import { readBoundedJson } from './request-body-runtime.ts';
import { createWaitlistRouteHandler } from './waitlist-handler.ts';
import { parseWaitlistRequest, requireWaitlistSecrets, verifyWaitlistTurnstile } from './waitlist-runtime-policy.ts';

interface Env extends EnvBindings {
  WORKER_VERSION: NonNullable<EnvBindings['WORKER_VERSION']>;
  DB_APP_FRESH: HyperdriveBinding;
  MEDIA_QUARANTINE: NonNullable<EnvBindings['MEDIA_QUARANTINE']>;
  PRIVATE_EXPORTS: NonNullable<EnvBindings['PRIVATE_EXPORTS']>;
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

interface ActivityDescriptor {
  eventType: ActivityEventType;
  category: ActivityCategory;
  title: string;
  explanation: string;
  result?: 'succeeded' | 'failed' | 'withheld' | 'reversed' | 'pending';
  reasonCode?: string;
  policyVersion?: string;
  objectType?: string;
  objectId?: string;
  reputationEffect?: ReputationEffect;
  appealable?: boolean;
  retentionClass?: 'ordinary' | 'security' | 'moderation';
  metadata?: Record<string, unknown>;
}

async function writeActivity(
  client: DatabaseClient,
  request: Request,
  user: Pick<Principal, 'userId'>,
  sourceEventId: string,
  descriptor: ActivityDescriptor,
  source: 'public_api' | 'system' = 'public_api',
): Promise<void> {
  await recordUserActivity(client, {
    id: uuidv7(),
    userId: user.userId,
    actorUserId: user.userId,
    eventType: descriptor.eventType,
    category: descriptor.category,
    source,
    sourceEventId,
    correlationId: correlationId(request),
    title: descriptor.title,
    explanation: descriptor.explanation,
    result: descriptor.result ?? 'succeeded',
    reasonCode: descriptor.reasonCode,
    policyVersion: descriptor.policyVersion,
    objectType: descriptor.objectType,
    objectId: descriptor.objectId,
    reputationEffect: descriptor.reputationEffect ?? 'none',
    appealable: descriptor.appealable ?? false,
    retentionClass: descriptor.retentionClass ?? 'ordinary',
    metadata: descriptor.metadata,
    createdAt: new Date().toISOString(),
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function enforceRateLimit(request: Request, env: Env, scope: string, limit: number): Promise<void> {
  const subject = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('authorization')
    ?? 'anonymous';
  const subjectHash = await sha256Hex(`${scope}:${subject}`);
  const windowStartedAt = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const result = await query(env.DB_APP_FRESH,
    `INSERT INTO system.rate_limit_windows (scope, subject_hash, window_started_at, request_count, expires_at)
     VALUES ($1, $2, $3, 1, $3::timestamptz + interval '2 minutes')
     ON CONFLICT (scope, subject_hash, window_started_at)
     DO UPDATE SET request_count = system.rate_limit_windows.request_count + 1
     WHERE system.rate_limit_windows.request_count < $4
     RETURNING request_count`,
    [scope, subjectHash, windowStartedAt, limit]);
  if (result.rowCount !== 1) throw new Error('rate_limit_exceeded');
}

async function tierForUser(env: Env, userId: string): Promise<UserTier> {
  const result = await query<{ subscription_tier: string }>(env.DB_APP_FRESH,
    `SELECT subscription_tier FROM identity.user_entitlements WHERE user_id = $1`, [userId]);
  return normalizeUserTier(result.rows[0]?.subscription_tier);
}

async function enforceDailyAction(
  env: Env,
  userId: string,
  action: 'post' | 'comment' | 'reaction' | 'appeal' | 'flag' | 'media',
): Promise<void> {
  const limits = {
    post: PLATFORM_SAFETY_LIMITS.dailyPosts,
    comment: PLATFORM_SAFETY_LIMITS.dailyComments,
    reaction: PLATFORM_SAFETY_LIMITS.dailyReactions,
    appeal: PLATFORM_SAFETY_LIMITS.dailyAppeals,
    flag: PLATFORM_SAFETY_LIMITS.dailyFlags,
    media: PLATFORM_SAFETY_LIMITS.dailyMediaUploads,
  } as const;
  const scope = `daily-action:${action}`;
  const subjectHash = await sha256Hex(`${scope}:${userId}`);
  const result = await query(env.DB_APP_FRESH,
    `INSERT INTO system.rate_limit_windows (scope, subject_hash, window_started_at, request_count, expires_at)
     VALUES ($1, $2, date_trunc('day', now()), 1, date_trunc('day', now()) + interval '2 days')
     ON CONFLICT (scope, subject_hash, window_started_at)
     DO UPDATE SET request_count = system.rate_limit_windows.request_count + 1
     WHERE system.rate_limit_windows.request_count < $3
     RETURNING request_count`, [scope, subjectHash, limits[action]]);
  if (result.rowCount !== 1) throw new Error(`${action}_daily_limit_reached`);
}

async function enforceRelationshipChangeLimit(
  client: DatabaseClient,
  userId: string,
  targetUserId: string,
): Promise<void> {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM trust.user_activity_events
      WHERE user_id = $1
        AND object_type = 'user'
        AND object_id = $2
        AND event_type IN ('social.follow_created', 'social.follow_removed')
        AND created_at >= date_trunc('day', now())`,
    [userId, targetUserId],
  );
  if (Number(result.rows[0]?.count ?? 0) >= PLATFORM_SAFETY_LIMITS.maxFollowStateChangesPerRelationshipPerDay) {
    throw new Error('relationship_change_limit_reached');
  }
}

function hashConfiguredPassword(env: Env, password: string, pepper: string): PasswordHash {
  return hashPassword(password, pepper, {
    fallbackToScrypt: env.PASSWORD_HASH_ALLOW_SCRYPT_FALLBACK === 'true',
    pepperVersion: 'v1',
  });
}

async function verifyTurnstile(env: Env, token: unknown): Promise<void> {
  if (!requiresTurnstileVerification(env.TURNSTILE_REQUIRED, env.TURNSTILE_SECRET_KEY, token)) return;
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
  });
  if (!response.ok) throw new Error('turnstile_unavailable');
  const result = await response.json() as { success?: boolean };
  if (result.success !== true) throw new Error('turnstile_failed');
}

async function issueSession(
  env: Env,
  userId: string,
  roles: string[] = [],
  onSessionCreated?: (client: DatabaseClient) => Promise<void>,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const secrets = requireAuthSecrets(env);
  return issueAuthSession({
    loadAccount: async (subjectId) => {
      const account = await query<{ status: string; token_version: number }>(env.DB_APP_FRESH,
        `SELECT status, token_version FROM identity.users WHERE id = $1`, [subjectId]);
      const row = account.rows[0];
      return row ? { status: row.status, tokenVersion: Number(row.token_version) } : undefined;
    },
    createRefreshFamilyAndSession: async (input) => transaction(env.DB_APP_FRESH, async (client) => {
      await client.query(`INSERT INTO identity.refresh_token_families (id, user_id) VALUES ($1, $2)`, [input.familyId, input.userId]);
      await client.query(`INSERT INTO identity.auth_sessions (id, user_id, refresh_family_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3, decode($4, 'base64'), now() + ($5::integer * interval '1 day'))`, [input.sessionId, input.userId, input.familyId, input.refreshTokenHash, input.refreshSessionDays]);
      if (onSessionCreated) await onSessionCreated(client);
    }),
    randomToken,
    hashRefreshToken: hashResetToken,
    newId: uuidv7,
    signAccessToken: ({ userId: subjectId, roles: subjectRoles, tokenVersion }) => signAccessToken({ userId: subjectId, roles: [...subjectRoles], tokenVersion, privateKeyPem: secrets.privateKey, keyId: secrets.keyId }),
  }, { userId, roles });
}

async function sendEmailTransport(env: Env, input: { to: string; subject: string; html: string; text: string }): Promise<EmailDeliveryReference> {
  const providerMode = env.EMAIL_PROVIDER_MODE ?? (env.ENVIRONMENT === 'production' ? 'cloudflare' : 'fallback');
  if (providerMode === 'disabled') throw new Error('provider_unavailable');
  if (providerMode === 'cloudflare') {
    if (!env.EMAIL || !env.EMAIL_FROM) throw new Error('email_delivery_not_configured');
    try {
      const delivery = await env.EMAIL.send({
        to: input.to,
        from: { email: env.EMAIL_FROM, name: 'Lythaus' },
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      return { provider: 'cloudflare-email', messageId: delivery.messageId, acceptedAt: new Date().toISOString() };
    } catch {
      throw new Error('email_delivery_failed');
    }
  }
  if (providerMode !== 'fallback') throw new Error('email_provider_mode_invalid');
  if (!env.EMAIL_PROVIDER_URL || !env.EMAIL_PROVIDER_TOKEN || !env.EMAIL_FROM) throw new Error('email_delivery_not_configured');
  const response = await fetch(env.EMAIL_PROVIDER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.EMAIL_PROVIDER_TOKEN}` },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: input.to, subject: input.subject, html: input.html, text: input.text }),
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
      const url = env.EMAIL_VERIFICATION_BASE_URL ? `${env.EMAIL_VERIFICATION_BASE_URL}${encodeURIComponent(input.token)}` : '';
      return sendEmailTransport(env, { to: input.to, subject, html: `<p>${subject}.</p>${link(env.EMAIL_VERIFICATION_BASE_URL, input.token)}`, text: `${subject}.${url ? ` ${url}` : ''}` });
    },
    async sendPasswordReset(input) {
      const subject = 'Reset your Lythaus password';
      const url = env.EMAIL_PASSWORD_RESET_BASE_URL ? `${env.EMAIL_PASSWORD_RESET_BASE_URL}${encodeURIComponent(input.token)}` : '';
      return sendEmailTransport(env, { to: input.to, subject, html: `<p>${subject}.</p>${link(env.EMAIL_PASSWORD_RESET_BASE_URL, input.token)}`, text: `${subject}.${url ? ` ${url}` : ''}` });
    },
    async sendSecurityNotice(input) {
      const subject = 'Lythaus security notice';
      return sendEmailTransport(env, { to: input.to, subject, html: `<p>${subject}.</p><p>${input.reason.replace(/[&<>"']/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value] ?? value))}</p>`, text: `${subject}. ${input.reason}` });
    },
    async sendEmailChangeNotice(input) {
      const subject = 'Confirm your Lythaus email change';
      const url = env.EMAIL_VERIFICATION_BASE_URL ? `${env.EMAIL_VERIFICATION_BASE_URL}${encodeURIComponent(input.token)}` : '';
      return sendEmailTransport(env, { to: input.to, subject, html: `<p>${subject}.</p>${link(env.EMAIL_VERIFICATION_BASE_URL, input.token)}`, text: `${subject}.${url ? ` ${url}` : ''}` });
    },
    async sendAccountDeletionNotice(input) {
      const subject = 'Lythaus account deletion requested';
      return sendEmailTransport(env, { to: input.to, subject, html: `<p>${subject}.</p><p>Request reference: ${input.requestId}</p>`, text: `${subject}. Request reference: ${input.requestId}` });
    },
  };
}

async function deliverAuthEmail(env: Env, input: { type: 'verification' | 'password_reset' | 'security'; to: string; token?: string; reason?: string }): Promise<EmailDeliveryReference> {
  const provider = createTransactionalEmailProvider(env);
  if (input.type === 'verification' && input.token) return provider.sendVerification({ to: input.to, token: input.token });
  if (input.type === 'password_reset' && input.token) return provider.sendPasswordReset({ to: input.to, token: input.token });
  return provider.sendSecurityNotice({ to: input.to, reason: input.reason ?? 'Account security event' });
}

async function sendAccountVerificationEmail(request: Request, env: Env, userId: string, email: string): Promise<void> {
  const verificationToken = randomToken(32);
  const sourceEventId = uuidv7();
  await transaction(env.DB_APP_FRESH, async (client) => {
    await client.query(
      `INSERT INTO identity.email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, decode($3, 'base64'), now() + interval '30 minutes')`,
      [uuidv7(), userId, hashResetToken(verificationToken)]);
    await writeActivity(client, request, { userId }, sourceEventId, {
      eventType: 'account.email_verification_requested', category: 'account',
      title: 'You requested another verification email',
      explanation: 'A new time-limited verification message was requested. The token is not stored in this log.',
      objectType: 'account', objectId: userId, retentionClass: 'security',
      metadata: { authenticationMethod: 'email' },
    });
  });
  await deliverAuthEmail(env, { type: 'verification', to: email, token: verificationToken });
}

async function emailAuth(request: Request, env: Env): Promise<Response> {
  const input = await readJson<EmailAuthInput>(request, 16 * 1024);
  const attempt = prepareEmailAuthAttempt(input);
  const { email, password, mode } = attempt;
  if (mode === 'register') await verifyTurnstile(env, attempt.turnstileToken);
  const secrets = requireAuthSecrets(env);
  const lookup = hmacLookup(email, secrets.hmacKey);
  const existing = await query<{ id: string; status: string; password_hash: PasswordHash; verified_at: string | null }>(env.DB_APP_FRESH,
    `SELECT u.id, u.status, c.password_hash, c.verified_at
       FROM identity.email_credentials c JOIN identity.users u ON u.id = c.user_id
      WHERE c.email_lookup_hmac = decode($1, 'base64')`, [lookup]);
  const account = existing.rows[0];
  const contactOwner = account ? undefined : (await query<{ id: string; status: string }>(env.DB_APP_FRESH,
    `SELECT u.id, u.status
       FROM identity.contact_emails c JOIN identity.users u ON u.id = c.user_id
      WHERE c.email_lookup_hmac = decode($1, 'base64')`, [lookup])).rows[0];
  if (mode === 'resend_verification') {
    if (!account || account.verified_at) return privateResponse(request, env, { state: 'verification_required' }, { status: 202 });
    await sendAccountVerificationEmail(request, env, account.id, email);
    return privateResponse(request, env, { state: 'verification_required' }, { status: 202 });
  }
  if (mode === 'register') {
    const registrationPlan = planEmailRegistration(
      account ? { verifiedAt: account.verified_at } : undefined,
      contactOwner ? { status: contactOwner.status } : undefined,
    );
    if (registrationPlan === 'resend_verification') {
      if (!account) throw new Error('account_unavailable');
      await sendAccountVerificationEmail(request, env, account.id, email);
      return privateResponse(request, env, { state: 'verification_required' }, { status: 202 });
    }
    if (registrationPlan === 'account_exists') throw new Error('account_exists');
    const encrypted = await encryptField(email, secrets.encryptionKey, 'v1');
    const passwordHash = hashConfiguredPassword(env, password, secrets.pepper);
    const verificationToken = randomToken(32);
    const sourceEventId = uuidv7();
    if (registrationPlan === 'attach_email_credential') {
      if (!contactOwner) throw new Error('account_unavailable');
      await transaction(env.DB_APP_FRESH, async (client) => {
        await client.query(
          `INSERT INTO identity.email_credentials (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, hmac_key_version, password_hash)
           VALUES ($1, convert_to($2, 'utf8'), decode($3, 'base64'), 'v1', 'v1', $4::jsonb)`,
          [contactOwner.id, encrypted.ciphertext, lookup, JSON.stringify(passwordHash)]);
        await client.query(
          `INSERT INTO identity.email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, decode($3, 'base64'), now() + interval '30 minutes')`,
          [uuidv7(), contactOwner.id, hashResetToken(verificationToken)]);
        await client.query(
          `INSERT INTO identity.account_events (id, user_id, event_type, metadata) VALUES ($1, $2, 'email_relink_started', '{"source":"contact_email"}'::jsonb)`,
          [uuidv7(), contactOwner.id]);
        await writeActivity(client, request, { userId: contactOwner.id }, sourceEventId, {
          eventType: 'account.email_verification_requested', category: 'account',
          title: 'You started email account recovery',
          explanation: 'A password credential was attached to your preserved account and awaits email verification.',
          result: 'pending', objectType: 'account', objectId: contactOwner.id, retentionClass: 'security',
          metadata: { authenticationMethod: 'email', recoveryMethod: 'verified_contact_email' },
        });
      });
      await deliverAuthEmail(env, { type: 'verification', to: email, token: verificationToken });
      return privateResponse(request, env, { state: 'verification_required' }, { status: 202 });
    }
    const userId = uuidv7();
    await transaction(env.DB_APP_FRESH, async (client) => {
      await client.query(`INSERT INTO identity.users (id) VALUES ($1)`, [userId]);
      await client.query(`INSERT INTO identity.email_credentials (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, hmac_key_version, password_hash) VALUES ($1, convert_to($2, 'utf8'), decode($3, 'base64'), 'v1', 'v1', $4::jsonb)`, [userId, encrypted.ciphertext, lookup, JSON.stringify(passwordHash)]);
      await client.query(`INSERT INTO identity.contact_emails (user_id, email_ciphertext, email_lookup_hmac, encryption_key_version, source_provider) VALUES ($1, convert_to($2, 'utf8'), decode($3, 'base64'), 'v1', 'email')`, [userId, encrypted.ciphertext, lookup]);
      await client.query(`INSERT INTO identity.email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, decode($3, 'base64'), now() + interval '30 minutes')`, [uuidv7(), userId, hashResetToken(verificationToken)]);
      await client.query(`INSERT INTO identity.account_events (id, user_id, event_type, metadata) VALUES ($1, $2, 'email_registration_started', '{}'::jsonb)`, [uuidv7(), userId]);
      await writeActivity(client, request, { userId }, sourceEventId, {
        eventType: 'account.registered', category: 'account', title: 'You registered an account',
        explanation: 'Your email account was created and awaits verification.', result: 'pending',
        objectType: 'account', objectId: userId, retentionClass: 'security',
        metadata: { authenticationMethod: 'email' },
      });
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
  const sourceEventId = uuidv7();
  const tokens = await issueSession(env, account.id, [], async (client) => {
    await client.query(
      `INSERT INTO identity.account_events (id, user_id, event_type, metadata) VALUES ($1, $2, 'email_login', '{}'::jsonb)`,
      [uuidv7(), account.id]);
    await writeActivity(client, request, { userId: account.id }, sourceEventId, {
      eventType: 'account.login_succeeded', category: 'account', title: 'You signed in',
      explanation: 'A successful email sign-in was recorded.', objectType: 'account', objectId: account.id,
      retentionClass: 'security', metadata: { authenticationMethod: 'email' },
    });
  });
  return privateResponse(request, env, { ...tokens, tokenType: 'Bearer' });
}

async function verifyEmail(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = requireToken(url.searchParams.get('token') ?? (await readJson<{ token?: string }>(request, 8 * 1024)).token, 'verification_token_invalid');
  const sourceEventId = uuidv7();
  await transaction(env.DB_APP_FRESH, async (client) => {
    const found = await client.query<{ user_id: string }>(`SELECT user_id FROM identity.email_verification_tokens WHERE token_hash = decode($1, 'base64') AND consumed_at IS NULL AND expires_at > now()`, [hashResetToken(token)]);
    if (!found.rows[0]) throw new Error('verification_token_invalid');
    await client.query(`UPDATE identity.email_verification_tokens SET consumed_at = now() WHERE token_hash = decode($1, 'base64') AND consumed_at IS NULL`, [hashResetToken(token)]);
    await client.query(`UPDATE identity.email_credentials SET verified_at = COALESCE(verified_at, now()), updated_at = now() WHERE user_id = $1`, [found.rows[0].user_id]);
    await client.query(`UPDATE identity.contact_emails SET verified_at = COALESCE(verified_at, now()), updated_at = now() WHERE user_id = $1`, [found.rows[0].user_id]);
    await client.query(`UPDATE identity.users SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'relink_required'`, [found.rows[0].user_id]);
    await client.query(`INSERT INTO identity.account_events (id, user_id, event_type, metadata) VALUES ($1, $2, 'email_verified', '{}'::jsonb)`, [uuidv7(), found.rows[0].user_id]);
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'identity.email.verified', 'user', $2, $2, $3::jsonb)`,
      [sourceEventId, found.rows[0].user_id, JSON.stringify({ userId: found.rows[0].user_id })],
    );
    await writeActivity(client, request, { userId: found.rows[0].user_id }, sourceEventId, {
      eventType: 'account.email_verified', category: 'account', title: 'You verified your email',
      explanation: 'Your registered email was verified. The email address is not copied into this log.',
      objectType: 'account', objectId: found.rows[0].user_id, retentionClass: 'security',
      metadata: { authenticationMethod: 'email' },
    });
  });
  return privateResponse(request, env, { state: 'verified' });
}

async function refreshSession(request: Request, env: Env): Promise<Response> {
  const input = await readJson<{ refreshToken?: string; refresh_token?: string }>(request, 16 * 1024);
  const refreshToken = requireRefreshToken(input);
  const secrets = requireAuthSecrets(env);
  const sourceEventId = uuidv7();
  const tokens = await rotateAuthSession({
    findRefreshSession: async (tokenHash) => {
      const current = await query<{ session_id: string; user_id: string; family_id: string; status: string; token_state: 'active' | 'revoked' | 'expired' | 'family_revoked' }>(env.DB_APP_FRESH,
        `SELECT s.id AS session_id, s.user_id, s.refresh_family_id AS family_id, u.status,
                CASE
                  WHEN s.revoked_at IS NOT NULL THEN 'revoked'
                  WHEN s.expires_at <= now() THEN 'expired'
                  WHEN f.revoked_at IS NOT NULL THEN 'family_revoked'
                  ELSE 'active'
                END AS token_state
           FROM identity.auth_sessions s JOIN identity.refresh_token_families f ON f.id = s.refresh_family_id
           JOIN identity.users u ON u.id = s.user_id
          WHERE s.refresh_token_hash = decode($1, 'base64')`, [tokenHash]);
      const session = current.rows[0];
      return session ? { sessionId: session.session_id, userId: session.user_id, familyId: session.family_id, status: session.status, tokenState: session.token_state } : undefined;
    },
    rotatePresentedSession: async (rotation) => transaction(env.DB_APP_FRESH, async (client) => {
      const revoked = await client.query(`UPDATE identity.auth_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [rotation.sessionId]);
      if (revoked.rowCount !== 1) return false;
      await client.query(`UPDATE identity.refresh_token_families SET last_used_at = now() WHERE id = $1`, [rotation.familyId]);
      await client.query(`INSERT INTO identity.auth_sessions (id, user_id, refresh_family_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3, decode($4, 'base64'), now() + ($5::integer * interval '1 day'))`, [rotation.replacementSessionId, rotation.userId, rotation.familyId, rotation.replacementTokenHash, rotation.refreshSessionDays]);
      await writeActivity(client, request, { userId: rotation.userId }, sourceEventId, {
        eventType: 'account.session_refreshed', category: 'account', title: 'Your session was refreshed',
        explanation: 'A valid session was rotated and the previous refresh token was revoked.',
        objectType: 'account', objectId: rotation.userId, retentionClass: 'security',
        metadata: { sessionAction: 'refresh' },
      });
      return true;
    }),
    revokeRefreshFamily: async (familyId) => {
      await query(env.DB_APP_FRESH, `UPDATE identity.refresh_token_families SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [familyId]);
    },
    loadActiveTokenVersion: async (subjectId: string) => {
      const tokenVersion = await query<{ token_version: number }>(env.DB_APP_FRESH,
        `SELECT token_version FROM identity.users WHERE id = $1 AND status = 'active'`, [subjectId]);
      return tokenVersion.rows[0]?.token_version;
    },
    randomToken,
    hashRefreshToken: hashResetToken,
    newId: uuidv7,
    signAccessToken: ({ userId: subjectId, roles, tokenVersion }) => signAccessToken({ userId: subjectId, roles: [...roles], tokenVersion, privateKeyPem: secrets.privateKey, keyId: secrets.keyId }),
  }, refreshToken);
  return privateResponse(request, env, { ...tokens, tokenType: 'Bearer' });
}

async function logout(request: Request, env: Env): Promise<Response> {
  const user = await principal(request, env);
  const sourceEventId = uuidv7();
  await transaction(env.DB_APP_FRESH, async (client) => {
    await revokeAllAuthSessions({
      revokeAllSessions: async (subjectId) => { await client.query(`UPDATE identity.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [subjectId]); },
      revokeAllRefreshFamilies: async (subjectId) => { await client.query(`UPDATE identity.refresh_token_families SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [subjectId]); },
      bumpTokenVersion: async (subjectId) => { await client.query(`UPDATE identity.users SET token_version = token_version + 1, updated_at = now() WHERE id = $1`, [subjectId]); },
    }, user.userId);
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'account.logout_succeeded', category: 'account', title: 'You signed out',
      explanation: 'Your active sessions were revoked.', objectType: 'account', objectId: user.userId,
      retentionClass: 'security', metadata: { sessionAction: 'revoke_all' },
    });
  });
  return privateResponse(request, env, { loggedOut: true });
}

async function requestPasswordReset(request: Request, env: Env): Promise<Response> {
  const input = await readJson<{ email?: string; turnstileToken?: string }>(request, 8 * 1024);
  await verifyTurnstile(env, input.turnstileToken);
  const email = normalizeEmailAddress(input.email);
  if (!env.PII_HMAC_KEY_V1) throw new Error('authentication_not_configured');
  const lookup = hmacLookup(email, env.PII_HMAC_KEY_V1);
  const account = await query<{ id: string }>(env.DB_APP_FRESH,
    `SELECT u.id FROM identity.email_credentials c JOIN identity.users u ON u.id = c.user_id
      WHERE c.email_lookup_hmac = decode($1, 'base64') AND u.status = 'active'`, [lookup]);
  if (account.rows[0]) {
    const token = randomToken(32);
    const sourceEventId = uuidv7();
    await transaction(env.DB_APP_FRESH, async (client) => {
      await client.query(
        `INSERT INTO identity.password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, decode($3, 'base64'), now() + interval '30 minutes')`,
        [uuidv7(), account.rows[0].id, hashResetToken(token)]);
      await writeActivity(client, request, { userId: account.rows[0].id }, sourceEventId, {
        eventType: 'account.password_reset_requested', category: 'account', title: 'A password reset was requested',
        explanation: 'A time-limited reset message was issued. No password or reset token is stored in this log.',
        objectType: 'account', objectId: account.rows[0].id, retentionClass: 'security',
        metadata: { authenticationMethod: 'email' },
      });
    });
    await deliverAuthEmail(env, { type: 'password_reset', to: email, token });
  }
  return response(request, env, { state: 'reset_if_eligible' }, { status: 202 });
}

async function completePasswordReset(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const input = await readJson<{ token?: string; password?: string }>(request, 16 * 1024);
  const token = requireToken(url.searchParams.get('token') ?? input.token, 'reset_token_invalid');
  const password = requireResetPassword(input.password);
  const secrets = requireAuthSecrets(env);
  const passwordHash = hashConfiguredPassword(env, password, secrets.pepper);
  const sourceEventId = uuidv7();
  await transaction(env.DB_APP_FRESH, async (client) => {
    const found = await client.query<{ user_id: string }>(`SELECT user_id FROM identity.password_reset_tokens WHERE token_hash = decode($1, 'base64') AND consumed_at IS NULL AND expires_at > now()`, [hashResetToken(token)]);
    if (!found.rows[0]) throw new Error('reset_token_invalid');
    await client.query(`UPDATE identity.password_reset_tokens SET consumed_at = now() WHERE token_hash = decode($1, 'base64') AND consumed_at IS NULL`, [hashResetToken(token)]);
    await client.query(`UPDATE identity.email_credentials SET password_hash = $1::jsonb, updated_at = now() WHERE user_id = $2`, [JSON.stringify(passwordHash), found.rows[0].user_id]);
    await revokeAllAuthSessions({
      revokeAllSessions: async (subjectId) => { await client.query(`UPDATE identity.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [subjectId]); },
      revokeAllRefreshFamilies: async (subjectId) => { await client.query(`UPDATE identity.refresh_token_families SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [subjectId]); },
      bumpTokenVersion: async (subjectId) => { await client.query(`UPDATE identity.users SET token_version = token_version + 1, updated_at = now() WHERE id = $1`, [subjectId]); },
    }, found.rows[0].user_id);
    await client.query(`INSERT INTO identity.account_events (id, user_id, event_type, metadata) VALUES ($1, $2, 'password_reset_completed', '{}'::jsonb)`, [uuidv7(), found.rows[0].user_id]);
    await writeActivity(client, request, { userId: found.rows[0].user_id }, sourceEventId, {
      eventType: 'account.password_reset', category: 'account', title: 'You reset your password',
      explanation: 'Your password changed and existing sessions were revoked. No credential is stored in this log.',
      objectType: 'account', objectId: found.rows[0].user_id, retentionClass: 'security',
      metadata: { authenticationMethod: 'email', sessionAction: 'revoke_all' },
    });
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
  let subject: Principal;
  try {
    subject = await verifyAccessToken(token, env.JWT_PUBLIC_JWKS);
  } catch {
    throw new Error('authentication_required');
  }
  const account = await query<{ status: string; token_version: number }>(env.DB_APP_FRESH,
    `SELECT status, token_version FROM identity.users WHERE id = $1`, [subject.userId]);
  if (!isCurrentActivePrincipal(account.rows[0], subject.tokenVersion)) {
    throw new Error('authentication_required');
  }
  return subject;
}

async function readJson<T>(request: Request, maxBytes: number): Promise<T> {
  return readBoundedJson<T>(request, maxBytes);
}

const waitlistRoute = createWaitlistRouteHandler({
  query,
  parseRequest: parseWaitlistRequest,
  requireSecrets: requireWaitlistSecrets,
  verifyTurnstile: verifyWaitlistTurnstile,
  hmacLookup,
  encryptField,
  uuidv7,
  logEvent,
  correlationId,
  classifyPublicError,
  json,
  now: Date.now,
});

function feedResponse(request: Request, env: Env, body: unknown, surface: FeedSurface, hasViewer: boolean): Response {
  const plan = feedResponsePlan(surface, hasViewer);
  const result = plan.privateResponse ? privateResponse(request, env, body) : response(request, env, body);
  result.headers.set('cache-control', plan.cacheControl);
  return result;
}

interface FeedResponseCandidate {
  authorId: string;
  visibility: string;
  moderationState: string;
  publicLabel: string;
  feedItemDeleted: boolean;
  feedBlocked: boolean;
  feedMuted: boolean;
  feedFollowsAuthor: boolean;
}

function assertFeedResponseCandidates(items: readonly FeedResponseCandidate[], viewer?: Principal): void {
  for (const item of items) {
    assertFeedItemEligibility({
      authorId: item.authorId,
      visibility: item.visibility,
      moderationState: item.moderationState,
      publicLabel: item.publicLabel,
      deleted: item.feedItemDeleted,
      viewer: viewer ? {
        userId: viewer.userId,
        followsAuthor: item.feedFollowsAuthor,
        blocked: item.feedBlocked,
        muted: item.feedMuted,
      } : undefined,
    });
  }
}

function presentFeedItems<T extends FeedResponseCandidate>(items: readonly T[]): Array<Omit<T, keyof FeedResponseCandidate>> {
  return items.map(({ feedItemDeleted: _deleted, feedBlocked: _blocked, feedMuted: _muted, feedFollowsAuthor: _follows, ...item }) => item) as Array<Omit<T, keyof FeedResponseCandidate>>;
}

interface CommentFeedResponseCandidate {
  publicLabel: unknown;
  feedPostVisibility: string;
  feedPostModerationState: string;
  feedPostDeleted: boolean;
  feedViewerIsPostAuthor: boolean;
  feedFollowsPostAuthor: boolean;
  feedBlockedCommentAuthor: boolean;
  feedMutedCommentAuthor: boolean;
}

function assertCommentFeedResponseCandidates(items: readonly CommentFeedResponseCandidate[], viewer?: Principal): void {
  for (const item of items) {
    assertCommentFeedItemEligibility({
      postVisibility: item.feedPostVisibility,
      postModerationState: item.feedPostModerationState,
      postDeleted: item.feedPostDeleted,
      publicLabel: item.publicLabel,
      viewer: viewer ? {
        isPostAuthor: item.feedViewerIsPostAuthor,
        followsPostAuthor: item.feedFollowsPostAuthor,
        blockedCommentAuthor: item.feedBlockedCommentAuthor,
        mutedCommentAuthor: item.feedMutedCommentAuthor,
      } : undefined,
    });
  }
}

function presentCommentFeedItems<T extends CommentFeedResponseCandidate>(items: readonly T[]): Array<Omit<T, keyof CommentFeedResponseCandidate>> {
  return items.map(({ feedPostVisibility: _visibility, feedPostModerationState: _moderationState, feedPostDeleted: _deleted, feedViewerIsPostAuthor: _isPostAuthor, feedFollowsPostAuthor: _follows, feedBlockedCommentAuthor: _blocked, feedMutedCommentAuthor: _muted, ...item }) => item) as Array<Omit<T, keyof CommentFeedResponseCandidate>>;
}

interface NewsBoardResponseCandidate {
  feedPublicationPublished: boolean;
  feedPostBacked: boolean;
  feedPostAuthorId: string | null;
  feedPostVisibility: unknown;
  feedPostModerationState: unknown;
  feedPostDeleted: boolean;
  feedPostPublicLabel: unknown;
  feedPostBlocked: boolean;
  feedPostMuted: boolean;
  feedPostFollowsAuthor: boolean;
}

function assertNewsBoardResponseCandidates(items: readonly NewsBoardResponseCandidate[], viewer: Principal): void {
  for (const item of items) {
    assertNewsBoardItemEligibility({
      publicationPublished: item.feedPublicationPublished,
      postBacked: item.feedPostBacked,
      post: item.feedPostBacked ? {
        authorId: item.feedPostAuthorId ?? '',
        visibility: item.feedPostVisibility,
        moderationState: item.feedPostModerationState,
        publicLabel: item.feedPostPublicLabel,
        deleted: item.feedPostDeleted,
        viewer: {
          userId: viewer.userId,
          followsAuthor: item.feedPostFollowsAuthor,
          blocked: item.feedPostBlocked,
          muted: item.feedPostMuted,
        },
      } : undefined,
    });
  }
}

function presentNewsBoardItems<T extends NewsBoardResponseCandidate>(items: readonly T[]): Array<Omit<T, keyof NewsBoardResponseCandidate>> {
  return items.map(({ feedPublicationPublished: _published, feedPostBacked: _postBacked, feedPostAuthorId: _authorId, feedPostVisibility: _visibility, feedPostModerationState: _moderationState, feedPostDeleted: _deleted, feedPostPublicLabel: _publicLabel, feedPostBlocked: _blocked, feedPostMuted: _muted, feedPostFollowsAuthor: _follows, ...item }) => item) as Array<Omit<T, keyof NewsBoardResponseCandidate>>;
}

type IdempotencyRecord = {
  state: 'processing' | 'completed' | 'outcome_unknown';
  requestHash: string;
  status?: number;
  body?: unknown;
};

async function idempotencyRequestHash(request: Request): Promise<string> {
  const url = new URL(request.url);
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? ''
    : await request.clone().text();
  return sha256Hex([
    request.method.toUpperCase(),
    `${url.pathname}${url.search}`,
    request.headers.get('content-type')?.toLowerCase() ?? '',
    body,
  ].join('\n'));
}

async function idempotentMutation(
  request: Request,
  env: Env,
  actorId: string,
  scope: string,
  work: () => Promise<Response>,
  requiredKey = false,
): Promise<Response> {
  const key = idempotencyKey(request.headers.get('idempotency-key'));
  if (!key) {
    if (requiredKey) throw new Error('idempotency_key_required');
    return work();
  }
  const requestHash = await idempotencyRequestHash(request);
  const claimed = await query<{ response: IdempotencyRecord }>(env.DB_APP_FRESH,
    `INSERT INTO system.idempotency_keys (scope, key, actor_id, response)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (scope, key) DO NOTHING
     RETURNING response`, [scope, key, actorId, JSON.stringify({ state: 'processing', requestHash })]);
  if (claimed.rowCount === 0) {
    const existing = await query<{ actor_id: string | null; response: IdempotencyRecord; created_at: string }>(env.DB_APP_FRESH,
      `SELECT actor_id, response, created_at FROM system.idempotency_keys WHERE scope = $1 AND key = $2`, [scope, key]);
    const record = existing.rows[0];
    const plan = planExistingIdempotencyRecord({
      record: record ? { actorId: record.actor_id, response: record.response, createdAt: record.created_at } : undefined,
      actorId,
      requestHash,
    });
    if (plan.action === 'replay') {
      return privateResponse(request, env, plan.body, { status: plan.status });
    }
    if (plan.action === 'in_progress') throw new Error('idempotency_in_progress');
    if (plan.action === 'outcome_unknown') throw new Error('idempotency_outcome_unknown');
    const quarantined = await query(env.DB_APP_FRESH,
      `UPDATE system.idempotency_keys
          SET response = $4::jsonb
        WHERE scope = $1 AND key = $2 AND actor_id = $3
          AND response ->> 'state' = 'processing'
          AND created_at < now() - interval '5 minutes'`,
      [scope, key, actorId, JSON.stringify({ state: 'outcome_unknown', requestHash })]);
    if (quarantined.rowCount === 0) throw new Error('idempotency_in_progress');
    throw new Error('idempotency_outcome_unknown');
  }
  const quarantine = async (): Promise<void> => {
    await query(env.DB_APP_FRESH,
      `UPDATE system.idempotency_keys
          SET response = $4::jsonb
        WHERE scope = $1 AND key = $2 AND actor_id = $3
          AND response ->> 'requestHash' = $5
          AND response ->> 'state' = 'processing'`,
      [scope, key, actorId, JSON.stringify({ state: 'outcome_unknown', requestHash }), requestHash]);
  };
  return runClaimedIdempotentWork({
    work,
    finalize: async (result) => {
      const rawBody = await result.clone().text();
      const body = rawBody ? JSON.parse(rawBody) : null;
      const finalized = await query(env.DB_APP_FRESH,
        `UPDATE system.idempotency_keys
            SET response = $4::jsonb
          WHERE scope = $1 AND key = $2 AND actor_id = $3
            AND response ->> 'requestHash' = $5
            AND response ->> 'state' IN ('processing', 'outcome_unknown')`,
        [scope, key, actorId, JSON.stringify({ state: 'completed', requestHash, status: result.status, body }), requestHash]);
      if (finalized.rowCount !== 1) throw new Error('idempotency_finalize_failed');
    },
    quarantine,
    errorResponse: (classified) => {
      const id = correlationId(request);
      logEvent({
        service: 'lythaus-public-api',
        correlationId: id,
        errorCode: classified.exposedCode,
        internalErrorCode: classified.internalCode,
        route: new URL(request.url).pathname,
      });
      return privateResponse(request, env, { error: classified.exposedCode, correlationId: id }, { status: classified.status });
    },
  });
}

async function createPost(request: Request, env: Env, user: Principal): Promise<Response> {
  await enforceDailyAction(env, user.userId, 'post');
  const input = await readJson<CreatePostInput>(request, 64 * 1024);
  const declaration = enforceContentDeclaration(input);
  const publication = planPostPublication(input.geoScope, input.placeId);
  const postId = uuidv7();
  const eventId = uuidv7();
  const createdAt = new Date().toISOString();
  const bodyHash = await sha256Hex(declaration.body);
  await transaction(env.DB_APP_FRESH, async (client) => {
    await client.query(
      `INSERT INTO content.posts (id, author_id, body, declared_creation_mode, geo_scope, place_id, moderation_state, created_at, updated_at, moderation_source_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)`,
      [postId, user.userId, declaration.body, declaration.declaredCreationMode, publication.geoScope, publication.placeId ?? null, publication.moderationState, createdAt, eventId]
    );
    if (publication.locationPrecision) {
      await client.query(
        `INSERT INTO content.post_locations (post_id, place_id, location_source, location_precision)
         VALUES ($1, $2, 'user_selected', $3)`,
        [postId, publication.placeId, publication.locationPrecision]
      );
    }
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'content.post.created', 'post', $2, $3, $4::jsonb)`,
      [eventId, postId, user.userId, JSON.stringify({ postId, sourceEventId: eventId, declaredCreationMode: declaration.declaredCreationMode, bodyHash })]
    );
    await writeActivity(client, request, user, eventId, {
      eventType: 'content.post_submitted',
      category: 'content',
      title: 'You submitted a post',
      explanation: 'Your post was submitted for the required publication checks.',
      result: 'pending',
      objectType: 'post',
      objectId: postId,
      reputationEffect: declaration.declaredCreationMode === 'human' ? 'withheld' : 'none',
      metadata: { contentType: 'post', creationMode: declaration.declaredCreationMode, visibility: 'public', moderationState: publication.moderationState },
    });
    await writeActivity(client, request, user, eventId, {
      eventType: 'content.declaration_selected',
      category: 'content',
      title: 'You selected an authorship declaration',
      explanation: declaration.declaredCreationMode === 'human'
        ? 'You declared this submission human-authored.'
        : 'You disclosed AI assistance; this submission is not eligible for authorship reputation.',
      objectType: 'post',
      objectId: postId,
      reputationEffect: declaration.declaredCreationMode === 'human' ? 'withheld' : 'none',
      metadata: { contentType: 'post', creationMode: declaration.declaredCreationMode },
    });
  });
  return privateResponse(request, env, {
    id: postId,
    authorId: user.userId,
    content: declaration.body,
    contentType: 'text',
    visibility: 'public',
    isNews: false,
    authorship: {
      authorshipLabel: 'Under review',
      declaredAuthorship: declaration.declaredAuthorship,
      classificationSource: 'user_disclosure',
      classificationState: 'unavailable',
      reviewState: 'pending',
      appealState: 'none',
      labelVersion: 'lythaus-authenticity-v1',
    },
    createdAt,
    updatedAt: createdAt,
    eventId,
  }, { status: 201 });
}

async function createUploadSession(request: Request, env: Env, user: Principal): Promise<Response> {
  await enforceDailyAction(env, user.userId, 'media');
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
    await writeActivity(client, request, user, uploadSessionId, {
      eventType: 'content.media_upload_started', category: 'content',
      title: 'You started a media upload',
      explanation: 'Your media upload entered the private quarantine and safety-review path.',
      result: 'pending', objectType: 'upload_session', objectId: uploadSessionId,
      metadata: { contentType: requestedContentType, moderationState: 'quarantined' },
    });
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
    await writeActivity(client, request, user, eventId, {
      eventType: 'content.media_upload_finalised', category: 'content',
      title: 'You finalised a media upload',
      explanation: 'The uploaded bytes passed integrity checks and entered private media review.',
      result: 'pending', objectType: 'upload_session', objectId: sessionId,
      metadata: { contentType: 'media', moderationState: 'under_review' },
    });
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
            COALESCE(r.current_level, 0)::integer AS reputation_level,
            COALESCE(r.status, 'active') AS reputation_status,
            COALESCE(r.policy_version, $2) AS reputation_policy_version,
            COALESCE(entitlement.subscription_tier, 'free') AS subscription_tier,
            EXISTS (
              SELECT 1 FROM trust.accountability_signals signal
               WHERE signal.user_id = u.id
                 AND signal.signal_type = 'accountability_identity_declared'
                 AND signal.signal_value > 0
            ) AS accountability_identity_declared
       FROM identity.users u
       LEFT JOIN identity.handles h ON h.user_id = u.id
       LEFT JOIN social.profiles p ON p.user_id = u.id
       LEFT JOIN trust.reputation_profiles r ON r.user_id = u.id
       LEFT JOIN identity.user_entitlements entitlement ON entitlement.user_id = u.id
      WHERE u.id = $1 AND u.status = 'active'
        AND ($3::boolean OR (COALESCE(p.moderation_state, 'allowed') = 'allowed' AND COALESCE(p.public_visibility, true)))`, [userId, REPUTATION_POLICY.version, privateView]);
  const profile = result.rows[0] as {
    id: string;
    display_name: string;
    handle: string | null;
    bio: string | null;
    avatar_object_id: string | null;
    trust_passport_visibility: string;
    reputation_level: number;
    reputation_status: string;
    reputation_policy_version: string;
    subscription_tier: string;
    accountability_identity_declared: boolean;
  } | undefined;
  if (!profile) throw new Error('profile_not_found');
  const level = Number(profile.reputation_level);
  const body: { user: Record<string, unknown> } = {
    user: {
      id: profile.id,
      displayName: profile.display_name,
      handle: profile.handle,
      avatarUrl: null,
      bio: profile.bio,
      trustPassportVisibility: profile.trust_passport_visibility,
      reputationLevel: level,
      reputation: {
        level,
        label: REPUTATION_POLICY.levels.find((candidate) => candidate.level === level)?.name ?? 'New',
        band: reputationBand(level),
        status: profile.reputation_status,
        policyVersion: profile.reputation_policy_version,
      },
      journalistVerified: false,
      badges: [],
    },
  };
  if (privateView) {
    body.user.subscriptionTier = normalizeUserTier(profile.subscription_tier);
    body.user.accountabilityIdentityDeclared = profile.accountability_identity_declared;
  }
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
    reputation_level: number;
    reputation_policy_version: string;
    subscription_tier: string;
    created_at: string;
    last_login_at: string;
  }>(env.DB_APP_FRESH,
    `SELECT u.id,
            convert_from(COALESCE(c.email_ciphertext, e.email_ciphertext), 'utf8') AS email_ciphertext,
            COALESCE(c.encryption_key_version, e.encryption_key_version) AS encryption_key_version,
            m.role,
            COALESCE(r.current_level, 0)::integer AS reputation_level,
            COALESCE(r.policy_version, $2) AS reputation_policy_version,
            COALESCE(entitlement.subscription_tier, 'free') AS subscription_tier,
            u.created_at,
            COALESCE((SELECT max(created_at) FROM identity.account_events x WHERE x.user_id = u.id AND x.event_type = 'email_login'), u.created_at) AS last_login_at
       FROM identity.users u
       LEFT JOIN identity.contact_emails c ON c.user_id = u.id
       LEFT JOIN identity.email_credentials e ON e.user_id = u.id
       LEFT JOIN identity.admin_memberships m ON m.user_id = u.id AND m.active = true
       LEFT JOIN trust.reputation_profiles r ON r.user_id = u.id
       LEFT JOIN identity.user_entitlements entitlement ON entitlement.user_id = u.id
      WHERE u.id = $1 AND u.status = 'active'`, [userId, REPUTATION_POLICY.version]);
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
    subscription_tier: normalizeUserTier(user.subscription_tier),
    reputation_level: Number(user.reputation_level),
    reputation_policy_version: user.reputation_policy_version,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
  });
}

async function updateProfile(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<{ displayName?: string; bio?: string; trustPassportVisibility?: string; accountabilityName?: string | null }>(request, 16 * 1024);
  const displayName = input.displayName?.trim();
  const bio = input.bio?.trim();
  const visibility = input.trustPassportVisibility;
  const accountabilityName = input.accountabilityName === undefined
    ? undefined
    : input.accountabilityName?.normalize('NFC').trim() || null;
  if (displayName !== undefined && (displayName.length < 1 || displayName.length > 160)) throw new Error('invalid_display_name');
  if (bio !== undefined && bio.length > 2000) throw new Error('invalid_bio');
  if (visibility !== undefined && !['public_expanded', 'public_minimal', 'private'].includes(visibility)) throw new Error('invalid_profile_visibility');
  if (accountabilityName !== undefined && accountabilityName !== null && (accountabilityName.length < 2 || accountabilityName.length > 160)) {
    throw new Error('invalid_accountability_name');
  }
  if (accountabilityName !== undefined && !env.PII_ENCRYPTION_KEY_V1) throw new Error('authentication_not_configured');
  await transaction(env.DB_APP_FRESH, async (client) => {
    const currentUser = await client.query<{ display_name: string }>(
      `SELECT display_name FROM identity.users WHERE id = $1 FOR UPDATE`,
      [user.userId],
    );
    if (!currentUser.rows[0]) throw new Error('user_not_found');
    const currentProfile = await client.query<{ bio: string; trust_passport_visibility: string }>(
      `SELECT bio, trust_passport_visibility FROM social.profiles WHERE user_id = $1 FOR UPDATE`,
      [user.userId],
    );
    const currentPrivate = await client.query<{ encrypted_payload: string; encryption_key_version: string }>(
      `SELECT convert_from(encrypted_payload, 'utf8') AS encrypted_payload, encryption_key_version
         FROM social.profile_private_fields WHERE user_id = $1 FOR UPDATE`,
      [user.userId],
    );
    let currentAccountabilityName: string | null = null;
    if (currentPrivate.rows[0]) {
      const plaintext = await decryptField({
        ciphertext: currentPrivate.rows[0].encrypted_payload,
        encryptionKeyVersion: currentPrivate.rows[0].encryption_key_version,
      }, env.PII_ENCRYPTION_KEY_V1!);
      const parsed = JSON.parse(plaintext) as { accountabilityName?: unknown };
      if (typeof parsed.accountabilityName !== 'string') throw new Error('encrypted_field_invalid');
      currentAccountabilityName = parsed.accountabilityName;
    }
    const changedDisplayName = displayName !== undefined && displayName !== currentUser.rows[0].display_name;
    const changedBio = bio !== undefined && bio !== (currentProfile.rows[0]?.bio ?? '');
    const changedVisibility = visibility !== undefined
      && visibility !== (currentProfile.rows[0]?.trust_passport_visibility ?? 'public_minimal');
    const changedAccountability = accountabilityName !== undefined && accountabilityName !== currentAccountabilityName;
    if (!changedDisplayName && !changedBio && !changedVisibility && !changedAccountability) return;
    const sourceEventId = uuidv7();
    const accountabilitySourceEventId = changedAccountability ? uuidv7() : undefined;
    const encryptedAccountability = changedAccountability && accountabilityName
      ? await encryptField(JSON.stringify({ accountabilityName }), env.PII_ENCRYPTION_KEY_V1!, 'v1')
      : null;
    if (changedDisplayName) await client.query('UPDATE identity.users SET display_name = $1, updated_at = now() WHERE id = $2', [displayName, user.userId]);
    if (changedDisplayName || changedBio) await client.query(
      `INSERT INTO social.profiles (user_id, bio, moderation_source_event_id, moderation_state)
       VALUES ($1, COALESCE($2, ''), $3, 'under_review')
       ON CONFLICT (user_id) DO UPDATE SET bio = COALESCE($2, social.profiles.bio),
         moderation_source_event_id = EXCLUDED.moderation_source_event_id,
         moderation_state = 'under_review', updated_at = now()`,
      [user.userId, bio ?? null, sourceEventId],
    );
    if (changedVisibility) await client.query(
      `INSERT INTO social.profiles (user_id, public_visibility, trust_passport_visibility)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET public_visibility = EXCLUDED.public_visibility,
         trust_passport_visibility = EXCLUDED.trust_passport_visibility, updated_at = now()`,
      [user.userId, visibility !== 'private', visibility]);
    if (changedAccountability) {
      if (encryptedAccountability) {
        await client.query(
          `INSERT INTO social.profile_private_fields (user_id, encrypted_payload, encryption_key_version)
           VALUES ($1, convert_to($2, 'utf8'), $3)
           ON CONFLICT (user_id) DO UPDATE SET encrypted_payload = EXCLUDED.encrypted_payload,
             encryption_key_version = EXCLUDED.encryption_key_version, updated_at = now()`,
          [user.userId, encryptedAccountability.ciphertext, encryptedAccountability.encryptionKeyVersion],
        );
        await client.query(
          `INSERT INTO trust.accountability_signals (id, user_id, signal_type, signal_value, policy_version)
           VALUES ($1, $2, 'accountability_identity_declared', 1, $3)
           ON CONFLICT (user_id, signal_type) DO UPDATE SET signal_value = 1,
             policy_version = EXCLUDED.policy_version, created_at = now()`,
          [uuidv7(), user.userId, REPUTATION_POLICY.version],
        );
      } else {
        await client.query(`DELETE FROM social.profile_private_fields WHERE user_id = $1`, [user.userId]);
        await client.query(
          `DELETE FROM trust.accountability_signals
            WHERE user_id = $1 AND signal_type = 'accountability_identity_declared'`,
          [user.userId],
        );
      }
      await client.query(
        `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
         VALUES ($1, $2, 'user', $3, $3, $4::jsonb)`,
        [
          accountabilitySourceEventId,
          accountabilityName ? 'profile.accountability_identity_declared' : 'profile.accountability_identity_removed',
          user.userId,
          JSON.stringify({ userId: user.userId }),
        ],
      );
      await writeActivity(client, request, user, accountabilitySourceEventId!, {
        eventType: 'profile.accountability_name_changed',
        category: 'account',
        title: accountabilityName ? 'You declared a private accountability name' : 'You removed your private accountability name',
        explanation: accountabilityName
          ? 'A private accountability name was stored securely. Declaring a name does not verify legal identity and the name is not copied into this log.'
          : 'Your private accountability name was removed. The prior value is not copied into this log.',
        objectType: 'profile',
        objectId: user.userId,
        metadata: { changedField: 'accountability_name' },
      });
    }
    if (changedDisplayName || changedBio) {
      await client.query(
        `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
         VALUES ($1, 'content.profile.updated', 'profile', $2, $2, $3::jsonb)`,
        [sourceEventId, user.userId, JSON.stringify({ userId: user.userId, sourceEventId, changedFields: [changedDisplayName ? 'displayName' : null, changedBio ? 'bio' : null].filter(Boolean) })]);
    }
    const changedFields = [changedDisplayName ? 'display_name' : null, changedBio ? 'bio' : null, changedVisibility ? 'visibility' : null].filter((value): value is string => Boolean(value));
    if (changedFields.length > 0) await writeActivity(client, request, user, sourceEventId, {
      eventType: changedVisibility && changedFields.length === 1 ? 'profile.visibility_changed' : changedDisplayName ? 'profile.display_name_changed' : 'profile.bio_changed',
      category: 'account',
      title: 'You updated your profile',
      explanation: 'Your selected profile fields were updated. Sensitive values are not copied into this log.',
      objectType: 'profile',
      objectId: user.userId,
      metadata: { changedField: changedFields.join(',') },
    });
  });
  return getUserProfile(request, env, user.userId, true);
}

async function assertSocialInteractionAllowed(client: DatabaseClient, actorId: string, targetId: string): Promise<void> {
  const result = await client.query(
    `SELECT 1
       FROM identity.users target
      WHERE target.id = $2 AND target.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM social.blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = $2)
              OR (b.blocker_id = $2 AND b.blocked_id = $1)
        )`,
    [actorId, targetId],
  );
  if (result.rowCount !== 1) throw new Error('social_interaction_not_allowed');
}

async function visiblePostForInteraction(
  client: DatabaseClient,
  postId: string,
  userId: string,
): Promise<{ author_id: string }> {
  const result = await client.query<{ author_id: string }>(
    `SELECT p.author_id
       FROM content.posts p
       JOIN identity.users author ON author.id = p.author_id AND author.status = 'active'
      WHERE p.id = $1 AND p.deleted_at IS NULL AND p.moderation_state = 'allowed'
        AND (
          p.visibility = 'public'
          OR p.author_id = $2
          OR (p.visibility = 'followers' AND EXISTS (
            SELECT 1 FROM social.follows f WHERE f.follower_id = $2 AND f.followed_id = p.author_id
          ))
        )
        AND NOT EXISTS (
          SELECT 1 FROM social.blocks b
           WHERE (b.blocker_id = $2 AND b.blocked_id = p.author_id)
              OR (b.blocker_id = p.author_id AND b.blocked_id = $2)
        )`,
    [postId, userId],
  );
  if (!result.rows[0]) throw new Error('post_not_available');
  return result.rows[0];
}

async function createFollow(request: Request, env: Env, user: Principal, routeTargetUserId?: string): Promise<Response> {
  const input = routeTargetUserId ? { userId: routeTargetUserId } : await readJson<{ userId?: string }>(request, 8 * 1024);
  if (!input.userId || input.userId === user.userId) throw new Error('invalid_follow');
  const targetUserId = input.userId;
  const sourceEventId = uuidv7();
  const created = await transaction(env.DB_APP_FRESH, async (client) => {
    await assertSocialInteractionAllowed(client, user.userId, targetUserId);
    const result = await client.query(
      `INSERT INTO social.follows (follower_id, followed_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING followed_id`,
      [user.userId, targetUserId],
    );
    if (result.rowCount === 0) return false;
    await enforceRelationshipChangeLimit(client, user.userId, targetUserId);
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'social.follow.created', 'user', $2, $3, $4::jsonb)`,
      [sourceEventId, targetUserId, user.userId, JSON.stringify({ followerId: user.userId, followedId: targetUserId })],
    );
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'social.follow_created', category: 'social', title: 'You followed a user',
      explanation: 'The follow relationship was created.', objectType: 'user', objectId: targetUserId,
      metadata: { relationshipType: 'follow', targetType: 'user' },
    });
    return true;
  });
  return privateResponse(request, env, { following: targetUserId, created }, { status: created ? 201 : 200 });
}

async function followStatus(request: Request, env: Env, user: Principal, targetUserId: string): Promise<Response> {
  if (!targetUserId || targetUserId === user.userId) throw new Error('invalid_follow');
  const result = await query<{ following: boolean; followed_by: boolean; blocked: boolean }>(env.DB_APP_FRESH,
    `SELECT
       EXISTS (SELECT 1 FROM social.follows WHERE follower_id = $1 AND followed_id = $2) AS following,
       EXISTS (SELECT 1 FROM social.follows WHERE follower_id = $2 AND followed_id = $1) AS followed_by,
       EXISTS (SELECT 1 FROM social.blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)) AS blocked`,
    [user.userId, targetUserId]);
  return privateResponse(request, env, { userId: targetUserId, following: result.rows[0]?.following ?? false, followedBy: result.rows[0]?.followed_by ?? false, blocked: result.rows[0]?.blocked ?? false });
}

async function relationshipList(request: Request, env: Env, user: Principal, kind: 'blocks' | 'mutes' | 'bookmarks'): Promise<Response> {
  const statements = {
    blocks: `SELECT blocked_id AS "userId", created_at AS "createdAt" FROM social.blocks WHERE blocker_id = $1 ORDER BY created_at DESC`,
    mutes: `SELECT muted_id AS "userId", created_at AS "createdAt" FROM social.mutes WHERE muter_id = $1 ORDER BY created_at DESC`,
    bookmarks: `SELECT post_id AS "postId", created_at AS "createdAt" FROM social.bookmarks WHERE user_id = $1 ORDER BY created_at DESC`,
  } as const;
  const result = await query(env.DB_APP_FRESH, statements[kind], [user.userId]);
  return privateResponse(request, env, { items: result.rows });
}

async function removeFollow(request: Request, env: Env, user: Principal, followedId: string): Promise<Response> {
  const sourceEventId = uuidv7();
  const removed = await transaction(env.DB_APP_FRESH, async (client) => {
    const result = await client.query(
      `DELETE FROM social.follows WHERE follower_id = $1 AND followed_id = $2 RETURNING followed_id`,
      [user.userId, followedId],
    );
    if (result.rowCount === 0) return false;
    await enforceRelationshipChangeLimit(client, user.userId, followedId);
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'social.follow_removed', category: 'social', title: 'You unfollowed a user',
      explanation: 'The follow relationship was removed.', objectType: 'user', objectId: followedId,
      metadata: { relationshipType: 'follow', targetType: 'user' },
    });
    return true;
  });
  return privateResponse(request, env, { following: followedId, removed });
}

async function setBlock(request: Request, env: Env, user: Principal, targetUserId: string, blocked: boolean): Promise<Response> {
  const change = planRelationshipMutation('block', user.userId, targetUserId, blocked);
  const sourceEventId = uuidv7();
  const changed = await transaction(env.DB_APP_FRESH, async (client) => {
    const target = await client.query(`SELECT 1 FROM identity.users WHERE id = $1 AND status = 'active'`, [change.targetUserId]);
    if (target.rowCount !== 1) throw new Error('user_not_found');
    if (blocked) {
      const inserted = await client.query(`INSERT INTO social.blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING blocked_id`, [user.userId, change.targetUserId]);
      if (inserted.rowCount === 0) return false;
      if (change.removeFollowEdges) await client.query(`DELETE FROM social.follows WHERE (follower_id = $1 AND followed_id = $2) OR (follower_id = $2 AND followed_id = $1)`, [user.userId, change.targetUserId]);
    } else {
      const removed = await client.query(`DELETE FROM social.blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING blocked_id`, [user.userId, change.targetUserId]);
      if (removed.rowCount === 0) return false;
    }
    await writeActivity(client, request, user, sourceEventId, {
      eventType: change.activityEvent, category: 'social',
      title: blocked ? 'You blocked a user' : 'You unblocked a user',
      explanation: blocked ? 'The user can no longer interact with you through normal social surfaces.' : 'The block relationship was removed.',
      objectType: 'user', objectId: change.targetUserId, metadata: { relationshipType: 'block', targetType: 'user' },
    });
    return true;
  });
  return privateResponse(request, env, { userId: change.targetUserId, blocked, changed });
}

async function setMute(request: Request, env: Env, user: Principal, targetUserId: string, muted: boolean): Promise<Response> {
  const change = planRelationshipMutation('mute', user.userId, targetUserId, muted);
  const sourceEventId = uuidv7();
  const changed = await transaction(env.DB_APP_FRESH, async (client) => {
    const target = await client.query(`SELECT 1 FROM identity.users WHERE id = $1 AND status = 'active'`, [change.targetUserId]);
    if (target.rowCount !== 1) throw new Error('user_not_found');
    const mutation = muted
      ? await client.query(`INSERT INTO social.mutes (muter_id, muted_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING muted_id`, [user.userId, change.targetUserId])
      : await client.query(`DELETE FROM social.mutes WHERE muter_id = $1 AND muted_id = $2 RETURNING muted_id`, [user.userId, change.targetUserId]);
    if (mutation.rowCount === 0) return false;
    await writeActivity(client, request, user, sourceEventId, {
      eventType: change.activityEvent, category: 'social',
      title: muted ? 'You muted a user' : 'You unmuted a user',
      explanation: muted ? 'Content from this user is suppressed from your personalised surfaces.' : 'The mute relationship was removed.',
      objectType: 'user', objectId: change.targetUserId, metadata: { relationshipType: 'mute', targetType: 'user' },
    });
    return true;
  });
  return privateResponse(request, env, { userId: change.targetUserId, muted, changed });
}

async function setBookmark(request: Request, env: Env, user: Principal, postId: string, bookmarked: boolean): Promise<Response> {
  if (!postId) throw new Error('invalid_bookmark');
  const sourceEventId = uuidv7();
  const changed = await transaction(env.DB_APP_FRESH, async (client) => {
    let mutation;
    if (bookmarked) {
      await visiblePostForInteraction(client, postId, user.userId);
      mutation = await client.query(`INSERT INTO social.bookmarks (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING post_id`, [user.userId, postId]);
    } else mutation = await client.query(`DELETE FROM social.bookmarks WHERE user_id = $1 AND post_id = $2 RETURNING post_id`, [user.userId, postId]);
    if (mutation.rowCount === 0) return false;
    await writeActivity(client, request, user, sourceEventId, {
      eventType: bookmarked ? 'content.bookmark_added' : 'content.bookmark_removed', category: 'content',
      title: bookmarked ? 'You bookmarked a post' : 'You removed a bookmark',
      explanation: bookmarked ? 'The post was added to your private bookmarks.' : 'The post was removed from your private bookmarks.',
      objectType: 'post', objectId: postId, metadata: { contentType: 'post' },
    });
    return true;
  });
  return privateResponse(request, env, { postId, bookmarked, changed });
}

async function createComment(request: Request, env: Env, user: Principal, postId: string): Promise<Response> {
  await enforceDailyAction(env, user.userId, 'comment');
  const input = await readJson<{ body?: string; parentId?: string; declaredCreationMode?: unknown }>(request, 32 * 1024);
  const declaration = enforceContentDeclaration({
    body: input.body,
    declaredCreationMode: input.declaredCreationMode,
  });
  if (declaration.body.length > 20_000) throw new Error('invalid_comment');
  const comment = planCommentCreation(input.parentId);
  const commentId = uuidv7();
  const sourceEventId = uuidv7();
  const bodyHash = await sha256Hex(declaration.body);
  let depth = 0;
  await transaction(env.DB_APP_FRESH, async (client) => {
    await visiblePostForInteraction(client, postId, user.userId);
    if (comment.isReply) {
      const parent = await client.query<{ depth: number }>(
        `SELECT parent.depth FROM content.comments parent
          WHERE parent.id = $1 AND parent.post_id = $2
            AND parent.deleted_at IS NULL AND parent.moderation_state = 'allowed'
            AND NOT EXISTS (
              SELECT 1 FROM social.blocks block
               WHERE (block.blocker_id = $3 AND block.blocked_id = parent.author_id)
                  OR (block.blocker_id = parent.author_id AND block.blocked_id = $3)
            )
            AND NOT EXISTS (
              SELECT 1 FROM social.mutes mute
               WHERE mute.muter_id = $3 AND mute.muted_id = parent.author_id
            )`,
        [comment.parentId, postId, user.userId],
      );
      depth = replyDepth(parent.rows[0]);
    }
    await client.query(`INSERT INTO content.comments (id, post_id, author_id, parent_id, body, depth, declared_creation_mode, moderation_source_event_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [commentId, postId, user.userId, comment.parentId, declaration.body, depth, declaration.declaredCreationMode, sourceEventId]);
    await client.query(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload) VALUES ($1, 'content.comment.created', 'comment', $2, $3, $4::jsonb)`, [sourceEventId, commentId, user.userId, JSON.stringify({ postId, commentId, parentId: comment.parentId, sourceEventId, declaredCreationMode: declaration.declaredCreationMode, bodyHash })]);
    await writeActivity(client, request, user, sourceEventId, {
      eventType: comment.activityEvent, category: 'content',
      title: comment.isReply ? 'You submitted a reply' : 'You submitted a comment',
      explanation: 'Your contribution was accepted for moderation and publication processing.', result: 'pending',
      objectType: 'comment', objectId: commentId, reputationEffect: declaration.declaredCreationMode === 'human' ? 'withheld' : 'none',
      metadata: { contentType: comment.contentType, creationMode: declaration.declaredCreationMode, moderationState: comment.moderationState },
    });
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'content.declaration_selected', category: 'content',
      title: 'You selected an authorship declaration',
      explanation: declaration.declaredCreationMode === 'human'
        ? 'You declared this contribution human-authored.'
        : 'You disclosed AI assistance; this contribution is not eligible for authorship reputation.',
      objectType: 'comment', objectId: commentId,
      reputationEffect: declaration.declaredCreationMode === 'human' ? 'withheld' : 'none',
      metadata: { contentType: comment.contentType, creationMode: declaration.declaredCreationMode },
    });
  });
  return privateResponse(request, env, { id: commentId, commentId, postId, parentId: comment.parentId, body: declaration.body, depth, declaredCreationMode: declaration.declaredCreationMode, moderationState: comment.moderationState }, { status: 201 });
}

async function updatePost(request: Request, env: Env, user: Principal, postId: string): Promise<Response> {
  const input = await readJson<{ body?: string; declaredCreationMode?: unknown; visibility?: string }>(request, 64 * 1024);
  const sourceEventId = uuidv7();
  const updated = await transaction(env.DB_APP_FRESH, async (client) => {
    const current = await client.query<{ body: string; declared_creation_mode: string; visibility: string; moderation_state: string }>(
      `SELECT body, declared_creation_mode, visibility, moderation_state FROM content.posts
        WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL FOR UPDATE`, [postId, user.userId]);
    if (!current.rows[0]) throw new Error('post_not_found');
    const revision = planPostRevision({
      visibility: input.visibility ?? current.rows[0].visibility,
      bodyProvided: input.body !== undefined,
      declaredCreationMode: input.declaredCreationMode,
    });
    const declaration = enforceContentDeclaration({
      body: revision.bodyUpdated ? input.body : current.rows[0].body,
      declaredCreationMode: input.declaredCreationMode ?? current.rows[0].declared_creation_mode,
    });
    const changed = declaration.body !== current.rows[0].body
      || declaration.declaredCreationMode !== current.rows[0].declared_creation_mode
      || revision.visibility !== current.rows[0].visibility;
    if (!changed) {
      return {
        id: postId,
        body: current.rows[0].body,
        declaredCreationMode: current.rows[0].declared_creation_mode,
        visibility: current.rows[0].visibility,
        moderationState: current.rows[0].moderation_state,
      };
    }
    const bodyHash = await sha256Hex(declaration.body);
    await client.query(
      `UPDATE content.posts
          SET body = $1, declared_creation_mode = $2, visibility = $3,
              moderation_state = $4, published_at = NULL, moderation_source_event_id = $5, updated_at = now()
        WHERE id = $6 AND author_id = $7`,
      [declaration.body, declaration.declaredCreationMode, revision.visibility, revision.moderationState, sourceEventId, postId, user.userId],
    );
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'content.post.updated', 'post', $2, $3, $4::jsonb)`,
      [sourceEventId, postId, user.userId, JSON.stringify({ postId, sourceEventId, declaredCreationMode: declaration.declaredCreationMode, bodyHash })],
    );
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'content.post_edited', category: 'content', title: 'You edited a post',
      explanation: 'Your edited post returned to publication review.', result: 'pending',
      objectType: 'post', objectId: postId, reputationEffect: 'withheld',
      metadata: { contentType: 'post', creationMode: declaration.declaredCreationMode, visibility: revision.visibility, moderationState: revision.moderationState },
    });
    return { id: postId, body: declaration.body, declaredCreationMode: declaration.declaredCreationMode, visibility: revision.visibility, moderationState: revision.moderationState };
  });
  return privateResponse(request, env, { post: updated });
}

async function deletePost(request: Request, env: Env, user: Principal, postId: string): Promise<Response> {
  const deletion = contentDeletionPlan('post');
  const sourceEventId = uuidv7();
  const deleted = await transaction(env.DB_APP_FRESH, async (client) => {
    const result = await client.query(
      `UPDATE content.posts SET deleted_at = now(), visibility = $1, published_at = NULL, updated_at = now()
        WHERE id = $2 AND author_id = $3 AND deleted_at IS NULL RETURNING id`, [deletion.visibility, postId, user.userId]);
    if (result.rowCount === 0) return false;
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, $2, 'post', $3, $4, $5::jsonb)`,
      [sourceEventId, deletion.outboxEventType, postId, user.userId, JSON.stringify({ postId })],
    );
    await writeActivity(client, request, user, sourceEventId, {
      eventType: deletion.activityEvent, category: 'content', title: 'You deleted a post',
      explanation: 'The post was removed from public and personalised surfaces and entered the deletion-retention window.',
      objectType: 'post', objectId: postId, metadata: { contentType: deletion.contentType, visibility: deletion.visibility },
    });
    return true;
  });
  return privateResponse(request, env, { postId, deleted });
}

async function updateComment(request: Request, env: Env, user: Principal, commentId: string): Promise<Response> {
  const input = await readJson<{ body?: string; declaredCreationMode?: unknown }>(request, 32 * 1024);
  const sourceEventId = uuidv7();
  const updated = await transaction(env.DB_APP_FRESH, async (client) => {
    const current = await client.query<{ post_id: string; body: string; declared_creation_mode: unknown; moderation_state: string }>(
      `SELECT post_id, body, declared_creation_mode, moderation_state FROM content.comments
        WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [commentId, user.userId],
    );
    if (!current.rows[0]) throw new Error('comment_not_found');
    const revision = planCommentRevision(input, current.rows[0].declared_creation_mode);
    let declaration;
    try {
      declaration = enforceContentDeclaration(revision);
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_post') throw new Error('invalid_comment');
      throw error;
    }
    if (declaration.body.length > 20_000) throw new Error('invalid_comment');
    if (declaration.body === current.rows[0].body && declaration.declaredCreationMode === current.rows[0].declared_creation_mode) {
      return { declaration, moderationState: current.rows[0].moderation_state };
    }
    const bodyHash = await sha256Hex(declaration.body);
    const result = await client.query(
      `UPDATE content.comments
          SET body = $1, declared_creation_mode = $2, moderation_state = $3, moderation_source_event_id = $4, updated_at = now()
        WHERE id = $5 AND author_id = $6 AND deleted_at IS NULL RETURNING post_id`,
      [declaration.body, declaration.declaredCreationMode, revision.moderationState, sourceEventId, commentId, user.userId],
    );
    if (result.rowCount === 0) throw new Error('comment_not_found');
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'content.comment.updated', 'comment', $2, $3, $4::jsonb)`,
      [sourceEventId, commentId, user.userId, JSON.stringify({ commentId, postId: result.rows[0]?.post_id, sourceEventId, declaredCreationMode: declaration.declaredCreationMode, bodyHash })],
    );
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'content.comment_edited', category: 'content', title: 'You edited a comment',
      explanation: 'Your edited comment returned to moderation review.', result: 'pending',
      objectType: 'comment', objectId: commentId, reputationEffect: 'withheld',
      metadata: { contentType: 'comment', creationMode: declaration.declaredCreationMode, moderationState: revision.moderationState },
    });
    return { declaration, moderationState: revision.moderationState };
  });
  return privateResponse(request, env, {
    id: commentId,
    body: updated.declaration.body,
    declaredCreationMode: updated.declaration.declaredCreationMode,
    moderationState: updated.moderationState,
  });
}

async function deleteComment(request: Request, env: Env, user: Principal, commentId: string): Promise<Response> {
  const deletion = contentDeletionPlan('comment');
  const sourceEventId = uuidv7();
  const deleted = await transaction(env.DB_APP_FRESH, async (client) => {
    const result = await client.query(
      `UPDATE content.comments SET body = '[deleted]', deleted_at = now(), updated_at = now()
        WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL RETURNING id, post_id`, [commentId, user.userId]);
    if (result.rowCount === 0) return false;
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, $2, 'comment', $3, $4, $5::jsonb)`,
      [sourceEventId, deletion.outboxEventType, commentId, user.userId, JSON.stringify({ commentId, postId: result.rows[0]?.post_id })],
    );
    await writeActivity(client, request, user, sourceEventId, {
      eventType: deletion.activityEvent, category: 'content', title: 'You deleted a comment',
      explanation: 'The comment body was removed; a tombstone may remain to preserve thread structure.',
      objectType: 'comment', objectId: commentId, metadata: { contentType: deletion.contentType },
    });
    return true;
  });
  return privateResponse(request, env, { commentId, deleted });
}

async function createReaction(request: Request, env: Env, user: Principal, postId: string): Promise<Response> {
  const input = await readJson<{ reactionType?: string }>(request, 8 * 1024);
  const existing = await query<{ reaction_type: string }>(env.DB_APP_FRESH,
    `SELECT reaction_type FROM social.reactions WHERE user_id = $1 AND post_id = $2 LIMIT 1`, [user.userId, postId]);
  const reaction = planReactionChange(input.reactionType, existing.rows[0]?.reaction_type);
  if (!reaction.changed) {
    return privateResponse(request, env, { postId, reactionType: reaction.reactionType, changed: false });
  }
  await enforceDailyAction(env, user.userId, 'reaction');
  const sourceEventId = uuidv7();
  await transaction(env.DB_APP_FRESH, async (client) => {
    const post = await visiblePostForInteraction(client, postId, user.userId);
    assertDistinctReactionAuthor(post.author_id, user.userId);
    await client.query(`DELETE FROM social.reactions WHERE user_id = $1 AND post_id = $2`, [user.userId, postId]);
    await client.query(`INSERT INTO social.reactions (user_id, post_id, reaction_type) VALUES ($1, $2, $3)`, [user.userId, postId, reaction.reactionType]);
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'social.reaction.changed', 'post', $2, $3, $4::jsonb)`,
      [sourceEventId, postId, user.userId, JSON.stringify({ postId, authorId: post.author_id, reactionType: reaction.reactionType })],
    );
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'content.reaction_added', category: 'content', title: 'You reacted to a post',
      explanation: 'Your current reaction was saved. Reactions do not directly increase reputation.',
      objectType: 'post', objectId: postId, metadata: { contentType: 'post' },
    });
  });
  return privateResponse(request, env, { postId, reactionType: reaction.reactionType, changed: true }, { status: reaction.status });
}

async function removeReaction(request: Request, env: Env, user: Principal, postId: string): Promise<Response> {
  const sourceEventId = uuidv7();
  const removed = await transaction(env.DB_APP_FRESH, async (client) => {
    const result = await client.query(`DELETE FROM social.reactions WHERE user_id = $1 AND post_id = $2 RETURNING reaction_type`, [user.userId, postId]);
    if (result.rowCount === 0) return false;
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'content.reaction_removed', category: 'content', title: 'You removed a reaction',
      explanation: 'Your reaction was removed from the post.', objectType: 'post', objectId: postId,
      metadata: { contentType: 'post' },
    });
    return true;
  });
  return privateResponse(request, env, { postId, removed });
}

async function createFlag(request: Request, env: Env, user: Principal): Promise<Response> {
  await enforceDailyAction(env, user.userId, 'flag');
  const input = await readJson<{ contentType?: string; contentId?: string; reasonCode?: string }>(request, 16 * 1024);
  if (!input.contentType || !input.contentId || !input.reasonCode) throw new Error('invalid_flag');
  const flagId = uuidv7();
  const sourceEventId = uuidv7();
  const result = await transaction(env.DB_APP_FRESH, async (client) => {
    const inserted = await client.query<{ id: string }>(`INSERT INTO moderation.content_flags (id, reporter_id, content_type, content_id, reason_code) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id`, [flagId, user.userId, input.contentType, input.contentId, input.reasonCode]);
    if (!inserted.rows[0]) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM moderation.content_flags WHERE reporter_id = $1 AND content_type = $2 AND content_id = $3 AND reason_code = $4`,
        [user.userId, input.contentType, input.contentId, input.reasonCode],
      );
      if (!existing.rows[0]) throw new Error('flag_not_recorded');
      return { flagId: existing.rows[0].id, created: false };
    }
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'moderation.flag.created', 'content_flag', $2, $3, $4::jsonb)`,
      [sourceEventId, flagId, user.userId, JSON.stringify({ flagId, contentType: input.contentType, contentId: input.contentId })],
    );
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'moderation.flag_submitted', category: 'moderation', title: 'You reported content',
      explanation: 'Your report was accepted for review. A report is evidence, not a finding of guilt.',
      objectType: input.contentType, objectId: input.contentId, metadata: { decisionType: 'content_report' },
    });
    return { flagId, created: true };
  });
  return privateResponse(request, env, { flagId: result.flagId }, { status: result.created ? 201 : 200 });
}

async function createAppeal(request: Request, env: Env, user: Principal): Promise<Response> {
  await enforceDailyAction(env, user.userId, 'appeal');
  const input = await readJson<{ caseId?: string; statement?: string }>(request, 16 * 1024);
  if (!input.caseId) throw new Error('case_id_required');
  const statement = input.statement?.normalize('NFC').trim() ?? '';
  if (!statement || statement.length > 2000) throw new Error('appeal_statement_required');
  const appealId = uuidv7();
  const sourceEventId = uuidv7();
  const result = await transaction(env.DB_APP_FRESH, async (client) => {
    const eligible = await client.query<{ id: string; content_type: string }>(
      `SELECT c.id, c.content_type FROM moderation.cases c
        LEFT JOIN content.posts p ON c.content_type = 'post' AND p.id = c.content_id
        LEFT JOIN content.comments m ON c.content_type = 'comment' AND m.id = c.content_id
       WHERE c.id = $1 AND c.state = 'resolved'
         AND (p.author_id = $2 OR m.author_id = $2 OR (c.content_type = 'account' AND c.content_id = $2))
       FOR UPDATE OF c`,
      [input.caseId, user.userId],
    );
    if (!eligible.rows[0]) throw new Error('appeal_not_allowed');
    const riskClass = eligible.rows[0].content_type === 'account' ? 'high' : 'standard';
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO moderation.appeals
         (id, case_id, appellant_id, statement, risk_class, policy_version, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + interval '7 days')
       ON CONFLICT (case_id, appellant_id) WHERE state = 'open' DO NOTHING
       RETURNING id`,
      [appealId, input.caseId, user.userId, statement, riskClass, APPEAL_POLICY.version],
    );
    if (!inserted.rows[0]) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM moderation.appeals WHERE case_id = $1 AND appellant_id = $2 AND state = 'open'`,
        [input.caseId, user.userId],
      );
      return { appealId: existing.rows[0]?.id ?? appealId, created: false, riskClass };
    }
    await client.query(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload) VALUES ($1, 'moderation.appeal.created', 'appeal', $2, $3, $4::jsonb)`, [sourceEventId, appealId, user.userId, JSON.stringify({ appealId, caseId: input.caseId, riskClass })]);
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'appeals.appeal_submitted', category: 'appeals', title: 'You submitted an appeal',
      explanation: 'Your appeal entered the independent reviewer assignment process.', result: 'pending',
      objectType: 'appeal', objectId: appealId, policyVersion: APPEAL_POLICY.version,
      metadata: { appealState: 'open', riskClass },
    });
    return { appealId, created: true, riskClass };
  });
  return privateResponse(request, env, { appealId: result.appealId, state: 'open', riskClass: result.riskClass, policyVersion: APPEAL_POLICY.version }, { status: result.created ? 201 : 200 });
}

async function getAppeal(request: Request, env: Env, user: Principal, appealId: string): Promise<Response> {
  const result = await query(env.DB_APP_FRESH,
    `SELECT a.id, a.case_id, a.state, a.risk_class, a.policy_version, a.created_at, a.expires_at, a.resolved_at,
            o.reviewer_panel_decision, o.final_decision, o.completed_reviewers, o.state AS outcome_state,
            (assignment.id IS NOT NULL) AS reviewer_assigned,
            vote.decision AS reviewer_decision
       FROM moderation.appeals a
       LEFT JOIN moderation.appeal_outcomes o ON o.appeal_id = a.id
       LEFT JOIN moderation.appeal_assignments assignment ON assignment.appeal_id = a.id AND assignment.reviewer_id = $2
       LEFT JOIN moderation.appeal_review_votes vote ON vote.assignment_id = assignment.id
      WHERE a.id = $1 AND (a.appellant_id = $2 OR assignment.reviewer_id = $2)`, [appealId, user.userId]);
  if (!result.rows[0]) throw new Error('appeal_not_found');
  return privateResponse(request, env, { appeal: result.rows[0] });
}

async function submitAppealVote(request: Request, env: Env, user: Principal, appealId: string): Promise<Response> {
  const input = await readJson<{ decision?: 'overturn' | 'uphold' }>(request, 8 * 1024);
  if (!input.decision || !['overturn', 'uphold'].includes(input.decision)) throw new Error('appeal_vote_invalid');
  const idempotencyKey = request.headers.get('idempotency-key')?.trim();
  if (!idempotencyKey) throw new Error('idempotency_key_required');
  const voteId = uuidv7();
  const sourceEventId = uuidv7();
  const result = await transaction(env.DB_APP_FRESH, async (client) => {
    const assignment = await client.query<{
      id: string;
      appellant_id: string;
      level_snapshot: number;
      qualification_snapshot: 'trained';
      vote_weight_snapshot: 1 | 2;
      state: string;
    }>(
      `SELECT assignment.id, appeal.appellant_id, assignment.level_snapshot,
              assignment.qualification_snapshot, assignment.vote_weight_snapshot, assignment.state
         FROM moderation.appeal_assignments assignment
         JOIN moderation.appeals appeal ON appeal.id = assignment.appeal_id
         JOIN moderation.reviewer_qualifications qualification ON qualification.user_id = assignment.reviewer_id
        WHERE assignment.appeal_id = $1 AND assignment.reviewer_id = $2
          AND appeal.state = 'open' AND appeal.expires_at > now()
          AND qualification.state = 'trained'
        FOR UPDATE OF assignment`,
      [appealId, user.userId],
    );
    const assigned = assignment.rows[0];
    if (!assigned || assigned.appellant_id === user.userId || assigned.state !== 'assigned') throw new Error('appeal_vote_not_allowed');
    const inserted = await client.query<{ id: string; decision: string }>(
      `INSERT INTO moderation.appeal_review_votes
         (id, assignment_id, appeal_id, reviewer_id, decision, level_snapshot,
          qualification_snapshot, vote_weight_snapshot, idempotency_key, policy_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (assignment_id) DO NOTHING
       RETURNING id, decision`,
      [voteId, assigned.id, appealId, user.userId, input.decision, assigned.level_snapshot,
        assigned.qualification_snapshot, assigned.vote_weight_snapshot, idempotencyKey, APPEAL_POLICY.version],
    );
    if (!inserted.rows[0]) {
      const existing = await client.query<{ id: string; decision: string }>(
        `SELECT id, decision FROM moderation.appeal_review_votes WHERE assignment_id = $1`, [assigned.id]);
      if (existing.rows[0]?.decision !== input.decision) throw new Error('appeal_vote_locked');
      return { ...existing.rows[0], created: false };
    }
    await client.query(`UPDATE moderation.appeal_assignments SET state = 'voted' WHERE id = $1`, [assigned.id]);
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'moderation.appeal.vote_locked', 'appeal', $2, $3, $4::jsonb)`,
      [sourceEventId, appealId, user.userId, JSON.stringify({ appealId, voteId, decision: input.decision })],
    );
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'appeals.review_completed', category: 'appeals', title: 'You completed an appeal review',
      explanation: 'Your independent review was locked and cannot be changed.', objectType: 'appeal', objectId: appealId,
      policyVersion: APPEAL_POLICY.version, metadata: { appealState: 'reviewed', outcome: input.decision },
    });
    return { id: voteId, decision: input.decision, created: true };
  });
  return privateResponse(request, env, { voteId: result.id, appealId, decision: result.decision, locked: true }, { status: result.created ? 201 : 200 });
}

async function recuseAppealReview(request: Request, env: Env, user: Principal, appealId: string): Promise<Response> {
  const sourceEventId = uuidv7();
  const result = await transaction(env.DB_APP_FRESH, async (client) => {
    const assignment = await client.query<{ id: string; state: string; risk_class: string }>(
      `SELECT assignment.id, assignment.state, appeal.risk_class
         FROM moderation.appeal_assignments assignment
         JOIN moderation.appeals appeal ON appeal.id = assignment.appeal_id
        WHERE assignment.appeal_id = $1 AND assignment.reviewer_id = $2
          AND appeal.state = 'open' AND appeal.expires_at > now()
        FOR UPDATE OF assignment`,
      [appealId, user.userId],
    );
    const row = assignment.rows[0];
    if (!row || row.state !== 'assigned') throw new Error('appeal_recusal_not_allowed');
    await client.query(
      `UPDATE moderation.appeal_assignments SET state = 'recused', recused_at = now() WHERE id = $1`,
      [row.id],
    );
    await client.query(
      `INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload)
       VALUES ($1, 'moderation.appeal.reviewer_recused', 'appeal', $2, $3, $4::jsonb)`,
      [sourceEventId, appealId, user.userId, JSON.stringify({ appealId, assignmentId: row.id })],
    );
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'appeals.reviewer_assignment_changed', category: 'appeals',
      title: 'You recused yourself from an appeal review',
      explanation: 'Your recusal was recorded and a replacement reviewer will be selected independently.',
      objectType: 'appeal', objectId: appealId, policyVersion: APPEAL_POLICY.version,
      metadata: { appealState: 'recused', riskClass: row.risk_class },
    });
    return { assignmentId: row.id };
  });
  return privateResponse(request, env, { appealId, assignmentId: result.assignmentId, state: 'recused' });
}

async function reviewerAssignments(request: Request, env: Env, user: Principal): Promise<Response> {
  const result = await query(env.DB_APP_FRESH,
    `SELECT assignment.id, assignment.appeal_id, assignment.state, assignment.assigned_at,
            appeal.risk_class, appeal.expires_at, appeal.policy_version,
            vote.decision, vote.locked_at
       FROM moderation.appeal_assignments assignment
       JOIN moderation.appeals appeal ON appeal.id = assignment.appeal_id
       LEFT JOIN moderation.appeal_review_votes vote ON vote.assignment_id = assignment.id
      WHERE assignment.reviewer_id = $1
      ORDER BY assignment.assigned_at DESC LIMIT 50`, [user.userId]);
  return privateResponse(request, env, { items: result.rows });
}

async function createPrivacyRequest(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<{ requestType?: 'export' | 'delete' | 'rectify' }>(request, 8 * 1024);
  const plan = privacyRequestPlan(input.requestType);
  const requestId = uuidv7();
  const acceptedAt = await transaction(env.DB_APP_FRESH, async (client) => {
    await client.query(`SELECT id FROM identity.users WHERE id = $1 FOR UPDATE`, [user.userId]);
    const active = await client.query(
      `SELECT 1 FROM privacy.requests
        WHERE subject_id = $1
          AND request_type = $2
          AND state IN ('received', 'processing', 'blocked')
        LIMIT 1`,
      [user.userId, plan.requestType],
    );
    if (active.rowCount !== 0) throw new Error('privacy_request_active');
    if (plan.requiresExportCooldown) {
      const recent = await client.query(
        `SELECT 1 FROM privacy.requests
          WHERE subject_id = $1
            AND request_type = 'export'
            AND created_at >= now() - ($2::integer * interval '1 day')
          LIMIT 1`,
        [user.userId, PLATFORM_SAFETY_LIMITS.exportCooldownDays],
      );
      if (recent.rowCount !== 0) throw new Error('export_cooldown_active');
    }
    const created = await client.query<{ created_at: string }>(
      `INSERT INTO privacy.requests (id, subject_id, request_type)
       VALUES ($1, $2, $3)
       RETURNING created_at`,
      [requestId, user.userId, plan.requestType],
    );
    const sourceEventId = uuidv7();
    await client.query(`INSERT INTO system.outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, payload) VALUES ($1, 'privacy.request.created', 'privacy_request', $2, $3, $4::jsonb)`, [sourceEventId, requestId, user.userId, JSON.stringify({ requestId, requestType: plan.requestType })]);
    await writeActivity(client, request, user, sourceEventId, {
      eventType: plan.activityEvent,
      category: 'privacy',
      title: plan.activityTitle,
      explanation: 'Lythaus accepted your privacy request for processing.',
      result: 'pending',
      objectType: 'privacy_request',
      objectId: requestId,
      metadata: { requestType: plan.requestType, requestState: 'received' },
    });
    return created.rows[0]?.created_at;
  });
  return privateResponse(request, env, {
    requestId,
    requestType: plan.requestType,
    state: 'received',
    acceptedAt,
  }, { status: 202 });
}

async function getPrivacyRequestStatus(request: Request, env: Env, user: Principal): Promise<Response> {
  const url = new URL(request.url);
  const requestType = optionalPrivacyRequestType(url.searchParams.get('requestType'));
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

async function downloadPrivacyExport(
  request: Request,
  env: Env,
  user: Principal,
  requestId: string,
): Promise<Response> {
  const manifest = await query<{
    id: string;
    object_key: string;
    package_hash: string;
  }>(
    env.DB_APP_FRESH,
    `SELECT manifest.id, manifest.object_key, manifest.package_hash
       FROM privacy.export_manifests manifest
       JOIN privacy.requests privacy_request ON privacy_request.id = manifest.request_id
      WHERE privacy_request.id = $1
        AND privacy_request.subject_id = $2
        AND privacy_request.request_type = 'export'
        AND privacy_request.state = 'completed'
        AND manifest.expires_at > now()
      ORDER BY manifest.created_at DESC
      LIMIT 1`,
    [requestId, user.userId],
  );
  const exportDependencies = requirePrivacyExportDependencies({ manifest: manifest.rows[0], storage: env.PRIVATE_EXPORTS });
  const row = exportDependencies.manifest;
  const object = requirePrivacyExportObject(await exportDependencies.storage.get(row.object_key));
  const activity = privacyExportAccessActivity(requestId);
  await transaction(env.DB_APP_FRESH, async (client) => {
    await writeActivity(client, request, user, uuidv7(), {
      eventType: activity.eventType,
      category: 'privacy',
      title: activity.title,
      explanation: 'Your generated data export was securely downloaded.',
      objectType: activity.objectType,
      objectId: activity.objectId,
      retentionClass: 'security',
      metadata: { requestType: activity.requestType, requestState: activity.requestState },
    });
  });
  const result = new Response(object.body, {
    headers: {
      'cache-control': 'private, no-store',
      'content-disposition': `attachment; filename="lythaus-export-${requestId}.json"`,
      'content-type': object.httpMetadata?.contentType ?? 'application/json',
      'etag': object.httpEtag,
      'x-content-sha256': row.package_hash,
      'x-correlation-id': correlationId(request),
      'vary': 'Origin, Authorization',
    },
  });
  const origin = corsOrigin(request, env);
  if (origin) {
    result.headers.set('access-control-allow-origin', origin);
    result.headers.set('access-control-allow-credentials', 'true');
    result.headers.set('access-control-expose-headers', 'content-disposition, etag, x-content-sha256, x-correlation-id');
  }
  return result;
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
  const countryCode = code(input.countryCode, 'country_code');
  const regionCode = code(input.regionCode, 'region_code');
  const municipalityCode = code(input.municipalityCode, 'municipality_code');
  const sourceEventId = uuidv7();
  const changed = await transaction(env.DB_APP_FRESH, async (client) => {
    const current = await client.query<{ country_code: string | null; region_code: string | null; municipality_code: string | null; visibility_level: string }>(
      `SELECT country_code, region_code, municipality_code, visibility_level
         FROM identity.user_region_preferences WHERE user_id = $1 FOR UPDATE`,
      [user.userId],
    );
    const previous = current.rows[0] ?? { country_code: null, region_code: null, municipality_code: null, visibility_level: 'private' };
    if (previous.country_code === countryCode && previous.region_code === regionCode
      && previous.municipality_code === municipalityCode && previous.visibility_level === visibility) return false;
    await client.query(
      `INSERT INTO identity.user_region_preferences (user_id, country_code, region_code, municipality_code, visibility_level)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET country_code = EXCLUDED.country_code, region_code = EXCLUDED.region_code,
         municipality_code = EXCLUDED.municipality_code, visibility_level = EXCLUDED.visibility_level, updated_at = now()`,
      [user.userId, countryCode, regionCode, municipalityCode, visibility]);
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'profile.region_changed', category: 'account', title: 'You updated region preferences',
      explanation: 'Your region and region-visibility preferences were updated without copying location values into this log.',
      objectType: 'region_preferences', metadata: { changedField: 'region_preferences' },
    });
    return true;
  });
  return privateResponse(request, env, { updated: true, changed });
}

async function updateRetentionRule(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<{ contentType?: 'post' | 'posts' | 'media'; retentionDays?: number }>(request, 8 * 1024);
  const plan = retentionRulePlan(input);
  const sourceEventId = uuidv7();
  const changed = await transaction(env.DB_APP_FRESH, async (client) => {
    const current = await client.query<{ retention_days: number }>(
      `SELECT round(extract(epoch FROM retention_period) / 86400)::integer AS retention_days
         FROM privacy.retention_rules WHERE user_id = $1 AND content_type = $2 FOR UPDATE`,
      [user.userId, plan.contentType],
    );
    if (Number(current.rows[0]?.retention_days) === plan.retentionDays) return false;
    await client.query(
      `SELECT privacy.set_retention_rule($1, $2, $3, make_interval(days => $4::integer), $5)`,
      [uuidv7(), user.userId, plan.contentType, plan.retentionDays, 'user-v1']);
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'profile.retention_preference_changed', category: 'account', title: 'You updated retention preferences',
      explanation: 'Your selected content retention period was updated.', objectType: 'retention_rule',
      metadata: { changedField: 'retention_preference' },
    });
    return true;
  });
  return privateResponse(request, env, { ...plan, changed });
}

async function listCustomFeeds(request: Request, env: Env, user: Principal): Promise<Response> {
  const result = await query(env.DB_APP_FRESH,
    `SELECT f.id, f.name, f.created_at,
            COALESCE(jsonb_agg(r.rule ORDER BY r.created_at) FILTER (WHERE r.id IS NOT NULL), '[]'::jsonb) AS rules
     FROM social.custom_feeds f
     LEFT JOIN social.custom_feed_rules r ON r.feed_id = f.id
     WHERE f.user_id = $1
     GROUP BY f.id, f.name, f.created_at
     ORDER BY f.created_at DESC`, [user.userId]);
  return privateResponse(request, env, { items: result.rows });
}

async function createCustomFeed(request: Request, env: Env, user: Principal): Promise<Response> {
  const input = await readJson<{ name?: string; rules?: unknown[] }>(request, 32 * 1024);
  const name = input.name?.trim() ?? '';
  if (!name || name.length > 120 || !Array.isArray(input.rules)) throw new Error('invalid_custom_feed');
  const rules = normalizeCustomFeedRules(input.rules);
  const tier = await tierForUser(env, user.userId);
  const existing = await query<{ count: string }>(env.DB_APP_FRESH,
    `SELECT count(*)::text AS count FROM social.custom_feeds WHERE user_id = $1`, [user.userId]);
  assertCustomFeedAvailable(tier, Number(existing.rows[0]?.count ?? 0));
  const feedId = uuidv7();
  const sourceEventId = uuidv7();
  await transaction(env.DB_APP_FRESH, async (client) => {
    await client.query(`INSERT INTO social.custom_feeds (id, user_id, name) VALUES ($1, $2, $3)`, [feedId, user.userId, name]);
    for (const rule of rules) {
      await client.query(`INSERT INTO social.custom_feed_rules (id, feed_id, rule) VALUES ($1, $2, $3::jsonb)`, [uuidv7(), feedId, JSON.stringify(rule)]);
    }
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'social.custom_feed_created', category: 'social', title: 'You created a custom feed',
      explanation: 'The custom feed and its selected rules were saved.', objectType: 'custom_feed', objectId: feedId,
      metadata: { relationshipType: 'custom_feed', targetType: 'feed' },
    });
  });
  return privateResponse(request, env, { id: feedId, name, rules }, { status: 201 });
}

async function customFeed(request: Request, env: Env, user: Principal, feedId: string): Promise<Response> {
  const owned = await query<{ id: string; name: string; rules: unknown[] }>(env.DB_APP_FRESH,
    `SELECT f.id, f.name,
            COALESCE(jsonb_agg(r.rule ORDER BY r.created_at) FILTER (WHERE r.id IS NOT NULL), '[]'::jsonb) AS rules
     FROM social.custom_feeds f
     LEFT JOIN social.custom_feed_rules r ON r.feed_id = f.id
     WHERE f.id = $1 AND f.user_id = $2
     GROUP BY f.id, f.name`, [feedId, user.userId]);
  if (!owned.rows[0]) throw new Error('custom_feed_not_found');
  if (request.method === 'GET') return privateResponse(request, env, owned.rows[0]);
  if (request.method === 'DELETE') {
    const sourceEventId = uuidv7();
    const deleted = await transaction(env.DB_APP_FRESH, async (client) => {
      const mutation = await client.query(`DELETE FROM social.custom_feeds WHERE id = $1 AND user_id = $2 RETURNING id`, [feedId, user.userId]);
      if (mutation.rowCount !== 1) return false;
      await writeActivity(client, request, user, sourceEventId, {
        eventType: 'social.custom_feed_deleted', category: 'social', title: 'You deleted a custom feed',
        explanation: 'The custom feed and its rules were deleted.', objectType: 'custom_feed', objectId: feedId,
        metadata: { relationshipType: 'custom_feed', targetType: 'feed' },
      });
      return true;
    });
    return privateResponse(request, env, { id: feedId, deleted });
  }
  const input = await readJson<{ name?: string; rules?: unknown[] }>(request, 32 * 1024);
  const name = input.name?.trim() ?? owned.rows[0].name;
  const rules = Array.isArray(input.rules) ? normalizeCustomFeedRules(input.rules) : owned.rows[0].rules;
  if (!name || name.length > 120) throw new Error('invalid_custom_feed');
  if (name === owned.rows[0].name && JSON.stringify(rules) === JSON.stringify(owned.rows[0].rules)) {
    return privateResponse(request, env, { id: feedId, name, rules, changed: false });
  }
  const sourceEventId = uuidv7();
  const changed = await transaction(env.DB_APP_FRESH, async (client) => {
    const mutation = await client.query(`UPDATE social.custom_feeds SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id`, [name, feedId, user.userId]);
    if (mutation.rowCount !== 1) return false;
    if (Array.isArray(input.rules)) {
      await client.query(`DELETE FROM social.custom_feed_rules WHERE feed_id = $1`, [feedId]);
      for (const rule of rules) {
        await client.query(`INSERT INTO social.custom_feed_rules (id, feed_id, rule) VALUES ($1, $2, $3::jsonb)`, [uuidv7(), feedId, JSON.stringify(rule)]);
      }
    }
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'social.custom_feed_updated', category: 'social', title: 'You updated a custom feed',
      explanation: 'The custom feed configuration was updated.', objectType: 'custom_feed', objectId: feedId,
      metadata: { relationshipType: 'custom_feed', targetType: 'feed' },
    });
    return true;
  });
  return privateResponse(request, env, { id: feedId, name, rules, changed });
}

async function customFeedItems(request: Request, env: Env, user: Principal, feedId: string): Promise<Response> {
  const owned = await query<{ rules: unknown[] }>(env.DB_APP_FRESH,
    `SELECT COALESCE(jsonb_agg(r.rule) FILTER (WHERE r.id IS NOT NULL), '[]'::jsonb) AS rules
     FROM social.custom_feeds f LEFT JOIN social.custom_feed_rules r ON r.feed_id = f.id
     WHERE f.id = $1 AND f.user_id = $2 GROUP BY f.id`, [feedId, user.userId]);
  if (!owned.rows[0]) throw new Error('custom_feed_not_found');
  const page = pageRequest(new URL(request.url));
  const result = await query<FeedResponseCandidate & { id: string; publishedAt: string }>(env.DB_APP_FRESH,
    `SELECT p.id, p.author_id AS "authorId", p.body, p.published_at AS "publishedAt",
            p.visibility, p.moderation_state AS "moderationState", (p.deleted_at IS NOT NULL) AS "feedItemDeleted",
            declaration.public_label AS "publicLabel", d.topic, d.region_code AS "regionCode",
            COALESCE((SELECT jsonb_object_agg(counted.reaction_type, counted.reaction_count)
                        FROM (SELECT reaction.reaction_type, count(*)::integer AS reaction_count
                                FROM social.reactions reaction WHERE reaction.post_id = p.id
                                 AND reaction.reaction_type IN ('like', 'insightful', 'support')
                               GROUP BY reaction.reaction_type) counted), '{}'::jsonb) AS "reactionCounts",
            (SELECT reaction.reaction_type FROM social.reactions reaction
              WHERE reaction.user_id = $2 AND reaction.post_id = p.id
                AND reaction.reaction_type IN ('like', 'insightful', 'support') LIMIT 1) AS "viewerReaction",
            EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = p.author_id) OR (b.blocker_id = p.author_id AND b.blocked_id = $2)) AS "feedBlocked",
            EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $2 AND m.muted_id = p.author_id) AS "feedMuted",
            EXISTS (SELECT 1 FROM social.follows f WHERE f.follower_id = $2 AND f.followed_id = p.author_id) AS "feedFollowsAuthor"
       FROM content.posts p
       JOIN identity.users author ON author.id = p.author_id AND author.status = 'active'
       JOIN content.content_declarations declaration ON declaration.post_id = p.id
       LEFT JOIN feed.discovery_candidates d ON d.post_id = p.id
      WHERE p.visibility = 'public' AND p.moderation_state = 'allowed' AND p.deleted_at IS NULL
        AND declaration.public_label IN ('Human-authored', 'AI-assisted')
        AND NOT EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = p.author_id) OR (b.blocker_id = p.author_id AND b.blocked_id = $2))
        AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $2 AND m.muted_id = p.author_id)
        AND (
          NOT EXISTS (SELECT 1 FROM social.custom_feed_rules empty_rule WHERE empty_rule.feed_id = $1)
          OR EXISTS (
            SELECT 1 FROM social.custom_feed_rules matching_rule
             WHERE matching_rule.feed_id = $1
               AND (NOT matching_rule.rule ? 'topic' OR d.topic = matching_rule.rule->>'topic')
               AND (NOT matching_rule.rule ? 'regionCode' OR d.region_code = matching_rule.rule->>'regionCode')
          )
        )
        AND ($3::timestamptz IS NULL OR (p.published_at, p.id) < ($3::timestamptz, $4::uuid))
      ORDER BY p.published_at DESC, p.id DESC LIMIT $5`,
    [feedId, user.userId, page.cursor?.timestamp ?? null, page.cursor?.id ?? null, page.limit + 1]);
  assertFeedResponseCandidates(result.rows, user);
  const hasMore = result.rows.length > page.limit;
  const items = result.rows.slice(0, page.limit);
  const tail = items.at(-1);
  return feedResponse(request, env, { items: presentFeedItems(items), nextCursor: hasMore && tail ? encodeCursor({ timestamp: tail.publishedAt, id: tail.id }) : null }, 'custom', true);
}

async function getEntitlements(request: Request, env: Env, user: Principal): Promise<Response> {
  const tier = await tierForUser(env, user.userId);
  return privateResponse(request, env, { tier, entitlements: entitlementsForTier(tier) });
}

async function getNewsBoard(request: Request, env: Env, user: Principal): Promise<Response> {
  const tier = await tierForUser(env, user.userId);
  const access = requireNewsBoardAccess(tier);
  const page = pageRequest(new URL(request.url));
  const result = await query<NewsBoardResponseCandidate & { id: string; publishedAt: string }>(env.DB_APP_FRESH,
    `SELECT publication.id, publication.title, publication.post_id, publication.published_at,
            post.body, post.author_id AS "authorId", publication.published_at AS "publishedAt",
            (publication.published_at IS NOT NULL) AS "feedPublicationPublished", (post.id IS NOT NULL) AS "feedPostBacked",
            post.author_id AS "feedPostAuthorId", post.visibility AS "feedPostVisibility", post.moderation_state AS "feedPostModerationState",
            (post.deleted_at IS NOT NULL) AS "feedPostDeleted", declaration.public_label AS "feedPostPublicLabel",
            EXISTS (SELECT 1 FROM social.blocks block WHERE (block.blocker_id = $1 AND block.blocked_id = post.author_id) OR (block.blocker_id = post.author_id AND block.blocked_id = $1)) AS "feedPostBlocked",
            EXISTS (SELECT 1 FROM social.mutes mute WHERE mute.muter_id = $1 AND mute.muted_id = post.author_id) AS "feedPostMuted",
            EXISTS (SELECT 1 FROM social.follows follow WHERE follow.follower_id = $1 AND follow.followed_id = post.author_id) AS "feedPostFollowsAuthor",
            COALESCE((SELECT jsonb_object_agg(counted.reaction_type, counted.reaction_count)
                        FROM (SELECT reaction.reaction_type, count(*)::integer AS reaction_count
                                FROM social.reactions reaction WHERE reaction.post_id = post.id
                                 AND reaction.reaction_type IN ('like', 'insightful', 'support')
                               GROUP BY reaction.reaction_type) counted), '{}'::jsonb) AS "reactionCounts",
            (SELECT reaction.reaction_type FROM social.reactions reaction
              WHERE reaction.user_id = $1 AND reaction.post_id = post.id
                AND reaction.reaction_type IN ('like', 'insightful', 'support') LIMIT 1) AS "viewerReaction"
     FROM editorial.publications publication
     LEFT JOIN content.posts post ON post.id = publication.post_id
     LEFT JOIN content.content_declarations declaration ON declaration.post_id = post.id
     WHERE publication.published_at IS NOT NULL
       AND (post.id IS NULL OR (post.deleted_at IS NULL AND post.moderation_state = 'allowed' AND declaration.public_label IN ('Human-authored', 'AI-assisted')))
       AND (post.id IS NULL OR (
         NOT EXISTS (SELECT 1 FROM social.blocks block WHERE (block.blocker_id = $1 AND block.blocked_id = post.author_id) OR (block.blocker_id = post.author_id AND block.blocked_id = $1))
         AND NOT EXISTS (SELECT 1 FROM social.mutes mute WHERE mute.muter_id = $1 AND mute.muted_id = post.author_id)
       ))
       AND ($2::timestamptz IS NULL OR (publication.published_at, publication.id) < ($2::timestamptz, $3::uuid))
     ORDER BY publication.published_at DESC, publication.id DESC LIMIT $4`,
    [user.userId, page.cursor?.timestamp ?? null, page.cursor?.id ?? null, page.limit + 1]);
  assertNewsBoardResponseCandidates(result.rows, user);
  const hasMore = result.rows.length > page.limit;
  const items = result.rows.slice(0, page.limit);
  const tail = items.at(-1);
  return feedResponse(request, env, { access, items: presentNewsBoardItems(items), nextCursor: hasMore && tail ? encodeCursor({ timestamp: tail.publishedAt, id: tail.id }) : null }, 'news', true);
}

async function discoveryFeed(request: Request, env: Env, viewer?: Principal): Promise<Response> {
  const page = pageRequest(new URL(request.url));
  const result = await query<FeedResponseCandidate & { id: string; publishedAt: string }>(env.DB_APP_FRESH,
    `SELECT p.id, p.author_id AS "authorId", p.body, p.published_at AS "publishedAt",
            p.visibility, p.moderation_state AS "moderationState", (p.deleted_at IS NOT NULL) AS "feedItemDeleted",
            declaration.public_label AS "publicLabel", d.topic, d.region_code AS "regionCode",
            COALESCE((SELECT jsonb_object_agg(counted.reaction_type, counted.reaction_count)
                        FROM (SELECT reaction.reaction_type, count(*)::integer AS reaction_count
                                FROM social.reactions reaction WHERE reaction.post_id = p.id
                                 AND reaction.reaction_type IN ('like', 'insightful', 'support')
                               GROUP BY reaction.reaction_type) counted), '{}'::jsonb) AS "reactionCounts",
            (SELECT reaction.reaction_type FROM social.reactions reaction
              WHERE reaction.user_id = $1 AND reaction.post_id = p.id
                AND reaction.reaction_type IN ('like', 'insightful', 'support') LIMIT 1) AS "viewerReaction",
            EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = p.author_id) OR (b.blocker_id = p.author_id AND b.blocked_id = $1)) AS "feedBlocked",
            EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $1 AND m.muted_id = p.author_id) AS "feedMuted",
            EXISTS (SELECT 1 FROM social.follows f WHERE f.follower_id = $1 AND f.followed_id = p.author_id) AS "feedFollowsAuthor"
       FROM content.posts p
       JOIN identity.users author ON author.id = p.author_id AND author.status = 'active'
       JOIN content.content_declarations declaration ON declaration.post_id = p.id
       LEFT JOIN feed.discovery_candidates d ON d.post_id = p.id
      WHERE p.visibility = 'public' AND p.moderation_state = 'allowed' AND p.deleted_at IS NULL
        AND declaration.public_label IN ('Human-authored', 'AI-assisted')
        AND ($1::uuid IS NULL OR (
          NOT EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = p.author_id) OR (b.blocker_id = p.author_id AND b.blocked_id = $1))
          AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $1 AND m.muted_id = p.author_id)
        ))
        AND ($2::timestamptz IS NULL OR (p.published_at, p.id) < ($2::timestamptz, $3::uuid))
      ORDER BY p.published_at DESC, p.id DESC LIMIT $4`,
    [viewer?.userId ?? null, page.cursor?.timestamp ?? null, page.cursor?.id ?? null, page.limit + 1]);
  assertFeedResponseCandidates(result.rows, viewer);
  const hasMore = result.rows.length > page.limit;
  const items = result.rows.slice(0, page.limit);
  const tail = items.at(-1);
  const body = { items: presentFeedItems(items), nextCursor: hasMore && tail ? encodeCursor({ timestamp: tail.publishedAt, id: tail.id }) : null };
  return feedResponse(request, env, body, 'discovery', Boolean(viewer));
}

async function notifications(request: Request, env: Env, user: Principal): Promise<Response> {
  const page = pageRequest(new URL(request.url), 100);
  const [result, unread] = await Promise.all([
    query<{ id: string; createdAt: string }>(env.DB_APP_FRESH,
      `SELECT id, notification_type AS "notificationType", entity_id AS "entityId",
              CASE notification_type
                WHEN 'reply' THEN 'New reply'
                WHEN 'content.reply_received' THEN 'New reply'
                WHEN 'content.comment_received' THEN 'New comment'
                WHEN 'social.follow_received' THEN 'New follower'
                WHEN 'moderation_decision' THEN 'Moderation decision'
                WHEN 'moderation.decision_applied' THEN 'Moderation decision'
                WHEN 'appeal_result' THEN 'Appeal resolved'
                WHEN 'appeals.appeal_resolved' THEN 'Appeal resolved'
                WHEN 'appeals.appeal_expired' THEN 'Appeal review expired'
                WHEN 'appeals.reviewer_assigned' THEN 'Appeal review assigned'
                WHEN 'appeals.reviewer_qualification_changed' THEN 'Reviewer eligibility updated'
                WHEN 'appeals.reviewer_panel_result_reached' THEN 'Appeal reviewer panel result reached'
                WHEN 'appeals.adjudication_required' THEN 'Appeal adjudication required'
                WHEN 'reputation_level' THEN 'Reputation level updated'
                WHEN 'reputation.level_promoted' THEN 'Reputation level increased'
                WHEN 'reputation.level_demoted' THEN 'Reputation level decreased'
                WHEN 'reviewer_eligibility' THEN 'Reviewer eligibility updated'
                WHEN 'privacy_complete' THEN 'Privacy request completed'
                WHEN 'reward_eligible' THEN 'Reward available'
                ELSE 'Lythaus update'
              END AS title,
              read_at AS "readAt", created_at AS "createdAt"
         FROM feed.notifications
        WHERE recipient_id = $1 AND dismissed_at IS NULL
          AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
        ORDER BY created_at DESC, id DESC LIMIT $4`,
      [user.userId, page.cursor?.timestamp ?? null, page.cursor?.id ?? null, page.limit + 1]),
    query<{ count: string }>(env.DB_APP_FRESH,
      `SELECT count(*)::text AS count FROM feed.notifications
        WHERE recipient_id = $1 AND read_at IS NULL AND dismissed_at IS NULL`, [user.userId]),
  ]);
  const hasMore = result.rows.length > page.limit;
  const items = result.rows.slice(0, page.limit);
  const tail = items.at(-1);
  const nextCursor = hasMore && tail ? encodeCursor({ timestamp: tail.createdAt, id: tail.id }) : null;
  const totalUnread = Number(unread.rows[0]?.count ?? 0);
  return privateResponse(request, env, { items, notifications: items, nextCursor, continuationToken: nextCursor, totalUnread });
}

async function notificationAction(request: Request, env: Env, user: Principal, notificationId: string, action: 'read' | 'dismiss'): Promise<Response> {
  const column = action === 'read' ? 'read_at' : 'dismissed_at';
  const result = await query(env.DB_APP_FRESH,
    `UPDATE feed.notifications SET ${column} = now() WHERE id = $1 AND recipient_id = $2 RETURNING id`, [notificationId, user.userId]);
  if (result.rowCount !== 1) throw new Error('notification_not_found');
  return privateResponse(request, env, { id: notificationId, action });
}

async function notificationPreferences(request: Request, env: Env, user: Principal): Promise<Response> {
  if (request.method === 'GET') {
    const result = await query(env.DB_APP_FRESH,
      `SELECT email_enabled AS "emailEnabled", push_enabled AS "pushEnabled",
              replies_enabled AS "repliesEnabled", moderation_enabled AS "moderationEnabled",
              rewards_enabled AS "rewardsEnabled", updated_at AS "updatedAt"
       FROM feed.notification_preferences WHERE user_id = $1`, [user.userId]);
    return privateResponse(request, env, result.rows[0] ?? {
      emailEnabled: true, pushEnabled: true, repliesEnabled: true, moderationEnabled: true, rewardsEnabled: true,
    });
  }
  const input = normalizeNotificationPreferences(await readJson<Record<string, unknown>>(request, 8 * 1024));
  const values = [input.emailEnabled, input.pushEnabled, input.repliesEnabled, input.moderationEnabled, input.rewardsEnabled];
  const sourceEventId = uuidv7();
  const row = await transaction(env.DB_APP_FRESH, async (client) => {
    const current = await client.query<{
      emailEnabled: boolean; pushEnabled: boolean; repliesEnabled: boolean; moderationEnabled: boolean; rewardsEnabled: boolean; updatedAt: string | null;
    }>(
      `SELECT email_enabled AS "emailEnabled", push_enabled AS "pushEnabled",
              replies_enabled AS "repliesEnabled", moderation_enabled AS "moderationEnabled",
              rewards_enabled AS "rewardsEnabled", updated_at AS "updatedAt"
         FROM feed.notification_preferences WHERE user_id = $1 FOR UPDATE`,
      [user.userId],
    );
    const before = current.rows[0] ?? {
      emailEnabled: true, pushEnabled: true, repliesEnabled: true, moderationEnabled: true, rewardsEnabled: true, updatedAt: null,
    };
    const changed = input.changedKeys.some((key) => input[key] !== null && before[key] !== input[key]);
    if (!changed) return before;
    const result = await client.query(
      `INSERT INTO feed.notification_preferences
         (user_id, email_enabled, push_enabled, replies_enabled, moderation_enabled, rewards_enabled)
       VALUES ($1, COALESCE($2, true), COALESCE($3, true), COALESCE($4, true), COALESCE($5, true), COALESCE($6, true))
       ON CONFLICT (user_id) DO UPDATE SET
         email_enabled = COALESCE($2, feed.notification_preferences.email_enabled),
         push_enabled = COALESCE($3, feed.notification_preferences.push_enabled),
         replies_enabled = COALESCE($4, feed.notification_preferences.replies_enabled),
         moderation_enabled = COALESCE($5, feed.notification_preferences.moderation_enabled),
         rewards_enabled = COALESCE($6, feed.notification_preferences.rewards_enabled),
         updated_at = now()
       RETURNING email_enabled AS "emailEnabled", push_enabled AS "pushEnabled",
         replies_enabled AS "repliesEnabled", moderation_enabled AS "moderationEnabled",
         rewards_enabled AS "rewardsEnabled", updated_at AS "updatedAt"`,
      [user.userId, ...values],
    );
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'profile.notification_preference_changed', category: 'account',
      title: 'You updated notification preferences',
      explanation: 'Your notification delivery preferences were updated.', objectType: 'notification_preferences',
      metadata: { changedField: input.changedKeys.join(',') },
    });
    return result.rows[0];
  });
  return privateResponse(request, env, row);
}

async function notificationDevices(request: Request, env: Env, user: Principal): Promise<Response> {
  if (request.method === 'GET') {
    const result = await query(env.DB_APP_FRESH,
      `SELECT id, platform, active, created_at, revoked_at FROM feed.notification_devices
       WHERE user_id = $1 ORDER BY created_at DESC`, [user.userId]);
    return privateResponse(request, env, { items: result.rows });
  }
  const input = normalizeNotificationDevice(await readJson<Record<string, unknown>>(request, 8 * 1024));
  const secrets = requireAuthSecrets(env);
  const deviceId = uuidv7();
  const sourceEventId = uuidv7();
  const encryptedToken = await encryptField(input.token, secrets.encryptionKey, 'v1');
  const tokenHmac = hmacLookup(input.token, secrets.hmacKey);
  const stored = await transaction(env.DB_APP_FRESH, async (client) => {
    const current = await client.query<{ id: string; user_id: string; platform: string; active: boolean }>(
      `SELECT id, user_id, platform, active FROM feed.notification_devices WHERE token_hmac = decode($1, 'base64') FOR UPDATE`,
      [tokenHmac],
    );
    const existing = current.rows[0];
    if (existing?.user_id === user.userId && existing.platform === input.platform && existing.active) return existing.id;
    const result = await client.query<{ id: string }>(
      `INSERT INTO feed.notification_devices (id, user_id, platform, token_ciphertext, token_hmac)
       VALUES ($1, $2, $3, convert_to($4, 'utf8'), decode($5, 'base64'))
       ON CONFLICT (token_hmac) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, active = true, revoked_at = NULL
       RETURNING id`,
      [deviceId, user.userId, input.platform, encryptedToken.ciphertext, tokenHmac],
    );
    const storedId = result.rows[0]?.id;
    if (!storedId) throw new Error('notification_device_not_recorded');
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'profile.notification_device_registered', category: 'account',
      title: 'You registered a notification device',
      explanation: 'A notification delivery endpoint was registered securely; the raw token is never shown in activity history.',
      objectType: 'notification_device', objectId: storedId,
      metadata: { changedField: 'notification_device' },
    });
    return storedId;
  });
  return privateResponse(request, env, { id: stored, platform: input.platform }, { status: 201 });
}

async function reputationSummary(request: Request, env: Env, userId: string, privateView: boolean): Promise<Response> {
  const result = await query<{
    current_level: number;
    policy_version: string;
    status: string;
    accountability_score: string;
    contribution_score: string;
    conduct_score: string;
    sourcing_score: string;
    authenticity_score: string;
    review_reliability_score: string;
    promotion_blockers: unknown[];
    evaluated_at: string;
  }>(env.DB_APP_FRESH,
    `SELECT current_level, policy_version, status, accountability_score::text, contribution_score::text,
            conduct_score::text, sourcing_score::text, authenticity_score::text,
            review_reliability_score::text, promotion_blockers, evaluated_at
       FROM trust.reputation_profiles WHERE user_id = $1`, [userId]);
  const profile = result.rows[0];
  const level = Number(profile?.current_level ?? 0);
  const levelName = REPUTATION_POLICY.levels.find((candidate) => candidate.level === level)?.name ?? 'New';
  const payload: Record<string, unknown> = {
    userId,
    level,
    reputationLevel: level,
    levelName,
    reputationStatus: profile?.status ?? 'active',
    reputationBand: reputationBand(level),
    policyVersion: profile?.policy_version ?? REPUTATION_POLICY.version,
  };
  if (privateView) Object.assign(payload, {
    pillars: {
      accountability: Number(profile?.accountability_score ?? 0),
      contribution: Number(profile?.contribution_score ?? 0),
      conduct: Number(profile?.conduct_score ?? 0),
      sourcing: Number(profile?.sourcing_score ?? 0),
      authenticity: Number(profile?.authenticity_score ?? 0),
      reviewReliability: Number(profile?.review_reliability_score ?? 0),
    },
    promotionBlockers: profile?.promotion_blockers ?? [],
    evaluatedAt: profile?.evaluated_at ?? null,
  });
  return privateView ? privateResponse(request, env, payload) : response(request, env, payload);
}

async function reputationLedger(request: Request, env: Env, user: Principal): Promise<Response> {
  const page = pageRequest(new URL(request.url), 100);
  const result = await query<{ id: string; createdAt: string }>(env.DB_APP_FRESH,
    `SELECT id, content_id AS "contentId", event_type AS "eventType", pillar, impact::text,
            status, explanation_code AS "explanationCode", policy_version AS "policyVersion",
            appeal_id AS "appealId", effective_at AS "effectiveAt", created_at AS "createdAt"
       FROM trust.reputation_events WHERE subject_user_id = $1
        AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
      ORDER BY created_at DESC, id DESC LIMIT $4`,
    [user.userId, page.cursor?.timestamp ?? null, page.cursor?.id ?? null, page.limit + 1]);
  const hasMore = result.rows.length > page.limit;
  const items = result.rows.slice(0, page.limit);
  const tail = items.at(-1);
  const nextCursor = hasMore && tail ? encodeCursor({ timestamp: tail.createdAt, id: tail.id }) : null;
  return privateResponse(request, env, { items, entries: items, nextCursor });
}

async function activityLog(request: Request, env: Env, user: Principal): Promise<Response> {
  const url = new URL(request.url);
  const page = pageRequest(url, 100);
  const category = url.searchParams.get('category') ?? undefined;
  if (category && !['account', 'content', 'social', 'reputation', 'moderation', 'appeals', 'privacy', 'rewards'].includes(category)) {
    throw new Error('invalid_activity_category');
  }
  const result = await transaction(env.DB_APP_FRESH, (client) => listUserActivity(client, user.userId, {
    limit: page.limit,
    cursor: page.cursor ? { createdAt: page.cursor.timestamp, id: page.cursor.id } : undefined,
    category,
  }));
  const nextCursor = result.nextCursor ? encodeCursor({ timestamp: result.nextCursor.createdAt, id: result.nextCursor.id }) : null;
  return privateResponse(request, env, { items: result.items, entries: result.items, nextCursor });
}

async function rewardsSnapshot(request: Request, env: Env, user: Principal): Promise<Response> {
  const tier = await tierForUser(env, user.userId);
  const [reputation, account, history] = await Promise.all([
    query<{ current_level: number }>(env.DB_APP_FRESH, `SELECT current_level FROM trust.reputation_profiles WHERE user_id = $1`, [user.userId]),
    query<{ created_at: string }>(env.DB_APP_FRESH, `SELECT created_at FROM identity.users WHERE id = $1`, [user.userId]),
    query<{ id: string; reward_id: string; reward_level: number; reward_title: string; redeemed_at: string; status: string }>(env.DB_APP_FRESH,
      `SELECT id, reward_id, reward_level, reward_title, redeemed_at, status
       FROM trust.reward_redemptions WHERE user_id = $1 ORDER BY redeemed_at DESC`, [user.userId]),
  ]);
  const reputationLevel = Number(reputation.rows[0]?.current_level ?? 0);
  const accountAgeMs = Date.now() - new Date(account.rows[0]?.created_at ?? Date.now()).getTime();
  const mature = accountAgeMs >= 7 * 24 * 60 * 60 * 1000;
  const redeemed = new Set(history.rows.map((item) => item.reward_id));
  const offers = REWARD_CATALOG.map((offer) => {
    const locked = !mature || offer.rewardLevel > reputationLevel || offer.rewardLevel > REWARD_ACCESS_POLICY.maximumReputationLevel;
    return {
      ...offer,
      locked,
      lockReason: !mature ? 'Account maturity requirement not met.'
        : offer.rewardLevel > reputationLevel ? 'Reputation level requirement not met.'
          : offer.rewardLevel > REWARD_ACCESS_POLICY.maximumReputationLevel ? 'Reward level is not available.' : undefined,
      redeemed: redeemed.has(offer.id),
    };
  });
  return privateResponse(request, env, {
    subscriptionTier: tier,
    reputationLevel,
    reputationBand: reputationLevel >= 4 ? 'high' : reputationLevel >= 2 ? 'established' : 'new',
    availableRewardLevels: Array.from({ length: REWARD_ACCESS_POLICY.maximumReputationLevel }, (_, index) => index + 1),
    maxOptionsPerLevel: REWARD_ACCESS_POLICY.maximumOptionsPerLevel ?? REWARD_CATALOG.length,
    redemptionStatus: mature ? 'active' : 'restricted',
    fraudRiskStatus: 'normal',
    offers,
    redemptionHistory: history.rows,
    affiliateDisclosure: 'Reward availability and partner relationships are disclosed before redemption.',
  });
}

async function redeemReward(request: Request, env: Env, user: Principal, rewardId: string): Promise<Response> {
  const offer = REWARD_CATALOG.find((candidate) => candidate.id === rewardId);
  if (!offer) throw new Error('reward_not_found');
  const reputation = await query<{ current_level: number; created_at: string }>(env.DB_APP_FRESH,
    `SELECT COALESCE(profile.current_level, 0)::integer AS current_level, users.created_at
       FROM identity.users users LEFT JOIN trust.reputation_profiles profile ON profile.user_id = users.id
      WHERE users.id = $1`, [user.userId]);
  const level = Number(reputation.rows[0]?.current_level ?? 0);
  const mature = Date.now() - new Date(reputation.rows[0]?.created_at ?? Date.now()).getTime() >= 7 * 24 * 60 * 60 * 1000;
  if (!mature || offer.rewardLevel > level || offer.rewardLevel > REWARD_ACCESS_POLICY.maximumReputationLevel) throw new Error('reward_locked');
  const redemptionId = uuidv7();
  const sourceEventId = uuidv7();
  await transaction(env.DB_APP_FRESH, async (client) => {
    const result = await client.query(
      `INSERT INTO trust.reward_redemptions (id, user_id, reward_id, reward_level, reward_title)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, reward_id) DO NOTHING RETURNING redeemed_at`,
      [redemptionId, user.userId, offer.id, offer.rewardLevel, offer.title]);
    if (result.rowCount !== 1) throw new Error('reward_already_redeemed');
    await writeActivity(client, request, user, sourceEventId, {
      eventType: 'rewards.reward_redeemed', category: 'rewards', title: 'You redeemed a reward',
      explanation: 'The reward was redeemed based on your authoritative reputation eligibility.',
      objectType: 'reward_redemption', objectId: redemptionId, metadata: { rewardId: offer.id },
    });
  });
  return privateResponse(request, env, { id: redemptionId, rewardId: offer.id, rewardLevel: offer.rewardLevel, rewardTitle: offer.title, status: 'redeemed' }, { status: 201 });
}

async function getPersonalFeed(request: Request, env: Env, user: Principal): Promise<Response> {
  const page = pageRequest(new URL(request.url));
  const result = await query<FeedResponseCandidate & { id: string; cursor_timestamp: string }>(env.DB_APP_FRESH,
    `SELECT p.id, p.author_id AS "authorId", p.body, p.declared_creation_mode AS "declaredCreationMode",
            p.visibility, p.moderation_state AS "moderationState", p.geo_scope AS "geoScope",
            p.place_id AS "placeId", p.published_at AS "publishedAt", p.created_at AS "createdAt",
            declaration.public_label AS "publicLabel", (p.deleted_at IS NOT NULL) AS "feedItemDeleted",
            COALESCE((SELECT jsonb_object_agg(counted.reaction_type, counted.reaction_count)
                        FROM (SELECT reaction.reaction_type, count(*)::integer AS reaction_count
                                FROM social.reactions reaction WHERE reaction.post_id = p.id
                                 AND reaction.reaction_type IN ('like', 'insightful', 'support')
                               GROUP BY reaction.reaction_type) counted), '{}'::jsonb) AS "reactionCounts",
            (SELECT reaction.reaction_type FROM social.reactions reaction
              WHERE reaction.user_id = $1 AND reaction.post_id = p.id
                AND reaction.reaction_type IN ('like', 'insightful', 'support') LIMIT 1) AS "viewerReaction",
            EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = p.author_id) OR (b.blocker_id = p.author_id AND b.blocked_id = $1)) AS "feedBlocked",
            EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $1 AND m.muted_id = p.author_id) AS "feedMuted",
            EXISTS (SELECT 1 FROM social.follows f WHERE f.follower_id = $1 AND f.followed_id = p.author_id) AS "feedFollowsAuthor",
            i.source, i.explanation_basis AS "explanationBasis", i.created_at AS cursor_timestamp
       FROM feed.user_inbox i
       JOIN content.posts p ON p.id = i.post_id
       JOIN identity.users author ON author.id = p.author_id AND author.status = 'active'
       JOIN content.content_declarations declaration ON declaration.post_id = p.id
      WHERE i.user_id = $1 AND p.deleted_at IS NULL AND p.moderation_state = 'allowed'
        AND declaration.public_label IN ('Human-authored', 'AI-assisted')
        AND (p.visibility = 'public' OR p.author_id = $1 OR (p.visibility = 'followers' AND EXISTS (
          SELECT 1 FROM social.follows f WHERE f.follower_id = $1 AND f.followed_id = p.author_id
        )))
        AND NOT EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = p.author_id) OR (b.blocker_id = p.author_id AND b.blocked_id = $1))
        AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $1 AND m.muted_id = p.author_id)
        AND ($2::timestamptz IS NULL OR (i.created_at, p.id) < ($2::timestamptz, $3::uuid))
      ORDER BY i.created_at DESC, p.id DESC LIMIT $4`, [user.userId, page.cursor?.timestamp ?? null, page.cursor?.id ?? null, page.limit + 1]);
  assertFeedResponseCandidates(result.rows, user);
  const hasMore = result.rows.length > page.limit;
  const items = result.rows.slice(0, page.limit);
  const tail = items.at(-1);
  return feedResponse(request, env, { items: presentFeedItems(items), nextCursor: hasMore && tail ? encodeCursor({ timestamp: tail.cursor_timestamp, id: tail.id }) : null }, 'personal', true);
}

async function getPost(request: Request, env: Env, postId: string, viewer?: Principal): Promise<Response> {
  const result = await query<FeedResponseCandidate & { id: string }>(env.DB_APP_FRESH,
    `SELECT p.id, p.author_id AS "authorId", p.body, p.declared_creation_mode AS "declaredCreationMode",
            p.visibility, p.moderation_state AS "moderationState", p.geo_scope AS "geoScope",
            p.place_id AS "placeId", p.published_at AS "publishedAt", p.created_at AS "createdAt",
            declaration.public_label AS "publicLabel", (p.deleted_at IS NOT NULL) AS "feedItemDeleted",
            COALESCE((SELECT jsonb_object_agg(counted.reaction_type, counted.reaction_count)
                        FROM (SELECT reaction.reaction_type, count(*)::integer AS reaction_count
                                FROM social.reactions reaction WHERE reaction.post_id = p.id
                                 AND reaction.reaction_type IN ('like', 'insightful', 'support')
                               GROUP BY reaction.reaction_type) counted), '{}'::jsonb) AS "reactionCounts",
            (SELECT reaction.reaction_type FROM social.reactions reaction
              WHERE reaction.user_id = $2 AND reaction.post_id = p.id
                AND reaction.reaction_type IN ('like', 'insightful', 'support') LIMIT 1) AS "viewerReaction",
            EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = p.author_id) OR (b.blocker_id = p.author_id AND b.blocked_id = $2)) AS "feedBlocked",
            false AS "feedMuted",
            EXISTS (SELECT 1 FROM social.follows f WHERE f.follower_id = $2 AND f.followed_id = p.author_id) AS "feedFollowsAuthor"
       FROM content.posts p
       JOIN identity.users author ON author.id = p.author_id AND author.status = 'active'
       JOIN content.content_declarations declaration ON declaration.post_id = p.id
      WHERE p.id = $1 AND p.deleted_at IS NULL AND p.moderation_state = 'allowed'
        AND declaration.public_label IN ('Human-authored', 'AI-assisted')
        AND (p.visibility = 'public' OR p.author_id = $2 OR (p.visibility = 'followers' AND EXISTS (
          SELECT 1 FROM social.follows f WHERE f.follower_id = $2 AND f.followed_id = p.author_id
        )))
        AND ($2::uuid IS NULL OR NOT EXISTS (
          SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = p.author_id) OR (b.blocker_id = p.author_id AND b.blocked_id = $2)
        ))`, [postId, viewer?.userId ?? null]);
  if (!result.rows[0]) throw new Error('post_not_found');
  assertFeedResponseCandidates(result.rows, viewer);
  return feedResponse(request, env, { post: presentFeedItems(result.rows)[0] }, 'post', Boolean(viewer));
}

async function getComments(request: Request, env: Env, postId: string, viewer?: Principal): Promise<Response> {
  const page = pageRequest(new URL(request.url), 100);
  const result = await query<Omit<CommentFeedResponseCandidate, 'publicLabel'> & { id: string; createdAt: string; declaredCreationMode: unknown }>(env.DB_APP_FRESH,
    `SELECT comment.id, comment.author_id AS "authorId", comment.parent_id AS "parentId",
            CASE WHEN comment.deleted_at IS NULL THEN comment.body ELSE NULL END AS body,
            comment.depth, comment.declared_creation_mode AS "declaredCreationMode",
            comment.moderation_state AS "moderationState",
            (comment.deleted_at IS NOT NULL) AS deleted, comment.created_at AS "createdAt", comment.updated_at AS "updatedAt",
            post.visibility AS "feedPostVisibility", post.moderation_state AS "feedPostModerationState", (post.deleted_at IS NOT NULL) AS "feedPostDeleted",
            (post.author_id = $2) AS "feedViewerIsPostAuthor",
            EXISTS (SELECT 1 FROM social.follows f WHERE f.follower_id = $2 AND f.followed_id = post.author_id) AS "feedFollowsPostAuthor",
            EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = comment.author_id) OR (b.blocker_id = comment.author_id AND b.blocked_id = $2)) AS "feedBlockedCommentAuthor",
            EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $2 AND m.muted_id = comment.author_id) AS "feedMutedCommentAuthor"
       FROM content.comments comment
       JOIN content.posts post ON post.id = comment.post_id
       JOIN identity.users author ON author.id = comment.author_id AND author.status = 'active'
      WHERE comment.post_id = $1 AND comment.moderation_state = 'allowed'
        AND post.deleted_at IS NULL AND post.moderation_state = 'allowed'
        AND (post.visibility = 'public' OR post.author_id = $2 OR (post.visibility = 'followers' AND EXISTS (
          SELECT 1 FROM social.follows f WHERE f.follower_id = $2 AND f.followed_id = post.author_id
        )))
        AND ($2::uuid IS NULL OR (
          NOT EXISTS (SELECT 1 FROM social.blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = comment.author_id) OR (b.blocker_id = comment.author_id AND b.blocked_id = $2))
          AND NOT EXISTS (SELECT 1 FROM social.mutes m WHERE m.muter_id = $2 AND m.muted_id = comment.author_id)
        ))
        AND ($3::timestamptz IS NULL OR (comment.created_at, comment.id) > ($3::timestamptz, $4::uuid))
      ORDER BY comment.created_at ASC, comment.id ASC LIMIT $5`,
    [postId, viewer?.userId ?? null, page.cursor?.timestamp ?? null, page.cursor?.id ?? null, page.limit + 1]);
  const candidates = result.rows.map((item) => ({ ...item, publicLabel: commentPublicLabel(item.declaredCreationMode) }));
  assertCommentFeedResponseCandidates(candidates, viewer);
  const hasMore = candidates.length > page.limit;
  const items = candidates.slice(0, page.limit);
  const tail = items.at(-1);
  return feedResponse(request, env, { items: presentCommentFeedItems(items), nextCursor: hasMore && tail ? encodeCursor({ timestamp: tail.createdAt, id: tail.id }) : null }, 'comments', Boolean(viewer));
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
          workerVersionId: env.WORKER_VERSION.id,
          releaseTag: env.WORKER_VERSION.tag,
          ...databaseReadinessResponse(identity, env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true'),
        });
      }
      if (request.method === 'GET' && (url.pathname === '/ready' || url.pathname === '/api/ready')) {
        await query(env.DB_APP_FRESH, 'SELECT 1 AS ready');
        return response(request, env, { status: 'ready', service: 'lythaus-public-api' });
      }
      if (request.method === 'GET' && url.pathname === '/.well-known/jwks.json') return new Response(env.JWT_PUBLIC_JWKS ?? '{"keys":[]}', { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' } });
      if (request.method === 'POST' && url.pathname === '/api/waitlist') return await waitlistRoute(request, env);
      if (url.pathname === '/api/waitlist') return await waitlistRoute(request, env);
      const rateLimit = rateLimitPlan(url.pathname);
      await enforceRateLimit(request, env, rateLimit.scope, rateLimit.limit);
      if (request.method === 'GET' && url.pathname === '/api/feed/discover') {
        const user = request.headers.has('authorization') ? await principal(request, env) : undefined;
        return await discoveryFeed(request, env, user);
      }
      if (request.method === 'GET' && (url.pathname === '/api/feed/news' || url.pathname === '/api/news-board')) {
        return await getNewsBoard(request, env, await principal(request, env));
      }
      if (request.method === 'GET' && url.pathname === '/api/feed') return await getPersonalFeed(request, env, await principal(request, env));
      const post = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
      if (request.method === 'GET' && post) {
        const user = request.headers.has('authorization') ? await principal(request, env) : undefined;
        return await getPost(request, env, post[1], user);
      }
      if ((request.method === 'PUT' || request.method === 'PATCH') && post) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'post.update', () => updatePost(request, env, user, post[1]), request.method === 'PUT');
      }
      if (request.method === 'DELETE' && post) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'post.delete', () => deletePost(request, env, user, post[1]), true);
      }
      const comments = url.pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
      if (request.method === 'GET' && comments) {
        const user = request.headers.has('authorization') ? await principal(request, env) : undefined;
        return await getComments(request, env, comments[1], user);
      }
      if (request.method === 'POST' && comments) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'comment.create', () => createComment(request, env, user, comments[1]));
      }
      const commentItem = url.pathname.match(/^\/api\/comments\/([^/]+)$/);
      if ((request.method === 'PUT' || request.method === 'PATCH') && commentItem) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'comment.update', () => updateComment(request, env, user, commentItem[1]));
      }
      if (request.method === 'DELETE' && commentItem) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'comment.delete', () => deleteComment(request, env, user, commentItem[1]));
      }
      if (request.method === 'GET' && url.pathname === '/api/users/me') return await getUserProfile(request, env, (await principal(request, env)).userId, true);
      if ((request.method === 'PUT' || request.method === 'PATCH') && url.pathname === '/api/users/me') {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'profile.update', () => updateProfile(request, env, user));
      }
      const publicProfile = url.pathname.match(/^\/api\/users\/([^/]+)$/);
      if (request.method === 'GET' && publicProfile) return await getUserProfile(request, env, publicProfile[1]);
      if (request.method === 'GET' && url.pathname === '/api/subscription/status') return await getEntitlements(request, env, await principal(request, env));
      if (url.pathname === '/api/custom-feeds') {
        const user = await principal(request, env);
        if (request.method === 'GET') return await listCustomFeeds(request, env, user);
        if (request.method === 'POST') return await idempotentMutation(request, env, user.userId, 'custom-feed.create', () => createCustomFeed(request, env, user));
      }
      const customFeedItemsRoute = url.pathname.match(/^\/api\/custom-feeds\/([^/]+)\/items$/);
      if (request.method === 'GET' && customFeedItemsRoute) return await customFeedItems(request, env, await principal(request, env), customFeedItemsRoute[1]);
      const customFeedRoute = url.pathname.match(/^\/api\/custom-feeds\/([^/]+)$/);
      if (customFeedRoute && ['GET', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        const user = await principal(request, env);
        if (request.method === 'GET') return await customFeed(request, env, user, customFeedRoute[1]);
        return await idempotentMutation(request, env, user.userId, `custom-feed.${request.method.toLowerCase()}`, () => customFeed(request, env, user, customFeedRoute[1]));
      }
      if (request.method === 'POST' && (url.pathname === '/api/follows' || url.pathname === '/api/users/follow')) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'follow.create', () => createFollow(request, env, user));
      }
      if (request.method === 'DELETE' && url.pathname.match(/^\/api\/follows\/([^/]+)$/)) {
        const user = await principal(request, env);
        const followedId = url.pathname.match(/^\/api\/follows\/([^/]+)$/)?.[1] ?? '';
        return await idempotentMutation(request, env, user.userId, 'follow.delete', () => removeFollow(request, env, user, followedId));
      }
      const userFollow = url.pathname.match(/^\/api\/users\/([^/]+)\/follow$/);
      if (userFollow && ['GET', 'POST', 'DELETE'].includes(request.method)) {
        const user = await principal(request, env);
        if (request.method === 'GET') return await followStatus(request, env, user, userFollow[1]);
        if (request.method === 'POST') return await idempotentMutation(request, env, user.userId, 'follow.create', () => createFollow(request, env, user, userFollow[1]));
        return await idempotentMutation(request, env, user.userId, 'follow.delete', () => removeFollow(request, env, user, userFollow[1]));
      }
      if (request.method === 'GET' && url.pathname === '/api/blocks') return await relationshipList(request, env, await principal(request, env), 'blocks');
      if (request.method === 'POST' && (url.pathname === '/api/blocks' || url.pathname === '/api/users/block')) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'block.create', async () => {
          const input = await readJson<{ userId?: string }>(request, 8 * 1024);
          return setBlock(request, env, user, input.userId ?? '', true);
        });
      }
      const block = url.pathname.match(/^\/api\/blocks\/([^/]+)$/);
      if (request.method === 'DELETE' && block) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'block.delete', () => setBlock(request, env, user, block[1], false));
      }
      if (request.method === 'POST' && (url.pathname === '/api/mutes' || url.pathname === '/api/users/mute')) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'mute.create', async () => {
          const input = await readJson<{ userId?: string }>(request, 8 * 1024);
          return setMute(request, env, user, input.userId ?? '', true);
        });
      }
      const mute = url.pathname.match(/^\/api\/mutes\/([^/]+)$/);
      if (request.method === 'DELETE' && mute) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'mute.delete', () => setMute(request, env, user, mute[1], false));
      }
      if (request.method === 'GET' && url.pathname === '/api/mutes') return await relationshipList(request, env, await principal(request, env), 'mutes');
      if (request.method === 'GET' && url.pathname === '/api/bookmarks') return await relationshipList(request, env, await principal(request, env), 'bookmarks');
      if (request.method === 'POST' && url.pathname === '/api/bookmarks') {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'bookmark.create', async () => {
          const input = await readJson<{ postId?: string }>(request, 8 * 1024);
          return setBookmark(request, env, user, input.postId ?? '', true);
        });
      }
      const bookmark = url.pathname.match(/^\/api\/bookmarks\/([^/]+)$/);
      if (request.method === 'DELETE' && bookmark) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'bookmark.delete', () => setBookmark(request, env, user, bookmark[1], false));
      }
      const reaction = url.pathname.match(/^\/api\/posts\/([^/]+)\/reactions$/);
      if ((request.method === 'POST' || request.method === 'PUT') && reaction) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'reaction.create', () => createReaction(request, env, user, reaction[1]));
      }
      if (request.method === 'DELETE' && reaction) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'reaction.delete', () => removeReaction(request, env, user, reaction[1]));
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
      const appealVote = url.pathname.match(/^\/api\/appeals\/([^/]+)\/vote$/);
      if (request.method === 'POST' && appealVote) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'appeal.vote', () => submitAppealVote(request, env, user, appealVote[1]), true);
      }
      const appealRecusal = url.pathname.match(/^\/api\/appeals\/([^/]+)\/recuse$/);
      if (request.method === 'POST' && appealRecusal) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'appeal.recuse', () => recuseAppealReview(request, env, user, appealRecusal[1]), true);
      }
      if (request.method === 'GET' && url.pathname === '/api/appeals/reviewer/assignments') return await reviewerAssignments(request, env, await principal(request, env));
      if (request.method === 'GET' && url.pathname === '/api/reputation/me') {
        const user = await principal(request, env);
        return await reputationSummary(request, env, user.userId, true);
      }
      if (request.method === 'GET' && url.pathname === '/api/reputation/me/ledger') return await reputationLedger(request, env, await principal(request, env));
      if (request.method === 'GET' && (url.pathname === '/api/activity' || url.pathname === '/api/users/me/activity')) return await activityLog(request, env, await principal(request, env));
      const reputationUser = url.pathname.match(/^\/api\/reputation\/(?:users|user)\/([^/]+)$/);
      if (request.method === 'GET' && reputationUser) return await reputationSummary(request, env, reputationUser[1], false);
      if (request.method === 'GET' && url.pathname === '/api/rewards/me') return await rewardsSnapshot(request, env, await principal(request, env));
      const rewardRedeem = url.pathname.match(/^\/api\/rewards\/([^/]+)\/redeem$/);
      if (request.method === 'POST' && rewardRedeem) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'reward.redeem', () => redeemReward(request, env, user, rewardRedeem[1]));
      }
      if (request.method === 'GET' && url.pathname === '/api/notifications') return await notifications(request, env, await principal(request, env));
      if (request.method === 'GET' && url.pathname === '/api/notifications/unread-count') {
        const user = await principal(request, env);
        const result = await query<{ count: string }>(env.DB_APP_FRESH,
          `SELECT count(*)::text AS count FROM feed.notifications WHERE recipient_id = $1 AND read_at IS NULL AND dismissed_at IS NULL`, [user.userId]);
        const unreadCount = Number(result.rows[0]?.count ?? 0);
        return privateResponse(request, env, { count: unreadCount, unreadCount });
      }
      const notificationRoute = url.pathname.match(/^\/api\/notifications\/([^/]+)\/(read|dismiss)$/);
      if (request.method === 'POST' && notificationRoute) {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, `notification.${notificationRoute[2]}`, () => notificationAction(request, env, user, notificationRoute[1], notificationRoute[2] as 'read' | 'dismiss'));
      }
      if (url.pathname === '/api/notifications/preferences' && ['GET', 'PUT', 'PATCH'].includes(request.method)) {
        const user = await principal(request, env);
        if (request.method === 'GET') return await notificationPreferences(request, env, user);
        return await idempotentMutation(request, env, user.userId, `notification.preferences.${request.method.toLowerCase()}`, () => notificationPreferences(request, env, user));
      }
      if (url.pathname === '/api/notifications/devices' && ['GET', 'POST'].includes(request.method)) return await notificationDevices(request, env, await principal(request, env));
      const notificationDeviceRevoke = url.pathname.match(/^\/api\/notifications\/devices\/([^/]+)\/revoke$/);
      if (request.method === 'POST' && notificationDeviceRevoke) {
        const user = await principal(request, env);
        await transaction(env.DB_APP_FRESH, async (client) => {
          const result = await client.query(
            `UPDATE feed.notification_devices SET active = false, revoked_at = now() WHERE id = $1 AND user_id = $2 AND active = true RETURNING id`,
            [notificationDeviceRevoke[1], user.userId]);
          if (result.rowCount !== 1) throw new Error('notification_device_not_found');
          await writeActivity(client, request, user, notificationDeviceRevoke[1], {
            eventType: 'profile.notification_device_revoked', category: 'account',
            title: 'You revoked a notification device',
            explanation: 'The selected notification delivery endpoint was disabled.',
            objectType: 'notification_device', objectId: notificationDeviceRevoke[1],
            metadata: { changedField: 'notification_device' },
          });
        });
        return privateResponse(request, env, { id: notificationDeviceRevoke[1], revoked: true });
      }
      if (request.method === 'GET' && url.pathname === '/api/privacy/requests') {
        return await getPrivacyRequestStatus(request, env, await principal(request, env));
      }
      const privacyExport = url.pathname.match(/^\/api\/privacy\/requests\/([^/]+)\/export$/);
      if (request.method === 'GET' && privacyExport) {
        return await downloadPrivacyExport(request, env, await principal(request, env), privacyExport[1]);
      }
      if (request.method === 'POST' && url.pathname === '/api/privacy/requests') {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'privacy.request.create', () => createPrivacyRequest(request, env, user));
      }
      if (request.method === 'GET' && url.pathname === '/api/storage/usage') return await getStorage(request, env, await principal(request, env));
      if (request.method === 'PUT' && url.pathname === '/api/users/me/region') {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'region.update', () => updateRegionPreferences(request, env, user), true);
      }
      if (request.method === 'PUT' && url.pathname === '/api/users/me/retention') {
        const user = await principal(request, env);
        return await idempotentMutation(request, env, user.userId, 'retention.update', () => updateRetentionRule(request, env, user), true);
      }
      if (request.method === 'GET' && url.pathname === '/api/auth/userinfo') return await getUserInfo(request, env, (await principal(request, env)).userId);
      if (url.pathname === '/api/auth/email' || url.pathname.startsWith('/api/auth/email/verify') || url.pathname.startsWith('/api/auth/password/reset')) {
        if (env.EMAIL_PROVIDER_MODE === 'disabled') return response(request, env, { error: 'provider_unavailable', provider: 'email', correlationId: id }, { status: 404 });
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/email') return await emailAuth(request, env);
      if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/api/auth/email/verify') return await verifyEmail(request, env);
      if (request.method === 'POST' && url.pathname === '/api/auth/password/reset/request') return await requestPasswordReset(request, env);
      if (request.method === 'POST' && url.pathname === '/api/auth/password/reset/complete') return await completePasswordReset(request, env);
      if (request.method === 'POST' && url.pathname === '/api/auth/refresh') return await refreshSession(request, env);
      if (request.method === 'POST' && url.pathname === '/api/auth/logout') return await logout(request, env);
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
      if (url.pathname.startsWith('/api/video') || url.pathname.startsWith('/api/payments') || url.pathname.startsWith('/api/federation')) {
        return response(request, env, { error: 'feature_disabled', correlationId: id }, { status: 404 });
      }
      return response(request, env, { error: 'not_found', correlationId: id }, { status: 404 });
    } catch (error) {
      const classified = classifyPublicError(error);
      logEvent({
        service: 'lythaus-public-api',
        correlationId: id,
        errorCode: classified.exposedCode,
        internalErrorCode: classified.internalCode,
        route: new URL(request.url).pathname,
      });
      return privateResponse(request, env, { error: classified.exposedCode, correlationId: id }, { status: classified.status });
    }
  },
};
