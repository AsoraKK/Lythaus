import { pathToFileURL } from 'node:url';
import { TARGET } from './lythaus-new-core-isolation-review.mjs';
import { installedSchemaMatchesReceipt, verifiedOriginIssuers } from './lythaus-new-core-admin-inputs.mjs';
import { adminDatabaseConnectionConfig, branchQualifiedDatabaseTarget } from './planetscale-0021-target-identity.mjs';
import { verifyExistingGate } from './lythaus-new-core-secret-preflight.mjs';

// LIMIT 0 checks the scoped application's relation and column access without
// returning a session, outbox payload, legal hold or other customer data.
const roles = [
  { name: 'lythaus_privacy', secret: 'LYTHAUS_NEW_CORE_PRIVACY_DATABASE_URL',
    read: 'SELECT id, active FROM privacy.legal_holds LIMIT 0' },
  { name: 'lythaus_runtime', secret: 'LYTHAUS_NEW_CORE_RUNTIME_DATABASE_URL',
    read: 'SELECT id, expires_at FROM identity.auth_sessions LIMIT 0' },
  { name: 'lythaus_jobs', secret: 'LYTHAUS_NEW_CORE_JOBS_DATABASE_URL',
    read: 'SELECT id, dispatched_at FROM system.outbox_events LIMIT 0' },
];

const roleBoundary = `SELECT
  current_database()='postgres' AND current_user=$1 AND session_user=current_user
    AND current_setting('server_version_num')::integer / 10000=17 AS identity_matches,
  current_setting('transaction_read_only')='on' AS read_only,
  rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)
    AND NOT EXISTS (SELECT FROM pg_auth_members WHERE member=r.oid)
    AND (SELECT count(*)=1 AND bool_and(member='postgres'::regrole AND admin_option AND NOT inherit_option
      AND NOT set_option) FROM pg_auth_members WHERE roleid=r.oid) AS roles_restricted,
  has_database_privilege(current_database(),'CONNECT')
    AND NOT has_database_privilege(current_database(),'CONNECT WITH GRANT OPTION')
    AND NOT has_database_privilege(current_database(),'TEMP WITH GRANT OPTION')
    AND NOT has_database_privilege(current_database(),'CREATE')
    AND NOT EXISTS (SELECT FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) acl
      WHERE d.datname=current_database() AND acl.grantee=r.oid AND acl.privilege_type<>'CONNECT')
    AND NOT EXISTS (SELECT FROM pg_namespace WHERE has_schema_privilege(oid,'CREATE'))
    AND NOT EXISTS (SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid
      AND deptype='o' AND (dbid=0 OR dbid=(SELECT oid FROM pg_database WHERE datname=current_database()))) AS ddl_restricted,
  NOT has_any_column_privilege('identity.admin_memberships','INSERT')
    AND NOT has_any_column_privilege('identity.admin_memberships','UPDATE')
    AND has_table_privilege('identity.admin_memberships','DELETE') = (current_user='lythaus_privacy')
    AND NOT has_function_privilege('identity.bootstrap_first_administrator(uuid,bytea,uuid,text)','EXECUTE')
    AND NOT has_any_column_privilege('system.audit_events','UPDATE')
    AND has_table_privilege('system.audit_events','DELETE') = (current_user='lythaus_privacy') AS sensitive_grants_match
  FROM pg_roles r WHERE rolname=current_user`;

async function checkRole(role, raw, { createClient, verifyPeer, matchesReceipt, parseTarget }) {
  const report = { present: Boolean(raw), target: false, tls: false, authenticated: false,
    readOnly: false, memberships: false, ddl: false, sensitiveGrants: false, schemaAndGrants: false, applicationRead: false };
  if (!report.present) return report;
  let client;
  let connectionFailed = false;
  try {
    const target = parseTarget(raw);
    report.target = Boolean(new URL(raw).password) && target.branchId === TARGET.branch && target.role === role.name
      && target.originFingerprint === TARGET.origin && target.sqlDatabaseName === 'postgres' && target.origin.port === 5432;
    if (!report.target) return report;
    client = await createClient({
      ...adminDatabaseConnectionConfig(raw),
      options: '-c default_transaction_read_only=on -c search_path=pg_catalog',
      statement_timeout: 12000, connectionTimeoutMillis: 10000, query_timeout: 15000,
    });
    // An idle PostgreSQL client emits an error event if the server closes it.
    client.on('error', () => { connectionFailed = true; });
    await client.connect();
    verifyPeer(client.connection.stream, target.origin.host);
    report.tls = true;
    const { rows } = await client.query(roleBoundary, [role.name]);
    if (rows.length !== 1) return report;
    const [row] = rows;
    report.authenticated = row.identity_matches === true;
    report.readOnly = row.read_only === true;
    report.memberships = row.roles_restricted === true;
    report.ddl = row.ddl_restricted === true;
    report.sensitiveGrants = row.sensitive_grants_match === true;
    if (!report.authenticated || !report.readOnly || !report.memberships || !report.ddl || !report.sensitiveGrants) return report;
    report.schemaAndGrants = await matchesReceipt(client) === true;
    if (report.schemaAndGrants) report.applicationRead = (await client.query(role.read)).rowCount === 0;
  } catch {
    // The driver may include connection details or a query parameter in any error.
  } finally {
    if (client) await client.end().catch(() => {});
    if (connectionFailed) report.authenticated = false;
  }
  return report;
}

export async function inspectProductionRoles(env, {
  createClient = async config => new (await import('pg')).default.Client(config),
  verifyPeer = verifiedOriginIssuers, matchesReceipt = installedSchemaMatchesReceipt,
  parseTarget = branchQualifiedDatabaseTarget,
} = {}) {
  const inputs = {};
  for (const role of roles) {
    inputs[role.name] = await checkRole(role, env[role.secret], { createClient, verifyPeer, matchesReceipt, parseTarget });
  }
  return { passed: Object.values(inputs).every(checks => Object.values(checks).every(value => value === true)), inputs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = process.env;
    if (env.REQUESTED_INSPECTION !== 'installed-production-roles'
      || env.GITHUB_WORKFLOW_REF !== env.GITHUB_REPOSITORY + '/.github/workflows/lythaus-new-core-secret-preflight.yml@refs/heads/main') {
      throw new Error('dispatch_mismatch');
    }
    await verifyExistingGate({ env, requireApproval: true });
    const report = await inspectProductionRoles(env);
    console.log(JSON.stringify(report));
    if (!report.passed) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ passed: false, gateVerified: false }));
    process.exitCode = 1;
  }
}
