import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const forgotPassword = fs.readFileSync(path.join(root, 'src/pages/forgot-password.astro'), 'utf8');
const resetPassword = fs.readFileSync(path.join(root, 'src/pages/reset-password.astro'), 'utf8');
const resendVerification = fs.readFileSync(path.join(root, 'src/pages/resend-verification.astro'), 'utf8');
const signIn = fs.readFileSync(path.join(root, 'src/pages/sign-in.astro'), 'utf8');
const verifyEmail = fs.readFileSync(path.join(root, 'src/pages/verify-email.astro'), 'utf8');
const checkEmail = fs.readFileSync(path.join(root, 'src/pages/check-email.astro'), 'utf8');
const signup = fs.readFileSync(path.join(root, 'src/pages/signup.astro'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'src/layouts/BaseLayout.astro'), 'utf8');
const headers = fs.readFileSync(path.join(root, 'public/_headers'), 'utf8');
const sitemap = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8');
const workerConfig = fs.readFileSync(path.resolve(root, '../../apps/lythaus-public-api/wrangler.jsonc'), 'utf8');

test('password recovery request is neutral, protected, and Turnstile-backed', () => {
  assert.match(forgotPassword, /data-password-reset-request-form/);
  assert.match(forgotPassword, /action: 'password_reset_request'/);
  assert.match(forgotPassword, /\/api\/auth\/password\/reset\/request/);
  assert.match(forgotPassword, /body\.state !== 'reset_if_eligible'/);
  assert.match(forgotPassword, /queued or is on its way/);
  assert.match(forgotPassword, /Delivery is not confirmed yet/);
  assert.doesNotMatch(forgotPassword, /account exists|user not found/i);
});

test('password reset completion consumes the token once and clears it after success', () => {
  assert.match(resetPassword, /data-password-reset-complete-form/);
  assert.match(resetPassword, /\/api\/auth\/password\/reset\/complete/);
  assert.match(resetPassword, /window\.history\.replaceState\(null, '', '\/reset-password'\)/);
  assert.match(resetPassword, /method: 'POST'/);
  assert.match(resetPassword, /body: JSON\.stringify\(\{ token, password: password\.value \}\)/);
  assert.match(resetPassword, /reset_token_invalid/);
  assert.match(resetPassword, /existing sessions were signed out/);
  assert.match(resetPassword, /minlength="15"/);
});

test('verification resend is Turnstile-backed and neutral', () => {
  assert.match(resendVerification, /data-verification-resend-form/);
  assert.match(resendVerification, /action: 'verification_resend'/);
  assert.match(resendVerification, /\/api\/auth\/email/);
  assert.match(resendVerification, /mode: 'resend_verification'/);
  assert.match(resendVerification, /turnstileToken/);
  assert.match(resendVerification, /body\.state !== 'verification_required'/);
  assert.match(resendVerification, /delivery is not confirmed yet/);
  assert.match(resendVerification, /request another message in/);
  assert.doesNotMatch(resendVerification, /account exists|user not found/i);
});

test('sign-in exposes recovery actions and only offers resend after valid verification-required login', () => {
  assert.match(signIn, /data-sign-in-form/);
  assert.match(signIn, /mode: 'login'/);
  assert.match(signIn, /email_verification_required/);
  assert.match(signIn, /data-sign-in-resend-region/);
  assert.match(signIn, /mode: 'resend_verification'/);
  assert.match(signIn, /Forgot password\?/);
  assert.match(signIn, /Your email still needs to be verified\./);
  assert.doesNotMatch(signIn, /account exists|user not found/i);
});

test('verification page never mutates on GET and consumes the token with deliberate POST', () => {
  assert.match(verifyEmail, /data-email-verification-form/);
  assert.match(verifyEmail, /Confirm your email/);
  assert.match(verifyEmail, /window\.history\.replaceState\(null, '', '\/verify-email'\)/);
  assert.match(verifyEmail, /method: 'POST'/);
  assert.match(verifyEmail, /body: JSON\.stringify\(\{ token \}\)/);
  assert.doesNotMatch(verifyEmail, /method:\s*['"]GET['"]/);
  assert.match(verifyEmail, /verification_token_invalid/);
  assert.match(verifyEmail, /already used/);
});

test('check-email and token-bearing pages use neutral, non-indexed security copy', () => {
  assert.match(checkEmail, /Check your email/);
  assert.match(checkEmail, /queued or is on its way/);
  assert.match(checkEmail, /does not confirm delivery/);
  assert.match(layout, /noReferrer/);
  assert.match(layout, /noIndex/);
  assert.match(headers, /\/verify-email[\s\S]*Referrer-Policy: no-referrer/);
  assert.match(headers, /\/reset-password[\s\S]*Referrer-Policy: no-referrer/);
  assert.doesNotMatch(sitemap, /<loc>https:\/\/lythaus\.co\/(?:verify-email|reset-password)<\/loc>/);
});

test('auth pages expose accessible status and password-policy guidance', () => {
  for (const page of [signup, forgotPassword, resetPassword, resendVerification, signIn, verifyEmail]) {
    assert.match(page, /aria-live="polite"/);
    assert.match(page, /role="status"/);
    assert.match(page, /tabindex="-1"/);
  }
  assert.match(signup, /minlength="15"/);
  assert.match(signup, /Password managers, paste, and autofill are supported/);
  assert.match(resetPassword, /Longer passphrases are welcome/);
  assert.doesNotMatch(signup, /uppercase.*symbol|symbol.*uppercase/i);
});

test('production reset links target the user-facing reset page', () => {
  assert.match(workerConfig, /"EMAIL_PASSWORD_RESET_BASE_URL": "https:\/\/lythaus\.co\/reset-password\?token="/);
  assert.match(workerConfig, /"EMAIL_PASSWORD_RESET_BASE_URL": "http:\/\/localhost:4321\/reset-password\?token="/);
});

test('signup keeps its existing reverify action', () => {
  assert.match(signup, /data-signup-resend/);
  assert.match(signup, /mode: 'resend_verification'/);
});
