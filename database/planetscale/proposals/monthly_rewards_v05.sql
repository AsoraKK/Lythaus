CREATE TABLE trust.monthly_rewards_v05_rule_sets (
  version text PRIMARY KEY CHECK (version = 'monthly-rewards-v0.5-preparation-v1'),
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-v0.5-candidate'),
  collection_privacy_version text NOT NULL CHECK (collection_privacy_version = 'monthly-privacy-v1'),
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  CHECK (configuration @> jsonb_build_object('version', version, 'policyVersion', policy_version,
    'runtimeActivationAllowed', false, 'settlementWindowStatus', 'provisional', 'finalMaximumSourceMonth', null))
);
CREATE TABLE trust.monthly_rewards_v05_candidates (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  source_month date NOT NULL CHECK (extract(day FROM source_month) = 1),
  revision integer NOT NULL CHECK (revision > 0),
  rules_version text NOT NULL REFERENCES trust.monthly_rewards_v05_rule_sets(version),
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (subject_user_id, source_month, revision),
  CHECK (report @> '{"policyVersion":"lythaus-monthly-rewards-v0.5-candidate","state":"provisional","redeemable":false,"runtimeActivationAllowed":false,"appliedPoints":0,"finalMaximumSourceMonth":null}'::jsonb),
  CHECK (coalesce(report ->> 'sourceMonth' = to_char(source_month, 'YYYY-MM'), false)),
  CHECK (coalesce(report ->> 'effectiveMonth' = to_char(source_month + interval '1 month', 'YYYY-MM'), false)),
  CHECK (coalesce((report ->> 'sourceScore')::integer BETWEEN 0 AND 13650, false))
);
CREATE FUNCTION trust.reject_rewards_v05_rules_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN
  RAISE EXCEPTION 'monthly_rewards_v05_rules_immutable';
END; $$;
REVOKE ALL ON FUNCTION trust.reject_rewards_v05_rules_update() FROM PUBLIC;
CREATE TRIGGER rewards_v05_rules_immutable BEFORE UPDATE ON trust.monthly_rewards_v05_rule_sets
  FOR EACH ROW EXECUTE FUNCTION trust.reject_rewards_v05_rules_update();
CREATE FUNCTION trust.lock_monthly_rewards_v05_configuration(version text) RETURNS TABLE(configuration jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT rules.configuration FROM trust.monthly_rewards_v05_rule_sets rules
  JOIN system.feature_flags flag ON flag.flag_key = 'trust.monthly_rewards_v05_preparation'
    AND flag.enabled AND flag.policy_version = 'lythaus-monthly-rewards-v0.5-candidate'
  WHERE rules.version = $1 AND rules.policy_version = flag.policy_version
    AND rules.collection_privacy_version = 'monthly-privacy-v1' FOR SHARE OF rules, flag;
$$;
REVOKE ALL ON FUNCTION trust.lock_monthly_rewards_v05_configuration(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_rewards_v05_configuration(text) TO lythaus_runtime, lythaus_jobs;
CREATE FUNCTION trust.guard_rewards_v05_candidate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'checked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'checked_at') THEN
    RAISE EXCEPTION 'monthly_rewards_v05_immutable';
  END IF;
  PERFORM 1 FROM system.feature_flags WHERE flag_key = 'trust.monthly_rewards_v05_preparation'
    AND enabled AND policy_version = 'lythaus-monthly-rewards-v0.5-candidate' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'monthly_rewards_v05_unavailable'; END IF;
  PERFORM 1 FROM identity.users WHERE id = NEW.subject_user_id AND status = 'active' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'monthly_rewards_v05_subject_unavailable'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.guard_rewards_v05_candidate() FROM PUBLIC;
CREATE TRIGGER rewards_v05_candidate_guard BEFORE INSERT OR UPDATE ON trust.monthly_rewards_v05_candidates
  FOR EACH ROW EXECUTE FUNCTION trust.guard_rewards_v05_candidate();
CREATE FUNCTION trust.erase_rewards_v05_candidate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.status = 'deleted' THEN
    DELETE FROM trust.monthly_rewards_v05_candidates WHERE subject_user_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.erase_rewards_v05_candidate() FROM PUBLIC;
CREATE TRIGGER rewards_v05_candidate_erasure AFTER UPDATE OF deleted_at, status ON identity.users
  FOR EACH ROW EXECUTE FUNCTION trust.erase_rewards_v05_candidate();
REVOKE ALL ON trust.monthly_rewards_v05_rule_sets, trust.monthly_rewards_v05_candidates FROM PUBLIC;
GRANT SELECT ON trust.monthly_rewards_v05_rule_sets, trust.monthly_rewards_v05_candidates TO lythaus_runtime, lythaus_jobs;
GRANT INSERT ON trust.monthly_rewards_v05_candidates TO lythaus_jobs;
GRANT UPDATE (checked_at) ON trust.monthly_rewards_v05_candidates TO lythaus_jobs;
GRANT SELECT, DELETE ON trust.monthly_rewards_v05_candidates TO lythaus_privacy;
INSERT INTO system.feature_flags (flag_key, enabled, policy_version)
VALUES ('trust.monthly_rewards_v05_preparation', false, 'lythaus-monthly-rewards-v0.5-candidate')
ON CONFLICT (flag_key) DO NOTHING;
