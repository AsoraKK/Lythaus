import assert from 'node:assert/strict';
import test from 'node:test';

import { issueAuthSession, revokeAllAuthSessions, rotateAuthSession } from '../src/auth-session-runtime.ts';

function tokenDependencies(events, overrides = {}) {
  let identifier = 0;
  return {
    randomToken(bytes) {
      events.push(['randomToken', bytes]);
      return `refresh-${bytes}`;
    },
    hashRefreshToken(token) {
      events.push(['hashRefreshToken', token]);
      return `hash:${token}`;
    },
    newId() {
      identifier += 1;
      const value = `id-${identifier}`;
      events.push(['newId', value]);
      return value;
    },
    async signAccessToken(input) {
      events.push(['signAccessToken', input]);
      return `access:${input.userId}:${input.tokenVersion}`;
    },
    ...overrides,
  };
}

test('issues one family and one session only for an active account', async () => {
  const events = [];
  const dependencies = tokenDependencies(events, {
    async loadAccount(userId) {
      events.push(['loadAccount', userId]);
      return { status: 'active', tokenVersion: 3 };
    },
    async createRefreshFamilyAndSession(input) {
      events.push(['createRefreshFamilyAndSession', input]);
    },
  });

  const result = await issueAuthSession(dependencies, { userId: 'user-1', roles: ['member'] });
  assert.deepEqual(result, { accessToken: 'access:user-1:3', refreshToken: 'refresh-32', expiresIn: 900 });
  assert.deepEqual(events, [
    ['loadAccount', 'user-1'],
    ['signAccessToken', { userId: 'user-1', roles: ['member'], tokenVersion: 3 }],
    ['randomToken', 32],
    ['newId', 'id-1'],
    ['newId', 'id-2'],
    ['hashRefreshToken', 'refresh-32'],
    ['createRefreshFamilyAndSession', {
      familyId: 'id-1', sessionId: 'id-2', userId: 'user-1', refreshTokenHash: 'hash:refresh-32', refreshSessionDays: 30,
    }],
  ]);

  const deniedEvents = [];
  const denied = tokenDependencies(deniedEvents, {
    async loadAccount() { return { status: 'suspended', tokenVersion: 3 }; },
    async createRefreshFamilyAndSession() { throw new Error('must not persist'); },
  });
  await assert.rejects(() => issueAuthSession(denied, { userId: 'user-2' }), /account_unavailable/);
  assert.equal(deniedEvents.some(([name]) => name === 'createRefreshFamilyAndSession'), false);
});

test('does not persist a refresh session when access-token signing fails', async () => {
  const events = [];
  const dependencies = tokenDependencies(events, {
    async loadAccount() { return { status: 'active', tokenVersion: 3 }; },
    async signAccessToken(input) {
      events.push(['signAccessToken', input]);
      throw new Error('signing_failed');
    },
    async createRefreshFamilyAndSession() { throw new Error('must not persist'); },
  });
  await assert.rejects(() => issueAuthSession(dependencies, { userId: 'user-1' }), /signing_failed/);
  assert.equal(events.some(([name]) => name === 'createRefreshFamilyAndSession'), false);
  assert.equal(events.some(([name]) => name === 'randomToken'), false);
});

test('rotates only the presented session and signs a replacement token', async () => {
  const events = [];
  const dependencies = tokenDependencies(events, {
    async findRefreshSession(tokenHash) {
      events.push(['findRefreshSession', tokenHash]);
      return { sessionId: 'session-1', userId: 'user-1', familyId: 'family-1', status: 'active', tokenState: 'active' };
    },
    async rotatePresentedSession(input) {
      events.push(['rotatePresentedSession', input]);
      return true;
    },
    async revokeRefreshFamily(familyId) { events.push(['revokeRefreshFamily', familyId]); },
    async loadActiveTokenVersion(userId) { events.push(['loadActiveTokenVersion', userId]); return 4; },
  });

  const result = await rotateAuthSession(dependencies, 'presented-token');
  assert.deepEqual(result, { accessToken: 'access:user-1:4', refreshToken: 'refresh-32', expiresIn: 900 });
  assert.equal(events.some(([name]) => name === 'revokeRefreshFamily'), false);
  assert.deepEqual(events.find(([name]) => name === 'rotatePresentedSession'), ['rotatePresentedSession', {
    sessionId: 'session-1', userId: 'user-1', familyId: 'family-1', replacementTokenHash: 'hash:refresh-32', replacementSessionId: 'id-1', refreshSessionDays: 30,
  }]);
});

test('revokes the whole refresh family after a CAS reuse conflict', async () => {
  const events = [];
  const dependencies = tokenDependencies(events, {
    async findRefreshSession() { return { sessionId: 'session-1', userId: 'user-1', familyId: 'family-1', status: 'active', tokenState: 'active' }; },
    async rotatePresentedSession() { return false; },
    async revokeRefreshFamily(familyId) { events.push(['revokeRefreshFamily', familyId]); },
    async loadActiveTokenVersion() { throw new Error('must not load version'); },
  });

  await assert.rejects(() => rotateAuthSession(dependencies, 'presented-token'), /refresh_token_reuse/);
  assert.deepEqual(events, [
    ['hashRefreshToken', 'presented-token'],
    ['randomToken', 32],
    ['hashRefreshToken', 'refresh-32'],
    ['newId', 'id-1'],
    ['revokeRefreshFamily', 'family-1'],
  ]);
});

test('denies unknown or inactive refresh sessions before persistence', async () => {
  for (const record of [undefined, { sessionId: 's', userId: 'u', familyId: 'f', status: 'locked', tokenState: 'active' }]) {
    const events = [];
    const dependencies = tokenDependencies(events, {
      async findRefreshSession() { return record; },
      async rotatePresentedSession() { throw new Error('must not rotate'); },
      async revokeRefreshFamily() { throw new Error('must not revoke'); },
      async loadActiveTokenVersion() { throw new Error('must not load'); },
    });
    await assert.rejects(() => rotateAuthSession(dependencies, 'bad-token'), /refresh_token_invalid/);
    assert.equal(events.some(([name]) => name === 'randomToken'), false);
  }
});

test('logout and password-reset invalidation revoke sessions, families, then token versions', async () => {
  const events = [];
  await revokeAllAuthSessions({
    async revokeAllSessions(userId) { events.push(['revokeAllSessions', userId]); },
    async revokeAllRefreshFamilies(userId) { events.push(['revokeAllRefreshFamilies', userId]); },
    async bumpTokenVersion(userId) { events.push(['bumpTokenVersion', userId]); },
  }, 'user-1');
  assert.deepEqual(events, [
    ['revokeAllSessions', 'user-1'],
    ['revokeAllRefreshFamilies', 'user-1'],
    ['bumpTokenVersion', 'user-1'],
  ]);
});

test('rejects invalid account token versions before issuing a refresh family', async () => {
  for (const tokenVersion of [undefined, -1, 1.5, Number.NaN]) {
    const events = [];
    const dependencies = tokenDependencies(events, {
      async loadAccount() { return { status: 'active', tokenVersion }; },
      async createRefreshFamilyAndSession() { throw new Error('must not persist'); },
    });
    await assert.rejects(() => issueAuthSession(dependencies, { userId: 'user-1' }), /account_unavailable/);
    assert.equal(events.some(([name]) => name === 'createRefreshFamilyAndSession'), false);
  }
});

test('sequential reuse of a known rotated token revokes its family but unknown tokens do not', async () => {
  const reuseEvents = [];
  await assert.rejects(() => rotateAuthSession(tokenDependencies(reuseEvents, {
    async findRefreshSession() { return { sessionId: 'old', userId: 'user-1', familyId: 'family-1', status: 'active', tokenState: 'revoked' }; },
    async rotatePresentedSession() { throw new Error('must not rotate'); },
    async revokeRefreshFamily(familyId) { reuseEvents.push(['revokeRefreshFamily', familyId]); },
    async loadActiveTokenVersion() { throw new Error('must not load'); },
  }), 'old-token'), /refresh_token_reuse/);
  assert.deepEqual(reuseEvents, [
    ['hashRefreshToken', 'old-token'],
    ['revokeRefreshFamily', 'family-1'],
  ]);

  const unknownEvents = [];
  await assert.rejects(() => rotateAuthSession(tokenDependencies(unknownEvents, {
    async findRefreshSession() { return undefined; },
    async rotatePresentedSession() { throw new Error('must not rotate'); },
    async revokeRefreshFamily() { throw new Error('must not revoke'); },
    async loadActiveTokenVersion() { throw new Error('must not load'); },
  }), 'unknown-token'), /refresh_token_invalid/);
  assert.equal(unknownEvents.some(([name]) => name === 'revokeRefreshFamily'), false);
});

test('revokes the replacement family when the active account version disappears or signing fails', async () => {
  for (const failure of ['version', 'sign']) {
    const events = [];
    const dependencies = tokenDependencies(events, {
      async findRefreshSession() { return { sessionId: 'session-1', userId: 'user-1', familyId: 'family-1', status: 'active', tokenState: 'active' }; },
      async rotatePresentedSession() { return true; },
      async revokeRefreshFamily(familyId) { events.push(['revokeRefreshFamily', familyId]); },
      async loadActiveTokenVersion() { return failure === 'version' ? undefined : 2; },
      async signAccessToken(input) {
        events.push(['signAccessToken', input]);
        if (failure === 'sign') throw new Error('signing_failed');
        return 'access';
      },
    });
    await assert.rejects(() => rotateAuthSession(dependencies, 'presented-token'), failure === 'version' ? /account_unavailable/ : /signing_failed/);
    assert.deepEqual(events.filter(([name]) => name === 'revokeRefreshFamily'), [['revokeRefreshFamily', 'family-1']]);
  }
});
