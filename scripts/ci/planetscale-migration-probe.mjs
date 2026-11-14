import { ownerContext, canonicalRoles, mainConnection, providerRequest, roleInventory, auditMigrationRole,
  readOnly, allTrue, PROBE_PROFILE_SQL, PROBE_KEYS, PUBLIC_PROFILE_SQL, PUBLIC_KEYS,
  ROLES_ENDPOINT, check, hash, object, safeId, safeRole, timestamp, AuditFailure } from './planetscale-migration-role-audit.mjs';
import { quietConsumers, proveOneUseRun, proveAudit } from './planetscale-migration-probe-evidence.mjs';

export const REQUEST_PROFILE = Object.freeze({ ttl: 900, inherited_roles: [], with_replication: false });
export const PROFILE_SHA256 = hash(JSON.stringify(REQUEST_PROFILE));
const keys = ['schemaVersion', 'scope', 'sourceSha', 'profileSha256', 'expectedRunNumber', 'operator', 'reviewer',
  'approvalReference', 'approvedAt', 'windowStart', 'windowEnd', 'name', 'auditRunId', 'auditArtifactId',
  'auditArchiveSha256', 'auditReportSha256', 'authorityEvidence', 'tokenExpiresAt', 'containmentEvidence',
  'costEvidence', 'maximumAllInUsd', 'remainingApprovedUsd', 'existingAuthorityVerified'];
const reference = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9 /:._#@-]{7,199}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const decimal = value => typeof value === 'string' && /^[1-9]\d{0,14}$/.test(value);

export function probeConsent(env, now = Date.now()) {
  ownerContext(env); let record;
  try { record = JSON.parse(env.MIGRATION_PROBE_APPROVAL_JSON); } catch { throw new AuditFailure('probe_separate_approval_required'); }
  check(object(record) && Object.keys(record).sort().join(',') === [...keys].sort().join(','), 'probe_approval_shape_invalid');
  check(record.schemaVersion === 'lythaus-migration-probe-approval-v1' && record.scope === 'one_catalog_only_probe'
    && record.sourceSha === env.RELEASE_SHA && record.profileSha256 === PROFILE_SHA256
    && record.expectedRunNumber === Number(env.GITHUB_RUN_NUMBER) && record.operator === env.GITHUB_ACTOR
    && typeof record.reviewer === 'string' && /^[A-Za-z0-9-]{1,39}$/.test(record.reviewer)
    && record.reviewer !== record.operator && reference(record.approvalReference), 'probe_scope_or_owner_invalid');
  const approved = timestamp(record.approvedAt), start = timestamp(record.windowStart), end = timestamp(record.windowEnd);
  check(Number.isFinite(now) && approved <= start && start <= now && now < end && end - start <= 1800000
    && end - approved <= 86400000 && timestamp(record.tokenExpiresAt) >= end + 300000,
  'probe_window_or_token_invalid');
  check(/^lythaus-migration-probe-\d{8}-\d{2}$/.test(record.name ?? '')
    && decimal(record.auditRunId) && decimal(record.auditArtifactId)
    && digest(record.auditArchiveSha256) && digest(record.auditReportSha256)
    && reference(record.authorityEvidence) && reference(record.containmentEvidence) && reference(record.costEvidence)
    && record.existingAuthorityVerified === true && Number.isFinite(record.maximumAllInUsd)
    && record.maximumAllInUsd > 0 && Number.isFinite(record.remainingApprovedUsd)
    && record.maximumAllInUsd <= record.remainingApprovedUsd, 'probe_evidence_or_cost_invalid');
  return record;
}

export const SESSION_SQL = `SELECT
  current_database()='postgres' AND current_user=session_user AND current_user=$2
    AND current_setting('transaction_read_only')='on' AS observer_identity,
  pg_has_role(current_user,'pg_read_all_stats','USAGE') AS observer_visible,
  EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$1) AS role_present,
  (SELECT count(*)::integer FROM pg_stat_activity WHERE usesysid=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS sessions`;
export const OBSERVER_SQL = `SELECT current_database()='postgres' AND current_user=session_user AND current_user=$1
  AND current_setting('transaction_read_only')='on' AND pg_has_role(current_user,'pg_read_all_stats','USAGE') AS visible`;

export async function observeSessions(env, role, clientFactory) {
  check(safeRole(role), 'session_role_invalid');
  return readOnly(env.PLANETSCALE_ADMIN_DATABASE_URL, clientFactory, async query => {
    const row = (await query(SESSION_SQL, [role, mainConnection(env.PLANETSCALE_ADMIN_DATABASE_URL).role])).rows?.[0];
    check(row?.observer_identity === true && row.observer_visible === true && row.role_present === true && Number.isInteger(row.sessions)
      && row.sessions === 0, 'probe_session_absence_unverified');
    return true;
  }, 'lythaus-migration-probe-observer');
}

function createdCredential(row, consent, now, postedAt, existingRoles) {
  const created = Date.parse(row?.created_at), expires = Date.parse(row?.expires_at);
  check(safeId(row?.id) && safeRole(row.base_username) && !existingRoles.includes(row.base_username)
    && row.username === `${row.base_username}.vqa2g2xc9wsl` && row.name === consent.name
    && row.branch?.id === 'vqa2g2xc9wsl' && row.branch.name === 'main' && row.branch.deleted_at === null
    && row.database_name === 'postgres' && row.ready === true && row.deleted_at === null && row.default === false
    && row.with_replication === false && Array.isArray(row.inherited_roles) && row.inherited_roles.length === 0
    && created >= postedAt - 5000 && created <= now && expires > now
    && expires - created > 0 && expires - created <= 900000 && expires + 180000 <= timestamp(consent.windowEnd)
    && typeof row.password === 'string' && row.password.length >= 16 && row.password.length <= 4096
    && typeof row.access_host_url === 'string' && /^[a-z0-9.-]+\.psdb\.cloud$/.test(row.access_host_url),
  'created_profile_requires_containment');
  const url = new URL(`postgresql://${row.access_host_url}:5432/postgres?sslmode=verify-full`);
  url.username = row.username; url.password = row.password;
  const connectionString = url.toString(); mainConnection(connectionString);
  return { connectionString, role: row.base_username, expires };
}

export async function runProbe({ env, clientFactory, fetchImpl = fetch, now = Date.now,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)), read, download, assertMain,
  checkpoint = () => {}, root = process.cwd() }) {
  const report = { schemaVersion: 'lythaus-migration-probe-receipt-v1', sourceMainSha: env.RELEASE_SHA,
    runId: env.GITHUB_RUN_ID, runAttempt: 1, status: 'BLOCKED_NOT_CREATED', creation: 'NOT_ATTEMPTED',
    createdRoleId: null, createdAt: null, expiresAt: null, profileSha256: PROFILE_SHA256, approvalSha256: null,
    requests: 0, loginAttempts: 0, initialReadOnlyVerified: false,
    initialSessionAbsenceVerified: false, expiryProviderVerified: false, expiryLoginDenied: false,
    finalSessionAbsenceVerified: false, permanentDeletion: 'NOT_AUTHORIZED_NOT_PERFORMED',
    settingsChanged: false, databaseWrites: false, installerQualified: false, loginVerified: false,
    durableCheckpointVerified: true, blocker: null };
  const persist = () => {
    try { checkpoint(report); } catch {
      report.durableCheckpointVerified = false;
      throw new AuditFailure('durable_checkpoint_unavailable');
    }
  };
  let candidate;
  try {
    const consent = probeConsent(env, now());
    report.approvalSha256 = hash(JSON.stringify(consent));
    const roles = canonicalRoles(env.PSCALE_ROLE_IDENTIFIERS);
    mainConnection(env.PLANETSCALE_ADMIN_DATABASE_URL);
    await quietConsumers(env, read); await proveOneUseRun(env, consent, read);
    const audit = await proveAudit(env, consent, { read, download, now: now() });
    check(audit.canonicalMapSha256 === hash(JSON.stringify(roles)), 'audit_canonical_map_changed');
    check(typeof assertMain === 'function', 'current_main_verifier_missing'); await assertMain();
    await readOnly(env.PLANETSCALE_ADMIN_DATABASE_URL, clientFactory, async query => {
      check((await query(OBSERVER_SQL, [mainConnection(env.PLANETSCALE_ADMIN_DATABASE_URL).role])).rows?.[0]?.visible === true,
        'precreate_observer_visibility_unverified');
    }, 'lythaus-migration-probe-observer');
    const before = await roleInventory(env, fetchImpl);
    check(!before.some(row => row.name === consent.name || /^lythaus-migration-probe-/.test(row.name ?? '')),
      'existing_probe_requires_manual_reconciliation');
    await auditMigrationRole({ env, fetchImpl, clientFactory, now: now(), root, underLock: async ({ inventory, catalog, query }) => {
      check(catalog.functionState === audit.functionState, 'reviewed_function_state_changed');
      check(!inventory.some(row => row.name === consent.name || /^lythaus-migration-probe-/.test(row.name ?? '')),
        'existing_probe_requires_manual_reconciliation');
      await quietConsumers(env, read); await assertMain(); probeConsent(env, now());
      check(timestamp(consent.windowEnd) - now() >= 1200000, 'insufficient_probe_containment_window');
      const alive = await query("SELECT current_setting('transaction_read_only')='on' AS alive");
      check(alive.rows?.[0]?.alive === true, 'coordination_session_lost');
      report.creation = 'UNKNOWN'; report.status = 'CREATION_UNCERTAIN_RECONCILE_ONLY'; report.requests = 1;
      persist();
      const postedAt = now();
      const created = await providerRequest(env, fetchImpl, 'POST', ROLES_ENDPOINT, { name: consent.name, ...REQUEST_PROFILE });
      if (safeId(created.id)) report.createdRoleId = created.id;
      for (const [field, input] of [['createdAt', created.created_at], ['expiresAt', created.expires_at]]) {
        if (typeof input === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(input)
          && Number.isFinite(Date.parse(input))) report[field] = input;
      }
      report.creation = 'ACKNOWLEDGED_REQUIRES_VERIFICATION'; persist();
      candidate = createdCredential(created, consent, now(), postedAt, inventory.map(row => row.base_username));
      report.creation = 'ACKNOWLEDGED'; report.status = 'CONTAINMENT_PENDING'; persist();
      const live = await roleInventory(env, fetchImpl);
      const found = live.filter(row => row.id === created.id);
      check(found.length === 1, 'created_readback_requires_containment');
      createdCredential({ ...found[0], password: created.password }, consent, now(), postedAt, inventory.map(row => row.base_username));
      check(found[0].base_username === candidate.role, 'created_readback_requires_containment');
      report.loginAttempts++;
      await readOnly(candidate.connectionString, clientFactory, async query => {
        const profile = (await query(PROBE_PROFILE_SQL, [candidate.role])).rows?.[0];
        check(allTrue(profile, PROBE_KEYS), 'effective_probe_profile_requires_containment');
        check(allTrue((await query(PUBLIC_PROFILE_SQL)).rows?.[0], PUBLIC_KEYS), 'public_profile_changed');
      }, 'lythaus-catalog-only-migration-probe');
      report.initialReadOnlyVerified = true;
    } });
    report.initialSessionAbsenceVerified = await observeSessions(env, candidate.role, clientFactory); persist();
    while (now() < candidate.expires + 5000) {
      check(now() + 60000 < timestamp(consent.windowEnd), 'probe_containment_deadline_reached');
      await wait(Math.min(30000, candidate.expires + 5000 - now()));
    }
    probeConsent(env, now());
    const expired = await providerRequest(env, fetchImpl, 'GET', `${ROLES_ENDPOINT}/${report.createdRoleId}`);
    check(expired.id === report.createdRoleId && expired.base_username === candidate.role
      && expired.username === `${candidate.role}.vqa2g2xc9wsl` && expired.name === consent.name
      && expired.branch?.id === 'vqa2g2xc9wsl' && expired.branch.name === 'main'
      && Date.parse(expired.expires_at) === candidate.expires && Date.parse(expired.expires_at) < now()
      && (expired.ready === false || expired.deleted_at !== null && Number.isFinite(Date.parse(expired.deleted_at))),
    'provider_expiry_state_unverified');
    report.expiryProviderVerified = true; report.loginAttempts++;
    let connected = false, authDenied = false;
    try {
      await readOnly(candidate.connectionString, clientFactory, async () => { connected = true; }, 'lythaus-migration-probe-expiry');
    } catch (error) {
      authDenied = error instanceof AuditFailure && error.message === 'sql_authentication_rejected' && !connected;
      check(authDenied, 'expiry_auth_denial_unverified');
    }
    check(authDenied && !connected, 'expired_credential_still_usable'); report.expiryLoginDenied = true;
    report.finalSessionAbsenceVerified = await observeSessions(env, candidate.role, clientFactory);
    report.status = 'PROBE_EXPIRED_AND_CLOSED_NOT_MIGRATION_READY';
  } catch (error) {
    report.blocker = error instanceof AuditFailure ? error.message : 'probe_operation_unverified';
    if (report.requests) report.status = report.creation === 'UNKNOWN'
      ? 'CREATION_UNCERTAIN_RECONCILE_ONLY' : 'CONTAINMENT_REQUIRED';
  } finally {
    candidate = undefined;
    try { persist(); } catch {
      report.blocker = 'durable_checkpoint_unavailable';
      report.status = report.requests ? report.creation === 'UNKNOWN'
        ? 'CREATION_UNCERTAIN_RECONCILE_ONLY' : 'CONTAINMENT_REQUIRED' : 'BLOCKED_NOT_CREATED';
    }
  }
  return report;
}
