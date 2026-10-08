import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { freshOwnerReadFence } from './fresh-owner-read.mjs';

const url = 'https://app.lythaus.co/settings/security?tab=profile';
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function harness(options = {}) {
  const page = new EventEmitter(), frame = { url: () => url };
  page.mainFrame = () => frame;
  const request = (changes = {}) => ({ frame: () => frame, method: () => 'GET',
    isNavigationRequest: () => false, url: () => 'https://api.lythaus.co/api/users/me',
    timing: () => ({ startTime: 200 }), ...changes });
  const document = request({ isNavigationRequest: () => true, url: () => url, timing: () => ({ startTime: 100 }) });
  let semanticCalls = 0;
  const fence = freshOwnerReadFence(page, { navigationUrl: url, ownerId: 'synthetic-owner', timeoutMs: 1000,
    semanticReady: async () => { semanticCalls++; await options.semantic?.(); }, ...options });
  const navigate = () => { page.emit('request', document); page.emit('framenavigated', frame); };
  const response = (req, changes = {}) => ({ request: () => req, status: () => 200,
    finished: async () => null, json: async () => ({ user: { id: 'synthetic-owner' } }), ...changes });
  return { page, frame, request, document, fence, navigate, response, semanticCalls: () => semanticCalls };
}

test('fresh owner fence: headers cannot release Back; delayed complete body and semantic readiness are required', async t => {
  const body = deferred(), semantic = deferred();
  const h = harness({ semantic: () => semantic.promise }); t.after(() => h.fence.dispose());
  h.navigate(); const req = h.request(); h.page.emit('request', req);
  const reply = h.response(req, { finished: () => body.promise }); h.page.emit('response', reply);
  let ready = false; const done = h.fence.ready().then(value => { ready = true; return value; });
  await turn(); assert.equal(ready, false); assert.equal(h.semanticCalls(), 0);
  body.resolve(null); await turn(); assert.equal(ready, false); assert.equal(h.semanticCalls(), 1);
  semantic.resolve(); assert.equal((await done).response, reply); assert.equal(ready, true);
});

test('fresh owner fence: old response after new document commit cannot satisfy a fresh request', async t => {
  const h = harness(); t.after(() => h.fence.dispose());
  const old = h.request({ timing: () => ({ startTime: 50 }) }); h.page.emit('request', old);
  h.navigate(); h.page.emit('response', h.response(old));
  const fresh = h.request(); h.page.emit('request', fresh); const reply = h.response(fresh); h.page.emit('response', reply);
  assert.equal((await h.fence.ready()).response, reply);
});

for (const [name, changed] of [
  ['other page', { frame: () => ({}) }], ['unrelated endpoint', { url: () => 'https://api.lythaus.co/api/feed/discover' }],
  ['wrong origin', { url: () => 'https://unrelated.invalid/api/users/me' }], ['mutating method', { method: () => 'PATCH' }],
]) test(`fresh owner fence: ${name} cannot release readiness`, async t => {
  const h = harness(); t.after(() => h.fence.dispose()); h.navigate();
  const other = h.request(changed); h.page.emit('request', other); h.page.emit('response', h.response(other));
  await turn(); assert.equal(h.semanticCalls(), 0);
  const fresh = h.request(); h.page.emit('request', fresh); const reply = h.response(fresh); h.page.emit('response', reply);
  assert.equal((await h.fence.ready()).response, reply);
});

for (const [name, requestChanges, responseChanges, expected] of [
  ['HTTP rejection', {}, { status: () => 503 }, /status 503/],
  ['aborted body', {}, { finished: async () => new Error('synthetic abort') }, /body did not finish/],
  ['stale request delivered late', { timing: () => ({ startTime: 50 }) }, {}, /stale document/],
  ['unavailable timing', { timing: () => ({ startTime: 0 }) }, {}, /timing evidence is unavailable/],
  ['different owner body', {}, { json: async () => ({ user: { id: 'another-private-owner' } }) }, /does not match/],
  ['invalid JSON', {}, { json: async () => { throw new Error('synthetic private body'); } }, /could not complete/],
]) test(`fresh owner fence: ${name} rejects before semantic readiness`, async t => {
  const h = harness(); t.after(() => h.fence.dispose()); h.navigate();
  const req = h.request(requestChanges); h.page.emit('request', req); h.page.emit('response', h.response(req, responseChanges));
  await assert.rejects(h.fence.ready(), expected); assert.equal(h.semanticCalls(), 0);
});

test('fresh owner fence: request cancellation rejects even before response headers', async t => {
  const h = harness(); t.after(() => h.fence.dispose()); h.navigate();
  const req = h.request(); h.page.emit('request', req); h.page.emit('requestfailed', req);
  await assert.rejects(h.fence.ready(), /was aborted/);
});

for (const [name, changes] of [
  ['another document URL', { url: () => 'https://app.lythaus.co/' }],
  ['non-GET navigation', { method: () => 'POST' }],
]) test(`fresh owner fence: ${name} rejects the security reload`, async t => {
  const h = harness(); t.after(() => h.fence.dispose());
  h.page.emit('request', h.request({ isNavigationRequest: () => true, ...changes }));
  await assert.rejects(h.fence.ready(), /unexpected document/);
});

test('fresh owner fence: unexpected committed document rejects readiness', async t => {
  const h = harness(); t.after(() => h.fence.dispose());
  h.page.emit('request', h.document); h.frame.url = () => 'https://app.lythaus.co/'; h.page.emit('framenavigated', h.frame);
  await assert.rejects(h.fence.ready(), /did not commit/);
});

test('fresh owner fence: aborted security document rejects readiness', async t => {
  const h = harness(); t.after(() => h.fence.dispose());
  h.page.emit('request', h.document); h.page.emit('requestfailed', h.document);
  await assert.rejects(h.fence.ready(), /document reload was aborted/);
});

test('fresh owner fence: another document makes a pending body stale and cannot run readiness', async t => {
  const body = deferred(), h = harness(); t.after(() => h.fence.dispose()); h.navigate();
  const req = h.request(); h.page.emit('request', req); h.page.emit('response', h.response(req, { finished: () => body.promise }));
  h.page.emit('request', h.document); await assert.rejects(h.fence.ready(), /became stale/);
  body.resolve(null); await turn(); assert.equal(h.semanticCalls(), 0);
});

test('fresh owner fence: semantic failure rejects and detaches listeners', async t => {
  const h = harness({ semantic: async () => { throw new Error('synthetic unready'); } }); t.after(() => h.fence.dispose()); h.navigate();
  const req = h.request(); h.page.emit('request', req); h.page.emit('response', h.response(req));
  await assert.rejects(h.fence.ready(), /could not complete/);
  for (const name of ['request', 'response', 'requestfailed', 'framenavigated', 'close']) assert.equal(h.page.listenerCount(name), 0);
});

test('fresh owner fence: another document during semantic readiness cannot release Back', async t => {
  const semantic = deferred(), h = harness({ semantic: () => semantic.promise }); t.after(() => h.fence.dispose()); h.navigate();
  const req = h.request(); h.page.emit('request', req); h.page.emit('response', h.response(req));
  await turn(); assert.equal(h.semanticCalls(), 1);
  h.page.emit('request', h.document); await assert.rejects(h.fence.ready(), /became stale/);
  semantic.resolve(); await turn(); assert.equal(h.page.listenerCount('request'), 0);
});

test('fresh owner fence: closing the page rejects a pending owner response', async t => {
  const body = deferred(), h = harness(); t.after(() => h.fence.dispose()); h.navigate();
  const req = h.request(); h.page.emit('request', req); h.page.emit('response', h.response(req, { finished: () => body.promise }));
  h.page.emit('close'); await assert.rejects(h.fence.ready(), /Page closed/);
  body.resolve(null); await turn(); assert.equal(h.semanticCalls(), 0);
});

test('fresh owner fence: missing read times out instead of treating headers or navigation as success', async () => {
  const h = harness({ timeoutMs: 5 }); h.navigate();
  await assert.rejects(h.fence.ready(), /timed out/);
  assert.equal(h.semanticCalls(), 0); assert.equal(h.page.listenerCount('request'), 0);
});
