import { createHash } from 'node:crypto';
import { branchQualifiedDatabaseTarget, adminDatabaseConnectionConfig } from './planetscale-0021-target-identity.mjs';
import { RESTORE_INVENTORY_TARGET as TARGET } from './planetscale-native-restore-inventory.mjs';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';
import { REBIND_BOUNDARY_SQL, REBIND_SIGNATURE, rebindGrantPayload, assertRebindBoundary } from './admin-subject-rebind-capability.mjs';
import { RESTORE, ROLE_SQL_SECURITY_BASELINE, EXTENSIONS } from './planetscale-native-restore-contract.mjs';

export const WORKFLOW = '.github/workflows/planetscale-cutover-identity-preflight.yml';
export const ROLES_ENDPOINT = 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core/branches/main/roles';
export const hash = value => createHash('sha256').update(value).digest('hex');
export class AuditFailure extends Error {}
export const check = (condition, code) => { if (!condition) throw new AuditFailure(code); };
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const safeId = value => typeof value === 'string' && /^[a-z0-9]{1,64}$/.test(value);
export const safeRole = value => typeof value === 'string' && /^pscale_api_[a-z0-9]{1,64}$/.test(value);
export const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value ? Date.parse(value) : NaN;

export function ownerContext(env) {
  check(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/Lythaus$/.test(env.GITHUB_REPOSITORY ?? '')
    && env.GITHUB_REPOSITORY_ID === '1010752912' && env.GITHUB_ACTOR_ID === '211295889'
    && env.GITHUB_ACTOR === env.GITHUB_REPOSITORY.split('/')[0] && env.GITHUB_RUN_ATTEMPT === '1'
    && env.GITHUB_REF === 'refs/heads/main' && env.REF_PROTECTED === 'true'
    && env.GITHUB_EVENT_NAME === 'workflow_dispatch'
    && env.GITHUB_WORKFLOW_REF === `${env.GITHUB_REPOSITORY}/${WORKFLOW}@refs/heads/main`
    && /^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? '') && env.GITHUB_SHA === env.RELEASE_SHA
    && /^[1-9]\d{0,14}$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9]\d{0,8}$/.test(env.GITHUB_RUN_NUMBER ?? ''),
  'protected_owner_context_required');
}

export function canonicalRoles(raw) {
  let roles; try { roles = JSON.parse(raw); } catch { throw new AuditFailure('canonical_role_map_invalid'); }
  const labels = ['runtime', 'admin', 'jobs', 'privacy', 'migrations'].map(label => `lythaus_${label}`);
  check(object(roles) && labels.every(label => safeRole(roles[label])), 'canonical_role_map_invalid');
  const result = Object.fromEntries(labels.map(label => [label, roles[label]]));
  check(new Set(Object.values(result)).size === 5, 'canonical_role_map_ambiguous');
  return result;
}

export function mainConnection(raw) {
  let target; try { target = branchQualifiedDatabaseTarget(raw); } catch { throw new AuditFailure('observer_target_invalid'); }
  check(target.branchId === TARGET.branchId && target.sqlDatabaseName === 'postgres'
    && target.originFingerprint === TARGET.originFingerprint && safeRole(target.role), 'observer_target_invalid');
  return target;
}

export async function providerRequest(env, fetchImpl, method, url, body) {
  check((method === 'GET' && (url === ROLES_ENDPOINT.replace(/\/roles$/, '') || url.startsWith(`${ROLES_ENDPOINT}?`)
    || new RegExp(`^${ROLES_ENDPOINT}/[a-z0-9]{1,64}$`).test(url)))
    || method === 'POST' && url === ROLES_ENDPOINT && object(body), 'provider_endpoint_forbidden');
  if (method === 'POST') check(Object.keys(body).sort().join(',') === 'inherited_roles,name,ttl,with_replication'
    && /^lythaus-migration-probe-\d{8}-\d{2}$/.test(body.name ?? '') && body.ttl === 900
    && Array.isArray(body.inherited_roles) && body.inherited_roles.length === 0 && body.with_replication === false,
  'provider_creation_profile_forbidden');
  let authorization; try { authorization = planetScaleServiceTokenAuthorizationHeader(env.PLANETSCALE_API_TOKEN); }
  catch { throw new AuditFailure('existing_provider_authority_missing'); }
  let response;
  try {
    response = await fetchImpl(url, { method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { authorization, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    check(response?.status === (method === 'POST' ? 201 : 200) && !response.redirected
      && (!response.url || response.url === url), 'provider_response_unverified');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength; check(size <= 1048576, 'provider_response_unverified'); chunks.push(chunk);
    }
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    check(object(result), 'provider_response_unverified'); return result;
  } catch (error) {
    if (error instanceof AuditFailure) throw error;
    throw new AuditFailure('provider_response_unverified');
  }
}

export async function roleInventory(env, fetchImpl = fetch) {
  const branch = await providerRequest(env, fetchImpl, 'GET', ROLES_ENDPOINT.replace(/\/roles$/, ''));
  check(branch.id === TARGET.branchId && branch.name === 'main' && branch.kind === 'postgresql'
    && branch.deleted_at === null, 'main_branch_unverified');
  const rows = [], ids = new Set(), names = new Set(); let total;
  for (let page = 1; page <= 5; page++) {
    const body = await providerRequest(env, fetchImpl, 'GET', `${ROLES_ENDPOINT}?page=${page}&per_page=100`);
    check(body.current_page === page && Number.isSafeInteger(body.total_count) && body.total_count >= 0
      && body.total_count <= 500 && Array.isArray(body.data) && body.data.length <= 100
      && Object.hasOwn(body, 'next_page'), 'role_pagination_incomplete');
    total ??= body.total_count;
    check(body.total_count === total, 'role_inventory_changed');
    for (const row of body.data) {
      check(object(row) && safeId(row.id) && safeRole(row.base_username)
        && row.username === `${row.base_username}.${TARGET.branchId}` && typeof row.ready === 'boolean'
        && row.branch?.id === TARGET.branchId && row.branch.name === 'main' && row.branch.deleted_at === null
        && !ids.has(row.id) && !names.has(row.base_username), 'role_inventory_invalid');
      ids.add(row.id); names.add(row.base_username); rows.push(row);
    }
    if (body.next_page === null) { check(rows.length === total, 'role_pagination_incomplete'); return rows; }
    check(body.next_page === page + 1 && page < 5, 'role_pagination_incomplete');
  }
  throw new AuditFailure('role_pagination_incomplete');
}

export function activeRole(row, now) {
  check(row?.ready === true && row.deleted_at === null && row.database_name === 'postgres'
    && (row.expires_at === null || Number.isFinite(Date.parse(row.expires_at)) && Date.parse(row.expires_at) > now),
  'canonical_role_not_active');
}

function catalogEscalation(grantees) {
  return `NOT EXISTS(WITH objects AS (
    SELECT 'pg_proc'::regclass AS classid,p.oid AS objid,0 AS subid,p.proowner AS owner,
      n.nspname,'function' AS kind,coalesce(p.proacl,acldefault('f',p.proowner)) AS acl,
      acldefault('f',p.proowner) AS fallback FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    UNION ALL SELECT 'pg_class'::regclass,c.oid,0,c.relowner,n.nspname,'relation',
      coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner)),
      acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    UNION ALL SELECT 'pg_class'::regclass,c.oid,x.attnum,c.relowner,n.nspname,'column',x.attacl,
      acldefault('r',c.relowner) FROM pg_attribute x JOIN pg_class c ON c.oid=x.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE x.attnum>0 AND NOT x.attisdropped
    UNION ALL SELECT 'pg_namespace'::regclass,n.oid,0,n.nspowner,n.nspname,'schema',
      coalesce(n.nspacl,acldefault('n',n.nspowner)),acldefault('n',n.nspowner) FROM pg_namespace n
  ) SELECT 1 FROM objects o, LATERAL aclexplode(o.acl) a
    WHERE (o.nspname ~ '^pg_' OR o.nspname='information_schema') AND ${grantees}
      AND (o.objid>=16384 OR NOT (
        EXISTS(SELECT 1 FROM aclexplode(coalesce((SELECT i.initprivs FROM pg_init_privs i
          WHERE i.classoid=o.classid AND i.objoid=o.objid AND i.objsubid=o.subid AND i.privtype='i'),o.fallback)) b
          WHERE b.grantee=0 AND b.privilege_type=a.privilege_type AND (NOT a.is_grantable OR b.is_grantable))
        OR o.kind='column' AND EXISTS(SELECT 1 FROM aclexplode(coalesce((SELECT i.initprivs FROM pg_init_privs i
          WHERE i.classoid=o.classid AND i.objoid=o.objid AND i.objsubid=0 AND i.privtype='i'),o.fallback)) b
          WHERE b.grantee=0 AND b.privilege_type=a.privilege_type AND (NOT a.is_grantable OR b.is_grantable))
        OR o.nspname='information_schema' AND NOT a.is_grantable
          AND (o.kind IN('relation','column') AND a.privilege_type='SELECT' OR o.kind='schema' AND a.privilege_type='USAGE')
      )))`;
}

export const PUBLIC_PROFILE_SQL = `SELECT
  ${catalogEscalation('a.grantee=0')} AS no_public_catalog_escalation,
  EXISTS(SELECT 1 FROM pg_database d, LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
    WHERE d.datname=current_database() AND a.grantee=0 AND a.privilege_type='CONNECT') AS public_connect,
  NOT EXISTS(SELECT 1 FROM pg_database d, LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
    WHERE d.datname=current_database() AND a.grantee=0 AND a.privilege_type='CREATE') AS no_public_database_create,
  NOT EXISTS(SELECT 1 FROM pg_namespace n, LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND a.grantee=0
      AND (a.privilege_type='CREATE' OR n.nspname<>'public' AND a.privilege_type='USAGE')) AS no_public_application_schema,
  NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
    LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND a.grantee=0) AS no_public_relations,
  NOT EXISTS(SELECT 1 FROM pg_attribute x JOIN pg_class c ON c.oid=x.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace,
    LATERAL aclexplode(x.attacl) a WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      AND x.attnum>0 AND NOT x.attisdropped AND a.grantee=0) AS no_public_columns,
  NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
    LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND a.grantee=0
      AND EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) s
        WHERE s.grantee=0 AND s.privilege_type='USAGE')) AS no_public_callable_application_functions,
  NOT EXISTS(SELECT 1 FROM pg_default_acl d, LATERAL aclexplode(d.defaclacl) a WHERE a.grantee=0)
    AS no_public_default_grants`;

export const CANONICAL_AUTHORITY_SQL = `SELECT
  current_database()='postgres' AND current_user=session_user AND current_user=$1
    AND current_setting('transaction_read_only')='on' AND current_setting('server_version_num')::integer BETWEEN 170000 AND 179999 AS observer_verified,
  EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$2 AND rolcanlogin AND NOT rolsuper AND NOT rolreplication
    AND NOT rolbypassrls AND (rolvaliduntil IS NULL OR rolvaliduntil>clock_timestamp())) AS canonical_login_valid,
  pg_has_role($2,'postgres','SET') AS canonical_can_set_owner,
  CASE WHEN pg_has_role($2,'postgres','SET') THEN has_parameter_privilege('postgres','lythaus.admin_subject_rebind_approval','SET')
    ELSE false END AS owner_policy_set,
  NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=ANY($3::text[]) AND
    (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
      OR pg_has_role(r.oid,'postgres','MEMBER') OR pg_has_role(r.oid,$2,'MEMBER'))) AS app_roles_isolated,
  (SELECT count(*)=4 FROM pg_roles WHERE rolname=ANY($3::text[])) AS app_roles_present`;

export const ROLE_DETAIL_SQL = `WITH canonical AS (SELECT * FROM pg_roles WHERE rolname=$1) SELECT
  EXISTS(SELECT 1 FROM canonical) AS canonical_role_present,
  EXISTS(SELECT 1 FROM canonical WHERE rolcanlogin) AS canonical_can_login,
  EXISTS(SELECT 1 FROM canonical WHERE rolsuper) AS canonical_superuser,
  EXISTS(SELECT 1 FROM canonical WHERE rolcreatedb) AS canonical_create_database,
  EXISTS(SELECT 1 FROM canonical WHERE rolcreaterole) AS canonical_create_role,
  EXISTS(SELECT 1 FROM canonical WHERE rolreplication) AS canonical_replication,
  EXISTS(SELECT 1 FROM canonical WHERE rolbypassrls) AS canonical_bypass_rls,
  EXISTS(SELECT 1 FROM canonical WHERE rolvaliduntil IS NULL OR rolvaliduntil>clock_timestamp()) AS canonical_unexpired,
  coalesce(pg_has_role((SELECT oid FROM pg_roles WHERE rolname=current_user),(SELECT oid FROM canonical),'SET'),false)
    AS executor_can_set_canonical,
  pg_has_role(current_user,'postgres','SET') AS executor_can_set_owner,
  has_parameter_privilege(current_user,'lythaus.admin_subject_rebind_approval','SET WITH GRANT OPTION')
    AS executor_parameter_grant_option,
  has_parameter_privilege('postgres','lythaus.admin_subject_rebind_approval','SET WITH GRANT OPTION')
    AS owner_parameter_grant_option,
  EXISTS(SELECT 1 FROM pg_parameter_acl WHERE parname='lythaus.admin_subject_rebind_approval') AS policy_parameter_acl_present`;

export const PUBLIC_FUNCTION_CATEGORY_SQL = `WITH callable AS (
  SELECT p.prosecdef, EXISTS(SELECT 1 FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid
    WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.objsubid=0
      AND d.refclassid='pg_extension'::regclass AND d.deptype='e' AND e.extname=ANY($1::text[])) AS known_extension
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
    AND EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
    AND EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE a.grantee=0 AND a.privilege_type='USAGE')
) SELECT count(*)::integer AS total,
  (count(*) FILTER(WHERE known_extension))::integer AS known_extension,
  (count(*) FILTER(WHERE NOT known_extension))::integer AS other,
  (count(*) FILTER(WHERE prosecdef))::integer AS security_definer FROM callable`;

export const ROLE_DETAIL_KEYS = ['canonical_role_present', 'canonical_can_login', 'canonical_superuser',
  'canonical_create_database', 'canonical_create_role', 'canonical_replication', 'canonical_bypass_rls',
  'canonical_unexpired', 'executor_can_set_canonical', 'executor_can_set_owner',
  'executor_parameter_grant_option', 'owner_parameter_grant_option', 'policy_parameter_acl_present'];
const FUNCTION_CATEGORY_KEYS = ['total', 'known_extension', 'other', 'security_definer'];

export function roleDiagnostic(row, canonicalRole) {
  allTrue(row, ROLE_DETAIL_KEYS);
  const baseline = ROLE_SQL_SECURITY_BASELINE[RESTORE.setup];
  const fields = { rolsuper: 'canonical_superuser', rolbypassrls: 'canonical_bypass_rls',
    rolcreaterole: 'canonical_create_role', rolcreatedb: 'canonical_create_database',
    rolreplication: 'canonical_replication', rolcanlogin: 'canonical_can_login' };
  const identityMatches = canonicalRole === RESTORE.setup;
  return { ...row, pinned_setup_identity_matches: identityMatches,
    pinned_setup_profile_matches: identityMatches && row.canonical_role_present && row.canonical_unexpired
      && Object.entries(fields).every(([flag, key]) => row[key] === baseline[flag]) };
}

export function functionDiagnostic(row) {
  check(object(row) && Object.keys(row).sort().join(',') === [...FUNCTION_CATEGORY_KEYS].sort().join(',')
    && FUNCTION_CATEGORY_KEYS.every(key => Number.isSafeInteger(row[key]) && row[key] >= 0 && row[key] <= 1000000)
    && row.total === row.known_extension + row.other && row.security_definer <= row.total,
  'function_category_shape_unverified');
  return row;
}

export const PROBE_PROFILE_SQL = `SELECT
  ${catalogEscalation("a.grantee IN(0,(SELECT oid FROM pg_roles WHERE rolname=$1))")} AS no_catalog_escalation,
  current_user=session_user AND current_user=$1 AND current_database()='postgres'
    AND current_setting('transaction_read_only')='on' AS identity_read_only,
  EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=$1 AND r.rolcanlogin AND NOT r.rolsuper
    AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls) AS flags_safe,
  NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS no_memberships,
  NOT EXISTS(SELECT 1 FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass
    AND d.refobjid=(SELECT oid FROM pg_roles WHERE rolname=$1) AND d.deptype='o'
    AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))) AS owns_no_objects,
  NOT has_database_privilege(current_user,current_database(),'CREATE') AS no_database_create,
  NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
    AND (has_schema_privilege(current_user,n.oid,'CREATE') OR n.nspname<>'public' AND has_schema_privilege(current_user,n.oid,'USAGE')))
    AS no_application_schema,
  NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN('r','p','v','m','f','S')
      AND (c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR CASE WHEN c.relkind='S'
        THEN has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')
        ELSE has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END)) AS no_application_relations,
  NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      AND (p.proowner=(SELECT oid FROM pg_roles WHERE rolname=$1)
        OR has_schema_privilege(current_user,n.oid,'USAGE') AND has_function_privilege(current_user,p.oid,'EXECUTE')))
    AS no_callable_application_functions`;

export function allTrue(row, keys) {
  check(object(row) && Object.keys(row).sort().join(',') === [...keys].sort().join(',')
    && keys.every(key => typeof row[key] === 'boolean'), 'catalog_shape_unverified');
  return keys.every(key => row[key]);
}
export const PUBLIC_KEYS = ['no_public_catalog_escalation', 'public_connect', 'no_public_database_create', 'no_public_application_schema',
  'no_public_relations', 'no_public_columns', 'no_public_callable_application_functions', 'no_public_default_grants'];
export const AUTHORITY_KEYS = ['observer_verified', 'canonical_login_valid', 'canonical_can_set_owner', 'owner_policy_set',
  'app_roles_isolated', 'app_roles_present'];
export const PROBE_KEYS = ['no_catalog_escalation', 'identity_read_only', 'flags_safe', 'no_memberships', 'owns_no_objects', 'no_database_create',
  'no_application_schema', 'no_application_relations', 'no_callable_application_functions'];

export async function readOnly(raw, clientFactory, work, applicationName) {
  const target = mainConnection(raw);
  const client = clientFactory({ ...adminDatabaseConnectionConfig(raw), connectionTimeoutMillis: 10000,
    statement_timeout: 5000, query_timeout: 7000, lock_timeout: 1000, idle_in_transaction_session_timeout: 60000,
    application_name: applicationName, options: '-c default_transaction_read_only=on' });
  client.on?.('error', () => {}); let count = 0;
  const query = async (sql, values) => {
    check(++count <= 8, 'catalog_query_budget_exceeded');
    return client.query(sql, values);
  };
  try {
    try { await client.connect(); } catch (error) {
      if (error?.code === '28P01') throw new AuditFailure('sql_authentication_rejected');
      throw new AuditFailure('sql_connection_unverified');
    }
    await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return await work(query, target);
  } finally {
    try { await client.end(); } catch { throw new AuditFailure('sql_session_close_unverified'); }
  }
}

export async function auditMigrationRole({ env, fetchImpl = fetch, clientFactory, now = Date.now(), root = process.cwd(), underLock }) {
  ownerContext(env);
  const roles = canonicalRoles(env.PSCALE_ROLE_IDENTIFIERS), target = mainConnection(env.PLANETSCALE_ADMIN_DATABASE_URL);
  const inventory = await roleInventory(env, fetchImpl);
  for (const role of Object.values(roles)) {
    const found = inventory.filter(row => row.base_username === role);
    check(found.length === 1, 'canonical_provider_identity_unverified'); activeRole(found[0], now);
  }
  const payload = rebindGrantPayload({ root });
  const catalog = await readOnly(env.PLANETSCALE_ADMIN_DATABASE_URL, clientFactory, async query => {
    const lock = await query("SELECT pg_try_advisory_xact_lock(hashtext('lythaus-schema-migrations')) AS locked");
    check(lock.rows?.[0]?.locked === true, 'migration_coordination_busy');
    const authority = (await query(CANONICAL_AUTHORITY_SQL, [target.role, roles.lythaus_migrations,
      [roles.lythaus_runtime, roles.lythaus_admin, roles.lythaus_jobs, roles.lythaus_privacy]])).rows?.[0];
    const publicProfile = (await query(PUBLIC_PROFILE_SQL)).rows?.[0];
    const authorityReady = allTrue(authority, AUTHORITY_KEYS), probeProfileReady = allTrue(publicProfile, PUBLIC_KEYS);
    const roleDetails = roleDiagnostic((await query(ROLE_DETAIL_SQL, [roles.lythaus_migrations])).rows?.[0], roles.lythaus_migrations);
    const publicFunctionCategories = functionDiagnostic((await query(PUBLIC_FUNCTION_CATEGORY_SQL, [EXTENSIONS])).rows?.[0]);
    const boundary = await query(REBIND_BOUNDARY_SQL, [roles.lythaus_admin, roles.lythaus_runtime,
      roles.lythaus_jobs, roles.lythaus_privacy, REBIND_SIGNATURE]);
    check(Array.isArray(boundary.rows) && boundary.rowCount === boundary.rows.length && boundary.rows.length <= 1,
      'disabled_function_inventory_unverified');
    if (boundary.rows.length) {
      try { assertRebindBoundary(boundary.rows[0], payload); } catch { throw new AuditFailure('existing_function_boundary_unsafe'); }
      throw new AuditFailure('existing_capability_disabled_state_unverified');
    }
    const result = { authority, publicProfile, authorityReady, probeProfileReady, roleDetails, publicFunctionCategories,
      functionState: 'ABSENT' };
    if (underLock) {
      check(authorityReady && probeProfileReady, 'fresh_role_or_public_profile_blocked');
      await underLock({ roles, inventory, catalog: result, query });
    }
    return result;
  }, 'lythaus-migration-role-audit');
  return { schemaVersion: 'lythaus-migration-role-audit-v1', sourceMainSha: env.RELEASE_SHA,
    runId: env.GITHUB_RUN_ID, runAttempt: 1, generatedAt: new Date(now).toISOString(),
    status: catalog.authorityReady && catalog.probeProfileReady ? 'AUDIT_READY_NOT_INSTALL_AUTHORITY' : 'BLOCKED',
    targetVerified: true, canonicalIdentitiesVerified: true,
    existingExecutorMatchesCanonical: target.role === roles.lythaus_migrations,
    canonicalMapSha256: hash(JSON.stringify(roles)), grantSha256: payload.sha256, roleGrantsSha256: payload.roleGrantsSha256,
    ...catalog, providerMutations: false, credentialsCreated: false, databaseWrites: false,
    installerQualified: false, loginVerified: false };
}
