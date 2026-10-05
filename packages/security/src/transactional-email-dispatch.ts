export const TRANSACTIONAL_EMAIL_DISPATCH_TYPE = 'lythaus.transactional-email.dispatch.v1';

export interface TransactionalEmailDispatchMessage {
  type: typeof TRANSACTIONAL_EMAIL_DISPATCH_TYPE;
  outboxId: string;
  signature: string;
}

async function dispatchKey(secret: string): Promise<CryptoKey> {
  const bytes = Buffer.from(secret, 'base64');
  if (bytes.length !== 32) throw new Error('email_dispatch_key_unavailable');
  const master = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({
    name: 'HKDF', hash: 'SHA-256',
    salt: new TextEncoder().encode('lythaus:transactional-email:dispatch:v1'),
    info: new TextEncoder().encode('queue-hint-authentication'),
  }, master, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']);
}

function signingInput(outboxId: string): Uint8Array {
  return new TextEncoder().encode(`${TRANSACTIONAL_EMAIL_DISPATCH_TYPE}:${outboxId}`);
}

export function parseTransactionalEmailDispatchMessage(body: unknown): TransactionalEmailDispatchMessage | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const value = body as Record<string, unknown>;
  if (value.type !== TRANSACTIONAL_EMAIL_DISPATCH_TYPE || Object.keys(value).length !== 3
    || Object.keys(value).some(key => !['type', 'outboxId', 'signature'].includes(key))
    || typeof value.outboxId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.outboxId)
    || typeof value.signature !== 'string' || !/^[0-9a-f]{64}$/u.test(value.signature)) return undefined;
  return value as unknown as TransactionalEmailDispatchMessage;
}

export async function createTransactionalEmailDispatchMessage(outboxId: string, secret: string): Promise<TransactionalEmailDispatchMessage> {
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', await dispatchKey(secret), signingInput(outboxId))).toString('hex');
  const message: TransactionalEmailDispatchMessage = { type: TRANSACTIONAL_EMAIL_DISPATCH_TYPE, outboxId, signature };
  if (!parseTransactionalEmailDispatchMessage(message)) throw new Error('email_dispatch_intent_invalid');
  return message;
}

export async function verifyTransactionalEmailDispatchMessage(body: unknown, secret: string): Promise<TransactionalEmailDispatchMessage | undefined> {
  const message = parseTransactionalEmailDispatchMessage(body);
  if (!message || !secret) return undefined;
  try {
    return await crypto.subtle.verify('HMAC', await dispatchKey(secret), Buffer.from(message.signature, 'hex'), signingInput(message.outboxId))
      ? message : undefined;
  } catch { return undefined; }
}
