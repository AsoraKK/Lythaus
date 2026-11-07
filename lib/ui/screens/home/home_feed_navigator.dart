// ignore_for_file: public_member_api_docs
// ignore_for_file: use_build_context_synchronously

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/presentation/content_editor_screen.dart';
import 'package:lythaus/features/feed/application/content_mutation.dart';
import 'package:lythaus/features/feed/application/feed_read_session.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/components/lythaus_top_bar.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:lythaus/ui/components/feed_navigation_rail.dart';
import 'package:lythaus/ui/components/feed_control_panel.dart';
import 'package:lythaus/ui/components/sign_in_required.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/features/moderation/presentation/screens/appeal_history_screen.dart';
import 'package:lythaus/ui/screens/home/custom_feed.dart';
import 'package:lythaus/ui/screens/home/custom_feed_creation_flow.dart';
import 'package:lythaus/ui/screens/home/discover_feed.dart';
import 'package:lythaus/ui/screens/home/news_feed.dart';
import 'package:lythaus/ui/screens/home/feed_search_screen.dart';
import 'package:lythaus/ui/screens/home/trending_feed_screen.dart';

enum AlphaFeedSection { discover, myFeeds, newsBoard }

class HomeFeedNavigator extends ConsumerStatefulWidget {
  const HomeFeedNavigator({
    super.key,
    this.section = AlphaFeedSection.discover,
    this.initialFeedId,
    this.onAccountTap,
    this.onCreateTap,
  });

  final AlphaFeedSection section;
  final String? initialFeedId;
  final VoidCallback? onAccountTap;
  final VoidCallback? onCreateTap;

  @override
  ConsumerState<HomeFeedNavigator> createState() => HomeFeedNavigatorState();
}

class HomeFeedNavigatorState extends ConsumerState<HomeFeedNavigator> {
  PageController? _pageController;
  String _selectedId = 'discover';
  String? _pagesIdentity;
  FeedReadSession? _lastSession;
  bool _feedControlsOpen = false;
  final _feedControlsFocus = FocusNode(debugLabel: 'Feed controls');

  String get _requestedId =>
      widget.initialFeedId ??
      switch (widget.section) {
        AlphaFeedSection.discover => 'discover',
        AlphaFeedSection.newsBoard => 'news',
        AlphaFeedSection.myFeeds => '_custom',
      };

  @override
  void initState() {
    super.initState();
    _selectedId = _requestedId;
  }

  @override
  void didUpdateWidget(HomeFeedNavigator oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialFeedId != widget.initialFeedId ||
        oldWidget.section != widget.section) {
      _selectedId = _requestedId;
      _jumpToSelection();
    }
  }

  @override
  void dispose() {
    _pageController?.dispose();
    _feedControlsFocus.dispose();
    super.dispose();
  }

  List<FeedModel> get _feeds => ref.read(feedListProvider);

  List<String> _ids(List<FeedModel> feeds) => [
    'discover',
    'news',
    ...feeds
        .where((feed) => feed.type == FeedType.custom)
        .map((feed) => feed.id),
    'appeals',
  ];

  void _jumpToSelection() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _pageController?.hasClients != true) return;
      final index = _ids(_feeds).indexOf(_selectedId);
      if (index >= 0) _pageController!.jumpToPage(index);
    });
  }

  void _selectId(String id, {bool fromSwipe = false}) {
    if (_selectedId == id) return;
    setState(() => _selectedId = id);
    final index = _feeds.indexWhere((feed) => feed.id == id);
    if (index >= 0) ref.read(currentFeedIndexProvider.notifier).state = index;
    if (!fromSwipe) _jumpToSelection();
    final router = GoRouter.maybeOf(context);
    if (router != null) {
      final uri = GoRouterState.of(context).uri;
      router.go(
        uri
            .replace(queryParameters: {...uri.queryParameters, 'feed': id})
            .toString(),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(feedReadSessionProvider);
    if (_lastSession != null && !identical(_lastSession, session)) {
      _selectedId = _requestedId;
      _pagesIdentity = null;
    }
    _lastSession = session;
    final feeds = ref.watch(feedListProvider);
    final custom = feeds.where((feed) => feed.type == FeedType.custom).toList();
    final ids = _ids(feeds);
    if (_selectedId == '_custom' && custom.isNotEmpty) {
      _selectedId = custom.first.id;
    }
    final identity = ids.join('|');
    if (identity != _pagesIdentity) {
      final old = _pageController;
      _pageController = PageController(
        initialPage: ids.indexOf(_selectedId).clamp(0, ids.length - 1),
      );
      _pagesIdentity = identity;
      WidgetsBinding.instance.addPostFrameCallback((_) => old?.dispose());
    }
    final labels = [
      'Discovery',
      'News',
      ...custom.map((feed) => feed.name),
      'Appeals',
    ];
    final customState = ref.watch(customFeedsProvider);
    final entitlements = ref.watch(feedEntitlementsProvider);
    final selectedFeed = feeds
        .where((feed) => feed.id == _selectedId)
        .firstOrNull;
    final canRefresh =
        selectedFeed != null &&
        !ref.watch(liveFeedStateProvider(selectedFeed)).isInitialLoading;
    return Scaffold(
      body: ReadingPane(
        child: SafeArea(
          child: Column(
            children: [
              LythausTopBar(
                title: 'Discovery',
                logoFocusNode: _feedControlsFocus,
                onLogoTap:
                    feeds
                            .where((feed) => feed.type != FeedType.moderation)
                            .length >
                        1
                    ? _openFeedControl
                    : null,
                onTitleTap:
                    feeds
                            .where((feed) => feed.type != FeedType.moderation)
                            .length >
                        1
                    ? _openFeedControl
                    : null,
                onSearchTap: _openSearch,
                onTrendingTap: _openTrending,
                onAccountTap: widget.onAccountTap,
                onCreateTap: widget.onCreateTap,
                useWordmark: true,
              ),
              FeedNavigationRail(
                ids: ids,
                labels: labels,
                selectedId: _selectedId,
                onSelect: _selectId,
                onCreate: _createFeed,
                onRefresh: canRefresh
                    ? () => ref
                          .read(liveFeedStateProvider(selectedFeed).notifier)
                          .refresh()
                    : null,
              ),
              const _OwnSubmissions(),
              if (session.isAuthenticated &&
                  (customState.hasError || entitlements.hasError))
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      const Text('Some feeds could not be loaded.'),
                      TextButton(
                        onPressed: () {
                          ref.invalidate(customFeedsProvider);
                          ref.invalidate(feedEntitlementsProvider);
                        },
                        child: const Text('Retry feeds'),
                      ),
                    ],
                  ),
                ),
              Expanded(
                child: _selectedId == '_custom'
                    ? _emptyCustomFeeds(
                        customState.isLoading || entitlements.isLoading,
                        customState.hasError || entitlements.hasError,
                      )
                    : !ids.contains(_selectedId)
                    ? Center(
                        child: Text(
                          customState.isLoading || entitlements.isLoading
                              ? 'Loading your feed'
                              : 'This feed is unavailable. Choose another feed.',
                        ),
                      )
                    : PageView.builder(
                        key: ValueKey((identity, session)),
                        controller: _pageController,
                        onPageChanged: (index) =>
                            _selectId(ids[index], fromSwipe: true),
                        itemCount: ids.length,
                        itemBuilder: (context, index) {
                          final id = ids[index];
                          if (id == 'appeals') {
                            return session.isAuthenticated
                                ? const AppealHistoryScreen(embedded: true)
                                : const SignInRequired(
                                    message: 'Sign in to view your appeals.',
                                    returnTo: '/?feed=appeals',
                                  );
                          }
                          if (id == 'news' &&
                              !feeds.any(
                                (feed) => feed.type == FeedType.news,
                              )) {
                            return session.isGuest
                                ? const SignInRequired(
                                    message:
                                        'Sign in to check your News access.',
                                    returnTo: '/?feed=news',
                                  )
                                : const NewsFeed(
                                    feed: newsBoardFeedModel,
                                    items: [],
                                  );
                          }
                          final matching = feeds.where((feed) => feed.id == id);
                          if (matching.isEmpty) {
                            return const Center(
                              child: Text('Discover unavailable'),
                            );
                          }
                          return _FeedPage(
                            key: ValueKey((id, session)),
                            feed: matching.first,
                            session: session,
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _emptyCustomFeeds(bool loading, bool failed) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (loading) const CircularProgressIndicator(),
          Text(
            loading
                ? 'Loading your feeds'
                : failed
                ? 'Couldn’t load your feeds'
                : 'No custom feeds yet',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          if (!failed)
            const Text(
              'Create a feed to follow the topics and accounts you choose.',
              textAlign: TextAlign.center,
            ),
          if (!loading && !failed)
            FilledButton.icon(
              onPressed: _createFeed,
              icon: const Icon(Icons.add),
              label: const Text('Create custom feed'),
            ),
        ],
      ),
    ),
  );

  void _createFeed() {
    final session = ref.read(feedReadSessionProvider);
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => session.isAuthenticated
            ? const CustomFeedCreationFlow()
            : const Scaffold(
                body: SignInRequired(
                  message: 'Sign in to create a custom feed.',
                  returnTo: '/?feed=_custom',
                ),
              ),
      ),
    );
  }

  void openFeedControls() => _openFeedControl();

  void showAppeals() => _selectId('appeals');

  void _openFeedControl() {
    if (_feedControlsOpen) return;
    final session = ref.read(feedReadSessionProvider);
    _feedControlsOpen = true;
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => Consumer(
        builder: (context, sheetRef, _) {
          if (!identical(sheetRef.watch(feedReadSessionProvider), session)) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (sheetContext.mounted &&
                  ModalRoute.of(sheetContext)?.isCurrent == true) {
                Navigator.of(sheetContext).pop();
              }
            });
            return const SizedBox.shrink();
          }
          final available = sheetRef.watch(feedListProvider);
          return CallbackShortcuts(
            bindings: {
              const SingleActivator(LogicalKeyboardKey.escape): () =>
                  Navigator.of(sheetContext).pop(),
            },
            child: Focus(
              autofocus: true,
              child: Align(
                alignment: Alignment.bottomCenter,
                heightFactor: 1,
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: 640,
                    maxHeight: MediaQuery.sizeOf(sheetContext).height * .72,
                  ),
                  child: SingleChildScrollView(
                    child: FeedControlPanel(
                      availableFeeds: available,
                      selectedFeedId: _selectedId,
                      onCreateCustom: () {
                        Navigator.of(sheetContext).pop();
                        if (session.isCurrent) _createFeed();
                      },
                      onSelect: (feed) {
                        Navigator.of(sheetContext).pop();
                        if (session.isCurrent) _selectId(feed.id);
                      },
                      onClose: () => Navigator.of(sheetContext).pop(),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    ).whenComplete(() {
      _feedControlsOpen = false;
      if (mounted && ModalRoute.of(context)?.isCurrent == true) {
        _feedControlsFocus.requestFocus();
      }
    });
  }

  void _openTrending() {
    final router = GoRouter.maybeOf(context);
    if (router != null) {
      router.go('/trending');
      return;
    }
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const TrendingFeedScreen()));
  }

  void _openSearch() {
    final router = GoRouter.maybeOf(context);
    if (router != null) {
      router.go('/search');
      return;
    }
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const FeedSearchScreen()));
  }
}

class _OwnSubmissions extends ConsumerWidget {
  const _OwnSubmissions();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actor = ref.watch(currentUserProvider)?.id;
    final journal = ref.watch(contentMutationRegistryProvider);
    if (actor == null) return const SizedBox.shrink();
    final ids = {
      ...journal.owned
          .where((item) => item.kind == 'post')
          .map((item) => item.id),
      ...journal.attempts
          .where((attempt) => attempt.scope.startsWith('post:$actor:'))
          .map((attempt) => attempt.scope.split(':').last),
    }.toList();
    final hasDraft =
        journal.pending('post-create:$actor') != null ||
        journal.draft('post-create:$actor') != null;
    if (ids.isEmpty && !hasDraft) return const SizedBox.shrink();
    return Align(
      alignment: Alignment.centerRight,
      child: PopupMenuButton<String>(
        tooltip: 'Your submissions',
        onSelected: (value) {
          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => value == 'draft'
                  ? const CreatePostScreen()
                  : PostDetailScreen(postId: value),
            ),
          );
        },
        itemBuilder: (_) => [
          if (hasDraft)
            const PopupMenuItem(
              value: 'draft',
              child: Text('Resume saved post'),
            ),
          for (var i = 0; i < ids.length; i++)
            PopupMenuItem(
              value: ids[i],
              child: Text('Your submission ${i + 1}'),
            ),
        ],
        child: const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Text('Your submissions'),
        ),
      ),
    );
  }
}

class _FeedPage extends ConsumerStatefulWidget {
  const _FeedPage({super.key, required this.feed, required this.session});

  final FeedModel feed;
  final FeedReadSession session;

  @override
  ConsumerState<_FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends ConsumerState<_FeedPage> {
  static const double _estimatedCardExtent = 340;
  late final ScrollController _scrollController;
  bool _restoreApplied = false;
  bool _restoreCallbackScheduled = false;
  bool _firstFeedLoadLogged = false;
  FeedRestoreResult? _pendingRestoreResult;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController(
      onAttach: (_) => _scheduleRestoreIfPossible(),
    );
    _scrollController.addListener(_persistRestoreSnapshot);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_persistRestoreSnapshot);
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ref = this.ref;
    final feed = widget.feed;
    if (feed.type == FeedType.moderation) {
      return const Center(child: Text('Moderation feed not in carousel.'));
    }

    final liveState = ref.watch(liveFeedStateProvider(feed));
    final restoreResult = ref.watch(feedRestoreResultProvider(feed));

    _logFirstFeedLoad(liveState);
    _applyRestoreIfReady(liveState: liveState, restoreResult: restoreResult);

    if (liveState.requiresSignIn) {
      return const SignInRequired(
        message:
            'Your session could not be verified. Sign in again or continue as a guest.',
        returnTo: '/',
      );
    }

    if (feed.type != FeedType.discover && liveState.isInitialLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (feed.type != FeedType.discover &&
        liveState.errorMessage != null &&
        liveState.items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(liveState.errorMessage!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () =>
                    ref.read(liveFeedStateProvider(feed).notifier).refresh(),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }
    return _buildLiveFeed(
      context,
      ref,
      items: liveState.isInitialLoading ? const [] : liveState.items,
      hasMore: liveState.hasMore,
      isLoadingMore: liveState.isLoadingMore,
      isRefreshing: liveState.isInitialLoading,
      hasError: liveState.errorMessage != null,
      showNewPostsPill: restoreResult.showNewPostsPill,
      onNewPostsPillTap: _onNewPostsPillTap,
      controller: _scrollController,
    );
  }

  Widget _buildLiveFeed(
    BuildContext context,
    WidgetRef ref, {
    required List<FeedItem> items,
    required bool hasMore,
    required bool isLoadingMore,
    required bool isRefreshing,
    required bool hasError,
    required bool showNewPostsPill,
    required VoidCallback onNewPostsPillTap,
    required ScrollController controller,
  }) {
    final currentUserId = ref.watch(currentUserProvider)?.id;
    final feed = widget.feed;

    switch (feed.type) {
      case FeedType.discover:
        return DiscoverFeed(
          showContext: false,
          controller: controller,
          feed: feed,
          items: items,
          onOpenItem: (item) =>
              _openPostDetail(context, item.interactionPostId ?? item.id),
          currentUserId: currentUserId,
          onEditItem: (item) => _showEditPostDialog(context, ref, item),
          hasMore: hasMore,
          isLoadingMore: isLoadingMore,
          isRefreshing: isRefreshing,
          hasError: hasError,
          showNewPostsPill: showNewPostsPill,
          onNewPostsPillTap: onNewPostsPillTap,
          onLoadMore: () =>
              ref.read(liveFeedStateProvider(feed).notifier).loadMore(),
          onRefresh: () =>
              ref.read(liveFeedStateProvider(feed).notifier).refresh(),
        );
      case FeedType.news:
        return NewsFeed(
          controller: controller,
          feed: feed,
          items: items,
          onOpenItem: (item) =>
              _openPostDetail(context, item.interactionPostId ?? item.id),
          currentUserId: currentUserId,
          onEditItem: (item) => _showEditPostDialog(context, ref, item),
          hasMore: hasMore,
          isLoadingMore: isLoadingMore,
          showNewPostsPill: showNewPostsPill,
          onNewPostsPillTap: onNewPostsPillTap,
          onLoadMore: () =>
              ref.read(liveFeedStateProvider(feed).notifier).loadMore(),
          onRefresh: () =>
              ref.read(liveFeedStateProvider(feed).notifier).refresh(),
        );
      case FeedType.custom:
        return CustomFeedView(
          controller: controller,
          feed: feed,
          items: items,
          onOpenItem: (item) =>
              _openPostDetail(context, item.interactionPostId ?? item.id),
          currentUserId: currentUserId,
          onEditItem: (item) => _showEditPostDialog(context, ref, item),
          hasMore: hasMore,
          isLoadingMore: isLoadingMore,
          showNewPostsPill: showNewPostsPill,
          onNewPostsPillTap: onNewPostsPillTap,
          onLoadMore: () =>
              ref.read(liveFeedStateProvider(feed).notifier).loadMore(),
          onRefresh: () =>
              ref.read(liveFeedStateProvider(feed).notifier).refresh(),
        );
      case FeedType.moderation:
        return const Center(child: Text('Moderation feed not in carousel.'));
    }
  }

  void _applyRestoreIfReady({
    required LiveFeedState liveState,
    required FeedRestoreResult restoreResult,
  }) {
    if (_restoreApplied || liveState.isInitialLoading) {
      return;
    }

    _pendingRestoreResult = restoreResult;
    _scheduleRestoreIfPossible();
  }

  void _scheduleRestoreIfPossible() {
    if (_restoreApplied ||
        _restoreCallbackScheduled ||
        _pendingRestoreResult == null) {
      return;
    }
    _restoreCallbackScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _restoreCallbackScheduled = false;
      if (!mounted ||
          !widget.session.isCurrent ||
          _restoreApplied ||
          !_scrollController.hasClients) {
        return;
      }

      final position = _scrollController.position;
      if (!position.hasContentDimensions) {
        _scheduleRestoreIfPossible();
        WidgetsBinding.instance.scheduleFrame();
        return;
      }

      _restoreApplied = true;
      final restoreResult = _pendingRestoreResult!;
      final maxExtent = position.maxScrollExtent;
      final targetOffset = restoreResult.offset.clamp(0, maxExtent).toDouble();
      if (targetOffset > 0) {
        _scrollController.jumpTo(targetOffset);
      }

      if (restoreResult.usedFallback) {
        _setRestoreSnapshot(
          lastVisibleItemId: null,
          offset: 0,
          showNewPostsPill: true,
        );
      }
    });
  }

  void _logFirstFeedLoad(LiveFeedState state) {
    if (_firstFeedLoadLogged || state.isInitialLoading || state.items.isEmpty) {
      return;
    }
    _firstFeedLoadLogged = true;
    final user = ref.read(currentUserProvider);
    ref
        .read(analyticsEventTrackerProvider)
        .logEventOnce(
          ref.read(analyticsClientProvider),
          AnalyticsEvents.feedFirstLoad,
          userId: user?.id,
          properties: {'feed_type': widget.feed.type.name},
        );
  }

  void _persistRestoreSnapshot() {
    if (!widget.session.isCurrent || !_scrollController.hasClients) {
      return;
    }

    final feedState = ref.read(liveFeedStateProvider(widget.feed));
    final items = feedState.items;

    String? itemId;
    if (items.isNotEmpty) {
      final index = (_scrollController.offset / _estimatedCardExtent).floor();
      final safeIndex = index.clamp(0, items.length - 1);
      itemId = items[safeIndex].id;
    }

    final existing = ref.read(feedRestoreSnapshotsProvider)[widget.feed.id];
    _setRestoreSnapshot(
      lastVisibleItemId: itemId,
      offset: _scrollController.offset,
      showNewPostsPill: existing?.showNewPostsPill ?? false,
    );
  }

  void _setRestoreSnapshot({
    required String? lastVisibleItemId,
    required double offset,
    required bool showNewPostsPill,
  }) {
    if (!widget.session.isCurrent) return;
    final snapshots = ref.read(feedRestoreSnapshotsProvider);
    ref.read(feedRestoreSnapshotsProvider.notifier).state = {
      ...snapshots,
      widget.feed.id: FeedRestoreSnapshot(
        lastVisibleItemId: lastVisibleItemId,
        offset: offset,
        showNewPostsPill: showNewPostsPill,
      ),
    };
  }

  void _onNewPostsPillTap() {
    _setRestoreSnapshot(
      lastVisibleItemId: null,
      offset: 0,
      showNewPostsPill: false,
    );
    if (!_scrollController.hasClients) {
      return;
    }
    _scrollController.animateTo(
      0,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _openPostDetail(BuildContext context, String postId) async {
    if (!widget.session.isCurrent) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => PostDetailScreen(postId: postId)),
    );
  }

  Future<void> _showEditPostDialog(
    BuildContext context,
    WidgetRef ref,
    FeedItem item,
  ) async {
    if (!widget.session.isCurrent) return;
    final actor = ref.read(currentUserProvider)?.id;
    if (actor == null || actor.isEmpty || actor != item.authorId) return;
    final revised = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) => ContentEditorScreen(
          contentId: item.interactionPostId ?? item.id,
          text: item.body,
        ),
      ),
    );
    if (!context.mounted || !widget.session.isCurrent || revised == null) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          revised['moderationState'] == 'under_review'
              ? 'Edit submitted. Publication checks are pending.'
              : 'Post updated',
        ),
      ),
    );
    await ref.read(liveFeedStateProvider(widget.feed).notifier).refresh();
  }
}
