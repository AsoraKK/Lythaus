import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { branchQualifiedDatabaseTarget } from './planetscale-0021-target-identity.mjs';
import { verifyHyperdriveTargets } from './verify-cloudflare-hyperdrive-targets.mjs';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../../infrastructure/cloudflare/native-hyperdrive-production.json', import.meta.url)));
export const PRODUCT_PRIVILEGE_TARGET = Object.freeze({
  worker: 'lythaus-public-api-development', binding: 'DB_APP_FRESH',
  hyperdriveId: '3e59f07db51345aa896333ca861d1adf', roleClass: 'lythaus_runtime',
});
const activityColumns = ['id', 'user_id', 'actor_user_id', 'event_type', 'category', 'source', 'source_event_id',
  'correlation_id', 'title', 'explanation', 'result', 'reason_code', 'policy_version', 'object_type', 'object_id',
  'reputation_effect', 'appealable', 'metadata', 'retention_class', 'retention_until', 'created_at'];
const activityReadColumns = activityColumns.filter(column => column !== 'retention_until');
export const PRODUCT_PRIVILEGE_REQUIREMENTS = [
  { schema: 'trust', relation: 'reward_redemptions', scope: 'proposed_additional', columns: {
    SELECT: ['id', 'user_id', 'reward_id', 'reward_level', 'reward_title', 'redeemed_at', 'status'],
    INSERT: ['id', 'user_id', 'reward_id', 'reward_level', 'reward_title'],
  } },
  { schema: 'editorial', relation: 'publications', scope: 'proposed_additional', columns: { SELECT: ['id', 'title', 'post_id', 'published_at'] } },
  { schema: 'identity', relation: 'users', scope: 'existing_prerequisite', columns: { SELECT: ['id', 'created_at', 'status', 'deleted_at'] } },
  { schema: 'identity', relation: 'user_entitlements', scope: 'existing_prerequisite', columns: { SELECT: ['user_id', 'subscription_tier'] } },
  { schema: 'trust', relation: 'reputation_profiles', scope: 'existing_prerequisite', columns: { SELECT: ['user_id', 'current_level'] } },
  { schema: 'content', relation: 'posts', scope: 'existing_prerequisite', columns: { SELECT: ['id', 'body', 'author_id', 'visibility', 'moderation_state', 'deleted_at'] } },
  { schema: 'content', relation: 'content_declarations', scope: 'existing_prerequisite', columns: { SELECT: ['post_id', 'public_label'] } },
  { schema: 'social', relation: 'blocks', scope: 'existing_prerequisite', columns: { SELECT: ['blocker_id', 'blocked_id'] } },
  { schema: 'social', relation: 'mutes', scope: 'existing_prerequisite', columns: { SELECT: ['muter_id', 'muted_id'] } },
  { schema: 'social', relation: 'follows', scope: 'existing_prerequisite', columns: { SELECT: ['follower_id', 'followed_id'] } },
  { schema: 'social', relation: 'reactions', scope: 'existing_prerequisite', columns: { SELECT: ['post_id', 'user_id', 'reaction_type'] } },
  { schema: 'system', relation: 'idempotency_keys', scope: 'existing_prerequisite', columns: {
    SELECT: ['scope', 'key', 'actor_id', 'response', 'created_at'], INSERT: ['scope', 'key', 'actor_id', 'response'], UPDATE: ['response'],
  } },
  { schema: 'system', relation: 'rate_limit_windows', scope: 'existing_prerequisite', columns: {
    SELECT: ['scope', 'subject_hash', 'window_started_at', 'request_count'],
    INSERT: ['scope', 'subject_hash', 'window_started_at', 'request_count', 'expires_at'], UPDATE: ['request_count'],
  } },
  { schema: 'trust', relation: 'user_activity_events', scope: 'existing_prerequisite', columns: { SELECT: activityReadColumns, INSERT: activityColumns } },
];

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function safeRole(value) { return typeof value === 'string' && /^[A-Za-z0-9_$.-]{1,128}$/.test(value) ? value : null; }
async function probe(client, text, values = []) {
  try { return await client.query(text, values); } catch { fail('catalog_probe_failed'); }
}

async function inspectAclSnapshot(client, requirement, relation) {
  const columns = [...new Set(Object.values(requirement.columns).flat())];
  const rows = (await probe(client, `WITH target AS (
      SELECT relation.oid, relation.relowner, relation.relacl,
        namespace.oid AS schema_oid, namespace.nspowner, namespace.nspacl
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = $1 AND relation.relname = $2 AND relation.oid = $3::oid
        AND relation.relkind IN ('r', 'p')
    ), acl_objects AS (
      SELECT 'schema'::text AS kind, NULL::text AS column_name, NULL::smallint AS attribute_number,
        schema_oid AS object_oid, nspowner AS owner_oid, nspacl AS acl FROM target
      UNION ALL
      SELECT 'table', NULL, NULL, oid, relowner, relacl FROM target
      UNION ALL
      SELECT 'column', attribute.attname, attribute.attnum, target.oid, target.relowner, attribute.attacl
      FROM target JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = target.oid
      WHERE attribute.attnum > 0 AND NOT attribute.attisdropped AND attribute.attname = ANY($4::text[])
    )
    SELECT object.kind, object.column_name, object.attribute_number, object.object_oid, object.owner_oid,
      pg_catalog.pg_get_userbyid(object.owner_oid) AS owner, object.acl IS NULL AS acl_is_null,
      entry.grantor AS grantor_oid, pg_catalog.pg_get_userbyid(entry.grantor) AS grantor,
      entry.grantee AS grantee_oid,
      CASE WHEN entry.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(entry.grantee) END AS grantee,
      entry.privilege_type AS privilege, entry.is_grantable
    FROM acl_objects object LEFT JOIN LATERAL pg_catalog.aclexplode(object.acl) entry ON true
    ORDER BY object.kind, object.column_name, entry.grantor, entry.grantee, entry.privilege_type
    LIMIT 513`, [requirement.schema, requirement.relation, relation.oid, columns])).rows;
  const expected = ['schema', 'table', ...columns.map(column => `column:${column}`)];
  const snapshots = new Map();
  const oid = value => Number.isSafeInteger(value) && value > 0 && value <= 4294967295;
  const privileges = { schema: ['USAGE', 'CREATE'], table: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
    column: ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] };
  const invalid = () => fail('relation_acl_metadata_unavailable');
  if (rows.length > 512) invalid();
  for (const row of rows) {
    const key = row.kind === 'column' ? `column:${row.column_name}` : row.kind;
    if (!expected.includes(key) || !oid(row.object_oid) || !oid(row.owner_oid) || !safeRole(row.owner)
      || typeof row.acl_is_null !== 'boolean'
      || (row.kind === 'column' ? !Number.isInteger(row.attribute_number) || row.attribute_number <= 0
        : row.column_name !== null || row.attribute_number !== null)
      || (row.kind !== 'schema' && (row.object_oid !== relation.oid || row.owner !== relation.owner))) invalid();
    const metadata = { kind: row.kind, ...(row.kind === 'column' ? { column: row.column_name, attributeNumber: row.attribute_number } : {}),
      objectOid: row.object_oid, ownerOid: row.owner_oid, owner: row.owner, aclIsNull: row.acl_is_null };
    let snapshot = snapshots.get(key);
    if (!snapshot) { snapshot = { metadata, entries: [], seen: new Set(), empty: false }; snapshots.set(key, snapshot); }
    if (JSON.stringify(snapshot.metadata) !== JSON.stringify(metadata) || snapshot.empty) invalid();
    const fields = ['grantor_oid', 'grantor', 'grantee_oid', 'grantee', 'privilege', 'is_grantable'];
    if (fields.every(field => row[field] === null)) {
      if (snapshot.entries.length) invalid();
      snapshot.empty = true;
      continue;
    }
    if (row.acl_is_null || !oid(row.grantor_oid) || !safeRole(row.grantor)
      || !(oid(row.grantee_oid) || row.grantee_oid === 0) || !safeRole(row.grantee)
      || (row.grantee_oid === 0 && row.grantee !== 'PUBLIC')
      || !privileges[row.kind].includes(row.privilege) || typeof row.is_grantable !== 'boolean') invalid();
    const entry = { grantorOid: row.grantor_oid, grantor: row.grantor, granteeOid: row.grantee_oid,
      grantee: row.grantee, privilege: row.privilege, isGrantable: row.is_grantable };
    const entryKey = `${entry.grantorOid}:${entry.granteeOid}:${entry.privilege}`;
    if (snapshot.seen.has(entryKey)) invalid();
    snapshot.seen.add(entryKey);
    snapshot.entries.push(entry);
  }
  if (snapshots.size !== expected.length) invalid();
  const tableOwner = snapshots.get('table').metadata.ownerOid;
  if (columns.some(column => snapshots.get(`column:${column}`).metadata.ownerOid !== tableOwner)
    || new Set(columns.map(column => snapshots.get(`column:${column}`).metadata.attributeNumber)).size !== columns.length) invalid();
  return expected.map(key => { const snapshot = snapshots.get(key); return { ...snapshot.metadata, entries: snapshot.entries }; });
}

export async function inspectProductPrivileges(client, { target, runtimeRole }) {
  await probe(client, "SET statement_timeout = '5000ms'");
  await probe(client, "SET lock_timeout = '1000ms'");
  await probe(client, 'SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  await probe(client, 'BEGIN READ ONLY');
  try {
    const state = (await probe(client, 'SHOW transaction_read_only')).rows[0];
    if (state?.transaction_read_only !== 'on') fail('read_only_transaction_not_confirmed');
    const identity = (await probe(client, `SELECT current_database() AS database_name,
      current_user AS current_user_name, session_user AS session_user_name`)).rows[0];
    if (identity?.database_name !== target.sqlDatabaseName
      || ![target.role, target.username].includes(identity.current_user_name)
      || ![target.role, target.username].includes(identity.session_user_name)) fail('verifier_session_target_mismatch');
    const roles = (await probe(client, `SELECT oid, rolname, rolsuper, rolbypassrls, rolcreaterole,
      rolcreatedb, rolinherit, rolcanlogin FROM pg_catalog.pg_roles
      WHERE rolname = ANY($1::text[]) ORDER BY rolname LIMIT 3`, [[runtimeRole, `${runtimeRole}.${target.branchId}`]])).rows;
    if (roles.length !== 1 || !safeRole(roles[0].rolname)) fail('mapped_sql_role_not_uniquely_resolved');
    const role = roles[0];
    for (const flag of ['rolsuper', 'rolbypassrls', 'rolcreaterole', 'rolcreatedb', 'rolinherit', 'rolcanlogin']) {
      if (typeof role[flag] !== 'boolean') fail('mapped_sql_role_flags_unavailable');
    }
    const memberships = (await probe(client, `SELECT role.rolname,
      pg_catalog.pg_has_role($1::oid, role.oid, 'USAGE') AS effective,
      EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members member
        WHERE member.member = $1::oid AND member.roleid = role.oid) AS direct
      FROM pg_catalog.pg_roles role WHERE role.oid <> $1::oid
        AND pg_catalog.pg_has_role($1::oid, role.oid, 'MEMBER')
      ORDER BY role.rolname LIMIT 65`, [role.oid])).rows;
    if (memberships.length > 64 || memberships.some(row => !safeRole(row.rolname)
      || typeof row.effective !== 'boolean' || typeof row.direct !== 'boolean')) fail('mapped_role_memberships_unavailable');
    const missingPrivileges = [], objects = [];
    for (const requirement of PRODUCT_PRIVILEGE_REQUIREMENTS) {
      const objectName = `${requirement.schema}.${requirement.relation}`;
      const object = (await probe(client, `SELECT relation.oid, relation.relrowsecurity, relation.relforcerowsecurity,
        pg_catalog.pg_get_userbyid(relation.relowner) AS owner,
        pg_catalog.pg_has_role($1::oid, relation.relowner, 'USAGE') AS effective_owner,
        pg_catalog.has_schema_privilege($1::oid, namespace.oid, 'USAGE') AS schema_usage,
        (SELECT count(*)::integer FROM pg_catalog.pg_policy policy WHERE policy.polrelid = relation.oid) AS policy_count
        FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = $2 AND relation.relname = $3 AND relation.relkind IN ('r', 'p') LIMIT 2`,
      [role.oid, requirement.schema, requirement.relation])).rows;
      if (object.length !== 1) fail('required_relation_not_uniquely_resolved');
      const row = object[0];
      if (!safeRole(row.owner) || ['relrowsecurity', 'relforcerowsecurity', 'effective_owner', 'schema_usage'].some(flag => typeof row[flag] !== 'boolean')
        || !Number.isSafeInteger(row.policy_count) || row.policy_count < 0) fail('relation_security_metadata_unavailable');
      if (!row.schema_usage) missingPrivileges.push({ object: requirement.schema, kind: 'schema', privilege: 'USAGE', scope: requirement.scope });
      const tablePrivileges = {};
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const result = (await probe(client, 'SELECT pg_catalog.has_table_privilege($1::oid, $2::oid, $3) AS permitted', [role.oid, row.oid, privilege])).rows[0];
        if (typeof result?.permitted !== 'boolean') fail('table_privilege_evidence_unavailable');
        tablePrivileges[privilege] = result.permitted;
      }
      const columns = [];
      for (const [privilege, names] of Object.entries(requirement.columns)) {
        const observed = (await probe(client, `SELECT attribute.attname,
          pg_catalog.has_column_privilege($1::oid, attribute.attrelid, attribute.attnum, $3) AS permitted
          FROM pg_catalog.pg_attribute attribute WHERE attribute.attrelid = $2::oid
            AND attribute.attnum > 0 AND NOT attribute.attisdropped AND attribute.attname = ANY($4::text[])
          ORDER BY attribute.attname`, [role.oid, row.oid, privilege, names])).rows;
        if (observed.length !== names.length || new Set(observed.map(item => item.attname)).size !== names.length
          || observed.some(item => !names.includes(item.attname) || typeof item.permitted !== 'boolean')) fail('column_privilege_evidence_incomplete');
        for (const name of names) {
          const permitted = observed.find(item => item.attname === name).permitted;
          columns.push({ column: name, privilege, permitted });
          if (!permitted) missingPrivileges.push({ object: objectName, kind: 'column', column: name, privilege, scope: requirement.scope });
        }
      }
      const aclSnapshot = requirement.scope === 'proposed_additional' ? await inspectAclSnapshot(client, requirement, row) : null;
      objects.push({ object: objectName, scope: requirement.scope, schemaUsage: row.schema_usage,
        owner: row.owner, effectiveOwner: row.effective_owner, rowSecurity: row.relrowsecurity,
        forceRowSecurity: row.relforcerowsecurity, policyCount: row.policy_count, tablePrivileges, columns,
        ...(aclSnapshot ? { aclSnapshot } : {}) });
    }
    const defaultFunction = (await probe(client, `SELECT pg_catalog.has_function_privilege(
      $1::oid, 'pg_catalog.now()'::regprocedure, 'EXECUTE') AS permitted`, [role.oid])).rows[0];
    if (typeof defaultFunction?.permitted !== 'boolean') fail('function_privilege_evidence_unavailable');
    if (!defaultFunction.permitted) missingPrivileges.push({ object: 'pg_catalog.now()', kind: 'function', privilege: 'EXECUTE', scope: 'existing_prerequisite' });
    return {
      verifier: { currentUser: identity.current_user_name, sessionUser: identity.session_user_name, transactionReadOnly: true },
      runtimeRole: { sqlRole: role.rolname, resolution: 'UNIQUE_CATALOG_MATCH_TO_PROVIDER_USERNAME', runtimeSessionObserved: false,
        isSuperuser: role.rolsuper, bypassRls: role.rolbypassrls, createRole: role.rolcreaterole,
        createDatabase: role.rolcreatedb, inherit: role.rolinherit, canLogin: role.rolcanlogin,
        memberships: memberships.map(row => ({ role: row.rolname, effective: row.effective, direct: row.direct })) },
      objects, functions: [{ signature: 'pg_catalog.now()', privilege: 'EXECUTE', scope: 'existing_prerequisite', permitted: defaultFunction.permitted }],
      newFunctionOrSequenceGrantsRequiredByHandlers: false,
      missingPrivileges: [...new Map(missingPrivileges.map(item => [JSON.stringify(item), item])).values()],
    };
  } finally { await probe(client, 'ROLLBACK'); }
}

export async function collectProductPrivilegeEvidence({ environment = process.env, fetchImpl = fetch,
  clientFactory = config => new pg.Client(config), verifyTargets = verifyHyperdriveTargets,
  reviewedOriginFingerprint = manifest.expectedMainOriginFingerprint,
  generatedAt = new Date().toISOString() } = {}) {
  const report = { schemaVersion: 1, mode: 'read-only-product-privilege-preflight', generatedAt,
    sourceMainSha: /^[a-f0-9]{40}$/.test(environment.RELEASE_SHA ?? '') ? environment.RELEASE_SHA : null,
    target: PRODUCT_PRIVILEGE_TARGET, status: 'BLOCKED', databaseWrites: false, providerMutations: false,
    grantApproval: 'NOT_GRANTED', liveProductAcceptance: 'NOT_ASSESSED', blockers: [], evidence: null };
  let client;
  try {
    if (!report.sourceMainSha) fail('release_sha_missing_or_invalid');
    const raw = environment.PLANETSCALE_SCHEMA_READ_DATABASE_URL ?? '';
    const target = branchQualifiedDatabaseTarget(raw);
    if (!/^pscale_api_[a-z0-9]+$/.test(target.role) || !target.origin.host.endsWith('.psdb.cloud') || target.sqlDatabaseName !== 'postgres'
      || target.originFingerprint !== reviewedOriginFingerprint) fail('schema_read_target_not_reviewed_main_origin');
    const mapping = JSON.parse(environment.PSCALE_ROLE_IDENTIFIERS ?? '{}');
    const runtimeRole = mapping.lythaus_runtime;
    if (!/^pscale_api_[a-z0-9]+$/.test(runtimeRole ?? '')) fail('runtime_role_mapping_invalid');
    if (runtimeRole === target.role) fail('runtime_role_not_separate_from_verifier');
    const response = await fetchImpl('https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core/branches/main', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: planetScaleServiceTokenAuthorizationHeader(environment.PLANETSCALE_API_TOKEN ?? ''), Accept: 'application/json' },
    });
    if (!response.ok) fail('planetscale_main_branch_read_failed');
    const branch = await response.json();
    if (branch?.name !== 'main' || branch?.id !== target.branchId) fail('planetscale_main_branch_identity_mismatch');
    const verified = await verifyTargets({ fetchImpl, readOnlyGetOnly: true, environment: {
      CLOUDFLARE_API_TOKEN: environment.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: manifest.accountId,
      PLANETSCALE_SCHEMA_READ_DATABASE_URL: raw, PSCALE_ROLE_IDENTIFIERS: JSON.stringify({ lythaus_runtime: runtimeRole }),
      PSCALE_BRANCH_NAME: 'main', HYPERDRIVE_VERIFY_IDS: PRODUCT_PRIVILEGE_TARGET.hyperdriveId,
    } });
    if (verified?.status !== 'pass' || verified.targetBranch !== 'main' || verified.originFingerprint !== target.originFingerprint
      || verified.bindings?.length !== 1 || verified.bindings[0].hyperdriveId !== PRODUCT_PRIVILEGE_TARGET.hyperdriveId
      || verified.bindings[0].roleClass !== 'lythaus_runtime' || verified.bindings[0].roleMatches !== true) fail('hyperdrive_mapping_not_verified');
    const url = new URL(raw);
    if (url.searchParams.get('sslrootcert') === 'system') url.searchParams.delete('sslrootcert');
    client = clientFactory({ connectionString: url.toString(), ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 10_000, query_timeout: 10_000, application_name: 'lythaus-product-privilege-preflight' });
    client.on?.('error', () => undefined);
    await client.connect();
    report.evidence = await inspectProductPrivileges(client, { target, runtimeRole });
    report.providerBranch = { name: 'main', id: branch.id };
    report.liveHyperdriveMappingVerified = true;
    const role = report.evidence.runtimeRole;
    if (role.isSuperuser || role.bypassRls || role.createRole || role.createDatabase) report.blockers.push('runtime_role_has_privileged_attributes_requires_review');
    for (const object of report.evidence.objects) {
      if (object.effectiveOwner) report.blockers.push(`runtime_role_effective_owner_requires_review:${object.object}`);
      if (object.rowSecurity || object.forceRowSecurity || object.policyCount > 0) report.blockers.push(`row_security_policy_requires_review:${object.object}`);
    }
    report.status = report.blockers.length ? 'BLOCKED' : report.evidence.missingPrivileges.length ? 'NEEDS_APPROVAL' : 'PRIVILEGES_PRESENT_NOT_ACCEPTED';
  } catch (error) {
    const allowed = ['release_sha_missing_or_invalid', 'schema_read_target_not_reviewed_main_origin', 'runtime_role_mapping_invalid', 'runtime_role_not_separate_from_verifier',
      'planetscale_main_branch_read_failed', 'planetscale_main_branch_identity_mismatch', 'hyperdrive_mapping_not_verified',
      'read_only_transaction_not_confirmed', 'verifier_session_target_mismatch', 'mapped_sql_role_not_uniquely_resolved',
      'mapped_sql_role_flags_unavailable', 'mapped_role_memberships_unavailable', 'required_relation_not_uniquely_resolved',
      'relation_security_metadata_unavailable', 'relation_acl_metadata_unavailable', 'table_privilege_evidence_unavailable', 'column_privilege_evidence_incomplete',
      'function_privilege_evidence_unavailable', 'catalog_probe_failed'];
    report.blockers.push(allowed.includes(error?.code) ? error.code : 'protected_read_only_preflight_unavailable');
  } finally { if (client) await client.end().catch(() => undefined); }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await collectProductPrivilegeEvidence();
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'PRIVILEGES_PRESENT_NOT_ACCEPTED') process.exitCode = 2;
}
