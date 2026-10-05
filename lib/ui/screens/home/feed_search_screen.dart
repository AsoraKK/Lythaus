// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/design_system/components/lyth_empty_state.dart';
import 'package:lythaus/state/models/post_feed_item_mapper.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/components/reading_pane.dart';
import 'package:lythaus/ui/theme/spacing.dart';

class FeedSearchScreen extends ConsumerStatefulWidget {
  const FeedSearchScreen({super.key, this.initialQuery = ''});

  final String initialQuery;

  @override
  ConsumerState<FeedSearchScreen> createState() => _FeedSearchScreenState();
}

class _FeedSearchScreenState extends ConsumerState<FeedSearchScreen> {
  final controller = TextEditingController();
  final _resultsScrollController = ScrollController();
  String query = '';
  FeedSearchKey? _loadingMoreKey;
  FeedSearchKey? _loadMoreFailedKey;

  @override
  void initState() {
    super.initState();
    query = widget.initialQuery;
    controller.text = query;
    _resultsScrollController.addListener(_loadNearBottom);
  }

  @override
  void didUpdateWidget(FeedSearchScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialQuery != widget.initialQuery) {
      query = widget.initialQuery;
      controller.text = query;
      _loadingMoreKey = null;
      _loadMoreFailedKey = null;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_resultsScrollController.hasClients) {
          _resultsScrollController.jumpTo(0);
        }
      });
    }
  }

  FeedSearchKey get _searchKey =>
      (tag: query, tokenVersion: ref.read(tokenVersionProvider));

  String get _location => Uri(
    path: '/search',
    queryParameters: query.isEmpty ? null : {'q': query},
  ).toString();

  void _search(String value) {
    setState(() {
      query = value.trim();
      _loadingMoreKey = null;
      _loadMoreFailedKey = null;
    });
    if (_resultsScrollController.hasClients) {
      _resultsScrollController.jumpTo(0);
    }
    final router = GoRouter.maybeOf(context);
    if (router != null && GoRouterState.of(context).uri.path == '/search') {
      router.go(_location);
    }
  }

  @override
  void dispose() {
    _resultsScrollController
      ..removeListener(_loadNearBottom)
      ..dispose();
    controller.dispose();
    super.dispose();
  }

  void _loadNearBottom() {
    if (!_resultsScrollController.hasClients) return;
    final position = _resultsScrollController.position;
    if (position.maxScrollExtent > 0 &&
        position.maxScrollExtent - position.pixels < 240) {
      _loadMore();
    }
  }

  Future<void> _loadMore() async {
    if (query.isEmpty) return;
    final searchKey = _searchKey;
    if (_loadingMoreKey == searchKey) return;
    final state = ref.read(feedSearchProvider(searchKey));
    if (!state.hasValue || state.value?.hasMore != true) return;

    setState(() {
      _loadingMoreKey = searchKey;
      _loadMoreFailedKey = null;
    });
    try {
      await ref.read(feedSearchProvider(searchKey).notifier).loadMore();
    } catch (_) {
      if (mounted && searchKey == _searchKey) {
        setState(() => _loadMoreFailedKey = searchKey);
      }
    } finally {
      if (mounted && _loadingMoreKey == searchKey) {
        setState(() => _loadingMoreKey = null);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokenVersion = ref.watch(tokenVersionProvider);
    final searchKey = (tag: query, tokenVersion: tokenVersion);
    final results = query.isEmpty
        ? null
        : ref.watch(feedSearchProvider(searchKey));

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
                  hintText: '#civic',
                  prefixIcon: const Icon(Icons.search),
                  border: const OutlineInputBorder(),
                  suffixIcon: controller.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear),
                          tooltip: 'Clear search',
                          onPressed: () {
                            setState(() {
                              controller.clear();
                            });
                            _search('');
                          },
                        )
                      : null,
                ),
                onSubmitted: _search,
                onChanged: (_) => setState(() {}),
                textInputAction: TextInputAction.search,
              ),
            ),
            if (query.isEmpty)
              Expanded(
                child: SingleChildScrollView(
                  child: Padding(
                    padding: const EdgeInsets.all(Spacing.lg),
                    child: Text(
                      'Find posts by tag across your feeds. Results are shown in newest-first order.',
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                  ),
                ),
              )
            else if (results == null)
              const SizedBox.shrink()
            else
              Expanded(
                child: results.when(
                  data: (feed) {
                    if (feed.posts.isEmpty) {
                      return _scrollableResultState(
                        LythEmptyState(
                          icon: Icons.search_off_outlined,
                          title: 'No results for “$query”',
                          subtitle: 'Try a different tag.',
                        ),
                      );
                    }
                    return RefreshIndicator(
                      onRefresh: () => _refreshSearch(searchKey),
                      child: ListView.separated(
                        controller: _resultsScrollController,
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.only(
                          top: Spacing.sm,
                          bottom: Spacing.xl,
                        ),
                        itemBuilder: (context, index) {
                          if (index == feed.posts.length) {
                            if (_loadMoreFailedKey == searchKey) {
                              return Center(
                                child: TextButton(
                                  onPressed: _loadMore,
                                  child: const Text('Retry loading more'),
                                ),
                              );
                            }
                            if (_loadingMoreKey == searchKey) {
                              return const Padding(
                                padding: EdgeInsets.all(Spacing.md),
                                child: Center(
                                  child: CircularProgressIndicator(),
                                ),
                              );
                            }
                            return Center(
                              child: TextButton(
                                onPressed: _loadMore,
                                child: const Text('Load more'),
                              ),
                            );
                          }
                          final item = mapPostToFeedItem(
                            feed.posts[index],
                            feedId: 'search',
                            fallbackTitle: 'Result',
                          );
                          return FeedCard(
                            key: ValueKey(item.id),
                            item: item,
                            onTap: () => context.pushNamed<void>(
                              'post',
                              pathParameters: {'postId': item.id},
                            ),
                          );
                        },
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: Spacing.xs),
                        itemCount: feed.posts.length + (feed.hasMore ? 1 : 0),
                      ),
                    );
                  },
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (error, _) =>
                      _scrollableResultState(_searchError(error, searchKey)),
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _retrySearch() => ref.invalidate(feedSearchProvider(_searchKey));

  Widget _scrollableResultState(Widget child) => LayoutBuilder(
    builder: (context, constraints) => SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: ConstrainedBox(
        constraints: BoxConstraints(minHeight: constraints.maxHeight),
        child: child,
      ),
    ),
  );

  Widget _searchError(Object error, FeedSearchKey key) {
    if (error is SocialFeedException) {
      switch (error.code) {
        case 'invalid_tag_search':
          return const LythEmptyState(
            icon: Icons.search_off_outlined,
            title: 'Enter a valid tag.',
            subtitle:
                'Use 1–64 letters, numbers, or underscores. You can include #.',
          );
        case 'tag_search_unavailable':
          return LythEmptyState(
            icon: Icons.hourglass_disabled_outlined,
            title: 'Tag search is temporarily unavailable.',
            subtitle: 'Try again in a moment.',
            actionLabel: 'Retry search',
            onAction: _retrySearch,
          );
        case 'rate_limit_exceeded':
          return LythEmptyState(
            icon: Icons.hourglass_empty_outlined,
            title: 'You are searching too quickly.',
            subtitle: 'Wait a moment, then try again.',
            actionLabel: 'Try again',
            onAction: _retrySearch,
          );
        case 'FEED_UNAVAILABLE':
          return _retryableError('This search service is not available.', key);
      }
    }
    return _retryableError('Could not load search. Please try again.', key);
  }

  Widget _retryableError(String message, FeedSearchKey key) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Spacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message),
            const SizedBox(height: Spacing.md),
            FilledButton(
              onPressed: () => ref.invalidate(feedSearchProvider(key)),
              child: const Text('Retry search'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _refreshSearch(FeedSearchKey key) async {
    ref.invalidate(feedSearchProvider(key));
    try {
      await ref.read(feedSearchProvider(key).future);
    } catch (_) {
      // The provider retains the error for its explicit retry state.
    }
  }
}
