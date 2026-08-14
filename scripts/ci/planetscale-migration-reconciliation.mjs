import { APPROVED_MIGRATIONS, expectedMigrationPrefix } from './planetscale-migration-manifest.mjs';

// These fingerprints are generated against the canonical PostgreSQL 17 schema after
// applying immutable migrations 0000 through 0013. A relation contract includes every
// live column, constraint and index for relations changed by a migration. This is
// intentionally fail-closed: the registry may only be advanced when the complete
// canonical relation shape exists, not when representative objects happen to exist.
const relationContracts = {
  '0009_cost_budget_enforcement.sql': {
    'system.cost_budget_periods': '4fc59a0e2197b2c736f8d02a4b2cd44215661b5afd0b6f78327180d7bc2bc8d0',
    'system.cost_budget_reservations': '80e450217777b8d8d371f882769d5c1cc0788b21482e33eed4bdf6feb57f2409',
    'system.cost_usage_events': 'ff3a8a2c793191d2b2a0ae0bafacfafb89c84c5ef0eee176f1ebe62b3243781e',
    'system.cost_kill_switches': 'a36511760dfb185c88992935e72bd4a31e40ea434c192499101b7ba508e7b160',
  },
  '0010_native_runtime_parity.sql': {
    'identity.user_entitlements': 'a2e2b67018b8b05d1066f86b02bc2cca2d9e4db637a62c440c835ae2056c5486',
    'system.rate_limit_windows': 'eb3fcf4c4ea0ae74bf52fa4adebcc033634b5288f75b78603562b9f5ea74707c',
    'feed.notification_preferences': '4efb857e7ec433840b990afef9af94b220446146291d52f1da609c96702a74d8',
    'feed.notification_devices': '25a27bf4d80d0913e90a5b9956676c3d939b46106c84f17dd0a022ae380113d6',
    'trust.reward_redemptions': '2b12a3ec0b8d886b4de3bfb6a414df36ffc3700015531aa2c176a45a97e07220',
  },
  '0011_email_guest_auth_only.sql': {
    'identity.provider_links': '00f3676abb1ebe5661fd4f9f8b3f58303da23673079835a724caba33165612ff',
    'identity.contact_emails': 'e9f6fe5f2a3b245dbd3ef5de8745bf69c2550aa979f8e881c3746a3cd72efd09',
  },
  '0012_product_integrity_v2.sql': {
    'trust.user_activity_events': '8e06529a412a955fd5fefa4e9d260468235dcb2fac80a25c1eb797f8291b35bd',
    'trust.reputation_events': '697d07030b9bed9b6b8ecfd4051152887d12093fd0dcd48b81b4ac5eda03b8d9',
    'trust.accountability_signals': '6bd8adadc57cffd7e9b472a726fd1f6bc266474e961b53da13c87ea06c0e5728',
    'trust.reputation_profiles': '93dfd82cbcb84ed13e562a35c428119b02f429b084ff1b4f060cb0e2bdce4cdd',
    'moderation.reviewer_qualifications': 'b8f03c097c8a2ec8cd329c8a7065814f3768dbf56c1c8bd9a9d826602f096642',
    'moderation.appeal_assignments': '91db9d4874684ffd027e0776b69dc433fa65a2d9193ab2c6617e63ffc5a86874',
    'moderation.appeal_review_votes': 'd1c4861020f6e3586a37238c9086fde1fb788252ce558632d04624bc2c913250',
    'moderation.appeal_adjudications': '72224887c6b8b6e5f290e016da1bf8cfee6da55e6a5bedd1d5f64e248acb079d',
    'moderation.appeal_outcomes': 'df714dc5389bdcdb55d028a9f322a175c1b7c7cf12573ab8fb38cf688446ce5c',
    'moderation.appeal_outcome_effects': '52350a6308f4fa983422e10412fc359e0d7d59fa57932b9a29c61bd3610d0721',
    'moderation.appeals': '247dea129da15c952b7ff9dae0dfd3644da535938f10c5790f2aee664cfe17ef',
    'content.posts': '4cb3c442f130ffcbd443376ea134a28356e334de2f182e2770b19faf81ab2032',
    'moderation.detector_runs': '719a88b51f005210fce70394b608edc9838eb68e791705888a535ffefd38ee76',
    'trust.provenance_events': '9595e6bf128ca24236ba0e37dbf654c7678d6d65868b89b6e84d0d3bf370b0f1',
    'moderation.cases': 'ab8f6eef3bccc759c7f6cfbe09c2380ac873fc24520200011580c409c5d01b05',
    'social.profiles': '11244b38905b0739dd64d4ed77734ad0f1fdbd51311ef1a3b7dadcdc7fa8a0cd',
    'content.comments': '12393ddd0ae9693203be597a3dc6c1e607b1a80be39a24e8d41bf343bb3d22e2',
    'content.content_declarations': '2f848812ebce5c8b5e75b327f192cf9b4c017e3afad10f5d2fd2fcfa429c56ce',
    'moderation.decisions': '4b5d83049dfab4a4c321eaf0ea6e8b2cea1be7d42b5ce5b73d33ecd955c9c609',
    'social.reactions': '884ba5cf413ba405f1159aeff7a0dac67be1682a5fd3029687f0aefbf8aa2289',
    'system.outbox_events': 'f3dd968e7e9fea26557113e96c0c3db85f7fc510317770845243443bce5f870d',
    'system.consumer_inbox': '45756c0c477d6c515abd342d604efeea8480e030438095f05a71c908c1f3d6f3',
    'system.idempotency_keys': '250fe4c813df009bb622753e805506d36e87b0800b670646528079676c50cb27',
    'social.custom_feed_rules': 'abfc0da2f3fb13b535118f620773fbcc296e040c957b77b372057ff728227a86',
    'editorial.publications': 'd655a61ad534b1b56354a26db9336bab78a68519c0a051fc01a55339463ae65f',
    'feed.user_inbox': 'b9654b0bc2fb8e60af6c0dd9d068b6f81b89e6b658c7a3e619494f96f1f139b0',
    'feed.notifications': '453ff127eb141339f0d7bc90bb8b436f3060030210eaa0af9344f9c45d6ae0df',
  },
};

const functionContracts = {
  '0012_product_integrity_v2.sql': {
    'privacy.reconcile_subject_data_locations(p_subject_id uuid)': 'd0cbeb886b3c149cb4260b8e1c542321bb34ae7583aa9a6c5f6b11332acb3b20',
    'privacy.reconcile_subject_data_locations_pre_integrity_v2(p_subject_id uuid)': '52d9c09564b5a6bfbce569c66ff30399c3fae33ce01e06660d9e116b72611303',
  },
};

const columnContractSql = (label, relation, column, type) => {
  const [schema, table] = relation.split('.');
  return `/* migration-artifact:${label} */
SELECT EXISTS (
  SELECT 1
    FROM pg_attribute attribute
    JOIN pg_class relation_entry ON relation_entry.oid = attribute.attrelid
    JOIN pg_namespace relation_namespace ON relation_namespace.oid = relation_entry.relnamespace
   WHERE relation_namespace.nspname = '${schema}'
     AND relation_entry.relname = '${table}'
     AND attribute.attname = '${column}'
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
     AND format_type(attribute.atttypid, attribute.atttypmod) = '${type}'
) AS present`;
};

const columnContracts = {
  '0010_native_runtime_parity.sql': [
    ['feed.notifications', 'dismissed_at', 'timestamp with time zone'],
  ],
};

const relationContractSql = (label, relation, fingerprint) => `/* migration-artifact:${label} */
WITH resolved AS (
  SELECT to_regclass('${relation}') AS relation_oid
), contract AS (
  SELECT jsonb_build_object(
    'columns', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', attribute.attname, 'type', format_type(attribute.atttypid, attribute.atttypmod), 'notNull', attribute.attnotnull, 'default', pg_get_expr(default_value.adbin, default_value.adrelid)) ORDER BY attribute.attnum) FROM pg_attribute attribute LEFT JOIN pg_attrdef default_value ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum WHERE attribute.attrelid = resolved.relation_oid AND attribute.attnum > 0 AND NOT attribute.attisdropped), '[]'::jsonb),
    'constraints', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', constraint_entry.conname, 'type', constraint_entry.contype, 'validated', constraint_entry.convalidated, 'definition', pg_get_constraintdef(constraint_entry.oid)) ORDER BY constraint_entry.conname) FROM pg_constraint constraint_entry WHERE constraint_entry.conrelid = resolved.relation_oid), '[]'::jsonb),
    'indexes', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', index_relation.relname, 'definition', pg_get_indexdef(index_entry.indexrelid)) ORDER BY index_relation.relname) FROM pg_index index_entry JOIN pg_class index_relation ON index_relation.oid = index_entry.indexrelid WHERE index_entry.indrelid = resolved.relation_oid), '[]'::jsonb)
  ) AS value
  FROM resolved
)
SELECT resolved.relation_oid IS NOT NULL
  AND encode(digest(contract.value::text, 'sha256'), 'hex') = '${fingerprint}' AS present
FROM resolved CROSS JOIN contract`;

const functionContractSql = (label, identity, fingerprint) => {
  const [qualifiedName, argumentsText] = identity.slice(0, -1).split('(');
  const [schema, name] = qualifiedName.split('.');
  return `/* migration-artifact:${label} */
SELECT EXISTS (
  SELECT 1
    FROM pg_proc procedure_entry
    JOIN pg_namespace procedure_namespace ON procedure_namespace.oid = procedure_entry.pronamespace
    JOIN pg_language procedure_language ON procedure_language.oid = procedure_entry.prolang
   WHERE procedure_namespace.nspname = '${schema}'
     AND procedure_entry.proname = '${name}'
     AND pg_get_function_identity_arguments(procedure_entry.oid) = '${argumentsText}'
     AND encode(digest(jsonb_build_object('language', procedure_language.lanname, 'securityDefiner', procedure_entry.prosecdef, 'config', procedure_entry.proconfig, 'definition', pg_get_functiondef(procedure_entry.oid))::text, 'sha256'), 'hex') = '${fingerprint}'
) AS present`;
};

const dataPostconditions = {
  '0011_email_guest_auth_only.sql': [
    ['legacy_auth_flags_removed', "SELECT NOT EXISTS (SELECT 1 FROM system.feature_flags WHERE flag_key LIKE 'auth.%' AND flag_key NOT IN ('auth.email', 'auth.guest')) AS present"],
  ],
  '0012_product_integrity_v2.sql': [
    ['reputation_event_backfill_complete', 'SELECT NOT EXISTS (SELECT 1 FROM trust.reputation_events WHERE impact IS NULL OR effective_at IS NULL) AS present'],
    ['accountability_signals_deduplicated', 'SELECT NOT EXISTS (SELECT 1 FROM trust.accountability_signals GROUP BY user_id, signal_type HAVING count(*) > 1) AS present'],
    ['comment_depth_backfill_complete', 'SELECT NOT EXISTS (SELECT 1 FROM content.comments WHERE parent_id IS NOT NULL AND depth <> 1) AS present'],
    ['unknown_comments_under_review', "SELECT NOT EXISTS (SELECT 1 FROM content.comments WHERE declared_creation_mode = 'unknown' AND moderation_state <> 'under_review') AS present"],
    ['case_source_events_backfilled', 'SELECT NOT EXISTS (SELECT 1 FROM moderation.cases WHERE source_event_id IS NULL OR source_event_id <> id) AS present'],
    ['open_cases_deduplicated', "SELECT NOT EXISTS (SELECT 1 FROM moderation.cases WHERE state = 'open' GROUP BY content_type, content_id HAVING count(*) > 1) AS present"],
    ['open_case_targets_backfilled', `SELECT NOT EXISTS (
      SELECT 1
        FROM moderation.cases current_case
        LEFT JOIN content.posts post
          ON current_case.content_type = 'post' AND current_case.content_id = post.id
        LEFT JOIN content.comments comment
          ON current_case.content_type = 'comment' AND current_case.content_id = comment.id
        LEFT JOIN social.profiles profile
          ON current_case.content_type = 'profile' AND current_case.content_id = profile.user_id
       WHERE current_case.state = 'open'
         AND (
           (current_case.content_type = 'post' AND (post.id IS NULL OR post.moderation_source_event_id IS DISTINCT FROM current_case.source_event_id))
           OR (current_case.content_type = 'comment' AND (comment.id IS NULL OR comment.moderation_source_event_id IS DISTINCT FROM current_case.source_event_id))
           OR (current_case.content_type = 'profile' AND (profile.user_id IS NULL OR profile.moderation_source_event_id IS DISTINCT FROM current_case.source_event_id OR profile.moderation_state <> 'under_review'))
         )
    ) AS present`],
    ['generated_posts_private', "SELECT NOT EXISTS (SELECT 1 FROM content.posts WHERE declared_creation_mode = 'ai_generated' AND (visibility <> 'private' OR moderation_state = 'allowed' OR published_at IS NOT NULL)) AS present"],
    ['declaration_labels_reconciled', "SELECT NOT EXISTS (SELECT 1 FROM content.content_declarations WHERE declared_creation_mode = 'ai_generated' AND (public_label IS DISTINCT FROM 'Under review' OR review_required IS NOT TRUE) OR public_label IS NOT NULL AND public_label NOT IN ('Human-authored', 'AI-assisted', 'Under review')) AS present"],
    ['decision_labels_reconciled', "SELECT NOT EXISTS (SELECT 1 FROM moderation.decisions WHERE public_label IS NOT NULL AND public_label NOT IN ('Human-authored', 'AI-assisted', 'Under review')) AS present"],
    ['reactions_deduplicated', 'SELECT NOT EXISTS (SELECT 1 FROM social.reactions GROUP BY user_id, post_id HAVING count(*) > 1) AS present'],
  ],
};

const contractArtifacts = Object.fromEntries(
  APPROVED_MIGRATIONS.map(({ name }) => [
    name,
    [
      ...Object.entries(relationContracts[name] ?? {}).map(([relation, fingerprint]) => ({
        artifact: `relation:${relation}`,
        kind: 'relation_contract',
        sql: relationContractSql(`relation:${relation}`, relation, fingerprint),
      })),
      ...Object.entries(functionContracts[name] ?? {}).map(([identity, fingerprint]) => ({
        artifact: `function:${identity}`,
        kind: 'function_contract',
        sql: functionContractSql(`function:${identity}`, identity, fingerprint),
      })),
      ...(columnContracts[name] ?? []).map(([relation, column, type]) => ({
        artifact: `column:${relation}.${column}`,
        kind: 'column_contract',
        sql: columnContractSql(`column:${relation}.${column}`, relation, column, type),
      })),
      ...(dataPostconditions[name] ?? []).map(([artifact, sql]) => ({
        artifact: `data:${artifact}`,
        kind: 'data_invariant',
        sql: `/* migration-artifact:data:${artifact} */ ${sql}`,
      })),
    ],
  ]),
);

const artifacts = {
  ...contractArtifacts,
  '0013_marketing_waitlist.sql': [
    { artifact: 'waitlist_table', sql: "SELECT to_regclass('marketing.waitlist_signups') IS NOT NULL AS present" },
    { artifact: 'waitlist_purge_after', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups' AND column_name = 'purge_after') AS present" },
    { artifact: 'waitlist_hold', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups' AND column_name = 'retention_hold') AS present" },
    { artifact: 'waitlist_unique_hmac', sql: "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_signups_email_lookup_hmac_unique' AND contype = 'u') AS present" },
    { artifact: 'waitlist_cursor_index', sql: "SELECT to_regclass('marketing.waitlist_signups_created_cursor_idx') IS NOT NULL AS present" },
    { artifact: 'waitlist_purge_index', sql: "SELECT to_regclass('marketing.waitlist_signups_due_purge_idx') IS NOT NULL AS present" },
    { artifact: 'waitlist_no_plaintext_columns', sql: "SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups' AND column_name IN ('email', 'plain_email', 'raw_ip', 'ip_address', 'user_agent', 'turnstile_token')) AS present" },
  ],
};

export const migrationPostconditions = Object.fromEntries(
  Object.entries(artifacts).map(([name, checks]) => [name, checks.map(({ artifact, kind = 'legacy_probe' }) => ({ artifact, kind }))]),
);

export function classifyArtifacts(results) {
  const present = results.filter((artifact) => artifact.present).length;
  return present === 0 ? 'NOT_APPLIED' : present === results.length ? 'FULLY_APPLIED' : 'PARTIALLY_APPLIED';
}

export function assertCompleteMigrationPostconditions(state) {
  if (state.state === 'FULLY_APPLIED') return;
  const missing = state.artifacts.filter(({ present }) => !present).map(({ artifact }) => artifact);
  throw new Error(`canonical postcondition verification failed for ${state.name}: ${missing.join(', ')}`);
}

export async function classifyMigrationState(client, names = Object.keys(artifacts)) {
  const states = [];
  for (const name of names) {
    const checks = artifacts[name] ?? [];
    const results = [];
    for (const { artifact, sql } of checks) {
      let result;
      try {
        result = await client.query(sql);
      } catch (error) {
        throw new Error(`postcondition query failed for ${name}/${artifact}`, { cause: error });
      }
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
