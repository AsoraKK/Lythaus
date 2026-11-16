-- Read-only follow-up to the owner-reported preflight (one schema, two relations).
-- Use only the same approved lythaus / lythaus-new-core / main console target,
-- logical database postgres. Never query application records or apply DDL.
BEGIN TRANSACTION READ ONLY;

SELECT
  namespace_entry.nspname AS schema_name,
  relation_entry.relname AS relation_name,
  relation_entry.relkind AS relation_kind,
  extension_entry.extname AS extension_name,
  namespace_owner.rolname = 'postgres' AS schema_owner_is_postgres,
  relation_owner.rolname = 'postgres' AS relation_owner_is_postgres
FROM pg_namespace namespace_entry
LEFT JOIN pg_class relation_entry
  ON relation_entry.relnamespace = namespace_entry.oid
  AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
LEFT JOIN pg_roles namespace_owner ON namespace_owner.oid = namespace_entry.nspowner
LEFT JOIN pg_roles relation_owner ON relation_owner.oid = relation_entry.relowner
LEFT JOIN pg_depend extension_dependency
  ON extension_dependency.classid = 'pg_class'::regclass
  AND extension_dependency.objid = relation_entry.oid
  AND extension_dependency.objsubid = 0
  AND extension_dependency.refclassid = 'pg_extension'::regclass
  AND extension_dependency.deptype = 'e'
LEFT JOIN pg_extension extension_entry
  ON extension_entry.oid = extension_dependency.refobjid
WHERE namespace_entry.nspname NOT LIKE 'pg_%'
  AND namespace_entry.nspname <> 'information_schema'
  AND (namespace_entry.nspname <> 'public' OR relation_entry.oid IS NOT NULL)
ORDER BY schema_name, relation_name, extension_name;

ROLLBACK;
-- Object names and extension membership are evidence to classify the existing
-- objects, not permission to exclude, alter or delete them. Stop before DDL.
