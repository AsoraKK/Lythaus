import assert from 'node:assert/strict';
import test from 'node:test';

import { recentAccountAuthenticationGate } from '../src/recent-account-authentication.ts';

test('freshness foundation is inactive by default and adds no live requirement', () => {
  assert.deepEqual(recentAccountAuthenticationGate(), { enforcement: 'inactive' });
  assert.deepEqual(recentAccountAuthenticationGate(false), { enforcement: 'inactive' });
});

test('explicit activation denies until a trusted evidence provider exists', () => {
  assert.deepEqual(recentAccountAuthenticationGate(true), {
    enforcement: 'deny', reason: 'recent_account_authentication_unavailable',
  });
});

test('local unlock, renewed JWT iat, preference, reputation and client auth claims cannot supply proof', () => {
  for (const clientClaims of [
    { biometric: true, locallyUnlocked: true },
    { pinVerified: true, deviceCredential: true },
    { iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    { auth_time: Date.now(), amr: ['pwd'], verified: true },
    { preference: 'every_reopen', reputation: 999999 },
    { offline: true, previousAuthentication: 'verified' },
  ]) {
    assert.equal(recentAccountAuthenticationGate(true, clientClaims).enforcement, 'deny');
    assert.equal(recentAccountAuthenticationGate(clientClaims).enforcement, 'deny');
  }
});
