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

class _MockRepo extends Mock implements ModerationRepository {}

ModerationCase _buildCase({
  bool withMedia = false,
  bool withAppeal = false,
  bool emptyReports = false,
}) => ModerationCase(
  id: 'case-1',
  type: ModerationItemType.flag,
  contentId: 'c-1',
  contentType: 'post',
  contentText: 'Sample content text',
  status: 'open',
  queue: 'default',
  severity: ModerationSeverityLevel.low,
  createdAt: DateTime(2024),
  updatedAt: DateTime(2024),
  mediaUrl: withMedia ? 'https://example.com/img.png' : null,
  reports: emptyReports
      ? const []
      : const [ModerationReport(reason: 'spam', count: 2)],
  aiSignals: const [],
  auditTrail: [
    ModerationAuditEntry(
      id: 'a-1',
      caseId: 'case-1',
      timestamp: DateTime(2024),
      actorId: 'mod-1',
      actorRole: 'moderator',
      action: ModerationAuditActionType.decision,
      details: 'ok',
    ),
  ],
  decisionHistory: const [],
  appealDetails: withAppeal
      ? const ModerationAppealDetails(
          appealId: 'ap-1',
          summary: 'User appealed',
          overturnVotes: 5,
          upholdVotes: 3,
        )
      : null,
);

void main() {
  setUpAll(() {
    registerFallbackValue(
      const ModerationDecisionInput(
        action: ModerationDecisionAction.allow,
        rationale: 'ok',
      ),
    );
    registerFallbackValue(
      const ModerationEscalationInput(reason: 'r', targetQueue: 'Legal'),
    );
  });

  Widget buildWidget(_MockRepo repo) {
    return ProviderScope(
      overrides: [
        moderationRepositoryProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => 'test-token'),
      ],
      child: const MaterialApp(home: ModerationCaseScreen(caseId: 'case-1')),
    );
  }

  testWidgets('shows error when fetch fails and caseDetail is null', (
    tester,
  ) async {
    final repo = _MockRepo();
    when(
      () => repo.fetchModerationCase(
        caseId: any(named: 'caseId'),
        token: any(named: 'token'),
      ),
    ).thenAnswer(
      (_) => Future.error(const ModerationException('Network error')),
    );

    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(buildWidget(repo));
    await tester.pumpAndSettle();

    expect(find.text('Network error'), findsOneWidget);
  });

  testWidgets('renders header chips and content panel', (tester) async {
    final repo = _MockRepo();
    when(
      () => repo.fetchModerationCase(
        caseId: any(named: 'caseId'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async => _buildCase());

    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(buildWidget(repo));
    await tester.pumpAndSettle();

    // Header
    expect(find.text('POST'), findsOneWidget);
    expect(find.text('open'), findsOneWidget);
    expect(find.text('default'), findsOneWidget);
    // Content panel
    expect(find.text('Content'), findsOneWidget);
    expect(find.text('Sample content text'), findsOneWidget);
    // Report section
    expect(find.text('Reports'), findsOneWidget);
    expect(find.text('spam'), findsOneWidget);
  });

  testWidgets('renders case with empty reports', (tester) async {
    final repo = _MockRepo();
    when(
      () => repo.fetchModerationCase(
        caseId: any(named: 'caseId'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async => _buildCase(emptyReports: true));

    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(buildWidget(repo));
    await tester.pumpAndSettle();

    expect(find.text('No detailed reports available.'), findsOneWidget);
  });

  testWidgets('renders case without appeal details', (tester) async {
    final repo = _MockRepo();
    when(
      () => repo.fetchModerationCase(
        caseId: any(named: 'caseId'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async => _buildCase(withAppeal: false));

    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(buildWidget(repo));
    await tester.pumpAndSettle();

    // No appeal section should appear
    expect(find.text('Appeal & Community vote'), findsNothing);
    // But regular sections should be present
    expect(find.text('Content'), findsOneWidget);
    expect(find.text('Reports'), findsOneWidget);
    expect(find.text('Audit trail'), findsOneWidget);
  });

  testWidgets('renders case with appeal details showing votes', (tester) async {
    final repo = _MockRepo();
    when(
      () => repo.fetchModerationCase(
        caseId: any(named: 'caseId'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async => _buildCase(withAppeal: true));

    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(buildWidget(repo));
    await tester.pumpAndSettle();

    expect(find.text('Appeal & Community vote'), findsOneWidget);
    expect(find.text('User appealed'), findsOneWidget);
    expect(find.text('Overturn: 5'), findsOneWidget);
    expect(find.text('Uphold: 3'), findsOneWidget);
  });

  testWidgets('escalation dialog validates empty reason', (tester) async {
    final repo = _MockRepo();
    when(
      () => repo.fetchModerationCase(
        caseId: any(named: 'caseId'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async => _buildCase());

    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(buildWidget(repo));
    await tester.pumpAndSettle();

    // Tap Escalate Case button
    final escalateBtn = find.text('Escalate Case');
    await tester.ensureVisible(escalateBtn);
    await tester.tap(escalateBtn);
    await tester.pumpAndSettle();

    // Tap Escalate without entering reason
    await tester.tap(find.text('Escalate'));
    await tester.pumpAndSettle();

    // Should show error snackbar
    expect(find.text('Please provide a reason.'), findsOneWidget);
  });

  testWidgets('escalation dialog cancel closes dialog', (tester) async {
    final repo = _MockRepo();
    when(
      () => repo.fetchModerationCase(
        caseId: any(named: 'caseId'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async => _buildCase());

    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(buildWidget(repo));
    await tester.pumpAndSettle();

    final escalateBtn = find.text('Escalate Case');
    await tester.ensureVisible(escalateBtn);
    await tester.tap(escalateBtn);
    await tester.pumpAndSettle();

    // Cancel should close dialog
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    // Dialog is closed, main screen still visible
    expect(find.text('Content'), findsOneWidget);
  });
}
