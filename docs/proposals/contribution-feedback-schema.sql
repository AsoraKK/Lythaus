-- Candidate only. This file is not an approved production migration.
-- No legacy social.reactions records are copied or reinterpreted.
CREATE TABLE social.contribution_feedback (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  post_id uuid REFERENCES content.posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES content.comments(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('quality', 'emotion')),
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL)::integer + (comment_id IS NOT NULL)::integer = 1),
  CHECK ((channel = 'quality' AND value IN ('like', 'dislike')) OR
         (channel = 'emotion' AND value IN ('amused', 'sad', 'angry', 'surprised', 'appreciative')))
);

CREATE UNIQUE INDEX contribution_feedback_post_actor_channel_idx
  ON social.contribution_feedback (actor_id, post_id, channel) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX contribution_feedback_comment_actor_channel_idx
  ON social.contribution_feedback (actor_id, comment_id, channel) WHERE comment_id IS NOT NULL;
CREATE INDEX contribution_feedback_post_counts_idx
  ON social.contribution_feedback (post_id, channel, value) WHERE post_id IS NOT NULL;
CREATE INDEX contribution_feedback_comment_counts_idx
  ON social.contribution_feedback (comment_id, channel, value) WHERE comment_id IS NOT NULL;

-- Grants are proposed explicitly; production roles and lifecycle need review.
GRANT SELECT, INSERT, UPDATE, DELETE ON social.contribution_feedback TO lythaus_runtime;
GRANT SELECT, DELETE ON social.contribution_feedback TO lythaus_jobs;

ALTER FUNCTION privacy.reconcile_subject_data_locations(uuid)
  RENAME TO reconcile_subject_data_locations_pre_contribution_feedback;
CREATE FUNCTION privacy.reconcile_subject_data_locations(p_subject_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, privacy, social AS $$
BEGIN
  PERFORM privacy.reconcile_subject_data_locations_pre_contribution_feedback(p_subject_id);
  INSERT INTO privacy.subject_data_locations
    (subject_id, store_type, resource_reference, entity_type, entity_id, authoritative_or_derived, retention_class)
  SELECT p_subject_id, 'planetscale', 'social.contribution_feedback', 'contribution_feedback', f.id, 'authoritative', 'social'
    FROM social.contribution_feedback f WHERE f.actor_id = p_subject_id
  ON CONFLICT DO NOTHING;
  RETURN (SELECT count(*)::integer FROM privacy.subject_data_locations WHERE subject_id = p_subject_id);
END $$;
REVOKE ALL ON FUNCTION privacy.reconcile_subject_data_locations_pre_contribution_feedback(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION privacy.reconcile_subject_data_locations_pre_contribution_feedback(uuid) FROM lythaus_privacy;
REVOKE ALL ON FUNCTION privacy.reconcile_subject_data_locations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION privacy.reconcile_subject_data_locations(uuid) TO lythaus_privacy;
