#!/usr/bin/env node

import fs from 'node:fs';

const baseUrl = process.env.PRODUCTION_PUBLIC_API_BASE_URL || 'https://api.lythaus.co';
const evidencePath = process.env.PRODUCTION_LIVE_EVIDENCE_PATH ?? '';
const base = new URL(baseUrl);

if (base.protocol !== 'https:' || base.hostname !== 'api.lythaus.co' || base.pathname !== '/') {
  throw new Error('PRODUCTION_PUBLIC_API_BASE_URL must be https://api.lythaus.co');
}

const attempts = [];
let passed = false;

for (let attempt = 1; attempt <= 6; attempt += 1) {
  const response = await fetch(new URL('/api/waitlist', base), {
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
    signal: AbortSignal.timeout(15_000),
  });

  const body = await response.json().catch(() => null);
  const observed = {
    attempt,
    status: response.status,
    error: typeof body?.error === 'string' ? body.error : null,
    cacheControl: response.headers.get('cache-control'),
    corsOrigin: response.headers.get('access-control-allow-origin'),
    correlationIdPresent: Boolean(response.headers.get('x-correlation-id')),
  };
  attempts.push(observed);

  passed = observed.status === 400
    && observed.error === 'turnstile_required'
    && observed.cacheControl === 'private, no-store'
    && observed.corsOrigin === 'https://lythaus.co'
    && observed.correlationIdPresent;

  if (passed) break;
  if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 2_000));
}

const evidence = {
  schemaVersion: 1,
  baseUrl: base.origin,
  status: passed ? 'pass' : 'live_contract_not_observed',
  attempts,
  capturedAt: new Date().toISOString(),
};
if (evidencePath) fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!passed) {
  throw new Error('live /api/waitlist contract was not observed after activation propagation retries');
}

console.log(JSON.stringify({ status: 'pass', attempts: attempts.length, waitlistRoute: 'present_fail_closed' }));
