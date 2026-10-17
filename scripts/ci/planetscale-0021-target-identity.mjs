import { createHash } from 'node:crypto';

export function branchQualifiedDatabaseTarget(raw) {
  if (typeof raw !== 'string' || raw === '') throw new Error('database_target_url_missing');
  const url = new URL(raw);
  const scheme = url.protocol.replace(':', '').toLowerCase();
  if (!['postgres', 'postgresql'].includes(scheme)) throw new Error('database_target_url_scheme_invalid');
  if (url.searchParams.get('sslmode') !== 'verify-full') throw new Error('database_target_url_requires_verify_full');
  const username = decodeURIComponent(url.username);
  const separator = username.lastIndexOf('.');
  if (separator <= 0 || separator === username.length - 1) throw new Error('database_target_username_not_branch_qualified');
  const branchId = username.slice(separator + 1);
  if (!/^[a-z0-9]+$/.test(branchId)) throw new Error('database_target_branch_id_invalid');
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!database) throw new Error('database_target_name_missing');
  const role = username.slice(0, separator);
  const origin = {
    scheme: 'postgres',
    host: url.hostname.toLowerCase(),
    port: Number(url.port || 5432),
    database,
  };
  const originFingerprint = createHash('sha256').update(JSON.stringify(origin)).digest('hex');
  return { username, role, branchId, database, origin, originFingerprint };
}

export function buildPlanetScaleTargetIdentity({ organization, database, branchName, branchId, originFingerprint }) {
  if (!/^[a-z0-9-]+$/i.test(organization ?? '')) throw new Error('database_target_organization_invalid');
  if (!/^[a-z0-9-]+$/i.test(database ?? '')) throw new Error('database_target_name_invalid');
  if (branchName !== 'main') throw new Error('database_target_branch_not_main');
  if (!/^[a-z0-9]+$/.test(branchId ?? '')) throw new Error('database_target_branch_id_invalid');
  if (!/^[a-f0-9]{64}$/.test(originFingerprint ?? '')) throw new Error('database_target_origin_fingerprint_invalid');
  const identity = { organization, database, branchName, branchId, originFingerprint };
  return { ...identity, sha256: createHash('sha256').update(JSON.stringify(identity)).digest('hex') };
}

export function assertAdminDatabaseTarget({ connectionString, plannedTarget, session }) {
  if (!plannedTarget || typeof plannedTarget !== 'object') throw new Error('planned_database_target_missing');
  const actual = branchQualifiedDatabaseTarget(connectionString);
  if (actual.branchId !== plannedTarget.branchId) throw new Error('admin_database_branch_id_mismatch');
  if (actual.database !== plannedTarget.database) throw new Error('admin_database_name_mismatch');
  if (actual.originFingerprint !== plannedTarget.originFingerprint) throw new Error('admin_database_origin_mismatch');
  const recomputed = buildPlanetScaleTargetIdentity({
    organization: plannedTarget.organization,
    database: actual.database,
    branchName: 'main',
    branchId: actual.branchId,
    originFingerprint: actual.originFingerprint,
  });
  if (recomputed.sha256 !== plannedTarget.sha256) throw new Error('admin_database_target_identity_mismatch');
  if (!session || session.databaseName !== actual.database) throw new Error('admin_database_session_name_mismatch');
  if (session.userName !== actual.username && session.userName !== actual.role) throw new Error('admin_database_session_role_mismatch');
  return { branchId: actual.branchId, database: actual.database, originFingerprint: actual.originFingerprint };
}
