import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { assertNewCoreEmptyCatalog, assertNewCoreProviderBaseline, NEW_CORE_PROVIDER_BASELINE_SQL,
  NEW_CORE_PROVIDER_BASELINE } from './lythaus-new-core-empty-catalog.mjs';
import { PRESERVED_ROLE_HASHES } from './inspect-new-core-planetscale-roles.mjs';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';
import { branchQualifiedDatabaseTarget, adminDatabaseConnectionConfig, buildPlanetScaleTargetIdentity, assertConnectedAdminDatabaseTarget } from './planetscale-0021-target-identity.mjs';
import { canonicalReleaseSchemaContract, runtimeSchemaFingerprint, APPLICATION_SCHEMAS } from './product-integrity-schema-contract.mjs';
import { EXPECTED_MIGRATION_SET_SHA256, loadApprovedMigrations } from './planetscale-migration-manifest.mjs';
import { assertCompleteMigrationPostconditions, classifyMigrationState } from './planetscale-migration-reconciliation.mjs';
import { NEW_CORE_ROLE_LABELS, NEW_CORE_LOGIN_ROLE_LABELS, NEW_CORE_DEFERRED_ROLE_LABELS,
  newCoreRoleCanLogin, validateNewCoreRoleMap, verifyNewCoreRoleMemberships,
  NEW_CORE_SQL_ROLE_MODE, NEW_CORE_SQL_CREATOR_SHA256 } from './lythaus-new-core-role-profile.mjs';

const { Client } = pg;
const ROOT = process.cwd();
const TARGET_PATH = 'infrastructure/planetscale/lythaus-new-core-clean-install.target.json';
const WORKER_CONFIG_PATH = 'apps/lythaus-admin-api/wrangler.new-core-test.jsonc';
const VERIFIER_GRANTS_PATH = 'database/planetscale/grants/new-core-verifier.sql';
const ROLE_NAMES = NEW_CORE_ROLE_LABELS;
const REQUIRED_EXTENSIONS = ['pgcrypto', 'pg_trgm', 'unaccent'];
const LOCAL_URL_ENV = 'LYTHAUS_NEW_CORE_PG17_REHEARSAL_URL';
const LIVE_MIGRATION_URL_ENV = 'LYTHAUS_NEW_CORE_MIGRATION_DATABASE_URL';
const LIVE_VERIFIER_URL_ENV = 'LYTHAUS_NEW_CORE_VERIFIER_DATABASE_URL';
const LIVE_ROLES_ENV = 'LYTHAUS_NEW_CORE_ROLE_IDENTIFIERS';
const REQUIRED_DATABASE_ID = '87dbkhprjh30';
const REQUIRED_BRANCH_ID = 'xwkb9quljkzd';
const REQUIRED_ACCOUNT_ID = 'e5b7ae46e04698f507b7e4b3d4ef1af0';
const REQUIRED_HYPERDRIVE_ID = '7e39fc4a286147988ed12df7a6322616';
const REQUIRED_WORKER = 'lythaus-admin-api-new-core-test';
const REQUIRED_HOSTNAME = 'admin-new-core-test.lythaus.co';
const REQUIRED_ADMIN_PATH = '/flags';
const REQUIRED_ORGANIZATION = 'lythaus';
const REQUIRED_DATABASE = 'lythaus-new-core';
const REQUIRED_REGION = 'eu-central';
const REQUIRED_ORIGIN_SHA_ENV = 'LYTHAUS_NEW_CORE_EXPECTED_ORIGIN_FINGERPRINT';
const REQUIRED_CLOUDFLARE_ACCESS_TOKEN_ENV = 'CLOUDFLARE_API_TOKEN';
const EXPECTED_OWNER_EMAIL_ENV = 'LYTHAUS_NEW_CORE_OWNER_EMAIL';
const REQUIRED_PLANETSCALE_TOKEN_ENV = 'PLANETSCALE_API_TOKEN';
const ROLE_LABELS = NEW_CORE_ROLE_LABELS;

function fail(code) {
  throw new Error(code);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

export function assertLocalRehearsalUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0) fail('local_rehearsal_url_missing');
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('local_rehearsal_url_invalid');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    || url.username !== 'postgres'
    || url.password !== ''
    || url.pathname !== '/postgres'
    || url.hash !== '') fail('local_rehearsal_target_not_allowlisted');
  const queryEntries = [...url.searchParams.entries()];
  if (queryEntries.length !== 1 || queryEntries[0][0] !== 'sslmode' || queryEntries[0][1] !== 'disable') {
    fail('local_rehearsal_query_not_allowlisted');
  }
  return url.toString();
}

export function assertFixedDeploymentTarget(target, worker) {
  if (target.hyperdrive.accountId !== REQUIRED_ACCOUNT_ID
    || target.hyperdrive.id !== REQUIRED_HYPERDRIVE_ID
    || target.adminTest.worker !== REQUIRED_WORKER
    || target.adminTest.hostname !== REQUIRED_HOSTNAME
    || target.adminTest.pagePath !== REQUIRED_ADMIN_PATH) fail('new_core_literal_target_mismatch');
  if (worker.name !== REQUIRED_WORKER || worker.account_id !== REQUIRED_ACCOUNT_ID
    || worker.routes?.length !== 1 || worker.routes[0]?.pattern !== `${REQUIRED_HOSTNAME}/*`
    || worker.routes[0]?.zone_name !== 'lythaus.co') fail('new_core_worker_deployment_target_mismatch');
}

export function assertProviderRegion(database, branch) {
  const regions = [database?.region, branch?.region].filter((region) => region !== undefined && region !== null);
  if (regions.length === 0 || !regions.every((region) => region && typeof region === 'object'
    && region.provider === 'AWS' && region.display_name === 'AWS eu-central-1'
    && region.location === 'Frankfurt' && region.slug === REQUIRED_REGION)) {
    fail('new_core_provider_region_mismatch');
  }
  return { provider: 'AWS', displayName: 'AWS eu-central-1', location: 'Frankfurt', slug: REQUIRED_REGION };
}

export function validateTestAccessEnvironment(target, environment) {
  const access = target?.adminTest;
  if (!access || access.accessVerification !== 'VERIFIED_NEW_TEST_ACCESS_OWNER_ONLY'
    || access.ownerOnlyPolicyVerified !== true || access.allowlistedHumanCount !== 1
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(access.accessApplicationId ?? '')
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(access.accessPolicyId ?? '')
    || !/^https:\/\/[a-z0-9.-]+$/i.test(access.expectedAccessIssuer ?? '')
    || !/^[a-f0-9]{64}$/.test(access.audienceSha256 ?? '')) fail('new_core_access_attestation_missing');
  const teamDomain = new URL(access.expectedAccessIssuer).hostname;
  if (environment.ACCESS_TEAM_DOMAIN !== teamDomain
    || environment.NEW_CORE_ACCESS_ISSUER !== access.expectedAccessIssuer
    || environment.NEW_CORE_ACCESS_AUDIENCE_SHA256 !== access.audienceSha256
    || environment.ACCESS_JWKS_URL !== `https://${teamDomain}/cdn-cgi/access/certs`) fail('new_core_access_environment_mismatch');
  const audienceValues = typeof environment.ACCESS_AUDIENCES === 'string'
    ? environment.ACCESS_AUDIENCES.split(',').map((value) => value.trim()).filter(Boolean) : [];
  if (audienceValues.length !== 1 || new Set(audienceValues).size !== 1
    || crypto.createHash('sha256').update(audienceValues[0]).digest('hex') !== access.audienceSha256) {
    fail('new_core_access_audience_mismatch');
  }
  return {
    accessApplicationId: access.accessApplicationId,
    accessPolicyId: access.accessPolicyId,
    issuer: access.expectedAccessIssuer,
    audienceSha256: access.audienceSha256,
    ownerOnlyPolicyVerified: true,
    allowlistedHumanCount: 1,
  };
}

function normalizeExpectedOwnerEmail(value) {
  if (typeof value !== 'string' || value.length > 320 || value.trim() !== value
    || !/^[^@\s]+@[^@\s]+$/.test(value)) fail('new_core_access_expected_owner_unavailable');
  return value.toLowerCase();
}

function exactEmailSelector(selector) {
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)
    || Object.keys(selector).length !== 1 || !Object.hasOwn(selector, 'email')) return null;
  const email = selector.email;
  if (typeof email === 'string') return email;
  if (!email || typeof email !== 'object' || Array.isArray(email)
    || Object.keys(email).length !== 1 || typeof email.email !== 'string') return null;
  return email.email;
}

function exactEveryoneSelector(selector) {
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)
    || Object.keys(selector).length !== 1 || !Object.hasOwn(selector, 'everyone')) return false;
  return selector.everyone === true || (selector.everyone && typeof selector.everyone === 'object'
    && !Array.isArray(selector.everyone) && Object.keys(selector.everyone).length === 0);
}

export function verifyAccessAppAndPolicies({ application, policies, target, expectedOwnerEmail }) {
  const access = target?.adminTest;
  if (!access || !Array.isArray(policies) || application?.id !== access.accessApplicationId
    || application.type !== 'self_hosted' || typeof application.aud !== 'string'
    || crypto.createHash('sha256').update(application.aud).digest('hex') !== access.audienceSha256) {
    fail('new_core_access_application_metadata_mismatch');
  }
  const ownerEmail = normalizeExpectedOwnerEmail(expectedOwnerEmail);
  const destinations = [application.domain, application.destination,
    ...(Array.isArray(application.domains) ? application.domains : []),
    ...(Array.isArray(application.self_hosted_domains) ? application.self_hosted_domains : [])]
    .filter((value) => typeof value === 'string').map((value) => value.toLowerCase());
  const uniqueDestinations = [...new Set(destinations)];
  if (uniqueDestinations.length !== 1 || uniqueDestinations[0] !== REQUIRED_HOSTNAME) {
    fail('new_core_access_application_hostname_mismatch');
  }
  const decision = (policy) => String(policy?.decision ?? policy?.action ?? '').toLowerCase();
  const allows = policies.filter((policy) => decision(policy) === 'allow');
  if (policies.length !== 2 || policies.some((policy) => !['allow', 'deny', 'block'].includes(decision(policy)))) {
    fail('new_core_access_policy_metadata_mismatch');
  }
  const ownerPolicy = policies.find((policy) => policy?.id === access.accessPolicyId);
  const include = ownerPolicy?.include;
  const emailSelector = Array.isArray(include) && include.length === 1 ? exactEmailSelector(include[0]) : null;
  const denyPolicy = policies.find((policy) => ['deny', 'block'].includes(decision(policy)));
  const denyAll = Array.isArray(denyPolicy?.include) && denyPolicy.include.length === 1
    && exactEveryoneSelector(denyPolicy.include[0]);
  if (allows.length !== 1 || !ownerPolicy || decision(ownerPolicy) !== 'allow'
    || typeof emailSelector !== 'string' || emailSelector.toLowerCase() !== ownerEmail
    || !Array.isArray(ownerPolicy.exclude) || ownerPolicy.exclude.length !== 0
    || !Array.isArray(ownerPolicy.require) || ownerPolicy.require.length !== 0
    || ownerPolicy.enabled === false || !denyAll
    || !Array.isArray(denyPolicy.exclude) || denyPolicy.exclude.length !== 0
    || !Array.isArray(denyPolicy.require) || denyPolicy.require.length !== 0
    || denyPolicy.enabled === false) fail('new_core_access_policy_metadata_mismatch');
  if (access.ownerOnlyPolicyVerified !== true || access.allowlistedHumanCount !== 1) fail('new_core_access_owner_not_verified');
  return {
    accessApplicationId: access.accessApplicationId,
    accessPolicyId: access.accessPolicyId,
    audienceSha256: access.audienceSha256,
    hostname: REQUIRED_HOSTNAME,
    ownerOnlyPolicyVerified: true,
    allowlistedHumanCount: 1,
    bypassPolicyCount: 0,
  };
}

function assertCompleteProviderList(payload, maxCount, code) {
  if (!Array.isArray(payload?.result) || payload.result.length > maxCount) fail(code);
  if (Object.hasOwn(payload, 'result_info')) {
    const info = payload.result_info;
    if (!info || typeof info !== 'object' || Array.isArray(info)
      || !Number.isSafeInteger(info.total_count) || info.total_count !== payload.result.length) fail(code);
  }
  return payload.result;
}

export async function verifyNewCoreAccessMetadata({ target, environment = process.env, fetchImpl = fetch }) {
  const access = target?.adminTest;
  if (!access || access.accessVerification !== 'VERIFIED_NEW_TEST_ACCESS_OWNER_ONLY'
    || access.ownerOnlyPolicyVerified !== true || access.allowlistedHumanCount !== 1
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(access.accessApplicationId ?? '')
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(access.accessPolicyId ?? '')
    || !/^https:\/\/[a-z0-9.-]+$/i.test(access.expectedAccessIssuer ?? '')
    || !/^[a-f0-9]{64}$/.test(access.audienceSha256 ?? '')) fail('new_core_access_attestation_missing');
  const token = environment[REQUIRED_CLOUDFLARE_ACCESS_TOKEN_ENV] ?? '';
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096
    || /[\s\x00-\x1f\x7f]/.test(token)) fail('new_core_cloudflare_authority_unavailable');
  const base = `https://api.cloudflare.com/client/v4/accounts/${REQUIRED_ACCOUNT_ID}`;
  const applications = await providerGet(`${base}/access/apps?per_page=1000`, `Bearer ${token}`,
    'new_core_access_application_metadata_unavailable', fetchImpl);
  if (applications.success !== true) fail('new_core_access_application_metadata_unavailable');
  const appRows = assertCompleteProviderList(applications, 1000, 'new_core_access_application_inventory_incomplete');
  const destinations = (application) => [application?.domain, application?.destination,
    ...(Array.isArray(application?.domains) ? application.domains : []),
    ...(Array.isArray(application?.self_hosted_domains) ? application.self_hosted_domains : [])]
    .filter((value) => typeof value === 'string').map((value) => value.toLowerCase());
  const hostnameMatches = appRows.filter((application) => destinations(application).includes(REQUIRED_HOSTNAME));
  if (hostnameMatches.length !== 1 || hostnameMatches[0]?.id !== access.accessApplicationId) {
    fail('new_core_access_application_identity_mismatch');
  }
  const policyUrl = `${base}/access/apps/${encodeURIComponent(access.accessApplicationId)}/policies?per_page=1000`;
  const policyResponse = await providerGet(policyUrl, `Bearer ${token}`, 'new_core_access_policy_metadata_unavailable', fetchImpl);
  if (policyResponse.success !== true) fail('new_core_access_policy_metadata_unavailable');
  const policies = assertCompleteProviderList(policyResponse, 1000, 'new_core_access_policy_inventory_incomplete');
  return verifyAccessAppAndPolicies({
    application: hostnameMatches[0],
    policies,
    target,
    expectedOwnerEmail: environment[EXPECTED_OWNER_EMAIL_ENV],
  });
}

function loadCleanInstallContract() {
  const target = readJson(TARGET_PATH);
  const worker = readJson(WORKER_CONFIG_PATH);
  assertFixedDeploymentTarget(target, worker);
  const rolesSql = fs.readFileSync(path.join(ROOT, 'database/planetscale/grants/roles.sql'), 'utf8');
  const migrations = loadApprovedMigrations({ root: ROOT, committedOnly: true });
  const expectedRoute = `${REQUIRED_HOSTNAME}/*`;
  if (target.schemaVersion !== 'lythaus-new-core-clean-install-target-v1'
    || target.provider.organization !== 'lythaus'
    || target.provider.database !== 'lythaus-new-core'
    || target.provider.databaseId !== '87dbkhprjh30'
    || target.provider.branch !== 'main'
    || target.provider.branchId !== 'xwkb9quljkzd'
    || target.provider.region !== 'eu-central'
    || target.provider.replicas !== 0
    || target.provider.cluster !== 'PS-5 aarch64'
    || JSON.stringify(target.provider.regionMetadata) !== JSON.stringify({
      provider: 'AWS', displayName: 'AWS eu-central-1', location: 'Frankfurt',
    })
    || target.provider.logicalDatabase !== 'postgres'
    || target.provider.requiredPostgresMajor !== 17
    || !((target.provider.sqlOriginFingerprint === null && target.provider.sqlOriginVerification === 'BLOCKED_UNVERIFIED')
      || (/^[a-f0-9]{64}$/.test(target.provider.sqlOriginFingerprint ?? '')
        && ['BLOCKED_ROLE_CLASS_UNVERIFIED', 'VERIFIED_NEW_HYPERDRIVE_DESTINATION'].includes(target.provider.sqlOriginVerification)))) fail('new_core_target_manifest_mismatch');
  if (target.hyperdrive.accountId !== 'e5b7ae46e04698f507b7e4b3d4ef1af0'
    || target.hyperdrive.id !== '7e39fc4a286147988ed12df7a6322616'
    || target.hyperdrive.requiredCachingDisabled !== true
    || !['BLOCKED_CLOUDFLARE_READ_401', 'BLOCKED_VERIFY_FULL_CA_UNVERIFIED', 'VERIFIED_NEW_HYPERDRIVE_CACHING_DISABLED'].includes(target.hyperdrive.originVerification)
    || target.readOnlyEvidence?.observationType !== 'historical_read_only_snapshot'
    || target.readOnlyEvidence?.runId !== '43835553248'
    || target.readOnlyEvidence?.inspectorSourceSha !== '18c24397e8518c0eae76b650cd9862f9cbb8d4a3') fail('new_core_hyperdrive_manifest_mismatch');
  if (target.migrationSetSha256 !== EXPECTED_MIGRATION_SET_SHA256) fail('new_core_migration_manifest_mismatch');
  if (worker.name !== REQUIRED_WORKER
    || worker.account_id !== REQUIRED_ACCOUNT_ID
    || worker.main !== 'src/new-core-test-worker.ts'
    || worker.workers_dev !== false
    || worker.preview_urls !== false
    || JSON.stringify(worker.routes) !== JSON.stringify([{ pattern: expectedRoute, zone_name: 'lythaus.co' }])
    || worker.vars?.EXPECTED_HOSTNAMES !== REQUIRED_HOSTNAME
    || worker.vars?.CORS_ALLOWED_ORIGINS !== `https://${REQUIRED_HOSTNAME}`
    || worker.vars?.HYPERDRIVE_QUERY_CACHE_MODE !== 'disabled'
    || JSON.stringify(worker.hyperdrive) !== JSON.stringify([{ binding: 'DB_ADMIN_FRESH', id: REQUIRED_HYPERDRIVE_ID }])
    || worker.assets?.binding !== 'ASSETS'
    || worker.assets?.directory !== '../control-panel/dist'
    || worker.assets?.run_worker_first !== true
    || worker.assets?.not_found_handling !== 'single-page-application'
    || worker.services !== undefined
    || worker.r2_buckets !== undefined) fail('new_core_worker_config_mismatch');
  for (const key of ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUDIENCES', 'ACCESS_JWKS_URL']) {
    if (Object.hasOwn(worker.vars ?? {}, key)) fail('new_core_access_placeholder_forbidden');
  }
  if (!fs.existsSync(path.join(ROOT, VERIFIER_GRANTS_PATH)) || rolesSql.length === 0) fail('new_core_role_grants_missing');
  return { target, worker, migrations };
}

export function buildPreparationPlan({ root = ROOT } = {}) {
  const { target, migrations } = loadCleanInstallContract();
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  return {
    status: 'LIVE_CONFIGURATION_BLOCKED',
    sourceSha,
    destination: {
      organization: target.provider.organization,
      database: target.provider.database,
      databaseId: target.provider.databaseId,
      branch: target.provider.branch,
      branchId: target.provider.branchId,
      region: target.provider.region,
      cluster: target.provider.cluster,
      replicas: target.provider.replicas,
      regionProvider: target.provider.regionMetadata.provider,
      regionDisplayName: target.provider.regionMetadata.displayName,
      regionLocation: target.provider.regionMetadata.location,
      logicalDatabase: target.provider.logicalDatabase,
      requiredPostgresMajor: target.provider.requiredPostgresMajor,
      hyperdriveId: target.hyperdrive.id,
      requiredCachingDisabled: target.hyperdrive.requiredCachingDisabled,
      testHostname: target.adminTest.hostname,
      adminPagePath: target.adminTest.pagePath,
    },
    proposedTestUrl: { value: `https://${REQUIRED_HOSTNAME}${REQUIRED_ADMIN_PATH}`, deploymentStatus: 'NOT_DEPLOYED' },
    expectedChanges: [
      'Apply the exact 22 approved migration files in order and insert the exact filename/checksum ledger rows.',
      'Install canonical least-privilege role grants and the narrow read-only aggregate bootstrap verifier.',
      'Insert the canonical first-admin latch as false; no user, membership, audit completion row, or application record is created by setup.',
      'Keep the observed broad role unchanged; provision three managed logins (migration/admin/verifier) and three SQL NOLOGIN PASSWORD NULL roles (runtime/jobs/privacy), with no unused credentials.',
      'Provision the migration login with plain database CREATE on postgres, without grant option or database ownership. The provisioner supplies CONNECT and verifies other roles lack CREATE; preflight verifies this before any migration.',
      'Provisioned provider roles and scoped credentials must already exist under separate approval; this installer does not create, rotate, or delete credentials or roles.',
    ],
    guardedEmptyDataSteps: [
      '0007_contact_emails.sql conditionally replaces the legacy subject locator table only after proving it has zero rows; it also replaces the old retention function signature.',
      '0011_email_guest_auth_only.sql deletes no rows unless the retired auth feature-flag predicate is empty; nonzero rows stop before the file.',
      '0012_product_integrity_v2.sql updates and deduplicates no records unless all nine touched application tables are empty; any nonzero count stops before the file.',
    ],
    cleanupPolicy: 'No rollback script, DROP cleanup, TRUNCATE, data import, production migration helper, or automatic credential/role deletion. A partial install stops for manual review.',
    migrations: {
      count: migrations.migrations.length,
      names: migrations.migrations.map(({ name }) => name),
      bytes: migrations.bytes,
      manifestSha256: migrations.checksum,
    },
    blockers: [
      'PlanetScale database and branch metadata now match the approved destination, but the SQL server major is not exposed by these metadata reads.',
      'The exact Hyperdrive origin fingerprint and caching-disabled state are verified; Cloudflare did not return mtls.sslmode or ca_certificate_id, so verify-full plus CA verification remains blocked. Cloudflare documents require-mode encryption by default; plaintext is not inferred.',
      'The branch exposes one unlabelled role matching the Hyperdrive username, with pg_read_all_data, pg_write_all_data, and one additional unreported inherited role. It does not satisfy any of the six canonical role labels or least-privilege requirements; keep it unused and unchanged.',
      'Provision six distinct roles under explicit approval, issuing only migration/admin/verifier credentials. Runtime/jobs/privacy stay NOLOGIN with no passwords. Updating Hyperdrive to the Admin role and verify-full CA remains a separate approval.',
      'The isolated Cloudflare Access app, exact audience, owner-only policy, hostname binding and worker asset build are not live-verified.',
      'Published pricing reference is recorded but current account allowances, storage/usage, Access seats, and approved one-time/monthly ceilings remain unknown.',
      'Live DDL, role/grant changes, credential use, Access/binding changes, worker publication and any new spend each remain separately approval-gated.',
    ],
  };
}

export function buildSchemaInstallationPlan() {
  const { target, migrations } = loadCleanInstallContract();
  const scope = assertSchemaInstallationScope(target);
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const roleMap = Object.fromEntries(ROLE_LABELS.map((label) => [label, label]));
  const roleMapSha = crypto.createHash('sha256').update(JSON.stringify(roleMap)).digest('hex');
  const files = ['database/planetscale/grants/roles.sql', VERIFIER_GRANTS_PATH,
    'database/planetscale/verification/verify.sql'];
  return {
    status: 'SCHEMA_INSTALLATION_APPROVAL_PENDING', sourceSha,
    protectedMainSha: scope.protectedMainSha,
    destination: { organization: REQUIRED_ORGANIZATION, database: REQUIRED_DATABASE, databaseId: REQUIRED_DATABASE_ID,
      branch: 'main', branchId: REQUIRED_BRANCH_ID, logicalDatabase: 'postgres', region: 'AWS eu-central-1 Frankfurt',
      cluster: 'PS_5_AWS_ARM', replicas: 0, postgresMajor: 17, originFingerprint: target.provider.sqlOriginFingerprint },
    roleMode: scope.roleMode, roleMap, roleMapSha256: roleMapSha,
    migrationSetSha256: migrations.checksum, migrationBytes: migrations.bytes,
    expectedVerification: { applicationSchemas: 11, tables: 102, relations: 103, ledgerRows: 22,
      definitionFingerprintSha256: scope.expectedSchemaDefinitionFingerprintSha256,
      grantFingerprintSha256: scope.expectedGrantFingerprintSha256,
      bootstrapMemberships: 0, bootstrapLatchConsumed: false, bootstrapCompletionEvents: 0,
      remainingApplicationDataRows: 0 },
    migrations: migrations.migrations.map(({ name, checksum }) => ({ name, checksum })),
    contractFiles: files.map((file) => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') })),
    objectGrantPayloads: files.slice(0, 2).map((file, index) => ({ file,
      sha256: crypto.createHash('sha256').update(schemaOnlyObjectGrantSql(fs.readFileSync(path.join(ROOT, file), 'utf8'),
        { verifier: index === 1 })).digest('hex'), databaseAclStatementsExcluded: index === 1 ? 1 : 2 })),
    approvalEnvironment: { name: 'LYTHAUS_NEW_CORE_SCHEMA_INSTALL_APPROVAL', value: candidateApprovalValue(
      'APPROVE_NEW_CORE_SCHEMA_ONLY', sourceSha, migrations.checksum, target.provider.sqlOriginFingerprint, roleMapSha) },
    liveCommandAfterApprovalOnly: 'node scripts/ci/lythaus-new-core-clean-install.mjs --apply-live-schema-only',
    credentials: { migration: LIVE_MIGRATION_URL_ENV, verifier: LIVE_VERIFIER_URL_ENV,
      custody: scope.credentialDelivery, providerMetadata: 'existing authorized read-only PlanetScale service-token pair',
      github: 'no database credentials or provisioning authority required in Actions' },
    writes: ['exact 22 canonical migrations and ledger', 'canonical roles.sql object grants and default privileges',
      'new-core aggregate verifier function and grants', 'one unconsumed bootstrap latch'],
    exclusions: ['production records', 'credential or role provisioning', 'database-level privilege escalation or revocation',
      'Hyperdrive or Access changes', 'bindings', 'deployment', 'new resources or spend', 'bootstrap execution', 'traffic switch'],
    failurePolicy: 'stop on any difference; roll back the active transaction; preserve prior committed migrations; no automatic resume, reset, drop or cleanup',
    acceptance: 'schema verification is separate from fresh owner login at the isolated protected /flags page and second-bootstrap refusal; production cutover and live admin hostname login remain separate gates',
  };
}

async function assertMigrationEmptyDataGuard(client, migrationName) {
  let guarded = null;
  let targets = [];
  if (migrationName === '0007_contact_emails.sql') {
    const result = await client.query(`SELECT CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'privacy' AND table_name = 'subject_data_locations' AND column_name = 'id'
      ) THEN (SELECT count(*)::integer FROM privacy.subject_data_locations) ELSE 0 END AS row_count`);
    guarded = Number(result.rows[0]?.row_count ?? -1) === 0;
    targets = ['privacy.subject_data_locations'];
  } else if (migrationName === '0011_email_guest_auth_only.sql') {
    const result = await client.query(`SELECT count(*)::integer AS row_count FROM system.feature_flags
      WHERE flag_key LIKE 'auth.%' AND flag_key NOT IN ('auth.email', 'auth.guest')`);
    guarded = Number(result.rows[0]?.row_count ?? -1) === 0;
    targets = ['system.feature_flags:retired-auth-keys'];
  } else if (migrationName === '0012_product_integrity_v2.sql') {
    const result = await client.query(`SELECT
      (SELECT count(*) FROM trust.reputation_events) AS reputation_events,
      (SELECT count(*) FROM trust.accountability_signals) AS accountability_signals,
      (SELECT count(*) FROM social.reactions) AS reactions,
      (SELECT count(*) FROM content.comments) AS comments,
      (SELECT count(*) FROM moderation.cases) AS moderation_cases,
      (SELECT count(*) FROM content.posts) AS posts,
      (SELECT count(*) FROM content.content_declarations) AS content_declarations,
      (SELECT count(*) FROM social.profiles) AS profiles,
      (SELECT count(*) FROM moderation.decisions) AS moderation_decisions`);
    const row = result.rows[0] ?? {};
    guarded = Object.keys(row).length === 9 && Object.values(row).every((value) => Number(value) === 0);
    targets = ['trust.reputation_events', 'trust.accountability_signals', 'social.reactions',
      'content.comments', 'moderation.cases', 'content.posts', 'content.content_declarations',
      'social.profiles', 'moderation.decisions'];
  }
  if (guarded === false) fail(`new_core_empty_data_guard_failed_${migrationName.slice(0, 4)}`);
  if (guarded === null) return null;
  if (guarded !== true) fail(`new_core_empty_data_guard_unverified_${migrationName.slice(0, 4)}`);
  return { migration: migrationName, zeroRowTargets: targets };
}

async function applyMigration(client, migration, pendingRegistry) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('lythaus-schema-migrations'))");
    const guard = await assertMigrationEmptyDataGuard(client, migration.name);
    await client.query(migration.contents.toString('utf8'));
    const registry = await client.query("SELECT to_regclass('system.schema_migrations') AS relation");
    if (registry.rows[0]?.relation) {
      for (const item of [...pendingRegistry.splice(0), migration]) {
        const inserted = await client.query(
          `INSERT INTO system.schema_migrations (version, checksum)
           VALUES ($1, $2) RETURNING version`,
          [item.name, item.checksum],
        );
        if (inserted.rowCount !== 1) fail('new_core_migration_ledger_insert_failed');
      }
    } else {
      pendingRegistry.push(migration);
    }
    await client.query('COMMIT');
    return guard;
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(`new_core_migration_failed_${migration.name.slice(0, 4)}`);
  }
}

async function assertEmptyTarget(client) {
  const result = await client.query(`SELECT
    current_database() AS database_name,
    current_user AS current_role,
    current_setting('server_version_num')::integer AS version_num,
    has_database_privilege(current_user, current_database(), 'CREATE') AS migration_database_create,
    (SELECT count(*)::integer FROM pg_namespace
      WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema', 'public')) AS application_schema_count,
    (SELECT count(*)::integer FROM pg_class relation_entry
      JOIN pg_namespace namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
      WHERE namespace_entry.nspname NOT LIKE 'pg_%'
        AND namespace_entry.nspname <> 'information_schema'
        AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) AS application_relation_count,
    to_regclass('system.schema_migrations') IS NULL AS ledger_missing,
    (SELECT count(*)::integer FROM pg_roles WHERE rolname = ANY($1::text[])) AS application_role_count`, [ROLE_NAMES]);
  const row = result.rows[0];
  if (!row || row.database_name !== 'postgres' || row.current_role !== 'postgres'
    || Number(row.version_num) < 170000 || Number(row.version_num) >= 180000
    || row.ledger_missing !== true
    || Number(row.application_role_count) !== 0) fail('new_core_rehearsal_database_not_empty_postgres17');
  await assertNewCoreEmptyCatalog(client, row);
}

async function createLocalRoles(client) {
  for (const role of ROLE_NAMES) {
    await client.query(`CREATE ROLE "${role}" ${newCoreRoleCanLogin(role) ? 'LOGIN' : 'NOLOGIN'}
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD NULL`);
  }
  await client.query('GRANT CONNECT ON DATABASE postgres TO lythaus_migrations, lythaus_admin, lythaus_verifier');
  await client.query('GRANT CREATE ON DATABASE postgres TO lythaus_migrations');
}

export function validateRoleMap(roleMap, options = {}) {
  return validateNewCoreRoleMap(roleMap, options);
}

function substituteRoleNames(sql, roleMap) {
  validateRoleMap(roleMap, { local: ROLE_LABELS.every((label) => roleMap[label] === label) });
  return sql.replace(/\blythaus_(runtime|admin|jobs|privacy|migrations|verifier)\b/g,
    (label) => `"${roleMap[label]}"`);
}

function assertBootstrapState(state, expected) {
  if (state.membershipCount !== expected.membershipCount
    || state.activeAdminMembershipCount !== expected.activeAdminMembershipCount
    || state.activeNonAdminMembershipCount !== expected.activeNonAdminMembershipCount
    || state.bootstrapLatchCount !== expected.bootstrapLatchCount
    || state.bootstrapConsumed !== expected.bootstrapConsumed
    || state.completionAuditCount !== expected.completionAuditCount
    || state.bootstrapControlPlaneCount !== expected.bootstrapControlPlaneCount
    || state.bootstrapConsumerMaterialCount !== expected.bootstrapConsumerMaterialCount) fail('new_core_bootstrap_state_mismatch');
  return state;
}

function liveSqlConnectionConfig(raw, roleLabel, roleMap, target) {
  if (typeof raw !== 'string' || raw.length === 0) fail(`${roleLabel}_database_url_missing`);
  let parsedUrl;
  try {
    parsedUrl = new URL(raw);
  } catch {
    fail(`${roleLabel}_database_url_invalid`);
  }
  if (!parsedUrl.password) fail(`${roleLabel}_database_password_required`);
  let identity;
  try {
    identity = branchQualifiedDatabaseTarget(raw);
  } catch {
    fail(`${roleLabel}_database_url_invalid`);
  }
  if (identity.branchId !== REQUIRED_BRANCH_ID || identity.sqlDatabaseName !== 'postgres'
    || identity.originFingerprint !== target.provider.sqlOriginFingerprint
    || identity.role !== roleMap[roleLabel]) fail(`${roleLabel}_database_target_mismatch`);
  try {
    return { ...adminDatabaseConnectionConfig(raw), identity };
  } catch {
    fail(`${roleLabel}_database_tls_configuration_invalid`);
  }
}

export function assertDistinctRolePasswords(migrationRaw, verifierRaw) {
  let migrationPassword;
  let verifierPassword;
  try {
    migrationPassword = decodeURIComponent(new URL(migrationRaw).password);
    verifierPassword = decodeURIComponent(new URL(verifierRaw).password);
  } catch {
    fail('new_core_database_url_invalid');
  }
  if (!migrationPassword || !verifierPassword) fail('new_core_database_password_required');
  if (migrationPassword === verifierPassword) fail('new_core_database_role_passwords_must_be_distinct');
  return true;
}

function roleInventoryEndpoint(suffix = '') {
  return `https://api.planetscale.com/v1/organizations/${REQUIRED_ORGANIZATION}/databases/${REQUIRED_DATABASE}/branches/main${suffix}`;
}

async function readBoundedJson(response, expectedUrl, code) {
  if (!response || response.status !== 200 || response.redirected === true
    || (response.url && response.url !== expectedUrl) || !response.body) fail(code);
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 1_048_576) fail(code);
      chunks.push(chunk);
    }
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (!result || typeof result !== 'object' || Array.isArray(result)) fail(code);
    return result;
  } catch {
    fail(code);
  }
}

async function providerGet(url, authorization, code, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { authorization, accept: 'application/json' }, signal: AbortSignal.timeout(15_000),
    });
  } catch {
    fail(code);
  }
  return readBoundedJson(response, url, code);
}

function safeProviderRoleId(value) {
  return typeof value === 'string' && /^pscale_api_[a-z0-9]{1,64}$/.test(value);
}

export function verifyProviderRoles(rows, roleMap, now = Date.now(), { mode = 'api-managed',
  preservedRoleHashes = PRESERVED_ROLE_HASHES } = {}) {
  if (!Array.isArray(rows) || rows.length > 500) fail('new_core_provider_role_inventory_invalid');
  if (mode === NEW_CORE_SQL_ROLE_MODE) {
    validateRoleMap(roleMap, { mode });
    const row = rows[0];
    const hash = (value) => typeof value === 'string'
      ? crypto.createHash('sha256').update(value).digest('hex') : null;
    if (rows.length !== 1 || hash(row?.id) !== preservedRoleHashes.id
      || hash(row?.username) !== preservedRoleHashes.username
      || !safeProviderRoleId(row?.base_username)
      || row.username !== `${row.base_username}.${REQUIRED_BRANCH_ID}`
      || ROLE_LABELS.includes(row.name ?? row.label)
      || row.ready !== true || row.deleted_at !== null || row.expires_at !== null
      || row.database_name !== 'postgres' || row.branch?.id !== REQUIRED_BRANCH_ID
      || row.branch?.name !== 'main' || row.branch?.deleted_at !== null
      || !Array.isArray(row.inherited_roles) || row.inherited_roles.length !== 3
      || !row.inherited_roles.includes('pg_read_all_data')
      || !row.inherited_roles.includes('pg_write_all_data')) fail('new_core_preserved_provider_role_mismatch');
    return { count: 1, preservedBroadRoleCount: 1, scopedApiRoleCount: 0,
      scopedSqlRoleCount: 6, scopedSqlRolesRequireCatalogVerification: true };
  }
  if (mode !== 'api-managed') fail('new_core_role_mode_invalid');
  const byLabel = new Map();
  for (const row of rows) {
    const label = row?.name ?? row?.label;
    if (NEW_CORE_DEFERRED_ROLE_LABELS.includes(label)) fail('new_core_deferred_role_credential_present');
    if (!NEW_CORE_LOGIN_ROLE_LABELS.includes(label)) continue;
    if (byLabel.has(label) || typeof row.id !== 'string' || !/^[a-z0-9]{1,64}$/.test(row.id)
      || !safeProviderRoleId(row.base_username)
      || row.base_username !== roleMap[label]
      || row.username !== `${row.base_username}.${REQUIRED_BRANCH_ID}`
      || !Array.isArray(row.inherited_roles) || row.inherited_roles.length !== 0
      || row.ready !== true || row.deleted_at !== null
      || row.database_name !== 'postgres' || row.branch?.id !== REQUIRED_BRANCH_ID
      || row.branch?.name !== 'main' || row.branch?.deleted_at !== null
      || row.expires_at !== null) {
      fail('new_core_provider_role_inventory_mismatch');
    }
    byLabel.set(label, row.id);
  }
  if (byLabel.size !== NEW_CORE_LOGIN_ROLE_LABELS.length || new Set(byLabel.values()).size !== NEW_CORE_LOGIN_ROLE_LABELS.length) {
    fail('new_core_provider_role_inventory_incomplete');
  }
  return { count: NEW_CORE_LOGIN_ROLE_LABELS.length, distinct: true, allReady: true, branchQualified: true,
    deferredSqlRoleCount: NEW_CORE_DEFERRED_ROLE_LABELS.length, deferredSqlRolesRequireCatalogVerification: true };
}

async function readRoleInventory(authorization, roleMap, fetchImpl = fetch, mode = 'api-managed') {
  const rows = [];
  let total;
  for (let page = 1; page <= 5; page += 1) {
    const url = `${roleInventoryEndpoint('/roles')}?page=${page}&per_page=100`;
    const body = await providerGet(url, authorization, 'new_core_provider_role_inventory_unavailable', fetchImpl);
    if (body.current_page !== page || !Number.isSafeInteger(body.total_count) || body.total_count < 0
      || body.total_count > 500 || !Array.isArray(body.data) || body.data.length > 100
      || !Object.hasOwn(body, 'next_page')) fail('new_core_provider_role_inventory_invalid');
    total ??= body.total_count;
    if (body.total_count !== total) fail('new_core_provider_role_inventory_changed');
    rows.push(...body.data);
    if (body.next_page === null) {
      if (rows.length !== total) fail('new_core_provider_role_inventory_incomplete');
      return verifyProviderRoles(rows, roleMap, Date.now(), { mode });
    }
    if (body.next_page !== page + 1 || page === 5) fail('new_core_provider_role_inventory_incomplete');
  }
  fail('new_core_provider_role_inventory_incomplete');
}

function originFingerprint(origin) {
  if (!origin || !['postgres', 'postgresql'].includes(origin.scheme)
    || typeof origin.host !== 'string' || !/^[a-z0-9.-]+$/i.test(origin.host)
    || !origin.host.toLowerCase().endsWith('.psdb.cloud')
    || ![5432, '5432'].includes(origin.port) || origin.database !== 'postgres') fail('new_core_hyperdrive_origin_invalid');
  return crypto.createHash('sha256').update(JSON.stringify({
    scheme: 'postgres', host: origin.host.toLowerCase(), port: 5432, database: 'postgres',
  })).digest('hex');
}

function assertSqlOriginAttestation(target, environment, { schemaOnly = false } = {}) {
  const sqlOriginSha = target.provider.sqlOriginFingerprint;
  if ((!schemaOnly && target.provider.sqlOriginVerification !== 'VERIFIED_NEW_HYPERDRIVE_DESTINATION')
    || !/^[a-f0-9]{64}$/.test(sqlOriginSha ?? '')
    || environment[REQUIRED_ORIGIN_SHA_ENV] !== sqlOriginSha) fail('new_core_origin_attestation_missing');
  return sqlOriginSha;
}

function assertCostApproval(target) {
  const cost = target.costApproval;
  if (!cost || cost.approvalStatus !== 'APPROVED_COST_CEILING'
    || typeof cost.estimateReference !== 'string' || cost.estimateReference.length < 3
    || !/^[a-f0-9]{64}$/.test(cost.estimateSha256 ?? '')
    || !Number.isFinite(cost.oneTimeCeilingUsd) || cost.oneTimeCeilingUsd < 0
    || !Number.isFinite(cost.monthlyCeilingUsd) || cost.monthlyCeilingUsd < 0) fail('new_core_cost_approval_missing');
}

async function verifyPlanetScaleTarget({ target, roleMap, environment = process.env, fetchImpl = fetch, schemaOnly = false }) {
  const sqlOriginSha = assertSqlOriginAttestation(target, environment, { schemaOnly });
  let psAuthorization;
  try {
    psAuthorization = planetScaleServiceTokenAuthorizationHeader(environment[REQUIRED_PLANETSCALE_TOKEN_ENV] ?? '');
  } catch {
    fail('new_core_provider_authority_unavailable');
  }
  const databaseUrl = `https://api.planetscale.com/v1/organizations/${REQUIRED_ORGANIZATION}/databases/${REQUIRED_DATABASE}`;
  const branchUrl = roleInventoryEndpoint();
  const [database, branch] = await Promise.all([
    providerGet(databaseUrl, psAuthorization, 'new_core_database_metadata_unavailable', fetchImpl),
    providerGet(branchUrl, psAuthorization, 'new_core_branch_metadata_unavailable', fetchImpl),
  ]);
  const databaseDeletedAtAllowed = !Object.hasOwn(database, 'deleted_at') || database.deleted_at === null;
  if (database.id !== REQUIRED_DATABASE_ID || database.name !== REQUIRED_DATABASE
    || database.kind !== 'postgresql' || database.ready !== true || database.state !== 'ready'
    || !databaseDeletedAtAllowed
    || branch.id !== REQUIRED_BRANCH_ID || branch.name !== 'main' || branch.kind !== 'postgresql'
    || branch.deleted_at !== null || branch.ready !== true || branch.state !== 'ready'
    || branch.cluster_name !== 'PS_5_AWS_ARM' || branch.replicas !== 0
    || target.provider.cluster !== 'PS-5 aarch64' || target.provider.replicas !== 0) fail('new_core_provider_target_mismatch');
  if (schemaOnly && (database.production_branch_web_console !== false
    || database.resizing !== false || database.config_changing !== false
    || database.resize_queued !== false || database.config_change_queued !== false
    || branch.frozen !== false || branch.read_only_at !== null)) fail('new_core_schema_provider_baseline_mismatch');
  const region = assertProviderRegion(database, branch);
  const roleInventory = await readRoleInventory(psAuthorization, roleMap, fetchImpl,
    schemaOnly ? NEW_CORE_SQL_ROLE_MODE : 'api-managed');
  return { databaseId: database.id, branchId: branch.id, region, originFingerprint: sqlOriginSha, roleInventory };
}

async function verifyHyperdriveTarget({ target, roleMap, environment = process.env, fetchImpl = fetch }) {
  if (target.hyperdrive.originVerification !== 'VERIFIED_NEW_HYPERDRIVE_CACHING_DISABLED'
    || target.hyperdrive.requiredCachingDisabled !== true) fail('new_core_hyperdrive_attestation_missing');
  const sqlOriginSha = assertSqlOriginAttestation(target, environment);
  const cfToken = environment[REQUIRED_CLOUDFLARE_ACCESS_TOKEN_ENV] ?? '';
  if (typeof cfToken !== 'string' || cfToken.length === 0 || cfToken.length > 4096
    || /[\s\x00-\x1f\x7f]/.test(cfToken)) fail('new_core_cloudflare_authority_unavailable');
  const hyperdriveUrl = `https://api.cloudflare.com/client/v4/accounts/${REQUIRED_ACCOUNT_ID}/hyperdrive/configs/${REQUIRED_HYPERDRIVE_ID}`;
  const hyperdriveResponse = await providerGet(hyperdriveUrl, `Bearer ${cfToken}`, 'new_core_hyperdrive_metadata_unavailable', fetchImpl);
  const config = hyperdriveResponse.result;
  const origin = config?.origin;
  if (hyperdriveResponse.success !== true || config?.id !== REQUIRED_HYPERDRIVE_ID
    || config?.caching?.disabled !== true || config?.mtls?.sslmode !== 'verify-full'
    || typeof config?.mtls?.ca_certificate_id !== 'string' || config.mtls.ca_certificate_id.length === 0
    || origin?.user !== `${roleMap.lythaus_admin}.${REQUIRED_BRANCH_ID}`) fail('new_core_hyperdrive_metadata_mismatch');
  const observedFingerprint = originFingerprint(origin);
  if (observedFingerprint !== sqlOriginSha) fail('new_core_hyperdrive_origin_fingerprint_mismatch');
  return {
    originFingerprint: observedFingerprint,
    cachingDisabled: true,
  };
}

async function verifyNewCoreProviderTarget({ target, roleMap, environment = process.env, fetchImpl = fetch }) {
  if (target.hyperdrive.originVerification !== 'VERIFIED_NEW_HYPERDRIVE_CACHING_DISABLED'
    || target.hyperdrive.requiredCachingDisabled !== true) fail('new_core_hyperdrive_attestation_missing');
  const planetScale = await verifyPlanetScaleTarget({ target, roleMap, environment, fetchImpl });
  const hyperdrive = await verifyHyperdriveTarget({ target, roleMap, environment, fetchImpl });
  return { ...planetScale, ...hyperdrive };
}

function candidateApprovalValue(prefix, sourceSha, manifestSha, originSha, roleMapSha) {
  return `${prefix}:${sourceSha}:${manifestSha}:${REQUIRED_DATABASE_ID}:${REQUIRED_BRANCH_ID}:${originSha}:${roleMapSha}`;
}

function requireLiveApprovals({ sourceSha, manifestSha, originSha, roleMapSha, environment = process.env }) {
  const approvals = [
    ['LYTHAUS_NEW_CORE_DDL_APPROVAL', 'APPROVE_NEW_CORE_DDL'],
    ['LYTHAUS_NEW_CORE_GRANT_APPROVAL', 'APPROVE_NEW_CORE_ROLE_GRANTS'],
    ['LYTHAUS_NEW_CORE_CREDENTIAL_APPROVAL', 'APPROVE_NEW_CORE_CREDENTIAL_USE'],
    ['LYTHAUS_NEW_CORE_COST_APPROVAL', 'APPROVE_NEW_CORE_COST_CEILING'],
  ];
  for (const [name, prefix] of approvals) {
    if (environment[name] !== candidateApprovalValue(prefix, sourceSha, manifestSha, originSha, roleMapSha)) {
      fail(`new_core_${prefix.toLowerCase()}_approval_missing`);
    }
  }
}

export async function readBootstrapStateAsVerifier(client, { asLogin = false, expected = 'clean' } = {}) {
  await client.query('BEGIN');
  try {
    await client.query('SET TRANSACTION READ ONLY');
    if (!asLogin) await client.query('SET LOCAL ROLE "lythaus_verifier"');
    const rls = await client.query(`SELECT count(*)::integer AS relation_count,
        bool_or(class_entry.relrowsecurity OR class_entry.relforcerowsecurity) AS rls_enabled
      FROM pg_catalog.pg_class class_entry
      JOIN pg_catalog.pg_namespace namespace_entry ON namespace_entry.oid = class_entry.relnamespace
      WHERE (namespace_entry.nspname, class_entry.relname) IN
        (('identity', 'admin_memberships'), ('system', 'feature_flags'), ('system', 'audit_events'),
         ('identity', 'users'), ('identity', 'email_credentials'), ('identity', 'provider_links'),
         ('identity', 'handles'), ('social', 'profiles'))`);
    if (Number(rls.rows[0]?.relation_count) !== 8 || rls.rows[0]?.rls_enabled !== false) {
      fail('new_core_verifier_rls_visibility_unproven');
    }
    const result = await client.query('SELECT * FROM system.read_first_admin_bootstrap_state()');
    await client.query('ROLLBACK');
    const state = {
      membershipCount: Number(result.rows[0]?.membership_count ?? -1),
      activeAdminMembershipCount: Number(result.rows[0]?.active_admin_membership_count ?? -1),
      activeNonAdminMembershipCount: Number(result.rows[0]?.active_non_admin_membership_count ?? -1),
      bootstrapLatchCount: Number(result.rows[0]?.bootstrap_latch_count ?? -1),
      bootstrapConsumed: result.rows[0]?.bootstrap_consumed === true,
      completionAuditCount: Number(result.rows[0]?.completion_audit_count ?? -1),
      bootstrapControlPlaneCount: Number(result.rows[0]?.bootstrap_control_plane_count ?? -1),
      bootstrapConsumerMaterialCount: Number(result.rows[0]?.bootstrap_consumer_material_count ?? -1),
    };
    const expectedState = expected === 'accepted' ? {
      membershipCount: 1,
      activeAdminMembershipCount: 1,
      activeNonAdminMembershipCount: 0,
      bootstrapLatchCount: 1,
      bootstrapConsumed: true,
      completionAuditCount: 1,
      bootstrapControlPlaneCount: 1,
      bootstrapConsumerMaterialCount: 0,
    } : {
      membershipCount: 0,
      activeAdminMembershipCount: 0,
      activeNonAdminMembershipCount: 0,
      bootstrapLatchCount: 1,
      bootstrapConsumed: false,
      completionAuditCount: 0,
      bootstrapControlPlaneCount: 0,
      bootstrapConsumerMaterialCount: 0,
    };
    return assertBootstrapState(state, expectedState);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof Error && /^[a-z0-9_]+$/.test(error.message)) throw error;
    fail('new_core_verifier_query_failed');
  }
}

async function verifyRoleBoundary(client, roleMap, provisionerRoleSha256 = null, { mode = 'api-managed' } = {}) {
  validateRoleMap(roleMap, { local: ROLE_LABELS.every((label) => roleMap[label] === label) });
  const result = await client.query(`SELECT
    has_schema_privilege($1, 'identity', 'CREATE') AS migration_identity_ddl,
    has_schema_privilege($1, 'content', 'CREATE') AS migration_content_ddl,
    has_schema_privilege($2, 'identity', 'CREATE') AS app_identity_ddl,
    has_schema_privilege($3, 'identity', 'CREATE') AS admin_identity_ddl,
    has_schema_privilege($6, 'identity', 'CREATE') AS verifier_identity_ddl,
    has_table_privilege($3, 'identity.users', 'INSERT') AS admin_user_insert,
    has_table_privilege($3, 'identity.admin_memberships', 'INSERT') AS admin_membership_insert,
    has_function_privilege($3, 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS admin_bootstrap_execute,
    has_function_privilege($2, 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS app_bootstrap_execute,
    has_function_privilege($4, 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS jobs_bootstrap_execute,
    has_function_privilege($5, 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS privacy_bootstrap_execute,
    has_function_privilege($6, 'identity.bootstrap_first_administrator(uuid,bytea,uuid,text)', 'EXECUTE') AS verifier_bootstrap_execute,
    has_function_privilege($6, 'system.read_first_admin_bootstrap_state()', 'EXECUTE') AS verifier_state_read_execute,
    has_function_privilege($3, 'system.read_first_admin_bootstrap_state()', 'EXECUTE') AS admin_state_read_execute,
    has_table_privilege($6, 'identity.admin_memberships', 'SELECT') AS verifier_table_select,
    has_column_privilege($6, 'identity.admin_memberships', 'access_subject_hmac', 'SELECT') AS verifier_subject_digest_select,
    has_table_privilege($6, 'system.feature_flags', 'SELECT') AS verifier_flag_select,
    has_table_privilege($6, 'system.feature_flags', 'UPDATE') AS verifier_flag_update,
    has_table_privilege($6, 'system.audit_events', 'SELECT') AS verifier_audit_select,
    has_table_privilege($6, 'system.audit_events', 'INSERT') AS verifier_audit_insert,
    has_database_privilege($6, 'postgres', 'CONNECT') AS verifier_database_connect,
    has_database_privilege($6, 'postgres', 'CREATE') AS verifier_database_create,
    has_database_privilege($1, 'postgres', 'CREATE') AS migration_database_create,
    (SELECT datdba = (SELECT oid FROM pg_roles WHERE rolname = $1)
       FROM pg_database WHERE datname = 'postgres') AS migration_database_owner,
    has_database_privilege($1, 'postgres', 'CREATE WITH GRANT OPTION') AS migration_database_create_grant_option,
    (SELECT count(*)::integer FROM pg_roles WHERE rolname = ANY($7::text[]) AND
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AS unsafe_role_count,
    (SELECT count(*)::integer FROM pg_roles WHERE
      (rolname = ANY($11::text[]) AND NOT rolcanlogin)
      OR (rolname = ANY($12::text[]) AND rolcanlogin)) AS role_login_profile_mismatch_count,
    (SELECT count(*)::integer FROM pg_auth_members membership
      JOIN pg_roles role_entry ON role_entry.oid IN (membership.roleid, membership.member)
      WHERE role_entry.rolname = ANY($7::text[])) AS role_membership_count,
    (SELECT count(*)::integer FROM (
      SELECT namespace_entry.nspowner AS owner_oid FROM pg_namespace namespace_entry
       WHERE namespace_entry.nspname = ANY($8::text[])
      UNION ALL
      SELECT relation_entry.relowner FROM pg_class relation_entry
      JOIN pg_namespace namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
       WHERE namespace_entry.nspname = ANY($8::text[])
      UNION ALL
      SELECT procedure_entry.proowner FROM pg_proc procedure_entry
      JOIN pg_namespace namespace_entry ON namespace_entry.oid = procedure_entry.pronamespace
       WHERE namespace_entry.nspname = ANY($8::text[])
    ) object_owner JOIN pg_roles owner_role ON owner_role.oid = object_owner.owner_oid
      WHERE owner_role.rolname IS DISTINCT FROM $1) AS non_migration_owned_object_count,
    (SELECT count(*)::integer FROM unnest($9::text[]) AS restricted(role_name)
      CROSS JOIN unnest($10::text[]) AS application_schema(schema_name)
      WHERE has_schema_privilege(restricted.role_name, application_schema.schema_name, 'CREATE')) AS restricted_schema_ddl_count,
    (SELECT count(*)::integer FROM unnest($10::text[]) AS application_schema(schema_name)
      WHERE has_schema_privilege($1, application_schema.schema_name, 'CREATE')) AS migration_schema_ddl_count,
    (SELECT count(*)::integer FROM unnest($9::text[]) AS restricted(role_name)
      WHERE has_database_privilege(restricted.role_name, 'postgres', 'CREATE')) AS restricted_database_ddl_count`,
  [roleMap.lythaus_migrations, roleMap.lythaus_runtime, roleMap.lythaus_admin, roleMap.lythaus_jobs,
    roleMap.lythaus_privacy, roleMap.lythaus_verifier, Object.values(roleMap), APPLICATION_SCHEMAS,
    [roleMap.lythaus_runtime, roleMap.lythaus_admin, roleMap.lythaus_jobs, roleMap.lythaus_privacy, roleMap.lythaus_verifier],
    APPLICATION_SCHEMAS, NEW_CORE_LOGIN_ROLE_LABELS.map((label) => roleMap[label]),
    NEW_CORE_DEFERRED_ROLE_LABELS.map((label) => roleMap[label])]);
  const row = result.rows[0];
  if (!row
    || !row.migration_identity_ddl || !row.migration_content_ddl
    || row.app_identity_ddl || row.admin_identity_ddl || row.verifier_identity_ddl
    || row.admin_user_insert || row.admin_membership_insert || !row.admin_bootstrap_execute
    || row.app_bootstrap_execute || row.jobs_bootstrap_execute || row.privacy_bootstrap_execute || row.verifier_bootstrap_execute
    || !row.verifier_state_read_execute || row.admin_state_read_execute
    || row.verifier_table_select || row.verifier_subject_digest_select
    || row.verifier_flag_select || row.verifier_flag_update || row.verifier_audit_select || row.verifier_audit_insert
    || !row.verifier_database_connect || row.verifier_database_create
    || !row.migration_database_create || row.migration_database_owner
    || row.migration_database_create_grant_option !== false
    || Number(row.unsafe_role_count) !== 0
    || Number(row.role_login_profile_mismatch_count) !== 0
    || Number(row.non_migration_owned_object_count) !== 0
    || Number(row.restricted_schema_ddl_count) !== 0
    || Number(row.migration_schema_ddl_count) !== APPLICATION_SCHEMAS.length
    || Number(row.restricted_database_ddl_count) !== 0) fail('new_core_role_boundary_failed');
  const memberships = await verifyNewCoreRoleMemberships(client, roleMap, provisionerRoleSha256, { mode });
  if (Number(row.role_membership_count) !== memberships.totalMemberships) fail('new_core_role_membership_boundary_failed');
  return {
    migrationDdlOnly: true,
    sixDistinctRoles: true,
    loginRoleCount: NEW_CORE_LOGIN_ROLE_LABELS.length,
    deferredNoLoginRoleCount: NEW_CORE_DEFERRED_ROLE_LABELS.length,
    appRuntimeRoleDistinct: true,
    adminRoleDistinct: true,
    verifierAggregateOnly: true,
    adminDirectIdentityInsertDenied: true,
    adminBootstrapFunctionOnly: true,
    verifierCannotReadSubjectDigest: true,
    verifierDatabaseConnect: true,
    migrationDatabaseCreate: true,
    migrationDatabaseOwnership: false,
    migrationDatabaseCreateGrantOption: false,
    restrictedSchemaDdlGrants: 0,
    migrationSchemaDdlSchemas: APPLICATION_SCHEMAS.length,
    restrictedDatabaseDdlGrants: 0,
    unsafeRoleAttributes: 0,
    roleMemberships: memberships.totalMemberships,
    provisionerManagementGrants: memberships.provisionerManagementGrants,
    runtimeRoleMemberships: memberships.runtimeRoleMemberships,
    nonMigrationOwnedApplicationObjects: 0,
  };
}

async function verifyCanonicalSchemaFingerprint(client, migrations) {
  const relationRows = await client.query(`SELECT table_type, table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = ANY($1::text[])
    ORDER BY table_type, table_schema, table_name`, [APPLICATION_SCHEMAS]);
  const ledger = await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version');
  const observed = runtimeSchemaFingerprint(relationRows.rows, ledger.rows);
  const canonical = canonicalReleaseSchemaContract({ root: ROOT, committedOnly: true });
  if (relationRows.rows.length !== 103 || ledger.rows.length !== migrations.migrations.length
    || observed !== canonical.fingerprint) fail('new_core_schema_fingerprint_mismatch');
  return { sha256: observed, relationCount: relationRows.rows.length, migrationLedgerCount: ledger.rows.length };
}

async function rehearseLocalPostgres17() {
  const connectionString = assertLocalRehearsalUrl(process.env[LOCAL_URL_ENV] ?? '');
  const { migrations } = loadCleanInstallContract();
  const client = new Client({ connectionString, ssl: false });
  try {
    await client.connect();
  } catch {
    await client.end().catch(() => undefined);
    fail('local_pg17_connection_failed');
  }
  try {
    await assertEmptyTarget(client);
    await createLocalRoles(client);
    await client.query('SET ROLE lythaus_migrations');
    const roleMap = Object.fromEntries(ROLE_LABELS.map((label) => [label, label]));
    const pendingRegistry = [];
    const emptyDataGuards = [];
    for (const migration of migrations.migrations) {
      const guard = await applyMigration(client, migration, pendingRegistry);
      if (guard) emptyDataGuards.push(guard);
    }
    if (pendingRegistry.length !== 0) fail('new_core_migration_ledger_missing');

    const ledger = await client.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version');
    if (ledger.rows.length !== migrations.migrations.length) fail('new_core_migration_ledger_incomplete');
    migrations.migrations.forEach((migration, index) => {
      if (ledger.rows[index]?.version !== migration.name || ledger.rows[index]?.checksum !== migration.checksum) {
        fail('new_core_migration_ledger_checksum_mismatch');
      }
    });
    const releaseNames = migrations.migrations.filter(({ name }) => name >= '0017_').map(({ name }) => name);
    for (const state of await classifyMigrationState(client, releaseNames)) assertCompleteMigrationPostconditions(state);

    await client.query(substituteRoleNames(fs.readFileSync(path.join(ROOT, 'database/planetscale/grants/roles.sql'), 'utf8'), roleMap));
    await client.query(substituteRoleNames(fs.readFileSync(path.join(ROOT, VERIFIER_GRANTS_PATH), 'utf8'), roleMap));
    await client.query(fs.readFileSync(path.join(ROOT, 'database/planetscale/verification/verify.sql'), 'utf8'));
    await client.query('RESET ROLE');

    const extensionRows = await client.query('SELECT extname FROM pg_extension WHERE extname = ANY($1::text[]) ORDER BY extname', [REQUIRED_EXTENSIONS]);
    if (JSON.stringify(extensionRows.rows.map((row) => row.extname)) !== JSON.stringify([...REQUIRED_EXTENSIONS].sort())) fail('new_core_required_extensions_missing');
    const counts = await client.query(`SELECT
      (SELECT count(*)::integer FROM pg_tables WHERE schemaname = ANY($1::text[])) AS table_count,
      (SELECT count(*)::integer FROM information_schema.tables WHERE table_schema = ANY($1::text[])) AS relation_count`, [APPLICATION_SCHEMAS]);
    const tableCount = Number(counts.rows[0]?.table_count ?? -1);
    const relationCount = Number(counts.rows[0]?.relation_count ?? -1);
    if (tableCount !== 102 || relationCount !== 103) fail('new_core_schema_counts_mismatch');

    const bootstrapState = await readBootstrapStateAsVerifier(client);
    const roleBoundary = await verifyRoleBoundary(client, roleMap);
    const schemaFingerprint = await verifyCanonicalSchemaFingerprint(client, migrations);
    const version = await client.query("SELECT current_setting('server_version_num')::integer AS version_num");
    const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    return {
      status: 'LOCAL_PG17_CLEAN_INSTALL_PASS',
      sourceSha,
      serverVersionNum: Number(version.rows[0]?.version_num),
      migrationCount: migrations.migrations.length,
      migrations: migrations.migrations.map(({ name, checksum }) => ({ name, checksum })),
      migrationBytes: migrations.bytes,
      migrationSetSha256: migrations.checksum,
      requiredExtensions: extensionRows.rows.map((row) => row.extname),
      tableCount,
      relationCount,
      schemaFingerprint,
      emptyDataGuards,
      roles: roleBoundary,
      bootstrapState,
      liveTargetStatus: 'LIVE_CONFIGURATION_BLOCKED',
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function liveRoleMap(environment = process.env, mode = 'api-managed') {
  let roleMap;
  try {
    roleMap = JSON.parse(environment[LIVE_ROLES_ENV] ?? '');
  } catch {
    fail('new_core_role_map_missing_or_invalid');
  }
  validateRoleMap(roleMap, { mode });
  return roleMap;
}

function plannedLiveDatabaseTarget(originSha) {
  return buildPlanetScaleTargetIdentity({
    provider: {
      organization: REQUIRED_ORGANIZATION,
      database: REQUIRED_DATABASE,
      branchName: 'main',
      branchId: REQUIRED_BRANCH_ID,
    },
    sql: { databaseName: 'postgres', originFingerprint: originSha },
  });
}

async function assertLiveEmptyTarget(client, roleMap, provisionerRoleSha256 = null, { mode = 'api-managed' } = {}) {
  const result = await client.query(`SELECT
    current_database() AS database_name,
    current_user AS current_role,
    current_setting('server_version_num')::integer AS version_num,
    has_database_privilege(current_user, current_database(), 'CREATE') AS migration_database_create,
    (SELECT datdba = (SELECT oid FROM pg_roles WHERE rolname = current_user)
       FROM pg_database WHERE datname = current_database()) AS migration_database_owner,
    has_database_privilege(current_user, current_database(), 'CREATE WITH GRANT OPTION') AS migration_database_create_grant_option,
    (SELECT count(*)::integer FROM pg_namespace
      WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema', 'public')) AS application_schema_count,
    (SELECT count(*)::integer FROM pg_class relation_entry
      JOIN pg_namespace namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
      WHERE namespace_entry.nspname NOT LIKE 'pg_%'
        AND namespace_entry.nspname <> 'information_schema'
        AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) AS application_relation_count,
    to_regclass('system.schema_migrations') IS NULL AS ledger_missing,
    (SELECT count(*)::integer FROM pg_roles WHERE rolname = ANY($1::text[])) AS provisioned_role_count,
    (SELECT count(*)::integer FROM pg_roles WHERE rolname = ANY($1::text[])
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AS unsafe_role_count,
    (SELECT count(*)::integer FROM pg_roles WHERE
      (rolname = ANY($2::text[]) AND NOT rolcanlogin)
      OR (rolname = ANY($3::text[]) AND rolcanlogin)) AS role_login_profile_mismatch_count,
    (SELECT count(*)::integer FROM unnest($4::text[]) AS restricted(role_name)
      WHERE has_database_privilege(restricted.role_name, current_database(), 'CREATE')) AS restricted_database_ddl_count,
    (SELECT count(*)::integer FROM pg_auth_members membership
      JOIN pg_roles role_entry ON role_entry.oid IN (membership.roleid, membership.member)
      WHERE role_entry.rolname = ANY($1::text[])) AS role_membership_count`,
  [Object.values(roleMap), NEW_CORE_LOGIN_ROLE_LABELS.map((label) => roleMap[label]),
    NEW_CORE_DEFERRED_ROLE_LABELS.map((label) => roleMap[label]),
    ROLE_LABELS.filter((label) => label !== 'lythaus_migrations').map((label) => roleMap[label])]);
  const row = result.rows[0];
  if (!row || row.database_name !== 'postgres' || row.current_role !== roleMap.lythaus_migrations
    || Number(row.version_num) < 170000 || Number(row.version_num) >= 180000
    || row.ledger_missing !== true || Number(row.provisioned_role_count) !== ROLE_LABELS.length) {
    fail('new_core_live_database_not_empty_postgres17');
  }
  if (row.migration_database_create !== true || row.migration_database_owner !== false
    || row.migration_database_create_grant_option !== false) {
    fail('new_core_live_migration_database_create_profile_invalid');
  }
  if (Number(row.unsafe_role_count) !== 0
    || Number(row.role_login_profile_mismatch_count) !== 0 || Number(row.restricted_database_ddl_count) !== 0) {
    fail('new_core_live_role_capability_precondition_failed');
  }
  const catalog = await assertNewCoreEmptyCatalog(client, row);
  const memberships = await verifyNewCoreRoleMemberships(client, roleMap, provisionerRoleSha256, { mode });
  if (Number(row.role_membership_count) !== memberships.totalMemberships) fail('new_core_role_membership_boundary_failed');
  return {
    cleanSchema: true,
    catalog,
    migrationLedgerAbsent: true,
    postgresMajor: 17,
    migrationDatabaseCreate: true,
    migrationDatabaseOwnership: false,
    migrationDatabaseCreateGrantOption: false,
    loginRoleCount: NEW_CORE_LOGIN_ROLE_LABELS.length,
    deferredNoLoginRoleCount: NEW_CORE_DEFERRED_ROLE_LABELS.length,
    provisionedRoleCount: ROLE_LABELS.length,
    unsafeRoleAttributes: 0,
    roleMemberships: memberships.totalMemberships,
    provisionerManagementGrants: memberships.provisionerManagementGrants,
    runtimeRoleMemberships: memberships.runtimeRoleMemberships,
  };
}

async function assertLiveConnection(client, raw, roleLabel, roleMap, target) {
  const config = liveSqlConnectionConfig(raw, roleLabel, roleMap, target);
  try {
    await assertConnectedAdminDatabaseTarget(client, {
      connectionString: raw,
      plannedTarget: plannedLiveDatabaseTarget(target.provider.sqlOriginFingerprint),
    });
  } catch {
    fail(`new_core_${roleLabel}_connected_target_mismatch`);
  }
  if (config.identity.role !== roleMap[roleLabel]) fail(`new_core_${roleLabel}_role_mismatch`);
}

export function assertSchemaInstallationScope(target) {
  const scope = target.schemaInstallation;
  if (!scope || scope.scope !== 'SCHEMA_AND_CANONICAL_OBJECT_GRANTS_ONLY'
    || scope.roleMode !== NEW_CORE_SQL_ROLE_MODE || scope.creatorRoleSha256 !== NEW_CORE_SQL_CREATOR_SHA256
    || scope.protectedMainSha !== 'ba10cfb16941cd163e345af3c00b9bd739884646'
    || scope.expectedProviderExtension !== 'hypopg'
    || JSON.stringify(scope.expectedInstalledExtensions) !== JSON.stringify(['hypopg', 'plpgsql'])
    || scope.expectedProviderSchemas !== 1 || scope.expectedProviderViews !== 2
    || scope.originEvidenceRunId !== '43835553248'
    || scope.expectedSchemaDefinitionFingerprintSha256 !== '69769fb59964a84355d5cc24e8f6c1a23595076a3d1d5f39e45add3e58dff90e'
    || scope.expectedGrantFingerprintSha256 !== '65ae6c5e98cacafdd1de5fd58703bd5358a65b9f73781881ee35383debbb4513'
    || scope.providerResourceChangesAllowed !== false || scope.credentialChangesAllowed !== false
    || scope.credentialDelivery !== 'OWNER_PRIVATE_SESSION_ONLY_NOT_GITHUB_OR_CHAT_ATTACHMENTS'
    || target.provider.sqlOriginFingerprint !== '30458dae9a257fc30c567ae95f44975fc766233fb11fc15d2542399bbdcd3558') {
    fail('new_core_schema_installation_scope_mismatch');
  }
  return scope;
}

function readProtectedMain() {
  try {
    return JSON.parse(execFileSync('gh', ['api', 'repos/AsoraKK/Lythaus/branches/main'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000,
    }));
  } catch { fail('new_core_protected_main_read_unavailable'); }
}

export async function assertSchemaOnlyBaseline(client) {
  const result = await client.query(fs.readFileSync(path.join(ROOT,
    'database/planetscale/verification/new-core-initial-grants-state.sql'), 'utf8'));
  const expected = {
    logical_database_matches: true, postgres_major_matches: true, scoped_role_count: 6,
    login_count: 3, nologin_count: 3, unsafe_role_count: 0, inherit_attribute_count: 0,
    nonexpiring_login_count: 3, scoped_membership_count: 6, creator_admin_only_membership_count: 6,
    migration_database_create: true, migration_create_grant_option: false,
    restricted_database_create_count: 0, login_connect_count: 3, connect_grant_option_count: 0,
    scoped_database_owner_count: 0, expected_durable_database_acl_count: 4,
    unexpected_application_schema_count: 0, non_system_relation_count: 2,
    provider_hypopg_view_count: 2, migration_ledger_absent: true,
  };
  if (result.rows.length !== 1 || Object.entries(expected).some(([key, value]) => result.rows[0][key] !== value)) {
    fail('new_core_schema_initial_grants_baseline_mismatch');
  }
  const state = await client.query(`SELECT session_user = current_user AND current_user = 'lythaus_migrations' AS direct_migration_login,
    (SELECT array_agg(extname::text ORDER BY extname) FROM pg_extension) AS extensions,
    (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public') AS public_function_count,
    (SELECT count(*)::integer FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public') AS public_type_count`);
  const row = state.rows[0];
  if (!row || row.direct_migration_login !== true || row.public_function_count !== 0 || row.public_type_count !== 0
    || JSON.stringify(row.extensions) !== JSON.stringify(['hypopg', 'plpgsql'])) fail('new_core_schema_catalog_baseline_mismatch');
  const available = await client.query(`SELECT name::text FROM pg_available_extension_versions v
    WHERE name = ANY($1::text[]) AND trusted AND version = (SELECT default_version FROM pg_available_extensions e WHERE e.name=v.name)
    ORDER BY name COLLATE "C"`, [REQUIRED_EXTENSIONS]);
  if (JSON.stringify(available.rows.map((entry) => entry.name)) !== JSON.stringify([...REQUIRED_EXTENSIONS].sort())) {
    fail('new_core_schema_trusted_extensions_unavailable');
  }
  return { directMigrationLogin: true, initialGrantsMatch: true, providerViews: 2,
    installedExtensions: row.extensions, applicationRelations: 0, migrationLedgerAbsent: true };
}

export async function verifyPreservedProviderExtension(client) {
  const result = await client.query(NEW_CORE_PROVIDER_BASELINE_SQL, [NEW_CORE_PROVIDER_BASELINE.schema,
    NEW_CORE_PROVIDER_BASELINE.extension, [...NEW_CORE_PROVIDER_BASELINE.views]]);
  if (result.rows.length !== 1) fail('new_core_provider_extension_baseline_mismatch');
  assertNewCoreProviderBaseline(result.rows[0]);
  const extensions = await client.query('SELECT extname FROM pg_extension ORDER BY extname');
  if (JSON.stringify(extensions.rows.map((row) => row.extname))
    !== JSON.stringify(['hypopg', 'pg_trgm', 'pgcrypto', 'plpgsql', 'unaccent'])) {
    fail('new_core_schema_extension_set_mismatch');
  }
  const unexpected = await client.query(`SELECT
    (SELECT count(*)::integer FROM pg_namespace WHERE nspname !~ '^pg_'
      AND nspname <> ALL($1::text[]) AND nspname NOT IN ('public','information_schema','pscale_extensions')) AS schemas,
    (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND n.nspname <> ALL($1::text[]) AND n.nspname <> 'pscale_extensions'
      AND c.relkind IN ('r','p','v','m','S','f')) AS relations`, [APPLICATION_SCHEMAS]);
  if (unexpected.rows[0]?.schemas !== 0 || unexpected.rows[0]?.relations !== 0) fail('new_core_schema_unexpected_catalog_objects');
  return { hypopgPreserved: true, providerViewsPreserved: 2, extensionSetVerified: true };
}

export async function verifySchemaOnlyData(client) {
  const tables = await client.query('SELECT schemaname, tablename FROM pg_tables WHERE schemaname = ANY($1::text[]) ORDER BY schemaname, tablename', [APPLICATION_SCHEMAS]);
  const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
  const sql = tables.rows.map(({ schemaname, tablename }, index) => `SELECT ${index}::integer AS index, count(*)::integer AS count FROM ${quote(schemaname)}.${quote(tablename)}`).join(' UNION ALL ');
  const counts = await client.query(sql);
  if (tables.rows.length !== 102 || counts.rows.length !== 102) fail('new_core_schema_data_count_incomplete');
  for (const row of counts.rows) {
    const table = tables.rows[row.index];
    const expected = table?.schemaname === 'system' && table.tablename === 'schema_migrations' ? 22
      : table?.schemaname === 'system' && table.tablename === 'feature_flags' ? 1 : 0;
    if (row.count !== expected) fail('new_core_schema_unexpected_data');
  }
  return { applicationTablesChecked: 102, migrationLedgerRows: 22, unconsumedLatchRows: 1, otherApplicationRows: 0 };
}

export function schemaOnlyObjectGrantSql(sql, { verifier = false } = {}) {
  const databaseStatements = verifier ? ['GRANT CONNECT ON DATABASE postgres TO lythaus_verifier;'] : [
    'GRANT CONNECT ON DATABASE postgres TO lythaus_runtime, lythaus_admin, lythaus_jobs, lythaus_privacy, lythaus_migrations;',
    'REVOKE CREATE ON DATABASE postgres FROM lythaus_runtime, lythaus_admin, lythaus_jobs, lythaus_privacy;',
  ];
  let result = sql;
  for (const statement of databaseStatements) {
    if (result.split(statement).length !== 2) fail('new_core_schema_database_acl_template_changed');
    result = result.replace(statement, '-- Database ACL preconditions are verified separately; this schema-only run cannot change them.');
  }
  if (/\b(?:GRANT|REVOKE)\b[^;]*\bON\s+DATABASE\b/i.test(result)) fail('new_core_schema_database_acl_statement_forbidden');
  return result;
}

export async function schemaGrantFingerprint(client) {
  const result = await client.query(`SELECT kind, object_name, privileges FROM (
    SELECT 'schema' AS kind, nspname AS object_name, coalesce(nspacl::text, '') AS privileges
      FROM pg_namespace WHERE nspname = ANY($1::text[])
    UNION ALL
    SELECT 'relation', n.nspname || '.' || c.relname, coalesce(c.relacl::text, '')
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname = ANY($1::text[])
    UNION ALL
    SELECT 'column', n.nspname || '.' || c.relname || '.' || a.attname, a.attacl::text
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname = ANY($1::text[]) AND a.attacl IS NOT NULL
    UNION ALL
    SELECT 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', coalesce(p.proacl::text, '')
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname = ANY($1::text[])
    UNION ALL
    SELECT 'default', r.rolname || ':' || coalesce(n.nspname, '') || ':' || d.defaclobjtype::text, d.defaclacl::text
      FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
      WHERE r.rolname='lythaus_migrations'
  ) grants ORDER BY kind COLLATE "C", object_name COLLATE "C"`, [APPLICATION_SCHEMAS]);
  return { sha256: crypto.createHash('sha256').update(JSON.stringify(result.rows)).digest('hex'), objectCount: result.rows.length };
}

export async function schemaDefinitionFingerprint(client) {
  await client.query('BEGIN READ ONLY');
  try {
    await client.query('SET LOCAL search_path = pg_catalog');
    const result = await client.query(`SELECT kind, object_name, definition FROM (
      SELECT 'relation' AS kind, n.nspname || '.' || c.relname AS object_name,
        jsonb_build_array(c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.reloptions)::text AS definition
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r','p','v','m','S','f')
      UNION ALL
      SELECT 'column', n.nspname || '.' || c.relname || '.' || a.attname,
        jsonb_build_array(a.attnum, format_type(a.atttypid,a.atttypmod), a.attnotnull,
          a.attidentity, a.attgenerated, pg_get_expr(d.adbin,d.adrelid))::text
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE n.nspname = ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped
      UNION ALL
      SELECT 'constraint', n.nspname || '.' || c.relname || '.' || k.conname,
        jsonb_build_array(pg_get_constraintdef(k.oid,true), k.convalidated, k.condeferrable, k.condeferred)::text
        FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY($1::text[])
      UNION ALL
      SELECT 'index', n.nspname || '.' || c.relname,
        jsonb_build_array(pg_get_indexdef(i.indexrelid), i.indisvalid, i.indisready)::text
        FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY($1::text[])
      UNION ALL
      SELECT 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', pg_get_functiondef(p.oid)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname = ANY($1::text[])
      UNION ALL
      SELECT 'view', n.nspname || '.' || c.relname, pg_get_viewdef(c.oid,true)
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('v','m')
      UNION ALL
      SELECT 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid,true)
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY($1::text[]) AND NOT t.tgisinternal
      UNION ALL
      SELECT 'enum', n.nspname || '.' || t.typname || ':' || e.enumsortorder, e.enumlabel::text
        FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname = ANY($1::text[])
      UNION ALL
      SELECT 'policy', n.nspname || '.' || c.relname || '.' || p.polname,
        jsonb_build_array(p.polcmd, p.polpermissive, pg_get_expr(p.polqual,p.polrelid), pg_get_expr(p.polwithcheck,p.polrelid),
          (SELECT array_agg(CASE WHEN oid=0 THEN 'PUBLIC' ELSE pg_get_userbyid(oid)::text END ORDER BY oid) FROM unnest(p.polroles) oid))::text
        FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname = ANY($1::text[])
    ) catalog ORDER BY kind COLLATE "C", object_name COLLATE "C"`, [APPLICATION_SCHEMAS]);
    await client.query('COMMIT');
    return { sha256: crypto.createHash('sha256').update(JSON.stringify(result.rows)).digest('hex'), objectCount: result.rows.length };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function immutableRoleState(client) {
  const result = await client.query(`SELECT
    (SELECT datacl::text FROM pg_database WHERE datname='postgres') AS database_acl,
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rolname) FROM pg_roles r WHERE r.rolname = ANY($1::text[])) AS roles,
    (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid, m.member, m.grantor) FROM pg_auth_members m
      JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname = ANY($1::text[])) AS memberships`, [ROLE_LABELS]);
  return crypto.createHash('sha256').update(JSON.stringify(result.rows)).digest('hex');
}

async function applyAndVerifyCleanSchema({ migrationClient, verifierClient, migrations, roleMap,
  creatorSha = null, mode = 'api-managed', schemaOnly = false }) {
  const initialRoleState = schemaOnly ? await immutableRoleState(migrationClient) : null;
  const pendingRegistry = [];
  const emptyDataGuards = [];
  for (const migration of migrations.migrations) {
    const guard = await applyMigration(migrationClient, migration, pendingRegistry);
    if (guard) emptyDataGuards.push(guard);
  }
  if (pendingRegistry.length !== 0) fail('new_core_migration_ledger_missing');
  const ledger = await migrationClient.query('SELECT version, checksum FROM system.schema_migrations ORDER BY version');
  if (ledger.rows.length !== migrations.migrations.length) fail('new_core_migration_ledger_incomplete');
  migrations.migrations.forEach((migration, index) => {
    if (ledger.rows[index]?.version !== migration.name || ledger.rows[index]?.checksum !== migration.checksum) {
      fail('new_core_migration_ledger_checksum_mismatch');
    }
  });
  const releaseNames = migrations.migrations.filter(({ name }) => name >= '0017_').map(({ name }) => name);
  for (const state of await classifyMigrationState(migrationClient, releaseNames)) assertCompleteMigrationPostconditions(state);
  try {
    await migrationClient.query('BEGIN');
    const roleSql = fs.readFileSync(path.join(ROOT, 'database/planetscale/grants/roles.sql'), 'utf8');
    const verifierSql = fs.readFileSync(path.join(ROOT, VERIFIER_GRANTS_PATH), 'utf8');
    await migrationClient.query(substituteRoleNames(schemaOnly ? schemaOnlyObjectGrantSql(roleSql) : roleSql, roleMap));
    await migrationClient.query(substituteRoleNames(schemaOnly ? schemaOnlyObjectGrantSql(verifierSql, { verifier: true }) : verifierSql, roleMap));
    await migrationClient.query(fs.readFileSync(path.join(ROOT, 'database/planetscale/verification/verify.sql'), 'utf8'));
    await migrationClient.query('COMMIT');
  } catch {
    await migrationClient.query('ROLLBACK').catch(() => undefined);
    fail('new_core_role_grant_install_failed');
  }
  const extensionRows = await migrationClient.query('SELECT extname FROM pg_extension WHERE extname = ANY($1::text[]) ORDER BY extname', [REQUIRED_EXTENSIONS]);
  if (JSON.stringify(extensionRows.rows.map((row) => row.extname)) !== JSON.stringify([...REQUIRED_EXTENSIONS].sort())) {
    fail('new_core_required_extensions_missing');
  }
  const counts = await migrationClient.query(`SELECT
    (SELECT count(*)::integer FROM pg_tables WHERE schemaname = ANY($1::text[])) AS table_count,
    (SELECT count(*)::integer FROM information_schema.tables WHERE table_schema = ANY($1::text[])) AS relation_count`, [APPLICATION_SCHEMAS]);
  const tableCount = Number(counts.rows[0]?.table_count ?? -1);
  const relationCount = Number(counts.rows[0]?.relation_count ?? -1);
  if (tableCount !== 102 || relationCount !== 103) fail('new_core_schema_counts_mismatch');
  const roles = await verifyRoleBoundary(migrationClient, roleMap, creatorSha, { mode });
  const schemaFingerprint = await verifyCanonicalSchemaFingerprint(migrationClient, migrations);
  const bootstrapState = await readBootstrapStateAsVerifier(verifierClient, { asLogin: true });
  const version = await migrationClient.query("SELECT current_setting('server_version_num')::integer AS version_num");
  if (schemaOnly && await immutableRoleState(migrationClient) !== initialRoleState) fail('new_core_schema_database_acl_or_role_state_changed');
  const grantFingerprint = schemaOnly ? await schemaGrantFingerprint(migrationClient) : null;
  if (schemaOnly && grantFingerprint.sha256 !== '65ae6c5e98cacafdd1de5fd58703bd5358a65b9f73781881ee35383debbb4513') {
    fail('new_core_schema_grant_fingerprint_mismatch');
  }
  const definitionFingerprint = schemaOnly ? await schemaDefinitionFingerprint(migrationClient) : null;
  if (schemaOnly && definitionFingerprint.sha256 !== '69769fb59964a84355d5cc24e8f6c1a23595076a3d1d5f39e45add3e58dff90e') {
    fail('new_core_schema_definition_fingerprint_mismatch');
  }
  return {
    serverVersionNum: Number(version.rows[0]?.version_num), migrationCount: migrations.migrations.length,
    migrations: migrations.migrations.map(({ name, checksum }) => ({ name, checksum })),
    migrationSetSha256: migrations.checksum, requiredExtensions: extensionRows.rows.map((row) => row.extname),
    tableCount, relationCount, schemaFingerprint, definitionFingerprint, emptyDataGuards, roles, bootstrapState, grantFingerprint,
    providerBaseline: schemaOnly ? await verifyPreservedProviderExtension(migrationClient) : null,
    dataState: schemaOnly ? await verifySchemaOnlyData(migrationClient) : null,
  };
}

export async function installLiveCleanSchema({
  contract = loadCleanInstallContract(),
  environment = process.env,
  fetchImpl = fetch,
  createClient = (config) => new Client(config),
  sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  worktreeHasChanges = environmentHasUncommittedChanges(),
  schemaOnly = false,
  readMain = readProtectedMain,
} = {}) {
  const { target, migrations } = contract;
  if (migrations.checksum !== EXPECTED_MIGRATION_SET_SHA256) fail('new_core_migration_manifest_mismatch');
  if (!/^[a-f0-9]{40}$/.test(sourceSha)
    || worktreeHasChanges
    || environment.LYTHAUS_NEW_CORE_APPROVED_SOURCE_SHA !== sourceSha) fail('new_core_candidate_source_not_approved');
  const mode = schemaOnly ? NEW_CORE_SQL_ROLE_MODE : 'api-managed';
  const scope = schemaOnly ? assertSchemaInstallationScope(target) : null;
  const creatorSha = schemaOnly ? scope.creatorRoleSha256 : target.provisioningManagementRoleSha256 ?? null;
  const roleMap = liveRoleMap(environment, mode);
  const roleMapSha = crypto.createHash('sha256').update(JSON.stringify(
    Object.fromEntries(ROLE_LABELS.map((label) => [label, roleMap[label]])),
  )).digest('hex');
  if (schemaOnly) {
    const approval = candidateApprovalValue('APPROVE_NEW_CORE_SCHEMA_ONLY', sourceSha,
      migrations.checksum, target.provider.sqlOriginFingerprint, roleMapSha);
    if (environment.LYTHAUS_NEW_CORE_SCHEMA_INSTALL_APPROVAL !== approval) fail('new_core_schema_install_approval_missing');
    const main = await readMain();
    if (main?.protected !== true || main?.commit?.sha !== scope.protectedMainSha) fail('new_core_protected_main_changed');
  }
  const providerEvidence = schemaOnly
    ? await verifyPlanetScaleTarget({ target, roleMap, environment, fetchImpl, schemaOnly: true })
    : await verifyNewCoreProviderTarget({ target, roleMap, environment, fetchImpl });
  if (!schemaOnly) {
    assertCostApproval(target);
    requireLiveApprovals({ sourceSha, manifestSha: migrations.checksum,
      originSha: providerEvidence.originFingerprint, roleMapSha, environment });
  }

  const migrationRaw = environment[LIVE_MIGRATION_URL_ENV] ?? '';
  const verifierRaw = environment[LIVE_VERIFIER_URL_ENV] ?? '';
  assertDistinctRolePasswords(migrationRaw, verifierRaw);
  const migrationConfig = liveSqlConnectionConfig(migrationRaw, 'lythaus_migrations', roleMap, target);
  const verifierConfig = liveSqlConnectionConfig(verifierRaw, 'lythaus_verifier', roleMap, target);
  const migrationClient = createClient(migrationConfig);
  const verifierClient = createClient(verifierConfig);
  let writesStarted = false;
  try {
    try {
      await migrationClient.connect();
    } catch {
      fail('new_core_migration_connection_failed');
    }
    await assertLiveConnection(migrationClient, migrationRaw, 'lythaus_migrations', roleMap, target);
    if (schemaOnly) {
      const lock = await migrationClient.query("SELECT pg_try_advisory_lock(hashtext('lythaus-schema-migrations')) AS acquired");
      if (lock.rows[0]?.acquired !== true) fail('new_core_schema_another_installer_active');
    }
    const cleanTarget = await assertLiveEmptyTarget(migrationClient, roleMap, creatorSha, { mode });
    const schemaBaseline = schemaOnly ? await assertSchemaOnlyBaseline(migrationClient) : null;
    try {
      await verifierClient.connect();
    } catch {
      fail('new_core_verifier_connection_failed');
    }
    await assertLiveConnection(verifierClient, verifierRaw, 'lythaus_verifier', roleMap, target);
    await verifierClient.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    const verifierReadOnly = await verifierClient.query('SHOW transaction_read_only');
    if (verifierReadOnly.rows[0]?.transaction_read_only !== 'on') fail('new_core_verifier_read_only_not_confirmed');
    if (schemaOnly) {
      const verifierLogin = await verifierClient.query("SELECT session_user = current_user AND current_user = 'lythaus_verifier' AS direct_verifier_login");
      if (verifierLogin.rows[0]?.direct_verifier_login !== true) fail('new_core_verifier_direct_login_required');
    }

    writesStarted = true;
    const schema = await applyAndVerifyCleanSchema({ migrationClient, verifierClient, migrations,
      roleMap, creatorSha, mode, schemaOnly });
    return {
      status: schemaOnly ? 'LIVE_NEW_CORE_SCHEMA_INSTALLED_OWNER_ACCEPTANCE_PENDING' : 'LIVE_NEW_CORE_SCHEMA_READY_FOR_OWNER_BOOTSTRAP',
      sourceSha,
      destination: { organization: REQUIRED_ORGANIZATION, databaseId: REQUIRED_DATABASE_ID,
        branchId: REQUIRED_BRANCH_ID, region: REQUIRED_REGION, logicalDatabase: 'postgres' },
      ...schema,
      cleanTarget,
      schemaBaseline,
      providerEvidence,
      cleanup: 'none; partial install stops for review; no rollback/drop/truncate/delete automation',
    };
  } catch (error) {
    if (writesStarted) {
      const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : 'new_core_live_install_failed';
      fail(`new_core_partial_install_stopped_${code}`);
    }
    throw error;
  } finally {
    await verifierClient.end().catch(() => undefined);
    await migrationClient.end().catch(() => undefined);
  }
}

export async function rehearseScopedLocalPostgres17({ migrationUrl, verifierUrl } = {}) {
  const urls = [migrationUrl, verifierUrl].map((raw, index) => {
    let url;
    try { url = new URL(raw); } catch { fail('new_core_scoped_local_url_invalid'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || decodeURIComponent(url.username) !== ['lythaus_migrations', 'lythaus_verifier'][index]
      || !url.password || url.pathname !== '/postgres' || url.hash !== ''
      || url.search !== '?sslmode=disable') fail('new_core_scoped_local_target_not_allowlisted');
    return url;
  });
  if (urls[0].host !== urls[1].host) fail('new_core_scoped_local_target_mismatch');
  assertDistinctRolePasswords(migrationUrl, verifierUrl);
  const migrationClient = new Client({ connectionString: urls[0].toString(), ssl: false });
  const verifierClient = new Client({ connectionString: urls[1].toString(), ssl: false });
  const roleMap = Object.fromEntries(ROLE_LABELS.map((label) => [label, label]));
  try {
    await migrationClient.connect();
    const baseline = await assertLiveEmptyTarget(migrationClient, roleMap, NEW_CORE_SQL_CREATOR_SHA256, { mode: NEW_CORE_SQL_ROLE_MODE });
    await assertSchemaOnlyBaseline(migrationClient);
    await verifierClient.connect();
    await verifierClient.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    const schema = await applyAndVerifyCleanSchema({ migrationClient, verifierClient,
      migrations: loadApprovedMigrations({ root: ROOT, committedOnly: true }), roleMap,
      creatorSha: NEW_CORE_SQL_CREATOR_SHA256, mode: NEW_CORE_SQL_ROLE_MODE, schemaOnly: true });
    return { status: 'LOCAL_PG17_SCOPED_SQL_LOGIN_SCHEMA_PASS', sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      directMigrationLogin: true, directVerifierLogin: true, baseline, ...schema, liveActions: 0 };
  } finally {
    await verifierClient.end().catch(() => undefined);
    await migrationClient.end().catch(() => undefined);
  }
}

function environmentHasUncommittedChanges() {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim().length > 0;
  } catch {
    fail('new_core_candidate_git_status_unavailable');
  }
}

export async function verifyLiveBootstrapState({
  expected,
  contract = loadCleanInstallContract(),
  environment = process.env,
  fetchImpl = fetch,
  createClient = (config) => new Client(config),
  sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
} = {}) {
  if (!['clean', 'accepted'].includes(expected)) fail('new_core_bootstrap_state_expectation_invalid');
  if (!/^[a-f0-9]{40}$/.test(sourceSha)
    || environment.LYTHAUS_NEW_CORE_EXPECTED_SOURCE_SHA !== sourceSha) fail('new_core_bootstrap_verification_source_unpinned');
  const { target, migrations } = contract;
  const schemaOnly = target.schemaInstallation?.roleMode === NEW_CORE_SQL_ROLE_MODE;
  if (schemaOnly) assertSchemaInstallationScope(target);
  const roleMap = liveRoleMap(environment, schemaOnly ? NEW_CORE_SQL_ROLE_MODE : 'api-managed');
  const providerEvidence = await verifyPlanetScaleTarget({ target, roleMap, environment, fetchImpl, schemaOnly });
  const verifierRaw = environment[LIVE_VERIFIER_URL_ENV] ?? '';
  const verifierConfig = liveSqlConnectionConfig(verifierRaw, 'lythaus_verifier', roleMap, target);
  const verifierClient = createClient(verifierConfig);
  try {
    try {
      await verifierClient.connect();
    } catch {
      fail('new_core_verifier_connection_failed');
    }
    await assertLiveConnection(verifierClient, verifierRaw, 'lythaus_verifier', roleMap, target);
    await verifierClient.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    const readOnly = await verifierClient.query('SHOW transaction_read_only');
    if (readOnly.rows[0]?.transaction_read_only !== 'on') fail('new_core_verifier_read_only_not_confirmed');
    const bootstrapState = await readBootstrapStateAsVerifier(verifierClient, { asLogin: true, expected });
    return {
      status: expected === 'clean' ? 'LIVE_BOOTSTRAP_PRECONDITION_VERIFIED' : 'LIVE_BOOTSTRAP_ACCEPTANCE_VERIFIED',
      sourceSha,
      destination: { organization: REQUIRED_ORGANIZATION, databaseId: REQUIRED_DATABASE_ID,
        branchId: REQUIRED_BRANCH_ID, region: REQUIRED_REGION, logicalDatabase: 'postgres' },
      migrationSetSha256: migrations.checksum,
      providerEvidence,
      readOnly: true,
      bootstrapState,
    };
  } catch (error) {
    const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : 'new_core_verifier_query_failed';
    fail(code);
  } finally {
    await verifierClient.end().catch(() => undefined);
  }
}

async function main() {
  const mode = process.argv[2];
  try {
    if (mode === '--plan') {
      console.log(JSON.stringify(buildPreparationPlan(), null, 2));
      return;
    }
    if (mode === '--schema-only-plan') {
      console.log(JSON.stringify(buildSchemaInstallationPlan(), null, 2));
      return;
    }
    if (mode === '--rehearse-local-scoped-pg17') {
      console.log(JSON.stringify(await rehearseScopedLocalPostgres17({
        migrationUrl: process.env.LYTHAUS_NEW_CORE_LOCAL_MIGRATION_URL,
        verifierUrl: process.env.LYTHAUS_NEW_CORE_LOCAL_VERIFIER_URL,
      }), null, 2));
      return;
    }
    if (mode === '--rehearse-local-pg17') {
      console.log(JSON.stringify(await rehearseLocalPostgres17(), null, 2));
      return;
    }
    if (mode === '--apply-live') {
      console.log(JSON.stringify(await installLiveCleanSchema(), null, 2));
      return;
    }
    if (mode === '--apply-live-schema-only') {
      console.log(JSON.stringify(await installLiveCleanSchema({ schemaOnly: true }), null, 2));
      return;
    }
    if (mode === '--verify-live-bootstrap-state') {
      console.log(JSON.stringify(await verifyLiveBootstrapState({ expected: process.argv[3] }), null, 2));
      return;
    }
    if (mode === '--verify-test-access') {
      const { target } = loadCleanInstallContract();
      validateTestAccessEnvironment(target, process.env);
      console.log(JSON.stringify(await verifyNewCoreAccessMetadata({ target }), null, 2));
      return;
    }
    fail('clean_install_mode_not_allowlisted');
  } catch (error) {
    const code = error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : 'clean_install_preparation_failed';
    process.stderr.write(`lythaus new-core clean install stopped: ${code}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
