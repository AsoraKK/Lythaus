import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import {
  classifyPublicError,
  idempotencyKey,
  isCurrentActivePrincipal,
  normalizeEmailAddress,
  planEmailLogin,
  planEmailRegistration,
  planExistingIdempotencyRecord,
  prepareEmailAuthAttempt,
  rateLimitPlan,
  requireAuthSecrets,
  requireRefreshToken,
  requireResetPassword,
  requireToken,
  requiresTurnstileVerification,
} from '../src/auth-runtime-policy.ts';

const secrets = {
  AUTH_PASSWORD_PEPPER_V1: 'pepper',
  PII_ENCRYPTION_KEY_V1: 'encryption-key',
  PII_HMAC_KEY_V1: 'hmac-key',
  JWT_PRIVATE_KEY: 'private-key',
  JWT_KEY_ID: 'key-v1',
};

test('classifies public runtime errors into stable safe responses', () => {
  assert.deepEqual(classifyPublicError(new Error('authentication_required')), {
    exposedCode: 'authentication_required', internalCode: 'authentication_required', status: 401,
  });
  assert.equal(classifyPublicError(new Error('social_interaction_not_allowed')).status, 403);
  assert.equal(classifyPublicError(new Error('post_not_found')).status, 404);
  assert.equal(classifyPublicError(new Error('idempotency_key_conflict')).status, 409);
  assert.equal(classifyPublicError(new Error('request_too_large')).status, 413);
  assert.equal(classifyPublicError(new Error('post_daily_limit_reached')).status, 429);
  assert.equal(classifyPublicError(new Error('email_delivery_failed')).status, 502);
  assert.equal(classifyPublicError(new Error('email_delivery_failed_503')).status, 502);
  assert.equal(classifyPublicError(new Error('turnstile_unavailable')).status, 503);
  assert.equal(classifyPublicError(new Error('waitlist_unavailable')).status, 503);
  assert.equal(classifyPublicError(new Error('method_not_allowed')).status, 405);
  assert.equal(classifyPublicError(new Error('unsupported_content_type')).status, 415);
  assert.equal(classifyPublicError(new Error('invalid_email')).status, 400);
  assert.deepEqual(classifyPublicError(new Error('database detail')), {
    exposedCode: 'request_failed', internalCode: 'unexpected_failure', status: 500,
  });
  assert.deepEqual(classifyPublicError('not-an-error'), {
    exposedCode: 'request_failed', internalCode: 'unexpected_failure', status: 500,
  });
});

test('normalizes email authentication attempts and rejects unsupported modes', () => {
  assert.equal(normalizeEmailAddress('  Person@Example.test '), 'person@example.test');
  assert.throws(() => normalizeEmailAddress('not-an-email'), /invalid_email/);
  assert.throws(() => normalizeEmailAddress(null), /invalid_email/);

  assert.deepEqual(prepareEmailAuthAttempt({
    mode: 'register', email: 'Person@Example.test', password: 'correct-horse-battery', turnstileToken: 'turnstile-token',
  }), {
    mode: 'register', email: 'person@example.test', password: 'correct-horse-battery', turnstileToken: 'turnstile-token',
  });
  assert.equal(prepareEmailAuthAttempt({ mode: 'resend_verification', email: 'person@example.test' }).mode, 'resend_verification');
  assert.throws(() => prepareEmailAuthAttempt({ mode: 'unknown', email: 'person@example.test', password: 'correct-horse-battery' }), /invalid_auth_mode/);
  assert.equal(prepareEmailAuthAttempt({ email: 'person@example.test', password: 'legacy-word!' }).mode, 'login');
  assert.throws(() => prepareEmailAuthAttempt({ mode: null, email: 'person@example.test', password: 'correct-horse-battery' }), /invalid_auth_mode/);
  assert.throws(() => prepareEmailAuthAttempt({ mode: 'login', email: 'person@example.test', password: '' }), /invalid_password/);
  assert.throws(() => prepareEmailAuthAttempt({ mode: 'register', email: 'person@example.test', password: 'x'.repeat(129) }), /invalid_password/);
});

test('creation and login use the shared code-point fixtures without normalization', () => {
  const policy = JSON.parse(fs.readFileSync(new URL('../../../packages/contracts/fixtures/password-policy.json', import.meta.url)));
  for (const fixture of policy.cases) {
    for (const [mode, allowed] of [['login', fixture.login], ['register', fixture.creation]]) {
      const attempt = () => prepareEmailAuthAttempt({ mode, email: 'fixture@example.test', password: fixture.password });
      if (allowed) assert.equal(attempt().password, fixture.password, fixture.name);
      else assert.throws(attempt, /invalid_password/, fixture.name);
    }
    if (fixture.creation) assert.equal(requireResetPassword(fixture.password), fixture.password);
    else assert.throws(() => requireResetPassword(fixture.password), /invalid_password/);
  }
  assert.equal(requireResetPassword('😀'.repeat(128)), '😀'.repeat(128));
  assert.throws(() => requireResetPassword('😀'.repeat(129)), /invalid_password/);
  for (const password of [null, {}, [], 12]) {
    assert.throws(() => prepareEmailAuthAttempt({ email: 'fixture@example.test', password }), /invalid_password/);
  }
  assert.equal(classifyPublicError(new Error('invalid_auth_mode')).status, 400);
});

test('recovers interrupted and migrated registrations without changing verified accounts', () => {
  assert.equal(planEmailRegistration(undefined), 'create_account');
  assert.equal(planEmailRegistration(undefined, { status: 'relink_required' }), 'attach_email_credential');
  assert.equal(planEmailRegistration(undefined, { status: 'active' }), 'attach_email_credential');
  assert.equal(planEmailRegistration(undefined, { status: 'locked' }), 'neutral_existing_account');
  assert.equal(planEmailRegistration({ status: 'active', verifiedAt: null }), 'resend_verification');
  assert.equal(planEmailRegistration({ status: 'locked', verifiedAt: null }), 'neutral_existing_account');
  assert.equal(planEmailRegistration({ status: 'active', verifiedAt: '2026-08-26T10:00:00.000Z' }), 'neutral_existing_account');
});

test('returns verification-required only after a valid password for pending email accounts', () => {
  assert.equal(planEmailLogin(undefined), 'invalid_credentials');
  assert.equal(planEmailLogin({ status: 'active', verifiedAt: null, passwordMatches: false }), 'invalid_credentials');
  assert.equal(planEmailLogin({ status: 'active', verifiedAt: null, passwordMatches: true }), 'email_verification_required');
  assert.equal(planEmailLogin({ status: 'relink_required', verifiedAt: null, passwordMatches: true }), 'email_verification_required');
  assert.equal(planEmailLogin({ status: 'suspended', verifiedAt: null, passwordMatches: true }), 'invalid_credentials');
  assert.equal(planEmailLogin({ status: 'active', verifiedAt: '2026-08-26T10:00:00.000Z', passwordMatches: true }), 'authenticated');
  assert.equal(planEmailLogin({ status: 'relink_required', verifiedAt: '2026-08-26T10:00:00.000Z', passwordMatches: true }), 'invalid_credentials');
});

test('enforces auth configuration, Turnstile, and credential boundaries', () => {
  assert.deepEqual(requireAuthSecrets(secrets), {
    pepper: 'pepper', encryptionKey: 'encryption-key', hmacKey: 'hmac-key', privateKey: 'private-key', keyId: 'key-v1',
  });
  assert.throws(() => requireAuthSecrets({ ...secrets, JWT_PRIVATE_KEY: '' }), /authentication_not_configured/);

  assert.equal(requiresTurnstileVerification('false', undefined, undefined), false);
  assert.equal(requiresTurnstileVerification('true', 'secret', 'valid-token'), true);
  assert.throws(() => requiresTurnstileVerification('true', '', 'valid-token'), /turnstile_required/);
  assert.throws(() => requiresTurnstileVerification('true', 'secret', 'short'), /turnstile_required/);

  assert.equal(requireToken('a'.repeat(32), 'verification_token_invalid'), 'a'.repeat(32));
  assert.throws(() => requireToken('short', 'verification_token_invalid'), /verification_token_invalid/);
  assert.throws(() => requireToken(undefined, 'reset_token_invalid'), /reset_token_invalid/);
  assert.equal(requireResetPassword('correct-horse-battery'), 'correct-horse-battery');
  assert.throws(() => requireResetPassword('short'), /invalid_password/);
  assert.throws(() => requireResetPassword('x'.repeat(129)), /invalid_password/);
  assert.equal(requireRefreshToken({ refresh_token: 'legacy' }), 'legacy');
  assert.equal(requireRefreshToken({ refreshToken: 'preferred', refresh_token: 'legacy' }), 'preferred');
  assert.throws(() => requireRefreshToken({}), /refresh_token_required/);
});

test('rejects stale access claims', () => {
  assert.equal(isCurrentActivePrincipal({ status: 'active', token_version: 7 }, 7), true);
  assert.equal(isCurrentActivePrincipal({ status: 'active', token_version: 8 }, 7), false);
  assert.equal(isCurrentActivePrincipal({ status: 'suspended', token_version: 7 }, 7), false);
  assert.equal(isCurrentActivePrincipal(undefined, 7), false);
});

test('selects bounded rate limits and idempotency replay state', () => {
  assert.deepEqual(rateLimitPlan('/api/auth/refresh'), { scope: 'auth:/api/auth/refresh', limit: 10 });
  assert.deepEqual(rateLimitPlan('/api/auth/email'), { scope: 'auth:/api/auth/email', limit: 10 });
  assert.deepEqual(rateLimitPlan('/api/posts'), { scope: 'public-api', limit: 120 });
  assert.equal(idempotencyKey(null), undefined);
  assert.equal(idempotencyKey(' abcdefgh '), 'abcdefgh');
  assert.throws(() => idempotencyKey('short'), /invalid_idempotency_key/);

  assert.deepEqual(planExistingIdempotencyRecord({
    actorId: 'actor-a', requestHash: 'hash-a',
    record: { actorId: 'actor-a', createdAt: '2026-08-11T10:00:00.000Z', response: { state: 'completed', requestHash: 'hash-a', status: 201, body: { created: true } } },
  }), { action: 'replay', status: 201, body: { created: true } });
  assert.deepEqual(planExistingIdempotencyRecord({
    actorId: 'actor-a', requestHash: 'hash-a',
    record: { actorId: 'actor-a', createdAt: '2026-08-11T10:00:00.000Z', response: { state: 'completed', requestHash: 'hash-a' } },
  }), { action: 'replay', status: 200, body: null });
  assert.deepEqual(planExistingIdempotencyRecord({
    actorId: 'actor-a', requestHash: 'hash-a',
    nowMs: Date.parse('2026-08-11T10:04:59.000Z'),
    record: { actorId: 'actor-a', createdAt: '2026-08-11T10:00:00.000Z', response: { state: 'processing', requestHash: 'hash-a' } },
  }), { action: 'in_progress' });
  assert.deepEqual(planExistingIdempotencyRecord({
    actorId: 'actor-a', requestHash: 'hash-a',
    nowMs: Date.parse('2026-08-11T10:05:00.000Z'),
    record: { actorId: 'actor-a', createdAt: '2026-08-11T10:00:00.000Z', response: { state: 'processing', requestHash: 'hash-a' } },
  }), { action: 'quarantine' });
  assert.deepEqual(planExistingIdempotencyRecord({
    actorId: 'actor-a', requestHash: 'hash-a',
    record: { actorId: 'actor-a', createdAt: 'invalid', response: { state: 'processing', requestHash: 'hash-a' } },
  }), { action: 'quarantine' });
  assert.deepEqual(planExistingIdempotencyRecord({
    actorId: 'actor-a', requestHash: 'hash-a',
    record: { actorId: 'actor-a', createdAt: '2026-08-11T10:00:00.000Z', response: { state: 'outcome_unknown', requestHash: 'hash-a' } },
  }), { action: 'outcome_unknown' });
  assert.throws(() => planExistingIdempotencyRecord({ actorId: 'actor-a', requestHash: 'hash-a' }), /idempotency_key_conflict/);
  assert.throws(() => planExistingIdempotencyRecord({
    actorId: 'actor-a', requestHash: 'hash-a', record: { actorId: 'actor-b', createdAt: '2026-08-11T10:00:00.000Z', response: { state: 'processing', requestHash: 'hash-a' } },
  }), /idempotency_key_conflict/);
  assert.throws(() => planExistingIdempotencyRecord({
    actorId: 'actor-a', requestHash: 'hash-a', record: { actorId: 'actor-a', createdAt: '2026-08-11T10:00:00.000Z', response: { state: 'processing', requestHash: 'other' } },
  }), /idempotency_key_conflict/);
});
