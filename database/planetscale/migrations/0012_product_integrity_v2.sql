CREATE TABLE trust.user_activity_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users(id),
  actor_user_id uuid REFERENCES identity.users(id),
  event_type text NOT NULL,
  category text NOT NULL CHECK (category IN ('account', 'content', 'social', 'reputation', 'moderation', 'appeals', 'privacy', 'rewards')),
  source text NOT NULL CHECK (source IN ('public_api', 'admin_api', 'jobs', 'workflow', 'system')),
  source_event_id uuid NOT NULL,
  correlation_id text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  explanation text NOT NULL CHECK (length(explanation) BETWEEN 1 AND 1000),
  result text NOT NULL CHECK (result IN ('succeeded', 'failed', 'withheld', 'reversed', 'pending')),
  reason_code text,
  policy_version text NOT NULL,
  object_type text,
  object_id uuid,
  reputation_effect text NOT NULL CHECK (reputation_effect IN ('none', 'positive', 'negative', 'reversed', 'withheld')),
  appealable boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 4096)
    CHECK (NOT metadata ?| ARRAY['authorization', 'cookie', 'credential', 'email', 'password', 'requestBody', 'secret', 'token']),
  retention_class text NOT NULL CHECK (retention_class IN ('ordinary', 'security', 'moderation')),
  retention_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, source_event_id, event_type)
);

CREATE INDEX user_activity_owner_cursor_idx
  ON trust.user_activity_events (user_id, created_at DESC, id DESC);
CREATE INDEX user_activity_retention_idx
  ON trust.user_activity_events (retention_until)
  WHERE retention_until IS NOT NULL;

ALTER TABLE trust.reputation_events
  ADD COLUMN pillar text,
  ADD COLUMN impact numeric,
  ADD COLUMN source_event_id uuid,
  ADD COLUMN moderation_decision_id uuid,
  ADD COLUMN appeal_id uuid,
  ADD COLUMN status text NOT NULL DEFAULT 'effective',
  ADD COLUMN effective_at timestamptz,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN explanation_code text,
  ADD COLUMN visibility text NOT NULL DEFAULT 'private';

UPDATE trust.reputation_events
   SET impact = points_delta,
       effective_at = created_at
 WHERE impact IS NULL OR effective_at IS NULL;

ALTER TABLE trust.reputation_events
  ALTER COLUMN impact SET NOT NULL,
  ALTER COLUMN effective_at SET NOT NULL,
  ALTER COLUMN effective_at SET DEFAULT now(),
  ADD CONSTRAINT reputation_events_pillar_check
    CHECK (pillar IS NULL OR pillar IN ('accountability', 'contribution', 'conduct', 'sourcing', 'authenticity', 'reviewReliability')),
  ADD CONSTRAINT reputation_events_status_check
    CHECK (status IN ('effective', 'withheld', 'reversed', 'expired')),
  ADD CONSTRAINT reputation_events_visibility_check
    CHECK (visibility IN ('private', 'public_minimal'));

CREATE UNIQUE INDEX reputation_events_source_once_idx
  ON trust.reputation_events (subject_user_id, source_event_id, event_type)
  WHERE source_event_id IS NOT NULL;

WITH ranked_accountability_signals AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, signal_type
           ORDER BY created_at DESC, id DESC
         ) AS signal_rank
    FROM trust.accountability_signals
)
DELETE FROM trust.accountability_signals signal
 USING ranked_accountability_signals ranked
 WHERE signal.id = ranked.id
   AND ranked.signal_rank > 1;

CREATE UNIQUE INDEX accountability_signals_user_type_idx
  ON trust.accountability_signals (user_id, signal_type);

CREATE TABLE trust.reputation_profiles (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id),
  policy_version text NOT NULL,
  current_level smallint NOT NULL DEFAULT 0 CHECK (current_level BETWEEN 0 AND 5),
  total_score numeric NOT NULL DEFAULT 0,
  accountability_score numeric NOT NULL DEFAULT 0 CHECK (accountability_score BETWEEN 0 AND 100),
  contribution_score numeric NOT NULL DEFAULT 0 CHECK (contribution_score BETWEEN 0 AND 100),
  conduct_score numeric NOT NULL DEFAULT 0 CHECK (conduct_score BETWEEN 0 AND 100),
  sourcing_score numeric NOT NULL DEFAULT 0 CHECK (sourcing_score BETWEEN 0 AND 100),
  authenticity_score numeric NOT NULL DEFAULT 0 CHECK (authenticity_score BETWEEN 0 AND 100),
  review_reliability_score numeric NOT NULL DEFAULT 0 CHECK (review_reliability_score BETWEEN 0 AND 100),
  active_days integer NOT NULL DEFAULT 0 CHECK (active_days >= 0),
  active_weeks integer NOT NULL DEFAULT 0 CHECK (active_weeks >= 0),
  qualifying_human_contributions integer NOT NULL DEFAULT 0 CHECK (qualifying_human_contributions >= 0),
  promotion_blockers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(promotion_blockers) = 'array'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'restricted', 'suspended', 'under_investigation')),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reputation_profiles_level_idx
  ON trust.reputation_profiles (current_level, evaluated_at DESC);

CREATE TABLE moderation.reviewer_qualifications (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id),
  state text NOT NULL CHECK (state IN ('none', 'eligible', 'trained', 'suspended')),
  policy_version text NOT NULL,
  trained_at timestamptz,
  suspended_at timestamptz,
  reason_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state <> 'trained' OR trained_at IS NOT NULL),
  CHECK (state <> 'suspended' OR suspended_at IS NOT NULL)
);

CREATE TABLE moderation.appeal_assignments (
  id uuid PRIMARY KEY,
  appeal_id uuid NOT NULL REFERENCES moderation.appeals(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES identity.users(id),
  assignment_ordinal smallint NOT NULL CHECK (assignment_ordinal BETWEEN 1 AND 5),
  level_snapshot smallint NOT NULL CHECK (level_snapshot BETWEEN 0 AND 5),
  qualification_snapshot text NOT NULL CHECK (qualification_snapshot = 'trained'),
  vote_weight_snapshot smallint NOT NULL CHECK (vote_weight_snapshot IN (1, 2)),
  state text NOT NULL DEFAULT 'assigned' CHECK (state IN ('assigned', 'recused', 'voted', 'replaced', 'expired')),
  random_rank_hash text NOT NULL CHECK (random_rank_hash ~ '^[0-9a-f]{64}$'),
  conflict_checked boolean NOT NULL DEFAULT false,
  policy_version text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  recused_at timestamptz,
  UNIQUE (appeal_id, reviewer_id),
  UNIQUE (id, appeal_id, reviewer_id),
  CHECK (vote_weight_snapshot = 1 OR level_snapshot = 5)
);

CREATE UNIQUE INDEX appeal_assignments_active_ordinal_idx
  ON moderation.appeal_assignments (appeal_id, assignment_ordinal)
  WHERE state IN ('assigned', 'voted');
CREATE UNIQUE INDEX appeal_assignments_level5_weight_cap_idx
  ON moderation.appeal_assignments (appeal_id)
  WHERE vote_weight_snapshot = 2 AND state IN ('assigned', 'voted');
CREATE INDEX appeal_assignments_reviewer_idx
  ON moderation.appeal_assignments (reviewer_id, assigned_at DESC);

CREATE TABLE moderation.appeal_review_votes (
  id uuid PRIMARY KEY,
  assignment_id uuid NOT NULL UNIQUE REFERENCES moderation.appeal_assignments(id),
  appeal_id uuid NOT NULL REFERENCES moderation.appeals(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES identity.users(id),
  decision text NOT NULL CHECK (decision IN ('overturn', 'uphold')),
  level_snapshot smallint NOT NULL CHECK (level_snapshot BETWEEN 0 AND 5),
  qualification_snapshot text NOT NULL CHECK (qualification_snapshot = 'trained'),
  vote_weight_snapshot smallint NOT NULL CHECK (vote_weight_snapshot IN (1, 2)),
  idempotency_key text NOT NULL,
  policy_version text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appeal_id, reviewer_id),
  UNIQUE (reviewer_id, idempotency_key),
  FOREIGN KEY (assignment_id, appeal_id, reviewer_id)
    REFERENCES moderation.appeal_assignments (id, appeal_id, reviewer_id),
  CHECK (vote_weight_snapshot = 1 OR level_snapshot = 5)
);

CREATE INDEX appeal_review_votes_appeal_idx
  ON moderation.appeal_review_votes (appeal_id, locked_at);

CREATE TABLE moderation.appeal_adjudications (
  id uuid PRIMARY KEY,
  appeal_id uuid NOT NULL REFERENCES moderation.appeals(id) ON DELETE CASCADE,
  adjudicator_id uuid NOT NULL REFERENCES identity.users(id),
  adjudicator_role text NOT NULL CHECK (adjudicator_role IN ('editorial', 'journalist')),
  trained_snapshot boolean NOT NULL CHECK (trained_snapshot),
  decision text NOT NULL CHECK (decision IN ('overturn', 'uphold')),
  reason_code text NOT NULL,
  policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appeal_id, adjudicator_id)
);

CREATE TABLE moderation.appeal_outcomes (
  appeal_id uuid PRIMARY KEY REFERENCES moderation.appeals(id) ON DELETE CASCADE,
  risk_class text NOT NULL CHECK (risk_class IN ('standard', 'high')),
  reviewer_panel_decision text CHECK (reviewer_panel_decision IN ('overturn', 'uphold')),
  final_decision text CHECK (final_decision IN ('overturn', 'uphold')),
  completed_reviewers smallint NOT NULL DEFAULT 0 CHECK (completed_reviewers BETWEEN 0 AND 5),
  total_weight smallint NOT NULL DEFAULT 0 CHECK (total_weight BETWEEN 0 AND 6),
  overturn_weight smallint NOT NULL DEFAULT 0 CHECK (overturn_weight BETWEEN 0 AND 6),
  uphold_weight smallint NOT NULL DEFAULT 0 CHECK (uphold_weight BETWEEN 0 AND 6),
  winning_share numeric NOT NULL DEFAULT 0 CHECK (winning_share BETWEEN 0 AND 1),
  required_adjudicators smallint NOT NULL CHECK (required_adjudicators IN (1, 2)),
  state text NOT NULL CHECK (state IN ('pending_quorum', 'no_consensus', 'pending_adjudication', 'adjudication_disagreement', 'resolved')),
  policy_version text NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (state <> 'resolved' OR (final_decision IS NOT NULL AND resolved_at IS NOT NULL)),
  CHECK (overturn_weight + uphold_weight = total_weight)
);

CREATE TABLE moderation.appeal_outcome_effects (
  id uuid PRIMARY KEY,
  appeal_id uuid NOT NULL REFERENCES moderation.appeals(id) ON DELETE CASCADE,
  effect_type text NOT NULL CHECK (effect_type IN ('content_reversal', 'account_reversal', 'reputation_reversal', 'notification', 'activity_event')),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  source_event_id uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appeal_id, effect_type, target_type, target_id)
);

ALTER TABLE moderation.appeals
  ADD COLUMN risk_class text NOT NULL DEFAULT 'standard' CHECK (risk_class IN ('standard', 'high')),
  ADD COLUMN policy_version text NOT NULL DEFAULT 'appeals-v1.0.0',
  ADD COLUMN statement text CHECK (statement IS NULL OR length(statement) BETWEEN 1 AND 2000),
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN reviewer_panel_result_at timestamptz,
  ADD COLUMN adjudicated_at timestamptz;

CREATE UNIQUE INDEX appeals_one_open_case_appellant_idx
  ON moderation.appeals (case_id, appellant_id)
  WHERE state = 'open';

ALTER TABLE content.posts
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN moderation_source_event_id uuid;

ALTER TABLE moderation.detector_runs
  ADD COLUMN source_event_id uuid;

ALTER TABLE trust.provenance_events
  ADD COLUMN source_event_id uuid;

ALTER TABLE moderation.cases
  ADD COLUMN source_event_id uuid;

CREATE UNIQUE INDEX detector_runs_provider_source_event_idx
  ON moderation.detector_runs (provider, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE INDEX provenance_events_content_source_event_idx
  ON trust.provenance_events (content_id, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE UNIQUE INDEX moderation_cases_content_source_event_idx
  ON moderation.cases (content_type, content_id, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE UNIQUE INDEX posts_moderation_source_event_idx
  ON content.posts (moderation_source_event_id)
  WHERE moderation_source_event_id IS NOT NULL;

ALTER TABLE social.profiles
  ADD COLUMN moderation_source_event_id uuid,
  ADD COLUMN moderation_state text NOT NULL DEFAULT 'allowed'
    CHECK (moderation_state IN ('under_review', 'allowed', 'blocked'));

CREATE UNIQUE INDEX profiles_moderation_source_event_idx
  ON social.profiles (moderation_source_event_id)
  WHERE moderation_source_event_id IS NOT NULL;

ALTER TABLE content.comments
  ADD COLUMN declared_creation_mode text NOT NULL DEFAULT 'unknown'
    CHECK (declared_creation_mode IN ('human', 'ai_assisted', 'unknown')),
  ADD COLUMN moderation_source_event_id uuid,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN depth smallint NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 1);

UPDATE content.comments
   SET depth = 1
 WHERE parent_id IS NOT NULL;

UPDATE content.comments
   SET moderation_state = 'under_review'
 WHERE declared_creation_mode = 'unknown';

ALTER TABLE content.comments
  ALTER COLUMN declared_creation_mode DROP DEFAULT;

UPDATE moderation.cases
   SET source_event_id = id
 WHERE source_event_id IS NULL;

WITH ranked_open_cases AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY content_type, content_id
           ORDER BY created_at DESC, id DESC
         ) AS revision_rank
    FROM moderation.cases
   WHERE state = 'open'
)
UPDATE moderation.cases moderation_case
   SET state = 'superseded',
       resolved_at = COALESCE(moderation_case.resolved_at, now())
  FROM ranked_open_cases ranked
 WHERE moderation_case.id = ranked.id
   AND ranked.revision_rank > 1;

ALTER TABLE moderation.cases
  ALTER COLUMN source_event_id SET NOT NULL,
  ADD CONSTRAINT moderation_cases_state_check
    CHECK (state IN ('open', 'resolved', 'superseded'));

CREATE UNIQUE INDEX moderation_cases_one_open_content_idx
  ON moderation.cases (content_type, content_id)
  WHERE state = 'open';

WITH current_cases AS (
  SELECT content_type, content_id, source_event_id
    FROM moderation.cases
   WHERE state = 'open'
)
UPDATE content.posts post
   SET moderation_source_event_id = current_case.source_event_id
  FROM current_cases current_case
 WHERE current_case.content_type = 'post'
   AND current_case.content_id = post.id;

WITH current_cases AS (
  SELECT content_type, content_id, source_event_id
    FROM moderation.cases
   WHERE state = 'open'
)
UPDATE content.comments comment
   SET moderation_source_event_id = current_case.source_event_id
  FROM current_cases current_case
 WHERE current_case.content_type = 'comment'
   AND current_case.content_id = comment.id;

WITH current_cases AS (
  SELECT content_type, content_id, source_event_id
    FROM moderation.cases
   WHERE state = 'open'
)
UPDATE social.profiles profile
   SET moderation_source_event_id = current_case.source_event_id,
       moderation_state = 'under_review'
  FROM current_cases current_case
 WHERE current_case.content_type = 'profile'
   AND current_case.content_id = profile.user_id;

CREATE INDEX comments_visible_cursor_idx
  ON content.comments (post_id, moderation_state, created_at, id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX comments_moderation_source_event_idx
  ON content.comments (moderation_source_event_id)
  WHERE moderation_source_event_id IS NOT NULL;

CREATE INDEX posts_visible_cursor_idx
  ON content.posts (moderation_state, visibility, published_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX custom_feed_rules_feed_idx
  ON social.custom_feed_rules (feed_id);

CREATE INDEX editorial_publications_cursor_idx
  ON editorial.publications (published_at DESC, id DESC)
  WHERE published_at IS NOT NULL;

CREATE INDEX user_inbox_cursor_idx
  ON feed.user_inbox (user_id, created_at DESC, post_id DESC);

WITH legacy_ai_generated_posts AS (
  SELECT post.id
    FROM content.posts post
   WHERE post.declared_creation_mode = 'ai_generated'
  UNION
  SELECT declaration.post_id
    FROM content.content_declarations declaration
   WHERE declaration.public_label = 'AI-generated'
      OR (
        declaration.public_label IS NOT NULL
        AND declaration.public_label NOT IN ('Human-authored', 'AI-assisted', 'Under review')
      )
  UNION
  SELECT moderation_case.content_id
    FROM moderation.decisions decision
    JOIN moderation.cases moderation_case ON moderation_case.id = decision.case_id
   WHERE (
       decision.public_label = 'AI-generated'
       OR (
         decision.public_label IS NOT NULL
         AND decision.public_label NOT IN ('Human-authored', 'AI-assisted', 'Under review')
       )
     )
     AND moderation_case.content_type = 'post'
)
UPDATE content.posts post
   SET visibility = 'private',
       moderation_state = 'under_review',
       published_at = NULL,
       updated_at = now()
 WHERE post.id IN (SELECT id FROM legacy_ai_generated_posts);

UPDATE content.content_declarations
   SET public_label = 'Under review',
       review_required = true,
       updated_at = now()
 WHERE public_label = 'AI-generated'
    OR declared_creation_mode = 'ai_generated'
    OR (
      public_label IS NOT NULL
      AND public_label NOT IN ('Human-authored', 'AI-assisted', 'Under review')
    );

UPDATE moderation.decisions
   SET public_label = 'Under review'
 WHERE public_label IS NOT NULL
   AND public_label NOT IN ('Human-authored', 'AI-assisted', 'Under review');

ALTER TABLE content.content_declarations
  DROP CONSTRAINT IF EXISTS content_declarations_public_label_check;
ALTER TABLE content.content_declarations
  ADD CONSTRAINT content_declarations_public_label_check
  CHECK (public_label IS NULL OR public_label IN ('Human-authored', 'AI-assisted', 'Under review'));

ALTER TABLE content.content_declarations
  ADD CONSTRAINT content_declarations_generated_private_check
  CHECK (
    declared_creation_mode <> 'ai_generated'
    OR (public_label IS NULL OR public_label = 'Under review') AND review_required
  );

ALTER TABLE moderation.decisions
  ADD CONSTRAINT moderation_decisions_public_label_check
  CHECK (public_label IS NULL OR public_label IN ('Human-authored', 'AI-assisted', 'Under review'));

ALTER TABLE content.posts
  ADD CONSTRAINT posts_generated_private_check
  CHECK (
    declared_creation_mode <> 'ai_generated'
    OR (
      visibility = 'private'
      AND moderation_state <> 'allowed'
      AND published_at IS NULL
    )
  );

WITH ranked_reactions AS (
  SELECT user_id, post_id, reaction_type,
         row_number() OVER (
           PARTITION BY user_id, post_id
           ORDER BY created_at DESC, reaction_type
         ) AS reaction_rank
    FROM social.reactions
)
DELETE FROM social.reactions reaction
 USING ranked_reactions ranked
 WHERE reaction.user_id = ranked.user_id
   AND reaction.post_id = ranked.post_id
   AND reaction.reaction_type = ranked.reaction_type
   AND ranked.reaction_rank > 1;

CREATE UNIQUE INDEX reactions_one_current_idx
  ON social.reactions (user_id, post_id);

CREATE INDEX reactions_post_type_idx
  ON social.reactions (post_id, reaction_type);

ALTER TABLE social.reactions
  ADD CONSTRAINT reactions_type_check
  CHECK (reaction_type IN ('like', 'insightful', 'support')) NOT VALID;

ALTER TABLE feed.notifications
  ADD COLUMN source_event_id uuid,
  ADD COLUMN policy_version text,
  ADD COLUMN activity_event_id uuid REFERENCES trust.user_activity_events(id);

CREATE UNIQUE INDEX notifications_source_once_idx
  ON feed.notifications (recipient_id, notification_type, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE INDEX outbox_events_actor_cursor_idx
  ON system.outbox_events (actor_id, created_at DESC, id DESC)
  WHERE actor_id IS NOT NULL;

CREATE INDEX consumer_inbox_event_idx
  ON system.consumer_inbox (event_id);

CREATE INDEX idempotency_keys_actor_created_idx
  ON system.idempotency_keys (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

ALTER FUNCTION privacy.reconcile_subject_data_locations(uuid)
  RENAME TO reconcile_subject_data_locations_pre_integrity_v2;

CREATE FUNCTION privacy.reconcile_subject_data_locations(p_subject_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, privacy, trust, moderation
AS $$
BEGIN
  PERFORM privacy.reconcile_subject_data_locations_pre_integrity_v2(p_subject_id);

  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'trust.user_activity_events', 'user_activity_event', e.id, 'authoritative', e.retention_class
    FROM trust.user_activity_events e WHERE e.user_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'trust.reputation_profiles', 'reputation_profile', p.user_id, 'authoritative', 'trust'
    FROM trust.reputation_profiles p WHERE p.user_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'trust.accountability_signals', 'accountability_signal', signal.id, 'authoritative', 'trust'
    FROM trust.accountability_signals signal WHERE signal.user_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'identity.contact_emails', 'contact_email', email.user_id, 'authoritative', 'account'
    FROM identity.contact_emails email WHERE email.user_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'identity.user_entitlements', 'user_entitlement', entitlement.user_id, 'authoritative', 'account'
    FROM identity.user_entitlements entitlement WHERE entitlement.user_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'trust.reward_redemptions', 'reward_redemption', redemption.id, 'authoritative', 'rewards'
    FROM trust.reward_redemptions redemption WHERE redemption.user_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'identity.account_events', 'account_event', event.id, 'authoritative', 'security'
    FROM identity.account_events event WHERE event.user_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'system.audit_events', 'audit_event', audit.id, 'authoritative', 'security'
    FROM system.audit_events audit
   WHERE audit.actor_id = p_subject_id
      OR (audit.target_type = 'user' AND audit.target_id = p_subject_id)
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'system.outbox_events', 'outbox_event', event.id, 'authoritative', 'operational'
    FROM system.outbox_events event
   WHERE event.actor_id = p_subject_id
      OR jsonb_path_exists(
        event.payload,
        '$.** ? (@ == $subject)',
        jsonb_build_object('subject', p_subject_id::text)
      )
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'system.consumer_inbox', 'consumer_inbox_event', inbox.event_id, 'derived', 'operational'
    FROM system.consumer_inbox inbox
    LEFT JOIN system.outbox_events event ON event.id = inbox.event_id
   WHERE event.actor_id = p_subject_id
      OR jsonb_path_exists(
        inbox.payload,
        '$.** ? (@ == $subject)',
        jsonb_build_object('subject', p_subject_id::text)
      )
      OR jsonb_path_exists(
        event.payload,
        '$.** ? (@ == $subject)',
        jsonb_build_object('subject', p_subject_id::text)
      )
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT DISTINCT p_subject_id, 'planetscale', 'system.idempotency_keys', 'idempotency_record', p_subject_id, 'derived', 'operational'
    FROM system.idempotency_keys key
   WHERE key.actor_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'feed.notification_preferences', 'notification_preferences', preferences.user_id, 'authoritative', 'privacy'
    FROM feed.notification_preferences preferences WHERE preferences.user_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'feed.notification_devices', 'notification_device', device.id, 'authoritative', 'privacy'
    FROM feed.notification_devices device WHERE device.user_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'moderation.reviewer_qualifications', 'reviewer_qualification', q.user_id, 'authoritative', 'moderation'
    FROM moderation.reviewer_qualifications q WHERE q.user_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'moderation.appeal_assignments', 'appeal_assignment', a.id, 'authoritative', 'moderation'
    FROM moderation.appeal_assignments a WHERE a.reviewer_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'moderation.appeal_review_votes', 'appeal_review_vote', v.id, 'authoritative', 'moderation'
    FROM moderation.appeal_review_votes v WHERE v.reviewer_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'moderation.appeal_adjudications', 'appeal_adjudication', a.id, 'authoritative', 'moderation'
    FROM moderation.appeal_adjudications a WHERE a.adjudicator_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'moderation.appeal_outcomes', 'appeal_outcome', o.appeal_id, 'authoritative', 'moderation'
    FROM moderation.appeal_outcomes o
    JOIN moderation.appeals a ON a.id = o.appeal_id
   WHERE a.appellant_id = p_subject_id
  ON CONFLICT DO NOTHING;
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'moderation.appeal_outcome_effects', 'appeal_outcome_effect', effect.id, 'authoritative', 'moderation'
    FROM moderation.appeal_outcome_effects effect
    JOIN moderation.appeals a ON a.id = effect.appeal_id
   WHERE a.appellant_id = p_subject_id
  ON CONFLICT DO NOTHING;

  RETURN (SELECT count(*)::integer FROM privacy.subject_data_locations WHERE subject_id = p_subject_id);
END;
$$;

REVOKE ALL ON FUNCTION privacy.reconcile_subject_data_locations_pre_integrity_v2(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION privacy.reconcile_subject_data_locations(uuid) FROM PUBLIC;
