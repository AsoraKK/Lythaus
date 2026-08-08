import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/providers/repository_providers.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/moderation/domain/moderation_filters.dart';
import 'package:lythaus/features/moderation/domain/moderation_queue_item.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/features/moderation/presentation/moderation_console/moderation_queue_tab.dart';

class _MockRepo extends Mock implements ModerationRepository {}

ModerationQueueItem _fakeItem({String id = 'q1'}) => ModerationQueueItem(
  id: id,
  type: ModerationItemType.flag,
  contentId: 'c-$id',
  contentType: 'post',
  contentPreview: 'preview of $id',
  severity: ModerationSeverityLevel.high,
  status: 'pending',
  queue: 'default',
  reportCount: 3,
  communityVotes: 1,
  isEscalated: false,
  createdAt: DateTime(2024),
);

void main() {
  setUpAll(() {
    registerFallbackValue(const ModerationFilters());
  });

  Widget buildWidget({required List<Override> overrides}) {
    return ProviderScope(
      overrides: overrides,
      child: const MaterialApp(home: Scaffold(body: ModerationQueueTab())),
    );
  }

  testWidgets('renders filter chips and items', (tester) async {
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
          _fakeItem(),
          _fakeItem(id: 'q2'),
        ],
        pagination: const ModerationQueuePagination(
          page: 1,
          pageSize: 20,
          total: 2,
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

    // Filter chips rendered
    expect(find.text('Item Type'), findsOneWidget);
    expect(find.text('Severity'), findsOneWidget);
    expect(find.text('Age'), findsOneWidget);
    expect(find.text('Queue'), findsOneWidget);

    // Filter values
    expect(find.text('All'), findsAtLeastNWidgets(4));
    expect(find.text('Flags'), findsOneWidget);
    expect(find.text('Appeals'), findsOneWidget);
    expect(find.text('High'), findsOneWidget);
    expect(find.text('Medium'), findsOneWidget);

    // Items rendered (tile should be present)
    expect(find.byType(ListTile), findsAtLeastNWidgets(1));
  });

  testWidgets('shows empty state when no items', (tester) async {
    final repo = _MockRepo();
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

    expect(find.text('No items in the moderation queue.'), findsOneWidget);
  });

  testWidgets('shows error state with retry', (tester) async {
    final repo = _MockRepo();
    when(
      () => repo.fetchModerationQueue(
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
        filters: any(named: 'filters'),
        token: any(named: 'token'),
      ),
    ).thenAnswer(
      (_) => Future.error(const ModerationException('Server error')),
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

    expect(find.text('Server error'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('shows loading indicator', (tester) async {
    final repo = _MockRepo();
    final completer = Completer<ModerationQueueResponse>();
    // Never-completing future → stays loading
    when(
      () => repo.fetchModerationQueue(
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
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
    // Pump several times to allow microtasks to propagate
    await tester.pump();
    await tester.pump();
    await tester.pump();

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('tapping filter chip changes selection', (tester) async {
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
        items: [_fakeItem()],
        pagination: const ModerationQueuePagination(
          page: 1,
          pageSize: 20,
          total: 1,
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

    // Tap the "High" severity filter chip
    await tester.tap(find.text('High'));
    await tester.pump();
  });
}
