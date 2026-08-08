-- Synthetic development seed only. Never apply to production `main`.
INSERT INTO system.feature_flags (flag_key, enabled, policy_version) VALUES
  ('auth.email', true, 'v2'),
  ('auth.guest', true, 'v2'),
  ('media.video', false, 'v1'),
  ('billing.paid_tiers', false, 'v1'),
  ('affiliate.program', false, 'v1'),
  ('editorial.peer_review', false, 'v1'),
  ('trust.reputation_rewards', false, 'v1'),
  ('notifications.push', false, 'v1'),
  ('federation', false, 'v1'),
  ('realtime.chat', false, 'v1'),
  ('projections.d1', false, 'v1')
ON CONFLICT (flag_key) DO UPDATE SET enabled = EXCLUDED.enabled, policy_version = EXCLUDED.policy_version, updated_at = now();
