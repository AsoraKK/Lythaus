import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const signup = fs.readFileSync(path.join(root, 'src/pages/signup.astro'), 'utf8');

test('signup page exposes the real production email registration flow', () => {
  assert.match(signup, /Create your account\./);
  assert.match(signup, /mode: 'register'/);
  assert.match(signup, /turnstileToken/);
  assert.match(signup, /action: 'account_signup'/);
  assert.match(signup, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
  assert.match(signup, /email_verification_required/);
  assert.match(signup, /account_exists/);
  assert.match(signup, /email_delivery_failed\(\?:_\[1-5\]\[0-9\]\{2\}\)\?/);
  assert.match(signup, /resend_verification/);
  assert.match(signup, /If this was a retry, resend the verification email below/);
  assert.match(signup, /failureReference = typeof body\.correlationId/);
  assert.match(signup, /setResendVisible\(shouldOfferResend\(code\)\)/);
  assert.match(signup, /autocomplete="new-password"/);
  assert.match(signup, /minlength="15"/);
  assert.match(signup, /queued or is on its way/);
  assert.doesNotMatch(signup, /This email is already registered/);
  assert.doesNotMatch(signup, /CLOUDFLARE_API_TOKEN|TURNSTILE_SECRET_KEY/);
});
