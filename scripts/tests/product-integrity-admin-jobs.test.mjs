import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const admin = fs.readFileSync(path.join(root, 'apps/lythaus-admin-api/src/index.ts'), 'utf8');
const adminRuntimePolicy = fs.readFileSync(path.join(root, 'apps/lythaus-admin-api/src/runtime-policy.ts'), 'utf8');
const jobs = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/src/index.ts'), 'utf8');
const jobsRuntimePolicy = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/src/runtime-policy.ts'), 'utf8');
const activityCatalogue = JSON.parse(fs.readFileSync(path.join(root, 'docs/contracts/activity-event-catalogue-v1.json'), 'utf8'));

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `missing ${start}`);
  assert.notEqual(endIndex, -1, `missing ${end}`);
  return source.slice(startIndex, endIndex);
}

test('moderation decisions preserve appeals for independent governance', () => {
  const decision = between(admin, 'async function decideModeration', 'interface AppealCaseRecord');
  assert.doesNotMatch(decision, /UPDATE moderation\.appeals/);
  assert.match(decision, /recordUserActivity/);
  assert.match(decision, /moderation\.decision_applied/);
  assert.match(decision, /Appeals remain open/);
  assert.match(decision, /assertActionableModerationCase/);
  assert.match(decision, /SELECT content_type, content_id, policy_version, state, source_event_id/);
  assert.match(decision, /FOR UPDATE OF profile, users/);
  assert.match(decision, /moderation_source_event_id = \$3 AND deleted_at IS NULL/);
  assert.match(decision, /UPDATE social\.profiles[\s\S]*SET moderation_state = \$1[\s\S]*moderation_source_event_id = \$3/);
  assert.match(decision, /moderation_case_superseded/);
});

test('appeal adjudication uses the shared policy and durable outcome records', () => {
  const adjudication = between(admin, 'async function adjudicateAppeal', 'async function updateAccountStatus');
  assert.match(admin, /from '@lythaus\/contracts'/);
  assert.match(adjudication, /APPEAL_POLICY\.version/);
  assert.match(adjudication, /evaluateAppeal/);
  assert.match(adjudication, /moderation\.reviewer_qualifications/);
  assert.match(adjudication, /moderation\.appeal_adjudications/);
  assert.match(adjudication, /moderation\.appeal_outcomes/);
  assert.match(adjudication, /appeal_adjudicator_conflict/);
  assert.match(adminRuntimePolicy, /assignment_state !== 'voted' \|\| !row\.conflict_checked/);
  assert.match(adminRuntimePolicy, /appeals\.decision_(?:reversed|upheld)/);
  assert.match(admin, /const appealAdjudication = url\.pathname\.match/);
  assert.match(admin, /return cors\(await adjudicateAppeal\(/);
});

test('jobs recover canonical privacy payloads and record outcome notifications', () => {
  const privacy = between(jobs, 'async function resolvePrivacyRequestPayload', 'const MAX_IMAGE_PIXELS');
  assert.match(privacy, /aggregate_id/);
  assert.match(jobsRuntimePolicy, /privacy_request_id_mismatch/);
  assert.match(jobsRuntimePolicy, /privacy\.export_requested/);
  assert.match(jobs, /privacy\.export_generated/);
  assert.match(jobsRuntimePolicy, /privacy\.deletion_state_changed/);
  assert.match(jobs, /privacy\.export_ready/);
  assert.match(jobs, /privacy\.deletion_blocked/);
});

test('jobs claim outbox work and export integrity-v3 private records', () => {
  const outbox = between(jobs, 'async function relayOutbox', 'interface AdminOutcomeNotification');
  assert.match(outbox, /FOR UPDATE SKIP LOCKED/);
  assert.match(outbox, /attempted_at < now\(\) - interval '5 minutes'/);
  assert.match(outbox, /last_error_code/);
  assert.match(jobsRuntimePolicy, /lythaus-data-passport-v3/);
  for (const relation of [
    'trust.user_activity_events',
    'trust.reputation_profiles',
    'moderation.appeal_assignments',
    'moderation.appeal_review_votes',
    'moderation.appeal_adjudications',
    'moderation.appeal_outcomes',
    'moderation.appeal_outcome_effects',
    'trust.accountability_signals',
    'feed.notification_preferences',
    'feed.notification_devices',
    'social.profile_private_fields',
  ]) {
    assert.match(jobs, new RegExp(relation.replaceAll('.', '\\.')));
  }
  assert.match(jobs, /deliverAdminOutcomeNotifications/);
  assert.match(jobs, /pending_quorum/);
  assert.match(jobs, /evaluateAppeal/);
  assert.doesNotMatch(jobs, /CASE_RESOLVED/);
});

test('admin and jobs user-visible mutations keep activity atomic, deduplicated, and catalogue-backed', () => {
  const catalogueKeys = new Set(activityCatalogue.events.map((entry) => entry.key));
  const tier = between(admin, 'async function setUserTier', 'async function legalHolds');
  assert.match(tier, /transaction\(env\.DB_ADMIN_FRESH, async \(client\) => \{/);
  assert.match(tier, /if \(tierBefore === input\.tier\) return false;/);
  assert.match(tier, /sourceEventId,[\s\S]*eventType: 'rewards\.subscription_tier_changed'/);

  const placeHold = between(admin, 'async function legalHolds', 'async function clearLegalHold');
  assert.match(placeHold, /transaction\(env\.DB_PRIVACY_FRESH, async \(client\) => \{/);
  assert.match(placeHold, /INSERT INTO privacy\.legal_holds[\s\S]*recordUserActivity\(client/);
  assert.match(placeHold, /sourceEventId,[\s\S]*eventType: 'privacy\.legal_restriction_changed'/);

  const clearHold = between(admin, 'async function clearLegalHold', 'async function publishEditorial');
  assert.match(clearHold, /transaction\(env\.DB_PRIVACY_FRESH, async \(client\) => \{/);
  assert.match(clearHold, /UPDATE privacy\.legal_holds[\s\S]*RETURNING subject_id[\s\S]*recordUserActivity\(client/);
  assert.match(clearHold, /if \(updated\.rowCount !== 1\) throw new Error\('legal_hold_not_found'\)/);

  const media = between(jobs, 'async function processMediaUpload', 'async function processProfileModeration');
  assert.match(media, /const settleRejected = async[\s\S]*transaction\(env\.DB_JOBS_FRESH[\s\S]*UPDATE media\.upload_sessions[\s\S]*recordUserActivity\(client/);
  assert.match(media, /transaction\(env\.DB_JOBS_FRESH[\s\S]*UPDATE media\.upload_sessions SET status = 'approved'[\s\S]*recordUserActivity\(client/);

  const panel = between(jobs, 'async function processAppealVoteLocked', 'async function processMessage');
  assert.match(panel, /transaction\(env\.DB_JOBS_FRESH, async \(client\) => \{/);
  assert.match(panel, /prior\.rows\[0\]\?\.reviewer_panel_decision === evaluation\.reviewerPanelDecision\) return;/);
  assert.match(panel, /appeals\.reviewer_panel_result_reached[\s\S]*insertPreferenceAwareNotification\(client/);
  assert.match(panel, /appeals\.adjudication_requested[\s\S]*insertPreferenceAwareNotification\(client/);

  const deletion = between(jobs, 'export class AccountDeleteWorkflow', 'export class AccountExportWorkflow');
  assert.match(deletion, /evaluate-legal-holds[\s\S]*transaction\(this\.env\.DB_PRIVACY_FRESH[\s\S]*UPDATE privacy\.requests[\s\S]*recordUserActivity\(client/);
  const exportWorkflow = between(jobs, 'export class AccountExportWorkflow', 'export class RetentionCleanupWorkflow');
  assert.match(exportWorkflow, /store-export-and-complete-request[\s\S]*transaction\(this\.env\.DB_PRIVACY_FRESH[\s\S]*UPDATE privacy\.requests[\s\S]*recordUserActivity\(client/);

  for (const eventType of [
    'rewards.subscription_tier_changed',
    'privacy.legal_restriction_changed',
    'content.media_upload_rejected',
    'content.media_upload_approved',
    'appeals.reviewer_panel_result_reached',
    'appeals.adjudication_requested',
    'privacy.deletion_state_changed',
    'privacy.export_generated',
  ]) {
    assert.equal(catalogueKeys.has(eventType), true, `cross-runtime mutation emits undocumented activity event ${eventType}`);
  }
});
