import { requirePasswordInput } from '../../contracts/src/password-policy.ts';

export const RECENT_ACCOUNT_AUTH_SECONDS = 300;
export const APPROVED_SENSITIVE_ACTIONS = ['reward_claim', 'security_change', 'email_change', 'account_delete'] as const;
export type SensitiveAccountAction = typeof APPROVED_SENSITIVE_ACTIONS[number];

export interface AccountVerificationSession {
  userId: string;
  tokenVersion: number;
  sessionFamilyId?: string;
}

export interface SensitiveOperation {
  action: SensitiveAccountAction;
  method: string;
  path: string;
  body: string;
}

export function recentAccountPolicyEnabled(value?: string): boolean { return value === 'true'; }

export function knownSensitiveOperation(method: string, path: string, body: string): SensitiveOperation | undefined {
  if (method !== 'POST' || path.length > 256 || body.length > 8192) return undefined;
  if (!path.startsWith('/api/')) return undefined;
  const pathname = path.split('?')[0];
  if (/^\/api\/rewards\/[a-zA-Z0-9_-]{1,128}\/redeem$/.test(pathname)) {
    return { action: 'reward_claim', method, path, body };
  }
  if (pathname === '/api/privacy/requests') {
    let input: unknown;
    try { input = JSON.parse(body); } catch { return undefined; }
    if (input && typeof input === 'object' && !Array.isArray(input)
      && (input as Record<string, unknown>).requestType === 'delete') {
      return { action: 'account_delete', method, path, body };
    }
  }
  return undefined;
}

export async function sensitiveOperationDigest(operation: SensitiveOperation, bindingKey: string): Promise<string> {
  if (!APPROVED_SENSITIVE_ACTIONS.includes(operation.action) || operation.body.length > 8192
    || !operation.path.startsWith('/api/') || operation.path.length > 256) throw new Error('recent_authentication_operation_unavailable');
  if (!bindingKey) throw new Error('recent_authentication_unavailable');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(bindingKey),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(
    JSON.stringify(['lythaus-account-action-v1', operation.action, operation.method, operation.path, operation.body]),
  ));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

export interface RecentAccountProof {
  id: string;
  userId: string;
  sessionFamilyId: string;
  tokenVersion: number;
  action: SensitiveAccountAction;
  operationHash: string;
  secretHash: string;
  credentialId: string;
  verifiedAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export function requireVerificationSession(session: AccountVerificationSession): asserts session is AccountVerificationSession & { sessionFamilyId: string } {
  if (!session.userId || !session.sessionFamilyId || !Number.isSafeInteger(session.tokenVersion)
    || session.tokenVersion < 1) throw new Error('recent_authentication_unavailable');
}

export function parseAccountProof(value: string | null): { id: string; secret: string } {
  const match = value?.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$/);
  if (!match) throw new Error('recent_authentication_required');
  return { id: match[1], secret: match[2] };
}

export function proofMatches(input: {
  proof: RecentAccountProof; session: AccountVerificationSession; action: SensitiveAccountAction;
  operationHash: string; secretHash: string; now: number;
}): boolean {
  const p = input.proof, from = Date.parse(p.verifiedAt), until = Date.parse(p.expiresAt);
  const left = new TextEncoder().encode(p.secretHash), right = new TextEncoder().encode(input.secretHash);
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return difference === 0 && p.userId === input.session.userId && p.credentialId === input.session.userId
    && p.sessionFamilyId === input.session.sessionFamilyId
    && p.tokenVersion === input.session.tokenVersion && p.action === input.action && p.operationHash === input.operationHash
    && p.consumedAt === null && Number.isFinite(input.now) && Number.isFinite(from)
    && until - from === RECENT_ACCOUNT_AUTH_SECONDS * 1000 && input.now >= from && input.now < until;
}

export async function issueRecentAccountProof<Hash>(dependencies: {
  loadCredential(): Promise<{ credentialId: string; passwordHash: Hash } | undefined>;
  verifyPassword(password: string, hash: Hash | undefined): boolean;
  randomSecret(): string;
  newId(): string;
  hashSecret(secret: string): string;
  hashOperation(operation: SensitiveOperation): Promise<string>;
  persist(input: { id: string; secretHash: string; operationHash: string; action: SensitiveAccountAction; credentialId: string }): Promise<{ verifiedAt: string; expiresAt: string }>;
}, input: { enabled: boolean; session: AccountVerificationSession; operation: SensitiveOperation; password: unknown }) {
  if (!input.enabled) throw new Error('recent_authentication_unavailable');
  requireVerificationSession(input.session);
  const password = requirePasswordInput(input.password, 'login');
  const operationHash = await dependencies.hashOperation(input.operation);
  const credential = await dependencies.loadCredential();
  const matches = dependencies.verifyPassword(password, credential?.passwordHash);
  if (!credential) throw new Error('recent_authentication_unavailable');
  if (!matches) throw new Error('recent_authentication_failed');
  const id = dependencies.newId(), secret = dependencies.randomSecret();
  const token = `${id}.${secret}`;
  parseAccountProof(token);
  const times = await dependencies.persist({ id, secretHash: dependencies.hashSecret(secret), operationHash,
    action: input.operation.action, credentialId: credential.credentialId });
  if (Date.parse(times.expiresAt) - Date.parse(times.verifiedAt) !== RECENT_ACCOUNT_AUTH_SECONDS * 1000) {
    throw new Error('recent_authentication_unavailable');
  }
  return { proof: token, ...times, action: input.operation.action };
}
