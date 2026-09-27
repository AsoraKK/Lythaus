import { query, transaction, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { uuidv7 } from '@lythaus/security';
import { BETA_ADVISER, BETA_ADVISER_ROLE, BETA_LIMITS, BETA_VERSION, SAFE_CHECKPOINT, SAFE_PREPROCESSING, assertSafeResult, betaAdviceRequest, betaReuseKey, compileBetaResult, parseBetaAdvice, readBoundedBytes, type BetaResult, type SafeResult } from '../../../packages/authenticity/src/beta.ts';
import { readBetaConfig } from '../../../packages/authenticity/src/beta-config.ts';
import { sha256Hex } from '../../../packages/authenticity/src/forensics.ts';
import { validateMediaPayload } from '../../../packages/authenticity/src/media-intake.ts';
import { createOpenAIModerationProvider } from '../../../packages/authenticity/src/openai-moderation.ts';
import type { ModerationAnalysis } from '../../../packages/authenticity/src/moderation.ts';
import { assertUuidV7, type UUIDv7 } from '../../../packages/authenticity/src/uuid.ts';

type Env = EnvBindings & { DB_JOBS_FRESH: HyperdriveBinding };
interface CaseRow { case_id: UUIDv7; owner_id: string; revision: number; original_key: string; original_etag: string; input_hash: string; content_type: string; byte_size: string; lease_token: string; result: BetaResult | null }
interface StepRow { id: string; state: string; output: unknown; reuse_key: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fence = `case_id=$1 AND revision=$2 AND lease_token=$3 AND lease_until>now() AND expires_at>now() AND deleted_at IS NULL AND state='analyzing'`;

async function current(env: Env, row: CaseRow): Promise<void> {
  const config = await readBetaConfig(env);
  if (!config.enabled || !config.allowlist.includes(row.owner_id)) throw new Error('beta_paused');
  if (env.COST_BUDGET_ENABLED !== 'true' || !config.budgetApproval) throw new Error('beta_paused');
  const budget = await query(env.DB_JOBS_FRESH,`SELECT id FROM system.cost_budget_reservations WHERE operation='authenticity_beta_case' AND correlation_id=$1 AND status IN ('committed','reconciled') AND NOT EXISTS(SELECT 1 FROM system.cost_kill_switches WHERE enabled AND key=ANY($2::text[]))`,[row.case_id,['global','authenticity','operation:authenticity_beta_case','provider:lythaus-safe-container','provider:cloudflare-workers-ai','provider:openai']]);
  if (!budget.rowCount) throw new Error('beta_paused');
  const failures = await query<{count:string}>(env.DB_JOBS_FRESH, `SELECT count(DISTINCT case_id)::text AS count FROM moderation.authenticity_beta_steps WHERE step='safe' AND state='ambiguous' AND completed_at>now()-interval '15 minutes'`);
  if (Number(failures.rows[0]?.count ?? 0) >= 3) throw new Error('beta_paused');
  const result = await query(env.DB_JOBS_FRESH, `SELECT case_id FROM moderation.authenticity_beta WHERE ${fence}`, [row.case_id,row.revision,row.lease_token]);
  if (!result.rowCount) throw new Error('beta_stale');
}

async function step<T>(env: Env, row: CaseRow, name: 'safety' | 'safe' | 'advice', reuseKey: string, execute: (runId: string) => Promise<T>): Promise<T> {
  await current(env, row);
  const started = await transaction(env.DB_JOBS_FRESH, async client => {
    const valid = await client.query(`SELECT case_id FROM moderation.authenticity_beta WHERE ${fence} FOR UPDATE`, [row.case_id,row.revision,row.lease_token]);
    if (!valid.rowCount) throw new Error('beta_stale');
    const old = await client.query<StepRow>(`SELECT id,state,output,reuse_key FROM moderation.authenticity_beta_steps WHERE case_id=$1 AND step=$2 ORDER BY started_at DESC LIMIT 1`, [row.case_id,name]);
    if (old.rows[0]) {
      if (old.rows[0].state === 'completed' && old.rows[0].output !== null && old.rows[0].reuse_key === reuseKey) return old.rows[0];
      throw new Error('beta_attempt_consumed');
    }
    const id = uuidv7();
    await client.query(`INSERT INTO moderation.authenticity_beta_steps(id,case_id,revision,step,state,reuse_key,reservation_id) VALUES($1,$2::uuid,$3,$4,'started',$5,(SELECT id FROM system.cost_budget_reservations WHERE correlation_id=$2::uuid::text AND operation='authenticity_beta_case' LIMIT 1))`, [id,row.case_id,row.revision,name,reuseKey]);
    return { id, state: 'started', output: null, reuse_key: reuseKey };
  });
  if (started.state === 'completed') return started.output as T;
  try {
    const result = await execute(started.id);
    await current(env, row);
    await transaction(env.DB_JOBS_FRESH, async client => {
      const valid = await client.query(`SELECT case_id FROM moderation.authenticity_beta WHERE ${fence} FOR UPDATE`, [row.case_id,row.revision,row.lease_token]);
      if (!valid.rowCount) throw new Error('beta_stale');
      await client.query(`UPDATE moderation.authenticity_beta_steps SET state='completed',output=$2::jsonb,completed_at=now() WHERE id=$1 AND state='started'`, [started.id,JSON.stringify(result)]);
      if (name === 'safe') await client.query(`INSERT INTO moderation.detector_runs(id,content_type,content_id,provider,model_version,signal) VALUES($1,'image',$2,'lythaus-safe-container',$3,$4::jsonb) ON CONFLICT(id) DO NOTHING`,[started.id,row.case_id,SAFE_CHECKPOINT,JSON.stringify(result)]);
    });
    return result;
  } catch {
    await query(env.DB_JOBS_FRESH, `UPDATE moderation.authenticity_beta_steps SET state='ambiguous',error_code='ATTEMPT_CONSUMED',completed_at=now() WHERE id=$1 AND state='started'`, [started.id]);
    throw new Error('beta_attempt_consumed');
  }
}

async function saveResult(env: Env, row: CaseRow, result: BetaResult, terminal: boolean): Promise<void> {
  await current(env,row);
  const saved = await query(env.DB_JOBS_FRESH, `UPDATE moderation.authenticity_beta SET result=$4::jsonb,state=CASE WHEN $5 THEN $6 ELSE state END,updated_at=now(),lease_token=CASE WHEN $5 THEN NULL ELSE lease_token END,lease_until=CASE WHEN $5 THEN NULL ELSE lease_until END WHERE ${fence}`, [row.case_id,row.revision,row.lease_token,JSON.stringify(result),terminal,result.status]);
  if (!saved.rowCount) throw new Error('beta_stale');
}

export async function processBetaEvent(env: Env, eventId: string, payload: unknown): Promise<void> {
  const value = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (!uuid.test(eventId) || typeof value.caseId !== 'string' || !uuid.test(value.caseId) || !Number.isSafeInteger(value.revision)) throw new Error('beta_event_invalid');
  const authentic = await query(env.DB_JOBS_FRESH, `SELECT e.id FROM system.outbox_events e JOIN moderation.authenticity_beta b ON b.case_id=e.aggregate_id::uuid WHERE e.id=$1 AND e.event_type='moderation.authenticity_beta.requested' AND e.aggregate_type='authenticity_case' AND e.actor_id=b.owner_id AND e.payload->>'caseId'=$2 AND e.payload->>'revision'=$3`, [eventId,value.caseId,String(value.revision)]);
  if (!authentic.rowCount) {
    await query(env.DB_JOBS_FRESH, `INSERT INTO system.audit_events(id,action,target_type,target_id,reason_code,correlation_id,metadata) VALUES($1,'authenticity.beta.job.rejected','authenticity_case',$2,'FORGED_EVENT',$3,'{}')`, [uuidv7(),value.caseId,eventId]);
    return;
  }
  const row = await transaction(env.DB_JOBS_FRESH, async client => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('authenticity-beta-runtime'))`);
    const busy = await client.query(`SELECT case_id FROM moderation.authenticity_beta WHERE lease_until>now() AND state='analyzing' LIMIT 1`);
    if (busy.rowCount) throw new Error('beta_runtime_busy');
    const result = await client.query<CaseRow>(`UPDATE moderation.authenticity_beta SET state='analyzing',lease_token=$3,lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now() WHERE case_id=$1 AND revision=$2 AND deleted_at IS NULL AND expires_at>now() AND state IN ('queued','analyzing') AND attempts<3 RETURNING *`, [value.caseId,value.revision,uuidv7()]);
    return result.rows[0];
  });
  if (!row) return;
  assertUuidV7(row.case_id);
  let result = row.result;
  try {
    await current(env,row);
    const config = await readBetaConfig(env);
    const objectRecord = await query<{ content_type: string; byte_size: string }>(env.DB_JOBS_FRESH, `SELECT content_type,byte_size FROM media.objects WHERE id=$1 AND owner_id=$2 AND object_key=$3 AND sha256=$4 AND deleted_at IS NULL AND state='beta_private'`, [row.case_id,row.owner_id,row.original_key,row.input_hash]);
    const record = objectRecord.rows[0];
    if (!record || !env.MEDIA_QUARANTINE) throw new Error('beta_original_unavailable');
    const object = await env.MEDIA_QUARANTINE.get(row.original_key);
    if (!object || object.httpEtag !== row.original_etag || object.size !== Number(record.byte_size)) throw new Error('beta_original_changed');
    const bytes = await readBoundedBytes(object.body,BETA_LIMITS.bytes);
    if (await sha256Hex(bytes) !== row.input_hash) throw new Error('beta_original_changed');
    const preflight = validateMediaPayload({ bytes, declaredMime: record.content_type, idempotencyKey: row.case_id });
    const reuseKey = await betaReuseKey(row.owner_id,row.input_hash,config.runtimeDigest,config.preprocessingHash);
    const safety = await step<ModerationAnalysis>(env,row,'safety',reuseKey,async () => createOpenAIModerationProvider({ apiKey: env.OPENAI_API_KEY, timeoutMs: 15000, maxImageBytes: BETA_LIMITS.bytes, flaggedResult: 'REVIEW' }).analyseImage({ caseId: row.case_id, mime: preflight.mime, bytes }));
    await query(env.DB_JOBS_FRESH, `UPDATE moderation.authenticity_beta SET safety=$4::jsonb,updated_at=now() WHERE ${fence}`, [row.case_id,row.revision,row.lease_token,JSON.stringify(safety)]);
    if (safety.result !== 'ALLOW') {
      await query(env.DB_JOBS_FRESH, `UPDATE moderation.authenticity_beta SET state=$4,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE ${fence}`, [row.case_id,row.revision,row.lease_token,safety.result === 'BLOCK' ? 'safety_blocked' : 'safety_review']);
      return;
    }
    const disabled = !config.rightsApproval ? 'BLOCKED_RIGHTS' : !config.runtimeApproval || !config.safeEnabled || !env.AUTHENTICITY_BETA_CONTAINER || !env.AUTHENTICITY_BETA_DISPATCH_SECRET ? 'BLOCKED_RUNTIME' : null;
    if (disabled) {
      await query(env.DB_JOBS_FRESH, `UPDATE moderation.authenticity_beta SET state='paused',failure_code=$4,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE ${fence}`, [row.case_id,row.revision,row.lease_token,disabled]);
      return;
    }
    if (result && (result.schemaVersion !== BETA_VERSION || result.safe.runtimeDigest !== config.runtimeDigest || result.safe.preprocessingHash !== config.preprocessingHash)) throw new Error('beta_attempt_consumed');
    if (!result) {
      const safe = await step<SafeResult>(env,row,'safe',reuseKey,async runId => {
        const active = await readBetaConfig(env);
        if (!active.safeEnabled || !active.rightsApproval) throw new Error('beta_paused');
        const binding = { caseId: row.case_id, runId, inputHash: row.input_hash, revision: row.revision };
        const response = await env.AUTHENTICITY_BETA_CONTAINER!.getByName('safe-a-beta-v1').fetch(new Request('http://safe/infer', { method: 'POST', headers: { 'authorization': `Bearer ${env.AUTHENTICITY_BETA_DISPATCH_SECRET}`, 'content-type': preflight.mime, 'x-beta-binding': JSON.stringify(binding) }, body: bytes, signal: AbortSignal.timeout(BETA_LIMITS.inferenceMs + BETA_LIMITS.decodeMs + 75000) }));
        if (!response.ok) throw new Error('beta_runtime_failed');
        const received = JSON.parse(new TextDecoder().decode(await readBoundedBytes(response.body,8*1024*1024))) as { result: SafeResult; display?: string };
        assertSafeResult(received.result,{ ...binding, runtimeDigest: active.runtimeDigest, preprocessingHash: active.preprocessingHash });
        if (received.result.status === 'OK' && !received.result.forensics) throw new Error('beta_forensics_missing');
        if (received.result.facts) received.result.facts.sourceHistory = active.sourceHistoryHashes.includes(row.input_hash) ? 'DOCUMENTED_LOSSLESS' : 'UNKNOWN';
        if (received.display) {
          if (!/^[A-Za-z0-9+/=]+$/.test(received.display) || received.display.length>6*1024*1024) throw new Error('beta_display_invalid');
          const display = Uint8Array.from(atob(received.display),c=>c.charCodeAt(0));
          if (display.length>BETA_LIMITS.displayBytes || ![137,80,78,71,13,10,26,10].every((v,i)=>display[i]===v)) throw new Error('beta_display_invalid');
          const key = `beta-display/${row.owner_id}/${row.case_id}.png`;
          await current(env,row);
          await env.MEDIA_QUARANTINE!.put(key,display,{httpMetadata:{contentType:'image/png'}});
          try { await current(env,row); } catch (error) { await env.MEDIA_QUARANTINE!.delete(key); throw error; }
          await transaction(env.DB_JOBS_FRESH,async client=>{
            const locked=await client.query<{storage_reserved_bytes:string;display_bytes:string}>(`SELECT storage_reserved_bytes,display_bytes FROM moderation.authenticity_beta WHERE ${fence} FOR UPDATE`,[row.case_id,row.revision,row.lease_token]);
            if (!locked.rows[0]) throw new Error('beta_stale');
            await client.query(`UPDATE media.storage_ledger SET bytes_reserved=greatest(0,bytes_reserved-$2),bytes_approved=bytes_approved+$3-$4 WHERE user_id=$1`,[row.owner_id,Number(locked.rows[0].storage_reserved_bytes),display.length,Number(locked.rows[0].display_bytes)]);
            await client.query(`UPDATE moderation.authenticity_beta SET storage_reserved_bytes=0,display_bytes=$2 WHERE case_id=$1`,[row.case_id,display.length]);
          });
        }
        return received.result;
      });
      result = compileBetaResult(safe,safety);
      await saveResult(env,row,result,false);
    }
    const adviserConfig = await readBetaConfig(env);
    if (result.route === 'ESCALATE' && result.advisory.status !== 'complete') {
      const recentFailures = await query<{count:string}>(env.DB_JOBS_FRESH, `SELECT count(DISTINCT case_id)::text AS count FROM moderation.authenticity_beta_steps WHERE step='advice' AND state='ambiguous' AND completed_at>now()-interval '15 minutes'`);
      if (!adviserConfig.adviserEnabled || !env.AI || !env.AI_GATEWAY_ID || Number(recentFailures.rows[0]?.count ?? 0) >= 3) result.advisory = { status: 'disabled', role: BETA_ADVISER_ROLE };
      else {
        try {
          const packetKey = await sha256Hex(new TextEncoder().encode(JSON.stringify([result.packet,'lythaus-beta-adviser-v1',BETA_ADVISER])));
          const captured = result;
          const advice = await step(env,row,'advice',packetKey,async () => {
            const request = betaAdviceRequest(captured);
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              const raw = await Promise.race([env.AI!.run(BETA_ADVISER,request,{ gateway: {id:env.AI_GATEWAY_ID!,skipCache:true},collectLog:false }),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('beta_advice_timeout')),BETA_LIMITS.adviceMs);})]);
              return { recommendation: parseBetaAdvice(raw,captured), usage: usage(raw) };
            } finally { if (timer) clearTimeout(timer); }
          });
          result.advisory = { status: 'complete', role: BETA_ADVISER_ROLE, ...advice };
        } catch { result.advisory = { status: 'attempt_consumed', role: BETA_ADVISER_ROLE }; }
      }
    }
    await saveResult(env,row,result,true);
    await query(env.DB_JOBS_FRESH, `UPDATE system.cost_budget_reservations SET measurement=$2::jsonb,billing_state='measured',updated_at=now() WHERE operation='authenticity_beta_case' AND correlation_id=$1`, [row.case_id,JSON.stringify({ schemaVersion:BETA_VERSION,resourceTimings:result.safe.timings,runtimeMeasurements:result.safe.measurements??null,adviserUsage:result.advisory.usage??null,billedUsd:null })]);
  } catch (error) {
    const code = error instanceof Error && ['beta_paused','beta_stale','beta_original_changed','beta_original_unavailable','beta_attempt_consumed'].includes(error.message) ? error.message : 'beta_execution_failed';
    await query(env.DB_JOBS_FRESH, `UPDATE moderation.authenticity_beta SET state=$4,failure_code=$5,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE case_id=$1 AND revision=$2 AND lease_token=$3 AND deleted_at IS NULL`, [row.case_id,row.revision,row.lease_token,code==='beta_paused'?'paused':result?result.status:'failed',code]);
  }
}

function usage(raw: unknown) {
  const value = raw && typeof raw === 'object' ? (raw as Record<string,unknown>).usage : null;
  const record = value && typeof value === 'object' ? value as Record<string,unknown> : {};
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v>=0 ? v : null;
  return { inputTokens: count(record.prompt_tokens ?? record.input_tokens), outputTokens: count(record.completion_tokens ?? record.output_tokens) };
}

export async function expireBetaWork(env: Env): Promise<void> {
  await query(env.DB_JOBS_FRESH, `UPDATE moderation.authenticity_beta SET state='expired',revision=revision+1,lease_token=NULL,lease_until=NULL,failure_code='CASE_DEADLINE',updated_at=now() WHERE expires_at<=now() AND state IN ('uploading','queued','analyzing','paused')`);
  await query(env.DB_JOBS_FRESH, `UPDATE moderation.authenticity_beta SET state='failed',lease_token=NULL,lease_until=NULL,failure_code='RETRY_EXHAUSTED',updated_at=now() WHERE attempts>=3 AND state IN ('queued','analyzing') AND (lease_until IS NULL OR lease_until<now())`);
}
