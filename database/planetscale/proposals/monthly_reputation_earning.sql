CREATE TABLE trust.monthly_earning_rule_sets (
  version text PRIMARY KEY,
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  catalogue_hash text NOT NULL CHECK (catalogue_hash ~ '^[0-9a-f]{64}$'),
  mode text NOT NULL CHECK (mode = 'shadow'),
  collect_from timestamptz NOT NULL,
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (configuration @> jsonb_build_object('version', version, 'status', 'pending_owner_approval'))
);

CREATE TABLE trust.monthly_earning_contributions (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('post', 'comment')),
  source_id uuid NOT NULL,
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  performed_at timestamptz NOT NULL,
  week_start timestamptz NOT NULL,
  UNIQUE (policy_version, source_type, source_id),
  CHECK (performed_at >= week_start AND performed_at < week_start + interval '7 days')
);
CREATE INDEX monthly_earning_contributions_week_idx
  ON trust.monthly_earning_contributions(subject_user_id, week_start, policy_version);

CREATE TABLE trust.monthly_earning_evidence_revisions (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  contribution_id uuid NOT NULL REFERENCES trust.monthly_earning_contributions(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  source_event_id uuid NOT NULL,
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  input_digest text NOT NULL CHECK (input_digest ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contribution_id, revision),
  UNIQUE (contribution_id, source_event_id),
  CHECK (input ->> 'workId' = contribution_id::text)
);

CREATE TABLE trust.monthly_earning_receipts (
  event_id uuid NOT NULL,
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  subject_user_id uuid REFERENCES identity.users(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, policy_version)
);

CREATE TABLE trust.monthly_earning_week_revisions (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  week_id uuid NOT NULL CHECK (substring(week_id::text, 15, 1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  week_start timestamptz NOT NULL,
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  rules_version text NOT NULL REFERENCES trust.monthly_earning_rule_sets(version),
  revision integer NOT NULL CHECK (revision > 0),
  state text NOT NULL CHECK (state IN ('open', 'settling', 'locked', 'corrected')),
  points integer NOT NULL CHECK (points BETWEEN 0 AND 2500),
  calculation jsonb NOT NULL CHECK (jsonb_typeof(calculation) = 'object'),
  input_digest text NOT NULL CHECK (input_digest ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_user_id, week_start, policy_version, revision),
  UNIQUE (week_id, revision),
  CHECK (calculation @> jsonb_build_object('policyVersion', policy_version, 'rulesVersion', rules_version, 'points', points))
);

CREATE FUNCTION trust.redact_monthly_earning_calculation(calculation jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT (calculation - 'evidence') || jsonb_build_object(
    'actions', COALESCE((SELECT jsonb_agg(action.value - 'evidenceIds' ORDER BY action.ordinality)
      FROM jsonb_array_elements(calculation -> 'actions') WITH ORDINALITY AS action(value, ordinality)), '[]'::jsonb),
    'evidenceRedacted', true)
$$;
REVOKE ALL ON FUNCTION trust.redact_monthly_earning_calculation(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.redact_monthly_earning_calculation(jsonb) TO lythaus_privacy;

CREATE FUNCTION trust.reject_monthly_earning_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'monthly_earning_week_revisions' AND TG_OP = 'UPDATE' THEN
    IF pg_trigger_depth() > 1
      AND EXISTS (SELECT 1 FROM identity.users account
        WHERE account.id = OLD.subject_user_id AND (account.status = 'deleted' OR account.deleted_at IS NOT NULL))
      AND (to_jsonb(NEW) - 'calculation') = (to_jsonb(OLD) - 'calculation')
      AND NEW.calculation = trust.redact_monthly_earning_calculation(OLD.calculation) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'monthly_earning_revision_is_immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER monthly_earning_rules_immutable BEFORE UPDATE
  ON trust.monthly_earning_rule_sets FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_earning_update();
CREATE TRIGGER monthly_earning_contributions_immutable BEFORE UPDATE
  ON trust.monthly_earning_contributions FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_earning_update();
CREATE TRIGGER monthly_earning_evidence_immutable BEFORE UPDATE
  ON trust.monthly_earning_evidence_revisions FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_earning_update();
CREATE TRIGGER monthly_earning_weeks_immutable BEFORE UPDATE
  ON trust.monthly_earning_week_revisions FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_earning_update();

GRANT SELECT ON trust.monthly_earning_rule_sets, system.feature_flags TO lythaus_jobs;
GRANT SELECT, INSERT ON trust.monthly_earning_contributions, trust.monthly_earning_evidence_revisions,
  trust.monthly_earning_receipts, trust.monthly_earning_week_revisions TO lythaus_jobs;
GRANT SELECT, DELETE ON trust.monthly_earning_contributions, trust.monthly_earning_evidence_revisions,
  trust.monthly_earning_receipts, trust.monthly_earning_week_revisions TO lythaus_privacy;
