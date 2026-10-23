import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/routing/deeplink_router.dart';

class _Routes extends NavigatorObserver {
  int pushes = 0;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    pushes++;
  }
}

void main() {
  const invalidLinks = [
    '/post/%FF',
    '/post/id?commentId=%FF',
    'lythaus://post/%FF',
    'https://outside.example/invite/ABC123',
    'http://app.lythaus.co/invite/ABC123',
    '//outside.example/invite/ABC123',
    '/moderation/unsupported',
    '/invite',
  ];

  for (final link in invalidLinks) {
    test('invalid link is unavailable: $link', () {
      expect(DeeplinkRouter.canNavigate(link), isFalse);
    });

    testWidgets('invalid link cannot push a route: $link', (tester) async {
      final observer = _Routes();
      await tester.pumpWidget(
        MaterialApp(
          navigatorObservers: [observer],
          home: const Scaffold(body: Text('Home')),
        ),
      );
      final context = tester.element(find.text('Home'));
      final navigation = DeeplinkRouter.navigate(context, link);
      expect(observer.pushes, 1);
      await navigation;
      await tester.pump();
      expect(find.text('Home'), findsOneWidget);
    });
  }

  test('supported first-party links remain available', () {
    for (final link in [
      '/post/post-id?commentId=comment-id',
      'lythaus://post/post-id',
      'https://app.lythaus.co/user/user-id',
      '/comment/comment-id?postId=post-id',
      '/comment/comment-id/post-id',
      '/invite/ABC123',
      '/invite?code=ABC123',
      '/settings/notifications',
      '/moderation',
      '/moderation/appeal',
    ]) {
      expect(DeeplinkRouter.canNavigate(link), isTrue, reason: link);
    }
  });

  testWidgets('non-string notification deep link is ignored', (tester) async {
    final observer = _Routes();
    await tester.pumpWidget(
      MaterialApp(
        navigatorObservers: [observer],
        home: const Scaffold(body: Text('Home')),
      ),
    );
    await DeeplinkRouter.handleNotificationTap(
      tester.element(find.text('Home')),
      const {'deeplink': 42},
    );
    expect(observer.pushes, 1);
  });
}
