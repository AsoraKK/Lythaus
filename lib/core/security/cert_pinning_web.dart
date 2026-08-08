// ignore_for_file: public_member_api_docs

library;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'package:lythaus/core/security/cert_pinning_common.dart';

/// Browser-safe adapter wrapper that preserves the existing API surface while
/// delegating to Dio's default browser transport.
class PinnedCertHttpClientAdapter implements HttpClientAdapter {
  final HttpClientAdapter _delegate;

  PinnedCertHttpClientAdapter(this._delegate);

  factory PinnedCertHttpClientAdapter.production() {
    final dio = Dio();
    return PinnedCertHttpClientAdapter(dio.httpClientAdapter);
  }

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

/// Create Dio instance for the current platform.
///
/// Browsers do not expose certificate hooks, so web keeps Dio's default
/// browser adapter and relies on the browser TLS stack.
Dio createPinnedDio({String? baseUrl}) {
  final dio = Dio();

  if (baseUrl != null) {
    dio.options.baseUrl = baseUrl;
  }

  if (kEnableCertPinning) {
    assertValidPinnedDomains();
    debugPrint(
      '🔒 Certificate pinning unavailable on web; relying on browser TLS',
    );
  } else {
    debugPrint('🔓 Certificate pinning DISABLED');
  }

  return dio;
}

/// Utility to check if an error likely stems from a TLS failure on a pinned
/// host. Browsers do not expose certificate mismatch details directly.
bool isPinValidationError(DioException err) {
  if (err.type == DioExceptionType.connectionError ||
      err.type == DioExceptionType.unknown ||
      err.type == DioExceptionType.badCertificate) {
    final host = Uri.parse(err.requestOptions.uri.toString()).host;
    return kPinnedDomains.containsKey(host);
  }
  return false;
}
