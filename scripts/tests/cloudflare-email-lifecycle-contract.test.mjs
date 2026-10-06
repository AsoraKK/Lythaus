import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assertConsumerDeclaration, assertPromptDispatchConsumer, promptDispatchRequested, CONSUMER, LIFECYCLE_DLQ, LIFECYCLE_QUEUE, REQUIRED_EVENTS, SENDING_DOMAIN } from '../ci/provision-cloudflare-email-lifecycle.mjs';

const provisioner = fs.readFileSync('scripts/ci/provision-cloudflare-email-lifecycle.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/native-workers-deploy.yml', 'utf8');
const jobsConfig = fs.readFileSync('apps/lythaus-jobs/wrangler.jsonc', 'utf8');

function exportLifecycleEvidence(evidence) {
  const step = workflow.split('- name: ACTIVATION - Export candidate, reuse, and activation metadata')[1]?.split('\n      - name:')[0] ?? '';
  const filter = step.match(/jq -e --arg jobs_version "\$JOBS_WORKER_VERSION_ID" '([\s\S]*?)'\s+"\$lifecycle_evidence"/)?.[1];
  assert.ok(filter, 'Execute the actual activation metadata lifecycle validator');
  return spawnSync('jq', ['-e', '--arg', 'jobs_version', 'synthetic-reviewed-jobs-version', filter], {
    input: JSON.stringify(evidence), encoding: 'utf8', timeout: 10000,
  });
}

function verifiedLifecycleEvidence() {
  return {
    status: 'VERIFIED', infrastructureMode: 'verify_existing',
    subscription: {
      enabled: true, source: 'email.sending', domain: 'mail.lythaus.co', events: [...REQUIRED_EVENTS],
    },
    consumer: {
      queue: 'lythaus-email-lifecycle-dev', max_batch_size: 25, max_batch_timeout: 5,
      max_concurrency: 1, max_retries: 10, dead_letter_queue: 'lythaus-email-lifecycle-dlq-dev',
    },
  };
}

test('activation metadata accepts the observed capped consumer and adds only Jobs version provenance', () => {
  const evidence = verifiedLifecycleEvidence();
  assert.deepEqual(evidence.consumer, CONSUMER);
  const result = exportLifecycleEvidence(evidence);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    ...evidence, consumer: { ...evidence.consumer, jobsWorkerVersionId: 'synthetic-reviewed-jobs-version' },
  });
});

test('activation metadata rejects missing or drifted consumer settings and lifecycle subscriptions', () => {
  const evidence = verifiedLifecycleEvidence();
  const invalid = [
    ...[undefined, null, 0, 2, '1'].map(max_concurrency => ({
      ...evidence, consumer: { ...evidence.consumer, max_concurrency },
    })),
    ...[{ queue: 'unrelated-queue' }, { max_batch_size: 10 }, { max_batch_timeout: 20 },
      { max_retries: 3 }, { dead_letter_queue: 'unrelated-dlq' }, { unexpected_setting: true }]
      .map(override => ({ ...evidence, consumer: { ...evidence.consumer, ...override } })),
    ...[{ enabled: false }, { source: 'unrelated-source' }, { domain: 'unrelated.example' },
      { events: ['message.delivered'] }]
      .map(override => ({ ...evidence, subscription: { ...evidence.subscription, ...override } })),
    { ...evidence, status: 'BLOCKED' },
  ];
  for (const fixture of invalid) {
    const result = exportLifecycleEvidence(fixture);
    assert.notEqual(result.status, 0, JSON.stringify(fixture));
    assert.match(result.stderr, /email_lifecycle_evidence_invalid/);
    assert.equal(result.stdout, '', 'Invalid evidence must not be exported');
  }
});

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
    queue: 'lythaus-email-lifecycle-dev', max_batch_size: 25, max_batch_timeout: 5, max_concurrency: 1, max_retries: 10, dead_letter_queue: 'lythaus-email-lifecycle-dlq-dev',
  });
  assert.doesNotThrow(() => assertConsumerDeclaration());
});

test('Jobs consumes email lifecycle events with the committed retry and DLQ contract', () => {
  assert.match(jobsConfig, /\{ "queue": "lythaus-email-lifecycle-dev", "max_batch_size": 25, "max_batch_timeout": 5, "max_concurrency": 1, "max_retries": 10, "dead_letter_queue": "lythaus-email-lifecycle-dlq-dev" \}/);
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
    settings: { batch_size: 25, max_wait_time_ms: 5000, max_retries: 10, max_concurrency: 1 } };
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
    ['dead_letter_queue', 'deliveryDelaySeconds', 'deliveryPaused', 'max_batch_size', 'max_batch_timeout', 'max_concurrency', 'max_retries', 'queue', 'source', 'status', 'worker']);
});

test('prompt activation accepts the observed direct script identity only with explicit delivery proof', () => {
  const consumer = { type: 'worker', script: 'lythaus-jobs-development', dead_letter_queue: LIFECYCLE_DLQ,
    settings: { batch_size: 25, max_wait_time_ms: 5000, max_retries: 10, max_concurrency: 1 } };
  const queue = { queue_name: LIFECYCLE_QUEUE, settings: { delivery_paused: false, delivery_delay: 0 },
    consumers_total_count: 1, consumers: [consumer] };
  assert.equal(assertPromptDispatchConsumer(queue).worker, 'lythaus-jobs-development');
  assert.throws(() => assertPromptDispatchConsumer({ ...queue, consumers: [{ ...consumer, dead_letter_queue: 'unrelated-queue' }] }), /live_consumer_drift/);
  assert.throws(() => assertPromptDispatchConsumer({ ...queue,
    consumers: [{ ...consumer, settings: { ...consumer.settings, max_concurrency: null } }] }), /consumer_concurrency_not_verified/);
  for (const delivery_paused of [undefined, null, true, 'false']) {
    assert.throws(() => assertPromptDispatchConsumer({ ...queue, settings: { delivery_delay: 0, delivery_paused } }), /live_delivery_not_verified/);
  }
  assert.throws(() => assertPromptDispatchConsumer({ ...queue, settings: { delivery_delay: 0 } }), /live_delivery_not_verified/);
});

test('prompt activation rejects conflicting or unresolved direct script identities', () => {
  const consumer = { type: 'worker', script: 'lythaus-jobs-development', dead_letter_queue: LIFECYCLE_DLQ,
    settings: { batch_size: 25, max_wait_time_ms: 5000, max_retries: 10, max_concurrency: 1 } };
  const queue = { queue_name: LIFECYCLE_QUEUE, settings: { delivery_paused: false, delivery_delay: 0 },
    consumers_total_count: 1, consumers: [consumer] };
  for (const override of [{ script: 'unrelated-worker' }, { script: { name: consumer.script } }, { script: null },
    { script_name: 'unrelated-worker' }, { script_name: null }, { service: consumer.script }, { worker: consumer.script },
    { environment: 'production' }, { environment_name: 'development' }, { namespace: 'fixture-namespace' },
    { type: 'http_pull' }, { script_name: consumer.script, script: 'unrelated-worker' }]) {
    assert.throws(() => assertPromptDispatchConsumer({ ...queue, consumers: [{ ...consumer, ...override }] }), /live_consumer_drift/);
  }
  assert.equal(assertPromptDispatchConsumer({ ...queue, consumers: [{ ...consumer, script_name: consumer.script }] }).status, 'VERIFIED');
});

test('prompt activation rejects automatic, missing, nonnumeric or excessive consumer concurrency', () => {
  const consumer = { type: 'worker', script_name: 'lythaus-jobs-development', dead_letter_queue: LIFECYCLE_DLQ,
    settings: { batch_size: 25, max_wait_time_ms: 5000, max_retries: 10, max_concurrency: 1 } };
  const queue = { queue_name: LIFECYCLE_QUEUE, settings: { delivery_paused: false, delivery_delay: 0 },
    consumers_total_count: 1, consumers: [consumer] };
  assert.equal(assertPromptDispatchConsumer(queue).status, 'VERIFIED');
  for (const max_concurrency of [undefined, null, 0, 2, 250, '1']) {
    assert.throws(() => assertPromptDispatchConsumer({ ...queue,
      consumers: [{ ...consumer, settings: { ...consumer.settings, max_concurrency } }] }), /consumer_concurrency_not_verified/);
  }
});

test('root and development declarations must each contain exactly one capped lifecycle consumer', () => {
  const consumer = { ...CONSUMER, max_concurrency: 1 };
  const config = { queues: { consumers: [consumer] }, env: { development: { queues: { consumers: [consumer] } } } };
  assert.doesNotThrow(() => assertConsumerDeclaration(config));
  for (const consumers of [[], [consumer, consumer], [{ ...consumer, max_concurrency: undefined }],
    [{ ...consumer, max_concurrency: null }], [{ ...consumer, max_concurrency: 2 }]]) {
    assert.throws(() => assertConsumerDeclaration({ ...config, queues: { consumers } }), /consumer_configuration_drift/);
    assert.throws(() => assertConsumerDeclaration({ ...config, env: { development: { queues: { consumers } } } }), /consumer_configuration_drift/);
  }
});
