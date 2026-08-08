import { databaseExpectationsFromEnv, databaseReadinessResponse, inspectDatabaseIdentity, query, reconcileBudgetReservation, reserveBudget, settleBudgetReservation, transaction, type BudgetConfig, type HyperdriveBinding } from '@lythaus/db';
import type { EnvBindings } from '@lythaus/cloudflare-env';
import { evaluateAuthenticity, type AuthenticityEvaluation } from '@lythaus/authenticity';
import { json, logEvent } from '@lythaus/observability';
import { constantTimeEqual, uuidv7 } from '@lythaus/security';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface Env extends EnvBindings {
  DB_JOBS_FRESH: HyperdriveBinding;
  DB_PRIVACY_FRESH: HyperdriveBinding;
  MODERATION_QUEUE?: Queue;
  FEED_QUEUE?: Queue;
  NOTIFICATIONS_QUEUE?: Queue;
  MEDIA_QUEUE?: Queue;
  PRIVACY_QUEUE?: Queue;
  AUDIT_QUEUE?: Queue;
  MEDIA_QUARANTINE?: NonNullable<EnvBindings['MEDIA_QUARANTINE']>;
  MEDIA_APPROVED?: NonNullable<EnvBindings['MEDIA_APPROVED']>;
  IMAGES?: NonNullable<EnvBindings['IMAGES']>;
  PRIVATE_EXPORTS?: NonNullable<EnvBindings['PRIVATE_EXPORTS']>;
  ACCOUNT_DELETE?: WorkflowBinding<{ subjectId: string; requestId: string }>;
  ACCOUNT_EXPORT?: WorkflowBinding<{ subjectId: string; requestId: string }>;
  RETENTION_CLEANUP?: WorkflowBinding<{ runId: string }>;
  APPEAL_LIFECYCLE?: WorkflowBinding<{ appealId: string }>;
  BACKUP_VALIDATION?: WorkflowBinding<{ runId: string }>;
}

function hasReadinessAuthorization(request: Request, env: Env): boolean {
  const configured = env.DATABASE_READINESS_TOKEN;
  const supplied = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!configured || !supplied) return false;
  return constantTimeEqual(new TextEncoder().encode(configured), new TextEncoder().encode(supplied));
}

function budgetConfig(env: Env): BudgetConfig {
  if (env.COST_BUDGET_ENABLED !== 'true') throw new Error('budget_not_configured');
  const value = (candidate: string | undefined, fallback: number): number => {
    const parsed = Number(candidate ?? fallback);
    if (!Number.isFinite(parsed)) throw new Error('budget_config_invalid');
    return parsed;
  };
  return {
    limitUsd: value(env.COST_BUDGET_LIMIT_USD, 100),
    warningUsd: value(env.COST_BUDGET_WARNING_USD, 70),
    optionalAnalysisUsd: value(env.COST_BUDGET_OPTIONAL_ANALYSIS_USD, 80),
    essentialOnlyUsd: value(env.COST_BUDGET_ESSENTIAL_ONLY_USD, 90),
    deepScanStopUsd: value(env.COST_BUDGET_DEEP_SCAN_STOP_USD, 95),
  };
}

async function withBudgetAdmission<T>(env: Env, input: { operation: string; operationClass: 'essential' | 'optional' | 'experiment'; estimatedCostUsd: number; idempotencyKey: string; provider?: string; correlationId?: string }, work: () => Promise<T>): Promise<T> {
  const provider = input.provider ?? 'workers-ai';
  const reservation = await reserveBudget(env.DB_JOBS_FRESH, {
    ...input,
    provider,
    period: new Date().toISOString().slice(0, 7),
    config: budgetConfig(env),
  });
  logEvent({ service: 'lythaus-jobs', event: 'budget_reservation', operation: input.operation, provider, status: reservation.status, estimatedCostUsd: input.estimatedCostUsd, projectedSpendUsd: reservation.projectedSpendUsd, reused: reservation.reused });
  if (reservation.status !== 'reserved') throw new Error('budget_operation_rejected');
  let result: T;
  try {
    result = await work();
  } catch (error) {
    await reconcileBudgetReservation(env.DB_JOBS_FRESH, {
      reservationId: reservation.id,
      actualCostUsd: input.estimatedCostUsd,
      provider,
      externalReference: input.idempotencyKey,
      reason: 'provider_error',
    });
    logEvent({ service: 'lythaus-jobs', event: 'budget_reconciliation', operation: input.operation, provider, status: 'reconciled', actualCostUsd: input.estimatedCostUsd });
    throw error;
  }
  try {
    await settleBudgetReservation(env.DB_JOBS_FRESH, {
      reservationId: reservation.id,
      actualCostUsd: input.estimatedCostUsd,
      provider,
      externalReference: input.idempotencyKey,
    });
    logEvent({ service: 'lythaus-jobs', event: 'budget_settlement', operation: input.operation, provider, status: 'committed', actualCostUsd: input.estimatedCostUsd });
  } catch {
    await reconcileBudgetReservation(env.DB_JOBS_FRESH, {
      reservationId: reservation.id,
      actualCostUsd: input.estimatedCostUsd,
      provider,
      externalReference: input.idempotencyKey,
      reason: 'settlement_error',
    });
    logEvent({ service: 'lythaus-jobs', event: 'budget_reconciliation', operation: input.operation, provider, status: 'reconciled', actualCostUsd: input.estimatedCostUsd });
  }
  return result;
}

async function simulateBudgetHardStop(env: Env): Promise<Record<string, unknown>> {
  const config = budgetConfig(env);
  const reservation = await reserveBudget(env.DB_JOBS_FRESH, {
    period: new Date().toISOString().slice(0, 7),
    operation: 'budget_hard_stop_simulation',
    operationClass: 'optional',
    estimatedCostUsd: config.limitUsd,
    idempotencyKey: `budget-simulation:${uuidv7()}`,
    provider: 'simulation',
    config,
  });
  return {
    simulation: 'budget_hard_stop',
    reservationStatus: reservation.status,
    providerCallPermitted: false,
    ledgerAvailable: true,
    readiness: reservation.status === 'rejected' ? 'pass' : 'fail',
  };
}

async function runWorkersAiWithBudget(env: Env, model: string, input: unknown, idempotencyKey: string, estimatedCostUsd = 0.004): Promise<unknown> {
  if (!env.AI) throw new Error('workers_ai_not_configured');
  const gatewayId = env.AI_GATEWAY_ID;
  if (gatewayId !== 'lythaus-ai') throw new Error('workers_ai_gateway_not_configured');
  return withBudgetAdmission(env, {
    operation: `workers_ai:${model}`,
    operationClass: 'optional',
    estimatedCostUsd,
    idempotencyKey,
    provider: 'workers-ai',
  }, () => env.AI!.run(model, input, {
    gateway: { id: env.AI_GATEWAY_ID as 'lythaus-ai', skipCache: true },
    collectLog: false,
    metadata: { application: 'lythaus', environment: env.ENVIRONMENT ?? 'unknown' },
  }));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function recordAiEvidence(env: Env, input: {
  caseId: string;
  correlationId: string;
  inputHash: string;
  evidenceBundleHash: string;
  provider: string;
  modelId: string;
  gatewayId: string | null;
  promptTemplateVersion: string;
  reasoningSchemaVersion: string;
  toolVersions: Record<string, string>;
  policyVersion: string;
  responseHash: string;
  latencyMs: number;
  estimatedUsageUsd: number;
  actualUsageUsd: number;
}): Promise<void> {
  await query(env.DB_JOBS_FRESH,
    `INSERT INTO system.audit_events
       (id, action, target_type, target_id, reason_code, correlation_id, metadata)
     VALUES ($1, 'ai.reasoning.completed', 'content', $2, 'STRUCTURED_AI_EVIDENCE', $3, $4::jsonb)`,
    [uuidv7(), input.caseId, input.correlationId, JSON.stringify({
      inputHash: input.inputHash,
      evidenceBundleHash: input.evidenceBundleHash,
      provider: input.provider,
      modelId: input.modelId,
      gatewayId: input.gatewayId,
      promptTemplateVersion: input.promptTemplateVersion,
      reasoningSchemaVersion: input.reasoningSchemaVersion,
      toolVersions: input.toolVersions,
      policyVersion: input.policyVersion,
      responseHash: input.responseHash,
      latencyMs: input.latencyMs,
      estimatedUsageUsd: input.estimatedUsageUsd,
      actualUsageUsd: input.actualUsageUsd,
    })]
  );
}

interface Queue { send(body: unknown, options?: { contentType?: string }): Promise<void>; }
interface WorkflowBinding<T> { create(options: { id: string; params: T }): Promise<unknown>; }

interface QueueMessage {
  id: string;
  body: { eventId?: string; eventType?: string; [key: string]: unknown };
  ack(): void;
  retry(): void;
}

interface QueueBatch {
  queue: string;
  messages: QueueMessage[];
}

const MAX_IMAGE_PIXELS = 40_000_000;
const AUTHENTICITY_PROVIDER = 'lythaus-authenticity-ai';
const AUTHENTICITY_POLICY = 'evaluation-only-v1';

function hasMagicBytes(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return bytes.length >= 8 && bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  if (contentType === 'image/webp') return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  if (contentType === 'image/avif') return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp' && ['avif', 'avis'].includes(new TextDecoder().decode(bytes.slice(8, 12)));
  return false;
}

function manualReviewEvaluation(kind: 'text' | 'image' | 'profile', modelId: string, reason: string): AuthenticityEvaluation {
  return {
    schemaVersion: 'lythaus-authenticity-v1',
    recommendation: 'review',
    reviewRequired: true,
    riskScore: 1,
    signals: [{ category: `${kind}_manual_review`, confidence: 1, rationale: reason }],
    modelId,
    policyVersion: AUTHENTICITY_POLICY,
  };
}

async function runAuthenticityEvaluation(env: Env, input: {
  kind: 'text' | 'image' | 'profile';
  content: string;
  contentId: string;
  declaredCreationMode?: string;
}): Promise<{ evaluation: AuthenticityEvaluation; modelExecuted: boolean; latencyMs: number }> {
  const modelId = input.kind === 'image'
    ? env.AUTHENTICITY_IMAGE_MODEL ?? '@cf/meta/llama-3.1-8b-instruct-fast'
    : env.AUTHENTICITY_TEXT_MODEL ?? '@cf/meta/llama-3.1-8b-instruct-fast';
  if (env.AUTHENTICITY_AI_ENABLED !== 'true') {
    return { evaluation: manualReviewEvaluation(input.kind, modelId, 'Authenticity evaluation is disabled; human review is required.'), modelExecuted: false, latencyMs: 0 };
  }
  const estimatedCost = input.kind === 'image'
    ? Number(env.COST_AUTHENTICITY_IMAGE_ESTIMATE_USD ?? 0.01)
    : Number(env.COST_AUTHENTICITY_TEXT_ESTIMATE_USD ?? 0.004);
  const startedAt = Date.now();
  try {
    const evaluation = await evaluateAuthenticity({
      ...input,
      modelId,
      runModel: (model, modelInput, idempotencyKey) => runWorkersAiWithBudget(env, model, modelInput, idempotencyKey, estimatedCost),
    });
    return { evaluation, modelExecuted: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    logEvent({ service: 'lythaus-jobs', event: 'authenticity_evaluation_failed', operation: input.kind, error: error instanceof Error ? error.message : 'evaluation_failed' });
    return {
      evaluation: manualReviewEvaluation(input.kind, modelId, 'Automated evaluation was unavailable; human review is required.'),
      modelExecuted: false,
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function processPostModeration(message: QueueMessage, env: Env): Promise<void> {
  const payload = (message.body.payload ?? message.body) as { postId?: unknown };
  const postId = typeof payload.postId === 'string' ? payload.postId : undefined;
  if (!postId) throw new Error('content_event_invalid');
  const postResult = await query<{ id: string; author_id: string; body: string; declared_creation_mode: 'human' | 'ai_assisted' | 'ai_generated'; moderation_state: string }>(
    env.DB_JOBS_FRESH,
    `SELECT id, author_id, body, declared_creation_mode, moderation_state FROM content.posts WHERE id = $1`, [postId]
  );
  const post = postResult.rows[0];
  if (!post || post.moderation_state !== 'under_review') return;
  const prior = await query(env.DB_JOBS_FRESH,
    `SELECT 1 FROM moderation.detector_runs WHERE content_type = 'post' AND content_id = $1 AND provider = $2 LIMIT 1`, [postId, AUTHENTICITY_PROVIDER]);
  if (prior.rowCount !== 0) return;
  const { evaluation, modelExecuted, latencyMs } = await runAuthenticityEvaluation(env, {
    kind: 'text', content: post.body, contentId: postId, declaredCreationMode: post.declared_creation_mode,
  });
  const modelVersion = evaluation.modelId;
  const inputHash = await sha256Hex(post.body);
  const responseHash = await sha256Hex(JSON.stringify(evaluation));
  if (modelExecuted) await recordAiEvidence(env, {
    caseId: postId,
    correlationId: postId,
    inputHash,
    evidenceBundleHash: await sha256Hex(`${inputHash}:${modelVersion}:${AUTHENTICITY_POLICY}`),
    provider: AUTHENTICITY_PROVIDER,
    modelId: modelVersion,
    gatewayId: env.AI_GATEWAY_ID ?? null,
    promptTemplateVersion: 'authenticity-evaluation-v1',
    reasoningSchemaVersion: evaluation.schemaVersion,
    toolVersions: { authenticity: 'lythaus-authenticity-v1' },
    policyVersion: AUTHENTICITY_POLICY,
    responseHash,
    latencyMs,
    estimatedUsageUsd: Number(env.COST_AUTHENTICITY_TEXT_ESTIMATE_USD ?? 0.004),
    actualUsageUsd: Number(env.COST_AUTHENTICITY_TEXT_ESTIMATE_USD ?? 0.004),
  }).catch((error) => logEvent({ service: 'lythaus-jobs', event: 'ai_evidence_record_failed', operation: 'moderation_text_scan', error: error instanceof Error ? error.message : 'audit_write_failed' }));
  const detectedContentClass = evaluation.signals[0]?.category ?? null;
  const declarationConflict = post.declared_creation_mode === 'human'
    && evaluation.signals.some((item) => /(^|[_:-])(ai|generated|synthetic)([_:-]|$)/i.test(item.category));
  const signal = JSON.stringify(evaluation);
  await transaction(env.DB_JOBS_FRESH, async (client) => {
    const existing = await client.query(`SELECT 1 FROM moderation.detector_runs WHERE content_type = 'post' AND content_id = $1 AND provider = $2 LIMIT 1`, [postId, AUTHENTICITY_PROVIDER]);
    if (existing.rowCount !== 0) return;
    await client.query(
      `INSERT INTO moderation.detector_runs (id, content_type, content_id, provider, model_version, signal) VALUES ($1, 'post', $2, $3, $4, $5::jsonb)`,
      [uuidv7(), postId, AUTHENTICITY_PROVIDER, modelVersion, signal]
    );
    await client.query(
      `INSERT INTO content.content_declarations (post_id, declared_creation_mode, public_label, detector_provider, detector_model_version, detector_signal, declaration_conflict, review_required)
       VALUES ($1, $2, 'Under review', $3, $4, $5::jsonb, $6, true)
       ON CONFLICT (post_id) DO UPDATE SET public_label = EXCLUDED.public_label, detector_provider = EXCLUDED.detector_provider,
         detector_model_version = EXCLUDED.detector_model_version, detector_signal = EXCLUDED.detector_signal,
         declaration_conflict = EXCLUDED.declaration_conflict, review_required = EXCLUDED.review_required, updated_at = now()`,
      [postId, post.declared_creation_mode, AUTHENTICITY_PROVIDER, modelVersion, signal, declarationConflict]
    );
    const caseResult = await client.query<{ id: string }>(
      `INSERT INTO moderation.cases (id, content_type, content_id, state, policy_version) VALUES ($1, 'post', $2, 'open', $3) RETURNING id`,
      [uuidv7(), postId, AUTHENTICITY_POLICY]
    );
    await client.query(
      `INSERT INTO moderation.decisions (id, case_id, outcome, public_label, policy_version) VALUES ($1, $2, 'queue', 'Under review', $3)`,
      [uuidv7(), caseResult.rows[0].id, AUTHENTICITY_POLICY]
    );
    await client.query(
      `INSERT INTO trust.provenance_events (id, content_id, author_id, declared_creation_mode, detected_content_class, detector_provider, detector_model_version, policy_version, final_decision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queue')`,
      [uuidv7(), postId, post.author_id, post.declared_creation_mode, detectedContentClass, AUTHENTICITY_PROVIDER, modelVersion, AUTHENTICITY_POLICY]
    );
  });
}

async function processMediaUpload(message: QueueMessage, env: Env): Promise<void> {
  if (env.MEDIA_PROCESSING_ENABLED !== 'true') return;
  const payload = (message.body.payload ?? message.body) as { uploadSessionId?: unknown; objectKey?: unknown };
  const sessionId = typeof payload.uploadSessionId === 'string' ? payload.uploadSessionId : undefined;
  const objectKey = typeof payload.objectKey === 'string' ? payload.objectKey : undefined;
  if (!sessionId || !objectKey || !env.MEDIA_QUARANTINE || !env.MEDIA_APPROVED || !env.IMAGES) throw new Error('media_processing_not_configured');

  const session = await query<{ user_id: string; content_type: string; expected_bytes: number; status: string }>(
    env.DB_JOBS_FRESH,
    `SELECT user_id, content_type, expected_bytes, status FROM media.upload_sessions WHERE id = $1 AND object_key = $2`,
    [sessionId, objectKey]
  );
  const row = session.rows[0];
  if (!row) throw new Error('upload_session_not_found');
  if (row.status === 'approved') return;
  if (row.status !== 'queued') throw new Error('upload_session_not_queued');

  const settleRejected = async (): Promise<void> => {
    await transaction(env.DB_JOBS_FRESH, async (client) => {
      const updated = await client.query(`UPDATE media.upload_sessions SET status = 'rejected' WHERE id = $1 AND status = 'queued'`, [sessionId]);
      if (updated.rowCount !== 0) await client.query(
        `UPDATE media.storage_ledger SET bytes_reserved = greatest(bytes_reserved - $1, 0), bytes_rejected = bytes_rejected + $1, last_reconciled_at = now() WHERE user_id = $2`,
        [row.expected_bytes, row.user_id]);
    });
  };

  const source = await env.MEDIA_QUARANTINE.get(objectKey);
  if (!source) throw new Error('quarantine_object_missing');
  const bytes = new Uint8Array(await new Response(source.body).arrayBuffer());
  if (bytes.byteLength !== Number(row.expected_bytes) || !hasMagicBytes(bytes, row.content_type)) {
    await settleRejected();
    await env.MEDIA_QUARANTINE.delete(objectKey);
    return;
  }

  const sourceInfo = await env.IMAGES.info(new Response(bytes).body!);
  if (!sourceInfo.width || !sourceInfo.height || sourceInfo.width * sourceInfo.height > MAX_IMAGE_PIXELS) {
    await settleRejected();
    await env.MEDIA_QUARANTINE.delete(objectKey);
    return;
  }

  const transformed = await (await env.IMAGES.input(new Response(bytes).body!).output({ format: 'image/webp', quality: 85 })).image();
  const approvedBytes = new Uint8Array(await new Response(transformed).arrayBuffer());
  if (approvedBytes.byteLength === 0 || approvedBytes.byteLength > 10 * 1024 * 1024) throw new Error('media_transform_invalid');
  const digest = await crypto.subtle.digest('SHA-256', approvedBytes);
  const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
  const approvedKey = `approved/${row.user_id}/${sessionId}.webp`;
  await env.MEDIA_APPROVED.put(approvedKey, approvedBytes, { httpMetadata: { contentType: 'image/webp' } });
  const { evaluation, modelExecuted, latencyMs } = await runAuthenticityEvaluation(env, {
    kind: 'image',
    content: JSON.stringify({ sha256, contentType: 'image/webp', byteSize: approvedBytes.byteLength, width: sourceInfo.width, height: sourceInfo.height }),
    contentId: sessionId,
  });
  const responseHash = await sha256Hex(JSON.stringify(evaluation));
  if (modelExecuted) await recordAiEvidence(env, {
    caseId: sessionId,
    correlationId: sessionId,
    inputHash: sha256,
    evidenceBundleHash: await sha256Hex(`${sha256}:${evaluation.modelId}:${AUTHENTICITY_POLICY}`),
    provider: AUTHENTICITY_PROVIDER,
    modelId: evaluation.modelId,
    gatewayId: env.AI_GATEWAY_ID ?? null,
    promptTemplateVersion: 'authenticity-evaluation-v1',
    reasoningSchemaVersion: evaluation.schemaVersion,
    toolVersions: { authenticity: 'lythaus-authenticity-v1' },
    policyVersion: AUTHENTICITY_POLICY,
    responseHash,
    latencyMs,
    estimatedUsageUsd: Number(env.COST_AUTHENTICITY_IMAGE_ESTIMATE_USD ?? 0.01),
    actualUsageUsd: Number(env.COST_AUTHENTICITY_IMAGE_ESTIMATE_USD ?? 0.01),
  }).catch((error) => logEvent({ service: 'lythaus-jobs', event: 'ai_evidence_record_failed', operation: 'moderation_image_scan', error: error instanceof Error ? error.message : 'audit_write_failed' }));
  const moderationSignal = JSON.stringify(evaluation);

  await transaction(env.DB_JOBS_FRESH, async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO media.objects (id, owner_id, object_key, content_type, byte_size, sha256, state)
       VALUES ($1, $2, $3, 'image/webp', $4, $5, $6) ON CONFLICT (object_key) DO NOTHING RETURNING id`,
      [uuidv7(), row.user_id, approvedKey, approvedBytes.byteLength, sha256, 'review']
    );
    if (inserted.rowCount !== 0) {
      const objectId = inserted.rows[0].id;
      await client.query(`INSERT INTO media.ownership (object_id, owner_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [objectId, row.user_id]);
      await client.query(
        `INSERT INTO media.variants (id, object_id, object_key, content_type, byte_size, width, height)
         VALUES ($1, $2, $3, 'image/webp', $4, $5, $6) ON CONFLICT (object_key) DO NOTHING`,
        [uuidv7(), objectId, approvedKey, approvedBytes.byteLength, sourceInfo.width, sourceInfo.height]
      );
      await client.query(
        `INSERT INTO media.moderation_results (id, object_id, provider, model_version, signal) VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [uuidv7(), objectId, AUTHENTICITY_PROVIDER, evaluation.modelId, moderationSignal]
      );
      await client.query(
        `INSERT INTO media.storage_ledger (user_id, bytes_uploaded, bytes_approved, object_count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (user_id) DO UPDATE SET bytes_uploaded = media.storage_ledger.bytes_uploaded + EXCLUDED.bytes_uploaded,
           bytes_reserved = greatest(media.storage_ledger.bytes_reserved - $4, 0),
           bytes_approved = media.storage_ledger.bytes_approved + EXCLUDED.bytes_approved,
           object_count = media.storage_ledger.object_count + 1,
           last_reconciled_at = now()`,
        [row.user_id, approvedBytes.byteLength, approvedBytes.byteLength, row.expected_bytes]
      );
    }
    await client.query(`UPDATE media.upload_sessions SET status = 'approved' WHERE id = $1 AND status = 'queued'`, [sessionId]);
  });
  await env.MEDIA_QUARANTINE.delete(objectKey);
}

async function processProfileModeration(message: QueueMessage, env: Env): Promise<void> {
  const payload = (message.body.payload ?? message.body) as { userId?: unknown; displayName?: unknown; bio?: unknown };
  const userId = typeof payload.userId === 'string' ? payload.userId : undefined;
  if (!userId) throw new Error('profile_event_invalid');
  const prior = await query(env.DB_JOBS_FRESH,
    `SELECT 1 FROM moderation.detector_runs WHERE content_type = 'profile' AND content_id = $1 AND provider = $2 LIMIT 1`,
    [userId, AUTHENTICITY_PROVIDER]);
  if (prior.rowCount !== 0) return;
  const content = JSON.stringify({
    displayName: typeof payload.displayName === 'string' ? payload.displayName : null,
    bio: typeof payload.bio === 'string' ? payload.bio : null,
  });
  const { evaluation, modelExecuted, latencyMs } = await runAuthenticityEvaluation(env, {
    kind: 'profile', content, contentId: userId,
  });
  const inputHash = await sha256Hex(content);
  if (modelExecuted) await recordAiEvidence(env, {
    caseId: userId,
    correlationId: userId,
    inputHash,
    evidenceBundleHash: await sha256Hex(`${inputHash}:${evaluation.modelId}:${AUTHENTICITY_POLICY}`),
    provider: AUTHENTICITY_PROVIDER,
    modelId: evaluation.modelId,
    gatewayId: env.AI_GATEWAY_ID ?? null,
    promptTemplateVersion: 'authenticity-evaluation-v1',
    reasoningSchemaVersion: evaluation.schemaVersion,
    toolVersions: { authenticity: 'lythaus-authenticity-v1' },
    policyVersion: AUTHENTICITY_POLICY,
    responseHash: await sha256Hex(JSON.stringify(evaluation)),
    latencyMs,
    estimatedUsageUsd: Number(env.COST_AUTHENTICITY_TEXT_ESTIMATE_USD ?? 0.004),
    actualUsageUsd: Number(env.COST_AUTHENTICITY_TEXT_ESTIMATE_USD ?? 0.004),
  }).catch((error) => logEvent({ service: 'lythaus-jobs', event: 'ai_evidence_record_failed', operation: 'moderation_profile_scan', error: error instanceof Error ? error.message : 'audit_write_failed' }));
  await transaction(env.DB_JOBS_FRESH, async (client) => {
    const existing = await client.query(
      `SELECT 1 FROM moderation.detector_runs WHERE content_type = 'profile' AND content_id = $1 AND provider = $2 LIMIT 1`,
      [userId, AUTHENTICITY_PROVIDER]);
    if (existing.rowCount !== 0) return;
    await client.query(
      `INSERT INTO moderation.detector_runs (id, content_type, content_id, provider, model_version, signal)
       VALUES ($1, 'profile', $2, $3, $4, $5::jsonb)`,
      [uuidv7(), userId, AUTHENTICITY_PROVIDER, evaluation.modelId, JSON.stringify(evaluation)]);
    const caseResult = await client.query<{ id: string }>(
      `INSERT INTO moderation.cases (id, content_type, content_id, state, policy_version)
       VALUES ($1, 'profile', $2, 'open', $3) RETURNING id`,
      [uuidv7(), userId, AUTHENTICITY_POLICY]);
    await client.query(
      `INSERT INTO moderation.decisions (id, case_id, outcome, public_label, policy_version)
       VALUES ($1, $2, 'queue', 'Under review', $3)`,
      [uuidv7(), caseResult.rows[0].id, AUTHENTICITY_POLICY]);
  });
}

async function processMessage(message: QueueMessage, env: Env): Promise<void> {
  const eventId = message.body.eventId ?? message.id;
  const eventType = message.body.eventType ?? 'unknown';
  const claimed = await query(env.DB_JOBS_FRESH,
    `INSERT INTO system.consumer_inbox (consumer_name, event_id, event_type, payload)
     VALUES ('lythaus-jobs', $1, $2, $3::jsonb)
     ON CONFLICT (consumer_name, event_id) DO NOTHING`,
    [eventId, eventType, JSON.stringify(message.body)]);
  if (claimed.rowCount === 0) {
    const existing = await query<{ state: 'processing' | 'completed'; claimed_at: string }>(env.DB_JOBS_FRESH,
      `SELECT state, claimed_at FROM system.consumer_inbox WHERE consumer_name = 'lythaus-jobs' AND event_id = $1`, [eventId]);
    const row = existing.rows[0];
    if (!row || row.state === 'completed') {
      message.ack();
      return;
    }
    const reclaimed = await query(env.DB_JOBS_FRESH,
      `UPDATE system.consumer_inbox
          SET claimed_at = now(), payload = $2::jsonb, event_type = $3
        WHERE consumer_name = 'lythaus-jobs' AND event_id = $1 AND state = 'processing'
          AND claimed_at < now() - interval '5 minutes'`,
      [eventId, JSON.stringify(message.body), eventType]);
    if (reclaimed.rowCount === 0) {
      message.retry();
      return;
    }
  }
  try {
    if (eventType === 'content.post.created') await processPostModeration(message, env);
    if (eventType === 'content.profile.updated') await processProfileModeration(message, env);
    if (eventType === 'media.upload.finalised') await processMediaUpload(message, env);
    if (eventType === 'privacy.request.created') {
      const payload = (message.body.payload ?? {}) as { requestId?: string; requestType?: string };
      const subjectId = typeof message.body.actorId === 'string' ? message.body.actorId : undefined;
      if (!payload.requestId || !subjectId || !['export', 'delete', 'rectify'].includes(payload.requestType ?? '')) throw new Error('privacy_event_invalid');
      await query(env.DB_PRIVACY_FRESH,
        `INSERT INTO privacy.requests (id, subject_id, request_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`, [payload.requestId, subjectId, payload.requestType]);
      await query(env.DB_PRIVACY_FRESH,
        `INSERT INTO privacy.request_events (id, request_id, event_type, metadata)
         VALUES ($1, $2, 'received', $3::jsonb)
         ON CONFLICT (id) DO NOTHING`, [eventId, payload.requestId, JSON.stringify({ eventId })]);
      if (payload.requestType === 'delete' && env.ACCOUNT_DELETE) {
        await env.ACCOUNT_DELETE.create({ id: `privacy-delete-${payload.requestId}`, params: { subjectId, requestId: payload.requestId } });
      }
      if (payload.requestType === 'export' && env.ACCOUNT_EXPORT) {
        await env.ACCOUNT_EXPORT.create({ id: `privacy-export-${payload.requestId}`, params: { subjectId, requestId: payload.requestId } });
      }
    }
    if (eventType === 'moderation.appeal.created' && env.APPEAL_LIFECYCLE) {
      const payload = (message.body.payload ?? {}) as { appealId?: string };
      if (typeof payload.appealId !== 'string') throw new Error('appeal_event_invalid');
      await env.APPEAL_LIFECYCLE.create({ id: `appeal-${payload.appealId}`, params: { appealId: payload.appealId } });
    }
    await query(env.DB_JOBS_FRESH,
      `UPDATE system.consumer_inbox SET state = 'completed', processed_at = now() WHERE consumer_name = 'lythaus-jobs' AND event_id = $1`,
      [eventId]
    );
    logEvent({ service: 'lythaus-jobs', eventId, eventType });
    message.ack();
  } catch (error) {
    // Release the claim so Queue retry can safely reprocess a failed event.
    await query(env.DB_JOBS_FRESH,
      `DELETE FROM system.consumer_inbox WHERE consumer_name = 'lythaus-jobs' AND event_id = $1`,
      [eventId]
    ).catch(() => undefined);
    throw error;
  }
}

function queueForEvent(eventType: string, env: Env): Queue | undefined {
  if (eventType.startsWith('content.') || eventType.startsWith('moderation.')) return env.MODERATION_QUEUE;
  if (eventType.startsWith('feed.')) return env.FEED_QUEUE;
  if (eventType.startsWith('notification.')) return env.NOTIFICATIONS_QUEUE;
  if (eventType.startsWith('media.')) return env.MEDIA_QUEUE;
  if (eventType.startsWith('privacy.')) return env.PRIVACY_QUEUE;
  return env.AUDIT_QUEUE;
}

async function relayOutbox(env: Env): Promise<void> {
  const pending = await query<{ id: string; event_type: string; payload: unknown; actor_id: string | null; correlation_id: string | null }>(
    env.DB_JOBS_FRESH,
    `SELECT id, event_type, payload, actor_id, correlation_id
       FROM system.outbox_events
      WHERE dispatched_at IS NULL
      ORDER BY created_at
      LIMIT 50`
  );
  for (const event of pending.rows) {
    const queue = queueForEvent(event.event_type, env);
    if (!queue) continue;
    await queue.send({
      eventId: event.id,
      eventType: event.event_type,
      actorId: event.actor_id,
      correlationId: event.correlation_id,
      payload: event.payload,
    });
    await query(env.DB_JOBS_FRESH,
      `UPDATE system.outbox_events SET dispatched_at = now(), attempted_at = now(), attempt_count = attempt_count + 1 WHERE id = $1 AND dispatched_at IS NULL`,
      [event.id]
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (request.method === 'GET' && pathname === '/internal/readiness/database-identity') {
      if (!hasReadinessAuthorization(request, env)) return new Response(null, { status: 404 });
      const [jobs, privacy] = await Promise.all([
        inspectDatabaseIdentity(env.DB_JOBS_FRESH, databaseExpectationsFromEnv(env)),
        inspectDatabaseIdentity(env.DB_PRIVACY_FRESH, databaseExpectationsFromEnv(env)),
      ]);
      const readiness = jobs.readiness === 'pass' && privacy.readiness === 'pass' ? 'pass' : 'fail';
      return json({
        service: 'lythaus-jobs',
        databases: {
          jobs: databaseReadinessResponse(jobs, env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true'),
          privacy: databaseReadinessResponse(privacy, env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true'),
        },
        branchFingerprint: 'unknown',
        readiness,
        readyForAuthentication: env.AUTHENTICATED_ACCEPTANCE_PROVEN === 'true' && readiness === 'pass' && jobs.budgetLedgerApplied && privacy.budgetLedgerApplied,
        }, { headers: { 'cache-control': 'private, no-store' } });
    }
    if (request.method === 'GET' && pathname === '/internal/readiness/budget-hard-stop') {
      if (!hasReadinessAuthorization(request, env)) return new Response(null, { status: 404 });
      return json(await simulateBudgetHardStop(env), { headers: { 'cache-control': 'private, no-store' } });
    }
    return json({ status: 'ok', service: 'lythaus-jobs' });
  },

  async queue(batch: QueueBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processMessage(message, env);
      } catch (error) {
        logEvent({ service: 'lythaus-jobs', queue: batch.queue, messageId: message.id, error: error instanceof Error ? error.message : 'job_failed' });
        message.retry();
      }
    }
  },

  async scheduled(_event: unknown, env: Env): Promise<void> {
    await relayOutbox(env);
    const now = new Date();
    if (env.RETENTION_CLEANUP && now.getUTCHours() === 2 && now.getUTCMinutes() === 0) {
      const runId = new Date().toISOString().slice(0, 10);
      await env.RETENTION_CLEANUP.create({ id: `retention-${runId}`, params: { runId } });
    }
    if (env.BACKUP_VALIDATION && now.getUTCDate() === 1 && now.getUTCHours() === 3 && now.getUTCMinutes() === 0) {
      const runId = now.toISOString().slice(0, 10);
      await env.BACKUP_VALIDATION.create({ id: `backup-validation-${runId}`, params: { runId } });
    }
  },
};

export class AccountDeleteWorkflow extends WorkflowEntrypoint<Env, { subjectId: string; requestId: string }> {
  async run(event: WorkflowEvent<{ subjectId: string; requestId: string }>, step: WorkflowStep): Promise<{ subjectId: string; state: string }> {
    const subjectId = event.payload.subjectId;
    const requestedId = event.payload.requestId;
    const requestId = await step.do('resolve-request', async () => {
      await query(this.env.DB_PRIVACY_FRESH, `SELECT privacy.reconcile_subject_data_locations($1)`, [subjectId]);
      const result = await query<{ id: string }>(this.env.DB_PRIVACY_FRESH,
        `SELECT id FROM privacy.requests WHERE id = $1 AND subject_id = $2 AND request_type = 'delete'`, [requestedId, subjectId]);
      if (!result.rows[0]) throw new Error('privacy_delete_request_not_found');
      await query(this.env.DB_PRIVACY_FRESH,
        `INSERT INTO privacy.request_events (id, request_id, event_type, metadata)
         SELECT $1, $2, 'workflow_started', $3::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM privacy.request_events WHERE request_id = $2 AND event_type = 'workflow_started')`,
        [uuidv7(), result.rows[0].id, JSON.stringify({ subjectId })]);
      return result.rows[0].id;
    });

    await step.do('lock-account-and-revoke-sessions', async () => {
      await transaction(this.env.DB_PRIVACY_FRESH, async (client) => {
        await client.query(`UPDATE identity.users SET status = 'locked', updated_at = now() WHERE id = $1 AND status IN ('active', 'locked')`, [subjectId]);
        await client.query(`UPDATE identity.auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [subjectId]);
        await client.query(`UPDATE identity.refresh_token_families SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [subjectId]);
      });
      return true;
    });

    const hold = await step.do('evaluate-legal-holds', async () => {
      const result = await query<{ id: string }>(this.env.DB_PRIVACY_FRESH, `SELECT id FROM privacy.legal_holds WHERE subject_id = $1 AND active`, [subjectId]);
      if (result.rows[0]) {
        await query(this.env.DB_PRIVACY_FRESH,
          `UPDATE privacy.requests SET state = 'blocked' WHERE id = $1 AND state <> 'completed'`, [requestId]);
        await query(this.env.DB_PRIVACY_FRESH,
          `INSERT INTO privacy.request_events (id, request_id, event_type, metadata)
           SELECT $1, $2, 'blocked_legal_hold', $3::jsonb
            WHERE NOT EXISTS (SELECT 1 FROM privacy.request_events WHERE request_id = $2 AND event_type = 'blocked_legal_hold')`,
          [uuidv7(), requestId, JSON.stringify({ legalHoldId: result.rows[0].id })]);
        return true;
      }
      return false;
    });
    if (hold) return { subjectId, state: 'blocked' };

    await step.do('redact-authoritative-content', async () => {
      await transaction(this.env.DB_JOBS_FRESH, async (client) => {
        await client.query(`UPDATE content.comments SET body = '[deleted]', moderation_state = 'blocked' WHERE author_id = $1`, [subjectId]);
        await client.query(`UPDATE content.posts SET body = '[deleted]', visibility = 'private', moderation_state = 'blocked', published_at = NULL, updated_at = now() WHERE author_id = $1`, [subjectId]);
        await client.query(`DELETE FROM feed.author_outbox WHERE author_id = $1`, [subjectId]);
        await client.query(`DELETE FROM feed.discovery_candidates WHERE post_id IN (SELECT id FROM content.posts WHERE author_id = $1)`, [subjectId]);
        await client.query(`DELETE FROM feed.user_inbox WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM feed.feed_events WHERE recipient_id = $1`, [subjectId]);
        await client.query(`DELETE FROM feed.notifications WHERE recipient_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.follows WHERE follower_id = $1 OR followed_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.blocks WHERE blocker_id = $1 OR blocked_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.mutes WHERE muter_id = $1 OR muted_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.reactions WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.bookmarks WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM trust.accountability_signals WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM trust.reputation_balances WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM system.idempotency_keys WHERE actor_id = $1`, [subjectId]);
        await client.query(`DELETE FROM system.consumer_inbox WHERE payload ->> 'subjectId' = $1 OR payload ->> 'subject_id' = $1`, [subjectId]);
        await client.query(`UPDATE system.outbox_events SET actor_id = NULL, payload = '{}'::jsonb WHERE actor_id = $1`, [subjectId]);
      });
      await transaction(this.env.DB_PRIVACY_FRESH, async (client) => {
        await client.query(`DELETE FROM identity.auth_sessions WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.refresh_token_families WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.provider_links WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.email_credentials WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.contact_emails WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.email_verification_tokens WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.password_reset_tokens WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.handles WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.user_region_preferences WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM identity.admin_memberships WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.profile_private_fields WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.profiles WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM social.custom_feeds WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM editorial.applications WHERE user_id = $1`, [subjectId]);
        await client.query(`DELETE FROM editorial.memberships WHERE user_id = $1`, [subjectId]);
        await client.query(`UPDATE identity.users SET status = 'deleted', display_name = '[deleted]', deleted_at = COALESCE(deleted_at, now()), updated_at = now() WHERE id = $1`, [subjectId]);
      });
      return true;
    });

    await step.do('purge-media-and-mark-locator', async () => {
      if (!this.env.MEDIA_APPROVED || !this.env.MEDIA_QUARANTINE) throw new Error('media_purge_not_configured');
      const objects = await query<{ id: string; object_key: string; sha256: string | null }>(this.env.DB_JOBS_FRESH, `SELECT id, object_key, sha256 FROM media.objects WHERE owner_id = $1 AND deleted_at IS NULL`, [subjectId]);
      for (const object of objects.rows) await this.env.MEDIA_APPROVED.delete(object.object_key);
      const uploads = await query<{ object_key: string }>(this.env.DB_JOBS_FRESH, `SELECT object_key FROM media.upload_sessions WHERE user_id = $1 AND status IN ('pending', 'queued')`, [subjectId]);
      for (const upload of uploads.rows) await this.env.MEDIA_QUARANTINE.delete(upload.object_key);
      await transaction(this.env.DB_JOBS_FRESH, async (client) => {
        for (const object of objects.rows) {
          await client.query(
            `INSERT INTO media.deletion_events (id, object_id, owner_id, reason_code, completed_at, evidence_hash)
             SELECT $1, $2, $3, 'ACCOUNT_DELETION', now(), $4
              WHERE NOT EXISTS (
                SELECT 1 FROM media.deletion_events
                 WHERE object_id = $2 AND reason_code = 'ACCOUNT_DELETION' AND completed_at IS NOT NULL
              )`,
            [uuidv7(), object.id, subjectId, object.sha256],
          );
        }
        await client.query(`UPDATE media.objects SET state = 'deleted', deleted_at = COALESCE(deleted_at, now()) WHERE owner_id = $1`, [subjectId]);
        await client.query(`UPDATE media.upload_sessions SET status = 'expired' WHERE user_id = $1 AND status IN ('pending', 'queued')`, [subjectId]);
        await client.query(`DELETE FROM media.storage_ledger WHERE user_id = $1`, [subjectId]);
      });
      await query(this.env.DB_PRIVACY_FRESH,
        `UPDATE privacy.subject_data_locations SET deletion_state = 'deleted', last_verified_at = now() WHERE subject_id = $1`, [subjectId]);
      return objects.rows.length + uploads.rows.length;
    });

    await step.do('complete-request-and-tombstone', async () => {
      const evidence = new TextEncoder().encode(`${subjectId}:${requestId}:${new Date().toISOString()}`);
      const digest = await crypto.subtle.digest('SHA-256', evidence);
      const evidenceHash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
      await transaction(this.env.DB_PRIVACY_FRESH, async (client) => {
        await client.query(`INSERT INTO privacy.deletion_tombstones (subject_id, evidence_hash) VALUES ($1, $2) ON CONFLICT (subject_id) DO UPDATE SET completed_at = now(), evidence_hash = EXCLUDED.evidence_hash`, [subjectId, evidenceHash]);
        await client.query(`UPDATE privacy.requests SET state = 'completed', completed_at = now() WHERE id = $1`, [requestId]);
        await client.query(`INSERT INTO privacy.request_events (id, request_id, event_type, metadata)
          SELECT $1, $2, 'completed', $3::jsonb
           WHERE NOT EXISTS (SELECT 1 FROM privacy.request_events WHERE request_id = $2 AND event_type = 'completed')`, [uuidv7(), requestId, JSON.stringify({ evidenceHash })]);
      });
      return evidenceHash;
    });
    return { subjectId, state: 'completed' };
  }
}

export class AccountExportWorkflow extends WorkflowEntrypoint<Env, { subjectId: string; requestId: string }> {
  async run(event: WorkflowEvent<{ subjectId: string; requestId: string }>, step: WorkflowStep): Promise<{ subjectId: string; state: string }> {
    const subjectId = event.payload.subjectId;
    const requestedId = event.payload.requestId;
    const exportsBucket = this.env.PRIVATE_EXPORTS;
    if (!exportsBucket) throw new Error('private_exports_not_configured');
    const requestId = await step.do('resolve-export-request', async () => {
      await query(this.env.DB_PRIVACY_FRESH, `SELECT privacy.reconcile_subject_data_locations($1)`, [subjectId]);
      const result = await query<{ id: string }>(this.env.DB_PRIVACY_FRESH,
        `SELECT id FROM privacy.requests WHERE id = $1 AND subject_id = $2 AND request_type = 'export'`, [requestedId, subjectId]);
      if (!result.rows[0]) throw new Error('privacy_export_request_not_found');
      await query(this.env.DB_PRIVACY_FRESH,
        `INSERT INTO privacy.request_events (id, request_id, event_type, metadata)
         SELECT $1, $2, 'workflow_started', $3::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM privacy.request_events WHERE request_id = $2 AND event_type = 'workflow_started')`,
        [uuidv7(), result.rows[0].id, JSON.stringify({ subjectId })]);
      return result.rows[0].id;
    });

    const passport = await step.do('build-data-passport', async () => {
      const [identity, locations] = await Promise.all([
        query(this.env.DB_PRIVACY_FRESH, `SELECT id, display_name, status, created_at, deleted_at FROM identity.users WHERE id = $1`, [subjectId]),
        query(this.env.DB_PRIVACY_FRESH, `SELECT store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class, legal_hold_state, deletion_state, last_verified_at FROM privacy.subject_data_locations WHERE subject_id = $1`, [subjectId]),
      ]);
      const [posts, comments, follows, media, provenance, contributions, reputation] = await Promise.all([
        query(this.env.DB_JOBS_FRESH, `SELECT id, body, declared_creation_mode, visibility, moderation_state, geo_scope, place_id, published_at, created_at FROM content.posts WHERE author_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT id, post_id, parent_id, body, moderation_state, created_at FROM content.comments WHERE author_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT follower_id, followed_id, created_at FROM social.follows WHERE follower_id = $1 OR followed_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT id, object_key, content_type, byte_size, sha256, state, created_at, deleted_at FROM media.objects WHERE owner_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT content_id, declared_creation_mode, detected_content_class, detector_provider, detector_model_version, policy_version, appeal_state, final_decision, created_at FROM trust.provenance_events WHERE author_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT content_id, human_authorship_eligibility, quality_signal, source_signal, behaviour_signal, policy_version, points_delta, reversal_reference, created_at FROM trust.human_contribution_events WHERE subject_user_id = $1 ORDER BY created_at`, [subjectId]),
        query(this.env.DB_JOBS_FRESH, `SELECT content_id, event_type, policy_version, points_delta, reversal_reference, created_at FROM trust.reputation_events WHERE subject_user_id = $1 ORDER BY created_at`, [subjectId]),
      ]);
      return {
        schemaVersion: 'lythaus-data-passport-v1',
        generatedAt: new Date().toISOString(),
        profile: identity.rows[0] ?? null,
        posts: posts.rows,
        comments: comments.rows,
        follows: follows.rows,
        media: media.rows,
        provenance: provenance.rows,
        humanContribution: contributions.rows,
        reputation: reputation.rows,
        subjectDataLocations: locations.rows,
      };
    });

    await step.do('store-export-and-complete-request', async () => {
      const body = JSON.stringify(passport);
      const bytes = new TextEncoder().encode(body);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const packageHash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
      const objectKey = `exports/${subjectId}/${requestId}.json`;
      await exportsBucket.put(objectKey, bytes, { httpMetadata: { contentType: 'application/json' } });
      await transaction(this.env.DB_PRIVACY_FRESH, async (client) => {
        await client.query(
          `INSERT INTO privacy.export_manifests (id, request_id, object_key, package_hash, expires_at)
           VALUES ($1, $2, $3, $4, now() + interval '7 days')
           ON CONFLICT (request_id, object_key)
           DO UPDATE SET package_hash = EXCLUDED.package_hash, expires_at = EXCLUDED.expires_at`,
          [uuidv7(), requestId, objectKey, packageHash],
        );
        await client.query(`UPDATE privacy.requests SET state = 'completed', completed_at = now() WHERE id = $1`, [requestId]);
        await client.query(`INSERT INTO privacy.request_events (id, request_id, event_type, metadata)
          SELECT $1, $2, 'completed', $3::jsonb
           WHERE NOT EXISTS (SELECT 1 FROM privacy.request_events WHERE request_id = $2 AND event_type = 'completed')`, [uuidv7(), requestId, JSON.stringify({ objectKey, packageHash })]);
      });
      return packageHash;
    });
    return { subjectId, state: 'completed' };
  }
}

export class RetentionCleanupWorkflow extends WorkflowEntrypoint<Env, { runId: string }> {
  async run(event: WorkflowEvent<{ runId: string }>, step: WorkflowStep): Promise<{ runId: string; redactedPosts: number; deletedMedia: number }> {
    const candidates = await step.do('find-retention-candidates', async () => {
      const result = await query<{ user_id: string; content_type: string; retention_period: string }>(this.env.DB_PRIVACY_FRESH,
        `SELECT user_id, content_type, retention_period::text FROM privacy.retention_rules ORDER BY created_at LIMIT 100`);
      return result.rows;
    });
    let redactedPosts = 0;
    let deletedMedia = 0;
    for (const [index, candidate] of candidates.entries()) {
      const result = await step.do(`apply-retention-${index}`, async () => {
        const hold = await query(this.env.DB_PRIVACY_FRESH, `SELECT 1 FROM privacy.legal_holds WHERE subject_id = $1 AND active LIMIT 1`, [candidate.user_id]);
        if (hold.rowCount !== 0) return { posts: 0, media: 0 };
        if (candidate.content_type === 'post' || candidate.content_type === 'posts') {
          const updated = await query<{ id: string }>(this.env.DB_JOBS_FRESH,
            `UPDATE content.posts SET body = '[retention policy]', visibility = 'private', moderation_state = 'blocked', published_at = NULL, updated_at = now()
              WHERE author_id = $1 AND created_at < now() - $2::interval AND body <> '[retention policy]' RETURNING id`,
            [candidate.user_id, candidate.retention_period]);
          if (updated.rowCount !== 0) await query(this.env.DB_JOBS_FRESH,
            `INSERT INTO system.audit_events (id, action, target_type, reason_code, correlation_id, metadata) VALUES ($1, 'retention.posts_redacted', 'user', 'RETENTION_POLICY', $2, $3::jsonb)`,
            [uuidv7(), event.payload.runId, JSON.stringify({ subjectId: candidate.user_id, count: updated.rowCount })]);
          return { posts: updated.rowCount ?? 0, media: 0 };
        }
        if (candidate.content_type === 'media') {
          const objects = await query<{ id: string; object_key: string; byte_size: number }>(this.env.DB_JOBS_FRESH,
            `SELECT id, object_key, byte_size FROM media.objects WHERE owner_id = $1 AND created_at < now() - $2::interval AND deleted_at IS NULL`,
            [candidate.user_id, candidate.retention_period]);
          if (!this.env.MEDIA_APPROVED) throw new Error('media_purge_not_configured');
          for (const object of objects.rows) await this.env.MEDIA_APPROVED.delete(object.object_key);
          for (const object of objects.rows) {
            await query(this.env.DB_JOBS_FRESH, `UPDATE media.objects SET state = 'deleted', deleted_at = COALESCE(deleted_at, now()) WHERE id = $1 AND deleted_at IS NULL`, [object.id]);
            await query(this.env.DB_JOBS_FRESH, `UPDATE media.storage_ledger SET bytes_approved = greatest(bytes_approved - $1, 0), object_count = greatest(object_count - 1, 0), last_reconciled_at = now() WHERE user_id = $2`, [object.byte_size, candidate.user_id]);
          }
          if (objects.rowCount !== 0) await query(this.env.DB_JOBS_FRESH,
            `INSERT INTO system.audit_events (id, action, target_type, reason_code, correlation_id, metadata) VALUES ($1, 'retention.media_deleted', 'user', 'RETENTION_POLICY', $2, $3::jsonb)`,
            [uuidv7(), event.payload.runId, JSON.stringify({ subjectId: candidate.user_id, count: objects.rowCount })]);
          return { posts: 0, media: objects.rowCount ?? 0 };
        }
        return { posts: 0, media: 0 };
      });
      redactedPosts += result.posts;
      deletedMedia += result.media;
    }
    return { runId: event.payload.runId, redactedPosts, deletedMedia };
  }
}

export class AppealLifecycleWorkflow extends WorkflowEntrypoint<Env, { appealId: string }> {
  async run(event: WorkflowEvent<{ appealId: string }>, step: WorkflowStep): Promise<{ appealId: string; state: string }> {
    const appealId = event.payload.appealId;
    const state = await step.do('resolve-appeal-state', async () => {
      const result = await transaction(this.env.DB_JOBS_FRESH, async (client) => {
        const appeal = await client.query<{ state: string; case_state: string }>(
          `SELECT a.state, c.state AS case_state
             FROM moderation.appeals a
             JOIN moderation.cases c ON c.id = a.case_id
            WHERE a.id = $1`, [appealId]);
        const row = appeal.rows[0];
        if (!row) throw new Error('appeal_not_found');
        if (row.state === 'open' && row.case_state === 'resolved') {
          await client.query(`UPDATE moderation.appeals SET state = 'resolved', resolved_at = COALESCE(resolved_at, now()) WHERE id = $1 AND state = 'open'`, [appealId]);
          await client.query(
            `INSERT INTO system.audit_events (id, action, target_type, target_id, reason_code, correlation_id, metadata)
             SELECT $1, 'moderation.appeal.resolved', 'appeal', $2, 'CASE_RESOLVED', $2, $3::jsonb
              WHERE NOT EXISTS (
                SELECT 1 FROM system.audit_events
                 WHERE action = 'moderation.appeal.resolved' AND target_type = 'appeal'
                   AND target_id = $2 AND reason_code = 'CASE_RESOLVED'
              )`,
            [uuidv7(), appealId, JSON.stringify({ appealId })]
          );
          return 'resolved';
        }
        return row.state;
      });
      return result;
    });
    return { appealId, state };
  }
}

export class BackupValidationWorkflow extends WorkflowEntrypoint<Env, { runId: string }> {
  async run(event: WorkflowEvent<{ runId: string }>, step: WorkflowStep): Promise<{ runId: string; state: string }> {
    const runId = event.payload.runId;
    const database = await step.do('verify-database-capabilities', async () => {
      const extensions = await query<{ extname: string }>(this.env.DB_PRIVACY_FRESH,
        `SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'pg_trgm', 'unaccent') ORDER BY extname`);
      const required = ['pgcrypto', 'pg_trgm', 'unaccent'];
      const present = new Set(extensions.rows.map((row) => row.extname));
      const missing = required.filter((name) => !present.has(name));
      if (missing.length) throw new Error(`backup_capability_extensions_missing:${missing.join(',')}`);
      const schemaObjects = await query<{ count: string }>(this.env.DB_PRIVACY_FRESH,
        `SELECT count(*)::text AS count
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname IN ('identity', 'content', 'social', 'feed', 'moderation', 'privacy', 'trust', 'media', 'editorial', 'system')
            AND c.relkind IN ('r', 'p', 'v', 'm')`);
      if (Number(schemaObjects.rows[0]?.count ?? 0) < 76) throw new Error('backup_schema_objects_missing');
      return { extensions: required, schemaObjectCount: Number(schemaObjects.rows[0]?.count ?? 0) };
    });

    await step.do('record-backup-validation', async () => {
      await query(this.env.DB_PRIVACY_FRESH,
        `INSERT INTO system.audit_events (id, action, target_type, target_id, reason_code, correlation_id, metadata)
         SELECT $1, 'backup.schema_validation.completed', 'backup', NULL, 'SCHEMA_RECONSTRUCTION_CHECK', $2, $3::jsonb
          WHERE NOT EXISTS (
            SELECT 1 FROM system.audit_events
             WHERE action = 'backup.schema_validation.completed'
               AND correlation_id = $2
          )`,
        [uuidv7(), runId, JSON.stringify({ runId, ...database })]);
      return true;
    });
    return { runId, state: 'completed' };
  }
}
