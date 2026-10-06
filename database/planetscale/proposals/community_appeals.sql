CREATE TABLE moderation.community_appeal_rule_sets (
  version text PRIMARY KEY,
  policy_version text NOT NULL CHECK (policy_version = 'lythaus-monthly-rewards-2026-10-v1'),
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  ballot_changes_allowed boolean NOT NULL,
  approved_by uuid REFERENCES identity.users(id),
  approved_at timestamptz,
  approval_reference text,
  CHECK (configuration @> jsonb_build_object('version', version, 'status', 'pending_owner_approval')),
  CHECK ((approved_by IS NULL AND approved_at IS NULL AND approval_reference IS NULL)
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND length(approval_reference) BETWEEN 1 AND 500))
);

CREATE TABLE moderation.community_appeal_sessions (
  appeal_id uuid PRIMARY KEY REFERENCES moderation.appeals(id) ON DELETE CASCADE,
  rules_version text NOT NULL REFERENCES moderation.community_appeal_rule_sets(version),
  challenged_decision_id uuid NOT NULL UNIQUE REFERENCES moderation.decisions(id),
  source_event_id uuid NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('post', 'comment')),
  content_id uuid NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[0-9a-f]{64}$'),
  review_class text NOT NULL DEFAULT 'untriaged' CHECK (review_class IN ('untriaged', 'standard', 'restricted')),
  state text NOT NULL DEFAULT 'submitted' CHECK (state IN ('submitted', 'triaged', 'open', 'closing', 'extended',
    'resolved_allow', 'resolved_retain', 'unresolved', 'restricted_review', 'withdrawn')),
  safe_preview text,
  rule_context text,
  triaged_by uuid REFERENCES identity.users(id),
  opens_at timestamptz,
  closes_at timestamptz,
  extensions integer NOT NULL DEFAULT 0 CHECK (extensions >= 0),
  resolved_at timestamptz,
  CHECK ((opens_at IS NULL AND closes_at IS NULL) OR closes_at > opens_at),
  CHECK (review_class <> 'standard' OR (safe_preview IS NOT NULL AND rule_context IS NOT NULL AND opens_at IS NOT NULL))
);
CREATE INDEX community_appeal_due_idx ON moderation.community_appeal_sessions(closes_at)
  WHERE state IN ('open', 'extended');

CREATE TABLE moderation.community_appeal_evidence (
  appeal_id uuid PRIMARY KEY REFERENCES moderation.community_appeal_sessions(appeal_id) ON DELETE CASCADE,
  frozen_content jsonb NOT NULL,
  classifier_evidence jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE moderation.community_appeal_ballots (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  appeal_id uuid NOT NULL REFERENCES moderation.community_appeal_sessions(appeal_id) ON DELETE CASCADE,
  voter_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  UNIQUE (appeal_id, voter_user_id)
);
CREATE TABLE moderation.community_appeal_ballot_revisions (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  ballot_id uuid NOT NULL REFERENCES moderation.community_appeal_ballots(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  weight integer NOT NULL CHECK (weight = 1),
  choice text NOT NULL CHECK (choice IN ('allow', 'retain', 'recuse', 'cannot_assess')),
  reason_code text NOT NULL CHECK (reason_code IN ('rule_misapplied', 'rule_applies', 'insufficient_context', 'conflict')),
  context_acknowledged boolean NOT NULL CHECK (context_acknowledged),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  cast_at timestamptz NOT NULL,
  UNIQUE (ballot_id, revision),
  UNIQUE (ballot_id, idempotency_key)
);

CREATE TABLE moderation.community_voting_restrictions (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  subject_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  appeal_id uuid REFERENCES moderation.community_appeal_sessions(appeal_id) ON DELETE CASCADE,
  reason_code text NOT NULL CHECK (reason_code IN ('established_controlled_duplicate', 'actual_conflict', 'confirmed_manipulation')),
  evidence_reference text NOT NULL CHECK (length(evidence_reference) BETWEEN 1 AND 500),
  imposed_by uuid NOT NULL REFERENCES identity.users(id),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > starts_at),
  CHECK (imposed_by <> subject_user_id)
);

CREATE TABLE moderation.community_appeal_outcomes (
  appeal_id uuid PRIMARY KEY REFERENCES moderation.community_appeal_sessions(appeal_id) ON DELETE CASCADE,
  result jsonb NOT NULL,
  restoration text NOT NULL CHECK (restoration IN ('not_applicable', 'restored', 'content_changed_or_deleted', 'independent_hold', 'publication_rule_hold')),
  recorded_at timestamptz NOT NULL
);
CREATE TABLE moderation.community_appeal_valid_participation (
  ballot_id uuid PRIMARY KEY REFERENCES moderation.community_appeal_ballots(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES moderation.community_appeal_ballot_revisions(id),
  performed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL
);
CREATE TABLE moderation.community_appeal_overrides (
  appeal_id uuid PRIMARY KEY REFERENCES moderation.community_appeal_sessions(appeal_id) ON DELETE CASCADE,
  decision_id uuid NOT NULL UNIQUE REFERENCES moderation.decisions(id),
  content_type text NOT NULL,
  content_id uuid NOT NULL,
  source_event_id uuid NOT NULL,
  content_hash text NOT NULL,
  evidence_hash text NOT NULL,
  recorded_at timestamptz NOT NULL
);
CREATE TABLE moderation.community_appeal_events (
  id uuid PRIMARY KEY CHECK (substring(id::text, 15, 1) = '7'),
  appeal_id uuid NOT NULL REFERENCES moderation.community_appeal_sessions(appeal_id) ON DELETE CASCADE,
  actor_id uuid REFERENCES identity.users(id),
  event_type text NOT NULL,
  detail jsonb NOT NULL,
  recorded_at timestamptz NOT NULL
);

CREATE FUNCTION moderation.reject_community_appeal_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'community_appeal_history_is_immutable' USING ERRCODE = '55000';
END;
$$;
CREATE FUNCTION moderation.freeze_community_appeal_packet() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.appeal_id, NEW.rules_version, NEW.challenged_decision_id, NEW.source_event_id, NEW.content_type,
      NEW.content_id, NEW.content_hash, NEW.evidence_hash) IS DISTINCT FROM
    ROW(OLD.appeal_id, OLD.rules_version, OLD.challenged_decision_id, OLD.source_event_id, OLD.content_type,
      OLD.content_id, OLD.content_hash, OLD.evidence_hash)
    OR (OLD.state <> 'submitted' AND ROW(NEW.review_class, NEW.safe_preview, NEW.rule_context, NEW.triaged_by)
      IS DISTINCT FROM ROW(OLD.review_class, OLD.safe_preview, OLD.rule_context, OLD.triaged_by)) THEN
    RAISE EXCEPTION 'community_appeal_packet_is_frozen' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER community_appeal_packet_frozen BEFORE UPDATE ON moderation.community_appeal_sessions
  FOR EACH ROW EXECUTE FUNCTION moderation.freeze_community_appeal_packet();
DO $$ DECLARE relation_name text; BEGIN
  FOREACH relation_name IN ARRAY ARRAY['community_appeal_rule_sets', 'community_appeal_evidence', 'community_appeal_ballots',
    'community_appeal_ballot_revisions', 'community_voting_restrictions', 'community_appeal_outcomes',
    'community_appeal_valid_participation', 'community_appeal_overrides', 'community_appeal_events'] LOOP
    EXECUTE format('CREATE TRIGGER community_appeal_immutable BEFORE UPDATE ON moderation.%I FOR EACH ROW EXECUTE FUNCTION moderation.reject_community_appeal_update()', relation_name);
  END LOOP;
END $$;

GRANT SELECT ON moderation.community_appeal_rule_sets, moderation.community_voting_restrictions,
  moderation.community_appeal_outcomes, moderation.community_appeal_overrides, system.feature_flags
  TO lythaus_runtime, lythaus_admin, lythaus_jobs;
GRANT SELECT, INSERT ON moderation.community_appeal_sessions, moderation.community_appeal_ballots,
  moderation.community_appeal_ballot_revisions, moderation.community_appeal_events TO lythaus_runtime;
GRANT UPDATE (state) ON moderation.community_appeal_sessions TO lythaus_runtime;
GRANT UPDATE (state) ON moderation.appeals TO lythaus_runtime;
GRANT INSERT ON moderation.community_appeal_evidence TO lythaus_runtime;
GRANT SELECT ON moderation.decisions, moderation.detector_runs TO lythaus_runtime;
GRANT SELECT, UPDATE ON moderation.community_appeal_sessions TO lythaus_admin, lythaus_jobs;
GRANT SELECT ON moderation.community_appeal_evidence TO lythaus_admin;
GRANT SELECT, INSERT ON moderation.community_appeal_events, moderation.community_voting_restrictions TO lythaus_admin;
GRANT SELECT ON moderation.community_appeal_ballots, moderation.community_appeal_ballot_revisions TO lythaus_jobs;
GRANT SELECT, INSERT ON moderation.community_appeal_outcomes, moderation.community_appeal_valid_participation,
  moderation.community_appeal_overrides, moderation.community_appeal_events TO lythaus_jobs;
GRANT SELECT, DELETE ON moderation.community_appeal_sessions, moderation.community_appeal_evidence,
  moderation.community_appeal_ballots, moderation.community_appeal_ballot_revisions, moderation.community_voting_restrictions,
  moderation.community_appeal_outcomes, moderation.community_appeal_valid_participation,
  moderation.community_appeal_overrides, moderation.community_appeal_events TO lythaus_privacy;
