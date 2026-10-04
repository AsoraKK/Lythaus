CREATE TABLE trust.monthly_maintenance_rule_sets (
  version text PRIMARY KEY,
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  catalogue_hash text NOT NULL CHECK (catalogue_hash ~ '^[0-9a-f]{64}$'),
  mode text NOT NULL CHECK (mode = 'shadow'),
  collect_from timestamptz NOT NULL,
  collection_privacy_version text CHECK (collection_privacy_version = 'monthly-privacy-v1'),
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  CHECK (configuration @> jsonb_build_object('version', version, 'status', 'pending_owner_approval'))
);

CREATE TABLE trust.monthly_maintenance_observations (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  source_event_id uuid NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('email_control', 'integrity_assessment', 'protection', 'authentication', 'anti_automation', 'policy_refresher')),
  performed_at timestamptz NOT NULL,
  facts jsonb NOT NULL CHECK (jsonb_typeof(facts) = 'object'),
  email_binding_digest bytea,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (COALESCE(facts ? 'kind' AND facts ->> 'kind' = kind, false)),
  CHECK ((kind = 'email_control' AND email_binding_digest IS NOT NULL AND octet_length(email_binding_digest) = 32)
    OR (kind <> 'email_control' AND email_binding_digest IS NULL)),
  CHECK (kind <> 'email_control' OR COALESCE(jsonb_typeof(facts -> 'emailVersion') = 'string'
    AND facts ->> 'emailVersion' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)),
  CHECK (NOT facts ?| ARRAY['points', 'password', 'token', 'email', 'emailAddress', 'biometric', 'pin'])
);
CREATE INDEX monthly_maintenance_subject_idx ON trust.monthly_maintenance_observations(subject_user_id, performed_at, id);
CREATE UNIQUE INDEX monthly_email_control_verification_idx ON trust.monthly_maintenance_observations ((facts ->> 'emailVersion')) WHERE kind = 'email_control';

CREATE TABLE trust.monthly_maintenance_revocations (
  observation_id uuid PRIMARY KEY REFERENCES trust.monthly_maintenance_observations(id) ON DELETE CASCADE,
  revoked_at timestamptz NOT NULL,
  reason_code text NOT NULL CHECK (reason_code IN ('email_binding_changed', 'credential_removed', 'verification_revoked', 'evidence_invalidated')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trust.monthly_reputation_assemblies (
  source_id uuid PRIMARY KEY REFERENCES trust.monthly_reputation_sources(id) ON DELETE CASCADE,
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  source_month date NOT NULL CHECK (extract(day FROM source_month) = 1),
  rules_version text NOT NULL REFERENCES trust.monthly_maintenance_rule_sets(version),
  weekly_rules_version text NOT NULL REFERENCES trust.monthly_earning_rule_sets(version),
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  week_revision_ids uuid[] NOT NULL,
  observation_ids uuid[] NOT NULL,
  revocation_ids uuid[] NOT NULL,
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (source_id, subject_user_id, source_month, policy_version)
    REFERENCES trust.monthly_reputation_sources(id, subject_user_id, source_month, policy_version),
  policy_version text NOT NULL DEFAULT 'lythaus-monthly-rewards-2026-10-v1' CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1')
);
CREATE INDEX monthly_reputation_assemblies_subject_idx ON trust.monthly_reputation_assemblies(subject_user_id, source_month, recorded_at);

CREATE FUNCTION trust.lock_monthly_reputation_subject(subject uuid) RETURNS TABLE(created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT account.created_at FROM identity.users account
  WHERE account.id = subject AND account.status <> 'deleted' AND account.deleted_at IS NULL
  FOR SHARE OF account;
$$;
REVOKE ALL ON FUNCTION trust.lock_monthly_reputation_subject(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_reputation_subject(uuid) TO lythaus_jobs;

CREATE FUNCTION trust.require_monthly_reputation_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM system.feature_flags WHERE flag_key = 'trust.monthly_reputation_shadow'
    AND policy_version = 'lythaus-monthly-rewards-2026-10-v1' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'monthly_collection_unavailable' USING ERRCODE = '55000'; END IF;
  IF NEW.subject_user_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM trust.lock_monthly_reputation_subject(NEW.subject_user_id)) THEN
    RAISE EXCEPTION 'monthly_reputation_subject_unavailable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reputation_subject() FROM PUBLIC;
CREATE TRIGGER monthly_source_subject_guard BEFORE INSERT ON trust.monthly_reputation_sources
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reputation_subject();
CREATE TRIGGER monthly_observation_subject_guard BEFORE INSERT ON trust.monthly_maintenance_observations
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reputation_subject();
CREATE TRIGGER monthly_assembly_subject_guard BEFORE INSERT ON trust.monthly_reputation_assemblies
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reputation_subject();
CREATE TRIGGER monthly_contribution_subject_guard BEFORE INSERT ON trust.monthly_earning_contributions
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reputation_subject();
CREATE TRIGGER monthly_week_subject_guard BEFORE INSERT ON trust.monthly_earning_week_revisions
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reputation_subject();
CREATE TRIGGER monthly_receipt_subject_guard BEFORE INSERT ON trust.monthly_earning_receipts
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reputation_subject();

CREATE FUNCTION trust.require_monthly_assessment_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM system.feature_flags WHERE flag_key = 'trust.monthly_reputation_shadow'
    AND policy_version = 'lythaus-monthly-rewards-2026-10-v1' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'monthly_collection_unavailable' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM trust.monthly_reputation_sources source
    CROSS JOIN LATERAL trust.lock_monthly_reputation_subject(source.subject_user_id)
    WHERE source.id = NEW.source_id) THEN
    RAISE EXCEPTION 'monthly_reputation_subject_unavailable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_assessment_subject() FROM PUBLIC;
CREATE TRIGGER monthly_assessment_subject_guard BEFORE INSERT ON trust.monthly_reputation_assessments
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_assessment_subject();

CREATE FUNCTION trust.erase_monthly_reputation_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM system.feature_flags WHERE flag_key = 'trust.monthly_reputation_shadow'
    AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') THEN RETURN NEW; END IF;
  IF NEW.status = 'deleted' OR NEW.deleted_at IS NOT NULL THEN
    DELETE FROM system.consumer_inbox WHERE event_id IN (SELECT event.id FROM system.outbox_events event
      WHERE event.aggregate_type = 'monthly_reputation_source' AND event.aggregate_id IN
        (SELECT id FROM trust.monthly_reputation_sources WHERE subject_user_id = NEW.id)
      OR event.aggregate_type = 'monthly_reputation_week' AND event.aggregate_id IN
        (SELECT week_id FROM trust.monthly_earning_week_revisions WHERE subject_user_id = NEW.id)
      OR event.aggregate_type = 'monthly_reputation_assessment' AND event.aggregate_id IN
        (SELECT assessment.id FROM trust.monthly_reputation_assessments assessment JOIN trust.monthly_reputation_sources source
          ON source.id = assessment.source_id WHERE source.subject_user_id = NEW.id));
    DELETE FROM system.outbox_events event WHERE
      event.aggregate_type = 'monthly_reputation_source' AND event.aggregate_id IN
        (SELECT id FROM trust.monthly_reputation_sources WHERE subject_user_id = NEW.id)
      OR event.aggregate_type = 'monthly_reputation_week' AND event.aggregate_id IN
        (SELECT week_id FROM trust.monthly_earning_week_revisions WHERE subject_user_id = NEW.id)
      OR event.aggregate_type = 'monthly_reputation_assessment' AND event.aggregate_id IN
        (SELECT assessment.id FROM trust.monthly_reputation_assessments assessment JOIN trust.monthly_reputation_sources source
          ON source.id = assessment.source_id WHERE source.subject_user_id = NEW.id);
    -- Keep immutable score lineage and accepted week totals, while clearing the
    -- assemblies, observations, contributions, and per-item evidence details.
    DELETE FROM trust.monthly_reputation_assemblies WHERE subject_user_id = NEW.id;
    DELETE FROM trust.monthly_maintenance_observations WHERE subject_user_id = NEW.id;
    UPDATE trust.monthly_earning_week_revisions
      SET calculation = trust.redact_monthly_earning_calculation(calculation)
      WHERE subject_user_id = NEW.id AND calculation ->> 'evidenceRedacted' IS DISTINCT FROM 'true';
    DELETE FROM trust.monthly_earning_contributions WHERE subject_user_id = NEW.id;
    DELETE FROM trust.monthly_earning_receipts WHERE subject_user_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.erase_monthly_reputation_subject() FROM PUBLIC;
CREATE TRIGGER monthly_reputation_subject_erasure AFTER UPDATE OF status, deleted_at ON identity.users
  FOR EACH ROW WHEN (NEW.status = 'deleted' OR NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION trust.erase_monthly_reputation_subject();

CREATE FUNCTION trust.preserve_monthly_collection_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF TG_OP = 'UPDATE' AND NEW.flag_key = OLD.flag_key AND NEW.policy_version = OLD.policy_version THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM trust.monthly_maintenance_rule_sets WHERE collection_privacy_version = 'monthly-privacy-v1')
    OR EXISTS (SELECT 1 FROM trust.monthly_earning_rule_sets WHERE mode = 'shadow')
    OR EXISTS (SELECT 1 FROM trust.monthly_reputation_sources)
    OR EXISTS (SELECT 1 FROM trust.monthly_earning_contributions)
    OR EXISTS (SELECT 1 FROM trust.monthly_maintenance_observations) THEN
    RAISE EXCEPTION 'monthly_collection_flag_requires_privacy_teardown' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
REVOKE ALL ON FUNCTION trust.preserve_monthly_collection_flag() FROM PUBLIC;
CREATE TRIGGER monthly_collection_flag_preserved BEFORE DELETE OR UPDATE OF flag_key, policy_version ON system.feature_flags
  FOR EACH ROW WHEN (OLD.flag_key = 'trust.monthly_reputation_shadow'
    AND OLD.policy_version = 'lythaus-monthly-rewards-2026-10-v1')
  EXECUTE FUNCTION trust.preserve_monthly_collection_flag();

CREATE FUNCTION trust.reject_monthly_maintenance_update() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'monthly_maintenance_evidence_is_immutable' USING ERRCODE = '55000';
END; $$;
CREATE TRIGGER monthly_maintenance_rules_immutable BEFORE UPDATE ON trust.monthly_maintenance_rule_sets
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_maintenance_update();
CREATE TRIGGER monthly_maintenance_observations_immutable BEFORE UPDATE ON trust.monthly_maintenance_observations
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_maintenance_update();
CREATE TRIGGER monthly_maintenance_revocations_immutable BEFORE UPDATE ON trust.monthly_maintenance_revocations
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_maintenance_update();
CREATE TRIGGER monthly_reputation_assemblies_immutable BEFORE UPDATE ON trust.monthly_reputation_assemblies
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_maintenance_update();

CREATE FUNCTION trust.revoke_monthly_email_control() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM system.feature_flags WHERE flag_key = 'trust.monthly_reputation_shadow'
    AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM trust.monthly_maintenance_rule_sets
    WHERE collection_privacy_version = 'monthly-privacy-v1') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    INSERT INTO trust.monthly_maintenance_revocations (observation_id, revoked_at, reason_code)
      SELECT id, statement_timestamp(), 'credential_removed' FROM trust.monthly_maintenance_observations
      WHERE subject_user_id = OLD.user_id AND kind = 'email_control' ON CONFLICT DO NOTHING;
    RETURN OLD;
  END IF;
  IF NEW.email_lookup_hmac IS DISTINCT FROM OLD.email_lookup_hmac OR NEW.verified_at IS NULL THEN
    INSERT INTO trust.monthly_maintenance_revocations (observation_id, revoked_at, reason_code)
      SELECT id, statement_timestamp(), CASE WHEN NEW.verified_at IS NULL THEN 'verification_revoked' ELSE 'email_binding_changed' END
      FROM trust.monthly_maintenance_observations WHERE subject_user_id = NEW.user_id AND kind = 'email_control'
      AND (NEW.verified_at IS NULL OR email_binding_digest IS DISTINCT FROM public.digest(NEW.email_lookup_hmac, 'sha256'))
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.revoke_monthly_email_control() FROM PUBLIC;
CREATE TRIGGER monthly_email_control_revocation AFTER UPDATE OF email_lookup_hmac, verified_at OR DELETE
  ON identity.email_credentials FOR EACH ROW EXECUTE FUNCTION trust.revoke_monthly_email_control();

GRANT SELECT ON trust.monthly_maintenance_rule_sets, system.feature_flags TO lythaus_runtime, lythaus_jobs;
GRANT SELECT, INSERT ON trust.monthly_maintenance_observations TO lythaus_runtime;
GRANT SELECT (id, subject_user_id, source_event_id, kind, performed_at, facts, recorded_at)
  ON trust.monthly_maintenance_observations TO lythaus_jobs;
GRANT SELECT ON trust.monthly_maintenance_revocations TO lythaus_jobs;
GRANT SELECT, INSERT ON trust.monthly_reputation_assemblies TO lythaus_jobs;
GRANT SELECT, DELETE ON trust.monthly_maintenance_observations, trust.monthly_maintenance_revocations,
  trust.monthly_reputation_assemblies TO lythaus_privacy;
