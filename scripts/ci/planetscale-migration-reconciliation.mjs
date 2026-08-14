import { createHash } from 'node:crypto';
import { APPROVED_MIGRATIONS, expectedMigrationPrefix, loadApprovedMigrations } from './planetscale-migration-manifest.mjs';

// These fingerprints are generated against the canonical PostgreSQL 17 schema after
// applying immutable migrations 0000 through 0013. A relation contract includes every
// live column, constraint and index for relations changed by a migration. This is
// intentionally fail-closed: the registry may only be advanced when the complete
// canonical relation shape exists, not when representative objects happen to exist.
const relationContracts = {
  '0009_cost_budget_enforcement.sql': {
    'system.cost_budget_periods': '382673e445fb05064ae3537e799b82bb6b629d6f6f1430247f2624eba5d472a5',
    'system.cost_budget_reservations': '2a706fc3caa4d84ae88d9a49dc0b287daf208ff4310fa346736fc35ac54b70af',
    'system.cost_usage_events': 'cf29c18c90cf16fe8eade2bf5fc0f2de06748e7b950af960444fecafc8b975b2',
    'system.cost_kill_switches': 'ee2fcd321888473636a534a7062c112afe421416a85af1e45ede47760b7e9429',
  },
  '0010_native_runtime_parity.sql': {
    'identity.user_entitlements': 'ec6a864c23741d5ed0b201f524b7bc9480ac780b8fe9f32f66e584c54fe14bcf',
    'system.rate_limit_windows': '365dc469b609e898bbe606d947224448b60173aff1726434325ab350c97a854d',
    'feed.notification_preferences': 'ed6ab316b4f6ae47506c6ef03952486fff964ffc8631ff367efbe308dc0c5c87',
    'feed.notification_devices': '28c5878755a56371a873dad842fd58ea6b005c6d73095edb06f268219dd19ebb',
    'trust.reward_redemptions': '38b9b98ad0a0415d4067b302c7f77c28a4debbafefcaa10a03bcad5c8eb92a19',
  },
  '0011_email_guest_auth_only.sql': {
    'identity.provider_links': '0ef0ec9fe72bd6b21f38bbd47813f4b3d1ef3b5295cc6de8994ac4fa04118bb1',
    'identity.contact_emails': 'd337208d446fede07efa85ad4da029e59ce5ea8bd2ae72b853fe02f236216f66',
  },
  '0012_product_integrity_v2.sql': {
    'trust.user_activity_events': 'aab198695a4e2af0f8aee319a3631cb07226bd876894119dddbee4b1421dfb8e',
    'trust.reputation_events': 'f43c01ca7482ea8abd31c22ec4a74ac438491530aec775853315989876454490',
    'trust.accountability_signals': '439c2f62d974e19dafc65c17152b3f4b777dcd4f08df47108a474de27e01da22',
    'trust.reputation_profiles': 'aa282107849d1dc8fa5fe26ed0646ece07d5e7c9626f4bcdee1b3969a820048b',
    'moderation.reviewer_qualifications': '34492894447e6055914e2945a873847d7feeba3514233828c23866bd924564af',
    'moderation.appeal_assignments': '1ca21668d8873ce191037f5900ef193773822b2293b83a84b9fa5e5b0d97e2e7',
    'moderation.appeal_review_votes': '56bd22430e9aa40edea84991dbb988c535718575689093477ff8c8925044f941',
    'moderation.appeal_adjudications': '73a6929629f53729575a7438b41442b56654dc2b698a0e66891332250121084e',
    'moderation.appeal_outcomes': '1e87366661045ca38d6245ebd798ceea44b29cb6992bd6bfabe1d4f88779562b',
    'moderation.appeal_outcome_effects': '2e3f891fb1d252dd27351347083e6e9ec28071e197fb7b3096726522f57ba1ba',
    'moderation.appeals': '49b009643ef6cb0ad247edef6b4ed64e2b6fd515b645d8807fd651a679bb62ce',
    'content.posts': 'ef1f4afa8081800f364612af3fffd82b16bd15a7b384c31cc185fb64e71c73e5',
    'moderation.detector_runs': 'be97f0c6deec4b94743e234687293f9e9717cb5b9c5b6f0f21540180476a9309',
    'trust.provenance_events': '6f12bb27aeec9e764389854432242976e3a7a9e9c1ee3589e7299ec86505a5e3',
    'moderation.cases': 'de0d85930570c4fa7a8d348289f65c61feaa5f3ae2a41d5c511939a4f7fec6f3',
    'social.profiles': 'bd8572db9d43f137733126567a137964c9d03ad18fb827fb8ac90f8d68d2df5a',
    'content.comments': '500c88f11889edbeeb7b225be38700a872a0f6ff2ac0fef2efd18f3ca32fcd30',
    'content.content_declarations': '34353544cf73dcada5f6fbb2c0b540b8f3ddc94482444ab6d479a75dd4326a64',
    'moderation.decisions': 'baf84448308cd0dd58ba1959ddc4f9f48d21425952bcba0df78b58fb21215a5d',
    'social.reactions': '24a1e38a53db0b03bd466819b2d6735b39a9119d527afd60a10639d793a976cb',
    'system.outbox_events': 'c08c417543b82058a4fc306dd230d1c2511990730316de03f2bf282131873050',
    'system.consumer_inbox': '64d9d6fa665cb451b7ad74225087865652ab30a4b6740bcb18aea085aa5bc7aa',
    'system.idempotency_keys': 'a79b069554552cc5363afbde2e8ea1ec5b59e17a3c45679d3b75b6e839642fca',
    'social.custom_feed_rules': 'ed331561f4a517985fbdaf5c6e105fcfc8c289b090b2472980b39a998a28c6eb',
    'editorial.publications': '2e09b21bfb49adc772ab9229f89407c2b11dfb24af92a913db86e43a390562f7',
    'feed.user_inbox': 'a45eeb8ee55a1f20a7a08399139a1782d429a66940ddf130ec3c12705e3be5d8',
    'feed.notifications': '9cd3f25830150edb1793d7677f350bc0cdc0c04e46b5e9102944815b322e401d',
  },
};

const approvedMigrationContents = new Map(
  loadApprovedMigrations().migrations.map(({ name, contents }) => [name, contents.toString('utf8')]),
);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeFunctionSource = (value) => value.replace(/\s+/g, ' ').trim();

const canonicalFunctionSourceFingerprint = (migrationName, qualifiedName) => {
  const migration = approvedMigrationContents.get(migrationName);
  if (!migration) throw new Error(`missing canonical migration source for ${migrationName}`);
  const pattern = new RegExp(`CREATE(?: OR REPLACE)? FUNCTION\\s+${escapeRegExp(qualifiedName)}\\s*\\([^)]*\\)[\\s\\S]*?AS\\s+\\$\\$([\\s\\S]*?)\\$\\$;`, 'i');
  const match = migration.match(pattern);
  if (!match?.[1]) throw new Error(`unable to extract canonical function source for ${qualifiedName} from ${migrationName}`);
  return createHash('sha256').update(normalizeFunctionSource(match[1])).digest('hex');
};

const functionContracts = {
  '0012_product_integrity_v2.sql': {
    'privacy.reconcile_subject_data_locations(p_subject_id uuid)': {
      sourceMigration: '0012_product_integrity_v2.sql',
      sourceFunction: 'privacy.reconcile_subject_data_locations',
      returnType: 'integer',
      language: 'plpgsql',
      securityDefiner: true,
      searchPath: ['pg_catalog', 'privacy', 'trust', 'moderation'],
    },
    'privacy.reconcile_subject_data_locations_pre_integrity_v2(p_subject_id uuid)': {
      sourceMigration: '0004_launch_contract.sql',
      sourceFunction: 'privacy.reconcile_subject_data_locations',
      returnType: 'integer',
      language: 'plpgsql',
      securityDefiner: true,
      searchPath: ['pg_catalog', 'privacy', 'identity', 'content', 'social', 'feed', 'moderation', 'trust', 'media', 'editorial'],
    },
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

const functionContractSql = (label, identity, contract) => {
  const [qualifiedName, argumentsText] = identity.slice(0, -1).split('(');
  const [schema, name] = qualifiedName.split('.');
  const sourceFingerprint = canonicalFunctionSourceFingerprint(contract.sourceMigration, contract.sourceFunction);
  const normalizedSearchPath = `search_path=${contract.searchPath.join(',')}`;
  return `/* migration-artifact:${label} */
SELECT EXISTS (
  SELECT 1
    FROM pg_proc procedure_entry
    JOIN pg_namespace procedure_namespace ON procedure_namespace.oid = procedure_entry.pronamespace
    JOIN pg_language procedure_language ON procedure_language.oid = procedure_entry.prolang
   WHERE procedure_namespace.nspname = '${schema}'
     AND procedure_entry.proname = '${name}'
     AND pg_get_function_identity_arguments(procedure_entry.oid) = '${argumentsText}'
     AND pg_get_function_result(procedure_entry.oid) = '${contract.returnType}'
     AND procedure_language.lanname = '${contract.language}'
     AND procedure_entry.prosecdef IS ${contract.securityDefiner ? 'TRUE' : 'FALSE'}
     AND cardinality(COALESCE(procedure_entry.proconfig, ARRAY[]::text[])) = 1
     AND EXISTS (
       SELECT 1
         FROM unnest(COALESCE(procedure_entry.proconfig, ARRAY[]::text[])) setting
        WHERE regexp_replace(setting, '[[:space:]]+', '', 'g') = '${normalizedSearchPath}'
     )
     AND encode(digest(regexp_replace(btrim(procedure_entry.prosrc), '[[:space:]]+', ' ', 'g'), 'sha256'), 'hex') = '${sourceFingerprint}'
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
      ...Object.entries(functionContracts[name] ?? {}).map(([identity, contract]) => ({
        artifact: `function:${identity}`,
        kind: 'function_contract',
        sql: functionContractSql(`function:${identity}`, identity, contract),
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
    { artifact: 'waitlist_table', kind: 'schema_artifact', sql: "SELECT to_regclass('marketing.waitlist_signups') IS NOT NULL AS present" },
    { artifact: 'waitlist_purge_after', kind: 'schema_artifact', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups' AND column_name = 'purge_after') AS present" },
    { artifact: 'waitlist_hold', kind: 'schema_artifact', sql: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups' AND column_name = 'retention_hold') AS present" },
    { artifact: 'waitlist_unique_hmac', kind: 'schema_artifact', sql: "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_signups_email_lookup_hmac_unique' AND contype = 'u') AS present" },
    { artifact: 'waitlist_cursor_index', kind: 'schema_artifact', sql: "SELECT to_regclass('marketing.waitlist_signups_created_cursor_idx') IS NOT NULL AS present" },
    { artifact: 'waitlist_purge_index', kind: 'schema_artifact', sql: "SELECT to_regclass('marketing.waitlist_signups_due_purge_idx') IS NOT NULL AS present" },
    { artifact: 'waitlist_no_plaintext_columns', kind: 'data_invariant', sql: "SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'marketing' AND table_name = 'waitlist_signups' AND column_name IN ('email', 'plain_email', 'raw_ip', 'ip_address', 'user_agent', 'turnstile_token')) AS present" },
  ],
};

export const migrationPostconditions = Object.fromEntries(
  Object.entries(artifacts).map(([name, checks]) => [name, checks.map(({ artifact, kind = 'legacy_probe' }) => ({ artifact, kind }))]),
);

export function classifyArtifacts(results) {
  if (results.length === 0) return 'NOT_APPLIED';
  if (results.every((artifact) => artifact.present)) return 'FULLY_APPLIED';
  const structural = results.filter(({ kind }) => kind !== 'data_invariant');
  if (structural.length > 0 && structural.every((artifact) => !artifact.present)) return 'NOT_APPLIED';
  return 'PARTIALLY_APPLIED';
}

export function assertCompleteMigrationPostconditions(state) {
  if (state.state === 'FULLY_APPLIED') return;
  const missing = state.artifacts.filter(({ present }) => !present).map(({ artifact }) => artifact);
  throw new Error(`canonical postcondition verification failed for ${state.name}: ${missing.join(', ')}`);
}

const missingSchemaArtifactCodes = new Set(['42P01', '42703']);

export async function classifyMigrationState(client, names = Object.keys(artifacts)) {
  const states = [];
  for (const name of names) {
    const checks = artifacts[name] ?? [];
    const results = [];
    for (const { artifact, kind = 'legacy_probe', sql } of checks) {
      let result;
      try {
        result = await client.query(sql);
      } catch (error) {
        if (error && typeof error === 'object' && missingSchemaArtifactCodes.has(error.code)) {
          results.push({ artifact, kind, present: false });
          continue;
        }
        throw new Error(`postcondition query failed for ${name}/${artifact}`, { cause: error });
      }
      results.push({ artifact, kind, present: result.rows[0]?.present === true });
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
