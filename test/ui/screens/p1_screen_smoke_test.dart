import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/home/discover_feed.dart';
import 'package:lythaus/ui/screens/home/news_feed.dart';

FeedModel _buildFeed(String id, FeedType type) {
  return FeedModel(
    id: id,
    name: 'Feed $id',
    type: type,
    contentFilters: const ContentFilters(allowedTypes: {ContentType.mixed}),
    sorting: SortingRule.relevant,
    refinements: const FeedRefinements(),
    subscriptionLevelRequired: 0,
  );
}

FeedItem _buildItem(
  String id,
  String title, {
  bool isNews = false,
  bool isPinned = false,
}) {
  return FeedItem(
    id: id,
    feedId: 'f1',
    author: 'author $id',
    contentType: ContentType.text,
    title: title,
    body: 'Body for $title',
    publishedAt: DateTime(2024, 1, 1),
    isNews: isNews,
    isPinned: isPinned,
  );
}

void main() {
  testWidgets('DiscoverFeed renders header and cards', (tester) async {
    final feed = _buildFeed('discover', FeedType.discover);
    final items = [
      _buildItem('1', 'Discover One'),
      _buildItem('2', 'Discover Two'),
    ];

    await tester.pumpWidget(
      ProviderScope(
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
          home: Scaffold(
            body: DiscoverFeed(feed: feed, items: items),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Discover calm, trustworthy updates tailored to you.'),
      findsOneWidget,
    );
    expect(find.text('Discover One'), findsOneWidget);
    expect(find.text('Discover Two'), findsOneWidget);
  });

  testWidgets('NewsFeed shows news badge and pinned item', (tester) async {
    final feed = _buildFeed('news', FeedType.news);
    final items = [
      _buildItem('n1', 'Pinned Story', isNews: true, isPinned: true),
    ];

    await tester.pumpWidget(
      ProviderScope(
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
          home: Scaffold(
            body: NewsFeed(feed: feed, items: items),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Editorial coverage from earned, revocable contributors.'),
      findsOneWidget,
    );
    expect(find.text('Pinned Story'), findsOneWidget);
    expect(find.text('News'), findsWidgets);
    expect(find.byIcon(Icons.workspace_premium_outlined), findsOneWidget);
  });
}
