/// Tests for security overrides
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/security/security_overrides.dart';

void main() {
  group('SecurityOverrideConfig', () {
    test('should create default config with no overrides', () {
      const config = SecurityOverrideConfig();

      expect(config.relaxTlsPinning, isFalse);
      expect(config.relaxDeviceIntegrity, isFalse);
      expect(config.hasAnyOverride, isFalse);
    });

    test('should create QA override with reason', () {
      final config = SecurityOverrideConfig.forQa(
        reason: 'Testing payment flow',
        relaxDeviceIntegrity: true,
      );

      expect(config.relaxDeviceIntegrity, isTrue);
      expect(config.overrideReason, contains('QA:'));
      expect(config.overrideReason, contains('Testing payment flow'));
      expect(config.hasAnyOverride, isTrue);
    });

    test('should create support override with ticket ID', () {
      final config = SecurityOverrideConfig.forSupport(
        ticketId: 'SUPPORT-12345',
        relaxTlsPinning: true,
      );

      expect(config.relaxTlsPinning, isTrue);
      expect(config.overrideReason, contains('Support ticket:'));
      expect(config.overrideReason, contains('SUPPORT-12345'));
      expect(config.hasAnyOverride, isTrue);
    });

    test('should validate expiry correctly', () {
      final config = SecurityOverrideConfig(
        relaxDeviceIntegrity: true,
        overrideReason: 'Test',
        activatedAt: DateTime.now(),
        validityDuration: const Duration(hours: 24),
      );

      expect(config.isValid(), isTrue);
      expect(config.timeRemaining, isNotNull);
      expect(config.timeRemaining!.inHours, lessThanOrEqualTo(24));
    });

    test('should detect expired override', () {
      final config = SecurityOverrideConfig(
        relaxDeviceIntegrity: true,
        overrideReason: 'Expired test',
        activatedAt: DateTime.now().subtract(const Duration(hours: 25)),
        validityDuration: const Duration(hours: 24),
      );

      expect(config.isValid(), isFalse);
      expect(config.timeRemaining, isNull);
    });

    test('should serialize to JSON correctly', () {
      final config = SecurityOverrideConfig.forQa(
        reason: 'Testing',
        relaxTlsPinning: true,
        validFor: const Duration(hours: 12),
      );

      final json = config.toJson();

      expect(json['relaxTlsPinning'], isTrue);
      expect(json['relaxDeviceIntegrity'], isFalse);
      expect(json['overrideReason'], contains('Testing'));
      expect(json['isValid'], isTrue);
      expect(json['validityDuration'], equals(12 * 3600));
    });

    test('should support copyWith', () {
      final original = SecurityOverrideConfig.forQa(
        reason: 'Original',
        relaxDeviceIntegrity: true,
      );

      final modified = original.copyWith(relaxTlsPinning: true);

      expect(modified.relaxDeviceIntegrity, isTrue); // From original
      expect(modified.relaxTlsPinning, isTrue); // New value
      expect(modified.overrideReason, equals(original.overrideReason));
    });
  });

  group('SecurityOverridesProvider', () {
    setUp(() {
      // Clear overrides before each test
      SecurityOverridesProvider.clear();
    });

    tearDown(() {
      // Clean up after each test
      SecurityOverridesProvider.clear();
    });

    test('should start with no overrides', () {
      final current = SecurityOverridesProvider.current;

      expect(current.hasAnyOverride, isFalse);
      expect(SecurityOverridesProvider.hasActiveOverrides, isFalse);
    });

    test('should throw error when setting override without reason', () {
      final invalidConfig = SecurityOverrideConfig(
        relaxDeviceIntegrity: true,
        overrideReason: null, // Missing reason
        activatedAt: DateTime.now(),
      );

      expect(
        () => SecurityOverridesProvider.set(invalidConfig),
        throwsArgumentError,
      );
    });

    test('should allow setting valid override', () {
      final config = SecurityOverrideConfig.forQa(
        reason: 'Test scenario',
        relaxDeviceIntegrity: true,
      );

      SecurityOverridesProvider.set(config);

      expect(SecurityOverridesProvider.current.hasAnyOverride, isTrue);
      expect(SecurityOverridesProvider.hasActiveOverrides, isTrue);
    });

    test('should clear overrides', () {
      final config = SecurityOverrideConfig.forQa(
        reason: 'Test',
        relaxTlsPinning: true,
      );

      SecurityOverridesProvider.set(config);
      expect(SecurityOverridesProvider.hasActiveOverrides, isTrue);

      SecurityOverridesProvider.clear();
      expect(SecurityOverridesProvider.hasActiveOverrides, isFalse);
    });

    test('should detect expired overrides as inactive', () {
      final expiredConfig = SecurityOverrideConfig(
        relaxDeviceIntegrity: true,
        overrideReason: 'Expired',
        activatedAt: DateTime.now().subtract(const Duration(hours: 25)),
        validityDuration: const Duration(hours: 24),
      );

      SecurityOverridesProvider.set(expiredConfig);

      // Has override but not active due to expiry
      expect(SecurityOverridesProvider.current.hasAnyOverride, isTrue);
      expect(SecurityOverridesProvider.hasActiveOverrides, isFalse);
    });
  });
}
