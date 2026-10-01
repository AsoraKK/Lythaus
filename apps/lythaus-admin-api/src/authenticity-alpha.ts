import { query, transaction, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { uuidv7 } from '@lythaus/security';
import { authorPrivateAlphaView, PRIVATE_ALPHA_POLICY, type PrivateAlphaResult } from '../../../packages/authenticity/src/private-alpha.ts';
import { SAFE_THRESHOLD } from '../../../packages/authenticity/src/beta.ts';
import { readBetaConfig } from '../../../packages/authenticity/src/beta-config.ts';
import { readBoundedJson } from './request-body-policy.ts';
import type { AdminActor } from './admin-access-runtime-policy.ts';

type Env = EnvBindings & { DB_ADMIN_FRESH: HyperdriveBinding };
type Row = {
  case_id: string;
  owner_id: string;
  content_kind: 'text' | 'image' | 'text_image';
  state: string;
  revision: number;
  review_state: string;
  failure_code: string | null;
  result: PrivateAlphaResult | null;
  components: Record<string, unknown>;
  original_key: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  expires_at: Date | string;
  advice_attempts: number;
};

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
const allowedRoles = ['owner', 'administrator', 'moderator', 'operations'];

function view(row: Row) {
  const result = authorPrivateAlphaView({
    id: row.case_id,
    state: row.state,
    reviewState: row.review_state,
    result: row.result,
    contentKind: row.content_kind,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    textPresent: row.content_kind !== 'image',
    imagePresent: row.content_kind !== 'text',
  });
  return {
    ...result,
    diagnostics: {
      failureCode: row.failure_code,
      revision: row.revision,
      components: row.components,
      safe: row.result?.safe
        ? {
          status: row.result.safe.status,
          rawClassifierScore: row.result.safe.score,
          threshold: SAFE_THRESHOLD,
          checkpoint: row.result.safe.checkpoint,
          preprocessing: row.result.safe.preprocessing,
          preprocessingHash: row.result.safe.preprocessingHash,
          runtimeDigest: row.result.safe.runtimeDigest,
          timings: row.result.safe.timings,
        }
        : null,
      packet: row.result?.packet ?? null,
      explanation: row.result?.explanation ?? null,
    },
  };
}

export async function handleAdminAlpha(request: Request, env: Env, actor: AdminActor): Promise<Response> {
  try {
    return await routeAdminAlpha(request, env, actor);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'admin_role_required' ? 403 : code === 'alpha_advice_ineligible' || code === 'alpha_attempt_consumed' ? 409 : 503;
    return json({ error: ['admin_role_required', 'alpha_advice_ineligible', 'alpha_attempt_consumed'].includes(code) ? code : 'alpha_admin_unavailable' }, status);
  }
}

async function routeAdminAlpha(request: Request, env: Env, actor: AdminActor): Promise<Response> {
  if (!allowedRoles.includes(actor.role)) return json({ error: 'admin_role_required' }, 403);
  const match = new URL(request.url).pathname.match(/^\/api\/admin\/authenticity\/alpha\/cases(?:\/([0-9a-f-]{36})(?:\/(review|advice|image))?)?$/);
  if (!match) return json({ error: 'not_found' }, 404);
  const [, caseId, action] = match;
  if (!caseId && request.method === 'GET') {
    await query(env.DB_ADMIN_FRESH, `INSERT INTO system.audit_events(id,actor_id,action,target_type,reason_code,correlation_id,metadata) VALUES($1,$2,'authenticity.alpha.list','authenticity_alpha_case','ADMIN_ACCESS',$1::uuid::text,$3::jsonb)`, [uuidv7(), actor.userId, JSON.stringify({ role: actor.role })]);
    const rows = await query<Row>(env.DB_ADMIN_FRESH, `SELECT * FROM moderation.authenticity_alpha WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`);
    return json({ items: rows.rows.map(view) });
  }
  if (!caseId) return json({ error: 'not_found' }, 404);
  const found = await query<Row>(env.DB_ADMIN_FRESH, `SELECT * FROM moderation.authenticity_alpha WHERE case_id=$1 AND deleted_at IS NULL`, [caseId]);
  const row = found.rows[0];
  if (!row) return json({ error: 'not_found' }, 404);
  if (request.method === 'GET') {
    await query(env.DB_ADMIN_FRESH, `INSERT INTO system.audit_events(id,actor_id,action,target_type,target_id,reason_code,correlation_id,metadata) VALUES($1,$2,'authenticity.alpha.read','authenticity_alpha_case',$3,'ADMIN_ACCESS',$3::uuid::text,$4::jsonb)`, [uuidv7(), actor.userId, caseId, JSON.stringify({ role: actor.role, view: action === 'image' ? 'image' : 'diagnostics' })]);
    if (action === 'image') {
      if (!row.original_key || !env.MEDIA_QUARANTINE) return json({ error: 'image_unavailable' }, 404);
      const object = await env.MEDIA_QUARANTINE.get(row.original_key);
      if (!object) return json({ error: 'image_unavailable' }, 404);
      return new Response(object.body, { headers: { 'content-type': row.result?.safe?.facts?.mime ?? 'application/octet-stream', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
    }
    const feedback = await query(env.DB_ADMIN_FRESH, `SELECT id,kind,message,policy_version,ground_truth,training_consent,created_at FROM moderation.authenticity_alpha_feedback WHERE case_id=$1 ORDER BY created_at LIMIT 100`, [caseId]);
    return json({ ...view(row), feedback: feedback.rows });
  }
  if (request.method !== 'POST' || !['review', 'advice'].includes(action ?? '')) return json({ error: 'not_found' }, 404);
  const input = await readBoundedJson<{ message?: unknown }>(request);
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  if (!message || message.length > 2000) return json({ error: 'review_explanation_required' }, 400);
  if (action === 'advice') {
    const config = await readBetaConfig(env);
    if (!config.enabled || !config.allowlist.includes(row.owner_id) || env.AUTHENTICITY_ALPHA_ADVISER_ENABLED !== 'true' || !config.budgetApproval) return json({ error: 'alpha_paused' }, 409);
  }
  await transaction(env.DB_ADMIN_FRESH, async (client) => {
    const current = await client.query<Row>(`SELECT * FROM moderation.authenticity_alpha WHERE case_id=$1 AND deleted_at IS NULL FOR UPDATE`, [caseId]);
    if (!current.rows[0]) throw new Error('alpha_not_found');
    if (action === 'advice') {
      if (!current.rows[0].result) throw new Error('alpha_advice_ineligible');
      const changed = await client.query(`UPDATE moderation.authenticity_alpha SET state='analyzing',advice_attempts=advice_attempts+1,updated_at=now() WHERE case_id=$1 AND state IN ('complete','inconclusive','unsupported','failed') AND advice_attempts=0 AND attempts<3 AND expires_at>now() AND lease_token IS NULL RETURNING revision`, [caseId]);
      if (!changed.rowCount) throw new Error('alpha_attempt_consumed');
      await client.query(`INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,actor_id,payload) VALUES($1,'moderation.authenticity_alpha.requested','authenticity_alpha_case',$2,$3,$4::jsonb)`, [uuidv7(), caseId, row.owner_id, JSON.stringify({ caseId, revision: changed.rows[0].revision, operation: 'advice' })]);
    } else {
      await client.query(`INSERT INTO moderation.authenticity_alpha_feedback(id,case_id,actor_id,kind,message,policy_version) VALUES($1,$2,$3,'review',$4,$5)`, [uuidv7(), caseId, actor.userId, message, PRIVATE_ALPHA_POLICY]);
      await client.query(`UPDATE moderation.authenticity_alpha SET review_state='reviewed',updated_at=now() WHERE case_id=$1`, [caseId]);
    }
    await client.query(`INSERT INTO system.audit_events(id,actor_id,action,target_type,target_id,reason_code,correlation_id,metadata) VALUES($1,$2,$3,'authenticity_alpha_case',$4,'ALPHA_NON_ENFORCING',$4::uuid::text,$5::jsonb)`, [uuidv7(), actor.userId, `authenticity.alpha.${action}`, caseId, JSON.stringify({ role: actor.role, policyVersion: PRIVATE_ALPHA_POLICY })]);
  });
  return json({ accepted: true, publicationEligible: false, rewardsEligible: false }, 202);
}
