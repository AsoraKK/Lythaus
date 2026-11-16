import crypto from 'node:crypto';

// This profile is only for the isolated new-core rehearsal.
export const NEW_CORE_ROLE_LABELS = Object.freeze([
  'lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy',
  'lythaus_migrations', 'lythaus_verifier',
]);
export const NEW_CORE_LOGIN_ROLE_LABELS = Object.freeze([
  'lythaus_admin', 'lythaus_migrations', 'lythaus_verifier',
]);
export const NEW_CORE_DEFERRED_ROLE_LABELS = Object.freeze([
  'lythaus_runtime', 'lythaus_jobs', 'lythaus_privacy',
]);
export const NEW_CORE_SQL_ROLE_MODE = 'sql-console';
export const NEW_CORE_SQL_CREATOR_SHA256 = 'a942b37ccfaf5a813b1432caa209a43b9d144e47ad0de1549c289c253e556cd5';

export function assertNewCoreRoleMode(mode) {
  if (!['api-managed', NEW_CORE_SQL_ROLE_MODE].includes(mode)) throw new Error('new_core_role_mode_invalid');
  return mode;
}

export function newCoreRoleCanLogin(label) {
  if (!NEW_CORE_ROLE_LABELS.includes(label)) throw new Error('new_core_role_label_invalid');
  return NEW_CORE_LOGIN_ROLE_LABELS.includes(label);
}

export function validateNewCoreRoleMap(roleMap, { local = false, mode = 'api-managed' } = {}) {
  assertNewCoreRoleMode(mode);
  if (!roleMap || typeof roleMap !== 'object' || Array.isArray(roleMap)
    || Object.keys(roleMap).sort().join(',') !== [...NEW_CORE_ROLE_LABELS].sort().join(',')) {
    throw new Error('new_core_role_map_invalid');
  }
  if (new Set(Object.values(roleMap)).size !== NEW_CORE_ROLE_LABELS.length) {
    throw new Error('new_core_role_map_not_distinct');
  }
  for (const label of NEW_CORE_ROLE_LABELS) {
    const expectedLiteral = local || mode === NEW_CORE_SQL_ROLE_MODE || NEW_CORE_DEFERRED_ROLE_LABELS.includes(label);
    if (expectedLiteral ? roleMap[label] !== label : !/^pscale_api_[a-z0-9]{1,64}$/.test(roleMap[label])) {
      throw new Error('new_core_role_map_invalid');
    }
  }
  return roleMap;
}

export async function verifyNewCoreRoleMemberships(client, roleMap, provisionerRoleSha256 = null, { mode = 'api-managed' } = {}) {
  assertNewCoreRoleMode(mode);
  if (mode === NEW_CORE_SQL_ROLE_MODE && provisionerRoleSha256 !== NEW_CORE_SQL_CREATOR_SHA256) {
    throw new Error('new_core_sql_creator_pin_mismatch');
  }
  if (provisionerRoleSha256 !== null && !/^[a-f0-9]{64}$/.test(provisionerRoleSha256)) {
    throw new Error('new_core_provisioner_role_pin_invalid');
  }
  const result = await client.query(`SELECT membership_role.rolname AS role_name,
    member_role.rolname AS member_name, membership.admin_option,
    membership.inherit_option, membership.set_option
    FROM pg_auth_members membership
    JOIN pg_roles membership_role ON membership_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE membership_role.rolname = ANY($1::text[]) OR member_role.rolname = ANY($1::text[])`,
  [Object.values(roleMap)]);
  const deferred = (mode === NEW_CORE_SQL_ROLE_MODE ? NEW_CORE_ROLE_LABELS : NEW_CORE_DEFERRED_ROLE_LABELS)
    .map((label) => roleMap[label]);
  const seen = new Set();
  for (const row of result.rows) {
    if (provisionerRoleSha256 === null || !deferred.includes(row.role_name)
      || typeof row.member_name !== 'string' || Object.values(roleMap).includes(row.member_name)
      || crypto.createHash('sha256').update(row.member_name).digest('hex') !== provisionerRoleSha256
      || row.admin_option !== true || row.inherit_option !== false || row.set_option !== false
      || seen.has(row.role_name)) throw new Error('new_core_role_membership_boundary_failed');
    seen.add(row.role_name);
  }
  if (seen.size !== (provisionerRoleSha256 === null ? 0 : deferred.length)) {
    throw new Error('new_core_role_membership_boundary_failed');
  }
  return { totalMemberships: seen.size, provisionerManagementGrants: seen.size, runtimeRoleMemberships: 0 };
}
