// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/widgets/moderation_audit_timeline.dart';

void main() {
  Widget wrap(Widget child) => MaterialApp(
    home: Scaffold(body: SingleChildScrollView(child: child)),
  );

  ModerationAuditEntry entry(ModerationAuditActionType action) =>
      ModerationAuditEntry(
        id: 'e1',
        caseId: 'c1',
        timestamp: DateTime.now().subtract(const Duration(hours: 2)),
        actorId: 'actor-1',
        actorRole: 'moderator',
        action: action,
        details: 'Test detail',
      );

  group('ModerationAuditTimeline', () {
    testWidgets('shows empty message when no entries', (tester) async {
      await tester.pumpWidget(wrap(const ModerationAuditTimeline(entries: [])));
      expect(find.text('No audit history available.'), findsOneWidget);
    });

    testWidgets('renders escalation entry', (tester) async {
      await tester.pumpWidget(
        wrap(
          ModerationAuditTimeline(
            entries: [entry(ModerationAuditActionType.escalation)],
          ),
        ),
      );
      expect(find.text('Escalated • actor-1'), findsOneWidget);
      expect(find.text('Test detail'), findsOneWidget);
      expect(find.byIcon(Icons.arrow_upward), findsOneWidget);
    });

    testWidgets('renders appeal entry', (tester) async {
      await tester.pumpWidget(
        wrap(
          ModerationAuditTimeline(
            entries: [entry(ModerationAuditActionType.appeal)],
          ),
        ),
      );
      expect(find.text('Appeal • actor-1'), findsOneWidget);
      expect(find.byIcon(Icons.chat), findsOneWidget);
    });

    testWidgets('renders flagged entry', (tester) async {
      await tester.pumpWidget(
        wrap(
          ModerationAuditTimeline(
            entries: [entry(ModerationAuditActionType.flagged)],
          ),
        ),
      );
      expect(find.text('Flagged • actor-1'), findsOneWidget);
      expect(find.byIcon(Icons.flag), findsOneWidget);
    });

    testWidgets('renders multiple entries with dividers', (tester) async {
      await tester.pumpWidget(
        wrap(
          ModerationAuditTimeline(
            entries: [
              entry(ModerationAuditActionType.flagged),
              entry(ModerationAuditActionType.aiEvaluated),
              entry(ModerationAuditActionType.communityVote),
              entry(ModerationAuditActionType.decision),
            ],
          ),
        ),
      );
      expect(find.text('Flagged • actor-1'), findsOneWidget);
      expect(find.text('AI signal • actor-1'), findsOneWidget);
      expect(find.text('Community vote • actor-1'), findsOneWidget);
      expect(find.text('Moderator decision • actor-1'), findsOneWidget);
      expect(find.byType(Divider), findsNWidgets(3));
    });
  });
}
