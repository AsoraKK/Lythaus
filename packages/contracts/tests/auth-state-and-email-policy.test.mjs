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
  assert.deepEqual(nextTransactionalEmailState({ category: 'transient', attemptCount: 1, nowMs: 1000 }), { state: 'queued', nextAttemptAt: 31000 });
  assert.deepEqual(nextTransactionalEmailState({ category: 'permanent', attemptCount: 1, nowMs: 1000 }), { state: 'failed', nextAttemptAt: null });
  assert.deepEqual(classifyEmailProviderFailure({ status: 202, accepted: true }).category, 'unknown');
  assert.equal(lifecycleStateForEmailEvent('message.delivered'), 'delivered');
  assert.equal(lifecycleStateForEmailEvent('message.complained'), 'complained');
});

test('Turnstile requires successful response and configured host/action', () => {
  validateTurnstileResponse({ success: true, hostname: 'lythaus.co', action: 'account_signup' }, 'lythaus.co,www.lythaus.co', 'account_signup');
  assert.throws(() => validateTurnstileResponse({ success: false }, 'lythaus.co'), /turnstile_failed/);
  assert.throws(() => validateTurnstileResponse({ success: true, hostname: 'evil.example' }, 'lythaus.co'), /turnstile_failed/);
  assert.throws(() => validateTurnstileResponse({ success: true, hostname: 'lythaus.co', action: 'other' }, 'lythaus.co', 'account_signup'), /turnstile_failed/);
});

test('transactional email rendering keeps token out of HTML when no URL is configured', () => {
  const message = renderTransactionalEmail({ purpose: 'verification', token: 'secret-token' });
  assert.equal(message.to, '');
  assert.doesNotMatch(message.html, /secret-token/);
  assert.equal(message.subject, 'Verify your Lythaus email');
});
