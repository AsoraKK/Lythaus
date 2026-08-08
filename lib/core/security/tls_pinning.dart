// ignore_for_file: public_member_api_docs

/// LYTHAUS TLS CERTIFICATE PINNING (Enhanced)
///
/// 🎯 Purpose: Pin SHA-256 of server's SPKI, strict/warn modes, multi-pin support
/// 🔐 Security: Prevents MITM attacks via public key pinning
/// 🚨 Telemetry: Logs pinning decisions for monitoring
/// 📱 Platform: Flutter with native TLS validation
library;

import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/security/spki_utils.dart';
import 'package:lythaus/core/security/security_telemetry.dart';

/// TLS pinning implementation with SPKI verification
class TlsPinningValidator {
  final TlsPinConfig _config;
  final Environment _environment;

  TlsPinningValidator({
    required TlsPinConfig config,
    required Environment environment,
  }) : _config = config,
       _environment = environment;

  /// Validate certificate chain against configured pins
  bool validateCertificateChain(X509Certificate certificate, String host) {
    if (!_config.enabled) {
      return true; // Pinning disabled
    }

    if (_config.spkiPinsBase64.isEmpty) {
      final event = SecurityEvent.tlsPinning(
        host: host,
        environment: _environment.name,
        result: 'no_pins_configured',
        strictMode: _config.strictMode,
      );
      SecurityTelemetry.logEvent(event);

      // Fail open when no pins configured (avoid self-DoS)
      return true;
    }

    try {
      // Extract SPKI from certificate and compute SHA-256
      final spkiBase64 = computeSpkiSha256Base64(certificate);

      // Check against configured pins
      final matched = _config.spkiPinsBase64.contains(spkiBase64);

      if (matched) {
        final event = SecurityEvent.tlsPinning(
          host: host,
          environment: _environment.name,
          result: 'pin_match',
          strictMode: _config.strictMode,
        );
        SecurityTelemetry.logEvent(event);
        return true;
      } else {
        final event = SecurityEvent.tlsPinning(
          host: host,
          environment: _environment.name,
          result: 'pin_mismatch',
          strictMode: _config.strictMode,
          metadata: {'actualSpki': spkiBase64},
        );
        SecurityTelemetry.logEvent(event);

        // Strict mode: block; warn-only: allow but log
        return !_config.strictMode;
      }
    } catch (e) {
      final event = SecurityEvent.tlsPinning(
        host: host,
        environment: _environment.name,
        result: 'validation_error',
        strictMode: _config.strictMode,
        metadata: {'error': e.toString()},
      );
      SecurityTelemetry.logEvent(event);

      // On error: strict = block, warn-only = allow
      return !_config.strictMode;
    }
  }

  /// User-friendly error message for pinning failure
  static String getUserFacingError() {
    return 'Secure connection to Lythaus failed. '
        'Please try again or contact support if the issue persists.';
  }
}

/// Pinned HTTP client for Dart IO
class PinnedHttpClient implements HttpClient {
  final HttpClient _client;
  final TlsPinningValidator _validator;
  final List<String> _pinnedHosts;

  PinnedHttpClient({
    required HttpClient client,
    required TlsPinningValidator validator,
    required List<String> pinnedHosts,
  }) : _client = client,
       _validator = validator,
       _pinnedHosts = pinnedHosts;

  @override
  bool get autoUncompress => _client.autoUncompress;

  @override
  set autoUncompress(bool value) => _client.autoUncompress = value;

  @override
  Duration? get connectionTimeout => _client.connectionTimeout;

  @override
  set connectionTimeout(Duration? value) => _client.connectionTimeout = value;

  @override
  Duration get idleTimeout => _client.idleTimeout;

  @override
  set idleTimeout(Duration value) => _client.idleTimeout = value;

  @override
  int? get maxConnectionsPerHost => _client.maxConnectionsPerHost;

  @override
  set maxConnectionsPerHost(int? value) =>
      _client.maxConnectionsPerHost = value;

  @override
  String? get userAgent => _client.userAgent;

  @override
  set userAgent(String? value) => _client.userAgent = value;

  @override
  void addCredentials(
    Uri url,
    String realm,
    HttpClientCredentials credentials,
  ) => _client.addCredentials(url, realm, credentials);

  @override
  void addProxyCredentials(
    String host,
    int port,
    String realm,
    HttpClientCredentials credentials,
  ) => _client.addProxyCredentials(host, port, realm, credentials);

  @override
  set authenticate(
    Future<bool> Function(Uri url, String scheme, String? realm)? f,
  ) => _client.authenticate = f;

  @override
  set authenticateProxy(
    Future<bool> Function(String host, int port, String scheme, String? realm)?
    f,
  ) => _client.authenticateProxy = f;

  @override
  set badCertificateCallback(
    bool Function(X509Certificate cert, String host, int port)? callback,
  ) {
    // Override to add pinning validation
    _client.badCertificateCallback = (cert, host, port) {
      // Only validate pinned hosts
      if (_pinnedHosts.contains(host)) {
        final isValid = _validator.validateCertificateChain(cert, host);
        if (!isValid) {
          debugPrint('🚨 TLS pinning validation failed for $host');
        }
        return isValid;
      }

      // For non-pinned hosts, delegate to custom callback if provided
      return callback?.call(cert, host, port) ?? false;
    };
  }

  @override
  void close({bool force = false}) => _client.close(force: force);

  @override
  Future<HttpClientRequest> delete(String host, int port, String path) =>
      _client.delete(host, port, path);

  @override
  Future<HttpClientRequest> deleteUrl(Uri url) => _client.deleteUrl(url);

  @override
  Future<HttpClientRequest> get(String host, int port, String path) =>
      _client.get(host, port, path);

  @override
  Future<HttpClientRequest> getUrl(Uri url) => _client.getUrl(url);

  @override
  Future<HttpClientRequest> head(String host, int port, String path) =>
      _client.head(host, port, path);

  @override
  Future<HttpClientRequest> headUrl(Uri url) => _client.headUrl(url);

  @override
  Future<HttpClientRequest> open(
    String method,
    String host,
    int port,
    String path,
  ) => _client.open(method, host, port, path);

  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) =>
      _client.openUrl(method, url);

  @override
  Future<HttpClientRequest> patch(String host, int port, String path) =>
      _client.patch(host, port, path);

  @override
  Future<HttpClientRequest> patchUrl(Uri url) => _client.patchUrl(url);

  @override
  Future<HttpClientRequest> post(String host, int port, String path) =>
      _client.post(host, port, path);

  @override
  Future<HttpClientRequest> postUrl(Uri url) => _client.postUrl(url);

  @override
  Future<HttpClientRequest> put(String host, int port, String path) =>
      _client.put(host, port, path);

  @override
  Future<HttpClientRequest> putUrl(Uri url) => _client.putUrl(url);

  @override
  set connectionFactory(
    Future<ConnectionTask<Socket>> Function(
      Uri url,
      String? proxyHost,
      int? proxyPort,
    )?
    f,
  ) => _client.connectionFactory = f;

  @override
  set keyLog(void Function(String line)? callback) => _client.keyLog = callback;

  @override
  set findProxy(String Function(Uri url)? f) => _client.findProxy = f;
}

/// Factory for creating pinned HTTP clients
class PinnedHttpClientFactory {
  /// Create a pinned HttpClient for the current environment
  static HttpClient create(EnvironmentConfig config) {
    final baseClient = HttpClient();

    // Extract hosts to pin from API base URL
    final uri = Uri.parse(config.apiBaseUrl);
    final pinnedHosts = [uri.host];

    final validator = TlsPinningValidator(
      config: config.security.tlsPins,
      environment: config.environment,
    );

    final pinnedClient = PinnedHttpClient(
      client: baseClient,
      validator: validator,
      pinnedHosts: pinnedHosts,
    );

    return pinnedClient;
  }
}
