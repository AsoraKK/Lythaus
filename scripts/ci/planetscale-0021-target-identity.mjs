import { createHash } from 'node:crypto';

const allowedTargetQueryParameters = new Map([
  ['sslmode', 'verify-full'],
  ['sslrootcert', 'system'],
]);

function assertTargetQueryParameters(raw, url) {
  if (url.hash) throw new Error('database_target_query_parameter_not_allowed');
  const queryStart = raw.indexOf('?');
  if (queryStart < 0) throw new Error('database_target_url_requires_verify_full');
  const rawQuery = raw.slice(queryStart + 1);
  if (rawQuery === '') throw new Error('database_target_url_requires_verify_full');
  const seen = new Set();
  for (const parameter of rawQuery.split('&')) {
    const equalsAt = parameter.indexOf('=');
    const name = equalsAt > 0 ? parameter.slice(0, equalsAt) : '';
    const value = equalsAt > 0 ? parameter.slice(equalsAt + 1) : '';
    const expectedValue = allowedTargetQueryParameters.get(name);
    if (expectedValue === undefined) throw new Error('database_target_query_parameter_not_allowed');
    if (seen.has(name)) throw new Error('database_target_duplicate_query_parameter');
    if (value !== expectedValue) throw new Error(name === 'sslmode'
      ? 'database_target_url_requires_verify_full'
      : 'database_target_query_parameter_value_invalid');
    seen.add(name);
  }
  if (!seen.has('sslmode')) throw new Error('database_target_url_requires_verify_full');
}

export function branchQualifiedDatabaseTarget(raw) {
  if (typeof raw !== 'string' || raw === '') throw new Error('database_target_url_missing');
  const url = new URL(raw);
  const scheme = url.protocol.replace(':', '').toLowerCase();
  if (!['postgres', 'postgresql'].includes(scheme)) throw new Error('database_target_url_scheme_invalid');
  assertTargetQueryParameters(raw, url);
  const username = decodeURIComponent(url.username);
  const separator = username.lastIndexOf('.');
  if (separator <= 0 || separator === username.length - 1) throw new Error('database_target_username_not_branch_qualified');
  const branchId = username.slice(separator + 1);
  if (!/^[a-z0-9]+$/.test(branchId)) throw new Error('database_target_branch_id_invalid');
  const sqlDatabaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!sqlDatabaseName) throw new Error('database_target_sql_name_missing');
  const role = username.slice(0, separator);
  const origin = {
    scheme: 'postgres',
    host: url.hostname.toLowerCase(),
    port: Number(url.port || 5432),
    database: sqlDatabaseName,
  };
  const originFingerprint = createHash('sha256').update(JSON.stringify(origin)).digest('hex');
  return { username, role, branchId, sqlDatabaseName, origin, originFingerprint };
}

export function buildPlanetScaleTargetIdentity({ provider, sql }) {
  const { organization, database, branchName, branchId } = provider ?? {};
  const { databaseName, originFingerprint } = sql ?? {};
  if (!/^[a-z0-9-]+$/i.test(organization ?? '')) throw new Error('database_target_organization_invalid');
  if (!/^[a-z0-9-]+$/i.test(database ?? '')) throw new Error('database_target_name_invalid');
  if (branchName !== 'main') throw new Error('database_target_branch_not_main');
  if (!/^[a-z0-9]+$/.test(branchId ?? '')) throw new Error('database_target_branch_id_invalid');
  if (typeof databaseName !== 'string' || databaseName.trim() === '') throw new Error('database_target_sql_name_invalid');
  if (!/^[a-f0-9]{64}$/.test(originFingerprint ?? '')) throw new Error('database_target_origin_fingerprint_invalid');
  const identity = {
    provider: { organization, database, branchName, branchId },
    sql: { databaseName, originFingerprint },
  };
  return { ...identity, sha256: createHash('sha256').update(JSON.stringify(identity)).digest('hex') };
}

export function assertAdminDatabaseTarget({ connectionString, plannedTarget, session }) {
  if (!plannedTarget?.provider || !plannedTarget?.sql) throw new Error('planned_database_target_missing');
  const actual = branchQualifiedDatabaseTarget(connectionString);
  if (actual.branchId !== plannedTarget.provider.branchId) throw new Error('admin_database_branch_id_mismatch');
  if (actual.sqlDatabaseName !== plannedTarget.sql.databaseName) throw new Error('admin_database_sql_name_mismatch');
  if (actual.originFingerprint !== plannedTarget.sql.originFingerprint) throw new Error('admin_database_origin_mismatch');
  const recomputed = buildPlanetScaleTargetIdentity({
    provider: { ...plannedTarget.provider, branchId: actual.branchId },
    sql: { databaseName: actual.sqlDatabaseName, originFingerprint: actual.originFingerprint },
  });
  if (recomputed.sha256 !== plannedTarget.sha256) throw new Error('admin_database_target_identity_mismatch');
  if (!session || session.databaseName !== actual.sqlDatabaseName) throw new Error('admin_database_session_name_mismatch');
  if (session.userName !== actual.username && session.userName !== actual.role) throw new Error('admin_database_session_role_mismatch');
  return {
    provider: plannedTarget.provider,
    sql: { databaseName: actual.sqlDatabaseName, originFingerprint: actual.originFingerprint },
  };
}

export function adminDatabaseConnectionConfig(raw) {
  if (typeof raw !== 'string' || raw === '') throw new Error('PLANETSCALE_ADMIN_DATABASE_URL_missing');
  branchQualifiedDatabaseTarget(raw);
  const url = new URL(raw);
  if (url.searchParams.get('sslrootcert') === 'system') url.searchParams.delete('sslrootcert');
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true } };
}

export function adminDatabaseSessionFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  return { databaseName: row.database_name, userName: row.user_name };
}

export async function assertConnectedAdminDatabaseTarget(client, { connectionString, plannedTarget }) {
  const sessionResult = await client.query('SELECT current_database() AS database_name, current_user AS user_name');
  return assertAdminDatabaseTarget({
    connectionString,
    plannedTarget,
    session: adminDatabaseSessionFromRow(sessionResult.rows?.[0]),
  });
}
