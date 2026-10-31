/// Extended tests for HomeFeedNavigator — targeting uncovered widget code paths
library;

import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import '../helpers/content_recovery.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/ui/screens/home/home_feed_navigator.dart';
import 'package:lythaus/ui/components/lythaus_top_bar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockPostRepository extends Mock implements PostRepository {}

class _StaticLiveFeedNotifier extends LiveFeedController {
  _StaticLiveFeedNotifier(super.s);
  @override
  Future<void> loadMore() async {}
  @override
  Future<void> refresh() async {}
}

class MockAuthStateNotifier extends StateNotifier<AsyncValue<User?>>
    implements AuthStateNotifier {
  MockAuthStateNotifier(User? u) : super(AsyncValue.data(u));
  @override
  Future<void> refreshToken() async {}
  @override
  Future<void> signInWithEmail(String e, String p) async {}
  @override
  Future<void> signOut() async => state = const AsyncValue.data(null);
  @override
  Future<void> validateToken() async {}
  @override
  Future<void> continueAsGuest() async {}
  @override
  void setUser(User user) {
    state = AsyncValue.data(user);
  }
}

final _feeds = [
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
    id: 'mod',
    name: 'Moderation',
    type: FeedType.moderation,
    contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
    sorting: SortingRule.newest,
    refinements: FeedRefinements(),
    subscriptionLevelRequired: 0,
  ),
];

void main() {
  setUpAll(() {
    registerFallbackValue(const CreatePostRequest(text: 'fb'));
  });

  Widget buildWithState({
    required LiveFeedState Function(FeedModel) stateForFeed,
    User? user,
    List<FeedModel>? feeds,
  }) {
    final container = ProviderContainer(
      overrides: [
        contentRecoveryStorageProvider.overrideWithValue(
          MemoryContentRecoveryStorage(),
        ),
        feedListProvider.overrideWith((ref) => feeds ?? _feeds),
        liveFeedStateProvider.overrideWith(
          (ref, feed) => _StaticLiveFeedNotifier(stateForFeed(feed)),
        ),
        if (user != null) ...[
          authStateProvider.overrideWith((ref) => MockAuthStateNotifier(user)),
          jwtProvider.overrideWith((ref) async => 'test-token'),
        ],
      ],
    );

    return UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: true),
          child: child!,
        ),
        home: const HomeFeedNavigator(),
      ),
    );
  }

  group('_FeedPage states', () {
    testWidgets('single feed has no redundant selector callback', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildWithState(
          feeds: [_feeds.first, _feeds.last],
          stateForFeed: (_) => const LiveFeedState(),
        ),
      );
      await tester.pumpAndSettle();
      final bar = tester.widget<LythausTopBar>(find.byType(LythausTopBar));
      expect(bar.onLogoTap, isNull);
      expect(bar.onTitleTap, isNull);
    });

    testWidgets('multiple available feeds keep selector callbacks', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildWithState(stateForFeed: (_) => const LiveFeedState()),
      );
      await tester.pumpAndSettle();
      final bar = tester.widget<LythausTopBar>(find.byType(LythausTopBar));
      expect(bar.onLogoTap, isNotNull);
      expect(bar.onTitleTap, isNotNull);
    });

    testWidgets('empty Alpha sections render scoped recovery states', (
      tester,
    ) async {
      tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
      addTearDown(
        () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
      );

      Widget buildEmpty(AlphaFeedSection section) {
        return ProviderScope(
          overrides: [
            contentRecoveryStorageProvider.overrideWithValue(
              MemoryContentRecoveryStorage(),
            ),
            feedListProvider.overrideWith((ref) => const []),
            customFeedsProvider.overrideWith((ref) async => const []),
            feedEntitlementsProvider.overrideWith((ref) async => null),
          ],
          child: MaterialApp(
            key: ValueKey(section),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(disableAnimations: true),
              child: child!,
            ),
            home: HomeFeedNavigator(key: ValueKey(section), section: section),
          ),
        );
      }

      await tester.pumpWidget(buildEmpty(AlphaFeedSection.myFeeds));
      await tester.pumpAndSettle();
      expect(find.text('No custom feeds yet'), findsOneWidget);
      expect(find.text('Create custom feed'), findsOneWidget);

      await tester.tap(find.text('Create custom feed'));
      await tester.pumpAndSettle();
      expect(find.text('Sign in to create a custom feed.'), findsOneWidget);

      await tester.pumpWidget(buildEmpty(AlphaFeedSection.newsBoard));
      await tester.pumpAndSettle();
      expect(find.text('Couldn’t verify News Board access'), findsOneWidget);
      expect(find.text('News Board is Black-only'), findsNothing);
      expect(find.text('No custom feeds yet'), findsNothing);
    });

    testWidgets('shows loading indicator during initial load', (tester) async {
      tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
      addTearDown(
        () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
      );

      await tester.pumpWidget(
        buildWithState(
          stateForFeed: (feed) => const LiveFeedState(isInitialLoading: true),
        ),
      );
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('unverified session offers sign-in without cached cards', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildWithState(
          stateForFeed: (_) => const LiveFeedState(
            requiresSignIn: true,
            errorMessage: 'Sign in again to load posts.',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Sign in'), findsOneWidget);
      expect(
        find.text(
          'Your session could not be verified. Sign in again or continue as a guest.',
        ),
        findsOneWidget,
      );
      expect(find.text('Retry'), findsNothing);
      expect(find.text('No public posts yet'), findsNothing);
    });

    testWidgets(
      'refresh keeps cached cards hidden until the request resolves',
      (tester) async {
        final cachedPost = FeedItem(
          id: 'cached-public-post',
          feedId: 'discover',
          author: 'Synthetic member',
          contentType: ContentType.text,
          title: 'Update',
          body: 'Previously loaded post',
          publishedAt: DateTime.utc(2026, 10, 15),
        );
        await tester.pumpWidget(
          buildWithState(
            stateForFeed: (_) =>
                LiveFeedState(items: [cachedPost], isInitialLoading: true),
          ),
        );
        await tester.pump();
        expect(find.text('Loading posts'), findsOneWidget);
        expect(find.text(cachedPost.body), findsNothing);
        expect(find.text('No public posts yet'), findsNothing);
      },
    );

    testWidgets('shows error message with retry button on error', (
      tester,
    ) async {
      tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
      addTearDown(
        () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
      );

      await tester.pumpWidget(
        buildWithState(
          stateForFeed: (feed) => const LiveFeedState(
            errorMessage: 'Unable to load feed right now.',
            items: [],
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Couldn’t load posts'), findsOneWidget);
      expect(find.text('Unable to load feed right now.'), findsNothing);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('shows empty state for a healthy empty discover feed', (
      tester,
    ) async {
      tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
      addTearDown(
        () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
      );

      await tester.pumpWidget(
        buildWithState(stateForFeed: (feed) => const LiveFeedState(items: [])),
      );
      await tester.pumpAndSettle();

      expect(find.text('No public posts yet'), findsOneWidget);
      expect(find.text('Unable to load feed right now.'), findsNothing);
      expect(find.text('Retry'), findsNothing);
    });

    testWidgets('unconfigured Discover shows its own empty state', (
      tester,
    ) async {
      tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
      addTearDown(
        () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
      );

      final container = ProviderContainer(
        overrides: [
          contentRecoveryStorageProvider.overrideWithValue(
            MemoryContentRecoveryStorage(),
          ),
          feedListProvider.overrideWith(
            (ref) => [
              const FeedModel(
                id: 'mod',
                name: 'Moderation',
                type: FeedType.moderation,
                contentFilters: ContentFilters(
                  allowedTypes: {ContentType.mixed},
                ),
                sorting: SortingRule.newest,
                refinements: FeedRefinements(),
                subscriptionLevelRequired: 0,
                isHome: true,
              ),
            ],
          ),
          liveFeedStateProvider.overrideWith(
            (ref, feed) =>
                _StaticLiveFeedNotifier(const LiveFeedState(items: [])),
          ),
        ],
      );

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
      await tester.pump();

      expect(find.text('Discover unavailable'), findsOneWidget);
      expect(find.text('News Board is Black-only'), findsNothing);
    });

    testWidgets('shows and clears New posts pill on restore fallback', (
      tester,
    ) async {
      tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
      addTearDown(
        () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
      );

      final discoverFeed = _feeds.first;
      final container = ProviderContainer(
        overrides: [
          contentRecoveryStorageProvider.overrideWithValue(
            MemoryContentRecoveryStorage(),
          ),
          feedListProvider.overrideWith((ref) => [discoverFeed]),
          liveFeedStateProvider.overrideWith(
            (ref, feed) => _StaticLiveFeedNotifier(
              LiveFeedState(
                items: [
                  FeedItem(
                    id: 'discover-live-1',
                    feedId: feed.id,
                    author: 'Alex',
                    contentType: ContentType.text,
                    title: 'T',
                    body: 'B',
                    publishedAt: DateTime(2024),
                  ),
                ],
              ),
            ),
          ),
          feedRestoreSnapshotsProvider.overrideWith(
            (ref) => {
              discoverFeed.id: const FeedRestoreSnapshot(
                lastVisibleItemId: 'missing-item',
                offset: 180,
                showNewPostsPill: false,
              ),
            },
          ),
        ],
      );
      addTearDown(container.dispose);

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

      expect(find.text('New posts'), findsOneWidget);
      await tester.tap(find.text('New posts'));
      await tester.pumpAndSettle();

      final snapshot = container.read(
        feedRestoreSnapshotsProvider,
      )[discoverFeed.id];
      expect(snapshot?.showNewPostsPill, isFalse);
      expect(snapshot?.lastVisibleItemId, isNull);
    });
  });

  group('Feed switching via Discover rail', () {
    testWidgets('rail switches to a named custom feed', (tester) async {
      tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
      addTearDown(
        () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
      );

      final container = ProviderContainer(
        overrides: [
          contentRecoveryStorageProvider.overrideWithValue(
            MemoryContentRecoveryStorage(),
          ),
          feedListProvider.overrideWith(
            (ref) => [
              _feeds.first,
              const FeedModel(
                id: 'discover-local',
                name: 'Local',
                type: FeedType.custom,
                contentFilters: ContentFilters(
                  allowedTypes: {ContentType.mixed},
                ),
                sorting: SortingRule.newest,
                refinements: FeedRefinements(),
                subscriptionLevelRequired: 0,
              ),
            ],
          ),
          liveFeedStateProvider.overrideWith(
            (ref, feed) => _StaticLiveFeedNotifier(
              LiveFeedState(
                items: [
                  FeedItem(
                    id: '${feed.id}-1',
                    feedId: feed.id,
                    author: 'Alex',
                    contentType: ContentType.text,
                    title: 'T',
                    body: 'B',
                    publishedAt: DateTime(2024),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

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

      await tester.tap(find.text('Local'));
      await tester.pumpAndSettle();

      final selected = tester.widget<ChoiceChip>(
        find.widgetWithText(ChoiceChip, 'Local'),
      );
      expect(selected.selected, isTrue);
    });

    testWidgets('PageView enables swipe navigation', (tester) async {
      tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
      addTearDown(
        () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
      );

      await tester.pumpWidget(
        buildWithState(
          stateForFeed: (feed) => LiveFeedState(
            items: [
              FeedItem(
                id: '${feed.id}-1',
                feedId: feed.id,
                author: 'Alex',
                contentType: ContentType.text,
                title: 'T',
                body: 'B',
                publishedAt: DateTime(2024),
              ),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      final pageView = tester.widget<PageView>(find.byType(PageView));
      expect(pageView.physics, isNot(isA<NeverScrollableScrollPhysics>()));
    });

    testWidgets('feed control panel lists available feeds', (tester) async {
      tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
      addTearDown(
        () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
      );

      await tester.pumpWidget(
        buildWithState(
          stateForFeed: (feed) => LiveFeedState(
            items: [
              FeedItem(
                id: '${feed.id}-1',
                feedId: feed.id,
                author: 'Alex',
                contentType: ContentType.text,
                title: 'T',
                body: 'B',
                publishedAt: DateTime(2024),
              ),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byType(InkWell).first);
      await tester.pumpAndSettle();

      expect(find.text('Choose a feed'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(ListTile),
          matching: find.text('Discover'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(of: find.byType(ListTile), matching: find.text('News')),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byType(ListTile),
          matching: find.text('Moderation'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('top bar search button opens search screen', (tester) async {
      tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
      addTearDown(
        () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
      );

      await tester.pumpWidget(
        buildWithState(
          stateForFeed: (feed) => LiveFeedState(
            items: [
              FeedItem(
                id: '${feed.id}-1',
                feedId: feed.id,
                author: 'Alex',
                contentType: ContentType.text,
                title: 'T',
                body: 'B',
                publishedAt: DateTime(2024),
              ),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.search));
      await tester.pumpAndSettle();

      expect(find.text('Search'), findsOneWidget);
      expect(
        find.textContaining('Find posts by tag across your feeds.'),
        findsOneWidget,
      );
    });

    testWidgets('top bar trending button opens trending feed', (tester) async {
      tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
      addTearDown(
        () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
      );

      await tester.pumpWidget(
        buildWithState(
          stateForFeed: (feed) => LiveFeedState(
            items: [
              FeedItem(
                id: '${feed.id}-1',
                feedId: feed.id,
                author: 'Alex',
                contentType: ContentType.text,
                title: 'T',
                body: 'B',
                publishedAt: DateTime(2024),
              ),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.trending_up_outlined));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('Trending'), findsOneWidget);
    });

    testWidgets('feed tools offer creation without staff-only actions', (
      tester,
    ) async {
      tester.binding.platformDispatcher.textScaleFactorTestValue = 0.8;
      addTearDown(
        () => tester.binding.platformDispatcher.clearTextScaleFactorTestValue(),
      );

      await tester.pumpWidget(
        buildWithState(
          stateForFeed: (feed) => LiveFeedState(
            items: [
              FeedItem(
                id: '${feed.id}-1',
                feedId: feed.id,
                author: 'Alex',
                contentType: ContentType.text,
                title: 'T',
                body: 'B',
                publishedAt: DateTime(2024),
              ),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byType(InkWell).first);
      await tester.pumpAndSettle();
      expect(find.text('Choose a feed'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(ListTile),
          matching: find.text('Discover'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(of: find.byType(ListTile), matching: find.text('News')),
        findsOneWidget,
      );
      expect(find.text('Build custom feed'), findsOneWidget);
      expect(find.text('Moderation hub'), findsNothing);
      expect(find.text('Appeals queue'), findsNothing);
    });
  });
}
