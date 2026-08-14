import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adminCorsPreflight,
  assertAdminMutationRequest,
  allowedAdminOrigin,
  withAdminCors,
} from '../src/admin-cors-policy.ts';

const configured = 'https://admin.lythaus.co,http://localhost:3000';

test('allows only exact configured origins', () => {
  assert.equal(allowedAdminOrigin('https://admin.lythaus.co', configured), 'https://admin.lythaus.co');
  assert.equal(allowedAdminOrigin('https://evil.example', configured), undefined);
  assert.equal(allowedAdminOrigin('https://admin.lythaus.co.evil.example', configured), undefined);
  assert.equal(allowedAdminOrigin(null, configured), undefined);
  assert.equal(allowedAdminOrigin('https://admin.lythaus.co', 'https://admin.lythaus.co/path'), undefined);
});

test('credentialed CORS headers are emitted for the configured control-panel origin', () => {
  const request = new Request('https://admin-api.lythaus.co/api/admin/health', {
    headers: { origin: 'https://admin.lythaus.co' },
  });
  const response = withAdminCors(request, configured, new Response('{}', {
    headers: { vary: 'Accept-Encoding', 'x-correlation-id': 'test-correlation' },
  }));
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://admin.lythaus.co');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(response.headers.get('access-control-expose-headers'), 'X-Correlation-ID');
  assert.equal(response.headers.get('vary'), 'Accept-Encoding, Origin');
});

test('preflight is fail closed for unconfigured origins and explicit for the control panel', () => {
  const denied = adminCorsPreflight(new Request('https://admin-api.lythaus.co/api/admin/health', {
    method: 'OPTIONS', headers: { origin: 'https://evil.example' },
  }), configured);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const allowed = adminCorsPreflight(new Request('https://admin-api.lythaus.co/api/admin/health', {
    method: 'OPTIONS', headers: { origin: 'https://admin.lythaus.co' },
  }), configured);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://admin.lythaus.co');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  assert.match(allowed.headers.get('access-control-allow-methods') ?? '', /POST/);
  assert.match(allowed.headers.get('access-control-allow-headers') ?? '', /Authorization/);
});

test('admin mutations require the configured same origin and JSON content type', () => {
  const valid = new Request('https://admin.lythaus.co/api/admin/waitlist/id/status', {
    method: 'POST',
    headers: { origin: 'https://admin.lythaus.co', 'content-type': 'application/json; charset=utf-8' },
  });
  assert.doesNotThrow(() => assertAdminMutationRequest(valid, configured));

  const crossOrigin = new Request('https://admin.lythaus.co/api/admin/waitlist/id/status', {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
  });
  assert.throws(() => assertAdminMutationRequest(crossOrigin, configured), /admin_mutation_origin_invalid/);

  const crossHost = new Request('https://admin-api.lythaus.co/api/admin/waitlist/id/status', {
    method: 'POST',
    headers: { origin: 'https://admin.lythaus.co', 'content-type': 'application/json' },
  });
  assert.throws(() => assertAdminMutationRequest(crossHost, configured), /admin_mutation_origin_invalid/);

  const nonJson = new Request('https://admin.lythaus.co/api/admin/waitlist/id/status', {
    method: 'POST',
    headers: { origin: 'https://admin.lythaus.co', 'content-type': 'text/plain' },
  });
  assert.throws(() => assertAdminMutationRequest(nonJson, configured), /admin_mutation_content_type_invalid/);
});
