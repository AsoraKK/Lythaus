import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeCursor,
  encodeCursor,
  normalizeCustomFeedRules,
  pageRequest,
  reputationBand,
} from '../src/product-policy.ts';

const cursor = {
  timestamp: '2026-08-10T12:34:56.000Z',
  id: '01900000-0000-7000-8000-000000000001',
};

test('feed cursors round-trip and reject adversarial values', () => {
  const encoded = encodeCursor(cursor);
  assert.deepEqual(decodeCursor(encoded), cursor);
  assert.equal(decodeCursor(null), null);
  assert.throws(() => decodeCursor('%%%'), /invalid_cursor/);
  const invalidTimestamp = Buffer.from(JSON.stringify({ ...cursor, timestamp: 'not-a-date' })).toString('base64url');
  const invalidId = Buffer.from(JSON.stringify({ ...cursor, id: 'not-a-uuid' })).toString('base64url');
  const malformedUuid = Buffer.from(JSON.stringify({ ...cursor, id: '------------------------------------' })).toString('base64url');
  assert.throws(() => decodeCursor(invalidTimestamp), /invalid_cursor/);
  assert.throws(() => decodeCursor(invalidId), /invalid_cursor/);
  assert.throws(() => decodeCursor(malformedUuid), /invalid_cursor/);
});

test('discovery, personal, custom, and news feed paging applies safe bounds', () => {
  assert.deepEqual(pageRequest(new URL('https://api.lythaus.co/api/feed/discover')), { limit: 25, cursor: null });
  assert.deepEqual(pageRequest(new URL(`https://api.lythaus.co/api/feed/discover?limit=999&cursor=${encodeCursor(cursor)}`)), {
    limit: 50,
    cursor,
  });
  assert.throws(() => pageRequest(new URL('https://api.lythaus.co/api/feed/discover?limit=0')), /invalid_page_limit/);
  assert.throws(() => pageRequest(new URL('https://api.lythaus.co/api/feed/discover?limit=1.5')), /invalid_page_limit/);
});

test('custom feed rules are allowlisted and reject malformed targeting', () => {
  assert.deepEqual(normalizeCustomFeedRules([{ topic: 'Local news' }, { regionCode: 'ZA-GP' }, { topic: 'Science', regionCode: 'US-CA' }]), [
    { topic: 'Local news' },
    { regionCode: 'ZA-GP' },
    { topic: 'Science', regionCode: 'US-CA' },
  ]);
  assert.throws(() => normalizeCustomFeedRules('not-an-array'), /invalid_custom_feed_rules/);
  assert.throws(() => normalizeCustomFeedRules(Array.from({ length: 21 }, () => ({ topic: 'too many' }))), /invalid_custom_feed_rules/);
  assert.throws(() => normalizeCustomFeedRules([null]), /invalid_custom_feed_rule/);
  assert.throws(() => normalizeCustomFeedRules([[]]), /invalid_custom_feed_rule/);
  assert.throws(() => normalizeCustomFeedRules([{ topic: 'ok', hidden: true }]), /invalid_custom_feed_rule/);
  assert.throws(() => normalizeCustomFeedRules([{ topic: 'contains/slash' }]), /invalid_custom_feed_rule/);
  assert.throws(() => normalizeCustomFeedRules([{ regionCode: 'lower-case' }]), /invalid_custom_feed_rule/);
  assert.throws(() => normalizeCustomFeedRules([{}]), /invalid_custom_feed_rule/);
});

test('public reputation bands remain categorical for every feed surface', () => {
  assert.equal(reputationBand(0), 'new');
  assert.equal(reputationBand(1), 'accountable');
  assert.equal(reputationBand(3), 'trusted');
  assert.equal(reputationBand(4), 'established');
});
