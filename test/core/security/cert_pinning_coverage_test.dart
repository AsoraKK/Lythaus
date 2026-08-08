import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/security/cert_pinning.dart';

void main() {
  // ─── CertPinningInfo ───

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
      expect(json['pins'], isA<Map<String, List<String>>>());
    });
  });

  // ─── getCertPinningInfo ───

  group('getCertPinningInfo', () {
    test('returns the disabled MVP pin configuration', () {
      final info = getCertPinningInfo();
      expect(info.enabled, isA<bool>());
      expect(info.enabled, isFalse);
      expect(info.pins, isEmpty);
      expect(info.buildMode, anyOf('debug', 'release'));
    });
  });

  // ─── isPinValidationError ───

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
        requestOptions: RequestOptions(path: 'https://google.com/api/test'),
        type: DioExceptionType.connectionError,
      );
      expect(isPinValidationError(err), isFalse);
    });

    test('false for non-connection error types', () {
      final err = DioException(
        requestOptions: RequestOptions(
          path: 'https://api.lythaus.co/api/test',
        ),
        type: DioExceptionType.badResponse,
      );
      expect(isPinValidationError(err), isFalse);
    });
  });

  // ─── kPinnedDomains ───

  group('kPinnedDomains', () {
    test('is empty while MVP strict pinning is disabled', () {
      expect(kPinnedDomains, isEmpty);
    });

    test('pins are non-empty base64 strings', () {
      for (final entry in kPinnedDomains.entries) {
        expect(entry.value, isNotEmpty, reason: '${entry.key} has no pins');
        for (final pin in entry.value) {
          expect(pin, isNotEmpty, reason: '${entry.key} has empty pin');
          // Base64 validation
          expect(
            () => base64Decode(pin),
            returnsNormally,
            reason: 'Pin "$pin" for ${entry.key} is not valid base64',
          );
        }
      }
    });
  });

  // ─── PinnedCertHttpClientAdapter ───

  group('PinnedCertHttpClientAdapter', () {
    test('wraps a non-IO adapter and delegates fetch', () async {
      final adapter = _StubAdapter();
      final pinned = PinnedCertHttpClientAdapter(adapter);

      final response = await pinned.fetch(
        RequestOptions(path: '/test'),
        null,
        null,
      );
      expect(response.statusCode, 200);
    });

    test('close delegates to inner adapter', () {
      final adapter = _StubAdapter();
      final pinned = PinnedCertHttpClientAdapter(adapter);
      pinned.close();
      expect(adapter.closed, isTrue);
    });
  });

  // ─── kEnableCertPinning ───

  group('kEnableCertPinning', () {
    test('is a bool', () {
      expect(kEnableCertPinning, isA<bool>());
    });
  });
}

class _StubAdapter implements HttpClientAdapter {
  bool closed = false;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return ResponseBody.fromString('ok', 200);
  }

  @override
  void close({bool force = false}) {
    closed = true;
  }
}
