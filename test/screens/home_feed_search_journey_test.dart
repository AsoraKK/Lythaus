import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lythaus/features/feed/application/social_feed_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart' as domain;
import 'package:lythaus/ui/components/author_profile_link.dart';
import 'package:lythaus/ui/screens/home/feed_search_screen.dart';

void main() {
  testWidgets(
    'search result detail returns with query and scroll position intact',
    (tester) async {
      final feed = domain.FeedResponse(
        posts: List.generate(
          12,
          (index) => domain.Post(
            id: 'search-post-$index',
            authorId: 'author-$index',
            authorUsername: 'Author $index',
            text: 'Search result $index body',
            createdAt: DateTime.utc(2025, 1, index + 1),
          ),
        ),
        totalCount: 12,
        hasMore: false,
        page: 1,
        pageSize: 20,
      );
      final router = GoRouter(
        initialLocation: '/search?q=cats',
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) =>
                const Scaffold(body: SizedBox.shrink()),
            routes: [
              GoRoute(
                path: 'search',
                builder: (context, state) => FeedSearchScreen(
                  initialQuery: state.uri.queryParameters['q'] ?? '',
                ),
              ),
              GoRoute(
                name: 'post',
                path: 'post/:postId',
                builder: (context, state) {
                  final postId = state.pathParameters['postId']!;
                  final authorId = 'author-${postId.split('-').last}';
                  return Scaffold(
                    appBar: AppBar(title: const Text('Post detail')),
                    body: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('opened:$postId'),
                          AuthorProfileLink(
                            userId: authorId,
                            label: 'Result author',
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
              GoRoute(
                name: 'profile',
                path: 'user/:userId',
                builder: (context, state) => Scaffold(
                  appBar: AppBar(title: const Text('Profile')),
                  body: Center(
                    child: Text('profile:${state.pathParameters['userId']}'),
                  ),
                ),
              ),
            ],
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            feedSearchProvider.overrideWith(
              () => _SearchNotifier((_) async => feed),
            ),
          ],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        'cats',
      );
      final resultBody = find.text('Search result 7 body');
      final listView = find.byType(ListView).first;
      final scrollable = find
          .descendant(of: listView, matching: find.byType(Scrollable))
          .first;
      await tester.drag(listView, const Offset(0, -1200));
      await tester.pumpAndSettle();
      await tester.ensureVisible(resultBody);
      final before = tester.state<ScrollableState>(scrollable).position.pixels;
      expect(before, greaterThan(0));

      await tester.tap(resultBody);
      await tester.pumpAndSettle();
      expect(find.text('opened:search-post-7'), findsOneWidget);
      await tester.tap(find.byTooltip('View Result author profile'));
      await tester.pumpAndSettle();
      expect(find.text('profile:author-7'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('opened:search-post-7'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();

      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        'cats',
      );
      expect(find.text('Search result 7 body'), findsOneWidget);
      final after = tester.state<ScrollableState>(scrollable).position.pixels;
      expect(after, closeTo(before, 1));
    },
  );
}

class _SearchNotifier extends FeedSearchNotifier {
  _SearchNotifier(this.responseFor);

  final Future<domain.FeedResponse> Function(FeedSearchKey key) responseFor;

  @override
  Future<domain.FeedResponse> build(FeedSearchKey arg) => responseFor(arg);
}
