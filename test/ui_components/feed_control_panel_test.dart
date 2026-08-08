import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/components/feed_control_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const feeds = [
    FeedModel(
      id: 'home',
      name: 'Home Feed',
      type: FeedType.discover,
      contentFilters: ContentFilters(allowedTypes: {ContentType.text}),
      sorting: SortingRule.hot,
      refinements: FeedRefinements(),
      subscriptionLevelRequired: 0,
      isHome: true,
    ),
    FeedModel(
      id: 'custom',
      name: 'Custom Feed',
      type: FeedType.custom,
      contentFilters: ContentFilters(allowedTypes: {ContentType.image}),
      sorting: SortingRule.relevant,
      refinements: FeedRefinements(),
      subscriptionLevelRequired: 1,
    ),
  ];

  testWidgets(
    'renders feed entries, highlights home, and responds to actions',
    (tester) async {
      FeedModel? selectedFeed;
      var customBuilderCalled = false;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            feedListProvider.overrideWithValue(feeds),
            currentFeedProvider.overrideWithValue(feeds.first),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: FeedControlPanel(
                onSelect: (feed) => selectedFeed = feed,
                onCreateCustom: () => customBuilderCalled = true,
              ),
            ),
          ),
        ),
      );

      expect(find.text('Feeds'), findsOneWidget);
      expect(find.text('Curated discover'), findsOneWidget);
      expect(find.byIcon(Icons.home_filled), findsOneWidget);

      await tester.tap(find.text('Custom Feed'));
      await tester.pumpAndSettle();
      expect(selectedFeed, equals(feeds[1]));

      await tester.tap(find.text('Build custom feed'));
      await tester.pumpAndSettle();
      expect(customBuilderCalled, isTrue);
    },
  );

  testWidgets(
    'shows moderation hub and appeals options when callbacks provided',
    (tester) async {
      var moderationCalled = false;
      var appealsCalled = false;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            feedListProvider.overrideWithValue(feeds),
            currentFeedProvider.overrideWithValue(feeds.first),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: FeedControlPanel(
                onSelect: (_) {},
                onCreateCustom: () {},
                onOpenModerationHub: () => moderationCalled = true,
                onOpenAppeals: () => appealsCalled = true,
              ),
            ),
          ),
        ),
      );

      expect(find.text('Moderation hub'), findsOneWidget);
      expect(find.text('Appeals queue'), findsOneWidget);

      await tester.tap(find.text('Moderation hub'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Appeals queue'));
      await tester.pumpAndSettle();

      expect(moderationCalled, isTrue);
      expect(appealsCalled, isTrue);
    },
  );

  testWidgets('renders subtitles for news and moderation feeds', (
    tester,
  ) async {
    const newsFeed = FeedModel(
      id: 'news',
      name: 'News Feed',
      type: FeedType.news,
      contentFilters: ContentFilters(allowedTypes: {ContentType.text}),
      sorting: SortingRule.hot,
      refinements: FeedRefinements(),
      subscriptionLevelRequired: 0,
    );
    const moderationFeed = FeedModel(
      id: 'mod',
      name: 'Moderation',
      type: FeedType.moderation,
      contentFilters: ContentFilters(allowedTypes: {ContentType.text}),
      sorting: SortingRule.hot,
      refinements: FeedRefinements(),
      subscriptionLevelRequired: 0,
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feedListProvider.overrideWithValue([newsFeed, moderationFeed]),
          currentFeedProvider.overrideWithValue(newsFeed),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: FeedControlPanel(onSelect: (_) {}, onCreateCustom: () {}),
          ),
        ),
      ),
    );

    expect(find.text('Hybrid news'), findsOneWidget);
    expect(find.text('Moderation only'), findsOneWidget);
  });

  testWidgets('hides feed switching list when onSelect is not provided', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feedListProvider.overrideWithValue(feeds),
          currentFeedProvider.overrideWithValue(feeds.first),
        ],
        child: const MaterialApp(home: Scaffold(body: FeedControlPanel())),
      ),
    );

    expect(find.text('Feed tools'), findsOneWidget);
    expect(find.text('Home Feed'), findsNothing);
    expect(find.text('Build custom feed'), findsNothing);
    expect(find.text('Moderation hub'), findsNothing);
    expect(find.text('Appeals queue'), findsNothing);
    expect(
      find.text(
        'Switch feeds from the Discover rail at the top of the home screen.',
      ),
      findsOneWidget,
    );
  });
}
