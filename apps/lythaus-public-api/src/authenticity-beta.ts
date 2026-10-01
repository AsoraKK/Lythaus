import { query, transaction, reserveBudget, type HyperdriveBinding, type BudgetConfig } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { createPresignedPutUrl } from '@lythaus/media';
import { uuidv7 } from '@lythaus/security';
import { authorBetaView, BETA_LIMITS, BETA_POLICY, BETA_VERSION, readBoundedBytes, type BetaResult, type BetaState } from '../../../packages/authenticity/src/beta.ts';
import { measuredAlphaBudget, readBetaConfig } from '../../../packages/authenticity/src/beta-config.ts';
import { sha256Hex } from '../../../packages/authenticity/src/forensics.ts';
import { validateMediaPayload } from '../../../packages/authenticity/src/media-intake.ts';
import { tombstoneBetaCases, purgeBetaMedia } from '../../../packages/db/src/authenticity-beta.ts';

type BetaEnv = EnvBindings & { DB_APP_FRESH: HyperdriveBinding };
type Row = { case_id: string; state: BetaState; original_key: string; original_etag: string; input_hash: string; revision: number; result: BetaResult | null; review_state: string; created_at: Date; updated_at: Date; expires_at: Date; upload_session_id: string };
const privateJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
const view = (row: Row) => authorBetaView({ id: row.case_id, state: row.state, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), expiresAt: row.expires_at.toISOString(), result: row.result, reviewState: row.review_state });
function appBudget(env: BetaEnv): BudgetConfig {
  if (env.COST_BUDGET_ENABLED !== 'true') throw new Error('beta_budget_paused');
  return { limitUsd: Number(env.COST_BUDGET_LIMIT_USD), warningUsd: Number(env.COST_BUDGET_WARNING_USD), optionalAnalysisUsd: Number(env.COST_BUDGET_OPTIONAL_ANALYSIS_USD), essentialOnlyUsd: Number(env.COST_BUDGET_ESSENTIAL_ONLY_USD), deepScanStopUsd: Number(env.COST_BUDGET_DEEP_SCAN_STOP_USD) };
}
async function body(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(await readBoundedBytes(request.body, 8192))); } catch { throw new Error('beta_input_invalid'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('beta_input_invalid');
  return parsed as Record<string, unknown>;
}
export async function handleBetaApi(request: Request, env: BetaEnv, userId: string): Promise<Response> {
  try { return await routeBetaApi(request,env,userId); } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const errors: Record<string,number> = { beta_input_invalid:400, beta_image_invalid:400, beta_body_limit:413, beta_budget_paused:429, beta_retention_hold:409, beta_revision_changed:409, not_found:404 };
    return privateJson({error: errors[code] ? code : 'beta_unavailable'},errors[code] ?? 503);
  }
}
async function routeBetaApi(request: Request, env: BetaEnv, userId: string): Promise<Response> {
  const config = await readBetaConfig(env);
  if (!config.allowlist.includes(userId) && request.method !== 'DELETE' && !new URL(request.url).pathname.endsWith('/cancel')) return privateJson({ error: 'beta_unavailable' }, 404);
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/authenticity\/cases(?:\/([0-9a-f-]{36})(?:\/(finalise|feedback|review|cancel|image))?)?$/);
  if (!match) return privateJson({ error: 'not_found' }, 404);
  const [, caseId, action] = match;
  if (!config.enabled && request.method === 'POST' && (!caseId || action === 'finalise')) return privateJson({ error: 'beta_paused' }, 503);
  if (!caseId && request.method === 'GET') {
    await expireCases(env, userId);
    const rows = await query<Row>(env.DB_APP_FRESH, `SELECT * FROM moderation.authenticity_beta WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`, [userId]);
    return privateJson({ items: rows.rows.map(view) });
  }
  if (!caseId && request.method === 'POST') {
    let measured;
    try { measured = measuredAlphaBudget(config); } catch { return privateJson({error:'beta_budget_paused'},503); }
    const input = await body(request);
    if (input.consentVersion !== BETA_VERSION || input.trainingConsent !== false) return privateJson({ error: 'beta_processing_consent_required' }, 400);
    if (!['image/png', 'image/jpeg'].includes(String(input.contentType)) || !Number.isSafeInteger(input.size) || Number(input.size) < 1 || Number(input.size) > BETA_LIMITS.bytes || typeof input.checksumSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.checksumSha256)) return privateJson({ error: 'beta_image_invalid' }, 400);
    if (!env.MEDIA_QUARANTINE || !env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.MEDIA_QUARANTINE_BUCKET) return privateJson({ error: 'beta_upload_unavailable' }, 503);
    const id = uuidv7(); const key = `quarantine/${userId}/${id}`;
    const signed = await createPresignedPutUrl({ accountId: env.R2_ACCOUNT_ID, bucket: env.MEDIA_QUARANTINE_BUCKET, key, contentType: input.contentType as 'image/png' | 'image/jpeg', accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, expiresInSeconds: 600 });
    const reservation = await reserveBudget(env.DB_APP_FRESH, { period: new Date().toISOString().slice(0, 7), operation: 'authenticity_beta_case', operationClass: 'experiment', estimatedCostUsd: measured.caseReservationUsd, idempotencyKey: `beta:${id}`, correlationId: id, provider: 'lythaus-authenticity-beta', scope: { operationNames: ['authenticity_alpha_case', 'authenticity_beta_case', 'authenticity_alpha_advice'], limitUsd: measured.authenticityLimitUsd }, config: appBudget(env) });
    if (reservation.status !== 'reserved') return privateJson({ error: 'beta_budget_paused' }, 429);
    try {
      await transaction(env.DB_APP_FRESH, async client => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('authenticity-beta-admission'))`);
        const counts = await client.query<{ total: string; own: string }>(`SELECT count(*)::text AS total, count(*) FILTER (WHERE owner_id=$1)::text AS own FROM moderation.authenticity_beta WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, [userId]);
        if (Number(counts.rows[0].total) >= BETA_LIMITS.totalDaily || Number(counts.rows[0].own) >= BETA_LIMITS.userDaily) throw new Error('beta_daily_limit');
        const quota = Number(env.MEDIA_QUOTA_BYTES);
        if (!Number.isSafeInteger(quota) || quota < 1) throw new Error('beta_storage_unavailable');
        await client.query(`INSERT INTO media.storage_ledger(user_id) VALUES($1) ON CONFLICT DO NOTHING`, [userId]);
        const ledger = await client.query<{ bytes_reserved: string; bytes_approved: string }>(`SELECT bytes_reserved,bytes_approved FROM media.storage_ledger WHERE user_id=$1 FOR UPDATE`, [userId]);
        const storageReservation = Number(input.size) + BETA_LIMITS.displayBytes;
        if (Number(ledger.rows[0].bytes_reserved) + Number(ledger.rows[0].bytes_approved) + storageReservation > quota) throw new Error('beta_storage_limit');
        await client.query(`UPDATE media.storage_ledger SET bytes_reserved=bytes_reserved+$2 WHERE user_id=$1`, [userId,storageReservation]);
        await client.query(`INSERT INTO media.upload_sessions(id,user_id,object_key,content_type,expected_bytes,checksum_sha256,expires_at,purpose) VALUES($1,$2,$3,$4,$5,$6,$7,'authenticity_beta')`, [id,userId,key,input.contentType,input.size,input.checksumSha256,signed.expiresAt]);
        await client.query(`INSERT INTO moderation.cases(id,content_type,content_id,state,policy_version,source_event_id) VALUES($1,'image',$1,'open',$2,$1)`, [id,BETA_POLICY]);
        await client.query(`INSERT INTO moderation.authenticity_beta(case_id,owner_id,upload_session_id,original_key,input_hash,consent_version,expires_at,storage_reserved_bytes) VALUES($1,$2,$1,$3,$4,$5,now()+interval '15 minutes',$6)`, [id,userId,`beta-original/${userId}/${id}/1`,input.checksumSha256,BETA_VERSION,storageReservation]);
        await client.query(`UPDATE system.cost_budget_reservations SET status='committed',actual_cost_usd=NULL,updated_at=now() WHERE id=$1`, [reservation.id]);
      });
    } catch (error) {
      await query(env.DB_APP_FRESH, `UPDATE system.cost_budget_reservations SET status='released' WHERE id=$1 AND status='reserved'`, [reservation.id]);
      const code = error instanceof Error ? error.message : '';
      return privateJson({ error: ['beta_daily_limit','beta_budget_paused','beta_storage_limit','beta_storage_unavailable'].includes(code) ? code : 'beta_create_failed' }, code.includes('limit') || code.includes('paused') ? 429 : 503);
    }
    return privateJson({ caseId: id, uploadUrl: signed.url, expiresAt: signed.expiresAt, status: 'uploading', contentType: input.contentType }, 201);
  }
  await expireCases(env, userId);
  const found = await query<Row>(env.DB_APP_FRESH, `SELECT * FROM moderation.authenticity_beta WHERE case_id=$1 AND owner_id=$2 AND deleted_at IS NULL`, [caseId,userId]);
  const row = found.rows[0]; if (!row) return privateJson({ error: 'not_found' }, 404);
  if (request.method === 'GET' && !action) {
    const reviews=await query(env.DB_APP_FRESH,`SELECT id,message,policy_version AS "policyVersion",created_at AS "createdAt" FROM moderation.authenticity_beta_feedback WHERE case_id=$1 AND kind='review' ORDER BY created_at LIMIT 50`,[caseId]);
    return privateJson({...view(row),reviews:reviews.rows});
  }
  if (request.method === 'GET' && action === 'image') {
    if (!row.result || !['complete','inconclusive','unsupported'].includes(row.state)) return privateJson({ error: 'beta_image_unavailable' }, 404);
    const display = await env.MEDIA_QUARANTINE?.get(`beta-display/${userId}/${caseId}.png`);
    if (!display) return privateJson({ error: 'beta_image_unavailable' }, 404);
    return new Response(display.body, { headers: { 'content-type': 'image/png', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
  }
  if (request.method === 'POST' && action === 'finalise') {
    if (row.state !== 'uploading') return privateJson(view(row));
    const session = await query<{ object_key: string; content_type: string; expected_bytes: string }>(env.DB_APP_FRESH, `SELECT object_key,content_type,expected_bytes FROM media.upload_sessions WHERE id=$1 AND user_id=$2 AND purpose='authenticity_beta' AND status='pending' AND expires_at>now()`, [caseId,userId]);
    if (!session.rows[0] || !env.MEDIA_QUARANTINE) return privateJson({ error: 'beta_upload_expired' }, 409);
    const source = await env.MEDIA_QUARANTINE.get(session.rows[0].object_key);
    if (!source || source.size !== Number(session.rows[0].expected_bytes)) return privateJson({ error: 'beta_upload_invalid' }, 400);
    const bytes = await readBoundedBytes(source.body, BETA_LIMITS.bytes);
    if (await sha256Hex(bytes) !== row.input_hash) return privateJson({ error: 'beta_checksum_mismatch' }, 400);
    try { validateMediaPayload({ bytes, declaredMime: session.rows[0].content_type, idempotencyKey: caseId }); } catch { throw new Error('beta_image_invalid'); }
    const saved = await env.MEDIA_QUARANTINE.put(row.original_key, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: session.rows[0].content_type } });
    const original = saved ?? await env.MEDIA_QUARANTINE.head(row.original_key);
    if (!original) return privateJson({ error: 'beta_original_unavailable' }, 503);
    const eventId = uuidv7();
    try { await transaction(env.DB_APP_FRESH, async client => {
      const changed = await client.query(`UPDATE moderation.authenticity_beta SET state='queued',original_etag=$3,storage_reserved_bytes=storage_reserved_bytes-$4,updated_at=now() WHERE case_id=$1 AND owner_id=$2 AND state='uploading' AND expires_at>now() AND deleted_at IS NULL RETURNING case_id`, [caseId,userId,original.httpEtag,bytes.length]);
      if (changed.rowCount !== 1) throw new Error('beta_revision_changed');
      await client.query(`INSERT INTO media.objects(id,owner_id,object_key,content_type,byte_size,sha256,state) VALUES($1,$2,$3,$4,$5,$6,'beta_private')`, [caseId,userId,row.original_key,session.rows[0].content_type,bytes.length,row.input_hash]);
      await client.query(`INSERT INTO media.ownership(object_id,owner_id) VALUES($1,$2)`, [caseId,userId]);
      await client.query(`UPDATE moderation.authenticity_beta SET object_id=$1 WHERE case_id=$1`, [caseId]);
      await client.query(`UPDATE media.upload_sessions SET status='queued',finalised_at=now(),observed_bytes=$2 WHERE id=$1`, [caseId,bytes.length]);
      await client.query(`UPDATE media.storage_ledger SET bytes_reserved=greatest(0,bytes_reserved-$2),bytes_approved=bytes_approved+$2,object_count=object_count+1 WHERE user_id=$1`, [userId,bytes.length]);
      await client.query(`INSERT INTO system.outbox_events(id,event_type,aggregate_type,aggregate_id,actor_id,payload) VALUES($1,'moderation.authenticity_beta.requested','authenticity_case',$2,$3,$4::jsonb)`, [eventId,caseId,userId,JSON.stringify({caseId,revision:row.revision})]);
      await client.query(`SELECT privacy.record_beta_location($1,$2)`, [userId,caseId]);
    }); } catch (error) {
      const latest = await query<Row & {deleted_at:Date|null}>(env.DB_APP_FRESH,`SELECT * FROM moderation.authenticity_beta WHERE case_id=$1 AND owner_id=$2`,[caseId,userId]);
      if (latest.rows[0]?.deleted_at || ['cancelled','expired'].includes(latest.rows[0]?.state)) await env.MEDIA_QUARANTINE.delete(row.original_key);
      else if (latest.rows[0]?.original_etag === original.httpEtag && latest.rows[0]?.state !== 'uploading') return privateJson(view(latest.rows[0]));
      throw error;
    }
    await env.MEDIA_QUARANTINE.delete(session.rows[0].object_key);
    return privateJson({ caseId, status: 'queued' }, 202);
  }
  if (request.method === 'POST' && ['feedback','review'].includes(action)) {
    const input = await body(request); const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (!message || message.length > 2000) return privateJson({ error: 'beta_feedback_invalid' }, 400);
    await transaction(env.DB_APP_FRESH, async client => {
      const lock = await client.query(`SELECT case_id FROM moderation.authenticity_beta WHERE case_id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE`, [caseId,userId]);
      if (!lock.rowCount) throw new Error('not_found');
      await client.query(`INSERT INTO moderation.authenticity_beta_feedback(id,case_id,actor_id,kind,message,policy_version) VALUES($1,$2,$3,$4,$5,$6)`, [uuidv7(),caseId,userId,action === 'review' ? 'review_request' : 'feedback',message,BETA_POLICY]);
      if (action === 'review') await client.query(`UPDATE moderation.authenticity_beta SET review_state='requested',updated_at=now() WHERE case_id=$1`, [caseId]);
    }); return privateJson({ accepted: true }, 202);
  }
  if (request.method === 'DELETE' || (request.method === 'POST' && action === 'cancel')) {
    const deleting = request.method === 'DELETE';
    if (deleting) {
      await tombstoneBetaCases(env.DB_APP_FRESH,userId,caseId);
      await purgeBetaMedia(env.DB_APP_FRESH,env.MEDIA_QUARANTINE,userId);
    } else await query(env.DB_APP_FRESH, `UPDATE moderation.authenticity_beta SET state='cancelled',revision=revision+1,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE case_id=$1 AND owner_id=$2 AND deleted_at IS NULL`, [caseId,userId]);
    return privateJson({ caseId, status: deleting?'deleted':'cancelled' });
  }
  return privateJson({ error: 'not_found' }, 404);
}
async function expireCases(env: BetaEnv, userId: string) {
  await query(env.DB_APP_FRESH, `UPDATE moderation.authenticity_beta SET state='expired',revision=revision+1,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE owner_id=$1 AND expires_at<=now() AND state IN ('uploading','queued','analyzing','paused')`, [userId]);
}
