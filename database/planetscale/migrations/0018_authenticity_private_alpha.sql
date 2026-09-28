ALTER TABLE media.upload_sessions DROP CONSTRAINT IF EXISTS upload_sessions_purpose_check;
ALTER TABLE media.upload_sessions
  ADD CONSTRAINT upload_sessions_purpose_check
  CHECK (purpose IN ('standard', 'authenticity_beta', 'authenticity_alpha'));
ALTER TABLE media.upload_sessions DROP CONSTRAINT IF EXISTS upload_sessions_status_check;
ALTER TABLE media.upload_sessions
  ADD CONSTRAINT upload_sessions_status_check
  CHECK (status IN ('pending', 'queued', 'approved', 'rejected', 'expired', 'cancelled'));

CREATE TABLE moderation.authenticity_alpha (
  case_id uuid PRIMARY KEY REFERENCES moderation.cases(id),
  owner_id uuid NOT NULL REFERENCES identity.users(id),
  content_kind text NOT NULL CHECK (content_kind IN ('text', 'image', 'text_image')),
  text_body text CHECK (text_body IS NULL OR length(text_body) BETWEEN 1 AND 20000),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  content_type text NOT NULL,
  upload_session_id uuid UNIQUE REFERENCES media.upload_sessions(id),
  object_id uuid REFERENCES media.objects(id),
  original_key text UNIQUE,
  original_etag text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  state text NOT NULL DEFAULT 'queued'
    CHECK (state IN ('uploading','queued','analyzing','complete','inconclusive','unsupported','failed','paused','safety_review','safety_blocked','cancelled','expired','deleted')),
  consent_version text NOT NULL,
  observer_requested boolean NOT NULL DEFAULT false,
  explanation_requested boolean NOT NULL DEFAULT false,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  failure_code text,
  review_state text NOT NULL DEFAULT 'none' CHECK (review_state IN ('none','requested','reviewed')),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  advice_attempts integer NOT NULL DEFAULT 0 CHECK (advice_attempts BETWEEN 0 AND 1),
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX authenticity_alpha_owner_created
  ON moderation.authenticity_alpha(owner_id, created_at DESC);
CREATE INDEX authenticity_alpha_expiry
  ON moderation.authenticity_alpha(expires_at)
  WHERE state IN ('uploading','queued','analyzing','paused');

CREATE TABLE moderation.authenticity_alpha_steps (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES moderation.authenticity_alpha(case_id),
  revision integer NOT NULL,
  component text NOT NULL CHECK (component IN ('safety_text','safety_image','safe','forensics','observer','adviser')),
  state text NOT NULL CHECK (state IN ('started','completed','skipped','unsupported','failed','timed_out','ambiguous')),
  reuse_key text NOT NULL,
  output jsonb,
  usage jsonb,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(case_id, revision, component)
);

CREATE INDEX authenticity_alpha_step_reuse
  ON moderation.authenticity_alpha_steps(reuse_key, component)
  WHERE state = 'completed';

CREATE TABLE moderation.authenticity_alpha_feedback (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES moderation.authenticity_alpha(case_id),
  actor_id uuid NOT NULL REFERENCES identity.users(id),
  kind text NOT NULL CHECK (kind IN ('feedback','review_request','review')),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  policy_version text NOT NULL,
  ground_truth boolean NOT NULL DEFAULT false CHECK (ground_truth = false),
  training_consent boolean NOT NULL DEFAULT false CHECK (training_consent = false),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION privacy.record_alpha_location(p_subject_id uuid, p_case_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, privacy, moderation AS $$
  INSERT INTO privacy.subject_data_locations(subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT owner_id, 'r2', original_key, 'authenticity_alpha', case_id, 'authoritative', 'media'
    FROM moderation.authenticity_alpha
   WHERE case_id = p_case_id AND owner_id = p_subject_id AND deleted_at IS NULL AND original_key IS NOT NULL
  ON CONFLICT DO NOTHING;
$$;
REVOKE ALL ON FUNCTION privacy.record_alpha_location(uuid, uuid) FROM PUBLIC;

CREATE FUNCTION privacy.remove_alpha_location(p_subject_id uuid, p_case_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, privacy, moderation AS $$
  DELETE FROM privacy.subject_data_locations
   WHERE subject_id = p_subject_id
     AND entity_type = 'authenticity_alpha'
     AND entity_id = p_case_id
     AND EXISTS (
       SELECT 1 FROM moderation.authenticity_alpha
        WHERE case_id = p_case_id AND owner_id = p_subject_id AND purged_at IS NOT NULL
     );
$$;
REVOKE ALL ON FUNCTION privacy.remove_alpha_location(uuid, uuid) FROM PUBLIC;
