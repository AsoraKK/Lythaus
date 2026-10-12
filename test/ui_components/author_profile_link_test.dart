import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/profile/application/profile_providers.dart';
import 'package:lythaus/features/profile/domain/public_user.dart';
import 'package:lythaus/ui/components/author_profile_link.dart';
import 'package:lythaus/ui/screens/profile/profile_screen.dart';

GoRouter _router({
  String initialLocation = '/search?q=%23civic',
  String firstAuthorId = 'current-user',
}) {
  return GoRouter(
    initialLocation: initialLocation,
    routes: [
      GoRoute(
        name: 'search',
        path: '/search',
        builder: (context, state) => Scaffold(
          body: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AuthorProfileLink(userId: firstAuthorId, label: 'Alice'),
                const AuthorProfileLink(userId: 'other-user', label: 'Bob'),
                Text('query:${state.uri.queryParameters['q']}'),
              ],
            ),
          ),
        ),
      ),
      GoRoute(
        name: 'profile',
        path: '/user/:userId',
        builder: (context, state) => Scaffold(
          appBar: AppBar(title: const Text('Profile')),
          body: Center(
            child: Text('profile:${state.pathParameters['userId']}'),
          ),
        ),
      ),
    ],
  );
}

void main() {
  testWidgets(
    'guest can open own and other author profiles and return to search',
    (tester) async {
      final router = _router();
      addTearDown(router.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();

      expect(find.text('query:#civic'), findsOneWidget);
      expect(find.byTooltip('View Alice profile'), findsOneWidget);
      await tester.tap(find.byTooltip('View Alice profile'));
      await tester.pumpAndSettle();
      expect(find.text('profile:current-user'), findsOneWidget);

      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('query:#civic'), findsOneWidget);
      await tester.tap(find.byTooltip('View Bob profile'));
      await tester.pumpAndSettle();
      expect(find.text('profile:other-user'), findsOneWidget);
    },
  );

  testWidgets(
    'repeated taps open one route and direct profile deep links resolve',
    (tester) async {
      final router = _router(firstAuthorId: 'deleted-user');
      addTearDown(router.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();

      final link = find.byType(AuthorProfileLink).first;
      final textButton = find.descendant(
        of: link,
        matching: find.byType(TextButton),
      );
      final openProfile = tester.widget<TextButton>(textButton).onPressed!;
      openProfile();
      openProfile();
      await tester.pump();
      final updatedButton = tester.widget<TextButton>(
        find.descendant(
          of: find.byType(AuthorProfileLink, skipOffstage: false).first,
          matching: find.byType(TextButton, skipOffstage: false),
        ),
      );
      expect(updatedButton.onPressed, isNull);
      await tester.pumpAndSettle();
      expect(find.text('profile:deleted-user'), findsOneWidget);

      final deepLink = _router(initialLocation: '/user/deleted-user');
      addTearDown(deepLink.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: deepLink));
      await tester.pumpAndSettle();
      expect(find.text('profile:deleted-user'), findsOneWidget);
    },
  );

  testWidgets('missing author identity stays plain text and is not clickable', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: AuthorProfileLink(userId: '  ', label: 'Former member'),
        ),
      ),
    );

    expect(find.text('Former member'), findsOneWidget);
    expect(find.byType(TextButton), findsNothing);
  });

  testWidgets('opens the public profile and returns without a GoRouter', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWith((ref) => null),
          jwtProvider.overrideWith((ref) async => null),
          publicUserProvider('other-user').overrideWith(
            (ref) async => const PublicUser(
              id: 'other-user',
              displayName: 'Bob',
              tier: 'bronze',
            ),
          ),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: AuthorProfileLink(userId: ' other-user ', label: 'Bob'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final link = find.byTooltip('View Bob profile');
    final openProfile = tester
        .widget<TextButton>(
          find.descendant(of: link, matching: find.byType(TextButton)),
        )
        .onPressed!;
    openProfile();
    openProfile();
    await tester.pumpAndSettle();

    expect(find.byType(ProfileScreen), findsOneWidget);
    expect(find.text('Bob'), findsAtLeastNWidgets(1));
    expect(tester.takeException(), isNull);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byTooltip('View Bob profile'), findsOneWidget);
    expect(find.byType(ProfileScreen), findsNothing);
  });
}
