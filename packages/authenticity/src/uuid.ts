/** RFC 9562 UUID version 7 helpers used by every foundation record. */
export type UUIDv7 = string & { readonly __uuidv7: unique symbol };

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV7(value: unknown): value is UUIDv7 {
  return typeof value === 'string' && UUID_V7_PATTERN.test(value);
}

export function assertUuidV7(value: unknown, field = 'id'): asserts value is UUIDv7 {
  if (!isUuidV7(value)) throw new Error(`${field}_must_be_uuid_v7`);
}

export function uuidv7(now = Date.now()): UUIDv7 {
  if (!Number.isFinite(now) || now < 0) throw new Error('uuidv7_timestamp_invalid');
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const timestamp = BigInt(Math.floor(now)) & 0xffffffffffffn;
  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Number(timestamp >> BigInt((5 - index) * 8)) & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as UUIDv7;
}
