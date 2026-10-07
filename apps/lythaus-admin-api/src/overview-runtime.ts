import { transaction, type DatabaseClient, type HyperdriveBinding } from '@lythaus/db';
import { json } from '@lythaus/observability';
import { uuidv7 } from '@lythaus/security';
import type { AdminActor } from './admin-access-runtime-policy.ts';
import { OVERVIEW_CACHE_SECONDS, OVERVIEW_GAPS, OVERVIEW_ROW_LIMIT, countValue, overviewMetric, overviewScope, unavailableProviderTelemetry, type OverviewMetric, type OverviewScope } from './overview-policy.ts';

interface OverviewEnv { DB_ADMIN_FRESH: HyperdriveBinding }
type Runner = <T>(binding: HyperdriveBinding, work: (client: DatabaseClient) => Promise<T>) => Promise<T>;
export interface OverviewSnapshot extends OverviewScope {
  contractVersion: 'overview-v1';
  timezone: 'UTC';
  sampledAt: string;
  coverage: 'retained_current_state';
  cacheTtlSeconds: number;
  rowLimit: number;
  metrics: Record<string, OverviewMetric>;
  gaps: typeof OVERVIEW_GAPS;
  providers: ReturnType<typeof unavailableProviderTelemetry>;
}
const snapshots = new WeakMap<HyperdriveBinding, Map<string, { at: number; snapshot: OverviewSnapshot }>>();

export const OVERVIEW_AGGREGATE_SQL = `WITH
  sample_posts AS MATERIALIZED (
    SELECT id, author_id, created_at, moderation_state, visibility, deleted_at
    FROM content.posts ORDER BY id DESC LIMIT $5
  ), sample_comments AS MATERIALIZED (
    SELECT id, post_id, author_id, created_at, moderation_state, deleted_at
    FROM content.comments ORDER BY id DESC LIMIT $5
  ), sample_users AS MATERIALIZED (
    SELECT id, status, created_at, deleted_at, is_production_acceptance
    FROM identity.users ORDER BY id DESC LIMIT $5
  ), eligible_posts AS MATERIALIZED (
    SELECT p.id, p.author_id, p.created_at FROM sample_posts p
    JOIN LATERAL (SELECT status, deleted_at, is_production_acceptance FROM identity.users WHERE id = p.author_id LIMIT 1) u ON true
    WHERE p.deleted_at IS NULL AND p.moderation_state = 'allowed' AND p.visibility = 'public'
      AND (SELECT count(*) FROM sample_posts) < $5 AND (SELECT count(*) FROM sample_comments) < $5
      AND p.created_at < $2::timestamptz
      AND u.deleted_at IS NULL AND u.status <> 'deleted' AND NOT u.is_production_acceptance
  ), eligible_comments AS MATERIALIZED (
    SELECT c.id, c.post_id, c.author_id, c.created_at FROM sample_comments c
    JOIN eligible_posts p ON p.id = c.post_id
    JOIN LATERAL (SELECT status, deleted_at, is_production_acceptance FROM identity.users WHERE id = c.author_id LIMIT 1) u ON true
    WHERE c.deleted_at IS NULL AND c.moderation_state = 'allowed'
      AND u.deleted_at IS NULL AND u.status <> 'deleted' AND NOT u.is_production_acceptance
      AND c.created_at < $2::timestamptz
  ), windows AS (
    SELECT 'current' AS window, $1::timestamptz AS since, $2::timestamptz AS until
    UNION ALL SELECT 'previous', $3::timestamptz, $4::timestamptz
  ), retained_users AS MATERIALIZED (
    SELECT u.id, u.created_at, COALESCE(e.subscription_tier, 'free') AS tier
    FROM sample_users u LEFT JOIN LATERAL (SELECT subscription_tier FROM identity.user_entitlements WHERE user_id = u.id LIMIT 1) e ON true
    WHERE u.status <> 'deleted' AND u.deleted_at IS NULL AND NOT u.is_production_acceptance
      AND (SELECT count(*) FROM sample_users) < $5
      AND u.created_at < $2::timestamptz
  )
  SELECT w.window,
    (SELECT count(*) FROM sample_posts) AS post_rows,
    (SELECT count(*) FROM sample_comments) AS comment_rows,
    (SELECT count(*) FROM sample_users) AS user_rows,
    (SELECT count(*) FROM eligible_posts p WHERE p.created_at >= w.since AND p.created_at < w.until) AS posts,
    (SELECT count(*) FROM eligible_comments c WHERE c.created_at >= w.since AND c.created_at < w.until) AS comments,
    (SELECT count(*) FROM eligible_comments c JOIN eligible_posts p ON p.id = c.post_id
      WHERE c.created_at >= w.since AND c.created_at < w.until AND p.created_at >= w.since AND p.created_at < w.until) AS cohort_comments,
    (SELECT count(*) FROM eligible_posts p WHERE p.created_at >= w.since AND p.created_at < w.until
      AND NOT EXISTS (SELECT 1 FROM eligible_comments c WHERE c.post_id = p.id AND c.author_id <> p.author_id AND c.created_at < w.until)) AS unanswered_posts,
    (SELECT count(*) FROM (SELECT p.author_id FROM eligible_posts p WHERE p.created_at >= w.since AND p.created_at < w.until
      UNION SELECT c.author_id FROM eligible_comments c WHERE c.created_at >= w.since AND c.created_at < w.until) contributors) AS unique_contributors,
    (SELECT count(*) FROM retained_users u WHERE u.created_at >= w.since AND u.created_at < w.until) AS new_registrations,
    (SELECT count(*) FROM retained_users WHERE tier = 'free') AS subscriptions_free,
    (SELECT count(*) FROM retained_users WHERE tier = 'premium') AS subscriptions_premium,
    (SELECT count(*) FROM retained_users WHERE tier = 'black') AS subscriptions_black
  FROM windows w`;

const DEFINITIONS = {
  posts: ['content.posts', 'Retained public-visibility allowed post records created in the window; excludes deleted content/accounts and production acceptance accounts. Includes nonactive authors; this is not the full feed publication/eligibility rule. Current stored visibility/status applies to both windows.'],
  comments: ['content.comments + content.posts', 'Retained allowed comments created in the window on posts in this retained population, including posts created earlier; excludes deleted and production acceptance accounts. This is not a feed delivery count.'],
  unansweredPosts: ['content.posts + content.comments', 'Eligible posts created in the window without an eligible comment by another account before that window end. Author self-comments do not answer a post.'],
  uniqueContributors: ['content.posts + content.comments', 'Distinct author IDs across eligible posts and comments created in the window. Posting/commenting is the activity definition; this is not all app users.'],
  newRegistrations: ['identity.users.created_at', 'Retained registered identity records created in the window across all nondeleted statuses, excluding production acceptance accounts. Includes precreated invitations and relink-required records, not necessarily completed or verified signups. Guests and waitlist signups are separate.'],
} as const;

export function overviewSnapshot(scope: OverviewScope, rows: Record<string, unknown>[]): OverviewSnapshot {
  const current = rows.find(row => row.window === 'current'), previous = rows.find(row => row.window === 'previous');
  if (!current || !previous) throw new Error('overview_unavailable');
  const bounded = (key: string) => {
    const total = countValue(current[key]);
    return total !== null && total <= OVERVIEW_ROW_LIMIT;
  };
  const contentAvailable = bounded('post_rows') && bounded('comment_rows');
  const accountsAvailable = bounded('user_rows');
  const metrics: Record<string, OverviewMetric> = {};
  const fields = { posts: 'posts', comments: 'comments', unansweredPosts: 'unanswered_posts', uniqueContributors: 'unique_contributors', newRegistrations: 'new_registrations' };
  for (const [key, field] of Object.entries(fields)) {
    const available = key === 'newRegistrations' ? accountsAvailable : contentAvailable;
    const [source, definition] = DEFINITIONS[key as keyof typeof DEFINITIONS];
    metrics[key] = overviewMetric(available ? countValue(current[field]) : null, available && scope.comparable ? countValue(previous[field]) : null,
      source, definition, available ? 'source_unavailable' : 'snapshot_row_limit');
  }
  const ratio = (row: Record<string, unknown>) => {
    const denominator = countValue(row.posts), numerator = countValue(row.cohort_comments);
    return denominator !== null && denominator > 0 && numerator !== null ? numerator / denominator : null;
  };
  metrics.commentsPerPost = overviewMetric(contentAvailable ? ratio(current) : null, contentAvailable && scope.comparable ? ratio(previous) : null,
    'content.posts + content.comments', 'Eligible comments created in the window on eligible posts created in that same window, divided by those posts. Empty post cohort is unavailable.',
    contentAvailable ? 'empty_or_unavailable_post_cohort' : 'snapshot_row_limit', 'ratio');
  for (const tier of ['free', 'premium', 'black']) {
    metrics[`subscriptions${tier[0].toUpperCase()}${tier.slice(1)}`] = overviewMetric(accountsAvailable ? countValue(current[`subscriptions_${tier}`]) : null, null,
      'identity.users + identity.user_entitlements', `Current ${tier} entitlements for retained registered accounts across all nondeleted statuses, excluding production acceptance accounts. Missing entitlement means free by the runtime contract; this does not prove payment. No historical tier snapshot.`,
      accountsAvailable ? 'source_unavailable' : 'snapshot_row_limit');
  }
  return { ...scope, contractVersion: 'overview-v1', timezone: 'UTC', sampledAt: scope.current.end, coverage: 'retained_current_state',
    cacheTtlSeconds: OVERVIEW_CACHE_SECONDS, rowLimit: OVERVIEW_ROW_LIMIT, metrics, gaps: OVERVIEW_GAPS, providers: unavailableProviderTelemetry() };
}

export async function handleOverview(request: Request, env: OverviewEnv, actor: AdminActor, correlation: string, run: Runner = transaction, now = Date.now()): Promise<Response> {
  if (actor.role !== 'owner') throw new Error('overview_owner_required');
  const url = new URL(request.url);
  let invalid = false;
  url.searchParams.forEach((_value, key) => { if (key !== 'period') invalid = true; });
  if (invalid || url.searchParams.getAll('period').length > 1) throw new Error('overview_invalid_period');
  const period = url.searchParams.get('period') ?? 'today';
  overviewScope(period, new Date(now));
  try {
    const snapshot = await run(env.DB_ADMIN_FRESH, async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await client.query("SET LOCAL statement_timeout = '1500ms'");
      const owner = await client.query<{ sampled_at: Date | string }>(`SELECT current_timestamp AS sampled_at
        FROM identity.admin_memberships a JOIN identity.users u ON u.id = a.user_id
        WHERE a.user_id = $1 AND a.role = 'owner' AND a.active = true AND u.status = 'active' AND u.deleted_at IS NULL`, [actor.userId]);
      if (owner.rowCount !== 1) throw new Error('overview_owner_required');
      const scope = overviewScope(period, new Date(owner.rows[0].sampled_at));
      const cache = snapshots.get(env.DB_ADMIN_FRESH) ?? new Map();
      const cached = cache.get(period);
      const sampleAge = cached ? Date.parse(scope.current.end) - Date.parse(cached.snapshot.sampledAt) : NaN;
      const useCache = cached && now >= cached.at && now - cached.at < OVERVIEW_CACHE_SECONDS * 1000
        && sampleAge >= 0 && sampleAge < OVERVIEW_CACHE_SECONDS * 1000 && cached.snapshot.current.start === scope.current.start;
      const result = useCache ? cached.snapshot : overviewSnapshot(scope, (await client.query(OVERVIEW_AGGREGATE_SQL,
        [scope.current.start, scope.current.end, scope.previous.start, scope.previous.end, OVERVIEW_ROW_LIMIT + 1])).rows);
      const audit = await client.query(`INSERT INTO system.audit_events (id, actor_id, action, target_type, reason_code, correlation_id, metadata)
        VALUES ($1, $2, 'operations.overview_viewed', 'aggregate_snapshot', 'OVERVIEW_VIEW', $3, $4::jsonb)`,
        [uuidv7(), actor.userId, correlation, JSON.stringify({ period, sampledAt: result.sampledAt, cached: Boolean(useCache), coverage: result.coverage })]);
      if (audit.rowCount !== 1) throw new Error('overview_unavailable');
      return { result, cache, fresh: !useCache };
    });
    if (snapshot.fresh) { snapshot.cache.set(period, { at: now, snapshot: snapshot.result }); snapshots.set(env.DB_ADMIN_FRESH, snapshot.cache); }
    return json({ ...snapshot.result, correlationId: correlation }, { headers: { 'cache-control': 'private, no-store', 'vary': 'Origin, Authorization, Cf-Access-Jwt-Assertion', 'x-correlation-id': correlation } });
  } catch (error) {
    if (error instanceof Error && error.message === 'overview_owner_required') throw error;
    throw new Error('overview_unavailable');
  }
}
