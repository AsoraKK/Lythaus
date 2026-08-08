import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/security/cert_pinning.dart';

class _FakeAdapter implements HttpClientAdapter {
  ResponseBody? response;
  Object? errorToThrow;
  bool throwWithIncomingOptions = false;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (errorToThrow != null) {
      if (errorToThrow is DioException) throw errorToThrow!;
      if (throwWithIncomingOptions) {
        throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
          error: errorToThrow,
        );
      } else {
        // Fallback if options not provided
        throw DioException(
          requestOptions: RequestOptions(path: options.path),
          type: DioExceptionType.connectionError,
          error: errorToThrow,
        );
      }
    }
    return response ?? ResponseBody.fromString('ok', 200);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('createPinnedDio keeps strict pinning disabled by default', () {
    final dio = createPinnedDio(baseUrl: 'https://example.com');
    expect(dio.options.baseUrl, 'https://example.com');
    expect(kEnableCertPinning, isFalse);
    expect(dio.httpClientAdapter, isNot(isA<PinnedCertHttpClientAdapter>()));
    expect(
      dio.interceptors.any(
        (interceptor) =>
            interceptor.runtimeType.toString().contains('CertPinning'),
      ),
      isFalse,
    );
  });

  test('PinnedCertHttpClientAdapter delegates on success', () async {
    final fake = _FakeAdapter();
    fake.response = ResponseBody.fromString('ok', 200);

    final pinned = PinnedCertHttpClientAdapter(fake);
    final opts = RequestOptions(path: '/test', method: 'GET');
    // Base URL influences host parsing
    opts.baseUrl = 'https://api.lythaus.co';

    final res = await pinned.fetch(opts, null, null);
    expect(res.statusCode, 200);
  });

  test('PinnedCertHttpClientAdapter logs and rethrows on error', () async {
    final fake = _FakeAdapter();
    final opts = RequestOptions(path: '/x', method: 'GET');
    opts.baseUrl = 'https://api.lythaus.co';
    fake.errorToThrow = Exception('tls fail');

    final pinned = PinnedCertHttpClientAdapter(fake);

    expect(() => pinned.fetch(opts, null, null), throwsA(isA<DioException>()));
  });

  test('isPinValidationError does not claim pin failures while disabled', () {
    final ro = RequestOptions(path: '/x', method: 'GET');
    ro.baseUrl = 'https://api.lythaus.co';
    final err = DioException(
      requestOptions: ro,
      type: DioExceptionType.connectionError,
      error: Exception('conn'),
    );
    expect(isPinValidationError(err), isFalse);

    final ro2 = RequestOptions(path: '/x', method: 'GET');
    ro2.baseUrl = 'https://not-pinned.example';
    final err2 = DioException(
      requestOptions: ro2,
      type: DioExceptionType.connectionError,
      error: Exception('conn'),
    );
    expect(isPinValidationError(err2), isFalse);
  });

  test('getCertPinningInfo records the empty MVP pin set', () {
    final info = getCertPinningInfo();
    expect(info.enabled, kEnableCertPinning);
    expect(info.pins, isEmpty);
  });

  test('interceptor maps connectionError for pinned host', () async {
    final dio = createPinnedDio(
      baseUrl: 'https://api.lythaus.co',
    );
    final fake = _FakeAdapter();
    dio.httpClientAdapter = PinnedCertHttpClientAdapter(fake);
    // adapter will throw a DioException connectionError using incoming request options
    fake.throwWithIncomingOptions = true;
    fake.errorToThrow = Exception('tls');
    try {
      await dio.get<Map<String, dynamic>>('/x');
      fail('should throw');
    } on DioException catch (e) {
      expect(isPinValidationError(e), isFalse);
    }
  });
}
