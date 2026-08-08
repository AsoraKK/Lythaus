/// Unit tests for moderation providers and appeal service.
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/services/appeal_provider.dart';
import 'package:lythaus/state/models/moderation.dart';
import 'package:lythaus/state/providers/moderation_providers.dart';

class _MockDio extends Mock implements Dio {}

void main() {
  setUpAll(() {
    registerFallbackValue(Options());
  });

  // ── moderationQueueProvider ─────────────────────────────────────────────────
  group('moderationQueueProvider', () {
    test('initial value is empty list', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      expect(container.read(moderationQueueProvider), isEmpty);
    });

    test('can be mutated via notifier', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final fakeCase = ModerationCase(
        id: 'c1',
        anonymizedContent: 'test',
        reason: 'spam',
        aiConfidence: 0.9,
        decision: ModerationDecision.pending,
        submittedAt: DateTime.utc(2024),
      );

      container.read(moderationQueueProvider.notifier).state = [fakeCase];
      expect(container.read(moderationQueueProvider), hasLength(1));
      expect(container.read(moderationQueueProvider).first.id, 'c1');
    });
  });

  // ── appealsProvider ─────────────────────────────────────────────────────────
  group('appealsProvider', () {
    test('initial value is empty list', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      expect(container.read(appealsProvider), isEmpty);
    });
  });

  // ── moderationStatsProvider ─────────────────────────────────────────────────
  group('moderationStatsProvider', () {
    test('default stats have zero values', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final stats = container.read(moderationStatsProvider);
      expect(stats.queueSize, 0);
      expect(stats.appealOpen, 0);
      expect(stats.decisionsToday, 0);
    });
  });

  // ── AppealService ──────────────────────────────────────────────────────────
  group('AppealService', () {
    test('submit returns false when access token is null', () async {
      final container = ProviderContainer(
        overrides: [jwtProvider.overrideWith((ref) async => null)],
      );
      addTearDown(container.dispose);

      final service = container.read(appealProvider);
      final result = await service.submit('case-1', 'statement');
      expect(result, isFalse);
    });

    test('submit returns true on successful POST', () async {
      final mockDio = _MockDio();

      when(
        () => mockDio.post<void>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<void>(
          requestOptions: RequestOptions(path: '/appeals'),
          statusCode: 200,
        ),
      );

      final container = ProviderContainer(
        overrides: [
          jwtProvider.overrideWith((ref) async => 'tok'),
          secureDioProvider.overrideWithValue(mockDio),
        ],
      );
      addTearDown(container.dispose);

      final service = container.read(appealProvider);
      final result = await service.submit('case-1', 'I appeal this');
      expect(result, isTrue);
    });

    test('submit returns false on Dio exception', () async {
      final mockDio = _MockDio();

      when(
        () => mockDio.post<void>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/appeals'),
          message: 'Network error',
        ),
      );

      final container = ProviderContainer(
        overrides: [
          jwtProvider.overrideWith((ref) async => 'tok'),
          secureDioProvider.overrideWithValue(mockDio),
        ],
      );
      addTearDown(container.dispose);

      final service = container.read(appealProvider);
      final result = await service.submit('case-1', 'statement');
      expect(result, isFalse);
    });
  });
}
