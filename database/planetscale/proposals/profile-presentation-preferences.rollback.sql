BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE identity.users
  DROP COLUMN presentation_left_handed,
  DROP COLUMN presentation_profile_swipe,
  DROP COLUMN presentation_preferences_version;

COMMIT;
