// ignore_for_file: public_member_api_docs

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/feed/application/custom_feed_service.dart';
import 'package:lythaus/features/feed/application/feed_read_session.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/features/auth/domain/auth_required_exception.dart';
import 'package:lythaus/services/service_providers.dart';
import 'package:lythaus/services/subscription/subscription_service.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/models/post_feed_item_mapper.dart';

const FeedModel _discoverFeed = FeedModel(
  id: 'discover',
  name: 'Discover',
  type: FeedType.discover,
  contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
  sorting: SortingRule.hot,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
  isHome: true,
);

const FeedModel _newsBoardFeed = FeedModel(
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

class FeedEntitlements {
  const FeedEntitlements({
    required this.tier,
    required this.maxCustomFeeds,
    required this.newsBoardAccess,
  });

  final String tier;
  final int maxCustomFeeds;
  final String newsBoardAccess;

  bool get canAccessNewsBoard =>
      tier.toLowerCase() == 'black' && newsBoardAccess.toLowerCase() == 'full';

  factory FeedEntitlements.fromSubscription(SubscriptionStatus status) {
    return FeedEntitlements(
      tier: status.tier,
      maxCustomFeeds: status.entitlements.maxCustomFeeds,
      newsBoardAccess: status.entitlements.newsBoardAccessLevel,
    );
  }
}

class CustomFeedCapacity {
  const CustomFeedCapacity({required this.used, this.maximum});

  final int used;
  final int? maximum;

  bool get isKnown => maximum != null;
  bool get canCreate => maximum == null || used < maximum!;
}

/// Server-issued feed limits for the signed-in account.
final feedEntitlementsProvider = FutureProvider<FeedEntitlements?>((ref) async {
  final session = ref.watch(feedReadSessionProvider);
  if (session.isLoading) return null;
  if (session.hasError) throw const AuthRequiredException();
  if (!session.isAuthenticated) {
    return null;
  }
  final token = await session.readToken();
  session.requireCurrent();
  final status = await ref
      .read(subscriptionServiceProvider)
      .checkStatus(token: token!);
  session.requireCurrent();
  return FeedEntitlements.fromSubscription(status);
});

final customFeedServiceProvider = Provider<CustomFeedService>((ref) {
  final dio = ref.watch(secureDioProvider);
  return CustomFeedService(dio);
});

final customFeedsProvider = FutureProvider<List<FeedModel>>((ref) async {
  final session = ref.watch(feedReadSessionProvider);
  if (session.isLoading) return const [];
  if (session.hasError) throw const AuthRequiredException();
  if (!session.isAuthenticated) {
    return const [];
  }
  final token = await session.readToken();
  session.requireCurrent();
  final feeds = await ref
      .read(customFeedServiceProvider)
      .listCustomFeeds(token: token!, limit: 20);
  session.requireCurrent();
  return feeds;
});

final feedListProvider = Provider<List<FeedModel>>((ref) {
  final entitlementState = ref.watch(feedEntitlementsProvider);
  final customState = ref.watch(customFeedsProvider);
  final entitlements = entitlementState.isLoading
      ? null
      : entitlementState.asData?.value;
  final customFeeds = customState.isLoading
      ? const <FeedModel>[]
      : customState.asData?.value ?? const <FeedModel>[];
  final systemFeeds = <FeedModel>[
    _discoverFeed,
    if (entitlements?.canAccessNewsBoard ?? false) _newsBoardFeed,
  ];
  final visibleCustomFeeds = entitlements == null
      ? const <FeedModel>[]
      : customFeeds.take(entitlements.maxCustomFeeds).toList();

  final merged = <FeedModel>[...systemFeeds, ...visibleCustomFeeds];

  if (merged.isNotEmpty && merged.every((feed) => !feed.isHome)) {
    merged[0] = merged[0].copyWith(isHome: true);
  }

  return merged;
});

final customFeedCapacityProvider = Provider<CustomFeedCapacity>((ref) {
  final customState = ref.watch(customFeedsProvider);
  final entitlementState = ref.watch(feedEntitlementsProvider);
  final customFeeds = customState.isLoading
      ? const <FeedModel>[]
      : customState.asData?.value ?? const <FeedModel>[];
  final entitlements = entitlementState.isLoading
      ? null
      : entitlementState.asData?.value;
  return CustomFeedCapacity(
    used: customFeeds.length,
    maximum: entitlements?.maxCustomFeeds,
  );
});

final liveFeedItemsProvider = FutureProvider.family<List<FeedItem>, FeedModel>((
  ref,
  feed,
) async {
  final session = ref.watch(feedReadSessionProvider);
  if (session.isLoading && !session.isGuest) return const [];
  if (session.hasError && !session.isGuest) {
    throw const AuthRequiredException();
  }
  if (!session.canRead && feed.type == FeedType.discover) {
    return const [];
  }
  final authToken = await session.readToken();
  session.requireCurrent();
  final service = ref.read(socialFeedServiceProvider);
  List<domain.Post> posts;

  switch (feed.type) {
    case FeedType.discover:
      posts = (await service.getDiscoverFeed(
        limit: 25,
        token: authToken,
      )).posts;
      break;
    case FeedType.news:
      final entitlements = await ref.read(feedEntitlementsProvider.future);
      session.requireCurrent();
      if (entitlements == null || !entitlements.canAccessNewsBoard) {
        throw StateError('News Board is available to Black accounts only.');
      }
      posts = (await service.getNewsFeed(limit: 25, token: authToken)).posts;
      break;
    case FeedType.custom:
      if (authToken == null) {
        throw const AuthRequiredException();
      }
      posts =
          (await ref
                  .read(customFeedServiceProvider)
                  .getCustomFeedItems(
                    token: authToken,
                    feedId: feed.id,
                    limit: 25,
                  ))
              .posts;
      break;
    case FeedType.moderation:
      return const [];
  }

  session.requireCurrent();
  return posts.map(_mapPostToFeedItem).toList();
});

final currentFeedIndexProvider = StateProvider<int>((ref) {
  ref.watch(feedReadSessionProvider);
  final feeds = ref.read(feedListProvider);
  final homeIndex = feeds.indexWhere((feed) => feed.isHome);
  return homeIndex >= 0 ? homeIndex : 0;
});

final currentFeedProvider = Provider<FeedModel>((ref) {
  final feeds = ref.watch(feedListProvider);
  final index = ref.watch(currentFeedIndexProvider);
  final safeIndex = index.clamp(0, feeds.length - 1);
  return feeds[safeIndex];
});

class LiveFeedState {
  const LiveFeedState({
    this.items = const [],
    this.nextCursor,
    this.isInitialLoading = false,
    this.isLoadingMore = false,
    this.errorMessage,
    this.requiresSignIn = false,
  });

  final List<FeedItem> items;
  final String? nextCursor;
  final bool isInitialLoading;
  final bool isLoadingMore;
  final String? errorMessage;
  final bool requiresSignIn;

  bool get hasMore => nextCursor != null && nextCursor!.isNotEmpty;

  LiveFeedState copyWith({
    List<FeedItem>? items,
    String? nextCursor,
    bool? isInitialLoading,
    bool? isLoadingMore,
    String? errorMessage,
    bool? requiresSignIn,
    bool clearCursor = false,
    bool clearError = false,
  }) {
    return LiveFeedState(
      items: items ?? this.items,
      nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
      isInitialLoading: isInitialLoading ?? this.isInitialLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      requiresSignIn: clearError
          ? false
          : (requiresSignIn ?? this.requiresSignIn),
    );
  }
}

abstract class LiveFeedController extends StateNotifier<LiveFeedState> {
  LiveFeedController(super.state);

  Future<void> refresh();
  Future<void> loadMore();
}

class _FeedUnavailable implements Exception {
  const _FeedUnavailable();
}

class LiveFeedNotifier extends LiveFeedController {
  LiveFeedNotifier(Ref ref, FeedModel feed, FeedReadSession session)
    : _ref = ref,
      _feed = feed,
      _session = session,
      super(
        _canStartRead(feed, session)
            ? const LiveFeedState(isInitialLoading: true)
            : const LiveFeedState(),
      ) {
    _stopSession = _session.onInvalidated(_clearSession);
    if (!_session.isLoading && _canStartRead(_feed, _session)) {
      Future<void>.microtask(refresh);
    }
  }

  final Ref _ref;
  final FeedModel _feed;
  final FeedReadSession _session;
  late final void Function() _stopSession;
  FeedRequestCancellation? _cancellation;
  Future<void>? _refreshing;
  final _visitedCursors = <String>{};
  int _generation = 0;

  static bool _canStartRead(FeedModel feed, FeedReadSession session) =>
      feed.type != FeedType.discover || session.canRead || session.hasError;

  bool get _ownsSession =>
      mounted && _session.isCurrent && _canStartRead(_feed, _session);

  bool _ownsRequest(int generation, FeedRequestCancellation cancellation) =>
      _ownsSession &&
      generation == _generation &&
      identical(cancellation, _cancellation) &&
      !cancellation.isCancelled;

  void _clearSession() {
    _generation++;
    _cancellation?.cancel();
    _visitedCursors.clear();
    if (mounted) state = const LiveFeedState(isInitialLoading: true);
  }

  @override
  void dispose() {
    _stopSession();
    _generation++;
    _cancellation?.cancel();
    super.dispose();
  }

  @override
  Future<void> refresh() {
    if (!_ownsSession || _session.isLoading) return Future<void>.value();
    final pending = _refreshing;
    if (pending != null) return pending;
    final request = _loadInitial();
    _refreshing = request;
    return request.whenComplete(() {
      if (identical(_refreshing, request)) _refreshing = null;
    });
  }

  Future<void> _loadInitial() async {
    final generation = ++_generation;
    _cancellation?.cancel();
    final cancellation = _cancellation = FeedRequestCancellation();
    _visitedCursors.clear();
    state = state.copyWith(
      isInitialLoading: true,
      isLoadingMore: false,
      clearCursor: true,
      clearError: true,
    );
    try {
      final response = await _fetchRemote(generation, cancellation);
      if (!_ownsRequest(generation, cancellation)) return;
      state = LiveFeedState(
        items: response.posts.map(_mapPostToFeedItem).toList(),
        nextCursor: _nextCursor(response),
      );
    } catch (error) {
      if (_ownsRequest(generation, cancellation)) {
        _showError(error, loadingMore: false);
      }
    }
  }

  @override
  Future<void> loadMore() async {
    if (!_ownsSession ||
        state.isLoadingMore ||
        state.isInitialLoading ||
        !state.hasMore) {
      return;
    }
    final cursor = state.nextCursor!;
    final generation = ++_generation;
    _cancellation?.cancel();
    final cancellation = _cancellation = FeedRequestCancellation();
    state = state.copyWith(isLoadingMore: true, clearError: true);
    try {
      final response = await _fetchRemote(
        generation,
        cancellation,
        cursor: cursor,
      );
      if (!_ownsRequest(generation, cancellation)) return;
      final nextCursor = _nextCursor(response);
      if (nextCursor != null &&
          (nextCursor == cursor || _visitedCursors.contains(nextCursor))) {
        throw const FormatException('Feed cursor did not advance');
      }
      final seenIds = state.items.map((item) => item.id).toSet();
      final additions = response.posts
          .where((post) => seenIds.add(post.id))
          .map(_mapPostToFeedItem);
      state = state.copyWith(
        items: [...state.items, ...additions],
        nextCursor: nextCursor,
        clearCursor: nextCursor == null,
        isLoadingMore: false,
        clearError: true,
      );
      _visitedCursors.add(cursor);
    } catch (error) {
      if (_ownsRequest(generation, cancellation)) {
        _showError(error, loadingMore: true);
      }
    }
  }

  String? _nextCursor(domain.FeedResponse response) {
    final cursor = response.nextCursor;
    return cursor == null || cursor.isEmpty ? null : cursor;
  }

  void _showError(Object error, {required bool loadingMore}) {
    final original = error is SocialFeedException ? error.originalError : error;
    final status = original is DioException
        ? original.response?.statusCode
        : null;
    final authentication = error is AuthRequiredException || status == 401;
    if (authentication ||
        error is _FeedUnavailable ||
        status == 403 ||
        status == 404) {
      state = LiveFeedState(
        requiresSignIn: authentication,
        errorMessage: authentication
            ? 'Sign in again to load posts.'
            : 'This feed is no longer available.',
      );
      return;
    }
    state = state.copyWith(
      isInitialLoading: false,
      isLoadingMore: false,
      errorMessage: loadingMore
          ? 'Unable to load more items.'
          : 'Unable to load feed right now.',
    );
  }

  Future<domain.FeedResponse> _fetchRemote(
    int generation,
    FeedRequestCancellation cancellation, {
    String? cursor,
  }) async {
    if (_feed.type == FeedType.moderation) {
      return const domain.FeedResponse(
        posts: [],
        totalCount: 0,
        hasMore: false,
        page: 1,
        pageSize: 25,
      );
    }
    final token = await _session.readToken();
    if (!_ownsRequest(generation, cancellation)) {
      throw const AuthRequiredException();
    }
    final service = _ref.read(socialFeedServiceProvider);
    switch (_feed.type) {
      case FeedType.discover:
        return service.getDiscoverFeed(
          cursor: cursor,
          limit: 25,
          token: token,
          cancellation: cancellation,
        );
      case FeedType.news:
        final entitlements = await _ref.read(feedEntitlementsProvider.future);
        if (!_ownsRequest(generation, cancellation)) {
          throw const AuthRequiredException();
        }
        if (token == null) throw const AuthRequiredException();
        if (entitlements == null || !entitlements.canAccessNewsBoard) {
          throw const _FeedUnavailable();
        }
        return service.getNewsFeed(cursor: cursor, limit: 25, token: token);
      case FeedType.custom:
        if (token == null) throw const AuthRequiredException();
        return _ref
            .read(customFeedServiceProvider)
            .getCustomFeedItems(
              token: token,
              feedId: _feed.id,
              cursor: cursor,
              limit: 25,
            );
      case FeedType.moderation:
        throw StateError('Moderation feed has no member request');
    }
  }
}

final liveFeedStateProvider =
    StateNotifierProvider.family<LiveFeedController, LiveFeedState, FeedModel>(
      (ref, feed) =>
          LiveFeedNotifier(ref, feed, ref.watch(feedReadSessionProvider)),
    );

class CustomFeedDraftNotifier extends StateNotifier<CustomFeedDraft> {
  CustomFeedDraftNotifier() : super(const CustomFeedDraft());

  void setContentType(ContentType type) {
    state = state.copyWith(contentType: type);
  }

  void setSorting(SortingRule sorting) {
    state = state.copyWith(sorting: sorting);
  }

  void updateRefinements(FeedRefinements refinements) {
    state = state.copyWith(refinements: refinements);
  }

  void setName(String name) {
    state = state.copyWith(name: name);
  }

  void setHome(bool isHome) {
    state = state.copyWith(setAsHome: isHome);
  }

  void reset() {
    state = const CustomFeedDraft();
  }
}

final customFeedDraftProvider =
    StateNotifierProvider<CustomFeedDraftNotifier, CustomFeedDraft>(
      (ref) => CustomFeedDraftNotifier(),
    );

class FeedRestoreSnapshot {
  const FeedRestoreSnapshot({
    required this.lastVisibleItemId,
    required this.offset,
    this.showNewPostsPill = false,
  });

  final String? lastVisibleItemId;
  final double offset;
  final bool showNewPostsPill;

  FeedRestoreSnapshot copyWith({
    String? lastVisibleItemId,
    double? offset,
    bool? showNewPostsPill,
  }) {
    return FeedRestoreSnapshot(
      lastVisibleItemId: lastVisibleItemId ?? this.lastVisibleItemId,
      offset: offset ?? this.offset,
      showNewPostsPill: showNewPostsPill ?? this.showNewPostsPill,
    );
  }
}

class FeedRestoreResult {
  const FeedRestoreResult({
    required this.offset,
    required this.usedFallback,
    required this.showNewPostsPill,
  });

  final double offset;
  final bool usedFallback;
  final bool showNewPostsPill;
}

FeedRestoreResult computeFeedRestoreResult({
  required List<FeedItem> items,
  FeedRestoreSnapshot? snapshot,
}) {
  if (snapshot == null) {
    return const FeedRestoreResult(
      offset: 0,
      usedFallback: false,
      showNewPostsPill: false,
    );
  }

  final itemId = snapshot.lastVisibleItemId;
  if (itemId == null || itemId.isEmpty) {
    return FeedRestoreResult(
      offset: snapshot.offset,
      usedFallback: false,
      showNewPostsPill: snapshot.showNewPostsPill,
    );
  }

  final itemStillPresent = items.any((item) => item.id == itemId);
  if (itemStillPresent) {
    return FeedRestoreResult(
      offset: snapshot.offset,
      usedFallback: false,
      showNewPostsPill: snapshot.showNewPostsPill,
    );
  }

  return const FeedRestoreResult(
    offset: 0,
    usedFallback: true,
    showNewPostsPill: true,
  );
}

final feedRestoreSnapshotsProvider =
    StateProvider<Map<String, FeedRestoreSnapshot>>((ref) {
      ref.watch(feedReadSessionProvider);
      return const {};
    });

final feedRestoreResultProvider = Provider.family<FeedRestoreResult, FeedModel>(
  (ref, feed) {
    final snapshots = ref.watch(feedRestoreSnapshotsProvider);
    final snapshot = snapshots[feed.id];
    final feedState = ref.watch(liveFeedStateProvider(feed));
    return computeFeedRestoreResult(items: feedState.items, snapshot: snapshot);
  },
);

FeedItem _mapPostToFeedItem(domain.Post post) =>
    mapPostToFeedItem(post, feedId: 'live', fallbackTitle: 'Update');
