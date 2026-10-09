import 'dart:ui' show Tristate;

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
}) async {
  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(
        path: '/user/:id',
        builder: (context, state) => Scaffold(body: _pages()),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(child: MaterialApp.router(routerConfig: router)),
  );
  await tester.pumpAndSettle();
  return router;
}

void main() {
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
    await tester.tap(find.widgetWithText(Tab, 'Posts'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(Tab, 'Overview'));
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('Overview row 15')), position);
  });

  testWidgets(
    'tab controls expose selected semantics and keyboard activation',
    (tester) async {
      final semantics = tester.ensureSemantics();
      await _open(tester);
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(find.text('Saved own posts').hitTestable(), findsOneWidget);
      expect(
        tester
            .getSemantics(find.widgetWithText(Tab, 'Posts'))
            .flagsCollection
            .isSelected,
        Tristate.isTrue,
      );
      semantics.dispose();
    },
  );

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
