import { createHash } from 'node:crypto';
import { assertPromptDispatchConsumer, resolvePromptDispatchWorker, LIFECYCLE_QUEUE, LIFECYCLE_DLQ } from './provision-cloudflare-email-lifecycle.mjs';

const ACCOUNT = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const WORKER = 'lythaus-jobs-development';
const MAX_QUEUE_RESULTS = 100;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const identifier = queue => queue?.queue_id ?? queue?.id;
const validIdentifier = value => typeof value === 'string' && /^[0-9a-f]{32}$/i.test(value);
const hash = value => validIdentifier(value) ? `sha256:${createHash('sha256').update(value).digest('hex')}` : null;
const name = queue => queue?.queue_name ?? queue?.name;

function fieldEvidence(container, field) {
  const value = container[field];
  return { present: Object.hasOwn(container, field),
    type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value };
}

function resourceIdentityEvidence(container, field) {
  const value = container[field];
  return { ...fieldEvidence(container, field),
    valueHash: typeof value === 'string' && value.length >= 1 && value.length <= 128 && !/[^a-zA-Z0-9_-]/.test(value)
      ? `sha256:${createHash('sha256').update(value).digest('hex')}` : null };
}

function environmentEvidence(container) {
  return Object.fromEntries(['environment', 'environment_name'].map(field => [field, {
    ...fieldEvidence(container, field), matchesProduction: container[field] === 'production',
    matchesDevelopment: container[field] === 'development',
  }]));
}

function workerFieldEvidence(container, field) {
  const value = container[field], reference = object(value);
  return { ...resourceIdentityEvidence(container, field), valueMatchesExpectedWorker: value === WORKER,
    reference: value && typeof value === 'object' && !Array.isArray(value) ? {
      identityFields: Object.fromEntries(['name', 'id', 'script_name'].map(key => [key, {
        ...resourceIdentityEvidence(reference, key), valueMatchesExpectedWorker: reference[key] === WORKER,
      }])),
      environmentFields: environmentEvidence(reference),
    } : null };
}

function pauseEvidence(value) {
  const container = object(value), settings = object(container.settings);
  return Object.fromEntries([
    ['settings.delivery_paused', settings, 'delivery_paused'], ['delivery_paused', container, 'delivery_paused'],
    ['settings.paused', settings, 'paused'], ['paused', container, 'paused'],
  ].map(([location, source, field]) => [location, {
    present: Object.hasOwn(source, field), type: source[field] === null ? 'null' : Array.isArray(source[field]) ? 'array' : typeof source[field],
    booleanValue: typeof source[field] === 'boolean' ? source[field] : null,
  }]));
}

function apiEvidence(response) {
  const body = object(response?.body);
  return {
    httpStatus: number(response?.httpStatus), success: body.success === true,
    errorCodes: Array.isArray(body.errors) ? body.errors.slice(0, 5).map(error => number(error?.code)).filter(code => code !== null) : [],
  };
}

export function consumerEvidence(value) {
  const consumer = object(value), settings = object(consumer.settings);
  return {
    idHash: hash(consumer.consumer_id),
    type: ['worker', 'http_pull'].includes(consumer.type) ? consumer.type : 'unknown',
    typeField: fieldEvidence(consumer, 'type'),
    expectedWorkerMatches: resolvePromptDispatchWorker(consumer) === WORKER,
    workerIdentityFields: Object.fromEntries(['script_name', 'script', 'service', 'worker'].map(field => [field, workerFieldEvidence(consumer, field)])),
    environmentFields: environmentEvidence(consumer), namespaceField: resourceIdentityEvidence(consumer, 'namespace'),
    pauseFields: pauseEvidence(consumer),
    expectedDeadLetterMatches: consumer.dead_letter_queue === LIFECYCLE_DLQ,
    batchSize: number(settings.batch_size), maxWaitTimeMs: number(settings.max_wait_time_ms),
    maxRetries: number(settings.max_retries), maxConcurrency: number(settings.max_concurrency),
    maxConcurrencyPresent: Object.hasOwn(settings, 'max_concurrency'),
    maxConcurrencyType: settings.max_concurrency === null ? 'null' : typeof settings.max_concurrency,
  };
}

/** Read only the approved account's existing Queue list and resolved Queue details. */
export async function captureAuthEmailQueueEvidence({ accountId, requestJson }) {
  const evidence = {
    status: 'BLOCKED', reason: null, source: 'cloudflare_queue_list_and_details', observedAt: new Date().toISOString(),
    queue: LIFECYCLE_QUEUE, expectedWorker: WORKER, expectedDeadLetterQueue: LIFECYCLE_DLQ,
    api: { list: null, details: null }, lifecycleMatches: 0, deadLetterMatches: 0,
    inventory: { complete: false, page: null, perPage: null, count: null, totalCount: null, totalPages: null },
    lifecycleIdHash: null, deadLetterIdHash: null, listing: null, pauseFields: null,
    deliveryPaused: null, deliveryPausedField: null, deliveryDelaySeconds: null, reportedConsumerCount: null, observedConsumerCount: null, consumers: [],
    piiIncluded: false, messagesRead: false, mutationPerformed: false,
  };
  const stop = reason => ({ ...evidence, reason });
  if (accountId !== ACCOUNT) return stop('email_dispatch_audit_account_mismatch');
  const read = async url => {
    try { return await requestJson(url, { method: 'GET' }); }
    catch { return { httpStatus: null, body: null }; }
  };
  const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/queues`;
  const listing = await read(`${base}?per_page=${MAX_QUEUE_RESULTS}`);
  evidence.api.list = apiEvidence(listing);
  if (listing?.httpStatus !== 200 || object(listing?.body).success !== true || !Array.isArray(listing.body.result)) {
    return stop('email_dispatch_queue_list_unavailable');
  }
  const info = object(listing.body.result_info);
  evidence.inventory = { complete: false, page: number(info.page), perPage: number(info.per_page),
    count: number(info.count), totalCount: number(info.total_count), totalPages: number(info.total_pages) };
  if (![info.page, info.per_page, info.count, info.total_count, info.total_pages].every(Number.isSafeInteger)
    || info.page !== 1 || info.total_pages !== 1 || info.per_page < 1 || info.per_page > MAX_QUEUE_RESULTS
    || listing.body.result.length > info.per_page || info.count !== listing.body.result.length
    || info.total_count !== listing.body.result.length) {
    return stop('email_dispatch_queue_inventory_incomplete');
  }
  evidence.inventory.complete = true;
  const lifecycle = listing.body.result.filter(queue => name(queue) === LIFECYCLE_QUEUE);
  const deadLetter = listing.body.result.filter(queue => name(queue) === LIFECYCLE_DLQ);
  evidence.lifecycleMatches = lifecycle.length;
  evidence.deadLetterMatches = deadLetter.length;
  if (lifecycle.length !== 1 || deadLetter.length !== 1) return stop('email_dispatch_existing_queues_not_unique');
  const queueId = identifier(lifecycle[0]), deadLetterId = identifier(deadLetter[0]);
  if (!validIdentifier(queueId) || !validIdentifier(deadLetterId)) return stop('email_dispatch_existing_queue_identity_unverified');
  evidence.lifecycleIdHash = hash(queueId);
  evidence.deadLetterIdHash = hash(deadLetterId);
  evidence.listing = { reportedConsumerCount: number(lifecycle[0].consumers_total_count),
    observedConsumerCount: Array.isArray(lifecycle[0].consumers) ? lifecycle[0].consumers.length : null,
    pauseFields: pauseEvidence(lifecycle[0]),
    consumers: Array.isArray(lifecycle[0].consumers) ? lifecycle[0].consumers.slice(0, 2).map(consumerEvidence) : [] };
  const details = await read(`${base}/${queueId}`);
  evidence.api.details = apiEvidence(details);
  if (details?.httpStatus !== 200 || object(details?.body).success !== true) return stop('email_dispatch_queue_details_unavailable');
  const queue = object(details.body.result), settings = object(queue.settings);
  if (name(queue) !== LIFECYCLE_QUEUE || identifier(queue) !== queueId) return stop('email_dispatch_queue_details_identity_mismatch');
  evidence.deliveryPaused = typeof settings.delivery_paused === 'boolean' ? settings.delivery_paused : null;
  evidence.deliveryPausedField = { present: Object.hasOwn(settings, 'delivery_paused'),
    type: settings.delivery_paused === null ? 'null' : typeof settings.delivery_paused };
  evidence.pauseFields = pauseEvidence(queue);
  evidence.deliveryDelaySeconds = number(settings.delivery_delay);
  evidence.reportedConsumerCount = number(queue.consumers_total_count);
  evidence.observedConsumerCount = Array.isArray(queue.consumers) ? queue.consumers.length : null;
  evidence.consumers = Array.isArray(queue.consumers) ? queue.consumers.slice(0, 2).map(consumerEvidence) : [];
  try { assertPromptDispatchConsumer(queue); }
  catch (error) {
    return stop(/^email_dispatch_[a-z_]+$/.test(error?.message ?? '') ? error.message : 'email_dispatch_queue_metadata_invalid');
  }
  evidence.status = 'VERIFIED';
  return evidence;
}
