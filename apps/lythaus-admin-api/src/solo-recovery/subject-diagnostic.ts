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

export const SUBJECT_DIAGNOSTIC_SQL = `SELECT membership.role, membership.active,
       account.status AS principal_status, (account.deleted_at IS NOT NULL) AS principal_deleted
  FROM identity.admin_memberships AS membership
  JOIN identity.users AS account ON account.id = membership.user_id
 WHERE membership.access_subject_hmac = decode($1, 'base64')
 LIMIT 2`;

interface Env {
  WORKER_VERSION?: { id?: string; tag?: string };
  DB_ADMIN_FRESH: HyperdriveBinding;
  ACCESS_SUBJECT_HMAC_KEY?: string;
  ACCESS_JWKS_URL?: string;
  ACCESS_AUDIENCES?: string;
  ACCESS_TEAM_DOMAIN?: string;
  EXPECTED_HOSTNAMES?: string;
}

interface DatabaseRow {
  role: unknown;
  active: unknown;
  principal_status: unknown;
  principal_deleted: unknown;
}

interface DatabaseIdentityRow {
  database_name: unknown;
  current_user: unknown;
  session_user: unknown;
  transaction_read_only: unknown;
}

type Runner = <T>(binding: HyperdriveBinding, work: (client: DatabaseClient) => Promise<T>) => Promise<T>;

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

async function hyperdriveTarget(connectionString: string): Promise<ParsedTarget> {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.hash) {
    throw new Error('subject_diagnostic_target_invalid');
  }
  const seen = new Set<string>();
  for (const [name, value] of url.searchParams) {
    if (seen.has(name)) throw new Error('subject_diagnostic_target_invalid');
    seen.add(name);
    if (name === 'sslmode') {
      if (!['verify-full', 'require'].includes(value)) throw new Error('subject_diagnostic_target_invalid');
    } else if (name === 'sslrootcert') {
      if (value !== 'system') throw new Error('subject_diagnostic_target_invalid');
    } else {
      throw new Error('subject_diagnostic_target_invalid');
    }
  }

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
    // The protected native release uploads the exact checked-out main SHA as
    // WorkerVersionMetadata.tag; validate that runtime provenance directly.
    const sourceCommit = version?.tag;
    const allowedHostnames = (env.EXPECTED_HOSTNAMES ?? '').split(',').map(value => value.trim()).filter(Boolean);
    if (!subjectDiagnosticPolicyLive(policy) || request.method !== 'GET' || request.body !== null
      || url.origin !== policy.origin || url.pathname !== SUBJECT_DIAGNOSTIC_PATH || url.search || url.hash
      || (request.headers.has('origin') && request.headers.get('origin') !== policy.origin)
      || request.headers.has('authorization') || !allowedHostnames.includes(url.hostname)
      || !version?.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(version.id)
      || !sourceCommit || !/^[0-9a-f]{40}$/.test(sourceCommit)
      || !env.ACCESS_SUBJECT_HMAC_KEY || policy.accessIssuer !== `https://${env.ACCESS_TEAM_DOMAIN}`) {
      return unavailable();
    }

    const target = await hyperdriveTarget(env.DB_ADMIN_FRESH.connectionString);
    if (target.branchId !== policy.databaseTarget.branchId
      || target.databaseName !== policy.databaseTarget.databaseName
      || target.originFingerprint !== policy.databaseTarget.originFingerprint
      || target.roleFingerprint !== policy.databaseTarget.roleFingerprint) return unavailable();

    const identity = await verifiedHumanAccessIdentity(request, {
      ACCESS_JWKS_URL: env.ACCESS_JWKS_URL,
      ACCESS_AUDIENCES: env.ACCESS_AUDIENCES,
      ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN,
      ACCESS_RECOVERY_AUDIENCE: policy.accessAudience,
    });
    const subjectHmac = hmacLookup(identity.subject, env.ACCESS_SUBJECT_HMAC_KEY);
    const membership = await (deps.run ?? transaction)(env.DB_ADMIN_FRESH, async client => {
      await client.query('SET TRANSACTION READ ONLY');
      const session = await client.query<DatabaseIdentityRow>(`SELECT current_database() AS database_name,
        current_user AS current_user, session_user AS session_user,
        current_setting('transaction_read_only') AS transaction_read_only`);
      if (session.rowCount !== 1) throw new Error('subject_diagnostic_database_identity_invalid');
      const sessionRow = session.rows[0];
      const sessionRoleMatches = sessionRow.current_user === sessionRow.session_user
        && (sessionRow.current_user === target.role || sessionRow.current_user === target.username);
      if (sessionRow.database_name !== policy.databaseTarget.databaseName
        || sessionRow.transaction_read_only !== 'on' || !sessionRoleMatches) {
        throw new Error('subject_diagnostic_database_identity_invalid');
      }
      const rows = await client.query<DatabaseRow>(SUBJECT_DIAGNOSTIC_SQL, [subjectHmac]);
      if (rows.rows.length > 1 || rows.rowCount !== rows.rows.length) throw new Error('subject_diagnostic_membership_ambiguous');
      const row = rows.rows[0];
      if (row && (typeof row.role !== 'string' || typeof row.active !== 'boolean'
        || typeof row.principal_status !== 'string' || typeof row.principal_deleted !== 'boolean')) {
        throw new Error('subject_diagnostic_membership_invalid');
      }
      return row ?? null;
    });

    return resultResponse({
      status: 'verified',
      workerVersionId: version.id,
      sourceCommit,
      databaseTargetMatchesPinnedMain: true,
      databaseTransactionReadOnly: true,
      subjectBindingMatches: membership !== null,
      activeMembershipMatches: membership?.active === true,
      membershipRole: membership?.role ?? null,
      principalStatus: membership?.principal_status ?? null,
      principalDeleted: membership?.principal_deleted ?? null,
    });
  } catch {
    return unavailable();
  }
}

export { SUBJECT_DIAGNOSTIC_PATH } from './diagnostic-policy.ts';
