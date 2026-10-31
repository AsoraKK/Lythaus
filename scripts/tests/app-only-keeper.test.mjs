import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareAppOnlyKeeperRun } from '../ci/app-only-keeper.mjs';
import { createAppOnlyAcceptanceContext } from '../release/app-only-acceptance.mjs';
import { REUSED_WORKER_NAMES } from '../release/app-only-eligibility.mjs';

const sha = 'a'.repeat(40), source = 'b'.repeat(40), now = Date.parse('2026-10-29T12:02:00.000Z');
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const context = createAppOnlyAcceptanceContext({ releaseSha: sha, now,
  capture: { schemaVersion: 1, startedAt: '2026-10-29T12:00:00.000Z', capturedAt: '2026-10-29T12:01:00.000Z',
    workers: Object.fromEntries(Object.entries(REUSED_WORKER_NAMES).map(([component, workerName], i) => [component,
      { workerName, versionId: ids[i],
        sourceSha: source, createdAt: '2026-10-28T12:00:00.000Z', percentage: 100 }])) },
  routeSnapshots: { adminApi: { route: { id: 'admin-route', pattern: 'admin.lythaus.co/api/admin/*', script: REUSED_WORKER_NAMES.admin } },
    coordinator: { route: { id: 'keeper-route', pattern: 'admin.lythaus.co/api/admin/production-auth-acceptance/*', script: REUSED_WORKER_NAMES.coordinator } } } });
const credentials = { readinessToken: 'synthetic-readiness', accessClientId: 'synthetic-id', accessClientSecret: 'synthetic-secret' };
const summary = () => ({ acceptanceRunId: id, releaseSha: sha, status: 'pending', expiresAt: '2026-10-29T13:00:00.000Z',
  candidate: structuredClone(context.candidate), candidateDependencies: structuredClone(context.dependencies), rollbackSnapshot: structuredClone(context.rollbackSnapshot) });
const response = (status, body) => ({ status, redirected: false, json: async () => body });

test('create is single-attempt and the returned run is read and bound to the live snapshot', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? response(201, { acceptanceRunId: id, keeperUrl: `https://admin.lythaus.co/production-auth-acceptance?run=${id}` }) : response(200, summary());
  };
  const run = await prepareAppOnlyKeeperRun({ context, now, ...credentials, fetchImpl });
  assert.equal(run.acceptanceRunId, id);
  assert.equal(run.releaseSha, sha);
  assert.equal(run.status, 'pending');
  assert.deepEqual(calls.map(value => value.options.method), ['POST', 'GET']);
  assert.deepEqual(JSON.parse(calls[0].options.body).candidateDependencies, context.dependencies);
  assert.ok(calls.every(value => value.options.redirect === 'error'));
});

test('resume performs only a fixed protected read and rejects drift', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); const item = summary(); item.candidateDependencies.jobs.versionId = context.dependencies.admin.versionId; return response(200, item); };
  await assert.rejects(() => prepareAppOnlyKeeperRun({ context, now, ...credentials, acceptanceRunId: id, fetchImpl }), /live binding invalid/);
  assert.deepEqual(calls.map(value => value.options.method), ['GET']);
});

test('uncertain create never retries and does not leak provider details', async () => {
  let calls = 0;
  await assert.rejects(() => prepareAppOnlyKeeperRun({ context, now, ...credentials, fetchImpl: async () => { calls++; throw new Error('secret provider detail'); } }),
    error => /outcome is unverified/.test(error.message) && !error.message.includes('secret'));
  assert.equal(calls, 1);
});

test('failed read after a create exposes only the run ID needed to reconcile', async () => {
  let calls = 0;
  await assert.rejects(() => prepareAppOnlyKeeperRun({ context, now, ...credentials, fetchImpl: async () => {
    calls++;
    return calls === 1 ? response(201, { acceptanceRunId: id, keeperUrl: `https://admin.lythaus.co/production-auth-acceptance?run=${id}` }) : response(503, {});
  } }), new RegExp(`reconcile run ${id}`));
  assert.equal(calls, 2);
});
