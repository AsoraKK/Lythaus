import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCommentFeedItemEligibility,
  assertCustomFeedAvailable,
  assertFeedItemEligibility,
  assertNewsBoardItemEligibility,
  commentPublicLabel,
  entitlementsForTier,
  feedResponsePlan,
  requireNewsBoardAccess,
} from '../src/feed-runtime-policy.ts';

test('public feed surfaces receive only their bounded cache policy', () => {
  assert.deepEqual(feedResponsePlan('discovery', false), {
    privateResponse: false, cacheControl: 'public, s-maxage=30, stale-while-revalidate=60',
  });
  assert.deepEqual(feedResponsePlan('post', false), {
    privateResponse: false, cacheControl: 'public, max-age=15, s-maxage=15',
  });
  assert.deepEqual(feedResponsePlan('comments', false), {
    privateResponse: false, cacheControl: 'public, max-age=10, s-maxage=10',
  });
});

test('viewer-scoped, personal, custom, and news feeds never become shared-cache responses', () => {
  for (const surface of ['discovery', 'post', 'comments', 'personal', 'custom', 'news']) {
    assert.deepEqual(feedResponsePlan(surface, true), { privateResponse: true, cacheControl: 'private, no-store' });
  }
  for (const surface of ['personal', 'custom', 'news']) {
    assert.deepEqual(feedResponsePlan(surface, false), { privateResponse: true, cacheControl: 'private, no-store' });
  }
});

test('tier entitlements and custom-feed capacity follow the production tier table', () => {
  assert.deepEqual(entitlementsForTier('free'), { maxCustomFeeds: 1, newsBoardAccess: 'none' });
  assert.deepEqual(entitlementsForTier('premium'), { maxCustomFeeds: 2, newsBoardAccess: 'none' });
  assert.deepEqual(entitlementsForTier('black'), { maxCustomFeeds: 3, newsBoardAccess: 'full' });
  assert.equal(assertCustomFeedAvailable('free', 0).maxCustomFeeds, 1);
  assert.equal(assertCustomFeedAvailable('premium', 1).maxCustomFeeds, 2);
  assert.equal(assertCustomFeedAvailable('black', 2).maxCustomFeeds, 3);
  assert.throws(() => assertCustomFeedAvailable('free', 1), /custom_feed_limit_reached/);
  assert.throws(() => assertCustomFeedAvailable('premium', 2), /custom_feed_limit_reached/);
  assert.throws(() => assertCustomFeedAvailable('black', 3), /custom_feed_limit_reached/);
});

test('news board remains earned black-tier access', () => {
  assert.throws(() => requireNewsBoardAccess('free'), /news_board_not_entitled/);
  assert.throws(() => requireNewsBoardAccess('premium'), /news_board_not_entitled/);
  assert.equal(requireNewsBoardAccess('black'), 'full');
});

test('feed item eligibility fails closed for moderation, deletion, labels, and relationships', () => {
  const publicItem = {
    authorId: 'author', visibility: 'public', moderationState: 'allowed',
    publicLabel: 'Human-authored', deleted: false,
  };
  assert.doesNotThrow(() => assertFeedItemEligibility(publicItem));
  assert.doesNotThrow(() => assertFeedItemEligibility({ ...publicItem, publicLabel: 'AI-assisted' }));
  assert.throws(() => assertFeedItemEligibility({ ...publicItem, deleted: true }), /post_not_available/);
  assert.throws(() => assertFeedItemEligibility({ ...publicItem, moderationState: 'under_review' }), /post_not_available/);
  assert.throws(() => assertFeedItemEligibility({ ...publicItem, publicLabel: 'Unknown' }), /post_not_available/);
  assert.throws(() => assertFeedItemEligibility({ ...publicItem, viewer: { userId: 'viewer', followsAuthor: false, blocked: true, muted: false } }), /post_not_available/);
  assert.throws(() => assertFeedItemEligibility({ ...publicItem, viewer: { userId: 'viewer', followsAuthor: false, blocked: false, muted: true } }), /post_not_available/);
});

test('feed item eligibility distinguishes anonymous, author, follower, and other viewers', () => {
  const restricted = {
    authorId: 'author', visibility: 'followers', moderationState: 'allowed',
    publicLabel: 'Human-authored', deleted: false,
  };
  assert.throws(() => assertFeedItemEligibility(restricted), /post_not_available/);
  assert.doesNotThrow(() => assertFeedItemEligibility({
    ...restricted, visibility: 'private', viewer: { userId: 'author', followsAuthor: false, blocked: false, muted: false },
  }));
  assert.doesNotThrow(() => assertFeedItemEligibility({
    ...restricted, viewer: { userId: 'follower', followsAuthor: true, blocked: false, muted: false },
  }));
  assert.throws(() => assertFeedItemEligibility({
    ...restricted, viewer: { userId: 'other', followsAuthor: false, blocked: false, muted: false },
  }), /post_not_available/);
});

test('comment eligibility applies parent visibility and commenter block or mute isolation', () => {
  const publicComment = {
    postVisibility: 'public', postModerationState: 'allowed', postDeleted: false,
    publicLabel: 'Human-authored',
  };
  assert.doesNotThrow(() => assertCommentFeedItemEligibility(publicComment));
  assert.doesNotThrow(() => assertCommentFeedItemEligibility({ ...publicComment, publicLabel: 'AI-assisted' }));
  assert.throws(() => assertCommentFeedItemEligibility({ ...publicComment, postDeleted: true }), /post_not_available/);
  assert.throws(() => assertCommentFeedItemEligibility({ ...publicComment, postModerationState: 'under_review' }), /post_not_available/);
  assert.throws(() => assertCommentFeedItemEligibility({ ...publicComment, publicLabel: 'Unknown' }), /post_not_available/);
  assert.throws(() => assertCommentFeedItemEligibility({
    ...publicComment, viewer: { isPostAuthor: false, followsPostAuthor: false, blockedCommentAuthor: true, mutedCommentAuthor: false },
  }), /post_not_available/);
  assert.throws(() => assertCommentFeedItemEligibility({
    ...publicComment, viewer: { isPostAuthor: false, followsPostAuthor: false, blockedCommentAuthor: false, mutedCommentAuthor: true },
  }), /post_not_available/);
  assert.throws(() => assertCommentFeedItemEligibility({ ...publicComment, postVisibility: 'followers' }), /post_not_available/);
  assert.doesNotThrow(() => assertCommentFeedItemEligibility({
    ...publicComment, postVisibility: 'private', viewer: { isPostAuthor: true, followsPostAuthor: false, blockedCommentAuthor: false, mutedCommentAuthor: false },
  }));
  assert.doesNotThrow(() => assertCommentFeedItemEligibility({
    ...publicComment, postVisibility: 'followers', viewer: { isPostAuthor: false, followsPostAuthor: true, blockedCommentAuthor: false, mutedCommentAuthor: false },
  }));
  assert.throws(() => assertCommentFeedItemEligibility({
    ...publicComment, postVisibility: 'followers', viewer: { isPostAuthor: false, followsPostAuthor: false, blockedCommentAuthor: false, mutedCommentAuthor: false },
  }), /post_not_available/);
});

test('comment labels are exact and generated or retired modes fail closed', () => {
  assert.equal(commentPublicLabel('human'), 'Human-authored');
  assert.equal(commentPublicLabel('ai_assisted'), 'AI-assisted');
  assert.equal(commentPublicLabel('ai_generated'), undefined);
  assert.equal(commentPublicLabel('retired_mode'), undefined);
  assert.throws(() => assertCommentFeedItemEligibility({
    postVisibility: 'public', postModerationState: 'allowed', postDeleted: false,
    publicLabel: commentPublicLabel('ai_generated'),
  }), /post_not_available/);
});

test('News Board accepts published standalone editorials but reuses post visibility isolation', () => {
  assert.doesNotThrow(() => assertNewsBoardItemEligibility({ publicationPublished: true, postBacked: false }));
  assert.throws(() => assertNewsBoardItemEligibility({ publicationPublished: false, postBacked: false }), /post_not_available/);
  const post = {
    authorId: 'author', visibility: 'public', moderationState: 'allowed', publicLabel: 'Human-authored', deleted: false,
    viewer: { userId: 'reader', followsAuthor: false, blocked: false, muted: false },
  };
  assert.doesNotThrow(() => assertNewsBoardItemEligibility({ publicationPublished: true, postBacked: true, post }));
  assert.throws(() => assertNewsBoardItemEligibility({ publicationPublished: true, postBacked: true }), /post_not_available/);
  assert.throws(() => assertNewsBoardItemEligibility({
    publicationPublished: true, postBacked: true, post: { ...post, viewer: { ...post.viewer, blocked: true } },
  }), /post_not_available/);
  assert.throws(() => assertNewsBoardItemEligibility({
    publicationPublished: true, postBacked: true, post: { ...post, viewer: { ...post.viewer, muted: true } },
  }), /post_not_available/);
  assert.throws(() => assertNewsBoardItemEligibility({
    publicationPublished: true, postBacked: true, post: { ...post, publicLabel: 'AI-generated' },
  }), /post_not_available/);
});
