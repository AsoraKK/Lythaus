/// Tests for TLS pinning validator
///
/// Note: Full integration tests with real X509Certificate require network calls
/// to actual backends. These unit tests focus on configuration and logic paths.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/security/tls_pinning.dart';
import 'package:lythaus/core/config/environment_config.dart';

void main() {
  group('TlsPinConfig', () {
    test('should store pinning configuration correctly', () {
      const config = TlsPinConfig(
        enabled: true,
        strictMode: true,
        spkiPinsBase64: ['sAgmPn4rf81EWKQFg+momPe9NFYswENqbsBnpcm16jM='],
      );

      expect(config.enabled, isTrue);
      expect(config.strictMode, isTrue);
      expect(config.spkiPinsBase64.length, equals(1));
    });

    test('should support multiple pins for rotation', () {
      const config = TlsPinConfig(
        enabled: true,
        strictMode: true,
        spkiPinsBase64: ['oldPinHash==', 'currentPinHash==', 'newPinHash=='],
      );

      expect(config.spkiPinsBase64.length, equals(3));
    });

    test('should allow disabled configuration', () {
      const config = TlsPinConfig(
        enabled: false,
        strictMode: false,
        spkiPinsBase64: [],
      );

      expect(config.enabled, isFalse);
    });

    test('should support warn-only mode', () {
      const config = TlsPinConfig(
        enabled: true,
        strictMode: false, // Warn-only
        spkiPinsBase64: ['somePinHash=='],
      );

      expect(config.enabled, isTrue);
      expect(config.strictMode, isFalse);
    });
  });

  group('PinnedHttpClientFactory', () {
    test('should create client from environment config', () {
      const envConfig = EnvironmentConfig(
        environment: Environment.development,
        apiBaseUrl: 'https://api.lythaus.co/api',
        security: MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: true,
            strictMode: false,
            spkiPinsBase64: ['sAgmPn4rf81EWKQFg+momPe9NFYswENqbsBnpcm16jM='],
          ),
          strictDeviceIntegrity: false,
          blockRootedDevices: false,
          allowRootedInPreviewForQa: true,
        ),
      );

      final client = PinnedHttpClientFactory.create(envConfig);

      // Client is created successfully
      expect(client, isNotNull);
      expect(client, isA<PinnedHttpClient>());
    });

    test('should extract hostname from API base URL', () {
      const envConfig = EnvironmentConfig(
        environment: Environment.preview,
        apiBaseUrl: 'https://api.lythaus.co/api',
        security: MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: true,
            strictMode: true,
            spkiPinsBase64: ['TODO_PREVIEW_PIN'],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
          allowRootedInPreviewForQa: false,
        ),
      );

      // Test URI parsing
      final uri = Uri.parse(envConfig.apiBaseUrl);
      expect(uri.host, equals('api.lythaus.co'));
    });
  });
}
