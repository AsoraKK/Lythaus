import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart' as api;
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_session_revision.dart';
import 'package:lythaus/features/rewards/application/reward_providers.dart';
import 'package:lythaus/features/rewards/domain/monthly_reputation_presentation.dart';
import 'package:lythaus/ui/screens/rewards/monthly_reputation_widgets.dart';
import 'package:lythaus/design_system/index.dart';
import '../../../support/monthly_rewards_fixture.dart';

Widget _app(
  List<Override> overrides, {
  bool tracker = true,
  double textScale = 1,
}) => ProviderScope(
  overrides: overrides,
  child: MaterialApp(
    theme: LythausTheme.light(),
    home: Scaffold(
      body: MediaQuery(
        data: MediaQueryData(
          textScaler: TextScaler.linear(textScale),
          disableAnimations: true,
        ),
        child: ListView(
          children: [
            if (tracker)
              const MonthlyReputationTrackerCard()
            else
              const MonthlyReputationReportCard(),
          ],
        ),
      ),
    ),
  ),
);

void main() {
  testWidgets('reader-shaped v1 shadow snapshot is explicitly unconfirmed', (
    tester,
  ) async {
    final wire = monthlySnapshotStatusWire(revision: 2);
    expect((wire['snapshot'] as Map).containsKey('mode'), false);
    await tester.pumpWidget(
      _app([
        ...monthlyFixtureOverrides(),
        monthlyRewardsViewProvider.overrideWith(
          (ref) async => monthlyStatus(wire: wire),
        ),
      ]),
    );
    await tester.pumpAndSettle();
    expect(find.text('Monthly level in shadow'), findsOneWidget);
    expect(find.text('Shadow level 3 · not confirmed.'), findsOneWidget);
    expect(find.textContaining('not a confirmed entitlement'), findsOneWidget);
    expect(find.textContaining('source score: 4,000'), findsOneWidget);
    expect(
      find.text('Snapshot revision 2 · source revision 2.'),
      findsOneWidget,
    );
    expect(find.text('Level 3 confirmed'), findsNothing);
  });
  testWidgets(
    'reader-shaped prepared v2 shadow supplies no live score or level',
    (tester) async {
      await tester.pumpWidget(
        _app([
          ...monthlyFixtureOverrides(),
          monthlyRewardsViewProvider.overrideWith(
            (ref) async => monthlyStatus(
              wire: monthlySnapshotStatusWire(
                policyVersion: 'lythaus-monthly-rewards-2026-10-v2',
                sourceScore: 13650,
                level: 5,
              ),
            ),
          ),
        ]),
      );
      await tester.pumpAndSettle();
      expect(find.text('Monthly level in shadow'), findsOneWidget);
      expect(find.textContaining('projection unavailable'), findsOneWidget);
      expect(find.textContaining('13,650'), findsNothing);
      expect(find.textContaining('level 5'), findsNothing);
      expect(find.text('Level 5 confirmed'), findsNothing);
    },
  );
  for (final state in ['unavailable', 'pending']) {
    testWidgets('reader-shaped $state snapshot has no inferred authority', (
      tester,
    ) async {
      final wire = monthlyStatusWire()
        ..['snapshot'] = {
          'state': state,
          'reasonCode': state == 'unavailable'
              ? 'before_policy_cutover'
              : 'no_previous_assessment',
          'effectiveMonth': '2026-10',
          if (state == 'pending') ...{
            'level': 1,
            'levelKind': 'unassessed_default',
            'sourceScore': null,
            'sourceMonth': null,
            'snapshotId': null,
            'revision': 0,
            'policyVersion': 'lythaus-monthly-rewards-2026-10-v1',
          },
        };
      if (state == 'pending') wire['currentLevel'] = 1;
      await tester.pumpWidget(
        _app([
          ...monthlyFixtureOverrides(),
          monthlyRewardsViewProvider.overrideWith(
            (ref) async => monthlyStatus(wire: wire),
          ),
        ]),
      );
      await tester.pumpAndSettle();
      expect(find.text('Monthly level pending'), findsOneWidget);
      expect(find.text('Level 1 confirmed'), findsNothing);
      expect(find.textContaining('source score:'), findsNothing);
      expect(
        find.textContaining(
          state == 'unavailable'
              ? 'before the approved policy cutover'
              : 'unassessed default',
        ),
        findsOneWidget,
      );
      if (state == 'unavailable') {
        expect(find.text('Snapshot unavailable.'), findsOneWidget);
      }
    });
  }
  testWidgets(
    'reader-shaped corrected confirmed snapshot retains fixed source',
    (tester) async {
      await tester.pumpWidget(
        _app([
          ...monthlyFixtureOverrides(),
          monthlyRewardsViewProvider.overrideWith(
            (ref) async => monthlyStatus(
              wire: monthlySnapshotStatusWire(state: 'confirmed', revision: 2),
            ),
          ),
          monthlyReputationReportProvider.overrideWith(
            (ref, month) async => monthlyReport(
              month,
              detail: {
                'sourceRevision': 3,
                'total': {'sourceScore': 12000, 'maximumSourceMonth': 13500},
              },
            ),
          ),
        ]),
      );
      await tester.pumpAndSettle();
      expect(find.text('Level 3 confirmed'), findsOneWidget);
      expect(find.textContaining('source score: 4,000'), findsOneWidget);
      expect(find.textContaining('source assessment: 12,000'), findsOneWidget);
      expect(
        find.text('Snapshot revision 2 · source revision 2.'),
        findsOneWidget,
      );
    },
  );
  testWidgets(
    'fixture-only prepared snapshot is never used as live authority',
    (tester) async {
      final wire = monthlyStatusWire()
        ..['preparedResponse'] = {
          ...monthlyDisabledReadiness,
          'responseKind': 'monthly_rewards',
          'state': 'pending',
          'effectiveMonth': '2026-10',
          'currentLevel': null,
          'sourceMonth': null,
          'sourceScore': null,
          'snapshot': {
            'state': 'unavailable',
            'reasonCode': 'activation_not_approved',
          },
          'selection': {
            'state': 'unavailable',
            'reasonCode': 'approval_unavailable',
          },
          'snapshotProjection': {
            'state': 'shadow',
            'reasonCode': null,
            'effectiveMonth': '2026-10',
            'sourceMonth': '2026-09',
            'sourceScore': 13650,
            'level': 5,
            'sourceRevision': 1,
            'snapshotRevision': 1,
          },
        };
      await tester.pumpWidget(
        _app([
          ...monthlyFixtureOverrides(),
          monthlyRewardsViewProvider.overrideWith(
            (ref) async => monthlyStatus(wire: wire),
          ),
        ]),
      );
      await tester.pumpAndSettle();
      expect(find.text('Monthly level pending'), findsOneWidget);
      expect(find.text('Level 5 confirmed'), findsNothing);
      expect(find.textContaining('source score: 13,650'), findsNothing);
      expect(find.textContaining('Prospective maximum:'), findsNothing);
    },
  );
  test('missing, fractional and negative evidence remain unknown', () {
    for (final value in [null, -1, 2.5, '300']) {
      expect(evidencePoints(value), 'Unknown');
    }
    expect(evidencePoints(0), '0');
    expect(evidencePoints(2.0), '2');
    expect(evidencePoints(double.infinity), 'Unknown');
    expect(evidencePoints(double.nan), 'Unknown');
    expect(evidenceDate(null), 'Unknown date');
    expect(evidenceDate('invalid'), 'Unknown date');
    expect(evidenceMonth(null), 'Unknown month');
    expect(evidenceMonth('2026-13'), 'Unknown month');
  });
  testWidgets(
    'confirmed source stays distinct from current progress and disabled maximum',
    (tester) async {
      await tester.pumpWidget(
        _app([
          ...monthlyFixtureOverrides(),
          monthlyRewardsViewProvider.overrideWith(
            (ref) async => monthlyStatus(confirmed: true),
          ),
          monthlyReputationReportProvider.overrideWith(
            (ref, month) async => monthlyReport(
              month,
              detail: {
                'total': {'sourceScore': 8000, 'maximumSourceMonth': 13500},
              },
            ),
          ),
        ]),
      );
      await tester.pumpAndSettle();
      expect(find.text('Level 3 confirmed'), findsOneWidget);
      expect(find.textContaining('source score: 4,000'), findsOneWidget);
      expect(find.textContaining('source assessment: 8,000'), findsOneWidget);
      expect(find.textContaining('projection unavailable'), findsOneWidget);
      expect(find.textContaining('Prospective maximum:'), findsNothing);
      await tester.tap(find.text('Disabled v2 methodology'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Prospective maximum: 13,650'),
        findsOneWidget,
      );
      expect(
        find.textContaining('No earlier credit and no carry'),
        findsOneWidget,
      );
      expect(find.text('Level 5 confirmed'), findsNothing);
    },
  );
  testWidgets('unassessed default is never presented as confirmed', (
    tester,
  ) async {
    final wire = monthlyStatusWire()..['currentLevel'] = 1;
    await tester.pumpWidget(
      _app([
        ...monthlyFixtureOverrides(),
        monthlyRewardsViewProvider.overrideWith(
          (ref) async => monthlyStatus(wire: wire),
        ),
      ]),
    );
    await tester.pumpAndSettle();
    expect(find.text('Monthly level pending'), findsOneWidget);
    expect(find.text('Level 1 confirmed'), findsNothing);
    final semantics = tester.ensureSemantics();
    try {
      expect(find.bySemanticsLabel('Monthly level pending'), findsOneWidget);
    } finally {
      semantics.dispose();
    }
  });
  testWidgets('loading is explicit and unavailable retry recovers', (
    tester,
  ) async {
    final result = Completer<api.MonthlyRewardsMeResponse>();
    var calls = 0;
    await tester.pumpWidget(
      _app([
        ...monthlyFixtureOverrides(),
        monthlyRewardsViewProvider.overrideWith((ref) async {
          calls++;
          return calls == 1 ? result.future : monthlyStatus();
        }),
      ]),
    );
    await tester.pump();
    expect(find.text('Loading your private monthly status…'), findsOneWidget);
    result.completeError(StateError('private server detail'));
    await tester.pumpAndSettle();
    expect(find.textContaining('private server detail'), findsNothing);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.text('Monthly level pending'), findsOneWidget);
  });
  testWidgets('guests do not subscribe to private monthly data', (
    tester,
  ) async {
    var reads = 0;
    await tester.pumpWidget(
      _app([
        ...monthlyFixtureOverrides(),
        guestModeProvider.overrideWith((ref) => true),
        monthlyRewardsViewProvider.overrideWith((ref) async {
          reads++;
          return monthlyStatus(confirmed: true);
        }),
      ]),
    );
    await tester.pumpAndSettle();
    expect(reads, 0);
    expect(find.textContaining('Sign in'), findsOneWidget);
    expect(find.text('Level 3 confirmed'), findsNothing);
  });
  testWidgets('account switch hides previous status while replacement loads', (
    tester,
  ) async {
    final next = Completer<api.MonthlyRewardsMeResponse>();
    await tester.pumpWidget(
      _app([
        ...monthlyFixtureOverrides(),
        monthlyRewardsViewProvider.overrideWith((ref) async {
          ref.watch(authSessionRevisionProvider);
          return ref.watch(currentUserProvider)?.id == 'owner-a'
              ? monthlyStatus(confirmed: true)
              : next.future;
        }),
      ]),
    );
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(MonthlyReputationTrackerCard)),
    );
    container.read(monthlyTestSession.notifier).state = monthlyTestUser(
      'owner-b',
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Level 3 confirmed'), findsNothing);
    expect(find.text('Loading your private monthly status…'), findsOneWidget);
    next.complete(monthlyStatus());
    await tester.pumpAndSettle();
    container.read(monthlyTestSession.notifier).state = null;
    await tester.pumpAndSettle();
    expect(find.textContaining('Sign in'), findsOneWidget);
    expect(find.text('Monthly level pending'), findsNothing);
  });
  testWidgets(
    '200 percent narrow report exposes cap groups, omitted weeks and corrections',
    (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final semantics = tester.ensureSemantics();
      try {
        await tester.pumpWidget(
          _app(
            [
              ...monthlyFixtureOverrides(),
              monthlyReputationReportProvider.overrideWith(
                (ref, month) async => monthlyReport(
                  month,
                  detail: {
                    'sourceRevision': 2,
                    'sourceRecordedAt': null,
                    'total': {'sourceScore': 4000, 'maximumSourceMonth': 13500},
                    'weekly': {
                      'points': 2500,
                      'maximumSelectedWeeklyPoints': 10000,
                      'selectedWeeks': <Object?>[],
                      'omittedWeeks': [
                        {
                          'points': 500,
                          'state': 'corrected',
                          'startsAt': null,
                          'endsAt': null,
                        },
                      ],
                    },
                    'monthly': {
                      'points': 1000,
                      'maximumPoints': 2500,
                      'actions': [
                        {
                          'actionId': 'monthly.profile',
                          'capGroup': 'profile',
                          'points': null,
                          'allowance': 1000,
                          'remainingInGroup': null,
                          'validFrom': null,
                          'validUntil': null,
                        },
                      ],
                    },
                  },
                  corrections: {
                    'sourceRevisions': [
                      {'revision': 2, 'recordedAt': null, 'sourceScore': 4000},
                    ],
                    'effectiveSnapshots': <Object?>[],
                  },
                ),
              ),
            ],
            tracker: false,
            textScale: 2,
          ),
        );
        await tester.pumpAndSettle();
        final container = ProviderScope.containerOf(
          tester.element(find.byType(MonthlyReputationReportCard)),
        );
        await container.read(
          monthlyReputationReportProvider(monthlyTestMonth()).future,
        );
        for (final title in [
          'Omitted weeks',
          'Monthly action evidence',
          'Corrections',
        ]) {
          await tester.scrollUntilVisible(
            find.text(title),
            250,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.pumpAndSettle();
          await tester.tap(find.text(title));
          await tester.pumpAndSettle();
        }
        expect(find.textContaining('Cap group: profile'), findsOneWidget);
        expect(find.textContaining('Unknown points'), findsOneWidget);
        expect(find.textContaining('Unknown date'), findsWidgets);
        expect(find.textContaining('Source revision 2'), findsOneWidget);
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        expect(FocusManager.instance.primaryFocus, isNotNull);
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    },
  );
  testWidgets(
    'unknown report policy does not substitute v2 score or enable export',
    (tester) async {
      final wire = monthlyReportWire(
        monthlyTestMonth(),
        detail: {
          'total': {'sourceScore': 13650, 'maximumSourceMonth': 13650},
        },
      )..['policyVersion'] = 'future-policy';
      await tester.pumpWidget(
        _app([
          ...monthlyFixtureOverrides(),
          monthlyReputationReportProvider.overrideWith(
            (ref, month) async => monthlyReport(month, wire: wire),
          ),
        ], tracker: false),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining('report policy is unavailable'),
        findsOneWidget,
      );
      expect(find.textContaining('Source score: 13,650'), findsNothing);
      expect(
        tester
            .widget<OutlinedButton>(
              find.widgetWithText(OutlinedButton, 'Export CSV'),
            )
            .onPressed,
        isNull,
      );
    },
  );
}
