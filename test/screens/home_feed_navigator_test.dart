import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_event_tracker.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/screens/home/home_feed_navigator.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _RecordingAnalyticsClient implements AnalyticsClient {
  final List<String> events = [];

  @override
  Future<void> logEvent(String name, {Map<String, Object?>? properties}) async {
    events.add(name);
  }

  @override
  Future<void> reset() async {}

  @override
  Future<void> setUserId(String? userId) async {}

  @override
  Future<void> setUserProperties(Map<String, Object?> properties) async {}
}

class _RecordingEventTracker implements AnalyticsEventTracker {
  final List<String> onceEvents = [];

  @override
  Future<bool> logEventOnce(
    AnalyticsClient client,
    String eventName, {
    String? userId,
    Map<String, Object?>? properties,
  }) async {
    onceEvents.add(eventName);
    await client.logEvent(eventName, properties: properties);
    return true;
  }

  @override
  Future<bool> wasLogged(String eventName, {String? userId}) async => false;
}

class _StaticLiveFeedNotifier extends LiveFeedController {
  _StaticLiveFeedNotifier(List<FeedItem> items)
    : super(
        LiveFeedState(
          items: items,
          isInitialLoading: false,
          isLoadingMore: false,
        ),
      );

  @override
  Future<void> loadMore() async {}

  @override
  Future<void> refresh() async {}
}

void main() {
  testWidgets('home feed navigator switches feeds and renders views', (
    tester,
  ) async {
    tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
    addTearDown(
      () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
    );

    final feeds = [
      const FeedModel(
        id: 'discover',
        name: 'Discover',
        type: FeedType.discover,
        contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
        sorting: SortingRule.hot,
        refinements: FeedRefinements(),
        subscriptionLevelRequired: 0,
        isHome: true,
      ),
      const FeedModel(
        id: 'news',
        name: 'News',
        type: FeedType.news,
        contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
        sorting: SortingRule.newest,
        refinements: FeedRefinements(),
        subscriptionLevelRequired: 0,
      ),
      const FeedModel(
        id: 'custom',
        name: 'Custom',
        type: FeedType.custom,
        contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
        sorting: SortingRule.relevant,
        refinements: FeedRefinements(includeKeywords: ['health']),
        subscriptionLevelRequired: 0,
        isCustom: true,
      ),
    ];

    final container = ProviderContainer(
      overrides: [
        analyticsClientProvider.overrideWithValue(_RecordingAnalyticsClient()),
        analyticsEventTrackerProvider.overrideWithValue(
          _RecordingEventTracker(),
        ),
        feedListProvider.overrideWith((ref) => feeds),
        liveFeedStateProvider.overrideWith(
          (ref, feed) => _StaticLiveFeedNotifier([
            FeedItem(
              id: '${feed.id}-1',
              feedId: feed.id,
              author: 'Alex',
              contentType: ContentType.text,
              title: 'Title',
              body: 'Body',
              publishedAt: DateTime(2024, 1, 1),
            ),
          ]),
        ),
      ],
    );
    addTearDown(container.dispose);

    Widget buildNavigator(AlphaFeedSection section) {
      return UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(disableAnimations: true),
            child: child!,
          ),
          home: HomeFeedNavigator(key: ValueKey(section), section: section),
        ),
      );
    }

    await tester.pumpWidget(buildNavigator(AlphaFeedSection.discover));
    await tester.pumpAndSettle();

    final tracker =
        container.read(analyticsEventTrackerProvider) as _RecordingEventTracker;
    expect(tracker.onceEvents, contains(AnalyticsEvents.feedFirstLoad));

    expect(
      find.text('Discover calm, trustworthy updates tailored to you.'),
      findsOneWidget,
    );
    expect(find.byType(FeedCard), findsWidgets);

    await tester.pumpWidget(buildNavigator(AlphaFeedSection.newsBoard));
    await tester.pumpAndSettle();

    expect(
      find.text('Hybrid newsroom + high reputation contributors.'),
      findsOneWidget,
    );

    await tester.pumpWidget(buildNavigator(AlphaFeedSection.myFeeds));
    await tester.pumpAndSettle();

    expect(find.text('Custom feed'), findsOneWidget);
    expect(find.byType(FeedCard), findsWidgets);
  });
}
