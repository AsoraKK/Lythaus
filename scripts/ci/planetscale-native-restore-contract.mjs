import { createHash } from 'node:crypto';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';

export const RESTORE = Object.freeze({ organization: 'lythaus', database: 'lythaus-core', databaseId: 'hzhe0cbn6rxi',
  source: 'main', sourceId: 'vqa2g2xc9wsl', backupId: 'tfqwht9d9bt4',
  backupCompletedAt: '2026-10-26T02:27:04.589Z',
  target: 'lythaus-0021-native-restore-check-20261026-01', targetProduction: true, cluster: 'PS_5_AWS_ARM', region: 'eu-central',
  bytes: 21474836480, replicas: 0, maximumUsd: 5, maximumMs: 2 * 60 * 60 * 1000,
  qualificationStopMs: 20 * 60000, escalationMs: 45 * 60000, reviewMs: 60 * 60000, cleanupStartMs: 105 * 60000,
  setup: 'pscale_api_47syed2xlt6p', runtime: 'pscale_api_ysl604shosjg', admin: 'pscale_api_3vzps7bu44vo',
  jobs: 'pscale_api_9jfbtij9y4b2', privacy: 'pscale_api_wv7rzyuejknl',
});
export const ROLE_NAMES = Object.freeze([RESTORE.setup, RESTORE.runtime, RESTORE.admin, RESTORE.jobs, RESTORE.privacy]);
export const ROLE_SQL_SECURITY_BASELINE = Object.freeze({
  [RESTORE.setup]: Object.freeze({ rolsuper: false, rolbypassrls: true, rolcreaterole: true, rolcreatedb: true,
    rolreplication: true, rolcanlogin: true }),
  [RESTORE.runtime]: Object.freeze({ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false,
    rolreplication: false, rolcanlogin: true }),
  [RESTORE.admin]: Object.freeze({ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false,
    rolreplication: false, rolcanlogin: true }),
  [RESTORE.jobs]: Object.freeze({ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false,
    rolreplication: false, rolcanlogin: true }),
  [RESTORE.privacy]: Object.freeze({ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false,
    rolreplication: false, rolcanlogin: true }),
});
export const ROLE_SQL_MEMBERSHIP_BASELINE = Object.freeze([
  Object.freeze({ role: 'postgres', member: RESTORE.setup }),
  Object.freeze({ role: 'pg_read_all_data', member: RESTORE.setup }),
  Object.freeze({ role: 'pg_write_all_data', member: RESTORE.setup }),
]);
export const EXTENSIONS = Object.freeze(['pg_trgm', 'unaccent', 'pgcrypto']);
export const CREATE_TARGET_BODY = Object.freeze({ name: RESTORE.target, backup_id: RESTORE.backupId,
  region: RESTORE.region, cluster_size: RESTORE.cluster, replicas: 0,
  major_version: '17', deletion_protected: false, create_database_if_missing: false,
  storage: Object.freeze({ minimum_storage_bytes: RESTORE.bytes, maximum_storage_bytes: RESTORE.bytes }) });
export const ACTIONS = Object.freeze(['restore_fixed_target', 'reset_five_copied_roles',
  'install_only_missing_named_extensions', 'retain_target_for_review', 'reserved_review_and_cost_watch']);
export const apiBase = `https://api.planetscale.com/v1/organizations/${RESTORE.organization}/databases/${RESTORE.database}`;
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const safeId = value => typeof value === 'string' && /^[a-z0-9]{1,64}$/.test(value);
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class RestoreFailure extends Error {
  constructor(code, outcome = 'BLOCKED', safeDiagnostic) {
    super(code); this.code = code; this.outcome = outcome;
    if (safeDiagnostic) this.safeDiagnostic = safeDiagnostic;
  }
}
export function requireThat(condition, code, outcome) { if (!condition) throw new RestoreFailure(code, outcome); }
export const failureCode = error => error instanceof RestoreFailure ? error.code : 'operation_failed_details_redacted';
const cleanupCapability = Symbol('fixed_target_cleanup');
export function approvalRecord(raw, environment, now) {
  let record;
  try { record = JSON.parse(raw); } catch { throw new RestoreFailure('explicit_owner_approval_record_required'); }
  requireThat(object(record) && Object.keys(record).sort().join(',') ===
    'actions,backupId,backupSnapshotAcknowledged,cleanupPermit,cumulativeBudget,estimatedSubtotalUsd,expiresAt,manualOperator,maximumUsd,reference,releaseSha,retention,reviewWindow,roles,target,taxAndFeeAllowanceUsd',
  'approval_record_fields_invalid');
  requireThat(record.releaseSha === environment.RELEASE_SHA && record.backupId === RESTORE.backupId && record.target === RESTORE.target
    && JSON.stringify(record.roles) === JSON.stringify(ROLE_NAMES) && JSON.stringify(record.actions) === JSON.stringify(ACTIONS)
    && record.maximumUsd === RESTORE.maximumUsd && record.backupSnapshotAcknowledged === true,
  'approval_scope_mismatch');
  requireThat(Number.isFinite(record.estimatedSubtotalUsd) && record.estimatedSubtotalUsd >= 0.04
    && Number.isFinite(record.taxAndFeeAllowanceUsd) && record.taxAndFeeAllowanceUsd > 0
    && record.estimatedSubtotalUsd + record.taxAndFeeAllowanceUsd <= RESTORE.maximumUsd, 'all_in_budget_not_bounded');
  requireThat(typeof record.reference === 'string' && /^[A-Za-z0-9:/._# -]{8,250}$/.test(record.reference)
    && typeof record.manualOperator === 'string' && /^[A-Za-z0-9_.@-]{1,100}$/.test(record.manualOperator), 'approval_provenance_required');
  const expires = Date.parse(record.expiresAt);
  requireThat(Number.isFinite(expires) && expires >= now + RESTORE.maximumMs && expires <= now + 24 * 3600000, 'approval_expired_or_unbounded');
  const window = record.reviewWindow, retention = record.retention, permit = record.cleanupPermit;
  requireThat(object(window) && /^[A-Za-z0-9-]{1,39}$/.test(window.reviewer ?? '')
    && window.operator === record.manualOperator && window.reserved === true
    && Date.parse(window.availableFrom) <= now && Date.parse(window.availableUntil) >= now + RESTORE.maximumMs,
  'reserved_reviewer_operator_window_required');
  requireThat(object(permit) && Object.keys(permit).sort().join(',') === 'runNumber,workflowId'
    && Number.isSafeInteger(permit.workflowId) && permit.workflowId > 0
    && Number.isSafeInteger(permit.runNumber) && permit.runNumber > 0, 'one_use_cleanup_reservation_required');
  requireThat(object(retention) && retention.operator === record.manualOperator
    && typeof retention.reference === 'string' && retention.reference.length >= 8
    && typeof retention.manualEndActionApprovalReference === 'string' && retention.manualEndActionApprovalReference.length >= 8
    && retention.endAction === 'separately_approved_manual_decision_no_automatic_unprotect'
    && Date.parse(retention.endsAt) >= now + RESTORE.maximumMs && Date.parse(retention.endsAt) <= now + 24 * 3600000
    && Date.parse(retention.decisionBy) >= now && Date.parse(retention.decisionBy) <= now + RESTORE.maximumMs
    && Number.isFinite(retention.estimatedUsd) && retention.estimatedUsd > 0
    && record.estimatedSubtotalUsd >= retention.estimatedUsd + 0.025,
  'finite_separately_approved_backup_retention_plan_required');
  const budget = record.cumulativeBudget;
  requireThat(object(budget) && Object.keys(budget).sort().join(',') ===
    'evidenceSha256,operator,priorQualificationRunId,priorRetentionEndActionReference,priorRetentionEndsAt,priorRetentionUpperBoundUsd,priorSpendUpperBoundUsd,reference'
    && budget.operator === record.manualOperator && budget.priorQualificationRunId === '40212030891'
    && /^[a-f0-9]{64}$/.test(budget.evidenceSha256 ?? '')
    && typeof budget.reference === 'string' && budget.reference.length >= 8 && budget.reference.length <= 250
    && typeof budget.priorRetentionEndActionReference === 'string' && budget.priorRetentionEndActionReference.length >= 8
    && budget.priorRetentionEndActionReference.length <= 250
    && Number.isFinite(Date.parse(budget.priorRetentionEndsAt))
    && Date.parse(budget.priorRetentionEndsAt) <= now + 24 * 3600000
    && Number.isFinite(budget.priorSpendUpperBoundUsd) && budget.priorSpendUpperBoundUsd > 0
    && Number.isFinite(budget.priorRetentionUpperBoundUsd) && budget.priorRetentionUpperBoundUsd >= 0,
  'reviewed_prior_exercise_liability_bound_required');
  requireThat(budget.priorSpendUpperBoundUsd + budget.priorRetentionUpperBoundUsd
    + record.estimatedSubtotalUsd + record.taxAndFeeAllowanceUsd <= RESTORE.maximumUsd,
  'cumulative_exercise_budget_exceeded');
  return record;
}

export function checkBackup(backup, now) {
  requireThat(backup?.id === RESTORE.backupId && backup.database_branch?.id === RESTORE.sourceId
    && backup.database_branch.name === 'main' && backup.database_branch.deleted_at === null
    && backup.state === 'success' && backup.deleted_at === null && typeof backup.protected === 'boolean', 'backup_identity_or_state_invalid');
  const completed = Date.parse(backup.completed_at), expires = Date.parse(backup.expires_at);
  requireThat(Number.isFinite(completed) && completed <= now && now + RESTORE.maximumMs <= completed + 24 * 3600000
    && Number.isFinite(expires) && now + RESTORE.maximumMs < expires, 'backup_stale_or_test_window_too_short');
  requireThat(backup.completed_at === RESTORE.backupCompletedAt, 'fixed_backup_completion_changed');
  requireThat(Number.isSafeInteger(backup.pvc_size) && backup.pvc_size > 0 && backup.pvc_size <= RESTORE.bytes
    && Number.isSafeInteger(backup.uncompressed_size) && backup.uncompressed_size <= RESTORE.bytes, 'backup_storage_not_bounded');
}

export function checkOwnedBranch(branch, id) {
  requireThat(safeId(id) && id !== RESTORE.sourceId && branch?.id === id && branch.name === RESTORE.target
    && branch.deleted_at === null && branch.default === false && branch.kind === 'postgresql'
    && branch.restored_from_branch?.id === RESTORE.sourceId && branch.deletion_protected === false,
  'created_target_ownership_changed');
}
export function checkBranch(branch, id, ready = false) {
  checkOwnedBranch(branch, id);
  requireThat(branch.production === RESTORE.targetProduction, 'created_target_classification_changed');
  requireThat(branch.cluster_name === RESTORE.cluster && branch.cluster_architecture === 'aarch64'
    && branch.region?.slug === RESTORE.region && branch.replicas === 0
    && branch.minimum_storage_bytes === RESTORE.bytes && branch.maximum_storage_bytes === RESTORE.bytes,
  'created_target_identity_or_configuration_changed');
  if (ready) requireThat(branch.ready === true && branch.state === 'ready' && branch.frozen === false, 'target_not_ready');
}

export function requireResetPermissions(accesses, production) {
  requireThat(typeof production === 'boolean', 'target_classification_unverifiable');
  const required = production ? ['connect_production_branch', 'delete_production_branch_password']
    : ['connect_branch', 'delete_branch_password'];
  for (const access of required) requireThat(accesses.has(access), `existing_token_missing_${access}`);
  return required;
}

function safeType(value, present = true) {
  if (!present) return 'MISSING';
  if (value === null) return 'NULL';
  if (Array.isArray(value)) return 'ARRAY';
  if (object(value)) return 'OBJECT';
  return typeof value === 'string' ? 'STRING' : typeof value === 'boolean' ? 'BOOLEAN'
    : typeof value === 'number' ? 'NUMBER' : 'UNSUPPORTED';
}

function safeRoleField(row, key, matcher, expected) {
  const present = object(row) && Object.hasOwn(row, key);
  const value = present ? row[key] : undefined;
  const type = safeType(value, present);
  return { present, type, expected, ...(type === 'BOOLEAN' || type === 'NULL' ? { observed: value } : {}), matches: matcher(value, present) };
}

function roleMetadataDiagnostic(name, branchId, rows, found, row, sourceRow) {
  const branch = object(row?.branch) ? row.branch : undefined;
  const recognizedBaseUsernameCounts = Object.fromEntries(ROLE_NAMES.map(role => [role, 0]));
  const recognizedRoutedUsernameCounts = Object.fromEntries(ROLE_NAMES.map(role => [role, 0]));
  const recognizedIdentityRows = [];
  for (const candidate of rows) {
    if (!object(candidate)) continue;
    const baseRole = ROLE_NAMES.includes(candidate.base_username) ? candidate.base_username : undefined;
    const username = typeof candidate.username === 'string' ? candidate.username : '';
    const suffix = `.${branchId}`;
    const routedBase = username.endsWith(suffix) ? username.slice(0, -suffix.length) : undefined;
    const routedRole = ROLE_NAMES.includes(routedBase) ? routedBase : undefined;
    if (baseRole) recognizedBaseUsernameCounts[baseRole]++;
    if (routedRole) recognizedRoutedUsernameCounts[routedRole]++;
    if (!baseRole && !routedRole) continue;
    const candidateBranch = object(candidate.branch) ? candidate.branch : undefined;
    recognizedIdentityRows.push({ role: baseRole ?? routedRole, idSyntaxValid: safeId(candidate.id),
      baseUsernamePresent: Object.hasOwn(candidate, 'base_username'), baseUsernameType: safeType(candidate.base_username,
        Object.hasOwn(candidate, 'base_username')), baseUsernameMatches: candidate.base_username === (baseRole ?? routedRole),
      routedUsernameMatches: routedRole === (baseRole ?? routedRole), branchIdMatches: candidateBranch?.id === branchId,
      branchNameMatches: candidateBranch?.name === (branchId === RESTORE.sourceId ? 'main' : RESTORE.target),
      databaseNameMatches: candidate.database_name === 'postgres' });
  }
  const expectedReplication = name === RESTORE.setup;
  const actualInherited = Array.isArray(row?.inherited_roles) ? row.inherited_roles : undefined;
  const inheritedMatches = actualInherited !== undefined
    && actualInherited.every(item => typeof item === 'string' && /^[A-Za-z0-9_.-]+$/.test(item));
  const sourceInherited = Array.isArray(sourceRow?.inherited_roles) ? sourceRow.inherited_roles : undefined;
  const sourceInheritanceMatches = sourceRow === undefined || (sourceInherited !== undefined && actualInherited !== undefined
    && JSON.stringify([...actualInherited].sort()) === JSON.stringify([...sourceInherited].sort()));
  return {
    roleClass: name === RESTORE.setup ? 'setup' : 'application', candidateCount: found.length,
    inventory: { rowCount: rows.length, recognizedBaseUsernameCounts, recognizedRoutedUsernameCounts,
      recognizedIdentityRowCount: recognizedIdentityRows.length,
      recognizedIdentityRows: recognizedIdentityRows.slice(0, ROLE_NAMES.length * 2),
      recognizedIdentityRowsTruncated: recognizedIdentityRows.length > ROLE_NAMES.length * 2 },
    fields: {
      id: safeRoleField(row, 'id', value => safeId(value), 'safe-provider-id'),
      baseUsername: safeRoleField(row, 'base_username', value => value === name, 'exact-configured-role'),
      branchId: { present: !!branch && Object.hasOwn(branch, 'id'), type: safeType(branch?.id, !!branch && Object.hasOwn(branch, 'id')),
        expected: 'exact-bound-branch', matches: branch?.id === branchId },
      branchName: { present: !!branch && Object.hasOwn(branch, 'name'), type: safeType(branch?.name, !!branch && Object.hasOwn(branch, 'name')),
        expected: branchId === RESTORE.sourceId ? 'main' : RESTORE.target,
        matches: branch?.name === (branchId === RESTORE.sourceId ? 'main' : RESTORE.target) },
      branchDeletedAtNull: { present: !!branch && Object.hasOwn(branch, 'deleted_at'), type: safeType(branch?.deleted_at, !!branch && Object.hasOwn(branch, 'deleted_at')),
        expected: 'NULL', matches: branch?.deleted_at === null },
      username: safeRoleField(row, 'username', value => value === `${name}.${branchId}`, 'exact-bound-role'),
      databaseName: safeRoleField(row, 'database_name', value => value === 'postgres', 'postgres'),
      ready: safeRoleField(row, 'ready', value => value === true, true),
      expired: safeRoleField(row, 'expired', value => value === false, false),
      deletedAtNull: safeRoleField(row, 'deleted_at', value => value === null, 'NULL'),
      disabledAtNull: safeRoleField(row, 'disabled_at', value => value === null, 'NULL'),
      droppedAtNull: safeRoleField(row, 'dropped_at', value => value === null, 'NULL'),
      expiresAtNull: safeRoleField(row, 'expires_at', value => value === null, 'NULL'),
      withReplication: safeRoleField(row, 'with_replication', value => value === expectedReplication, expectedReplication),
      inheritedRoles: { present: object(row) && Object.hasOwn(row, 'inherited_roles'), type: safeType(row?.inherited_roles,
        object(row) && Object.hasOwn(row, 'inherited_roles')), expected: 'array of safe inherited role names',
        observedCount: actualInherited?.length ?? null, elementsAreSafeStrings: actualInherited !== undefined
          && actualInherited.every(item => typeof item === 'string' && /^[A-Za-z0-9_.-]+$/.test(item)), matches: inheritedMatches },
      ...(sourceRow === undefined ? {} : { sourceInheritanceMatches: { present: true, type: 'BOOLEAN', expected: true,
        observed: sourceInheritanceMatches, matches: sourceInheritanceMatches } }),
    },
  };
}

function inspectRoles(rows, branchId, sourceRoles, allowPending = false) {
  requireThat(Array.isArray(rows), 'copied_role_inventory_invalid');
  const result = new Map();
  for (const name of ROLE_NAMES) {
    const found = rows.filter(row => object(row) && row.base_username === name);
    if (allowPending && found.length === 0) continue;
    const row = found.length === 1 ? found[0] : undefined;
    const sourceRow = sourceRoles?.get(name);
    const diagnostic = roleMetadataDiagnostic(name, branchId, rows, found, row, sourceRow);
    const checks = Object.entries(diagnostic.fields).filter(([key]) => key !== 'sourceInheritanceMatches'
      && !(allowPending && key === 'ready' && typeof row?.ready === 'boolean'))
      .every(([, value]) => value.matches === true);
    if (found.length !== 1 || !checks) {
      throw new RestoreFailure('copied_role_metadata_invalid', 'BLOCKED', { version: 1, role: diagnostic });
    }
    if (sourceRoles && (!sourceRow || diagnostic.fields.sourceInheritanceMatches?.matches !== true)) {
      throw new RestoreFailure('copied_role_authority_changed', 'BLOCKED', { version: 1, role: diagnostic });
    }
    result.set(name, { id: row.id, base_username: name, username: row.username, inherited_roles: row.inherited_roles,
      ...(allowPending ? { ready: row.ready } : {}) });
  }
  return result;
}

export function checkedRoles(rows, branchId, sourceRoles) { return inspectRoles(rows, branchId, sourceRoles); }

export function checkCopiedRoleMetadata(row, branchId, name, sourceRow) {
  requireThat(ROLE_NAMES.includes(name), 'copied_role_metadata_invalid');
  const diagnostic = roleMetadataDiagnostic(name, branchId, [row], [row], row, sourceRow);
  if (!Object.entries(diagnostic.fields).filter(([key]) => key !== 'sourceInheritanceMatches').every(([, field]) => field.matches))
    throw new RestoreFailure('copied_role_metadata_invalid', 'BLOCKED', { version: 1, role: diagnostic });
  if (sourceRow && !diagnostic.fields.sourceInheritanceMatches.matches)
    throw new RestoreFailure('copied_role_authority_changed', 'BLOCKED', { version: 1, role: diagnostic });
}

export function copiedRoleReadiness(rows, branchId, sourceRoles) {
  requireThat(Array.isArray(rows), 'copied_role_inventory_invalid');
  const shapeValid = rows.every(row => object(row) && safeId(row.id)
    && typeof row.base_username === 'string' && row.base_username.length > 0
    && row.username === `${row.base_username}.${branchId}` && typeof row.ready === 'boolean'
    && row.branch?.id === branchId && row.branch.name === RESTORE.target && row.branch.deleted_at === null);
  if (!shapeValid) throw new RestoreFailure('copied_role_metadata_invalid', 'BLOCKED',
    { version: 1, inventory: { rowCount: rows.length, identityShapeValid: false } });
  requireThat(new Set(rows.map(row => row.id)).size === rows.length, 'copied_role_inventory_invalid');
  const roles = inspectRoles(rows, branchId, sourceRoles, true);
  const missing = ROLE_NAMES.filter(name => !roles.has(name));
  const pending = ROLE_NAMES.filter(name => roles.get(name)?.ready === false);
  return { roles, missing, pending, ready: missing.length === 0 && pending.length === 0 };
}

export function assertRestoreRoleSqlBaseline(roles, members) {
  requireThat(Array.isArray(roles) && roles.length === ROLE_NAMES.length && Array.isArray(members), 'restored_role_security_contract_invalid');
  const byName = new Map(roles.map(row => [row?.rolname, row]));
  requireThat(byName.size === ROLE_NAMES.length && ROLE_NAMES.every(name => byName.has(name)), 'restored_role_security_contract_invalid');
  for (const name of ROLE_NAMES) {
    const expected = ROLE_SQL_SECURITY_BASELINE[name], row = byName.get(name);
    requireThat(Object.keys(expected).every(key => typeof row[key] === 'boolean' && row[key] === expected[key]),
      'restored_role_security_contract_invalid');
  }
  const expectedMemberships = ROLE_SQL_MEMBERSHIP_BASELINE.map(row => `${row.role}\0${row.member}`).sort();
  const observedMemberships = members.map(row => {
    requireThat(object(row) && typeof row.role === 'string' && typeof row.member === 'string'
      && typeof row.grantor === 'string' && typeof row.admin_option === 'boolean'
      && typeof row.inherit_option === 'boolean' && typeof row.set_option === 'boolean', 'restored_role_security_contract_invalid');
    return `${row.role}\0${row.member}`;
  }).sort();
  requireThat(JSON.stringify(observedMemberships) === JSON.stringify(expectedMemberships), 'restored_role_security_contract_invalid');
}

const diagnosticPermissions = new Set(['read_database', 'read_databases', 'read_service_tokens', 'read_branch', 'read_backups',
  'delete_branch', 'delete_production_branch', 'create_branch', 'connect_branch', 'connect_production_branch',
  'delete_branch_password', 'delete_production_branch_password',
  'restore_backup', 'restore_production_branch_backup', 'restore_production_branch_backups',
  'read_organization', 'read_invoices', 'read_audit_logs', 'create_databases', 'delete_databases',
  'read_oauth_applications', 'read_oauth_tokens', 'write_oauth_tokens', 'delete_oauth_tokens',
  'write_service_tokens', 'delete_service_tokens', 'write_teams', 'read_metrics_endpoints',
  'write_organization', 'delete_organization', 'write_databases', 'write_members', 'read_members', 'delete_members',
  'read_branches', 'write_branches', 'delete_branches', 'promote_branches', 'delete_production_branches',
  'manage_production_branch_passwords', 'write_deploy_requests', 'read_deploy_requests', 'deploy_deploy_requests',
  'approve_deploy_requests', 'write_comments', 'read_comments', 'manage_passwords', 'write_backups', 'delete_backups',
  'delete_production_branch_backups', 'restore_backups', 'write_database', 'delete_database', 'write_branch']);
const diagnosticLimit = 64;
function fieldKind(row, key) {
  if (!object(row) || !Object.hasOwn(row, key)) return 'MISSING';
  if (row[key] === null) return 'NULL';
  if (typeof row[key] !== 'string') return 'NON_STRING';
  if (row[key] === '') return 'EMPTY_STRING';
  if (row[key] === '*') return 'WILDCARD';
  return 'STRING';
}
function permissionKind(row, key = 'access') {
  const kind = fieldKind(row, key);
  return kind === 'STRING' ? diagnosticPermissions.has(row[key]) ? row[key] : 'UNKNOWN_STRING' : kind;
}
function typeKind(row, key) {
  const kind = fieldKind(row, key);
  if (kind !== 'STRING') return kind;
  const types = { database: 'DATABASE', organization: 'ORGANIZATION', branch: 'BRANCH', alldatabases: 'ALL_DATABASES_MARKER' };
  const normalized = row[key].toLowerCase().replace(/[_ -]/g, '');
  return Object.hasOwn(types, normalized) ? types[normalized] : 'UNKNOWN_STRING';
}
function nameKind(row, key) {
  const kind = fieldKind(row, key);
  if (kind !== 'STRING') return kind;
  if (row[key] === RESTORE.database) return 'DATABASE_NAME';
  if (row[key] === RESTORE.organization) return 'ORGANIZATION_NAME';
  return row[key].toLowerCase() === 'all databases' ? 'ALL_DATABASES_MARKER' : 'UNKNOWN_STRING';
}
function rowKind(value) {
  return value === null ? 'NULL' : object(value) ? 'OBJECT' : typeof value === 'string' ? 'UNKNOWN_STRING' : 'NON_OBJECT';
}
function descriptorDiagnostic(value) {
  const row = object(value) ? value : {}, resource = object(row.resource) ? row.resource : {};
  return {
    rowKind: rowKind(value),
    access: permissionKind(row), resourceTypeKind: typeKind(row, 'resource_type'), nestedTypeKind: typeKind(resource, 'type'),
    resourceIdKind: fieldKind(row, 'resource_id'), nestedIdKind: fieldKind(resource, 'id'),
    resourceNameKind: nameKind(row, 'resource_name'), nestedNameKind: nameKind(resource, 'name'),
    resourceIdMatchesDatabase: row.resource_id === RESTORE.databaseId,
    resourceIdMissing: !Object.hasOwn(row, 'resource_id'), resourceIdNull: row.resource_id === null,
    nestedIdMatchesDatabase: resource.id === RESTORE.databaseId,
    nestedNameMatchesDatabase: resource.name === RESTORE.database,
    nestedNameMatchesOrganization: resource.name === RESTORE.organization,
    resourceNameMatchesDatabase: row.resource_name === RESTORE.database,
    resourceNameMatchesOrganization: row.resource_name === RESTORE.organization,
    resourceTypeIsDatabase: typeof row.resource_type === 'string' && row.resource_type.toLowerCase() === 'database',
    resourceTypeIsOrganization: typeof row.resource_type === 'string' && row.resource_type.toLowerCase() === 'organization',
    resourceMissing: !Object.hasOwn(row, 'resource'), resourceNull: row.resource === null,
    resourceKind: Object.hasOwn(row, 'resource') ? rowKind(row.resource) : 'MISSING',
    deletedAtMissing: !object(row.resource) || !Object.hasOwn(row.resource, 'deleted_at'),
    deletedAtNull: resource.deleted_at === null,
  };
}
function valueKind(row, key) {
  if (!object(row) || !Object.hasOwn(row, key)) return 'MISSING';
  if (Array.isArray(row[key])) return 'ARRAY';
  if (object(row[key])) return 'OBJECT';
  const kind = fieldKind(row, key);
  return kind === 'STRING' ? 'UNKNOWN_STRING' : kind;
}
function collectionDiagnostic(row, key, project) {
  const values = object(row) && Array.isArray(row[key]) ? row[key] : null;
  return { kind: valueKind(row, key), count: values?.length ?? null,
    truncated: (values?.length ?? 0) > diagnosticLimit, rows: values?.slice(0, diagnosticLimit).map(project) ?? [] };
}
function oauthResourceDiagnostic(value) {
  const row = object(value) ? value : {};
  return { rowKind: rowKind(value), idKind: fieldKind(row, 'id'), nameKind: fieldKind(row, 'name'),
    organizationKind: fieldKind(row, 'organization'), databaseKind: fieldKind(row, 'database'),
    idMatchesDatabase: row.id === RESTORE.databaseId, nameMatchesDatabase: row.name === RESTORE.database,
    nameMatchesOrganization: row.name === RESTORE.organization, organizationMatches: row.organization === RESTORE.organization,
    idMatchesSourceBranch: row.id === RESTORE.sourceId, nameMatchesSourceBranch: row.name === RESTORE.source,
    databaseMatches: row.database === RESTORE.database };
}
function oauthDiagnostic(token) {
  const value = object(token.oauth_accesses_by_resource) ? token.oauth_accesses_by_resource : {};
  const groups = {};
  for (const [key, resources] of [['organization', 'organizations'], ['database', 'databases'], ['branch', 'branches']]) {
    const group = object(value[key]) ? value[key] : {};
    groups[key] = { kind: valueKind(value, key), resources: collectionDiagnostic(group, resources, oauthResourceDiagnostic),
      accesses: collectionDiagnostic(group, 'accesses', access => ({ rowKind: rowKind(access), access: permissionKind(access, 'name') })) };
  }
  return { kind: valueKind(token, 'oauth_accesses_by_resource'), groups, userKind: valueKind(value, 'user'),
    unknownGroupCount: Object.keys(value).filter(key => !['organization', 'database', 'branch', 'user'].includes(key)).length };
}
function authorityDiagnostic(token) {
  return {
    version: 3, databaseId: RESTORE.databaseId,
    tokenMatchesCodeXToken: token.id === 'estjkwtxzsmh', tokenMatchesOtherKnownToken: token.id === 'v6pg9b7rz38a',
    accessRowCount: token.service_token_accesses.length, rowsTruncated: token.service_token_accesses.length > diagnosticLimit,
    rows: token.service_token_accesses.slice(0, diagnosticLimit).map(descriptorDiagnostic),
    oauthAccessesByResource: oauthDiagnostic(token),
    grants: { status: 'NOT_REQUESTED' },
  };
}
function grantsDiagnostic(rows, pages) {
  const projected = rows.slice(0, diagnosticLimit).map(value => {
    const row = object(value) ? value : {}, accesses = Array.isArray(row.accesses) ? row.accesses : [];
    return { ...descriptorDiagnostic(value),
      accessesKind: Array.isArray(row.accesses) ? 'ARRAY' : Object.hasOwn(row, 'accesses') ? row.accesses === null ? 'NULL' : 'NON_ARRAY' : 'MISSING',
      accessCount: Array.isArray(row.accesses) ? row.accesses.length : null, accessesTruncated: accesses.length > diagnosticLimit,
      accesses: accesses.slice(0, diagnosticLimit).map(access => ({
        rowKind: rowKind(access), access: permissionKind(access),
      })),
    };
  });
  const truncated = rows.length > diagnosticLimit || projected.some(row => row.accessesTruncated);
  return { status: truncated ? 'TRUNCATED' : 'COLLECTED', pages, rowCount: rows.length,
    rowsTruncated: rows.length > diagnosticLimit, rows: projected };
}

const providerErrorCodes = new Set(['access_denied', 'permission_denied', 'insufficient_permissions', 'forbidden',
  'unauthorized', 'not_found', 'bad_request', 'invalid_request', 'unprocessable_entity', 'internal_server_error']);
async function providerFailureDiagnostic(response, method) {
  const requestIds = ['x-request-id', 'x-planetscale-request-id', 'x-pscale-request-id']
    .map(name => response.headers?.get?.(name)).filter(value => value !== null && value !== undefined);
  const requestId = requestIds.length > 0 && requestIds.every(value => value === requestIds[0])
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestIds[0]) ? requestIds[0] : null;
  const diagnostic = { version: 1, method, httpStatus: response.status, requestId,
    error: { bodyFormat: 'UNAVAILABLE', code: null } };
  const reader = response.body?.getReader?.();
  if (!reader) return diagnostic;
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { diagnostic.error.bodyFormat = 'OVERSIZED'; await reader.cancel(); return diagnostic; }
      chunks.push(value);
    }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    diagnostic.error.bodyFormat = object(body) ? 'JSON_OBJECT' : 'JSON_OTHER';
    if (object(body)) {
      const code = object(body.error) ? body.error.code : body.code;
      diagnostic.error.code = code === undefined ? null : providerErrorCodes.has(code) ? code : 'REDACTED';
    }
  } catch { diagnostic.error.bodyFormat = 'UNREADABLE_OR_NON_JSON'; }
  finally { reader.releaseLock(); }
  return diagnostic;
}

export class RestoreApi {
  #cleanupOnly;
  constructor(token, fetchImpl = fetch, capability) {
    try { this.authorization = planetScaleServiceTokenAuthorizationHeader(token); }
    catch { throw new RestoreFailure('existing_service_token_pair_required'); }
    this.tokenId = this.authorization.split(':')[0]; this.fetchImpl = fetchImpl;
    this.#cleanupOnly = capability === cleanupCapability;
  }
  async request(path, { method = 'GET', body, absent = false, signal } = {}) {
    const target = `/branches/${RESTORE.target}`, backup = `/branches/main/backups/${RESTORE.backupId}`;
    const grantsPage = /^\/\.\.\/service-tokens\/self\/grants\?page=([1-5])&per_page=100$/.exec(path);
    const getAllowed = ['', '/branches/main', target, backup, '/../service-tokens/self'].includes(path)
      || (!this.#cleanupOnly && grantsPage !== null)
      || /^\/branches(?:\/main\/roles)?\?page=[1-5]&per_page=100$/.test(path)
      || new RegExp(`^${target}/roles\\?page=[1-5]&per_page=100$`).test(path);
    const writeAllowed = this.#cleanupOnly
      ? method === 'DELETE' && path === target && body === undefined
      : (method === 'POST' && path === '/branches' && JSON.stringify(body) === JSON.stringify(CREATE_TARGET_BODY))
        || (method === 'POST' && new RegExp(`^${target}/roles/[a-z0-9]{1,64}/reset$`).test(path) && body === undefined);
    requireThat((method === 'GET' && getAllowed && body === undefined) || writeAllowed, 'fixed_provider_operation_required');
    const tokenUrl = 'https://api.planetscale.com/v1/organizations/' + RESTORE.organization + '/service-tokens/' + encodeURIComponent(this.tokenId);
    const url = path === '/../service-tokens/self' ? tokenUrl
      : grantsPage ? tokenUrl + '/grants?page=' + grantsPage[1] + '&per_page=100' : apiBase + path;
    let response;
    try {
      response = await this.fetchImpl(url, { method, redirect: 'error', cache: 'no-store',
        headers: { authorization: this.authorization, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
    } catch { throw new RestoreFailure('provider_transport_failed', method === 'GET' ? 'BLOCKED' : 'UNKNOWN_MUTATION_OUTCOME'); }
    requireThat(response.redirected !== true && (!response.url || response.url === url), 'provider_redirect_rejected',
      method === 'GET' ? 'BLOCKED' : 'UNKNOWN_MUTATION_OUTCOME');
    if (method === 'GET' && absent && response.status === 404) return null;
    if (!(response.status >= 200 && response.status < 300)) {
      const error = new RestoreFailure([401, 403].includes(response.status) ? 'provider_access_denied' : 'provider_request_failed',
        method === 'GET' || [400, 401, 403, 404, 409, 422].includes(response.status) ? 'DENIED' : 'UNKNOWN_MUTATION_OUTCOME');
      if (Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) error.httpStatus = response.status;
      error.providerDiagnostic = await providerFailureDiagnostic(response, method);
      throw error;
    }
    if (response.status === 204) {
      requireThat(method === 'DELETE', 'provider_response_invalid', method === 'GET' ? 'BLOCKED' : 'UNKNOWN_MUTATION_OUTCOME');
      return null;
    }
    let size = 0; const chunks = [];
    try {
      for await (const chunk of response.body) { size += chunk.byteLength; if (size > 1048576) throw new Error(); chunks.push(chunk); }
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      if (!object(value)) throw new Error();
      return value;
    } catch { throw new RestoreFailure('provider_response_invalid', method === 'GET' ? 'BLOCKED' : 'UNKNOWN_MUTATION_OUTCOME'); }
  }
  async list(path, { signal } = {}) {
    const rows = []; let total;
    for (let page = 1; page <= 5; page++) {
      const value = await this.request(`${path}?page=${page}&per_page=100`, { signal });
      requireThat(Array.isArray(value.data) && value.current_page === page && value.data.length <= 100
        && Number.isSafeInteger(value.total_count) && value.total_count <= 500 && value.total_count >= 0, 'provider_inventory_invalid');
      total ??= value.total_count;
      requireThat(value.total_count === total, 'provider_inventory_changed');
      rows.push(...value.data);
      if (value.next_page === null) { requireThat(rows.length === total && new Set(rows.map(row => row.id)).size === rows.length, 'provider_inventory_incomplete'); return rows; }
      requireThat(value.next_page === page + 1 && page < 5, 'provider_pagination_invalid');
    }
    throw new RestoreFailure('provider_inventory_incomplete');
  }
  async tokenGrantsDiagnostic() {
    const rows = []; let total;
    for (let page = 1; page <= 5; page++) {
      const value = await this.request('/../service-tokens/self/grants?page=' + page + '&per_page=100');
      requireThat(value.type === 'list' && Array.isArray(value.data) && value.data.length <= 100 && value.current_page === page,
        'token_grants_inventory_invalid');
      if (Object.hasOwn(value, 'total_count')) {
        requireThat(Number.isSafeInteger(value.total_count) && value.total_count >= 0 && value.total_count <= 500
          && (total === undefined || total === value.total_count), 'token_grants_inventory_invalid');
        total = value.total_count;
      }
      rows.push(...value.data);
      if (value.next_page === null) {
        requireThat(total === undefined || rows.length === total, 'token_grants_inventory_incomplete');
        return grantsDiagnostic(rows, page);
      }
      requireThat(value.next_page === page + 1 && page < 5, 'token_grants_pagination_invalid');
    }
    throw new RestoreFailure('token_grants_inventory_incomplete');
  }
  async authority(onEvidence = () => {}, includeGrantDiagnostic = false, requiredThrough) {
    const database = await this.request('');
    requireThat(database.id === RESTORE.databaseId && database.name === RESTORE.database && database.kind === 'postgresql', 'database_identity_changed');
    const token = await this.request('/../service-tokens/self');
    requireThat(token.id === this.tokenId && Array.isArray(token.service_token_accesses), 'existing_token_authority_unverifiable');
    const evidence = authorityDiagnostic(token); let grantDiagnosticFailure;
    if (requiredThrough !== undefined) {
      const expires = typeof token.expires_at === 'string' ? Date.parse(token.expires_at) : NaN;
      const expiryKnown = token.expires_at === null || (Number.isFinite(expires)
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(token.expires_at));
      evidence.tokenLifetime = { fieldType: safeType(token.expires_at, Object.hasOwn(token, 'expires_at')),
        expiresAt: Number.isFinite(expires) && expiryKnown ? new Date(expires).toISOString() : null,
        requiredThrough: Number.isFinite(requiredThrough) ? new Date(requiredThrough).toISOString() : null,
        coversRequiredWindow: Number.isFinite(requiredThrough) && expiryKnown
          && (token.expires_at === null || expires > requiredThrough) };
    }
    await onEvidence(structuredClone(evidence));
    if (includeGrantDiagnostic) {
      try {
        evidence.grants = await this.tokenGrantsDiagnostic();
        if (evidence.grants.status !== 'COLLECTED') grantDiagnosticFailure = new RestoreFailure('token_grants_diagnostic_truncated');
      } catch (error) {
        grantDiagnosticFailure = error;
        evidence.grants = { status: error instanceof RestoreFailure ? error.outcome : 'BLOCKED', errorCode: failureCode(error),
          httpStatus: Number.isInteger(error?.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599 ? error.httpStatus : null };
      }
      if (evidence.rowsTruncated && !grantDiagnosticFailure) grantDiagnosticFailure = new RestoreFailure('token_authority_diagnostic_truncated');
      await onEvidence(structuredClone(evidence));
    }
    const accesses = new Set(token.service_token_accesses.filter(row => row.resource_id === RESTORE.databaseId
      && row.resource?.id === RESTORE.databaseId && row.resource.name === RESTORE.database && row.resource.deleted_at === null
      && row.resource_type?.toLowerCase() === 'database').map(row => row.access));
    const required = ['read_database', 'read_branch', 'delete_branch', 'delete_production_branch', 'read_backups'];
    if (!this.#cleanupOnly) required.push('create_branch', 'connect_branch', 'connect_production_branch');
    for (const access of required) {
      requireThat(accesses.has(access), `existing_token_missing_${access}`);
    }
    if (!this.#cleanupOnly) requireThat(accesses.has('restore_production_branch_backup') || accesses.has('restore_production_branch_backups'),
      'existing_token_missing_restore_production_branch_backup');
    if (!this.#cleanupOnly) {
      const targetProduction = RESTORE.targetProduction;
      const required = typeof targetProduction === 'boolean' ? targetProduction
        ? ['connect_production_branch', 'delete_production_branch_password'] : ['connect_branch', 'delete_branch_password'] : [];
      evidence.resetPermissionAdmission = { targetProduction: typeof targetProduction === 'boolean' ? targetProduction : null,
        required, missing: required.filter(access => !accesses.has(access)), verified: false };
      await onEvidence(structuredClone(evidence));
      requireResetPermissions(accesses, targetProduction);
      evidence.resetPermissionAdmission.verified = true;
      await onEvidence(structuredClone(evidence));
    }
    if (grantDiagnosticFailure) throw grantDiagnosticFailure;
    if (requiredThrough !== undefined) requireThat(evidence.tokenLifetime.coversRequiredWindow,
      'existing_token_lifetime_insufficient_or_unverifiable');
  }
}

export class RestoreCleanupApi extends RestoreApi {
  constructor(token, fetchImpl = fetch) { super(token, fetchImpl, cleanupCapability); }
}
