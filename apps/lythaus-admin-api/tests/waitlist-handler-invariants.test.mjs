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
  assert.match(worker, /\(created_at, id\) < \(\$1::timestamptz, \$2::uuid\)/);
  assert.match(worker, /ORDER BY created_at DESC, id DESC/);
  assert.match(worker, /LIMIT \$3/);
});

test('admin waitlist decrypts only approved fields and audits before returning PII', () => {
  const handler = worker.slice(worker.indexOf('async function listWaitlist'), worker.indexOf('async function searchUsers'));
  assert.match(handler, /decryptField\(/);
  assert.match(handler, /marketing\.waitlist_viewed/);
  assert.match(handler, /waitlistAuditMetadata/);
  assert.ok(handler.indexOf('INSERT INTO system.audit_events') < handler.indexOf('return json'));
  assert.doesNotMatch(handler.slice(handler.indexOf('return json')), /email_lookup_hmac|email_ciphertext|encryption_key_version/);
  assert.match(handler, /'cache-control': 'private, no-store'/);
});

test('waitlist mutations remain role-gated, parameterised and PII-safe', () => {
  const statusHandler = worker.slice(worker.indexOf('async function updateWaitlistStatus'), worker.indexOf('async function updateWaitlistRetentionHold'));
  const retentionHandler = worker.slice(worker.indexOf('async function updateWaitlistRetentionHold'), worker.indexOf('async function searchUsers'));
  assert.match(statusHandler, /assertWaitlistAdminRole\(actor\.role\)/);
  assert.match(statusHandler, /WHERE id = \$1 FOR UPDATE/);
  assert.match(statusHandler, /marketing\.waitlist_status_changed/);
  assert.doesNotMatch(statusHandler, /email_ciphertext|email_lookup_hmac/);
  assert.match(retentionHandler, /retention_hold = \$2/);
  assert.match(retentionHandler, /marketing\.waitlist_retention_hold_changed/);
  assert.doesNotMatch(retentionHandler, /email_ciphertext|email_lookup_hmac/);
  assert.match(worker, /url\.pathname\.match\(\/\^\\\/api\\\/admin\\\/waitlist/);
});
