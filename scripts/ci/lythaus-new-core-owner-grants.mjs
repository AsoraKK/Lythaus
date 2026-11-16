import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { NEW_CORE_ROLE_LABELS, NEW_CORE_LOGIN_ROLE_LABELS, NEW_CORE_DEFERRED_ROLE_LABELS,
  validateNewCoreRoleMap } from './lythaus-new-core-role-profile.mjs';
import { NEW_CORE_PROVIDER_BASELINE, NEW_CORE_PROVIDER_BASELINE_SQL } from './lythaus-new-core-empty-catalog.mjs';

const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const array = (values) => `ARRAY[${values.map(literal).join(',')}]::text[]`;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function outsideRepository(file) {
  const relative = path.relative(ROOT, file);
  return relative !== '' && (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

export function buildNewCoreOwnerGrantSql(roleMap, { sqlConsole = false } = {}) {
  validateNewCoreRoleMap(roleMap, { local: sqlConsole });
  const identifier = (label) => `"${roleMap[label]}"`;
  const managed = NEW_CORE_LOGIN_ROLE_LABELS.map((label) => roleMap[label]);
  const deferred = NEW_CORE_DEFERRED_ROLE_LABELS.map((label) => roleMap[label]);
  const creatorManaged = sqlConsole ? NEW_CORE_ROLE_LABELS.map((label) => roleMap[label]) : deferred;
  const preexistingMembershipCheck = sqlConsole ? `
  SELECT count(*) INTO observed_count FROM pg_auth_members membership
    JOIN pg_roles group_role ON group_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE group_role.rolname = ANY(managed_roles) AND member_role.rolname = 'postgres'
      AND membership.admin_option AND NOT membership.inherit_option AND NOT membership.set_option;
  IF observed_count <> 3 OR EXISTS (
    SELECT 1 FROM pg_auth_members membership
    JOIN pg_roles group_role ON group_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE (group_role.rolname = ANY(managed_roles) OR member_role.rolname = ANY(managed_roles))
      AND NOT (group_role.rolname = ANY(managed_roles) AND member_role.rolname = 'postgres'
        AND membership.admin_option AND NOT membership.inherit_option AND NOT membership.set_option)) THEN
    RAISE EXCEPTION 'new_core_owner_existing_login_management_boundary_failed';
  END IF;` : `
  IF EXISTS (SELECT 1 FROM pg_auth_members membership
    JOIN pg_roles role_entry ON role_entry.oid IN (membership.roleid, membership.member)
    WHERE role_entry.rolname = ANY(managed_roles)) THEN
    RAISE EXCEPTION 'new_core_owner_managed_role_membership_present';
  END IF;`;
  const baselineSql = NEW_CORE_PROVIDER_BASELINE_SQL
    .replaceAll('$1', literal(NEW_CORE_PROVIDER_BASELINE.schema))
    .replaceAll('$2', literal(NEW_CORE_PROVIDER_BASELINE.extension))
    .replaceAll('$3', array([...NEW_CORE_PROVIDER_BASELINE.views]));
  const statements = NEW_CORE_DEFERRED_ROLE_LABELS.map((label) =>
    `  CREATE ROLE ${identifier(label)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;`);
  return `-- ${sqlConsole ? 'SQL-CONSOLE role map; no passwords' : 'PRIVATE generated identifiers; no passwords'}. Review before execution.
-- ONLY lythaus / lythaus-new-core (87dbkhprjh30) / main (xwkb9quljkzd).
-- Confirm dashboard/provider identity and managed-role mapping before BEGIN.
-- This SQL cannot independently establish the PlanetScale branch ID.
-- Separate live role/grant approval is required. On any error: ROLLBACK; STOP.
BEGIN;
SET LOCAL ROLE postgres;
DO $new_core_owner_setup$
DECLARE
  scoped_roles CONSTANT text[] := ${array(NEW_CORE_ROLE_LABELS.map((label) => roleMap[label]))};
  managed_roles CONSTANT text[] := ${array(managed)};
  deferred_roles CONSTANT text[] := ${array(deferred)};
  creator_managed_roles CONSTANT text[] := ${array(creatorManaged)};
  migration_role CONSTANT text := ${literal(roleMap.lythaus_migrations)};
  schema_count integer;
  relation_count integer;
  baseline record;
  observed_count integer;
BEGIN
  IF current_user <> 'postgres' OR current_database() <> 'postgres'
    OR current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION 'new_core_owner_target_or_role_mismatch';
  END IF;
  IF to_regclass('system.schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'new_core_owner_ledger_already_present';
  END IF;
  SELECT count(*) INTO schema_count FROM pg_namespace
    WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public', 'information_schema');
  SELECT count(*) INTO relation_count FROM pg_class relation_entry
    JOIN pg_namespace namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
    WHERE namespace_entry.nspname NOT LIKE 'pg_%' AND namespace_entry.nspname <> 'information_schema'
      AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'S', 'f');
  IF schema_count = 1 AND relation_count = 2 THEN
    SELECT * INTO baseline FROM (${baselineSql}) provider_baseline;
    IF baseline.provider_schema_owner_matches IS DISTINCT FROM true
      OR baseline.provider_view_count IS DISTINCT FROM 2
      OR baseline.provider_unexpected_relation_count IS DISTINCT FROM 0
      OR baseline.provider_unexpected_namespace_dependency_count IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'new_core_owner_provider_baseline_mismatch';
    END IF;
  ELSIF schema_count <> 0 OR relation_count <> 0 THEN
    RAISE EXCEPTION 'new_core_owner_application_catalog_not_empty';
  END IF;
  SELECT count(*) INTO observed_count FROM pg_roles WHERE rolname = ANY(deferred_roles);
  IF observed_count <> 0 THEN RAISE EXCEPTION 'new_core_owner_deferred_role_already_exists'; END IF;
  SELECT count(*) INTO observed_count FROM pg_roles WHERE rolname = ANY(managed_roles)
    AND rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls);
  IF observed_count <> 3 THEN RAISE EXCEPTION 'new_core_owner_managed_role_profile_mismatch'; END IF;
${preexistingMembershipCheck}
  IF EXISTS (SELECT 1 FROM unnest(managed_roles) role_name
    WHERE has_database_privilege(role_name, 'postgres', 'CREATE')
      OR has_database_privilege(role_name, 'postgres', 'CONNECT WITH GRANT OPTION')) THEN
    RAISE EXCEPTION 'new_core_owner_managed_role_database_privilege_present';
  END IF;
${statements.join('\n')}
  GRANT CONNECT ON DATABASE postgres TO ${NEW_CORE_LOGIN_ROLE_LABELS.map(identifier).join(', ')};
  GRANT CREATE ON DATABASE postgres TO ${identifier('lythaus_migrations')};
  SELECT count(*) INTO observed_count FROM pg_roles WHERE rolname = ANY(scoped_roles)
    AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
    AND rolcanlogin = (rolname = ANY(managed_roles));
  IF observed_count <> 6 THEN RAISE EXCEPTION 'new_core_owner_six_role_boundary_failed'; END IF;
  IF NOT has_database_privilege(migration_role, 'postgres', 'CREATE')
    OR EXISTS (SELECT 1 FROM unnest(scoped_roles) role_name
      WHERE has_database_privilege(role_name, 'postgres', 'CREATE WITH GRANT OPTION')
        OR has_database_privilege(role_name, 'postgres', 'CONNECT WITH GRANT OPTION')
        OR (role_name <> migration_role AND has_database_privilege(role_name, 'postgres', 'CREATE')))
    OR EXISTS (SELECT 1 FROM unnest(managed_roles) role_name
      WHERE NOT has_database_privilege(role_name, 'postgres', 'CONNECT'))
    OR EXISTS (SELECT 1 FROM pg_database database_entry JOIN pg_roles role_entry ON role_entry.oid = database_entry.datdba
      WHERE database_entry.datname = 'postgres' AND role_entry.rolname = ANY(scoped_roles)) THEN
    RAISE EXCEPTION 'new_core_owner_database_grant_boundary_failed';
  END IF;
  SELECT count(*) INTO observed_count FROM pg_auth_members membership
    JOIN pg_roles group_role ON group_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE group_role.rolname = ANY(creator_managed_roles) AND member_role.rolname = 'postgres'
      AND membership.admin_option AND NOT membership.inherit_option AND NOT membership.set_option;
  IF observed_count <> ${creatorManaged.length} OR EXISTS (
    SELECT 1 FROM pg_auth_members membership
    JOIN pg_roles group_role ON group_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE (group_role.rolname = ANY(scoped_roles) OR member_role.rolname = ANY(scoped_roles))
      AND NOT (group_role.rolname = ANY(creator_managed_roles) AND member_role.rolname = 'postgres'
        AND membership.admin_option AND NOT membership.inherit_option AND NOT membership.set_option)) THEN
    RAISE EXCEPTION 'new_core_owner_management_membership_boundary_failed';
  END IF;
  SELECT count(*) INTO observed_count FROM pg_database database_entry
    CROSS JOIN LATERAL aclexplode(database_entry.datacl) acl
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    JOIN pg_roles grantor ON grantor.oid = acl.grantor
    WHERE database_entry.datname = 'postgres' AND grantor.rolname = 'postgres' AND NOT acl.is_grantable
      AND ((acl.privilege_type = 'CONNECT' AND grantee.rolname = ANY(managed_roles))
        OR (acl.privilege_type = 'CREATE' AND grantee.rolname = migration_role));
  IF observed_count <> 4 THEN RAISE EXCEPTION 'new_core_owner_durable_grantor_not_proven'; END IF;
  RAISE NOTICE 'new_core_owner_initial_roles_and_grants_verified';
END
$new_core_owner_setup$;
COMMIT;
-- Require the verification notice and COMMIT result. Otherwise STOP.
-- No migration, seed, Lythaus admin membership, latch, audit or application schema is installed.
`;
}

export function buildNewCoreSqlConsoleGrantsSql() {
  return buildNewCoreOwnerGrantSql(Object.fromEntries(NEW_CORE_ROLE_LABELS.map((label) => [label, label])),
    { sqlConsole: true });
}

function main() {
  if (process.argv[2] === '--console-sql' && process.argv.length === 3) {
    process.stdout.write(buildNewCoreSqlConsoleGrantsSql());
    return;
  }
  if (process.argv[2] !== '--write-private-sql') {
    if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--plan')) throw new Error('new_core_owner_grant_mode_invalid');
    process.stdout.write(`${JSON.stringify({ status: 'PLAN_ONLY_NOT_APPLIED', target: 'lythaus/lythaus-new-core/main',
      requiredManagedLogins: [...NEW_CORE_LOGIN_ROLE_LABELS], deferredNoLoginRoles: [...NEW_CORE_DEFERRED_ROLE_LABELS],
      privateRoleMapRequired: true, sqlExecutionSupported: false, liveApprovalRequired: true })}\n`);
    return;
  }
  if (process.argv.length !== 5) throw new Error('new_core_owner_grant_arguments_invalid');
  const input = path.resolve(process.argv[3]);
  const output = path.resolve(process.argv[4]);
  const inputStat = fs.lstatSync(input);
  if (!inputStat.isFile() || (inputStat.mode & 0o077) !== 0 || inputStat.size > 8192) throw new Error('new_core_owner_role_map_not_private');
  if (!outsideRepository(fs.realpathSync(input))
    || !outsideRepository(path.join(fs.realpathSync(path.dirname(output)), path.basename(output)))) {
    throw new Error('new_core_owner_sql_output_must_be_outside_repository');
  }
  const sql = buildNewCoreOwnerGrantSql(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(output, sql, { mode: 0o600, flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ status: 'PRIVATE_SQL_WRITTEN_NOT_EXECUTED', liveApprovalRequired: true })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch { process.stderr.write('new-core owner SQL preparation stopped; check private inputs and destination\n'); process.exitCode = 1; }
}
