import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('@lythaus/contracts', { cache: true, namedExports: {
  pageRequest: (url, maximum = 50, defaultLimit = 25) => ({
    limit: Math.min(maximum, Number(url.searchParams.get('limit') ?? defaultLimit)),
    cursor: url.searchParams.get('cursor') ? { timestamp: '2026-08-10T00:00:00.000Z', id: '01900000-0000-7000-8000-000000000001' } : null,
  }),
} });

const {
  adminUserPageRequest,
  adminWaitlistFilters,
  parseAdminUserId,
  parseDisplayName,
  parseHandle,
  parseReasonCode,
  rejectUnknownFields,
  requireConfirmation,
} = await import('../src/admin-runtime-policy.ts');

const USER_ID = '01900000-0000-7000-8000-000000000001';

test('admin user pagination accepts bounded filters and opaque cursors', () => {
  const request = new URL(`https://admin.lythaus.co/api/admin/users?limit=100&q=person@example.com&status=pending_verification&source=email&createdAfter=2026-08-01T00:00:00Z&cursor=eyJ0aW1lc3RhbXAiOiIyMDI2LTA4LTEwVDAwOjAwOjAwLjAwMFoiLCJpZCI6IjAxOTAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9`);
  const result = adminUserPageRequest(request);
  assert.equal(result.limit, 100);
  assert.equal(result.query, 'person@example.com');
  assert.equal(result.status, 'pending_verification');
  assert.equal(result.source, 'email');
  assert.ok(result.cursor);
});

test('waitlist filters reject invalid values and preserve safe values', () => {
  assert.deepEqual(adminWaitlistFilters(new URL('https://admin.lythaus.co/api/admin/waitlist?q=person%40example.com&status=waiting&source=keeper')), {
    query: 'person@example.com', status: 'waiting', source: 'keeper', createdAfter: null, createdBefore: null,
  });
  assert.throws(() => adminWaitlistFilters(new URL('https://admin.lythaus.co/api/admin/waitlist?status=unknown')), /invalid_waitlist_status/);
});

test('keeper mutation policy rejects unknown fields and requires exact confirmation', () => {
  assert.throws(() => rejectUnknownFields({ reasonCode: 'TEST', unexpected: true }, ['reasonCode']), /unknown_field/);
  assert.equal(parseReasonCode('  beta_invite '), 'BETA_INVITE');
  assert.throws(() => parseReasonCode('x'), /reason_code_required/);
  assert.throws(() => requireConfirmation('DELETE', 'DELETE ACCOUNT'), /confirmation_required/);
  assert.doesNotThrow(() => requireConfirmation('DELETE ACCOUNT', 'DELETE ACCOUNT'));
});

test('keeper identity fields are validated before database access', () => {
  assert.equal(parseAdminUserId(USER_ID), USER_ID);
  assert.equal(parseDisplayName('  Name  '), 'Name');
  assert.equal(parseHandle('Keeper_1'), 'Keeper_1');
  assert.throws(() => parseAdminUserId('not-an-id'), /invalid_user_id/);
  assert.throws(() => parseHandle('bad handle'), /invalid_handle/);
});
