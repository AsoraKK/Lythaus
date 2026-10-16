import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyExpectedProtectedReturnDiscoverCancellation, createAuthRequestLifecycle, describeFailureWindow } from './auth-request-lifecycle.mjs';

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

function protectedReturnCancellationTrace() {
  return { dropped: 0, events: [
    { sequence: 1, type: 'logout_response_finished', phase: 'logout_armed' },
    { sequence: 2, type: 'both_tabs_signed_out', phase: 'logout_armed' },
    { sequence: 3, type: 'phase', phase: 'protected_return' },
    { sequence: 4, type: 'protected_return_navigation_requested', phase: 'protected_return', path: '/settings/security' },
    { sequence: 5, type: 'request_start', phase: 'protected_return', pageId: 1, requestId: 7,
      isNavigationRequest: true, method: 'GET', path: '/settings/security' },
    { sequence: 6, type: 'xhr_send', phase: 'protected_return', pageId: 1, xhrId: 2,
      method: 'GET', path: '/api/feed/discover', query: 'limit=25' },
    { sequence: 7, type: 'uncaught_page_error', phase: 'protected_return', pageId: 1,
      pageErrorIndex: 0, name: 'XMLHttpRequest cannot load https',
      message: '/api.lythaus.co/api/feed/discover?limit=25 due to access control checks.', path: '/login' },
    { sequence: 8, type: 'xhr_error', phase: 'protected_return', pageId: 1, xhrId: 2,
      method: 'GET', path: '/api/feed/discover', query: 'limit=25', xhrReadyState: 4, xhrStatus: 0 },
    { sequence: 9, type: 'xhr_loadend', phase: 'protected_return', pageId: 1, xhrId: 2,
      method: 'GET', path: '/api/feed/discover', query: 'limit=25', xhrReadyState: 4, xhrStatus: 0 },
    { sequence: 10, type: 'response_headers', phase: 'protected_return', pageId: 1, requestId: 7,
      isNavigationRequest: true, method: 'GET', path: '/settings/security', status: 200 },
    { sequence: 11, type: 'navigation', phase: 'protected_return', pageId: 1, path: '/settings/security' },
  ] };
}

test('auth lifecycle: classifies only the correlated Discover XHR canceled by completed logout navigation', () => {
  assert.deepEqual([...classifyExpectedProtectedReturnDiscoverCancellation(protectedReturnCancellationTrace())], [0]);
});

test('auth lifecycle: accepts the recorded WebKit cancellation trace without adding synthetic events', async () => {
  const trace = JSON.parse(await readFile(
    new URL('./fixtures/protected-return-discover-cancellation.webkit.json', import.meta.url), 'utf8'));
  assert.deepEqual(trace.provenance, {
    workflow_run_id: 38811914382,
    workflow_job_id: 116686972282,
    diagnostic_head: '1a344334a4991a05b359bfb27dc03d61a4d36407',
    engine: 'webkit',
    viewport_width: 390,
    scenario: 'baseline',
    complete: false,
    dropped: 0,
    captured_event_range: [446, 466],
    note: 'Events are copied from the real Flutter auth browser job diagnostic; the stack field is omitted. The old test failed because it treated every page error as unexpected.',
  });
  assert.deepEqual([...classifyExpectedProtectedReturnDiscoverCancellation(trace)], [0]);
});

test('auth lifecycle: real Discover network activity remains an unexpected CORS failure', () => {
  for (const activity of [
    { sequence: 6.5, type: 'request_start', phase: 'protected_return', pageId: 1,
      method: 'OPTIONS', path: '/api/feed/discover' },
    { sequence: 8.5, type: 'server_response', phase: 'protected_return', method: 'GET',
      path: '/api/feed/discover', status: 200 },
    { sequence: 8.5, type: 'request_failed', phase: 'protected_return', pageId: 1,
      method: 'GET', path: '/api/feed/discover', error: 'other_network_failure' },
  ]) {
    const trace = protectedReturnCancellationTrace();
    trace.events.push(activity);
    assert.deepEqual([...classifyExpectedProtectedReturnDiscoverCancellation(trace)], []);
  }
});

test('auth lifecycle: incomplete logout, wrong request, or missing document navigation never classifies', () => {
  const mutations = [
    trace => { trace.events = trace.events.filter(event => event.type !== 'logout_response_finished'); },
    trace => { trace.events = trace.events.filter(event => event.type !== 'both_tabs_signed_out'); },
    trace => { trace.events.find(event => event.type === 'xhr_send').query = 'cursor=private'; },
    trace => { trace.events.find(event => event.type === 'xhr_send').path = '/api/feed/news'; },
    trace => { trace.events.find(event => event.type === 'request_start').isNavigationRequest = false; },
    trace => { trace.events.find(event => event.type === 'xhr_error').xhrStatus = 200; },
    trace => { trace.events.find(event => event.type === 'uncaught_page_error').path = '/settings/security'; },
    trace => { trace.events.find(event => event.type === 'uncaught_page_error').message = 'different CORS failure'; },
    trace => { trace.dropped = 1; },
  ];
  for (const mutate of mutations) {
    const trace = protectedReturnCancellationTrace();
    mutate(trace);
    assert.deepEqual([...classifyExpectedProtectedReturnDiscoverCancellation(trace)], []);
  }
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
  bindings.__lythausAuthDiagnostic({ page }, { type: 'xhr_send',
    path: '/api/feed/discover', query: 'limit=25', browserEpochMs: 3 });
  const snapshot = trace.snapshot();
  assert.equal(snapshot.events[0].path, '/api/users/me');
  assert.equal(snapshot.events[1].path, '/[redacted]');
  assert.equal(snapshot.events[2].query, 'limit=25');
  assert.ok(!JSON.stringify(snapshot).includes('synthetic-private-value'));
  assert.ok(!JSON.stringify(snapshot).includes('other-private-owner'));
});
