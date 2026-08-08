// ignore_for_file: public_member_api_docs

library;

import 'package:dio/dio.dart';
import 'package:dio/io.dart';

import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/security/tls_pinning.dart';

void configureSecureHttpClientAdapter(
  Dio dio,
  EnvironmentConfig envConfig,
  String baseUrl,
) {
  if (!baseUrl.startsWith('https') || !envConfig.security.tlsPins.enabled) {
    return;
  }

  final uri = Uri.parse(baseUrl);
  final pinnedHost = uri.host;
  final validator = TlsPinningValidator(
    config: envConfig.security.tlsPins,
    environment: envConfig.environment,
  );

  dio.httpClientAdapter = IOHttpClientAdapter(
    validateCertificate: (certificate, host, port) {
      if (certificate == null) {
        return false;
      }
      if (host != pinnedHost) {
        return true;
      }
      return validator.validateCertificateChain(certificate, host);
    },
  );
}
