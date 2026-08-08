import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/models/moderation.dart';
import 'package:lythaus/state/providers/moderation_providers.dart';
import 'package:lythaus/ui/screens/home/discover_feed.dart';
import 'package:lythaus/ui/screens/home/news_feed.dart';
import 'package:lythaus/ui/screens/mod/appeal_case.dart';

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
        child: MaterialApp(
          home: Scaffold(
            body: DiscoverFeed(feed: feed, items: items),
          ),
        ),
      ),
    );

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
        child: MaterialApp(
          home: Scaffold(
            body: NewsFeed(feed: feed, items: items),
          ),
        ),
      ),
    );

    expect(
      find.text('Hybrid newsroom + high reputation contributors.'),
      findsOneWidget,
    );
    expect(find.text('Pinned Story'), findsOneWidget);
    expect(find.text('News'), findsWidgets);
    expect(find.byIcon(Icons.workspace_premium_outlined), findsOneWidget);
  });

  testWidgets('AppealCaseScreen renders appeal details', (tester) async {
    const appeal = AppealCase(
      id: 'a1',
      authorStatement: 'Let me back in',
      evidence: 'Evidence sample',
      votesFor: 10,
      votesAgainst: 2,
      weightFor: 0.66,
      weightAgainst: 0.34,
      decision: ModerationDecision.pending,
    );

    final container = ProviderContainer(
      overrides: [
        appealsProvider.overrideWith((ref) => [appeal]),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: AppealCaseScreen(appealId: 'a1')),
      ),
    );

    expect(find.text('Appeal'), findsOneWidget);
    expect(find.text('Let me back in'), findsOneWidget);
    expect(find.text('Evidence'), findsOneWidget);
    expect(find.text('Pending'), findsOneWidget);
  });
}
