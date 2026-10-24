import { createHash } from 'node:crypto';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';

export const RESTORE = Object.freeze({ organization: 'lythaus', database: 'lythaus-core', databaseId: 'hzhe0cbn6rxi',
  source: 'main', sourceId: 'vqa2g2xc9wsl', backupId: 'nxqskcldn8yk',
  recoveryPoint: '2026-10-23T14:29:11.907Z',
  target: 'lythaus-0021-native-restore-check-20261022', cluster: 'PS_5_AWS_ARM', region: 'eu-central',
  bytes: 21474836480, replicas: 0, maximumUsd: 5, maximumMs: 2 * 60 * 60 * 1000,
  qualificationStopMs: 20 * 60000, escalationMs: 45 * 60000, reviewMs: 60 * 60000, cleanupStartMs: 105 * 60000,
  setup: 'pscale_api_47syed2xlt6p', runtime: 'pscale_api_ysl604shosjg', admin: 'pscale_api_3vzps7bu44vo',
  jobs: 'pscale_api_9jfbtij9y4b2', privacy: 'pscale_api_wv7rzyuejknl',
});
export const ROLE_NAMES = Object.freeze([RESTORE.setup, RESTORE.runtime, RESTORE.admin, RESTORE.jobs, RESTORE.privacy]);
export const EXTENSIONS = Object.freeze(['pg_trgm', 'unaccent', 'pgcrypto']);
export const CREATE_TARGET_BODY = Object.freeze({ name: RESTORE.target, backup_id: RESTORE.backupId,
  restore_point: RESTORE.recoveryPoint, region: RESTORE.region, cluster_size: RESTORE.cluster, replicas: 0,
  major_version: '17', deletion_protected: false, create_database_if_missing: false,
  storage: Object.freeze({ minimum_storage_bytes: RESTORE.bytes, maximum_storage_bytes: RESTORE.bytes }) });
export const ACTIONS = Object.freeze(['restore_fixed_target', 'reset_five_copied_roles',
  'install_only_missing_named_extensions', 'retain_target_for_review', 'reserved_review_and_cost_watch']);
export const apiBase = `https://api.planetscale.com/v1/organizations/${RESTORE.organization}/databases/${RESTORE.database}`;
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const safeId = value => typeof value === 'string' && /^[a-z0-9]{1,64}$/.test(value);
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class RestoreFailure extends Error {
  constructor(code, outcome = 'BLOCKED') { super(code); this.code = code; this.outcome = outcome; }
}
export function requireThat(condition, code, outcome) { if (!condition) throw new RestoreFailure(code, outcome); }
export const failureCode = error => error instanceof RestoreFailure ? error.code : 'operation_failed_details_redacted';
const cleanupCapability = Symbol('fixed_target_cleanup');
export function approvalRecord(raw, environment, now) {
  let record;
  try { record = JSON.parse(raw); } catch { throw new RestoreFailure('explicit_owner_approval_record_required'); }
  requireThat(object(record) && Object.keys(record).sort().join(',') ===
    'actions,backupId,cleanupPermit,estimatedSubtotalUsd,expiresAt,manualOperator,maximumUsd,recoveryPointAcknowledged,reference,releaseSha,retention,reviewWindow,roles,target,taxAndFeeAllowanceUsd',
  'approval_record_fields_invalid');
  requireThat(record.releaseSha === environment.RELEASE_SHA && record.backupId === RESTORE.backupId && record.target === RESTORE.target
    && JSON.stringify(record.roles) === JSON.stringify(ROLE_NAMES) && JSON.stringify(record.actions) === JSON.stringify(ACTIONS)
    && record.maximumUsd === RESTORE.maximumUsd && record.recoveryPointAcknowledged === true,
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
  requireThat(object(permit) && Number.isSafeInteger(permit.workflowId) && permit.workflowId > 0
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
  return record;
}

export function checkBackup(backup, now) {
  requireThat(backup?.id === RESTORE.backupId && backup.database_branch?.id === RESTORE.sourceId
    && backup.database_branch.name === 'main' && backup.database_branch.deleted_at === null
    && backup.state === 'success' && backup.deleted_at === null && typeof backup.protected === 'boolean', 'backup_identity_or_state_invalid');
  const completed = Date.parse(backup.completed_at), expires = Date.parse(backup.expires_at);
  requireThat(Number.isFinite(completed) && completed <= now && now + RESTORE.maximumMs <= completed + 24 * 3600000
    && Number.isFinite(expires) && now + RESTORE.maximumMs < expires, 'backup_stale_or_test_window_too_short');
  requireThat(backup.completed_at === RESTORE.recoveryPoint, 'fixed_backup_completion_changed');
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
  requireThat(branch.cluster_name === RESTORE.cluster && branch.cluster_architecture === 'aarch64'
    && branch.region?.slug === RESTORE.region && branch.replicas === 0
    && branch.minimum_storage_bytes === RESTORE.bytes && branch.maximum_storage_bytes === RESTORE.bytes,
  'created_target_identity_or_configuration_changed');
  if (ready) requireThat(branch.ready === true && branch.state === 'ready' && branch.frozen === false, 'target_not_ready');
}

export function checkedRoles(rows, branchId, sourceRoles) {
  requireThat(Array.isArray(rows), 'copied_role_inventory_invalid');
  const result = new Map();
  for (const name of ROLE_NAMES) {
    const found = rows.filter(row => row.base_username === name);
    requireThat(found.length === 1, 'copied_role_missing_or_ambiguous');
    const row = found[0];
    requireThat(safeId(row.id) && row.branch?.id === branchId && row.branch.name === (branchId === RESTORE.sourceId ? 'main' : RESTORE.target)
      && row.branch.deleted_at === null && row.username === `${name}.${branchId}` && row.database_name === 'postgres'
      && row.ready === true && row.expired === false && row.deleted_at === null && row.disabled_at === null
      && row.dropped_at === null && row.expires_at === null && row.with_replication === false
      && Array.isArray(row.inherited_roles) && row.inherited_roles.every(item => typeof item === 'string' && /^[A-Za-z0-9_.-]+$/.test(item)),
    'copied_role_metadata_invalid');
    if (sourceRoles) requireThat(JSON.stringify([...row.inherited_roles].sort()) ===
      JSON.stringify([...sourceRoles.get(name).inherited_roles].sort()), 'copied_role_authority_changed');
    result.set(name, { id: row.id, base_username: name, username: row.username, inherited_roles: row.inherited_roles });
  }
  return result;
}

function authorityDiagnostic(token) {
  const permissions = new Set(['read_database', 'read_databases', 'read_service_tokens', 'read_branch', 'read_backups',
    'delete_branch', 'delete_production_branch', 'create_branch', 'connect_branch', 'connect_production_branch',
    'restore_backup', 'restore_production_branch_backup', 'restore_production_branch_backups']);
  const rows = token.service_token_accesses.filter(row => object(row) && permissions.has(row.access)
    && (row.resource_id === RESTORE.databaseId || row.resource?.id === RESTORE.databaseId
      || row.resource?.name === RESTORE.database || row.resource_name === RESTORE.database
      || row.resource?.name === RESTORE.organization || row.resource_name === RESTORE.organization || row.resource == null));
  return {
    version: 1, databaseId: RESTORE.databaseId,
    tokenMatchesCodeXToken: token.id === 'estjkwtxzsmh', tokenMatchesOtherKnownToken: token.id === 'v6pg9b7rz38a',
    accessRowCount: token.service_token_accesses.length, relevantRowCount: rows.length, rowsTruncated: rows.length > 64,
    rows: rows.slice(0, 64).map(row => ({
      access: row.access,
      resourceIdMatchesDatabase: row.resource_id === RESTORE.databaseId,
      resourceIdMissing: !Object.hasOwn(row, 'resource_id'), resourceIdNull: row.resource_id === null,
      nestedIdMatchesDatabase: row.resource?.id === RESTORE.databaseId,
      nestedNameMatchesDatabase: row.resource?.name === RESTORE.database,
      nestedNameMatchesOrganization: row.resource?.name === RESTORE.organization,
      resourceNameMatchesDatabase: row.resource_name === RESTORE.database,
      resourceNameMatchesOrganization: row.resource_name === RESTORE.organization,
      resourceTypeIsDatabase: typeof row.resource_type === 'string' && row.resource_type.toLowerCase() === 'database',
      resourceTypeIsOrganization: typeof row.resource_type === 'string' && row.resource_type.toLowerCase() === 'organization',
      resourceMissing: !Object.hasOwn(row, 'resource'), resourceNull: row.resource === null,
      deletedAtMissing: !object(row.resource) || !Object.hasOwn(row.resource, 'deleted_at'),
      deletedAtNull: row.resource?.deleted_at === null,
    })),
  };
}

export class RestoreApi {
  #cleanupOnly;
  constructor(token, fetchImpl = fetch, capability) {
    try { this.authorization = planetScaleServiceTokenAuthorizationHeader(token); }
    catch { throw new RestoreFailure('existing_service_token_pair_required'); }
    this.tokenId = this.authorization.split(':')[0]; this.fetchImpl = fetchImpl;
    this.#cleanupOnly = capability === cleanupCapability;
  }
  async request(path, { method = 'GET', body, absent = false } = {}) {
    const target = `/branches/${RESTORE.target}`, backup = `/branches/main/backups/${RESTORE.backupId}`;
    const getAllowed = ['', '/branches/main', target, backup, '/../service-tokens/self'].includes(path)
      || /^\/branches(?:\/main\/roles)?\?page=[1-5]&per_page=100$/.test(path)
      || new RegExp(`^${target}/roles\\?page=[1-5]&per_page=100$`).test(path);
    const writeAllowed = this.#cleanupOnly
      ? method === 'DELETE' && path === target && body === undefined
      : (method === 'POST' && path === '/branches' && JSON.stringify(body) === JSON.stringify(CREATE_TARGET_BODY))
        || (method === 'POST' && new RegExp(`^${target}/roles/[a-z0-9]{1,64}/reset$`).test(path) && body === undefined);
    requireThat((method === 'GET' && getAllowed && body === undefined) || writeAllowed, 'fixed_provider_operation_required');
    const url = path.startsWith('/../service-tokens/')
      ? `https://api.planetscale.com/v1/organizations/${RESTORE.organization}/service-tokens/${this.tokenId}` : apiBase + path;
    let response;
    try {
      response = await this.fetchImpl(url, { method, redirect: 'error', cache: 'no-store',
        headers: { authorization: this.authorization, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    } catch { throw new RestoreFailure('provider_transport_failed', method === 'GET' ? 'BLOCKED' : 'UNKNOWN_MUTATION_OUTCOME'); }
    requireThat(response.redirected !== true && (!response.url || response.url === url), 'provider_redirect_rejected',
      method === 'GET' ? 'BLOCKED' : 'UNKNOWN_MUTATION_OUTCOME');
    if (method === 'GET' && absent && response.status === 404) return null;
    requireThat(response.status >= 200 && response.status < 300,
      [401, 403].includes(response.status) ? 'provider_access_denied' : 'provider_request_failed',
      method === 'GET' || [400, 401, 403, 404, 409, 422].includes(response.status) ? 'DENIED' : 'UNKNOWN_MUTATION_OUTCOME');
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
  async list(path) {
    const rows = []; let total;
    for (let page = 1; page <= 5; page++) {
      const value = await this.request(`${path}?page=${page}&per_page=100`);
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
  async authority(onEvidence = () => {}) {
    const database = await this.request('');
    requireThat(database.id === RESTORE.databaseId && database.name === RESTORE.database && database.kind === 'postgresql', 'database_identity_changed');
    const token = await this.request('/../service-tokens/self');
    requireThat(token.id === this.tokenId && Array.isArray(token.service_token_accesses), 'existing_token_authority_unverifiable');
    await onEvidence(authorityDiagnostic(token));
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
  }
}

export class RestoreCleanupApi extends RestoreApi {
  constructor(token, fetchImpl = fetch) { super(token, fetchImpl, cleanupCapability); }
}
