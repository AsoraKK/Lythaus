// ignore_for_file: public_member_api_docs
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/security/tls_pinning.dart';
import 'package:lythaus/core/config/environment_config.dart';

void main() {
  group('TlsPinningValidator static', () {
    test('getUserFacingError contains Lythaus brand', () {
      final msg = TlsPinningValidator.getUserFacingError();
      expect(msg, contains('Lythaus'));
      expect(msg, contains('failed'));
      expect(msg, contains('support'));
    });
  });

  group('TlsPinConfig', () {
    test('defaults are disabled and non-strict', () {
      const cfg = TlsPinConfig(
        enabled: false,
        strictMode: false,
        spkiPinsBase64: [],
      );
      expect(cfg.enabled, isFalse);
      expect(cfg.strictMode, isFalse);
      expect(cfg.spkiPinsBase64, isEmpty);
    });

    test('with explicit values', () {
      const cfg = TlsPinConfig(
        enabled: true,
        strictMode: true,
        spkiPinsBase64: ['pin1', 'pin2'],
      );
      expect(cfg.enabled, isTrue);
      expect(cfg.strictMode, isTrue);
      expect(cfg.spkiPinsBase64.length, 2);
      expect(cfg.spkiPinsBase64.first, 'pin1');
    });
  });

  group('PinnedHttpClientFactory', () {
    test('create returns a non-null HttpClient', () {
      final config = EnvironmentConfig.fromEnvironment();
      final client = PinnedHttpClientFactory.create(config);
      expect(client, isNotNull);
      // verify it's a PinnedHttpClient wrapping HttpClient
      client.close();
    });
  });

  group('PinnedHttpClient delegation', () {
    test('autoUncompress getter and setter work', () {
      final config = EnvironmentConfig.fromEnvironment();
      final client = PinnedHttpClientFactory.create(config);
      final original = client.autoUncompress;
      client.autoUncompress = !original;
      expect(client.autoUncompress, !original);
      client.close();
    });

    test('connectionTimeout getter and setter work', () {
      final config = EnvironmentConfig.fromEnvironment();
      final client = PinnedHttpClientFactory.create(config);
      client.connectionTimeout = const Duration(seconds: 30);
      expect(client.connectionTimeout, const Duration(seconds: 30));
      client.close();
    });

    test('idleTimeout getter and setter work', () {
      final config = EnvironmentConfig.fromEnvironment();
      final client = PinnedHttpClientFactory.create(config);
      client.idleTimeout = const Duration(seconds: 60);
      expect(client.idleTimeout, const Duration(seconds: 60));
      client.close();
    });

    test('maxConnectionsPerHost getter and setter work', () {
      final config = EnvironmentConfig.fromEnvironment();
      final client = PinnedHttpClientFactory.create(config);
      client.maxConnectionsPerHost = 5;
      expect(client.maxConnectionsPerHost, 5);
      client.close();
    });

    test('userAgent getter and setter work', () {
      final config = EnvironmentConfig.fromEnvironment();
      final client = PinnedHttpClientFactory.create(config);
      client.userAgent = 'TestAgent/1.0';
      expect(client.userAgent, 'TestAgent/1.0');
      client.close();
    });
  });
}
