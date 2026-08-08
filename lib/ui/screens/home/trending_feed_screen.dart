// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class TrendingFeedScreen extends ConsumerWidget {
  const TrendingFeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trending = ref.watch(trendingFeedProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Trending')),
      body: trending.when(
        data: (feed) => RefreshIndicator(
          onRefresh: () => ref.read(trendingFeedProvider.notifier).refresh(),
          child: ListView.separated(
            padding: const EdgeInsets.only(top: Spacing.sm, bottom: Spacing.xl),
            itemBuilder: (context, index) {
              final item = _mapPost(feed.posts[index]);
              return FeedCard(item: item);
            },
            separatorBuilder: (_, __) => const SizedBox(height: Spacing.xs),
            itemCount: feed.posts.length,
          ),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: Padding(
            padding: const EdgeInsets.all(Spacing.lg),
            child: Text(
              'Unable to load trending right now.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
          ),
        ),
      ),
    );
  }

  FeedItem _mapPost(domain.Post post) {
    final type = (post.mediaUrls?.isNotEmpty ?? false)
        ? ContentType.image
        : ContentType.text;
    return FeedItem(
      id: post.id,
      feedId: 'trending',
      author: post.authorUsername,
      sourceName: post.source?.name,
      sourceUrl: post.source?.url,
      contentType: type,
      title: post.metadata?.category ?? 'Update',
      body: post.text,
      imageUrl: post.mediaUrls?.isNotEmpty == true
          ? post.mediaUrls!.first
          : null,
      publishedAt: post.createdAt,
      tags: post.metadata?.tags ?? const [],
      isNews: post.isNews,
      isPinned: post.metadata?.isPinned ?? false,
      authorshipLabel: post.authorship.label.label,
      classificationSource: post.authorship.classificationSource,
    );
  }
}
