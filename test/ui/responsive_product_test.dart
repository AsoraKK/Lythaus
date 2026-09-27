import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/routing/deeplink_router.dart';
import 'package:lythaus/design_system/index.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/screens/home/feed_search_screen.dart';
import 'package:lythaus/ui/screens/profile/settings_screen.dart';
import 'package:lythaus/ui/screens/rewards/rewards_dashboard.dart';

void main() {
  test('notification links require an existing supported target', () {
    for (final link in [
      'lythaus://post/p1',
      'https://app.lythaus.co/user/u1',
      '/settings/notifications',
      'lythaus://comment/c1?postId=p1',
      '/moderation/appeal',
      '/invite/code',
    ]) {
      expect(DeeplinkRouter.canNavigate(link), isTrue, reason: link);
    }
    for (final link in [
      'https://example.com/post/p1',
      'javascript:alert(1)',
      '//example.com/post/p1',
      '/post',
      'lythaus://comment/c1',
      '/settings/unknown',
      '/unknown',
    ]) {
      expect(DeeplinkRouter.canNavigate(link), isFalse, reason: link);
    }
  });

  for (final dark in [false, true]) {
    for (final screen in ['post', 'settings', 'rewards-error']) {
      testWidgets('$screen supports 320px and 200% in $dark theme', (
        tester,
      ) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(320, 900);
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final post = FeedItem(
          id: 'fixture',
          feedId: 'discover',
          author: 'A contributor with a deliberately long display name',
          sourceName: 'An independent source with a long title',
          sourceUrl: 'https://example.com/source',
          contentType: ContentType.image,
          title: 'Readable content with a long title at enlarged text sizes',
          body: 'A development fixture, with no personal data.',
          imageUrl: 'https://example.invalid/unavailable.png',
          tags: const ['accessibility'],
          publishedAt: DateTime.utc(2026, 9, 26),
          authorshipLabel: 'Under review',
        );
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              currentUserProvider.overrideWithValue(null),
              rewardsSnapshotProvider.overrideWith(
                (ref) => Future<RewardsSnapshot>.error(
                  StateError('private fixture error'),
                ),
              ),
            ],
            child: MaterialApp(
              theme: dark ? LythausTheme.dark() : LythausTheme.light(),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: const TextScaler.linear(2),
                  disableAnimations: true,
                ),
                child: child!,
              ),
              home: switch (screen) {
                'post' => Scaffold(
                  body: SingleChildScrollView(child: FeedCard(item: post)),
                ),
                'settings' => const SettingsScreen(),
                _ => const RewardsDashboardScreen(),
              },
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        if (screen == 'post') {
          expect(find.text('Media unavailable'), findsOneWidget);
          expect(find.text('Authorship: Under review'), findsOneWidget);
        }
        if (screen == 'rewards-error') {
          expect(find.text('Retry'), findsOneWidget);
          expect(find.textContaining('private fixture'), findsNothing);
          expect(find.textContaining('Reputation level: 0'), findsNothing);
        }
      });
    }
  }

  testWidgets('search distinguishes an empty response from a failed request', (
    tester,
  ) async {
    var requests = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feedSearchProvider.overrideWith((ref, query) async {
            requests++;
            if (query == 'offline') {
              throw StateError('sensitive infrastructure');
            }
            return FeedResponse.fromCursor(
              posts: const [],
              nextCursor: null,
              limit: 25,
            );
          }),
        ],
        child: MaterialApp(
          theme: LythausTheme.light(),
          home: const FeedSearchScreen(),
        ),
      ),
    );
    await tester.enterText(find.byType(TextField), 'science');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.text('No results for “science”'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'offline');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.text('Search is unavailable right now.'), findsOneWidget);
    expect(find.textContaining('sensitive'), findsNothing);
    await tester.tap(find.text('Retry search'));
    await tester.pumpAndSettle();
    expect(requests, 3);
    expect(find.text('offline'), findsOneWidget);
  });
}
