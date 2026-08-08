import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/network/dio_client.dart';

void main() {
  // ─── HttpClientConfig ───
  group('HttpClientConfig', () {
    test('stores all fields', () {
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
        connectTimeout: Duration(seconds: 15),
        receiveTimeout: Duration(seconds: 60),
      );

      final json = config.toJson();
      expect(json['baseUrl'], 'https://api.example.com');
      expect(json['certPinningEnabled'], isFalse);
      expect(json['integrityChecksEnabled'], isTrue);
      expect(json['connectTimeoutSeconds'], 15);
      expect(json['receiveTimeoutSeconds'], 60);
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

  // ─── getHttpClientConfig ───
  group('getHttpClientConfig', () {
    test('returns HttpClientConfig with expected structure', () {
      final config = getHttpClientConfig();
      expect(config, isA<HttpClientConfig>());
      expect(config.baseUrl, isNotEmpty);
      expect(config.connectTimeout.inSeconds, greaterThan(0));
      expect(config.receiveTimeout.inSeconds, greaterThan(0));
    });

    test('toJson round trip', () {
      final config = getHttpClientConfig();
      final json = config.toJson();
      expect(json, isA<Map<String, dynamic>>());
      expect(json.containsKey('baseUrl'), isTrue);
      expect(json.containsKey('certPinningEnabled'), isTrue);
      expect(json.containsKey('integrityChecksEnabled'), isTrue);
    });
  });
}
