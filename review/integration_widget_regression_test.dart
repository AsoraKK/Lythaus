import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/feed/application/feed_actions_service.dart';
import 'package:lythaus/state/models/feed_models.dart';
import 'package:lythaus/ui/components/interactive_feed_card.dart';

import '../test/helpers/feed_session.dart';

class _FakeActions extends FeedActionsService {
  _FakeActions() : super(Dio());

  var usefulCalls = 0;
  var usefulReadCalls = 0;
  final usefulSelections = <bool>[];
  Completer<void>? usefulAcknowledgement;
  bool usefulOutcomeUnknown = false;

  @override
  Future<void> useful(String postId, bool selected, String token) {
    usefulCalls++;
    usefulSelections.add(selected);
    if (usefulOutcomeUnknown) {
      return Future<void>.error(
        DioException(
          requestOptions: RequestOptions(path: '/posts/$postId/reactions'),
          type: DioExceptionType.receiveTimeout,
        ),
      );
    }
    return usefulAcknowledgement?.future ?? Future<void>.value();
  }

  @override
  Future<bool> readUseful(String postId, String token) async {
    usefulReadCalls++;
    return false;
  }
}

FeedItem _post() => FeedItem(
  id: 'post-1',
  feedId: 'discover',
  author: 'Writer',
  authorId: 'author-1',
  contentType: ContentType.text,
  title: 'Post title',
  body: 'Post body',
  publishedAt: DateTime.utc(2026, 10, 25),
);

Widget _app(List<Override> overrides) => ProviderScope(
  overrides: overrides,
  child: MaterialApp(
    home: Scaffold(body: InteractiveFeedCard(item: _post())),
  ),
);

List<Override> _memberOverrides({
  required _FakeActions actions,
  Future<Set<String>> Function(Ref ref)? bookmarks,
}) => [
  authStateProvider.overrideWith((ref) => FeedTestAuth(feedTestUser('reader'))),
  jwtProvider.overrideWith((ref) async => 'synthetic-token'),
  feedBookmarksProvider.overrideWith(bookmarks ?? (ref) async => <String>{}),
  feedActionsServiceProvider.overrideWithValue(actions),
  feedbackExplainedProvider.overrideWith((ref) => true),
];

void main() {
  testWidgets('adding Useful stays unselected until server acknowledgement', (
    tester,
  ) async {
    final actions = _FakeActions()..usefulAcknowledgement = Completer<void>();
    await tester.pumpWidget(_app(_memberOverrides(actions: actions)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Useful'));
    await tester.pump();
    expect(actions.usefulSelections, [true]);
    expect(find.text('Useful'), findsOneWidget);
    expect(find.text('Useful selected'), findsNothing);

    actions.usefulAcknowledgement!.complete();
    await tester.pumpAndSettle();
    expect(find.text('Useful selected'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('removing a confirmed useful reaction waits for server confirmation', (
    tester,
  ) async {
    final actions = _FakeActions()..usefulAcknowledgement = Completer<void>();
    await tester.pumpWidget(_app(_memberOverrides(actions: actions)));
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(InteractiveFeedCard)),
    );
    container.read(confirmedUsefulProvider.notifier).state = {'post-1': true};
    await tester.pump();
    expect(find.text('Useful selected'), findsOneWidget);

    await tester.tap(find.text('Useful selected'));
    await tester.pump();

    expect(actions.usefulCalls, 1);
    expect(actions.usefulSelections, [false]);
    expect(find.text('Useful selected'), findsOneWidget);

    actions.usefulAcknowledgement!.complete();
    await tester.pumpAndSettle();
    expect(find.text('Useful'), findsOneWidget);
    expect(find.text('Useful selected'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('uncertain useful timeout retains pending state and offers status check', (
    tester,
  ) async {
    final actions = _FakeActions()..usefulOutcomeUnknown = true;
    await tester.pumpWidget(_app(_memberOverrides(actions: actions)));
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(InteractiveFeedCard)),
    );

    await tester.tap(find.text('Useful'));
    await tester.pumpAndSettle();

    expect(actions.usefulCalls, 1);
    expect(container.read(pendingFeedActionsProvider)['post-1'], 'useful');
    await tester.pump();

    expect(
      find.textContaining(
        'The change could not be confirmed. Check your account activity',
      ),
      findsOneWidget,
    );
    expect(find.text('Check current state'), findsOneWidget);
    expect(tester.widget<TextButton>(find.widgetWithText(TextButton, 'Useful')).onPressed, isNull);
    await tester.tap(find.text('Check current state'));
    await tester.pumpAndSettle();
    expect(actions.usefulCalls, 1);
    expect(actions.usefulReadCalls, 1);
    expect(container.read(pendingFeedActionsProvider), isEmpty);
  });

  testWidgets('guest useful action routes to sign-in without a server action', (
    tester,
  ) async {
    final actions = _FakeActions();
    await tester.pumpWidget(
      _app([
        authStateProvider.overrideWith((ref) => FeedTestAuth(null)),
        guestModeProvider.overrideWith((ref) => true),
        jwtProvider.overrideWith((ref) async => null),
        feedBookmarksProvider.overrideWith((ref) async => <String>{}),
        feedActionsServiceProvider.overrideWithValue(actions),
      ]),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Useful'));
    await tester.pumpAndSettle();

    expect(find.text('Sign in to save, react, mute or report.'), findsOneWidget);
    expect(actions.usefulCalls, 0);
  });

  testWidgets('bookmark read failure is labeled unavailable and can refresh', (
    tester,
  ) async {
    final actions = _FakeActions();
    var reads = 0;
    await tester.pumpWidget(
      _app(
        _memberOverrides(
          actions: actions,
          bookmarks: (ref) async {
            reads++;
            throw StateError('synthetic unavailable bookmarks');
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byTooltip('Saved state unavailable'), findsOneWidget);
    await tester.tap(find.byTooltip('Saved state unavailable'));
    await tester.pumpAndSettle();

    expect(reads, greaterThan(1));
    expect(actions.usefulCalls, 0);
    expect(tester.takeException(), isNull);
  });
}
