-- Proposed owner-console diagnostic only; never run by migrations or Actions.
-- Dashboard/provider identity must FIRST establish:
-- lythaus / lythaus-new-core (87dbkhprjh30) / main (xwkb9quljkzd).
-- SQL database name alone cannot establish a PlanetScale branch.
-- Opening a provider console session needs its own authorization.
BEGIN TRANSACTION READ ONLY;

SELECT
  current_database() = 'postgres' AS logical_database_matches,
  current_setting('server_version_num')::integer / 10000 = 17 AS postgres_major_matches,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres'
    AND rolcreaterole AND NOT rolsuper) AS stable_creator_profile_available,
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
    THEN pg_has_role(session_user, 'postgres', 'SET')
    ELSE false END AS stable_role_switch_allowed,
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
    THEN has_database_privilege('postgres', current_database(), 'CONNECT WITH GRANT OPTION')
    ELSE false END AS stable_grantor_can_grant_connect,
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
    THEN has_database_privilege('postgres', current_database(), 'CREATE WITH GRANT OPTION')
    ELSE false END AS stable_grantor_can_grant_create,
  (SELECT count(*) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%'
    AND nspname NOT IN ('public', 'information_schema')) AS application_schema_count,
  (SELECT count(*) FROM pg_class relation_entry
    JOIN pg_namespace namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
    WHERE namespace_entry.nspname NOT LIKE 'pg_%'
      AND namespace_entry.nspname <> 'information_schema'
      AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) AS application_relation_count,
  to_regclass('system.schema_migrations') IS NULL AS migration_ledger_absent,
  (SELECT count(*) FROM pg_roles WHERE rolname IN (
    'lythaus_runtime', 'lythaus_admin', 'lythaus_jobs', 'lythaus_privacy',
    'lythaus_migrations', 'lythaus_verifier')) AS canonical_sql_label_collision_count,
  (SELECT COALESCE(bool_or(acl.grantee = 0 AND acl.privilege_type = 'CREATE'), false)
    FROM pg_database database_entry
    CROSS JOIN LATERAL aclexplode(COALESCE(database_entry.datacl,
      acldefault('d', database_entry.datdba))) acl
    WHERE database_entry.datname = current_database()) AS public_database_create;

ROLLBACK;
-- Expected: every *_matches / *_available / *_allowed / *_can_grant_* / *_absent
-- boolean true; all counts zero; public_database_create false.
-- Any mismatch or denied query: stop and report sanitized results. No GRANT,
-- membership change, default-role reset, or CREATE follows automatically.
