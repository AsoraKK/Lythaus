import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseWaitlistRequest,
  parseWaitlistSubmission,
  requireWaitlistSecrets,
  validateWaitlistTurnstileResult,
  verifyWaitlistTurnstile,
  WAITLIST_CONSENT_VERSION,
  WAITLIST_TURNSTILE_ACTION,
} from '../src/waitlist-runtime-policy.ts';

test('normalizes and validates a bounded waitlist submission', async () => {
  const parsed = await parseWaitlistRequest(new Request('https://api.lythaus.co/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email: ' Person@Example.COM ',
      turnstileToken: 'valid-turnstile-token',
      consentVersion: WAITLIST_CONSENT_VERSION,
      source: 'browser-value-is-not-trusted',
    }),
  }));
  assert.deepEqual(parsed, {
    email: 'person@example.com',
    turnstileToken: 'valid-turnstile-token',
    consentVersion: WAITLIST_CONSENT_VERSION,
  });
});

test('rejects invalid email, consent, content type, method, and unknown fields', async () => {
  assert.throws(() => parseWaitlistSubmission({
    email: 'invalid', turnstileToken: 'valid-turnstile-token', consentVersion: WAITLIST_CONSENT_VERSION,
  }), /invalid_email/);
  assert.throws(() => parseWaitlistSubmission({
    email: 'person@example.com', turnstileToken: 'valid-turnstile-token', consentVersion: 'older',
  }), /invalid_consent_version/);
  assert.throws(() => parseWaitlistSubmission({
    email: 'person@example.com', turnstileToken: 'valid-turnstile-token', consentVersion: WAITLIST_CONSENT_VERSION, role: 'administrator',
  }), /invalid_json/);
  await assert.rejects(() => parseWaitlistRequest(new Request('https://api.lythaus.co/api/waitlist', {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}',
  })), /unsupported_content_type/);
  await assert.rejects(() => parseWaitlistRequest(new Request('https://api.lythaus.co/api/waitlist')), /method_not_allowed/);
});

test('rejects oversized request bodies before parsing', async () => {
  await assert.rejects(() => parseWaitlistRequest(new Request('https://api.lythaus.co/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '9000' },
    body: '{}',
  })), /request_too_large/);
});

test('requires all waitlist secrets without exposing configuration details', () => {
  assert.deepEqual(requireWaitlistSecrets({
    PII_ENCRYPTION_KEY_V1: 'encryption-key',
    PII_HMAC_KEY_V1: 'hmac-key',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    TURNSTILE_EXPECTED_HOSTNAMES: 'lythaus.co,www.lythaus.co',
  }), {
    encryptionKey: 'encryption-key',
    hmacKey: 'hmac-key',
    turnstileSecret: 'turnstile-secret',
    turnstileExpectedHostnames: 'lythaus.co,www.lythaus.co',
  });
  assert.throws(() => requireWaitlistSecrets({}), /waitlist_unavailable/);
});

test('requires successful Turnstile action and an exact configured hostname', () => {
  validateWaitlistTurnstileResult({ success: true, action: WAITLIST_TURNSTILE_ACTION, hostname: 'lythaus.co' }, 'lythaus.co,www.lythaus.co');
  assert.throws(() => validateWaitlistTurnstileResult({ success: false, action: WAITLIST_TURNSTILE_ACTION, hostname: 'lythaus.co' }, 'lythaus.co'), /turnstile_failed/);
  assert.throws(() => validateWaitlistTurnstileResult({ success: true, action: 'login', hostname: 'lythaus.co' }, 'lythaus.co'), /turnstile_failed/);
  assert.throws(() => validateWaitlistTurnstileResult({ success: true, action: WAITLIST_TURNSTILE_ACTION, hostname: 'evil.example' }, 'lythaus.co'), /turnstile_failed/);
  assert.throws(() => validateWaitlistTurnstileResult({ success: true, action: WAITLIST_TURNSTILE_ACTION, hostname: 'lythaus.co' }, ''), /waitlist_unavailable/);
});

test('posts only secret and token to Turnstile without remote IP', async () => {
  let captured;
  await verifyWaitlistTurnstile({
    token: 'valid-turnstile-token',
    secret: 'turnstile-secret',
    expectedHostnames: 'lythaus.co',
    fetcher: async (url, init) => {
      captured = { url, init };
      return Response.json({ success: true, action: WAITLIST_TURNSTILE_ACTION, hostname: 'lythaus.co' });
    },
  });
  assert.equal(captured.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.body.get('secret'), 'turnstile-secret');
  assert.equal(captured.init.body.get('response'), 'valid-turnstile-token');
  assert.equal(captured.init.body.has('remoteip'), false);
});

test('collapses Turnstile transport and malformed responses to a safe unavailable error', async () => {
  await assert.rejects(() => verifyWaitlistTurnstile({
    token: 'valid-turnstile-token', secret: 'secret', expectedHostnames: 'lythaus.co',
    fetcher: async () => { throw new Error('network detail'); },
  }), /turnstile_unavailable/);
  await assert.rejects(() => verifyWaitlistTurnstile({
    token: 'valid-turnstile-token', secret: 'secret', expectedHostnames: 'lythaus.co',
    fetcher: async () => new Response('bad', { status: 503 }),
  }), /turnstile_unavailable/);
}
);
