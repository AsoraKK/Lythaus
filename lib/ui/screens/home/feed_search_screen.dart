// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class FeedSearchScreen extends ConsumerStatefulWidget {
  const FeedSearchScreen({super.key});

  @override
  ConsumerState<FeedSearchScreen> createState() => _FeedSearchScreenState();
}

class _FeedSearchScreenState extends ConsumerState<FeedSearchScreen> {
  final controller = TextEditingController();
  String query = '';

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final results = query.isEmpty ? null : ref.watch(feedSearchProvider(query));

    return Scaffold(
      appBar: AppBar(title: const Text('Search')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(Spacing.md),
            child: TextField(
              controller: controller,
              decoration: InputDecoration(
                labelText: 'Search keywords or tags',
                prefixIcon: const Icon(Icons.search),
                border: const OutlineInputBorder(),
                suffixIcon: controller.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          setState(() {
                            controller.clear();
                            query = '';
                          });
                        },
                      )
                    : null,
              ),
              onSubmitted: (value) {
                setState(() => query = value.trim());
              },
            ),
          ),
          if (query.isEmpty)
            Padding(
              padding: const EdgeInsets.all(Spacing.lg),
              child: Text(
                'Search across feeds. Results use tags while full-text search is wired.',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            )
          else if (results == null)
            const SizedBox.shrink()
          else
            Expanded(
              child: results.when(
                data: (feed) => ListView.separated(
                  padding: const EdgeInsets.only(
                    top: Spacing.sm,
                    bottom: Spacing.xl,
                  ),
                  itemBuilder: (context, index) {
                    final item = _mapPost(feed.posts[index]);
                    return FeedCard(item: item);
                  },
                  separatorBuilder: (_, __) =>
                      const SizedBox(height: Spacing.xs),
                  itemCount: feed.posts.length,
                ),
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(Spacing.lg),
                    child: Text(
                      'Search is unavailable right now.',
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  FeedItem _mapPost(domain.Post post) {
    final type = (post.mediaUrls?.isNotEmpty ?? false)
        ? ContentType.image
        : ContentType.text;
    return FeedItem(
      id: post.id,
      feedId: 'search',
      author: post.authorUsername,
      sourceName: post.source?.name,
      sourceUrl: post.source?.url,
      contentType: type,
      title: post.metadata?.category ?? 'Result',
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
