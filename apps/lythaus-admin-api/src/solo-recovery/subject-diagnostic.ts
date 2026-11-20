import { transaction, type DatabaseClient, type HyperdriveBinding } from '@lythaus/db';
import { hmacLookup } from '@lythaus/security';
import { verifiedHumanAccessIdentity } from './human-access.ts';
import {
  COMPILED_SUBJECT_DIAGNOSTIC_POLICY,
  SUBJECT_DIAGNOSTIC_PATH,
  subjectDiagnosticPolicyLive,
  validateSubjectDiagnosticPolicy,
  type SubjectDiagnosticPolicy,
} from './diagnostic-policy.ts';

export const SUBJECT_DIAGNOSTIC_SQL = `SELECT membership.role, membership.active, membership.revoked_at IS NOT NULL AS revoked,
       encode(pg_catalog.sha256(membership.access_subject_hmac), 'hex') AS binding_checksum,
       account.status AS principal_status, (account.deleted_at IS NOT NULL) AS principal_deleted,
       EXISTS (SELECT 1 FROM system.audit_events AS event WHERE event.action = 'identity.first_admin_bootstrapped'
               AND event.actor_id = membership.user_id AND event.target_type = 'admin_membership'
               AND event.target_id = membership.user_id) AS bootstrap_principal
  FROM identity.admin_memberships AS membership
  JOIN identity.users AS account ON account.id = membership.user_id
 LIMIT 2`;

export const SUBJECT_DIAGNOSTIC_SESSION_SQL = `SELECT current_database() AS database_name,
       current_user AS current_user, session_user AS session_user,
       current_setting('transaction_read_only') AS transaction_read_only,
       NOT pg_catalog.pg_is_in_recovery() AND $1 = ANY(pg_catalog.regexp_split_to_array(
         current_setting('cluster_name'), '[^a-z0-9]+')) AS branch_primary`;

interface Env {
  WORKER_VERSION?: { id?: string; tag?: string };
  DB_ADMIN_FRESH: HyperdriveBinding;
  ACCESS_SUBJECT_HMAC_KEY?: string;
  ADMIN_SUBJECT_DIAGNOSTIC_HUMAN_PIN?: string;
  ACCESS_JWKS_URL?: string;
  ACCESS_AUDIENCES?: string;
  ACCESS_TEAM_DOMAIN?: string;
  EXPECTED_HOSTNAMES?: string;
}

interface DatabaseRow {
  role: unknown;
  active: unknown;
  revoked: unknown;
  binding_checksum: unknown;
  bootstrap_principal: unknown;
  principal_status: unknown;
  principal_deleted: unknown;
}

export interface AdminRecoverySessionRow {
  database_name: unknown;
  current_user: unknown;
  session_user: unknown;
  transaction_read_only: unknown;
  branch_primary: unknown;
}

type Runner = <T>(binding: HyperdriveBinding, work: (client: DatabaseClient) => Promise<T>) => Promise<T>;

export function isPlatformHyperdriveUrl(url: URL): boolean {
  return (url.hostname === 'hyperdrive.local' || url.hostname.endsWith('.hyperdrive.local'))
    && ['postgres:', 'postgresql:'].includes(url.protocol) && !url.hash && Boolean(url.username)
    && decodeURIComponent(url.pathname) === '/postgres' && (!url.port || url.port === '5432')
    && url.searchParams.size === 1 && url.searchParams.get('sslmode') === 'disable';
}

async function sha256Hex(input: Uint8Array): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

interface Dependencies {
  policy?: SubjectDiagnosticPolicy | null;
  run?: Runner;
}

interface ParsedTarget {
  role: string;
  username: string;
  branchId: string;
  databaseName: string;
  originFingerprint: string;
  roleFingerprint: string;
}

export async function hyperdriveTarget(connectionString: string): Promise<ParsedTarget> {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.hash) {
    throw new Error('subject_diagnostic_target_invalid');
  }
  const seen = new Set<string>();
  url.searchParams.forEach((value, name) => {
    if (seen.has(name)) throw new Error('subject_diagnostic_target_invalid');
    seen.add(name);
    if (name === 'sslmode') {
      if (!['verify-full', 'require'].includes(value)) throw new Error('subject_diagnostic_target_invalid');
    } else if (name === 'sslrootcert') {
      if (value !== 'system') throw new Error('subject_diagnostic_target_invalid');
    } else {
      throw new Error('subject_diagnostic_target_invalid');
    }
  });

  const username = decodeURIComponent(url.username);
  const separator = username.lastIndexOf('.');
  if (separator <= 0 || separator === username.length - 1) throw new Error('subject_diagnostic_target_invalid');
  const branchId = username.slice(separator + 1);
  const role = username.slice(0, separator);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!/^[a-z0-9]+$/.test(branchId) || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(role)
    || !databaseName || databaseName.includes('/')) throw new Error('subject_diagnostic_target_invalid');

  const origin = {
    scheme: 'postgres',
    host: url.hostname.toLowerCase(),
    port: Number(url.port || 5432),
    database: databaseName,
  };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(origin)));
  const originFingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const roleDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lythaus-admin-diagnostic-role:v1:${role}`));
  const roleFingerprint = Array.from(new Uint8Array(roleDigest), byte => byte.toString(16).padStart(2, '0')).join('');
  return { role, username, branchId, databaseName, originFingerprint, roleFingerprint };
}

function unavailable(): Response {
  return new Response(JSON.stringify({ error: 'subject_diagnostic_unavailable' }), {
    status: 404,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'vary': 'Cf-Access-Jwt-Assertion',
    },
  });
}

function resultResponse(value: Record<string, unknown>): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'vary': 'Cf-Access-Jwt-Assertion',
    },
  });
}

export async function handleSubjectDiagnostic(request: Request, env: Env, deps: Dependencies = {}): Promise<Response> {
  try {
    const compiled = deps.policy === undefined ? COMPILED_SUBJECT_DIAGNOSTIC_POLICY : deps.policy;
    if (compiled === null) return unavailable();
    const policy = validateSubjectDiagnosticPolicy(compiled);
    const url = new URL(request.url);
    const version = env.WORKER_VERSION;
    const sourceCommit = version?.tag;
    const allowedHostnames = (env.EXPECTED_HOSTNAMES ?? '').split(',').map(value => value.trim()).filter(Boolean);
    if (!subjectDiagnosticPolicyLive(policy) || request.method !== 'GET' || request.body !== null
      || url.origin !== policy.origin || url.pathname !== SUBJECT_DIAGNOSTIC_PATH || url.search || url.hash
      || (request.headers.has('origin') && request.headers.get('origin') !== policy.origin)
      || request.headers.has('authorization') || !allowedHostnames.includes(url.hostname)
      || !version?.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(version.id)
      || sourceCommit !== policy.sourceSha || !/^[a-f0-9]{64}$/.test(env.ADMIN_SUBJECT_DIAGNOSTIC_HUMAN_PIN ?? '')
      || !env.ACCESS_SUBJECT_HMAC_KEY || policy.accessIssuer !== `https://${env.ACCESS_TEAM_DOMAIN}`) {
      return unavailable();
    }

    const identity = await verifiedHumanAccessIdentity(request, {
      ACCESS_JWKS_URL: env.ACCESS_JWKS_URL,
      ACCESS_AUDIENCES: env.ACCESS_AUDIENCES,
      ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN,
      ACCESS_RECOVERY_AUDIENCE: policy.accessAudience,
      freshSince: policy.notBefore,
    });
    const humanPin = await sha256Hex(new TextEncoder().encode(
      `lythaus:diagnostic-human:v1:${sourceCommit}:${identity.email.toLowerCase()}`,
    ));
    if (humanPin !== env.ADMIN_SUBJECT_DIAGNOSTIC_HUMAN_PIN) return unavailable();

    const connection = env.DB_ADMIN_FRESH.connectionString;
    if (!isPlatformHyperdriveUrl(new URL(connection))) {
      const target = await hyperdriveTarget(connection);
      if (target.branchId !== policy.databaseTarget.branchId || target.databaseName !== policy.databaseTarget.databaseName
        || target.originFingerprint !== policy.databaseTarget.originFingerprint
        || target.roleFingerprint !== policy.databaseTarget.roleFingerprint) return unavailable();
    }
    const checksum = await sha256Hex(Uint8Array.from(atob(hmacLookup(identity.subject, env.ACCESS_SUBJECT_HMAC_KEY)),
      char => char.charCodeAt(0)));
    const membership = await (deps.run ?? transaction)(env.DB_ADMIN_FRESH, async client => {
      await client.query('SET TRANSACTION READ ONLY');
      const session = await client.query<AdminRecoverySessionRow>(SUBJECT_DIAGNOSTIC_SESSION_SQL, [policy.databaseTarget.branchId]);
      if (session.rowCount !== 1) throw new Error('subject_diagnostic_database_identity_invalid');
      const sessionRow = session.rows[0];
      const username = sessionRow.current_user;
      if (sessionRow.database_name !== policy.databaseTarget.databaseName || sessionRow.branch_primary !== true
        || sessionRow.transaction_read_only !== 'on' || typeof username !== 'string' || username !== sessionRow.session_user) {
        throw new Error('subject_diagnostic_database_identity_invalid');
      }
      const suffix = '.' + policy.databaseTarget.branchId;
      const role = username.endsWith(suffix) ? username.slice(0, -suffix.length) : username;
      if (await sha256Hex(new TextEncoder().encode('lythaus-admin-diagnostic-role:v1:' + role)) !== policy.databaseTarget.roleFingerprint) {
        throw new Error('subject_diagnostic_database_identity_invalid');
      }
      const rows = await client.query<DatabaseRow>(SUBJECT_DIAGNOSTIC_SQL);
      if (rows.rows.length > 1 || rows.rowCount !== rows.rows.length) throw new Error('subject_diagnostic_membership_ambiguous');
      const row = rows.rows[0];
      if (row && (typeof row.role !== 'string' || typeof row.active !== 'boolean' || typeof row.revoked !== 'boolean'
        || typeof row.binding_checksum !== 'string' || !/^[a-f0-9]{64}$/.test(row.binding_checksum)
        || typeof row.bootstrap_principal !== 'boolean' || typeof row.principal_status !== 'string' || typeof row.principal_deleted !== 'boolean')) {
        throw new Error('subject_diagnostic_membership_invalid');
      }
      return row ?? null;
    });

    if (!subjectDiagnosticPolicyLive(policy) || identity.expiresAt <= Date.now()) return unavailable();
    const matched = membership !== null && membership.binding_checksum === checksum;
    return resultResponse({
      status: 'verified',
      correlationId: crypto.randomUUID(),
      workerVersionId: version.id,
      sourceCommit,
      databaseTargetMatchesPinnedMain: true,
      databaseTransactionReadOnly: true,
      intendedHumanVerified: true,
      membershipCount: membership === null ? 0 : 1,
      subjectBindingMatchCount: matched ? 1 : 0,
      subjectBindingMatches: matched,
      activeMembershipMatches: matched && membership?.active === true && membership.revoked === false,
      originalBootstrapPrincipal: membership?.bootstrap_principal ?? false,
      membershipIsAdministrator: membership?.role === 'administrator',
      membershipActive: membership?.active ?? null,
      membershipRevoked: membership?.revoked ?? null,
      principalLocked: membership?.principal_status === 'locked',
      principalDeleted: membership?.principal_deleted ?? null,
    });
  } catch {
    return unavailable();
  }
}

export { SUBJECT_DIAGNOSTIC_PATH } from './diagnostic-policy.ts';
