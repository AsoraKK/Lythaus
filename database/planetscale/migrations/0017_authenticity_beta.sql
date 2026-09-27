ALTER TABLE media.upload_sessions ADD COLUMN purpose text NOT NULL DEFAULT 'standard' CHECK (purpose IN ('standard', 'authenticity_beta'));
CREATE TABLE moderation.authenticity_beta (
  case_id uuid PRIMARY KEY REFERENCES moderation.cases(id),
  owner_id uuid NOT NULL REFERENCES identity.users(id),
  upload_session_id uuid NOT NULL UNIQUE REFERENCES media.upload_sessions(id),
  object_id uuid REFERENCES media.objects(id),
  original_key text NOT NULL UNIQUE,
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  original_etag text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  state text NOT NULL DEFAULT 'uploading' CHECK (state IN ('uploading','queued','analyzing','complete','inconclusive','unsupported','failed','paused','safety_review','safety_blocked','cancelled','expired','deleted')),
  consent_version text NOT NULL,
  source_history text NOT NULL DEFAULT 'UNKNOWN' CHECK (source_history IN ('UNKNOWN','DOCUMENTED_LOSSLESS','KNOWN_DEGRADED')),
  safety jsonb,
  result jsonb,
  failure_code text,
  review_state text NOT NULL DEFAULT 'none' CHECK (review_state IN ('none','requested','reviewed')),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  purged_at timestamptz,
  storage_reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_reserved_bytes >= 0),
  display_bytes bigint NOT NULL DEFAULT 0 CHECK (display_bytes BETWEEN 0 AND 4194304),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX authenticity_beta_owner_created ON moderation.authenticity_beta(owner_id, created_at DESC);
CREATE INDEX authenticity_beta_expiry ON moderation.authenticity_beta(expires_at) WHERE state IN ('uploading','queued','analyzing','paused');
CREATE TABLE moderation.authenticity_beta_steps (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES moderation.authenticity_beta(case_id),
  revision integer NOT NULL,
  step text NOT NULL CHECK (step IN ('safety','safe','advice')),
  state text NOT NULL CHECK (state IN ('started','completed','failed','ambiguous')),
  reuse_key text NOT NULL,
  reservation_id uuid REFERENCES system.cost_budget_reservations(id),
  output jsonb,
  usage jsonb,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(case_id, revision, step)
);
CREATE INDEX authenticity_beta_reuse ON moderation.authenticity_beta_steps(reuse_key, step) WHERE state = 'completed';
CREATE TABLE moderation.authenticity_beta_feedback (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES moderation.authenticity_beta(case_id),
  actor_id uuid NOT NULL REFERENCES identity.users(id),
  kind text NOT NULL CHECK (kind IN ('feedback','review_request','review')),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  policy_version text NOT NULL,
  ground_truth boolean NOT NULL DEFAULT false CHECK (ground_truth = false),
  training_consent boolean NOT NULL DEFAULT false CHECK (training_consent = false),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE system.cost_budget_reservations ADD COLUMN measurement jsonb;
ALTER TABLE system.cost_budget_reservations ADD COLUMN billing_state text NOT NULL DEFAULT 'unverified' CHECK (billing_state IN ('unverified','measured','billed'));

CREATE FUNCTION privacy.beta_subject_has_hold(p_subject_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, privacy AS $$
  SELECT EXISTS(SELECT 1 FROM privacy.legal_holds WHERE subject_id=p_subject_id AND active);
$$;
REVOKE ALL ON FUNCTION privacy.beta_subject_has_hold(uuid) FROM PUBLIC;

CREATE FUNCTION privacy.record_beta_location(p_subject_id uuid, p_case_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, privacy, moderation AS $$
  INSERT INTO privacy.subject_data_locations(subject_id,store_type,resource_reference,entity_type,entity_id,authoritative_or_derived,retention_class)
  SELECT owner_id,'r2',original_key,'authenticity_beta',case_id,'authoritative','media'
  FROM moderation.authenticity_beta WHERE case_id=p_case_id AND owner_id=p_subject_id AND deleted_at IS NULL
  ON CONFLICT DO NOTHING;
$$;
REVOKE ALL ON FUNCTION privacy.record_beta_location(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION privacy.remove_beta_location(p_subject_id uuid, p_case_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, privacy, moderation AS $$
  DELETE FROM privacy.subject_data_locations WHERE subject_id=p_subject_id AND entity_type='authenticity_beta' AND entity_id=p_case_id
  AND EXISTS(SELECT 1 FROM moderation.authenticity_beta WHERE case_id=p_case_id AND owner_id=p_subject_id AND purged_at IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION privacy.remove_beta_location(uuid,uuid) FROM PUBLIC;
