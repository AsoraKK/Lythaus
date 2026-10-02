// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/design_system/components/lyth_empty_state.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';
import 'package:lythaus/state/models/post_feed_item_mapper.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class TrendingFeedScreen extends ConsumerWidget {
  const TrendingFeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trending = ref.watch(trendingFeedProvider);

    return ReadingPane(
      child: Scaffold(
        appBar: AppBar(title: const Text('Trending')),
        body: trending.when(
          data: (feed) => RefreshIndicator(
            onRefresh: () => ref.read(trendingFeedProvider.notifier).refresh(),
            child: feed.posts.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      LythEmptyState(
                        icon: Icons.trending_up_outlined,
                        title: 'No trending posts yet',
                        subtitle: 'Pull down to refresh.',
                      ),
                    ],
                  )
                : ListView.separated(
                    padding: const EdgeInsets.only(
                      top: Spacing.sm,
                      bottom: Spacing.xl,
                    ),
                    itemBuilder: (context, index) {
                      final item = mapPostToFeedItem(
                        feed.posts[index],
                        feedId: 'trending',
                        fallbackTitle: 'Update',
                      );
                      return FeedCard(
                        item: item,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => PostDetailScreen(postId: item.id),
                          ),
                        ),
                      );
                    },
                    separatorBuilder: (_, __) =>
                        const SizedBox(height: Spacing.xs),
                    itemCount: feed.posts.length,
                  ),
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => Center(
            child: Padding(
              padding: const EdgeInsets.all(Spacing.lg),
              child: LythEmptyState(
                icon: Icons.cloud_off_outlined,
                title: 'Unable to load trending right now.',
                actionLabel: 'Retry',
                onAction: () => ref.invalidate(trendingFeedProvider),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
