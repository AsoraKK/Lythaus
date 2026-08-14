import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '';
if (!connectionString) throw new Error('PLANETSCALE_PG17_TEST_DATABASE_URL is required');

const connection = new URL(connectionString);
if (!['localhost', '127.0.0.1', '::1'].includes(connection.hostname)) {
  throw new Error('relation fingerprint generation refuses non-local database hosts');
}

const relations = {
  '0009_cost_budget_enforcement.sql': [
    'system.cost_budget_periods',
    'system.cost_budget_reservations',
    'system.cost_usage_events',
    'system.cost_kill_switches',
  ],
  '0010_native_runtime_parity.sql': [
    'identity.user_entitlements',
    'system.rate_limit_windows',
    'feed.notification_preferences',
    'feed.notification_devices',
    'trust.reward_redemptions',
  ],
  '0011_email_guest_auth_only.sql': [
    'identity.provider_links',
    'identity.contact_emails',
  ],
  '0012_product_integrity_v2.sql': [
    'trust.user_activity_events',
    'trust.reputation_events',
    'trust.accountability_signals',
    'trust.reputation_profiles',
    'moderation.reviewer_qualifications',
    'moderation.appeal_assignments',
    'moderation.appeal_review_votes',
    'moderation.appeal_adjudications',
    'moderation.appeal_outcomes',
    'moderation.appeal_outcome_effects',
    'moderation.appeals',
    'content.posts',
    'moderation.detector_runs',
    'trust.provenance_events',
    'moderation.cases',
    'social.profiles',
    'content.comments',
    'content.content_declarations',
    'moderation.decisions',
    'social.reactions',
    'system.outbox_events',
    'system.consumer_inbox',
    'system.idempotency_keys',
    'social.custom_feed_rules',
    'editorial.publications',
    'feed.user_inbox',
    'feed.notifications',
  ],
};

const fingerprintSql = `
WITH resolved AS (
  SELECT to_regclass($1) AS relation_oid
), contract AS (
  SELECT jsonb_build_object(
    'columns', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', attribute.attname, 'type', format_type(attribute.atttypid, attribute.atttypmod), 'notNull', attribute.attnotnull, 'default', pg_get_expr(default_value.adbin, default_value.adrelid)) ORDER BY attribute.attnum) FROM pg_attribute attribute LEFT JOIN pg_attrdef default_value ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum WHERE attribute.attrelid = resolved.relation_oid AND attribute.attnum > 0 AND NOT attribute.attisdropped), '[]'::jsonb),
    'constraints', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', constraint_entry.conname, 'type', constraint_entry.contype, 'validated', constraint_entry.convalidated, 'definition', pg_get_constraintdef(constraint_entry.oid)) ORDER BY constraint_entry.conname) FROM pg_constraint constraint_entry WHERE constraint_entry.conrelid = resolved.relation_oid), '[]'::jsonb),
    'indexes', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', index_relation.relname, 'definition', pg_get_indexdef(index_entry.indexrelid)) ORDER BY index_relation.relname) FROM pg_index index_entry JOIN pg_class index_relation ON index_relation.oid = index_entry.indexrelid WHERE index_entry.indrelid = resolved.relation_oid), '[]'::jsonb)
  ) AS value
  FROM resolved
)
SELECT resolved.relation_oid IS NOT NULL AS present,
       encode(digest(contract.value::text, 'sha256'), 'hex') AS fingerprint
FROM resolved CROSS JOIN contract`;

const client = new Client({ connectionString, ssl: false });
await client.connect();
try {
  const generated = {};
  for (const [migration, names] of Object.entries(relations)) {
    generated[migration] = {};
    for (const relation of names) {
      const result = await client.query(fingerprintSql, [relation]);
      const row = result.rows[0];
      if (!row?.present) throw new Error(`canonical relation missing: ${relation}`);
      generated[migration][relation] = row.fingerprint;
    }
  }
  console.log(JSON.stringify(generated, null, 2));
} finally {
  await client.end();
}
