import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createPasskeyHandler } from '../../apps/lythaus-public-api/src/passkey-runtime.ts';
import { classifyPublicError, requireAuthSecrets } from '../../apps/lythaus-public-api/src/auth-runtime-policy.ts';

const spec = parse(readFileSync('api/openapi/passkeys.yaml', 'utf8'));
const root = parse(readFileSync('api/openapi/openapi.yaml', 'utf8'));
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const schemas = JSON.parse(JSON.stringify(spec.components.schemas).replaceAll('#/components/schemas/', '#/$defs/'));

function validate(name, value) {
  const validator = ajv.compile({ $defs: schemas, $ref: `#/$defs/${name}` });
  return validator(value);
}

test('all modular passkey routes are referenced and require the browser origin/transport boundary', () => {
  assert.equal(Object.keys(spec.paths).length, 10);
  for (const [path, methods] of Object.entries(spec.paths)) {
    assert.equal(root.paths[path].$ref, `./passkeys.yaml#/paths/${path.replaceAll('/', '~1')}`);
    for (const operation of Object.values(methods)) {
      assert.ok(operation.parameters.some(value => value.$ref.endsWith('/PasskeyOrigin')));
      assert.ok(operation.parameters.some(value => value.$ref.endsWith('/PasskeyTransport')));
      const anonymous = path.includes('/login/') || path.endsWith('/capabilities');
      assert.deepEqual(operation.security, anonymous ? [] : [{ bearerAuth: [] }]);
    }
  }
});

test('passkey session contract cannot return a browser refresh token or a different session transport', () => {
  const valid = { accessToken: 'synthetic', expiresIn: 900, tokenType: 'Bearer', sessionTransport: 'cookie-v1' };
  assert.equal(validate('PasskeySession', valid), true);
  assert.equal(validate('PasskeySession', { ...valid, refreshToken: 'never-in-browser-json' }), false);
  assert.equal(validate('PasskeySession', { ...valid, sessionTransport: 'native' }), false);
});

test('maintenance and management contracts keep zero points, password proof and revocation semantics', () => {
  assert.equal(validate('PasskeyMaintenance', { verified: true, evidenceRecorded: false, points: 0 }), true);
  assert.equal(validate('PasskeyMaintenance', { verified: true, evidenceRecorded: true, points: 50 }), false);
  assert.equal(validate('PasskeyRegisterOptionsRequest', { name: 'Synthetic device', password: 'fixture password' }), true);
  assert.equal(validate('PasskeyRegisterOptionsRequest', { name: 'Synthetic device' }), false);
  assert.equal(validate('PasskeyRenameRequest', { name: 'x'.repeat(65) }), false);
  assert.equal(validate('PasskeyRevokeRequest', {}), false);
  assert.equal(validate('PasskeyRevokeResult', { id: '019f0000-0000-7000-8000-000000000001', revoked: true, sessionRevocation: 'all' }), true);
});

test('configuration and bounded-body runtime errors have matching passkey response contracts', async () => {
  const env = { PASSKEYS_ENABLED: 'true', PASSKEY_RP_ID: 'lythaus.co',
    PASSKEY_ALLOWED_ORIGINS: 'https://app.lythaus.co', CORS_ALLOWED_ORIGINS: 'https://app.lythaus.co' };
  const deps = { rateLimit: async () => {}, response: (_request, body) => Response.json(body) };
  const configured = createPasskeyHandler(env, deps);
  const unconfigured = createPasskeyHandler({ ...env, PASSKEY_RP_ID: undefined }, deps);
  for (const [path, methods] of Object.entries(spec.paths)) for (const [method, operation] of Object.entries(methods)) {
    const url = `https://api.lythaus.co/api${path.replace('{passkeyId}', '019f0000-0000-7000-8000-000000000001')}`;
    const headers = { origin: 'https://app.lythaus.co', 'x-lythaus-auth-transport': 'cookie-v1' };
    const makeRequest = body => new Request(url, { method: method.toUpperCase(), headers,
      ...(method === 'get' ? {} : { body: JSON.stringify(body) }) });
    assert.equal(operation.responses['503'].$ref, '#/components/responses/PasskeyUnavailable');
    await assert.rejects(unconfigured(makeRequest({})), error =>
      error.message === 'passkeys_not_configured' && classifyPublicError(error).status === 503);
    if (method !== 'get') {
      assert.equal(operation.responses['413'].$ref, '#/components/responses/PasskeyTooLarge');
      await assert.rejects(configured(makeRequest({ oversized: 'x'.repeat(32_769) })), error =>
        error.message === 'request_too_large' && classifyPublicError(error).status === 413);
    } else assert.equal(operation.responses['413'], undefined);
    assert.equal(operation.responses['415'], undefined);
  }
  assert.throws(() => requireAuthSecrets({}), error =>
    error.message === 'authentication_not_configured' && classifyPublicError(error).status === 503);
  for (const name of ['PasskeyUnavailable', 'PasskeyTooLarge']) {
    assert.equal(spec.components.responses[name].content['application/json'].schema.$ref, '#/components/schemas/PasskeyError');
  }
});
