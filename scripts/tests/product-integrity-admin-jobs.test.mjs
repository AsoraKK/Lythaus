import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const admin = fs.readFileSync(path.join(root, 'apps/lythaus-admin-api/src/index.ts'), 'utf8');
const jobs = fs.readFileSync(path.join(root, 'apps/lythaus-jobs/src/index.ts'), 'utf8');

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
  assert.match(admin, /assignment_state !== 'voted' \|\| !row\.conflict_checked/);
  assert.match(adjudication, /appeals\.decision_(?:reversed|upheld)/);
  assert.match(admin, /const appealAdjudication = url\.pathname\.match/);
  assert.match(admin, /return await adjudicateAppeal\(/);
});

test('jobs recover canonical privacy payloads and record outcome notifications', () => {
  const privacy = between(jobs, 'async function resolvePrivacyRequestPayload', 'const MAX_IMAGE_PIXELS');
  assert.match(privacy, /aggregate_id/);
  assert.match(privacy, /privacy_request_id_mismatch/);
  assert.match(jobs, /privacy\.export_requested/);
  assert.match(jobs, /privacy\.export_generated/);
  assert.match(jobs, /privacy\.deletion_state_changed/);
  assert.match(jobs, /privacy\.export_ready/);
  assert.match(jobs, /privacy\.deletion_blocked/);
});

test('jobs claim outbox work and export integrity-v3 private records', () => {
  const outbox = between(jobs, 'async function relayOutbox', 'interface AdminOutcomeNotification');
  assert.match(outbox, /FOR UPDATE SKIP LOCKED/);
  assert.match(outbox, /attempted_at < now\(\) - interval '5 minutes'/);
  assert.match(outbox, /last_error_code/);
  assert.match(jobs, /lythaus-data-passport-v3/);
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
