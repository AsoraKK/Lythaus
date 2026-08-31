import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const coordinator = fs.readFileSync('apps/lythaus-auth-acceptance-coordinator/src/index.ts', 'utf8');
const publicApi = fs.readFileSync('apps/lythaus-public-api/src/index.ts', 'utf8');
const migration = fs.readFileSync('database/planetscale/migrations/0015_production_auth_acceptance_coordinator.sql', 'utf8');
const controlPanel = fs.readFileSync('apps/control-panel/src/pages/ProductionAuthAcceptance.jsx', 'utf8');

test('acceptance runs bind the exact coordinator release and candidate version', () => {
  assert.match(coordinator, /env\.WORKER_VERSION\.tag !== releaseSha/);
  assert.match(coordinator, /Cloudflare-Workers-Version-Overrides/);
  assert.match(coordinator, /candidate_version_response_mismatch/);
  assert.match(coordinator, /requiredSecret\(env, 'CLOUDFLARE_ACCOUNT_ID'\)/);
  assert.match(migration, /release_sha text NOT NULL CHECK \(release_sha ~ '\^\[0-9a-f\]\{40\}\$'\)/);
  assert.match(migration, /expires_at timestamptz NOT NULL/);
  assert.match(migration, /production_auth_acceptance_active_candidate_uidx/);
});

test('acceptance run validation accepts the uuidv7 identifiers it generates', () => {
  assert.match(coordinator, /uuidv7\(\)/);
  assert.match(coordinator, /\[1-8\]\[0-9a-f\]\{3\}/);
  assert.doesNotMatch(coordinator, /\[1-5\]\[0-9a-f\]\{3\}/);
});

test('acceptance evidence is server derived and human interaction remains required', () => {
  assert.match(coordinator, /status: 'HUMAN_ACCEPTANCE_REQUIRED'/);
  assert.match(coordinator, /source: 'runtime_observation'/);
  assert.match(coordinator, /outboxSummary: \{ source: 'read_only_database_query'/);
  assert.match(coordinator, /emailLifecycle: outbox\.rows\.map/);
  assert.doesNotMatch(coordinator.slice(coordinator.indexOf('async function runSummary'), coordinator.indexOf('async function startRegistration')), /provider_message_id/);
  assert.match(coordinator, /provider_message_digest/);
  assert.doesNotMatch(coordinator, /SELECT id, purpose, challenge_id, created_at, provider, provider_message_id/);
  assert.match(coordinator, /const run = await loadRun\(env, runId, false\)/);
  const observer = coordinator.slice(coordinator.indexOf('async function observer'), coordinator.indexOf('function failure'));
  assert.doesNotMatch(observer, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/);
});

test('service readiness authorization survives the Access edge without weakening human Access validation', () => {
  assert.match(coordinator, /request\.headers\.get\('x-lythaus-readiness-token'\)/);
  assert.match(coordinator, /request\.headers\.get\('authorization'\)\?\.match\(\/\^Bearer/);
  assert.match(coordinator, /if \(readinessAuthorized\(request, env\)\) return;/);
  assert.match(coordinator, /await accessSubject\(request, env\)/);
});

test('refresh revocation proof is encrypted, bounded, and cleared after use', () => {
  assert.match(migration, /pre_reset_refresh_ciphertext text/);
  assert.match(migration, /pre_reset_refresh_encryption_key_version text/);
  assert.match(coordinator, /candidate_pre_reset_refresh_accepted/);
  assert.match(coordinator, /pre_reset_refresh_ciphertext = NULL/);
  assert.match(coordinator, /password_reset_sessions_revoked/);
  assert.match(coordinator, /SET status = 'completed'/);
  assert.match(coordinator, /completed_at = now\(\)/);
  assert.doesNotMatch(controlPanel, /localStorage|sessionStorage/);
});

test('candidate registration binds only a production-acceptance identity to its run', () => {
  assert.match(publicApi, /is_production_acceptance\) VALUES \(\$1, \$2\)/);
  assert.match(publicApi, /acceptance_run_identity_binding_failed/);
  assert.match(publicApi, /SET primary_user_id = \$2, status = 'in_progress'/);
  assert.match(controlPanel, /initial-session/);
  assert.match(controlPanel, /session-proof/);
  assert.match(controlPanel, /turnstileResetNonce/);
  assert.match(controlPanel, /\['register', 'resend', 'reset'\]\.includes\(path\)/);
  assert.match(controlPanel, /Email lifecycle/);
});
