import { checkTransactionHealth, type DatabaseClient } from '@lythaus/db';

export async function storePrivateExportObject(
  client: DatabaseClient,
  bucket: { put(key: string, bytes: Uint8Array, options?: Record<string, unknown>): Promise<unknown> },
  objectKey: string,
  bytes: Uint8Array,
): Promise<void> {
  await checkTransactionHealth(client);
  await bucket.put(objectKey, bytes, { httpMetadata: { contentType: 'application/json' } });
}
