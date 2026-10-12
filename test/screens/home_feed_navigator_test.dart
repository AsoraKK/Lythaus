import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import '../helpers/content_recovery.dart';
import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_event_tracker.dart';
import 'package:lythaus/core/analytics/analytics_events.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/screens/home/home_feed_navigator.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  final List<Map<String, Object?>> feedLoadProperties = [];

  @override
  Future<bool> logEventOnce(
    AnalyticsClient client,
    String eventName, {
    String? userId,
    Map<String, Object?>? properties,
  }) async {
    onceEvents.add(eventName);
    if (eventName == AnalyticsEvents.feedFirstLoad) {
      feedLoadProperties.add(Map<String, Object?>.from(properties ?? const {}));
    }
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
        contentRecoveryStorageProvider.overrideWithValue(
          MemoryContentRecoveryStorage(),
        ),
        analyticsClientProvider.overrideWithValue(_RecordingAnalyticsClient()),
        analyticsEventTrackerProvider.overrideWithValue(
          _RecordingEventTracker(),
        ),
        feedEntitlementsProvider.overrideWith(
          (ref) async => const FeedEntitlements(
            tier: 'black',
            maxCustomFeeds: 3,
            newsBoardAccess: 'full',
          ),
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

    await tester.tap(find.byTooltip('Feed controls'));
    await tester.pumpAndSettle();
    expect(find.text('Choose a feed'), findsOneWidget);
    expect(find.text('Curated discover'), findsOneWidget);
    expect(find.text('Hybrid news'), findsOneWidget);
    expect(find.text('Custom filters'), findsOneWidget);
    expect(find.byTooltip('Close feed controls'), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(find.byTooltip('Close feed controls'), findsNothing);

    await tester.tap(find.byTooltip('Feed controls'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('News').last);
    await tester.pumpAndSettle();
    expect(
      find.text('Editorial coverage from earned, revocable contributors.'),
      findsOneWidget,
    );

    await tester.pumpWidget(buildNavigator(AlphaFeedSection.newsBoard));
    await tester.pumpAndSettle();

    expect(
      find.text('Editorial coverage from earned, revocable contributors.'),
      findsOneWidget,
    );

    await tester.pumpWidget(buildNavigator(AlphaFeedSection.myFeeds));
    await tester.pumpAndSettle();

    expect(find.text('Custom feed'), findsOneWidget);
    expect(find.byType(FeedCard), findsWidgets);
  });

  testWidgets('feed page state follows feed identity across section switches', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

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
    ];
    final container = ProviderContainer(
      overrides: [
        contentRecoveryStorageProvider.overrideWithValue(
          MemoryContentRecoveryStorage(),
        ),
        feedListProvider.overrideWith((ref) => feeds),
        feedEntitlementsProvider.overrideWith(
          (ref) async => const FeedEntitlements(
            tier: 'black',
            maxCustomFeeds: 3,
            newsBoardAccess: 'full',
          ),
        ),
        liveFeedStateProvider.overrideWith((ref, feed) {
          return _StaticLiveFeedNotifier(
            List.generate(18, (index) {
              return FeedItem(
                id: '${feed.id}-$index',
                feedId: feed.id,
                author: 'Kai Rivers',
                contentType: ContentType.text,
                title: '${feed.name} item $index',
                body: '${feed.id} body $index',
                publishedAt: DateTime(2024, 1, 1).add(Duration(days: index)),
              );
            }),
          );
        }),
        feedRestoreSnapshotsProvider.overrideWith(
          (ref) => {
            'discover': const FeedRestoreSnapshot(
              lastVisibleItemId: 'discover-3',
              offset: 180,
              showNewPostsPill: false,
            ),
            'news': const FeedRestoreSnapshot(
              lastVisibleItemId: 'news-3',
              offset: 460,
              showNewPostsPill: false,
            ),
          },
        ),
        analyticsClientProvider.overrideWithValue(_RecordingAnalyticsClient()),
        analyticsEventTrackerProvider.overrideWithValue(
          _RecordingEventTracker(),
        ),
      ],
    );
    addTearDown(container.dispose);

    Future<void> selectFeed(String name) async {
      await tester.tap(find.byTooltip('Feed controls'));
      await tester.pumpAndSettle();
      await tester.tap(find.text(name).last);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump();
    }

    double activeFeedOffset() {
      final scrollViews = tester
          .widgetList<CustomScrollView>(find.byType(CustomScrollView))
          .where((view) => view.controller?.hasClients ?? false)
          .toList();
      expect(scrollViews, hasLength(1));
      return scrollViews.single.controller!.offset;
    }

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(disableAnimations: true),
            child: child!,
          ),
          home: const HomeFeedNavigator(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(activeFeedOffset(), closeTo(180, 1));

    await selectFeed('News');
    expect(activeFeedOffset(), closeTo(460, 1));
    final tracker =
        container.read(analyticsEventTrackerProvider) as _RecordingEventTracker;
    expect(
      tracker.feedLoadProperties,
      anyElement(containsPair('feed_type', 'news')),
    );

    await selectFeed('Discover');
    expect(activeFeedOffset(), closeTo(180, 1));
  });

  testWidgets('feed control sheet stays content-sized and dismisses outside', (
    tester,
  ) async {
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
    ];
    final container = ProviderContainer(
      overrides: [
        contentRecoveryStorageProvider.overrideWithValue(
          MemoryContentRecoveryStorage(),
        ),
        feedListProvider.overrideWith((ref) => feeds),
        liveFeedStateProvider.overrideWith(
          (ref, feed) => _StaticLiveFeedNotifier(const []),
        ),
      ],
    );
    addTearDown(container.dispose);

    for (final size in [const Size(390, 844), const Size(1440, 900)]) {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: HomeFeedNavigator()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Feed controls'));
      await tester.pumpAndSettle();

      final sheetRect = tester.getRect(find.byType(BottomSheet));
      expect(sheetRect.height, lessThan(size.height * 0.85));
      expect(sheetRect.top, greaterThan(0));
      await tester.tapAt(Offset(size.width / 2, sheetRect.top - 8));
      await tester.pumpAndSettle();
      expect(find.text('Choose a feed'), findsNothing);
    }
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  });
}
