// ignore_for_file: public_member_api_docs

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/domain/models.dart';

void main() {
  group('FeedResponse', () {
    test('can be constructed with required fields', () {
      const response = FeedResponse(
        posts: [],
        totalCount: 0,
        hasMore: false,
        page: 1,
        pageSize: 20,
      );

      expect(response.posts, isEmpty);
      expect(response.totalCount, equals(0));
      expect(response.hasMore, isFalse);
      expect(response.nextCursor, isNull);
      expect(response.page, equals(1));
      expect(response.pageSize, equals(20));
    });

    test('can include nextCursor for pagination', () {
      const response = FeedResponse(
        posts: [],
        totalCount: 100,
        hasMore: true,
        nextCursor: 'page_2_cursor',
        page: 1,
        pageSize: 20,
      );

      expect(response.nextCursor, equals('page_2_cursor'));
      expect(response.hasMore, isTrue);
      expect(response.totalCount, equals(100));
    });

    test('can be created from cursor factory', () {
      final response = FeedResponse.fromCursor(
        posts: [],
        nextCursor: 'next_cursor',
        limit: 25,
      );

      expect(response.posts, isEmpty);
      expect(response.nextCursor, equals('next_cursor'));
      expect(response.hasMore, isTrue);
      expect(response.pageSize, equals(25));
    });

    test('fromCursor defaults to limit 20', () {
      final response = FeedResponse.fromCursor(posts: [], nextCursor: null);

      expect(response.pageSize, equals(20));
      expect(response.hasMore, isFalse);
    });

    test('can be constructed with posts', () {
      final post = Post(
        id: 'post1',
        authorId: 'user1',
        authorUsername: 'john_doe',
        text: 'Hello world',
        createdAt: DateTime.now(),
        likeCount: 10,
        dislikeCount: 2,
        commentCount: 5,
      );

      final response = FeedResponse(
        posts: [post],
        totalCount: 1,
        hasMore: false,
        page: 1,
        pageSize: 20,
      );

      expect(response.posts, hasLength(1));
      expect(response.posts.first.id, equals('post1'));
      expect(response.posts.first.authorUsername, equals('john_doe'));
    });

    test('can parse from JSON', () {
      final json = {
        'posts': [
          {
            'id': 'post1',
            'authorId': 'user1',
            'authorUsername': 'jane_doe',
            'text': 'Test post',
            'createdAt': '2026-01-18T10:00:00Z',
            'likeCount': 5,
            'dislikeCount': 1,
            'commentCount': 3,
          },
        ],
        'totalCount': 50,
        'hasMore': true,
        'nextCursor': 'cursor_next',
        'page': 1,
        'pageSize': 20,
      };

      final response = FeedResponse.fromJson(json);

      expect(response.posts, hasLength(1));
      expect(response.totalCount, equals(50));
      expect(response.hasMore, isTrue);
      expect(response.nextCursor, equals('cursor_next'));
    });

    test('fromJson handles empty posts', () {
      final json = {
        'posts': <Map<String, dynamic>>[],
        'totalCount': 0,
        'hasMore': false,
        'page': 1,
        'pageSize': 20,
      };

      final response = FeedResponse.fromJson(json);

      expect(response.posts, isEmpty);
      expect(response.totalCount, equals(0));
    });

    test('fromJson handles missing fields with defaults', () {
      final json = {'posts': <Map<String, dynamic>>[]};

      final response = FeedResponse.fromJson(json);

      expect(response.totalCount, equals(0));
      expect(response.hasMore, isFalse);
      expect(response.page, equals(1));
      expect(response.pageSize, equals(20));
    });

    test('tracks pagination state correctly', () {
      // First page
      const page1 = FeedResponse(
        posts: [],
        totalCount: 100,
        hasMore: true,
        nextCursor: 'cursor_2',
        page: 1,
        pageSize: 20,
      );

      expect(page1.page, equals(1));
      expect(page1.hasMore, isTrue);

      // Last page
      const lastPage = FeedResponse(
        posts: [],
        totalCount: 100,
        hasMore: false,
        nextCursor: null,
        page: 5,
        pageSize: 20,
      );

      expect(lastPage.page, equals(5));
      expect(lastPage.hasMore, isFalse);
      expect(lastPage.nextCursor, isNull);
    });
  });

  group('FeedParams', () {
    test('can be constructed with defaults', () {
      const params = FeedParams();

      expect(params.page, equals(1));
      expect(params.pageSize, equals(20));
      expect(params.type, equals(FeedType.notable));
      expect(params.cursor, isNull);
      expect(params.location, isNull);
      expect(params.tags, isNull);
      expect(params.category, isNull);
    });

    test('can be constructed with custom values', () {
      const params = FeedParams(
        page: 2,
        pageSize: 50,
        type: FeedType.newest,
        cursor: 'page_2_cursor',
        location: 'New York',
        tags: ['flutter', 'dart'],
        category: 'Technology',
      );

      expect(params.page, equals(2));
      expect(params.pageSize, equals(50));
      expect(params.type, equals(FeedType.newest));
      expect(params.cursor, equals('page_2_cursor'));
      expect(params.location, equals('New York'));
      expect(params.tags, equals(['flutter', 'dart']));
      expect(params.category, equals('Technology'));
    });

    test('supports all FeedType values', () {
      expect(
        const FeedParams(type: FeedType.notable).type,
        equals(FeedType.notable),
      );
      expect(
        const FeedParams(type: FeedType.newest).type,
        equals(FeedType.newest),
      );
      expect(
        const FeedParams(type: FeedType.local).type,
        equals(FeedType.local),
      );
      expect(
        const FeedParams(type: FeedType.following).type,
        equals(FeedType.following),
      );
      expect(
        const FeedParams(type: FeedType.newCreators).type,
        equals(FeedType.newCreators),
      );
    });

    test('can convert to JSON', () {
      const params = FeedParams(
        page: 1,
        pageSize: 20,
        type: FeedType.local,
        location: 'San Francisco',
      );

      final json = params.toJson();

      expect(json['page'], equals(1));
      expect(json['pageSize'], equals(20));
      expect(json['type'], equals('local'));
      expect(json['location'], equals('San Francisco'));
    });

    test('toJson excludes null optional fields', () {
      const params = FeedParams(page: 1, pageSize: 20, type: FeedType.notable);

      final json = params.toJson();

      expect(json.containsKey('cursor'), isFalse);
      expect(json.containsKey('location'), isFalse);
      expect(json.containsKey('tags'), isFalse);
      expect(json.containsKey('category'), isFalse);
    });

    test('toJson includes provided optional fields', () {
      const params = FeedParams(
        page: 1,
        pageSize: 20,
        type: FeedType.following,
        cursor: 'next_page',
        tags: ['news', 'important'],
      );

      final json = params.toJson();

      expect(json['cursor'], equals('next_page'));
      expect(json['tags'], equals(['news', 'important']));
      expect(json.containsKey('location'), isFalse);
      expect(json.containsKey('category'), isFalse);
    });

    test('handles pagination correctly', () {
      const params1 = FeedParams(page: 1, pageSize: 25);
      const params2 = FeedParams(page: 2, pageSize: 25);
      const params3 = FeedParams(page: 10, pageSize: 25);

      expect(params1.page, equals(1));
      expect(params2.page, equals(2));
      expect(params3.page, equals(10));
      expect(params1.pageSize, equals(params2.pageSize));
    });

    test('supports cursor-based pagination', () {
      const params = FeedParams(
        page: 1,
        pageSize: 20,
        type: FeedType.newest,
        cursor: 'abc123def456',
      );

      expect(params.cursor, equals('abc123def456'));
      final json = params.toJson();
      expect(json['cursor'], equals('abc123def456'));
    });
  });

  group('FeedType enum', () {
    test('has all expected values', () {
      expect(FeedType.values, hasLength(5));
      expect(FeedType.values, contains(FeedType.notable));
      expect(FeedType.values, contains(FeedType.newest));
      expect(FeedType.values, contains(FeedType.local));
      expect(FeedType.values, contains(FeedType.following));
      expect(FeedType.values, contains(FeedType.newCreators));
    });

    test('can be converted to string', () {
      expect(FeedType.notable.name, equals('notable'));
      expect(FeedType.newest.name, equals('newest'));
      expect(FeedType.local.name, equals('local'));
      expect(FeedType.following.name, equals('following'));
      expect(FeedType.newCreators.name, equals('newCreators'));
    });
  });
}
