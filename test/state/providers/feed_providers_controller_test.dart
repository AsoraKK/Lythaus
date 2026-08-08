import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/application/custom_feed_service.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';

// ─── Mocks ───
class _MockSocialFeedRepo extends Mock implements SocialFeedRepository {}

class _MockCustomFeedService extends Mock implements CustomFeedService {}

class _FakeDio extends Fake implements Dio {}

// ─── Helpers ───

const _discoverFeed = FeedModel(
  id: 'discover',
  name: 'Discover',
  type: FeedType.discover,
  contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
  sorting: SortingRule.hot,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
  isHome: true,
);

const _newsFeed = FeedModel(
  id: 'news',
  name: 'News',
  type: FeedType.news,
  contentFilters: ContentFilters(
    allowedTypes: {ContentType.text, ContentType.image},
  ),
  sorting: SortingRule.newest,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
);

const _moderationFeed = FeedModel(
  id: 'mod',
  name: 'Mod',
  type: FeedType.moderation,
  contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
  sorting: SortingRule.hot,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
);

const _customFeed = FeedModel(
  id: 'custom-1',
  name: 'My Feed',
  type: FeedType.custom,
  contentFilters: ContentFilters(allowedTypes: {ContentType.text}),
  sorting: SortingRule.newest,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
  isCustom: true,
);

domain.Post _post(String id, {bool isNews = false, List<String>? media}) =>
    domain.Post(
      id: id,
      authorId: 'author-$id',
      authorUsername: 'user_$id',
      text: 'Post $id body text',
      createdAt: DateTime(2024, 1, 1),
      isNews: isNews,
      mediaUrls: media,
    );

domain.FeedResponse _response(List<domain.Post> posts, {String? cursor}) =>
    domain.FeedResponse(
      posts: posts,
      totalCount: posts.length,
      hasMore: cursor != null,
      nextCursor: cursor,
      page: 1,
      pageSize: 25,
    );

ProviderContainer _container({
  required _MockSocialFeedRepo feedRepo,
  _MockCustomFeedService? customService,
  String? token,
}) {
  return ProviderContainer(
    overrides: [
      socialFeedServiceProvider.overrideWithValue(feedRepo),
      if (customService != null)
        customFeedServiceProvider.overrideWithValue(customService),
      jwtProvider.overrideWith((_) async => token ?? 'test-token'),
      secureDioProvider.overrideWithValue(_FakeDio()),
    ],
  );
}

void main() {
  late _MockSocialFeedRepo feedRepo;
  late _MockCustomFeedService customService;

  setUp(() {
    feedRepo = _MockSocialFeedRepo();
    customService = _MockCustomFeedService();
  });

  // ─── feedListProvider ───

  group('feedListProvider', () {
    test('returns system feeds when no custom feeds', () {
      final container = _container(
        feedRepo: feedRepo,
        customService: customService,
      );

      when(
        () => customService.listCustomFeeds(
          token: any(named: 'token'),
          limit: any(named: 'limit'),
        ),
      ).thenAnswer((_) async => const []);

      final feeds = container.read(feedListProvider);
      expect(feeds.length, greaterThanOrEqualTo(2));
      expect(feeds.first.isHome, isTrue);
      expect(feeds.any((f) => f.id == 'discover'), isTrue);
      expect(feeds.any((f) => f.id == 'news'), isTrue);
    });
  });

  // ─── liveFeedItemsProvider ───

  group('liveFeedItemsProvider', () {
    test('returns mapped items for discover feed', () async {
      when(
        () => feedRepo.getDiscoverFeed(
          limit: any(named: 'limit'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => _response([
          _post('1'),
          _post('2', media: ['img.png']),
        ]),
      );

      final container = _container(feedRepo: feedRepo);
      final items = await container.read(
        liveFeedItemsProvider(_discoverFeed).future,
      );

      expect(items, hasLength(2));
      expect(items[0].id, '1');
      expect(items[0].author, 'user_1');
      expect(items[0].contentType, ContentType.text);
      expect(items[1].contentType, ContentType.image);
    });

    test('returns mapped items for news feed', () async {
      when(
        () => feedRepo.getNewsFeed(
          limit: any(named: 'limit'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _response([_post('n1', isNews: true)]));

      final container = _container(feedRepo: feedRepo);
      final items = await container.read(
        liveFeedItemsProvider(_newsFeed).future,
      );

      expect(items, hasLength(1));
      expect(items[0].isNews, isTrue);
    });

    test('returns empty list for moderation feed', () async {
      final container = _container(feedRepo: feedRepo);
      final items = await container.read(
        liveFeedItemsProvider(_moderationFeed).future,
      );

      expect(items, isEmpty);
    });

    test('returns empty list when service throws', () async {
      when(
        () => feedRepo.getDiscoverFeed(
          limit: any(named: 'limit'),
          token: any(named: 'token'),
        ),
      ).thenThrow(Exception('network error'));

      final container = _container(feedRepo: feedRepo);
      final items = await container.read(
        liveFeedItemsProvider(_discoverFeed).future,
      );

      expect(items, isEmpty);
    });

    test('returns custom feed items when token present', () async {
      when(
        () => customService.getCustomFeedItems(
          token: any(named: 'token'),
          feedId: any(named: 'feedId'),
          limit: any(named: 'limit'),
          cursor: any(named: 'cursor'),
        ),
      ).thenAnswer((_) async => _response([_post('c1')]));

      final container = _container(
        feedRepo: feedRepo,
        customService: customService,
        token: 'valid-token',
      );
      final items = await container.read(
        liveFeedItemsProvider(_customFeed).future,
      );

      expect(items, hasLength(1));
      expect(items[0].id, 'c1');
    });

    test('returns empty for custom feed when no token', () async {
      final container = _container(
        feedRepo: feedRepo,
        customService: customService,
        token: '',
      );
      final items = await container.read(
        liveFeedItemsProvider(_customFeed).future,
      );

      expect(items, isEmpty);
    });
  });

  // ─── LiveFeedNotifier via liveFeedStateProvider ───

  group('LiveFeedNotifier', () {
    test('loads initial discover feed', () async {
      when(
        () => feedRepo.getDiscoverFeed(
          cursor: any(named: 'cursor'),
          limit: any(named: 'limit'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _response([_post('d1')], cursor: 'next-1'));

      final container = _container(feedRepo: feedRepo);
      final controller = container.read(
        liveFeedStateProvider(_discoverFeed).notifier,
      );

      // Wait for microtask to complete initial load
      await Future<void>.delayed(const Duration(milliseconds: 200));
      final state = container.read(liveFeedStateProvider(_discoverFeed));

      expect(state.isInitialLoading, isFalse);
      expect(state.items, hasLength(1));
      expect(state.items.first.id, 'd1');
      expect(state.hasMore, isTrue);
      expect(state.nextCursor, 'next-1');
      expect(controller, isNotNull);
    });

    test('loads initial news feed', () async {
      when(
        () => feedRepo.getNewsFeed(
          cursor: any(named: 'cursor'),
          limit: any(named: 'limit'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _response([_post('n1', isNews: true)]));

      final container = _container(feedRepo: feedRepo);
      // Trigger provider creation so async _loadInitial starts
      container.read(liveFeedStateProvider(_newsFeed).notifier);

      await Future<void>.delayed(const Duration(milliseconds: 500));
      final state = container.read(liveFeedStateProvider(_newsFeed));

      expect(state.isInitialLoading, isFalse);
      expect(state.items, hasLength(1));
      expect(state.items.first.isNews, isTrue);
      expect(state.hasMore, isFalse);
    });

    test('moderation feed type returns empty immediately', () async {
      final container = _container(feedRepo: feedRepo);
      container.read(liveFeedStateProvider(_moderationFeed).notifier);

      await Future<void>.delayed(const Duration(milliseconds: 500));
      final state = container.read(liveFeedStateProvider(_moderationFeed));

      expect(state.isInitialLoading, isFalse);
      expect(state.items, isEmpty);
      expect(state.hasMore, isFalse);
    });

    test('loadMore appends new items', () async {
      when(
        () => feedRepo.getDiscoverFeed(
          cursor: any(named: 'cursor'),
          limit: any(named: 'limit'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((inv) async {
        final cursor = inv.namedArguments[#cursor] as String?;
        if (cursor == null) {
          return _response([_post('1')], cursor: 'page2');
        } else {
          return _response([_post('2')]);
        }
      });

      final container = _container(feedRepo: feedRepo);
      final notifier = container.read(
        liveFeedStateProvider(_discoverFeed).notifier,
      );

      await Future<void>.delayed(const Duration(milliseconds: 200));
      var state = container.read(liveFeedStateProvider(_discoverFeed));
      expect(state.items, hasLength(1));
      expect(state.hasMore, isTrue);

      // Load more
      await notifier.loadMore();
      state = container.read(liveFeedStateProvider(_discoverFeed));
      expect(state.items, hasLength(2));
      expect(state.items.last.id, '2');
      expect(state.isLoadingMore, isFalse);
    });

    test('loadMore does nothing when hasMore is false', () async {
      when(
        () => feedRepo.getDiscoverFeed(
          cursor: any(named: 'cursor'),
          limit: any(named: 'limit'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _response([_post('1')]));

      final container = _container(feedRepo: feedRepo);
      final notifier = container.read(
        liveFeedStateProvider(_discoverFeed).notifier,
      );

      await Future<void>.delayed(const Duration(milliseconds: 200));
      var state = container.read(liveFeedStateProvider(_discoverFeed));
      expect(state.hasMore, isFalse);

      await notifier.loadMore();
      state = container.read(liveFeedStateProvider(_discoverFeed));
      // Still same items
      expect(state.items, hasLength(1));
    });

    test('loadMore sets error on failure', () async {
      when(
        () => feedRepo.getDiscoverFeed(
          cursor: any(named: 'cursor'),
          limit: any(named: 'limit'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((inv) async {
        final cursor = inv.namedArguments[#cursor] as String?;
        if (cursor == null) {
          return _response([_post('1')], cursor: 'page2');
        }
        throw Exception('network error');
      });

      final container = _container(feedRepo: feedRepo);
      final notifier = container.read(
        liveFeedStateProvider(_discoverFeed).notifier,
      );

      await Future<void>.delayed(const Duration(milliseconds: 200));
      await notifier.loadMore();

      final state = container.read(liveFeedStateProvider(_discoverFeed));
      expect(state.isLoadingMore, isFalse);
      expect(state.errorMessage, 'Unable to load more items.');
    });

    test('refresh reloads feed from scratch', () async {
      var callCount = 0;
      when(
        () => feedRepo.getDiscoverFeed(
          cursor: any(named: 'cursor'),
          limit: any(named: 'limit'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async {
        callCount++;
        return _response([_post('p$callCount')]);
      });

      final container = _container(feedRepo: feedRepo);
      final notifier = container.read(
        liveFeedStateProvider(_discoverFeed).notifier,
      );

      await Future<void>.delayed(const Duration(milliseconds: 200));
      expect(callCount, 1);
      var state = container.read(liveFeedStateProvider(_discoverFeed));
      expect(state.items.first.id, 'p1');

      await notifier.refresh();
      state = container.read(liveFeedStateProvider(_discoverFeed));
      expect(callCount, 2);
      expect(state.items.first.id, 'p2');
    });

    test('initial load error sets error message', () async {
      when(
        () => feedRepo.getDiscoverFeed(
          cursor: any(named: 'cursor'),
          limit: any(named: 'limit'),
          token: any(named: 'token'),
        ),
      ).thenThrow(Exception('network error'));

      final container = _container(feedRepo: feedRepo);
      container.read(liveFeedStateProvider(_discoverFeed).notifier);

      await Future<void>.delayed(const Duration(milliseconds: 500));
      final state = container.read(liveFeedStateProvider(_discoverFeed));

      expect(state.isInitialLoading, isFalse);
      expect(state.errorMessage, 'Unable to load feed right now.');
    });

    test('custom feed load with auth', () async {
      when(
        () => customService.getCustomFeedItems(
          token: any(named: 'token'),
          feedId: any(named: 'feedId'),
          cursor: any(named: 'cursor'),
          limit: any(named: 'limit'),
        ),
      ).thenAnswer((_) async => _response([_post('c1')]));

      final container = _container(
        feedRepo: feedRepo,
        customService: customService,
        token: 'valid-jwt',
      );
      container.read(liveFeedStateProvider(_customFeed).notifier);

      await Future<void>.delayed(const Duration(milliseconds: 500));
      final state = container.read(liveFeedStateProvider(_customFeed));

      expect(state.items, hasLength(1));
      expect(state.items.first.id, 'c1');
    });

    test('custom feed without auth throws and sets error', () async {
      final container = _container(
        feedRepo: feedRepo,
        customService: customService,
        token: '',
      );
      container.read(liveFeedStateProvider(_customFeed).notifier);

      await Future<void>.delayed(const Duration(milliseconds: 500));
      final state = container.read(liveFeedStateProvider(_customFeed));

      expect(state.errorMessage, 'Unable to load feed right now.');
    });
  });

  // ─── customFeedsProvider ───

  group('customFeedsProvider', () {
    test('returns empty when no token', () async {
      final container = _container(
        feedRepo: feedRepo,
        customService: customService,
        token: '',
      );

      final feeds = await container.read(customFeedsProvider.future);
      expect(feeds, isEmpty);
    });

    test('returns feeds from service', () async {
      when(
        () => customService.listCustomFeeds(
          token: any(named: 'token'),
          limit: any(named: 'limit'),
        ),
      ).thenAnswer((_) async => [_customFeed]);

      final container = _container(
        feedRepo: feedRepo,
        customService: customService,
        token: 'valid-token',
      );

      final feeds = await container.read(customFeedsProvider.future);
      expect(feeds, hasLength(1));
      expect(feeds.first.id, 'custom-1');
    });

    test('returns empty on service error', () async {
      when(
        () => customService.listCustomFeeds(
          token: any(named: 'token'),
          limit: any(named: 'limit'),
        ),
      ).thenThrow(Exception('fail'));

      final container = _container(
        feedRepo: feedRepo,
        customService: customService,
        token: 'valid-token',
      );

      final feeds = await container.read(customFeedsProvider.future);
      expect(feeds, isEmpty);
    });
  });

  // ─── currentFeedIndexProvider / currentFeedProvider ───

  group('currentFeedIndexProvider + currentFeedProvider', () {
    test('defaults to home feed index', () {
      final container = _container(
        feedRepo: feedRepo,
        customService: customService,
      );

      final index = container.read(currentFeedIndexProvider);
      final feed = container.read(currentFeedProvider);
      expect(index, 0);
      expect(feed.isHome, isTrue);
    });
  });
}
