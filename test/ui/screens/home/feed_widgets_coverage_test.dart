import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/ui/components/feed_card.dart';

import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/home/discover_feed.dart';
import 'package:lythaus/ui/screens/home/news_feed.dart';
import 'package:lythaus/ui/screens/home/custom_feed.dart';

void main() {
  const feed = FeedModel(
    id: 'fm-1',
    name: 'Test Feed',
    type: FeedType.discover,
    contentFilters: ContentFilters(allowedTypes: {ContentType.text}),
    sorting: SortingRule.newest,
    refinements: FeedRefinements(),
    subscriptionLevelRequired: 0,
  );

  const customFeedModel = FeedModel(
    id: 'fm-c',
    name: 'My Custom',
    type: FeedType.custom,
    contentFilters: ContentFilters(allowedTypes: {ContentType.text}),
    sorting: SortingRule.relevant,
    refinements: FeedRefinements(
      includeKeywords: ['flutter', 'dart'],
      excludeKeywords: ['spam'],
    ),
    subscriptionLevelRequired: 0,
    isCustom: true,
  );

  const newsFeedModel = FeedModel(
    id: 'fm-n',
    name: 'News Feed',
    type: FeedType.news,
    contentFilters: ContentFilters(allowedTypes: {ContentType.text}),
    sorting: SortingRule.newest,
    refinements: FeedRefinements(),
    subscriptionLevelRequired: 0,
  );

  final items = List.generate(
    5,
    (i) => FeedItem(
      id: 'item-$i',
      feedId: 'fm-1',
      author: 'author-$i',
      authorId: i == 0 ? 'current-user' : 'other-$i',
      contentType: ContentType.text,
      title: 'Title $i',
      body: 'Body $i',
      tags: const ['routine-topic'],
      publishedAt: DateTime(2024, 1, i + 1),
    ),
  );

  final newsItems = List.generate(
    5,
    (i) => FeedItem(
      id: 'news-$i',
      feedId: newsFeedModel.id,
      author: 'reporter-$i',
      authorId: i == 0 ? 'current-user' : 'reporter-$i',
      sourceName: 'Fixture newsroom',
      sourceUrl: 'https://example.invalid/news/$i',
      contentType: ContentType.text,
      title: 'News headline $i',
      body: 'News body $i',
      publishedAt: DateTime(2024, 1, i + 1),
      isNews: true,
    ),
  );

  Widget wrap(Widget child) {
    return ProviderScope(
      overrides: [
        feedEntitlementsProvider.overrideWith(
          (ref) async => const FeedEntitlements(
            tier: 'black',
            maxCustomFeeds: 3,
            newsBoardAccess: 'full',
          ),
        ),
      ],
      child: MaterialApp(
        home: Scaffold(body: SizedBox(height: 800, child: child)),
      ),
    );
  }

  group('DiscoverFeed', () {
    testWidgets('renders header and items with canEdit', (tester) async {
      await tester.pumpWidget(
        wrap(
          DiscoverFeed(
            feed: feed,
            items: items,
            currentUserId: 'current-user',
            onEditItem: (_) async {},
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Public posts, newest first.'), findsOneWidget);
      expect(find.text('Body 0'), findsOneWidget);
      expect(find.text('author-0'), findsOneWidget);
      expect(find.text('Authorship: Under review'), findsWidgets);
      expect(find.byTooltip('Post actions'), findsWidgets);
      expect(find.text('Title 0'), findsOneWidget);
      expect(find.text('routine-topic'), findsNothing);
    });

    testWidgets('renders empty state when there are no items', (tester) async {
      await tester.pumpWidget(wrap(const DiscoverFeed(feed: feed, items: [])));
      await tester.pump();

      expect(find.text('No public posts yet'), findsOneWidget);
      expect(
        find.text(
          'Discover shows public posts. Check again later for new posts.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('empty owner feed explains private posts and supports refresh', (
      tester,
    ) async {
      var refreshed = false;
      await tester.pumpWidget(
        wrap(
          DiscoverFeed(
            feed: feed,
            items: const [],
            currentUserId: 'current-user',
            onRefresh: () async => refreshed = true,
          ),
        ),
      );
      await tester.pump();
      expect(
        find.text(
          'Only public posts appear in Discover. Your private and pending posts are in Profile.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Check for posts'));
      expect(refreshed, isTrue);
      expect(find.byType(FeedCard), findsNothing);
    });

    testWidgets('triggers onLoadMore near scroll end', (tester) async {
      bool loadMoreCalled = false;
      await tester.pumpWidget(
        wrap(
          DiscoverFeed(
            feed: feed,
            items: items,
            hasMore: true,
            onLoadMore: () => loadMoreCalled = true,
          ),
        ),
      );
      await tester.pump();

      // Fling down to trigger scroll near end
      await tester.fling(
        find.byType(CustomScrollView),
        const Offset(0, -2000),
        3000,
      );
      await tester.pump();

      expect(loadMoreCalled, isTrue);
    });

    testWidgets('does not call onLoadMore when isLoadingMore', (tester) async {
      bool loadMoreCalled = false;
      await tester.pumpWidget(
        wrap(
          DiscoverFeed(
            feed: feed,
            items: items,
            hasMore: true,
            isLoadingMore: true,
            onLoadMore: () => loadMoreCalled = true,
          ),
        ),
      );
      await tester.pump();

      await tester.fling(
        find.byType(CustomScrollView),
        const Offset(0, -2000),
        3000,
      );
      await tester.pump();

      expect(loadMoreCalled, isFalse);
    });

    testWidgets('shows New posts pill and handles tap callback', (
      tester,
    ) async {
      var tapped = false;
      await tester.pumpWidget(
        wrap(
          DiscoverFeed(
            feed: feed,
            items: items,
            showNewPostsPill: true,
            onNewPostsPillTap: () => tapped = true,
          ),
        ),
      );
      await tester.pump();

      expect(find.text('New posts'), findsOneWidget);
      await tester.tap(find.text('New posts'));
      await tester.pump();
      expect(tapped, isTrue);
    });
  });

  group('NewsFeed', () {
    testWidgets('renders header and items with canEdit', (tester) async {
      await tester.pumpWidget(
        wrap(
          NewsFeed(
            feed: newsFeedModel,
            items: newsItems,
            currentUserId: 'current-user',
            onEditItem: (_) async {},
          ),
        ),
      );
      await tester.pump();

      expect(find.text('About News Board'), findsOneWidget);
      expect(find.text('News headline 0'), findsOneWidget);
      expect(find.text('News body 0'), findsOneWidget);
      expect(find.text('reporter-0'), findsOneWidget);
      expect(find.byTooltip('Post actions'), findsWidgets);
      expect(find.text('Authorship: Under review'), findsWidgets);
      expect(find.byTooltip('Post actions'), findsWidgets);
      await tester.tap(find.text('About News Board'));
      await tester.pumpAndSettle();
      expect(
        find.text('Editorial coverage from earned, revocable contributors.'),
        findsOneWidget,
      );
    });

    testWidgets('renders empty state when there are no items', (tester) async {
      await tester.pumpWidget(
        wrap(const NewsFeed(feed: newsFeedModel, items: [])),
      );
      await tester.pump();

      expect(find.text('No news yet'), findsOneWidget);
      expect(find.text('Check back soon for fresh coverage.'), findsOneWidget);
    });

    testWidgets('triggers onLoadMore near scroll end', (tester) async {
      bool loadMoreCalled = false;
      await tester.pumpWidget(
        wrap(
          NewsFeed(
            feed: newsFeedModel,
            items: newsItems,
            hasMore: true,
            onLoadMore: () => loadMoreCalled = true,
          ),
        ),
      );
      await tester.pump();

      await tester.fling(
        find.byType(CustomScrollView),
        const Offset(0, -2000),
        3000,
      );
      await tester.pump();

      expect(loadMoreCalled, isTrue);
    });

    testWidgets('renders without onLoadMore or hasMore', (tester) async {
      await tester.pumpWidget(
        wrap(NewsFeed(feed: newsFeedModel, items: newsItems)),
      );
      await tester.pump();

      expect(find.text('News headline 0'), findsOneWidget);
      expect(find.text('News body 0'), findsOneWidget);
      expect(find.text('Authorship: Under review'), findsWidgets);
    });
  });

  group('CustomFeedView', () {
    testWidgets('renders filter chips and items with canEdit', (tester) async {
      await tester.pumpWidget(
        wrap(
          CustomFeedView(
            feed: customFeedModel,
            items: items,
            currentUserId: 'current-user',
            onEditItem: (_) async {},
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Custom feed'), findsOneWidget);
      expect(find.text('+flutter'), findsOneWidget);
      expect(find.text('+dart'), findsOneWidget);
      expect(find.text('-spam'), findsOneWidget);
      expect(find.text('Body 0'), findsOneWidget);
      expect(find.text('author-0'), findsOneWidget);
      expect(find.text('Authorship: Under review'), findsWidgets);
      expect(find.byTooltip('Post actions'), findsWidgets);
      expect(find.text('Title 0'), findsOneWidget);
      expect(find.text('routine-topic'), findsNothing);
    });

    testWidgets('renders empty state when there are no items', (tester) async {
      await tester.pumpWidget(
        wrap(const CustomFeedView(feed: customFeedModel, items: [])),
      );
      await tester.pump();

      expect(find.text('No matching posts'), findsOneWidget);
      expect(
        find.text('Broaden your filters to see more results.'),
        findsOneWidget,
      );
    });

    testWidgets('triggers onLoadMore near scroll end', (tester) async {
      bool loadMoreCalled = false;
      await tester.pumpWidget(
        wrap(
          CustomFeedView(
            feed: customFeedModel,
            items: items,
            hasMore: true,
            onLoadMore: () => loadMoreCalled = true,
          ),
        ),
      );
      await tester.pump();

      await tester.fling(
        find.byType(CustomScrollView),
        const Offset(0, -2000),
        3000,
      );
      await tester.pump();

      expect(loadMoreCalled, isTrue);
    });

    testWidgets('renders without onLoadMore or hasMore', (tester) async {
      await tester.pumpWidget(
        wrap(CustomFeedView(feed: customFeedModel, items: items)),
      );
      await tester.pump();

      expect(find.text('Custom feed'), findsOneWidget);
    });
  });
}
