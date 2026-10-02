import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { authenticationOptions, passkeyConfiguration, passkeyEvidence, passkeyName, passkeyOrigin,
  registrationOptions, verifyPasskeyAuthentication, verifyPasskeyRegistration } from '../src/passkeys.ts';
import { syntheticAuthenticator } from './passkey-fixtures.mjs';

const env = { PASSKEYS_ENABLED: 'true', PASSKEY_RP_ID: 'lythaus.co', PASSKEY_ALLOWED_ORIGINS: 'https://app.lythaus.co', CORS_ALLOWED_ORIGINS: 'https://app.lythaus.co' };
const config = passkeyConfiguration(env);

test('passkeys are opt-in and require a specific HTTPS origin, RP boundary and CORS authorization', () => {
  assert.throws(() => passkeyConfiguration({}), /feature_disabled/);
  for (const change of [{ PASSKEY_RP_ID: 'co' }, { PASSKEY_RP_ID: 'evil.co' }, { PASSKEY_ALLOWED_ORIGINS: 'http://app.lythaus.co' },
    { PASSKEY_ALLOWED_ORIGINS: 'https://app.lythaus.co.evil.test' }, { PASSKEY_ALLOWED_ORIGINS: 'https://app.lythaus.co/' }, { CORS_ALLOWED_ORIGINS: '' }]) {
    assert.throws(() => passkeyConfiguration({ ...env, ...change }), /passkeys_not_configured/);
  }
  for (const headers of [{}, { origin: 'https://evil.test', 'x-lythaus-auth-transport': 'cookie-v1' }, { origin: 'https://app.lythaus.co' }]) {
    assert.throws(() => passkeyOrigin(new Request('https://api.lythaus.co/api/auth/passkeys/login/options', { headers }), config), /auth_origin_not_allowed/);
  }
});

async function enrolled({ multiDevice = false, counter = 0 } = {}) {
  const authenticator = syntheticAuthenticator({ multiDevice, counter });
  const userHandle = randomBytes(32).toString('base64url');
  const options = await registrationOptions(config, userHandle, []);
  assert.equal(options.authenticatorSelection.userVerification, 'required');
  assert.equal(options.authenticatorSelection.residentKey, 'required');
  assert.equal(options.attestation, 'none');
  const result = await verifyPasskeyRegistration(authenticator.registration(options), options.challenge, config.origins[0], config.rpId);
  return { authenticator, userHandle, result, options };
}

test('real signatures verify for UV passkeys without collecting attestation or biometrics', async () => {
  const f = await enrolled();
  const options = await authenticationOptions(config);
  const result = await verifyPasskeyAuthentication({ response: f.authenticator.assertion(options, f.userHandle),
    challenge: options.challenge, origin: config.origins[0], rpId: config.rpId, userHandle: f.userHandle,
    credential: f.result.credential, deviceType: f.result.credentialDeviceType });
  assert.equal(result.userVerified, true);
});

for (const [name, overrides] of [['malicious origin', { origin: 'https://evil.test' }], ['wrong RP', { rpId: 'evil.test' }],
  ['missing user verification', { uv: false }], ['cross-origin frame', { extra: { crossOrigin: true } }],
  ['unexpected top origin', { extra: { topOrigin: 'https://evil.test' } }]]) {
  test(`registration rejects ${name}`, async () => {
    const f = await enrolled();
    await assert.rejects(verifyPasskeyRegistration(f.authenticator.registration(f.options, overrides), f.options.challenge, config.origins[0], config.rpId), /passkey_invalid/);
  });
  test(`authentication rejects ${name} even with a valid signature`, async () => {
    const f = await enrolled();
    const options = await authenticationOptions(config);
    await assert.rejects(verifyPasskeyAuthentication({ response: f.authenticator.assertion(options, f.userHandle, overrides),
      challenge: options.challenge, origin: config.origins[0], rpId: config.rpId, userHandle: f.userHandle,
      credential: f.result.credential, deviceType: f.result.credentialDeviceType }), /passkey_invalid/);
  });
}

test('wrong owner handle, altered signature and wrong challenge fail closed', async () => {
  const f = await enrolled();
  const options = await authenticationOptions(config);
  const valid = f.authenticator.assertion(options, f.userHandle);
  const base = { challenge: options.challenge, origin: config.origins[0], rpId: config.rpId, userHandle: f.userHandle, credential: f.result.credential, deviceType: f.result.credentialDeviceType };
  await assert.rejects(verifyPasskeyAuthentication({ ...base, response: { ...valid, response: { ...valid.response, userHandle: randomBytes(32).toString('base64url') } } }), /passkey_invalid/);
  await assert.rejects(verifyPasskeyAuthentication({ ...base, response: { ...valid, response: { ...valid.response, signature: randomBytes(72).toString('base64url') } } }), /passkey_invalid/);
  await assert.rejects(verifyPasskeyAuthentication({ ...base, response: valid, challenge: randomBytes(32).toString('base64url') }), /passkey_invalid/);
});

test('discoverable login requires a user handle; owner-bound maintenance allows omission but rejects a different handle', async () => {
  const f = await enrolled();
  const options = await authenticationOptions(config, [f.result.credential]);
  const response = f.authenticator.assertion(options, undefined);
  const base = { response, challenge: options.challenge, origin: config.origins[0], rpId: config.rpId, userHandle: f.userHandle, credential: f.result.credential, deviceType: f.result.credentialDeviceType };
  await assert.rejects(verifyPasskeyAuthentication(base), /passkey_invalid/);
  assert.equal((await verifyPasskeyAuthentication({ ...base, requireUserHandle: false })).userVerified, true);
  await assert.rejects(verifyPasskeyAuthentication({ ...base, response: f.authenticator.assertion(options, 'different-handle'), requireUserHandle: false }), /passkey_invalid/);
});

test('single-device counter regression fails; synced zero or non-monotonic counters retain signature and UV requirements', async () => {
  for (const multiDevice of [false, true]) {
    const f = await enrolled({ multiDevice, counter: 10 });
    const options = await authenticationOptions(config);
    const base = { challenge: options.challenge, origin: config.origins[0], rpId: config.rpId, userHandle: f.userHandle, credential: f.result.credential, deviceType: f.result.credentialDeviceType };
    for (const count of [0, 5, 10]) {
      const verification = verifyPasskeyAuthentication({ ...base, response: f.authenticator.assertion(options, f.userHandle, { count }) });
      if (multiDevice) assert.equal((await verification).newCounter, count);
      else await assert.rejects(verification, /passkey_invalid/);
    }
    await assert.rejects(verifyPasskeyAuthentication({ ...base, response: f.authenticator.assertion(options, f.userHandle, { count: 0, uv: false }) }), /passkey_invalid/);
  }
});

test('evidence is versioned, zero-point and shared across credentials and methods', () => {
  const first = passkeyEvidence('owner', 'maintenance', new Date('2026-10-01T12:00:00Z'), 'reputation-v2.0.0');
  const again = passkeyEvidence('owner', 'maintenance', new Date('2026-10-31T23:59:00Z'), 'reputation-v2.0.0');
  assert.equal(first.sourceKey, again.sourceKey);
  assert.equal(first.points, 0);
  assert.equal(first.policyState, 'owner_review_pending');
  assert.equal(first.actionKey, 'security.strong_auth_maintenance');
  assert.notEqual(first.sourceKey, passkeyEvidence('owner', 'maintenance', new Date('2026-11-01T00:00:00Z'), 'reputation-v2.0.0').sourceKey);
  assert.equal(passkeyEvidence('owner', 'enrolled', new Date('2026-10-01'), 'reputation-v2.0.0').sourceKey,
    passkeyEvidence('owner', 'enrolled', new Date('2027-01-01'), 'reputation-v2.0.0').sourceKey);
});

test('credential names are bounded and reject control characters', () => {
  assert.equal(passkeyName(' My phone '), 'My phone');
  for (const invalid of ['', null, 'x'.repeat(65), 'phone\u0000']) assert.throws(() => passkeyName(invalid), /invalid_passkey_name/);
});
