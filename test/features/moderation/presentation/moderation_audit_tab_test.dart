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

class MockModerationRepository extends Mock implements ModerationRepository {}

void main() {
  setUpAll(() {
    registerFallbackValue(const ModerationAuditSearchFilters());
  });

  testWidgets('moderation audit tab renders entries', (tester) async {
    final repo = MockModerationRepository();
    final entry = ModerationAuditEntry(
      id: 'audit-1',
      caseId: 'case-1',
      timestamp: DateTime(2024, 1, 1),
      actorId: 'mod-1',
      actorRole: 'moderator',
      action: ModerationAuditActionType.decision,
      details: 'approved',
    );

    when(
      () => repo.searchAudit(
        filters: any(named: 'filters'),
        token: any(named: 'token'),
      ),
    ).thenAnswer(
      (_) async => ModerationAuditResponse(
        entries: [entry],
        pagination: const ModerationAuditPagination(
          page: 1,
          pageSize: 20,
          total: 1,
          hasMore: false,
        ),
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          moderationRepositoryProvider.overrideWithValue(repo),
          jwtProvider.overrideWith((ref) async => 'token'),
        ],
        child: const MaterialApp(home: Scaffold(body: ModerationAuditTab())),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Search'), findsOneWidget);
    expect(find.textContaining('case-1'), findsOneWidget);
    expect(find.text('approved'), findsOneWidget);
  });
}
