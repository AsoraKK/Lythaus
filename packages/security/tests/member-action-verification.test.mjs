import assert from 'node:assert/strict';
import test from 'node:test';
import { exportJWK, exportPKCS8, generateKeyPair, decodeJwt, SignJWT } from 'jose';
import { signAccessToken, verifyAccessToken, LYTHAUS_ACCESS_TOKEN_AUDIENCE, LYTHAUS_ACCESS_TOKEN_ISSUER } from '../src/jwt.ts';
import { issueRecentAccountProof, knownSensitiveOperation, parseAccountProof, proofMatches,
  recentAccountPolicyEnabled, sensitiveOperationDigest } from '../src/member-action-verification.ts';

const id = '019a0000-0000-7000-8000-000000000001';
const family = '019a0000-0000-7000-8000-000000000002';
const session = { userId: id, sessionFamilyId: family, tokenVersion: 3 };
const operation = knownSensitiveOperation('POST', '/api/rewards/synthetic-reward/redeem', '{}');
const verifiedAt = '2026-10-23T12:00:00.000Z', expiresAt = '2026-10-23T12:05:00.000Z';
const digest = operation => sensitiveOperationDigest(operation, 'synthetic-existing-hmac-key');

function issuer(overrides = {}) {
  const events = [];
  const dependencies = {
    async loadCredential() { events.push('credential'); return { credentialId: id, passwordHash: 'server-record' }; },
    verifyPassword(password, hash) { events.push(['verify', password, hash]); return password === 'existing password'; },
    randomSecret() { events.push('secret'); return 'a'.repeat(64); },
    newId() { return id; },
    hashSecret(secret) { return `hash:${secret}`; },
    hashOperation: digest,
    async persist(record) { events.push(['persist', record]); return { verifiedAt, expiresAt }; },
    ...overrides,
  };
  return { events, dependencies };
}

test('policy is disabled by default; issuance performs no I/O while disabled', async () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1']) assert.equal(recentAccountPolicyEnabled(value), false);
  assert.equal(recentAccountPolicyEnabled('true'), true);
  const h = issuer();
  await assert.rejects(issueRecentAccountProof(h.dependencies,
    { enabled: false, session, operation, password: 'existing password' }), /unavailable/);
  assert.deepEqual(h.events, []);
});

test('server password verification precedes minting; persistence receives hashes, not password or nonce', async () => {
  const h = issuer();
  const result = await issueRecentAccountProof(h.dependencies,
    { enabled: true, session, operation, password: 'existing password', biometric: true });
  assert.equal(result.proof, `${id}.${'a'.repeat(64)}`);
  assert.equal(result.expiresAt, expiresAt);
  assert.deepEqual(h.events.slice(0, 3), ['credential', ['verify', 'existing password', 'server-record'], 'secret']);
  const record = h.events.find(e => Array.isArray(e) && e[0] === 'persist')[1];
  assert.equal(record.credentialId, id);
  assert.equal(record.operationHash, await digest(operation));
  assert.equal(Object.hasOwn(record, 'password'), false);
  assert.equal(Object.hasOwn(record, 'secret'), false);
});

test('wrong/absent password, absent credential or session binding never mints proof', async () => {
  for (const input of [
    { session, password: 'incorrect' }, { session, password: undefined, locallyUnlocked: true },
    { session: { userId: id, tokenVersion: 3, iat: Date.now() }, password: 'existing password' },
  ]) {
    const h = issuer();
    await assert.rejects(issueRecentAccountProof(h.dependencies, { enabled: true, operation, ...input }));
    assert.equal(h.events.includes('secret'), false);
  }
  const missing = issuer({ async loadCredential() { return undefined; } });
  await assert.rejects(issueRecentAccountProof(missing.dependencies,
    { enabled: true, session, operation, password: 'existing password' }), /unavailable/);
});

test('only the approved existing mutation routes classify; query strings cannot bypass policy', () => {
  assert.equal(knownSensitiveOperation('POST', '/api/privacy/requests?source=settings', '{"requestType":"delete"}').action, 'account_delete');
  assert.equal(knownSensitiveOperation('POST', '/api/rewards/r/redeem?source=settings', '').action, 'reward_claim');
  for (const [method, path, body] of [
    ['GET', '/api/feed', ''], ['GET', '/api/rewards/me', ''],
    ['POST', '/api/privacy/requests', '{"requestType":"export"}'],
    ['POST', '/api/privacy/requests', '{"requestType":"rectify"}'],
    ['POST', '/api/auth/logout', '{}'], ['POST', '/api/auth/password/reset/complete', '{}'],
    ['PATCH', '/api/users/me', '{}'], ['POST', '/api/account/email', '{}'],
  ]) assert.equal(knownSensitiveOperation(method, path, body), undefined);
});

test('all approved action types require exact user/session/version/action/operation/secret and five-minute age', async () => {
  const operationHash = await digest(operation);
  const proof = { id, userId: id, sessionFamilyId: family, tokenVersion: 3, action: 'reward_claim', operationHash,
    secretHash: 'server-secret-hash', credentialId: id, verifiedAt, expiresAt, consumedAt: null };
  const input = { proof, session, action: 'reward_claim', operationHash, secretHash: proof.secretHash,
    now: Date.parse(verifiedAt) + 299999 };
  assert.equal(proofMatches(input), true);
  for (const change of [
    { now: Date.parse(expiresAt) }, { now: Date.parse(verifiedAt) - 1 }, { now: NaN },
    { session: { ...session, userId: family } }, { session: { ...session, sessionFamilyId: id } },
    { session: { ...session, tokenVersion: 4 } }, { session: { userId: id, tokenVersion: 3, locallyUnlocked: true } },
    { action: 'account_delete' }, { action: 'email_change' }, { action: 'security_change' },
    { operationHash: 'different-body' }, { secretHash: 'different-secret' },
    { proof: { ...proof, credentialId: family } }, { proof: { ...proof, consumedAt: verifiedAt } },
    { proof: { ...proof, expiresAt: '2026-10-23T12:06:00.000Z' } },
  ]) assert.equal(proofMatches({ ...input, ...change }), false);
  assert.equal(proofMatches({ ...input, session: { ...session, iat: Date.now(), biometric: true },
    now: Date.parse(expiresAt) + 1 }), false);
});

test('request binding distinguishes body, query, method and sensitive action', async () => {
  const original = await digest(operation);
  for (const change of [{ body: '{"different":true}' }, { path: `${operation.path}?different=true` },
    { method: 'DELETE' }, { action: 'account_delete' }]) {
    assert.notEqual(await digest({ ...operation, ...change }), original);
  }
  for (const value of [null, '', 'true', 'a'.repeat(64), `${id}.${'b'.repeat(63)}`, `${id}.${'B'.repeat(64)}`]) {
    assert.throws(() => parseAccountProof(value), /required/);
  }
  assert.notEqual(await sensitiveOperationDigest(operation, 'different-key'), original);
  await assert.rejects(sensitiveOperationDigest(operation, ''), /unavailable/);
});

test('access-token lifetime, claims and Principal stay unchanged; fresh iat is not authentication evidence', async () => {
  const keys = await generateKeyPair('ES256', { extractable: true });
  const privateKeyPem = await exportPKCS8(keys.privateKey);
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'synthetic-key', alg: 'ES256' };
  const jwks = JSON.stringify({ keys: [jwk] });
  const token = await signAccessToken({ userId: id, tokenVersion: 3, privateKeyPem, keyId: jwk.kid });
  const claims = decodeJwt(token);
  assert.equal(claims.exp - claims.iat, 900);
  assert.equal(Object.hasOwn(claims, 'sid'), false);
  assert.equal(Object.hasOwn(claims, 'auth_time'), false);
  assert.deepEqual(await verifyAccessToken(token, jwks), { userId: id, roles: [], tokenVersion: 3 });
  const extraClaims = await new SignJWT({ tokenVersion: 3, sid: family, auth_time: Date.now(), locallyUnlocked: true })
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid }).setIssuer(LYTHAUS_ACCESS_TOKEN_ISSUER)
    .setAudience(LYTHAUS_ACCESS_TOKEN_AUDIENCE).setSubject(id).setIssuedAt().setExpirationTime('900s').sign(keys.privateKey);
  assert.deepEqual(await verifyAccessToken(extraClaims, jwks), { userId: id, roles: [], tokenVersion: 3 });
});
