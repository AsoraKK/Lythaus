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

class _MockRepo extends Mock implements ModerationRepository {}

ModerationCase _fakeCase({String id = 'case-1'}) => ModerationCase(
  id: id,
  type: ModerationItemType.flag,
  contentId: 'content-1',
  contentType: 'post',
  contentText: 'some text',
  status: 'open',
  queue: 'default',
  severity: ModerationSeverityLevel.high,
  createdAt: DateTime(2024),
  updatedAt: DateTime(2024),
  reports: const [],
  aiSignals: const [],
  auditTrail: const [],
  decisionHistory: const [],
);

void main() {
  setUpAll(() {
    registerFallbackValue(const ModerationFilters());
    registerFallbackValue(const ModerationAuditSearchFilters());
    registerFallbackValue(
      const ModerationDecisionInput(
        action: ModerationDecisionAction.allow,
        rationale: 'test',
      ),
    );
    registerFallbackValue(
      const ModerationEscalationInput(reason: 'r', targetQueue: 'q'),
    );
  });

  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 200));

  // ---------- ModerationQueueNotifier ----------

  group('ModerationQueueNotifier', () {
    test('ModerationException error path', () async {
      final repo = _MockRepo();
      when(
        () => repo.fetchModerationQueue(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          filters: any(named: 'filters'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) => Future.error(const ModerationException('queue error')),
      );

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationQueueState? last;
      container.listen(moderationQueueProvider, (_, next) => last = next);
      await settle();

      expect(last!.errorMessage, 'queue error');
      expect(last!.isLoading, false);
    });

    test('generic error path', () async {
      final repo = _MockRepo();
      when(
        () => repo.fetchModerationQueue(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          filters: any(named: 'filters'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) => Future.error(Exception('oops')));

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationQueueState? last;
      container.listen(moderationQueueProvider, (_, next) => last = next);
      await settle();

      expect(last!.errorMessage, 'Unable to load moderation queue.');
    });

    test('successful loads merges items + telemetry', () async {
      final repo = _MockRepo();
      when(
        () => repo.fetchModerationQueue(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          filters: any(named: 'filters'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => ModerationQueueResponse(
          items: [
            ModerationQueueItem(
              id: 'q1',
              type: ModerationItemType.flag,
              contentId: 'c1',
              contentType: 'post',
              contentPreview: 'preview',
              severity: ModerationSeverityLevel.high,
              status: 'pending',
              queue: 'default',
              reportCount: 1,
              communityVotes: 0,
              isEscalated: false,
              createdAt: DateTime(2024),
            ),
          ],
          pagination: const ModerationQueuePagination(
            page: 1,
            pageSize: 20,
            total: 1,
            hasMore: false,
          ),
        ),
      );

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationQueueState? last;
      container.listen(moderationQueueProvider, (_, next) => last = next);
      await settle();

      expect(last!.items.length, 1);
      expect(last!.hasMore, false);
      expect(last!.isLoading, false);
    });
  });

  // ---------- ModerationCaseNotifier ----------

  group('ModerationCaseNotifier', () {
    test('loadCase success', () async {
      final repo = _MockRepo();
      when(
        () => repo.fetchModerationCase(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _fakeCase());

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationCaseState? last;
      container.listen(
        moderationCaseProvider('case-1'),
        (_, next) => last = next,
      );
      await settle();

      expect(last!.caseDetail, isNotNull);
      expect(last!.caseDetail!.id, 'case-1');
      expect(last!.isLoading, false);
    });

    test('loadCase ModerationException', () async {
      final repo = _MockRepo();
      when(
        () => repo.fetchModerationCase(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) => Future.error(const ModerationException('case error')),
      );

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationCaseState? last;
      container.listen(moderationCaseProvider('c1'), (_, next) => last = next);
      await settle();

      expect(last!.errorMessage, 'case error');
    });

    test('loadCase generic error', () async {
      final repo = _MockRepo();
      when(
        () => repo.fetchModerationCase(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) => Future.error(Exception('boom')));

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationCaseState? last;
      container.listen(moderationCaseProvider('c1'), (_, next) => last = next);
      await settle();

      expect(last!.errorMessage, 'Unable to load case details.');
    });

    test('submitDecision success', () async {
      final repo = _MockRepo();
      when(
        () => repo.fetchModerationCase(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _fakeCase());
      when(
        () => repo.submitModerationDecision(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
          input: any(named: 'input'),
        ),
      ).thenAnswer(
        (_) async =>
            const ModerationDecisionResult(success: true, caseId: 'c1'),
      );

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationCaseState? last;
      container.listen(moderationCaseProvider('c1'), (_, next) => last = next);
      await settle();
      expect(last!.caseDetail, isNotNull);

      await container
          .read(moderationCaseProvider('c1').notifier)
          .submitDecision(
            const ModerationDecisionInput(
              action: ModerationDecisionAction.remove,
              rationale: 'violation',
            ),
          );

      expect(last!.decisionSubmitting, false);
    });

    test('submitDecision ModerationException', () async {
      final repo = _MockRepo();
      when(
        () => repo.fetchModerationCase(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _fakeCase());
      when(
        () => repo.submitModerationDecision(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
          input: any(named: 'input'),
        ),
      ).thenAnswer((_) => Future.error(const ModerationException('dec error')));

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationCaseState? last;
      container.listen(moderationCaseProvider('c1'), (_, next) => last = next);
      await settle();

      await container
          .read(moderationCaseProvider('c1').notifier)
          .submitDecision(
            const ModerationDecisionInput(
              action: ModerationDecisionAction.remove,
              rationale: 'test',
            ),
          );

      expect(last!.errorMessage, 'dec error');
    });

    test('submitDecision generic error', () async {
      final repo = _MockRepo();
      when(
        () => repo.fetchModerationCase(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _fakeCase());
      when(
        () => repo.submitModerationDecision(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
          input: any(named: 'input'),
        ),
      ).thenAnswer((_) => Future.error(Exception('x')));

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationCaseState? last;
      container.listen(moderationCaseProvider('c1'), (_, next) => last = next);
      await settle();

      await container
          .read(moderationCaseProvider('c1').notifier)
          .submitDecision(
            const ModerationDecisionInput(
              action: ModerationDecisionAction.allow,
              rationale: 't',
            ),
          );

      expect(last!.errorMessage, 'Unable to submit decision.');
    });

    test('escalate success', () async {
      final repo = _MockRepo();
      when(
        () => repo.fetchModerationCase(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _fakeCase());
      when(
        () => repo.escalateModerationCase(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
          input: any(named: 'input'),
        ),
      ).thenAnswer((_) async {});

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationCaseState? last;
      container.listen(moderationCaseProvider('c1'), (_, next) => last = next);
      await settle();

      await container
          .read(moderationCaseProvider('c1').notifier)
          .escalate(
            const ModerationEscalationInput(
              reason: 'needs senior',
              targetQueue: 'escalated',
            ),
          );

      expect(last!.escalating, false);
    });

    test('escalate ModerationException', () async {
      final repo = _MockRepo();
      when(
        () => repo.fetchModerationCase(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _fakeCase());
      when(
        () => repo.escalateModerationCase(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
          input: any(named: 'input'),
        ),
      ).thenAnswer((_) => Future.error(const ModerationException('esc error')));

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationCaseState? last;
      container.listen(moderationCaseProvider('c1'), (_, next) => last = next);
      await settle();

      await container
          .read(moderationCaseProvider('c1').notifier)
          .escalate(
            const ModerationEscalationInput(reason: 'r', targetQueue: 'q'),
          );

      expect(last!.errorMessage, 'esc error');
    });

    test('escalate generic error', () async {
      final repo = _MockRepo();
      when(
        () => repo.fetchModerationCase(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async => _fakeCase());
      when(
        () => repo.escalateModerationCase(
          caseId: any(named: 'caseId'),
          token: any(named: 'token'),
          input: any(named: 'input'),
        ),
      ).thenAnswer((_) => Future.error(Exception('z')));

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationCaseState? last;
      container.listen(moderationCaseProvider('c1'), (_, next) => last = next);
      await settle();

      await container
          .read(moderationCaseProvider('c1').notifier)
          .escalate(
            const ModerationEscalationInput(reason: 'r', targetQueue: 'q'),
          );

      expect(last!.errorMessage, 'Unable to escalate case.');
    });
  });

  // ---------- ModerationAuditNotifier ----------

  group('ModerationAuditNotifier', () {
    test('search success', () async {
      final repo = _MockRepo();
      when(
        () => repo.searchAudit(
          filters: any(named: 'filters'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) async => const ModerationAuditResponse(
          entries: [],
          pagination: ModerationAuditPagination(
            page: 1,
            pageSize: 20,
            total: 0,
            hasMore: false,
          ),
        ),
      );

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationAuditState? last;
      container.listen(moderationAuditProvider, (_, next) => last = next);
      await settle();

      expect(last!.isLoading, false);
      expect(last!.entries, isEmpty);
    });

    test('search ModerationException', () async {
      final repo = _MockRepo();
      when(
        () => repo.searchAudit(
          filters: any(named: 'filters'),
          token: any(named: 'token'),
        ),
      ).thenAnswer(
        (_) => Future.error(const ModerationException('audit fail')),
      );

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationAuditState? last;
      container.listen(moderationAuditProvider, (_, next) => last = next);
      await settle();

      expect(last!.errorMessage, 'audit fail');
    });

    test('search generic error', () async {
      final repo = _MockRepo();
      when(
        () => repo.searchAudit(
          filters: any(named: 'filters'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) => Future.error(Exception('x')));

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationAuditState? last;
      container.listen(moderationAuditProvider, (_, next) => last = next);
      await settle();

      expect(last!.errorMessage, 'Unable to load audit results.');
    });

    test('loadMore appends entries', () async {
      final repo = _MockRepo();
      var callCount = 0;
      when(
        () => repo.searchAudit(
          filters: any(named: 'filters'),
          token: any(named: 'token'),
        ),
      ).thenAnswer((_) async {
        callCount++;
        if (callCount == 1) {
          return ModerationAuditResponse(
            entries: [
              ModerationAuditEntry(
                id: 'a1',
                caseId: 'c1',
                timestamp: DateTime(2024),
                actorId: 'mod',
                actorRole: 'moderator',
                action: ModerationAuditActionType.decision,
                details: 'ok',
              ),
            ],
            pagination: const ModerationAuditPagination(
              page: 1,
              pageSize: 1,
              total: 2,
              hasMore: true,
            ),
          );
        }
        return ModerationAuditResponse(
          entries: [
            ModerationAuditEntry(
              id: 'a2',
              caseId: 'c2',
              timestamp: DateTime(2024),
              actorId: 'mod',
              actorRole: 'moderator',
              action: ModerationAuditActionType.escalation,
              details: 'esc',
            ),
          ],
          pagination: const ModerationAuditPagination(
            page: 2,
            pageSize: 1,
            total: 2,
            hasMore: false,
          ),
        );
      });

      final container = ProviderContainer(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      );
      addTearDown(container.dispose);

      ModerationAuditState? last;
      container.listen(moderationAuditProvider, (_, next) => last = next);
      await settle();

      expect(last!.entries.length, 1);
      expect(last!.hasMore, true);

      await container.read(moderationAuditProvider.notifier).loadMore();

      expect(last!.entries.length, 2);
      expect(last!.hasMore, false);
    });
  });
}
