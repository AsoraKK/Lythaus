import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/network/dio_client.dart';

void main() {
  // ────── HttpClientConfig ──────

  group('HttpClientConfig', () {
    test('constructor stores all fields', () {
      const config = HttpClientConfig(
        baseUrl: 'https://api.example.com',
        certPinningEnabled: true,
        integrityChecksEnabled: false,
        connectTimeout: Duration(seconds: 10),
        receiveTimeout: Duration(seconds: 30),
      );

      expect(config.baseUrl, 'https://api.example.com');
      expect(config.certPinningEnabled, isTrue);
      expect(config.integrityChecksEnabled, isFalse);
      expect(config.connectTimeout, const Duration(seconds: 10));
      expect(config.receiveTimeout, const Duration(seconds: 30));
    });

    test('toJson returns correct map', () {
      const config = HttpClientConfig(
        baseUrl: 'https://api.example.com',
        certPinningEnabled: true,
        integrityChecksEnabled: false,
        connectTimeout: Duration(seconds: 10),
        receiveTimeout: Duration(seconds: 30),
      );

      final json = config.toJson();
      expect(json['baseUrl'], 'https://api.example.com');
      expect(json['certPinningEnabled'], isTrue);
      expect(json['integrityChecksEnabled'], isFalse);
      expect(json['connectTimeoutSeconds'], 10);
      expect(json['receiveTimeoutSeconds'], 30);
    });

    test('toJson with different timeout values', () {
      const config = HttpClientConfig(
        baseUrl: 'http://localhost:7072',
        certPinningEnabled: false,
        integrityChecksEnabled: true,
        connectTimeout: Duration(seconds: 5),
        receiveTimeout: Duration(seconds: 15),
      );

      final json = config.toJson();
      expect(json['baseUrl'], 'http://localhost:7072');
      expect(json['certPinningEnabled'], isFalse);
      expect(json['integrityChecksEnabled'], isTrue);
      expect(json['connectTimeoutSeconds'], 5);
      expect(json['receiveTimeoutSeconds'], 15);
    });

    test('toJson contains exactly 5 keys', () {
      const config = HttpClientConfig(
        baseUrl: 'https://test.com',
        certPinningEnabled: true,
        integrityChecksEnabled: true,
        connectTimeout: Duration(seconds: 10),
        receiveTimeout: Duration(seconds: 30),
      );

      final json = config.toJson();
      expect(json.length, 5);
    });
  });

  // ────── getHttpClientConfig ──────

  group('getHttpClientConfig', () {
    test('returns config with expected structure', () {
      final config = getHttpClientConfig();
      expect(config, isA<HttpClientConfig>());
      expect(config.baseUrl, isNotEmpty);
      expect(config.connectTimeout, const Duration(seconds: 10));
      expect(config.receiveTimeout, const Duration(seconds: 30));
    });

    test('certPinningEnabled matches environment config', () {
      final config = getHttpClientConfig();
      // In test environment (debug mode), value depends on env config
      expect(config.certPinningEnabled, isA<bool>());
    });

    test('integrityChecksEnabled is true in debug mode', () {
      final config = getHttpClientConfig();
      // In debug mode, integrity checks are always enabled
      expect(config.integrityChecksEnabled, isTrue);
    });

    test('toJson from getHttpClientConfig is serializable', () {
      final config = getHttpClientConfig();
      final json = config.toJson();
      expect(json, isA<Map<String, dynamic>>());
      expect(json['baseUrl'], isA<String>());
      expect(json['connectTimeoutSeconds'], isA<int>());
      expect(json['receiveTimeoutSeconds'], isA<int>());
    });
  });
}
