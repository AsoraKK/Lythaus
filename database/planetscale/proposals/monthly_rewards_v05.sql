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
CREATE TABLE trust.monthly_rewards_v05_reconciliation_attempts (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  source_month date NOT NULL CHECK (extract(day FROM source_month) = 1),
  rules_version text NOT NULL REFERENCES trust.monthly_rewards_v05_rule_sets(version),
  attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempt_count bigint NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  UNIQUE (subject_user_id, source_month, rules_version)
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
CREATE FUNCTION trust.record_monthly_rewards_v05_attempt(attempt_id uuid, subject uuid, source date, version text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE configuration jsonb;
BEGIN
  SELECT rules.configuration INTO configuration FROM trust.lock_monthly_rewards_v05_configuration($4) rules;
  IF configuration IS NULL OR configuration ->> 'firstSourceMonth' IS NULL
    OR extract(day FROM $3) <> 1
    OR to_char($3, 'YYYY-MM') < configuration ->> 'firstSourceMonth'
    OR $3 >= date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC')::date THEN RETURN false; END IF;
  PERFORM 1 FROM identity.users WHERE id = $2 AND status = 'active' AND deleted_at IS NULL
    AND NOT is_production_acceptance AND created_at < ($3 + interval '1 month') AT TIME ZONE 'UTC' FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO trust.monthly_rewards_v05_reconciliation_attempts (id,subject_user_id,source_month,rules_version)
    VALUES ($1,$2,$3,$4) ON CONFLICT (subject_user_id,source_month,rules_version)
    DO UPDATE SET attempted_at = clock_timestamp(),
      attempt_count = trust.monthly_rewards_v05_reconciliation_attempts.attempt_count + 1;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION trust.record_monthly_rewards_v05_attempt(uuid,uuid,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.record_monthly_rewards_v05_attempt(uuid,uuid,date,text) TO lythaus_jobs;
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
    DELETE FROM trust.monthly_rewards_v05_reconciliation_attempts WHERE subject_user_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.erase_rewards_v05_candidate() FROM PUBLIC;
CREATE TRIGGER rewards_v05_candidate_erasure AFTER UPDATE OF deleted_at, status ON identity.users
  FOR EACH ROW EXECUTE FUNCTION trust.erase_rewards_v05_candidate();
REVOKE ALL ON trust.monthly_rewards_v05_rule_sets, trust.monthly_rewards_v05_candidates FROM PUBLIC;
REVOKE ALL ON trust.monthly_rewards_v05_reconciliation_attempts FROM PUBLIC;
GRANT SELECT ON trust.monthly_rewards_v05_reconciliation_attempts TO lythaus_jobs;
GRANT SELECT, DELETE ON trust.monthly_rewards_v05_reconciliation_attempts TO lythaus_privacy;
GRANT SELECT ON trust.monthly_rewards_v05_rule_sets, trust.monthly_rewards_v05_candidates TO lythaus_runtime, lythaus_jobs;
GRANT INSERT ON trust.monthly_rewards_v05_candidates TO lythaus_jobs;
GRANT UPDATE (checked_at) ON trust.monthly_rewards_v05_candidates TO lythaus_jobs;
GRANT SELECT, DELETE ON trust.monthly_rewards_v05_candidates TO lythaus_privacy;
CREATE FUNCTION privacy.reconcile_monthly_rewards_v05_data_locations(subject uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  DELETE FROM privacy.subject_data_locations location WHERE subject_id = $1 AND (
    (resource_reference = 'trust.monthly_rewards_v05_candidates' AND NOT EXISTS (
      SELECT 1 FROM trust.monthly_rewards_v05_candidates candidate WHERE candidate.subject_user_id = $1 AND candidate.id = location.entity_id))
    OR (resource_reference = 'trust.monthly_rewards_v05_reconciliation_attempts' AND NOT EXISTS (
      SELECT 1 FROM trust.monthly_rewards_v05_reconciliation_attempts attempt WHERE attempt.subject_user_id = $1 AND attempt.id = location.entity_id)));
  INSERT INTO privacy.subject_data_locations
    (subject_id,store_type,resource_reference,entity_type,entity_id,authoritative_or_derived,retention_class)
  SELECT $1,'planetscale','trust.monthly_rewards_v05_candidates','monthly_rewards_v05_candidate',id,'derived','trust'
    FROM trust.monthly_rewards_v05_candidates WHERE subject_user_id = $1
  UNION ALL
  SELECT $1,'planetscale','trust.monthly_rewards_v05_reconciliation_attempts','monthly_rewards_v05_attempt',id,'derived','operational'
    FROM trust.monthly_rewards_v05_reconciliation_attempts WHERE subject_user_id = $1
  ON CONFLICT DO NOTHING;
  RETURN (SELECT count(*)::integer FROM privacy.subject_data_locations WHERE subject_id = $1);
END; $$;
REVOKE ALL ON FUNCTION privacy.reconcile_monthly_rewards_v05_data_locations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION privacy.reconcile_monthly_rewards_v05_data_locations(uuid) TO lythaus_privacy;
INSERT INTO system.feature_flags (flag_key, enabled, policy_version)
VALUES ('trust.monthly_rewards_v05_preparation', false, 'lythaus-monthly-rewards-v0.5-candidate')
ON CONFLICT (flag_key) DO NOTHING;
