import { databaseExpectationsFromEnv, databaseReadinessResponse, inspectDatabaseIdentity, query, transaction, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { assertExpectedHostname, correlationId, json, logEvent } from '@lythaus/observability';
import { constantTimeEqual, hmacLookup, uuidv7 } from '@lythaus/security';
import { createRemoteJWKSet, jwtVerify } from 'jose';

interface Env extends EnvBindings {
  DB_ADMIN_FRESH: HyperdriveBinding;
  DB_PRIVACY_FRESH: HyperdriveBinding;
}

function hasReadinessAuthorization(request: Request, env: Env): boolean {
  const configured = env.DATABASE_READINESS_TOKEN;
  const supplied = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!configured || !supplied) return false;
  return constantTimeEqual(new TextEncoder().encode(configured), new TextEncoder().encode(supplied));
}

async function accessSubject(request: Request, env: Env): Promise<string> {
  const assertion = request.headers.get('cf-access-jwt-assertion');
  if (!assertion) throw new Error('access_required');
  if (!env.ACCESS_JWKS_URL || !env.ACCESS_AUDIENCE) throw new Error('access_verification_not_configured');
  const jwks = createRemoteJWKSet(new URL(env.ACCESS_JWKS_URL));
  const verified = await jwtVerify(assertion, jwks, {
    audience: env.ACCESS_AUDIENCE,
    issuer: env.ACCESS_TEAM_DOMAIN ? `https://${env.ACCESS_TEAM_DOMAIN}` : undefined,
  });
  const payload = verified.payload as { sub?: string; email?: string };
  const subject = payload.sub ?? payload.email;
  if (!subject) throw new Error('access_subject_missing');
  return subject;
}

async function requireAdmin(request: Request, env: Env): Promise<{ userId: string; role: string }> {
  if (!env.ACCESS_SUBJECT_HMAC_KEY) throw new Error('admin_subject_key_not_configured');
  const subjectHmac = hmacLookup(await accessSubject(request, env), env.ACCESS_SUBJECT_HMAC_KEY);
  const result = await query<{ user_id: string; role: string }>(env.DB_ADMIN_FRESH,
    `SELECT user_id, role FROM identity.admin_memberships WHERE access_subject_hmac = decode($1, 'base64') AND active = true`,
    [subjectHmac]
  );
  if (result.rowCount !== 1) throw new Error('admin_role_required');
  return { userId: result.rows[0].user_id, role: result.rows[0].role };
}

async function readJson<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 16 * 1024) throw new Error('request_too_large');
  return JSON.parse(new TextDecoder().decode(await request.arrayBuffer())) as T;
}

async function decideModeration(request: Request, env: Env, actor: { userId: string; role: string }, caseId: string, correlation: string): Promise<Response> {
  const input = await readJson<{ outcome?: 'allow' | 'block' | 'queue'; reasonCode?: string; publicLabel?: string }>(request);
  if (!input.outcome || !['allow', 'block', 'queue'].includes(input.outcome)) throw new Error('invalid_moderation_outcome');
  if (!input.reasonCode || !/^[A-Z0-9_.:-]{2,80}$/.test(input.reasonCode)) throw new Error('reason_code_required');
  const existing = await query<{ content_type: string; content_id: string; policy_version: string }>(env.DB_ADMIN_FRESH,
    `SELECT content_type, content_id, policy_version FROM moderation.cases WHERE id = $1`, [caseId]);
  const moderationCase = existing.rows[0];
  if (!moderationCase) throw new Error('moderation_case_not_found');
  const publicLabel = input.publicLabel && ['Human-authored', 'AI-assisted', 'AI-generated', 'Under review'].includes(input.publicLabel)
    ? input.publicLabel
    : input.outcome === 'allow' ? undefined : 'Under review';
  await transaction(env.DB_ADMIN_FRESH, async (client) => {
    await client.query(
      `INSERT INTO moderation.decisions (id, case_id, outcome, public_label, policy_version, decided_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv7(), caseId, input.outcome, publicLabel ?? null, moderationCase.policy_version, actor.userId]
    );
    await client.query(`UPDATE moderation.cases SET state = $1, resolved_at = CASE WHEN $1 = 'open' THEN NULL ELSE now() END WHERE id = $2`, [input.outcome === 'queue' ? 'open' : 'resolved', caseId]);
    await client.query(`UPDATE moderation.appeals SET state = $1, resolved_at = CASE WHEN $1 = 'resolved' THEN now() ELSE NULL END WHERE case_id = $2 AND state = 'open'`, [input.outcome === 'queue' ? 'open' : 'resolved', caseId]);
    if (moderationCase.content_type === 'post') {
      await client.query(`UPDATE content.posts SET moderation_state = $1, published_at = CASE WHEN $1 = 'allowed' THEN COALESCE(published_at, now()) ELSE NULL END, updated_at = now() WHERE id = $2`, [input.outcome === 'allow' ? 'allowed' : input.outcome === 'block' ? 'blocked' : 'under_review', moderationCase.content_id]);
      if (publicLabel) await client.query(`UPDATE content.content_declarations SET public_label = $1, review_required = $2, updated_at = now() WHERE post_id = $3`, [publicLabel, input.outcome !== 'allow', moderationCase.content_id]);
    } else if (moderationCase.content_type === 'comment') {
      await client.query(`UPDATE content.comments SET moderation_state = $1 WHERE id = $2`, [input.outcome === 'allow' ? 'allowed' : input.outcome === 'block' ? 'blocked' : 'under_review', moderationCase.content_id]);
    }
    await client.query(
      `INSERT INTO moderation.enforcement_events (id, case_id, action, reason_code, policy_version, actor_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv7(), caseId, input.outcome, input.reasonCode, moderationCase.policy_version, actor.userId]
    );
    await client.query(
      `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
       VALUES ($1, $2, 'moderation.decision', 'moderation_case', $3, $4, $5, $6::jsonb)`,
      [uuidv7(), actor.userId, caseId, input.reasonCode, correlation, JSON.stringify({ outcome: input.outcome, role: actor.role })]
    );
  });
  return json({ caseId, outcome: input.outcome, publicLabel: publicLabel ?? null }, { headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' } });
}

async function updateAccountStatus(request: Request, env: Env, actor: { userId: string; role: string }, targetUserId: string, correlation: string): Promise<Response> {
  if (!['administrator', 'owner'].includes(actor.role)) throw new Error('admin_role_required');
  const input = await readJson<{ status?: 'active' | 'suspended' | 'locked'; reasonCode?: string }>(request);
  if (!input.status || !['active', 'suspended', 'locked'].includes(input.status)) throw new Error('invalid_account_status');
  if (!input.reasonCode || !/^[A-Z0-9_.:-]{2,80}$/.test(input.reasonCode)) throw new Error('reason_code_required');
  const result = await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE identity.users SET status = $1, token_version = token_version + 1, updated_at = now() WHERE id = $2 AND status <> 'deleted' RETURNING id`,
      [input.status, targetUserId]
    );
    if (updated.rowCount !== 1) throw new Error('user_not_found');
    await client.query(`UPDATE identity.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [targetUserId]);
    await client.query(`UPDATE identity.refresh_token_families SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [targetUserId]);
    await client.query(`INSERT INTO identity.account_events (id, user_id, actor_id, event_type, metadata) VALUES ($1, $2, $3, 'account_status_changed', $4::jsonb)`, [uuidv7(), targetUserId, actor.userId, JSON.stringify({ status: input.status, reasonCode: input.reasonCode })]);
    await client.query(
      `INSERT INTO system.audit_events (id, actor_id, action, target_type, target_id, reason_code, correlation_id, metadata)
       VALUES ($1, $2, 'account.status_changed', 'user', $3, $4, $5, $6::jsonb)`,
      [uuidv7(), actor.userId, targetUserId, input.reasonCode, correlation, JSON.stringify({ status: input.status })]
    );
    return updated.rows[0].id;
  });
  return json({ userId: result, status: input.status }, { headers: { 'x-correlation-id': correlation, 'cache-control': 'private, no-store' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = correlationId(request);
    try {
      assertExpectedHostname(request, env.EXPECTED_HOSTNAMES);
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') return json(null, { status: 204 });
      if (request.method === 'GET' && url.pathname === '/health') return json({ status: 'ok', service: 'lythaus-admin-api' });
      if (request.method === 'GET' && url.pathname === '/internal/readiness/database-identity') {
        if (!hasReadinessAuthorization(request, env)) return new Response(null, { status: 404 });
        const [admin, privacy] = await Promise.all([
          inspectDatabaseIdentity(env.DB_ADMIN_FRESH, databaseExpectationsFromEnv(env)),
          inspectDatabaseIdentity(env.DB_PRIVACY_FRESH, databaseExpectationsFromEnv(env)),
        ]);
        const readiness = admin.readiness === 'pass' && privacy.readiness === 'pass' ? 'pass' : 'fail';
        return json({
          service: 'lythaus-admin-api',
          databases: {
            admin: databaseReadinessResponse(admin, env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true'),
            privacy: databaseReadinessResponse(privacy, env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true'),
          },
          branchFingerprint: 'unknown',
          readiness,
          readyForAuthentication: env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true' && readiness === 'pass' && admin.budgetLedgerApplied && privacy.budgetLedgerApplied,
        }, { headers: { 'cache-control': 'private, no-store' } });
      }
      const actor = await requireAdmin(request, env);
      if (request.method === 'GET' && url.pathname === '/api/admin/health') {
        const result = await query(env.DB_ADMIN_FRESH, `SELECT current_timestamp AS database_time`);
        return json({ status: 'ok', database: result.rows[0] }, { headers: { 'x-correlation-id': id, 'cache-control': 'private, no-store' } });
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/privacy/requests') {
        const result = await query(env.DB_PRIVACY_FRESH, `SELECT id, subject_id, request_type, state, created_at FROM privacy.requests ORDER BY created_at DESC LIMIT 100`);
        return json({ items: result.rows }, { headers: { 'x-correlation-id': id, 'cache-control': 'private, no-store' } });
      }
      const moderation = url.pathname.match(/^\/api\/admin\/moderation\/cases\/([^/]+)\/decision$/);
      if (request.method === 'POST' && moderation) return await decideModeration(request, env, actor, moderation[1], id);
      const accountStatus = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
      if (request.method === 'POST' && accountStatus) return await updateAccountStatus(request, env, actor, accountStatus[1], id);
      return json({ error: 'not_found', correlationId: id }, { status: 404 });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'admin_request_failed';
      logEvent({ service: 'lythaus-admin-api', correlationId: id, errorCode: code, route: new URL(request.url).pathname });
      const unauthorized = ['access_required', 'access_assertion_invalid', 'access_subject_missing', 'access_verification_not_configured', 'admin_role_required', 'admin_subject_key_not_configured'].includes(code);
      return json({ error: code, correlationId: id }, { status: unauthorized ? 401 : 400 });
    }
  },
};
