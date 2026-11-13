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

test('invitation emails carry a private one-time code, signup link, expiry and support contact', () => {
  const message = renderTransactionalEmail({
    purpose: 'invite',
    token: 'secret-token',
    waitlistInvite: true,
  });
  assert.match(message.html, /email address this invitation was sent to/);
  assert.match(message.html, /expires in 7 days/);
  assert.match(message.html, /Invitation code: <strong>secret-token<\/strong>/);
  assert.match(message.text, /https:\/\/app\.lythaus\.co\/invite#token=secret-token/);
  assert.match(message.html, /Lythaus Support · <a href="https:\/\/lythaus\.co\/contact">lythaus\.co\/contact<\/a>/);
  assert.match(message.text, /Lythaus Support: https:\/\/lythaus\.co\/contact/);
  assert.doesNotMatch(message.html, /Kyle|kyle\.kern@lythaus\.co/);
  assert.doesNotMatch(message.text, /Kyle|kyle\.kern@lythaus\.co/);
  assert.match(message.text, /Lythaus Support: https:\/\/lythaus\.co\/contact/);
  assert.equal(message.replyTo, undefined, 'Unverified support mailbox configuration must not be advertised as reply-to');
  assert.doesNotMatch(message.html, /\?token=/);
  const shortInvite = renderTransactionalEmail({ purpose: 'invite', token: 'short-token', verificationBaseUrl: 'https://lythaus.co/verify-email?token=' });
  assert.match(shortInvite.text, /expires in 30 minutes/);
  assert.match(shortInvite.text, /https:\/\/lythaus\.co\/verify-email#token=short-token/);
});

test('verification email carries Kyle’s signature and support link without setting reply-to', () => {
  const message = renderTransactionalEmail({
    purpose: 'verification',
    token: 'synthetic-verification-token',
    verificationBaseUrl: 'https://lythaus.co/verify-email?token=',
  });
  assert.match(message.html, /Thanks,<br>Kyle<br>kyle\.kern@lythaus\.co/);
  assert.match(message.html, /href="https:\/\/lythaus\.co\/contact">Lythaus Support/);
  assert.match(message.text, /Thanks,\nKyle\nkyle\.kern@lythaus\.co\nLythaus Support: https:\/\/lythaus\.co\/contact/);
  assert.equal(message.replyTo, undefined, 'The signature does not configure an unverified reply route');
});

test('waitlist invite links accept only the app invite route and an explicitly configured .co reply address', () => {
  for (const inviteBaseUrl of [
    'https://lythaus.co/invite',
    'https://app.lythaus.co/signup',
    'https://evil.example/invite',
    'https://app.lythaus.co/invite?redirect=https://evil.example',
  ]) {
    assert.throws(() => renderTransactionalEmail({
      purpose: 'invite', token: 'synthetic-token', waitlistInvite: true, inviteBaseUrl,
    }), /email_link_configuration_invalid/);
  }
  const reset = { purpose: 'password_reset', token: 'synthetic-token', resetBaseUrl: 'https://lythaus.co/reset-password' };
  const resetMessage = renderTransactionalEmail(reset);
  assert.equal(resetMessage.replyTo, undefined);
  assert.match(resetMessage.html, /Lythaus Support · <a href="https:\/\/lythaus\.co\/contact">lythaus\.co\/contact<\/a>/);
  assert.match(resetMessage.text, /^Reset your Lythaus password[\s\S]*Lythaus Support: https:\/\/lythaus\.co\/contact$/);
  assert.doesNotMatch(resetMessage.html, /Kyle|kyle\.kern@lythaus\.co/);
  const emailChange = renderTransactionalEmail({ purpose: 'email_change', token: 'synthetic-token', verificationBaseUrl: 'https://lythaus.co/signup' });
  assert.match(emailChange.html, /Lythaus Support · <a href="https:\/\/lythaus\.co\/contact">lythaus\.co\/contact<\/a>/);
  assert.doesNotMatch(emailChange.text, /Kyle|kyle\.kern@lythaus\.co/);
  const passwordChanged = renderTransactionalEmail({ purpose: 'password_changed', token: '' });
  assert.match(passwordChanged.html, /Lythaus Support · <a href="https:\/\/lythaus\.co\/contact">lythaus\.co\/contact<\/a>/);
  assert.doesNotMatch(passwordChanged.text, /Kyle|kyle\.kern@lythaus\.co/);
  assert.equal(renderTransactionalEmail({ ...reset, supportReplyToEmail: 'kyle.kern@lythaus.co' }).replyTo, 'kyle.kern@lythaus.co');
  for (const supportReplyToEmail of ['support@example.test', 'support@evil.example', 'support@example.test\r\nBcc:elsewhere@example.invalid']) {
    assert.throws(() => renderTransactionalEmail({ ...reset, supportReplyToEmail }), /support_reply_to_configuration_invalid/);
  }
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
