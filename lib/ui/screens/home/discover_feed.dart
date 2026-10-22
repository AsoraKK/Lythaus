// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/design_system/theme/theme_build_context_x.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/feed_card.dart';

class DiscoverFeed extends StatelessWidget {
  const DiscoverFeed({
    super.key,
    required this.feed,
    required this.items,
    this.controller,
    this.hasMore = false,
    this.isLoadingMore = false,
    this.isRefreshing = false,
    this.hasError = false,
    this.showNewPostsPill = false,
    this.onNewPostsPillTap,
    this.onLoadMore,
    this.onRefresh,
    this.currentUserId,
    this.onEditItem,
    this.onOpenItem,
  });

  final FeedModel feed;
  final List<FeedItem> items;
  final ScrollController? controller;
  final bool hasMore;
  final bool isLoadingMore;
  final bool isRefreshing;
  final bool hasError;
  final bool showNewPostsPill;
  final VoidCallback? onNewPostsPillTap;
  final VoidCallback? onLoadMore;
  final Future<void> Function()? onRefresh;
  final String? currentUserId;
  final Future<void> Function(FeedItem item)? onEditItem;
  final Future<void> Function(FeedItem item)? onOpenItem;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: RefreshIndicator(
          onRefresh: onRefresh ?? () async {},
          child: NotificationListener<ScrollNotification>(
            onNotification: (notification) {
              if (onLoadMore == null ||
                  !hasMore ||
                  isLoadingMore ||
                  isRefreshing ||
                  hasError) {
                return false;
              }
              if (notification.metrics.pixels >=
                  notification.metrics.maxScrollExtent - 200) {
                onLoadMore!.call();
              }
              return false;
            },
            child: CustomScrollView(
              controller: controller,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 16, 16, 16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Semantics(
                                header: true,
                                child: Text(
                                  'Discover',
                                  style: theme.textTheme.headlineMedium,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Public posts, newest first.',
                                style: theme.textTheme.bodyMedium,
                              ),
                            ],
                          ),
                        ),
                        if (onRefresh != null && !hasError && items.isNotEmpty)
                          IconButton(
                            tooltip: 'Refresh feed',
                            onPressed: isRefreshing ? null : onRefresh,
                            icon: const Icon(Icons.refresh),
                          ),
                      ],
                    ),
                  ),
                ),
                if (isRefreshing)
                  const SliverToBoxAdapter(
                    child: _FeedProgress(label: 'Loading posts'),
                  ),
                if (hasError && !isRefreshing)
                  SliverToBoxAdapter(
                    child: _FeedNotice(
                      icon: Icons.wifi_off_outlined,
                      title: items.isEmpty
                          ? 'Couldn’t load posts'
                          : 'Couldn’t update the feed',
                      message: items.isEmpty
                          ? 'Check your connection and try again.'
                          : 'You can keep reading loaded posts, or try again.',
                      action: onRefresh == null ? null : () => onRefresh!(),
                      actionLabel: 'Retry',
                    ),
                  ),
                if (items.isEmpty && !isRefreshing && !hasError)
                  SliverToBoxAdapter(
                    child: _FeedNotice(
                      icon: Icons.forum_outlined,
                      title: 'No public posts yet',
                      message: currentUserId == null
                          ? 'Discover shows public posts. Check again later for new posts.'
                          : 'Only public posts appear in Discover. Your private and pending posts are in Profile.',
                      action: onRefresh == null ? null : () => onRefresh!(),
                      actionLabel: 'Check for posts',
                    ),
                  ),
                if (showNewPostsPill && items.isNotEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          icon: const Icon(Icons.arrow_upward, size: 18),
                          label: const Text('New posts'),
                          onPressed: onNewPostsPillTap,
                        ),
                      ),
                    ),
                  ),
                SliverList.builder(
                  itemBuilder: (context, index) {
                    final item = items[index];
                    final canEdit =
                        currentUserId != null && currentUserId == item.authorId;
                    return FeedCard(
                      item: item,
                      onTap: onOpenItem == null
                          ? null
                          : () => onOpenItem!(item),
                      canEdit: canEdit,
                      onEdit: canEdit && onEditItem != null
                          ? () => onEditItem!(item)
                          : null,
                    );
                  },
                  itemCount: items.length,
                ),
                if (items.isNotEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: isLoadingMore
                          ? const _FeedProgress(label: 'Loading more posts')
                          : Center(
                              child: hasMore
                                  ? TextButton(
                                      onPressed: isRefreshing || hasError
                                          ? null
                                          : onLoadMore,
                                      child: const Text('Load more posts'),
                                    )
                                  : Text(
                                      'You’re up to date with public posts.',
                                      textAlign: TextAlign.center,
                                      style: theme.textTheme.bodySmall,
                                    ),
                            ),
                    ),
                  ),
                const SliverPadding(padding: EdgeInsets.only(bottom: 24)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FeedProgress extends StatelessWidget {
  const _FeedProgress({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(height: 12),
          Text(label, style: context.textTheme.bodyMedium),
        ],
      ),
    ),
  );
}

class _FeedNotice extends StatelessWidget {
  const _FeedNotice({
    required this.icon,
    required this.title,
    required this.message,
    required this.actionLabel,
    this.action,
  });

  final IconData icon;
  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback? action;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(16, 4, 16, 16),
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: context.colorScheme.surfaceContainerLow,
      border: Border.all(color: context.colorScheme.outlineVariant),
      borderRadius: BorderRadius.circular(context.radius.md),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: context.colorScheme.onSurfaceVariant, size: 28),
        const SizedBox(height: 16),
        Semantics(
          liveRegion: true,
          child: Text(title, style: context.textTheme.titleLarge),
        ),
        const SizedBox(height: 8),
        Text(message, style: context.textTheme.bodyLarge),
        if (action != null) ...[
          const SizedBox(height: 16),
          OutlinedButton(onPressed: action, child: Text(actionLabel)),
        ],
      ],
    ),
  );
}
