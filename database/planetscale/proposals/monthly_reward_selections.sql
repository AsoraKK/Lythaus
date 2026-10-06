CREATE TABLE trust.monthly_reward_selection_rule_sets (
  version text PRIMARY KEY,
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  snapshot_rules_version text NOT NULL REFERENCES trust.monthly_reward_snapshot_rule_sets(version),
  status text NOT NULL CHECK (status = 'pending_owner_approval'),
  switching_mode text NOT NULL CHECK (switching_mode = 'blocked_pending_D12'),
  collection_privacy_version text CHECK (collection_privacy_version = 'monthly-privacy-v1'),
  approved_by uuid REFERENCES identity.users(id),
  approved_at timestamptz,
  approval_reference text,
  CHECK ((approved_by IS NULL AND approved_at IS NULL AND approval_reference IS NULL)
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_reference IS NOT NULL
      AND length(approval_reference) BETWEEN 1 AND 500))
);

CREATE TABLE trust.monthly_reward_offer_versions (
  id uuid PRIMARY KEY CHECK (substring(id::text,15,1) = '7'),
  family_id uuid NOT NULL CHECK (substring(family_id::text,15,1) = '7'),
  partner_id uuid NOT NULL CHECK (substring(partner_id::text,15,1) = '7'),
  required_level smallint NOT NULL CHECK (required_level BETWEEN 1 AND 5),
  terms_version text NOT NULL CHECK (length(terms_version) BETWEEN 1 AND 100),
  signed_terms_reference text NOT NULL CHECK (length(signed_terms_reference) BETWEEN 1 AND 500),
  approved_by uuid NOT NULL REFERENCES identity.users(id),
  approved_at timestamptz NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (family_id,required_level,terms_version)
);
CREATE TABLE trust.monthly_reward_offer_availability (
  offer_version_id uuid PRIMARY KEY REFERENCES trust.monthly_reward_offer_versions(id),
  state text NOT NULL CHECK (state IN ('proposed','active','paused','expired')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE trust.monthly_reward_selection_revisions (
  id uuid PRIMARY KEY CHECK (substring(id::text,15,1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  supersedes_id uuid,
  rules_version text NOT NULL REFERENCES trust.monthly_reward_selection_rule_sets(version),
  snapshot_id uuid NOT NULL REFERENCES trust.monthly_reward_snapshots(id),
  plan_at_creation text NOT NULL CHECK (plan_at_creation IN ('free','premium')),
  selections jsonb NOT NULL CHECK (jsonb_typeof(selections) = 'array' AND jsonb_array_length(selections) BETWEEN 1 AND 5),
  idempotency_key uuid NOT NULL CHECK (substring(idempotency_key::text,15,1) = '7'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (subject_user_id,revision),
  UNIQUE (subject_user_id,idempotency_key),
  UNIQUE (id,subject_user_id),
  FOREIGN KEY (supersedes_id,subject_user_id) REFERENCES trust.monthly_reward_selection_revisions(id,subject_user_id),
  CHECK ((revision = 1 AND supersedes_id IS NULL) OR (revision > 1 AND supersedes_id IS NOT NULL))
);
CREATE UNIQUE INDEX monthly_reward_selection_successor_idx ON trust.monthly_reward_selection_revisions(supersedes_id)
  WHERE supersedes_id IS NOT NULL;

CREATE FUNCTION trust.lock_monthly_reward_selection_configuration() RETURNS TABLE(flag_key text,enabled boolean,policy_version text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT flag.flag_key,flag.enabled,flag.policy_version FROM system.feature_flags flag
  WHERE flag.flag_key IN ('trust.monthly_reputation_shadow','trust.monthly_reward_snapshots','trust.monthly_reward_selections')
  ORDER BY flag.flag_key FOR SHARE OF flag;
$$;
REVOKE ALL ON FUNCTION trust.lock_monthly_reward_selection_configuration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_reward_selection_configuration() TO lythaus_runtime;

CREATE FUNCTION trust.lock_monthly_reward_selection_member(subject uuid) RETURNS TABLE(subscription_tier text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM identity.users WHERE id = subject AND status = 'active' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM 1 FROM identity.email_credentials WHERE user_id = subject AND verified_at IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT entitlement.subscription_tier FROM identity.user_entitlements entitlement WHERE user_id = subject FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'free'::text; END IF;
END; $$;
REVOKE ALL ON FUNCTION trust.lock_monthly_reward_selection_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_reward_selection_member(uuid) TO lythaus_runtime;

CREATE FUNCTION trust.require_monthly_reward_selection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rules trust.monthly_reward_selection_rule_sets; previous trust.monthly_reward_selection_revisions;
  snapshot trust.monthly_reward_snapshots; plan text; chosen jsonb; offer trust.monthly_reward_offer_versions;
  month date := date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  IF (SELECT count(*) FROM trust.lock_monthly_reward_selection_configuration()
      WHERE enabled AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') <> 3 THEN
    RAISE EXCEPTION 'monthly_reward_selection_unavailable' USING ERRCODE = '55000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('monthly-reward-member:' || NEW.subject_user_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('monthly-reputation:' || NEW.subject_user_id::text || ':' || to_char(month-interval '1 month','YYYY-MM'),0));
  SELECT * INTO rules FROM trust.monthly_reward_selection_rule_sets WHERE version = NEW.rules_version
    AND collection_privacy_version = 'monthly-privacy-v1' AND approved_by IS NOT NULL AND approved_at <= clock_timestamp()
    AND approval_reference IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'monthly_reward_selection_unavailable' USING ERRCODE = '55000'; END IF;
  SELECT subscription_tier INTO plan FROM trust.lock_monthly_reward_selection_member(NEW.subject_user_id);
  IF plan IS NULL OR plan = 'black' OR plan IS DISTINCT FROM NEW.plan_at_creation THEN
    RAISE EXCEPTION 'monthly_reward_selection_member_unavailable' USING ERRCODE = '55000'; END IF;
  SELECT * INTO snapshot FROM trust.monthly_reward_snapshots WHERE subject_user_id = NEW.subject_user_id
    AND effective_month = month AND mode = 'confirmed' ORDER BY revision DESC LIMIT 1;
  IF snapshot.id IS DISTINCT FROM NEW.snapshot_id OR snapshot.rules_version IS DISTINCT FROM rules.snapshot_rules_version THEN
    RAISE EXCEPTION 'monthly_reward_selection_authority_required' USING ERRCODE = '55000'; END IF;
  SELECT * INTO previous FROM trust.monthly_reward_selection_revisions WHERE subject_user_id = NEW.subject_user_id ORDER BY revision DESC LIMIT 1;
  IF NEW.revision <> coalesce(previous.revision,0)+1 OR NEW.supersedes_id IS DISTINCT FROM previous.id
    OR (previous.id IS NOT NULL AND previous.rules_version <> NEW.rules_version) THEN
    RAISE EXCEPTION 'monthly_reward_selection_revision_conflict' USING ERRCODE = '55000'; END IF;
  IF jsonb_array_length(NEW.selections) <> coalesce(jsonb_array_length(previous.selections),0)+1
    OR (previous.id IS NOT NULL AND NOT NEW.selections @> previous.selections)
    OR (plan = 'free' AND jsonb_array_length(NEW.selections) <> 1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.selections) item
      WHERE jsonb_typeof(item) <> 'object' OR NOT item ?& ARRAY['familyId','variantId','slot','termsVersion']
        OR (SELECT count(*) FROM jsonb_object_keys(item)) <> 4
        OR jsonb_typeof(item->'slot') <> 'number' OR item->>'slot' !~ '^[1-5]$'
        OR item->>'familyId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR item->>'variantId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR jsonb_typeof(item->'termsVersion') <> 'string')
    OR (SELECT count(DISTINCT item->>'slot') FROM jsonb_array_elements(NEW.selections) item) <> jsonb_array_length(NEW.selections)
    OR (SELECT count(DISTINCT item->>'familyId') FROM jsonb_array_elements(NEW.selections) item) <> jsonb_array_length(NEW.selections) THEN
    RAISE EXCEPTION 'monthly_reward_selection_transition_pending_D12' USING ERRCODE = '55000'; END IF;
  SELECT item INTO chosen FROM jsonb_array_elements(NEW.selections) item
    WHERE previous.id IS NULL OR NOT previous.selections @> jsonb_build_array(item);
  SELECT definition.* INTO offer FROM trust.monthly_reward_offer_versions definition
    JOIN trust.monthly_reward_offer_availability availability ON availability.offer_version_id = definition.id
    WHERE definition.id = (chosen->>'variantId')::uuid AND availability.state = 'active'
      AND definition.approved_at <= clock_timestamp() AND definition.starts_at <= clock_timestamp() AND definition.ends_at > clock_timestamp()
    FOR SHARE OF availability;
  IF offer.id IS NULL OR offer.family_id <> (chosen->>'familyId')::uuid
    OR offer.terms_version <> chosen->>'termsVersion' OR offer.required_level <> (chosen->>'slot')::integer
    OR offer.required_level > least(snapshot.level,CASE WHEN plan = 'free' THEN 3 ELSE 5 END) THEN
    RAISE EXCEPTION 'monthly_reward_selection_offer_unavailable' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reward_selection() FROM PUBLIC;

CREATE FUNCTION trust.lock_monthly_reward_offer(variant uuid) RETURNS TABLE(id uuid,family_id uuid,required_level smallint,terms_version text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT offer.id,offer.family_id,offer.required_level,offer.terms_version FROM trust.monthly_reward_offer_versions offer
  JOIN trust.monthly_reward_offer_availability availability ON availability.offer_version_id = offer.id
  WHERE offer.id = variant AND availability.state = 'active' AND offer.approved_at <= clock_timestamp()
    AND offer.starts_at <= clock_timestamp() AND offer.ends_at > clock_timestamp() FOR SHARE OF availability;
$$;
REVOKE ALL ON FUNCTION trust.lock_monthly_reward_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_reward_offer(uuid) TO lythaus_runtime;

CREATE TRIGGER monthly_reward_selection_guard BEFORE INSERT ON trust.monthly_reward_selection_revisions
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reward_selection();
CREATE TRIGGER monthly_reward_selection_immutable BEFORE UPDATE ON trust.monthly_reward_selection_revisions
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_selection_rules_immutable BEFORE UPDATE ON trust.monthly_reward_selection_rule_sets
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_offer_version_immutable BEFORE UPDATE ON trust.monthly_reward_offer_versions
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();

CREATE FUNCTION trust.erase_monthly_reward_selection_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM system.feature_flags WHERE flag_key = 'trust.monthly_reward_selections'
    AND policy_version = 'lythaus-monthly-rewards-2026-10-v1' FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  DELETE FROM system.consumer_inbox WHERE event_id IN (SELECT id FROM system.outbox_events
    WHERE actor_id = NEW.id AND event_type = 'trust.monthly_reward_selection.recorded');
  DELETE FROM system.outbox_events WHERE actor_id = NEW.id AND event_type = 'trust.monthly_reward_selection.recorded';
  DELETE FROM trust.monthly_reward_selection_revisions WHERE subject_user_id = NEW.id;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.erase_monthly_reward_selection_subject() FROM PUBLIC;
CREATE TRIGGER monthly_reputation_reward_selection_subject_erasure BEFORE UPDATE OF status,deleted_at ON identity.users
  FOR EACH ROW WHEN (NEW.status = 'deleted' OR NEW.deleted_at IS NOT NULL) EXECUTE FUNCTION trust.erase_monthly_reward_selection_subject();

CREATE FUNCTION trust.preserve_monthly_reward_selection_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF TG_OP = 'UPDATE' AND NEW.flag_key = OLD.flag_key AND NEW.policy_version = OLD.policy_version THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM trust.monthly_reward_selection_rule_sets) OR EXISTS (SELECT 1 FROM trust.monthly_reward_selection_revisions) THEN
    RAISE EXCEPTION 'monthly_reward_selection_privacy_teardown_required' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.preserve_monthly_reward_selection_flag() FROM PUBLIC;
CREATE TRIGGER monthly_reward_selection_flag_preserved BEFORE DELETE OR UPDATE OF flag_key,policy_version ON system.feature_flags
  FOR EACH ROW WHEN (OLD.flag_key = 'trust.monthly_reward_selections' AND OLD.policy_version = 'lythaus-monthly-rewards-2026-10-v1')
  EXECUTE FUNCTION trust.preserve_monthly_reward_selection_flag();

GRANT SELECT ON trust.monthly_reward_selection_rule_sets,trust.monthly_reward_offer_versions,
  trust.monthly_reward_offer_availability TO lythaus_runtime;
GRANT SELECT,INSERT ON trust.monthly_reward_selection_revisions TO lythaus_runtime;
GRANT SELECT,DELETE ON trust.monthly_reward_selection_rule_sets,trust.monthly_reward_selection_revisions TO lythaus_privacy;
