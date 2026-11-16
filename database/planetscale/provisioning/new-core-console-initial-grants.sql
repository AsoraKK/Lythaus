-- SQL-CONSOLE role map; no passwords. Review before execution.
-- ONLY lythaus / lythaus-new-core (87dbkhprjh30) / main (xwkb9quljkzd).
-- Confirm dashboard/provider identity and managed-role mapping before BEGIN.
-- This SQL cannot independently establish the PlanetScale branch ID.
-- Separate live role/grant approval is required. On any error: ROLLBACK; STOP.
BEGIN;
SET LOCAL ROLE postgres;
DO $new_core_owner_setup$
DECLARE
  scoped_roles CONSTANT text[] := ARRAY['lythaus_runtime','lythaus_admin','lythaus_jobs','lythaus_privacy','lythaus_migrations','lythaus_verifier']::text[];
  managed_roles CONSTANT text[] := ARRAY['lythaus_admin','lythaus_migrations','lythaus_verifier']::text[];
  deferred_roles CONSTANT text[] := ARRAY['lythaus_runtime','lythaus_jobs','lythaus_privacy']::text[];
  creator_managed_roles CONSTANT text[] := ARRAY['lythaus_runtime','lythaus_admin','lythaus_jobs','lythaus_privacy','lythaus_migrations','lythaus_verifier']::text[];
  migration_role CONSTANT text := 'lythaus_migrations';
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
    SELECT * INTO baseline FROM (SELECT
  namespace_entry.nspowner = extension_entry.extowner AS provider_schema_owner_matches,
  (SELECT count(*)::integer FROM pg_class relation_entry
    WHERE relation_entry.relnamespace = namespace_entry.oid
      AND relation_entry.relname = ANY(ARRAY['hypopg_hidden_indexes','hypopg_list_indexes']::text[]::text[]) AND relation_entry.relkind = 'v'
      AND relation_entry.relowner = extension_entry.extowner
      AND EXISTS (SELECT 1 FROM pg_depend member
        WHERE member.classid = 'pg_class'::regclass AND member.objid = relation_entry.oid
          AND member.objsubid = 0 AND member.refclassid = 'pg_extension'::regclass
          AND member.refobjid = extension_entry.oid AND member.deptype = 'e')) AS provider_view_count,
  (SELECT count(*)::integer FROM pg_class relation_entry
    WHERE relation_entry.relnamespace = namespace_entry.oid
      AND NOT (relation_entry.relname = ANY(ARRAY['hypopg_hidden_indexes','hypopg_list_indexes']::text[]::text[]) AND relation_entry.relkind = 'v'
        AND relation_entry.relowner = extension_entry.extowner
        AND EXISTS (SELECT 1 FROM pg_depend member
          WHERE member.classid = 'pg_class'::regclass AND member.objid = relation_entry.oid
            AND member.objsubid = 0 AND member.refclassid = 'pg_extension'::regclass
            AND member.refobjid = extension_entry.oid AND member.deptype = 'e'))) AS provider_unexpected_relation_count,
  (SELECT count(*)::integer FROM pg_depend namespace_dependency
    WHERE namespace_dependency.refclassid = 'pg_namespace'::regclass
      AND namespace_dependency.refobjid = namespace_entry.oid
      AND NOT (
        (namespace_dependency.classid = 'pg_extension'::regclass
          AND namespace_dependency.objid = extension_entry.oid)
        OR EXISTS (SELECT 1 FROM pg_depend member
          WHERE member.classid = namespace_dependency.classid
            AND member.objid = namespace_dependency.objid AND member.objsubid = 0
            AND member.refclassid = 'pg_extension'::regclass
            AND member.refobjid = extension_entry.oid AND member.deptype = 'e')
        OR (namespace_dependency.classid = 'pg_type'::regclass AND EXISTS (
          SELECT 1 FROM pg_type type_entry
          LEFT JOIN pg_type element_entry ON element_entry.oid = type_entry.typelem
          JOIN pg_class view_entry ON view_entry.oid = type_entry.typrelid
            OR (view_entry.oid = element_entry.typrelid AND element_entry.typarray = type_entry.oid)
          WHERE type_entry.oid = namespace_dependency.objid
            AND view_entry.relnamespace = namespace_entry.oid
            AND view_entry.relname = ANY(ARRAY['hypopg_hidden_indexes','hypopg_list_indexes']::text[]::text[]) AND view_entry.relkind = 'v'))
      )) AS provider_unexpected_namespace_dependency_count
FROM pg_namespace namespace_entry
JOIN pg_extension extension_entry ON extension_entry.extnamespace = namespace_entry.oid
WHERE namespace_entry.nspname = 'pscale_extensions' AND extension_entry.extname = 'hypopg') provider_baseline;
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
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(managed_roles) role_name
    WHERE has_database_privilege(role_name, 'postgres', 'CREATE')
      OR has_database_privilege(role_name, 'postgres', 'CONNECT WITH GRANT OPTION')) THEN
    RAISE EXCEPTION 'new_core_owner_managed_role_database_privilege_present';
  END IF;
  CREATE ROLE "lythaus_runtime" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;
  CREATE ROLE "lythaus_jobs" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;
  CREATE ROLE "lythaus_privacy" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL;
  GRANT CONNECT ON DATABASE postgres TO "lythaus_admin", "lythaus_migrations", "lythaus_verifier";
  GRANT CREATE ON DATABASE postgres TO "lythaus_migrations";
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
  IF observed_count <> 6 OR EXISTS (
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
