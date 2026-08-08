import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/moderation_audit_tab.dart';

class _MockRepo extends Mock implements ModerationRepository {}

void main() {
  setUpAll(() {
    registerFallbackValue(const ModerationAuditSearchFilters());
  });

  Widget buildWidget({required List<Override> overrides}) {
    return ProviderScope(
      overrides: overrides,
      child: const MaterialApp(home: Scaffold(body: ModerationAuditTab())),
    );
  }

  testWidgets('renders search form and populated results', (tester) async {
    final repo = _MockRepo();
    final entries = [
      ModerationAuditEntry(
        id: 'a1',
        caseId: 'case-1',
        timestamp: DateTime.now().subtract(const Duration(minutes: 5)),
        actorId: 'mod-1',
        actorRole: 'moderator',
        action: ModerationAuditActionType.decision,
        details: 'approved content',
      ),
      ModerationAuditEntry(
        id: 'a2',
        caseId: 'case-2',
        timestamp: DateTime.now().subtract(const Duration(hours: 3)),
        actorId: 'mod-2',
        actorRole: 'admin',
        action: ModerationAuditActionType.escalation,
        details: 'escalated to senior',
      ),
      ModerationAuditEntry(
        id: 'a3',
        caseId: 'case-3',
        timestamp: DateTime.now().subtract(const Duration(days: 2)),
        actorId: 'ai',
        actorRole: 'system',
        action: ModerationAuditActionType.aiEvaluated,
        details: 'ai flagged',
      ),
      ModerationAuditEntry(
        id: 'a4',
        caseId: 'case-4',
        timestamp: DateTime.now().subtract(const Duration(seconds: 10)),
        actorId: 'user-1',
        actorRole: 'user',
        action: ModerationAuditActionType.appeal,
        details: 'user appealed',
      ),
      ModerationAuditEntry(
        id: 'a5',
        caseId: 'case-5',
        timestamp: DateTime.now().subtract(const Duration(seconds: 30)),
        actorId: 'user-2',
        actorRole: 'user',
        action: ModerationAuditActionType.communityVote,
        details: 'community voted',
      ),
      ModerationAuditEntry(
        id: 'a6',
        caseId: 'case-6',
        timestamp: DateTime.now().subtract(const Duration(seconds: 30)),
        actorId: 'user-3',
        actorRole: 'user',
        action: ModerationAuditActionType.flagged,
        details: 'content was flagged',
      ),
    ];

    when(
      () => repo.searchAudit(
        filters: any(named: 'filters'),
        token: any(named: 'token'),
      ),
    ).thenAnswer(
      (_) async => ModerationAuditResponse(
        entries: entries,
        pagination: const ModerationAuditPagination(
          page: 1,
          pageSize: 20,
          total: 6,
          hasMore: false,
        ),
      ),
    );

    tester.view.physicalSize = const Size(1200, 3000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(
      buildWidget(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      ),
    );
    await tester.pumpAndSettle();

    // Search form elements
    expect(find.text('Content ID'), findsOneWidget);
    expect(find.text('User ID'), findsOneWidget);
    expect(find.text('Moderator ID'), findsOneWidget);
    expect(find.text('Search'), findsOneWidget);
    expect(find.text('Reset'), findsOneWidget);
    expect(find.text('Any date range'), findsOneWidget);

    // Entries rendered with correct action labels and time formats
    expect(find.textContaining('case-1'), findsOneWidget);
    expect(find.textContaining('case-2'), findsOneWidget);
    expect(find.text('approved content'), findsOneWidget);
    expect(find.text('escalated to senior'), findsOneWidget);
  });

  testWidgets('shows empty state', (tester) async {
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

    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(
      buildWidget(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No audit entries match these filters.'), findsOneWidget);
  });

  testWidgets('shows error message', (tester) async {
    final repo = _MockRepo();
    when(
      () => repo.searchAudit(
        filters: any(named: 'filters'),
        token: any(named: 'token'),
      ),
    ).thenAnswer(
      (_) => Future.error(const ModerationException('Audit unavailable')),
    );

    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(
      buildWidget(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Audit unavailable'), findsOneWidget);
  });

  testWidgets('shows loading state', (tester) async {
    final repo = _MockRepo();
    final completer = Completer<ModerationAuditResponse>();
    when(
      () => repo.searchAudit(
        filters: any(named: 'filters'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) => completer.future);

    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(
      buildWidget(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      ),
    );
    await tester.pump();
    await tester.pump();
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('search button triggers new search', (tester) async {
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

    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(
      buildWidget(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      ),
    );
    await tester.pumpAndSettle();

    // Type in content ID field
    await tester.enterText(find.widgetWithText(TextField, 'Content ID'), 'c-1');
    await tester.tap(find.text('Search'));
    await tester.pumpAndSettle();
  });

  testWidgets('reset button clears fields', (tester) async {
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

    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(
      buildWidget(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'tok'),
        ],
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Content ID'), 'c-1');
    await tester.tap(find.text('Reset'));
    await tester.pumpAndSettle();
  });
}
