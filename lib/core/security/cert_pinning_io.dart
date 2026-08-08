// ignore_for_file: public_member_api_docs

library;

import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';

import 'package:lythaus/core/security/cert_pinning_common.dart';
import 'package:lythaus/core/security/spki_utils.dart';

String _normalizePin(String pin) {
  if (pin.startsWith('sha256/')) {
    return pin.substring('sha256/'.length);
  }
  return pin;
}

/// Certificate pinning HTTP client adapter
///
/// Validates peer certificates by computing SPKI SHA-256 and comparing
/// against pinned values. Fails closed on mismatch.
class PinnedCertHttpClientAdapter implements HttpClientAdapter {
  final HttpClientAdapter _delegate;
  final IOHttpClientAdapter? _ioAdapter;

  /// Creates a pinned cert adapter.
  ///
  /// If [adapter] is an [IOHttpClientAdapter], certificate validation is
  /// configured on it. Otherwise, the adapter is used as-is for delegation
  /// (useful for testing).
  PinnedCertHttpClientAdapter(HttpClientAdapter adapter)
    : _delegate = adapter,
      _ioAdapter = adapter is IOHttpClientAdapter ? adapter : null {
    _ioAdapter?.validateCertificate = _validateCertificate;
  }

  /// Creates a production adapter with certificate pinning enabled.
  factory PinnedCertHttpClientAdapter.production() {
    final ioAdapter = IOHttpClientAdapter();
    ioAdapter.validateCertificate = _validateCertificate;
    return PinnedCertHttpClientAdapter._(ioAdapter, ioAdapter);
  }

  PinnedCertHttpClientAdapter._(this._delegate, this._ioAdapter);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return _delegate.fetch(options, requestStream, cancelFuture);
  }

  @override
  void close({bool force = false}) => _delegate.close(force: force);
}

bool _validateCertificate(X509Certificate? certificate, String host, int port) {
  if (!kEnableCertPinning) {
    return true;
  }

  final pins = kPinnedDomains[host];
  if (pins == null || pins.isEmpty) {
    return true;
  }

  if (certificate == null) {
    _logCertPinViolation(host, 'missing_certificate');
    return false;
  }

  try {
    final spkiBase64 = computeSpkiSha256Base64(certificate);
    final normalizedPins = pins.map(_normalizePin).toSet();
    final matched = normalizedPins.contains(spkiBase64);
    if (!matched) {
      _logCertPinViolation(host, 'pin_mismatch');
    }
    return matched;
  } catch (e) {
    _logCertPinViolation(host, 'validation_error: ${e.toString()}');
    return false;
  }
}

/// Create Dio instance with certificate pinning enabled
Dio createPinnedDio({String? baseUrl}) {
  final dio = Dio();

  if (baseUrl != null) {
    dio.options.baseUrl = baseUrl;
  }

  if (kEnableCertPinning) {
    assertValidPinnedDomains();
    dio.httpClientAdapter = PinnedCertHttpClientAdapter(dio.httpClientAdapter);
    dio.interceptors.add(_CertPinningInterceptor());
    debugPrint('🔒 Certificate pinning ENABLED');
  } else {
    debugPrint('🔓 Certificate pinning DISABLED');
  }

  return dio;
}

/// Interceptor for certificate pinning validation
class _CertPinningInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (!kEnableCertPinning) {
      return handler.next(options);
    }

    final host = Uri.parse(options.uri.toString()).host;

    if (kPinnedDomains.containsKey(host)) {
      debugPrint('🔍 Certificate pinning check for: $host');
      // SPKI validation runs inside the HttpClientAdapter callback.
    }

    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.type == DioExceptionType.connectionError ||
        err.type == DioExceptionType.unknown ||
        err.type == DioExceptionType.badCertificate) {
      final host = Uri.parse(err.requestOptions.uri.toString()).host;
      if (kPinnedDomains.containsKey(host)) {
        _logCertPinViolation(host, 'connection_failed');
        err = DioException(
          requestOptions: err.requestOptions,
          response: err.response,
          type: err.type,
          error: err.error,
          message:
              'Secure connection could not be established. Please try again on a trusted network or update the app.',
        );
      }
    }
    handler.next(err);
  }
}

/// Utility to check if an error likely stems from pin validation failure.
bool isPinValidationError(DioException err) {
  if (err.type == DioExceptionType.connectionError ||
      err.type == DioExceptionType.unknown ||
      err.type == DioExceptionType.badCertificate) {
    final host = Uri.parse(err.requestOptions.uri.toString()).host;
    return kPinnedDomains.containsKey(host);
  }
  return false;
}

/// Log certificate pinning violation for telemetry
void _logCertPinViolation(String host, String reason) {
  final event = {
    'event': 'cert_pin_violation',
    'host': host,
    'reason': reason,
    'timestamp': DateTime.now().toIso8601String(),
    'platform': defaultTargetPlatform.name,
  };

  debugPrint(
    '🚨 SECURITY: Certificate pinning violation: ${jsonEncode(event)}',
  );

  // NOTE(lythaus-telemetry): Route to the central telemetry pipeline once the
  // dedicated security event service is available.
  // TelemetryService.reportSecurityEvent(event);
}
