CREATE TABLE trust.monthly_context_rule_sets (
  version text PRIMARY KEY,
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  weekly_rules_version text NOT NULL REFERENCES trust.monthly_earning_rule_sets(version),
  catalogue_hash text NOT NULL CHECK (catalogue_hash ~ '^[0-9a-f]{64}$'),
  rubric_version text NOT NULL CHECK (length(rubric_version) BETWEEN 1 AND 200),
  mode text NOT NULL CHECK (mode = 'shadow'),
  status text NOT NULL CHECK (status = 'pending_owner_approval'),
  collect_from timestamptz NOT NULL,
  collection_privacy_version text CHECK (collection_privacy_version = 'monthly-privacy-v1'),
  approved_by uuid REFERENCES identity.users(id),
  approved_at timestamptz,
  approval_reference text,
  CHECK ((approved_by IS NULL AND approved_at IS NULL AND approval_reference IS NULL)
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_reference IS NOT NULL
      AND length(approval_reference) BETWEEN 1 AND 500))
);

CREATE TABLE trust.monthly_context_reviews (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  comment_id uuid NOT NULL,
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  performed_at timestamptz NOT NULL,
  actor_id uuid NOT NULL,
  rules_version text NOT NULL REFERENCES trust.monthly_context_rule_sets(version),
  revision integer NOT NULL CHECK (revision > 0),
  source_revision_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  thread_revision_id uuid NOT NULL,
  parent_id uuid,
  parent_revision_id uuid,
  scope_hash text NOT NULL CHECK (scope_hash ~ '^[0-9a-f]{64}$'),
  thread_fingerprint text NOT NULL CHECK (thread_fingerprint ~ '^[0-9a-f]{64}$'),
  parent_fingerprint text CHECK (parent_fingerprint ~ '^[0-9a-f]{64}$'),
  earning_facts jsonb NOT NULL CHECK (jsonb_typeof(earning_facts) = 'object'),
  decision text NOT NULL CHECK (decision IN ('accepted', 'withheld', 'reversed')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{1,99}$'),
  evidence_reference text NOT NULL CHECK (length(evidence_reference) BETWEEN 1 AND 500),
  idempotency_key uuid NOT NULL CHECK (substring(idempotency_key::text, 15, 1) = '7'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  source_event_id uuid NOT NULL UNIQUE CHECK (substring(source_event_id::text, 15, 1) = '7'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (comment_id, revision),
  UNIQUE (actor_id, idempotency_key),
  CHECK (actor_id <> subject_user_id),
  CHECK ((parent_id IS NULL) = (parent_revision_id IS NULL))
);
CREATE INDEX monthly_context_subject_idx ON trust.monthly_context_reviews(subject_user_id, comment_id, revision DESC);
CREATE INDEX monthly_context_latest_idx ON trust.monthly_context_reviews(comment_id, revision DESC);
CREATE TABLE trust.monthly_context_dependency_receipts (
  event_id uuid NOT NULL,
  comment_id uuid NOT NULL,
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, comment_id)
);
CREATE TRIGGER monthly_context_dependency_subject_guard BEFORE INSERT ON trust.monthly_context_dependency_receipts
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reputation_subject();
CREATE TRIGGER monthly_context_dependency_immutable BEFORE UPDATE ON trust.monthly_context_dependency_receipts
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_earning_update();
CREATE TRIGGER monthly_context_rules_immutable BEFORE UPDATE ON trust.monthly_context_rule_sets
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_earning_update();
CREATE TRIGGER monthly_context_reviews_immutable BEFORE UPDATE ON trust.monthly_context_reviews
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_earning_update();

CREATE FUNCTION trust.lock_monthly_context_configuration() RETURNS TABLE(flag_key text, enabled boolean, policy_version text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT flag.flag_key, flag.enabled, flag.policy_version FROM system.feature_flags flag
  WHERE flag.flag_key IN ('trust.monthly_context_review', 'trust.monthly_reputation_shadow')
  ORDER BY flag.flag_key FOR SHARE OF flag;
$$;
REVOKE ALL ON FUNCTION trust.lock_monthly_context_configuration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_context_configuration() TO lythaus_admin, lythaus_jobs;

CREATE FUNCTION trust.lock_monthly_context_actor(actor uuid, subject uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM identity.users account WHERE account.id IN (actor, subject)
    AND account.status = 'active' AND account.deleted_at IS NULL ORDER BY account.id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM identity.users WHERE id = subject AND status = 'active' AND deleted_at IS NULL)
    OR actor = subject THEN RETURN false; END IF;
  PERFORM 1 FROM identity.admin_memberships membership JOIN identity.users account ON account.id = membership.user_id
    WHERE membership.user_id = actor AND membership.active AND membership.role IN ('owner', 'administrator', 'moderator')
      AND account.status = 'active' AND account.deleted_at IS NULL FOR SHARE OF membership, account;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION trust.lock_monthly_context_actor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_context_actor(uuid, uuid) TO lythaus_admin;

CREATE FUNCTION trust.require_monthly_context_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF (SELECT count(*) FROM trust.lock_monthly_context_configuration()
      WHERE enabled AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') <> 2
    OR NOT EXISTS (SELECT 1 FROM trust.monthly_context_rule_sets WHERE version = NEW.rules_version
      AND collection_privacy_version = 'monthly-privacy-v1' AND approved_by IS NOT NULL
      AND approved_at <= clock_timestamp() AND approval_reference IS NOT NULL)
    THEN RAISE EXCEPTION 'monthly_context_unavailable' USING ERRCODE = '55000'; END IF;
  IF NOT trust.lock_monthly_context_actor(NEW.actor_id, NEW.subject_user_id) THEN
    RAISE EXCEPTION 'monthly_context_actor_not_allowed' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_context_review() FROM PUBLIC;
CREATE TRIGGER monthly_context_review_guard BEFORE INSERT ON trust.monthly_context_reviews
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_context_review();

CREATE FUNCTION trust.preserve_monthly_context_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF TG_OP = 'UPDATE' AND NEW.flag_key = OLD.flag_key AND NEW.policy_version = OLD.policy_version THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM trust.monthly_context_rule_sets WHERE approved_by IS NOT NULL)
    OR EXISTS (SELECT 1 FROM trust.monthly_context_reviews) THEN
    RAISE EXCEPTION 'monthly_context_flag_requires_privacy_teardown' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
REVOKE ALL ON FUNCTION trust.preserve_monthly_context_flag() FROM PUBLIC;
CREATE TRIGGER monthly_context_flag_preserved BEFORE DELETE OR UPDATE OF flag_key, policy_version ON system.feature_flags
  FOR EACH ROW WHEN (OLD.flag_key = 'trust.monthly_context_review'
    AND OLD.policy_version = 'lythaus-monthly-rewards-2026-10-v1') EXECUTE FUNCTION trust.preserve_monthly_context_flag();

CREATE FUNCTION trust.erase_monthly_context_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM system.feature_flags WHERE flag_key = 'trust.monthly_context_review'
    AND policy_version = 'lythaus-monthly-rewards-2026-10-v1' FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  DELETE FROM system.consumer_inbox WHERE event_id IN
    (SELECT source_event_id FROM trust.monthly_context_reviews WHERE subject_user_id = NEW.id);
  DELETE FROM system.outbox_events WHERE id IN
    (SELECT source_event_id FROM trust.monthly_context_reviews WHERE subject_user_id = NEW.id);
  DELETE FROM trust.monthly_context_reviews WHERE subject_user_id = NEW.id;
  DELETE FROM trust.monthly_context_dependency_receipts WHERE subject_user_id = NEW.id;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.erase_monthly_context_subject() FROM PUBLIC;
CREATE TRIGGER monthly_context_subject_erasure AFTER UPDATE OF status, deleted_at ON identity.users
  FOR EACH ROW WHEN (NEW.status = 'deleted' OR NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION trust.erase_monthly_context_subject();
GRANT SELECT ON trust.monthly_context_rule_sets, system.feature_flags TO lythaus_admin, lythaus_jobs;
GRANT SELECT, INSERT ON trust.monthly_context_reviews TO lythaus_admin;
GRANT SELECT ON trust.monthly_context_reviews TO lythaus_jobs;
GRANT SELECT, INSERT ON trust.monthly_context_dependency_receipts TO lythaus_jobs;
GRANT SELECT, DELETE ON trust.monthly_context_reviews TO lythaus_privacy;
GRANT SELECT, DELETE ON trust.monthly_context_dependency_receipts TO lythaus_privacy;
