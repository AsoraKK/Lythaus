import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/reward_models.dart';
import 'package:lythaus/ui/screens/rewards/monthly_reputation_widgets.dart';

import '../../../golden_test_utils.dart';
import '../../../helpers/inactive_state_screenshot_capture.dart';

final _session = StateProvider<User?>((ref) => null);
final _captureKey = GlobalKey();

Map<String, dynamic> _response({
  String snapshotState = 'confirmed',
  String selectionState = 'pending',
}) => {
  'state': selectionState == 'ready' ? 'ready' : 'pending',
  'reasonCode': 'approval_unavailable',
  'effectiveMonth': '2026-10',
  'currentLevel': snapshotState == 'confirmed' ? 4 : null,
  'sourceMonth': snapshotState == 'confirmed' ? '2026-09' : null,
  'sourceScore': snapshotState == 'confirmed' ? 6000 : null,
  'snapshot': {
    'state': snapshotState,
    'reasonCode': switch (snapshotState) {
      'pending' => 'no_previous_assessment',
      'unavailable' => 'approval_unavailable',
      _ => 'source_month_assessed',
    },
    'effectiveMonth': '2026-10',
    'sourceMonth': snapshotState == 'pending' ? null : '2026-09',
    'sourceScore': snapshotState == 'pending' ? null : 6000,
    'level': snapshotState == 'pending' ? 1 : 4,
    if (snapshotState == 'pending') 'levelKind': 'unassessed_default',
    'policyVersion': 'lythaus-monthly-rewards-2026-10-v1',
  },
  'selection': {'state': selectionState, 'reasonCode': 'approval_unavailable'},
};

final _tracker = MaterialApp(
  home: Scaffold(
    body: RepaintBoundary(
      key: _captureKey,
      child: const SingleChildScrollView(child: MonthlyReputationTrackerCard()),
    ),
  ),
);

Widget _withResponse(Map<String, dynamic> payload) => ProviderScope(
  overrides: [
    monthlyRewardsViewProvider.overrideWith(
      (ref) async => MonthlyRewardsView.fromJson(payload),
    ),
  ],
  child: _tracker,
);

Widget _withReport(
  Future<Map<String, dynamic>> Function(String sourceMonth) handler,
) => ProviderScope(
  overrides: [
    monthlyReputationReportProvider.overrideWith(
      (ref, sourceMonth) => handler(sourceMonth),
    ),
  ],
  child: const MaterialApp(
    home: Scaffold(
      body: SingleChildScrollView(child: MonthlyReputationReportCard()),
    ),
  ),
);

User _user(String id) => User(
  id: id,
  email: '$id@example.invalid',
  role: UserRole.user,
  tier: UserTier.bronze,
  reputationScore: 0,
  createdAt: DateTime.utc(2026),
  lastLoginAt: DateTime.utc(2026),
);

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Map<String, dynamic> payload) => ResponseBody.fromString(
  jsonEncode(payload),
  200,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);

void main() {
  setUpAll(loadFontsForGoldenTests);

  testWidgets('pending default Level 1 is never labelled confirmed', (
    tester,
  ) async {
    final payload = _response(snapshotState: 'pending')..['currentLevel'] = 1;
    await tester.pumpWidget(_withResponse(payload));
    await tester.pumpAndSettle();
    expect(find.text('Monthly level pending'), findsOneWidget);
    expect(
      find.textContaining('first server-assessed source month'),
      findsOneWidget,
    );
    expect(find.textContaining('confirmed'), findsNothing);
    expect(find.textContaining('source score:'), findsNothing);
  });

  testWidgets('unavailable assessment is not labelled pending', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 420));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      _withResponse(_response(snapshotState: 'unavailable')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Monthly level unavailable'), findsOneWidget);
    expect(
      find.textContaining('unavailable while owner approval is pending'),
      findsOneWidget,
    );
    expect(find.text('Monthly level pending'), findsNothing);
    expect(find.textContaining('source score:'), findsNothing);
    await captureInactiveStateScreenshot(
      tester,
      _captureKey,
      'monthly-level-unavailable',
    );
  });

  testWidgets('report config absence remains pending owner approval', (
    tester,
  ) async {
    await tester.pumpWidget(
      _withReport(
        (_) async => {
          'reportState': 'pending',
          'reasonCode': 'report_unavailable',
          'sourceMonth': '2026-09',
          'effectiveMonth': '2026-10',
          'policyVersion': 'lythaus-monthly-rewards-2026-10-v1',
          'levelAuthority': {
            'state': 'unavailable',
            'reasonCode': 'approval_unavailable',
            'effectiveMonth': '2026-10',
            'sourceMonth': null,
            'sourceScore': null,
            'level': null,
            'levelKind': null,
          },
          'corrections': {'sourceRevisions': [], 'effectiveSnapshots': []},
          'report': null,
        },
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('pending owner approval'), findsOneWidget);
    expect(
      find.textContaining('No score or entitlement has been activated.'),
      findsOneWidget,
    );
    expect(find.textContaining('unavailable right now'), findsNothing);
  });

  testWidgets('report request failure uses the supported unavailable view', (
    tester,
  ) async {
    await tester.pumpWidget(
      _withReport((_) async => throw StateError('Synthetic transport failure')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Your private monthly report is unavailable right now.'),
      findsOneWidget,
    );
    expect(find.text('Retry'), findsOneWidget);
    expect(find.textContaining('pending owner approval'), findsNothing);
  });

  testWidgets('unavailable activation gate keeps its pending-approval reason', (
    tester,
  ) async {
    final payload = _response(snapshotState: 'unavailable')
      ..['reasonCode'] = 'activation_not_approved';
    (payload['snapshot'] as Map<String, dynamic>)['reasonCode'] =
        'activation_not_approved';
    await tester.pumpWidget(_withResponse(payload));
    await tester.pumpAndSettle();
    expect(find.text('Monthly level unavailable'), findsOneWidget);
    expect(find.textContaining('pending activation approval'), findsOneWidget);
    expect(
      find.textContaining(
        'No monthly level or reward entitlement is confirmed.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('confirmed month and pending reward selection stay separate', (
    tester,
  ) async {
    await tester.pumpWidget(_withResponse(_response()));
    await tester.pumpAndSettle();
    expect(find.text('Level 4 confirmed'), findsOneWidget);
    expect(find.textContaining('fixed for 2026-10'), findsOneWidget);
    expect(find.textContaining('Reward selection is pending.'), findsOneWidget);
    expect(find.textContaining('6000 of 13,500'), findsOneWidget);
  });

  testWidgets('unavailable reward selection is not labelled pending', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 420));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      _withResponse(_response(selectionState: 'unavailable')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Level 4 confirmed'), findsOneWidget);
    expect(
      find.textContaining('Reward selection is unavailable'),
      findsOneWidget,
    );
    expect(find.textContaining('Reward selection is pending.'), findsNothing);
    await captureInactiveStateScreenshot(
      tester,
      _captureKey,
      'monthly-level-confirmed-selection-unavailable',
    );
  });

  testWidgets('shadow snapshot shows its fixed period without confirmation', (
    tester,
  ) async {
    await tester.pumpWidget(_withResponse(_response(snapshotState: 'shadow')));
    await tester.pumpAndSettle();
    expect(find.text('Shadow level 4'), findsOneWidget);
    expect(
      find.textContaining('shadow projection for 2026-10'),
      findsOneWidget,
    );
    expect(
      find.textContaining(
        'does not confirm a monthly level or activate rewards',
      ),
      findsOneWidget,
    );
    expect(find.text('Level 4 confirmed'), findsNothing);
    expect(find.textContaining('6000 of 13,500'), findsOneWidget);
  });

  testWidgets('explicit v2 preparation shows the supported shadow ceiling', (
    tester,
  ) async {
    final payload = _response(snapshotState: 'shadow')
      ..addAll({
        'responseVersion': 'monthly-rewards-response-v2-preparation',
        'responseKind': 'monthly_rewards',
        'policyVersion': 'lythaus-monthly-rewards-2026-10-v2',
        'catalogueHash':
            '26213abccce99ee51be6c0623406c28aaa7d39ed3ea3b4ac630b7cffd859db67',
        'dataVersion': 2,
        'preparationOnly': true,
        'runtimeActivationAllowed': false,
        'appliedPoints': 0,
        'maximumSourceMonth': 13650,
        'snapshot': {'state': 'unavailable'},
        'snapshotProjection': {
          'state': 'shadow',
          'effectiveMonth': '2026-10',
          'sourceMonth': '2026-09',
          'sourceScore': 13650,
          'level': 5,
        },
      });
    await tester.pumpWidget(_withResponse(payload));
    await tester.pumpAndSettle();
    expect(find.text('Shadow level 5'), findsOneWidget);
    expect(find.textContaining('13650 of 13,650'), findsOneWidget);
    expect(find.text('Level 5 confirmed'), findsNothing);
  });

  test(
    'account changes discard cached and late monthly confirmations',
    () async {
      final delayedA = Completer<ResponseBody>();
      final delayedB = Completer<ResponseBody>();
      final refreshStarted = Completer<void>();
      final accountBStarted = Completer<void>();
      var accountARequests = 0;
      final adapter = _Adapter((request) {
        if (request.headers['Authorization'] == 'Bearer session-account-a') {
          if (++accountARequests == 1) return Future.value(_json(_response()));
          refreshStarted.complete();
          return delayedA.future;
        }
        accountBStarted.complete();
        return delayedB.future;
      });
      final dio = Dio(BaseOptions(baseUrl: 'https://test.lythaus.invalid'))
        ..httpClientAdapter = adapter;
      final container = ProviderContainer(
        overrides: [
          _session.overrideWith((ref) => _user('account-a')),
          authSessionRevisionProvider.overrideWith(
            (ref) => AuthSessionRevision(ref.read(_session.notifier)),
          ),
          currentUserProvider.overrideWith((ref) => ref.watch(_session)),
          jwtProvider.overrideWith((ref) async {
            final user = ref.watch(currentUserProvider);
            return user == null ? null : 'session-${user.id}';
          }),
          secureDioProvider.overrideWithValue(dio),
        ],
      );
      addTearDown(container.dispose);
      final subscription = container.listen(
        monthlyRewardsViewProvider,
        (_, _) {},
      );
      addTearDown(subscription.close);
      final accountA = await container.read(monthlyRewardsViewProvider.future);
      expect(accountA.hasConfirmedLevel, isTrue);
      container.refresh(monthlyRewardsViewProvider.future).ignore();
      await refreshStarted.future.timeout(const Duration(seconds: 1));
      expect(accountARequests, 2);
      final oldRequest = adapter.requests.last;
      container.read(_session.notifier).state = _user('account-b');
      expect(oldRequest.cancelToken!.isCancelled, isTrue);
      final accountBFuture = container.read(monthlyRewardsViewProvider.future);
      await accountBStarted.future.timeout(const Duration(seconds: 1));
      bool displaysConfirmation() => container
          .read(monthlyRewardsViewProvider)
          .when(
            data: (view) => view.hasConfirmedLevel,
            loading: () => false,
            error: (_, _) => false,
          );
      expect(displaysConfirmation(), isFalse);
      expect(
        adapter.requests.last.headers['Authorization'],
        'Bearer session-account-b',
      );
      delayedA.complete(_json(_response()));
      await Future<void>.delayed(Duration.zero);
      expect(displaysConfirmation(), isFalse);
      delayedB.complete(_json(_response(snapshotState: 'pending')));
      final accountB = await accountBFuture;
      expect(accountB.hasConfirmedLevel, isFalse);
      expect(accountB.snapshot.reasonCode, 'no_previous_assessment');
      expect(accountB.snapshot.sourceScore, isNull);
      container.read(_session.notifier).state = null;
      await expectLater(
        container.read(monthlyRewardsViewProvider.future),
        throwsA(isA<StateError>()),
      );
      expect(displaysConfirmation(), isFalse);
      expect(adapter.requests, hasLength(3));
    },
  );
}
