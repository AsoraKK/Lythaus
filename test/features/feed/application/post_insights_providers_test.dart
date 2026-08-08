import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/network/dio_client.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/application/auth_service.dart';
import 'package:lythaus/features/auth/domain/user.dart';
import 'package:lythaus/features/feed/application/post_insights_providers.dart';
import 'package:lythaus/features/feed/domain/post_insights.dart';

class _MockDio extends Mock implements Dio {}

class _MockAuthService extends Mock implements AuthService {}

class _MockAuthStateNotifier extends StateNotifier<AsyncValue<User?>>
    with Mock
    implements AuthStateNotifier {
  _MockAuthStateNotifier(super.initialState);
}

void main() {
  setUpAll(() {
    registerFallbackValue(RequestOptions(path: ''));
    registerFallbackValue(Options());
  });

  group('InsightsResult - Result Classes', () {
    test('InsightsSuccess stores insights correctly', () {
      final insights = PostInsights(
        postId: 'post123',
        riskBand: RiskBand.low,
        decision: InsightDecision.allow,
        reasonCodes: [],
        configVersion: 1,
        decidedAt: DateTime.now(),
        appeal: const InsightAppeal(status: InsightAppealStatus.none),
      );

      final result = InsightsSuccess(insights);

      expect(result, isA<InsightsSuccess>());
      expect(result.insights, equals(insights));
      expect(result.insights.postId, equals('post123'));
    });

    test('InsightsSuccess stores different insights', () {
      final insights1 = PostInsights(
        postId: 'post1',
        riskBand: RiskBand.medium,
        decision: InsightDecision.block,
        reasonCodes: ['code1'],
        configVersion: 1,
        decidedAt: DateTime.now(),
        appeal: const InsightAppeal(status: InsightAppealStatus.pending),
      );
      final insights2 = PostInsights(
        postId: 'post2',
        riskBand: RiskBand.high,
        decision: InsightDecision.allow,
        reasonCodes: [],
        configVersion: 2,
        decidedAt: DateTime.now(),
        appeal: const InsightAppeal(status: InsightAppealStatus.approved),
      );

      final result1 = InsightsSuccess(insights1);
      final result2 = InsightsSuccess(insights2);

      expect(result1.insights.postId, equals('post1'));
      expect(result2.insights.postId, equals('post2'));
      expect(result1.insights.riskBand, equals(RiskBand.medium));
      expect(result2.insights.riskBand, equals(RiskBand.high));
    });

    test('InsightsAccessDenied is created without arguments', () {
      final result = InsightsAccessDenied();
      expect(result, isA<InsightsAccessDenied>());
      expect(result, isA<InsightsResult>());
    });

    test('InsightsNotFound is created without arguments', () {
      final result = InsightsNotFound();
      expect(result, isA<InsightsNotFound>());
      expect(result, isA<InsightsResult>());
    });

    test('InsightsError stores message and original error', () {
      final originalError = Exception('API error');
      final result = InsightsError('Failed to fetch', originalError);

      expect(result, isA<InsightsError>());
      expect(result.message, equals('Failed to fetch'));
      expect(result.originalError, equals(originalError));
    });

    test('InsightsError can be created with null originalError', () {
      final result = InsightsError('Network timeout');

      expect(result.message, equals('Network timeout'));
      expect(result.originalError, isNull);
    });

    test('InsightsError stores various error messages', () {
      final errors = [
        'Failed to fetch insights: Connection timeout',
        'Failed to fetch insights: 500 Internal Server Error',
        'Failed to fetch insights: Invalid response format',
      ];

      for (final message in errors) {
        final result = InsightsError(message);
        expect(result.message, equals(message));
      }
    });
  });

  group('isInsightsAvailable', () {
    test('returns true when AsyncValue contains InsightsSuccess', () {
      final insights = PostInsights(
        postId: 'post1',
        riskBand: RiskBand.low,
        decision: InsightDecision.allow,
        reasonCodes: [],
        configVersion: 1,
        decidedAt: DateTime.now(),
        appeal: const InsightAppeal(status: InsightAppealStatus.none),
      );
      final asyncResult = AsyncValue<InsightsResult>.data(
        InsightsSuccess(insights),
      );

      expect(isInsightsAvailable(asyncResult), isTrue);
    });

    test('returns false when AsyncValue contains InsightsAccessDenied', () {
      final asyncResult = AsyncValue<InsightsResult>.data(
        InsightsAccessDenied(),
      );

      expect(isInsightsAvailable(asyncResult), isFalse);
    });

    test('returns false when AsyncValue contains InsightsNotFound', () {
      final asyncResult = AsyncValue<InsightsResult>.data(InsightsNotFound());

      expect(isInsightsAvailable(asyncResult), isFalse);
    });

    test('returns false when AsyncValue contains InsightsError', () {
      final asyncResult = AsyncValue<InsightsResult>.data(
        InsightsError('Error message'),
      );

      expect(isInsightsAvailable(asyncResult), isFalse);
    });

    test('returns false when AsyncValue is in loading state', () {
      const asyncResult = AsyncValue<InsightsResult>.loading();

      expect(isInsightsAvailable(asyncResult), isFalse);
    });

    test('returns false when AsyncValue contains an error', () {
      final asyncResult = AsyncValue<InsightsResult>.error(
        'Error',
        StackTrace.current,
      );

      expect(isInsightsAvailable(asyncResult), isFalse);
    });
  });

  group('getInsights', () {
    test('returns insights when AsyncValue contains InsightsSuccess', () {
      final insights = PostInsights(
        postId: 'post1',
        riskBand: RiskBand.low,
        decision: InsightDecision.allow,
        reasonCodes: [],
        configVersion: 1,
        decidedAt: DateTime.now(),
        appeal: const InsightAppeal(status: InsightAppealStatus.none),
      );
      final asyncResult = AsyncValue<InsightsResult>.data(
        InsightsSuccess(insights),
      );

      final result = getInsights(asyncResult);

      expect(result, isNotNull);
      expect(result, equals(insights));
      expect(result?.postId, equals('post1'));
    });

    test('returns null when AsyncValue contains InsightsAccessDenied', () {
      final asyncResult = AsyncValue<InsightsResult>.data(
        InsightsAccessDenied(),
      );

      final result = getInsights(asyncResult);

      expect(result, isNull);
    });

    test('returns null when AsyncValue contains InsightsNotFound', () {
      final asyncResult = AsyncValue<InsightsResult>.data(InsightsNotFound());

      final result = getInsights(asyncResult);

      expect(result, isNull);
    });

    test('returns null when AsyncValue contains InsightsError', () {
      final asyncResult = AsyncValue<InsightsResult>.data(
        InsightsError('Error'),
      );

      final result = getInsights(asyncResult);

      expect(result, isNull);
    });

    test('returns null when AsyncValue is in loading state', () {
      const asyncResult = AsyncValue<InsightsResult>.loading();

      final result = getInsights(asyncResult);

      expect(result, isNull);
    });

    test('returns null when AsyncValue contains an error', () {
      final asyncResult = AsyncValue<InsightsResult>.error(
        'Error',
        StackTrace.current,
      );

      final result = getInsights(asyncResult);

      expect(result, isNull);
    });

    test('extracts different insights correctly', () {
      final insights1 = PostInsights(
        postId: 'post1',
        riskBand: RiskBand.high,
        decision: InsightDecision.block,
        reasonCodes: [],
        configVersion: 1,
        decidedAt: DateTime.now(),
        appeal: const InsightAppeal(status: InsightAppealStatus.rejected),
      );
      final insights2 = PostInsights(
        postId: 'post2',
        riskBand: RiskBand.medium,
        decision: InsightDecision.allow,
        reasonCodes: [],
        configVersion: 1,
        decidedAt: DateTime.now(),
        appeal: const InsightAppeal(status: InsightAppealStatus.pending),
      );

      final result1 = getInsights(AsyncValue.data(InsightsSuccess(insights1)));
      final result2 = getInsights(AsyncValue.data(InsightsSuccess(insights2)));

      expect(result1?.postId, equals('post1'));
      expect(result2?.postId, equals('post2'));
      expect(result1?.riskBand, equals(RiskBand.high));
      expect(result2?.riskBand, equals(RiskBand.medium));
    });
  });

  group('Result Pattern Matching', () {
    test('can distinguish between different result types', () {
      final successResult = InsightsSuccess(
        PostInsights(
          postId: 'p1',
          riskBand: RiskBand.low,
          decision: InsightDecision.allow,
          reasonCodes: [],
          configVersion: 1,
          decidedAt: DateTime.now(),
          appeal: const InsightAppeal(status: InsightAppealStatus.none),
        ),
      );
      final deniedResult = InsightsAccessDenied();
      final notFoundResult = InsightsNotFound();
      final errorResult = InsightsError('Error');

      expect(successResult, isA<InsightsSuccess>());
      expect(deniedResult, isA<InsightsAccessDenied>());
      expect(notFoundResult, isA<InsightsNotFound>());
      expect(errorResult, isA<InsightsError>());

      expect(successResult is! InsightsAccessDenied, isTrue);
      expect(deniedResult is! InsightsSuccess, isTrue);
    });

    test('all result types are subclasses of InsightsResult', () {
      final List<InsightsResult> results = [
        InsightsSuccess(
              PostInsights(
                postId: 'p',
                riskBand: RiskBand.low,
                decision: InsightDecision.allow,
                reasonCodes: [],
                configVersion: 1,
                decidedAt: DateTime.now(),
                appeal: const InsightAppeal(status: InsightAppealStatus.none),
              ),
            )
            as InsightsResult,
        InsightsAccessDenied(),
        InsightsNotFound(),
        InsightsError('Error'),
      ];

      for (final result in results) {
        expect(result, isA<InsightsResult>());
      }
    });
  });

  group('Error Handling Edge Cases', () {
    test('InsightsError handles complex error objects', () {
      final dioException = DioException(
        requestOptions: RequestOptions(path: '/api/posts/123/insights'),
        response: Response(
          requestOptions: RequestOptions(path: '/api/posts/123/insights'),
          statusCode: 500,
        ),
      );

      final result = InsightsError('API request failed', dioException);

      expect(result.originalError, isNotNull);
      expect(result.originalError, isA<DioException>());
    });

    test('isInsightsAvailable handles all AsyncValue states correctly', () {
      final insights = PostInsights(
        postId: 'p',
        riskBand: RiskBand.low,
        decision: InsightDecision.allow,
        reasonCodes: [],
        configVersion: 1,
        decidedAt: DateTime.now(),
        appeal: const InsightAppeal(status: InsightAppealStatus.none),
      );

      final states = [
        (AsyncValue.data(InsightsSuccess(insights)), true),
        (AsyncValue.data(InsightsAccessDenied()), false),
        (AsyncValue.data(InsightsNotFound()), false),
        (AsyncValue.data(InsightsError('msg')), false),
        (const AsyncValue<InsightsResult>.loading(), false),
        (AsyncValue<InsightsResult>.error('err', StackTrace.current), false),
      ];

      for (final (asyncVal, expected) in states) {
        expect(
          isInsightsAvailable(asyncVal),
          equals(expected),
          reason: 'Failed for ${asyncVal.runtimeType}',
        );
      }
    });
  });

  group('Helper Function Integration', () {
    test('getInsights and isInsightsAvailable work together', () {
      final insights = PostInsights(
        postId: 'post1',
        riskBand: RiskBand.medium,
        decision: InsightDecision.allow,
        reasonCodes: [],
        configVersion: 1,
        decidedAt: DateTime.now(),
        appeal: const InsightAppeal(status: InsightAppealStatus.pending),
      );
      final asyncResult = AsyncValue<InsightsResult>.data(
        InsightsSuccess(insights),
      );

      // If available, we can get insights
      if (isInsightsAvailable(asyncResult)) {
        final extracted = getInsights(asyncResult);
        expect(extracted, isNotNull);
        expect(extracted!.postId, equals('post1'));
      } else {
        fail('Should be available');
      }
    });

    test('access denied means no insights available', () {
      final asyncResult = AsyncValue<InsightsResult>.data(
        InsightsAccessDenied(),
      );

      expect(isInsightsAvailable(asyncResult), isFalse);
      expect(getInsights(asyncResult), isNull);
    });

    test('not found means no insights available', () {
      final asyncResult = AsyncValue<InsightsResult>.data(InsightsNotFound());

      expect(isInsightsAvailable(asyncResult), isFalse);
      expect(getInsights(asyncResult), isNull);
    });

    test('error means no insights available', () {
      final asyncResult = AsyncValue<InsightsResult>.data(
        InsightsError('Failed'),
      );

      expect(isInsightsAvailable(asyncResult), isFalse);
      expect(getInsights(asyncResult), isNull);
    });
  });

  group('postInsightsProvider', () {
    final user = User(
      id: 'u1',
      email: 'test@example.com',
      role: UserRole.user,
      tier: UserTier.bronze,
      reputationScore: 0,
      createdAt: DateTime.utc(2024, 1, 1),
      lastLoginAt: DateTime.utc(2024, 1, 2),
      isTemporary: false,
    );

    test('returns access denied when unauthenticated', () async {
      final dio = _MockDio();
      final authService = _MockAuthService();
      final notifier = _MockAuthStateNotifier(const AsyncValue.data(null));
      final container = ProviderContainer(
        overrides: [
          authStateProvider.overrideWith((ref) => notifier),
          enhancedAuthServiceProvider.overrideWithValue(authService),
          secureDioProvider.overrideWithValue(dio),
        ],
      );
      addTearDown(container.dispose);

      final result = await container.read(
        postInsightsProvider('post-1').future,
      );
      expect(result, isA<InsightsAccessDenied>());
      verifyNever(() => authService.getJwtToken());
    });

    test('returns access denied when token missing', () async {
      final dio = _MockDio();
      final authService = _MockAuthService();
      when(() => authService.getJwtToken()).thenAnswer((_) async => null);
      final notifier = _MockAuthStateNotifier(AsyncValue.data(user));
      final container = ProviderContainer(
        overrides: [
          authStateProvider.overrideWith((ref) => notifier),
          enhancedAuthServiceProvider.overrideWithValue(authService),
          secureDioProvider.overrideWithValue(dio),
        ],
      );
      addTearDown(container.dispose);

      final result = await container.read(
        postInsightsProvider('post-1').future,
      );
      expect(result, isA<InsightsAccessDenied>());
    });

    test('returns InsightsSuccess when API succeeds', () async {
      final dio = _MockDio();
      final authService = _MockAuthService();
      when(() => authService.getJwtToken()).thenAnswer((_) async => 'token');
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/posts/post-1/insights',
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<Map<String, dynamic>>(
          data: {
            'postId': 'post-1',
            'riskBand': 'LOW',
            'decision': 'ALLOW',
            'reasonCodes': const <String>[],
            'configVersion': 1,
            'decidedAt': '2024-01-01T00:00:00Z',
            'appeal': {'status': 'NONE'},
          },
          statusCode: 200,
          requestOptions: RequestOptions(path: '/api/posts/post-1/insights'),
        ),
      );
      final notifier = _MockAuthStateNotifier(AsyncValue.data(user));
      final container = ProviderContainer(
        overrides: [
          authStateProvider.overrideWith((ref) => notifier),
          enhancedAuthServiceProvider.overrideWithValue(authService),
          secureDioProvider.overrideWithValue(dio),
        ],
      );
      addTearDown(container.dispose);

      final result = await container.read(
        postInsightsProvider('post-1').future,
      );
      expect(result, isA<InsightsSuccess>());
      expect((result as InsightsSuccess).insights.postId, 'post-1');
    });

    test('maps 403 response to access denied', () async {
      final dio = _MockDio();
      final authService = _MockAuthService();
      when(() => authService.getJwtToken()).thenAnswer((_) async => 'token');
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/posts/post-1/insights',
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/posts/post-1/insights'),
          response: Response(
            requestOptions: RequestOptions(path: '/api/posts/post-1/insights'),
            statusCode: 403,
          ),
          type: DioExceptionType.badResponse,
        ),
      );
      final notifier = _MockAuthStateNotifier(AsyncValue.data(user));
      final container = ProviderContainer(
        overrides: [
          authStateProvider.overrideWith((ref) => notifier),
          enhancedAuthServiceProvider.overrideWithValue(authService),
          secureDioProvider.overrideWithValue(dio),
        ],
      );
      addTearDown(container.dispose);

      final denied = await container.read(
        postInsightsProvider('post-1').future,
      );
      expect(denied, isA<InsightsAccessDenied>());
    });

    test('maps 404 response to not found', () async {
      final dio = _MockDio();
      final authService = _MockAuthService();
      when(() => authService.getJwtToken()).thenAnswer((_) async => 'token');
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/posts/post-1/insights',
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/posts/post-1/insights'),
          response: Response(
            requestOptions: RequestOptions(path: '/api/posts/post-1/insights'),
            statusCode: 404,
          ),
          type: DioExceptionType.badResponse,
        ),
      );
      final notifier = _MockAuthStateNotifier(AsyncValue.data(user));
      final container = ProviderContainer(
        overrides: [
          authStateProvider.overrideWith((ref) => notifier),
          enhancedAuthServiceProvider.overrideWithValue(authService),
          secureDioProvider.overrideWithValue(dio),
        ],
      );
      addTearDown(container.dispose);

      final notFound = await container.read(
        postInsightsProvider('post-1').future,
      );
      expect(notFound, isA<InsightsNotFound>());
    });

    test('returns InsightsError on unexpected error', () async {
      final dio = _MockDio();
      final authService = _MockAuthService();
      when(() => authService.getJwtToken()).thenAnswer((_) async => 'token');
      when(
        () => dio.get<Map<String, dynamic>>(
          '/api/posts/post-1/insights',
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: '/api/posts/post-1/insights'),
          response: Response(
            requestOptions: RequestOptions(path: '/api/posts/post-1/insights'),
            statusCode: 500,
          ),
          type: DioExceptionType.badResponse,
          message: 'server exploded',
        ),
      );
      final notifier = _MockAuthStateNotifier(AsyncValue.data(user));
      final container = ProviderContainer(
        overrides: [
          authStateProvider.overrideWith((ref) => notifier),
          enhancedAuthServiceProvider.overrideWithValue(authService),
          secureDioProvider.overrideWithValue(dio),
        ],
      );
      addTearDown(container.dispose);

      final result = await container.read(
        postInsightsProvider('post-1').future,
      );
      expect(result, isA<InsightsError>());
      expect(
        (result as InsightsError).message,
        contains('Failed to fetch insights'),
      );
    });
  });
}
