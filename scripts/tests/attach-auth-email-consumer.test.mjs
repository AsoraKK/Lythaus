import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { attachAuthEmailConsumer, AUTH_EMAIL_ATTACHMENT as a } from '../ci/attach-auth-email-consumer.mjs';

const queueId = '12338c2610214858a141dc308206d9c2';
const dlqId = '00637c71243442cb864cd069f00d824e';
const now = new Date('2026-10-06T10:10:00Z');
function fixture(options = {}) {
  const calls = [];
  let attached = Boolean(options.attached), consumerReads = 0, deploymentReads = 0, queueReads = 0, metricsReads = 0, inventoryReads = 0, usageReads = 0;
  const consumer = { consumer_id: '1'.repeat(32), ...structuredClone(a.body) };
  if (options.consumerIdentityField) {
    consumer[options.consumerIdentityField] = consumer.script_name;
    delete consumer.script_name;
  }
  Object.assign(consumer, options.consumerFields ?? {});
  const replacementId = '3'.repeat(32);
  const queue = (id = queueId) => ({ queue_name: a.queue, queue_id: id,
    settings: { delivery_delay: 0, delivery_paused: false },
    consumers_total_count: attached ? 1 : 0, consumers: attached ? [consumer] : [] });
  return { calls, requestJson: async (url, init) => {
    assert.equal(new URL(url).origin, 'https://api.cloudflare.com');
    calls.push({ url, method: init.method, body: init.body });
    let result;
    if (url.endsWith('/graphql')) {
      usageReads += 1;
      assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body);
      assert.ok(!body.query.includes('mutation'));
      assert.equal(body.variables.accountTag, a.account);
      const start = new Date(body.variables.start), end = new Date(body.variables.end);
      assert.equal(end.getTime() - start.getTime(), 31 * 86400000);
      return { httpStatus: 200, body: options.usageMissing || (options.immediateUsageMissing && usageReads === 2) ? { errors: [{ message: 'private-fixture-marker' }] } : {
        data: { viewer: { accounts: [{ queueMessageOperationsAdaptiveGroups: [{ sum: { billableOperations: usageReads === 2 ? options.immediateOperations ?? options.operations ?? 31 : options.operations ?? 31 } }] }] } } } };
    }
    if (init.method === 'POST') {
      assert.ok(url.endsWith(`/queues/${queueId}/consumers`));
      assert.deepEqual(JSON.parse(init.body), a.body);
      if (options.postRejected) return { httpStatus: 403, body: { success: false, errors: [{ message: 'private-fixture-marker' }] } };
      attached = true;
      if (options.afterCapDrift) consumer.settings.max_concurrency = 2;
      if (options.postUncertain) throw new Error('private-fixture-marker');
      return { httpStatus: 200, body: { success: true, result: consumer } };
    }
    assert.equal(init.method, 'GET');
    if (url.endsWith('/queues?per_page=100')) {
      inventoryReads += 1;
      const phase = attached ? 'after' : 'before';
      const replacesQueue = options.prewriteQueueReplacement && inventoryReads === 3 || options.afterQueueReplacement && phase === 'after' && inventoryReads >= 3;
      const replacesDlq = options.prewriteDlqReplacement && inventoryReads === 3 || options.afterDlqReplacement && phase === 'after' && inventoryReads >= 3;
      const result = [queue(replacesQueue ? replacementId : queueId), { queue_name: a.dlq, queue_id: options.wrongIdentity || replacesDlq ? '2'.repeat(32) : dlqId }];
      return { httpStatus: 200, body: { success: true, result,
        result_info: { page: 1, per_page: 100, count: 2, total_count: options.partialInventory ? 101 : 2, total_pages: options.partialInventory ? 2 : 1 } } };
    }
    if (url.endsWith(`/queues/${queueId}/consumers`)) {
      consumerReads += 1;
      if (options.existingCapDrift && consumerReads === 1) consumer.settings.max_concurrency = 2;
      result = attached ? [consumer] : options.consumerRace && consumerReads === 2 ? [consumer] : [];
    } else if (url.endsWith(`/queues/${queueId}/metrics`)) {
      if (options.metricsDenied) return { httpStatus: 403, body: { success: false, errors: [{ code: 10000, message: 'private-fixture-marker' }] } };
      metricsReads += 1;
      result = { backlog_count: metricsReads === 2 ? options.immediateBacklogCount ?? options.backlogCount ?? 1 : options.backlogCount ?? 1,
        backlog_bytes: options.backlogBytes ?? 256, oldest_message_timestamp_ms: 1 };
    } else if (url.endsWith(`/queues/${queueId}`) || url.endsWith(`/queues/${replacementId}`)) {
      queueReads += 1;
      result = queue(url.endsWith(`/queues/${replacementId}`) ? replacementId : queueId);
      if (options.pauseUnknown) delete result.settings.delivery_paused;
      if (options.pauseChanged && queueReads === 2) result.settings.delivery_paused = true;
    } else if (url.endsWith(`/workers/scripts/${a.worker}/deployments`)) {
      deploymentReads += 1;
      result = { deployments: [{ versions: [{ version_id: options.versionRace && deploymentReads === 2 ? 'unexpected' : a.version, percentage: 100 }] }] };
    } else if (url.endsWith(`/workers/scripts/${a.worker}/versions/${a.version}`)) {
      result = { id: a.version, annotations: options.sourceMissing ? {} : { 'workers/tag': options.sourceChanged ? 'b'.repeat(40) : a.source }, private: 'private-fixture-marker' };
    } else throw new Error('Unexpected endpoint');
    return { httpStatus: 200, body: { success: true, result } };
  } };
}
const writes = f => f.calls.filter(call => call.method !== 'GET' && !call.url.endsWith('/graphql'));

test('inspection reads aggregate readiness without an attachment or message read', async () => {
  const f = fixture();
  const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, now });
  assert.equal(receipt.status, 'INSPECTED_ATTACHMENT_READY');
  assert.equal(receipt.includedQueueAllowance.observedOperationsEstimate, 31);
  assert.equal(receipt.includedQueueAllowance.noOverageGuaranteed, false);
  assert.equal(receipt.includedQueueAllowance.usageBasis, 'SAMPLED_ADAPTIVE_ANALYTICS');
  assert.equal(receipt.includedQueueAllowance.backlogBasis, 'BEST_EFFORT_POINT_IN_TIME_METRICS');
  assert.equal(writes(f).length, 0);
  assert.equal(receipt.mutationAttempted, false);
  assert.equal(receipt.messagesRead, false);
});

test('approved attachment makes exactly one exact POST after last consumer GET and verifies read-back', async () => {
  const f = fixture();
  const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, apply: true, now });
  assert.equal(receipt.status, 'ATTACHED_VERIFIED');
  assert.equal(receipt.mutationConfirmed, true);
  assert.equal(receipt.after.status, 'VERIFIED');
  assert.equal(receipt.after.consumers[0].maxConcurrency, 1);
  assert.equal(receipt.immediatePrewrite.lifecycleIdHash, a.queueHash);
  assert.equal(receipt.immediatePrewrite.deadLetterIdHash, a.dlqHash);
  assert.equal(receipt.after.lifecycleIdHash, a.queueHash);
  assert.equal(receipt.after.deadLetterIdHash, a.dlqHash);
  assert.equal(writes(f).length, 1);
  const index = f.calls.indexOf(writes(f)[0]);
  assert.ok(f.calls[index - 1].url.endsWith('/consumers'));
  assert.equal(f.calls[index - 1].method, 'GET');
  assert.ok(!JSON.stringify(receipt).includes('private-fixture-marker'));
});

for (const [label, options, reason] of [
  ['partial inventory', { partialInventory: true }, 'queue_identity_not_verified'],
  ['different existing DLQ', { wrongIdentity: true }, 'queue_identity_not_verified'],
  ['different deployed Jobs source', { sourceChanged: true }, 'current_jobs_source_not_verified'],
  ['missing deployed Jobs source', { sourceMissing: true }, 'current_jobs_source_not_verified'],
  ['Jobs version changes before write', { versionRace: true }, 'current_jobs_version_changed_before_write'],
  ['consumer created by another actor', { consumerRace: true }, 'consumer_or_identity_changed_before_write'],
  ['delivery paused by another actor', { pauseChanged: true }, 'delivery_changed_before_write'],
  ['missing aggregate usage', { usageMissing: true }, 'included_queue_usage_not_verified'],
  ['insufficient included allowance', { operations: 999999 }, 'included_queue_allowance_insufficient'],
  ['large backlog count', { backlogCount: 129 }, 'backlog_exceeds_reviewed_attachment_bound'],
  ['invalid backlog count', { backlogCount: '1' }, 'backlog_not_verified'],
  ['backlog grows before attachment', { immediateBacklogCount: 129 }, 'backlog_exceeds_reviewed_attachment_bound_before_write'],
  ['backlog becomes unavailable before attachment', { immediateBacklogCount: '1' }, 'backlog_not_verified_before_write'],
  ['same-name lifecycle Queue replaced before attachment', { prewriteQueueReplacement: true }, 'queue_identity_changed_before_write'],
  ['same-name DLQ replaced before attachment', { prewriteDlqReplacement: true }, 'queue_identity_changed_before_write'],
  ['usage grows past included allowance estimate before attachment', { immediateOperations: 999999 }, 'included_queue_allowance_insufficient_before_write'],
  ['usage estimate becomes unavailable before attachment', { immediateUsageMissing: true }, 'included_queue_usage_not_verified_before_write'],
]) {
  test(`${label} stops before any provider write`, async () => {
    const f = fixture(options);
    const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, apply: true, now });
    assert.equal(receipt.status, 'BLOCKED');
    assert.equal(receipt.reason, reason);
    assert.equal(writes(f).length, 0);
    assert.equal(receipt.mutationAttempted, false);
    assert.ok(!JSON.stringify(receipt).includes('private-fixture-marker'));
  });
}

test('existing verified attachment is not duplicated', async () => {
  const f = fixture({ attached: true });
  const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, apply: true, now });
  assert.equal(receipt.status, 'ALREADY_ATTACHED_VERIFIED');
  assert.equal(writes(f).length, 0);
});

for (const field of ['script', 'service']) {
  test(`read-only inspection preserves ${field} identity diagnostics and unknown pause without certifying or duplicating an attachment`, async () => {
    const f = fixture({ attached: true, pauseUnknown: true, consumerIdentityField: field });
    const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, now });
    assert.equal(receipt.status, 'BLOCKED');
    assert.equal(receipt.reason, 'existing_consumer_requires_review');
    assert.equal(receipt.before.deliveryPaused, null);
    assert.deepEqual(receipt.before.deliveryPausedField, { present: false, type: 'undefined' });
    for (const consumer of [receipt.before.consumers[0], receipt.beforeConsumerList[0]]) {
      assert.equal(consumer.expectedWorkerMatches, false);
      assert.deepEqual(consumer.workerIdentityFields.script_name, { present: false, type: 'undefined', valueHash: null, valueMatchesExpectedWorker: false, reference: null });
      assert.equal(consumer.workerIdentityFields[field].present, true);
      assert.equal(consumer.workerIdentityFields[field].type, 'string');
      assert.equal(consumer.workerIdentityFields[field].valueMatchesExpectedWorker, true);
      assert.match(consumer.workerIdentityFields[field].valueHash, /^sha256:[0-9a-f]{64}$/);
    }
    assert.equal(receipt.mutationAttempted, false);
    assert.equal(writes(f).length, 0);
    assert.ok(f.calls.every(call => call.method === 'GET'));
  });
}

test('confirmed attachment with unknown pause preserves both read-back shapes and exact validator reason without retry', async () => {
  const f = fixture({ pauseUnknown: true, consumerIdentityField: 'script' });
  const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, apply: true, now });
  assert.equal(receipt.status, 'BLOCKED');
  assert.equal(receipt.reason, 'attachment_or_delivery_readback_not_verified');
  assert.equal(receipt.readbackReason, 'email_dispatch_live_delivery_not_verified');
  assert.equal(receipt.mutationAttempted, true);
  assert.equal(receipt.mutationConfirmed, true);
  assert.equal(receipt.postHttpStatus, 200);
  assert.equal(receipt.after.reportedConsumerCount, 1);
  assert.equal(receipt.after.observedConsumerCount, 1);
  assert.equal(receipt.after.deliveryPaused, null);
  assert.equal(receipt.after.consumers[0].workerIdentityFields.script.valueMatchesExpectedWorker, true);
  assert.equal(receipt.afterConsumerList[0].workerIdentityFields.script.valueMatchesExpectedWorker, true);
  assert.equal(writes(f).length, 1);
  assert.ok(!JSON.stringify(receipt).includes('private-fixture-marker'));
});

test('read-only inspection captures bounded Worker references, environments and namespace across all response representations', async () => {
  const f = fixture({ attached: true, pauseUnknown: true, consumerIdentityField: 'script', consumerFields: {
    script: { name: a.worker, id: a.worker, script_name: a.worker, environment: 'production', secret: 'private-fixture-marker' },
    service: a.worker, worker: a.worker, environment: 'production', environment_name: 'development', namespace: 'fixture-namespace',
  } });
  const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, now });
  assert.equal(receipt.status, 'BLOCKED');
  assert.equal(receipt.mutationAttempted, false);
  assert.ok(f.calls.every(call => call.method === 'GET'));
  for (const consumer of [receipt.before.listing.consumers[0], receipt.before.consumers[0], receipt.beforeConsumerList[0]]) {
    assert.equal(consumer.type, 'worker');
    assert.equal(consumer.typeField.present, true);
    assert.equal(consumer.expectedWorkerMatches, false);
    assert.equal(consumer.workerIdentityFields.script.type, 'object');
    assert.equal(consumer.workerIdentityFields.script.valueMatchesExpectedWorker, false);
    assert.equal(consumer.workerIdentityFields.script.reference.identityFields.name.valueMatchesExpectedWorker, true);
    assert.equal(consumer.workerIdentityFields.script.reference.environmentFields.environment.matchesProduction, true);
    assert.equal(consumer.workerIdentityFields.service.valueMatchesExpectedWorker, true);
    assert.equal(consumer.workerIdentityFields.worker.valueMatchesExpectedWorker, true);
    assert.equal(consumer.environmentFields.environment.matchesProduction, true);
    assert.equal(consumer.environmentFields.environment_name.matchesDevelopment, true);
    assert.match(consumer.namespaceField.valueHash, /^sha256:[0-9a-f]{64}$/);
  }
  assert.equal(receipt.before.listing.pauseFields['settings.delivery_paused'].booleanValue, false);
  assert.equal(receipt.before.pauseFields['settings.delivery_paused'].present, false);
  assert.equal(receipt.before.deliveryPaused, null);
  const serialized = JSON.stringify(receipt);
  assert.ok(!serialized.includes('private-fixture-marker'));
  assert.ok(!serialized.includes('fixture-namespace'));
});

test('read-only inspection never fingerprints secret-like ASCII type or environment values in any snapshot', async () => {
  const marker = 'fixture_token_ASCII_1234567890';
  const fingerprint = `sha256:${createHash('sha256').update(marker).digest('hex')}`;
  const f = fixture({ attached: true, consumerFields: { type: marker, environment: marker, environment_name: marker,
    script: { name: a.worker, environment: marker, environment_name: marker } } });
  const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, now });
  assert.equal(receipt.status, 'BLOCKED');
  assert.equal(receipt.mutationAttempted, false);
  assert.ok(f.calls.every(call => call.method === 'GET'));
  for (const consumer of [receipt.before.listing.consumers[0], receipt.before.consumers[0], receipt.beforeConsumerList[0]]) {
    assert.equal(consumer.type, 'unknown');
    assert.deepEqual(consumer.typeField, { present: true, type: 'string' });
    for (const fields of [consumer.environmentFields, consumer.workerIdentityFields.script.reference.environmentFields]) {
      for (const field of Object.values(fields)) assert.equal(Object.hasOwn(field, 'valueHash'), false);
    }
  }
  const serialized = JSON.stringify(receipt);
  assert.ok(!serialized.includes(marker));
  assert.ok(!serialized.includes(fingerprint));
});

test('usage is refreshed with a current time window immediately before attachment and remains an estimate', async () => {
  const f = fixture({ immediateOperations: 43 });
  const refreshedAt = new Date(now.getTime() + 60000);
  const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, apply: true, now, clock: () => refreshedAt });
  const queries = f.calls.filter(call => call.url.endsWith('/graphql'));
  assert.equal(receipt.status, 'ATTACHED_VERIFIED');
  assert.equal(queries.length, 2);
  assert.equal(JSON.parse(queries[0].body).variables.end, now.toISOString());
  assert.equal(JSON.parse(queries[1].body).variables.end, refreshedAt.toISOString());
  assert.equal(receipt.includedQueueAllowance.observedOperationsEstimate, 31);
  assert.equal(receipt.prewriteIncludedQueueAllowance.observedOperationsEstimate, 43);
  assert.equal(receipt.prewriteIncludedQueueAllowance.noOverageGuaranteed, false);
  assert.equal(receipt.prewriteIncludedQueueAllowance.futureUsageReserved, false);
  assert.equal(receipt.prewriteIncludedQueueAllowance.hardAccountWideBillingCap, false);
  assert.equal(writes(f).length, 1);
});

for (const options of [{ afterQueueReplacement: true }, { afterDlqReplacement: true }, { afterDlqReplacement: true, postUncertain: true }]) {
  test(`same-name replacement during final read-back stays blocked without retry: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, apply: true, now });
    assert.equal(receipt.status, 'BLOCKED');
    assert.equal(receipt.reason, 'queue_identity_changed_during_readback');
    assert.equal(receipt.after.status, 'VERIFIED');
    assert.equal(receipt.mutationConfirmed, !options.postUncertain);
    assert.ok(receipt.after.lifecycleIdHash !== a.queueHash || receipt.after.deadLetterIdHash !== a.dlqHash);
    assert.equal(writes(f).length, 1);
  });
}

test('existing attachment cannot report success after a same-name DLQ replacement', async () => {
  const f = fixture({ attached: true, afterDlqReplacement: true });
  const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, apply: true, now });
  assert.equal(receipt.status, 'BLOCKED');
  assert.equal(receipt.reason, 'queue_identity_changed_during_readback');
  assert.equal(writes(f).length, 0);
});

test('existing attachment with newly drifted settings remains blocked and is not duplicated', async () => {
  const f = fixture({ attached: true, existingCapDrift: true });
  const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, apply: true, now });
  assert.equal(receipt.status, 'BLOCKED');
  assert.equal(receipt.reason, 'existing_consumer_requires_review');
  assert.equal(writes(f).length, 0);
});

test('denied backlog read preserves exact safe endpoint/status without private provider text', async () => {
  const f = fixture({ metricsDenied: true });
  const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, apply: true, now });
  assert.equal(receipt.status, 'BLOCKED');
  assert.deepEqual(receipt.blockedRead, { endpoint: 'backlog_metrics', httpStatus: 403, success: false, errorCodes: [10000] });
  assert.equal(writes(f).length, 0);
  assert.ok(!JSON.stringify(receipt).includes('private-fixture-marker'));
});

test('uncertain POST is never retried; exact successful read-back is distinguished', async () => {
  const f = fixture({ postUncertain: true });
  const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, apply: true, now });
  assert.equal(receipt.status, 'POST_UNCERTAIN_READBACK_VERIFIED');
  assert.equal(receipt.mutationConfirmed, false);
  assert.equal(receipt.after.status, 'VERIFIED');
  assert.equal(writes(f).length, 1);
});

test('rejected POST remains blocked without retry or alternate credential', async () => {
  const f = fixture({ postRejected: true });
  const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, apply: true, now });
  assert.equal(receipt.status, 'BLOCKED');
  assert.equal(receipt.mutationConfirmed, false);
  assert.equal(receipt.postHttpStatus, 403);
  assert.equal(writes(f).length, 1);
});

for (const options of [{ pauseUnknown: true }, { afterCapDrift: true }]) {
  test(`attachment read-back preserves unknown pause or drifted cap: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    const receipt = await attachAuthEmailConsumer({ requestJson: f.requestJson, apply: true, now });
    assert.equal(receipt.status, 'BLOCKED');
    assert.equal(receipt.reason, 'attachment_or_delivery_readback_not_verified');
    assert.equal(receipt.mutationConfirmed, true);
    assert.equal(writes(f).length, 1);
    if (options.pauseUnknown) assert.equal(receipt.after.deliveryPaused, null);
  });
}

test('workflow uses protected main, existing production context, exact source gates and serial release groups', () => {
  const workflow = fs.readFileSync('.github/workflows/auth-email-consumer-attachment.yml', 'utf8');
  for (const pattern of [/default: false/, /contents: read/, /actions: read/, /environment: production/,
    /refs\/heads\/main/, /REF_PROTECTED/, /verify-exact-release-evidence\.mjs/,
    /lythaus-canonical-production-release/, /lythaus-production-workers/]) assert.match(workflow, pattern);
  assert.doesNotMatch(workflow, /issues: write|pull-requests: write|secrets: write|wrangler.*deploy|send_probe/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
});
