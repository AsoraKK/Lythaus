import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { planetScaleServiceTokenAuthorizationHeader } from '../planetscale/service-token-auth.mjs';
import { RESTORE, isSourceDatabaseGrant } from './planetscale-native-restore-contract.mjs';
import { ownerContext, AuditFailure, check, object, safeId } from './planetscale-migration-role-audit.mjs';
import { requireRebindPacketMain, rebindPacketGithubRead } from './admin-subject-rebind-install-packet.mjs';
import { quietConsumers } from './planetscale-migration-probe-evidence.mjs';

export const SERVICE_AUDIT_SCHEMA = 'lythaus-admin-rebind-service-token-audit-v1';
export const SERVICE_AUDIT_JOB = 'Audit existing rebind service-token capability without issuing credentials';
export const TOKEN_SOURCES = Object.freeze(['migration_service_pair', 'existing_api_token']);
export const QUALIFICATION_PROFILE = Object.freeze({ ttl: 3600, inherited_roles: Object.freeze(['postgres']), with_replication: false });
export const digest = value => createHash('sha256').update(value).digest('hex');
export const QUALIFICATION_PROFILE_SHA256 = digest(JSON.stringify(QUALIFICATION_PROFILE));
export const DATABASE_BASE = 'https://api.planetscale.com/v1/organizations/lythaus/databases/lythaus-core';
const ORGANIZATION_BASE = 'https://api.planetscale.com/v1/organizations/lythaus';
export const REQUIRED_ROLE_PERMISSIONS = Object.freeze(['read_database', 'read_branch',
  'create_production_branch_password', 'delete_production_branch_password']);
const operationClasses = Object.freeze(['database_metadata_read', 'main_branch_metadata_read',
  'service_token_metadata_read', 'service_token_grants_read', 'role_metadata_read']);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const completedCheckNames = Object.freeze(['databaseVerified', 'productionBranchVerified', 'selfMetadataVerified',
  'tokenExpiryKnown', 'grantPaginationComplete']);

// These names control reporting only. Qualification and cleanup still check their dedicated token independently.
const restoreActions = new Set(['read_database', 'read_branch', 'read_backups', 'create_branch', 'delete_branch',
  'delete_production_branch', 'connect_branch', 'connect_production_branch', 'delete_production_branch_password',
  'restore_production_branch_backup', 'restore_production_branch_backups']);
const organizationTokenActions = new Set(['read_service_tokens', 'write_service_tokens', 'delete_service_tokens']);

function sharedTokenSelfRecord(token, lifetimeCoversWindow) {
  const report = { lifetimeCoversWindow, oldCoreActionsObserved: null, organizationActionsObserved: null,
    otherOrUnclassifiedAccessObserved: null };
  const rows = token.service_token_accesses;
  if (!Array.isArray(rows) || !rows.every(row => object(row) && typeof row.resource_type === 'string' && typeof row.access === 'string')) return report;
  const database = new Set(), organization = new Set();
  let other = false;
  for (const row of rows) {
    if (isSourceDatabaseGrant(row) && restoreActions.has(row.access)) database.add(row.access);
    else if (row.resource_type.toLowerCase() === 'organization' && row.resource_id === 'im68in7j2miy'
      && row.resource?.id === row.resource_id && row.resource.name === RESTORE.organization
      && (row.resource.deleted_at === null || !Object.hasOwn(row.resource, 'deleted_at'))
      && organizationTokenActions.has(row.access)) organization.add(row.access);
    else other = true;
  }
  return { ...report, oldCoreActionsObserved: [...database].sort(), organizationActionsObserved: [...organization].sort(),
    otherOrUnclassifiedAccessObserved: other };
}

export function utcMicros(value) {
  const match = typeof value === 'string' ? /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?Z$/.exec(value) : null;
  if (!match) return null;
  const milliseconds = Date.parse(`${match[1]}Z`);
  if (!Number.isSafeInteger(milliseconds) || new Date(milliseconds).toISOString().slice(0, 19) !== match[1]) return null;
  return BigInt(milliseconds) * 1000n + BigInt((match[2] ?? '').padEnd(6, '0'));
}

export function serviceSource(env, source) {
  check(TOKEN_SOURCES.includes(source), 'service_token_source_invalid');
  const idPresent = typeof env.PLANETSCALE_SERVICE_TOKEN_ID === 'string' && env.PLANETSCALE_SERVICE_TOKEN_ID.length > 0;
  const tokenPresent = typeof env.PLANETSCALE_SERVICE_TOKEN === 'string' && env.PLANETSCALE_SERVICE_TOKEN.length > 0;
  const present = source === 'migration_service_pair' ? idPresent || tokenPresent
    : typeof env.PLANETSCALE_API_TOKEN === 'string' && env.PLANETSCALE_API_TOKEN.length > 0;
  if (!present) return { source, status: 'MISSING', configured: false };
  if (source === 'migration_service_pair' && (!idPresent || !tokenPresent)) return { source, status: 'INCOMPLETE_PAIR', configured: false };
  let authorization;
  try {
    authorization = planetScaleServiceTokenAuthorizationHeader(source === 'migration_service_pair'
      ? `${env.PLANETSCALE_SERVICE_TOKEN_ID}:${env.PLANETSCALE_SERVICE_TOKEN}` : env.PLANETSCALE_API_TOKEN);
  } catch { return { source, status: 'MALFORMED', configured: false }; }
  const id = authorization.split(':')[0];
  if (!safeId(id)) return { source, status: 'MALFORMED', configured: false };
  return { source, status: 'CONFIGURED_NOT_VERIFIED', configured: true, id, authorization };
}

// Only this transport touches service-token material. Public reports never
// contain its private fields, provider bodies or arbitrary error strings.
export class RebindServiceReader {
  #authorization;
  #tokenId;
  constructor(env, source, fetchImpl = fetch) {
    const selected = serviceSource(env, source);
    check(selected.configured, 'existing_service_token_source_unavailable');
    this.source = source;
    this.#authorization = selected.authorization;
    this.#tokenId = selected.id;
    this.tokenFingerprint = digest(`lythaus-rebind-service-token:v1:${selected.id}`);
    this.fetchImpl = fetchImpl;
  }
  get tokenUrl() { return `${ORGANIZATION_BASE}/service-tokens/${this.#tokenId}`; }
  get tokenId() { return this.#tokenId; }
  async get(path) {
    const allowed = ['', '/branches/main', '/token'].includes(path)
      || /^\/branches\/main\/roles(?:\?page=[1-5]&per_page=100|\/[a-z0-9]{1,64})$/.test(path)
      || /^\/token\/grants\?page=[1-5]&per_page=100$/.test(path);
    check(allowed, 'service_audit_get_path_forbidden');
    const url = path.startsWith('/token') ? this.tokenUrl + path.slice(6) : DATABASE_BASE + path;
    try { return await this.#read(url); }
    catch (error) {
      if (error instanceof AuditFailure) {
        error.operationClass = path === '' ? 'database_metadata_read' : path === '/branches/main' ? 'main_branch_metadata_read'
          : path === '/token' ? 'service_token_metadata_read' : path.startsWith('/token/grants?') ? 'service_token_grants_read' : 'role_metadata_read';
        const page = /^\/token\/grants\?page=([1-5])&per_page=100$/.exec(path);
        if (page) error.requestPage = Number(page[1]);
      }
      throw error;
    }
  }
  async #read(url) {
    let response;
    try {
      response = await this.fetchImpl(url, { method: 'GET', redirect: 'error', cache: 'no-store',
        headers: { authorization: this.#authorization, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    } catch { throw new AuditFailure('service_audit_transport_failed'); }
    check(response && !response.redirected && (!response.url || response.url === url), 'service_audit_redirect_unverified');
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => {});
      const error = new AuditFailure([401, 403].includes(response.status) ? 'service_audit_access_denied' : 'service_audit_request_failed');
      if (Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) error.httpStatus = response.status;
      const requestIds = ['x-request-id', 'x-planetscale-request-id', 'x-pscale-request-id']
        .map(name => response.headers?.get?.(name)).filter(value => value !== null && value !== undefined);
      error.requestId = requestIds.length > 0 && requestIds.every(value => value === requestIds[0]) && uuid(requestIds[0])
        ? requestIds[0] : null;
      throw error;
    }
    try {
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.byteLength; check(size <= 1048576, 'service_audit_response_too_large'); chunks.push(chunk); }
      const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      check(object(result), 'service_audit_response_shape_invalid');
      return result;
    } catch (error) {
      if (error instanceof AuditFailure) throw error;
      throw new AuditFailure('service_audit_response_shape_invalid');
    }
  }
}

export async function serviceGrantInventory(reader) {
  const rows = [], ids = new Set(); let total;
  for (let page = 1; page <= 5; page++) {
    const body = await reader.get(`/token/grants?page=${page}&per_page=100`);
    check(body.type === 'list' && body.current_page === page && Array.isArray(body.data) && body.data.length <= 100
      && Object.hasOwn(body, 'next_page'), 'service_grants_pagination_unverified');
    if (Object.hasOwn(body, 'total_count')) {
      check(Number.isSafeInteger(body.total_count) && body.total_count >= 0 && body.total_count <= 500
        && (total === undefined || total === body.total_count), 'service_grants_pagination_unverified');
      total = body.total_count;
    }
    for (const row of body.data) {
      check(object(row) && safeId(row.id) && !ids.has(row.id) && typeof row.resource_type === 'string'
        && typeof row.resource_id === 'string' && typeof row.resource_name === 'string'
        && Array.isArray(row.accesses) && row.accesses.length <= 100
        && row.accesses.every(access => object(access) && typeof access.access === 'string' && access.access.length <= 128),
      'service_grant_shape_unverified');
      ids.add(row.id); rows.push(row);
    }
    if (body.next_page === null) {
      check(total === undefined || rows.length === total, 'service_grants_pagination_unverified');
      return { rows, pages: page };
    }
    check(body.next_page === page + 1 && body.data.length > 0 && page < 5, 'service_grants_pagination_unverified');
  }
  throw new AuditFailure('service_grants_pagination_unverified');
}

export async function inspectServiceAuthority(reader, { now = Date.now(), requiredThrough = now + 2 * 3600000 + 300000,
  onCheckpoint = () => {}, onSharedSelfRecord = () => {} } = {}) {
  check(Number.isSafeInteger(now) && Number.isSafeInteger(requiredThrough) && requiredThrough >= now, 'service_audit_window_invalid');
  const database = await reader.get('');
  check(database.id === RESTORE.databaseId && database.name === 'lythaus-core' && database.kind === 'postgresql', 'service_audit_database_mismatch');
  onCheckpoint('databaseVerified');
  const branch = await reader.get('/branches/main');
  check(branch.id === RESTORE.sourceId && branch.name === 'main' && branch.kind === 'postgresql'
    && branch.deleted_at === null && branch.production === true, 'service_audit_branch_mismatch');
  onCheckpoint('productionBranchVerified');
  const token = await reader.get('/token');
  check(token.id === reader.tokenId && (!Object.hasOwn(token, 'deleted_at') || token.deleted_at === null), 'service_audit_token_identity_unverified');
  onCheckpoint('selfMetadataVerified');
  const expiry = utcMicros(token.expires_at);
  check(Object.hasOwn(token, 'expires_at') && (token.expires_at === null || expiry !== null), 'service_audit_token_expiry_unverified');
  onCheckpoint('tokenExpiryKnown');
  const lifetimeCoversWindow = token.expires_at === null || expiry > BigInt(requiredThrough) * 1000n;
  if (reader.source === 'existing_api_token') onSharedSelfRecord(sharedTokenSelfRecord(token, lifetimeCoversWindow));
  const grants = await serviceGrantInventory(reader);
  onCheckpoint('grantPaginationComplete');
  const target = grants.rows.filter(row => row.resource_type.toLowerCase() === 'database'
    && row.resource_id === RESTORE.databaseId && row.resource_name === 'lythaus-core');
  const accesses = new Set(target.flatMap(row => row.accesses.map(access => access.access)));
  const permissions = Object.fromEntries(REQUIRED_ROLE_PERMISSIONS.map(permission => [permission, accesses.has(permission)]));
  const missingPermissions = REQUIRED_ROLE_PERMISSIONS.filter(permission => !permissions[permission]);
  return { source: reader.source, configured: true, tokenFingerprint: reader.tokenFingerprint,
    status: lifetimeCoversWindow && missingPermissions.length === 0 ? 'DECLARED_AUTHORITY_VERIFIED_NOT_ISSUANCE_PROOF' : 'BLOCKED',
    databaseVerified: true, productionBranchVerified: true, selfMetadataVerified: true,
    grantPaginationComplete: true, grantPages: grants.pages, grantRows: grants.rows.length,
    tokenExpiresAt: token.expires_at, requiredThrough: new Date(requiredThrough).toISOString(), lifetimeCoversWindow,
    permissions, missingPermissions,
    otherResourceGrantCount: grants.rows.length - target.length,
    unknownPermissionCount: [...accesses].filter(access => !REQUIRED_ROLE_PERMISSIONS.includes(access)).length,
    issuanceObserved: false, sqlProfileVerified: false, credentialCreated: false };
}

export async function auditRebindServiceTokens({ env = process.env, fetchImpl = fetch, read, now = Date.now(),
  root = process.cwd(), assertCheckout = () => {
    const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).trim();
    check(git(['rev-parse', 'HEAD']) === env.RELEASE_SHA, 'checkout_changed');
    git(['diff', '--exit-code']); git(['diff', '--cached', '--exit-code']);
    check(git(['ls-files', '--others', '--exclude-standard']) === '', 'checkout_untracked_files');
  }, assertMain = () => requireRebindPacketMain(env, read),
  quiet = () => quietConsumers(env, read) } = {}) {
  ownerContext(env);
  check(env.INSPECTION === 'rebind-service-token-audit' && !env.MIGRATION_PROBE_APPROVAL_JSON
    && !env.ADMIN_REBIND_EPHEMERAL_APPROVAL_JSON && (env.ADMIN_REBIND_CONNECTION ?? 'existing') === 'existing',
  'service_audit_read_only_context_required');
  read ??= suffix => rebindPacketGithubRead(env, suffix);
  await assertCheckout(); await assertMain(); await quiet();
  const report = { schemaVersion: SERVICE_AUDIT_SCHEMA, sourceMainSha: env.RELEASE_SHA,
    runId: env.GITHUB_RUN_ID, runAttempt: 1, generatedAt: new Date(now).toISOString(),
    status: 'BLOCKED_NO_QUALIFIED_EXISTING_SOURCE', sources: [], recommendedSource: null,
    profileSha256: QUALIFICATION_PROFILE_SHA256, providerMutations: false, credentialsCreated: false,
    databaseWrites: false, settingsChanged: false, installationAuthorized: false, ownerLoginVerified: false };
  for (const source of TOKEN_SOURCES) {
    const configured = serviceSource(env, source);
    if (!configured.configured) { report.sources.push({ source, configured: false, status: configured.status }); continue; }
    const reader = new RebindServiceReader(env, source, fetchImpl);
    const completedChecks = Object.fromEntries(completedCheckNames.map(name => [name, false]));
    let sharedSelfRecord;
    try { report.sources.push(await inspectServiceAuthority(reader, { now,
      onSharedSelfRecord: value => { sharedSelfRecord = value; },
      onCheckpoint: name => { check(completedCheckNames.includes(name), 'service_audit_checkpoint_invalid'); completedChecks[name] = true; } })); }
    catch (error) {
      report.sources.push({ source, configured: true, status: 'BLOCKED_AUTHORITY_UNVERIFIED', tokenFingerprint: reader.tokenFingerprint,
        blocker: error instanceof AuditFailure ? error.message : 'service_audit_unverified',
        httpStatus: Number.isInteger(error?.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599 ? error.httpStatus : null,
        operationClass: operationClasses.includes(error?.operationClass) ? error.operationClass : null,
        requestPage: error?.operationClass === 'service_token_grants_read' && Number.isInteger(error.requestPage)
          && error.requestPage >= 1 && error.requestPage <= 5 ? error.requestPage : null,
        requestId: uuid(error?.requestId) ? error.requestId : null, completedChecks });
    }
    if (sharedSelfRecord) report.sources.at(-1).sharedSelfRecord = sharedSelfRecord;
  }
  report.recommendedSource = TOKEN_SOURCES.find(source => report.sources.some(row => row.source === source
    && row.status === 'DECLARED_AUTHORITY_VERIFIED_NOT_ISSUANCE_PROOF')) ?? null;
  if (report.recommendedSource) report.status = 'REVIEWED_SOURCE_AVAILABLE_NOT_CREDENTIAL_APPROVAL';
  await assertMain();
  return report;
}

export function serviceAuditFailure(error, { env = process.env, now = Date.now() } = {}) {
  return { schemaVersion: SERVICE_AUDIT_SCHEMA, status: 'BLOCKED',
    blocker: error instanceof AuditFailure && /^[a-z][a-z_]+$/.test(error.message) ? error.message : 'service_audit_unverified',
    sourceMainSha: /^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? '') ? env.RELEASE_SHA : null,
    runId: /^[1-9][0-9]{0,14}$/.test(env.GITHUB_RUN_ID ?? '') ? env.GITHUB_RUN_ID : null,
    runAttempt: 1, generatedAt: new Date(now).toISOString(), providerMutations: false, credentialsCreated: false,
    databaseWrites: false, settingsChanged: false, installationAuthorized: false, ownerLoginVerified: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let report;
  try { check(process.argv.length === 2, 'service_audit_arguments_invalid'); report = await auditRebindServiceTokens(); }
  catch (error) { report = serviceAuditFailure(error); }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (report.status !== 'REVIEWED_SOURCE_AVAILABLE_NOT_CREDENTIAL_APPROVAL') process.exitCode = 1;
}
