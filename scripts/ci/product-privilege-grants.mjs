import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { branchQualifiedDatabaseTarget, adminDatabaseConnectionConfig } from './planetscale-0021-target-identity.mjs';
import { verifyHyperdriveTargets } from './verify-cloudflare-hyperdrive-targets.mjs';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';

export const TARGET = Object.freeze({ organization: 'lythaus', database: 'lythaus-core', branch: 'main',
  branchId: 'vqa2g2xc9wsl', sqlDatabase: 'postgres', admin: 'pscale_api_47syed2xlt6p',
  runtime: 'pscale_api_ysl604shosjg', verifier: 'pscale_api_qodocjs6vgrb', hyperdriveId: '3e59f07db51345aa896333ca861d1adf' });
export const BASELINE = Object.freeze({ runId: '39903199362', artifactId: '12479224877',
  sourceMainSha: 'cb69b16a607cf20579712770d8fdc70d0b6c9044',
  archiveSha256: 'e83a24a96f76fc877ee5b9bbd28b690c90efdea5a8e48abf9814d3e38455b53d',
  jsonSha256: 'b028f66a6dbb168feb3395d31093f27b17e85d4ff3a3af7a5c06285a12783e10' });
export const GRANT_SQL = `GRANT SELECT (id, user_id, reward_id, reward_level, reward_title, redeemed_at, status)
  ON trust.reward_redemptions TO "pscale_api_ysl604shosjg";
GRANT INSERT (id, user_id, reward_id, reward_level, reward_title)
  ON trust.reward_redemptions TO "pscale_api_ysl604shosjg";
GRANT USAGE ON SCHEMA editorial TO "pscale_api_ysl604shosjg";
GRANT SELECT (id, title, post_id, published_at)
  ON editorial.publications TO "pscale_api_ysl604shosjg";
`;
export const SQL_SHA256 = 'b61a4f8d24773a3e881b659badaeabc4167798a788f7f20eac05643f525f842f';
export const ROLLBACK_SQL_SHA256 = '79f3e6a0587b7f35ed56cd2283e54644b8313834edf05284f04c77bc28110c2a';
const SCOPES = [
  { schema: 'trust', relation: 'reward_redemptions', oid: 18357, schemaOid: 16763, owner: TARGET.admin, ownerOid: 18217,
    aclSha256: '326d72c50d9ba0d2a6df38d0f276de9732ffefd94f06fa3eb093d95885d3eda4',
    columns: { SELECT: ['id', 'user_id', 'reward_id', 'reward_level', 'reward_title', 'redeemed_at', 'status'],
      INSERT: ['id', 'user_id', 'reward_id', 'reward_level', 'reward_title'] } },
  { schema: 'editorial', relation: 'publications', oid: 17873, schemaOid: 16765, owner: 'postgres', ownerOid: 16409,
    aclSha256: 'bd85ed2a453398478213393dd959ebd339d8300ba5b39396c53326d227a0a31f',
    columns: { SELECT: ['id', 'title', 'post_id', 'published_at'] } },
];
const manifest = JSON.parse(fs.readFileSync(new URL('../../infrastructure/cloudflare/native-hyperdrive-production.json', import.meta.url)));
const checkedFailure = Symbol('checked_product_grant_failure');
const requireThat = (value, code) => { if (!value) throw Object.assign(new Error(code), { safeCode: code, [checkedFailure]: true }); };
const failureCode = error => error?.[checkedFailure] === true ? error.safeCode : 'operation_failed_details_redacted';
const oid = value => Number.isSafeInteger(value) && value > 0 && value <= 4294967295;
const safeRole = value => typeof value === 'string' && /^[A-Za-z0-9_$.-]{1,128}$/.test(value);
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const encode = value => JSON.stringify(stable(value));
const same = (a, b) => encode(a) === encode(b);
const order = (a, b) => encode(a) < encode(b) ? -1 : encode(a) > encode(b) ? 1 : 0;
const sha256 = value => createHash('sha256').update(value).digest('hex');
export const aclDigest = snapshot => sha256(encode(snapshot.map(item => ({ ...item, entries: [...item.entries].sort(order) })).sort(order)));
const versionKey = item => item.kind === 'column' ? `column:${item.column}` : item.kind;

async function readAcl(client, scope, relation) {
  const names = [...new Set(Object.values(scope.columns).flat())];
  const rows = (await client.query(`WITH target AS (
      SELECT relation.oid, relation.relowner, relation.relacl, relation.xmin::text AS table_xmin, relation.ctid::text AS table_tid,
        namespace.oid AS schema_oid, namespace.nspowner, namespace.nspacl, namespace.xmin::text AS schema_xmin, namespace.ctid::text AS schema_tid
      FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = $1 AND relation.relname = $2 AND relation.oid = $3::oid AND relation.relkind IN ('r', 'p')
    ), objects AS (
      SELECT 'schema'::text AS kind, NULL::text AS column_name, NULL::smallint AS attribute_number,
        schema_oid AS object_oid, nspowner AS owner_oid, nspacl AS acl, schema_xmin AS xmin, schema_tid AS tuple_id FROM target
      UNION ALL SELECT 'table', NULL, NULL, oid, relowner, relacl, table_xmin, table_tid FROM target
      UNION ALL SELECT 'column', a.attname, a.attnum, target.oid, target.relowner, a.attacl, a.xmin::text, a.ctid::text
      FROM target JOIN pg_catalog.pg_attribute a ON a.attrelid = target.oid
      WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attname = ANY($4::text[])
    ) SELECT kind, column_name, attribute_number, object_oid, owner_oid, pg_catalog.pg_get_userbyid(owner_oid) AS owner,
      acl IS NULL AS acl_is_null, xmin, tuple_id,
      ARRAY(SELECT pg_catalog.json_build_object('grantorOid', e.grantor::bigint, 'grantor', pg_catalog.pg_get_userbyid(e.grantor),
        'granteeOid', e.grantee::bigint, 'grantee', CASE WHEN e.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(e.grantee) END,
        'privilege', e.privilege_type, 'isGrantable', e.is_grantable)
        FROM pg_catalog.aclexplode(acl) e ORDER BY e.grantor, e.grantee, e.privilege_type LIMIT 513) AS entries
      FROM objects ORDER BY kind, column_name LIMIT 10`, [scope.schema, scope.relation, relation.oid, names])).rows;
  const expected = ['schema', 'table', ...names.map(name => `column:${name}`)];
  const snapshots = new Map(), versions = {};
  for (const row of rows) {
    const key = row.kind === 'column' ? `column:${row.column_name}` : row.kind;
    requireThat(expected.includes(key) && !snapshots.has(key) && oid(row.object_oid) && oid(row.owner_oid) && safeRole(row.owner)
      && typeof row.acl_is_null === 'boolean' && /^\d+$/.test(row.xmin) && /^\(\d+,\d+\)$/.test(row.tuple_id)
      && (row.kind === 'column' ? Number.isInteger(row.attribute_number) && row.attribute_number > 0 && row.attribute_number <= 32767
        : row.column_name === null && row.attribute_number === null)
      && (row.kind === 'schema' ? row.object_oid === relation.schema_oid && row.owner_oid === relation.schema_owner_oid
        : row.object_oid === relation.oid && row.owner_oid === relation.owner_oid && row.owner === relation.owner)
      && Array.isArray(row.entries) && row.entries.length <= 512 && (!row.acl_is_null || row.entries.length === 0), 'acl_metadata_invalid');
    const allowed = row.kind === 'schema' ? ['CREATE', 'USAGE'] : row.kind === 'column' ? ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']
      : ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
    const entries = row.entries.map(entry => {
      requireThat(oid(entry.grantorOid) && safeRole(entry.grantor) && (oid(entry.granteeOid) || entry.granteeOid === 0)
        && safeRole(entry.grantee) && (entry.granteeOid !== 0 || entry.grantee === 'PUBLIC')
        && allowed.includes(entry.privilege) && typeof entry.isGrantable === 'boolean', 'acl_metadata_invalid');
      return { grantorOid: entry.grantorOid, grantor: entry.grantor, granteeOid: entry.granteeOid,
        grantee: entry.grantee, privilege: entry.privilege, isGrantable: entry.isGrantable };
    });
    requireThat(new Set(entries.map(entry => `${entry.grantorOid}:${entry.granteeOid}:${entry.privilege}`)).size === entries.length, 'acl_metadata_invalid');
    snapshots.set(key, { kind: row.kind, ...(row.kind === 'column' ? { column: row.column_name, attributeNumber: row.attribute_number } : {}),
      objectOid: row.object_oid, ownerOid: row.owner_oid, owner: row.owner, aclIsNull: row.acl_is_null, entries });
    versions[key] = { xmin: row.xmin, tupleId: row.tuple_id };
  }
  requireThat(snapshots.size === expected.length
    && new Set(names.map(name => snapshots.get(`column:${name}`)?.attributeNumber)).size === names.length, 'acl_metadata_invalid');
  return { aclSnapshot: expected.map(key => snapshots.get(key)), versions };
}

export async function readProductGrantState(client, expectedRole, readOnly) {
  requireThat([TARGET.admin, TARGET.verifier].includes(expectedRole), 'unexpected_reader');
  const session = (await client.query(`SELECT pg_catalog.current_database() AS database, current_user AS current_user,
    session_user AS session_user, pg_catalog.current_setting('server_version_num') AS version,
    pg_catalog.current_setting('transaction_read_only') AS read_only`)).rows;
  requireThat(session.length === 1 && safeRole(session[0].database) && session[0].current_user === expectedRole
    && session[0].session_user === expectedRole && /^17\d{4}$/.test(session[0].version)
    && session[0].read_only === (readOnly ? 'on' : 'off'), 'connected_identity_or_transaction_mismatch');
  const rows = (await client.query(`SELECT oid, rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication,
    rolinherit, rolcanlogin FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname LIMIT 5`,
  [[TARGET.admin, TARGET.verifier, TARGET.runtime, 'postgres']])).rows;
  requireThat(rows.length === 4 && new Set(rows.map(row => row.rolname)).size === 4, 'roles_invalid');
  const roles = rows.map(row => {
    requireThat(oid(row.oid) && [TARGET.admin, TARGET.verifier, TARGET.runtime, 'postgres'].includes(row.rolname)
      && ['rolsuper', 'rolbypassrls', 'rolcreaterole', 'rolcreatedb', 'rolreplication', 'rolinherit', 'rolcanlogin']
        .every(key => typeof row[key] === 'boolean'), 'roles_invalid');
    return { oid: row.oid, name: row.rolname, superuser: row.rolsuper, bypassRls: row.rolbypassrls, createRole: row.rolcreaterole,
      createDatabase: row.rolcreatedb, replication: row.rolreplication, inherit: row.rolinherit, canLogin: row.rolcanlogin };
  });
  const byName = new Map(roles.map(role => [role.name, role])), runtime = byName.get(TARGET.runtime), admin = byName.get(TARGET.admin);
  requireThat(!admin.superuser && !byName.get(TARGET.verifier).superuser
    && !runtime.superuser && !runtime.bypassRls && !runtime.createRole && !runtime.createDatabase && !runtime.replication
    && runtime.inherit && runtime.canLogin, 'role_boundary_changed');
  const memberships = (await client.query(`SELECT count(*)::integer AS count FROM pg_catalog.pg_roles role
    WHERE role.oid <> $1::oid AND pg_catalog.pg_has_role($1::oid, role.oid, 'MEMBER')`, [runtime.oid])).rows;
  requireThat(memberships.length === 1 && memberships[0].count === 0, 'runtime_memberships_changed');
  const objects = [], checks = [];
  for (const scope of SCOPES) {
    const found = (await client.query(`SELECT relation.oid, namespace.oid AS schema_oid, relation.relowner AS owner_oid,
      namespace.nspowner AS schema_owner_oid, pg_catalog.pg_get_userbyid(relation.relowner) AS owner,
      relation.relrowsecurity AS rls, relation.relforcerowsecurity AS force_rls,
      (SELECT count(*)::integer FROM pg_catalog.pg_policy p WHERE p.polrelid = relation.oid) AS policies,
      pg_catalog.pg_has_role($1::oid, relation.relowner, 'USAGE') AS admin_owner,
      pg_catalog.pg_has_role($1::oid, namespace.nspowner, 'USAGE') AS admin_schema_owner,
      pg_catalog.pg_has_role($2::oid, relation.relowner, 'USAGE') AS runtime_owner,
      pg_catalog.has_schema_privilege($2::oid, namespace.oid, 'USAGE') AS schema_usage,
      pg_catalog.has_schema_privilege($2::oid, namespace.oid, 'CREATE') AS schema_create
      FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = $3 AND relation.relname = $4 AND relation.relkind IN ('r', 'p') LIMIT 2`,
    [admin.oid, runtime.oid, scope.schema, scope.relation])).rows;
    requireThat(found.length === 1, 'relation_invalid');
    const row = found[0];
    requireThat([row.oid, row.schema_oid, row.owner_oid, row.schema_owner_oid].every(oid) && row.owner === scope.owner
      && ['rls', 'force_rls', 'admin_owner', 'admin_schema_owner', 'runtime_owner', 'schema_usage', 'schema_create']
        .every(key => typeof row[key] === 'boolean') && row.policies === 0 && !row.rls && !row.force_rls
      && row.admin_owner && row.admin_schema_owner && !row.runtime_owner && !row.schema_create, 'relation_boundary_changed');
    const tablePrivileges = {};
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const result = (await client.query('SELECT pg_catalog.has_table_privilege($1::oid, $2::oid, $3) AS permitted', [runtime.oid, row.oid, privilege])).rows;
      requireThat(result.length === 1 && result[0].permitted === false, 'table_privilege_changed');
      tablePrivileges[privilege] = false;
    }
    const { aclSnapshot, versions } = await readAcl(client, scope, row);
    objects.push({ object: `${scope.schema}.${scope.relation}`, oid: row.oid, schemaOid: row.schema_oid, ownerOid: row.owner_oid,
      schemaOwnerOid: row.schema_owner_oid, owner: row.owner, schemaUsage: row.schema_usage, schemaCreate: row.schema_create,
      rowSecurity: row.rls, forceRowSecurity: row.force_rls, policyCount: row.policies,
      adminOwner: row.admin_owner, adminSchemaOwner: row.admin_schema_owner, runtimeOwner: row.runtime_owner,
      tablePrivileges, aclSnapshot, versions });
    const required = Object.entries(scope.columns).flatMap(([privilege, names]) => names.map(column => ({ column, privilege })));
    if (scope.schema === 'editorial') required.push({ column: null, privilege: 'USAGE' });
    for (const check of required) {
      const result = check.column ? await client.query(`SELECT a.attnum,
          pg_catalog.has_column_privilege($1::oid, a.attrelid, a.attnum, $4) AS permitted,
          pg_catalog.has_column_privilege($2::oid, a.attrelid, a.attnum, $4 || ' WITH GRANT OPTION') AS authority,
          pg_catalog.has_column_privilege($1::oid, a.attrelid, a.attnum, $4 || ' WITH GRANT OPTION') AS runtime_grantable
          FROM pg_catalog.pg_attribute a WHERE a.attrelid = $3::oid AND a.attname = $5 AND a.attnum > 0 AND NOT a.attisdropped LIMIT 2`,
      [runtime.oid, admin.oid, row.oid, check.privilege, check.column])
        : await client.query(`SELECT pg_catalog.has_schema_privilege($1::oid, $3::oid, $4) AS permitted,
          pg_catalog.has_schema_privilege($2::oid, $3::oid, $4 || ' WITH GRANT OPTION') AS authority,
          pg_catalog.has_schema_privilege($1::oid, $3::oid, $4 || ' WITH GRANT OPTION') AS runtime_grantable`,
        [runtime.oid, admin.oid, row.schema_oid, check.privilege]);
      requireThat(result.rows.length === 1 && typeof result.rows[0].permitted === 'boolean'
        && result.rows[0].authority === true && result.rows[0].runtime_grantable === false, 'grant_authority_or_options_changed');
      checks.push({ object: `${scope.schema}.${scope.relation}`, ...check, permitted: result.rows[0].permitted,
        authority: true, runtimeGrantable: false });
    }
  }
  return { session: { database: session[0].database, role: expectedRole, readOnly, version: session[0].version }, roles, runtimeMemberships: 0, objects, checks };
}

const comparable = state => ({ database: state.session.database, roles: state.roles, runtimeMemberships: state.runtimeMemberships, objects: state.objects, checks: state.checks });
export function assertPinnedBaseline(state) {
  requireThat(state.session.database === 'postgres', 'connected_database_changed');
  const roles = new Map(state.roles.map(role => [role.name, role.oid]));
  requireThat(roles.get(TARGET.admin) === 18217 && roles.get(TARGET.runtime) === 17980
    && roles.get(TARGET.verifier) === 18006 && roles.get('postgres') === 16409, 'role_oid_changed');
  requireThat(state.checks.length === 17 && state.checks.every(check => !check.permitted), 'preexisting_rights_or_incomplete_baseline');
  for (let i = 0; i < SCOPES.length; i++) {
    const object = state.objects[i], scope = SCOPES[i];
    requireThat(object.oid === scope.oid && object.schemaOid === scope.schemaOid && object.ownerOid === scope.ownerOid
      && object.schemaOwnerOid === 16409 && object.schemaUsage === (scope.schema === 'trust')
      && aclDigest(object.aclSnapshot) === scope.aclSha256, 'acl_baseline_changed');
  }
}

function assertDelta(before, after, transactionId) {
  requireThat(same(before.roles, after.roles) && after.runtimeMemberships === 0
    && after.checks.length === 17 && after.checks.every(check => check.permitted && check.authority && !check.runtimeGrantable), 'postconditions_failed');
  const runtime = after.roles.find(role => role.name === TARGET.runtime), introduced = [];
  for (let i = 0; i < SCOPES.length; i++) {
    const old = before.objects[i], next = after.objects[i], scope = SCOPES[i];
    requireThat(old.oid === next.oid && old.schemaOid === next.schemaOid && old.ownerOid === next.ownerOid
      && old.schemaOwnerOid === next.schemaOwnerOid && old.owner === next.owner && same(old.tablePrivileges, next.tablePrivileges)
      && next.schemaUsage === true, 'object_postconditions_failed');
    for (const previous of old.aclSnapshot) {
      const key = versionKey(previous), current = next.aclSnapshot.find(item => versionKey(item) === key);
      requireThat(current && same({ ...previous, entries: [], aclIsNull: false }, { ...current, entries: [], aclIsNull: false })
        && previous.entries.every(entry => current.entries.some(item => same(item, entry))), 'unrelated_acl_changed');
      const added = current.entries.filter(entry => !previous.entries.some(item => same(item, entry)));
      const allowed = previous.kind === 'schema' && scope.schema === 'editorial' ? ['USAGE'] : previous.kind === 'column'
        ? Object.entries(scope.columns).filter(([, names]) => names.includes(previous.column)).map(([privilege]) => privilege) : [];
      requireThat(added.length === allowed.length && (allowed.length ? !current.aclIsNull : current.aclIsNull === previous.aclIsNull)
        && added.every(entry => entry.granteeOid === runtime.oid && entry.grantee === TARGET.runtime && !entry.isGrantable
          && entry.grantorOid === previous.ownerOid && entry.grantor === previous.owner && allowed.includes(entry.privilege)), 'unexpected_acl_delta');
      if (allowed.length) {
        requireThat(BigInt(next.versions[key].xmin) === BigInt(transactionId) % 4294967296n, 'acl_not_written_by_this_transaction');
        introduced.push(...added.map(entry => ({ object: old.object, kind: previous.kind, column: previous.column ?? null, ...entry })));
      }
    }
  }
  requireThat(introduced.length === 17, 'unexpected_acl_delta');
  return introduced;
}

export async function applyApprovedProductGrants(client, before, checkpoint = () => {}) {
  const report = { status: 'BLOCKED', mutationOutcome: 'NOT_ATTEMPTED', statementsAttempted: 0, blockers: [], before };
  let inTransaction = false, commitAttempted = false;
  try {
    requireThat(sha256(GRANT_SQL) === SQL_SHA256 && before.checks.length === 17 && before.checks.every(check => !check.permitted), 'sql_or_baseline_invalid');
    await checkpoint({ ...report, phase: 'BEFORE_TRANSACTION' });
    await client.query('BEGIN READ WRITE'); inTransaction = true;
    await client.query('SET LOCAL search_path = pg_catalog');
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    await client.query("SET LOCAL lock_timeout = '1000ms'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '15000ms'");
    const lock = (await client.query("SELECT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('lythaus-approved-product-grants')) AS locked")).rows;
    requireThat(lock.length === 1 && lock[0].locked === true, 'grant_lock_unavailable');
    const fresh = await readProductGrantState(client, TARGET.admin, false);
    requireThat(same(comparable(before), comparable(fresh)), 'baseline_changed_before_grant');
    const transaction = (await client.query('SELECT pg_catalog.pg_current_xact_id()::text AS transaction_id')).rows;
    requireThat(transaction.length === 1 && /^\d+$/.test(transaction[0].transaction_id), 'transaction_provenance_unavailable');
    report.transactionId = transaction[0].transaction_id;
    report.mutationOutcome = 'IN_TRANSACTION';
    await checkpoint({ ...report, phase: 'BEFORE_GRANTS' });
    for (const sql of GRANT_SQL.match(/GRANT[\s\S]*?;/g)) { report.statementsAttempted++; await client.query(sql); }
    report.after = await readProductGrantState(client, TARGET.admin, false);
    report.introduced = assertDelta(before, report.after, report.transactionId);
    report.mutationOutcome = 'UNKNOWN_COMMIT_OUTCOME';
    await checkpoint({ ...report, phase: 'COMMIT_ATTEMPT_PENDING' });
    commitAttempted = true;
    const committed = await client.query('COMMIT');
    requireThat(committed.command === 'COMMIT', 'commit_acknowledgment_unavailable'); inTransaction = false;
    report.mutationOutcome = 'COMMITTED'; report.status = 'COMMITTED_READBACK_PENDING';
  } catch (error) {
    report.blockers.push(failureCode(error));
    if (commitAttempted) report.mutationOutcome = 'UNKNOWN_COMMIT_OUTCOME';
    else if (inTransaction) {
      try { await client.query('ROLLBACK'); report.mutationOutcome = 'ROLLED_BACK'; }
      catch { report.mutationOutcome = 'UNKNOWN_ROLLBACK_OUTCOME'; }
    }
  }
  return report;
}

function connection(raw, role, originFingerprint) {
  const target = branchQualifiedDatabaseTarget(raw);
  requireThat(target.role === role && target.branchId === TARGET.branchId && target.sqlDatabaseName === 'postgres'
    && target.originFingerprint === originFingerprint && target.origin.host.endsWith('.psdb.cloud'), 'configured_target_mismatch');
  return { ...adminDatabaseConnectionConfig(raw), connectionTimeoutMillis: 10_000, query_timeout: 10_000,
    application_name: 'lythaus-approved-product-grants' };
}

async function readOnly(client, role) {
  await client.query('BEGIN READ ONLY');
  try { await client.query('SET LOCAL search_path = pg_catalog'); return await readProductGrantState(client, role, true); }
  finally { await client.query('ROLLBACK'); }
}

export async function readBackCommittedGrants(adminConfig, verifierConfig, receipt, clientFactory = config => new pg.Client(config)) {
  requireThat(receipt.mutationOutcome === 'COMMITTED' && receipt.introduced?.length === 17, 'committed_receipt_required');
  for (const [config, role] of [[adminConfig, TARGET.admin], [verifierConfig, TARGET.verifier]]) {
    const proof = clientFactory(config); proof.on?.('error', () => undefined);
    try {
      await proof.connect();
      const snapshot = await readOnly(proof, role);
      requireThat(same(comparable(snapshot), comparable(receipt.after)), 'committed_readback_mismatch');
    } finally { await proof.end(); }
  }
}

export async function runProductGrants({ environment: env = process.env, fetchImpl = fetch,
  clientFactory = config => new pg.Client(config), verifyTargets = verifyHyperdriveTargets,
  reviewedOriginFingerprint = manifest.expectedMainOriginFingerprint, checkpoint = () => {} } = {}) {
  const report = { schemaVersion: 1, sourceMainSha: /^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? '') ? env.RELEASE_SHA : null,
    runId: /^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') ? env.GITHUB_RUN_ID : null, generatedAt: new Date().toISOString(),
    target: TARGET, baseline: BASELINE, sqlSha256: SQL_SHA256, rollbackSqlSha256: ROLLBACK_SQL_SHA256,
    status: 'BLOCKED', mutationOutcome: 'NOT_ATTEMPTED', providerMutations: false, productRowsRead: false, blockers: [] };
  let admin;
  const currentMain = async () => {
    const response = await fetchImpl('https://api.github.com/repos/AsoraKK/Lythaus/branches/main', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/json' },
    });
    requireThat(response.ok, 'current_main_read_failed');
    const branch = await response.json();
    requireThat(branch.protected === true && branch.commit?.sha === env.RELEASE_SHA, 'current_main_changed');
  };
  try {
    requireThat(report.sourceMainSha && report.runId && env.GITHUB_SHA === env.RELEASE_SHA && env.GITHUB_REF === 'refs/heads/main'
      && env.REF_PROTECTED === 'true' && env.GITHUB_REPOSITORY === 'AsoraKK/Lythaus' && env.GITHUB_REPOSITORY_ID === '1010752912'
      && env.GITHUB_RUN_ATTEMPT === '1' && env.GH_TOKEN, 'invalid_execution_context');
    const adminConfig = connection(env.PLANETSCALE_ADMIN_DATABASE_URL, TARGET.admin, reviewedOriginFingerprint);
    const verifierConfig = connection(env.PLANETSCALE_SCHEMA_READ_DATABASE_URL, TARGET.verifier, reviewedOriginFingerprint);
    requireThat(JSON.parse(env.PSCALE_ROLE_IDENTIFIERS ?? '{}').lythaus_runtime === TARGET.runtime, 'runtime_mapping_changed');
    await currentMain();
    const response = await fetchImpl('https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core/branches/main', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: planetScaleServiceTokenAuthorizationHeader(env.PLANETSCALE_API_TOKEN ?? ''), Accept: 'application/json' },
    });
    requireThat(response.ok, 'provider_branch_read_failed');
    const branch = await response.json();
    requireThat(branch.name === 'main' && branch.id === TARGET.branchId && branch.kind === 'postgresql'
      && branch.ready === true && branch.production === true, 'provider_branch_changed');
    const mapping = await verifyTargets({ fetchImpl, readOnlyGetOnly: true, environment: {
      CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: manifest.accountId,
      PLANETSCALE_SCHEMA_READ_DATABASE_URL: env.PLANETSCALE_SCHEMA_READ_DATABASE_URL,
      PSCALE_ROLE_IDENTIFIERS: JSON.stringify({ lythaus_runtime: TARGET.runtime }), PSCALE_BRANCH_NAME: 'main', HYPERDRIVE_VERIFY_IDS: TARGET.hyperdriveId,
    } });
    requireThat(mapping?.status === 'pass' && mapping.targetBranch === 'main' && mapping.originFingerprint === reviewedOriginFingerprint
      && mapping.bindings?.length === 1 && mapping.bindings[0].hyperdriveId === TARGET.hyperdriveId
      && mapping.bindings[0].roleClass === 'lythaus_runtime' && mapping.bindings[0].roleMatches === true, 'hyperdrive_mapping_changed');
    report.liveHyperdriveMappingVerified = true;
    admin = clientFactory(adminConfig); admin.on?.('error', () => undefined); await admin.connect();
    const before = await readOnly(admin, TARGET.admin);
    assertPinnedBaseline(before);
    await currentMain();
    Object.assign(report, await applyApprovedProductGrants(admin, before, progress => checkpoint({ ...report, ...progress })));
    await checkpoint(report);
    await admin.end(); admin = null;
    if (report.mutationOutcome !== 'COMMITTED') return report;
    await readBackCommittedGrants(adminConfig, verifierConfig, report, clientFactory);
    report.status = 'GRANTED_AND_READBACK_VERIFIED';
  } catch (error) {
    report.blockers.push(failureCode(error));
    if (report.mutationOutcome === 'COMMITTED') report.status = 'COMMITTED_READBACK_BLOCKED';
  } finally { if (admin) await admin.end().catch(() => undefined); }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const receiptPath = path.isAbsolute(process.env.RUNNER_TEMP ?? '') ? path.join(process.env.RUNNER_TEMP, 'product-privilege-grants.json') : null;
  const checkpoint = report => {
    requireThat(receiptPath, 'receipt_location_unavailable');
    fs.writeFileSync(receiptPath + '.tmp', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(receiptPath + '.tmp', receiptPath);
  };
  const report = process.argv.length !== 2
    ? { status: 'BLOCKED', mutationOutcome: 'NOT_ATTEMPTED', blockers: ['unexpected_arguments'] }
    : receiptPath ? await runProductGrants({ checkpoint })
      : { status: 'BLOCKED', mutationOutcome: 'NOT_ATTEMPTED', blockers: ['receipt_location_unavailable'] };
  if (receiptPath) {
    try { checkpoint(report); }
    catch {
      report.status = report.mutationOutcome === 'COMMITTED' ? 'COMMITTED_READBACK_BLOCKED' : 'BLOCKED';
      report.blockers.push('receipt_write_failed');
    }
  }
  console.log(JSON.stringify({ sourceMainSha: report.sourceMainSha, runId: report.runId,
    status: report.status, mutationOutcome: report.mutationOutcome, blockers: report.blockers }));
  if (report.status !== 'GRANTED_AND_READBACK_VERIFIED') process.exitCode = 2;
}
