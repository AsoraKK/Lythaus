-- FOR THE PLANETSCALE SQL WEB CONSOLE, not a computer terminal.
-- ONLY lythaus / lythaus-new-core (87dbkhprjh30) / main (xwkb9quljkzd), Primary, postgres.
-- Verify the dashboard target first; SQL cannot establish PlanetScale branch ID.
-- Do not run if the three logins were already created through Settings/API/CLI.
-- Creates ONLY three SQL-managed logins. No initial database grants or migrations.
-- The password result is PRIVATE: save it to your password manager; do not share/export it.
-- On error: ROLLBACK; STOP. Never rerun after a successful COMMIT.
BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL password_encryption = 'scram-sha-256';

DO $lythaus_new_core_logins$
DECLARE
  login_labels CONSTANT text[] := ARRAY['lythaus_migrations','lythaus_admin','lythaus_verifier'];
  all_labels CONSTANT text[] := ARRAY['lythaus_migrations','lythaus_admin','lythaus_verifier',
    'lythaus_runtime','lythaus_jobs','lythaus_privacy'];
  selected_label text;
  generated_password text;
  schema_count integer;
  relation_count integer;
  observed_count integer;
  provider_baseline record;
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres'
    OR current_setting('server_version_num')::integer / 10000 <> 17
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolcreaterole AND NOT rolsuper) THEN
    RAISE EXCEPTION 'new_core_console_target_or_grantor_mismatch';
  END IF;
  IF to_regclass('system.schema_migrations') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ANY(all_labels)) THEN
    RAISE EXCEPTION 'new_core_console_already_started_stop_without_reset';
  END IF;
  SELECT count(*) INTO schema_count FROM pg_namespace
    WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema');
  SELECT count(*) INTO relation_count FROM pg_class relation_entry
    JOIN pg_namespace namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
    WHERE namespace_entry.nspname !~ '^pg_' AND namespace_entry.nspname <> 'information_schema'
      AND relation_entry.relkind IN ('r','p','v','m','S','f');
  IF schema_count = 1 AND relation_count = 2 THEN
    SELECT * INTO provider_baseline FROM (SELECT
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
WHERE namespace_entry.nspname = 'pscale_extensions' AND extension_entry.extname = 'hypopg') checked_baseline;
    IF provider_baseline.provider_schema_owner_matches IS DISTINCT FROM true
      OR provider_baseline.provider_view_count IS DISTINCT FROM 2
      OR provider_baseline.provider_unexpected_relation_count IS DISTINCT FROM 0
      OR provider_baseline.provider_unexpected_namespace_dependency_count IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'new_core_console_provider_baseline_mismatch';
    END IF;
  ELSIF schema_count <> 0 OR relation_count <> 0 THEN
    RAISE EXCEPTION 'new_core_console_application_catalog_not_empty';
  END IF;
  CREATE TEMP TABLE lythaus_new_core_password_delivery (
    role_label text PRIMARY KEY,
    connection_username text NOT NULL,
    password text NOT NULL UNIQUE
  ) ON COMMIT DROP;
  FOREACH selected_label IN ARRAY login_labels LOOP
    generated_password := replace(pg_catalog.gen_random_uuid()::text, '-', '')
      || replace(pg_catalog.gen_random_uuid()::text, '-', '');
    BEGIN
      EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L VALID UNTIL %L',
        selected_label, generated_password, 'infinity');
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'new_core_console_login_creation_failed_transaction_aborted';
    END;
    INSERT INTO pg_temp.lythaus_new_core_password_delivery
      VALUES (selected_label, selected_label || '.xwkb9quljkzd', generated_password);
    generated_password := NULL;
  END LOOP;
  SELECT count(*) INTO observed_count FROM pg_roles WHERE rolname = ANY(login_labels)
    AND rolcanlogin AND NOT rolinherit
    AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
    AND rolvaliduntil = 'infinity'::timestamptz;
  IF observed_count <> 3 OR EXISTS (SELECT 1 FROM unnest(login_labels) role_name
    WHERE has_database_privilege(role_name, 'postgres', 'CREATE')
      OR has_database_privilege(role_name, 'postgres', 'CONNECT WITH GRANT OPTION')) THEN
    RAISE EXCEPTION 'new_core_console_login_privilege_boundary_failed';
  END IF;
  SELECT count(*) INTO observed_count FROM pg_auth_members membership
    JOIN pg_roles group_role ON group_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE group_role.rolname = ANY(login_labels) AND member_role.rolname = 'postgres'
      AND membership.admin_option AND NOT membership.inherit_option AND NOT membership.set_option;
  IF observed_count <> 3 OR EXISTS (
    SELECT 1 FROM pg_auth_members membership
    JOIN pg_roles group_role ON group_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE (group_role.rolname = ANY(login_labels) OR member_role.rolname = ANY(login_labels))
      AND NOT (group_role.rolname = ANY(login_labels) AND member_role.rolname = 'postgres'
        AND membership.admin_option AND NOT membership.inherit_option AND NOT membership.set_option)) THEN
    RAISE EXCEPTION 'new_core_console_role_membership_boundary_failed';
  END IF;
  RAISE NOTICE 'new_core_console_three_sql_logins_verified';
END
$lythaus_new_core_logins$;

-- PRIVATE PASSWORD RESULT: save all three rows in your password manager.
SELECT role_label, connection_username, password
FROM pg_temp.lythaus_new_core_password_delivery
ORDER BY role_label;

COMMIT;
-- Require COMMIT, not ROLLBACK. The temporary password table is then dropped.
-- Tell the assistant only: three roles committed and passwords saved. No passwords.
