import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCOUNT_SUPPORT_HISTORY_NOTICE, ACCOUNT_SUPPORT_SOURCES, accountSupportSnapshot, safeSupportCode, supportTimestamp, supportUuid } from '../src/account-support.ts';

const snapshot = { id: '01900000-0000-7000-8000-000000000001', status: 'active', verificationState: 'verified',
  verifiedAt: '2026-10-01T10:00:00Z', createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z',
  deletedAt: null, lastSignInAt: null, activeSessionCount: 0, subscriptionTier: 'free' };

test('support snapshot uses a fixed field allowlist and keeps absent facts null', () => {
  const result = accountSupportSnapshot({ ...snapshot, password_hash: 'secret', email: 'synthetic@example.invalid', resetLink: 'https://example.invalid/token', privateContent: 'private' });
  assert.deepEqual(Object.keys(result), Object.keys(snapshot));
  assert.equal(result.lastSignInAt, null);
  assert.equal(result.activeSessionCount, 0);
  assert.equal(result.createdAt, '2026-09-01T10:00:00.000000Z');
  assert.ok(!JSON.stringify(result).includes('secret'));
  for (const status of ['active', 'suspended', 'locked', 'deleted', 'relink_required']) assert.equal(accountSupportSnapshot({ ...snapshot, status }).status, status);
  for (const verificationState of ['verified', 'pending_verification', 'credential_setup_required']) assert.equal(accountSupportSnapshot({ ...snapshot, verificationState, verifiedAt: null }).verifiedAt, null);
  for (const subscriptionTier of ['free', 'premium', 'black']) assert.equal(accountSupportSnapshot({ ...snapshot, subscriptionTier }).subscriptionTier, subscriptionTier);
});

test('malformed delegated snapshots fail closed', () => {
  for (const value of [null, [], 3, {}, { ...snapshot, id: 'other' }, { ...snapshot, status: 'other' },
    { ...snapshot, verificationState: 'other' }, { ...snapshot, subscriptionTier: 'other' },
    { ...snapshot, activeSessionCount: -1 }, { ...snapshot, activeSessionCount: '1' }, { ...snapshot, activeSessionCount: 1.5 },
    { ...snapshot, createdAt: 'bad' }, { ...snapshot, verifiedAt: undefined }, { ...snapshot, lastSignInAt: 'bad' }]) {
    assert.throws(() => accountSupportSnapshot(value), /account_support_unavailable/);
  }
});

test('timestamps preserve PostgreSQL microseconds and reject rollover, timezone ambiguity and malformed values', () => {
  assert.equal(supportTimestamp('2026-10-02T01:02:03.000001Z'), '2026-10-02T01:02:03.000001Z');
  assert.equal(supportTimestamp('2026-10-02T01:02:03.4Z'), '2026-10-02T01:02:03.400000Z');
  for (const value of [null, 1, '2026-02-30T10:00:00Z', '2026-13-01T00:00:00Z', '2026-10-02',
    '2026-10-02T01:02:03', '2026-10-02T01:02:03+00:00', '2026-10-02T24:00:00Z', '2026-10-02T01:02:03.1234567Z']) {
    assert.throws(() => supportTimestamp(value), /invalid_date_filter/);
  }
});

test('machine fields reject arbitrary prose and links, and history describes its coverage honestly', () => {
  assert.equal(safeSupportCode('account.login_succeeded'), 'account.login_succeeded');
  assert.equal(safeSupportCode('x', 1), 'x');
  for (const value of [null, {}, 'private message', 'https://example.invalid/reset?token=secret', 'synthetic@example.invalid', '<script>', 'x'.repeat(101)]) assert.equal(safeSupportCode(value), null);
  assert.equal(supportUuid(snapshot.id), true);
  for (const value of [null, 1, '01900000-0000-0000-0000-000000000001', 'not-an-id']) assert.equal(supportUuid(value), false);
  assert.deepEqual(ACCOUNT_SUPPORT_SOURCES, ['account', 'activity', 'audit']);
  assert.match(ACCOUNT_SUPPORT_HISTORY_NOTICE, /partial recorded history/);
  assert.match(ACCOUNT_SUPPORT_HISTORY_NOTICE, /does not prove/);
});
