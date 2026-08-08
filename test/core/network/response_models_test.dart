import 'package:lythaus/core/network/response_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('PostCreateResponse serializes optional fields', () {
    final response = PostCreateResponse.fromJson({
      'success': true,
      'postId': 'post-1',
      'message': 'ok',
      'moderationResult': {'status': 'clean'},
      'createdAt': '2025-01-01T00:00:00Z',
    });

    expect(response.success, isTrue);
    expect(response.postId, 'post-1');
    expect(response.moderationResult?['status'], 'clean');
    expect(response.createdAt, isNotNull);

    final json = response.toJson();
    expect(json['postId'], 'post-1');
    expect(json['moderationResult'], isA<Map<String, dynamic>>());
    expect(json['createdAt'], '2025-01-01T00:00:00.000Z');
  });

  test('PostCreateResponse omits null optional fields', () {
    final response = PostCreateResponse.fromJson({'success': true});
    final json = response.toJson();

    expect(json['success'], isTrue);
    expect(json.containsKey('postId'), isFalse);
    expect(json.containsKey('message'), isFalse);
    expect(json.containsKey('moderationResult'), isFalse);
    expect(json.containsKey('createdAt'), isFalse);
  });

  test('FeedResponse parses feed list and metadata', () {
    final response = FeedResponse.fromJson({
      'success': true,
      'feed': [
        {'id': '1', 'title': 'First'},
        {'id': '2', 'title': 'Second'},
      ],
      'nextCursor': 'cursor-1',
      'metadata': {
        'totalCount': 2,
        'hasMore': true,
        'algorithm': 'ranked',
        'cached': true,
        'cacheExpiry': '2025-01-01T00:00:00Z',
      },
    });

    expect(response.feed.length, 2);
    expect(response.nextCursor, 'cursor-1');
    expect(response.metadata?.totalCount, 2);
    expect(response.metadata?.cacheExpiry, isNotNull);

    final json = response.toJson();
    expect(json['metadata'], isA<Map<String, dynamic>>());
  });

  test('FeedResponse defaults when feed or metadata missing', () {
    final response = FeedResponse.fromJson({
      'success': true,
      'feed': 'not-a-list',
      'metadata': 'invalid',
    });

    expect(response.feed, isEmpty);
    expect(response.metadata, isNull);
  });
}
