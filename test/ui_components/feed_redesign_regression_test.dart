import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/design_system/theme/lyth_theme.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/content_recovery_storage.dart';
import 'package:lythaus/features/feed/application/feed_actions_service.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/components/interactive_feed_card.dart';
import 'package:lythaus/ui/screens/home/home_feed_navigator.dart';
import '../helpers/content_recovery.dart';
import '../helpers/feed_session.dart';

class _NoNetworkDio extends Mock implements Dio {}

const custom = FeedModel(
  id: 'custom-a',
  name: 'Private topics',
  type: FeedType.custom,
  contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
  sorting: SortingRule.newest,
  refinements: FeedRefinements(),
  subscriptionLevelRequired: 0,
);

class EmptyFeed extends LiveFeedController {
  EmptyFeed() : super(const LiveFeedState());
  @override
  Future<void> refresh() async {}
  @override
  Future<void> loadMore() async {}
}

void main() {
  test(
    'confirmed and uncertain action state is retained per session only',
    () async {
      final auth = FeedTestAuth(feedTestUser('a'));
      final container = ProviderContainer(
        overrides: [
          authStateProvider.overrideWith((ref) => auth),
          jwtProvider.overrideWith((ref) async => 'token'),
        ],
      );
      addTearDown(container.dispose);
      container.read(confirmedUsefulProvider.notifier).state = {'post': true};
      container.read(pendingFeedActionsProvider.notifier).state = {
        'post': 'bookmark',
      };
      await Future<void>.delayed(Duration.zero);
      expect(container.read(confirmedUsefulProvider)['post'], isTrue);
      expect(container.read(pendingFeedActionsProvider)['post'], 'bookmark');
      auth.change(AsyncData(feedTestUser('b')));
      expect(container.read(confirmedUsefulProvider), isEmpty);
      expect(container.read(pendingFeedActionsProvider), isEmpty);
    },
  );
  testWidgets('custom deep link survives asynchronous feed discovery', (
    tester,
  ) async {
    final loaded = Completer<List<FeedModel>>();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authStateProvider.overrideWith(
            (ref) => FeedTestAuth(feedTestUser('a')),
          ),
          jwtProvider.overrideWith((ref) async => 'token'),
          contentRecoveryStorageProvider.overrideWithValue(
            MemoryContentRecoveryStorage(),
          ),
          feedEntitlementsProvider.overrideWith(
            (ref) async => const FeedEntitlements(
              tier: 'free',
              maxCustomFeeds: 1,
              newsBoardAccess: 'none',
            ),
          ),
          customFeedsProvider.overrideWith((ref) => loaded.future),
          liveFeedStateProvider.overrideWith((ref, feed) => EmptyFeed()),
        ],
        child: MaterialApp(
          theme: LythausTheme.light(),
          home: const HomeFeedNavigator(initialFeedId: 'custom-a'),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Loading your feed'), findsOneWidget);
    loaded.complete([custom]);
    await tester.pumpAndSettle();
    final selectedFeed = find.widgetWithText(TextButton, 'Private topics');
    expect(selectedFeed, findsOneWidget);
    final selectedState = find.ancestor(
      of: selectedFeed,
      matching: find.byWidgetPredicate(
        (widget) => widget is Semantics && widget.properties.selected == true,
      ),
    );
    expect(selectedState, findsOneWidget);
    expect(
      tester
          .getSemantics(selectedState)
          .getSemanticsData()
          .flagsCollection
          .isSelected
          .toBoolOrNull(),
      isTrue,
    );
    expect(find.text('Loading your feed'), findsNothing);
  });
  testWidgets('unbacked News publication exposes no post mutation controls', (
    tester,
  ) async {
    var opened = false;
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            body: InteractiveFeedCard(
              onTap: () => opened = true,
              item: FeedItem(
                id: 'publication',
                feedId: 'news',
                author: 'Editorial',
                contentType: ContentType.text,
                title: 'Bulletin',
                body: '',
                publishedAt: DateTime.utc(2026),
                isPublication: true,
              ),
            ),
          ),
        ),
      ),
    );
    expect(find.byTooltip('Save post'), findsNothing);
    expect(find.byTooltip('Comments'), findsNothing);
    expect(find.text('Read article'), findsNothing);
    expect(find.text('View post'), findsNothing);
    await tester.tap(find.text('Bulletin'));
    expect(opened, isFalse);
    expect(
      find.text('Post interactions are unavailable for this publication.'),
      findsOneWidget,
    );
  });
  testWidgets('backed publication labels its existing post action clearly', (
    tester,
  ) async {
    var opened = false;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [feedBookmarksProvider.overrideWith((ref) async => {})],
        child: MaterialApp(
          home: Scaffold(
            body: InteractiveFeedCard(
              onTap: () => opened = true,
              item: FeedItem(
                id: 'publication',
                backingPostId: 'post',
                isPublication: true,
                feedId: 'news',
                author: 'Editorial',
                contentType: ContentType.text,
                title: 'Bulletin',
                body: 'An introduction.',
                publishedAt: DateTime.utc(2026),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Read article'), findsNothing);
    await tester.tap(find.text('View post'));
    expect(opened, isTrue);
  });
  testWidgets(
    'feedback controls explain unavailable channels without writing',
    (tester) async {
      final dio = _NoNetworkDio();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authStateProvider.overrideWith(
              (ref) => FeedTestAuth(feedTestUser('a')),
            ),
            jwtProvider.overrideWith((ref) async => 'token'),
            secureDioProvider.overrideWithValue(dio),
            feedBookmarksProvider.overrideWith((ref) async => {}),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: InteractiveFeedCard(
                item: FeedItem(
                  id: 'post',
                  feedId: 'discover',
                  author: 'Writer',
                  contentType: ContentType.text,
                  title: '',
                  body: 'Text only',
                  publishedAt: DateTime.utc(2026),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Post actions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Negative feedback'));
      await tester.pumpAndSettle();
      expect(find.text('Not useful to me'), findsOneWidget);
      expect(
        tester
            .widget<ListTile>(find.widgetWithText(ListTile, 'Not useful to me'))
            .enabled,
        isFalse,
      );
      await tester.tap(find.text('I’m reacting to what happened'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('No emotion has been recorded.'),
        findsOneWidget,
      );
      verifyZeroInteractions(dio);
      Navigator.of(tester.element(find.text('Reacting to the story'))).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Post actions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Story emotions — unavailable'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('No emotion has been recorded.'),
        findsOneWidget,
      );
      verifyZeroInteractions(dio);
    },
  );
}
