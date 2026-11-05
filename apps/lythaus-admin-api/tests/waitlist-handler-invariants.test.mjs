import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const worker = fs.readFileSync(path.join(root, 'src/index.ts'), 'utf8');

test('admin waitlist runs after Access membership authentication and uses keyset pagination', () => {
  const authorizationIndex = worker.indexOf('const actor = await requireAdmin(request, env)');
  const routeIndex = worker.indexOf("url.pathname === '/api/admin/waitlist'");
  assert.ok(authorizationIndex >= 0 && routeIndex > authorizationIndex);
  assert.match(worker, /assertWaitlistAdminRole\(actor\.role\)/);
  assert.match(worker, /if \(page\.cursor\) conditions\.push\(`\(w\.created_at, w\.id\) < \(/);
  assert.match(worker, /addValue\(page\.cursor\.timestamp\)\}::timestamptz/);
  assert.match(worker, /addValue\(page\.cursor\.id\)\}::uuid/);
  assert.match(worker, /ORDER BY w\.created_at DESC, w\.id DESC/);
  assert.match(worker, /const limitValue = addValue\(filters\.query \? WAITLIST_SEARCH_MAX_CANDIDATES \+ 1 : page\.limit \+ 1\)/);
  assert.match(worker, /LIMIT \$\{limitValue\}/);
});

test('admin waitlist decrypts only approved fields and audits before returning PII', () => {
  const handler = worker.slice(worker.indexOf('async function listWaitlist'), worker.indexOf('async function searchUsers'));
  assert.match(handler, /decryptField\(/);
  assert.match(handler, /marketing\.waitlist_viewed/);
  assert.match(handler, /waitlistAuditMetadata/);
  assert.doesNotMatch(handler, /email_lookup_hmac|identity\.contact_emails|identity\.email_credentials|w\.invited_at|w\.converted_at|w\.unsubscribed_at/);
  assert.ok(handler.indexOf('INSERT INTO system.audit_events') < handler.indexOf('return json'));
  assert.doesNotMatch(handler.slice(handler.indexOf('return json')), /email_lookup_hmac|email_ciphertext|encryption_key_version/);
  assert.match(handler, /'cache-control': 'private, no-store'/);
  assert.match(handler, /env\.WAITLIST_INVITE_SCHEMA_ENABLED === 'true'[\s\S]*?marketing\.waitlist_invites/);
  assert.match(handler, /WHEN wi\.revoked_at IS NOT NULL THEN 'revoked'/);
  assert.match(handler, /WHEN o\.state IN \('bounced', 'complained', 'rejected'\) THEN o\.state/);
  assert.match(handler, /WHEN t\.expires_at <= now\(\) AND t\.superseded_at IS NULL THEN 'expired'/);
  assert.doesNotMatch(handler, /WHERE wi\.waitlist_id=w\.id AND wi\.revoked_at IS NULL/);
  assert.match(handler, /inviteFeatureEnabled: env\.WAITLIST_INVITE_SCHEMA_ENABLED === 'true'/);
  const keeper = fs.readFileSync(path.join(root, 'src/keeper-runtime.ts'), 'utf8');
  const inviteHandler = keeper.slice(keeper.indexOf('export async function inviteWaitlistContact'), keeper.indexOf('export async function resendAdminVerification'));
  assert.ok(inviteHandler.indexOf("env.WAITLIST_INVITE_SCHEMA_ENABLED !== 'true'") < inviteHandler.indexOf('claimKeeperIdempotency'),
    'disabled invitation sends must stop before recording an idempotency claim');
  assert.match(inviteHandler, /\['waiting', 'invited'\]\.includes\(row\.status\)/);
});

test('waitlist state cannot be edited manually; invite and unsubscribe retain restricted routes', () => {
  const statusHandler = worker.slice(worker.indexOf('async function updateWaitlistStatus'), worker.indexOf('async function updateWaitlistRetentionHold'));
  const retentionHandler = worker.slice(worker.indexOf('async function updateWaitlistRetentionHold'), worker.indexOf('async function searchUsers'));
  assert.match(statusHandler, /assertWaitlistAdminRole\(actor\.role\)/);
  assert.match(statusHandler, /waitlist_status_managed/);
  assert.doesNotMatch(statusHandler, /UPDATE marketing\.waitlist_signups/);
  assert.match(worker, /inviteWaitlistContact\(/);
  assert.doesNotMatch(statusHandler, /email_ciphertext|email_lookup_hmac/);
  assert.match(retentionHandler, /retention_hold = \$2/);
  assert.match(retentionHandler, /marketing\.waitlist_retention_hold_changed/);
  assert.doesNotMatch(retentionHandler, /email_ciphertext|email_lookup_hmac/);
  assert.match(worker, /url\.pathname\.match\(\/\^\\\/api\\\/admin\\\/waitlist/);
});
