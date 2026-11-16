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

export function newCoreRoleCanLogin(label) {
  if (!NEW_CORE_ROLE_LABELS.includes(label)) throw new Error('new_core_role_label_invalid');
  return NEW_CORE_LOGIN_ROLE_LABELS.includes(label);
}

export function validateNewCoreRoleMap(roleMap, { local = false } = {}) {
  if (!roleMap || typeof roleMap !== 'object' || Array.isArray(roleMap)
    || Object.keys(roleMap).sort().join(',') !== [...NEW_CORE_ROLE_LABELS].sort().join(',')) {
    throw new Error('new_core_role_map_invalid');
  }
  if (new Set(Object.values(roleMap)).size !== NEW_CORE_ROLE_LABELS.length) {
    throw new Error('new_core_role_map_not_distinct');
  }
  for (const label of NEW_CORE_ROLE_LABELS) {
    const expectedLiteral = local || NEW_CORE_DEFERRED_ROLE_LABELS.includes(label);
    if (expectedLiteral ? roleMap[label] !== label : !/^pscale_api_[a-z0-9]{1,64}$/.test(roleMap[label])) {
      throw new Error('new_core_role_map_invalid');
    }
  }
  return roleMap;
}
