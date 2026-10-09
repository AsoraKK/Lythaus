BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE identity.users
  ADD COLUMN presentation_left_handed boolean NOT NULL DEFAULT false,
  ADD COLUMN presentation_profile_swipe boolean NOT NULL DEFAULT true,
  ADD COLUMN presentation_preferences_version integer NOT NULL DEFAULT 1
    CHECK (presentation_preferences_version > 0);

COMMIT;
