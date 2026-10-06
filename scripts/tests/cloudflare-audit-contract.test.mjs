import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captureAuthEmailQueueEvidence } from '../ci/auth-email-queue-evidence.mjs';

const source = fs.readFileSync('scripts/cloudflare/audit-account.mjs', 'utf8');

test('Cloudflare audit remains read-only and covers scoped integrations and current Builds evidence', () => {
  for (const forbidden of ['method: \'POST\'', 'method: \'PUT\'', 'method: \'PATCH\'', 'method: \'DELETE\'']) {
    if (source.includes(forbidden)) throw new Error(`mutating request found: ${forbidden}`);
  }
  for (const required of ['sourceIntegration', 'triggerType', '/builds/workers/', 'deployHookInventory', 'const integrations', 'resources: resourceCollections', 'classificationPolicy', 'legacyProviderExceptions', 'EXTERNAL / OUT OF SCOPE', 'NITE_OWL_MARKERS']) {
    if (!source.includes(required)) throw new Error(`missing Cloudflare inventory contract: ${required}`);
  }
  for (const forbidden of ['hook.url', 'hook.secret', 'publicAccessValues', 'gh issue create', 'issues: write']) {
    if (source.includes(forbidden)) throw new Error(`sensitive or mutating Cloudflare audit contract found: ${forbidden}`);
  }
});

test('Nite Owl resources are explicitly ignored without per-resource probing', () => {
  if (!source.includes('Ignored after account-level enumeration')) throw new Error('Nite Owl handling is not documented');
  if (!source.includes("classification !== 'EXTERNAL / OUT OF SCOPE'")) throw new Error('external resource filter is missing');
  if (source.includes('/builds/workers/${encodeURIComponent(name)}/deploy_hooks')) throw new Error('obsolete name-based deploy-hook probing remains');
});

test('custom-domain inventory reads the Admin mapping without mutation or unrelated domain values', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lythaus-admin-domain-audit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const fixture = path.join(directory, 'fetch.mjs');
  const output = path.join(directory, 'audit.json');
  fs.writeFileSync(fixture, `
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, 0, ...args);
    globalThis.fetch = async (url, init = {}) => {
      if ((init.method ?? 'GET') !== 'GET') throw new Error('Audit attempted a mutation');
      if (new URL(url).hostname !== 'api.cloudflare.com') throw new Error('Unexpected destination');
      const domains = [
        { hostname: 'admin-api.lythaus.co', service: process.env.DOMAIN_FIXTURE_SERVICE, environment: 'production', secret: 'fixture-secret-never-record' },
        { hostname: 'unrelated.example.invalid', service: 'unrelated', environment: 'production' },
      ];
      return new Response(JSON.stringify({ success: true, result: String(url).endsWith('/workers/domains') ? domains : [] }), { status: 200 });
    };
  `);
  for (const service of ['lythaus-admin-api-development', 'unexpected-worker']) {
    const result = spawnSync(process.execPath, ['--import', fixture, 'scripts/cloudflare/audit-account.mjs'], {
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'e5b7ae46e04698f507b7e4b3d4ef1af0', CLOUDFLARE_API_TOKEN: 'fixture-token', CLOUDFLARE_AUDIT_OUTPUT: output, DOMAIN_FIXTURE_SERVICE: service },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const text = fs.readFileSync(output, 'utf8');
    assert.ok(!text.includes('fixture-secret-never-record'));
    assert.ok(!text.includes('unrelated.example.invalid'));
    const report = JSON.parse(text);
    assert.deepEqual(report.adminCustomDomain.mappings, [{ hostname: 'admin-api.lythaus.co', service, environment: 'production' }]);
    assert.equal(report.adminCustomDomain.mappingVerified, service === 'lythaus-admin-api-development');
    assert.equal(report.endpointState.workerDomains.ok, true);
  }
});

const authAccount = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const lifecycleId = '1'.repeat(32), deadLetterId = '2'.repeat(32);
function queueFixture() {
  return { queue_id: lifecycleId, queue_name: 'lythaus-email-lifecycle-dev',
    settings: { delivery_paused: false, delivery_delay: 0 }, consumers_total_count: 1,
    consumers: [{ consumer_id: '3'.repeat(32), type: 'worker', script_name: 'lythaus-jobs-development',
      dead_letter_queue: 'lythaus-email-lifecycle-dlq-dev',
      settings: { batch_size: 25, max_wait_time_ms: 5000, max_retries: 10, max_concurrency: 1 } }] };
}
function queueReader(queue = queueFixture(), listing = [queue, { queue_id: deadLetterId, queue_name: 'lythaus-email-lifecycle-dlq-dev' }]) {
  const calls = [];
  return { calls, requestJson: async (input, init) => {
    const url = new URL(input);
    assert.equal(init.method, 'GET');
    assert.equal(url.origin, 'https://api.cloudflare.com');
    calls.push(url.pathname + url.search);
    if (url.pathname === `/client/v4/accounts/${authAccount}/queues` && url.search === '?per_page=100') return { httpStatus: 200, body: { success: true, result: listing,
      result_info: { page: 1, per_page: 100, count: listing.length, total_count: listing.length, total_pages: 1 } } };
    assert.equal(url.pathname, `/client/v4/accounts/${authAccount}/queues/${lifecycleId}`);
    assert.equal(url.search, '');
    return { httpStatus: 200, body: { success: true, result: queue } };
  } };
}

test('auth Queue audit records exact existing delivery and consumer settings without private fields', async () => {
  const queue = queueFixture();
  queue.secret = queue.author_email = 'fixture-private-marker';
  Object.assign(queue.consumers[0], { url: 'fixture-private-marker', token: 'fixture-private-marker', script_name_unused: 'fixture-private-marker' });
  queue.consumers[0].settings.unrelated_secret = 'fixture-private-marker';
  const reader = queueReader(queue, [queue, { queue_id: deadLetterId, queue_name: 'lythaus-email-lifecycle-dlq-dev' },
    { queue_id: '4'.repeat(32), queue_name: 'fixture-private-marker', consumers: [{ secret: 'fixture-private-marker' }] }]);
  const evidence = await captureAuthEmailQueueEvidence({ accountId: authAccount, requestJson: reader.requestJson });
  assert.equal(evidence.status, 'VERIFIED');
  assert.equal(evidence.reason, null);
  assert.equal(evidence.deliveryPaused, false);
  assert.equal(evidence.deliveryDelaySeconds, 0);
  assert.equal(evidence.reportedConsumerCount, 1);
  assert.equal(evidence.observedConsumerCount, 1);
  assert.deepEqual(evidence.inventory, { complete: true, page: 1, perPage: 100, count: 3, totalCount: 3, totalPages: 1 });
  assert.deepEqual(evidence.consumers.map(({ idHash, ...value }) => value), [{ type: 'worker', expectedWorkerMatches: true,
    expectedDeadLetterMatches: true, batchSize: 25, maxWaitTimeMs: 5000, maxRetries: 10, maxConcurrency: 1,
    maxConcurrencyPresent: true, maxConcurrencyType: 'number' }]);
  assert.match(evidence.lifecycleIdHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(reader.calls.length, 2);
  const serialized = JSON.stringify(evidence);
  assert.ok(!serialized.includes('fixture-private-marker'));
  for (const id of [lifecycleId, deadLetterId, '3'.repeat(32)]) assert.ok(!serialized.includes(id));
  assert.equal(evidence.piiIncluded, false);
  assert.equal(evidence.messagesRead, false);
  assert.equal(evidence.mutationPerformed, false);
});

for (const [label, alter, reason] of [
  ['paused', queue => { queue.settings.delivery_paused = true; }, 'live_delivery_not_verified'],
  ['delayed', queue => { queue.settings.delivery_delay = 20; }, 'live_delivery_not_verified'],
  ['missing-settings', queue => { delete queue.settings; }, 'live_delivery_not_verified'],
  ['missing-consumers', queue => { delete queue.consumers; }, 'live_consumer_not_verified'],
  ['multiple-consumers', queue => { queue.consumers.push(queue.consumers[0]); queue.consumers_total_count = 2; }, 'live_consumer_not_verified'],
  ['wrong-worker', queue => { queue.consumers[0].script_name = 'fixture-private-marker'; }, 'live_consumer_drift'],
  ['wrong-dlq', queue => { queue.consumers[0].dead_letter_queue = 'fixture-private-marker'; }, 'live_consumer_drift'],
  ['batch-drift', queue => { queue.consumers[0].settings.batch_size = 50; }, 'live_consumer_drift'],
  ['timeout-drift', queue => { queue.consumers[0].settings.max_wait_time_ms = 20000; }, 'live_consumer_drift'],
  ['retry-drift', queue => { queue.consumers[0].settings.max_retries = 3; }, 'live_consumer_drift'],
]) {
  test(`auth Queue audit blocks ${label} while retaining only safe observations`, async () => {
    const queue = queueFixture(); alter(queue);
    const reader = queueReader(queue);
    const evidence = await captureAuthEmailQueueEvidence({ accountId: authAccount, requestJson: reader.requestJson });
    assert.equal(evidence.status, 'BLOCKED');
    assert.match(evidence.reason, new RegExp(reason));
    assert.ok(!JSON.stringify(evidence).includes('fixture-private-marker'));
  });
}
for (const cap of [undefined, null, 0, 2, '1']) {
  test(`auth Queue audit preserves ${typeof cap}:${cap} concurrency as unverified without coercion`, async () => {
    const queue = queueFixture();
    if (cap === undefined) delete queue.consumers[0].settings.max_concurrency;
    else queue.consumers[0].settings.max_concurrency = cap;
    const reader = queueReader(queue);
    const evidence = await captureAuthEmailQueueEvidence({ accountId: authAccount, requestJson: reader.requestJson });
    assert.equal(evidence.status, 'BLOCKED');
    assert.match(evidence.reason, /consumer_concurrency_not_verified/);
    assert.equal(evidence.consumers[0].maxConcurrencyPresent, cap !== undefined);
    assert.equal(evidence.consumers[0].maxConcurrencyType, cap === null ? 'null' : typeof cap);
    assert.equal(evidence.consumers[0].maxConcurrency, typeof cap === 'number' ? cap : null);
  });
}

test('auth Queue audit stops on denied reads and invalid identity without probing another resource', async () => {
  const denied = await captureAuthEmailQueueEvidence({ accountId: authAccount, requestJson: async () => ({
    httpStatus: 401, body: { success: false, errors: [{ code: 10000, message: 'fixture-private-marker' }, { code: 'fixture-private-marker' }] },
  }) });
  assert.equal(denied.status, 'BLOCKED');
  assert.deepEqual(denied.api.list.errorCodes, [10000]);
  assert.equal(denied.api.details, null);
  assert.ok(!JSON.stringify(denied).includes('fixture-private-marker'));
  const badAccount = await captureAuthEmailQueueEvidence({ accountId: 'wrong-account', requestJson: () => assert.fail('No other account may be probed') });
  assert.match(badAccount.reason, /account_mismatch/);
  for (const listing of [[], [queueFixture()], [queueFixture(), queueFixture(), { queue_id: deadLetterId, queue_name: 'lythaus-email-lifecycle-dlq-dev' }],
    [{ ...queueFixture(), queue_id: '../fixture-private-marker' }, { queue_id: deadLetterId, queue_name: 'lythaus-email-lifecycle-dlq-dev' }]]) {
    const reader = queueReader(queueFixture(), listing);
    const result = await captureAuthEmailQueueEvidence({ accountId: authAccount, requestJson: reader.requestJson });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(reader.calls.length, 1);
    assert.ok(!JSON.stringify(result).includes('fixture-private-marker'));
  }
  for (const response of [{ httpStatus: 404, body: { success: false } }, { httpStatus: 200, body: { success: true, result: {} } },
    { httpStatus: 200, body: { success: true, result: { ...queueFixture(), queue_id: '4'.repeat(32) } } }]) {
    const reader = queueReader();
    const result = await captureAuthEmailQueueEvidence({ accountId: authAccount, requestJson: (url, init) => url.includes('?') ? reader.requestJson(url, init) : response });
    assert.equal(result.status, 'BLOCKED');
  }
  const unavailable = await captureAuthEmailQueueEvidence({ accountId: authAccount, requestJson: () => { throw new Error('fixture-private-marker'); } });
  assert.equal(unavailable.api.list.httpStatus, null);
  assert.ok(!JSON.stringify(unavailable).includes('fixture-private-marker'));
});

test('auth Queue audit requires complete bounded inventory before probing Queue details', async () => {
  const complete = { page: 1, per_page: 100, count: 2, total_count: 2, total_pages: 1 };
  const invalid = [undefined, {}, { ...complete, total_pages: 2 }, { ...complete, total_count: 101 },
    { ...complete, total_count: 3, total_pages: 2 }, { ...complete, page: 2 }, { ...complete, per_page: 1 },
    { ...complete, per_page: 101 }, { ...complete, per_page: 0 }, { ...complete, count: 1 },
    { ...complete, total_count: -1 }, { ...complete, total_pages: 0 }];
  for (const field of Object.keys(complete)) {
    for (const value of [undefined, null, '1', 1.5, Infinity]) invalid.push({ ...complete, [field]: value });
  }
  for (const info of invalid) {
    const reader = queueReader();
    const result = await captureAuthEmailQueueEvidence({ accountId: authAccount, requestJson: async (url, init) => {
      const response = await reader.requestJson(url, init);
      response.body.result_info = info;
      return response;
    } });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.reason, 'email_dispatch_queue_inventory_incomplete');
    assert.equal(result.inventory.complete, false);
    assert.equal(result.api.details, null);
    assert.equal(reader.calls.length, 1);
  }
  const listing = [queueFixture(), { queue_id: deadLetterId, queue_name: 'lythaus-email-lifecycle-dlq-dev' },
    ...Array.from({ length: 98 }, (_, index) => ({ queue_id: (index + 4).toString(16).padStart(32, '0'), queue_name: 'fixture-private-marker' }))];
  const fullPage = queueReader(queueFixture(), listing);
  const result = await captureAuthEmailQueueEvidence({ accountId: authAccount, requestJson: fullPage.requestJson });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.inventory.totalCount, 100);
  assert.equal(fullPage.calls.length, 2);
  assert.ok(!JSON.stringify(result).includes('fixture-private-marker'));
  const partialPage = queueReader(queueFixture(), listing);
  const partial = await captureAuthEmailQueueEvidence({ accountId: authAccount, requestJson: async (url, init) => {
    const response = await partialPage.requestJson(url, init);
    response.body.result_info.total_count = 101;
    response.body.result_info.total_pages = 2;
    return response;
  } });
  assert.equal(partial.status, 'BLOCKED');
  assert.equal(partial.reason, 'email_dispatch_queue_inventory_incomplete');
  assert.equal(partialPage.calls.length, 1);
});

test('existing auth incident audit keeps default-off probe, production review and read-only GitHub permissions', () => {
  const workflow = fs.readFileSync('.github/workflows/production-auth-incident-audit.yml', 'utf8');
  assert.match(workflow, /send_probe:[\s\S]*?default: false/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /issues: write|pull-requests: write|id-token: write/);
});
