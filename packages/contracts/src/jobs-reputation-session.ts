export const JOBS_SESSION_PATH = '/internal/readiness/jobs-reputation-session';
export const JOBS_SESSION_SCHEMA = 'lythaus-jobs-reputation-session-v1';
export const EXPECTED_JOBS_SQL_ROLE = 'pscale_api_9jfbtij9y4b2';
export const JOBS_WORKER_NAME = 'lythaus-jobs-development';
export const JOBS_SESSION_TIMEOUT_MS = 5_000;
export const JOBS_SESSION_CLEANUP_MS = 500;
export const JOBS_SESSION_BRIDGE_TIMEOUT_MS = 7_000;
export const JOBS_SESSION_RECEIPT_BYTES = 4_096;

const isolationLevels = ['read committed', 'read uncommitted', 'repeatable read', 'serializable'];
const schemas = new Set(['"$user"', 'pg_catalog', 'pg_temp', 'public', 'identity', 'trust',
  'content', 'social', 'feed', 'moderation', 'privacy', 'media', 'editorial', 'marketing', 'system']);
const booleanFields = ['readOnly', 'superuser', 'canLogin', 'bypassRls', 'createRole',
  'createDb', 'inherit', 'trustUsage', 'publicCreate', 'identityCreate', 'trustCreate',
  'usersUpdate', 'usersIdSelect', 'usersStatusSelect', 'usersRls', 'usersForceRls'] as const;
export type SessionMetadata = Record<typeof booleanFields[number], boolean> & {
  sessionRole: string | null;
  currentRole: string | null;
  database: string | null;
  isolation: string | null;
  defaultIsolation: string | null;
  searchPath: string | null;
  memberships: number;
};
export type JobsSessionDiagnosticCode = 'timeout' | 'insufficient_privilege' |
  'catalog_unavailable' | 'connection_unavailable' | 'rollback_unconfirmed';
export type JobsSessionReceipt = {
  schemaVersion: typeof JOBS_SESSION_SCHEMA;
  status: 'observed';
  rollbackConfirmed: true;
  prerequisitesMet: boolean;
  metadata: SessionMetadata;
} | {
  schemaVersion: typeof JOBS_SESSION_SCHEMA;
  status: 'unavailable';
  diagnosticCode: JobsSessionDiagnosticCode;
};

export function unavailableJobsSession(diagnosticCode: JobsSessionDiagnosticCode): JobsSessionReceipt {
  return { schemaVersion: JOBS_SESSION_SCHEMA, status: 'unavailable', diagnosticCode };
}

export function safeWorkerVersion(value: unknown): { id: string; tag: string } | null {
  if (!value || typeof value !== 'object') return null;
  const { id, tag } = value as Record<string, unknown>;
  return typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)
    && typeof tag === 'string' && /^[a-f0-9]{40}$/.test(tag) ? { id, tag } : null;
}

export function workerVersionOverrides(value: string | null): { jobs: string | null; public: string | null } | null {
  if (!value || value.length > 256) return null;
  let jobs: string | null = null;
  let publicVersion: string | null = null;
  const seen = new Set<string>();
  for (const entry of value.split(',')) {
    const match = /^\s*(lythaus-jobs-development|lythaus-public-api-development)="([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})"\s*$/.exec(entry);
    if (!match || seen.has(match[1])) return null;
    seen.add(match[1]);
    if (match[1] === JOBS_WORKER_NAME) jobs = match[2];
    else publicVersion = match[2];
  }
  return { jobs, public: publicVersion };
}

export function jobsVersionOverride(value: string | null): string | null {
  return workerVersionOverrides(value)?.jobs ?? null;
}

export function observedJobsSession(value: unknown): JobsSessionReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (['sessionRole', 'currentRole', 'database', 'isolation', 'defaultIsolation', 'searchPath']
      .some(field => typeof row[field] !== 'string' && row[field] !== null)
    || booleanFields.some(field => typeof row[field] !== 'boolean')
    || typeof row.memberships !== 'number' || !Number.isSafeInteger(row.memberships)
    || row.memberships < 0 || row.memberships > 1_000) return null;
  const safePath = typeof row.searchPath === 'string' && row.searchPath.length <= 256
    && row.searchPath.split(',').every(part => schemas.has(part.trim())) ? row.searchPath : null;
  const metadata = {
    sessionRole: row.sessionRole === EXPECTED_JOBS_SQL_ROLE ? EXPECTED_JOBS_SQL_ROLE : null,
    currentRole: row.currentRole === EXPECTED_JOBS_SQL_ROLE ? EXPECTED_JOBS_SQL_ROLE : null,
    database: row.database === 'postgres' ? 'postgres' : null,
    isolation: typeof row.isolation === 'string' && isolationLevels.includes(row.isolation) ? row.isolation : null,
    defaultIsolation: typeof row.defaultIsolation === 'string' && isolationLevels.includes(row.defaultIsolation) ? row.defaultIsolation : null,
    searchPath: safePath,
    memberships: row.memberships,
    ...Object.fromEntries(booleanFields.map(field => [field, row[field]])),
  } as SessionMetadata;
  const prerequisitesMet = metadata.sessionRole !== null && metadata.currentRole !== null
    && metadata.database !== null && metadata.isolation === 'read committed'
    && metadata.defaultIsolation === 'read committed' && metadata.searchPath !== null
    && metadata.readOnly && !metadata.superuser && metadata.canLogin && !metadata.bypassRls
    && !metadata.createRole && !metadata.createDb && metadata.memberships === 0
    && metadata.trustUsage && !metadata.publicCreate && !metadata.identityCreate
    && !metadata.trustCreate && !metadata.usersUpdate && metadata.usersIdSelect
    && metadata.usersStatusSelect && !metadata.usersRls && !metadata.usersForceRls;
  return { schemaVersion: JOBS_SESSION_SCHEMA, status: 'observed', rollbackConfirmed: true,
    prerequisitesMet, metadata };
}

export function sanitizedJobsSessionReceipt(value: unknown): JobsSessionReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const receipt = value as Record<string, unknown>;
  if (receipt.schemaVersion !== JOBS_SESSION_SCHEMA) return null;
  if (receipt.status === 'observed' && receipt.rollbackConfirmed === true) {
    return observedJobsSession(receipt.metadata);
  }
  const codes: JobsSessionDiagnosticCode[] = ['timeout', 'insufficient_privilege',
    'catalog_unavailable', 'connection_unavailable', 'rollback_unconfirmed'];
  return receipt.status === 'unavailable' && codes.includes(receipt.diagnosticCode as JobsSessionDiagnosticCode)
    ? unavailableJobsSession(receipt.diagnosticCode as JobsSessionDiagnosticCode) : null;
}

export function jobsSessionResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'private, no-store',
    vary: 'Authorization', 'x-content-type-options': 'nosniff' } });
}
