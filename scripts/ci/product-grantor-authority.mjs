import { PRODUCT_PRIVILEGE_REQUIREMENTS } from './product-privilege-preflight.mjs';

export const PRODUCT_GRANTOR_CHECKS = Object.freeze([
  ...PRODUCT_PRIVILEGE_REQUIREMENTS.filter(item => item.scope === 'proposed_additional')
    .flatMap(item => Object.entries(item.columns).flatMap(([privilege, columns]) => columns.map(column =>
      Object.freeze({ schema: item.schema, relation: item.relation, column, privilege })))),
  Object.freeze({ schema: 'editorial', privilege: 'USAGE' }),
]);

export async function inspectProductGrantorAuthority(client) {
  try {
    const state = (await client.query('SHOW transaction_read_only')).rows;
    if (state.length !== 1 || state[0].transaction_read_only !== 'on') {
      return { status: 'BLOCKED', grantsExecuted: false, reason: 'product_grantor_read_only_not_confirmed', checks: [] };
    }
    const checks = [];
    for (const check of PRODUCT_GRANTOR_CHECKS) {
      const result = check.column
        ? await client.query(`SELECT pg_catalog.has_column_privilege(current_user,
            relation.oid, attribute.attnum, $4) AS grantable
          FROM pg_catalog.pg_class relation
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
          JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = relation.oid
          WHERE namespace.nspname = $1 AND relation.relname = $2
            AND relation.relkind IN ('r', 'p') AND attribute.attname = $3
            AND attribute.attnum > 0 AND NOT attribute.attisdropped LIMIT 2`,
        [check.schema, check.relation, check.column, `${check.privilege} WITH GRANT OPTION`])
        : await client.query(`SELECT pg_catalog.has_schema_privilege(current_user,
            namespace.oid, $2) AS grantable
          FROM pg_catalog.pg_namespace namespace WHERE namespace.nspname = $1 LIMIT 2`,
        [check.schema, `${check.privilege} WITH GRANT OPTION`]);
      if (result.rows.length !== 1 || typeof result.rows[0].grantable !== 'boolean') {
        return { status: 'BLOCKED', grantsExecuted: false, reason: 'product_grantor_catalog_evidence_incomplete', checks };
      }
      checks.push({ ...check, grantable: result.rows[0].grantable });
    }
    return { status: checks.every(check => check.grantable)
      ? 'AUTHORITY_PRESENT_NOT_EXECUTED' : 'BLOCKED', grantsExecuted: false,
    reason: checks.every(check => check.grantable) ? null : 'product_grantor_authority_missing', checks };
  } catch {
    return { status: 'BLOCKED', grantsExecuted: false, reason: 'product_grantor_catalog_probe_failed', checks: [] };
  }
}
