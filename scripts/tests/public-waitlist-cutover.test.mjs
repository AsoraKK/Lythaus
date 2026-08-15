import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const turnstile = fs.readFileSync('scripts/cloudflare/waitlist-turnstile.mjs', 'utf8');
const materializer = fs.readFileSync('scripts/ci/materialize-public-waitlist-deploy.mjs', 'utf8');
const probe = fs.readFileSync('scripts/ci/probe-public-waitlist-candidate.mjs', 'utf8');
const cutover = fs.readFileSync('.github/workflows/deploy-public-waitlist.yml', 'utf8');
const marketing = fs.readFileSync('.github/workflows/deploy-marketing-preview.yml', 'utf8');

test('Turnstile provisioning is exact, idempotent, and secret-safe', () => {
  assert.match(turnstile, /Lythaus Website Waitlist/);
  assert.match(turnstile, /lythaus\.co/);
  assert.match(turnstile, /www\.lythaus\.co/);
  assert.match(turnstile, /expectedMode = 'managed'/);
  assert.match(turnstile, /clearance_level: 'no_clearance'/);
  assert.match(turnstile, /multiple production waitlist Turnstile widgets/);
  assert.match(turnstile, /TURNSTILE_SECRET_FILE/);
  assert.doesNotMatch(turnstile, /console\.log\([^\n]*secret/);
});

test('public materializer keeps full authenticated acceptance fail closed', () => {
  assert.match(materializer, /0013_marketing_waitlist\.sql/);
  assert.match(materializer, /TURNSTILE_REQUIRED/);
  assert.match(materializer, /lythaus\.co,www\.lythaus\.co/);
  assert.match(materializer, /AUTHENTICATED_ACCEPTANCE_PROVEN/);
  assert.match(materializer, /must not falsely assert full authenticated acceptance/);
});

test('candidate probe proves the route exists without writing a signup', () => {
  assert.match(probe, /candidate-probe@example\.invalid/);
  assert.match(probe, /turnstileToken: ''/);
  assert.match(probe, /routeProbe\.status !== 400/);
  assert.match(probe, /turnstile_required/);
  assert.match(probe, /private, no-store/);
  assert.match(probe, /access-control-allow-origin/);
});

test('protected cutover verifies database, preserves secrets, and has rollback', () => {
  assert.match(cutover, /environment: production/);
  assert.match(cutover, /Require exact reviewed current main SHA/);
  assert.match(cutover, /PSCALE_ROLE_IDENTIFIERS: \$\{\{ secrets\.PSCALE_ROLE_IDENTIFIERS \}\}/);
  assert.match(cutover, /verify-planetscale-production-schema\.mjs/);
  assert.match(cutover, /verify-cloudflare-hyperdrive-targets\.mjs/);
  assert.match(cutover, /PII_ENCRYPTION_KEY_V1 PII_HMAC_KEY_V1/);
  assert.match(cutover, /waitlist-turnstile\.mjs ensure/);
  assert.match(cutover, /--secrets-file/);
  assert.match(cutover, /probe-public-waitlist-candidate\.mjs/);
  assert.match(cutover, /Restore exact pre-waitlist public Worker deployment/);
});

test('production marketing resolves the public sitekey from Cloudflare', () => {
  assert.match(marketing, /PUBLIC_API_BASE_URL: https:\/\/api\.lythaus\.co/);
  assert.match(marketing, /waitlist-turnstile\.mjs resolve/);
  assert.match(marketing, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
  assert.match(marketing, /waitlist_signup/);
  assert.doesNotMatch(marketing, /vars\.PUBLIC_TURNSTILE_SITE_KEY/);
});
