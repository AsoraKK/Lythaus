import {
  assertTrustedCollectedReceipt,
  PROBE_LIMITS,
  PROBE_SELECTION_HASH,
  type CollectedReceipt,
  type ReceiptLedger,
} from './collector.ts';
import { CATEGORIES, hash } from './harness.ts';
import { fixtures } from './fixtures.mjs';
import { OPENAI_MODERATION_ENDPOINT } from '../../src/openai-moderation.ts';
import { OPENAI_MODERATION_MODEL } from '../../src/research-config.ts';

const RUN_FINGERPRINT_VERSION = 'lythaus-posting-feedback-run-v1';
const APPROVED_FIXTURES = fixtures.slice(0, PROBE_LIMITS.samples);
const APPROVED_SAMPLES = new Map(APPROVED_FIXTURES.map((fixture) => [fixture.id, fixture]));
const CATEGORY_SET = new Set<string>(CATEGORIES);
const FAILURE_CODES = new Set([
  'MISSING_CREDENTIAL', 'EMPTY_INPUT', 'INVALID_MIME', 'IMAGE_SIZE_LIMIT_EXCEEDED',
  'HTTP_AUTHENTICATION_FAILURE', 'HTTP_RATE_LIMITED', 'HTTP_SERVER_FAILURE', 'HTTP_FAILURE',
  'TIMEOUT', 'NETWORK_FAILURE', 'MALFORMED_RESPONSE', 'UNEXPECTED_SCHEMA',
  'RESPONSE_SIZE_LIMIT_EXCEEDED', 'INTERRUPTED_OR_TIMEOUT',
  'TRANSPORT_OR_RESPONSE_READ_FAILURE', 'EVALUATION_SCHEMA_OR_CONSISTENCY_FAILURE',
]);

export interface DatabaseLedgerQueryResult {
  rows: Array<Record<string, unknown>>;
}

/** Structural seam for the existing PlanetScale/Hyperdrive PostgreSQL client. */
export interface DatabaseLedgerClient {
  query(sql: string, values?: unknown[]): Promise<DatabaseLedgerQueryResult>;
}

interface ProbeContext {
  fingerprint: string;
  sourceSha: string;
  collectorHash: string;
}

interface SanitizedCategory {
  category: string;
  provider_flag: boolean | null;
  provider_score: number | null;
  applied_input_types: string[];
}

interface SanitizedReceipt {
  values: unknown[];
  categories: SanitizedCategory[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertHex(value: string, length: number, field: string): void {
  if (!new RegExp(`^[a-f0-9]{${length}}$`).test(value)) throw new Error(`database_ledger_invalid_${field}`);
}

function assertProbeEnvelope(): void {
  if (PROBE_LIMITS.samples !== 20 || PROBE_LIMITS.requests !== 20 || PROBE_LIMITS.retries !== 0
    || PROBE_LIMITS.windowMs !== 600_000 || PROBE_LIMITS.requestTimeoutMs !== 15_000
    || PROBE_LIMITS.maxResponseBytes !== 262_144 || PROBE_LIMITS.maxIncrementalTotalUsd !== 0
    || PROBE_SELECTION_HASH !== 'c8882fa321e8e0073a5859814dcc86287651aa2d3b9b3170b16bd009cd6e1ed6'
    || OPENAI_MODERATION_MODEL !== 'omni-moderation-latest'
    || OPENAI_MODERATION_ENDPOINT !== 'https://api.openai.com/v1/moderations'
    || APPROVED_FIXTURES.length !== 20) throw new Error('database_ledger_contract_changed');
}

async function createRunFingerprint(selectionHash: string, sourceSha: string, collectorHash: string): Promise<string> {
  return hash(JSON.stringify([
    RUN_FINGERPRINT_VERSION,
    selectionHash,
    sourceSha,
    collectorHash,
    'openai',
    OPENAI_MODERATION_MODEL,
  ]));
}

function sanitizedCategories(receipt: CollectedReceipt): SanitizedCategory[] {
  const raw = receipt.rawFeedback;
  if (!raw || !isRecord(raw.categoryFlags) || !isRecord(raw.categoryScores) || !isRecord(raw.appliedInputTypes))
    throw new Error('database_ledger_invalid_category_evidence');

  const keys = new Set([...Object.keys(raw.categoryFlags), ...Object.keys(raw.categoryScores), ...Object.keys(raw.appliedInputTypes)]);
  for (const category of keys) {
    if (!CATEGORY_SET.has(category)) throw new Error('database_ledger_unknown_category');
    if (Object.hasOwn(raw.categoryFlags, category) && typeof raw.categoryFlags[category] !== 'boolean')
      throw new Error('database_ledger_invalid_category_flag');
    if (Object.hasOwn(raw.categoryScores, category)) {
      const score = raw.categoryScores[category];
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1)
        throw new Error('database_ledger_invalid_category_score');
    }
    if (Object.hasOwn(raw.appliedInputTypes, category)) {
      const types = raw.appliedInputTypes[category];
      if (!Array.isArray(types) || types.length > 8 || types.some((type) => type !== 'text' && type !== 'image'))
        throw new Error('database_ledger_invalid_input_modalities');
    }
  }

  return CATEGORIES.filter((category) => keys.has(category)).map((category) => ({
    category,
    provider_flag: typeof raw.categoryFlags[category] === 'boolean' ? raw.categoryFlags[category] : null,
    provider_score: typeof raw.categoryScores[category] === 'number' ? raw.categoryScores[category] : null,
    applied_input_types: Array.isArray(raw.appliedInputTypes[category])
      ? [...new Set(raw.appliedInputTypes[category])]
      : [],
  }));
}

async function sanitizeReceipt(receipt: CollectedReceipt, context: ProbeContext): Promise<SanitizedReceipt> {
  assertTrustedCollectedReceipt(receipt);
  if (receipt.schemaVersion !== 'lythaus-bounded-moderation-receipt-v1'
    || receipt.selectionHash !== PROBE_SELECTION_HASH
    || receipt.sourceSha !== context.sourceSha || receipt.collectorHash !== context.collectorHash
    || receipt.provider !== 'openai' || receipt.requestedModel !== OPENAI_MODERATION_MODEL
    || receipt.providerSnapshotKnown !== false
    || !['ACTUAL_PROVIDER_OBSERVATION', 'SYNTHETIC_TRANSPORT_TEST_ONLY'].includes(receipt.evidenceClass)
    || receipt.inputClass !== 'ARTIFICIAL_AGENT_WRITTEN_NOT_HUMAN_GROUND_TRUTH')
    throw new Error('database_ledger_receipt_binding_mismatch');

  const fixture = APPROVED_SAMPLES.get(receipt.sampleId);
  if (!fixture || fixture.revision !== receipt.revision) throw new Error('database_ledger_stale_receipt');
  if (await hash(fixture.body) !== receipt.inputHash) throw new Error('database_ledger_stale_receipt');
  const responseModel = receipt.responseModel;
  if (responseModel !== null && !/^omni-moderation-[a-z0-9.-]{1,80}$/.test(responseModel))
    throw new Error('database_ledger_invalid_response_model');
  if (receipt.responseHash !== null) assertHex(receipt.responseHash, 64, 'response_hash');
  if (receipt.httpStatus !== null && (!Number.isSafeInteger(receipt.httpStatus)
    || receipt.httpStatus < 100 || receipt.httpStatus > 599)) throw new Error('database_ledger_invalid_http_status');
  if (!['ALLOW', 'REVIEW', 'BLOCK', 'PROVIDER_FAILURE'].includes(receipt.adapterStatus)
    || !['REVIEW', 'ALLOW_EVIDENCE', 'ABSTAIN'].includes(receipt.safetyBand)
    || !['RESPONSE_CAPTURED', 'UNKNOWN_NO_RETRY', 'NOT_SENT'].includes(receipt.delivery)
    || typeof receipt.adapterAccepted !== 'boolean' || typeof receipt.schemaValid !== 'boolean')
    throw new Error('database_ledger_invalid_outcome');
  if (receipt.rawFeedback.flagged !== null && typeof receipt.rawFeedback.flagged !== 'boolean')
    throw new Error('database_ledger_invalid_provider_flag');
  if (receipt.flagged !== null && typeof receipt.flagged !== 'boolean')
    throw new Error('database_ledger_invalid_adapter_flag');
  if (receipt.evidenceSchema !== null && receipt.evidenceSchema !== 'lythaus-moderation-provider-evidence-v1')
    throw new Error('database_ledger_invalid_evidence_schema');
  if (!Number.isFinite(receipt.executionMs) || receipt.executionMs < 0 || receipt.executionMs > PROBE_LIMITS.windowMs
    || !Number.isSafeInteger(receipt.transportCalls) || receipt.transportCalls < 0 || receipt.transportCalls > 1
    || !Number.isSafeInteger(receipt.actualProviderRequests) || receipt.actualProviderRequests < 0
    || receipt.actualProviderRequests > 1
    || receipt.actualProviderRequests !== (receipt.evidenceClass === 'ACTUAL_PROVIDER_OBSERVATION' ? receipt.transportCalls : 0)
    || receipt.actualProviderRequests > receipt.transportCalls)
    throw new Error('database_ledger_probe_limit_exceeded');

  const failureCode = receipt.failure === null ? null : FAILURE_CODES.has(receipt.failure)
    ? receipt.failure
    : 'UNCLASSIFIED_FAILURE';
  const explanationCode = receipt.schemaValid
    ? 'PROVIDER_FLAGS_ONLY_NO_AUTHORSHIP_OR_PUBLICATION_AUTHORITY'
    : 'NO_USABLE_SAFETY_RESULT_STOP_WITHOUT_RETRY';
  const categories = sanitizedCategories(receipt);
  return {
    categories,
    values: [
      context.fingerprint,
      receipt.sampleId,
      receipt.inputHash,
      receipt.revision,
      receipt.schemaVersion,
      receipt.evidenceClass,
      receipt.inputClass,
      receipt.provider,
      receipt.requestedModel,
      responseModel,
      receipt.providerSnapshotKnown,
      receipt.responseHash,
      receipt.httpStatus,
      receipt.adapterStatus,
      receipt.adapterAccepted,
      receipt.evidenceSchema,
      receipt.schemaValid,
      receipt.rawFeedback.flagged,
      receipt.flagged,
      receipt.safetyBand,
      receipt.delivery,
      receipt.transportCalls,
      receipt.actualProviderRequests,
      failureCode,
      Math.round(receipt.executionMs * 1000) / 1000,
      explanationCode,
      JSON.stringify(categories),
    ],
  };
}

const CLAIM_RUN_SQL = `
  INSERT INTO evaluation.posting_feedback_probe_runs
    (run_fingerprint, selection_hash, source_sha, collector_hash, provider, requested_model)
  VALUES ($1, $2, $3, $4, 'openai', $5)
  ON CONFLICT DO NOTHING
  RETURNING run_fingerprint`;

const CLAIM_SAMPLE_SQL = `
  INSERT INTO evaluation.posting_feedback_attempt_claims
    (run_fingerprint, sample_id, input_hash, revision, state)
  VALUES ($1, $2, $3, $4, 'STARTED_NO_REPLAY')
  ON CONFLICT DO NOTHING
  RETURNING sample_id`;

const COMMIT_RESULT_SQL = `
  WITH transitioned_claim AS (
    UPDATE evaluation.posting_feedback_attempt_claims
       SET state = 'RECEIPT_COMMITTED', receipt_committed_at = statement_timestamp()
     WHERE run_fingerprint = $1 AND sample_id = $2 AND input_hash = $3 AND revision = $4
       AND state = 'STARTED_NO_REPLAY'
     RETURNING run_fingerprint, sample_id
  ), capture_time AS (
    SELECT statement_timestamp() AS captured_at
  ), inserted_result AS (
    INSERT INTO evaluation.posting_feedback_results
      (run_fingerprint, sample_id, schema_version, evidence_class, input_class, provider,
       requested_model, response_model, provider_snapshot_known, response_hash, http_status,
       adapter_status, adapter_accepted, evidence_schema, schema_valid, provider_flagged,
       adapter_flagged, safety_band, delivery_status, transport_calls, actual_provider_requests,
       failure_code, execution_ms, explanation_code, captured_at, expires_at)
    SELECT transitioned_claim.run_fingerprint, transitioned_claim.sample_id,
       $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
       $21, $22, $23, $24, $25, $26, capture_time.captured_at,
       capture_time.captured_at + interval '604800 seconds'
      FROM transitioned_claim
      CROSS JOIN capture_time
    RETURNING run_fingerprint, sample_id
  ), inserted_categories AS (
    INSERT INTO evaluation.posting_feedback_result_categories
      (run_fingerprint, sample_id, category, provider_flag, provider_score, applied_input_types)
    SELECT inserted_result.run_fingerprint, inserted_result.sample_id,
       category_record.category, category_record.provider_flag, category_record.provider_score,
       category_record.applied_input_types
      FROM inserted_result
      CROSS JOIN jsonb_to_recordset($27::jsonb) AS category_record(
        category text, provider_flag boolean, provider_score numeric, applied_input_types text[])
    RETURNING category
  )
  SELECT (SELECT count(*) FROM inserted_result)::integer AS result_count,
         (SELECT count(*) FROM inserted_categories)::integer AS category_count`;

const PURGE_EXPIRED_RESULTS_SQL = `
  WITH deleted AS (
    DELETE FROM evaluation.posting_feedback_results
     WHERE expires_at <= statement_timestamp()
     RETURNING 1
  )
  SELECT count(*)::integer AS deleted_count FROM deleted`;

/**
 * Inactive adapter proposal for a durable PostgreSQL client. No provider call,
 * Jobs binding, shared transaction helper, or cleanup schedule is supplied here.
 */
export function createDatabaseReceiptLedger(database: DatabaseLedgerClient): ReceiptLedger & {
  purgeExpiredResults(): Promise<number>;
} {
  assertProbeEnvelope();
  let context: ProbeContext | null = null;
  let claimedAttempts = 0;

  return {
    durability: 'DURABLE_DATABASE',

    async claimProbe(binding) {
      if (context || binding.selectionHash !== PROBE_SELECTION_HASH)
        throw new Error('database_ledger_wrong_or_reused_probe');
      assertHex(binding.sourceSha, 40, 'source_sha');
      assertHex(binding.collectorHash, 64, 'collector_hash');
      const fingerprint = await createRunFingerprint(binding.selectionHash, binding.sourceSha, binding.collectorHash);
      const result = await database.query(CLAIM_RUN_SQL, [
        fingerprint, binding.selectionHash, binding.sourceSha, binding.collectorHash, OPENAI_MODERATION_MODEL,
      ]);
      if (result.rows.length !== 1) return false;
      context = { fingerprint, sourceSha: binding.sourceSha, collectorHash: binding.collectorHash };
      return true;
    },

    async claimAttempt(binding) {
      if (!context || claimedAttempts >= PROBE_LIMITS.requests) return false;
      const fixture = APPROVED_SAMPLES.get(binding.sampleId);
      if (!fixture) throw new Error('database_ledger_sample_not_in_frozen_selection');
      if (fixture.revision !== binding.revision || await hash(fixture.body) !== binding.inputHash)
        throw new Error('database_ledger_stale_sample_revision');
      const result = await database.query(CLAIM_SAMPLE_SQL, [
        context.fingerprint, binding.sampleId, binding.inputHash, binding.revision,
      ]);
      if (result.rows.length !== 1) return false;
      claimedAttempts += 1;
      return true;
    },

    async persistReceipt(receipt) {
      if (!context) throw new Error('database_ledger_probe_not_claimed');
      const sanitized = await sanitizeReceipt(receipt, context);
      const result = await database.query(COMMIT_RESULT_SQL, sanitized.values);
      const row = result.rows[0];
      if (Number(row?.result_count) !== 1 || Number(row?.category_count) !== sanitized.categories.length)
        throw new Error('database_ledger_receipt_not_committed');
    },

    async purgeExpiredResults() {
      const result = await database.query(PURGE_EXPIRED_RESULTS_SQL);
      return Number(result.rows[0]?.deleted_count ?? 0);
    },
  };
}
