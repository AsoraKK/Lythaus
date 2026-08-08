import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/analytics/analytics_client.dart';
import 'package:lythaus/core/analytics/analytics_providers.dart';
import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/moderation/domain/moderation_audit_entry.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/moderation_console_screen.dart';

class _MockAnalytics extends Mock implements AnalyticsClient {}

class _MockRepo extends Mock implements ModerationRepository {}

class _MockAuthService extends Mock implements AuthService {}

User _adminUser() => User(
  id: 'u1',
  email: 'admin@test.com',
  role: UserRole.admin,
  tier: UserTier.gold,
  reputationScore: 100,
  createdAt: DateTime(2024),
  lastLoginAt: DateTime(2024),
);

void main() {
  setUpAll(() {
    registerFallbackValue(const ModerationFilters());
    registerFallbackValue(const ModerationAuditSearchFilters());
  });

  Widget buildScreen({
    required _MockAnalytics analytics,
    required _MockRepo repo,
    required _MockAuthService authService,
  }) {
    return ProviderScope(
      overrides: [
        analyticsClientProvider.overrideWithValue(analytics),
        moderationRepositoryProvider.overrideWithValue(repo),
        jwtProvider.overrideWith((ref) async => 'tok'),
        enhancedAuthServiceProvider.overrideWithValue(authService),
      ],
      child: const MaterialApp(home: ModerationConsoleScreen()),
    );
  }

  testWidgets('renders all three tabs when user is admin', (tester) async {
    final analytics = _MockAnalytics();
    final repo = _MockRepo();
    final authService = _MockAuthService();

    when(
      () => analytics.logEvent(any(), properties: any(named: 'properties')),
    ).thenAnswer((_) async {});
    when(() => analytics.logEvent(any())).thenAnswer((_) async {});
    when(
      () => authService.getCurrentUser(),
    ).thenAnswer((_) async => _adminUser());

    when(
      () => repo.fetchModerationQueue(
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
        filters: any(named: 'filters'),
        token: any(named: 'token'),
      ),
    ).thenAnswer(
      (_) async => const ModerationQueueResponse(
        items: [],
        pagination: ModerationQueuePagination(
          page: 1,
          pageSize: 20,
          total: 0,
          hasMore: false,
        ),
      ),
    );
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
      buildScreen(analytics: analytics, repo: repo, authService: authService),
    );
    await tester.pumpAndSettle();

    expect(find.text('Queue'), findsAtLeastNWidgets(1));
    expect(find.text('Audit'), findsAtLeastNWidgets(1));
    expect(find.text('Insights'), findsAtLeastNWidgets(1));
    expect(find.text('Moderation Console'), findsOneWidget);
  });

  testWidgets('Insights tab renders placeholder', (tester) async {
    final analytics = _MockAnalytics();
    final repo = _MockRepo();
    final authService = _MockAuthService();

    when(
      () => analytics.logEvent(any(), properties: any(named: 'properties')),
    ).thenAnswer((_) async {});
    when(() => analytics.logEvent(any())).thenAnswer((_) async {});
    when(
      () => authService.getCurrentUser(),
    ).thenAnswer((_) async => _adminUser());
    when(
      () => repo.fetchModerationQueue(
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
        filters: any(named: 'filters'),
        token: any(named: 'token'),
      ),
    ).thenAnswer(
      (_) async => const ModerationQueueResponse(
        items: [],
        pagination: ModerationQueuePagination(
          page: 1,
          pageSize: 20,
          total: 0,
          hasMore: false,
        ),
      ),
    );
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
      buildScreen(analytics: analytics, repo: repo, authService: authService),
    );
    await tester.pumpAndSettle();

    // Switch to Insights tab
    await tester.tap(find.text('Insights'));
    await tester.pumpAndSettle();

    // Insights tab now shows operational dashboard (no longer a placeholder)
    expect(find.text('Operational insights'), findsOneWidget);
    expect(find.textContaining('Track moderation load'), findsOneWidget);
  });
}
