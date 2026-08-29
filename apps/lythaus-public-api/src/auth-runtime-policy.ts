import { planCanonicalRegistration } from '@lythaus/contracts';

export type EmailAuthMode = 'register' | 'login' | 'resend_verification';

export interface EmailAuthAttempt {
  mode: EmailAuthMode;
  email: string;
  password: string;
  turnstileToken: unknown;
}

export type EmailRegistrationPlan = 'create_account' | 'attach_email_credential' | 'resend_verification' | 'neutral_existing_account';

export type EmailLoginPlan = 'invalid_credentials' | 'email_verification_required' | 'authenticated';

export interface AuthSecrets {
  pepper: string;
  encryptionKey: string;
  hmacKey: string;
  privateKey: string;
  keyId: string;
}

export interface IdempotencyRecord {
  state: 'processing' | 'completed' | 'outcome_unknown';
  requestHash: string;
  status?: number;
  body?: unknown;
}

export type ExistingIdempotencyPlan =
  | { action: 'replay'; status: number; body: unknown }
  | { action: 'in_progress' }
  | { action: 'quarantine' }
  | { action: 'outcome_unknown' };

const PUBLIC_ERROR_CODES = new Set([
  'account_exists', 'account_unavailable', 'admin_public_label_declaration_mismatch',
  'ai_assisted_character_limit_exceeded', 'ai_generated_public_content_blocked',
  'appeal_not_allowed', 'appeal_not_found', 'appeal_recusal_not_allowed',
  'appeal_statement_required', 'appeal_vote_invalid', 'appeal_vote_locked',
  'appeal_vote_not_allowed', 'authentication_not_configured', 'authentication_required',
  'case_id_required', 'checksum_required', 'comment_not_found',
  'custom_feed_limit_reached', 'custom_feed_not_found', 'email_delivery_failed', 'email_delivery_not_configured',
  'email_provider_mode_invalid', 'email_verification_required', 'export_not_configured',
  'export_cooldown_active', 'export_not_found', 'export_unavailable', 'feature_disabled',
  'idempotency_in_progress', 'idempotency_outcome_unknown',
  'idempotency_key_conflict', 'idempotency_key_required', 'invalid_accountability_name',
  'invalid_activity_category', 'invalid_bio', 'invalid_block', 'invalid_bookmark',
  'invalid_comment', 'invalid_comment_parent', 'invalid_credentials', 'invalid_cursor',
  'invalid_custom_feed', 'invalid_custom_feed_rule', 'invalid_custom_feed_rules',
  'invalid_display_name', 'invalid_email', 'invalid_flag', 'invalid_follow',
  'invalid_consent_version',
  'invalid_geo_scope', 'invalid_idempotency_key', 'invalid_json', 'invalid_mute',
  'invalid_notification_device', 'invalid_page_limit', 'invalid_password', 'invalid_post',
  'invalid_post_visibility', 'invalid_privacy_request', 'invalid_profile_visibility',
  'invalid_reaction', 'invalid_retention_content_type', 'invalid_retention_period',
  'invalid_visibility_level', 'invalid_countryCode', 'invalid_regionCode',
  'invalid_municipalityCode', 'media_signing_not_configured', 'media_size_exceeded',
  'news_board_not_entitled', 'notification_device_not_found',
  'notification_device_not_recorded', 'notification_not_found',
  'notification_preference_required', 'post_not_available', 'post_not_found',
  'privacy_request_active', 'profile_not_found', 'provider_unavailable', 'rate_limit_exceeded',
  'refresh_token_invalid', 'refresh_token_required', 'refresh_token_reuse',
  'relationship_change_limit_reached', 'request_too_large', 'reset_token_invalid',
  'reward_already_redeemed', 'reward_locked',
  'reward_not_found', 'self_reaction_not_allowed', 'social_interaction_not_allowed',
  'storage_quota_exceeded', 'storage_quota_not_configured', 'turnstile_failed',
  'turnstile_required', 'turnstile_unavailable', 'unsupported_media_type',
  'unsupported_content_type', 'method_not_allowed', 'waitlist_unavailable',
  'upload_checksum_invalid', 'upload_object_invalid', 'upload_session_invalid',
  'user_not_found', 'userinfo_unavailable', 'verification_token_invalid',
]);

export function classifyPublicError(error: unknown): { exposedCode: string; internalCode: string; status: number } {
  const internalCode = error instanceof Error ? error.message : 'non_error_thrown';
  const expected = PUBLIC_ERROR_CODES.has(internalCode)
    || /^(post|comment|reaction|appeal|flag|media)_daily_limit_reached$/.test(internalCode)
    || /^email_delivery_failed_[1-5][0-9]{2}$/.test(internalCode);
  const exposedCode = expected ? internalCode : 'request_failed';
  const status = exposedCode === 'request_failed' ? 500
    : ['authentication_required', 'invalid_credentials', 'refresh_token_invalid', 'refresh_token_reuse'].includes(exposedCode) ? 401
      : ['news_board_not_entitled', 'social_interaction_not_allowed', 'appeal_vote_not_allowed', 'appeal_recusal_not_allowed'].includes(exposedCode) ? 403
        : exposedCode === 'not_found' || exposedCode.endsWith('_not_found') ? 404
          : exposedCode === 'method_not_allowed' ? 405
            : ['idempotency_key_conflict', 'idempotency_in_progress', 'idempotency_outcome_unknown', 'appeal_vote_locked', 'appeal_already_resolved', 'account_exists', 'reward_already_redeemed'].includes(exposedCode) ? 409
            : exposedCode === 'request_too_large' ? 413
              : exposedCode === 'unsupported_content_type' ? 415
              : exposedCode === 'rate_limit_exceeded'
                  || exposedCode.endsWith('_daily_limit_reached')
                  || exposedCode === 'relationship_change_limit_reached'
                  || exposedCode === 'export_cooldown_active'
                  || exposedCode === 'privacy_request_active' ? 429
                : /^email_delivery_failed(?:_[1-5][0-9]{2})?$/.test(exposedCode) ? 502
                  : exposedCode.endsWith('_unavailable') || exposedCode.endsWith('_not_configured') ? 503 : 400;
  return { exposedCode, internalCode, status };
}

export function normalizeEmailAddress(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw new Error('invalid_email');
  return email;
}

export function prepareEmailAuthAttempt(input: {
  mode?: unknown;
  email?: unknown;
  password?: unknown;
  turnstileToken?: unknown;
}): EmailAuthAttempt {
  const mode: EmailAuthMode = input.mode === 'register' || input.mode === 'resend_verification'
    ? input.mode
    : 'login';
  const password = typeof input.password === 'string' ? input.password : '';
  if (mode !== 'resend_verification' && (password.length < 15 || password.length > 128)) {
    throw new Error('invalid_password');
  }
  return {
    mode,
    email: normalizeEmailAddress(input.email),
    password,
    turnstileToken: input.turnstileToken,
  };
}

export function planEmailRegistration(
  account: { status: string; verifiedAt: string | null } | undefined,
  contactAccount: { status: string } | undefined = undefined,
): EmailRegistrationPlan {
  return planCanonicalRegistration({ account, contactAccount });
}

export function planEmailLogin(
  account: { status: string; verifiedAt: string | null; passwordMatches: boolean } | undefined,
): EmailLoginPlan {
  if (!account || !account.passwordMatches) return 'invalid_credentials';
  if (!account.verifiedAt && (account.status === 'active' || account.status === 'relink_required')) {
    return 'email_verification_required';
  }
  return account.status === 'active' ? 'authenticated' : 'invalid_credentials';
}

export function requireAuthSecrets(input: {
  AUTH_PASSWORD_PEPPER_V1?: string;
  PII_ENCRYPTION_KEY_V1?: string;
  PII_HMAC_KEY_V1?: string;
  JWT_PRIVATE_KEY?: string;
  JWT_KEY_ID?: string;
}): AuthSecrets {
  if (!input.AUTH_PASSWORD_PEPPER_V1 || !input.PII_ENCRYPTION_KEY_V1 || !input.PII_HMAC_KEY_V1 || !input.JWT_PRIVATE_KEY || !input.JWT_KEY_ID) {
    throw new Error('authentication_not_configured');
  }
  return {
    pepper: input.AUTH_PASSWORD_PEPPER_V1,
    encryptionKey: input.PII_ENCRYPTION_KEY_V1,
    hmacKey: input.PII_HMAC_KEY_V1,
    privateKey: input.JWT_PRIVATE_KEY,
    keyId: input.JWT_KEY_ID,
  };
}

export function requiresTurnstileVerification(required: unknown, secret: unknown, token: unknown): boolean {
  if (required !== 'true') return false;
  if (typeof secret !== 'string' || !secret || typeof token !== 'string' || token.length < 10) {
    throw new Error('turnstile_required');
  }
  return true;
}

export function requireToken(value: unknown, errorCode: 'verification_token_invalid' | 'reset_token_invalid'): string {
  if (typeof value !== 'string' || value.length < 32) throw new Error(errorCode);
  return value;
}

export function requireResetPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 15 || value.length > 128) throw new Error('invalid_password');
  return value;
}

export function requireRefreshToken(input: { refreshToken?: unknown; refresh_token?: unknown }): string {
  const token = input.refreshToken ?? input.refresh_token;
  if (typeof token !== 'string' || token.length === 0) throw new Error('refresh_token_required');
  return token;
}

export function isCurrentActivePrincipal(
  account: { status: unknown; token_version: unknown } | undefined,
  claimedTokenVersion: unknown,
): boolean {
  return Boolean(account && account.status === 'active' && Number(account.token_version) === claimedTokenVersion);
}

export function rateLimitPlan(pathname: string): { scope: 'auth' | 'public-api'; limit: number } {
  return pathname.startsWith('/api/auth') ? { scope: 'auth', limit: 10 } : { scope: 'public-api', limit: 120 };
}

export function idempotencyKey(value: string | null): string | undefined {
  const key = value?.trim();
  if (!key) return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key)) throw new Error('invalid_idempotency_key');
  return key;
}

export function planExistingIdempotencyRecord(input: {
  record?: { actorId: string | null; response: IdempotencyRecord; createdAt: string };
  actorId: string;
  requestHash: string;
  nowMs?: number;
  outcomeUnknownAfterMs?: number;
}): ExistingIdempotencyPlan {
  const record = input.record;
  if (!record || record.actorId !== input.actorId || record.response.requestHash !== input.requestHash) {
    throw new Error('idempotency_key_conflict');
  }
  if (record.response.state === 'completed') {
    return { action: 'replay', status: record.response.status ?? 200, body: record.response.body ?? null };
  }
  if (record.response.state === 'outcome_unknown') return { action: 'outcome_unknown' };
  const createdAtMs = Date.parse(record.createdAt);
  const nowMs = input.nowMs ?? Date.now();
  const outcomeUnknownAfterMs = input.outcomeUnknownAfterMs ?? 5 * 60 * 1000;
  return Number.isFinite(createdAtMs) && nowMs - createdAtMs < outcomeUnknownAfterMs
    ? { action: 'in_progress' }
    : { action: 'quarantine' };
}
