CREATE TABLE identity.user_entitlements (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  subscription_tier text NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'premium', 'black')),
  updated_by uuid REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE system.rate_limit_windows (
  scope text NOT NULL,
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, subject_hash, window_started_at)
);

CREATE INDEX rate_limit_expiry_idx ON system.rate_limit_windows (expires_at);

ALTER TABLE feed.notifications
  ADD COLUMN dismissed_at timestamptz;

CREATE TABLE feed.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  replies_enabled boolean NOT NULL DEFAULT true,
  moderation_enabled boolean NOT NULL DEFAULT true,
  rewards_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feed.notification_devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  token_ciphertext bytea NOT NULL,
  token_hmac bytea NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX notification_devices_user_idx
  ON feed.notification_devices (user_id, active, created_at DESC);

CREATE TABLE trust.reward_redemptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  reward_id text NOT NULL,
  reward_level integer NOT NULL CHECK (reward_level BETWEEN 1 AND 5),
  reward_title text NOT NULL,
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'revoked')),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, reward_id)
);

CREATE INDEX reward_redemptions_user_idx
  ON trust.reward_redemptions (user_id, redeemed_at DESC);
