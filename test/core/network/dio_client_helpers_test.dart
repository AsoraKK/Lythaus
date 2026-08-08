import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/network/dio_client.dart';

void main() {
  group('HttpClientConfig', () {
    test('stores all fields correctly', () {
      const config = HttpClientConfig(
        baseUrl: 'https://api.example.com',
        certPinningEnabled: true,
        integrityChecksEnabled: true,
        connectTimeout: Duration(seconds: 10),
        receiveTimeout: Duration(seconds: 30),
      );

      expect(config.baseUrl, 'https://api.example.com');
      expect(config.certPinningEnabled, isTrue);
      expect(config.integrityChecksEnabled, isTrue);
      expect(config.connectTimeout, const Duration(seconds: 10));
      expect(config.receiveTimeout, const Duration(seconds: 30));
    });

    test('toJson includes all fields', () {
      const config = HttpClientConfig(
        baseUrl: 'https://api.example.com',
        certPinningEnabled: false,
        integrityChecksEnabled: true,
        connectTimeout: Duration(seconds: 5),
        receiveTimeout: Duration(seconds: 15),
      );

      final json = config.toJson();
      expect(json['baseUrl'], 'https://api.example.com');
      expect(json['certPinningEnabled'], isFalse);
      expect(json['integrityChecksEnabled'], isTrue);
      expect(json['connectTimeoutSeconds'], 5);
      expect(json['receiveTimeoutSeconds'], 15);
    });

    test('toJson with zero timeout', () {
      const config = HttpClientConfig(
        baseUrl: 'http://localhost',
        certPinningEnabled: false,
        integrityChecksEnabled: false,
        connectTimeout: Duration.zero,
        receiveTimeout: Duration.zero,
      );

      final json = config.toJson();
      expect(json['connectTimeoutSeconds'], 0);
      expect(json['receiveTimeoutSeconds'], 0);
    });
  });

  group('getHttpClientConfig', () {
    test('returns HttpClientConfig with expected structure', () {
      final config = getHttpClientConfig();
      expect(config, isA<HttpClientConfig>());
      expect(config.baseUrl, isNotEmpty);
      expect(config.connectTimeout, isA<Duration>());
      expect(config.receiveTimeout, isA<Duration>());
    });

    test('toJson round trip produces valid map', () {
      final config = getHttpClientConfig();
      final json = config.toJson();
      expect(json, isA<Map<String, dynamic>>());
      expect(json.containsKey('baseUrl'), isTrue);
      expect(json.containsKey('certPinningEnabled'), isTrue);
      expect(json.containsKey('integrityChecksEnabled'), isTrue);
    });
  });
}
