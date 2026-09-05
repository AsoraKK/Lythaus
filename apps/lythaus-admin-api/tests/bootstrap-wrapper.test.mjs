import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import bootstrapWorker from '../src/bootstrap-wrapper.ts';

const env = {
  EXPECTED_HOSTNAMES: 'admin.lythaus.co',
  CORS_ALLOWED_ORIGINS: 'https://admin.lythaus.co',
};

function request(method, body, origin = 'https://admin.lythaus.co') {
  const headers = new Headers({ origin });
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request('https://admin.lythaus.co/api/admin/bootstrap/first-administrator', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('bootstrap route is POST-only and no-store', async () => {
  const response = await bootstrapWorker.fetch(request('GET'), env);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
});

test('bootstrap rejects cross-origin mutation before Access or database work', async () => {
  const response = await bootstrapWorker.fetch(
    request('POST', { confirmation: 'BOOTSTRAP FIRST ADMINISTRATOR' }, 'https://example.invalid'),
    env,
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'admin_mutation_origin_invalid');
});

test('bootstrap requires the explicit confirmation phrase before Access verification', async () => {
  const response = await bootstrapWorker.fetch(request('POST', { confirmation: 'NO' }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'confirmation_required');
});

test('bootstrap rejects unknown request fields', async () => {
  const response = await bootstrapWorker.fetch(request('POST', {
    confirmation: 'BOOTSTRAP FIRST ADMINISTRATOR',
    userId: 'client-controlled-id',
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'unknown_field');
});

test('bootstrap wrapper binds the existing Access verifier and subject HMAC without personal constants', async () => {
  const source = await fs.readFile('apps/lythaus-admin-api/src/bootstrap-wrapper.ts', 'utf8');
  const wrangler = await fs.readFile('apps/lythaus-admin-api/wrangler.jsonc', 'utf8');
  assert.match(source, /assertExpectedHostname/);
  assert.match(source, /assertAdminMutationRequest/);
  assert.match(source, /verifiedAccessSubject/);
  assert.match(source, /ACCESS_SUBJECT_HMAC_KEY/);
  assert.match(source, /hmacLookup/);
  assert.match(source, /FIRST_ADMIN_BOOTSTRAP_CONFIRMATION/);
  assert.match(source, /adminWorker\.fetch/);
  assert.doesNotMatch(source, /@[a-z0-9.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(source, /FIRST_ADMIN_(?:EMAIL|ACCESS_SUBJECT)/);
  assert.match(wrangler, /"main": "src\/bootstrap-wrapper\.ts"/);
});
