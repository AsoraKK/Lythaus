CREATE TABLE trust.monthly_reward_claim_rule_sets (
  version text PRIMARY KEY,
  partner_rules_version text NOT NULL REFERENCES trust.monthly_reward_partner_rule_sets(version),
  status text NOT NULL CHECK (status = 'pending_owner_approval'),
  adapter_mode text NOT NULL CHECK (adapter_mode IN ('disabled','synthetic_fixture')),
  qr_validity_seconds integer NOT NULL CHECK (qr_validity_seconds BETWEEN 1 AND 900),
  collection_privacy_version text CHECK (collection_privacy_version = 'monthly-privacy-v1'),
  approved_by uuid REFERENCES identity.users(id),
  approved_at timestamptz,
  approval_reference text,
  CHECK ((approved_by IS NULL AND approved_at IS NULL AND approval_reference IS NULL)
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_reference IS NOT NULL
      AND length(approval_reference) BETWEEN 1 AND 500))
);
CREATE TABLE trust.monthly_reward_fulfilment_terms (
  offer_version_id uuid PRIMARY KEY REFERENCES trust.monthly_reward_offer_versions(id),
  usage_period text NOT NULL CHECK (usage_period = 'entitlement_month'),
  usage_limit integer NOT NULL CHECK (usage_limit BETWEEN 1 AND 100000),
  signed_usage_reference text NOT NULL CHECK (length(signed_usage_reference) BETWEEN 1 AND 500),
  approved_by uuid NOT NULL REFERENCES identity.users(id),
  approved_at timestamptz NOT NULL
);
CREATE TABLE trust.monthly_reward_inventory (
  offer_version_id uuid PRIMARY KEY REFERENCES trust.monthly_reward_fulfilment_terms(offer_version_id),
  available_units integer NOT NULL CHECK (available_units >= 0)
);
CREATE TABLE trust.monthly_reward_qr_reservations (
  id uuid PRIMARY KEY CHECK (substring(id::text,15,1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  consent_id uuid NOT NULL REFERENCES trust.monthly_reward_partner_consents(id),
  offer_version_id uuid NOT NULL REFERENCES trust.monthly_reward_offer_versions(id),
  snapshot_id uuid NOT NULL REFERENCES trust.monthly_reward_snapshots(id),
  token_hmac bytea NOT NULL UNIQUE CHECK (octet_length(token_hmac) = 32),
  token_ciphertext bytea NOT NULL,
  encryption_key_version text NOT NULL CHECK (length(encryption_key_version) BETWEEN 1 AND 100),
  rules_version text NOT NULL REFERENCES trust.monthly_reward_claim_rule_sets(version),
  idempotency_key uuid NOT NULL CHECK (substring(idempotency_key::text,15,1) = '7'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  UNIQUE (subject_user_id,idempotency_key)
);
CREATE TABLE trust.monthly_reward_invoice_evidence (
  id uuid PRIMARY KEY CHECK (substring(id::text,15,1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  consent_id uuid NOT NULL REFERENCES trust.monthly_reward_partner_consents(id),
  offer_version_id uuid NOT NULL REFERENCES trust.monthly_reward_offer_versions(id),
  invoice_period_hmac bytea NOT NULL CHECK (octet_length(invoice_period_hmac) = 32),
  period_starts_at timestamptz NOT NULL,
  period_ends_at timestamptz NOT NULL CHECK (period_ends_at > period_starts_at),
  renewal_at timestamptz NOT NULL CHECK (renewal_at >= period_starts_at AND renewal_at < period_ends_at),
  verification_reference text NOT NULL CHECK (length(verification_reference) BETWEEN 1 AND 500),
  adapter_mode text NOT NULL CHECK (adapter_mode = 'synthetic_fixture'),
  rules_version text NOT NULL REFERENCES trust.monthly_reward_claim_rule_sets(version),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE trust.monthly_reward_fulfilments (
  id uuid PRIMARY KEY CHECK (substring(id::text,15,1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL,
  operator_id uuid NOT NULL,
  binding_id uuid NOT NULL REFERENCES trust.monthly_reward_customer_bindings(id),
  consent_id uuid NOT NULL REFERENCES trust.monthly_reward_partner_consents(id),
  family_id uuid NOT NULL,
  offer_version_id uuid NOT NULL REFERENCES trust.monthly_reward_offer_versions(id),
  terms_version text NOT NULL,
  snapshot_id uuid NOT NULL REFERENCES trust.monthly_reward_snapshots(id),
  effective_month date NOT NULL,
  effective_reward_level smallint NOT NULL CHECK (effective_reward_level BETWEEN 1 AND 5),
  qr_reservation_id uuid UNIQUE REFERENCES trust.monthly_reward_qr_reservations(id),
  invoice_evidence_id uuid REFERENCES trust.monthly_reward_invoice_evidence(id),
  invoice_period_hmac bytea CHECK (octet_length(invoice_period_hmac) = 32),
  rules_version text NOT NULL REFERENCES trust.monthly_reward_claim_rule_sets(version),
  fulfilled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (partner_id,operator_id) REFERENCES trust.monthly_reward_partner_operators(partner_id,user_id),
  CHECK ((qr_reservation_id IS NOT NULL AND invoice_evidence_id IS NULL AND invoice_period_hmac IS NULL)
    OR (qr_reservation_id IS NULL AND invoice_evidence_id IS NOT NULL AND invoice_period_hmac IS NOT NULL)),
  UNIQUE (partner_id,binding_id,family_id,invoice_period_hmac)
);
CREATE INDEX monthly_reward_usage_idx ON trust.monthly_reward_fulfilments(partner_id,binding_id,family_id,effective_month);
CREATE TABLE trust.monthly_reward_fulfilment_commands (
  partner_id uuid NOT NULL,
  operator_id uuid NOT NULL,
  idempotency_key uuid NOT NULL CHECK (substring(idempotency_key::text,15,1) = '7'),
  qr_reservation_id uuid REFERENCES trust.monthly_reward_qr_reservations(id),
  invoice_evidence_id uuid REFERENCES trust.monthly_reward_invoice_evidence(id),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  fulfilment_id uuid NOT NULL REFERENCES trust.monthly_reward_fulfilments(id) ON DELETE CASCADE,
  PRIMARY KEY (partner_id,operator_id,idempotency_key),
  CHECK ((qr_reservation_id IS NOT NULL AND invoice_evidence_id IS NULL) OR (qr_reservation_id IS NULL AND invoice_evidence_id IS NOT NULL))
);

CREATE FUNCTION trust.authorize_monthly_reward_claim(subject uuid,consent uuid,variant uuid,actor uuid,rules_version text)
RETURNS TABLE(snapshot_id uuid,effective_month date,effective_level smallint,partner_id uuid,binding_id uuid,family_id uuid,terms_version text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cfg trust.monthly_reward_claim_rule_sets; partner_cfg trust.monthly_reward_partner_rule_sets;
  selection_cfg trust.monthly_reward_selection_rule_sets; grant_record trust.monthly_reward_partner_consents;
  offer trust.monthly_reward_offer_versions; link trust.monthly_reward_customer_bindings;
  snapshot trust.monthly_reward_snapshots; selection trust.monthly_reward_selection_revisions; who record; plan text; month date; maximum smallint;
BEGIN
  SELECT * INTO cfg FROM trust.monthly_reward_claim_rule_sets rules WHERE rules.version = rules_version
    AND rules.adapter_mode = 'synthetic_fixture' AND rules.collection_privacy_version = 'monthly-privacy-v1'
    AND rules.approved_by IS NOT NULL AND rules.approved_at <= clock_timestamp() AND rules.approval_reference IS NOT NULL;
  IF cfg.version IS NULL OR (SELECT count(*) FROM trust.lock_monthly_reward_partner_configuration()
      WHERE enabled AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') <> 4 THEN RETURN; END IF;
  SELECT * INTO partner_cfg FROM trust.monthly_reward_partner_rule_sets WHERE version = cfg.partner_rules_version
    AND adapter_mode = 'synthetic_fixture' AND collection_privacy_version = 'monthly-privacy-v1'
    AND approved_by IS NOT NULL AND approved_at <= clock_timestamp() AND approval_reference IS NOT NULL;
  IF partner_cfg.version IS NULL THEN RETURN; END IF;
  SELECT * INTO selection_cfg FROM trust.monthly_reward_selection_rule_sets WHERE version = partner_cfg.selection_rules_version
    AND collection_privacy_version = 'monthly-privacy-v1' AND approved_by IS NOT NULL
    AND approved_at <= clock_timestamp() AND approval_reference IS NOT NULL;
  IF selection_cfg.version IS NULL THEN RETURN; END IF;
  PERFORM trust.lock_monthly_reward_link_members(ARRAY[subject,actor]);
  month := date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date;
  PERFORM pg_advisory_xact_lock(hashtextextended('monthly-reputation:' || subject::text || ':' || to_char(month-interval '1 month','YYYY-MM'),0));
  SELECT subscription_tier INTO plan FROM trust.lock_monthly_reward_selection_member(subject);
  SELECT * INTO who FROM trust.lock_monthly_reward_link_identity(subject);
  IF plan IS NULL OR who IS NULL THEN RETURN; END IF;
  SELECT * INTO grant_record FROM trust.monthly_reward_partner_consents WHERE id = consent AND subject_user_id = subject;
  SELECT * INTO link FROM trust.monthly_reward_customer_bindings WHERE id = grant_record.binding_id;
  SELECT definition.* INTO offer FROM trust.monthly_reward_offer_versions definition JOIN trust.lock_monthly_reward_offer(variant) allowed
    ON allowed.id = definition.id WHERE definition.id = variant;
  IF grant_record.id IS NULL OR offer.id IS NULL OR grant_record.offer_version_id <> variant
    OR grant_record.rules_version <> partner_cfg.version OR grant_record.terms_version <> offer.terms_version
    OR offer.partner_id <> link.partner_id OR offer.family_id <> link.family_id
    OR who.binding_digest IS DISTINCT FROM grant_record.email_binding_digest
    OR who.verified_at_text::timestamptz IS DISTINCT FROM grant_record.verified_at
    OR who.recovery_generation IS DISTINCT FROM grant_record.recovery_generation THEN RETURN; END IF;
  IF actor <> subject AND NOT trust.lock_monthly_reward_partner_operator(link.partner_id,actor,'claim:consume') THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('monthly-partner-binding-id:' || link.id::text,0));
  IF EXISTS (SELECT 1 FROM trust.monthly_reward_consent_revocations WHERE consent_id = consent)
    OR EXISTS (SELECT 1 FROM trust.monthly_reward_partner_consents existing WHERE existing.binding_id = link.id AND existing.revision > grant_record.revision) THEN RETURN; END IF;
  SELECT * INTO snapshot FROM trust.monthly_reward_snapshots existing WHERE existing.subject_user_id = subject AND existing.effective_month = month
    AND existing.mode = 'confirmed' ORDER BY existing.revision DESC LIMIT 1;
  IF snapshot.id IS NULL OR snapshot.rules_version <> selection_cfg.snapshot_rules_version THEN
    RETURN QUERY SELECT NULL::uuid,month,NULL::smallint,link.partner_id,link.id,link.family_id,offer.terms_version;RETURN;
  END IF;
  SELECT * INTO selection FROM trust.monthly_reward_selection_revisions WHERE subject_user_id = subject ORDER BY revision DESC LIMIT 1;
  maximum := least(snapshot.level,CASE WHEN plan = 'free' THEN 3 ELSE 5 END);
  IF plan <> 'black' AND selection.id IS NOT NULL AND (selection.rules_version <> selection_cfg.version
      OR (plan = 'free' AND jsonb_array_length(selection.selections) <> 1)) THEN
    RETURN QUERY SELECT NULL::uuid,month,NULL::smallint,link.partner_id,link.id,link.family_id,offer.terms_version;RETURN;
  END IF;
  IF offer.required_level > maximum OR (plan <> 'black' AND (selection.id IS NULL
    OR NOT selection.selections @> jsonb_build_array(jsonb_build_object('familyId',offer.family_id,'variantId',offer.id,
      'slot',offer.required_level,'termsVersion',offer.terms_version)))) THEN RETURN; END IF;
  RETURN QUERY SELECT snapshot.id,month,maximum,link.partner_id,link.id,link.family_id,offer.terms_version;
END; $$;
REVOKE ALL ON FUNCTION trust.authorize_monthly_reward_claim(uuid,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.authorize_monthly_reward_claim(uuid,uuid,uuid,uuid,text) TO lythaus_runtime;

CREATE FUNCTION trust.require_monthly_reward_qr() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE authority record; validity integer;
BEGIN
  SELECT * INTO authority FROM trust.authorize_monthly_reward_claim(NEW.subject_user_id,NEW.consent_id,NEW.offer_version_id,NEW.subject_user_id,NEW.rules_version);
  IF authority IS NULL OR NEW.snapshot_id IS DISTINCT FROM authority.snapshot_id THEN
    RAISE EXCEPTION 'monthly_claim_authority_unavailable' USING ERRCODE = '55000'; END IF;
  PERFORM 1 FROM trust.monthly_reward_fulfilment_terms WHERE offer_version_id = NEW.offer_version_id AND approved_at <= clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'monthly_claim_terms_unavailable' USING ERRCODE = '55000'; END IF;
  SELECT qr_validity_seconds INTO validity FROM trust.monthly_reward_claim_rule_sets WHERE version = NEW.rules_version;
  NEW.issued_at := clock_timestamp();NEW.expires_at := NEW.issued_at+validity*interval '1 second';RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reward_qr() FROM PUBLIC;
CREATE TRIGGER monthly_reward_qr_guard BEFORE INSERT ON trust.monthly_reward_qr_reservations FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reward_qr();

CREATE FUNCTION trust.require_monthly_reward_invoice_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE who record;
BEGIN
  IF (SELECT count(*) FROM trust.lock_monthly_reward_partner_configuration()
      WHERE enabled AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') <> 4 THEN
    RAISE EXCEPTION 'monthly_claim_invoice_scope_invalid' USING ERRCODE = '55000'; END IF;
  PERFORM trust.lock_monthly_reward_link_members(ARRAY[NEW.subject_user_id]);
  SELECT * INTO who FROM trust.lock_monthly_reward_link_identity(NEW.subject_user_id);
  IF who IS NULL OR NOT EXISTS (SELECT 1 FROM trust.monthly_reward_claim_rule_sets cfg WHERE cfg.version = NEW.rules_version
      AND cfg.adapter_mode = 'synthetic_fixture' AND cfg.collection_privacy_version = 'monthly-privacy-v1'
      AND cfg.approved_by IS NOT NULL AND cfg.approved_at <= clock_timestamp() AND cfg.approval_reference IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM trust.monthly_reward_partner_consents consent WHERE consent.id = NEW.consent_id
      AND consent.subject_user_id = NEW.subject_user_id AND consent.offer_version_id = NEW.offer_version_id
      AND who.binding_digest IS NOT DISTINCT FROM consent.email_binding_digest
      AND who.verified_at_text::timestamptz IS NOT DISTINCT FROM consent.verified_at
      AND who.recovery_generation IS NOT DISTINCT FROM consent.recovery_generation
      AND consent.revision = (SELECT max(current_consent.revision) FROM trust.monthly_reward_partner_consents current_consent
        WHERE current_consent.binding_id = consent.binding_id)
      AND NOT EXISTS (SELECT 1 FROM trust.monthly_reward_consent_revocations revoked WHERE revoked.consent_id = consent.id)) THEN
    RAISE EXCEPTION 'monthly_claim_invoice_scope_invalid' USING ERRCODE = '55000'; END IF;
  NEW.recorded_at := clock_timestamp();RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reward_invoice_evidence() FROM PUBLIC;
CREATE TRIGGER monthly_reward_invoice_evidence_guard BEFORE INSERT ON trust.monthly_reward_invoice_evidence FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reward_invoice_evidence();

CREATE FUNCTION trust.require_monthly_reward_fulfilment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE authority record; terms trust.monthly_reward_fulfilment_terms; qr trust.monthly_reward_qr_reservations;
  invoice trust.monthly_reward_invoice_evidence; units integer;
BEGIN
  SELECT * INTO authority FROM trust.authorize_monthly_reward_claim(NEW.subject_user_id,NEW.consent_id,NEW.offer_version_id,NEW.operator_id,NEW.rules_version);
  IF authority IS NULL OR NEW.snapshot_id IS DISTINCT FROM authority.snapshot_id OR NEW.effective_month IS DISTINCT FROM authority.effective_month
    OR NEW.effective_reward_level IS DISTINCT FROM authority.effective_level OR NEW.partner_id IS DISTINCT FROM authority.partner_id
    OR NEW.binding_id IS DISTINCT FROM authority.binding_id OR NEW.family_id IS DISTINCT FROM authority.family_id
    OR NEW.terms_version IS DISTINCT FROM authority.terms_version
    OR NOT trust.lock_monthly_reward_partner_operator(NEW.partner_id,NEW.operator_id,'claim:consume') THEN
    RAISE EXCEPTION 'monthly_claim_authority_unavailable' USING ERRCODE = '55000'; END IF;
  SELECT * INTO terms FROM trust.monthly_reward_fulfilment_terms WHERE offer_version_id = NEW.offer_version_id AND approved_at <= clock_timestamp();
  IF terms.offer_version_id IS NULL THEN RAISE EXCEPTION 'monthly_claim_terms_unavailable' USING ERRCODE = '55000'; END IF;
  IF NEW.qr_reservation_id IS NOT NULL THEN
    SELECT * INTO qr FROM trust.monthly_reward_qr_reservations WHERE id = NEW.qr_reservation_id;
    IF qr.id IS NULL OR qr.subject_user_id <> NEW.subject_user_id OR qr.consent_id <> NEW.consent_id
      OR qr.offer_version_id <> NEW.offer_version_id OR qr.rules_version <> NEW.rules_version OR qr.expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'monthly_claim_qr_unavailable' USING ERRCODE = '55000'; END IF;
  ELSE
    SELECT * INTO invoice FROM trust.monthly_reward_invoice_evidence WHERE id = NEW.invoice_evidence_id;
    IF invoice.id IS NULL OR invoice.subject_user_id <> NEW.subject_user_id OR invoice.consent_id <> NEW.consent_id
      OR invoice.offer_version_id <> NEW.offer_version_id OR invoice.rules_version <> NEW.rules_version
      OR invoice.invoice_period_hmac IS DISTINCT FROM NEW.invoice_period_hmac OR invoice.renewal_at > clock_timestamp()
      OR date_trunc('month',invoice.renewal_at AT TIME ZONE 'UTC')::date <> authority.effective_month THEN
      RAISE EXCEPTION 'monthly_claim_invoice_unavailable' USING ERRCODE = '55000'; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('monthly-claim-usage:' || NEW.partner_id::text || ':' || NEW.binding_id::text
    || ':' || NEW.family_id::text || ':' || NEW.effective_month::text,0));
  IF (SELECT count(*) FROM trust.monthly_reward_fulfilments WHERE partner_id = NEW.partner_id AND binding_id = NEW.binding_id
      AND family_id = NEW.family_id AND effective_month = NEW.effective_month) >= terms.usage_limit THEN
    RAISE EXCEPTION 'monthly_claim_usage_exhausted' USING ERRCODE = '55000'; END IF;
  SELECT available_units INTO units FROM trust.monthly_reward_inventory WHERE offer_version_id = NEW.offer_version_id FOR UPDATE;
  IF units IS NULL OR units < 1 THEN RAISE EXCEPTION 'monthly_claim_stock_unavailable' USING ERRCODE = '55000'; END IF;
  IF NEW.qr_reservation_id IS NOT NULL AND qr.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'monthly_claim_qr_unavailable' USING ERRCODE = '55000'; END IF;
  IF date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date <> authority.effective_month THEN
    RAISE EXCEPTION 'monthly_claim_calendar_changed' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM trust.monthly_reward_offer_versions offer WHERE offer.id = NEW.offer_version_id
      AND offer.starts_at <= clock_timestamp() AND offer.ends_at > clock_timestamp() AND offer.approved_at <= clock_timestamp()) THEN
    RAISE EXCEPTION 'monthly_claim_offer_unavailable' USING ERRCODE = '55000'; END IF;
  NEW.fulfilled_at := clock_timestamp();RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reward_fulfilment() FROM PUBLIC;
CREATE TRIGGER monthly_reward_fulfilment_guard BEFORE INSERT ON trust.monthly_reward_fulfilments FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reward_fulfilment();

CREATE FUNCTION trust.commit_monthly_reward_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  UPDATE trust.monthly_reward_inventory SET available_units = available_units-1 WHERE offer_version_id = NEW.offer_version_id AND available_units > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'monthly_claim_stock_unavailable' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.commit_monthly_reward_stock() FROM PUBLIC;
CREATE TRIGGER monthly_reward_stock_commit AFTER INSERT ON trust.monthly_reward_fulfilments FOR EACH ROW EXECUTE FUNCTION trust.commit_monthly_reward_stock();

CREATE FUNCTION trust.require_monthly_reward_fulfilment_command() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE fulfilled trust.monthly_reward_fulfilments; source_fingerprint text; source_offer uuid; source_rules text; expected_digest text;
  source_kind text;
BEGIN
  IF NOT trust.lock_monthly_reward_partner_operator(NEW.partner_id,NEW.operator_id,'claim:consume') THEN
    RAISE EXCEPTION 'monthly_claim_command_scope_invalid' USING ERRCODE = '55000'; END IF;
  SELECT * INTO fulfilled FROM trust.monthly_reward_fulfilments record WHERE record.id = NEW.fulfilment_id AND record.partner_id = NEW.partner_id;
  IF fulfilled.id IS NULL THEN RAISE EXCEPTION 'monthly_claim_command_scope_invalid' USING ERRCODE = '55000'; END IF;
  IF NEW.qr_reservation_id IS NOT NULL THEN
    source_kind := 'qr';
    SELECT encode(reservation.token_hmac,'hex'),reservation.offer_version_id,reservation.rules_version
      INTO source_fingerprint,source_offer,source_rules FROM trust.monthly_reward_qr_reservations reservation
      JOIN trust.monthly_reward_offer_versions offer ON offer.id = reservation.offer_version_id
      WHERE reservation.id = NEW.qr_reservation_id AND reservation.subject_user_id = fulfilled.subject_user_id
        AND reservation.consent_id = fulfilled.consent_id AND offer.partner_id = NEW.partner_id
        AND reservation.rules_version = fulfilled.rules_version AND fulfilled.qr_reservation_id = reservation.id;
  ELSE
    source_kind := 'invoice';
    SELECT encode(invoice.invoice_period_hmac,'hex'),invoice.offer_version_id,invoice.rules_version
      INTO source_fingerprint,source_offer,source_rules FROM trust.monthly_reward_invoice_evidence invoice
      JOIN trust.monthly_reward_offer_versions offer ON offer.id = invoice.offer_version_id
      WHERE invoice.id = NEW.invoice_evidence_id AND invoice.subject_user_id = fulfilled.subject_user_id
        AND invoice.consent_id = fulfilled.consent_id AND invoice.invoice_period_hmac = fulfilled.invoice_period_hmac
        AND offer.partner_id = NEW.partner_id AND offer.family_id = fulfilled.family_id
        AND invoice.rules_version = fulfilled.rules_version AND fulfilled.invoice_evidence_id IS NOT NULL;
  END IF;
  IF source_fingerprint IS NULL OR source_offer <> fulfilled.offer_version_id OR source_rules <> fulfilled.rules_version THEN
    RAISE EXCEPTION 'monthly_claim_command_source_invalid' USING ERRCODE = '55000'; END IF;
  expected_digest := encode(public.digest(convert_to('[' || to_json(source_offer::text)::text || ',' ||
    to_json(source_fingerprint)::text || ',' || to_json(source_rules)::text || ',' || to_json(fulfilled.subject_user_id::text)::text || ',' ||
    to_json(fulfilled.consent_id::text)::text || ',' || to_json(source_kind)::text || ']','UTF8'),'sha256'),'hex');
  IF NEW.request_digest <> expected_digest THEN RAISE EXCEPTION 'monthly_claim_command_digest_invalid' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reward_fulfilment_command() FROM PUBLIC;
CREATE TRIGGER monthly_reward_fulfilment_command_guard BEFORE INSERT ON trust.monthly_reward_fulfilment_commands FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reward_fulfilment_command();

CREATE TRIGGER monthly_reward_claim_rules_immutable BEFORE UPDATE ON trust.monthly_reward_claim_rule_sets FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_fulfilment_terms_immutable BEFORE UPDATE ON trust.monthly_reward_fulfilment_terms FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_qr_immutable BEFORE UPDATE ON trust.monthly_reward_qr_reservations FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_invoice_immutable BEFORE UPDATE ON trust.monthly_reward_invoice_evidence FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_fulfilment_immutable BEFORE UPDATE ON trust.monthly_reward_fulfilments FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_fulfilment_command_immutable BEFORE UPDATE ON trust.monthly_reward_fulfilment_commands FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();

CREATE FUNCTION trust.erase_monthly_reward_claim_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM system.feature_flags WHERE flag_key = 'trust.monthly_reward_partners'
    AND policy_version = 'lythaus-monthly-rewards-2026-10-v1' FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  DELETE FROM system.consumer_inbox WHERE event_id IN (SELECT id FROM system.outbox_events
    WHERE actor_id = NEW.id AND event_type = 'trust.monthly_reward_fulfilled');
  DELETE FROM system.outbox_events WHERE actor_id = NEW.id AND event_type = 'trust.monthly_reward_fulfilled';
  DELETE FROM trust.monthly_reward_fulfilments WHERE subject_user_id = NEW.id;
  DELETE FROM trust.monthly_reward_qr_reservations WHERE subject_user_id = NEW.id;
  DELETE FROM trust.monthly_reward_invoice_evidence WHERE subject_user_id = NEW.id;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.erase_monthly_reward_claim_subject() FROM PUBLIC;
CREATE TRIGGER monthly_reputation_reward_claim_subject_erasure BEFORE UPDATE OF status,deleted_at ON identity.users
  FOR EACH ROW WHEN (NEW.status = 'deleted' OR NEW.deleted_at IS NOT NULL) EXECUTE FUNCTION trust.erase_monthly_reward_claim_subject();

GRANT SELECT ON trust.monthly_reward_claim_rule_sets,trust.monthly_reward_fulfilment_terms,trust.monthly_reward_inventory TO lythaus_runtime;
GRANT SELECT,INSERT ON trust.monthly_reward_qr_reservations,trust.monthly_reward_fulfilments,trust.monthly_reward_fulfilment_commands TO lythaus_runtime;
GRANT SELECT ON trust.monthly_reward_invoice_evidence TO lythaus_runtime;
GRANT SELECT,INSERT ON trust.monthly_reward_invoice_evidence TO lythaus_jobs;
GRANT SELECT,DELETE ON trust.monthly_reward_qr_reservations,trust.monthly_reward_fulfilments,trust.monthly_reward_invoice_evidence,trust.monthly_reward_fulfilment_commands TO lythaus_privacy;
