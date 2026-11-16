import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { assertNewCoreEmptyCatalog } from './lythaus-new-core-empty-catalog.mjs';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';
import { branchQualifiedDatabaseTarget, buildPlanetScaleTargetIdentity, assertConnectedAdminDatabaseTarget, adminDatabaseConnectionConfig } from './planetscale-0021-target-identity.mjs';
import {
  NEW_CORE_ROLE_LABELS,
  NEW_CORE_LOGIN_ROLE_LABELS,
  NEW_CORE_DEFERRED_ROLE_LABELS,
  validateNewCoreRoleMap,
  verifyNewCoreRoleMemberships,
} from './lythaus-new-core-role-profile.mjs';
import {
  NEW_CORE_ENVIRONMENT,
  NEW_CORE_REPOSITORY,
  NEW_CORE_OUTPUT_SECRET_NAMES,
  verifyNewCoreEnvironment,
  assertNewCoreDispatchContext,
} from './lythaus-new-core-environment-plan.mjs';

const { Client } = pg;
const ROOT = process.cwd();
const TARGET_PATH = 'infrastructure/planetscale/lythaus-new-core-clean-install.target.json';
const EXPECTED_PROVIDER = Object.freeze({
  organization: 'lythaus',
  database: 'lythaus-new-core',
  databaseId: '87dbkhprjh30',
  branch: 'main',
  branchId: 'xwkb9quljkzd',
  region: 'eu-central',
  cluster: 'PS-5 aarch64',
  logicalDatabase: 'postgres',
  postgresMajor: 17,
});
const API_BASE = 'https://api.planetscale.com/v1';
const GH_API_BASE = 'https://api.github.com';
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const HISTORICAL_PRESERVED_ROLE_HASHES = Object.freeze({
  id: '53b6a1e60ecb50cb1441d8d70a23882f6080ad81dd3561861d4507543a94ebf6',
  baseUsername: '5ec5869063de36dc8efa6bfb10e0ed226207d4299c1f0a69c61a24adf4fc289a',
  username: '0a63555f1de68fd83e5c4517b18acfec36c4528d5a1db76a627807d8f2cd6042',
});
const SECRET_NAMES = Object.freeze({
  canary: 'LYTHAUS_NEW_CORE_DELIVERY_CANARY',
  migrations: 'LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL',
  admin: 'LYTHAUS_NEW_CORE_ADMIN_DATABASE_URL',
  verifier: 'LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL',
  roleMap: 'LYTHAUS_NEW_CORE_ROLE_IDENTIFIERS',
});

function fail(code) {
  throw new Error(code);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonHash(value) {
  return sha256(JSON.stringify(value));
}

function safeCode(error, fallback = 'new_core_role_provisioning_failed') {
  return error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : fallback;
}

function readTarget(root = ROOT) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, TARGET_PATH), 'utf8'));
  } catch {
    fail('new_core_target_manifest_unavailable');
  }
}

export function validateNewCoreProvisioningTarget(target) {
  const provider = target?.provider;
  if (!provider || provider.organization !== EXPECTED_PROVIDER.organization
    || provider.database !== EXPECTED_PROVIDER.database || provider.databaseId !== EXPECTED_PROVIDER.databaseId
    || provider.branch !== EXPECTED_PROVIDER.branch || provider.branchId !== EXPECTED_PROVIDER.branchId
    || provider.region !== EXPECTED_PROVIDER.region || provider.cluster !== EXPECTED_PROVIDER.cluster
    || provider.logicalDatabase !== EXPECTED_PROVIDER.logicalDatabase
    || provider.requiredPostgresMajor !== EXPECTED_PROVIDER.postgresMajor
    || !/^[a-f0-9]{64}$/.test(provider.sqlOriginFingerprint ?? '')) {
    fail('new_core_target_manifest_identity_mismatch');
  }
  return provider.sqlOriginFingerprint;
}

function assertExecutionContext(environment, sourceSha, actualHeadSha) {
  assertNewCoreDispatchContext(environment, sourceSha);
  if (actualHeadSha !== sourceSha) {
    fail('new_core_candidate_context_not_approved');
  }
}

function parseSecretNames(value) {
  if (!Array.isArray(value?.secrets) || value.secrets.length > 100
    || value.total_count !== value.secrets.length) fail('new_core_environment_secret_inventory_invalid');
  const names = value.secrets.map((item) => item?.name);
  if (names.some((name) => typeof name !== 'string' || !/^LYTHAUS_NEW_CORE_[A-Z0-9_]{1,100}$/.test(name))
    || new Set(names).size !== names.length) fail('new_core_environment_secret_inventory_invalid');
  return names;
}

async function boundedJson(response, expectedUrl, expectedStatuses = [200]) {
  if (!response || !expectedStatuses.includes(response.status) || response.redirected === true
    || (response.url && response.url !== expectedUrl) || !response.body) {
    return { status: response?.status ?? null, value: null };
  }
  try {
    const length = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) return { status: response.status, value: null };
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > MAX_RESPONSE_BYTES) return { status: response.status, value: null };
      chunks.push(Buffer.from(chunk));
    }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: response.status, value: null };
    return { status: response.status, value,
      hasNextLink: /rel\s*=\s*"next"/i.test(response.headers?.get?.('link') ?? '') };
  } catch {
    return { status: response.status, value: null };
  }
}

async function requestJson(fetchImpl, url, { method = 'GET', headers, body } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { accept: 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    fail(method === 'GET' ? 'new_core_provider_preflight_unavailable' : 'new_core_provider_role_create_failed');
  }
  const parsed = await boundedJson(response, url, method === 'GET' ? [200] : [200, 201]);
  if (!parsed.value) fail(method === 'GET' ? 'new_core_provider_preflight_unavailable' : 'new_core_provider_role_create_failed');
  return parsed.value;
}

function regionMatches(region) {
  return !!region && typeof region === 'object' && !Array.isArray(region)
    && region.provider === 'AWS' && region.display_name === 'AWS eu-central-1'
    && region.location === 'Frankfurt' && region.slug === 'eu-central';
}

function validateProviderDatabase(database) {
  if (database?.id !== EXPECTED_PROVIDER.databaseId || database?.name !== EXPECTED_PROVIDER.database
    || database?.kind !== 'postgresql' || database?.ready !== true || database?.state !== 'ready'
    || (Object.hasOwn(database, 'deleted_at') && database.deleted_at !== null)
    || !regionMatches(database.region)) fail('new_core_planetscale_database_identity_mismatch');
}

function validateProviderBranch(branch) {
  if (branch?.id !== EXPECTED_PROVIDER.branchId || branch?.name !== EXPECTED_PROVIDER.branch
    || branch?.kind !== 'postgresql' || branch?.deleted_at !== null || branch?.ready !== true
    || branch?.state !== 'ready' || branch?.cluster_name !== 'PS_5_AWS_ARM' || branch?.replicas !== 0
    || (Object.hasOwn(branch, 'database_id') && branch.database_id !== EXPECTED_PROVIDER.databaseId)) {
    fail('new_core_planetscale_branch_identity_mismatch');
  }
}

function roleRowMatchesPreservedSnapshot(row, expectedHashes = HISTORICAL_PRESERVED_ROLE_HASHES) {
  return sha256(row.id) === expectedHashes.id
    && sha256(row.base_username) === expectedHashes.baseUsername
    && sha256(row.username) === expectedHashes.username
    && row.database_name === EXPECTED_PROVIDER.logicalDatabase
    && row.ready === true && row.deleted_at === null
    && (row.expires_at === null || (Number.isFinite(Date.parse(row.expires_at)) && Date.parse(row.expires_at) > Date.now()))
    && row.branch?.id === EXPECTED_PROVIDER.branchId && row.branch?.name === EXPECTED_PROVIDER.branch
    && row.branch?.deleted_at === null && Array.isArray(row.inherited_roles) && row.inherited_roles.length === 3
    && !NEW_CORE_ROLE_LABELS.includes(row.name) && !NEW_CORE_ROLE_LABELS.includes(row.label);
}

async function readProviderRoles(fetchImpl, authorization, preservedRoleHashes = HISTORICAL_PRESERVED_ROLE_HASHES) {
  const base = `${API_BASE}/organizations/lythaus/databases/lythaus-new-core/branches/main`;
  const allRows = [];
  const seenIds = new Set();
  let totalCount;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${base}/roles?page=${page}&per_page=${PAGE_SIZE}`;
    const payload = await requestJson(fetchImpl, url, { headers: { authorization } });
    if (payload.current_page !== page || !Number.isSafeInteger(payload.total_count)
      || payload.total_count < 0 || payload.total_count > MAX_PAGES * PAGE_SIZE
      || !Array.isArray(payload.data) || payload.data.length > PAGE_SIZE
      || !Object.hasOwn(payload, 'next_page')) fail('new_core_planetscale_role_inventory_invalid');
    totalCount ??= payload.total_count;
    if (payload.total_count !== totalCount) fail('new_core_planetscale_role_inventory_changed');
    for (const row of payload.data) {
      if (!row || typeof row.id !== 'string' || !/^[a-z0-9]{1,64}$/.test(row.id)
        || typeof row.base_username !== 'string' || !/^pscale_api_[a-z0-9]{1,64}$/.test(row.base_username)
        || row.username !== `${row.base_username}.${EXPECTED_PROVIDER.branchId}`
        || !Array.isArray(row.inherited_roles) || seenIds.has(row.id)) {
        fail('new_core_planetscale_role_inventory_invalid');
      }
      seenIds.add(row.id);
      allRows.push(row);
    }
    if (payload.next_page === null) {
      if (allRows.length !== totalCount) fail('new_core_planetscale_role_inventory_incomplete');
      break;
    }
    if (payload.next_page !== page + 1 || page === MAX_PAGES) fail('new_core_planetscale_role_inventory_incomplete');
  }
  if (allRows.length !== 1 || totalCount !== 1 || !roleRowMatchesPreservedSnapshot(allRows[0], preservedRoleHashes)) {
    fail('new_core_planetscale_role_inventory_not_clean');
  }
  return { count: 1, preservedExistingRoleMatch: true };
}

async function preflightPlanetScale({ fetchImpl, serviceToken, preservedRoleHashes = HISTORICAL_PRESERVED_ROLE_HASHES }) {
  let authorization;
  try {
    authorization = planetScaleServiceTokenAuthorizationHeader(serviceToken);
  } catch {
    fail('new_core_planetscale_service_token_unavailable');
  }
  const databaseUrl = `${API_BASE}/organizations/lythaus/databases/lythaus-new-core`;
  const branchUrl = `${databaseUrl}/branches/main`;
  const database = await requestJson(fetchImpl, databaseUrl, { headers: { authorization } });
  validateProviderDatabase(database);
  const branch = await requestJson(fetchImpl, branchUrl, { headers: { authorization } });
  validateProviderBranch(branch);
  const roles = await readProviderRoles(fetchImpl, authorization, preservedRoleHashes);
  return { ...roles, databaseIdentityMatch: true, branchIdentityMatch: true };
}

function assertProvisionerUrl(raw, targetOriginSha) {
  if (typeof raw !== 'string' || raw.length === 0) fail('new_core_provisioner_database_url_unavailable');
  let url;
  let identity;
  try {
    url = new URL(raw);
    identity = branchQualifiedDatabaseTarget(raw);
  } catch {
    fail('new_core_provisioner_database_url_invalid');
  }
  if (!decodeURIComponent(url.password || '') || identity.branchId !== EXPECTED_PROVIDER.branchId
    || identity.sqlDatabaseName !== EXPECTED_PROVIDER.logicalDatabase
    || identity.originFingerprint !== targetOriginSha
    || url.searchParams.get('sslrootcert') !== 'system'
    || url.searchParams.get('sslmode') !== 'verify-full'
    || sha256(identity.username) === HISTORICAL_PRESERVED_ROLE_HASHES.username
    || sha256(identity.role) === HISTORICAL_PRESERVED_ROLE_HASHES.baseUsername) {
    fail('new_core_provisioner_database_target_mismatch');
  }
  return {
    identity,
    config: adminDatabaseConnectionConfig(raw),
    passwordSha256: sha256(decodeURIComponent(url.password)),
  };
}

function quoteIdentifier(value) {
  if (typeof value !== 'string' || !/^(?:postgres|lythaus_(?:runtime|admin|jobs|privacy|migrations|verifier)|pscale_api_[a-z0-9]{1,64})$/.test(value)) {
    fail('new_core_sql_identifier_invalid');
  }
  return `"${value.replaceAll('"', '""')}"`;
}

export function provisionerPreflightQuery() {
  return `SELECT
    current_database() AS database_name,
    current_user AS user_name,
    current_setting('server_version_num')::integer AS version_num,
    role_entry.rolcanlogin AS can_login,
    role_entry.rolsuper AS is_superuser,
    role_entry.rolcreatedb AS can_create_database,
    role_entry.rolcreaterole AS can_create_roles,
    role_entry.rolreplication AS can_replicate,
    role_entry.rolbypassrls AS bypasses_rls,
    (SELECT count(*)::integer FROM pg_auth_members membership
      WHERE membership.member = role_entry.oid OR membership.roleid = role_entry.oid) AS role_membership_count,
    (SELECT datdba = role_entry.oid FROM pg_database WHERE datname = current_database()) AS database_owner,
    has_database_privilege(current_user, current_database(), 'CONNECT WITH GRANT OPTION') AS can_grant_connect,
    has_database_privilege(current_user, current_database(), 'CREATE WITH GRANT OPTION') AS can_grant_create,
    (SELECT COALESCE(bool_or(acl.grantee = 0 AND acl.privilege_type = 'CREATE'), false)
       FROM pg_database database_entry
       CROSS JOIN LATERAL aclexplode(COALESCE(database_entry.datacl,
         acldefault('d', database_entry.datdba))) acl
      WHERE database_entry.datname = current_database()) AS public_database_create,
    (SELECT count(*)::integer FROM pg_namespace namespace_entry
      WHERE namespace_entry.nspname NOT LIKE 'pg_%'
        AND namespace_entry.nspname NOT IN ('information_schema', 'public')) AS application_schema_count,
    (SELECT count(*)::integer FROM pg_class relation_entry
      JOIN pg_namespace namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
      WHERE namespace_entry.nspname NOT LIKE 'pg_%'
        AND namespace_entry.nspname <> 'information_schema'
        AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) AS application_relation_count,
    to_regclass('system.schema_migrations') IS NULL AS migration_ledger_missing,
    (SELECT count(*)::integer FROM pg_roles WHERE rolname = ANY($1::text[])) AS canonical_sql_role_count
    FROM pg_roles role_entry
    WHERE role_entry.rolname = current_user`;
}

export async function verifyProvisionerPreconditions({ client, rawUrl, targetOriginSha, roleMap }) {
  const { identity } = assertProvisionerUrl(rawUrl, targetOriginSha);
  let session;
  try {
    session = await assertConnectedAdminDatabaseTarget(client, {
      connectionString: rawUrl,
      plannedTarget: buildPlanetScaleTargetIdentity({
        provider: {
          organization: EXPECTED_PROVIDER.organization,
          database: EXPECTED_PROVIDER.database,
          branchName: EXPECTED_PROVIDER.branch,
          branchId: EXPECTED_PROVIDER.branchId,
        },
        sql: { databaseName: EXPECTED_PROVIDER.logicalDatabase, originFingerprint: targetOriginSha },
      }),
    });
  } catch {
    fail('new_core_provisioner_connected_target_mismatch');
  }
  const response = await client.query(provisionerPreflightQuery(), [NEW_CORE_ROLE_LABELS]);
  const row = response.rows?.[0];
  if (!row || row.database_name !== EXPECTED_PROVIDER.logicalDatabase
    || ![identity.username, identity.role].includes(row.user_name)
    || Number(row.version_num) < 170000 || Number(row.version_num) >= 180000
    || row.can_login !== true || row.is_superuser !== false || row.can_create_database !== false
    || row.can_create_roles !== true || row.can_replicate !== false || row.bypasses_rls !== false
    || Number(row.role_membership_count) !== 0
    || (row.database_owner !== true && (row.can_grant_connect !== true || row.can_grant_create !== true))
    || row.public_database_create !== false
    || row.migration_ledger_missing !== true || Number(row.canonical_sql_role_count) !== 0) {
    fail('new_core_provisioner_capability_or_empty_target_mismatch');
  }
  const catalog = await assertNewCoreEmptyCatalog(client, row);
  return {
    targetIdentityMatch: true,
    postgresMajor: 17,
    connectedRoleIsSeparateFromHyperdriveRole: true,
    createRoleAuthority: true,
    databaseOwnerOrGrantOptions: true,
    unsafeProvisionerAttributes: 0,
    provisionerMemberships: 0,
    publicDatabaseCreate: false,
    cleanApplicationSchemas: true,
    cleanApplicationRelations: true,
    catalog,
    migrationLedgerAbsent: true,
    canonicalSqlRoleCount: 0,
    sqlRoleLabelsValidated: validateNewCoreRoleMap(roleMap, { local: true }) !== null,
    provisionerRoleSha256: sha256(row.user_name),
  };
}

function normalizeAccessHost(rawHost, role) {
  if (typeof rawHost !== 'string' || rawHost.length === 0 || rawHost.length > 1024) {
    fail('new_core_planetscale_role_host_invalid');
  }
  let hostUrl;
  try {
    hostUrl = new URL(rawHost.includes('://') ? rawHost : `postgresql://${rawHost}`);
  } catch {
    fail('new_core_planetscale_role_host_invalid');
  }
  if (!['postgres:', 'postgresql:'].includes(hostUrl.protocol)
    || !hostUrl.hostname.toLowerCase().endsWith('.psdb.cloud')
    || (hostUrl.port && hostUrl.port !== '5432')
    || !['', '/', '/postgres'].includes(hostUrl.pathname)
    || hostUrl.hash !== '') fail('new_core_planetscale_role_host_invalid');
  if (hostUrl.username && decodeURIComponent(hostUrl.username) !== role.username) {
    fail('new_core_planetscale_role_connection_identity_mismatch');
  }
  if (hostUrl.password && decodeURIComponent(hostUrl.password) !== role.password) {
    fail('new_core_planetscale_role_connection_identity_mismatch');
  }
  return { hostname: hostUrl.hostname.toLowerCase(), port: Number(hostUrl.port || 5432) };
}

function createRoleDatabaseUrl(role, label, targetOriginSha) {
  if (!role || (role.name ?? role.label) !== label
    || typeof role.id !== 'string' || !/^[a-z0-9]{1,64}$/.test(role.id)
    || typeof role.base_username !== 'string' || !/^pscale_api_[a-z0-9]{1,64}$/.test(role.base_username)
    || role.username !== `${role.base_username}.${EXPECTED_PROVIDER.branchId}`
    || role.database_name !== EXPECTED_PROVIDER.logicalDatabase
    || role.branch?.id !== EXPECTED_PROVIDER.branchId || role.branch?.name !== EXPECTED_PROVIDER.branch
    || role.branch?.deleted_at !== null || role.ready !== true || role.deleted_at !== null
    || !Array.isArray(role.inherited_roles) || role.inherited_roles.length !== 0
    || typeof role.password !== 'string' || role.password.length === 0 || role.password.length > 4096
    || role.expires_at !== null) {
    fail('new_core_planetscale_role_response_invalid');
  }
  const host = normalizeAccessHost(role.access_host_url, role);
  const raw = new URL(`postgresql://${encodeURIComponent(role.username)}:${encodeURIComponent(role.password)}@${host.hostname}:${host.port}/postgres`);
  raw.searchParams.set('sslmode', 'verify-full');
  raw.searchParams.set('sslrootcert', 'system');
  const connectionString = raw.toString();
  let target;
  try {
    target = branchQualifiedDatabaseTarget(connectionString);
  } catch {
    fail('new_core_planetscale_role_connection_url_invalid');
  }
  if (target.branchId !== EXPECTED_PROVIDER.branchId || target.sqlDatabaseName !== EXPECTED_PROVIDER.logicalDatabase
    || target.originFingerprint !== targetOriginSha) fail('new_core_planetscale_role_origin_mismatch');
  return {
    connectionString,
    baseUsername: role.base_username,
    roleId: role.id,
    passwordSha256: sha256(role.password),
  };
}

async function createProviderRole({ fetchImpl, authorization, label }) {
  const url = `${API_BASE}/organizations/lythaus/databases/lythaus-new-core/branches/main/roles`;
  const role = await requestJson(fetchImpl, url, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: { name: label, ttl: 0, inherited_roles: [], with_replication: false },
  });
  return role;
}

async function writeGithubEnvironmentSecret({ name, value, writerToken, spawnSyncImpl = spawnSync }) {
  if (!NEW_CORE_OUTPUT_SECRET_NAMES.includes(name) || typeof value !== 'string' || value.length === 0) {
    fail('new_core_secret_delivery_input_invalid');
  }
  const ghConfigDir = process.env.RUNNER_TEMP ? path.join(process.env.RUNNER_TEMP, 'gh-new-core-config') : undefined;
  const childEnv = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    GH_HOST: 'github.com',
    GH_TOKEN: writerToken,
    NO_COLOR: '1',
    TERM: 'dumb',
    ...(ghConfigDir ? { GH_CONFIG_DIR: ghConfigDir } : {}),
  };
  let result;
  try {
    result = spawnSyncImpl('gh', ['secret', 'set', name, '--env', NEW_CORE_ENVIRONMENT, '--repo', NEW_CORE_REPOSITORY], {
      input: value,
      encoding: 'utf8',
      stdio: ['pipe', 'ignore', 'ignore'],
      env: childEnv,
      timeout: 30_000,
      maxBuffer: 64 * 1024,
    });
  } catch {
    fail('new_core_environment_secret_write_failed');
  }
  if (result?.error || result?.status !== 0) fail('new_core_environment_secret_write_failed');
}

async function verifySecretStored({ token, name, fetchImpl }) {
  const url = `${GH_API_BASE}/repos/AsoraKK/Lythaus/environments/${NEW_CORE_ENVIRONMENT}/secrets?per_page=100&page=1`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: {
        accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
  } catch {
    fail('new_core_environment_secret_write_not_confirmed');
  }
  const parsed = await boundedJson(response, url);
  if (!parsed.value || parsed.hasNextLink) fail('new_core_environment_secret_write_not_confirmed');
  const secretNames = parseSecretNames(parsed.value);
  if (secretNames.filter((candidate) => candidate === name).length !== 1) {
    fail('new_core_environment_secret_write_not_confirmed');
  }
}

function roleMapSha256(roleMap) {
  validateNewCoreRoleMap(roleMap);
  return jsonHash(Object.fromEntries(NEW_CORE_ROLE_LABELS.map((label) => [label, roleMap[label]])));
}

function roleStatement(label, roleMap) {
  return quoteIdentifier(roleMap[label]);
}

export async function applySqlRolesAndGrants(client, roleMap, expectedProvisionerRoleSha256 = null) {
  try { validateNewCoreRoleMap(roleMap); }
  catch { fail('new_core_role_map_invalid'); }
  let beginAttempted = false;
  let transactionStarted = false;
  let commitIssued = false;
  try {
    beginAttempted = true;
    await client.query('BEGIN');
    transactionStarted = true;
    for (const label of NEW_CORE_DEFERRED_ROLE_LABELS) {
      await client.query(`CREATE ROLE ${roleStatement(label, roleMap)} NOLOGIN PASSWORD NULL NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`);
    }
    for (const label of NEW_CORE_LOGIN_ROLE_LABELS) {
      await client.query(`GRANT CONNECT ON DATABASE ${quoteIdentifier('postgres')} TO ${roleStatement(label, roleMap)}`);
    }
    await client.query(`GRANT CREATE ON DATABASE ${quoteIdentifier('postgres')} TO ${roleStatement('lythaus_migrations', roleMap)}`);
    const check = await client.query(`SELECT
    (SELECT count(*)::integer FROM pg_roles WHERE rolname = ANY($1::text[])) AS role_count,
    (SELECT count(*)::integer FROM pg_roles WHERE rolname = ANY($1::text[])
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AS unsafe_role_count,
    (SELECT count(*)::integer FROM pg_roles WHERE rolname = ANY($2::text[]) AND rolcanlogin) AS deferred_login_count,
    (SELECT count(*)::integer FROM pg_roles WHERE rolname = ANY($3::text[]) AND NOT rolcanlogin) AS login_profile_mismatch_count,
    (SELECT datdba = (SELECT oid FROM pg_roles WHERE rolname = $4)
       FROM pg_database WHERE datname = 'postgres') AS migration_database_owner,
    has_database_privilege($4, 'postgres', 'CREATE') AS migration_database_create,
    has_database_privilege($4, 'postgres', 'CREATE WITH GRANT OPTION') AS migration_database_create_grant_option,
    (SELECT count(*)::integer FROM unnest($5::text[]) AS restricted(role_name)
      WHERE has_database_privilege(restricted.role_name, 'postgres', 'CREATE')) AS restricted_database_create_count,
    (SELECT count(*)::integer FROM unnest($1::text[]) AS role_name
      WHERE role_name = ANY($6::text[]) AND has_database_privilege(role_name, 'postgres', 'CONNECT')) AS database_connect_count,
    current_user AS provisioner_role_name`,
  [Object.values(roleMap),
    NEW_CORE_DEFERRED_ROLE_LABELS.map((label) => roleMap[label]),
    NEW_CORE_LOGIN_ROLE_LABELS.map((label) => roleMap[label]), roleMap.lythaus_migrations,
    NEW_CORE_ROLE_LABELS.filter((label) => label !== 'lythaus_migrations').map((label) => roleMap[label]),
    NEW_CORE_LOGIN_ROLE_LABELS.map((label) => roleMap[label])]);
    const row = check.rows?.[0];
    if (!row || Number(row.role_count) !== NEW_CORE_ROLE_LABELS.length
      || Number(row.unsafe_role_count) !== 0 || Number(row.deferred_login_count) !== 0
      || Number(row.login_profile_mismatch_count) !== 0
      || row.migration_database_owner !== false || row.migration_database_create !== true
      || row.migration_database_create_grant_option !== false
      || Number(row.restricted_database_create_count) !== 0
      || Number(row.database_connect_count) !== NEW_CORE_LOGIN_ROLE_LABELS.length) {
      fail('new_core_database_role_postcondition_failed');
    }
    const currentRole = await client.query('SELECT current_user AS role_name');
    const provisionerRoleSha256 = sha256(currentRole.rows?.[0]?.role_name ?? '');
    if (expectedProvisionerRoleSha256 !== null && provisionerRoleSha256 !== expectedProvisionerRoleSha256) {
      fail('new_core_provisioner_identity_changed');
    }
    const membershipEvidence = await verifyNewCoreRoleMemberships(client, roleMap, provisionerRoleSha256);
    commitIssued = true;
    await client.query('COMMIT');
    transactionStarted = false;
    return {
      canonicalRoleCount: NEW_CORE_ROLE_LABELS.length,
      activeLoginRoleCount: NEW_CORE_LOGIN_ROLE_LABELS.length,
      deferredNoLoginRoleCount: NEW_CORE_DEFERRED_ROLE_LABELS.length,
      unsafeRoleAttributes: 0,
      ...membershipEvidence,
      provisionerRoleSha256,
      connectGrantedCount: NEW_CORE_LOGIN_ROLE_LABELS.length,
      migrationDatabaseCreate: true,
      migrationDatabaseOwner: false,
      migrationDatabaseCreateGrantOption: false,
      otherDatabaseCreateGrants: 0,
    };
  } catch {
    let rollbackConfirmed = !beginAttempted;
    if (beginAttempted && transactionStarted && !commitIssued) {
      try {
        await client.query('ROLLBACK');
        rollbackConfirmed = true;
      } catch {
        rollbackConfirmed = false;
      }
    }
    fail(commitIssued || !rollbackConfirmed
      ? 'new_core_database_role_transaction_outcome_unknown'
      : 'new_core_database_role_provisioning_transaction_failed');
  }
}

function sanitizedRoleEvidence(role, label) {
  return {
    label,
    roleIdSha256: sha256(role.id),
    baseUsernameSha256: sha256(role.baseUsername),
    providerRoleCreated: true,
    secretDelivered: true,
  };
}

export function emptyProvisioningReceipt({ sourceSha = null, manifestSha256 = null } = {}) {
  return {
    status: 'PREPARATION_NOT_APPLIED',
    sourceSha,
    manifestSha256,
    target: {
      organization: EXPECTED_PROVIDER.organization,
      databaseId: EXPECTED_PROVIDER.databaseId,
      branchId: EXPECTED_PROVIDER.branchId,
      logicalDatabase: EXPECTED_PROVIDER.logicalDatabase,
    },
    providerReadChecks: false,
    environmentGateChecks: false,
    provisionerPreconditions: false,
    deliveryCanaryState: 'not_attempted',
    deliveryCanaryStored: false,
    createdProviderRoleCount: 0,
    providerRolePostAttemptCount: 0,
    deliveredRoleSecretCount: 0,
    roleIdentifierSecretState: 'not_attempted',
    secretDeliveries: [],
    sqlRoleTransactionCommitted: false,
    sqlRoleTransactionOutcome: 'not_started',
    sqlRoleStateVerified: false,
    roles: [],
    secretNames: [],
    rawCredentialsIncluded: false,
  };
}

export async function provisionNewCoreRoles({
  mode = 'plan',
  environment = process.env,
  target = readTarget(),
  sourceSha = environment.GITHUB_SHA ?? null,
  actualHeadSha,
  fetchImpl = fetch,
  createClient = (config) => new Client(config),
  writeSecret = writeGithubEnvironmentSecret,
  canaryValue = crypto.randomBytes(32).toString('hex'),
  now = Date.now(),
  allowTestFixtures = false,
  preservedRoleHashes = HISTORICAL_PRESERVED_ROLE_HASHES,
} = {}) {
  const receipt = emptyProvisioningReceipt({
    sourceSha,
    manifestSha256: jsonHash(target),
  });
  if (mode !== 'provision') return receipt;
  if (allowTestFixtures !== true && jsonHash(preservedRoleHashes) !== jsonHash(HISTORICAL_PRESERVED_ROLE_HASHES)) {
    fail('new_core_test_fixture_override_forbidden');
  }
  const targetOriginSha = validateNewCoreProvisioningTarget(target);
  if (allowTestFixtures !== true) {
    const currentHead = actualHeadSha ?? (() => {
      try { return requireGitHead(); } catch { return null; }
    })();
    assertExecutionContext(environment, sourceSha, currentHead);
  }
  let roleMap = Object.fromEntries(NEW_CORE_ROLE_LABELS.map((label) => [label, label]));
  let writerToken = environment.LYTHAUS_NEW_CORE_ENVIRONMENT_WRITER_TOKEN ?? '';
  let provisionerRaw = environment.LYTHAUS_NEW_CORE_PROVISIONER_DATABASE_URL ?? '';
  const psServiceToken = environment.PLANETSCALE_API_TOKEN ?? '';
  const environmentCheck = await verifyNewCoreEnvironment({
    token: writerToken,
    sourceSha,
    environment,
    fetchImpl,
  });
  if (!environmentCheck.verified) fail('new_core_github_environment_prerequisites_incomplete');
  receipt.environmentGateChecks = true;
  if (typeof writerToken !== 'string' || writerToken.length < 20 || /[\s\x00-\x1f\x7f]/.test(writerToken)) {
    fail('new_core_environment_writer_token_unavailable');
  }
  if (typeof provisionerRaw !== 'string' || provisionerRaw.length === 0) fail('new_core_provisioner_database_url_unavailable');
  if (typeof psServiceToken !== 'string' || psServiceToken.length < 3) fail('new_core_planetscale_service_token_unavailable');

  validateNewCoreProvisioningTarget(target);
  const provisioner = assertProvisionerUrl(provisionerRaw, targetOriginSha);
  const provisionerClient = createClient(provisioner.config);
  let connected = false;
  let sqlCommitted = false;
  let canaryAttempted = false;
  let canaryState = 'not_attempted';
  let roleIdentifierSecretState = 'not_attempted';
  let sqlRoleTransactionOutcome = 'not_started';
  let provisionerRoleSha256 = null;
  const credentialPasswordHashes = new Set();
  const created = [];
  const secretDeliveries = [];
  try {
    try {
      await provisionerClient.connect();
      connected = true;
    } catch {
      fail('new_core_provisioner_connection_failed');
    }
    const provisionerEvidence = await verifyProvisionerPreconditions({
      client: provisionerClient, rawUrl: provisionerRaw, targetOriginSha, roleMap,
    });
    provisionerRoleSha256 = provisionerEvidence.provisionerRoleSha256;
    receipt.provisionerRoleSha256 = provisionerRoleSha256;
    receipt.provisionerPreconditions = true;
    credentialPasswordHashes.add(provisioner.passwordSha256);
    const providerEvidence = await preflightPlanetScale({ fetchImpl, serviceToken: psServiceToken, preservedRoleHashes });
    receipt.providerReadChecks = providerEvidence.databaseIdentityMatch && providerEvidence.branchIdentityMatch
      && providerEvidence.preservedExistingRoleMatch;

    // A noncredential write proves the encrypted environment-secret path before
    // creating one-time PlanetScale passwords. It is intentionally retained.
    canaryAttempted = true;
    canaryState = 'unknown';
    receipt.deliveryCanaryState = canaryState;
    secretDeliveries.push({ name: SECRET_NAMES.canary, outcome: 'unknown' });
    await writeSecret({ name: SECRET_NAMES.canary, value: canaryValue, writerToken });
    await verifySecretStored({ token: writerToken, name: SECRET_NAMES.canary, fetchImpl });
    canaryState = 'confirmed';
    receipt.deliveryCanaryState = canaryState;
    receipt.deliveryCanaryStored = true;
    secretDeliveries[0].outcome = 'confirmed';

    const authorization = planetScaleServiceTokenAuthorizationHeader(psServiceToken);
    for (const label of NEW_CORE_LOGIN_ROLE_LABELS) {
      const attempt = { label, id: null, baseUsername: null, providerRoleCreated: 'unknown', secretDelivery: 'not_attempted' };
      created.push(attempt);
      receipt.providerRolePostAttemptCount = created.length;
      const role = await createProviderRole({ fetchImpl, authorization, label });
      const built = createRoleDatabaseUrl(role, label, targetOriginSha);
      roleMap[label] = built.baseUsername;
      attempt.id = built.roleId;
      attempt.baseUsername = built.baseUsername;
      attempt.providerRoleCreated = 'confirmed';
      if (credentialPasswordHashes.has(built.passwordSha256)) fail('new_core_database_role_password_not_distinct');
      credentialPasswordHashes.add(built.passwordSha256);
      const secretName = label === 'lythaus_migrations' ? SECRET_NAMES.migrations
        : label === 'lythaus_admin' ? SECRET_NAMES.admin : SECRET_NAMES.verifier;
      receipt.createdProviderRoleCount = created.filter((candidate) => candidate.providerRoleCreated === 'confirmed').length;
      attempt.secretDelivery = 'unknown';
      secretDeliveries.push({ name: secretName, outcome: 'unknown' });
      await writeSecret({ name: secretName, value: built.connectionString, writerToken });
      await verifySecretStored({ token: writerToken, name: secretName, fetchImpl });
      attempt.secretDelivery = 'confirmed';
      secretDeliveries.at(-1).outcome = 'confirmed';
      receipt.deliveredRoleSecretCount += 1;
    }
    validateNewCoreRoleMap(roleMap);
    const identifiers = JSON.stringify(roleMap);
    roleIdentifierSecretState = 'unknown';
    secretDeliveries.push({ name: SECRET_NAMES.roleMap, outcome: 'unknown' });
    await writeSecret({ name: SECRET_NAMES.roleMap, value: identifiers, writerToken });
    await verifySecretStored({ token: writerToken, name: SECRET_NAMES.roleMap, fetchImpl });
    roleIdentifierSecretState = 'confirmed';
    secretDeliveries.at(-1).outcome = 'confirmed';

    const afterRoleList = await readProviderRolesAfterCreate(fetchImpl, authorization, created, now, preservedRoleHashes);
    if (!afterRoleList) fail('new_core_planetscale_role_postcondition_failed');

    sqlRoleTransactionOutcome = 'in_progress';
    const sqlEvidence = await applySqlRolesAndGrants(
      provisionerClient, roleMap, provisionerEvidence.provisionerRoleSha256,
    );
    sqlCommitted = true;
    sqlRoleTransactionOutcome = 'committed';
    receipt.sqlRoleTransactionCommitted = true;
    receipt.sqlRoleTransactionOutcome = sqlRoleTransactionOutcome;
    receipt.sqlRoleEvidence = sqlEvidence;
    receipt.provisionerRoleSha256 = provisionerRoleSha256;
    receipt.sqlRoleStateVerified = true;
    receipt.status = 'ROLE_PROVISIONING_PREPARED';
    receipt.roles = created.map((role) => sanitizedRoleEvidence(role, role.label));
    receipt.secretDeliveries = secretDeliveries;
    receipt.secretNames = secretDeliveries.map((entry) => entry.name);
    receipt.roleMapSha256 = roleMapSha256(roleMap);
    receipt.rawCredentialsIncluded = false;
    return receipt;
  } catch (error) {
    const code = safeCode(error);
    if (code === 'new_core_database_role_transaction_outcome_unknown') sqlRoleTransactionOutcome = 'unknown';
    else if (sqlRoleTransactionOutcome === 'in_progress') sqlRoleTransactionOutcome = 'rolled_back';
    receipt.status = canaryAttempted || created.length > 0 || sqlCommitted
      ? 'PARTIAL_ROLE_PROVISIONING_BLOCKED' : 'ROLE_PROVISIONING_BLOCKED_BEFORE_PROVIDER_WRITE';
    receipt.code = code;
    receipt.deliveryCanaryState = canaryState;
    receipt.deliveryCanaryStored = canaryState === 'confirmed';
    receipt.providerRolePostAttemptCount = created.length;
    receipt.createdProviderRoleCount = created.filter((role) => role.providerRoleCreated === 'confirmed').length;
    receipt.deliveredRoleSecretCount = created.filter((role) => role.secretDelivery === 'confirmed').length;
    receipt.roleIdentifierSecretState = roleIdentifierSecretState;
    receipt.sqlRoleTransactionCommitted = sqlCommitted;
    receipt.sqlRoleTransactionOutcome = sqlRoleTransactionOutcome;
    receipt.provisionerRoleSha256 = provisionerRoleSha256;
    receipt.roles = created.map((role) => ({
      label: role.label,
      ...(role.id ? { roleIdSha256: sha256(role.id) } : {}),
      ...(role.baseUsername ? { baseUsernameSha256: sha256(role.baseUsername) } : {}),
      providerRoleCreated: role.providerRoleCreated,
      secretDelivery: role.secretDelivery,
    }));
    receipt.secretDeliveries = secretDeliveries;
    receipt.secretNames = secretDeliveries.map((entry) => entry.name);
    receipt.rawCredentialsIncluded = false;
    return receipt;
  } finally {
    if (connected) await provisionerClient.end().catch(() => undefined);
  }
}

async function readProviderRolesAfterCreate(fetchImpl, authorization, created, now,
  preservedRoleHashes = HISTORICAL_PRESERVED_ROLE_HASHES) {
  const base = `${API_BASE}/organizations/lythaus/databases/lythaus-new-core/branches/main`;
  const expected = new Map(created.map((role) => [role.label, role]));
  const seen = new Set();
  let preservedCount = 0;
  let rowCount = 0;
  let total;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${base}/roles?page=${page}&per_page=${PAGE_SIZE}`;
    const payload = await requestJson(fetchImpl, url, { headers: { authorization } });
    if (!Number.isSafeInteger(payload.total_count) || payload.total_count !== 1 + NEW_CORE_LOGIN_ROLE_LABELS.length
      || !Array.isArray(payload.data) || payload.data.length > PAGE_SIZE
      || payload.current_page !== page || !Object.hasOwn(payload, 'next_page')) fail('new_core_planetscale_role_postcondition_failed');
    total ??= payload.total_count;
    if (payload.total_count !== total) fail('new_core_planetscale_role_inventory_changed');
    for (const row of payload.data) {
      rowCount += 1;
      const label = row?.name ?? row?.label;
      if (!expected.has(label)) {
        if (!roleRowMatchesPreservedSnapshot(row, preservedRoleHashes)) fail('new_core_planetscale_role_postcondition_failed');
        preservedCount += 1;
        continue;
      }
      const made = expected.get(label);
      const expired = row.expires_at !== null;
      if (row.id !== made.id || row.base_username !== made.baseUsername
        || row.username !== `${made.baseUsername}.${EXPECTED_PROVIDER.branchId}`
        || row.database_name !== 'postgres' || row.ready !== true || row.deleted_at !== null
        || row.branch?.id !== EXPECTED_PROVIDER.branchId || row.branch?.name !== 'main'
        || row.branch?.deleted_at !== null || !Array.isArray(row.inherited_roles)
        || row.inherited_roles.length !== 0 || expired || seen.has(label)) {
        fail('new_core_planetscale_role_postcondition_failed');
      }
      seen.add(label);
    }
    if (payload.next_page === null) {
      if (seen.size !== expected.size || preservedCount !== 1 || rowCount !== total) {
        fail('new_core_planetscale_role_postcondition_failed');
      }
      break;
    }
    if (payload.next_page !== page + 1 || page === MAX_PAGES) fail('new_core_planetscale_role_postcondition_failed');
  }
  return seen.size === expected.size && preservedCount === 1 && rowCount === total;
}

function requireGitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    fail('new_core_git_source_sha_unavailable');
  }
}

export function buildProvisioningPlanReceipt({ target = readTarget(), sourceSha = null } = {}) {
  const originSha = validateNewCoreProvisioningTarget(target);
  return {
    ...emptyProvisioningReceipt({ sourceSha, manifestSha256: jsonHash(target) }),
    status: 'PREPARATION_APPROVAL_PENDING',
    target: {
      organization: EXPECTED_PROVIDER.organization,
      databaseId: EXPECTED_PROVIDER.databaseId,
      branchId: EXPECTED_PROVIDER.branchId,
      logicalDatabase: EXPECTED_PROVIDER.logicalDatabase,
      originFingerprint: originSha,
    },
    preconditions: [
      'explicit dispatch by pinned independent operator; owner approval with self-review prevention',
      'exact protected environment and source SHA reviewed',
      'noncredential delivery canary verified before PlanetScale role POST',
      'existing new-target provisioner identity and PG17 empty catalog verified',
      'original broad PlanetScale role preserved without mutation',
      'active migration/admin/verifier credentials stored only as encrypted environment secrets',
      'three deferred roles created SQL NOLOGIN PASSWORD NULL',
      'plain database CREATE granted to migration only; no grant option or ownership',
    ],
    publishingTriggersProvisioning: false,
    ownerOnlyProviderSetupAlternative: 'docs/runbooks/lythaus-new-core-owner-setup.md',
    approvalRequiredBeforeLiveExecution: true,
  };
}

function writeReceipt(receipt) {
  const warnings = [];
  const outputPath = process.env.LYTHAUS_NEW_CORE_PROVISIONING_RECEIPT_PATH;
  if (outputPath && process.env.RUNNER_TEMP && path.resolve(outputPath).startsWith(path.resolve(process.env.RUNNER_TEMP) + path.sep)) {
    try {
      fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    } catch {
      warnings.push('runner_temp_receipt_write_failed');
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## New core role provisioning\n\n\`\`\`json\n${JSON.stringify(receipt, null, 2)}\n\`\`\`\n`, { mode: 0o600 });
    } catch {
      warnings.push('step_summary_write_failed');
    }
  }
  if (warnings.length > 0) receipt.receiptWriteWarnings = warnings;
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const sourceSha = process.env.GITHUB_SHA ?? null;
  if (!args.has('--provision')) {
    writeReceipt(buildProvisioningPlanReceipt({ sourceSha }));
    return;
  }
  const receipt = await provisionNewCoreRoles({ mode: 'provision', sourceSha });
  writeReceipt(receipt);
  if (receipt.status !== 'ROLE_PROVISIONING_PREPARED') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const receipt = emptyProvisioningReceipt({ sourceSha: process.env.GITHUB_SHA ?? null });
    receipt.status = 'ROLE_PROVISIONING_BLOCKED_BEFORE_PROVIDER_WRITE';
    receipt.code = safeCode(error);
    writeReceipt(receipt);
    process.exitCode = 1;
  });
}
