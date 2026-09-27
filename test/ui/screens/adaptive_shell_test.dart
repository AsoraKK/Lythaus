import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/adaptive_shell.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

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

const _feeds = [
  FeedModel(
    id: 'discover',
    name: 'Discover',
    type: FeedType.discover,
    contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
    sorting: SortingRule.hot,
    refinements: FeedRefinements(),
    subscriptionLevelRequired: 0,
    isHome: true,
  ),
];

final _items = [
  FeedItem(
    id: 'item-1',
    feedId: 'discover',
    author: 'Alex',
    contentType: ContentType.text,
    title: 'Hello',
    body: 'World',
    publishedAt: DateTime(2024, 1, 1),
  ),
];

List<Override> _baseOverrides({bool guest = false}) => [
  guestModeProvider.overrideWith((ref) => guest),
  feedListProvider.overrideWith((ref) => _feeds),
  liveFeedStateProvider.overrideWith(
    (ref, _) => _StaticLiveFeedNotifier(_items),
  ),
  liveFeedItemsProvider.overrideWith((ref, _) async => _items),
];

void main() {
  group('AdaptiveShell', () {
    testWidgets(
      'native back restores tab and query without losing route context',
      (tester) async {
        final router = GoRouter(
          initialLocation: '/?source=fixture',
          routes: [
            GoRoute(
              path: '/',
              builder: (_, state) => AdaptiveShell(
                initialIndex: switch (state.uri.queryParameters['tab']) {
                  'profile' => 2,
                  'rewards' => 3,
                  _ => 0,
                },
              ),
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              ..._baseOverrides(guest: true),
              currentUserProvider.overrideWithValue(null),
            ],
            child: MaterialApp.router(routerConfig: router),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Rewards'));
        await tester.pumpAndSettle();
        expect(router.routeInformationProvider.value.uri.queryParameters, {
          'source': 'fixture',
          'tab': 'rewards',
        });
        await tester.tap(find.text('Profile'));
        await tester.pumpAndSettle();
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(find.text('Sign in to view your rewards.'), findsOneWidget);
        expect(router.routeInformationProvider.value.uri.queryParameters, {
          'source': 'fixture',
          'tab': 'rewards',
        });
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(router.routeInformationProvider.value.uri.queryParameters, {
          'source': 'fixture',
          'tab': 'discover',
        });
      },
    );

    testWidgets('renders bottom nav on narrow viewport', (tester) async {
      await tester.binding.setSurfaceSize(const Size(375, 812));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        ProviderScope(
          overrides: _baseOverrides(),
          child: MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(disableAnimations: true),
              child: child!,
            ),
            home: const AdaptiveShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Bottom nav should be present on narrow viewport
      expect(find.byType(BottomNavigationBar), findsOneWidget);
      // Navigation rail should not be present
      expect(find.byType(NavigationRail), findsNothing);
    });

    testWidgets('renders navigation rail on wide viewport', (tester) async {
      await tester.binding.setSurfaceSize(const Size(1024, 768));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        ProviderScope(
          overrides: _baseOverrides(),
          child: MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(disableAnimations: true),
              child: child!,
            ),
            home: const AdaptiveShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Navigation rail should be present on wide viewport
      expect(find.byType(NavigationRail), findsOneWidget);
      // Bottom nav should not be present
      expect(find.byType(BottomNavigationBar), findsNothing);
    });

    testWidgets('guest tapping Create shows snackbar', (tester) async {
      await tester.binding.setSurfaceSize(const Size(1024, 768));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        ProviderScope(
          overrides: _baseOverrides(guest: true),
          child: MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(disableAnimations: true),
              child: child!,
            ),
            home: const AdaptiveShell(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tap the Create destination on the NavigationRail
      await tester.tap(find.text('Create'));
      await tester.pump();

      expect(find.text('Sign in to use this Alpha feature.'), findsOneWidget);
    });

    testWidgets('breakpoint constant is 768', (tester) async {
      expect(kDesktopBreakpoint, 768);
    });
  });
}
