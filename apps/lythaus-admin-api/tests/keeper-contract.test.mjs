import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtime = readFileSync(new URL('../src/keeper-runtime.ts', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../src/auth-email-dispatch-adapter.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('Keeper routes expose live summaries and paginated identity operations', () => {
  for (const route of [
    '/api/admin/auth/summary', '/api/admin/email-health', '/api/admin/users',
    'resend-verification', 'revoke-sessions', '/api/admin/waitlist',
  ]) assert.match(worker, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(runtime, /adminUserPageRequest/);
  assert.match(runtime, /adminWaitlistFilters/);
  assert.match(runtime, /nextCursor/);
});

test('Keeper email actions use the canonical transactional outbox seam', () => {
  assert.match(adapter, /enqueueTransactionalEmailIntent/);
  assert.match(adapter, /secretEncryptionKeyVersion/);
  assert.match(adapter, /contactEmailUserId/);
  assert.doesNotMatch(adapter, /system\.outbox_events/);
  assert.doesNotMatch(adapter, /provider_message_id|provider_error_code/);
});

test('Keeper mutations require reason and confirmation validation', () => {
  assert.match(runtime, /rejectUnknownFields/);
  assert.match(runtime, /parseReasonCode/);
  assert.match(runtime, /requireConfirmation/);
  assert.match(runtime, /requiredIdempotency|idempotency_key_required/);
  assert.match(worker, /requireConfirmation\(input\.confirmation/);
});
