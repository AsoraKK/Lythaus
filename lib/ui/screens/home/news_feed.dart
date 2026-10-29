// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/design_system/components/lyth_empty_state.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/components/interactive_feed_card.dart';
import 'package:lythaus/ui/theme/spacing.dart';

const _membershipAccessDisclosure =
    'This view shows access from your account tier. It does not report payment confirmation, pending purchases, or expiry.';

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
    if (entitlements.hasError || entitlements.valueOrNull == null) {
      return Semantics(
        liveRegion: true,
        label: 'News Board access could not be verified',
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(Spacing.lg),
            child: LythEmptyState(
              icon: Icons.lock_outline,
              title: 'Couldn’t verify News Board access',
              subtitle:
                  'Lythaus couldn’t read your current account tier. Try again to check access.',
              actionLabel: entitlements.hasError ? 'Retry' : null,
              onAction: entitlements.hasError
                  ? () => ref.invalidate(feedEntitlementsProvider)
                  : null,
            ),
          ),
        ),
      );
    }

    final currentEntitlements = entitlements.valueOrNull!;
    if (!currentEntitlements.canAccessNewsBoard) {
      final tierLabel = _tierLabel(currentEntitlements.tier);
      return Semantics(
        liveRegion: true,
        label: 'News Board is available to Black accounts only',
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Spacing.lg),
          child: Column(
            children: [
              LythEmptyState(
                icon: Icons.lock_outline,
                title: 'News Board is Black-only',
                subtitle:
                    'Your current account tier is $tierLabel. News Board access is not currently available to this account. Under the standard tier policy, Black includes News Board access; Free and Premium do not. $_membershipAccessDisclosure',
              ),
              _MembershipComparison(current: currentEntitlements),
            ],
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
                      'Current account tier: ${_tierLabel(currentEntitlements.tier)}',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: Spacing.xs),
                    Text(
                      _membershipAccessDisclosure,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: Spacing.sm),
                    Text(
                      'Editorial coverage from earned, revocable contributors.',
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                    _MembershipComparison(current: currentEntitlements),
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
                  return InteractiveFeedCard(
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

class _MembershipComparison extends StatelessWidget {
  const _MembershipComparison({required this.current});

  final FeedEntitlements current;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // The comparison follows packages/contracts/src/tier-policy.ts. The
    // current row always uses the account's server-issued entitlement.
    const tiers = [
      ('free', 'Free', 1, false),
      ('premium', 'Premium', 2, false),
      ('black', 'Black', 3, true),
    ];
    return ExpansionTile(
      title: const Text('Compare feed access'),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      children: [
        for (final tier in tiers)
          Builder(
            builder: (context) {
              final selected = current.tier.toLowerCase() == tier.$1;
              final count = selected ? current.maxCustomFeeds : tier.$3;
              final news = selected ? current.canAccessNewsBoard : tier.$4;
              return ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(selected ? '${tier.$2} · Your access' : tier.$2),
                subtitle: Text(
                  '$count custom feed${count == 1 ? '' : 's'} · '
                  '${news ? 'News Board access' : 'No News Board access'}',
                ),
              );
            },
          ),
        const SizedBox(height: 8),
        Text(
          'Editorial status is earned and separate from membership.',
          style: theme.textTheme.bodySmall,
        ),
        Text(
          'Your current access comes from your account; it does not confirm payment or expiry.',
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
}

String _tierLabel(String tier) => switch (tier.toLowerCase()) {
  'free' => 'Free',
  'premium' => 'Premium',
  'black' => 'Black',
  _ => 'Unknown',
};
