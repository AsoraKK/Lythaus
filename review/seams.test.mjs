import assert from 'node:assert/strict';
import test from 'node:test';
import { parseContentModerationRevision, isCurrentContentModerationRevision, queueRouteForEvent, ensureWorkflowCreate } from '../apps/lythaus-jobs/src/runtime-policy.ts';

const eventId = '019a0000-0000-7000-8000-000000000001';
const contentId = '019a0000-0000-7000-8000-000000000002';
const payload = { postId: contentId, sourceEventId: eventId, declaredCreationMode: 'human', bodyHash: 'a'.repeat(64) };
const revision = parseContentModerationRevision({ eventId, payload: JSON.parse(JSON.stringify(payload)), contentIdField: 'postId' });
const canonical = { ...revision, moderationState: 'under_review', deletedAt: null };

test('S01 serialized post revision survives producer-consumer boundary', () => {
  assert.equal(isCurrentContentModerationRevision({ revision, canonical }), true);
});
test('S02 serialized comment revision uses commentId, not postId', () => {
  const { postId, ...rest } = payload;
  const comment = parseContentModerationRevision({ eventId, payload: { ...rest, commentId: postId }, contentIdField: 'commentId' });
  assert.deepEqual(comment, revision);
  assert.throws(() => parseContentModerationRevision({ eventId, payload, contentIdField: 'commentId' }), /content_event_invalid/);
});
for (const [id, patch] of [
  ['S03 stale event after edit', { sourceEventId: 'new-event' }],
  ['S04 stale text hash after edit', { bodyHash: 'b'.repeat(64) }],
  ['S05 changed creation mode', { declaredCreationMode: 'ai_assisted' }],
  ['S06 deletion before processing', { deletedAt: '2026-10-25T00:00:00Z' }],
  ['S07 already published delivery', { moderationState: 'published' }],
]) test(id, () => assert.equal(isCurrentContentModerationRevision({ revision, canonical: { ...canonical, ...patch } }), false));
test('S08 missing canonical content cannot become current', () => {
  assert.equal(isCurrentContentModerationRevision({ revision }), false);
});
test('S09 content and media events reach their declared queue routes', () => {
  for (const type of ['content.post.created', 'content.post.updated', 'content.post.published', 'content.comment.created', 'content.comment.published']) assert.equal(queueRouteForEvent(type), 'moderation');
  assert.equal(queueRouteForEvent('media.upload.completed'), 'media');
});
test('S10 ordinary duplicate workflow create is idempotently accepted', async () => {
  assert.equal(await ensureWorkflowCreate({ create: async () => { throw new Error('instance already exists'); } }, eventId, {}), 'already_exists');
});
test('S11 interrupted workflow create remains retryable error', async () => {
  const error = new Error('synthetic connection interrupted');
  await assert.rejects(ensureWorkflowCreate({ create: async () => { throw error; } }, eventId, {}), actual => actual === error);
});
test('S12 event id mismatch rejects a stale payload before persistence', () => {
  assert.throws(() => parseContentModerationRevision({ eventId: 'different', payload, contentIdField: 'postId' }), /content_event_invalid/);
});
