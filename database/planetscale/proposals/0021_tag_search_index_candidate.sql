-- CANDIDATE ONLY. This is not in the canonical migration manifest and must
-- not be applied to a hosted PlanetScale branch without an owner decision.
-- Token grammar and max_distinct_tags_per_post are proposed, unapproved policy.

CREATE TABLE IF NOT EXISTS feed.tag_search_index_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  policy_version text NOT NULL DEFAULT 'exact-token-proposal-v3',
  policy_approved boolean NOT NULL DEFAULT false,
  max_distinct_tags_per_post integer NOT NULL DEFAULT 16 CHECK (max_distinct_tags_per_post BETWEEN 1 AND 128),
  max_candidates_per_request integer NOT NULL DEFAULT 1000 CHECK (max_candidates_per_request BETWEEN 1 AND 5000),
  backfill_cursor uuid,
  backfill_post_count bigint NOT NULL DEFAULT 0 CHECK (backfill_post_count >= 0),
  backfill_restart_count smallint NOT NULL DEFAULT 0 CHECK (backfill_restart_count BETWEEN 0 AND 1),
  legacy_tag_limit_excluded_post_count bigint NOT NULL DEFAULT 0 CHECK (legacy_tag_limit_excluded_post_count >= 0),
  backfill_complete boolean NOT NULL DEFAULT false,
  reconciliation_cursor uuid,
  reconciliation_post_count bigint NOT NULL DEFAULT 0 CHECK (reconciliation_post_count >= 0),
  reconciliation_restart_count smallint NOT NULL DEFAULT 0 CHECK (reconciliation_restart_count BETWEEN 0 AND 1),
  reconciliation_mismatch_count bigint NOT NULL DEFAULT 0 CHECK (reconciliation_mismatch_count >= 0),
  incomplete_post_count bigint NOT NULL DEFAULT 0 CHECK (incomplete_post_count >= 0),
  reconciliation_complete boolean NOT NULL DEFAULT false,
  search_enabled boolean NOT NULL DEFAULT false,
  block_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT search_enabled OR (policy_approved AND backfill_complete AND reconciliation_complete))
);

ALTER TABLE feed.tag_search_index_control
  ADD COLUMN IF NOT EXISTS max_candidates_per_request integer NOT NULL DEFAULT 1000
    CHECK (max_candidates_per_request BETWEEN 1 AND 5000);
ALTER TABLE feed.tag_search_index_control
  ADD COLUMN IF NOT EXISTS backfill_restart_count smallint NOT NULL DEFAULT 0;
ALTER TABLE feed.tag_search_index_control
  ADD COLUMN IF NOT EXISTS legacy_tag_limit_excluded_post_count bigint NOT NULL DEFAULT 0;
ALTER TABLE feed.tag_search_index_control
  ADD COLUMN IF NOT EXISTS reconciliation_restart_count smallint NOT NULL DEFAULT 0;

INSERT INTO feed.tag_search_index_control(singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

UPDATE feed.tag_search_index_control
   SET policy_version = 'exact-token-proposal-v3',
       policy_approved = false,
       backfill_cursor = NULL, backfill_post_count = 0, backfill_restart_count = 0,
       legacy_tag_limit_excluded_post_count = 0, backfill_complete = false,
       reconciliation_cursor = NULL, reconciliation_post_count = 0, reconciliation_restart_count = 0,
       reconciliation_mismatch_count = 0, reconciliation_complete = false,
       incomplete_post_count = 0, search_enabled = false,
       block_reason = 'tag_search_policy_version_changed', updated_at = now()
 WHERE singleton = true AND policy_version IS DISTINCT FROM 'exact-token-proposal-v3';

CREATE TABLE IF NOT EXISTS content.post_tag_search_state (
  post_id uuid PRIMARY KEY REFERENCES content.posts(id) ON DELETE CASCADE,
  extractor_version text NOT NULL,
  observed_distinct_count integer NOT NULL CHECK (observed_distinct_count BETWEEN 0 AND 50001),
  complete boolean NOT NULL,
  excluded_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content.post_tag_search_state
  ADD COLUMN IF NOT EXISTS excluded_reason text;
ALTER TABLE content.post_tag_search_state
  DROP CONSTRAINT IF EXISTS post_tag_search_state_observed_distinct_count_check;
ALTER TABLE content.post_tag_search_state
  ADD CONSTRAINT post_tag_search_state_observed_distinct_count_check
  CHECK (observed_distinct_count BETWEEN 0 AND 50001);

CREATE TABLE IF NOT EXISTS content.post_tag_search_tokens (
  post_id uuid NOT NULL REFERENCES content.posts(id) ON DELETE CASCADE,
  tag_key text NOT NULL CHECK (char_length(tag_key) BETWEEN 1 AND 64),
  indexed_published_at timestamptz,
  searchable boolean NOT NULL DEFAULT true,
  exclusion_reason text,
  PRIMARY KEY (post_id, tag_key)
);

ALTER TABLE content.post_tag_search_tokens
  ADD COLUMN IF NOT EXISTS searchable boolean NOT NULL DEFAULT true;
ALTER TABLE content.post_tag_search_tokens
  ADD COLUMN IF NOT EXISTS exclusion_reason text;

CREATE INDEX IF NOT EXISTS post_tag_search_tokens_lookup_idx
  ON content.post_tag_search_tokens (tag_key, indexed_published_at DESC, post_id DESC)
  WHERE indexed_published_at IS NOT NULL;

DROP INDEX IF EXISTS content.post_tag_search_tokens_excluded_idx;

CREATE OR REPLACE FUNCTION feed.search_public_posts_by_tag(
  p_tag text,
  p_viewer uuid,
  p_before timestamptz,
  p_cursor uuid,
  p_limit integer,
  p_candidate_limit integer
) RETURNS TABLE(post_id uuid, published_at timestamptz, scan_truncated boolean)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH candidate_tokens AS MATERIALIZED (
    SELECT token.post_id, token.indexed_published_at, token.searchable, token.exclusion_reason
      FROM content.post_tag_search_tokens token
     WHERE token.tag_key = $1
       AND token.indexed_published_at IS NOT NULL
       AND ($3::timestamptz IS NULL OR (token.indexed_published_at, token.post_id) < ($3::timestamptz, $4::uuid))
     ORDER BY token.indexed_published_at DESC, token.post_id DESC
     LIMIT $6 + 1
  ),
  candidate_status AS (
    SELECT count(*) > $6 AS scan_truncated FROM candidate_tokens
  ),
  bounded_candidates AS MATERIALIZED (
    SELECT post_id, indexed_published_at, searchable, exclusion_reason
      FROM candidate_tokens
     ORDER BY indexed_published_at DESC, post_id DESC
     LIMIT $6
  ),
  eligible_candidates AS MATERIALIZED (
    SELECT candidate.post_id, eligible.published_at, candidate.searchable,
           candidate.exclusion_reason, eligible.excluded_reason
      FROM bounded_candidates candidate
      JOIN LATERAL (
        SELECT post.published_at, index_state.excluded_reason
          FROM content.posts post
          JOIN content.post_tag_search_state index_state
            ON index_state.post_id = post.id AND index_state.complete
          JOIN content.content_declarations declaration ON declaration.post_id = post.id
          JOIN identity.users author ON author.id = post.author_id AND author.status = 'active'
         WHERE post.id = candidate.post_id
           AND post.visibility = 'public'
           AND post.moderation_state = 'allowed'
           AND post.deleted_at IS NULL
           AND post.published_at IS NOT NULL
           AND candidate.indexed_published_at = post.published_at
           AND declaration.public_label IN ('Human-authored', 'AI-assisted')
           AND declaration.review_required = false
           AND ($2::uuid IS NULL OR (
             NOT EXISTS (SELECT 1 FROM social.blocks block
                          WHERE (block.blocker_id = $2 AND block.blocked_id = post.author_id)
                             OR (block.blocker_id = post.author_id AND block.blocked_id = $2))
             AND NOT EXISTS (SELECT 1 FROM social.mutes mute
                              WHERE mute.muter_id = $2 AND mute.muted_id = post.author_id)
           ))
         OFFSET 0
      ) eligible ON true
  ),
  eligible_page AS MATERIALIZED (
    SELECT post_id, published_at
      FROM eligible_candidates
     WHERE searchable
     ORDER BY published_at DESC, post_id DESC
     LIMIT $5
  ),
  page_status AS (
    SELECT EXISTS (
             SELECT 1 FROM eligible_candidates
              WHERE searchable = false OR exclusion_reason IS NOT NULL OR excluded_reason IS NOT NULL
                 OR searchable IS DISTINCT FROM (exclusion_reason IS NULL)
                 OR excluded_reason IS DISTINCT FROM exclusion_reason)
           OR (candidate_status.scan_truncated
               AND (SELECT count(*) FROM eligible_page) < $5) AS scan_truncated
      FROM candidate_status
  )
  SELECT eligible_page.post_id, eligible_page.published_at, page_status.scan_truncated
    FROM eligible_page CROSS JOIN page_status
  UNION ALL
  SELECT NULL::uuid, NULL::timestamptz, page_status.scan_truncated
    FROM page_status
   WHERE page_status.scan_truncated
     AND NOT EXISTS (SELECT 1 FROM eligible_page)
$$;

CREATE OR REPLACE FUNCTION feed.write_post_tag_search_index(
  p_post_id uuid,
  p_tokens text[],
  p_observed_distinct_count integer,
  p_complete boolean,
  p_extractor_version text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  configured_limit integer;
  token_count integer := COALESCE(cardinality(p_tokens), 0);
  write_complete boolean;
  write_exclusion_reason text;
BEGIN
  SELECT max_distinct_tags_per_post INTO configured_limit
    FROM feed.tag_search_index_control WHERE singleton = true;
  IF configured_limit IS NULL THEN RAISE EXCEPTION 'tag search control row missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM content.posts WHERE id = p_post_id) THEN
    RAISE EXCEPTION 'tag search post missing';
  END IF;

  IF EXISTS (SELECT 1 FROM content.posts WHERE id = p_post_id AND deleted_at IS NOT NULL) THEN
    DELETE FROM content.post_tag_search_tokens WHERE post_id = p_post_id;
    DELETE FROM content.post_tag_search_state WHERE post_id = p_post_id;
    RETURN;
  END IF;
  IF p_extractor_version IS DISTINCT FROM 'exact-token-proposal-v3'
     OR p_observed_distinct_count IS NULL OR p_observed_distinct_count < 0
     OR p_observed_distinct_count > 50001
     OR token_count > 50000
     OR p_observed_distinct_count < token_count
     OR NOT COALESCE(p_complete, false)
     OR p_observed_distinct_count <> token_count
     OR EXISTS (SELECT 1 FROM unnest(COALESCE(p_tokens, ARRAY[]::text[])) token
                 WHERE token IS NULL OR char_length(token) NOT BETWEEN 1 AND 64
                    OR position('#' in token) > 0 OR btrim(token) <> token)
     OR (SELECT count(*) FROM unnest(COALESCE(p_tokens, ARRAY[]::text[])) token)
        <> (SELECT count(DISTINCT token) FROM unnest(COALESCE(p_tokens, ARRAY[]::text[])) token)
  THEN
    write_complete := false;
  ELSE
    write_complete := true;
  END IF;

  write_exclusion_reason := CASE
    WHEN write_complete AND token_count > configured_limit THEN 'legacy_tag_limit_exceeded'
    ELSE NULL
  END;

  DELETE FROM content.post_tag_search_tokens WHERE post_id = p_post_id;
  IF write_complete AND write_exclusion_reason IS NULL THEN
    INSERT INTO content.post_tag_search_tokens(
      post_id, tag_key, indexed_published_at, searchable, exclusion_reason)
    SELECT p_post_id, token,
           CASE WHEN post.visibility = 'public' AND post.moderation_state = 'allowed'
                      AND post.deleted_at IS NULL AND post.published_at IS NOT NULL
                      AND author.status = 'active'
                      AND declaration.public_label IN ('Human-authored', 'AI-assisted')
                      AND declaration.review_required = false
                THEN post.published_at ELSE NULL END,
           true,
           NULL
      FROM unnest(COALESCE(p_tokens, ARRAY[]::text[])) AS supplied(token)
      JOIN content.posts post ON post.id = p_post_id
      JOIN identity.users author ON author.id = post.author_id
      LEFT JOIN content.content_declarations declaration ON declaration.post_id = post.id
    ON CONFLICT (post_id, tag_key) DO UPDATE
      SET indexed_published_at = EXCLUDED.indexed_published_at,
          searchable = EXCLUDED.searchable,
          exclusion_reason = EXCLUDED.exclusion_reason;
  END IF;

  INSERT INTO content.post_tag_search_state(
    post_id, extractor_version, observed_distinct_count, complete, excluded_reason, updated_at)
  VALUES (p_post_id, COALESCE(p_extractor_version, 'unknown'),
          LEAST(COALESCE(p_observed_distinct_count, 0), 50001), write_complete,
          write_exclusion_reason, now())
  ON CONFLICT (post_id) DO UPDATE
    SET extractor_version = EXCLUDED.extractor_version,
        observed_distinct_count = EXCLUDED.observed_distinct_count,
        complete = EXCLUDED.complete,
        excluded_reason = EXCLUDED.excluded_reason,
        updated_at = EXCLUDED.updated_at;

  IF NOT write_complete THEN
    UPDATE feed.tag_search_index_control
       SET search_enabled = false,
           block_reason = 'post_tag_index_incomplete',
           updated_at = now()
     WHERE singleton = true AND search_enabled;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION feed.maintain_post_tag_search_insert_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO content.post_tag_search_state(post_id, extractor_version, observed_distinct_count, complete)
  SELECT post.id, 'pending', 0, false FROM new_posts post
  ON CONFLICT (post_id) DO NOTHING;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION feed.maintain_post_tag_search_update_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  DELETE FROM content.post_tag_search_tokens token
   USING old_posts old_post, new_posts new_post
   WHERE token.post_id = old_post.id AND old_post.id = new_post.id
     AND (old_post.body IS DISTINCT FROM new_post.body
       OR (old_post.deleted_at IS NULL AND new_post.deleted_at IS NOT NULL)
       OR (old_post.deleted_at IS NOT NULL AND new_post.deleted_at IS NULL));

  DELETE FROM content.post_tag_search_state state
   USING old_posts old_post, new_posts new_post
   WHERE state.post_id = old_post.id AND old_post.id = new_post.id
     AND new_post.deleted_at IS NOT NULL;

  INSERT INTO content.post_tag_search_state(post_id, extractor_version, observed_distinct_count, complete, updated_at)
  SELECT new_post.id, 'pending', 0, false, now()
    FROM old_posts old_post
    JOIN new_posts new_post ON new_post.id = old_post.id
   WHERE new_post.deleted_at IS NULL
     AND (old_post.body IS DISTINCT FROM new_post.body
       OR (old_post.deleted_at IS NOT NULL AND new_post.deleted_at IS NULL))
  ON CONFLICT (post_id) DO UPDATE
    SET extractor_version = EXCLUDED.extractor_version,
        observed_distinct_count = 0,
        complete = false,
        excluded_reason = NULL,
        updated_at = now();

  UPDATE content.post_tag_search_tokens token
     SET indexed_published_at = CASE
       WHEN new_post.visibility = 'public' AND new_post.moderation_state = 'allowed'
        AND new_post.deleted_at IS NULL AND new_post.published_at IS NOT NULL
        AND declaration.public_label IN ('Human-authored', 'AI-assisted')
        AND declaration.review_required = false AND author.status = 'active'
        AND token.searchable AND token.exclusion_reason IS NULL
        AND EXISTS (SELECT 1 FROM content.post_tag_search_state index_state
                     WHERE index_state.post_id = token.post_id AND index_state.complete
                       AND index_state.excluded_reason IS NULL)
       THEN new_post.published_at ELSE NULL END
    FROM old_posts old_post
    JOIN new_posts new_post ON new_post.id = old_post.id
    JOIN identity.users author ON author.id = new_post.author_id
    LEFT JOIN content.content_declarations declaration ON declaration.post_id = new_post.id
   WHERE token.post_id = new_post.id
     AND old_post.body IS NOT DISTINCT FROM new_post.body
     AND old_post.deleted_at IS NULL AND new_post.deleted_at IS NULL;

  UPDATE feed.tag_search_index_control control
     SET search_enabled = false, block_reason = 'eligible_post_missing_complete_index', updated_at = now()
   WHERE control.singleton = true AND control.search_enabled
     AND EXISTS (
       SELECT 1 FROM new_posts new_post
       JOIN identity.users author ON author.id = new_post.author_id AND author.status = 'active'
       JOIN content.content_declarations declaration ON declaration.post_id = new_post.id
       LEFT JOIN content.post_tag_search_state state ON state.post_id = new_post.id
       WHERE new_post.visibility = 'public' AND new_post.moderation_state = 'allowed'
         AND new_post.deleted_at IS NULL AND new_post.published_at IS NOT NULL
         AND declaration.public_label IN ('Human-authored', 'AI-assisted')
         AND declaration.review_required = false
         AND COALESCE(state.complete, false) = false
     );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION feed.maintain_declaration_tag_search_insert_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE content.post_tag_search_tokens token
     SET indexed_published_at = CASE
       WHEN post.visibility = 'public' AND post.moderation_state = 'allowed'
        AND post.deleted_at IS NULL AND post.published_at IS NOT NULL
        AND declaration.public_label IN ('Human-authored', 'AI-assisted')
        AND declaration.review_required = false AND author.status = 'active'
        AND token.searchable AND token.exclusion_reason IS NULL
        AND EXISTS (SELECT 1 FROM content.post_tag_search_state index_state
                     WHERE index_state.post_id = token.post_id AND index_state.complete
                       AND index_state.excluded_reason IS NULL)
       THEN post.published_at ELSE NULL END
    FROM new_declarations declaration
    JOIN content.posts post ON post.id = declaration.post_id
    JOIN identity.users author ON author.id = post.author_id
   WHERE token.post_id = declaration.post_id;

  UPDATE feed.tag_search_index_control control
     SET search_enabled = false, block_reason = 'eligible_post_missing_complete_index', updated_at = now()
   WHERE control.singleton = true AND control.search_enabled
     AND EXISTS (
       SELECT 1 FROM new_declarations declaration
       JOIN content.posts post ON post.id = declaration.post_id
       JOIN identity.users author ON author.id = post.author_id AND author.status = 'active'
       LEFT JOIN content.post_tag_search_state index_state ON index_state.post_id = post.id
       WHERE post.visibility = 'public' AND post.moderation_state = 'allowed'
         AND post.deleted_at IS NULL AND post.published_at IS NOT NULL
         AND declaration.public_label IN ('Human-authored', 'AI-assisted')
         AND declaration.review_required = false
         AND COALESCE(index_state.complete, false) = false
     );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION feed.maintain_declaration_tag_search_update_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE content.post_tag_search_tokens token
     SET indexed_published_at = NULL
    FROM old_declarations declaration
   WHERE token.post_id = declaration.post_id;

  UPDATE content.post_tag_search_tokens token
     SET indexed_published_at = CASE
       WHEN post.visibility = 'public' AND post.moderation_state = 'allowed'
        AND post.deleted_at IS NULL AND post.published_at IS NOT NULL
        AND declaration.public_label IN ('Human-authored', 'AI-assisted')
        AND declaration.review_required = false AND author.status = 'active'
        AND token.searchable AND token.exclusion_reason IS NULL
        AND EXISTS (SELECT 1 FROM content.post_tag_search_state index_state
                     WHERE index_state.post_id = token.post_id AND index_state.complete
                       AND index_state.excluded_reason IS NULL)
       THEN post.published_at ELSE NULL END
    FROM new_declarations declaration
    JOIN content.posts post ON post.id = declaration.post_id
    JOIN identity.users author ON author.id = post.author_id
   WHERE token.post_id = declaration.post_id;

  UPDATE feed.tag_search_index_control control
     SET search_enabled = false, block_reason = 'eligible_post_missing_complete_index', updated_at = now()
   WHERE control.singleton = true AND control.search_enabled
     AND EXISTS (
       SELECT 1 FROM new_declarations declaration
       JOIN content.posts post ON post.id = declaration.post_id
       JOIN identity.users author ON author.id = post.author_id AND author.status = 'active'
       LEFT JOIN content.post_tag_search_state index_state ON index_state.post_id = post.id
       WHERE post.visibility = 'public' AND post.moderation_state = 'allowed'
         AND post.deleted_at IS NULL AND post.published_at IS NOT NULL
         AND declaration.public_label IN ('Human-authored', 'AI-assisted')
         AND declaration.review_required = false
         AND COALESCE(index_state.complete, false) = false
     );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION feed.maintain_declaration_tag_search_delete_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE content.post_tag_search_tokens token
     SET indexed_published_at = NULL
    FROM old_declarations declaration
   WHERE token.post_id = declaration.post_id;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION feed.maintain_author_tag_search_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE content.post_tag_search_tokens token
     SET indexed_published_at = CASE WHEN NEW.status = 'active'
          AND post.visibility = 'public' AND post.moderation_state = 'allowed'
          AND post.deleted_at IS NULL AND post.published_at IS NOT NULL
          AND declaration.public_label IN ('Human-authored', 'AI-assisted')
          AND declaration.review_required = false
          AND token.searchable AND token.exclusion_reason IS NULL
          AND EXISTS (SELECT 1 FROM content.post_tag_search_state index_state
                       WHERE index_state.post_id = token.post_id AND index_state.complete
                         AND index_state.excluded_reason IS NULL)
       THEN post.published_at ELSE NULL END
    FROM content.posts post
    LEFT JOIN content.content_declarations declaration ON declaration.post_id = post.id
   WHERE token.post_id = post.id AND post.author_id = NEW.id;
  IF NEW.status = 'active' THEN
    UPDATE feed.tag_search_index_control control
       SET search_enabled = false, block_reason = 'active_author_has_incomplete_index', updated_at = now()
     WHERE control.singleton = true AND control.search_enabled
       AND EXISTS (
         SELECT 1 FROM content.posts post
          LEFT JOIN content.post_tag_search_state index_state ON index_state.post_id = post.id
         WHERE post.author_id = NEW.id AND post.deleted_at IS NULL
           AND COALESCE(index_state.complete, false) = false
       );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS post_tag_search_maintain ON content.posts;
DROP TRIGGER IF EXISTS post_tag_search_insert_stmt ON content.posts;
CREATE TRIGGER post_tag_search_insert_stmt
AFTER INSERT ON content.posts
REFERENCING NEW TABLE AS new_posts
FOR EACH STATEMENT EXECUTE FUNCTION feed.maintain_post_tag_search_insert_stmt();

DROP TRIGGER IF EXISTS post_tag_search_update_stmt ON content.posts;
CREATE TRIGGER post_tag_search_update_stmt
AFTER UPDATE ON content.posts
REFERENCING OLD TABLE AS old_posts NEW TABLE AS new_posts
FOR EACH STATEMENT EXECUTE FUNCTION feed.maintain_post_tag_search_update_stmt();
DROP TRIGGER IF EXISTS post_tag_search_commit_guard ON content.posts;

DROP TRIGGER IF EXISTS declaration_tag_search_maintain ON content.content_declarations;
DROP TRIGGER IF EXISTS declaration_tag_search_insert_stmt ON content.content_declarations;
CREATE TRIGGER declaration_tag_search_insert_stmt
AFTER INSERT ON content.content_declarations
REFERENCING NEW TABLE AS new_declarations
FOR EACH STATEMENT EXECUTE FUNCTION feed.maintain_declaration_tag_search_insert_stmt();

DROP TRIGGER IF EXISTS declaration_tag_search_update_stmt ON content.content_declarations;
CREATE TRIGGER declaration_tag_search_update_stmt
AFTER UPDATE ON content.content_declarations
REFERENCING OLD TABLE AS old_declarations NEW TABLE AS new_declarations
FOR EACH STATEMENT EXECUTE FUNCTION feed.maintain_declaration_tag_search_update_stmt();

DROP TRIGGER IF EXISTS declaration_tag_search_delete_stmt ON content.content_declarations;
CREATE TRIGGER declaration_tag_search_delete_stmt
AFTER DELETE ON content.content_declarations
REFERENCING OLD TABLE AS old_declarations
FOR EACH STATEMENT EXECUTE FUNCTION feed.maintain_declaration_tag_search_delete_stmt();

DROP TRIGGER IF EXISTS declaration_tag_search_commit_guard ON content.content_declarations;

DROP TRIGGER IF EXISTS author_tag_search_maintain ON identity.users;
CREATE TRIGGER author_tag_search_maintain
AFTER UPDATE OF status ON identity.users
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION feed.maintain_author_tag_search_visibility();

REVOKE ALL ON feed.tag_search_index_control FROM PUBLIC;
REVOKE ALL ON content.post_tag_search_state FROM PUBLIC;
REVOKE ALL ON content.post_tag_search_tokens FROM PUBLIC;
GRANT SELECT ON feed.tag_search_index_control TO lythaus_runtime;
REVOKE ALL ON FUNCTION feed.write_post_tag_search_index(uuid, text[], integer, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION feed.search_public_posts_by_tag(text, uuid, timestamptz, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION feed.maintain_post_tag_search_insert_stmt() FROM PUBLIC;
REVOKE ALL ON FUNCTION feed.maintain_post_tag_search_update_stmt() FROM PUBLIC;
REVOKE ALL ON FUNCTION feed.maintain_declaration_tag_search_insert_stmt() FROM PUBLIC;
REVOKE ALL ON FUNCTION feed.maintain_declaration_tag_search_update_stmt() FROM PUBLIC;
REVOKE ALL ON FUNCTION feed.maintain_declaration_tag_search_delete_stmt() FROM PUBLIC;
REVOKE ALL ON FUNCTION feed.maintain_author_tag_search_visibility() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION feed.write_post_tag_search_index(uuid, text[], integer, boolean, text) TO lythaus_runtime, lythaus_migrations;
GRANT EXECUTE ON FUNCTION feed.search_public_posts_by_tag(text, uuid, timestamptz, uuid, integer, integer) TO lythaus_runtime, lythaus_migrations;
