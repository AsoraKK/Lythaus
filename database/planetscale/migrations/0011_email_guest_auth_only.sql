ALTER TABLE identity.provider_links
  DROP CONSTRAINT IF EXISTS provider_links_provider_check;

ALTER TABLE identity.provider_links
  ADD CONSTRAINT provider_links_email_only
  CHECK (provider = 'email') NOT VALID;

ALTER TABLE identity.contact_emails
  DROP CONSTRAINT IF EXISTS contact_emails_source_provider_check;

ALTER TABLE identity.contact_emails
  ADD CONSTRAINT contact_emails_source_provider_current
  CHECK (source_provider IN ('email', 'migration')) NOT VALID;

DELETE FROM system.feature_flags
WHERE flag_key LIKE 'auth.%'
  AND flag_key NOT IN ('auth.email', 'auth.guest');
