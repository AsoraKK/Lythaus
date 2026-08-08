// ignore_for_file: public_member_api_docs
import 'package:flutter_test/flutter_test.dart';

import 'package:lythaus/core/security/security_overrides.dart';

void main() {
  group('SecurityOverrideConfig.none factory', () {
    test('creates config with all defaults', () {
      final config = SecurityOverrideConfig.none();
      expect(config.relaxTlsPinning, isFalse);
      expect(config.relaxDeviceIntegrity, isFalse);
      expect(config.overrideReason, isNull);
      expect(config.activatedAt, isNull);
      expect(config.validityDuration, isNull);
      expect(config.hasAnyOverride, isFalse);
      expect(config.isValid(), isFalse);
    });
  });

  group('SecurityOverrideConfig.forSupport factory', () {
    test('creates config with support ticket reason', () {
      final config = SecurityOverrideConfig.forSupport(
        ticketId: 'TICKET-123',
        relaxTlsPinning: true,
      );
      expect(config.relaxTlsPinning, isTrue);
      expect(config.relaxDeviceIntegrity, isFalse);
      expect(config.overrideReason, contains('Support ticket'));
      expect(config.overrideReason, contains('TICKET-123'));
      expect(config.activatedAt, isNotNull);
      expect(config.validityDuration, const Duration(hours: 48));
      expect(config.isValid(), isTrue);
    });
  });

  group('SecurityOverrideConfig copyWith activatedAt and validityDuration', () {
    test('copyWith overrides activatedAt', () {
      final original = SecurityOverrideConfig.forQa(
        reason: 'test',
        relaxDeviceIntegrity: true,
      );
      final pastDate = DateTime(2020, 1, 1);
      final updated = original.copyWith(activatedAt: pastDate);
      expect(updated.activatedAt, pastDate);
      expect(updated.isValid(), isFalse);
    });

    test('copyWith overrides validityDuration', () {
      final original = SecurityOverrideConfig.forQa(
        reason: 'test',
        relaxTlsPinning: true,
      );
      final updated = original.copyWith(
        validityDuration: const Duration(minutes: 5),
      );
      expect(updated.validityDuration, const Duration(minutes: 5));
      expect(updated.isValid(), isTrue);
    });
  });

  group('SecurityOverrideConfig timeRemaining', () {
    test('returns null when config is expired', () {
      final config = SecurityOverrideConfig(
        relaxTlsPinning: true,
        activatedAt: DateTime.now().subtract(const Duration(hours: 25)),
        validityDuration: const Duration(hours: 24),
        overrideReason: 'test',
      );
      expect(config.isValid(), isFalse);
      expect(config.timeRemaining, isNull);
    });

    test('returns positive duration when valid', () {
      final config = SecurityOverrideConfig(
        relaxDeviceIntegrity: true,
        activatedAt: DateTime.now(),
        validityDuration: const Duration(hours: 1),
        overrideReason: 'test',
      );
      expect(config.isValid(), isTrue);
      expect(config.timeRemaining, isNotNull);
      expect(config.timeRemaining!.inMinutes, greaterThan(0));
    });
  });

  group('SecurityOverrideConfig toJson', () {
    test('includes all fields and computed values', () {
      final config = SecurityOverrideConfig(
        relaxTlsPinning: true,
        relaxDeviceIntegrity: false,
        overrideReason: 'json test',
        activatedAt: DateTime.now(),
        validityDuration: const Duration(hours: 2),
      );
      final json = config.toJson();
      expect(json['relaxTlsPinning'], isTrue);
      expect(json['relaxDeviceIntegrity'], isFalse);
      expect(json['overrideReason'], 'json test');
      expect(json, contains('activatedAt'));
      expect(json, contains('isValid'));
      expect(json, contains('timeRemaining'));
    });
  });

  group('SecurityOverridesProvider', () {
    tearDown(() => SecurityOverridesProvider.clear());

    test('current returns default config', () {
      SecurityOverridesProvider.clear();
      final current = SecurityOverridesProvider.current;
      expect(current.hasAnyOverride, isFalse);
    });

    test('set stores config and hasActiveOverrides reflects it', () {
      final config = SecurityOverrideConfig.forQa(
        reason: 'provider test',
        relaxTlsPinning: true,
      );
      SecurityOverridesProvider.set(config);
      expect(SecurityOverridesProvider.current.relaxTlsPinning, isTrue);
      expect(SecurityOverridesProvider.hasActiveOverrides, isTrue);
    });

    test('set requires reason when overrides are active', () {
      expect(
        () => SecurityOverridesProvider.set(
          const SecurityOverrideConfig(relaxTlsPinning: true),
        ),
        throwsA(isA<ArgumentError>()),
      );
    });

    test('clear resets to no overrides', () {
      SecurityOverridesProvider.set(
        SecurityOverrideConfig.forQa(
          reason: 'clear test',
          relaxDeviceIntegrity: true,
        ),
      );
      SecurityOverridesProvider.clear();
      expect(SecurityOverridesProvider.current.hasAnyOverride, isFalse);
      expect(SecurityOverridesProvider.hasActiveOverrides, isFalse);
    });
  });
}
