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
}
