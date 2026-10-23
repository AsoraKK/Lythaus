import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';

export const RESTORE_INVENTORY_TARGET = Object.freeze({
  organization: 'lythaus', database: 'lythaus-core', branch: 'main', branchId: 'vqa2g2xc9wsl',
  accountId: 'e5b7ae46e04698f507b7e4b3d4ef1af0',
  originFingerprint: '1a6d36f2356945f571c13ad979e60bcd4b5203cd371f0d6e3e293da74c088f3a',
});
const bindings = Object.freeze([
  ['lythaus_runtime', '3e59f07db51345aa896333ca861d1adf', 'lythaus-db-app-dev'],
  ['lythaus_admin', '6bfbb0eab42642e8ad294dbf59294ed3', 'lythaus-db-admin-dev'],
  ['lythaus_privacy', 'bae909aa72e244bfa9b8ca8a948053b6', 'lythaus-db-privacy-dev'],
  ['lythaus_jobs', '442bb04b99004cb38c6974ec031d65ee', 'lythaus-db-jobs-dev'],
]);
const base = 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core/branches/main';
const grantVerifiedAt = '2026-10-23T07:53:08.000Z';
const maxPages = 5;
const pageSize = 100;
const maxBodyBytes = 1024 * 1024;
const safeId = value => typeof value === 'string' && /^[a-z0-9]{1,64}$/.test(value);
const safeRole = value => typeof value === 'string' && /^pscale_api_[a-z0-9]{1,64}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
class InventoryFailure extends Error {}
function requireThat(value, code) { if (!value) throw new InventoryFailure(code); }

function timestamp(value, required = false) {
  if (value === null || value === undefined) {
    requireThat(!required, 'backup_timestamp_invalid');
    return null;
  }
  requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value), 'backup_timestamp_invalid');
  const time = Date.parse(value);
  requireThat(Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19), 'backup_timestamp_invalid');
  return new Date(time).toISOString();
}

async function readJson(url, authorization, stage, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { authorization, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  } catch { throw new InventoryFailure(`${stage}_transport_failed`); }
  requireThat(response?.status === 200, `${stage}_http_${[401, 403, 429].includes(response?.status) ? response.status : 'failed'}`);
  requireThat(response.redirected !== true && (!response.url || response.url === url), `${stage}_redirect_rejected`);
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      requireThat(size <= maxBodyBytes, `${stage}_response_too_large`);
      chunks.push(chunk);
    }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    requireThat(object(value), `${stage}_response_invalid`);
    return value;
  } catch (error) {
    if (error instanceof InventoryFailure) throw error;
    throw new InventoryFailure(`${stage}_response_invalid`);
  }
}

function projectBackup(row, now) {
  requireThat(object(row) && safeId(row.id) && row.database_branch?.id === RESTORE_INVENTORY_TARGET.branchId
    && row.database_branch.name === 'main' && row.database_branch.deleted_at === null
    && ['pending', 'running', 'success', 'failed', 'canceled', 'cancelled'].includes(row.state)
    && typeof row.protected === 'boolean', 'backup_metadata_invalid');
  const createdAt = timestamp(row.created_at, true);
  const startedAt = timestamp(row.started_at);
  const completedAt = timestamp(row.completed_at, row.state === 'success');
  const expiresAt = timestamp(row.expires_at);
  const deletedAt = timestamp(row.deleted_at);
  requireThat(Date.parse(createdAt) <= now && (!startedAt || Date.parse(startedAt) >= Date.parse(createdAt))
    && (!completedAt || (Date.parse(completedAt) >= Date.parse(startedAt ?? createdAt) && Date.parse(completedAt) <= now)),
  'backup_timestamp_order_invalid');
  const providerReportedSizes = {};
  for (const key of ['size', 'pvc_size', 'uncompressed_size']) {
    const value = row[key] ?? null;
    requireThat(value === null || (Number.isSafeInteger(value) && value >= 0), 'backup_size_invalid');
    providerReportedSizes[key] = value;
  }
  const successful = row.state === 'success' && deletedAt === null;
  const fresh = successful && now - Date.parse(completedAt) <= 24 * 60 * 60 * 1000
    && expiresAt !== null && Date.parse(expiresAt) > now;
  return { id: row.id, state: row.state, sourceBranchId: RESTORE_INVENTORY_TARGET.branchId,
    createdAt, startedAt, completedAt, expiresAt, deletedAt, protected: row.protected,
    providerReportedSizes, successful, fresh,
    startedAfterGrantVerification: startedAt === null ? null : Date.parse(startedAt) >= Date.parse(grantVerifiedAt),
    completedAfterGrantVerification: completedAt === null ? null : Date.parse(completedAt) >= Date.parse(grantVerifiedAt),
  };
}

async function readBackups(authorization, fetchImpl, now) {
  const rows = [], seen = new Set();
  let total;
  for (let page = 1; page <= maxPages; page++) {
    const body = await readJson(`${base}/backups?page=${page}&per_page=${pageSize}`, authorization, 'backup_inventory', fetchImpl);
    requireThat(Array.isArray(body.data) && body.data.length <= pageSize && body.current_page === page
      && Number.isSafeInteger(body.total_count) && body.total_count >= 0 && body.total_count <= maxPages * pageSize
      && Object.hasOwn(body, 'next_page'), 'backup_pagination_invalid');
    total ??= body.total_count;
    requireThat(body.total_count === total, 'backup_inventory_changed_during_collection');
    for (const row of body.data) {
      const projected = projectBackup(row, now);
      requireThat(!seen.has(projected.id), 'backup_inventory_duplicate_id');
      seen.add(projected.id);
      rows.push(projected);
    }
    if (body.next_page === null) {
      requireThat(rows.length === total, 'backup_inventory_incomplete');
      return rows.sort((a, b) => Date.parse(b.completedAt ?? b.createdAt) - Date.parse(a.completedAt ?? a.createdAt)
        || a.id.localeCompare(b.id));
    }
    requireThat(body.next_page === page + 1 && page < maxPages, 'backup_pagination_invalid');
  }
  throw new InventoryFailure('backup_inventory_incomplete');
}

async function readRoleMappings(token, roleMap, fetchImpl) {
  const rows = [];
  for (const [roleClass, hyperdriveId, name] of bindings) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${RESTORE_INVENTORY_TARGET.accountId}/hyperdrive/configs/${hyperdriveId}`;
    const body = await readJson(url, `Bearer ${token}`, 'hyperdrive_mapping', fetchImpl);
    const config = body.result, origin = config?.origin;
    requireThat(body.success === true && object(config) && object(origin) && config.id === hyperdriveId
      && config.name === name && origin.user === `${roleMap[roleClass]}.${RESTORE_INVENTORY_TARGET.branchId}`
      && ['postgres', 'postgresql'].includes(origin.scheme) && typeof origin.host === 'string'
      && origin.host.endsWith('.psdb.cloud') && origin.database === 'postgres'
      && (origin.port === 5432 || origin.port === '5432') && config.caching?.disabled === true
      && config.mtls?.sslmode === 'verify-full' && typeof config.mtls.ca_certificate_id === 'string'
      && config.mtls.ca_certificate_id.length > 0, 'hyperdrive_mapping_invalid');
    const fingerprint = createHash('sha256').update(JSON.stringify({ scheme: 'postgres', host: origin.host.toLowerCase(),
      port: 5432, database: 'postgres' })).digest('hex');
    requireThat(fingerprint === RESTORE_INVENTORY_TARGET.originFingerprint, 'hyperdrive_origin_mismatch');
    rows.push({ roleClass, sqlRole: roleMap[roleClass], hyperdriveId, sourceBranchId: RESTORE_INVENTORY_TARGET.branchId });
  }
  return rows;
}

export async function collectNativeRestoreInventory({ environment = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const validTime = typeof now === 'number' && Number.isFinite(now) && Math.abs(now) <= 8.64e15;
  const sourceMainSha = typeof environment.RELEASE_SHA === 'string' && /^[a-f0-9]{40}$/.test(environment.RELEASE_SHA)
    ? environment.RELEASE_SHA : null;
  const report = { mode: 'read-only-native-restore-inventory', sourceMainSha,
    generatedAt: validTime ? new Date(now).toISOString() : null,
    target: { organization: 'lythaus', database: 'lythaus-core', branch: 'main', branchId: RESTORE_INVENTORY_TARGET.branchId },
    databaseWrites: false, providerMutations: false, credentialsCreated: false,
    status: 'BLOCKED', blockers: [], backups: [], roleMappings: [],
    grantReference: { runId: '39917326612', verifiedAt: grantVerifiedAt, restoredGrantPresence: 'NOT_VERIFIED' },
    limitations: [
      'Collection and freshness are metadata only; no backup is selected, protected, restored or qualified.',
      'Provider size fields are unchanged numeric metadata; units and billable backup/WAL usage must be established before costing.',
      'Backup start/completion comparisons do not establish its exact recovery point or the presence of committed grants.',
      'Only four canonical application identities are mapped live; copied verifier/administrator identities still require restored-target verification.',
    ],
  };
  try {
    requireThat(sourceMainSha !== null && validTime, 'release_or_collection_time_invalid');
    let authorization;
    try { authorization = planetScaleServiceTokenAuthorizationHeader(environment.PLANETSCALE_API_TOKEN); }
    catch { throw new InventoryFailure('existing_planetscale_service_token_invalid'); }
    const token = environment.CLOUDFLARE_API_TOKEN;
    requireThat(typeof token === 'string' && token.length > 0 && token.length <= 4096 && !/[\s\x00-\x1f\x7f]/.test(token),
      'existing_cloudflare_token_invalid');
    let roleMap;
    try { roleMap = JSON.parse(environment.PSCALE_ROLE_IDENTIFIERS); }
    catch { throw new InventoryFailure('canonical_role_map_invalid'); }
    requireThat(object(roleMap) && bindings.every(([key]) => safeRole(roleMap[key])), 'canonical_role_map_invalid');
    const branch = await readJson(base, authorization, 'source_branch', fetchImpl);
    requireThat(branch.id === RESTORE_INVENTORY_TARGET.branchId && branch.name === 'main'
      && branch.kind === 'postgresql' && branch.deleted_at === null, 'source_branch_mismatch');
    const backups = await readBackups(authorization, fetchImpl, now);
    const roleMappings = await readRoleMappings(token, roleMap, fetchImpl);
    return { ...report, status: 'INVENTORY_COLLECTED_NOT_RESTORE_ACCEPTANCE', backups, roleMappings,
      freshestSuccessfulBackupId: backups.find(row => row.successful)?.id ?? null,
      freshestFreshSuccessfulBackupId: backups.find(row => row.fresh)?.id ?? null,
      freshestProtectedFreshBackupId: backups.find(row => row.fresh && row.protected)?.id ?? null };
  } catch (error) {
    report.blockers = [error instanceof InventoryFailure ? error.message : 'inventory_collection_failed_details_redacted'];
    return report;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await collectNativeRestoreInventory();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.blockers.length === 0 ? 0 : 1;
}
