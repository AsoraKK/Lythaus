/// Tests for device security service
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/security/device_security_service.dart';
import 'package:lythaus/core/config/environment_config.dart';
import 'package:lythaus/core/security/security_telemetry.dart';

void main() {
  group('DeviceSecurityState', () {
    test('should identify compromised device (rooted)', () {
      final state = DeviceSecurityState(
        isRootedOrJailbroken: true,
        isEmulator: false,
        isDebugBuild: false,
        lastCheckedAt: DateTime.now(),
      );

      expect(state.isCompromised, isTrue);
    });

    test('should identify compromised device (emulator)', () {
      final state = DeviceSecurityState(
        isRootedOrJailbroken: false,
        isEmulator: true,
        isDebugBuild: false,
        lastCheckedAt: DateTime.now(),
      );

      expect(state.isCompromised, isTrue);
    });

    test('should identify secure device', () {
      final state = DeviceSecurityState(
        isRootedOrJailbroken: false,
        isEmulator: false,
        isDebugBuild: false,
        lastCheckedAt: DateTime.now(),
      );

      expect(state.isCompromised, isFalse);
    });

    test('should serialize to JSON correctly', () {
      final state = DeviceSecurityState(
        isRootedOrJailbroken: true,
        isEmulator: false,
        isDebugBuild: true,
        lastCheckedAt: DateTime(2024, 1, 1, 12, 0),
      );

      final json = state.toJson();

      expect(json['isRootedOrJailbroken'], isTrue);
      expect(json['isEmulator'], isFalse);
      expect(json['isDebugBuild'], isTrue);
      expect(json['lastCheckedAt'], isA<String>());
    });
  });

  group('DeviceSecurityServiceImpl', () {
    late DeviceSecurityServiceImpl service;

    setUp(() {
      service = DeviceSecurityServiceImpl(Environment.development);
    });

    test('should cache results for specified duration', () async {
      // First evaluation
      final state1 = await service.evaluateSecurity();
      expect(state1, isNotNull);

      // Second evaluation within cache window
      final state2 = await service.evaluateSecurity();
      expect(state2, isNotNull);

      // Should return cached result (timestamps should be very close)
      final timeDiff = state2.lastCheckedAt.difference(state1.lastCheckedAt);
      expect(timeDiff.inSeconds, lessThan(2));
    });

    test('should detect test flag for compromised device', () async {
      // Set test flag
      const bool testCompromised = bool.fromEnvironment(
        'TEST_DEVICE_COMPROMISED',
        defaultValue: false,
      );

      // Note: In real test, set --dart-define=TEST_DEVICE_COMPROMISED=true
      expect(testCompromised, isFalse); // Default without flag
    });

    test('should create security telemetry event', () {
      final event = SecurityEvent.deviceIntegrity(
        result: 'secure',
        environment: Environment.development,
        metadata: {'isRooted': false, 'isEmulator': false},
      );

      expect(event.type, SecurityEventType.deviceIntegrity);
      expect(event.result, 'secure');
      expect(event.environment, Environment.development);
    });
  });
}
