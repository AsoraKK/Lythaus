import { Client, type ClientConfig } from 'pg';
import { verifyFullConnectionString, type HyperdriveBinding } from '@lythaus/db';
import { beginDedicatedClientRetirement, closeDedicatedClient, DatabaseClientCloseDeadlineError,
  type DedicatedClientCleanupTarget } from '../../../packages/db/src/autocommit.ts';
import { JOBS_SESSION_PATH, JOBS_SESSION_TIMEOUT_MS, JOBS_SESSION_CLEANUP_MS,
  jobsSessionResponse, observedJobsSession, safeWorkerVersion, jobsVersionOverride,
  unavailableJobsSession, type JobsSessionReceipt, type JobsSessionDiagnosticCode,
} from '../../../packages/contracts/src/jobs-reputation-session.ts';

export const JOBS_SESSION_CATALOG_QUERIES = [
  `SELECT session_user AS "sessionRole", current_user AS "currentRole",
    pg_catalog.current_database() AS database,
    pg_catalog.current_setting('transaction_isolation') AS isolation,
    pg_catalog.current_setting('default_transaction_isolation') AS "defaultIsolation",
    pg_catalog.current_setting('search_path') AS "searchPath",
    pg_catalog.current_setting('transaction_read_only') AS "readOnlyMode"`,
  `SELECT r.rolsuper AS superuser, r.rolcanlogin AS "canLogin", r.rolbypassrls AS "bypassRls",
    r.rolcreaterole AS "createRole", r.rolcreatedb AS "createDb", r.rolinherit AS inherit,
    (SELECT pg_catalog.count(*)::pg_catalog.int4 FROM pg_catalog.pg_auth_members m
      WHERE m.member OPERATOR(pg_catalog.=) r.oid) AS memberships
    FROM pg_catalog.pg_roles r WHERE r.rolname OPERATOR(pg_catalog.=) current_user`,
  `SELECT pg_catalog.has_schema_privilege(current_user,'trust','USAGE') AS "trustUsage",
    pg_catalog.has_schema_privilege(current_user,'public','CREATE') AS "publicCreate",
    pg_catalog.has_schema_privilege(current_user,'identity','CREATE') AS "identityCreate",
    pg_catalog.has_schema_privilege(current_user,'trust','CREATE') AS "trustCreate",
    pg_catalog.has_any_column_privilege(current_user,'identity.users','UPDATE') AS "usersUpdate",
    pg_catalog.has_column_privilege(current_user,'identity.users','id','SELECT') AS "usersIdSelect",
    pg_catalog.has_column_privilege(current_user,'identity.users','status','SELECT') AS "usersStatusSelect"`,
  `SELECT r.relrowsecurity AS "usersRls", r.relforcerowsecurity AS "usersForceRls"
    FROM pg_catalog.pg_class r WHERE r.oid OPERATOR(pg_catalog.=) 'identity.users'::pg_catalog.regclass`,
] as const;

interface DiagnosticClient extends DedicatedClientCleanupTarget {
  connect(): Promise<unknown>;
  query(sql: string): Promise<{ rows: Record<string, unknown>[]; command: string }>;
}
interface DiagnosticDependencies {
  createClient?: (config: ClientConfig) => DiagnosticClient;
  timeoutMs?: number;
  cleanupMs?: number;
  now?: () => number;
}
class DiagnosticTimeout extends Error {}
async function bounded<T>(work: () => Promise<T>, milliseconds: number): Promise<T> {
  if (milliseconds <= 0) throw new DiagnosticTimeout();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DiagnosticTimeout()), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export async function inspectJobsReputationSession(
  binding: HyperdriveBinding, dependencies: DiagnosticDependencies = {},
): Promise<JobsSessionReceipt> {
  const timeoutMs = dependencies.timeoutMs ?? JOBS_SESSION_TIMEOUT_MS;
  const cleanupMs = dependencies.cleanupMs ?? JOBS_SESSION_CLEANUP_MS;
  const now = dependencies.now ?? (() => performance.now());
  const deadline = now() + timeoutMs;
  let client: DiagnosticClient | undefined;
  let rollbackRequired = false, connectionFailed = false;
  let retirement: ReturnType<typeof beginDedicatedClientRetirement> | undefined;
  let receipt: JobsSessionReceipt = unavailableJobsSession('connection_unavailable');
  const onError = () => { connectionFailed = true; };
  let failure: JobsSessionDiagnosticCode = 'connection_unavailable';
  try {
    client = (dependencies.createClient ?? (config => new Client(config)))({
      connectionString: verifyFullConnectionString(binding.connectionString),
      connectionTimeoutMillis: timeoutMs, query_timeout: timeoutMs,
    });
    client.on('error', onError);
    retirement = beginDedicatedClientRetirement(client, onError);
    const connection = client;
    const run = <T>(work: () => Promise<T>) => bounded(work, deadline - now());
    await run(() => connection.connect());
    rollbackRequired = true;
    const started = await run(() => connection.query('BEGIN READ ONLY'));
    if (started.command !== 'BEGIN') throw new Error('transaction_unconfirmed');
    const metadata: Record<string, unknown> = {};
    failure = 'catalog_unavailable';
    for (const sql of JOBS_SESSION_CATALOG_QUERIES) {
      const result = await run(() => connection.query(sql));
      if (result.command !== 'SELECT' || result.rows.length !== 1) throw new Error('invalid_catalog');
      Object.assign(metadata, result.rows[0]);
    }
    if (!['on', 'off'].includes(metadata.readOnlyMode as string)) throw new Error('invalid_catalog');
    metadata.readOnly = metadata.readOnlyMode === 'on';
    failure = 'rollback_unconfirmed';
    const rollback = await run(() => connection.query('ROLLBACK'));
    if (rollback.command !== 'ROLLBACK') throw new Error('rollback_unconfirmed');
    rollbackRequired = false;
    receipt = observedJobsSession(metadata) ?? unavailableJobsSession('catalog_unavailable');
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    receipt = unavailableJobsSession(error instanceof DiagnosticTimeout ? 'timeout'
      : code === '42501' ? 'insufficient_privilege' : failure);
  } finally {
    if (client) {
      const socket = retirement?.captureSocket();
      if (rollbackRequired) await bounded(() => client!.query('ROLLBACK'), cleanupMs).catch(() => undefined);
      const remaining = deadline - now();
      if (remaining <= 0 && receipt.status === 'observed') receipt = unavailableJobsSession('timeout');
      try {
        await closeDedicatedClient(client, socket, {
          closeMs: receipt.status === 'observed' ? remaining : cleanupMs,
          forceMs: Math.min(cleanupMs, 250),
        });
      } catch (error) {
        if (receipt.status === 'observed') receipt = unavailableJobsSession(
          error instanceof DatabaseClientCloseDeadlineError ? 'timeout' : 'connection_unavailable');
      } finally {
        retirement?.finishCleanup();
      }
    }
  }
  return connectionFailed && receipt.status === 'observed' ? unavailableJobsSession('connection_unavailable') : receipt;
}

interface DiagnosticEnv {
  DB_JOBS_FRESH: HyperdriveBinding;
  WORKER_VERSION?: { id?: string; tag?: string };
  JOBS_REPUTATION_SESSION_DIAGNOSTIC_ENABLED?: string;
}
export async function handleJobsReputationSessionDiagnostic(
  request: Request, env: DiagnosticEnv, authorized: boolean,
  dependencies: DiagnosticDependencies = {},
): Promise<Response> {
  if (!authorized || env.JOBS_REPUTATION_SESSION_DIAGNOSTIC_ENABLED !== 'true'
    || request.method !== 'GET' || request.signal.aborted) return new Response(null, { status: 404 });
  const url = new URL(request.url);
  if (url.pathname !== JOBS_SESSION_PATH || url.search) return jobsSessionResponse({ error: 'diagnostic_request_invalid' }, 400);
  const version = safeWorkerVersion(env.WORKER_VERSION);
  if (!version || jobsVersionOverride(request.headers.get('Cloudflare-Workers-Version-Overrides')) !== version.id) {
    return jobsSessionResponse({ error: 'diagnostic_version_unavailable' }, 409);
  }
  const receipt = await inspectJobsReputationSession(env.DB_JOBS_FRESH, dependencies);
  return jobsSessionResponse({ service: 'lythaus-jobs', workerVersionId: version.id,
    releaseTag: version.tag, receipt }, receipt.status === 'observed' ? 200 : 503);
}
