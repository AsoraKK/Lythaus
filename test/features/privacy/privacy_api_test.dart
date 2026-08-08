import 'package:lythaus/core/logging/app_logger.dart';
import 'package:lythaus/features/privacy/services/privacy_api.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockDio extends Mock implements Dio {}

class _MockLogger extends Mock implements AppLogger {}

void main() {
  group('DioPrivacyApi', () {
    late Dio dio;
    late AppLogger logger;
    late PrivacyApi api;

    setUpAll(() {
      registerFallbackValue(RequestOptions(path: ''));
      registerFallbackValue(Options());
    });

    setUp(() {
      dio = _MockDio();
      logger = _MockLogger();
      api = DioPrivacyApi(
        dio: dio,
        logger: logger,
        clock: () => DateTime(2024),
      );
    });

    test('requestExport parses acceptedAt and retry-after header', () async {
      final response = Response<Map<String, dynamic>>(
        data: {
          'requestId': 'request-1',
          'acceptedAt': '2024-01-01T12:00:00.000Z',
        },
        headers: Headers.fromMap({
          'retry-after': ['3600'],
        }),
        requestOptions: RequestOptions(path: ''),
        statusCode: 202,
      );

      when(
        () => dio.post<Map<String, dynamic>>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async => response);

      final result = await api.requestExport(authToken: 'token');
      expect(result.acceptedAt, DateTime.utc(2024, 1, 1, 12));
      expect(result.requestId, 'request-1');
      expect(result.retryAfter, const Duration(hours: 1));
    });

    test('requestExport throws unauthorized exception for 401', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: ''),
          response: Response(
            requestOptions: RequestOptions(path: ''),
            statusCode: 401,
          ),
        ),
      );

      expect(
        () => api.requestExport(authToken: 'token'),
        throwsA(
          isA<PrivacyApiException>().having(
            (error) => error.type,
            'type',
            PrivacyErrorType.unauthorized,
          ),
        ),
      );
    });

    test('getExportStatus returns idle snapshot for 404', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: ''),
          response: Response(
            requestOptions: RequestOptions(path: ''),
            statusCode: 404,
          ),
        ),
      );

      final status = await api.getExportStatus(authToken: 'token');
      expect(status.state, 'idle');
    });

    test('getExportStatus surfaces server errors', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: ''),
          response: Response(
            requestOptions: RequestOptions(path: ''),
            statusCode: 500,
          ),
          type: DioExceptionType.badResponse,
        ),
      );

      expect(
        () => api.getExportStatus(authToken: 'token'),
        throwsA(
          isA<PrivacyApiException>().having(
            (error) => error.type,
            'type',
            PrivacyErrorType.server,
          ),
        ),
      );
    });

    test('getExportStatus parses payload fields', () async {
      when(
        () => dio.get<Map<String, dynamic>>(
          any(),
          options: any(named: 'options'),
        ),
      ).thenAnswer((_) async {
        return Response<Map<String, dynamic>>(
          requestOptions: RequestOptions(path: ''),
          data: {
            'request': {
              'state': 'Queued',
              'acceptedAt': '2024-01-01T12:00:00.000Z',
              'retryAfterSeconds': 90,
            },
          },
          statusCode: 200,
        );
      });

      final status = await api.getExportStatus(authToken: 'token');
      expect(status.state, 'queued');
      expect(status.acceptedAt, DateTime.utc(2024, 1, 1, 12));
      expect(status.retryAfterSeconds, 90);
    });

    test('deleteAccount maps network errors to network type', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException.connectionError(
          requestOptions: RequestOptions(path: ''),
          reason: 'socket',
        ),
      );

      expect(
        () => api.deleteAccount(authToken: 'token', hardDelete: true),
        throwsA(
          isA<PrivacyApiException>().having(
            (error) => error.type,
            'type',
            PrivacyErrorType.network,
          ),
        ),
      );
    });

    test('deleteAccount submits a native privacy request', () async {
      late Options capturedOptions;
      late Object? capturedData;
      when(
        () => dio.post<Map<String, dynamic>>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenAnswer((invocation) async {
        capturedOptions = invocation.namedArguments[#options] as Options;
        capturedData = invocation.namedArguments[#data];
        return Response<Map<String, dynamic>>(
          requestOptions: RequestOptions(path: ''),
          statusCode: 202,
          data: const {'requestId': 'request-2', 'state': 'received'},
        );
      });

      await api.deleteAccount(authToken: 'secret', hardDelete: true);

      expect(capturedData, const {'requestType': 'delete'});
      expect(capturedOptions.headers?['Authorization'], 'Bearer secret');
      expect(
        capturedOptions.headers?['Idempotency-Key'],
        startsWith('privacy-'),
      );
    });

    test('requestExport maps retry-after date header on rate limit', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: ''),
          response: Response(
            requestOptions: RequestOptions(path: ''),
            statusCode: 429,
            headers: Headers.fromMap({
              'retry-after': ['2030-01-01T00:00:00Z'],
            }),
          ),
          type: DioExceptionType.badResponse,
        ),
      );

      expect(
        () => api.requestExport(authToken: 'token'),
        throwsA(
          isA<PrivacyApiException>().having(
            (error) => error.retryAfter,
            'retryAfter',
            isNotNull,
          ),
        ),
      );
    });

    test('requestExport maps timeout errors to network type', () async {
      when(
        () => dio.post<Map<String, dynamic>>(
          any(),
          data: any(named: 'data'),
          options: any(named: 'options'),
        ),
      ).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: ''),
          type: DioExceptionType.receiveTimeout,
        ),
      );

      expect(
        () => api.requestExport(authToken: 'token'),
        throwsA(
          isA<PrivacyApiException>().having(
            (error) => error.type,
            'type',
            PrivacyErrorType.network,
          ),
        ),
      );
    });
  });
}
