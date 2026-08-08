import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
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

domain.Post _post({
  String id = 'post-1',
  String text = 'post text',
  List<String>? tags,
}) {
  return domain.Post(
    id: id,
    authorId: 'author-$id',
    authorUsername: 'Author $id',
    text: text,
    createdAt: DateTime(2024, 1, 1),
    metadata: tags == null ? null : domain.PostMetadata(tags: tags),
  );
}

domain.FeedResponse _feedResponse({
  String id = 'post-1',
  String text = 'post text',
  List<String>? tags,
}) {
  return domain.FeedResponse(
    posts: [_post(id: id, text: text, tags: tags)],
    totalCount: 1,
    hasMore: false,
    page: 1,
    pageSize: 20,
  );
}

void main() {
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

  testWidgets('trending feed screen shows data', (tester) async {
    final feed = _feedResponse(text: 'Top story', tags: ['news']);

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
    expect(find.text('news'), findsOneWidget);
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

    expect(find.textContaining('Search across feeds'), findsOneWidget);
  });

  testWidgets('feed search screen renders results for query', (tester) async {
    final feed = _feedResponse(text: 'Search result', tags: ['cats']);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feedSearchProvider('cats').overrideWith((ref) => Future.value(feed)),
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

  testWidgets('feed search screen shows error state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feedSearchProvider(
            'down',
          ).overrideWith((ref) => Future.error(Exception('fail'))),
        ],
        child: const MaterialApp(home: FeedSearchScreen()),
      ),
    );

    await tester.enterText(find.byType(TextField), 'down');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    expect(find.text('Search is unavailable right now.'), findsOneWidget);
  });

  testWidgets('feed search clear button resets query', (tester) async {
    final feed = _feedResponse(text: 'Clearable', tags: ['reset']);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feedSearchProvider('reset').overrideWith((ref) => Future.value(feed)),
        ],
        child: const MaterialApp(home: FeedSearchScreen()),
      ),
    );

    await tester.enterText(find.byType(TextField), 'reset');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.clear));
    await tester.pumpAndSettle();

    expect(find.textContaining('Search across feeds'), findsOneWidget);
  });
}
