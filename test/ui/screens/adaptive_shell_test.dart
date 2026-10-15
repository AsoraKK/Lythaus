import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/adaptive_shell.dart';
import 'package:lythaus/ui/components/lythaus_side_navigation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/ui/screens/profile/settings_screen.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/state/providers/settings_providers.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';

import '../../helpers/content_recovery.dart';

class _AuthService extends Mock implements AuthService {}

bool _navigationHasFocus() {
  final context = FocusManager.instance.primaryFocus?.context;
  if (context is! Element) return false;
  var found = false;
  context.visitAncestorElements((element) {
    found =
        element.widget is LythausSideNavigation ||
        element.widget is BottomNavigationBar;
    return !found;
  });
  return found;
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
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  group('AdaptiveShell', () {
    testWidgets('resizing and tab changes preserve the active composer', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final user = User(
        id: '018f0000-0000-7000-8000-000000000001',
        email: 'synthetic@example.invalid',
        role: UserRole.user,
        tier: UserTier.bronze,
        reputationScore: 0,
        createdAt: DateTime.utc(2026, 10, 15),
        lastLoginAt: DateTime.utc(2026, 10, 15),
      );
      final auth = _AuthService();
      when(() => auth.getCurrentUser()).thenAnswer((_) async => user);
      when(() => auth.getJwtToken()).thenAnswer((_) async => null);
      when(() => auth.logout()).thenAnswer((_) async {});
      when(() => auth.remoteLogoutConfirmed).thenReturn(true);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ..._baseOverrides(),
            enhancedAuthServiceProvider.overrideWithValue(auth),
            contentRecoveryStorageProvider.overrideWithValue(
              MemoryContentRecoveryStorage(),
            ),
          ],
          child: MaterialApp(
            theme: LythausTheme.light(),
            darkTheme: LythausTheme.dark(),
            home: const AdaptiveShell(initialIndex: 1),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final composer = tester.state(find.byType(CreatePostScreen));
      final field = find.byType(TextField);
      await tester.enterText(field, 'Synthetic unfinished draft');
      final controller = tester.widget<TextField>(field).controller!;
      controller.selection = const TextSelection(
        baseOffset: 2,
        extentOffset: 9,
      );
      for (final scenario in [
        for (final brightness in Brightness.values)
          for (final scale in [1.0, 2.0])
            for (final width in [320.0, 390.0, 1024.0, 1440.0])
              (brightness, scale, width),
      ]) {
        tester.platformDispatcher.platformBrightnessTestValue = scenario.$1;
        tester.platformDispatcher.textScaleFactorTestValue = scenario.$2;
        await tester.binding.setSurfaceSize(Size(scenario.$3, 844));
        await tester.pumpAndSettle();
        expect(tester.state(find.byType(CreatePostScreen)), same(composer));
        expect(tester.widget<TextField>(field).controller, same(controller));
        expect(controller.text, 'Synthetic unfinished draft');
        expect(tester.widget<TextField>(field).focusNode!.hasFocus, isTrue);
        expect(
          controller.selection,
          const TextSelection(baseOffset: 2, extentOffset: 9),
        );
        await tester.tap(find.text('Discover').last);
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<TextField>(find.byType(TextField, skipOffstage: false))
              .focusNode!
              .hasFocus,
          isFalse,
        );
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pump();
        await tester.tap(find.text('Create').last);
        await tester.pumpAndSettle();
        expect(tester.state(find.byType(CreatePostScreen)), same(composer));
        expect(controller.text, 'Synthetic unfinished draft');
        expect(
          controller.selection,
          const TextSelection(baseOffset: 2, extentOffset: 9),
        );
        expect(tester.widget<TextField>(field).focusNode!.hasFocus, isTrue);
        expect(tester.takeException(), isNull);
        for (var step = 0; step < 40 && !_navigationHasFocus(); step++) {
          await tester.sendKeyEvent(LogicalKeyboardKey.tab);
          await tester.pump();
        }
        expect(_navigationHasFocus(), isTrue);
        tester.widget<TextField>(field).focusNode!.requestFocus();
        await tester.pump();
      }
      final container = ProviderScope.containerOf(
        tester.element(find.byType(AdaptiveShell)),
      );
      expect(container.read(currentUserProvider), same(user));
      final navigation = tester.widget<BottomNavigationBar>(
        find.byType(BottomNavigationBar),
      );
      navigation.onTap!(0);
      navigation.onTap!(1);
      await container.read(authStateProvider.notifier).signOut();
      await tester.binding.setSurfaceSize(const Size(1440, 844));
      await tester.pumpAndSettle();
      expect(container.read(currentUserProvider), isNull);
      expect(find.byType(CreatePostScreen), findsNothing);
      expect(find.text('Sign in to create a post.'), findsOneWidget);
      expect(find.text('Synthetic unfinished draft'), findsNothing);
      verify(() => auth.logout()).called(1);
      expect(tester.takeException(), isNull);
    });

    for (final width in [1024.0, 1440.0]) {
      for (final signedIn in [false, true]) {
        testWidgets(
          'Settings keeps sign-out reachable at $width signedIn=$signedIn',
          (tester) async {
            await tester.binding.setSurfaceSize(Size(width, 900));
            addTearDown(() => tester.binding.setSurfaceSize(null));
            final user = signedIn
                ? User(
                    id: '018f0000-0000-7000-8000-000000000001',
                    email: 'synthetic@example.invalid',
                    role: UserRole.user,
                    tier: UserTier.bronze,
                    reputationScore: 0,
                    createdAt: DateTime.utc(2026, 10, 15),
                    lastLoginAt: DateTime.utc(2026, 10, 15),
                  )
                : null;
            final auth = _AuthService();
            when(() => auth.getCurrentUser()).thenAnswer((_) async => user);
            when(() => auth.getJwtToken()).thenAnswer((_) async => null);
            when(() => auth.logout()).thenAnswer((_) async {});
            when(() => auth.remoteLogoutConfirmed).thenReturn(true);
            await tester.pumpWidget(
              ProviderScope(
                overrides: [
                  ..._baseOverrides(guest: !signedIn),
                  enhancedAuthServiceProvider.overrideWithValue(auth),
                  ownerProfileProvider.overrideWith(
                    (ref) async =>
                        throw StateError('Synthetic profile unavailable'),
                  ),
                ],
                child: const MaterialApp(home: AdaptiveShell()),
              ),
            );
            await tester.pumpAndSettle();
            await tester.tap(find.widgetWithText(TextButton, 'Settings'));
            await tester.pumpAndSettle();
            await tester.tap(find.text('Account security'));
            await tester.pumpAndSettle();
            final action = find.widgetWithText(
              FilledButton,
              'Sign out of all sessions',
            );
            expect(action.hitTestable(), findsOneWidget);
            expect(
              tester.widget<FilledButton>(action).onPressed != null,
              signedIn,
            );
            if (signedIn) {
              await tester.tap(action);
              await tester.pumpAndSettle();
              verify(() => auth.logout()).called(1);
              expect(find.byType(AdaptiveShell), findsOneWidget);
              expect(find.byType(SettingsScreen), findsNothing);
              final container = ProviderScope.containerOf(
                tester.element(find.byType(AdaptiveShell)),
              );
              expect(container.read(currentUserProvider), isNull);
            } else {
              verifyNever(() => auth.logout());
            }
            expect(tester.takeException(), isNull);
          },
        );
      }
    }

    for (final leftHanded in [false, true]) {
      for (final scenario in [(390.0, 1.0), (1440.0, 2.0)]) {
        testWidgets(
          'mobile order respects leftHanded=$leftHanded at $scenario',
          (tester) async {
            await tester.binding.setSurfaceSize(Size(scenario.$1, 960));
            addTearDown(() => tester.binding.setSurfaceSize(null));
            await tester.pumpWidget(
              ProviderScope(
                overrides: [
                  ..._baseOverrides(guest: true),
                  currentUserProvider.overrideWithValue(null),
                  leftHandedModeProvider.overrideWithValue(leftHanded),
                ],
                child: MaterialApp(
                  builder: (context, child) => MediaQuery(
                    data: MediaQuery.of(
                      context,
                    ).copyWith(textScaler: TextScaler.linear(scenario.$2)),
                    child: child!,
                  ),
                  home: const AdaptiveShell(initialIndex: 3),
                ),
              ),
            );
            await tester.pumpAndSettle();
            expect(find.byType(LythausSideNavigation), findsNothing);
            final nav = tester.widget<BottomNavigationBar>(
              find.byType(BottomNavigationBar),
            );
            expect(
              nav.items.map((item) => item.label),
              leftHanded
                  ? ['Rewards', 'Profile', 'Create', 'Discover']
                  : ['Discover', 'Create', 'Profile', 'Rewards'],
            );
            expect(nav.currentIndex, leftHanded ? 0 : 3);
            await tester.tap(find.text('Create'));
            await tester.pumpAndSettle();
            expect(find.text('Sign in to create a post.'), findsOneWidget);
            expect(tester.takeException(), isNull);
          },
        );
      }
    }

    for (final outcome in ['opened', 'unavailable', 'exception']) {
      testWidgets('desktop Help handles $outcome without losing rewards', (
        tester,
      ) async {
        await tester.binding.setSurfaceSize(const Size(1440, 900));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        const channel = MethodChannel('plugins.flutter.io/url_launcher');
        final launches = <String>[];
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          channel,
          (call) async {
            if (call.method == 'launch' || call.method == 'launchUrl') {
              launches.add((call.arguments as Map)['url'] as String);
              if (outcome == 'exception') {
                throw PlatformException(code: 'unavailable');
              }
              return outcome == 'opened';
            }
            return false;
          },
        );
        addTearDown(
          () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
            channel,
            null,
          ),
        );
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              ..._baseOverrides(guest: true),
              currentUserProvider.overrideWithValue(null),
            ],
            child: const MaterialApp(home: AdaptiveShell(initialIndex: 3)),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Help'));
        await tester.pumpAndSettle();
        expect(launches, ['https://lythaus.co/help']);
        expect(find.text('Sign in to view your rewards.'), findsOneWidget);
        expect(
          find.text('Help is available at lythaus.co/help.'),
          outcome == 'opened' ? findsNothing : findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('desktop Settings returns to the selected rewards screen', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(1440, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ..._baseOverrides(guest: true),
            currentUserProvider.overrideWithValue(null),
          ],
          child: const MaterialApp(home: AdaptiveShell(initialIndex: 3)),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();
      expect(find.byType(SettingsScreen), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.byType(SettingsScreen), findsNothing);
      expect(find.text('Sign in to view your rewards.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

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
      expect(find.byType(LythausSideNavigation), findsNothing);
    });

    testWidgets('renders compact side navigation on wide viewport', (
      tester,
    ) async {
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
            home: const AdaptiveShell(brand: Text('Fixture identity')),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(LythausSideNavigation), findsOneWidget);
      expect(find.text('Fixture identity'), findsOneWidget);
      expect(
        tester
            .widget<LythausSideNavigation>(find.byType(LythausSideNavigation))
            .extended,
        isFalse,
      );
      // Bottom nav should not be present
      expect(find.byType(BottomNavigationBar), findsNothing);
    });

    testWidgets('guest tapping Create offers account entry', (tester) async {
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

      // The desktop action keeps the existing account-entry gate.
      await tester.tap(find.text('Create'));
      await tester.pump();

      expect(find.text('Sign in to create a post.'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
    });

    testWidgets('breakpoint constant is 768', (tester) async {
      expect(kDesktopBreakpoint, 768);
    });
  });
}
