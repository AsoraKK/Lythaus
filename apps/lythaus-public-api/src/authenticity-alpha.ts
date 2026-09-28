import { query, reserveBudget, transaction, type BudgetConfig, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { createPresignedPutUrl } from '@lythaus/media';
import { uuidv7 } from '@lythaus/security';
import {
  authorPrivateAlphaView,
  PRIVATE_ALPHA_CONSENT,
  PRIVATE_ALPHA_LIMITS,
  PRIVATE_ALPHA_POLICY,
  PRIVATE_ALPHA_VERSION,
  type AlphaContentKind,
  type PrivateAlphaResult,
} from '../../../packages/authenticity/src/private-alpha.ts';
import { readBoundedBytes } from '../../../packages/authenticity/src/beta.ts';
import { readBetaConfig } from '../../../packages/authenticity/src/beta-config.ts';
import { sha256Hex } from '../../../packages/authenticity/src/forensics.ts';
import { validateMediaPayload } from '../../../packages/authenticity/src/media-intake.ts';

type AlphaEnv = EnvBindings & { DB_APP_FRESH: HyperdriveBinding };
type AlphaRow = {
  case_id: string;
  owner_id: string;
  content_kind: AlphaContentKind;
  text_body: string | null;
  input_hash: string;
  content_type: string;
  upload_session_id: string | null;
  original_key: string | null;
  original_etag: string | null;
  revision: number;
  state: string;
  result: PrivateAlphaResult | null;
  components: Record<string, unknown>;
  review_state: string;
  observer_requested: boolean;
  explanation_requested: boolean;
  advice_attempts: number;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  deleted_at?: Date | null;
};

const privateJson = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
});

function appBudget(env: AlphaEnv): BudgetConfig {
  if (env.COST_BUDGET_ENABLED !== 'true') throw new Error('alpha_budget_paused');
  const values = [
    env.COST_BUDGET_LIMIT_USD,
    env.COST_BUDGET_WARNING_USD,
    env.COST_BUDGET_OPTIONAL_ANALYSIS_USD,
    env.COST_BUDGET_ESSENTIAL_ONLY_USD,
    env.COST_BUDGET_DEEP_SCAN_STOP_USD,
  ].map(Number);
  if (values.some((value) => !Number.isFinite(value))) throw new Error('alpha_budget_paused');
  return {
    limitUsd: values[0],
    warningUsd: values[1],
    optionalAnalysisUsd: values[2],
    essentialOnlyUsd: values[3],
    deepScanStopUsd: values[4],
  };
}

async function body(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(await readBoundedBytes(request.body, 64 * 1024)));
  } catch {
    throw new Error('alpha_input_invalid');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('alpha_input_invalid');
  return parsed as Record<string, unknown>;
}

function contentKind(value: unknown): AlphaContentKind {
  if (value === 'text' || value === 'image' || value === 'text_image') return value;
  throw new Error('alpha_input_invalid');
}

function view(row: AlphaRow) {
  return authorPrivateAlphaView({
    id: row.case_id,
    state: row.state,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    contentKind: row.content_kind,
    result: row.result,
    reviewState: row.review_state,
    textPresent: typeof row.text_body === 'string' && row.text_body.length > 0,
    imagePresent: Boolean(row.original_key || row.upload_session_id),
  });
}

export async function handleAlphaApi(request: Request, env: AlphaEnv, userId: string): Promise<Response> {
  try {
    return await routeAlphaApi(request, env, userId);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const statuses: Record<string, number> = {
      alpha_input_invalid: 400,
      alpha_consent_required: 400,
      alpha_text_invalid: 400,
      alpha_image_invalid: 400,
      alpha_budget_paused: 429,
      alpha_upload_unavailable: 503,
      alpha_upload_expired: 409,
      alpha_checksum_mismatch: 400,
      alpha_case_not_ready: 409,
      alpha_advice_ineligible: 409,
      alpha_advice_attempt_consumed: 409,
      alpha_advice_disabled: 409,
      alpha_not_found: 404,
    };
    return privateJson({ error: statuses[code] ? code : 'alpha_unavailable' }, statuses[code] ?? 503);
  }
}

async function routeAlphaApi(request: Request, env: AlphaEnv, userId: string): Promise<Response> {
  const config = await readBetaConfig(env);
  if (env.AUTHENTICITY_ALPHA_ENABLED !== 'true' || env.AUTHENTICITY_ALPHA_STORAGE_ENABLED !== 'true' || !config.enabled) return privateJson({ error: 'alpha_disabled' }, 404);
  if (!config.allowlist.includes(userId)) return privateJson({ error: 'alpha_disabled' }, 404);
  await expireAlphaCases(env, userId);
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/authenticity\/alpha\/cases(?:\/([0-9a-f-]{36})(?:\/(finalise|feedback|review|cancel|advice|image))?)?$/);
  if (!match) return privateJson({ error: 'alpha_not_found' }, 404);
  const [, caseId, action] = match;

  if (!caseId && request.method === 'GET') {
    const rows = await query<AlphaRow>(env.DB_APP_FRESH, `SELECT * FROM moderation.authenticity_alpha WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`, [userId]);
    return privateJson({ items: rows.rows.map(view) });
  }

  if (!caseId && request.method === 'POST') {
    if (!config.budgetApproval) return privateJson({ error: 'alpha_budget_paused' }, 503);
    const input = await body(request);
    if (input.consentVersion !== PRIVATE_ALPHA_CONSENT || input.trainingConsent !== false) throw new Error('alpha_consent_required');
    const kind = contentKind(input.contentKind);
    const text = input.text === undefined || input.text === null ? null : String(input.text);
    if ((kind === 'text' || kind === 'text_image') && (!text || text.length < 1 || text.length > PRIVATE_ALPHA_LIMITS.maxTextCharacters)) throw new Error('alpha_text_invalid');
    if (kind === 'image' || kind === 'text_image') {
      if (!['image/png', 'image/jpeg'].includes(String(input.contentType)) || !Number.isSafeInteger(input.size) || Number(input.size) < 1 || Number(input.size) > 10 * 1024 * 1024 || typeof input.checksumSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.checksumSha256)) throw new Error('alpha_image_invalid');
    }
    const observerRequested = input.observerRequested === true;
    const explanationRequested = input.explanationRequested === true;
    const id = uuidv7();
    const image = kind !== 'text';
    const hash = image ? String(input.checksumSha256) : await sha256Hex(new TextEncoder().encode(text ?? ''));
    let signed: { url: string; expiresAt: string } | null = null;
    let uploadSessionId: string | null = null;
    let originalKey: string | null = null;
    if (image) {
      if (!env.MEDIA_QUARANTINE || !env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.MEDIA_QUARANTINE_BUCKET) throw new Error('alpha_upload_unavailable');
      uploadSessionId = id;
      originalKey = 'alpha-original/' + userId + '/' + id + '/1';
      signed = await createPresignedPutUrl({
        accountId: env.R2_ACCOUNT_ID,
        bucket: env.MEDIA_QUARANTINE_BUCKET,
        key: 'quarantine/' + userId + '/' + id,
        contentType: input.contentType as 'image/png' | 'image/jpeg',
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        expiresInSeconds: 600,
      });
    }
    const estimate = Number(env.AUTHENTICITY_ALPHA_CASE_ESTIMATE_USD);
    if (!Number.isFinite(estimate) || estimate <= 0) throw new Error('alpha_budget_paused');
    const reservation = await reserveBudget(env.DB_APP_FRESH, {
      period: new Date().toISOString().slice(0, 7),
      operation: 'authenticity_alpha_case',
      operationClass: 'experiment',
      estimatedCostUsd: estimate,
      idempotencyKey: 'alpha:' + id,
      correlationId: id,
      config: appBudget(env),
    });
    if (reservation.status !== 'reserved') return privateJson({ error: 'alpha_budget_paused' }, 429);
    try {
      await transaction(env.DB_APP_FRESH, async (client) => {
        const counts = await client.query<{ total: string; own: string }>(
          `SELECT count(*)::text AS total, count(*) FILTER (WHERE owner_id=$1)::text AS own
             FROM moderation.authenticity_alpha
            WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
          [userId],
        );
        if (Number(counts.rows[0]?.total ?? 0) >= 20 || Number(counts.rows[0]?.own ?? 0) >= 5) throw new Error('alpha_budget_paused');
        if (image) {
          const quota = Number(env.MEDIA_QUOTA_BYTES);
          if (!Number.isSafeInteger(quota) || quota < 1) throw new Error('alpha_upload_unavailable');
          await client.query(`INSERT INTO media.storage_ledger(user_id) VALUES($1) ON CONFLICT DO NOTHING`, [userId]);
          const ledger = await client.query<{ bytes_reserved: string; bytes_approved: string }>(`SELECT bytes_reserved,bytes_approved FROM media.storage_ledger WHERE user_id=$1 FOR UPDATE`, [userId]);
          const requested = Number(input.size);
          if (Number(ledger.rows[0]?.bytes_reserved ?? 0) + Number(ledger.rows[0]?.bytes_approved ?? 0) + requested > quota) throw new Error('alpha_upload_unavailable');
          await client.query(`UPDATE media.storage_ledger SET bytes_reserved=bytes_reserved+$2 WHERE user_id=$1`, [userId, requested]);
          await client.query(`INSERT INTO media.upload_sessions(id,user_id,object_key,content_type,expected_bytes,checksum_sha256,expires_at,purpose) VALUES($1,$2,$3,$4,$5,$6,$7,'authenticity_alpha')`, [uploadSessionId, userId, 'quarantine/' + userId + '/' + id, input.contentType, input.size, hash, signed!.expiresAt]);
        }
        await client.query(`INSERT INTO moderation.cases(id,content_type,content_id,state,policy_version,source_event_id) VALUES($1,$2,$1,'open',$3,$1)`, [id, image ? 'image' : 'text', PRIVATE_ALPHA_POLICY]);
        await client.query(
          `INSERT INTO moderation.authenticity_alpha(case_id,owner_id,content_kind,text_body,input_hash,content_type,upload_session_id,original_key,state,consent_version,observer_requested,explanation_requested,expires_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()+interval '15 minutes')`,
          [id, userId, kind, text, hash, image ? input.contentType : 'text/plain', uploadSessionId, originalKey, image ? 'uploading' : 'queued', PRIVATE_ALPHA_VERSION, observerRequested, explanationRequested],
        );
        await client.query(`UPDATE system.cost_budget_reservations SET status='committed',updated_at=now() WHERE id=$1`, [reservation.id]);
        if (!image) {
          await client.query(
            `INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,actor_id,payload)
             VALUES($1,'moderation.authenticity_alpha.requested','authenticity_alpha_case',$2,$3,$4::jsonb)`,
            [uuidv7(), id, userId, JSON.stringify({ caseId: id, revision: 1, operation: 'analysis' })],
          );
        }
      });
    } catch (error) {
      await query(env.DB_APP_FRESH, `UPDATE system.cost_budget_reservations SET status='released',updated_at=now() WHERE id=$1 AND status='reserved'`, [reservation.id]);
      const code = error instanceof Error ? error.message : '';
      return privateJson({ error: code === 'alpha_budget_paused' ? code : 'alpha_create_failed' }, code === 'alpha_budget_paused' ? 429 : 503);
    }
    return privateJson({ caseId: id, status: image ? 'uploading' : 'queued', ...(signed ? { uploadUrl: signed.url, expiresAt: signed.expiresAt, contentType: input.contentType } : {}) }, 201);
  }

  const found = await query<AlphaRow>(env.DB_APP_FRESH, `SELECT * FROM moderation.authenticity_alpha WHERE case_id=$1 AND owner_id=$2 AND deleted_at IS NULL`, [caseId, userId]);
  const row = found.rows[0];
  if (!row) return privateJson({ error: 'alpha_not_found' }, 404);
  if (request.method === 'GET' && !action) {
    const reviews = await query(env.DB_APP_FRESH, `SELECT id,message,policy_version AS "policyVersion",created_at AS "createdAt" FROM moderation.authenticity_alpha_feedback WHERE case_id=$1 AND kind IN ('review_request','review') ORDER BY created_at LIMIT 50`, [caseId]);
    return privateJson({ ...view(row), reviews: reviews.rows });
  }
  if (request.method === 'GET' && action === 'image') {
    if (!row.original_key || !env.MEDIA_QUARANTINE || ['uploading', 'deleted', 'cancelled', 'expired'].includes(row.state)) return privateJson({ error: 'alpha_image_unavailable' }, 404);
    const object = await env.MEDIA_QUARANTINE.get(row.original_key);
    if (!object) return privateJson({ error: 'alpha_image_unavailable' }, 404);
    return new Response(object.body, { headers: { 'content-type': row.content_type, 'cache-control': 'private, no-store', 'content-security-policy': "default-src 'none'; sandbox" } });
  }
  if (request.method === 'POST' && action === 'finalise') {
    if (!row.upload_session_id || row.state !== 'uploading' || !env.MEDIA_QUARANTINE) throw new Error('alpha_upload_expired');
    const session = await query<{ object_key: string; content_type: string; expected_bytes: string }>(env.DB_APP_FRESH, `SELECT object_key,content_type,expected_bytes FROM media.upload_sessions WHERE id=$1 AND user_id=$2 AND purpose='authenticity_alpha' AND status='pending' AND expires_at>now()`, [row.upload_session_id, userId]);
    if (!session.rows[0]) throw new Error('alpha_upload_expired');
    const source = await env.MEDIA_QUARANTINE.get(session.rows[0].object_key);
    if (!source || source.size !== Number(session.rows[0].expected_bytes)) throw new Error('alpha_image_invalid');
    const bytes = await readBoundedBytes(source.body, 10 * 1024 * 1024);
    if (await sha256Hex(bytes) !== row.input_hash) throw new Error('alpha_checksum_mismatch');
    try { validateMediaPayload({ bytes, declaredMime: session.rows[0].content_type, idempotencyKey: caseId }); } catch { throw new Error('alpha_image_invalid'); }
    const saved = await env.MEDIA_QUARANTINE.put(row.original_key!, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: session.rows[0].content_type } });
    const original = saved ?? await env.MEDIA_QUARANTINE.head(row.original_key!);
    if (!original) throw new Error('alpha_upload_unavailable');
    try {
      await transaction(env.DB_APP_FRESH, async (client) => {
        const changed = await client.query(`UPDATE moderation.authenticity_alpha SET state='queued',original_etag=$3,updated_at=now() WHERE case_id=$1 AND owner_id=$2 AND state='uploading' AND expires_at>now() AND deleted_at IS NULL RETURNING case_id`, [caseId, userId, original.httpEtag]);
        if (changed.rowCount !== 1) throw new Error('alpha_case_not_ready');
        await client.query(`INSERT INTO media.objects(id,owner_id,object_key,content_type,byte_size,sha256,state) VALUES($1,$2,$3,$4,$5,$6,'alpha_private') ON CONFLICT (id) DO NOTHING`, [caseId, userId, row.original_key, session.rows[0].content_type, bytes.length, row.input_hash]);
        await client.query(`INSERT INTO media.ownership(object_id,owner_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [caseId, userId]);
        await client.query(`UPDATE moderation.authenticity_alpha SET object_id=$1 WHERE case_id=$1`, [caseId]);
        await client.query(`UPDATE media.upload_sessions SET status='queued',finalised_at=now(),observed_bytes=$2 WHERE id=$1`, [row.upload_session_id, bytes.length]);
        await client.query(`UPDATE media.storage_ledger SET bytes_reserved=greatest(0,bytes_reserved-$2),bytes_approved=bytes_approved+$2,object_count=object_count+1 WHERE user_id=$1`, [userId, bytes.length]);
        await client.query(`INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,actor_id,payload) VALUES($1,'moderation.authenticity_alpha.requested','authenticity_alpha_case',$2,$3,$4::jsonb)`, [uuidv7(), caseId, userId, JSON.stringify({ caseId, revision: row.revision, operation: 'analysis' })]);
        await client.query(`SELECT privacy.record_alpha_location($1,$2)`, [userId, caseId]);
      });
    } catch (error) {
      if (saved) await env.MEDIA_QUARANTINE.delete(row.original_key!);
      throw error;
    }
    await env.MEDIA_QUARANTINE.delete(session.rows[0].object_key);
    return privateJson({ caseId, status: 'queued' }, 202);
  }
  if (request.method === 'POST' && action === 'advice') {
    if (env.AUTHENTICITY_ALPHA_ADVISER_ENABLED !== 'true' || !config.budgetApproval) throw new Error('alpha_advice_disabled');
    if (!row.result || row.advice_attempts > 0 || row.state === 'deleted') throw new Error(row.advice_attempts > 0 ? 'alpha_advice_attempt_consumed' : 'alpha_advice_ineligible');
    const changed = await query(env.DB_APP_FRESH, `UPDATE moderation.authenticity_alpha SET state='analyzing',advice_attempts=advice_attempts+1,updated_at=now() WHERE case_id=$1 AND owner_id=$2 AND revision=$3 AND result IS NOT NULL AND advice_attempts=0 AND deleted_at IS NULL RETURNING case_id`, [caseId, userId, row.revision]);
    if (!changed.rowCount) throw new Error('alpha_advice_attempt_consumed');
    await query(env.DB_APP_FRESH, `INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,actor_id,payload) VALUES($1,'moderation.authenticity_alpha.requested','authenticity_alpha_case',$2,$3,$4::jsonb)`, [uuidv7(), caseId, userId, JSON.stringify({ caseId, revision: row.revision, operation: 'advice' })]);
    return privateJson({ caseId, status: 'queued', adviser: 'GPT_OSS_PRIVATE_ALPHA_EXPLAINER' }, 202);
  }
  if (request.method === 'POST' && ['feedback', 'review'].includes(action ?? '')) {
    const input = await body(request);
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (!message || message.length > 2000) throw new Error('alpha_input_invalid');
    await transaction(env.DB_APP_FRESH, async (client) => {
      const lock = await client.query(`SELECT case_id FROM moderation.authenticity_alpha WHERE case_id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE`, [caseId, userId]);
      if (!lock.rowCount) throw new Error('alpha_not_found');
      await client.query(`INSERT INTO moderation.authenticity_alpha_feedback(id,case_id,actor_id,kind,message,policy_version) VALUES($1,$2,$3,$4,$5,$6)`, [uuidv7(), caseId, userId, action === 'review' ? 'review_request' : 'feedback', message, PRIVATE_ALPHA_POLICY]);
      if (action === 'review') await client.query(`UPDATE moderation.authenticity_alpha SET review_state='requested',updated_at=now() WHERE case_id=$1`, [caseId]);
    });
    return privateJson({ accepted: true }, 202);
  }
  if (request.method === 'DELETE' || (request.method === 'POST' && action === 'cancel')) {
    const deleting = request.method === 'DELETE';
    await transaction(env.DB_APP_FRESH, async (client) => {
      const locked = await client.query<{ state: string; object_id: string | null; upload_session_id: string | null }>(`SELECT state,object_id,upload_session_id FROM moderation.authenticity_alpha WHERE case_id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE`, [caseId, userId]);
      if (!locked.rows[0]) throw new Error('alpha_not_found');
      const previous = locked.rows[0];
      if (previous.state === 'uploading' && previous.upload_session_id) {
        const upload = await client.query<{ expected_bytes: string }>(`SELECT expected_bytes FROM media.upload_sessions WHERE id=$1 FOR UPDATE`, [previous.upload_session_id]);
        if (upload.rows[0]) await client.query(`UPDATE media.storage_ledger SET bytes_reserved=greatest(0,bytes_reserved-$2) WHERE user_id=$1`, [userId, Number(upload.rows[0].expected_bytes)]);
        await client.query(`UPDATE media.upload_sessions SET status='cancelled' WHERE id=$1 AND status='pending'`, [previous.upload_session_id]);
      }
      if (previous.object_id) {
        const object = await client.query<{ byte_size: string; state: string }>(`SELECT byte_size,state FROM media.objects WHERE id=$1 AND owner_id=$2 FOR UPDATE`, [previous.object_id, userId]);
        if (object.rows[0] && object.rows[0].state !== 'deleted') await client.query(`UPDATE media.storage_ledger SET bytes_approved=greatest(0,bytes_approved-$2),object_count=greatest(0,object_count-1) WHERE user_id=$1`, [userId, Number(object.rows[0].byte_size)]);
      }
      await client.query(`UPDATE moderation.authenticity_alpha SET state=$3,revision=revision+1,lease_token=NULL,lease_until=NULL,deleted_at=CASE WHEN $3='deleted' THEN now() ELSE deleted_at END,purged_at=now(),updated_at=now() WHERE case_id=$1 AND owner_id=$2 AND deleted_at IS NULL`, [caseId, userId, deleting ? 'deleted' : 'cancelled']);
      if (previous.object_id) await client.query(`UPDATE media.objects SET deleted_at=now(),state='deleted' WHERE id=$1 AND owner_id=$2`, [previous.object_id, userId]);
      await client.query(`SELECT privacy.remove_alpha_location($1,$2)`, [userId, caseId]);
    });
    if (row.original_key && env.MEDIA_QUARANTINE) await env.MEDIA_QUARANTINE.delete(row.original_key);
    return privateJson({ caseId, status: deleting ? 'deleted' : 'cancelled' });
  }
  return privateJson({ error: 'alpha_not_found' }, 404);
}

async function expireAlphaCases(env: AlphaEnv, userId: string): Promise<void> {
  await query(env.DB_APP_FRESH, `UPDATE moderation.authenticity_alpha SET state='expired',revision=revision+1,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE owner_id=$1 AND expires_at<=now() AND state IN ('uploading','queued','analyzing','paused')`, [userId]);
}
