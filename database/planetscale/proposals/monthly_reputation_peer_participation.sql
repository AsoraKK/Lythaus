ALTER TABLE trust.monthly_earning_contributions DROP CONSTRAINT monthly_earning_contributions_source_type_check;
ALTER TABLE trust.monthly_earning_contributions ADD CONSTRAINT monthly_earning_contributions_source_type_check
  CHECK (source_type IN ('post', 'comment', 'peer_ballot'));

CREATE TABLE trust.monthly_peer_participation_rule_sets (
  version text PRIMARY KEY,
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  weekly_rules_version text NOT NULL REFERENCES trust.monthly_earning_rule_sets(version),
  appeal_rules_version text NOT NULL REFERENCES moderation.community_appeal_rule_sets(version),
  catalogue_hash text NOT NULL CHECK (catalogue_hash ~ '^[0-9a-f]{64}$'),
  mode text NOT NULL CHECK (mode = 'shadow'),
  award_rule text NOT NULL CHECK (award_rule = 'one_valid_final_ballot'),
  weekly_points integer NOT NULL CHECK (weekly_points = 250),
  status text NOT NULL CHECK (status = 'pending_owner_approval'),
  collect_from timestamptz NOT NULL,
  approved_by uuid REFERENCES identity.users(id),
  approved_at timestamptz,
  approval_reference text,
  CHECK ((approved_by IS NULL AND approved_at IS NULL AND approval_reference IS NULL)
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_reference IS NOT NULL AND length(approval_reference) BETWEEN 1 AND 500))
);
CREATE TABLE trust.monthly_peer_participation_receipts (
  appeal_id uuid PRIMARY KEY REFERENCES moderation.community_appeal_sessions(appeal_id) ON DELETE CASCADE,
  source_event_id uuid NOT NULL UNIQUE,
  rules_version text NOT NULL REFERENCES trust.monthly_peer_participation_rule_sets(version),
  participants integer NOT NULL CHECK (participants >= 0),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER monthly_peer_rules_immutable BEFORE UPDATE ON trust.monthly_peer_participation_rule_sets
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_earning_update();
CREATE TRIGGER monthly_peer_receipts_immutable BEFORE UPDATE ON trust.monthly_peer_participation_receipts
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_earning_update();
CREATE FUNCTION trust.lock_monthly_peer_configuration() RETURNS TABLE(enabled boolean, policy_version text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT flag.enabled, flag.policy_version FROM system.feature_flags flag
  WHERE flag.flag_key = 'trust.monthly_peer_participation' FOR SHARE OF flag;
$$;
REVOKE ALL ON FUNCTION trust.lock_monthly_peer_configuration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_peer_configuration() TO lythaus_jobs;
CREATE FUNCTION trust.preserve_monthly_peer_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF TG_OP = 'UPDATE' AND NEW.flag_key = OLD.flag_key AND NEW.policy_version = OLD.policy_version THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM trust.monthly_peer_participation_rule_sets WHERE approved_by IS NOT NULL)
    OR EXISTS (SELECT 1 FROM trust.monthly_peer_participation_receipts) THEN
    RAISE EXCEPTION 'monthly_peer_flag_requires_privacy_teardown' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
REVOKE ALL ON FUNCTION trust.preserve_monthly_peer_flag() FROM PUBLIC;
CREATE TRIGGER monthly_peer_flag_preserved BEFORE DELETE OR UPDATE OF flag_key, policy_version ON system.feature_flags
  FOR EACH ROW WHEN (OLD.flag_key = 'trust.monthly_peer_participation'
    AND OLD.policy_version = 'lythaus-monthly-rewards-2026-10-v1') EXECUTE FUNCTION trust.preserve_monthly_peer_flag();
GRANT SELECT ON trust.monthly_peer_participation_rule_sets TO lythaus_jobs;
GRANT SELECT, INSERT ON trust.monthly_peer_participation_receipts TO lythaus_jobs;
GRANT SELECT, DELETE ON trust.monthly_peer_participation_receipts TO lythaus_privacy;
