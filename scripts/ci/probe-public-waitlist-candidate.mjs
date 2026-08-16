#!/usr/bin/env node

import fs from 'node:fs';

const releaseSha = process.env.RELEASE_SHA ?? '';
const workerName = process.env.PRODUCTION_WORKER_SCOPE ?? 'lythaus-public-api-development';
const workerVersionId = process.env.PRODUCTION_WORKER_VERSION_ID ?? '';
const baseUrl = process.env.PRODUCTION_PUBLIC_API_BASE_URL || 'https://api.lythaus.co';
const evidencePath = process.env.PRODUCTION_WORKER_EVIDENCE_PATH ?? '';

if (!/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error('RELEASE_SHA must be the exact merged main commit');
if (workerName !== 'lythaus-public-api-development') throw new Error('public waitlist probe requires the canonical public Worker');
if (!/^[0-9a-f-]{36}$/i.test(workerVersionId)) throw new Error('PRODUCTION_WORKER_VERSION_ID is required');
const base = new URL(baseUrl);
if (base.protocol !== 'https:' || base.hostname !== 'api.lythaus.co' || base.pathname !== '/') {
  throw new Error('PRODUCTION_PUBLIC_API_BASE_URL must be https://api.lythaus.co');
}

function versionHeaders(extra = {}) {
  return {
    ...extra,
    'Cloudflare-Workers-Version-Overrides': `${workerName}="${workerVersionId}"`,
  };
}

async function request(path, init = {}) {
  return fetch(new URL(path, base), {
    ...init,
    headers: versionHeaders(init.headers),
    signal: AbortSignal.timeout(15_000),
  });
}

for (const path of ['/health', '/ready']) {
  const response = await request(path, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
}

const routeRequest = {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'content-type': 'application/json',
    origin: 'https://lythaus.co',
  },
  body: JSON.stringify({
    email: 'candidate-probe@example.invalid',
    turnstileToken: '',
    consentVersion: 'waitlist-v1',
    source: 'lythaus.co',
  }),
};

let routeProbe;
let routeBody = null;
let matchedCandidateContract = false;
let attempts = 0;
for (attempts = 1; attempts <= 6; attempts += 1) {
  routeProbe = await request('/api/waitlist', routeRequest);
  routeBody = await routeProbe.json().catch(() => null);
  matchedCandidateContract = routeProbe.status === 400 && routeBody?.error === 'turnstile_required';
  if (matchedCandidateContract) break;
  if (attempts < 6) await new Promise((resolve) => setTimeout(resolve, 1_000));
}

const evidence = {
  schemaVersion: 1,
  releaseSha,
  worker: workerName,
  workerVersionId,
  baseUrl: base.origin,
  health: 'pass',
  ready: 'pass',
  waitlistRoute: matchedCandidateContract ? 'present_fail_closed' : 'candidate_contract_not_observed',
  turnstileMissingTokenStatus: routeProbe?.status ?? null,
  observedError: typeof routeBody?.error === 'string' ? routeBody.error : null,
  attempts,
  cacheControl: routeProbe?.headers.get('cache-control') ?? null,
  corsOrigin: routeProbe?.headers.get('access-control-allow-origin') ?? null,
  correlationIdPresent: Boolean(routeProbe?.headers.get('x-correlation-id')),
  capturedAt: new Date().toISOString(),
};
if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!matchedCandidateContract) {
  throw new Error(`candidate /api/waitlist did not fail closed on a missing Turnstile token after ${attempts} attempts; observed HTTP ${routeProbe?.status ?? 'none'} error=${evidence.observedError ?? 'none'}`);
}
if (routeProbe.headers.get('cache-control') !== 'private, no-store') {
  throw new Error('candidate /api/waitlist error response must be private, no-store');
}
if (routeProbe.headers.get('access-control-allow-origin') !== 'https://lythaus.co') {
  throw new Error('candidate /api/waitlist CORS contract failed');
}
if (!routeProbe.headers.get('x-correlation-id')) {
  throw new Error('candidate /api/waitlist response is missing the correlation identifier');
}

console.log(JSON.stringify({ status: 'pass', worker: workerName, workerVersionId, waitlistRoute: evidence.waitlistRoute, attempts }));
