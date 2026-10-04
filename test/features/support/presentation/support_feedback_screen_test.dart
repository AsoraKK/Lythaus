import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/support/application/support_feedback_api.dart';
import 'package:lythaus/features/support/application/support_feedback_providers.dart';
import 'package:lythaus/features/support/presentation/support_feedback_screen.dart';
import 'package:lythaus/features/support/support_feedback_config.dart';

const _requestId = '018f0000-0000-7000-8000-000000000001';

class _FakeSupportFeedbackClient implements SupportFeedbackClient {
  _FakeSupportFeedbackClient(this.label, {this.deferNextList = false});

  final String label;
  bool deferNextList;
  bool _current = true;
  Completer<Map<String, dynamic>>? _pendingList;
  final List<String> listedKinds = <String>[];
  final List<Map<String, dynamic>> submissions = <Map<String, dynamic>>[];
  final List<String> submissionKeys = <String>[];
  final List<String> replies = <String>[];
  final List<String> replyKeys = <String>[];
  int cancellations = 0;

  @override
  bool get isCurrentSession => _current;

  @override
  void cancelPending() {
    cancellations += 1;
    final pending = _pendingList;
    if (pending != null && !pending.isCompleted) {
      pending.completeError(const SupportFeedbackCancelled());
    }
  }

  void deactivate() {
    _current = false;
    cancelPending();
  }

  @override
  Future<Map<String, dynamic>> getOptions() async => <String, dynamic>{
    'version': 'test_v1',
    'contract': <String, dynamic>{
      'categories': <String, dynamic>{
        'problem': <String>['display'],
        'suggestion': <String>['navigation'],
      },
    },
  };

  @override
  Future<Map<String, dynamic>> list({
    required String kind,
    required int limit,
    String? cursor,
  }) {
    listedKinds.add(kind);
    if (deferNextList) {
      deferNextList = false;
      _pendingList = Completer<Map<String, dynamic>>();
      return _pendingList!.future;
    }
    return Future<Map<String, dynamic>>.value(<String, dynamic>{
      'items': <Map<String, dynamic>>[_request(kind)],
      'nextCursor': null,
    });
  }

  @override
  Future<Map<String, dynamic>> detail({
    required String kind,
    required String requestId,
    int? messageBefore,
  }) async => <String, dynamic>{
    'request': _request(kind),
    'messages': <Map<String, dynamic>>[
      <String, dynamic>{
        'id': '018f0000-0000-7000-8000-000000000002',
        'from': 'owner',
        'text': 'Owner reply in private history.',
        'revision': 2,
        'createdAt': '2026-10-01T12:00:00Z',
      },
    ],
    'nextMessageCursor': null,
  };

  @override
  Future<Map<String, dynamic>> submit({
    required String kind,
    required Map<String, dynamic> body,
    required String idempotencyKey,
  }) async {
    submissions.add(<String, dynamic>{'kind': kind, ...body});
    submissionKeys.add(idempotencyKey);
    return <String, dynamic>{'request': _request(kind, body: body)};
  }

  @override
  Future<Map<String, dynamic>> reply({
    required String kind,
    required String requestId,
    required int expectedRevision,
    required String message,
    required String idempotencyKey,
  }) async {
    replies.add(message);
    replyKeys.add(idempotencyKey);
    return <String, dynamic>{'replayed': false};
  }

  Map<String, dynamic> _request(String kind, {Map<String, dynamic>? body}) =>
      <String, dynamic>{
        'id': _requestId,
        'kind': kind,
        'category': kind == 'problem' ? 'display' : 'navigation',
        'title':
            body?['title'] ??
            '$label ${kind == 'problem' ? 'problem' : 'suggestion'}',
        'actual': body?['actual'] ?? 'Synthetic actual behavior.',
        'expected': body?['expected'] ?? 'Synthetic expected behavior.',
        'revision': 1,
        'state': 'submitted',
        'createdAt': '2026-10-01T12:00:00Z',
        'updatedAt': '2026-10-01T12:00:00Z',
        'memberMessage': null,
      };
}

void main() {
  test('feature is default-off in the member build', () {
    expect(supportFeedbackEnabled, isFalse);
  });

  testWidgets(
    'problem and suggestion forms keep their fields and histories distinct',
    (tester) async {
      final source = StateController<Object?>(null);
      addTearDown(source.dispose);
      final client = _FakeSupportFeedbackClient('Member A');
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authSessionRevisionProvider.overrideWith(
              (ref) => AuthSessionRevision(source),
            ),
            supportFeedbackClientProvider.overrideWithValue(client),
          ],
          child: const MaterialApp(home: SupportFeedbackScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(client.listedKinds, <String>['problem']);
      expect(find.text('What happened?'), findsOneWidget);
      expect(find.text('What did you expect?'), findsOneWidget);
      await tester.enterText(find.byType(TextField).at(0), 'Report title');
      await tester.enterText(
        find.byType(TextField).at(1),
        'It failed this way.',
      );
      await tester.enterText(
        find.byType(TextField).at(2),
        'It should work this way.',
      );
      await tester.enterText(
        find.byType(TextField).at(3),
        'Repeat these steps.',
      );
      await tester.scrollUntilVisible(
        find.text('Send private report'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Send private report'));
      await tester.pumpAndSettle();
      expect(client.submissions.single, containsPair('kind', 'problem'));
      expect(client.submissions.single['actual'], 'It failed this way.');
      expect(client.submissions.single['expected'], 'It should work this way.');
      expect(client.submissions.single, isNot(contains('improvement')));
      expect(client.submissionKeys.single, isNotEmpty);

      await tester.scrollUntilVisible(
        find.text('Feedback and suggestions'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Feedback and suggestions').first);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('What would you improve?'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('What would you improve?'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Who would this help, and how?'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Who would this help, and how?'), findsOneWidget);
      expect(find.text('What happened?'), findsNothing);
      expect(client.listedKinds.last, 'suggestion');
      await tester.scrollUntilVisible(
        find.text('Suggestions'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Suggestions'), findsOneWidget);
    },
  );

  testWidgets('history opens private messages and sends a member reply', (
    tester,
  ) async {
    final source = StateController<Object?>(null);
    addTearDown(source.dispose);
    final client = _FakeSupportFeedbackClient('Member A');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authSessionRevisionProvider.overrideWith(
            (ref) => AuthSessionRevision(source),
          ),
          supportFeedbackClientProvider.overrideWithValue(client),
        ],
        child: const MaterialApp(home: SupportFeedbackScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Member A problem'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Member A problem'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Owner reply in private history.'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Owner reply in private history.'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Reply privately'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byType(TextField).last,
      'My private follow-up.',
    );
    await tester.scrollUntilVisible(
      find.text('Send reply'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Send reply'));
    await tester.pumpAndSettle();
    expect(client.replies, <String>['My private follow-up.']);
    expect(client.replyKeys.single, isNotEmpty);
    expect(
      find.text('Your reply was added to the private history.'),
      findsOneWidget,
    );
  });

  testWidgets('cancel stops pending history loading', (tester) async {
    final source = StateController<Object?>(null);
    addTearDown(source.dispose);
    final client = _FakeSupportFeedbackClient('Member A', deferNextList: true);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authSessionRevisionProvider.overrideWith(
            (ref) => AuthSessionRevision(source),
          ),
          supportFeedbackClientProvider.overrideWithValue(client),
        ],
        child: const MaterialApp(home: SupportFeedbackScreen()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Cancel loading'), findsOneWidget);
    await tester.tap(find.text('Cancel loading'));
    await tester.pumpAndSettle();
    expect(client.cancellations, 1);
    expect(find.text('No requests in this history yet.'), findsOneWidget);
  });

  testWidgets(
    'account switch cancels old requests and clears old account data',
    (tester) async {
      final source = StateController<Object?>(null);
      addTearDown(source.dispose);
      final clients = <_FakeSupportFeedbackClient>[];
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authSessionRevisionProvider.overrideWith(
              (ref) => AuthSessionRevision(source),
            ),
            supportFeedbackClientProvider.overrideWith((ref) {
              final revision = ref.watch(authSessionRevisionProvider);
              final client = _FakeSupportFeedbackClient('Account $revision');
              clients.add(client);
              ref.onDispose(client.deactivate);
              return client;
            }),
          ],
          child: const MaterialApp(home: SupportFeedbackScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(clients.first.listedKinds.first, 'problem');
      await tester.enterText(
        find.byType(TextField).at(0),
        'Old account unsent draft',
      );
      clients.first.deferNextList = true;
      await tester.tap(find.text('Feedback and suggestions').first);
      await tester.pump();

      source.state = 'account-switched';
      await tester.pump();
      await tester.pump();
      await tester.pumpAndSettle();
      expect(clients, hasLength(2));
      expect(clients.first.isCurrentSession, isFalse);
      expect(clients.first.cancellations, greaterThan(0));
      await tester.scrollUntilVisible(
        find.text('Account 1 suggestion'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Account 1 suggestion'), findsOneWidget);
      expect(clients.last.listedKinds.first, 'suggestion');
      expect(
        tester.widget<TextField>(find.byType(TextField).first).controller!.text,
        isEmpty,
      );
    },
  );
}
