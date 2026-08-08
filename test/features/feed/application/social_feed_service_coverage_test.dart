import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/feed/application/social_feed_service.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';

/// Adapter returning scripted JSON.
class _ScriptedAdapter implements HttpClientAdapter {
  ResponseBody? _response;
  DioException? _error;

  void respondWith(Map<String, dynamic> body, {int statusCode = 200}) {
    _response = ResponseBody.fromString(
      jsonEncode(body),
      statusCode,
      headers: {
        'content-type': ['application/json'],
      },
    );
    _error = null;
  }

  void failWith(DioException error) {
    _error = error;
    _response = null;
  }

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (_error != null) throw _error!;
    return _response!;
  }

  @override
  void close({bool force = false}) {}
}

Dio _buildDio(_ScriptedAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
  dio.httpClientAdapter = adapter;
  return dio;
}

void main() {
  late _ScriptedAdapter adapter;
  late SocialFeedService service;

  setUp(() {
    adapter = _ScriptedAdapter();
    service = SocialFeedService(
      _buildDio(adapter),
      baseUrl: 'http://localhost/api',
    );
  });

  // ─────── getFeed ───────

  group('getFeed', () {
    test('returns parsed FeedResponse on success', () async {
      adapter.respondWith({
        'success': true,
        'data': {
          'posts': <dynamic>[],
          'hasMore': false,
          'totalCount': 0,
          'page': 1,
          'pageSize': 20,
        },
      });

      final result = await service.getFeed(
        params: const FeedParams(type: FeedType.notable),
      );
      expect(result.posts, isEmpty);
      expect(result.hasMore, isFalse);
    });

    test('throws when success false', () async {
      adapter.respondWith({'success': false, 'message': 'Bad request'});

      expect(
        () => service.getFeed(params: const FeedParams(type: FeedType.notable)),
        throwsA(isA<SocialFeedException>()),
      );
    });

    test('throws when data payload is not a map', () async {
      adapter.respondWith({'success': true, 'data': 'string'});

      expect(
        () => service.getFeed(params: const FeedParams(type: FeedType.notable)),
        throwsA(isA<SocialFeedException>()),
      );
    });

    test('throws on null response data', () async {
      adapter.respondWith(<String, dynamic>{});

      expect(
        () => service.getFeed(params: const FeedParams(type: FeedType.notable)),
        throwsA(anything),
      );
    });
  });

  // ─────── getPost ───────

  group('getPost', () {
    test('returns post on success', () async {
      adapter.respondWith({
        'success': true,
        'post': {
          'id': 'p1',
          'text': 'hello',
          'authorId': 'u1',
          'authorUsername': 'user1',
          'createdAt': '2024-01-01T00:00:00Z',
        },
      });

      final post = await service.getPost(postId: 'p1');
      expect(post.id, 'p1');
    });

    test('returns post with auth token', () async {
      adapter.respondWith({
        'success': true,
        'post': {
          'id': 'p2',
          'text': 'hi',
          'authorId': 'u2',
          'authorUsername': 'user2',
          'createdAt': '2024-01-01T00:00:00Z',
        },
      });

      final post = await service.getPost(postId: 'p2', token: 'tok');
      expect(post.id, 'p2');
    });

    test('throws when post payload not a map', () async {
      adapter.respondWith({'success': true, 'post': 'bad'});

      expect(
        () => service.getPost(postId: 'p1'),
        throwsA(isA<SocialFeedException>()),
      );
    });

    test('throws when success false', () async {
      adapter.respondWith({'success': false, 'message': 'Not found'});

      expect(
        () => service.getPost(postId: 'p1'),
        throwsA(isA<SocialFeedException>()),
      );
    });
  });

  // ─────── likePost ───────

  group('likePost', () {
    test('returns updated post on success', () async {
      adapter.respondWith({
        'success': true,
        'post': {
          'id': 'p1',
          'text': 'hello',
          'authorId': 'u1',
          'authorUsername': 'user1',
          'createdAt': '2024-01-01T00:00:00Z',
        },
      });

      final post = await service.likePost(
        postId: 'p1',
        isLike: true,
        token: 'tok',
      );
      expect(post.id, 'p1');
    });

    test('un-like)', () async {
      adapter.respondWith({
        'success': true,
        'post': {
          'id': 'p1',
          'text': 'hello',
          'authorId': 'u1',
          'authorUsername': 'user1',
          'createdAt': '2024-01-01T00:00:00Z',
        },
      });

      final post = await service.likePost(
        postId: 'p1',
        isLike: false,
        token: 'tok',
      );
      expect(post.id, 'p1');
    });

    test('throws when success false', () async {
      adapter.respondWith({'success': false, 'message': 'Limit reached'});

      expect(
        () => service.likePost(postId: 'p1', isLike: true, token: 'tok'),
        throwsA(isA<SocialFeedException>()),
      );
    });
  });

  // ─────── dislikePost ───────

  group('dislikePost', () {
    test('returns updated post on success', () async {
      adapter.respondWith({
        'success': true,
        'post': {
          'id': 'p1',
          'text': 'hello',
          'authorId': 'u1',
          'authorUsername': 'user1',
          'createdAt': '2024-01-01T00:00:00Z',
        },
      });

      final post = await service.dislikePost(
        postId: 'p1',
        isDislike: true,
        token: 'tok',
      );
      expect(post.id, 'p1');
    });

    test('remove dislike', () async {
      adapter.respondWith({
        'success': true,
        'post': {
          'id': 'p1',
          'text': 'hello',
          'authorId': 'u1',
          'authorUsername': 'user1',
          'createdAt': '2024-01-01T00:00:00Z',
        },
      });

      final post = await service.dislikePost(
        postId: 'p1',
        isDislike: false,
        token: 'tok',
      );
      expect(post.id, 'p1');
    });

    test('throws when success false', () async {
      adapter.respondWith({'success': false, 'message': 'Failed'});

      expect(
        () => service.dislikePost(postId: 'p1', isDislike: true, token: 'tok'),
        throwsA(isA<SocialFeedException>()),
      );
    });
  });

  // ─────── getComments ───────

  group('getComments', () {
    test('returns list of comments on success', () async {
      adapter.respondWith({
        'success': true,
        'comments': <dynamic>[
          {
            'id': 'c1',
            'text': 'nice',
            'postId': 'p1',
            'authorId': 'u1',
            'authorUsername': 'user1',
            'createdAt': '2024-01-01T00:00:00Z',
          },
        ],
      });

      final comments = await service.getComments(postId: 'p1');
      expect(comments, hasLength(1));
      expect(comments.first.id, 'c1');
    });

    test('throws when comments not a list', () async {
      adapter.respondWith({'success': true, 'comments': 'bad'});

      expect(
        () => service.getComments(postId: 'p1'),
        throwsA(isA<SocialFeedException>()),
      );
    });

    test('throws when success false', () async {
      adapter.respondWith({'success': false, 'message': 'Cannot load'});

      expect(
        () => service.getComments(postId: 'p1'),
        throwsA(isA<SocialFeedException>()),
      );
    });
  });

  // ─────── flagPost ───────

  group('flagPost', () {
    test('completes on success', () async {
      adapter.respondWith({'success': true});

      await service.flagPost(postId: 'p1', reason: 'spam', token: 'tok');
    });

    test('includes details', () async {
      adapter.respondWith({'success': true});

      await service.flagPost(
        postId: 'p1',
        reason: 'spam',
        details: 'details here',
        token: 'tok',
      );
    });

    test('throws when success not true', () async {
      adapter.respondWith({'success': false, 'message': 'Already flagged'});

      expect(
        () => service.flagPost(postId: 'p1', reason: 'spam', token: 'tok'),
        throwsA(isA<SocialFeedException>()),
      );
    });
  });

  // ─────── _handleError ───────

  group('_handleError (via DioException in getPost)', () {
    test('maps DEVICE_INTEGRITY_BLOCKED to SocialFeedException', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/posts/p1'),
          response: Response(
            requestOptions: RequestOptions(path: '/api/posts/p1'),
            statusCode: 403,
            data: {'code': 'DEVICE_INTEGRITY_BLOCKED'},
          ),
          type: DioExceptionType.badResponse,
        ),
      );

      try {
        await service.getPost(postId: 'p1');
        fail('Should have thrown');
      } on SocialFeedException catch (e) {
        expect(e.code, 'DEVICE_INTEGRITY_BLOCKED');
      }
    });

    test('maps nested DEVICE_INTEGRITY_BLOCKED', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/posts/p1'),
          response: Response(
            requestOptions: RequestOptions(path: '/api/posts/p1'),
            statusCode: 403,
            data: {
              'error': {'code': 'DEVICE_INTEGRITY_BLOCKED'},
            },
          ),
          type: DioExceptionType.badResponse,
        ),
      );

      try {
        await service.getPost(postId: 'p1');
        fail('Should have thrown');
      } on SocialFeedException catch (e) {
        expect(e.code, 'DEVICE_INTEGRITY_BLOCKED');
      }
    });

    test('maps generic DioException to NETWORK_ERROR', () async {
      adapter.failWith(
        DioException(
          requestOptions: RequestOptions(path: '/api/posts/p1'),
          type: DioExceptionType.connectionTimeout,
          message: 'timeout',
        ),
      );

      try {
        await service.getPost(postId: 'p1');
        fail('Should have thrown');
      } on SocialFeedException catch (e) {
        expect(e.code, 'NETWORK_ERROR');
      }
    });
  });

  // ─────── getTrendingFeed / getLocalFeed / getNewCreatorsFeed / getFollowingFeed ───────

  group('getTrendingFeed', () {
    test('returns parsed response', () async {
      adapter.respondWith({
        'success': true,
        'data': {
          'posts': <dynamic>[],
          'hasMore': false,
          'totalCount': 0,
          'page': 1,
          'pageSize': 20,
        },
      });

      final result = await service.getTrendingFeed();
      expect(result.posts, isEmpty);
    });
  });

  group('getLocalFeed', () {
    test('returns parsed response', () async {
      adapter.respondWith({
        'success': true,
        'data': {
          'posts': <dynamic>[],
          'hasMore': false,
          'totalCount': 0,
          'page': 1,
          'pageSize': 20,
        },
      });

      final result = await service.getLocalFeed(location: 'NYC');
      expect(result.posts, isEmpty);
    });

    test('with radius parameter', () async {
      adapter.respondWith({
        'success': true,
        'data': {
          'posts': <dynamic>[],
          'hasMore': false,
          'totalCount': 0,
          'page': 1,
          'pageSize': 20,
        },
      });

      final result = await service.getLocalFeed(location: 'NYC', radius: 10.0);
      expect(result.posts, isEmpty);
    });
  });

  group('getNewCreatorsFeed', () {
    test('returns parsed response', () async {
      adapter.respondWith({
        'success': true,
        'data': {
          'posts': <dynamic>[],
          'hasMore': false,
          'totalCount': 0,
          'page': 1,
          'pageSize': 20,
        },
      });

      final result = await service.getNewCreatorsFeed();
      expect(result.posts, isEmpty);
    });
  });

  group('getFollowingFeed', () {
    test('returns parsed response', () async {
      adapter.respondWith({
        'success': true,
        'data': {
          'posts': <dynamic>[],
          'hasMore': false,
          'totalCount': 0,
          'page': 1,
          'pageSize': 20,
        },
      });

      final result = await service.getFollowingFeed(token: 'tok');
      expect(result.posts, isEmpty);
    });
  });

  group('getUserFeed', () {
    test('returns parsed response', () async {
      adapter.respondWith({'items': <dynamic>[], 'nextCursor': null});

      final result = await service.getUserFeed(userId: 'u1');
      expect(result.posts, isEmpty);
    });

    test('with includeReplies', () async {
      adapter.respondWith({'items': <dynamic>[], 'nextCursor': null});

      final result = await service.getUserFeed(
        userId: 'u1',
        includeReplies: true,
      );
      expect(result.posts, isEmpty);
    });
  });

  // ─────── _handleFeedResponse ───────

  group('_handleFeedResponse (via getTrendingFeed)', () {
    test('throws on null data', () async {
      // Respond with empty map that triggers null/invalid path
      adapter.respondWith(<String, dynamic>{});

      expect(() => service.getTrendingFeed(), throwsA(anything));
    });
  });

  // ─────── LocalFeedParams and CommentsParams ───────

  group('LocalFeedParams', () {
    test('equality', () {
      const a = LocalFeedParams(location: 'NYC');
      const b = LocalFeedParams(location: 'NYC');
      const c = LocalFeedParams(location: 'LA');
      expect(a, equals(b));
      expect(a, isNot(equals(c)));
    });

    test('hashCode', () {
      const a = LocalFeedParams(location: 'NYC');
      const b = LocalFeedParams(location: 'NYC');
      expect(a.hashCode, b.hashCode);
    });
  });

  group('CommentsParams', () {
    test('equality', () {
      const a = CommentsParams(postId: 'p1');
      const b = CommentsParams(postId: 'p1');
      const c = CommentsParams(postId: 'p2');
      expect(a, equals(b));
      expect(a, isNot(equals(c)));
    });

    test('hashCode', () {
      const a = CommentsParams(postId: 'p1');
      const b = CommentsParams(postId: 'p1');
      expect(a.hashCode, b.hashCode);
    });
  });
}
