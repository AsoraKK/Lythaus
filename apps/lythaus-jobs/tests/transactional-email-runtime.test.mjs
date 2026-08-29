import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTransactionalEmailLifecycle,
  emailProviderFailureCategory,
  authorizedEmailLifecycleRequest,
} from '../src/transactional-email-runtime.ts';

test('provider failures distinguish retryable outages from permanent rejection', () => {
  assert.equal(emailProviderFailureCategory({ status: 503, code: 'E_PROVIDER_UNAVAILABLE' }).category, 'transient');
  assert.equal(emailProviderFailureCategory({ status: 429 }).category, 'transient');
  assert.equal(emailProviderFailureCategory({ status: 400, code: 'E_RECIPIENT_NOT_ALLOWED' }).category, 'permanent');
  assert.equal(emailProviderFailureCategory({ status: 400 }).category, 'permanent');
});

test('lifecycle webhook authentication is constant-time and fail-closed', () => {
  const request = (authorization) => new Request('https://jobs.example/internal/email/lifecycle', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
  assert.equal(authorizedEmailLifecycleRequest(request('Bearer webhook-secret'), 'webhook-secret'), true);
  assert.equal(authorizedEmailLifecycleRequest(request('Bearer wrong-secret'), 'webhook-secret'), false);
  assert.equal(authorizedEmailLifecycleRequest(request(), undefined), false);
});

test('lifecycle application updates only the matching provider message', async () => {
  const calls = [];
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rowCount: 1, rows: [] };
    },
  };
  assert.equal(await applyTransactionalEmailLifecycle(client, {
    eventType: 'message.delivered', messageId: 'provider-message-1',
  }), true);
  assert.match(calls[0].sql, /provider_message_id = \$1/);
  assert.match(calls[0].sql, /state = \$2/);
  assert.equal(calls[0].values[0], 'provider-message-1');
  assert.equal(await applyTransactionalEmailLifecycle(client, { eventType: 'unknown', messageId: 'provider-message-1' }), false);
});
