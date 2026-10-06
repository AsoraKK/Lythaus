import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureAuthEmailQueueEvidence } from './auth-email-queue-evidence.mjs';
import { assertPromptDispatchConsumer } from './provision-cloudflare-email-lifecycle.mjs';

export const AUTH_EMAIL_ATTACHMENT = Object.freeze({
  account: 'e5b7ae46e04698f507b7e4b3d4ef1af0',
  queue: 'lythaus-email-lifecycle-dev', dlq: 'lythaus-email-lifecycle-dlq-dev',
  worker: 'lythaus-jobs-development',
  source: '2b922100ac49c8a3a56541c4dd28f2a43eec78bf',
  version: 'd8ccfee2-92c6-446e-ba87-f956ac8a4b0c',
  queueHash: 'sha256:ec5c8faf8375bc29c7b6179e3a736a1a741bdeaec33df3d7333872fa3d079248',
  dlqHash: 'sha256:70c34cf1e060464a8cf907937507f127ef0b6f4f20002212562bac8b298d03e1',
  body: Object.freeze({ type: 'worker', script_name: 'lythaus-jobs-development',
    dead_letter_queue: 'lythaus-email-lifecycle-dlq-dev',
    settings: Object.freeze({ batch_size: 25, max_wait_time_ms: 5000, max_retries: 10, max_concurrency: 1 }) }),
});
const safeInteger = value => Number.isSafeInteger(value) && value >= 0;
const identifier = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const api = 'https://api.cloudflare.com/client/v4';

export async function attachAuthEmailConsumer({ requestJson, apply = false, now = new Date() }) {
  const a = AUTH_EMAIL_ATTACHMENT;
  const base = `${api}/accounts/${a.account}`;
  const receipt = { schemaVersion: 'lythaus-auth-email-consumer-attachment-v1', observedAt: now.toISOString(),
    mode: apply ? 'attach' : 'inspect', status: 'BLOCKED', reason: null,
    sourceSha: process.env.GITHUB_SHA ?? null, target: { queue: a.queue, worker: a.worker, deadLetterQueue: a.dlq },
    before: null, currentJobs: null, backlog: null, includedQueueAllowance: null, immediatePrewrite: null, blockedRead: null,
    mutationAttempted: false, mutationConfirmed: false, postHttpStatus: null, after: null,
    messagesRead: false, piiIncluded: false, emailsSent: false, pauseOrDelayChanged: false };
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
  try {
    receipt.before = await observe();
    if (!receipt.before.inventory.complete || receipt.before.api.details?.httpStatus !== 200
      || receipt.before.api.details?.success !== true || receipt.before.lifecycleIdHash !== a.queueHash
      || receipt.before.deadLetterIdHash !== a.dlqHash) return stop('queue_identity_not_verified');
    const queues = await read(`${base}/queues?per_page=100`, 'queue_inventory');
    const matches = Array.isArray(queues) ? queues.filter(queue => queue.queue_name === a.queue) : [];
    const dlqs = Array.isArray(queues) ? queues.filter(queue => queue.queue_name === a.dlq) : [];
    if (matches.length !== 1 || dlqs.length !== 1 || !identifier(matches[0].queue_id) || !identifier(dlqs[0].queue_id)) return stop('existing_queue_identity_changed');
    if (hash(matches[0].queue_id) !== a.queueHash || hash(dlqs[0].queue_id) !== a.dlqHash) return stop('existing_queue_identity_changed');
    const queueBase = `${base}/queues/${matches[0].queue_id}`;
    const consumers = await read(`${queueBase}/consumers`, 'consumer_list');
    if (!Array.isArray(consumers)) return stop('consumer_list_not_verified');
    if (consumers.length !== 0 || receipt.before.reportedConsumerCount !== 0 || receipt.before.observedConsumerCount !== 0) {
      if (consumers.length === 1 && receipt.before.status === 'VERIFIED') {
        const existingQueue = await read(queueBase, 'existing_attachment_details');
        try { assertPromptDispatchConsumer({ ...existingQueue, consumers }); }
        catch { return stop('existing_consumer_requires_review'); }
        receipt.status = 'ALREADY_ATTACHED_VERIFIED';
        return receipt;
      }
      return stop('existing_consumer_requires_review');
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
      oldestMessageTimestampMs: safeInteger(metrics.oldest_message_timestamp_ms) ? metrics.oldest_message_timestamp_ms : null };
    if (metrics.backlog_count > 128 || metrics.backlog_bytes > 16 * 128 * 1024) return stop('backlog_exceeds_reviewed_attachment_bound');
    const usage = await requestJson(`${api}/graphql`, { method: 'POST', body: JSON.stringify({
      query: `query AttachmentQueueUsage($accountTag: string!, $start: Time!, $end: Time!) {
        viewer { accounts(filter: { accountTag: $accountTag }) {
          queueMessageOperationsAdaptiveGroups(limit: 1, filter: { datetime_geq: $start, datetime_leq: $end }) {
            sum { billableOperations }
          }
        } }
      }`,
      variables: { accountTag: a.account, start: new Date(now.getTime() - 31 * 86400000).toISOString(), end: now.toISOString() },
    }) });
    const accounts = usage?.body?.data?.viewer?.accounts;
    const groups = Array.isArray(accounts) && accounts.length === 1 ? accounts[0].queueMessageOperationsAdaptiveGroups : null;
    const operations = Array.isArray(groups) && groups.length === 1 ? groups[0]?.sum?.billableOperations : null;
    if (usage?.httpStatus !== 200 || usage.body?.errors?.length || !safeInteger(operations)) return stop('included_queue_usage_not_verified');
    const additionalOperationsBound = 14 * (metrics.backlog_count + Math.ceil(metrics.backlog_bytes / 64000));
    receipt.includedQueueAllowance = { ownerConfirmedPlan: 'Workers Paid', windowDays: 31, observedOperations: operations,
      includedMonthlyOperations: 1000000, additionalBacklogOperationsBound: additionalOperationsBound,
      reserveOperations: 100000, futureUsageReserved: false, hardAccountWideBillingCap: false };
    if (operations + additionalOperationsBound + 100000 >= 1000000) return stop('included_queue_allowance_insufficient');
    if (!apply) { receipt.status = 'INSPECTED_ATTACHMENT_READY'; return receipt; }
    if (!await currentJobsMatches()) return stop('current_jobs_version_changed_before_write');
    const immediateMetrics = await read(`${queueBase}/metrics`, 'prewrite_backlog_metrics');
    if (!safeInteger(immediateMetrics?.backlog_count) || !safeInteger(immediateMetrics?.backlog_bytes)) return stop('backlog_not_verified_before_write');
    if (immediateMetrics.backlog_count > 128 || immediateMetrics.backlog_bytes > 16 * 128 * 1024) return stop('backlog_exceeds_reviewed_attachment_bound_before_write');
    const immediateOperationsBound = 14 * (immediateMetrics.backlog_count + Math.ceil(immediateMetrics.backlog_bytes / 64000));
    if (operations + immediateOperationsBound + 100000 >= 1000000) return stop('included_queue_allowance_insufficient_before_write');
    const immediate = await read(queueBase, 'prewrite_queue_details');
    const immediateConsumers = await read(`${queueBase}/consumers`, 'prewrite_consumers');
    if (immediate?.queue_name !== a.queue || immediate?.queue_id !== matches[0].queue_id
      || immediate.consumers_total_count !== 0 || !Array.isArray(immediate.consumers) || immediate.consumers.length !== 0
      || !Array.isArray(immediateConsumers) || immediateConsumers.length !== 0) return stop('consumer_or_identity_changed_before_write');
    if (immediate.settings?.delivery_delay !== 0 || immediate.settings?.delivery_paused === true) return stop('delivery_changed_before_write');
    receipt.immediatePrewrite = { queueIdentityVerified: true, reportedConsumers: 0, listedConsumers: 0,
      backlogCount: immediateMetrics.backlog_count, backlogBytes: immediateMetrics.backlog_bytes,
      additionalBacklogOperationsBound: immediateOperationsBound };
    receipt.mutationAttempted = true;
    let created;
    try { created = await requestJson(`${queueBase}/consumers`, { method: 'POST', body: JSON.stringify(a.body) }); }
    catch { created = null; }
    receipt.postHttpStatus = created?.httpStatus ?? null;
    receipt.mutationConfirmed = created?.httpStatus === 200 && created?.body?.success === true;
    receipt.after = await observe();
    const afterConsumers = await read(`${queueBase}/consumers`, 'postwrite_consumers');
    if (!Array.isArray(afterConsumers) || afterConsumers.length !== 1) return stop('attachment_readback_not_verified');
    const afterQueue = await read(queueBase, 'postwrite_queue_details');
    try { assertPromptDispatchConsumer({ ...afterQueue, consumers: afterConsumers }); }
    catch { return stop('attachment_or_delivery_readback_not_verified'); }
    if (receipt.after.status !== 'VERIFIED') return stop('canonical_attachment_readback_not_verified');
    receipt.status = receipt.mutationConfirmed ? 'ATTACHED_VERIFIED' : 'POST_UNCERTAIN_READBACK_VERIFIED';
    return receipt;
  } catch { return stop('auth_email_attachment_read_unavailable'); }
}

async function main() {
  const output = process.env.AUTH_EMAIL_ATTACHMENT_OUTPUT ?? '.artifacts/auth-email-attachment/receipt.json';
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const apply = process.env.AUTH_EMAIL_ATTACHMENT_APPROVED === 'true';
  if (!token || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.REF_PROTECTED !== 'true'
    || !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? '')) throw new Error('protected_main_and_existing_credential_required');
  const requestJson = async (url, init) => {
    const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' } });
    return { httpStatus: response.status, body: await response.json().catch(() => ({})) };
  };
  const receipt = await attachAuthEmailConsumer({ requestJson, apply });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ status: receipt.status, reason: receipt.reason, mutationAttempted: receipt.mutationAttempted,
    mutationConfirmed: receipt.mutationConfirmed, queueReadiness: receipt.after?.status ?? receipt.before?.status }));
  if (receipt.status === 'BLOCKED') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('auth_email_attachment_entrypoint_blocked'); process.exitCode = 1; });
}
