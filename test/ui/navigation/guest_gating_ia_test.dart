import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/presentation/create_post_screen.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/state/providers/feed_providers.dart';
import 'package:lythaus/ui/screens/app_shell.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

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
  testWidgets('guest users can view create screen but cannot submit', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [canCreatePostProvider.overrideWithValue(false)],
        child: const MaterialApp(home: CreatePostScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Please sign in to create a post.'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton).first).onPressed,
      isNull,
    );
  });

  testWidgets('authenticated users can compose and submit when valid', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [canCreatePostProvider.overrideWithValue(true)],
        child: const MaterialApp(home: CreatePostScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Please sign in to create a post.'), findsNothing);
    await tester.enterText(find.byType(TextField).first, 'Hello Lythaus');
    await tester.pump();
    await tester.tap(find.text('Human-authored'));
    await tester.pump();

    final postButton = find.widgetWithText(FilledButton, 'Post');
    expect(postButton, findsOneWidget);
    expect(tester.widget<FilledButton>(postButton).onPressed, isNotNull);
  });

  testWidgets('guest users cannot open composer tab from app shell', (
    tester,
  ) async {
    const feeds = [
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
      FeedModel(
        id: 'news',
        name: 'News',
        type: FeedType.news,
        contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
        sorting: SortingRule.newest,
        refinements: FeedRefinements(),
        subscriptionLevelRequired: 0,
      ),
    ];
    final items = [
      FeedItem(
        id: 'item-1',
        feedId: 'discover',
        author: 'guest',
        contentType: ContentType.text,
        title: 'Guest post',
        body: 'read-only',
        publishedAt: DateTime(2024, 1, 1),
      ),
    ];

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          guestModeProvider.overrideWith((ref) => true),
          feedListProvider.overrideWith((ref) => feeds),
          liveFeedStateProvider.overrideWith(
            (ref, _) => _StaticLiveFeedNotifier(items),
          ),
          liveFeedItemsProvider.overrideWith((ref, _) async => items),
        ],
        child: MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(disableAnimations: true),
            child: child!,
          ),
          home: const LythausAppShell(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create'));
    await tester.pump();

    expect(find.text('Sign in to use this Alpha feature.'), findsOneWidget);
    expect(find.text('Create Post'), findsNothing);
  });
}
