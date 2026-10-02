import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeProfileName, isDisallowedProfileName } from '../../../packages/contracts/src/profile-name-policy.ts';
import { parseDisplayName } from '../../lythaus-admin-api/src/admin-runtime-policy.ts';
import { parseProfileUpdate } from '../src/profile-runtime-policy.ts';

const fixtures = JSON.parse(readFileSync(new URL('../../../packages/contracts/fixtures/profile-name-policy.json', import.meta.url), 'utf8'));
for (const { value, valid } of fixtures) {
  test(`profile-name policy: ${JSON.stringify(value)}`, () => {
    if (valid) {
      assert.equal(normalizeProfileName(value), value.normalize('NFC').trim());
      assert.equal(parseDisplayName(value), normalizeProfileName(value));
      assert.deepEqual(parseProfileUpdate({ displayName: value }), { displayName: normalizeProfileName(value) });
    } else {
      assert.throws(() => normalizeProfileName(value), /invalid_display_name/);
      assert.throws(() => parseDisplayName(value), /invalid_display_name/);
      assert.throws(() => parseProfileUpdate({ displayName: value }), /invalid_display_name/);
    }
  });
}

test('name boundaries preserve legitimate names and reject invalid types and lengths', () => {
  for (const value of [undefined, null, {}, [], 12, true]) assert.throws(() => normalizeProfileName(value), /invalid_display_name/);
  assert.equal(parseDisplayName(undefined), undefined);
  assert.equal(normalizeProfileName('a'.repeat(160)).length, 160);
  assert.throws(() => normalizeProfileName('a'.repeat(161)), /invalid_display_name/);
  assert.equal(isDisallowedProfileName('Shitara'), false);
  assert.equal(isDisallowedProfileName('ＦＵＣＫ'), true);
});

test('profile patches accept independent optional fields without inventing omitted values', () => {
  assert.deepEqual(parseProfileUpdate({ bio: '  A partial profile  ' }), { bio: 'A partial profile' });
  assert.deepEqual(parseProfileUpdate({ bio: '' }), { bio: '' });
  assert.deepEqual(parseProfileUpdate({ displayName: '  José  ' }), { displayName: 'José' });
  for (const trustPassportVisibility of ['private', 'public_minimal', 'public_expanded']) {
    assert.deepEqual(parseProfileUpdate({ trustPassportVisibility }), { trustPassportVisibility });
  }
});

test('profile patches reject malformed shapes, unrecognized fields, passwords and invalid optional fields', () => {
  for (const input of [null, '', true, [], {}, { password: 'synthetic-never-forwarded' }, { bio: 'ok', extra: true }]) {
    assert.throws(() => parseProfileUpdate(input), /invalid_profile_update/);
  }
  for (const bio of [null, 3, true, {}, [], 'a'.repeat(2001)]) assert.throws(() => parseProfileUpdate({ bio }), /invalid_bio/);
  assert.equal(parseProfileUpdate({ bio: 'a'.repeat(2000) }).bio.length, 2000);
  for (const trustPassportVisibility of [null, 1, 'hidden']) assert.throws(() => parseProfileUpdate({ trustPassportVisibility }), /invalid_profile_visibility/);
});

test('private accountability names share safeguards and support deliberate removal', () => {
  for (const accountabilityName of [null, '']) assert.deepEqual(parseProfileUpdate({ accountabilityName }), { accountabilityName: null });
  assert.deepEqual(parseProfileUpdate({ accountabilityName: '  Zoë  ' }), { accountabilityName: 'Zoë' });
  for (const accountabilityName of [false, 4, [], {}, 'a', 'a'.repeat(161), 'fuck']) {
    assert.throws(() => parseProfileUpdate({ accountabilityName }), /invalid_accountability_name/);
  }
});
