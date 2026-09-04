import type { EnvBindings } from '@lythaus/cloudflare-env';
import { query, transaction, type DatabaseClient, type HyperdriveBinding } from '@lythaus/db';
import { constantTimeEqual, decryptField, encryptField, hashAuthToken, randomToken, uuidv7 } from '@lythaus/security';
import { accessSubject } from './access-policy.ts';

interface Env extends EnvBindings {
  WORKER_VERSION: NonNullable<EnvBindings['WORKER_VERSION']>;
  DB_ADMIN_FRESH: HyperdriveBinding;
  AUTH_ACCEPTANCE_PUBLIC_API_URL: string;
  AUTH_ACCEPTANCE_ROUTE_BASE_URL: string;
  AUTH_ACCEPTANCE_EMAIL_BASE?: string;
}

interface RunRow {
  id: string;
  release_sha: string;
  candidate_worker: string;
  candidate_version: string;
  candidate_uploaded_at: string | Date;
  candidate_staged_at: string | Date;
  created_at: string | Date;
  expires_at: string | Date;
  status: string;
  context_ciphertext: string;
  context_encryption_key_version: string;
  primary_email_ciphertext: string;
  primary_email_encryption_key_version: string;
  resend_email_ciphertext: string;
  resend_email_encryption_key_version: string;
  primary_user_id: string | null;
  resend_fixture_user_id: string | null;
  initial_verification_challenge_id: string | null;
  resend_previous_challenge_id: string | null;
  resend_verification_challenge_id: string | null;
  password_reset_challenge_id: string | null;
  turnstile_verified_at: string | Date | null;
  turnstile_hostname: string | null;
  turnstile_action: string | null;
  pre_reset_refresh_ciphertext: string | null;
  pre_reset_refresh_encryption_key_version: string | null;
  pre_reset_refresh_captured_at: string | Date | null;
}

interface AcceptanceContextPayload {
  context?: unknown;
  releaseSha?: unknown;
  candidateSourceSha?: unknown;
  candidateDependencies?: unknown;
  rollbackSnapshot?: unknown;
}

const RUN_TTL_MS = 45 * 60 * 1000;
const REQUIRED_EVENTS = ['message.delivered', 'message.deferred', 'message.bounced', 'message.failed', 'message.rejected', 'message.complained'];
const LIFECYCLE_QUEUE = 'lythaus-email-lifecycle-dev';
const ACCEPTANCE_COMPONENTS = ['public', 'admin', 'jobs', 'coordinator'] as const;
const ACCEPTANCE_WORKERS: Record<(typeof ACCEPTANCE_COMPONENTS)[number], string> = {
  public: 'lythaus-public-api-development',
  admin: 'lythaus-admin-api-development',
  jobs: 'lythaus-jobs-development',
  coordinator: 'lythaus-auth-acceptance-coordinator-development',
};
const ACCEPTANCE_PROVENANCE = ['BUILT_FROM_RELEASE_SHA', 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION'] as const;
const ACCEPTANCE_STATUS = ['NEW_CANDIDATE', 'REUSED_PRODUCTION'] as const;

type AcceptanceComponent = (typeof ACCEPTANCE_COMPONENTS)[number];
type CandidateDependency = {
  workerName: string;
  versionId: string;
  sourceSha: string;
  status: (typeof ACCEPTANCE_STATUS)[number];
  provenance: (typeof ACCEPTANCE_PROVENANCE)[number];
};
type CandidateDependencies = Record<AcceptanceComponent, CandidateDependency>;
type RollbackVersion = { versionId: string; percentage: number };
type RollbackRoute = { id: string; pattern: string; script: string | null };
type AcceptanceRollbackSnapshot = {
  schemaVersion: 'lythaus-acceptance-rollback-v1';
  workers: Record<AcceptanceComponent, { versions: RollbackVersion[] }>;
  routes: { adminApi: RollbackRoute | null; coordinator: RollbackRoute | null };
};

function asIso(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const response = new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers ?? {}) } });
  response.headers.set('x-content-type-options', 'nosniff');
  return response;
}

function readinessAuthorized(request: Request, env: Env): boolean {
  const configured = env.DATABASE_READINESS_TOKEN;
  const supplied = request.headers.get('x-lythaus-readiness-token')?.trim()
    ?? request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  return Boolean(configured && supplied && constantTimeEqual(new TextEncoder().encode(configured), new TextEncoder().encode(supplied)));
}

async function requireKeeper(request: Request, env: Env): Promise<void> {
  if (readinessAuthorized(request, env)) return;
  // The route is already protected by the Admin UI Access application. Require
  // a signed human Access subject; service-token authentication is not enough.
  await accessSubject(request, env);
}

function requiredSecret(env: Env, key: keyof Env): string {
  const value = env[key];
  if (typeof value !== 'string' || !value) throw new Error(`${String(key).toLowerCase()}_not_configured`);
  return value;
}

function strictSha(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) throw new Error('acceptance_release_sha_invalid');
  return value.toLowerCase();
}

function strictUuid(value: unknown, code: string): string {
  // Acceptance runs are generated with uuidv7(); retain strict RFC UUID
  // validation while accepting the v7 run identifiers used by this Worker.
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(code);
  return value;
}

function strictTimestamp(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(code);
  return new Date(value).toISOString();
}

async function acceptanceContextDigest(context: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(context));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function aliases(base: string, runId: string): { primary: string; resend: string } {
  const match = /^([^@+\s]{1,120})(?:\+[^@\s]+)?@([^@\s]+\.[^@\s]+)$/i.exec(base.trim());
  if (!match) throw new Error('auth_acceptance_email_base_invalid');
  const suffix = runId.replace(/-/g, '').slice(0, 12);
  return { primary: `${match[1]}+lythaus-${suffix}@${match[2]}`, resend: `${match[1]}+lythaus-resend-${suffix}@${match[2]}` };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) throw new Error('content_type_invalid');
  const text = await request.text();
  if (text.length > 20_000) throw new Error('request_too_large');
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_json');
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && ['request_too_large', 'invalid_json'].includes(error.message)) throw error;
    throw new Error('invalid_json');
  }
}

async function loadRun(env: Env, id: string, markExpired = true): Promise<RunRow> {
  const result = await query<RunRow>(env.DB_ADMIN_FRESH,
    `SELECT id, release_sha, candidate_worker, candidate_version, candidate_uploaded_at, candidate_staged_at,
            created_at, expires_at, status, context_ciphertext, context_encryption_key_version,
            primary_email_ciphertext, primary_email_encryption_key_version,
            resend_email_ciphertext, resend_email_encryption_key_version,
            primary_user_id, resend_fixture_user_id, initial_verification_challenge_id,
            resend_previous_challenge_id, resend_verification_challenge_id, password_reset_challenge_id,
            turnstile_verified_at, turnstile_hostname, turnstile_action,
            pre_reset_refresh_ciphertext, pre_reset_refresh_encryption_key_version, pre_reset_refresh_captured_at
       FROM system.production_auth_acceptance_runs WHERE id = $1`, [id]);
  const run = result.rows[0];
  if (!run) throw new Error('acceptance_run_not_found');
  if (new Date(run.expires_at).getTime() <= Date.now() && ['pending', 'in_progress'].includes(run.status)) {
    if (markExpired) await query(env.DB_ADMIN_FRESH, `UPDATE system.production_auth_acceptance_runs SET status = 'expired' WHERE id = $1`, [id]);
    if (markExpired) throw new Error('acceptance_run_expired');
  }
  return run;
}

async function runContext(env: Env, run: RunRow): Promise<string> {
  return decryptField({ ciphertext: run.context_ciphertext, encryptionKeyVersion: run.context_encryption_key_version }, requiredSecret(env, 'AUTH_ACCEPTANCE_STATE_ENCRYPTION_KEY_V1'));
}

function strictCandidateDependencies(value: unknown, candidateSourceSha: string, releaseSha?: string): CandidateDependencies {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('acceptance_context_dependencies_invalid');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(',') !== [...ACCEPTANCE_COMPONENTS].sort().join(',')) {
    throw new Error('acceptance_context_dependencies_invalid');
  }
  const candidateDependencies = Object.fromEntries(ACCEPTANCE_COMPONENTS.map((component) => {
    const dependencyValue = input[component];
    if (!dependencyValue || typeof dependencyValue !== 'object' || Array.isArray(dependencyValue)) throw new Error('acceptance_context_dependencies_invalid');
    const dependency = dependencyValue as Record<string, unknown>;
    if (dependency.workerName !== ACCEPTANCE_WORKERS[component]
      || typeof dependency.versionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dependency.versionId)
      || typeof dependency.sourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(dependency.sourceSha)
      || !ACCEPTANCE_STATUS.includes(dependency.status as (typeof ACCEPTANCE_STATUS)[number])
      || !ACCEPTANCE_PROVENANCE.includes(dependency.provenance as (typeof ACCEPTANCE_PROVENANCE)[number])
      || (dependency.status === 'NEW_CANDIDATE' && dependency.provenance !== 'BUILT_FROM_RELEASE_SHA')
      || (dependency.status === 'REUSED_PRODUCTION' && dependency.provenance !== 'REUSED_KNOWN_GOOD_PRODUCTION_VERSION')) {
      throw new Error('acceptance_context_dependencies_invalid');
    }
    return [component, {
      workerName: dependency.workerName,
      versionId: dependency.versionId,
      sourceSha: dependency.sourceSha.toLowerCase(),
      status: dependency.status as CandidateDependency['status'],
      provenance: dependency.provenance as CandidateDependency['provenance'],
    }];
  })) as CandidateDependencies;
  if (candidateDependencies.public.sourceSha !== candidateSourceSha.toLowerCase()
    || candidateDependencies.public.workerName !== 'lythaus-public-api-development') {
    throw new Error('acceptance_context_dependencies_invalid');
  }
  if (releaseSha && Object.values(candidateDependencies).some((dependency) => (
    dependency.status === 'NEW_CANDIDATE' && dependency.sourceSha !== releaseSha.toLowerCase()
  ))) {
    throw new Error('acceptance_context_dependencies_invalid');
  }
  return candidateDependencies;
}

function strictRollbackSnapshot(value: unknown, dependencies?: CandidateDependencies): AcceptanceRollbackSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('acceptance_rollback_snapshot_invalid');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(',') !== ['schemaVersion', 'workers', 'routes'].sort().join(',')) throw new Error('acceptance_rollback_snapshot_unknown_field');
  if (input.schemaVersion !== 'lythaus-acceptance-rollback-v1') throw new Error('acceptance_rollback_snapshot_schema_invalid');
  if (!input.workers || typeof input.workers !== 'object' || Array.isArray(input.workers)) throw new Error('acceptance_rollback_snapshot_workers_invalid');
  const workerInput = input.workers as Record<string, unknown>;
  if (Object.keys(workerInput).sort().join(',') !== [...ACCEPTANCE_COMPONENTS].sort().join(',')) throw new Error('acceptance_rollback_snapshot_workers_unknown_field');
  const workers = Object.fromEntries(ACCEPTANCE_COMPONENTS.map((component) => {
    const componentInput = workerInput[component];
    if (!componentInput || typeof componentInput !== 'object' || Array.isArray(componentInput)) throw new Error(`acceptance_rollback_${component}_versions_invalid`);
    const versionsValue = (componentInput as Record<string, unknown>).versions;
    if (!Array.isArray(versionsValue) || (component !== 'coordinator' && versionsValue.length === 0)) throw new Error(`acceptance_rollback_${component}_versions_invalid`);
    const seen = new Set<string>();
    const versions = versionsValue.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`acceptance_rollback_${component}_version_invalid`);
      const version = entry as Record<string, unknown>;
      if (Object.keys(version).sort().join(',') !== 'percentage,versionId') throw new Error(`acceptance_rollback_${component}_version_unknown_field`);
      if (typeof version.versionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(version.versionId)) throw new Error(`acceptance_rollback_${component}_version_id_invalid`);
      if (seen.has(version.versionId.toLowerCase())) throw new Error(`acceptance_rollback_${component}_duplicate_version`);
      seen.add(version.versionId.toLowerCase());
      if (typeof version.percentage !== 'number' || !Number.isFinite(version.percentage) || version.percentage <= 0 || version.percentage > 100) throw new Error(`acceptance_rollback_${component}_percentage_invalid`);
      return { versionId: version.versionId, percentage: version.percentage };
    });
    if (versions.length > 0 && Math.abs(versions.reduce((sum, version) => sum + version.percentage, 0) - 100) > 0.001) throw new Error(`acceptance_rollback_${component}_traffic_invalid`);
    if (dependencies?.[component]?.status === 'REUSED_PRODUCTION' && versions.length === 0) throw new Error(`acceptance_rollback_${component}_reused_snapshot_empty`);
    return [component, { versions }];
  })) as Record<AcceptanceComponent, { versions: RollbackVersion[] }>;
  if (!input.routes || typeof input.routes !== 'object' || Array.isArray(input.routes)) throw new Error('acceptance_rollback_snapshot_routes_invalid');
  const routeInput = input.routes as Record<string, unknown>;
  if (Object.keys(routeInput).sort().join(',') !== 'adminApi,coordinator') throw new Error('acceptance_rollback_snapshot_routes_unknown_field');
  const route = (value: unknown, component: string): RollbackRoute | null => {
    if (value === null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`acceptance_rollback_${component}_route_invalid`);
    const item = value as Record<string, unknown>;
    if (Object.keys(item).sort().join(',') !== 'id,pattern,script') throw new Error(`acceptance_rollback_${component}_route_unknown_field`);
    if (typeof item.id !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(item.id)) throw new Error(`acceptance_rollback_${component}_route_id_invalid`);
    if (typeof item.pattern !== 'string' || !/^[\x20-\x7e]{1,1000}$/.test(item.pattern)) throw new Error(`acceptance_rollback_${component}_route_pattern_invalid`);
    if (item.script !== null && (typeof item.script !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(item.script))) throw new Error(`acceptance_rollback_${component}_route_script_invalid`);
    return { id: item.id, pattern: item.pattern, script: item.script === null ? null : item.script };
  };
  return {
    schemaVersion: 'lythaus-acceptance-rollback-v1',
    workers,
    routes: { adminApi: route(routeInput.adminApi, 'adminApi'), coordinator: route(routeInput.coordinator, 'coordinator') },
  };
}

function acceptanceContextPayload(context: string, fallback: string): { releaseSha: string; candidateSourceSha: string; candidateDependencies?: CandidateDependencies; rollbackSnapshot?: AcceptanceRollbackSnapshot } {
  if (!context.trimStart().startsWith('{')) return { releaseSha: fallback, candidateSourceSha: fallback };
  let payload: AcceptanceContextPayload;
  try {
    const parsed = JSON.parse(context) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    payload = parsed as AcceptanceContextPayload;
  } catch {
    throw new Error('acceptance_context_payload_invalid');
  }
  if (typeof payload.context !== 'string' || payload.context.length < 32 || payload.context.length > 200
    || typeof payload.releaseSha !== 'string' || !/^[0-9a-f]{40}$/i.test(payload.releaseSha)
    || typeof payload.candidateSourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(payload.candidateSourceSha)) {
    throw new Error('acceptance_context_payload_invalid');
  }
  if (payload.releaseSha.toLowerCase() !== fallback.toLowerCase()) throw new Error('acceptance_context_payload_invalid');
  const candidateDependencies = payload.candidateDependencies === undefined
    ? undefined
    : strictCandidateDependencies(payload.candidateDependencies, payload.candidateSourceSha, payload.releaseSha);
  const rollbackSnapshot = payload.rollbackSnapshot === undefined
    ? undefined
    : strictRollbackSnapshot(payload.rollbackSnapshot, candidateDependencies);
  if (rollbackSnapshot && !candidateDependencies) throw new Error('acceptance_rollback_snapshot_dependencies_missing');
  return { releaseSha: payload.releaseSha.toLowerCase(), candidateSourceSha: payload.candidateSourceSha.toLowerCase(), candidateDependencies, rollbackSnapshot };
}

function candidateSourceShaFromContext(context: string, fallback: string): string {
  return acceptanceContextPayload(context, fallback).candidateSourceSha;
}

function candidateDependenciesFromContext(context: string, fallback: string): CandidateDependencies | undefined {
  return acceptanceContextPayload(context, fallback).candidateDependencies;
}

async function candidateSourceSha(env: Env, run: RunRow): Promise<string> {
  return candidateSourceShaFromContext(await runContext(env, run), run.release_sha);
}

async function candidateDependencies(env: Env, run: RunRow): Promise<CandidateDependencies | undefined> {
  return candidateDependenciesFromContext(await runContext(env, run), run.release_sha);
}

async function rollbackSnapshot(env: Env, run: RunRow): Promise<AcceptanceRollbackSnapshot | undefined> {
  return acceptanceContextPayload(await runContext(env, run), run.release_sha).rollbackSnapshot;
}

async function runEmail(env: Env, run: RunRow, kind: 'primary' | 'resend'): Promise<string> {
  const ciphertext = kind === 'primary' ? run.primary_email_ciphertext : run.resend_email_ciphertext;
  const keyVersion = kind === 'primary' ? run.primary_email_encryption_key_version : run.resend_email_encryption_key_version;
  return decryptField({ ciphertext, encryptionKeyVersion: keyVersion }, requiredSecret(env, 'AUTH_ACCEPTANCE_STATE_ENCRYPTION_KEY_V1'));
}

async function recordEvent(env: Env, runId: string, eventType: string): Promise<void> {
  await query(env.DB_ADMIN_FRESH,
    `INSERT INTO system.production_auth_acceptance_events (id, run_id, event_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (run_id, event_type) DO NOTHING`, [uuidv7(), runId, eventType]);
}

async function candidateFetch(env: Env, run: RunRow, path: string, init: RequestInit): Promise<Response> {
  const context = await runContext(env, run);
  const sourceSha = candidateSourceShaFromContext(context, run.release_sha);
  const headers = new Headers(init.headers);
  headers.set('x-lythaus-acceptance-run-id', run.id);
  headers.set('x-lythaus-acceptance-context', context);
  headers.set('x-lythaus-acceptance-coordinator', requiredSecret(env, 'DATABASE_READINESS_TOKEN'));
  headers.set('Cloudflare-Workers-Version-Overrides', `${run.candidate_worker}="${run.candidate_version}"`);
  headers.set('accept', 'application/json');
  const response = await fetch(new URL(path, env.AUTH_ACCEPTANCE_PUBLIC_API_URL).toString(), { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  if (response.headers.get('x-lythaus-candidate-version') !== run.candidate_version
    || response.headers.get('x-lythaus-candidate-release') !== sourceSha) {
    throw new Error('candidate_version_response_mismatch');
  }
  return response;
}

async function candidateJson(env: Env, run: RunRow, path: string, body: Record<string, unknown>, init: RequestInit = {}): Promise<{ response: Response; body: Record<string, unknown> | null }> {
  const response = await candidateFetch(env, run, path, {
    ...init,
    method: init.method ?? 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed: Record<string, unknown> | null = null;
  try { parsed = raw ? JSON.parse(raw) as Record<string, unknown> : null; } catch { parsed = null; }
  return { response, body: parsed };
}

async function setChallenge(env: Env, runId: string, kind: 'initial' | 'resend' | 'reset'): Promise<void> {
  const purpose = kind === 'reset' ? 'password_reset' : 'verification';
  const outbox = await query<{ challenge_id: string }>(env.DB_ADMIN_FRESH,
    `SELECT challenge_id FROM system.transactional_email_outbox
      WHERE acceptance_run_id = $1 AND purpose = $2 AND challenge_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`, [runId, purpose]);
  const challenge = outbox.rows[0]?.challenge_id;
  if (!challenge) throw new Error('acceptance_outbox_not_created');
  const column = kind === 'initial' ? 'initial_verification_challenge_id' : kind === 'resend' ? 'resend_verification_challenge_id' : 'password_reset_challenge_id';
  await query(env.DB_ADMIN_FRESH, `UPDATE system.production_auth_acceptance_runs SET ${column} = $2, status = 'in_progress' WHERE id = $1`, [runId, challenge]);
}

async function createRun(request: Request, env: Env): Promise<Response> {
  await requireKeeper(request, env);
  const body = await readJson(request);
  const releaseSha = strictSha(body.releaseSha);
  // The coordinator is a stable certification service. Its deployed source
  // SHA may be older than the release being certified; the candidate source
  // SHA is bound separately inside the encrypted acceptance context.
  const candidateSourceSha = body.candidateSourceSha === undefined ? releaseSha : strictSha(body.candidateSourceSha);
  const candidateWorker = body.candidateWorker === 'lythaus-public-api-development' ? body.candidateWorker : (() => { throw new Error('acceptance_candidate_worker_invalid'); })();
  const candidateVersion = strictUuid(body.candidateVersion, 'acceptance_candidate_version_invalid');
  const uploadedAt = strictTimestamp(body.candidateUploadedAt, 'acceptance_candidate_uploaded_at_invalid');
  const stagedAt = strictTimestamp(body.candidateStagedAt, 'acceptance_candidate_staged_at_invalid');
  if (Date.parse(stagedAt) < Date.parse(uploadedAt)) throw new Error('acceptance_candidate_stage_before_upload');
  const candidateDependencies = body.candidateDependencies === undefined
    ? undefined
    : strictCandidateDependencies(body.candidateDependencies, candidateSourceSha, releaseSha);
  const rollbackSnapshot = body.rollbackSnapshot === undefined
    ? undefined
    : strictRollbackSnapshot(body.rollbackSnapshot, candidateDependencies);
  if (candidateDependencies && !rollbackSnapshot) throw new Error('acceptance_rollback_snapshot_required');
  if (candidateDependencies && (candidateDependencies.public.versionId !== candidateVersion || candidateDependencies.public.workerName !== candidateWorker)) {
    throw new Error('acceptance_context_dependencies_invalid');
  }
  if (candidateDependencies
    && candidateDependencies.coordinator.status === 'NEW_CANDIDATE'
    && candidateDependencies.coordinator.versionId !== env.WORKER_VERSION.id) {
    throw new Error('acceptance_coordinator_version_mismatch');
  }
  const id = uuidv7();
  const context = JSON.stringify({ context: randomToken(32), releaseSha, candidateSourceSha, ...(candidateDependencies ? { candidateDependencies } : {}), ...(rollbackSnapshot ? { rollbackSnapshot } : {}) });
  const email = aliases(requiredSecret(env, 'AUTH_ACCEPTANCE_EMAIL_BASE'), id);
  const encryptionKey = requiredSecret(env, 'AUTH_ACCEPTANCE_STATE_ENCRYPTION_KEY_V1');
  const [encryptedContext, encryptedPrimary, encryptedResend] = await Promise.all([
    encryptField(context, encryptionKey, 'v1'), encryptField(email.primary, encryptionKey, 'v1'), encryptField(email.resend, encryptionKey, 'v1'),
  ]);
  const expiresAt = new Date(Date.now() + RUN_TTL_MS).toISOString();
  await query(env.DB_ADMIN_FRESH,
    `INSERT INTO system.production_auth_acceptance_runs
       (id, release_sha, candidate_worker, candidate_version, candidate_uploaded_at, candidate_staged_at, expires_at,
        context_lookup_hmac, context_ciphertext, context_encryption_key_version,
        primary_email_ciphertext, primary_email_encryption_key_version, primary_email_lookup_hmac,
        resend_email_ciphertext, resend_email_encryption_key_version, resend_email_lookup_hmac)
     VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::timestamptz,
             decode($8, 'base64'), $9, $10, $11, $12, decode($13, 'base64'), $14, $15, decode($16, 'base64'))`,
    [id, releaseSha, candidateWorker, candidateVersion, uploadedAt, stagedAt, expiresAt,
      await acceptanceContextDigest(context), encryptedContext.ciphertext, encryptedContext.encryptionKeyVersion,
      encryptedPrimary.ciphertext, encryptedPrimary.encryptionKeyVersion, await acceptanceContextDigest(email.primary),
      encryptedResend.ciphertext, encryptedResend.encryptionKeyVersion, await acceptanceContextDigest(email.resend)],
  );
  return json({ acceptanceRunId: id, expiresAt, keeperUrl: `${env.AUTH_ACCEPTANCE_ROUTE_BASE_URL}/production-auth-acceptance?run=${encodeURIComponent(id)}` }, { status: 201 });
}

async function runSummary(request: Request, env: Env, id: string): Promise<Response> {
  await requireKeeper(request, env);
  // Keep expired-run metadata readable to the protected Keeper so the release
  // workflow can start a fresh acceptance run against the same candidate.
  // No secrets or bearer tokens are returned by this summary.
  const run = await loadRun(env, id, false);
  if (new Date(run.expires_at).getTime() <= Date.now() && ['pending', 'in_progress'].includes(run.status)) {
    await query(env.DB_ADMIN_FRESH, `UPDATE system.production_auth_acceptance_runs SET status = 'expired' WHERE id = $1`, [id]);
    run.status = 'expired';
  }
  const events = await query<{ event_type: string; occurred_at: string | Date }>(env.DB_ADMIN_FRESH,
    `SELECT event_type, occurred_at FROM system.production_auth_acceptance_events WHERE run_id = $1 ORDER BY occurred_at`, [id]);
  const outbox = await query<{ purpose: string; state: string; queued_count: string; accepted_count: string; delivered_count: string }>(env.DB_ADMIN_FRESH,
    `SELECT purpose, state, count(*)::text AS queued_count,
            count(*) FILTER (WHERE accepted_at IS NOT NULL)::text AS accepted_count,
            count(*) FILTER (WHERE delivered_at IS NOT NULL)::text AS delivered_count
       FROM system.transactional_email_outbox
      WHERE acceptance_run_id = $1
      GROUP BY purpose, state
      ORDER BY purpose, state`, [id]);
  return json({
    acceptanceRunId: run.id, releaseSha: run.release_sha, candidate: { workerName: run.candidate_worker, workerVersionId: run.candidate_version, sourceReleaseSha: await candidateSourceSha(env, run), uploadedAt: asIso(run.candidate_uploaded_at), stagedAt: asIso(run.candidate_staged_at) },
    candidateDependencies: await candidateDependencies(env, run) ?? null,
    rollbackSnapshot: await rollbackSnapshot(env, run) ?? null,
    expiresAt: asIso(run.expires_at), status: run.status,
    turnstile: run.turnstile_verified_at ? { status: 'verified', observedAt: asIso(run.turnstile_verified_at), hostname: run.turnstile_hostname, action: run.turnstile_action } : { status: 'human_required' },
    events: events.rows.map((event) => ({ type: event.event_type, occurredAt: asIso(event.occurred_at) })),
    emailLifecycle: outbox.rows.map((row) => ({
      purpose: row.purpose,
      state: row.state,
      queuedCount: Number(row.queued_count),
      acceptedCount: Number(row.accepted_count),
      deliveredCount: Number(row.delivered_count),
    })),
  });
}

async function startRegistration(request: Request, env: Env, id: string): Promise<Response> {
  await requireKeeper(request, env);
  const body = await readJson(request);
  const password = typeof body.password === 'string' && body.password.length >= 15 && body.password.length <= 128 ? body.password : (() => { throw new Error('invalid_password'); })();
  const turnstileToken = typeof body.turnstileToken === 'string' && body.turnstileToken.length >= 10 ? body.turnstileToken : (() => { throw new Error('turnstile_required'); })();
  const run = await loadRun(env, id);
  const email = await runEmail(env, run, 'primary');
  const candidate = await candidateJson(env, run, '/api/auth/email', { mode: 'register', email, password, turnstileToken });
  if (candidate.response.status !== 202) throw new Error('candidate_registration_rejected');
  await setChallenge(env, id, 'initial');
  await recordEvent(env, id, 'account_created');
  await recordEvent(env, id, 'initial_verification_requested');
  return json({ state: 'verification_email_requested' }, { status: 202 });
}

async function prepareResend(request: Request, env: Env, id: string): Promise<Response> {
  await requireKeeper(request, env);
  const body = await readJson(request);
  const turnstileToken = typeof body.turnstileToken === 'string' && body.turnstileToken.length >= 10 ? body.turnstileToken : (() => { throw new Error('turnstile_required'); })();
  const run = await loadRun(env, id);
  const email = await runEmail(env, run, 'resend');
  const fixture = await candidateJson(env, run, '/internal/production-auth-acceptance/resend-fixture', { email });
  if (fixture.response.status !== 202) throw new Error('candidate_resend_fixture_rejected');
  const candidate = await candidateJson(env, run, '/api/auth/email', { mode: 'resend_verification', email, turnstileToken });
  if (candidate.response.status !== 202) throw new Error('candidate_resend_rejected');
  await setChallenge(env, id, 'resend');
  await recordEvent(env, id, 'resend_requested');
  return json({ state: 'resend_verification_email_requested' }, { status: 202 });
}

async function requestReset(request: Request, env: Env, id: string): Promise<Response> {
  await requireKeeper(request, env);
  const body = await readJson(request);
  const turnstileToken = typeof body.turnstileToken === 'string' && body.turnstileToken.length >= 10 ? body.turnstileToken : (() => { throw new Error('turnstile_required'); })();
  const run = await loadRun(env, id);
  const email = await runEmail(env, run, 'primary');
  const candidate = await candidateJson(env, run, '/api/auth/password/reset/request', { email, turnstileToken });
  if (candidate.response.status !== 202) throw new Error('candidate_password_reset_request_rejected');
  await setChallenge(env, id, 'reset');
  await recordEvent(env, id, 'password_reset_requested');
  return json({ state: 'password_reset_email_requested' }, { status: 202 });
}

function linkPage(context: string, purpose: string, token: string): Response {
  const escaped = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
  const reset = purpose === 'password_reset';
  return new Response(`<!doctype html><html><head><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>Lythaus secure confirmation</title></head><body><main><h1>${reset ? 'Choose a new password' : 'Verify your email'}</h1><p>This link only proceeds when you explicitly confirm.</p><form method="post" action="/api/admin/production-auth-acceptance/email/complete"><input type="hidden" name="context" value="${escaped(context)}"><input type="hidden" name="purpose" value="${escaped(purpose)}"><input type="hidden" name="token" value="${escaped(token)}">${reset ? '<label>New password <input name="password" type="password" minlength="15" maxlength="128" required></label>' : ''}<button type="submit">${reset ? 'Reset password' : 'Verify email'}</button></form></main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff' } });
}

async function runForEmailContext(env: Env, context: string): Promise<RunRow> {
  const result = await query<RunRow>(env.DB_ADMIN_FRESH,
    `SELECT id, release_sha, candidate_worker, candidate_version, candidate_uploaded_at, candidate_staged_at,
            created_at, expires_at, status, context_ciphertext, context_encryption_key_version,
            primary_email_ciphertext, primary_email_encryption_key_version, resend_email_ciphertext, resend_email_encryption_key_version,
            primary_user_id, resend_fixture_user_id, initial_verification_challenge_id, resend_previous_challenge_id,
            resend_verification_challenge_id, password_reset_challenge_id, turnstile_verified_at, turnstile_hostname, turnstile_action,
            pre_reset_refresh_ciphertext, pre_reset_refresh_encryption_key_version, pre_reset_refresh_captured_at
       FROM system.production_auth_acceptance_runs
      WHERE context_lookup_hmac = decode($1, 'base64')`, [await acceptanceContextDigest(context)]);
  const run = result.rows[0];
  if (!run) throw new Error('acceptance_context_invalid');
  const actual = await runContext(env, run);
  if (!constantTimeEqual(new TextEncoder().encode(actual), new TextEncoder().encode(context))) throw new Error('acceptance_context_invalid');
  return loadRun(env, run.id);
}

async function markEmailCompletion(env: Env, run: RunRow, purpose: 'verification' | 'password_reset', token: string): Promise<void> {
  const hash = hashAuthToken(token, purpose === 'verification' ? 'verification' : 'password_reset');
  const table = purpose === 'verification' ? 'identity.email_verification_tokens' : 'identity.password_reset_tokens';
  const found = await query<{ id: string }>(env.DB_ADMIN_FRESH, `SELECT id FROM ${table} WHERE token_hash = decode($1, 'base64')`, [hash]);
  const id = found.rows[0]?.id;
  if (!id) throw new Error('acceptance_challenge_not_found');
  if (purpose === 'password_reset') {
    if (id !== run.password_reset_challenge_id) throw new Error('acceptance_challenge_run_mismatch');
    await recordEvent(env, run.id, 'password_reset_completed');
    await recordEvent(env, run.id, 'password_reset_replay_rejected');
    return;
  }
  if (id === run.initial_verification_challenge_id) {
    await recordEvent(env, run.id, 'initial_verification_completed');
    await recordEvent(env, run.id, 'initial_verification_replay_rejected');
  } else if (id === run.resend_verification_challenge_id) {
    await recordEvent(env, run.id, 'resend_verification_completed');
    await recordEvent(env, run.id, 'resend_verification_replay_rejected');
  } else throw new Error('acceptance_challenge_run_mismatch');
}

async function completeEmail(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const context = typeof form.get('context') === 'string' ? String(form.get('context')) : '';
  const purpose = form.get('purpose') === 'password_reset' ? 'password_reset' : form.get('purpose') === 'verification' ? 'verification' : '';
  const token = typeof form.get('token') === 'string' ? String(form.get('token')) : '';
  if (!context || !purpose || token.length < 32) throw new Error('acceptance_email_link_invalid');
  const run = await runForEmailContext(env, context);
  const path = purpose === 'verification' ? '/api/auth/email/verify' : '/api/auth/password/reset/complete';
  const body = purpose === 'verification'
    ? { token }
    : { token, password: typeof form.get('password') === 'string' ? String(form.get('password')) : '' };
  const first = await candidateJson(env, run, path, body);
  if (!first.response.ok) throw new Error('candidate_email_completion_rejected');
  const replay = await candidateJson(env, run, path, body);
  if (replay.response.ok) throw new Error('candidate_email_replay_not_rejected');
  await markEmailCompletion(env, run, purpose, token);
  return new Response('<!doctype html><title>Lythaus</title><p>Completed. Return to the Keeper acceptance screen.</p>', { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}

async function initialSessionProof(request: Request, env: Env, id: string): Promise<Response> {
  await requireKeeper(request, env);
  const body = await readJson(request);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 15 || password.length > 128) throw new Error('invalid_password');
  const run = await loadRun(env, id);
  const email = await runEmail(env, run, 'primary');
  const login = await candidateJson(env, run, '/api/auth/email', { mode: 'login', email, password });
  const accessToken = typeof login.body?.accessToken === 'string' ? login.body.accessToken : '';
  const refreshToken = typeof login.body?.refreshToken === 'string' ? login.body.refreshToken : '';
  if (!login.response.ok || !accessToken || !refreshToken) throw new Error('candidate_initial_login_rejected');
  await recordEvent(env, id, 'login_completed');
  const refreshed = await candidateJson(env, run, '/api/auth/refresh', { refreshToken });
  const refreshedToken = typeof refreshed.body?.refreshToken === 'string' ? refreshed.body.refreshToken : '';
  if (!refreshed.response.ok || !refreshedToken) throw new Error('candidate_initial_refresh_rejected');
  await recordEvent(env, id, 'refresh_completed');
  const encrypted = await encryptField(refreshedToken, requiredSecret(env, 'AUTH_ACCEPTANCE_STATE_ENCRYPTION_KEY_V1'), 'v1');
  await query(env.DB_ADMIN_FRESH,
    `UPDATE system.production_auth_acceptance_runs
        SET pre_reset_refresh_ciphertext = $2,
            pre_reset_refresh_encryption_key_version = $3,
            pre_reset_refresh_captured_at = now()
      WHERE id = $1`,
    [id, encrypted.ciphertext, encrypted.encryptionKeyVersion],
  );
  return json({ state: 'initial_session_proof_completed' });
}

async function sessionProof(request: Request, env: Env, id: string): Promise<Response> {
  await requireKeeper(request, env);
  const body = await readJson(request);
  const oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (oldPassword.length < 15 || newPassword.length < 15 || newPassword.length > 128) throw new Error('invalid_password');
  const run = await loadRun(env, id);
  if (!run.pre_reset_refresh_ciphertext || !run.pre_reset_refresh_encryption_key_version) throw new Error('candidate_initial_session_proof_required');
  const preResetRefresh = await decryptField({
    ciphertext: run.pre_reset_refresh_ciphertext,
    encryptionKeyVersion: run.pre_reset_refresh_encryption_key_version,
  }, requiredSecret(env, 'AUTH_ACCEPTANCE_STATE_ENCRYPTION_KEY_V1'));
  const revokedRefresh = await candidateJson(env, run, '/api/auth/refresh', { refreshToken: preResetRefresh });
  if (revokedRefresh.response.ok) throw new Error('candidate_pre_reset_refresh_accepted');
  await recordEvent(env, id, 'password_reset_sessions_revoked');
  await query(env.DB_ADMIN_FRESH,
    `UPDATE system.production_auth_acceptance_runs
        SET pre_reset_refresh_ciphertext = NULL,
            pre_reset_refresh_encryption_key_version = NULL,
            pre_reset_refresh_captured_at = NULL
      WHERE id = $1`, [id]);
  const email = await runEmail(env, run, 'primary');
  const oldLogin = await candidateJson(env, run, '/api/auth/email', { mode: 'login', email, password: oldPassword });
  if (oldLogin.response.ok) throw new Error('candidate_old_password_accepted');
  await recordEvent(env, id, 'password_reset_old_password_rejected');
  const login = await candidateJson(env, run, '/api/auth/email', { mode: 'login', email, password: newPassword });
  const accessToken = typeof login.body?.accessToken === 'string' ? login.body.accessToken : '';
  if (!login.response.ok || !accessToken) throw new Error('candidate_new_password_login_rejected');
  await recordEvent(env, id, 'password_reset_new_password_accepted');
  const logout = await candidateJson(env, run, '/api/auth/logout', {}, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!logout.response.ok) throw new Error('candidate_logout_rejected');
  await recordEvent(env, id, 'logout_completed');
  await query(env.DB_ADMIN_FRESH,
    `UPDATE system.production_auth_acceptance_runs
        SET status = 'completed',
            completed_at = now()
      WHERE id = $1
        AND status IN ('pending', 'in_progress')`,
    [id],
  );
  return json({ state: 'post_reset_session_proof_completed' });
}

async function opaqueUuid(env: Env, value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${requiredSecret(env, 'DATABASE_READINESS_TOKEN')}:${value}`));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function opaqueUuidFromDigest(value: string): string {
  const hex = value.replace(/[^a-f0-9]/gi, '').slice(0, 32).padEnd(32, '0');
  const bytes = Uint8Array.from(hex.match(/.{1,2}/g)!.map((part) => Number.parseInt(part, 16)));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const stable = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${stable.slice(0, 8)}-${stable.slice(8, 12)}-${stable.slice(12, 16)}-${stable.slice(16, 20)}-${stable.slice(20)}`;
}

function opaqueReferenceFromDigest(value: string): string {
  return `pmid-${value.replace(/[^a-f0-9]/gi, '').slice(0, 36)}`;
}

async function lifecycleSubscription(env: Env): Promise<{ source: string; domain: string; status: string; events: string[]; observedAt: string }> {
  const accountId = requiredSecret(env, 'CLOUDFLARE_ACCOUNT_ID');
  const token = requiredSecret(env, 'CLOUDFLARE_EMAIL_LIFECYCLE_READ_TOKEN');
  const call = async (path: string): Promise<unknown[]> => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => null) as { success?: boolean; result?: unknown } | null;
    if (!response.ok || body?.success !== true || !Array.isArray(body.result)) throw new Error('cloudflare_lifecycle_observation_unavailable');
    return body.result;
  };
  const queues = await call('/queues?per_page=100');
  const queue = queues.filter((entry) => (entry as { queue_name?: string; name?: string }).queue_name === LIFECYCLE_QUEUE || (entry as { name?: string }).name === LIFECYCLE_QUEUE);
  const queueId = (queue[0] as { queue_id?: string; id?: string } | undefined)?.queue_id ?? (queue[0] as { id?: string } | undefined)?.id;
  if (queue.length !== 1 || !queueId) throw new Error('cloudflare_lifecycle_queue_ambiguous');
  const subscriptions = await call('/event_subscriptions/subscriptions?per_page=100');
  const matches = subscriptions.filter((entry) => {
    const value = entry as { destination?: { queue_id?: string }; source?: { type?: string; domain?: string; sending_domain?: string }; enabled?: boolean; events?: unknown[] };
    return value.destination?.queue_id === queueId && value.source?.type === 'email.sending' && (value.source.domain ?? value.source.sending_domain) === 'mail.lythaus.co';
  });
  const subscription = matches[0] as { enabled?: boolean; events?: unknown[] } | undefined;
  const events = Array.isArray(subscription?.events) ? subscription!.events.filter((event): event is string => typeof event === 'string').sort() : [];
  if (matches.length !== 1 || subscription?.enabled !== true || JSON.stringify(events) !== JSON.stringify([...REQUIRED_EVENTS].sort())) throw new Error('cloudflare_lifecycle_subscription_drift');
  return { source: 'cloudflare_email_sending_queue_subscription_observation', domain: 'mail.lythaus.co', status: 'enabled', events, observedAt: new Date().toISOString() };
}

async function observer(request: Request, env: Env): Promise<Response> {
  await requireKeeper(request, env);
  const url = new URL(request.url);
  const runId = strictUuid(request.headers.get('x-lythaus-acceptance-run-id'), 'acceptance_run_id_invalid');
  const run = await loadRun(env, runId, false);
  if (url.searchParams.get('releaseSha') !== run.release_sha || url.searchParams.get('candidateWorker') !== run.candidate_worker || url.searchParams.get('candidateVersion') !== run.candidate_version) throw new Error('acceptance_observer_binding_mismatch');
  const candidate = { workerName: run.candidate_worker, workerVersionId: run.candidate_version, sourceReleaseSha: await candidateSourceSha(env, run), uploadedAt: asIso(run.candidate_uploaded_at), stagedAt: asIso(run.candidate_staged_at) };
  const dependencies = await candidateDependencies(env, run);
  const events = await query<{ event_type: string; occurred_at: string | Date }>(env.DB_ADMIN_FRESH, `SELECT event_type, occurred_at FROM system.production_auth_acceptance_events WHERE run_id = $1`, [run.id]);
  const at = new Map(events.rows.map((event) => [event.event_type, asIso(event.occurred_at)!]));
  const required = ['account_created', 'turnstile_verified', 'initial_verification_requested', 'initial_verification_completed', 'initial_verification_replay_rejected', 'resend_fixture_created', 'resend_requested', 'resend_verification_completed', 'resend_verification_replay_rejected', 'password_reset_requested', 'password_reset_completed', 'password_reset_replay_rejected', 'password_reset_sessions_revoked', 'password_reset_old_password_rejected', 'password_reset_new_password_accepted', 'login_completed', 'refresh_completed', 'logout_completed'];
  if (required.some((event) => !at.has(event))) {
    return json({ formatVersion: 'lythaus-real-email-acceptance-v2', source: 'runtime_observation', status: 'HUMAN_ACCEPTANCE_REQUIRED', reason: 'keeper_flow_incomplete', releaseSha: run.release_sha, acceptanceRunId: run.id, candidate }, { status: 428 });
  }
  const challenges = [run.initial_verification_challenge_id, run.resend_previous_challenge_id, run.resend_verification_challenge_id, run.password_reset_challenge_id];
  if (challenges.some((challenge) => !challenge)) return json({ formatVersion: 'lythaus-real-email-acceptance-v2', source: 'runtime_observation', status: 'HUMAN_ACCEPTANCE_REQUIRED', reason: 'candidate_challenge_pending', releaseSha: run.release_sha, acceptanceRunId: run.id, candidate }, { status: 428 });
  const outboxes = await query<{ flow: 'initial' | 'resend' | 'reset'; purpose: 'verification' | 'password_reset'; created_at: string | Date; provider: string | null; provider_message_digest: string | null; outbox_digest: string; accepted_at: string | Date | null; delivered_at: string | Date | null; state: string }>(env.DB_ADMIN_FRESH,
    `SELECT CASE
              WHEN challenge_id = $2::uuid THEN 'initial'
              WHEN challenge_id = $3::uuid THEN 'resend'
              WHEN challenge_id = $4::uuid THEN 'reset'
            END AS flow,
            purpose, created_at, provider,
            encode(digest(provider_message_id, 'sha256'), 'hex') AS provider_message_digest,
            encode(digest(id::text, 'sha256'), 'hex') AS outbox_digest,
            accepted_at, delivered_at, state
       FROM system.transactional_email_outbox
      WHERE acceptance_run_id = $1
        AND correlation_id = $1
        AND challenge_id = ANY($5::uuid[])`,
    [run.id, run.initial_verification_challenge_id!, run.resend_verification_challenge_id!, run.password_reset_challenge_id!, [run.initial_verification_challenge_id!, run.resend_verification_challenge_id!, run.password_reset_challenge_id!]],
  );
  const outboxByFlow = new Map(outboxes.rows.map((row) => [row.flow, row]));
  const verificationTokens = await query<{ flow: 'initial' | 'previous' | 'resend'; created_at: string | Date; consumed_at: string | Date | null; superseded_at: string | Date | null }>(env.DB_ADMIN_FRESH,
    `SELECT CASE
              WHEN id = $1::uuid THEN 'initial'
              WHEN id = $2::uuid THEN 'previous'
              WHEN id = $3::uuid THEN 'resend'
            END AS flow,
            created_at, consumed_at, superseded_at
       FROM identity.email_verification_tokens
      WHERE id = ANY($4::uuid[])`,
    [run.initial_verification_challenge_id!, run.resend_previous_challenge_id!, run.resend_verification_challenge_id!, [run.initial_verification_challenge_id!, run.resend_previous_challenge_id!, run.resend_verification_challenge_id!]],
  );
  const resets = await query<{ flow: 'reset'; created_at: string | Date; consumed_at: string | Date | null; superseded_at: string | Date | null }>(env.DB_ADMIN_FRESH,
    `SELECT 'reset' AS flow, created_at, consumed_at, superseded_at
       FROM identity.password_reset_tokens WHERE id = $1::uuid`, [run.password_reset_challenge_id!]);
  const tokenByFlow = new Map([...verificationTokens.rows, ...resets.rows].map((row) => [row.flow, row]));
  const primary = await query<{ created_at: string | Date; is_production_acceptance: boolean }>(env.DB_ADMIN_FRESH, `SELECT created_at, is_production_acceptance FROM identity.users WHERE id = $1`, [run.primary_user_id]);
  const buildFlow = async (flow: 'initial' | 'resend' | 'reset', challengeId: string, requestedAt: string, verifiedAt: string, replayAt: string) => {
    const token = tokenByFlow.get(flow);
    const outbox = outboxByFlow.get(flow);
    if (!token || !outbox || outbox.state !== 'delivered' || outbox.provider !== 'cloudflare-email' || !outbox.provider_message_digest || !outbox.accepted_at || !outbox.delivered_at || !token.consumed_at) throw new Error('acceptance_delivery_not_ready');
    const safeChallenge = await opaqueUuid(env, challengeId);
    const safeMessage = opaqueReferenceFromDigest(outbox.provider_message_digest);
    return { requestedAt, challenge: { id: safeChallenge, createdAt: asIso(token.created_at), ...(token.superseded_at ? { supersededAt: asIso(token.superseded_at) } : {}) }, outbox: { id: opaqueUuidFromDigest(outbox.outbox_digest), purpose: outbox.purpose, challengeId: safeChallenge, createdAt: asIso(outbox.created_at), provider: 'cloudflare-email', providerMessageId: safeMessage, acceptedAt: asIso(outbox.accepted_at), lifecycle: { eventType: 'message.delivered', providerMessageId: safeMessage, occurredAt: asIso(outbox.delivered_at), observedAt: new Date().toISOString() } }, verification: { challengeId: safeChallenge, completedAt: verifiedAt, consumedAt: asIso(token.consumed_at) }, replay: { attemptedAt: replayAt, rejectedAt: replayAt } };
  };
  const initial = await buildFlow('initial', run.initial_verification_challenge_id!, at.get('initial_verification_requested')!, at.get('initial_verification_completed')!, at.get('initial_verification_replay_rejected')!);
  const resend = await buildFlow('resend', run.resend_verification_challenge_id!, at.get('resend_requested')!, at.get('resend_verification_completed')!, at.get('resend_verification_replay_rejected')!);
  const reset = await buildFlow('reset', run.password_reset_challenge_id!, at.get('password_reset_requested')!, at.get('password_reset_completed')!, at.get('password_reset_replay_rejected')!);
  const previous = tokenByFlow.get('previous');
  if (!previous?.superseded_at || !primary.rows[0]?.is_production_acceptance || !primary.rows[0]?.created_at) throw new Error('acceptance_observer_state_invalid');
  const summaryRows = await query<{ purpose: string; state: string; provider: string; provider_error_category: string | null; row_count: string; provider_message_id_count: string; distinct_provider_message_id_count: string; accepted_count: string; delivered_count: string }>(env.DB_ADMIN_FRESH,
    `SELECT purpose, state, provider, provider_error_category, count(*)::text AS row_count,
            count(provider_message_id)::text AS provider_message_id_count, count(DISTINCT provider_message_id)::text AS distinct_provider_message_id_count,
            count(*) FILTER (WHERE accepted_at IS NOT NULL)::text AS accepted_count, count(*) FILTER (WHERE delivered_at IS NOT NULL)::text AS delivered_count
       FROM system.transactional_email_outbox
      WHERE correlation_id = $1 AND challenge_id = ANY($2::uuid[]) AND created_at >= $3::timestamptz AND created_at <= now()
        AND provider = 'cloudflare-email' AND state = 'delivered'
      GROUP BY purpose, state, provider, provider_error_category`, [run.id, [run.initial_verification_challenge_id!, run.resend_verification_challenge_id!, run.password_reset_challenge_id!], asIso(run.candidate_staged_at)!]);
  const lifecycle = await lifecycleSubscription(env);
  const evidence = {
    formatVersion: 'lythaus-real-email-acceptance-v2', source: 'runtime_observation', status: 'PASSED', releaseSha: run.release_sha, acceptanceRunId: run.id, candidate, lifecycleSubscription: lifecycle,
    ...(dependencies ? { candidateDependencies: dependencies } : {}),
    outboxSummary: { source: 'read_only_database_query', lifecycleSource: 'authenticated_lifecycle_handler', capturedAt: new Date().toISOString(), rows: summaryRows.rows.map((row) => ({ purpose: row.purpose, state: row.state, provider: row.provider, providerErrorCategory: row.provider_error_category, rowCount: Number(row.row_count), providerMessageIdCount: Number(row.provider_message_id_count), distinctProviderMessageIdCount: Number(row.distinct_provider_message_id_count), acceptedCount: Number(row.accepted_count), deliveredCount: Number(row.delivered_count) })) },
    acceptanceAccount: { class: 'production_acceptance', createdAt: asIso(primary.rows[0].created_at), metricIsolation: 'excluded' },
    turnstile: { status: 'verified', observedAt: asIso(run.turnstile_verified_at), hostname: run.turnstile_hostname, action: run.turnstile_action },
    initialVerification: initial,
    resendVerification: { ...resend, fixtureCreatedAt: at.get('resend_fixture_created'), previousChallenge: { id: await opaqueUuid(env, run.resend_previous_challenge_id!), createdAt: asIso(previous.created_at), supersededAt: asIso(previous.superseded_at) } },
    passwordReset: { ...reset, reset: { completedAt: at.get('password_reset_completed'), consumedAt: asIso(tokenByFlow.get('reset')?.consumed_at), replayAttemptedAt: at.get('password_reset_replay_rejected'), replayRejectedAt: at.get('password_reset_replay_rejected'), sessionsRevokedAt: at.get('password_reset_sessions_revoked'), oldPasswordRejectedAt: at.get('password_reset_old_password_rejected'), newPasswordAcceptedAt: at.get('password_reset_new_password_accepted') } },
    login: { completedAt: at.get('login_completed') }, refresh: { completedAt: at.get('refresh_completed') }, logout: { completedAt: at.get('logout_completed') },
  };
  return json(evidence);
}

function failure(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'acceptance_request_failed';
  const status = ['access_required', 'access_assertion_invalid', 'admin_role_required', 'authentication_required'].includes(message) ? 401
    : ['acceptance_run_not_found'].includes(message) ? 404
      : ['acceptance_run_expired'].includes(message) ? 410
        : message.includes('candidate') || message.includes('lifecycle') || message.includes('delivery') ? 502 : 400;
  return json({ error: { code: /^[a-z0-9_:-]{3,120}$/i.test(message) ? message : 'acceptance_request_failed' } }, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const base = '/api/admin/production-auth-acceptance';
    try {
      if (request.method === 'GET' && url.pathname === `${base}/email`) {
        const context = url.searchParams.get('context') ?? '';
        const purpose = url.searchParams.get('purpose') ?? '';
        const token = url.searchParams.get('token') ?? '';
        await runForEmailContext(env, context);
        if (!['verification', 'password_reset'].includes(purpose) || token.length < 32) throw new Error('acceptance_email_link_invalid');
        return linkPage(context, purpose, token);
      }
      if (request.method === 'POST' && url.pathname === `${base}/email/complete`) return completeEmail(request, env);
      if (request.method === 'POST' && url.pathname === `${base}/runs`) return createRun(request, env);
      if (request.method === 'GET' && url.pathname === `${base}/turnstile`) {
        await requireKeeper(request, env);
        const siteKey = env.AUTH_ACCEPTANCE_TURNSTILE_SITE_KEY;
        if (!siteKey || !/^[A-Za-z0-9_-]{20,64}$/.test(siteKey)) throw new Error('turnstile_not_configured');
        return json({ siteKey });
      }
      const match = new RegExp(`^${base}/runs/([0-9a-f-]{36})(?:/(register|resend|reset|initial-session|session-proof))?$`, 'i').exec(url.pathname);
      if (match && request.method === 'GET' && !match[2]) return runSummary(request, env, strictUuid(match[1], 'acceptance_run_id_invalid'));
      if (match && request.method === 'POST' && match[2] === 'register') return startRegistration(request, env, strictUuid(match[1], 'acceptance_run_id_invalid'));
      if (match && request.method === 'POST' && match[2] === 'resend') return prepareResend(request, env, strictUuid(match[1], 'acceptance_run_id_invalid'));
      if (match && request.method === 'POST' && match[2] === 'reset') return requestReset(request, env, strictUuid(match[1], 'acceptance_run_id_invalid'));
      if (match && request.method === 'POST' && match[2] === 'initial-session') return initialSessionProof(request, env, strictUuid(match[1], 'acceptance_run_id_invalid'));
      if (match && request.method === 'POST' && match[2] === 'session-proof') return sessionProof(request, env, strictUuid(match[1], 'acceptance_run_id_invalid'));
      if (request.method === 'GET' && url.pathname === `${base}/observer`) return observer(request, env);
      return json({ error: { code: 'not_found' } }, { status: 404 });
    } catch (error) {
      return failure(error);
    }
  },
};
