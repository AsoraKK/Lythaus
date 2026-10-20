import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { branchQualifiedDatabaseTarget } from './planetscale-0021-target-identity.mjs';
import { inspectDatabaseIdentity } from './planetscale-cutover-identity-preflight.mjs';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';

export const target = Object.freeze({ organization: 'lythaus', database: 'lythaus-core',
  branch: 'main', branchId: 'vqa2g2xc9wsl', sqlDatabase: 'postgres',
  migrator: 'pscale_api_47syed2xlt6p', verifier: 'pscale_api_qodocjs6vgrb', role: 'pg_read_all_stats' });
export const grantSql = 'GRANT pg_read_all_stats TO "pscale_api_qodocjs6vgrb" WITH INHERIT TRUE';
export const repositoryId = '1010752912';
const requireThat = (condition, code) => { if (!condition) throw Object.assign(new Error(code), { safeCode: code }); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function connection(raw, role) {
  const identity = branchQualifiedDatabaseTarget(raw);
  requireThat(identity.role === role && identity.branchId === target.branchId
    && identity.sqlDatabaseName === target.sqlDatabase && identity.origin.host.endsWith('.psdb.cloud'), 'configured_target_mismatch');
  const url = new URL(raw);
  if (url.searchParams.get('sslrootcert') === 'system') url.searchParams.delete('sslrootcert');
  return { identity, config: { connectionString: url.toString(), ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10_000, query_timeout: 10_000, application_name: 'lythaus-verifier-stats' } };
}

async function assertLiveTarget(env, fetchImpl) {
  const requests = [
    ['https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core/branches/main',
      planetScaleServiceTokenAuthorizationHeader(env.PLANETSCALE_API_TOKEN), value => value.id === target.branchId
        && value.name === 'main' && value.kind === 'postgresql' && value.ready === true && value.production === true],
    [`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/git/ref/heads/main`,
      `Bearer ${env.GH_TOKEN}`, value => value.object?.sha === env.RELEASE_SHA],
  ];
  for (const [url, authorization, matches] of requests) {
    const response = await fetchImpl(url, { method: 'GET', headers: { Authorization: authorization, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000) });
    requireThat(response.ok && matches(await response.json()), 'live_branch_or_main_sha_mismatch');
  }
}

export async function readMembershipState(client) {
  const roles = await client.query(`SELECT oid::text AS oid, rolname AS name,
    rolsuper AS superuser, rolcreaterole AS create_role, rolcreatedb AS create_db,
    rolreplication AS replication, rolbypassrls AS bypass_rls
    FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[]) OR oid = 10 ORDER BY oid`,
  [[target.migrator, target.verifier, target.role]]);
  requireThat(roles.rows.length === 4, 'expected_roles_missing');
  const byName = new Map(roles.rows.map(row => [row.name, row]));
  const migrator = byName.get(target.migrator), verifier = byName.get(target.verifier), stats = byName.get(target.role);
  requireThat(migrator && verifier && stats, 'expected_roles_missing');
  requireThat(!verifier.superuser && !verifier.create_role && !verifier.create_db
    && !verifier.replication && !verifier.bypass_rls, 'unexpected_verifier_role_attributes');
  requireThat(!stats.superuser && !stats.create_role && !stats.create_db
    && !stats.replication && !stats.bypass_rls, 'unexpected_stats_role_attributes');
  const memberships = await client.query(`SELECT roleid::text AS role_id, member::text AS member_id,
    grantor::text AS grantor_id, admin_option, inherit_option, set_option,
    xmin::text AS xmin, ctid::text AS tuple_id, pg_get_userbyid(grantor) AS grantor_name,
    pg_has_role(current_user, member, 'USAGE') AS member_usage,
    pg_has_role(current_user, member, 'SET') AS member_set
    FROM pg_catalog.pg_auth_members
    WHERE member = $1::oid OR roleid = $2::oid
    ORDER BY roleid, member, grantor LIMIT 256`, [verifier.oid, stats.oid]);
  requireThat(memberships.rows.length < 256, 'membership_observation_limit');
  const direct = memberships.rows.filter(row => row.role_id === stats.oid && row.member_id === verifier.oid);
  const authority = await client.query("SELECT pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER WITH ADMIN OPTION') AS admin_option");
  const grantorIds = migrator.superuser ? ['10'] : [...new Set(memberships.rows.filter(row => row.role_id === stats.oid
    && row.admin_option === true && (row.member_id === migrator.oid || row.member_usage || row.member_set)).map(row => row.member_id))];
  return { roles: roles.rows, direct, other: memberships.rows.filter(row => !direct.includes(row)),
    adminOptionHeld: authority.rows[0]?.admin_option === true,
    grantorAuthority: authority.rows[0]?.admin_option === true && grantorIds.length > 0, grantorIds };
}

function assertSession(snapshot, role, statsVisible) {
  requireThat(snapshot.currentUser === role && snapshot.sessionUser === role
    && snapshot.databaseName === 'postgres' && /^17\d{4}$/.test(snapshot.serverVersionNum)
    && snapshot.transactionReadOnly === 'on', 'connected_identity_mismatch');
  requireThat(snapshot.relationOwners.length === 2 && snapshot.relationOwners.every(row => row.ownerName
    && row.effectiveOwnerRole === (role === target.migrator)), 'owner_separation_mismatch');
  requireThat(snapshot.indexProgressVisibility.pgReadAllStatsUsage === statsVisible
    && snapshot.indexProgressVisibility.pgMonitorUsage === false && !snapshot.isSuperuser,
  'unexpected_verifier_visibility');
}

function assertIntroducedRow(state) {
  const row = state.direct[0];
  requireThat(state.direct.length === 1 && row.admin_option === false && row.inherit_option === true
    && row.set_option === true && state.grantorIds.includes(row.grantor_id)
    && /^[a-z0-9_]+$/.test(row.grantor_name ?? ''), 'unexpected_direct_membership');
  return row;
}

export function assertRollbackReceipt(receipt, { env, originFingerprint, state }) {
  requireThat(receipt?.schemaVersion === 1 && receipt.operation === 'grant'
    && receipt.mutationOutcome === 'COMMITTED' && receipt.runId === env.GRANT_RUN_ID
    && receipt.sourceMainSha === env.VERIFIED_GRANT_RUN_SHA && /^[a-f0-9]{40}$/.test(receipt.sourceMainSha)
    && same(receipt.target, target) && receipt.originFingerprint === originFingerprint
    && receipt.before?.direct?.length === 0 && same(receipt.introducedGrant, assertIntroducedRow(state))
    && same(receipt.afterMembership?.direct, [receipt.introducedGrant])
    && same(receipt.before.other, state.other) && same(receipt.before.roles, state.roles), 'rollback_receipt_mismatch');
}

export async function runVerifierStats({ environment: env = process.env, fetchImpl = fetch,
  clientFactory = config => new pg.Client(config), receipt = null } = {}) {
  const report = { schemaVersion: 1, operation: ['inspect', 'grant', 'revoke'].includes(env.STATS_OPERATION) ? env.STATS_OPERATION : null,
    sourceMainSha: /^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? '') ? env.RELEASE_SHA : null,
    runId: /^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') ? env.GITHUB_RUN_ID : null,
    target, status: 'BLOCKED', mutationOutcome: 'NOT_ATTEMPTED',
    generatedAt: new Date().toISOString(), blockers: [] };
  let admin, inTransaction = false, commitAttempted = false;
  const probe = async (config, role, visible) => {
    const client = clientFactory(config);
    try { await client.connect(); const snapshot = await inspectDatabaseIdentity(client);
      assertSession(snapshot, role, visible); return snapshot;
    } finally { await client.end(); }
  };
  try {
    requireThat(['inspect', 'grant', 'revoke'].includes(env.STATS_OPERATION)
      && /^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? '') && env.GITHUB_SHA === env.RELEASE_SHA
      && env.GITHUB_REPOSITORY_ID === repositoryId && /^[A-Za-z0-9_.-]+\/Lythaus$/.test(env.GITHUB_REPOSITORY ?? '')
      && env.GITHUB_REF === 'refs/heads/main'
      && /^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') && env.GH_TOKEN, 'invalid_execution_context');
    requireThat(env.STATS_OPERATION === 'revoke' ? /^[1-9]\d*$/.test(env.GRANT_RUN_ID ?? '') && receipt
      : !env.GRANT_RUN_ID && !receipt, 'unexpected_receipt_input');
    const migrator = connection(env.PLANETSCALE_ADMIN_DATABASE_URL, target.migrator);
    const verifier = connection(env.PLANETSCALE_SCHEMA_READ_DATABASE_URL, target.verifier);
    requireThat(migrator.identity.originFingerprint === verifier.identity.originFingerprint, 'database_origins_differ');
    report.originFingerprint = migrator.identity.originFingerprint;
    await assertLiveTarget(env, fetchImpl);
    admin = clientFactory(migrator.config);
    await admin.connect();
    const identity = await inspectDatabaseIdentity(admin);
    report.migratorBefore = identity;
    requireThat(identity.currentUser === target.migrator && identity.sessionUser === target.migrator
      && identity.databaseName === 'postgres' && /^17\d{4}$/.test(identity.serverVersionNum)
      && identity.relationOwners.length === 2 && identity.relationOwners.every(row => row.ownerName && row.effectiveOwnerRole),
    'migrator_identity_or_owner_mismatch');
    report.before = await readMembershipState(admin);
    report.verifierBefore = await probe(verifier.config, target.verifier, env.STATS_OPERATION === 'revoke');
    const owners = snapshot => snapshot.relationOwners.map(({ schemaName, relationName, ownerName }) => ({ schemaName, relationName, ownerName }));
    requireThat(same(owners(identity), owners(report.verifierBefore)), 'owner_observations_differ');
    requireThat(report.before.grantorAuthority, 'grantor_admin_option_or_superuser_required');
    if (env.STATS_OPERATION === 'revoke') {
      assertRollbackReceipt(receipt, { env, originFingerprint: report.originFingerprint, state: report.before });
    } else requireThat(report.before.direct.length === 0, 'preexisting_direct_membership_stop');
    if (env.STATS_OPERATION === 'inspect') { report.status = 'READY_FOR_APPROVED_GRANT'; return report; }

    await assertLiveTarget(env, fetchImpl);
    await admin.query('BEGIN READ WRITE');
    inTransaction = true;
    await admin.query("SET LOCAL statement_timeout = '5000ms'");
    await admin.query("SET LOCAL lock_timeout = '1000ms'");
    const locked = await admin.query("SELECT pg_try_advisory_xact_lock(hashtext('lythaus-verifier-stats')) AS locked");
    requireThat(locked.rows[0]?.locked === true, 'stats_operation_lock_unavailable');
    requireThat(same(await readMembershipState(admin), report.before), 'membership_changed_before_mutation');
    if (env.STATS_OPERATION === 'grant') await admin.query(grantSql);
    else {
      const grantor = report.before.direct[0].grantor_name;
      requireThat(typeof grantor === 'string' && /^[a-z0-9_]+$/.test(grantor), 'rollback_grantor_unavailable');
      await admin.query(`REVOKE pg_read_all_stats FROM "pscale_api_qodocjs6vgrb" GRANTED BY "${grantor}" RESTRICT`);
    }
    report.mutationOutcome = 'IN_TRANSACTION';
    report.afterMembership = await readMembershipState(admin);
    requireThat(same(report.before.other, report.afterMembership.other)
      && same(report.before.roles, report.afterMembership.roles), 'unrelated_permission_state_changed');
    if (env.STATS_OPERATION === 'grant') {
      report.introducedGrant = assertIntroducedRow(report.afterMembership);
      const transaction = await admin.query('SELECT pg_current_xact_id()::text AS transaction_id');
      requireThat(BigInt(report.introducedGrant.xmin) === BigInt(transaction.rows[0].transaction_id) % 4294967296n,
        'grant_not_written_by_this_transaction');
    }
    else requireThat(report.afterMembership.direct.length === 0, 'revocation_not_confirmed');
    commitAttempted = true;
    await admin.query('COMMIT');
    inTransaction = false;
    report.mutationOutcome = 'COMMITTED';
    await admin.end(); admin = null;
    report.verifierAfter = await probe(verifier.config, target.verifier, env.STATS_OPERATION === 'grant');
    requireThat(same(report.verifierBefore.relationOwners, report.verifierAfter.relationOwners), 'owner_state_changed');
    const proof = clientFactory(migrator.config);
    try {
      await proof.connect();
      await proof.query('BEGIN READ ONLY');
      requireThat(same(await readMembershipState(proof), report.afterMembership), 'fresh_membership_proof_mismatch');
      await proof.query('ROLLBACK');
    } finally { await proof.end(); }
    report.status = env.STATS_OPERATION === 'grant' ? 'GRANTED_AND_RECONNECTED' : 'INTRODUCED_GRANT_REVOKED';
  } catch (error) {
    report.blockers.push(error?.safeCode ?? 'operation_failed_details_redacted');
    if (commitAttempted && report.mutationOutcome !== 'COMMITTED') report.mutationOutcome = 'UNKNOWN_COMMIT_OUTCOME';
    else if (inTransaction) {
      try { await admin.query('ROLLBACK'); report.mutationOutcome = 'ROLLED_BACK'; }
      catch { report.mutationOutcome = 'UNKNOWN_ROLLBACK_OUTCOME'; }
    }
  } finally { if (admin) await admin.end().catch(() => {}); }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let receipt = null;
  try { if (process.env.STATS_RECEIPT_FILE) receipt = JSON.parse(fs.readFileSync(process.env.STATS_RECEIPT_FILE, 'utf8')); }
  catch { receipt = { invalid: true }; }
  const report = await runVerifierStats({ receipt });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'BLOCKED') process.exitCode = 2;
}
