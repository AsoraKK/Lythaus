export interface JsonBodyRequest {
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // The bounded read has already failed; cancellation is best-effort only.
  }
}

export async function readBoundedJson<T>(request: JsonBodyRequest, maxBytes: number): Promise<T> {
  const declaredLength = request.headers.get('content-length');
  const length = declaredLength ? Number(declaredLength) : undefined;
  if (Number.isFinite(length) && (length as number) > maxBytes) {
    await request.body?.cancel().catch(() => undefined);
    throw new Error('request_too_large');
  }

  if (!request.body) throw new Error('invalid_json');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await cancelReader(reader);
        throw new Error('request_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new Error('invalid_json');
  }
}
