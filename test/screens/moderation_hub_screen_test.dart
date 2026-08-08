import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/state/models/moderation.dart';
import 'package:lythaus/state/providers/moderation_providers.dart';
import 'package:lythaus/ui/screens/mod/moderation_hub.dart';

void main() {
  testWidgets('moderation hub renders queue, appeals, and stats', (
    tester,
  ) async {
    final queue = [
      ModerationCase(
        id: 'case-1',
        anonymizedContent: 'Possible scam link',
        reason: 'Scam check',
        aiConfidence: 0.72,
        decision: ModerationDecision.pending,
        submittedAt: DateTime(2024, 1, 1),
        xpReward: 10,
      ),
    ];
    const appeals = [
      AppealCase(
        id: 'appeal-1',
        authorStatement: 'Please review my appeal',
        evidence: 'Screenshot provided',
        votesFor: 4,
        votesAgainst: 1,
        weightFor: 0.8,
        weightAgainst: 0.2,
        decision: ModerationDecision.pending,
      ),
    ];
    const stats = ModerationStats(
      queueSize: 3,
      appealOpen: 1,
      decisionsToday: 5,
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          moderationQueueProvider.overrideWith((ref) => queue),
          appealsProvider.overrideWith((ref) => appeals),
          moderationStatsProvider.overrideWith((ref) => stats),
        ],
        child: const MaterialApp(home: ModerationHubScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Moderation Hub'), findsOneWidget);
    expect(find.text('Review Queue'), findsOneWidget);
    expect(find.text('Scam check'), findsOneWidget);

    final appealsTab = find.widgetWithText(Tab, 'Appeals');
    await tester.tap(appealsTab);
    await tester.pumpAndSettle();
    expect(find.text('Please review my appeal'), findsOneWidget);

    final historyTab = find.widgetWithText(Tab, 'History');
    await tester.tap(historyTab);
    await tester.pumpAndSettle();
    expect(find.text('No moderation history yet'), findsOneWidget);

    final statsTab = find.widgetWithText(Tab, 'Stats');
    await tester.tap(statsTab);
    await tester.pumpAndSettle();
    expect(find.text('Decisions today'), findsOneWidget);
    expect(find.text('5'), findsOneWidget);
  });
}
