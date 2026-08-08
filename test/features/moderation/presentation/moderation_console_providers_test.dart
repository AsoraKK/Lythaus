import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/moderation/domain/moderation_case.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/features/moderation/presentation/providers/moderation_console_providers.dart';

class _MockModerationRepository extends Mock implements ModerationRepository {}

void main() {
  late ModerationRepository repository;

  setUpAll(() {
    registerFallbackValue(const ModerationFilters());
    registerFallbackValue(const ModerationAuditSearchFilters());
    registerFallbackValue(
      const ModerationDecisionInput(
        action: ModerationDecisionAction.remove,
        rationale: 'fallback',
      ),
    );
    registerFallbackValue(
      const ModerationEscalationInput(
        reason: 'fallback',
        targetQueue: 'Trust & Safety',
      ),
    );
  });

  setUp(() {
    repository = _MockModerationRepository();
  });

  test('moderation queue loads items and respects pagination', () async {
    final response = ModerationQueueResponse(
      items: [
        ModerationQueueItem(
          id: 'case-1',
          type: ModerationItemType.flag,
          contentId: 'post-1',
          contentType: 'post',
          contentPreview: 'Unsafe text',
          createdAt: DateTime.now(),
          severity: ModerationSeverityLevel.high,
          status: 'open',
          queue: 'default',
          reportCount: 3,
          communityVotes: 12,
          isEscalated: false,
        ),
      ],
      pagination: const ModerationQueuePagination(
        page: 1,
        pageSize: 20,
        total: 1,
        hasMore: false,
      ),
    );

    when(
      () => repository.fetchModerationQueue(
        page: 1,
        pageSize: 20,
        filters: any(named: 'filters'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async => response);

    final container = ProviderContainer(
      overrides: [
        moderationRepositoryProvider.overrideWithValue(repository),
        jwtProvider.overrideWith((ref) => Future.value('token')),
      ],
    );
    addTearDown(container.dispose);

    final notifier = container.read(moderationQueueProvider.notifier);
    await notifier.refresh();

    final state = container.read(moderationQueueProvider);
    expect(state.items, hasLength(1));
    expect(state.items.first.id, equals('case-1'));
    expect(state.hasMore, isFalse);
    expect(state.errorMessage, isNull);
  });

  test('case notifier loads case and submits decision', () async {
    final audit = ModerationAuditEntry(
      id: 'audit-1',
      caseId: 'case-1',
      timestamp: DateTime.now(),
      actorId: 'mod-1',
      actorRole: 'moderator',
      action: ModerationAuditActionType.decision,
      details: 'Initial review',
    );

    final sampleCase = ModerationCase(
      id: 'case-1',
      type: ModerationItemType.flag,
      contentId: 'content-1',
      contentType: 'post',
      contentTitle: 'Sample post',
      contentText: 'Bad content',
      status: 'open',
      queue: 'default',
      severity: ModerationSeverityLevel.medium,
      createdAt: DateTime.now().subtract(const Duration(hours: 3)),
      updatedAt: DateTime.now(),
      reports: [const ModerationReport(reason: 'Harassment', count: 2)],
      aiSignals: const ['Likely AI-generated'],
      auditTrail: [audit],
      decisionHistory: const [],
    );

    when(
      () => repository.fetchModerationCase(
        caseId: 'case-1',
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async => sampleCase);

    when(
      () => repository.submitModerationDecision(
        caseId: 'case-1',
        token: any(named: 'token'),
        input: any(named: 'input'),
      ),
    ).thenAnswer((_) async => const ModerationDecisionResult(success: true));

    final container = ProviderContainer(
      overrides: [
        moderationRepositoryProvider.overrideWithValue(repository),
        jwtProvider.overrideWith((ref) => Future.value('token')),
      ],
    );
    addTearDown(container.dispose);

    final notifier = container.read(moderationCaseProvider('case-1').notifier);
    await notifier.loadCase();

    final state = container.read(moderationCaseProvider('case-1'));
    expect(state.caseDetail?.id, equals('case-1'));
    expect(state.caseDetail?.contentText, equals('Bad content'));

    await notifier.submitDecision(
      const ModerationDecisionInput(
        action: ModerationDecisionAction.remove,
        rationale: 'Remove for policy',
      ),
    );

    final updatedState = container.read(moderationCaseProvider('case-1'));
    expect(updatedState.decisionSubmitting, isFalse);
    expect(updatedState.errorMessage, isNull);
  });
}
