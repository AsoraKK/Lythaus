import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';

const ORGANIZATION = 'lythaus';
const DATABASE = 'lythaus-new-core';
const DATABASE_ID = '87dbkhprjh30';
const BRANCH = 'main';
const BRANCH_ID = 'xwkb9quljkzd';
const LOGICAL_DATABASE = 'postgres';
const REGION = {
  provider: 'AWS',
  display_name: 'AWS eu-central-1',
  location: 'Frankfurt',
  slug: 'eu-central',
};
const API_BASE = 'https://api.planetscale.com/v1';
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const ROLE_LABELS = [
  'lythaus_runtime',
  'lythaus_admin',
  'lythaus_jobs',
  'lythaus_privacy',
  'lythaus_migrations',
  'lythaus_verifier',
];
const REPORTABLE_PG_ROLES = new Set([
  'pg_checkpoint',
  'pg_create_subscription',
  'pg_database_owner',
  'pg_execute_server_program',
  'pg_maintain',
  'pg_monitor',
  'pg_read_all_data',
  'pg_read_all_settings',
  'pg_read_all_stats',
  'pg_read_server_files',
  'pg_signal_backend',
  'pg_stat_scan_tables',
  'pg_use_reserved_connections',
  'pg_write_all_data',
  'pg_write_server_files',
]);
const RECOGNIZED_DATABASE_KINDS = new Set(['postgresql', 'postgres', 'mysql', 'vitess']);
const RECOGNIZED_RESOURCE_STATES = new Set(['ready', 'creating', 'sleeping', 'starting', 'deleting', 'deleted']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function blocked(sourceSha, code, httpStatus = null) {
  return {
    status: 'READ_ONLY_ROLE_INVENTORY_BLOCKED',
    sourceSha,
    httpStatus,
    code,
    databaseId: DATABASE_ID,
    branchId: BRANCH_ID,
  };
}

function valueType(object, key) {
  if (!Object.hasOwn(object ?? {}, key)) return 'missing';
  const value = object[key];
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function recognizedValue(value, known) {
  if (typeof value !== 'string') return value === undefined ? 'missing' : 'nonstring';
  const normalized = value.toLowerCase();
  return known.has(normalized) ? normalized : 'other';
}

function databaseFieldEvidence(database) {
  const region = database.region;
  const regionObject = !!region && typeof region === 'object' && !Array.isArray(region);
  const deletedAtPresent = Object.hasOwn(database, 'deleted_at');
  const deletedAtNull = deletedAtPresent ? database.deleted_at === null : null;
  const kindClass = recognizedValue(database.kind, RECOGNIZED_DATABASE_KINDS);
  const stateClass = recognizedValue(database.state, RECOGNIZED_RESOURCE_STATES);
  return {
    idPresent: Object.hasOwn(database, 'id'),
    idType: valueType(database, 'id'),
    idMatch: database.id === DATABASE_ID,
    namePresent: Object.hasOwn(database, 'name'),
    nameType: valueType(database, 'name'),
    nameMatch: database.name === DATABASE,
    kindPresent: Object.hasOwn(database, 'kind'),
    kindType: valueType(database, 'kind'),
    kindClass,
    kindMatch: database.kind === 'postgresql',
    readyPresent: Object.hasOwn(database, 'ready'),
    readyType: valueType(database, 'ready'),
    readyMatch: database.ready === true,
    statePresent: Object.hasOwn(database, 'state'),
    stateType: valueType(database, 'state'),
    stateClass,
    stateMatch: database.state === 'ready',
    deletedAtPresent,
    deletedAtType: valueType(database, 'deleted_at'),
    deletedAtNull,
    deletedAtAllowed: !deletedAtPresent || database.deleted_at === null,
    regionPresent: Object.hasOwn(database, 'region'),
    regionType: valueType(database, 'region'),
    regionObject: regionObject,
    regionProviderMatch: regionObject && region.provider === REGION.provider,
    regionDisplayNameMatch: regionObject && region.display_name === REGION.display_name,
    regionLocationMatch: regionObject && region.location === REGION.location,
    regionSlugMatch: regionObject && region.slug === REGION.slug,
  };
}

function branchFieldEvidence(branch) {
  const kindClass = recognizedValue(branch.kind, RECOGNIZED_DATABASE_KINDS);
  const stateClass = recognizedValue(branch.state, RECOGNIZED_RESOURCE_STATES);
  const clusterNameClass = branch.cluster_name === 'PS_5_AWS_ARM' ? 'PS_5_AWS_ARM'
    : typeof branch.cluster_name === 'string' ? 'other' : branch.cluster_name === undefined ? 'missing' : 'nonstring';
  return {
    idPresent: Object.hasOwn(branch, 'id'),
    idType: valueType(branch, 'id'),
    idMatch: branch.id === BRANCH_ID,
    namePresent: Object.hasOwn(branch, 'name'),
    nameType: valueType(branch, 'name'),
    nameMatch: branch.name === BRANCH,
    kindPresent: Object.hasOwn(branch, 'kind'),
    kindType: valueType(branch, 'kind'),
    kindClass,
    kindMatch: branch.kind === 'postgresql',
    readyPresent: Object.hasOwn(branch, 'ready'),
    readyType: valueType(branch, 'ready'),
    readyMatch: branch.ready === true,
    statePresent: Object.hasOwn(branch, 'state'),
    stateType: valueType(branch, 'state'),
    stateClass,
    stateMatch: branch.state === 'ready',
    deletedAtPresent: Object.hasOwn(branch, 'deleted_at'),
    deletedAtType: valueType(branch, 'deleted_at'),
    deletedAtNull: branch.deleted_at === null,
    clusterNamePresent: Object.hasOwn(branch, 'cluster_name'),
    clusterNameType: valueType(branch, 'cluster_name'),
    clusterNameClass,
    clusterNameMatch: branch.cluster_name === 'PS_5_AWS_ARM',
    clusterArchitecturePresent: Object.hasOwn(branch, 'cluster_architecture'),
    clusterArchitectureType: valueType(branch, 'cluster_architecture'),
    clusterDisplayNamePresent: Object.hasOwn(branch, 'cluster_display_name'),
    clusterDisplayNameType: valueType(branch, 'cluster_display_name'),
    replicasPresent: Object.hasOwn(branch, 'replicas'),
    replicasType: valueType(branch, 'replicas'),
    replicasZero: branch.replicas === 0,
    databaseIdPresent: Object.hasOwn(branch, 'database_id'),
    databaseIdMatch: !Object.hasOwn(branch, 'database_id') || branch.database_id === DATABASE_ID,
  };
}

async function boundedJson(response, expectedUrl) {
  if (!response || response.status !== 200 || response.redirected === true
    || (response.url && response.url !== expectedUrl) || !response.body) {
    return { error: 'provider_http_status_not_ok', httpStatus: response?.status ?? null };
  }
  const announcedBytes = Number(response.headers.get('content-length'));
  if (Number.isFinite(announcedBytes) && announcedBytes > MAX_RESPONSE_BYTES) {
    return { error: 'provider_response_too_large', httpStatus: response.status };
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > MAX_RESPONSE_BYTES) return { error: 'provider_response_too_large', httpStatus: response.status };
      chunks.push(Buffer.from(chunk));
    }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { error: 'provider_response_invalid', httpStatus: response.status };
    }
    return { value, httpStatus: response.status };
  } catch {
    return { error: 'provider_response_invalid', httpStatus: response.status };
  }
}

export async function inspectNewCorePlanetScaleRoles({
  token = process.env.PLANETSCALE_API_TOKEN,
  sourceSha = process.env.GITHUB_SHA,
  expectedOriginUsernameSha256 = process.env.LYTHAUS_NEW_CORE_EXPECTED_ORIGIN_USERNAME_SHA256,
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  const validSourceSha = typeof sourceSha === 'string' && /^[a-f0-9]{40}$/.test(sourceSha) ? sourceSha : null;
  if (!validSourceSha) return blocked(null, 'source_sha_unavailable');
  let authorization;
  try {
    authorization = planetScaleServiceTokenAuthorizationHeader(token ?? '');
  } catch {
    return blocked(validSourceSha, 'planetscale_service_token_pair_unavailable');
  }

  const databaseUrl = `${API_BASE}/organizations/${ORGANIZATION}/databases/${DATABASE}`;
  const base = `${databaseUrl}/branches/${BRANCH}`;
  const request = async (url) => {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
        headers: { authorization, accept: 'application/json' },
      });
    } catch {
      return { error: 'planetscale_get_failed', httpStatus: null };
    }
    return boundedJson(response, url);
  };

  const databaseResponse = await request(databaseUrl);
  if (databaseResponse.error) return blocked(validSourceSha, databaseResponse.error, databaseResponse.httpStatus);
  const database = databaseResponse.value;
  const region = database.region;
  const databaseFields = databaseFieldEvidence(database);
  const regionMatches = databaseFields.regionObject && databaseFields.regionProviderMatch
    && databaseFields.regionDisplayNameMatch && databaseFields.regionLocationMatch && databaseFields.regionSlugMatch;
  const databaseMatches = database.id === DATABASE_ID && database.name === DATABASE
    && database.kind === 'postgresql' && database.ready === true && database.state === 'ready'
    && databaseFields.deletedAtAllowed && regionMatches;
  if (!databaseMatches) {
    return {
      ...blocked(validSourceSha, 'new_core_database_identity_mismatch', databaseResponse.httpStatus),
      databaseFields,
    };
  }

  const branchResponse = await request(base);
  if (branchResponse.error) return blocked(validSourceSha, branchResponse.error, branchResponse.httpStatus);
  const branch = branchResponse.value;
  const branchFields = branchFieldEvidence(branch);
  const branchMatches = branch.id === BRANCH_ID && branch.name === BRANCH && branch.kind === 'postgresql'
    && branch.deleted_at === null && branch.ready === true && branch.state === 'ready'
    && branch.cluster_name === 'PS_5_AWS_ARM' && branch.replicas === 0
    && (!Object.hasOwn(branch, 'database_id') || branch.database_id === DATABASE_ID);
  if (!branchMatches) {
    return {
      ...blocked(validSourceSha, 'new_core_branch_identity_mismatch', branchResponse.httpStatus),
      branchFields,
      databaseFields,
    };
  }

  const rows = [];
  const ids = new Set();
  const usernames = new Set();
  let totalCount;
  let httpStatus = branchResponse.httpStatus;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${base}/roles?page=${page}&per_page=${PAGE_SIZE}`;
    const pageResponse = await request(url);
    if (pageResponse.error) return blocked(validSourceSha, pageResponse.error, pageResponse.httpStatus);
    httpStatus = pageResponse.httpStatus;
    const payload = pageResponse.value;
    if (payload.current_page !== page || !Number.isSafeInteger(payload.total_count)
      || payload.total_count < 0 || payload.total_count > MAX_PAGES * PAGE_SIZE
      || !Array.isArray(payload.data) || payload.data.length > PAGE_SIZE
      || !Object.hasOwn(payload, 'next_page')) return blocked(validSourceSha, 'role_pagination_invalid', httpStatus);
    totalCount ??= payload.total_count;
    if (payload.total_count !== totalCount) return blocked(validSourceSha, 'role_inventory_changed', httpStatus);
    for (const row of payload.data) {
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !/^[a-z0-9]{1,64}$/.test(row.id)
        || typeof row.base_username !== 'string' || !/^pscale_api_[a-z0-9]{1,64}$/.test(row.base_username)
        || row.username !== `${row.base_username}.${BRANCH_ID}` || !Array.isArray(row.inherited_roles)
        || ids.has(row.id) || usernames.has(row.base_username)) {
        return blocked(validSourceSha, 'role_metadata_invalid', httpStatus);
      }
      ids.add(row.id);
      usernames.add(row.base_username);
      rows.push(row);
    }
    if (payload.next_page === null) {
      if (rows.length !== totalCount) return blocked(validSourceSha, 'role_pagination_incomplete', httpStatus);
      break;
    }
    if (payload.next_page !== page + 1 || page === MAX_PAGES) {
      return blocked(validSourceSha, 'role_pagination_incomplete', httpStatus);
    }
  }
  if (rows.length !== totalCount) return blocked(validSourceSha, 'role_pagination_incomplete', httpStatus);

  const seenLabels = new Set();
  let canonicalLabelCount = 0;
  let duplicateLabelCount = 0;
  let activeCanonicalRoleCount = 0;
  let inheritedRoleCount = 0;
  let reportableInheritedPgRoleCount = 0;
  let unlistedInheritedRoleCount = 0;
  let originRoleMatchCount = 0;
  const inheritedPgRoleNames = new Set();
  const validExpectedOriginSha = typeof expectedOriginUsernameSha256 === 'string'
    && /^[a-f0-9]{64}$/.test(expectedOriginUsernameSha256) ? expectedOriginUsernameSha256 : null;
  const roleSummaries = rows.map((row) => {
    const candidateLabel = row.name ?? row.label;
    const label = ROLE_LABELS.includes(candidateLabel) ? candidateLabel : null;
    const duplicateLabel = label !== null && seenLabels.has(label);
    if (label !== null) {
      canonicalLabelCount += 1;
      if (duplicateLabel) duplicateLabelCount += 1;
      seenLabels.add(label);
    }
    const branchMatch = row.branch?.id === BRANCH_ID && row.branch?.name === BRANCH && row.branch?.deleted_at === null;
    const ready = row.ready === true;
    const deleted = row.deleted_at !== null;
    const databaseMatch = row.database_name === LOGICAL_DATABASE;
    const expiresAt = row.expires_at;
    const notExpired = expiresAt === null || (typeof expiresAt === 'string'
      && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > now);
    const inherited = row.inherited_roles;
    const reportablePgRoles = inherited.filter((role) => typeof role === 'string' && REPORTABLE_PG_ROLES.has(role));
    inheritedRoleCount += inherited.length;
    reportableInheritedPgRoleCount += reportablePgRoles.length;
    unlistedInheritedRoleCount += inherited.length - reportablePgRoles.length;
    for (const role of reportablePgRoles) inheritedPgRoleNames.add(role);
    if (label !== null && !duplicateLabel && branchMatch && ready && !deleted && databaseMatch && notExpired) {
      activeCanonicalRoleCount += 1;
    }
    const baseUsernameSha256 = sha256(row.base_username);
    const usernameSha256 = sha256(row.username);
    const matchesHyperdriveOrigin = validExpectedOriginSha !== null && usernameSha256 === validExpectedOriginSha;
    if (matchesHyperdriveOrigin) originRoleMatchCount += 1;
    return {
      canonicalLabel: label,
      roleIdSha256: sha256(row.id),
      baseUsernameSha256,
      usernameSha256,
      matchesHyperdriveOrigin,
      branchMatch,
      ready,
      deleted,
      databaseMatch,
      notExpired,
      inheritedRoleCount: inherited.length,
      reportableInheritedPgRoles: reportablePgRoles,
      unlistedInheritedRoleCount: inherited.length - reportablePgRoles.length,
    };
  });

  const inventoryMatches = rows.length === ROLE_LABELS.length && canonicalLabelCount === ROLE_LABELS.length
    && duplicateLabelCount === 0 && ROLE_LABELS.every((label) => seenLabels.has(label))
    && activeCanonicalRoleCount === ROLE_LABELS.length && roleSummaries.every((role) => role.branchMatch)
    && roleSummaries.every((role) => role.databaseMatch) && inheritedRoleCount === 0;
  const hyperdriveRoleClass = originRoleMatchCount === 1
    ? roleSummaries.find((role) => role.matchesHyperdriveOrigin)?.canonicalLabel ?? null
    : null;
  const originRoleMatches = validExpectedOriginSha === null || originRoleMatchCount === 1;
  const regionMetadata = regionMatches ? 'AWS eu-central-1 Frankfurt' : 'unverified';
  return {
    status: inventoryMatches && originRoleMatches ? 'READ_ONLY_ROLE_INVENTORY_PASS' : 'READ_ONLY_ROLE_INVENTORY_BLOCKED',
    sourceSha: validSourceSha,
    httpStatus,
    organization: ORGANIZATION,
    database: DATABASE,
    databaseId: DATABASE_ID,
    region: regionMetadata,
    databaseMatch: databaseMatches,
    databaseFields,
    branch: BRANCH,
    branchId: BRANCH_ID,
    branchMatch: true,
    branchFields,
    logicalDatabase: LOGICAL_DATABASE,
    roleCount: rows.length,
    expectedRoleCount: ROLE_LABELS.length,
    canonicalLabelCount,
    duplicateLabelCount,
    activeCanonicalRoleCount,
    inheritedRoleCount,
    reportableInheritedPgRoleCount,
    inheritedPgRoleNames: [...inheritedPgRoleNames].sort(),
    unlistedInheritedRoleCount,
    hyperdriveOriginUsernameMatchCount: originRoleMatchCount,
    hyperdriveOriginRoleClass: hyperdriveRoleClass,
    hyperdriveOriginRoleMatch: validExpectedOriginSha === null ? null : originRoleMatchCount === 1,
    inventoryMatches,
    roles: roleSummaries,
  };
}

async function main() {
  const result = await inspectNewCorePlanetScaleRoles();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== 'READ_ONLY_ROLE_INVENTORY_PASS') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stdout.write(`${JSON.stringify(blocked(
      /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA : null,
      'planetscale_inspector_failed',
    ))}\n`);
    process.exitCode = 1;
  });
}
