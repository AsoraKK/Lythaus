export const NEW_CORE_PROVIDER_BASELINE = Object.freeze({
  schema: 'pscale_extensions',
  extension: 'hypopg',
  views: Object.freeze(['hypopg_hidden_indexes', 'hypopg_list_indexes']),
});

export const NEW_CORE_PROVIDER_BASELINE_SQL = `SELECT
  namespace_entry.nspowner = extension_entry.extowner AS provider_schema_owner_matches,
  (SELECT count(*)::integer FROM pg_class relation_entry
    WHERE relation_entry.relnamespace = namespace_entry.oid
      AND relation_entry.relname = ANY($3::text[]) AND relation_entry.relkind = 'v'
      AND relation_entry.relowner = extension_entry.extowner
      AND EXISTS (SELECT 1 FROM pg_depend member
        WHERE member.classid = 'pg_class'::regclass AND member.objid = relation_entry.oid
          AND member.objsubid = 0 AND member.refclassid = 'pg_extension'::regclass
          AND member.refobjid = extension_entry.oid AND member.deptype = 'e')) AS provider_view_count,
  (SELECT count(*)::integer FROM pg_class relation_entry
    WHERE relation_entry.relnamespace = namespace_entry.oid
      AND NOT (relation_entry.relname = ANY($3::text[]) AND relation_entry.relkind = 'v'
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
            AND view_entry.relname = ANY($3::text[]) AND view_entry.relkind = 'v'))
      )) AS provider_unexpected_namespace_dependency_count
FROM pg_namespace namespace_entry
JOIN pg_extension extension_entry ON extension_entry.extnamespace = namespace_entry.oid
WHERE namespace_entry.nspname = $1 AND extension_entry.extname = $2`;

export function assertNewCoreProviderBaseline(row) {
  if (!row || row.provider_schema_owner_matches !== true
    || Number(row.provider_view_count) !== 2
    || Number(row.provider_unexpected_relation_count) !== 0
    || Number(row.provider_unexpected_namespace_dependency_count) !== 0) {
    throw new Error('new_core_provider_extension_baseline_mismatch');
  }
}

export async function assertNewCoreEmptyCatalog(client, counts) {
  const schemas = Number(counts?.application_schema_count);
  const relations = Number(counts?.application_relation_count);
  if (schemas === 0 && relations === 0) {
    return { applicationSchemas: 0, applicationRelations: 0, providerExtensionSchemas: 0, providerExtensionViews: 0 };
  }
  if (schemas !== 1 || relations !== 2) throw new Error('new_core_application_catalog_not_empty');
  const result = await client.query(NEW_CORE_PROVIDER_BASELINE_SQL, [
    NEW_CORE_PROVIDER_BASELINE.schema, NEW_CORE_PROVIDER_BASELINE.extension,
    [...NEW_CORE_PROVIDER_BASELINE.views],
  ]);
  if (result.rows.length !== 1) throw new Error('new_core_provider_extension_baseline_mismatch');
  assertNewCoreProviderBaseline(result.rows[0]);
  return { applicationSchemas: 0, applicationRelations: 0, providerExtensionSchemas: 1,
    providerExtensionViews: 2, extension: NEW_CORE_PROVIDER_BASELINE.extension };
}
