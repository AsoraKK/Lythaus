import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/security/device_security_service.dart';

void main() {
  // ─── DeviceSecurityState model ───
  group('DeviceSecurityState', () {
    test('isCompromised true when rooted', () {
      final s = DeviceSecurityState(
        isRootedOrJailbroken: true,
        isEmulator: false,
        isDebugBuild: false,
        lastCheckedAt: DateTime(2024, 1, 1),
      );
      expect(s.isCompromised, isTrue);
    });

    test('isCompromised true when emulator', () {
      final s = DeviceSecurityState(
        isRootedOrJailbroken: false,
        isEmulator: true,
        isDebugBuild: false,
        lastCheckedAt: DateTime(2024, 1, 1),
      );
      expect(s.isCompromised, isTrue);
    });

    test('isCompromised true when both', () {
      final s = DeviceSecurityState(
        isRootedOrJailbroken: true,
        isEmulator: true,
        isDebugBuild: true,
        lastCheckedAt: DateTime(2024, 1, 1),
      );
      expect(s.isCompromised, isTrue);
    });

    test('isCompromised false when neither', () {
      final s = DeviceSecurityState(
        isRootedOrJailbroken: false,
        isEmulator: false,
        isDebugBuild: false,
        lastCheckedAt: DateTime(2024, 1, 1),
      );
      expect(s.isCompromised, isFalse);
    });

    test('toJson includes all fields', () {
      final now = DateTime(2024, 6, 15, 10, 30);
      final s = DeviceSecurityState(
        isRootedOrJailbroken: true,
        isEmulator: false,
        isDebugBuild: true,
        lastCheckedAt: now,
      );
      final json = s.toJson();
      expect(json['isRootedOrJailbroken'], isTrue);
      expect(json['isEmulator'], isFalse);
      expect(json['isDebugBuild'], isTrue);
      expect(json['lastCheckedAt'], now.toIso8601String());
      expect(json['platform'], isA<String>());
    });

    test('toJson with all false', () {
      final s = DeviceSecurityState(
        isRootedOrJailbroken: false,
        isEmulator: false,
        isDebugBuild: false,
        lastCheckedAt: DateTime(2024, 1, 1),
      );
      final json = s.toJson();
      expect(json['isRootedOrJailbroken'], isFalse);
      expect(json['isEmulator'], isFalse);
      expect(json['isDebugBuild'], isFalse);
    });
  });
}
