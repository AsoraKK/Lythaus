import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/config/environment_config.dart';

void main() {
  group('Environment', () {
    test('current defaults to development', () {
      // Without build-time ENVIRONMENT variable, should default to dev
      expect(Environment.current, Environment.development);
    });

    test('isDev returns true for development', () {
      expect(Environment.development.isDev, isTrue);
      expect(Environment.development.isPreview, isFalse);
      expect(Environment.development.isProd, isFalse);
    });

    test('isPreview returns true for preview', () {
      expect(Environment.preview.isDev, isFalse);
      expect(Environment.preview.isPreview, isTrue);
      expect(Environment.preview.isProd, isFalse);
    });

    test('isProd returns true for production', () {
      expect(Environment.production.isDev, isFalse);
      expect(Environment.production.isPreview, isFalse);
      expect(Environment.production.isProd, isTrue);
    });

    test('enum has all expected values', () {
      expect(Environment.values, hasLength(3));
      expect(
        Environment.values,
        containsAll([
          Environment.development,
          Environment.preview,
          Environment.production,
        ]),
      );
    });
  });

  group('TlsPinConfig', () {
    test('constructs with required fields', () {
      const config = TlsPinConfig(
        enabled: true,
        strictMode: false,
        spkiPinsBase64: ['pin1', 'pin2'],
      );

      expect(config.enabled, isTrue);
      expect(config.strictMode, isFalse);
      expect(config.lifecycleState, PinLifecycleState.live);
      expect(config.spkiPinsBase64, hasLength(2));
    });

    test('toJson returns correct map', () {
      const config = TlsPinConfig(
        enabled: true,
        strictMode: true,
        spkiPinsBase64: ['a', 'b', 'c'],
      );

      final json = config.toJson();

      expect(json['enabled'], isTrue);
      expect(json['strictMode'], isTrue);
      expect(json['lifecycleState'], PinLifecycleState.live.name);
      expect(json['pinCount'], 3);
    });

    test('supports explicit non-live lifecycle states', () {
      const config = TlsPinConfig(
        enabled: true,
        strictMode: true,
        lifecycleState: PinLifecycleState.planned,
        spkiPinsBase64: [],
      );

      expect(config.lifecycleState, PinLifecycleState.planned);
      expect(config.toJson()['lifecycleState'], PinLifecycleState.planned.name);
    });

    test('empty pins list has zero pinCount', () {
      const config = TlsPinConfig(
        enabled: false,
        strictMode: false,
        spkiPinsBase64: [],
      );

      expect(config.toJson()['pinCount'], 0);
    });
  });

  group('MobileSecurityConfig', () {
    test('constructs with required fields', () {
      const config = MobileSecurityConfig(
        tlsPins: TlsPinConfig(
          enabled: true,
          strictMode: true,
          spkiPinsBase64: [],
        ),
        strictDeviceIntegrity: true,
        blockRootedDevices: true,
      );

      expect(config.strictDeviceIntegrity, isTrue);
      expect(config.blockRootedDevices, isTrue);
      expect(config.allowRootedInPreviewForQa, isFalse);
    });

    test('allowRootedInPreviewForQa defaults to false', () {
      const config = MobileSecurityConfig(
        tlsPins: TlsPinConfig(
          enabled: false,
          strictMode: false,
          spkiPinsBase64: [],
        ),
        strictDeviceIntegrity: false,
        blockRootedDevices: false,
      );

      expect(config.allowRootedInPreviewForQa, isFalse);
    });

    test('toJson returns correct structure', () {
      const config = MobileSecurityConfig(
        tlsPins: TlsPinConfig(
          enabled: true,
          strictMode: false,
          spkiPinsBase64: ['pin1'],
        ),
        strictDeviceIntegrity: true,
        blockRootedDevices: false,
        allowRootedInPreviewForQa: true,
      );

      final json = config.toJson();

      expect(json['strictDeviceIntegrity'], isTrue);
      expect(json['blockRootedDevices'], isFalse);
      expect(json['allowRootedInPreviewForQa'], isTrue);
      expect(json['tlsPins'], isA<Map<String, dynamic>>());
      expect(json['tlsPins']['pinCount'], 1);
    });
  });

  group('EnvironmentConfig', () {
    test('constructs with required fields', () {
      const config = EnvironmentConfig(
        environment: Environment.development,
        apiBaseUrl: 'http://localhost:7072/api',
        security: MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: false,
            strictMode: false,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: false,
          blockRootedDevices: false,
        ),
      );

      expect(config.environment, Environment.development);
      expect(config.apiBaseUrl, contains('localhost'));
    });

    test('fromEnvironment returns a valid configuration', () {
      final config = EnvironmentConfig.fromEnvironment();

      expect(config.environment, isNotNull);
      expect(config.apiBaseUrl, isNotEmpty);
      expect(config.security, isNotNull);
      expect(config.security.tlsPins.enabled, isNotNull);
    });

    test('toJson returns correct structure', () {
      const config = EnvironmentConfig(
        environment: Environment.production,
        apiBaseUrl: 'https://example.com/api',
        security: MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: true,
            strictMode: true,
            spkiPinsBase64: [],
          ),
          strictDeviceIntegrity: true,
          blockRootedDevices: true,
        ),
      );

      final json = config.toJson();

      expect(json['environment'], 'production');
      expect(json['apiBaseUrl'], 'https://example.com/api');
      expect(json['security'], isA<Map<String, dynamic>>());
    });

    test('dev config has non-strict device integrity', () {
      // fromEnvironment defaults to dev in test
      final config = EnvironmentConfig.fromEnvironment();

      expect(config.security.strictDeviceIntegrity, isFalse);
      expect(config.security.blockRootedDevices, isFalse);
    });

    test('dev config keeps strict TLS pinning disabled for MVP', () {
      final config = EnvironmentConfig.fromEnvironment();

      expect(config.security.tlsPins.enabled, isFalse);
      expect(config.security.tlsPins.strictMode, isFalse);
      expect(
        config.security.tlsPins.lifecycleState,
        PinLifecycleState.disabled,
      );
      expect(config.security.tlsPins.spkiPinsBase64, isEmpty);
    });
  });
}
