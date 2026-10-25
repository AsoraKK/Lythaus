import pg from 'pg';
import { branchQualifiedDatabaseTarget, adminDatabaseConnectionConfig } from './planetscale-0021-target-identity.mjs';
import { expectedMigrationPrefix } from './planetscale-migration-manifest.mjs';
import { runtimeSchemaFingerprint, canonicalReleaseSchemaContract, APPLICATION_SCHEMAS } from './product-integrity-schema-contract.mjs';
import { classifyMigrationState, assertCompleteMigrationPostconditions } from './planetscale-migration-reconciliation.mjs';
import { RESTORE, ROLE_NAMES, EXTENSIONS, requireThat, hash, assertRestoreRoleSqlBaseline } from './planetscale-native-restore-contract.mjs';

export function sourceConnection(raw, expectedOrigin) {
  const target = branchQualifiedDatabaseTarget(raw);
  requireThat(target.branchId === RESTORE.sourceId && target.role === 'pscale_api_qodocjs6vgrb'
    && target.sqlDatabaseName === 'postgres' && target.originFingerprint === expectedOrigin, 'existing_source_read_connection_mismatch');
  return raw;
}

export function restoredConnection(row, branchId, expectedRole) {
  requireThat(branchId !== RESTORE.sourceId && row?.base_username === expectedRole && ROLE_NAMES.includes(expectedRole)
    && row.username === `${expectedRole}.${branchId}` && row.branch?.id === branchId && row.branch.name === RESTORE.target
    && row.database_name === 'postgres' && typeof row.password === 'string' && row.password.length >= 16
    && typeof row.access_host_url === 'string' && /^[a-z0-9.-]+\.psdb\.cloud$/.test(row.access_host_url), 'restored_credential_identity_invalid');
  const url = new URL(`postgresql://${row.access_host_url}:5432/postgres?sslmode=verify-full`);
  url.username = row.username; url.password = row.password;
  return url.toString();
}

function closeOnAbort(client, signal) {
  let closing;
  const close = () => closing ??= Promise.resolve().then(() => client.end());
  const abort = () => { void close().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  return { close, detach: () => signal?.removeEventListener('abort', abort) };
}

export async function readOnly(raw, branchId, role, work, clientFactory = config => new pg.Client(config), signal) {
  const target = branchQualifiedDatabaseTarget(raw);
  requireThat(target.branchId === branchId && target.role === role && target.sqlDatabaseName === 'postgres', 'sql_connection_target_mismatch');
  const client = clientFactory({ ...adminDatabaseConnectionConfig(raw), connectionTimeoutMillis: 10000,
    statement_timeout: 15000, query_timeout: 20000, application_name: 'lythaus-native-restore-check' });
  client.on?.('error', () => {});
  const shutdown = closeOnAbort(client, signal);
  try {
    signal?.throwIfAborted();
    await client.connect();
    signal?.throwIfAborted();
    await client.query('BEGIN READ ONLY');
    const row = (await client.query(`SELECT current_database() AS database, current_user AS username,
      session_user AS session, current_setting('transaction_read_only') AS read_only,
      current_setting('server_version_num') AS version`)).rows[0];
    requireThat(row?.database === 'postgres' && [role, `${role}.${branchId}`].includes(row.username)
      && [role, `${role}.${branchId}`].includes(row.session) && row.read_only === 'on' && /^17\d{4}$/.test(row.version), 'sql_session_identity_invalid');
    const result = await work(client); signal?.throwIfAborted(); return result;
  } finally {
    try { if (!signal?.aborted) await client.query('ROLLBACK'); }
    finally { try { await shutdown.close(); } finally { shutdown.detach(); } }
  }
}

export async function collectRestoreCatalog(client) {
  const sections = {};
  const queries = {
    relations: `SELECT CASE WHEN c.relkind = 'v' THEN 'VIEW' ELSE 'BASE TABLE' END AS table_type,
      n.nspname AS table_schema, c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity,
      pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p','v') ORDER BY table_type,table_schema,table_name`,
    columns: `SELECT n.nspname AS schema, c.relname AS relation, a.attname AS name, a.attnum,
      format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull, a.attidentity, a.attgenerated,
      pg_get_expr(d.adbin,d.adrelid) AS expression FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p','v') AND a.attnum>0 AND NOT a.attisdropped
      ORDER BY schema,relation,a.attnum`,
    constraints: `SELECT n.nspname AS schema,c.relname AS relation,k.conname,k.contype,k.convalidated,
      pg_get_constraintdef(k.oid,true) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1::text[]) ORDER BY schema,relation,k.conname`,
    indexes: `SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=ANY($1::text[]) ORDER BY schemaname,tablename,indexname`,
    functions: `SELECT n.nspname AS schema,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=ANY($1::text[]) AND p.prokind IN ('f','p') ORDER BY schema,p.proname,arguments`,
    policies: `SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
      WHERE schemaname=ANY($1::text[]) ORDER BY schemaname,tablename,policyname`,
    acl: `WITH objects AS (
      SELECT n.nspname AS schema,''::text AS relation,''::text AS column_name,'schema' AS kind,n.nspacl AS acl
        FROM pg_namespace n WHERE n.nspname=ANY($1::text[])
      UNION ALL SELECT n.nspname,c.relname,'','relation',c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p','v','S')
      UNION ALL SELECT n.nspname,c.relname,a.attname,'column',a.attacl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped
    ) SELECT schema,relation,column_name,kind,acl IS NULL AS acl_is_null,
      ARRAY(SELECT json_build_object('grantor',pg_get_userbyid(e.grantor),'grantee',CASE WHEN e.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(e.grantee) END,
      'privilege',e.privilege_type,'grantable',e.is_grantable) FROM aclexplode(acl) e
      ORDER BY pg_get_userbyid(e.grantor),pg_get_userbyid(e.grantee),e.privilege_type) AS entries
      FROM objects ORDER BY schema,relation,column_name,kind`,
  };
  for (const [section, query] of Object.entries(queries)) {
    sections[section] = (await client.query(query, [APPLICATION_SCHEMAS])).rows;
    requireThat(sections[section].length < 10000, 'catalog_bound_exceeded');
  }
  const migrations = (await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version LIMIT 23')).rows;
  const approved = expectedMigrationPrefix('0020_auth_recovery_delivery.sql').map(row => ({ version: row.name, checksum: row.appliedSha256 }));
  requireThat(JSON.stringify(migrations) === JSON.stringify(approved), 'exact_pre_0021_registry_required');
  for (const state of await classifyMigrationState(client, approved.filter(row => row.version >= '0017_').map(row => row.version))) {
    assertCompleteMigrationPostconditions(state);
  }
  const staged = (await client.query(`SELECT to_regclass('media.media_upload_quarantine_cleanup_idx') IS NULL AS index_absent,
    NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='media.upload_sessions'::regclass
      AND attname='quarantine_deleted_at' AND NOT attisdropped) AS column_absent`)).rows[0];
  requireThat(staged?.index_absent === true && staged.column_absent === true, '0021_catalog_must_be_absent');
  const roles = (await client.query(`SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls
    FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname`, [ROLE_NAMES])).rows;
  const members = (await client.query(`SELECT r.rolname AS role,m.rolname AS member,g.rolname AS grantor,
    a.admin_option,a.inherit_option,a.set_option FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid
    JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor
    WHERE r.rolname=ANY($1::text[]) OR m.rolname=ANY($1::text[]) ORDER BY role,member,grantor`, [ROLE_NAMES])).rows;
  assertRestoreRoleSqlBaseline(roles, members);
  const extensions = (await client.query('SELECT extname,extversion FROM pg_extension WHERE extname=ANY($1::text[]) ORDER BY extname', [EXTENSIONS])).rows;
  const checks = [];
  for (const [table, privilege, columns] of [['trust.reward_redemptions', 'SELECT', ['id','user_id','reward_id','reward_level','reward_title','redeemed_at','status']],
    ['trust.reward_redemptions','INSERT',['id','user_id','reward_id','reward_level','reward_title']],
    ['editorial.publications','SELECT',['id','title','post_id','published_at']]]) {
    for (const column of columns) checks.push((await client.query('SELECT has_column_privilege($1,$2,$3,$4) AS permitted', [RESTORE.runtime, table, column, privilege])).rows[0]?.permitted);
  }
  checks.push((await client.query("SELECT has_schema_privilege($1,'editorial','USAGE') AS permitted", [RESTORE.runtime])).rows[0]?.permitted);
  requireThat(checks.length === 17 && checks.every(value => value === true), 'restored_approved_grants_not_present');
  const relations = sections.relations.map(({ table_type, table_schema, table_name }) => ({ table_type, table_schema, table_name }));
  const canonicalRelations = canonicalReleaseSchemaContract().relations;
  const keys = rows => rows.map(row => `${row.table_type}:${row.table_schema}.${row.table_name}`).sort();
  requireThat(JSON.stringify(keys(relations)) === JSON.stringify(keys(canonicalRelations)), 'restore_relation_contract_incomplete');
  return { catalogSha256: hash({ ...sections, migrations, roles, members, extensions }),
    schemaFingerprint: runtimeSchemaFingerprint(relations, migrations), relationCount: relations.length,
    schemaVersion: '0020_auth_recovery_delivery.sql', approvedPrivilegeChecks: 17, extensionCount: extensions.length };
}

export async function inspectExtensionAuthority(raw, branchId, clientFactory, signal) {
  return readOnly(raw, branchId, RESTORE.setup, async client => {
    const rows = (await client.query(`SELECT e.name,e.default_version,e.installed_version,v.trusted,v.superuser,
      has_database_privilege(current_user,current_database(),'CREATE') AS can_create_database,
      has_schema_privilege(current_user,'public','CREATE') AS can_create_schema,
      (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS is_superuser
      FROM pg_available_extensions e JOIN pg_available_extension_versions v ON v.name=e.name AND v.version=e.default_version
      WHERE e.name=ANY($1::text[]) ORDER BY e.name`, [EXTENSIONS])).rows;
    requireThat(rows.length === 3 && new Set(rows.map(row => row.name)).size === 3, 'required_extensions_unavailable');
    const missing = rows.filter(row => row.installed_version === null);
    requireThat(missing.every(row => row.can_create_database === true && row.can_create_schema === true
      && (row.trusted === true || row.superuser === false || row.is_superuser === true)), 'missing_extension_install_authority_unproven');
    return missing.map(row => row.name);
  }, clientFactory, signal);
}

export async function installMissingExtensions(raw, branchId, missing, clientFactory = config => new pg.Client(config), signal) {
  requireThat(branchId !== RESTORE.sourceId && missing.every(name => EXTENSIONS.includes(name)) && new Set(missing).size === missing.length,
    'extension_scope_invalid');
  const target = branchQualifiedDatabaseTarget(raw);
  requireThat(target.branchId === branchId && target.role === RESTORE.setup, 'extension_target_invalid');
  if (missing.length === 0) return;
  const client = clientFactory({ ...adminDatabaseConnectionConfig(raw), connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  client.on?.('error', () => {});
  const shutdown = closeOnAbort(client, signal);
  let committing = false;
  try {
    signal?.throwIfAborted(); await client.connect(); signal?.throwIfAborted(); await client.query('BEGIN');
    const row = (await client.query('SELECT current_user AS username,current_database() AS database')).rows[0];
    requireThat(row?.database === 'postgres' && [RESTORE.setup,`${RESTORE.setup}.${branchId}`].includes(row.username), 'extension_session_mismatch');
    for (const name of missing) { signal?.throwIfAborted(); await client.query(`CREATE EXTENSION "${name}"`); }
    signal?.throwIfAborted();
    committing = true; const committed = await client.query('COMMIT');
    requireThat(committed?.command === 'COMMIT', 'extension_commit_ack_missing', 'UNKNOWN_MUTATION_OUTCOME');
  } catch (error) {
    if (committing) throw Object.assign(new Error(), { extensionOutcomeUnknown: true });
    if (!signal?.aborted) await client.query('ROLLBACK'); throw error;
  } finally { try { await shutdown.close(); } finally { shutdown.detach(); } }
}
