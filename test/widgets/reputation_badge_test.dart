import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/design_system/index.dart';
import 'package:lythaus/state/models/reputation.dart';
import 'package:lythaus/widgets/reputation_badge.dart';

void main() {
  const state = ReputationState(
    userId: 'user-1',
    level: 4,
    levelName: 'Credible',
    reputationStatus: 'active',
    reputationBand: 'earned',
    policyVersion: '2026-08',
    pillars: {},
    promotionBlockers: [],
  );

  testWidgets('renders the backend-issued label, not a score', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        home: const Scaffold(
          body: ReputationBadge(state: state, showLabel: true),
        ),
      ),
    );

    expect(find.text('Credible'), findsOneWidget);
    expect(find.byIcon(Icons.stars), findsOneWidget);
    expect(
      tester.getSemantics(find.byType(ReputationBadge)).label,
      contains('Credible'),
    );
  });

  testWidgets('wraps its visible label without losing accessible detail', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LythausTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: const Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: SizedBox(
              width: 80,
              child: ReputationBadge(
                state: state,
                size: ReputationBadgeSize.small,
                wrapLabel: true,
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.text('Level 4'), findsOneWidget);
    expect(
      tester.getSemantics(find.byType(ReputationBadge)).label,
      contains('Credible'),
    );
    expect(tester.takeException(), isNull);
  });
}
