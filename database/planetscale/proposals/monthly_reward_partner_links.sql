CREATE TABLE trust.monthly_reward_partner_rule_sets (
  version text PRIMARY KEY,
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  selection_rules_version text NOT NULL REFERENCES trust.monthly_reward_selection_rule_sets(version),
  status text NOT NULL CHECK (status = 'pending_owner_approval'),
  adapter_mode text NOT NULL CHECK (adapter_mode IN ('disabled','synthetic_fixture')),
  invitation_seconds integer NOT NULL CHECK (invitation_seconds BETWEEN 1 AND 3600),
  lookup_per_minute integer NOT NULL CHECK (lookup_per_minute BETWEEN 1 AND 100),
  collection_privacy_version text CHECK (collection_privacy_version = 'monthly-privacy-v1'),
  approved_by uuid REFERENCES identity.users(id),
  approved_at timestamptz,
  approval_reference text,
  CHECK ((approved_by IS NULL AND approved_at IS NULL AND approval_reference IS NULL)
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_reference IS NOT NULL
      AND length(approval_reference) BETWEEN 1 AND 500))
);
CREATE TABLE trust.monthly_reward_partner_operators (
  partner_id uuid NOT NULL CHECK (substring(partner_id::text,15,1) = '7'),
  user_id uuid NOT NULL REFERENCES identity.users(id),
  active boolean NOT NULL DEFAULT false,
  scopes text[] NOT NULL CHECK (scopes <@ ARRAY['link:invite','eligibility:read','claim:consume']::text[]),
  PRIMARY KEY (partner_id,user_id)
);
CREATE TABLE trust.monthly_reward_link_invitations (
  id uuid PRIMARY KEY CHECK (substring(id::text,15,1) = '7'),
  partner_id uuid NOT NULL,
  operator_id uuid NOT NULL,
  offer_version_id uuid NOT NULL REFERENCES trust.monthly_reward_offer_versions(id),
  email_partner_hmac bytea NOT NULL CHECK (octet_length(email_partner_hmac) = 32),
  recipient_identity_hmac bytea NOT NULL CHECK (octet_length(recipient_identity_hmac) = 32),
  recipient_hmac_key_version text NOT NULL CHECK (length(recipient_hmac_key_version) BETWEEN 1 AND 100),
  customer_partner_hmac bytea NOT NULL CHECK (octet_length(customer_partner_hmac) = 32),
  token_hmac bytea NOT NULL UNIQUE CHECK (octet_length(token_hmac) = 32),
  token_ciphertext bytea NOT NULL,
  encryption_key_version text NOT NULL CHECK (length(encryption_key_version) BETWEEN 1 AND 100),
  rules_version text NOT NULL REFERENCES trust.monthly_reward_partner_rule_sets(version),
  idempotency_key uuid NOT NULL CHECK (substring(idempotency_key::text,15,1) = '7'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
  FOREIGN KEY (partner_id,operator_id) REFERENCES trust.monthly_reward_partner_operators(partner_id,user_id),
  UNIQUE (partner_id,operator_id,idempotency_key)
);
CREATE TABLE trust.monthly_reward_customer_bindings (
  id uuid PRIMARY KEY CHECK (substring(id::text,15,1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL,
  family_id uuid NOT NULL,
  invitation_id uuid NOT NULL REFERENCES trust.monthly_reward_link_invitations(id),
  customer_partner_hmac bytea NOT NULL CHECK (octet_length(customer_partner_hmac) = 32),
  UNIQUE (partner_id,family_id,customer_partner_hmac),
  UNIQUE (id,subject_user_id)
);
CREATE TABLE trust.monthly_reward_partner_consents (
  id uuid PRIMARY KEY CHECK (substring(id::text,15,1) = '7'),
  binding_id uuid NOT NULL,
  subject_user_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  supersedes_id uuid,
  invitation_id uuid NOT NULL UNIQUE REFERENCES trust.monthly_reward_link_invitations(id),
  offer_version_id uuid NOT NULL REFERENCES trust.monthly_reward_offer_versions(id),
  terms_version text NOT NULL,
  email_partner_hmac bytea NOT NULL CHECK (octet_length(email_partner_hmac) = 32),
  email_binding_digest bytea NOT NULL CHECK (octet_length(email_binding_digest) = 32),
  verified_at timestamptz NOT NULL,
  recovery_generation bigint NOT NULL CHECK (recovery_generation >= 0),
  rules_version text NOT NULL REFERENCES trust.monthly_reward_partner_rule_sets(version),
  idempotency_key uuid NOT NULL CHECK (substring(idempotency_key::text,15,1) = '7'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (binding_id,subject_user_id) REFERENCES trust.monthly_reward_customer_bindings(id,subject_user_id) ON DELETE CASCADE,
  UNIQUE (binding_id,revision),
  UNIQUE (subject_user_id,idempotency_key),
  UNIQUE (id,binding_id),
  FOREIGN KEY (supersedes_id,binding_id) REFERENCES trust.monthly_reward_partner_consents(id,binding_id),
  CHECK ((revision = 1 AND supersedes_id IS NULL) OR (revision > 1 AND supersedes_id IS NOT NULL))
);
CREATE TABLE trust.monthly_reward_consent_revocations (
  consent_id uuid NOT NULL REFERENCES trust.monthly_reward_partner_consents(id) ON DELETE CASCADE,
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL CHECK (substring(idempotency_key::text,15,1) = '7'),
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (consent_id,idempotency_key),
  UNIQUE (subject_user_id,idempotency_key)
);
CREATE TABLE trust.monthly_reward_partner_rate_windows (
  partner_id uuid NOT NULL,
  operator_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK (requests > 0),
  PRIMARY KEY (partner_id,operator_id,starts_at)
);

CREATE TABLE trust.monthly_reward_recovery_generations (
  subject_user_id uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  generation bigint NOT NULL CHECK (generation > 0),
  last_source_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION trust.capture_monthly_reward_recovery() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM system.feature_flags flag JOIN trust.monthly_reward_partner_rule_sets rules
      ON rules.policy_version = flag.policy_version WHERE flag.flag_key = 'trust.monthly_reward_partners'
      AND rules.collection_privacy_version = 'monthly-privacy-v1' AND rules.approved_by IS NOT NULL
      AND rules.approved_at <= clock_timestamp() AND rules.approval_reference IS NOT NULL) THEN RETURN NEW; END IF;
  PERFORM 1 FROM identity.users WHERE id = NEW.user_id AND status <> 'deleted' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO trust.monthly_reward_recovery_generations (subject_user_id,generation,last_source_id)
    VALUES (NEW.user_id,1,NEW.id) ON CONFLICT (subject_user_id) DO UPDATE
    SET generation = trust.monthly_reward_recovery_generations.generation+1,last_source_id = NEW.id,updated_at = clock_timestamp();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.capture_monthly_reward_recovery() FROM PUBLIC;
CREATE TRIGGER monthly_reward_recovery_capture AFTER INSERT ON identity.account_events
  FOR EACH ROW WHEN (NEW.event_type = 'password_reset_completed') EXECUTE FUNCTION trust.capture_monthly_reward_recovery();

CREATE FUNCTION trust.lock_monthly_reward_partner_operator(partner uuid,actor uuid,scope text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM identity.users WHERE id = actor AND status = 'active' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM trust.monthly_reward_partner_operators WHERE partner_id = partner AND user_id = actor
    AND active AND scope = ANY(scopes) FOR SHARE;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION trust.lock_monthly_reward_partner_operator(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_reward_partner_operator(uuid,uuid,text) TO lythaus_runtime;

CREATE FUNCTION trust.check_monthly_reward_partner_operator(partner uuid,actor uuid,scope text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM trust.monthly_reward_partner_operators operator JOIN identity.users account ON account.id = operator.user_id
    WHERE operator.partner_id = partner AND operator.user_id = actor AND operator.active AND scope = ANY(operator.scopes)
      AND account.status = 'active' AND account.deleted_at IS NULL);
$$;
REVOKE ALL ON FUNCTION trust.check_monthly_reward_partner_operator(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.check_monthly_reward_partner_operator(uuid,uuid,text) TO lythaus_runtime;

CREATE FUNCTION trust.lock_monthly_reward_partner_configuration() RETURNS TABLE(flag_key text,enabled boolean,policy_version text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT flag.flag_key,flag.enabled,flag.policy_version FROM system.feature_flags flag
  WHERE flag.flag_key IN ('trust.monthly_reputation_shadow','trust.monthly_reward_snapshots','trust.monthly_reward_selections','trust.monthly_reward_partners')
  ORDER BY flag.flag_key FOR SHARE OF flag;
$$;
REVOKE ALL ON FUNCTION trust.lock_monthly_reward_partner_configuration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_reward_partner_configuration() TO lythaus_runtime;

CREATE FUNCTION trust.lock_monthly_reward_link_members(members uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE member uuid; month text := to_char(date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')-interval '1 month','YYYY-MM');
BEGIN
  IF cardinality(members) NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'monthly_partner_member_scope_invalid'; END IF;
  FOR member IN SELECT DISTINCT value FROM unnest(members) value ORDER BY value LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('monthly-reward-member:' || member::text,0));
  END LOOP;
  FOR member IN SELECT DISTINCT value FROM unnest(members) value ORDER BY value LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('monthly-reputation:' || member::text || ':' || month,0));
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION trust.lock_monthly_reward_link_members(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_reward_link_members(uuid[]) TO lythaus_runtime;

CREATE FUNCTION trust.lock_monthly_reward_link_identity(subject uuid)
RETURNS TABLE(email_ciphertext bytea,encryption_key_version text,email_lookup_hmac bytea,hmac_key_version text,
  verified_at_text text,binding_digest bytea,recovery_generation bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM identity.users WHERE id = subject AND status = 'active' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT credential.email_ciphertext,credential.encryption_key_version,credential.email_lookup_hmac,
    credential.hmac_key_version,to_char(credential.verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    public.digest(credential.email_lookup_hmac,'sha256'),
    coalesce((SELECT generation FROM trust.monthly_reward_recovery_generations WHERE subject_user_id = subject),0)
    FROM identity.email_credentials credential WHERE credential.user_id = subject AND credential.verified_at IS NOT NULL FOR SHARE OF credential;
END; $$;
REVOKE ALL ON FUNCTION trust.lock_monthly_reward_link_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_reward_link_identity(uuid) TO lythaus_runtime;

CREATE FUNCTION trust.require_monthly_reward_link_invitation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rules trust.monthly_reward_partner_rule_sets;
BEGIN
  IF (SELECT count(*) FROM trust.lock_monthly_reward_partner_configuration()
      WHERE enabled AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') <> 4 THEN
    RAISE EXCEPTION 'monthly_partner_approval_unavailable' USING ERRCODE = '55000'; END IF;
  SELECT * INTO rules FROM trust.monthly_reward_partner_rule_sets WHERE version = NEW.rules_version
    AND collection_privacy_version = 'monthly-privacy-v1' AND approved_by IS NOT NULL AND approved_at <= clock_timestamp()
    AND approval_reference IS NOT NULL AND adapter_mode = 'synthetic_fixture';
  IF NOT FOUND THEN RAISE EXCEPTION 'monthly_partner_approval_unavailable' USING ERRCODE = '55000'; END IF;
  PERFORM trust.lock_monthly_reward_link_members(ARRAY[NEW.operator_id]);
  IF NOT trust.lock_monthly_reward_partner_operator(NEW.partner_id,NEW.operator_id,'link:invite')
    OR NOT EXISTS (SELECT 1 FROM trust.monthly_reward_offer_versions offer JOIN trust.lock_monthly_reward_offer(NEW.offer_version_id) allowed
      ON allowed.id = offer.id WHERE offer.id = NEW.offer_version_id AND offer.partner_id = NEW.partner_id) THEN
    RAISE EXCEPTION 'monthly_partner_invitation_unavailable' USING ERRCODE = '55000'; END IF;
  NEW.issued_at := clock_timestamp();NEW.expires_at := NEW.issued_at+rules.invitation_seconds*interval '1 second';
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reward_link_invitation() FROM PUBLIC;
CREATE TRIGGER monthly_reward_link_invitation_guard BEFORE INSERT ON trust.monthly_reward_link_invitations
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reward_link_invitation();

CREATE FUNCTION trust.require_monthly_reward_customer_binding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE invitation trust.monthly_reward_link_invitations;
BEGIN
  IF (SELECT count(*) FROM trust.lock_monthly_reward_partner_configuration()
      WHERE enabled AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') <> 4 THEN
    RAISE EXCEPTION 'monthly_partner_approval_unavailable' USING ERRCODE = '55000'; END IF;
  SELECT * INTO invitation FROM trust.monthly_reward_link_invitations WHERE id = NEW.invitation_id;
  IF invitation.id IS NULL THEN RAISE EXCEPTION 'monthly_partner_invitation_unavailable' USING ERRCODE = '55000'; END IF;
  PERFORM trust.lock_monthly_reward_link_members(ARRAY[NEW.subject_user_id,invitation.operator_id]);
  IF NOT EXISTS (SELECT 1 FROM trust.lock_monthly_reward_link_identity(NEW.subject_user_id) who
      WHERE who.email_lookup_hmac = invitation.recipient_identity_hmac AND who.hmac_key_version = invitation.recipient_hmac_key_version)
    OR invitation.partner_id IS DISTINCT FROM NEW.partner_id OR invitation.customer_partner_hmac IS DISTINCT FROM NEW.customer_partner_hmac
    OR NOT trust.lock_monthly_reward_partner_operator(invitation.partner_id,invitation.operator_id,'link:invite')
    OR NOT EXISTS (SELECT 1 FROM trust.monthly_reward_offer_versions offer JOIN trust.lock_monthly_reward_offer(invitation.offer_version_id) allowed
      ON allowed.id = offer.id WHERE offer.id = invitation.offer_version_id AND offer.family_id = NEW.family_id)
    THEN RAISE EXCEPTION 'monthly_partner_binding_scope_invalid' USING ERRCODE = '55000'; END IF;
  IF invitation.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'monthly_partner_invitation_unavailable' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reward_customer_binding() FROM PUBLIC;
CREATE TRIGGER monthly_reward_customer_binding_guard BEFORE INSERT ON trust.monthly_reward_customer_bindings
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reward_customer_binding();

CREATE FUNCTION trust.require_monthly_reward_partner_consent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE invitation trust.monthly_reward_link_invitations; binding trust.monthly_reward_customer_bindings;
  previous trust.monthly_reward_partner_consents; who record;
BEGIN
  IF (SELECT count(*) FROM trust.lock_monthly_reward_partner_configuration()
      WHERE enabled AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') <> 4 THEN
    RAISE EXCEPTION 'monthly_partner_approval_unavailable' USING ERRCODE = '55000'; END IF;
  SELECT * INTO invitation FROM trust.monthly_reward_link_invitations WHERE id = NEW.invitation_id;
  IF invitation.id IS NULL THEN RAISE EXCEPTION 'monthly_partner_invitation_unavailable' USING ERRCODE = '55000'; END IF;
  PERFORM trust.lock_monthly_reward_link_members(ARRAY[NEW.subject_user_id,invitation.operator_id]);
  SELECT * INTO who FROM trust.lock_monthly_reward_link_identity(NEW.subject_user_id);
  SELECT * INTO binding FROM trust.monthly_reward_customer_bindings WHERE id = NEW.binding_id;
  IF who IS NULL OR NOT EXISTS (SELECT 1 FROM trust.monthly_reward_partner_rule_sets rules WHERE rules.version = NEW.rules_version
      AND rules.collection_privacy_version = 'monthly-privacy-v1' AND rules.approved_by IS NOT NULL
      AND rules.approved_at <= clock_timestamp() AND rules.approval_reference IS NOT NULL AND rules.adapter_mode = 'synthetic_fixture')
    OR invitation.rules_version <> NEW.rules_version OR binding.subject_user_id IS DISTINCT FROM NEW.subject_user_id
    OR invitation.partner_id IS DISTINCT FROM binding.partner_id OR invitation.customer_partner_hmac IS DISTINCT FROM binding.customer_partner_hmac
    OR invitation.offer_version_id <> NEW.offer_version_id OR invitation.email_partner_hmac <> NEW.email_partner_hmac
    OR who.email_lookup_hmac IS DISTINCT FROM invitation.recipient_identity_hmac
    OR who.hmac_key_version IS DISTINCT FROM invitation.recipient_hmac_key_version
    OR NOT trust.lock_monthly_reward_partner_operator(invitation.partner_id,invitation.operator_id,'link:invite')
    OR who.binding_digest IS DISTINCT FROM NEW.email_binding_digest OR who.verified_at_text::timestamptz IS DISTINCT FROM NEW.verified_at
    OR who.recovery_generation IS DISTINCT FROM NEW.recovery_generation
    OR NOT EXISTS (SELECT 1 FROM trust.monthly_reward_offer_versions offer JOIN trust.lock_monthly_reward_offer(NEW.offer_version_id) allowed
      ON allowed.id = offer.id WHERE offer.id = NEW.offer_version_id AND offer.family_id = binding.family_id AND offer.terms_version = NEW.terms_version)
    THEN RAISE EXCEPTION 'monthly_partner_consent_scope_invalid' USING ERRCODE = '55000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('monthly-partner-binding-id:' || NEW.binding_id::text,0));
  SELECT * INTO previous FROM trust.monthly_reward_partner_consents WHERE binding_id = NEW.binding_id ORDER BY revision DESC LIMIT 1;
  IF NEW.revision <> coalesce(previous.revision,0)+1 OR NEW.supersedes_id IS DISTINCT FROM previous.id THEN
    RAISE EXCEPTION 'monthly_partner_consent_revision_conflict' USING ERRCODE = '55000'; END IF;
  IF invitation.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'monthly_partner_invitation_unavailable' USING ERRCODE = '55000'; END IF;
  NEW.granted_at := clock_timestamp();RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reward_partner_consent() FROM PUBLIC;
CREATE TRIGGER monthly_reward_partner_consent_guard BEFORE INSERT ON trust.monthly_reward_partner_consents
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reward_partner_consent();

CREATE FUNCTION trust.require_monthly_reward_consent_revocation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF NOT trust.lock_monthly_reward_subject(NEW.subject_user_id)
    OR NOT EXISTS (SELECT 1 FROM trust.monthly_reward_partner_consents WHERE id = NEW.consent_id AND subject_user_id = NEW.subject_user_id) THEN
    RAISE EXCEPTION 'monthly_partner_consent_unavailable' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reward_consent_revocation() FROM PUBLIC;
CREATE TRIGGER monthly_reward_consent_revocation_guard BEFORE INSERT ON trust.monthly_reward_consent_revocations
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reward_consent_revocation();

CREATE FUNCTION trust.erase_monthly_reward_partner_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE invitation_ids uuid[];
BEGIN
  PERFORM 1 FROM system.feature_flags WHERE flag_key = 'trust.monthly_reward_partners'
    AND policy_version = 'lythaus-monthly-rewards-2026-10-v1' FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT array_agg(id) INTO invitation_ids FROM (
    SELECT invitation_id AS id FROM trust.monthly_reward_partner_consents WHERE subject_user_id = NEW.id
    UNION SELECT invitation.id FROM trust.monthly_reward_link_invitations invitation
      JOIN identity.email_credentials credential ON credential.email_lookup_hmac = invitation.recipient_identity_hmac
        AND credential.hmac_key_version = invitation.recipient_hmac_key_version WHERE credential.user_id = NEW.id
  ) related;
  DELETE FROM trust.monthly_reward_consent_revocations WHERE subject_user_id = NEW.id;
  DELETE FROM trust.monthly_reward_partner_consents WHERE subject_user_id = NEW.id;
  DELETE FROM trust.monthly_reward_customer_bindings WHERE subject_user_id = NEW.id;
  DELETE FROM trust.monthly_reward_link_invitations WHERE id = ANY(invitation_ids);
  DELETE FROM trust.monthly_reward_recovery_generations WHERE subject_user_id = NEW.id;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.erase_monthly_reward_partner_subject() FROM PUBLIC;
CREATE TRIGGER monthly_reputation_reward_partner_subject_erasure BEFORE UPDATE OF status,deleted_at ON identity.users
  FOR EACH ROW WHEN (NEW.status = 'deleted' OR NEW.deleted_at IS NOT NULL) EXECUTE FUNCTION trust.erase_monthly_reward_partner_subject();

CREATE FUNCTION trust.preserve_monthly_reward_partner_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF TG_OP = 'UPDATE' AND NEW.flag_key = OLD.flag_key AND NEW.policy_version = OLD.policy_version THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM trust.monthly_reward_partner_rule_sets) OR EXISTS (SELECT 1 FROM trust.monthly_reward_partner_consents)
    OR EXISTS (SELECT 1 FROM trust.monthly_reward_link_invitations) OR EXISTS (SELECT 1 FROM trust.monthly_reward_recovery_generations) THEN
    RAISE EXCEPTION 'monthly_partner_privacy_teardown_required' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.preserve_monthly_reward_partner_flag() FROM PUBLIC;
CREATE TRIGGER monthly_reward_partner_flag_preserved BEFORE DELETE OR UPDATE OF flag_key,policy_version ON system.feature_flags
  FOR EACH ROW WHEN (OLD.flag_key = 'trust.monthly_reward_partners' AND OLD.policy_version = 'lythaus-monthly-rewards-2026-10-v1')
  EXECUTE FUNCTION trust.preserve_monthly_reward_partner_flag();

CREATE TRIGGER monthly_reward_invitation_immutable BEFORE UPDATE ON trust.monthly_reward_link_invitations
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_customer_binding_immutable BEFORE UPDATE ON trust.monthly_reward_customer_bindings
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_partner_consent_immutable BEFORE UPDATE ON trust.monthly_reward_partner_consents
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_partner_revocation_immutable BEFORE UPDATE ON trust.monthly_reward_consent_revocations
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_partner_rules_immutable BEFORE UPDATE ON trust.monthly_reward_partner_rule_sets
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();

GRANT SELECT ON trust.monthly_reward_partner_rule_sets,trust.monthly_reward_partner_operators TO lythaus_runtime;
GRANT SELECT,INSERT ON trust.monthly_reward_link_invitations,trust.monthly_reward_customer_bindings,
  trust.monthly_reward_partner_consents,trust.monthly_reward_consent_revocations TO lythaus_runtime;
GRANT SELECT,INSERT,UPDATE ON trust.monthly_reward_partner_rate_windows TO lythaus_runtime;
GRANT SELECT,DELETE ON trust.monthly_reward_link_invitations,trust.monthly_reward_customer_bindings,
  trust.monthly_reward_partner_consents,trust.monthly_reward_consent_revocations,trust.monthly_reward_recovery_generations TO lythaus_privacy;
