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
import 'package:lythaus/ui/components/feed_control_panel.dart';
import 'package:lythaus/ui/components/sign_in_required.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/design_system/tokens/motion.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
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
  });

  final AlphaFeedSection section;

  @override
  ConsumerState<HomeFeedNavigator> createState() => _HomeFeedNavigatorState();
}

class _HomeFeedNavigatorState extends ConsumerState<HomeFeedNavigator> {
  late final PageController _pageController;
  int _activeIndex = 0;
  late AlphaFeedSection _activeSection;
  bool _feedControlsOpen = false;
  FeedReadSession? _lastSession;
  final _feedControlsFocus = FocusNode(debugLabel: 'Feed controls');
  final _feedTitleFocus = FocusNode(debugLabel: 'Feed title');

  @override
  void initState() {
    super.initState();
    _activeSection = widget.section;
    _pageController = PageController();
  }

  @override
  void didUpdateWidget(HomeFeedNavigator oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.section != widget.section) {
      _activeSection = widget.section;
      _activeIndex = 0;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _pageController.hasClients) {
          _pageController.jumpToPage(0);
        }
      });
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    _feedControlsFocus.dispose();
    _feedTitleFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(feedReadSessionProvider);
    if (_lastSession != null && !identical(_lastSession, session)) {
      _activeIndex = 0;
      _activeSection = widget.section;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted &&
            identical(_lastSession, session) &&
            _pageController.hasClients) {
          _pageController.jumpToPage(0);
        }
      });
    }
    _lastSession = session;
    final allFeeds = ref.watch(feedListProvider);
    final feeds = _feedsForSection(allFeeds, _activeSection);
    final canSwitchFeeds = _canSwitchFeeds(allFeeds);
    final spacing = context.spacing;

    if (feeds.isEmpty) {
      return _buildEmptySection(context);
    }

    final activeIndex = _activeIndex.clamp(0, feeds.length - 1);
    final activeFeed = feeds[activeIndex];

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            LythausTopBar(
              title: activeFeed.name,
              logoFocusNode: _feedControlsFocus,
              titleFocusNode: _feedTitleFocus,
              onLogoTap: canSwitchFeeds
                  ? () => _openFeedControl(_feedControlsFocus)
                  : null,
              onTitleTap: canSwitchFeeds
                  ? () => _openFeedControl(_feedTitleFocus)
                  : null,
              onSearchTap: _openSearch,
              onTrendingTap: _openTrending,
              useWordmark: true,
            ),
            SizedBox(height: spacing.xs),
            const _OwnSubmissions(),
            if (feeds.length > 1) ...[
              _FeedSwitchRail(
                feeds: feeds,
                activeIndex: activeIndex,
                onSelect: _onFeedSelected,
              ),
              SizedBox(height: spacing.xs),
            ],
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                physics: const NeverScrollableScrollPhysics(),
                onPageChanged: (index) {
                  setState(() => _activeIndex = index);
                },
                itemCount: feeds.length,
                itemBuilder: (context, index) => _FeedPage(
                  key: ValueKey((feeds[index].id, session)),
                  feed: feeds[index],
                  session: session,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _onFeedSelected(int index) {
    final feeds = _feedsForSection(ref.read(feedListProvider), _activeSection);
    if (index < 0 || index >= feeds.length) return;
    _selectFeed(feeds[index]);
  }

  void _selectFeed(FeedModel feed) {
    final session = ref.read(feedReadSessionProvider);
    final allFeeds = ref.read(feedListProvider);
    final globalIndex = allFeeds.indexWhere((item) => item.id == feed.id);
    if (globalIndex < 0) return;
    final section = switch (feed.type) {
      FeedType.discover => AlphaFeedSection.discover,
      FeedType.custom => AlphaFeedSection.myFeeds,
      FeedType.news => AlphaFeedSection.newsBoard,
      FeedType.moderation => _activeSection,
    };
    final feeds = _feedsForSection(allFeeds, section);
    final index = feeds.indexWhere((item) => item.id == feed.id);
    if (index < 0) return;
    final disableAnimations = MediaQuery.disableAnimationsOf(context);
    setState(() {
      _activeSection = section;
      _activeIndex = index;
    });
    ref.read(currentFeedIndexProvider.notifier).state = globalIndex;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !session.isCurrent || !_pageController.hasClients) return;
      if (disableAnimations) {
        _pageController.jumpToPage(index);
        return;
      }
      _pageController.animateToPage(
        index,
        duration: LythMotion.standard,
        curve: LythMotion.emphasisCurve,
      );
    });
  }

  List<FeedModel> _feedsForSection(
    List<FeedModel> feeds,
    AlphaFeedSection section,
  ) {
    return switch (section) {
      AlphaFeedSection.discover =>
        feeds.where((feed) => feed.type == FeedType.discover).toList(),
      AlphaFeedSection.myFeeds =>
        feeds.where((feed) => feed.type == FeedType.custom).toList(),
      AlphaFeedSection.newsBoard =>
        feeds.where((feed) => feed.type == FeedType.news).toList(),
    };
  }

  Widget _buildEmptySection(BuildContext context) {
    final canSwitchFeeds = _canSwitchFeeds(ref.watch(feedListProvider));
    final isMyFeeds = _activeSection == AlphaFeedSection.myFeeds;
    final isPrivateSection = _activeSection != AlphaFeedSection.discover;
    final entitlements = isPrivateSection
        ? ref.watch(feedEntitlementsProvider)
        : null;
    final customFeeds = isMyFeeds ? ref.watch(customFeedsProvider) : null;
    final isLoading =
        (entitlements?.isLoading ?? false) || (customFeeds?.isLoading ?? false);
    final hasError =
        (entitlements?.hasError ?? false) || (customFeeds?.hasError ?? false);
    final title = switch (_activeSection) {
      AlphaFeedSection.discover => 'Discover',
      AlphaFeedSection.myFeeds => 'My Feeds',
      AlphaFeedSection.newsBoard => 'News Board',
    };
    final heading = isLoading
        ? 'Loading your feeds'
        : hasError
        ? 'Couldn’t load your feeds'
        : switch (_activeSection) {
            AlphaFeedSection.discover => 'Discover unavailable',
            AlphaFeedSection.myFeeds => 'No custom feeds yet',
            AlphaFeedSection.newsBoard => 'News Board is Black-only',
          };
    final description = isLoading
        ? 'Checking which feeds are available.'
        : hasError
        ? 'Try again to confirm access and load your feeds.'
        : switch (_activeSection) {
            AlphaFeedSection.discover =>
              'Try again when the Discover service is available.',
            AlphaFeedSection.myFeeds =>
              'Create a feed to follow the topics and accounts you choose.',
            AlphaFeedSection.newsBoard =>
              'News Board is available only to Black accounts. Lythaus confirms access before content loads.',
          };
    final icon = switch (_activeSection) {
      AlphaFeedSection.discover => Icons.explore_outlined,
      AlphaFeedSection.myFeeds => Icons.dynamic_feed_outlined,
      AlphaFeedSection.newsBoard => Icons.newspaper_outlined,
    };
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            LythausTopBar(
              title: title,
              logoFocusNode: _feedControlsFocus,
              titleFocusNode: _feedTitleFocus,
              onLogoTap: canSwitchFeeds
                  ? () => _openFeedControl(_feedControlsFocus)
                  : null,
              onTitleTap: canSwitchFeeds
                  ? () => _openFeedControl(_feedTitleFocus)
                  : null,
              onSearchTap: _openSearch,
              onTrendingTap: _openTrending,
              useWordmark: true,
            ),
            const _OwnSubmissions(),
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (isLoading)
                        const CircularProgressIndicator()
                      else
                        Icon(icon, size: 48),
                      const SizedBox(height: 12),
                      Text(
                        heading,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      Text(description, textAlign: TextAlign.center),
                      if (hasError) ...[
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: () {
                            ref.invalidate(feedEntitlementsProvider);
                            ref.invalidate(customFeedsProvider);
                          },
                          child: const Text('Retry'),
                        ),
                      ] else if (isMyFeeds && !isLoading) ...[
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          onPressed: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => const CustomFeedCreationFlow(),
                            ),
                          ),
                          icon: const Icon(Icons.add),
                          label: const Text('Create custom feed'),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _canSwitchFeeds(List<FeedModel> feeds) =>
      feeds.where((feed) => feed.type != FeedType.moderation).length > 1;

  void _openFeedControl(FocusNode triggerFocus) {
    final session = ref.read(feedReadSessionProvider);
    final allFeeds = ref.read(feedListProvider);
    if (_feedControlsOpen || !_canSwitchFeeds(allFeeds)) return;
    _feedControlsOpen = true;
    triggerFocus.requestFocus();
    final sectionFeeds = _feedsForSection(allFeeds, _activeSection);
    final activeFeed = sectionFeeds.isEmpty
        ? null
        : sectionFeeds[_activeIndex.clamp(0, sectionFeeds.length - 1)];
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
          return CallbackShortcuts(
            bindings: {
              const SingleActivator(LogicalKeyboardKey.escape): () {
                Navigator.of(sheetContext).maybePop();
              },
            },
            child: Focus(
              autofocus: true,
              child: Align(
                alignment: Alignment.bottomCenter,
                heightFactor: 1,
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: 640,
                    maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.72,
                  ),
                  child: Material(
                    child: SingleChildScrollView(
                      child: FeedControlPanel(
                        availableFeeds: allFeeds,
                        selectedFeedId: activeFeed?.id,
                        onSelect: (feed) {
                          Navigator.of(sheetContext).pop();
                          if (!session.isCurrent) return;
                          _selectFeed(feed);
                        },
                        onClose: () => Navigator.of(sheetContext).maybePop(),
                      ),
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
        triggerFocus.requestFocus();
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

class _FeedSwitchRail extends StatelessWidget {
  const _FeedSwitchRail({
    required this.feeds,
    required this.activeIndex,
    required this.onSelect,
  });

  final List<FeedModel> feeds;
  final int activeIndex;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final spacing = context.spacing;
    return SingleChildScrollView(
      padding: EdgeInsets.symmetric(horizontal: spacing.md),
      scrollDirection: Axis.horizontal,
      child: Row(
        children: List.generate(feeds.length, (index) {
          final feed = feeds[index];
          return Padding(
            padding: EdgeInsets.only(right: spacing.xs),
            child: ChoiceChip(
              label: Text(feed.name),
              selected: index == activeIndex,
              onSelected: (_) => onSelect(index),
            ),
          );
        }),
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
          controller: controller,
          feed: feed,
          items: items,
          onOpenItem: (item) => _openPostDetail(context, item.id),
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
          onOpenItem: (item) => _openPostDetail(context, item.id),
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
          onOpenItem: (item) => _openPostDetail(context, item.id),
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
        builder: (_) =>
            ContentEditorScreen(contentId: item.id, text: item.body),
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
