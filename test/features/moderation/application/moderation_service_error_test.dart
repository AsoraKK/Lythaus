import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:lythaus/features/moderation/application/moderation_service.dart';
import 'package:lythaus/features/moderation/domain/moderation_decision.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';

class _MockDio extends Mock implements Dio {}

DioException _dioError(
  String path, {
  Map<String, dynamic>? data,
  int? statusCode,
  Headers? headers,
}) {
  return DioException(
    requestOptions: RequestOptions(path: path),
    response: data == null
        ? null
        : Response<Map<String, dynamic>>(
            data: data,
            statusCode: statusCode ?? 500,
            headers: headers,
            requestOptions: RequestOptions(path: path),
          ),
    message: 'mock error',
  );
}

void main() {
  late _MockDio dio;
  late ModerationService service;

  setUp(() {
    dio = _MockDio();
    service = ModerationService(dio);
  });

  void stubFlagFailure(DioException error) {
    when(
      () => dio.post<Map<String, dynamic>>(
        '/api/flag',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenThrow(error);
  }

  Future<Map<String, dynamic>> flag() {
    return service.flagContent(
      contentId: 'content-1',
      contentType: 'post',
      reason: 'spam',
      token: 'token',
    );
  }

  group('flagContent errors', () {
    test('preserves a device-integrity error code', () async {
      stubFlagFailure(
        _dioError(
          '/api/flag',
          data: {'code': 'DEVICE_INTEGRITY_BLOCKED'},
          statusCode: 403,
        ),
      );

      await expectLater(
        flag(),
        throwsA(
          isA<ModerationException>().having(
            (error) => error.code,
            'code',
            'DEVICE_INTEGRITY_BLOCKED',
          ),
        ),
      );
    });

    test('preserves a nested API error code', () async {
      stubFlagFailure(
        _dioError(
          '/api/flag',
          data: {
            'error': {'code': 'REQUEST_REJECTED'},
          },
        ),
      );

      await expectLater(
        flag(),
        throwsA(
          isA<ModerationException>().having(
            (error) => error.code,
            'code',
            'REQUEST_REJECTED',
          ),
        ),
      );
    });

    test('preserves rate-limit metadata', () async {
      stubFlagFailure(
        _dioError(
          '/api/flag',
          statusCode: 429,
          headers: Headers.fromMap({
            'retry-after': ['42'],
          }),
          data: {
            'code': 'RATE_LIMITED',
            'message':
                'Too many moderation requests. Please wait before trying again.',
            'retry_after_seconds': 42,
          },
        ),
      );

      await expectLater(
        flag(),
        throwsA(
          isA<ModerationException>()
              .having((error) => error.code, 'code', 'RATE_LIMITED')
              .having((error) => error.statusCode, 'statusCode', 429)
              .having(
                (error) => error.retryAfter,
                'retryAfter',
                const Duration(seconds: 42),
              ),
        ),
      );
    });

    test('rejects a missing response body', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          '/api/flag',
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer(
        (_) async => Response<Map<String, dynamic>>(
          data: null,
          requestOptions: RequestOptions(path: '/api/flag'),
        ),
      );

      await expectLater(
        flag(),
        throwsA(
          isA<ModerationException>().having(
            (error) => error.code,
            'code',
            'INVALID_RESPONSE',
          ),
        ),
      );
    });
  });

  test('maps retained staff-console failures', () async {
    when(
      () => dio.post<Map<String, dynamic>>(
        '/moderation/cases/case-1/decision',
        data: any(named: 'data'),
        options: any(named: 'options'),
      ),
    ).thenThrow(_dioError('/moderation/cases/case-1/decision'));

    await expectLater(
      service.submitModerationDecision(
        caseId: 'case-1',
        token: 'token',
        input: const ModerationDecisionInput(
          action: ModerationDecisionAction.allow,
          rationale: 'Policy permits this content.',
        ),
      ),
      throwsA(
        isA<ModerationException>().having(
          (error) => error.code,
          'code',
          'NETWORK_ERROR',
        ),
      ),
    );
  });
}
