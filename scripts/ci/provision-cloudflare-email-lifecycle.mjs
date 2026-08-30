#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const LIFECYCLE_QUEUE = 'lythaus-email-lifecycle-dev';
const LIFECYCLE_DLQ = 'lythaus-email-lifecycle-dlq-dev';
const SENDING_DOMAIN = 'mail.lythaus.co';
const SUBSCRIPTION_NAME = 'lythaus-email-lifecycle-mail-lythaus-co';
const REQUIRED_EVENTS = [
  'message.delivered',
  'message.deferred',
  'message.bounced',
  'message.failed',
  'message.rejected',
  'message.complained',
];
const CONSUMER = {
  queue: LIFECYCLE_QUEUE,
  max_batch_size: 25,
  max_batch_timeout: 5,
  max_retries: 10,
  dead_letter_queue: LIFECYCLE_DLQ,
};

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function hashIdentifier(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function queueName(queue) {
  return queue?.queue_name ?? queue?.name ?? null;
}

function queueId(queue) {
  return queue?.queue_id ?? queue?.id ?? null;
}

function normalEvents(events) {
  if (!Array.isArray(events)) return [];
  return [...new Set(events)].sort();
}

function sourceDomain(source) {
  return source?.domain ?? source?.sending_domain ?? null;
}

function sourceZoneId(source) {
  return source?.zone_id ?? source?.zoneId ?? null;
}

function expectedEvents(subscription) {
  return JSON.stringify(normalEvents(subscription?.events)) === JSON.stringify([...REQUIRED_EVENTS].sort());
}

function isExactSubscription(subscription, lifecycleQueueId, zoneId) {
  return subscription?.destination?.type === 'queues.queue'
    && subscription.destination.queue_id === lifecycleQueueId
    && subscription?.source?.type === 'email.sending'
    && sourceZoneId(subscription.source) === zoneId
    && sourceDomain(subscription.source) === SENDING_DOMAIN;
}

export function assertConsumerDeclaration() {
  const config = fs.readFileSync('apps/lythaus-jobs/wrangler.jsonc', 'utf8');
  const required = `\\{ \\\"queue\\\": \\\"${CONSUMER.queue}\\\", \\\"max_batch_size\\\": ${CONSUMER.max_batch_size}, \\\"max_batch_timeout\\\": ${CONSUMER.max_batch_timeout}, \\\"max_retries\\\": ${CONSUMER.max_retries}, \\\"dead_letter_queue\\\": \\\"${CONSUMER.dead_letter_queue}\\\" \\}`;
  if (!new RegExp(required).test(config)) throw new Error('email_lifecycle_consumer_configuration_drift');
}

async function cloudflare(pathname, init = {}) {
  const token = required('CLOUDFLARE_API_TOKEN');
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || body?.success !== true) {
    const code = body?.errors?.[0]?.code ?? 'unknown';
    throw new Error(`cloudflare_email_lifecycle_http_${response.status}_${code}`);
  }
  return body.result;
}

async function queues(accountId) {
  const result = await cloudflare(`/accounts/${accountId}/queues?per_page=100`);
  if (!Array.isArray(result)) throw new Error('cloudflare_email_lifecycle_queue_list_invalid');
  return result;
}

async function ensureQueue(accountId, name) {
  let matches = (await queues(accountId)).filter((queue) => queueName(queue) === name);
  if (matches.length === 0) {
    await cloudflare(`/accounts/${accountId}/queues`, {
      method: 'POST',
      body: JSON.stringify({ queue_name: name }),
    });
    matches = (await queues(accountId)).filter((queue) => queueName(queue) === name);
  }
  if (matches.length !== 1 || !queueId(matches[0])) throw new Error(`cloudflare_email_lifecycle_queue_${name}_ambiguous_or_missing`);
  return matches[0];
}

async function subscriptions(accountId) {
  const result = await cloudflare(`/accounts/${accountId}/event_subscriptions/subscriptions?per_page=100`);
  if (!Array.isArray(result)) throw new Error('cloudflare_email_lifecycle_subscription_list_invalid');
  return result;
}

function createSubscription(queueNameValue, zoneId) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, [
    '--yes', 'wrangler@4.123.0', 'queues', 'subscription', 'create', queueNameValue,
    '--source', 'email.sending',
    '--events', REQUIRED_EVENTS.join(','),
    '--name', SUBSCRIPTION_NAME,
    '--enabled=true',
    '--zone-id', zoneId,
    '--domain', SENDING_DOMAIN,
  ], { encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(`cloudflare_email_lifecycle_subscription_create_failed_${result.status ?? 'spawn'}`);
}

async function ensureSubscription(accountId, lifecycleQueue, zoneId) {
  const lifecycleQueueId = queueId(lifecycleQueue);
  let matching = (await subscriptions(accountId)).filter((subscription) => subscription?.destination?.queue_id === lifecycleQueueId);
  if (matching.length === 0) {
    createSubscription(queueName(lifecycleQueue), zoneId);
    matching = (await subscriptions(accountId)).filter((subscription) => subscription?.destination?.queue_id === lifecycleQueueId);
  }
  if (matching.length !== 1) throw new Error('cloudflare_email_lifecycle_subscription_duplicate_or_missing');
  const subscription = matching[0];
  if (!isExactSubscription(subscription, lifecycleQueueId, zoneId)) throw new Error('cloudflare_email_lifecycle_subscription_source_or_domain_drift');
  if (!expectedEvents(subscription) || subscription.enabled !== true || subscription.name !== SUBSCRIPTION_NAME) {
    await cloudflare(`/accounts/${accountId}/event_subscriptions/subscriptions/${encodeURIComponent(subscription.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        destination: { type: 'queues.queue', queue_id: lifecycleQueueId },
        enabled: true,
        events: REQUIRED_EVENTS,
        name: SUBSCRIPTION_NAME,
      }),
    });
  }
  const verified = (await subscriptions(accountId)).filter((entry) => entry?.destination?.queue_id === lifecycleQueueId);
  if (verified.length !== 1 || !isExactSubscription(verified[0], lifecycleQueueId, zoneId)
    || !expectedEvents(verified[0]) || verified[0].enabled !== true || verified[0].name !== SUBSCRIPTION_NAME || !verified[0].id) {
    throw new Error('cloudflare_email_lifecycle_subscription_verification_failed');
  }
  return verified[0];
}

async function main() {
  const accountId = required('CLOUDFLARE_ACCOUNT_ID');
  const zoneId = required('CLOUDFLARE_ZONE_ID');
  const outputPath = required('CLOUDFLARE_EMAIL_LIFECYCLE_OUTPUT');
  assertConsumerDeclaration();
  const lifecycleQueue = await ensureQueue(accountId, LIFECYCLE_QUEUE);
  const deadLetterQueue = await ensureQueue(accountId, LIFECYCLE_DLQ);
  const subscription = await ensureSubscription(accountId, lifecycleQueue, zoneId);
  const evidence = {
    status: 'VERIFIED',
    observedAt: new Date().toISOString(),
    queues: {
      lifecycle: { name: LIFECYCLE_QUEUE, idHash: hashIdentifier(queueId(lifecycleQueue)) },
      deadLetter: { name: LIFECYCLE_DLQ, idHash: hashIdentifier(queueId(deadLetterQueue)) },
    },
    subscription: {
      idHash: hashIdentifier(subscription.id),
      name: subscription.name,
      enabled: subscription.enabled,
      source: subscription.source.type,
      domain: sourceDomain(subscription.source),
      events: normalEvents(subscription.events),
    },
    consumer: CONSUMER,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: evidence.status, outputPath }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

export { CONSUMER, LIFECYCLE_DLQ, LIFECYCLE_QUEUE, REQUIRED_EVENTS, SENDING_DOMAIN, SUBSCRIPTION_NAME };
