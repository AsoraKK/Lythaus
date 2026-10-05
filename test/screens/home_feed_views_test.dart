import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/features/feed/domain/social_feed_repository.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/feed_card.dart';
import 'package:lythaus/ui/screens/home/custom_feed.dart';
import 'package:lythaus/ui/screens/home/feed_search_screen.dart';
import 'package:lythaus/ui/screens/home/trending_feed_screen.dart';

class _TrendingSuccessNotifier extends TrendingFeedNotifier {
  _TrendingSuccessNotifier(this.feed);

  final domain.FeedResponse feed;

  @override
  Future<domain.FeedResponse> build() async => feed;
}

class _TrendingErrorNotifier extends TrendingFeedNotifier {
  @override
  Future<domain.FeedResponse> build() async => throw Exception('boom');
}

class _SearchNotifier extends FeedSearchNotifier {
  _SearchNotifier(this.responseFor);

  final Future<domain.FeedResponse> Function(FeedSearchKey key) responseFor;

  @override
  Future<domain.FeedResponse> build(FeedSearchKey arg) => responseFor(arg);
}

domain.Post _post({
  String id = 'post-1',
  String text = 'post text',
  List<String>? tags,
  String? category,
}) {
  return domain.Post(
    id: id,
    authorId: 'author-$id',
    authorUsername: 'Author $id',
    text: text,
    createdAt: DateTime(2024, 1, 1),
    metadata: tags == null && category == null
        ? null
        : domain.PostMetadata(tags: tags ?? const [], category: category),
  );
}

domain.FeedResponse _feedResponse({
  String id = 'post-1',
  String text = 'post text',
  List<String>? tags,
  String? category,
}) {
  return domain.FeedResponse(
    posts: [_post(id: id, text: text, tags: tags, category: category)],
    totalCount: 1,
    hasMore: false,
    page: 1,
    pageSize: 20,
  );
}

void main() {
  for (final surface in ['search', 'trending']) {
    for (final trustStatus in ['under_appeal', 'verified_signals_attached']) {
      testWidgets('$surface preserves public post identity and $trustStatus', (
        tester,
      ) async {
        final semantics = tester.ensureSemantics();
        tester.view.physicalSize = const Size(320, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final hasAppeal = trustStatus == 'under_appeal';
        final post = domain.Post.fromJson({
          'id': 'public-fixture',
          'authorId': 'public-author',
          'authorUsername': 'Public author',
          'body': 'A published post.',
          'publishedAt': '2026-10-02T00:00:00Z',
          'visibility': 'public',
          'moderationState': 'allowed',
          'publicLabel': 'Human-authored',
          'feedItemDeleted': false,
          'trustStatus': trustStatus,
          'timeline': {
            'created': 'complete',
            'mediaChecked': 'complete',
            'moderation': 'complete',
            if (hasAppeal) 'appeal': 'open',
          },
          'hasAppeal': hasAppeal,
          'proofSignalsProvided': true,
          'verifiedContextBadgeEligible': !hasAppeal,
          'featuredEligible': !hasAppeal,
        });
        final feed = domain.FeedResponse(
          posts: [post],
          totalCount: 1,
          hasMore: false,
          page: 1,
          pageSize: 20,
        );
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              feedSearchProvider.overrideWith(
                () => _SearchNotifier((_) async => feed),
              ),
              trendingFeedProvider.overrideWith(
                () => _TrendingSuccessNotifier(feed),
              ),
            ],
            child: MaterialApp(
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: const TextScaler.linear(2)),
                child: child!,
              ),
              home: surface == 'search'
                  ? const FeedSearchScreen()
                  : const TrendingFeedScreen(),
            ),
          ),
        );
        final initialException = tester.takeException();
        expect(initialException, isNull, reason: 'after initial render');
        if (surface == 'search') {
          await tester.enterText(find.byType(TextField), 'public');
          await tester.testTextInput.receiveAction(TextInputAction.search);
        }
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: 'after loading results');
        final card = tester.widget<FeedCard>(find.byType(FeedCard));
        final item = card.item;
        expect(
          [item.authorId, item.trustSummary.trustStatus],
          ['public-author', trustStatus],
        );
        expect(item.feedId, surface);
        expect(item.title, surface == 'search' ? 'Result' : 'Update');
        expect(item.authorshipLabel, 'Human-authored');
        expect(item.trustSummary.timeline.moderation, 'complete');
        expect(item.trustSummary.timeline.appeal, hasAppeal ? 'open' : null);
        expect(item.trustSummary.hasAppeal, hasAppeal);
        expect(item.trustSummary.proofSignalsProvided, isTrue);
        expect(item.trustSummary.verifiedContextBadgeEligible, !hasAppeal);
        expect(item.trustSummary.featuredEligible, !hasAppeal);
        expect(card.canEdit, isFalse);
        expect(find.byTooltip('Post actions'), findsNothing);
        expect(
          find.text(hasAppeal ? 'Under appeal' : 'Verified signals attached'),
          findsOneWidget,
        );
        expect(find.text('Authorship: Human-authored'), findsOneWidget);
        await tester.ensureVisible(find.text('Trust details'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Trust details'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: 'after expanding trust');
        expect(
          find.bySemanticsLabel(RegExp('^View content history')),
          findsOneWidget,
        );
        semantics.dispose();
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('custom feed view renders filters and items', (tester) async {
    const feed = FeedModel(
      id: 'custom-1',
      name: 'Custom',
      type: FeedType.custom,
      contentFilters: ContentFilters(allowedTypes: {ContentType.mixed}),
      sorting: SortingRule.relevant,
      refinements: FeedRefinements(
        includeKeywords: ['local'],
        excludeKeywords: ['spam'],
      ),
      subscriptionLevelRequired: 0,
      isCustom: true,
    );
    final items = [
      FeedItem(
        id: 'item-1',
        feedId: 'custom-1',
        author: 'Ada',
        contentType: ContentType.text,
        title: 'Local update',
        body: 'Neighborhood post',
        publishedAt: DateTime(2024, 1, 1),
      ),
    ];

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            body: CustomFeedView(feed: feed, items: items),
          ),
        ),
      ),
    );

    expect(find.text('Custom feed'), findsOneWidget);
    expect(find.text('+local'), findsOneWidget);
    expect(find.text('-spam'), findsOneWidget);
    expect(find.byType(FeedCard), findsOneWidget);
  });

  testWidgets('trending feed shows content without routine category or tags', (
    tester,
  ) async {
    final feed = _feedResponse(
      text: 'Top story',
      tags: ['news'],
      category: 'Local updates',
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          trendingFeedProvider.overrideWith(
            () => _TrendingSuccessNotifier(feed),
          ),
        ],
        child: const MaterialApp(home: TrendingFeedScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Trending'), findsOneWidget);
    expect(find.text('Top story'), findsOneWidget);
    expect(find.text('Author post-1'), findsOneWidget);
    expect(find.text('Authorship: Under review'), findsOneWidget);
    expect(find.text('Local updates'), findsNothing);
    expect(find.text('news'), findsNothing);
  });

  testWidgets('trending feed screen shows error state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          trendingFeedProvider.overrideWith(() => _TrendingErrorNotifier()),
        ],
        child: const MaterialApp(home: TrendingFeedScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Unable to load trending right now.'), findsOneWidget);
  });

  testWidgets('feed search screen shows prompt when empty', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: FeedSearchScreen())),
    );

    await tester.pumpAndSettle();

    expect(
      find.textContaining('Find posts by tag across your feeds.'),
      findsOneWidget,
    );
  });

  testWidgets('feed search screen renders results for query', (tester) async {
    final feed = _feedResponse(text: 'Search result', tags: ['cats']);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feedSearchProvider.overrideWith(
            () => _SearchNotifier((_) async => feed),
          ),
        ],
        child: const MaterialApp(home: FeedSearchScreen()),
      ),
    );

    await tester.enterText(find.byType(TextField), 'cats');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    expect(find.text('Search result'), findsOneWidget);
    expect(find.text('cats'), findsWidgets);
  });

  testWidgets('feed search shows an empty state for an unknown tag', (
    tester,
  ) async {
    const empty = domain.FeedResponse(
      posts: [],
      totalCount: 0,
      hasMore: false,
      page: 1,
      pageSize: 25,
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feedSearchProvider.overrideWith(
            () => _SearchNotifier((_) async => empty),
          ),
        ],
        child: const MaterialApp(
          home: FeedSearchScreen(initialQuery: 'unknown'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No results for “unknown”'), findsOneWidget);
  });

  testWidgets('feed search explains unavailable and offers retry', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feedSearchProvider.overrideWith(
            () => _SearchNotifier(
              (_) => Future.error(
                const SocialFeedException(
                  'Tag search is temporarily unavailable.',
                  code: 'tag_search_unavailable',
                ),
              ),
            ),
          ),
        ],
        child: const MaterialApp(home: FeedSearchScreen(initialQuery: 'civic')),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Tag search is temporarily unavailable.'), findsOneWidget);
    expect(find.text('Retry search'), findsOneWidget);
    await tester.tap(find.text('Retry search'));
    await tester.pumpAndSettle();
    expect(find.text('Tag search is temporarily unavailable.'), findsOneWidget);
  });

  testWidgets('feed search screen shows error state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feedSearchProvider.overrideWith(
            () => _SearchNotifier((_) => Future.error(Exception('fail'))),
          ),
        ],
        child: const MaterialApp(home: FeedSearchScreen()),
      ),
    );

    await tester.enterText(find.byType(TextField), 'down');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    expect(
      find.text('Could not load search. Please try again.'),
      findsOneWidget,
    );
  });

  testWidgets('feed search clear button resets query', (tester) async {
    final feed = _feedResponse(text: 'Clearable', tags: ['reset']);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feedSearchProvider.overrideWith(
            () => _SearchNotifier((_) async => feed),
          ),
        ],
        child: const MaterialApp(home: FeedSearchScreen()),
      ),
    );

    await tester.enterText(find.byType(TextField), 'reset');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.clear));
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Find posts by tag across your feeds.'),
      findsOneWidget,
    );
  });
}
