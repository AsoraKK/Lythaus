import assert from 'node:assert/strict';
import test from 'node:test';
import { hmac } from '@noble/hashes/hmac';
import { scrypt } from '@noble/hashes/scrypt';
import { sha256 } from '@noble/hashes/sha2';
import { SignJWT, exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import {
  LYTHAUS_ACCESS_TOKEN_AUDIENCE,
  LYTHAUS_ACCESS_TOKEN_ISSUER,
  constantTimeEqual,
  decryptField,
  encryptField,
  hashPassword,
  hashResetToken,
  hmacLookup,
  needsPasswordRehash,
  randomToken,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
  verifyLoginPassword,
} from '../src/index.ts';

function encode(bytes) {
  return Buffer.from(bytes).toString('base64');
}

test('unknown login runs the current password verifier but can never authenticate a fixture digest',()=>{
  assert.equal(verifyLoginPassword('synthetic unknown password',undefined,'synthetic-pepper'),false);
  const stored=hashPassword('olderpass12!','synthetic-pepper');
  assert.equal(verifyLoginPassword('olderpass12!',stored,'synthetic-pepper'),true);
  assert.equal(verifyLoginPassword('wrong',stored,'synthetic-pepper'),false);
});

function legacyScryptHash(password, pepper) {
  const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
  const derived = scrypt(password, salt, { N: 2 ** 14, r: 8, p: 5, dkLen: 32 });
  return {
    algorithm: 'scrypt',
    version: 1,
    salt: encode(salt),
    digest: encode(hmac(sha256, new TextEncoder().encode(pepper), derived)),
    pepperVersion: 'v1',
  };
}

async function signingFixture() {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'critical-test-key';
  publicJwk.use = 'sig';
  publicJwk.alg = 'ES256';
  return {
    privateKey,
    privateKeyPem: await exportPKCS8(privateKey),
    jwksJson: JSON.stringify({ keys: [publicJwk] }),
  };
}

function trustedTokenBuilder(payload, subject) {
  const builder = new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: 'critical-test-key', typ: 'JWT' })
    .setIssuer(LYTHAUS_ACCESS_TOKEN_ISSUER)
    .setAudience(LYTHAUS_ACCESS_TOKEN_AUDIENCE);
  if (subject) builder.setSubject(subject);
  return builder.setIssuedAt().setExpirationTime('60s');
}

test('security primitives protect passwords, lookups, and encrypted PII', async () => {
  const pepper = 'pepper-v1';
  const password = hashPassword('correct horse battery staple', pepper, { pepperVersion: 'v2' });
  assert.equal(password.algorithm, 'argon2id');
  assert.equal(verifyPassword('correct horse battery staple', password, pepper), true);
  assert.equal(verifyPassword('incorrect', password, pepper), false);
  assert.equal(needsPasswordRehash(password, 'v2'), false);
  assert.equal(needsPasswordRehash({ ...password, pepperVersion: 'v1' }, 'v2'), true);
  assert.equal(needsPasswordRehash({ ...password, version: 0 }, 'v2'), true);
  assert.equal(needsPasswordRehash({ ...password, algorithm: 'scrypt' }, 'v2'), true);

  const legacy = legacyScryptHash('legacy password', pepper);
  assert.equal(verifyPassword('legacy password', legacy, pepper), true);
  assert.equal(verifyPassword('legacy password', legacy, 'wrong-pepper'), false);
  assert.equal(verifyPassword('legacy password', legacy, pepper, 'v2'), false);
  for (const invalid of [
    { ...legacy, algorithm: 'unknown' }, { ...legacy, version: 0 },
    { ...legacy, salt: 'bad%' }, { ...legacy, digest: 'bad%' },
    { ...legacy, salt: encode(new Uint8Array(15)) }, { ...legacy, digest: encode(new Uint8Array(31)) },
  ]) assert.equal(verifyPassword('legacy password', invalid, pepper), false);
  for (const older of ['olderpass12!', 'olderpass123!', 'olderpass1234!']) {
    assert.equal(verifyPassword(older, legacyScryptHash(older, pepper), pepper, 'v1'), true);
  }
  const literal = '  e\u0301 long password  ';
  const literalHash = hashPassword(literal, pepper);
  assert.equal(verifyPassword(literal, literalHash, pepper), true);
  assert.equal(verifyPassword(literal.trim(), literalHash, pepper), false);
  assert.equal(verifyPassword(literal.normalize('NFC'), literalHash, pepper), false);

  assert.match(randomToken(4), /^[0-9a-f]{8}$/);
  assert.match(randomToken(), /^[0-9a-f]{64}$/);
  assert.equal(constantTimeEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2)), true);
  assert.equal(constantTimeEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 3)), false);
  assert.equal(constantTimeEqual(Uint8Array.of(1), Uint8Array.of(1, 2)), false);
  assert.equal(hmacLookup(' Person@Example.test ', 'lookup-key'), hmacLookup('person@example.test', 'lookup-key'));
  assert.notEqual(hmacLookup('person@example.test', 'lookup-key'), hmacLookup('person@example.test', 'other-key'));
  assert.notEqual(hashResetToken('reset-one'), hashResetToken('reset-two'));

  const encryptionKey = encode(Uint8Array.from({ length: 32 }, (_, index) => index));
  const otherKey = encode(Uint8Array.from({ length: 32 }, (_, index) => 31 - index));
  const encrypted = await encryptField('person@example.test', encryptionKey, 'v2');
  assert.equal(encrypted.encryptionKeyVersion, 'v2');
  assert.notEqual(encrypted.ciphertext, 'person@example.test');
  assert.equal(await decryptField(encrypted, encryptionKey), 'person@example.test');
  await assert.rejects(decryptField(encrypted, otherKey));
  await assert.rejects(decryptField({ ...encrypted, ciphertext: '.ciphertext' }, encryptionKey), /encrypted_field_invalid/);
  await assert.rejects(decryptField({ ...encrypted, ciphertext: 'nonce.' }, encryptionKey), /encrypted_field_invalid/);
  await assert.rejects(encryptField('person@example.test', encode(new Uint8Array(31)), 'v2'), /aes256_key_required/);
});

test('access-token verification rejects malformed, expired, cross-issuer, cross-audience, and untrusted claims', async () => {
  const fixture = await signingFixture();
  const defaultToken = await signAccessToken({
    userId: 'user-default',
    privateKeyPem: fixture.privateKeyPem,
    keyId: 'critical-test-key',
  });
  assert.deepEqual(await verifyAccessToken(defaultToken, fixture.jwksJson), {
    userId: 'user-default',
    roles: [],
    tokenVersion: 1,
  });

  const filteredRoles = await trustedTokenBuilder({ roles: ['member', 42, null] }, 'user-filtered')
    .sign(fixture.privateKey);
  assert.deepEqual(await verifyAccessToken(filteredRoles, fixture.jwksJson), {
    userId: 'user-filtered',
    roles: ['member'],
    tokenVersion: 1,
  });

  const untypedClaims = await trustedTokenBuilder({ roles: 'admin', tokenVersion: 1 }, 'user-untyped')
    .sign(fixture.privateKey);
  assert.deepEqual(await verifyAccessToken(untypedClaims, fixture.jwksJson), {
    userId: 'user-untyped',
    roles: [],
    tokenVersion: 1,
  });
  for (const tokenVersion of ['two', null, 0, -1, 2.5, Number.MAX_SAFE_INTEGER + 1]) {
    const token = await trustedTokenBuilder({tokenVersion}, 'synthetic-user').sign(fixture.privateKey);
    await assert.rejects(verifyAccessToken(token, fixture.jwksJson), /token_version_invalid/);
  }
  const future = await trustedTokenBuilder({}, 'synthetic-user').setNotBefore('5m').sign(fixture.privateKey);
  await assert.rejects(verifyAccessToken(future, fixture.jwksJson));
  const noExpiry = await new SignJWT({tokenVersion:1})
    .setProtectedHeader({alg:'ES256',kid:'critical-test-key',typ:'JWT'})
    .setIssuer(LYTHAUS_ACCESS_TOKEN_ISSUER).setAudience(LYTHAUS_ACCESS_TOKEN_AUDIENCE)
    .setSubject('synthetic-user').setIssuedAt().sign(fixture.privateKey);
  await assert.rejects(verifyAccessToken(noExpiry, fixture.jwksJson));

  const missingSubject = await trustedTokenBuilder({ roles: [] })
    .sign(fixture.privateKey);
  await assert.rejects(verifyAccessToken(missingSubject, fixture.jwksJson), /token_subject_missing/);
  await assert.rejects(verifyAccessToken(defaultToken, JSON.stringify({ keys: [] })));
  await assert.rejects(verifyAccessToken(defaultToken, 'not-json'));

  const wrongIssuer = await new SignJWT({ roles: [] })
    .setProtectedHeader({ alg: 'ES256', kid: 'critical-test-key', typ: 'JWT' })
    .setIssuer('https://attacker.invalid')
    .setAudience(LYTHAUS_ACCESS_TOKEN_AUDIENCE)
    .setSubject('user-wrong-issuer')
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(fixture.privateKey);
  await assert.rejects(verifyAccessToken(wrongIssuer, fixture.jwksJson));

  const wrongAudience = await new SignJWT({ roles: [] })
    .setProtectedHeader({ alg: 'ES256', kid: 'critical-test-key', typ: 'JWT' })
    .setIssuer(LYTHAUS_ACCESS_TOKEN_ISSUER)
    .setAudience('untrusted-client')
    .setSubject('user-wrong-audience')
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(fixture.privateKey);
  await assert.rejects(verifyAccessToken(wrongAudience, fixture.jwksJson));

  const expiredToken = await signAccessToken({
    userId: 'user-expired',
    privateKeyPem: fixture.privateKeyPem,
    keyId: 'critical-test-key',
    roles: ['member'],
    tokenVersion: 3,
    expiresInSeconds: -5,
  });
  await assert.rejects(verifyAccessToken(expiredToken, fixture.jwksJson));
});
