import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/state/models/feed_models.dart' as state;
import 'package:lythaus/state/providers/feed_providers.dart';

class FakeSocialFeedRepository implements SocialFeedRepository {
  int trendingCalls = 0;
  bool throwOnTrending = false;
  final List<String?> searchedTags = [];
  final List<String?> discoverCursors = [];
  final List<String?> discoverTokens = [];
  final List<FeedRequestCancellation?> discoverCancellations = [];

  Post _post(String id) {
    return Post(
      id: id,
      authorId: 'author-$id',
      authorUsername: 'author-$id',
      text: 'post $id',
      createdAt: DateTime(2024, 1, 1),
    );
  }

  FeedResponse _feed(String id, {bool hasMore = false, int page = 1}) {
    return FeedResponse(
      posts: [_post(id)],
      totalCount: 2,
      hasMore: hasMore,
      page: page,
      pageSize: 20,
    );
  }

  @override
  Future<FeedResponse> getFeed({
    required FeedParams params,
    String? token,
  }) async {
    return _feed(
      'feed-${params.page}',
      hasMore: params.page == 1,
      page: params.page,
    );
  }

  @override
  Future<FeedResponse> getDiscoverFeed({
    String? cursor,
    int limit = 25,
    String? token,
    String? tag,
    FeedRequestCancellation? cancellation,
  }) async {
    searchedTags.add(tag);
    discoverCursors.add(cursor);
    discoverTokens.add(token);
    discoverCancellations.add(cancellation);
    if (tag != null) {
      if (cursor == null) {
        return FeedResponse(
          posts: [_post('search-1')],
          totalCount: 1,
          hasMore: true,
          nextCursor: 'cursor-1',
          page: 1,
          pageSize: limit,
        );
      }
      return FeedResponse(
        posts: [_post('search-1'), _post('search-2')],
        totalCount: 2,
        hasMore: false,
        page: 2,
        pageSize: limit,
      );
    }
    return _feed('discover', hasMore: cursor != null);
  }

  @override
  Future<FeedResponse> getNewsFeed({
    String? cursor,
    int limit = 25,
    String? token,
  }) async {
    return _feed('news', hasMore: cursor != null);
  }

  @override
  Future<FeedResponse> getUserFeed({
    required String userId,
    String? cursor,
    int limit = 25,
    String? token,
    bool includeReplies = false,
  }) async {
    return _feed('user-$userId', hasMore: includeReplies);
  }

  @override
  Future<FeedResponse> getTrendingFeed({
    int page = 1,
    int pageSize = 20,
    String? token,
  }) async {
    trendingCalls += 1;
    if (throwOnTrending && trendingCalls > 1) {
      throw const SocialFeedException('boom');
    }
    return _feed('trending-$page', hasMore: page == 1, page: page);
  }

  @override
  Future<FeedResponse> getLocalFeed({
    required String location,
    double? radius,
    int page = 1,
    int pageSize = 20,
    String? token,
  }) async {
    return _feed('local-$page', hasMore: page == 1, page: page);
  }

  @override
  Future<FeedResponse> getNewCreatorsFeed({
    int page = 1,
    int pageSize = 20,
    String? token,
  }) async {
    return _feed('new-$page', hasMore: page == 1, page: page);
  }

  @override
  Future<FeedResponse> getFollowingFeed({
    int page = 1,
    int pageSize = 20,
    required String token,
  }) async {
    return _feed('following-$page', hasMore: page == 1, page: page);
  }

  @override
  Future<Post> getPost({required String postId, String? token}) async {
    return _post(postId);
  }

  @override
  Future<Post> likePost({
    required String postId,
    required bool isLike,
    required String token,
  }) async {
    return _post(postId);
  }

  @override
  Future<Post> dislikePost({
    required String postId,
    required bool isDislike,
    required String token,
  }) async {
    return _post(postId);
  }

  @override
  Future<List<Comment>> getComments({
    required String postId,
    int page = 1,
    int pageSize = 50,
    String? token,
  }) async {
    return [
      Comment(
        id: 'c$page',
        postId: postId,
        authorId: 'author',
        authorUsername: 'author',
        text: 'comment',
        createdAt: DateTime(2024, 1, 1),
      ),
    ];
  }

  @override
  Future<void> flagPost({
    required String postId,
    required String reason,
    String? details,
    required String token,
  }) async {}
}

void main() {
  test('feedProvider builds and loads more', () async {
    final repo = FakeSocialFeedRepository();
    final container = ProviderContainer(
      overrides: [
        socialFeedServiceProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    const params = FeedParams(type: FeedType.notable, page: 1);
    final initial = await container.read(feedProvider(params).future);
    expect(initial.posts, hasLength(1));

    await container.read(feedProvider(params).notifier).loadMore();
    final state = container.read(feedProvider(params));
    expect(state.value?.posts.length, 2);
  });

  test('trendingFeedNotifier restores previous state on error', () async {
    final repo = FakeSocialFeedRepository()..throwOnTrending = true;
    final container = ProviderContainer(
      overrides: [
        socialFeedServiceProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    await container.read(trendingFeedProvider.future);
    await container.read(trendingFeedProvider.notifier).loadMore();

    final state = container.read(trendingFeedProvider);
    expect(state.value?.posts.length, 1);
  });

  test('local and new creators providers load more', () async {
    final repo = FakeSocialFeedRepository();
    final container = ProviderContainer(
      overrides: [
        socialFeedServiceProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    const localParams = LocalFeedParams(location: 'Cape Town');
    await container.read(localFeedProvider(localParams).future);
    await container.read(localFeedProvider(localParams).notifier).loadMore();

    final localState = container.read(localFeedProvider(localParams));
    expect(localState.value?.posts.length, 2);

    await container.read(newCreatorsFeedProvider.future);
    await container.read(newCreatorsFeedProvider.notifier).loadMore();

    final newCreators = container.read(newCreatorsFeedProvider);
    expect(newCreators.value?.posts.length, 2);
  });

  test('post and comments notifiers use repository responses', () async {
    final repo = FakeSocialFeedRepository();
    final container = ProviderContainer(
      overrides: [
        socialFeedServiceProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    await container.read(postProvider('post-1').future);
    await expectLater(
      container.read(postProvider('post-1').notifier).toggleLike(),
      completes,
    );

    const params = CommentsParams(postId: 'post-1');
    await container.read(commentsProvider(params).future);
    await container.read(commentsProvider(params).notifier).loadMore();

    final commentsState = container.read(commentsProvider(params));
    expect(commentsState.value?.length, 2);
  });

  test('post notifier requires auth for dislike and flag actions', () async {
    final repo = FakeSocialFeedRepository();
    final container = ProviderContainer(
      overrides: [
        socialFeedServiceProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => null),
      ],
    );
    addTearDown(container.dispose);

    await container.read(postProvider('post-2').future);

    await expectLater(
      container.read(postProvider('post-2').notifier).toggleDislike(),
      throwsA(isA<SocialFeedException>()),
    );

    await expectLater(
      container.read(postProvider('post-2').notifier).flagPost(reason: 'spam'),
      throwsA(isA<SocialFeedException>()),
    );
  });

  test('refresh methods rebuild feed providers', () async {
    final repo = FakeSocialFeedRepository();
    final container = ProviderContainer(
      overrides: [
        socialFeedServiceProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => 'token'),
      ],
    );
    addTearDown(container.dispose);

    const params = FeedParams(type: FeedType.notable, page: 1);
    await container.read(feedProvider(params).future);
    await container.read(feedProvider(params).notifier).refresh();

    await container.read(trendingFeedProvider.future);
    await container.read(trendingFeedProvider.notifier).refresh();

    const localParams = LocalFeedParams(location: 'Johannesburg');
    await container.read(localFeedProvider(localParams).future);
    await container.read(localFeedProvider(localParams).notifier).refresh();

    await container.read(newCreatorsFeedProvider.future);
    await container.read(newCreatorsFeedProvider.notifier).refresh();

    const commentParams = CommentsParams(postId: 'post-2');
    await container.read(commentsProvider(commentParams).future);
    await container.read(commentsProvider(commentParams).notifier).refresh();
  });

  test('guest tag search loads pages and removes duplicate posts', () async {
    final repo = FakeSocialFeedRepository();
    final container = ProviderContainer(
      overrides: [
        socialFeedServiceProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => null),
      ],
    );
    addTearDown(container.dispose);

    const key = (tag: 'tag', tokenVersion: 0);
    final initial = await container.read(feedSearchProvider(key).future);
    expect(initial.posts.map((post) => post.id), ['search-1']);
    expect(repo.searchedTags, ['tag']);
    expect(repo.discoverTokens.single, isNull);

    await container.read(feedSearchProvider(key).notifier).loadMore();
    final paged = container.read(feedSearchProvider(key)).value!;
    expect(paged.posts.map((post) => post.id), ['search-1', 'search-2']);
    expect(repo.discoverCursors, [null, 'cursor-1']);

    container.invalidate(feedSearchProvider(key));
    await container.pump();
    await container.read(feedSearchProvider(key).future);
    expect(repo.discoverCursors.last, isNull);
    expect(repo.discoverCancellations.first?.isCancelled, isTrue);
  });

  test(
    'search identity changes with the authentication token version',
    () async {
      final repo = FakeSocialFeedRepository();
      final container = ProviderContainer(
        overrides: [
          socialFeedServiceProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async {
            final version = ref.watch(tokenVersionProvider);
            return 'token-$version';
          }),
        ],
      );
      addTearDown(container.dispose);

      const oldKey = (tag: 'tag', tokenVersion: 0);
      const newKey = (tag: 'tag', tokenVersion: 1);
      await container.read(feedSearchProvider(oldKey).future);
      container.read(tokenVersionProvider.notifier).state = 1;
      await container.pump();
      await container.read(feedSearchProvider(newKey).future);

      expect(repo.discoverTokens, ['token-0', 'token-1']);
      expect(repo.discoverCancellations.first?.isCancelled, isTrue);
    },
  );

  test('live feed provider maps posts and home feed index', () async {
    final repo = FakeSocialFeedRepository();
    const feed = state.FeedModel(
      id: 'discover',
      name: 'Discover',
      type: state.FeedType.discover,
      contentFilters: state.ContentFilters(
        allowedTypes: {state.ContentType.mixed},
      ),
      sorting: state.SortingRule.hot,
      refinements: state.FeedRefinements(),
      subscriptionLevelRequired: 0,
      isHome: true,
    );

    final container = ProviderContainer(
      overrides: [
        socialFeedServiceProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => 'token'),
        feedListProvider.overrideWithValue([feed]),
      ],
    );
    addTearDown(container.dispose);

    final items = await container.read(liveFeedItemsProvider(feed).future);
    expect(items, hasLength(1));

    final index = container.read(currentFeedIndexProvider);
    final current = container.read(currentFeedProvider);
    expect(index, 0);
    expect(current.id, 'discover');
  });
}
