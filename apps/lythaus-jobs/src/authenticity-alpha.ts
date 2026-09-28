import { query, transaction, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { uuidv7 } from '@lythaus/security';
import {
  attachAlphaObserver,
  alphaReuseKey,
  buildPrivateAlphaExplanationRequest,
  compilePrivateAlphaImage,
  compilePrivateAlphaText,
  parsePrivateAlphaExplanation,
  PRIVATE_ALPHA_LIMITS,
  PRIVATE_ALPHA_VERSION,
  initialAlphaComponents,
  type AlphaComponent,
  type AlphaComponentStatus,
  type AlphaContentKind,
  type PrivateAlphaResult,
} from '../../../packages/authenticity/src/private-alpha.ts';
import { BETA_LIMITS, assertSafeResult, readBoundedBytes, type SafeResult } from '../../../packages/authenticity/src/beta.ts';
import { readBetaConfig } from '../../../packages/authenticity/src/beta-config.ts';
import { buildEvidencePacket } from '../../../packages/authenticity/src/evidence-packet.ts';
import { applyWp005aRoutingGate, compileEpistemicLedger } from '../../../packages/authenticity/src/epistemic-compiler.ts';
import { sha256Hex } from '../../../packages/authenticity/src/forensics.ts';
import { createOpenAIModerationProvider } from '../../../packages/authenticity/src/openai-moderation.ts';
import { validateMediaPayload } from '../../../packages/authenticity/src/media-intake.ts';
import { createCloudflareVisionObserver, type VisionObserverResult } from '../../../packages/authenticity/src/vision-observer.ts';
import { selectResolutionRoute } from '../../../packages/authenticity/src/resolution-gate.ts';
import type { ModerationAnalysis } from '../../../packages/authenticity/src/moderation.ts';

type AlphaEnv = EnvBindings & { DB_JOBS_FRESH: HyperdriveBinding };
type AlphaRow = {
  case_id: string;
  owner_id: string;
  content_kind: AlphaContentKind;
  text_body: string | null;
  input_hash: string;
  content_type: string;
  original_key: string | null;
  original_etag: string | null;
  revision: number;
  state: string;
  result: PrivateAlphaResult | null;
  components: Record<AlphaComponent, AlphaComponentStatus>;
  observer_requested: boolean;
  explanation_requested: boolean;
  lease_token: string;
};
type StepRow = { id: string; state: string; output: unknown; reuse_key: string };

const UUID = /^[0-9a-f-]{36}$/i;
const fence = "case_id=$1 AND revision=$2 AND lease_token=$3 AND lease_until>now() AND expires_at>now() AND deleted_at IS NULL AND state='analyzing'";

async function active(env: AlphaEnv, row: AlphaRow): Promise<void> {
  const config = await readBetaConfig(env);
  if (env.AUTHENTICITY_ALPHA_ENABLED !== 'true' || env.COST_BUDGET_ENABLED !== 'true' || !config.enabled || !config.budgetApproval || !config.allowlist.includes(row.owner_id)) throw new Error('alpha_paused');
  const reservation = await query(env.DB_JOBS_FRESH, "SELECT id FROM system.cost_budget_reservations WHERE operation='authenticity_alpha_case' AND correlation_id=$1 AND status IN ('committed','reconciled') AND NOT EXISTS (SELECT 1 FROM system.cost_kill_switches WHERE enabled AND key=ANY($2::text[]))", [row.case_id, ['global', 'authenticity', 'operation:authenticity_alpha_case', 'provider:lythaus-safe-container', 'provider:cloudflare-workers-ai', 'provider:openai']]);
  if (!reservation.rowCount) throw new Error('alpha_paused');
  const current = await query(env.DB_JOBS_FRESH, "SELECT case_id FROM moderation.authenticity_alpha WHERE " + fence, [row.case_id, row.revision, row.lease_token]);
  if (!current.rowCount) throw new Error('alpha_stale');
}

async function step<T>(env: AlphaEnv, row: AlphaRow, component: AlphaComponent, reuseKey: string, execute: (runId: string) => Promise<T>): Promise<T> {
  await active(env, row);
  const started = await transaction(env.DB_JOBS_FRESH, async (client) => {
    const valid = await client.query("SELECT case_id FROM moderation.authenticity_alpha WHERE " + fence + " FOR UPDATE", [row.case_id, row.revision, row.lease_token]);
    if (!valid.rowCount) throw new Error('alpha_stale');
    const old = await client.query<StepRow>("SELECT id,state,output,reuse_key FROM moderation.authenticity_alpha_steps WHERE case_id=$1 AND revision=$2 AND component=$3 ORDER BY started_at DESC LIMIT 1", [row.case_id, row.revision, component]);
    if (old.rows[0]) {
      if (old.rows[0].state === 'completed' && old.rows[0].output !== null && old.rows[0].reuse_key === reuseKey) return old.rows[0];
      throw new Error('alpha_attempt_consumed');
    }
    const id = uuidv7();
    await client.query("INSERT INTO moderation.authenticity_alpha_steps(id,case_id,revision,component,state,reuse_key) VALUES($1,$2,$3,$4,'started',$5)", [id, row.case_id, row.revision, component, reuseKey]);
    return { id, state: 'started', output: null, reuse_key: reuseKey };
  });
  if (started.state === 'completed') return started.output as T;
  try {
    const result = await execute(started.id);
    await active(env, row);
    await transaction(env.DB_JOBS_FRESH, async (client) => {
      const valid = await client.query("SELECT case_id FROM moderation.authenticity_alpha WHERE " + fence + " FOR UPDATE", [row.case_id, row.revision, row.lease_token]);
      if (!valid.rowCount) throw new Error('alpha_stale');
      await client.query("UPDATE moderation.authenticity_alpha_steps SET state='completed',output=$2::jsonb,completed_at=now() WHERE id=$1 AND state='started'", [started.id, JSON.stringify(result)]);
    });
    return result;
  } catch (error) {
    await query(env.DB_JOBS_FRESH, "UPDATE moderation.authenticity_alpha_steps SET state='ambiguous',error_code='ATTEMPT_CONSUMED',completed_at=now() WHERE id=$1 AND state='started'", [started.id]);
    throw error instanceof Error && ['alpha_stale', 'alpha_paused', 'alpha_attempt_consumed'].includes(error.message) ? error : new Error('alpha_attempt_consumed');
  }
}

function setComponent(result: PrivateAlphaResult, component: AlphaComponent, update: Partial<AlphaComponentStatus>): void {
  result.components[component] = { ...result.components[component], ...update };
}

function noSafeResult(input: { row: AlphaRow; moderation: ModerationAnalysis | null; observer?: VisionObserverResult | null; failed: boolean }): PrivateAlphaResult {
  const packet = buildEvidencePacket({
    runId: input.row.case_id,
    caseId: input.row.case_id,
    sampleId: input.row.case_id,
    sourceFamilyId: input.row.case_id,
    preflight: { inputHash: input.row.input_hash, mime: input.row.content_type, dimensions: null },
    moderation: input.moderation,
    observer: input.observer,
    failedComponents: ['SAFE-A'],
  });
  const ledger = compileEpistemicLedger(packet);
  const compilerGate = applyWp005aRoutingGate(packet, 'SELECTIVE_RESOLUTION_GATE');
  return {
    schemaVersion: PRIVATE_ALPHA_VERSION,
    policyVersion: 'lythaus-private-alpha-policy-v1',
    contentKind: input.row.content_kind,
    status: input.failed ? 'failed' : 'inconclusive',
    finding: input.failed ? 'UNAVAILABLE' : 'INCONCLUSIVE',
    interpretation: input.failed ? 'unavailable' : 'inconclusive',
    support: 'UNSUPPORTED',
    components: input.row.components,
    moderation: { text: null, image: input.moderation },
    safe: null,
    packet,
    ledger,
    compilerGate,
    route: selectResolutionRoute({ directionalEvidenceCount: 0, supportedHypothesesCount: 0, contradictedHypothesesCount: 0, contradictoryEvidenceCount: 0, contradictoryObservationsCount: 0 }, 'SELECTIVE_RESOLUTION_GATE') === 'ESCALATE' ? 'ESCALATE' : 'DETERMINISTIC',
    explanation: { status: 'not_requested', role: 'GPT_OSS_PRIVATE_ALPHA_EXPLAINER' },
    publicationEligible: false,
    authenticityEnforcementEnabled: false,
    rewardsEligible: false,
  };
}

function usage(raw: unknown) {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).usage : null;
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const count = (candidate: unknown) => typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : null;
  return { inputTokens: count(record.prompt_tokens ?? record.input_tokens), outputTokens: count(record.completion_tokens ?? record.output_tokens) };
}

export async function processAlphaEvent(env: AlphaEnv, eventId: string, payload: unknown): Promise<void> {
  const value = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (!UUID.test(eventId) || typeof value.caseId !== 'string' || !UUID.test(value.caseId) || !Number.isSafeInteger(value.revision)) throw new Error('alpha_event_invalid');
  const operation = value.operation === 'advice' ? 'advice' : 'analysis';
  const authentic = await query(env.DB_JOBS_FRESH, "SELECT e.id FROM system.outbox_events e JOIN moderation.authenticity_alpha a ON a.case_id=e.aggregate_id::uuid WHERE e.id=$1 AND e.event_type='moderation.authenticity_alpha.requested' AND e.actor_id=a.owner_id AND e.payload->>'caseId'=$2 AND e.payload->>'revision'=$3 AND coalesce(e.payload->>'operation','analysis')=$4", [eventId, value.caseId, String(value.revision), operation]);
  if (!authentic.rowCount) {
    await query(env.DB_JOBS_FRESH, "INSERT INTO system.audit_events(id,action,target_type,target_id,reason_code,correlation_id,metadata) VALUES($1,'authenticity.alpha.job.rejected','authenticity_alpha_case',$2,'FORGED_EVENT',$3,'{}')", [uuidv7(), value.caseId, eventId]);
    return;
  }
  const row = await transaction(env.DB_JOBS_FRESH, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('authenticity-alpha-runtime'))");
    const result = await client.query<AlphaRow>("UPDATE moderation.authenticity_alpha SET state='analyzing',lease_token=$3,lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now() WHERE case_id=$1 AND revision=$2 AND deleted_at IS NULL AND expires_at>now() AND state IN ('queued','analyzing') AND attempts<3 RETURNING *", [value.caseId, value.revision, uuidv7()]);
    return result.rows[0];
  });
  if (!row) return;
  row.components = {
    ...initialAlphaComponents({
      contentKind: row.content_kind,
      observerRequested: row.observer_requested,
      explanationRequested: row.explanation_requested,
    }),
    ...(row.components ?? {}),
  };
  try {
    await active(env, row);
    const config = await readBetaConfig(env);
    if (operation === 'advice') {
      if (!row.result || row.result.explanation.status !== 'not_requested' || env.AUTHENTICITY_ALPHA_ADVISER_ENABLED !== 'true' || !env.AI || !env.AI_GATEWAY_ID) {
        if (row.result) {
          row.result.explanation = { status: 'disabled', role: 'GPT_OSS_PRIVATE_ALPHA_EXPLAINER' };
          setComponent(row.result, 'adviser', { execution: 'skipped', interpretation: 'unavailable', requested: true, reason: 'adviser_disabled' });
          await saveResult(env, row, row.result, true);
        }
        return;
      }
      const result = row.result;
      const key = await sha256Hex(new TextEncoder().encode(JSON.stringify([result.packet, PRIVATE_ALPHA_VERSION, 'GPT_OSS_PRIVATE_ALPHA_EXPLAINER'])));
      try {
        const advice = await step(env, row, 'adviser', key, async () => {
          const request = buildPrivateAlphaExplanationRequest(result.packet);
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const raw = await Promise.race([
              env.AI!.run('@cf/openai/gpt-oss-20b', request, { gateway: { id: env.AI_GATEWAY_ID!, skipCache: true }, collectLog: false }),
              new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('alpha_advice_timeout')), PRIVATE_ALPHA_LIMITS.adviceMs); }),
            ]);
            return { recommendation: parsePrivateAlphaExplanation(raw, result.packet), usage: usage(raw) };
          } finally {
            if (timer) clearTimeout(timer);
          }
        });
        result.explanation = { status: 'complete', role: 'GPT_OSS_PRIVATE_ALPHA_EXPLAINER', ...advice };
        setComponent(result, 'adviser', { execution: 'completed', interpretation: 'available', requested: true });
      } catch {
        result.explanation = { status: 'attempt_consumed', role: 'GPT_OSS_PRIVATE_ALPHA_EXPLAINER' };
        setComponent(result, 'adviser', { execution: 'failed', interpretation: 'unavailable', requested: true, reason: 'provider_failure' });
      }
      await saveResult(env, row, result, true);
      return;
    }

    const image = row.content_kind !== 'text';
    let bytes: Uint8Array | null = null;
    let safetyText: ModerationAnalysis | null = null;
    let safetyImage: ModerationAnalysis | null = null;
    const reuse = await alphaReuseKey(row.owner_id, row.input_hash, { observer: row.observer_requested, adviser: row.explanation_requested });
    if (row.content_kind !== 'image' && row.text_body) {
      safetyText = env.OPENAI_API_KEY
        ? await step(env, row, 'safety_text', reuse + ':text', async () => createOpenAIModerationProvider({ apiKey: env.OPENAI_API_KEY, timeoutMs: 15_000, flaggedResult: 'REVIEW' }).analyseText({ caseId: row.case_id as import('../../../packages/authenticity/src/uuid.ts').UUIDv7, text: row.text_body! }))
        : { provider: 'openai', result: 'PROVIDER_FAILURE', reasonCodes: ['OPENAI_MODERATION_MISSING_CREDENTIAL'], modelVersion: 'omni-moderation-latest', executionMs: 0, costEstimateUsd: 0 };
    }
    if (image) {
      const object = !row.original_key || !env.MEDIA_QUARANTINE ? null : await env.MEDIA_QUARANTINE.get(row.original_key);
      if (!object) throw new Error('alpha_original_unavailable');
      const data = await readBoundedBytes(object.body, BETA_LIMITS.bytes);
      if (object.httpEtag !== row.original_etag || await sha256Hex(data) !== row.input_hash) throw new Error('alpha_original_changed');
      validateMediaPayload({ bytes: data, declaredMime: row.content_type, idempotencyKey: row.case_id });
      bytes = data;
      safetyImage = env.OPENAI_API_KEY
        ? await step(env, row, 'safety_image', reuse + ':image', async () => createOpenAIModerationProvider({ apiKey: env.OPENAI_API_KEY, maxImageBytes: BETA_LIMITS.bytes, timeoutMs: 15_000, flaggedResult: 'REVIEW' }).analyseImage({ caseId: row.case_id as import('../../../packages/authenticity/src/uuid.ts').UUIDv7, mime: row.content_type, bytes: bytes! }))
        : { provider: 'openai', result: 'PROVIDER_FAILURE', reasonCodes: ['OPENAI_MODERATION_MISSING_CREDENTIAL'], modelVersion: 'omni-moderation-latest', executionMs: 0, costEstimateUsd: 0 };
    }
    const blocked = [safetyText, safetyImage].some((value) => value?.result === 'BLOCK' || value?.result === 'REVIEW');
    let observer: VisionObserverResult | null = null;
    let observerFailure = false;
    if (!blocked && safetyImage?.result === 'ALLOW' && row.observer_requested && image && bytes && env.AUTHENTICITY_ALPHA_OBSERVER_ENABLED === 'true' && env.AI) {
      const vision = createCloudflareVisionObserver({ ai: env.AI, model: env.AUTHENTICITY_VISION_OBSERVER_MODEL, timeoutMs: PRIVATE_ALPHA_LIMITS.observerMs, maxImageBytes: BETA_LIMITS.bytes });
      try {
        observer = await step(env, row, 'observer', reuse + ':observer', async () => vision.observe({ sampleId: row.case_id, inputHash: row.input_hash, mime: row.content_type, bytes: bytes! }));
      } catch {
        observerFailure = true;
      }
    }
    let result: PrivateAlphaResult;
    if (!image) {
      result = compilePrivateAlphaText({ caseId: row.case_id, runId: row.case_id, inputHash: row.input_hash, moderation: safetyText! });
      setComponent(result, 'safety_text', { execution: 'completed', interpretation: safetyText?.result === 'PROVIDER_FAILURE' ? 'unavailable' : 'available', requested: true });
    } else if (blocked || !safetyImage || safetyImage.result !== 'ALLOW') {
      result = noSafeResult({ row, moderation: safetyImage, observer, failed: false });
      setComponent(result, 'safe', { execution: 'skipped', interpretation: 'unavailable', requested: true, reason: blocked ? 'safety_gate' : 'safety_unavailable' });
      setComponent(result, 'forensics', { execution: 'skipped', interpretation: 'unavailable', requested: true, reason: 'safe_not_run' });
    } else if (env.AUTHENTICITY_BETA_CONTAINER && env.AUTHENTICITY_BETA_DISPATCH_SECRET && config.safeEnabled && config.rightsApproval && config.runtimeApproval) {
      const safe = await step<SafeResult>(env, row, 'safe', reuse + ':safe', async (runId) => {
        const response = await env.AUTHENTICITY_BETA_CONTAINER!.getByName('safe-a-beta-v1').fetch(new Request('http://safe/infer', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + env.AUTHENTICITY_BETA_DISPATCH_SECRET, 'content-type': row.content_type, 'x-beta-binding': JSON.stringify({ caseId: row.case_id, runId, inputHash: row.input_hash, revision: row.revision }) },
          body: bytes!,
          signal: AbortSignal.timeout(BETA_LIMITS.inferenceMs),
        }));
        if (!response.ok) throw new Error('alpha_runtime_failed');
        const received = JSON.parse(new TextDecoder().decode(await readBoundedBytes(response.body, 8 * 1024 * 1024))) as { result: SafeResult };
        assertSafeResult(received.result, { caseId: row.case_id, runId, inputHash: row.input_hash, revision: row.revision, runtimeDigest: config.runtimeDigest, preprocessingHash: config.preprocessingHash });
        return received.result;
      });
      result = compilePrivateAlphaImage({ safe, moderation: safetyImage, observer });
      if (observer) result = attachAlphaObserver(result, observer, true);
    } else {
      result = noSafeResult({ row, moderation: safetyImage, observer, failed: false });
      setComponent(result, 'safe', { execution: 'skipped', interpretation: 'unavailable', requested: true, reason: 'runtime_not_enabled' });
      setComponent(result, 'forensics', { execution: 'skipped', interpretation: 'unavailable', requested: true, reason: 'runtime_not_enabled' });
    }
    if (row.content_kind === 'text_image') {
      result.contentKind = 'text_image';
      result.moderation.text = safetyText;
      setComponent(result, 'safety_text', { execution: safetyText ? 'completed' : 'failed', interpretation: safetyText?.result === 'PROVIDER_FAILURE' ? 'unavailable' : 'available', requested: true });
    }
    if (image) setComponent(result, 'safety_image', { execution: 'completed', interpretation: safetyImage?.result === 'PROVIDER_FAILURE' ? 'unavailable' : 'available', requested: true });
    if (result.safe) {
      setComponent(result, 'safe', { execution: 'completed', interpretation: result.interpretation === 'available' ? 'available' : 'inconclusive', requested: true, provider: 'lythaus-safe-container', model: 'SAFE-A' });
      setComponent(result, 'forensics', { execution: 'completed', interpretation: 'available', requested: true, provider: 'lythaus-deterministic-forensics' });
    }
    if (observer) setComponent(result, 'observer', { execution: observer.status === 'SUCCESS' ? 'completed' : 'failed', interpretation: observer.status === 'SUCCESS' ? 'available' : 'unavailable', requested: true });
    else if (row.observer_requested && image) setComponent(result, 'observer', { execution: observerFailure ? 'failed' : 'skipped', interpretation: 'unavailable', requested: true, reason: observerFailure ? 'provider_failure' : 'observer_disabled' });
    if (row.explanation_requested) setComponent(result, 'adviser', { execution: 'queued', interpretation: 'not_requested', requested: true });
    await saveResult(env, row, result, true);
  } catch (error) {
    const code = error instanceof Error && ['alpha_paused', 'alpha_stale', 'alpha_original_unavailable', 'alpha_original_changed', 'alpha_attempt_consumed'].includes(error.message) ? error.message : 'alpha_execution_failed';
    await query(env.DB_JOBS_FRESH, "UPDATE moderation.authenticity_alpha SET state=$4,failure_code=$5,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE case_id=$1 AND revision=$2 AND lease_token=$3 AND deleted_at IS NULL", [row.case_id, row.revision, row.lease_token, code === 'alpha_paused' ? 'paused' : 'failed', code]);
  }
}

async function saveResult(env: AlphaEnv, row: AlphaRow, result: PrivateAlphaResult, terminal: boolean): Promise<void> {
  await active(env, row);
  const state = terminal ? (result.status === 'failed' ? 'failed' : result.status === 'inconclusive' ? 'inconclusive' : result.status === 'unsupported' ? 'unsupported' : 'complete') : 'analyzing';
  const saved = await query(env.DB_JOBS_FRESH, "UPDATE moderation.authenticity_alpha SET result=$4::jsonb,components=$5::jsonb,state=$6,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE " + fence, [row.case_id, row.revision, row.lease_token, JSON.stringify(result), JSON.stringify(result.components), state]);
  if (!saved.rowCount) throw new Error('alpha_stale');
}

export async function expireAlphaWork(env: AlphaEnv): Promise<void> {
  await query(env.DB_JOBS_FRESH, "UPDATE moderation.authenticity_alpha_steps s SET state='ambiguous',error_code='PROVIDER_OUTCOME_UNKNOWN',completed_at=now() FROM moderation.authenticity_alpha a WHERE a.case_id=s.case_id AND s.state='started' AND (a.expires_at<=now() OR a.lease_until<now() OR a.deleted_at IS NOT NULL OR a.state='cancelled')");
  await query(env.DB_JOBS_FRESH, "UPDATE moderation.authenticity_alpha SET state='expired',revision=revision+1,lease_token=NULL,lease_until=NULL,failure_code='CASE_DEADLINE',updated_at=now() WHERE expires_at<=now() AND state IN ('uploading','queued','analyzing','paused')");
  await query(env.DB_JOBS_FRESH, "UPDATE moderation.authenticity_alpha SET state='failed',lease_token=NULL,lease_until=NULL,failure_code='RETRY_EXHAUSTED',updated_at=now() WHERE attempts>=3 AND state IN ('queued','analyzing') AND (lease_until IS NULL OR lease_until<now())");
  if (!env.MEDIA_QUARANTINE) return;
  const stale = await query<{ case_id: string; owner_id: string; object_id: string | null; upload_session_id: string | null; original_key: string | null; upload_key: string | null; state: string }>(env.DB_JOBS_FRESH, `
    SELECT a.case_id, a.owner_id, a.object_id, a.upload_session_id, a.original_key, u.object_key AS upload_key, a.state
      FROM moderation.authenticity_alpha a
      LEFT JOIN media.upload_sessions u ON u.id=a.upload_session_id
     WHERE a.state IN ('expired','cancelled','deleted')
       AND a.purged_at IS NULL
       AND a.updated_at > now() - interval '1 day'
       AND (a.original_key IS NOT NULL OR u.object_key IS NOT NULL)`);
  for (const row of stale.rows) {
    const purged = await transaction(env.DB_JOBS_FRESH, async (client) => {
      const locked = await client.query<{ state: string; object_id: string | null; upload_session_id: string | null; original_key: string | null }>(
        `SELECT state,object_id,upload_session_id,original_key FROM moderation.authenticity_alpha WHERE case_id=$1 AND owner_id=$2 FOR UPDATE`,
        [row.case_id, row.owner_id],
      );
      const current = locked.rows[0];
      if (!current || current.state !== row.state || ['expired', 'cancelled', 'deleted'].includes(current.state) === false) return false;
      if (current.upload_session_id) {
        const upload = await client.query<{ expected_bytes: string; status: string }>(`SELECT expected_bytes,status FROM media.upload_sessions WHERE id=$1 FOR UPDATE`, [current.upload_session_id]);
        if (upload.rows[0]?.status === 'pending') {
          await client.query(`UPDATE media.storage_ledger SET bytes_reserved=greatest(0,bytes_reserved-$2) WHERE user_id=$1`, [row.owner_id, Number(upload.rows[0].expected_bytes)]);
          await client.query(`UPDATE media.upload_sessions SET status='expired' WHERE id=$1 AND status='pending'`, [current.upload_session_id]);
        }
      }
      if (current.object_id) {
        const object = await client.query<{ byte_size: string; state: string }>(`SELECT byte_size,state FROM media.objects WHERE id=$1 AND owner_id=$2 FOR UPDATE`, [current.object_id, row.owner_id]);
        if (object.rows[0] && object.rows[0].state !== 'deleted') {
          await client.query(`UPDATE media.storage_ledger SET bytes_approved=greatest(0,bytes_approved-$2),object_count=greatest(0,object_count-1) WHERE user_id=$1`, [row.owner_id, Number(object.rows[0].byte_size)]);
          await client.query(`UPDATE media.objects SET state='deleted',deleted_at=now() WHERE id=$1 AND owner_id=$2`, [current.object_id, row.owner_id]);
        }
      }
      await client.query(`UPDATE moderation.authenticity_alpha SET purged_at=now(),updated_at=now() WHERE case_id=$1 AND owner_id=$2 AND purged_at IS NULL`, [row.case_id, row.owner_id]);
      await client.query(`SELECT privacy.remove_alpha_location($1,$2)`, [row.owner_id, row.case_id]);
      return true;
    });
    const keys = [row.original_key, row.upload_key].filter((key): key is string => Boolean(key));
    if (purged && keys.length) await env.MEDIA_QUARANTINE.delete(keys);
  }
}
