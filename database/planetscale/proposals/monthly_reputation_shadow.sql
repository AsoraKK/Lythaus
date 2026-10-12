CREATE TABLE trust.monthly_reputation_sources (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  source_month date NOT NULL CHECK (extract(day FROM source_month) = 1),
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  catalogue_hash text NOT NULL CHECK (catalogue_hash ~ '^[0-9a-f]{64}$'),
  revision integer NOT NULL CHECK (revision > 0),
  supersedes_id uuid,
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{0,99}$'),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  input_digest text NOT NULL CHECK (input_digest ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_user_id, source_month, policy_version, revision),
  UNIQUE (id, subject_user_id, source_month, policy_version),
  FOREIGN KEY (supersedes_id, subject_user_id, source_month, policy_version)
    REFERENCES trust.monthly_reputation_sources(id, subject_user_id, source_month, policy_version),
  CHECK ((revision = 1 AND supersedes_id IS NULL) OR (revision > 1 AND supersedes_id IS NOT NULL)),
  CHECK (input @> jsonb_build_object('policyVersion', policy_version, 'sourceMonth', to_char(source_month, 'YYYY-MM')))
);

CREATE UNIQUE INDEX monthly_reputation_sources_successor_idx
  ON trust.monthly_reputation_sources(supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE TABLE trust.monthly_reputation_assessments (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  source_id uuid NOT NULL UNIQUE REFERENCES trust.monthly_reputation_sources(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'shadow' CHECK (mode = 'shadow'),
  calculation jsonb NOT NULL CHECK (jsonb_typeof(calculation) = 'object'),
  weekly_points integer NOT NULL CHECK (weekly_points BETWEEN 0 AND 10000),
  monthly_points integer NOT NULL CHECK (monthly_points BETWEEN 0 AND 2500),
  quarterly_points integer NOT NULL CHECK (quarterly_points IN (0, 1000)),
  source_score integer NOT NULL CHECK (source_score BETWEEN 0 AND 13500),
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 5),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_score = weekly_points + monthly_points + quarterly_points),
  CHECK (level = CASE WHEN source_score < 1000 THEN 1 WHEN source_score < 3000 THEN 2
    WHEN source_score < 6000 THEN 3 WHEN source_score < 10000 THEN 4 ELSE 5 END),
  CHECK (calculation @> jsonb_build_object('weeklyPoints', weekly_points, 'monthlyPoints', monthly_points,
    'quarterlyPoints', quarterly_points, 'sourceScore', source_score, 'level', level))
);

CREATE FUNCTION trust.reject_monthly_reputation_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'monthly_reward_snapshot_corrections' THEN
    IF TG_OP = 'UPDATE' THEN
      IF pg_trigger_depth() > 1
        AND NEW.evidence_reference = '[redacted]'
        AND NEW.request_digest = repeat('0', 64)
        AND (to_jsonb(NEW) - ARRAY['evidence_reference','request_digest'])
          = (to_jsonb(OLD) - ARRAY['evidence_reference','request_digest'])
        AND EXISTS (SELECT 1 FROM identity.users account
          WHERE account.id = OLD.subject_user_id
            AND (account.status = 'deleted' OR account.deleted_at IS NOT NULL)) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'monthly_reputation_revision_is_immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER monthly_reputation_sources_immutable BEFORE UPDATE
  ON trust.monthly_reputation_sources FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reputation_assessments_immutable BEFORE UPDATE
  ON trust.monthly_reputation_assessments FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();

GRANT SELECT, INSERT ON trust.monthly_reputation_sources, trust.monthly_reputation_assessments TO lythaus_jobs;
GRANT SELECT ON system.feature_flags TO lythaus_jobs;
GRANT SELECT, DELETE ON trust.monthly_reputation_sources, trust.monthly_reputation_assessments TO lythaus_privacy;

-- WP08_SOURCE_ASSESSMENT_V2_PREPARATION_UPGRADE
-- Versioned upgrade proposal: execute only in a disposable local PG17 fixture.
-- Not registered as a production migration and not permission to apply DDL.
-- The v1 prefix above is retained for old-writer/old-row upgrade validation.
-- Apply this suffix in one transaction; failed validation must roll it back.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'trust.monthly_reputation_sources'::regclass
      AND conname = 'monthly_reputation_sources_policy_version_check')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'trust.monthly_reputation_assessments'::regclass
      AND conname = 'monthly_reputation_assessments_quarterly_points_check')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'trust.monthly_reputation_assessments'::regclass
      AND conname = 'monthly_reputation_assessments_source_score_check') THEN
    RAISE EXCEPTION 'monthly_reputation_v2_baseline_requires_review' USING ERRCODE = '55000';
  END IF;
END; $$;

ALTER TABLE trust.monthly_reputation_sources
  ADD CONSTRAINT monthly_reputation_source_policy_catalogue_v2 CHECK (
    (policy_version = 'lythaus-monthly-rewards-2026-10-v1'
      AND catalogue_hash = 'bc8be9d8f4cae4b0f3ec327e09f308069dd3e6b07e8ff57ccc6a6cc62435f5a2')
    OR (policy_version = 'lythaus-monthly-rewards-2026-10-v2'
      AND catalogue_hash = '26213abccce99ee51be6c0623406c28aaa7d39ed3ea3b4ac630b7cffd859db67')
  ) NOT VALID;
ALTER TABLE trust.monthly_reputation_sources
  ADD CONSTRAINT monthly_reputation_source_preparation_components_v2 CHECK (COALESCE(
    policy_version = 'lythaus-monthly-rewards-2026-10-v1' OR (
      input @> '{"preparationOnly":true}'::jsonb
      AND input -> 'emailPoints' IN ('0'::jsonb, '1000'::jsonb)
      AND input -> 'suggestionPoints' IN ('0'::jsonb, '150'::jsonb)
      AND input -> 'quarterlyPoints' IN ('0'::jsonb, '150'::jsonb, '1000'::jsonb, '1150'::jsonb)
      AND (input ->> 'quarterlyPoints')::integer = (input ->> 'emailPoints')::integer
        + (input ->> 'suggestionPoints')::integer
    ), false)) NOT VALID;
ALTER TABLE trust.monthly_reputation_sources
  ADD CONSTRAINT monthly_reputation_source_id_policy_v2 UNIQUE (id, policy_version);

ALTER TABLE trust.monthly_reputation_assessments
  ADD COLUMN policy_version text NOT NULL DEFAULT 'lythaus-monthly-rewards-2026-10-v1';
ALTER TABLE trust.monthly_reputation_assessments
  ADD CONSTRAINT monthly_reputation_assessment_source_policy_v2
    FOREIGN KEY (source_id, policy_version)
    REFERENCES trust.monthly_reputation_sources(id, policy_version) ON DELETE CASCADE NOT VALID;
ALTER TABLE trust.monthly_reputation_assessments
  ADD CONSTRAINT monthly_reputation_assessment_caps_v2 CHECK (COALESCE(
    (policy_version = 'lythaus-monthly-rewards-2026-10-v1'
      AND quarterly_points IN (0, 1000) AND source_score BETWEEN 0 AND 13500
      AND (NOT calculation ? 'policyVersion'
        OR calculation @> jsonb_build_object('policyVersion', policy_version)))
    OR (policy_version = 'lythaus-monthly-rewards-2026-10-v2'
      AND quarterly_points IN (0, 150, 1000, 1150) AND source_score BETWEEN 0 AND 13650
      AND calculation @> jsonb_build_object('policyVersion', policy_version, 'preparationOnly', true)
      AND calculation -> 'emailPoints' IN ('0'::jsonb, '1000'::jsonb)
      AND calculation -> 'suggestionPoints' IN ('0'::jsonb, '150'::jsonb)
      AND quarterly_points = (calculation ->> 'emailPoints')::integer
        + (calculation ->> 'suggestionPoints')::integer), false)) NOT VALID;

ALTER TABLE trust.monthly_reputation_sources
  VALIDATE CONSTRAINT monthly_reputation_source_policy_catalogue_v2;
ALTER TABLE trust.monthly_reputation_sources
  VALIDATE CONSTRAINT monthly_reputation_source_preparation_components_v2;
ALTER TABLE trust.monthly_reputation_assessments
  VALIDATE CONSTRAINT monthly_reputation_assessment_source_policy_v2;
ALTER TABLE trust.monthly_reputation_assessments
  VALIDATE CONSTRAINT monthly_reputation_assessment_caps_v2;

-- Stronger checks are validated before removing the v1-only checks.
-- No source/assessment data, digest, revision, lineage, mode or privilege changes.
ALTER TABLE trust.monthly_reputation_sources
  DROP CONSTRAINT monthly_reputation_sources_policy_version_check;
ALTER TABLE trust.monthly_reputation_assessments
  DROP CONSTRAINT monthly_reputation_assessments_quarterly_points_check,
  DROP CONSTRAINT monthly_reputation_assessments_source_score_check;
