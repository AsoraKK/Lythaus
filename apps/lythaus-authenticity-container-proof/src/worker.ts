import { Container, getContainer } from '@cloudflare/containers';
import { assertUuidV7, uuidv7, type UUIDv7 } from '@lythaus/authenticity';
import { query } from '@lythaus/db';

export class LythausForensicsContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = '5m';
  enableInternet = false;
  pingEndpoint = '/health';
  envVars = { NODE_ENV: 'production', LYTHAUS_FORENSICS_MODE: 'proof-only' };

  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/health') return Response.json({ status: 'ok', proofOnly: true });
    return this.containerFetch(request);
  }

  override onStart(): void {
    console.log(JSON.stringify({ event: 'authenticity_container_started', proofOnly: true }));
  }

  override onError(error: unknown): void {
    console.error(JSON.stringify({ event: 'authenticity_container_error', error: error instanceof Error ? error.message : 'container_error' }));
  }
}

interface ProofResult {
  schemaVersion: 'lythaus-container-forensic-proof-v1';
  caseId: UUIDv7;
  sha256: string;
  byteLength: number;
  mime: string;
  featureVector: readonly number[];
  coldStart: boolean;
  executionMs: number;
  cpuTimeMs: number;
  residentMemoryMb: number;
  estimatedCostUsd: number | null;
  enforcementAuthority: 'NONE';
}

function proofEnabled(env: Env): boolean {
  return String(env.AUTHENTICITY_CONTAINER_PROOF_ENABLED) === 'true';
}

function parseProofResult(value: unknown): ProofResult | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ProofResult>;
  if (candidate.schemaVersion !== 'lythaus-container-forensic-proof-v1' || typeof candidate.caseId !== 'string' || typeof candidate.sha256 !== 'string' || typeof candidate.byteLength !== 'number' || !Array.isArray(candidate.featureVector) || typeof candidate.coldStart !== 'boolean' || typeof candidate.executionMs !== 'number' || typeof candidate.cpuTimeMs !== 'number' || typeof candidate.residentMemoryMb !== 'number' || (candidate.estimatedCostUsd !== null && typeof candidate.estimatedCostUsd !== 'number') || candidate.enforcementAuthority !== 'NONE') return null;
  try { assertUuidV7(candidate.caseId, 'caseId'); } catch { return null; }
  return { schemaVersion: candidate.schemaVersion, caseId: candidate.caseId, sha256: candidate.sha256, byteLength: candidate.byteLength, mime: typeof candidate.mime === 'string' ? candidate.mime : 'unknown', featureVector: candidate.featureVector.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)), coldStart: candidate.coldStart, executionMs: candidate.executionMs, cpuTimeMs: candidate.cpuTimeMs, residentMemoryMb: candidate.residentMemoryMb, estimatedCostUsd: candidate.estimatedCostUsd ?? null, enforcementAuthority: 'NONE' };
}

async function readBounded(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maxBytes) {
        await reader.cancel('proof_payload_too_large');
        throw new Error('proof_payload_too_large');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function writeProof(env: Env, result: ProofResult): Promise<void> {
  await query(env.DB_JOBS_FRESH,
    `INSERT INTO system.audit_events (id, action, target_type, target_id, reason_code, correlation_id, metadata)
     VALUES ($1, 'authenticity.container.proof.completed', 'authenticity_case', $2, 'CONTAINER_PROOF_ONLY', $2, $3::jsonb)`,
    [uuidv7(), result.caseId, JSON.stringify(result)]);
}

async function processProofMessage(message: Message<unknown>, env: Env): Promise<void> {
  if (!proofEnabled(env)) { message.ack(); return; }
  if (!env.MEDIA_QUARANTINE || !env.FORENSICS_CONTAINER || !env.DB_JOBS_FRESH) throw new Error('container_proof_bindings_missing');
  const body = message.body;
  if (!body || typeof body !== 'object') throw new Error('container_proof_message_invalid');
  const payload = body as { eventType?: unknown; caseId?: unknown; objectKey?: unknown };
  if (payload.eventType !== 'authenticity.container.proof' || typeof payload.caseId !== 'string' || typeof payload.objectKey !== 'string') throw new Error('container_proof_message_invalid');
  assertUuidV7(payload.caseId, 'caseId');
  const object = await env.MEDIA_QUARANTINE.get(payload.objectKey);
  if (!object) throw new Error('container_proof_object_missing');
  if (object.size !== undefined && object.size > 10 * 1024 * 1024) throw new Error('container_proof_object_too_large');
  const bytes = await readBounded(object.body, 10 * 1024 * 1024);
  const container = getContainer(env.FORENSICS_CONTAINER, `case-${payload.caseId}`);
  const response = await container.fetch(new Request('http://forensics/process', { method: 'POST', headers: { 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream', 'x-case-id': payload.caseId }, body: bytes }));
  if (!response.ok) throw new Error('container_proof_forensic_request_failed');
  const parsed = parseProofResult(await response.json());
  if (!parsed) throw new Error('container_proof_result_invalid');
  await writeProof(env, parsed);
  message.ack();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ status: 'ok', enabled: proofEnabled(env), proofOnly: true });
    if (url.pathname === '/container-health') {
      if (!proofEnabled(env)) return new Response(null, { status: 404 });
      return getContainer(env.FORENSICS_CONTAINER, 'health').fetch(new Request('http://forensics/health'));
    }
    return new Response('not_found', { status: 404 });
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try { await processProofMessage(message, env); } catch (error) {
        console.error(JSON.stringify({ event: 'authenticity_container_proof_failed', error: error instanceof Error ? error.message : 'proof_failed' }));
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;
