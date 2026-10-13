export const FEED_AUTHOR_FIELDS = `
  CASE WHEN author_profile.user_id IS NOT NULL
        AND COALESCE(author_profile.public_visibility, true)
        AND COALESCE(author_profile.moderation_state, 'allowed') = 'allowed'
       THEN author.display_name END AS "authorDisplayName",
  CASE WHEN author_profile.user_id IS NOT NULL
        AND COALESCE(author_profile.public_visibility, true)
        AND COALESCE(author_profile.moderation_state, 'allowed') = 'allowed'
       THEN author_handle.handle END AS "authorHandle"`;

export const FEED_AUTHOR_JOINS = `
  LEFT JOIN social.profiles author_profile ON author_profile.user_id = author.id
  LEFT JOIN identity.handles author_handle ON author_handle.user_id = author.id`;
