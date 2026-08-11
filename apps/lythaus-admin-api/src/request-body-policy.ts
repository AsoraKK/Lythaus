const DEFAULT_MAX_JSON_BYTES = 16 * 1024;

async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(parsedLength) || parsedLength > maxBytes) {
      throw new Error('request_too_large');
    }
  }

  if (!request.body) throw new Error('invalid_json');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel('request_too_large').catch(() => undefined);
        throw new Error('request_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readBoundedJson<T>(request: Request, maxBytes = DEFAULT_MAX_JSON_BYTES): Promise<T> {
  const bytes = await readBoundedBody(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new Error('invalid_json');
  }
}
