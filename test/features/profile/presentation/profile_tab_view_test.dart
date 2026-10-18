import 'dart:ui' show SemanticsRole, TextDirection, Tristate;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/features/profile/presentation/profile_tab_view.dart';
import 'package:lythaus/state/providers/settings_providers.dart';

Widget _pages() => ProfileTabView(
  overview: ListView(
    key: const PageStorageKey('overview'),
    children: [
      for (var i = 0; i < 30; i++)
        SizedBox(height: 70, child: Text('Overview row $i')),
    ],
  ),
  posts: ListView(
    key: const PageStorageKey('posts'),
    children: const [Text('Saved own posts')],
  ),
  comments: ListView(children: const [Text('Comments unavailable')]),
);

Future<GoRouter> _open(
  WidgetTester tester, {
  String location = '/user/a?tab=profile',
  TextDirection textDirection = TextDirection.ltr,
  bool includeOutsideControl = false,
  FocusNode? outsideFocusNode,
  ValueChanged<KeyEvent>? onUnhandledKey,
}) async {
  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(
        path: '/user/:id',
        builder: (context, state) => Directionality(
          textDirection: textDirection,
          child: Scaffold(
            body: includeOutsideControl
                ? Column(
                    children: [
                      Focus(
                        focusNode: outsideFocusNode,
                        child: TextButton(
                          onPressed: () {},
                          child: const Text('Outside tabs'),
                        ),
                      ),
                      Expanded(child: _pages()),
                    ],
                  )
                : _pages(),
          ),
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  Widget app = ProviderScope(child: MaterialApp.router(routerConfig: router));
  if (onUnhandledKey != null) {
    app = Focus(
      onKeyEvent: (node, event) {
        onUnhandledKey(event);
        return KeyEventResult.ignored;
      },
      child: app,
    );
  }
  await tester.pumpWidget(app);
  await tester.pumpAndSettle();
  return router;
}

void main() {
  testWidgets('tabs remain reachable at narrow widths and large text', (
    tester,
  ) async {
    addTearDown(() => tester.binding.setSurfaceSize(null));
    for (final width in [320.0, 390.0, 1024.0]) {
      for (final scale in [1.0, 2.0]) {
        await tester.binding.setSurfaceSize(Size(width, 640));
        await tester.pumpWidget(
          ProviderScope(
            child: MaterialApp(
              home: MediaQuery(
                data: MediaQueryData(textScaler: TextScaler.linear(scale)),
                child: Scaffold(body: _pages()),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final comments = find.widgetWithText(Tab, 'Comments');
        await tester.ensureVisible(comments);
        await tester.tap(comments);
        await tester.pumpAndSettle();
        expect(find.text('Comments unavailable').hitTestable(), findsOneWidget);
        final posts = find.widgetWithText(Tab, 'Posts');
        await tester.ensureVisible(posts);
        await tester.tap(posts);
        await tester.pumpAndSettle();
        expect(find.text('Saved own posts').hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      }
    }
  });

  testWidgets(
    'tabs restore URL selection and preserve other query parameters',
    (tester) async {
      final router = await _open(
        tester,
        location: '/user/a?tab=profile&profileTab=posts',
      );
      expect(find.text('Saved own posts').hitTestable(), findsOneWidget);
      await tester.tap(find.widgetWithText(Tab, 'Comments'));
      await tester.pumpAndSettle();
      expect(router.routeInformationProvider.value.uri.queryParameters, {
        'tab': 'profile',
        'profileTab': 'comments',
      });
      expect(find.text('Comments unavailable').hitTestable(), findsOneWidget);
      router.go('/user/a?tab=profile&profileTab=posts');
      await tester.pumpAndSettle();
      expect(find.text('Saved own posts').hitTestable(), findsOneWidget);
    },
  );

  testWidgets(
    'swipe updates selection and can be disabled without hiding tabs',
    (tester) async {
      final router = await _open(tester);
      await tester.drag(find.byType(TabBarView), const Offset(-600, 0));
      await tester.pumpAndSettle();
      expect(
        router.routeInformationProvider.value.uri.queryParameters['profileTab'],
        'posts',
      );
      final container = ProviderScope.containerOf(
        tester.element(find.byType(ProfileTabView)),
      );
      container.read(settingsProvider.notifier).toggleSwipeEnabled();
      await tester.pump();
      await tester.drag(find.byType(TabBarView), const Offset(-600, 0));
      await tester.pumpAndSettle();
      expect(find.text('Saved own posts').hitTestable(), findsOneWidget);
      await tester.tap(find.widgetWithText(Tab, 'Comments'));
      await tester.pumpAndSettle();
      expect(find.text('Comments unavailable').hitTestable(), findsOneWidget);
    },
  );

  testWidgets('overview scroll position survives a tab round trip', (
    tester,
  ) async {
    await _open(tester);
    await tester.drag(find.text('Overview row 1'), const Offset(0, -800));
    await tester.pumpAndSettle();
    final position = tester.getTopLeft(find.text('Overview row 15'));
    final overview = find.widgetWithText(Tab, 'Overview');
    Focus.of(tester.element(overview)).requestFocus();
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pumpAndSettle();
    expect(find.text('Saved own posts').hitTestable(), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowLeft);
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('Overview row 15')), position);
    await tester.tap(find.widgetWithText(Tab, 'Posts'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(Tab, 'Overview'));
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('Overview row 15')), position);
  });

  testWidgets('tab list and panels expose accessible roles and names', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      await _open(tester);
      final tabList = tester
          .getSemantics(find.byType(TabBar))
          .getSemanticsData();
      expect(tabList.label, 'Profile sections');

      final overview = tester
          .getSemantics(find.widgetWithText(Tab, 'Overview'))
          .getSemanticsData();
      expect(overview.identifier, 'profile-overview-tab');
      expect(overview.role, SemanticsRole.tab);

      final panel = tester
          .getSemantics(find.bySemanticsIdentifier('profile-overview-panel'))
          .getSemanticsData();
      expect(panel.role, SemanticsRole.tabPanel);
      expect(panel.label, 'Overview');
      expect(tester.takeException(), isNull);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets(
    'tab arrows move focus and selection in both directions and wrap',
    (tester) async {
      final semantics = tester.ensureSemantics();
      try {
        final router = await _open(tester);
        final overview = find.widgetWithText(Tab, 'Overview');
        Focus.of(tester.element(overview)).requestFocus();
        await tester.pump();

        Future<void> expectNavigation(
          LogicalKeyboardKey key,
          String label,
          String content,
        ) async {
          await tester.sendKeyEvent(key);
          await tester.pumpAndSettle();
          final tab = find.widgetWithText(Tab, label);
          final tabSemantics = tester.getSemantics(tab);
          expect(tabSemantics.flagsCollection.isFocused, Tristate.isTrue);
          expect(tabSemantics.flagsCollection.isSelected, Tristate.isTrue);
          expect(find.text(content).hitTestable(), findsOneWidget);
          expect(
            router
                .routeInformationProvider
                .value
                .uri
                .queryParameters['profileTab'],
            label.toLowerCase(),
          );
        }

        await expectNavigation(
          LogicalKeyboardKey.arrowRight,
          'Posts',
          'Saved own posts',
        );
        await expectNavigation(
          LogicalKeyboardKey.arrowRight,
          'Comments',
          'Comments unavailable',
        );
        await expectNavigation(
          LogicalKeyboardKey.arrowRight,
          'Overview',
          'Overview row 1',
        );
        await expectNavigation(
          LogicalKeyboardKey.arrowLeft,
          'Comments',
          'Comments unavailable',
        );
        await expectNavigation(
          LogicalKeyboardKey.arrowLeft,
          'Posts',
          'Saved own posts',
        );
        await expectNavigation(
          LogicalKeyboardKey.home,
          'Overview',
          'Overview row 1',
        );
        await expectNavigation(
          LogicalKeyboardKey.end,
          'Comments',
          'Comments unavailable',
        );
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    },
  );

  testWidgets(
    'modified keys do not navigate tabs and Alt arrows pass through',
    (tester) async {
      final semantics = tester.ensureSemantics();
      final unhandledNavigationKeys =
          <(LogicalKeyboardKey, bool, bool, bool, bool)>[];
      try {
        final router = await _open(
          tester,
          onUnhandledKey: (event) {
            if ((event is KeyDownEvent || event is KeyRepeatEvent) &&
                (event.logicalKey == LogicalKeyboardKey.arrowLeft ||
                    event.logicalKey == LogicalKeyboardKey.arrowRight ||
                    event.logicalKey == LogicalKeyboardKey.home ||
                    event.logicalKey == LogicalKeyboardKey.end)) {
              final keyboard = HardwareKeyboard.instance;
              unhandledNavigationKeys.add((
                event.logicalKey,
                keyboard.isAltPressed,
                keyboard.isControlPressed,
                keyboard.isMetaPressed,
                keyboard.isShiftPressed,
              ));
            }
          },
        );
        final overview = find.widgetWithText(Tab, 'Overview');
        Focus.of(tester.element(overview)).requestFocus();
        await tester.pump();

        Future<void> expectPassThrough(
          LogicalKeyboardKey modifier,
          LogicalKeyboardKey key, {
          bool shouldBubble = false,
          required bool alt,
          required bool control,
          required bool meta,
          required bool shift,
        }) async {
          final oldEventCount = unhandledNavigationKeys.length;
          await tester.sendKeyDownEvent(modifier);
          await tester.sendKeyEvent(key);
          await tester.sendKeyUpEvent(modifier);
          await tester.pumpAndSettle();

          if (shouldBubble) {
            expect(unhandledNavigationKeys, hasLength(oldEventCount + 1));
            final observed = unhandledNavigationKeys.last;
            expect(observed.$1, key);
            expect(observed.$2, alt);
            expect(observed.$3, control);
            expect(observed.$4, meta);
            expect(observed.$5, shift);
          }
          final overviewSemantics = tester.getSemantics(overview);
          expect(overviewSemantics.flagsCollection.isFocused, Tristate.isTrue);
          expect(overviewSemantics.flagsCollection.isSelected, Tristate.isTrue);
          expect(
            router
                .routeInformationProvider
                .value
                .uri
                .queryParameters['profileTab'],
            isNull,
          );
        }

        await expectPassThrough(
          LogicalKeyboardKey.altLeft,
          LogicalKeyboardKey.arrowLeft,
          shouldBubble: true,
          alt: true,
          control: false,
          meta: false,
          shift: false,
        );
        await expectPassThrough(
          LogicalKeyboardKey.altLeft,
          LogicalKeyboardKey.arrowRight,
          shouldBubble: true,
          alt: true,
          control: false,
          meta: false,
          shift: false,
        );
        await expectPassThrough(
          LogicalKeyboardKey.controlLeft,
          LogicalKeyboardKey.arrowLeft,
          alt: false,
          control: true,
          meta: false,
          shift: false,
        );
        await expectPassThrough(
          LogicalKeyboardKey.controlLeft,
          LogicalKeyboardKey.arrowRight,
          alt: false,
          control: true,
          meta: false,
          shift: false,
        );
        await expectPassThrough(
          LogicalKeyboardKey.shiftLeft,
          LogicalKeyboardKey.home,
          alt: false,
          control: false,
          meta: false,
          shift: true,
        );
        await expectPassThrough(
          LogicalKeyboardKey.metaLeft,
          LogicalKeyboardKey.end,
          alt: false,
          control: false,
          meta: true,
          shift: false,
        );
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    },
  );

  testWidgets('tab arrows follow RTL direction', (tester) async {
    final semantics = tester.ensureSemantics();
    try {
      final router = await _open(tester, textDirection: TextDirection.rtl);
      final posts = find.widgetWithText(Tab, 'Posts');
      Focus.of(tester.element(posts)).requestFocus();
      await tester.pump();

      await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
      await tester.pumpAndSettle();
      final overview = find.widgetWithText(Tab, 'Overview');
      expect(
        tester.getSemantics(overview).flagsCollection.isFocused,
        Tristate.isTrue,
      );
      expect(
        tester.getSemantics(overview).flagsCollection.isSelected,
        Tristate.isTrue,
      );
      expect(find.text('Overview row 1').hitTestable(), findsOneWidget);
      expect(
        router.routeInformationProvider.value.uri.queryParameters['profileTab'],
        isNull,
      );

      await tester.sendKeyEvent(LogicalKeyboardKey.arrowLeft);
      await tester.pumpAndSettle();
      expect(
        tester.getSemantics(posts).flagsCollection.isFocused,
        Tristate.isTrue,
      );
      expect(
        tester.getSemantics(posts).flagsCollection.isSelected,
        Tristate.isTrue,
      );
      expect(find.text('Saved own posts').hitTestable(), findsOneWidget);
      expect(
        router.routeInformationProvider.value.uri.queryParameters['profileTab'],
        'posts',
      );
      expect(tester.takeException(), isNull);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('navigation keys outside the tab list do not select a tab', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      final outsideFocusNode = FocusNode();
      addTearDown(outsideFocusNode.dispose);
      final router = await _open(
        tester,
        includeOutsideControl: true,
        outsideFocusNode: outsideFocusNode,
      );
      expect(find.text('Outside tabs'), findsOneWidget);

      for (final key in [
        LogicalKeyboardKey.arrowRight,
        LogicalKeyboardKey.arrowLeft,
        LogicalKeyboardKey.home,
        LogicalKeyboardKey.end,
      ]) {
        outsideFocusNode.requestFocus();
        await tester.pump();
        expect(outsideFocusNode.hasFocus, isTrue);
        await tester.sendKeyEvent(key);
        await tester.pumpAndSettle();
        expect(
          tester
              .getSemantics(find.widgetWithText(Tab, 'Overview'))
              .flagsCollection
              .isSelected,
          Tristate.isTrue,
        );
        expect(
          router
              .routeInformationProvider
              .value
              .uri
              .queryParameters['profileTab'],
          isNull,
        );
      }

      expect(
        tester
            .getSemantics(find.widgetWithText(Tab, 'Overview'))
            .flagsCollection
            .isSelected,
        Tristate.isTrue,
      );
      expect(
        router.routeInformationProvider.value.uri.queryParameters['profileTab'],
        isNull,
      );
      expect(find.text('Overview row 1').hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('narrow large text and reduced motion keep tabs reachable', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: const TextScaler.linear(2),
              disableAnimations: true,
            ),
            child: child!,
          ),
          home: Scaffold(body: _pages()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(find.text('Saved own posts').hitTestable(), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(find.text('Comments unavailable').hitTestable(), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(find.text('Overview row 1').hitTestable(), findsOneWidget);
    await tester.ensureVisible(find.widgetWithText(Tab, 'Comments'));
    await tester.tap(find.widgetWithText(Tab, 'Comments'));
    await tester.pumpAndSettle();
    expect(find.text('Comments unavailable').hitTestable(), findsOneWidget);
    await tester.tap(find.widgetWithText(Tab, 'Comments'));
    await tester.pumpAndSettle();
    expect(find.text('Comments unavailable').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
