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

    return ReadingPane(
      child: Scaffold(
        appBar: AppBar(title: const Text('Search')),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(Spacing.md),
              child: TextField(
                controller: controller,
                decoration: InputDecoration(
                  labelText: 'Search tags',
                  prefixIcon: const Icon(Icons.search),
                  border: const OutlineInputBorder(),
                  suffixIcon: controller.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          tooltip: 'Clear search',
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
                onChanged: (_) => setState(() {}),
                textInputAction: TextInputAction.search,
              ),
            ),
            if (query.isEmpty)
              Padding(
                padding: const EdgeInsets.all(Spacing.lg),
                child: Text(
                  'Find posts by tag across your feeds.',
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
              )
            else if (results == null)
              const SizedBox.shrink()
            else
              Expanded(
                child: results.when(
                  data: (feed) => feed.posts.isEmpty
                      ? LythEmptyState(
                          icon: Icons.search_off_outlined,
                          title: 'No results for “$query”',
                          subtitle: 'Try a different tag.',
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.only(
                            top: Spacing.sm,
                            bottom: Spacing.xl,
                          ),
                          itemBuilder: (context, index) {
                            final item = mapPostToFeedItem(
                              feed.posts[index],
                              feedId: 'search',
                              fallbackTitle: 'Result',
                            );
                            return FeedCard(
                              item: item,
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) =>
                                      PostDetailScreen(postId: item.id),
                                ),
                              ),
                            );
                          },
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: Spacing.xs),
                          itemCount: feed.posts.length,
                        ),
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (_, __) => Center(
                    child: Padding(
                      padding: const EdgeInsets.all(Spacing.lg),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('Search is unavailable right now.'),
                          const SizedBox(height: Spacing.md),
                          FilledButton(
                            onPressed: () =>
                                ref.invalidate(feedSearchProvider(query)),
                            child: const Text('Retry search'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
