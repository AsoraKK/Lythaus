// ignore_for_file: public_member_api_docs

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/custom_feed_service.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/state/models/feed_models.dart';

const List<FeedModel> _systemFeeds = [
  FeedModel(
    id: 'discover',
    name: 'Discover',
    type: FeedType.discover,
    contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
    sorting: SortingRule.hot,
    refinements: FeedRefinements(),
    subscriptionLevelRequired: 0,
    isHome: true,
  ),
  FeedModel(
    id: 'news',
    name: 'News',
    type: FeedType.news,
    contentFilters: ContentFilters(
      allowedTypes: {ContentType.text, ContentType.image},
    ),
    sorting: SortingRule.newest,
    refinements: FeedRefinements(),
    subscriptionLevelRequired: 0,
  ),
];

final customFeedServiceProvider = Provider<CustomFeedService>((ref) {
  final dio = ref.watch(secureDioProvider);
  return CustomFeedService(dio);
});

final customFeedsProvider = FutureProvider<List<FeedModel>>((ref) async {
  try {
    final token = await ref.read(jwtProvider.future);
    if (token == null || token.isEmpty) {
      return const [];
    }
    return ref
        .read(customFeedServiceProvider)
        .listCustomFeeds(token: token, limit: 20);
  } catch (_) {
    return const [];
  }
});

final feedListProvider = Provider<List<FeedModel>>((ref) {
  const systemFeeds = _systemFeeds;
  final customFeeds = ref.watch(customFeedsProvider).valueOrNull ?? const [];

  final merged = <FeedModel>[...systemFeeds, ...customFeeds];

  if (merged.isNotEmpty && merged.every((feed) => !feed.isHome)) {
    merged[0] = merged[0].copyWith(isHome: true);
  }

  return merged;
});

final liveFeedItemsProvider = FutureProvider.family<List<FeedItem>, FeedModel>((
  ref,
  feed,
) async {
  try {
    final service = ref.read(socialFeedServiceProvider);
    final token = await ref.read(jwtProvider.future);
    final authToken = token?.isNotEmpty == true ? token : null;
    List<domain.Post> posts;

    switch (feed.type) {
      case FeedType.discover:
        posts = (await service.getDiscoverFeed(
          limit: 25,
          token: authToken,
        )).posts;
        break;
      case FeedType.news:
        posts = (await service.getNewsFeed(limit: 25, token: authToken)).posts;
        break;
      case FeedType.custom:
        if (authToken == null) {
          return const [];
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

    return posts.map(_mapPostToFeedItem).toList();
  } catch (_) {
    return const [];
  }
});

final currentFeedIndexProvider = StateProvider<int>((ref) {
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
  });

  final List<FeedItem> items;
  final String? nextCursor;
  final bool isInitialLoading;
  final bool isLoadingMore;
  final String? errorMessage;

  bool get hasMore => nextCursor != null && nextCursor!.isNotEmpty;

  LiveFeedState copyWith({
    List<FeedItem>? items,
    String? nextCursor,
    bool? isInitialLoading,
    bool? isLoadingMore,
    String? errorMessage,
    bool clearCursor = false,
    bool clearError = false,
  }) {
    return LiveFeedState(
      items: items ?? this.items,
      nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
      isInitialLoading: isInitialLoading ?? this.isInitialLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

abstract class LiveFeedController extends StateNotifier<LiveFeedState> {
  LiveFeedController(super.state);

  Future<void> refresh();
  Future<void> loadMore();
}

class LiveFeedNotifier extends LiveFeedController {
  LiveFeedNotifier(this._ref, this._feed)
    : super(const LiveFeedState(isInitialLoading: true)) {
    Future<void>.microtask(_loadInitial);
  }

  final Ref _ref;
  final FeedModel _feed;

  Future<void> _loadInitial() async {
    try {
      if (_feed.type == FeedType.moderation) {
        state = state.copyWith(
          items: const [],
          clearCursor: true,
          isInitialLoading: false,
          isLoadingMore: false,
          clearError: true,
        );
        return;
      }

      final response = await _fetchRemote();
      state = state.copyWith(
        items: response.posts.map(_mapPostToFeedItem).toList(),
        nextCursor: response.nextCursor,
        clearCursor: response.nextCursor == null,
        isInitialLoading: false,
        isLoadingMore: false,
        clearError: true,
      );
    } catch (_) {
      state = state.copyWith(
        isInitialLoading: false,
        isLoadingMore: false,
        errorMessage: 'Unable to load feed right now.',
      );
    }
  }

  @override
  Future<void> refresh() async {
    state = state.copyWith(isInitialLoading: true, clearError: true);
    await _loadInitial();
  }

  @override
  Future<void> loadMore() async {
    if (state.isLoadingMore || state.isInitialLoading || !state.hasMore) {
      return;
    }

    final cursor = state.nextCursor;
    if (cursor == null || cursor.isEmpty) {
      return;
    }

    state = state.copyWith(isLoadingMore: true, clearError: true);
    try {
      final response = await _fetchRemote(cursor: cursor);
      state = state.copyWith(
        items: [...state.items, ...response.posts.map(_mapPostToFeedItem)],
        nextCursor: response.nextCursor,
        clearCursor: response.nextCursor == null,
        isLoadingMore: false,
      );
    } catch (_) {
      state = state.copyWith(
        isLoadingMore: false,
        errorMessage: 'Unable to load more items.',
      );
    }
  }

  Future<domain.FeedResponse> _fetchRemote({String? cursor}) async {
    final service = _ref.read(socialFeedServiceProvider);
    final token = await _ref.read(jwtProvider.future);
    final authToken = token?.isNotEmpty == true ? token : null;

    switch (_feed.type) {
      case FeedType.discover:
        return service.getDiscoverFeed(
          cursor: cursor,
          limit: 25,
          token: authToken,
        );
      case FeedType.news:
        return service.getNewsFeed(cursor: cursor, limit: 25, token: authToken);
      case FeedType.custom:
        if (authToken == null) {
          throw StateError('Sign in to access custom feeds');
        }
        return _ref
            .read(customFeedServiceProvider)
            .getCustomFeedItems(
              token: authToken,
              feedId: _feed.id,
              cursor: cursor,
              limit: 25,
            );
      case FeedType.moderation:
        return const domain.FeedResponse(
          posts: [],
          totalCount: 0,
          hasMore: false,
          page: 1,
          pageSize: 25,
        );
    }
  }
}

final liveFeedStateProvider =
    StateNotifierProvider.family<LiveFeedController, LiveFeedState, FeedModel>(
      (ref, feed) => LiveFeedNotifier(ref, feed),
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
    StateProvider<Map<String, FeedRestoreSnapshot>>((ref) => const {});

final feedRestoreResultProvider = Provider.family<FeedRestoreResult, FeedModel>(
  (ref, feed) {
    final snapshots = ref.watch(feedRestoreSnapshotsProvider);
    final snapshot = snapshots[feed.id];
    final feedState = ref.watch(liveFeedStateProvider(feed));
    return computeFeedRestoreResult(items: feedState.items, snapshot: snapshot);
  },
);

FeedItem _mapPostToFeedItem(domain.Post post) {
  final type = (post.mediaUrls?.isNotEmpty ?? false)
      ? ContentType.image
      : ContentType.text;
  return FeedItem(
    id: post.id,
    feedId: 'live',
    author: post.authorUsername,
    authorId: post.authorId,
    sourceName: post.source?.name,
    sourceUrl: post.source?.url,
    contentType: type,
    title: post.metadata?.category ?? 'Update',
    body: post.text,
    imageUrl: post.mediaUrls?.isNotEmpty == true ? post.mediaUrls!.first : null,
    publishedAt: post.createdAt,
    tags: post.metadata?.tags ?? const [],
    isNews: post.isNews,
    isPinned: post.metadata?.isPinned ?? false,
    authorshipLabel: post.authorship.label.label,
    classificationSource: post.authorship.classificationSource,
  );
}
