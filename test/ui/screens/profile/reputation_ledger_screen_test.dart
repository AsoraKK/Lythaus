/// Widget tests for ReputationLedgerScreen.
library;

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/ui/screens/profile/reputation_ledger_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockDio extends Mock implements Dio {}

Map<String, dynamic> _entryJson({
  required String id,
  required String label,
  required String pillar,
  required DateTime createdAt,
  bool appealable = false,
  String? appealStatus,
  String status = 'active',
}) {
  return {
    'id': id,
    'userId': 'u1',
    'eventType': 'test',
    'eventCategory': 'positive',
    'pillar': pillar,
    'publicLabel': label,
    'impactBand': 'small',
    'visibility': 'public',
    'appealable': appealable,
    'status': status,
    'createdAt': createdAt.toIso8601String(),
    if (appealStatus != null) 'appealStatus': appealStatus,
  };
}

Widget _buildApp({required Dio dio, required Future<String?> Function() jwt}) {
  return ProviderScope(
    overrides: [
      secureDioProvider.overrideWithValue(dio),
      jwtProvider.overrideWith((ref) => jwt()),
    ],
    child: const MaterialApp(home: ReputationLedgerScreen()),
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(RequestOptions(path: '/fallback'));
  });

  testWidgets('shows empty state when user has no token', (tester) async {
    final dio = _MockDio();

    await tester.pumpWidget(_buildApp(dio: dio, jwt: () async => null));
    await tester.pumpAndSettle();

    expect(find.text('No entries yet.'), findsWidgets);
    verifyNever(
      () => dio.get<Map<String, dynamic>>(
        any(),
        queryParameters: any(named: 'queryParameters'),
      ),
    );
  });

  testWidgets('falls back to empty state when ledger request fails', (
    tester,
  ) async {
    final dio = _MockDio();
    when(
      () => dio.get<Map<String, dynamic>>(
        any(),
        queryParameters: any(named: 'queryParameters'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/reputation/me/ledger'),
        type: DioExceptionType.connectionError,
      ),
    );

    await tester.pumpWidget(_buildApp(dio: dio, jwt: () async => 'token'));
    await tester.pumpAndSettle();

    expect(find.text('No entries yet.'), findsWidgets);
  });

  testWidgets('shows entries and allows appeal submission', (tester) async {
    final dio = _MockDio();
    final now = DateTime.now();
    when(
      () => dio.get<Map<String, dynamic>>(
        any(),
        queryParameters: any(named: 'queryParameters'),
      ),
    ).thenAnswer(
      (_) async => Response<Map<String, dynamic>>(
        data: {
          'entries': [
            _entryJson(
              id: 'e1',
              label: 'Human contribution',
              pillar: 'human_contribution',
              createdAt: now.subtract(const Duration(minutes: 5)),
              appealable: true,
            ),
            _entryJson(
              id: 'e2',
              label: 'Content quality',
              pillar: 'content_quality',
              createdAt: now.subtract(const Duration(hours: 2)),
              status: 'expired',
            ),
            _entryJson(
              id: 'e3',
              label: 'Unknown pillar',
              pillar: 'something-else',
              createdAt: now.subtract(const Duration(days: 40)),
            ),
          ],
          'nextCursor': 'next',
        },
        statusCode: 200,
        requestOptions: RequestOptions(path: '/reputation/me/ledger'),
      ),
    );
    when(() => dio.post<void>(any())).thenAnswer(
      (_) async => Response<void>(
        statusCode: 200,
        requestOptions: RequestOptions(path: '/moderation/ledger/e1/appeal'),
      ),
    );

    await tester.pumpWidget(_buildApp(dio: dio, jwt: () async => 'token'));
    await tester.pumpAndSettle();

    expect(find.text('Human contribution'), findsOneWidget);
    expect(find.textContaining('5m ago'), findsWidgets);
    expect(find.textContaining('2h ago'), findsWidgets);
    expect(find.textContaining('something-else'), findsWidgets);
    expect(find.text('Appeal'), findsWidgets);

    await tester.tap(find.text('Appeal').first);
    await tester.pumpAndSettle();

    verify(() => dio.post<void>('/moderation/ledger/e1/appeal')).called(1);
    expect(find.text('Appeal submitted.'), findsOneWidget);
  });
}
