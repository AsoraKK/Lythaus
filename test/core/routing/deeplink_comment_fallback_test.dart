import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/routing/deeplink_router.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/post_creation_providers.dart';
import 'package:lythaus/features/feed/domain/models.dart';
import 'package:lythaus/features/feed/domain/post_repository.dart';
import 'package:lythaus/features/feed/presentation/post_detail_screen.dart';

class _Posts extends Fake implements PostRepository {
  @override
  Future<Post> getPost({required String postId, String? token}) async => Post(
    id: postId,
    authorId: 'synthetic-author',
    authorUsername: 'Synthetic author',
    text: 'Synthetic post',
    createdAt: DateTime.utc(2026, 10, 23),
  );
}

void main() {
  for (final entry in <String, String>{
    '/comment/comment-id/post-id?postId=': 'post-id',
    '/comment/comment-id/post-id?postId=&post=': 'post-id',
    '/comment/comment-id?postId=&post=query-post': 'query-post',
    'lythaus://comment/comment-id/path-post?postId=&post=query-post':
        'query-post',
    '/comment/comment-id/path-post?postId=primary&post=secondary': 'primary',
  }.entries) {
    testWidgets(
      'comment destination uses first nonempty source: ${entry.key}',
      (tester) async {
        expect(DeeplinkRouter.canNavigate(entry.key), isTrue);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              postRepositoryProvider.overrideWithValue(_Posts()),
              jwtProvider.overrideWith((_) async => null),
            ],
            child: const MaterialApp(home: Scaffold(body: Text('Home'))),
          ),
        );
        final navigation = DeeplinkRouter.navigate(
          tester.element(find.text('Home')),
          entry.key,
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
        expect(find.byType(PostDetailScreen), findsOneWidget);
        final screen = tester.widget<PostDetailScreen>(
          find.byType(PostDetailScreen),
        );
        expect(screen.postId, entry.value);
        expect(screen.initialCommentId, 'comment-id');
        await tester.pageBack();
        await tester.pumpAndSettle();
        await navigation;
        expect(find.text('Home'), findsOneWidget);
      },
    );
  }

  test('empty comment destinations remain unavailable', () {
    for (final link in [
      '/comment/comment-id?postId=',
      '/comment/comment-id?postId=&post=',
    ]) {
      expect(DeeplinkRouter.canNavigate(link), isFalse);
    }
  });

  test(
    'normalized dot paths and external credentialed authorities stay unavailable',
    () {
      for (final link in [
        '/post/..',
        '/post/%2E%2E',
        'https://app.lythaus.co@outside.example/post/id',
        'https://app.lythaus.co:443@outside.example/post/id',
        'https://outside.example:443/post/id',
      ]) {
        expect(DeeplinkRouter.canNavigate(link), isFalse, reason: link);
      }
    },
  );
}
