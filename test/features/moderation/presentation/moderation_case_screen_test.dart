import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/moderation/domain/moderation_case.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/moderation_case_screen.dart';

class MockModerationRepository extends Mock implements ModerationRepository {}

void main() {
  setUpAll(() {
    registerFallbackValue(
      const ModerationDecisionInput(
        action: ModerationDecisionAction.allow,
        rationale: 'ok',
      ),
    );
    registerFallbackValue(
      const ModerationEscalationInput(
        reason: 'reason',
        targetQueue: 'Policy QA',
      ),
    );
  });

  testWidgets('moderation case screen renders and escalates', (tester) async {
    final repo = MockModerationRepository();
    final caseDetail = ModerationCase(
      id: 'case-1',
      type: ModerationItemType.flag,
      contentId: 'content-1',
      contentType: 'post',
      contentText: 'content text',
      status: 'open',
      queue: 'default',
      severity: ModerationSeverityLevel.low,
      createdAt: DateTime(2024, 1, 1),
      updatedAt: DateTime(2024, 1, 2),
      reports: const [ModerationReport(reason: 'spam', count: 1)],
      aiSignals: const [],
      auditTrail: [
        ModerationAuditEntry(
          id: 'audit-1',
          caseId: 'case-1',
          timestamp: DateTime(2024, 1, 1),
          actorId: 'mod-1',
          actorRole: 'moderator',
          action: ModerationAuditActionType.decision,
          details: 'approved',
        ),
      ],
      decisionHistory: [
        ModerationDecisionHistory(
          action: 'allow',
          actor: 'mod-1',
          timestamp: DateTime(2024, 1, 1),
          rationale: 'ok',
        ),
      ],
      appealDetails: const ModerationAppealDetails(
        appealId: 'appeal-1',
        summary: 'appeal summary',
        overturnVotes: 2,
        upholdVotes: 1,
      ),
    );

    when(
      () => repo.fetchModerationCase(
        caseId: any(named: 'caseId'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async => caseDetail);

    when(
      () => repo.submitModerationDecision(
        caseId: any(named: 'caseId'),
        token: any(named: 'token'),
        input: any(named: 'input'),
      ),
    ).thenAnswer((_) async => const ModerationDecisionResult(success: true));

    when(
      () => repo.escalateModerationCase(
        caseId: any(named: 'caseId'),
        token: any(named: 'token'),
        input: any(named: 'input'),
      ),
    ).thenAnswer((_) async {});

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'token'),
        ],
        child: const MaterialApp(home: ModerationCaseScreen(caseId: 'case-1')),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Moderation Case'), findsOneWidget);
    expect(find.text('Content'), findsOneWidget);
    expect(find.text('Appeal & Community vote'), findsOneWidget);

    final escalateCase = find.text('Escalate Case');
    await tester.ensureVisible(escalateCase);
    await tester.tap(escalateCase);
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).last, 'needs review');
    await tester.tap(find.text('Escalate'));
    await tester.pumpAndSettle();

    verify(
      () => repo.escalateModerationCase(
        caseId: 'case-1',
        token: 'token',
        input: any(named: 'input'),
      ),
    ).called(1);
  });
}
