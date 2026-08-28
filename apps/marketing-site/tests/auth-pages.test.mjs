import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const forgotPassword = fs.readFileSync(path.join(root, 'src/pages/forgot-password.astro'), 'utf8');
const resetPassword = fs.readFileSync(path.join(root, 'src/pages/reset-password.astro'), 'utf8');
const resendVerification = fs.readFileSync(path.join(root, 'src/pages/resend-verification.astro'), 'utf8');
const signup = fs.readFileSync(path.join(root, 'src/pages/signup.astro'), 'utf8');
const workerConfig = fs.readFileSync(path.resolve(root, '../../apps/lythaus-public-api/wrangler.jsonc'), 'utf8');

test('password recovery request is neutral, protected, and Turnstile-backed', () => {
  assert.match(forgotPassword, /data-password-reset-request-form/);
  assert.match(forgotPassword, /action: 'password_reset_request'/);
  assert.match(forgotPassword, /\/api\/auth\/password\/reset\/request/);
  assert.match(forgotPassword, /If an account is eligible, a reset email is on its way\./);
  assert.doesNotMatch(forgotPassword, /account exists|user not found/i);
});

test('password reset completion consumes the token once and clears it after success', () => {
  assert.match(resetPassword, /data-password-reset-complete-form/);
  assert.match(resetPassword, /\/api\/auth\/password\/reset\/complete/);
  assert.match(resetPassword, /window\.history\.replaceState\(null, '', '\/reset-password'\)/);
  assert.match(resetPassword, /reset_token_invalid/);
  assert.match(resetPassword, /existing sessions were signed out/);
});

test('verification resend is Turnstile-backed and neutral', () => {
  assert.match(resendVerification, /data-verification-resend-form/);
  assert.match(resendVerification, /action: 'verification_resend'/);
  assert.match(resendVerification, /\/api\/auth\/email/);
  assert.match(resendVerification, /mode: 'resend_verification'/);
  assert.match(resendVerification, /turnstileToken/);
  assert.match(resendVerification, /If this account is waiting for verification, a new email is on its way\./);
  assert.doesNotMatch(resendVerification, /account exists|user not found/i);
});

test('production reset links target the user-facing reset page', () => {
  assert.match(workerConfig, /"EMAIL_PASSWORD_RESET_BASE_URL": "https:\/\/lythaus\.co\/reset-password\?token="/);
  assert.match(workerConfig, /"EMAIL_PASSWORD_RESET_BASE_URL": "http:\/\/localhost:4321\/reset-password\?token="/);
});

test('signup keeps its existing reverify action', () => {
  assert.match(signup, /data-signup-resend/);
  assert.match(signup, /mode: 'resend_verification'/);
});
