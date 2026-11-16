-- Read-only catalog verification on lythaus / lythaus-new-core / main, postgres, Primary.
WITH scoped AS (
  SELECT * FROM pg_roles WHERE rolname = ANY(ARRAY[
    'lythaus_migrations','lythaus_admin','lythaus_verifier',
    'lythaus_runtime','lythaus_jobs','lythaus_privacy'])
), links AS (
  SELECT group_role.rolname AS group_name, member_role.rolname AS member_name,
    membership.admin_option, membership.inherit_option, membership.set_option
  FROM pg_auth_members membership
  JOIN pg_roles group_role ON group_role.oid=membership.roleid
  JOIN pg_roles member_role ON member_role.oid=membership.member
  WHERE group_role.rolname IN (SELECT rolname FROM scoped)
     OR member_role.rolname IN (SELECT rolname FROM scoped)
)
SELECT current_database()='postgres' AS logical_database_matches,
  current_setting('server_version_num')::integer / 10000=17 AS postgres_major_matches,
  (SELECT count(*)::integer FROM scoped) AS scoped_role_count,
  (SELECT count(*)::integer FROM scoped WHERE rolcanlogin) AS login_count,
  (SELECT count(*)::integer FROM scoped WHERE NOT rolcanlogin) AS nologin_count,
  (SELECT count(*)::integer FROM scoped WHERE rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AS unsafe_role_count,
  (SELECT count(*)::integer FROM scoped WHERE rolinherit) AS inherit_attribute_count,
  (SELECT count(*)::integer FROM scoped WHERE rolcanlogin AND rolvaliduntil='infinity'::timestamptz) AS nonexpiring_login_count,
  (SELECT count(*)::integer FROM links) AS scoped_membership_count,
  (SELECT count(*)::integer FROM links WHERE group_name IN (SELECT rolname FROM scoped)
    AND member_name='postgres' AND admin_option AND NOT inherit_option AND NOT set_option) AS creator_admin_only_membership_count,
  has_database_privilege('lythaus_migrations','postgres','CREATE') AS migration_database_create,
  has_database_privilege('lythaus_migrations','postgres','CREATE WITH GRANT OPTION') AS migration_create_grant_option,
  (SELECT count(*)::integer FROM scoped WHERE rolname<>'lythaus_migrations'
    AND has_database_privilege(rolname,'postgres','CREATE')) AS restricted_database_create_count,
  (SELECT count(*)::integer FROM scoped WHERE rolcanlogin
    AND has_database_privilege(rolname,'postgres','CONNECT')) AS login_connect_count,
  (SELECT count(*)::integer FROM scoped WHERE has_database_privilege(rolname,'postgres','CONNECT WITH GRANT OPTION')) AS connect_grant_option_count,
  (SELECT count(*)::integer FROM pg_database database_entry
    WHERE database_entry.datname='postgres' AND database_entry.datdba IN (SELECT oid FROM scoped)) AS scoped_database_owner_count,
  (SELECT count(*)::integer FROM pg_database database_entry
    CROSS JOIN LATERAL aclexplode(database_entry.datacl) acl
    JOIN pg_roles grantee ON grantee.oid=acl.grantee
    JOIN pg_roles grantor ON grantor.oid=acl.grantor
    WHERE database_entry.datname='postgres' AND grantor.rolname='postgres' AND NOT acl.is_grantable
      AND ((acl.privilege_type='CONNECT' AND grantee.rolname IN ('lythaus_migrations','lythaus_admin','lythaus_verifier'))
        OR (acl.privilege_type='CREATE' AND grantee.rolname='lythaus_migrations'))) AS expected_durable_database_acl_count,
  (SELECT count(*)::integer FROM pg_namespace WHERE nspname !~ '^pg_'
    AND nspname NOT IN ('public','information_schema','pscale_extensions')) AS unexpected_application_schema_count,
  (SELECT count(*)::integer FROM pg_class relation_entry
    JOIN pg_namespace namespace_entry ON namespace_entry.oid=relation_entry.relnamespace
    WHERE namespace_entry.nspname !~ '^pg_' AND namespace_entry.nspname<>'information_schema'
      AND relation_entry.relkind IN ('r','p','v','m','S','f')) AS non_system_relation_count,
  (SELECT count(*)::integer FROM pg_class relation_entry
    JOIN pg_namespace namespace_entry ON namespace_entry.oid=relation_entry.relnamespace
    JOIN pg_depend member ON member.classid='pg_class'::regclass AND member.objid=relation_entry.oid
      AND member.objsubid=0 AND member.refclassid='pg_extension'::regclass AND member.deptype='e'
    JOIN pg_extension extension_entry ON extension_entry.oid=member.refobjid
    WHERE namespace_entry.nspname='pscale_extensions' AND relation_entry.relkind='v'
      AND relation_entry.relname IN ('hypopg_hidden_indexes','hypopg_list_indexes')
      AND extension_entry.extname='hypopg') AS provider_hypopg_view_count,
  to_regclass('system.schema_migrations') IS NULL AS migration_ledger_absent;
