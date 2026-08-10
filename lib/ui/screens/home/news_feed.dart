// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/design_system/components/lyth_empty_state.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/components/news_card.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class NewsFeed extends ConsumerWidget {
  const NewsFeed({
    super.key,
    required this.feed,
    required this.items,
    this.controller,
    this.hasMore = false,
    this.isLoadingMore = false,
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
  final bool showNewPostsPill;
  final VoidCallback? onNewPostsPillTap;
  final VoidCallback? onLoadMore;
  final Future<void> Function()? onRefresh;
  final String? currentUserId;
  final Future<void> Function(FeedItem item)? onEditItem;
  final Future<void> Function(FeedItem item)? onOpenItem;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entitlements = ref.watch(feedEntitlementsProvider);
    if (entitlements.isLoading) {
      return Semantics(
        liveRegion: true,
        label: 'Checking News Board access',
        child: const Center(child: CircularProgressIndicator()),
      );
    }
    if (entitlements.hasError ||
        entitlements.valueOrNull == null ||
        !entitlements.valueOrNull!.canAccessNewsBoard) {
      return Semantics(
        liveRegion: true,
        label: 'News Board is available to Black accounts only',
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(Spacing.lg),
            child: LythEmptyState(
              icon: Icons.lock_outline,
              title: 'News Board is Black-only',
              subtitle:
                  'News Board is available only to Black accounts. '
                  'Your access is always confirmed by Lythaus.',
              actionLabel: entitlements.hasError ? 'Retry' : null,
              onAction: entitlements.hasError
                  ? () => ref.invalidate(feedEntitlementsProvider)
                  : null,
            ),
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: onRefresh ?? () async {},
      child: NotificationListener<ScrollNotification>(
        onNotification: (notification) {
          if (onLoadMore == null || !hasMore || isLoadingMore) {
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
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: Spacing.md,
                  vertical: Spacing.sm,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Editorial coverage from earned, revocable contributors.',
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                  ],
                ),
              ),
            ),
            if (items.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: LythEmptyState(
                  icon: Icons.newspaper_outlined,
                  title: 'No news yet',
                  subtitle: 'Check back soon for fresh coverage.',
                ),
              )
            else ...[
              if (showNewPostsPill)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.only(
                      left: Spacing.md,
                      right: Spacing.md,
                      bottom: Spacing.xs,
                    ),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: ActionChip(
                        avatar: const Icon(Icons.fiber_new_rounded, size: 16),
                        label: const Text('New posts'),
                        onPressed: onNewPostsPillTap,
                      ),
                    ),
                  ),
                ),
              SliverList.separated(
                itemBuilder: (context, index) {
                  final item = items[index];
                  final canEdit =
                      currentUserId != null && currentUserId == item.authorId;
                  return NewsCard(
                    item: item,
                    onTap: onOpenItem == null ? null : () => onOpenItem!(item),
                    canEdit: canEdit,
                    onEdit: canEdit && onEditItem != null
                        ? () => onEditItem!(item)
                        : null,
                  );
                },
                separatorBuilder: (_, __) => const SizedBox(height: Spacing.xs),
                itemCount: items.length,
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: Spacing.md),
                  child: Center(
                    child: isLoadingMore
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const SizedBox.shrink(),
                  ),
                ),
              ),
            ],
            const SliverPadding(padding: EdgeInsets.only(bottom: Spacing.xl)),
          ],
        ),
      ),
    );
  }
}
