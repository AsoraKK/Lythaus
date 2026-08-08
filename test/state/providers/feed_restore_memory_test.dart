import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';

FeedItem _item(String id) {
  return FeedItem(
    id: id,
    feedId: 'discover',
    author: 'author',
    title: 'title',
    body: 'body',
    contentType: ContentType.text,
    publishedAt: DateTime.parse('2026-01-01T00:00:00Z'),
  );
}

void main() {
  test('restores offset when last visible item is still present', () {
    const snapshot = FeedRestoreSnapshot(
      lastVisibleItemId: 'post-2',
      offset: 260,
    );
    final result = computeFeedRestoreResult(
      items: [_item('post-1'), _item('post-2'), _item('post-3')],
      snapshot: snapshot,
    );

    expect(result.offset, 260);
    expect(result.usedFallback, isFalse);
    expect(result.showNewPostsPill, isFalse);
  });

  test('falls back to top and shows new posts pill when item missing', () {
    const snapshot = FeedRestoreSnapshot(
      lastVisibleItemId: 'post-missing',
      offset: 380,
    );
    final result = computeFeedRestoreResult(
      items: [_item('post-1'), _item('post-2')],
      snapshot: snapshot,
    );

    expect(result.offset, 0);
    expect(result.usedFallback, isTrue);
    expect(result.showNewPostsPill, isTrue);
  });
}
