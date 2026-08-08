import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/moderation_console_screen.dart';

class _MockModerationRepository extends Mock implements ModerationRepository {}

class _TestAuthService extends AuthService {
  _TestAuthService(this.user);

  final User user;

  @override
  Future<User?> getCurrentUser() async => user;

  @override
  Future<String?> getJwtToken() async => 'token';
}

void main() {
  late ModerationRepository repository;

  setUpAll(() {
    registerFallbackValue(const ModerationFilters());
    registerFallbackValue(const ModerationAuditSearchFilters());
  });

  setUp(() {
    repository = _MockModerationRepository();
  });

  testWidgets('blocks non-moderators from the console', (tester) async {
    final user = User(
      id: 'u1',
      email: 'user@example.com',
      role: UserRole.user,
      tier: UserTier.bronze,
      reputationScore: 0,
      createdAt: DateTime.utc(2023, 1, 1),
      lastLoginAt: DateTime.utc(2023, 1, 2),
    );

    when(
      () => repository.fetchModerationQueue(
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
        filters: any(named: 'filters'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async {
      return const ModerationQueueResponse(
        items: [],
        pagination: ModerationQueuePagination(
          page: 1,
          pageSize: 20,
          total: 0,
          hasMore: false,
        ),
      );
    });

    when(
      () => repository.searchAudit(
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

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          enhancedAuthServiceProvider.overrideWith(
            (ref) => _TestAuthService(user),
          ),
          moderationRepositoryProvider.overrideWithValue(repository),
          jwtProvider.overrideWith((ref) => Future.value('token')),
        ],
        child: const MaterialApp(home: ModerationConsoleScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Moderator access required'), findsOneWidget);
  });

  testWidgets('shows moderation UI for moderators', (tester) async {
    final moderator = User(
      id: 'mod-1',
      email: 'mod@example.com',
      role: UserRole.moderator,
      tier: UserTier.gold,
      reputationScore: 500,
      createdAt: DateTime.utc(2022, 1, 1),
      lastLoginAt: DateTime.utc(2024, 1, 1),
    );

    final queueResponse = ModerationQueueResponse(
      items: [
        ModerationQueueItem(
          id: 'case-123',
          type: ModerationItemType.flag,
          contentId: 'post-123',
          contentType: 'post',
          contentPreview: 'Test preview',
          createdAt: DateTime.now(),
          severity: ModerationSeverityLevel.medium,
          status: 'open',
          queue: 'default',
          reportCount: 2,
          communityVotes: 5,
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
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
        filters: any(named: 'filters'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((_) async => queueResponse);

    when(
      () => repository.searchAudit(
        filters: any(named: 'filters'),
        token: any(named: 'token'),
      ),
    ).thenAnswer(
      (_) async => ModerationAuditResponse(
        entries: [
          ModerationAuditEntry(
            id: 'audit-1',
            caseId: 'case-123',
            timestamp: DateTime.now(),
            actorId: 'mod-1',
            actorRole: 'moderator',
            action: ModerationAuditActionType.decision,
            details: 'Decision logged',
          ),
        ],
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
          enhancedAuthServiceProvider.overrideWith(
            (ref) => _TestAuthService(moderator),
          ),
          moderationRepositoryProvider.overrideWithValue(repository),
          jwtProvider.overrideWith((ref) => Future.value('token')),
        ],
        child: const MaterialApp(home: ModerationConsoleScreen()),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('Moderation Console'), findsWidgets);
    expect(find.text('Queue'), findsWidgets);
    expect(find.text('Audit'), findsWidgets);
    expect(find.text('Test preview'), findsWidgets);
  });
}
