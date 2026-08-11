import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const publicApi = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/index.ts'), 'utf8');
const authRuntimePolicy = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/auth-runtime-policy.ts'), 'utf8');
const contentRuntimePolicy = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/content-runtime-policy.ts'), 'utf8');
const privacyRuntimePolicy = fs.readFileSync(path.join(root, 'apps/lythaus-public-api/src/privacy-runtime-policy.ts'), 'utf8');
const adminApi = fs.readFileSync(path.join(root, 'apps/lythaus-admin-api/src/index.ts'), 'utf8');
const jobs = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/src/index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'database/planetscale/migrations/0012_product_integrity_v2.sql'), 'utf8');
const roles = fs.readFileSync(path.join(root, 'database/planetscale/grants/roles.sql'), 'utf8');
const feedRead = fs.readFileSync(path.join(root, 'load/k6/feed-read.js'), 'utf8');
const alphaFeedMatrix = fs.readFileSync(path.join(root, 'load/k6/alpha-feed-matrix.js'), 'utf8');
const activityCatalogue = JSON.parse(fs.readFileSync(path.join(root, 'docs/contracts/activity-event-catalogue-v1.json'), 'utf8'));

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
  const feedResponse = between(publicApi, 'function feedResponse', 'interface FeedResponseCandidate');
  assert.match(feedResponse, /feedResponsePlan\(surface, hasViewer\)/);
  assert.match(feedResponse, /plan\.privateResponse \? privateResponse\(request, env, body\) : response\(request, env, body\)/);
  assert.match(feedResponse, /result\.headers\.set\('cache-control', plan\.cacheControl\)/);

  const discovery = between(publicApi, 'async function discoveryFeed', 'async function notifications');
  assert.match(discovery, /feedResponse\(request, env, body, 'discovery', Boolean\(viewer\)\)/);

  const post = between(publicApi, 'async function getPost', 'async function getComments');
  assert.match(post, /feedResponse\(request, env, \{ post: presentFeedItems\(result\.rows\)\[0\] \}, 'post', Boolean\(viewer\)\)/);

  const comments = between(publicApi, 'async function getComments', 'export default');
  assert.match(comments, /feedResponse\(request, env,[\s\S]*'comments', Boolean\(viewer\)\)/);

  for (const [start, end] of [
    ['async function notifications', 'async function notificationAction'],
    ['async function reputationLedger', 'async function activityLog'],
    ['async function activityLog', 'async function rewardsSnapshot'],
  ]) {
    assert.match(between(publicApi, start, end), /return privateResponse\(request, env/);
  }
  assert.match(between(publicApi, 'async function getPersonalFeed', 'async function getPost'), /feedResponse\(request, env,[\s\S]*'personal', true\)/);
  assert.match(between(publicApi, 'async function customFeedItems', 'async function getEntitlements'), /feedResponse\(request, env,[\s\S]*'custom', true\)/);
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
    assert.match(feed, /"reactionCounts"/);
    assert.match(feed, /"viewerReaction"/);
  }

  assert.match(personal, /p\.deleted_at IS NULL AND p\.moderation_state = 'allowed'/);
  assert.match(personal, /p\.visibility = 'public' OR p\.author_id = \$1 OR \(p\.visibility = 'followers'/);
  assert.match(personal, /declaration\.public_label IN \('Human-authored', 'AI-assisted'\)/);
  assert.match(personal, /social\.blocks/);
  assert.match(personal, /social\.mutes/);
  assert.match(personal, /"reactionCounts"/);
  assert.match(personal, /"viewerReaction"/);

  assert.match(post, /p\.deleted_at IS NULL AND p\.moderation_state = 'allowed'/);
  assert.match(post, /p\.visibility = 'public' OR p\.author_id = \$2 OR \(p\.visibility = 'followers'/);
  assert.match(post, /social\.blocks/);
  assert.match(post, /"reactionCounts"/);
  assert.match(post, /"viewerReaction"/);

  assert.match(comments, /comment\.moderation_state = 'allowed'/);
  assert.match(comments, /post\.deleted_at IS NULL AND post\.moderation_state = 'allowed'/);
  assert.match(comments, /post\.visibility = 'public' OR post\.author_id = \$2 OR \(post\.visibility = 'followers'/);
  assert.match(comments, /social\.blocks/);
  assert.match(comments, /social\.mutes/);
});

test('public profiles expose only active, visible, allowed profile revisions', () => {
  const profile = between(publicApi, 'async function getUserProfile', 'async function getUserInfo');
  assert.match(profile, /u\.status = 'active'/);
  assert.match(profile, /\$3::boolean OR \(COALESCE\(p\.moderation_state, 'allowed'\) = 'allowed' AND COALESCE\(p\.public_visibility, true\)\)/);
});

test('idempotency replay records bind a claim and fail closed on stale or ambiguous outcomes', () => {
  const helper = between(publicApi, 'async function idempotencyRequestHash', 'async function createPost');
  assert.match(helper, /await request\.clone\(\)\.text\(\)/);
  assert.match(helper, /if \(requiredKey\) throw new Error\('idempotency_key_required'\)/);
  assert.match(helper, /request\.method\.toUpperCase\(\)/);
  assert.match(helper, /\$\{url\.pathname\}\$\{url\.search\}/);
  assert.match(helper, /request\.headers\.get\('content-type'\)/);
  assert.match(helper, /sha256Hex/);
  assert.match(helper, /ON CONFLICT \(scope, key\) DO NOTHING/);
  assert.match(helper, /planExistingIdempotencyRecord\(\{/);
  assert.match(helper, /record: record \? \{ actorId: record\.actor_id, response: record\.response, createdAt: record\.created_at \} : undefined/);
  assert.match(helper, /actorId,[\s\S]*requestHash/);
  assert.match(helper, /state: 'outcome_unknown', requestHash/);
  assert.match(helper, /response ->> 'state' = 'processing'/);
  assert.match(helper, /created_at < now\(\) - interval '5 minutes'/);
  assert.match(helper, /state: 'completed', requestHash, status: result\.status, body/);
  assert.match(helper, /return privateResponse\(request, env, plan\.body, \{ status: plan\.status \}\)/);
  assert.match(authRuntimePolicy, /record\.response\.state === 'completed'/);
  assert.match(authRuntimePolicy, /record\.response\.state === 'outcome_unknown'/);
  assert.match(authRuntimePolicy, /action: 'quarantine'/);
  assert.match(authRuntimePolicy, /action: 'replay', status: record\.response\.status \?\? 200, body: record\.response\.body \?\? null/);
  assert.doesNotMatch(helper, /DELETE FROM system\.idempotency_keys/);
  assert.match(publicApi, /runClaimedIdempotentWork\(\{/);
  assert.match(helper, /finalized\.rowCount !== 1/);
  assert.match(helper, /response ->> 'requestHash' = \$5/);

  for (const scope of [
    'post.create', 'comment.create', 'custom-feed.create', 'follow.create', 'block.create',
    'mute.create', 'bookmark.create', 'reaction.create', 'flag.create', 'appeal.create',
    'appeal.vote', 'privacy.request.create', 'media.upload.finalise', 'reward.redeem',
  ]) {
    assert.match(publicApi, new RegExp(`idempotentMutation\\(request, env, user\\.userId, '${scope.replace('.', '\\.')}'`));
  }
  for (const requiredScope of ['post.delete', 'appeal.vote', 'appeal.recuse', 'region.update', 'retention.update']) {
    assert.match(publicApi, new RegExp(`idempotentMutation\\(request, env, user\\.userId, '${requiredScope.replace('.', '\\.')}'[\\s\\S]{0,180}, true\\)`));
  }
  assert.match(publicApi, /'post\.update'[\s\S]{0,180}, request\.method === 'PUT'\)/);
  assert.match(publicApi, /`notification\.preferences\.\$\{request\.method\.toLowerCase\(\)\}`[\s\S]*notificationPreferences\(request, env, user\)/);
});

test('runtime appeal vote and recusal state transitions have only the required column grants', () => {
  const vote = between(publicApi, 'async function submitAppealVote', 'async function recuseAppealReview');
  const recusal = between(publicApi, 'async function recuseAppealReview', 'async function reviewerAssignments');
  assert.match(vote, /UPDATE moderation\.appeal_assignments SET state = 'voted'/);
  assert.match(recusal, /UPDATE moderation\.appeal_assignments SET state = 'recused', recused_at = now\(\)/);
  assert.match(roles, /GRANT UPDATE \(state, recused_at\) ON moderation\.appeal_assignments TO lythaus_runtime;/);
  assert.doesNotMatch(roles, /GRANT UPDATE ON moderation\.appeal_assignments TO lythaus_runtime;/);
});

test('locked appeal votes and adjudications remain append-only for application roles', () => {
  assert.doesNotMatch(
    roles,
    /GRANT[^;]*UPDATE[^;]*moderation\.appeal_review_votes[^;]*TO lythaus_(?:runtime|admin|jobs);/,
  );
  assert.doesNotMatch(
    roles,
    /GRANT[^;]*UPDATE[^;]*moderation\.appeal_adjudications[^;]*TO lythaus_(?:runtime|admin|jobs);/,
  );
  assert.match(roles, /GRANT SELECT, INSERT ON moderation\.appeal_review_votes TO lythaus_runtime;/);
  assert.match(
    roles,
    /GRANT SELECT, INSERT ON moderation\.appeal_adjudications, moderation\.appeal_outcome_effects TO lythaus_admin;/,
  );
});

test('daily, relationship, and export throttles are enforced at their mutation boundaries', () => {
  const daily = between(publicApi, 'async function enforceDailyAction', 'async function enforceRelationshipChangeLimit');
  const relationship = between(publicApi, 'async function enforceRelationshipChangeLimit', 'function hashConfiguredPassword');
  const upload = between(publicApi, 'async function createUploadSession', 'async function finaliseUpload');
  const follow = between(publicApi, 'async function createFollow', 'async function followStatus');
  const unfollow = between(publicApi, 'async function removeFollow', 'async function setBlock');
  const flag = between(publicApi, 'async function createFlag', 'async function createAppeal');
  const privacy = between(publicApi, 'async function createPrivacyRequest', 'async function getPrivacyRequestStatus');

  assert.match(daily, /action: 'post' \| 'comment' \| 'reaction' \| 'appeal' \| 'flag' \| 'media'/);
  assert.match(daily, /dailyFlags/);
  assert.match(daily, /dailyMediaUploads/);
  assert.match(daily, /INSERT INTO system\.rate_limit_windows/);
  assert.match(daily, /ON CONFLICT \(scope, subject_hash, window_started_at\)/);
  assert.match(daily, /WHERE system\.rate_limit_windows\.request_count < \$3/);
  assert.match(daily, /throw new Error\(`\$\{action\}_daily_limit_reached`\)/);
  assert.match(upload, /await enforceDailyAction\(env, user\.userId, 'media'\)/);
  assert.match(flag, /await enforceDailyAction\(env, user\.userId, 'flag'\)/);
  const createComment = between(publicApi, 'async function createComment', 'async function updatePost');
  assert.match(createComment, /parent\.moderation_state = 'allowed'/);
  assert.match(createComment, /social\.blocks/);
  assert.match(createComment, /social\.mutes/);

  assert.match(relationship, /maxFollowStateChangesPerRelationshipPerDay/);
  assert.match(relationship, /throw new Error\('relationship_change_limit_reached'\)/);
  assert.match(follow, /await enforceRelationshipChangeLimit\(client, user\.userId, targetUserId\)/);
  assert.match(unfollow, /await enforceRelationshipChangeLimit\(client, user\.userId, followedId\)/);

  assert.match(privacy, /PLATFORM_SAFETY_LIMITS\.exportCooldownDays/);
  assert.match(privacy, /throw new Error\('export_cooldown_active'\)/);
  assert.match(privacy, /state IN \('received', 'processing', 'blocked'\)/);
  assert.match(privacy, /throw new Error\('privacy_request_active'\)/);
  assert.match(authRuntimePolicy, /\^\(post\|comment\|reaction\|appeal\|flag\|media\)_daily_limit_reached\$/);
  for (const errorCode of ['relationship_change_limit_reached', 'export_cooldown_active', 'privacy_request_active']) {
    assert.match(publicApi, new RegExp(`'${errorCode}'`));
  }
});

test('runtime roles can atomically enforce rate limits and complete idempotency records', () => {
  assert.match(
    roles,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON system\.idempotency_keys TO lythaus_runtime;/,
  );
  assert.match(
    roles,
    /GRANT SELECT, INSERT, UPDATE ON system\.rate_limit_windows TO lythaus_runtime;/,
  );
  assert.match(
    roles,
    /GRANT SELECT, INSERT, UPDATE ON system\.rate_limit_windows TO lythaus_admin;/,
  );
});

test('DSR export and deletion account for activity, reputation, appeal, and notification-device records', () => {
  const deletion = between(jobs, 'export class AccountDeleteWorkflow', 'export class AccountExportWorkflow');
  const exportWorkflow = between(jobs, 'export class AccountExportWorkflow', 'export class RetentionCleanupWorkflow');
  const retentionWorkflow = between(jobs, 'export class RetentionCleanupWorkflow', 'export class AppealLifecycleWorkflow');
  const locator = between(migration, 'CREATE FUNCTION privacy.reconcile_subject_data_locations', 'REVOKE ALL ON FUNCTION privacy.reconcile_subject_data_locations_pre_integrity_v2');

  for (const relation of [
    'trust.user_activity_events',
    'trust.reputation_profiles',
    'trust.reward_redemptions',
    'identity.user_entitlements',
    'trust.accountability_signals',
    'feed.notification_preferences',
    'feed.notification_devices',
  ]) {
    assert.match(deletion, new RegExp(`DELETE FROM ${relation.replace('.', '\\.')}`));
  }
  assert.match(deletion, /DELETE FROM system\.consumer_inbox[\s\S]*jsonb_path_exists[\s\S]*'\$\.\*\* \? \(@ == \$subject\)'/);
  assert.match(deletion, /UPDATE system\.outbox_events[\s\S]*SET actor_id = NULL, payload = '\{\}'::jsonb[\s\S]*aggregate_id = \$1[\s\S]*jsonb_path_exists/);
  assert.match(deletion, /UPDATE moderation\.cases moderation_case[\s\S]*content_type = 'profile'[\s\S]*content_type = 'post'[\s\S]*content_type = 'comment'/);
  assert.match(deletion, /privacy\.reconcile_subject_data_locations\(\$1\)/);

  for (const relation of [
    'trust.user_activity_events',
    'trust.reputation_events',
    'trust.reputation_profiles',
    'trust.reward_redemptions',
    'identity.user_entitlements',
    'identity.contact_emails',
    'identity.consent_records',
    'identity.account_events',
    'social.reactions',
    'social.blocks',
    'social.mutes',
    'social.bookmarks',
    'social.custom_feeds',
    'social.custom_feed_rules',
    'moderation.content_flags',
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
    'identity.contact_emails',
    'identity.user_entitlements',
    'identity.account_events',
    'trust.reward_redemptions',
    'system.audit_events',
    'feed.notification_preferences',
    'feed.notification_devices',
  ]) {
    assert.match(locator, new RegExp(relation.replace('.', '\\.')));
  }

  assert.doesNotMatch(deletion, /DELETE FROM identity\.account_events WHERE user_id/);
  assert.match(retentionWorkflow, /DELETE FROM identity\.account_events account_event/);
  assert.match(retentionWorkflow, /DELETE FROM system\.audit_events audit_event/);
  assert.match(retentionWorkflow, /DELETE FROM system\.rate_limit_windows[\s\S]*window_started_at < date_trunc\('day', now\(\)\) - interval '2 days'/);
  assert.match(retentionWorkflow, /privacy\.legal_holds/);
  assert.match(roles, /GRANT SELECT \(user_id, email_ciphertext, encryption_key_version\), DELETE ON identity\.contact_emails TO lythaus_privacy;/);
  assert.match(roles, /GRANT SELECT, DELETE ON identity\.user_entitlements, trust\.reward_redemptions TO lythaus_privacy;/);
  assert.match(roles, /GRANT DELETE ON identity\.auth_sessions, identity\.refresh_token_families, identity\.account_events TO lythaus_privacy;/);
  assert.match(roles, /GRANT SELECT, INSERT, DELETE ON system\.audit_events TO lythaus_privacy;/);
});

test('unreleased migration fails closed for legacy authorship and public labels', () => {
  const commentUpgrade = between(migration, 'ALTER TABLE content.comments', 'CREATE INDEX comments_visible_cursor_idx');
  assert.match(commentUpgrade, /declared_creation_mode text NOT NULL DEFAULT 'unknown'/);
  assert.match(commentUpgrade, /declared_creation_mode IN \('human', 'ai_assisted', 'unknown'\)/);
  assert.match(commentUpgrade, /SET moderation_state = 'under_review'[\s\S]*declared_creation_mode = 'unknown'/);
  assert.match(commentUpgrade, /ALTER COLUMN declared_creation_mode DROP DEFAULT/);
  assert.doesNotMatch(commentUpgrade, /DEFAULT 'human'/);

  assert.match(migration, /legacy_ai_generated_posts/);
  assert.match(migration, /post\.declared_creation_mode = 'ai_generated'/);
  assert.match(migration, /visibility = 'private',[\s\S]*moderation_state = 'under_review',[\s\S]*published_at = NULL/);
  assert.match(migration, /SET public_label = 'Under review',[\s\S]*review_required = true/);
  assert.equal((migration.match(/public_label IS NULL OR public_label IN \('Human-authored', 'AI-assisted', 'Under review'\)/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /CHECK \(public_label IN \([^)]*'AI-generated'/);
  assert.match(migration, /content_declarations_generated_private_check[\s\S]*declared_creation_mode <> 'ai_generated'[\s\S]*public_label IS NULL OR public_label = 'Under review'[\s\S]*review_required/);
  assert.match(migration, /posts_generated_private_check[\s\S]*declared_creation_mode <> 'ai_generated'[\s\S]*visibility = 'private'[\s\S]*moderation_state <> 'allowed'[\s\S]*published_at IS NULL/);
});

test('moderation revisions have per-event database idempotency and stale-event identity', () => {
  assert.equal((migration.match(/ADD COLUMN moderation_source_event_id uuid/g) ?? []).length, 3);
  assert.ok((migration.match(/ADD COLUMN source_event_id uuid/g) ?? []).length >= 2);
  assert.match(migration, /CREATE UNIQUE INDEX detector_runs_provider_source_event_idx[\s\S]*ON moderation\.detector_runs \(provider, source_event_id\)[\s\S]*WHERE source_event_id IS NOT NULL/);
  assert.match(migration, /CREATE UNIQUE INDEX moderation_cases_content_source_event_idx[\s\S]*ON moderation\.cases \(content_type, content_id, source_event_id\)[\s\S]*WHERE source_event_id IS NOT NULL/);
  assert.match(migration, /UPDATE moderation\.cases[\s\S]*SET source_event_id = id[\s\S]*WHERE source_event_id IS NULL/);
  assert.match(migration, /ranked_open_cases[\s\S]*state = 'superseded'/);
  assert.match(migration, /ALTER COLUMN source_event_id SET NOT NULL/);
  assert.match(migration, /CREATE UNIQUE INDEX moderation_cases_one_open_content_idx[\s\S]*WHERE state = 'open'/);
  assert.match(migration, /CREATE UNIQUE INDEX posts_moderation_source_event_idx[\s\S]*ON content\.posts \(moderation_source_event_id\)[\s\S]*WHERE moderation_source_event_id IS NOT NULL/);
  assert.match(migration, /CREATE UNIQUE INDEX comments_moderation_source_event_idx[\s\S]*ON content\.comments \(moderation_source_event_id\)[\s\S]*WHERE moderation_source_event_id IS NOT NULL/);
  assert.match(migration, /CREATE UNIQUE INDEX profiles_moderation_source_event_idx[\s\S]*ON social\.profiles \(moderation_source_event_id\)[\s\S]*WHERE moderation_source_event_id IS NOT NULL/);
  assert.match(migration, /ADD COLUMN moderation_state text NOT NULL DEFAULT 'allowed'[\s\S]*moderation_state IN \('under_review', 'allowed', 'blocked'\)/);
  assert.equal((migration.match(/SET moderation_source_event_id = current_case\.source_event_id/g) ?? []).length, 3);
});

test('unreleased migration indexes every live feed cursor projection', () => {
  assert.match(migration, /CREATE INDEX custom_feed_rules_feed_idx[\s\S]*ON social\.custom_feed_rules \(feed_id\)/);
  assert.match(migration, /CREATE INDEX editorial_publications_cursor_idx[\s\S]*ON editorial\.publications \(published_at DESC, id DESC\)[\s\S]*WHERE published_at IS NOT NULL/);
  assert.match(migration, /CREATE INDEX user_inbox_cursor_idx[\s\S]*ON feed\.user_inbox \(user_id, created_at DESC, post_id DESC\)/);
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
  assert.match(publicApi, /const classified = classifyPublicError\(error\)/);
  assert.match(authRuntimePolicy, /const exposedCode = expected \? internalCode : 'request_failed'/);
  assert.match(adminApi, /const exposedCode = ADMIN_ERROR_CODES\.has\(internalCode\) \? internalCode : 'admin_request_failed'/);
  assert.match(adminApi, /catch \(error\) \{[\s\S]*internalErrorCode: classified\.internalCode/);
  assert.match(queueConsumer, /DELETE FROM system\.consumer_inbox/);
  assert.match(queueConsumer, /throw error/);
  assert.match(jobs, /message\.retry\(\)/);
  assert.match(relay, /FOR UPDATE SKIP LOCKED/);
  assert.match(relay, /attempted_at IS NULL OR attempted_at < now\(\) - interval '5 minutes'/);
  assert.match(relay, /last_error_code/);
});

test('catalogue-keyed authoritative mutations write user activity in the same transaction with matching event identity', () => {
  const inventory = [
    { operation: 'createPost', next: 'async function createUploadSession', mutations: [/INSERT INTO content\.posts/], eventIds: ['eventId'], eventPatterns: [/eventType: 'content\.post_submitted'/, /eventType: 'content\.declaration_selected'/], catalogueEvents: ['content.post_submitted', 'content.declaration_selected'] },
    { operation: 'createUploadSession', next: 'async function finaliseUpload', mutations: [/INSERT INTO media\.upload_sessions/], eventIds: ['uploadSessionId'], eventPatterns: [/eventType: 'content\.media_upload_started'/], catalogueEvents: ['content.media_upload_started'] },
    { operation: 'finaliseUpload', next: 'async function rejectUploadReservation', mutations: [/UPDATE media\.upload_sessions/, /INSERT INTO system\.outbox_events/], eventIds: ['eventId'], eventPatterns: [/eventType: 'content\.media_upload_finalised'/], catalogueEvents: ['content.media_upload_finalised'] },
    { operation: 'updateProfile', next: 'async function assertSocialInteractionAllowed', mutations: [/UPDATE identity\.users|INSERT INTO social\.profiles/, /INSERT INTO social\.profile_private_fields|DELETE FROM social\.profile_private_fields/], eventIds: ['sourceEventId', 'accountabilitySourceEventId!'], eventPatterns: [/changedVisibility && changedFields\.length === 1 \? 'profile\.visibility_changed'/, /: changedDisplayName \? 'profile\.display_name_changed'/, /: 'profile\.bio_changed'/, /eventType: 'profile\.accountability_name_changed'/], catalogueEvents: ['profile.display_name_changed', 'profile.bio_changed', 'profile.visibility_changed', 'profile.accountability_name_changed'] },
    { operation: 'createFollow', next: 'async function followStatus', mutations: [/INSERT INTO social\.follows/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'social\.follow_created'/], catalogueEvents: ['social.follow_created'] },
    { operation: 'removeFollow', next: 'async function setBlock', mutations: [/DELETE FROM social\.follows/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'social\.follow_removed'/], catalogueEvents: ['social.follow_removed'] },
    { operation: 'setBlock', next: 'async function setMute', mutations: [/INSERT INTO social\.blocks/, /DELETE FROM social\.blocks/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: change\.activityEvent/], catalogueEvents: ['social.block_created', 'social.block_removed'] },
    { operation: 'setMute', next: 'async function setBookmark', mutations: [/INSERT INTO social\.mutes/, /DELETE FROM social\.mutes/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: change\.activityEvent/], catalogueEvents: ['social.mute_created', 'social.mute_removed'] },
    { operation: 'setBookmark', next: 'async function createComment', mutations: [/INSERT INTO social\.bookmarks/, /DELETE FROM social\.bookmarks/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: bookmarked \? 'content\.bookmark_added' : 'content\.bookmark_removed'/], catalogueEvents: ['content.bookmark_added', 'content.bookmark_removed'] },
    { operation: 'createComment', next: 'async function updatePost', mutations: [/INSERT INTO content\.comments/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: comment\.activityEvent/, /eventType: 'content\.declaration_selected'/], catalogueEvents: ['content.comment_created', 'content.reply_created', 'content.declaration_selected'] },
    { operation: 'updatePost', next: 'async function deletePost', mutations: [/UPDATE content\.posts/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'content\.post_edited'/], catalogueEvents: ['content.post_edited'] },
    { operation: 'deletePost', next: 'async function updateComment', mutations: [/UPDATE content\.posts SET deleted_at = now\(\)/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: deletion\.activityEvent/], catalogueEvents: ['content.post_deleted'] },
    { operation: 'updateComment', next: 'async function deleteComment', mutations: [/UPDATE content\.comments/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'content\.comment_edited'/], catalogueEvents: ['content.comment_edited'] },
    { operation: 'deleteComment', next: 'async function createReaction', mutations: [/UPDATE content\.comments SET body = '\[deleted\]'/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: deletion\.activityEvent/], catalogueEvents: ['content.comment_deleted'] },
    { operation: 'createReaction', next: 'async function removeReaction', mutations: [/INSERT INTO social\.reactions/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'content\.reaction_added'/], catalogueEvents: ['content.reaction_added'] },
    { operation: 'removeReaction', next: 'async function createFlag', mutations: [/DELETE FROM social\.reactions/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'content\.reaction_removed'/], catalogueEvents: ['content.reaction_removed'] },
    { operation: 'createFlag', next: 'async function createAppeal', mutations: [/INSERT INTO moderation\.content_flags/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'moderation\.flag_submitted'/], catalogueEvents: ['moderation.flag_submitted'] },
    { operation: 'createAppeal', next: 'async function getAppeal', mutations: [/INSERT INTO moderation\.appeals/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'appeals\.appeal_submitted'/], catalogueEvents: ['appeals.appeal_submitted'] },
    { operation: 'submitAppealVote', next: 'async function recuseAppealReview', mutations: [/INSERT INTO moderation\.appeal_review_votes/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'appeals\.review_completed'/], catalogueEvents: ['appeals.review_completed'] },
    { operation: 'recuseAppealReview', next: 'async function reviewerAssignments', mutations: [/UPDATE moderation\.appeal_assignments SET state = 'recused'/, /INSERT INTO system\.outbox_events/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'appeals\.reviewer_assignment_changed'/], catalogueEvents: ['appeals.reviewer_assignment_changed'] },
    { operation: 'createPrivacyRequest', next: 'async function getPrivacyRequestStatus', mutations: [/INSERT INTO privacy\.requests/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: plan\.activityEvent/], catalogueEvents: ['privacy.export_requested', 'privacy.deletion_requested', 'privacy.rectification_requested'] },
    { operation: 'updateRegionPreferences', next: 'async function updateRetentionRule', mutations: [/INSERT INTO identity\.user_region_preferences/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'profile\.region_changed'/], catalogueEvents: ['profile.region_changed'] },
    { operation: 'updateRetentionRule', next: 'async function listCustomFeeds', mutations: [/privacy\.set_retention_rule/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'profile\.retention_preference_changed'/], catalogueEvents: ['profile.retention_preference_changed'] },
    { operation: 'createCustomFeed', next: 'async function customFeed', mutations: [/INSERT INTO social\.custom_feeds/, /INSERT INTO social\.custom_feed_rules/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'social\.custom_feed_created'/], catalogueEvents: ['social.custom_feed_created'] },
    { operation: 'customFeed', next: 'async function customFeedItems', mutations: [/DELETE FROM social\.custom_feeds/, /UPDATE social\.custom_feeds/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'social\.custom_feed_deleted'/, /eventType: 'social\.custom_feed_updated'/], catalogueEvents: ['social.custom_feed_deleted', 'social.custom_feed_updated'] },
    { operation: 'notificationPreferences', next: 'async function notificationDevices', mutations: [/INSERT INTO feed\.notification_preferences/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'profile\.notification_preference_changed'/], catalogueEvents: ['profile.notification_preference_changed'] },
    { operation: 'notificationDevices', next: 'async function reputationSummary', mutations: [/INSERT INTO feed\.notification_devices/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'profile\.notification_device_registered'/], catalogueEvents: ['profile.notification_device_registered'] },
    { operation: 'redeemReward', next: 'async function getPersonalFeed', mutations: [/INSERT INTO trust\.reward_redemptions/], eventIds: ['sourceEventId'], eventPatterns: [/eventType: 'rewards\.reward_redeemed'/], catalogueEvents: ['rewards.reward_redeemed'] },
  ];

  const profileMutation = between(publicApi, 'async function updateProfile', 'async function assertSocialInteractionAllowed');
  assert.match(profileMutation, /if \(!changedDisplayName && !changedBio && !changedVisibility && !changedAccountability\) return;/);
  const postMutation = between(publicApi, 'async function updatePost', 'async function deletePost');
  assert.match(postMutation, /if \(!changed\) \{/);
  const commentMutation = between(publicApi, 'async function updateComment', 'async function deleteComment');
  assert.match(commentMutation, /declaration\.body === current\.rows\[0\]\.body/);

  const catalogueKeys = new Set(activityCatalogue.events.map((entry) => entry.key));
  for (const { operation, next, mutations, eventIds, eventPatterns, catalogueEvents } of inventory) {
    const source = between(publicApi, `async function ${operation}`, next);
    assert.match(source, /transaction\(env\.DB_APP_FRESH, async \(client\) => \{/, `${operation} must mutate and write activity in one transaction`);
    for (const mutation of mutations) assert.match(source, mutation, `${operation} must mutate every authoritative relation`);
    for (const eventId of eventIds) assert.match(source, new RegExp(`await writeActivity\\(client, request, user, ${eventId.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')},`), `${operation} must write activity with its mutation event identity`);
    for (const eventPattern of eventPatterns) assert.match(source, eventPattern, `${operation} must emit its catalogue event`);
    for (const eventType of catalogueEvents) assert.equal(catalogueKeys.has(eventType), true, `${operation} emits undocumented activity event ${eventType}`);
  }

  const dynamicEventPolicies = `${contentRuntimePolicy}\n${privacyRuntimePolicy}`;
  for (const eventType of ['social.block_created', 'social.block_removed', 'social.mute_created', 'social.mute_removed', 'content.comment_created', 'content.reply_created', 'content.post_deleted', 'content.comment_deleted', 'privacy.export_requested', 'privacy.deletion_requested', 'privacy.rectification_requested']) {
    assert.match(dynamicEventPolicies, new RegExp(`['\"]${eventType.replace('.', '\\.')}['\"]`), `runtime policy must resolve ${eventType}`);
  }

  const deviceRevocation = between(publicApi, 'const notificationDeviceRevoke =', "if (request.method === 'GET' && url.pathname === '/api/privacy/requests')");
  assert.match(deviceRevocation, /transaction\(env\.DB_APP_FRESH, async \(client\) => \{/);
  assert.match(deviceRevocation, /UPDATE feed\.notification_devices SET active = false/);
  assert.match(deviceRevocation, /await writeActivity\(client, request, user, notificationDeviceRevoke\[1\],/);
  assert.match(deviceRevocation, /eventType: 'profile\.notification_device_revoked'/);
  assert.equal(catalogueKeys.has('profile.notification_device_revoked'), true);

  for (const deliberatelyNonSemantic of ['notificationAction']) {
    const source = between(publicApi, `async function ${deliberatelyNonSemantic}`, 'async function notificationPreferences');
    assert.doesNotMatch(source, /writeActivity/, 'read and dismiss state are delivery bookkeeping, not semantic catalogue actions');
  }
});

function hasExactUuidDeep(value, subjectId) {
  if (typeof value === 'string') return value === subjectId;
  if (Array.isArray(value)) return value.some((item) => hasExactUuidDeep(item, subjectId));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some((item) => hasExactUuidDeep(item, subjectId));
}

test('DSR recursive event cleanup matches only exact subject UUID values and preserves unrelated rows', () => {
  const subjectId = '11111111-1111-7111-8111-111111111111';
  const nestedSubject = { event: { payload: { recipient: { userId: subjectId } } } };
  const unrelated = { event: { payload: { recipient: { userId: '22222222-2222-7222-8222-222222222222' } } } };
  const nearMatch = { event: { payload: { note: `prefix-${subjectId}` } } };
  const fieldNameOnly = { [subjectId]: 'not-an-id-value' };
  assert.equal(hasExactUuidDeep(nestedSubject, subjectId), true);
  assert.equal(hasExactUuidDeep(unrelated, subjectId), false);
  assert.equal(hasExactUuidDeep(nearMatch, subjectId), false);
  assert.equal(hasExactUuidDeep(fieldNameOnly, subjectId), false);

  const deletion = between(jobs, 'export class AccountDeleteWorkflow', 'export class AccountExportWorkflow');
  assert.match(deletion, /jsonb_path_exists\([\s\S]*'\$\.\*\* \? \(@ == \$subject\)'[\s\S]*to_jsonb\(\$1::text\)/);
  assert.match(deletion, /DELETE FROM system\.consumer_inbox[\s\S]*jsonb_path_exists/);
  assert.match(deletion, /UPDATE system\.outbox_events[\s\S]*actor_id = NULL[\s\S]*payload = '\{\}'::jsonb[\s\S]*jsonb_path_exists/);
});

test('Workers bound request and R2 bytes before materializing untrusted payloads', () => {
  assert.match(publicApi, /import \{ readBoundedJson \} from '\.\/request-body-runtime\.ts'/);
  const readJson = between(publicApi, 'async function readJson', 'function feedResponse');
  assert.match(readJson, /return readBoundedJson<T>\(request, maxBytes\)/);
  assert.doesNotMatch(readJson, /request\.arrayBuffer\(\)/);

  const media = between(jobs, 'async function processMediaUpload', 'async function processProfileModeration');
  const sizeGuard = media.indexOf('source.size !== Number(row.expected_bytes) || source.size > MAX_IMAGE_BYTES');
  const bufferedRead = media.indexOf('new Response(source.body).arrayBuffer()');
  assert.ok(sizeGuard >= 0 && bufferedRead > sizeGuard, 'R2 object metadata must reject oversized or mismatched objects before buffering');
});

test('retention database mutations and their audit/ledger effects commit together after idempotent R2 deletion', () => {
  const retention = between(jobs, 'export class RetentionCleanupWorkflow', 'export class AppealLifecycleWorkflow');
  assert.match(retention, /const redactedPosts = await transaction\(this\.env\.DB_JOBS_FRESH, async \(client\) => \{[\s\S]*UPDATE content\.posts[\s\S]*INSERT INTO system\.audit_events/);
  assert.match(retention, /for \(const object of objects\.rows\) await this\.env\.MEDIA_APPROVED\.delete\(object\.object_key\);[\s\S]*const deletedMedia = await transaction\(this\.env\.DB_JOBS_FRESH, async \(client\) => \{[\s\S]*UPDATE media\.objects[\s\S]*UPDATE media\.storage_ledger[\s\S]*INSERT INTO system\.audit_events/);
});

test('workflow consumer retries treat an existing deterministic workflow instance as already started', () => {
  const queueConsumer = between(jobs, 'async function processMessage', 'function queueForEvent');
  assert.match(queueConsumer, /ensureWorkflowCreate\(env\.ACCOUNT_DELETE, `privacy-delete-\$\{payload\.requestId\}`/);
  assert.match(queueConsumer, /ensureWorkflowCreate\(env\.ACCOUNT_EXPORT, `privacy-export-\$\{payload\.requestId\}`/);
  assert.match(queueConsumer, /ensureWorkflowCreate\(env\.APPEAL_LIFECYCLE, `appeal-\$\{payload\.appealId\}`/);
  assert.match(jobs, /ensureWorkflowCreate\(env\.RETENTION_CLEANUP, `retention-\$\{runId\}`/);
  assert.match(jobs, /ensureWorkflowCreate\(env\.BACKUP_VALIDATION, `backup-validation-\$\{runId\}`/);
});

test('post provenance is bound to the moderated revision source event', () => {
  const postModeration = between(jobs, 'async function processPostModeration', 'async function processCommentModeration');
  assert.match(postModeration, /INSERT INTO trust\.provenance_events[\s\S]*source_event_id/);
  assert.match(postModeration, /AUTHENTICITY_POLICY, revision\.sourceEventId/);
});
