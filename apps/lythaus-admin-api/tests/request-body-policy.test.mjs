import assert from 'node:assert/strict';
import test from 'node:test';

import { readBoundedJson } from '../src/request-body-policy.ts';

function streamingRequest(chunks, headers = {}) {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk === undefined) controller.close();
      else controller.enqueue(new TextEncoder().encode(chunk));
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    request: new Request('https://admin-api.lythaus.co/test', {
      method: 'POST', body, headers, duplex: 'half',
    }),
    wasCancelled: () => cancelled,
  };
}

test('parses bounded chunked JSON without trusting Content-Length', async () => {
  const { request } = streamingRequest(['{"decision":', '"uphold"}']);
  assert.deepEqual(await readBoundedJson(request, 32), { decision: 'uphold' });
});

test('rejects declared, chunked, and understated oversized bodies', async () => {
  await assert.rejects(
    readBoundedJson(new Request('https://admin-api.lythaus.co/test', {
      method: 'POST', body: '{}', headers: { 'content-length': '33' },
    }), 32),
    /request_too_large/,
  );

  const chunked = streamingRequest(['{"value":"', 'x'.repeat(64), '"}']);
  await assert.rejects(readBoundedJson(chunked.request, 32), /request_too_large/);
  assert.equal(chunked.wasCancelled(), true);

  const understated = streamingRequest(['{"value":"', 'x'.repeat(64), '"}'], { 'content-length': '1' });
  await assert.rejects(readBoundedJson(understated.request, 32), /request_too_large/);
  assert.equal(understated.wasCancelled(), true);
});

test('rejects malformed or empty JSON deterministically', async () => {
  await assert.rejects(
    readBoundedJson(new Request('https://admin-api.lythaus.co/test', { method: 'POST', body: '{' })),
    /invalid_json/,
  );
  await assert.rejects(
    readBoundedJson(new Request('https://admin-api.lythaus.co/test', { method: 'POST' })),
    /invalid_json/,
  );
});

test('rejects non-object JSON before admin handlers consume it', async () => {
  for (const body of ['null', '[]', '[{}]', 'true', 'false', '0', '"synthetic"']) {
    await assert.rejects(
      readBoundedJson(new Request('https://admin-api.lythaus.co/test', { method: 'POST', body })),
      /invalid_json/,
      body,
    );
  }
  assert.deepEqual(await readBoundedJson(new Request('https://admin-api.lythaus.co/test', {
    method: 'POST', body: '{}',
  })), {});
});

test('rejects invalid UTF-8 instead of changing admin input during decoding', async () => {
  const encoder = new TextEncoder();
  for (const invalid of [Uint8Array.of(0xff), Uint8Array.of(0xc3), Uint8Array.of(0xc0, 0xaf)]) {
    const body = new Uint8Array([
      ...encoder.encode('{"reason":"'), ...invalid, ...encoder.encode('"}'),
    ]);
    await assert.rejects(
      readBoundedJson(new Request('https://admin-api.lythaus.co/test', { method: 'POST', body })),
      /invalid_json/,
    );
  }
  const bytes = encoder.encode('{"reason":"Café 東京"}');
  const body = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  assert.deepEqual(await readBoundedJson({ headers: new Headers(), body }), { reason: 'Café 東京' });
});
