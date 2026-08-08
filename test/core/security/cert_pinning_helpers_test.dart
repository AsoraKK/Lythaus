import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:lythaus/core/security/cert_pinning.dart';

/// Manual spy for close/fetch delegation tests (avoids mocktail verify issues).
class _SpyAdapter extends Fake implements HttpClientAdapter {
  int closeCalls = 0;
  bool? lastForce;
  int fetchCalls = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    fetchCalls++;
    return ResponseBody(const Stream<Uint8List>.empty(), 200);
  }

  @override
  void close({bool force = false}) {
    closeCalls++;
    lastForce = force;
  }
}

void main() {
  setUpAll(() {
    registerFallbackValue(RequestOptions(path: ''));
  });
  group('CertPinningInfo', () {
    test('toJson includes all fields', () {
      const info = CertPinningInfo(
        enabled: true,
        pins: {
          'example.com': ['pin1', 'pin2'],
        },
        buildMode: 'debug',
      );

      final json = info.toJson();
      expect(json['enabled'], isTrue);
      expect(json['buildMode'], 'debug');
      expect(json['pinnedDomains'], ['example.com']);
      expect(json['pins'], isA<Map<String, dynamic>>());
    });
  });

  group('getCertPinningInfo', () {
    test('returns CertPinningInfo with expected structure', () {
      final info = getCertPinningInfo();
      expect(info, isA<CertPinningInfo>());
      expect(info.enabled, isA<bool>());
      expect(info.pins, isA<Map<String, List<String>>>());
      expect(info.buildMode, isNotEmpty);
    });
  });

  group('isPinValidationError', () {
    test('returns false for connectionError while pinning is disabled', () {
      final err = DioException(
        requestOptions: RequestOptions(
          path: 'https://api.lythaus.co/api/test',
        ),
        type: DioExceptionType.connectionError,
      );
      expect(isPinValidationError(err), isFalse);
    });

    test('returns false for badCertificate while pinning is disabled', () {
      final err = DioException(
        requestOptions: RequestOptions(
          path: 'https://api.lythaus.co/api/test',
        ),
        type: DioExceptionType.badCertificate,
      );
      expect(isPinValidationError(err), isFalse);
    });

    test('returns false for unknown errors while pinning is disabled', () {
      final err = DioException(
        requestOptions: RequestOptions(
          path: 'https://api.lythaus.co/api/test',
        ),
        type: DioExceptionType.unknown,
      );
      expect(isPinValidationError(err), isFalse);
    });

    test('false for unpinned domain', () {
      final err = DioException(
        requestOptions: RequestOptions(
          path: 'https://unpinned.example.com/api/test',
        ),
        type: DioExceptionType.connectionError,
      );
      expect(isPinValidationError(err), isFalse);
    });

    test('false for non-connection error types', () {
      final err = DioException(
        requestOptions: RequestOptions(
          path: 'https://api.lythaus.co/api/test',
        ),
        type: DioExceptionType.receiveTimeout,
      );
      expect(isPinValidationError(err), isFalse);
    });

    test('false for cancel type', () {
      final err = DioException(
        requestOptions: RequestOptions(
          path: 'https://api.lythaus.co/api/test',
        ),
        type: DioExceptionType.cancel,
      );
      expect(isPinValidationError(err), isFalse);
    });
  });

  group('kPinnedDomains', () {
    test('is empty while MVP strict pinning is disabled', () {
      expect(kPinnedDomains, isEmpty);
    });

    test('pins are non-empty base64 strings', () {
      for (final entry in kPinnedDomains.entries) {
        for (final pin in entry.value) {
          expect(pin, isNotEmpty, reason: 'Pin for ${entry.key} is empty');
          expect(
            pin.contains('PLACEHOLDER'),
            isFalse,
            reason: 'Pin for ${entry.key} contains placeholder',
          );
        }
      }
    });
  });

  group('kEnableCertPinning', () {
    test('is a bool', () {
      expect(kEnableCertPinning, isA<bool>());
    });
  });

  group('PinnedCertHttpClientAdapter', () {
    test('wraps a non-IO adapter and delegates fetch', () async {
      final spy = _SpyAdapter();
      final pinned = PinnedCertHttpClientAdapter(spy);
      final opts = RequestOptions(path: '/test');
      final response = await pinned.fetch(opts, null, null);

      expect(response.statusCode, 200);
      expect(spy.fetchCalls, 1);
    });

    test('close delegates to inner adapter', () {
      final spy = _SpyAdapter();
      final pinned = PinnedCertHttpClientAdapter(spy);
      pinned.close();
      expect(spy.closeCalls, 1);
      expect(spy.lastForce, false);
    });

    test('close with force delegates to inner adapter', () {
      final spy = _SpyAdapter();
      final pinned = PinnedCertHttpClientAdapter(spy);
      pinned.close(force: true);
      expect(spy.closeCalls, 1);
      expect(spy.lastForce, true);
    });
  });

  group('createPinnedDio', () {
    test('creates Dio instance with baseUrl', () {
      final dio = createPinnedDio(baseUrl: 'https://example.com');
      expect(dio, isA<Dio>());
      expect(dio.options.baseUrl, 'https://example.com');
      dio.close();
    });

    test('creates Dio without baseUrl', () {
      final dio = createPinnedDio();
      expect(dio, isA<Dio>());
      dio.close();
    });
  });
}
