import assert from 'node:assert/strict';
import test from 'node:test';

import { readBoundedJson } from '../src/request-body-runtime.ts';

test('rejects null, arrays, scalars and malformed UTF-8 before domain handlers', async () => {
  for (const body of ['null', '[]', 'true', '12', '"text"', new Uint8Array([123,34,120,34,58,34,255,34,125])]) {
    await assert.rejects(readBoundedJson(new Request('https://fixture.invalid', {method:'POST',body}), 64), /invalid_json/);
  }
});

const encoder = new TextEncoder();

function requestFromChunks(chunks, contentLength) {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
    cancel() { cancelled = true; },
  });
  return {
    request: { headers: new Headers(contentLength === undefined ? {} : { 'content-length': String(contentLength) }), body },
    wasCancelled: () => cancelled,
  };
}

test('reads an exact-limit JSON body without relying on Content-Length', async () => {
  const payload = '{"ok":1}';
  const source = requestFromChunks(['{"ok"', ':1}']);
  assert.equal(encoder.encode(payload).byteLength, 8);
  assert.deepEqual(await readBoundedJson(source.request, 8), { ok: 1 });
  assert.equal(source.wasCancelled(), false);
});

test('rejects a lengthless oversized streaming body and cancels the reader', async () => {
  const source = requestFromChunks(['{"value":"', '1234567890', '"}']);
  await assert.rejects(() => readBoundedJson(source.request, 12), /request_too_large/);
  assert.equal(source.wasCancelled(), true);
});

test('does not trust a misleading undersized Content-Length', async () => {
  const source = requestFromChunks(['{"value":"1234567890"}'], 1);
  await assert.rejects(() => readBoundedJson(source.request, 12), /request_too_large/);
});

test('rejects a declared oversized body before buffering and handles invalid JSON', async () => {
  const oversized = requestFromChunks(['{}'], 100);
  await assert.rejects(() => readBoundedJson(oversized.request, 2), /request_too_large/);
  assert.equal(oversized.wasCancelled(), true);
  const malformed = requestFromChunks(['{not-json}']);
  await assert.rejects(() => readBoundedJson(malformed.request, 32), /invalid_json/);
});
