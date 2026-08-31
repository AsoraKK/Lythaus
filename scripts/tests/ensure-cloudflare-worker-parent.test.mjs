import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  COORDINATOR_WORKER_NAME,
  LYTHAUS_ACCOUNT_ID,
  ensureCloudflareWorkerParent,
} from '../ci/ensure-cloudflare-worker-parent.mjs';

function response(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return payload;
    },
  };
}

function fakeFetch(sequence) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const next = sequence.shift();
      assert.ok(next, `unexpected request ${init.method} ${url}`);
      return typeof next === 'function' ? next(url, init) : next;
    },
  };
}

function parent(overrides = {}) {
  return {
    id: 'coordinator-parent-id',
    name: COORDINATOR_WORKER_NAME,
    deployed_on: null,
    subdomain: { enabled: false, previews_enabled: false },
    references: { domains: [] },
    ...overrides,
  };
}

function success(result) {
  return response(200, { success: true, result });
}

function notFound() {
  return response(404, { success: false, errors: [{ code: 10007, message: 'not found' }] });
}

const options = (fetchImpl, extra = {}) => ({
  token: 'token-is-never-emitted',
  accountId: LYTHAUS_ACCOUNT_ID,
  fetchImpl,
  sleepImpl: async () => undefined,
  ...extra,
});

test('absent coordinator parent is created once with no deployment or route call', async () => {
  const fake = fakeFetch([
    notFound(),
    success(parent()),
    success(parent()),
  ]);
  const evidence = await ensureCloudflareWorkerParent(options(fake.fetchImpl));

  assert.deepEqual(
    { workerName: evidence.workerName, existedBefore: evidence.existedBefore, created: evidence.created, status: evidence.status },
    { workerName: COORDINATOR_WORKER_NAME, existedBefore: false, created: true, status: 'VERIFIED' },
  );
  assert.equal(fake.calls.length, 3);
  assert.equal(fake.calls[0].init.method, 'GET');
  assert.equal(fake.calls[1].init.method, 'POST');
  assert.equal(fake.calls[1].url.endsWith(`/workers/workers/${COORDINATOR_WORKER_NAME}`), false);
  assert.deepEqual(JSON.parse(fake.calls[1].init.body), { name: COORDINATOR_WORKER_NAME });
  assert.equal(fake.calls[2].init.method, 'GET');
  assert.ok(fake.calls.every(({ url }) => !url.includes('/routes') && !url.includes('/deploy')));
});

test('existing coordinator parent is verified without mutation', async () => {
  const fake = fakeFetch([success(parent({ deployed_on: '2026-08-31T10:00:00.000Z' }))]);
  const evidence = await ensureCloudflareWorkerParent(options(fake.fetchImpl));

  assert.equal(evidence.status, 'VERIFIED');
  assert.equal(evidence.existedBefore, true);
  assert.equal(evidence.created, false);
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].init.method, 'GET');
});

test('second ensure execution is a no-op', async () => {
  const first = fakeFetch([notFound(), success(parent()), success(parent())]);
  await ensureCloudflareWorkerParent(options(first.fetchImpl));
  const second = fakeFetch([success(parent())]);
  const evidence = await ensureCloudflareWorkerParent(options(second.fetchImpl));

  assert.equal(evidence.created, false);
  assert.equal(second.calls.length, 1);
  assert.equal(second.calls[0].init.method, 'GET');
});

test('provider errors fail closed and never fall through to creation', async () => {
  const fake = fakeFetch([response(403, { success: false, errors: [{ code: 9109, message: 'forbidden' }] })]);
  await assert.rejects(
    ensureCloudflareWorkerParent(options(fake.fetchImpl)),
    /HTTP 403; codes=9109/,
  );
  assert.equal(fake.calls.length, 1);
});

test('arbitrary Worker names and accounts are rejected before API access', async () => {
  const fake = fakeFetch([]);
  await assert.rejects(
    ensureCloudflareWorkerParent(options(fake.fetchImpl, { workerName: 'other-worker' })),
    /outside the configured Lythaus coordinator scope/,
  );
  await assert.rejects(
    ensureCloudflareWorkerParent(options(fake.fetchImpl, { accountId: 'other-account' })),
    /outside the configured Lythaus scope/,
  );
  assert.equal(fake.calls.length, 0);
});

test('parent-only creation fails closed if Cloudflare reports activation side effects', async () => {
  const fake = fakeFetch([
    notFound(),
    success(parent()),
    success(parent({ deployed_on: '2026-08-31T10:00:00.000Z' })),
  ]);
  await assert.rejects(
    ensureCloudflareWorkerParent(options(fake.fetchImpl)),
    /already has a deployment/,
  );
  assert.equal(fake.calls.filter(({ init }) => init.method === 'POST').length, 1);
});

test('check-only absence is read-only and emits a safe state artifact', async () => {
  const fake = fakeFetch([notFound()]);
  const temp = await mkdtemp(path.join(os.tmpdir(), 'lythaus-parent-test-'));
  const statePath = path.join(temp, 'state.json');
  const evidence = await ensureCloudflareWorkerParent(options(fake.fetchImpl, {
    checkOnly: true,
    outputPath: path.join(temp, 'evidence.json'),
    statePath,
  }));

  assert.equal(evidence.status, 'ABSENT');
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].init.method, 'GET');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(state.workerName, COORDINATOR_WORKER_NAME);
  assert.equal(state.deployment, undefined);
  assert.doesNotMatch(await readFile(statePath, 'utf8'), /token-is-never-emitted/);
});

test('concurrent creation race is reconciled by a read-only recheck', async () => {
  const fake = fakeFetch([
    notFound(),
    response(409, { success: false, errors: [{ code: 10090, message: 'already exists' }] }),
    success(parent()),
  ]);
  const evidence = await ensureCloudflareWorkerParent(options(fake.fetchImpl));

  assert.equal(evidence.status, 'VERIFIED');
  assert.equal(evidence.created, false);
  assert.equal(evidence.existedBefore, true);
  assert.equal(fake.calls.length, 3);
});
