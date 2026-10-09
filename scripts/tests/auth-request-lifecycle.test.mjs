import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthRequestLifecycle, describeFailureWindow } from './auth-request-lifecycle.mjs';

const ownerId = '018f0000-0000-7000-8000-000000000001';
const request = { origin: 'https://api.lythaus.co', method: 'GET', path: '/api/users/me', startedAt: 10, failedAt: 30 };
const marks = { intentAt: 20, finishedAt: 40, teardownAt: 50 };
for (const [name, value, timestamps, window] of [
  ['no actual sign-out intent', request, { ...marks, intentAt: null }, 'before_signout_intent'],
  ['cancelled while test flag is armed before actual DOM click', { ...request, failedAt: 19 }, marks, 'before_signout_intent'],
  ['request starts after actual sign-out intent', { ...request, startedAt: 21 }, marks, 'started_after_signout_intent'],
  ['cancellation after logout response', { ...request, failedAt: 41 }, marks, 'after_logout_response'],
  ['teardown cancellation', { ...request, failedAt: 51 }, marks, 'teardown'],
  ['missing start evidence', { ...request, startedAt: undefined }, marks, 'unobserved_start'],
]) test(`auth lifecycle: ${name} is outside the in-flight logout window`, () => {
  assert.equal(describeFailureWindow(value, timestamps, ownerId).window, window);
});

test('auth lifecycle: timing does not establish endpoint or owner scope', () => {
  for (const changed of [
    { origin: 'https://unrelated.invalid' }, { method: 'PATCH' },
    { path: '/api/users/another-owner' }, { path: '/api/feed/discover' },
  ]) {
    const result = describeFailureWindow({ ...request, ...changed }, marks, ownerId);
    assert.equal(result.window, 'during_explicit_signout');
    assert.equal(result.profileRead, false);
  }
});

test('auth lifecycle: annotations cannot accept a failed private request', () => {
  const failed = { path: '/api/users/me', expectedSignOutCancellation: false,
    ...describeFailureWindow(request, marks, ownerId) };
  assert.equal(failed.window, 'during_explicit_signout');
  assert.throws(() => assert.deepEqual([failed].filter(item => !item.expectedSignOutCancellation), []), assert.AssertionError);
});

test('auth lifecycle: snapshots are bounded and cannot mutate recorder state', () => {
  let now = 100;
  const trace = createAuthRequestLifecycle({ ownerId, clock: () => now, limit: 2 });
  trace.record('entry'); now = 110; trace.record('dom_signout_click'); now = 120; trace.record('extra');
  const snapshot = trace.snapshot();
  assert.equal(snapshot.events.length, 2); assert.equal(snapshot.dropped, 1);
  assert.equal(snapshot.marks.intentAt, 10);
  snapshot.events[0].type = 'changed'; snapshot.marks.intentAt = -1;
  assert.equal(trace.snapshot().events[0].type, 'entry');
  assert.equal(trace.snapshot().marks.intentAt, 10);
});

test('auth lifecycle: diagnostic paths strip queries and redact private paths', async () => {
  const bindings = {};
  const context = { on() {}, async addInitScript() {},
    async exposeBinding(name, callback) { bindings[name] = callback; } };
  const trace = createAuthRequestLifecycle({ ownerId });
  await trace.install(context);
  const page = {};
  bindings.__lythausAuthDiagnostic({ page }, { type: 'xhr_send',
    path: '/api/users/me?private=synthetic-private-value', browserEpochMs: 1 });
  bindings.__lythausAuthDiagnostic({ page }, { type: 'xhr_send',
    path: '/api/users/other-private-owner', browserEpochMs: 2 });
  const snapshot = trace.snapshot();
  assert.equal(snapshot.events[0].path, '/api/users/me');
  assert.equal(snapshot.events[1].path, '/[redacted]');
  assert.ok(!JSON.stringify(snapshot).includes('synthetic-private-value'));
  assert.ok(!JSON.stringify(snapshot).includes('other-private-owner'));
});
