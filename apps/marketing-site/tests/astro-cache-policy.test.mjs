import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { loadRemoteImage, revalidateRemoteImage } from '../node_modules/astro/dist/assets/build/remote.js';

const require = createRequire(new URL('../node_modules/astro/package.json', import.meta.url));
const CachePolicy = require('http-cache-semantics');
const url = 'https://images.example/image.png';
const now = Date.parse('2026-10-03T13:00:00Z');
const date = new Date(now).toUTCString();
const imageConfig = { domains: ['images.example'], remotePatterns: [] };
const request = (headers = {}) => ({ url, method: 'GET', headers });
const response = (headers = {}, status = 200) => ({ status, headers: { date, ...headers } });

function freezeTime(t) {
  t.mock.method(Date, 'now', () => now);
}

test('remote-image policy honors explicit freshness, shared precedence, Age and elapsed time', t => {
  freezeTime(t);
  for (const [headers, ttl] of [
    [{ 'cache-control': 'public, max-age=60' }, 60_000],
    [{ 'cache-control': 'max-age=60, s-maxage=30', age: '10' }, 20_000],
    [{ 'cache-control': 'max-age="60"', age: '60' }, 0],
    [{ 'cache-control': 'max-age=0', expires: new Date(now + 120_000).toUTCString() }, 0],
    [{ expires: new Date(now + 90_000).toUTCString() }, 90_000],
    [{ expires: 'invalid' }, 0],
    [{ 'last-modified': new Date(now - 100_000).toUTCString() }, 10_000],
    [{ 'cache-control': 'immutable' }, 86_400_000],
    [{}, 0],
  ]) {
    const policy = new CachePolicy(request(), response(headers));
    assert.equal(policy.timeToLive(), ttl, JSON.stringify(headers));
  }
  const policy = new CachePolicy(request(), response({ 'cache-control': 'max-age=60' }));
  Date.now.mock.mockImplementation(() => now + 20_000);
  assert.equal(policy.timeToLive(), 40_000);
  Date.now.mock.mockImplementation(() => now + 70_000);
  assert.equal(policy.timeToLive(), 0);
});

test('security denials cannot gain lifetime from stale extensions or client max-stale', t => {
  freezeTime(t);
  for (const headers of [
    { 'cache-control': 'no-cache, stale-while-revalidate=600, stale-if-error=600' },
    { 'cache-control': 'no-store, stale-while-revalidate=600' },
    { 'cache-control': 'private, max-age=600, stale-if-error=600' },
    { 'cache-control': 'max-age=600, stale-while-revalidate=600', 'set-cookie': 'session=owner-a' },
    { 'cache-control': 'immutable, stale-if-error=600', 'set-cookie': 'session=owner-a' },
    { 'cache-control': 'proxy-revalidate, max-age=600, stale-if-error=600' },
    { 'cache-control': 'max-age=600, stale-while-revalidate=600', vary: '*' },
    { pragma: 'no-cache', 'stale-if-error': '600' },
  ]) {
    for (const reqHeaders of [{}, { 'cache-control': 'max-stale=999999' }]) {
      const policy = new CachePolicy(request(reqHeaders), response(headers));
      assert.equal(policy.timeToLive(), 0, JSON.stringify(headers));
    }
  }
  assert.equal(new CachePolicy(request({ authorization: 'Bearer owner-a' }), response({ 'cache-control': 'max-age=60' })).timeToLive(), 0);
  assert.equal(new CachePolicy(request({ 'cache-control': 'no-store' }), response({ 'cache-control': 'public, max-age=60' })).timeToLive(), 0);
});

test('freshness does not treat stale retention as permission for unconditional image reuse', t => {
  freezeTime(t);
  for (const suffix of ['stale-if-error=600', 'stale-while-revalidate=600', 'must-revalidate, stale-if-error=600']) {
    const policy = new CachePolicy(request(), response({ 'cache-control': `public, max-age=60, ${suffix}` }));
    assert.equal(policy.timeToLive(), 60_000);
    Date.now.mock.mockImplementation(() => now + 61_000);
    assert.equal(policy.timeToLive(), 0);
    Date.now.mock.mockImplementation(() => now);
  }
});

test('malformed, duplicate and negative freshness cannot prolong the image cache', t => {
  freezeTime(t);
  for (const control of ['max-age=-1', 'max-age=60junk', 'max-age=Infinity', 'max-age=60, max-age=120', 'max-age=60, MAX-AGE=120', 'max-age="60']) {
    assert.equal(new CachePolicy(request(), response({ 'cache-control': control })).timeToLive(), 0, control);
  }
  assert.equal(new CachePolicy(request(), response({ 'Cache-Control': 'NO-CACHE, max-age=60' })).timeToLive(), 0);
  assert.equal(new CachePolicy(request(), response({ 'cache-control': 'max-age=60', age: '-1' })).timeToLive(), 0);
  assert.equal(new CachePolicy(request(), response({ 'cache-control': 'max-age=60' }, 206)).timeToLive(), 0);
});

test('actual Astro loader preserves image bytes and validators and rejects restricted TTL', async t => {
  freezeTime(t);
  for (const [headers, ttl] of [
    [{ 'cache-control': 'public, max-age=60', etag: '"v1"', 'last-modified': date }, 60_000],
    [{ 'cache-control': 'no-cache, stale-while-revalidate=600' }, 0],
    [{ 'cache-control': 'max-age=600, stale-if-error=600', 'set-cookie': 'session=owner-a' }, 0],
  ]) {
    const loaded = await loadRemoteImage(url, async req => {
      assert.equal(req.url, url);
      return new Response(new Uint8Array([0, 1, 254, 255]), { headers: { date, ...headers } });
    }, imageConfig);
    assert.deepEqual([...loaded.data], [0, 1, 254, 255]);
    assert.equal(loaded.expires, now + ttl);
    assert.equal(loaded.etag, headers.etag);
    assert.equal(loaded.lastModified, headers['last-modified']);
  }
});

test('actual Astro 304 revalidation retains prior validators and safely computes new freshness', async t => {
  freezeTime(t);
  for (const [control, ttl] of [['public, max-age=30', 30_000], ['no-cache, stale-if-error=600', 0]]) {
    const loaded = await revalidateRemoteImage(url, { etag: '"v1"', lastModified: date }, async req => {
      assert.equal(req.headers.get('if-none-match'), '"v1"');
      assert.equal(req.headers.get('if-modified-since'), date);
      return new Response(null, { status: 304, headers: { date, 'cache-control': control } });
    }, imageConfig);
    assert.equal(loaded.data, null);
    assert.equal(loaded.expires, now + ttl);
    assert.equal(loaded.etag, '"v1"');
    assert.equal(loaded.lastModified, date);
  }
});

test('actual Astro replacement response, empty-body retry and error/redirect boundaries survive', async t => {
  freezeTime(t);
  let calls = 0;
  const loaded = await revalidateRemoteImage(url, { etag: '"old"' }, async () => {
    calls++;
    return new Response(calls === 1 ? null : 'replacement', { headers: { date, 'cache-control': 'max-age=30', etag: '"new"' } });
  }, imageConfig);
  assert.equal(calls, 2);
  assert.equal(loaded.data.toString(), 'replacement');
  assert.equal(loaded.etag, '"new"');
  assert.equal(loaded.expires, now + 30_000);
  await assert.rejects(loadRemoteImage(url, async () => new Response(null, { status: 500 }), imageConfig), /received 500/);
  await assert.rejects(revalidateRemoteImage(url, {}, async () => new Response(null, { status: 500 }), imageConfig), /received 500/);
  await assert.rejects(loadRemoteImage(url, async () => new Response(null, { status: 302, headers: { location: 'https://blocked.example/image.png' } }), imageConfig), /not an allowed remote location/);
});

test('actual Astro load and 304 deny valued cache restrictions and invalid public opt-in', async t => {
  freezeTime(t);
  for (const headers of [
    ...['no-cache', 'no-store', 'private', 'proxy-revalidate'].map(name => ({ 'cache-control': `${name}="", max-age=60` })),
    ...['public=false', 'public=0', 'public=""'].map(value => ({ 'cache-control': `${value}, max-age=60`, 'set-cookie': 'session=owner-a' })),
    { 'cache-control': 'public, private="", max-age=60' },
    { 'cache-control': 'public, no-cache="etag", max-age=60' },
  ]) {
    const loaded = await loadRemoteImage(url, async () => new Response('image', { headers: { date, ...headers } }), imageConfig);
    assert.equal(loaded.expires, now, JSON.stringify(headers));
    const revalidated = await revalidateRemoteImage(url, { etag: '"v1"' }, async () => new Response(null, { status: 304, headers: { date, ...headers } }), imageConfig);
    assert.equal(revalidated.expires, now, JSON.stringify(headers));
  }
});

test('actual Astro load and 304 subtract apparent response age without extending freshness', async t => {
  freezeTime(t);
  for (const [headers, ttl] of [
    [{ date: new Date(now - 86_400_000).toUTCString(), 'cache-control': 'max-age=60' }, 0],
    [{ date: new Date(now - 86_400_000).toUTCString(), expires: new Date(now - 86_340_000).toUTCString() }, 0],
    [{ date: new Date(now - 20_000).toUTCString(), 'cache-control': 'max-age=60', age: '10' }, 40_000],
    [{ date: new Date(now - 10_000).toUTCString(), 'cache-control': 'max-age=60', age: '20' }, 40_000],
    [{ date: new Date(now + 20_000).toUTCString(), 'cache-control': 'max-age=60' }, 60_000],
  ]) {
    const loaded = await loadRemoteImage(url, async () => new Response('image', { headers }), imageConfig);
    assert.equal(loaded.expires, now + ttl, JSON.stringify(headers));
    const revalidated = await revalidateRemoteImage(url, {}, async () => new Response(null, { status: 304, headers }), imageConfig);
    assert.equal(revalidated.expires, now + ttl, JSON.stringify(headers));
  }
});
