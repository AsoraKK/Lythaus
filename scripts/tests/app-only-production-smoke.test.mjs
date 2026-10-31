import assert from 'node:assert/strict';
import test from 'node:test';
import { smokeAppOnlyProduction } from '../release/app-only-production-smoke.mjs';

const releaseSha = 'a'.repeat(40), sourceSha = 'b'.repeat(40), id = '11111111-1111-4111-8111-111111111111';
const workers = { jobs: { workerName: 'lythaus-jobs-development', versionId: id, sourceSha } };
const jobsProbe = { status: 'pass', releaseSha, workers: [{ worker: workers.jobs.workerName, workerVersionId: id, sourceSha, readiness: 'not_applicable_no_public_route' }] };
const headers = { 'strict-transport-security': 'max-age=1', 'content-security-policy': "default-src 'self'", 'x-content-type-options': 'nosniff' };
function fake(calls, mutate = () => {}) {
  return async (url, options) => {
    calls.push({ url, options });
    let response = url === 'https://api.lythaus.co/health' ? Response.json({ status: 'ok' })
      : url === 'https://admin.lythaus.co/' && !options.headers ? new Response('', { status: 403 })
      : new Response('For the living internet.', { status: 200, headers });
    response = mutate(url, options, response) ?? response;
    return response;
  };
}
const input = fetchImpl => ({ accessClientId: 'synthetic-id', accessClientSecret: 'synthetic-secret', jobsProbe, workers, releaseSha, fetchImpl });

test('smoke checks fixed production surfaces with scoped Access credentials and honest Jobs evidence', async () => {
  const calls = [];
  const result = await smokeAppOnlyProduction(input(fake(calls)));
  assert.equal(result.jobsEvidence, 'CAPTURED_VERSION_NO_PUBLIC_HEALTH_ROUTE');
  assert.equal(calls.length, 7);
  assert.ok(calls.every(call => call.options.redirect === 'manual'));
  assert.ok(calls.filter(call => call.options.headers).every(call => call.url.startsWith('https://admin')));
  assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
});

test('missing health, security headers, Access boundary or Jobs provenance fails closed', async () => {
  for (const mutate of [
    (url, _, response) => url === 'https://api.lythaus.co/health' ? Response.json({ status: 'down' }) : response,
    (url, _, response) => url === 'https://www.lythaus.co/' ? new Response('For the living internet.') : response,
    (url, options, response) => url === 'https://admin.lythaus.co/' && !options.headers ? new Response('', { status: 200 }) : response,
  ]) await assert.rejects(() => smokeAppOnlyProduction(input(fake([], mutate))));
  const invalid = { ...jobsProbe, workers: [{ ...jobsProbe.workers[0], workerVersionId: 'wrong' }] };
  await assert.rejects(() => smokeAppOnlyProduction({ ...input(fake([])), jobsProbe: invalid }), /Jobs version evidence/);
});
