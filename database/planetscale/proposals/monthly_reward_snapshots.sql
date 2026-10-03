CREATE TABLE trust.monthly_reward_snapshot_rule_sets (
  version text PRIMARY KEY,
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  catalogue_hash text NOT NULL CHECK (catalogue_hash ~ '^[0-9a-f]{64}$'),
  mode text NOT NULL CHECK (mode IN ('shadow', 'confirmed')),
  status text NOT NULL CHECK (status = 'pending_owner_approval'),
  first_source_month date NOT NULL CHECK (extract(day FROM first_source_month) = 1),
  weekly_rules_version text NOT NULL REFERENCES trust.monthly_earning_rule_sets(version),
  maintenance_rules_version text NOT NULL REFERENCES trust.monthly_maintenance_rule_sets(version),
  collection_privacy_version text CHECK (collection_privacy_version = 'monthly-privacy-v1'),
  decision_approvals jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(decision_approvals) = 'object'),
  approved_by uuid REFERENCES identity.users(id),
  approved_at timestamptz,
  approval_reference text,
  CHECK ((approved_by IS NULL AND approved_at IS NULL AND approval_reference IS NULL)
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_reference IS NOT NULL
      AND length(approval_reference) BETWEEN 1 AND 500)),
  CHECK (mode = 'shadow' OR (approved_by IS NOT NULL AND collection_privacy_version IS NOT NULL
    AND decision_approvals ?& ARRAY['D01','D02','D03','D04','D05','D06','D07','D08','D09','D10','D11','D12','D13']))
);

CREATE TABLE trust.monthly_reward_snapshots (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  source_month date NOT NULL CHECK (extract(day FROM source_month) = 1),
  effective_month date NOT NULL CHECK (effective_month = (source_month + interval '1 month')::date),
  rules_version text NOT NULL REFERENCES trust.monthly_reward_snapshot_rule_sets(version),
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  mode text NOT NULL CHECK (mode IN ('shadow','confirmed')),
  revision integer NOT NULL CHECK (revision > 0),
  supersedes_id uuid,
  assessment_id uuid NOT NULL REFERENCES trust.monthly_reputation_assessments(id) ON DELETE CASCADE,
  source_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_score integer NOT NULL CHECK (source_score BETWEEN 0 AND 13500),
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 5),
  correction_id uuid,
  source_event_id uuid NOT NULL CHECK (substring(source_event_id::text, 15, 1) = '7'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (subject_user_id, effective_month, mode, revision),
  UNIQUE (assessment_id, mode),
  UNIQUE (source_event_id, mode),
  UNIQUE (id, subject_user_id, effective_month, mode),
  FOREIGN KEY (source_id, subject_user_id, source_month, policy_version)
    REFERENCES trust.monthly_reputation_sources(id, subject_user_id, source_month, policy_version) ON DELETE CASCADE,
  FOREIGN KEY (supersedes_id, subject_user_id, effective_month, mode)
    REFERENCES trust.monthly_reward_snapshots(id, subject_user_id, effective_month, mode),
  CHECK ((revision = 1 AND supersedes_id IS NULL AND correction_id IS NULL)
    OR (revision > 1 AND supersedes_id IS NOT NULL AND correction_id IS NOT NULL)),
  CHECK (level = CASE WHEN source_score < 1000 THEN 1 WHEN source_score < 3000 THEN 2
    WHEN source_score < 6000 THEN 3 WHEN source_score < 10000 THEN 4 ELSE 5 END)
);
CREATE INDEX monthly_reward_snapshot_subject_idx
  ON trust.monthly_reward_snapshots(subject_user_id, effective_month, mode, revision DESC);
CREATE UNIQUE INDEX monthly_reward_snapshot_successor_idx
  ON trust.monthly_reward_snapshots(supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE TABLE trust.monthly_reward_snapshot_corrections (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES trust.monthly_reward_snapshots(id) ON DELETE CASCADE,
  target_assessment_id uuid NOT NULL REFERENCES trust.monthly_reputation_assessments(id) ON DELETE CASCADE,
  rules_version text NOT NULL REFERENCES trust.monthly_reward_snapshot_rule_sets(version),
  actor_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{1,99}$'),
  evidence_reference text NOT NULL CHECK (length(evidence_reference) BETWEEN 1 AND 500),
  idempotency_key uuid NOT NULL CHECK (substring(idempotency_key::text, 15, 1) = '7'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  source_event_id uuid NOT NULL UNIQUE CHECK (substring(source_event_id::text, 15, 1) = '7'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (snapshot_id, target_assessment_id),
  UNIQUE (actor_id, idempotency_key),
  CHECK (actor_id <> subject_user_id)
);
ALTER TABLE trust.monthly_reward_snapshots ADD CONSTRAINT monthly_reward_snapshot_correction_fk
  FOREIGN KEY (correction_id) REFERENCES trust.monthly_reward_snapshot_corrections(id);

CREATE TABLE trust.monthly_reward_snapshot_receipts (
  event_id uuid NOT NULL,
  rules_version text NOT NULL REFERENCES trust.monthly_reward_snapshot_rule_sets(version),
  mode text NOT NULL CHECK (mode IN ('shadow','confirmed')),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES trust.monthly_reputation_assessments(id) ON DELETE CASCADE,
  snapshot_id uuid REFERENCES trust.monthly_reward_snapshots(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('published','superseded','correction_approval_pending','before_cutover','snapshot_policy_requires_review')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (event_id,rules_version)
);

CREATE FUNCTION trust.lock_monthly_reward_configuration() RETURNS TABLE(flag_key text, enabled boolean, policy_version text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT flag.flag_key, flag.enabled, flag.policy_version FROM system.feature_flags flag
  WHERE flag.flag_key IN ('trust.monthly_reputation_shadow','trust.monthly_reward_snapshots')
  ORDER BY flag.flag_key FOR SHARE OF flag;
$$;
REVOKE ALL ON FUNCTION trust.lock_monthly_reward_configuration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_reward_configuration() TO lythaus_jobs, lythaus_admin, lythaus_runtime;

CREATE FUNCTION trust.lock_monthly_reward_subject(subject uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM identity.users WHERE id = subject AND status <> 'deleted' AND deleted_at IS NULL FOR SHARE;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION trust.lock_monthly_reward_subject(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_reward_subject(uuid) TO lythaus_jobs, lythaus_admin, lythaus_runtime;

CREATE FUNCTION trust.lock_monthly_reward_reviewer(actor uuid, subject uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM identity.users WHERE id IN (actor,subject) AND status = 'active' AND deleted_at IS NULL ORDER BY id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM identity.users WHERE id = subject AND status = 'active' AND deleted_at IS NULL)
    OR actor = subject THEN RETURN false; END IF;
  PERFORM 1 FROM identity.admin_memberships membership JOIN identity.users account ON account.id = membership.user_id
    WHERE membership.user_id = actor AND membership.active AND membership.role IN ('owner','administrator','moderator')
      AND account.status = 'active' AND account.deleted_at IS NULL FOR SHARE OF membership,account;
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION trust.lock_monthly_reward_reviewer(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trust.lock_monthly_reward_reviewer(uuid,uuid) TO lythaus_admin;

CREATE FUNCTION trust.require_monthly_reward_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM trust.lock_monthly_reward_configuration();
  PERFORM pg_advisory_xact_lock(hashtextextended('monthly-reputation:' || NEW.subject_user_id::text || ':' || to_char(NEW.source_month,'YYYY-MM'),0));
  IF (SELECT count(*) FROM trust.lock_monthly_reward_configuration()
    WHERE enabled AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') <> 2
    OR NOT trust.lock_monthly_reward_subject(NEW.subject_user_id)
    OR NOT EXISTS (SELECT 1 FROM trust.monthly_reward_snapshot_rule_sets rules
      WHERE rules.version = NEW.rules_version AND rules.mode = NEW.mode
      AND rules.policy_version = NEW.policy_version
      AND rules.catalogue_hash = 'bc8be9d8f4cae4b0f3ec327e09f308069dd3e6b07e8ff57ccc6a6cc62435f5a2'
      AND rules.collection_privacy_version = 'monthly-privacy-v1'
      AND rules.approved_by IS NOT NULL AND rules.approved_at <= clock_timestamp()
      AND rules.approval_reference IS NOT NULL
      AND (rules.mode = 'shadow' OR NOT EXISTS (SELECT 1 FROM
        unnest(ARRAY['D01','D02','D03','D04','D05','D06','D07','D08','D09','D10','D11','D12','D13']) decision(id)
        WHERE jsonb_typeof(rules.decision_approvals -> decision.id) IS DISTINCT FROM 'string'
          OR length(btrim(rules.decision_approvals ->> decision.id)) NOT BETWEEN 1 AND 500)))
    THEN RAISE EXCEPTION 'monthly_reward_snapshot_unavailable' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM trust.monthly_reputation_assessments assessment
      JOIN trust.monthly_reputation_sources source ON source.id = assessment.source_id
      JOIN trust.monthly_reputation_assemblies assembly ON assembly.source_id = source.id
      JOIN trust.monthly_reward_snapshot_rule_sets rules ON rules.version = NEW.rules_version
      JOIN trust.monthly_maintenance_rule_sets maintenance ON maintenance.version = rules.maintenance_rules_version
      WHERE assessment.id = NEW.assessment_id AND source.id = NEW.source_id
        AND source.subject_user_id = NEW.subject_user_id AND source.source_month = NEW.source_month
        AND source.revision = NEW.source_revision AND assessment.source_score = NEW.source_score AND assessment.level = NEW.level
        AND source.source_month >= rules.first_source_month
        AND ((source.source_month + interval '1 month') AT TIME ZONE 'UTC')
          + (maintenance.configuration ->> 'monthSettlementHours')::integer * interval '1 hour' <= clock_timestamp()
        AND assembly.weekly_rules_version = rules.weekly_rules_version AND assembly.rules_version = rules.maintenance_rules_version)
    THEN RAISE EXCEPTION 'monthly_reward_snapshot_provenance_required' USING ERRCODE = '55000'; END IF;
  IF NEW.source_id IS DISTINCT FROM (SELECT id FROM trust.monthly_reputation_sources
      WHERE subject_user_id = NEW.subject_user_id AND source_month = NEW.source_month AND policy_version = NEW.policy_version
      ORDER BY revision DESC LIMIT 1)
    OR (NEW.revision = 1 AND EXISTS (SELECT 1 FROM trust.monthly_reward_snapshots
      WHERE subject_user_id = NEW.subject_user_id AND effective_month = NEW.effective_month AND mode = NEW.mode))
    OR (NEW.revision > 1 AND NOT EXISTS (SELECT 1 FROM trust.monthly_reward_snapshots previous
      WHERE previous.id = NEW.supersedes_id AND previous.rules_version = NEW.rules_version
        AND previous.revision + 1 = NEW.revision AND previous.id = (SELECT id FROM trust.monthly_reward_snapshots
          WHERE subject_user_id = NEW.subject_user_id AND effective_month = NEW.effective_month AND mode = NEW.mode
          ORDER BY revision DESC LIMIT 1)))
    THEN RAISE EXCEPTION 'monthly_reward_snapshot_revision_conflict' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM system.outbox_events event WHERE event.id = NEW.source_event_id AND (
    (NEW.correction_id IS NULL AND event.event_type = 'trust.monthly_assessment.recorded'
      AND event.aggregate_type = 'monthly_reputation_assessment' AND event.aggregate_id = NEW.assessment_id
      AND event.actor_id = NEW.subject_user_id AND event.payload @> jsonb_build_object('assessmentId',NEW.assessment_id::text,
        'sourceId',NEW.source_id::text,'mode','shadow'))
    OR (NEW.correction_id IS NOT NULL AND EXISTS (SELECT 1 FROM trust.monthly_reward_snapshot_corrections correction
      WHERE correction.id = NEW.correction_id AND correction.source_event_id = event.id
        AND correction.subject_user_id = NEW.subject_user_id AND correction.target_assessment_id = NEW.assessment_id
        AND correction.snapshot_id = NEW.supersedes_id AND correction.rules_version = NEW.rules_version
        AND event.event_type = 'trust.monthly_reward_snapshot.correction_approved'
        AND event.aggregate_type = 'monthly_reward_snapshot_correction' AND event.aggregate_id = correction.id
        AND event.actor_id = correction.actor_id AND event.created_at = correction.recorded_at
        AND event.payload @> jsonb_build_object('correctionId',correction.id::text,'policyVersion',NEW.policy_version)))))
    THEN RAISE EXCEPTION 'monthly_reward_snapshot_event_required' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reward_snapshot() FROM PUBLIC;
CREATE TRIGGER monthly_reward_snapshot_guard BEFORE INSERT ON trust.monthly_reward_snapshots
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reward_snapshot();

CREATE FUNCTION trust.require_monthly_reward_correction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF (SELECT count(*) FROM trust.lock_monthly_reward_configuration()
    WHERE enabled AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') <> 2
    OR NOT EXISTS (SELECT 1 FROM trust.monthly_reward_snapshots snapshot
      JOIN trust.monthly_reward_snapshot_rule_sets rules ON rules.version = snapshot.rules_version
      JOIN trust.monthly_reputation_assessments assessment ON assessment.id = NEW.target_assessment_id
      JOIN trust.monthly_reputation_sources source ON source.id = assessment.source_id
      WHERE snapshot.id = NEW.snapshot_id AND snapshot.subject_user_id = NEW.subject_user_id
        AND source.subject_user_id = NEW.subject_user_id AND source.source_month = snapshot.source_month
        AND rules.version = NEW.rules_version AND rules.approved_by IS NOT NULL
        AND rules.approved_at <= clock_timestamp() AND rules.collection_privacy_version = 'monthly-privacy-v1')
    THEN RAISE EXCEPTION 'monthly_reward_correction_scope_invalid' USING ERRCODE = '55000'; END IF;
  IF NOT trust.lock_monthly_reward_reviewer(NEW.actor_id,NEW.subject_user_id) THEN
    RAISE EXCEPTION 'monthly_reward_correction_actor_not_allowed' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reward_correction() FROM PUBLIC;
CREATE TRIGGER monthly_reward_correction_guard BEFORE INSERT ON trust.monthly_reward_snapshot_corrections
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reward_correction();

CREATE TRIGGER monthly_reward_snapshot_rules_immutable BEFORE UPDATE ON trust.monthly_reward_snapshot_rule_sets
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_snapshots_immutable BEFORE UPDATE ON trust.monthly_reward_snapshots
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_snapshot_corrections_immutable BEFORE UPDATE ON trust.monthly_reward_snapshot_corrections
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE TRIGGER monthly_reward_snapshot_receipts_immutable BEFORE UPDATE ON trust.monthly_reward_snapshot_receipts
  FOR EACH ROW EXECUTE FUNCTION trust.reject_monthly_reputation_update();
CREATE FUNCTION trust.require_monthly_reward_snapshot_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE receipt_month date;
BEGIN
  PERFORM 1 FROM trust.lock_monthly_reward_configuration();
  SELECT source.source_month INTO receipt_month FROM trust.monthly_reputation_assessments assessment
    JOIN trust.monthly_reputation_sources source ON source.id = assessment.source_id WHERE assessment.id = NEW.assessment_id;
  IF receipt_month IS NULL THEN RAISE EXCEPTION 'monthly_reward_receipt_provenance_required' USING ERRCODE = '55000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('monthly-reputation:' || NEW.subject_user_id::text || ':' || to_char(receipt_month,'YYYY-MM'),0));
  IF (SELECT count(*) FROM trust.lock_monthly_reward_configuration()
      WHERE enabled AND policy_version = 'lythaus-monthly-rewards-2026-10-v1') <> 2
    OR NOT trust.lock_monthly_reward_subject(NEW.subject_user_id)
    OR NOT EXISTS (SELECT 1 FROM trust.monthly_reward_snapshot_rule_sets rules
      WHERE rules.version = NEW.rules_version AND rules.mode = NEW.mode
        AND rules.collection_privacy_version = 'monthly-privacy-v1'
        AND rules.approved_by IS NOT NULL AND rules.approved_at <= clock_timestamp())
    OR NOT EXISTS (SELECT 1 FROM system.outbox_events event
      JOIN trust.monthly_reputation_assessments assessment ON assessment.id = NEW.assessment_id
      JOIN trust.monthly_reputation_sources source ON source.id = assessment.source_id
      WHERE event.id = NEW.event_id AND source.subject_user_id = NEW.subject_user_id AND (
        (event.event_type = 'trust.monthly_assessment.recorded' AND event.aggregate_type = 'monthly_reputation_assessment'
          AND event.aggregate_id = assessment.id AND event.actor_id = NEW.subject_user_id
          AND event.payload @> jsonb_build_object('assessmentId',assessment.id::text,'sourceId',source.id::text,'mode','shadow'))
        OR EXISTS (SELECT 1 FROM trust.monthly_reward_snapshot_corrections correction
          WHERE correction.source_event_id = event.id AND correction.target_assessment_id = assessment.id
            AND correction.subject_user_id = NEW.subject_user_id AND correction.rules_version = NEW.rules_version
            AND event.event_type = 'trust.monthly_reward_snapshot.correction_approved'
            AND event.aggregate_type = 'monthly_reward_snapshot_correction' AND event.aggregate_id = correction.id
            AND event.actor_id = correction.actor_id AND event.created_at = correction.recorded_at
            AND event.payload @> jsonb_build_object('correctionId',correction.id::text,'policyVersion',source.policy_version))))
    OR (NEW.snapshot_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM trust.monthly_reward_snapshots snapshot
      WHERE snapshot.id = NEW.snapshot_id AND snapshot.subject_user_id = NEW.subject_user_id AND snapshot.mode = NEW.mode))
    THEN RAISE EXCEPTION 'monthly_reward_receipt_provenance_required' USING ERRCODE = '55000'; END IF;
  IF NEW.state IN ('correction_approval_pending','snapshot_policy_requires_review','before_cutover')
      AND NOT EXISTS (SELECT 1 FROM system.outbox_events event WHERE event.id = NEW.event_id
        AND event.event_type = 'trust.monthly_assessment.recorded')
    OR NEW.state = 'published' AND NOT EXISTS (SELECT 1 FROM trust.monthly_reward_snapshots snapshot
      WHERE snapshot.id = NEW.snapshot_id AND snapshot.subject_user_id = NEW.subject_user_id AND snapshot.mode = NEW.mode
        AND snapshot.rules_version = NEW.rules_version AND snapshot.assessment_id = NEW.assessment_id)
    OR NEW.state IN ('correction_approval_pending','snapshot_policy_requires_review') AND NOT EXISTS (
      SELECT 1 FROM trust.monthly_reward_snapshots snapshot
      JOIN trust.monthly_reputation_assessments assessment ON assessment.id = NEW.assessment_id
      JOIN trust.monthly_reputation_sources source ON source.id = assessment.source_id
      WHERE snapshot.id = NEW.snapshot_id AND snapshot.subject_user_id = NEW.subject_user_id AND snapshot.mode = NEW.mode
        AND snapshot.source_month = source.source_month
        AND snapshot.id = (SELECT id FROM trust.monthly_reward_snapshots
          WHERE subject_user_id = NEW.subject_user_id AND source_month = source.source_month AND mode = NEW.mode ORDER BY revision DESC LIMIT 1)
        AND ((NEW.state = 'correction_approval_pending' AND snapshot.assessment_id <> NEW.assessment_id
          AND snapshot.rules_version = NEW.rules_version)
          OR (NEW.state = 'snapshot_policy_requires_review' AND snapshot.rules_version <> NEW.rules_version)))
    OR NEW.state = 'before_cutover' AND (NEW.snapshot_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM trust.monthly_reputation_assessments assessment
      JOIN trust.monthly_reputation_sources source ON source.id = assessment.source_id
      JOIN trust.monthly_reward_snapshot_rule_sets rules ON rules.version = NEW.rules_version
      WHERE assessment.id = NEW.assessment_id AND source.source_month < rules.first_source_month))
    OR NEW.state = 'superseded' AND (NEW.snapshot_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM trust.monthly_reputation_assessments assessment
      JOIN trust.monthly_reputation_sources source ON source.id = assessment.source_id
      WHERE assessment.id = NEW.assessment_id AND (source.id IS DISTINCT FROM (
        SELECT id FROM trust.monthly_reputation_sources WHERE subject_user_id = NEW.subject_user_id
          AND source_month = source.source_month AND policy_version = source.policy_version ORDER BY revision DESC LIMIT 1)
        OR EXISTS (SELECT 1 FROM trust.monthly_reward_snapshot_corrections correction WHERE correction.source_event_id = NEW.event_id
          AND correction.snapshot_id IS DISTINCT FROM (SELECT id FROM trust.monthly_reward_snapshots
            WHERE subject_user_id = NEW.subject_user_id AND source_month = source.source_month AND mode = NEW.mode
            ORDER BY revision DESC LIMIT 1)))))
    THEN RAISE EXCEPTION 'monthly_reward_receipt_state_invalid' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.require_monthly_reward_snapshot_receipt() FROM PUBLIC;
CREATE TRIGGER monthly_reward_snapshot_receipt_subject_guard BEFORE INSERT ON trust.monthly_reward_snapshot_receipts
  FOR EACH ROW EXECUTE FUNCTION trust.require_monthly_reward_snapshot_receipt();

CREATE FUNCTION trust.preserve_monthly_reward_snapshot_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  IF TG_OP = 'UPDATE' AND NEW.flag_key = OLD.flag_key AND NEW.policy_version = OLD.policy_version THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM trust.monthly_reward_snapshot_rule_sets WHERE approved_by IS NOT NULL)
    OR EXISTS (SELECT 1 FROM trust.monthly_reward_snapshots) THEN
    RAISE EXCEPTION 'monthly_reward_snapshot_flag_requires_privacy_teardown' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
REVOKE ALL ON FUNCTION trust.preserve_monthly_reward_snapshot_flag() FROM PUBLIC;
CREATE TRIGGER monthly_reward_snapshot_flag_preserved BEFORE DELETE OR UPDATE OF flag_key,policy_version ON system.feature_flags
  FOR EACH ROW WHEN (OLD.flag_key = 'trust.monthly_reward_snapshots'
    AND OLD.policy_version = 'lythaus-monthly-rewards-2026-10-v1') EXECUTE FUNCTION trust.preserve_monthly_reward_snapshot_flag();

CREATE FUNCTION trust.erase_monthly_reward_snapshot_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  PERFORM 1 FROM system.feature_flags WHERE flag_key = 'trust.monthly_reward_snapshots'
    AND policy_version = 'lythaus-monthly-rewards-2026-10-v1' FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  DELETE FROM trust.monthly_reward_snapshot_receipts WHERE subject_user_id = NEW.id;
  DELETE FROM system.consumer_inbox WHERE event_id IN (SELECT source_event_id FROM trust.monthly_reward_snapshot_corrections
    WHERE subject_user_id = NEW.id) OR event_id IN (SELECT id FROM system.outbox_events WHERE actor_id = NEW.id
      AND event_type = 'trust.monthly_reward_snapshot.recorded');
  DELETE FROM system.outbox_events WHERE id IN (SELECT source_event_id FROM trust.monthly_reward_snapshot_corrections
    WHERE subject_user_id = NEW.id) OR (actor_id = NEW.id AND event_type = 'trust.monthly_reward_snapshot.recorded');
  DELETE FROM trust.monthly_reward_snapshots WHERE subject_user_id = NEW.id AND correction_id IS NOT NULL;
  DELETE FROM trust.monthly_reward_snapshot_corrections WHERE subject_user_id = NEW.id;
  DELETE FROM trust.monthly_reward_snapshots WHERE subject_user_id = NEW.id;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION trust.erase_monthly_reward_snapshot_subject() FROM PUBLIC;
CREATE TRIGGER monthly_reputation_reward_snapshot_subject_erasure BEFORE UPDATE OF status,deleted_at ON identity.users
  FOR EACH ROW WHEN (NEW.status = 'deleted' OR NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION trust.erase_monthly_reward_snapshot_subject();

GRANT SELECT ON trust.monthly_reward_snapshot_rule_sets,trust.monthly_reward_snapshots TO lythaus_runtime;
GRANT SELECT ON trust.monthly_reputation_sources TO lythaus_runtime;
GRANT SELECT,INSERT ON trust.monthly_reward_snapshots,trust.monthly_reward_snapshot_receipts TO lythaus_jobs;
GRANT SELECT ON trust.monthly_reward_snapshot_rule_sets,trust.monthly_reward_snapshot_corrections TO lythaus_jobs;
GRANT SELECT ON trust.monthly_reward_snapshot_rule_sets,trust.monthly_reward_snapshots,
  trust.monthly_reputation_assessments,trust.monthly_reputation_sources,trust.monthly_reputation_assemblies,
  trust.monthly_maintenance_rule_sets TO lythaus_admin;
GRANT SELECT,INSERT ON trust.monthly_reward_snapshot_corrections TO lythaus_admin;
GRANT SELECT,DELETE ON trust.monthly_reward_snapshot_rule_sets,trust.monthly_reward_snapshots,
  trust.monthly_reward_snapshot_corrections,trust.monthly_reward_snapshot_receipts TO lythaus_privacy;
GRANT SELECT ON system.feature_flags TO lythaus_admin,lythaus_runtime;
