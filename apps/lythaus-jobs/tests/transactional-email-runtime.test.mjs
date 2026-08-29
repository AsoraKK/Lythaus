import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTransactionalEmailLifecycle,
  emailProviderFailureCategory,
  authorizedEmailLifecycleRequest,
  parseTransactionalEmailLifecycleQueueEvent,
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

test('known lifecycle messages are acknowledged idempotently while unmatched messages remain retryable', async () => {
  const calls = [];
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return calls.length === 1 ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [] };
    },
  };
  assert.equal(await applyTransactionalEmailLifecycle(client, {
    eventType: 'message.delivered', messageId: 'provider-message-raced',
  }), true);
  assert.match(calls[1].sql, /SELECT 1 FROM system\.transactional_email_outbox/);
});

test('strictly parses Cloudflare lifecycle queue events without retaining recipient or subject', () => {
  assert.deepEqual(parseTransactionalEmailLifecycleQueueEvent({
    type: 'cf.email.sending.message.delivered',
    payload: {
      messageId: ' provider-message-1 ',
      recipient: 'recipient@example.invalid',
      subject: 'private subject',
      errorCode: 'recipient-not-allowed',
    },
  }), {
    eventType: 'message.delivered',
    messageId: 'provider-message-1',
    errorCode: 'RECIPIENT_NOT_ALLOWED',
  });
  assert.deepEqual(parseTransactionalEmailLifecycleQueueEvent({
    type: 'cf.email.sending.message.bounced',
    payload: { messageId: 'provider-message-2', rcptTo: 'recipient@example.invalid' },
  }), { eventType: 'message.bounced', messageId: 'provider-message-2' });
});

test('strict lifecycle parsing rejects unsupported or unsafe provider payloads', () => {
  assert.equal(parseTransactionalEmailLifecycleQueueEvent({ type: 'message.delivered', payload: { messageId: 'provider-message-1' } }), undefined);
  assert.equal(parseTransactionalEmailLifecycleQueueEvent({ type: 'cf.email.sending.message.delivered', payload: {} }), undefined);
  assert.equal(parseTransactionalEmailLifecycleQueueEvent('{"type":"cf.email.sending.message.delivered","payload":{"messageId":"provider-message-1\u0000"}}'), undefined);
  assert.equal(parseTransactionalEmailLifecycleQueueEvent('not-json'), undefined);
});
