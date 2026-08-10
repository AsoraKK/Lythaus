import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const publicApi = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/index.ts'), 'utf8');
const adminApi = fs.readFileSync(path.join(root, 'apps/lythaus-admin-api/src/index.ts'), 'utf8');
const jobs = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/src/index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'database/planetscale/migrations/0012_product_integrity_v2.sql'), 'utf8');
const feedRead = fs.readFileSync(path.join(root, 'load/k6/feed-read.js'), 'utf8');
const alphaFeedMatrix = fs.readFileSync(path.join(root, 'load/k6/alpha-feed-matrix.js'), 'utf8');

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `missing ${start}`);
  assert.notEqual(endIndex, -1, `missing ${end}`);
  return source.slice(startIndex, endIndex);
}

test('authenticated and personalized API responses are private while cacheable views have explicit anonymous branches', () => {
  assert.match(publicApi, /function privateResponse[\s\S]*?cache-control', 'private, no-store'/);
  assert.match(publicApi, /result\.headers\.set\('vary', 'Origin, Authorization'\)/);

  const discovery = between(publicApi, 'async function discoveryFeed', 'async function notifications');
  assert.match(discovery, /if \(viewer\) return privateResponse\(request, env, body\)/);
  assert.match(discovery, /output\.headers\.set\('cache-control', 'public, s-maxage=30, stale-while-revalidate=60'\)/);

  const post = between(publicApi, 'async function getPost', 'async function getComments');
  assert.match(post, /viewer \? privateResponse\(request, env, \{ post: result\.rows\[0\] \}\) : response/);
  assert.match(post, /if \(!viewer\) output\.headers\.set\('cache-control', 'public, max-age=15, s-maxage=15'\)/);

  const comments = between(publicApi, 'async function getComments', 'export default');
  assert.match(comments, /viewer\s*\? privateResponse/);
  assert.match(comments, /if \(!viewer\) output\.headers\.set\('cache-control', 'public, max-age=10, s-maxage=10'\)/);

  for (const [start, end] of [
    ['async function getPersonalFeed', 'async function getPost'],
    ['async function customFeedItems', 'async function getEntitlements'],
    ['async function notifications', 'async function notificationAction'],
    ['async function reputationLedger', 'async function activityLog'],
    ['async function activityLog', 'async function rewardsSnapshot'],
  ]) {
    assert.match(between(publicApi, start, end), /return privateResponse\(request, env/);
  }
});

test('all feed projections enforce publication state, relationship privacy, and declaration visibility', () => {
  const discovery = between(publicApi, 'async function discoveryFeed', 'async function notifications');
  const custom = between(publicApi, 'async function customFeedItems', 'async function getEntitlements');
  const personal = between(publicApi, 'async function getPersonalFeed', 'async function getPost');
  const post = between(publicApi, 'async function getPost', 'async function getComments');
  const comments = between(publicApi, 'async function getComments', 'export default');

  for (const feed of [discovery, custom]) {
    assert.match(feed, /p\.visibility = 'public'/);
    assert.match(feed, /p\.moderation_state = 'allowed'/);
    assert.match(feed, /p\.deleted_at IS NULL/);
    assert.match(feed, /declaration\.public_label IN \('Human-authored', 'AI-assisted'\)/);
    assert.match(feed, /social\.blocks/);
    assert.match(feed, /social\.mutes/);
  }

  assert.match(personal, /p\.deleted_at IS NULL AND p\.moderation_state = 'allowed'/);
  assert.match(personal, /p\.visibility = 'public' OR p\.author_id = \$1 OR \(p\.visibility = 'followers'/);
  assert.match(personal, /declaration\.public_label IN \('Human-authored', 'AI-assisted'\)/);
  assert.match(personal, /social\.blocks/);
  assert.match(personal, /social\.mutes/);

  assert.match(post, /p\.deleted_at IS NULL AND p\.moderation_state = 'allowed'/);
  assert.match(post, /p\.visibility = 'public' OR p\.author_id = \$2 OR \(p\.visibility = 'followers'/);
  assert.match(post, /social\.blocks/);

  assert.match(comments, /comment\.moderation_state = 'allowed'/);
  assert.match(comments, /post\.deleted_at IS NULL AND post\.moderation_state = 'allowed'/);
  assert.match(comments, /post\.visibility = 'public' OR post\.author_id = \$2 OR \(post\.visibility = 'followers'/);
  assert.match(comments, /social\.blocks/);
  assert.match(comments, /social\.mutes/);
});

test('idempotent mutations bind a claim to actor, request fingerprint, and a bounded stale-claim recovery path', () => {
  const helper = between(publicApi, 'async function idempotencyRequestHash', 'async function createPost');
  assert.match(helper, /await request\.clone\(\)\.text\(\)/);
  assert.match(helper, /request\.method\.toUpperCase\(\)/);
  assert.match(helper, /\$\{url\.pathname\}\$\{url\.search\}/);
  assert.match(helper, /request\.headers\.get\('content-type'\)/);
  assert.match(helper, /sha256Hex/);
  assert.match(helper, /ON CONFLICT \(scope, key\) DO NOTHING/);
  assert.match(helper, /record\.actor_id !== actorId/);
  assert.match(helper, /record\.response\.requestHash !== requestHash/);
  assert.match(helper, /response ->> 'state' = 'processing'/);
  assert.match(helper, /created_at < now\(\) - interval '5 minutes'/);
  assert.match(helper, /state: 'completed', requestHash, status: result\.status, body/);
  assert.match(helper, /return privateResponse\(request, env, record\.response\.body/);
  assert.match(helper, /DELETE FROM system\.idempotency_keys WHERE scope = \$1 AND key = \$2 AND actor_id = \$3/);

  for (const scope of [
    'post.create', 'comment.create', 'custom-feed.create', 'follow.create', 'block.create',
    'mute.create', 'bookmark.create', 'reaction.create', 'flag.create', 'appeal.create',
    'appeal.vote', 'privacy.request.create', 'media.upload.finalise',
  ]) {
    assert.match(publicApi, new RegExp(`idempotentMutation\\(request, env, user\\.userId, '${scope.replace('.', '\\.')}'`));
  }
});

test('daily, relationship, and export throttles are enforced at their mutation boundaries', () => {
  const daily = between(publicApi, 'async function enforceDailyAction', 'async function enforceRelationshipChangeLimit');
  const relationship = between(publicApi, 'async function enforceRelationshipChangeLimit', 'function requireAuthSecrets');
  const upload = between(publicApi, 'async function createUploadSession', 'async function finaliseUpload');
  const follow = between(publicApi, 'async function createFollow', 'async function followStatus');
  const unfollow = between(publicApi, 'async function removeFollow', 'async function setBlock');
  const flag = between(publicApi, 'async function createFlag', 'async function createAppeal');
  const privacy = between(publicApi, 'async function createPrivacyRequest', 'async function getPrivacyRequestStatus');

  assert.match(daily, /action: 'post' \| 'comment' \| 'reaction' \| 'appeal' \| 'flag' \| 'media'/);
  assert.match(daily, /dailyFlags/);
  assert.match(daily, /dailyMediaUploads/);
  assert.match(daily, /throw new Error\(`\$\{action\}_daily_limit_reached`\)/);
  assert.match(upload, /await enforceDailyAction\(env, user\.userId, 'media'\)/);
  assert.match(flag, /await enforceDailyAction\(env, user\.userId, 'flag'\)/);

  assert.match(relationship, /maxFollowStateChangesPerRelationshipPerDay/);
  assert.match(relationship, /throw new Error\('relationship_change_limit_reached'\)/);
  assert.match(follow, /await enforceRelationshipChangeLimit\(client, user\.userId, targetUserId\)/);
  assert.match(unfollow, /await enforceRelationshipChangeLimit\(client, user\.userId, followedId\)/);

  assert.match(privacy, /PLATFORM_SAFETY_LIMITS\.exportCooldownDays/);
  assert.match(privacy, /throw new Error\('export_cooldown_active'\)/);
  assert.match(publicApi, /\^\(post\|comment\|reaction\|appeal\|flag\|media\)_daily_limit_reached\$/);
  for (const errorCode of ['relationship_change_limit_reached', 'export_cooldown_active']) {
    assert.match(publicApi, new RegExp(`'${errorCode}'`));
  }
});

test('DSR export and deletion account for activity, reputation, appeal, and notification-device records', () => {
  const deletion = between(jobs, 'export class AccountDeleteWorkflow', 'export class AccountExportWorkflow');
  const exportWorkflow = between(jobs, 'export class AccountExportWorkflow', 'export class RetentionCleanupWorkflow');
  const locator = between(migration, 'CREATE FUNCTION privacy.reconcile_subject_data_locations', 'REVOKE ALL ON FUNCTION privacy.reconcile_subject_data_locations_pre_integrity_v2');

  for (const relation of [
    'trust.user_activity_events',
    'trust.reputation_profiles',
    'trust.accountability_signals',
    'feed.notification_preferences',
    'feed.notification_devices',
  ]) {
    assert.match(deletion, new RegExp(`DELETE FROM ${relation.replace('.', '\\.')}`));
  }
  assert.match(deletion, /UPDATE system\.outbox_events SET actor_id = NULL, payload = '\{\}'::jsonb WHERE actor_id = \$1/);
  assert.match(deletion, /privacy\.reconcile_subject_data_locations\(\$1\)/);

  for (const relation of [
    'trust.user_activity_events',
    'trust.reputation_events',
    'trust.reputation_profiles',
    'moderation.appeals',
    'moderation.appeal_assignments',
    'moderation.appeal_review_votes',
    'moderation.appeal_adjudications',
    'moderation.appeal_outcomes',
    'moderation.appeal_outcome_effects',
    'feed.notification_preferences',
    'feed.notification_devices',
  ]) {
    assert.match(exportWorkflow, new RegExp(`FROM ${relation.replace('.', '\\.')}`));
  }

  for (const relation of [
    'trust.accountability_signals',
    'feed.notification_preferences',
    'feed.notification_devices',
  ]) {
    assert.match(locator, new RegExp(relation.replace('.', '\\.')));
  }
});

test('private accountability names are encrypted before persistence and never copied into activity or outbox payloads', () => {
  const profile = between(publicApi, 'async function updateProfile', 'async function assertSocialInteractionAllowed');
  assert.match(profile, /await encryptField\(JSON\.stringify\(\{ accountabilityName \}\), env\.PII_ENCRYPTION_KEY_V1!, 'v1'\)/);
  assert.match(profile, /JSON\.stringify\(\{ userId: user\.userId \}\)/);
  assert.match(profile, /metadata: \{ changedField: 'accountability_name' \}/);
  assert.doesNotMatch(profile, /logEvent\([\s\S]*accountabilityName/);
  assert.doesNotMatch(profile, /metadata:\s*\{[^}]*accountabilityName/);
  assert.doesNotMatch(profile, /JSON\.stringify\(\{[^}]*accountabilityName[^}]*\}\)(?!, env\.PII_ENCRYPTION_KEY_V1!)/);
});

test('feed p95 launch thresholds are strict and cannot be relaxed through environment input', () => {
  assert.doesNotMatch(feedRead, /FEED_READ_P95_THRESHOLD/);
  assert.equal((feedRead.match(/'p\(95\)<200'/g) ?? []).length, 2);
  assert.match(feedRead, /FEED_READ_P99_THRESHOLD/);
  assert.equal((alphaFeedMatrix.match(/'p\(95\)<200'/g) ?? []).length, 1);
  assert.match(alphaFeedMatrix, /thresholds\[`alpha_feed_latency\{feed_scenario:\$\{scenario\}\}`\] = \['p\(95\)<200'/);
});

test('Workers fail closed and retain retryable outbox/queue failure paths', () => {
  const queueConsumer = between(jobs, 'async function processMessage', 'function queueForEvent');
  const relay = between(jobs, 'async function relayOutbox', 'interface AdminOutcomeNotification');
  assert.doesNotMatch(publicApi, /passThroughOnException/);
  assert.match(publicApi, /catch \(error\) \{[\s\S]*logEvent\(\{\s*service: 'lythaus-public-api'/);
  assert.match(publicApi, /const exposedCode = expected \? internalCode : 'request_failed'/);
  assert.match(adminApi, /const exposedCode = ADMIN_ERROR_CODES\.has\(internalCode\) \? internalCode : 'admin_request_failed'/);
  assert.match(adminApi, /catch \(error\) \{[\s\S]*internalErrorCode: classified\.internalCode/);
  assert.match(queueConsumer, /DELETE FROM system\.consumer_inbox/);
  assert.match(queueConsumer, /throw error/);
  assert.match(jobs, /message\.retry\(\)/);
  assert.match(relay, /FOR UPDATE SKIP LOCKED/);
  assert.match(relay, /attempted_at IS NULL OR attempted_at < now\(\) - interval '5 minutes'/);
  assert.match(relay, /last_error_code/);
});
