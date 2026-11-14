export const REBIND_POLICY_SETTING = 'lythaus.admin_subject_rebind_approval';
export const REBIND_MAX_WINDOW_SECONDS = 15 * 60;

export interface RebindIntent {
  schemaVersion: 'lythaus-admin-subject-rebind-v2';
  mode: 'preview' | 'execute';
  origin: string;
  accessIssuer: string;
  accessAudience: string;
  notBefore: number;
  expiresAt: number;
  sourceSha: string;
  workerVersionId: string;
  emailSha256: string;
  commitmentSha256: string | null;
  nonceHex: string | null;
  reference: string;
  databaseTarget: { branchId: string; databaseName: string; originFingerprint: string; roleFingerprint: string };
}

export interface RebindBindingProof {
  schemaVersion: 'lythaus-admin-rebind-binding-v1';
  worker: 'lythaus-admin-api-development';
  binding: 'DB_ADMIN_FRESH';
  hyperdriveId: '6bfbb0eab42642e8ad294dbf59294ed3';
  sourceSha: string;
  workerVersionId: string;
  releaseRunId: string;
  branchId: 'vqa2g2xc9wsl';
  databaseName: 'postgres';
  originFingerprint: string;
  roleFingerprint: string;
  checkedAt: number;
  expiresAt: number;
}
export interface RebindPolicy extends RebindIntent { bindingProof: RebindBindingProof; }

const hex = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const keys = (value: object) => Object.keys(value).sort().join(',');
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

// An approval intent cannot arm the Worker. Only the protected handoff can add
// the observed provider binding proof and install the resulting policy.
export function parseRebindIntent(value: unknown): RebindIntent | null {
  try {
    const policy = typeof value === 'string' ? JSON.parse(value) : value;
    if (!record(policy)
      || keys(policy) !== 'accessAudience,accessIssuer,commitmentSha256,databaseTarget,emailSha256,expiresAt,mode,nonceHex,notBefore,origin,reference,schemaVersion,sourceSha,workerVersionId'
      || policy.schemaVersion !== 'lythaus-admin-subject-rebind-v2'
      || !['preview', 'execute'].includes(policy.mode as string)
      || policy.origin !== 'https://admin.lythaus.co'
      || typeof policy.accessIssuer !== 'string' || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(policy.accessIssuer)
      || typeof policy.accessAudience !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(policy.accessAudience)
      || !Number.isSafeInteger(policy.notBefore) || !Number.isSafeInteger(policy.expiresAt)
      || (policy.notBefore as number) < 0 || (policy.expiresAt as number) > 4102444800
      || (policy.expiresAt as number) <= (policy.notBefore as number)
      || (policy.expiresAt as number) - (policy.notBefore as number) > REBIND_MAX_WINDOW_SECONDS
      || typeof policy.sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(policy.sourceSha)
      || typeof policy.workerVersionId !== 'string' || !uuid.test(policy.workerVersionId)
      || typeof policy.emailSha256 !== 'string' || !hex.test(policy.emailSha256)
      || (policy.mode === 'preview' ? policy.commitmentSha256 !== null || policy.nonceHex !== null
        : typeof policy.commitmentSha256 !== 'string' || !hex.test(policy.commitmentSha256)
          || typeof policy.nonceHex !== 'string' || !hex.test(policy.nonceHex))
      || typeof policy.reference !== 'string' || !/^canonical-release:[1-9][0-9]*:admin-subject-rebind$/.test(policy.reference)
      || policy.reference.length > 200
      || !record(policy.databaseTarget)
      || keys(policy.databaseTarget) !== 'branchId,databaseName,originFingerprint,roleFingerprint'
      || policy.databaseTarget.branchId !== 'vqa2g2xc9wsl' || policy.databaseTarget.databaseName !== 'postgres'
      || typeof policy.databaseTarget.originFingerprint !== 'string' || !hex.test(policy.databaseTarget.originFingerprint)
      || typeof policy.databaseTarget.roleFingerprint !== 'string' || !hex.test(policy.databaseTarget.roleFingerprint)) return null;
    return Object.freeze({ ...policy, databaseTarget: Object.freeze({ ...policy.databaseTarget }) }) as unknown as RebindIntent;
  } catch { return null; }
}

// This is function-owned pg_proc configuration, never a caller's session GUC.
export function parseRebindPolicy(value: unknown): RebindPolicy | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!record(parsed)) return null;
    const { bindingProof: proof, ...input } = parsed;
    const intent = parseRebindIntent(input);
    if (!intent || !record(proof)
      || keys(proof) !== 'binding,branchId,checkedAt,databaseName,expiresAt,hyperdriveId,originFingerprint,releaseRunId,roleFingerprint,schemaVersion,sourceSha,worker,workerVersionId'
      || proof.schemaVersion !== 'lythaus-admin-rebind-binding-v1'
      || proof.worker !== 'lythaus-admin-api-development' || proof.binding !== 'DB_ADMIN_FRESH'
      || proof.hyperdriveId !== '6bfbb0eab42642e8ad294dbf59294ed3'
      || proof.sourceSha !== intent.sourceSha || proof.workerVersionId !== intent.workerVersionId
      || typeof proof.releaseRunId !== 'string' || !/^[1-9][0-9]*$/.test(proof.releaseRunId)
      || intent.reference !== `canonical-release:${proof.releaseRunId}:admin-subject-rebind`
      || proof.branchId !== intent.databaseTarget.branchId || proof.databaseName !== intent.databaseTarget.databaseName
      || proof.originFingerprint !== intent.databaseTarget.originFingerprint || proof.roleFingerprint !== intent.databaseTarget.roleFingerprint
      || !Number.isSafeInteger(proof.checkedAt) || (proof.checkedAt as number) < intent.notBefore
      || (proof.checkedAt as number) >= intent.expiresAt || proof.expiresAt !== intent.expiresAt
      || intent.expiresAt - (proof.checkedAt as number) > REBIND_MAX_WINDOW_SECONDS) return null;
    return Object.freeze({ ...intent, bindingProof: Object.freeze({ ...proof }) }) as unknown as RebindPolicy;
  } catch { return null; }
}

export function sealRebindPolicy(intent: unknown, proof: unknown): RebindPolicy | null {
  const parsed = parseRebindIntent(intent);
  return parsed ? parseRebindPolicy({ ...parsed, bindingProof: proof }) : null;
}

function unhex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g)!, pair => Number.parseInt(pair, 16));
}

export interface RebindCommitmentInput {
  principalId: string;
  previousDigest: Uint8Array;
  nextDigest: Uint8Array;
  sourceSha: string;
  workerVersionId: string;
  emailSha256: string;
  nonceHex: string;
  expiresAt: number;
}

// No digest or raw identity leaves the Worker. Only this opaque, domain-separated
// approval commitment is reviewable; it grants no authority without a DB approval.
export async function rebindCommitment(input: RebindCommitmentInput): Promise<string> {
  if (!uuid.test(input.principalId) || !uuid.test(input.workerVersionId)
    || !(input.previousDigest instanceof Uint8Array) || input.previousDigest.byteLength !== 32
    || !(input.nextDigest instanceof Uint8Array) || input.nextDigest.byteLength !== 32
    || !/^[a-f0-9]{40}$/.test(input.sourceSha) || !hex.test(input.emailSha256) || !hex.test(input.nonceHex)
    || !Number.isSafeInteger(input.expiresAt) || input.expiresAt < 0 || input.expiresAt > 4102444800) {
    throw new Error('admin_rebind_commitment_input_invalid');
  }
  const expiry = new Uint8Array(8);
  new DataView(expiry.buffer).setBigInt64(0, BigInt(input.expiresAt));
  const fields = [new TextEncoder().encode('lythaus:admin-subject-rebind:v1\0'),
    unhex(input.principalId.replaceAll('-', '')), input.previousDigest, input.nextDigest,
    unhex(input.sourceSha), unhex(input.workerVersionId.replaceAll('-', '')), unhex(input.emailSha256), unhex(input.nonceHex), expiry];
  const bytes = new Uint8Array(fields.reduce((count, field) => count + field.byteLength, 0));
  let offset = 0;
  for (const field of fields) { bytes.set(field, offset); offset += field.byteLength; }
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}
