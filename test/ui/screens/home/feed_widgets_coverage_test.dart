import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/state/models/feed_models.dart';
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
      publishedAt: DateTime(2024, 1, i + 1),
    ),
  );

  Widget wrap(Widget child) {
    return ProviderScope(
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

      expect(
        find.text('Discover calm, trustworthy updates tailored to you.'),
        findsOneWidget,
      );
      expect(find.text('Title 0'), findsOneWidget);
    });

    testWidgets('renders empty state when there are no items', (tester) async {
      await tester.pumpWidget(wrap(const DiscoverFeed(feed: feed, items: [])));
      await tester.pump();

      expect(find.text('No posts yet'), findsOneWidget);
      expect(find.text('Check back soon for new updates.'), findsOneWidget);
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
            feed: feed,
            items: items,
            currentUserId: 'current-user',
            onEditItem: (_) async {},
          ),
        ),
      );
      await tester.pump();

      expect(
        find.text('Hybrid newsroom + high reputation contributors.'),
        findsOneWidget,
      );
      expect(find.text('Title 0'), findsOneWidget);
    });

    testWidgets('renders empty state when there are no items', (tester) async {
      await tester.pumpWidget(wrap(const NewsFeed(feed: feed, items: [])));
      await tester.pump();

      expect(find.text('No news yet'), findsOneWidget);
      expect(find.text('Check back soon for fresh coverage.'), findsOneWidget);
    });

    testWidgets('triggers onLoadMore near scroll end', (tester) async {
      bool loadMoreCalled = false;
      await tester.pumpWidget(
        wrap(
          NewsFeed(
            feed: feed,
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
      await tester.pumpWidget(wrap(NewsFeed(feed: feed, items: items)));
      await tester.pump();

      expect(find.text('Title 0'), findsOneWidget);
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
      expect(find.text('Title 0'), findsOneWidget);
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
