-- Review-only proposal. Not in the migration manifest; no live DDL or grants.
CREATE TABLE media.image_detection_jobs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES identity.users(id),
  upload_session_id uuid NOT NULL REFERENCES media.upload_sessions(id),
  source_event_id uuid NOT NULL REFERENCES system.outbox_events(id),
  object_id uuid NOT NULL UNIQUE REFERENCES media.objects(id) ON DELETE CASCADE,
  binding_hash text NOT NULL CHECK (binding_hash ~ '^[a-f0-9]{64}$'),
  binding jsonb,
  state text NOT NULL CHECK (state IN ('queued','processing','completed','failed','inconclusive','cancelled','deleted')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  attempt_id uuid,
  dispatch_started_at timestamptz,
  lease_until timestamptz,
  expires_at timestamptz NOT NULL,
  evidence jsonb,
  reason text CHECK (reason IN ('ORIGINAL_UNAVAILABLE','ORIGINAL_CHANGED','INTEGRITY_FAILED','SOURCE_UNAVAILABLE',
    'ATTEMPT_CONSUMED','TIMEOUT','EXPIRED','INVALID_RESULT','CANCELLED','DELETED','CLEANUP','SUPERSEDED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (expires_at > created_at),
  CHECK ((state = 'processing') = (lease_until IS NOT NULL)),
  CHECK (state <> 'processing' OR attempt_id IS NOT NULL),
  CHECK ((state = 'deleted') = (binding IS NULL)),
  CHECK (state NOT IN ('cancelled','deleted') OR evidence IS NULL),
  CHECK (evidence IS NULL OR ((state IN ('completed','inconclusive')
    AND evidence->>'schemaVersion' = 'lythaus-image-detection-v1'
    AND evidence->>'bindingHash' = binding_hash
    AND evidence->>'attemptId' = attempt_id::text
    AND evidence->>'evidenceKind' = 'synthetic'
    AND evidence->'policy' = '{"version":"image-evaluation-only-v1","outcome":"review_required","publicationEligible":false,"reputationEligible":false,"enforcementAuthority":false}'::jsonb) IS TRUE)),
  CHECK (state <> 'completed' OR evidence IS NOT NULL)
);
CREATE INDEX image_detection_jobs_pending ON media.image_detection_jobs (expires_at, id)
  WHERE state IN ('queued','processing');
