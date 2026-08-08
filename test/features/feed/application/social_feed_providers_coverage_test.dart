import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/core/security/device_integrity_guard.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';

import 'package:dio/dio.dart';

class _MockFeedRepo extends Mock implements SocialFeedRepository {}

class _MockGuard extends Mock implements DeviceIntegrityGuard {}

class _FakeDio extends Fake implements Dio {}

FeedResponse _feedWith({
  List<Post> posts = const [],
  bool hasMore = false,
  int page = 1,
}) => FeedResponse(
  posts: posts,
  hasMore: hasMore,
  totalCount: posts.length,
  page: page,
  pageSize: 20,
);

Post _fakePost(String id) => Post(
  id: id,
  authorId: 'a-$id',
  authorUsername: 'user-$id',
  text: 'post $id',
  createdAt: DateTime(2024),
);

void main() {
  late _MockFeedRepo repo;
  late _MockGuard guard;

  setUpAll(() {
    registerFallbackValue(IntegrityUseCase.postContent);
    registerFallbackValue(const FeedParams());
  });

  setUp(() {
    repo = _MockFeedRepo();
    guard = _MockGuard();
    when(
      () => guard.evaluate(any()),
    ).thenAnswer((_) async => DeviceIntegrityDecision.allow());
  });

  ProviderContainer createContainer({String? token = 'test-token'}) {
    return ProviderContainer(
      overrides: [
        socialFeedServiceProvider.overrideWithValue(repo),
        secureDioProvider.overrideWithValue(_FakeDio()),
        deviceIntegrityGuardProvider.overrideWithValue(guard),
        jwtProvider.overrideWith((ref) async => token),
      ],
    );
  }

  group('TrendingFeedNotifier', () {
    test('build fetches initial trending feed', () async {
      when(
        () => repo.getTrendingFeed(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async =>
            _feedWith(posts: [_fakePost('t1'), _fakePost('t2')], hasMore: true),
      );

      final container = createContainer();
      final result = await container.read(trendingFeedProvider.future);

      expect(result.posts, hasLength(2));
      expect(result.hasMore, isTrue);
    });

    test('loadMore merges pages', () async {
      when(
        () => repo.getTrendingFeed(
          page: 1,
          pageSize: any(named: 'pageSize'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async =>
            _feedWith(posts: [_fakePost('t1')], hasMore: true, page: 1),
      );
      when(
        () => repo.getTrendingFeed(
          page: 2,
          pageSize: any(named: 'pageSize'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async =>
            _feedWith(posts: [_fakePost('t2')], hasMore: false, page: 2),
      );

      final container = createContainer();
      // Wait for initial build
      await container.read(trendingFeedProvider.future);

      // Load more
      await container.read(trendingFeedProvider.notifier).loadMore();
      await Future<void>.delayed(const Duration(milliseconds: 100));

      final state = container.read(trendingFeedProvider);
      expect(state.value?.posts, hasLength(2));
      expect(state.value?.hasMore, isFalse);
    });

    test('loadMore restores previous state on error', () async {
      when(
        () => repo.getTrendingFeed(
          page: 1,
          pageSize: any(named: 'pageSize'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => _feedWith(posts: [_fakePost('t1')], hasMore: true),
      );
      when(
        () => repo.getTrendingFeed(
          page: 2,
          pageSize: any(named: 'pageSize'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) => Future.error(Exception('fail')));

      final container = createContainer();
      await container.read(trendingFeedProvider.future);

      await container.read(trendingFeedProvider.notifier).loadMore();
      await Future<void>.delayed(const Duration(milliseconds: 100));

      // State should be restored to previous data
      final state = container.read(trendingFeedProvider);
      expect(state.value?.posts, hasLength(1));
    });

    test('refresh resets to page 1', () async {
      var callCount = 0;
      when(
        () => repo.getTrendingFeed(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async {
        callCount++;
        return _feedWith(posts: [_fakePost('r$callCount')]);
      });

      final container = createContainer();
      await container.read(trendingFeedProvider.future);

      await container.read(trendingFeedProvider.notifier).refresh();
      await Future<void>.delayed(const Duration(milliseconds: 100));

      expect(callCount, greaterThanOrEqualTo(2));
    });
  });

  group('CommentsNotifier', () {
    const params = CommentsParams(postId: 'post-1');

    test('build fetches comments', () async {
      when(
        () => repo.getComments(
          postId: 'post-1',
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => [
          Comment(
            id: 'c1',
            postId: 'post-1',
            authorId: 'u1',
            authorUsername: 'user1',
            text: 'hello',
            createdAt: DateTime(2024),
          ),
        ],
      );

      final container = createContainer();
      final result = await container.read(commentsProvider(params).future);

      expect(result, hasLength(1));
      expect(result.first.id, 'c1');
    });

    test('loadMore appends comments', () async {
      when(
        () => repo.getComments(
          postId: 'post-1',
          page: 1,
          pageSize: any(named: 'pageSize'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => [
          Comment(
            id: 'c1',
            postId: 'post-1',
            authorId: 'u1',
            authorUsername: 'user1',
            text: 'first',
            createdAt: DateTime(2024),
          ),
        ],
      );
      when(
        () => repo.getComments(
          postId: 'post-1',
          page: 2,
          pageSize: any(named: 'pageSize'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => [
          Comment(
            id: 'c2',
            postId: 'post-1',
            authorId: 'u1',
            authorUsername: 'user1',
            text: 'second',
            createdAt: DateTime(2024),
          ),
        ],
      );

      final container = createContainer();
      await container.read(commentsProvider(params).future);

      await container.read(commentsProvider(params).notifier).loadMore();
      await Future<void>.delayed(const Duration(milliseconds: 100));

      final state = container.read(commentsProvider(params));
      expect(state.value, hasLength(2));
    });

    test('refresh resets', () async {
      when(
        () => repo.getComments(
          postId: 'post-1',
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => [
          Comment(
            id: 'c1',
            postId: 'post-1',
            authorId: 'u1',
            authorUsername: 'user1',
            text: 'hello',
            createdAt: DateTime(2024),
          ),
        ],
      );

      final container = createContainer();
      await container.read(commentsProvider(params).future);

      await container.read(commentsProvider(params).notifier).refresh();
      await Future<void>.delayed(const Duration(milliseconds: 100));

      final state = container.read(commentsProvider(params));
      expect(state.value, hasLength(1));
    });
  });

  group('PostNotifier interactions', () {
    test('toggleDislike calls dislikePost', () async {
      final post = Post(
        id: 'p1',
        authorId: 'a1',
        authorUsername: 'alice',
        text: 'hi',
        createdAt: DateTime(2024),
        userDisliked: false,
      );
      final updatedPost = Post(
        id: 'p1',
        authorId: 'a1',
        authorUsername: 'alice',
        text: 'hi',
        createdAt: DateTime(2024),
        userDisliked: true,
      );

      when(
        () => repo.getPost(
          postId: 'p1',
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => post);
      when(
        () => repo.dislikePost(
          postId: 'p1',
          isDislike: true,
          token: 'test-token',
        ),
      ).thenAnswer((_) async => updatedPost);

      final container = createContainer();
      await container.read(postProvider('p1').future);

      await container.read(postProvider('p1').notifier).toggleDislike();
      await Future<void>.delayed(const Duration(milliseconds: 100));

      verify(
        () => repo.dislikePost(
          postId: 'p1',
          isDislike: true,
          token: 'test-token',
        ),
      ).called(1);
    });

    test('toggleDislike throws AUTH_REQUIRED when no token', () async {
      final post = Post(
        id: 'p1',
        authorId: 'a1',
        authorUsername: 'alice',
        text: 'hi',
        createdAt: DateTime(2024),
        userDisliked: false,
      );

      when(
        () => repo.getPost(
          postId: 'p1',
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => post);

      final container = ProviderContainer(
        overrides: [
          socialFeedServiceProvider.overrideWithValue(repo),
          secureDioProvider.overrideWithValue(_FakeDio()),
          deviceIntegrityGuardProvider.overrideWithValue(guard),
          jwtProvider.overrideWith((ref) async => null),
        ],
      );

      await container.read(postProvider('p1').future);

      expect(
        () => container.read(postProvider('p1').notifier).toggleDislike(),
        throwsA(isA<SocialFeedException>()),
      );
    });

    test('flagPost calls flagPost on repo', () async {
      final post = Post(
        id: 'p1',
        authorId: 'a1',
        authorUsername: 'alice',
        text: 'hi',
        createdAt: DateTime(2024),
      );

      when(
        () => repo.getPost(
          postId: 'p1',
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => post);
      when(
        () => repo.flagPost(
          postId: 'p1',
          reason: 'spam',
          details: null,
          token: 'test-token',
        ),
      ).thenAnswer((_) async {});

      final container = createContainer();
      await container.read(postProvider('p1').future);

      await container
          .read(postProvider('p1').notifier)
          .flagPost(reason: 'spam');

      verify(
        () => repo.flagPost(
          postId: 'p1',
          reason: 'spam',
          details: null,
          token: 'test-token',
        ),
      ).called(1);
    });

    test('flagPost throws AUTH_REQUIRED when no token', () async {
      final post = Post(
        id: 'p1',
        authorId: 'a1',
        authorUsername: 'alice',
        text: 'hi',
        createdAt: DateTime(2024),
      );

      when(
        () => repo.getPost(
          postId: 'p1',
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => post);

      final container = ProviderContainer(
        overrides: [
          socialFeedServiceProvider.overrideWithValue(repo),
          secureDioProvider.overrideWithValue(_FakeDio()),
          deviceIntegrityGuardProvider.overrideWithValue(guard),
          jwtProvider.overrideWith((ref) async => null),
        ],
      );

      await container.read(postProvider('p1').future);

      expect(
        () => container
            .read(postProvider('p1').notifier)
            .flagPost(reason: 'spam'),
        throwsA(isA<SocialFeedException>()),
      );
    });
  });

  group('feedSearchProvider', () {
    test('searches with query as tag', () async {
      when(
        () => repo.getFeed(
          params: any(named: 'params'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _feedWith(posts: [_fakePost('s1')]));

      final container = createContainer();
      final result = await container.read(feedSearchProvider('flutter').future);

      expect(result.posts, hasLength(1));
    });
  });
}
