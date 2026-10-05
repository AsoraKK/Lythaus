import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { assertConsumerDeclaration, assertPromptDispatchConsumer, promptDispatchRequested, CONSUMER, LIFECYCLE_DLQ, LIFECYCLE_QUEUE, REQUIRED_EVENTS, SENDING_DOMAIN } from '../ci/provision-cloudflare-email-lifecycle.mjs';

const provisioner = fs.readFileSync('scripts/ci/provision-cloudflare-email-lifecycle.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/native-workers-deploy.yml', 'utf8');
const jobsConfig = fs.readFileSync('apps/lythaus-jobs/wrangler.jsonc', 'utf8');

test('canonical Worker deployment explicitly provisions the email lifecycle infrastructure before upload', () => {
  const provision = workflow.match(/- name: Provision and verify Cloudflare Email Sending lifecycle infrastructure[\s\S]*?(?=\n      - name: INFRASTRUCTURE - Mark verified infrastructure gate)/)?.[0] ?? '';
  assert.match(provision, /node scripts\/ci\/provision-cloudflare-email-lifecycle\.mjs/);
  assert.match(provision, /CLOUDFLARE_EMAIL_LIFECYCLE_OUTPUT/);
  assert.match(provision, /CLOUDFLARE_API_TOKEN/);
  assert.ok(workflow.indexOf('Provision and verify Cloudflare Email Sending lifecycle infrastructure') < workflow.indexOf('Upload immutable public Worker candidate'));
});

test('lifecycle provisioner is idempotent, exact, and records sanitized evidence', () => {
  for (const value of ['lythaus-email-lifecycle-dev', 'lythaus-email-lifecycle-dlq-dev', 'mail.lythaus.co', 'email.sending', 'message.delivered', 'message.deferred', 'message.bounced', 'message.failed', 'message.rejected', 'message.complained']) assert.match(provisioner, new RegExp(value.replaceAll('.', '\\.')));
  assert.match(provisioner, /\/queues\?per_page=100/);
  assert.match(provisioner, /method: 'POST'/);
  assert.match(provisioner, /event_subscriptions\/subscriptions\?per_page=100/);
  assert.match(provisioner, /method: 'PATCH'/);
  assert.match(provisioner, /subscription_duplicate_or_missing/);
  assert.match(provisioner, /source_or_domain_drift/);
  assert.match(provisioner, /idHash/);
  assert.doesNotMatch(provisioner, /console\.log\(.*CLOUDFLARE_API_TOKEN/);
});

test('committed lifecycle constants and consumer declaration stay exact', () => {
  assert.equal(LIFECYCLE_QUEUE, 'lythaus-email-lifecycle-dev');
  assert.equal(LIFECYCLE_DLQ, 'lythaus-email-lifecycle-dlq-dev');
  assert.equal(SENDING_DOMAIN, 'mail.lythaus.co');
  assert.deepEqual(REQUIRED_EVENTS, ['message.delivered', 'message.deferred', 'message.bounced', 'message.failed', 'message.rejected', 'message.complained']);
  assert.deepEqual(CONSUMER, {
    queue: 'lythaus-email-lifecycle-dev', max_batch_size: 25, max_batch_timeout: 5, max_retries: 10, dead_letter_queue: 'lythaus-email-lifecycle-dlq-dev',
  });
  assert.doesNotThrow(() => assertConsumerDeclaration());
});

test('Jobs consumes email lifecycle events with the committed retry and DLQ contract', () => {
  assert.match(jobsConfig, /\{ "queue": "lythaus-email-lifecycle-dev", "max_batch_size": 25, "max_batch_timeout": 5, "max_retries": 10, "dead_letter_queue": "lythaus-email-lifecycle-dlq-dev" \}/);
  assert.match(provisioner, /email_lifecycle_consumer_configuration_drift/);
  assert.match(workflow, /email-lifecycle-infrastructure\.json/);
  assert.match(workflow, /jobsWorkerVersionId/);
});

test('prompt dispatch requires paired production flags and only its approved producer binding', () => {
  const publicConfig = { vars: { TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: 'true' },
    queues: { producers: [{ binding: 'TRANSACTIONAL_EMAIL_DISPATCH_QUEUE', queue: LIFECYCLE_QUEUE }] } };
  const jobsConfig = { vars: { TRANSACTIONAL_EMAIL_DISPATCH_ENABLED: 'true' } };
  assert.equal(promptDispatchRequested({}, {}), false);
  assert.equal(promptDispatchRequested({ env: { development: publicConfig } }, { env: { development: jobsConfig } }), false);
  assert.equal(promptDispatchRequested(publicConfig, jobsConfig), true);
  assert.throws(() => promptDispatchRequested(publicConfig, {}), /activation_flags_mismatch/);
  assert.throws(() => promptDispatchRequested({}, jobsConfig), /activation_flags_mismatch/);
  for (const producers of [[], [{ binding: 'TRANSACTIONAL_EMAIL_DISPATCH_QUEUE', queue: 'unrelated-queue' }],
    [...publicConfig.queues.producers, ...publicConfig.queues.producers]]) {
    assert.throws(() => promptDispatchRequested({ ...publicConfig, queues: { producers } }, jobsConfig), /producer_binding_drift/);
  }
  assert.match(provisioner, /verifyExisting \|\|= promptDispatch/);
  assert.match(provisioner, /if \(verifyExisting && \(init.method \?\? 'GET'\) !== 'GET'\)/);
});

test('existing Queue metadata must prove live delivery and the exact consumer before prompt activation', () => {
  const consumer = { type: 'worker', script_name: 'lythaus-jobs-development', dead_letter_queue: LIFECYCLE_DLQ,
    settings: { batch_size: 25, max_wait_time_ms: 5000, max_retries: 10 } };
  const queue = { queue_name: LIFECYCLE_QUEUE, settings: { delivery_paused: false, delivery_delay: 0 },
    consumers_total_count: 1, consumers: [consumer] };
  assert.equal(assertPromptDispatchConsumer(queue).status, 'VERIFIED');
  for (const settings of [{}, { delivery_paused: true, delivery_delay: 0 }, { delivery_paused: false, delivery_delay: 20 }]) {
    assert.throws(() => assertPromptDispatchConsumer({ ...queue, settings }), /live_delivery_not_verified/);
  }
  for (const override of [{ consumers: undefined }, { consumers: [] }, { consumers_total_count: undefined },
    { consumers_total_count: 2, consumers: [consumer, consumer] }]) {
    assert.throws(() => assertPromptDispatchConsumer({ ...queue, ...override }), /live_consumer_not_verified/);
  }
  for (const override of [{ type: 'http_pull' }, { script_name: 'unrelated-worker' }, { dead_letter_queue: '' },
    { settings: { ...consumer.settings, max_wait_time_ms: 20000 } }, { settings: { ...consumer.settings, batch_size: 10 } },
    { settings: { ...consumer.settings, max_retries: 3 } }]) {
    assert.throws(() => assertPromptDispatchConsumer({ ...queue, consumers: [{ ...consumer, ...override }] }), /live_consumer_drift/);
  }
  assert.deepEqual(Object.keys(assertPromptDispatchConsumer(queue)).sort(),
    ['dead_letter_queue', 'deliveryDelaySeconds', 'deliveryPaused', 'max_batch_size', 'max_batch_timeout', 'max_retries', 'queue', 'source', 'status', 'worker']);
});
