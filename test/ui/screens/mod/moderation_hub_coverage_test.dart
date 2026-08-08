// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/state/models/moderation.dart';
import 'package:lythaus/state/providers/moderation_providers.dart';
import 'package:lythaus/ui/screens/mod/moderation_hub.dart';

void main() {
  Widget wrap({
    List<ModerationCase> queue = const [],
    List<AppealCase> appeals = const [],
    ModerationStats stats = const ModerationStats(
      queueSize: 0,
      appealOpen: 0,
      decisionsToday: 0,
    ),
  }) {
    return ProviderScope(
      overrides: [
        moderationQueueProvider.overrideWith((ref) => queue),
        appealsProvider.overrideWith((ref) => appeals),
        moderationStatsProvider.overrideWithValue(stats),
      ],
      child: const MaterialApp(home: ModerationHubScreen()),
    );
  }

  group('ModerationHubScreen', () {
    testWidgets('renders tabs and empty state', (tester) async {
      await tester.pumpWidget(wrap());
      expect(find.text('Moderation Hub'), findsOneWidget);
      expect(find.text('Review Queue'), findsOneWidget);
      expect(find.text('Appeals'), findsOneWidget);
      expect(find.text('History'), findsOneWidget);
      expect(find.text('Stats'), findsOneWidget);
    });

    testWidgets('renders queue items on first tab', (tester) async {
      final items = [
        ModerationCase(
          id: 'm1',
          anonymizedContent: 'Offensive comment',
          reason: 'Hate speech',
          aiConfidence: 0.95,
          decision: ModerationDecision.pending,
          submittedAt: DateTime.now(),
        ),
      ];
      await tester.pumpWidget(wrap(queue: items));
      await tester.pump();
      expect(find.text('Offensive comment'), findsOneWidget);
      expect(find.text('Hate speech'), findsOneWidget);
    });

    testWidgets('renders appeal items on second tab', (tester) async {
      final items = [
        const AppealCase(
          id: 'a1',
          authorStatement: 'I disagree with the decision',
          evidence: 'Here is my evidence',
          votesFor: 10,
          votesAgainst: 2,
          weightFor: 5.0,
          weightAgainst: 1.0,
          decision: ModerationDecision.pending,
        ),
      ];
      await tester.pumpWidget(wrap(appeals: items));
      await tester.pump();
      // Tap on Appeals tab
      await tester.tap(find.text('Appeals'));
      await tester.pumpAndSettle();
      expect(find.text('I disagree with the decision'), findsOneWidget);
    });

    testWidgets('renders stats on Stats tab', (tester) async {
      await tester.pumpWidget(
        wrap(
          stats: const ModerationStats(
            queueSize: 42,
            appealOpen: 7,
            decisionsToday: 15,
          ),
        ),
      );
      await tester.pump();
      await tester.tap(find.text('Stats'));
      await tester.pumpAndSettle();
      expect(find.text('42'), findsOneWidget);
      expect(find.text('7'), findsOneWidget);
      expect(find.text('15'), findsOneWidget);
    });

    testWidgets('renders history stub', (tester) async {
      await tester.pumpWidget(wrap());
      await tester.pump();
      await tester.tap(find.text('History'));
      await tester.pumpAndSettle();
      expect(find.text('No moderation history yet'), findsOneWidget);
      expect(find.text('Completed reviews will appear here.'), findsOneWidget);
    });
  });
}
