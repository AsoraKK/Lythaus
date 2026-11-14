import { hyperdriveTarget } from './subject-diagnostic.ts';
import type { RebindPolicy } from './rebind-protocol.ts';

function fail(): never { throw new Error('admin_subject_rebind_target_unverified'); }

export async function rebindRuntimeTarget(connectionString: string, policy: RebindPolicy) {
  const url = new URL(connectionString);
  const local = url.hostname === 'hyperdrive.local' || url.hostname.endsWith('.hyperdrive.local');
  if (!local) {
    const target = await hyperdriveTarget(connectionString);
    if (target.branchId !== policy.databaseTarget.branchId || target.databaseName !== policy.databaseTarget.databaseName
      || target.originFingerprint !== policy.databaseTarget.originFingerprint || target.roleFingerprint !== policy.databaseTarget.roleFingerprint) fail();
    return { kind: 'physical' as const, role: target.role, username: target.username };
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash || !url.username
    || decodeURIComponent(url.pathname) !== '/postgres' || (url.port && url.port !== '5432')
    || url.searchParams.size !== 1 || url.searchParams.get('sslmode') !== 'disable'
    || policy.bindingProof.hyperdriveId !== '6bfbb0eab42642e8ad294dbf59294ed3'
    || policy.bindingProof.checkedAt * 1000 > Date.now() || Date.now() >= policy.bindingProof.expiresAt * 1000) fail();
  // The proxy URL cannot reveal its physical origin. Only the protected
  // function-owned, version-bound control-plane proof supplies that origin.
  // The actual database session must still match the pinned Admin role below.
  return { kind: 'platform-local' as const };
}

export async function rebindSessionMatches(row: { database_name?: unknown; current_role?: unknown; session_role?: unknown },
  policy: RebindPolicy, target: Awaited<ReturnType<typeof rebindRuntimeTarget>>): Promise<boolean> {
  if (row.database_name !== policy.databaseTarget.databaseName || typeof row.current_role !== 'string'
    || row.current_role !== row.session_role) return false;
  if (target.kind === 'physical' && ![target.role, target.username].includes(row.current_role)) return false;
  const suffix = '.' + policy.databaseTarget.branchId;
  const role = row.current_role.endsWith(suffix) ? row.current_role.slice(0, -suffix.length) : row.current_role;
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(role)) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lythaus-admin-diagnostic-role:v1:${role}`));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return fingerprint === policy.databaseTarget.roleFingerprint;
}
