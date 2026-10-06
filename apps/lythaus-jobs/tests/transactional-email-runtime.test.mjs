import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { encryptField, uuidv7 } from '@lythaus/security';
import { createTransactionalEmailDispatchMessage } from '../../../packages/security/src/transactional-email-dispatch.ts';

import {
  applyTransactionalEmailLifecycle,
  emailProviderFailureCategory,
  authorizedEmailLifecycleRequest,
  parseTransactionalEmailLifecycleQueueEvent,
  summarizeTransactionalEmailDeliveryEvidence,
  processEmailLifecycleQueue,
} from '../src/transactional-email-runtime.ts';

test('mixed25-message burst reconciles lifecycle before slow sends and bounds provider/database concurrency', { timeout: 5000 }, async () => {
  const key = randomBytes(32).toString('base64');
  const pending = new Map();
  const states = new Map();
  const lifecycle = [];
  let activeTransactions = 0, maxTransactions = 0, activeConnections = 0, maxConnections = 0;
  let activeSends = 0, maxSends = 0, sends = 0;
  const firstSend = Promise.withResolvers();
  const firstPair = Promise.withResolvers();
  const release = Promise.withResolvers();
  const messages = [];
  for (let index = 0; index < 22; index++) {
    const id = uuidv7();
    const envelope = await encryptField(JSON.stringify({ to: 'synthetic@example.invalid', token: 'a'.repeat(64) }), key, 'v1');
    pending.set(id, { id, user_id: uuidv7(), purpose: 'verification', attempt_count: 1, template_version: 'v1',
      correlation_id: uuidv7(), delivery_envelope_ciphertext: envelope.ciphertext, delivery_envelope_encryption_key_version: 'v1' });
    states.set(id, 'queued');
    messages.push({ id, body: await createTransactionalEmailDispatchMessage(id, key), acknowledged: 0,
      ack() { this.acknowledged++; }, retry() { assert.fail('Due valid hints must not retry'); } });
  }
  for (const event of ['delivered', 'bounced', 'complained']) messages.push({ id: event,
    body: { type: `cf.email.sending.message.${event}`, payload: { messageId: `synthetic-${event}` } }, acknowledged: 0,
    ack() { this.acknowledged++; }, retry() { assert.fail('Matched lifecycle must not retry'); } });
  const query = async (sql, values = []) => {
    if (sql.includes('WITH claimable')) {
      const row = pending.get(values[1]);
      pending.delete(values[1]);
      if (row) states.set(row.id, 'processing');
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes(' AS valid')) return { rows: [{ valid: true }], rowCount: 1 };
    if (sql.includes("SET state = 'provider_accepted'")) states.set(values[0], 'provider_accepted');
    if (sql.includes('WHERE provider_message_id = $1')) lifecycle.push(values[1]);
    if (sql.includes(' AS retry_after_seconds')) return { rows: [{ state: states.get(values[0]), retry_after_seconds: 60 }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  };
  const connection = async work => {
    activeConnections++; maxConnections = Math.max(maxConnections, activeConnections);
    try { return await work(); } finally { activeConnections--; }
  };
  const database = { query: (_binding, sql, values) => connection(() => query(sql, values)), transaction: async (_binding, work) => {
    activeTransactions++; maxTransactions = Math.max(maxTransactions, activeTransactions);
    try { return await connection(() => work({ query })); } finally { activeTransactions--; }
  } };
  const env = { DB_JOBS_FRESH: {}, TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: 'true', TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1: key,
    EMAIL_PROVIDER_MODE: 'cloudflare', EMAIL_FROM: 'no-reply@mail.lythaus.test', EMAIL_VERIFICATION_BASE_URL: 'https://lythaus.co/verify-email',
    EMAIL: { send: async () => {
      const number = ++sends;
      activeSends++; maxSends = Math.max(maxSends, activeSends);
      firstSend.resolve(); if (sends === 2) firstPair.resolve();
      await release.promise;
      activeSends--;
      return { messageId: `synthetic-send-${number}` };
    } } };
  const running = processEmailLifecycleQueue({ queue: 'lythaus-email-lifecycle-dev', messages }, env, database);
  try {
    await firstSend.promise;
    assert.deepEqual(lifecycle, ['delivered', 'bounced', 'complained']);
    await firstPair.promise;
    await setImmediate();
    assert.equal(sends, 2, 'Only two sends may hold their database transactions while the provider is stalled');
    assert.equal(activeTransactions, 2);
    assert.equal(messages.filter(message => message.acknowledged).length, 3);
  } finally { release.resolve(); await running; }
  assert.equal(sends, 22);
  assert.equal(maxSends, 2);
  assert.equal(maxTransactions, 2);
  assert.equal(maxConnections, 2);
  assert.ok(messages.every(message => message.acknowledged === 1));
});

test('mixed lifecycle errors are isolated and disabled dispatch retains its60-second retry without database work', async () => {
  const key = randomBytes(32).toString('base64');
  const outcomes = [];
  const item = (id, body) => ({ id, body, ack: () => outcomes.push([id, 'ack']),
    retry: options => outcomes.push([id, 'retry', options?.delaySeconds]) });
  const messages = [
    item('off', await createTransactionalEmailDispatchMessage(uuidv7(), key)),
    item('invalid', {}),
    item('delivered', JSON.stringify({ type: 'cf.email.sending.message.delivered', payload: { messageId: 'synthetic-delivered' } })),
    item('bounced', { type: 'cf.email.sending.message.bounced', payload: { messageId: 'synthetic-bounced' } }),
    item('complained', { type: 'cf.email.sending.message.complained', payload: { messageId: 'synthetic-complained' } }),
  ];
  let databaseCalls = 0;
  const database = { query: () => assert.fail('Disabled dispatch must not query the outbox'),
    transaction: async (_binding, work) => work({ query: async (_sql, values) => {
      databaseCalls++;
      if (values[0] === 'synthetic-bounced') throw new Error('synthetic database outage');
      return { rows: [], rowCount: 1 };
    } }) };
  await processEmailLifecycleQueue({ queue: 'lythaus-email-lifecycle-dev', messages }, { DB_JOBS_FRESH: {} }, database);
  assert.equal(databaseCalls, 3);
  assert.deepEqual(outcomes, [['invalid', 'retry', undefined], ['delivered', 'ack'], ['bounced', 'retry', undefined],
    ['complained', 'ack'], ['off', 'retry', 60]]);
});

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

test('delivery evidence is grouped and never exposes correlation, challenge, or provider IDs', () => {
  const evidence = summarizeTransactionalEmailDeliveryEvidence([
    {
      purpose: 'verification', provider: 'cloudflare-email', state: 'delivered', provider_error_category: null,
      row_count: '2', provider_message_id_count: '2', distinct_provider_message_id_count: '2', accepted_count: '2', delivered_count: '2',
    },
    {
      purpose: 'password_reset', provider: 'cloudflare-email', state: 'delivered', provider_error_category: null,
      row_count: '1', provider_message_id_count: '1', distinct_provider_message_id_count: '1', accepted_count: '1', delivered_count: '1',
    },
  ], '2026-08-29T12:00:00.000Z');
  assert.deepEqual(evidence, {
    status: 'delivered_rows_available',
    capturedAt: '2026-08-29T12:00:00.000Z',
    lifecycleSource: 'cloudflare_email_sending_queue',
    groups: [
      {
        purpose: 'verification', provider: 'cloudflare-email', state: 'delivered', providerErrorCategory: null,
        rowCount: 2, providerMessageIdCount: 2, distinctProviderMessageIdCount: 2, acceptedCount: 2, deliveredCount: 2,
      },
      {
        purpose: 'password_reset', provider: 'cloudflare-email', state: 'delivered', providerErrorCategory: null,
        rowCount: 1, providerMessageIdCount: 1, distinctProviderMessageIdCount: 1, acceptedCount: 1, deliveredCount: 1,
      },
    ],
  });
  assert.doesNotMatch(JSON.stringify(evidence), /challenge|correlation|provider-message/);
});

test('delivery evidence remains provider-accepted-only until lifecycle reconciliation', () => {
  const evidence = summarizeTransactionalEmailDeliveryEvidence([{
    purpose: 'verification', provider: 'cloudflare-email', state: 'provider_accepted', provider_error_category: null,
    row_count: 2, provider_message_id_count: 2, distinct_provider_message_id_count: 2, accepted_count: 2, delivered_count: 0,
  }], '2026-08-29T12:00:00.000Z');
  assert.equal(evidence.status, 'provider_accepted_only');
  assert.equal(evidence.groups[0].deliveredCount, 0);
});
