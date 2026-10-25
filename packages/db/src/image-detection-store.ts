import type { DatabaseClient } from './index.ts';
import { canonicalDetectionBinding, compileDetectionEvidence, detectionBindingHash, IMAGE_DETECTION_VERSION,
  type DetectionJob, type DetectionReason, type ImageDetectionBinding, type ImageDetectionEvidence } from '../../authenticity/src/image-detection-contract.ts';
import type { DetectionStore } from '../../authenticity/src/image-detection.ts';
import { assertUuidV7 } from '../../authenticity/src/uuid.ts';

export type DetectionTransaction = <T>(work: (client: DatabaseClient) => Promise<T>) => Promise<T>;
interface StoredJob {
  id: string; binding: ImageDetectionBinding | null; binding_hash: string; state: DetectionJob['state']; attempts: number;
  attempt_id: string | null; dispatch_started_at: Date | null; lease_until: Date | null; expires_at: Date;
  created_at: Date; updated_at: Date; evidence: ImageDetectionEvidence | null; reason: DetectionReason | null;
}
function project(row: StoredJob): DetectionJob {
  return { id: row.id, binding: row.binding, bindingHash: row.binding_hash, state: row.state, attempts: row.attempts,
    attemptId: row.attempt_id, dispatchStartedAt: row.dispatch_started_at?.toISOString() ?? null,
    leaseUntil: row.lease_until?.toISOString() ?? null, expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), evidence: row.evidence, reason: row.reason };
}

async function load(client: DatabaseClient, id: string, lock = false): Promise<DetectionJob | null> {
  const result = await client.query<StoredJob>(`SELECT * FROM media.image_detection_jobs WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id]);
  return result.rows[0] ? project(result.rows[0]) : null;
}

async function lockParents(client: DatabaseClient, b: ImageDetectionBinding): Promise<{ reason: DetectionReason | null; expiresAt: Date | null }> {
  const owner = await client.query<{ status: string; deleted_at: Date | null }>(
    'SELECT status,deleted_at FROM identity.users WHERE id=$1 FOR SHARE', [b.ownerId]);
  if (owner.rows[0]?.status !== 'active' || owner.rows[0]?.deleted_at !== null) return { reason: 'DELETED', expiresAt: null };
  const session = await client.query<{ current: boolean; quarantine_deleted_at: Date | null; expires_at: Date }>(
    `SELECT (user_id=$2 AND object_key=$3 AND checksum_sha256=$4 AND expected_bytes=$5 AND content_type=$6
      AND purpose='standard' AND status='approved') AS current, quarantine_deleted_at, expires_at
     FROM media.upload_sessions WHERE id=$1 FOR SHARE`,
    [b.uploadSessionId, b.ownerId, b.original.key, b.original.sha256, b.original.bytes, b.original.mime]);
  if (!session.rows[0]?.current) return { reason: 'SUPERSEDED', expiresAt: null };
  if (session.rows[0].quarantine_deleted_at) return { reason: 'CLEANUP', expiresAt: null };
  const media = await client.query<{ current: boolean; deleted_at: Date | null }>(
    `SELECT (owner_id=$2 AND sha256=$3 AND state='review' AND object_key=$4) AS current, deleted_at
       FROM media.objects WHERE id=$1 FOR SHARE`,
    [b.objectId, b.ownerId, b.contentVersion, `approved/${b.ownerId}/${b.uploadSessionId}.webp`]);
  if (media.rows[0]?.deleted_at || !media.rows[0]) return { reason: 'DELETED', expiresAt: null };
  if (!media.rows[0].current) return { reason: 'SUPERSEDED', expiresAt: null };
  const ownership = await client.query<{ owner_id: string }>('SELECT owner_id FROM media.ownership WHERE object_id=$1 FOR SHARE', [b.objectId]);
  if (ownership.rows[0]?.owner_id !== b.ownerId) return { reason: 'SUPERSEDED', expiresAt: null };
  const events = await client.query<{ id: string }>(
    `SELECT id FROM system.outbox_events WHERE actor_id=$1 AND aggregate_id=$2 AND aggregate_type='upload_session'
      AND event_type='media.upload.finalised' AND payload->>'uploadSessionId'=$2::text AND payload->>'objectKey'=$3
      FOR SHARE`, [b.ownerId, b.uploadSessionId, b.original.key]);
  if (events.rows.length !== 1 || events.rows[0].id !== b.sourceEventId) return { reason: 'SUPERSEDED', expiresAt: null };
  return { reason: null, expiresAt: session.rows[0].expires_at };
}

async function invalidateLocked(client: DatabaseClient, id: string, reason: DetectionReason): Promise<void> {
  await client.query(`UPDATE media.image_detection_jobs SET
    state=CASE WHEN $2='DELETED' THEN 'deleted' WHEN $2='CANCELLED' THEN 'cancelled' ELSE 'inconclusive' END,
    binding=CASE WHEN $2='DELETED' THEN NULL ELSE binding END, evidence=NULL, lease_until=NULL,
    reason=$2, updated_at=clock_timestamp() WHERE id=$1 AND state<>'deleted'
      AND (state<>'cancelled' OR $2='DELETED')`, [id, reason]);
}

async function current(client: DatabaseClient, snapshot: DetectionJob): Promise<DetectionJob> {
  if (snapshot.binding && await detectionBindingHash(snapshot.binding) !== snapshot.bindingHash) throw new Error('image_detection_identity_invalid');
  const parents = snapshot.binding ? await lockParents(client, snapshot.binding) : { reason: null, expiresAt: null };
  const job = await load(client, snapshot.id, true);
  if (!job) throw new Error('image_detection_job_removed');
  if (job.state === 'deleted' || job.state === 'cancelled') return job;
  if (parents.reason) await invalidateLocked(client, job.id, parents.reason);
  else {
    await client.query(`UPDATE media.image_detection_jobs SET state='inconclusive',reason='EXPIRED',evidence=NULL,
      lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1 AND expires_at<=clock_timestamp()
        AND (state IN ('queued','processing','completed') OR evidence IS NOT NULL)`, [job.id]);
    await client.query(`UPDATE media.image_detection_jobs SET
      state=CASE WHEN dispatch_started_at IS NOT NULL THEN 'inconclusive' WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,
      reason=CASE WHEN dispatch_started_at IS NOT NULL THEN 'ATTEMPT_CONSUMED' ELSE 'TIMEOUT' END,
      lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1 AND state='processing' AND lease_until<=clock_timestamp()`, [job.id]);
  }
  return (await load(client, job.id))!;
}

export function createImageDetectionStore(transaction: DetectionTransaction): DetectionStore {
  async function active(client: DatabaseClient, id: string, attemptId: string): Promise<DetectionJob | null> {
    const snapshot = await load(client, id);
    if (!snapshot) return null;
    const job = await current(client, snapshot);
    return job.state === 'processing' && job.attemptId === attemptId ? job : null;
  }
  return {
    async admit(id, binding, expiresAt) {
      assertUuidV7(id);
      const bindingHash = await detectionBindingHash(binding);
      if (!Number.isFinite(Date.parse(expiresAt))) throw new Error('image_detection_expiry_invalid');
      return transaction(async client => {
        const parents = await lockParents(client, binding);
        if (parents.reason || !parents.expiresAt || Date.parse(expiresAt) > parents.expiresAt.getTime()) throw new Error('image_detection_source_not_current');
        await client.query(`INSERT INTO media.image_detection_jobs
          (id,owner_id,upload_session_id,source_event_id,object_id,binding_hash,binding,state,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'queued',$8) ON CONFLICT(object_id) DO NOTHING`,
          [id, binding.ownerId, binding.uploadSessionId, binding.sourceEventId, binding.objectId, bindingHash, JSON.stringify(binding), expiresAt]);
        const result = await client.query<StoredJob>('SELECT * FROM media.image_detection_jobs WHERE object_id=$1 FOR UPDATE', [binding.objectId]);
        const job = project(result.rows[0]);
        if (!job.binding || canonicalDetectionBinding(job.binding) !== canonicalDetectionBinding(binding)
          || job.bindingHash !== bindingHash || Date.parse(expiresAt) !== Date.parse(job.expiresAt)) throw new Error('image_detection_identity_conflict');
        return job;
      });
    },
    async read(id, ownerId) {
      return transaction(async client => {
        const row = await client.query<StoredJob>('SELECT * FROM media.image_detection_jobs WHERE id=$1 AND owner_id=$2', [id, ownerId]);
        return row.rows[0] ? current(client, project(row.rows[0])) : null;
      });
    },
    async claim(id, eventId, bindingHash, attemptId, leaseMs) {
      assertUuidV7(attemptId);
      if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 120_000) throw new Error('image_detection_timeout_invalid');
      return transaction(async client => {
        const snapshot = await load(client, id);
        if (!snapshot?.binding || snapshot.binding.sourceEventId !== eventId || snapshot.bindingHash !== bindingHash) return null;
        const job = await current(client, snapshot);
        if (job.state !== 'queued' || job.attempts >= 3) return null;
        const result = await client.query<StoredJob>(`UPDATE media.image_detection_jobs SET state='processing',attempts=attempts+1,
          attempt_id=$2,dispatch_started_at=NULL,reason=NULL,lease_until=LEAST(expires_at,clock_timestamp()+$3*interval '1 millisecond'),
          updated_at=clock_timestamp() WHERE id=$1 AND state='queued' AND expires_at>clock_timestamp() RETURNING *`, [id, attemptId, leaseMs]);
        return result.rows[0] ? project(result.rows[0]) : null;
      });
    },
    async startDispatch(id, attemptId) {
      return transaction(async client => {
        const job = await active(client, id, attemptId);
        if (!job || job.dispatchStartedAt) return null;
        const result = await client.query<StoredJob>(`UPDATE media.image_detection_jobs SET dispatch_started_at=clock_timestamp(),
          updated_at=clock_timestamp() WHERE id=$1 AND attempt_id=$2 AND dispatch_started_at IS NULL
          AND lease_until>clock_timestamp() AND expires_at>clock_timestamp() RETURNING *`, [id, attemptId]);
        return result.rows[0] ? project(result.rows[0]) : null;
      });
    },
    async settle(id, attemptId, state, evidence, reason) {
      return transaction(async client => {
        const job = await active(client, id, attemptId);
        if (!job) return false;
        if (evidence) {
          const expected = compileDetectionEvidence(job, { schemaVersion: IMAGE_DETECTION_VERSION, bindingHash: evidence.bindingHash,
            attemptId: evidence.attemptId, evaluator: evidence.evaluator, evidenceKind: evidence.evidenceKind,
            safety: evidence.safety, authorship: evidence.authorship.observation }, evidence.completedAt);
          if (JSON.stringify(expected) !== JSON.stringify(evidence)) throw new Error('image_detection_evidence_invalid');
        }
        if (state === 'completed' && (!evidence || evidence.safety !== 'ALLOW'
          || !['SYNTHETIC_LIKE_EVIDENCE','NO_POSITIVE_EVIDENCE'].includes(evidence.authorship.observation))) throw new Error('image_detection_evidence_invalid');
        const result = await client.query(`UPDATE media.image_detection_jobs SET state=$3,evidence=$4::jsonb,reason=$5,
          lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1 AND attempt_id=$2 AND state='processing'
          AND lease_until>clock_timestamp() AND expires_at>clock_timestamp() RETURNING id`, [id, attemptId, state, evidence ? JSON.stringify(evidence) : null, reason]);
        return result.rowCount === 1;
      });
    },
    async retryBeforeDispatch(id, attemptId, reason) {
      return transaction(async client => {
        const job = await active(client, id, attemptId);
        if (!job) return;
        await client.query(`UPDATE media.image_detection_jobs SET
          state=CASE WHEN dispatch_started_at IS NOT NULL THEN 'inconclusive' WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,
          reason=CASE WHEN dispatch_started_at IS NOT NULL THEN 'ATTEMPT_CONSUMED' ELSE $3 END,
          lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1 AND attempt_id=$2`, [id, attemptId, reason]);
      });
    },
    async invalidate(id, ownerId, reason) {
      return transaction(async client => {
        const row = await client.query<StoredJob>('SELECT * FROM media.image_detection_jobs WHERE id=$1 AND owner_id=$2', [id, ownerId]);
        if (!row.rows[0]) return;
        await current(client, project(row.rows[0]));
        await invalidateLocked(client, id, reason);
      });
    },
  };
}
