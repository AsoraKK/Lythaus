import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/features/moderation/application/moderation_service.dart';
import 'package:lythaus/features/moderation/domain/moderation_repository.dart';
import 'package:lythaus/core/error/error_codes.dart';

/// Adapter that returns a fixed response (JSON map).
class _MockAdapter implements HttpClientAdapter {
  final Map<String, dynamic>? responseBody = null;
  final int statusCode = 200;
  final DioException? error;

  _MockAdapter({this.error});

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (error != null) throw error!;
    // Build a simple response
    return ResponseBody.fromString(
      responseBody != null ? _toJsonString(responseBody!) : '',
      statusCode,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  String _toJsonString(Map<String, dynamic> map) {
    // Simple approach using dart:convert
    return _jsonEncode(map);
  }

  @override
  void close({bool force = false}) {}
}

String _jsonEncode(Object? value) {
  if (value == null) return 'null';
  if (value is String) return '"$value"';
  if (value is num || value is bool) return value.toString();
  if (value is List) {
    return '[${value.map(_jsonEncode).join(',')}]';
  }
  if (value is Map) {
    final entries = value.entries.map(
      (e) => '"${e.key}":${_jsonEncode(e.value)}',
    );
    return '{${entries.join(',')}}';
  }
  return '"$value"';
}

DioException _dioError(int? statusCode, {Map<String, dynamic>? data}) {
  final requestOptions = RequestOptions(path: '/api/test');
  final response = statusCode != null
      ? Response(
          requestOptions: requestOptions,
          statusCode: statusCode,
          data: data,
        )
      : null;
  return DioException(
    requestOptions: requestOptions,
    response: response,
    type: response == null
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

  group('_mapDioException', () {
    test('maps DEVICE_INTEGRITY_BLOCKED code', () async {
      dio.httpClientAdapter = _MockAdapter(
        error: _dioError(
          403,
          data: {'code': ErrorCodes.deviceIntegrityBlocked},
        ),
      );
      expect(
        () => service.getMyAppeals(token: 'tok'),
        throwsA(
          predicate<ModerationException>(
            (e) => e.code == ErrorCodes.deviceIntegrityBlocked,
          ),
        ),
      );
    });

    test('maps DEVICE_INTEGRITY_BLOCKED in nested error', () async {
      dio.httpClientAdapter = _MockAdapter(
        error: _dioError(
          403,
          data: {
            'error': {'code': ErrorCodes.deviceIntegrityBlocked},
          },
        ),
      );
      expect(
        () => service.getMyAppeals(token: 'tok'),
        throwsA(
          predicate<ModerationException>(
            (e) => e.code == ErrorCodes.deviceIntegrityBlocked,
          ),
        ),
      );
    });

    test('maps generic DioException to NETWORK_ERROR', () async {
      dio.httpClientAdapter = _MockAdapter(
        error: _dioError(500, data: {'message': 'Server error'}),
      );
      expect(
        () => service.getMyAppeals(token: 'tok'),
        throwsA(
          predicate<ModerationException>((e) => e.code == 'NETWORK_ERROR'),
        ),
      );
    });

    test('maps DioException with no response to NETWORK_ERROR', () async {
      dio.httpClientAdapter = _MockAdapter(error: _dioError(null));
      expect(
        () => service.getMyAppeals(token: 'tok'),
        throwsA(
          predicate<ModerationException>((e) => e.code == 'NETWORK_ERROR'),
        ),
      );
    });
  });

  group('ModerationException', () {
    test('toString includes message', () {
      const e = ModerationException('test error', code: 'TEST');
      expect(e.toString(), 'ModerationException: test error');
      expect(e.code, 'TEST');
    });

    test('stores original error', () {
      final orig = Exception('root');
      final e = ModerationException('msg', originalError: orig);
      expect(e.originalError, orig);
    });
  });
}
