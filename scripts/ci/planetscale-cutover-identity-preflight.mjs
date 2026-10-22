import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { branchQualifiedDatabaseTarget } from './planetscale-0021-target-identity.mjs';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';
import { inspectProductGrantorAuthority } from './product-grantor-authority.mjs';

const { Client } = pg;
const expectedRelations = [
  { schemaName: 'media', relationName: 'upload_sessions' },
  { schemaName: 'system', relationName: 'schema_migrations' },
];

function isBranchId(value) {
  return typeof value === 'string' && /^[a-z0-9]+$/.test(value);
}

function safeRoleName(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_$.-]{1,128}$/.test(value) ? value : null;
}

function queryFailure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function queryOrFail(client, sql, failureCode) {
  try {
    return await client.query(sql);
  } catch {
    throw queryFailure(failureCode);
  }
}

function connectionTarget(raw, label) {
  try {
    if (typeof raw !== 'string' || raw === '') return { target: null, config: null };
    const target = branchQualifiedDatabaseTarget(raw);
    if (!target.origin.host.endsWith('.psdb.cloud')) return { target: null, config: null };
    const connection = new URL(raw);
    if (connection.searchParams.get('sslrootcert') === 'system') connection.searchParams.delete('sslrootcert');
    return {
      target,
      config: {
        connectionString: connection.toString(),
        ssl: { rejectUnauthorized: true },
        connectionTimeoutMillis: 10_000,
        query_timeout: 10_000,
        application_name: `lythaus-cutover-identity-${label}`,
      },
    };
  } catch {
    return { target: null, config: null };
  }
}

export async function inspectDatabaseIdentity(client, { inspectProductGrants = false } = {}) {
  await queryOrFail(client, 'SET statement_timeout = \'5000ms\'', 'session_timeout_setup_failed');
  await queryOrFail(client, 'SET lock_timeout = \'1000ms\'', 'session_timeout_setup_failed');
  await queryOrFail(client, 'SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY', 'read_only_session_setup_failed');
  await queryOrFail(client, 'BEGIN READ ONLY', 'read_only_transaction_start_failed');
  try {
    const readOnly = await queryOrFail(client, 'SHOW transaction_read_only', 'read_only_transaction_probe_failed');
    if (readOnly.rows[0]?.transaction_read_only !== 'on') throw queryFailure('read_only_transaction_not_confirmed');

    const identityResult = await queryOrFail(client, `SELECT current_database() AS database_name,
      current_user AS connected_user,
      session_user AS login_user,
      current_setting('server_version_num') AS server_version_num,
      current_setting('transaction_read_only') AS transaction_read_only,
      COALESCE(role.rolsuper, false) AS is_superuser
      FROM pg_catalog.pg_roles role
      WHERE role.rolname = current_user
      LIMIT 1`, 'session_identity_probe_failed');
    const identity = identityResult.rows[0];
    if (!identity) throw queryFailure('session_identity_probe_failed');

    const ownersResult = await queryOrFail(client, `SELECT namespace.nspname AS schema_name,
      relation.relname AS relation_name,
      pg_get_userbyid(relation.relowner) AS owner_name,
      pg_has_role(current_user, relation.relowner, 'USAGE') AS effective_owner_role
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE ((namespace.nspname = 'media' AND relation.relname = 'upload_sessions')
        OR (namespace.nspname = 'system' AND relation.relname = 'schema_migrations'))
      AND relation.relkind IN ('r', 'p')
      ORDER BY namespace.nspname, relation.relname
      LIMIT 3`, 'relation_owner_probe_failed');

    const visibilityResult = await queryOrFail(client, `SELECT
      pg_has_role(current_user, 'pg_read_all_stats', 'USAGE') AS pg_read_all_stats_usage,
      pg_has_role(current_user, 'pg_monitor', 'USAGE') AS pg_monitor_usage`, 'index_progress_visibility_probe_failed');
    const visibility = visibilityResult.rows[0] ?? {};
    const isSuperuser = identity.is_superuser === true;
    const hasIndexProgressVisibility = isSuperuser
      || visibility.pg_read_all_stats_usage === true;
    let activeIndexBuildObserved = null;
    if (hasIndexProgressVisibility) {
      const activeBuildResult = await queryOrFail(client, `SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_stat_progress_create_index
        WHERE datid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
        LIMIT 1
      ) AS active_index_build_observed`, 'index_progress_probe_failed');
      activeIndexBuildObserved = activeBuildResult.rows[0]?.active_index_build_observed === true;
    }

    const productGrantAuthority = inspectProductGrants ? await inspectProductGrantorAuthority(client) : null;
    return {
      productGrantAuthority,
      databaseName: identity.database_name,
      currentUser: identity.connected_user,
      sessionUser: identity.login_user,
      serverVersionNum: identity.server_version_num,
      transactionReadOnly: identity.transaction_read_only,
      isSuperuser,
      relationOwners: ownersResult.rows.map((row) => ({
        schemaName: row.schema_name,
        relationName: row.relation_name,
        ownerName: safeRoleName(row.owner_name),
        effectiveOwnerRole: row.effective_owner_role === true,
      })),
      indexProgressVisibility: {
        pgReadAllStatsUsage: visibility.pg_read_all_stats_usage === true,
        pgMonitorUsage: visibility.pg_monitor_usage === true,
        effective: hasIndexProgressVisibility,
        activeBuildObserved: activeIndexBuildObserved,
      },
    };
  } finally {
    await queryOrFail(client, 'ROLLBACK', 'read_only_transaction_close_failed');
  }
}

function assessSession({ label, target, snapshot, blockers }) {
  if (!target || !snapshot) {
    blockers.push(`${label}_identity_probe_unavailable`);
    return null;
  }
  const userName = safeRoleName(snapshot.currentUser);
  const sessionUser = safeRoleName(snapshot.sessionUser);
  const expectedNames = new Set([target.username, target.role]);
  if (!userName || !sessionUser || !expectedNames.has(userName) || !expectedNames.has(sessionUser)) {
    blockers.push(`${label}_connected_identity_does_not_match_configured_role`);
  }
  if (snapshot.databaseName !== 'postgres') blockers.push(`${label}_connected_database_is_not_postgres`);
  if (snapshot.transactionReadOnly !== 'on') blockers.push(`${label}_read_only_transaction_not_confirmed`);
  const ownerRows = new Map((snapshot.relationOwners ?? []).map((row) => [
    `${row.schemaName}.${row.relationName}`,
    row,
  ]));
  for (const relation of expectedRelations) {
    const key = `${relation.schemaName}.${relation.relationName}`;
    const owner = ownerRows.get(key);
    if (!owner?.ownerName) blockers.push(`${label}_relation_owner_evidence_incomplete`);
  }
  const progress = snapshot.indexProgressVisibility;
  if (!progress?.effective) blockers.push(`${label}_effective_index_progress_visibility_missing`);
  if (progress?.effective && progress.activeBuildObserved === null) blockers.push(`${label}_index_progress_observation_missing`);
  if (progress?.activeBuildObserved === true) blockers.push('active_index_build_observed');
  return {
    branchId: target.branchId,
    databaseName: snapshot.databaseName,
    currentUser: userName,
    sessionUser,
    serverVersionNum: typeof snapshot.serverVersionNum === 'string' && /^\d{1,6}$/.test(snapshot.serverVersionNum)
      ? snapshot.serverVersionNum : null,
    transactionReadOnly: snapshot.transactionReadOnly === 'on',
    isSuperuser: snapshot.isSuperuser === true,
    relationOwners: expectedRelations.map((relation) => {
      const row = ownerRows.get(`${relation.schemaName}.${relation.relationName}`);
      return {
        schemaName: relation.schemaName,
        relationName: relation.relationName,
        ownerName: row?.ownerName ?? null,
        effectiveOwnerRole: row?.effectiveOwnerRole === true,
      };
    }),
    indexProgressVisibility: {
      pgReadAllStatsUsage: progress?.pgReadAllStatsUsage === true,
      pgMonitorUsage: progress?.pgMonitorUsage === true,
      effective: progress?.effective === true,
      activeBuildObserved: progress?.effective === true && typeof progress.activeBuildObserved === 'boolean'
        ? progress.activeBuildObserved : null,
    },
  };
}

export function assessCutoverIdentityPreflight({
  releaseSha,
  providerBranchId,
  adminTarget,
  verifierTarget,
  adminSnapshot,
  verifierSnapshot,
  additionalBlockers = [],
  generatedAt = new Date().toISOString(),
}) {
  const blockers = [...additionalBlockers];
  const safeReleaseSha = typeof releaseSha === 'string' && /^[a-f0-9]{40}$/.test(releaseSha) ? releaseSha : null;
  const safeProviderBranchId = isBranchId(providerBranchId) ? providerBranchId : null;
  if (!safeReleaseSha) blockers.push('release_sha_missing_or_invalid');
  if (!safeProviderBranchId) blockers.push('planetscale_main_branch_identity_unavailable');
  for (const [label, target] of [['migrator', adminTarget], ['verifier', verifierTarget]]) {
    if (!target) {
      blockers.push(`${label}_database_target_unavailable`);
      continue;
    }
    if (target.branchId !== safeProviderBranchId) blockers.push(`${label}_database_branch_id_does_not_match_main`);
    if (target.sqlDatabaseName !== 'postgres') blockers.push(`${label}_database_target_is_not_postgres`);
  }
  if (adminTarget && verifierTarget && adminTarget.originFingerprint !== verifierTarget.originFingerprint) {
    blockers.push('migrator_and_verifier_database_origins_differ');
  }

  const migrator = assessSession({ label: 'migrator', target: adminTarget, snapshot: adminSnapshot, blockers });
  const verifier = assessSession({ label: 'verifier', target: verifierTarget, snapshot: verifierSnapshot, blockers });
  if (migrator && verifier) {
    if (migrator.currentUser === verifier.currentUser || migrator.sessionUser === verifier.sessionUser) {
      blockers.push('migrator_and_verifier_connected_identities_are_not_separate');
    }
    const ownerKey = ({ schemaName, relationName }) => `${schemaName}.${relationName}`;
    const verifierOwners = new Map(verifier.relationOwners.map((row) => [ownerKey(row), row.ownerName]));
    for (const owner of migrator.relationOwners) {
      if (!owner.ownerName || verifierOwners.get(ownerKey(owner)) !== owner.ownerName) {
        blockers.push('migrator_and_verifier_relation_owner_observations_differ');
      }
      if (!(owner.effectiveOwnerRole || migrator.isSuperuser)) {
        blockers.push('migrator_effective_relation_owner_access_missing');
      }
    }
  }

  const uniqueBlockers = [...new Set(blockers)];
  return {
    schemaVersion: 1,
    mode: 'read-only-cutover-identity-preflight',
    generatedAt,
    sourceMainSha: safeReleaseSha,
    providerBranch: { name: 'main', id: safeProviderBranchId },
    scope: [
      'connected migrator and schema verifier identities',
      'effective access to owners of media.upload_sessions and system.schema_migrations',
      'effective visibility and active state of index progress on main',
      'separate read-only migrator grant-option evidence for the four product grants',
    ],
    databaseWrites: false,
    providerMutations: false,
    cutoverDecision: 'NOT_ASSESSED',
    status: uniqueBlockers.length === 0 ? 'IDENTITY_PREFLIGHT_PASSED' : 'BLOCKED',
    blockers: uniqueBlockers,
    identities: { migrator, verifier },
    productGrantAuthority: uniqueBlockers.length > 0
      ? { status: 'BLOCKED', grantsExecuted: false, reason: 'cutover_identity_preflight_blocked', checks: [] }
      : adminSnapshot?.productGrantAuthority ?? { status: 'NOT_ASSESSED', grantsExecuted: false, checks: [] },
  };
}

async function readMainBranchId({ token, fetchImpl, environment }) {
  const authorization = planetScaleServiceTokenAuthorizationHeader(token);
  const organization = encodeURIComponent(environment.PLANETSCALE_ORGANIZATION ?? 'lythaus');
  const database = encodeURIComponent(environment.PLANETSCALE_DATABASE ?? 'lythaus-core');
  const response = await fetchImpl(
    `https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/branches/main`,
    { method: 'GET', headers: { Authorization: authorization, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) throw queryFailure('planetscale_main_branch_read_failed');
  const branch = await response.json();
  if (branch?.name && branch.name !== 'main') throw queryFailure('planetscale_main_branch_identity_unavailable');
  if (!isBranchId(branch?.id)) throw queryFailure('planetscale_main_branch_identity_unavailable');
  return branch.id;
}

export async function collectCutoverIdentityEvidence({
  environment = process.env,
  fetchImpl = fetch,
  clientFactory = (config) => new Client(config),
  generatedAt = new Date().toISOString(),
} = {}) {
  const releaseSha = environment.RELEASE_SHA ?? '';
  const adminInput = connectionTarget(environment.PLANETSCALE_ADMIN_DATABASE_URL ?? '', 'migrator');
  const verifierInput = connectionTarget(environment.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '', 'verifier');
  const additionalBlockers = [];
  if (!adminInput.target) additionalBlockers.push('PLANETSCALE_ADMIN_DATABASE_URL_target_invalid_or_missing');
  if (!verifierInput.target) additionalBlockers.push('PLANETSCALE_SCHEMA_READ_DATABASE_URL_target_invalid_or_missing');
  if (!/^[a-f0-9]{40}$/.test(releaseSha)) additionalBlockers.push('release_sha_missing_or_invalid');
  const token = environment.PLANETSCALE_API_TOKEN ?? '';
  if (!token) additionalBlockers.push('PLANETSCALE_API_TOKEN_missing');
  if (additionalBlockers.length > 0) {
    return assessCutoverIdentityPreflight({
      releaseSha,
      providerBranchId: null,
      adminTarget: adminInput.target,
      verifierTarget: verifierInput.target,
      additionalBlockers,
      generatedAt,
    });
  }

  let providerBranchId;
  try {
    providerBranchId = await readMainBranchId({ token, fetchImpl, environment });
  } catch (error) {
    additionalBlockers.push(error?.code === 'planetscale_main_branch_identity_unavailable'
      ? error.code : 'planetscale_main_branch_read_failed');
  }
  if (!providerBranchId
    || adminInput.target.branchId !== providerBranchId
    || verifierInput.target.branchId !== providerBranchId
    || adminInput.target.sqlDatabaseName !== 'postgres'
    || verifierInput.target.sqlDatabaseName !== 'postgres'
    || adminInput.target.originFingerprint !== verifierInput.target.originFingerprint) {
    return assessCutoverIdentityPreflight({
      releaseSha,
      providerBranchId,
      adminTarget: adminInput.target,
      verifierTarget: verifierInput.target,
      additionalBlockers,
      generatedAt,
    });
  }

  const probe = async (config, inspectProductGrants = false) => {
    let client;
    try {
      client = clientFactory(config);
      await client.connect();
      return await inspectDatabaseIdentity(client, { inspectProductGrants });
    } catch {
      return null;
    } finally {
      if (client) await client.end().catch(() => undefined);
    }
  };
  const [adminSnapshot, verifierSnapshot] = await Promise.all([
    probe(adminInput.config, true),
    probe(verifierInput.config),
  ]);
  return assessCutoverIdentityPreflight({
    releaseSha,
    providerBranchId,
    adminTarget: adminInput.target,
    verifierTarget: verifierInput.target,
    adminSnapshot,
    verifierSnapshot,
    additionalBlockers,
    generatedAt,
  });
}

async function main() {
  let report;
  try {
    report = await collectCutoverIdentityEvidence();
  } catch {
    report = assessCutoverIdentityPreflight({
      releaseSha: process.env.RELEASE_SHA,
      providerBranchId: null,
      additionalBlockers: ['preflight_unexpected_failure'],
    });
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'IDENTITY_PREFLIGHT_PASSED') process.exitCode = 2;
}

const invokedFrom = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedFrom && import.meta.url === invokedFrom) await main();
