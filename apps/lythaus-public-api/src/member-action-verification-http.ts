import type { Principal } from '@lythaus/security';
import { knownSensitiveOperation, type SensitiveOperation } from '../../../packages/security/src/member-action-verification.ts';
import { readBoundedJson } from './request-body-runtime.ts';
import { optionalRefreshCookie, sessionTransport } from './auth-session-transport.ts';

export function recentVerificationRefreshCredential(request: Request, origins: string | undefined, enabled: boolean): string | undefined {
  if (!enabled) return undefined;
  const transport = sessionTransport(request, origins);
  const cookie = optionalRefreshCookie(request);
  const native = request.headers.get('x-lythaus-session-binding');
  if (cookie && native && cookie !== native) throw new Error('recent_authentication_required');
  if (transport === 'cookie' && !cookie) throw new Error('recent_authentication_unavailable');
  const credential = cookie ?? native;
  if (!credential || !/^[A-Za-z0-9_-]{32,256}$/.test(credential)) throw new Error('recent_authentication_unavailable');
  return credential;
}

export interface AccountActionReceipt {
  proof: string; verifiedAt: string; expiresAt: string; action: SensitiveOperation['action'];
}

async function operationBodyBytes(request: Request): Promise<Uint8Array> {
  const cancelOriginal = () => { void request.body?.cancel().catch(() => undefined); };
  if (Number(request.headers.get('content-length')) > 8192) {
    cancelOriginal(); throw new Error('request_too_large');
  }
  const reader = request.clone().body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        void reader.cancel().catch(() => undefined);
        cancelOriginal(); throw new Error('request_too_large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readSensitiveOperation(request: Request, enabled: boolean): Promise<SensitiveOperation | undefined> {
  if (!enabled) return undefined;
  const url = new URL(request.url);
  const bytes = await operationBodyBytes(request);
  let body: string;
  try { body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error('invalid_json'); }
  return knownSensitiveOperation(request.method, url.pathname + url.search, body);
}

export async function verifyAccountActionRequest(request: Request, enabled: boolean, dependencies: {
  authenticate(request: Request): Promise<Principal>;
  limitUser(userId: string): Promise<void>;
  issue(input: { user: Principal; operation: SensitiveOperation; password: unknown }): Promise<AccountActionReceipt>;
  recordMaintenance?(proofId: string, userId: string): Promise<{ state: string; reason?: string }>;
}) {
  if (!enabled) throw new Error('recent_authentication_unavailable');
  const user = await dependencies.authenticate(request);
  await dependencies.limitUser(user.userId);
  const input = await readBoundedJson<{ password?: unknown; operation?: { method?: unknown; path?: unknown; body?: unknown } }>(request, 16 * 1024);
  const descriptor = input?.operation;
  if (typeof descriptor?.method !== 'string' || typeof descriptor.path !== 'string' || typeof descriptor.body !== 'string') {
    throw new Error('recent_authentication_operation_unavailable');
  }
  const operation = knownSensitiveOperation(descriptor.method, descriptor.path, descriptor.body);
  if (!operation) throw new Error('recent_authentication_operation_unavailable');
  const result = await dependencies.issue({ user, operation, password: input.password });
  let maintenanceEvidence: { state: string; reason?: string } = { state: 'inactive', reason: 'collection_disabled' };
  if (dependencies.recordMaintenance) {
    try { maintenanceEvidence = await dependencies.recordMaintenance(result.proof.split('.')[0], user.userId); }
    catch { maintenanceEvidence = { state: 'unavailable', reason: 'monthly_evidence_not_confirmed' }; }
  }
  return { ...result, maintenanceEvidence };
}
