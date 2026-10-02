import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

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
