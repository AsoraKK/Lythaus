import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { assertConsumerDeclaration, CONSUMER, LIFECYCLE_DLQ, LIFECYCLE_QUEUE, REQUIRED_EVENTS, SENDING_DOMAIN } from '../ci/provision-cloudflare-email-lifecycle.mjs';

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
