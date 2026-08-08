import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/security/tls_pinning.dart';
import 'package:lythaus/core/config/environment_config.dart';

/// Minimal X509Certificate stub for testing.
class _FakeCert implements X509Certificate {
  @override
  Uint8List get der => Uint8List.fromList(List.generate(100, (i) => i));

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  // ─── TlsPinningValidator ───
  group('TlsPinningValidator', () {
    test('returns true when pinning is disabled', () {
      const config = TlsPinConfig(
        enabled: false,
        strictMode: false,
        spkiPinsBase64: [],
      );
      final validator = TlsPinningValidator(
        config: config,
        environment: Environment.development,
      );
      final result = validator.validateCertificateChain(
        _FakeCert(),
        'example.com',
      );
      expect(result, isTrue);
    });

    test('returns true when no pins configured (fail open)', () {
      const config = TlsPinConfig(
        enabled: true,
        strictMode: true,
        spkiPinsBase64: [],
      );
      final validator = TlsPinningValidator(
        config: config,
        environment: Environment.development,
      );
      final result = validator.validateCertificateChain(
        _FakeCert(),
        'example.com',
      );
      expect(result, isTrue);
    });

    test('returns false for mismatch in strict mode', () {
      const config = TlsPinConfig(
        enabled: true,
        strictMode: true,
        spkiPinsBase64: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='],
      );
      final validator = TlsPinningValidator(
        config: config,
        environment: Environment.production,
      );
      // The fake cert SPKI hash won't match the pin
      final result = validator.validateCertificateChain(
        _FakeCert(),
        'example.com',
      );
      expect(result, isFalse);
    });

    test('returns true for mismatch in warn-only mode', () {
      const config = TlsPinConfig(
        enabled: true,
        strictMode: false,
        spkiPinsBase64: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='],
      );
      final validator = TlsPinningValidator(
        config: config,
        environment: Environment.production,
      );
      final result = validator.validateCertificateChain(
        _FakeCert(),
        'example.com',
      );
      expect(result, isTrue);
    });

    test('getUserFacingError returns a string', () {
      final msg = TlsPinningValidator.getUserFacingError();
      expect(msg, contains('Lythaus'));
      expect(msg, contains('Secure connection'));
    });
  });

  // ─── PinnedHttpClient ───
  group('PinnedHttpClient', () {
    test('delegates basic properties', () {
      final baseClient = HttpClient();
      const config = TlsPinConfig(
        enabled: false,
        strictMode: false,
        spkiPinsBase64: [],
      );
      final validator = TlsPinningValidator(
        config: config,
        environment: Environment.development,
      );
      final pinned = PinnedHttpClient(
        client: baseClient,
        validator: validator,
        pinnedHosts: ['example.com'],
      );

      // Test delegated getters/setters
      expect(pinned.autoUncompress, baseClient.autoUncompress);
      expect(pinned.connectionTimeout, baseClient.connectionTimeout);
      expect(pinned.idleTimeout, baseClient.idleTimeout);
      expect(pinned.maxConnectionsPerHost, baseClient.maxConnectionsPerHost);

      pinned.autoUncompress = false;
      expect(baseClient.autoUncompress, isFalse);

      pinned.idleTimeout = const Duration(seconds: 5);
      expect(baseClient.idleTimeout, const Duration(seconds: 5));

      pinned.maxConnectionsPerHost = 3;
      expect(baseClient.maxConnectionsPerHost, 3);

      pinned.close();
    });

    test('close delegates to inner client', () {
      final baseClient = HttpClient();
      const config = TlsPinConfig(
        enabled: false,
        strictMode: false,
        spkiPinsBase64: [],
      );
      final validator = TlsPinningValidator(
        config: config,
        environment: Environment.development,
      );
      final pinned = PinnedHttpClient(
        client: baseClient,
        validator: validator,
        pinnedHosts: [],
      );

      // No throw = success
      pinned.close(force: true);
    });

    test('userAgent getter/setter delegates', () {
      final baseClient = HttpClient();
      const config = TlsPinConfig(
        enabled: false,
        strictMode: false,
        spkiPinsBase64: [],
      );
      final validator = TlsPinningValidator(
        config: config,
        environment: Environment.development,
      );
      final pinned = PinnedHttpClient(
        client: baseClient,
        validator: validator,
        pinnedHosts: [],
      );

      pinned.userAgent = 'TestAgent';
      expect(pinned.userAgent, 'TestAgent');
      expect(baseClient.userAgent, 'TestAgent');

      pinned.close();
    });
  });

  // ─── PinnedHttpClientFactory ───
  group('PinnedHttpClientFactory', () {
    test('create returns HttpClient', () {
      final config = EnvironmentConfig.fromEnvironment();
      final client = PinnedHttpClientFactory.create(config);
      expect(client, isA<HttpClient>());
      client.close();
    });
  });
}
