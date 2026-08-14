import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeCursor } from '@lythaus/contracts';
import {
  assertWaitlistAdminRole,
  assertWaitlistStatusTransition,
  parseWaitlistId,
  parseWaitlistRetentionHoldUpdate,
  parseWaitlistStatusUpdate,
  requireWaitlistEncryptionKey,
  waitlistAuditMetadata,
  waitlistPageRequest,
} from '../src/waitlist-runtime-policy.ts';

const cursor = { timestamp: '2026-08-14T07:00:00.000Z', id: '01900000-0000-7000-8000-000000000001' };

test('allows only administrator and owner roles to view waitlist PII', () => {
  assert.doesNotThrow(() => assertWaitlistAdminRole('administrator'));
  assert.doesNotThrow(() => assertWaitlistAdminRole('owner'));
  assert.throws(() => assertWaitlistAdminRole('moderator'), /admin_role_required/);
  assert.throws(() => assertWaitlistAdminRole('privacy_operator'), /admin_role_required/);
});

test('uses stable descending keyset pagination with default 50 and maximum 100', () => {
  assert.deepEqual(waitlistPageRequest(new URL('https://admin-api.lythaus.co/api/admin/waitlist')), { limit: 50, cursor: null });
  assert.deepEqual(waitlistPageRequest(new URL(`https://admin-api.lythaus.co/api/admin/waitlist?limit=500&cursor=${encodeCursor(cursor)}`)), {
    limit: 100,
    cursor,
  });
  assert.throws(() => waitlistPageRequest(new URL('https://admin-api.lythaus.co/api/admin/waitlist?limit=0')), /invalid_page_limit/);
  assert.throws(() => waitlistPageRequest(new URL('https://admin-api.lythaus.co/api/admin/waitlist?cursor=not-a-cursor')), /invalid_cursor/);
});

test('requires only the PII decryption key and emits PII-free audit metadata', () => {
  assert.equal(requireWaitlistEncryptionKey('encryption-key'), 'encryption-key');
  assert.throws(() => requireWaitlistEncryptionKey(undefined), /waitlist_unavailable/);
  assert.deepEqual(waitlistAuditMetadata({ returnedRowCount: 50, requestedLimit: 50, hasCursor: true, hasMore: true }), {
    returnedRowCount: 50,
    requestedLimit: 50,
    hasCursor: true,
    hasMore: true,
  });
});

test('validates status changes, UUIDs and retention holds without accepting arbitrary input', () => {
  assert.equal(parseWaitlistId(cursor.id), cursor.id);
  assert.throws(() => parseWaitlistId('not-a-uuid'), /invalid_waitlist_id/);
  assert.equal(parseWaitlistStatusUpdate({ status: 'invited' }), 'invited');
  assert.throws(() => parseWaitlistStatusUpdate({ status: 'waiting' }), /invalid_waitlist_status/);
  assert.doesNotThrow(() => assertWaitlistStatusTransition('waiting', 'invited'));
  assert.doesNotThrow(() => assertWaitlistStatusTransition('invited', 'converted'));
  assert.throws(() => assertWaitlistStatusTransition('converted', 'invited'), /waitlist_status_transition_invalid/);
  assert.equal(parseWaitlistRetentionHoldUpdate({ active: true }), true);
  assert.throws(() => parseWaitlistRetentionHoldUpdate({ active: 'true' }), /invalid_waitlist_retention_hold/);
});
