// ignore_for_file: public_member_api_docs

// ignore_for_file: use_build_context_synchronously

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/components/lythaus_top_bar.dart';
import 'package:lythaus/ui/components/feed_control_panel.dart';
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

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final feeds = _feedsForSection(ref.watch(feedListProvider));
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
              onLogoTap: _openFeedControl,
              onTitleTap: _openFeedControl,
              onSearchTap: _openSearch,
              onTrendingTap: _openTrending,
              useWordmark: true,
            ),
            SizedBox(height: spacing.xs),
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
                itemBuilder: (context, index) => _FeedPage(feed: feeds[index]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _onFeedSelected(int index) {
    setState(() => _activeIndex = index);
    _pageController.animateToPage(
      index,
      duration: LythMotion.standard,
      curve: LythMotion.emphasisCurve,
    );
  }

  List<FeedModel> _feedsForSection(List<FeedModel> feeds) {
    return switch (widget.section) {
      AlphaFeedSection.discover =>
        feeds.where((feed) => feed.type == FeedType.discover).toList(),
      AlphaFeedSection.myFeeds =>
        feeds.where((feed) => feed.type == FeedType.custom).toList(),
      AlphaFeedSection.newsBoard =>
        feeds.where((feed) => feed.type == FeedType.news).toList(),
    };
  }

  Widget _buildEmptySection(BuildContext context) {
    final isMyFeeds = widget.section == AlphaFeedSection.myFeeds;
    final title = switch (widget.section) {
      AlphaFeedSection.discover => 'Discover',
      AlphaFeedSection.myFeeds => 'My Feeds',
      AlphaFeedSection.newsBoard => 'News Board',
    };
    final heading = switch (widget.section) {
      AlphaFeedSection.discover => 'Discover unavailable',
      AlphaFeedSection.myFeeds => 'No custom feeds yet',
      AlphaFeedSection.newsBoard => 'News unavailable',
    };
    final description = switch (widget.section) {
      AlphaFeedSection.discover =>
        'Try again when the Discover service is available.',
      AlphaFeedSection.myFeeds =>
        'Create a feed to follow the topics and accounts you choose.',
      AlphaFeedSection.newsBoard =>
        'Try again when the News Board service is available.',
    };
    final icon = switch (widget.section) {
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
              onLogoTap: _openFeedControl,
              onTitleTap: _openFeedControl,
              onSearchTap: _openSearch,
              onTrendingTap: _openTrending,
              useWordmark: true,
            ),
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(icon, size: 48),
                      const SizedBox(height: 12),
                      Text(
                        heading,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      Text(description, textAlign: TextAlign.center),
                      if (isMyFeeds) ...[
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

  void _openFeedControl() {
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      builder: (_) => const FeedControlPanel(),
    );
  }

  void _openTrending() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const TrendingFeedScreen()));
  }

  void _openSearch() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const FeedSearchScreen()));
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
  const _FeedPage({required this.feed});

  final FeedModel feed;

  @override
  ConsumerState<_FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends ConsumerState<_FeedPage> {
  static const double _estimatedCardExtent = 340;
  late final ScrollController _scrollController;
  bool _restoreApplied = false;
  bool _firstFeedLoadLogged = false;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
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

    if (liveState.isInitialLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (liveState.errorMessage != null && liveState.items.isEmpty) {
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
      items: liveState.items,
      hasMore: liveState.hasMore,
      isLoadingMore: liveState.isLoadingMore,
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

    _restoreApplied = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) {
        return;
      }

      final maxExtent = _scrollController.position.maxScrollExtent;
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
    if (!_scrollController.hasClients) {
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
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => PostDetailScreen(postId: postId)),
    );
  }

  Future<void> _showEditPostDialog(
    BuildContext context,
    WidgetRef ref,
    FeedItem item,
  ) async {
    final token = await ref.read(jwtProvider.future);
    if (token == null || token.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Sign in to edit your post.')),
        );
      }
      return;
    }

    final controller = TextEditingController(text: item.body);
    final submitted = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit post'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 6,
          minLines: 3,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            hintText: 'Update your post text',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();

    final updatedText = submitted?.trim();
    if (updatedText == null ||
        updatedText.isEmpty ||
        updatedText == item.body.trim()) {
      return;
    }

    final repository = ref.read(postRepositoryProvider);
    final result = await repository.updatePost(
      postId: item.id,
      request: UpdatePostRequest(
        text: updatedText,
        mediaUrl: item.imageUrl,
        contentType: switch (item.contentType) {
          ContentType.image => 'image',
          ContentType.video => 'video',
          _ => 'text',
        },
      ),
      token: token,
    );

    if (!context.mounted) {
      return;
    }

    switch (result) {
      case CreatePostSuccess():
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Post updated')));
        await ref.read(liveFeedStateProvider(widget.feed).notifier).refresh();
      case CreatePostBlocked(:final message):
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      case CreatePostLimitExceeded(:final message):
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      case CreatePostError(:final message):
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
    }
  }
}
