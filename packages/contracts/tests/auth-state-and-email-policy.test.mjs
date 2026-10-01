import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_AUTH_STATE_TRANSITIONS,
  classifyEmailProviderFailure,
  lifecycleStateForEmailEvent,
  nextTransactionalEmailState,
  planCanonicalRegistration,
  renderTransactionalEmail,
  validateTurnstileResponse,
} from '../src/index.ts';

test('canonical A-J identity policy is reviewable and neutralizes enumeration', () => {
  assert.deepEqual(CANONICAL_AUTH_STATE_TRANSITIONS.map(({ state }) => state), [
    'no_existing_account', 'existing_unverified_account', 'verified_active_account',
    'relink_required_account', 'locked_account', 'suspended_account', 'deleted_account',
    'password_mismatch', 'expired_verification_request', 'superseded_verification_request',
  ]);
  assert.equal(planCanonicalRegistration({}), 'create_account');
  assert.equal(planCanonicalRegistration({ account: { status: 'active', verifiedAt: null } }), 'resend_verification');
  assert.equal(planCanonicalRegistration({ account: { status: 'active', verifiedAt: 'now' } }), 'neutral_existing_account');
  assert.equal(planCanonicalRegistration({ contactAccount: { status: 'locked' } }), 'neutral_existing_account');
});

test('email retry and lifecycle policy never retries after provider acceptance', () => {
  for(const code of ['E_RATE_LIMIT_EXCEEDED','E_DAILY_LIMIT_EXCEEDED','E_INTERNAL_SERVER_ERROR']) {
    assert.equal(classifyEmailProviderFailure({code}).category,'transient');
    assert.equal(classifyEmailProviderFailure({code,accepted:true}).category,'unknown');
  }
  for(const code of ['E_SENDER_DOMAIN_NOT_AVAILABLE','E_VALIDATION_ERROR','E_RECIPIENT_SUPPRESSED']) {
    assert.equal(classifyEmailProviderFailure({code}).category,'permanent');
  }
  assert.equal(classifyEmailProviderFailure({code:'E_DELIVERY_FAILED'}).category,'unknown');
  assert.deepEqual(nextTransactionalEmailState({ category: 'transient', attemptCount: 1, nowMs: 1000, random: () => 0 }), { state: 'queued', nextAttemptAt: 31000 });
  assert.deepEqual(nextTransactionalEmailState({ category: 'permanent', attemptCount: 1, nowMs: 1000 }), { state: 'failed', nextAttemptAt: null });
  assert.deepEqual(classifyEmailProviderFailure({ status: 202, accepted: true }).category, 'unknown');
  assert.equal(lifecycleStateForEmailEvent('message.delivered'), 'delivered');
  assert.equal(lifecycleStateForEmailEvent('message.complained'), 'complained');
});

test('ambiguous acceptance cannot cause blind duplicate sends; explicit transient retries are bounded and jittered', () => {
  assert.deepEqual(nextTransactionalEmailState({ category: 'unknown', attemptCount: 1 }), { state: 'failed', nextAttemptAt: null });
  assert.deepEqual(nextTransactionalEmailState({ category: 'transient', attemptCount: 8 }), { state: 'failed', nextAttemptAt: null });
  assert.deepEqual(nextTransactionalEmailState({ category: 'transient', attemptCount: 1, nowMs: 1000, random: () => 1 }), { state: 'queued', nextAttemptAt: 37000 });
});

test('Turnstile requires successful response and configured host/action', () => {
  validateTurnstileResponse({ success: true, hostname: 'lythaus.co', action: 'account_signup' }, 'lythaus.co,www.lythaus.co', 'account_signup');
  assert.throws(() => validateTurnstileResponse({ success: false }, 'lythaus.co'), /turnstile_failed/);
  assert.throws(() => validateTurnstileResponse({ success: true, hostname: 'evil.example' }, 'lythaus.co'), /turnstile_failed/);
  assert.throws(() => validateTurnstileResponse({ success: true, hostname: 'lythaus.co', action: 'other' }, 'lythaus.co', 'account_signup'), /turnstile_failed/);
});

test('missing or unsafe email link configuration fails closed rather than sending an unusable message', () => {
  for (const verificationBaseUrl of [undefined, 'http://lythaus.co/verify-email', 'https://evil.example/verify-email',
    'https://lythaus.co/verify-email?returnTo=https://evil.example', 'https://user@lythaus.co/verify-email',
    'https://lythaus.co/verify-email%2fother', 'https://lythaus.co:4433/verify-email', 'https://lythaus.co/verify-email#token=x']) {
    assert.throws(() => renderTransactionalEmail({ purpose: 'verification', token: 'synthetic-token', verificationBaseUrl }), /email_link_configuration_invalid/);
  }
});

test('invitations explain the post-verification password setup path', () => {
  const message = renderTransactionalEmail({
    purpose: 'invite',
    token: 'secret-token',
    verificationBaseUrl: 'https://lythaus.co/verify-email?token=',
  });
  assert.match(message.html, /choose your own password/);
  assert.match(message.text, /https:\/\/lythaus\.co\/verify-email#token=secret-token/);
  assert.doesNotMatch(message.html, /\?token=/);
});

test('acceptance secrets and reset links use fragments, never server query parameters', () => {
  const message = renderTransactionalEmail({ purpose: 'password_reset', token: 'synthetic-token',
    acceptanceContext: 'synthetic-context', acceptanceLinkBaseUrl: 'https://admin.lythaus.co/api/admin/production-auth-acceptance/email?context=' });
  const link = new URL(message.text.match(/https:\/\/\S+/)[0]);
  assert.equal(link.search, '');
  assert.equal(new URLSearchParams(link.hash.slice(1)).get('purpose'), 'password_reset');
  const local = { purpose: 'password_reset', token: 'synthetic-token', resetBaseUrl: 'http://localhost:4321/reset-password?token=' };
  assert.throws(() => renderTransactionalEmail(local), /email_link_configuration_invalid/);
  assert.match(renderTransactionalEmail({ ...local, environment: 'local' }).text, /#token=/);
});
