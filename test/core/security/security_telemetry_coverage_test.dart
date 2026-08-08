import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/security/security_telemetry.dart';
import 'package:lythaus/core/config/environment_config.dart';

void main() {
  group('SecurityEvent', () {
    test('tlsPinning factory creates event with correct fields', () {
      final event = SecurityEvent.tlsPinning(
        host: 'api.lythaus.com',
        environment: 'production',
        result: 'pin_match',
        strictMode: true,
        metadata: {'extra': 'data'},
      );
      expect(event.type, SecurityEventType.tlsPinning);
      expect(event.result, 'pin_match');
      expect(event.host, 'api.lythaus.com');
      expect(event.strictMode, isTrue);
      final json = event.toJson();
      expect(json['event_type'], 'tlsPinning');
      expect(json['result'], 'pin_match');
      expect(json['host'], 'api.lythaus.com');
      expect(json['strict_mode'], true);
      expect(json['extra'], 'data');
      expect(json['environment'], 'production');
      expect(json.containsKey('timestamp'), isTrue);
      expect(json.containsKey('platform'), isTrue);
    });

    test('deviceIntegrity factory creates event correctly', () {
      final event = SecurityEvent.deviceIntegrity(
        result: 'blocked',
        environment: Environment.production,
        reason: 'rooted device',
        metadata: {'os': 'android'},
      );
      expect(event.type, SecurityEventType.deviceIntegrity);
      expect(event.result, 'blocked');
      expect(event.environment, Environment.production);
      expect(event.reason, 'rooted device');
      final json = event.toJson();
      expect(json['environment'], 'production');
      expect(json['reason'], 'rooted device');
      expect(json['os'], 'android');
    });

    test('integrityGuard factory creates event correctly', () {
      final event = SecurityEvent.integrityGuard(
        result: 'allowed_with_warning',
        environment: Environment.preview,
        useCase: 'post_creation',
        reason: 'dev override',
        strictMode: false,
        metadata: {'action': 'warn'},
      );
      expect(event.type, SecurityEventType.integrityGuard);
      expect(event.result, 'allowed_with_warning');
      expect(event.useCase, 'post_creation');
      final json = event.toJson();
      expect(json['environment'], 'preview');
      expect(json['use_case'], 'post_creation');
      expect(json['strict_mode'], false);
      expect(json['reason'], 'dev override');
      expect(json['action'], 'warn');
    });

    test('securityOverride factory creates event correctly', () {
      final event = SecurityEvent.securityOverride(
        result: 'override_applied',
        environment: Environment.development,
        reason: 'debug flag set',
        metadata: {'source': 'env_var'},
      );
      expect(event.type, SecurityEventType.securityOverride);
      expect(event.result, 'override_applied');
      expect(event.environment, Environment.development);
      expect(event.reason, 'debug flag set');
      final json = event.toJson();
      expect(json['event_type'], 'securityOverride');
      expect(json['environment'], 'development');
      expect(json['source'], 'env_var');
    });

    test('toJson excludes null fields', () {
      final event = SecurityEvent.deviceIntegrity(
        result: 'ok',
        environment: Environment.development,
      );
      final json = event.toJson();
      expect(json.containsKey('host'), isFalse);
      expect(json.containsKey('strict_mode'), isFalse);
      expect(json.containsKey('use_case'), isFalse);
      expect(json.containsKey('reason'), isFalse);
    });
  });

  group('SecurityTelemetry', () {
    test('logEvent does not throw', () {
      final event = SecurityEvent.tlsPinning(
        host: 'api.lythaus.co',
        environment: 'dev',
        result: 'pin_match',
        strictMode: false,
      );
      expect(() => SecurityTelemetry.logEvent(event), returnsNormally);
    });

    test('logConfigSnapshot does not throw', () {
      const config = EnvironmentConfig(
        environment: Environment.development,
        apiBaseUrl: 'http://localhost:7072',
        security: MobileSecurityConfig(
          tlsPins: TlsPinConfig(
            enabled: true,
            strictMode: false,
            spkiPinsBase64: ['pin1', 'pin2'],
          ),
          strictDeviceIntegrity: false,
          blockRootedDevices: false,
        ),
      );
      expect(
        () => SecurityTelemetry.logConfigSnapshot(config),
        returnsNormally,
      );
    });
  });
}
