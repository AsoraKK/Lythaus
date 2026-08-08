import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/security/cert_pinning.dart';

void main() {
  // ────── CertPinningInfo ──────

  group('CertPinningInfo', () {
    test('constructor stores all fields', () {
      const info = CertPinningInfo(
        enabled: true,
        pins: {
          'example.com': ['pin1', 'pin2'],
        },
        buildMode: 'debug',
      );

      expect(info.enabled, isTrue);
      expect(info.pins, hasLength(1));
      expect(info.buildMode, 'debug');
    });

    test('toJson includes all fields', () {
      const info = CertPinningInfo(
        enabled: true,
        pins: {
          'a.com': ['p1'],
          'b.com': ['p2'],
        },
        buildMode: 'release',
      );

      final json = info.toJson();
      expect(json['enabled'], isTrue);
      expect(json['buildMode'], 'release');
      expect(json['pins'], isA<Map<String, dynamic>>());
      expect(json['pinnedDomains'], ['a.com', 'b.com']);
    });

    test('toJson with empty pins', () {
      const info = CertPinningInfo(
        enabled: false,
        pins: {},
        buildMode: 'debug',
      );

      final json = info.toJson();
      expect(json['enabled'], isFalse);
      expect(json['pinnedDomains'], isEmpty);
    });
  });

  // ────── getCertPinningInfo ──────

  group('getCertPinningInfo', () {
    test('returns CertPinningInfo with correct structure', () {
      final info = getCertPinningInfo();
      expect(info, isA<CertPinningInfo>());
      expect(info.enabled, isA<bool>());
      expect(info.pins, isA<Map<String, List<String>>>());
      expect(info.buildMode, isA<String>());
    });

    test('pins match kPinnedDomains', () {
      final info = getCertPinningInfo();
      expect(info.pins, equals(kPinnedDomains));
    });

    test('toJson returns valid serializable map', () {
      final info = getCertPinningInfo();
      final json = info.toJson();
      expect(json, isA<Map<String, dynamic>>());
      expect(json.containsKey('enabled'), isTrue);
      expect(json.containsKey('pins'), isTrue);
      expect(json.containsKey('buildMode'), isTrue);
      expect(json.containsKey('pinnedDomains'), isTrue);
    });
  });

  // ────── kPinnedDomains ──────

  group('kPinnedDomains', () {
    test('is empty while MVP strict pinning is disabled', () {
      expect(kPinnedDomains, isEmpty);
    });

    test('all pins are non-empty strings', () {
      for (final entry in kPinnedDomains.entries) {
        expect(entry.value, isNotEmpty, reason: '${entry.key} has no pins');
        for (final pin in entry.value) {
          expect(pin, isNotEmpty, reason: 'Empty pin in ${entry.key}');
        }
      }
    });
  });

  // ────── isPinValidationError ──────

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

    test('returns false for unknown error while pinning is disabled', () {
      final err = DioException(
        requestOptions: RequestOptions(
          path: 'https://api.lythaus.co/api/test',
        ),
        type: DioExceptionType.unknown,
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

    test('returns false for connectionError on non-pinned domain', () {
      final err = DioException(
        requestOptions: RequestOptions(path: 'https://example.com/api/test'),
        type: DioExceptionType.connectionError,
      );
      expect(isPinValidationError(err), isFalse);
    });

    test('returns false for timeout error', () {
      final err = DioException(
        requestOptions: RequestOptions(
          path: 'https://api.lythaus.co/api/test',
        ),
        type: DioExceptionType.receiveTimeout,
      );
      expect(isPinValidationError(err), isFalse);
    });

    test('returns false for badResponse', () {
      final err = DioException(
        requestOptions: RequestOptions(
          path: 'https://api.lythaus.co/api/test',
        ),
        type: DioExceptionType.badResponse,
      );
      expect(isPinValidationError(err), isFalse);
    });

    test('returns false for cancel', () {
      final err = DioException(
        requestOptions: RequestOptions(
          path: 'https://api.lythaus.co/api/test',
        ),
        type: DioExceptionType.cancel,
      );
      expect(isPinValidationError(err), isFalse);
    });
  });

  // ────── PinnedCertHttpClientAdapter ──────

  group('PinnedCertHttpClientAdapter', () {
    test('close delegates to inner adapter', () {
      final adapter = PinnedCertHttpClientAdapter.production();
      // Should not throw
      adapter.close();
    });

    test('close with force delegates to inner adapter', () {
      final adapter = PinnedCertHttpClientAdapter.production();
      adapter.close(force: true);
    });
  });

  // ────── createPinnedDio ──────

  group('createPinnedDio', () {
    test('creates Dio with no base URL', () {
      final dio = createPinnedDio();
      expect(dio, isA<Dio>());
      dio.close();
    });

    test('creates Dio with specified base URL', () {
      final dio = createPinnedDio(baseUrl: 'https://test.example.com');
      expect(dio.options.baseUrl, 'https://test.example.com');
      dio.close();
    });

    test('does not add interceptors when pinning is disabled', () {
      final dio = createPinnedDio();
      expect(
        dio.interceptors.any(
          (interceptor) =>
              interceptor.runtimeType.toString().contains('CertPinning'),
        ),
        isFalse,
      );
      dio.close();
    });
  });
}
