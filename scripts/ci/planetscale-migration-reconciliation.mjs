import { APPROVED_MIGRATIONS, expectedMigrationPrefix } from './planetscale-migration-manifest.mjs';

const artifacts = {
  '0009_cost_budget_enforcement.sql': [
    ['budget_periods', "SELECT to_regclass('system.cost_budget_periods') IS NOT NULL AS present"],
    ['budget_reservations', "SELECT to_regclass('system.cost_budget_reservations') IS NOT NULL AS present"],
    ['usage_events', "SELECT to_regclass('system.cost_usage_events') IS NOT NULL AS present"],
    ['kill_switches', "SELECT to_regclass('system.cost_kill_switches') IS NOT NULL AS present"],
  ],
  '0010_native_runtime_parity.sql': [
    ['rate_limit_windows', "SELECT to_regclass('system.rate_limit_windows') IS NOT NULL AS present"],
    ['notification_devices', "SELECT to_regclass('feed.notification_devices') IS NOT NULL AS present"],
    ['reward_redemptions', "SELECT to_regclass('trust.reward_redemptions') IS NOT NULL AS present"],
  ],
  '0011_email_guest_auth_only.sql': [
    ['provider_email_only', "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_links_email_only') AS present"],
    ['contact_email_current', "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_emails_source_provider_current') AS present"],
    ['provider_legacy_constraint_removed', "SELECT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_links_provider_check') AS present"],
    ['contact_email_legacy_constraint_removed', "SELECT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_emails_source_provider_check') AS present"],
  ],
  '0012_product_integrity_v2.sql': [
    ['activity_events', "SELECT to_regclass('trust.user_activity_events') IS NOT NULL AS present"],
    ['appeal_review_votes', "SELECT to_regclass('moderation.appeal_review_votes') IS NOT NULL AS present"],
    ['appeal_outcomes', "SELECT to_regclass('moderation.appeal_outcomes') IS NOT NULL AS present"],
    ['reputation_profiles', "SELECT to_regclass('trust.reputation_profiles') IS NOT NULL AS present"],
    ['appeals_open_unique', "SELECT to_regclass('moderation.appeals_one_open_case_appellant_idx') IS NOT NULL AS present"],
    ['reactions_current_unique', "SELECT to_regclass('social.reactions_one_current_idx') IS NOT NULL AS present"],
    ['notification_activity_link', "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'feed' AND table_name = 'notifications' AND column_name = 'activity_event_id') AS present"],
    ['privacy_locator_v2', "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'privacy' AND p.proname = 'reconcile_subject_data_locations' AND p.prosecdef) AS present"],
  ],
  '0013_marketing_waitlist.sql': [
    ['waitlist_table', "SELECT to_regclass('marketing.waitlist_signups') IS NOT NULL AS present"],
    ['waitlist_purge_after', "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups' AND column_name = 'purge_after') AS present"],
    ['waitlist_hold', "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups' AND column_name = 'retention_hold') AS present"],
    ['waitlist_unique_hmac', "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_signups_email_lookup_hmac_unique' AND contype = 'u') AS present"],
    ['waitlist_cursor_index', "SELECT to_regclass('marketing.waitlist_signups_created_cursor_idx') IS NOT NULL AS present"],
    ['waitlist_purge_index', "SELECT to_regclass('marketing.waitlist_signups_due_purge_idx') IS NOT NULL AS present"],
    ['waitlist_no_plaintext_columns', "SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups' AND column_name IN ('email', 'plain_email', 'raw_ip', 'ip_address', 'user_agent', 'turnstile_token')) AS present"],
  ],
};

export function classifyArtifacts(results) {
  const present = results.filter((artifact) => artifact.present).length;
  return present === 0 ? 'NOT_APPLIED' : present === results.length ? 'FULLY_APPLIED' : 'PARTIALLY_APPLIED';
}

export async function classifyMigrationState(client, names = Object.keys(artifacts)) {
  const states = [];
  for (const name of names) {
    const checks = artifacts[name] ?? [];
    const results = [];
    for (const [artifact, sql] of checks) {
      const result = await client.query(sql);
      results.push({ artifact, present: result.rows[0]?.present === true });
    }
    states.push({ name, state: classifyArtifacts(results), artifacts: results });
  }
  return states;
}

export function exactRegistryPrefix(rows, version) {
  const expected = expectedMigrationPrefix(version);
  if (rows.length !== expected.length) return false;
  return expected.every((migration, index) => rows[index]?.version === migration.name && rows[index]?.checksum === migration.appliedSha256);
}

export function incrementalRegistryHead(rows) {
  const minimumIndex = APPROVED_MIGRATIONS.findIndex(({ name }) => name === '0008_legacy_relink_status.sql');
  const version = rows.at(-1)?.version;
  const currentIndex = APPROVED_MIGRATIONS.findIndex(({ name }) => name === version);
  if (currentIndex < minimumIndex || !exactRegistryPrefix(rows, version)) return null;
  return version;
}

export function incrementalMigrationNames(afterVersion = '0008_legacy_relink_status.sql') {
  const currentIndex = APPROVED_MIGRATIONS.findIndex(({ name }) => name === afterVersion);
  const minimumIndex = APPROVED_MIGRATIONS.findIndex(({ name }) => name === '0008_legacy_relink_status.sql');
  if (currentIndex < minimumIndex) throw new Error(`invalid incremental migration head: ${afterVersion}`);
  return APPROVED_MIGRATIONS.slice(currentIndex + 1).map(({ name }) => name);
}

export async function migrationDataRiskReport(client) {
  const result = await client.query(`SELECT
    (SELECT count(*)::integer FROM identity.users) AS user_count,
    (SELECT count(*)::integer FROM identity.provider_links WHERE provider <> 'email') AS non_email_provider_links,
    (SELECT count(*)::integer FROM identity.contact_emails WHERE source_provider NOT IN ('email', 'migration')) AS non_current_contact_sources,
    (SELECT count(*)::integer FROM system.feature_flags WHERE flag_key LIKE 'auth.%' AND flag_key NOT IN ('auth.email', 'auth.guest')) AS legacy_auth_flags,
    (SELECT count(*)::integer FROM (
      SELECT user_id, signal_type FROM trust.accountability_signals GROUP BY user_id, signal_type HAVING count(*) > 1
    ) duplicate_keys) AS duplicate_accountability_signal_keys,
    (SELECT count(*)::integer FROM (
      SELECT content_type, content_id FROM moderation.cases WHERE state = 'open' GROUP BY content_type, content_id HAVING count(*) > 1
    ) duplicate_keys) AS duplicate_open_case_keys,
    (SELECT count(*)::integer FROM (
      SELECT user_id, post_id FROM social.reactions GROUP BY user_id, post_id HAVING count(*) > 1
    ) duplicate_keys) AS duplicate_reaction_keys,
    (SELECT count(*)::integer FROM (
      SELECT case_id, appellant_id FROM moderation.appeals WHERE state = 'open' GROUP BY case_id, appellant_id HAVING count(*) > 1
    ) duplicate_keys) AS duplicate_open_appeal_keys,
    (SELECT count(*)::integer FROM content.posts WHERE declared_creation_mode = 'ai_generated') AS legacy_ai_generated_posts`);
  const row = result.rows[0] ?? {};
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value ?? 0)]));
}

export function assertMigrationDataPreconditions(report) {
  if (report.duplicate_open_appeal_keys !== 0) {
    throw new Error(`0012 requires explicit open-appeal reconciliation: ${report.duplicate_open_appeal_keys} duplicate key(s)`);
  }
}
