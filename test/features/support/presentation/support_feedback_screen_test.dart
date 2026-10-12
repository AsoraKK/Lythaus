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
const _secondRequestId = '018f0000-0000-7000-8000-000000000003';

class _FakeSupportFeedbackClient implements SupportFeedbackClient {
  _FakeSupportFeedbackClient(
    this.label, {
    this.deferNextList = false,
    this.approvedLimits = false,
    this.closed = false,
    this.failNextOptions = false,
    this.failNextSubmit = false,
    this.deferNextSubmit = false,
  });

  final String label;
  bool deferNextList;
  bool failNextList = false;
  bool failNextOptions;
  bool failNextSubmit;
  bool deferNextSubmit;
  bool deferNextReply = false;
  bool malformedNextSubmit = false;
  bool malformedNextReply = false;
  bool failNextReply = false;
  final bool approvedLimits;
  final bool closed;
  bool _current = true;
  Completer<Map<String, dynamic>>? _pendingList;
  Completer<Map<String, dynamic>>? _pendingSubmit;
  Completer<Map<String, dynamic>>? _pendingReply;
  final List<String> listedKinds = <String>[];
  final List<int> listedLimits = <int>[];
  final List<Map<String, dynamic>> submissions = <Map<String, dynamic>>[];
  final List<String> submissionKeys = <String>[];
  final List<String> replies = <String>[];
  final List<String> replyKeys = <String>[];
  final List<String> replyRequestIds = <String>[];
  final List<int> replyExpectedRevisions = <int>[];
  int requestRevision = 1;
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
    final pendingSubmit = _pendingSubmit;
    if (pendingSubmit != null && !pendingSubmit.isCompleted) {
      pendingSubmit.completeError(const SupportFeedbackCancelled());
    }
    final pendingReply = _pendingReply;
    if (pendingReply != null && !pendingReply.isCompleted) {
      pendingReply.completeError(const SupportFeedbackCancelled());
    }
  }

  void deactivate() {
    _current = false;
    cancelPending();
  }

  @override
  Future<Map<String, dynamic>> getOptions() async {
    if (failNextOptions) {
      failNextOptions = false;
      throw const SupportFeedbackApiException(404, 'feature_disabled');
    }
    return <String, dynamic>{
      'version': 'test_v1',
      'contract': <String, dynamic>{
        if (approvedLimits)
          'limits': <String, dynamic>{
            'titleBytes': 1024,
            'detailBytes': 8192,
            'stepsBytes': 8192,
            'memberMessageBytes': 8192,
            'titleCharacters': 160,
            'detailCharacters': 2000,
            'stepsCharacters': 2000,
            'memberMessageCharacters': 2000,
          },
        'categories': <String, dynamic>{
          'problem': <String>['display', 'performance'],
          'suggestion': <String>['navigation', 'accessibility'],
        },
      },
      'limits': <String, dynamic>{'page': 3},
    };
  }

  @override
  Future<Map<String, dynamic>> list({
    required String kind,
    required int limit,
    String? cursor,
  }) {
    listedKinds.add(kind);
    listedLimits.add(limit);
    if (failNextList) {
      failNextList = false;
      return Future<Map<String, dynamic>>.error(
        const SupportFeedbackApiException(503, 'support_unavailable'),
      );
    }
    if (deferNextList) {
      deferNextList = false;
      _pendingList = Completer<Map<String, dynamic>>();
      return _pendingList!.future;
    }
    return Future<Map<String, dynamic>>.value(<String, dynamic>{
      'items': <Map<String, dynamic>>[_request(kind)],
      'nextCursor': null,
      'snapshotAt': '2026-10-10T12:00:00Z',
    });
  }

  @override
  Future<Map<String, dynamic>> detail({
    required String kind,
    required String requestId,
    int? messageBefore,
  }) async => <String, dynamic>{
    'request': _request(kind, id: requestId, revision: requestRevision),
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
    if (failNextSubmit) {
      failNextSubmit = false;
      throw const SupportFeedbackApiException(503, 'support_unavailable');
    }
    if (deferNextSubmit) {
      deferNextSubmit = false;
      _pendingSubmit = Completer<Map<String, dynamic>>();
      return _pendingSubmit!.future;
    }
    if (malformedNextSubmit) {
      malformedNextSubmit = false;
      return <String, dynamic>{};
    }
    return _mutation(kind, body: body);
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
    replyRequestIds.add(requestId);
    replyExpectedRevisions.add(expectedRevision);
    if (failNextReply) {
      failNextReply = false;
      requestRevision = expectedRevision + 1;
      throw const SupportFeedbackApiException(409, 'revision_conflict');
    }
    if (deferNextReply) {
      deferNextReply = false;
      _pendingReply = Completer<Map<String, dynamic>>();
      return _pendingReply!.future;
    }
    if (malformedNextReply) {
      malformedNextReply = false;
      return <String, dynamic>{'replayed': false};
    }
    requestRevision = expectedRevision + 1;
    return _mutation(kind, id: requestId);
  }

  void completeDeferredReply() {
    final pending = _pendingReply;
    if (pending == null || pending.isCompleted) {
      throw StateError('No deferred reply is pending');
    }
    requestRevision = replyExpectedRevisions.last + 1;
    pending.complete(_mutation('problem', id: replyRequestIds.last));
  }

  void failDeferredReply() {
    final pending = _pendingReply;
    if (pending == null || pending.isCompleted) {
      throw StateError('No deferred reply is pending');
    }
    pending.completeError(
      const SupportFeedbackApiException(503, 'support_unavailable'),
    );
  }

  Map<String, dynamic> _mutation(
    String kind, {
    String id = _requestId,
    Map<String, dynamic>? body,
  }) => <String, dynamic>{
    'request': _request(kind, id: id, body: body),
    'recordId': id,
    'replayed': false,
  };

  Map<String, dynamic> _request(
    String kind, {
    String id = _requestId,
    String? title,
    Map<String, dynamic>? body,
    int? revision,
  }) => <String, dynamic>{
    'id': id,
    'kind': kind,
    'category': kind == 'problem' ? 'display' : 'navigation',
    'title':
        title ??
        body?['title'] ??
        '$label ${kind == 'problem' ? 'problem' : 'suggestion'}',
    'actual': body?['actual'] ?? 'Synthetic actual behavior.',
    'expected': body?['expected'] ?? 'Synthetic expected behavior.',
    'revision': revision ?? requestRevision,
    'state': 'submitted',
    'createdAt': '2026-10-01T12:00:00Z',
    'updatedAt': '2026-10-01T12:00:00Z',
    'memberMessage': null,
    'submitterId': '018f0000-0000-7000-8000-000000000099',
    'closed': closed,
  };
}

class _TwoRequestReplyClient extends _FakeSupportFeedbackClient {
  _TwoRequestReplyClient() : super('Synthetic reply race');

  final List<String> detailRequestIds = <String>[];
  Completer<Map<String, dynamic>>? _pendingTwoRequestList;
  String? _pendingTwoRequestListKind;

  @override
  Future<Map<String, dynamic>> list({
    required String kind,
    required int limit,
    String? cursor,
  }) async {
    listedKinds.add(kind);
    listedLimits.add(limit);
    if (deferNextList) {
      deferNextList = false;
      _pendingTwoRequestList = Completer<Map<String, dynamic>>();
      _pendingTwoRequestListKind = kind;
      return _pendingTwoRequestList!.future;
    }
    return _twoRequestHistory(kind);
  }

  Map<String, dynamic> _twoRequestHistory(String kind) => <String, dynamic>{
    'items': <Map<String, dynamic>>[
      _request(kind, id: _requestId, title: 'First reply history row'),
      _request(kind, id: _secondRequestId, title: 'Second reply history row'),
    ],
    'nextCursor': null,
    'snapshotAt': '2026-10-10T12:00:00Z',
  };

  void completeDeferredList() {
    final pending = _pendingTwoRequestList;
    final kind = _pendingTwoRequestListKind;
    if (pending == null || pending.isCompleted || kind == null) {
      throw StateError('No deferred history list is pending');
    }
    pending.complete(_twoRequestHistory(kind));
  }

  @override
  Future<Map<String, dynamic>> detail({
    required String kind,
    required String requestId,
    int? messageBefore,
  }) async {
    detailRequestIds.add(requestId);
    return <String, dynamic>{
      'request': _request(
        kind,
        id: requestId,
        title: requestId == _requestId
            ? 'First reply history row'
            : 'Second reply history row',
        revision: requestRevision,
      ),
      'messages': <Map<String, dynamic>>[],
      'nextMessageCursor': null,
    };
  }
}

Future<void> _selectReplyHistoryRow(
  WidgetTester tester,
  String title, {
  bool confirmDiscard = false,
}) async {
  final row = find.descendant(
    of: find.byType(ListTile),
    matching: find.text(title),
  );
  await tester.scrollUntilVisible(
    row,
    300,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(row);
  await tester.pumpAndSettle();
  if (confirmDiscard) {
    expect(find.text('Discard and switch'), findsOneWidget);
    await tester.tap(find.text('Discard and switch'));
    await tester.pumpAndSettle();
  }
}

Future<void> _startDeferredReplyAndSwitchToSecond(
  WidgetTester tester,
  _TwoRequestReplyClient client,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
      child: const MaterialApp(home: SupportFeedbackScreen()),
    ),
  );
  await tester.pumpAndSettle();
  await _selectReplyHistoryRow(tester, 'First reply history row');
  await tester.scrollUntilVisible(
    find.text('Reply privately'),
    300,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.enterText(find.byType(TextField).last, 'First thread reply');
  client.deferNextReply = true;
  await tester.scrollUntilVisible(
    find.text('Send reply'),
    300,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(find.text('Send reply'));
  await tester.pump();
  expect(client.replyRequestIds, <String>[_requestId]);
  await _selectReplyHistoryRow(
    tester,
    'Second reply history row',
    confirmDiscard: true,
  );
}

class _RacingDetailClient extends _FakeSupportFeedbackClient {
  _RacingDetailClient() : super('Member race');

  final pendingDetails = <String, Completer<Map<String, dynamic>>>{};

  @override
  Future<Map<String, dynamic>> list({
    required String kind,
    required int limit,
    String? cursor,
  }) async {
    listedKinds.add(kind);
    listedLimits.add(limit);
    return <String, dynamic>{
      'items': <Map<String, dynamic>>[
        _request(kind, id: _requestId, title: 'First history row'),
        _request(kind, id: _secondRequestId, title: 'Second history row'),
      ],
      'nextCursor': null,
      'snapshotAt': '2026-10-10T12:00:00Z',
    };
  }

  @override
  Future<Map<String, dynamic>> detail({
    required String kind,
    required String requestId,
    int? messageBefore,
  }) {
    final pending = Completer<Map<String, dynamic>>();
    pendingDetails[requestId] = pending;
    return pending.future;
  }

  Map<String, dynamic> detailResult(String requestId, String title) =>
      <String, dynamic>{
        'request': _request('problem', id: requestId, title: title),
        'messages': <Map<String, dynamic>>[],
        'nextMessageCursor': null,
      };

  @override
  void cancelPending() {
    super.cancelPending();
    for (final pending in pendingDetails.values) {
      if (!pending.isCompleted) {
        pending.completeError(const SupportFeedbackCancelled());
      }
    }
  }
}

void main() {
  testWidgets(
    'approved Unicode title limits reject oversize text before invoking the API and respect configured pages',
    (tester) async {
      final client = _FakeSupportFeedbackClient(
        'Synthetic member',
        approvedLimits: true,
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
          child: const MaterialApp(home: SupportFeedbackScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(client.listedLimits, <int>[3]);
      expect(find.text('Up to 160 characters.'), findsOneWidget);
      await tester.enterText(find.byType(TextField).at(0), '😀' * 161);
      await tester.enterText(find.byType(TextField).at(1), 'Synthetic actual');
      await tester.enterText(
        find.byType(TextField).at(2),
        'Synthetic expected',
      );
      await tester.scrollUntilVisible(
        find.text('Send private report'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Send private report'));
      await tester.pumpAndSettle();
      expect(client.submissions, isEmpty);
      expect(
        find.text('Shorten the request text to the limits shown.'),
        findsOneWidget,
      );
      await tester.drag(find.byType(ListView), const Offset(0, 1600));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), '😀' * 160);
      await tester.scrollUntilVisible(
        find.text('Send private report'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Send private report'));
      await tester.pumpAndSettle();
      expect(client.submissions.single['title'], '😀' * 160);
    },
  );

  testWidgets(
    'closed private requests show their history and disable replies',
    (tester) async {
      final client = _FakeSupportFeedbackClient(
        'Synthetic closed',
        closed: true,
        approvedLimits: true,
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
          child: const MaterialApp(home: SupportFeedbackScreen()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Synthetic closed problem'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.drag(find.byType(ListView), const Offset(0, -180));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Synthetic closed problem'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Send reply'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Send reply'),
            )
            .onPressed,
        isNull,
      );
      expect(find.text('This request is closed.'), findsOneWidget);
      expect(client.replies, isEmpty);
    },
  );

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

      await tester.drag(find.byType(ListView), const Offset(0, 1200));
      await tester.pumpAndSettle();
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
    await tester.scrollUntilVisible(
      find.text('Cancel loading'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Cancel loading'), findsOneWidget);
    await tester.tap(find.text('Cancel loading'));
    await tester.pumpAndSettle();
    expect(client.cancellations, 1);
    expect(find.text('No requests in this history yet.'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('Retry history'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Retry history'), findsOneWidget);
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
      await tester.pumpAndSettle();
      await tester.tap(find.text('Discard and switch'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

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

  testWidgets('unavailable options and history have explicit retry paths', (
    tester,
  ) async {
    final client = _FakeSupportFeedbackClient(
      'Synthetic retry',
      failNextOptions: true,
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
        child: const MaterialApp(home: SupportFeedbackScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Support is not available right now.'), findsOneWidget);
    await tester.tap(find.text('Retry support'));
    await tester.pumpAndSettle();
    expect(client.listedKinds, <String>['problem']);

    client.failNextList = true;
    await tester.tap(find.text('Feedback and suggestions').first);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Retry history'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('No requests in this history yet.'), findsNothing);
    expect(find.text('Retry history'), findsOneWidget);
    await tester.tap(find.text('Retry history'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Synthetic retry suggestion'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Synthetic retry suggestion'), findsOneWidget);
  });

  testWidgets('failed and malformed submissions preserve the draft', (
    tester,
  ) async {
    final client = _FakeSupportFeedbackClient(
      'Synthetic draft',
      failNextSubmit: true,
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
        child: const MaterialApp(home: SupportFeedbackScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'Retained title');
    await tester.enterText(find.byType(TextField).at(1), 'Actual detail');
    await tester.enterText(find.byType(TextField).at(2), 'Expected detail');
    await tester.scrollUntilVisible(
      find.text('Send private report'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Send private report'));
    await tester.pumpAndSettle();
    expect(find.text('Your private request was received.'), findsNothing);
    expect(
      tester.widget<TextField>(find.byType(TextField).at(0)).controller!.text,
      'Retained title',
    );
    final firstKey = client.submissionKeys.single;

    client.malformedNextSubmit = true;
    await tester.tap(find.text('Send private report'));
    await tester.pumpAndSettle();
    expect(client.submissionKeys, <String>[firstKey, firstKey]);
    expect(find.text('Your private request was received.'), findsNothing);
    expect(
      tester.widget<TextField>(find.byType(TextField).at(0)).controller!.text,
      'Retained title',
    );
  });

  testWidgets(
    'duplicate submit is blocked and malformed reply is not accepted',
    (tester) async {
      final client = _FakeSupportFeedbackClient(
        'Synthetic pending',
        deferNextSubmit: true,
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
          child: const MaterialApp(home: SupportFeedbackScreen()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), 'Pending title');
      await tester.enterText(find.byType(TextField).at(1), 'Actual detail');
      await tester.enterText(find.byType(TextField).at(2), 'Expected detail');
      await tester.scrollUntilVisible(
        find.text('Send private report'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Send private report'));
      await tester.pump();
      expect(client.submissions, hasLength(1));
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Send private report'),
            )
            .onPressed,
        isNull,
      );
      client._pendingSubmit!.complete(
        client._mutation(
          'problem',
          body: <String, dynamic>{
            'title': 'Pending title',
            'category': 'display',
            'actual': 'Actual detail',
            'expected': 'Expected detail',
          },
        ),
      );
      await tester.pumpAndSettle();
      expect(client.submissions, hasLength(1));
      expect(find.text('Your private request was received.'), findsOneWidget);

      client.malformedNextReply = true;
      await tester.scrollUntilVisible(
        find.text('Reply privately'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(find.byType(TextField).last, 'Retained reply');
      await tester.scrollUntilVisible(
        find.text('Send reply'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Send reply'));
      await tester.pumpAndSettle();
      expect(
        find.text('Your reply was added to the private history.'),
        findsNothing,
      );
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        'Retained reply',
      );
    },
  );

  testWidgets('late details cannot overwrite a newer history selection', (
    tester,
  ) async {
    final client = _RacingDetailClient();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
        child: const MaterialApp(home: SupportFeedbackScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('First history row'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('First history row'));
    await tester.pump();
    await tester.scrollUntilVisible(
      find.text('Second history row'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Second history row'));
    await tester.pump();
    client.pendingDetails[_secondRequestId]!.complete(
      client.detailResult(_secondRequestId, 'Newer selected detail'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Newer selected detail'), findsOneWidget);
    client.pendingDetails[_requestId]!.complete(
      client.detailResult(_requestId, 'Late stale detail'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Newer selected detail'), findsOneWidget);
    expect(find.text('Late stale detail'), findsNothing);
  });

  testWidgets(
    'reply conflict refresh preserves the draft and uses a revision-scoped key',
    (tester) async {
      final client = _FakeSupportFeedbackClient('Synthetic reply recovery');
      await tester.pumpWidget(
        ProviderScope(
          overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
          child: const MaterialApp(home: SupportFeedbackScreen()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.descendant(
          of: find.byType(ListTile),
          matching: find.text('Synthetic reply recovery problem'),
        ),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(
        find.descendant(
          of: find.byType(ListTile),
          matching: find.text('Synthetic reply recovery problem'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Reply privately'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(find.byType(TextField).last, 'Reply draft');
      client.failNextReply = true;
      await tester.scrollUntilVisible(
        find.text('Send reply'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Send reply'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'This request changed or is closed. Reload its history before replying.',
        ),
        findsOneWidget,
      );
      final conflictKey = client.replyKeys.single;

      await tester.scrollUntilVisible(
        find.descendant(
          of: find.byType(ListTile),
          matching: find.text('Synthetic reply recovery problem'),
        ),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(
        find.descendant(
          of: find.byType(ListTile),
          matching: find.text('Synthetic reply recovery problem'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Reply privately'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        'Reply draft',
      );
      await tester.scrollUntilVisible(
        find.text('Send reply'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Send reply'));
      await tester.pumpAndSettle();
      expect(client.replyExpectedRevisions, <int>[1, 2]);
      expect(client.replyKeys, hasLength(2));
      expect(client.replyKeys.first, conflictKey);
      expect(client.replyKeys.last, isNot(conflictKey));
      expect(
        find.text('Your reply was added to the private history.'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'late reply completion cannot replace another request or its new draft',
    (tester) async {
      final client = _TwoRequestReplyClient();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
          child: const MaterialApp(home: SupportFeedbackScreen()),
        ),
      );
      await tester.pumpAndSettle();
      final firstRow = find.descendant(
        of: find.byType(ListTile),
        matching: find.text('First reply history row'),
      );
      await tester.scrollUntilVisible(
        firstRow,
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(firstRow);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Reply privately'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(find.byType(TextField).last, 'First thread reply');
      client.deferNextReply = true;
      await tester.scrollUntilVisible(
        find.text('Send reply'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Send reply'));
      await tester.pump();
      expect(client.replyRequestIds, <String>[_requestId]);
      await tester.enterText(find.byType(TextField).last, '');

      final secondRow = find.descendant(
        of: find.byType(ListTile),
        matching: find.text('Second reply history row'),
      );
      await tester.scrollUntilVisible(
        secondRow,
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(secondRow);
      await tester.pumpAndSettle();
      expect(
        find.textContaining('This reply is still being sent.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Discard and switch'));
      await tester.pumpAndSettle();
      expect(find.text('Second reply history row'), findsWidgets);
      await tester.scrollUntilVisible(
        find.text('Reply privately'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(
        find.byType(TextField).last,
        'Second thread draft',
      );

      client.completeDeferredReply();
      await tester.pumpAndSettle();

      expect(find.text('Second reply history row'), findsWidgets);
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        'Second thread draft',
      );
      expect(
        find.text(
          'A reply to another private request was accepted. Check that request’s history.',
        ),
        findsOneWidget,
      );
      expect(
        find.text('Your reply was added to the private history.'),
        findsNothing,
      );
    },
  );

  testWidgets(
    'late reply success refreshes the same request after returning with no draft',
    (tester) async {
      final client = _TwoRequestReplyClient();
      await _startDeferredReplyAndSwitchToSecond(tester, client);
      await _selectReplyHistoryRow(tester, 'First reply history row');
      await tester.scrollUntilVisible(
        find.text('Reply privately'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        isEmpty,
      );

      client.completeDeferredReply();
      await tester.pumpAndSettle();

      expect(client.detailRequestIds, <String>[
        _requestId,
        _secondRequestId,
        _requestId,
        _requestId,
      ]);
      expect(client.listedKinds, <String>['problem', 'problem']);
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        isEmpty,
      );
      expect(
        find.text('Your reply was added to the private history.'),
        findsOneWidget,
      );
      expect(
        find.textContaining('Your newer draft is still here.'),
        findsNothing,
      );
    },
  );

  testWidgets(
    'late reply success refreshes the same request and preserves a newer draft',
    (tester) async {
      final client = _TwoRequestReplyClient();
      await _startDeferredReplyAndSwitchToSecond(tester, client);
      await _selectReplyHistoryRow(tester, 'First reply history row');
      await tester.scrollUntilVisible(
        find.text('Reply privately'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(
        find.byType(TextField).last,
        'New draft on the returned request',
      );

      client.deferNextList = true;
      client.completeDeferredReply();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(client.listedKinds, <String>['problem', 'problem']);
      await tester.scrollUntilVisible(
        find.text('Send reply'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      final sendReply = find.widgetWithText(FilledButton, 'Send reply');
      expect(tester.widget<FilledButton>(sendReply).onPressed, isNull);
      await tester.scrollUntilVisible(
        find.text('Send private report'),
        -300,
        scrollable: find.byType(Scrollable).first,
      );
      final sendReport = find.ancestor(
        of: find.text('Send private report'),
        matching: find.byWidgetPredicate(
          (widget) => widget is ButtonStyleButton,
        ),
      );
      expect(tester.widget<ButtonStyleButton>(sendReport).onPressed, isNull);

      await tester.scrollUntilVisible(
        find.text('Reply privately'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      final replyField = find.byType(TextField).last;
      expect(tester.widget<TextField>(replyField).enabled, isTrue);
      await tester.enterText(replyField, '');
      await tester.pump();
      await tester.enterText(replyField, 'Revised draft during refresh');
      await tester.pump();

      client.completeDeferredList();
      await tester.pumpAndSettle();

      expect(client.detailRequestIds, <String>[
        _requestId,
        _secondRequestId,
        _requestId,
        _requestId,
      ]);
      expect(client.listedKinds, <String>['problem', 'problem']);
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        'Revised draft during refresh',
      );
      final refreshedSendReply = find.widgetWithText(
        FilledButton,
        'Send reply',
      );
      expect(
        tester.widget<FilledButton>(refreshedSendReply).onPressed,
        isNotNull,
      );
      await tester.scrollUntilVisible(
        find.text('Send private report'),
        -300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(tester.widget<ButtonStyleButton>(sendReport).onPressed, isNotNull);
      expect(
        find.text('Your reply was added to the private history.'),
        findsOneWidget,
      );
      expect(
        find.textContaining('Your newer draft is still here.'),
        findsNothing,
      );

      await tester.scrollUntilVisible(
        find.text('Send reply'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(refreshedSendReply);
      await tester.pumpAndSettle();
      expect(client.replyExpectedRevisions, <int>[1, 2]);
    },
  );

  testWidgets('late reply failure after returning keeps the current draft', (
    tester,
  ) async {
    final client = _TwoRequestReplyClient();
    await _startDeferredReplyAndSwitchToSecond(tester, client);
    await _selectReplyHistoryRow(tester, 'First reply history row');
    await tester.scrollUntilVisible(
      find.text('Reply privately'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byType(TextField).last,
      'Draft after returning from another request',
    );

    client.failDeferredReply();
    await tester.pumpAndSettle();

    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      'Draft after returning from another request',
    );
    expect(
      find.text(
        'A reply could not be confirmed. Check this history before trying again.',
      ),
      findsOneWidget,
    );
    expect(
      find.text('Your reply was added to the private history.'),
      findsNothing,
    );
    expect(client.detailRequestIds, <String>[
      _requestId,
      _secondRequestId,
      _requestId,
    ]);
  });

  testWidgets(
    'switching kind clears detail loading and keeps the account scoped',
    (tester) async {
      final client = _RacingDetailClient();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
          child: const MaterialApp(home: SupportFeedbackScreen()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('First history row'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('First history row'));
      await tester.pump();
      expect(client.pendingDetails.keys, contains(_requestId));
      await tester.scrollUntilVisible(
        find.bySemanticsLabel('Loading private request details'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.drag(find.byType(ListView), const Offset(0, 2000));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Feedback and suggestions').first);
      await tester.pumpAndSettle();
      expect(client.listedKinds.last, 'suggestion');
      expect(
        find.bySemanticsLabel('Loading private request details'),
        findsNothing,
      );
      expect(find.text('First history row'), findsNothing);
    },
  );

  testWidgets('suggestion entry begins in suggestion history', (tester) async {
    final client = _FakeSupportFeedbackClient('Synthetic suggestion entry');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
        child: const MaterialApp(
          home: SupportFeedbackScreen(initialKind: 'suggestion'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(client.listedKinds, <String>['suggestion']);
    expect(find.text('What would you improve?'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Synthetic suggestion entry suggestion'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Synthetic suggestion entry suggestion'), findsOneWidget);
  });

  testWidgets('back confirms before discarding an in-memory draft', (
    tester,
  ) async {
    final client = _FakeSupportFeedbackClient('Synthetic leave guard');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
        child: const MaterialApp(home: SupportFeedbackScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField).first,
      'Unsent private title',
    );
    await Navigator.of(
      tester.element(find.byType(SupportFeedbackScreen)),
    ).maybePop();
    await tester.pumpAndSettle();
    expect(find.text('Leave support?'), findsOneWidget);
    await tester.tap(find.text('Stay here'));
    await tester.pumpAndSettle();
    expect(find.text('Leave support?'), findsNothing);
    expect(
      tester.widget<TextField>(find.byType(TextField).first).controller!.text,
      'Unsent private title',
    );
  });

  testWidgets('switching request type confirms before clearing a draft', (
    tester,
  ) async {
    final client = _FakeSupportFeedbackClient('Synthetic kind switch');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
        child: const MaterialApp(home: SupportFeedbackScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField).first,
      'Unsent private problem title',
    );

    await tester.tap(find.text('Feedback and suggestions'));
    await tester.pumpAndSettle();
    expect(find.text('Switch request type?'), findsOneWidget);
    await tester.tap(find.text('Stay with draft'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(find.byType(TextField).first).controller!.text,
      'Unsent private problem title',
    );
    expect(find.text('Report a problem'), findsNWidgets(2));

    await tester.tap(find.text('Feedback and suggestions'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Discard and switch'));
    await tester.pumpAndSettle();
    expect(find.text('What would you improve?'), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byType(TextField).first).controller!.text,
      isEmpty,
    );
    expect(client.listedKinds, contains('suggestion'));
  });

  testWidgets(
    'switching request type confirms before clearing a category choice',
    (tester) async {
      final client = _FakeSupportFeedbackClient('Synthetic category switch');
      await tester.pumpWidget(
        ProviderScope(
          overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
          child: const MaterialApp(home: SupportFeedbackScreen()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('performance'));
      await tester.pumpAndSettle();
      expect(find.text('performance'), findsOneWidget);

      await tester.tap(find.text('Feedback and suggestions'));
      await tester.pumpAndSettle();
      expect(find.text('Switch request type?'), findsOneWidget);
      await tester.tap(find.text('Stay with draft'));
      await tester.pumpAndSettle();
      expect(find.text('performance'), findsOneWidget);

      await tester.tap(find.text('Feedback and suggestions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Discard and switch'));
      await tester.pumpAndSettle();
      expect(find.text('What would you improve?'), findsOneWidget);
      expect(find.text('performance'), findsNothing);
    },
  );

  testWidgets('disposing the screen cancels pending API work', (tester) async {
    final client = _FakeSupportFeedbackClient(
      'Synthetic disposal',
      deferNextList: true,
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          supportFeedbackClientProvider.overrideWith((ref) {
            ref.onDispose(client.cancelPending);
            return client;
          }),
        ],
        child: const MaterialApp(home: SupportFeedbackScreen()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(client.listedKinds, <String>['problem']);
    await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    await tester.pump();
    expect(client.cancellations, greaterThan(0));
  });

  testWidgets('narrow screens and large text keep support controls usable', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final client = _FakeSupportFeedbackClient('Synthetic accessible layout');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [supportFeedbackClientProvider.overrideWithValue(client)],
        child: const MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(textScaler: TextScaler.linear(2)),
            child: SupportFeedbackScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Report a problem'), findsNWidgets(2));
    expect(find.text('Feedback and suggestions'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
