import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/error/error_codes.dart';
import 'package:lythaus/features/moderation/application/moderation_service.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';

class _ThrowingAdapter implements HttpClientAdapter {
  _ThrowingAdapter(this.error);

  final DioException error;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) {
    throw error;
  }

  @override
  void close({bool force = false}) {}
}

DioException _dioError(int? statusCode, {Map<String, dynamic>? data}) {
  final requestOptions = RequestOptions(path: '/api/flag');
  return DioException(
    requestOptions: requestOptions,
    response: statusCode == null
        ? null
        : Response<Map<String, dynamic>>(
            data: data,
            statusCode: statusCode,
            requestOptions: requestOptions,
          ),
    type: statusCode == null
        ? DioExceptionType.connectionError
        : DioExceptionType.badResponse,
    message: 'test error',
  );
}

void main() {
  late Dio dio;
  late ModerationService service;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    service = ModerationService(dio);
  });

  Future<Map<String, dynamic>> flag() {
    return service.flagContent(
      contentId: 'content-1',
      contentType: 'post',
      reason: 'spam',
      token: 'token',
    );
  }

  group('flag error mapping', () {
    test('maps DEVICE_INTEGRITY_BLOCKED at the top level', () async {
      dio.httpClientAdapter = _ThrowingAdapter(
        _dioError(403, data: {'code': ErrorCodes.deviceIntegrityBlocked}),
      );

      await expectLater(
        flag(),
        throwsA(
          predicate<ModerationException>(
            (error) => error.code == ErrorCodes.deviceIntegrityBlocked,
          ),
        ),
      );
    });

    test('maps DEVICE_INTEGRITY_BLOCKED from a nested error', () async {
      dio.httpClientAdapter = _ThrowingAdapter(
        _dioError(
          403,
          data: {
            'error': {'code': ErrorCodes.deviceIntegrityBlocked},
          },
        ),
      );

      await expectLater(
        flag(),
        throwsA(
          predicate<ModerationException>(
            (error) => error.code == ErrorCodes.deviceIntegrityBlocked,
          ),
        ),
      );
    });

    test('maps generic HTTP failures to NETWORK_ERROR', () async {
      dio.httpClientAdapter = _ThrowingAdapter(
        _dioError(500, data: {'message': 'Server error'}),
      );

      await expectLater(
        flag(),
        throwsA(
          predicate<ModerationException>(
            (error) => error.code == 'NETWORK_ERROR',
          ),
        ),
      );
    });

    test('maps transport failures to NETWORK_ERROR', () async {
      dio.httpClientAdapter = _ThrowingAdapter(_dioError(null));

      await expectLater(
        flag(),
        throwsA(
          predicate<ModerationException>(
            (error) => error.code == 'NETWORK_ERROR',
          ),
        ),
      );
    });
  });

  group('ModerationException', () {
    test('retains its message and optional fields', () {
      final original = Exception('root');
      final error = ModerationException(
        'test error',
        code: 'TEST',
        originalError: original,
      );

      expect(error.toString(), 'ModerationException: test error');
      expect(error.code, 'TEST');
      expect(error.originalError, original);
    });
  });
}
