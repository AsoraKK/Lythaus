import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { captureAuthEmailQueueEvidence, consumerEvidence } from './auth-email-queue-evidence.mjs';
import { assertPromptDispatchConsumer } from './provision-cloudflare-email-lifecycle.mjs';

export const AUTH_EMAIL_ATTACHMENT = Object.freeze({
  account: 'e5b7ae46e04698f507b7e4b3d4ef1af0',
  queue: 'lythaus-email-lifecycle-dev', dlq: 'lythaus-email-lifecycle-dlq-dev',
  worker: 'lythaus-jobs-development',
  source: '2b922100ac49c8a3a56541c4dd28f2a43eec78bf',
  version: 'd8ccfee2-92c6-446e-ba87-f956ac8a4b0c',
  queueHash: 'sha256:ec5c8faf8375bc29c7b6179e3a736a1a741bdeaec33df3d7333872fa3d079248',
  dlqHash: 'sha256:70c34cf1e060464a8cf907937507f127ef0b6f4f20002212562bac8b298d03e1',
  consumerHash: 'sha256:39377e4ef786177a99c769a2289a7bcc32f17228d861145dfdaa01c1bfcc9c31',
  body: Object.freeze({ type: 'worker', script_name: 'lythaus-jobs-development',
    dead_letter_queue: 'lythaus-email-lifecycle-dlq-dev',
    settings: Object.freeze({ batch_size: 25, max_wait_time_ms: 5000, max_retries: 10, max_concurrency: 1 }) }),
});
const safeInteger = value => Number.isSafeInteger(value) && value >= 0;
const identifier = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const api = 'https://api.cloudflare.com/client/v4';

export async function attachAuthEmailConsumer({ requestJson, apply = false, resumeDelivery = false,
  expectedConsumerHash = AUTH_EMAIL_ATTACHMENT.consumerHash, now = new Date(), clock = () => new Date() }) {
  const a = AUTH_EMAIL_ATTACHMENT;
  const base = `${api}/accounts/${a.account}`;
  const receipt = { schemaVersion: 'lythaus-auth-email-consumer-attachment-v1', observedAt: now.toISOString(),
    mode: resumeDelivery ? 'resume_delivery' : apply ? 'attach' : 'inspect', status: 'BLOCKED', reason: null,
    sourceSha: process.env.GITHUB_SHA ?? null, target: { queue: a.queue, worker: a.worker, deadLetterQueue: a.dlq },
    before: null, beforeConsumerList: null, afterConsumerList: null, readbackReason: null,
    currentJobs: null, backlog: null, includedQueueAllowance: null, prewriteQueueEvidence: null,
    prewriteIncludedQueueAllowance: null, immediatePrewrite: null, blockedRead: null,
    mutationAttempted: false, mutationConfirmed: false, postHttpStatus: null, after: null,
    messagesRead: false, piiIncluded: false, emailsSent: false, pauseOrDelayChanged: resumeDelivery ? null : false,
    patchHttpStatus: null, pauseSettingWriteConfirmed: false, queueLifecycleProcessingMayResume: false,
    otherQueueSettingsPreserved: null };
  const stop = reason => ({ ...receipt, reason });
  const read = async (url, endpoint) => {
    let response;
    try { response = await requestJson(url, { method: 'GET' }); }
    catch { response = null; }
    if (response?.httpStatus !== 200 || response.body?.success !== true) {
      receipt.blockedRead = { endpoint, httpStatus: Number.isSafeInteger(response?.httpStatus) ? response.httpStatus : null,
        success: response?.body?.success === true,
        errorCodes: Array.isArray(response?.body?.errors) ? response.body.errors.slice(0, 5).map(error => error?.code).filter(Number.isSafeInteger) : [] };
      throw new Error('auth_email_attachment_read_unavailable');
    }
    return response.body.result;
  };
  const observe = () => captureAuthEmailQueueEvidence({ accountId: a.account, requestJson });
  const pinnedIdentities = evidence => evidence.inventory.complete && evidence.api.details?.httpStatus === 200
    && evidence.api.details?.success === true && evidence.lifecycleIdHash === a.queueHash && evidence.deadLetterIdHash === a.dlqHash;
  const absentPauseFields = fields => fields && Object.values(fields).length === 4
    && Object.values(fields).every(field => field.present === false);
  const pinnedConsumer = consumer => consumer?.idHash === expectedConsumerHash && consumer.type === 'worker'
    && consumer.expectedWorkerMatches && consumer.expectedDeadLetterMatches
    && consumer.batchSize === 25 && consumer.maxWaitTimeMs === 5000 && consumer.maxRetries === 10
    && consumer.maxConcurrency === 1 && consumer.maxConcurrencyPresent && consumer.maxConcurrencyType === 'number'
    && absentPauseFields(consumer.pauseFields);
  const boundSnapshotsMatch = evidence => evidence.reportedConsumerCount === 1 && evidence.observedConsumerCount === 1
    && evidence.listing?.reportedConsumerCount === 1 && evidence.listing?.observedConsumerCount === 1
    && pinnedConsumer(evidence.consumers[0]) && pinnedConsumer(evidence.listing.consumers[0]);
  const resumePreconditions = evidence => pinnedIdentities(evidence) && evidence.deliveryDelaySeconds === 0
    && evidence.deliveryPaused === null && evidence.deliveryPausedField?.present === false
    && absentPauseFields(evidence.pauseFields) && absentPauseFields(evidence.listing?.pauseFields)
    && boundSnapshotsMatch(evidence);
  const usageEstimate = async at => {
    const usage = await requestJson(`${api}/graphql`, { method: 'POST', body: JSON.stringify({
      query: `query AttachmentQueueUsage($accountTag: string!, $start: Time!, $end: Time!) {
        viewer { accounts(filter: { accountTag: $accountTag }) {
          queueMessageOperationsAdaptiveGroups(limit: 1, filter: { datetime_geq: $start, datetime_leq: $end }) {
            sum { billableOperations }
          }
        } }
      }`,
      variables: { accountTag: a.account, start: new Date(at.getTime() - 31 * 86400000).toISOString(), end: at.toISOString() },
    }) });
    const accounts = usage?.body?.data?.viewer?.accounts;
    const groups = Array.isArray(accounts) && accounts.length === 1 ? accounts[0].queueMessageOperationsAdaptiveGroups : null;
    const operations = Array.isArray(groups) && groups.length === 1 ? groups[0]?.sum?.billableOperations : null;
    return usage?.httpStatus === 200 && !usage.body?.errors?.length && safeInteger(operations) ? operations : null;
  };
  const estimatedAdditionalOperations = metrics => 14 * (metrics.backlog_count + Math.ceil(metrics.backlog_bytes / 64000));
  const allowanceEstimate = (operations, metrics, at) => ({ ownerConfirmedPlan: 'Workers Paid', windowDays: 31,
    observedAt: at.toISOString(), observedOperationsEstimate: operations, includedMonthlyOperations: 1000000,
    additionalObservedBacklogOperationsEstimate: estimatedAdditionalOperations(metrics), headroomOperations: 100000,
    usageBasis: 'SAMPLED_ADAPTIVE_ANALYTICS', backlogBasis: 'BEST_EFFORT_POINT_IN_TIME_METRICS',
    noOverageGuaranteed: false, futureUsageReserved: false, hardAccountWideBillingCap: false });
  try {
    receipt.before = await observe();
    if (!pinnedIdentities(receipt.before)) return stop('queue_identity_not_verified');
    const queues = await read(`${base}/queues?per_page=100`, 'queue_inventory');
    const matches = Array.isArray(queues) ? queues.filter(queue => queue.queue_name === a.queue) : [];
    const dlqs = Array.isArray(queues) ? queues.filter(queue => queue.queue_name === a.dlq) : [];
    if (matches.length !== 1 || dlqs.length !== 1 || !identifier(matches[0].queue_id) || !identifier(dlqs[0].queue_id)) return stop('existing_queue_identity_changed');
    if (hash(matches[0].queue_id) !== a.queueHash || hash(dlqs[0].queue_id) !== a.dlqHash) return stop('existing_queue_identity_changed');
    const queueBase = `${base}/queues/${matches[0].queue_id}`;
    const consumers = await read(`${queueBase}/consumers`, 'consumer_list');
    if (!Array.isArray(consumers)) return stop('consumer_list_not_verified');
    receipt.beforeConsumerList = consumers.slice(0, 2).map(consumerEvidence);
    if (consumers.length !== 0 || receipt.before.reportedConsumerCount !== 0 || receipt.before.observedConsumerCount !== 0) {
      if (consumers.length === 1 && receipt.before.status === 'VERIFIED') {
        if (resumeDelivery && (!boundSnapshotsMatch(receipt.before) || !pinnedConsumer(receipt.beforeConsumerList[0]))) {
          return stop('existing_consumer_requires_review');
        }
        const existingQueue = await read(queueBase, 'existing_attachment_details');
        try { assertPromptDispatchConsumer({ ...existingQueue, consumers }); }
        catch { return stop('existing_consumer_requires_review'); }
        receipt.after = await observe();
        if (!pinnedIdentities(receipt.after)) return stop('queue_identity_changed_during_readback');
        if (receipt.after.status !== 'VERIFIED') return stop('existing_consumer_requires_review');
        if (resumeDelivery && !boundSnapshotsMatch(receipt.after)) return stop('existing_consumer_requires_review');
        receipt.status = 'ALREADY_ATTACHED_VERIFIED';
        return receipt;
      }
      if (!resumeDelivery || !resumePreconditions(receipt.before) || consumers.length !== 1
        || !pinnedConsumer(receipt.beforeConsumerList[0])) return stop('existing_consumer_requires_review');
    }
    if (resumeDelivery && (consumers.length !== 1 || !resumePreconditions(receipt.before))) {
      return stop('existing_consumer_required_for_pause_setting');
    }
    const currentJobsMatches = async () => {
      const deployments = await read(`${base}/workers/scripts/${a.worker}/deployments`, 'current_jobs_deployments');
      const deployment = Array.isArray(deployments) ? deployments[0] : deployments?.deployments?.[0];
      const serving = deployment?.versions?.filter(version => version.percentage > 0);
      return Array.isArray(serving) && serving.length === 1 && serving[0].version_id === a.version && serving[0].percentage === 100;
    };
    if (!await currentJobsMatches()) return stop('current_jobs_version_changed');
    const version = await read(`${base}/workers/scripts/${a.worker}/versions/${a.version}`, 'current_jobs_version');
    const tag = version?.metadata?.annotations?.['workers/tag'] ?? version?.annotations?.['workers/tag'];
    if (version?.id !== a.version || tag !== a.source) return stop('current_jobs_source_not_verified');
    receipt.currentJobs = { version: a.version, sourceSha: a.source, lifecycleOnlyQueueHandlerReviewed: true };
    const metrics = await read(`${queueBase}/metrics`, 'backlog_metrics');
    if (!safeInteger(metrics?.backlog_count) || !safeInteger(metrics?.backlog_bytes)) return stop('backlog_not_verified');
    receipt.backlog = { count: metrics.backlog_count, bytes: metrics.backlog_bytes,
      oldestMessageTimestampMs: safeInteger(metrics.oldest_message_timestamp_ms) ? metrics.oldest_message_timestamp_ms : null,
      measurementBasis: 'BEST_EFFORT_POINT_IN_TIME_METRICS', actualQueueSizeGuaranteed: false };
    if (metrics.backlog_count > 128 || metrics.backlog_bytes > 16 * 128 * 1024) return stop('backlog_exceeds_reviewed_attachment_bound');
    const operations = await usageEstimate(now);
    if (operations === null) return stop('included_queue_usage_not_verified');
    receipt.includedQueueAllowance = allowanceEstimate(operations, metrics, now);
    if (operations + estimatedAdditionalOperations(metrics) + 100000 >= 1000000) return stop('included_queue_allowance_insufficient');
    if (!apply) { receipt.status = resumeDelivery ? 'INSPECTED_PAUSE_SETTING_PRECONDITIONS' : 'INSPECTED_ATTACHMENT_READY'; return receipt; }
    const immediateMetrics = await read(`${queueBase}/metrics`, 'prewrite_backlog_metrics');
    if (!safeInteger(immediateMetrics?.backlog_count) || !safeInteger(immediateMetrics?.backlog_bytes)) return stop('backlog_not_verified_before_write');
    if (immediateMetrics.backlog_count > 128 || immediateMetrics.backlog_bytes > 16 * 128 * 1024) return stop('backlog_exceeds_reviewed_attachment_bound_before_write');
    const refreshedAt = clock();
    const immediateOperations = await usageEstimate(refreshedAt);
    if (immediateOperations === null) return stop('included_queue_usage_not_verified_before_write');
    receipt.prewriteIncludedQueueAllowance = allowanceEstimate(immediateOperations, immediateMetrics, refreshedAt);
    if (immediateOperations + estimatedAdditionalOperations(immediateMetrics) + 100000 >= 1000000) return stop('included_queue_allowance_insufficient_before_write');
    if (!await currentJobsMatches()) return stop('current_jobs_version_changed_before_write');
    receipt.prewriteQueueEvidence = await observe();
    if (!pinnedIdentities(receipt.prewriteQueueEvidence)) return stop('queue_identity_changed_before_write');
    if (resumeDelivery) {
      if (!resumePreconditions(receipt.prewriteQueueEvidence)) return stop('pause_setting_preconditions_changed_before_write');
    } else {
      if (receipt.prewriteQueueEvidence.reportedConsumerCount !== 0 || receipt.prewriteQueueEvidence.observedConsumerCount !== 0) return stop('consumer_or_identity_changed_before_write');
      if (receipt.prewriteQueueEvidence.deliveryDelaySeconds !== 0 || receipt.prewriteQueueEvidence.deliveryPaused === true) return stop('delivery_changed_before_write');
    }
    const immediate = await read(queueBase, 'prewrite_queue_details');
    const immediateConsumers = await read(`${queueBase}/consumers`, 'prewrite_consumers');
    const expectedCount = resumeDelivery ? 1 : 0;
    if (immediate?.queue_name !== a.queue || immediate?.queue_id !== matches[0].queue_id
      || immediate.consumers_total_count !== expectedCount || !Array.isArray(immediate.consumers) || immediate.consumers.length !== expectedCount
      || !Array.isArray(immediateConsumers) || immediateConsumers.length !== expectedCount) return stop('consumer_or_identity_changed_before_write');
    if (resumeDelivery) {
      if (immediate.settings?.delivery_delay !== 0
        || !['delivery_paused', 'paused'].every(field => !Object.hasOwn(immediate, field) && !Object.hasOwn(immediate.settings, field))
        || !pinnedConsumer(consumerEvidence(immediate.consumers[0])) || !pinnedConsumer(consumerEvidence(immediateConsumers[0]))) {
        return stop('pause_setting_preconditions_changed_before_write');
      }
    } else if (immediate.settings?.delivery_delay !== 0 || immediate.settings?.delivery_paused === true) return stop('delivery_changed_before_write');
    receipt.immediatePrewrite = { queueIdentityVerified: true, deadLetterIdentityVerified: true,
      lifecycleIdHash: receipt.prewriteQueueEvidence.lifecycleIdHash, deadLetterIdHash: receipt.prewriteQueueEvidence.deadLetterIdHash,
      reportedConsumers: expectedCount, listedConsumers: expectedCount,
      observedBacklogCount: immediateMetrics.backlog_count, observedBacklogBytes: immediateMetrics.backlog_bytes,
      additionalObservedBacklogOperationsEstimate: estimatedAdditionalOperations(immediateMetrics) };
    receipt.mutationAttempted = true;
    let created;
    receipt.queueLifecycleProcessingMayResume = resumeDelivery;
    try { created = await requestJson(resumeDelivery ? queueBase : `${queueBase}/consumers`, {
      method: resumeDelivery ? 'PATCH' : 'POST', body: JSON.stringify(resumeDelivery ? { settings: { delivery_paused: false } } : a.body),
    }); }
    catch { created = null; }
    if (resumeDelivery) receipt.patchHttpStatus = created?.httpStatus ?? null;
    else receipt.postHttpStatus = created?.httpStatus ?? null;
    receipt.mutationConfirmed = created?.httpStatus === 200 && created?.body?.success === true;
    receipt.pauseSettingWriteConfirmed = resumeDelivery && receipt.mutationConfirmed;
    const afterConsumers = await read(`${queueBase}/consumers`, 'postwrite_consumers');
    receipt.afterConsumerList = Array.isArray(afterConsumers) ? afterConsumers.slice(0, 2).map(consumerEvidence) : null;
    if (!Array.isArray(afterConsumers) || afterConsumers.length !== 1) return stop('attachment_readback_not_verified');
    if (resumeDelivery && !pinnedConsumer(receipt.afterConsumerList[0])) return stop('consumer_changed_during_pause_setting_readback');
    const afterQueue = await read(queueBase, 'postwrite_queue_details');
    if (resumeDelivery) {
      const otherSettings = queue => Object.fromEntries(Object.entries(queue?.settings ?? {}).filter(([field]) => field !== 'delivery_paused'));
      receipt.otherQueueSettingsPreserved = isDeepStrictEqual(otherSettings(immediate), otherSettings(afterQueue));
      if (!receipt.otherQueueSettingsPreserved) return stop('queue_settings_changed_during_pause_setting_readback');
    }
    receipt.after = await observe();
    if (!pinnedIdentities(receipt.after)) return stop('queue_identity_changed_during_readback');
    try { assertPromptDispatchConsumer({ ...afterQueue, consumers: afterConsumers }); }
    catch (error) {
      receipt.readbackReason = /^email_dispatch_[a-z_]+$/.test(error?.message ?? '') ? error.message : 'email_dispatch_queue_metadata_invalid';
      return stop('attachment_or_delivery_readback_not_verified');
    }
    if (receipt.after.status !== 'VERIFIED') return stop('canonical_attachment_readback_not_verified');
    if (resumeDelivery && !boundSnapshotsMatch(receipt.after)) return stop('consumer_changed_during_pause_setting_readback');
    receipt.status = resumeDelivery ? receipt.mutationConfirmed ? 'DELIVERY_FALSE_SETTING_VERIFIED' : 'PATCH_UNCERTAIN_READBACK_VERIFIED'
      : receipt.mutationConfirmed ? 'ATTACHED_VERIFIED' : 'POST_UNCERTAIN_READBACK_VERIFIED';
    return receipt;
  } catch { return stop('auth_email_attachment_read_unavailable'); }
}

async function main() {
  const output = process.env.AUTH_EMAIL_ATTACHMENT_OUTPUT ?? '.artifacts/auth-email-attachment/receipt.json';
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const attachApproved = process.env.AUTH_EMAIL_ATTACHMENT_APPROVED === 'true';
  const resumeDelivery = process.env.AUTH_EMAIL_DELIVERY_RESUME_APPROVED === 'true';
  if (attachApproved && resumeDelivery) throw new Error('attachment_and_pause_setting_are_separate_approvals');
  const apply = attachApproved || resumeDelivery;
  if (!token || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.REF_PROTECTED !== 'true'
    || !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? '')) throw new Error('protected_main_and_existing_credential_required');
  const requestJson = async (url, init) => {
    const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' } });
    return { httpStatus: response.status, body: await response.json().catch(() => ({})) };
  };
  const receipt = await attachAuthEmailConsumer({ requestJson, apply, resumeDelivery });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ status: receipt.status, reason: receipt.reason, mutationAttempted: receipt.mutationAttempted,
    mutationConfirmed: receipt.mutationConfirmed, queueReadiness: receipt.after?.status ?? receipt.before?.status }));
  if (receipt.status === 'BLOCKED') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('auth_email_attachment_entrypoint_blocked'); process.exitCode = 1; });
}
