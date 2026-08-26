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
  assert.match(signup, /autocomplete="new-password"/);
  assert.doesNotMatch(signup, /CLOUDFLARE_API_TOKEN|TURNSTILE_SECRET_KEY/);
});
