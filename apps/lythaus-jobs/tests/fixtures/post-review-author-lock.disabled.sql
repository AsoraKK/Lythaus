-- Disabled proposal: excluded from the approved migration manifest.
-- This complete file rolls back; it neither installs a capability nor grants it.
-- Owner mapping and the exact Jobs EXECUTE grant require separate approval.
BEGIN;

CREATE FUNCTION trust.lock_active_post_review_author(
  p_post_id uuid,
  p_source_event_id uuid,
  p_expected_author_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $post_review_author_lock$
BEGIN
  PERFORM 1
    FROM identity.users AS author
    JOIN content.posts AS post
      ON post.author_id = author.id
   WHERE post.id = $1
     AND post.moderation_source_event_id = $2
     AND post.author_id = $3
     AND post.moderation_state = 'under_review'
     AND post.deleted_at IS NULL
     AND author.status = 'active'
     AND author.deleted_at IS NULL
   FOR SHARE OF author;

  RETURN FOUND;
END;
$post_review_author_lock$;

REVOKE ALL ON FUNCTION
  trust.lock_active_post_review_author(uuid, uuid, uuid) FROM PUBLIC;

ROLLBACK;
