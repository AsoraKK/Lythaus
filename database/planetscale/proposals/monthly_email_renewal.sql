CREATE TABLE trust.monthly_email_renewal_challenges (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  email_binding_digest bytea NOT NULL CHECK (octet_length(email_binding_digest) = 32),
  rules_version text NOT NULL REFERENCES trust.monthly_maintenance_rule_sets(version),
  idempotency_key uuid NOT NULL CHECK (substring(idempotency_key::text, 15, 1) = '7'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  source_event_id uuid UNIQUE CHECK (source_event_id IS NULL OR substring(source_event_id::text, 15, 1) = '7'),
  UNIQUE (subject_user_id, idempotency_key),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '31 minutes'),
  CHECK ((consumed_at IS NULL) = (source_event_id IS NULL)),
  CHECK (consumed_at IS NULL OR invalidated_at IS NULL)
);
CREATE UNIQUE INDEX monthly_email_renewal_pending_subject_idx
  ON trust.monthly_email_renewal_challenges(subject_user_id)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;
CREATE INDEX monthly_email_renewal_expiry_idx
  ON trust.monthly_email_renewal_challenges(expires_at)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

CREATE FUNCTION trust.require_monthly_email_renewal_authority() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE binding_digest bytea;
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.consumed_at IS NOT NULL OR NEW.invalidated_at IS NOT NULL OR NEW.source_event_id IS NOT NULL) THEN
    RAISE EXCEPTION 'monthly_email_renewal_initial_state_invalid' USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM system.feature_flags
   WHERE flag_key = 'trust.monthly_reputation_shadow'
     AND enabled = true AND policy_version = 'lythaus-monthly-rewards-2026-10-v1'
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'monthly_email_renewal_unavailable' USING ERRCODE = '55000'; END IF;
  PERFORM 1 FROM system.feature_flags
   WHERE flag_key = 'trust.monthly_email_renewal'
     AND enabled = true AND policy_version = 'lythaus-monthly-rewards-2026-10-v1'
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'monthly_email_renewal_unavailable' USING ERRCODE = '55000'; END IF;
  PERFORM 1 FROM trust.monthly_maintenance_rule_sets rules
   WHERE rules.version = NEW.rules_version
     AND rules.policy_version = 'lythaus-monthly-rewards-2026-10-v1'
     AND rules.mode = 'shadow'
     AND rules.collection_privacy_version = 'monthly-privacy-v1'
     AND rules.configuration ->> 'emailValidity' = 'three_calendar_months'
     AND rules.collect_from <= clock_timestamp()
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'monthly_email_renewal_unavailable' USING ERRCODE = '55000'; END IF;
  SELECT public.digest(credential.email_lookup_hmac, 'sha256') INTO binding_digest
    FROM identity.users account
    JOIN identity.email_credentials credential ON credential.user_id = account.id
   WHERE account.id = NEW.subject_user_id AND account.status = 'active' AND account.deleted_at IS NULL
     AND credential.verified_at IS NOT NULL
   FOR SHARE OF account, credential;
  IF binding_digest IS NULL OR binding_digest IS DISTINCT FROM NEW.email_binding_digest THEN
    RAISE EXCEPTION 'monthly_email_renewal_subject_unavailable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := clock_timestamp();
    NEW.expires_at := NEW.created_at + interval '30 minutes';
  ELSIF TG_OP = 'UPDATE' AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN
    IF OLD.consumed_at IS NOT NULL OR OLD.invalidated_at IS NOT NULL OR NEW.source_event_id IS NULL
       OR OLD.expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'monthly_email_renewal_challenge_invalid' USING ERRCODE = '55000';
    END IF;
    NEW.consumed_at := clock_timestamp();
    IF NEW.consumed_at >= OLD.expires_at THEN
      RAISE EXCEPTION 'monthly_email_renewal_challenge_invalid' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_email_renewal_authority() FROM PUBLIC;
CREATE TRIGGER monthly_email_renewal_insert_authority
  BEFORE INSERT ON trust.monthly_email_renewal_challenges
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_email_renewal_authority();
CREATE TRIGGER monthly_email_renewal_consume_authority
  BEFORE UPDATE OF consumed_at, source_event_id ON trust.monthly_email_renewal_challenges
  FOR EACH ROW WHEN (NEW.consumed_at IS DISTINCT FROM OLD.consumed_at)
  EXECUTE FUNCTION trust.require_monthly_email_renewal_authority();

CREATE FUNCTION trust.protect_monthly_email_renewal_challenge() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN
  IF ROW(NEW.id, NEW.subject_user_id, NEW.token_hash, NEW.email_binding_digest, NEW.rules_version,
         NEW.idempotency_key, NEW.request_digest, NEW.created_at, NEW.expires_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.subject_user_id, OLD.token_hash, OLD.email_binding_digest, OLD.rules_version,
         OLD.idempotency_key, OLD.request_digest, OLD.created_at, OLD.expires_at)
     OR OLD.consumed_at IS NOT NULL OR OLD.invalidated_at IS NOT NULL
     OR (NEW.consumed_at IS NOT NULL AND NEW.invalidated_at IS NOT NULL)
     OR (NEW.consumed_at IS NOT NULL AND NEW.source_event_id IS NULL)
     OR (NEW.invalidated_at IS NOT NULL AND NEW.source_event_id IS NOT NULL) THEN
    RAISE EXCEPTION 'monthly_email_renewal_challenge_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.protect_monthly_email_renewal_challenge() FROM PUBLIC;
CREATE TRIGGER monthly_email_renewal_challenge_immutable
  BEFORE UPDATE ON trust.monthly_email_renewal_challenges
  FOR EACH ROW EXECUTE FUNCTION trust.protect_monthly_email_renewal_challenge();

CREATE FUNCTION trust.require_monthly_email_renewal_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF NEW.consumed_at IS NOT NULL AND (
    NOT EXISTS (SELECT 1 FROM system.outbox_events event
      WHERE event.id = NEW.source_event_id AND event.event_type = 'identity.email.renewed'
        AND event.aggregate_type = 'monthly_email_renewal' AND event.aggregate_id = NEW.id
        AND event.actor_id = NEW.subject_user_id AND event.created_at = NEW.consumed_at
        AND event.payload ->> 'userId' = NEW.subject_user_id::text
        AND event.payload ->> 'challengeId' = NEW.id::text
        AND event.payload ->> 'rulesVersion' = NEW.rules_version)
    OR NOT EXISTS (SELECT 1 FROM trust.monthly_maintenance_observations observation
      WHERE observation.id = NEW.source_event_id AND observation.source_event_id = NEW.source_event_id
        AND observation.subject_user_id = NEW.subject_user_id AND observation.kind = 'email_control'
        AND observation.facts ->> 'emailVersion' = NEW.id::text
        AND observation.email_binding_digest = NEW.email_binding_digest
        AND observation.performed_at = NEW.consumed_at)
  ) THEN RAISE EXCEPTION 'monthly_email_renewal_receipt_incomplete' USING ERRCODE = '55000'; END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_email_renewal_receipt() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER monthly_email_renewal_receipt_complete
  AFTER UPDATE OF consumed_at ON trust.monthly_email_renewal_challenges
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.consumed_at IS NOT NULL)
  EXECUTE FUNCTION trust.require_monthly_email_renewal_receipt();

CREATE FUNCTION trust.revoke_monthly_email_renewal_challenges() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM system.feature_flags
    WHERE flag_key = 'trust.monthly_email_renewal'
      AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' OR NEW.verified_at IS NULL
     OR NEW.email_lookup_hmac IS DISTINCT FROM OLD.email_lookup_hmac THEN
    UPDATE trust.monthly_email_renewal_challenges
       SET invalidated_at = statement_timestamp()
     WHERE subject_user_id = OLD.user_id AND consumed_at IS NULL AND invalidated_at IS NULL;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;
REVOKE ALL ON FUNCTION trust.revoke_monthly_email_renewal_challenges() FROM PUBLIC;
CREATE TRIGGER monthly_email_renewal_credential_invalidation
  AFTER UPDATE OF email_lookup_hmac, verified_at OR DELETE ON identity.email_credentials
  FOR EACH ROW EXECUTE FUNCTION trust.revoke_monthly_email_renewal_challenges();

CREATE FUNCTION trust.erase_monthly_email_renewal_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM system.feature_flags
    WHERE flag_key = 'trust.monthly_email_renewal'
      AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') THEN RETURN NEW; END IF;
  IF NEW.status = 'deleted' OR NEW.deleted_at IS NOT NULL THEN
    DELETE FROM trust.monthly_email_renewal_challenges WHERE subject_user_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.erase_monthly_email_renewal_subject() FROM PUBLIC;
CREATE TRIGGER monthly_email_renewal_subject_erasure
  AFTER UPDATE OF status, deleted_at ON identity.users
  FOR EACH ROW WHEN (NEW.status = 'deleted' OR NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION trust.erase_monthly_email_renewal_subject();

CREATE FUNCTION trust.erase_monthly_email_renewal_outbox() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  DELETE FROM system.consumer_inbox inbox WHERE inbox.event_id IN
    (SELECT event.id FROM system.outbox_events event
      WHERE event.event_type = 'identity.email.renewed'
        AND event.aggregate_type = 'monthly_email_renewal' AND event.aggregate_id = OLD.id);
  DELETE FROM system.outbox_events event
   WHERE event.event_type = 'identity.email.renewed'
     AND event.aggregate_type = 'monthly_email_renewal' AND event.aggregate_id = OLD.id;
  RETURN OLD;
END; $$;
REVOKE ALL ON FUNCTION trust.erase_monthly_email_renewal_outbox() FROM PUBLIC;
CREATE TRIGGER monthly_email_renewal_outbox_erasure
  BEFORE DELETE ON trust.monthly_email_renewal_challenges
  FOR EACH ROW EXECUTE FUNCTION trust.erase_monthly_email_renewal_outbox();

CREATE FUNCTION trust.preserve_monthly_email_renewal_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF TG_OP = 'UPDATE' AND NEW.flag_key = OLD.flag_key AND NEW.policy_version = OLD.policy_version THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM trust.monthly_email_renewal_challenges) THEN
    RAISE EXCEPTION 'monthly_email_renewal_flag_requires_privacy_teardown' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
REVOKE ALL ON FUNCTION trust.preserve_monthly_email_renewal_flag() FROM PUBLIC;
CREATE TRIGGER monthly_email_renewal_flag_preserved
  BEFORE DELETE OR UPDATE OF flag_key, policy_version ON system.feature_flags
  FOR EACH ROW WHEN (OLD.flag_key = 'trust.monthly_email_renewal'
    AND OLD.policy_version = 'lythaus-monthly-rewards-2026-10-v1')
  EXECUTE FUNCTION trust.preserve_monthly_email_renewal_flag();

GRANT SELECT, INSERT, UPDATE ON trust.monthly_email_renewal_challenges TO lythaus_runtime;
GRANT SELECT, DELETE ON trust.monthly_email_renewal_challenges TO lythaus_privacy;
